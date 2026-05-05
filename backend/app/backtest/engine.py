"""Single-symbol, long-only backtest engine.

Vectorized signal generation, then a single-pass loop over bars to manage
position state. Entries fill at the NEXT bar's open (no peeking at the
current close), and stop/target/time-stop exits intra-bar are checked in
priority order to keep results conservative.

Position sizing is risk-based:
    risk_amount   = capital * risk_pct / 100
    stop_distance = entry_price - stop_price
    shares        = floor(risk_amount / stop_distance)

If `shares == 0`, the trade is recorded with `exit_reason="skipped_too_risky"`
so the user can see how often a strategy generates signals they can't afford.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd

from app.backtest.strategies.base import Strategy


# RTH-only bars per trading day, used to convert `time_stop_days` → bar count.
# 1d=1, 1h=6.5 (regular session), 5m=78, 1m=390, etc. Anything not listed
# falls back to 1d behavior (one bar per day).
_BARS_PER_TRADING_DAY: dict[str, float] = {
    "1m": 390,
    "5m": 78,
    "15m": 26,
    "30m": 13,
    "1h": 6.5,
    "4h": 1.625,  # 6.5 / 4
    "1d": 1,
    "1w": 0.2,    # 5 trading days per week
}


def _time_stop_bars(time_stop_days: int, interval: str) -> int:
    """Convert a user-set time-stop in trading days into a bar count for the
    given interval. Rounded to the nearest int; minimum of 1 bar."""
    multiplier = _BARS_PER_TRADING_DAY.get(interval, 1)
    return max(1, int(round(time_stop_days * multiplier)))


@dataclass
class _Position:
    entry_idx: int
    entry_time: datetime
    entry_price: float
    shares: int
    stop_price: float
    target_price: float
    time_stop_idx: int


@dataclass
class EngineResult:
    trades: list[dict] = field(default_factory=list)
    equity_curve: list[tuple[int, float]] = field(default_factory=list)


def _coerce_scalar(ts):
    """Unwrap numpy scalars (np.int64, np.float64) to native Python types so
    isinstance(..., int) works reliably."""
    if hasattr(ts, "item") and not isinstance(ts, (datetime, pd.Timestamp)):
        try:
            return ts.item()
        except (ValueError, AttributeError):
            return ts
    return ts


def _to_unix(ts) -> int:
    """Coerce a pandas/datetime-ish value into a unix epoch int."""
    ts = _coerce_scalar(ts)
    if isinstance(ts, bool):
        return int(ts)
    if isinstance(ts, (int, float)):
        return int(ts)
    if isinstance(ts, pd.Timestamp):
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        return int(ts.timestamp())
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return int(ts.timestamp())
    return int(pd.Timestamp(ts, tz="UTC").timestamp())


def _to_dt(ts) -> datetime:
    ts = _coerce_scalar(ts)
    if isinstance(ts, datetime):
        return ts.replace(tzinfo=None) if ts.tzinfo else ts
    if isinstance(ts, pd.Timestamp):
        return ts.to_pydatetime().replace(tzinfo=None)
    if isinstance(ts, (int, float)):
        return datetime.utcfromtimestamp(int(ts))
    return pd.Timestamp(ts).to_pydatetime().replace(tzinfo=None)


def run_backtest(
    bars: pd.DataFrame,
    strategy: Strategy,
    params: dict,
    capital: float,
    risk_pct: float,
    interval: str = "1d",
) -> EngineResult:
    """Run `strategy` over `bars` and return trades + equity curve.

    `bars` must have columns: time (unix int OR pandas Timestamp), open, high,
    low, close. Index is reset to ints inside the engine. `interval` is used
    to convert `time_stop_days` (a user-friendly param) into a bar count.
    """
    if bars.empty:
        return EngineResult()

    bars = bars.reset_index(drop=True).copy()
    signals = strategy.signals(bars, params).fillna(0).astype(int)

    stop_pct = float(params.get("stop_pct", 5)) / 100.0
    target_pct = float(params.get("target_pct", 10)) / 100.0
    time_stop_bars = _time_stop_bars(int(params.get("time_stop_days", 50)), interval)

    equity_curve: list[tuple[int, float]] = []
    trades: list[dict] = []

    cash = float(capital)
    position: _Position | None = None
    n = len(bars)

    def _close(pos: _Position, exit_idx: int, exit_price: float, exit_reason: str) -> dict:
        exit_time = _to_dt(bars.at[exit_idx, "time"])
        pnl = (exit_price - pos.entry_price) * pos.shares
        pnl_pct = ((exit_price - pos.entry_price) / pos.entry_price) * 100 if pos.entry_price else 0.0
        return {
            "entry_time": pos.entry_time,
            "entry_price": round(pos.entry_price, 4),
            "exit_time": exit_time,
            "exit_price": round(exit_price, 4),
            "shares": pos.shares,
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 4),
            "exit_reason": exit_reason,
            "hold_bars": exit_idx - pos.entry_idx,
        }

    for i in range(n):
        bar = bars.iloc[i]
        bar_time_unix = _to_unix(bar["time"])

        if position is not None:
            # Exits checked in priority order: stop > target > time_stop > strategy_exit.
            if bar["low"] <= position.stop_price:
                fill = position.stop_price
                trade = _close(position, i, fill, "stop")
                cash += fill * position.shares
                trades.append(trade)
                position = None
            elif bar["high"] >= position.target_price:
                fill = position.target_price
                trade = _close(position, i, fill, "target")
                cash += fill * position.shares
                trades.append(trade)
                position = None
            elif i >= position.time_stop_idx:
                fill = float(bar["close"])
                trade = _close(position, i, fill, "time_stop")
                cash += fill * position.shares
                trades.append(trade)
                position = None
            elif signals.iat[i] == -1:
                fill = float(bar["close"])
                trade = _close(position, i, fill, "signal")
                cash += fill * position.shares
                trades.append(trade)
                position = None

        if position is None and signals.iat[i] == 1 and i + 1 < n:
            # Fill at next bar's open for realism — no current-bar peeking.
            entry_idx = i + 1
            entry_price = float(bars.iloc[entry_idx]["open"])
            stop_price = entry_price * (1 - stop_pct)
            target_price = entry_price * (1 + target_pct)
            stop_distance = entry_price - stop_price
            risk_amount = cash * (risk_pct / 100)
            shares = int(math.floor(risk_amount / stop_distance)) if stop_distance > 0 else 0

            if shares <= 0:
                trades.append({
                    "entry_time": _to_dt(bars.at[entry_idx, "time"]),
                    "entry_price": round(entry_price, 4),
                    "exit_time": None,
                    "exit_price": None,
                    "shares": 0,
                    "pnl": 0.0,
                    "pnl_pct": 0.0,
                    "exit_reason": "skipped_too_risky",
                    "hold_bars": 0,
                })
            else:
                cost = entry_price * shares
                if cost > cash:
                    # Risk math passed but cash can't cover the position.
                    affordable = int(math.floor(cash / entry_price))
                    if affordable <= 0:
                        trades.append({
                            "entry_time": _to_dt(bars.at[entry_idx, "time"]),
                            "entry_price": round(entry_price, 4),
                            "exit_time": None,
                            "exit_price": None,
                            "shares": 0,
                            "pnl": 0.0,
                            "pnl_pct": 0.0,
                            "exit_reason": "skipped_too_risky",
                            "hold_bars": 0,
                        })
                        equity_curve.append((bar_time_unix, round(cash, 2)))
                        continue
                    shares = affordable
                    cost = entry_price * shares

                cash -= cost
                position = _Position(
                    entry_idx=entry_idx,
                    entry_time=_to_dt(bars.at[entry_idx, "time"]),
                    entry_price=entry_price,
                    shares=shares,
                    stop_price=stop_price,
                    target_price=target_price,
                    time_stop_idx=entry_idx + time_stop_bars,
                )

        # Mark equity at this bar's close.
        equity = cash + (position.shares * float(bar["close"]) if position else 0)
        equity_curve.append((bar_time_unix, round(equity, 2)))

    # Close any open position at the final bar's close so the curve is honest.
    if position is not None:
        last_idx = n - 1
        fill = float(bars.iloc[last_idx]["close"])
        trade = _close(position, last_idx, fill, "open_at_end")
        cash += fill * position.shares
        trades.append(trade)
        # Replace last equity point with the post-close cash value.
        if equity_curve:
            equity_curve[-1] = (equity_curve[-1][0], round(cash, 2))
        position = None

    return EngineResult(trades=trades, equity_curve=equity_curve)
