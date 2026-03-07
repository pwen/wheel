"""
Market flash — daily market summary via Perplexity AI (sonar model).
Designed to give a wheel-strategy trader a quick after-hours read.
"""

import os
import re

from openai import OpenAI

MARKET_FLASH_PROMPT = """\
You are a concise market analyst writing a daily after-hours summary for an \
individual options trader who runs the **wheel strategy** (selling cash-secured \
puts and covered calls on US equities).

Write a short, punchy market recap in **Markdown** covering today's session. \
Structure it EXACTLY like this:

## Market Pulse
One paragraph (40–60 words). Lead with direction and magnitude of SPY/QQQ/IWM. \
Note VIX direction and level. Mention the overall tone (risk-on, risk-off, \
rotation, choppy, etc). No filler.

## Notable Movers
Bullet list of 4–6 individual stocks or ETFs that had significant moves today \
(>2% either direction), with a one-line reason why. Prioritize large-cap names \
that are popular wheel underlyings (e.g. AAPL, MSFT, NVDA, AMD, AMZN, TSLA, \
META, GOOG, SOFI, PLTR, etc). Format: **TICKER** +/-X.X% — reason.

## Macro & Events
2–3 bullets on macro catalysts: economic data releases, Fed commentary, \
geopolitical events, earnings reports, or anything that moved the market today. \
Keep each bullet under 20 words.

## Wheel Trader's Take
One paragraph (30–50 words). Actionable color for a put seller: Was today's IV \
environment favorable for opening new positions? Any names where elevated IV \
creates opportunity? Any caution flags (earnings, FOMC, etc)? \
Write as if talking to a trading buddy, not a client.

Rules:
- Today's date is {date}.
- Be factual and specific — use real numbers, real tickers, real events from today.
- Do NOT include citation references like [1], [2] etc. No footnotes or sources.
- Do NOT use phrases like "as of my last update" or "I don't have real-time data".
- Keep the TOTAL response under 300 words.
- If markets were closed today (weekend/holiday), say so in one line and skip the rest.
"""


def generate_market_flash(today_str: str) -> str:
    """
    Call Perplexity sonar to generate today's market flash.

    Args:
        today_str: date string like "2026-03-06"

    Returns:
        Markdown-formatted market summary
    """
    api_key = os.environ.get("PERPLEXITY_API_KEY", "")
    if not api_key:
        return "**API key not configured.** Set `PERPLEXITY_API_KEY` to enable market flash."

    prompt = MARKET_FLASH_PROMPT.format(date=today_str)

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.perplexity.ai",
    )

    response = client.chat.completions.create(
        model="sonar",
        messages=[
            {
                "role": "system",
                "content": "You are a market analyst. Return well-formatted Markdown. No JSON. Be concise.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )

    text = response.choices[0].message.content or ""
    text = re.sub(r"\s*\[\d+\]", "", text)
    return text.strip()
