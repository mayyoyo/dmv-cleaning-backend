require("dotenv").config();

// ================== IMPORTS ==================
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ================== APP INIT ==================
const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// static files
app.use(express.static(path.join(__dirname, "public")));

// ================== STRIPE WEBHOOK (FIRST) ==================
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      console.log("✅ Payment received:", event.data.object.id);
    }

    res.json({ received: true });
  } catch (err) {
    console.log("❌ Webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ================== AUTH (COOKIE SYSTEM) ==================
function auth(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login.html");
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie("token");
    return res.redirect("/login.html");
  }
}

// ================== LOGIN ==================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign({ user: username }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    // 🔥 COOKIE LOGIN (SAAS LEVEL)
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });

    return res.json({ success: true });
  }

  res.status(401).json({ success: false });
});

// ================== PROTECTED DASHBOARD ==================
app.get("/dashboard", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/dashboard.html"));
});

// ================== LOGOUT ==================
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login.html");
});

// ================== DASHBOARD DATA (REAL PROFIT) ==================
app.get("/api/dashboard", auth, async (req, res) => {
  const bookings = await require("./models/Booking").find();

  let depositRevenue = 0;
  let remainingRevenue = 0;
  let expenses = 0;

  bookings.forEach(b => {
    depositRevenue += b.depositAmount || 0;

    if (b.remainingPaid) {
      remainingRevenue += (b.total - (b.depositAmount || 0));
    }

    expenses += b.expenses || 0;
  });

  const profit = (depositRevenue + remainingRevenue) - expenses;

  res.json({
    depositRevenue,
    remainingRevenue,
    expenses,
    profit
  });
});

// ================== LIVE DASHBOARD (SOCKET UPDATE) ==================
setInterval(async () => {
  const bookings = await require("./models/Booking").find();

  let depositRevenue = 0;
  let remainingRevenue = 0;
  let expenses = 0;

  bookings.forEach(b => {
    depositRevenue += b.depositAmount || 0;

    if (b.remainingPaid) {
      remainingRevenue += (b.total - (b.depositAmount || 0));
    }

    expenses += b.expenses || 0;
  });

  const profit = (depositRevenue + remainingRevenue) - expenses;

  io.emit("dashboard-update", {
    depositRevenue,
    remainingRevenue,
    expenses,
    profit
  });

}, 10000);

// ================== MONTHLY GRAPH FIX ==================
app.get("/api/revenue-monthly", auth, async (req, res) => {
  const data = await require("./models/Booking").aggregate([
    {
      $group: {
        _id: { $substr: ["$date", 0, 7] },
        total: { $sum: "$total" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json(data);
});

// ================== STRIPE CHECKOUT ==================
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    let { amount, bookingId } = req.body;

    const total = Number(amount);

    if (isNaN(total)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const deposit = total * 0.10;
    const depositInCents = Math.round(deposit * 100);

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

// ================== START ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SaaS Server running on", PORT);
});