/**
 * TradeTable — sortable list of every trade the engine produced.
 *
 * Columns: Entry · Exit · P&L $ · P&L % · Hold (bars) · Reason. Click a
 * column header to sort; second click reverses direction. Skipped trades
 * (`skipped_too_risky`) are visible with a muted style so users can see
 * how often a strategy generated signals they couldn't afford.
 */
import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

const REASON_LABEL = {
  stop: "Stop",
  target: "Target",
  time_stop: "Time stop",
  signal: "Signal exit",
  open_at_end: "Open at end",
  skipped_too_risky: "Skipped (too risky)",
};

function fmtMoney(v) {
  if (v === null || v === undefined) return "—";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function TradeTable({ trades = [] }) {
  const [sortKey, setSortKey] = useState("entry_time");
  const [sortDir, setSortDir] = useState("asc");

  const sorted = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [trades, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHead = ({ k, children, align = "left" }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-2.5 text-${align} cursor-pointer select-none hover:text-theme-text transition-colors`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k &&
          (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );

  if (!trades.length) {
    return (
      <div className="text-center text-muted text-sm py-8">
        No entries triggered for this window. Try widening the date range or
        loosening your params.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="border-b border-border text-muted text-left text-[10px] uppercase tracking-wider font-mono">
            <SortHead k="entry_time">Entry</SortHead>
            <SortHead k="exit_time">Exit</SortHead>
            <SortHead k="shares" align="right">Shares</SortHead>
            <SortHead k="pnl" align="right">P&amp;L</SortHead>
            <SortHead k="pnl_pct" align="right">P&amp;L %</SortHead>
            <SortHead k="hold_bars" align="right">Hold</SortHead>
            <SortHead k="exit_reason">Reason</SortHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((t, i) => {
            const skipped = t.exit_reason === "skipped_too_risky";
            const pnlColor = skipped
              ? "text-muted"
              : t.pnl > 0
              ? "text-bull"
              : t.pnl < 0
              ? "text-bear"
              : "text-muted";
            return (
              <tr key={i} className={skipped ? "opacity-60" : ""}>
                <td className="px-3 py-2.5 font-mono">{fmtDate(t.entry_time)}</td>
                <td className="px-3 py-2.5 font-mono">{fmtDate(t.exit_time)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{t.shares}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${pnlColor}`}>
                  {skipped ? "—" : fmtMoney(t.pnl)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${pnlColor}`}>
                  {skipped ? "—" : fmtPct(t.pnl_pct)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">
                  {t.hold_bars}
                </td>
                <td className="px-3 py-2.5 text-muted text-[11px]">
                  {REASON_LABEL[t.exit_reason] || t.exit_reason}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
