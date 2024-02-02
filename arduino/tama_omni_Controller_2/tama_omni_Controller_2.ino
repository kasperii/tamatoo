/*
  tama_omni_Serial_Controller.ino

  Update:2023/10/10
*/

#include <Wire.h>
#include <vs-rc202.h>
#include <Arduino.h>
#include <FS.h>
#include <math.h>

#define SLAVE_ADDRESS 0x04
#define ACK 0x06

char e = 'E';
char clr1 = 'R';
char clr2 = 'G';
char clr3 = 'B';
int ptn = 1;
int frq = 100;

int d = 0;
int s = 0;
int r = 0;

int dd = 0;
int ss = 0;
int rr = 0;

#define INTERVAL 5  //moveOmuni3での移動時の制御周期


#define BUF_SIZE 10240
uint8_t buf[BUF_SIZE];
int led_onoff_flag = 0;


int motion_time = 0;  //モーション再生時間

//サーボモータ回転速度補正係数
double alpha = -1.33096 * pow(10, -6);
double beta = -6.94394 * pow(10, -5);
double gam = 1.263727114;
double delta = -0.6045050505;

long _last_time = millis();

//角度->ラジアン変換
double deg2rad(int deg) {
  double rad;
  rad = deg * 3.14 / 180;

  return rad;
}


//速度(velocity -600～600)、移動方向[°](axis 0～360)、旋回量(omega -600～600)から各サーボの回転速度を算出する
void moveOmuni3(int velocity, int axis, int omega) {
  int v1, v2, v3;
  double vx, vy, rad;

  rad = deg2rad(axis);
  vy = velocity * cos(rad);
  vx = velocity * sin(rad);

  v1 = vx + omega;
  v1 = alpha * pow(v1, 3) + beta * pow(v1, 2) + gam * v1 + delta;  //サーボモータ回転速度補正
  v2 = -0.5 * vx + 0.865 * vy + omega;
  v2 = alpha * pow(v2, 3) + beta * pow(v2, 2) + gam * v2 + delta;  //サーボモータ回転速度補正
  v3 = -0.5 * vx - 0.865 * vy + omega;
  v3 = alpha * pow(v3, 3) + beta * pow(v3, 2) + gam * v3 + delta;  //サーボモータ回転速度補正

  setServoDeg(1, v1);
  setServoDeg(2, v2);
  setServoDeg(3, v3);
  setServoMovingTime(INTERVAL);  //Set moving time
  motion_time = 0;
  moveServo();

  return;
}

// int home_position[1][11] = {
//                       {800,0,0,0,0,0,0,0,0,0,0},
//                     };

// int go[6][11] = {
//                   {300,0,0,800,0,0,0,0,0,0,0},
//                   {300,-600,-600,800,0,0,0,0,0,0,0},
//                   {300,-600,-600,0,0,0,0,0,0,0,0},
//                   {300,-600,-600,-800,0,0,0,0,0,0,0},
//                   {300,600,600,-800,0,0,0,0,0,0,0},
//                   {300,600,600,0,0,0,0,0,0,0,0},
//                 };


// int left[5][11] = {
//                     {300,0,0,-600,0,0,0,0,0,0,0},
//                     {300,300,0,-600,0,0,0,0,0,0,0},
//                     {500,300,0,600,0,0,0,0,0,0,0},
//                     {300,0,0,600,0,0,0,0,0,0,0},
//                     {300,0,0,0,0,0,0,0,0,0,0},
//                     };


// int right[5][11] = {
//                     {300,0,0,600,0,0,0,0,0,0,0},
//                     {300,0,-300,600,0,0,0,0,0,0,0},
//                     {500,0,-300,-600,0,0,0,0,0,0,0},
//                     {300,0,0,-600,0,0,0,0,0,0,0},
//                     {300,0,0,0,0,0,0,0,0,0,0},
//                     };

// int back[6][11] = {
//                   {300,0,0,-800,0,0,0,0,0,0,0},
//                   {300,-600,-600,-800,0,0,0,0,0,0,0},
//                   {300,-600,-600,0,0,0,0,0,0,0,0},
//                   {300,-600,-600,800,0,0,0,0,0,0,0},
//                   {300,600,600,800,0,0,0,0,0,0,0},
//                   {300,600,600,0,0,0,0,0,0,0,0},
//                 };

// int f1[2][11] = {
//                       {800,0,0,0,-1500,0,0,0,0,0,0},
//                       {800,0,0,0,0},
//                     };


// int f2[2][11] = {
//                       {800,0,0,0,1500,0,0,0,0,0,0},
//                       {800,0,0,0,0,0,0,0,0,0,0},
//                     };

bool sendData(char e, char clr, int ptn, int frq) {
  int maxRetries = 3;
  bool responseReceived = false;

  while (maxRetries-- && !responseReceived) {
    Wire.beginTransmission(SLAVE_ADDRESS);
    Wire.write(e);
    Wire.write(clr);
    Wire.write(ptn);
    Wire.write(frq);
    Wire.write('\n');
    byte error = Wire.endTransmission();

    if (error == 0) {
      Wire.requestFrom(SLAVE_ADDRESS, 1);
      if (Wire.available()) {
        byte response = Wire.read();
        if (response == ACK) {
          responseReceived = true;
          Serial.println("Received ACK from slave.");
          break;
        }
      }
    }
  }

  return responseReceived;
}



void selectMotion() {
  moveOmuni3(s, d, r);
  if(s==ss & d==dd & r==rr){
    //stop spamming the printlin
  }else{
    Serial.print("move motors");
    Serial.print(s);
    Serial.print(",");
    Serial.print(d);
    Serial.print(",");
    Serial.print(r);
    Serial.println("");
    dd=d;
    ss=s;
    rr=r;
  }
}

//void readTamaMovements(buff){
//    ////motor control////
//    if (buff[0] == 'M') {
//      for (int i = 1; i < 7; i++) {//get value(buff[1-6])
//        buff[i] = Serial.read();
//        delay(10);
//      }
//
//      ind_flag = 0; //0=eye, 1=directional, 2=not directonal
//
//      //pan motor
//      if (buff[1] == 0) {} //if pan-sign(buf[1])==0, keep Pan target angle
//      else {//update Pan target angle
//        if (buff[1] == 1 && byte(buff[2]) > pan_MAX)P_V_ref = -1 * buff[1] * pan_MAX + pan_OFFSET; //if bigger than MAX, cutoff
//        else if (buff[1] == -1 && -byte(buff[2]) < pan_MIN)P_V_ref = -1 * buff[1] * -1 * pan_MIN + pan_OFFSET; //if smaller than MIN, cut off
//        else {
//          P_V_ref = -1 * buff[1] * byte(buff[2]) + pan_OFFSET; //else, simply use the value
//        }
//      }
//
//      //tilt motor
//      if (buff[3] == 0) {} //if tilt-sign(buf[3])==0, keep Tilt target angle(deg[1])
//      else {//update Tilt target angle
//        if (buff[4] > 20)buff[4] -= 20;
//        else {
//          buff[4] = 0;
//        }
//        if (buff[3] == 1 && byte(buff[4]) > tilt_MAX)deg[1] = tilt_OFFSET - 1 * buff[3] * tilt_MAX * 4 / 3; //if bigger than MAX, cutoff
//        else if (buff[3] == -1 && -byte(buff[4]) < tilt_MIN)deg[1] = tilt_OFFSET - 1 * buff[3] * -1 * tilt_MIN * 4 / 3; //if smaller than MIN, cut off
//        else {
//          deg[1] = tilt_OFFSET - 1 * buff[3] * byte(buff[4]) * 4 / 3; //else, simply use the value
//        }
//      }
//
//      //TF motor
//      if (buff[5] == 0) {} //if TF-sign(buf[5])==0, keep TF target angle
//      else {
//        if (buff[5] == 1 && byte(buff[6]) > TF_MAX)TF_V_ref = buff[5] * TF_MAX + TF_OFFSET;//if bigger than MAX, cutoff
//        else if (buff[5] == -1 && -byte(buff[6]) < TF_MIN)TF_V_ref = buff[5] * -1 * TF_MIN + TF_OFFSET;//if smaller than MIN, cut off
//        else {
//          TF_V_ref = buff[5] * byte(buff[6]) + TF_OFFSET;//else, simply use the value
//        }
//      }
//    }
//
//
//}

//long interval = 1000;
//
//bool checkInterval(){
//  if((millis()-_last_time) > interval){
//    _last_time = millis();
//    return true;
//  } else {
//    return false;
//  }
//}

void getCommand() {
  //0-31 are directions
  //  if(Serial.available() > 0 && checkInterval()){
  if (Serial.available() > 0) {
    int c = (int)Serial.read() - 32;
    //    int c = Serial.parseInt();
    Serial.print("received val: ");
    Serial.println(c);

    //    String line;
    //    int line_len;
    //    int c;
    //
    //    line = Serial.readStringUntil('\n');
    //    line_len = line.length();
    //    if(line_len > 0){
    //      c = line.toInt();
    //      Serial.println(c);
    //    }
    //
    if (c < 32) {
      if (c<0){
        c=0
      }
      d = c * 11, 25;
      Serial.print("d val: ");
      Serial.println(d);
    } else if (c < 39) {
      s = (c - 32) * 100;
      Serial.print("s val: ");
      Serial.println(s);
    } else if (c < 42) {  // ASCII "G"
      r = (c - 40) * 100;
      Serial.print("r val: ");
      Serial.println(r);
    }
  }

  //  // reset buffer
  //  while(Serial.available()){
  //    Serial.read();
  //  }
}

void setup() {
  //debug
  Serial.begin(115200);
  delay(500);

  //Init robot lib
  initLib();
  delay(10);

  //SV1 - 4 servo mode
  servoEnable(1, 1);  //Enable SV1 PWM
  servoEnable(2, 1);  //Enable SV2 PWM
  servoEnable(3, 1);  //Enable SV3 PWM
  servoEnable(4, 1);  //Enable SV4 PWM

  //SV9 and SV10 LED mode
  servoEnable(9, 1);   //Enable SV9 PWM
  servoEnable(10, 1);  //Enable SV10 PWM
  setLedMode(9, 1);    //Set SV9 LED mode
  setLedMode(10, 1);   //Set SV10 LED mode

  //Offset
  setServoOffset(1, 0);
  setServoOffset(2, 0);
  setServoOffset(3, 0);
  setServoOffset(4, 0);
}

void loop() {
  if (Serial.available() > 0) {
    getCommand();
  }
  //Play motion
  selectMotion();
}
