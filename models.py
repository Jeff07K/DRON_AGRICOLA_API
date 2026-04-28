from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class SensorDataBase(SQLModel):
    """Campos compartidos del modelo de datos del sensor MPU6050"""
    disparo: int = Field(description="Número de evento de disparo")
    accel_x: float = Field(description="Aceleración eje X (m/s²)")
    accel_y: float = Field(description="Aceleración eje Y (m/s²)")
    accel_z: float = Field(description="Aceleración eje Z (m/s²)")
    gyro_x: float  = Field(description="Velocidad angular eje X (rad/s)")
    gyro_y: float  = Field(description="Velocidad angular eje Y (rad/s)")
    gyro_z: float  = Field(description="Velocidad angular eje Z (rad/s)")


class SensorData(SensorDataBase, table=True):
    """Modelo de tabla en base de datos"""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)


class SensorDataCreate(SensorDataBase):
    """Schema para crear registros (body del POST)"""
    pass


class SensorDataRead(SensorDataBase):
    """Schema para leer registros (response)"""
    id: int
    timestamp: datetime
