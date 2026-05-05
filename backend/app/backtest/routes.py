"""BacktestLab API.

Endpoints (mounted under /api/backtest):
    GET    /strategies              — list available strategies + param schemas
    POST   /run                     — run a strategy and (optionally) persist
    GET    /runs                    — list saved runs (lightweight)
    GET    /runs/{id}               — full run detail incl. trades + equity curve
    PATCH  /runs/{id}               — update label / notes / pinned flag
    DELETE /runs/{id}               — delete (cascades trades)
    POST   /runs/{id}/rerun         — re-run with the saved params against latest bars
"""

from __future__ import annotations

import logging
import math
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session


# Maximum equity-curve points to persist or return. The full curve can run
# tens of thousands of points on intraday backtests; even-stride decimation
# down to this cap keeps DB rows + JSON payloads bounded without distorting
# the visual shape of the curve.
EQUITY_CURVE_MAX_POINTS = 2000


def _decimate_curve(curve: list, max_points: int = EQUITY_CURVE_MAX_POINTS) -> list:
    """Even-stride down-sampling. Always keeps the final point so the
    end-of-period equity reads correctly in the UI. Strictly ≤ max_points."""
    n = len(curve)
    if n <= max_points:
        return list(curve)
    # Reserve one slot for the appended final point so the cap is hard.
    stride = math.ceil(n / (max_points - 1))
    sampled = list(curve[::stride])
    if sampled[-1] is not curve[-1]:
        sampled.append(curve[-1])
    return sampled

from app.database import get_db
from app.backtest.engine import run_backtest
from app.backtest.metrics import compute_metrics
from app.backtest.models import BacktestRun, BacktestTrade
from app.backtest.strategies import STRATEGIES, get_strategy
from app.market.routes import fetch_bars_range

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ───

class RunRequest(BaseModel):
    symbol: str
    strategy_id: str
    params: dict = Field(default_factory=dict)
    start_date: date
    end_date: date
    interval: str = "1d"
    capital: float = 10000
    risk_pct: float = 1.0
    label: str | None = None
    persist: bool = True
    notes: str | None = None


class RunPatch(BaseModel):
    label: str | None = None
    notes: str | None = None
    is_pinned: bool | None = None


# ─── Helpers ───

def _trade_to_dict(t: dict | BacktestTrade) -> dict:
    if isinstance(t, BacktestTrade):
        return {
            "id": t.id,
            "entry_time": t.entry_time.isoformat() if t.entry_time else None,
            "entry_price": t.entry_price,
            "exit_time": t.exit_time.isoformat() if t.exit_time else None,
            "exit_price": t.exit_price,
            "shares": t.shares,
            "pnl": t.pnl,
            "pnl_pct": t.pnl_pct,
            "exit_reason": t.exit_reason,
            "hold_bars": t.hold_bars,
        }
    return {
        "entry_time": t["entry_time"].isoformat() if t["entry_time"] else None,
        "entry_price": t["entry_price"],
        "exit_time": t["exit_time"].isoformat() if t["exit_time"] else None,
        "exit_price": t["exit_price"],
        "shares": t["shares"],
        "pnl": t["pnl"],
        "pnl_pct": t["pnl_pct"],
        "exit_reason": t["exit_reason"],
        "hold_bars": t["hold_bars"],
    }


def _run_summary(run: BacktestRun) -> dict:
    """Lightweight payload for list views — omits trades + equity curve."""
    return {
        "id": run.id,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "label": run.label,
        "symbol": run.symbol,
        "strategy_id": run.strategy_id,
        "params": run.params,
        "interval": run.interval,
        "start_date": run.start_date.isoformat() if run.start_date else None,
        "end_date": run.end_date.isoformat() if run.end_date else None,
        "capital": run.capital,
        "risk_pct": run.risk_pct,
        "data_source": run.data_source,
        "metrics": run.metrics,
        "is_pinned": run.is_pinned,
        "notes": run.notes,
    }


def _run_full(run: BacktestRun) -> dict:
    return {
        **_run_summary(run),
        "trades": [_trade_to_dict(t) for t in run.trades],
        "equity_curve": [{"time": pt[0], "value": pt[1]} for pt in (run.equity_curve or [])],
    }


async def _execute_run(req: RunRequest) -> dict:
    """Shared run path used by both /run and /rerun. Returns a dict ready to
    return to the caller; persistence is handled by the caller."""
    strat = get_strategy(req.strategy_id)
    if not strat:
        raise HTTPException(status_code=404, detail=f"Unknown strategy: {req.strategy_id}")

    if req.end_date <= req.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    if req.capital <= 0:
        raise HTTPException(status_code=400, detail="capital must be > 0")
    if req.risk_pct <= 0 or req.risk_pct > 100:
        raise HTTPException(status_code=400, detail="risk_pct must be in (0, 100]")

    bars, source = await fetch_bars_range(req.symbol, req.interval, req.start_date, req.end_date)
    if not bars:
        raise HTTPException(
            status_code=502,
            detail=f"No bars returned for {req.symbol} {req.interval} {req.start_date}..{req.end_date}",
        )

    df = pd.DataFrame(bars)
    for col in ("open", "high", "low", "close"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)

    # Merge defaults with user params so the engine always sees a complete dict.
    full_params = {p.name: p.default for p in strat.params}
    full_params.update(req.params or {})

    result = run_backtest(
        bars=df,
        strategy=strat,
        params=full_params,
        capital=float(req.capital),
        risk_pct=float(req.risk_pct),
        interval=req.interval,
    )
    # Compute metrics on the FULL curve (max drawdown loses precision if you
    # decimate first), then cap the curve we persist + send to the client.
    metrics = compute_metrics(result.trades, result.equity_curve, float(req.capital))
    capped_curve = _decimate_curve(result.equity_curve)

    return {
        "symbol": req.symbol.upper(),
        "strategy_id": req.strategy_id,
        "params": full_params,
        "interval": req.interval,
        "start_date": req.start_date.isoformat(),
        "end_date": req.end_date.isoformat(),
        "capital": float(req.capital),
        "risk_pct": float(req.risk_pct),
        "data_source": source or "unknown",
        "trades": result.trades,
        "equity_curve": capped_curve,
        "metrics": metrics,
    }


# ─── Endpoints ───

@router.get("/strategies")
async def list_strategies():
    return {"strategies": [s.to_dict() for s in STRATEGIES.values()]}


@router.post("/run")
async def run(req: RunRequest, db: Session = Depends(get_db)):
    raw = await _execute_run(req)
    response = {
        **raw,
        "trades": [_trade_to_dict(t) for t in raw["trades"]],
        "equity_curve": [{"time": pt[0], "value": pt[1]} for pt in raw["equity_curve"]],
    }

    if req.persist:
        run_row = BacktestRun(
            label=req.label,
            symbol=raw["symbol"],
            strategy_id=raw["strategy_id"],
            params=raw["params"],
            interval=raw["interval"],
            start_date=req.start_date,
            end_date=req.end_date,
            capital=raw["capital"],
            risk_pct=raw["risk_pct"],
            data_source=raw["data_source"],
            metrics=raw["metrics"],
            equity_curve=raw["equity_curve"],
            notes=req.notes,
        )
        for t in raw["trades"]:
            run_row.trades.append(BacktestTrade(
                entry_time=t["entry_time"],
                entry_price=t["entry_price"],
                exit_time=t["exit_time"],
                exit_price=t["exit_price"],
                shares=t["shares"],
                pnl=t["pnl"],
                pnl_pct=t["pnl_pct"],
                exit_reason=t["exit_reason"],
                hold_bars=t["hold_bars"],
            ))
        db.add(run_row)
        db.commit()
        db.refresh(run_row)
        response["run_id"] = run_row.id
        response["created_at"] = run_row.created_at.isoformat() if run_row.created_at else None
        response["is_pinned"] = run_row.is_pinned
        response["notes"] = run_row.notes
        response["label"] = run_row.label

    return response


@router.get("/runs")
async def list_runs(
    symbol: str | None = None,
    strategy_id: str | None = None,
    pinned: bool | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(BacktestRun)
    if symbol:
        q = q.filter(BacktestRun.symbol == symbol.upper())
    if strategy_id:
        q = q.filter(BacktestRun.strategy_id == strategy_id)
    if pinned is not None:
        q = q.filter(BacktestRun.is_pinned == pinned)

    rows = q.order_by(BacktestRun.is_pinned.desc(), BacktestRun.created_at.desc()).limit(limit).all()
    return {"runs": [_run_summary(r) for r in rows]}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_full(run)


@router.patch("/runs/{run_id}")
async def patch_run(run_id: int, patch: RunPatch, db: Session = Depends(get_db)):
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if patch.label is not None:
        run.label = patch.label
    if patch.notes is not None:
        run.notes = patch.notes
    if patch.is_pinned is not None:
        run.is_pinned = patch.is_pinned

    db.commit()
    db.refresh(run)
    return _run_summary(run)


@router.delete("/runs/{run_id}")
async def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()
    return {"deleted": run_id}


@router.post("/runs/{run_id}/rerun")
async def rerun(run_id: int, db: Session = Depends(get_db)):
    """Re-execute a saved run against the latest bars.

    Anchors the original `start_date` and extends `end_date` to today, so the
    rerun strictly contains the original window. Original run is preserved
    for comparison.
    """
    run = db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    new_end = date.today()
    if new_end <= run.start_date:
        raise HTTPException(
            status_code=400,
            detail="Cannot rerun: today is on or before the original start_date",
        )

    req = RunRequest(
        symbol=run.symbol,
        strategy_id=run.strategy_id,
        params=run.params,
        start_date=run.start_date,
        end_date=new_end,
        interval=run.interval,
        capital=run.capital,
        risk_pct=run.risk_pct,
        label=f"{run.label or run.symbol + ' ' + run.strategy_id} (rerun)",
        persist=True,
    )
    return await run_endpoint_passthrough(req, db)


async def run_endpoint_passthrough(req: RunRequest, db: Session) -> dict:
    """Internal helper that mirrors `/run` so /rerun stays in one code path."""
    return await run(req, db)
