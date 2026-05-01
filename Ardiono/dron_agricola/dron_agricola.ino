// ============================================================
//  Dron Agrícola — ESP32 Firmware v4 CORREGIDO
//
//  PINES CORREGIDOS (sin conflicto GPIO 21):
//  L298N #2 ahora usa GPIO 5, 17, 16  (antes 21, 19, 18 que
//  chocaban con SDA del MPU6050 en GPIO 21)
//
//  MPU6050: SDA=GPIO21, SCL=GPIO22  (I2C estándar ESP32)
//
//  LÓGICA: datos del sensor se envían UNA vez al presionar
//  DISPARO (R_ON). Formato: DATA:n,ax,ay,az,gx,gy,gz
// ============================================================

#include <BluetoothSerial.h>
#include <Wire.h>
#include <ESP32Servo.h>

// ── L298N #1 — Motores de tracción ───────────────────────────
#define ENA  14
#define IN1  27
#define IN2  26
#define ENB  25
#define IN3  33
#define IN4  32

// ── L298N #2 — Bomba de dispersión (PINES CORREGIDOS) ────────
#define BOMBA_EN   5    // antes 21 → conflicto con SDA
#define BOMBA_IN1  17   // antes 19
#define BOMBA_IN2  16   // antes 18

// ── Servos ───────────────────────────────────────────────────
#define SERVO1_PIN 13
#define SERVO2_PIN 12

// ── MPU6050 — I2C estándar ESP32 ─────────────────────────────
// SDA = GPIO 21  (Wire.begin() usa estos por defecto)
// SCL = GPIO 22
const int   MPU_ADDR    = 0x68;
const float ACCEL_SCALE = 16384.0f;
const float GYRO_SCALE  = 131.0f;
int16_t AcX, AcY, AcZ, Tmp, GyX, GyY, GyZ;

BluetoothSerial SerialBT;
Servo servo1, servo2;

String receivedData = "";
int    numDisparo   = 0;
int    servo1Pos    = 90;
int    servo2Pos    = 90;


// =============================================================
// MOVIMIENTO
// =============================================================
void stopMotors() {
    digitalWrite(IN1,LOW);  digitalWrite(IN2,LOW);
    digitalWrite(IN3,LOW);  digitalWrite(IN4,LOW);
}
void forward() {
    digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW);
    digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW);
}
void backward() {
    digitalWrite(IN1,LOW);  digitalWrite(IN2,HIGH);
    digitalWrite(IN3,LOW);  digitalWrite(IN4,HIGH);
}
void turnLeft() {
    digitalWrite(IN1,LOW);  digitalWrite(IN2,HIGH);
    digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW);
}
void turnRight() {
    digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW);
    digitalWrite(IN3,LOW);  digitalWrite(IN4,HIGH);
}


// =============================================================
// MPU6050
// =============================================================
bool initMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B);
    Wire.write(0);  // despertar el sensor
    byte err = Wire.endTransmission(true);
    if (err != 0) {
        Serial.print("Error MPU6050: ");
        Serial.println(err);
        return false;
    }
    Serial.println("MPU6050 OK");
    return true;
}

void readMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 14, true);
    AcX = Wire.read()<<8 | Wire.read();
    AcY = Wire.read()<<8 | Wire.read();
    AcZ = Wire.read()<<8 | Wire.read();
    Tmp = Wire.read()<<8 | Wire.read();
    GyX = Wire.read()<<8 | Wire.read();
    GyY = Wire.read()<<8 | Wire.read();
    GyZ = Wire.read()<<8 | Wire.read();
}

// Formato: DATA:<disparo>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>
// La app Android parsea exactamente este formato.
void enviarDatosSensor() {
    readMPU6050();
    float ax = AcX / ACCEL_SCALE;
    float ay = AcY / ACCEL_SCALE;
    float az = AcZ / ACCEL_SCALE;
    float gx = GyX / GYRO_SCALE;
    float gy = GyY / GYRO_SCALE;
    float gz = GyZ / GYRO_SCALE;

    String msg = "DATA:";
    msg += String(numDisparo) + ",";
    msg += String(ax, 4) + ",";
    msg += String(ay, 4) + ",";
    msg += String(az, 4) + ",";
    msg += String(gx, 4) + ",";
    msg += String(gy, 4) + ",";
    msg += String(gz, 4);

    SerialBT.println(msg);
    Serial.print("Enviado: "); Serial.println(msg);
}


// =============================================================
// SETUP
// =============================================================
void setup() {
    Serial.begin(115200);
    SerialBT.begin("ESP32_Control_Manguito_#1");
    Serial.println("Bluetooth: ESP32_Control_Manguito_#1");

    // L298N #1
    pinMode(ENA,OUTPUT); pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT);
    pinMode(ENB,OUTPUT); pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT);
    analogWrite(ENA, 255);
    analogWrite(ENB, 255);

    // L298N #2 (bomba) — pines corregidos
    pinMode(BOMBA_EN,OUTPUT);
    pinMode(BOMBA_IN1,OUTPUT);
    pinMode(BOMBA_IN2,OUTPUT);
    digitalWrite(BOMBA_IN1, HIGH);  // dirección fija
    digitalWrite(BOMBA_IN2, LOW);
    analogWrite(BOMBA_EN, 0);       // apagada al inicio

    // Servos
    servo1.attach(SERVO1_PIN);
    servo2.attach(SERVO2_PIN);
    servo1.write(servo1Pos);
    servo2.write(servo2Pos);

    // MPU6050 — SDA=21, SCL=22 (por defecto en ESP32)
    Wire.begin();
    delay(100);
    initMPU6050();

    Serial.println("Setup completo.");
}


// =============================================================
// LOOP
// =============================================================
void loop() {
    if (SerialBT.available()) {
        receivedData = SerialBT.readStringUntil('\n');
        receivedData.trim();
        Serial.print("CMD: "); Serial.println(receivedData);

        if      (receivedData == "A") forward();
        else if (receivedData == "B") backward();
        else if (receivedData == "C") turnLeft();
        else if (receivedData == "D") turnRight();
        else if (receivedData == "E") stopMotors();

        else if (receivedData == "R_ON") {
            numDisparo++;
            analogWrite(BOMBA_EN, 255);
            // Lee el sensor y envía datos AL MOMENTO del disparo
            delay(50);  // pequeña espera para estabilizar la lectura
            enviarDatosSensor();
        }
        else if (receivedData == "R_OFF") {
            analogWrite(BOMBA_EN, 0);
        }

        if (receivedData.startsWith("S1")) {
            int p = receivedData.substring(2).toInt();
            if (p >= 0 && p <= 180) { servo1Pos = p; servo1.write(p); }
        }
        if (receivedData.startsWith("S2")) {
            int p = receivedData.substring(2).toInt();
            if (p >= 0 && p <= 180) { servo2Pos = p; servo2.write(p); }
        }
    }
    delay(20);
}
