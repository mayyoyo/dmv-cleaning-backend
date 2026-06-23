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
const io = new Server(server, {
  cors: { origin: "*" }
});

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MONGO ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log(err));

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

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
});

/* helper */
function emitUpdate() {
  io.emit("booking_update");
}

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= BOOKED SLOTS (DATE + HOUR) ================= */
app.get("/api/booked-slots", async (req, res) => {
  const bookings = await Booking.find();
  res.json(bookings);
});

/* ================= HOURLY BLOCK CHECK ================= */
app.get("/api/blocked-hours", async (req, res) => {
  const { date } = req.query;
  const bookings = await Booking.find({ date });

  res.json(bookings.map(b => b.timeSlot));
});

/* ================= CREATE DEPOSIT ================= */
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

/* ================= WEBHOOK ================= */
app.post("/api/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.metadata?.type === "deposit") {
      const booking = await Booking.create({
        stripeSessionId: session.id,
        name: session.metadata.name,
        email: session.customer_email,
        phone: session.metadata.phone,
        service: session.metadata.service,
        date: session.metadata.date,
        timeSlot: session.metadata.timeSlot,
        price: Number(session.metadata.price),
        deposit: Number(session.metadata.deposit),
        remaining: Number(session.metadata.remaining),
        paymentStatus: "deposit_paid"
      });

      emitUpdate(); // 🔥 REAL-TIME UPDATE
    }
  }

  res.json({ received: true });
});

/* ================= ADMIN LIVE ================= */
app.get("/api/admin/dashboard", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });

  res.json({
    totalBookings: bookings.length,
    bookings
  });
});

/* ================= START ================= */
server.listen(process.env.PORT || 5000, () =>
  console.log("🚀 Server running with WebSockets")
);