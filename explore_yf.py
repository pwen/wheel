import yfinance as yf

t = yf.Ticker("AAPL")

# 1. Available expiration dates
exps = t.options
print(f"Expirations (first 5): {exps[:5]}")
print(f"Total expirations: {len(exps)}")

# 2. Get option chain for nearest expiry
chain = t.option_chain(exps[0])
puts = chain.puts
calls = chain.calls

print(f"\nPuts columns: {puts.columns.tolist()}")
print(f"\nPuts for {exps[0]} (first 3):")
cols = ['contractSymbol','strike','lastPrice','bid','ask','volume','openInterest','impliedVolatility']
print(puts[cols].head(3).to_string())

print(f"\nCalls for {exps[0]} (first 3):")
print(calls[cols].head(3).to_string())

# 3. Aggregate
print(f"\nAggregate for {exps[0]}:")
print(f"  Total put volume: {puts['volume'].sum()}")
print(f"  Total call volume: {calls['volume'].sum()}")
print(f"  Total option volume: {puts['volume'].sum() + calls['volume'].sum()}")
print(f"  Total put OI: {puts['openInterest'].sum()}")
print(f"  Total call OI: {calls['openInterest'].sum()}")
print(f"  Total OI: {puts['openInterest'].sum() + calls['openInterest'].sum()}")

# 4. ATM IV
current = t.info.get('currentPrice') or t.info.get('regularMarketPrice')
print(f"\nCurrent price: {current}")
atm_put = puts.iloc[(puts['strike'] - current).abs().argsort()[:1]]
atm_call = calls.iloc[(calls['strike'] - current).abs().argsort()[:1]]
print(f"  ATM put IV: {atm_put['impliedVolatility'].values[0]:.4f}")
print(f"  ATM call IV: {atm_call['impliedVolatility'].values[0]:.4f}")
print(f"  ATM put bid/ask: {atm_put['bid'].values[0]}/{atm_put['ask'].values[0]}")
print(f"  ATM call bid/ask: {atm_call['bid'].values[0]}/{atm_call['ask'].values[0]}")
spread_put = atm_put['ask'].values[0] - atm_put['bid'].values[0]
spread_call = atm_call['ask'].values[0] - atm_call['bid'].values[0]
print(f"  ATM put spread: {spread_put:.2f}")
print(f"  ATM call spread: {spread_call:.2f}")

# 5. Also check an ETF
print("\n\n=== COPX (ETF) Options ===")
t2 = yf.Ticker("COPX")
exps2 = t2.options
print(f"Expirations (first 5): {exps2[:5]}")
print(f"Total expirations: {len(exps2)}")
if exps2:
    chain2 = t2.option_chain(exps2[0])
    p2 = chain2.puts
    c2 = chain2.calls
    print(f"Total put volume: {p2['volume'].sum()}")
    print(f"Total call volume: {c2['volume'].sum()}")
    print(f"Total OI: {p2['openInterest'].sum() + c2['openInterest'].sum()}")
    current2 = t2.info.get('regularMarketPrice')
    print(f"Current price: {current2}")
    if len(p2) > 0:
        atm_p2 = p2.iloc[(p2['strike'] - current2).abs().argsort()[:1]]
        atm_c2 = c2.iloc[(c2['strike'] - current2).abs().argsort()[:1]]
        print(f"ATM put IV: {atm_p2['impliedVolatility'].values[0]:.4f}")
        print(f"ATM call IV: {atm_c2['impliedVolatility'].values[0]:.4f}")

# 6. Check fast_info
print("\n\n=== AAPL fast_info ===")
fi = yf.Ticker("AAPL").fast_info
for attr in dir(fi):
    if not attr.startswith('_'):
        try:
            print(f"  {attr}: {getattr(fi, attr)}")
        except Exception as e:
            print(f"  {attr}: ERROR - {e}")
