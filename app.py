from flask import Flask, send_from_directory, make_response, jsonify, request, Response
import random
import sys
import json
import serial
import time





#from camera import VideoCamera

app = Flask(__name__)

serWheels = serial.Serial('/dev/serial/by-id/usb-Silicon_Labs_CP2104_USB_to_UART_Bridge_Controller_0178C8A8-if00-port0', 115200, timeout=1)
serTama = serial.Serial('/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0', 9600, timeout=1)

pan = 0
tilt = 0

# from picamera2 import Picamera2, Preview
# picam2 = Picamera2()
# camera_config = picam2.create_preview_configuration()
# picam2.configure(camera_config)
# picam2.start_preview(Preview.DRM)
# picam2.start()
# time.sleep(2)
# picam2.capture_file("testing.jpg")


# ------ CAMERA funcs ------
import io
import logging
import socketserver
from http import server
from threading import Condition

from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutputimport picamera2 #camera module for RPi camera
from picamera2 import Picamera2
from picamera2.encoders import JpegEncoder
from picamera2.outputs import FileOutput


class StreamingOutput(io.BufferedIOBase):
    def __init__(self):
        self.frame = None
        self.condition = Condition()

    def write(self, buf):
        with self.condition:
            self.frame = buf
            self.condition.notify_all()


def genFrames():
    #buffer = StreamingOutput()
    while True:
        with picamera2.Picamera2() as camera:
            camera.configure(camera.create_video_configuration(main={"size": (640, 480)}))
            output = StreamingOutput()
            camera.start_recording(JpegEncoder(), FileOutput(output))
        yield (b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + output.frame + b'\r\n')

#defines the route that will access the video feed and call the feed function
@bp.route('/video_feed')
def video_feed():
    return Response(genFrames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


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

@app.route("/wheels", methods=["POST"])
def wheels():

    data = json.loads(request.form['json'])
    print(data)
    datastring = ""
    if('r' in data):
        sendToWheels(data['r'])
        #datastring += "r" + data["r"]
    if('m' in data):
        sendToWheels(data['m'])
        #datastring += "m" + data["m"]
 #   if('p' in data):
 #          patternHandler()
    print('wheels should be moving!', file=sys.stderr)

    
    return make_response(jsonify("success"), 201)

def sendToWheels(message):
    serWheels.reset_input_buffer()
    print(message.encode('utf-8'))
    while True:
        serWheels.write(message.encode('utf-8'))
        line = serWheels.readline().decode('utf-8').rstrip()
        print(line)
        time.sleep(1)
        break



# ------ TAMA HEAD ------



def sendToTama(message):

    #cmdbuff = [ord('M'),ps,pv,ts,tv,tfs,tfv,ord('\n')]#command,pan-sign,pan-val,tilt-sign,tilt-val,TF-sign,TF-val

    serTama.write(bytearray(message))



@app.route("/color", methods=["POST"])
def color():
    clr = 'W'
    ptn = 1
    frq = 0
    data = json.loads(request.form['json'])
    print(data)
    print(data['c'])
    print('color change!', file=sys.stderr)
    clr = data['c']
    cmdbuff = [ord('E'),ord(clr),ptn, frq, ord('\n')]#command,pan-sign,pan-val,tilt-sign,tilt-val,TF-sign,TF-val
    # clr = eye color(R/ G/ B/ Y/ P/ C/ W/ N)
    # ptn = blink pattern (0=off/ 1=on/ 2=blink/ 3=wink)

    sendToTama(cmdbuff)
    return make_response(jsonify("success"), 201)

@app.route("/eyes", methods=["POST"])
def eye():

    data = json.loads(request.form['json'])
    print(data)
    print(data['c'])
    print('color change!', file=sys.stderr)
    sendToTama(data['c'])
    return make_response(jsonify("success"), 201)



# THIS is just old code that could go into the def color as a way of setting the color more specifically
# elif m == 'C':
#         print("input Right Red value(0-255)")
#         rr = int(input())
#         print("input Right Green value(0-255)")
#         rg = int(input())
#         print("input Right Blue value(0-255)")
#         rb = int(input())
#         print("input left Red value(0-255)")
#         lr = int(input())
#         print("input left Green value(0-255)")
#         lg = int(input())
#         print("input left Blue value(0-255)")
#         lb = int(input())

#         cmdbuff = [ord('C'),rr, rg, rb, lr, lg, lb, ord('\n')]#command,pan-sign,pan-val,tilt-sign,tilt-val,TF-sign,TF-val
#         ser0.write(cmdbuff)




if __name__ == "__main__":
    app.run(debug=True,threaded=True)
