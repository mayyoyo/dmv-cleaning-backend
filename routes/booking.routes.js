
const express = require("express");
const router = express.Router();

global.bookings = global.bookings || [];

// ================= CREATE BOOKING =================
router.post("/book", (req, res) => {
  const booking = {
    ...req.body,
    _id: Date.now().toString(),
    status: "Pending"
  };

  global.bookings.push(booking);

  res.json({
    success: true,
    bookingId: booking._id
  });
});

// ================= GET ONE =================
router.get("/booking/:id", (req, res) => {
  const booking = global.bookings.find(b => b._id === req.params.id);

  if (!booking) {
    return res.status(404).json({ message: "Not found" });
  }

  res.json(booking);
});

// ================= GET ALL (ADMIN) =================
router.get("/all-bookings", (req, res) => {
  res.json(global.bookings);
});

// ================= UPDATE STATUS =================
router.put("/admin/booking/:id", (req, res) => {
  const booking = global.bookings.find(b => b._id === req.params.id);

  if (!booking) {
    return res.status(404).json({ message: "Not found" });
  }

  booking.status = req.body.status;

  res.json({ success: true });
});

module.exports = router;
