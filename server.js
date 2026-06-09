require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: "*"
  }
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

app.use(express.static(path.join(__dirname, "public")));

/* ================= DATABASE ================= */
let bookings = [];

/* ================= PRICE MAP ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= EMAIL TEMPLATE ================= */
function generateEmailHTML(booking) {
  return `
  <div style="font-family:Arial;background:#f7f7f7;padding:20px">
    <div style="max-width:600px;margin:auto;background:#fff;padding:20px;border-radius:10px">

      <h2 style="color:#16a34a;">Booking Confirmed ✅</h2>

      <p><b>Name:</b> ${booking.name}</p>
      <p><b>Service:</b> ${booking.service}</p>
      <p><b>Date:</b> ${booking.date}</p>
      <p><b>Time:</b> ${booking.timeSlot}</p>
      <p><b>Total Due:</b> $${booking.total}</p>

    </div>
  </div>
  `;
}

/* ================= CHECK DOUBLE BOOKING ================= */
function isSlotTaken(date, timeSlot) {
  return bookings.some(
    b => b.date === date && b.timeSlot === timeSlot
  );
}

/* ================= BOOKING API ================= */
app.post("/api/book", async (req, res) => {

  try {

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

    /* ================= DOUBLE BOOKING BLOCK ================= */
    if (isSlotTaken(date, timeSlot)) {
      return res.status(409).json({
        error: "This time slot is already booked"
      });
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
      status: "Pending"
    };

    bookings.push(booking);

    /* ================= EMAIL ================= */
    await transporter.sendMail({
      to: email,
      subject: "Booking Confirmed - DMV Cleaning",
      html: generateEmailHTML(booking)
    });

    /* ================= SOCKET LIVE UPDATE ================= */
    io.emit("new-booking", booking);

    return res.json({
      success: true,
      bookingId: booking.id,
      total: booking.total
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET BOOKINGS ================= */
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= PDF RECEIPT ================= */
app.get("/api/booking/:id/pdf", (req, res) => {

  const booking = bookings.find(b => b.id == req.params.id);
  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  doc.fontSize(20).text("DMV Cleaning Receipt", { align: "center" });
  doc.moveDown();

  doc.fontSize(12)
    .text(`Name: ${booking.name}`)
    .text(`Service: ${booking.service}`)
    .text(`Date: ${booking.date}`)
    .text(`Time: ${booking.timeSlot}`)
    .text(`Total Due: $${booking.total}`);

  doc.end();
});

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("Admin connected:", socket.id);
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});