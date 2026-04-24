#include <dummy.h>
#include <BluetoothSerial.h>
#include <Wire.h>
#include <ESP32Servo.h>

// ── Pines L298N #1 (tracción) ────────────────────────────────────────────────
#define ENA 14
#define IN1 27
#define IN2 26
#define ENB 25
#define IN3 33
#define IN4 32

// ── Pines L298N #2 (bomba de agua) ───────────────────────────────────────────
#define BOMBA_EN  21
#define BOMBA_IN1 19
#define BOMBA_IN2 18

// ── Servos ───────────────────────────────────────────────────────────────────
#define SERVO1_PIN 13
#define SERVO2_PIN 12

// ── MPU6050 ──────────────────────────────────────────────────────────────────
const int   MPU_ADDR      = 0x68;
const float ACCEL_SCALE   = 16384.0f;
const float GYRO_SCALE    = 131.0f;
int16_t AcX, AcY, AcZ, Tmp, GyX, GyY, GyZ;

BluetoothSerial SerialBT;
Servo servo1, servo2;

String         receivedData = "";
bool           bombaActiva  = false;
int            servo1Pos    = 90;
int            servo2Pos    = 90;
unsigned long  lastSendMs   = 0;
const unsigned long SEND_INTERVAL = 200;

void stopMotors() {
    digitalWrite(IN1,LOW);digitalWrite(IN2,LOW);
    digitalWrite(IN3,LOW);digitalWrite(IN4,LOW);
}
void forward() {
    digitalWrite(IN1,HIGH);digitalWrite(IN2,LOW);
    digitalWrite(IN3,HIGH);digitalWrite(IN4,LOW);
}
void backward() {
    digitalWrite(IN1,LOW);digitalWrite(IN2,HIGH);
    digitalWrite(IN3,LOW);digitalWrite(IN4,HIGH);
}
void turnLeft() {                    // Comando "C"
    digitalWrite(IN1,LOW); digitalWrite(IN2,HIGH);
    digitalWrite(IN3,HIGH);digitalWrite(IN4,LOW);
}
void turnRight() {                   // Comando "D"
    digitalWrite(IN1,HIGH);digitalWrite(IN2,LOW);
    digitalWrite(IN3,LOW); digitalWrite(IN4,HIGH);
}
void bombaON()  { analogWrite(BOMBA_EN,255); bombaActiva=true;  }
void bombaOFF() { analogWrite(BOMBA_EN,0);   bombaActiva=false; }

void readMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR,14,true);
    AcX=Wire.read()<<8|Wire.read(); AcY=Wire.read()<<8|Wire.read();
    AcZ=Wire.read()<<8|Wire.read(); Tmp=Wire.read()<<8|Wire.read();
    GyX=Wire.read()<<8|Wire.read(); GyY=Wire.read()<<8|Wire.read();
    GyZ=Wire.read()<<8|Wire.read();
}

void sendSensorData() {
    // Formato que parsea la app Android: DATA:ax,ay,az,gx,gy,gz
    String msg = "DATA:";
    msg += String(AcX/ACCEL_SCALE,4)+","+String(AcY/ACCEL_SCALE,4)+","+String(AcZ/ACCEL_SCALE,4)+",";
    msg += String(GyX/GYRO_SCALE,4)+","+String(GyY/GYRO_SCALE,4)+","+String(GyZ/GYRO_SCALE,4);
    SerialBT.println(msg);
}

void setup() {
    Serial.begin(115200);
    SerialBT.begin("ESP32_Control_Manguito");

    pinMode(ENA,OUTPUT);pinMode(IN1,OUTPUT);pinMode(IN2,OUTPUT);
    pinMode(ENB,OUTPUT);pinMode(IN3,OUTPUT);pinMode(IN4,OUTPUT);
    analogWrite(ENA,255); analogWrite(ENB,255);

    pinMode(BOMBA_EN,OUTPUT); pinMode(BOMBA_IN1,OUTPUT); pinMode(BOMBA_IN2,OUTPUT);
    digitalWrite(BOMBA_IN1,HIGH); digitalWrite(BOMBA_IN2,LOW);
    analogWrite(BOMBA_EN,0);

    servo1.attach(SERVO1_PIN); servo2.attach(SERVO2_PIN);
    servo1.write(90);          servo2.write(90);

    Wire.begin();
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B); Wire.write(0);
    Wire.endTransmission(true);

    Serial.println("ESP32 lista!");
}

void loop() {
    readMPU6050();

    unsigned long now = millis();
    if (now - lastSendMs >= SEND_INTERVAL && SerialBT.hasClient()) {
        lastSendMs = now;
        sendSensorData();
    }

    if (SerialBT.available()) {
        receivedData = SerialBT.readStringUntil('\n');
        receivedData.trim();
        Serial.print("CMD: "); Serial.println(receivedData);

        if      (receivedData=="A") forward();
        else if (receivedData=="B") backward();
        else if (receivedData=="C") turnLeft();
        else if (receivedData=="D") turnRight();
        else if (receivedData=="E") stopMotors();
        else if (receivedData=="R_ON")  bombaON();
        else if (receivedData=="R_OFF") bombaOFF();

        if (receivedData.startsWith("S1")) {
            int p=receivedData.substring(2).toInt();
            if(p>=0&&p<=180){servo1Pos=p;servo1.write(p);}
        }
        if (receivedData.startsWith("S2")) {
            int p=receivedData.substring(2).toInt();
            if(p>=0&&p<=180){servo2Pos=p;servo2.write(p);}
        }
    }
    delay(20);
}