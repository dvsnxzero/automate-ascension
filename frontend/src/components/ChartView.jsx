import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Star } from "lucide-react";
import { getBars, addToWatchlist } from "../services/api";
import { useTheme } from "../hooks/useTheme";

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
  const [interval, setInterval] = useState("1d");
  const [chartError, setChartError] = useState(null);
  const { isDark } = useTheme();

  // Responsive chart height
  const getChartHeight = () => {
    if (typeof window === "undefined") return 400;
    return window.innerWidth < 768 ? 320 : 500;
  };

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
          if (res.data.bars && res.data.bars.length > 0) {
            bars = res.data.bars;
          }
        } catch {
          // API not connected — use demo data
        }

        if (!bars || bars.length === 0) {
          bars = generateDemoData(interval);
        }

        candleSeries.setData(bars);
        chart.timeScale().fitContent();

        // Add SMA overlay if we have enough data
        if (bars.length >= 9) {
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

        if (bars.length >= 50) {
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

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      const s = searchInput.trim().toUpperCase();
      setSymbol(s);
      navigate(`/chart/${s}`);
      setSearchInput("");
    }
  };

  const handleAddToWatchlist = async () => {
    try {
      await addToWatchlist({ symbol, strategy: "manual" });
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    }
  };

  return (
    <div className="flex flex-col h-full pb-28 md:pb-8">
      {/* Sticky header — ticker + search + intervals */}
      <div className="sticky top-0 z-10 bg-theme-bg/95 backdrop-blur-sm border-b border-border/50 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Top row: symbol + star + search */}
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight shrink-0">
              {symbol}
            </h1>
            <button
              onClick={handleAddToWatchlist}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-accent hover:border-accent transition-colors shrink-0"
              title="Add to watchlist"
            >
              <Star size={14} />
            </button>

            <form onSubmit={handleSearch} className="ml-auto">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search ticker..."
                  className="bg-surface border border-border rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-accent/50 w-36 md:w-44 transition-colors"
                />
              </div>
            </form>
          </div>

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
