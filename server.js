require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));

/* ================= MONGODB MODEL ================= */
const bookingSchema = new mongoose.Schema({
  stripeSessionId: String,

  name: String,
  email: String,
  phone: String,
  address: String,

  service: String,
  date: String,
  timeSlot: String,

  price: Number,

  deposit: Number,
  remaining: Number,

  paymentStatus: {
    type: String,
    default: "pending" // pending | deposit_paid | fully_paid | pay_later
  },

  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

/* ================= WEBHOOK SECRET ================= */
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/* ================= MIDDLEWARE ================= */
app.use("/api/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("SERVER IS LIVE");
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", async (req, res) => {
  const bookings = await Booking.find();
  res.json(bookings);
});

/* ================= BLOCKED SLOTS ================= */
app.get("/api/blocked-slots", async (req, res) => {
  const { date } = req.query;
  const booked = await Booking.find({ date });
  res.json(booked.map(b => b.timeSlot));
});

/* ================= STRIPE DEPOSIT (20%) ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email, price, date, timeSlot, name, phone } = req.body;

    const basePrice = price || 120;

    const depositAmount = Math.round(basePrice * 0.20 * 100);
    const remainingAmount = basePrice - basePrice * 0.20;

    const baseUrl = process.env.BASE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      metadata: {
        service,
        date,
        timeSlot,
        name,
        phone,
        price: basePrice,
        deposit: basePrice * 0.20,
        remaining: remainingAmount
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${service} (20% Deposit)`
            },
            unit_amount: depositAmount
          },
          quantity: 1
        }
      ],

      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/booking.html`
    });

    res.json({ success: true, url: session.url });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= PAY LATER ================= */
app.post("/api/book-pay-later", async (req, res) => {
  try {
    const { name, email, phone, address, service, date, timeSlot, price } = req.body;

    const exists = await Booking.findOne({ date, timeSlot });
    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
    }

    const booking = await Booking.create({
      stripeSessionId: "PAY_LATER_" + Date.now(),
      name,
      email,
      phone,
      address,
      service,
      date,
      timeSlot,
      price,
      deposit: 0,
      remaining: price,
      paymentStatus: "pay_later"
    });

    res.json({
      success: true,
      bookingId: booking._id,
      sessionId: booking.stripeSessionId
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= PAY REMAINING BALANCE ================= */
app.post("/api/pay-remaining", async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.json({ success: false, message: "Not found" });
    }

    const remainingAmount = Math.round(booking.remaining * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: booking.email,

      metadata: {
        type: "remaining_balance",
        bookingId: booking._id.toString()
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Remaining Balance - ${booking.service}`
            },
            unit_amount: remainingAmount
          },
          quantity: 1
        }
      ],

      success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/success.html`
    });

    res.json({ success: true, url: session.url });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= STRIPE WEBHOOK ================= */
app.post("/api/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    /* ================= DEPOSIT PAYMENT ================= */
    if (!session.metadata?.type) {
      const exists = await Booking.findOne({
        stripeSessionId: session.id
      });

      if (!exists) {
        await Booking.create({
          stripeSessionId: session.id,

          name: session.metadata?.name || "",
          email: session.customer_email || "",
          phone: session.metadata?.phone || "",
          service: session.metadata?.service || "",
          date: session.metadata?.date || "",
          timeSlot: session.metadata?.timeSlot || "",

          price: session.metadata?.price || 0,
          deposit: session.metadata?.deposit || 0,
          remaining: session.metadata?.remaining || 0,

          paymentStatus: "deposit_paid"
        });
      }
    }

    /* ================= REMAINING PAYMENT ================= */
    if (session.metadata?.type === "remaining_balance") {
      const bookingId = session.metadata.bookingId;

      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: "fully_paid",
        remaining: 0
      });
    }
  }

  res.json({ received: true });
});

/* ================= ADMIN DASHBOARD ================= */
app.get("/api/admin/dashboard", async (req, res) => {
  const bookings = await Booking.find();

  const totalDepositRevenue = bookings.reduce(
    (sum, b) => sum + (b.deposit || 0), 0
  );

  const totalPendingBalance = bookings.reduce(
    (sum, b) => sum + (b.remaining || 0), 0
  );

  res.json({
    totalBookings: bookings.length,
    totalDepositRevenue,
    totalPendingBalance,
    bookings
  });
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("DMV CLEANING INVOICE", { align: "center" });
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Total Price: $${booking.price}`);
  doc.text(`Deposit Paid: $${booking.deposit}`);
  doc.text(`Remaining: $${booking.remaining}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});