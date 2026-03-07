import json
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from db import get_session
from models import Pairing, PairingRole, Spot, ShareLot, Trade, TradeStatus

router = APIRouter(tags=["pairings"])

SEED_PATH = Path(__file__).resolve().parent.parent / "services" / "pairings_seed.json"


# ---- CRUD ----

@router.get("/pairings")
def list_pairings(session: Session = Depends(get_session)):
    rows = session.exec(select(Pairing).order_by(Pairing.asset_class, Pairing.role)).all()
    return [r.model_dump() for r in rows]


# ---- Reset from seed JSON ----

@router.post("/pairings/reset")
def reset_pairings(session: Session = Depends(get_session)):
    """Drop all pairings and re-seed from JSON."""
    existing = session.exec(select(Pairing)).all()
    deleted = len(existing)
    for p in existing:
        session.delete(p)
    session.flush()

    data = json.loads(SEED_PATH.read_text())
    added = 0
    for entry in data["pairings"]:
        ac = entry["asset_class"]
        group = entry.get("group")
        for role_key in ("core", "proxy"):
            for item in entry.get(role_key, []):
                p = Pairing(
                    asset_class=ac,
                    group=group,
                    symbol=item["symbol"],
                    role=PairingRole(role_key),
                    note=item.get("note"),
                )
                session.add(p)
                added += 1

    session.commit()
    return {"deleted": deleted, "seeded": added}


# ---- Grouped view for allocations ----

@router.get("/pairings/grouped")
def grouped_pairings(session: Session = Depends(get_session)):
    """Return pairings grouped by asset_class with core/proxy split."""
    rows = session.exec(select(Pairing).order_by(Pairing.asset_class, Pairing.role)).all()

    groups = {}
    for p in rows:
        if p.asset_class not in groups:
            groups[p.asset_class] = {
                "asset_class": p.asset_class,
                "group": p.group,
                "target_pct": None,
                "core": [],
                "proxy": [],
            }
        entry = {"symbol": p.symbol, "note": p.note, "id": p.id}
        groups[p.asset_class][p.role].append(entry)
        if p.target_pct is not None:
            groups[p.asset_class]["target_pct"] = float(p.target_pct)

    return list(groups.values())


# ---- Allocations analysis ----

@router.get("/allocations")
def allocations(session: Session = Depends(get_session)):
    """
    Per-asset-class allocation breakdown:
    - core/proxy symbols, shares, market value
    - actual % of portfolio
    - target % and drift
    - whether wheel trades are active on proxies
    """
    # 1. Load all pairings grouped by asset class
    pairings = session.exec(select(Pairing)).all()
    if not pairings:
        return {"asset_classes": [], "total_value": 0}

    # Build asset_class → {core_symbols, proxy_symbols, group, target_pct}
    ac_map = {}
    symbol_to_acs = {}  # symbol → set of asset classes it belongs to
    for p in pairings:
        if p.asset_class not in ac_map:
            ac_map[p.asset_class] = {
                "group": p.group,
                "target_pct": None,
                "core_symbols": set(),
                "proxy_symbols": set(),
            }
        if p.role == PairingRole.CORE:
            ac_map[p.asset_class]["core_symbols"].add(p.symbol)
        else:
            ac_map[p.asset_class]["proxy_symbols"].add(p.symbol)
        if p.target_pct is not None:
            ac_map[p.asset_class]["target_pct"] = float(p.target_pct)
        symbol_to_acs.setdefault(p.symbol, set()).add(p.asset_class)

    # 2. Load all spots + lots to compute shares per symbol
    all_symbols = set()
    for info in ac_map.values():
        all_symbols |= info["core_symbols"] | info["proxy_symbols"]

    spots = session.exec(select(Spot).where(Spot.symbol.in_(all_symbols))).all()
    spot_by_symbol = {s.symbol: s for s in spots}
    id_to_symbol = {s.id: s.symbol for s in spots}
    spot_ids = set(id_to_symbol.keys())

    lots = session.exec(select(ShareLot).where(ShareLot.underlying_id.in_(spot_ids))).all()
    shares_by_symbol = {}
    cost_by_symbol = {}
    for lot in lots:
        sym = id_to_symbol.get(lot.underlying_id)
        if not sym:
            continue
        qty = lot.remaining_qty if lot.remaining_qty is not None else lot.qty
        shares_by_symbol[sym] = shares_by_symbol.get(sym, 0) + qty
        cost_by_symbol[sym] = cost_by_symbol.get(sym, 0) + qty * float(lot.cost_per_share)

    # 3. Check for active wheel trades on proxy symbols
    active_proxy_symbols = set()
    all_proxy_syms = {sym for info in ac_map.values() for sym in info["proxy_symbols"]}
    proxy_spot_ids = {sid for sid, sym in id_to_symbol.items() if sym in all_proxy_syms}
    if proxy_spot_ids:
        open_trades = session.exec(
            select(Trade).where(
                Trade.underlying_id.in_(proxy_spot_ids),
                Trade.status == TradeStatus.OPEN,
            )
        ).all()
        for t in open_trades:
            sym = id_to_symbol.get(t.underlying_id)
            if sym:
                active_proxy_symbols.add(sym)

    # 4. Build response (prices will be fetched client-side to keep this fast)
    asset_classes = []
    for ac_name, info in sorted(ac_map.items()):
        core_entries = []
        for sym in sorted(info["core_symbols"]):
            core_entries.append({
                "symbol": sym,
                "shares": shares_by_symbol.get(sym, 0),
                "cost_basis": round(cost_by_symbol.get(sym, 0), 2),
            })

        proxy_entries = []
        for sym in sorted(info["proxy_symbols"]):
            proxy_entries.append({
                "symbol": sym,
                "shares": shares_by_symbol.get(sym, 0),
                "cost_basis": round(cost_by_symbol.get(sym, 0), 2),
                "has_active_trades": sym in active_proxy_symbols,
            })

        asset_classes.append({
            "asset_class": ac_name,
            "group": info["group"],
            "target_pct": info["target_pct"],
            "core": core_entries,
            "proxy": proxy_entries,
        })

    return {"asset_classes": asset_classes}
