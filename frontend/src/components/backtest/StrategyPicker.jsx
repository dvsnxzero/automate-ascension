/**
 * StrategyPicker — list of available strategies, one selected at a time.
 * Renders as a vertical button list on desktop, collapses to a <select> on
 * mobile so it doesn't dominate small viewports.
 */
export default function StrategyPicker({ strategies, selectedId, onSelect }) {
  if (!strategies?.length) {
    return (
      <div className="text-xs text-muted px-2 py-3">
        Loading strategies…
      </div>
    );
  }

  return (
    <>
      {/* Desktop list */}
      <div className="hidden md:flex flex-col gap-1.5">
        {strategies.map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-all duration-200 ${
                active
                  ? "bg-accent-bg border-accent text-accent"
                  : "bg-surface border-border text-theme-text hover:border-border-light"
              }`}
            >
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{s.description}</div>
              <div className="text-[10px] mt-1 font-mono uppercase tracking-wider text-muted/70">
                Module {s.course_ref}
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile select */}
      <div className="md:hidden">
        <label className="text-[11px] text-muted font-mono uppercase tracking-wider">Strategy</label>
        <select
          value={selectedId || ""}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm font-medium"
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
