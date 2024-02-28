<script>
 RTCPeerConnection = window.RTCPeerConnection || /*window.mozRTCPeerConnection ||*/ window.webkitRTCPeerConnection;
 RTCSessionDescription = /*window.mozRTCSessionDescription ||*/ window.RTCSessionDescription;
 RTCIceCandidate = /*window.mozRTCIceCandidate ||*/ window.RTCIceCandidate;


 var video = document.getElementById('v');
 var signalObj = null;

 var signalling_server_hostname = location.hostname || "192.168.1.8";
 var signalling_server_address = signalling_server_hostname + ':' + (9000 || (location.protocol === 'https:' ? 443 : 80));
 var isStreaming = false;


 function signal(url, onStream, onError, onClose, onMessage) {
     if ("WebSocket" in window) {
         console.log("opening web socket: " + url);
         var ws = new WebSocket(url);
         var pc;
         var iceCandidates = [];
         var hasRemoteDesc = false;

         function addIceCandidates() {
             if (hasRemoteDesc) {
                 iceCandidates.forEach(function (candidate) {
                     pc.addIceCandidate(candidate,
                                        function () {
                                            console.log("IceCandidate added: " + JSON.stringify(candidate));
                                        },
                                        function (error) {
                                            console.error("addIceCandidate error: " + error);
                                        }
                     );
                 });
                 iceCandidates = [];
             }
         }

         function addAudio(audiostream){
             pc.addTrack(audiostream)
         }

         ws.onopen = function () {
             /* First we create a peer connection */
             var config = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]};
             var options = {optional: []};
             pc = new RTCPeerConnection(config, options);
             iceCandidates = [];
             hasRemoteDesc = false;

             pc.onicecandidate = function (event) {
                 if (event.candidate) {
                     var candidate = {
                         sdpMLineIndex: event.candidate.sdpMLineIndex,
                         sdpMid: event.candidate.sdpMid,
                         candidate: event.candidate.candidate
                     };
                     var request = {
                         what: "addIceCandidate",
                         data: JSON.stringify(candidate)
                     };
                  ws.send(JSON.stringify(request));
                 } else {
                     console.log("end of candidates.");
                 }
             };

             if ('ontrack' in pc) {
                 pc.ontrack = function (event) {
                     onStream(event.streams[0]);
                 };
             } else {  // onaddstream() deprecated
                    pc.onaddstream = function (event) {
                        onStream(event.stream);
                    };
                    }

                 pc.onremovestream = function (event) {
                     console.log("the stream has been removed: do your stuff now");
                 };

             pc.ondatachannel = function (event) {
                 console.log("a data channel is available: do your stuff with it");
                 // For an example, see https://www.linux-projects.org/uv4l/tutorials/webrtc-data-channels/
             };

             /* kindly signal the remote peer that we would like to initiate a call */
             var request = {
                 what: "call",
                 options: {
                     // If forced, the hardware codec depends on the arch.
                     // (e.g. it's H264 on the Raspberry Pi)
                     // Make sure the browser supports the codec too.
                     // force_hw_vcodec: true,
                     //                      vformat: 70, /* 30=640x480, 30 fps */
                     trickle_ice: true
                 }
             };
             console.log("send message " + JSON.stringify(request));
             ws.send(JSON.stringify(request));
         };

         ws.onmessage = function (evt) {
             var msg = JSON.parse(evt.data);
             var what = msg.what;
             var data = msg.data;

             console.log("received message " + JSON.stringify(msg));

             switch (what) {
                 case "offer":
                     var mediaConstraints = {
                         optional: [],
                         mandatory: {
                             OfferToReceiveAudio: true,
                             OfferToReceiveVideo: true
                         }
                     };
                     pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data)),
                                             function onRemoteSdpSuccess() {
                                                 hasRemoteDesc = true;
                                                 addIceCandidates();
                                                 pc.createAnswer(function (sessionDescription) {
                                                     pc.setLocalDescription(sessionDescription);
                                                     var request = {
                                                         what: "answer",
                                                         data: JSON.stringify(sessionDescription)
                                                     };
                                                     ws.send(JSON.stringify(request));
                                                 }, function (error) {
                                                     onError("failed to create answer: " + error);
                                                 }, mediaConstraints);
                                             },
                                             function onRemoteSdpError(event) {
                                                 onError('failed to set the remote description: ' + event);
                                                 ws.close();
                                             }
                     );

                     break;

                 case "answer":
                     break;

                 case "message":
                     if (onMessage) {
                         onMessage(msg.data);
                     }
                     break;

                 case "iceCandidate": // received when trickle ice is used (see the "call" request)
                     if (!msg.data) {
                         console.log("Ice Gathering Complete");
                         break;
                     }
                     var elt = JSON.parse(msg.data);
                     let candidate = new RTCIceCandidate({sdpMLineIndex: elt.sdpMLineIndex, candidate: elt.candidate});
                     iceCandidates.push(candidate);
                     addIceCandidates(); // it internally checks if the remote description has been set
                     break;

                 case "iceCandidates": // received when trickle ice is NOT used (see the "call" request)
                     var candidates = JSON.parse(msg.data);
                     for (var i = 0; candidates && i < candidates.length; i++) {
                         var elt = candidates[i];
                         let candidate = new RTCIceCandidate({sdpMLineIndex: elt.sdpMLineIndex, candidate: elt.candidate});
                         iceCandidates.push(candidate);
                     }
                     addIceCandidates();
                     break;
             }
         };

         ws.onclose = function (event) {
             console.log('socket closed with code: ' + event.code);
             if (pc) {
                 pc.close();
                 pc = null;
                 ws = null;
             }
             if (onClose) {
                 onClose();
             }
         };

         ws.onerror = function (event) {
             onError("An error has occurred on the websocket (make sure the address is correct)!");
         };

         this.hangup = function() {
             if (ws) {
                 var request = {
                     what: "hangup"
                 };
                 console.log("send message " + JSON.stringify(request));
                 ws.send(JSON.stringify(request));
             }
         };

     } else {
         onError("Sorry, this browser does not support Web Sockets. Bye.");
     }
 }


const audio = document.querySelector('audio');

 const constraints = window.constraints = {
     audio: true,
     video: false
 };



 function handleSuccess(stream) {
     const audioTracks = stream.getAudioTracks();
     console.log('Got stream with constraints:', constraints);
     console.log('Using audio device: ' + audioTracks[0].label);
     signalObj.addAudio(stream)
     stream.oninactive = function() {
         console.log('Stream ended');
     };
     window.stream = stream; // make variable available to browser console
     //      audio.srcObject = stream;
     //      return stream
 }

 function handleError(error) {
     const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
     document.getElementById('errorMsg').innerText = errorMessage;
     console.log(errorMessage);
     return null
 }




 window.addEventListener('DOMContentLoaded', function () {
     var start = document.getElementById('start');
     var stop = document.getElementById('stop');
     var video = document.getElementById('v');
     var audStart = document.getElementById('audStart');
     var tamaview = document.getElementById('tamaview');
     var tamablur = document.getElementById('tamablur');

     start.addEventListener('click', function (e) {
         var address = signalling_server_address
         var protocol = location.protocol === "https:" ? "wss:" : "ws:";
         var wsurl = protocol + '//' + address + '/stream/webrtc';

         if (!isStreaming) {
             signalObj = new signal(wsurl,
                                    function (stream) {
                                        console.log('got a stream!');
                                        //var url = window.URL || window.webkitURL;
                                        //video.src = url ? url.createObjectURL(stream) : stream; // deprecated
                                        tamaview.srcObject = stream;
                                        //                                         tamablur.srcObject = stream;
                                        tamaview.play();



                                        //                                         tamablur.play();
                                        //                                         tamablur.volume = 0;
                                        //video.srcObject = stream;
                                        //video.play();

                                    },
                                    function (error) {
                                        alert(error);
                                    },
                                    function () {
                                        console.log('websocket closed. bye bye!');
                                        //video.srcObject = null;
                                        tamaview.srcObject = null;
                                        //                                         itamablur.srcObject = null;
                                        //video.src = ''; // deprecated
                                        //ctx.clearRect(0, 0, canvas.width, canvas.height);
                                        isStreaming = false;
                                    },
                                    function (message) {
                                        alert(message);
                                    }
             );
         }
     }, false);

     stop.addEventListener('click', function (e) {
         if (signalObj) {
             signalObj.hangup();
             signalObj = null;
         }
     }, false);

     audStart.addEventListener('click', function (e){
         navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);
         //          signalObj.addAudio(audiostream)
     })

     // Wait until the video stream can play
     tamaview.addEventListener('canplay', function (e) {
         if (!isStreaming) {
         //canvas.setAttribute('width', video.videoWidth);
         //canvas.setAttribute('height', video.videoHeight);
         isStreaming = true;
     }
 }, false);

     // Wait for the video to start to play
     tamaview.addEventListener('play', function () {
         // Every 33 milliseconds copy the video image to the canvas
         setInterval(function () {
             if (tamaview.paused || tamaview.ended) {
                 return;
         }

         //var w = canvas.getAttribute('width');
         //var h = canvas.getAttribute('height');
         //ctx.fillRect(0, 0, w, h);
         //ctx.drawImage(video, 0, 0, w, h);

     }, 33);
 }, false);

});

</script>


<!-- <video id='v'></video> -->

<div>
    <button id='start' title="If you do not see any video stream, make sure your browser supports the codec used within this demo (see the source code for details, or try Firefox or Chrome)">Start Streaming</button>i
    <button id='stop'> Stop Streaming </button>
    <button id='audStart'> start sending audio </button>
</div>
