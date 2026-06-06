const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // for dashboard

// CREATE SERVER
const server = http.createServer(app);

// SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket"]
});

// CONNECTION
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

// TEST ROUTE
app.get("/api", (req, res) => {
  res.json({ message: "Backend working" });
});

// 🔥 SIMULATE BOOKING (TEST)
app.post("/api/test-booking", (req, res) => {
  console.log("📦 New booking");

  io.emit("new-booking", {
    message: "New cleaning booked"
  });

  res.json({ success: true });
});

// 🔥 SIMULATE PAYMENT (TEST)
app.post("/api/test-payment", (req, res) => {
  console.log("💰 Payment success");

  io.emit("payment-success", {
    amount: 150,
    bookingId: Date.now()
  });

  res.json({ success: true });
});

// START SERVER
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server + Socket running on", PORT);
});