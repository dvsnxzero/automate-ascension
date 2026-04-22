from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import get_settings
from app.database import engine, Base
from app.market.routes import router as market_router
from app.trade.routes import router as trade_router
from app.strategy.routes import router as strategy_router
from app.auth.routes import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    # TODO: Switch to Alembic migrations for production schema changes
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="Automate Ascension",
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

# API routes
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
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
