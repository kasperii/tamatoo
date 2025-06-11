<script>
    import { onMount, onDestroy } from 'svelte';
    import { io } from 'socket.io-client';

    let socket;
    let peerConnection;
    let videoElement;
    let isConnected = false;
    let isStreaming = false;

    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };

    onMount(() => {
        socket = io('http://localhost:5050');
        setupSocketListeners();
    });

    onDestroy(() => {
        if (socket) socket.disconnect();
        if (peerConnection) peerConnection.close();
    });

    function setupSocketListeners() {
        socket.on('connect', () => {
            console.log('Connected to signaling server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
            isConnected = false;
        });
    }

    async function startStream() {
        try {
            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    });
                }
            };

            // Handle incoming tracks
            peerConnection.ontrack = (event) => {
                if (videoElement) {
                    videoElement.srcObject = event.streams[0];
                }
            };

            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socket.emit('offer', {
                type: offer.type,
                sdp: offer.sdp
            });

            // Handle answer
            socket.on('answer', async (answer) => {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                isStreaming = true;
            });

            // Handle ICE candidates from server
            socket.on('ice-candidate', async (candidate) => {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding ICE candidate:', e);
                }
            });

        } catch (error) {
            console.error('Error starting stream:', error);
        }
    }

    function stopStream() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        isStreaming = false;
    }
</script>

<div class="video-container">
    <video 
        class="underlay" 
        id="tamaview"
        bind:this={videoElement}
        autoplay 
        playsinline
        muted
    ></video>
    <div class="controls">
        <button on:click={startStream} disabled={isStreaming}>Start Stream</button>
        <button on:click={stopStream} disabled={!isStreaming}>Stop Stream</button>
    </div>
</div>

<style>
    .video-container {
        position: relative;
        width: 100%;
        height: 100%;
    }

    .underlay {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .controls {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        z-index: 1000;
    }

    button {
        padding: 8px 16px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style> 