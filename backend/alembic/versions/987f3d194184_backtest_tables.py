"""backtest tables

Adds backtest_runs and backtest_trades to support the BacktestLab feature.
Other tables in the project remain managed by Base.metadata.create_all on
app startup; future schema changes should land here as new revisions.

Revision ID: 987f3d194184
Revises:
Create Date: 2026-05-05 18:56:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "987f3d194184"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backtest_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("strategy_id", sa.String(length=50), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("interval", sa.String(length=10), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("capital", sa.Float(), nullable=False),
        sa.Column("risk_pct", sa.Float(), nullable=False),
        sa.Column("data_source", sa.String(length=20), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("equity_curve", sa.JSON(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_backtest_runs_created_at", "backtest_runs", ["created_at"])
    op.create_index("ix_backtest_runs_symbol", "backtest_runs", ["symbol"])
    op.create_index("ix_backtest_runs_strategy_id", "backtest_runs", ["strategy_id"])

    op.create_table(
        "backtest_trades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("entry_time", sa.DateTime(), nullable=False),
        sa.Column("entry_price", sa.Float(), nullable=False),
        sa.Column("exit_time", sa.DateTime(), nullable=True),
        sa.Column("exit_price", sa.Float(), nullable=True),
        sa.Column("shares", sa.Integer(), nullable=False),
        sa.Column("pnl", sa.Float(), nullable=False),
        sa.Column("pnl_pct", sa.Float(), nullable=False),
        sa.Column("exit_reason", sa.String(length=30), nullable=False),
        sa.Column("hold_bars", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["run_id"], ["backtest_runs.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_backtest_trades_run_id", "backtest_trades", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_backtest_trades_run_id", table_name="backtest_trades")
    op.drop_table("backtest_trades")
    op.drop_index("ix_backtest_runs_strategy_id", table_name="backtest_runs")
    op.drop_index("ix_backtest_runs_symbol", table_name="backtest_runs")
    op.drop_index("ix_backtest_runs_created_at", table_name="backtest_runs")
    op.drop_table("backtest_runs")
