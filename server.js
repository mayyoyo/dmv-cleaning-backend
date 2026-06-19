require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= ✅ TEST ROUTE (IMPORTANT) ================= */
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API working" });
});

/* ================= DATABASE (RENDER SAFE PATH) ================= */
const db = new sqlite3.Database(
  path.join(__dirname, "bookings.db")
);

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

/* ================= STRIPE DEPOSIT CHECKOUT ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
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

    res.json({ url: session.url, deposit });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

/* ================= SAVE BOOKING ================= */
app.post("/api/book", (req, res) => {
  const {
    name,
    email,
    phone,
    address,
    service,
    date,
    timeSlot,
    paymentType,
    price,
    deposit,
    stripeCustomerId,
    paymentMethodId
  } = req.body;

  db.run(
    `INSERT INTO bookings (
      name,email,phone,address,service,
      price,deposit,date,timeSlot,
      paymentType,stripeCustomerId,paymentMethodId
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      name,
      email,
      phone,
      address,
      service,
      price,
      deposit,
      date,
      timeSlot,
      paymentType,
      stripeCustomerId || null,
      paymentMethodId || null
    ],
    function (err) {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      res.json({
        success: true,
        bookingId: this.lastID
      });
    }
  );
});

/* ================= AUTO CHARGE REMAINING ================= */
app.post("/api/charge-remaining/:id", (req, res) => {
  db.get(
    "SELECT * FROM bookings WHERE id=?",
    [req.params.id],
    async (err, row) => {
      if (!row) return res.json({ success: false });

      try {
        const remaining = row.price - row.deposit;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(remaining * 100),
          currency: "usd",
          customer: row.stripeCustomerId,
          payment_method: row.paymentMethodId,
          off_session: true,
          confirm: true
        });

        db.run(
          "UPDATE bookings SET paymentStatus='completed' WHERE id=?",
          [req.params.id]
        );

        res.json({ success: true, paymentIntent });

      } catch (err) {
        res.json({ success: false, error: err.message });
      }
    }
  );
});

/* ================= ADMIN REVENUE ================= */
app.get("/api/admin/revenue", (req, res) => {
  db.all("SELECT * FROM bookings", [], (err, rows) => {
    let total = 0, deposit = 0, remaining = 0;

    rows.forEach(b => {
      total += b.price || 0;
      deposit += b.deposit || 0;
      remaining += (b.price - b.deposit) || 0;
    });

    res.json({
      totalRevenue: total,
      depositCollected: deposit,
      remainingDue: remaining
    });
  });
});

/* ================= ADMIN BOOKINGS ================= */
app.get("/api/admin/bookings", (req, res) => {
  db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
    res.json(rows);
  });
});

/* ================= DELETE BOOKING ================= */
app.delete("/api/admin/bookings/:id", (req, res) => {
  db.run("DELETE FROM bookings WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

/* ================= COMPLETE BOOKING ================= */
app.put("/api/admin/bookings/:id/complete", (req, res) => {
  db.run(
    "UPDATE bookings SET paymentStatus='completed' WHERE id=?",
    [req.params.id]
  );
  res.json({ success: true });
});

/* ================= INVOICE PDF ================= */
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

app.listen(PORT, () => {
  console.log("🔥 Server running on", PORT);
});