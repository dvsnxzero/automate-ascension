/**
 * BacktestResults — metrics tiles, equity curve, trade table.
 *
 * Receives the full run payload (metrics, equity_curve, trades, data_source)
 * and lays them out in the right panel of BacktestLab. Empty / error states
 * are owned by the parent so this component can stay focused on rendering.
 */
import EquityCurveChart from "./EquityCurveChart";
import TradeTable from "./TradeTable";

function fmtPct(v, digits = 1) {
  if (v === null || v === undefined) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}
function fmtMoney(v) {
  if (v === null || v === undefined) return "—";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
function fmtNum(v, digits = 2) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits);
}

function MetricTile({ label, value, sub, tone = "neutral" }) {
  const valueClass =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-theme-text";
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function BacktestResults({ run }) {
  if (!run) return null;
  const m = run.metrics || {};

  const winRatePct = m.win_rate !== null && m.win_rate !== undefined ? m.win_rate * 100 : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header — symbol + data source pill */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted">
            {run.symbol} · {run.strategy_id} · {run.interval}
          </div>
          <div className="text-sm text-muted mt-0.5">
            {run.start_date} → {run.end_date}
          </div>
        </div>
        {run.data_source && (
          <span
            className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
              run.data_source === "webull"
                ? "border-accent text-accent bg-accent-bg"
                : "border-border text-muted bg-surface"
            }`}
          >
            via {run.data_source}
          </span>
        )}
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Total return"
          value={fmtPct(m.total_return_pct, 2)}
          sub={fmtMoney(m.total_pnl)}
          tone={(m.total_return_pct ?? 0) > 0 ? "bull" : (m.total_return_pct ?? 0) < 0 ? "bear" : "neutral"}
        />
        <MetricTile
          label="Win rate"
          value={winRatePct !== null ? `${winRatePct.toFixed(0)}%` : "—"}
          sub={`${m.win_count ?? 0}W / ${m.loss_count ?? 0}L`}
        />
        <MetricTile
          label="Profit factor"
          value={fmtNum(m.profit_factor, 2)}
          sub={`${m.trade_count ?? 0} trades`}
        />
        <MetricTile
          label="Max drawdown"
          value={fmtPct(m.max_drawdown_pct, 2)}
          sub={`Sharpe ${fmtNum(m.sharpe, 2)}`}
          tone={(m.max_drawdown_pct ?? 0) < 0 ? "bear" : "neutral"}
        />
      </div>

      {/* Equity curve */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold">Equity curve</div>
          <div className="text-[11px] text-muted font-mono">
            {fmtMoney(m.starting_capital)} → {fmtMoney(m.final_equity)}
          </div>
        </div>
        <EquityCurveChart
          curve={run.equity_curve}
          startingCapital={m.starting_capital ?? run.capital}
          height={260}
        />
      </div>

      {/* Trades */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold">Trades</div>
          <div className="text-[11px] text-muted font-mono">
            {m.trade_count ?? 0} executed
            {m.skipped_count ? ` · ${m.skipped_count} skipped` : ""}
          </div>
        </div>
        <TradeTable trades={run.trades || []} />
      </div>

      {m.skipped_count > 0 && (
        <div className="text-[11px] text-muted bg-surface border border-border rounded-xl px-3 py-2">
          {m.skipped_count} signal{m.skipped_count === 1 ? "" : "s"} were skipped
          because the stop distance exceeded your risk budget. Increase capital
          or risk %, or pick tighter-stop strategies.
        </div>
      )}
    </div>
  );
}
