"""Strategy registry. Importing this module exposes `STRATEGIES`,
a dict keyed by `Strategy.id` for the API + engine to look up by id.
"""

from app.backtest.strategies.base import Strategy
from app.backtest.strategies.sma_crossover import sma_crossover
from app.backtest.strategies.rsi_mean_reversion import rsi_mean_reversion

STRATEGIES: dict[str, Strategy] = {
    sma_crossover.id: sma_crossover,
    rsi_mean_reversion.id: rsi_mean_reversion,
}


def get_strategy(strategy_id: str) -> Strategy | None:
    return STRATEGIES.get(strategy_id)
