require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= ENV ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= ADMIN ================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";
const JWT_SECRET = "dmv_secret";

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= MODEL ================= */
const Booking = mongoose.model("Booking", new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  address: String,
  date: String,
  timeSlot: String,
  service: String,
  total: Number,
  status: { type: String, default: "UNPAID" },
  createdAt: { type: Date, default: Date.now }
}));

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find();
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

/* ================= BOOK ================= */
app.post("/api/book", async (req, res) => {
  const b = await Booking.create(req.body);

  io.emit("update-slots", await Booking.find());

  res.json({
    success: true,
    bookingId: b._id
  });
});

/* ================= DELETE ================= */
app.delete("/api/delete-booking/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);

  io.emit("update-slots", await Booking.find());

  res.json({ success: true });
});

/* ================= EDIT ================= */
app.put("/api/edit-booking/:id", async (req, res) => {
  await Booking.findByIdAndUpdate(req.params.id, req.body);

  io.emit("update-slots", await Booking.find());

  res.json({ success: true });
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin-login", (req, res) => {

  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {

    const token = jwt.sign(
      { admin: true },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ================= STRIPE SAVE CARD ================= */
app.post("/api/create-setup-intent", async (req, res) => {
  try {

    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const intent = await stripe.setupIntents.create({
      payment_method_types: ["card"]
    });

    res.json({
      clientSecret: intent.client_secret
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= ADMIN ANALYTICS ================= */
app.get("/api/admin/analytics", async (req, res) => {
  try {

    const bookings = await Booking.find();

    let weekly = {};
    let monthly = {};

    bookings.forEach(b => {

      const date = new Date(b.createdAt);

      const week = getWeekNumber(date);
      const month = date.getMonth() + 1;

      weekly[week] = (weekly[week] || 0) + (b.total || 0);
      monthly[month] = (monthly[month] || 0) + (b.total || 0);
    });

    res.json({ weekly, monthly });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= WEEK HELPER ================= */
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/* ================= INVOICE PDF ================= */
app.get("/api/invoice/:id", async (req, res) => {

  const b = await Booking.findById(req.params.id);

  if (!b) return res.status(404).send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  doc.fontSize(20).text("INVOICE");
  doc.moveDown();

  doc.text(`Name: ${b.name}`);
  doc.text(`Service: ${b.service}`);
  doc.text(`Date: ${b.date}`);
  doc.text(`Total: $${b.total}`);
  doc.text(`Status: ${b.status}`);

  doc.end();
});

/* ================= DAILY EMAIL REPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS
  }
});

cron.schedule("0 20 * * *", async () => {

  const bookings = await Booking.find();

  await transporter.sendMail({
    from: process.env.EMAIL,
    to: process.env.EMAIL,
    subject: "Daily Booking Report",
    text: `Total Bookings Today: ${bookings.length}`
  });

});

/* ================= START SERVER (IMPORTANT - DEPLOY FIX) ================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});