import os
from sqlmodel import SQLModel, create_engine, Session

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE BASE DE DATOS
#
# • Desarrollo local  → SQLite (archivo dron.db en el proyecto)
# • Producción Render → Clever Cloud MySQL (variable de entorno DATABASE_URL)
#
# En Render, ve a Dashboard > tu servicio > Environment > Add Variable:
#   DATABASE_URL = mysql+pymysql://usuario:password@host:puerto/nombre_db
#
# Si DATABASE_URL no está definida, usa SQLite automáticamente.
# ─────────────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dron.db")

# SQLite necesita este argumento extra; MySQL no lo usa
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables():
    """Crea todas las tablas definidas en los modelos SQLModel."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Generador de sesión para inyección de dependencias en FastAPI."""
    with Session(engine) as session:
        yield session
