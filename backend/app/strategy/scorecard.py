"""
ZipTrader 7-Step Test — Trade Scorecard

Evaluates a trade setup across 7 factors from Module 5, Lesson 15.
Returns a GO / CAUTION / NO-GO recommendation.
"""

from pydantic import BaseModel
from typing import Optional


class ScorecardInput(BaseModel):
    """User-provided + computed inputs for the 7-Step Test."""

    # Step 1: Time frame (user selects)
    time_frame: str = "swing"  # intraday, swing, position

    # Step 2: Risk vs Reward (computed or manual)
    entry_price: float
    stop_loss_price: float
    target_price: float

    # Step 3: Elevating/Deprecating factors (computed from indicators)
    rsi_value: Optional[float] = None
    has_sma_confirmation: bool = False
    macd_positive: bool = False

    # Step 4: Long-term outlook (computed)
    above_180_sma: bool = False

    # Step 5: News catalysts (manual)
    news_sentiment: int = 0  # -1, 0, or +1

    # Step 6: Analyst targets (manual)
    analyst_target: Optional[float] = None

    # Step 7: computed from total score


class ScorecardResult(BaseModel):
    """Output of the 7-Step Test."""

    scores: dict  # per-step scores
    total_score: int
    max_score: int
    recommendation: str  # GO, CAUTION, NO-GO
    risk_reward_ratio: float
    details: list[str]


def run_scorecard(input: ScorecardInput) -> ScorecardResult:
    """Evaluate a trade using the ZipTrader 7-Step Test."""
    scores = {}
    details = []

    # Step 1: Time frame — no score, just context
    scores["time_frame"] = 0
    details.append(f"Time frame: {input.time_frame}")

    # Step 2: Risk vs Reward
    risk = abs(input.entry_price - input.stop_loss_price)
    reward = abs(input.target_price - input.entry_price)
    rr_ratio = reward / risk if risk > 0 else 0

    if rr_ratio >= 3:
        scores["risk_reward"] = 2
        details.append(f"R:R = {rr_ratio:.1f} — excellent")
    elif rr_ratio >= 2:
        scores["risk_reward"] = 1
        details.append(f"R:R = {rr_ratio:.1f} — good")
    else:
        scores["risk_reward"] = 0
        details.append(f"R:R = {rr_ratio:.1f} — weak, consider skipping")

    # Step 3: Elevating vs Deprecating factors
    step3_score = 0
    if input.has_sma_confirmation:
        step3_score += 1
        details.append("SMA confirmation — elevating")
    else:
        details.append("No SMA confirmation — deprecating")

    if input.macd_positive:
        step3_score += 1
        details.append("MACD positive strength — elevating")

    if input.rsi_value is not None:
        if input.rsi_value < 30:
            step3_score += 1
            details.append(f"RSI {input.rsi_value:.0f} — oversold, elevating")
        elif input.rsi_value > 70:
            step3_score -= 1
            details.append(f"RSI {input.rsi_value:.0f} — overbought, deprecating")
        elif 40 <= input.rsi_value <= 60:
            details.append(f"RSI {input.rsi_value:.0f} — fair value zone")

    scores["elevating_factors"] = max(step3_score, 0)

    # Step 4: Long-term outlook
    if input.above_180_sma:
        scores["long_term"] = 1
        details.append("Above 180-SMA — bullish long-term direction")
    else:
        scores["long_term"] = 0
        details.append("Below 180-SMA — bearish long-term direction")

    # Step 5: News catalysts
    scores["news"] = max(input.news_sentiment, 0)
    sentiments = {-1: "negative", 0: "neutral", 1: "positive"}
    details.append(f"News sentiment: {sentiments.get(input.news_sentiment, 'unknown')}")

    # Step 6: Analyst targets
    if input.analyst_target and input.entry_price:
        upside_pct = ((input.analyst_target - input.entry_price) / input.entry_price) * 100
        if upside_pct >= 15:
            scores["analyst"] = 1
            details.append(f"Analyst target {upside_pct:.0f}% above entry — elevating")
        else:
            scores["analyst"] = 0
            details.append(f"Analyst target only {upside_pct:.0f}% above entry")
    else:
        scores["analyst"] = 0
        details.append("No analyst target provided")

    # Step 7: Total assessment
    total = sum(scores.values())
    max_score = 7  # theoretical max

    if total >= 5:
        recommendation = "GO"
    elif total >= 3:
        recommendation = "CAUTION"
    else:
        recommendation = "NO-GO"

    return ScorecardResult(
        scores=scores,
        total_score=total,
        max_score=max_score,
        recommendation=recommendation,
        risk_reward_ratio=round(rr_ratio, 2),
        details=details,
    )
