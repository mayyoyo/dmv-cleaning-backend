require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

/* ================= APP INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= ENV ================= */
const PORT = process.env.PORT || 10000;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* 🔥 REQUIRED (STATIC FILES) */
app.use(express.static("public"));

/* ================= HOME ROUTE (REQUIRED FIX) ================= */
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

/* ================= ADMIN ================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";
const JWT_SECRET = "dmv_secret";

/* ================= MODEL ================= */
const Booking = mongoose.model(
  "Booking",
  new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    address: String,
    date: String,
    timeSlot: String,
    service: String,
    total: Number,
    status: { type: String, default: "UNPAID" },
    createdAt: { type: Date, default: Date.now }
  })
);

/* ================= DB EVENTS ================= */
mongoose.connection.on("connected", () => {
  console.log("MongoDB connection ready ✅");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error ❌", err);
});

/* ================= SAFE DB CHECK ================= */
async function ensureDB(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database not ready" });
  }
  next();
}

/* ================= ADMIN ROUTES ================= */
app.get("/admin", (req, res) => {
  res.sendFile(__dirname + "/public/admin/login.html");
});

app.get("/admin/login.html", (req, res) => {
  res.sendFile(__dirname + "/public/admin/login.html");
});

app.get("/admin/dashboard.html", (req, res) => {
  res.sendFile(__dirname + "/public/admin/dashboard.html");
});

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find();
  socket.emit("init-bookings", bookings);
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

/* ================= BOOKING API ================= */
app.post("/api/book", ensureDB, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      paymentType
    } = req.body;

    if (!name || !email || !date || !timeSlot || !service) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let total = 0;
    if (service === "Home Cleaning") total = 120;
    if (service === "Deep Cleaning") total = 200;
    if (service === "Office Cleaning") total = 150;
    if (service === "Move In/Out Cleaning") total = 180;

    const booking = await Booking.create({
      name,
      email,
      phone,
      address,
      date,
      timeSlot,
      service,
      total,
      status: paymentType === "pay_now" ? "UNPAID" : "PAY_LATER"
    });

    io.emit("new-booking", booking);
    io.emit("update-slots", await Booking.find());

    res.json({ success: true, bookingId: booking._id });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { service, total, customer } = req.body;

    if (!service || !total || !customer) {
      return res.status(400).json({ error: "Missing checkout data" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: service
            },
            unit_amount: Math.round(total * 100)
          },
          quantity: 1
        }
      ],

      customer_email: customer.email,

      success_url: "https://dmv-cleaning-backend.onrender.com/success.html",
      cancel_url: "https://dmv-cleaning-backend.onrender.com/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("STRIPE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin-login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, {
      expiresIn: "1d"
    });

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ================= STRIPE SETUP ================= */
app.post("/api/create-setup-intent", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const intent = await stripe.setupIntents.create({
      payment_method_types: ["card"]
    });

    res.json({ clientSecret: intent.client_secret });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= ONLY ONE START FUNCTION ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("MongoDB Connected (FINAL FIX) ✅");

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

startServer();