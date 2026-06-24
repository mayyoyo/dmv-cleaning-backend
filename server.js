require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const nodemailer = require("nodemailer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= TEST ROUTE (MUST BE TOP) ================= */
app.get("/test-email", (req, res) => {
  res.send("TEST ROUTE WORKING");
});

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

/* ================= EMAIL SETUP ================= */
let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  transporter.verify((err) => {
    if (err) {
      console.log("❌ EMAIL FAILED:", err.message);
    } else {
      console.log("✅ EMAIL READY TO SEND");
    }
  });

} else {
  console.log("❌ EMAIL ENV NOT SET");
}

/* ================= SEND EMAIL ================= */
async function sendBookingEmail(booking) {
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "Booking Confirmed 🧼",
      text: `
Hi ${booking.name},

Your booking is confirmed!

Service: ${booking.service}
Date: ${booking.date}
Time: ${booking.timeSlot}
Price: $${booking.price}

DMV Cleaning Services
`
    });

    console.log("📧 EMAIL SENT");
  } catch (err) {
    console.log("❌ EMAIL ERROR:", err.message);
  }
}

/* ================= SOCKET ================= */
io.on("connection", () => {
  console.log("🟢 Admin connected");
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "1234") {
    return res.json({ success: true, token: "admin-token" });
  }

  res.json({ success: false });
});

/* ================= AUTH ================= */
function auth(req, res, next) {
  if (req.headers.authorization !== "admin-token") {
    return res.status(401).send("Unauthorized");
  }
  next();
}

/* ================= BOOK PAY LATER ================= */
app.post("/api/book-pay-later", async (req, res) => {
  try {
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

    await sendBookingEmail(booking);

    io.emit("dashboard-update");

    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

/* ================= GET SINGLE BOOKING ================= */
app.get("/api/booking/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(booking);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= DEBUG BOOKINGS ================= */
app.get("/debug-bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ADMIN DASHBOARD ================= */
app.get("/api/admin/dashboard", auth, async (req, res) => {
  const bookings = await Booking.find();

  const totalRevenue = bookings.reduce((a, b) => a + (b.price || 0), 0);

  res.json({
    totalBookings: bookings.length,
    totalRevenue,
    bookings
  });
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/admin/booking/:id", auth, async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.send("Not found");

  res.send(`
    <html>
      <body style="font-family:Arial;padding:20px">
        <h2>🧾 Invoice</h2>

        <p><b>Name:</b> ${booking.name}</p>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Price:</b> $${booking.price}</p>

        <button onclick="window.print()">Print PDF</button>
      </body>
    </html>
  `);
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});