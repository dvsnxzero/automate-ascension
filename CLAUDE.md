# AutomateAscension

Personal full-stack trading dashboard. Built on ZipTraderU strategies + Webull paper trading.

## Stack
- Frontend: React 18 + Vite + Tailwind, at `frontend/`
- Backend: FastAPI + SQLAlchemy + SQLite, at `backend/`
- Auth: WebAuthn passkeys (Face ID / Touch ID) with backup codes
- Smooth scroll + parallax: Lenis (`frontend/src/hooks/useLenis.js`)
- Charts: lightweight-charts (candle) + custom DotChart (dot-matrix)

## Run
```bash
# frontend
cd frontend && npm run dev          # http://localhost:5173 (proxies /api → :8000)
# backend
cd backend && uvicorn app.main:app --reload    # http://localhost:8000
```

## Repo conventions
- Tabs/spaces: 2-space JS, 4-space Python
- Mobile-first; bottom nav uses `bottom-nav-safe` / `bottom-nav-fixed` (iOS safe-area inset)
- All theme colors via CSS vars in `frontend/src/index.css` (light + dark)
- Shared preloader: `<PageLoader variant="fullscreen|page|inline" />`
- Active Webull `account_id` is stored in localStorage and auto-attached to every `/api/*` request via axios interceptor (`frontend/src/services/api.js`)
- Backend Webull client lives at `backend/app/webull_client.py`; routes accept optional `account_id` query param

## Communication style
Concise. Action-driven. Skip recaps unless asked. Don't apologize for things that aren't mistakes.

## Skills to lean on
- `algorithmic-art` for any logo / generative visual work (seeded p5.js, dot-matrix house style)
- Use the existing brand palette before introducing new colors

## Where Cowork left off (May 4–5, 2026)
- Service worker bumped to `ascension-v3` (network-first HTML) → fixes the $12k flash caused by stale bundles
- Lenis smooth scroll + animated account dropdown wired
- Subtle parallax on Dashboard portfolio hero
- Branded `PageLoader` used on app boot, Dashboard initial load, Chart load overlay
- Sidebar logo links to `/`
- Account picker buttons no longer disabled on stale liveness — clicking always tries to switch
- ChartView defaults to SPY 5m, with `useEffect([urlSymbol])` syncing route → state
- Auto sign-out on tab close (sessionStorage marker) + 20s blur timeout

## Open thread — Webull paper accounts
User has 4 paper account IDs returned by `/app/subscriptions/list` (N8LK08, 069549, M53808, JF01L9). Webull's consumer docs describe paper trading as one-account-per-user, so these are likely OpenAPI subscription artifacts from re-registering app keys. Liveness probe is in place server-side. Pending decision (a/b/c):
- (a) Auto-pick the single live account, hide picker if only one live
- (b) Pin to most-recently-funded by sorting `total_asset` desc
- (c) `WEBULL_ACCOUNT_ID` env override

Recommended: (a) + (c).
