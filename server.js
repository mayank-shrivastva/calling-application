const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

/* ================= ENV ================= */

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

/* ================= DB CONNECT ================= */

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= REGISTER ================= */

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const userId =
      name.toLowerCase() + Math.floor(Math.random() * 10000);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      userId
    });

    await user.save();

    res.json({ message: "Registered Successfully" });

  } catch (err) {
    res.status(400).json({ error: "Registration failed" });
  }
});

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });

  const token = jwt.sign(
    { userId: user.userId },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    receiverLink: `/receiver/${user.userId}`,
    callLink: `/call/${user.userId}`
  });
});

/* ================= ROUTES ================= */

app.get("/receiver/:id", (req, res) => {
  res.sendFile(__dirname + "/public/receiver.html");
});

app.get("/call/:id", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

/* ================= SOCKET ================= */

let onlineUsers = {};

io.on("connection", (socket) => {

  socket.on("receiver-join", async ({ userId, token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.userId !== userId) return;

      onlineUsers[userId] = socket.id;
      socket.userId = userId;

      console.log("Receiver online:", userId);

    } catch (err) {
      console.log("Invalid token attempt");
    }
  });

  socket.on("call-user", ({ to }) => {
    if (onlineUsers[to]) {
      io.to(onlineUsers[to]).emit("incoming-call", {
        callerSocketId: socket.id
      });
    } else {
      socket.emit("receiver-offline");
    }
  });

  socket.on("accept-call", ({ callerSocketId }) => {
    io.to(callerSocketId).emit("call-accepted", {
      receiverSocketId: socket.id
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
    }
  });
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
