"""
ZipTrader Scanner Implementations

Three scanner types from Module 13:
1. Morning Scanner — find big movers at market open
2. Overreaction Scanner — find oversold bounce candidates
3. Pattern Scanner — find technical breakout setups

These use a two-step approach:
1. Get a list of candidate symbols (hardcoded watchlists + popular tickers)
2. Fetch bars and run indicators to filter

Note: Webull OpenAPI doesn't have a screener endpoint, so we scan
a curated universe of stocks and apply our own filters.
"""

import logging
import pandas as pd
from pydantic import BaseModel
from typing import Optional

from app.strategy.indicators import sma_signals, rsi_assessment, macd_strength

logger = logging.getLogger(__name__)


class ScannerConfig(BaseModel):
    """Configurable scanner parameters."""
    price_change_pct_min: float = 5.0
    volume_change_pct_min: float = 2.0
    min_price: float = 1.0
    max_price: Optional[float] = None
    limit: int = 50


class ScanResult(BaseModel):
    symbol: str
    price: float
    change_pct: float
    volume: int
    scanner_type: str
    score: Optional[float] = None
    notes: Optional[str] = None


# Universe of popular stocks to scan against
# In production, this would pull from a dynamic universe
SCAN_UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "AMD",
    "NFLX", "DIS", "BABA", "NIO", "PLTR", "SOFI", "RIVN", "LCID",
    "COIN", "MARA", "RIOT", "SQ", "PYPL", "SHOP", "ROKU", "SNAP",
    "UBER", "LYFT", "DKNG", "PENN", "ABNB", "CRWD", "NET", "SNOW",
    "MU", "INTC", "QCOM", "AVGO", "CRM", "ORCL", "IBM", "BA",
    "JPM", "GS", "BAC", "WFC", "V", "MA", "AXP", "HD", "WMT", "COST",
]


def _get_client():
    try:
        from app.webull_client import get_webull
        return get_webull()
    except Exception:
        return None


def _bars_to_df(bars: list[dict]) -> pd.DataFrame:
    """Convert bar list to pandas DataFrame."""
    if not bars:
        return pd.DataFrame()
    df = pd.DataFrame(bars)
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


async def morning_scan(config: ScannerConfig = ScannerConfig()) -> list[ScanResult]:
    """Morning Scanner: find stocks with strong early moves.

    ZipTrader specs:
    - Price change: >= 5% over recent period
    - Volume change: >= 2% above average
    - Minimum price: $1.00
    - Sort by: % change descending
    """
    wb = _get_client()
    if not wb:
        return []

    results = []
    for symbol in SCAN_UNIVERSE[:config.limit]:
        try:
            bars = wb.get_bars(symbol, timespan="D1", count=20)
            if len(bars) < 2:
                continue

            df = _bars_to_df(bars)
            if df.empty:
                continue

            latest = df.iloc[-1]
            prev = df.iloc[-2]
            price = float(latest["close"])

            # Price filter
            if price < config.min_price:
                continue
            if config.max_price and price > config.max_price:
                continue

            # Calculate change
            if prev["close"] > 0:
                change_pct = ((price - float(prev["close"])) / float(prev["close"])) * 100
            else:
                continue

            # Volume check
            avg_vol = df["volume"].iloc[:-1].mean()
            current_vol = int(latest["volume"])
            vol_change = ((current_vol - avg_vol) / avg_vol * 100) if avg_vol > 0 else 0

            # Apply filters
            if abs(change_pct) >= config.price_change_pct_min and vol_change >= config.volume_change_pct_min:
                results.append(ScanResult(
                    symbol=symbol,
                    price=round(price, 2),
                    change_pct=round(change_pct, 2),
                    volume=current_vol,
                    scanner_type="morning",
                    notes=f"Vol +{vol_change:.0f}% vs avg",
                ))
        except Exception as e:
            logger.debug(f"Morning scan skip {symbol}: {e}")
            continue

    # Sort by change descending
    results.sort(key=lambda r: abs(r.change_pct), reverse=True)
    return results[:config.limit]


async def overreaction_scan(config: ScannerConfig = None) -> list[ScanResult]:
    """Overreaction Scanner: find stocks that sold off hard.

    Looks for bounce plays:
    - Price change: <= -5%
    - Volume spike above average
    - Price > $1
    """
    wb = _get_client()
    if not wb:
        return []

    if config is None:
        config = ScannerConfig(price_change_pct_min=5.0)

    results = []
    for symbol in SCAN_UNIVERSE:
        try:
            bars = wb.get_bars(symbol, timespan="D1", count=20)
            if len(bars) < 2:
                continue

            df = _bars_to_df(bars)
            if df.empty:
                continue

            latest = df.iloc[-1]
            prev = df.iloc[-2]
            price = float(latest["close"])

            if price < config.min_price:
                continue

            change_pct = ((price - float(prev["close"])) / float(prev["close"])) * 100

            # Only negative moves
            if change_pct > -config.price_change_pct_min:
                continue

            # Volume spike check
            avg_vol = df["volume"].iloc[:-1].mean()
            current_vol = int(latest["volume"])

            if avg_vol > 0 and current_vol > avg_vol * 1.5:
                # Check RSI for oversold
                rsi_data = rsi_assessment(df)
                rsi_note = ""
                if rsi_data.get("oversold"):
                    rsi_note = f" RSI={rsi_data['latest']:.0f} OVERSOLD"

                results.append(ScanResult(
                    symbol=symbol,
                    price=round(price, 2),
                    change_pct=round(change_pct, 2),
                    volume=current_vol,
                    scanner_type="overreaction",
                    notes=f"Vol {current_vol/avg_vol:.1f}x avg{rsi_note}",
                ))
        except Exception as e:
            logger.debug(f"Overreaction scan skip {symbol}: {e}")
            continue

    results.sort(key=lambda r: r.change_pct)
    return results[:50]


async def pattern_scan(config: ScannerConfig = None) -> list[ScanResult]:
    """Pattern Scanner: find technical breakout setups.

    ZipTrader criteria:
    - Price near 9-SMA (within 2%)
    - 180-SMA trending up
    - RSI in fair value zone (40-60)
    - MACD showing positive strength
    """
    wb = _get_client()
    if not wb:
        return []

    results = []
    for symbol in SCAN_UNIVERSE:
        try:
            bars = wb.get_bars(symbol, timespan="D1", count=200)
            if len(bars) < 180:
                continue

            df = _bars_to_df(bars)
            if df.empty:
                continue

            price = float(df.iloc[-1]["close"])

            # Run all indicators
            sma = sma_signals(df)
            rsi = rsi_assessment(df)
            macd = macd_strength(df)

            # Check criteria
            short_sma_latest = sma["short_sma"][-1] if sma["short_sma"] else None
            long_sma_latest = sma["long_sma"][-1] if sma["long_sma"] else None

            if short_sma_latest is None or long_sma_latest is None:
                continue

            # Near 9-SMA (within 2%)
            sma_distance = abs(price - short_sma_latest) / short_sma_latest * 100
            if sma_distance > 2.0:
                continue

            # 180-SMA trending up (current > 10 bars ago)
            if len(sma["long_sma"]) > 10:
                sma_trend = sma["long_sma"][-1] > sma["long_sma"][-10]
                if not sma_trend:
                    continue

            # RSI fair value
            if not rsi.get("fair_value"):
                continue

            # MACD positive
            if not macd.get("positive_strength"):
                continue

            score = 0
            if sma_distance < 1.0:
                score += 2
            else:
                score += 1
            if rsi.get("latest") and 45 <= rsi["latest"] <= 55:
                score += 2
            else:
                score += 1
            if macd.get("positive_strength"):
                score += 1

            results.append(ScanResult(
                symbol=symbol,
                price=round(price, 2),
                change_pct=round(sma_distance, 2),
                volume=int(df.iloc[-1].get("volume", 0)),
                scanner_type="pattern",
                score=score,
                notes=f"SMA dist {sma_distance:.1f}% | RSI {rsi['latest']:.0f} | MACD+",
            ))
        except Exception as e:
            logger.debug(f"Pattern scan skip {symbol}: {e}")
            continue

    results.sort(key=lambda r: r.score or 0, reverse=True)
    return results[:50]
