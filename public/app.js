const socket = io();

console.log("=== APP JS LOADED ===");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc = null;
let localStream = null;
let otherSocketId = null;

/* ================= URL DETECT ================= */

const currentPath = window.location.pathname.replace(/\/$/, "");
const parts = currentPath.split("/");
const userIdFromURL = parts[parts.length - 1];

const isReceiverPage = currentPath.startsWith("/receiver/");
const isCallerPage = currentPath.startsWith("/call/");

console.log("Caller:", isCallerPage);
console.log("Receiver:", isReceiverPage);
console.log("UserID:", userIdFromURL);

/* ================= ICE (STUN + TURN) ================= */

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

/* ================= SOCKET CONNECT ================= */

socket.on("connect", () => {

  console.log("🟢 Socket Connected:", socket.id);

  if (isReceiverPage && userIdFromURL) {

    console.log("📞 Joining as receiver");

    socket.emit("receiver-join", {
      userId: userIdFromURL,
      token: null
    });

  }

});

/* ================= MEDIA ================= */

async function initMedia() {

  if (localStream) return;

  try {

    console.log("Requesting camera...");

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    console.log("Camera granted");

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

  } catch (err) {
    console.error("Camera error:", err);
  }

}

/* ================= PEER ================= */

function createPeer() {

  if (pc) return;

  pc = new RTCPeerConnection(iceConfig);

  console.log("Peer created");

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {

    console.log("🎥 Remote stream received");

    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }

  };

  pc.onicecandidate = (event) => {

    if (event.candidate) {
      socket.emit("ice-candidate", {
        to: otherSocketId,
        candidate: event.candidate
      });
    }

  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE State:", pc.iceConnectionState);
  };

}

/* ================= START CALL ================= */

async function startCall() {

  if (!isCallerPage || !userIdFromURL) return;

  await initMedia();

  console.log("📡 Calling:", userIdFromURL);

  socket.emit("call-user", {
    to: userIdFromURL
  });

}

/* ================= CALL BUTTON TRIGGER ================= */

if (isCallerPage) {

  document.body.addEventListener("click", function once() {

    startCall();
    document.body.removeEventListener("click", once);

  });

}

/* ================= INCOMING ================= */

socket.on("incoming-call", ({ callerSocketId }) => {

  console.log("📲 Incoming call");

  otherSocketId = callerSocketId;

  const acceptBtn = document.getElementById("acceptBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (acceptBtn) acceptBtn.style.display = "inline-block";
  if (rejectBtn) rejectBtn.style.display = "inline-block";

});

/* ================= ACCEPT ================= */

async function acceptCall() {

  console.log("Call accepted");

  const acceptBtn = document.getElementById("acceptBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (acceptBtn) acceptBtn.style.display = "none";
  if (rejectBtn) rejectBtn.style.display = "none";

  socket.emit("accept-call", {
    callerSocketId: otherSocketId
  });

}

/* ================= CALL ACCEPTED ================= */

socket.on("call-accepted", async ({ receiverSocketId }) => {

  console.log("Call accepted event");

  otherSocketId = receiverSocketId;

  await initMedia();
  createPeer();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    to: otherSocketId,
    offer
  });

});

/* ================= OFFER RECEIVED ================= */

socket.on("offer", async ({ offer, from }) => {

  console.log("Offer received");

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

});

/* ================= ANSWER RECEIVED ================= */

socket.on("answer", async ({ answer }) => {

  console.log("Answer received");

  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

});

/* ================= ICE RECEIVED ================= */

socket.on("ice-candidate", async ({ candidate }) => {

  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("ICE error:", err);
    }
  }

});

/* ================= REJECT ================= */

function rejectCall() {

  console.log("Call rejected");

  socket.emit("reject-call", {
    callerSocketId: otherSocketId
  });

}
