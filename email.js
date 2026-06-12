const nodemailer = require("nodemailer");

/* ================= EMAIL TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= SEND EMAIL ================= */
async function sendEmail(customer, type = "received") {

  let subject = "";
  let html = "";

  if (type === "received") {
    subject = "Booking Received ✅";
    html = `
      <div style="font-family:Arial;padding:20px">
        <h2>🧼 DMV Cleaning Services</h2>
        <p>Hi ${customer.name},</p>
        <p>We received your booking for <b>${customer.date}</b> at <b>${customer.timeSlot}</b>.</p>
        <p>We will contact you shortly.</p>
      </div>
    `;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: customer.email,
    subject,
    html
  });
}

module.exports = { sendEmail };