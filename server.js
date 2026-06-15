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

/* ================= SLOT LIMIT ================= */
const MAX_PER_SLOT = 3;

/* ================= INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= EMAIL (GLOBAL TRANSPORTER) ================= */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* VERIFY EMAIL */
transporter.verify((err, success) => {
  if (err) {
    console.error("❌ EMAIL CONFIG ERROR:", err);
  } else {
    console.log("✅ EMAIL SERVER READY");
  }
});

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

/* ================= EMAIL FUNCTION ================= */
async function sendConfirmationEmail(booking, retry = 0) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("❌ EMAIL NOT CONFIGURED");
      return;
    }

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
    console.error("❌ EMAIL ERROR:", err.message);

    if (retry < 3) {
      setTimeout(() => {
        sendConfirmationEmail(booking, retry + 1);
      }, 5000);
    }
  }
}

/* ================= DATABASE ================= */
mongoose.set("strictQuery", true);

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

/* ================= ADMIN LOGIN ================= */
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === "admin" && password === "1234") {
    return res.json({ success: true, token: "demo-token" });
  }

  return res.status(401).json({
    success: false,
    error: "Invalid credentials"
  });
});

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ================= BOOKING ================= */
app.post("/api/book", async (req, res) => {
  try {
    const count = await Booking.countDocuments({
      date: req.body.date,
      timeSlot: req.body.timeSlot
    });

    if (count >= MAX_PER_SLOT) {
      return res.status(400).json({
        success: false,
        error: "Slot full"
      });
    }

    const booking = await Booking.create({
      ...req.body,
      paymentStatus: "PENDING"
    });

    io.emit("new-booking", booking);

    const invoiceUrl = `${BASE_URL}/api/invoice/${booking._id}`;

    sendConfirmationEmail({
      ...booking._doc,
      invoiceUrl
    });

    res.json({ success: true });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= CONTACT ================= */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "All fields required"
      });
    }

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

    console.log("📩 CONTACT EMAIL SENT");

    res.json({ success: true });

  } catch (err) {
    console.error("❌ CONTACT ERROR:", err.message);
    res.status(500).json({
      success: false,
      error: "Email failed"
    });
  }
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

/* ================= FALLBACK ================= */
app.use((req, res) => {
  if (req.path.startsWith("/admin")) {
    return res.sendFile(path.join(__dirname, "public/admin/login.html"));
  }
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected ✅");

    const PORT = process.env.PORT || 10000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  } catch (err) {
    console.error("DB ERROR:", err.message);
    process.exit(1);
  }
}

startServer();