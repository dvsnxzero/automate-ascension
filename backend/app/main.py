from contextlib import asynccontextmanager
from pathlib import Path
import os
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.market.routes import router as market_router
from app.trade.routes import router as trade_router
from app.strategy.routes import router as strategy_router
from app.auth.routes import router as auth_router
from app.auth.passkey import router as passkey_router
from app.journal.routes import router as journal_router
from app.intel.routes import router as intel_router
from app.notes.routes import router as notes_router


# ─── Auth middleware ───

# Routes that don't require authentication
PUBLIC_PATHS = {
    "/api/health",
    "/api/auth/passkey/setup-status",
    "/api/auth/passkey/register/begin",
    "/api/auth/passkey/register/complete",
    "/api/auth/passkey/auth/begin",
    "/api/auth/passkey/auth/complete",
    "/api/auth/passkey/auth/backup",
    "/api/auth/passkey/session",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """Protect all /api routes except public auth endpoints."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip non-API routes (frontend static files)
        if not path.startswith("/api"):
            return await call_next(request)

        # Skip public endpoints
        if path in PUBLIC_PATHS:
            return await call_next(request)

        # Skip OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check session cookie
        session_token = request.cookies.get("aa_session")
        if not session_token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"},
            )

        try:
            import jose.jwt as jwt
            settings = get_settings()
            jwt.decode(session_token, settings.secret_key, algorithms=["HS256"])
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid session"},
            )

        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="AutomateAscension",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache headers for hashed assets (/assets/*)
class CacheControlMiddleware(BaseHTTPMiddleware):
    """Set aggressive caching for Vite's content-hashed assets."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            # Vite hashes filenames → safe to cache for 1 year, immutable
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# Auth middleware (after CORS so preflight works)
app.add_middleware(CacheControlMiddleware)
app.add_middleware(AuthMiddleware)

# API routes
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(passkey_router, prefix="/api/auth", tags=["passkey"])
app.include_router(market_router, prefix="/api/market", tags=["market"])
app.include_router(trade_router, prefix="/api/trade", tags=["trade"])
app.include_router(strategy_router, prefix="/api/strategy", tags=["strategy"])
app.include_router(journal_router, prefix="/api/journal", tags=["journal"])
app.include_router(intel_router, prefix="/api/intel", tags=["intel"])
app.include_router(notes_router, prefix="/api/notes", tags=["notes"])


# ─── Build version ───
# Set at container start time; changes on every deploy
BUILD_ID = os.environ.get("RAILWAY_DEPLOYMENT_ID", f"local-{int(time.time())}")


# Health check — includes build ID so you can verify which deploy is live
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0", "build": BUILD_ID}


# ─── Static file serving with cache control ───
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    # /assets/* — Vite content-hashed filenames → cache forever
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA with proper cache headers.

        - index.html → no-cache (always revalidate so new deploys are picked up)
        - favicon.svg, manifest.json → short cache with revalidation
        - Other static files → served as-is
        """
        file_path = static_dir / full_path

        # Serve the matched file or fall back to index.html (SPA routing)
        if file_path.exists() and file_path.is_file():
            response = FileResponse(file_path)
        else:
            file_path = static_dir / "index.html"
            response = FileResponse(file_path)

        # Cache policy based on file type
        name = file_path.name
        if name == "index.html":
            # NEVER cache index.html — it references hashed bundles,
            # so a stale copy means the browser never loads new code
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        elif name in ("favicon.svg", "favicon.ico", "manifest.json"):
            # Short cache — revalidate after 1 hour
            response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
        else:
            # Everything else served from root (not /assets) gets short cache
            response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"

        return response
