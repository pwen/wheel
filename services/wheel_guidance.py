"""Deterministic wheel guidance engine for per-trade view."""

from __future__ import annotations

import math
from datetime import date, datetime

import yfinance as yf
from sqlmodel import Session, select

from models import ShareLot, Spot, Trade, TradeStatus
from services.yfinance import compute_greeks


REGIME_RULES = {
    "bull": {
        "CSP": {"dte": (30, 45), "delta_abs": (0.15, 0.20)},
        "CC": {"dte": (45, 60), "delta_abs": (0.25, 0.35)},
    },
    "sideways": {
        "CSP": {"dte": (30, 60), "delta_abs": (0.25, 0.35)},
        "CC": {"dte": (30, 60), "delta_abs": (0.25, 0.35)},
    },
    "bear": {
        "CSP": {"dte": (60, 120), "delta_abs": (0.15, 0.20)},
        "CC": {"dte": (30, 45), "delta_abs": (0.35, 0.50)},
    },
    "crisis": {
        "CSP": {"dte": (90, 150), "delta_abs": (0.10, 0.15)},
        "CC": {"dte": (21, 35), "delta_abs": (0.45, 0.50)},
    },
}


def _safe_float(value, default=0.0) -> float:
    try:
        v = float(value)
        if math.isnan(v):
            return default
        return v
    except Exception:
        return default


def _get_vix_regime() -> dict:
    try:
        ticker = yf.Ticker("^VIX")
        hist = ticker.history(period="10d")
        if hist.empty:
            return {"vix": None, "avg5d": None, "trend": "unknown", "regime": "sideways"}
        vix = float(hist["Close"].iloc[-1])
        avg5d = float(hist["Close"].tail(5).mean())
        pct_diff = ((vix - avg5d) / avg5d) * 100 if avg5d else 0
        if pct_diff > 5:
            trend = "rising"
        elif pct_diff < -5:
            trend = "falling"
        else:
            trend = "stable"

        if avg5d >= 40:
            regime = "crisis"
        elif avg5d >= 25:
            regime = "bear"
        elif avg5d >= 16:
            regime = "sideways"
        else:
            regime = "bull"
        return {"vix": round(vix, 2), "avg5d": round(avg5d, 2), "trend": trend, "regime": regime}
    except Exception:
        return {"vix": None, "avg5d": None, "trend": "unknown", "regime": "sideways"}


def _pick_next_strategy(shares_held: int) -> str:
    return "CC" if shares_held >= 100 else "CSP"


def _build_phase1_guidance(trade: Trade, detail: dict, shares_held: int, avg_cost: float | None, regime: str) -> dict:
    live = detail.get("live") or {}
    remaining_dte = max(0, detail.get("dte", 0) - detail.get("days_in_trade", 0))
    strategy = _pick_next_strategy(shares_held)
    rules = REGIME_RULES.get(regime, REGIME_RULES["sideways"])[strategy]
    delta_lo, delta_hi = rules["delta_abs"]
    dte_lo, dte_hi = rules["dte"]

    reasons = []
    blocking_flags = []
    confidence = "medium"
    action = "sell_next"

    # Trade-state management gate: manage live position before opening a fresh leg.
    if trade.status == TradeStatus.OPEN:
        action = "hold_or_manage_current"
        reasons.append("Current trade is still open; prioritize management before opening a new leg.")
        if remaining_dte <= 21:
            reasons.append(f"{remaining_dte} DTE left: gamma risk zone, consider closing/rolling first.")

        mid = _safe_float(live.get("mid"), default=-1)
        total_premium = _safe_float(detail.get("total_premium"), default=0)
        if mid >= 0 and total_premium > 0:
            close_cost = mid * trade.contracts * trade.multiplier
            upl = total_premium - close_cost
            upl_pct = (upl / total_premium) * 100
            if detail.get("days_in_trade", 0) <= detail.get("dte", 1) / 2 and upl_pct >= 50:
                reasons.append("50%+ premium captured in first half of trade; closing early is favored.")

    # Liquidity guardrails from current contract quote.
    bid = _safe_float(live.get("bid"), default=0)
    ask = _safe_float(live.get("ask"), default=0)
    mid = _safe_float(live.get("mid"), default=0)
    if bid > 0 and ask > 0 and mid > 0:
        spread_pct = ((ask - bid) / mid) * 100
        if spread_pct > 25:
            blocking_flags.append(f"Current contract spread is wide ({spread_pct:.1f}% of mid).")

    open_interest = live.get("open_interest")
    if open_interest is not None and _safe_float(open_interest, default=0) < 100:
        blocking_flags.append("Current contract open interest is thin (<100).")

    if strategy == "CC" and shares_held < 100:
        blocking_flags.append("Need at least 100 shares to sell a covered call.")

    if strategy == "CC" and avg_cost is not None:
        reasons.append(f"Prefer CC strikes at/above your average cost basis (${avg_cost:.2f}).")

    if blocking_flags:
        confidence = "low"

    if not reasons:
        reasons.append("No urgent trade-management flags detected.")

    return {
        "action": action,
        "next_strategy": strategy,
        "confidence": confidence,
        "reasons": reasons,
        "blocking_flags": blocking_flags,
        "setup": {
            "dte_min": dte_lo,
            "dte_max": dte_hi,
            "delta_min_abs": delta_lo,
            "delta_max_abs": delta_hi,
        },
    }


def _build_phase2_candidates(
    symbol: str,
    current_price: float,
    strategy: str,
    setup: dict,
    avg_cost: float | None,
) -> dict:
    candidates = []
    notes = []

    dte_min = int(setup["dte_min"])
    dte_max = int(setup["dte_max"])
    delta_min = float(setup["delta_min_abs"])
    delta_max = float(setup["delta_max_abs"])
    delta_target = (delta_min + delta_max) / 2

    try:
        ticker = yf.Ticker(symbol)
        expiries = ticker.options
        if not expiries:
            return {"candidates": [], "notes": ["No option expiries found for this symbol."]}
    except Exception:
        return {"candidates": [], "notes": ["Failed to fetch option chain data."]}

    today = date.today()
    expiry_rows = []
    for expiry_str in expiries:
        try:
            expiry_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
        except Exception:
            continue
        dte = (expiry_dt - today).days
        if dte_min <= dte <= dte_max:
            expiry_rows.append((expiry_str, dte))

    if not expiry_rows:
        return {
            "candidates": [],
            "notes": [f"No expiries in target DTE window ({dte_min}-{dte_max}d)."],
        }

    target_dte = (dte_min + dte_max) / 2
    expiry_rows.sort(key=lambda row: abs(row[1] - target_dte))
    expiry_rows = expiry_rows[:4]

    for expiry_str, dte in expiry_rows:
        try:
            chain = ticker.option_chain(expiry_str)
            df = chain.puts if strategy == "CSP" else chain.calls
        except Exception:
            continue

        for _, row in df.iterrows():
            strike = _safe_float(row.get("strike"), default=0)
            if strike <= 0:
                continue

            bid = _safe_float(row.get("bid"), default=0)
            ask = _safe_float(row.get("ask"), default=0)
            mid = (bid + ask) / 2 if bid > 0 and ask > 0 else (bid or ask)
            if mid <= 0:
                continue

            iv = _safe_float(row.get("impliedVolatility"), default=0)
            if iv <= 0:
                continue

            greeks = compute_greeks(
                spot=current_price,
                strike=strike,
                iv=iv,
                dte=dte,
                strategy_type=strategy,
            )
            delta = greeks.get("delta")
            if delta is None:
                continue

            delta_abs = abs(delta)
            if delta_abs < max(0.05, delta_min - 0.04) or delta_abs > delta_max + 0.04:
                continue

            # For covered calls, avoid suggesting strikes below basis when possible.
            if strategy == "CC" and avg_cost is not None and strike < avg_cost:
                continue

            open_interest = int(_safe_float(row.get("openInterest"), default=0))
            volume = int(_safe_float(row.get("volume"), default=0))
            spread_pct = ((ask - bid) / mid * 100) if bid > 0 and ask > 0 and mid > 0 else None

            premium_yield = (mid / strike * 100) if strategy == "CSP" else (mid / current_price * 100)
            prob_otm = greeks.get("prob_otm")

            score = abs(delta_abs - delta_target) * 100
            score += abs(dte - target_dte) * 0.25
            if spread_pct is not None:
                score += spread_pct * 0.15
            score -= min(open_interest, 3000) / 600

            candidates.append(
                {
                    "symbol": symbol,
                    "strategy": strategy,
                    "expiry": expiry_str,
                    "dte": dte,
                    "strike": round(strike, 2),
                    "delta": round(delta, 3),
                    "mid": round(mid, 3),
                    "bid": round(bid, 3),
                    "ask": round(ask, 3),
                    "spread_pct": round(spread_pct, 1) if spread_pct is not None else None,
                    "open_interest": open_interest,
                    "volume": volume,
                    "prob_otm": round(prob_otm, 1) if prob_otm is not None else None,
                    "premium_yield_pct": round(premium_yield, 2),
                    "score": round(score, 3),
                }
            )

    if not candidates:
        notes.append("No contracts matched delta/DTE lane with acceptable data.")
        return {"candidates": [], "notes": notes}

    candidates.sort(key=lambda c: c["score"])
    shortlisted = candidates[:3]
    if strategy == "CC" and avg_cost is not None:
        notes.append(f"Filtered CC candidates below cost basis (${avg_cost:.2f}).")
    return {"candidates": shortlisted, "notes": notes}


def generate_symbol_wheel_guidance(symbol: str, session: Session) -> dict:
    spot = session.exec(select(Spot).where(Spot.symbol == symbol.upper())).first()
    if not spot:
        raise ValueError("Symbol not found")

    trades = session.exec(
        select(Trade).where(Trade.underlying_id == spot.id).order_by(Trade.opened_at.desc())
    ).all()
    open_trade = next((t for t in trades if t.status == TradeStatus.OPEN), None)

    lots = session.exec(select(ShareLot).where(ShareLot.underlying_id == spot.id)).all()
    shares_held = int(sum(l.remaining_qty for l in lots))
    total_cost = sum(float(l.cost_per_share) * l.remaining_qty for l in lots)
    avg_cost = (total_cost / shares_held) if shares_held > 0 else None

    try:
        current_price = _safe_float(yf.Ticker(symbol).fast_info.get("lastPrice"), default=0)
    except Exception:
        current_price = 0

    vix = _get_vix_regime()
    regime = vix.get("regime", "sideways")

    strategy = _pick_next_strategy(shares_held)
    setup = REGIME_RULES.get(regime, REGIME_RULES["sideways"])[strategy]
    dte_lo, dte_hi = setup["dte"]
    delta_lo, delta_hi = setup["delta_abs"]

    action = "sell_next"
    confidence = "medium"
    reasons = []
    blocking_flags = []

    if open_trade:
        action = "hold_or_manage_current"
        remaining_dte = max(0, open_trade.dte - open_trade.days_in_trade)
        reasons.append(
            f"{open_trade.strategy_type.value} expiring {open_trade.expiry_date} is still open; manage it before opening a new leg."
        )
        if remaining_dte <= 21:
            reasons.append(f"{remaining_dte} DTE left on open trade, which is inside your gamma-risk window.")

    if strategy == "CC":
        if shares_held < 100:
            blocking_flags.append("Need at least 100 shares to sell a covered call.")
        elif avg_cost is not None:
            reasons.append(f"For CC, prefer strikes at/above your basis (${avg_cost:.2f}).")
    else:
        reasons.append("For CSP, choose strikes where assignment would still be acceptable at your intended basis.")

    if current_price <= 0:
        blocking_flags.append("Current spot price unavailable, so candidate scoring may be incomplete.")

    if blocking_flags:
        confidence = "low"

    phase2 = {
        "candidates": [],
        "notes": ["Current price unavailable; cannot compute candidate contracts."],
    }
    if current_price > 0:
        phase2 = _build_phase2_candidates(
            symbol=symbol,
            current_price=current_price,
            strategy=strategy,
            setup={
                "dte_min": dte_lo,
                "dte_max": dte_hi,
                "delta_min_abs": delta_lo,
                "delta_max_abs": delta_hi,
            },
            avg_cost=avg_cost,
        )

    return {
        "symbol": symbol,
        "regime": vix,
        "context": {
            "shares_held": shares_held,
            "avg_cost": round(avg_cost, 2) if avg_cost is not None else None,
            "current_price": round(current_price, 2) if current_price else None,
            "open_trade_id": open_trade.id if open_trade else None,
            "open_trade_type": open_trade.strategy_type.value if open_trade else None,
            "open_trade_expiry": open_trade.expiry_date.isoformat() if open_trade else None,
        },
        "phase1": {
            "action": action,
            "next_strategy": strategy,
            "confidence": confidence,
            "reasons": reasons,
            "blocking_flags": blocking_flags,
            "setup": {
                "dte_min": dte_lo,
                "dte_max": dte_hi,
                "delta_min_abs": delta_lo,
                "delta_max_abs": delta_hi,
            },
        },
        "phase2": phase2,
    }