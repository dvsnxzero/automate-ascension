"""Runner control surface — start/stop/status the live paper executor."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.runner.engine import ENGINE, MAG_7
from app.backtest.strategies import STRATEGIES

router = APIRouter()


class RunnerConfig(BaseModel):
    strategy_id: Optional[str] = None
    watchlist: Optional[list[str]] = None
    bar_interval: Optional[str] = None
    poll_seconds: Optional[int] = None
    params: Optional[dict] = None


@router.get("/status")
async def status():
    return ENGINE.get_status()


@router.post("/start")
async def start(cfg: RunnerConfig = RunnerConfig()):
    if cfg.strategy_id is not None:
        if cfg.strategy_id not in STRATEGIES:
            return {"started": False, "error": f"unknown strategy: {cfg.strategy_id}"}
        ENGINE.strategy_id = cfg.strategy_id
    if cfg.watchlist is not None:
        ENGINE.watchlist = [s.upper() for s in cfg.watchlist] or list(MAG_7)
    if cfg.bar_interval is not None:
        ENGINE.bar_interval = cfg.bar_interval
    if cfg.poll_seconds is not None:
        ENGINE.poll_seconds = max(60, int(cfg.poll_seconds))
    if cfg.params is not None:
        ENGINE.params = cfg.params
    return await ENGINE.start()


@router.post("/stop")
async def stop():
    return await ENGINE.stop()


@router.post("/tick")
async def tick_once():
    """Manual single-tick for debugging without waiting for the next poll."""
    try:
        await ENGINE.tick()
        return {"ok": True, "last_tick": ENGINE.last_tick}
    except Exception as e:
        return {"ok": False, "error": str(e)}
