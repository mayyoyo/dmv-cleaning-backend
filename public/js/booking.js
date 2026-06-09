console.log("🚀 PRODUCTION SYSTEM STARTING (FIXED)");

require("dotenv").config();

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================= BASIC TEST ================= */
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

/* ================= BOOKINGS STORAGE ================= */
let bookings = [];

/* ================= SOCKET ================= */
io.on("connection", () => {
  console.log("⚡ Admin connected");
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err);
  }
}

/* ================= AUTH ================= */
function auth(req, res, next) {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    jwt.verify(token, process.env.JWT_SECRET);
    next();

  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ error: "Invalid session" });
  }
}

/* ================= BOOKING CREATE ================= */
app.post("/api/book", async (req, res) => {
  try {
    const { name, email, phone, address, date, timeSlot, service } = req.body;

    if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
      return res.status(400).json({ error: "All fields required" });
    }

    // ❌ DOUBLE BOOKING CHECK
    const isTaken = bookings.some(
      b => b.date === date &&
           b.timeSlot === timeSlot &&
           b.status !== "Rejected"
    );

    if (isTaken) {
      return res.status(400).json({ error: "Time slot already booked" });
    }

    const booking = {
      id: Date.now(),
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      status: "Pending",
      createdAt: new Date()
    };

    bookings.push(booking);

    io.emit("new-booking", booking);

    await sendEmail(
      email,
      "Booking Received - DMV Cleaning",
      `
        <div style="font-family:Arial;padding:20px">
          <h2>🧼 Booking Received</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>Status: <b>Pending</b></p>
          <p>Date: ${date}</p>
          <p>Time: ${timeSlot}</p>
        </div>
      `
    );

    res.json({
      success: true,
      bookingId: booking.id
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= GET BOOKINGS ================= */
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= DASHBOARD ================= */
app.get("/api/dashboard", auth, (req, res) => {
  res.json({
    totalBookings: bookings.length,
    pending: bookings.filter(b => b.status === "Pending").length,
    approved: bookings.filter(b => b.status === "Approved").length,
    rejected: bookings.filter(b => b.status === "Rejected").length
  });
});

/* ================= LOGIN ================= */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { user: username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    });

    return res.json({ success: true });
  }

  res.status(401).json({ error: "Invalid credentials" });
});

/* ================= LOGOUT ================= */
app.get("/api/admin/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("✅ SERVER RUNNING ON PORT " + PORT);
});