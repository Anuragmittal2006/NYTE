const socket = io();
let peerConnection;
let dataChannel;
let userId, targetId;

// STUN server config
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Join room
document.getElementById("joinRoom").addEventListener("click", () => {
    userId = document.getElementById("userId").value;
    if (!userId) return alert("Enter your user ID!");
    socket.emit("joinRoom", userId);
    console.log(`You joined as: ${userId}`);
});

// Listen for signals
socket.on("signal", async ({ from, data }) => {
    console.log("Signal received:", data);

    // Create PeerConnection if not exists
    if (!peerConnection) createPeerConnection(from);

    // Process SDP or ICE candidate
    if (data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === "offer") {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("signal", { to: from, data: { sdp: answer } });
        }
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Create PeerConnection and DataChannel
function createPeerConnection(remoteId) {
    targetId = remoteId;
    peerConnection = new RTCPeerConnection(config);

    // ICE Candidate Handling
    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.emit("signal", { to: targetId, data: { candidate } });
        }
    };

    // Setup DataChannel
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };

    // Create DataChannel for sender
    if (!dataChannel) {
        dataChannel = peerConnection.createDataChannel("fileTransfer");
        setupDataChannel();
    }
}

// Setup DataChannel Handlers
function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("DataChannel is open");
        document.getElementById("status").innerText = "Connected!";
    };

    dataChannel.onclose = () => {
        console.log("DataChannel closed");
        document.getElementById("status").innerText = "Disconnected!";
    };

    dataChannel.onmessage = (event) => {
        console.log("Received file data:", event.data);
        document.getElementById("status").innerText = "File received!";
    };
}

// Send File
document.getElementById("sendFile").addEventListener("click", () => {
    const file = document.getElementById("fileInput").files[0];
    if (!file) return alert("Select a file first!");
    if (!dataChannel || dataChannel.readyState !== "open") {
        return alert("Connection is not open!");
    }

    const reader = new FileReader();
    reader.onload = () => {
        dataChannel.send(reader.result);
        document.getElementById("status").innerText = "File sent!";
    };
    reader.readAsArrayBuffer(file);
});
