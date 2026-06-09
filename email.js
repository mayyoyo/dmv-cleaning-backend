import nodemailer from "nodemailer";
import axios from "axios";

/* ================= EMAIL TEMPLATE (HTML VERSION) ================= */
function emailTemplate(customer) {
  return `
  <div style="font-family:Arial;padding:20px;background:#f4f6f8">
    <div style="max-width:500px;margin:auto;background:white;padding:20px;border-radius:10px">

      <h2 style="color:#2c3e50">Booking Confirmed ✅</h2>

      <p>Hi <b>${customer.name}</b>,</p>

      <p>Your cleaning booking has been successfully received.</p>

      <div style="background:#f0f0f0;padding:10px;border-radius:8px">
        <p><b>Date:</b> ${customer.date}</p>
        <p><b>Time:</b> ${customer.timeSlot}</p>
        <p><b>Service:</b> ${customer.service}</p>
        <p><b>Address:</b> ${customer.address}</p>
      </div>

      <p style="margin-top:15px;color:green">
        ✔ No payment required now. We will contact you soon.
      </p>

      <p>Thank you for choosing us 🙏</p>

    </div>
  </div>
  `;
}

/* ================= EMAIL ================= */
export async function sendEmail(customer) {
  try {

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
      to: customer.email,
      subject: "Booking Confirmed ✅",
      html: emailTemplate(customer)
    });

    console.log("📧 Email sent to:", customer.email);

  } catch (err) {
    console.error("EMAIL ERROR:", err);
  }
}

/* ================= WHATSAPP ================= */
export async function sendWhatsApp(customer) {
  try {

    await axios.post("https://api.callmebot.com/whatsapp.php", null, {
      params: {
        phone: process.env.WHATSAPP_NUMBER,
        text: `🚀 New Booking\nName: ${customer.name}\nDate: ${customer.date}\nService: ${customer.service}\nPhone: ${customer.phone}`,
        apikey: process.env.WHATSAPP_API_KEY
      }
    });

    console.log("📱 WhatsApp sent");

  } catch (err) {
    console.error("WHATSAPP ERROR:", err);
  }
}