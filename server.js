
console.log("🚀 THIS IS THE NEW SERVER FILE RUNNING");

require("dotenv").config();

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ================== CORS (SAFE + FIXED) ==================
const allowedOrigins = [
  "https://mydmvcleaningservice.com",
  "https://www.mydmvcleaningservice.com",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ================== TEST ==================
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

// ================== LOGIN ==================
app.post("/api/admin/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS || !process.env.JWT_SECRET) {
      console.error("❌ Missing ENV");
      return res.status(500).json({ error: "Server config error" });
    }

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

    return res.status(401).json({ error: "Invalid credentials" });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Server error ❌" });
  }
});

// ================== AUTH ==================
function auth(req, res, next) {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    jwt.verify(token, process.env.JWT_SECRET);
    next();

  } catch (err) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ================== DASHBOARD ==================
app.get("/api/dashboard", auth, (req, res) => {
  res.json({
    totalBookings: 25,
    totalCustomers: 18,
    totalProfit: 3200
  });
});

// ================== LOGOUT ==================
app.get("/api/admin/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });

  res.json({ success: true });
});

// ================== STATIC ==================
app.use(express.static(path.join(__dirname, "public")));

// ================== START ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});
```
