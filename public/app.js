const socket = io();

console.log("=== APP JS LOADED ===");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc;
let localStream;
let otherSocketId;

/* ================= URL DETECT ================= */

const currentPath = window.location.pathname.replace(/\/$/, "");
const parts = currentPath.split("/");
const userIdFromURL = parts[parts.length - 1];

const isReceiverPage = currentPath.startsWith("/receiver/");
const isCallerPage = currentPath.startsWith("/call/");

console.log("Caller:", isCallerPage);
console.log("Receiver:", isReceiverPage);
console.log("UserID:", userIdFromURL);

/* ================= ICE ================= */

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
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

  console.log("initMedia()");

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  if (localVideo) {
    localVideo.srcObject = localStream;
  }

}

/* ================= PEER ================= */

function createPeer() {

  pc = new RTCPeerConnection(iceConfig);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    console.log("Remote stream received");
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

}

/* ================= START CALL ================= */

async function startCall() {

  console.log("Start call");

  if (!isCallerPage || !userIdFromURL) return;

  await initMedia();

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

  console.log("Accepted");

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
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

});

/* ================= REJECT ================= */

function rejectCall() {

  console.log("Rejected");

  socket.emit("reject-call", {
    callerSocketId: otherSocketId
  });

}
