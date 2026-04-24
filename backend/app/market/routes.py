"""
Market data routes — quotes, bars, instrument search.

Uses the Webull OpenAPI for:
- Instrument lookup (HTTP): /instrument/list
- Historical bars (gRPC): /market-data/bars

Falls back to Yahoo Finance chart API when Webull is not connected.
"""

from fastapi import APIRouter
import logging
import httpx
import time

logger = logging.getLogger(__name__)

router = APIRouter()


def _log_access(source: str, endpoint: str, symbol: str | None,
                status: str, response_ms: int = 0, record_count: int = 0,
                error_message: str | None = None, meta: dict | None = None):
    """Fire-and-forget data access log entry."""
    try:
        from app.database import SessionLocal
        from app.models import DataAccessLog
        db = SessionLocal()
        db.add(DataAccessLog(
            source=source, endpoint=endpoint, symbol=symbol,
            status=status, response_ms=response_ms,
            record_count=record_count, error_message=error_message,
            extra_data=meta,
        ))
        db.commit()
        db.close()
    except Exception as e:
        logger.debug(f"Data access log failed: {e}")

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
    """Get instrument info and latest price for a symbol.

    Tries Webull first, then Yahoo Finance for a real-time-ish quote.
    """
    symbol = symbol.upper()

    # --- Try Webull ---
    wb = _get_client()
    if wb:
        t0 = time.time()
        try:
            instrument = wb.get_instrument(symbol)
            ms = int((time.time() - t0) * 1000)
            if instrument:
                _log_access("webull", "quote", symbol, "ok", ms, 1)
                return {
                    "symbol": instrument.get("symbol", symbol),
                    "name": instrument.get("name"),
                    "instrument_id": instrument.get("instrument_id"),
                    "exchange": instrument.get("exchange_code"),
                    "currency": instrument.get("currency"),
                    "price": None,
                    "change_pct": None,
                    "volume": None,
                    "source": "webull",
                    "message": "Instrument found. Real-time quotes via MQTT subscription.",
                }
        except Exception as e:
            ms = int((time.time() - t0) * 1000)
            _log_access("webull", "quote", symbol, "error", ms, error_message=str(e))
            logger.warning(f"Webull quote failed for {symbol}: {e}")

    # --- Fallback to Yahoo Finance ---
    t0 = time.time()
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        params = {"interval": "1d", "range": "5d", "includePrePost": "false"}
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=headers, timeout=5.0)
            data = resp.json()

        ms = int((time.time() - t0) * 1000)
        result = data.get("chart", {}).get("result")
        if result:
            meta = result[0].get("meta", {})
            price = meta.get("regularMarketPrice")
            prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
            change_pct = None
            if price and prev_close and prev_close > 0:
                change_pct = round((price - prev_close) / prev_close * 100, 2)
            _log_access("yahoo", "quote", symbol, "ok", ms, 1)
            return {
                "symbol": meta.get("symbol", symbol),
                "name": None,
                "price": price,
                "prev_close": prev_close,
                "change_pct": change_pct,
                "open": meta.get("regularMarketOpen"),
                "high": meta.get("regularMarketDayHigh"),
                "low": meta.get("regularMarketDayLow"),
                "volume": meta.get("regularMarketVolume"),
                "fifty_two_week_high": meta.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": meta.get("fiftyTwoWeekLow"),
                "market_cap": meta.get("marketCap"),
                "exchange": meta.get("exchangeName"),
                "currency": meta.get("currency"),
                "instrument_type": meta.get("instrumentType"),
                "source": "yahoo",
                "message": "Quote from Yahoo Finance",
            }
        else:
            _log_access("yahoo", "quote", symbol, "not_found", ms, 0)
            return {
                "symbol": symbol,
                "price": None,
                "found": False,
                "message": f"Symbol '{symbol}' not found",
            }
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        _log_access("yahoo", "quote", symbol, "error", ms, error_message=str(e))
        logger.error(f"Yahoo quote failed for {symbol}: {e}")
        return {
            "symbol": symbol,
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

    Tries Webull first, falls back to Yahoo Finance chart API.
    """
    symbol = symbol.upper()
    bars = []
    source = None

    # --- Try Webull first ---
    wb = _get_client()
    if wb:
        timespan = INTERVAL_MAP.get(interval, "D1")
        t0 = time.time()
        try:
            bars = wb.get_bars(symbol, timespan=timespan, count=min(count, 1200))
            ms = int((time.time() - t0) * 1000)
            if bars:
                source = "webull"
                _log_access("webull", "bars", symbol, "ok", ms, len(bars), meta={"interval": interval})
            else:
                _log_access("webull", "bars", symbol, "empty", ms, 0, meta={"interval": interval})
        except Exception as e:
            ms = int((time.time() - t0) * 1000)
            _log_access("webull", "bars", symbol, "error", ms, error_message=str(e))
            logger.warning(f"Webull bars failed for {symbol}: {e}")

    # --- Fallback to Yahoo Finance ---
    if not bars:
        t0 = time.time()
        try:
            bars = await _yahoo_bars(symbol, interval, count)
            ms = int((time.time() - t0) * 1000)
            if bars:
                source = "yahoo"
                _log_access("yahoo", "bars", symbol, "ok", ms, len(bars), meta={"interval": interval})
            else:
                _log_access("yahoo", "bars", symbol, "empty", ms, 0, meta={"interval": interval})
        except Exception as e:
            ms = int((time.time() - t0) * 1000)
            _log_access("yahoo", "bars", symbol, "error", ms, error_message=str(e))
            logger.warning(f"Yahoo bars failed for {symbol}: {e}")

    return {
        "symbol": symbol,
        "interval": interval,
        "count": len(bars),
        "bars": bars,
        "source": source,
        "message": f"Fetched {len(bars)} bars from {source}" if bars else "No data found — symbol may be invalid",
    }


# Yahoo Finance interval mapping
_YAHOO_INTERVAL = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "60m", "4h": "60m",  # Yahoo doesn't have 4h; use 1h
    "1d": "1d", "1w": "1wk",
}

# Yahoo range mapping (how far back to fetch)
_YAHOO_RANGE = {
    "1m": "1d", "5m": "5d", "15m": "5d", "30m": "1mo",
    "1h": "6mo", "4h": "6mo", "1d": "1y", "1w": "5y",
}


async def _yahoo_bars(symbol: str, interval: str, count: int) -> list:
    """Fetch OHLC bars from Yahoo Finance chart API (free, no key needed)."""
    yf_interval = _YAHOO_INTERVAL.get(interval, "1d")
    yf_range = _YAHOO_RANGE.get(interval, "1y")

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {
        "interval": yf_interval,
        "range": yf_range,
        "includePrePost": "false",
    }
    headers = {"User-Agent": "Mozilla/5.0"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=headers, timeout=8.0)
        data = resp.json()

    result_data = data.get("chart", {}).get("result")
    if not result_data:
        return []

    chart = result_data[0]
    timestamps = chart.get("timestamp", [])
    quote = chart.get("indicators", {}).get("quote", [{}])[0]

    opens = quote.get("open", [])
    highs = quote.get("high", [])
    lows = quote.get("low", [])
    closes = quote.get("close", [])
    volumes = quote.get("volume", [])

    bars = []
    for i, ts in enumerate(timestamps):
        if i >= len(opens) or opens[i] is None or closes[i] is None:
            continue
        bar = {
            "time": ts,  # Unix timestamp
            "open": round(opens[i], 2),
            "high": round(highs[i], 2),
            "low": round(lows[i], 2),
            "close": round(closes[i], 2),
        }
        if i < len(volumes) and volumes[i] is not None:
            bar["volume"] = volumes[i]
        bars.append(bar)

    # Trim to requested count (take most recent)
    if len(bars) > count:
        bars = bars[-count:]

    return bars


@router.get("/search/{query}")
async def search_symbol(query: str, limit: int = 10):
    """Search for stocks, ETFs, and funds by name or ticker.

    Uses Finnhub symbol search first, falls back to Yahoo Finance
    autocomplete if Finnhub returns no results or is unavailable.
    """
    query = query.strip()
    if not query:
        return {"query": query, "results": [], "count": 0}

    results = []
    search_source = None

    # --- Try Finnhub first ---
    t0 = time.time()
    try:
        from app.config import get_settings
        settings = get_settings()
        if settings.finnhub_api_key:
            import finnhub
            client = finnhub.Client(api_key=settings.finnhub_api_key)
            resp = client.symbol_lookup(query)
            ms = int((time.time() - t0) * 1000)
            if resp and resp.get("count", 0) > 0:
                search_source = "finnhub"
                for item in resp.get("result", [])[:limit]:
                    results.append({
                        "symbol": item.get("symbol", ""),
                        "name": item.get("description", ""),
                        "type": item.get("type", ""),
                        "exchange": item.get("displaySymbol", item.get("symbol", "")),
                        "source": "finnhub",
                    })
                _log_access("finnhub", "search", query, "ok", ms, len(results))
            else:
                _log_access("finnhub", "search", query, "empty", ms, 0)
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        _log_access("finnhub", "search", query, "error", ms, error_message=str(e))
        logger.warning(f"Finnhub search failed for '{query}': {e}")

    # --- Fallback to Yahoo Finance if no Finnhub results ---
    if not results:
        t0 = time.time()
        try:
            url = "https://query2.finance.yahoo.com/v1/finance/search"
            params = {
                "q": query,
                "quotesCount": limit,
                "newsCount": 0,
                "listsCount": 0,
                "enableFuzzyQuery": True,
                "quotesQueryId": "tss_match_phrase_query",
            }
            headers = {"User-Agent": "Mozilla/5.0"}
            async with httpx.AsyncClient() as http:
                resp = await http.get(url, params=params, headers=headers, timeout=5.0)
                data = resp.json()
                for item in data.get("quotes", [])[:limit]:
                    symbol = item.get("symbol", "")
                    qtype = item.get("quoteType", "")
                    results.append({
                        "symbol": symbol,
                        "name": item.get("shortname") or item.get("longname", ""),
                        "type": qtype,
                        "exchange": item.get("exchange", ""),
                        "source": "yahoo",
                    })
            ms = int((time.time() - t0) * 1000)
            if results:
                search_source = "yahoo"
                _log_access("yahoo", "search", query, "ok", ms, len(results))
            else:
                _log_access("yahoo", "search", query, "empty", ms, 0)
        except Exception as e:
            ms = int((time.time() - t0) * 1000)
            _log_access("yahoo", "search", query, "error", ms, error_message=str(e))
            logger.warning(f"Yahoo Finance search failed for '{query}': {e}")

    # --- Last resort: try Webull instrument lookup ---
    if not results:
        wb = _get_client()
        if wb:
            t0 = time.time()
            try:
                instrument = wb.get_instrument(query.upper())
                ms = int((time.time() - t0) * 1000)
                if instrument:
                    search_source = "webull"
                    results.append({
                        "symbol": instrument.get("symbol", query.upper()),
                        "name": instrument.get("name", ""),
                        "type": "Stock",
                        "exchange": instrument.get("exchange_code", ""),
                        "source": "webull",
                    })
                    _log_access("webull", "search", query, "ok", ms, 1)
                else:
                    _log_access("webull", "search", query, "empty", ms, 0)
            except Exception as e:
                ms = int((time.time() - t0) * 1000)
                _log_access("webull", "search", query, "error", ms, error_message=str(e))
                logger.warning(f"Webull search failed for '{query}': {e}")

    # --- Generate suggestions if no results ---
    suggestions = []
    if not results:
        suggestions = await _get_suggestions(query, limit=5)

    return {
        "query": query,
        "results": results,
        "count": len(results),
        "source": search_source,
        "suggestions": suggestions if suggestions else None,
    }


# Common tickers for fast fuzzy matching when APIs return nothing
_COMMON_TICKERS = [
    ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("GOOGL", "Alphabet Google"),
    ("AMZN", "Amazon"), ("META", "Meta Facebook"), ("TSLA", "Tesla"),
    ("NVDA", "NVIDIA"), ("NFLX", "Netflix"), ("SPY", "S&P 500 ETF"),
    ("QQQ", "Nasdaq 100 ETF"), ("VOO", "Vanguard S&P 500"),
    ("VTI", "Vanguard Total Stock"), ("DIA", "Dow Jones ETF"),
    ("IWM", "Russell 2000 ETF"), ("ARKK", "ARK Innovation"),
    ("AMD", "Advanced Micro Devices"), ("INTC", "Intel"),
    ("BA", "Boeing"), ("DIS", "Disney"), ("JPM", "JPMorgan"),
    ("V", "Visa"), ("MA", "Mastercard"), ("WMT", "Walmart"),
    ("KO", "Coca-Cola"), ("PEP", "PepsiCo"), ("NKE", "Nike"),
    ("COST", "Costco"), ("HD", "Home Depot"), ("CRM", "Salesforce"),
    ("UBER", "Uber"), ("LYFT", "Lyft"), ("SNAP", "Snapchat"),
    ("SQ", "Block Square"), ("PYPL", "PayPal"), ("COIN", "Coinbase"),
    ("PLTR", "Palantir"), ("SOFI", "SoFi"), ("RIVN", "Rivian"),
    ("LCID", "Lucid"), ("F", "Ford"), ("GM", "General Motors"),
    ("XOM", "Exxon"), ("CVX", "Chevron"), ("BRK.B", "Berkshire Hathaway"),
    ("UNH", "UnitedHealth"), ("JNJ", "Johnson Johnson"),
    ("PFE", "Pfizer"), ("MRNA", "Moderna"), ("ABBV", "AbbVie"),
    ("T", "AT&T"), ("VZ", "Verizon"), ("TMUS", "T-Mobile"),
]


async def _get_suggestions(query: str, limit: int = 5) -> list:
    """Generate 'did you mean?' suggestions for failed searches."""
    q = query.upper().strip()
    q_lower = query.lower().strip()
    scored = []

    for ticker, name in _COMMON_TICKERS:
        score = 0
        # Exact prefix match on ticker
        if ticker.startswith(q):
            score += 10
        # Substring match on ticker
        elif q in ticker:
            score += 6
        # Name contains query
        if q_lower in name.lower():
            score += 8
        # Levenshtein-lite: character overlap ratio
        if len(q) >= 2:
            overlap = sum(1 for c in q if c in ticker)
            score += (overlap / max(len(q), len(ticker))) * 4

        if score > 2:
            scored.append({"symbol": ticker, "name": name, "score": score})

    scored.sort(key=lambda x: -x["score"])
    return [{"symbol": s["symbol"], "name": s["name"]} for s in scored[:limit]]
