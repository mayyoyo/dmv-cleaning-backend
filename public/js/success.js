const API = "https://dmv-cleaning-backend.onrender.com/api";

const params = new URLSearchParams(window.location.search);
const bookingId = params.get("bookingId");

async function loadReceipt() {

  if (!bookingId) {
    document.body.innerHTML = "<h2>❌ Missing booking ID</h2>";
    return;
  }

  try {
    const res = await fetch(API + "/bookings");
    const bookings = await res.json();

    const booking = bookings.find(b => b.id == bookingId);

    if (!booking) {
      document.body.innerHTML = "<h2>❌ Booking not found</h2>";
      return;
    }

    document.getElementById("name").innerText = booking.name;
    document.getElementById("email").innerText = booking.email;
    document.getElementById("service").innerText = booking.service;
    document.getElementById("date").innerText = booking.date;
    document.getElementById("time").innerText = booking.timeSlot;

    const total =
      booking.service === "Deep Cleaning" ? 200 :
      booking.service === "Office Cleaning" ? 150 :
      booking.service === "Move In/Out Cleaning" ? 180 : 120;

    document.getElementById("total").innerText = total;

    document.getElementById("status").innerText = booking.status;

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>❌ Error loading receipt</h2>";
  }
}

loadReceipt();