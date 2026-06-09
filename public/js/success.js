const API = window.location.origin;

/* ================= GET BOOKING ID ================= */
const params = new URLSearchParams(window.location.search);
const bookingId = params.get("bookingId");

/* ================= LOAD BOOKING ================= */
async function loadBooking() {

  if (!bookingId) {
    document.body.innerHTML = "<h2>❌ Missing booking ID</h2>";
    return;
  }

  try {
    const res = await fetch(API + "/api/bookings");
    const bookings = await res.json();

    const booking = bookings.find(b => String(b.id) === String(bookingId));

    if (!booking) {
      document.body.innerHTML = "<h2>❌ Booking not found</h2>";
      return;
    }

    document.getElementById("name").innerText = booking.name;
    document.getElementById("email").innerText = booking.email;
    document.getElementById("service").innerText = booking.service;
    document.getElementById("date").innerText = booking.date;
    document.getElementById("time").innerText = booking.timeSlot;
    document.getElementById("total").innerText = booking.total || "120";

    const badge = document.getElementById("statusBadge");

    if (booking.status === "Approved") {
      badge.innerText = "APPROVED";
      badge.classList.add("paid");
    } else if (booking.status === "Rejected") {
      badge.innerText = "REJECTED";
      badge.style.background = "red";
    } else {
      badge.innerText = "PENDING";
      badge.classList.add("pending");
    }

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>❌ Error loading booking</h2>";
  }
}

/* ================= PDF DOWNLOAD ================= */
function downloadPDF() {
  const element = document.getElementById("receipt");

  html2pdf()
    .set({
      margin: 10,
      filename: "receipt.pdf",
      html2canvas: { scale: 2 },
      jsPDF: { format: "a4" }
    })
    .from(element)
    .save();
}

/* ================= INIT ================= */
loadBooking();