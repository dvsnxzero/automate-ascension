import axios from "axios";

// ─── Active account selection ───
// The frontend stores the user's chosen account_id locally and sends it
// on every request so multi-account users can switch contexts.
const ACTIVE_ACCOUNT_KEY = "aa-active-account-id";

export function getActiveAccountId() {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveAccount(accountId) {
  try {
    if (accountId) localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
    else localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {}
}

// In dev, Vite proxies /api to localhost:8000
// In prod, same origin (FastAPI serves the frontend)
const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30s timeout for scanner operations
  withCredentials: true, // Send cookies for auth
});

// Attach active account_id to every request as a query param
api.interceptors.request.use((config) => {
  const acct = getActiveAccountId();
  if (acct) {
    config.params = { ...(config.params || {}), account_id: acct };
  }
  return config;
});

// --- Auth ---
export const getAuthStatus = () => api.get("/auth/status");
export const listAccounts = () => api.get("/auth/accounts");
export const reconnect = () => api.post("/auth/reconnect");

// --- Market Data ---
export const getQuote = (symbol) => api.get(`/market/quote/${symbol}`);
export const getBars = (symbol, interval = "1d", count = 200) =>
  api.get(`/market/bars/${symbol}`, { params: { interval, count } });
export const searchSymbol = (query) => api.get(`/market/search/${query}`);

// --- Trading ---
export const getAccount = () => api.get("/trade/account");
export const getPositions = () => api.get("/trade/positions");
export const placeOrder = (order) => api.post("/trade/order", order);
export const cancelOrder = (clientOrderId) =>
  api.post("/trade/order/cancel", null, { params: { client_order_id: clientOrderId } });
export const getTodayOrders = () => api.get("/trade/orders/today");
export const getOpenOrders = () => api.get("/trade/orders/open");
export const getOrderHistory = () => api.get("/trade/history");

// --- Paper Trading (Alpaca) ---
export const getPaperStatus = () => api.get("/paper/status");
export const getPaperAccount = () => api.get("/paper/account");
export const getPaperConfigurations = () => api.get("/paper/configurations");
export const getPaperPositions = () => api.get("/paper/positions");
export const getPaperOrders = (status = "all", limit = 100) =>
  api.get("/paper/orders", { params: { status, limit } });
export const getPaperOrder = (orderId) => api.get(`/paper/orders/${orderId}`);
export const placePaperStockOrder = (order) => api.post("/paper/order", order);
export const placePaperOptionOrder = (order) => api.post("/paper/order/option", order);
export const cancelPaperOrder = (orderId) => api.delete(`/paper/order/${orderId}`);
export const findOptionContracts = (req) => api.post("/paper/options/contracts", req);

// --- Settlement (T+1 cash tracking, mirrors live IRA rules) ---
export const getSettlementState = () => api.get("/paper/settlement/state");
export const getSettlementLots = (settled) =>
  api.get("/paper/settlement/lots", { params: settled !== undefined ? { settled } : {} });
export const getSettlementViolations = () => api.get("/paper/settlement/violations");

// --- Runner (live paper-execution engine) ---
export const getRunnerStatus = () => api.get("/runner/status");
export const startRunner = (cfg = {}) => api.post("/runner/start", cfg);
export const stopRunner = () => api.post("/runner/stop");
export const runnerTickOnce = () => api.post("/runner/tick");

// --- Backtest strategy list (for runner dropdown) ---
export const listStrategies = () => api.get("/backtest/strategies");

// --- Trading Mode (paper vs live) ---
const TRADING_MODE_KEY = "aa-trading-mode";

export function getTradingMode() {
  try {
    return localStorage.getItem(TRADING_MODE_KEY) || "paper";
  } catch {
    return "paper";
  }
}

export function setTradingMode(mode) {
  try {
    localStorage.setItem(TRADING_MODE_KEY, mode);
  } catch {}
}

/**
 * Mode-aware account fetch. Paper response (Alpaca shape) is normalized
 * to the field names the Dashboard already uses (Webull-style), so the
 * UI doesn't need to branch on mode.
 *
 * Returned shape (both modes):
 *   account_id, account_type, total_value, buying_power, cash_balance,
 *   market_value, day_pnl, connected, broker
 *   + paper-only extras: equity, options_buying_power, options_trading_level,
 *     account_number, scale_factor, capped, virtual_cap
 */
export async function getAccountForMode(mode = getTradingMode()) {
  if (mode === "live") {
    const res = await api.get("/trade/account");
    return { ...res, data: { ...res.data, broker: "webull" } };
  }
  const res = await api.get("/paper/account");
  const d = res.data || {};
  const dayPnl = typeof d.equity === "number" && typeof d.last_equity === "number"
    ? d.equity - d.last_equity
    : 0;
  return {
    ...res,
    data: {
      ...d,
      // Field aliases so the Webull-shaped UI keeps working
      account_id: d.account_number,
      total_value: d.equity,
      market_value: d.position_value ?? 0,
      cash_balance: d.cash,
      day_pnl: dayPnl,
    },
  };
}

export async function getPositionsForMode(mode = getTradingMode()) {
  if (mode === "live") return api.get("/trade/positions");
  const res = await api.get("/paper/positions");
  // Normalize Alpaca position shape → Webull-ish field names
  const positions = (res.data?.positions || []).map((p) => ({
    ...p,
    unrealized_pnl: p.unrealized_pl,
    change_pct: p.unrealized_plpc,
    avg_cost: p.avg_entry_price,
    price: p.current_price,
    qty: p.qty,
    holding_pct: undefined, // Alpaca doesn't return this; computed at display time
  }));
  return { ...res, data: { ...res.data, positions, source: "alpaca" } };
}

export const getOrdersForMode = (mode = getTradingMode()) =>
  mode === "live" ? api.get("/trade/orders/today") : api.get("/paper/orders");

// --- Watchlist ---
export const getWatchlist = () => api.get("/trade/watchlist");
export const addToWatchlist = (item) => api.post("/trade/watchlist", item);
export const removeFromWatchlist = (id) => api.delete(`/trade/watchlist/${id}`);

// --- Strategy ---
export const analyzeSymbol = (symbol, interval = "1d") =>
  api.post(`/strategy/analyze/${symbol}`, null, { params: { interval } });
export const runScorecard = (input) => api.post("/strategy/scorecard", input);
export const runScan = (type, config = {}) =>
  api.post(`/strategy/scan/${type}`, config);

// --- Journal ---
export const getOrders = (params = {}) => api.get("/journal/orders", { params });
export const syncOrders = () => api.post("/journal/orders/sync");
export const getTrades = (params = {}) => api.get("/journal/trades", { params });
export const createTrade = (trade) => api.post("/journal/trades", trade);
export const updateTrade = (id, data) => api.patch(`/journal/trades/${id}`, data);
export const getTradeStats = (params = {}) => api.get("/journal/stats", { params });
export const getBalance = (params = {}) => api.get("/journal/balance", { params });
export const snapshotBalance = () => api.post("/journal/balance/snapshot");
export const getSignals = (params = {}) => api.get("/journal/signals", { params });
export const createSignal = (signal) => api.post("/journal/signals", signal);

// --- Intel (Market Intelligence) ---
export const scrapeReddit = (params = {}) => api.post("/intel/reddit/scrape", null, { params });
export const searchReddit = (query, params = {}) => api.post("/intel/reddit/search", null, { params: { query, ...params } });
export const getRedditFeed = (params = {}) => api.get("/intel/reddit/feed", { params });
export const fetchNews = (params = {}) => api.post("/intel/news/fetch", null, { params });
export const getNewsFeed = (params = {}) => api.get("/intel/news/feed", { params });
export const getSymbolSentiment = (symbol) => api.get(`/intel/news/sentiment/${symbol}`);
export const getIntelDashboard = (params = {}) => api.get("/intel/dashboard", { params });
export const getMarketEvents = (params = {}) => api.get("/intel/events", { params });
export const createMarketEvent = (event) => api.post("/intel/events", event);
export const takeSentimentSnapshot = (bucket = "hourly") => api.post("/intel/snapshot", null, { params: { bucket } });

// --- Backtest Lab ---
export const getStrategies = () => api.get("/backtest/strategies");
export const runBacktest = (payload) => api.post("/backtest/run", payload);
export const listRuns = (params = {}) => api.get("/backtest/runs", { params });
export const getRun = (id) => api.get(`/backtest/runs/${id}`);
export const updateRun = (id, patch) => api.patch(`/backtest/runs/${id}`, patch);
export const deleteRun = (id) => api.delete(`/backtest/runs/${id}`);
export const rerunBacktest = (id) => api.post(`/backtest/runs/${id}/rerun`);

// --- Course Notes ---
export const getModules = () => api.get("/notes/modules");
export const getLessons = (moduleSlug) => api.get(`/notes/modules/${moduleSlug}/lessons`);
export const getLesson = (moduleSlug, filename) => api.get(`/notes/modules/${moduleSlug}/lessons/${filename}`);
export const searchNotes = (query) => api.get("/notes/search", { params: { q: query } });

// --- Health ---
export const healthCheck = () => api.get("/health");

export default api;
