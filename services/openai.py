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

    return resp.choices[0].message.content
