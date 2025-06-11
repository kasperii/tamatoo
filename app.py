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
import glob
from gtts import gTTS
import tempfile
import logging
from ovos_utils.messagebus import Message
from ovos_utils.process_utils import RuntimeRequirements
from ovos_utils.log import LOG

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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache for TTS audio files
tts_cache = {}

def check_camera():
    """Check if camera is accessible and list available devices"""
    try:
        # Check for libcamera GStreamer plugin
        result = subprocess.run(['gst-inspect-1.0', 'libcamerasrc'], capture_output=True, text=True)
        if result.returncode != 0:
            print("WARNING: GStreamer libcamera plugin not found")
            return False
            
        # Test GStreamer pipeline with libcamera
        test_pipeline = "libcamerasrc ! video/x-raw,width=640,height=480,framerate=30/1 ! videoconvert ! fakesink"
        result = subprocess.run(['gst-launch-1.0', '-v', test_pipeline], capture_output=True, text=True)
        if result.returncode != 0:
            print("WARNING: Failed to test GStreamer pipeline")
            print(result.stderr)
            return False
            
        return True
            
    except Exception as e:
        print(f"Error checking camera: {e}")
        return False

def check_audio():
    """Check if audio devices are available"""
    try:
        # List all audio input devices
        input_devices = subprocess.check_output(['arecord', '-l'], stderr=subprocess.STDOUT).decode()
        print("Available audio input devices:")
        print(input_devices)
        
        # List all audio output devices
        output_devices = subprocess.check_output(['aplay', '-l'], stderr=subprocess.STDOUT).decode()
        print("Available audio output devices:")
        print(output_devices)
        
        # Try to find a working audio device
        for i in range(4):  # Check first 4 devices
            try:
                test_cmd = f"ffmpeg -f alsa -i hw:{i} -t 1 -f null -"
                subprocess.run(test_cmd, shell=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
                print(f"Found working audio device: hw:{i}")
                return f"hw:{i}"
            except:
                continue
        return None
    except Exception as e:
        print(f"Error checking audio: {e}")
        return None

def check_gstreamer():
    """Check GStreamer installation and capabilities"""
    try:
        # Check GStreamer version
        result = subprocess.run(['gst-launch-1.0', '--version'],
                              capture_output=True, text=True)
        print("\nGStreamer version:")
        print(result.stdout)
        
        # Check only essential plugins that are guaranteed to exist
        required_plugins = [
            'v4l2src',
            'videoconvert',
            'autovideosink',
            'alsasrc',
            'alsasink',
            'audioconvert',
            'fakesink'
        ]
        
        print("\nChecking essential GStreamer plugins:")
        for plugin in required_plugins:
            result = subprocess.run(['gst-inspect-1.0', plugin],
                                  capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✓ {plugin} is available")
            else:
                print(f"✗ {plugin} is NOT available")
        
        return True
    except Exception as e:
        print(f"Error checking GStreamer: {e}")
        return False

def start_webrtc_stream():
    """Start the WebRTC stream using GStreamer with libcamera"""
    global webrtc_process
    
    try:
        # Check for camera
        if not check_camera():
            print("ERROR: No camera found or camera not working")
            return False
            
        # Build the GStreamer pipeline with libcamera
        gst_cmd = [
            "gst-launch-1.0",
            "-v",
            "libcamerasrc",
            "!",
            "video/x-raw,width=640,height=480,framerate=30/1",
            "!",
            "videoconvert",
            "!",
            "x264enc",
            "tune=zerolatency",
            "speed-preset=ultrafast",
            "!",
            "h264parse",
            "!",
            "mpegtsmux",
            "!",
            "fdsink"
        ]
        
        # Join the command
        cmd_str = " ".join(gst_cmd)
        print(f"Starting GStreamer pipeline: {cmd_str}")
        
        # Start the process
        webrtc_process = subprocess.Popen(
            cmd_str,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        # Start a thread to monitor the process output
        def monitor_process():
            while webrtc_process and webrtc_process.poll() is None:
                output = webrtc_process.stdout.readline()
                if output:
                    print(f"GStreamer: {output.strip()}")
                error = webrtc_process.stderr.readline()
                if error:
                    print(f"GStreamer Error: {error.strip()}")
        
        threading.Thread(target=monitor_process, daemon=True).start()
        
        return True
        
    except Exception as e:
        print(f"Error starting GStreamer stream: {e}")
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
            'type': 'answer',
            'sdp': data['sdp'].replace('IN IP4 127.0.0.1', 'IN IP4 0.0.0.0'),
            'id': 'server'
        }
        
        # Add media tracks to SDP if not present
        if 'm=audio' not in answer['sdp']:
            answer['sdp'] += '\nm=audio 9 UDP/TLS/RTP/SAVPF 111\nc=IN IP4 0.0.0.0\na=rtpmap:111 opus/48000/2\n'
        if 'm=video' not in answer['sdp']:
            answer['sdp'] += '\nm=video 9 UDP/TLS/RTP/SAVPF 96\nc=IN IP4 0.0.0.0\na=rtpmap:96 H264/90000\n'
        
        # Add ICE candidates to SDP
        answer['sdp'] += '\na=ice-ufrag:server\n'
        answer['sdp'] += 'a=ice-pwd:serverpass\n'
        answer['sdp'] += 'a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00\n'
        
        print("Sending answer:", answer)
        emit('get_answer', answer)
    except Exception as e:
        print(f"Error handling offer: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    try:
        print(f"Received ICE candidate from {request.sid}")
        print("ICE candidate data:", data)
        emit('ice-candidate', data)
    except Exception as e:
        print(f"Error handling ICE candidate: {str(e)}")
        emit('error', {'message': str(e)})

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

        try:
            from ovos_utils.messagebus import MessageBusClient
            from ovos_utils.messagebus import Message
            
            # Create message bus client
            bus = MessageBusClient()
            bus.run_in_thread()
            
            # Wait for connection
            bus.wait_for_message("mycroft.ready")
            
            # Send speak message
            msg = Message("speak", {"utterance": text})
            bus.emit(msg)
            
            logger.info("Sent speak message via message bus")
            return jsonify({
                "status": "success",
                "message": "Text sent to message bus",
                "method": "message_bus"
            })
            
        except Exception as e:
            logger.error(f"Message bus approach failed: {e}")
            
            # Fallback to direct TTS if message bus fails
            try:
                import subprocess
                cmd = f"ovos-speak '{text}'"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    return jsonify({
                        "status": "success",
                        "message": "Text spoken using ovos-speak",
                        "method": "ovos-speak"
                    })
                else:
                    logger.error(f"ovos-speak failed: {result.stderr}")
                    return jsonify({
                        "error": "Failed to speak text",
                        "details": result.stderr
                    }), 500
                    
            except Exception as tts_error:
                logger.error(f"Direct TTS failed: {tts_error}")
                return jsonify({
                    "error": "Failed to speak text",
                    "details": str(tts_error)
                }), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in speak function: {e}")
        return jsonify({"error": str(e)}), 500

# Cleanup function to remove temporary files
def cleanup_tts_cache():
    for file_path in tts_cache.values():
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
        except Exception as e:
            logger.error(f"Error cleaning up TTS cache: {e}")

# Register cleanup on application exit
atexit.register(cleanup_tts_cache)

# Add debug endpoint
@app.route("/debug", methods=["GET"])
def debug():
    """Endpoint to run hardware checks"""
    camera_ok = check_camera()
    audio_ok = check_audio()
    gstreamer_ok = check_gstreamer()
    
    return jsonify({
        'camera': camera_ok,
        'audio': audio_ok,
        'gstreamer': gstreamer_ok,
        'webrtc_process_running': webrtc_process is not None and webrtc_process.poll() is None
    })

if __name__ == "__main__":
    socketio.run(app, host='0.0.0.0', port=5050, debug=True)
