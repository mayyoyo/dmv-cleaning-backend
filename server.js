require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "https://mydmvcleaningservice.com",
    "https://www.mydmvcleaningservice.com"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

/* ================= GLOBAL DB (RENDER SAFE) ================= */
global.bookings = global.bookings || [];

/* ================= PRICE MAP ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= CREATE BOOKING ================= */
app.post("/api/book", (req, res) => {

  try {

    const {
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service
    } = req.body;

    /* ================= VALIDATION ================= */
    if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
      return res.status(400).json({ error: "All fields required" });
    }

    /* ================= DOUBLE BOOKING CHECK ================= */
    const exists = global.bookings.find(
      b => b.date === date && b.timeSlot === timeSlot
    );

    if (exists) {
      return res.status(409).json({
        error: "This slot is already booked"
      });
    }

    /* ================= CALCULATE TOTAL ================= */
    const total = prices[service] || 0;

    /* ================= CREATE BOOKING ================= */
    const booking = {
      id: Date.now(),
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      total,
      status: "Pending",
      createdAt: new Date()
    };

    global.bookings.push(booking);

    console.log("BOOKING CREATED:", booking);

    /* ================= SOCKET LIVE UPDATE ================= */
    io.emit("new-booking", booking);

    /* ================= RESPONSE ================= */
    return res.json({
      success: true,
      bookingId: booking.id,
      total: booking.total
    });

  } catch (err) {
    console.error("BOOKING ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ================= GET ALL BOOKINGS ================= */
app.get("/api/bookings", (req, res) => {
  res.json(global.bookings);
});

/* ================= GET SINGLE BOOKING (IMPORTANT FIX) ================= */
app.get("/api/booking/:id", (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.json(booking); // ✅ includes total
});

/* ================= HEALTH CHECK ================= */
app.get("/health", (req, res) => {
  res.json({ status: "Server running ✅" });
});

/* ================= 404 HANDLER ================= */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found ❌",
    path: req.originalUrl
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});