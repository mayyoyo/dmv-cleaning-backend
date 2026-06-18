require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

const app = express();

/* ================= CORS FIX ================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ================= DATABASE ================= */
const db = new sqlite3.Database("./bookings.db");

db.run(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  phone TEXT,
  service TEXT,
  price REAL,
  date TEXT,
  timeSlot TEXT
)
`);

/* ================= EMAIL SETUP ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const BASE_URL = "https://dmv-cleaning-backend.onrender.com";

/* ================= EMAIL FUNCTION ================= */
async function sendBookingEmails(booking, bookingId) {

  const invoiceUrl = `${BASE_URL}/api/invoice/${bookingId}`;

  /* ================= CUSTOMER EMAIL ================= */
  const customerMail = {
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject: "🧼 Booking Confirmed - DMV Cleaning Services",
    html: `
      <div style="font-family: Arial; background:#f4f4f4; padding:20px">
        <div style="max-width:600px; margin:auto; background:#fff; padding:20px; border-radius:10px;">

          <h2 style="color:#2ecc71; text-align:center;">
            🧼 Booking Confirmed
          </h2>

          <p>Hi <b>${booking.name}</b>,</p>

          <p>Your cleaning service has been successfully booked.</p>

          <hr/>

          <h3>📅 Booking Details</h3>

          <p><b>Service:</b> ${booking.service}</p>
          <p><b>Date:</b> ${booking.date}</p>
          <p><b>Time:</b> ${booking.timeSlot}</p>
          <p><b>Phone:</b> ${booking.phone}</p>
          <p><b>Total:</b> $${booking.price}</p>
          <p><b>Booking ID:</b> ${bookingId}</p>

          <div style="margin-top:20px; text-align:center;">
            <a href="${invoiceUrl}"
              style="background:#2ecc71; color:#fff; padding:12px 20px;
              text-decoration:none; border-radius:5px;">
              📄 Download Invoice
            </a>
          </div>

          <p style="margin-top:20px; font-size:12px; color:#777;">
            DMV Cleaning Services LLC
          </p>

        </div>
      </div>
    `
  };

  /* ================= ADMIN EMAIL ================= */
  const adminMail = {
    from: process.env.EMAIL_USER,
    to: ADMIN_EMAIL,
    subject: "🚨 NEW BOOKING RECEIVED",
    html: `
      <div style="font-family: Arial; padding:20px">

        <h2>🚨 New Booking Alert</h2>

        <p><b>Name:</b> ${booking.name}</p>
        <p><b>Email:</b> ${booking.email}</p>
        <p><b>Phone:</b> ${booking.phone}</p>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Price:</b> $${booking.price}</p>
        <p><b>Booking ID:</b> ${bookingId}</p>

        <hr/>
        <p>Login to admin dashboard to manage this booking.</p>

      </div>
    `
  };

  await transporter.sendMail(customerMail);
  await transporter.sendMail(adminMail);
}

/* ================= CREATE BOOKING ================= */
app.post("/api/book", (req, res) => {

  const {
    name,
    email,
    phone,
    service,
    price,
    date,
    timeSlot
  } = req.body;

  if (!name || !email || !service || !date || !timeSlot) {
    return res.json({ success: false, error: "Missing fields" });
  }

  db.run(
    `INSERT INTO bookings (name, email, phone, service, price, date, timeSlot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, email, phone, service, price, date, timeSlot],
    async function (err) {

      if (err) {
        console.error("DB ERROR:", err);
        return res.json({ success: false });
      }

      const bookingId = this.lastID;

      /* SEND EMAILS */
      await sendBookingEmails(
        { name, email, phone, service, price, date, timeSlot },
        bookingId
      );

      return res.json({
        success: true,
        bookingId
      });
    }
  );
});

/* ================= GET BOOKINGS ================= */
app.get("/api/public-bookings", (req, res) => {
  db.all("SELECT * FROM bookings", [], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/book/:id", (req, res) => {

  const id = req.params.id;

  db.run("DELETE FROM bookings WHERE id = ?", [id], function (err) {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }

    return res.json({ success: true });
  });
});

/* ================= EDIT BOOKING ================= */
app.put("/api/book/:id", (req, res) => {

  const id = req.params.id;
  const { name, service, date, timeSlot, price } = req.body;

  db.run(
    `UPDATE bookings 
     SET name=?, service=?, date=?, timeSlot=?, price=? 
     WHERE id=?`,
    [name, service, date, timeSlot, price, id],
    function (err) {

      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      return res.json({ success: true });
    }
  );
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});