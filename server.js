require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= MIDDLEWARE ================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/api/auth", authRoutes);

/* ================= ROUTES ================= */

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/call/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "call.html"));
});

app.get("/receiver/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "receiver.html"));
});

/* ================= SOCKET STATE ================= */

// userId -> socketId
const activeUsers = new Map();

// socketId -> otherSocketId (active call tracking)
const activeCalls = new Map();

/* ================= SOCKET SIGNALING ================= */

io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  /* ===== Register User ===== */

  socket.on("register", (userId) => {
    activeUsers.set(userId, socket.id);
    socket.join(userId);
    console.log("Registered:", userId);
  });

  /* ===== Call User ===== */

  socket.on("call-user", ({ to, offer }) => {

    const receiverSocket = activeUsers.get(to);

    if (!receiverSocket) {
      socket.emit("call-rejected");
      return;
    }

    // Track active call both sides
    activeCalls.set(socket.id, receiverSocket);
    activeCalls.set(receiverSocket, socket.id);

    io.to(to).emit("incoming-call", {
      offer,
      from: socket.id
    });
  });

  /* ===== Answer Call ===== */

  socket.on("answer-call", ({ to, answer }) => {
    io.to(to).emit("call-answered", { answer });
  });

  /* ===== ICE Exchange ===== */

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { candidate });
  });

  /* ===== End Call Manually ===== */

  socket.on("end-call", () => {

    const otherSocket = activeCalls.get(socket.id);

    if (otherSocket) {
      io.to(otherSocket).emit("call-ended");

      activeCalls.delete(otherSocket);
      activeCalls.delete(socket.id);
    }
  });

  /* ===== Disconnect Handling ===== */

  socket.on("disconnect", () => {

    console.log("Disconnected:", socket.id);

    // If user was in active call, notify other side
    const otherSocket = activeCalls.get(socket.id);

    if (otherSocket) {
      io.to(otherSocket).emit("call-ended");

      activeCalls.delete(otherSocket);
      activeCalls.delete(socket.id);
    }

    // Remove from activeUsers
    for (let [userId, sockId] of activeUsers.entries()) {
      if (sockId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
  });

});

/* ================= SERVER START ================= */

server.listen(3000, () => {
  console.log("Server running on port 3000");
});