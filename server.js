require("dotenv").config();

console.log("ENV CHECK:", process.env.MONGO_URI); // 🔥 DEBUG LINE

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

/* ================= MIDDLEWARE ================= */
app.use(express.json());

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */

// Home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Admin pages
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

// Test API
app.get("/api/test", (req, res) => {
  res.json({ message: "API working ✅" });
});

/* ================= DB MODEL ================= */
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

/* ================= START SERVER ================= */
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("❌ MONGO_URI is missing");
      console.log("⚠️ Starting server WITHOUT database");
    } else {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("MongoDB Connected ✅");
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on ${PORT}`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);

    // 🔥 STILL START SERVER (CRITICAL FOR RENDER)
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running WITHOUT DB on ${PORT}`);
    });
  }
}

startServer();