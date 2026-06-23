require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("🟢 Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Admin disconnected");
  });
});

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= ROOT FIX (VERY IMPORTANT) ================= */
app.get("/", (req, res) => {
  res.send("API IS LIVE");
});

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

/* ================= MODEL ================= */
const bookingSchema = new mongoose.Schema({
  stripeSessionId: String,
  name: String,
  email: String,
  phone: String,
  address: String,
  service: String,
  date: String,
  timeSlot: String,
  price: Number,
  deposit: Number,
  remaining: Number,
  paymentStatus: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

/* ================= STRIPE ================= */
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(booking) {
  try {
    if (!booking?.email) return;

    await transporter.sendMail({
      from: `"DMV Cleaning Service" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "✅ Booking Confirmed - DMV Cleaning Service",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2>🎉 Booking Confirmed!</h2>

          <p><b>Name:</b> ${booking.name}</p>
          <p><b>Service:</b> ${booking.service}</p>
          <p><b>Date:</b> ${booking.date}</p>
          <p><b>Time:</b> ${booking.timeSlot}</p>
          <p><b>Address:</b> ${booking.address}</p>
          <p><b>Phone:</b> ${booking.phone}</p>
          <p><b>Total:</b> $${booking.price}</p>

          <hr/>
          <p>Status: <b>${booking.paymentStatus}</b></p>

          <h3>We will contact you shortly 👍</h3>
        </div>
      `
    });

    console.log("📧 Email sent:", booking.email);

  } catch (err) {
    console.log("EMAIL ERROR:", err.message);
  }
}

/* ================= LIVE UPDATE ================= */
function emitUpdate() {
  Booking.find().then((bookings) => {
    io.emit("dashboard-update", {
      totalBookings: bookings.length,
      bookings
    });
  });
}

/* ================= PAY NOW ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email, price, date, timeSlot } = req.body;

    const exists = await Booking.findOne({
      date,
      timeSlot,
      paymentStatus: { $ne: "pay_later" }
    });

    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
    }

    const deposit = price * 0.2;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      metadata: { service, date, timeSlot, price },
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `${service} Deposit` },
          unit_amount: Math.round(deposit * 100)
        },
        quantity: 1
      }],
      success_url: `${process.env.BASE_URL}/success.html`,
      cancel_url: `${process.env.BASE_URL}/booking.html`
    });

    res.json({ success: true, url: session.url });

  } catch (err) {
    console.log("PAY NOW ERROR:", err.message);
    res.json({ success: false, message: "Server error" });
  }
});

/* ================= PAY LATER (FINAL FIXED) ================= */
app.post("/api/book-pay-later", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      service,
      date,
      timeSlot,
      price
    } = req.body;

    console.log("PAY LATER REQUEST:", req.body);

    if (!name || !email || !service || !date || !timeSlot) {
      return res.json({
        success: false,
        message: "Missing required fields"
      });
    }

    // ✅ ONLY BLOCK PAID BOOKINGS
    const exists = await Booking.findOne({
      date,
      timeSlot,
      paymentStatus: { $ne: "pay_later" }
    });

    console.log("EXISTS CHECK:", exists);

    if (exists) {
      return res.json({
        success: false,
        message: "Slot already booked"
      });
    }

    const booking = await Booking.create({
      name,
      email,
      phone,
      address,
      service,
      date,
      timeSlot,
      price,
      deposit: 0,
      remaining: price,
      paymentStatus: "pay_later"
    });

    console.log("BOOKING SAVED:", booking);

    await sendEmail(booking);
    emitUpdate();

    return res.json({
      success: true,
      sessionId: booking._id
    });

  } catch (err) {
    console.log("PAY LATER ERROR:", err);

    return res.json({
      success: false,
      message: "Server error"
    });
  }
});

/* ================= ADMIN DASHBOARD ================= */
app.get("/api/admin/dashboard", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });

  res.json({
    totalBookings: bookings.length,
    totalDepositRevenue: bookings.reduce((s, b) => s + (b.deposit || 0), 0),
    totalPendingBalance: bookings.reduce((s, b) => s + (b.remaining || 0), 0),
    bookings
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});