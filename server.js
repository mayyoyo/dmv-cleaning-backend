// ================== DEBUG ==================
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

// ================== TEST API ==================
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

// ================== LOGIN ROUTE ==================
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

// ================== AUTH MIDDLEWARE ==================
function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ================== DASHBOARD (PROTECTED) ==================
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

// ================== STATIC FILES ==================
app.use(express.static(path.join(__dirname, "public")));

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});