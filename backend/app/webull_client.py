"""
Webull OpenAPI Client — Pure HTTP (no SDK dependency)

Replaces the SDK-based client with direct httpx calls.
This avoids the grpcio==1.51.1 build failure while providing
identical functionality.

Signature algorithm reverse-engineered from:
  webullsdkcore/auth/composer/default_signature_composer.py

Endpoints from:
  webullsdktrade/request/*.py
  webullsdkmdata/request/*.py

Usage:
    from app.webull_client import get_webull
    wb = get_webull()
    account_id = wb.get_account_id()
    balance = wb.get_balance(account_id)
"""

import base64
import hashlib
import hmac
import json
import logging
import socket
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote, urlencode

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ─── Webull API hosts ────────────────────────────────────────
# All HTTP endpoints go through api.webull.com
# (usquotes-api.webullfintech.com is gRPC-only)
API_HOST = "api.webull.com"


# ─── Signature helpers (mirrors SDK's default_signature_composer) ─
def _iso8601_utc() -> str:
    """UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _uuid5_nonce() -> str:
    """UUID5 nonce matching SDK behaviour."""
    name = socket.gethostname() + str(uuid.uuid1())
    return str(uuid.uuid5(uuid.NAMESPACE_URL, name))


def _md5_hex(content: str) -> str:
    """MD5 hex digest (uppercase) of a string."""
    return hashlib.md5(content.encode("utf-8")).hexdigest().upper()


def _json_compact(obj) -> str:
    """Compact JSON with no spaces (matches SDK)."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _build_sign_string(sign_params: dict, uri: str, body_string: Optional[str]) -> str:
    """
    Build the string-to-sign:
        uri & sorted(key=value joined by &) [& body_md5]
    Then URL-encode the whole thing (safe='').
    """
    sorted_pairs = sorted(sign_params.items(), key=lambda x: x[0])
    params_str = "&".join(f"{k}={v}" for k, v in sorted_pairs)

    string_to_sign = uri
    if params_str:
        string_to_sign = f"{string_to_sign}&{params_str}"
    if body_string:
        string_to_sign = f"{string_to_sign}&{body_string}"

    return quote(string_to_sign, safe="")


def _hmac_sha1(key: str, message: str) -> str:
    """HMAC-SHA1 → base64."""
    sig = hmac.new(
        key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha1,
    )
    return base64.b64encode(sig.digest()).decode("utf-8").strip()


def _sign_request(
    app_key: str,
    app_secret: str,
    host: str,
    uri: str,
    query_params: Optional[dict] = None,
    body_params: Optional[dict] = None,
) -> dict:
    """
    Compute the Webull API signature and return the full set of
    headers needed for an authenticated request.
    """
    timestamp = _iso8601_utc()
    nonce = _uuid5_nonce()

    # Sign headers (these go into the signature AND the HTTP headers)
    sign_headers = {
        "x-app-key": app_key,
        "x-timestamp": timestamp,
        "x-signature-version": "1.0",
        "x-signature-algorithm": "HMAC-SHA1",
        "x-signature-nonce": nonce,
    }

    # Build the sign_params dict (lowercase keys)
    sign_params = {k.lower(): v for k, v in sign_headers.items()}
    # Add the host for signing (not sent as an HTTP header)
    sign_params["host"] = host

    # Merge query params into sign_params
    if query_params:
        for k, v in query_params.items():
            existing = sign_params.get(k)
            if existing is not None:
                sign_params[k] = f"{existing}&{v}"
            else:
                sign_params[k] = str(v)

    # Body → MD5 hex digest
    body_string = None
    if body_params is not None:
        raw = _json_compact(body_params)
        body_string = _md5_hex(raw)

    # Build the string-to-sign and compute HMAC-SHA1
    string_to_sign = _build_sign_string(sign_params, uri, body_string)
    signature = _hmac_sha1(app_secret + "&", string_to_sign)

    # Final headers
    headers = dict(sign_headers)
    headers["x-signature"] = signature
    headers["Content-Type"] = "application/json"
    headers["Accept"] = "application/json"

    return headers


class WebullClient:
    """Full Webull OpenAPI wrapper — pure HTTP, no SDK dependency."""

    def __init__(self, app_key: str, app_secret: str):
        self.app_key = app_key
        self.app_secret = app_secret
        self._account_id: Optional[str] = None
        self._http = httpx.Client(timeout=15.0)

    # ─── Internal helpers ─────────────────────────────────────

    def _request(
        self,
        method: str,
        host: str,
        uri: str,
        query_params: Optional[dict] = None,
        body_params: Optional[dict] = None,
    ) -> dict:
        """Make a signed request to the Webull API."""
        headers = _sign_request(
            self.app_key, self.app_secret, host, uri,
            query_params=query_params, body_params=body_params,
        )

        url = f"https://{host}{uri}"
        if query_params:
            url = f"{url}?{urlencode(query_params)}"

        try:
            if method.upper() == "GET":
                resp = self._http.get(url, headers=headers)
            else:
                body = _json_compact(body_params) if body_params else None
                resp = self._http.post(url, headers=headers, content=body)

            if resp.status_code == 200:
                try:
                    return resp.json()
                except Exception:
                    return {"raw": resp.text}
            else:
                logger.warning(f"Webull API {uri} returned {resp.status_code}: {resp.text[:200]}")
                return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        except httpx.TimeoutException:
            logger.error(f"Timeout calling {uri}")
            return {"error": "Request timed out"}
        except Exception as e:
            logger.error(f"Request to {uri} failed: {e}")
            return {"error": str(e)}

    def _trade_get(self, uri: str, params: Optional[dict] = None) -> dict:
        return self._request("GET", API_HOST, uri, query_params=params)

    def _trade_post(self, uri: str, body: Optional[dict] = None) -> dict:
        return self._request("POST", API_HOST, uri, body_params=body)

    def _market_get(self, uri: str, params: Optional[dict] = None) -> dict:
        return self._request("GET", API_HOST, uri, query_params=params)

    # ─── Account ──────────────────────────────────────────────

    def get_account_id(self) -> Optional[str]:
        """Discover the user's account_id from their app subscription."""
        if self._account_id:
            return self._account_id

        data = self._trade_get("/app/subscriptions/list")
        if isinstance(data, list) and len(data) > 0:
            self._account_id = data[0].get("account_id")
            logger.info(f"Found account_id: {self._account_id}")
            return self._account_id
        elif isinstance(data, dict) and data.get("error"):
            logger.warning(f"Account discovery failed: {data}")
        return None

    def get_account_list(self) -> list[dict]:
        """Get all accounts linked to this app."""
        data = self._trade_get("/app/subscriptions/list")
        if isinstance(data, list):
            return data
        return []

    def get_balance(self, account_id: Optional[str] = None) -> dict:
        """Get account balance and buying power."""
        acct = account_id or self.get_account_id()
        if not acct:
            return {"error": "No account_id available"}

        return self._trade_get("/account/balance", {"account_id": acct})

    def get_positions(self, account_id: Optional[str] = None, page_size: int = 100) -> list[dict]:
        """Get open positions."""
        acct = account_id or self.get_account_id()
        if not acct:
            return []

        data = self._trade_get("/account/positions", {
            "account_id": acct,
            "page_size": str(page_size),
        })
        if isinstance(data, dict):
            return data.get("holdings", [])
        return []

    # ─── Instruments ──────────────────────────────────────────

    def get_instrument(self, symbol: str, category: str = "US_STOCK") -> Optional[dict]:
        """Look up instrument details for a symbol."""
        data = self._market_get("/instrument/list", {
            "symbols": symbol.upper(),
            "category": category,
        })
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        elif isinstance(data, dict) and not data.get("error"):
            return data
        return None

    def get_instrument_id(self, symbol: str, category: str = "US_STOCK") -> Optional[str]:
        """Get the instrument_id needed for placing orders."""
        instrument = self.get_instrument(symbol, category)
        if instrument:
            return instrument.get("instrument_id")
        return None

    # ─── Market Data ─────────────────────────────────────────

    def get_bars(
        self,
        symbol: str,
        timespan: str = "D",
        count: int = 200,
        category: str = "US_STOCK",
    ) -> list[dict]:
        """Get historical candlestick/bar data.

        Args:
            symbol: Stock ticker (e.g., AAPL)
            timespan: M1, M5, M15, M30, M60, M120, M240, D, W, M, Y
            count: Number of bars (max 1200)
            category: US_STOCK or US_ETF
        """
        data = self._market_get("/market-data/bars", {
            "symbol": symbol.upper(),
            "category": category,
            "timespan": timespan,
            "count": str(min(count, 1200)),
        })
        return self._normalize_bars(data, count)

    def get_snapshot(self, symbol: str, category: str = "US_STOCK") -> Optional[dict]:
        """Get real-time quote snapshot for a symbol."""
        data = self._market_get("/market-data/snapshot", {
            "symbols": symbol.upper(),
            "category": category,
        })
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        elif isinstance(data, dict) and not data.get("error"):
            return data
        return None

    def _normalize_bars(self, raw_data, count: int) -> list[dict]:
        """Convert Webull bar format to lightweight-charts format."""
        if not raw_data:
            return []

        # Handle different response shapes
        raw_list = []
        if isinstance(raw_data, list):
            raw_list = raw_data
        elif isinstance(raw_data, dict):
            if raw_data.get("error"):
                return []
            if "data" in raw_data:
                raw_list = raw_data["data"] if isinstance(raw_data["data"], list) else [raw_data["data"]]
            elif "bars" in raw_data:
                raw_list = raw_data["bars"] if isinstance(raw_data["bars"], list) else [raw_data["bars"]]
            else:
                raw_list = [raw_data]

        bars = []
        for bar in raw_list[-count:]:
            try:
                time_str = bar.get("time", "")
                if "T" in time_str:
                    time_str = time_str.split("T")[0]

                bars.append({
                    "time": time_str,
                    "open": float(bar.get("open", 0)),
                    "high": float(bar.get("high", 0)),
                    "low": float(bar.get("low", 0)),
                    "close": float(bar.get("close", 0)),
                    "volume": int(float(bar.get("volume", 0))),
                })
            except (ValueError, TypeError) as e:
                logger.warning(f"Skipping malformed bar: {e}")
                continue

        return bars

    # ─── Trading ──────────────────────────────────────────────

    def place_order(
        self,
        account_id: Optional[str],
        symbol: str,
        side: str,
        qty: int,
        order_type: str = "LIMIT",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        tif: str = "DAY",
        extended_hours: bool = False,
    ) -> dict:
        """Place a stock order."""
        acct = account_id or self.get_account_id()
        if not acct:
            return {"error": "No account_id available", "placed": False}

        instrument_id = self.get_instrument_id(symbol)
        if not instrument_id:
            return {"error": f"Could not find instrument_id for {symbol}", "placed": False}

        client_order_id = str(uuid.uuid4()).replace("-", "")[:40]

        stock_order = {
            "client_order_id": client_order_id,
            "side": side.upper(),
            "tif": tif,
            "extended_hours_trading": extended_hours,
            "instrument_id": instrument_id,
            "order_type": order_type.upper(),
            "qty": str(qty),
        }

        if limit_price is not None:
            stock_order["limit_price"] = str(limit_price)
        if stop_price is not None:
            stock_order["stop_price"] = str(stop_price)

        body = {
            "account_id": acct,
            "stock_order": stock_order,
        }

        data = self._trade_post("/trade/order/place", body)

        if isinstance(data, dict) and data.get("error"):
            return {"error": data["error"], "placed": False}

        return {
            "placed": True,
            "client_order_id": data.get("client_order_id", client_order_id) if isinstance(data, dict) else client_order_id,
            "symbol": symbol.upper(),
            "side": side.upper(),
            "qty": qty,
            "order_type": order_type,
        }

    def cancel_order(self, account_id: Optional[str], client_order_id: str) -> dict:
        """Cancel an open order."""
        acct = account_id or self.get_account_id()
        if not acct:
            return {"error": "No account_id", "cancelled": False}

        body = {
            "account_id": acct,
            "client_order_id": client_order_id,
        }

        data = self._trade_post("/trade/order/cancel", body)

        if isinstance(data, dict) and data.get("error"):
            return {"error": data["error"], "cancelled": False}

        return {"cancelled": True, "client_order_id": client_order_id}

    def get_day_orders(self, account_id: Optional[str] = None, page_size: int = 50) -> list[dict]:
        """Get today's orders."""
        acct = account_id or self.get_account_id()
        if not acct:
            return []

        data = self._trade_get("/trade/orders/list-today", {
            "account_id": acct,
            "page_size": str(page_size),
        })
        if isinstance(data, dict):
            return data.get("orders", [])
        return []

    def get_open_orders(self, account_id: Optional[str] = None) -> list[dict]:
        """Get currently open/pending orders."""
        acct = account_id or self.get_account_id()
        if not acct:
            return []

        data = self._trade_get("/trade/orders/list-open", {
            "account_id": acct,
        })
        if isinstance(data, dict):
            return data.get("orders", [])
        return []

    # ─── Connection test ──────────────────────────────────────

    def test_connection(self) -> dict:
        """Test if the API credentials work."""
        try:
            accounts = self.get_account_list()
            if accounts:
                acct = accounts[0]
                return {
                    "connected": True,
                    "account_id": acct.get("account_id"),
                    "user_id": acct.get("user_id"),
                    "accounts": len(accounts),
                }
            return {"connected": False, "message": "No accounts found"}
        except Exception as e:
            return {"connected": False, "message": str(e)}


# ─── Singleton factory ────────────────────────────────────────

_client_instance: Optional[WebullClient] = None


def get_webull() -> WebullClient:
    """Get or create the singleton WebullClient instance."""
    global _client_instance
    if _client_instance is None:
        settings = get_settings()
        if not settings.webull_app_key or not settings.webull_app_secret:
            raise RuntimeError(
                "WEBULL_APP_KEY and WEBULL_APP_SECRET must be set in .env"
            )
        _client_instance = WebullClient(settings.webull_app_key, settings.webull_app_secret)
    return _client_instance


def reset_client():
    """Reset the client (useful for reconnection)."""
    global _client_instance
    _client_instance = None
