<script>
 import PS5 from "./layouts/PS5.js";
 import { onMount, createEventDispatcher } from "svelte";
 import { addGamepad } from "./gamepadController.js";

 export let gamepadIndex = 0;
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
     layout: PS5,
     onChange,
     stickThreshold
 };

 onMount(() => {
     console.log("Gamepad component mounted");
     const cleanup = addGamepad(gamepadIndex, {
         layout: PS5,
         onChange: (state) => {
             console.log("Gamepad state changed:", state);
             // Check for button changes
             for (const [key, button] of Object.entries(state.buttons)) {
                 const wasPressed = gamepadState?.buttons?.[key]?.pressed;
                 const isPressed = button.pressed;
                 
                 if (isPressed !== wasPressed) {
                     console.log(`Button ${key} state changed:`, {
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
             gamepadState = state;
         }
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
