const params = new URLSearchParams(window.location.search);

const bookingId = params.get("bid");
const total = params.get("total");
const deposit = params.get("deposit");
const remaining = params.get("remaining");

const booking = JSON.parse(localStorage.getItem("lastBooking"));

const box = document.getElementById("details");

if (booking) {
  box.innerHTML = `
    <div class="box"><b>Booking ID:</b> ${bookingId}</div>
    <div class="box"><b>Name:</b> ${booking.name}</div>
    <div class="box"><b>Service:</b> ${booking.service}</div>
    <div class="box"><b>Date:</b> ${booking.date}</div>
    <div class="box"><b>Time:</b> ${booking.timeSlot}</div>

    <div class="box"><b>Total:</b> $${total}</div>
    <div class="box"><b>Deposit (20%):</b> $${deposit}</div>
    <div class="box"><b>Remaining:</b> $${remaining}</div>
  `;
} else {
  box.innerHTML = "No booking data found.";
}

function goHome() {
  window.location.href = "index.html";
}