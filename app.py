from flask import Flask, send_from_directory, make_response, jsonify, request
import random
import sys
import json
import serial
import time

app = Flask(__name__)

serWheels = serial.Serial('/dev/serial/by-id/usb-Silicon_Labs_CP2104_USB_to_UART_Bridge_Controller_0178C8A8-if00-port0', 115200, timeout=1)
serTama = serial.Serial('/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0', 115200, timeout=1)

pan = 0
tilt = 0

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

    serTama.write(message)



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
    app.run(debug=True)
