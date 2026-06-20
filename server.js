require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= WEBHOOK SECRET ================= */
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/* ================= MIDDLEWARE ================= */
app.use("/api/webhook", express.raw({ type: "application/json" }));
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("SERVER IS LIVE");
});

/* ================= MEMORY DB ================= */
let bookings = [];
let idCounter = 1;

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendReceiptEmail(booking) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: booking.email,
      subject: "Booking Confirmation - DMV Cleaning",
      html: `
        <h2>Booking Confirmed ✅</h2>
        <p><b>Name:</b> ${booking.name}</p>
        <p><b>Service:</b> ${booking.service}</p>
        <p><b>Date:</b> ${booking.date}</p>
        <p><b>Time:</b> ${booking.timeSlot}</p>
        <p><b>Status:</b> ${booking.status}</p>
      `
    });
  } catch (err) {
    console.log("EMAIL ERROR:", err.message);
  }
}

/* ================= PRICE ================= */
function getServicePrice(service) {
  if (!service) return 120;
  if (service.includes("$120")) return 120;
  if (service.includes("$150")) return 150;
  if (service.includes("$200")) return 200;
  if (service.includes("$250")) return 250;
  return 120;
}

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", (req, res) => {
  res.json(bookings);
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/book/:id", (req, res) => {
  bookings = bookings.filter(b => b.id != req.params.id);
  res.json({ success: true });
});

/* ================= UPDATE BOOKING ================= */
app.put("/api/book/:id", (req, res) => {
  const i = bookings.findIndex(b => b.id == req.params.id);

  if (i !== -1) {
    bookings[i] = { ...bookings[i], ...req.body };
  }

  res.json({ success: true });
});

/* ================= SAVE CARD (SETUP INTENT) ================= */
app.post("/api/create-setup-intent", async (req, res) => {
  try {
    const { email } = req.body;

    const customer = await stripe.customers.create({ email });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"]
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= DEPOSIT CHECKOUT ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email, price, date, timeSlot, name, phone } = req.body;

    const basePrice = price || 120;
    const deposit = Math.round(basePrice * 0.20 * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,

      metadata: {
        service,
        date,
        timeSlot,
        name: name || "",
        phone: phone || "",
        type: "deposit"
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${service} - 20% Deposit`
            },
            unit_amount: deposit
          },
          quantity: 1
        }
      ],

      success_url: `${process.env.BASE_URL}/success.html`,
      cancel_url: `${process.env.BASE_URL}/booking.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= WEBHOOK ================= */
app.post("/api/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      endpointSecret
    );
  } catch (err) {
    return res.status(400).send(err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const booking = {
      id: idCounter++,
      email: session.customer_email,
      service: session.metadata.service,
      date: session.metadata.date,
      timeSlot: session.metadata.timeSlot,
      name: session.metadata.name,
      phone: session.metadata.phone,
      price: session.amount_total / 100,
      status: "deposit_paid"
    };

    bookings.push(booking);

    console.log("PAYMENT SAVED:", booking);
  }

  res.json({ received: true });
});

/* ================= COMPLETE JOB + AUTO CHARGE ================= */
app.post("/api/complete-job", async (req, res) => {
  try {
    const { bookingId, customerId, remainingAmount } = req.body;

    const booking = bookings.find(b => b.id == bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    booking.status = "completed";

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card"
    });

    if (!paymentMethods.data.length) {
      return res.json({
        success: true,
        message: "No saved card found"
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: remainingAmount * 100,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethods.data[0].id,
      off_session: true,
      confirm: true
    });

    booking.remainingCharged = true;

    res.json({
      success: true,
      message: "Job completed + charged",
      paymentIntent
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ADMIN DASHBOARD ================= */
app.get("/api/admin/dashboard", (req, res) => {
  const total = bookings.reduce((s, b) => s + (b.price || 0), 0);
  const deposit = bookings.reduce((s, b) => s + (b.deposit || 0), 0);

  res.json({
    totalBookings: bookings.length,
    totalRevenue: total,
    depositCollected: deposit,
    remaining: total - deposit,
    bookings
  });
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", (req, res) => {
  const booking = bookings.find(b => b.id == req.params.id);

  if (!booking) return res.send("Not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("DMV CLEANING INVOICE", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Price: $${booking.price}`);
  doc.text(`Status: ${booking.status}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 Server running on port", PORT);
});