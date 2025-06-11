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
        
        // Disconnect any existing socket
        if (socket) {
            socket.disconnect();
        }
        
        socket = io(serverUrl, {
            transports: ['websocket'],
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
            timeout: 10000,
            forceNew: false,
            path: '/socket.io/',
            extraHeaders: {
                'Access-Control-Allow-Origin': '*'
            }
        });
        
        socket.on('connect', () => {
            console.log('Connected to signaling server');
            isStreaming = false; // Reset streaming state on new connection
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            isStreaming = false;
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from signaling server:', reason);
            isStreaming = false;
            stopVideo();
        });

        // Handle WebRTC signaling events
        socket.on('get_answer', async (answer) => {
            if (answer && peerConnection) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                    console.log('Set remote description successfully');
                    isStreaming = true;
                } catch (error) {
                    console.error('Error setting remote description:', error);
                    isStreaming = false;
                }
            }
        });

        socket.on('ice-candidate', async (candidate) => {
            if (candidate && peerConnection) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('Added ICE candidate successfully');
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
            }
        });
    });

    async function startVideo() {
        try {
            if (!peerConnection) {
                console.log('Creating new peer connection');
                peerConnection = new RTCPeerConnection(ICE_SERVERS);
                
                // Handle incoming tracks
                peerConnection.ontrack = (event) => {
                    console.log('Received track:', event.track.kind);
                    if (videoElement && event.streams[0]) {
                        console.log('Setting video stream');
                        videoElement.srcObject = event.streams[0];
                        videoElement.play().catch(e => console.error('Error playing video:', e));
                    }
                };

                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('Sending ICE candidate');
                        socket.emit('ice-candidate', {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        });
                    }
                };

                peerConnection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state:', peerConnection.iceConnectionState);
                };

                peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', peerConnection.connectionState);
                };

                // Create and send offer
                console.log('Creating offer');
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);

                // Send offer to server
                console.log('Sending offer');
                socket.emit('offer', {
                    type: offer.type,
                    sdp: offer.sdp,
                    id: 'client'
                });
            }
        } catch (error) {
            console.error('Error starting video:', error);
        }
    }

    function stopVideo() {
        if (peerConnection) {
            console.log('Closing peer connection');
            peerConnection.close();
            peerConnection = null;
        }
        if (videoElement) {
            console.log('Clearing video stream');
            videoElement.srcObject = null;
        }
        isStreaming = false;
    }

    onDestroy(() => {
        stopVideo();
        if (socket) {
            socket.disconnect();
            socket = null;
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