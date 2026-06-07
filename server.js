```javascript
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

// ⚠️ IMPORTANT: allow cross-domain (IONOS → Render)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ================== STRIPE WEBHOOK ==================
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("✅ Payment received:", session.id);
    }

    res.json({ received: true });

  } catch (err) {
    console.log("❌ Webhook error:", err.message);
    res.status(400).send(err.message);
  }
});

// ================== AUTH MIDDLEWARE ==================
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

// ================== ADMIN LOGIN ==================
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

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,          // REQUIRED on Render (HTTPS)
      sameSite: "none"       // REQUIRED for cross-domain (IONOS)
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

// ================== EMAIL SETUP ==================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================== FORGOT PASSWORD ==================
app.post("/api/admin/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const token = jwt.sign(
      { email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const resetLink = `${process.env.FRONTEND_URL}/admin/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      html: `
        <h2>Reset Password</h2>
        <p>Click below:</p>
        <a href="${resetLink}">Reset Password</a>
      `
    });

    res.json({ message: "Reset email sent" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Email failed" });
  }
});

// ================== RESET PASSWORD ==================
app.post("/api/admin/reset-password", (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.email === process.env.ADMIN_EMAIL) {
      process.env.ADMIN_PASS = newPassword;
      return res.json({ message: "Password updated" });
    }

    res.status(400).json({ error: "Invalid token" });

  } catch {
    res.status(400).json({ error: "Expired token" });
  }
});

// ================== TEST API ==================
app.get("/api", (req, res) => {
  res.send("✅ API Working");
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
```
