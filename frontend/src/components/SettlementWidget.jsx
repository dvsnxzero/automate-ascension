import { useEffect, useState } from "react";
import {
  Wallet,
  Clock,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { getSettlementState } from "../services/api";

/* ─────────────────────────────────────────
   Helpers
   ───────────────────────────────────────── */
const fmtUSD = (v) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/* ─────────────────────────────────────────
   Settlement Widget
   ─────────────────────────────────────────
   Surfaces "what cash you can actually trade with right now":
   - Settled cash (immediately deployable for buys without GFV risk)
   - Unsettled inbound (sale proceeds en route)
   - Next settlement date + amount
   - GFV strike count + warning level
   ───────────────────────────────────────── */
export default function SettlementWidget({ compact = false, onRefresh }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await getSettlementState();
      setState(r.data || null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load");
      setState(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    await load();
    onRefresh?.();
  };

  if (loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-sm text-muted">
        <RefreshCw size={14} className="animate-spin" />
        Loading settlement state…
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="card p-4 text-sm text-muted">
        Settlement state unavailable{error ? ` — ${error}` : ""}
      </div>
    );
  }

  const settled = Number(state.settled_cash_available || 0);
  const unsettledInbound = Number(state.unsettledInbound ?? state.unsettled_cash_inbound ?? 0);
  const totalAfter = Number(state.total_cash_after_settlement || settled + unsettledInbound);
  const next = (state.next_settlements || [])[0]; // earliest pending settlement
  const gfv = state.gfv || { count_12mo: 0, severity: "clean" };

  const gfvSeverity = gfv.severity || (gfv.count_12mo > 0 ? "warning" : "clean");
  const gfvLabel =
    gfvSeverity === "clean"
      ? "Clean"
      : gfvSeverity === "restriction"
      ? "Restricted"
      : `${gfv.count_12mo} strike${gfv.count_12mo === 1 ? "" : "s"}`;

  const gfvCls =
    gfvSeverity === "clean"
      ? "bg-accent-bg text-accent"
      : gfvSeverity === "restriction"
      ? "bg-bear/10 text-bear"
      : "bg-yellow-500/10 text-yellow-400";

  /* ── Compact version (single row) ────────── */
  if (compact) {
    return (
      <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-center gap-1.5">
          <Wallet size={13} className="text-accent" />
          <span className="text-muted text-xs">Settled</span>
          <span className="font-bold tabular-nums">{fmtUSD(settled)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-yellow-400" />
          <span className="text-muted text-xs">Unsettled</span>
          <span className="font-bold tabular-nums">{fmtUSD(unsettledInbound)}</span>
        </div>
        {next && (
          <div className="text-xs text-muted">
            Next: <span className="text-theme-text font-semibold">{fmtUSD(next.amount)}</span>{" "}
            on <span className="text-theme-text font-semibold">{fmtDate(next.date)}</span>
          </div>
        )}
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ml-auto ${gfvCls}`}
        >
          GFV {gfvLabel}
        </span>
      </div>
    );
  }

  /* ── Full version ────────────────────────── */
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Settlement
          </h3>
          <p className="text-xs text-muted">
            What you can deploy right now (T+1 cash rules — mirrors live IRA)
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh settlement state"
          className="text-muted hover:text-theme-text p-1.5 rounded-md border border-border hover:border-border-light transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Cash split */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium uppercase tracking-wider">
            <Wallet size={12} className="text-accent" />
            Settled
          </div>
          <div className="text-2xl font-black tabular-nums mt-1.5 text-accent">
            {fmtUSD(settled)}
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            Tradeable now without GFV risk
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium uppercase tracking-wider">
            <Clock size={12} className="text-yellow-400" />
            Unsettled inbound
          </div>
          <div className="text-2xl font-black tabular-nums mt-1.5">
            {fmtUSD(unsettledInbound)}
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            Sale proceeds en route via T+1
          </div>
        </div>
      </div>

      {/* Next settlement */}
      {next ? (
        <div className="bg-surface-light border border-border rounded-xl p-3 mb-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-bg flex items-center justify-center shrink-0">
            <Clock size={14} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted">Next settlement</div>
            <div className="text-sm font-semibold truncate">
              <span className="text-accent">{fmtUSD(next.amount)}</span>{" "}
              on <span>{fmtDate(next.date)}</span>
            </div>
          </div>
          {(state.next_settlements || []).length > 1 && (
            <div className="text-[10px] text-muted text-right shrink-0">
              +{state.next_settlements.length - 1} more
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-light border border-border rounded-xl p-3 mb-3 text-xs text-muted text-center">
          No pending settlements — all cash is settled.
        </div>
      )}

      {/* Total after settlement */}
      <div className="flex items-center justify-between text-xs mb-3 px-1">
        <span className="text-muted">Total after settlement</span>
        <span className="font-bold tabular-nums">{fmtUSD(totalAfter)}</span>
      </div>

      {/* GFV row */}
      <div
        className={`rounded-xl p-3 flex items-start gap-2 text-xs ${
          gfvSeverity === "clean"
            ? "bg-accent-bg/30 border border-accent/20"
            : gfvSeverity === "restriction"
            ? "bg-bear/10 border border-bear/30"
            : "bg-yellow-500/5 border border-yellow-500/30"
        }`}
      >
        {gfvSeverity === "clean" ? (
          <ShieldCheck size={14} className="text-accent shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="font-semibold">
            GFV: {gfv.count_12mo || 0}/3 in last 12 months
          </div>
          {gfv.message && (
            <div className="text-muted mt-0.5 leading-relaxed">{gfv.message}</div>
          )}
          {!gfv.message && gfvSeverity === "clean" && (
            <div className="text-muted mt-0.5">
              No Good Faith Violations recorded.
            </div>
          )}
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${gfvCls}`}
        >
          {gfvLabel}
        </span>
      </div>
    </section>
  );
}
