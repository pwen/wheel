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
puts and covered calls on equities).

Write a short, punchy market recap in **Markdown** covering today's session. \
Structure it EXACTLY like this:

## Market Pulse
5 bullet points using Markdown dash bullets. Each bullet starts with "- " \
and is one punchy sentence (under 20 words). Example format:
- SPY fell 1.2% to 580; QQQ -0.8%; IWM +0.3%.
Must cover:
- US indices (SPY/QQQ/IWM with percentages) and VIX direction
- Bond yields and commodities (oil, natural gas, gold, copper, silver — \
mention whichever moved most today)
- At least 2 bullets on international markets: Europe (STOXX 600), China \
(CSI 300, Hang Seng, A-shares), Latin America (EWZ, ILF), or EM broadly (EEM). \
Include China every day it traded.
No filler, no intros—jump straight into the bullets after the ## header.

## Macro & Events
2–3 short paragraphs of organized prose (not bullet points). Cover: economic \
data releases, central bank commentary, geopolitical events, and sector \
rotation themes. Start with US catalysts, then dedicate at least one full \
paragraph to the rest of the world — with a focus on China, emerging markets, \
Europe, and Latin America. Always mention China if there was relevant news. \
Keep it concise and factual.

Rules:
- Today's date is {date}.
- Be factual and specific — use real numbers, real tickers, real events from today.
- Do NOT include citation references like [1], [2] etc. No footnotes or sources.
- Do NOT use phrases like "as of my last update" or "I don't have real-time data".
- Keep the TOTAL response under 250 words.
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
                "content": "You are a market analyst. Return well-formatted Markdown with ## headers and - bullet lists. Every section MUST start with ## on its own line. No JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )

    text = response.choices[0].message.content or ""
    # Strip citation brackets like [1], [2]
    text = re.sub(r"\s*\[\d+\]", "", text)
    # Ensure section headers are markdown ## if returned as plain lines
    headers = [
        "Market Pulse",
        "Macro & Events",
        "Macro and Events",
    ]
    for h in headers:
        # Match: ## Header, **Header**, Header (on its own line)
        text = re.sub(
            rf"^\s*(?:#{1,3}\s*)?(?:\*\*)?{re.escape(h)}(?:\*\*)?\s*$",
            f"\n## {h}",
            text,
            flags=re.MULTILINE,
        )

    # Ensure bullet lines in Market Pulse use "- " prefix
    # Find content between ## Market Pulse and ## Macro
    def fix_bullets(match):
        header = match.group(1)
        body = match.group(2)
        # Add "- " to lines that look like bullet content but lack it
        lines = body.split("\n")
        fixed = []
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("-") and not stripped.startswith("#"):
                fixed.append(f"- {stripped}")
            else:
                fixed.append(line)
        return header + "\n".join(fixed)

    text = re.sub(
        r"(## Market Pulse\n)(.*?)(?=\n## |\Z)",
        fix_bullets,
        text,
        flags=re.DOTALL,
    )

    return text.strip()
