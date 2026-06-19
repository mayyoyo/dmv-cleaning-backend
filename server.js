require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("SERVER IS LIVE");
});

/* ================= API TEST ================= */
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API working" });
});

/* ================= SAFE DATABASE (RENDER FINAL FIX) ================= */
/* ⚠️ NO FILE SYSTEM — prevents Render crash */
const db = new sqlite3.Database(":memory:", (err) => {
  if (err) {
    console.error("❌ SQLITE ERROR:", err.message);
  } else {
    console.log("✅ In-memory SQLite connected (Render safe)");
  }
});

/* ================= TABLE ================= */
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

/* ================= PRICE FUNCTION ================= */
function getServicePrice(service) {
  if (!service) return 120;

  if (service.includes("120")) return 120;
  if (service.includes("150")) return 150;
  if (service.includes("200")) return 200;
  if (service.includes("250")) return 250;

  return 120;
}

/* ================= STRIPE CHECKOUT ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email } = req.body;

    const price = getServicePrice(service);
    const deposit = Math.round(price * 0.25 * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${service} Deposit (25%)`
            },
            unit_amount: deposit
          },
          quantity: 1
        }
      ],

      success_url: `${process.env.BASE_URL}/success.html?bookingId=TEMP`,
      cancel_url: `${process.env.BASE_URL}/booking.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= BOOKING ================= */
app.post("/api/book", (req, res) => {
  const data = req.body;

  db.run(
    `INSERT INTO bookings (
      name,email,phone,address,service,
      price,deposit,date,timeSlot,paymentType
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      data.name,
      data.email,
      data.phone,
      data.address,
      data.service,
      data.price,
      data.deposit,
      data.date,
      data.timeSlot,
      data.paymentType
    ],
    function (err) {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      res.json({ success: true, bookingId: this.lastID });
    }
  );
});

/* ================= ADMIN BOOKINGS ================= */
app.get("/api/admin/bookings", (req, res) => {
  db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
    res.json(rows || []);
  });
});

/* ================= REVENUE ================= */
app.get("/api/admin/revenue", (req, res) => {
  db.all("SELECT * FROM bookings", [], (err, rows) => {
    let total = 0;
    let deposit = 0;

    rows.forEach(b => {
      total += b.price || 0;
      deposit += b.deposit || 0;
    });

    res.json({
      totalRevenue: total,
      depositCollected: deposit,
      remainingDue: total - deposit
    });
  });
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", (req, res) => {
  db.get("SELECT * FROM bookings WHERE id=?", [req.params.id], (err, row) => {
    if (!row) return res.send("Not found");

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

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 Server running on port", PORT);
});

/* ================= GLOBAL ERROR HANDLERS ================= */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("PROMISE ERROR:", err);
});