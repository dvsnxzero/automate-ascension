# Deploy

## Railway

`railway.json` declares the build (Dockerfile) and deploy config. Migrations
run automatically on every deploy via `preDeployCommand`:

```
alembic upgrade head
```

This runs in the new container before traffic is routed to it. If the migration
fails the deploy aborts and traffic stays on the previous instance.

### One-time bootstrap (only the first deploy after Alembic was introduced)

The Postgres database on Railway already contains every table the app uses,
because earlier versions of the app created them at startup with
`Base.metadata.create_all`. The first Alembic migration (`987f3d194184 — backtest tables`)
adds `backtest_runs` + `backtest_trades`, which **don't yet exist** on Railway,
so the first deploy needs the migration to actually run.

**However**, future migrations may touch tables that DO already exist. Once
those land, Alembic will try to create them again unless we tell it the
current migration head represents the live schema. After the first successful
deploy with `preDeployCommand` enabled, run **once** against the Railway DB:

```
railway run alembic stamp 987f3d194184
```

(Or open a Railway shell on the backend service and run `alembic stamp 987f3d194184` directly.)

This writes `987f3d194184` into the `alembic_version` table without re-running
the migration, marking the schema as "up to date" so subsequent migrations
diff cleanly. Verified before introducing the stamp: a fresh `alembic upgrade head`
produces the same backtest table schema as `Base.metadata` — no drift.

### Going forward

Every schema change for new code lands as a new Alembic revision:

```
cd backend
alembic revision --autogenerate -m "what changed"
alembic upgrade head            # apply locally
git add alembic/versions/...    # commit
```

Railway will pick up the new revision on next deploy and apply it automatically.
