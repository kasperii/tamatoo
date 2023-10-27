from flask import Flask, send_from_directory, make_response, jsonify, request
import random
import sys
import json
import serial
import time

app = Flask(__name__)

# Path for our main Svelte page
@app.route("/")
def base():
    return send_from_directory('client/public', 'index.html')

# Path for all the static files (compiled JS/CSS, etc.)
@app.route("/<path:path>")
def home(path):
    return send_from_directory('client/public', path)

@app.route("/rand")
def hello():
    return str(random.randint(0, 100))

@app.route("/color", methods=["POST"])
def color():

    data = json.loads(request.form['json'])
    print(data)
    print(data['c'])
    print('color change!', file=sys.stderr)
    sendToArduino(data['c'])
    return make_response(jsonify("success"), 201)

@app.route("/wheels", methods=["POST"])
def wheels():

    data = json.loads(request.form['json'])
    print(data)
    print(data['w'])
    print('wheels moving!', file=sys.stderr)
    sendToArduino(data['w'])
    return make_response(jsonify("success"), 201)




def sendToArduino(message):
    ser = serial.Serial('/dev/serial/by-id/usb-Silicon_Labs_CP2104_USB_to_UART_Bridge_Controller_0178C8A8-if00-port0', 115200, timeout=1)
    ser.reset_input_buffer()
    while True:
        ser.write(message.encode('utf-8'))
        line = ser.readline().decode('utf-8').rstrip()
        print(line)
        time.sleep(1)

if __name__ == "__main__":
    app.run(debug=True)
