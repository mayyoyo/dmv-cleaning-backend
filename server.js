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

/* ================= MIDDLEWARE (IMPORTANT ORDER) ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= ADMIN ROUTES ================= */
app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

/* ================= EMAIL FUNCTION (FIXED + SAFE) ================= */
async function sendConfirmationEmail(booking) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("❌ EMAIL NOT CONFIGURED");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Gmail App Password
      }
    });

    const invoiceUrl = booking.invoiceUrl || "Not available";

    console.log("📧 EMAIL DEBUG:", {
      user: process.env.EMAIL_USER,
      passExists: !!process.env.EMAIL_PASS,
      invoiceUrl
    });

    const info = await transporter.sendMail({
      from: `"DMV Cleaning Services" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "🧼 Booking Confirmed - DMV Cleaning Services",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>🧼 Booking Confirmed</h2>

          <p><b>Name:</b> ${booking.name || ""}</p>
          <p><b>Service:</b> ${booking.service || ""}</p>
          <p><b>Date:</b> ${booking.date || ""}</p>
          <p><b>Time:</b> ${booking.timeSlot || ""}</p>
          <p><b>Total:</b> $${booking.total || 0}</p>

          <hr>

          <p><b>Invoice:</b></p>
          <a href="${invoiceUrl}">${invoiceUrl}</a>

          <hr>

          <p>📞 703-967-0674</p>
        </div>
      `
    });

    console.log("📧 EMAIL SENT SUCCESSFULLY:", info.messageId);

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err);
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

/* ================= ADMIN LOGIN (FINAL FIXED) ================= */
app.post("/admin-login", (req, res) => {
  try {
    console.log("LOGIN REQUEST:", req.body);

    const { username, password } = req.body || {};

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

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Server crashed"
    });
  }
});

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= BOOKINGS ================= */
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
        error: "This slot is fully booked"
      });
    }

    const booking = await Booking.create({
      ...req.body,
      paymentStatus: "PENDING"
    });

    console.log("BOOKING CREATED:", booking._id);

    io.emit("new-booking", booking);
    io.emit("update-slots");

    const invoiceUrl = `${BASE_URL}/api/invoice/${booking._id}`;

    // SAFE EMAIL (DO NOT BREAK SERVER)
    sendConfirmationEmail({
      ...booking._doc,
      invoiceUrl
    }).catch(err => {
      console.log("EMAIL FAILED:", err.message);
    });

    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= STRIPE ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {

    if (!stripe) {
      return res.status(500).json({
        error: "Stripe not configured"
      });
    }

    const { service, total, bookingId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: service },
            unit_amount: Math.round(total * 100)
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
    console.error("Stripe Error:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("Invoice", { align: "center" });
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= FALLBACK (MUST BE LAST) ================= */
app.use((req, res) => {
  if (req.path.startsWith("/admin")) {
    return res.status(404).send("Admin page not found");
  }

  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= START SERVER ================= */
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