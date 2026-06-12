require("dotenv").config(); // ✅ LOAD ENV FIRST

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

// ❗ Prevent crash if MONGO_URI missing
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is missing in environment variables");
  process.exit(1);
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // ✅ serves admin + frontend

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

/* ================= ADMIN ================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";
const JWT_SECRET = process.env.JWT_SECRET || "dmv_secret";

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

/* ================= SAFE DB CHECK ================= */
function ensureDB(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database not ready" });
  }
  next();
}

/* ================= BOOKING ================= */
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
      return res.status(400).json({ error: "Missing fields" });
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

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { service, total, customer } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: service },
            unit_amount: Math.round(total * 100)
          },
          quantity: 1
        }
      ],
      customer_email: customer.email,
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/cancel.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
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

/* ================= START SERVER ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected ✅");

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });
  })
  .catch(err => {
    console.error("MongoDB error ❌", err);
  });