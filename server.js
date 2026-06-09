require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= ROUTES ================= */
const bookingRoutes = require("./routes/booking.routes");
app.use("/api", bookingRoutes);

/* ================= HEALTH CHECK ================= */
app.get("/api", (req, res) => {
  res.json({ message: "API Working" });
});

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});