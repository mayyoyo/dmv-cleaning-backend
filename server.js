require("dotenv").config();

const express = require("express");
const cors = require("cors");
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

/* ================= TEST ================= */
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API working" });
});

/* ================= MEMORY DB ================= */
let bookings = [];
let idCounter = 1;

/* ================= PRICE FUNCTION ================= */
function getServicePrice(service) {
  if (!service) return 120;

  if (service.includes("$120")) return 120;
  if (service.includes("$150")) return 150;
  if (service.includes("$200")) return 200;
  if (service.includes("$250")) return 250;

  return 120;
}

/* ================= STRIPE CHECKOUT (FIXED FINAL VERSION) ================= */
app.post("/api/create-deposit-checkout", async (req, res) => {
  try {
    const { service, email, price } = req.body;

    console.log("REQUEST RECEIVED:", req.body);

    // 🔴 VALIDATION (IMPORTANT)
    if (!service || !email) {
      return res.status(400).json({
        error: "Missing service or email"
      });
    }

    const finalPrice = price || getServicePrice(service);
    const deposit = Math.round(finalPrice * 0.25 * 100);

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

      success_url: "https://mydmvcleaningservice.com/success.html",
      cancel_url: "https://mydmvcleaningservice.com/booking.html"
    });

    console.log("STRIPE SUCCESS URL:", session.url);

    res.json({ url: session.url });

  } catch (err) {
    console.error("STRIPE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= BOOKING ================= */
app.post("/api/book", (req, res) => {
  const booking = {
    id: idCounter++,
    ...req.body
  };

  bookings.push(booking);

  res.json({ success: true, bookingId: booking.id });
});

/* ================= ADMIN ================= */
app.get("/api/admin/bookings", (req, res) => {
  res.json(bookings);
});

/* ================= REVENUE ================= */
app.get("/api/admin/revenue", (req, res) => {
  let total = 0;
  let deposit = 0;

  bookings.forEach(b => {
    total += b.price || 0;
    deposit += b.deposit || 0;
  });

  res.json({
    totalRevenue: total,
    depositCollected: deposit,
    remainingDue: total - deposit
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

  doc.text(`Name: ${booking.name}`);
  doc.text(`Service: ${booking.service}`);
  doc.text(`Price: $${booking.price}`);
  doc.text(`Deposit: $${booking.deposit}`);
  doc.text(`Remaining: $${booking.price - booking.deposit}`);

  doc.end();
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 Server running on port", PORT);
});