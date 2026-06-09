const express = require("express");
const router = express.Router();

/* TEMP DATABASE */
let bookings = [];

/* ================= BOOKING ================= */
router.post("/book", (req, res) => {
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

  console.log("📩 BOOKING CREATED:", booking);

  res.json({
    success: true,
    bookingId: booking.id   // 🔥 CRITICAL FOR FRONTEND REDIRECT
  });
});

/* ================= GET BOOKINGS ================= */
router.get("/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= SINGLE BOOKING ================= */
router.get("/booking/:id", (req, res) => {
  const booking = bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(booking);
});

module.exports = router;