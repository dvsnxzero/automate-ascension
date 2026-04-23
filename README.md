# AutomateAscension

A personal trading dashboard built to complement the ZipTrader U trading course. Charting, scanning, journaling, market intelligence, and course notes — all in one place.

**Live at**: [app.undefinedanxiety.ai](https://app.undefinedanxiety.ai)

---

## Tech Stack

| Layer | Stack |
|------------|-------|
| Frontend | React 18 + Vite, Tailwind CSS, lightweight-charts (TradingView), Recharts, React Router, Lucide icons |
| Backend | Python FastAPI, SQLAlchemy + PostgreSQL, WebAuthn passkey auth (no passwords), JWT sessions |
| Deployment | Docker multi-stage build, Railway (production), custom domain |
| APIs | Webull OpenAPI (market data/trading), Finnhub (news/search), Yahoo Finance (search fallback), Reddit public JSON (sentiment) |

## Key Features

- **Dashboard** — Portfolio overview with sparklines, watchlist, balance tracking
- **Charts** — Interactive candlestick charts with SMA overlays, multiple timeframes
- **Scanner** — Morning movers, overreaction plays, pattern breakout scanners
- **Journal** — Trade logging with P&L tracking, win rate stats, balance snapshots
- **Intel** — Reddit sentiment, Finnhub news, market event catalog
- **Course Notes** — Searchable ZipTrader U lecture content organized by module
- **Backtest Lab** — Coming soon (Phase 2)

## Project Structure

```
automate-ascension/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, middleware, static serving
│   │   ├── config.py            # Pydantic settings (env vars)
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models.py            # All DB models
│   │   ├── webull_client.py     # Webull OpenAPI wrapper
│   │   ├── auth/                # WebAuthn passkey + JWT auth
│   │   ├── market/              # Quotes, bars, symbol search
│   │   ├── trade/               # Orders, positions, watchlist
│   │   ├── strategy/            # Scanners, indicators, scorecard
│   │   ├── journal/             # Trade journal, balance tracking
│   │   ├── intel/               # Reddit scraping, Finnhub news, sentiment
│   │   └── notes/               # ZipTrader U course notes viewer
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root app with auth + routing
│   │   ├── main.jsx             # Entry point
│   │   ├── index.css            # Theme variables + base styles
│   │   ├── components/          # All page components
│   │   ├── hooks/               # useTheme, useSessionTimeout
│   │   └── services/            # API client, passkey service
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── Dockerfile                   # Multi-stage: Node build → Python serve
├── docker-compose.yml           # Local dev with PostgreSQL
├── railway.json                 # Railway deployment config
├── .env.example                 # Environment variable template
└── .gitignore
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `WEBULL_APP_KEY` | Webull OpenAPI app key |
| `WEBULL_APP_SECRET` | Webull OpenAPI app secret |
| `DATABASE_URL` | PostgreSQL connection string (Railway auto-provides) |
| `SECRET_KEY` | JWT signing key (random 64-char string) |
| `FINNHUB_API_KEY` | Finnhub API key for news and search |
| `ENVIRONMENT` | `development` or `production` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |

## Local Development

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in values
3. Start PostgreSQL:
   ```bash
   docker compose up -d db
   ```
4. Start the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
5. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
6. Open [http://localhost:5173](http://localhost:5173)

## Authentication

WebAuthn passkeys — no passwords. Supports Face ID, Touch ID, Windows Hello, and cross-device QR code scanning. Sessions are managed with JWT cookies and a configurable inactivity timeout. Backup codes are available for recovery.

## Theme System

Light and dark mode with automatic day/night scheduling (light 6 AM -- 6 PM). CSS custom properties power the entire theme across all components. Theme preference is saved to localStorage.

## Deployment

Pushes to `main` auto-deploy via Railway. The Dockerfile uses a multi-stage build: the React frontend is compiled first, then served as static files from FastAPI in the final image. Custom domain points to `app.undefinedanxiety.ai`.
