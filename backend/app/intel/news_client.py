"""
Financial news client — Finnhub (free tier: 60 calls/min).
Pulls market news, company news, and sentiment scores.
"""

import logging
from datetime import datetime, date, timezone
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

BASE_URL = "https://finnhub.io/api/v1"


def _get_client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        base_url=BASE_URL,
        params={"token": settings.finnhub_api_key},
        timeout=15.0,
    )


def get_market_news(category: str = "general", min_id: int = 0) -> list[dict]:
    """
    Get latest market news.
    Categories: general, forex, crypto, merger
    """
    with _get_client() as client:
        resp = client.get("/news", params={"category": category, "minId": min_id})
        resp.raise_for_status()
        articles = resp.json()

    results = []
    for a in articles:
        results.append({
            "source_id": str(a.get("id", "")),
            "source": a.get("source", "finnhub"),
            "headline": a.get("headline", ""),
            "summary": a.get("summary", ""),
            "url": a.get("url", ""),
            "image_url": a.get("image", ""),
            "category": category,
            "published_at": datetime.fromtimestamp(
                a.get("datetime", 0), tz=timezone.utc
            ),
        })

    return results


def get_company_news(
    symbol: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> list[dict]:
    """Get news for a specific company."""
    if not from_date:
        from_date = date.today().isoformat()
    if not to_date:
        to_date = date.today().isoformat()

    with _get_client() as client:
        resp = client.get(
            "/company-news",
            params={"symbol": symbol.upper(), "from": from_date, "to": to_date},
        )
        resp.raise_for_status()
        articles = resp.json()

    results = []
    for a in articles:
        results.append({
            "source_id": str(a.get("id", "")),
            "source": a.get("source", "finnhub"),
            "headline": a.get("headline", ""),
            "summary": a.get("summary", ""),
            "url": a.get("url", ""),
            "image_url": a.get("image", ""),
            "symbols": symbol.upper(),
            "category": a.get("category", "company"),
            "published_at": datetime.fromtimestamp(
                a.get("datetime", 0), tz=timezone.utc
            ),
        })

    return results


def get_news_sentiment(symbol: str) -> dict:
    """
    Get news sentiment for a symbol from Finnhub.
    Returns aggregate sentiment + individual article sentiments.
    """
    with _get_client() as client:
        resp = client.get("/news-sentiment", params={"symbol": symbol.upper()})
        resp.raise_for_status()
        data = resp.json()

    # Finnhub returns: {buzz: {...}, sentiment: {bullishPercent, bearishPercent}, ...}
    sentiment = data.get("sentiment", {})
    buzz = data.get("buzz", {})

    return {
        "symbol": symbol.upper(),
        "bullish_pct": sentiment.get("bullishPercent", 0),
        "bearish_pct": sentiment.get("bearishPercent", 0),
        "articles_in_last_week": buzz.get("articlesInLastWeek", 0),
        "buzz_score": buzz.get("buzz", 0),
        "weekly_average": buzz.get("weeklyAverage", 0),
        "company_news_score": data.get("companyNewsScore", 0),
        "sector_average_bullish": data.get("sectorAverageBullishPercent", 0),
        "sector_average_news_score": data.get("sectorAverageNewsScore", 0),
        # Convert to our -1 to 1 scale
        "sentiment_score": round(
            (sentiment.get("bullishPercent", 0.5) - 0.5) * 2, 3
        ),
    }


def get_earnings_calendar(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> list[dict]:
    """Get upcoming earnings dates."""
    if not from_date:
        from_date = date.today().isoformat()
    if not to_date:
        to_date = date.today().isoformat()

    with _get_client() as client:
        resp = client.get(
            "/calendar/earnings",
            params={"from": from_date, "to": to_date},
        )
        resp.raise_for_status()
        data = resp.json()

    return data.get("earningsCalendar", [])
