require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
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
app.use("/api/webhook", express.raw({ type: "application/json" }));

/* ================= DATABASE ================= */
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
    await transporter.sendMail({
      from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "Booking Confirmed ✔",
      html: `
        <h2>Thank you for booking!</h2>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Total:</b> $${booking.price}</p>
        <p><b>Status:</b> ${booking.paymentStatus}</p>
      `
    });
  } catch (err) {
    console.log("Email error:", err.message);
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

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("API IS LIVE");
});

/* ================= BOOKINGS ================= */
app.get("/api/booked-slots", async (req, res) => {
  const bookings = await Booking.find();
  res.json(bookings);
});

/* ================= BLOCK HOURS ================= */
app.get("/api/blocked-hours", async (req, res) => {
  const { date } = req.query;
  const bookings = await Booking.find({ date });
  res.json(bookings.map(b => b.timeSlot));
});

/* ================= STRIPE ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  const { service, email, price, date, timeSlot, name, phone } = req.body;

  const exists = await Booking.findOne({ date, timeSlot });
  if (exists) {
    return res.json({ success: false, message: "Slot taken" });
  }

  const deposit = price * 0.2;
  const remaining = price - deposit;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    metadata: {
      type: "deposit",
      service,
      date,
      timeSlot,
      name,
      phone,
      price,
      deposit,
      remaining
    },
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `${service} Deposit`
        },
        unit_amount: Math.round(deposit * 100)
      },
      quantity: 1
    }],
    success_url: `${process.env.BASE_URL}/success.html`,
    cancel_url: `${process.env.BASE_URL}/booking.html`
  });

  res.json({ success: true, url: session.url });
});

/* ================= PAY LATER (FIXED) ================= */
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

    const exists = await Booking.findOne({
      date,
      timeSlot,
      paymentStatus: { $ne: "pay_later" }
    });

    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
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

    await sendEmail(booking);
    emitUpdate();

    return res.json({
      success: true,
      sessionId: booking._id
    });

  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

/* ================= SERVER START (ONLY ONCE) ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});