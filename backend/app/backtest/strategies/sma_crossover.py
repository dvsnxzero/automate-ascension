"""9/180 SMA Crossover — ZipTrader Module 05-02.

Long when the short-period SMA crosses above the long-period SMA AND price is
above the long-period SMA (regime filter). Exit on a cross-back.
"""

import pandas as pd

from app.backtest.strategies.base import Strategy, StrategyParam
from app.strategy.indicators import _sma


class SmaCrossover(Strategy):
    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        short = int(params.get("sma_short", 9))
        long = int(params.get("sma_long", 180))

        close = bars["close"]
        short_sma = _sma(close, short)
        long_sma = _sma(close, long)

        # Cross detection — current vs. previous bar
        prev_short = short_sma.shift(1)
        prev_long = long_sma.shift(1)

        bull_cross = (short_sma > long_sma) & (prev_short <= prev_long)
        bear_cross = (short_sma < long_sma) & (prev_short >= prev_long)

        # Regime filter: only take longs when price is above the long-term SMA.
        regime_ok = close > long_sma

        signal = pd.Series(0, index=bars.index, dtype="int8")
        signal[bull_cross & regime_ok] = 1
        signal[bear_cross] = -1
        return signal


sma_crossover = SmaCrossover(
    id="sma_crossover",
    name="9/180 SMA Crossover",
    description="Long when the 9-SMA crosses above the 180-SMA and price holds above the 180-SMA. Exits on a bearish cross or your stop / target.",
    course_ref="05-02",
    own_params=[
        StrategyParam("sma_short", "Short SMA", "int", 9, min=2, max=200, step=1,
                      help="Fast moving average period."),
        StrategyParam("sma_long", "Long SMA", "int", 180, min=10, max=400, step=1,
                      help="Slow moving average — also acts as the regime filter."),
    ],
)
