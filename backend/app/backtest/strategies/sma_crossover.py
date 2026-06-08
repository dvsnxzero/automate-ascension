"""9/180 SMA Confirmation & Validation — ZipTrader Module 05-02.

Course-accurate implementation. ZipTrader's SMA strategy is NOT the classic
SMA-vs-SMA "golden cross"; it's PRICE-vs-SMA:

  - Short SMA (9, "price strength"): when close crosses above this, that's
    "confirmation" — a long entry candidate.
  - Long SMA (180, "directional strength"): a regime filter — only take
    confirmations while price holds above this long-term line.
  - Validation: the first candlestick that closes BELOW the short SMA is a
    "validation point" — a signal to reassess and exit. (Engine-level
    stop/target/time-stop still apply on top.)

Course refs:
  - 05-02 "SMA: Finding Entry & Exit Points" (confirmation/validation)
  - 05-12 "When To Exit: Cutting Losses & Taking Profits" (validation as exit)
"""

import pandas as pd

from app.backtest.strategies.base import Strategy, StrategyParam
from app.strategy.indicators import _sma


class SmaConfirmationValidation(Strategy):
    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        short = int(params.get("sma_short", 9))
        long = int(params.get("sma_long", 180))

        close = bars["close"]
        short_sma = _sma(close, short)
        long_sma = _sma(close, long)

        prev_close = close.shift(1)
        prev_short = short_sma.shift(1)

        # Confirmation: close crosses up through the short SMA
        confirmation = (close > short_sma) & (prev_close <= prev_short)

        # Validation: close closes below the short SMA after being above it
        validation = (close < short_sma) & (prev_close >= prev_short)

        # Directional strength filter — only enter while above the long SMA
        regime_ok = close > long_sma

        signal = pd.Series(0, index=bars.index, dtype="int8")
        signal[confirmation & regime_ok] = 1
        signal[validation] = -1
        return signal


sma_crossover = SmaConfirmationValidation(
    id="sma_crossover",
    name="SMA Confirmation/Validation (9/180)",
    description="ZipTrader 05-02 — long on price closing above the 9-SMA (confirmation) while above the 180-SMA (directional strength). Exits on the first close below the 9-SMA (validation). Stop / target / time-stop layered on top.",
    course_ref="05-02",
    own_params=[
        StrategyParam("sma_short", "Short SMA (price strength)", "int", 9, min=2, max=50, step=1,
                      help="Fast SMA — close crossing above this is confirmation; closing back below is validation."),
        StrategyParam("sma_long", "Long SMA (directional)", "int", 180, min=20, max=400, step=1,
                      help="Slow SMA — regime filter. Confirmations are ignored when price is below it."),
    ],
)
