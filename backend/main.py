"""
main.py — Backend Dron Agrícola
Endpoints:
  POST /api/sensor-data       → Guardar lectura del MPU6050
  GET  /api/sensor-data       → Listar todos los registros
  GET  /api/sensor-data/{id}  → Un registro por ID
  GET  /api/export-excel      → Descargar Excel con estadísticas
  DELETE /api/sensor-data/{id}→ Eliminar un registro
  DELETE /api/sensor-data     → Eliminar todos los registros
  GET  /                      → Sirve el dashboard HTML
  GET  /health                → Health check para Render
"""
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session
import os

from database import create_db_and_tables, get_session
from models import SensorDataCreate, SensorDataRead
from operations_db import (
    create_sensor_data,
    get_all_sensor_data,
    get_sensor_data_by_id,
    delete_sensor_data,
    delete_all_sensor_data,
)
from export import generate_excel


# ─── Ciclo de vida ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="Dron Agrícola API",
    description="Backend para registrar y analizar datos del MPU6050 del dron.",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS (permite peticiones desde la app Android y el frontend) ─────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # En producción reemplaza con tu dominio de Render
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Servir archivos estáticos (dashboard HTML) ───────────────────────────────
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/health", tags=["Sistema"])
def health_check():
    """Render usa este endpoint para verificar que el servicio está activo."""
    return {"status": "ok", "message": "Dron Agrícola API funcionando"}


@app.get("/", tags=["Sistema"])
def root():
    """Sirve el dashboard principal."""
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
      "gyro_x": 0.055, "gyro_y": 0.110, "gyro_z": 0.165
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
    - Hoja 1: Datos crudos del sensor
    - Hoja 2: Estadística descriptiva + gráfico de barras
    - Hoja 3: Distribución de frecuencias + histogramas + dispersión
    """
    records = get_all_sensor_data(session)
    if not records:
        raise HTTPException(status_code=404,
                            detail="No hay datos para exportar. Registra mediciones primero.")

    excel_bytes = generate_excel(records)

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dron_agricola_datos.xlsx"},
    )
