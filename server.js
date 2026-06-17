require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Stripe = require("stripe");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");

/* ================= BASE ================= */
const BASE_URL =
process.env.BASE_URL || "https://dmv-cleaning-backend.onrender.com";

const MAX_PER_SLOT = 3;

/* ================= APP ================= */
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= STRIPE ================= */
const stripe = process.env.STRIPE_SECRET_KEY
? new Stripe(process.env.STRIPE_SECRET_KEY)
: null;

/* ================= DEBUG ENV ================= */
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "Loaded ✅" : "Missing ❌");

/* ================= EMAIL TRANSPORT ================= */
const transporter = nodemailer.createTransport({
service: "gmail",
auth: {
user: process.env.EMAIL_USER,
pass: process.env.EMAIL_PASS, // MUST be Gmail App Password
},
});

/* VERIFY EMAIL */
transporter.verify((err) => {
if (err) console.error("❌ EMAIL ERROR:", err.message);
else console.log("✅ EMAIL READY");
});

/* ================= RETRY FUNCTION ================= */
async function sendEmailWithRetry(mailOptions, retries = 3) {
try {
const info = await transporter.sendMail(mailOptions);
console.log("✅ Email sent:", info.response);
return true;
} catch (error) {
console.error("❌ Email error:", error.message);

```
if (retries > 0) {
  console.log(`🔁 Retrying... (${retries})`);
  await new Promise((res) => setTimeout(res, 3000));
  return sendEmailWithRetry(mailOptions, retries - 1);
} else {
  console.error("🚨 Failed after retries");
  return false;
}
```

}
}

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* ================= HOME ================= */
app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ================= TEST EMAIL ================= */
app.get("/test-email", async (req, res) => {
try {
await sendEmailWithRetry({
from: process.env.EMAIL_USER,
to: process.env.EMAIL_USER,
subject: "✅ Test Email Working",
text: "Your email system is working!",
});

```
res.send("✅ Email sent");
```

} catch (err) {
res.send("❌ Email failed");
}
});

/* ================= ADMIN ================= */
app.post("/admin-login", (req, res) => {
const { username, password } = req.body || {};

if (username === "admin" && password === "1234") {
return res.json({ success: true, token: "demo-token" });
}

return res.status(401).json({
success: false,
error: "Invalid credentials",
});
});

/* ================= DB ================= */
mongoose.set("strictQuery", true);

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
createdAt: { type: Date, default: Date.now },
})
);

/* ================= EMAIL BOOKING ================= */
async function sendConfirmationEmail(booking) {
if (!booking.email) return;

const mailOptions = {
from: `"DMV Cleaning Services" <${process.env.EMAIL_USER}>`,
to: booking.email,
subject: "🧼 Booking Confirmed",
html: `       <h2>Booking Confirmed</h2>       <p><b>Name:</b> ${booking.name}</p>       <p><b>Service:</b> ${booking.service}</p>       <p><b>Date:</b> ${booking.date}</p>       <p><b>Time:</b> ${booking.timeSlot}</p>       <p><b>Total:</b> $${booking.total}</p>       <p><a href="${booking.invoiceUrl}">Download Invoice</a></p>
    `,
};

await sendEmailWithRetry(mailOptions);
}

/* ================= CONTACT EMAIL ================= */
app.post("/api/contact", async (req, res) => {
try {
const { name, email, message } = req.body;

```
if (!name || !email || !message) {
  return res.status(400).json({
    success: false,
    error: "All fields required",
  });
}

await sendEmailWithRetry({
  from: `"Website Contact" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,
  subject: "📩 New Contact Message",
  html: `
    <h3>New Message</h3>
    <p><b>Name:</b> ${name}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Message:</b> ${message}</p>
  `,
});

res.json({ success: true });
```

} catch (err) {
console.error(err);
res.status(500).json({ success: false });
}
});

/* ================= BOOKING ================= */
app.post("/api/book", async (req, res) => {
try {
const count = await Booking.countDocuments({
date: req.body.date,
timeSlot: req.body.timeSlot,
});

```
if (count >= MAX_PER_SLOT) {
  return res.status(400).json({
    success: false,
    error: "Slot full",
  });
}

const booking = await Booking.create(req.body);

const invoiceUrl = `${BASE_URL}/api/invoice/${booking._id}`;

await sendConfirmationEmail({
  ...booking._doc,
  invoiceUrl,
});

io.emit("new-booking", booking); // LIVE UPDATE 🔥

res.json({
  success: true,
  bookingId: booking._id,
});
```

} catch (err) {
console.error(err);
res.status(500).json({
success: false,
error: err.message,
});
}
});

/* ================= INVOICE ================= */
app.get("/api/invoice/:id", async (req, res) => {
const booking = await Booking.findById(req.params.id);
if (!booking) return res.status(404).send("Not found");

const doc = new PDFDocument();
res.setHeader("Content-Type", "application/pdf");
doc.pipe(res);

doc.fontSize(20).text("DMV Cleaning Invoice", { underline: true });
doc.moveDown();
doc.text(`Name: ${booking.name}`);
doc.text(`Service: ${booking.service}`);
doc.text(`Date: ${booking.date}`);
doc.text(`Total: $${booking.total}`);

doc.end();
});

/* ================= START ================= */
async function start() {
try {
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB Connected");

```
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log("🔥 Server running on", PORT);
});
```

} catch (err) {
console.error("🚨 DB ERROR:", err.message);
}
}

start();
