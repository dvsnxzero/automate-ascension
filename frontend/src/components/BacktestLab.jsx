/**
 * BacktestLab — strategy testing surface.
 *
 * Layout:
 *   ┌────────────┬──────────────┬────────────────────────┐
 *   │ RunHistory │ Strategy +   │ Results                │
 *   │ (saved)    │ ParamForm    │ (metrics, curve, table)│
 *   └────────────┴──────────────┴────────────────────────┘
 *
 * Mobile collapses everything into a vertical stack with the strategy
 * picker as a <select>. RunHistory becomes a top accordion.
 */
import { useEffect, useMemo, useState } from "react";
import { Play, Save, FlaskConical, AlertTriangle, History } from "lucide-react";
import {
  getStrategies,
  runBacktest,
  listRuns,
  getRun,
  updateRun,
  deleteRun,
  rerunBacktest,
} from "../services/api";
import PageLoader from "./PageLoader";
import StrategyPicker from "./backtest/StrategyPicker";
import ParamForm from "./backtest/ParamForm";
import BacktestResults from "./backtest/BacktestResults";
import RunHistory from "./backtest/RunHistory";

const DEFAULT_INTERVAL = "1d";
const DEFAULT_SYMBOL = "SPY";
const DEFAULT_CAPITAL = 10000;
const DEFAULT_RISK = 1;

// Helper — return a YYYY-MM-DD string N days before today.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

const RANGE_PRESETS = [
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "12M", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
];

export default function BacktestLab() {
  // Strategy catalog (from API)
  const [strategies, setStrategies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [paramValues, setParamValues] = useState({});

  // Form state
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setIntervalVal] = useState(DEFAULT_INTERVAL);
  const [startDate, setStartDate] = useState(daysAgo(365));
  const [endDate, setEndDate] = useState(today());
  const [capital, setCapital] = useState(DEFAULT_CAPITAL);
  const [riskPct, setRiskPct] = useState(DEFAULT_RISK);

  // Run state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null); // last in-memory run
  const [runError, setRunError] = useState(null);

  // History
  const [runs, setRuns] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false); // mobile

  // Save flow
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveNotes, setSaveNotes] = useState("");

  const selected = useMemo(
    () => strategies.find((s) => s.id === selectedId),
    [strategies, selectedId]
  );

  // Initial load — fetch strategies + history in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stratResp, runsResp] = await Promise.all([getStrategies(), listRuns()]);
        if (cancelled) return;
        const list = stratResp.data.strategies || [];
        setStrategies(list);
        if (list.length && !selectedId) {
          setSelectedId(list[0].id);
        }
        setRuns(runsResp.data.runs || []);
      } catch (err) {
        console.error("BacktestLab init failed:", err);
        if (!cancelled) {
          setRunError(
            err?.response?.data?.detail || "Couldn't load strategies. Is the backend running?"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the selected strategy changes, hydrate paramValues with that
  // strategy's defaults so the ParamForm has something to render.
  useEffect(() => {
    if (!selected) return;
    const next = {};
    for (const p of selected.params || []) next[p.name] = p.default;
    setParamValues(next);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshRuns = async () => {
    try {
      const resp = await listRuns();
      setRuns(resp.data.runs || []);
    } catch (err) {
      console.error("listRuns failed:", err);
    }
  };

  const valid =
    symbol.trim() &&
    selectedId &&
    startDate &&
    endDate &&
    new Date(endDate) > new Date(startDate) &&
    Number(capital) > 0 &&
    Number(riskPct) > 0;

  const handleRun = async ({ persist = false, label = null, notes = null } = {}) => {
    if (!valid || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const resp = await runBacktest({
        symbol: symbol.trim().toUpperCase(),
        strategy_id: selectedId,
        params: paramValues,
        start_date: startDate,
        end_date: endDate,
        interval,
        capital: Number(capital),
        risk_pct: Number(riskPct),
        persist,
        label,
        notes,
      });
      setRunResult(resp.data);
      if (persist) await refreshRuns();
    } catch (err) {
      console.error("runBacktest failed:", err);
      setRunError(err?.response?.data?.detail || "Backtest failed. Try a different range or symbol.");
      setRunResult(null);
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    if (!runResult || saving) return;
    setSaving(true);
    try {
      await handleRun({
        persist: true,
        label: saveLabel.trim() || null,
        notes: saveNotes.trim() || null,
      });
      setSaveOpen(false);
      setSaveLabel("");
      setSaveNotes("");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectRun = async (id) => {
    try {
      const resp = await getRun(id);
      const r = resp.data;
      setRunResult(r);
      setSymbol(r.symbol);
      setSelectedId(r.strategy_id);
      setIntervalVal(r.interval);
      setStartDate(r.start_date);
      setEndDate(r.end_date);
      setCapital(r.capital);
      setRiskPct(r.risk_pct);
      setParamValues(r.params || {});
      setHistoryOpen(false);
    } catch (err) {
      console.error("getRun failed:", err);
    }
  };

  const handleTogglePin = async (run) => {
    try {
      await updateRun(run.id, { is_pinned: !run.is_pinned });
      await refreshRuns();
    } catch (err) {
      console.error("updateRun failed:", err);
    }
  };

  const handleRerun = async (run) => {
    try {
      await rerunBacktest(run.id);
      await refreshRuns();
    } catch (err) {
      console.error("rerunBacktest failed:", err);
    }
  };

  const handleDeleteRun = async (run) => {
    if (!confirm(`Delete saved run "${run.label || run.symbol}"? This can't be undone.`)) return;
    try {
      await deleteRun(run.id);
      if (runResult?.run_id === run.id) setRunResult(null);
      await refreshRuns();
    } catch (err) {
      console.error("deleteRun failed:", err);
    }
  };

  const applyRangePreset = (days) => {
    setStartDate(daysAgo(days));
    setEndDate(today());
  };

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto bottom-nav-safe md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <FlaskConical size={26} className="text-accent" />
          Backtest Lab
        </h1>
        <div className="flex items-center gap-2">
          {/* Mobile-only history toggle */}
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-border text-sm font-medium"
          >
            <History size={14} />
            History ({runs.length})
          </button>
          <button
            type="button"
            onClick={() => handleRun()}
            disabled={!valid || running}
            className="accent-btn flex items-center gap-2 text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            {running ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      {/* Mobile run history dropdown */}
      {historyOpen && (
        <div className="md:hidden card p-3 mb-4">
          <RunHistory
            runs={runs}
            activeRunId={runResult?.run_id}
            onSelect={handleSelectRun}
            onTogglePin={handleTogglePin}
            onRerun={handleRerun}
            onDelete={handleDeleteRun}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[220px_280px_1fr] gap-4 md:gap-5">
        {/* Run history rail (desktop) */}
        <aside className="hidden md:block">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2 px-1">
            Runs ({runs.length})
          </div>
          <RunHistory
            runs={runs}
            activeRunId={runResult?.run_id}
            onSelect={handleSelectRun}
            onTogglePin={handleTogglePin}
            onRerun={handleRerun}
            onDelete={handleDeleteRun}
          />
        </aside>

        {/* Config column */}
        <aside className="card p-4 flex flex-col gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2">
              Strategy
            </div>
            <StrategyPicker
              strategies={strategies}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                Interval
              </label>
              <select
                value={interval}
                onChange={(e) => setIntervalVal(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm"
              >
                <option value="1d">1d</option>
                <option value="1h">1h</option>
                <option value="30m">30m</option>
                <option value="15m">15m</option>
                <option value="5m">5m</option>
                <option value="1w">1w</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                Capital
              </label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
                min={1}
                step={500}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                Date range
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {RANGE_PRESETS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => applyRangePreset(r.days)}
                    className="text-[10px] font-mono px-2 py-1 rounded-md border border-border bg-surface hover:border-accent transition-colors"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-lg px-2 py-2 text-xs font-mono"
                />
                <span className="text-muted text-xs">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-lg px-2 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                Risk per trade %
              </label>
              <input
                type="number"
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
                min={0.1}
                max={100}
                step={0.1}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm font-mono"
              />
            </div>
          </div>

          {selected && (
            <div className="border-t border-border pt-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2">
                {selected.name} params
              </div>
              <ParamForm
                schema={selected.params}
                values={paramValues}
                onChange={(name, value) =>
                  setParamValues((prev) => ({ ...prev, [name]: value }))
                }
              />
            </div>
          )}
        </aside>

        {/* Results column */}
        <section className="min-w-0">
          {running && (
            <div className="card p-6">
              <PageLoader variant="inline" message="Backtesting" />
            </div>
          )}

          {!running && runError && (
            <div className="card p-5 border-bear/40">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-bear shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-bear">Backtest failed</div>
                  <div className="text-xs text-muted mt-1">{runError}</div>
                  <button
                    type="button"
                    onClick={() => handleRun()}
                    disabled={!valid}
                    className="mt-3 text-xs ghost-btn disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {!running && !runError && !runResult && (
            <div className="card p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-bg flex items-center justify-center mx-auto mb-3">
                <FlaskConical size={24} className="text-accent" />
              </div>
              <div className="text-theme-text font-semibold mb-1">Pick a strategy and hit Run</div>
              <div className="text-muted text-sm">
                Tests run against historical bars. Webull first, Yahoo as fallback.
              </div>
            </div>
          )}

          {!running && runResult && (
            <>
              {/* Save action */}
              <div className="flex items-center justify-end mb-3">
                {!runResult.run_id && (
                  <button
                    type="button"
                    onClick={() => setSaveOpen(true)}
                    className="ghost-btn flex items-center gap-1.5 text-xs"
                  >
                    <Save size={13} />
                    Save run
                  </button>
                )}
                {runResult.run_id && (
                  <span className="text-[11px] text-muted font-mono uppercase tracking-wider">
                    Saved · #{runResult.run_id}
                  </span>
                )}
              </div>
              <BacktestResults run={runResult} />
            </>
          )}
        </section>
      </div>

      {/* Save modal */}
      {saveOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSaveOpen(false)}
        >
          <div
            className="card p-5 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-3">Save this run</h3>
            <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder={`${symbol} ${selectedId} baseline`}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm mb-3"
              autoFocus
            />
            <label className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
              Notes (optional)
            </label>
            <textarea
              value={saveNotes}
              onChange={(e) => setSaveNotes(e.target.value)}
              rows={3}
              placeholder="What were you testing? What surprised you?"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveOpen(false)}
                className="ghost-btn text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="accent-btn text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
