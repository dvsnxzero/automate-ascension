"""
Strategy routes — indicator analysis, scorecard, scanners.

Wired to Webull API for real market data.
"""

from fastapi import APIRouter
import pandas as pd
import logging

from app.strategy.scorecard import ScorecardInput, run_scorecard
from app.strategy.scanners import ScannerConfig, morning_scan, overreaction_scan, pattern_scan
from app.strategy.indicators import analyze_symbol as run_indicators

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_client():
    try:
        from app.webull_client import get_webull
        return get_webull()
    except Exception:
        return None


@router.post("/analyze/{symbol}")
async def analyze_symbol(symbol: str, interval: str = "1d"):
    """Run all indicators (SMA, RSI, MACD) on a symbol using real data."""
    wb = _get_client()
    if not wb:
        return {
            "symbol": symbol.upper(),
            "message": "Webull API not connected",
            "sma": None,
            "rsi": None,
            "macd": None,
        }

    # Map interval to Webull timespan
    interval_map = {
        "1m": "M1", "5m": "M5", "15m": "M15",
        "30m": "M30", "1h": "M60", "4h": "M240",
        "1d": "D", "1w": "W",
    }
    timespan = interval_map.get(interval, "D")

    try:
        bars = wb.get_bars(symbol, timespan=timespan, count=200)
        if not bars:
            return {
                "symbol": symbol.upper(),
                "message": "No bar data available",
                "sma": None,
                "rsi": None,
                "macd": None,
            }

        # Convert to DataFrame
        df = pd.DataFrame(bars)
        for col in ["open", "high", "low", "close", "volume"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Run all indicators
        result = run_indicators(df)

        # Add summary info
        latest_price = float(df.iloc[-1]["close"])
        sma_data = result.get("sma", {})
        rsi_data = result.get("rsi", {})
        macd_data = result.get("macd", {})

        return {
            "symbol": symbol.upper(),
            "price": latest_price,
            "interval": interval,
            "bars_count": len(bars),
            "sma": {
                "short_sma": sma_data.get("short_sma", [])[-1] if sma_data.get("short_sma") else None,
                "long_sma": sma_data.get("long_sma", [])[-1] if sma_data.get("long_sma") else None,
                "confirmation": sma_data.get("confirmation", [])[-1] if sma_data.get("confirmation") else False,
                "validation": sma_data.get("validation", [])[-1] if sma_data.get("validation") else False,
                "direction_bullish": sma_data.get("direction_bullish", [])[-1] if sma_data.get("direction_bullish") else False,
            },
            "rsi": {
                "value": rsi_data.get("latest"),
                "overbought": rsi_data.get("overbought", False),
                "oversold": rsi_data.get("oversold", False),
                "fair_value": rsi_data.get("fair_value", False),
            },
            "macd": {
                "positive_strength": macd_data.get("positive_strength", False),
                "macd_value": macd_data.get("macd", [])[-1] if macd_data.get("macd") else None,
                "signal_value": macd_data.get("signal", [])[-1] if macd_data.get("signal") else None,
            },
        }
    except Exception as e:
        logger.error(f"Analysis failed for {symbol}: {e}")
        return {
            "symbol": symbol.upper(),
            "message": f"Analysis error: {str(e)}",
            "sma": None,
            "rsi": None,
            "macd": None,
        }


@router.post("/scorecard")
async def evaluate_scorecard(input: ScorecardInput):
    """Run the ZipTrader 7-Step Test on a trade setup."""
    result = run_scorecard(input)
    return result


@router.post("/scan/{scanner_type}")
async def run_scan(scanner_type: str, config: ScannerConfig = ScannerConfig()):
    """Run a scanner by type: morning, overreaction, or pattern."""
    scanners = {
        "morning": morning_scan,
        "overreaction": overreaction_scan,
        "pattern": pattern_scan,
    }

    scanner_fn = scanners.get(scanner_type)
    if not scanner_fn:
        return {"error": f"Unknown scanner type: {scanner_type}", "results": []}

    try:
        if scanner_type == "morning":
            results = await scanner_fn(config)
        else:
            results = await scanner_fn()

        return {
            "scanner": scanner_type,
            "count": len(results),
            "results": [r.model_dump() for r in results],
        }
    except Exception as e:
        logger.error(f"Scanner {scanner_type} failed: {e}")
        return {
            "scanner": scanner_type,
            "count": 0,
            "results": [],
            "message": f"Scanner error: {str(e)}",
        }
