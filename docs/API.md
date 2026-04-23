# AutomateAscension API Reference

Base URL: `/api`

## Authentication

All `/api` routes require a valid `aa_session` JWT cookie unless marked **public**. The cookie is set as `HttpOnly`, `SameSite=Lax`, and `Secure` in production. It is issued on successful passkey or backup-code authentication and expires after 30 days.

**Public paths** (no cookie required):

- `GET /api/health`
- `GET /api/auth/passkey/setup-status`
- `POST /api/auth/passkey/register/begin`
- `POST /api/auth/passkey/register/complete`
- `POST /api/auth/passkey/auth/begin`
- `POST /api/auth/passkey/auth/complete`
- `POST /api/auth/passkey/auth/backup`
- `GET /api/auth/passkey/session`

Unauthenticated requests to protected routes receive:

```json
{ "detail": "Not authenticated" }   // 401
```

---

## Health

### `GET /api/health` (public)

Basic health check. Returns the running version and build ID.

**Response**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "build": "local-1713880000"
}
```

---

## Auth — Webull Connection (`/api/auth`)

### `GET /api/auth/status`

Check whether Webull API credentials are configured and the connection is alive.

**Response**

```json
{
  "authenticated": true,
  "account_id": "ABCD1234",
  "account_type": "paper",
  "accounts": 1,
  "message": "Connected to Webull API"
}
```

### `GET /api/auth/accounts`

List all Webull accounts linked to the configured app credentials.

**Response**

```json
{
  "accounts": [ ... ],
  "count": 1
}
```

### `POST /api/auth/reconnect`

Reset and re-initialize the Webull client.

**Response**

```json
{
  "reconnected": true,
  "message": "Reconnected"
}
```

---

## Auth — Passkey (`/api/auth/passkey`)

### `GET /api/auth/passkey/setup-status` (public)

Check if passkey registration has been completed.

**Response**

```json
{
  "is_setup": true,
  "has_passkeys": 1,
  "has_backup_codes": 8
}
```

### `POST /api/auth/passkey/register/begin` (public)

Start WebAuthn passkey registration. Returns a challenge for the browser's `navigator.credentials.create()`.

**Response**

```json
{
  "options": "<WebAuthn JSON string>",
  "challenge_key": "a1b2c3d4..."
}
```

### `POST /api/auth/passkey/register/complete` (public)

Complete passkey registration. Verifies the credential and stores it. Sets the `aa_session` cookie. On first registration, returns one-time backup codes.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_key` | string | yes | Key returned from `register/begin` |
| `credential` | string | yes | JSON string from `navigator.credentials.create()` |
| `device_name` | string | no | Label for this device (default: `"Unknown Device"`) |

**Response**

```json
{
  "registered": true,
  "device_name": "MacBook Pro",
  "credential_id": "base64url...",
  "backup_codes": ["012345", "678901", ...],
  "backup_codes_message": "Save these codes \u2014 they won't be shown again."
}
```

`backup_codes` is only present on the first registration.

### `POST /api/auth/passkey/auth/begin` (public)

Start WebAuthn authentication. Returns a challenge for the browser's `navigator.credentials.get()`.

**Response**

```json
{
  "options": "<WebAuthn JSON string>",
  "challenge_key": "a1b2c3d4..."
}
```

### `POST /api/auth/passkey/auth/complete` (public)

Complete passkey authentication. Sets the `aa_session` cookie on success.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_key` | string | yes | Key returned from `auth/begin` |
| `credential` | string | yes | JSON string from `navigator.credentials.get()` |

**Response**

```json
{
  "authenticated": true,
  "device": "MacBook Pro"
}
```

### `POST /api/auth/passkey/auth/backup` (public)

Authenticate using a one-time backup code. Sets the `aa_session` cookie on success.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Six-digit backup code |

**Response**

```json
{
  "authenticated": true,
  "method": "backup_code",
  "remaining_codes": 7
}
```

### `GET /api/auth/passkey/session` (public)

Check if the current session cookie is valid.

**Response**

```json
{
  "authenticated": true,
  "sub": "owner"
}
```

### `POST /api/auth/passkey/logout`

Clear the `aa_session` cookie.

**Response**

```json
{
  "logged_out": true
}
```

---

## Market Data (`/api/market`)

### `GET /api/market/quote/{symbol}`

Get instrument info for a ticker symbol.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Stock ticker (e.g. `AAPL`) |

**Response**

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc",
  "instrument_id": "913256135",
  "exchange": "NAS",
  "currency": "USD",
  "price": null,
  "change_pct": null,
  "volume": null,
  "message": "Instrument found. Real-time quotes via MQTT subscription."
}
```

### `GET /api/market/bars/{symbol}`

Get historical OHLCV candle bars for charting.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Stock ticker |

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | string | `1d` | Bar interval. Values: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w` |
| `count` | int | `200` | Number of bars (max 1200) |

**Response**

```json
{
  "symbol": "AAPL",
  "interval": "1d",
  "count": 200,
  "bars": [
    {
      "time": "2026-04-22",
      "open": 170.50,
      "high": 172.30,
      "low": 169.80,
      "close": 171.90,
      "volume": 54230000
    }
  ],
  "message": "Fetched 200 bars"
}
```

### `GET /api/market/search/{query}`

Search for stocks, ETFs, and funds by name or ticker. Uses a Finnhub -> Yahoo Finance -> Webull fallback chain.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search term (ticker or company name) |

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | `10` | Max results to return |

**Response**

```json
{
  "query": "apple",
  "results": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc",
      "type": "Common Stock",
      "exchange": "NASDAQ",
      "source": "finnhub"
    }
  ],
  "count": 5
}
```

---

## Trade (`/api/trade`)

### `GET /api/trade/account`

Get account balance, buying power, and P&L.

**Response**

```json
{
  "buying_power": 25000.00,
  "total_value": 50000.00,
  "market_value": 25000.00,
  "cash_balance": 25000.00,
  "day_pnl": null,
  "account_type": "paper",
  "account_id": "ABCD1234",
  "connected": true
}
```

### `GET /api/trade/positions`

Get current open positions.

**Response**

```json
{
  "positions": [
    {
      "symbol": "AAPL",
      "name": "AAPL",
      "instrument_id": "913256135",
      "qty": 10,
      "price": 171.90,
      "avg_cost": 165.00,
      "market_value": 1719.00,
      "total_cost": 1650.00,
      "unrealized_pnl": 69.00,
      "change_pct": 4.18,
      "holding_pct": 3.44
    }
  ],
  "count": 1
}
```

### `POST /api/trade/order`

Place a trade order. Defaults to paper trading. Live trading is disabled.

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `symbol` | string | yes | | Ticker symbol |
| `side` | string | yes | | `BUY` or `SELL` |
| `quantity` | int | yes | | Number of shares |
| `order_type` | string | no | `LIMIT` | `MARKET`, `LIMIT`, `STOP_LOSS`, `STOP_LOSS_LIMIT` |
| `price` | float | conditional | `null` | Required for `LIMIT` orders |
| `stop_price` | float | conditional | `null` | Required for `STOP_LOSS` / `STOP_LOSS_LIMIT` |
| `tif` | string | no | `DAY` | Time in force |
| `extended_hours` | bool | no | `false` | Allow extended-hours execution |
| `is_paper` | bool | no | `true` | Must be `true` (live trading disabled) |

**Response** (from Webull)

```json
{
  "client_order_id": "abc123",
  "placed": true
}
```

### `POST /api/trade/order/cancel`

Cancel an open order.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client_order_id` | string | yes | The client order ID to cancel |

**Response**

```json
{
  "cancelled": true
}
```

### `GET /api/trade/orders/today`

Get today's order history.

**Response**

```json
{
  "orders": [
    {
      "client_order_id": "abc123",
      "order_id": "456",
      "symbol": "AAPL",
      "side": "BUY",
      "qty": "10",
      "filled_qty": "10",
      "order_type": "LIMIT",
      "order_status": "FILLED",
      "limit_price": "170.00",
      "filled_price": "169.90",
      "place_time": "2026-04-23T09:31:00Z"
    }
  ],
  "count": 1
}
```

### `GET /api/trade/orders/open`

Get currently open/pending orders.

**Response**

```json
{
  "orders": [ ... ],
  "count": 0
}
```

### `GET /api/trade/history`

Get order history (alias for today's orders).

### `GET /api/trade/watchlist`

Get all watchlist items. Stored locally in the database.

**Response**

```json
{
  "items": [
    {
      "id": 1,
      "symbol": "AAPL",
      "notes": "Watching for breakout",
      "strategy": "pattern",
      "added_at": "2026-04-20T14:30:00"
    }
  ]
}
```

### `POST /api/trade/watchlist`

Add a symbol to the watchlist. Rejects duplicates.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | yes | Ticker symbol |
| `notes` | string | no | Free-text notes |
| `strategy` | string | no | Associated strategy name |

**Response**

```json
{
  "id": 2,
  "symbol": "TSLA",
  "added": true
}
```

### `DELETE /api/trade/watchlist/{id}`

Remove a symbol from the watchlist.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | int | Watchlist item ID |

**Response**

```json
{
  "removed": true,
  "symbol": "TSLA"
}
```

---

## Strategy (`/api/strategy`)

### `POST /api/strategy/analyze/{symbol}`

Run technical analysis (SMA, RSI, MACD) on a symbol using live market data.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Ticker symbol |

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | string | `1d` | Bar interval (`1m` through `1w`) |

**Response**

```json
{
  "symbol": "AAPL",
  "price": 171.90,
  "interval": "1d",
  "bars_count": 200,
  "sma": {
    "short_sma": 170.50,
    "long_sma": 168.20,
    "confirmation": true,
    "validation": true,
    "direction_bullish": true
  },
  "rsi": {
    "value": 52.3,
    "overbought": false,
    "oversold": false,
    "fair_value": true
  },
  "macd": {
    "positive_strength": true,
    "macd_value": 1.25,
    "signal_value": 0.80
  }
}
```

### `POST /api/strategy/scorecard`

Run the ZipTrader 7-Step Test on a trade setup. Evaluates risk/reward, SMA confirmation, RSI, MACD, long-term trend, news, and analyst targets.

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `time_frame` | string | no | `swing` | `intraday`, `swing`, or `position` |
| `entry_price` | float | yes | | Planned entry price |
| `stop_loss_price` | float | yes | | Stop-loss level |
| `target_price` | float | yes | | Profit target |
| `rsi_value` | float | no | `null` | Current RSI reading |
| `has_sma_confirmation` | bool | no | `false` | Price above short SMA, short above long SMA |
| `macd_positive` | bool | no | `false` | MACD showing positive strength |
| `above_180_sma` | bool | no | `false` | Price above 180-period SMA |
| `news_sentiment` | int | no | `0` | `-1` (negative), `0` (neutral), `1` (positive) |
| `analyst_target` | float | no | `null` | Consensus analyst price target |

**Response**

```json
{
  "scores": {
    "time_frame": 0,
    "risk_reward": 2,
    "elevating_factors": 2,
    "long_term": 1,
    "news": 1,
    "analyst": 1
  },
  "total_score": 7,
  "max_score": 7,
  "recommendation": "GO",
  "risk_reward_ratio": 3.5,
  "details": [
    "Time frame: swing",
    "R:R = 3.5 \u2014 excellent",
    "SMA confirmation \u2014 elevating",
    "MACD positive strength \u2014 elevating",
    "RSI 52 \u2014 fair value zone",
    "Above 180-SMA \u2014 bullish long-term direction",
    "News sentiment: positive",
    "Analyst target 20% above entry \u2014 elevating"
  ]
}
```

Recommendation thresholds: `GO` (>= 5), `CAUTION` (>= 3), `NO-GO` (< 3).

### `POST /api/strategy/scan/{type}`

Run a market scanner. Scans a curated universe of ~50 popular tickers.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Scanner type: `morning`, `overreaction`, or `pattern` |

**Request Body** (optional, for `morning` scanner)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `price_change_pct_min` | float | `5.0` | Minimum absolute price change % |
| `volume_change_pct_min` | float | `2.0` | Minimum volume change % above average |
| `min_price` | float | `1.0` | Minimum stock price |
| `max_price` | float | `null` | Maximum stock price |
| `limit` | int | `50` | Max results |

**Response**

```json
{
  "scanner": "morning",
  "count": 3,
  "results": [
    {
      "symbol": "TSLA",
      "price": 245.50,
      "change_pct": 8.20,
      "volume": 98000000,
      "scanner_type": "morning",
      "score": null,
      "notes": "Vol +340% vs avg"
    }
  ]
}
```

---

## Journal (`/api/journal`)

### `GET /api/journal/orders`

Get order history with optional filters.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | string | `null` | Filter by ticker |
| `status` | string | `null` | Filter by status (`PENDING`, `FILLED`, `CANCELLED`, `REJECTED`) |
| `limit` | int | `50` | Max results (max 500) |
| `offset` | int | `0` | Pagination offset |

**Response**

```json
{
  "orders": [
    {
      "id": 1,
      "webull_order_id": "789",
      "symbol": "AAPL",
      "side": "BUY",
      "order_type": "LIMIT",
      "quantity": 10.0,
      "limit_price": 170.00,
      "stop_price": null,
      "filled_price": 169.90,
      "filled_quantity": 10.0,
      "status": "FILLED",
      "is_paper": true,
      "strategy_name": "pattern_breakout",
      "scorecard_score": 6,
      "setup_notes": "Clean breakout above 9-SMA",
      "placed_at": "2026-04-23T09:30:00",
      "filled_at": "2026-04-23T09:31:00"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

### `POST /api/journal/orders/sync`

Sync today's orders from Webull into the local journal database. Creates new records or updates existing ones.

**Response**

```json
{
  "synced": 5,
  "total_webull_orders": 8
}
```

### `GET /api/journal/trades`

Get closed trade entries with P&L.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | string | `null` | Filter by ticker |
| `strategy` | string | `null` | Filter by strategy name |
| `limit` | int | `50` | Max results (max 500) |
| `offset` | int | `0` | Pagination offset |

**Response**

```json
{
  "trades": [
    {
      "id": 1,
      "symbol": "AAPL",
      "side": "LONG",
      "entry_price": 165.00,
      "exit_price": 171.90,
      "quantity": 10.0,
      "gross_pnl": 69.00,
      "fees": 0.0,
      "net_pnl": 69.00,
      "pnl_pct": 4.18,
      "hold_duration_mins": 390,
      "strategy_name": "pattern_breakout",
      "scorecard_score": 6,
      "notes": "Clean entry on SMA bounce",
      "emotion_tag": "confident",
      "followed_plan": true,
      "lesson_learned": null,
      "opened_at": "2026-04-22T09:30:00",
      "closed_at": "2026-04-22T16:00:00"
    }
  ],
  "total": 15
}
```

### `POST /api/journal/trades`

Log a closed trade manually.

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `symbol` | string | yes | | Ticker symbol |
| `side` | string | no | `LONG` | `LONG` or `SHORT` |
| `entry_price` | float | yes | | Entry price |
| `exit_price` | float | yes | | Exit price |
| `quantity` | float | yes | | Number of shares |
| `fees` | float | no | `0` | Total fees/commissions |
| `strategy_name` | string | no | `null` | Strategy used |
| `scorecard_score` | int | no | `null` | 7-Step Test score |
| `notes` | string | no | `null` | Trade notes |
| `emotion_tag` | string | no | `null` | Emotion tag (e.g. `confident`, `fomo`, `revenge`) |
| `followed_plan` | bool | no | `null` | Did you follow your trading plan? |
| `lesson_learned` | string | no | `null` | Post-trade reflection |
| `opened_at` | string | yes | | ISO datetime of entry |
| `closed_at` | string | yes | | ISO datetime of exit |

P&L fields (`gross_pnl`, `net_pnl`, `pnl_pct`, `hold_duration_mins`) are computed automatically.

### `PATCH /api/journal/trades/{id}`

Update trade reflection fields.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | int | Trade ID |

**Request Body** (all optional)

| Field | Type | Description |
|-------|------|-------------|
| `notes` | string | Trade notes |
| `emotion_tag` | string | Emotion tag |
| `followed_plan` | bool | Plan adherence |
| `lesson_learned` | string | Post-trade reflection |

### `GET /api/journal/stats`

Aggregate trade statistics for the journal dashboard.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | int | `30` | Lookback period in days (max 365) |

**Response**

```json
{
  "period_days": 30,
  "total_trades": 15,
  "win_rate": 66.7,
  "total_pnl": 1250.00,
  "avg_pnl": 83.33,
  "avg_winner": 145.00,
  "avg_loser": -42.50,
  "best_trade": { "...trade object..." },
  "worst_trade": { "...trade object..." },
  "profit_factor": 2.85,
  "avg_hold_mins": 240,
  "by_strategy": {
    "pattern_breakout": { "count": 8, "pnl": 950.00, "wins": 6 },
    "Manual": { "count": 7, "pnl": 300.00, "wins": 4 }
  },
  "by_emotion": {
    "confident": { "count": 10, "pnl": 1100.00 },
    "fomo": { "count": 3, "pnl": -200.00 }
  },
  "plan_adherence": 80.0
}
```

### `GET /api/journal/balance`

Get daily balance history.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | `90` | Number of days to return (max 365) |

**Response**

```json
{
  "balances": [
    {
      "id": 1,
      "date": "2026-04-23",
      "total_value": 50000.00,
      "cash": 25000.00,
      "buying_power": 25000.00,
      "day_pnl": 150.00,
      "total_pnl": 1250.00,
      "open_positions": 3,
      "is_paper": true
    }
  ],
  "count": 30
}
```

### `POST /api/journal/balance/snapshot`

Take a balance snapshot from Webull and store it. Upserts for today's date.

**Response**

```json
{
  "snapshot": "saved",
  "date": "2026-04-23",
  "total_value": 50000.00
}
```

### `GET /api/journal/signals`

Get strategy signal log entries.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | string | `null` | Filter by ticker |
| `limit` | int | `50` | Max results (max 500) |

**Response**

```json
{
  "signals": [
    {
      "id": 1,
      "symbol": "AAPL",
      "signal_type": "indicator",
      "signal_name": "SMA_CROSSOVER",
      "direction": "bullish",
      "strength": 3,
      "details": { "short_sma": 170.5, "long_sma": 168.2 },
      "acted_on": false,
      "created_at": "2026-04-23T10:15:00"
    }
  ]
}
```

### `POST /api/journal/signals`

Log a strategy signal.

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `symbol` | string | yes | | Ticker symbol |
| `signal_type` | string | yes | | Category (e.g. `indicator`, `scanner`, `manual`) |
| `signal_name` | string | yes | | Signal identifier (e.g. `SMA_CROSSOVER`) |
| `direction` | string | no | `null` | `bullish` or `bearish` |
| `strength` | int | no | `null` | Signal strength (1-5) |
| `details` | object | no | `null` | Arbitrary JSON with signal context |

---

## Intel (`/api/intel`)

### `POST /api/intel/reddit/scrape`

Scrape Reddit for market-relevant posts. Runs sentiment analysis and stores results.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `subreddits` | string | `null` | Comma-separated subreddit names (defaults to built-in list) |
| `sort` | string | `hot` | Reddit sort order |
| `limit` | int | `15` | Posts per subreddit (max 50) |

**Response**

```json
{
  "new_posts": 12,
  "updated_posts": 3,
  "subreddits_scraped": 4
}
```

### `POST /api/intel/reddit/search`

Search Reddit for specific topics and store results with sentiment.

**Query Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | yes | | Search query |
| `subreddit` | string | no | `null` | Limit to one subreddit |
| `time_filter` | string | no | `day` | Reddit time filter |
| `limit` | int | no | `25` | Max results (max 100) |

**Response**

```json
{
  "query": "NVDA earnings",
  "new_posts": 8,
  "total_found": 25
}
```

### `GET /api/intel/reddit/feed`

Get stored Reddit posts with filters.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `subreddit` | string | `null` | Filter by subreddit |
| `sentiment` | string | `null` | `bullish`, `bearish`, or `neutral` |
| `symbol` | string | `null` | Filter by mentioned symbol |
| `tag` | string | `null` | Filter by content tag |
| `hours` | int | `24` | Lookback window in hours (max 168) |
| `limit` | int | `50` | Max results (max 200) |

**Response**

```json
{
  "posts": [
    {
      "id": 1,
      "reddit_id": "abc123",
      "subreddit": "wallstreetbets",
      "title": "NVDA to the moon",
      "body": "truncated to 300 chars...",
      "author": "user123",
      "url": "https://reddit.com/...",
      "score": 1500,
      "num_comments": 340,
      "symbols_mentioned": "NVDA",
      "sentiment_score": 0.75,
      "sentiment_label": "bullish",
      "relevance_score": 8.5,
      "tags": "earnings,momentum",
      "posted_at": "2026-04-23T08:00:00"
    }
  ],
  "count": 10
}
```

### `POST /api/intel/news/fetch`

Fetch news from Finnhub and store with sentiment analysis.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | `general` | News category (Finnhub categories) |
| `symbol` | string | `null` | Fetch company-specific news instead of general |

**Response**

```json
{
  "new_articles": 15,
  "total_fetched": 20
}
```

### `GET /api/intel/news/feed`

Get stored news articles with filters.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | string | `null` | Filter by symbol |
| `category` | string | `null` | Filter by category |
| `sentiment` | string | `null` | `bullish`, `bearish`, or `neutral` |
| `hours` | int | `24` | Lookback window (max 168) |
| `limit` | int | `50` | Max results (max 200) |

**Response**

```json
{
  "articles": [
    {
      "id": 1,
      "source": "finnhub",
      "headline": "Apple Reports Record Quarter",
      "summary": "truncated to 300 chars...",
      "url": "https://...",
      "image_url": "https://...",
      "symbols": "AAPL",
      "sentiment_score": 0.82,
      "sentiment_label": "bullish",
      "category": "technology",
      "tags": "earnings,revenue",
      "published_at": "2026-04-23T06:00:00"
    }
  ],
  "count": 15
}
```

### `GET /api/intel/news/sentiment/{symbol}`

Get live sentiment data for a symbol directly from Finnhub.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Ticker symbol |

**Response**

Returns the Finnhub news sentiment response object.

### `GET /api/intel/dashboard`

Full intelligence dashboard summary combining sentiment, mentions, events, and recent content.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hours` | int | `24` | Lookback window (max 168) |

**Response**

```json
{
  "period_hours": 24,
  "sentiment_timeline": [
    {
      "timestamp": "2026-04-23T08:00:00",
      "reddit": 0.35,
      "news": 0.55,
      "combined": 0.47
    }
  ],
  "sentiment_distribution": {
    "bullish": 25,
    "bearish": 10,
    "neutral": 15,
    "total": 50
  },
  "top_reddit": [ "...post objects..." ],
  "latest_news": [ "...article objects..." ],
  "recent_events": [ "...event objects..." ]
}
```

### `GET /api/intel/events`

Get cataloged market-moving events.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `event_type` | string | `null` | Filter by type |
| `days` | int | `30` | Lookback (max 365) |
| `limit` | int | `50` | Max results (max 200) |

**Response**

```json
{
  "events": [
    {
      "id": 1,
      "title": "Fed Rate Decision",
      "description": "Fed holds rates steady",
      "event_type": "fed",
      "severity": 9,
      "symbols_affected": "SPY,QQQ",
      "sectors_affected": "tech,finance",
      "reaction_time_mins": 15,
      "market_direction": "bullish",
      "spy_change_pct": 1.2,
      "top_mover_symbol": "NVDA",
      "top_mover_pct": 5.3,
      "max_profit_pct": 3.8,
      "optimal_strategy": "momentum",
      "ai_analysis": "Market rallied on dovish tone...",
      "pattern_tags": "rate_hold,dovish",
      "occurred_at": "2026-04-22T14:00:00"
    }
  ],
  "count": 5
}
```

### `POST /api/intel/events`

Catalog a market-moving event.

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | yes | | Event title |
| `description` | string | no | `null` | Event description |
| `event_type` | string | yes | | Category (e.g. `fed`, `earnings`, `geopolitical`) |
| `severity` | int | no | `5` | Severity 1-10 |
| `symbols_affected` | string | no | `null` | Comma-separated tickers |
| `sectors_affected` | string | no | `null` | Comma-separated sectors |
| `occurred_at` | string | yes | | ISO datetime |

### `POST /api/intel/snapshot`

Take a point-in-time sentiment snapshot aggregating stored Reddit and news data.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `bucket` | string | `hourly` | Aggregation window: `hourly` or `daily` |

**Response**

```json
{
  "snapshot_id": 42,
  "timestamp": "2026-04-23T10:00:00",
  "reddit_sentiment": 0.350,
  "news_sentiment": 0.550,
  "combined_sentiment": 0.470,
  "reddit_posts": 50,
  "news_articles": 20,
  "top_symbols": [
    { "symbol": "NVDA", "count": 12, "sentiment": 0.8 }
  ],
  "top_topics": [
    { "topic": "earnings", "count": 8 }
  ]
}
```

---

## Notes (`/api/notes`)

### `GET /api/notes/modules`

List all course modules with lesson counts.

**Response**

```json
{
  "modules": [
    {
      "num": "05",
      "name": "Fundamentals",
      "slug": "05-Fundamentals",
      "lesson_count": 15
    }
  ],
  "notes_dir_found": true
}
```

### `GET /api/notes/modules/{moduleSlug}/lessons`

List all lessons in a module.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `moduleSlug` | string | Module directory name (e.g. `05-Fundamentals`) |

**Response**

```json
{
  "lessons": [
    {
      "module_num": "05",
      "lesson_num": "03",
      "title": "MACD Crossovers",
      "filename": "05-03-MACD-Crossovers.md"
    }
  ],
  "module_slug": "05-Fundamentals"
}
```

### `GET /api/notes/modules/{moduleSlug}/lessons/{filename}`

Get the full markdown content of a lesson.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `moduleSlug` | string | Module directory name |
| `filename` | string | Lesson filename (e.g. `05-03-MACD-Crossovers.md`) |

**Response**

```json
{
  "filename": "05-03-MACD-Crossovers.md",
  "module_slug": "05-Fundamentals",
  "title": "MACD Crossovers",
  "content": "# MACD Crossovers\n\nThe MACD indicator..."
}
```

### `GET /api/notes/search`

Full-text search across all course notes.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | yes | Search query (min 2 characters) |

**Response**

```json
{
  "results": [
    {
      "module_slug": "05-Fundamentals",
      "module_name": "Fundamentals",
      "module_num": "05",
      "filename": "05-03-MACD-Crossovers.md",
      "title": "MACD Crossovers",
      "snippets": [
        "The MACD histogram shows momentum divergence..."
      ]
    }
  ],
  "query": "MACD",
  "count": 3
}
```

---

## Error Responses

All endpoints return errors in a consistent format:

| Status | Meaning |
|--------|---------|
| `400` | Bad request / validation error |
| `401` | Not authenticated or invalid session |
| `404` | Resource not found |
| `500` | Internal server error |

```json
{
  "detail": "Error description"
}
```

Many Webull-dependent endpoints return a success-shaped response with an `error` or `message` field instead of raising HTTP errors, so the frontend can degrade gracefully when the broker API is unavailable.
