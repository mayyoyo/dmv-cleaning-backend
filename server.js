require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= MODEL ================= */
const Booking = mongoose.model("Booking", new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  address: String,
  date: String,
  timeSlot: String,
  service: String,
  total: Number,
  status: { type: String, default: "UNPAID" },
  createdAt: { type: Date, default: Date.now }
}));

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find();
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

/* ================= SAFE BOOKING (FIXED) ================= */
app.post("/api/book", async (req, res) => {

  try {

    const {
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      paymentType
    } = req.body;

    /* 🔴 SAFETY CHECK */
    if (!name || !email || !date || !timeSlot) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    /* 💰 PRICE SYSTEM (4 SERVICES) */
    let total = 0;

    if (service === "Home Cleaning") total = 120;
    if (service === "Deep Cleaning") total = 200;
    if (service === "Office Cleaning") total = 150;
    if (service === "Move In/Out Cleaning") total = 180;

    /* 💾 SAVE BOOKING */
    const booking = await Booking.create({
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      total,
      status: paymentType === "pay_now" ? "UNPAID" : "PAY_LATER"
    });

    /* 🔔 LIVE UPDATE */
    io.emit("new-booking", booking);
    io.emit("update-slots", await Booking.find());

    /* 📦 RESPONSE */
    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= STRIPE PAY NOW ================= */
app.post("/api/create-checkout-session", async (req, res) => {

  try {

    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { service, total, bookingId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: service },
          unit_amount: total * 100
        },
        quantity: 1
      }],
      success_url: "https://your-site.com/success.html",
      cancel_url: "https://your-site.com/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= START SERVER (FIX 502 ISSUE) ================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});