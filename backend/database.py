import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    # Solo para pruebas locales sin configurar Neon todavía
    print("⚠️  DATABASE_URL no definida — usando SQLite local")
    DATABASE_URL = "sqlite:///./dron_local.db"
    connect_args = {"check_same_thread": False}
else:
    # Neon entrega "postgresql://..." — SQLAlchemy necesita el driver explícito
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://")
    connect_args = {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session