<script>
    import { onMount, onDestroy } from 'svelte';
    import { io } from 'socket.io-client';

    let videoElement;
    let peerConnection;
    let isStreaming = false;
    let socket;

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };

    onMount(() => {
        // Get the current host and port from window location
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = '5050'; // Your Flask server port
        const serverUrl = `${protocol}//${hostname}:${port}`;
        
        console.log('Connecting to server at:', serverUrl);
        
        socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('Connected to signaling server');
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from signaling server:', reason);
            stopVideo();
        });
    });

    async function startVideo() {
        try {
            if (!peerConnection) {
                peerConnection = new RTCPeerConnection(ICE_SERVERS);
                
                // Handle incoming tracks
                peerConnection.ontrack = (event) => {
                    if (videoElement && event.streams[0]) {
                        videoElement.srcObject = event.streams[0];
                    }
                };

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

                // Create and send offer
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                // Send offer to server
                socket.emit('offer', {
                    type: offer.type,
                    sdp: offer.sdp,
                    id: 'client'
                });

                // Handle answer
                socket.on('get_answer', async (answer) => {
                    if (answer) {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                        isStreaming = true;
                    }
                });
            }
        } catch (error) {
            console.error('Error starting video:', error);
        }
    }

    function stopVideo() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        isStreaming = false;
    }

    onDestroy(() => {
        stopVideo();
        if (socket) {
            socket.disconnect();
        }
    });
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
        <button on:click={startVideo} disabled={isStreaming}>Start Stream</button>
        <button on:click={stopVideo} disabled={!isStreaming}>Stop Stream</button>
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