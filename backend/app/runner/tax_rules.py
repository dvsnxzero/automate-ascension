"""Tax-aware + PDT order guardrails for the live paper runner.

The runner consults these before placing orders so it doesn't take trades
whose after-tax edge is too thin, doesn't trigger §1091 wash sales, and
respects PDT day-trade caps when enforcement is on.

All functions are pure — they take the data they need and return a
verdict dict. The engine handles logging the verdict and skipping/placing
the order accordingly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from app.config import get_settings


@dataclass(frozen=True)
class TaxConfig:
    short_term_rate: float
    long_term_rate: float
    state_rate: float
    min_after_tax_edge_pct: float
    wash_sale_window_days: int
    pdt_enforcement: bool
    pdt_equity_floor: float

    @classmethod
    def from_settings(cls) -> "TaxConfig":
        s = get_settings()
        return cls(
            short_term_rate=s.short_term_tax_rate,
            long_term_rate=s.long_term_tax_rate,
            state_rate=s.state_tax_rate,
            min_after_tax_edge_pct=s.min_after_tax_edge_pct,
            wash_sale_window_days=s.wash_sale_window_days,
            pdt_enforcement=s.pdt_enforcement,
            pdt_equity_floor=s.pdt_equity_floor,
        )


def _effective_rate(held_days: int, cfg: TaxConfig) -> float:
    """Federal short/long-term + flat state bolted on."""
    base = cfg.long_term_rate if held_days > 365 else cfg.short_term_rate
    return base + cfg.state_rate


# ── Sell-side: would the after-tax P&L make the trade worthwhile? ──

def evaluate_sell(
    entry_price: float,
    exit_price: float,
    shares: float,
    held_days: int,
    cfg: Optional[TaxConfig] = None,
) -> dict:
    """Decide whether to allow a sell given the after-tax edge.

    Losses pass through (allowed) — the runner may want to harvest. Gains
    must clear `min_after_tax_edge_pct` net of tax to count as worthwhile.
    A stop-loss-tier sell (signal driven exit) still goes through even on
    a tiny gain when the alternative is letting it round-trip to a loss —
    that's the engine's call; this function reports the math.
    """
    cfg = cfg or TaxConfig.from_settings()
    if entry_price <= 0 or shares <= 0:
        return {"allow": True, "reason": "no cost basis"}

    gross_pnl = (exit_price - entry_price) * shares
    gross_pnl_pct = (exit_price - entry_price) / entry_price * 100.0
    rate = _effective_rate(held_days, cfg)
    is_gain = gross_pnl > 0
    tax = gross_pnl * rate if is_gain else 0.0
    net_pnl = gross_pnl - tax
    cost_basis = entry_price * shares
    net_pnl_pct = (net_pnl / cost_basis) * 100.0

    if not is_gain:
        # Allow loss exits — they may be intentional (stop, signal, harvest)
        return {
            "allow": True,
            "is_gain": False,
            "gross_pnl_pct": gross_pnl_pct,
            "net_pnl_pct": net_pnl_pct,
            "tax_rate": rate,
            "reason": "loss exit allowed",
        }

    allow = net_pnl_pct >= cfg.min_after_tax_edge_pct
    return {
        "allow": allow,
        "is_gain": True,
        "held_days": held_days,
        "term": "long" if held_days > 365 else "short",
        "gross_pnl_pct": round(gross_pnl_pct, 3),
        "net_pnl_pct": round(net_pnl_pct, 3),
        "tax_rate": round(rate, 4),
        "tax": round(tax, 2),
        "reason": (
            f"after-tax edge {net_pnl_pct:.2f}% < {cfg.min_after_tax_edge_pct:.2f}% min"
            if not allow else
            f"after-tax edge {net_pnl_pct:.2f}% clears {cfg.min_after_tax_edge_pct:.2f}% min"
        ),
    }


# ── Buy-side: would this trigger a wash sale on a recent loss? ──

def evaluate_buy_wash_sale(
    symbol: str,
    recent_closed_orders: Iterable[dict],
    cfg: Optional[TaxConfig] = None,
    now: Optional[datetime] = None,
) -> dict:
    """Block buy if this symbol was sold at a loss within the wash-sale window.

    `recent_closed_orders`: each item should have `symbol`, `side`,
    `filled_at` (ISO str or datetime), and `realized_pnl` (negative = loss).
    The runner derives this from Alpaca's order history.
    """
    cfg = cfg or TaxConfig.from_settings()
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=cfg.wash_sale_window_days)

    for o in recent_closed_orders:
        if o.get("symbol") != symbol:
            continue
        if (o.get("side") or "").lower() != "sell":
            continue
        pnl = o.get("realized_pnl")
        if pnl is None or pnl >= 0:
            continue
        filled = o.get("filled_at")
        if isinstance(filled, str):
            try:
                filled = datetime.fromisoformat(filled.replace("Z", "+00:00"))
            except ValueError:
                continue
        if not filled:
            continue
        if filled.tzinfo is None:
            filled = filled.replace(tzinfo=timezone.utc)
        if filled >= cutoff:
            return {
                "allow": False,
                "reason": f"wash sale guard: {symbol} sold at loss on {filled.date()}",
            }
    return {"allow": True, "reason": "no wash sale conflict"}


# ── PDT: would this trade put us over the day-trade limit? ──

def count_day_trades(closed_orders: Iterable[dict], lookback_days: int = 5) -> int:
    """Count round-trip same-day trades in the last `lookback_days` business days.

    A day trade = a buy and sell of the same symbol on the same calendar
    day. This is the FINRA definition the broker tracks. We approximate
    with calendar days; the broker's count is authoritative.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days * 2)
    # symbol -> set of dates with buys, set of dates with sells
    by_symbol_buys: dict[str, set] = {}
    by_symbol_sells: dict[str, set] = {}
    for o in closed_orders:
        filled = o.get("filled_at")
        if isinstance(filled, str):
            try:
                filled = datetime.fromisoformat(filled.replace("Z", "+00:00"))
            except ValueError:
                continue
        if not filled or filled < cutoff:
            continue
        d = filled.date()
        sym = o.get("symbol")
        side = (o.get("side") or "").lower()
        if not sym or not side:
            continue
        if side == "buy":
            by_symbol_buys.setdefault(sym, set()).add(d)
        elif side == "sell":
            by_symbol_sells.setdefault(sym, set()).add(d)

    count = 0
    for sym, buy_dates in by_symbol_buys.items():
        sell_dates = by_symbol_sells.get(sym, set())
        count += len(buy_dates & sell_dates)
    return count


def evaluate_pdt(
    account_equity: float,
    closed_orders: Iterable[dict],
    is_opening_trade: bool,
    cfg: Optional[TaxConfig] = None,
) -> dict:
    """Allow / block based on PDT rules.

    Only restrictive when equity < floor AND day_trades ≥ 3 (one more
    would tip into PDT designation). If enforcement is off, always allow
    — leaves the decision to broker-side enforcement.
    """
    cfg = cfg or TaxConfig.from_settings()
    if not cfg.pdt_enforcement:
        return {"allow": True, "reason": "pdt enforcement disabled"}
    if account_equity >= cfg.pdt_equity_floor:
        return {"allow": True, "reason": "above PDT equity floor"}
    dt_count = count_day_trades(closed_orders, lookback_days=5)
    # 3 day trades is the warning line; 4 triggers PDT in 5 days
    if dt_count >= 3 and is_opening_trade:
        return {
            "allow": False,
            "day_trades_5d": dt_count,
            "reason": f"pdt guard: {dt_count} day trades in last 5d (limit 3 below ${cfg.pdt_equity_floor:,.0f})",
        }
    return {
        "allow": True,
        "day_trades_5d": dt_count,
        "reason": f"pdt ok: {dt_count}/3 day trades used",
    }
