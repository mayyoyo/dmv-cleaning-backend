require("dotenv").config();

console.log("ENV CHECK:", process.env.MONGO_URI);

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");

/* ================= EMAIL + WHATSAPP ================= */
const { sendEmail, sendWhatsApp } = require("./gmail");

/* ================= APP INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* 🔥 STATIC FILES (REQUIRED FIX) */
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= ADMIN ROUTES ================= */
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

/* ================= MODEL ================= */
const Booking = mongoose.model(
  "Booking",
  new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    address: String,
    date: String,
    timeSlot: String,
    service: String,
    total: Number,

    paymentType: String,
    paymentStatus: { type: String, default: "PENDING" },

    stripeSessionId: String,

    createdAt: { type: Date, default: Date.now }
  })
);

/* ================= SOCKET LIVE ADMIN ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC API ================= */
app.get("/api/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ================= CREATE BOOKING ================= */
app.post("/api/book", async (req, res) => {
  try {
    const newBooking = await Booking.create({
      ...req.body,
      paymentStatus: "PENDING"
    });

    /* 🔥 LIVE ADMIN UPDATE */
    io.emit("new-booking", newBooking);

    /* 🔥 EMAIL + WHATSAPP (NON BLOCKING) */
    sendEmail(newBooking, "received").catch(console.error);
    sendWhatsApp(newBooking).catch(console.error);

    res.json({
      success: true,
      bookingId: newBooking._id
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({ success: false });
  }
});

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { service, total, bookingId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: service },
          unit_amount: Math.round(total * 100)
        },
        quantity: 1
      }],

      customer_email: email,

      /* ✅ SUCCESS + CANCEL REDIRECT */
      success_url:
        `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&bookingId=${bookingId}`,

      cancel_url:
        `${process.env.BASE_URL}/cancel.html`
    });

    await Booking.findByIdAndUpdate(bookingId, {
      stripeSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("STRIPE ERROR:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= PAYMENT VERIFICATION ================= */
app.get("/api/verify-payment", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status === "paid") {

      const booking = await Booking.findByIdAndUpdate(
        req.query.bookingId,
        { paymentStatus: "PAID" },
        { new: true }
      );

      /* 🔥 REAL TIME ADMIN UPDATE */
      io.emit("payment-updated", booking);

      return res.json({ success: true });
    }

    res.json({ success: false });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);

    io.emit("booking-deleted", req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= UPDATE BOOKING ================= */
app.put("/api/bookings/:id", async (req, res) => {
  try {
    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    io.emit("booking-updated", updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected ✅");

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  })
  .catch(err => {
    console.error("MongoDB error ❌", err);

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running WITHOUT DB");
    });
  });