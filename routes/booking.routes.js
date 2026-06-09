const express = require("express");
const router = express.Router();

/* ================= TEMP STORAGE ================= */
global.bookings = global.bookings || [];

/* ================= CREATE BOOKING ================= */
router.post("/book", (req, res) => {
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
      status: "Pending",
      createdAt: new Date()
    };

    global.bookings.push(booking);

    console.log("📩 BOOKING SAVED:", booking);

    return res.json({
      success: true,
      bookingId: booking.id
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET ALL BOOKINGS ================= */
router.get("/bookings", (req, res) => {
  res.json(global.bookings);
});

/* ================= GET ONE BOOKING ================= */
router.get("/booking/:id", (req, res) => {
  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(booking);
});

/* ================= UPDATE STATUS ================= */
router.put("/admin/booking/:id", (req, res) => {
  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Not found" });
  }

  booking.status = req.body.status;

  res.json({
    success: true,
    updated: true
  });
});

module.exports = router;