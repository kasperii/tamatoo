from flask import Flask, send_from_directory, make_response, jsonify, request, Response
import random
import sys
import json
import serial
import time
from flask_socketio import SocketIO,emit




runningonmacdebug=False
#from camera import VideoCamera

app = Flask(__name__)

app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app,  cors_allowed_origins="*", async_mode='eventlet')

@socketio.on('connect')
def handle_connect():
    print("SOCKET COONNNECTED!")

@socketio.on('message')
def handle_message(data):
    print('received message: ' + data)

try:
    serWheels = serial.Serial('/dev/serial/by-id/usb-Silicon_Labs_CP2104_USB_to_UART_Bridge_Controller_0178C8A8-if00-port0', 115200, timeout=1)
    serTama = serial.Serial('/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0', 9600, timeout=1)
except:
    print("ERROR WITH SERIAL")
    runningonmacdebug=True
pan = 0
tilt = 0

# ------------ffmpeg--------------
#

from flask import stream_with_context, request, Response
import subprocess
import time



@app.route("/ffmpeg")
def ffmpegstream():
    ffmpeg_command = ["ffmpeg", "-f", "alsa", "-channels", "6", "-sample_rate", "16000" "-i", "hw:3", "-f", "mp3", "pipe:stdout"]
    ffmpeg_command = ["ffmpeg", "-f",  "alsa",  "-channels", "6",  "-sample_rate",  "16000",  "-i",  "hw:3",  "-b:v",  "40M",  "-maxrate 50M",  "-bufsize 200M",  "-field_order",  "tt",  "-fflags",  "nobuffer",  "-threads",  "1",  "-vcodec",  "mpeg4",  "-g",  "100",  "-r",  "30",  "-bf",  "0",  "-mbd",  "bits",  "-flags",  "+aic+mv4+low_delay",  "-thread_type",  "slice",  "-slices",  "1",  "-level",  "32",  "-strict",  "experimental",  "-f_strict",  "experimental",  "-syncpoints",  "none", "pipe:stdout"]
    #ffmpeg -f alsa -ac 4 -i default
    process = subprocess.Popen(ffmpeg_command, stdout = subprocess.PIPE, stderr = subprocess.STDOUT, bufsize = -1)

    def generate():
        startTime = time.time()
        buffer = []
        sentBurst = False


        while True:
            # Get some data from ffmpeg
            line = process.stdout.read(1024)

            # We buffer everything before outputting it
            buffer.append(line)

            # Minimum buffer time, 3 seconds
            if sentBurst is False and time.time() > startTime + 3 and len(buffer) > 0:
                sentBurst = True

                for i in range(0, len(buffer) - 2):
                    print("Send initial burst #", i)
                    yield buffer.pop(0)

            elif time.time() > startTime + 3 and len(buffer) > 0:
                yield buffer.pop(0)

            process.poll()
            if isinstance(process.returncode, int):
                if process.returncode > 0:
                    print('FFmpeg Error', process.returncode)
                break

    response = Response(stream_with_context(generate()), mimetype = "audio/mpeg")

    @response.call_on_close
    def on_close():
        process.kill()
    return response



# -------------AUDIO---------------
#
# ffmpeg -f  alsa -channels 6 -sample_rate 16000 -i hw:3   -b:v 40M -maxrate 50M -bufsize 200M     -field_order tt -fflags nobuffer -threads 1     -vcodec mpeg4 -g 100 -r 30 -bf 0 -mbd bits -flags +aic+mv4+low_delay     -thread_type slice -slices 1 -level 32 -strict experimental -f_strict experimental     -syncpoints none -f nut "tcp://10.10.0.238:1234"
import pyaudio
FORMAT = pyaudio.paInt16
CHANNELS = 2
RATE = 16000
CHUNK = 1024
RECORD_SECONDS = 5
audio1 = pyaudio.PyAudio()
# ReSpeaker 4 Mic Array (UAC1.0): USB Audio (hw:3,0): 1

def genHeader(sampleRate, bitsPerSample, channels):
    datasize = 2000*10**6
    o = bytes("RIFF",'ascii')                                               # (4byte) Marks file as RIFF
    o += (datasize + 36).to_bytes(4,'little')                               # (4byte) File size in bytes excluding this and RIFF marker
    o += bytes("WAVE",'ascii')                                              # (4byte) File type
    o += bytes("fmt ",'ascii')                                              # (4byte) Format Chunk Marker
    o += (16).to_bytes(4,'little')                                          # (4byte) Length of above format data
    o += (1).to_bytes(2,'little')                                           # (2byte) Format type (1 - PCM)
    o += (channels).to_bytes(2,'little')                                    # (2byte)
    o += (sampleRate).to_bytes(4,'little')                                  # (4byte)
    o += (sampleRate * channels * bitsPerSample // 8).to_bytes(4,'little')  # (4byte)
    o += (channels * bitsPerSample // 8).to_bytes(2,'little')               # (2byte)
    o += (bitsPerSample).to_bytes(2,'little')                               # (2byte)
    o += bytes("data",'ascii')                                              # (4byte) Data Chunk Marker
    o += (datasize).to_bytes(4,'little')                                    # (4byte) Data size in bytes
    return o


@app.route('/audio')
def audio():
    # start Recording
    def sound():

        CHUNK = 1024
        sampleRate = 16000
        bitsPerSample = 16
        channels = 6
        wav_header = genHeader(sampleRate, bitsPerSample, channels)

        stream = audio1.open(format=FORMAT, channels=CHANNELS,
                        rate=RATE, input=True,input_device_index=1,
                        frames_per_buffer=CHUNK)
        print("recording...")
        #frames = []
        first_run = True
        while True:
           if first_run:
               data = wav_header + stream.read(CHUNK)
               first_run = False
           else:
               data = stream.read(CHUNK)
           yield(data)

    return Response(sound())

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
from camera import VideoCamera
if(not runningonmacdebug):
    import picamera2 #camera module for RPi camera
    from picamera2 import Picamera2
    from picamera2.encoders import JpegEncoder
    from picamera2.outputs import FileOutput

from threading import Condition


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
    if not runningonmacdebug:
        with picamera2.Picamera2() as camera:
            output = StreamingOutput()
            camera.configure(camera.create_video_configuration(main={"size": (1296,972)}))
            output = StreamingOutput()
            camera.start_recording(JpegEncoder(), FileOutput(output))
            while True:
                with output.condition:
                    output.condition.wait()
                    frame = output.frame
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    else:
        return



# picam2 = Picamera2()
# camera_config = picam2.create_preview_configuration()
# picam2.configure(camera_config)
# encoder = H264Encoder(1000000)

# class StreamingOutput(io.BufferedIOBase):
#     def __init__(self):
#         self.frame = None
#         self.condition = Condition()

#     def write(self, buf):
#         with self.condition:
#             self.frame = buf
#             self.condition.notify_all()


# def gen(camera):
#     while True:
#         frame = camera.get_frame()
#         yield (b'--frame\r\n'
#                b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n\r\n'
#               )

@app.route('/video_feed')
def video_feed():
    return Response(genFrames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

    #buffer = StreamingOutput()
    # while True:
    #     with Picamera2() as camera:
    #         camera.configure(camera.create_video_configuration(main={"size": (640, 480)}))
    #         output = StreamingOutput()
    #         camera.start_recording(JpegEncoder(), FileOutput(output))
    #     yield (b'--frame\r\n'
    #         b'Content-Type: image/jpeg\r\n\r\n' + output.frame + b'\r\n')



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

#@app.route('/audio')
#def audio():
#    try:
#       os.system ("ffmpeg -ar 44100 -ac 1 -f alsa -i plughw:3,0 -f mp3 -listen 1 tcp://0.0.0.0:5002")
#    except Exeption as e:
#        print(e)
#    return "Playing audio"

@app.route("/wheels", methods=["POST"])
def wheels():

    data = json.loads(request.form['json'])
    print(data)
    datastring = ""
    if('r' in data):
        if(data['r'] == 'L'):
            sendToWheels(41)
        if(data['r'] == 'R'):
            sendToWheels(39)
        if(data['r'] == 'M'):
            sendToWheels(40)
        #sendToWheels(data['r'])
        #datastring += "r" + data["r"]
    if('m' in data):
        sendToWheels(data['m'])
        #datastring += "m" + data["m"]
 #   if('p' in data):
 #          patternHandler()
    print('wheels should be moving!', file=sys.stderr)

    
    return make_response(jsonify("success"), 201)

def sendToWheels(value):
    #serWheels.reset_input_buffer()
    #print(message.encode('utf-8'))
    message = chr(value+32)
    while True:
        serWheels.write(message.encode())
        line = serWheels.readline().decode('utf-8').rstrip()
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

def mysplit(s):
    head = s.rstrip('0123456789')
    tail = s[len(head):]
    return head, tail

@app.route("/gaze", methods=["POST"])
def gaze():

    data = json.loads(request.form['json'])
    print(data)
    print(data['g'])
    print('color change!', file=sys.stderr)
    dataDict =  separate_string(data['g'])
    print(dataDict)
    p = dataDict['p']
    t = dataDict['t']
    ps = 1
    if (p < 0):
        ps = 255
    ts = 1
    if (t < 0):
        ts = 255

    pv = abs(p)
    tv = abs(t)

    tfs = 1
    tfv = 0

    cmdbuff = [ord('M'),ps,pv,ts,tv,tfs,tfv,ord('\n')]#command,pan-sign,pan-val,tilt-sign,tilt-val,TF-sign,TF-val

    sendToTama(cmdbuff)
    return make_response(jsonify("success"), 201)

import re
def separate_string(input_string):
    result_dict = {}

    # Using regular expression to find letter-number pairs
    pattern = re.compile(r'([a-zA-Z])(-?\d+)')
    matches = pattern.findall(input_string)

    # Constructing the dictionary
    for match in matches:
        letter, number = match
        result_dict[letter] = int(number)

    return result_dict
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
    #app.run(debug=True,threaded=True)
    socketio.run(app, debug=True)
