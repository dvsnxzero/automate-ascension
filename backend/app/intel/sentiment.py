"""
Lightweight sentiment analysis for market text.
Uses keyword-based scoring (free, fast, no API needed).
Can be upgraded to OpenAI/Claude API later for deeper analysis.
"""

import re
from typing import Optional

# ── Bullish / Bearish keyword dictionaries ──

BULLISH_WORDS = {
    # Strong bullish
    "moon": 2, "mooning": 2, "rocket": 2, "squeeze": 2, "breakout": 2,
    "tendies": 2, "lambo": 2, "diamond hands": 2, "to the moon": 2,
    # Moderate bullish
    "bull": 1.5, "bullish": 1.5, "calls": 1.5, "long": 1.5, "buy": 1.5,
    "buying": 1.5, "rally": 1.5, "surge": 1.5, "soar": 1.5, "pump": 1.5,
    "rip": 1.5, "green": 1.5, "upside": 1.5,
    # Mild bullish
    "up": 0.5, "gain": 0.5, "positive": 0.5, "growth": 0.5,
    "recovery": 0.5, "rebound": 0.5, "support": 0.5, "strong": 0.5,
    "beat": 0.5, "earnings beat": 1, "upgrade": 1, "undervalued": 1,
    "accumulate": 1, "opportunity": 0.5, "oversold": 1,
}

BEARISH_WORDS = {
    # Strong bearish
    "crash": -2, "crashing": -2, "collapse": -2, "puts": -1.5,
    "short": -1.5, "sell": -1.5, "dump": -2, "tank": -2,
    "rug pull": -2, "scam": -2, "fraud": -2, "bankrupt": -2,
    # Moderate bearish
    "bear": -1.5, "bearish": -1.5, "down": -1, "drop": -1.5,
    "falling": -1.5, "plunge": -1.5, "decline": -1, "red": -1,
    "loss": -1, "losing": -1, "downside": -1.5, "resistance": -0.5,
    # Mild bearish
    "weak": -0.5, "miss": -0.5, "earnings miss": -1, "downgrade": -1,
    "overvalued": -1, "overbought": -1, "bubble": -1, "risk": -0.5,
    "tariff": -0.5, "recession": -1.5, "inflation": -0.5,
    "war": -1, "sanctions": -1,
}

# Political/event keywords that signal market-moving content
EVENT_KEYWORDS = {
    "trump": "political",
    "biden": "political",
    "tariff": "tariff",
    "tariffs": "tariff",
    "trade war": "tariff",
    "executive order": "policy",
    "fed": "fed",
    "federal reserve": "fed",
    "interest rate": "fed",
    "rate cut": "fed",
    "rate hike": "fed",
    "powell": "fed",
    "earnings": "earnings",
    "ipo": "ipo",
    "sec": "regulatory",
    "investigation": "regulatory",
    "ban": "regulatory",
    "china": "geopolitical",
    "russia": "geopolitical",
    "ukraine": "geopolitical",
    "war": "geopolitical",
    "crypto": "crypto",
    "bitcoin": "crypto",
    "ethereum": "crypto",
}


def analyze_sentiment(text: str) -> dict:
    """
    Analyze market sentiment from text.
    Returns score (-1 to 1), label, confidence, and detected topics.
    """
    if not text:
        return {
            "score": 0,
            "label": "neutral",
            "confidence": 0,
            "topics": [],
        }

    text_lower = text.lower()
    words = text_lower.split()

    # Score calculation
    total_score = 0.0
    matches = 0

    for phrase, weight in BULLISH_WORDS.items():
        if phrase in text_lower:
            total_score += weight
            matches += 1

    for phrase, weight in BEARISH_WORDS.items():
        if phrase in text_lower:
            total_score += weight  # already negative
            matches += 1

    # Normalize to -1 to 1
    if matches > 0:
        raw_score = total_score / (matches * 1.5)  # normalize
        score = max(-1.0, min(1.0, raw_score))
    else:
        score = 0.0

    # Label
    if score > 0.2:
        label = "bullish"
    elif score < -0.2:
        label = "bearish"
    else:
        label = "neutral"

    # Confidence based on number of signal words found
    confidence = min(1.0, matches / 5)

    # Detect topics/events
    topics = set()
    for keyword, topic in EVENT_KEYWORDS.items():
        if keyword in text_lower:
            topics.add(topic)

    return {
        "score": round(score, 3),
        "label": label,
        "confidence": round(confidence, 3),
        "topics": sorted(topics),
    }


def compute_relevance(
    score: int,
    num_comments: int,
    upvote_ratio: float,
    has_tickers: bool,
) -> float:
    """
    Compute how market-relevant a Reddit post is (0 to 1).
    Based on engagement, ticker mentions, and vote ratio.
    """
    relevance = 0.0

    # Engagement scoring
    if score > 1000:
        relevance += 0.3
    elif score > 100:
        relevance += 0.2
    elif score > 10:
        relevance += 0.1

    if num_comments > 500:
        relevance += 0.2
    elif num_comments > 50:
        relevance += 0.15
    elif num_comments > 10:
        relevance += 0.1

    # Vote ratio (controversial = potentially important)
    if upvote_ratio and upvote_ratio < 0.6:
        relevance += 0.1  # controversial

    # Ticker mentions
    if has_tickers:
        relevance += 0.3

    return min(1.0, round(relevance, 3))


def extract_tags(text: str) -> list[str]:
    """Extract topic tags from text."""
    text_lower = text.lower()
    tags = set()

    for keyword, topic in EVENT_KEYWORDS.items():
        if keyword in text_lower:
            tags.add(topic)

    # Also add specific entity tags
    if "trump" in text_lower:
        tags.add("trump")
    if "musk" in text_lower or "elon" in text_lower:
        tags.add("musk")
    if "tariff" in text_lower:
        tags.add("tariff")

    return sorted(tags)
