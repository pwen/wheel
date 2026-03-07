from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class MarketFlash(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    flash_date: date = Field(unique=True, index=True)
    markdown: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
