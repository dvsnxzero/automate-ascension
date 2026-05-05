"""Headline performance metrics for a completed backtest run.

Inputs are the engine's raw outputs (trades + equity curve); outputs are a
plain JSON-friendly dict the API and frontend consume directly.
"""

from __future__ import annotations

import math
from typing import Iterable


def _safe_div(num: float, den: float) -> float | None:
    if den == 0 or den is None:
        return None
    return num / den


def compute_metrics(
    trades: list[dict],
    equity_curve: list[tuple[int, float]],
    starting_capital: float,
) -> dict:
    closed = [t for t in trades if t["exit_price"] is not None and t["exit_reason"] != "skipped_too_risky"]
    skipped = [t for t in trades if t["exit_reason"] == "skipped_too_risky"]

    n_trades = len(closed)
    wins = [t for t in closed if t["pnl"] > 0]
    losses = [t for t in closed if t["pnl"] < 0]

    win_rate = _safe_div(len(wins), n_trades) if n_trades else None
    avg_win = _safe_div(sum(t["pnl"] for t in wins), len(wins)) if wins else 0.0
    avg_loss = _safe_div(sum(t["pnl"] for t in losses), len(losses)) if losses else 0.0
    gross_profit = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    profit_factor = _safe_div(gross_profit, gross_loss) if gross_loss else None

    total_pnl = sum(t["pnl"] for t in closed)
    final_equity = equity_curve[-1][1] if equity_curve else starting_capital
    total_return_pct = _safe_div(final_equity - starting_capital, starting_capital)
    if total_return_pct is not None:
        total_return_pct *= 100

    # Max drawdown — peak-to-trough on the equity curve, returned as negative %.
    peak = starting_capital
    max_dd_pct = 0.0
    for _, value in equity_curve:
        if value > peak:
            peak = value
        if peak > 0:
            dd = (value - peak) / peak * 100
            if dd < max_dd_pct:
                max_dd_pct = dd

    # Sharpe (per-trade, not annualized) — coarse but useful at a glance.
    if n_trades >= 2:
        returns = [t["pnl_pct"] for t in closed]
        mean_r = sum(returns) / len(returns)
        var = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
        std = math.sqrt(var) if var > 0 else 0
        sharpe = _safe_div(mean_r, std) if std else None
    else:
        sharpe = None

    avg_hold = _safe_div(sum(t["hold_bars"] for t in closed), n_trades) if n_trades else None

    return {
        "trade_count": n_trades,
        "skipped_count": len(skipped),
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(win_rate, 4) if win_rate is not None else None,
        "avg_win": round(avg_win, 2) if avg_win else 0.0,
        "avg_loss": round(avg_loss, 2) if avg_loss else 0.0,
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor is not None else None,
        "total_pnl": round(total_pnl, 2),
        "total_return_pct": round(total_return_pct, 2) if total_return_pct is not None else None,
        "final_equity": round(final_equity, 2),
        "starting_capital": round(starting_capital, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "avg_hold_bars": round(avg_hold, 1) if avg_hold is not None else None,
    }
