"""
Paper trading routes — Alpaca-backed.

Mounted at /api/paper/*. Mirrors the shape of /api/trade/* so the frontend
can swap base URL based on a Paper/Live toggle without changing payloads.

Stocks, ETFs, and options are all handled here. Live trading lives under
/api/trade/* (Webull) and is gated by ENABLE_LIVE_TRADING in config.

Virtual equity cap
------------------
Alpaca paper accounts default to $100k and can't be reset to a custom
amount via API. To make position sizing realistic, we enforce a soft cap
(PAPER_VIRTUAL_EQUITY in .env). The actual Alpaca cash stays at $100k,
but /account reports virtual numbers and order routes pre-flight against
the virtual buying power. Cap is bypassed if PAPER_VIRTUAL_EQUITY=0.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.paper import settlement as settle

logger = logging.getLogger(__name__)
router = APIRouter()


# When the paper account was funded — we use this as starting_cash for
# settlement math. AJ's $11,300 paper account was created 2026-05-05.
PAPER_STARTING_CASH = 11_300.0


# Alpaca's paper accounts always start at $100k. We use that as the
# baseline to compute virtual P&L: virtual_equity = cap + (real_equity - 100000)
ALPACA_PAPER_BASELINE = 100_000.0


def _virtual_state(acct: dict) -> dict:
    """Translate Alpaca's $100k-baselined numbers to the user's virtual cap.

    Returns a dict with virtual equity, cash, buying power, and the diff vs
    the cap (i.e. unrealized + realized P&L since the cap was applied).
    """
    s = get_settings()
    cap = float(s.paper_virtual_equity or 0)
    if cap <= 0:
        # No cap — pass through Alpaca's real numbers
        return {
            "capped": False,
            "virtual_equity": float(acct.get("equity") or 0),
            "virtual_last_equity": float(acct.get("last_equity") or 0),
            "virtual_cash": float(acct.get("cash") or 0),
            "virtual_buying_power": float(acct.get("buying_power") or 0),
            "virtual_options_buying_power": float(acct.get("options_buying_power") or 0),
            "virtual_position_value": float(acct.get("position_market_value") or 0),
            "cap": None,
        }

    real_equity = float(acct.get("equity") or 0)
    real_cash = float(acct.get("cash") or 0)
    real_position_value = float(acct.get("position_market_value") or acct.get("long_market_value") or 0)

    # Virtual equity scales linearly: $100k baseline → cap.
    # P&L since we applied the cap = real_equity - 100k. Virtual = cap + that delta.
    pnl_since_baseline = real_equity - ALPACA_PAPER_BASELINE
    virt_equity = cap + pnl_since_baseline

    # Cash scales the same way — minus the value tied up in positions
    # (which is reflected at "real" Alpaca dollars).
    virt_position_value = real_position_value * (cap / ALPACA_PAPER_BASELINE)
    virt_cash = virt_equity - virt_position_value

    mult = float(s.paper_margin_multiplier or 1.0)
    virt_bp = max(0.0, virt_cash) * mult
    virt_options_bp = max(0.0, virt_cash)  # options BP = cash, no margin

    return {
        "capped": True,
        "virtual_equity": round(virt_equity, 2),
        "virtual_last_equity": round(cap + (float(acct.get("last_equity") or 0) - ALPACA_PAPER_BASELINE), 2),
        "virtual_cash": round(virt_cash, 2),
        "virtual_buying_power": round(virt_bp, 2),
        "virtual_options_buying_power": round(virt_options_bp, 2),
        "virtual_position_value": round(virt_position_value, 2),
        "cap": cap,
        "scale_factor": cap / ALPACA_PAPER_BASELINE,
    }


def _check_virtual_capacity(estimated_cost: float, is_option: bool = False) -> Optional[dict]:
    """Pre-flight check: would this order fit inside the virtual cap?

    Returns None if fine, or an error dict if blocked.
    """
    s = get_settings()
    if not s.paper_virtual_equity or s.paper_virtual_equity <= 0:
        return None  # cap disabled

    al = _client()
    if not al:
        return None  # client init issue handled upstream

    acct = al.get_account()
    if isinstance(acct, dict) and acct.get("error"):
        return None  # don't block on metadata read failure

    state = _virtual_state(acct)
    available = state["virtual_options_buying_power"] if is_option else state["virtual_buying_power"]

    if estimated_cost > available:
        return {
            "error": (
                f"Order estimated cost ${estimated_cost:,.2f} exceeds virtual "
                f"{'options ' if is_option else ''}buying power ${available:,.2f}. "
                f"Virtual equity cap: ${state['cap']:,.2f}. "
                "Reduce qty/limit price or raise PAPER_VIRTUAL_EQUITY in .env."
            ),
            "placed": False,
            "virtual_buying_power": available,
            "estimated_cost": estimated_cost,
            "cap": state["cap"],
        }
    return None


# ─── Schemas ──────────────────────────────────────────────────

class StockOrderRequest(BaseModel):
    symbol: str
    side: str  # buy or sell
    qty: float  # fractional supported
    order_type: str = "limit"  # market, limit, stop, stop_limit, trailing_stop
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: str = "day"
    extended_hours: bool = False


class OptionOrderRequest(BaseModel):
    option_symbol: str  # OCC format, e.g. SPY261218C00450000
    side: str  # buy or sell
    qty: int
    order_type: str = "limit"
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: str = "day"


class OptionLookupRequest(BaseModel):
    underlying: str
    expiration_date: Optional[str] = None
    expiration_date_gte: Optional[str] = None
    expiration_date_lte: Optional[str] = None
    strike_price_gte: Optional[float] = None
    strike_price_lte: Optional[float] = None
    type_: Optional[str] = None  # call or put
    limit: int = 100


def _client():
    try:
        from app.alpaca_client import get_alpaca
        return get_alpaca()
    except Exception as e:
        logger.error(f"Alpaca client init failed: {e}")
        return None


def _err(msg: str, **extra):
    return {"error": msg, **extra}


# ─── Connection / health ──────────────────────────────────────

@router.get("/status")
async def status():
    """Fast health check + key verification."""
    al = _client()
    if not al:
        return _err("Alpaca keys not configured. Add ALPACA_API_KEY and ALPACA_API_SECRET to .env.")
    return al.test_connection()


# ─── Account ──────────────────────────────────────────────────

@router.get("/account")
async def get_account():
    """Account snapshot. When PAPER_VIRTUAL_EQUITY > 0, equity/cash/buying_power
    fields report the virtual (capped) values. Real Alpaca numbers are in
    the `real_*` fields for transparency.
    """
    al = _client()
    if not al:
        return _err("Alpaca not connected")
    acct = al.get_account()
    if isinstance(acct, dict) and acct.get("error"):
        return acct
    cfg = al.get_configurations()
    v = _virtual_state(acct)

    return {
        "account_number": acct.get("account_number"),
        "status": acct.get("status"),
        "currency": acct.get("currency", "USD"),

        # ── Display numbers (virtual when capped, real when uncapped) ──
        "equity": v["virtual_equity"],
        "last_equity": v["virtual_last_equity"],
        "cash": v["virtual_cash"],
        "buying_power": v["virtual_buying_power"],
        "options_buying_power": v["virtual_options_buying_power"],
        "portfolio_value": v["virtual_equity"],
        "position_value": v["virtual_position_value"],

        # ── Cap metadata ──
        "capped": v["capped"],
        "virtual_cap": v["cap"],
        "scale_factor": v.get("scale_factor"),

        # ── Real Alpaca numbers (for transparency / debugging) ──
        "real_equity": float(acct.get("equity") or 0),
        "real_cash": float(acct.get("cash") or 0),
        "real_buying_power": float(acct.get("buying_power") or 0),
        "real_options_buying_power": float(acct.get("options_buying_power") or 0),

        # ── Permissions / flags ──
        "pattern_day_trader": acct.get("pattern_day_trader"),
        "trading_blocked": acct.get("trading_blocked"),
        "account_blocked": acct.get("account_blocked"),
        "shorting_enabled": acct.get("shorting_enabled"),
        "crypto_status": acct.get("crypto_status"),
        "options_trading_level": acct.get("options_trading_level"),
        "options_approved_level": acct.get("options_approved_level"),
        "fractional_trading": cfg.get("fractional_trading") if isinstance(cfg, dict) else None,
        "max_margin_multiplier": cfg.get("max_margin_multiplier") if isinstance(cfg, dict) else None,

        "account_type": "paper",
        "broker": "alpaca",
        "connected": True,
    }


@router.get("/configurations")
async def get_configurations():
    al = _client()
    if not al:
        return _err("Alpaca not connected")
    return al.get_configurations()


# ─── Positions ────────────────────────────────────────────────

@router.get("/positions")
async def get_positions():
    al = _client()
    if not al:
        return {"positions": [], "message": "Alpaca not connected"}
    holdings = al.get_positions()
    out = []
    for h in holdings:
        out.append({
            "symbol": h.get("symbol"),
            "asset_class": h.get("asset_class"),
            "qty": float(h.get("qty") or 0),
            "side": h.get("side"),
            "avg_entry_price": float(h.get("avg_entry_price") or 0),
            "current_price": float(h.get("current_price") or 0),
            "market_value": float(h.get("market_value") or 0),
            "cost_basis": float(h.get("cost_basis") or 0),
            "unrealized_pl": float(h.get("unrealized_pl") or 0),
            "unrealized_plpc": float(h.get("unrealized_plpc") or 0) * 100,
            "change_today": float(h.get("change_today") or 0) * 100,
        })
    return {"positions": out, "count": len(out), "broker": "alpaca"}


# ─── Orders ───────────────────────────────────────────────────

@router.get("/orders")
async def list_orders(
    status: str = "all",
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List orders. status: open, closed, all.

    Side effect: any Alpaca order in `filled` status that hasn't been recorded
    as a SettlementLot yet gets recorded now. This is our cheap sync —
    settlement state stays current as long as the user views their orders.
    """
    al = _client()
    if not al:
        return {"orders": [], "message": "Alpaca not connected"}
    orders = al.get_orders(status=status, limit=limit)

    # Sync filled orders into settlement_lots
    acct = al.get_account()
    account_number = acct.get("account_number") if isinstance(acct, dict) else None
    new_fills = 0
    for o in orders:
        if o.get("status") != "filled":
            continue
        order_id = o.get("id")
        if not order_id:
            continue
        # filled_at can be missing on some, fall back to updated_at
        try:
            executed_at_str = o.get("filled_at") or o.get("updated_at") or o.get("submitted_at")
            executed_at = datetime.fromisoformat(executed_at_str.replace("Z", "+00:00")).replace(tzinfo=None) if executed_at_str else datetime.utcnow()
        except Exception:
            executed_at = datetime.utcnow()
        try:
            fill_price = float(o.get("filled_avg_price") or 0)
            qty = float(o.get("filled_qty") or 0)
            if fill_price <= 0 or qty <= 0:
                continue
            lot = settle.record_fill(
                db,
                order_id=order_id,
                client_order_id=o.get("client_order_id"),
                symbol=o.get("symbol", ""),
                asset_class=o.get("asset_class", "us_equity"),
                side=o.get("side", "buy"),
                qty=qty,
                fill_price=fill_price,
                executed_at=executed_at,
                account_number=account_number,
                raw=o if isinstance(o, dict) else None,
            )
            # If this is a fresh insert (no created_at gap detection here, just count)
            if lot:
                new_fills += 1
        except Exception as e:
            logger.warning(f"Could not record fill for order {order_id}: {e}")

    return {
        "orders": orders,
        "count": len(orders),
        "broker": "alpaca",
        "fills_synced": new_fills,
    }


@router.get("/orders/{order_id}")
async def get_order(order_id: str):
    al = _client()
    if not al:
        return _err("Alpaca not connected")
    return al.get_order(order_id)


@router.post("/order")
async def place_stock_order(
    order: StockOrderRequest,
    db: Session = Depends(get_db),
):
    """Place a stock or ETF order on the paper account.

    Includes settlement pre-flight: warns (does not block) if the buy would
    use unsettled funds. The warning surfaces in the response under
    `settlement_warning` so the UI can show it.
    """
    al = _client()
    if not al:
        return _err("Alpaca not connected", placed=False)

    if order.order_type.lower() in ("limit", "stop_limit") and order.limit_price is None:
        return _err("limit_price required for limit/stop_limit orders", placed=False)
    if order.order_type.lower() in ("stop", "stop_limit") and order.stop_price is None:
        return _err("stop_price required for stop/stop_limit orders", placed=False)

    # Settlement pre-flight on buys
    settlement_warning = None
    if order.side.lower() == "buy":
        # Estimate cost: limit_price for limit orders, otherwise we'd need a quote
        # — best effort with whatever price we have, default 0 means "skip warning"
        ref_price = order.limit_price or 0.0
        if ref_price > 0:
            est_cost = ref_price * order.qty
            check = settle.check_unsettled_funds_usage(
                db, est_cost, starting_cash=PAPER_STARTING_CASH,
            )
            if check["uses_unsettled"]:
                settlement_warning = check["warning"]

    result = al.place_stock_order(
        symbol=order.symbol,
        side=order.side,
        qty=order.qty,
        order_type=order.order_type,
        limit_price=order.limit_price,
        stop_price=order.stop_price,
        time_in_force=order.time_in_force,
        extended_hours=order.extended_hours,
    )
    if isinstance(result, dict) and settlement_warning:
        result["settlement_warning"] = settlement_warning
    return result


@router.post("/order/option")
async def place_option_order(
    order: OptionOrderRequest,
    db: Session = Depends(get_db),
):
    """Place a single-leg option order. Requires options_trading_level >= 1.

    Same settlement pre-flight as stock orders. Options contracts cost
    100x the per-contract price (1 contract = 100 shares of underlying).
    """
    al = _client()
    if not al:
        return _err("Alpaca not connected", placed=False)

    if order.order_type.lower() in ("limit", "stop_limit") and order.limit_price is None:
        return _err("limit_price required for limit/stop_limit orders", placed=False)

    settlement_warning = None
    if order.side.lower() == "buy":
        ref_price = order.limit_price or 0.0
        if ref_price > 0:
            est_cost = ref_price * order.qty * 100  # contract multiplier
            check = settle.check_unsettled_funds_usage(
                db, est_cost, starting_cash=PAPER_STARTING_CASH,
            )
            if check["uses_unsettled"]:
                settlement_warning = check["warning"]

    result = al.place_option_order(
        option_symbol=order.option_symbol,
        side=order.side,
        qty=order.qty,
        order_type=order.order_type,
        limit_price=order.limit_price,
        stop_price=order.stop_price,
        time_in_force=order.time_in_force,
    )
    if isinstance(result, dict) and settlement_warning:
        result["settlement_warning"] = settlement_warning
    return result


@router.delete("/order/{order_id}")
async def cancel_order(order_id: str):
    al = _client()
    if not al:
        return _err("Alpaca not connected", cancelled=False)
    res = al.cancel_order(order_id)
    if isinstance(res, dict) and res.get("error"):
        return res
    return {"cancelled": True, "order_id": order_id}


# ─── Option chain lookup ──────────────────────────────────────

# ─── Settlement (T+1 cash tracking, mirrors live IRA rules) ────

@router.get("/settlement/state")
async def settlement_state(db: Session = Depends(get_db)):
    """Current settled vs unsettled cash + GFV warning."""
    state = settle.settled_state(db, starting_cash=PAPER_STARTING_CASH)
    state["gfv"] = settle.gfv_warning(db) or {"count_12mo": 0, "severity": "clean"}
    return state


@router.get("/settlement/lots")
async def settlement_lots(
    settled: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """All settlement lots, optionally filtered to settled or unsettled."""
    from app.models import SettlementLot
    settle._refresh_settled_flags(db)
    q = db.query(SettlementLot).filter(SettlementLot.is_paper == True)  # noqa: E712
    if settled is True:
        q = q.filter(SettlementLot.is_settled == True)  # noqa: E712
    elif settled is False:
        q = q.filter(SettlementLot.is_settled == False)  # noqa: E712
    lots = q.order_by(SettlementLot.executed_at.desc()).all()
    return {
        "lots": [
            {
                "id": l.id,
                "order_id": l.order_id,
                "symbol": l.symbol,
                "asset_class": l.asset_class,
                "side": l.side,
                "qty": l.qty,
                "fill_price": l.fill_price,
                "proceeds": l.proceeds,
                "executed_at": l.executed_at.isoformat() if l.executed_at else None,
                "settles_at": l.settles_at.isoformat() if l.settles_at else None,
                "is_settled": l.is_settled,
                "funded_by_unsettled": l.funded_by_unsettled,
                "triggers_gfv": l.triggers_gfv,
                "gfv_note": l.gfv_note,
            }
            for l in lots
        ],
        "count": len(lots),
    }


@router.get("/settlement/violations")
async def settlement_violations(db: Session = Depends(get_db)):
    """All recorded GFV-triggering sells in the last 12 months + summary."""
    from app.models import SettlementLot
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=365)
    rows = (
        db.query(SettlementLot)
        .filter(
            SettlementLot.triggers_gfv == True,  # noqa: E712
            SettlementLot.executed_at >= cutoff,
        )
        .order_by(SettlementLot.executed_at.desc())
        .all()
    )
    return {
        "summary": settle.gfv_warning(db) or {"count_12mo": 0, "severity": "clean"},
        "violations": [
            {
                "id": l.id,
                "symbol": l.symbol,
                "qty": l.qty,
                "fill_price": l.fill_price,
                "executed_at": l.executed_at.isoformat() if l.executed_at else None,
                "gfv_note": l.gfv_note,
            }
            for l in rows
        ],
    }


@router.post("/options/contracts")
async def find_contracts(req: OptionLookupRequest):
    """Find option contracts for an underlying. Returns OCC symbols ready
    to drop into /order/option."""
    al = _client()
    if not al:
        return {"contracts": [], "message": "Alpaca not connected"}
    contracts = al.get_option_contracts(
        underlying_symbol=req.underlying,
        expiration_date=req.expiration_date,
        expiration_date_gte=req.expiration_date_gte,
        expiration_date_lte=req.expiration_date_lte,
        strike_price_gte=req.strike_price_gte,
        strike_price_lte=req.strike_price_lte,
        type_=req.type_,
        limit=req.limit,
    )
    return {"contracts": contracts, "count": len(contracts)}
