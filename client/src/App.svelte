

<script>
 import Tama from './Tama.svelte';
 import Controller from './Controller.svelte';
 import Gamepad from "./Gamepad.svelte";
 import Signaling from './Signaling.svelte';
 let state = {
     leftAxis: { x: 0, y: 0 },
     rightAxis: { x: 0, y: 0 },
     dpad: {},
     buttons: {},

 };
 let degrees = 0;
 let speed = 0;
 let isMoving = false;
 let compass = ['r','t','y','g','h','j','b','v','c','x','z','a','s','d','w','e','r']
 // Variable to toggle slow movement
 let speedmulti = 1





 // ################ WEBSOCKETS

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

 //
 //  function handleSuccess(stream) {
 //      const audioTracks = stream.getAudioTracks();
 //      console.log('Got stream with constraints:', constraints);
 //      console.log('Using audio device: ' + audioTracks[0].label);
 //      stream.oninactive = function() {
 //          console.log('Stream ended');
 //      };
 //      window.stream = stream; // make variable available to browser console
 //      audio.srcObject = stream;
 //  }
 //
 //  function handleError(error) {
 //      const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
 //      document.getElementById('errorMsg').innerText = errorMessage;
 //      console.log(errorMessage);
 //  }
 //
 //  navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);
 //
 //
 //








 // ################ GAMEPAD DETECTORS CONTROLLERs


 function gamepadChangeState(button){
     state[buttons][button] = button.detail;

 }

 function dpad(direction){
     state.buttons[direction] = button.detail;
 }

 function gamepadConnected(event) {
     console.log(`app: gamepad ${event.detail.gamepadIndex} connected`);
 }
 function APressed(event) {
     if (state.buttons["A"] != event.detail){
         state.buttons["A"] = event.detail;
         if(state.buttons["A"]==null){
             return
         }
         else{
             return
         }

     }

 }

 function RTPressed(event) {
     if (state.buttons["RT"] != event.detail){
         if(state.buttons["RT"]==null){
             sendWheel("r","R")
             console.log("rotate R")

         }
         else{
             sendWheel("r","M")
             console.log("rotate M")
         }

         state.buttons["RT"] = event.detail;

     }

 }

 function LTPressed(event) {
     if (state.buttons["LT"] != event.detail){
         if(state.buttons["LT"]==null){
             sendWheel("r","L")
             console.log("rotate L")
         }
         else{
             sendWheel("r","M")
             console.log("rotate M")
         }
         state.buttons["LT"] = event.detail;

     }

 }

 function RBPressed(event) {
     if (state.buttons["RB"] != event.detail){
         if(state.buttons["RB"]==null){
             sendWheel("r","R")
             console.log("rotate R")
         }
         else{
             sendWheel("r","M")
             console.log("rotate M")
         }
         state.buttons["RB"] = event.detail;

     }

 }

 function LBPressed(event) {
     if (state.buttons["LB"] != event.detail){
         if(state.buttons["LB"]==null){
             sendWheel("r","L")
             console.log("rotate L")
         }
         else{
             sendWheel("r","M")
             console.log("rotate M")
         }
         state.buttons["LB"] = event.detail;

     }

 }

 function RSPressed(event) {
     if (state.buttons["RS"] != event.detail){
         state.buttons["RS"] = event.detail;
         if(state.buttons["RS"]==null){
             return
         }
         else if(speedmulti == 1){
             speedmulti=0.25
         }
         else{
             speedmulti=1
         }

     }

 }
 function LSPressed(event) {
    return

 }

 // ################ WHEELS CONTROLLERs



 function LeftStick(event) {
     state.leftAxis = event.detail;

 }

 function RightStick(event) {
     state.rightAxis = event.detail;
 }

 function calculateVectorInfo(x, y) {
     // Calculate the angle in radians

     let angleRadians = Math.atan2(y, x);

     // Convert radians to degrees
     let angleDegrees = (angleRadians * 180) / Math.PI;

     // Ensure the angle is between 0 and 360 degrees
     angleDegrees = (angleDegrees + 360) % 360;

     // Calculate the length of the vector
     let vectorLength = Math.sqrt(x * x + y * y);

     // Return the result
     return {
         angleDegrees: angleDegrees,
         vectorLength: vectorLength
     };
 }

 $: {
     // This reactive statement will run whenever the state changes
     let newDegrees = calculateVectorInfo(state.leftAxis['x'],state.leftAxis['y']).angleDegrees
     let newSpeed = calculateVectorInfo(state.leftAxis['x'],state.leftAxis['y']).vectorLength
     if(newSpeed == 0){
         if(isMoving){
             speed = 0
             isMoving = false
             sendWheel('m',32)
             degrees = 0
             sendWheel('m',0)
         }
     }
     if(Math.abs(speed-newSpeed)>0.1){
         speed = newSpeed
         sendWheel('m',Math.round(speed*6)+32*speedmulti)
         isMoving = true;
     }
     newDegrees = (Math.round((270-newDegrees)/11.25)*11.25)%360
     if (newDegrees != degrees){
         degrees = newDegrees
         sendWheel('m',Math.round(degrees/11.25))
     }
 }

 let movement = 'r0';

// sedning stuff down for the wheels!

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


 // just debugging aand test

 function debut(){
     console.log(movement)
 }
 let rand = -1;
 $: {
     // console.log("OUTSIDe")
     // console.log(movement)
     // console.log(movement.substring(0, 1));
     // console.log(movement.substring(1));

     sendWheel(movement.substring(0,1),movement.substring(1))
 }

 function getRand() {
     fetch("./rand")
         .then(d => d.text())
         .then(d => (rand = d));
 }



 // ################ GAZE CONTROLLERs

 // These are the blurring and gaze clicking functions


 let blurPoint = [50,50];
 let clickPoint = [.5,.5];

 function getPoint(e){
     // This takes in the point and moves the gaze, but also the unblurred point in the image prob could be done better (this i am translating values back and forth in a weird way), but it works
     let view = document.getElementById('tamaview');
	 clickPoint = [e.offsetX/e.target.width,e.offsetY/e.target.height]
     let angles =""
     blurPoint = [clickPoint[0]*100,clickPoint[1]*100];

     let aX = Math.floor((clickPoint[0]-.5)*60);
     let aY = Math.floor((clickPoint[1])*60);
     console.log("ax = " + aX)
     console.log("ay = " + aY)

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




</script>

<!-- just a logo -->

<Tama />

<!-- old controller, but also start call and hangup button -->
<div class="row">
      <div class="column" id="text">
          {#each collist as col}
              <button on:click={() => sendCol(col.id)}>{col.name}</button>
          {/each}
      </div>
      <div class="column" id="controller">
          <Controller bind:movement/>
      </div>
      <div class="column" id="view"></div>
</div>
<!-- <h1>Your number is {rand}!</h1> -->
<button on:click={getRand}>Get a random number</button>
<button on:click={debut}>Debug</button>


<!--
     The controller detector, when pn clicked
     it triggers the corresponding fuctions in the scripts above
-->

<Gamepad
    gamepadIndex={0}
    on:Connected={gamepadConnected}
    on:A={APressed}
    on:RT={RTPressed}
    on:LeftStick={LeftStick}
    on:RightStick={RightStick}
    on:LB={LBPressed}
    on:RB={RBPressed}
    on:RT={RTPressed}
    on:LT={LTPressed}
    on:RS={RSPressed}
    on:LS={LSPressed}
    on:DPadUp={ () => dpad("U")}
    on:DPadDown={ () => dpad("D")}
    on:DPadLeft={ () => dpad("L")}
    on:DPadRight={ () => dpad("R")}

    />

    <!--
         THe first layer is the unblurred livestream
         The second is blurred, with a circle clippath
         that is changed when clickin on the third layer
         w is only there for detecting onmousedown
    -->

    <div class="blur-container">
        <video class="underlay" id="tamaview"> </video>
        <!-- <video class="overlay" id="tamablur" style="clip-path: circle(40% at {blurPoint[0]}% {blurPoint[1]}%)"></video> -->
        <div class="focus" style="-webkit-mask: radial-gradient(circle at {blurPoint[0]}% {blurPoint[1]}%, #00000000 250px, rgba(0, 0, 0, 0.9) 0px);"></div>
        <img class="overlay" on:mousedown={onMouseDown}>
    </div>
    <!-- <audio controls>
         <source src="./ffmpeg" type="audio/mpeg">
         <source src="./audio" type="audio/x-wav;codec=pcm">
         Your browser does not support the audio element.
         </audio> -->



    <audio id="gum-local" controls autoplay></audio>

    <Signaling />











<style>
 main {
	 text-align: center;
	 padding: 1em;
	 max-width: 240px;
	 margin: 0 auto;
 }


 h1 {
	 color: #ff3e00;
	 text-transform: uppercase;
	 font-size: 4em;
	 font-weight: 100;
 }



 @media (min-width: 640px) {
	 main {
		 max-width: none;
	 }
 }
 #text {
     background-color: beige;
     width: 20%;
 }
 #controller {
     width: 200px;
 }
 #view {
     width: 50%;
     background-color: beige;
 }
 .column {
     float: left;
 }
 video {
     width: 100%;
     height: 100%;
     object-fit: cover;
     /* -webkit-transform: rotate(180deg);
        -moz-transform: rotate(180deg);
        -o-transform: rotate(180deg);
        transform: rotate(180deg); */
     -webkit-user-drag: none;

     filter: FlipH;
     -ms-filter: "FlipH";
 }

 .blur-container {
     position: relative;
     width: 1296px;
     height: 972px;
     overflow: hidden;
 }

 .blur-container img {
     width: 100%;
     height: 100%;
     object-fit: cover;

 }
 .blur-container .underlay {
     position: absolute;
 	 top: 0;
  	 left: 0;

     transform: scale(1.06);
 }
 .blur-container .overlay {
     position: absolute;
 	 top: 0;
  	 left: 0;
 }
 .focus{

     width: 100%;
     height: 100%;
     backdrop-filter: blur(4px);
 }
</style>
