"""RSI Mean Reversion — counter-trend bounce play.

Enter long when RSI crosses up through the oversold threshold (i.e. was
oversold and is now turning back up). Exit when RSI crosses above the
overbought threshold OR drifts back down through the midline (50) after
entry — whichever comes first. Engine-level stop / target / time-stop
still apply on top.
"""

import pandas as pd

from app.backtest.strategies.base import Strategy, StrategyParam
from app.strategy.indicators import _rsi


class RsiMeanReversion(Strategy):
    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        period = int(params.get("rsi_period", 14))
        oversold = float(params.get("oversold", 30))
        overbought = float(params.get("overbought", 70))
        exit_midline = float(params.get("exit_midline", 50))

        rsi = _rsi(bars["close"], period)
        prev_rsi = rsi.shift(1)

        # Entry: was at-or-below oversold, now crossing back above it
        entry = (prev_rsi <= oversold) & (rsi > oversold)

        # Exit: hit overbought, or fell back below the midline after recovering
        exit_overbought = rsi >= overbought
        exit_fade = (prev_rsi >= exit_midline) & (rsi < exit_midline)

        signal = pd.Series(0, index=bars.index, dtype="int8")
        signal[entry] = 1
        signal[exit_overbought | exit_fade] = -1
        return signal


rsi_mean_reversion = RsiMeanReversion(
    id="rsi_mean_reversion",
    name="RSI Mean Reversion (14, 30/70)",
    description="Buys oversold reversals (RSI crosses up through 30). Exits on overbought (70) or fade back through 50. Counter-trend — works best in range-bound names; expect more whipsaws on strong trends.",
    course_ref="custom",
    own_params=[
        StrategyParam("rsi_period", "RSI period", "int", 14, min=2, max=50, step=1,
                      help="Lookback window for RSI calculation."),
        StrategyParam("oversold", "Oversold threshold", "number", 30, min=5, max=45, step=1,
                      help="Entry trigger — long when RSI crosses up through this level."),
        StrategyParam("overbought", "Overbought threshold", "number", 70, min=55, max=95, step=1,
                      help="Exit trigger — close when RSI reaches this level."),
        StrategyParam("exit_midline", "Exit midline", "number", 50, min=40, max=60, step=1,
                      help="Secondary exit — close if RSI fades back below this after entry."),
    ],
)
