from datetime import datetime
from sqlalchemy import String, Float, Boolean, Text, DateTime, JSON, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class WebAuthnCredential(Base):
    __tablename__ = "webauthn_credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    credential_id: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, unique=True)
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    device_name: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BackupCode(Base):
    __tablename__ = "backup_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)


class Watchlist(Base):
    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)
    strategy: Mapped[str | None] = mapped_column(String(50))  # value_dip, swing, scanner_hit


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # buy / sell
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    filled_at: Mapped[datetime | None] = mapped_column(DateTime)
    order_type: Mapped[str | None] = mapped_column(String(20))
    strategy_used: Mapped[str | None] = mapped_column(String(50))
    scorecard_json: Mapped[str | None] = mapped_column(Text)  # 7-step test snapshot
    notes: Mapped[str | None] = mapped_column(Text)
    pnl: Mapped[float | None] = mapped_column(Float)
    is_paper: Mapped[bool] = mapped_column(Boolean, default=True)


class Backtest(Base):
    __tablename__ = "backtests"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(200))
    strategy_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    symbols: Mapped[str] = mapped_column(Text, nullable=False)
    date_range: Mapped[str | None] = mapped_column(String(50))
    results_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    condition_type: Mapped[str | None] = mapped_column(String(30))  # price_above, rsi_below, sma_cross
    condition_value: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime)


class ResearchCard(Base):
    __tablename__ = "research_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    niche: Mapped[str | None] = mapped_column(Text)
    revenue_growth: Mapped[str | None] = mapped_column(Text)
    competitive_advantage: Mapped[str | None] = mapped_column(Text)
    management: Mapped[str | None] = mapped_column(Text)
    valuation_notes: Mapped[str | None] = mapped_column(Text)
    conviction_score: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════
# Trade Journal — full order/P&L/balance history
# ═══════════════════════════════════════════════

class Order(Base):
    """Every order placed, filled, cancelled — synced from Webull."""
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    webull_order_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    client_order_id: Mapped[str | None] = mapped_column(String(100))
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # BUY / SELL
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)  # MARKET / LIMIT / STOP
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    limit_price: Mapped[float | None] = mapped_column(Float)
    stop_price: Mapped[float | None] = mapped_column(Float)
    filled_price: Mapped[float | None] = mapped_column(Float)
    filled_quantity: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # PENDING / FILLED / CANCELLED / REJECTED
    is_paper: Mapped[bool] = mapped_column(Boolean, default=True)
    placed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    filled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Strategy context at time of order
    strategy_name: Mapped[str | None] = mapped_column(String(50))
    scorecard_score: Mapped[int | None] = mapped_column(Integer)
    setup_notes: Mapped[str | None] = mapped_column(Text)
    # Synced from Webull
    raw_json: Mapped[dict | None] = mapped_column(JSON)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime)


class TradeLog(Base):
    """Realized P&L per closed trade (buy→sell or sell→cover pair)."""
    __tablename__ = "trade_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # LONG / SHORT
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    gross_pnl: Mapped[float] = mapped_column(Float, nullable=False)  # (exit - entry) * qty
    fees: Mapped[float] = mapped_column(Float, default=0)
    net_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)  # % return
    hold_duration_mins: Mapped[int | None] = mapped_column(Integer)
    entry_order_id: Mapped[int | None] = mapped_column(Integer)  # FK to orders.id
    exit_order_id: Mapped[int | None] = mapped_column(Integer)
    is_paper: Mapped[bool] = mapped_column(Boolean, default=True)
    # Strategy context
    strategy_name: Mapped[str | None] = mapped_column(String(50))
    scorecard_score: Mapped[int | None] = mapped_column(Integer)
    # Post-trade reflection
    notes: Mapped[str | None] = mapped_column(Text)
    emotion_tag: Mapped[str | None] = mapped_column(String(30))  # disciplined / fomo / revenge / patient
    followed_plan: Mapped[bool | None] = mapped_column(Boolean)
    lesson_learned: Mapped[str | None] = mapped_column(Text)
    # Timestamps
    opened_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    closed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DailyBalance(Base):
    """End-of-day account balance snapshot."""
    __tablename__ = "daily_balance"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)  # YYYY-MM-DD
    total_value: Mapped[float] = mapped_column(Float, nullable=False)
    cash: Mapped[float | None] = mapped_column(Float)
    buying_power: Mapped[float | None] = mapped_column(Float)
    day_pnl: Mapped[float | None] = mapped_column(Float)
    total_pnl: Mapped[float | None] = mapped_column(Float)  # cumulative since start
    open_positions: Mapped[int | None] = mapped_column(Integer)
    is_paper: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StrategySignal(Base):
    """Captured strategy signals — what the scanners/indicators said at trade time."""
    __tablename__ = "strategy_signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    signal_type: Mapped[str] = mapped_column(String(30), nullable=False)  # scanner_hit / scorecard / indicator
    signal_name: Mapped[str] = mapped_column(String(50), nullable=False)  # morning_gapper / sma_cross / rsi_oversold
    direction: Mapped[str | None] = mapped_column(String(10))  # BULLISH / BEARISH / NEUTRAL
    strength: Mapped[int | None] = mapped_column(Integer)  # 1-10
    details: Mapped[dict | None] = mapped_column(JSON)  # full indicator values, scanner config, etc
    acted_on: Mapped[bool] = mapped_column(Boolean, default=False)  # did we trade on this signal?
    order_id: Mapped[int | None] = mapped_column(Integer)  # FK to orders.id if acted on
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
