"""
ZipTrader U Strategy Indicators — Pure Python/Pandas implementation

No external TA library required. Implements:
- SMA (9/180) for entry/exit confirmations and validations
- RSI for overbought/oversold assessment
- MACD for price strength gauging
"""

import pandas as pd
import numpy as np


def _sma(series: pd.Series, length: int) -> pd.Series:
    """Simple Moving Average."""
    return series.rolling(window=length, min_periods=length).mean()


def _ema(series: pd.Series, length: int) -> pd.Series:
    """Exponential Moving Average."""
    return series.ewm(span=length, adjust=False).mean()


def _rsi(series: pd.Series, length: int = 14) -> pd.Series:
    """Relative Strength Index."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / length, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1 / length, min_periods=length).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def sma_signals(candles: pd.DataFrame, short: int = 9, long: int = 180) -> dict:
    """Calculate SMA-based entry/exit signals.

    ZipTrader specs:
    - Short Term SMA (Price Strength): Close, 9, 0, no
    - Long Term SMA (Directional Strength): Close, 180, 0, no

    Confirmation: price crosses ABOVE the 9-SMA (potential entry)
    Validation: first candle closes BELOW the 9-SMA (evaluate exit)
    """
    close = candles["close"]
    short_sma = _sma(close, short)
    long_sma = _sma(close, long)

    # Confirmation: crossed above short SMA
    confirmation = (close > short_sma) & (close.shift(1) <= short_sma.shift(1))

    # Validation: crossed below short SMA
    validation = (close < short_sma) & (close.shift(1) >= short_sma.shift(1))

    # Directional strength: above long-term SMA = bullish
    direction_bullish = close > long_sma

    return {
        "short_sma": short_sma.tolist(),
        "long_sma": long_sma.tolist(),
        "confirmation": confirmation.tolist(),
        "validation": validation.tolist(),
        "direction_bullish": direction_bullish.tolist(),
    }


def rsi_assessment(candles: pd.DataFrame, period: int = 14) -> dict:
    """Assess RSI for deal quality.

    ZipTrader guidance:
    - RSI > 70 = overbought (deprecating factor, avoid buying)
    - RSI < 30 = oversold (elevating factor, potential value)
    - RSI 40-60 = fair value zone
    """
    rsi = _rsi(candles["close"], period)
    latest = float(rsi.iloc[-1]) if not rsi.empty and not np.isnan(rsi.iloc[-1]) else None

    return {
        "rsi": rsi.tolist(),
        "latest": latest,
        "overbought": latest is not None and latest > 70,
        "oversold": latest is not None and latest < 30,
        "fair_value": latest is not None and 40 <= latest <= 60,
    }


def macd_strength(
    candles: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9
) -> dict:
    """Gauge price strength using MACD.

    ZipTrader guidance:
    - Blue (MACD) line > yellow (signal) line = positive price strength
    - Green histogram bars = magnitude of strength
    """
    close = candles["close"]
    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line

    latest_macd = float(macd_line.iloc[-1]) if not macd_line.empty else 0
    latest_signal = float(signal_line.iloc[-1]) if not signal_line.empty else 0

    return {
        "macd": macd_line.tolist(),
        "signal": signal_line.tolist(),
        "histogram": histogram.tolist(),
        "positive_strength": latest_macd > latest_signal,
    }


def analyze_symbol(candles: pd.DataFrame) -> dict:
    """Run all indicators on a symbol's candle data."""
    return {
        "sma": sma_signals(candles),
        "rsi": rsi_assessment(candles),
        "macd": macd_strength(candles),
    }
