import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Star, TrendingUp, Grid3X3 } from "lucide-react";
import { getBars, getQuote, addToWatchlist, searchSymbol } from "../services/api";
import { useTheme } from "../hooks/useTheme";
import DotLogo from "./DotLogo";
import DotChart from "./DotChart";

// Read CSS variable as a hex/rgb string
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function ChartView() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [symbol, setSymbol] = useState(urlSymbol?.toUpperCase() || "AAPL");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [interval, setInterval] = useState("1d");
  const [chartError, setChartError] = useState(null);
  const [stockInfo, setStockInfo] = useState({ name: "", type: "", exchange: "" });
  const [priceInfo, setPriceInfo] = useState({ price: null, change: null, changePct: null, open: null, high: null, low: null, volume: null });
  const [dataSource, setDataSource] = useState(null); // "webull" | "yahoo" | "demo"
  const [noResults, setNoResults] = useState(false);
  const [quoteData, setQuoteData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [chartMode, setChartMode] = useState("candle"); // "candle" | "dot"
  const [rawBars, setRawBars] = useState([]);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const { isDark } = useTheme();

  // Responsive chart height
  const getChartHeight = () => {
    if (typeof window === "undefined") return 400;
    const w = window.innerWidth;
    if (w < 768) return 320;
    if (w >= 1400) return 620;
    return 500;
  };

  // Fetch company name when symbol changes
  useEffect(() => {
    let cancelled = false;
    setStockInfo({ name: "", type: "", exchange: "" });
    searchSymbol(symbol).then((res) => {
      if (cancelled) return;
      const match = (res.data.results || []).find(
        (r) => r.symbol.toUpperCase() === symbol.toUpperCase()
      ) || res.data.results?.[0];
      if (match) {
        setStockInfo({ name: match.name || "", type: match.type || "", exchange: match.exchange || "" });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // Fetch detailed quote data when symbol changes
  useEffect(() => {
    let cancelled = false;
    setQuoteData(null);
    getQuote(symbol).then((res) => {
      if (cancelled) return;
      if (res.data && res.data.price) setQuoteData(res.data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // Load chart
  useEffect(() => {
    let chart;
    let resizeObserver;
    let cancelled = false;

    const loadChart = async () => {
      try {
        const { createChart } = await import("lightweight-charts");
        if (!chartContainerRef.current || cancelled) return;

        chartContainerRef.current.innerHTML = "";
        setChartError(null);

        const height = getChartHeight();

        // Read theme colors from CSS variables
        const surfaceColor = cssVar("--color-surface");
        const mutedColor = cssVar("--color-muted");
        const surfaceLightColor = cssVar("--color-surface-light");
        const accentColor = cssVar("--color-accent");
        const borderColor = cssVar("--color-border");
        const bullColor = cssVar("--color-bull");
        const bearColor = cssVar("--color-bear");

        chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height,
          layout: {
            background: { color: surfaceColor },
            textColor: mutedColor,
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          },
          grid: {
            vertLines: { color: surfaceLightColor },
            horzLines: { color: surfaceLightColor },
          },
          crosshair: {
            mode: 0,
            vertLine: { color: accentColor, width: 1, style: 2 },
            horzLine: { color: accentColor, width: 1, style: 2 },
          },
          timeScale: {
            borderColor: borderColor,
            timeVisible: interval !== "1d" && interval !== "1w",
          },
          rightPriceScale: {
            borderColor: borderColor,
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false, // Let page scroll vertically through chart
          },
          handleScale: {
            mouseWheel: true,
            pinch: true,
          },
        });

        chartRef.current = chart;

        const candleSeries = chart.addCandlestickSeries({
          upColor: bullColor,
          downColor: bearColor,
          borderUpColor: bullColor,
          borderDownColor: bearColor,
          wickUpColor: bullColor,
          wickDownColor: bearColor,
        });

        // Try real data first, fall back to demo
        let bars = null;
        let barSource = "demo";
        try {
          const res = await getBars(symbol, interval);
          if (cancelled) return;
          if (res.data.bars && res.data.bars.length > 0) {
            bars = res.data.bars;
            barSource = res.data.source || "api";
          }
        } catch {
          if (cancelled) return;
        }

        if (!bars || bars.length === 0) {
          bars = generateDemoData(interval);
          barSource = "demo";
        }

        if (!cancelled) setDataSource(barSource);

        if (cancelled) return;

        // Normalize bar time values for lightweight-charts
        // Daily/weekly: must be "YYYY-MM-DD" string
        // Intraday: must be Unix timestamp (number)
        const isIntraday = ["1m","5m","15m","30m","1h","4h"].includes(interval);
        bars = bars.map((b) => {
          let t = b.time;
          if (isIntraday) {
            // Ensure Unix timestamp (seconds)
            if (typeof t === "string") {
              t = Math.floor(new Date(t).getTime() / 1000);
            }
          } else {
            // Ensure "YYYY-MM-DD" string
            if (typeof t === "number") {
              t = new Date(t * 1000).toISOString().split("T")[0];
            } else if (typeof t === "string" && t.includes("T")) {
              t = t.split("T")[0];
            }
          }
          return { ...b, time: t };
        }).filter((b) => b.time && b.open && b.close);

        // Sort by time ascending (lightweight-charts requires this)
        bars.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

        // Remove duplicate timestamps
        const seen = new Set();
        bars = bars.filter((b) => {
          const k = String(b.time);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        if (bars.length === 0) {
          bars = generateDemoData(interval);
        }

        candleSeries.setData(bars);
        if (!cancelled) setRawBars(bars);
        chart.timeScale().fitContent();

        // Compute price info from bars
        if (bars.length >= 2) {
          const last = bars[bars.length - 1];
          const first = bars[0];
          const change = last.close - first.open;
          const changePct = (change / first.open) * 100;
          // Session high/low/volume from all bars
          let sessionHigh = -Infinity, sessionLow = Infinity;
          for (const b of bars) {
            if (b.high > sessionHigh) sessionHigh = b.high;
            if (b.low < sessionLow) sessionLow = b.low;
          }
          setPriceInfo({
            price: last.close,
            change,
            changePct,
            open: first.open,
            high: sessionHigh,
            low: sessionLow,
            volume: null, // bars don't include volume
          });
        } else if (bars.length === 1) {
          const b = bars[0];
          setPriceInfo({
            price: b.close,
            change: b.close - b.open,
            changePct: ((b.close - b.open) / b.open) * 100,
            open: b.open, high: b.high, low: b.low, volume: null,
          });
        }

        // Add SMA overlay if we have enough data
        if (bars.length >= 9 && !cancelled) {
          const sma9Data = computeSMA(bars, 9);
          if (sma9Data.length > 0) {
            const sma9Series = chart.addLineSeries({
              color: accentColor,
              lineWidth: 1.5,
              title: "SMA 9",
              lastValueVisible: false,
              priceLineVisible: false,
            });
            sma9Series.setData(sma9Data);
          }
        }

        if (bars.length >= 50 && !cancelled) {
          const sma50Data = computeSMA(bars, 50);
          if (sma50Data.length > 0) {
            const sma50Series = chart.addLineSeries({
              color: mutedColor,
              lineWidth: 1,
              lineStyle: 2,
              title: "SMA 50",
              lastValueVisible: false,
              priceLineVisible: false,
            });
            sma50Series.setData(sma50Data);
          }
        }

        // Responsive resize
        resizeObserver = new ResizeObserver((entries) => {
          if (entries[0] && chart) {
            const { width } = entries[0].contentRect;
            chart.applyOptions({ width });
          }
        });
        resizeObserver.observe(chartContainerRef.current);

      } catch (err) {
        console.error("Chart load error:", err);
        setChartError("Failed to load chart library");
      }
    };

    loadChart();

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (chart) chart.remove();
      chartRef.current = null;
    };
  }, [symbol, interval, isDark]);

  // Debounced search as user types
  const handleSearchInput = (value) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    setSearchOpen(true);
    setNoResults(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchSymbol(value.trim());
        const results = res.data.results || [];
        setSearchResults(results);
        setSuggestions(res.data.suggestions || []);
        setNoResults(results.length === 0);
      } catch {
        setSearchResults([]);
        setNoResults(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const selectResult = (sym) => {
    setSymbol(sym.toUpperCase());
    navigate(`/chart/${sym.toUpperCase()}`);
    setSearchInput("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      if (searchResults.length > 0) {
        selectResult(searchResults[0].symbol);
      } else {
        // Still navigate — the backend will try Yahoo Finance for the ticker
        // If it's truly invalid, the chart will show the demo data warning
        selectResult(searchInput.trim());
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddToWatchlist = async () => {
    try {
      await addToWatchlist({ symbol, strategy: "manual" });
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    }
  };

  return (
    <div className="flex flex-col h-full pb-28 md:pb-8">
      {/* Sticky header — stock info + search + intervals */}
      <div className="sticky top-0 z-10 bg-theme-bg/95 backdrop-blur-sm border-b border-border/50 px-4 md:px-8 py-3">
        <div className="max-w-[1800px] mx-auto">
          {/* Top row: stock identity + search */}
          <div className="flex items-center gap-3 mb-2">
            {/* Stock identity block */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <DotLogo ticker={symbol} size={44} className="shrink-0 hidden sm:block" />
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <DotLogo ticker={symbol} size={28} className="shrink-0 sm:hidden" />
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">{symbol}</h1>
                  <button
                    onClick={handleAddToWatchlist}
                    className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted hover:text-accent hover:border-accent transition-colors"
                    title="Add to watchlist"
                  >
                    <Star size={12} />
                  </button>
                </div>
                {stockInfo.name && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted truncate max-w-[200px]">{stockInfo.name}</span>
                    {stockInfo.type && (
                      <span className="text-[9px] font-semibold text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                        {stockInfo.type}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Price block */}
              {priceInfo.price !== null && (
                <div className="ml-4 shrink-0 hidden sm:block">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl md:text-3xl font-black font-mono">
                      ${priceInfo.price.toFixed(2)}
                    </span>
                    <span className={`text-sm font-bold ${priceInfo.change >= 0 ? "text-bull" : "text-bear"}`}>
                      {priceInfo.change >= 0 ? "+" : ""}{priceInfo.change.toFixed(2)}
                    </span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      priceInfo.changePct >= 0
                        ? "bg-bull/10 text-bull"
                        : "bg-bear/10 text-bear"
                    }`}>
                      {priceInfo.changePct >= 0 ? "+" : ""}{priceInfo.changePct.toFixed(2)}%
                    </span>
                  </div>
                  {/* Mini stats row */}
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted font-mono">
                    <span>O {priceInfo.open?.toFixed(2)}</span>
                    <span>H {priceInfo.high?.toFixed(2)}</span>
                    <span>L {priceInfo.low?.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSearch} className="ml-auto" ref={searchRef}>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  placeholder="Search stocks, ETFs..."
                  className="bg-surface border border-border rounded-xl pl-8 pr-3 py-2 text-[16px] md:text-sm focus:outline-none focus:border-accent/50 w-44 md:w-64 transition-colors"
                />

                {/* Autocomplete dropdown */}
                {searchOpen && (searchResults.length > 0 || searchLoading || noResults) && (
                  <div className="absolute top-full right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-72 overflow-y-auto w-72 md:w-80">
                    {searchLoading && searchResults.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted">Searching...</div>
                    ) : noResults && searchResults.length === 0 ? (
                      <div className="px-4 py-3">
                        <div className="text-sm text-muted mb-2">
                          No matches for "<span className="font-semibold text-theme-text">{searchInput}</span>"
                        </div>
                        {suggestions.length > 0 && (
                          <div>
                            <div className="text-[10px] text-muted/60 uppercase tracking-wider font-semibold mb-1.5">Did you mean?</div>
                            {suggestions.map((s, i) => (
                              <button
                                key={`sug-${s.symbol}-${i}`}
                                type="button"
                                onClick={() => selectResult(s.symbol)}
                                className="w-full px-2 py-2 flex items-center gap-3 hover:bg-surface-light transition-colors text-left rounded-lg"
                              >
                                <DotLogo ticker={s.symbol} size={28} className="shrink-0" />
                                <div>
                                  <span className="font-bold text-xs">{s.symbol}</span>
                                  <span className="text-xs text-muted ml-2">{s.name}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      searchResults.map((r, i) => (
                        <button
                          key={`${r.symbol}-${i}`}
                          type="button"
                          onClick={() => selectResult(r.symbol)}
                          className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-surface-light transition-colors text-left"
                        >
                          <DotLogo ticker={r.symbol} size={24} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs">{r.symbol}</span>
                              {r.type && (
                                <span className="text-[9px] font-medium text-muted bg-surface-light px-1 py-0.5 rounded truncate max-w-[80px]">
                                  {r.type}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted truncate">{r.name}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Mobile price display */}
          {priceInfo.price !== null && (
            <div className="flex items-center gap-3 mb-2 sm:hidden">
              <span className="text-xl font-black font-mono">${priceInfo.price.toFixed(2)}</span>
              <span className={`text-sm font-bold ${priceInfo.change >= 0 ? "text-bull" : "text-bear"}`}>
                {priceInfo.change >= 0 ? "+" : ""}{priceInfo.change.toFixed(2)}
              </span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                priceInfo.changePct >= 0 ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear"
              }`}>
                {priceInfo.changePct >= 0 ? "+" : ""}{priceInfo.changePct.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Interval buttons row + chart mode toggle */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center">
            {["1m", "5m", "15m", "1h", "1d", "1w"].map((int) => (
              <button
                key={int}
                onClick={() => setInterval(int)}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0 ${
                  interval === int
                    ? "bg-accent text-black"
                    : "bg-surface border border-border text-muted hover:text-theme-text hover:border-border-light"
                }`}
              >
                {int}
              </button>
            ))}
            {/* Chart mode toggle */}
            <div className="ml-auto flex bg-surface rounded-lg border border-border overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setChartMode("candle")}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  chartMode === "candle" ? "bg-accent/10 text-accent" : "text-muted"
                }`}
                title="Candlestick"
              >
                <TrendingUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => setChartMode("dot")}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  chartMode === "dot" ? "bg-accent/10 text-accent" : "text-muted"
                }`}
                title="Dot Matrix"
              >
                <Grid3X3 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chart + indicators */}
      <div className="flex-1 px-4 md:px-8 pt-4 min-w-0">
        <div className="max-w-[1800px] mx-auto">
          {/* Data source badge */}
          {dataSource === "demo" && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-bear/10 border border-bear/20 text-bear text-xs font-semibold inline-flex items-center gap-2">
              <span>⚠ Demo data — real prices unavailable for this symbol</span>
            </div>
          )}
          {dataSource === "yahoo" && (
            <div className="mb-3 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-[10px] font-medium inline-flex items-center gap-1.5">
              Data via Yahoo Finance (delayed)
            </div>
          )}

          {/* Stock detail stats panel */}
          {quoteData && (
            <div className="mb-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/50">
              <StatCell label="Open" value={fmt(quoteData.open)} />
              <StatCell label="High" value={fmt(quoteData.high)} />
              <StatCell label="Low" value={fmt(quoteData.low)} />
              <StatCell label="Prev Close" value={fmt(quoteData.prev_close)} />
              <StatCell label="52W High" value={fmt(quoteData.fifty_two_week_high)} />
              <StatCell label="52W Low" value={fmt(quoteData.fifty_two_week_low)} />
              <StatCell label="Volume" value={fmtVol(quoteData.volume)} />
              <StatCell label="Mkt Cap" value={fmtCap(quoteData.market_cap)} />
              <StatCell label="Change" value={quoteData.change_pct != null ? `${quoteData.change_pct >= 0 ? "+" : ""}${quoteData.change_pct}%` : "—"} positive={quoteData.change_pct >= 0} />
            </div>
          )}

          {/* Chart container */}
          {chartMode === "dot" && rawBars.length > 0 && (
            <div className="card overflow-hidden mb-4 p-2">
              <DotChart bars={rawBars} symbol={symbol} height={typeof window !== "undefined" && window.innerWidth >= 1400 ? 560 : 340} />
            </div>
          )}
          {chartError && chartMode !== "dot" && (
            <div className="card p-10 text-center mb-4">
              <div className="text-muted text-sm">{chartError}</div>
            </div>
          )}
          <div
            ref={chartContainerRef}
            className="card overflow-hidden mb-4 touch-pan-y"
            style={{ display: chartMode === "dot" ? "none" : undefined }}
          />

          {/* Indicator panels — computed from bar data */}
          {rawBars.length >= 14 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RSIPanel bars={rawBars} />
              <MACDPanel bars={rawBars} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Stat helpers ── */
function fmt(v) { return v != null ? `$${Number(v).toFixed(2)}` : "—"; }
function fmtVol(v) {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
}
function fmtCap(v) {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}
function StatCell({ label, value, positive }) {
  return (
    <div className="bg-surface px-3 py-2">
      <div className="text-[10px] text-muted font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold font-mono mt-0.5 ${positive === true ? "text-bull" : positive === false ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ── SMA calculation ── */
function computeSMA(bars, period) {
  const result = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += bars[j].close;
    }
    result.push({
      time: bars[i].time,
      value: +(sum / period).toFixed(2),
    });
  }
  return result;
}

/* ── RSI calculation ── */
function computeRSI(bars, period = 14) {
  if (bars.length < period + 1) return [];
  const rsi = [];
  let avgGain = 0, avgLoss = 0;

  // Seed with first `period` changes
  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push({ time: bars[period].time, value: +(100 - 100 / (1 + rs)).toFixed(2) });

  for (let i = period + 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push({ time: bars[i].time, value: +(100 - 100 / (1 + r)).toFixed(2) });
  }
  return rsi;
}

/* ── MACD calculation ── */
function computeEMA(bars, period) {
  const k = 2 / (period + 1);
  const ema = [{ time: bars[0].time, value: bars[0].close }];
  for (let i = 1; i < bars.length; i++) {
    ema.push({
      time: bars[i].time,
      value: bars[i].close * k + ema[i - 1].value * (1 - k),
    });
  }
  return ema;
}

function computeMACD(bars, fast = 12, slow = 26, signal = 9) {
  if (bars.length < slow + signal) return { macd: [], signal: [], histogram: [] };
  const emaFast = computeEMA(bars, fast);
  const emaSlow = computeEMA(bars, slow);

  const macdLine = [];
  for (let i = 0; i < bars.length; i++) {
    macdLine.push({
      time: bars[i].time,
      value: +(emaFast[i].value - emaSlow[i].value).toFixed(4),
    });
  }

  // Signal line = EMA of MACD line
  const signalK = 2 / (signal + 1);
  const signalLine = [{ time: macdLine[0].time, value: macdLine[0].value }];
  for (let i = 1; i < macdLine.length; i++) {
    signalLine.push({
      time: macdLine[i].time,
      value: +(macdLine[i].value * signalK + signalLine[i - 1].value * (1 - signalK)).toFixed(4),
    });
  }

  const histogram = macdLine.map((m, i) => ({
    time: m.time,
    value: +(m.value - signalLine[i].value).toFixed(4),
  }));

  return { macd: macdLine, signal: signalLine, histogram };
}

/* ── Mini SVG sparkline ── */
function Sparkline({ data, width = 200, height = 40, color = "var(--color-accent)", zones }) {
  if (!data || data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {zones && zones.map((z, i) => {
        const y1 = height - ((z.max - min) / range) * height;
        const y2 = height - ((z.min - min) / range) * height;
        return <rect key={i} x={0} y={Math.max(0, y1)} width={width} height={Math.max(0, y2 - y1)} fill={z.color} opacity={0.08} />;
      })}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── MACD histogram mini chart ── */
function MACDHistogramChart({ histogram, width = 200, height = 40 }) {
  if (!histogram || histogram.length < 2) return null;
  const values = histogram.map((d) => d.value);
  const absMax = Math.max(...values.map(Math.abs)) || 1;
  const barW = Math.max(1, width / values.length - 0.5);

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-border)" strokeWidth="0.5" />
      {values.map((v, i) => {
        const x = (i / values.length) * width;
        const barH = (Math.abs(v) / absMax) * (height / 2);
        const y = v >= 0 ? height / 2 - barH : height / 2;
        return <rect key={i} x={x} y={y} width={barW} height={barH} fill={v >= 0 ? "var(--color-bull)" : "var(--color-bear)"} opacity={0.7} />;
      })}
    </svg>
  );
}

/* ── RSI Panel component ── */
function RSIPanel({ bars }) {
  const rsiData = computeRSI(bars, 14);
  if (rsiData.length === 0) return null;
  const current = rsiData[rsiData.length - 1].value;
  const label = current >= 70 ? "Overbought" : current <= 30 ? "Oversold" : "Neutral";
  const labelColor = current >= 70 ? "text-bear" : current <= 30 ? "text-bull" : "text-muted";

  // Zone highlights for the sparkline
  const zones = [
    { min: 70, max: 100, color: "var(--color-bear)" },
    { min: 0, max: 30, color: "var(--color-bull)" },
  ];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-accent">RSI (14)</h3>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${labelColor}`}>{label}</span>
          <span className="text-sm font-black font-mono">{current.toFixed(1)}</span>
        </div>
      </div>
      <div className="mt-2 rounded overflow-hidden">
        <Sparkline data={rsiData.slice(-60)} height={48} color="var(--color-accent)" zones={zones} />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-muted font-mono">
        <span>30</span>
        <span>50</span>
        <span>70</span>
      </div>
    </div>
  );
}

/* ── MACD Panel component ── */
function MACDPanel({ bars }) {
  const { macd, signal, histogram } = computeMACD(bars);
  if (macd.length === 0) return null;
  const lastMACD = macd[macd.length - 1].value;
  const lastSignal = signal[signal.length - 1].value;
  const lastHist = histogram[histogram.length - 1].value;
  const crossLabel = lastMACD > lastSignal ? "Bullish" : "Bearish";
  const crossColor = lastMACD > lastSignal ? "text-bull" : "text-bear";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-accent">MACD</h3>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${crossColor}`}>{crossLabel}</span>
          <span className="text-sm font-black font-mono">{lastHist >= 0 ? "+" : ""}{lastHist.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-2 rounded overflow-hidden">
        <MACDHistogramChart histogram={histogram.slice(-60)} height={48} />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-muted font-mono">
        <span>MACD {lastMACD.toFixed(2)}</span>
        <span>Signal {lastSignal.toFixed(2)}</span>
      </div>
    </div>
  );
}

/* ── Demo data generator ── */
function generateDemoData(interval = "1d") {
  const data = [];
  let price = 175;
  const now = new Date();
  const count = 200;

  for (let i = count; i >= 0; i--) {
    const date = new Date(now);

    if (interval === "1m" || interval === "5m" || interval === "15m") {
      // Intraday — use Unix timestamps
      const minsPerBar =
        interval === "1m" ? 1 : interval === "5m" ? 5 : 15;
      date.setMinutes(date.getMinutes() - i * minsPerBar);
      // Skip non-market hours (rough)
      const h = date.getHours();
      if (h < 9 || h > 16) continue;
    } else if (interval === "1h") {
      date.setHours(date.getHours() - i);
      const h = date.getHours();
      if (h < 9 || h > 16) continue;
    } else if (interval === "1w") {
      date.setDate(date.getDate() - i * 7);
    } else {
      date.setDate(date.getDate() - i);
    }

    const volatility = interval === "1m" ? 0.5 : interval === "5m" ? 1 : 2;
    const open = price + (Math.random() - 0.48) * volatility;
    const close = open + (Math.random() - 0.48) * volatility * 1.5;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    price = close;

    if (
      interval === "1m" ||
      interval === "5m" ||
      interval === "15m" ||
      interval === "1h"
    ) {
      data.push({
        time: Math.floor(date.getTime() / 1000),
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
      });
    } else {
      data.push({
        time: date.toISOString().split("T")[0],
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
      });
    }
  }
  return data;
}
