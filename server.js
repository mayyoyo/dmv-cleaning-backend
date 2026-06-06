require("dotenv").config();

// ================== IMPORTS ==================
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ================== APP INIT ==================
const app = express();

// ================== STRIPE WEBHOOK (MUST BE FIRST) ==================
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

      console.log("✅ Payment received:", session.id);
    }

    res.json({ received: true });
  } catch (err) {
    console.log("❌ Webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== STATIC FILES ==================
app.use(express.static(path.join(__dirname, "public")));

// ================== PORT ==================
const PORT = process.env.PORT || 3000;

// ================== DASHBOARD ROUTE ==================
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

// ================== AUTH MIDDLEWARE ==================
function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).send("Unauthorized");

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).send("Invalid token");
  }
}

// ================== ADMIN LOGIN ==================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign({ user: username }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    return res.json({ token });
  }

  res.status(401).send("Invalid credentials");
});

// ================== PROTECTED ADMIN DATA ==================
app.get("/api/admin/data", auth, (req, res) => {
  res.json({ message: "Secure dashboard data" });
});

// ================== STRIPE CHECKOUT (FIXED 10% DEPOSIT) ==================
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    let { amount, bookingId } = req.body;

    // FORCE CLEAN NUMBER
    const total = Number(amount);

    if (isNaN(total)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // 10% deposit
    const deposit = total * 0.10;

    // convert to cents ONCE
    const depositInCents = Math.round(deposit * 100);

    console.log("TOTAL:", total);
    console.log("DEPOSIT:", deposit);
    console.log("CENTS:", depositInCents);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      metadata: {
        bookingId,
        type: "deposit",
      },

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Cleaning Deposit (10%)",
            },
            unit_amount: depositInCents,
          },
          quantity: 1,
        },
      ],

      success_url: `${process.env.DOMAIN}/success.html`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log("Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ================== TEST ROUTE ==================
app.get("/api", (req, res) => {
  res.send("✅ API working");
});

// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});