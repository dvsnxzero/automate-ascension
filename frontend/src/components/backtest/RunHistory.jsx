/**
 * RunHistory — left rail of saved backtest runs.
 *
 * Server-backed (no more localStorage preset list). Shows pinned items first,
 * then most-recent. Each row's three-dot menu offers re-run / delete.
 * Clicking a row tells the parent to load that run's detail into the right
 * panel.
 */
import { useState } from "react";
import { Pin, PinOff, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";

function relativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function autoLabel(run) {
  if (run.label) return run.label;
  return `${run.symbol} · ${run.strategy_id} · ${run.start_date}→${run.end_date}`;
}

export default function RunHistory({
  runs = [],
  activeRunId,
  onSelect,
  onTogglePin,
  onRerun,
  onDelete,
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  if (!runs.length) {
    return (
      <div className="text-[11px] text-muted px-2 py-3">
        Saved runs appear here. Run a backtest and click <span className="text-theme-text">Save</span> to keep it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((r) => {
        const isActive = r.id === activeRunId;
        const winRate = r.metrics?.win_rate;
        const totalReturn = r.metrics?.total_return_pct;
        const returnColor = totalReturn > 0 ? "text-bull" : totalReturn < 0 ? "text-bear" : "text-muted";

        return (
          <div
            key={r.id}
            className={`relative rounded-xl border transition-all duration-200 ${
              isActive
                ? "bg-accent-bg border-accent"
                : "bg-surface border-border hover:border-border-light"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className="w-full text-left px-3 py-2.5 pr-9"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] font-semibold text-theme-text truncate">
                  {autoLabel(r)}
                </div>
                {r.is_pinned && (
                  <Pin size={11} className="text-accent shrink-0 mt-0.5" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                {totalReturn !== null && totalReturn !== undefined && (
                  <span className={returnColor}>
                    {totalReturn >= 0 ? "+" : ""}
                    {totalReturn.toFixed(1)}%
                  </span>
                )}
                {winRate !== null && winRate !== undefined && (
                  <span className="text-muted">
                    {Math.round(winRate * 100)}% wins
                  </span>
                )}
                <span className="text-muted/60 ml-auto">{relativeTime(r.created_at)}</span>
              </div>
            </button>

            <button
              type="button"
              aria-label="Run actions"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === r.id ? null : r.id);
              }}
              className="absolute right-1.5 top-1.5 p-1.5 rounded-md text-muted hover:text-theme-text hover:bg-surface-light transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>

            {openMenuId === r.id && (
              <div
                className="absolute right-1.5 top-9 z-10 bg-surface-light border border-border rounded-lg shadow-lg py-1 min-w-[150px]"
                onMouseLeave={() => setOpenMenuId(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onTogglePin(r);
                  }}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-surface flex items-center gap-2"
                >
                  {r.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  {r.is_pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onRerun(r);
                  }}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-surface flex items-center gap-2"
                >
                  <RotateCw size={12} />
                  Re-run latest
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    onDelete(r);
                  }}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-surface text-bear flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
