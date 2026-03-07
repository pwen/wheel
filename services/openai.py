"""OpenAI / Perplexity client — reusable across features."""

import os

from openai import OpenAI


def get_perplexity_client() -> OpenAI | None:
    """Return a Perplexity-flavored OpenAI client, or None if no key is set."""
    api_key = os.environ.get("PERPLEXITY_API_KEY", "")
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
        raise RuntimeError("Perplexity API key not configured")

    tc = trade_context

    # Core trade data
    data_block = f"""TRADE DATA:
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
        data_block += f"""

P/L:
- Unrealized P/L: ${tc['upl']:.2f} ({tc['upl_pct']:.1f}% of premium)
- Cost to close at mid: ${tc['cost_to_close']:.2f}"""

    # IV Rank
    if tc.get("iv_rank") is not None:
        data_block += f"""

IV RANK: {tc['iv_rank']:.0f}th percentile (52-week)"""

    system_prompt = """You are a concise options trading advisor. The trader sells cash-secured puts and covered calls (wheel strategy). Important context: they only sell CSPs on stocks/ETFs they'd be happy holding for 3+ years, so assignment is not catastrophic — it's an acceptable outcome at the right price.

Before making your recommendation, research and consider:
- Recent price action: how has the underlying moved over the past 1-4 weeks? Any notable trend or reversal?
- News & catalysts: earnings, guidance, analyst upgrades/downgrades, sector rotation, regulatory changes, product launches
- Macro environment: Fed policy, rates, inflation data, geopolitical risks, risk-on vs risk-off sentiment
- Sector/industry trends: is the underlying's sector in favor or under pressure?
- Technical levels: key support/resistance near the strike price
- Forward outlook: consensus estimates, upcoming events that could move the stock

Weigh all of the above alongside the quantitative trade data to form your recommendation.

Format your response EXACTLY as:

RECOMMENDATION: [Hold / Buy to Close / Roll / Let Expire]

REASONING: [2-3 sentences explaining why — weave together the trade data with your market research. Reference specific recent events or outlook factors.]

KEY RISK: [One sentence on the main risk.]

If you recommend rolling, add:
ROLL DIRECTION: [One sentence — out in time, adjust strike, or both, and why.]

Be direct and opinionated — the trader wants a clear signal, not hedging. No disclaimers."""

    resp = client.chat.completions.create(
        model="sonar",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": data_block},
        ],
        max_tokens=500,
    )

    return resp.choices[0].message.content
