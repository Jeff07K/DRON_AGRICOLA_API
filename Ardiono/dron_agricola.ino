// ============================================================
//  Dron Agrícola — ESP32 Firmware (Arduino IDE v2)
//  Cambios respecto a la versión anterior:
//  • Envía datos MPU6050 por Bluetooth en formato "DATA:ax,ay,az,gx,gy,gz\n"
//  • El segundo L298N (bomba/disparo) se controla con R_ON / R_OFF
//  • El relay_pin ahora activa el ENABLE del segundo L298N
// ============================================================

#include <BluetoothSerial.h>
#include <Wire.h>
#include <Servo.h>

// ─── Pines motorreductores (L298N #1) ───────────────────────────────────────
#define ENA 14
#define IN1 27
#define IN2 26
#define ENB 25
#define IN3 33
#define IN4 32

// ─── Pines segundo L298N (bomba de agua / disparo) ──────────────────────────
// Solo se usa el pin EN del segundo L298N; dirección fija (siempre adelante)
#define MOTOR_BOMBA_EN 21   // Pin Enable del segundo L298N
#define MOTOR_BOMBA_IN1 19  // Dirección fija — conectado a VCC o HIGH
#define MOTOR_BOMBA_IN2 18  // Dirección fija — conectado a GND o LOW

// ─── Servomotores SG90 ──────────────────────────────────────────────────────
#define SERVO1_PIN 13
#define SERVO2_PIN 12

// ─── MPU6050 ────────────────────────────────────────────────────────────────
const int MPU_ADDR = 0x68;
int16_t AcX, AcY, AcZ, Tmp, GyX, GyY, GyZ;

// ─── Escala del MPU6050 ─────────────────────────────────────────────────────
// Acelerómetro ±2g  → dividir por 16384.0
// Giroscopio   ±250°/s → dividir por 131.0
const float ACCEL_SCALE = 16384.0;
const float GYRO_SCALE  = 131.0;

// ─── Objetos ────────────────────────────────────────────────────────────────
BluetoothSerial SerialBT;
Servo servo1, servo2;

// ─── Variables de control ───────────────────────────────────────────────────
String receivedData = "";
bool   bombaActiva  = false;
int    servo1Pos    = 90;
int    servo2Pos    = 90;

// ─── Control de tiempo para envío de sensores ───────────────────────────────
unsigned long lastSensorSend = 0;
const unsigned long SENSOR_INTERVAL = 200; // ms entre envíos (5 Hz)


// =============================================================================
// FUNCIONES DE MOVIMIENTO
// =============================================================================

void stopMotors() {
    digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
}

void forward() {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
}

void backward() {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
}

void turnLeft() {
    digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
}

void turnRight() {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH);
}

void bombaON() {
    // Activa el segundo L298N: IN1=HIGH, IN2=LOW ya están fijos por hardware
    analogWrite(MOTOR_BOMBA_EN, 255);
    bombaActiva = true;
}

void bombaOFF() {
    analogWrite(MOTOR_BOMBA_EN, 0);
    bombaActiva = false;
}


// =============================================================================
// LEER MPU6050
// =============================================================================

void readMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 14, true);

    AcX = Wire.read() << 8 | Wire.read();
    AcY = Wire.read() << 8 | Wire.read();
    AcZ = Wire.read() << 8 | Wire.read();
    Tmp = Wire.read() << 8 | Wire.read(); // Temperatura (no se usa)
    GyX = Wire.read() << 8 | Wire.read();
    GyY = Wire.read() << 8 | Wire.read();
    GyZ = Wire.read() << 8 | Wire.read();
}

/**
 * Envía los datos del sensor por Bluetooth en formato:
 *   DATA:ax,ay,az,gx,gy,gz\n
 * La app Android parsea este string y lo reenvía al servidor FastAPI.
 *
 * Ejemplo real:
 *   DATA:0.5500,1.1000,9.7400,0.0550,0.1100,0.1650\n
 */
void sendSensorData() {
    float ax = AcX / ACCEL_SCALE;
    float ay = AcY / ACCEL_SCALE;
    float az = AcZ / ACCEL_SCALE;
    float gx = GyX / GYRO_SCALE;
    float gy = GyY / GYRO_SCALE;
    float gz = GyZ / GYRO_SCALE;

    String msg = "DATA:";
    msg += String(ax, 4) + "," + String(ay, 4) + "," + String(az, 4) + ",";
    msg += String(gx, 4) + "," + String(gy, 4) + "," + String(gz, 4);
    SerialBT.println(msg);
}


// =============================================================================
// SETUP
// =============================================================================

void setup() {
    Serial.begin(115200);
    SerialBT.begin("ESP32_Control");
    Serial.println("Bluetooth listo: ESP32_Control");

    // L298N #1 — Motorreductores de tracción
    pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
    pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
    analogWrite(ENA, 255);
    analogWrite(ENB, 255);

    // L298N #2 — Motor bomba/disparo
    pinMode(MOTOR_BOMBA_EN,  OUTPUT);
    pinMode(MOTOR_BOMBA_IN1, OUTPUT);
    pinMode(MOTOR_BOMBA_IN2, OUTPUT);
    digitalWrite(MOTOR_BOMBA_IN1, HIGH); // Dirección fija
    digitalWrite(MOTOR_BOMBA_IN2, LOW);
    analogWrite(MOTOR_BOMBA_EN, 0);      // Apagado al inicio

    // Servos
    servo1.attach(SERVO1_PIN);
    servo2.attach(SERVO2_PIN);
    servo1.write(servo1Pos);
    servo2.write(servo2Pos);

    // MPU6050
    Wire.begin();
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B);
    Wire.write(0);
    Wire.endTransmission(true);

    Serial.println("Setup completo.");
}


// =============================================================================
// LOOP
// =============================================================================

void loop() {
    // ─── Leer MPU6050 ─────────────────────────────────────────────────────
    readMPU6050();

    // ─── Enviar datos del sensor por Bluetooth cada SENSOR_INTERVAL ms ────
    unsigned long now = millis();
    if (now - lastSensorSend >= SENSOR_INTERVAL) {
        lastSensorSend = now;
        if (SerialBT.hasClient()) {
            sendSensorData();
        }
    }

    // ─── Procesar comandos recibidos por Bluetooth ────────────────────────
    if (SerialBT.available()) {
        receivedData = SerialBT.readStringUntil('\n');
        receivedData.trim();

        Serial.print("CMD: "); Serial.println(receivedData);

        // Movimiento
        if      (receivedData == "A") forward();
        else if (receivedData == "B") backward();
        else if (receivedData == "I") turnLeft();
        else if (receivedData == "D") turnRight();
        else if (receivedData == "F") stopMotors();

        // Bomba / disparo (segundo L298N)
        else if (receivedData == "R_ON")  bombaON();
        else if (receivedData == "R_OFF") bombaOFF();

        // Servomotores
        if (receivedData.startsWith("S1")) {
            int pos = receivedData.substring(2).toInt();
            if (pos >= 0 && pos <= 180) { servo1Pos = pos; servo1.write(pos); }
        }
        if (receivedData.startsWith("S2")) {
            int pos = receivedData.substring(2).toInt();
            if (pos >= 0 && pos <= 180) { servo2Pos = pos; servo2.write(pos); }
        }
    }

    delay(20); // 50 Hz loop
}
