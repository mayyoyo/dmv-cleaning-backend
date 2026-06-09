const express = require("express");
const router = express.Router();

/* ================= TEMP DATABASE ================= */
let bookings = [];

/* ================= PRICE MAP ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= BOOKING ROUTE ================= */
router.post("/book", (req, res) => {

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
    status: "Pending"
  };

  bookings.push(booking);

  return res.json({
    success: true,
    bookingId: booking.id,
    total
  });
});

/* ================= GET BOOKINGS ================= */
router.get("/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= GET SINGLE BOOKING ================= */
router.get("/booking/:id", (req, res) => {

  const booking = bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(booking);
});

module.exports = router;