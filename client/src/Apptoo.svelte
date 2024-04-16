<script>
// just the logo
 import Tama from './Tama.svelte';
 // This is the UI element on the site – hardly functional right now
 import Controller from './Controller.svelte';
 // This is the module that takes the connected game controller inputs
 import Gamepad from "./Gamepad.svelte";
 // This is for establishing connection with UV4L for video chat
 import Signaling from './Signaling.svelte';














// ################ TAMA ################

let stateTama = {
    speed: 0,
    direction: 0,
    rotation: {0}
};

$: {
    var obj = {s: stateTama.speed,d: stateTama.direction,r: stateTama.rotation};
    sendOmniWheel(obj);
}

async function sendOmniWheel(obj){//speed,direction,rotation) {
     //var obj = {s: speed,d: direction,r: rotation}
     console.log(obj)
     var dataToSend = new FormData();
     dataToSend.append( "json", JSON.stringify( obj ) );
     console.log(dataToSend)
     const res = await fetch('./omniwheels', {
         method: "POST",
         body: dataToSend
     })
     const json = await res.json()
	 console.log(JSON.stringify(json))
 }

 // Old version – sending actions letters r/m and numbers
 async function sendWheel(action,direction) {
     var obj = {[action]: direction}

         var dataToSend = new FormData();
     dataToSend.append( "json", JSON.stringify( obj ) );

     const res = await fetch('./wheels', {
         method: "POST",
         body: dataToSend
     })
     const json = await res.json()
	 console.log(JSON.stringify(json))
 }

// ################ GAMEPAD ################

let stateGamepad = {
    leftAxis: { x: 0, y: 0 },
    rightAxis: { x: 0, y: 0 },
    right: {},
    left: {},
    speedtoggle: {1}

};


function LeftStick(event) { state.leftAxis = event.detail; }

function RightStick(event) { state.rightAxis = event.detail; }

function RSPressed(event) {
    if (stateGamepad.speedtoggle = 1){
        stateGamepad.speedtoggle = 0.5
    }
    else{
        stateGamepad.speedtoggle = 1
    }

 }





$: {
     // This reactive statement will run whenever the state changes
     let newDegrees = calculateVectorInfo(state.stateGamepad['x'],state.stateGamepad['y']).angleDegrees
     let newSpeed = calculateVectorInfo(state.stateGamepad['x'],state.stateGamepad['y']).vectorLength*stateGamepad.speedtoggle
     let newRotation = stateGamepad.right + stateGamepad.left

     if(newSpeed == 0){
         if(stateTama.speed != 0){
            stateTama.speed = 0
         }
     }
     if(Math.abs(stateTama.speed-newSpeed)>0.1){
        stateTama.speed = newSpeed
        //sendWheel('m',Math.round(speed*6)*speedmulti+32)
         isMoving = true;
     }
     newDegrees = (Math.round((270-newDegrees)/11.25)*11.25)%360
     if (newDegrees != degrees){
         degrees = newDegrees
         //sendWheel('m',Math.round(degrees/11.25))
     }
     
 }


// ################ KEYBOARD ################

let stateKeyboard = {
    forward: 0,
    left: 0,
    right: 0,
    back: 0,
    rotate: 0,
    rotatespeed: 0,
    directionspeed: 0
};



// ################ UI ################

// function to handle the form submit
function handleSubmit(e) {	
		const formData = new FormData(e.target)
		let data = {s:0,d:0,r:0}	
		for (let field of formData) {
			let [key, value] = field
			data[key] = parseInt(value)		
		}
        console.log(data)
		sendOmniWheel(data)
	}

 // ################ GAZE CONTROLLER ################

 // These are the blurring and gaze clicking functions


 let blurPoint = [50,50];
 let clickPoint = [.5,.5];

 function getPoint(e){
     // This takes in the point and moves the gaze, but also the unblurred point in the image prob could be done better (this i am translating values back and forth in a weird way), but it works
     let view = document.getElementById('tamaview');
	 clickPoint = [e.offsetX/e.target.width,e.offsetY/e.target.height]
     let angles =""
     blurPoint = [clickPoint[0]*100,clickPoint[1]*100];
     // 0 -> 30 1->-30 ; 1-> 0
     console.log("click point = " + clickPoint)
     let aX = Math.floor((0.5 - clickPoint[0])*60);
     let aY = Math.floor((1 - clickPoint[1])*48);
     console.log("ax = " + aX)
     console.log("ay = " + aY)
     console.log("just test = ")

     angles = "p" + aX + "t" + aY;
     sendGaze(angles)
 };

// tried to use this for more continious moving gaze if the user
// was using a touchscrene, but the eyes were a bit to slow for it
// maybe can be tested again!

function onMouseMove (event) {
     //getPoint(event)
 }

 function onMouseDown (event) {
     addEventListener('mousemove', onMouseMove)
     addEventListener('mouseup', onMouseUp)
     getPoint(event)
 }

 function onMouseUp () {
     removeEventListener('mousemove', onMouseMove)
     removeEventListener('mouseup', onMouseUp)
     //getPoint(event)
 }



 let collist= [{
	 id: "R",
	 name: 'Red'
 }, {
	 id: "G",
	 name: 'Green'
 }, {
	 id: "B",
	 name: 'Blue'
 }];


 // sending stuff down to the server!

 async function sendCol(color) {
     console.log(color)
     var obj = {'c': color}

         var dataToSend = new FormData();
     dataToSend.append( "json", JSON.stringify( obj ) );

     const res = await fetch('./color', {
         method: "POST",
         body: dataToSend
     })
     const json = await res.json()
	 console.log(JSON.stringify(json))
 }
 async function sendGaze(gaze) {
     var obj = {'g': gaze}

         var dataToSend = new FormData();
     dataToSend.append( "json", JSON.stringify( obj ) );

     const res = await fetch('./gaze', {
         method: "POST",
         body: dataToSend
     })
     const json = await res.json()
	 console.log(JSON.stringify(json))
 }


// ################ WEBSOCKETS ################

var raspi;
var myID;


// socketio
var protocol = window.location.protocol;
var socket = io(protocol + '//' + document.domain + ':' + location.port, {autoConnect: true});

// Send audio but not video to tamatoo
var Constraints = {
    audio: true,
    video: false
}

// connect to socket server
socket = io.connect();
socket.on('connect', function() {
    socket.emit('my event', {data: 'I\'m connected!'});
});

var signalling_server_hostname = location.hostname || "192.168.1.8";
var signalling_server_address = signalling_server_hostname + ':' + (9000 || (location.protocol === 'https:' ? 443 : 80));


function createPeerConnection() {
   try {
       var pcConfig_ = pcConfig;
       try {
           ice_servers = document.getElementById('ice_servers').value;
           if (ice_servers) {
               pcConfig_.iceServers = JSON.parse(ice_servers);
           }
       } catch (e) {
           alert(e + "\nExample: "
                   + '\n[ {"urls": "stun:stun1.example.net"}, {"urls": "turn:turn.example.org", "username": "user", "credential": "myPassword"} ]'
                   + "\nContinuing with built-in RTCIceServer array");
       }
       console.log(JSON.stringify(pcConfig_));
       pc = new RTCPeerConnection(pcConfig_, pcOptions);
       pc.onicecandidate = onIceCandidate;
       if ('ontrack' in pc) {
           pc.ontrack = onTrack;
       } else {
           pc.onaddstream = onRemoteStreamAdded; // deprecated
       }
       pc.onremovestream = onRemoteStreamRemoved;
       pc.ondatachannel = onDataChannel;
       console.log("peer connection successfully created!");
   } catch (e) {
       console.error("createPeerConnection() failed");
   }
}


var MEDIA_CONSTRAINTS = {
    optional: [],
    mandatory: {
                   OfferToReceiveAudio: false,
                   OfferToReceiveVideo: true
               }
}


var calldata = {
        what: "call",
        options: {
     force_hw_vcodec: true,
     vformat: 30,
     trickle_ice: true
  }
}
function onTrack(event) {
               REMOTE_VIDEO_ELEMENT.srcObject = event.streams[0];
}










    // ################ GETTING THE MIC FROM THE LAPTOP

    // GET AUDIO FROM GGOOGLES EXAMPLE: https://github.com/webrtc/samples/blob/gh-pages/src/content/getusermedia/audio/js/main.js



    'use strict';

    // Put variables in global scope to make them available to the browser console.
    const audio = document.querySelector('audio');

const constraints = window.constraints = {
    audio: true,
    video: false
};




 </script>