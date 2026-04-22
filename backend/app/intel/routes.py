"""
Market Intelligence API — Reddit scraping, news aggregation,
sentiment analysis, event cataloging, trend tracking.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.models import RedditPost, NewsArticle, MarketEvent, SentimentSnapshot

logger = logging.getLogger(__name__)
router = APIRouter()


# ═══════════════════════════════
# Pydantic schemas
# ═══════════════════════════════

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str
    severity: int = 5
    symbols_affected: Optional[str] = None
    sectors_affected: Optional[str] = None
    occurred_at: str  # ISO datetime


class EventUpdate(BaseModel):
    reaction_time_mins: Optional[int] = None
    market_direction: Optional[str] = None
    spy_change_pct: Optional[float] = None
    vix_change_pct: Optional[float] = None
    top_mover_symbol: Optional[str] = None
    top_mover_pct: Optional[float] = None
    best_entry_time: Optional[str] = None
    best_exit_time: Optional[str] = None
    max_profit_pct: Optional[float] = None
    optimal_strategy: Optional[str] = None
    ai_analysis: Optional[str] = None
    pattern_tags: Optional[str] = None


# ═══════════════════════════════
# Reddit — scrape & feed
# ═══════════════════════════════

@router.post("/reddit/scrape")
async def scrape_reddit(
    subreddits: Optional[str] = None,  # comma-separated override
    sort: str = "hot",
    limit: int = Query(15, le=50),
    db: Session = Depends(get_db),
):
    """Scrape Reddit for market-relevant posts and store them."""
    try:
        from app.intel.reddit_client import scrape_subreddit, SUBREDDITS
        from app.intel.sentiment import analyze_sentiment, compute_relevance, extract_tags

        subs = subreddits.split(",") if subreddits else SUBREDDITS
        total_new = 0
        total_updated = 0

        for sub_name in subs:
            sub_name = sub_name.strip()
            try:
                posts = scrape_subreddit(sub_name, sort=sort, limit=limit)

                for p in posts:
                    # Check if already exists
                    existing = db.query(RedditPost).filter(
                        RedditPost.reddit_id == p["reddit_id"]
                    ).first()

                    # Run sentiment analysis
                    full_text = f"{p['title']} {p.get('body', '')}"
                    sentiment = analyze_sentiment(full_text)
                    relevance = compute_relevance(
                        p["score"],
                        p["num_comments"],
                        p.get("upvote_ratio", 0.5),
                        bool(p.get("symbols_mentioned")),
                    )
                    tags = extract_tags(full_text)

                    if existing:
                        # Update engagement metrics
                        existing.score = p["score"]
                        existing.num_comments = p["num_comments"]
                        existing.upvote_ratio = p.get("upvote_ratio")
                        existing.sentiment_score = sentiment["score"]
                        existing.sentiment_label = sentiment["label"]
                        existing.relevance_score = relevance
                        existing.tags = ",".join(tags) if tags else None
                        total_updated += 1
                    else:
                        new_post = RedditPost(
                            reddit_id=p["reddit_id"],
                            subreddit=p["subreddit"],
                            title=p["title"],
                            body=p.get("body"),
                            author=p.get("author"),
                            url=p.get("url"),
                            score=p["score"],
                            num_comments=p["num_comments"],
                            upvote_ratio=p.get("upvote_ratio"),
                            symbols_mentioned=p.get("symbols_mentioned"),
                            sentiment_score=sentiment["score"],
                            sentiment_label=sentiment["label"],
                            relevance_score=relevance,
                            tags=",".join(tags) if tags else None,
                            posted_at=p["posted_at"],
                        )
                        db.add(new_post)
                        total_new += 1

            except Exception as e:
                logger.error(f"Failed to scrape r/{sub_name}: {e}")

        db.commit()
        return {
            "new_posts": total_new,
            "updated_posts": total_updated,
            "subreddits_scraped": len(subs),
        }

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PRAW not installed. Run: pip install praw",
        )
    except Exception as e:
        logger.error(f"Reddit scrape failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reddit/search")
async def search_reddit_posts(
    query: str,
    subreddit: Optional[str] = None,
    time_filter: str = "day",
    limit: int = Query(25, le=100),
    db: Session = Depends(get_db),
):
    """Search Reddit for specific topics and store results."""
    try:
        from app.intel.reddit_client import search_reddit
        from app.intel.sentiment import analyze_sentiment, compute_relevance, extract_tags

        posts = search_reddit(
            query=query,
            subreddit=subreddit,
            time_filter=time_filter,
            limit=limit,
        )

        new_count = 0
        for p in posts:
            existing = db.query(RedditPost).filter(
                RedditPost.reddit_id == p["reddit_id"]
            ).first()
            if existing:
                continue

            full_text = f"{p['title']} {p.get('body', '')}"
            sentiment = analyze_sentiment(full_text)
            relevance = compute_relevance(
                p["score"], p["num_comments"],
                p.get("upvote_ratio", 0.5),
                bool(p.get("symbols_mentioned")),
            )
            tags = extract_tags(full_text)

            new_post = RedditPost(
                reddit_id=p["reddit_id"],
                subreddit=p["subreddit"],
                title=p["title"],
                body=p.get("body"),
                author=p.get("author"),
                url=p.get("url"),
                score=p["score"],
                num_comments=p["num_comments"],
                upvote_ratio=p.get("upvote_ratio"),
                symbols_mentioned=p.get("symbols_mentioned"),
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
                relevance_score=relevance,
                tags=",".join(tags) if tags else None,
                posted_at=p["posted_at"],
            )
            db.add(new_post)
            new_count += 1

        db.commit()
        return {"query": query, "new_posts": new_count, "total_found": len(posts)}

    except Exception as e:
        logger.error(f"Reddit search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reddit/feed")
async def reddit_feed(
    subreddit: Optional[str] = None,
    sentiment: Optional[str] = None,  # bullish, bearish, neutral
    symbol: Optional[str] = None,
    tag: Optional[str] = None,
    hours: int = Query(24, le=168),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Get stored Reddit posts with filters."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(RedditPost).filter(RedditPost.posted_at >= cutoff)

    if subreddit:
        q = q.filter(RedditPost.subreddit == subreddit)
    if sentiment:
        q = q.filter(RedditPost.sentiment_label == sentiment)
    if symbol:
        q = q.filter(RedditPost.symbols_mentioned.contains(symbol.upper()))
    if tag:
        q = q.filter(RedditPost.tags.contains(tag))

    posts = q.order_by(desc(RedditPost.score)).limit(limit).all()
    return {
        "posts": [_reddit_to_dict(p) for p in posts],
        "count": len(posts),
    }


# ═══════════════════════════════
# News — Finnhub
# ═══════════════════════════════

@router.post("/news/fetch")
async def fetch_news(
    category: str = "general",
    symbol: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Fetch latest news from Finnhub and store."""
    try:
        from app.intel.news_client import get_market_news, get_company_news
        from app.intel.sentiment import analyze_sentiment, extract_tags

        if symbol:
            articles = get_company_news(symbol)
        else:
            articles = get_market_news(category)

        new_count = 0
        for a in articles:
            source_id = a.get("source_id")
            if source_id:
                existing = db.query(NewsArticle).filter(
                    NewsArticle.source_id == source_id
                ).first()
                if existing:
                    continue

            full_text = f"{a['headline']} {a.get('summary', '')}"
            sentiment = analyze_sentiment(full_text)
            tags = extract_tags(full_text)

            article = NewsArticle(
                source_id=source_id,
                source=a.get("source", "finnhub"),
                headline=a["headline"],
                summary=a.get("summary"),
                url=a.get("url"),
                image_url=a.get("image_url"),
                symbols=a.get("symbols") or symbol,
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
                category=a.get("category", category),
                tags=",".join(tags) if tags else None,
                published_at=a["published_at"],
            )
            db.add(article)
            new_count += 1

        db.commit()
        return {"new_articles": new_count, "total_fetched": len(articles)}

    except Exception as e:
        logger.error(f"News fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/news/feed")
async def news_feed(
    symbol: Optional[str] = None,
    category: Optional[str] = None,
    sentiment: Optional[str] = None,
    hours: int = Query(24, le=168),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Get stored news articles with filters."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(NewsArticle).filter(NewsArticle.published_at >= cutoff)

    if symbol:
        q = q.filter(NewsArticle.symbols.contains(symbol.upper()))
    if category:
        q = q.filter(NewsArticle.category == category)
    if sentiment:
        q = q.filter(NewsArticle.sentiment_label == sentiment)

    articles = q.order_by(desc(NewsArticle.published_at)).limit(limit).all()
    return {
        "articles": [_news_to_dict(a) for a in articles],
        "count": len(articles),
    }


@router.get("/news/sentiment/{symbol}")
async def symbol_sentiment(symbol: str):
    """Get live sentiment for a symbol from Finnhub."""
    try:
        from app.intel.news_client import get_news_sentiment
        return get_news_sentiment(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════
# Market Events
# ═══════════════════════════════

@router.get("/events")
async def list_events(
    event_type: Optional[str] = None,
    days: int = Query(30, le=365),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """List cataloged market events."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = db.query(MarketEvent).filter(MarketEvent.occurred_at >= cutoff)

    if event_type:
        q = q.filter(MarketEvent.event_type == event_type)

    events = q.order_by(desc(MarketEvent.occurred_at)).limit(limit).all()
    return {
        "events": [_event_to_dict(e) for e in events],
        "count": len(events),
    }


@router.post("/events")
async def create_event(body: EventCreate, db: Session = Depends(get_db)):
    """Catalog a market-moving event."""
    event = MarketEvent(
        title=body.title,
        description=body.description,
        event_type=body.event_type,
        severity=body.severity,
        symbols_affected=body.symbols_affected,
        sectors_affected=body.sectors_affected,
        occurred_at=datetime.fromisoformat(body.occurred_at),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _event_to_dict(event)


@router.patch("/events/{event_id}")
async def update_event(event_id: int, body: EventUpdate, db: Session = Depends(get_db)):
    """Update event with market reaction data and analysis."""
    event = db.query(MarketEvent).filter(MarketEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return _event_to_dict(event)


# ═══════════════════════════════
# Sentiment Snapshots & Dashboard
# ═══════════════════════════════

@router.post("/snapshot")
async def take_sentiment_snapshot(
    bucket: str = "hourly",
    db: Session = Depends(get_db),
):
    """Take a point-in-time sentiment snapshot from stored data."""
    now = datetime.utcnow()
    lookback = timedelta(hours=1) if bucket == "hourly" else timedelta(days=1)
    cutoff = now - lookback

    # Aggregate Reddit sentiment
    reddit_posts = db.query(RedditPost).filter(RedditPost.scraped_at >= cutoff).all()
    reddit_scores = [p.sentiment_score for p in reddit_posts if p.sentiment_score is not None]
    reddit_avg = sum(reddit_scores) / len(reddit_scores) if reddit_scores else 0

    # Aggregate news sentiment
    news_articles = db.query(NewsArticle).filter(NewsArticle.scraped_at >= cutoff).all()
    news_scores = [a.sentiment_score for a in news_articles if a.sentiment_score is not None]
    news_avg = sum(news_scores) / len(news_scores) if news_scores else 0

    # Combined (weighted — news slightly more reliable)
    if reddit_scores and news_scores:
        combined = (reddit_avg * 0.4 + news_avg * 0.6)
    elif reddit_scores:
        combined = reddit_avg
    elif news_scores:
        combined = news_avg
    else:
        combined = 0

    # Top symbols mentioned
    symbol_counts = {}
    for p in reddit_posts:
        if p.symbols_mentioned:
            for sym in p.symbols_mentioned.split(","):
                sym = sym.strip()
                if sym:
                    if sym not in symbol_counts:
                        symbol_counts[sym] = {"count": 0, "sentiment_sum": 0}
                    symbol_counts[sym]["count"] += 1
                    symbol_counts[sym]["sentiment_sum"] += (p.sentiment_score or 0)

    top_symbols = sorted(
        [
            {
                "symbol": s,
                "count": d["count"],
                "sentiment": round(d["sentiment_sum"] / d["count"], 3) if d["count"] > 0 else 0,
            }
            for s, d in symbol_counts.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # Top topics
    topic_counts = {}
    for p in reddit_posts:
        if p.tags:
            for tag in p.tags.split(","):
                tag = tag.strip()
                if tag:
                    topic_counts[tag] = topic_counts.get(tag, 0) + 1

    top_topics = sorted(
        [{"topic": t, "count": c} for t, c in topic_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    snapshot = SentimentSnapshot(
        timestamp=now,
        bucket=bucket,
        reddit_sentiment=round(reddit_avg, 3),
        news_sentiment=round(news_avg, 3),
        combined_sentiment=round(combined, 3),
        reddit_post_count=len(reddit_posts),
        news_article_count=len(news_articles),
        top_symbols=json.dumps(top_symbols),
        top_topics=json.dumps(top_topics),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    return {
        "snapshot_id": snapshot.id,
        "timestamp": now.isoformat(),
        "reddit_sentiment": round(reddit_avg, 3),
        "news_sentiment": round(news_avg, 3),
        "combined_sentiment": round(combined, 3),
        "reddit_posts": len(reddit_posts),
        "news_articles": len(news_articles),
        "top_symbols": top_symbols,
        "top_topics": top_topics,
    }


@router.get("/dashboard")
async def intel_dashboard(
    hours: int = Query(24, le=168),
    db: Session = Depends(get_db),
):
    """
    Full intelligence dashboard data — sentiment, top mentions,
    recent events, latest posts/articles.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    # Latest sentiment snapshots
    snapshots = (
        db.query(SentimentSnapshot)
        .filter(SentimentSnapshot.timestamp >= cutoff)
        .order_by(desc(SentimentSnapshot.timestamp))
        .limit(24)
        .all()
    )

    # Top Reddit posts by relevance
    top_reddit = (
        db.query(RedditPost)
        .filter(RedditPost.posted_at >= cutoff)
        .order_by(desc(RedditPost.relevance_score))
        .limit(10)
        .all()
    )

    # Latest news
    latest_news = (
        db.query(NewsArticle)
        .filter(NewsArticle.published_at >= cutoff)
        .order_by(desc(NewsArticle.published_at))
        .limit(10)
        .all()
    )

    # Recent events
    recent_events = (
        db.query(MarketEvent)
        .order_by(desc(MarketEvent.occurred_at))
        .limit(5)
        .all()
    )

    # Aggregate sentiment from current data
    reddit_posts = db.query(RedditPost).filter(RedditPost.posted_at >= cutoff).all()
    bullish = sum(1 for p in reddit_posts if p.sentiment_label == "bullish")
    bearish = sum(1 for p in reddit_posts if p.sentiment_label == "bearish")
    neutral = sum(1 for p in reddit_posts if p.sentiment_label == "neutral")
    total = len(reddit_posts)

    return {
        "period_hours": hours,
        "sentiment_timeline": [
            {
                "timestamp": s.timestamp.isoformat(),
                "reddit": s.reddit_sentiment,
                "news": s.news_sentiment,
                "combined": s.combined_sentiment,
            }
            for s in reversed(snapshots)
        ],
        "sentiment_distribution": {
            "bullish": bullish,
            "bearish": bearish,
            "neutral": neutral,
            "total": total,
        },
        "top_reddit": [_reddit_to_dict(p) for p in top_reddit],
        "latest_news": [_news_to_dict(a) for a in latest_news],
        "recent_events": [_event_to_dict(e) for e in recent_events],
    }


# ═══════════════════════════════
# Serializers
# ═══════════════════════════════

def _reddit_to_dict(p: RedditPost) -> dict:
    return {
        "id": p.id,
        "reddit_id": p.reddit_id,
        "subreddit": p.subreddit,
        "title": p.title,
        "body": (p.body or "")[:300],  # truncate for feed
        "author": p.author,
        "url": p.url,
        "score": p.score,
        "num_comments": p.num_comments,
        "symbols_mentioned": p.symbols_mentioned,
        "sentiment_score": p.sentiment_score,
        "sentiment_label": p.sentiment_label,
        "relevance_score": p.relevance_score,
        "tags": p.tags,
        "posted_at": p.posted_at.isoformat() if p.posted_at else None,
    }


def _news_to_dict(a: NewsArticle) -> dict:
    return {
        "id": a.id,
        "source": a.source,
        "headline": a.headline,
        "summary": (a.summary or "")[:300],
        "url": a.url,
        "image_url": a.image_url,
        "symbols": a.symbols,
        "sentiment_score": a.sentiment_score,
        "sentiment_label": a.sentiment_label,
        "category": a.category,
        "tags": a.tags,
        "published_at": a.published_at.isoformat() if a.published_at else None,
    }


def _event_to_dict(e: MarketEvent) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "event_type": e.event_type,
        "severity": e.severity,
        "symbols_affected": e.symbols_affected,
        "sectors_affected": e.sectors_affected,
        "reaction_time_mins": e.reaction_time_mins,
        "market_direction": e.market_direction,
        "spy_change_pct": e.spy_change_pct,
        "top_mover_symbol": e.top_mover_symbol,
        "top_mover_pct": e.top_mover_pct,
        "max_profit_pct": e.max_profit_pct,
        "optimal_strategy": e.optimal_strategy,
        "ai_analysis": e.ai_analysis,
        "pattern_tags": e.pattern_tags,
        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
    }
