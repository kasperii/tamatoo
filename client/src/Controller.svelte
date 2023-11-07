
<script>
 export let movement
 function test(val) {
     movement = val
     console.log(val)
     //      document.querySelector(".rotation-point").classList.add(val);
 }
</script>


<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 200 200" style="enable-background:new 0 0 200 200;" xml:space="preserve">

    <g>
        <foreignObject position attributes>
            <html:button>Button1</html:button>
        </foreignObject>
	    <circle class="st0" cx="100" cy="46.87" r="8.63"/>
	    <line class="st0" x1="100" y1="55.49" x2="100" y2="100"/>
	    <circle class="st0" cx="53.85" cy="73.29" r="8.63"/>
	    <line class="st0" x1="61.32" y1="77.6" x2="100" y2="100"/>
	    <circle class="st0" cx="53.85" cy="126.12" r="8.63"/>
	    <line class="st0" x1="61.32" y1="121.81" x2="100" y2="100"/>
	    <circle class="st0" cx="100" cy="152.54" r="8.63"/>
	    <line class="st0" x1="100" y1="143.91" x2="100" y2="100"/>
	    <circle class="st0" cx="145.36" cy="126.12" r="8.63"/>
	    <line class="st0" x1="137.89" y1="121.81" x2="100" y2="100"/>
	    <circle class="st0" cx="145.36" cy="73.29" r="8.63"/>
	    <line class="st0" x1="137.89" y1="77.6" x2="100" y2="100"/>
    </g>
    <g class="rotation-point">
        <circle cx="100" cy="100" r="13.12"/>
        <polyline class="st1" points="97,95 100,90 103,95 "/>
    </g>
</svg>

<div class="buttonoverlay">
    <button class="button button1" on:click={() => test("mr")}>

    </button>
    <button class="button button2" on:click={() => test("mw")}>

    </button>
    <button class="button button3" on:click={() => test("my")}>

    </button>
    <button class="button button4" on:click={() => test("mz")}>

    </button>
    <button class="button button5" on:click={() => test("mb")}>

    </button>
    <button class="button button6" on:click={() => test("mc")}>

    </button>

</div>
<div class="buttonoverlay">
    <button class="button button1r" on:click={() => test("ro")}>

    </button>
    <button class="button button2r" on:click={() => test("rp")}>
        ↻
    </button>
    <button class="button button3r" on:click={() => test("rl")}>
        ↻
    </button>
    <button class="button button4r" on:click={() => test("rsw")}>
        ↻
    </button>
    <button class="button button5r" on:click={() => test("rse")}>
        ↻
    </button>
    <button class="button button6r" on:click={() => test("rs")}>
        ↻
    </button>

</div>

<style type="text/css">
 .st0{fill:none;stroke:#000000;stroke-miterlimit:10;}
 .st1{fill:#FFFFFF;}
 .rotation-point{
     transform-origin: 50% 50%;
 }
 .rotation-point:hover{
     transform: rotate(-180deg);
     transition: all 2s linear;
 }


 .rotation-point.nr{
     transform: rotate(0deg);
     transition: all 1s linear;
 }
 .rotation-point.ner{
     transform: rotate(60deg);
     transition: all 1s linear;
 }
 .rotation-point.nwr{
     animation: rotation 1s linear;
 }
 .rotation-point.ser{
     transform: rotate(-120deg);
     transition: all 1s linear;
 }
 .rotation-point.swr{
     transform: rotate(120deg);
     transition: all 1s linear;
 }
 .rotation-point.sr{
     transform: rotate(-180deg);
     transition: all 1s linear;
 }

 @keyframes rotation {
  50% {
    transform: rotate(60deg);
  }
  100% {
    transform: rotate(0deg);
  }
 }


 .buttonoverlay{
     color: #dddddd;
     width: 200px;
     height: 200px;
     float: left;
     margin: 0 -200px 0 0;
 }
 .button{
     position: relative;
     float: left;
     width: 20px;
     height: 20px;
     border-radius: 50%;
     background-color: transparent;
     border: 0px;
     text-align: center;
     font-size: 10px;
 }

 .button1{
     margin: 37px 90px 0px 90px;
 }
 .button2{
     margin: 6px 36px 17px 44px;
 }
 .button3{
     margin: 6px 44px 17px 36px;
 }
 .button4{
     margin: 16px 36px 6px 44px;
 }
 .button5{
     margin: 16px 44px 6px 36px;
 }
 .button6{
     margin: 0px 90px 38px 90px;
 }



 .button1r{
     margin: 17px 90px 0px 90px;
 }
 .button2r{
     margin: 15px 50px 28px 30px;
 }
 .button3r{
     margin: 15px 30px 28px 50px;
 }
 .button4r{
     margin: 28px 50px 15px 30px;
 }
 .button5r{
     margin: 28px 30px 15px 50px;
 }
 .button6r{
     margin: 0px 90px 17px 90px;
 }

</style>
