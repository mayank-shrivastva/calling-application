// ================= SIGNUP =================

const signupForm = document.getElementById("signupForm");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      window.location.href = "login.html";
    }
  });
}

// ================= LOGIN =================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const data = Object.fromEntries(formData);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (result.token) {
      localStorage.setItem("token", result.token);
      window.location.href = "/dashboard";
    }
  });
}

// ================= DASHBOARD AUTH =================

if (window.location.pathname === "/dashboard") {

  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "login.html";
  } else {

    const payload = JSON.parse(atob(token.split(".")[1]));

    const receiverId = payload._id || payload.id;
    const receiverName = payload.name;

    document.getElementById("receiverIdText").innerText = receiverId;

    // ================= SOCKET CONNECT =================

    const socket = io();
    socket.emit("register", receiverId);

    // ================= WEBRTC CONFIG =================

    let peerConnection;
    const config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    };

    // ================= INCOMING CALL =================

    socket.on("incoming-call", async ({ offer, from }) => {

      window.currentCaller = from;

      showIncomingCall(from);

      window.acceptCall = async function () {

        stopCallAlert();
        setStatus("busy");

        peerConnection = new RTCPeerConnection(config);

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", {
              to: from,
              candidate: event.candidate
            });
          }
        };

        peerConnection.ontrack = (event) => {
          const remoteVideo = document.getElementById("remoteVideo");
          if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
          }
        };

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("answer-call", {
          to: from,
          answer
        });
      };

    });

    // ================= CALL ANSWERED =================

    socket.on("call-answered", async ({ answer }) => {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // ================= ICE CANDIDATE =================

    socket.on("ice-candidate", async ({ candidate }) => {
      if (peerConnection) {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    });

  }
}

// ================= LOGOUT =================

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}