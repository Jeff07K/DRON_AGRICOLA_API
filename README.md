# 🤖 Dron Agricola — Dispersión de Semillas

> Diseño e implementación de un robot de tracción diferencial sobre chasis de oruga con pistola de hidrogel para reforestación automatizada, controlado por Bluetooth desde app Android, con análisis estadístico completo de variables inerciales del MPU6050.

**Universidad Católica de Colombia · Ingeniería de Sistemas · 2026-1**  
**Asignatura: Estadística — SOFWARE — Actividad Aplicada C3**  
**Autor: Jeffrey Alejandro Bejarano Parada — 67001609**

[![API Live](https://img.shields.io/badge/API-Live%20en%20Render-brightgreen)](https://dron-agricola-api-3.onrender.com)
[![Dashboard](https://img.shields.io/badge/Dashboard-Web%20Público-blue)](https://dron-agricola-api-3.onrender.com)
[![Docs](https://img.shields.io/badge/Swagger-/docs-orange)](https://dron-agricola-api-3.onrender.com/docs)
[![DB](https://img.shields.io/badge/DB-Neon%20PostgreSQL-teal)](https://neon.tech)

<p align="center">
  <a href="https://dron-agricola-api-3.onrender.com/">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://dron-agricola-api-3.onrender.com/" alt="QR Dashboard" width="180"/>
  </a>
  <br/>
  <sub>Escanea para abrir el dashboard en vivo</sub>
</p>

---

## Tabla de contenidos

1. [Descripción del proyecto](#descripción-del-proyecto)
2. [Inspiración: Da Vinci y Arquímedes](#inspiración-da-vinci-y-arquímedes)
3. [Arquitectura del sistema](#arquitectura-del-sistema)
4. [Hardware del prototipo](#hardware-del-prototipo)
5. [Firmware ESP32](#firmware-esp32)
6. [App Android (Kotlin)](#app-android-kotlin)
7. [Backend FastAPI + Neon PostgreSQL](#backend-fastapi--neon-postgresql)
8. [Dashboard web](#dashboard-web)
9. [Análisis estadístico — n=31 registros](#análisis-estadístico--n31-registros)
10. [Comandos Bluetooth](#comandos-bluetooth)
11. [API Reference](#api-reference)
12. [Tecnologías usadas](#tecnologías-usadas)
13. [Alineación ODS](#alineación-ods)

---

## Descripción del proyecto

Sistema robótico completo para dispersión autónoma de semillas de hidrogel en zonas a reforestar. El robot opera sobre chasis de oruga con tracción diferencial, activando una pistola de hidrogel modificada mediante comando Bluetooth desde una app Android desarrollada en Kotlin.

Cada disparo registra las variables inerciales del sensor MPU6050 (acelerómetro + giroscopio, 6 ejes) y las almacena en tiempo real en una base de datos Neon PostgreSQL a través de un backend FastAPI desplegado en Render. El dashboard web público muestra gráficos interactivos actualizados cada 5 segundos.

**Características principales:**
- Control inalámbrico por Bluetooth SPP desde app Android
- Chasis de oruga impreso en 3D sin servomotores — tracción diferencial pura
- Pistola de hidrogel comercial modificada (motor controlado por L298N #2)
- 31 registros reales del MPU6050 almacenados en Neon PostgreSQL
- Dashboard web con radar, histogramas, dispersión y evolución temporal
- Exportación automática a Excel con análisis estadístico completo
- Distribución Normal, Binomial Negativa y correlaciones de Pearson calculadas sobre datos reales

---

## Inspiración: Da Vinci y Arquímedes

El diseño se inspira en dos conceptos del Renacimiento:

- **Carro Armado de Leonardo da Vinci (1487):** primer concepto documentado de vehículo con tracción diferencial, donde la dirección se controla mediante la diferencia de velocidades entre ruedas opuestas — principio exacto del chasis de oruga implementado.
- **Tornillo de Arquímedes estudiado por Da Vinci:** mecanismo de transporte por rotación, análogo al motor interno de la pistola de hidrogel que impulsa las semillas mediante rotación continua.

---

## Arquitectura del sistema

```
┌──────────────────────────────────────────────────────────┐
│  CAPA 1 — Hardware                                        │
│  ESP32 ←→ MPU6050 (I²C: SDA=GPIO21, SCL=GPIO22)          │
│  ESP32 → L298N #1 (tracción diferencial, 2 motores DC)   │
│  ESP32 → L298N #2 (motor interno pistola de hidrogel)    │
│  Chasis de oruga con estructura impresa en 3D             │
└──────────────────────┬───────────────────────────────────┘
                       │ Bluetooth SPP
                       │ Comandos: A B C D E R_ON R_OFF
                       │ Datos:    DATA:n,ax,ay,az,gx,gy,gz\n
                       ▼
┌──────────────────────────────────────────────────────────┐
│  CAPA 2 — App Android (Kotlin)                            │
│  BluetoothService.kt  →  buffer acumulativo BT            │
│  MainActivity.kt  →  6 botones de control                 │
│  HTTP POST asíncrono (Dispatchers.IO) al servidor         │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS POST /api/sensor-data
                       │ {"disparo":1,"accel_x":0.288,...}
                       ▼
┌──────────────────────────────────────────────────────────┐
│  CAPA 3 — Backend FastAPI (Render)                        │
│  main.py · models.py · database.py                        │
│  operations_db.py · export.py                             │
│  static/index.html (dashboard web, refresco 5s)          │
│  URL: https://dron-agricola-api-3.onrender.com            │
└──────────────────────┬───────────────────────────────────┘
                       │ asyncpg / SQLModel ORM
                       ▼
┌──────────────────────────────────────────────────────────┐
│  CAPA 4 — Base de datos                                   │
│  Neon PostgreSQL (producción, serverless)                 │
│  SQLite (desarrollo local)                                │
└──────────────────────┬───────────────────────────────────┘
                       │ GET /api/export-excel → .xlsx
                       ▼
┌──────────────────────────────────────────────────────────┐
│  CAPA 5 — Análisis y visualización                        │
│  Dashboard web (HTML/CSS/JS — radar, histogramas,         │
│  dispersión Accel X vs Y, evolución temporal)             │
│  Excel exportable con estadística descriptiva completa    │
└──────────────────────────────────────────────────────────┘
```

---

## Hardware del prototipo

| Componente | Cantidad | Función |
|---|---|---|
| ESP32 (Dev Module) | 1 | Microcontrolador principal |
| MPU6050 | 1 | Acelerómetro + Giroscopio (I²C) |
| L298N (doble puente H) | 2 | #1 tracción · #2 pistola hidrogel |
| Motorreductores DC 12V | 2 | Tracción diferencial (orugas) |
| Pistola de hidrogel (modificada) | 1 | Dispersión de semillas |
| Chasis de oruga (impreso 3D) | 1 | Estructura + 4 ruedas naranjas |
| Batería 12V | 1 | Alimentación motores |
| Celular Android 5.0+ | 1 | Control remoto BT |

> **Nota:** El prototipo **no usa servomotores**. La dirección se logra exclusivamente mediante tracción diferencial (diferencia de velocidad entre oruga izquierda y derecha).

### Mapa de pines ESP32

```
L298N #1 (tracción):  ENA=14  IN1=27  IN2=26  ENB=25  IN3=33  IN4=32
L298N #2 (pistola):   EN=5    IN1=17  IN2=16
MPU6050 (I²C):        SDA=21  SCL=22  VCC=3.3V
```

---

## Firmware ESP32

**Archivo:** `Ardiono/dron_agricola/dron_agricola.ino`

El firmware gestiona tres responsabilidades:

1. **Movimiento del chasis** vía Bluetooth SPP — comandos `A/B/C/D/E`
2. **Control de la pistola** — `R_ON` activa el motor (L298N #2) y dispara lectura del MPU6050; `R_OFF` detiene
3. **Transmisión de datos** — formato `DATA:n,ax,ay,az,gx,gy,gz\n` enviado por BT a la app

El MPU6050 usa divisores estándar: acelerómetro `÷16384` (rango ±2g) y giroscopio `÷131` (rango ±250°/s). Comunicación I²C en GPIO 21 (SDA) y GPIO 22 (SCL).

### Requisitos Arduino IDE

- Board: `ESP32 Dev Module`
- Librerías: `BluetoothSerial`, `Wire` (incluidas en el core ESP32)

---

## App Android (Kotlin)

**Directorio:** `android/`

| Archivo | Función |
|---|---|
| `BluetoothService.kt` | Conexión SPP, buffer acumulativo, ensamblado de tramas hasta `\n` |
| `MainActivity.kt` | UI con 6 botones, envío async HTTP POST en `Dispatchers.IO` |
| `activity_main.xml` | Layout de controles |
| `AndroidManifest.xml` | Permisos Bluetooth + Internet |

La app funciona **sin internet** — el Bluetooth es la capa de control. El HTTP POST al servidor es asíncrono y falla silenciosamente si no hay conectividad, sin afectar el control del robot.

### Instalar en Android Studio

1. Abrir proyecto desde la carpeta `android/`
2. En `build.gradle.kts` verificar las dependencias de Coroutines (`kotlinx-coroutines-android:1.7.3`)
3. Conectar celular con depuración USB activada → `▶ Run`
4. Parear el ESP32 (`ESP32_Control`) desde Ajustes Bluetooth antes de abrir la app

---

## Backend FastAPI + Neon PostgreSQL

**URL pública:** [https://dron-agricola-api-3.onrender.com](https://dron-agricola-api-3.onrender.com)  
**URL pública:** [https://jeffbejarano.dpdns.org/](https://jeffbejarano.dpdns.org/)  
**Swagger UI:** [https://dron-agricola-api-3.onrender.com/docs](https://dron-agricola-api-3.onrender.com/docs)

### Estructura del backend

```
├── main.py            # FastAPI app + endpoints
├── models.py          # SQLModel schemas (SensorData)
├── database.py        # Conexión Neon PostgreSQL (asyncpg)
├── operations_db.py   # CRUD operations
├── export.py          # Generador Excel (.xlsx) con openpyxl
├── requirements.txt
└── static/
    └── index.html     # Dashboard web (refresco 5s)
```

### Correr localmente

```bash
python -m venv venv
# Windows: venv\Scripts\activate | Linux/Mac: source venv/bin/activate
pip install -r requirements.txt

# Configurar variable de entorno
# DATABASE_URL=postgresql+asyncpg://usuario:password@host/neondb

uvicorn main:app --reload
# Dashboard: http://localhost:8000
# Docs:      http://localhost:8000/docs
```

### Base de datos — Neon PostgreSQL

El proyecto usa [Neon](https://neon.tech) como base de datos serverless PostgreSQL en producción (región AWS US East 1, N. Virginia). La cadena de conexión usa connection pooling para optimizar las conexiones del plan gratuito.

En Render → Environment Variables:
```
DATABASE_URL = postgresql+asyncpg://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require
```

> ⚠️ El plan gratuito de Render suspende el servicio tras inactividad. La primera petición puede tardar ~50 segundos en despertar.

---

## Dashboard web

Accesible públicamente en [https://dron-agricola-api-3.onrender.com](https://dron-agricola-api-3.onrender.com).
Accesible públicamente en [https://jeffbejarano.dpdns.org/](https://jeffbejarano.dpdns.org/)

**Visualizaciones disponibles (refresco automático cada 5s):**
- Gráfico de radar — promedios de los 6 ejes del MPU6050
- Histogramas de distribución por variable
- Dispersión Accel X vs Accel Y con línea de regresión
- Evolución temporal por número de disparo
- Botón de descarga del Excel con análisis completo
- Botón de descarga del APK Android

---

## Análisis estadístico — n=31 registros

Datos registrados el 1 de mayo de 2026. 31 disparos con el prototipo operativo en orientación horizontal.

### Estadística descriptiva

| Variable | Media | Desv. Est. | CV (%) | Estabilidad |
|---|---|---|---|---|
| Accel X (g) | 0.0389 | 0.0696 | 178.9 | ▲ Alta variabilidad |
| Accel Y (g) | 0.0572 | 0.1284 | 224.5 | ▲ Alta variabilidad |
| **Accel Z (g)** | **1.0336** | **0.0334** | **3.2** | **✓ Estable** |
| Gyro X (°/s) | -9.372 | 11.760 | 125.5 | ▲ Alta variabilidad |
| Gyro Y (°/s) | 0.850 | 2.164 | 254.5 | ▲ Alta variabilidad |
| Gyro Z (°/s) | 4.995 | 15.550 | 311.3 | ✗ Muy alta variabilidad |

Accel Z (CV=3.2%) confirma que el sensor mantuvo orientación horizontal durante todos los disparos.

### Correlaciones de Pearson relevantes

| Par de ejes | r | Interpretación |
|---|---|---|
| Accel Y – Accel Z | -0.616 | Moderada negativa |
| Gyro X – Gyro Y | 0.660 | Moderada positiva |
| Accel Z – Gyro Z | -0.594 | Moderada negativa |
| Accel X – Accel Y | 0.178 | Débil positiva |

### Regresión lineal — Accel X → Accel Y

```
ŷ = −0.1998 + 0.1631·x
r = 0.178   R² = 0.0318   Se = 0.1261 g
```

### Distribución Normal — Accel Z

```
X ~ N(μ=1.0336, σ²=0.0011)
Error estándar: σ/√n = 0.0334/√31 = 0.006 g
IC 95%: [1.021, 1.046] g
```

Con 95% de confianza, la aceleración vertical real durante los disparos se ubica entre **1.021 y 1.046 g**, confirmando horizontalidad sostenida.

### Modelo Binomial Negativa — Disparos estables

Definición de éxito: Gyro Z < 10 °/s → 29 de 31 registros estables → **p = 0.9355**

Modelo: **BN(r=3, p=0.9355)**

| Parámetro | Valor |
|---|---|
| E[X] = r/p | 3.207 disparos hasta 3 estables |
| Var[X] | 0.2212 |
| σ[X] | 0.4703 |
| P(X=3) | 0.819 |
| P(X=4) | 0.158 |
| P(X≤5) | 0.998 |

El sistema alcanza 3 disparos estables en apenas **3.21 intentos esperados**, confirmando alta confiabilidad operativa para reforestación.

---

## Comandos Bluetooth

Todos los comandos terminan en `\n`. El ESP32 usa `readStringUntil('\n')`.

| Botón | Comando | Acción ESP32 |
|---|---|---|
| ADELANTE | `A\n` | Ambos motores adelante |
| REVERSA | `B\n` | Ambos motores atrás |
| IZQUIERDA | `C\n` | Motor izquierdo reversa, derecho adelante |
| DERECHA | `D\n` | Motor derecho reversa, izquierdo adelante |
| FRENAR | `E\n` | Detener tracción |
| DISPARO (ON) | `R_ON\n` | L298N #2 al 100% + lectura MPU6050 |
| DISPARO (OFF) | `R_OFF\n` | L298N #2 a 0% |

### Trama de datos ESP32 → App

```
DATA:n,ax,ay,az,gx,gy,gz\n
```
Ejemplo real: `DATA:1,0.002,0.028,1.055,-10.29,0.55,1.49`

---

## API Reference

**URL base:** `https://dron-agricola-api-3.onrender.com`

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/` | Dashboard web |
| `GET` | `/health` | Health check |
| `POST` | `/api/sensor-data` | Guardar lectura MPU6050 |
| `GET` | `/api/sensor-data` | Listar todos los registros |
| `GET` | `/api/sensor-data/{id}` | Registro por ID |
| `DELETE` | `/api/sensor-data/{id}` | Eliminar registro |
| `DELETE` | `/api/sensor-data` | Eliminar todos |
| `GET` | `/api/export-excel` | Descargar .xlsx con análisis |
| `GET` | `/docs` | Swagger UI automático |

### Body — POST `/api/sensor-data`

```json
{
  "disparo": 1,
  "accel_x": 0.002,
  "accel_y": 0.028,
  "accel_z": 1.055,
  "gyro_x": -10.29,
  "gyro_y": 0.55,
  "gyro_z": 1.49
}
```

---

## Tecnologías usadas

| Capa | Tecnología | Notas |
|---|---|---|
| Firmware | Arduino IDE v2 + ESP32 core | BluetoothSerial, Wire, I²C |
| Sensor | MPU6050 | Acelerómetro ±2g + Giroscopio ±250°/s |
| App móvil | Android Studio + Kotlin | Coroutines, Dispatchers.IO |
| BT | Bluetooth SPP | Buffer acumulativo hasta `\n` |
| Backend | FastAPI + Uvicorn | Python 3.10+ |
| ORM | SQLModel + SQLAlchemy | asyncpg para PostgreSQL |
| DB desarrollo | SQLite | Built-in |
| **DB producción** | **Neon PostgreSQL** | **Serverless, AWS US East 1** |
| Hosting | Render | Free tier (Web Service) |
| Excel export | openpyxl | Análisis estadístico embebido |
| Dashboard | HTML/CSS/JS vanilla | Refresco automático 5s |

---

## Alineación ODS

- **ODS 15 — Vida de Ecosistemas Terrestres:** automatización de la dispersión de semillas para reforestación en zonas de difícil acceso
- **ODS 9 — Industria, Innovación e Infraestructura:** prototipo robótico con stack IoT completo (ESP32 + BT + FastAPI + PostgreSQL + dashboard web)

---

## Estructura del repositorio

```
DRON_AGRICOLA_API/
├── Ardiono/
│   └── dron_agricola/
│       └── dron_agricola.ino     # Firmware ESP32
├── android/                       # App Android (Kotlin)
│   ├── MainActivity.kt
│   ├── BluetoothService.kt
│   ├── activity_main.xml
│   └── AndroidManifest.xml
├── static/
│   └── index.html                 # Dashboard web
├── main.py                        # FastAPI app + endpoints
├── models.py                      # SQLModel schemas
├── database.py                    # Conexión Neon PostgreSQL
├── operations_db.py               # CRUD
├── export.py                      # Generador Excel
├── requirements.txt
└── README.md
```

---

## Referencias

- Siegwart, R. et al. (2011). *Introduction to Autonomous Mobile Robots*. MIT Press.
- STMicroelectronics. (2000). L298 Dual full-bridge driver [Datasheet].
- InvenSense. (2013). MPU-6000 and MPU-6050 Product Specification Rev. 3.4.
- Navidi, W. (2015). *Statistics for Engineers and Scientists*. McGraw-Hill.
- Montgomery, D. C. (2018). *Applied Statistics for Engineers*. Wiley.
- FastAPI Documentation. https://fastapi.tiangolo.com
- Neon PostgreSQL Documentation. https://neon.tech/docs
