import { useTradingMode } from "../hooks/useTradingMode";
import { Lock } from "lucide-react";

/**
 * Paper / Live toggle pill.
 *
 * Paper is the active execution mode (Alpaca). Live shows a lock icon and
 * a tooltip when ENABLE_LIVE_TRADING is false server-side — clicking still
 * flips the mode for read-only Webull viewing, but order placement is
 * blocked by the backend.
 */
export default function TradingModeToggle({ compact = false }) {
  const { mode, isPaper, liveEnabled, togglePaperLive, setMode } = useTradingMode();

  const baseBtn =
    "px-3 py-1.5 text-xs font-mono font-medium uppercase tracking-wider transition-colors";
  const activePaper =
    "bg-[#DCFC36] text-black border border-[#DCFC36]";
  const inactive =
    "bg-transparent text-white/50 border border-white/15 hover:text-white/80 hover:border-white/30";
  const activeLive =
    "bg-red-500/90 text-white border border-red-500";

  if (compact) {
    return (
      <button
        onClick={togglePaperLive}
        className={`${baseBtn} rounded-full ${
          isPaper ? activePaper : activeLive
        }`}
        title={
          isPaper
            ? "Paper trading mode (Alpaca). Click to switch to live."
            : liveEnabled
              ? "Live trading mode (Webull) — orders execute against real money."
              : "Live mode (read-only). Orders blocked until ENABLE_LIVE_TRADING=true."
        }
      >
        {isPaper ? "Paper" : "Live"}
        {!isPaper && !liveEnabled && (
          <Lock className="inline-block w-3 h-3 ml-1 -mt-0.5" />
        )}
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-stretch rounded-full border border-white/15 bg-black/60 p-0.5"
      role="tablist"
      aria-label="Trading mode"
    >
      <button
        role="tab"
        aria-selected={isPaper}
        onClick={() => setMode("paper")}
        className={`${baseBtn} rounded-full ${isPaper ? activePaper : inactive}`}
      >
        Paper
      </button>
      <button
        role="tab"
        aria-selected={!isPaper}
        onClick={() => setMode("live")}
        className={`${baseBtn} rounded-full ${!isPaper ? activeLive : inactive}`}
        title={
          liveEnabled
            ? "Live: orders execute against real money."
            : "Live (read-only): order placement is blocked server-side."
        }
      >
        Live
        {!liveEnabled && <Lock className="inline-block w-3 h-3 ml-1 -mt-0.5" />}
      </button>
    </div>
  );
}
