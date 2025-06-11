<script>
 import PS5 from "./layouts/PS5.js";
 import { onMount, createEventDispatcher } from "svelte";
 import { addGamepad } from "./gamepadController.js";

 export let gamepadIndex = 0;
 export let stickThreshold = 0.2; // default threshold

 const dispatch = createEventDispatcher();
 let gamepadState = null;

 function onChange(state) {
     console.log("Gamepad state changed:", state);
     
     // Handle sticks
     if (state.axes) {
         console.log("Dispatching stick events:", {
             left: state.axes.LeftStick,
             right: state.axes.RightStick
         });
         dispatch("leftstick", state.axes.LeftStick);
         dispatch("rightstick", state.axes.RightStick);
     }

     // Handle buttons
     if (state.buttons) {
         // L1/R1 (fast turns)
         if (state.buttons.L1?.pressed) {
             dispatch("l1pressed", true);
         } else if (state.buttons.L1?.pressed === false) {
             dispatch("l1pressed", false);
         }
         
         if (state.buttons.R1?.pressed) {
             dispatch("r1pressed", true);
         } else if (state.buttons.R1?.pressed === false) {
             dispatch("r1pressed", false);
         }

         // L2/R2 (slow turns)
         if (state.buttons.L2?.pressed) {
             dispatch("l2pressed", true);
         } else if (state.buttons.L2?.pressed === false) {
             dispatch("l2pressed", false);
         }
         
         if (state.buttons.R2?.pressed) {
             dispatch("r2pressed", true);
         } else if (state.buttons.R2?.pressed === false) {
             dispatch("r2pressed", false);
         }
     }
 }

 const args = {
     layout: PS5,
     onChange,
     stickThreshold
 };

 onMount(() => {
     console.log("Gamepad component mounted");
     const cleanup = addGamepad(gamepadIndex, {
         layout: PS5,
         onChange,
         stickThreshold
     });
     return cleanup;
 });

 function gamepadLoop() {
     if (!gamepadState) {
         console.log("No gamepad connected, checking for gamepads...");
         const gamepads = navigator.getGamepads();
         for (const gamepad of gamepads) {
             if (gamepad) {
                 console.log("Found connected gamepad:", gamepad);
                 gamepadState = gamepad;
                 break;
             }
         }
         if (!gamepadState) {
             console.log("No gamepads found");
             return;
         }
     }

     // Get the current gamepad state
     const gamepad = navigator.getGamepads()[gamepadState.index];
     if (!gamepad) {
         console.log("Gamepad not found in getGamepads()");
         return;
     }

     // Check for button changes
     gamepad.buttons.forEach((button, index) => {
         const key = buttonMap[index];
         if (key) {
             const wasPressed = gamepadState.buttons[index]?.pressed;
             const isPressed = button.pressed;
             
             if (isPressed !== wasPressed) {
                 console.log(`Button ${key} (index ${index}) state changed:`, {
                     wasPressed,
                     isPressed,
                     value: button.value
                 });
                 
                 if (isPressed) {
                     console.log(`Dispatching ${key} pressed event`);
                     dispatch(`${key.toLowerCase()}pressed`, { detail: true });
                 } else {
                     console.log(`Dispatching ${key} released event`);
                     dispatch(`${key.toLowerCase()}pressed`, { detail: false });
                 }
             }
         }
     });
 }
</script>
