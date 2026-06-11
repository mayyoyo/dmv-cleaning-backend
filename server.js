const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { Resend } = require("resend");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
require("dotenv").config();

/* ================= APP ================= */
const app = express();
const server = http.createServer(app);

/* ================= SOCKET ================= */
const io = new Server(server, {
cors: {
origin: "*",
methods: ["GET", "POST"]
}
});

/* ================= ENV ================= */
const resend = process.env.RESEND_API_KEY
? new Resend(process.env.RESEND_API_KEY)
: null;

const stripe = process.env.STRIPE_SECRET_KEY
? new Stripe(process.env.STRIPE_SECRET_KEY)
: null;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
res.send("DMV Cleaning Backend Running ✅");
});

/* ================= MEMORY DB ================= */
let bookings = [];

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
console.log("User connected");
socket.emit("init-bookings", bookings);

socket.on("disconnect", () => {
console.log("User disconnected");
});
});

/* ================= GET BOOKINGS ================= */
app.get("/api/public-bookings", (req, res) => {
res.json(bookings);
});

/* ================= BOOK ================= */
app.post("/api/book", async (req, res) => {
try {
const { name, email, phone, address, date, timeSlot, service } = req.body;

```
if (!name || !email || !date || !timeSlot || !service) {
  return res.status(400).json({ error: "Missing fields" });
}

const exists = bookings.find(
  b => b.date === date && b.timeSlot === timeSlot
);

if (exists) {
  return res.status(409).json({ error: "Slot already booked" });
}

const prices = {
  "Home Cleaning": 120,
  "Deep Cleaning": 200,
  "Office Cleaning": 150,
  "Move In/Out Cleaning": 180
};

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
  total,
  status: "UNPAID"
};

bookings.unshift(booking);

io.emit("update-slots", bookings);

/* EMAIL */
if (resend) {
  try {
    await resend.emails.send({
      from: "DMV Cleaning <onboarding@resend.dev>",
      to: email,
      subject: "Booking Confirmed ✔",
      html: `
        <h2>Booking Confirmed</h2>
        <p>Name: ${name}</p>
        <p>Service: ${service}</p>
        <p>Date: ${date}</p>
        <p>Time: ${timeSlot}</p>
        <p>Total: $${total}</p>
      `
    });
  } catch (e) {
    console.log("Email error:", e.message);
  }
}

res.json({
  success: true,
  bookingId: booking.id,
  total
});
```

} catch (err) {
console.error(err);
res.status(500).json({ error: "Server error" });
}
});

/* ================= STRIPE ================= */
app.post("/api/create-setup-intent", async (req, res) => {
if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

const intent = await stripe.setupIntents.create({
payment_method_types: ["card"]
});

res.json({ clientSecret: intent.client_secret });
});

app.post("/api/charge-customer", async (req, res) => {
try {
if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

```
const { paymentMethodId, amount, email, bookingId } = req.body;

await stripe.paymentIntents.create({
  amount: amount * 100,
  currency: "usd",
  payment_method: paymentMethodId,
  confirm: true,
  receipt_email: email
});

const booking = bookings.find(b => b.id == bookingId);
if (booking) booking.status = "PAID";

io.emit("update-slots", bookings);

res.json({ success: true });
```

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", (req, res) => {
const booking = bookings.find(b => b.id == req.params.id);
if (!booking) return res.status(404).send("Not found");

const doc = new PDFDocument();
res.setHeader("Content-Type", "application/pdf");
doc.pipe(res);

doc.text("INVOICE");
doc.text(`Name: ${booking.name}`);
doc.text(`Service: ${booking.service}`);
doc.text(`Date: ${booking.date}`);
doc.text(`Total: $${booking.total}`);
doc.text(`Status: ${booking.status}`);

doc.end();
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
console.log("Server running on port " + PORT);
});
