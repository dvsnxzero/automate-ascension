"""Live paper-execution engine.

Polls bars on a configured interval during regular trading hours,
evaluates the chosen strategy per symbol, and fires paper orders on
fresh signals. Single in-process singleton; state held in memory.

Not meant for live capital — uses Alpaca *paper* via the existing
alpaca_client. Position sizing is bounded by the virtual equity cap
in paper/routes.py so a runaway loop can't blow through more than the
user's configured paper budget.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import pandas as pd

from app.alpaca_client import get_alpaca
from app.backtest.strategies import get_strategy
from app.market.routes import _yahoo_bars
from app.runner import tax_rules

logger = logging.getLogger(__name__)


# ─── Market hours ─────────────────────────────────────────────

# US/Eastern offset. June is EDT (UTC-4); during DST transitions this
# would need pytz/zoneinfo, but for paper testing on Mag 7 a fixed
# offset is fine — at worst the runner is off by an hour twice a year.
_ET_OFFSET = timedelta(hours=-4)


def _days_since(iso_or_dt) -> int:
    """Best-effort holding-period days from an ISO timestamp or datetime.
    Returns 0 when missing so the engine falls into the short-term branch
    (the safer assumption for tax math)."""
    if not iso_or_dt:
        return 0
    if isinstance(iso_or_dt, str):
        try:
            dt = datetime.fromisoformat(iso_or_dt.replace("Z", "+00:00"))
        except ValueError:
            return 0
    else:
        dt = iso_or_dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - dt).days)


def _is_rth(now_utc: Optional[datetime] = None) -> bool:
    """True if NY market is in regular trading hours (9:30–16:00 ET, M–F)."""
    now_utc = now_utc or datetime.now(timezone.utc)
    et = now_utc + _ET_OFFSET
    if et.weekday() >= 5:  # Sat=5, Sun=6
        return False
    minutes = et.hour * 60 + et.minute
    return 9 * 60 + 30 <= minutes <= 16 * 60


# ─── Engine ───────────────────────────────────────────────────

MAG_7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]


class RunnerEngine:
    def __init__(self) -> None:
        self.status: str = "idle"  # idle | running | stopped | error
        self.task: Optional[asyncio.Task] = None
        self.watchlist: list[str] = list(MAG_7)
        self.strategy_id: str = "sma_crossover"
        self.params: dict[str, Any] = {}
        # 15min bars give ZipTrader 05-02 (9-SMA price strength) enough
        # density to fire signals during a single session while staying
        # below Yahoo's 60d intraday data window. Poll every 5min so the
        # log fills up visibly while testing.
        self.bar_interval: str = "15m"
        self.poll_seconds: int = 5 * 60
        self.last_tick: Optional[str] = None
        self.last_error: Optional[str] = None
        self.log: deque = deque(maxlen=200)
        # symbol -> ISO bar timestamp we last acted on (prevents re-firing)
        self.last_signal_bar: dict[str, str] = {}

    # ── lifecycle ──

    async def start(self) -> dict:
        if self.task and not self.task.done():
            return {"started": False, "reason": "already running", "status": self.status}
        self.status = "running"
        self.last_error = None
        self.task = asyncio.create_task(self._loop(), name="runner-loop")
        self._log(f"started: strategy={self.strategy_id} watchlist={self.watchlist} interval={self.bar_interval}")
        return {"started": True, "status": self.status}

    async def stop(self) -> dict:
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        self.status = "stopped"
        self._log("stopped")
        return {"stopped": True, "status": self.status}

    def get_status(self) -> dict:
        cfg = tax_rules.TaxConfig.from_settings()
        return {
            "status": self.status,
            "strategy_id": self.strategy_id,
            "watchlist": self.watchlist,
            "bar_interval": self.bar_interval,
            "poll_seconds": self.poll_seconds,
            "last_tick": self.last_tick,
            "last_error": self.last_error,
            "is_rth": _is_rth(),
            "log": list(self.log)[-50:],
            "guardrails": {
                "short_term_rate": cfg.short_term_rate,
                "long_term_rate": cfg.long_term_rate,
                "state_rate": cfg.state_rate,
                "min_after_tax_edge_pct": cfg.min_after_tax_edge_pct,
                "wash_sale_window_days": cfg.wash_sale_window_days,
                "pdt_enforcement": cfg.pdt_enforcement,
                "pdt_equity_floor": cfg.pdt_equity_floor,
            },
        }

    # ── core loop ──

    async def _loop(self) -> None:
        try:
            while True:
                if _is_rth():
                    try:
                        await self.tick()
                    except Exception as e:
                        logger.exception("runner tick failed")
                        self._log(f"tick error: {e}")
                else:
                    self._log("market closed, skipping tick")
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            self.status = "stopped"
            raise
        except Exception as e:
            self.status = "error"
            self.last_error = str(e)
            logger.exception("runner loop crashed")
            self._log(f"loop crashed: {e}")

    async def tick(self) -> None:
        al = get_alpaca()
        if al is None:
            self._log("alpaca not connected")
            return
        strategy = get_strategy(self.strategy_id)
        if strategy is None:
            self._log(f"unknown strategy: {self.strategy_id}")
            return

        positions = al.get_positions() or []
        held: dict[str, dict] = {
            p["symbol"]: {
                "qty": float(p.get("qty") or 0),
                "avg_entry_price": float(p.get("avg_entry_price") or 0),
                "entry_date": p.get("entry_date") or p.get("created_at"),
            }
            for p in positions if float(p.get("qty") or 0) > 0
        }

        acct = al.get_account() or {}
        bp = float(acct.get("buying_power") or 0)
        equity = float(acct.get("equity") or 0)
        per_slot = bp / max(1, len(self.watchlist))

        # Pull closed orders once per tick — used for wash-sale + PDT checks
        closed_orders = self._fetch_closed_orders(al)

        cfg = tax_rules.TaxConfig.from_settings()

        for symbol in self.watchlist:
            await self._evaluate_symbol(
                symbol, strategy, held, per_slot, al,
                closed_orders=closed_orders, equity=equity, cfg=cfg,
            )

        self.last_tick = datetime.now(timezone.utc).isoformat()

    def _fetch_closed_orders(self, al) -> list[dict]:
        try:
            orders = al.get_orders(status="closed", limit=200) or []
            return [o for o in orders if isinstance(o, dict)]
        except Exception as e:
            self._log(f"closed orders fetch failed: {e}")
            return []

    async def _evaluate_symbol(
        self,
        symbol: str,
        strategy,
        held: dict[str, dict],
        per_slot: float,
        al,
        closed_orders: list[dict] | None = None,
        equity: float = 0.0,
        cfg: "tax_rules.TaxConfig | None" = None,
    ) -> None:
        closed_orders = closed_orders or []
        cfg = cfg or tax_rules.TaxConfig.from_settings()
        try:
            bars_raw = await _yahoo_bars(symbol, self.bar_interval, 300)
        except Exception as e:
            self._log(f"{symbol}: bar fetch failed: {e}")
            return

        if not bars_raw or len(bars_raw) < 200:
            self._log(f"{symbol}: insufficient bars ({len(bars_raw or [])})")
            return

        df = pd.DataFrame(bars_raw)
        df["close"] = df["close"].astype(float)
        try:
            signal = strategy.signals(df, self.params)
        except Exception as e:
            self._log(f"{symbol}: signal calc failed: {e}")
            return

        non_zero = signal[signal != 0]
        if non_zero.empty:
            return

        last_idx = non_zero.index.max()
        sig_val = int(signal.loc[last_idx])
        bar_ts = str(df.loc[last_idx, "time"])
        last_price = float(df.loc[last_idx, "close"])

        if self.last_signal_bar.get(symbol) == bar_ts:
            return  # already acted on this bar

        if sig_val == 1 and symbol not in held:
            # Wash-sale guard — block a buy if we recently sold this name at a loss
            ws = tax_rules.evaluate_buy_wash_sale(symbol, closed_orders, cfg)
            if not ws["allow"]:
                self._log(f"{symbol}: BUY blocked — {ws['reason']}")
                self.last_signal_bar[symbol] = bar_ts
                return
            # PDT guard — only matters if equity < floor
            pdt = tax_rules.evaluate_pdt(equity, closed_orders, is_opening_trade=True, cfg=cfg)
            if not pdt["allow"]:
                self._log(f"{symbol}: BUY blocked — {pdt['reason']}")
                self.last_signal_bar[symbol] = bar_ts
                return

            shares = int(per_slot / last_price) if last_price > 0 else 0
            if shares < 1:
                self._log(f"{symbol}: BUY signal but slot too small (${per_slot:.0f} / ${last_price:.2f})")
                self.last_signal_bar[symbol] = bar_ts
                return
            res = al.place_stock_order(
                symbol=symbol, side="buy", qty=shares,
                order_type="limit",
                limit_price=round(last_price * 1.005, 2),
                time_in_force="day",
            )
            status = res.get("status") if isinstance(res, dict) else res
            err = res.get("error") if isinstance(res, dict) else None
            self._log(f"{symbol}: BUY {shares} @ ~${last_price:.2f} → {err or status}")
            self.last_signal_bar[symbol] = bar_ts

        elif sig_val == -1 and symbol in held:
            pos = held[symbol]
            qty = int(pos["qty"])
            if qty < 1:
                return
            entry_price = pos["avg_entry_price"] or last_price
            held_days = _days_since(pos.get("entry_date"))
            tax = tax_rules.evaluate_sell(entry_price, last_price, qty, held_days, cfg)
            if not tax["allow"]:
                self._log(
                    f"{symbol}: SELL deferred — {tax['reason']} "
                    f"(gross {tax.get('gross_pnl_pct')}% / net {tax.get('net_pnl_pct')}% @ {tax.get('term')}-term)"
                )
                self.last_signal_bar[symbol] = bar_ts
                return

            res = al.place_stock_order(
                symbol=symbol, side="sell", qty=qty,
                order_type="limit",
                limit_price=round(last_price * 0.995, 2),
                time_in_force="day",
            )
            status = res.get("status") if isinstance(res, dict) else res
            err = res.get("error") if isinstance(res, dict) else None
            tax_note = f" [{tax.get('term','?')}-term, net {tax.get('net_pnl_pct')}%]" if tax.get("is_gain") else ""
            self._log(f"{symbol}: SELL {qty} @ ~${last_price:.2f}{tax_note} → {err or status}")
            self.last_signal_bar[symbol] = bar_ts

    # ── log helper ──

    def _log(self, msg: str) -> None:
        entry = {"ts": datetime.now(timezone.utc).isoformat(), "msg": msg}
        self.log.append(entry)
        logger.info("runner: %s", msg)


# Module-level singleton — one runner per process.
ENGINE = RunnerEngine()
