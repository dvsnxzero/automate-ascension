import { useEffect, useState, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getAccount, getPositions, getWatchlist, healthCheck } from "../services/api";
import DotLogo from "./DotLogo";

// Mini sparkline SVG component
function Sparkline({ data = [], positive = true, width = 100, height = 40 }) {
  if (data.length < 2) {
    const pts = Array.from({ length: 20 }, (_, i) => ({
      x: (i / 19) * width,
      y: height / 2 + (Math.random() - 0.5) * (height * 0.75),
    }));
    data = pts;
  }
  const points = data.map((p) => `${p.x},${p.y}`).join(" ");
  const color = positive ? "var(--color-bull)" : "var(--color-bear)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-60">
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
  const [activeTab, setActiveTab] = useState("Portfolio");
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const cardScrollRef = useRef(null);

  useEffect(() => {
    healthCheck()
      .then(() => setApiConnected(true))
      .catch(() => setApiConnected(false));

    getAccount().then((r) => setAccount(r.data)).catch(() => {});
    getPositions().then((r) => setPositions(r.data.positions || [])).catch(() => {});
    getWatchlist().then((r) => setWatchlist(r.data.items || [])).catch(() => {});
  }, []);

  const demoPositions = [
    { symbol: "AAPL", name: "Apple", price: 273.25, change: 8.73 },
    { symbol: "GOOG", name: "Google", price: 491.24, change: 0.94 },
    { symbol: "AMZN", name: "Amazon", price: 216.21, change: 2.21 },
    { symbol: "TSLA", name: "Tesla", price: 367.67, change: 4.62 },
  ];

  const displayPositions = positions.length > 0 ? positions : demoPositions;
  const portfolioValue = account?.total_value ?? 12345.67;
  const tabs = ["Portfolio", "Watchlist", "Movers", "Scanner"];

  // Scroll to card by index
  const scrollToCard = (index) => {
    if (!cardScrollRef.current) return;
    const cards = cardScrollRef.current.children;
    if (cards[index]) {
      cards[index].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setActiveCardIndex(index);
    }
  };

  // Handle scroll snap end to update dot indicators
  const handleCardScroll = () => {
    if (!cardScrollRef.current) return;
    const container = cardScrollRef.current;
    const cardWidth = container.children[0]?.offsetWidth || 1;
    const index = Math.round(container.scrollLeft / cardWidth);
    setActiveCardIndex(index);
  };

  // ========== MOBILE LAYOUT ==========
  const MobileLayout = () => (
    <div className="md:hidden flex flex-col min-h-screen pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="text-xs text-muted font-medium font-mono tracking-wider uppercase">
          {account?.account_type?.toUpperCase() ?? "Paper"} Mode
        </div>
        <button className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted">
          <Bell size={16} />
        </button>
      </div>

      {/* Tab chips — scrollable */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setActiveCardIndex(0); }}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
              activeTab === tab
                ? "bg-accent text-black"
                : "bg-surface border border-border text-muted"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Connection status - mobile */}
      {!apiConnected && (
        <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-surface border border-border flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-bear animate-pulse" />
          <span className="text-xs text-muted">Backend offline</span>
        </div>
      )}

      {/* Hero area — depends on active tab */}
      {activeTab === "Portfolio" && (
        <>
          {/* Portfolio value */}
          <div className="px-4 pt-2 pb-4">
            <p className="text-muted text-xs font-medium mb-1">Total Value</p>
            <h1 className="text-4xl font-black tracking-tight font-tabular">
              ${typeof portfolioValue === "number"
                ? portfolioValue.toLocaleString("en-US", { minimumFractionDigits: 2 })
                : portfolioValue}
            </h1>
            <div className="flex gap-2 mt-3">
              {["1W", "1M", "6M", "1Y"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    timeRange === range
                      ? "bg-accent text-black"
                      : "bg-surface border border-border text-muted"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row — horizontal scroll */}
          <div className="flex gap-3 px-4 pb-4 overflow-x-auto no-scrollbar">
            <MiniStat label="Buying Power" value={account?.buying_power} icon={DollarSign} />
            <MiniStat label="Day P&L" value={account?.day_pnl ?? "+$0.00"} icon={TrendingUp} positive={account?.day_pnl >= 0} />
            <MiniStat label="Portfolio" value={account?.total_value} icon={BarChart3} />
          </div>

          {/* Swipeable position cards */}
          <div className="px-4 mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Positions</h2>
            <div className="flex gap-1">
              {displayPositions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollToCard(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    i === activeCardIndex ? "bg-accent w-5" : "bg-surface-light"
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            ref={cardScrollRef}
            onScroll={handleCardScroll}
            className="flex gap-4 px-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4"
          >
            {displayPositions.map((pos) => (
              <Link
                key={pos.symbol}
                to={`/chart/${pos.symbol}`}
                className="snap-center shrink-0 w-[85vw] max-w-[340px] rounded-2xl bg-surface border border-border p-5 flex flex-col"
              >
                {/* Card header */}
                <div className="flex items-center gap-3 mb-4">
                  <DotLogo ticker={pos.symbol} size={48} />
                  <div className="flex-1">
                    <div className="font-bold text-base">{pos.symbol}</div>
                    <div className="text-muted text-xs">{pos.name || pos.symbol}</div>
                  </div>
                  <div className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    (pos.change ?? 0) >= 0 ? "bg-accent/10 text-accent" : "bg-bear/10 text-bear"
                  }`}>
                    {(pos.change ?? 0) >= 0 ? "+" : ""}{(pos.change ?? 0).toFixed(2)}%
                  </div>
                </div>

                {/* Sparkline — full width */}
                <div className="mb-4">
                  <Sparkline positive={(pos.change ?? 0) >= 0} width={280} height={80} />
                </div>

                {/* Price */}
                <div className="flex items-end justify-between mt-auto">
                  <div>
                    <div className="text-muted text-xs mb-0.5">Last Price</div>
                    <div className="text-2xl font-black font-tabular">
                      ${typeof pos.price === "number"
                        ? pos.price.toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : pos.price}
                    </div>
                  </div>
                  <div className="text-accent text-xs font-semibold flex items-center gap-1">
                    View Chart <ArrowUpRight size={12} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {activeTab === "Watchlist" && (
        <div className="px-4 pt-2 flex-1">
          {watchlist.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-8 text-center">
              <div className="text-muted text-sm mb-2">Watchlist empty</div>
              <div className="text-muted/50 text-xs">Add symbols from Chart or Scanner</div>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface border border-border divide-y divide-border overflow-hidden">
              {watchlist.map((item) => (
                <Link
                  key={item.id}
                  to={`/chart/${item.symbol}`}
                  className="flex items-center justify-between px-4 py-4 active:bg-surface-light"
                >
                  <div className="flex items-center gap-3">
                    <DotLogo ticker={item.symbol} size={36} />
                    <span className="font-semibold text-sm">{item.symbol}</span>
                  </div>
                  <span className="text-xs text-muted">{item.strategy}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "Movers" && (
        <div className="px-4 pt-2 flex-1">
          <div className="rounded-2xl bg-surface border border-border p-8 text-center">
            <div className="text-accent text-sm font-semibold mb-1">Coming soon</div>
            <div className="text-muted/50 text-xs">Top gainers & losers from market data</div>
          </div>
        </div>
      )}

      {activeTab === "Scanner" && (
        <div className="px-4 pt-2 flex-1">
          <Link
            to="/scanner"
            className="block rounded-2xl bg-surface border border-border p-6 active:bg-surface-light"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <ScanSearch size={20} />
              </div>
              <div>
                <div className="font-bold text-sm">Morning Scanner</div>
                <div className="text-muted text-xs">Find today's best setups</div>
              </div>
            </div>
            <div className="text-accent text-xs font-semibold flex items-center gap-1">
              Open Scanner <ArrowUpRight size={12} />
            </div>
          </Link>
        </div>
      )}

      {/* Quick actions — bottom section */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          <Link to="/scanner" className="shrink-0 flex flex-col items-center gap-2 w-20">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <ScanSearch size={20} />
            </div>
            <span className="text-[10px] text-muted font-medium">Scanner</span>
          </Link>
          <Link to="/chart" className="shrink-0 flex flex-col items-center gap-2 w-20">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <BarChart3 size={20} />
            </div>
            <span className="text-[10px] text-muted font-medium">Chart</span>
          </Link>
          <Link to="/notes" className="shrink-0 flex flex-col items-center gap-2 w-20">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <BookOpen size={20} />
            </div>
            <span className="text-[10px] text-muted font-medium">Notes</span>
          </Link>
          <Link to="/journal" className="shrink-0 flex flex-col items-center gap-2 w-20">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] text-muted font-medium">Journal</span>
          </Link>
        </div>
      </div>
    </div>
  );

  // ========== DESKTOP LAYOUT (unchanged) ==========
  const DesktopLayout = () => (
    <div className="hidden md:block p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-muted text-sm font-medium mb-1">Portfolio overview</p>
          <h1 className="text-5xl font-black tracking-tight font-tabular">
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
                : "bg-surface border border-border text-muted hover:text-theme-text hover:border-border-light"
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Buying Power" value={account?.buying_power ?? "—"} icon={DollarSign} />
        <StatCard label="Portfolio" value={account?.total_value ?? "—"} icon={BarChart3} />
        <StatCard label="Day P&L" value={account?.day_pnl ?? "+$0.00"} icon={account?.day_pnl >= 0 ? TrendingUp : TrendingDown} positive={account?.day_pnl >= 0} />
        <StatCard label="Mode" value={account?.account_type?.toUpperCase() ?? "PAPER"} icon={BarChart3} isAccent />
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
              <DotLogo ticker={pos.symbol} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{pos.name || pos.symbol}</div>
                <div className="text-muted text-xs">{pos.symbol}</div>
              </div>
              <Sparkline positive={(pos.change ?? pos.change_pct ?? 0) >= 0} />
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
        <div className="grid grid-cols-3 gap-3">
          <QuickAction to="/scanner" icon={ScanSearch} title="Morning Scanner" desc="Find today's best setups" />
          <QuickAction to="/chart" icon={BarChart3} title="Open Chart" desc="Analyze with SMA, RSI, MACD" />
          <QuickAction to="/notes" icon={BookOpen} title="Course Notes" desc="Review ZipTrader strategies" />
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

  return (
    <>
      <MobileLayout />
      <DesktopLayout />
    </>
  );
}

function MiniStat({ label, value, icon: Icon, positive = true }) {
  return (
    <div className="shrink-0 rounded-xl bg-surface border border-border px-4 py-3 min-w-[130px]">
      <div className="flex items-center gap-1.5 text-muted text-[10px] font-medium mb-1">
        <Icon size={11} />
        {label}
      </div>
      <div className={`text-sm font-bold font-tabular ${positive ? "text-theme-text" : "text-bear"}`}>
        {typeof value === "number"
          ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
          : value ?? "—"}
      </div>
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
        isAccent ? "text-accent" : positive ? "text-theme-text" : "text-bear"
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
