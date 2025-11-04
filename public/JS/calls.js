// calls.js - all call / WebRTC logic
(function(){
  const helpers = window.chatHelpers || {};
  const cfg = helpers.cfg || {};
  const socket = helpers.socket || window.socket;
  const senderId = cfg.senderId;
  const receiverId = cfg.receiverId;
  const name = cfg.senderName || '';
  let localStream = null, remoteStream = null, peerConnection = null;
  let ringTimeout = null;
  let isRinging = false;
  let isVideoCall = false;
  let callActive = false;
  let isCameraOn = true;
  let isMicOn = true;
  let currentFacingMode = 'user';
  const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  function $(id) { return document.getElementById(id); }

  async function getUserMedia(isVideo) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      const localV = document.getElementById("localVideo");
      if (localV) localV.srcObject = localStream;
      return localStream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      return null;
    }
  }

  function createPeerConnection() {
    if (!localStream) {
      console.error("localStream is undefined! Make sure getUserMedia() ran successfully.");
      // create an empty peerConnection anyway to avoid null references? safer to return
      return;
    }
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        document.getElementById("remoteVideo").srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: receiverId, candidate: event.candidate });
      }
    };
    return peerConnection;
  }

  function openCallScreen(isVideo) {
    isRinging = true;
    let ringCount = 0;
    function startRinging() {
      if (ringCount < 8 && isRinging) {
        navigator.vibrate?.(500);
        ringCount++;
        setTimeout(startRinging, 4000);
      }
    }
    startRinging();
    ringTimeout = setTimeout(() => {
      alert("Call ended: No response");
      endCall();
    }, 32000);

    if (isVideo) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          document.getElementById("callScreen").style.display = "flex";
          document.getElementById("localVideo").srcObject = stream;
        })
        .catch(err => console.error("Error accessing camera:", err));
    } else {
      document.getElementById("callScreen").style.display = "flex";
    }
  }

  function switchToActiveCall() {
    document.getElementById("callScreen").classList.add("call-active");
  }

  function endCall() {
    if (!callActive) return;
    callActive = false;
    document.getElementById("callScreen").style.display = "none";
    isRinging = false;
    navigator.vibrate?.(0);
    clearTimeout(ringTimeout);

    const video = document.getElementById("localVideo");
    if (video?.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    socket.emit("endCall", { from: senderId, to: receiverId });
    console.log(`Call ended by ${senderId}`);
  }

  socket.on("incomingCall", async (data) => {
    console.log(`Incoming ${data.type} call from ${data.from} (${data.name})`);
    isVideoCall = data.type === "video";
    localStream = await getUserMedia(isVideoCall);
    await createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    document.getElementById("callerName").innerText = `${data.name} is calling.`;
    document.getElementById("callTypeText").innerText = isVideoCall ? "Incoming Video Call..." : "Incoming Voice Call...";
    document.getElementById("toggleIncomingVideo").style.display = isVideoCall ? 'inline-block' : 'none';
    document.getElementById("incomingCallPopup").style.display = 'block';
  });

  // accept
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("answerCall")?.addEventListener("click", async () => {
      document.getElementById("incomingCallPopup").style.display = "none";
      callActive = true;
      openCallScreen(isVideoCall);
      isRinging = false;
      clearTimeout(ringTimeout);
      switchToActiveCall();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("callAccepted", { from: senderId, to: receiverId, answer });
    });

    document.getElementById("rejectCall")?.addEventListener("click", () => {
      socket.emit("callRejected", { from: senderId, to: receiverId });
      document.getElementById("incomingCallPopup").style.display = "none";
    });

    document.getElementById("videoCallBtn")?.addEventListener("click", () => startCall("video"));
    document.getElementById("voiceCallBtn")?.addEventListener("click", () => startCall("audio"));
    document.getElementById("endCall")?.addEventListener("click", endCall);
    document.getElementById("flipCamera")?.addEventListener("click", flipCamera);
    document.getElementById("toggleCamera")?.addEventListener("click", toggleCamera);
    document.getElementById("muteMic")?.addEventListener("click", muteMic);
  });

  socket.on("callAccepted", async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    isRinging = false;
    clearTimeout(ringTimeout);
    switchToActiveCall();
  });

  socket.on("ice-candidate", ({ candidate }) => {
    if (peerConnection) {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error('addIceCandidate err', err));
    }
  });

  socket.on("callRejected", () => {
    console.log("Call rejected by remote.");
    endCall();
  });

  socket.on("callEnded", () => {
    console.log("Call ended by other user");
    document.getElementById("incomingCallPopup").style.display = "none";
    endCall();
  });

  async function startCall(type) {
    if (callActive) return;
    callActive = true;
    isVideoCall = type === "video";
    openCallScreen(isVideoCall);
    localStream = await getUserMedia(isVideoCall);
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("callUser", { to: receiverId, from: senderId, name, type, offer });
  }

  function flipCamera() {
    if (!localStream) return;
    let videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    const constraints = { video: { facingMode: currentFacingMode }, audio: true };
    navigator.mediaDevices.getUserMedia(constraints).then(newStream => {
      const newVideoTrack = newStream.getVideoTracks()[0];
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newVideoTrack);
      peerConnection.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video') sender.replaceTrack(newVideoTrack);
      });
      document.getElementById('localVideo').srcObject = newStream;
      localStream = newStream;
    }).catch(err => console.error('flipCamera error', err));
  }

  function toggleCamera() {
    if (!localStream) return;
    let videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      isCameraOn = videoTrack.enabled;
      document.getElementById('toggleCamera').innerText = isCameraOn ? '📷 Off' : '📷 On';
    }
  }

  function muteMic() {
    if (!localStream) return;
    let audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      isMicOn = audioTrack.enabled;
      document.getElementById('muteMic').innerText = isMicOn ? '🔇 Mute' : '🎤 Unmute';
    }
  }

  // expose for debug
  window.calls = { startCall, endCall, flipCamera, toggleCamera, muteMic };
})();
