
const nodemailer = require("nodemailer");

// ✅ EMAIL FUNCTION
async function sendEmail(booking, type) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"DMV Cleaning" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject: "Booking Received ✅",
      html: `
        <h2>Thank you, ${booking.name}</h2>
        <p>Your cleaning service has been booked.</p>
        <p><strong>Service:</strong> ${booking.service}</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Total:</strong> $${booking.total}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent ✅");

  } catch (err) {
    console.error("Email error:", err);
  }
}

// ✅ WHATSAPP (placeholder)
async function sendWhatsApp(booking) {
  console.log("WhatsApp send (mock) for:", booking.phone);
}

module.exports = {
  sendEmail,
  sendWhatsApp
};

