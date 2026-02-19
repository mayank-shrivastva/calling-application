require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= ENV ================= */

const MONGO_URI =
  process.env.MONGO_URI ||
  "";

const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key";

/* ================= DB CONNECT ================= */

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  });

app.use(express.json());

/* ================= ROUTES ================= */

app.get("/receiver/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "receiver.html"));
});

app.get("/call/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

/* ================= AUTH ================= */

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const userId =
      name.toLowerCase().replace(/\s+/g, "") +
      Math.floor(Math.random() * 10000);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      userId,
    });

    await user.save();

    res.json({ message: "Registered Successfully" });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Registration failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign(
      { userId: user.userId },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      receiverLink: `/receiver/${user.userId}`,
      callLink: `/call/${user.userId}`,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ================= SOCKET ================= */

let onlineUsers = {};

io.on("connection", (socket) => {

  console.log("🟢 New socket connected:", socket.id);

  /* ===== Receiver Join ===== */

  socket.on("receiver-join", ({ userId, token }) => {

    try {

      // If token present → verify
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.userId !== userId) {
          console.log("❌ Token mismatch");
          return;
        }
      }

      onlineUsers[userId] = socket.id;
      socket.userId = userId;

      console.log("📞 Receiver ONLINE:", userId);

    } catch (err) {
      console.log("❌ Invalid token");
    }

  });

  /* ===== Call User ===== */

  socket.on("call-user", ({ to }) => {

    console.log("📡 Caller trying to call:", to);

    if (onlineUsers[to]) {

      console.log("✅ Receiver found. Sending incoming-call.");

      io.to(onlineUsers[to]).emit("incoming-call", {
        callerSocketId: socket.id,
      });

    } else {

      console.log("❌ Receiver offline");
      socket.emit("receiver-offline");

    }

  });

 socket.on("accept-call", ({ callerSocketId }) => {

  console.log("📥 accept-call received from receiver");

  io.to(callerSocketId).emit("call-accepted", {
    receiverSocketId: socket.id,
  });

});


  socket.on("reject-call", ({ callerSocketId }) => {
    io.to(callerSocketId).emit("call-rejected");
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { candidate });
  });

  socket.on("disconnect", () => {

    if (socket.userId) {
      delete onlineUsers[socket.userId];
      console.log("🔴 Receiver OFFLINE:", socket.userId);
    }

  });

});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
