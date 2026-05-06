"""
Quick Alpaca paper-trading verification.

Run from the backend directory:
    cd backend
    conda activate ziptrader
    python scripts/verify_alpaca.py

Hits /v2/account and /v2/account/configurations, prints the account number,
equity, buying power, and current options trading level. No orders placed.
"""

import sys
from pathlib import Path

# Make `app` importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.alpaca_client import get_alpaca  # noqa: E402


def main():
    try:
        al = get_alpaca()
    except RuntimeError as e:
        print(f"\n[X] {e}\n")
        sys.exit(1)

    print("\n[*] Calling Alpaca paper API...\n")
    info = al.test_connection()

    if not info.get("connected"):
        print(f"[X] Connection failed: {info.get('error')}")
        sys.exit(1)

    print(f"  account_number              : {info['account_number']}")
    print(f"  status                      : {info['status']}")
    print(f"  crypto_status               : {info['crypto_status']}")
    print(f"  currency                    : {info['currency']}")
    print(f"  equity                      : ${float(info['equity'] or 0):,.2f}")
    print(f"  cash                        : ${float(info['cash'] or 0):,.2f}")
    print(f"  buying_power                : ${float(info['buying_power'] or 0):,.2f}")
    print(f"  options_buying_power        : ${float(info['options_buying_power'] or 0):,.2f}")
    print(f"  max_margin_multiplier       : {info['max_margin_multiplier']}x")
    print(f"  pattern_day_trader          : {info['pattern_day_trader']}")
    print(f"  trading_blocked             : {info['trading_blocked']}")
    print(f"  shorting_enabled            : {info['shorting_enabled']}")
    print(f"  fractional_trading          : {info['fractional_trading']}")
    print(f"  options_trading_level       : {info['options_trading_level']}")
    print(f"  options_approved_level      : {info['options_approved_level']}")

    lvl = info["options_trading_level"]
    print()
    if lvl is None:
        print("  [!] options_trading_level not returned — endpoint may have changed.")
    elif int(lvl) == 0:
        print("  [!] Options disabled. PATCH /v2/account/configurations with")
        print("      {\"max_options_trading_level\": \"3\"}")
    elif int(lvl) < 3:
        print(f"  [!] Options at level {lvl}. Bump to 3 for spreads + short options.")
    else:
        print("  [OK] Options at level 3 — long calls/puts, spreads, short options unlocked.")

    print("\n[OK] Paper trading is wired up. Endpoints live at /api/paper/*\n")


if __name__ == "__main__":
    main()
