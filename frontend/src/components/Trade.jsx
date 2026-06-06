import { useEffect, useMemo, useState, useRef } from "react";
import {
  Wallet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Activity,
  X as XIcon,
  ShieldAlert,
} from "lucide-react";
import {
  getAccountForMode,
  getQuote,
  getPaperOrders,
  placePaperStockOrder,
  cancelPaperOrder,
} from "../services/api";
import { useTradingMode } from "../hooks/useTradingMode";
import PageLoader from "./PageLoader";

/* ────────────────────────────────
   Helpers
   ──────────────────────────────── */
const fmtUSD = (v) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtNum = (v, digits = 2) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const ORDER_TYPES = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
];

const TIF_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "gtc", label: "GTC" },
];

/* ────────────────────────────────
   Status pill
   ──────────────────────────────── */
function StatusPill({ status }) {
  const s = (status || "").toLowerCase();
  const map = {
    filled: "bg-accent-bg text-accent",
    partially_filled: "bg-accent-bg text-accent",
    new: "bg-blue-500/10 text-blue-400",
    accepted: "bg-blue-500/10 text-blue-400",
    pending_new: "bg-blue-500/10 text-blue-400",
    canceled: "bg-surface text-muted",
    cancelled: "bg-surface text-muted",
    expired: "bg-surface text-muted",
    rejected: "bg-bear/10 text-bear",
    held: "bg-yellow-500/10 text-yellow-400",
  };
  const cls = map[s] || "bg-surface text-muted";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cls}`}>
      {s.replace("_", " ") || "—"}
    </span>
  );
}

/* ────────────────────────────────
   Trade page
   ──────────────────────────────── */
export default function Trade() {
  const { mode, isPaper } = useTradingMode();

  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteSymbolRef = useRef(""); // tracks the symbol the current quote belongs to

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    symbol: "",
    side: "buy",
    order_type: "market",
    qty: "",
    limit_price: "",
    time_in_force: "day",
    extended_hours: false,
  });

  /* ── Data loading ───────────────────────── */
  const fetchAll = async () => {
    setRefreshing(true);
    try {
      const [acct, ords] = await Promise.allSettled([
        getAccountForMode(mode),
        isPaper ? getPaperOrders("open", 50) : Promise.resolve({ data: { orders: [] } }),
      ]);
      if (acct.status === "fulfilled") setAccount(acct.value.data);
      if (ords.status === "fulfilled") setOrders(ords.value.data?.orders || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setAccount(null);
    setOrders([]);
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* ── Quote on symbol change (debounced) ─── */
  useEffect(() => {
    const symbol = (form.symbol || "").trim().toUpperCase();
    if (!symbol || symbol.length < 1) {
      setQuote(null);
      quoteSymbolRef.current = "";
      return;
    }
    if (symbol === quoteSymbolRef.current) return; // already have it

    const handle = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const r = await getQuote(symbol);
        // Only apply if user hasn't typed something else in the meantime
        if ((form.symbol || "").trim().toUpperCase() === symbol) {
          setQuote(r.data || null);
          quoteSymbolRef.current = symbol;
        }
      } catch {
        if ((form.symbol || "").trim().toUpperCase() === symbol) setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [form.symbol]);

  /* ── Derived numbers ─────────────────────── */
  const buyingPower = useMemo(() => {
    if (!account) return 0;
    return Number(account.buying_power ?? account.virtual_buying_power ?? 0);
  }, [account]);

  const refPrice = useMemo(() => {
    if (form.order_type === "limit") {
      const lp = parseFloat(form.limit_price);
      return Number.isFinite(lp) && lp > 0 ? lp : null;
    }
    // market — use latest quote
    const p = quote?.price;
    return Number.isFinite(p) && p > 0 ? p : null;
  }, [form.order_type, form.limit_price, quote]);

  const qtyNum = useMemo(() => {
    const q = parseFloat(form.qty);
    return Number.isFinite(q) && q > 0 ? q : 0;
  }, [form.qty]);

  const estimatedCost = useMemo(() => {
    if (!refPrice || !qtyNum) return null;
    return refPrice * qtyNum;
  }, [refPrice, qtyNum]);

  const maxShares = useMemo(() => {
    if (!refPrice || !buyingPower || buyingPower <= 0) return null;
    return Math.floor(buyingPower / refPrice);
  }, [refPrice, buyingPower]);

  const overBuyingPower = useMemo(() => {
    if (form.side !== "buy") return false;
    if (estimatedCost == null) return false;
    return estimatedCost > buyingPower + 0.01;
  }, [form.side, estimatedCost, buyingPower]);

  /* ── Form helpers ────────────────────────── */
  const setField = (name, value) =>
    setForm((f) => ({ ...f, [name]: value }));

  const fillMaxShares = () => {
    if (!maxShares || maxShares <= 0) return;
    setField("qty", String(maxShares));
  };

  const canSubmit =
    isPaper &&
    !submitting &&
    form.symbol.trim().length > 0 &&
    qtyNum > 0 &&
    (form.order_type === "market" || (parseFloat(form.limit_price) > 0));

  /* ── Submit ──────────────────────────────── */
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        side: form.side,
        qty: qtyNum,
        order_type: form.order_type,
        time_in_force: form.time_in_force,
        extended_hours: form.extended_hours,
      };
      if (form.order_type === "limit") {
        payload.limit_price = parseFloat(form.limit_price);
      }
      const res = await placePaperStockOrder(payload);
      const data = res.data || {};
      if (data.error) {
        setResult({ ok: false, error: data.error, settlement_warning: data.settlement_warning });
      } else {
        setResult({
          ok: true,
          order: data,
          settlement_warning: data.settlement_warning,
        });
        // Reset qty/limit but keep symbol/side for fast re-fire
        setForm((f) => ({ ...f, qty: "", limit_price: "" }));
        // Refresh open orders
        fetchAll();
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        "Order submission failed.";
      setResult({ ok: false, error: msg });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Cancel an open order ────────────────── */
  const onCancel = async (orderId) => {
    if (!orderId) return;
    try {
      await cancelPaperOrder(orderId);
      fetchAll();
    } catch (err) {
      // surface lightly via result panel
      setResult({
        ok: false,
        error: err?.response?.data?.error || err?.message || "Cancel failed.",
      });
    }
  };

  if (loading) {
    return <PageLoader message="Loading trade panel" />;
  }

  /* ── Render ──────────────────────────────── */
  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Trade</h1>
          <p className="text-sm text-muted mt-1">
            {isPaper ? "Paper orders via Alpaca" : "Live mode — read-only here"} ·{" "}
            <span className={isPaper ? "text-accent" : "text-yellow-400"}>
              {mode.toUpperCase()}
            </span>
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-theme-text px-3 py-2 rounded-lg border border-border hover:border-border-light transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Live-mode notice */}
      {!isPaper && (
        <div className="card p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex gap-3">
            <ShieldAlert size={18} className="text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-yellow-400 mb-1">
                Live trading is gated
              </div>
              <div className="text-muted">
                The trade panel places paper orders only. Switch to{" "}
                <span className="text-accent font-semibold">Paper</span> mode to
                place orders, or use Webull directly for live execution.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buying power card */}
      <section className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-muted text-xs font-medium uppercase tracking-wider">
              <Wallet size={13} className="text-accent" />
              Buying power
            </div>
            <div className="text-3xl font-black tracking-tight mt-2">
              {fmtUSD(buyingPower)}
            </div>
            <div className="text-xs text-muted mt-1">
              Cash {fmtUSD(account?.cash_balance ?? account?.cash)} · Equity{" "}
              {fmtUSD(account?.total_value ?? account?.equity)}
              {account?.capped && account?.virtual_cap ? (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-accent-bg text-accent text-[10px] font-bold">
                  Capped @ {fmtUSD(account.virtual_cap)}
                </span>
              ) : null}
            </div>
          </div>
          {quote?.price ? (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted font-bold">
                {quote.symbol || (form.symbol || "").toUpperCase()}
              </div>
              <div className="text-2xl font-black tabular-nums">
                {fmtUSD(quote.price)}
              </div>
              {typeof quote.change_pct === "number" && (
                <div
                  className={`text-xs font-semibold ${
                    quote.change_pct >= 0 ? "text-accent" : "text-bear"
                  }`}
                >
                  {quote.change_pct >= 0 ? "+" : ""}
                  {fmtNum(quote.change_pct, 2)}%
                </div>
              )}
            </div>
          ) : (
            quoteLoading && (
              <div className="text-xs text-muted flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" />
                quote
              </div>
            )
          )}
        </div>
      </section>

      {/* Order form */}
      <form onSubmit={submit} className="card p-5 mb-5">
        <h2 className="text-base font-bold mb-4">New Order</h2>

        {/* Symbol + Side */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
              Symbol
            </label>
            <input
              type="text"
              value={form.symbol}
              onChange={(e) => setField("symbol", e.target.value.toUpperCase())}
              placeholder="SPY"
              maxLength={10}
              autoComplete="off"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-base font-bold tracking-wide focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
              Side
            </label>
            <div className="grid grid-cols-2 gap-1 bg-surface border border-border rounded-xl p-1">
              {["buy", "sell"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setField("side", s)}
                  className={`py-1.5 rounded-lg text-sm font-bold transition-all ${
                    form.side === s
                      ? s === "buy"
                        ? "bg-accent text-black"
                        : "bg-bear text-white"
                      : "text-muted hover:text-theme-text"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order type */}
        <div className="mb-3">
          <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
            Order type
          </label>
          <div className="grid grid-cols-2 gap-1 bg-surface border border-border rounded-xl p-1">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setField("order_type", t.value)}
                className={`py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  form.order_type === t.value
                    ? "bg-accent-bg text-accent"
                    : "text-muted hover:text-theme-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Qty + Limit price */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted font-bold">
                Quantity
              </label>
              {maxShares != null && form.side === "buy" && (
                <button
                  type="button"
                  onClick={fillMaxShares}
                  className="text-[10px] text-accent font-semibold hover:underline"
                >
                  Max {maxShares.toLocaleString()}
                </button>
              )}
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.qty}
              onChange={(e) => setField("qty", e.target.value)}
              placeholder="0"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-base font-semibold tabular-nums focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
              Limit price
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.limit_price}
              onChange={(e) => setField("limit_price", e.target.value)}
              placeholder={form.order_type === "limit" ? "0.00" : "(market)"}
              disabled={form.order_type !== "limit"}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-base font-semibold tabular-nums focus:outline-none focus:border-accent transition-colors disabled:opacity-40"
            />
          </div>
        </div>

        {/* TIF + Extended */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
              Time in force
            </label>
            <div className="grid grid-cols-2 gap-1 bg-surface border border-border rounded-xl p-1">
              {TIF_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setField("time_in_force", t.value)}
                  className={`py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    form.time_in_force === t.value
                      ? "bg-accent-bg text-accent"
                      : "text-muted hover:text-theme-text"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted font-bold mb-1.5 block">
              Session
            </label>
            <button
              type="button"
              onClick={() => setField("extended_hours", !form.extended_hours)}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                form.extended_hours
                  ? "bg-accent-bg text-accent border-accent/30"
                  : "bg-surface text-muted border-border"
              }`}
            >
              {form.extended_hours ? "Extended hours ON" : "Regular hours"}
            </button>
          </div>
        </div>

        {/* Estimated cost / over-BP */}
        <div className="bg-surface border border-border rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm">
          <span className="text-muted">Estimated cost</span>
          <span
            className={`font-bold tabular-nums ${
              overBuyingPower ? "text-bear" : "text-theme-text"
            }`}
          >
            {fmtUSD(estimatedCost)}
            {overBuyingPower && (
              <span className="ml-2 text-[10px] uppercase tracking-wider">
                over BP
              </span>
            )}
          </span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
            !canSubmit
              ? "bg-surface text-muted cursor-not-allowed"
              : form.side === "buy"
              ? "bg-accent text-black hover:opacity-90"
              : "bg-bear text-white hover:opacity-90"
          }`}
        >
          {submitting ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Placing…
            </>
          ) : (
            <>
              <Send size={16} />
              {form.side === "buy" ? "Buy" : "Sell"}{" "}
              {form.symbol.trim().toUpperCase() || "—"}
            </>
          )}
        </button>

        {!isPaper && (
          <p className="text-xs text-muted text-center mt-3">
            Switch to Paper mode to enable order placement.
          </p>
        )}
      </form>

      {/* Result */}
      {result && (
        <section
          className={`card p-4 mb-5 border ${
            result.ok ? "border-accent/30" : "border-bear/30"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.ok ? (
              <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="text-bear shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold ${result.ok ? "text-accent" : "text-bear"}`}>
                {result.ok ? "Order submitted" : "Order failed"}
              </div>
              {result.ok && result.order && (
                <div className="text-xs text-muted mt-1 break-all">
                  ID {result.order.id || result.order.client_order_id || "—"} ·{" "}
                  {result.order.status || "submitted"}
                </div>
              )}
              {result.error && (
                <div className="text-xs text-muted mt-1">{result.error}</div>
              )}
              {result.settlement_warning && (
                <div className="mt-2 flex items-start gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                  <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                  <span className="text-yellow-300">
                    {result.settlement_warning}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setResult(null)}
              className="text-muted hover:text-theme-text shrink-0"
              aria-label="Dismiss"
            >
              <XIcon size={16} />
            </button>
          </div>
        </section>
      )}

      {/* Open orders */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">Open orders</h2>
          <span className="text-xs text-muted">
            <Activity size={12} className="inline mr-1" />
            {orders.length}
          </span>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">
            No open orders.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((o) => (
              <div
                key={o.id || o.client_order_id}
                className="py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold tracking-wide">{o.symbol}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        (o.side || "").toLowerCase() === "buy"
                          ? "bg-accent-bg text-accent"
                          : "bg-bear/10 text-bear"
                      }`}
                    >
                      {o.side}
                    </span>
                    <StatusPill status={o.status} />
                  </div>
                  <div className="text-xs text-muted mt-0.5 tabular-nums">
                    {o.qty} @{" "}
                    {o.order_type === "market"
                      ? "MKT"
                      : fmtUSD(o.limit_price || o.stop_price)}
                    {" · "}
                    {(o.time_in_force || "day").toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={() => onCancel(o.id)}
                  className="text-xs text-muted hover:text-bear px-2 py-1 rounded-md border border-border hover:border-bear transition-colors"
                  aria-label="Cancel order"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
