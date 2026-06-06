import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Lock, Loader2, CheckCircle2, X } from "lucide-react";
import {
  placePaperStockOrder,
  placeOrder as placeLiveOrder,
  cancelPaperOrder,
  getPaperAccount,
} from "../services/api";
import { useTradingMode } from "../hooks/useTradingMode";

/**
 * Order entry panel. Drop in next to a chart with `symbol` + `currentPrice`.
 *
 * Routes to /api/paper/order or /api/trade/order based on the global trading
 * mode (see useTradingMode). Live trading is server-side kill-switched —
 * even if you flip the toggle, orders will be rejected with 4xx.
 *
 * Settlement warnings (T+1 cash rules) come back inline on the order
 * response when relevant and are surfaced here.
 */
export default function TradePanel({ symbol = "SPY", currentPrice = null, onOrderPlaced }) {
  const { mode, isPaper, liveEnabled } = useTradingMode();

  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("1");
  const [orderType, setOrderType] = useState("limit");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [tif, setTif] = useState("day");
  const [extHours, setExtHours] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, order, warning }
  const [confirming, setConfirming] = useState(false);
  const [buyingPower, setBuyingPower] = useState(null);

  // Pre-fill limit price from the chart's current price whenever it
  // changes. Don't overwrite if the user has already typed something.
  useEffect(() => {
    if (currentPrice == null) return;
    setLimitPrice((prev) => (prev === "" ? Number(currentPrice).toFixed(2) : prev));
  }, [currentPrice]);

  // Pull current buying power for context (paper mode only — live is read-only)
  useEffect(() => {
    let cancelled = false;
    if (!isPaper) {
      setBuyingPower(null);
      return;
    }
    getPaperAccount()
      .then((r) => { if (!cancelled) setBuyingPower(r.data?.buying_power ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isPaper, result]); // refresh after order

  const qtyNum = parseFloat(qty) || 0;
  const limitNum = parseFloat(limitPrice) || 0;
  const referencePrice = orderType === "market" ? (currentPrice || 0) : limitNum;
  const estimatedCost = useMemo(
    () => qtyNum * referencePrice,
    [qtyNum, referencePrice]
  );
  const exceedsBuyingPower = side === "buy" && buyingPower != null && estimatedCost > buyingPower;

  const reset = () => {
    setResult(null);
    setConfirming(false);
  };

  const validate = () => {
    if (qtyNum <= 0) return "Quantity must be > 0";
    if (orderType === "limit" && limitNum <= 0) return "Limit price required";
    if (orderType === "stop" && parseFloat(stopPrice) <= 0) return "Stop price required";
    if (orderType === "stop_limit" && (limitNum <= 0 || parseFloat(stopPrice) <= 0))
      return "Stop and limit prices required";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setResult({ ok: false, message: err });
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        symbol: symbol.toUpperCase(),
        side,
        qty: qtyNum,
        order_type: orderType,
        time_in_force: tif,
        extended_hours: extHours,
      };
      if (orderType === "limit" || orderType === "stop_limit") payload.limit_price = limitNum;
      if (orderType === "stop" || orderType === "stop_limit") payload.stop_price = parseFloat(stopPrice);

      let res;
      if (isPaper) {
        res = await placePaperStockOrder(payload);
      } else {
        // Live mode — server-side kill switch will reject unless ENABLE_LIVE_TRADING=true
        res = await placeLiveOrder({
          ...payload,
          quantity: qtyNum,           // Webull route uses `quantity`
          price: limitNum || null,    // Webull route uses `price`
          is_paper: false,
        });
      }

      const data = res?.data || {};
      if (data.error || data.placed === false) {
        setResult({ ok: false, message: data.error || "Order failed", warning: data.settlement_warning });
      } else {
        setResult({
          ok: true,
          message: `${side.toUpperCase()} ${qtyNum} ${symbol.toUpperCase()} — ${data.status || "submitted"}`,
          order: data,
          warning: data.settlement_warning,
        });
        if (onOrderPlaced) onOrderPlaced(data);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Unknown error";
      setResult({ ok: false, message: msg });
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    const orderId = result?.order?.id;
    if (!orderId || !isPaper) return;
    setSubmitting(true);
    try {
      await cancelPaperOrder(orderId);
      setResult((r) => r ? { ...r, message: `${r.message} · canceled` } : r);
    } catch (e) {
      // swallow — UI already shows the original placement
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = side === "buy";
  const sideClass = isBuy ? "text-bull" : "text-bear";
  const sideBg = isBuy ? "bg-bull/10 border-bull/30" : "bg-bear/10 border-bear/30";

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 md:p-5 max-w-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold tracking-wider uppercase text-muted">
            {isPaper ? "Paper Order" : "Live Order"}
          </h3>
          <div className="text-lg font-black font-mono">{symbol.toUpperCase()}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Buying Power</div>
          <div className="text-sm font-mono">
            {buyingPower != null ? `$${buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
          </div>
        </div>
      </div>

      {/* Live mode warning */}
      {!isPaper && !liveEnabled && (
        <div className="mb-3 rounded-lg bg-bear/10 border border-bear/30 px-3 py-2 flex items-center gap-2 text-xs">
          <Lock size={14} className="text-bear shrink-0" />
          <span className="text-bear">Live mode is read-only. Orders blocked server-side.</span>
        </div>
      )}

      {/* Side toggle */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setSide("buy"); reset(); }}
          className={`py-2.5 rounded-lg font-bold text-sm tracking-wide transition-colors border ${
            isBuy ? "bg-bull text-black border-bull" : "bg-transparent text-bull border-bull/30 hover:border-bull"
          }`}
        >
          BUY
        </button>
        <button
          type="button"
          onClick={() => { setSide("sell"); reset(); }}
          className={`py-2.5 rounded-lg font-bold text-sm tracking-wide transition-colors border ${
            !isBuy ? "bg-bear text-white border-bear" : "bg-transparent text-bear border-bear/30 hover:border-bear"
          }`}
        >
          SELL
        </button>
      </div>

      {/* Order type */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={orderType}
          onChange={(e) => { setOrderType(e.target.value); reset(); }}
          className="bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm font-mono"
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop">Stop</option>
          <option value="stop_limit">Stop Limit</option>
        </select>
        <select
          value={tif}
          onChange={(e) => setTif(e.target.value)}
          className="bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm font-mono"
        >
          <option value="day">DAY</option>
          <option value="gtc">GTC</option>
          <option value="ioc">IOC</option>
          <option value="fok">FOK</option>
        </select>
      </div>

      {/* Quantity */}
      <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Quantity</label>
      <input
        type="number"
        step="0.0001"
        min="0"
        value={qty}
        onChange={(e) => { setQty(e.target.value); reset(); }}
        className="w-full bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm font-mono mb-3"
        placeholder="1"
      />

      {/* Limit price */}
      {(orderType === "limit" || orderType === "stop_limit") && (
        <>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
            Limit Price{currentPrice != null && <span className="text-muted/60 ml-1">(market ${currentPrice.toFixed(2)})</span>}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={limitPrice}
            onChange={(e) => { setLimitPrice(e.target.value); reset(); }}
            className="w-full bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm font-mono mb-3"
            placeholder="0.00"
          />
        </>
      )}

      {/* Stop price */}
      {(orderType === "stop" || orderType === "stop_limit") && (
        <>
          <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">Stop Price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={stopPrice}
            onChange={(e) => { setStopPrice(e.target.value); reset(); }}
            className="w-full bg-theme-bg border border-border rounded-lg px-3 py-2 text-sm font-mono mb-3"
            placeholder="0.00"
          />
        </>
      )}

      {/* Extended hours */}
      <label className="flex items-center gap-2 text-xs text-muted mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={extHours}
          onChange={(e) => setExtHours(e.target.checked)}
          className="rounded border-border"
        />
        Allow extended hours
      </label>

      {/* Cost summary */}
      <div className={`rounded-lg ${sideBg} border px-3 py-2.5 mb-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isBuy ? <TrendingUp size={14} className={sideClass} /> : <TrendingDown size={14} className={sideClass} />}
            <span className={`text-xs font-bold uppercase tracking-wider ${sideClass}`}>
              Est. {isBuy ? "Cost" : "Proceeds"}
            </span>
          </div>
          <div className={`text-sm font-mono font-bold ${sideClass}`}>
            ${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        {exceedsBuyingPower && (
          <div className="flex items-start gap-1.5 mt-1.5 text-[10px] text-bear">
            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            <span>Exceeds buying power (${buyingPower?.toLocaleString("en-US", { minimumFractionDigits: 2 })})</span>
          </div>
        )}
      </div>

      {/* Result / confirmation area */}
      {confirming && !result && (
        <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2.5 mb-3 text-xs">
          <div className="font-bold text-accent mb-0.5">Confirm order</div>
          <div className="text-muted">
            {side.toUpperCase()} {qtyNum} {symbol.toUpperCase()} @{" "}
            {orderType === "market" ? "MARKET" : `$${limitNum.toFixed(2)} LIMIT`} · {tif.toUpperCase()}
          </div>
          <div className="text-muted mt-0.5">
            Tap {isBuy ? "BUY" : "SELL"} again to send.
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-lg border px-3 py-2.5 mb-3 text-xs ${
          result.ok ? "bg-bull/10 border-bull/30" : "bg-bear/10 border-bear/30"
        }`}>
          <div className="flex items-start gap-2">
            {result.ok ? (
              <CheckCircle2 size={14} className="text-bull shrink-0 mt-0.5" />
            ) : (
              <X size={14} className="text-bear shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className={`font-bold ${result.ok ? "text-bull" : "text-bear"}`}>
                {result.ok ? "Order placed" : "Order failed"}
              </div>
              <div className="text-muted break-words">{result.message}</div>
              {result.order?.id && (
                <div className="text-muted/60 font-mono text-[10px] mt-0.5">id: {result.order.id}</div>
              )}
            </div>
            {result.ok && result.order?.id && isPaper && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="text-[10px] font-bold uppercase tracking-wider text-muted hover:text-bear transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {result?.warning && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 mb-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-500">Settlement warning</div>
              <div className="text-muted break-words">{result.warning}</div>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || qtyNum <= 0}
        className={`w-full py-3 rounded-xl font-bold text-sm tracking-wider transition-colors ${
          submitting || qtyNum <= 0
            ? "bg-surface-light text-muted cursor-not-allowed"
            : isBuy
              ? "bg-bull text-black hover:bg-bull/90"
              : "bg-bear text-white hover:bg-bear/90"
        }`}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Sending…
          </span>
        ) : confirming ? (
          `Confirm ${side.toUpperCase()} ${symbol.toUpperCase()}`
        ) : (
          `${side.toUpperCase()} ${symbol.toUpperCase()}`
        )}
      </button>
    </div>
  );
}
