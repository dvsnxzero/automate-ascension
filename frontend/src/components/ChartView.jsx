import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Plus, Star } from "lucide-react";
import { getBars, addToWatchlist } from "../services/api";

export default function ChartView() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const chartContainerRef = useRef(null);
  const [symbol, setSymbol] = useState(urlSymbol?.toUpperCase() || "AAPL");
  const [searchInput, setSearchInput] = useState("");
  const [interval, setInterval] = useState("1d");
  const [chartReady, setChartReady] = useState(false);

  // Load chart library and render
  useEffect(() => {
    let chart;
    const loadChart = async () => {
      try {
        const { createChart } = await import("lightweight-charts");
        if (!chartContainerRef.current) return;

        chartContainerRef.current.innerHTML = "";

        chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 500,
          layout: {
            background: { color: "#111111" },
            textColor: "#666666",
          },
          grid: {
            vertLines: { color: "#1A1A1A" },
            horzLines: { color: "#1A1A1A" },
          },
          crosshair: {
            mode: 0,
            vertLine: { color: "#DCFC36", width: 1, style: 2 },
            horzLine: { color: "#DCFC36", width: 1, style: 2 },
          },
          timeScale: {
            borderColor: "#2A2A2A",
            timeVisible: true,
          },
          rightPriceScale: {
            borderColor: "#2A2A2A",
          },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: "#DCFC36",
          downColor: "#FF4757",
          borderUpColor: "#DCFC36",
          borderDownColor: "#FF4757",
          wickUpColor: "#DCFC36",
          wickDownColor: "#FF4757",
        });

        try {
          const res = await getBars(symbol, interval);
          if (res.data.bars?.length > 0) {
            candleSeries.setData(res.data.bars);
          } else {
            candleSeries.setData(generateDemoData());
          }
        } catch {
          candleSeries.setData(generateDemoData());
        }

        // 9-SMA line (accent)
        const sma9 = chart.addLineSeries({
          color: "#DCFC36",
          lineWidth: 2,
          title: "SMA 9",
        });

        // 180-SMA line (dim)
        const sma180 = chart.addLineSeries({
          color: "#666666",
          lineWidth: 1,
          lineStyle: 2,
          title: "SMA 180",
        });

        const handleResize = () => {
          if (chartContainerRef.current) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };
        window.addEventListener("resize", handleResize);
        setChartReady(true);

        return () => {
          window.removeEventListener("resize", handleResize);
          chart.remove();
        };
      } catch (err) {
        console.error("Chart load error:", err);
      }
    };

    loadChart();
  }, [symbol, interval]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.trim().toUpperCase());
      navigate(`/chart/${searchInput.trim().toUpperCase()}`);
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight">{symbol}</h1>
          <button
            onClick={handleAddToWatchlist}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-accent hover:border-accent transition-colors"
            title="Add to watchlist"
          >
            <Star size={14} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex flex-wrap gap-2 md:ml-auto">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search ticker..."
              className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 w-44 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {["1m", "5m", "15m", "1h", "1d", "1w"].map((int) => (
              <button
                key={int}
                onClick={() => setInterval(int)}
                type="button"
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  interval === int
                    ? "bg-accent text-black"
                    : "bg-surface border border-border text-muted hover:text-white hover:border-border-light"
                }`}
              >
                {int}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Chart container */}
      <div
        ref={chartContainerRef}
        className="card overflow-hidden mb-6"
        style={{ minHeight: 500 }}
      />

      {/* Indicator panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-accent">RSI (14)</h3>
            <span className="text-xs text-muted font-mono">—</span>
          </div>
          <div className="text-muted text-sm">
            Connect Webull API to see RSI data
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-accent">MACD (12, 26, 9)</h3>
            <span className="text-xs text-muted font-mono">—</span>
          </div>
          <div className="text-muted text-sm">
            Connect Webull API to see MACD data
          </div>
        </div>
      </div>
    </div>
  );
}

function generateDemoData() {
  const data = [];
  let price = 150;
  const now = new Date();
  for (let i = 200; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const open = price + (Math.random() - 0.5) * 4;
    const close = open + (Math.random() - 0.5) * 6;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    price = close;
    data.push({
      time: date.toISOString().split("T")[0],
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
    });
  }
  return data;
}
