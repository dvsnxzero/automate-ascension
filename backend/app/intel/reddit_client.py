"""
Reddit market intelligence scraper.
Uses Reddit's public JSON endpoints — no API key needed.
Appending .json to any Reddit URL returns structured data.
Rate limit: ~30 req/min unauthenticated (plenty for our use case).
"""

import re
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

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

# Shared httpx client with Reddit-friendly headers
_client = httpx.Client(
    headers={
        "User-Agent": "AutomateAscension/0.1 (market intelligence scraper)",
        "Accept": "application/json",
    },
    timeout=15.0,
    follow_redirects=True,
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


def _parse_post(post_data: dict) -> dict:
    """Parse a Reddit JSON post object into our standard format."""
    data = post_data.get("data", post_data)

    title = data.get("title", "")
    body = data.get("selftext", "") or ""
    full_text = f"{title} {body}"
    tickers = extract_tickers(full_text)

    created_utc = data.get("created_utc", 0)

    return {
        "reddit_id": data.get("id", ""),
        "subreddit": data.get("subreddit", ""),
        "title": title,
        "body": body[:5000],  # cap body size
        "author": data.get("author", "[deleted]"),
        "url": f"https://reddit.com{data.get('permalink', '')}",
        "score": data.get("score", 0),
        "num_comments": data.get("num_comments", 0),
        "upvote_ratio": data.get("upvote_ratio", 0),
        "symbols_mentioned": ",".join(tickers) if tickers else None,
        "posted_at": datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else None,
    }


def scrape_subreddit(
    subreddit_name: str,
    sort: str = "hot",
    limit: int = 25,
    time_filter: str = "day",
) -> list[dict]:
    """
    Scrape posts from a subreddit using public JSON endpoints.
    e.g., https://www.reddit.com/r/wallstreetbets/hot.json?limit=25
    """
    params = {"limit": min(limit, 100), "raw_json": 1}
    if sort == "top":
        params["t"] = time_filter

    url = f"https://www.reddit.com/r/{subreddit_name}/{sort}.json"

    try:
        resp = _client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch r/{subreddit_name}/{sort}: {e}")
        return []

    posts = data.get("data", {}).get("children", [])
    results = []
    for post in posts:
        if post.get("data", {}).get("stickied"):
            continue
        parsed = _parse_post(post)
        if parsed["reddit_id"]:
            results.append(parsed)

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
    sub_path = f"r/{subreddit}" if subreddit else "r/all"
    url = f"https://www.reddit.com/{sub_path}/search.json"

    params = {
        "q": query,
        "sort": sort,
        "t": time_filter,
        "limit": min(limit, 100),
        "restrict_sr": 1 if subreddit else 0,
        "raw_json": 1,
    }

    try:
        resp = _client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Reddit search failed for '{query}': {e}")
        return []

    posts = data.get("data", {}).get("children", [])
    results = []
    for post in posts:
        parsed = _parse_post(post)
        if parsed["reddit_id"]:
            results.append(parsed)

    return results
