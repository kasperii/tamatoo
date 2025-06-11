<script>
    import { onMount, onDestroy } from 'svelte';
    import { io } from 'socket.io-client';

    let videoElement;
    let peerConnection;
    let isStreaming = false;
    let socket = null;

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
        
        // Initialize socket connection
        try {
            socket = io(serverUrl, {
                transports: ['websocket'],
                reconnectionAttempts: 3,
                reconnectionDelay: 1000,
                timeout: 10000,
                forceNew: true,
                path: '/socket.io/'
            });
            
            // Set up socket event handlers
            if (socket) {
                socket.on('connect', () => {
                    console.log('Connected to signaling server');
                    isStreaming = false;
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
            }
        } catch (error) {
            console.error('Error initializing socket:', error);
        }
    });

    async function startVideo() {
        try {
            console.log("Starting video stream...");
            isStreaming = true;
            
            // Create peer connection with proper configuration
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ],
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            });
            
            // Set up event handlers
            if (peerConnection) {
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate && socket) {
                        console.log("Sending ICE candidate:", event.candidate);
                        socket.emit('ice-candidate', {
                            candidate: event.candidate,
                            sdpMid: event.sdpMid,
                            sdpMLineIndex: event.sdpMLineIndex
                        });
                    }
                };
                
                peerConnection.ontrack = (event) => {
                    console.log("Received track:", event.track.kind, event.track.label);
                    if (event.streams && event.streams[0] && videoElement) {
                        console.log("Setting video stream with tracks:", event.streams[0].getTracks().map(t => t.kind));
                        videoElement.srcObject = event.streams[0];
                    }
                };
                
                peerConnection.onconnectionstatechange = () => {
                    console.log("Connection state:", peerConnection.connectionState);
                };
                
                peerConnection.oniceconnectionstatechange = () => {
                    console.log("ICE connection state:", peerConnection.iceConnectionState);
                };
            }
            
            // Create and send offer
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
                voiceActivityDetection: true
            });
            
            console.log("Setting local description...");
            await peerConnection.setLocalDescription(offer);
            
            console.log("Sending offer to server...");
            if (socket) {
                socket.emit('offer', {
                    type: offer.type,
                    sdp: offer.sdp
                });
            }
            
        } catch (error) {
            console.error("Error starting video:", error);
            isStreaming = false;
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
        }
    }
    
    function stopVideo() {
        console.log("Stopping video stream...");
        isStreaming = false;
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (videoElement) {
            videoElement.srcObject = null;
        }
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