const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = null;

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", async function () {

  const calendarEl = document.getElementById("calendar");

  let bookedDates = [];

  try {
    const res = await fetch(API + "/bookings");
    const data = await res.json();

    bookedDates = data.map(b => b.date);
  } catch (err) {
    console.error(err);
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: 500,

    dateClick: function (info) {

      const clickedDate = info.dateStr;

      // ❌ BLOCK ALREADY BOOKED
      if (bookedDates.includes(clickedDate)) {
        alert("❌ This date is already booked");
        return;
      }

      // ✅ SELECT DATE
      selectedDate = clickedDate;
      document.getElementById("selectedDate").innerText = selectedDate;
    },

    events: bookedDates.map(date => ({
      title: "Booked",
      date: date,
      color: "red"
    }))
  });

  calendar.render();
});

/* ================= BOOK NOW (FIXED FULL FLOW) ================= */
async function bookNow() {

  console.log("🔥 BOOK CLICKED");

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const timeSlot = document.getElementById("timeSlot").value;
  const service = document.getElementById("service").value;

  if (!selectedDate) {
    return alert("❌ Please select a date");
  }

  if (!name || !email || !phone || !address || !timeSlot || !service) {
    return alert("❌ Please fill all fields");
  }

  try {

    const res = await fetch(API + "/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        address,
        date: selectedDate,
        timeSlot,
        service
      })
    });

    const data = await res.json();

    console.log("BOOK RESPONSE:", data);

    if (!res.ok) {
      return alert(data.error || "Booking failed");
    }

    alert("✅ Booking successful!");

    // ✅ FINAL SAFE REDIRECT FIX
    if (data.bookingId) {
      window.location.href = "/success.html?bookingId=" + data.bookingId;
    } else {
      window.location.href = "/success.html";
    }

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("❌ Server error");
  }
}

/* ================= DEBUG ================= */
console.log("🟢 Booking system loaded successfully");