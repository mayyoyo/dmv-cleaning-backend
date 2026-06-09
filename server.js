console.log("🚀 PRODUCTION SYSTEM STARTING...");

require("dotenv").config();

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= ENV ================= */
const PAYMENT_ENABLED = process.env.PAYMENT_ENABLED === "true";

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================= BOOKINGS ================= */
let bookings = [];

/* ================= SOCKET REALTIME ================= */
io.on("connection", () => {
  console.log("⚡ Admin connected");
});

/* ================= EMAIL TEMPLATE ================= */
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

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT missing" });
    }

    jwt.verify(token, process.env.JWT_SECRET);
    next();

  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ error: "Invalid session" });
  }
}

/* ================= BOOKING ================= */
app.post("/api/book", async (req, res) => {
  const booking = {
    id: Date.now(),
    ...req.body,
    status: "Pending",
    createdAt: new Date()
  };

  bookings.push(booking);

  io.emit("new-booking", booking);

  await sendEmail(
    booking.email,
    "Booking Received - DMV Cleaning",
    `
      <div style="font-family:Arial;padding:20px">
        <h2>🧼 Booking Received</h2>
        <p>Hi <b>${booking.name}</b>,</p>
        <p>Your booking is <b>Pending</b>.</p>
        <p>Date: ${booking.date}</p>
        <p>Time: ${booking.timeSlot}</p>
      </div>
    `
  );

  res.json({ success: true });
});

/* ================= BOOKINGS LIST ================= */
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= APPROVE ================= */
app.post("/api/bookings/approve", async (req, res) => {
  const booking = bookings.find(b => b.id == req.body.id);
  if (!booking) return res.status(404).json({ error: "Not found" });

  booking.status = "Approved";

  await sendEmail(
    booking.email,
    "Booking Approved ✅",
    `
      <div style="font-family:Arial;padding:20px">
        <h2 style="color:green">Approved 🎉</h2>
        <p>Hi ${booking.name}, your booking is confirmed.</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
      </div>
    `
  );

  res.json({ success: true });
});

/* ================= REJECT ================= */
app.post("/api/bookings/reject", async (req, res) => {
  const booking = bookings.find(b => b.id == req.body.id);
  if (!booking) return res.status(404).json({ error: "Not found" });

  booking.status = "Rejected";

  await sendEmail(
    booking.email,
    "Booking Rejected ❌",
    `
      <div style="font-family:Arial;padding:20px">
        <h2 style="color:red">Rejected</h2>
        <p>Hi ${booking.name}, your booking was not available.</p>
        <p>Please choose another time slot.</p>
      </div>
    `
  );

  res.json({ success: true });
});

/* ================= ANALYTICS DASHBOARD ================= */
app.get("/api/analytics", auth, (req, res) => {
  const total = bookings.length;
  const pending = bookings.filter(b => b.status === "Pending").length;
  const approved = bookings.filter(b => b.status === "Approved").length;
  const rejected = bookings.filter(b => b.status === "Rejected").length;

  const revenue = bookings
    .filter(b => b.status === "Approved")
    .reduce((sum, b) => {
      if (b.service === "Deep Cleaning") return sum + 200;
      if (b.service === "Office Cleaning") return sum + 150;
      if (b.service === "Move In/Out Cleaning") return sum + 180;
      return sum + 120;
    }, 0);

  res.json({
    totalBookings: total,
    pending,
    approved,
    rejected,
    revenue,
    paymentEnabled: PAYMENT_ENABLED
  });
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
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });

  res.json({ success: true });
});

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("✅ SYSTEM READY ON PORT " + PORT);
});