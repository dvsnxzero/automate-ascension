import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ScanSearch,
  BookOpen,
  ArrowUpRight,
  Bell,
} from "lucide-react";
import { getAccount, getPositions, getWatchlist, healthCheck } from "../services/api";

// Mini sparkline SVG component
function Sparkline({ data = [], positive = true }) {
  const h = 40;
  const w = 100;
  if (data.length < 2) {
    // Generate random sparkline data for demo
    const pts = Array.from({ length: 20 }, (_, i) => ({
      x: (i / 19) * w,
      y: h / 2 + (Math.random() - 0.5) * 30,
    }));
    data = pts;
  }
  const points = data.map((p) => `${p.x},${p.y}`).join(" ");
  const color = positive ? "#DCFC36" : "#FF4757";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Dashboard() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [timeRange, setTimeRange] = useState("1M");

  useEffect(() => {
    healthCheck()
      .then(() => setApiConnected(true))
      .catch(() => setApiConnected(false));

    getAccount().then((r) => setAccount(r.data)).catch(() => {});
    getPositions().then((r) => setPositions(r.data.positions || [])).catch(() => {});
    getWatchlist().then((r) => setWatchlist(r.data.items || [])).catch(() => {});
  }, []);

  // Demo positions for display
  const demoPositions = [
    { symbol: "AAPL", name: "Apple", price: 273.25, change: 8.73 },
    { symbol: "GOOG", name: "Google", price: 491.24, change: 0.94 },
    { symbol: "AMZN", name: "Amazon", price: 216.21, change: 2.21 },
    { symbol: "TSLA", name: "Tesla", price: 367.67, change: 4.62 },
  ];

  const displayPositions = positions.length > 0 ? positions : demoPositions;
  const portfolioValue = account?.total_value ?? 12345.67;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-muted text-sm font-medium mb-1">Portfolio overview</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight font-tabular">
            ${typeof portfolioValue === "number"
              ? portfolioValue.toLocaleString("en-US", { minimumFractionDigits: 2 })
              : portfolioValue}
          </h1>
        </div>
        <button className="w-10 h-10 rounded-xl border border-border flex items-center justify-center text-muted hover:text-accent hover:border-accent transition-colors">
          <Bell size={18} />
        </button>
      </div>

      {/* Connection status */}
      {!apiConnected && (
        <div className="card p-4 mb-6 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-bear animate-pulse" />
          <span className="text-sm text-muted">
            Backend offline —{" "}
            <code className="text-accent/70 font-mono text-xs">
              cd backend && uvicorn app.main:app --reload
            </code>
          </span>
        </div>
      )}

      {/* Time range selector */}
      <div className="flex gap-2 mb-6">
        {["1W", "1M", "6M", "1Y"].map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              timeRange === range
                ? "bg-accent text-black"
                : "bg-surface border border-border text-muted hover:text-white hover:border-border-light"
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Buying Power"
          value={account?.buying_power ?? "—"}
          icon={DollarSign}
        />
        <StatCard
          label="Portfolio"
          value={account?.total_value ?? "—"}
          icon={BarChart3}
        />
        <StatCard
          label="Day P&L"
          value={account?.day_pnl ?? "+$0.00"}
          icon={account?.day_pnl >= 0 ? TrendingUp : TrendingDown}
          positive={account?.day_pnl >= 0}
        />
        <StatCard
          label="Mode"
          value={account?.account_type?.toUpperCase() ?? "PAPER"}
          icon={BarChart3}
          isAccent
        />
      </div>

      {/* Portfolio positions */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Portfolio positions</h2>
          <Link to="/chart" className="text-accent text-sm font-medium flex items-center gap-1 hover:underline">
            View all <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="space-y-3">
          {displayPositions.map((pos) => (
            <Link
              key={pos.symbol}
              to={`/chart/${pos.symbol}`}
              className="card-hover flex items-center gap-4 p-4"
            >
              {/* Symbol icon */}
              <div className="w-10 h-10 rounded-xl bg-surface-light border border-border flex items-center justify-center text-accent font-bold text-sm">
                {pos.symbol[0]}
              </div>

              {/* Name + symbol */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{pos.name || pos.symbol}</div>
                <div className="text-muted text-xs">{pos.symbol}</div>
              </div>

              {/* Sparkline */}
              <Sparkline positive={(pos.change ?? pos.change_pct ?? 0) >= 0} />

              {/* Price + change */}
              <div className="text-right">
                <div className={`text-sm font-semibold px-3 py-1 rounded-lg ${
                  (pos.change ?? pos.change_pct ?? 0) >= 0
                    ? "bg-accent/10 text-accent"
                    : "bg-bear/10 text-bear"
                }`}>
                  {typeof pos.price === "number"
                    ? pos.price.toLocaleString("en-US", { minimumFractionDigits: 2 })
                    : pos.price}
                </div>
                <div className={`text-xs mt-1 font-medium ${
                  (pos.change ?? pos.change_pct ?? 0) >= 0 ? "text-accent" : "text-bear"
                }`}>
                  {(pos.change ?? pos.change_pct ?? 0) >= 0 ? "+" : ""}
                  {(pos.change ?? pos.change_pct ?? 0).toFixed(2)}%
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            to="/scanner"
            icon={ScanSearch}
            title="Morning Scanner"
            desc="Find today's best setups"
          />
          <QuickAction
            to="/chart"
            icon={BarChart3}
            title="Open Chart"
            desc="Analyze with SMA, RSI, MACD"
          />
          <QuickAction
            to="/notes"
            icon={BookOpen}
            title="Course Notes"
            desc="Review ZipTrader strategies"
          />
        </div>
      </section>

      {/* Watchlist */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Watchlist</h2>
        </div>
        {watchlist.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-muted text-sm">
              Watchlist empty. Add symbols from Chart or Scanner.
            </div>
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {watchlist.map((item) => (
              <Link
                key={item.id}
                to={`/chart/${item.symbol}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-light transition-colors"
              >
                <span className="font-semibold text-sm">{item.symbol}</span>
                <span className="text-xs text-muted">{item.strategy}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, positive = true, isAccent = false }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-muted text-xs font-medium mb-2">
        <Icon size={14} />
        {label}
      </div>
      <div className={`text-lg font-bold font-tabular ${
        isAccent ? "text-accent" : positive ? "text-white" : "text-bear"
      }`}>
        {typeof value === "number"
          ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
          : value}
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc }) {
  return (
    <Link
      to={to}
      className="card-hover p-4 flex items-center gap-4 group"
    >
      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-black transition-all duration-200">
        <Icon size={20} />
      </div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
    </Link>
  );
}
