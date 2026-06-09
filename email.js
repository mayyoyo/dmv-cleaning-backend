import nodemailer from "nodemailer";
import axios from "axios";

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= AIRBNB STYLE TEMPLATE ================= */
function emailTemplate(title, name, body, color = "#FF5A5F") {
  return `
  <div style="font-family:Arial;background:#f7f7f7;padding:20px">
    <div style="max-width:600px;margin:auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)">

      <div style="background:${color};padding:20px;color:white;text-align:center">
        <h1>🧼 DMV Cleaning Services</h1>
      </div>

      <div style="padding:20px">
        <h2>${title}</h2>
        <p>Hi <b>${name}</b>,</p>
        <p>${body}</p>

        <hr>

        <p style="font-size:12px;color:gray">
          Thank you for choosing DMV Cleaning Services LLC
        </p>
      </div>

    </div>
  </div>
  `;
}

/* ================= EMAIL ================= */
export async function sendEmail(customer, type = "received") {

  let subject = "";
  let html = "";

  if (type === "received") {
    subject = "Booking Received ✅";
    html = emailTemplate(
      "Booking Received",
      customer.name,
      `We received your booking for <b>${customer.date}</b> at <b>${customer.timeSlot}</b>.`
    );
  }

  if (type === "approved") {
    subject = "Booking Approved 🎉";
    html = emailTemplate(
      "Booking Approved",
      customer.name,
      `Your booking is <b style="color:green">APPROVED</b> for ${customer.date} at ${customer.timeSlot}.`,
      "#28a745"
    );
  }

  if (type === "rejected") {
    subject = "Booking Update ❌";
    html = emailTemplate(
      "Booking Not Available",
      customer.name,
      `Unfortunately your booking was not available. Please choose another time.`,
      "#dc3545"
    );
  }

  await transporter.sendMail({
    from: "DMV Cleaning System",
    to: customer.email,
    subject,
    html
  });
}

/* ================= WHATSAPP ================= */
export async function sendWhatsApp(customer) {
  await axios.post("https://api.callmebot.com/whatsapp.php", null, {
    params: {
      phone: process.env.WHATSAPP_NUMBER,
      text: `New Booking 🚀 ${customer.name} | ${customer.date} | ${customer.service}`,
      apikey: process.env.WHATSAPP_KEY
    }
  });
}