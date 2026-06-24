require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

/* ================= BOOKING MODEL ================= */
const Booking = mongoose.model("Booking", {
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
  paymentStatus: String,
});

/* ================= EMAIL (OPTIONAL SAFE SETUP) ================= */
let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const nodemailer = require("nodemailer");

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  transporter.verify((error) => {
    if (error) {
      console.log("❌ EMAIL NOT READY:", error);
    } else {
      console.log("✅ EMAIL READY TO SEND");
    }
  });
}

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("🟢 Admin connected");
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "1234") {
    return res.json({ success: true, token: "admin-token" });
  }

  res.json({ success: false, message: "Invalid login" });
});

/* ================= AUTH ================= */
function auth(req, res, next) {
  if (req.headers.authorization !== "admin-token") {
    return res.status(401).send("Unauthorized");
  }
  next();
}

/* ================= DASHBOARD ================= */
app.get("/api/admin/dashboard", auth, async (req, res) => {
  const bookings = await Booking.find();

  res.json({
    total: bookings.length,
    bookings
  });
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/admin/booking/:id", auth, async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);

  const bookings = await Booking.find();

  io.emit("dashboard-update", {
    total: bookings.length,
    bookings
  });

  res.json({ success: true });
});

/* ================= EDIT BOOKING ================= */
app.put("/api/admin/booking/:id", auth, async (req, res) => {
  const updated = await Booking.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.json({ success: true, booking: updated });
});

/* ================= PAY LATER ================= */
app.post("/api/book-pay-later", async (req, res) => {
  const { name, email, phone, address, service, date, timeSlot } = req.body;

  function getPrice(service) {
    if (!service) return 120;
    if (service.includes("$120")) return 120;
    if (service.includes("$150")) return 150;
    if (service.includes("$200")) return 200;
    if (service.includes("$250")) return 250;
    return 120;
  }

  const price = getPrice(service);

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

  console.log("🔥 BOOKING SAVED:", booking);

  res.json({ success: true, bookingId: booking._id });
});

/* ================= INVOICE (HTML PAGE = PRINT PDF) ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.send("Booking not found");

  res.send(`
    <html>
    <head>
      <title>Invoice</title>
    </head>

    <body style="font-family:Arial;padding:20px">

      <h2>🧾 DMV Cleaning Invoice</h2>

      <p><b>Name:</b> ${booking.name}</p>
      <p><b>Service:</b> ${booking.service}</p>
      <p><b>Date:</b> ${booking.date}</p>
      <p><b>Time:</b> ${booking.timeSlot}</p>
      <p><b>Price:</b> $${booking.price}</p>
      <p><b>Status:</b> ${booking.paymentStatus}</p>

      <button onclick="window.print()">🖨 Print / Save PDF</button>

      <button onclick="
        navigator.clipboard.writeText(
          'Name: ${booking.name} | Service: ${booking.service} | Price: $${booking.price}'
        );
        alert('Copied!');
      ">
      📋 Copy Invoice
      </button>

    </body>
    </html>
  `);
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
  console.log("🔥 Backend fully started");
});
// 
app.get("/test-email", async (req, res) => {
  try {
    if (!transporter) {
      return res.send("❌ Email not configured");
    }

    console.log("🔥 TEST EMAIL HIT");

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // sends to yourself
      subject: "Test Email ✅",
      text: "Your email system is working!"
    });

    console.log("📧 TEST EMAIL SENT");

    res.send("✅ EMAIL SENT SUCCESS");

  } catch (err) {
    console.log("❌ EMAIL ERROR:", err);
    res.send("❌ EMAIL FAILED");
  }
});