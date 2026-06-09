require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

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
app.use(express.static(path.join(__dirname, "public")));

/* ================= GLOBAL STORAGE ================= */
global.bookings = global.bookings || [];

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", (req, res) => {

  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { user: username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid login" });
});

/* ================= AUTH MIDDLEWARE ================= */
function verifyAdmin(req, res, next) {

  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
}

/* ================= PRICES ================= */
const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

/* ================= BOOKING (UPDATED WITH PAYMENT TYPE + TERMS) ================= */
app.post("/api/book", async (req, res) => {

  const {
    name,
    email,
    phone,
    address,
    date,
    timeSlot,
    service,
    paymentType,
    termsAccepted
  } = req.body;

  /* TERMS REQUIRED */
  if (!termsAccepted) {
    return res.status(400).json({ error: "You must accept terms" });
  }

  if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
    return res.status(400).json({ error: "All fields required" });
  }

  const exists = global.bookings.find(
    b => b.date === date && b.timeSlot === timeSlot
  );

  if (exists) return res.status(409).json({ error: "Slot already booked" });

  const total = prices[service] || 0;

  const booking = {
    id: Date.now(),
    name,
    email,
    phone,
    address,
    date,
    timeSlot,
    service,
    paymentType: paymentType || "pay_now",
    total,
    status: paymentType === "pay_later" ? "Pending Payment" : "Pending",
    createdAt: new Date().toISOString()
  };

  global.bookings.push(booking);

  io.emit("new-booking", booking);

  /* EMAIL CONFIRMATION */
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Booking Confirmed - DMV Cleaning",
    html: `
      <h2>Booking Confirmed</h2>
      <p>Service: ${service}</p>
      <p>Date: ${date}</p>
      <p>Time: ${timeSlot}</p>
      <p>Total: $${total}</p>
      <p>Payment Type: ${booking.paymentType}</p>
    `
  });

  res.json({
    success: true,
    bookingId: booking.id,
    total
  });
});

/* ================= GET BOOKINGS (ADMIN ONLY) ================= */
app.get("/api/bookings", verifyAdmin, (req, res) => {
  res.json(global.bookings);
});

/* ================= GET SINGLE BOOKING ================= */
app.get("/api/booking/:id", (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) return res.status(404).json({ error: "Not found" });

  res.json(booking);
});

/* ================= SAVE CARD ================= */
app.post("/api/save-card", async (req, res) => {

  const { bookingId } = req.body;

  const booking = global.bookings.find(b => b.id == bookingId);

  if (!booking) return res.status(404).json({ error: "Not found" });

  const customer = await stripe.customers.create({
    email: booking.email
  });

  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id
  });

  booking.stripeCustomerId = customer.id;

  res.json({
    clientSecret: setupIntent.client_secret
  });
});

/* ================= CHARGE CUSTOMER ================= */
app.post("/api/charge/:id", async (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking || !booking.stripeCustomerId) {
    return res.status(400).json({ error: "Missing payment info" });
  }

  try {

    await stripe.paymentIntents.create({
      amount: booking.total * 100,
      currency: "usd",
      customer: booking.stripeCustomerId,
      off_session: true,
      confirm: true
    });

    booking.status = "Paid";

    /* ================= PDF INVOICE ================= */
    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));

    doc.fontSize(20).text("DMV Cleaning Invoice");
    doc.moveDown();

    doc.fontSize(14).text(`Name: ${booking.name}`);
    doc.text(`Service: ${booking.service}`);
    doc.text(`Total: $${booking.total}`);
    doc.text(`Status: Paid`);

    doc.end();

    doc.on("end", async () => {

      const pdf = Buffer.concat(chunks);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: booking.email,
        subject: "Invoice - DMV Cleaning",
        html: `<h2>Payment Successful</h2>`,
        attachments: [
          {
            filename: "invoice.pdf",
            content: pdf
          }
        ]
      });
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ANALYTICS ================= */
app.get("/api/admin/analytics", verifyAdmin, (req, res) => {

  const data = {
    totalBookings: global.bookings.length,
    totalRevenue: 0,
    paid: 0,
    pending: 0,
    services: {},
    monthly: {}
  };

  global.bookings.forEach(b => {

    if (b.status === "Paid") {
      data.totalRevenue += b.total;
      data.paid++;
    } else {
      data.pending++;
    }

    data.services[b.service] =
      (data.services[b.service] || 0) + b.total;

    const month = new Date(b.createdAt).toISOString().slice(0, 7);

    data.monthly[month] =
      (data.monthly[month] || 0) + b.total;
  });

  res.json(data);
});

/* ================= AUTO REMINDER ================= */
cron.schedule("0 9 * * *", async () => {

  const unpaid = global.bookings.filter(b => b.status !== "Paid");

  for (const b of unpaid) {

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: b.email,
      subject: "Payment Reminder - DMV Cleaning",
      html: `<p>Please complete your payment.</p>`
    });
  }

  console.log("📩 Reminder sent");
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 FINAL CLEAN SYSTEM RUNNING");
});
// 
/* ================= AUTO CHARGE WHEN COMPLETED ================= */
app.post("/api/admin/complete/:id", verifyAdmin, async (req, res) => {

  const booking = global.bookings.find(b => b.id == req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (!booking.stripeCustomerId) {
    return res.status(400).json({ error: "No payment method saved" });
  }

  try {

    // 🔥 STEP 1: Mark completed first
    booking.status = "Completed";

    // 🔥 STEP 2: AUTO CHARGE STRIPE IMMEDIATELY
    const payment = await stripe.paymentIntents.create({
      amount: booking.total * 100,
      currency: "usd",
      customer: booking.stripeCustomerId,
      off_session: true,
      confirm: true
    });

    // 🔥 STEP 3: UPDATE STATUS AFTER SUCCESS
    booking.status = "Paid";

    console.log("💰 AUTO CHARGED AFTER COMPLETION:", booking.id);

    // 🔥 STEP 4: EMAIL RECEIPT
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "Payment Completed - DMV Cleaning",
      html: `
        <h2>Service Completed & Paid</h2>
        <p>Service: ${booking.service}</p>
        <p>Total: $${booking.total}</p>
        <p>Status: Paid</p>
      `
    });

    res.json({
      success: true,
      message: "Booking completed and charged"
    });

  } catch (err) {

    console.error("AUTO CHARGE ERROR:", err.message);

    // If payment fails, keep it completed but unpaid
    booking.status = "Payment Failed";

    res.status(500).json({
      error: err.message
    });
  }
});
// 