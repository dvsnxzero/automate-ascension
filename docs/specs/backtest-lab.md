# BacktestLab — Spec

**Status:** ready to implement
**Owner:** AJ
**Last updated:** 2026-05-05

## Goal

Turn the "Coming soon" BacktestLab card into a working strategy testing surface so AJ can validate ZipTrader rules against real historical bars before risking capital.

This is the closing half of the feedback loop: scanners surface candidates, the chart shows context, the journal records outcomes — but **nothing currently tells you whether your strategy actually has an edge.** BacktestLab fills that gap.

## Non-goals (don't sprawl)

- Portfolio-level / multi-symbol simulation (single ticker only for v1)
- Walk-forward optimization, parameter sweep, Monte Carlo
- Slippage, commissions, taxes — assume zero for v1; add a flat-fee toggle in v2
- Live signal generation (scanners already cover that)
- Real-money order routing (Phase 5 unrelated)

## Data sources (bars)

Re-use the existing market data layer with this priority:

1. **Webull** (primary) — for any range Webull's API actually serves. Fast, accurate, matches what AJ trades against in paper mode.
2. **Yahoo Finance** (fallback) — when Webull returns empty bars or the requested window predates Webull's history. Yahoo has multi-decade daily data, fine for backtests.
3. Backend records which source served each backtest in `BacktestRun.data_source` so AJ can tell at a glance whether a result came from Webull or Yahoo.

The fallback chain already exists for `getBars` in `app/market/routes.py` — extend it (don't duplicate it).

## Position sizing

Risk-based. This is the standard for novice and automated platforms (TradingView, Webull paper, etc.) because it forces consistent risk per trade regardless of stop distance.

```
risk_amount   = capital * (risk_pct / 100)        # e.g. 10000 * 0.01 = $100
stop_distance = entry_price - stop_price          # e.g. $5 risk per share
shares        = floor(risk_amount / stop_distance) # 100 / 5 = 20 shares
```

If `shares == 0` (stop too far from entry given account size), the trade is skipped and recorded as `exit_reason: "skipped_too_risky"` so AJ can see how often a strategy generates signals he can't afford to take.

---

## User flow

1. AJ opens `/backtest`, sees a left sidebar of strategies + a right empty results panel.
2. Picks a strategy (e.g. "9/180 SMA Crossover"). Strategy params appear inline (SMA short, SMA long, stop %, target %).
3. Picks symbol (default `SPY`), interval (default `1d` for backtests since intraday history is limited), date range (default last 12 months), starting capital (default $10,000), risk per trade (default 1%).
4. Hits **Run**. Branded `<PageLoader variant="inline" />` appears in the results panel.
5. Backend runs the strategy over historical bars, returns trades + equity curve + metrics.
6. Results render: headline metric tiles, equity curve chart, sortable trade table, win/loss histogram.
7. AJ can **Save preset** — strategy + params get stored in `localStorage` and appear in a "Recent" list for one-click re-run.
8. AJ can re-run with tweaked params; previous run stays visible underneath as a faded comparison line on the equity curve.

---

## Strategies to ship in v1

Pick from `ziptrader-course-notes/`. Implement four:

| ID | Name | Course module | Notes |
|---|---|---|---|
| `sma_crossover` | 9/180 SMA Crossover | 05-02 | Long when 9-SMA crosses above 180-SMA AND price > 180-SMA. Exit on cross-back or stop. |
| `rsi_bounce` | RSI Oversold Bounce | 05-03 | Long when RSI(14) crosses up through 30 AND price > 9-SMA. Exit at RSI > 70 or stop. |
| `macd_momentum` | MACD Bullish Crossover | 05-04 | Long when MACD line crosses above signal AND histogram positive AND volume > 1.5× 20-day avg. Exit on bearish cross or stop. |
| `value_dip` | Value Dipping | 10-* | Long when price drops ≥ X% from 20-day high AND RSI < 35. Exit at +Y% or stop. |

All strategies accept these common params: `stop_pct` (default 5), `target_pct` (default 10), `time_stop_bars` (default 50, exits after N bars no matter what).

---

## Backend

### Files to create

```
backend/app/backtest/
  __init__.py                # already exists, empty
  engine.py                  # core simulation loop (NEW)
  models.py                  # BacktestRun + BacktestTrade tables (NEW)
  strategies/
    __init__.py              # registry (NEW)
    base.py                  # Strategy base class (NEW)
    sma_crossover.py         # (NEW)
    rsi_bounce.py            # (NEW)
    macd_momentum.py         # (NEW)
    value_dip.py             # (NEW)
  metrics.py                 # win rate, Sharpe, drawdown, etc. (NEW)
  routes.py                  # FastAPI endpoints (NEW)
```

Wire `routes.py` into `app/main.py` under `/api/backtest`.

### Persistence (Postgres on Railway, SQLite locally)

Re-use `app/database.py` — it already detects `DATABASE_URL` and falls back to SQLite for dev. Add new tables in `app/backtest/models.py` extending the existing `Base`:

```python
class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)
    label: Mapped[str | None]                # user-set, optional ("SPY 9/180 baseline")
    symbol: Mapped[str] = mapped_column(index=True)
    strategy_id: Mapped[str] = mapped_column(index=True)
    params: Mapped[dict] = mapped_column(JSON)              # strategy params at run time
    interval: Mapped[str]                                    # "1d", "5m", etc.
    start_date: Mapped[date]
    end_date: Mapped[date]
    capital: Mapped[float]
    risk_pct: Mapped[float]
    data_source: Mapped[str]                                # "webull" | "yahoo"
    metrics: Mapped[dict] = mapped_column(JSON)             # full metrics blob
    equity_curve: Mapped[list] = mapped_column(JSON)        # [[ts, value], ...] — keep on row, no separate table
    is_pinned: Mapped[bool] = mapped_column(default=False)  # surfaces in "Recent" UI
    notes: Mapped[str | None]                               # user free-text post-run

class BacktestTrade(Base):
    __tablename__ = "backtest_trades"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id", ondelete="CASCADE"), index=True)
    entry_time: Mapped[datetime]
    entry_price: Mapped[float]
    exit_time: Mapped[datetime | None]
    exit_price: Mapped[float | None]
    shares: Mapped[int]
    pnl: Mapped[float]
    pnl_pct: Mapped[float]
    exit_reason: Mapped[str]   # "stop" | "target" | "time_stop" | "signal" | "open_at_end" | "skipped_too_risky"
    hold_bars: Mapped[int]
```

Equity curve lives on the run row as JSON (typical curve is 250–2000 points; bytes are negligible vs. the engineering cost of a third table). Trades go in their own table because we want to filter/sort them server-side and a single run can produce thousands.

### Migrations

Alembic is already in `requirements.txt` but not initialized. Phase A includes:

1. `alembic init alembic` from `backend/`
2. Configure `alembic/env.py` to import `app.database.Base` and read `DATABASE_URL` from env
3. `alembic revision --autogenerate -m "backtest tables"`
4. `alembic upgrade head` — runs locally on SQLite, will run on Railway via a release-command hook

Add to Railway: a `release` step in `railway.json` (or Procfile) that runs `alembic upgrade head` before each deploy. Confirm with AJ before adding deploy hooks if the existing project uses a different migration pattern.

### Strategy interface (`strategies/base.py`)

```python
from typing import Protocol, TypedDict
import pandas as pd

class StrategyParam(TypedDict):
    name: str          # e.g. "stop_pct"
    label: str         # e.g. "Stop loss %"
    type: str          # "number" | "int" | "select"
    default: float | int | str
    min: float | None
    max: float | None
    step: float | None
    options: list | None  # for select type

class Strategy(Protocol):
    id: str            # "sma_crossover"
    name: str          # "9/180 SMA Crossover"
    description: str   # short blurb shown in UI
    course_ref: str    # "05-02" — link to ziptrader notes
    params: list[StrategyParam]

    def signals(self, bars: pd.DataFrame, params: dict) -> pd.Series:
        """Return Series indexed like bars; values: 1=enter long, -1=exit, 0=hold."""
```

The registry pattern (`strategies/__init__.py`) auto-imports each module and exposes `STRATEGIES: dict[str, Strategy]`.

### Engine (`engine.py`)

Vectorized over bars. Pseudocode:

```
position = None  # {entry_price, entry_idx, shares, stop, target, time_stop_idx}
equity_curve = []
trades = []

for i, bar in enumerate(bars):
    if position:
        # Check exits in priority: stop > target > time_stop > strategy_exit
        if bar.low <= position.stop:
            close_at(position.stop)
        elif bar.high >= position.target:
            close_at(position.target)
        elif i >= position.time_stop_idx:
            close_at(bar.close)
        elif signal[i] == -1:
            close_at(bar.close)
    else:
        if signal[i] == 1:
            shares = compute_shares(capital, bar.open_next, risk_pct, stop_pct)
            open_at(bar.open_next, shares)  # use NEXT bar's open for realism
    equity_curve.append((bar.time, current_equity))

return trades, equity_curve
```

### API endpoints

```
GET  /api/backtest/strategies
     → [{id, name, description, course_ref, params}]

POST /api/backtest/run
     body: {
       symbol: "SPY",
       strategy_id: "sma_crossover",
       params: {sma_short: 9, sma_long: 180, stop_pct: 5, target_pct: 10},
       start_date: "2025-05-01",
       end_date: "2026-05-01",
       interval: "1d",
       capital: 10000,
       risk_pct: 1,
       label?: "SPY 9/180 baseline",   # optional — when present, persists the run
       persist?: true                   # default true; set false for scratch runs
     }
     → {
       run_id?,             # present iff persist=true
       symbol, strategy_id, params, start_date, end_date, data_source,
       trades: [...],
       equity_curve: [{time, value}],
       metrics: {...}
     }

GET  /api/backtest/runs?symbol=&strategy_id=&pinned=&limit=50
     → [{id, created_at, label, symbol, strategy_id, params, metrics, is_pinned}]
     # list view — does NOT return trades or equity_curve to keep payload small

GET  /api/backtest/runs/{id}
     → full run (metadata + trades + equity_curve)

PATCH /api/backtest/runs/{id}
     body: {label?, notes?, is_pinned?}

DELETE /api/backtest/runs/{id}
     # cascades trades

POST /api/backtest/runs/{id}/rerun
     # re-executes with the same params + symbol against the latest bars
     → new run with new id; original kept for comparison
```

Re-use `app/market/routes.py` `getBars` logic. Backend records the actual data source (`webull` | `yahoo`) per run.

---

## Frontend

### Files to create / change

```
frontend/src/components/
  BacktestLab.jsx                  # rewrite the stub (CHANGE)
  backtest/
    StrategyPicker.jsx             # (NEW)
    ParamForm.jsx                  # auto-generated form from strategy.params (NEW)
    BacktestResults.jsx            # tiles + equity + table + histogram (NEW)
    EquityCurveChart.jsx           # lightweight-charts line (NEW)
    TradeTable.jsx                 # sortable list (NEW)
    RunHistory.jsx                 # left-rail list of saved runs (NEW)
frontend/src/services/api.js       # add getStrategies, runBacktest, listRuns, getRun, updateRun, deleteRun, rerunBacktest (CHANGE)
```

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────┐
│  Backtest Lab                              [Run]        │
├──────────────────┬──────────────────────────────────────┤
│ Strategy         │  ┌─ Metrics ──────────────────────┐  │
│ ○ SMA Crossover  │  │ Win Rate  Profit Factor  Total │  │
│ ● RSI Bounce     │  │   62%       2.3x          +18% │  │
│ ○ MACD Momentum  │  └────────────────────────────────┘  │
│ ○ Value Dip      │                                      │
│                  │  ┌─ Equity Curve ─────────────────┐  │
│ ── Params ──     │  │  (line chart)                  │  │
│ Symbol  [SPY]    │  └────────────────────────────────┘  │
│ Range   [12mo]   │                                      │
│ Capital [$10k]   │  ┌─ Trades ───────────────────────┐  │
│ Risk %  [1]      │  │  table                         │  │
│ Stop %  [5]      │  │                                │  │
│ Target %[10]     │  └────────────────────────────────┘  │
│                  │                                      │
│ [Save preset]    │                                      │
└──────────────────┴──────────────────────────────────────┘
```

Mobile: stack vertically, strategy picker becomes a `<select>`, params collapse into an expandable card, results scroll below.

### UX details

- ParamForm renders from the strategy's `params` schema — no per-strategy custom form code
- Run button disabled until valid (symbol present, end > start, capital > 0)
- During run: branded `<PageLoader variant="inline" message="Backtesting…" />` in results panel
- Empty state: "Pick a strategy and hit Run to see how it performs against history"
- Error state: red card with the error message + "Retry"
- Trade table columns: Entry → Exit → P&L → P&L% → Hold → Reason. Sort by any.
- "Compare" — pin past runs from RunHistory; pinned runs render as faded equity-curve overlays on the active chart
- Data source badge in the metrics row: subtle pill that reads "via Webull" (accent) or "via Yahoo" (muted) so AJ can spot when fallback kicked in

### RunHistory rail

Replaces the old `localStorage` preset list. Lives left of the strategy picker on desktop, collapses to a top dropdown on mobile.

- Lists saved runs: label (or auto-generated `{symbol} {strategy} {start}–{end}`), tiny win-rate / total-return chip, created-at relative time
- Pin icon → toggles `is_pinned`; pinned runs sticky at top
- Click → loads that run's full results into the right panel (read-only badge: "Viewing saved run")
- Three-dot menu: Re-run with latest data · Edit label/notes · Delete
- Filter chips at top: Symbol, Strategy, Pinned only
- A scratch run (the user clicked Run without saving) does NOT appear here. Save action: button next to results header → opens label/notes modal → POSTs as `persist: true`

---

## Acceptance criteria

- [ ] `GET /api/backtest/strategies` returns all 4 strategies with their param schemas
- [ ] `POST /api/backtest/run` with `sma_crossover` on `SPY` `1d` last 12mo returns at least 1 trade and a 250+ point equity curve, with `data_source` populated
- [ ] When Webull bars are available, `data_source == "webull"`; for ranges Webull doesn't cover, falls back to `"yahoo"` without error
- [ ] Saving a run persists to Postgres (Railway) / SQLite (local); `GET /api/backtest/runs` returns it; `GET /api/backtest/runs/{id}` returns full detail
- [ ] DELETE cascades trades; PATCH updates label/notes/is_pinned
- [ ] Frontend renders metrics, equity curve, trade table, and RunHistory rail without console errors
- [ ] Running with no signals (e.g. all params extreme) returns gracefully with empty `trades: []` and a friendly "no entries triggered" empty state
- [ ] Mobile layout (375px) — no horizontal overflow, all params accessible
- [ ] Branded preloader shows during run, never the stale state
- [ ] Pinned runs render as faded overlay on the active equity curve
- [ ] All 4 strategies produce at least 1 trade against `SPY` 1d for the default 12-month window
- [ ] Position sizing math is correct: shares = floor((capital * risk_pct/100) / (entry - stop)); shares == 0 → trade skipped + recorded with `exit_reason: "skipped_too_risky"`

## Phasing for the kickoff session

**Phase A** (do first, in one Claude Code session):
- Alembic init + first migration (`backtest_runs`, `backtest_trades`)
- Backend: engine + base + 1 strategy (`sma_crossover`) + metrics + routes (run + list + get + patch + delete + rerun)
- Webull-first / Yahoo-fallback wiring with `data_source` recorded
- Risk-based position sizing with `skipped_too_risky` accounting
- Frontend: rewrite BacktestLab.jsx end-to-end with that one strategy + RunHistory rail
- Manual smoke test: SPY 1d, 12mo, default params → results render → save → reload page → run still in history → re-run from history

**Phase B** (next session):
- Add the other 3 strategies (`rsi_bounce`, `macd_momentum`, `value_dip`)
- Pinned-run comparison overlays
- Error/empty states + mobile polish
- Filter chips on RunHistory

**Phase C** (optional later):
- Slippage / commission toggles
- Multi-strategy comparison view (run two strategies side-by-side on one chart)
- Export trades to CSV
- Notes-driven AI critique ("you sized too aggressive vs. ZipTrader Module 4-5 risk rules")

---

## Kickoff prompt for Claude Code

> Read `docs/specs/backtest-lab.md`, then implement Phase A end-to-end. Constraints: re-use existing indicators in `app/strategy/indicators.py` and the bar fetcher in `app/market/routes.py`; follow the file layout in the spec exactly; keep the frontend on the existing branded `PageLoader` and theme tokens (no new colors). Initialize Alembic if not already initialized and create the first migration for `backtest_runs` + `backtest_trades`. When done, run `cd backend && alembic upgrade head` against the local SQLite db to verify the migration applies cleanly, then `cd frontend && npm run build` to verify no syntax errors. End with: (a) the smoke-test steps I should run manually, (b) any open questions, and (c) a one-line note on what changes Railway will need (env vars, release-command, etc.) to roll out — do not modify Railway config without confirming.
