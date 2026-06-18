require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();

/* ================= CORS (FIXED - IMPORTANT) ================= */
app.use(cors({
  origin: "*"
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= BASE ================= */
const BASE_URL = process.env.BASE_URL || "https://dmv-cleaning-backend.onrender.com";
const MAX_PER_SLOT = 3;

/* ================= DEBUG ================= */
console.log("EMAIL:", process.env.EMAIL_USER);
console.log("EMAIL PASS:", process.env.EMAIL_PASS ? "OK" : "MISSING");

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((err) => {
  if (err) console.log("EMAIL ERROR", err);
  else console.log("EMAIL READY");
});

/* ================= DB ================= */
mongoose.set("strictQuery", true);

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
  createdAt: { type: Date, default: Date.now }
});

/* ================= EMAIL FUNCTION ================= */
async function sendEmail(mailOptions) {
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent");
  } catch (err) {
    console.log("Email error", err.message);
  }
}

/* ================= BOOK API (FIXED SAFE + EMAIL + SLOT CHECK) ================= */
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

    const invoiceUrl = `${BASE_URL}/api/invoice/${booking._id}`;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "🧼 Booking Confirmed",
      html: `
        <h2>Booking Confirmed</h2>
        <p><b>Name:</b> ${booking.name}</p>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Total:</b> $${booking.total || 0}</p>
        <p><a href="${invoiceUrl}">Download Invoice</a></p>
      `
    });

    return res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  try {
    const data = await Booking.find();
    res.json(data);
  } catch (err) {
    res.status(500).json([]);
  }
});

/* ================= ADMIN ENDPOINTS ================= */
app.get("/api/admin/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post("/api/admin/update-status", async (req, res) => {
  await Booking.findByIdAndUpdate(req.body.id, {
    paymentStatus: req.body.status
  });

  res.json({ success: true });
});

app.post("/api/admin/delete", async (req, res) => {
  await Booking.findByIdAndDelete(req.body.id);
  res.json({ success: true });
});

/* ================= INVOICE ================= */
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
  doc.text(`Total: $${booking.total || 0}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🔥 Server running on", PORT);
});