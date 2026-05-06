"""
End-to-end paper trading smoke test.

Sequence:
  1. Snapshot account state (cash, equity, positions, open orders)
  2. Place a paper market BUY for 1 share SPY (stock leg)
  3. Look up a SPY call option contract ~30 days out near ATM
  4. Place a paper limit BUY for 1 contract of that call
  5. Wait briefly, then list today's orders + current positions
  6. Cancel the option order if it's still open (not yet filled)
  7. Final account snapshot

Run from backend/:
    python scripts/smoke_test_paper.py
"""

import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.alpaca_client import get_alpaca  # noqa: E402


def hr(label: str = ""):
    print(f"\n{'─' * 60}")
    if label:
        print(f"  {label}")
        print('─' * 60)


def fmt_money(v):
    try:
        return f"${float(v):,.2f}"
    except (TypeError, ValueError):
        return str(v)


def main():
    al = get_alpaca()

    hr("STEP 1 — Initial snapshot")
    acct = al.get_account()
    print(f"  account_number      : {acct.get('account_number')}")
    print(f"  cash                : {fmt_money(acct.get('cash'))}")
    print(f"  equity              : {fmt_money(acct.get('equity'))}")
    print(f"  buying_power        : {fmt_money(acct.get('buying_power'))}")
    print(f"  options_buying_power: {fmt_money(acct.get('options_buying_power'))}")

    positions_before = al.get_positions()
    open_orders_before = al.get_orders(status="open")
    print(f"  positions           : {len(positions_before)}")
    print(f"  open orders         : {len(open_orders_before)}")

    hr("STEP 2 — Place paper market BUY 1 SPY")
    stock_order = al.place_stock_order(
        symbol="SPY",
        side="buy",
        qty=1,
        order_type="market",
        time_in_force="day",
    )
    if isinstance(stock_order, dict) and stock_order.get("error"):
        print(f"  [X] FAILED: {stock_order}")
        sys.exit(1)
    stock_order_id = stock_order.get("id")
    print(f"  order_id            : {stock_order_id}")
    print(f"  symbol              : {stock_order.get('symbol')}")
    print(f"  qty                 : {stock_order.get('qty')}")
    print(f"  side                : {stock_order.get('side')}")
    print(f"  type                : {stock_order.get('type')}")
    print(f"  status              : {stock_order.get('status')}")
    print(f"  client_order_id     : {stock_order.get('client_order_id')}")

    hr("STEP 3 — Find a SPY call ~30 days out, near ATM")
    today = date.today()
    in_30 = (today + timedelta(days=21)).isoformat()
    in_60 = (today + timedelta(days=60)).isoformat()

    contracts = al.get_option_contracts(
        underlying_symbol="SPY",
        expiration_date_gte=in_30,
        expiration_date_lte=in_60,
        type_="call",
        limit=200,
    )
    print(f"  candidates returned : {len(contracts)}")

    if not contracts:
        print("  [X] No contracts returned — skipping option leg")
        option_order = None
    else:
        # Pick a contract with strike near current SPY price.
        # Use the SPY position we just placed as a reasonable price proxy if filled,
        # else fall back to the median strike returned.
        spy_price = None
        try:
            time.sleep(2)
            pos = al.get_position("SPY")
            if isinstance(pos, dict) and pos.get("current_price"):
                spy_price = float(pos["current_price"])
        except Exception:
            pass

        if spy_price is None:
            # Median strike as a stand-in
            strikes = sorted(float(c["strike_price"]) for c in contracts if c.get("strike_price"))
            spy_price = strikes[len(strikes) // 2] if strikes else 500

        # Find the contract with strike closest to spy_price + 1% (slightly OTM call)
        target = spy_price * 1.01
        contract = min(
            contracts,
            key=lambda c: abs(float(c.get("strike_price", 0)) - target),
        )
        print(f"  using SPY price     : {fmt_money(spy_price)}")
        print(f"  target strike       : {fmt_money(target)}  (1% OTM)")
        print(f"  picked contract     : {contract.get('symbol')}")
        print(f"    strike            : {fmt_money(contract.get('strike_price'))}")
        print(f"    expiration        : {contract.get('expiration_date')}")
        print(f"    type              : {contract.get('type')}")
        print(f"    style             : {contract.get('style')}")

        hr("STEP 4 — Place paper LIMIT BUY 1 contract of that call")
        # Use a generous limit (close_price * 1.5) so a paper fill is likely if liquid.
        # If close_price is missing, just use $5 as a safe ceiling.
        ref_price = contract.get("close_price")
        try:
            limit = round(float(ref_price) * 1.5, 2) if ref_price else 5.00
        except (TypeError, ValueError):
            limit = 5.00
        print(f"  reference close     : {ref_price}")
        print(f"  limit price         : {fmt_money(limit)}")

        option_order = al.place_option_order(
            option_symbol=contract["symbol"],
            side="buy",
            qty=1,
            order_type="limit",
            limit_price=limit,
            time_in_force="day",
        )
        if isinstance(option_order, dict) and option_order.get("error"):
            print(f"  [X] OPTION ORDER FAILED: {option_order}")
        else:
            print(f"  order_id            : {option_order.get('id')}")
            print(f"  symbol              : {option_order.get('symbol')}")
            print(f"  status              : {option_order.get('status')}")

    hr("STEP 5 — Wait 3s and pull orders + positions")
    time.sleep(3)

    todays_orders = al.get_orders(status="all", limit=20)
    print(f"  total orders today  : {len(todays_orders)}")
    for o in todays_orders[:5]:
        sym = o.get('symbol', '?')
        side = o.get('side', '?')
        qty = o.get('qty', '?')
        status = o.get('status', '?')
        filled_avg = o.get('filled_avg_price')
        otype = o.get('type', '?')
        cls = o.get('asset_class', '?')
        line = f"    {side:4} {qty:>4} {sym:25} {otype:6} {status:18} {cls}"
        if filled_avg:
            line += f"  filled@{fmt_money(filled_avg)}"
        print(line)

    positions = al.get_positions()
    print(f"\n  current positions   : {len(positions)}")
    for p in positions:
        print(f"    {p.get('symbol'):25} qty={p.get('qty')}  "
              f"avg={fmt_money(p.get('avg_entry_price'))}  "
              f"mkt={fmt_money(p.get('market_value'))}  "
              f"upl={fmt_money(p.get('unrealized_pl'))}")

    hr("STEP 6 — Cancel option order if still open")
    if option_order and option_order.get("id"):
        opt_id = option_order["id"]
        latest = al.get_order(opt_id)
        opt_status = latest.get("status") if isinstance(latest, dict) else None
        print(f"  option order status : {opt_status}")
        if opt_status in ("new", "accepted", "pending_new", "partially_filled", "held"):
            cancel_result = al.cancel_order(opt_id)
            print(f"  cancel result       : {cancel_result}")
        else:
            print("  (already terminal — nothing to cancel)")
    else:
        print("  (no option order placed)")

    hr("STEP 7 — Final snapshot")
    acct2 = al.get_account()
    print(f"  cash                : {fmt_money(acct2.get('cash'))}")
    print(f"  equity              : {fmt_money(acct2.get('equity'))}")
    print(f"  positions           : {len(al.get_positions())}")
    print(f"  open orders         : {len(al.get_orders(status='open'))}")

    hr("[OK] Smoke test complete")


if __name__ == "__main__":
    main()
