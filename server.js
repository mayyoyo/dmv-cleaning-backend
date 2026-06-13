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

/* ================= EMAIL IMPORT ================= */
let sendEmail = () => Promise.resolve();

try {
  const email = require("./email");
  sendEmail = email.sendEmail || sendEmail;
} catch (e) {
  console.log("⚠️ email.js not found — email disabled");
}

/* ================= APP INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ADMIN ROUTES (IMPORTANT FIRST) ================= */
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

/* ================= STATIC FILES ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ROUTE ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= BOOKING MODEL ================= */
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

/* ================= SOCKET LIVE ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= GET BOOKINGS ================= */
app.get("/api/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ================= CREATE BOOKING ================= */
app.post("/api/book", async (req, res) => {
  try {
    console.log("📥 Incoming booking:", req.body);

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

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { service, total, bookingId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: service },
            unit_amount: Math.round(total * 100)
          },
          quantity: 1
        }
      ],
      customer_email: email,
      success_url:
        `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&bookingId=${bookingId}`,
      cancel_url: `${process.env.BASE_URL}/cancel.html`,
      metadata: { bookingId }
    });

    await Booking.findByIdAndUpdate(bookingId, {
      stripeSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.get("/api/verify-payment", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status === "paid") {
      const booking = await Booking.findByIdAndUpdate(
        req.query.bookingId,
        { paymentStatus: "PAID" },
        { new: true }
      );

      io.emit("payment-updated", booking);

      /* 🔥 EMAIL AFTER PAYMENT */
      sendEmail(booking, "paid").catch(console.error);

      return res.json({ success: true });
    }

    res.json({ success: false });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= INVOICE PDF ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).send("Booking not found");
  }

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("DMV Cleaning Services Invoice", { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= DATABASE + SERVER START (FIXED SAFE MODE) ================= */
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("MongoDB Connected ✅");

  const PORT = process.env.PORT || 10000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on", PORT);
  });
})
.catch(err => {
  console.error("MongoDB error ❌", err);

  const PORT = process.env.PORT || 10000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running WITHOUT DB (SAFE MODE)");
  });
});
// 
/* ================= UPDATE STATUS ================= */
app.put("/api/bookings/:id/status", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: req.body.status },
      { new: true }
    );

    io.emit("payment-updated", booking);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);

    io.emit("booking-deleted", req.params.id);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});