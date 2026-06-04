from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime


# ─────────────────────────────────────────────
#  MODELO 1: SensorData (MPU6050)
# ─────────────────────────────────────────────

class SensorDataBase(SQLModel):
    """Campos compartidos del modelo de datos del sensor MPU6050"""
    disparo: int = Field(description="Número de evento de disparo")
    accel_x: float = Field(description="Aceleración eje X (m/s²)")
    accel_y: float = Field(description="Aceleración eje Y (m/s²)")
    accel_z: float = Field(description="Aceleración eje Z (m/s²)")
    gyro_x: float = Field(description="Velocidad angular eje X (rad/s)")
    gyro_y: float = Field(description="Velocidad angular eje Y (rad/s)")
    gyro_z: float = Field(description="Velocidad angular eje Z (rad/s)")


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


# ─────────────────────────────────────────────
#  MODELO 2: UsuarioDescarga
#  Registra a cada persona que solicita la APK.
#  Relación: muchos usuarios pueden existir
#  independientemente (modelo complementario).
# ─────────────────────────────────────────────

DEPARTAMENTOS_COLOMBIA = [
    "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bolívar",
    "Boyacá", "Caldas", "Caquetá", "Casanare", "Cauca",
    "Cesar", "Chocó", "Córdoba", "Cundinamarca", "Guainía",
    "Guaviare", "Huila", "La Guajira", "Magdalena", "Meta",
    "Nariño", "Norte de Santander", "Putumayo", "Quindío",
    "Risaralda", "San Andrés y Providencia", "Santander", "Sucre",
    "Tolima", "Valle del Cauca", "Vaupés", "Vichada",
]


class UsuarioDescargaBase(SQLModel):
    """Campos del formulario de descarga de la APK"""
    nombre: str = Field(
        min_length=2,
        max_length=100,
        description="Nombre completo del usuario",
    )
    edad: int = Field(
        ge=5,
        le=120,
        description="Edad del usuario (5-120)",
    )
    departamento: str = Field(
        max_length=60,
        description="Departamento de Colombia del usuario",
    )
    puntuacion: int = Field(
        ge=1,
        le=5,
        description="Puntuación del dron agrícola (1-5 estrellas)",
    )
    comentario: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Comentario opcional del usuario",
    )


class UsuarioDescarga(UsuarioDescargaBase, table=True):
    """Tabla de usuarios que descargaron la APK"""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = Field(default=None, max_length=45)


class UsuarioDescargaCreate(UsuarioDescargaBase):
    """Schema para registrar un usuario (body del POST)"""
    pass


class UsuarioDescargaRead(UsuarioDescargaBase):
    """Schema de respuesta al leer un usuario"""
    id: int
    timestamp: datetime


class UsuarioDescargaStats(SQLModel):
    """Estadísticas agregadas de descargas"""
    total_descargas: int
    promedio_puntuacion: float
    departamento_top: str
    edad_promedio: float