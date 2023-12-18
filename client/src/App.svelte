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
    <audio controls>
        <source src="./ffmpeg" type="audio/mpeg">
        // <source src="./audio" type="audio/x-wav;codec=pcm">
        Your browser does not support the audio element.
    </audio>
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
