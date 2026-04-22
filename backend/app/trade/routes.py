"""
Trade routes — account info, positions, order management, watchlist.

Uses the Webull OpenAPI for:
- Account balance: GET /account/balance
- Positions: GET /account/positions
- Place order: POST /trade/order/place
- Cancel order: POST /trade/order/cancel
- Day orders: GET /trade/orders/list-today
- Open orders: GET /trade/orders/list-opened

Watchlist is stored locally in SQLite/PostgreSQL.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Trade, Watchlist
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class OrderRequest(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    quantity: int
    order_type: str = "LIMIT"  # MARKET, LIMIT, STOP_LOSS, STOP_LOSS_LIMIT
    price: Optional[float] = None  # Required for LIMIT
    stop_price: Optional[float] = None  # Required for STOP
    tif: str = "DAY"
    extended_hours: bool = False
    is_paper: bool = True


class WatchlistAdd(BaseModel):
    symbol: str
    notes: Optional[str] = None
    strategy: Optional[str] = None


def _get_client():
    try:
        from app.webull_client import get_webull
        return get_webull()
    except Exception:
        return None


# ─── Account ──────────────────────────────────────────────────

@router.get("/account")
async def get_account():
    """Get account balance, buying power, and P&L."""
    wb = _get_client()
    if not wb:
        return {
            "buying_power": None,
            "total_value": None,
            "day_pnl": None,
            "account_type": "paper",
            "message": "Webull API not connected",
        }

    try:
        balance = wb.get_balance()
        if "error" in balance:
            return {
                "buying_power": None,
                "total_value": None,
                "day_pnl": None,
                "account_type": "paper",
                "message": balance["error"],
            }

        # Extract from nested currency assets if available
        cash_power = None
        cash_balance = None
        currency_assets = balance.get("account_currency_assets", [])
        if currency_assets:
            usd = currency_assets[0]  # First is usually USD
            cash_power = float(usd.get("cash_power", 0))
            cash_balance = float(usd.get("cash_balance", 0))

        return {
            "buying_power": cash_power or float(balance.get("total_cash_balance", 0) or 0),
            "total_value": float(balance.get("total_asset", 0) or 0),
            "market_value": float(balance.get("total_market_value", 0) or 0),
            "cash_balance": cash_balance or float(balance.get("total_cash_balance", 0) or 0),
            "day_pnl": None,  # Not directly in balance endpoint
            "account_type": "paper",
            "account_id": balance.get("account_id"),
            "connected": True,
        }
    except Exception as e:
        logger.error(f"Account fetch failed: {e}")
        return {
            "buying_power": None,
            "total_value": None,
            "day_pnl": None,
            "account_type": "paper",
            "message": f"Error: {str(e)}",
        }


@router.get("/positions")
async def get_positions():
    """Get current open positions."""
    wb = _get_client()
    if not wb:
        return {"positions": [], "message": "Webull API not connected"}

    try:
        holdings = wb.get_positions()
        positions = []
        for h in holdings:
            positions.append({
                "symbol": h.get("symbol", ""),
                "name": h.get("symbol", ""),  # Webull doesn't return name in positions
                "instrument_id": h.get("instrument_id"),
                "qty": int(h.get("qty", 0)),
                "price": float(h.get("last_price", 0) or 0),
                "avg_cost": float(h.get("unit_cost", 0) or 0),
                "market_value": float(h.get("market_value", 0) or 0),
                "total_cost": float(h.get("total_cost", 0) or 0),
                "unrealized_pnl": float(h.get("unrealized_profit_loss", 0) or 0),
                "change_pct": float(h.get("unrealized_profit_loss_rate", 0) or 0) * 100,
                "holding_pct": float(h.get("holding_proportion", 0) or 0) * 100,
            })

        return {"positions": positions, "count": len(positions)}
    except Exception as e:
        logger.error(f"Positions fetch failed: {e}")
        return {"positions": [], "message": f"Error: {str(e)}"}


# ─── Orders ──────────────────────────────────────────────────

@router.post("/order")
async def place_order(order: OrderRequest):
    """Place a trade order.

    Safety: defaults to paper trading. Live trading requires explicit is_paper=False.
    """
    if not order.is_paper:
        return {
            "error": "Live trading is disabled. Set is_paper=True for paper trading.",
            "placed": False,
        }

    wb = _get_client()
    if not wb:
        return {"error": "Webull API not connected", "placed": False}

    # Validate order type requires price
    if order.order_type.upper() == "LIMIT" and order.price is None:
        return {"error": "Limit orders require a price", "placed": False}
    if order.order_type.upper() in ("STOP_LOSS", "STOP_LOSS_LIMIT") and order.stop_price is None:
        return {"error": "Stop orders require a stop_price", "placed": False}

    try:
        result = wb.place_order(
            account_id=None,  # Uses default account
            symbol=order.symbol.upper(),
            side=order.side.upper(),
            qty=order.quantity,
            order_type=order.order_type.upper(),
            limit_price=order.price,
            stop_price=order.stop_price,
            tif=order.tif,
            extended_hours=order.extended_hours,
        )
        return result
    except Exception as e:
        logger.error(f"Order placement failed: {e}")
        return {"error": f"Order failed: {str(e)}", "placed": False}


@router.post("/order/cancel")
async def cancel_order(client_order_id: str):
    """Cancel an open order."""
    wb = _get_client()
    if not wb:
        return {"error": "Webull API not connected", "cancelled": False}

    try:
        result = wb.cancel_order(account_id=None, client_order_id=client_order_id)
        return result
    except Exception as e:
        logger.error(f"Order cancel failed: {e}")
        return {"error": str(e), "cancelled": False}


@router.get("/orders/today")
async def get_today_orders():
    """Get today's order history."""
    wb = _get_client()
    if not wb:
        return {"orders": [], "message": "Webull API not connected"}

    try:
        orders = wb.get_day_orders()
        formatted = []
        for order in orders:
            items = order.get("items", [])
            for item in items:
                formatted.append({
                    "client_order_id": order.get("client_order_id"),
                    "order_id": order.get("order_id"),
                    "symbol": item.get("symbol"),
                    "side": item.get("side"),
                    "qty": item.get("qty"),
                    "filled_qty": item.get("filled_qty"),
                    "order_type": item.get("order_type"),
                    "order_status": item.get("order_status"),
                    "limit_price": item.get("limit_price"),
                    "filled_price": item.get("filled_price"),
                    "place_time": item.get("place_time"),
                })
        return {"orders": formatted, "count": len(formatted)}
    except Exception as e:
        logger.error(f"Order history failed: {e}")
        return {"orders": [], "message": f"Error: {str(e)}"}


@router.get("/orders/open")
async def get_open_orders():
    """Get currently open/pending orders."""
    wb = _get_client()
    if not wb:
        return {"orders": [], "message": "Webull API not connected"}

    try:
        orders = wb.get_open_orders()
        return {"orders": orders, "count": len(orders)}
    except Exception as e:
        logger.error(f"Open orders failed: {e}")
        return {"orders": [], "message": f"Error: {str(e)}"}


@router.get("/history")
async def get_order_history():
    """Get order history (alias for today's orders)."""
    return await get_today_orders()


# ─── Watchlist (local DB) ────────────────────────────────────

@router.get("/watchlist")
async def get_watchlist(db: Session = Depends(get_db)):
    """Get all watchlist items."""
    items = db.query(Watchlist).order_by(Watchlist.added_at.desc()).all()
    return {
        "items": [
            {
                "id": item.id,
                "symbol": item.symbol,
                "notes": item.notes,
                "strategy": item.strategy,
                "added_at": item.added_at.isoformat() if item.added_at else None,
            }
            for item in items
        ]
    }


@router.post("/watchlist")
async def add_to_watchlist(item: WatchlistAdd, db: Session = Depends(get_db)):
    """Add a symbol to the watchlist."""
    # Check for duplicates
    existing = db.query(Watchlist).filter(Watchlist.symbol == item.symbol.upper()).first()
    if existing:
        return {"id": existing.id, "symbol": existing.symbol, "added": False, "message": "Already in watchlist"}

    new_item = Watchlist(
        symbol=item.symbol.upper(),
        notes=item.notes,
        strategy=item.strategy,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return {"id": new_item.id, "symbol": new_item.symbol, "added": True}


@router.delete("/watchlist/{item_id}")
async def remove_from_watchlist(item_id: int, db: Session = Depends(get_db)):
    """Remove a symbol from the watchlist."""
    item = db.query(Watchlist).filter(Watchlist.id == item_id).first()
    if not item:
        return {"error": "Item not found"}
    db.delete(item)
    db.commit()
    return {"removed": True, "symbol": item.symbol}
