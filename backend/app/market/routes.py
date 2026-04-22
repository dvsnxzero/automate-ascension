"""
Market data routes — quotes, bars, instrument search.

Uses the Webull OpenAPI for:
- Instrument lookup (HTTP): /instrument/list
- Historical bars (gRPC): /market-data/bars
"""

from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Map frontend interval strings to Webull timespan codes
# Webull uses: M1, M5, M15, M30, M60, M120, M240, D, W, M, Y
INTERVAL_MAP = {
    "1m": "M1",
    "5m": "M5",
    "15m": "M15",
    "30m": "M30",
    "1h": "M60",
    "4h": "M240",
    "1d": "D",
    "1w": "W",
}


def _get_client():
    """Get the Webull client, return None if not configured."""
    try:
        from app.webull_client import get_webull
        return get_webull()
    except Exception:
        return None


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """Get instrument info and latest data for a symbol.

    Note: Webull OpenAPI market data snapshots may not be available yet.
    Falls back to instrument info + position data if available.
    """
    wb = _get_client()
    if not wb:
        return {
            "symbol": symbol.upper(),
            "price": None,
            "change_pct": None,
            "volume": None,
            "message": "Webull API not connected",
        }

    try:
        instrument = wb.get_instrument(symbol)
        if instrument:
            return {
                "symbol": instrument.get("symbol", symbol.upper()),
                "name": instrument.get("name"),
                "instrument_id": instrument.get("instrument_id"),
                "exchange": instrument.get("exchange_code"),
                "currency": instrument.get("currency"),
                "price": None,  # Snapshot not yet available via OpenAPI
                "change_pct": None,
                "volume": None,
                "message": "Instrument found. Real-time quotes via MQTT subscription.",
            }
        return {
            "symbol": symbol.upper(),
            "price": None,
            "message": f"Symbol {symbol} not found",
        }
    except Exception as e:
        logger.error(f"Quote lookup failed for {symbol}: {e}")
        return {
            "symbol": symbol.upper(),
            "price": None,
            "message": f"Error: {str(e)}",
        }


@router.get("/bars/{symbol}")
async def get_bars(symbol: str, interval: str = "1d", count: int = 200):
    """Get historical candle bars for charting.

    Args:
        symbol: Stock ticker (e.g., AAPL)
        interval: Bar interval — 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
        count: Number of bars to return (max 1200)
    """
    wb = _get_client()
    if not wb:
        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "count": count,
            "bars": [],
            "message": "Webull API not connected",
        }

    timespan = INTERVAL_MAP.get(interval, "D1")

    try:
        bars = wb.get_bars(symbol, timespan=timespan, count=min(count, 1200))
        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "count": len(bars),
            "bars": bars,
            "message": f"Fetched {len(bars)} bars" if bars else "No bar data available",
        }
    except Exception as e:
        logger.error(f"Bars fetch failed for {symbol}: {e}")
        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "count": 0,
            "bars": [],
            "message": f"Error fetching bars: {str(e)}",
        }


@router.get("/search/{query}")
async def search_symbol(query: str):
    """Search for stocks by ticker.

    Looks up one or more comma-separated symbols.
    """
    wb = _get_client()
    if not wb:
        return {"query": query, "results": [], "message": "Webull API not connected"}

    symbols = [s.strip().upper() for s in query.split(",") if s.strip()]

    try:
        results = []
        # Look up each symbol (batch if comma-separated)
        for sym in symbols[:10]:  # Cap at 10 to avoid rate limits
            instrument = wb.get_instrument(sym)
            if instrument:
                results.append({
                    "symbol": instrument.get("symbol"),
                    "name": instrument.get("name"),
                    "instrument_id": instrument.get("instrument_id"),
                    "exchange": instrument.get("exchange_code"),
                })

        return {
            "query": query,
            "results": results,
            "count": len(results),
        }
    except Exception as e:
        logger.error(f"Symbol search failed for {query}: {e}")
        return {"query": query, "results": [], "message": f"Error: {str(e)}"}
