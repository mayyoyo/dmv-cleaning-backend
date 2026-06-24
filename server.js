require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* ================= SOCKET ================= */
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("🟢 Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Admin disconnected");
  });
});

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("API IS LIVE");
});

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

/* ================= MODEL ================= */
const bookingSchema = new mongoose.Schema({
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
  paymentStatus: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

/* ================= STRIPE ================= */
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= EMAIL TRANSPORTER ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= VERIFY EMAIL ================= */
transporter.verify((error) => {
  if (error) {
    console.log("❌ EMAIL NOT READY:", error);
  } else {
    console.log("✅ EMAIL READY TO SEND");
  }
});

/* ================= EMAIL FUNCTION (FIXED DEBUG) ================= */
async function sendEmail(booking) {
  try {
    console.log("🔥 EMAIL FUNCTION CALLED");
    console.log("📧 TO:", booking.email);
    console.log("📧 FROM:", process.env.EMAIL_USER);

    const result = await transporter.sendMail({
      from: `"DMV Cleaning Service" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "✅ Booking Confirmed",
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>🎉 Booking Confirmed</h2>
          <p>Name: ${booking.name}</p>
          <p>Service: ${booking.service}</p>
          <p>Date: ${booking.date}</p>
          <p>Time: ${booking.timeSlot}</p>
          <p>Status: ${booking.paymentStatus}</p>
        </div>
      `
    });

    console.log("📧 EMAIL SENT SUCCESS:", result.response);
    return true;

  } catch (err) {
    console.log("❌ EMAIL ERROR FULL STACK:");
    console.log(err);
    return false;
  }
}

/* ================= SOCKET UPDATE ================= */
function emitUpdate() {
  Booking.find().then((b) => {
    io.emit("dashboard-update", {
      totalBookings: b.length,
      bookings: b
    });
  });
}

/* ================= TEST EMAIL ================= */
app.get("/test-email", async (req, res) => {
  try {
    console.log("🔥 TEST EMAIL HIT");

    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "TEST EMAIL",
      text: "Email system is working"
    });

    console.log("📧 TEST EMAIL SENT:", result.response);

    res.send("EMAIL SENT SUCCESS");
  } catch (err) {
    console.log("❌ TEST EMAIL ERROR:", err);
    res.send("EMAIL FAILED");
  }
});

/* ================= PAY NOW ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email, price, date, timeSlot } = req.body;

    const exists = await Booking.findOne({
      date,
      timeSlot,
      paymentStatus: "paid"
    });

    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
    }

    const deposit = price * 0.2;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      metadata: { service, date, timeSlot, price },

      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: service + " Deposit"
          },
          unit_amount: Math.round(deposit * 100)
        },
        quantity: 1
      }],

      success_url: `${process.env.BASE_URL}/success.html`,
      cancel_url: `${process.env.BASE_URL}/booking.html`
    });

    return res.json({ success: true, url: session.url });

  } catch (err) {
    console.log("PAY NOW ERROR:", err.message);
    return res.json({ success: false, message: "Server error" });
  }
});

/* ================= PAY LATER (FIXED PRICE + EMAIL DEBUG READY) ================= */
app.post("/api/book-pay-later", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      service,
      date,
      timeSlot,
      price
    } = req.body;

    console.log("🔥 PAY LATER REQUEST:", req.body);

    // DEBUG ENV CHECK (IMPORTANT)
    console.log("EMAIL USER:", process.env.EMAIL_USER);
    console.log("EMAIL PASS EXISTS:", !!process.env.EMAIL_PASS);

    if (!service || !timeSlot || !name || !email || !date) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const exists = await Booking.findOne({
      date,
      timeSlot,
      paymentStatus: "paid"
    });

    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
    }

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

    console.log("BOOKING SAVED:", booking);

    const emailResult = await sendEmail(booking);
    console.log("EMAIL RESULT:", emailResult);

    emitUpdate();

    return res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.log("PAY LATER ERROR:", err.message);

    return res.json({
      success: false,
      message: "Server error"
    });
  }
});

/* ================= INVOICE ROUTE (FIXED) ================= */
app.get("/api/invoice/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({
      id: booking._id,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      service: booking.service,
      date: booking.date,
      time: booking.timeSlot,
      price: booking.price,
      status: booking.paymentStatus
    });

  } catch (err) {
    console.log("INVOICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= BLOCKED HOURS ================= */
app.get("/api/blocked-hours", async (req, res) => {
  try {
    const { date } = req.query;

    const bookings = await Booking.find({ date });

    res.json(bookings.map(b => b.timeSlot));

  } catch (err) {
    console.log("BLOCKED HOURS ERROR:", err.message);
    res.json([]);
  }
});

/* ================= DASHBOARD ================= */
app.get("/api/admin/dashboard", async (req, res) => {
  const bookings = await Booking.find();

  res.json({
    totalBookings: bookings.length,
    totalDepositRevenue: bookings.reduce((s, b) => s + (b.deposit || 0), 0),
    totalPendingBalance: bookings.reduce((s, b) => s + (b.remaining || 0), 0),
    bookings
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});