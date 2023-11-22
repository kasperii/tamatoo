<script>
 import Tama from './Tama.svelte';
 import Controller from './Controller.svelte';
 import Gamepad from "./Gamepad.svelte";

 let state = {
    leftAxis: { x: 0, y: 0 },
    rightAxis: { x: 0, y: 0 },
    buttons: {}
 };
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
    console.log(event.detail);

  }

 function RightStick(event) {
    state.rightAxis = event.detail;
    console.log(event.detail);
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

 function getPoint(e){
     let view = document.getElementById('tamaview')
     let angles =""
     var ratioX = e.target.width / e.target.offsetWidth;
     var ratioY = e.target.height / e.target.offsetHeight;


     var domX = e.x + window.pageXOffset - e.target.offsetLeft;
     var domY = e.y + window.pageYOffset - e.target.offsetTop;


     var imgX = Math.floor(domX * ratioX);
     var imgY = Math.floor(domY * ratioY);
     let aX = Math.floor((imgX/e.target.width-.5)*180)
     let aY = Math.floor((90-(imgY/e.target.height)*90))
     angles = "p" + aX + "t" + aY
     console.log(aX, aY);
     console.log(angles)

     sendGaze(angles)
 };


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
/>
<img id="tamaview" src="./video_feed" on:click={getPoint} width="1296px" height="972px">

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
     -webkit-transform: rotate(180deg);
     -moz-transform: rotate(180deg);
     -o-transform: rotate(180deg);
     transform: rotate(180deg);

     filter: FlipH;
     -ms-filter: "FlipH";
 }
</style>
