from decimal import Decimal
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from db import get_session
from models import Spot

router = APIRouter(tags=["spots"])


class SpotCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    asset_type: Optional[str] = None
    is_etf: bool = False
    notes: Optional[str] = None


@router.get("/spots")
def list_spots(session: Session = Depends(get_session)):
    return session.exec(select(Spot).order_by(Spot.symbol)).all()


@router.post("/spots", status_code=201)
def create_spot(body: SpotCreate, session: Session = Depends(get_session)):
    spot = Spot(**body.model_dump())
    spot.symbol = spot.symbol.upper()
    session.add(spot)
    session.commit()
    session.refresh(spot)
    return spot


@router.get("/spots/{spot_id}")
def get_spot(spot_id: int, session: Session = Depends(get_session)):
    spot = session.get(Spot, spot_id)
    if not spot:
        raise HTTPException(404, "Spot not found")
    return spot
