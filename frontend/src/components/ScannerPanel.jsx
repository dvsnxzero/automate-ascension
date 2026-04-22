import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, ScanSearch, ArrowUpRight } from "lucide-react";
import { runScan } from "../services/api";

const SCANNER_TYPES = [
  {
    id: "morning",
    label: "Morning",
    desc: "Big movers: ≥5% price change, ≥2% volume change, >$1",
  },
  {
    id: "overreaction",
    label: "Overreaction",
    desc: "Oversold bounces: ≤-5% drop, high volume spike",
  },
  {
    id: "pattern",
    label: "Pattern",
    desc: "Breakout setups: near 9-SMA, 180-SMA up, RSI 40-60",
  },
];

export default function ScannerPanel() {
  const [activeTab, setActiveTab] = useState("morning");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const handleScan = async () => {
    setLoading(true);
    try {
      const res = await runScan(activeTab);
      setResults(res.data.results || []);
      setHasRun(true);
    } catch (err) {
      console.error("Scan failed:", err);
      setResults([]);
      setHasRun(true);
    } finally {
      setLoading(false);
    }
  };

  const activeScanner = SCANNER_TYPES.find((s) => s.id === activeTab);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
      <h1 className="text-3xl font-black tracking-tight mb-6">Scanner</h1>

      {/* Scanner type tabs */}
      <div className="flex gap-2 mb-5">
        {SCANNER_TYPES.map((scanner) => (
          <button
            key={scanner.id}
            onClick={() => {
              setActiveTab(scanner.id);
              setResults([]);
              setHasRun(false);
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === scanner.id
                ? "bg-accent text-black"
                : "bg-surface border border-border text-muted hover:text-white hover:border-border-light"
            }`}
          >
            {scanner.label}
          </button>
        ))}
      </div>

      {/* Scanner description + run button */}
      <div className="card p-5 mb-6 flex items-center justify-between">
        <div>
          <div className="font-bold text-sm">{activeScanner.label} Scanner</div>
          <div className="text-sm text-muted mt-1">{activeScanner.desc}</div>
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          className="accent-btn flex items-center gap-2 text-sm whitespace-nowrap disabled:opacity-50"
        >
          <Play size={16} />
          {loading ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {/* Results */}
      {hasRun && results.length === 0 && (
        <div className="card p-10 text-center">
          <ScanSearch size={40} className="mx-auto text-border-light mb-4" />
          <div className="text-muted text-sm">
            No results. Connect Webull API to get live scanner data.
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-left text-xs uppercase tracking-wider">
                <th className="px-5 py-4">Symbol</th>
                <th className="px-5 py-4">Price</th>
                <th className="px-5 py-4">Change %</th>
                <th className="px-5 py-4">Volume</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((r) => (
                <tr key={r.symbol} className="hover:bg-surface-light transition-colors">
                  <td className="px-5 py-4 font-bold">{r.symbol}</td>
                  <td className="px-5 py-4 font-mono font-medium">
                    ${r.price?.toFixed(2)}
                  </td>
                  <td
                    className={`px-5 py-4 font-semibold ${
                      r.change_pct >= 0 ? "text-accent" : "text-bear"
                    }`}
                  >
                    {r.change_pct >= 0 ? "+" : ""}
                    {r.change_pct?.toFixed(2)}%
                  </td>
                  <td className="px-5 py-4 text-muted font-mono">
                    {r.volume?.toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      to={`/chart/${r.symbol}`}
                      className="text-accent hover:underline text-xs font-medium flex items-center gap-1"
                    >
                      Chart <ArrowUpRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
