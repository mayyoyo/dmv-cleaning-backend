require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= DATABASE ================= */
const db = new sqlite3.Database("./database.db");

db.run(`CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  service TEXT,
  date TEXT,
  timeSlot TEXT,
  price INTEGER,
  deposit INTEGER,
  paid INTEGER DEFAULT 0
)`);

/* ================= EMAIL SETUP ================= */
const transporter = nodemailer.createTransport({
service: "gmail",
auth: {
user: process.env.EMAIL_USER,
pass: process.env.EMAIL_PASS
}
});

function sendEmail(to, subject, text) {
return transporter.sendMail({
from: process.env.EMAIL_USER,
to,
subject,
text
});
}

/* ================= ROOT ================= */
app.get("/", (req, res) => res.send("LIVE"));

/* ================= PREVENT DOUBLE BOOKING ================= */
function checkAvailability(date, timeSlot) {
return new Promise((resolve) => {
db.get(
`SELECT * FROM bookings WHERE date=? AND timeSlot=?`,
[date, timeSlot],
(err, row) => {
resolve(!row);
}
);
});
}

/* ================= STRIPE ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
try {
const { service, email, price, date, timeSlot } = req.body;

```
const available = await checkAvailability(date, timeSlot);
if (!available) {
  return res.status(400).json({ error: "Time slot already booked" });
}

const deposit = Math.round(price * 0.25 * 100);

const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  mode: "payment",
  customer_email: email,

  line_items: [{
    price_data: {
      currency: "usd",
      product_data: { name: `${service} Deposit` },
      unit_amount: deposit
    },
    quantity: 1
  }],

  success_url: "https://yourdomain.com/success.html?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://yourdomain.com/booking.html"
});

res.json({ url: session.url });
```

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ================= SAVE BOOKING ================= */
app.post("/api/book", async (req, res) => {
const {
name, email, phone, address,
service, date, timeSlot, price
} = req.body;

const available = await checkAvailability(date, timeSlot);
if (!available) {
return res.json({ success: false, message: "Slot taken" });
}

const id = uuidv4();
const deposit = Math.round(price * 0.25);

db.run(`     INSERT INTO bookings 
    (id,name,email,phone,address,service,date,timeSlot,price,deposit,paid)
    VALUES (?,?,?,?,?,?,?,?,?,?,0)
  `, [id,name,email,phone,address,service,date,timeSlot,price,deposit]);

/* SEND EMAIL */
await sendEmail(email,
"Booking Confirmed",
`Your booking is confirmed!
Service: ${service}
Date: ${date}
Time: ${timeSlot}
Deposit: $${deposit}`
);

res.json({ success: true, bookingId: id });
});

/* ================= STRIPE SUCCESS (SAVE PAYMENT) ================= */
app.get("/api/verify-payment", async (req, res) => {
const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

if (session.payment_status === "paid") {

```
await sendEmail(
  session.customer_email,
  "Payment Received",
  "Your deposit payment was successful ✅"
);
```

}

res.json({ success: true });
});

/* ================= ADMIN ================= */
app.get("/api/admin/bookings", (req, res) => {
db.all("SELECT * FROM bookings", [], (err, rows) => {
res.json(rows);
});
});

app.get("/api/admin/revenue", (req, res) => {
db.all("SELECT * FROM bookings", [], (err, rows) => {

```
let total = 0;
let deposit = 0;

rows.forEach(r => {
  total += r.price;
  deposit += r.deposit;
});

res.json({
  totalRevenue: total,
  depositCollected: deposit,
  remaining: total - deposit
});
```

});
});

/* ================= START ================= */
app.listen(5000, "0.0.0.0", () => {
console.log("🔥 Production Server Running");
});
