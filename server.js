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

/* ================= MODEL ================= */
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
    default: "pending"
  },

  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

/* ================= MIDDLEWARE ================= */
app.use("/api/webhook", express.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(booking) {
  try {
    await transporter.sendMail({
      from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "Booking Confirmation",
      html: `
        <h2>Booking Confirmed</h2>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Total:</b> $${booking.price}</p>
        <p><b>Status:</b> ${booking.paymentStatus}</p>
      `
    });
  } catch (err) {
    console.log("Email error:", err.message);
  }
}

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("SERVER LIVE");
});

/* ================= BLOCKED SLOTS ================= */
app.get("/api/blocked-slots", async (req, res) => {
  const { date } = req.query;
  const booked = await Booking.find({ date });
  res.json(booked.map(b => b.timeSlot));
});

/* ================= BOOKED SLOTS ================= */
app.get("/api/booked-slots", async (req, res) => {
  const bookings = await Booking.find();
  res.json(bookings);
});

/* ================= DEPOSIT CHECKOUT ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { name, email, phone, service, date, timeSlot, price } = req.body;

    const exists = await Booking.findOne({ date, timeSlot });
    if (exists) {
      return res.json({ success: false, message: "Slot already booked" });
    }

    const deposit = price * 0.2;
    const remaining = price - deposit;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,

      metadata: {
        type: "deposit",
        name,
        phone,
        service,
        date,
        timeSlot,
        price,
        deposit,
        remaining
      },

      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${service} Deposit`
          },
          unit_amount: Math.round(deposit * 100)
        },
        quantity: 1
      }],

      success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/booking.html`
    });

    res.json({ success: true, url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
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

    await sendEmail(booking);

    res.json({ success: true, bookingId: booking._id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= PAY REMAINING ================= */
app.post("/api/pay-remaining", async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.json({ success: false });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.email,

      metadata: {
        type: "remaining",
        bookingId: booking._id.toString()
      },

      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `Remaining Balance - ${booking.service}`
          },
          unit_amount: Math.round(booking.remaining * 100)
        },
        quantity: 1
      }],

      success_url: `${process.env.BASE_URL}/success.html`,
      cancel_url: `${process.env.BASE_URL}/success.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= WEBHOOK ================= */
app.post("/api/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    /* DEPOSIT */
    if (session.metadata?.type === "deposit") {

      const exists = await Booking.findOne({
        stripeSessionId: session.id
      });

      if (!exists) {
        const booking = await Booking.create({
          stripeSessionId: session.id,

          name: session.metadata.name,
          email: session.customer_email,
          phone: session.metadata.phone,

          service: session.metadata.service,
          date: session.metadata.date,
          timeSlot: session.metadata.timeSlot,

          price: Number(session.metadata.price),
          deposit: Number(session.metadata.deposit),
          remaining: Number(session.metadata.remaining),

          paymentStatus: "deposit_paid"
        });

        await sendEmail(booking);
      }
    }

    /* REMAINING */
    if (session.metadata?.type === "remaining") {
      const booking = await Booking.findById(session.metadata.bookingId);

      if (booking) {
        booking.remaining = 0;
        booking.paymentStatus = "fully_paid";
        await booking.save();

        await sendEmail(booking);
      }
    }
  }

  res.json({ received: true });
});

/* ================= ADMIN DASHBOARD ================= */
app.get("/api/admin/dashboard", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });

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
  doc.pipe(res);

  doc.fontSize(20).text("DMV CLEANING INVOICE", { align: "center" });
  doc.moveDown();

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Date: ${booking.date}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Total: $${booking.price}`);
  doc.text(`Deposit: $${booking.deposit}`);
  doc.text(`Remaining: $${booking.remaining}`);
  doc.text(`Status: ${booking.paymentStatus}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});