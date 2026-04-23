import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Star, TrendingUp } from "lucide-react";
import { getBars, addToWatchlist, searchSymbol } from "../services/api";
import { useTheme } from "../hooks/useTheme";
import DotLogo from "./DotLogo";

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
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const { isDark } = useTheme();

  // Responsive chart height
  const getChartHeight = () => {
    if (typeof window === "undefined") return 400;
    return window.innerWidth < 768 ? 320 : 500;
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
        try {
          const res = await getBars(symbol, interval);
          if (cancelled) return; // Chart was removed during API call
          if (res.data.bars && res.data.bars.length > 0) {
            bars = res.data.bars;
          }
        } catch {
          if (cancelled) return;
          // API not connected — use demo data
        }

        if (!bars || bars.length === 0) {
          bars = generateDemoData(interval);
        }

        if (cancelled) return;

        candleSeries.setData(bars);
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
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchSymbol(value.trim());
        setSearchResults(res.data.results || []);
      } catch {
        setSearchResults([]);
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
      // If results exist, pick the first one; otherwise treat input as ticker
      if (searchResults.length > 0) {
        selectResult(searchResults[0].symbol);
      } else {
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
        <div className="max-w-7xl mx-auto">
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
                  className="bg-surface border border-border rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-accent/50 w-44 md:w-64 transition-colors"
                />

                {/* Autocomplete dropdown */}
                {searchOpen && (searchResults.length > 0 || searchLoading) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-72 overflow-y-auto">
                    {searchLoading && searchResults.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted">Searching...</div>
                    ) : (
                      searchResults.map((r, i) => (
                        <button
                          key={`${r.symbol}-${i}`}
                          type="button"
                          onClick={() => selectResult(r.symbol)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-surface-light transition-colors text-left"
                        >
                          <DotLogo ticker={r.symbol} size={32} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{r.symbol}</span>
                              {r.type && (
                                <span className="text-[10px] font-medium text-muted bg-surface-light px-1.5 py-0.5 rounded">
                                  {r.type}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted truncate">{r.name}</div>
                          </div>
                          <span className="text-[10px] text-muted/50 shrink-0">{r.exchange}</span>
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

          {/* Interval buttons row */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
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
          </div>
        </div>
      </div>

      {/* Chart + indicators */}
      <div className="flex-1 px-4 md:px-8 pt-4">
        <div className="max-w-7xl mx-auto">
          {/* Chart container */}
          {chartError ? (
            <div className="card p-10 text-center mb-4">
              <div className="text-muted text-sm">{chartError}</div>
            </div>
          ) : (
            <div
              ref={chartContainerRef}
              className="card overflow-hidden mb-4 touch-pan-y"
            />
          )}

          {/* Indicator panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-accent">RSI (14)</h3>
                <span className="text-xs text-muted font-mono">—</span>
              </div>
              <div className="text-muted text-xs">
                Connect Webull API to see live RSI
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-accent">MACD</h3>
                <span className="text-xs text-muted font-mono">—</span>
              </div>
              <div className="text-muted text-xs">
                Connect Webull API to see live MACD
              </div>
            </div>
          </div>
        </div>
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
