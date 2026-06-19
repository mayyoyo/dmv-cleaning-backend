require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= DATABASE ================= */
const db = new sqlite3.Database("./bookings.db");

db.run(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  service TEXT,
  price REAL,
  deposit REAL,
  date TEXT,
  timeSlot TEXT,
  paymentType TEXT,
  stripeCustomerId TEXT,
  paymentMethodId TEXT,
  paymentStatus TEXT DEFAULT 'pending'
)
`);

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const BASE_URL = process.env.BASE_URL;

/* ================= PRICE ================= */
function getServicePrice(service) {
  if (!service) return 120;
  if (service.includes("150")) return 150;
  if (service.includes("200")) return 200;
  if (service.includes("250")) return 250;
  return 120;
}

/* ================= PDF GENERATOR ================= */
function createInvoicePDF(booking) {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", chunks.push.bind(chunks));

    doc.fontSize(20).text("DMV CLEANING INVOICE", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Name: ${booking.name}`);
    doc.text(`Service: ${booking.service}`);
    doc.text(`Date: ${booking.date}`);
    doc.text(`Time: ${booking.timeSlot}`);
    doc.text(`Price: $${booking.price}`);
    doc.text(`Deposit: $${booking.deposit}`);
    doc.text(`Remaining: $${booking.price - booking.deposit}`);

    doc.end();

    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/* ================= EMAIL RECEIPT ================= */
async function sendReceiptEmail(booking) {
  const pdfBuffer = await createInvoicePDF(booking);

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: booking.email,
    subject: "🧾 DMV Cleaning Receipt",
    text: "Your receipt is attached.",
    attachments: [
      {
        filename: "receipt.pdf",
        content: pdfBuffer
      }
    ]
  });
}

/* ================= STRIPE DEPOSIT (SAVE CARD) ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  const { service, email } = req.body;

  const price = getServicePrice(service);
  const deposit = Math.round(price * 0.25 * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    customer_creation: "always",

    payment_intent_data: {
      setup_future_usage: "off_session"
    },

    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: service + " Deposit" },
        unit_amount: deposit
      },
      quantity: 1
    }],

    success_url: `${BASE_URL}/success.html`,
    cancel_url: `${BASE_URL}/booking.html`
  });

  res.json({ url: session.url });
});

/* ================= SAVE BOOKING ================= */
app.post("/api/book", (req, res) => {

  const b = req.body;
  const price = getServicePrice(b.service);
  const deposit = Math.round(price * 0.25);

  db.run(`
    INSERT INTO bookings (
      name,email,phone,address,service,price,deposit,
      date,timeSlot,paymentType,stripeCustomerId,paymentMethodId
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `,
  [
    b.name, b.email, b.phone, b.address, b.service,
    price, deposit,
    b.date, b.timeSlot, b.paymentType,
    b.stripeCustomerId || null,
    b.paymentMethodId || null
  ],
  async function (err) {
    if (err) return res.json({ success: false });

    await sendReceiptEmail({ ...b, price, deposit });

    res.json({
      success: true,
      bookingId: this.lastID,
      deposit,
      remaining: price - deposit
    });
  });
});

/* ================= AUTO CHARGE REMAINING ================= */
app.post("/api/charge-remaining/:id", (req, res) => {

  db.get("SELECT * FROM bookings WHERE id=?", [req.params.id], async (err, row) => {

    if (!row) return res.json({ success: false });

    try {
      const remaining = Math.round((row.price - row.deposit) * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: remaining,
        currency: "usd",
        customer: row.stripeCustomerId,
        payment_method: row.paymentMethodId,
        off_session: true,
        confirm: true
      });

      db.run("UPDATE bookings SET paymentStatus='completed' WHERE id=?", [req.params.id]);

      res.json({ success: true, paymentIntent });

    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });
});

/* ================= REVENUE API ================= */
app.get("/api/admin/revenue", (req, res) => {

  db.all("SELECT * FROM bookings", [], (err, rows) => {

    let total = 0;
    let deposit = 0;
    let remaining = 0;

    rows.forEach(b => {
      total += b.price || 0;
      deposit += b.deposit || 0;
      remaining += (b.price - b.deposit) || 0;
    });

    res.json({ total, deposit, remaining });
  });
});

/* ================= BOOKINGS ================= */
app.get("/api/admin/bookings", (req, res) => {
  db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
    res.json(rows);
  });
});

/* ================= DELETE ================= */
app.delete("/api/admin/bookings/:id", (req, res) => {
  db.run("DELETE FROM bookings WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

/* ================= COMPLETE ================= */
app.put("/api/admin/bookings/:id/complete", (req, res) => {
  db.run("UPDATE bookings SET paymentStatus='completed' WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

/* ================= INVOICE PDF ================= */
app.get("/api/invoice/:id", (req, res) => {

  db.get("SELECT * FROM bookings WHERE id=?", [req.params.id], (err, row) => {

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

    doc.pipe(res);

    doc.fontSize(20).text("DMV CLEANING INVOICE", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Name: ${row.name}`);
    doc.text(`Service: ${row.service}`);
    doc.text(`Price: $${row.price}`);
    doc.text(`Deposit: $${row.deposit}`);
    doc.text(`Remaining: $${row.price - row.deposit}`);
    doc.text(`Status: ${row.paymentStatus}`);

    doc.end();
  });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on " + PORT));