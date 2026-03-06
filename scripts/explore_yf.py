"""Explore yfinance API: ticker info, options chains, fast_info.

Usage:  uv run python scripts/explore_yf.py [SYMBOL ...]
Default symbols: AAPL COPX
"""
import sys
from datetime import date

import yfinance as yf

symbols = sys.argv[1:] or ["AAPL", "COPX"]
today = date.today()


def explore_ticker(sym: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {sym}")
    print(f"{'='*60}")

    t = yf.Ticker(sym)
    info = t.info

    # ── Ticker info (all keys) ──────────────────────────────────
    print(f"\n--- info ({len(info)} keys) ---")
    for k in sorted(info.keys()):
        v = info[k]
        if isinstance(v, (list, dict)) and len(str(v)) > 120:
            v = f"{type(v).__name__}[{len(v)}]"
        print(f"  {k}: {v}")

    # ── Options expirations ─────────────────────────────────────
    exps = t.options
    future = [e for e in exps if date.fromisoformat(e) >= today][:5]
    print(f"\n--- Options expirations (next 5 from {today}) ---")
    print(f"  {future}")
    print(f"  Total available: {len(exps)}")

    if not future:
        print("  No upcoming expirations found.")
        return

    # ── Option chain for nearest expiry ─────────────────────────
    exp = future[0]
    chain = t.option_chain(exp)
    puts = chain.puts
    calls = chain.calls

    cols = ["contractSymbol", "strike", "lastPrice", "bid", "ask",
            "volume", "openInterest", "impliedVolatility"]

    print(f"\n--- Puts for {exp} (first 3) ---")
    print(f"  Columns: {puts.columns.tolist()}")
    print(puts[cols].head(3).to_string(index=False))

    print(f"\n--- Calls for {exp} (first 3) ---")
    print(calls[cols].head(3).to_string(index=False))

    # ── Aggregates ──────────────────────────────────────────────
    put_vol = puts["volume"].sum()
    call_vol = calls["volume"].sum()
    print(f"\n--- Aggregate for {exp} ---")
    print(f"  Total put volume:  {put_vol:,.0f}")
    print(f"  Total call volume: {call_vol:,.0f}")
    print(f"  Total option vol:  {put_vol + call_vol:,.0f}")
    print(f"  Total put OI:      {puts['openInterest'].sum():,}")
    print(f"  Total call OI:     {calls['openInterest'].sum():,}")
    print(f"  Total OI:          {puts['openInterest'].sum() + calls['openInterest'].sum():,}")

    # ── ATM data ────────────────────────────────────────────────
    current = info.get("currentPrice") or info.get("regularMarketPrice")
    print(f"\n--- ATM data (price={current}) ---")
    if current and len(puts) > 0 and len(calls) > 0:
        atm_put = puts.iloc[(puts["strike"] - current).abs().argsort()[:1]]
        atm_call = calls.iloc[(calls["strike"] - current).abs().argsort()[:1]]
        print(f"  ATM put  IV: {atm_put['impliedVolatility'].values[0]:.4f}  "
              f"bid/ask: {atm_put['bid'].values[0]}/{atm_put['ask'].values[0]}  "
              f"spread: {atm_put['ask'].values[0] - atm_put['bid'].values[0]:.2f}")
        print(f"  ATM call IV: {atm_call['impliedVolatility'].values[0]:.4f}  "
              f"bid/ask: {atm_call['bid'].values[0]}/{atm_call['ask'].values[0]}  "
              f"spread: {atm_call['ask'].values[0] - atm_call['bid'].values[0]:.2f}")
    else:
        print("  Could not determine ATM strikes.")

    # ── fast_info ───────────────────────────────────────────────
    print(f"\n--- fast_info ---")
    fi = t.fast_info
    for attr in sorted(dir(fi)):
        if attr.startswith("_"):
            continue
        try:
            val = getattr(fi, attr)
            if callable(val):
                continue
            print(f"  {attr}: {val}")
        except Exception as e:
            print(f"  {attr}: ERROR - {e}")


for sym in symbols:
    explore_ticker(sym.upper())
