require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= ENV ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= ADMIN ================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";
const JWT_SECRET = "dmv_secret";

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

/* ================= BOOK (FIXED VERSION) ================= */
app.post("/api/book", async (req, res) => {

  try {

    /* 🔍 DEBUG (VERY IMPORTANT) */
    console.log("BOOK REQUEST BODY:", req.body);

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

    /* ❌ SAFETY VALIDATION */
    if (!name || !email || !date || !timeSlot || !service) {
      console.log("❌ Missing fields detected:", req.body);

      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    /* 💰 AUTO PRICING */
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

    /* 🔔 REAL-TIME UPDATE */
    io.emit("new-booking", booking);
    io.emit("update-slots", await Booking.find());

    console.log("✅ BOOKING SAVED:", booking._id);

    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {

    console.error("🔥 BOOK ERROR FULL:", err);

    res.status(500).json({
      error: err.message || "Server error"
    });
  }
});

/* ================= DELETE ================= */
app.delete("/api/delete-booking/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  io.emit("update-slots", await Booking.find());
  res.json({ success: true });
});

/* ================= EDIT ================= */
app.put("/api/edit-booking/:id", async (req, res) => {
  await Booking.findByIdAndUpdate(req.params.id, req.body);
  io.emit("update-slots", await Booking.find());
  res.json({ success: true });
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin-login", (req, res) => {

  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {

    const token = jwt.sign(
      { admin: true },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ================= STRIPE SETUP ================= */
app.post("/api/create-setup-intent", async (req, res) => {
  try {

    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const intent = await stripe.setupIntents.create({
      payment_method_types: ["card"]
    });

    res.json({
      clientSecret: intent.client_secret
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= SERVER START ================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});