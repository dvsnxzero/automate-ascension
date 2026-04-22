import axios from "axios";

// In dev, Vite proxies /api to localhost:8000
// In prod, same origin (FastAPI serves the frontend)
const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30s timeout for scanner operations
  withCredentials: true, // Send cookies for auth
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

// --- Health ---
export const healthCheck = () => api.get("/health");

export default api;
