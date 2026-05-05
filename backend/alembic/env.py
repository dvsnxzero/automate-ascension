"""Alembic env — single config that works for SQLite (dev) and Postgres (Railway).

The DB URL is sourced from app.database (which mirrors the runtime app's
behavior: respects DATABASE_URL, falls back to local SQLite when env=development),
so migrations and the live app always agree on the target.

target_metadata is `Base.metadata` after importing every module that defines
ORM classes — this lets `alembic revision --autogenerate` see all tables.
"""

from logging.config import fileConfig
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `app` importable when alembic is invoked from `backend/`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, engine  # noqa: E402

# Force-import every module that defines models so Base.metadata is complete.
import app.models  # noqa: F401, E402
import app.backtest.models  # noqa: F401, E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite-safe ALTERs
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
