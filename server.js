require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

/* ================= SAFE BASE URL ================= */
const BASE_URL =
  process.env.BASE_URL || "https://dmv-cleaning-backend.onrender.com";

/* ================= INIT ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/* ================= EMAIL SAFE ================= */
let sendEmail = async () => {};
try {
  const email = require("./email");
  sendEmail = email.sendEmail;
} catch {
  console.log("⚠️ Email disabled");
}

/* ================= MONGOOSE ================= */
mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

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

/* ================= WEBHOOK ================= */
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
      console.error("Webhook Error:", err.message);
      return res.status(400).send("Webhook Error");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {
        const booking = await Booking.findByIdAndUpdate(
          bookingId,
          { paymentStatus: "PAID" },
          { new: true }
        );

        if (booking) {
          io.emit("payment-updated", booking);

          // ✅ EMAIL AFTER PAYMENT
          sendEmail(booking, "paid").catch(console.error);
        }
      }
    }

    res.json({ received: true });
  }
);

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= SOCKET ================= */
io.on("connection", async (socket) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  socket.emit("init-bookings", bookings);
});

/* ================= BOOKINGS ================= */
app.get("/api/bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ✅ PUBLIC BOOKINGS (SUCCESS PAGE FIX) */
app.get("/api/public-bookings", async (req, res) => {
  const data = await Booking.find().sort({ createdAt: -1 });
  res.json(data);
});

/* ================= CREATE BOOKING ================= */
app.post("/api/book", async (req, res) => {
  try {
    const booking = await Booking.create({
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

    io.emit("new-booking", booking);
    io.emit("update-slots"); // ✅ calendar sync

    // ✅ EMAIL AFTER BOOKING
    if (booking.email) {
      sendEmail(booking, "created").catch(console.error);
    }

    res.json({
      success: true,
      bookingId: booking._id
    });

  } catch (err) {
    console.error("BOOK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= STRIPE ================= */
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

      // ✅ FINAL FIXED URLS
      success_url: `${BASE_URL}/success.html?bookingId=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/booking.html`,

      metadata: { bookingId }
    });

    await Booking.findByIdAndUpdate(bookingId, {
      stripeSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("Stripe Error:", err);
    res.status(500).json({ error: "Stripe error" });
  }
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).send("Not found");

  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("Invoice", { align: "center" });
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Total: $${booking.total}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= FALLBACK ================= */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= START ================= */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected ✅");

    const PORT = process.env.PORT || 10000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on", PORT);
    });

  } catch (err) {
    console.error("DB ERROR:", err.message);
    process.exit(1);
  }
}

startServer();