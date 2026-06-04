from sqlmodel import Session, select, func
from typing import List, Optional
from models import (
    SensorData, SensorDataCreate,
    UsuarioDescarga, UsuarioDescargaCreate, UsuarioDescargaStats,
)


# ════════════════════════════════════════════════
#  CRUD — SensorData (MPU6050)
# ════════════════════════════════════════════════

def create_sensor_data(session: Session, data: SensorDataCreate) -> SensorData:
    """Guarda un registro de sensor en la base de datos."""
    db_data = SensorData.model_validate(data)
    session.add(db_data)
    session.commit()
    session.refresh(db_data)
    return db_data


def get_all_sensor_data(session: Session) -> List[SensorData]:
    """Retorna todos los registros ordenados por timestamp."""
    statement = select(SensorData).order_by(SensorData.timestamp)
    return session.exec(statement).all()


def get_sensor_data_by_id(session: Session, data_id: int) -> Optional[SensorData]:
    """Retorna un registro por su ID."""
    return session.get(SensorData, data_id)


def get_sensor_data_by_disparo(session: Session, disparo: int) -> List[SensorData]:
    """Retorna todos los registros de un número de disparo."""
    statement = select(SensorData).where(SensorData.disparo == disparo)
    return session.exec(statement).all()


def delete_sensor_data(session: Session, data_id: int) -> Optional[SensorData]:
    """Elimina un registro por su ID."""
    data = session.get(SensorData, data_id)
    if not data:
        return None
    session.delete(data)
    session.commit()
    return data


def delete_all_sensor_data(session: Session) -> int:
    """Elimina todos los registros. Retorna el número de filas eliminadas."""
    results = session.exec(select(SensorData)).all()
    count = len(results)
    for item in results:
        session.delete(item)
    session.commit()
    return count


# ════════════════════════════════════════════════
#  CRUD — UsuarioDescarga (registro de descargas APK)
# ════════════════════════════════════════════════

def create_usuario_descarga(
    session: Session,
    data: UsuarioDescargaCreate,
    ip_address: Optional[str] = None,
) -> UsuarioDescarga:
    """Registra a un usuario que solicita descargar la APK."""
    db_usuario = UsuarioDescarga.model_validate(data)
    db_usuario.ip_address = ip_address
    session.add(db_usuario)
    session.commit()
    session.refresh(db_usuario)
    return db_usuario


def get_all_usuarios(session: Session) -> List[UsuarioDescarga]:
    """Retorna todos los usuarios registrados ordenados por fecha."""
    statement = select(UsuarioDescarga).order_by(UsuarioDescarga.timestamp.desc())
    return session.exec(statement).all()


def get_usuario_by_id(session: Session, usuario_id: int) -> Optional[UsuarioDescarga]:
    """Retorna un usuario por su ID."""
    return session.get(UsuarioDescarga, usuario_id)


def search_usuarios(
    session: Session,
    nombre: Optional[str] = None,
    departamento: Optional[str] = None,
    puntuacion_min: Optional[int] = None,
) -> List[UsuarioDescarga]:
    """Búsqueda filtrada de usuarios por nombre, departamento o puntuación mínima."""
    statement = select(UsuarioDescarga)
    if nombre:
        statement = statement.where(
            UsuarioDescarga.nombre.ilike(f"%{nombre}%")
        )
    if departamento:
        statement = statement.where(
            UsuarioDescarga.departamento.ilike(f"%{departamento}%")
        )
    if puntuacion_min is not None:
        statement = statement.where(UsuarioDescarga.puntuacion >= puntuacion_min)
    statement = statement.order_by(UsuarioDescarga.timestamp.desc())
    return session.exec(statement).all()


def delete_usuario(session: Session, usuario_id: int) -> Optional[UsuarioDescarga]:
    """Elimina un usuario por su ID."""
    usuario = session.get(UsuarioDescarga, usuario_id)
    if not usuario:
        return None
    session.delete(usuario)
    session.commit()
    return usuario


def get_stats_descargas(session: Session) -> UsuarioDescargaStats:
    """Calcula estadísticas agregadas de descargas."""
    usuarios = session.exec(select(UsuarioDescarga)).all()
    if not usuarios:
        return UsuarioDescargaStats(
            total_descargas=0,
            promedio_puntuacion=0.0,
            departamento_top="N/A",
            edad_promedio=0.0,
        )
    total = len(usuarios)
    avg_puntuacion = sum(u.puntuacion for u in usuarios) / total
    avg_edad = sum(u.edad for u in usuarios) / total

    # Departamento con más descargas
    from collections import Counter
    dep_counter = Counter(u.departamento for u in usuarios)
    top_dep = dep_counter.most_common(1)[0][0]

    return UsuarioDescargaStats(
        total_descargas=total,
        promedio_puntuacion=round(avg_puntuacion, 2),
        departamento_top=top_dep,
        edad_promedio=round(avg_edad, 1),
    )