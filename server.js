require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());

/* ================= DEBUG ================= */
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "Loaded ✅" : "Missing ❌");

/* ================= GMAIL TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= VERIFY EMAIL ================= */
transporter.verify((error) => {
  if (error) {
    console.log("❌ EMAIL ERROR:", error);
  } else {
    console.log("✅ EMAIL READY");
  }
});

/* ================= RETRY FUNCTION (FIXED) ================= */
async function sendEmailWithRetry(mailOptions, retries = 3) {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Email sent:", info.response);
    return true;

  } catch (error) {
    console.log("❌ Email error:", error.message);

    if (retries > 0) {
      console.log(`🔁 Retrying... (${retries})`);
      await new Promise(res => setTimeout(res, 3000));
      return sendEmailWithRetry(mailOptions, retries - 1);
    }

    console.log("🚨 Failed after retries");
    return false;
  }
}

/* ================= BOOKING ROUTE ================= */
app.post("/book", async (req, res) => {
  try {
    const { name, email, phone, service, date, timeSlot } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email required" });
    }

    /* ================= CLIENT EMAIL ================= */
    const clientEmail = {
      from: `"DMV Cleaning Services" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🧼 Booking Confirmation",
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2 style="color:green;">Booking Confirmed ✅</h2>

          <p>Hello <b>${name}</b>,</p>

          <p>Your booking has been successfully received.</p>

          <h3>📋 Details:</h3>
          <ul>
            <li><b>Service:</b> ${service}</li>
            <li><b>Date:</b> ${date}</li>
            <li><b>Time:</b> ${timeSlot}</li>
            <li><b>Phone:</b> ${phone}</li>
          </ul>

          <p>We will contact you shortly.</p>

          <hr/>
          <p><b>DMV Cleaning Services</b></p>
        </div>
      `
    };

    /* ================= ADMIN EMAIL ================= */
    const adminEmail = {
      from: `"Booking System" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "🔥 New Booking Received",
      html: `
        <h2>New Booking</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Service:</b> ${service}</p>
        <p><b>Date:</b> ${date}</p>
        <p><b>Time:</b> ${timeSlot}</p>
      `
    };

    /* ================= SEND EMAILS ================= */
    await sendEmailWithRetry(clientEmail);
    await sendEmailWithRetry(adminEmail);

    return res.json({
      success: true,
      bookingId: Date.now().toString() // temporary ID (works if no DB yet)
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= TEST EMAIL ================= */
app.get("/test-email", async (req, res) => {
  try {
    await sendEmailWithRetry({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test Email ✅",
      text: "Email system is working!"
    });

    res.send("✅ Email sent");

  } catch (err) {
    console.error(err);
    res.send("❌ Failed");
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});