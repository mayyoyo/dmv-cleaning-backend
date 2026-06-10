const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = null;

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", function () {

  const calendarEl = document.getElementById("calendar");

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: 500,

    dateClick: function(info) {
      selectedDate = info.dateStr;

      document.getElementById("selectedDate").innerText =
        "Selected: " + selectedDate;
    }
  });

  calendar.render();
});

/* ================= BOOKING ================= */
async function bookNow() {

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const timeSlot = document.getElementById("timeSlot").value;
  const service = document.getElementById("service").value;
  const paymentType = document.getElementById("paymentType").value;

  if (!selectedDate) {
    return alert("❌ Please select a date");
  }

  if (!name || !email || !phone || !address || !timeSlot || !service) {
    return alert("❌ Please fill all fields");
  }

  try {

    const res = await fetch(API + "/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        email,
        phone,
        address,
        date: selectedDate,
        timeSlot,
        service,
        paymentType
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "Booking failed");
    }

    alert("Booking successful!");

    /* ✅ REDIRECT TO SUCCESS PAGE */
    window.location.href =
      "/success.html?bookingId=" + data.bookingId;

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
}