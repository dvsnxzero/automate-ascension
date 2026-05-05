"""Strategy interface — every backtestable rule set conforms to this shape.

A strategy converts a bar DataFrame into a signal Series of {1, -1, 0}:
  1  → enter long on this bar (the engine fills on the NEXT bar's open)
 -1  → close long on this bar
  0  → hold

The engine handles position sizing, stops, targets, and time-stops, so
strategies focus only on the entry/exit logic from the course material.
"""

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class StrategyParam:
    name: str
    label: str
    type: str  # "number" | "int" | "select"
    default: Any
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list | None = None
    help: str | None = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "type": self.type,
            "default": self.default,
            "min": self.min,
            "max": self.max,
            "step": self.step,
            "options": self.options,
            "help": self.help,
        }


# Common params every strategy inherits — the engine reads these directly.
COMMON_PARAMS: list[StrategyParam] = [
    StrategyParam("stop_pct", "Stop loss %", "number", 5, min=0.1, max=50, step=0.1,
                  help="Hard stop distance below entry."),
    StrategyParam("target_pct", "Take-profit %", "number", 10, min=0.1, max=200, step=0.1,
                  help="Take-profit distance above entry."),
    StrategyParam("time_stop_days", "Time stop (trading days)", "int", 50, min=1, max=500, step=1,
                  help="Force exit after this many trading days regardless of price. The engine converts to bars based on interval (RTH only)."),
]


@dataclass
class Strategy:
    id: str
    name: str
    description: str
    course_ref: str
    own_params: list[StrategyParam] = field(default_factory=list)

    @property
    def params(self) -> list[StrategyParam]:
        return [*self.own_params, *COMMON_PARAMS]

    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        """Override in subclasses. Return a Series indexed like `bars`
        with values in {-1, 0, 1}."""
        raise NotImplementedError

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "course_ref": self.course_ref,
            "params": [p.to_dict() for p in self.params],
        }
