"""
Reddit market intelligence scraper.
Uses PRAW (free tier: 100 req/min) to pull posts from trading subreddits.
"""

import re
import logging
from datetime import datetime, timezone
from typing import Optional

import praw
from praw.models import Submission

from app.config import get_settings

logger = logging.getLogger(__name__)

# Subreddits to monitor — ordered by signal quality
SUBREDDITS = [
    "wallstreetbets",
    "stocks",
    "investing",
    "stockmarket",
    "options",
    "daytrading",
    "pennystocks",
    "politics",       # Trump/policy announcements
    "news",           # breaking news
    "economics",
]

# Common ticker pattern: $AAPL or standalone 1-5 uppercase letters
TICKER_RE = re.compile(r"\$([A-Z]{1,5})\b|(?<!\w)([A-Z]{2,5})(?!\w)")

# Known non-ticker uppercase words to filter out
NOISE_WORDS = {
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
    "WAS", "ONE", "OUR", "OUT", "HAS", "HIS", "HOW", "MAN", "NEW", "NOW",
    "OLD", "SEE", "WAY", "WHO", "DID", "GET", "HIM", "LET", "SAY", "SHE",
    "TOO", "USE", "DAD", "MOM", "ITS", "JUST", "LIKE", "THIS", "THAT",
    "WITH", "HAVE", "FROM", "THEY", "BEEN", "SOME", "WHEN", "WHAT", "YOUR",
    "WILL", "MORE", "THAN", "THEM", "WOULD", "MAKE", "EACH", "MUCH",
    "THEN", "ALSO", "BACK", "INTO", "YEAR", "OVER", "SUCH", "ONLY",
    "VERY", "WELL", "EVEN", "MOST", "MANY", "ABOUT", "AFTER", "THOSE",
    "TRUMP", "BIDEN", "MUSK", "ELON", "SEC", "FED", "IPO", "CEO",
    "NFT", "ATH", "ATL", "EOD", "IMO", "TLDR", "YOLO", "HODL", "FOMO",
    "EDIT", "UPDATE", "LINK", "POST", "SELL", "BUY", "HOLD", "LONG",
    "SHORT", "CALL", "PUT", "DD", "PSA", "USA", "GDP", "CPI", "ETF",
    "WSB", "LMAO", "LMFAO", "WTF", "OMG", "PUMP", "DUMP",
}


def get_reddit() -> praw.Reddit:
    """Create authenticated Reddit client."""
    settings = get_settings()
    return praw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent="AutomateAscension/0.1 (market intelligence bot)",
    )


def extract_tickers(text: str) -> list[str]:
    """Extract likely stock tickers from text."""
    matches = TICKER_RE.findall(text)
    tickers = set()
    for dollar_match, bare_match in matches:
        t = dollar_match or bare_match
        if t and t not in NOISE_WORDS and len(t) >= 2:
            tickers.add(t)
    return sorted(tickers)


def scrape_subreddit(
    subreddit_name: str,
    sort: str = "hot",
    limit: int = 25,
    time_filter: str = "day",
) -> list[dict]:
    """
    Scrape posts from a subreddit.
    Returns list of dicts ready for DB insertion.
    """
    reddit = get_reddit()
    sub = reddit.subreddit(subreddit_name)

    if sort == "hot":
        posts = sub.hot(limit=limit)
    elif sort == "new":
        posts = sub.new(limit=limit)
    elif sort == "top":
        posts = sub.top(time_filter=time_filter, limit=limit)
    elif sort == "rising":
        posts = sub.rising(limit=limit)
    else:
        posts = sub.hot(limit=limit)

    results = []
    for post in posts:
        if post.stickied:
            continue

        full_text = f"{post.title} {post.selftext or ''}"
        tickers = extract_tickers(full_text)

        results.append({
            "reddit_id": post.id,
            "subreddit": subreddit_name,
            "title": post.title,
            "body": (post.selftext or "")[:5000],  # cap body size
            "author": str(post.author) if post.author else "[deleted]",
            "url": f"https://reddit.com{post.permalink}",
            "score": post.score,
            "num_comments": post.num_comments,
            "upvote_ratio": post.upvote_ratio,
            "symbols_mentioned": ",".join(tickers) if tickers else None,
            "posted_at": datetime.fromtimestamp(post.created_utc, tz=timezone.utc),
        })

    return results


def scrape_all_subreddits(
    sort: str = "hot",
    limit_per_sub: int = 15,
) -> list[dict]:
    """Scrape all monitored subreddits."""
    all_posts = []
    for sub_name in SUBREDDITS:
        try:
            posts = scrape_subreddit(sub_name, sort=sort, limit=limit_per_sub)
            all_posts.extend(posts)
            logger.info(f"Scraped {len(posts)} posts from r/{sub_name}")
        except Exception as e:
            logger.error(f"Failed to scrape r/{sub_name}: {e}")
    return all_posts


def search_reddit(
    query: str,
    subreddit: Optional[str] = None,
    sort: str = "relevance",
    time_filter: str = "day",
    limit: int = 25,
) -> list[dict]:
    """Search Reddit for specific topics (e.g., 'trump tariff')."""
    reddit = get_reddit()

    if subreddit:
        sub = reddit.subreddit(subreddit)
    else:
        sub = reddit.subreddit("all")

    results = []
    for post in sub.search(query, sort=sort, time_filter=time_filter, limit=limit):
        full_text = f"{post.title} {post.selftext or ''}"
        tickers = extract_tickers(full_text)

        results.append({
            "reddit_id": post.id,
            "subreddit": str(post.subreddit),
            "title": post.title,
            "body": (post.selftext or "")[:5000],
            "author": str(post.author) if post.author else "[deleted]",
            "url": f"https://reddit.com{post.permalink}",
            "score": post.score,
            "num_comments": post.num_comments,
            "upvote_ratio": post.upvote_ratio,
            "symbols_mentioned": ",".join(tickers) if tickers else None,
            "posted_at": datetime.fromtimestamp(post.created_utc, tz=timezone.utc),
        })

    return results
