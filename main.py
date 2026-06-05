"""
main.py — Backend Dron Agrícola

MODELO 1 — SensorData (MPU6050):
  POST   /api/sensor-data          → Guardar lectura del MPU6050
  GET    /api/sensor-data          → Listar todos los registros
  GET    /api/sensor-data/{id}     → Un registro por ID
  GET    /api/sensor-data/buscar   → Buscar por número de disparo
  DELETE /api/sensor-data/{id}     → Eliminar un registro
  DELETE /api/sensor-data          → Eliminar todos los registros
  GET    /api/export-excel         → Descargar Excel con estadísticas

MODELO 2 — UsuarioDescarga (registros de descarga APK):
  POST   /api/usuarios             → Registrar usuario + iniciar descarga
  GET    /api/usuarios             → Listar todos los usuarios
  GET    /api/usuarios/{id}        → Un usuario por ID
  GET    /api/usuarios/buscar      → Buscar por nombre/departamento/puntuación
  GET    /api/usuarios/stats       → Estadísticas de descargas
  DELETE /api/usuarios/{id}        → Eliminar un usuario

SISTEMA:
  GET    /                         → Dashboard principal
  GET    /descargar                → Página formulario de descarga
  GET    /health                   → Health check para Render
"""

from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session
import os

from database import create_db_and_tables, get_session
from models import (
    SensorDataCreate, SensorDataRead,
    UsuarioDescargaCreate, UsuarioDescargaRead, UsuarioDescargaStats,
)
from operations_db import (
    create_sensor_data,
    get_all_sensor_data,
    get_sensor_data_by_id,
    get_sensor_data_by_disparo,
    delete_sensor_data,
    delete_all_sensor_data,
    create_usuario_descarga,
    get_all_usuarios,
    get_usuario_by_id,
    search_usuarios,
    delete_usuario,
    get_stats_descargas,
)
from export import generate_excel


# ─── Ciclo de vida ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="Dron Agrícola API",
    description=(
        "Backend para registrar datos del MPU6050 y gestionar "
        "usuarios que descargan la app de control del dron agrícola."
    ),
    version="2.0.0",
    lifespan=lifespan,
)


# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dron-agricola-api-3.onrender.com","https://jeffbejarano.dpdns.org",],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Archivos estáticos ───────────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# =============================================================================
# SISTEMA
# =============================================================================

@app.get("/health", tags=["Sistema"])
def health_check():
    """Render usa este endpoint para verificar que el servicio está activo."""
    return {"status": "ok", "message": "Dron Agrícola API v2.0 funcionando"}


@app.get("/", tags=["Sistema"])
def root():
    """Sirve el dashboard principal."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Dron Agrícola API. Ve a /docs para la documentación."}


@app.get("/descargar", tags=["Sistema"])
def pagina_descarga():
    """
    Página de registro antes de descargar la APK.
    El usuario llena nombre, edad, departamento y puntuación con estrellas.
    """
    descarga_path = os.path.join(static_dir, "descarga.html")
    if os.path.isfile(descarga_path):
        return FileResponse(descarga_path)
    raise HTTPException(status_code=404, detail="Página de descarga no encontrada")


# =============================================================================
# MODELO 1 — Sensor Data (MPU6050)
# =============================================================================

@app.post(
    "/api/sensor-data",
    response_model=SensorDataRead,
    status_code=201,
    tags=["Sensor MPU6050"],
)
def save_sensor_data(
    data: SensorDataCreate,
    session: Session = Depends(get_session),
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


@app.get(
    "/api/sensor-data",
    response_model=List[SensorDataRead],
    tags=["Sensor MPU6050"],
)
def list_sensor_data(session: Session = Depends(get_session)):
    """Retorna todos los registros del sensor ordenados por timestamp."""
    return get_all_sensor_data(session)


@app.get(
    "/api/sensor-data/buscar",
    response_model=List[SensorDataRead],
    tags=["Sensor MPU6050"],
)
def buscar_sensor_por_disparo(
    disparo: int = Query(..., description="Número de disparo a buscar"),
    session: Session = Depends(get_session),
):
    """Busca registros del sensor por número de disparo."""
    results = get_sensor_data_by_disparo(session, disparo)
    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontraron registros con disparo={disparo}",
        )
    return results


@app.get(
    "/api/sensor-data/{data_id}",
    response_model=SensorDataRead,
    tags=["Sensor MPU6050"],
)
def get_one_sensor_data(data_id: int, session: Session = Depends(get_session)):
    """Retorna un registro por su ID."""
    record = get_sensor_data_by_id(session, data_id)
    if not record:
        raise HTTPException(
            status_code=404, detail=f"Registro {data_id} no encontrado"
        )
    return record


@app.delete(
    "/api/sensor-data/{data_id}",
    response_model=SensorDataRead,
    tags=["Sensor MPU6050"],
)
def remove_sensor_data(data_id: int, session: Session = Depends(get_session)):
    """Elimina un registro por su ID."""
    deleted = delete_sensor_data(session, data_id)
    if not deleted:
        raise HTTPException(
            status_code=404, detail=f"Registro {data_id} no encontrado"
        )
    return deleted


@app.delete("/api/sensor-data", tags=["Sensor MPU6050"])
def remove_all_data(session: Session = Depends(get_session)):
    """⚠️ Elimina TODOS los registros del sensor. Úsalo con cuidado."""
    count = delete_all_sensor_data(session)
    return {"message": f"{count} registros eliminados"}


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
        raise HTTPException(
            status_code=404,
            detail="No hay datos para exportar. Registra mediciones primero.",
        )
    excel_bytes = generate_excel(records)
    return Response(
        content=excel_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": "attachment; filename=dron_agricola_datos.xlsx"
        },
    )


# =============================================================================
# MODELO 2 — UsuarioDescarga (registro de personas que descargan la APK)
# =============================================================================

@app.post(
    "/api/usuarios",
    response_model=UsuarioDescargaRead,
    status_code=201,
    tags=["Usuarios Descarga"],
)
def registrar_usuario(
    data: UsuarioDescargaCreate,
    request: Request,
    session: Session = Depends(get_session),
):
    """
    Registra los datos del usuario antes de permitir la descarga de la APK.
    Valida nombre, edad, departamento y puntuación (1-5 estrellas).

    Body de ejemplo:
    ```json
    {
      "nombre": "Carlos Pérez",
      "edad": 28,
      "departamento": "Antioquia",
      "puntuacion": 5,
      "comentario": "Excelente proyecto"
    }
    ```
    """
    from models import DEPARTAMENTOS_COLOMBIA
    if data.departamento not in DEPARTAMENTOS_COLOMBIA:
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{data.departamento}' no es un departamento válido de Colombia. "
                f"Usa uno de los 32 departamentos o San Andrés."
            ),
        )
    ip = request.client.host if request.client else None
    return create_usuario_descarga(session, data, ip_address=ip)


@app.get(
    "/api/usuarios",
    response_model=List[UsuarioDescargaRead],
    tags=["Usuarios Descarga"],
)
def listar_usuarios(session: Session = Depends(get_session)):
    """Retorna todos los usuarios registrados, del más reciente al más antiguo."""
    return get_all_usuarios(session)


# ⚠️  IMPORTANTE: /stats y /buscar deben ir ANTES de /{usuario_id}
# FastAPI evalúa rutas en orden de declaración; si /{usuario_id} va primero,
# intenta convertir "stats" o "buscar" a int y devuelve 422.

@app.get(
    "/api/usuarios/stats",
    response_model=UsuarioDescargaStats,
    tags=["Usuarios Descarga"],
)
def estadisticas_descargas(session: Session = Depends(get_session)):
    """
    Retorna estadísticas agregadas:
    - total de descargas
    - puntuación promedio
    - departamento con más descargas
    - edad promedio
    """
    return get_stats_descargas(session)


@app.get(
    "/api/usuarios/buscar",
    response_model=List[UsuarioDescargaRead],
    tags=["Usuarios Descarga"],
)
def buscar_usuarios(
    nombre: Optional[str] = Query(None, description="Buscar por nombre (parcial)"),
    departamento: Optional[str] = Query(None, description="Filtrar por departamento"),
    puntuacion_min: Optional[int] = Query(
        None, ge=1, le=5, description="Puntuación mínima (1-5)"
    ),
    session: Session = Depends(get_session),
):
    """
    Búsqueda de usuarios con filtros combinables:
    - nombre (búsqueda parcial)
    - departamento (búsqueda parcial)
    - puntuacion_min (filtra >= valor)
    """
    return search_usuarios(session, nombre, departamento, puntuacion_min)


# Rutas con parámetro dinámico van SIEMPRE al final del grupo
@app.get(
    "/api/usuarios/{usuario_id}",
    response_model=UsuarioDescargaRead,
    tags=["Usuarios Descarga"],
)
def get_usuario(usuario_id: int, session: Session = Depends(get_session)):
    """Retorna un usuario por su ID."""
    usuario = get_usuario_by_id(session, usuario_id)
    if not usuario:
        raise HTTPException(
            status_code=404, detail=f"Usuario {usuario_id} no encontrado"
        )
    return usuario


@app.delete(
    "/api/usuarios/{usuario_id}",
    response_model=UsuarioDescargaRead,
    tags=["Usuarios Descarga"],
)
def eliminar_usuario(usuario_id: int, session: Session = Depends(get_session)):
    """Elimina el registro de un usuario por su ID."""
    deleted = delete_usuario(session, usuario_id)
    if not deleted:
        raise HTTPException(
            status_code=404, detail=f"Usuario {usuario_id} no encontrado"
        )
    return deleted

# =============================================================================
# APK DOWNLOADS COUNTER
# Cuenta las descargas usando la tabla UsuarioDescarga como fuente de verdad.
# GET  /api/apk-downloads  → retorna el total actual
# POST /api/apk-downloads  → registra +1 descarga anónima y retorna el total
# =============================================================================

@app.get("/api/apk-downloads", tags=["Sistema"])
def get_apk_downloads(session: Session = Depends(get_session)):
    """Retorna el número total de descargas registradas de la APK."""
    from sqlmodel import select, func
    total = session.exec(
        select(func.count()).select_from(__import__('models').UsuarioDescarga)
    ).one()
    return {"count": total}


@app.post("/api/apk-downloads", tags=["Sistema"])
def register_apk_download(session: Session = Depends(get_session)):
    """
    Registra una descarga anónima de la APK (sin datos de usuario).
    El conteo real viene de la tabla UsuarioDescarga.
    Este endpoint solo retorna el total actualizado.
    """
    from sqlmodel import select, func
    total = session.exec(
        select(func.count()).select_from(__import__('models').UsuarioDescarga)
    ).one()
    return {"count": total}