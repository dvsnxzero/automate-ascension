"""
Trade Journal API — orders, trade log, daily balance, strategy signals.
Includes Webull order sync and manual trade logging.
"""

from datetime import datetime, date
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.models import Order, TradeLog, DailyBalance, StrategySignal

logger = logging.getLogger(__name__)
router = APIRouter()


# ═══════════════════════════════
# Pydantic schemas
# ═══════════════════════════════

class OrderCreate(BaseModel):
    symbol: str
    side: str
    order_type: str = "MARKET"
    quantity: float
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    strategy_name: Optional[str] = None
    scorecard_score: Optional[int] = None
    setup_notes: Optional[str] = None

class TradeLogCreate(BaseModel):
    symbol: str
    side: str = "LONG"
    entry_price: float
    exit_price: float
    quantity: float
    fees: float = 0
    strategy_name: Optional[str] = None
    scorecard_score: Optional[int] = None
    notes: Optional[str] = None
    emotion_tag: Optional[str] = None
    followed_plan: Optional[bool] = None
    lesson_learned: Optional[str] = None
    opened_at: str  # ISO datetime
    closed_at: str

class TradeLogUpdate(BaseModel):
    notes: Optional[str] = None
    emotion_tag: Optional[str] = None
    followed_plan: Optional[bool] = None
    lesson_learned: Optional[str] = None

class DailyBalanceCreate(BaseModel):
    date: str  # YYYY-MM-DD
    total_value: float
    cash: Optional[float] = None
    buying_power: Optional[float] = None
    day_pnl: Optional[float] = None
    total_pnl: Optional[float] = None
    open_positions: Optional[int] = None

class SignalCreate(BaseModel):
    symbol: str
    signal_type: str
    signal_name: str
    direction: Optional[str] = None
    strength: Optional[int] = None
    details: Optional[dict] = None


# ═══════════════════════════════
# Orders
# ═══════════════════════════════

@router.get("/orders")
async def list_orders(
    symbol: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List orders with optional filters."""
    q = db.query(Order).order_by(desc(Order.placed_at))
    if symbol:
        q = q.filter(Order.symbol == symbol.upper())
    if status:
        q = q.filter(Order.status == status.upper())
    total = q.count()
    orders = q.offset(offset).limit(limit).all()
    return {
        "orders": [_order_to_dict(o) for o in orders],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/orders")
async def create_order(body: OrderCreate, db: Session = Depends(get_db)):
    """Log an order manually (or use sync to pull from Webull)."""
    order = Order(
        symbol=body.symbol.upper(),
        side=body.side.upper(),
        order_type=body.order_type.upper(),
        quantity=body.quantity,
        limit_price=body.limit_price,
        stop_price=body.stop_price,
        status="PENDING",
        is_paper=True,
        strategy_name=body.strategy_name,
        scorecard_score=body.scorecard_score,
        setup_notes=body.setup_notes,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _order_to_dict(order)


@router.post("/orders/sync")
async def sync_orders(db: Session = Depends(get_db)):
    """Sync today's orders from Webull into the journal."""
    try:
        from app.webull_client import get_webull
        wb = get_webull()
        webull_orders = wb.get_day_orders()

        synced = 0
        for wo in webull_orders:
            order_id = str(wo.get("order_id", wo.get("client_order_id", "")))
            if not order_id:
                continue

            existing = db.query(Order).filter(Order.webull_order_id == order_id).first()
            if existing:
                # Update status
                existing.status = _map_webull_status(wo.get("status", ""))
                existing.filled_price = wo.get("filled_price") or wo.get("avg_price")
                existing.filled_quantity = wo.get("filled_quantity")
                existing.raw_json = wo
                existing.synced_at = datetime.utcnow()
                if existing.status == "FILLED" and not existing.filled_at:
                    existing.filled_at = datetime.utcnow()
            else:
                new_order = Order(
                    webull_order_id=order_id,
                    client_order_id=wo.get("client_order_id"),
                    symbol=wo.get("symbol", "UNKNOWN"),
                    side=wo.get("side", "BUY").upper(),
                    order_type=wo.get("order_type", "MARKET").upper(),
                    quantity=float(wo.get("quantity", 0)),
                    limit_price=wo.get("limit_price"),
                    filled_price=wo.get("filled_price") or wo.get("avg_price"),
                    filled_quantity=wo.get("filled_quantity"),
                    status=_map_webull_status(wo.get("status", "")),
                    is_paper=True,
                    raw_json=wo,
                    synced_at=datetime.utcnow(),
                )
                if new_order.status == "FILLED":
                    new_order.filled_at = datetime.utcnow()
                db.add(new_order)
                synced += 1

        db.commit()
        return {"synced": synced, "total_webull_orders": len(webull_orders)}

    except Exception as e:
        logger.error(f"Order sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# Trade Log (closed trades with P&L)
# ═══════════════════════════════

@router.get("/trades")
async def list_trades(
    symbol: Optional[str] = None,
    strategy: Optional[str] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List closed trades with P&L."""
    q = db.query(TradeLog).order_by(desc(TradeLog.closed_at))
    if symbol:
        q = q.filter(TradeLog.symbol == symbol.upper())
    if strategy:
        q = q.filter(TradeLog.strategy_name == strategy)
    total = q.count()
    trades = q.offset(offset).limit(limit).all()
    return {
        "trades": [_trade_to_dict(t) for t in trades],
        "total": total,
    }


@router.post("/trades")
async def create_trade(body: TradeLogCreate, db: Session = Depends(get_db)):
    """Log a closed trade manually."""
    gross_pnl = (body.exit_price - body.entry_price) * body.quantity
    if body.side.upper() == "SHORT":
        gross_pnl = (body.entry_price - body.exit_price) * body.quantity
    net_pnl = gross_pnl - body.fees
    pnl_pct = (net_pnl / (body.entry_price * body.quantity)) * 100

    opened = datetime.fromisoformat(body.opened_at)
    closed = datetime.fromisoformat(body.closed_at)
    hold_mins = int((closed - opened).total_seconds() / 60)

    trade = TradeLog(
        symbol=body.symbol.upper(),
        side=body.side.upper(),
        entry_price=body.entry_price,
        exit_price=body.exit_price,
        quantity=body.quantity,
        gross_pnl=round(gross_pnl, 2),
        fees=body.fees,
        net_pnl=round(net_pnl, 2),
        pnl_pct=round(pnl_pct, 2),
        hold_duration_mins=hold_mins,
        strategy_name=body.strategy_name,
        scorecard_score=body.scorecard_score,
        notes=body.notes,
        emotion_tag=body.emotion_tag,
        followed_plan=body.followed_plan,
        lesson_learned=body.lesson_learned,
        opened_at=opened,
        closed_at=closed,
        is_paper=True,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return _trade_to_dict(trade)


@router.patch("/trades/{trade_id}")
async def update_trade(trade_id: int, body: TradeLogUpdate, db: Session = Depends(get_db)):
    """Update trade reflection (notes, emotion, lesson)."""
    trade = db.query(TradeLog).filter(TradeLog.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    if body.notes is not None:
        trade.notes = body.notes
    if body.emotion_tag is not None:
        trade.emotion_tag = body.emotion_tag
    if body.followed_plan is not None:
        trade.followed_plan = body.followed_plan
    if body.lesson_learned is not None:
        trade.lesson_learned = body.lesson_learned

    db.commit()
    db.refresh(trade)
    return _trade_to_dict(trade)


# ═══════════════════════════════
# Stats / Analytics
# ═══════════════════════════════

@router.get("/stats")
async def trade_stats(
    days: int = Query(30, le=365),
    db: Session = Depends(get_db),
):
    """Aggregate trade statistics for the journal dashboard."""
    cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0) - __import__("datetime").timedelta(days=days)

    trades = db.query(TradeLog).filter(TradeLog.closed_at >= cutoff).all()

    if not trades:
        return {
            "period_days": days,
            "total_trades": 0,
            "win_rate": 0,
            "total_pnl": 0,
            "avg_pnl": 0,
            "avg_winner": 0,
            "avg_loser": 0,
            "best_trade": None,
            "worst_trade": None,
            "profit_factor": 0,
            "avg_hold_mins": 0,
            "by_strategy": {},
            "by_emotion": {},
            "plan_adherence": 0,
        }

    winners = [t for t in trades if t.net_pnl > 0]
    losers = [t for t in trades if t.net_pnl <= 0]
    total_pnl = sum(t.net_pnl for t in trades)
    gross_wins = sum(t.net_pnl for t in winners) if winners else 0
    gross_losses = abs(sum(t.net_pnl for t in losers)) if losers else 0

    # By strategy
    by_strategy = {}
    for t in trades:
        name = t.strategy_name or "Manual"
        if name not in by_strategy:
            by_strategy[name] = {"count": 0, "pnl": 0, "wins": 0}
        by_strategy[name]["count"] += 1
        by_strategy[name]["pnl"] += t.net_pnl
        if t.net_pnl > 0:
            by_strategy[name]["wins"] += 1

    # By emotion
    by_emotion = {}
    for t in trades:
        tag = t.emotion_tag or "untagged"
        if tag not in by_emotion:
            by_emotion[tag] = {"count": 0, "pnl": 0}
        by_emotion[tag]["count"] += 1
        by_emotion[tag]["pnl"] += t.net_pnl

    # Plan adherence
    planned = [t for t in trades if t.followed_plan is not None]
    adherence = (sum(1 for t in planned if t.followed_plan) / len(planned) * 100) if planned else 0

    return {
        "period_days": days,
        "total_trades": len(trades),
        "win_rate": round(len(winners) / len(trades) * 100, 1),
        "total_pnl": round(total_pnl, 2),
        "avg_pnl": round(total_pnl / len(trades), 2),
        "avg_winner": round(gross_wins / len(winners), 2) if winners else 0,
        "avg_loser": round(-gross_losses / len(losers), 2) if losers else 0,
        "best_trade": _trade_to_dict(max(trades, key=lambda t: t.net_pnl)),
        "worst_trade": _trade_to_dict(min(trades, key=lambda t: t.net_pnl)),
        "profit_factor": round(gross_wins / gross_losses, 2) if gross_losses > 0 else float("inf"),
        "avg_hold_mins": round(sum(t.hold_duration_mins or 0 for t in trades) / len(trades)),
        "by_strategy": by_strategy,
        "by_emotion": by_emotion,
        "plan_adherence": round(adherence, 1),
    }


# ═══════════════════════════════
# Daily Balance
# ═══════════════════════════════

@router.get("/balance")
async def list_balances(
    limit: int = Query(90, le=365),
    db: Session = Depends(get_db),
):
    """Get daily balance history."""
    balances = db.query(DailyBalance).order_by(desc(DailyBalance.date)).limit(limit).all()
    return {
        "balances": [_balance_to_dict(b) for b in balances],
        "count": len(balances),
    }


@router.post("/balance/snapshot")
async def take_balance_snapshot(db: Session = Depends(get_db)):
    """Take a balance snapshot right now from Webull."""
    try:
        from app.webull_client import get_webull
        wb = get_webull()
        balance = wb.get_balance()
        positions = wb.get_positions()

        today = date.today().isoformat()

        # Upsert for today
        existing = db.query(DailyBalance).filter(DailyBalance.date == today).first()
        if existing:
            existing.total_value = balance.get("total_value", 0)
            existing.cash = balance.get("cash", 0)
            existing.buying_power = balance.get("buying_power", 0)
            existing.day_pnl = balance.get("day_pnl", 0)
            existing.open_positions = len(positions) if isinstance(positions, list) else 0
            existing.raw_json = balance
        else:
            snap = DailyBalance(
                date=today,
                total_value=balance.get("total_value", 0),
                cash=balance.get("cash", 0),
                buying_power=balance.get("buying_power", 0),
                day_pnl=balance.get("day_pnl", 0),
                open_positions=len(positions) if isinstance(positions, list) else 0,
                is_paper=True,
                raw_json=balance,
            )
            db.add(snap)

        db.commit()
        return {"snapshot": "saved", "date": today, "total_value": balance.get("total_value", 0)}

    except Exception as e:
        logger.error(f"Balance snapshot failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# Strategy Signals
# ═══════════════════════════════

@router.get("/signals")
async def list_signals(
    symbol: Optional[str] = None,
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    """List captured strategy signals."""
    q = db.query(StrategySignal).order_by(desc(StrategySignal.created_at))
    if symbol:
        q = q.filter(StrategySignal.symbol == symbol.upper())
    signals = q.limit(limit).all()
    return {"signals": [_signal_to_dict(s) for s in signals]}


@router.post("/signals")
async def create_signal(body: SignalCreate, db: Session = Depends(get_db)):
    """Log a strategy signal."""
    signal = StrategySignal(
        symbol=body.symbol.upper(),
        signal_type=body.signal_type,
        signal_name=body.signal_name,
        direction=body.direction,
        strength=body.strength,
        details=body.details,
    )
    db.add(signal)
    db.commit()
    db.refresh(signal)
    return _signal_to_dict(signal)


# ═══════════════════════════════
# Serializers
# ═══════════════════════════════

def _order_to_dict(o: Order) -> dict:
    return {
        "id": o.id,
        "webull_order_id": o.webull_order_id,
        "symbol": o.symbol,
        "side": o.side,
        "order_type": o.order_type,
        "quantity": o.quantity,
        "limit_price": o.limit_price,
        "stop_price": o.stop_price,
        "filled_price": o.filled_price,
        "filled_quantity": o.filled_quantity,
        "status": o.status,
        "is_paper": o.is_paper,
        "strategy_name": o.strategy_name,
        "scorecard_score": o.scorecard_score,
        "setup_notes": o.setup_notes,
        "placed_at": o.placed_at.isoformat() if o.placed_at else None,
        "filled_at": o.filled_at.isoformat() if o.filled_at else None,
    }


def _trade_to_dict(t: TradeLog) -> dict:
    return {
        "id": t.id,
        "symbol": t.symbol,
        "side": t.side,
        "entry_price": t.entry_price,
        "exit_price": t.exit_price,
        "quantity": t.quantity,
        "gross_pnl": t.gross_pnl,
        "fees": t.fees,
        "net_pnl": t.net_pnl,
        "pnl_pct": t.pnl_pct,
        "hold_duration_mins": t.hold_duration_mins,
        "strategy_name": t.strategy_name,
        "scorecard_score": t.scorecard_score,
        "notes": t.notes,
        "emotion_tag": t.emotion_tag,
        "followed_plan": t.followed_plan,
        "lesson_learned": t.lesson_learned,
        "opened_at": t.opened_at.isoformat() if t.opened_at else None,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
    }


def _balance_to_dict(b: DailyBalance) -> dict:
    return {
        "id": b.id,
        "date": b.date,
        "total_value": b.total_value,
        "cash": b.cash,
        "buying_power": b.buying_power,
        "day_pnl": b.day_pnl,
        "total_pnl": b.total_pnl,
        "open_positions": b.open_positions,
        "is_paper": b.is_paper,
    }


def _signal_to_dict(s: StrategySignal) -> dict:
    return {
        "id": s.id,
        "symbol": s.symbol,
        "signal_type": s.signal_type,
        "signal_name": s.signal_name,
        "direction": s.direction,
        "strength": s.strength,
        "details": s.details,
        "acted_on": s.acted_on,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _map_webull_status(status: str) -> str:
    """Map Webull order status to our simplified status."""
    status = status.upper()
    if status in ("FILLED", "COMPLETED"):
        return "FILLED"
    if status in ("CANCELLED", "CANCELED", "EXPIRED"):
        return "CANCELLED"
    if status in ("REJECTED", "FAILED"):
        return "REJECTED"
    return "PENDING"
