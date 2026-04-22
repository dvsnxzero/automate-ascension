import { useState, useEffect } from "react";
import { getAuthStatus, reconnect } from "../services/api";
import { RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const [authStatus, setAuthStatus] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  const fetchStatus = () => {
    getAuthStatus()
      .then((r) => setAuthStatus(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await reconnect();
      await fetchStatus();
    } catch (e) {
      console.error("Reconnect failed:", e);
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-28 md:pb-8">
      <h1 className="text-3xl font-black tracking-tight mb-6">Settings</h1>

      {/* Webull Connection */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Webull Connection</h2>
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              authStatus?.authenticated ? "bg-accent animate-pulse" : "bg-bear"
            }`}
          />
          <span className="text-sm text-muted">
            {authStatus?.authenticated
              ? `Connected — Account ${authStatus.account_id?.slice(-6) || ""}`
              : authStatus?.message || "Not connected"}
          </span>
        </div>
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="accent-btn text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={reconnecting ? "animate-spin" : ""} />
          {reconnecting ? "Connecting..." : authStatus?.authenticated ? "Reconnect" : "Connect Webull"}
        </button>
        <p className="text-xs text-muted mt-3">
          Uses your API key and secret from .env — credentials never leave the server.
        </p>
      </section>

      {/* Trading Mode */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Trading Mode</h2>
        <div className="flex gap-3">
          <button className="bg-accent/10 text-accent border border-accent/30 px-4 py-2.5 rounded-xl text-sm font-semibold">
            Paper Trading
          </button>
          <button className="bg-surface border border-border text-muted px-4 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed opacity-40">
            Live Trading (Phase 5)
          </button>
        </div>
        <p className="text-xs text-muted mt-3">
          Paper trading uses the same Webull API with virtual money. No risk.
        </p>
      </section>

      {/* Default Order Settings */}
      <section className="card p-6 mb-4">
        <h2 className="text-base font-bold mb-4">Default Order Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted block mb-2 font-medium">
              Max Position Size (% of account)
            </label>
            <input
              type="number"
              defaultValue={5}
              className="bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-2 font-medium">
              Default Stop Loss %
            </label>
            <input
              type="number"
              defaultValue={5}
              className="bg-surface-light border border-border rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
        </div>
      </section>

      {/* About */}
      <section className="card p-6">
        <h2 className="text-base font-bold mb-2">About</h2>
        <p className="text-sm text-muted">
          AutomateAscension v0.1.0 — Built with ZipTrader U strategies, React,
          FastAPI, and the Webull Open API.
        </p>
      </section>
    </div>
  );
}
