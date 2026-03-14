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


def _get_event_category(event_type: str) -> str:
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
    "data_release": (
        "Summarize this data release:\n"
        "1. **Actual vs consensus** — what was the headline number vs expectations? Any notable revisions?\n"
        "2. **Breakdown** — which sub-components were strong or weak?\n"
        "3. **Market reaction** — how did equities, bonds, and FX move in the hours after?\n"
        "4. **Forward signal** — what does this data imply for the next Fed/PBOC move or economic trajectory?"
    ),
    "policy_meeting": (
        "Summarize this policy meeting:\n"
        "1. **Decision** — what was the rate decision or policy action? Was it unanimous?\n"
        "2. **Forward guidance** — any shift in tone, dot plots, or language about future moves?\n"
        "3. **Market reaction** — how did equities, bonds, and FX react to the decision and press conference?\n"
        "4. **Key quote** — the single most important line from the statement or presser."
    ),
    "conference": (
        "Summarize this tech conference/product event:\n"
        "1. **Key announcements** — new products, models, chips, or services revealed?\n"
        "2. **Competitive implications** — who benefits, who loses? Any moat shifts?\n"
        "3. **Stock impact** — how did the company's stock and key competitors/suppliers move?\n"
        "4. **Investor signal** — what does this mean for the AI/tech capex cycle?"
    ),
    "trade_show": (
        "Summarize this trade show/expo:\n"
        "1. **Top trends** — what themes dominated the exhibition floor?\n"
        "2. **Notable debuts** — any breakthrough technologies or products shown for the first time?\n"
        "3. **Supply chain signals** — any insights on capacity, pricing, or bottlenecks?\n"
        "4. **Investment angle** — which sectors or companies stand to benefit most?"
    ),
    "rebalancing": (
        "Summarize this rebalancing/structural market event:\n"
        "1. **Flow summary** — estimated volume, notable additions/deletions, or positioning shifts?\n"
        "2. **Price impact** — any outsized moves in affected names or sectors?\n"
        "3. **Execution** — did the rebalance go smoothly or were there dislocations?\n"
        "4. **Takeaway** — any lasting implications for affected names?"
    ),
    "regulatory": (
        "Summarize this regulatory/policy event:\n"
        "1. **Key decisions** — what rules, restrictions, or frameworks were announced?\n"
        "2. **Who's affected** — which companies, sectors, or countries face the biggest impact?\n"
        "3. **Market reaction** — how did affected stocks/sectors move?\n"
        "4. **Enforcement timeline** — when do the rules take effect and what's the compliance outlook?"
    ),
}

# Future-event prompts by category
_FUTURE_PROMPTS = {
    "data_release": (
        "Preview this upcoming data release:\n"
        "1. **Consensus estimate** — what is the market expecting for the headline number?\n"
        "2. **Range of outcomes** — what would be a hot vs cold print?\n"
        "3. **What matters most** — which sub-component would drive the biggest reaction?\n"
        "4. **Scenario analysis** — bullish vs bearish case for equities."
    ),
    "policy_meeting": (
        "Preview this upcoming policy meeting:\n"
        "1. **Expected decision** — what rate move or policy action is priced in?\n"
        "2. **Key question** — the single most important thing markets want answered.\n"
        "3. **Hawkish vs dovish risk** — what language or actions would surprise in either direction?\n"
        "4. **Trade setup** — how are markets positioned going in?"
    ),
    "conference": (
        "Preview this upcoming tech conference/product event:\n"
        "1. **Expected announcements** — what products, updates, or partnerships are rumored/expected?\n"
        "2. **Key question** — the single biggest thing investors want to hear.\n"
        "3. **Stock setup** — how is the stock positioned? Is good news priced in?\n"
        "4. **Watch list** — which competitors or suppliers could also be affected?"
    ),
    "trade_show": (
        "Preview this upcoming trade show/expo:\n"
        "1. **Key exhibitors** — who are the most important companies presenting?\n"
        "2. **Themes to watch** — what technology or industry trends will dominate?\n"
        "3. **Market context** — how is the sector performing heading into this event?\n"
        "4. **Investment angle** — what announcements could move stocks?"
    ),
    "rebalancing": (
        "Preview this upcoming rebalancing/structural market event:\n"
        "1. **Historical pattern** — how have markets behaved around this event in prior years?\n"
        "2. **Expected additions/deletions** — any names likely to be affected?\n"
        "3. **Volume expectations** — how much flow is expected?\n"
        "4. **Positioning** — any pre-positioning trades worth noting?"
    ),
    "regulatory": (
        "Preview this upcoming regulatory/policy event:\n"
        "1. **Agenda** — what topics or rules are expected to be discussed?\n"
        "2. **Key risk** — what outcome would be most disruptive to markets?\n"
        "3. **Affected sectors** — which companies or industries have the most at stake?\n"
        "4. **Likely outcome** — consensus expectation for the result."
    ),
}

_GENERAL_PAST_PROMPT = (
    "Summarize what happened at this event. Focus on:\n"
    "1. **Key outcomes** — what was decided, released, or revealed?\n"
    "2. **Market impact** — how did markets react?\n"
    "3. **Investor takeaways** — what should an equity investor remember going forward?\n"
    "4. **Surprises** — anything unexpected?"
)

_GENERAL_FUTURE_PROMPT = (
    "Preview this upcoming event. Focus on:\n"
    "1. **What to expect** — consensus expectations or scheduled agenda\n"
    "2. **Key things to watch** — what signals matter most?\n"
    "3. **Market positioning** — how are markets positioned heading in?\n"
    "4. **Risk scenarios** — bullish vs bearish outcomes for equities?"
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

Keep it concise (3-5 bullet points max). Write for an experienced investor, not a beginner. No fluff."""

    try:
        resp = client.chat.completions.create(
            model="sonar",
            messages=[
                {"role": "system", "content": "You are a senior macro strategist. Give concise, actionable event summaries for equity investors. Use bullet points. No disclaimers."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Perplexity event summary failed")
        return f"Error: {e}"
