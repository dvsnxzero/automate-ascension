"""
Settlement tracker — T+1 cash settlement modeling for paper trading.

Mirrors Webull Roth IRA cash account rules:
- Sale proceeds settle T+1 (next trading day, skip weekends + market holidays)
- Buying with unsettled proceeds is allowed but flags the new lot
- Selling that flagged lot before the original sale settles = Good Faith Violation
- 3 GFVs in 12 months → 90-day cash-only restriction (FINRA rule)

Alpaca paper does NOT enforce these rules. We track them ourselves so paper
behavior matches what the user would experience in their live IRA.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import SettlementLot

logger = logging.getLogger(__name__)


def _starting_cash() -> float:
    """Single source of truth for the paper account's initial deposit."""
    return float(get_settings().paper_starting_cash or 0)


# US stock market holidays for 2026 (NYSE/NASDAQ).
# Refresh annually — could be replaced with `pandas_market_calendars` lookup.
US_MARKET_HOLIDAYS_2026 = {
    date(2026, 1, 1),    # New Year's Day
    date(2026, 1, 19),   # MLK Day
    date(2026, 2, 16),   # Presidents Day
    date(2026, 4, 3),    # Good Friday
    date(2026, 5, 25),   # Memorial Day
    date(2026, 6, 19),   # Juneteenth
    date(2026, 7, 3),    # Independence Day (observed)
    date(2026, 9, 7),    # Labor Day
    date(2026, 11, 26),  # Thanksgiving
    date(2026, 12, 25),  # Christmas
}


def is_trading_day(d: date) -> bool:
    """Weekday + not a US market holiday."""
    return d.weekday() < 5 and d not in US_MARKET_HOLIDAYS_2026


def next_trading_day(d: date) -> date:
    """Return the first trading day strictly after `d`."""
    nxt = d + timedelta(days=1)
    while not is_trading_day(nxt):
        nxt += timedelta(days=1)
    return nxt


def settles_at_for(executed: datetime) -> datetime:
    """T+1 settlement timestamp. Use 8pm ET (00:00 UTC next day) as 'end of
    settlement day' to keep things simple."""
    settle_date = next_trading_day(executed.date())
    return datetime.combine(settle_date, datetime.min.time())


# ─── Recording fills ──────────────────────────────────────────

def record_fill(
    db: Session,
    *,
    order_id: str,
    client_order_id: Optional[str],
    symbol: str,
    asset_class: str,
    side: str,
    qty: float,
    fill_price: float,
    executed_at: Optional[datetime] = None,
    account_number: Optional[str] = None,
    raw: Optional[dict] = None,
) -> SettlementLot:
    """Insert a SettlementLot for a fresh fill. Idempotent on order_id+symbol."""
    if executed_at is None:
        executed_at = datetime.utcnow()
    settles_at = settles_at_for(executed_at)

    # Idempotency: don't double-record the same fill
    existing = (
        db.query(SettlementLot)
        .filter_by(order_id=order_id, symbol=symbol, side=side)
        .first()
    )
    if existing:
        return existing

    side_lower = side.lower()
    if side_lower == "sell":
        proceeds = qty * fill_price
    else:
        proceeds = -(qty * fill_price)

    # Did this buy use unsettled funds?
    funded_by_unsettled = False
    if side_lower == "buy":
        # Use the configured starting_cash so the comparison is against the
        # full settled-cash baseline, not just realized proceeds.
        snapshot = settled_state(
            db,
            account_number=account_number,
            starting_cash=_starting_cash(),
            now=executed_at,  # don't auto-settle lots that haven't reached settles_at
        )
        if abs(proceeds) > snapshot["settled_cash_available"]:
            funded_by_unsettled = True

    lot = SettlementLot(
        order_id=order_id,
        client_order_id=client_order_id,
        symbol=symbol,
        asset_class=asset_class,
        side=side_lower,
        qty=qty,
        fill_price=fill_price,
        proceeds=proceeds,
        executed_at=executed_at,
        settles_at=settles_at,
        is_settled=False,
        funded_by_unsettled=funded_by_unsettled,
        is_paper=True,
        broker="alpaca",
        account_number=account_number,
        raw_json=raw,
    )

    # Detect Good Faith Violation: this is a SELL of a position that was
    # opened with unsettled funds, before that source-sale has settled.
    if side_lower == "sell":
        # Find a buy of this symbol that was funded by unsettled cash AND
        # whose settlement date hasn't passed by the time of THIS sell.
        # We check timestamps directly rather than is_settled flag because
        # the flag refresh is async with order placement.
        recent_unsettled_buy = (
            db.query(SettlementLot)
            .filter(
                SettlementLot.symbol == symbol,
                SettlementLot.side == "buy",
                SettlementLot.funded_by_unsettled == True,  # noqa: E712
                SettlementLot.settles_at > executed_at,  # buy hadn't settled yet at sell time
            )
            .order_by(SettlementLot.executed_at.desc())
            .first()
        )
        if recent_unsettled_buy:
            lot.triggers_gfv = True
            lot.gfv_note = (
                f"Sold {symbol} (qty {qty} @ {fill_price}) before the buy on "
                f"{recent_unsettled_buy.executed_at:%Y-%m-%d} (funded by "
                f"unsettled cash) had time to settle on "
                f"{recent_unsettled_buy.settles_at:%Y-%m-%d}."
            )

    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot


# ─── Computing state ──────────────────────────────────────────

def _refresh_settled_flags(db: Session, now: Optional[datetime] = None):
    """Mark lots that have crossed their settles_at threshold as settled."""
    now = now or datetime.utcnow()
    unsettled = (
        db.query(SettlementLot)
        .filter(
            SettlementLot.is_settled == False,  # noqa: E712
            SettlementLot.settles_at <= now,
        )
        .all()
    )
    if unsettled:
        for lot in unsettled:
            lot.is_settled = True
        db.commit()


def settled_state(
    db: Session,
    *,
    account_number: Optional[str] = None,
    starting_cash: Optional[float] = None,
    now: Optional[datetime] = None,
) -> dict:
    """Compute current settled vs unsettled cash from lot history.

    `starting_cash` defaults to PAPER_STARTING_CASH from config. Pass
    explicitly only when overriding for tests or hypotheticals.
    `now` defaults to current UTC; pass an earlier time when computing
    "as of" historical state so future-dated lots don't auto-settle.
    """
    if starting_cash is None:
        starting_cash = _starting_cash()
    _refresh_settled_flags(db, now=now)

    q = db.query(SettlementLot).filter(SettlementLot.is_paper == True)  # noqa: E712
    if account_number:
        q = q.filter(SettlementLot.account_number == account_number)

    settled_proceeds = 0.0
    unsettled_proceeds = 0.0
    next_settlements: dict[str, float] = {}  # date string → cash arriving

    for lot in q.all():
        if lot.is_settled:
            settled_proceeds += lot.proceeds
        else:
            unsettled_proceeds += lot.proceeds
            if lot.proceeds > 0:  # only sell-side cash inflows are "arriving"
                key = lot.settles_at.date().isoformat()
                next_settlements[key] = next_settlements.get(key, 0) + lot.proceeds

    settled_cash = starting_cash + settled_proceeds
    return {
        "starting_cash": round(starting_cash, 2),
        "settled_cash": round(settled_cash, 2),
        "settled_cash_available": round(max(0.0, settled_cash), 2),
        "unsettled_cash_inbound": round(
            sum(v for v in next_settlements.values()), 2
        ),
        "unsettled_proceeds_total": round(unsettled_proceeds, 2),
        "total_cash_after_settlement": round(settled_cash + sum(next_settlements.values()), 2),
        "next_settlements": [
            {"date": d, "amount": round(amt, 2)}
            for d, amt in sorted(next_settlements.items())
        ],
        "as_of": datetime.utcnow().isoformat(),
    }


def gfv_count_last_12mo(db: Session) -> int:
    """How many GFV-triggering sells have occurred in the last 12 months."""
    cutoff = datetime.utcnow() - timedelta(days=365)
    return (
        db.query(SettlementLot)
        .filter(
            SettlementLot.triggers_gfv == True,  # noqa: E712
            SettlementLot.executed_at >= cutoff,
        )
        .count()
    )


def gfv_warning(db: Session) -> Optional[dict]:
    """Return a warning if approaching the 3-strike GFV threshold."""
    count = gfv_count_last_12mo(db)
    if count == 0:
        return None
    severity = "warning" if count < 3 else "restriction"
    return {
        "count_12mo": count,
        "severity": severity,
        "remaining_strikes_until_lockout": max(0, 3 - count),
        "message": (
            f"{count} Good Faith Violation(s) recorded in the last 12 months. "
            + (
                "3 strikes triggers a 90-day cash-only restriction in your live IRA."
                if count < 3
                else "You'd be in a 90-day cash-only restriction in your live IRA."
            )
        ),
    }


# ─── Pre-flight check on placing a buy ────────────────────────

def check_unsettled_funds_usage(
    db: Session,
    estimated_cost: float,
    *,
    starting_cash: float = 0.0,
    account_number: Optional[str] = None,
) -> dict:
    """Pre-flight check before placing a buy.

    Returns:
      {
        ok: bool,                          # always true (we warn, not block)
        uses_unsettled: bool,              # would this buy tap unsettled cash?
        settled_cash_available: float,
        shortfall_from_settled: float,     # how much beyond settled cash
        warning: str | None,
      }
    """
    state = settled_state(db, starting_cash=starting_cash, account_number=account_number)
    settled = state["settled_cash_available"]
    uses_unsettled = estimated_cost > settled
    shortfall = max(0.0, estimated_cost - settled)
    warning = None
    if uses_unsettled:
        warning = (
            f"This buy (${estimated_cost:,.2f}) exceeds settled cash "
            f"(${settled:,.2f}) by ${shortfall:,.2f}. The position will be "
            "flagged as 'funded by unsettled cash' — selling it before the "
            "source sales settle would trigger a Good Faith Violation in "
            "your live IRA."
        )
    return {
        "ok": True,
        "uses_unsettled": uses_unsettled,
        "settled_cash_available": settled,
        "shortfall_from_settled": round(shortfall, 2),
        "warning": warning,
    }
