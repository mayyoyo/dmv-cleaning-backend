require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

const app = express();

/* ================= CORS ================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ================= DB ================= */
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

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(mailOptions) {
  try {
    await transporter.sendMail(mailOptions);
    console.log("📧 Email sent");
  } catch (err) {
    console.error("❌ Email error:", err.message);
  }
}

/* ================= BOOK API ================= */
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
      const invoiceUrl =
        `https://dmv-cleaning-backend.onrender.com/api/invoice/${bookingId}`;

      /* ================= REAL GMAIL HTML EMAIL ================= */
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "🧼 Booking Confirmed - DMV Cleaning Services",
        html: `
          <div style="font-family: Arial; background:#f4f4f4; padding:20px">

            <div style="max-width:600px; margin:auto; background:#fff; padding:20px; border-radius:10px;">

              <h2 style="color:#2ecc71; text-align:center;">
                🧼 Booking Confirmed
              </h2>

              <p>Hi <b>${name}</b>,</p>

              <p>Your cleaning service has been successfully booked.</p>

              <hr/>

              <h3>📅 Booking Details</h3>

              <p><b>Service:</b> ${service}</p>
              <p><b>Date:</b> ${date}</p>
              <p><b>Time:</b> ${timeSlot}</p>
              <p><b>Phone:</b> ${phone}</p>
              <p><b>Price:</b> $${price}</p>
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

      await sendEmail(mailOptions);

      return res.json({
        success: true,
        bookingId
      });
    }
  );
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", (req, res) => {
  db.all(`SELECT * FROM bookings`, [], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});