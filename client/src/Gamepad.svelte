<script>
 import layout from "./layouts/PS5.js";
 import { onMount, createEventDispatcher } from "svelte";
 import { addGamepad } from "./gamepadController.js";

 export let gamepadIndex;
 export let stickThreshold = 0.2; // default threshold

 const dispatch = createEventDispatcher();
 let gamepadState = null;

 function onChange(newGamepadState) {
     if (!gamepadState) {
         dispatch("Connected", { gamepadIndex });
     }

     // handle buttons
     Object.keys(newGamepadState.buttons).forEach(key => {
         const button = newGamepadState.buttons[key];
         console.log(`Button ${key}:`, button); // Debug log

         if (button && button.pressed) {
             console.log(`Dispatching ${key} pressed event`); // Debug log
             dispatch(key, button); // e.g. "RT" , {pressed: true, value: 0.2}
         }

         // Send null when player stops pressing button
         // Needs to check if the previous state is marked as pressed
         if (
             button &&
             !button.pressed &&
             gamepadState &&
             gamepadState.buttons[key].pressed
         ) {
             console.log(`Dispatching ${key} released event`); // Debug log
             dispatch(key, null);
         }
     });

     // handle axes
     Object.keys(newGamepadState.axes).forEach(key => {
         const axis = newGamepadState.axes[key];

         if (axis) {
             dispatch(key, axis); // e.g. "LeftStick" , {x: 10, y:0}
         }
     });

     gamepadState = { ...newGamepadState };
 }

 const args = {
     layout,
     onChange,
     stickThreshold
 };

 onMount(() => {
     const cleanup = addGamepad(gamepadIndex, args);
     return cleanup;
 });
</script>
