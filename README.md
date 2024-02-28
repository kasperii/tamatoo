***************General summary***************

Main part of tama is build using a raspberry pi 4 and a spare battery that is charged, but should according to specifications last for more than an hour. (the battery life has not been thoroughly tested but did last for our pilot test)

The set up also includes:

- A camera
- a microphone
- flat usb extension chords and a usb hub – so that usb connections are not pinned by the roof of the build
- An arduino for the wheels
- the wheel platform
- A usb to serial connection for the head
- The head
- and a speaker (although this has not been properly tested)

The core of the code running a server, with a web interface that can be connected to on the same router.

The remote person can connect to the website on their laptop and send commands as well as see the video feed and audio from the robot.

Similarly another function is to send audio back to the tama, although this has not been properly tested as the speakers were relaying quite a bit of echo, and being generally a bit too low quality to be audible.

The server is split into two.

First the flask server. It hosts the WOZ website, and takes tama (head) movement and wheel movement command from the client. These are sent through usb serial connection to the head and the wheels arduino.

Secondly is the uv4l running on the raspberry pi – that handles the webrtc connection between client and the pi.

Lastly there is an arduino that handles the wheels command. This one receives int and translates these to direction, speed, and rotation.

## Raspi OS

It is running on Debian 32-bit Bullseye. The latest bookwork gave me problems with running uv4l, and the videostreaming set-up has severe delay, hence now it is downgraded.

I access the rasppi through ssh. I access it through `ssh tama@10.10.0.163` with passwork ‘tama’. The ip could be set-up to be static, but I never managed this ans thus-far the raspi has always landed on 163. 

## flask

Flask is a simple server setup. Possibly this is not flask anymore but socketIO (https://flask-socketio.readthedocs.io/en/latest/)? Never the less, it is run by navigating to the /Documents/tamatoo and by running `python [app.py](http://app.py)`. Really, a better practice is activating the venv before `. /venv/bin/activate`... but I believe all of the dependencies are actually installed now after developing it, so probably not needed.

Flask opens up a website on the port :5050 [10.10.0.163:5050]. The server then listens to posts to /eyes /gaze and /wheels. These are then sent to the usb serial connections where they change gaze and movement.

## uv4l

The second server that should be activated is the uv4l. This is a streaming server allowing webRTC communication between the raspi and the client. This should technically be activated at start up, but it doesn’t currently. Start it up by writing:

`uv4l --auto-video_nr --driver raspicam --vflip true --encoding h264 --width 1920 --height 1080 --server-option '--webrtc-receive-audio=yes' --enable-server --server-option '--port=9000' --syslog-host localhost`

The server can be tested at port :9000 [10.10.0.163:9000]. This server should both send audio and video data – but also listen to audio data from the client. I have had problems with the listening, sometimes it does not work. I believe that is due to the encoding, so if it does not work test another encoding such as --encoding mjpeg . Remember to close call before leaving the window. Quite often you end up getting the error message ‘device busy’ – I have solved it by restarting the program by first typing `pkill uv4l` and then restarting it.

## Svelte

Frontend is compiled using svelte – a light weight framework to generate websited. Most of it is basic javascript, but with some responsive functionalities.

The generated page is the WOZ page. This page serves several functions. It

1. takes in controller inputs from a connected game pad from the laptop and sends these instructions down to the flask server. 
2. when pressing open connection, it connects to the uv4l and streams video and audio data to a window on the page.
3. When pressing the image, the blur filter is updated to show what you are gazing at – and at the same time it sends new directions (pitch and yaw) to the head, and thus updating the gaze.
4. There are also three eye color buttons, mostly for debugging purposes.
5. The page also listens to the computers microphone and streams this data to the tama.

The code to compile is placed in the /client/src – when the code is altered, run: `npm run build` in the /client folder. Svelte can also run a server to test the frontend while working on the page by `npm run dev` .

The svelte code is split up in some files – but the only ones that really matter are app (that does the bulk of it) and gamepad (that customises the controllers inputs). The controllers inputs can be changed in "./layouts/XBOX.js”.

## steering

Steering data is taken from the controller (L/R buttons and the steering stick). These are sent as JSON files to the backend 

0-31 is the direction

32 stop 33-38 is speed in increments of 100

39-52 is rotation speed (with 45 being neutral)

`if(c < 32){d = c*11,25;}`

`else if(c < 39){s = (c-32)*100;}`

`else if(c < 52){r = (c - 45)*100;}`

## gaze

The gaze is controlled by sending a string to the head. 

[ord('M'),ps,pv,ts,tv,tfs,tfv,ord('\n')]#command,pan-sign,pan-val,tilt-sign,tilt-val,TF-sign,TF-val

the sign ones are -1 or 1 depending on direction and the value is amount of turning. Pan and tilt are the eyes, and the TF is the full head.

These are taken from the point of click on the camera feed on the client page. These are at times a bit slow, I believe since the battery source is a right now taken from the wheels, and it might need a separate one in the future.
