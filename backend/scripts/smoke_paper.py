"""End-to-end smoke test for the paper-trading wiring.

Validates the full chain: Alpaca connection → account → place small SPY
limit buy (intentionally out of the money so it won't fill) → poll → cancel
→ settlement state. Safe to run anytime; no market-hours requirement.

Usage:
    cd backend && python scripts/smoke_paper.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Make `app` importable when running from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.alpaca_client import get_alpaca
from app.database import SessionLocal
from app.paper import settlement as settle


PAPER_STARTING_CASH = 11_300.0


def line(label: str, value) -> None:
    print(f"  {label:<22} {value}")


def main() -> int:
    print("\n── Paper trading smoke test ──")

    al = get_alpaca()
    if al is None:
        print("FAIL: Alpaca client not configured (check ALPACA_API_KEY/SECRET).")
        return 1

    print("\n[1/5] Connection")
    conn = al.test_connection()
    if isinstance(conn, dict) and conn.get("error"):
        print(f"FAIL: {conn['error']}")
        return 1
    line("status", conn.get("status", "ok"))
    line("account_number", conn.get("account_number"))

    print("\n[2/5] Account snapshot")
    acct = al.get_account()
    if isinstance(acct, dict) and acct.get("error"):
        print(f"FAIL: {acct['error']}")
        return 1
    line("equity", f"${float(acct.get('equity') or 0):,.2f}")
    line("cash", f"${float(acct.get('cash') or 0):,.2f}")
    line("buying_power", f"${float(acct.get('buying_power') or 0):,.2f}")
    line("trading_blocked", acct.get("trading_blocked"))

    print("\n[3/5] Place out-of-money SPY limit buy (won't fill)")
    # Intentionally lowball — won't fill, will cancel cleanly.
    result = al.place_stock_order(
        symbol="SPY",
        side="buy",
        qty=1,
        order_type="limit",
        limit_price=1.00,
        time_in_force="day",
    )
    if isinstance(result, dict) and result.get("error"):
        print(f"FAIL: {result['error']}")
        return 1
    order_id = result.get("id")
    line("order_id", order_id)
    line("status", result.get("status"))
    line("limit_price", result.get("limit_price"))

    print("\n[4/5] Poll order once, then cancel")
    time.sleep(2)
    polled = al.get_order(order_id)
    line("polled_status", polled.get("status"))
    cancel = al.cancel_order(order_id)
    line("cancel", cancel.get("status", cancel))

    print("\n[5/5] Settlement state")
    with SessionLocal() as db:
        state = settle.settled_state(db, starting_cash=PAPER_STARTING_CASH)
    line("settled_cash", f"${state['settled_cash']:,.2f}")
    line("unsettled_inbound", f"${state['unsettled_cash_inbound']:,.2f}")
    line("total_after_settle", f"${state['total_cash_after_settlement']:,.2f}")

    print("\nPASS — paper-trading chain is wired correctly.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
