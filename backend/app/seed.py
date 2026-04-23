"""
Startup seed — populates empty tables so the dashboard isn't a blank slate.

Called from the FastAPI lifespan hook AFTER create_all().
Scraping runs in a background thread so it doesn't block startup.
"""

import logging
import threading
from datetime import datetime

from app.database import SessionLocal
from app.models import Watchlist, RedditPost, NewsArticle, DailyBalance

logger = logging.getLogger(__name__)

# ── Default watchlist ──────────────────────────────────────────
DEFAULT_WATCHLIST = [
    {"symbol": "AAPL",  "strategy": "value_dip",   "notes": "Core holding — mega cap tech"},
    {"symbol": "TSLA",  "strategy": "swing",        "notes": "High volatility momentum play"},
    {"symbol": "NVDA",  "strategy": "value_dip",   "notes": "AI infrastructure leader"},
    {"symbol": "MSFT",  "strategy": "value_dip",   "notes": "Enterprise cloud + AI"},
    {"symbol": "GOOGL", "strategy": "value_dip",   "notes": "Search + cloud + AI"},
    {"symbol": "AMZN",  "strategy": "value_dip",   "notes": "E-commerce + AWS"},
    {"symbol": "META",  "strategy": "swing",        "notes": "Social + VR/AR bet"},
    {"symbol": "NFLX",  "strategy": "swing",        "notes": "Streaming leader"},
    {"symbol": "SPY",   "strategy": "scanner_hit",  "notes": "S&P 500 benchmark ETF"},
    {"symbol": "QQQ",   "strategy": "scanner_hit",  "notes": "Nasdaq 100 ETF"},
    {"symbol": "AMD",   "strategy": "swing",        "notes": "CPU/GPU competitor to NVDA"},
    {"symbol": "PLTR",  "strategy": "swing",        "notes": "Gov + enterprise AI/data"},
]


def seed_watchlist(db) -> int:
    """Insert default watchlist items if table is empty. Returns count added."""
    existing = db.query(Watchlist).count()
    if existing > 0:
        logger.info(f"Watchlist already has {existing} items — skipping seed.")
        return 0

    count = 0
    for item in DEFAULT_WATCHLIST:
        db.add(Watchlist(
            symbol=item["symbol"],
            strategy=item.get("strategy"),
            notes=item.get("notes"),
            added_at=datetime.utcnow(),
        ))
        count += 1

    db.commit()
    logger.info(f"Seeded watchlist with {count} tickers.")
    return count


# ── Background scraping ───────────────────────────────────────

def _scrape_news(db):
    """Fetch general market news from Finnhub."""
    try:
        from app.intel.news_client import get_market_news
        from app.intel.sentiment import analyze_sentiment, extract_tags

        articles = get_market_news("general")
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
                symbols=a.get("symbols"),
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
                category=a.get("category", "general"),
                tags=",".join(tags) if tags else None,
                published_at=a["published_at"],
            )
            db.add(article)
            new_count += 1

        db.commit()
        logger.info(f"Seed: fetched {new_count} news articles.")
        return new_count
    except Exception as e:
        logger.error(f"Seed news fetch failed: {e}")
        db.rollback()
        return 0


def _scrape_reddit(db):
    """Scrape default subreddits for market-relevant posts."""
    try:
        from app.intel.reddit_client import scrape_subreddit, SUBREDDITS
        from app.intel.sentiment import analyze_sentiment, compute_relevance, extract_tags

        total_new = 0
        for sub_name in SUBREDDITS:
            try:
                posts = scrape_subreddit(sub_name, sort="hot", limit=15)
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

                    db.add(RedditPost(
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
                    ))
                    total_new += 1
            except Exception as e:
                logger.error(f"Seed: failed to scrape r/{sub_name}: {e}")

        db.commit()
        logger.info(f"Seed: scraped {total_new} Reddit posts.")
        return total_new
    except Exception as e:
        logger.error(f"Seed Reddit scrape failed: {e}")
        db.rollback()
        return 0


def _scrape_balance(db):
    """Take an initial balance snapshot from Webull if available."""
    try:
        from app.webull_client import get_webull
        from app.config import get_settings

        settings = get_settings()
        if not settings.webull_app_key or not settings.webull_app_secret:
            logger.info("Seed: no Webull credentials — skipping balance snapshot.")
            return

        wb = get_webull()
        account = wb.get_account()
        if not account:
            logger.info("Seed: could not fetch Webull account — skipping balance.")
            return

        today = datetime.utcnow().strftime("%Y-%m-%d")
        existing = db.query(DailyBalance).filter(DailyBalance.date == today).first()
        if existing:
            logger.info("Seed: balance snapshot already exists for today.")
            return

        total_value = float(account.get("totalMarketValue", 0) or 0)
        cash = float(account.get("usableCash", 0) or 0)

        db.add(DailyBalance(
            date=today,
            total_value=total_value,
            cash=cash,
            buying_power=float(account.get("dayBuyingPower", 0) or 0),
            day_pnl=float(account.get("dayProfitLoss", 0) or 0),
            is_paper=account.get("isPaper", True),
            raw_json=account,
        ))
        db.commit()
        logger.info(f"Seed: balance snapshot — ${total_value:,.2f} total, ${cash:,.2f} cash.")
    except Exception as e:
        logger.error(f"Seed balance snapshot failed: {e}")
        db.rollback()


def _background_seed():
    """Run all scraping seeds in a background thread with its own DB session."""
    db = SessionLocal()
    try:
        # News first (fast — single API call to Finnhub)
        news_empty = db.query(NewsArticle).count() == 0
        if news_empty:
            _scrape_news(db)
        else:
            logger.info("Seed: news_articles already has data — skipping.")

        # Reddit (slower — hits multiple subreddits)
        reddit_empty = db.query(RedditPost).count() == 0
        if reddit_empty:
            _scrape_reddit(db)
        else:
            logger.info("Seed: reddit_posts already has data — skipping.")

        # Balance snapshot
        balance_empty = db.query(DailyBalance).count() == 0
        if balance_empty:
            _scrape_balance(db)
        else:
            logger.info("Seed: daily_balance already has data — skipping.")

        logger.info("Seed: background seeding complete.")
    except Exception as e:
        logger.error(f"Background seed error: {e}")
    finally:
        db.close()


# ── Public entry point ────────────────────────────────────────

def run_startup_seed():
    """
    Called from the FastAPI lifespan hook.
    - Watchlist seeding runs synchronously (fast, just inserts).
    - Scraping runs in a background thread (network I/O).
    """
    db = SessionLocal()
    try:
        seed_watchlist(db)
    finally:
        db.close()

    # Kick off scraping in background so the server starts immediately
    thread = threading.Thread(target=_background_seed, daemon=True, name="startup-seed")
    thread.start()
    logger.info("Seed: background scraping thread started.")
