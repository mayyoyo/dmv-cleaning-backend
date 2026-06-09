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

/* ================= ENV ================= */
const PAYMENT_ENABLED = process.env.PAYMENT_ENABLED === "true";
const stripe = PAYMENT_ENABLED
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= TEST API ================= */
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

/* ================= BOOKINGS ================= */
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

/* ================= BOOKING CREATE (FIXED + SAFE) ================= */
app.post("/api/book", async (req, res) => {
  try {
    const { name, email, phone, address, date, timeSlot, service } = req.body;

    if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
      return res.status(400).json({ error: "All fields required" });
    }

    // ❌ prevent double booking
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
          <p>Your booking is <b>Pending</b>.</p>
          <p><b>Date:</b> ${date}</p>
          <p><b>Time:</b> ${timeSlot}</p>
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
    rejected: bookings.filter(b => b.status === "Rejected").length,
    paymentEnabled: PAYMENT_ENABLED
  });
});

/* ================= STRIPE CHECKOUT (FIXED) ================= */
app.post("/api/create-checkout-session", async (req, res) => {

  if (!PAYMENT_ENABLED || !stripe) {
    return res.json({
      url: null,
      message: "Payments disabled"
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Cleaning Deposit"
            },
            unit_amount: req.body.amount * 100
          },
          quantity: 1
        }
      ],
      success_url: "https://mydmvcleaningservice.com/success.html?status=success",
      cancel_url: "https://mydmvcleaningservice.com/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("STRIPE ERROR:", err);
    res.status(500).json({ error: "Stripe error" });
  }
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