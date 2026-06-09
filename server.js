require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

/* ================= CORS (FIXED FOR PRODUCTION) ================= */
app.use(cors({
  origin: [
    "https://mydmvcleaningservice.com",
    "https://www.mydmvcleaningservice.com"
  ],
  credentials: true
}));

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */
const bookingRoutes = require("./routes/booking.routes");

// IMPORTANT: ALL API ROUTES MUST USE /api
app.use("/api", bookingRoutes);

/* ================= HEALTH CHECK ================= */
app.get("/health", (req, res) => {
  res.json({ status: "Server running ✅" });
});

/* ================= 404 HANDLER ================= */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found ❌",
    path: req.originalUrl
  });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});