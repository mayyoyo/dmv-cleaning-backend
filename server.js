require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "https://mydmvcleaningservice.com",
    "https://www.mydmvcleaningservice.com"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ✅ IMPORTANT STATIC FILES (REQUIRED FOR FRONTEND) */
app.use(express.static(path.join(__dirname, "public")));

/* ================= GLOBAL STORAGE ================= */
global.bookings = global.bookings || [];

/* ================= SOCKET CONNECTION ================= */

/* ✅ IMPORTANT (YOU REQUESTED THIS) */
io.on("connection", (socket) => {
  console.log("Client connected");

  // send current bookings instantly
  socket.emit("init-bookings", global.bookings);
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", (req, res) => {

  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { user: username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ================= AUTH ================= */
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
}

/* ================= PRICES ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= BOOKING ================= */
app.post("/api/book", async (req, res) => {

  const {
    name,
    email,
    phone,
    address,
    date,
    timeSlot,
    service
  } = req.body;

  if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
    return res.status(400).json({ error: "All fields required" });
  }

  const exists = global.bookings.find(
    b => b.date === date && b.timeSlot === timeSlot
  );

  if (exists) {
    return res.status(409).json({ error: "Slot already booked" });
  }

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
    status: "Pending",
    createdAt: new Date().toISOString()
  };

  global.bookings.push(booking);

  /* ================= REAL-TIME UPDATE (IMPORTANT) ================= */

  io.emit("new-booking", booking);
  io.emit("update-slots", global.bookings);

  /* ================= EMAIL ================= */
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Booking Confirmed",
    html: `
      <h2>Booking Confirmed</h2>
      <p>Service: ${service}</p>
      <p>Date: ${date}</p>
      <p>Time: ${timeSlot}</p>
      <p>Total: $${total}</p>
    `
  });

  res.json({
    success: true,
    bookingId: booking.id,
    total
  });
});

/* ================= GET BOOKINGS (ADMIN ONLY) ================= */
app.get("/api/bookings", verifyAdmin, (req, res) => {
  res.json(global.bookings);
});

/* ================= PUBLIC BOOKINGS (FOR FRONTEND SLOT SYSTEM) ================= */
app.get("/api/public-bookings", (req, res) => {
  res.json(global.bookings);
});

/* ================= SAVE CARD ================= */
app.post("/api/save-card", async (req, res) => {

  const { bookingId } = req.body;

  const booking = global.bookings.find(b => b.id == bookingId);

  if (!booking) return res.status(404).json({ error: "Not found" });

  const customer = await stripe.customers.create({
    email: booking.email
  });

  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id
  });

  booking.stripeCustomerId = customer.id;

  res.json({
    clientSecret: setupIntent.client_secret
  });
});

/* ================= COMPLETE BOOKING ================= */
app.post("/api/admin/complete/:id", verifyAdmin, async (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) return res.status(404).json({ error: "Not found" });

  try {

    booking.status = "Completed";

    const payment = await stripe.paymentIntents.create({
      amount: booking.total * 100,
      currency: "usd",
      customer: booking.stripeCustomerId,
      off_session: true,
      confirm: true
    });

    booking.paymentIntentId = payment.id;
    booking.status = "Paid";

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "Payment Completed",
      html: `<p>Your payment has been completed.</p>`
    });

    res.json({ success: true });

  } catch (err) {
    booking.status = "Payment Failed";
    res.status(500).json({ error: err.message });
  }
});

/* ================= CANCEL BOOKING ================= */
app.post("/api/admin/cancel/:id", verifyAdmin, async (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) return res.status(404).json({ error: "Not found" });

  try {

    if (booking.status === "Paid" && booking.paymentIntentId) {
      await stripe.refunds.create({
        payment_intent: booking.paymentIntentId
      });
    }

    booking.status = "Cancelled";

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "Booking Cancelled",
      html: `<p>Your booking was cancelled.</p>`
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ANALYTICS ================= */
app.get("/api/admin/analytics", verifyAdmin, (req, res) => {

  const data = {
    totalBookings: global.bookings.length,
    totalRevenue: 0,
    paid: 0,
    pending: 0
  };

  global.bookings.forEach(b => {
    if (b.status === "Paid") {
      data.totalRevenue += b.total;
      data.paid++;
    } else {
      data.pending++;
    }
  });

  res.json(data);
});

/* ================= AUTO REMINDER ================= */
cron.schedule("0 9 * * *", async () => {

  const unpaid = global.bookings.filter(b => b.status !== "Paid");

  for (const b of unpaid) {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: b.email,
      subject: "Payment Reminder",
      html: `<p>Please complete your payment.</p>`
    });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 CLEAN SYSTEM RUNNING ON PORT", PORT);
});