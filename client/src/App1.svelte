<script>
// just the logo
 import Tama from './Tama.svelte';
 // This is the UI element on the site – hardly functional right now
 import Controller from './Controller.svelte';
 // This is the module that takes the connected game controller inputs
 import Gamepad from "./Gamepad.svelte";
 // This is for establishing connection with UV4L for video chat
 import Signaling from './Signaling.svelte';

 let state = {
     leftAxis: { x: 0, y: 0 },
     rightAxis: { x: 0, y: 0 },
     dpad: {},
     buttons: {},
     rotation: 0

 };
 let degrees = 0;
 let speed = 0;
 let isMoving = false;
 let compass = ['r','t','y','g','h','j','b','v','c','x','z','a','s','d','w','e','r']
 
 
 
 // Variable to toggle slow movement
 let speedmulti = 1
 let kmf, kmb, kml, kmr, krr, krl = false;  
 let speedToggle = 1;
 let right = 45
 let left = 55
 let isKeyMoving = false



 // ################## KEYBOARD

function updateKeyMovement(){
    console.log("update key movement")
    let rr = right//"K";
    let rl = left //"T";
    if(kmf|kmb && krl|krr ){
        //if moving back or forward and rotating
        //speed modify the rotation 
        //rr = 53;
        //rl = 47;

    }

    if(kml|kmr && krl|krr ){
        //if moving right or left and rotating
        //speed modify the rotation -might be differnet thatn above?
        //rr = 53;
        //rl = 47;
    }

    if(kmb){
        sendWheel('m',32);
        isKeyMoving = false
    } else if(kmf){
        // adding a check to not double send forward when other buttons are pressed at the same time as w
        if (!isKeyMoving){
            sendWheel('m',32+speedToggle);
            isKeyMoving = true
        }    
    } else {
        sendWheel('m',32);
        isKeyMoving = false
    }

    if(krr){
        sendWheel("r",rr);
    }else if(krl){
        sendWheel("r",rl);
    }else{
        sendWheel("r",50);
    }
    
}

// rotations:
// sendWheel("r","L")
// sendWheel("r","R")
// sendWheel("r","M")

// movements:
// speed is 32-38, where 38 is full and 32 is stop
// sendWheel('m',Math.round(speed*6)+32)
// sendWheel('m',Math.round(degrees/11.25))

 // ################ Keyboard controller
// On w -> update speed to 100, on up update 0 | add speed some other way | q = rotate and e is
 function onKeyDown(e) {
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
            state.rotation = 300
             console.log("rotate R")

         }
         else{
            state.rotation = 0
            console.log("rotate M")
         }

         state.buttons["RT"] = event.detail;

     }

 }

 function LTPressed(event) {
     if (state.buttons["LT"] != event.detail){
         if(state.buttons["LT"]==null){
            state.rotation = -300
            console.log("rotate L")
         }
         else{
            state.rotation = 0
            console.log("rotate M")
         }
         state.buttons["LT"] = event.detail;

     }

 }

 function RBPressed(event) {
     if (state.buttons["RB"] != event.detail){
         if(state.buttons["RB"]==null){
            state.rotation = 400
             console.log("rotate R")
         }
         else{
            state.rotation = 0
             console.log("rotate M")
         }
         state.buttons["RB"] = event.detail;

     }

 }

 function LBPressed(event) {
     if (state.buttons["LB"] != event.detail){
         if(state.buttons["LB"]==null){
            state.rotation = 400
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
     let newRotation = state.rotation
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
         sendWheel('m',Math.round(speed*6)*speedmulti+32)
         isMoving = true;
     }
     newDegrees = (Math.round((270-newDegrees)/11.25)*11.25)%360
     if (newDegrees != degrees){
         degrees = newDegrees
         sendWheel('m',Math.round(degrees/11.25))
     }
     
 }

 let movement = 'rM';

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

 // just debugging aand test

 function debut(){
     console.log(movement)
 }
 let rand = -1;
 $: { //Binds to changes in movement
     // console.log("OUTSIDe")
    console.log(movement)
    console.log(movement.substring(0, 1));
    console.log(movement.substring(1));
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


</script>

<!-- just a logo -->

<svelte:window
    on:keydown={onKeyDown}
    on:keyup={onKeyUp}
/>
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
<form on:submit|preventDefault={handleSubmit}>
	<input name="s" placeholder="speed" />
  <input name="d" placeholder="direction" />
  <input name="r" placeholder="rotation" />
	<input type="submit" value="create" />
</form>


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
