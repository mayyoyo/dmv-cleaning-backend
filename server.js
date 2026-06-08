// ================== DEBUG (VERY IMPORTANT) ==================
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

// ================== API ROUTE ==================
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

// ================== STATIC FILES ==================
app.use(express.static(path.join(__dirname, "public")));

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});