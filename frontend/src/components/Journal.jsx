import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  Calendar,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  Zap,
  X,
  CheckCircle2,
  XCircle,
  DollarSign,
} from "lucide-react";
import {
  getTrades,
  getTradeStats,
  getBalance,
  syncOrders,
  snapshotBalance,
  createTrade,
  updateTrade,
} from "../services/api";
import DotCalendar from "./DotCalendar";

/* ────────────────────────────────
   Mini balance chart (SVG)
   ──────────────────────────────── */
function BalanceChart({ data = [], width = 600, height = 180 }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.total_value);
  const min = Math.min(...values) * 0.995;
  const max = Math.max(...values) * 1.005;
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - ((v - min) / range) * height,
  }));

  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const positive = values[values.length - 1] >= values[0];
  const color = positive ? "var(--color-bull)" : "var(--color-bear)";

  // Area fill
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#balFill)" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ────────────────────────────────
   Stat card
   ──────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted text-xs font-medium">
        {Icon && <Icon size={13} className={accent ? "text-accent" : ""} />}
        {label}
      </div>
      <div className="text-xl font-black tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

/* ────────────────────────────────
   Emotion badge
   ──────────────────────────────── */
const EMOTIONS = [
  { value: "disciplined", label: "Disciplined", color: "text-accent" },
  { value: "patient", label: "Patient", color: "text-blue-400" },
  { value: "fomo", label: "FOMO", color: "text-orange-400" },
  { value: "revenge", label: "Revenge", color: "text-bear" },
  { value: "greedy", label: "Greedy", color: "text-yellow-400" },
  { value: "fearful", label: "Fearful", color: "text-purple-400" },
];

function EmotionBadge({ tag }) {
  const e = EMOTIONS.find((em) => em.value === tag);
  if (!e) return <span className="text-muted text-xs">—</span>;
  return (
    <span className={`text-xs font-semibold ${e.color}`}>{e.label}</span>
  );
}

/* ────────────────────────────────
   Add Trade Modal
   ──────────────────────────────── */
function AddTradeModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    symbol: "",
    side: "LONG",
    entry_price: "",
    exit_price: "",
    quantity: "",
    fees: "0",
    strategy_name: "",
    emotion_tag: "",
    followed_plan: true,
    notes: "",
    lesson_learned: "",
    opened_at: "",
    closed_at: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        entry_price: parseFloat(form.entry_price),
        exit_price: parseFloat(form.exit_price),
        quantity: parseFloat(form.quantity),
        fees: parseFloat(form.fees || 0),
        opened_at: new Date(form.opened_at).toISOString(),
        closed_at: new Date(form.closed_at).toISOString(),
      });
      onClose();
    } catch (err) {
      console.error("Failed to save trade:", err);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "bg-surface-light border border-border rounded-xl px-3 py-2.5 text-sm w-full focus:outline-none focus:border-accent/50 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-theme-bg/60 p-4">
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Log Trade</h2>
          <button onClick={onClose} className="text-muted hover:text-theme-text">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Symbol</label>
              <input
                className={inputCls}
                required
                placeholder="AAPL"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Side</label>
              <select
                className={inputCls}
                value={form.side}
                onChange={(e) => setForm({ ...form, side: e.target.value })}
              >
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Entry $</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                required
                value={form.entry_price}
                onChange={(e) => setForm({ ...form, entry_price: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Exit $</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                required
                value={form.exit_price}
                onChange={(e) => setForm({ ...form, exit_price: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Qty</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Opened At</label>
              <input
                className={inputCls}
                type="datetime-local"
                required
                value={form.opened_at}
                onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Closed At</label>
              <input
                className={inputCls}
                type="datetime-local"
                required
                value={form.closed_at}
                onChange={(e) => setForm({ ...form, closed_at: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Strategy</label>
              <input
                className={inputCls}
                placeholder="value_dip, swing..."
                value={form.strategy_name}
                onChange={(e) => setForm({ ...form, strategy_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Fees</label>
              <input
                className={inputCls}
                type="number"
                step="0.01"
                value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })}
              />
            </div>
          </div>

          {/* Emotion tags */}
          <div>
            <label className="text-xs text-muted mb-2 block">Emotion</label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map((em) => (
                <button
                  type="button"
                  key={em.value}
                  onClick={() => setForm({ ...form, emotion_tag: em.value })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    form.emotion_tag === em.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-white/20"
                  }`}
                >
                  {em.label}
                </button>
              ))}
            </div>
          </div>

          {/* Followed plan */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted">Followed Plan?</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, followed_plan: true })}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                form.followed_plan
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, followed_plan: false })}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                !form.followed_plan
                  ? "border-bear bg-bear/10 text-bear"
                  : "border-border text-muted"
              }`}
            >
              No
            </button>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Notes</label>
            <textarea
              className={inputCls + " resize-none h-16"}
              placeholder="What happened..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Lesson Learned</label>
            <textarea
              className={inputCls + " resize-none h-16"}
              placeholder="What I'd do differently..."
              value={form.lesson_learned}
              onChange={(e) => setForm({ ...form, lesson_learned: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="accent-btn w-full py-3 text-sm font-bold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Log Trade"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────────────────
   Reflection edit inline
   ──────────────────────────────── */
function ReflectionRow({ trade, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(trade.notes || "");
  const [emotion, setEmotion] = useState(trade.emotion_tag || "");
  const [plan, setPlan] = useState(trade.followed_plan);
  const [lesson, setLesson] = useState(trade.lesson_learned || "");
  const [saving, setSaving] = useState(false);

  const pnlPositive = trade.net_pnl >= 0;

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate(trade.id, {
        notes,
        emotion_tag: emotion || null,
        followed_plan: plan,
        lesson_learned: lesson || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const holdDisplay = trade.hold_duration_mins
    ? trade.hold_duration_mins < 60
      ? `${trade.hold_duration_mins}m`
      : `${Math.round(trade.hold_duration_mins / 60)}h`
    : "—";

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className="border-b border-border/50 hover:bg-surface-light/50 cursor-pointer transition-colors"
      >
        <td className="py-3 px-3 text-sm font-semibold">{trade.symbol}</td>
        <td className="py-3 px-3 text-xs text-muted">{trade.side}</td>
        <td className="py-3 px-3 text-sm">
          ${trade.entry_price?.toFixed(2)} → ${trade.exit_price?.toFixed(2)}
        </td>
        <td
          className={`py-3 px-3 text-sm font-bold ${
            pnlPositive ? "text-accent" : "text-bear"
          }`}
        >
          {pnlPositive ? "+" : ""}${trade.net_pnl?.toFixed(2)}
        </td>
        <td
          className={`py-3 px-3 text-xs font-semibold ${
            pnlPositive ? "text-accent" : "text-bear"
          }`}
        >
          {pnlPositive ? "+" : ""}{trade.pnl_pct?.toFixed(1)}%
        </td>
        <td className="py-3 px-3 text-xs text-muted">{holdDisplay}</td>
        <td className="py-3 px-3">
          <EmotionBadge tag={trade.emotion_tag} />
        </td>
        <td className="py-3 px-3 text-xs text-muted">
          {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : "—"}
        </td>
        <td className="py-3 px-2">
          {open ? (
            <ChevronUp size={14} className="text-muted" />
          ) : (
            <ChevronDown size={14} className="text-muted" />
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-light/30">
          <td colSpan={9} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-1 block">Notes</label>
                <textarea
                  className="bg-surface border border-border rounded-xl px-3 py-2 text-sm w-full resize-none h-20 focus:outline-none focus:border-accent/50"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">
                  Lesson Learned
                </label>
                <textarea
                  className="bg-surface border border-border rounded-xl px-3 py-2 text-sm w-full resize-none h-20 focus:outline-none focus:border-accent/50"
                  value={lesson}
                  onChange={(e) => setLesson(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="text-xs text-muted">Emotion:</span>
              {EMOTIONS.map((em) => (
                <button
                  key={em.value}
                  onClick={() => setEmotion(em.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    emotion === em.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-white/20"
                  }`}
                >
                  {em.label}
                </button>
              ))}

              <span className="text-xs text-muted ml-4">Plan:</span>
              <button
                onClick={() => setPlan(true)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  plan === true
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                <CheckCircle2 size={12} className="inline mr-1" />
                Yes
              </button>
              <button
                onClick={() => setPlan(false)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  plan === false
                    ? "border-bear bg-bear/10 text-bear"
                    : "border-border text-muted"
                }`}
              >
                <XCircle size={12} className="inline mr-1" />
                No
              </button>

              <button
                onClick={save}
                disabled={saving}
                className="ml-auto accent-btn text-xs px-4 py-1.5 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            {trade.strategy_name && (
              <div className="mt-3 text-xs text-muted">
                Strategy: <span className="text-theme-text font-medium">{trade.strategy_name}</span>
                {trade.scorecard_score != null && (
                  <span className="ml-3">
                    Score: <span className="text-accent font-medium">{trade.scorecard_score}/10</span>
                  </span>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ════════════════════════════════
   MAIN JOURNAL COMPONENT
   ════════════════════════════════ */
export default function Journal() {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [period, setPeriod] = useState(30);
  const [tab, setTab] = useState("overview"); // overview | trades | signals

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tradesRes, statsRes, balRes] = await Promise.all([
        getTrades({ limit: 100 }),
        getTradeStats({ days: period }),
        getBalance({ limit: 90 }),
      ]);
      setTrades(tradesRes.data.trades || []);
      setStats(statsRes.data);
      setBalances((balRes.data.balances || []).reverse());
    } catch (err) {
      console.error("Journal fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [period]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncOrders();
      await snapshotBalance();
      await fetchAll();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveTrade = async (data) => {
    await createTrade(data);
    await fetchAll();
  };

  const handleUpdateTrade = async (id, data) => {
    await updateTrade(id, data);
    // Optimistic: update local state
    setTrades((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...data } : t))
    );
  };

  /* ── Mobile tab layout ── */
  const tabs = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "trades", label: "Trades", icon: TrendingUp },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-3xl font-black tracking-tight">Trade Journal</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="ghost-btn text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Webull"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="accent-btn text-xs flex items-center gap-1.5"
          >
            <Plus size={13} />
            Log Trade
          </button>
        </div>
      </div>

      {/* Period filter + Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex bg-surface rounded-xl border border-border overflow-hidden">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                tab === t.key
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-theme-text"
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex bg-surface rounded-xl border border-border overflow-hidden ml-auto">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${
                period === d
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-theme-text"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <RefreshCw size={20} className="animate-spin mx-auto text-accent mb-3" />
          <div className="text-muted text-sm">Loading journal...</div>
        </div>
      ) : tab === "overview" ? (
        <OverviewTab
          stats={stats}
          balances={balances}
          trades={trades}
          period={period}
        />
      ) : (
        <TradesTab
          trades={trades}
          onUpdateTrade={handleUpdateTrade}
        />
      )}

      {showModal && (
        <AddTradeModal onClose={() => setShowModal(false)} onSave={handleSaveTrade} />
      )}
    </div>
  );
}

/* ────────────────────────────────
   OVERVIEW TAB
   ──────────────────────────────── */
function OverviewTab({ stats, balances, trades, period }) {
  if (!stats || stats.total_trades === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <Target size={24} className="text-accent" />
        </div>
        <div className="text-theme-text font-semibold mb-2">No trades yet</div>
        <div className="text-muted text-sm">
          Log your first trade or sync from Webull to see your stats.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total P&L"
          value={`${stats.total_pnl >= 0 ? "+" : ""}$${stats.total_pnl.toFixed(2)}`}
          sub={`${stats.total_trades} trades`}
          icon={DollarSign}
          accent
        />
        <StatCard
          label="Win Rate"
          value={`${stats.win_rate}%`}
          sub={`${period}d window`}
          icon={Target}
          accent
        />
        <StatCard
          label="Profit Factor"
          value={stats.profit_factor === Infinity ? "∞" : stats.profit_factor.toFixed(2)}
          sub="wins / losses"
          icon={BarChart3}
        />
        <StatCard
          label="Avg Hold"
          value={
            stats.avg_hold_mins < 60
              ? `${stats.avg_hold_mins}m`
              : `${(stats.avg_hold_mins / 60).toFixed(1)}h`
          }
          sub={`Plan adherence: ${stats.plan_adherence}%`}
          icon={Clock}
        />
      </div>

      {/* W/L avg row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs text-muted mb-1 flex items-center gap-1.5">
            <TrendingUp size={12} className="text-accent" /> Avg Winner
          </div>
          <div className="text-lg font-black text-accent">
            +${stats.avg_winner.toFixed(2)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted mb-1 flex items-center gap-1.5">
            <TrendingDown size={12} className="text-bear" /> Avg Loser
          </div>
          <div className="text-lg font-black text-bear">
            ${stats.avg_loser.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Balance chart */}
      {balances.length >= 2 && (
        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <Calendar size={12} />
            Account Balance
          </div>
          <BalanceChart data={balances} />
          <div className="flex justify-between mt-2 text-xs text-muted">
            <span>{balances[0]?.date}</span>
            <span>{balances[balances.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Calendar heatmap */}
      <DotCalendar trades={trades} />

      {/* Strategy breakdown */}
      {stats.by_strategy && Object.keys(stats.by_strategy).length > 0 && (
        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <Zap size={12} className="text-accent" />
            By Strategy
          </div>
          <div className="space-y-2">
            {Object.entries(stats.by_strategy).map(([name, data]) => (
              <div
                key={name}
                className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
              >
                <div>
                  <div className="text-sm font-semibold">{name}</div>
                  <div className="text-xs text-muted">
                    {data.count} trades · {Math.round((data.wins / data.count) * 100)}% win
                  </div>
                </div>
                <div
                  className={`text-sm font-bold ${
                    data.pnl >= 0 ? "text-accent" : "text-bear"
                  }`}
                >
                  {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emotion breakdown */}
      {stats.by_emotion && Object.keys(stats.by_emotion).length > 0 && (
        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5">
            <Brain size={12} />
            By Emotion
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_emotion).map(([tag, data]) => {
              const em = EMOTIONS.find((e) => e.value === tag);
              return (
                <div
                  key={tag}
                  className="bg-surface-light border border-border/50 rounded-xl px-3 py-2"
                >
                  <div className={`text-xs font-semibold ${em?.color || "text-muted"}`}>
                    {em?.label || tag}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {data.count} trades ·{" "}
                    <span className={data.pnl >= 0 ? "text-accent" : "text-bear"}>
                      {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent trades preview */}
      {trades.length > 0 && (
        <div className="card p-4">
          <div className="text-xs text-muted font-medium mb-3">Recent Trades</div>
          <div className="space-y-2">
            {trades.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      t.net_pnl >= 0 ? "bg-accent/10" : "bg-bear/10"
                    }`}
                  >
                    {t.net_pnl >= 0 ? (
                      <TrendingUp size={14} className="text-accent" />
                    ) : (
                      <TrendingDown size={14} className="text-bear" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.symbol}</div>
                    <div className="text-xs text-muted">
                      {t.side} · {t.quantity} shares
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      t.net_pnl >= 0 ? "text-accent" : "text-bear"
                    }`}
                  >
                    {t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted">
                    {t.closed_at
                      ? new Date(t.closed_at).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────
   TRADES TAB (full table)
   ──────────────────────────────── */
function TradesTab({ trades, onUpdateTrade }) {
  if (trades.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-muted text-sm">
          No trades logged yet. Click "Log Trade" or sync from Webull.
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-border text-xs text-muted font-medium">
            <th className="py-3 px-3 text-left">Symbol</th>
            <th className="py-3 px-3 text-left">Side</th>
            <th className="py-3 px-3 text-left">Entry → Exit</th>
            <th className="py-3 px-3 text-left">P&L</th>
            <th className="py-3 px-3 text-left">%</th>
            <th className="py-3 px-3 text-left">Hold</th>
            <th className="py-3 px-3 text-left">Emotion</th>
            <th className="py-3 px-3 text-left">Date</th>
            <th className="py-3 px-2 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <ReflectionRow key={t.id} trade={t} onUpdate={onUpdateTrade} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

