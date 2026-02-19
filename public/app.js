const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc;
let localStream;
let otherSocketId;

let isMuted = false;
let currentFacingMode = "user";

/* ================= SAFE URL DETECT ================= */

const currentPath = window.location.pathname.replace(/\/$/, "");
const parts = currentPath.split("/");
const userIdFromURL = parts[parts.length - 1];

const isReceiverPage = currentPath.startsWith("/receiver/");
const isCallerPage = currentPath.startsWith("/call/");

/* ================= ICE ================= */

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

/* ================= MEDIA ================= */

async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: currentFacingMode },
    audio: true
  });

  localVideo.srcObject = localStream;
}

/* ================= PEER ================= */

function createPeer() {
  pc = new RTCPeerConnection(iceConfig);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        to: otherSocketId,
        candidate: event.candidate
      });
    }
  };
}

/* ================= RECEIVER JOIN ================= */

if (isReceiverPage && userIdFromURL) {

  const token = localStorage.getItem("token");

  if (!token) {
    alert("Login required");
    window.location.href = "/login.html";
  } else {
    socket.emit("receiver-join", {
      userId: userIdFromURL,
      token: token
    });

    updateStatus("Waiting for call...");
  }
}

/* ================= CALLER ================= */

async function startCall() {

  if (!isCallerPage || !userIdFromURL) return;

  await initMedia();

  socket.emit("call-user", {
    to: userIdFromURL
  });

  updateStatus("Calling...");
}

/* ================= INCOMING ================= */

socket.on("incoming-call", ({ callerSocketId }) => {

  otherSocketId = callerSocketId;

  showButtons("accept", "reject");
  updateStatus("Incoming call...");
});

/* ================= ACCEPT ================= */

function acceptCall() {

  hideButtons("accept", "reject");
  updateStatus("Connecting...");

  socket.emit("accept-call", {
    callerSocketId: otherSocketId
  });
}

/* ================= REJECT ================= */

function rejectCall() {

  socket.emit("reject-call", {
    callerSocketId: otherSocketId
  });

  resetUI();
}

/* ================= CONNECTION FLOW ================= */

socket.on("call-accepted", async ({ receiverSocketId }) => {

  otherSocketId = receiverSocketId;

  await initMedia();
  createPeer();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    to: otherSocketId,
    offer
  });

  updateStatus("Connected");
  showButtons("end", "mute", "switch");
});

socket.on("offer", async ({ offer, from }) => {

  otherSocketId = from;

  await initMedia();
  createPeer();

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    to: otherSocketId,
    answer
  });

  updateStatus("Connected");
  showButtons("end", "mute", "switch");
});

socket.on("answer", async ({ answer }) => {
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on("ice-candidate", async ({ candidate }) => {
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

/* ================= OFFLINE ================= */

socket.on("receiver-offline", () => {
  updateStatus("Receiver Offline");
});

/* ================= MUTE ================= */

function toggleMute() {

  if (!localStream) return;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = isMuted;
  });

  isMuted = !isMuted;

  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn) {
    muteBtn.innerText = isMuted ? "🔇" : "🎤";
  }
}

/* ================= END ================= */

function endCall() {

  if (pc) {
    pc.close();
    pc = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;

  resetUI();
}

/* ================= SWITCH CAMERA ================= */

async function switchCamera() {

  if (!localStream) return;

  currentFacingMode =
    currentFacingMode === "user" ? "environment" : "user";

  localStream.getTracks().forEach(track => track.stop());

  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: currentFacingMode },
    audio: true
  });

  localVideo.srcObject = localStream;

  if (pc) {
    const sender = pc.getSenders().find(s => s.track.kind === "video");
    if (sender) {
      sender.replaceTrack(localStream.getVideoTracks()[0]);
    }
  }
}

/* ================= UI HELPERS ================= */

function updateStatus(text) {
  const callStatus = document.getElementById("callStatus");
  if (callStatus) callStatus.innerText = text;
}

function showButtons(...buttons) {
  buttons.forEach(btn => {
    const el = document.getElementById(btn + "Btn");
    if (el) el.style.display = "inline-block";
  });
}

function hideButtons(...buttons) {
  buttons.forEach(btn => {
    const el = document.getElementById(btn + "Btn");
    if (el) el.style.display = "none";
  });
}

function resetUI() {
  hideButtons("accept", "reject", "end", "mute", "switch");
  updateStatus("Waiting...");
  isMuted = false;
}
