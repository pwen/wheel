from decimal import Decimal
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import ShareLot, LotSource, Spot

router = APIRouter(tags=["lots"])


class LotCreate(BaseModel):
    symbol: str
    qty: int
    cost_per_share: Decimal
    acquired_at: date
    source: LotSource = LotSource.PURCHASE


class LotUpdate(BaseModel):
    qty: Optional[int] = None
    remaining_qty: Optional[int] = None
    cost_per_share: Optional[Decimal] = None
    acquired_at: Optional[date] = None


def _lot_to_dict(lot: ShareLot, session: Session) -> dict:
    d = lot.model_dump()
    spot = session.get(Spot, lot.underlying_id)
    d["symbol"] = spot.symbol if spot else "?"
    return d


@router.get("/lots")
def list_lots(session: Session = Depends(get_session)):
    lots = session.exec(
        select(ShareLot).order_by(ShareLot.acquired_at.desc())
    ).all()
    return [_lot_to_dict(lot, session) for lot in lots]


@router.post("/lots", status_code=201)
def create_lot(body: LotCreate, session: Session = Depends(get_session)):
    symbol = body.symbol.upper()
    spot = session.exec(select(Spot).where(Spot.symbol == symbol)).first()
    if not spot:
        spot = Spot(symbol=symbol)
        session.add(spot)
        session.commit()
        session.refresh(spot)

    lot = ShareLot(
        underlying_id=spot.id,
        qty=body.qty,
        remaining_qty=body.qty,
        cost_per_share=body.cost_per_share,
        acquired_at=body.acquired_at,
        source=body.source,
    )
    session.add(lot)
    session.commit()
    session.refresh(lot)
    return _lot_to_dict(lot, session)


@router.patch("/lots/{lot_id}")
def update_lot(lot_id: int, body: LotUpdate, session: Session = Depends(get_session)):
    lot = session.get(ShareLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    for field in ["qty", "remaining_qty", "cost_per_share", "acquired_at"]:
        val = getattr(body, field)
        if val is not None:
            setattr(lot, field, val)

    session.commit()
    session.refresh(lot)
    return _lot_to_dict(lot, session)


@router.delete("/lots/{lot_id}", status_code=204)
def delete_lot(lot_id: int, session: Session = Depends(get_session)):
    lot = session.get(ShareLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    session.delete(lot)
    session.commit()
