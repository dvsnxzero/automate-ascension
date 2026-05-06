import { createContext, useContext, useEffect, useState } from "react";
import { getTradingMode, setTradingMode } from "../services/api";

/**
 * Trading mode context — paper (Alpaca) or live (Webull).
 *
 * - Paper is the default and only fully-wired mode.
 * - Live is gated server-side by ENABLE_LIVE_TRADING. The toggle still
 *   lets you flip the UI to live mode for read-only viewing of the live
 *   Webull account, but order placement is blocked at the route layer.
 */
const TradingModeContext = createContext(null);

export function TradingModeProvider({ children }) {
  const [mode, setMode] = useState(() => getTradingMode());
  // Future: pull this from /api/health to reflect server-side flag
  const [liveEnabled] = useState(false);

  const toggle = (next) => {
    const target = next || (mode === "paper" ? "live" : "paper");
    if (target === "live" && !liveEnabled) {
      // Allow viewing-only switch; UI should warn it's read-only
    }
    setMode(target);
    setTradingMode(target);
  };

  // Re-emit on storage changes from another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "aa-trading-mode" && e.newValue) setMode(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = {
    mode,
    isPaper: mode === "paper",
    isLive: mode === "live",
    liveEnabled,
    setMode: toggle,
    togglePaperLive: () => toggle(),
  };

  return (
    <TradingModeContext.Provider value={value}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  const ctx = useContext(TradingModeContext);
  if (!ctx) {
    throw new Error("useTradingMode must be used inside <TradingModeProvider>");
  }
  return ctx;
}
