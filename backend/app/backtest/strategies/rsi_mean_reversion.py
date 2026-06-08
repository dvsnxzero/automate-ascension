"""RSI "Good Deal" + Price Strength — ZipTrader Module 05-03.

Course-accurate RSI play. Lesson 05-03 is explicit: do NOT buy purely on
RSI oversold. You need an elevating factor — most commonly the price
crossing back above the 9-SMA (price strength, per 05-02). RSI alone
identifies the deal; price-vs-SMA confirms the reversal is real.

Entry  : RSI was at-or-below oversold within the last `rsi_lookback`
         bars AND price now crosses up through the 9-SMA.
Exit   : RSI reaches overbought OR price closes below the 9-SMA
         (validation) — whichever comes first.

Course refs:
  - 05-03 "RSI: Finding A Good Deal" (oversold + elevating factors)
  - 05-02 "SMA: Finding Entry & Exit Points" (price-vs-SMA confirmation)
  - 05-12 "When To Exit" (validation = close below short SMA)
"""

import pandas as pd

from app.backtest.strategies.base import Strategy, StrategyParam
from app.strategy.indicators import _rsi, _sma


class RsiGoodDeal(Strategy):
    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        rsi_period = int(params.get("rsi_period", 14))
        oversold = float(params.get("oversold", 30))
        overbought = float(params.get("overbought", 70))
        sma_strength = int(params.get("sma_strength", 9))
        rsi_lookback = int(params.get("rsi_lookback", 5))

        close = bars["close"]
        rsi = _rsi(close, rsi_period)
        short_sma = _sma(close, sma_strength)

        prev_close = close.shift(1)
        prev_short = short_sma.shift(1)

        # Was RSI in oversold territory within the last N bars?
        recently_oversold = (rsi.rolling(rsi_lookback, min_periods=1).min() <= oversold)

        # Price strength confirmation — close crosses up through 9-SMA
        price_strength = (close > short_sma) & (prev_close <= prev_short)

        # Entry: both conditions on the same bar
        entry = recently_oversold & price_strength

        # Exit: overbought (the "good deal" is gone) OR validation
        exit_overbought = rsi >= overbought
        validation = (close < short_sma) & (prev_close >= prev_short)

        signal = pd.Series(0, index=bars.index, dtype="int8")
        signal[entry] = 1
        signal[exit_overbought | validation] = -1
        return signal


rsi_mean_reversion = RsiGoodDeal(
    id="rsi_mean_reversion",
    name="RSI Good Deal + Price Strength (14, 30/70)",
    description="ZipTrader 05-03 — buys when RSI was recently oversold (≤30) AND price crosses back above the 9-SMA (price strength). Exits on RSI overbought (≥70) or close below the 9-SMA. RSI alone isn't enough; the price-vs-SMA cross is the elevating factor that confirms the reversal.",
    course_ref="05-03 + 05-02",
    own_params=[
        StrategyParam("rsi_period", "RSI period", "int", 14, min=2, max=50, step=1,
                      help="Lookback window for RSI calculation."),
        StrategyParam("oversold", "Oversold threshold", "number", 30, min=5, max=45, step=1,
                      help="RSI floor — qualifies the 'good deal' setup."),
        StrategyParam("overbought", "Overbought threshold", "number", 70, min=55, max=95, step=1,
                      help="RSI ceiling — exit when the good deal becomes a bad one."),
        StrategyParam("sma_strength", "Price-strength SMA", "int", 9, min=2, max=50, step=1,
                      help="The fast SMA used to confirm price strength. Cross above = entry confirmation; close below = exit."),
        StrategyParam("rsi_lookback", "Oversold lookback bars", "int", 5, min=1, max=30, step=1,
                      help="How recently RSI had to be oversold for the setup to still count."),
    ],
)
