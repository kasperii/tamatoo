

<script>
 import Tama from './Tama.svelte';
 import Controller from './Controller.svelte';
 import Gamepad from "./Gamepad.svelte";

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

 var socket = io();
 socket.on('connect', function() {
      console.log("CONNECTED SOCKET")
      socket.emit('my event', {data: 'I\'m connected!'});
  });

 function directionFromDegrees(d){
     // the 16- is because I messed up the degrees in the arduino code.. Should be changed later
     return compass[16-Math.floor((d+11.25)/22.5)]

 }

 function gamepadChangeState(button){
     console.log(button)
     state.buttons["button"] = button.detail;
     console.log(state.buttons)
 }

 function dpad(direction){
     state.buttons[text] = button.detail;
 }

 function gamepadConnected(event) {
     console.log(`app: gamepad ${event.detail.gamepadIndex} connected`);
 }
 function APressed(event) {
     state.buttons["A"] = event.detail;
     console.log("A pressed");
 }

 function RTPressed(event) {
     state.buttons["RT"] = event.detail;
     console.log("RT pressed");
 }

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
     // This reactive statement will run whenever myObject changes
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
         sendWheel('m',Math.round(speed*6)+32)
         isMoving = true;
     }
     newDegrees = (Math.round((newDegrees+90)/11.25)*11.25)%360
     if (newDegrees != degrees){
         degrees = newDegrees
         sendWheel('m',Math.round(degrees/11.25))
     }
 }

 let movement = 'r0';
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

 let wheellist= [{
	 id: "w",
	 name: 'Forward'
 }, {
	 id: "a",
	 name: 'Left'
 }, {
	 id: "d",
	 name: 'Right'
 }, {
     id: "s",
	 name: 'Back'
 }];

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









 // GET AUDIO FROM GGOOGLES EXAMPLE: https://github.com/webrtc/samples/blob/gh-pages/src/content/getusermedia/audio/js/main.js



 'use strict';

 // Put variables in global scope to make them available to the browser console.
 const audio = document.querySelector('audio');

 const constraints = window.constraints = {
     audio: true,
     video: false
 };

 
 function handleSuccess(stream) {
     const audioTracks = stream.getAudioTracks();
     console.log('Got stream with constraints:', constraints);
     console.log('Using audio device: ' + audioTracks[0].label);
     stream.oninactive = function() {
         console.log('Stream ended');
     };
     window.stream = stream; // make variable available to browser console
     audio.srcObject = stream;
 }

 function handleError(error) {
     const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
     document.getElementById('errorMsg').innerText = errorMessage;
     console.log(errorMessage);
 }

 navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);





 // socker audio sending
 //
 // var recording_button = document.getElementById('record');
 // var socket = io.connect('http://' + document.domain + ':' + location.port);
 //
 //
 //  socket.on('add-wavefile', function(url) {
 //      // add new recording to page
 //      //audio = document.createElement('p');
 //      audio.innerHTML = '<audio src="' + url + '" controls>';
 //      // document.getElementById('wavefiles').appendChild(audio);
 //      document.getElementById('wavefiles').innerHTML = audio.innerHTML
 //  });
 //
 //
 //
 //  socket.on('model-output', function(curr_audio_state){
 //      console.log('output socket is invoked finally')
 //      document.getElementById("audio_state").innerHTML = curr_audio_state;
 //  });
 //
 //  socket.on('connect', function() {
 //      console.log('CONNECTION ESTABLISHED !!')
     //  });



 // function convertToMono( input ) {
 //     var splitter = audioContext.createChannelSplitter(2);
 //     var merger = audioContext.createChannelMerger(2);
 //
 //     input.connect( splitter );
 //     splitter.connect( merger, 0, 0 );
 //     splitter.connect( merger, 0, 1 );
 //     return merger;
 // }
 //
 // function gotStream(stream) {
 //     // inputPoint = audioContext.createGain();
 //
 //     // Create an AudioNode from the stream.
 //     realAudioInput = audioContext.createMediaStreamSource(stream);
 //     audioInput = realAudioInput;
 //
 //     audioInput = convertToMono( audioInput );
 //     // audioInput.connect(inputPoint);
 //
 //     analyserNode = audioContext.createAnalyser();
 //     analyserNode.fftSize = 2048;
 //     // inputPoint.connect( analyserNode );
 //     audioInput.connect( analyserNode );
 //
 //     scriptNode = (audioContext.createScriptProcessor || audioContext.createJavaScriptNode).call(audioContext, 1024, 1, 1);
 //     scriptNode.onaudioprocess = function (audioEvent) {
 //         if (recording) {
 //             input = audioEvent.inputBuffer.getChannelData(0);
 //
 //             // convert float audio data to 16-bit PCM
 //             var buffer = new ArrayBuffer(input.length * 2)
 //             var output = new DataView(buffer);
 //
 //             for (var i = 0, offset = 0; i < input.length; i++, offset += 2) {
 //                 var s = Math.max(-1, Math.min(1, input[i]));
 //                 output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
 //             }
 //             socket.emit('write-audio', buffer);
 //         }
 //     }
 //     audioInput.connect(scriptNode);
 //     scriptNode.connect(audioContext.destination);
 //
 //     // zeroGain = audioContext.createGain();
 //     // zeroGain.gain.value = 0.0;
 //     // inputPoint.connect( zeroGain );
 //     // audioInput.connect( audioContext.destination );
 // }

 // function initAudio() {
 //     if (!navigator.getUserMedia)
 //         navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
 //     if (!navigator.cancelAnimationFrame)
 //         navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
 //     if (!navigator.requestAnimationFrame)
 //         navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;
 //
 //     navigator.getUserMedia({audio: true}, gotStream, function(e) {
 //         alert('Error getting audio');
 //         console.log(e);
 //     });
 // }
 //
 //
 // // Additional Function to glow image, and add recording css style
 // function toggleRecording( e ) {
 //     if (e.classList.contains('recording')) {
 //         console.log('END RECORDING INITIAZIED .. DELETING session')
 //         // stop recording
 //         e.classList.remove('recording');
 //         recording = false;
 //         socket.emit('end-recording');
 //     } else {
 //         // start recording
 //         console.log(' emmiting at start-recording');
 //         e.classList.add('recording');
 //         recording = true;
 //         socket.emit('start-recording', {numChannels: 1, bps: 16, fps: parseInt(audioContext.sampleRate)});
 //     }
 // }
 //
 // window.addEventListener('load', initAudio );
 //
 // // One-liner to resume playback only when user interacted with the page, we don't want js to automatically record audio when mic access is given .. more secure !!
 // recording_button.addEventListener('click', function() {
 //     audioContext.resume().then(() => {
 //         console.log('Initializing Recording')
 //         toggleRecording(this);
 //     });
 // });
 //
 //
 //
 //



</script>



<Tama />

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
<Gamepad
    gamepadIndex={0}
    on:Connected={gamepadConnected}
    on:A={APressed}
    on:RT={RTPressed}
    on:LeftStick={LeftStick}
    on:RightStick={RightStick}
    on:LB={ () => gamepadChangeState("LB")}
    on:RB={ () => gamepadChangeState("RB")}
    on:RT={ () => gamepadChangeState("RT")}
    on:LT={ () => gamepadChangeState("LT")}
    on:RS={ () => gamepadChangeState("RS")}
    on:LS={ () => gamepadChangeState(LS)}
    on:DPadUp={ () => dpad("U")}
    on:DPadDown={ () => dpad("D")}
    on:DPadLeft={ () => dpad("L")}
    on:DPadRight={ () => dpad("R")}

    />
    <div class="blur-container">
        <img class="underlay" id="tamaview" src="./video_feed">
        <img class="overlay" src="./video_feed" style="clip-path: circle(40% at {blurPoint[0]}% {blurPoint[1]}%)">
        <img class="overlay" on:mousedown={onMouseDown}>
    </div>
    <!-- <audio controls>
         <source src="./ffmpeg" type="audio/mpeg">
         <source src="./audio" type="audio/x-wav;codec=pcm">
         Your browser does not support the audio element.
         </audio> -->
    <audio id="gum-local" controls autoplay></audio>
    {#each wheellist as dir}
    <button on:click={() => sendWheel(dir.id)}>{dir.name}</button>
{/each}

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
 img {
     width: 100%;
     height: 100%;
     object-fit: cover;
     -webkit-transform: rotate(180deg);
     -moz-transform: rotate(180deg);
     -o-transform: rotate(180deg);
     transform: rotate(180deg);
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
     filter: blur(3px);
 }
 .blur-container .overlay {
     position: absolute;
 	 top: 0;
  	 left: 0;
 }
</style>
