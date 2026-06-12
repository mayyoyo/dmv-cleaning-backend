require("dotenv").config();

console.log("ENV CHECK:", process.env.MONGO_URI);

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

/* ================= EMAIL IMPORT (SAFE FIX) ================= */
let sendEmail = () => Promise.resolve();

try {
  const email = require("./email");
  sendEmail = email.sendEmail || sendEmail;
} catch (e) {
  console.log("⚠️ email.js not found — email disabled");
}

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

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */

// HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ADMIN LOGIN
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

// ADMIN DASHBOARD
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

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= GET BOOKINGS ================= */
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

    io.emit("new-booking", newBooking);

    sendEmail(newBooking, "received").catch(console.error);

    res.json({
      success: true,
      bookingId: newBooking._id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

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

      success_url:
        `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&bookingId=${bookingId}`,

      cancel_url:
        `${process.env.BASE_URL}/cancel.html`,

      metadata: {
        bookingId: bookingId
      }
    });

    await Booking.findByIdAndUpdate(bookingId, {
      stripeSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= STRIPE WEBHOOK ================= */
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {

        const booking = await Booking.findByIdAndUpdate(
          bookingId,
          { paymentStatus: "PAID" },
          { new: true }
        );

        /* 🔥 SEND PAID EMAIL */
        sendEmail(booking, "paid").catch(console.error);

        io.emit("payment-updated", booking);
      }
    }

    res.json({ received: true });
  }
);

/* ================= VERIFY PAYMENT ================= */
app.get("/api/verify-payment", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status === "paid") {

      const booking = await Booking.findByIdAndUpdate(
        req.query.bookingId,
        { paymentStatus: "PAID" },
        { new: true }
      );

      io.emit("payment-updated", booking);

      return res.json({ success: true });
    }

    res.json({ success: false });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= INVOICE PDF ================= */
app.get("/api/invoice/:id", async (req, res) => {

  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).send("Booking not found");
  }

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("DMV Cleaning Services Invoice", { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= START SERVER ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected ✅");

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  })
  .catch(err => {
    console.error(err);

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running WITHOUT DB");
    });
  });