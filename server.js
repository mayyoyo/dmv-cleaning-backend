require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

/* ================= CORS ================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

/* ================= STRIPE RAW WEBHOOK ================= */
app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= BASE ================= */
const BASE_URL = process.env.BASE_URL || "https://dmv-cleaning-backend.onrender.com";
const MAX_PER_SLOT = 3;

/* ================= ADMIN CREDENTIALS ================= */
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const Booking = mongoose.model("Booking", {
  name: String,
  email: String,
  phone: String,
  address: String,
  date: String,
  timeSlot: String,
  service: String,
  total: Number,
  paymentType: String,
  paymentStatus: { type: String, default: "pending" },
  stripeSessionId: String,
  createdAt: { type: Date, default: Date.now }
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= TEST EMAIL ================= */
app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "TEST EMAIL",
      html: "<h2>Email system is working ✅</h2>",
    });

    res.send("EMAIL SENT SUCCESSFULLY");
  } catch (err) {
    console.log(err);
    res.status(500).send("EMAIL FAILED: " + err.message);
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({
      success: true,
      token: "admin-token-123"
    });
  }

  res.status(401).json({
    success: false,
    error: "Invalid credentials"
  });
});

/* ================= ADMIN MIDDLEWARE ================= */
function adminAuth(req, res, next) {
  const token = req.headers.authorization;

  if (token === "admin-token-123") {
    next();
  } else {
    res.status(403).json({ error: "Unauthorized" });
  }
}

/* ================= BOOKING API ================= */
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

    const booking = await Booking.create(req.body);

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

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const data = await Booking.find();
  res.json(data);
});

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {

    const { bookingData } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: bookingData.service
          },
          unit_amount: bookingData.total * 100
        },
        quantity: 1
      }],
      success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/booking.html`
    });

    await Booking.create({
      ...bookingData,
      stripeSessionId: session.id,
      paymentStatus: "pending"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE WEBHOOK + EMAIL ================= */
app.post("/api/stripe-webhook", async (req, res) => {

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook Error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {

    const session = event.data.object;

    const booking = await Booking.findOne({
      stripeSessionId: session.id
    });

    if (booking) {

      booking.paymentStatus = "paid";
      await booking.save();

      console.log("✅ PAYMENT CONFIRMED");

      /* ================= EMAIL CUSTOMER ================= */
      try {
        await transporter.sendMail({
          from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
          to: booking.email,
          subject: "Payment Confirmed - Booking Receipt",
          html: `
            <h2>Payment Successful ✅</h2>
            <p><b>Name:</b> ${booking.name}</p>
            <p><b>Service:</b> ${booking.service}</p>
            <p><b>Date:</b> ${booking.date}</p>
            <p><b>Time:</b> ${booking.timeSlot}</p>
            <p><b>Total:</b> $${booking.total}</p>
            <hr/>
            <p>Thank you for your booking!</p>
          `
        });

        console.log("📧 CUSTOMER EMAIL SENT");
      } catch (emailErr) {
        console.log("EMAIL ERROR:", emailErr.message);
      }
    }
  }

  res.json({ received: true });
});

/* ================= VERIFY SESSION ================= */
app.get("/api/verify-session", async (req, res) => {
  try {

    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    const booking = await Booking.findOne({
      stripeSessionId: session.id
    });

    if (booking) {
      booking.paymentStatus = "paid";
      await booking.save();
    }

    res.json({ success: true, booking });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ADMIN ROUTES (PROTECTED) ================= */
app.get("/api/admin/bookings", adminAuth, async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post("/api/admin/delete", adminAuth, async (req, res) => {
  await Booking.findByIdAndDelete(req.body.id);
  res.json({ success: true });
});

/* ================= INVOICE PDF ================= */
app.get("/api/invoice/:id", async (req, res) => {

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("DMV Cleaning Invoice");
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});