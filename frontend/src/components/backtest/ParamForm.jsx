/**
 * ParamForm — auto-renders inputs from a strategy's `params` schema.
 *
 * Each entry in `schema` looks like:
 *   { name, label, type ("number"|"int"|"select"), default, min?, max?, step?, options?, help? }
 *
 * `values` is a flat dict keyed by param name; `onChange(name, value)` updates one field.
 */
export default function ParamForm({ schema, values, onChange }) {
  if (!schema?.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {schema.map((p) => {
        const id = `param-${p.name}`;
        const v = values[p.name] ?? p.default;

        if (p.type === "select") {
          return (
            <div key={p.name} className="col-span-2">
              <label htmlFor={id} className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
                {p.label}
              </label>
              <select
                id={id}
                value={v}
                onChange={(e) => onChange(p.name, e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm"
              >
                {(p.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {p.help && <div className="text-[10px] text-muted/70 mt-1">{p.help}</div>}
            </div>
          );
        }

        return (
          <div key={p.name}>
            <label htmlFor={id} className="block text-[11px] text-muted font-mono uppercase tracking-wider mb-1">
              {p.label}
            </label>
            <input
              id={id}
              type="number"
              value={v}
              min={p.min ?? undefined}
              max={p.max ?? undefined}
              step={p.step ?? (p.type === "int" ? 1 : "any")}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onChange(p.name, "");
                  return;
                }
                const next = p.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
                onChange(p.name, Number.isFinite(next) ? next : raw);
              }}
              className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-sm font-mono"
            />
            {p.help && <div className="text-[10px] text-muted/70 mt-1">{p.help}</div>}
          </div>
        );
      })}
    </div>
  );
}
