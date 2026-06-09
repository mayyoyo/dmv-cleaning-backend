const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = null;

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", async function () {
  const calendarEl = document.getElementById("calendar");
  let events = [];

  try {
    const res = await fetch(API + "/bookings");
    events = await res.json();
  } catch (err) {
    console.error("Calendar load error:", err);
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: 500,

    events: events,

    dateClick: function (info) {
      selectedDate = info.dateStr;
      document.getElementById("selectedDate").innerText = selectedDate;
    }
  });

  calendar.render();
});

/* ================= BOOKING FUNCTION (FIXED) ================= */
async function bookNow() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const timeSlot = document.getElementById("timeSlot").value;
  const service = document.getElementById("service").value;

  // VALIDATION
  if (!selectedDate) {
    return alert("❌ Please select a date");
  }

  if (!name || !email || !phone || !address || !timeSlot || !service) {
    return alert("❌ Please fill all fields");
  }

  const booking = {
    name,
    email,
    phone,
    address,
    date: selectedDate,
    timeSlot,
    service
  };

  try {
    const res = await fetch(API + "/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booking)
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "❌ Booking failed");
    }

    alert("✅ Booking successful! We will contact you soon.");
    location.reload();

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("❌ Server error");
  }
}

/* ================= DEBUG ================= */
console.log("🟢 Booking system loaded successfully");