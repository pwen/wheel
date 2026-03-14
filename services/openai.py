"""OpenAI / Perplexity client — reusable across features."""

import os
from datetime import date

from openai import OpenAI


def get_perplexity_client() -> OpenAI | None:
    """Return a Perplexity-flavored OpenAI client, or None if no key is set."""
    api_key = os.environ.get("PERPLEXITY_API_KEY", "").strip()
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url="https://api.perplexity.ai")


def get_trade_recommendation(trade_context: dict) -> str:
    """Build prompt from trade context and call Perplexity for a recommendation.

    trade_context keys: strategy_type, strategy_label, symbol, spot_name,
        strike, expiry_date, remaining_dte, contracts, shares, total_premium,
        premium_per_share, break_even, opened_at, days_in_trade, dte, status,
        current_price, moneyness, dist_to_strike, dist_to_strike_pct,
        iv_at_open, live (dict with bid/ask/mid/iv/volume/open_interest/
        delta/theta/gamma/prob_otm), upl, upl_pct, cost_to_close,
        iv_rank, theta_daily_income
    """
    client = get_perplexity_client()
    if not client:
        return "Perplexity API key not configured.", None

    tc = trade_context

    # Core trade data
    today = date.today().strftime("%B %d, %Y")
    data_block = f"""TODAY'S DATE: {today}

TRADE DATA:
- Strategy: {tc['strategy_type']} ({tc['strategy_label']})
- Symbol: {tc['symbol']} ({tc['spot_name']})
- Strike: ${tc['strike']:.2f}
- Expiry: {tc['expiry_date']} ({tc['remaining_dte']} days remaining)
- Contracts: {tc['contracts']} ({tc['shares']} shares)
- Premium collected: ${tc['total_premium']:.2f} (${tc['premium_per_share']:.4f}/share)
- Break-even: ${tc['break_even']:.2f}
- Opened: {tc['opened_at']} ({tc['days_in_trade']} days ago, {tc['days_in_trade']}/{tc['dte']} days elapsed)
- Status: {tc['status']}"""

    # Current market
    if tc.get("current_price"):
        data_block += f"""

CURRENT MARKET:
- Spot price: ${tc['current_price']:.2f}
- Moneyness: {tc['moneyness']} (${tc['dist_to_strike']:.2f} / {tc['dist_to_strike_pct']:.1f}% from strike)"""
        if tc.get("iv_at_open") is not None:
            data_block += f"\n- IV at open: {tc['iv_at_open']:.1f}%"

    # Option pricing
    live = tc.get("live") or {}
    if live:
        data_block += f"""

OPTION PRICING:
- Bid/Ask/Mid: ${live.get('bid', 0):.2f} / ${live.get('ask', 0):.2f} / ${live.get('mid', 0):.2f}
- IV: {live.get('iv', '?')}%
- Volume: {live.get('volume', '?')} | Open Interest: {live.get('open_interest', '?')}"""

    # Greeks
    if live.get("delta") is not None:
        data_block += f"""

GREEKS:
- Delta: {live['delta']:.4f}
- Theta: {live['theta']:.4f} (${tc.get('theta_daily_income', 0):.2f}/day income)
- Gamma: {live['gamma']:.4f}
- Prob OTM: {live.get('prob_otm', '?')}%"""

    # P/L
    if tc.get("upl") is not None:
        upl = tc['upl']
        upl_pct = tc['upl_pct']
        if upl >= 0:
            pl_note = f"WINNING — {upl_pct:.1f}% of premium captured. Closing now locks in ${upl:.2f} profit."
        else:
            pl_note = f"LOSING — option has moved against you. Closing now realizes a ${abs(upl):.2f} loss."
        data_block += f"""

P/L:
- Unrealized P/L: ${upl:.2f} ({upl_pct:.1f}% of premium)
- Cost to close at mid: ${tc['cost_to_close']:.2f}
- Status: {pl_note}"""

    # IV Rank
    if tc.get("iv_rank") is not None:
        data_block += f"""

IV RANK: {tc['iv_rank']:.0f}th percentile (52-week)"""

    # VIX / Market Regime
    vix = tc.get("vix") or {}
    if vix.get("vix") is not None:
        data_block += f"""

MARKET REGIME:
- VIX: {vix['vix']:.2f} (5-day avg: {vix.get('avg5d', 0):.2f})
- Trend: {vix.get('trend', 'unknown')}
- Regime: {vix.get('regime', 'unknown')}"""

    system_prompt = """You are a concise options trading advisor. The trader sells cash-secured puts and covered calls (wheel strategy).

TRADER PHILOSOPHY:
- Only sells CSPs on stocks/ETFs they'd happily hold 3+ years. Assignment isn't a disaster — it's part of the strategy.
- Capital efficiency matters most. Capturing 50%+ of premium early and redeploying beats holding to expiry for diminishing returns. Take the fast money.
- Around 21 DTE, gamma risk picks up and it's a natural decision point — close winners, reassess losers.
- Will roll CSPs down and out to defend against assignment, but only if it generates a net credit. No credit, no roll.
- Rarely rolls covered calls — if the stock rallies past the strike above cost basis, let shares get called away and take the win.
- IMPORTANT: Almost never buys to close at a loss. If the trade is underwater, hold for theta or roll for a credit. Assignment is fine — that's the whole point of the wheel. The only reason to close a loser is if the thesis on the underlying has fundamentally broken.
- If assignment is unavoidable, accepts it and starts the other leg of the wheel.
- Closes CSPs before binary events (earnings, major catalysts) to avoid gap risk. CCs can hold through unless already at high profit.
- If holding assigned shares underwater, patient — waits for a green day to sell CCs rather than locking in losses.

Before making your recommendation, research and consider:
- Recent price action and any notable trend or reversal
- News, catalysts, earnings, analyst actions, sector rotation
- Macro environment: Fed policy, rates, inflation, geopolitical risks
- VIX level and market regime: what does current volatility mean for premium sellers?
- Forward outlook: where is this stock/ETF headed over the next 1-3 months and why?

Your reasoning MUST go beyond the numbers. Lead with your forward view of the underlying, then connect to the trade position. Do not just restate quantitative data.

CRITICAL: Do NOT include citation footnotes like [1], [2], etc. Never reference sources.

Format your response EXACTLY as:

RECOMMENDATION: [Hold / Buy to Close / Roll / Let Expire]

REASONING: [2-3 sentences, MAX 60 words total. Forward outlook first, then trade mechanics.]

KEY RISK: [One sentence, max 20 words.]

If you recommend rolling, add:
ROLL DIRECTION: [One sentence — out in time, adjust strike, or both, and why.]

Be direct and opinionated. No disclaimers."""

    resp = client.chat.completions.create(
        model="sonar",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": data_block},
        ],
        max_tokens=500,
    )

    usage = resp.usage
    tokens = {
        "input": usage.prompt_tokens if usage else None,
        "output": usage.completion_tokens if usage else None,
        "total": usage.total_tokens if usage else None,
    } if usage else None

    return resp.choices[0].message.content, tokens


# ── Event summary categories and prompts ─────────────────────────

_DATA_RELEASE_TYPES = {
    "us_cpi", "us_gdp", "us_pce", "us_ppi", "us_jobs", "us_ism_mfg",
    "us_ism_svc", "us_retail_sales", "us_consumer_conf", "us_jolts",
    "us_michigan", "cn_cpi", "cn_ppi", "cn_gdp", "cn_pmi", "caixin_pmi",
    "cn_trade", "cn_lpr", "eu_cpi", "eu_gdp", "eu_pmi", "eu_trade",
    "de_ifo", "jp_cpi", "jp_tankan", "in_cpi", "in_gdp", "br_cpi",
    "mx_cpi", "wgc_demand",
}

_POLICY_MEETING_TYPES = {
    "us_fomc", "eu_ecb", "eu_ecb_minutes", "jp_boj", "in_rbi",
    "br_copom", "mx_banxico", "opec_meeting", "two_sessions", "cewc",
    "g7_summit", "us_jackson_hole",
}

_CONFERENCE_PRODUCT_TYPES = {
    "nvidia_gtc", "ces", "google_io", "ms_build", "aws_reinvent",
    "computex", "waic_shanghai", "baidu_world", "huawei_connect",
}

_TRADE_SHOW_TYPES = {
    "cn_auto_show", "semicon_west", "hot_chips", "ceraweek",
    "world_battery_expo", "catl_innovation", "zhongguancun",
}

_REBALANCING_TYPES = {
    "us_opex", "us_triple_witching", "us_russell_recon",
    "us_sp500_rebal", "comex_gold_delivery",
}

_REGULATORY_TYPES = {
    "us_bis_export", "ferc_meeting", "un_cop", "ai_safety_summit",
    "davos_wef", "wuzhen_wic",
}

_EARNINGS_TYPES = {"us_earnings", "us_ex_dividend"}


def _get_event_category(event_type: str) -> str:
    if event_type in _EARNINGS_TYPES:
        return "earnings"
    if event_type in _DATA_RELEASE_TYPES:
        return "data_release"
    if event_type in _POLICY_MEETING_TYPES:
        return "policy_meeting"
    if event_type in _CONFERENCE_PRODUCT_TYPES:
        return "conference"
    if event_type in _TRADE_SHOW_TYPES:
        return "trade_show"
    if event_type in _REBALANCING_TYPES:
        return "rebalancing"
    if event_type in _REGULATORY_TYPES:
        return "regulatory"
    return "general"


# Past-event prompts by category
_PAST_PROMPTS = {
    "earnings": (
        "Summarize this earnings report in two sections:\n"
        "WHAT HAPPENED:\n"
        "- EPS and revenue vs consensus estimates (beat/miss/inline)\n"
        "- Key guidance changes: did they raise, lower, or maintain outlook\n"
        "- How the stock moved after-hours and next day\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- What this means for the options premium and IV crush\n"
        "- How peer stocks or the sector reacted\n"
        "- Whether to adjust wheel strategy positioning on this name"
    ),
    "data_release": (
        "Summarize this data release in two sections:\n"
        "WHAT HAPPENED:\n"
        "- Headline number vs consensus expectation, and any notable revisions to prior data\n"
        "- Which sub-components were strong or weak\n"
        "- How equities, bonds, and FX moved in the hours after release\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- What this means for the next Fed/PBOC move or rate path\n"
        "- Sectors or trades that benefit or get hurt from this print\n"
        "- What to position for going forward"
    ),
    "policy_meeting": (
        "Summarize this policy meeting in two sections:\n"
        "WHAT HAPPENED:\n"
        "- The rate decision or policy action, and whether it was unanimous\n"
        "- Any shift in forward guidance, dot plots, or tone\n"
        "- The single most important line from the statement or press conference\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- How this changes the rate path for the next 6 months\n"
        "- Which asset classes or sectors are repriced by this decision\n"
        "- What the next meeting is likely to bring"
    ),
    "conference": (
        "Summarize this tech conference/product event in two sections:\n"
        "WHAT HAPPENED:\n"
        "- Key products, models, chips, or services announced\n"
        "- The single most important reveal and why it matters\n"
        "- How the company's stock and key competitors/suppliers moved\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Who gains or loses competitive ground from these announcements\n"
        "- What this means for the AI/tech capex cycle and supply chain\n"
        "- Specific stocks or sectors to watch as a result"
    ),
    "trade_show": (
        "Summarize this trade show/expo in two sections:\n"
        "WHAT HAPPENED:\n"
        "- Dominant themes on the exhibition floor\n"
        "- Breakthrough technologies or products shown for the first time\n"
        "- Any insights on capacity, pricing, or supply chain bottlenecks\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Sectors or companies that stand to benefit most\n"
        "- Emerging trends that could drive sector rotation\n"
        "- Specific names investors should be watching"
    ),
    "rebalancing": (
        "Summarize this rebalancing/structural market event in two sections:\n"
        "WHAT HAPPENED:\n"
        "- Estimated volume and notable additions or deletions\n"
        "- Outsized price moves in affected names or sectors\n"
        "- Whether the rebalance went smoothly or caused dislocations\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Names with lasting flow implications after the rebalance\n"
        "- Any mispricing or mean-reversion opportunities created\n"
        "- Whether to fade or ride the post-rebalance moves"
    ),
    "regulatory": (
        "Summarize this regulatory/policy event in two sections:\n"
        "WHAT HAPPENED:\n"
        "- What rules, restrictions, or frameworks were announced\n"
        "- Which companies, sectors, or countries are most affected\n"
        "- How affected stocks and sectors moved on the news\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Which stocks face the biggest headwind or tailwind\n"
        "- Enforcement timeline and compliance outlook\n"
        "- How to position around this regulatory shift"
    ),
}

# Future-event prompts by category
_FUTURE_PROMPTS = {
    "earnings": (
        "Preview this upcoming earnings report in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- Consensus EPS and revenue estimates\n"
        "- Key metrics or guidance items the market cares most about\n"
        "- Current implied move from options pricing\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Whether to sell premium before or wait until after earnings\n"
        "- Historical post-earnings move magnitude for this name\n"
        "- How to size or adjust wheel positions around this event"
    ),
    "data_release": (
        "Preview this upcoming data release in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- Consensus estimate for the headline number\n"
        "- What would constitute a hot vs cold print\n"
        "- Which sub-component would drive the biggest market reaction\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- How equities are likely to react in bullish vs bearish scenarios\n"
        "- Sectors most sensitive to this data point\n"
        "- How to position ahead of the release"
    ),
    "policy_meeting": (
        "Preview this upcoming policy meeting in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- What rate move or policy action is priced in\n"
        "- The single most important question markets want answered\n"
        "- What language or action would surprise in either direction\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- How equities are positioned going into the meeting\n"
        "- Which sectors benefit from a hawkish vs dovish outcome\n"
        "- Whether to add or reduce risk ahead of this"
    ),
    "conference": (
        "Preview this upcoming tech conference/product event in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- Products, updates, or partnerships rumored or expected\n"
        "- The single biggest thing investors are watching for\n"
        "- Whether good news is already priced into the stock\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Competitors or suppliers that could also be affected\n"
        "- Whether to buy ahead or wait for the event\n"
        "- Catalysts that would meaningfully change the stock's trajectory"
    ),
    "trade_show": (
        "Preview this upcoming trade show/expo in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- Most important companies presenting\n"
        "- Technology or industry trends that will dominate\n"
        "- How the sector is performing heading into the event\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- What announcements could move stocks\n"
        "- Names most likely to benefit from positive coverage\n"
        "- Whether to pre-position or watch from the sideline"
    ),
    "rebalancing": (
        "Preview this upcoming rebalancing/structural market event in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- How markets have behaved around this event in prior years\n"
        "- Names likely to be added or deleted\n"
        "- Expected volume and flow magnitude\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Pre-positioning trades worth considering\n"
        "- Whether to avoid or lean into volatility around the rebalance\n"
        "- Historical edge or pattern traders can exploit"
    ),
    "regulatory": (
        "Preview this upcoming regulatory/policy event in two sections:\n"
        "WHAT TO EXPECT:\n"
        "- Topics or rules expected to be discussed\n"
        "- Consensus expectation for the outcome\n"
        "- What outcome would be most disruptive to markets\n\n"
        "INVESTOR IMPLICATIONS:\n"
        "- Companies or industries with the most at stake\n"
        "- How to hedge or position for a negative surprise\n"
        "- Likely timeline for any new rules to take effect"
    ),
}

_GENERAL_PAST_PROMPT = (
    "Summarize what happened at this event in two sections:\n"
    "WHAT HAPPENED:\n"
    "- Key outcomes, decisions, or announcements\n"
    "- How markets reacted\n"
    "- Anything unexpected vs expectations\n\n"
    "INVESTOR IMPLICATIONS:\n"
    "- What this means for equity investors going forward\n"
    "- Sectors or trades affected\n"
    "- How to position as a result"
)

_GENERAL_FUTURE_PROMPT = (
    "Preview this upcoming event in two sections:\n"
    "WHAT TO EXPECT:\n"
    "- Consensus expectations or scheduled agenda\n"
    "- Key signals to watch for\n"
    "- What would surprise the market\n\n"
    "INVESTOR IMPLICATIONS:\n"
    "- Bullish vs bearish scenarios for equities\n"
    "- How to position ahead of this event\n"
    "- Sectors or names most sensitive to the outcome"
)


def get_event_summary(event_title: str, event_type: str, event_date: str, region: str) -> str:
    """Call Perplexity to get a category-aware AI summary of a macro event."""
    client = get_perplexity_client()
    if not client:
        return "Perplexity API key not configured."

    today = date.today().isoformat()
    event_d = date.fromisoformat(event_date)
    is_past = event_d < date.today()
    category = _get_event_category(event_type)

    if is_past:
        time_context = f"This event already occurred on {event_date}."
        task = _PAST_PROMPTS.get(category, _GENERAL_PAST_PROMPT)
    else:
        time_context = f"This event is upcoming on {event_date} (today is {today})."
        task = _FUTURE_PROMPTS.get(category, _GENERAL_FUTURE_PROMPT)

    prompt = f"""{time_context}

Event: {event_title}
Type: {event_type}
Region: {region}
Date: {event_date}

{task}

Respond in exactly two sections. Use 2-3 short sentences per section, not bullet points. Write in plain text only — no bold, no italics, no markdown, no numbered lists, no citation footnotes like [1] or [2]. Write for an experienced equity investor. Be concrete and specific."""

    try:
        resp = client.chat.completions.create(
            model="sonar",
            messages=[
                {"role": "system", "content": (
                    "You are a senior macro strategist writing event briefs for an experienced equity investor "
                    "focused on US and Chinese markets.\n\n"
                    "RESPONSE FORMAT (follow exactly every time):\n"
                    "- Two sections separated by a blank line.\n"
                    "- For past events, use headers: WHAT HAPPENED and INVESTOR IMPLICATIONS.\n"
                    "- For future events, use headers: WHAT TO EXPECT and INVESTOR IMPLICATIONS.\n"
                    "- Write each header on its own line, in ALL CAPS, with no punctuation after it.\n"
                    "- Write each section as 2-3 concise sentences in paragraph form. No bullet points, no numbered lists.\n"
                    "- Keep total response under 150 words.\n\n"
                    "INVESTOR IMPLICATIONS REQUIREMENTS:\n"
                    "- If applicable, mention index-level impact: S&P 500 / Nasdaq for US, "
                    "CSI 300 / Hang Seng for China. Skip if the event has no meaningful index-level effect.\n"
                    "- Then mention specific sector or stock-level implications.\n"
                    "- If the event is region-specific but has cross-border implications (e.g. China data affecting US tech, "
                    "or US policy affecting HK-listed Chinese stocks), call that out explicitly.\n\n"
                    "STYLE RULES (never break these):\n"
                    "- Plain text only. No bold, no italics, no asterisks, no markdown of any kind.\n"
                    "- Never include citation footnotes like [1], [2], or [3].\n"
                    "- Never include disclaimers, caveats, or \"this is not financial advice\" language.\n"
                    "- Be specific — name actual numbers, stocks, sectors, or policy changes. No vague generalities.\n"
                    "- Write like a morning research note, not a Wikipedia article."
                )},
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Perplexity event summary failed")
        return f"Error: {e}"
