# Monkey patch eventlet first
import eventlet
eventlet.monkey_patch()

from flask import Flask, send_from_directory, make_response, jsonify, request, Response
import random
import sys
import json
import serial
import time
from flask_socketio import SocketIO,emit,send
import platform
import subprocess
import os
import signal
import threading
import queue
import atexit
from flask_cors import CORS

mac = False
if (platform.system() == "Darwin"):
    mac = True


# this server works in parallel with uv4L which handles the
# webRTC for the raspberry pi, it should start when powered on, but I
# used this to start it as well..
#
# START UV4L Work:
#
# uv4l --driver raspicam --server-option '--use-ssl=yes' --server-option '-ssl-private-key-file='home/pi/selfsign.key' --enable-usermedia-screen-capturing --server-option 'ssl-certificate-file=/home/pi/selfsign.crt

# sudo uv4l --sched-rr --driver raspicam --auto-video_nr --encoding h264 --width 1920 --height 1080 --server-option '--port=9000'
# uv4l --auto-video_nr --driver raspicam --encoding h264 --server-option '--port=9000'
# sudo service uv4l_raspicam restart


# https://wiki.seeedstudio.com/ReSpeaker-USB-Mic-Array/

app = Flask(__name__, static_folder='client/public')
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,
    engineio_logger=True,
    path='/socket.io/',
    ping_timeout=20,
    ping_interval=25,
    max_http_buffer_size=1e6
)

# this is the placeholder data for the handshake betweeen
# the uv4l and the client side javascript
data = {}

# Global variables for WebRTC
webrtc_process = None
webrtc_queue = queue.Queue()

def start_webrtc_stream():
    global webrtc_process
    
    # GStreamer pipeline for WebRTC with audio
    pipeline = """
    gst-launch-1.0 -v \
        v4l2src device=/dev/video0 ! \
        video/x-raw,width=1280,height=720,framerate=30/1 ! \
        videoconvert ! \
        x264enc tune=zerolatency bitrate=1000 speed-preset=ultrafast ! \
        video/x-h264,profile=baseline ! \
        h264parse ! \
        rtph264pay config-interval=1 pt=96 ! \
        queue ! \
        webrtcbin name=webrtc \
        alsasrc device=hw:3 ! \
        audioconvert ! \
        audio/x-raw,channels=2,rate=48000 ! \
        opusenc ! \
        rtpopuspay ! \
        queue ! \
        webrtc. \
        webrtc. ! \
        rtpjitterbuffer ! \
        rtpopusdepay ! \
        opusdec ! \
        audioconvert ! \
        alsasink device=hw:3
    """
    
    try:
        # Kill any existing webrtc process
        if webrtc_process:
            stop_webrtc_stream()
        
        # Start GStreamer pipeline
        webrtc_process = subprocess.Popen(
            pipeline,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid
        )
        print("WebRTC stream started successfully")
        return True
    except Exception as e:
        print(f"Error starting WebRTC stream: {e}")
        return False

def stop_webrtc_stream():
    global webrtc_process
    if webrtc_process:
        try:
            os.killpg(os.getpgid(webrtc_process.pid), signal.SIGTERM)
            webrtc_process = None
            print("WebRTC stream stopped successfully")
            return True
        except Exception as e:
            print(f"Error stopping WebRTC stream: {e}")
    return False

# Initialize WebRTC stream
def init_webrtc():
    try:
        start_webrtc_stream()
        print("WebRTC stream started successfully")
    except Exception as e:
        print(f"Error starting WebRTC stream: {e}")

# Register cleanup function
atexit.register(stop_webrtc_stream)

# Initialize WebRTC on first request
@app.before_request
def before_request():
    if not hasattr(app, '_webrtc_initialized'):
        init_webrtc()
        app._webrtc_initialized = True

# WebRTC signaling endpoints
@socketio.on('connect')
def handle_connect():
    print(f"Client {request.sid} connected")
    return {'data': f'id: {request.sid} is connected'}

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client {request.sid} disconnected")

@socketio.on('offer')
def handle_offer(data):
    try:
        print(f"Received offer from {request.sid}")
        print("Offer data:", data)
        
        # Create answer with media tracks
        answer = {
            "type": "answer",
            "sdp": data['sdp'].replace('IN IP4 127.0.0.1', 'IN IP4 0.0.0.0'),
            "id": "server"
        }
        
        print("Sending answer:", answer)
        socketio.emit('get_answer', answer, room=request.sid)
    except Exception as e:
        print(f"Error handling offer: {e}")
        return {'error': str(e)}

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    try:
        print(f"Received ICE candidate from {request.sid}")
        print("ICE candidate data:", data)
        socketio.emit('ice-candidate', data, room=request.sid)
    except Exception as e:
        print(f"Error handling ICE candidate: {e}")
        return {'error': str(e)}

@socketio.on("get_offer")
def getOffer():
    try:
        if "offer" in data:
            j = json.dumps(data["offer"])
            del data["offer"]
            print("Sending offer to client")
            return Response(j, status=200, mimetype='application/json')
    except Exception as e:
        print(f"Error getting offer: {e}")
    return Response(status=503)

@socketio.on("get_answer")
def getAnswer():
    try:
        if "answer" in data:
            j = json.dumps(data["answer"])
            del data["answer"]
            print("Sending answer to client")
            return Response(j, status=200, mimetype='application/json')
    except Exception as e:
        print(f"Error getting answer: {e}")
    return Response(status=503)

@socketio.on("get_ice_candidates")
def get_ice_candidates():
    try:
        if "candidates" in data and len(data["candidates"]) > 0:
            j = json.dumps(data["candidates"])
            data["candidates"] = []
            print("Sending ICE candidates to client")
            return Response(j, status=200, mimetype='application/json')
    except Exception as e:
        print(f"Error getting ICE candidates: {e}")
    return Response(status=503)

# Add routes to start/stop WebRTC stream
@app.route("/start_stream", methods=["POST"])
def start_stream():
    if start_webrtc_stream():
        return jsonify({"status": "success", "message": "WebRTC stream started"})
    return jsonify({"status": "error", "message": "Failed to start WebRTC stream"}), 500

@app.route("/stop_stream", methods=["POST"])
def stop_stream():
    if stop_webrtc_stream():
        return jsonify({"status": "success", "message": "WebRTC stream stopped"})
    return jsonify({"status": "error", "message": "Failed to stop WebRTC stream"}), 500

############ MAIN SVELTE AND WEBSITE


# Path for our main Svelte page
@app.route("/")
def base():
    return send_from_directory('client/public', 'index.html')

# Path for all the static files (compiled JS/CSS, etc.)
@app.route("/<path:path>")
def home(path):
    return send_from_directory('client/public', path)

# old test
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




################# TAMA CONTROLS

# these are the usb connections to the wheels and the head
try:
    serWheels = serial.Serial('/dev/serial/by-id/usb-Silicon_Labs_CP2104_USB_to_UART_Bridge_Controller_0178CB43-if00-port0', 115200, timeout=1)                                            
except:
    print("ERROR WITH SERIAL WHEELS")
    #runningonmacdebug=True
try:
    serTama = serial.Serial('/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0', 9600, timeout=1)                                        
except:
    print("ERROR WITH SERIAL TAMA")
    #runningonmacdebug=True





# ------ TAMA WHEELS ------

# this is the channel in for controlling the wheels
# the input is between 0-x for moving
# speed is between y-z
# and turing is R: 39, M: 40, L: 41
@app.route("/wheels", methods=["POST"])
def wheels():

    data = json.loads(request.form['json'])
    print(data)
    datastring = ""
    if('r' in data):
        if(data['r'] == 'K'):
            sendToWheels(45)
        elif(data['r'] == 'L'):
            sendToWheels(49)
        elif(data['r'] == 'T'):
            sendToWheels(55)
        elif(data['r'] == 'R'):
            sendToWheels(54)
        elif(data['r'] == 'M'):
            sendToWheels(50)
        else:
            print(data['r'])
            sendToWheels(data['r'])
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
        #line = serWheels.readline().decode('utf-8').rstrip()
        break

# –––––– Wheels raw ––––––
# rawdata = '{"s":400,"d":90,"r":100}'
@app.route("/omniwheels", methods=["POST"])
def omniwheels():
    rawdata = str(request.form['json'])
    data = json.loads(rawdata)
    print("omniwheel test print")
    print(rawdata)
    print(rawdata.encode())
    print(data)
    serWheels.write(rawdata.encode())
    return make_response(jsonify("success"), 201)


# ------ TAMA HEAD ------


pan = 0
tilt = 0


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

    ## DEBUG SOLUTION
    ##
    tfv = int(tv/2)
    tv = 0
    ## EDN OF DEBUG
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
#
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

@app.route("/speak", methods=["POST"])
def speak():
    try:
        text = request.form.get('text')
        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Try the most likely command first
        cmd = f"ovos-speak '{text}'"
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=2)
            if result.returncode == 0:
                return jsonify({"status": "success", "message": "Text spoken successfully"})
        except subprocess.TimeoutExpired:
            return jsonify({"error": "Speech command timed out"}), 500
        except Exception as e:
            # If first command fails, try alternatives
            commands = [
                "ovos-cli-client speak",
                "ovos-skill-speak speak",
                "ovos-tts"
            ]
            
            for cmd_base in commands:
                try:
                    cmd = f"{cmd_base} '{text}'"
                    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=2)
                    if result.returncode == 0:
                        return jsonify({"status": "success", "message": "Text spoken successfully"})
                except Exception:
                    continue
            
            return jsonify({"error": "Failed to speak text with any available command"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    socketio.run(app, host='0.0.0.0', port=5050, debug=True)
