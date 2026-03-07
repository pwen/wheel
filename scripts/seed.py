"""Seed the database with sample trades for local development.

Usage:
    .venv/bin/python seed.py

Requires the app to be running at localhost:5002.
Spot prices at open are market close prices fetched from yfinance.
"""
import requests

BASE = "http://localhost:5002/api"

# spot_price_at_open = yfinance closing price on opened_at date
trades = [
    # --- CSPs ---
    {"symbol": "COPX", "strategy_type": "CSP", "strike": 80.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 339.33, "opened_at": "2026-03-04", "spot_price_at_open": 88.16},
    {"symbol": "FXI", "strategy_type": "CSP", "strike": 34.00, "expiry_date": "2026-04-17",
     "contracts": 3, "total_premium": 171.98, "opened_at": "2026-03-04", "spot_price_at_open": 36.21},
    {"symbol": "RKT", "strategy_type": "CSP", "strike": 15.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 68.33, "opened_at": "2026-03-04", "spot_price_at_open": 14.91},
    {"symbol": "XLF", "strategy_type": "CSP", "strike": 48.00, "expiry_date": "2026-04-17",
     "contracts": 5, "total_premium": 316.64, "opened_at": "2026-03-04", "spot_price_at_open": 50.51},
    {"symbol": "XOP", "strategy_type": "CSP", "strike": 150.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 309.33, "opened_at": "2026-03-05", "spot_price_at_open": 163.82},
    {"symbol": "EWZ", "strategy_type": "CSP", "strike": 34.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 88.33, "opened_at": "2026-03-04", "spot_price_at_open": 37.49},
    {"symbol": "EEM", "strategy_type": "CSP", "strike": 56.50, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 174.34, "opened_at": "2026-03-04", "spot_price_at_open": 57.58},
    {"symbol": "EEM", "strategy_type": "CSP", "strike": 57.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 197.34, "opened_at": "2026-03-04", "spot_price_at_open": 57.58},
    {"symbol": "EFA", "strategy_type": "CSP", "strike": 96.00, "expiry_date": "2026-04-17",
     "contracts": 2, "total_premium": 240.67, "opened_at": "2026-03-04", "spot_price_at_open": 98.62},
    {"symbol": "IWM", "strategy_type": "CSP", "strike": 253.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 689.34, "opened_at": "2026-03-04", "spot_price_at_open": 251.82},
    # --- CCs ---
    {"symbol": "IXUS", "strategy_type": "CC", "strike": 91.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 214.33, "opened_at": "2026-03-04", "spot_price_at_open": 87.98},
    {"symbol": "EWZ", "strategy_type": "CC", "strike": 39.00, "expiry_date": "2026-04-17",
     "contracts": 2, "total_premium": 210.65, "opened_at": "2026-03-04", "spot_price_at_open": 37.49},
    {"symbol": "SLV", "strategy_type": "CC", "strike": 90.00, "expiry_date": "2026-04-17",
     "contracts": 2, "total_premium": 808.65, "opened_at": "2026-03-04", "spot_price_at_open": 75.34},
    {"symbol": "COPX", "strategy_type": "CC", "strike": 90.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 579.33, "opened_at": "2026-03-04", "spot_price_at_open": 88.16},
    {"symbol": "IBIT", "strategy_type": "CC", "strike": 42.00, "expiry_date": "2026-04-17",
     "contracts": 1, "total_premium": 156.34, "opened_at": "2026-03-04", "spot_price_at_open": 41.44},
    {"symbol": "IBIT", "strategy_type": "CC", "strike": 46.00, "expiry_date": "2026-04-17",
     "contracts": 5, "total_premium": 321.67, "opened_at": "2026-03-04", "spot_price_at_open": 41.44},
]

if __name__ == "__main__":
    ok = 0
    for t in trades:
        r = requests.post(f"{BASE}/trades", json=t)
        if r.ok:
            d = r.json()
            print(f"  OK  id={str(d.get('id','')):>2}  {t['symbol']:<5} {t['strategy_type']}  ${t['strike']:>7.2f}")
            ok += 1
        else:
            print(f"  ERR {r.status_code}  {t['symbol']} {t['strategy_type']}: {r.text[:120]}")
    print(f"\nInserted {ok}/{len(trades)} trades.")
