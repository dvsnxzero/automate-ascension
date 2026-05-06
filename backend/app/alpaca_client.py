"""
Alpaca Paper Trading Client — pure HTTP via httpx.

Auth model: simple header-based, no signing. Two headers on every request:
    APCA-API-KEY-ID:     <key>
    APCA-API-SECRET-KEY: <secret>

Default base_url points to https://paper-api.alpaca.markets/v2 (paper).
Switching to live trading requires (a) production keys generated under the
Live Trading toggle in the Alpaca dashboard AND (b) flipping
ENABLE_LIVE_TRADING=true in .env. Neither is on by default.

Endpoints used:
  GET  /v2/account                       account info, equity, buying power
  GET  /v2/account/configurations        options_trading_level, etc.
  GET  /v2/positions                     all open positions
  GET  /v2/orders                        order list (filterable)
  POST /v2/orders                        place order (stock/ETF or option)
  DELETE /v2/orders/{order_id}           cancel an order
  GET  /v2/options/contracts             find option contracts by underlying

References:
  https://docs.alpaca.markets/reference/getaccount-1
  https://docs.alpaca.markets/reference/postorder
  https://docs.alpaca.markets/docs/options-trading
"""

import logging
import uuid
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class AlpacaClient:
    """Alpaca paper trading wrapper. Stocks, ETFs, and options."""

    def __init__(self, key: str, secret: str, base_url: str, data_url: str):
        self.key = key
        self.secret = secret
        # Strip any trailing slash to keep URL composition clean
        self.base_url = base_url.rstrip("/")
        self.data_url = data_url.rstrip("/")
        self._http = httpx.Client(
            timeout=15.0,
            headers={
                "APCA-API-KEY-ID": key,
                "APCA-API-SECRET-KEY": secret,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )

    # ─── Internal helpers ─────────────────────────────────────

    def _req(self, method: str, path: str, *, params: Optional[dict] = None,
             json: Optional[dict] = None, host: str = "trade") -> dict:
        """Fire a request against either the trade host or data host."""
        root = self.base_url if host == "trade" else self.data_url
        url = f"{root}{path}"
        try:
            resp = self._http.request(method, url, params=params, json=json)
            if 200 <= resp.status_code < 300:
                if resp.text:
                    try:
                        return resp.json()
                    except Exception:
                        return {"raw": resp.text}
                return {}
            logger.warning(f"Alpaca {method} {path} -> {resp.status_code}: {resp.text[:300]}")
            return {
                "error": f"HTTP {resp.status_code}",
                "detail": resp.text[:500],
                "status": resp.status_code,
            }
        except httpx.TimeoutException:
            logger.error(f"Timeout calling Alpaca {path}")
            return {"error": "Request timed out"}
        except Exception as e:
            logger.error(f"Alpaca {path} failed: {e}")
            return {"error": str(e)}

    def _get(self, path: str, params: Optional[dict] = None, host: str = "trade") -> dict:
        return self._req("GET", path, params=params, host=host)

    def _post(self, path: str, body: Optional[dict] = None) -> dict:
        return self._req("POST", path, json=body)

    def _delete(self, path: str) -> dict:
        return self._req("DELETE", path)

    # ─── Account ──────────────────────────────────────────────

    def get_account(self) -> dict:
        """Account snapshot: equity, cash, buying_power, status, account_number."""
        return self._get("/account")

    def get_configurations(self) -> dict:
        """Trading configuration: options_trading_level, fractional_trading, etc."""
        return self._get("/account/configurations")

    def update_configurations(self, **kwargs) -> dict:
        """Patch account configurations (e.g., max_options_trading_level)."""
        return self._req("PATCH", "/account/configurations", json=kwargs)

    # ─── Positions ────────────────────────────────────────────

    def get_positions(self) -> list[dict]:
        data = self._get("/positions")
        if isinstance(data, list):
            return data
        return []

    def get_position(self, symbol: str) -> dict:
        return self._get(f"/positions/{symbol.upper()}")

    def close_all_positions(self, cancel_orders: bool = True) -> dict:
        return self._req(
            "DELETE",
            "/positions",
            params={"cancel_orders": "true" if cancel_orders else "false"},
        )

    # ─── Orders ───────────────────────────────────────────────

    def get_orders(self, status: str = "all", limit: int = 100,
                   nested: bool = False) -> list[dict]:
        """List orders. status: open, closed, all."""
        data = self._get("/orders", {
            "status": status,
            "limit": str(limit),
            "nested": "true" if nested else "false",
        })
        if isinstance(data, list):
            return data
        return []

    def get_order(self, order_id: str) -> dict:
        return self._get(f"/orders/{order_id}")

    def cancel_order(self, order_id: str) -> dict:
        return self._delete(f"/orders/{order_id}")

    def cancel_all_orders(self) -> dict:
        return self._delete("/orders")

    def place_stock_order(
        self,
        symbol: str,
        side: str,
        qty: float,
        order_type: str = "limit",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        time_in_force: str = "day",
        extended_hours: bool = False,
        client_order_id: Optional[str] = None,
    ) -> dict:
        """Place a stock or ETF order.

        order_type: market, limit, stop, stop_limit, trailing_stop
        time_in_force: day, gtc, opg, cls, ioc, fok
        """
        body = {
            "symbol": symbol.upper(),
            "qty": str(qty),
            "side": side.lower(),
            "type": order_type.lower(),
            "time_in_force": time_in_force.lower(),
            "extended_hours": extended_hours,
            "client_order_id": client_order_id or uuid.uuid4().hex[:32],
        }
        if limit_price is not None:
            body["limit_price"] = str(limit_price)
        if stop_price is not None:
            body["stop_price"] = str(stop_price)
        return self._post("/orders", body)

    def place_option_order(
        self,
        option_symbol: str,
        side: str,
        qty: int,
        order_type: str = "limit",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        time_in_force: str = "day",
        client_order_id: Optional[str] = None,
    ) -> dict:
        """Place a single-leg option order.

        option_symbol is the OCC format, e.g. "SPY261218C00450000".
        Resolve via get_option_contracts() if you don't have it.
        """
        body = {
            "symbol": option_symbol.upper(),
            "qty": str(qty),
            "side": side.lower(),
            "type": order_type.lower(),
            "time_in_force": time_in_force.lower(),
            "client_order_id": client_order_id or uuid.uuid4().hex[:32],
        }
        if limit_price is not None:
            body["limit_price"] = str(limit_price)
        if stop_price is not None:
            body["stop_price"] = str(stop_price)
        return self._post("/orders", body)

    # ─── Option contracts ─────────────────────────────────────

    def get_option_contracts(
        self,
        underlying_symbol: str,
        *,
        expiration_date: Optional[str] = None,
        expiration_date_gte: Optional[str] = None,
        expiration_date_lte: Optional[str] = None,
        strike_price_gte: Optional[float] = None,
        strike_price_lte: Optional[float] = None,
        type_: Optional[str] = None,  # "call" or "put"
        status: str = "active",
        limit: int = 100,
    ) -> list[dict]:
        """Search option contracts for an underlying."""
        params = {
            "underlying_symbols": underlying_symbol.upper(),
            "status": status,
            "limit": str(limit),
        }
        if expiration_date:
            params["expiration_date"] = expiration_date
        if expiration_date_gte:
            params["expiration_date_gte"] = expiration_date_gte
        if expiration_date_lte:
            params["expiration_date_lte"] = expiration_date_lte
        if strike_price_gte is not None:
            params["strike_price_gte"] = str(strike_price_gte)
        if strike_price_lte is not None:
            params["strike_price_lte"] = str(strike_price_lte)
        if type_:
            params["type"] = type_.lower()
        data = self._get("/options/contracts", params)
        if isinstance(data, dict):
            return data.get("option_contracts", [])
        return []

    # ─── Connection test ──────────────────────────────────────

    def test_connection(self) -> dict:
        """Hit /account and /account/configurations to verify keys + permissions.

        Note: options_trading_level + options_approved_level live on /v2/account
        (not /v2/account/configurations). fractional_trading lives on
        /v2/account/configurations.
        """
        acct = self.get_account()
        if isinstance(acct, dict) and acct.get("error"):
            return {"connected": False, "error": acct.get("detail", acct.get("error"))}

        cfg = self.get_configurations()
        return {
            "connected": True,
            "account_number": acct.get("account_number"),
            "status": acct.get("status"),
            "crypto_status": acct.get("crypto_status"),
            "currency": acct.get("currency"),
            "equity": acct.get("equity"),
            "cash": acct.get("cash"),
            "buying_power": acct.get("buying_power"),
            "options_buying_power": acct.get("options_buying_power"),
            "pattern_day_trader": acct.get("pattern_day_trader"),
            "trading_blocked": acct.get("trading_blocked"),
            "shorting_enabled": acct.get("shorting_enabled"),
            "options_trading_level": acct.get("options_trading_level"),
            "options_approved_level": acct.get("options_approved_level"),
            "fractional_trading": cfg.get("fractional_trading") if isinstance(cfg, dict) else None,
            "max_margin_multiplier": cfg.get("max_margin_multiplier") if isinstance(cfg, dict) else None,
        }


# ─── Singleton factory ────────────────────────────────────────

_client_instance: Optional[AlpacaClient] = None


def get_alpaca() -> AlpacaClient:
    """Get or create the singleton AlpacaClient (paper by default)."""
    global _client_instance
    if _client_instance is None:
        s = get_settings()
        if not s.alpaca_api_key or not s.alpaca_api_secret \
                or s.alpaca_api_key.startswith("PASTE_"):
            raise RuntimeError(
                "ALPACA_API_KEY and ALPACA_API_SECRET must be set in .env. "
                "Get them at https://app.alpaca.markets after switching the "
                "dashboard to Paper Trading mode."
            )
        _client_instance = AlpacaClient(
            s.alpaca_api_key, s.alpaca_api_secret,
            s.alpaca_base_url, s.alpaca_data_url,
        )
    return _client_instance


def reset_alpaca():
    global _client_instance
    _client_instance = None
