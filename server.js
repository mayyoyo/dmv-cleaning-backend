
/**
 * FILE: server.js
 */

require("dotenv").config();

const fs = require("fs");
const express = require("express");
const path = require("path");

// ================= DEBUG CHECK =================
console.log("FILE EXISTS:", fs.existsSync("./routes/booking.routes.js"));

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= STATIC FILES =================
app.use(express.static(path.join(__dirname, "public")));

// ================= TEMP DATABASE =================
let bookings = [];

// ================= BOOKING ROUTE (FIXED) =================
app.post("/api/book", async (req, res) => {
  try {
    const { name, email, phone, address, date, timeSlot, service } = req.body;

    if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
      return res.status(400).json({ error: "All fields required" });
    }

    const booking = {
      id: Date.now(),
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      status: "Pending"
    };

    bookings.push(booking);

    console.log("BOOKING SAVED:", booking);

    // ✅ MUST return bookingId (IMPORTANT FOR REDIRECT)
    return res.json({
      success: true,
      bookingId: booking.id
    });

  } catch (err) {
    console.error("BOOKING ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ================= GET BOOKINGS =================
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  res.json({ status: "Server running ✅" });
});

// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ message: "Server error" });
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running on port ${PORT}`);
});
