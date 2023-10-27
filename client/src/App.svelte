<script>

 let collist= [{
	 id: "r",
	 name: 'Red'
 }, {
	 id: "g",
	 name: 'Green'
 }, {
	 id: "b",
	 name: 'Blue'
 }];

 let rand = -1;
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

</script>

<h1>Your number is {rand}!</h1>
<button on:click={getRand}>Get a random number</button>

{#each collist as col}
    <button on:click={() => sendCol(col.id)}>{col.name}</button>
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
</style>
