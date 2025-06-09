<script>
 // just the logo
 import Tama from './Tama.svelte';
 // This is the UI element on the site – hardly functional right now
 import Controller from './Controller.svelte';
 // This is the module that takes the connected game controller inputs
 import Gamepad from "./Gamepad.svelte";
 // This is for establishing connection with UV4L for video chat
 import Signaling from './Signaling.svelte';
 import { onMount } from 'svelte';




 // SEPARATED TAMA CONTROL FUNCTIONS

 // async function sendOmniWheel(obj){//speed,direction,rotation) {
 //     var dataToSend = new FormData();
 //     dataToSend.append( "json", JSON.stringify( obj ) );
 //     const res = await fetch('./omniwheels', {
 //         method: "POST",
 //         body: dataToSend
 //     })
 //     const json = await res.json()
 // 	 console.log(JSON.stringify(json))
 // }
 // // Old version – sending actions letters r/m and numbers
 // async function sendWheel(action,direction) {
 //     var obj = {[action]: direction}
 //
 //         var dataToSend = new FormData();
 //     dataToSend.append( "json", JSON.stringify( obj ) );
 //
 //     const res = await fetch('./wheels', {
 //         method: "POST",
 //         body: dataToSend
 //     })
 //      const json = await res.json()
 // 	  console.log(JSON.stringify(json))
 //  }
 //
 //
 // function changeEyeColor(color) {
 //     var msg = {
 //         type: color,
 //         data: '',
 //         end: '',
 //         context: { destination: '' }
 //     };
 //     ws.send(JSON.stringify(msg));
 //  }
 //
 // // sending stuff down to the server!
 //
 //  async function sendCol(color) {
 //
 //      console.log(color)
 //      var obj = {'c': color}
 //
 //          var dataToSend = new FormData();
 //      dataToSend.append( "json", JSON.stringify( obj ) );
 //
 //      const res = await fetch('./color', {
 //          method: "POST",
 //          body: dataToSend
 //      })
 //      const json = await res.json()
 // 	 console.log(JSON.stringify(json))
 //  }
 //  async function sendGaze(gaze) {
 //      var obj = {'g': gaze}
 //
 //          var dataToSend = new FormData();
 //      dataToSend.append( "json", JSON.stringify( obj ) );
 //
 //      const res = await fetch('./gaze', {
 //          method: "POST",
 //          body: dataToSend
 //      })
 //      const json = await res.json()
 // 	 console.log(JSON.stringify(json))
 //  }

 // CHANGE TO FALSE IF NOT USING COMPILATION WIZARD
 let newWizard = true;
 async function sendOmniWheel(obj){
      if (newWizard) {
          sendObjectWheel_pos()
      } else {
          var dataToSend = new FormData();
          dataToSend.append( "json", JSON.stringify( obj ) );
          const res = await fetch('./omniwheels', {
              method: "POST",
              body: dataToSend
          })
          const json = await res.json()
 	      console.log(JSON.stringify(json))

      }

 }

// New functions for wheel control
async function sendObjectWheel_pos() {
    // This function handles the omnidirectional wheel movement
    // It should send the current stateTama object to the server
    try {
        const dataToSend = new FormData();
        // Create a new object with the current stateTama values
        const wheelState = {
            s: stateTama.speed,
            d: stateTama.direction,
            r: stateTama.rotation
        };
        dataToSend.append("json", JSON.stringify(wheelState));
        const res = await fetch('./omniwheels', {
            method: "POST",
            body: dataToSend
        });
        const json = await res.json();
        console.log("Object wheel position sent:", JSON.stringify(wheelState));
    } catch (error) {
        console.error("Error sending object wheel position:", error);
    }
}

async function sendSimpleWheel_pos() {
    // This function handles simple wheel movement (forward/backward)
    // It should send the current movement state to the server
    try {
        const dataToSend = new FormData();
        dataToSend.append("json", JSON.stringify({ movement: movement }));
        const res = await fetch('./wheels', {
            method: "POST",
            body: dataToSend
        });
        const json = await res.json();
        console.log("Simple wheel position sent:", JSON.stringify(json));
    } catch (error) {
        console.error("Error sending simple wheel position:", error);
    }
}

 async function sendWheel(action,direction) {
      if (newWizard) {
          sendSimpleWheel_pos()
      } else {
          var obj = {[action]: direction};
          var dataToSend = new FormData();
          dataToSend.append( "json", JSON.stringify( obj ) );

          const res = await fetch('./wheels', {
              method: "POST",
              body: dataToSend
          })
          const json = await res.json()
 	      console.log(JSON.stringify(json))

      }

 }
 async function sendCol(color) {
     if (newWizard) {
         changeEyeColor(color)
     } else {
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
 }

 async function sendGaze(aX,aY) {
     if (newWizard) {
         moveHead(aX,aY)
     } else {
         gaze = "p" + aX + "t" + aY;
         var obj = {'g': gaze};
         var dataToSend = new FormData();
         dataToSend.append( "json", JSON.stringify( obj ) );

         const res = await fetch('./gaze', {
             method: "POST",
             body: dataToSend
         })
         const json = await res.json()
 	     console.log(JSON.stringify(json))
     }
 }



 // ################ TAMA ################

 let stateTama = {
         speed: 0,
         direction: 0,
         rotation: 0
     };

 let lastUpdate = {s: 0,d: 0,r: 0}

     $: {
         let obj = {s: stateTama.speed,d: stateTama.direction,r: stateTama.rotation};
         if (JSON.stringify(lastUpdate) != JSON.stringify(obj)){
             sendOmniWheel(obj);
             lastUpdate = obj;
         }
     }





 // ################ GAMEPAD ################

 let stateGamepad = {
     leftAxis: { x: 0, y: 0 },
     rightAxis: { x: 0, y: 0 },
     button: {right: null, left: null},
     right: 0,
     left: 0,
     speedtoggle: 1

 };


 function gamepadConnected(event) {
     console.log(`app: gamepad ${event.detail.gamepadIndex} connected`);
 }


 function LeftStick(event) { stateGamepad.leftAxis = event.detail; }

 function RightStick(event) { stateGamepad.rightAxis = event.detail; }

 function RSPressed(event) {
     if (stateGamepad.speedtoggle = 1){
         stateGamepad.speedtoggle = 0.5
     }
     else{
         stateGamepad.speedtoggle = 1
     }

 }

 $:{
     console.log(stateGamepad.right)
 }

 function RBPressed(event) {
     if (stateGamepad.button["right"] != event.detail){
         if(stateGamepad.button["right"] == null){
             stateGamepad.right = 400
         }
         stateGamepad.button["right"] == event.detail;
     }else{
         stateGamepad.right = 0

     }


 }


 function LBPressed(event) {
     if (stateGamepad.button["left"] != event.detail){
         if(stateGamepad.button["left"] == null){
             stateGamepad.left = -400
         }
         stateGamepad.button["left"] == event.detail;
     }else{
         stateGamepad.left = 0

     }


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

 let speed = 600;

 $: {
     // This reactive statement will run whenever the state changes
     let newDegrees = calculateVectorInfo(stateGamepad.leftAxis['x'],stateGamepad.leftAxis['y']).angleDegrees
     let newSpeed = Math.min(calculateVectorInfo(stateGamepad.leftAxis['x'],stateGamepad.leftAxis['y']).vectorLength*stateGamepad.speedtoggle,1)*speed
     

     if(newSpeed == 0){
         if(stateTama.speed != 0){
             stateTama.speed = 0
         }
         stateTama.rotation = stateGamepad.right + stateGamepad.left
     }else{
         stateTama.rotation = (stateGamepad.right + stateGamepad.left)*0.75
     }
     if(Math.abs(stateTama.speed-newSpeed)>(0.1*speed)){
         stateTama.speed = newSpeed
         //sendWheel('m',Math.round(speed*6)*speedmulti+32)
         //isMoving = true;
     }
     newDegrees = (Math.round((270-newDegrees)/11.25)*11.25)%360
     if (newDegrees != stateTama.direction){
         stateTama.direction = newDegrees
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


 let isTyping = false;

 function onKeyDown(e) {
     // Skip movement handling if we're typing
     if (isTyping) return;
     
     if (e.repeat) return;

	 switch(e.key.toUpperCase()) {
		 case "W":
             console.log("pressed W");
			 // forward
             kmf = true;
             //sendWheel('m',0);
             e.preventDefault();

			 break;
         case "S":
             console.log("pressed s");
			 // stop
             kmb = true;

             e.preventDefault();

			 break;
         case "A":
             console.log("pressed s");
			 // forward
             kml = true;
             e.preventDefault();

			 break;
         case "D":
             console.log("pressed s");
			 // forward
             kmr = true;
             e.preventDefault();

			 break;
         case "Q":
             console.log("pressed q");
			 // forward
             krl = true;

             e.preventDefault();
             break;

         case "E":
             console.log("pressed e");
			 // forward

             krr = true;
             e.preventDefault();
	         break;

         case "G":
             console.log("pressed e");
			 // forward
             speedToggle = 1;
             //krr = true;
             e.preventDefault();
	         break;
         case "H":
             console.log("pressed e");
			 // forward
             speedToggle = 3;
             //krr = true;
             e.preventDefault();
	         break;
         case "J":
             console.log("pressed e");
			 // forward
             speedToggle = 6;
             //krr = true;
             e.preventDefault();
	         break;
         case "K":
             console.log("pressed e");
			 // forward
             speedToggle = 7;
             //krr = true;
             e.preventDefault();
	         break;
         case "T":
             console.log("pressed e");

             left = 40
             right = 59
             e.preventDefault();
	         break;

         case "Y":
             console.log("pressed e");

             left = 42
             right = 57
             e.preventDefault();
	         break;

         case "U":
             console.log("pressed e");
			 // forward
             left = 44
             right = 55
             e.preventDefault();
	         break;
         case "I":
             console.log("pressed e");
			 // forward
             left = 45
             right = 55
             e.preventDefault();
	         break;
         case "O":
             console.log("pressed e");
			 // forward
             left = 47
             right = 53
             e.preventDefault();
	         break;
         case "P":
             console.log("pressed e");
			 // forward
             left = 49
             right = 51
             e.preventDefault();
	         break;
         default:
             console.log(e.key);
	 }

     updateKeyMovement();
 }

 function onKeyUp(e) {
     // Skip movement handling if we're typing
     if (isTyping) return;
     
	 switch(e.key.toUpperCase()) {
         case "W":
             console.log("pressed W");
			 // forward
             //sendWheel('m',32);
             kmf = false;
             e.preventDefault();

			 break;
         case "S":
             console.log("pressed s");
			 // forward
             kmb = false;
             e.preventDefault();

			 break;
         case "A":
             console.log("pressed s");
			 // forward
             kml = false;
             e.preventDefault();

			 break;
         case "D":
             console.log("pressed s");
			 // forward
             kmr = false;
             e.preventDefault();

			 break;
         case "Q":
             console.log("pressed q");
			 // forward
             //sendWheel("r","M")
             krl = false;
             e.preventDefault();
             break;

         case "E":
             console.log("pressed e");
			 // forward
             //sendWheel("r","M")
             krr = false;
             e.preventDefault();
	         break;
	 }
     updateKeyMovement();
 }

// Add keyboard movement state variables
let kmf = false; // forward
let kmb = false; // backward
let kml = false; // left
let kmr = false; // right
let krl = false; // rotate left
let krr = false; // rotate right
let speedToggle = 1; // speed multiplier

function updateKeyMovement() {
    // Calculate speed based on movement keys
    let speed = 0;
    if (kmf) speed = 1;
    if (kmb) speed = -1;
    
    // Calculate direction based on strafe keys
    let direction = 0;
    if (kml) direction = 90;
    if (kmr) direction = -90;
    
    // Calculate rotation based on rotation keys
    let rotation = 0;
    if (krl) rotation = -400;
    if (krr) rotation = 400;
    
    // Apply speed toggle
    speed *= speedToggle;
    
    // Update stateTama with new values
    stateTama.speed = speed;
    stateTama.direction = direction;
    stateTama.rotation = rotation;
}


 // ################ UI ################

 // function to handle the form submit
 function handleSubmit(e) {
    const formData = new FormData(e.target);
    let data = {s:0, d:0, r:0};
    for (let field of formData) {
        let [key, value] = field;
        data[key] = parseInt(value);
    }
    console.log("Form data:", data);
    // Update stateTama with the form values
    stateTama.speed = data.s;
    stateTama.direction = data.d;
    stateTama.rotation = data.r;
    // Send the updated state
    sendOmniWheel(data);
}

 let movement = 'rM';

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
     sendGaze(aX,aY)
     //angles = "p" + aX + "t" + aY;


    // sendGaze(angles)
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




 // ################ WEBSOCKETS ################

 var raspi;
 var myID;

 let rand=0;
 function getRand() {
     fetch("./rand")
         .then(d => d.text())
         .then(d => (rand = d));
 }


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

 async function speakText(text) {
     try {
         const dataToSend = new FormData();
         dataToSend.append("text", text);
         const res = await fetch('./speak', {
             method: "POST",
             body: dataToSend
         });
         const json = await res.json();
         console.log("Speech response:", json);
     } catch (error) {
         console.error("Error sending speech text:", error);
     }
 }

</script>



<!-- just a logo -->

<svelte:window
    on:keydown={onKeyDown}
    on:keyup={onKeyUp}
/>

<div id="topbar">
    <div id="gazercontrolbar">
            <div class="column" id="colorbuttons">
                {#each collist as col}
                    <button on:click={() => sendCol(col.id)}>{col.name}</button>
                {/each}
            </div>
            <form on:submit|preventDefault={handleSubmit}>
	            <input name="s" placeholder="speed" />
                <input name="d" placeholder="direction" />
                <input name="r" placeholder="rotation" />
	            <input type="submit" value="create" />
            </form>
            <div class="column" id="speech-control">
                <input 
                    type="text" 
                    id="speech-text" 
                    placeholder="Enter text to speak"
                    on:focus={() => isTyping = true}
                    on:blur={() => isTyping = false}
                />
                <button on:click={() => {
                    const text = document.getElementById('speech-text').value;
                    if (text) speakText(text);
                }}>Speak</button>
            </div>
            <div class="column" id="view"></div>

    </div>
    <div id="streamcontrolbar">
        <Tama />
    </div>
    <div id="movementcontrolbar">

        <div class="column" id="controller">
            <Controller bind:movement/>
        </div>
        <div class="column" id="streaming">
            <Signaling />
        </div>
    </div>


</div>

<!-- old controller, but also start call and hangup button -->
<!-- <h1>Your number is {rand}!</h1> -->





<!--
     The controller detector, when pn clicked
     it triggers the corresponding fuctions in the scripts above
-->

<Gamepad
    gamepadIndex={0}
    on:Connected={gamepadConnected}

    on:LeftStick={LeftStick}
    on:RightStick={RightStick}
    on:LT={LBPressed}
    on:RT={RBPressed}
    on:RS={RSPressed}

    />

    <!--

            on:A={}
    on:RT={}
    on:LT={}
    
    on:LS={}
    on:DPadUp={ () => dpad("U")}
    on:DPadDown={ () => dpad("D")}
    on:DPadLeft={ () => dpad("L")}
    on:DPadRight={ () => dpad("R")}

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



    <!-- <audio id="gum-local" controls autoplay></audio> -->













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
         width: 60vw;
         height: 45vw;
         margin: auto;
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
     #topbar{
         width: 100%;
     }
     #gazercontrolbar{

         width: 44%;
         float: left;

     }
     #colorbuttons{
         margin: 10% 3%;
     }
     #streamcontrolbar{

         width: 12%;
         float: left;
     }
     #movementcontrolbar{

         width: 44%;
         float: left;
     }
     #gazercontrolbar form{
         margin-top: 10%;
     }
     #controller{
     }
     #streaming{
         float: left;

         margin-top: 10%;


     }
    </style>
