require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");

/* ================= BASE URL ================= */
const BASE_URL =
  process.env.BASE_URL || "https://dmv-cleaning-backend.onrender.com";

/* ================= INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= EMAIL TRANSPORTER ================= */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((err) => {
  if (err) console.error("❌ EMAIL ERROR:", err);
  else console.log("✅ EMAIL READY");
});

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= ADMIN ================= */
app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

/* ================= DATABASE ================= */
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

/* ================= EMAIL CONFIRMATION (RETRY) ================= */
async function sendConfirmationEmail(booking, retry = 0) {
  try {
    await transporter.sendMail({
      from: `"DMV Cleaning Services" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "🧼 Booking Confirmed",
      html: `
        <h2>Booking Confirmed</h2>
        <p><b>Name:</b> ${booking.name}</p>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Total:</b> $${booking.total}</p>
        <p><a href="${booking.invoiceUrl}">View Invoice</a></p>
      `
    });

    console.log("📧 EMAIL SENT");

  } catch (err) {
    console.error("EMAIL ERROR:", err.message);

    if (retry < 3) {
      setTimeout(() => sendConfirmationEmail(booking, retry + 1), 5000);
    }
  }
}

/* ================= ADMIN LOGIN ================= */
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body || {};

  console.log("LOGIN REQUEST:", req.body);

  if (username === "admin" && password === "1234") {
    return res.json({
      success: true,
      token: "demo-token"
    });
  }

  return res.status(401).json({
    success: false,
    error: "Invalid credentials"
  });
});

/* ================= SOCKET LIVE ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ================= BOOKING API (FIXED bookingId) ================= */
app.post("/api/book", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);

    const invoiceUrl = `${BASE_URL}/api/invoice/${booking._id}`;

    io.emit("new-booking", booking);

    sendConfirmationEmail({
      ...booking._doc,
      invoiceUrl
    });

    /* ✅ FIXED RESPONSE */
    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= CONTACT EMAIL ================= */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    await transporter.sendMail({
      from: `"Website Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "📩 New Contact Message",
      html: `
        <h3>New Message</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Message:</b><br>${message}</p>
      `
    });

    console.log("📩 CONTACT SENT");
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Email failed"
    });
  }
});

/* ================= STRIPE ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {

    const { service, total, bookingId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: service },
            unit_amount: total * 100
          },
          quantity: 1
        }
      ],
      customer_email: email,
      success_url: `${BASE_URL}/success.html?bookingId=${bookingId}`,
      cancel_url: `${BASE_URL}/booking.html`,
      metadata: { bookingId }
    });

    await Booking.findByIdAndUpdate(bookingId, {
      stripeSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE WEBHOOK ================= */
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = JSON.parse(req.body);
  } catch (err) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    await Booking.findByIdAndUpdate(session.metadata.bookingId, {
      paymentStatus: "PAID"
    });

    io.emit("payment-update", session.metadata.bookingId);
  }

  res.json({ received: true });
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= START SERVER ================= */
async function start() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected");

  server.listen(process.env.PORT || 10000, () => {
    console.log("Server running");
  });
}

start();