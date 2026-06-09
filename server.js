require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "https://mydmvcleaningservice.com",
    "https://www.mydmvcleaningservice.com"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */
const bookingRoutes = require("./routes/booking.routes");
app.use("/api", bookingRoutes);

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ status: "Server running ✅" });
});

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found ❌",
    path: req.originalUrl
  });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});