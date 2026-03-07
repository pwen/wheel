from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from db import get_session
from models import Trade, TradeStatus, Spot

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats")
def dashboard_stats(session: Session = Depends(get_session)):
    trades = session.exec(select(Trade)).all()

    # Build symbol lookup
    spot_ids = {t.underlying_id for t in trades}
    spots = {s.id: s.symbol for s in session.exec(select(Spot).where(Spot.id.in_(spot_ids))).all()} if spot_ids else {}

    open_trades = [t for t in trades if t.status == TradeStatus.OPEN]
    closed_trades = [t for t in trades if t.status != TradeStatus.OPEN]

    # --- Performance ---
    total_premium = sum(float(t.total_premium) for t in trades)
    total_closing_cost = sum(float(t.closing_cost or 0) for t in closed_trades)
    total_realized_pl = sum(float(t.realized_pl) for t in closed_trades if t.realized_pl is not None)

    wins = sum(1 for t in closed_trades if t.realized_pl is not None and t.realized_pl >= 0)
    losses = sum(1 for t in closed_trades if t.realized_pl is not None and t.realized_pl < 0)
    win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else None

    avg_days = None
    if closed_trades:
        avg_days = round(sum(t.days_in_trade for t in closed_trades) / len(closed_trades), 1)

    avg_pl_per_trade = total_realized_pl / len(closed_trades) if closed_trades else None

    # --- Current Exposure ---
    capital_deployed = sum(
        float(t.strike) * t.contracts * t.multiplier
        for t in open_trades if t.strategy_type.value == "CSP"
    )

    # --- P/L by Symbol ---
    by_symbol = defaultdict(lambda: {"premium": 0, "realized_pl": 0, "count": 0, "wins": 0, "losses": 0})
    for t in trades:
        sym = spots.get(t.underlying_id, "?")
        by_symbol[sym]["premium"] += float(t.total_premium)
        by_symbol[sym]["count"] += 1
        if t.realized_pl is not None:
            by_symbol[sym]["realized_pl"] += float(t.realized_pl)
            if t.realized_pl >= 0:
                by_symbol[sym]["wins"] += 1
            else:
                by_symbol[sym]["losses"] += 1

    symbol_breakdown = [
        {"symbol": sym, **data}
        for sym, data in sorted(by_symbol.items(), key=lambda x: x[1]["realized_pl"], reverse=True)
    ]

    # --- P/L by Month ---
    by_month = defaultdict(lambda: {"premium": 0, "realized_pl": 0, "opened": 0, "closed": 0})
    for t in trades:
        open_key = t.opened_at.strftime("%Y-%m")
        by_month[open_key]["premium"] += float(t.total_premium)
        by_month[open_key]["opened"] += 1

    for t in closed_trades:
        if t.closed_at:
            close_key = t.closed_at.strftime("%Y-%m")
            if t.realized_pl is not None:
                by_month[close_key]["realized_pl"] += float(t.realized_pl)
            by_month[close_key]["closed"] += 1

    month_breakdown = [
        {"month": m, **data}
        for m, data in sorted(by_month.items())
    ]

    # --- By Strategy Type ---
    csp_trades = [t for t in trades if t.strategy_type.value == "CSP"]
    cc_trades = [t for t in trades if t.strategy_type.value == "CC"]

    def strat_stats(subset):
        closed = [t for t in subset if t.status != TradeStatus.OPEN]
        pl = sum(float(t.realized_pl) for t in closed if t.realized_pl is not None)
        w = sum(1 for t in closed if t.realized_pl is not None and t.realized_pl >= 0)
        l = sum(1 for t in closed if t.realized_pl is not None and t.realized_pl < 0)
        return {
            "count": len(subset),
            "open": len([t for t in subset if t.status == TradeStatus.OPEN]),
            "premium": sum(float(t.total_premium) for t in subset),
            "realized_pl": pl,
            "win_rate": (w / (w + l) * 100) if (w + l) > 0 else None,
        }

    return {
        "performance": {
            "total_premium": round(total_premium, 2),
            "total_realized_pl": round(total_realized_pl, 2),
            "total_trades": len(trades),
            "open_trades": len(open_trades),
            "closed_trades": len(closed_trades),
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 1) if win_rate is not None else None,
            "avg_days_in_trade": avg_days,
            "avg_pl_per_trade": round(avg_pl_per_trade, 2) if avg_pl_per_trade is not None else None,
            "capital_deployed": round(capital_deployed, 2),
        },
        "by_strategy": {
            "CSP": strat_stats(csp_trades),
            "CC": strat_stats(cc_trades),
        },
        "by_symbol": symbol_breakdown,
        "by_month": month_breakdown,
    }
