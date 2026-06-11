process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});

require("dotenv").config(); // MUST BE FIRST

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { Resend } = require("resend");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= ENV CHECK ================= */
if (!process.env.RESEND_API_KEY || !process.env.STRIPE_SECRET_KEY) {
  console.error("❌ Missing ENV KEYS");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= MEMORY DB ================= */
global.bookings = global.bookings || [];

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  socket.emit("init-bookings", global.bookings);
});

/* ================= BOOK SERVICE ================= */
app.post("/api/book", async (req, res) => {

  const { name, email, phone, address, date, timeSlot, service } = req.body;

  if (!name || !email || !date || !timeSlot || !service) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const exists = global.bookings.find(
    b => b.date === date && b.timeSlot === timeSlot
  );

  if (exists) {
    return res.status(409).json({ error: "Slot already booked" });
  }

  const prices = {
    "Home Cleaning": 120,
    "Deep Cleaning": 200,
    "Office Cleaning": 150,
    "Move In/Out Cleaning": 180
  };

  const total = prices[service] || 0;

  const booking = {
    id: Date.now(),
    name,
    email,
    phone,
    address,
    date,
    timeSlot,
    service,
    total,
    status: "UNPAID"
  };

  global.bookings.push(booking);

  io.emit("new-booking", booking);

  /* ================= EMAIL DEBUG ================= */
  console.log("Sending email to:", email);

  /* ================= EMAIL RECEIPT ================= */
  try {
    await resend.emails.send({
      from: "DMV Cleaning <no-reply@yourdomain.com>",
      to: email,
      subject: "Booking Confirmed ✔",
      html: `
        <h2>✔ Booking Confirmed</h2>
        <p>Hi ${name}</p>
        <p><b>Service:</b> ${service}</p>
        <p><b>Date:</b> ${date}</p>
        <p><b>Time:</b> ${timeSlot}</p>
        <p><b>Total:</b> $${total}</p>
      `
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err);
  }

  res.json({
    success: true,
    bookingId: booking.id,
    total
  });
});

/* ================= STRIPE: SAVE CARD ================= */
app.post("/api/create-setup-intent", async (req, res) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card"]
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE: CHARGE CUSTOMER ================= */
app.post("/api/charge-customer", async (req, res) => {
  try {

    const { paymentMethodId, amount, email, bookingId } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: email
    });

    const booking = global.bookings.find(b => b.id == bookingId);
    if (booking) booking.status = "PAID";

    io.emit("update-slots", global.bookings);

    await resend.emails.send({
      from: "DMV Cleaning <no-reply@yourdomain.com>",
      to: email,
      subject: "Payment Receipt ✔",
      html: `
        <h2>Payment Successful</h2>
        <p>Amount: $${amount}</p>
        <p>Thank you for your payment!</p>
      `
    });

    res.json({ success: true, paymentIntent });

  } catch (err) {
    console.error("STRIPE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= PDF INVOICE ================= */
app.get("/api/invoice/:id", (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("INVOICE");
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.status}`);

  doc.end();
});

/* ================= ANALYTICS ================= */
app.get("/api/analytics", (req, res) => {

  const monthly = {};

  global.bookings.forEach(b => {
    const month = b.date?.slice(0, 7);
    monthly[month] = (monthly[month] || 0) + (b.total || 0);
  });

  res.json(monthly);
});

/* ================= RENDER START FIX ================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});