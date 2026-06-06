import nodemailer from "nodemailer";
import axios from "axios";

/* ================= EMAIL ================= */
export async function sendEmail(customer){

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "yourgmail@gmail.com",
      pass: "app_password"
    }
  });

  await transporter.sendMail({
    from: "DMV Cleaning System",
    to: customer.email,
    subject: "Booking Confirmed ✅",
    text: `Hi ${customer.name}, your booking is confirmed for ${customer.date} at ${customer.timeSlot}`
  });
}

/* ================= WHATSAPP ================= */
export async function sendWhatsApp(customer){

  await axios.post("https://api.callmebot.com/whatsapp.php", null, {
    params: {
      phone: "YOUR_NUMBER",
      text: `New Booking 🚀 Name: ${customer.name} | Date: ${customer.date} | Service: ${customer.service}`,
      apikey: "YOUR_API_KEY"
    }
  });
}