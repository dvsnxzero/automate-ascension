from contextlib import asynccontextmanager
from pathlib import Path

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

# Auth middleware (after CORS so preflight works)
app.add_middleware(AuthMiddleware)

# API routes
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(passkey_router, prefix="/api/auth", tags=["passkey"])
app.include_router(market_router, prefix="/api/market", tags=["market"])
app.include_router(trade_router, prefix="/api/trade", tags=["trade"])
app.include_router(strategy_router, prefix="/api/strategy", tags=["strategy"])


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# Serve React frontend (static files from Vite build)
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
