"""Deterministic wheel guidance engine for per-trade view."""

from __future__ import annotations

import math
from datetime import date, datetime

import yfinance as yf
from sqlmodel import Session, select

from models import ShareLot, Spot, StrategyType, Trade, TradeStatus
from models.market_event import MarketEvent
from models.spot import AssetType
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


def _get_spot_sentiment(symbol: str) -> dict:
    """Simple price-action sentiment from short and medium lookback windows."""
    try:
        hist = yf.Ticker(symbol).history(period="3mo")
        if hist.empty or len(hist) < 25:
            return {"label": "neutral", "score": 0, "r5": None, "r20": None}

        close = hist["Close"]
        r5 = ((float(close.iloc[-1]) / float(close.iloc[-6])) - 1.0) * 100 if len(close) >= 6 else 0
        r20 = ((float(close.iloc[-1]) / float(close.iloc[-21])) - 1.0) * 100 if len(close) >= 21 else 0

        score = 0
        if r20 > 3:
            score += 1
        elif r20 < -3:
            score -= 1
        if r5 > 1.5:
            score += 1
        elif r5 < -1.5:
            score -= 1

        if score >= 2:
            label = "bullish"
        elif score == 1:
            label = "improving"
        elif score <= -2:
            label = "bearish"
        elif score == -1:
            label = "weakening"
        else:
            label = "neutral"

        return {"label": label, "score": score, "r5": round(r5, 2), "r20": round(r20, 2)}
    except Exception:
        return {"label": "neutral", "score": 0, "r5": None, "r20": None}


def _candidate_liquidity_ok(candidate: dict) -> bool:
    spread = candidate.get("spread_pct")
    oi = int(candidate.get("open_interest") or 0)
    vol = int(candidate.get("volume") or 0)
    spread_ok = spread is None or spread <= 20
    oi_ok = oi >= 250
    vol_ok = vol >= 10
    return spread_ok and oi_ok and vol_ok


def _build_leg_guidance(
    strategy: str,
    candidates: list[dict],
    regime: str,
    sentiment: dict,
    shares_held: int,
    open_cc_contracts: int,
    avg_cost: float | None,
    current_price: float | None = None,
    upcoming_events: list[dict] | None = None,
) -> dict:
    rules = REGIME_RULES.get(regime, REGIME_RULES["sideways"])[strategy]
    dte_lo, dte_hi = rules["dte"]
    delta_lo, delta_hi = rules["delta_abs"]

    reasons = []
    flags = []

    if strategy == "CC":
        max_cc_contracts = shares_held // 100
        available_contracts = max(0, max_cc_contracts - open_cc_contracts)
        eligible = available_contracts > 0
        defensive_regime = regime in {"bear", "crisis"}
        underwater_vs_basis = (
            avg_cost is not None and current_price is not None and current_price < avg_cost
        )
        if not eligible:
            flags.append(
                f"No CC capacity left: {shares_held} shares support {max_cc_contracts} contract(s), already using {open_cc_contracts}."
            )
            recommendation = "not_available"
        elif defensive_regime and underwater_vs_basis:
            recommendation = "wait"
            flags.append(
                "Defensive rule: in bear/crisis while spot is below your basis, wait for a green day before selling new CCs."
            )
        else:
            best = candidates[0] if candidates else None
            if not best:
                recommendation = "wait"
                flags.append("No liquid CC contracts found in your regime lane.")
            else:
                if avg_cost is not None and best["strike"] < avg_cost:
                    recommendation = "wait"
                    flags.append(f"Best CC strike (${best['strike']:.2f}) is below your basis (${avg_cost:.2f}).")
                elif not _candidate_liquidity_ok(best):
                    recommendation = "wait"
                    flags.append("Liquidity is weak (spread/OI/volume) for top CC candidate.")
                else:
                    recommendation = "consider"
                    reasons.append("CC candidate has acceptable liquidity and fits your regime lane.")
                if regime == "bull" and sentiment.get("label") in {"bullish", "improving"}:
                    reasons.append("Bullish tape: use higher-call strikes to avoid capping upside too tightly.")
    else:
        # CSP: user asked to assume capital for 1 contract but be more selective.
        eligible = True
        available_contracts = 1
        best = candidates[0] if candidates else None
        if not best:
            recommendation = "wait"
            flags.append("No liquid CSP contracts found in your regime lane.")
        else:
            conservative_regime = regime in {"bear", "crisis"}
            sentiment_weak = sentiment.get("label") in {"bearish", "weakening"}
            liq_ok = _candidate_liquidity_ok(best)
            prob_ok = (best.get("prob_otm") or 0) >= 68
            # Keep CSP selectivity aligned with regime lane instead of a fixed delta cap.
            regime_csp_delta_cap = REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CSP"]["delta_abs"][1]
            delta_ok = abs(best.get("delta") or 0) <= (regime_csp_delta_cap + 0.02)
            yield_ok = (best.get("premium_yield_pct") or 0) >= 0.8

            if conservative_regime and sentiment_weak:
                recommendation = "wait"
                flags.append("Regime + sentiment are defensive. Stand down unless you strongly want assignment.")
            elif liq_ok and prob_ok and delta_ok and yield_ok:
                recommendation = "consider_small"
                reasons.append("CSP candidate is conservative enough on delta/probability/liquidity.")
            else:
                recommendation = "wait"
                flags.append("CSP setup is not defensive enough on liquidity/probability/delta/yield.")

    if strategy == "CC" and avg_cost is not None:
        reasons.append(f"Prefer strikes at/above basis (${avg_cost:.2f}).")

    # --- Event-aware flags for stocks ---
    if upcoming_events:
        best = candidates[0] if candidates else None
        dte_window = best["dte"] if best else dte_hi
        for ev in upcoming_events:
            days_away = (ev["date"] - date.today()).days
            if days_away < 0 or days_away > dte_window:
                continue
            if ev["type"] == "us_earnings":
                if strategy == "CSP":
                    flags.append(
                        f"⚠ Earnings on {ev['date'].strftime('%b %d')} ({days_away}d away) — stock could gap below your strike on a miss. Consider waiting until after earnings or widening your strike."
                    )
                else:
                    flags.append(
                        f"⚠ Earnings on {ev['date'].strftime('%b %d')} ({days_away}d away) — IV crush will help CC decay, but a big beat could gap above your strike. Consider selling after earnings or using a higher strike."
                    )
            elif ev["type"] == "us_ex_dividend":
                if strategy == "CC":
                    flags.append(
                        f"⚠ Ex-dividend on {ev['date'].strftime('%b %d')} ({days_away}d away) — if your CC is ITM, early assignment risk is elevated. The buyer may exercise to capture the dividend."
                    )
                else:
                    flags.append(
                        f"Ex-dividend on {ev['date'].strftime('%b %d')} ({days_away}d away) — stock will drop by the dividend amount, slightly favoring your CSP if strike is well below."
                    )

    return {
        "strategy": strategy,
        "eligible": eligible,
        "available_contracts": available_contracts,
        "recommendation": recommendation,
        "target": {
            "dte_min": dte_lo,
            "dte_max": dte_hi,
            "delta_min_abs": delta_lo,
            "delta_max_abs": delta_hi,
        },
        "reasons": reasons,
        "flags": flags,
        "candidates": candidates[:3],
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
    open_trades = [t for t in trades if t.status == TradeStatus.OPEN]
    open_trade = open_trades[0] if open_trades else None
    open_cc_contracts = int(
        sum(t.contracts for t in open_trades if t.strategy_type == StrategyType.CC)
    )
    open_csp_contracts = int(
        sum(t.contracts for t in open_trades if t.strategy_type == StrategyType.CSP)
    )

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
    sentiment = _get_spot_sentiment(symbol)

    # Fetch upcoming symbol events (earnings / ex-div) for stocks only
    upcoming_events: list[dict] = []
    if spot.asset_type != AssetType.ETF:
        today = date.today()
        ev_rows = session.exec(
            select(MarketEvent)
            .where(MarketEvent.symbol == symbol)
            .where(MarketEvent.event_date >= today)
            .where(MarketEvent.event_type.in_(["us_earnings", "us_ex_dividend"]))
            .order_by(MarketEvent.event_date)
        ).all()
        upcoming_events = [{"type": e.event_type, "date": e.event_date} for e in ev_rows]

    cc_candidates: list[dict] = []
    csp_candidates: list[dict] = []
    cc_notes: list[str] = []
    csp_notes: list[str] = []
    if current_price > 0:
        cc_res = _build_phase2_candidates(
            symbol=symbol,
            current_price=current_price,
            strategy="CC",
            setup={
                "dte_min": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CC"]["dte"][0],
                "dte_max": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CC"]["dte"][1],
                "delta_min_abs": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CC"]["delta_abs"][0],
                "delta_max_abs": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CC"]["delta_abs"][1],
            },
            avg_cost=avg_cost,
        )
        cc_candidates = cc_res.get("candidates", [])
        cc_notes = cc_res.get("notes", [])

        csp_res = _build_phase2_candidates(
            symbol=symbol,
            current_price=current_price,
            strategy="CSP",
            setup={
                "dte_min": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CSP"]["dte"][0],
                "dte_max": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CSP"]["dte"][1],
                "delta_min_abs": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CSP"]["delta_abs"][0],
                "delta_max_abs": REGIME_RULES.get(regime, REGIME_RULES["sideways"])["CSP"]["delta_abs"][1],
            },
            avg_cost=None,
        )
        csp_candidates = csp_res.get("candidates", [])
        csp_notes = csp_res.get("notes", [])

    cc_guidance = _build_leg_guidance(
        strategy="CC",
        candidates=cc_candidates,
        regime=regime,
        sentiment=sentiment,
        shares_held=shares_held,
        open_cc_contracts=open_cc_contracts,
        avg_cost=avg_cost,
        current_price=current_price if current_price > 0 else None,
        upcoming_events=upcoming_events,
    )
    csp_guidance = _build_leg_guidance(
        strategy="CSP",
        candidates=csp_candidates,
        regime=regime,
        sentiment=sentiment,
        shares_held=shares_held,
        open_cc_contracts=open_cc_contracts,
        avg_cost=avg_cost,
        upcoming_events=upcoming_events,
    )
    if cc_notes:
        cc_guidance["flags"].extend(cc_notes)
    if csp_notes:
        csp_guidance["flags"].extend(csp_notes)

    return {
        "symbol": symbol,
        "regime": vix,
        "sentiment": sentiment,
        "context": {
            "shares_held": shares_held,
            "avg_cost": round(avg_cost, 2) if avg_cost is not None else None,
            "current_price": round(current_price, 2) if current_price else None,
            "open_trade_id": open_trade.id if open_trade else None,
            "open_trade_type": open_trade.strategy_type.value if open_trade else None,
            "open_trade_expiry": open_trade.expiry_date.isoformat() if open_trade else None,
            "open_cc_contracts": open_cc_contracts,
            "open_csp_contracts": open_csp_contracts,
        },
        "cc": cc_guidance,
        "csp": csp_guidance,
    }