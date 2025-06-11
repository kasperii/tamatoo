<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { addGamepad } from "./gamepadController.js";
    import PS5 from "./layouts/PS5.js";

    export let gamepadIndex = 0;
    export let stickThreshold = 0.2;

    const dispatch = createEventDispatcher();
    let gamepadState = null;

    function onChange(newGamepadState) {
        if (!gamepadState) {
            dispatch("Connected", { gamepadIndex });
        }

        // handle buttons
        Object.keys(newGamepadState.buttons).forEach(key => {
            const button = newGamepadState.buttons[key];

            if (button && button.pressed) {
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
        const cleanup = addGamepad(gamepadIndex, args);
        return cleanup;
    });
</script>

{#if gamepadState}
    {#if gamepadState.axes}
        <div style="display: none"
            on:leftstick={e => e.detail = gamepadState.axes.LeftStick}
            on:rightstick={e => e.detail = gamepadState.axes.RightStick}
        />
    {/if}
    {#if gamepadState.buttons}
        <div style="display: none"
            on:l1pressed={e => e.detail = gamepadState.buttons.L1?.pressed}
            on:r1pressed={e => e.detail = gamepadState.buttons.R1?.pressed}
            on:l2pressed={e => e.detail = gamepadState.buttons.L2?.pressed}
            on:r2pressed={e => e.detail = gamepadState.buttons.R2?.pressed}
        />
    {/if}
{/if}
