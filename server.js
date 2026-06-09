require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

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

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= TEMP DATABASE ================= */
let bookings = [];

/* ================= PRICE LIST ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= CREATE BOOKING (FINAL FIX) ================= */
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

    /* ================= CALCULATE TOTAL ================= */
    const total = prices[service] ?? 0;

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
      total,   // ✅ IMPORTANT FIX
      status: "Pending",
      createdAt: new Date()
    };

    bookings.push(booking);

    console.log("BOOKING CREATED:", booking);

    /* ================= RESPONSE (FINAL FIX) ================= */
    return res.json({
      success: true,
      bookingId: booking.id,
      total: total   // ✅ ALWAYS SENT
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET ALL BOOKINGS ================= */
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= GET SINGLE BOOKING ================= */
app.get("/api/booking/:id", (req, res) => {

  const booking = bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.json(booking);
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});