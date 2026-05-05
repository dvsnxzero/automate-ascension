"""Strategy registry. Importing this module exposes `STRATEGIES`,
a dict keyed by `Strategy.id` for the API + engine to look up by id.

Phase A ships only `sma_crossover`. The other strategies from the spec
(`rsi_bounce`, `macd_momentum`, `value_dip`) drop in here in Phase B.
"""

from app.backtest.strategies.base import Strategy
from app.backtest.strategies.sma_crossover import sma_crossover

STRATEGIES: dict[str, Strategy] = {
    sma_crossover.id: sma_crossover,
}


def get_strategy(strategy_id: str) -> Strategy | None:
    return STRATEGIES.get(strategy_id)
