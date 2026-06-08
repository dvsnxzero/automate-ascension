import { useEffect, useState, useRef } from "react";
import {
  Play,
  Square,
  Zap,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
} from "lucide-react";
import {
  getRunnerStatus,
  startRunner,
  stopRunner,
  runnerTickOnce,
  listStrategies,
} from "../services/api";

/**
 * Live paper-execution control panel.
 *
 * Drives the backend RunnerEngine — start/stop the async loop, switch
 * strategy, see status + recent log entries. Polls /runner/status every
 * 5s while the engine is running so the user gets near-realtime feedback
 * without us building a WebSocket.
 */
export default function RunnerPanel() {
  const [status, setStatus] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState("sma_crossover");
  const [busy, setBusy] = useState(null); // "start" | "stop" | "tick" | null
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const refresh = async () => {
    try {
      const r = await getRunnerStatus();
      setStatus(r.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "status failed");
    }
  };

  // Initial load + strategies
  useEffect(() => {
    refresh();
    listStrategies()
      .then((r) => setStrategies(r.data?.strategies || r.data || []))
      .catch(() => {});
  }, []);

  // Poll every 5s while running
  useEffect(() => {
    if (status?.status === "running") {
      pollRef.current = setInterval(refresh, 5000);
      return () => clearInterval(pollRef.current);
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [status?.status]);

  // Keep dropdown in sync with engine's current strategy when status arrives
  useEffect(() => {
    if (status?.strategy_id) setSelectedStrategy(status.strategy_id);
  }, [status?.strategy_id]);

  const handleStart = async () => {
    setBusy("start");
    try {
      await startRunner({ strategy_id: selectedStrategy });
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleStop = async () => {
    setBusy("stop");
    try {
      await stopRunner();
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleTick = async () => {
    setBusy("tick");
    try {
      await runnerTickOnce();
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(null);
    }
  };

  const s = status?.status || "loading";
  const isRunning = s === "running";
  const isError = s === "error";

  const badgeClass =
    s === "running"
      ? "bg-bull/15 text-bull"
      : s === "error"
      ? "bg-bear/15 text-bear"
      : s === "stopped"
      ? "bg-surface text-muted"
      : "bg-accent/10 text-accent";

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Bot size={18} className="text-accent" />
          <div>
            <h2 className="text-base font-bold tracking-tight">Strategy Runner</h2>
            <p className="text-[11px] text-muted">
              Evaluates the chosen strategy against your watchlist on a polling interval. Paper orders only.
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${badgeClass}`}>
          {s}
        </span>
      </div>

      {/* Config row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
            Strategy
          </label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            disabled={isRunning}
            className="w-full bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-60"
          >
            {strategies.length === 0 && (
              <>
                <option value="sma_crossover">9/180 SMA Crossover</option>
                <option value="rsi_mean_reversion">RSI Mean Reversion (14, 30/70)</option>
              </>
            )}
            {strategies.map((st) => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <Stat label="Bars" value={status?.bar_interval || "1h"} />
          <Stat label="Poll" value={status?.poll_seconds ? `${Math.round(status.poll_seconds / 60)}m` : "15m"} />
          <Stat label="Market" value={status?.is_rth ? "open" : "closed"} highlight={status?.is_rth ? "bull" : null} />
        </div>
      </div>

      {/* Watchlist */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Watchlist</div>
        <div className="flex flex-wrap gap-1.5">
          {(status?.watchlist || ["AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA"]).map((sym) => (
            <span key={sym} className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-surface border border-border">
              {sym}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={busy === "start"}
            className="flex items-center gap-1.5 bg-bull text-black font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded-lg hover:bg-bull/90 disabled:opacity-60"
          >
            <Play size={13} /> {busy === "start" ? "Starting…" : "Start"}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={busy === "stop"}
            className="flex items-center gap-1.5 bg-bear text-white font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded-lg hover:bg-bear/90 disabled:opacity-60"
          >
            <Square size={13} /> {busy === "stop" ? "Stopping…" : "Stop"}
          </button>
        )}
        <button
          onClick={handleTick}
          disabled={busy === "tick"}
          className="flex items-center gap-1.5 border border-border font-semibold text-xs uppercase tracking-wider px-3.5 py-2 rounded-lg hover:border-accent disabled:opacity-60"
          title="Run a single evaluation cycle right now"
        >
          <Zap size={13} /> {busy === "tick" ? "Ticking…" : "Tick now"}
        </button>
        {status?.last_tick && (
          <span className="flex items-center gap-1 text-[10px] text-muted self-center font-mono">
            <Clock size={11} /> last: {new Date(status.last_tick).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Error */}
      {(error || isError) && (
        <div className="rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 mb-3 flex items-start gap-2 text-xs">
          <AlertTriangle size={13} className="text-bear shrink-0 mt-0.5" />
          <div className="text-bear break-words">
            {error || status?.last_error || "Engine error — check backend logs"}
          </div>
        </div>
      )}

      {/* Tax + PDT guardrails */}
      {status?.guardrails && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Guardrails</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
            <Stat
              label="Short-term"
              value={`${Math.round((status.guardrails.short_term_rate + status.guardrails.state_rate) * 100)}%`}
            />
            <Stat
              label="Long-term"
              value={`${Math.round((status.guardrails.long_term_rate + status.guardrails.state_rate) * 100)}%`}
            />
            <Stat
              label="Min net edge"
              value={`${status.guardrails.min_after_tax_edge_pct}%`}
            />
            <Stat
              label="PDT"
              value={status.guardrails.pdt_enforcement ? "on" : "off"}
              highlight={status.guardrails.pdt_enforcement ? null : "bull"}
            />
          </div>
        </div>
      )}

      {/* Log tail */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">Recent activity</div>
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-bull">
              <Activity size={11} className="animate-pulse" /> live
            </span>
          )}
        </div>
        <div className="bg-theme-bg border border-border rounded-lg p-2 font-mono text-[11px] max-h-44 overflow-y-auto">
          {(status?.log || []).length === 0 ? (
            <div className="text-muted text-center py-3 text-[10px]">
              No activity yet. Start the runner or trigger a tick.
            </div>
          ) : (
            [...(status?.log || [])].reverse().map((e, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-muted shrink-0">{e.ts?.slice(11, 19)}</span>
                <span className="break-words">{e.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  const valColor =
    highlight === "bull" ? "text-bull" : highlight === "bear" ? "text-bear" : "text-theme-text";
  return (
    <div className="bg-theme-bg border border-border rounded-lg px-2 py-1.5">
      <div className="uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-mono font-bold ${valColor}`}>{value}</div>
    </div>
  );
}
