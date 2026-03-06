import os

from sqlmodel import SQLModel, Session, create_engine

_db_url = os.environ.get(
    "DATABASE_URL",
    "postgresql://wheel:wheel@localhost:5432/wheel",
)
# Railway uses postgres:// but SQLAlchemy needs postgresql://
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(_db_url, echo=False)


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
