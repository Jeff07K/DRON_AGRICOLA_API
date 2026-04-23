# 🚁 Dron Agrícola — Sistema de Control y Monitoreo

> Sistema robótico para dispersión automatizada de semillas con análisis estadístico de datos inerciales.
> Desarrollado como actividad aplicada usando ESP32, Android (Kotlin), FastAPI y Power BI.

---

## Tabla de contenidos

1. [Descripción del proyecto](#descripción-del-proyecto)
2. [Arquitectura del sistema](#arquitectura-del-sistema)
3. [Requisitos de hardware](#requisitos-de-hardware)
4. [Estructura del repositorio](#estructura-del-repositorio)
5. [Configuración del firmware (ESP32)](#configuración-del-firmware-esp32)
6. [Configuración de la app Android](#configuración-de-la-app-android)
7. [Configuración del backend (FastAPI)](#configuración-del-backend-fastapi)
8. [Despliegue en producción](#despliegue-en-producción)
9. [Análisis estadístico](#análisis-estadístico)
10. [Power BI](#power-bi)
11. [Comandos Bluetooth](#comandos-bluetooth)
12. [API Reference](#api-reference)
13. [Tecnologías usadas](#tecnologías-usadas)

---

## Descripción del proyecto

Sistema completo de control y monitoreo para un dron agrícola terrestre. Permite:

- Controlar el movimiento del dron (adelante, reversa, izquierda, derecha, frenar) desde una app Android via Bluetooth
- Activar una bomba de agua (dispersión de semillas/líquido) con un segundo módulo L298N
- Registrar en tiempo real los datos del sensor inercial MPU6050 (acelerómetro + giroscopio)
- Transmitir esos datos al servidor FastAPI en la nube
- Visualizarlos en un dashboard web y exportarlos a Excel para análisis estadístico

> **Nota importante:** La app funciona **100% solo con Bluetooth** sin necesidad de internet. El servidor es una capa adicional opcional para persistencia y análisis de datos.

---

## Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1 — Hardware                                       │
│  ESP32 ←→ MPU6050 (I²C)                                  │
│  ESP32 → L298N #1 (tracción 4 motores)                  │
│  ESP32 → L298N #2 (bomba de agua)                        │
│  ESP32 → Servo SG90 × 2                                  │
└──────────────────────┬──────────────────────────────────┘
                       │ Bluetooth SPP
                       │ DATA:ax,ay,az,gx,gy,gz\n
                       │ Comandos: A B C D E R_ON R_OFF
                       ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 2 — App Android (Kotlin)                           │
│  MainActivity.kt  →  BluetoothService.kt                 │
│  activity_main.xml (6 botones de control)                │
│  HTTP Client (POST al servidor, falla silencioso)        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS POST /api/sensor-data
                       │ {"disparo":1,"accel_x":0.55,...}
                       ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 3 — Backend (FastAPI en Render)                    │
│  main.py · models.py · database.py                       │
│  operations_db.py · export.py                            │
│  static/index.html (dashboard web)                       │
└──────────────────────┬──────────────────────────────────┘
                       │ SQLModel ORM
                       ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 4 — Base de datos                                  │
│  SQLite (desarrollo) · Clever Cloud MySQL (producción)   │
└──────────────────────┬──────────────────────────────────┘
                       │ GET /api/export-excel → .xlsx
                       ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 5 — Visualización y análisis                       │
│  Dashboard web (HTML/CSS/JS)                             │
│  analisis.py (pandas · scipy · matplotlib)               │
│  Power BI Desktop (.pbix)                                │
└─────────────────────────────────────────────────────────┘
```

---

## Requisitos de hardware

| Componente | Cantidad | Función |
|---|---|---|
| ESP32 (cualquier variante) | 1 | Microcontrolador principal |
| MPU6050 | 1 | Acelerómetro + Giroscopio |
| L298N | 2 | #1 tracción · #2 bomba de agua |
| Motorreductores 12V | 2–4 | Tracción del dron |
| Motor bomba de agua | 1 | Dispersión de semillas/líquido |
| Servo SG90 | 2 | Control de dirección/aspersor |
| Batería 12V | 1 | Alimentación motores |
| Celular Android 5.0+ | 1 | Control remoto |

### Mapa de pines ESP32

```
L298N #1 (tracción):   ENA=14  IN1=27  IN2=26  ENB=25  IN3=33  IN4=32
L298N #2 (bomba):      EN=21   IN1=19  IN2=18
Servo 1:               Pin 13
Servo 2:               Pin 12
MPU6050 (I²C):         SDA=21  SCL=22
```

---

## Estructura del repositorio

```
dron-agricola/
│
├── arduino/
│   └── dron_agricola_v2.ino        # Firmware ESP32 (Arduino IDE v2)
│
├── android/                         # Copiar en Android Studio
│   ├── MainActivity.kt
│   ├── BluetoothService.kt
│   ├── activity_main.xml
│   ├── AndroidManifest.xml
│   └── build.gradle.kts             # Solo el bloque dependencies
│
├── backend/
│   ├── main.py                      # FastAPI app + endpoints
│   ├── models.py                    # SQLModel schemas
│   ├── database.py                  # Conexión SQLite / MySQL
│   ├── operations_db.py             # CRUD
│   ├── export.py                    # Generador Excel (.xlsx)
│   ├── requirements.txt
│   └── static/
│       └── index.html               # Dashboard web
│
├── analisis/
│   └── analisis.py                  # Análisis estadístico con Python
│
├── docs/
│   └── arquitectura_dron_agricola.html  # Diagrama interactivo del sistema
│
└── README.md
```

---

## Configuración del firmware (ESP32)

### Requisitos

- [Arduino IDE v2](https://www.arduino.cc/en/software)
- Librerías (instalar desde el gestor de librerías de Arduino IDE):
  - `BluetoothSerial` (incluida en el core ESP32)
  - `Wire` (incluida)
  - `Servo` (incluida)

### Pasos

1. Abre Arduino IDE v2
2. Ve a **File → Open** y selecciona `arduino/dron_agricola_v2.ino`
3. En **Tools → Board** selecciona `ESP32 Dev Module` (o tu variante de ESP32)
4. Selecciona el puerto COM correcto en **Tools → Port**
5. Haz clic en **Upload** (→)

El ESP32 se llamará `ESP32_Control` por Bluetooth. Páralo desde Ajustes del celular antes de abrir la app.

---

## Configuración de la app Android

### Requisitos

- [Android Studio](https://developer.android.com/studio) (versión reciente)
- Celular Android 5.0+ con Bluetooth
- Cable USB para instalar la app

### Pasos en Android Studio

Sigue este orden exacto basado en la estructura de tu proyecto:

**1. `AndroidManifest.xml`**
Ruta: `app/manifests/AndroidManifest.xml`
→ Reemplaza todo el contenido con el archivo `android/AndroidManifest.xml`

**2. Crear `BluetoothService.kt` (archivo nuevo)**
- Clic derecho sobre `com.dronagricola` (la carpeta verde, NO androidTest)
- `New → Kotlin Class/File → BluetoothService`
- Reemplaza el contenido con `android/BluetoothService.kt`

**3. `MainActivity.kt`**
Ruta: `app/kotlin+java/com.dronagricola/MainActivity`
→ Reemplaza TODO el contenido (incluyendo el `enableEdgeToEdge()` por defecto)

**4. `activity_main.xml`**
Ruta: `app/res/layout/activity_main.xml`
→ Cambia a vista `Code` (esquina superior derecha) y reemplaza todo

**5. `build.gradle.kts (Module :app)`**
Ruta: Panel inferior `Gradle Scripts → build.gradle.kts (Module :app)`
→ Reemplaza el bloque `dependencies { }` con:

```kotlin
dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.espresso:espresso-core:3.5.1")
}
```

→ Haz clic en **Sync Now** cuando aparezca el banner amarillo

**6. Instalar en el celular**
- Conecta el celular por USB con depuración USB activada
- Presiona ▶ (Run) en Android Studio

---

## Configuración del backend (FastAPI)

### Requisitos

- Python 3.10+
- [PyCharm](https://www.jetbrains.com/pycharm/) o VS Code con entorno virtual

### Instalar dependencias localmente

```bash
# Crear entorno virtual
python -m venv venv

# Activar (Windows)
venv\Scripts\activate

# Activar (Linux/Mac)
source venv/bin/activate

# Instalar dependencias
pip install -r backend/requirements.txt
```

### Correr el servidor localmente

```bash
cd backend
uvicorn main:app --reload
```

Abre en el navegador:
- `http://localhost:8000` → Dashboard web
- `http://localhost:8000/docs` → Documentación automática de la API

---

## Despliegue en producción

### Backend en Render (gratis)

1. Sube la carpeta `backend/` a un repositorio de GitHub
2. Ve a [render.com](https://render.com) → New → Web Service
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Render te asignará una URL: `https://tu-app.onrender.com`
6. Actualiza la constante en `MainActivity.kt`:
   ```kotlin
   private const val SERVER_URL = "https://tu-app.onrender.com"
   ```

> ⚠️ El plan gratuito de Render "duerme" el servicio tras 15 min de inactividad. La primera petición tarda ~30 segundos en despertar.

### Base de datos en Clever Cloud (gratis, persistente)

1. Crea cuenta en [clever-cloud.com](https://www.clever-cloud.com)
2. Add-on → MySQL → Plan dev (5 MB gratis)
3. Copia la cadena de conexión
4. En Render → tu servicio → Environment → Add Variable:
   ```
   DATABASE_URL = mysql+pymysql://usuario:contraseña@host:puerto/nombre_db
   ```

---

## Análisis estadístico

### Instalar dependencias

```bash
pip install pandas openpyxl scipy matplotlib seaborn
```

### Ejecutar el análisis

```bash
# 1. Primero exporta el Excel desde la API:
# GET https://tu-app.onrender.com/api/export-excel → dron_agricola_datos.xlsx

# 2. Corre el script:
python analisis/analisis.py
```

### Qué genera

| Salida | Descripción |
|---|---|
| Tabla en consola | Estadística descriptiva completa (media, std, min, max, percentiles) |
| Correlación Pearson | r y valor p entre Accel X y Accel Y |
| Regresión lineal | Pendiente B1, intercepto B0, R² |
| `histogramas.png` | Distribución de las 6 variables del MPU6050 |
| `regresion.png` | Dispersión Accel X vs Accel Y con línea de regresión |

---

## Power BI

### Instalación

Descarga gratis en [powerbi.microsoft.com/desktop](https://powerbi.microsoft.com/desktop)

### Conectar los datos

1. Abre Power BI Desktop
2. **Obtener datos → Excel**
3. Selecciona `dron_agricola_datos.xlsx`
4. Marca las hojas **"Datos Sensor"** y **"Estadística"** → Cargar

### Visualizaciones recomendadas

| Tipo de gráfico | Eje X | Eje Y / Valores | Notas |
|---|---|---|---|
| Gráfico de líneas | Timestamp | Accel X | Evolución temporal |
| Dispersión | Accel X | Accel Y | Leyenda = Disparo |
| Barras agrupadas | Variable | Media | Comparar ejes |
| Tarjeta KPI | — | Accel X | Agregación = Promedio |

### Actualizar datos

1. Exporta nuevo Excel desde `GET /api/export-excel`
2. En Power BI → clic en **Actualizar** (barra superior)

### Guardar

Guarda el informe como `dron_agricola.pbix` para reutilizarlo.

---

## Comandos Bluetooth

Todos los comandos terminan en `\n` (salto de línea). La ESP32 usa `readStringUntil('\n')`.

| Botón en app | Comando | Función ESP32 |
|---|---|---|
| ADELANTE A | `A\n` | `forward()` — ambos motores adelante |
| REVERSA B | `B\n` | `backward()` — ambos motores atrás |
| IZQUIERDA C | `C\n` | `turnLeft()` — motor izq. reversa |
| DERECHA D | `D\n` | `turnRight()` — motor der. reversa |
| FRENAR E | `E\n` | `stopMotors()` — detener todo |
| DISPARO F (ON) | `R_ON\n` | `bombaON()` — L298N #2 al 100% |
| DISPARO F (OFF) | `R_OFF\n` | `bombaOFF()` — L298N #2 a 0% |
| Servo 1 | `S1<grados>\n` | Ej: `S1090\n` → 90° |
| Servo 2 | `S2<grados>\n` | Ej: `S2045\n` → 45° |

### Datos enviados por la ESP32

Cada 200ms (si hay cliente conectado):

```
DATA:ax,ay,az,gx,gy,gz\n
```

Ejemplo real:

```
DATA:0.5500,1.1000,9.7400,0.0550,0.1100,0.1650
```

---

## API Reference

URL base: `https://tu-app.onrender.com`

| Método | Endpoint | Descripción | Body |
|---|---|---|---|
| `GET` | `/` | Dashboard web | — |
| `GET` | `/health` | Health check | — |
| `POST` | `/api/sensor-data` | Guardar lectura MPU6050 | JSON |
| `GET` | `/api/sensor-data` | Listar todos los registros | — |
| `GET` | `/api/sensor-data/{id}` | Un registro por ID | — |
| `DELETE` | `/api/sensor-data/{id}` | Eliminar un registro | — |
| `DELETE` | `/api/sensor-data` | Eliminar todos | — |
| `GET` | `/api/export-excel` | Descargar .xlsx | — |
| `GET` | `/docs` | Swagger UI automático | — |

### Ejemplo de body para POST `/api/sensor-data`

```json
{
  "disparo": 1,
  "accel_x": 0.55,
  "accel_y": 1.10,
  "accel_z": 9.74,
  "gyro_x": 0.055,
  "gyro_y": 0.110,
  "gyro_z": 0.165
}
```

---

## Tecnologías usadas

| Capa | Tecnología | Versión | Costo |
|---|---|---|---|
| Firmware | Arduino IDE v2 + ESP32 core | 2.x | Gratis |
| App móvil | Android Studio + Kotlin | Kotlin 1.9+ | Gratis |
| Coroutines | kotlinx-coroutines-android | 1.7.3 | Gratis |
| Backend | FastAPI + Uvicorn | 0.115 / 0.34 | Gratis |
| ORM | SQLModel + SQLAlchemy | 0.0.22 / 2.0 | Gratis |
| DB desarrollo | SQLite | built-in | Gratis |
| DB producción | Clever Cloud MySQL | Plan dev | Gratis |
| Hosting | Render | Free tier | Gratis |
| Excel | openpyxl | 3.1.5 | Gratis |
| Análisis | pandas + scipy + matplotlib | latest | Gratis |
| Dashboard | Power BI Desktop | latest | Gratis |

---

## Autor

**Jeffrey Alejandro Bejarano Parada** — 67001609  
Actividad Aplicada C1 — Diseño de sistema robótico para reforestación
