require("dotenv").config();

console.log("ENV CHECK:", process.env.MONGO_URI);

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

/* ================= FIX (IMPORTANT) ================= */
mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

/* ================= EMAIL ================= */
let sendEmail = () => Promise.resolve();
try {
  const email = require("./email");
  sendEmail = email.sendEmail || sendEmail;
} catch (e) {
  console.log("⚠️ email.js not found — email disabled");
}

/* ================= INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= STRIPE WEBHOOK ================= */
app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe) return res.sendStatus(200);

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const bookingId = session.metadata.bookingId;

      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        { paymentStatus: "PAID" },
        { new: true }
      );

      if (booking) {
        io.emit("payment-updated", booking);
        sendEmail(booking, "paid").catch(console.error);
      }
    }

    res.json({ received: true });
  }
);

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ADMIN STATIC (FIXED) ================= */
app.use("/admin", express.static(path.join(__dirname, "public/admin")));

/* ================= PUBLIC STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

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
    paymentType: String,
    paymentStatus: { type: String, default: "PENDING" },
    stripeSessionId: String,
    createdAt: { type: Date, default: Date.now }
  })
);

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= API ================= */
app.get("/api/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post("/api/book", async (req, res) => {
  try {
    const newBooking = await Booking.create({
      name: req.body.name || "N/A",
      email: req.body.email || "N/A",
      phone: req.body.phone || "N/A",
      address: req.body.address || "N/A",
      date: req.body.date || "",
      timeSlot: req.body.timeSlot || "",
      service: req.body.service || "",
      total: req.body.total || 0,
      paymentType: req.body.paymentType || "online",
      paymentStatus: "PENDING"
    });

    io.emit("new-booking", newBooking);

    res.json({
      success: true,
      bookingId: newBooking._id
    });

  } catch (err) {
    console.error("❌ BOOKING ERROR:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= START SERVER ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected ✅");

    const PORT = process.env.PORT || 10000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  } catch (err) {
    console.error("❌ MongoDB FAILED:", err.message);
    process.exit(1);
  }
}

startServer();