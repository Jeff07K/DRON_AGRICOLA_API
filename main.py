"""
main.py — Backend Dron Agrícola
Jeffrey Bejarano — 67001609 · Universidad Católica de Colombia · 2026-1

Endpoints:
  POST /api/sensor-data          → Guardar lectura del MPU6050
  GET  /api/sensor-data          → Listar todos los registros
  GET  /api/sensor-data/{id}     → Un registro por ID
  GET  /api/export-excel         → Descargar Excel con estadísticas completas
  DELETE /api/sensor-data/{id}   → Eliminar un registro
  DELETE /api/sensor-data        → Eliminar todos los registros
  GET  /api/apk-downloads        → Consultar contador de descargas APK
  POST /api/apk-downloads        → Incrementar contador de descargas APK
  GET  /                         → Sirve el dashboard HTML
  GET  /health                   → Health check para Render
"""

from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, SQLModel, Field, select, create_engine
import os

from database import create_db_and_tables, get_session, engine
from models import SensorDataCreate, SensorDataRead
from operations_db import (
    create_sensor_data,
    get_all_sensor_data,
    get_sensor_data_by_id,
    delete_sensor_data,
    delete_all_sensor_data,
)
from export import generate_excel

# ─── Modelo para el contador APK ──────────────────────────────────────────────
class ApkDownloadCounter(SQLModel, table=True):
    """Tabla de un solo registro para contar descargas del APK."""
    id: int = Field(default=1, primary_key=True)
    count: int = Field(default=0)


# ─── Ciclo de vida ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    # Crear tabla del contador si no existe
    SQLModel.metadata.create_all(engine, tables=[ApkDownloadCounter.__table__])
    # Inicializar el registro si no existe
    with Session(engine) as session:
        existing = session.get(ApkDownloadCounter, 1)
        if not existing:
            session.add(ApkDownloadCounter(id=1, count=0))
            session.commit()
    yield


app = FastAPI(
    title="Dron Agrícola API",
    description=(
        "Backend para sistema robótico de reforestación inspirado en Da Vinci. "
        "Registra y analiza datos del MPU6050. "
        "Jeffrey Bejarano — 67001609 · Universidad Católica de Colombia · 2026-1"
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Archivos estáticos ───────────────────────────────────────────────────────
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/health", tags=["Sistema"])
def health_check():
    """Render usa este endpoint para verificar que el servicio está activo."""
    return {"status": "ok", "message": "Dron Agrícola API v2 funcionando"}


@app.get("/", tags=["Sistema"])
def root():
    """Sirve el dashboard principal (static/index.html)."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Dron Agrícola API. Ve a /docs para la documentación."}


# ─── Sensor Data ─────────────────────────────────────────────────────────────

@app.post("/api/sensor-data", response_model=SensorDataRead,
          status_code=201, tags=["Sensor"])
def save_sensor_data(
    data: SensorDataCreate,
    session: Session = Depends(get_session)
):
    """
    Recibe una lectura del MPU6050 desde la app Android y la guarda en BD.

    Body de ejemplo:
    ```json
    {
      "disparo": 1,
      "accel_x": 0.55, "accel_y": 1.10, "accel_z": 9.74,
      "gyro_x": -8.5,  "gyro_y": 0.9,   "gyro_z": 4.2
    }
    ```
    """
    return create_sensor_data(session, data)


@app.get("/api/sensor-data", response_model=List[SensorDataRead],
         tags=["Sensor"])
def list_sensor_data(session: Session = Depends(get_session)):
    """Retorna todos los registros del sensor ordenados por timestamp."""
    return get_all_sensor_data(session)


@app.get("/api/sensor-data/{data_id}", response_model=SensorDataRead,
         tags=["Sensor"])
def get_one_sensor_data(data_id: int, session: Session = Depends(get_session)):
    """Retorna un registro por su ID."""
    record = get_sensor_data_by_id(session, data_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Registro {data_id} no encontrado")
    return record


@app.delete("/api/sensor-data/{data_id}", response_model=SensorDataRead,
            tags=["Sensor"])
def remove_sensor_data(data_id: int, session: Session = Depends(get_session)):
    """Elimina un registro por su ID."""
    deleted = delete_sensor_data(session, data_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Registro {data_id} no encontrado")
    return deleted


@app.delete("/api/sensor-data", tags=["Sensor"])
def remove_all_data(session: Session = Depends(get_session)):
    """⚠️ Elimina TODOS los registros del sensor. Úsalo con cuidado."""
    count = delete_all_sensor_data(session)
    return {"message": f"{count} registros eliminados"}


# ─── Exportar Excel ──────────────────────────────────────────────────────────

@app.get("/api/export-excel", tags=["Exportar"])
def export_to_excel(session: Session = Depends(get_session)):
    """
    Genera y descarga un archivo Excel (.xlsx) con:
    - Hoja 1: Datos crudos del sensor (con unidades correctas)
    - Hoja 2: Estadística descriptiva completa (media, varianza, desv.est, Q1, mediana, Q3, IQR, CV)
    - Hoja 3: Correlación de Pearson entre todos los pares de ejes + p-values
    - Hoja 4: Regresión lineal (Accel X → Accel Y, Gyro X → Gyro Z, Accel Z → Gyro X)
    - Hoja 5: Distribución de frecuencias con bins reales para todos los 6 ejes
    """
    records = get_all_sensor_data(session)
    if not records:
        raise HTTPException(
            status_code=404,
            detail="No hay datos para exportar. Registra mediciones primero."
        )
    excel_bytes = generate_excel(records)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dron_agricola_datos.xlsx"},
    )


# ─── Contador de descargas APK ────────────────────────────────────────────────

@app.get("/api/apk-downloads", tags=["APK"])
def get_apk_downloads(session: Session = Depends(get_session)):
    """Retorna el número total de descargas del APK registradas en la BD."""
    record = session.get(ApkDownloadCounter, 1)
    return {"count": record.count if record else 0}


@app.post("/api/apk-downloads", tags=["APK"])
def increment_apk_downloads(session: Session = Depends(get_session)):
    """
    Incrementa el contador global de descargas del APK en +1.
    Llamado automáticamente por el dashboard cuando alguien hace clic en 'Descargar APK'.
    """
    record = session.get(ApkDownloadCounter, 1)
    if not record:
        record = ApkDownloadCounter(id=1, count=1)
        session.add(record)
    else:
        record.count += 1
    session.commit()
    session.refresh(record)
    return {"count": record.count, "message": f"Descarga #{record.count} registrada"}