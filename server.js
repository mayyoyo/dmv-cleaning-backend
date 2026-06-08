require("dotenv").config();

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ================== CORS (IONOS + RENDER FIX) ==================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(200);

  next();
});

// ================== STATIC FILES ==================
app.use(express.static(path.join(__dirname, "public")));

// ================== STRIPE WEBHOOK ==================
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      console.log("Payment:", event.data.object.id);
    }

    res.json({ received: true });

  } catch (err) {
    console.log(err.message);
    res.status(400).send("Webhook error");
  }
});

// ================== AUTH ==================
function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.user = decoded;
    next();

  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ================== LOGIN ==================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { user: username, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // ✅ FINAL COOKIE FIX (IMPORTANT)
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    });

    return res.json({ success: true });
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// ================== LOGOUT ==================
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });

  res.json({ success: true });
});

// ================== DASHBOARD API ==================
app.get("/api/dashboard", auth, (req, res) => {
  res.json({
    totalBookings: 25,
    totalCustomers: 18,
    totalProfit: 1250,
    depositRevenue: 600
  });
});

// ================== PROTECTED PAGE ==================
app.get("/dashboard", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});