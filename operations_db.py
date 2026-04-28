from sqlmodel import Session, select
from typing import List, Optional
from models import SensorData, SensorDataCreate


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
