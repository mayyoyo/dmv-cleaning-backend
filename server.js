require("dotenv").config();

const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ================== SOCKET ==================
io.on("connection", (socket) => {
  console.log("⚡ Client connected");

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

// ================== STRIPE WEBHOOK (MUST BE FIRST LOGIC) ==================
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 Payment success:", session.id);

      io.emit("payment-success", {
        amount: session.amount_total / 100
      });
    }

    res.json({ received: true });

  } catch (err) {
    console.log("Webhook error:", err.message);
    res.status(400).send("Webhook error");
  }
});

// ================== DASHBOARD ROUTE (SECURED) ==================
function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) return res.redirect("/login.html");

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    return res.redirect("/login.html");
  }
}

// 🔐 PROTECTED DASHBOARD
app.get("/dashboard", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

// ================== ADMIN LOGIN (COOKIE SESSION) ==================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: "2h"
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict"
    });

    return res.json({ success: true });
  }

  res.status(401).json({ success: false });
});

// ================== STRIPE CHECKOUT (FIXED 10% SAFE VERSION) ==================
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    let { amount, bookingId } = req.body;

    const total = Number(amount);
    if (isNaN(total)) return res.status(400).json({ error: "Invalid amount" });

    const deposit = total * 0.10;
    const depositInCents = Math.round(deposit * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      metadata: {
        bookingId,
        type: "deposit"
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Cleaning Deposit (10%)"
            },
            unit_amount: depositInCents
          },
          quantity: 1
        }
      ],

      success_url: `${process.env.DOMAIN}/success.html`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log("Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ================== MONTHLY REVENUE GRAPH API ==================
app.get("/api/revenue-monthly", (req, res) => {
  res.json([
    { month: "Jan", revenue: 1200 },
    { month: "Feb", revenue: 1800 },
    { month: "Mar", revenue: 2400 }
  ]);
});

// ================== DASHBOARD STATS (REAL TIME READY) ==================
app.get("/api/dashboard", (req, res) => {
  res.json({
    depositRevenue: 1000,
    remainingRevenue: 500,
    expenses: 200,
    profit: 1300
  });
});

// ================== EMAIL HOOK (READY FOR NODEMAILER) ==================
app.post("/api/send-email", (req, res) => {
  console.log("📧 Email trigger:", req.body);

  res.json({ success: true });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 SaaS Server running on", PORT);
});