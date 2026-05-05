"""SQLAlchemy models for the BacktestLab feature.

A `BacktestRun` is a single saved simulation; its `BacktestTrade` rows are
the entries/exits the engine produced. The full equity curve is stored on
the run row as JSON because curves are small (≤ a few thousand points).
"""

from datetime import datetime, date
from sqlalchemy import String, Float, Boolean, Text, DateTime, JSON, Integer, ForeignKey, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    label: Mapped[str | None] = mapped_column(String(200))
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    strategy_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    params: Mapped[dict] = mapped_column(JSON, nullable=False)
    interval: Mapped[str] = mapped_column(String(10), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capital: Mapped[float] = mapped_column(Float, nullable=False)
    risk_pct: Mapped[float] = mapped_column(Float, nullable=False)
    data_source: Mapped[str] = mapped_column(String(20), nullable=False)  # webull | yahoo
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    equity_curve: Mapped[list] = mapped_column(JSON, nullable=False)  # [[ts, value], ...]
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    trades: Mapped[list["BacktestTrade"]] = relationship(
        "BacktestTrade",
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("backtest_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime)
    exit_price: Mapped[float | None] = mapped_column(Float)
    shares: Mapped[int] = mapped_column(Integer, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)
    # stop | target | time_stop | signal | open_at_end | skipped_too_risky
    exit_reason: Mapped[str] = mapped_column(String(30), nullable=False)
    hold_bars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    run: Mapped["BacktestRun"] = relationship("BacktestRun", back_populates="trades")
