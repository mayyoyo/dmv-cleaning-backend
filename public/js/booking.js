const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = null;
let bookings = [];

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  try {
    const res = await fetch(API + "/public-bookings");

    if (!res.ok) {
      console.log("API ERROR:", res.status);
      return;
    }

    bookings = await res.json();
    console.log("BOOKINGS LOADED:", bookings);

  } catch (err) {
    console.error("FETCH ERROR:", err);
  }
}

/* ================= INIT CALENDAR ================= */
document.addEventListener("DOMContentLoaded", async () => {

  await loadBookings();

  const calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView: "dayGridMonth",
      height: 500,

      dateClick: function(info) {

        selectedDate = info.dateStr;

        document.getElementById("selectedDate").innerText =
          "Selected: " + selectedDate;

        highlightSlots(); // 🔥 IMPORTANT FIX
      }
    }
  );

  calendar.render();
});

/* ================= BOOK NOW FUNCTION ================= */
async function bookNow() {

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("address").value;
  const timeSlot = document.getElementById("timeSlot").value;
  const service = document.getElementById("service").value;
  const paymentType = document.getElementById("paymentType").value;

  console.log({
    name,
    email,
    phone,
    address,
    selectedDate,
    timeSlot,
    service
  });

  if (!selectedDate) {
    return alert("❌ Please select a date");
  }

  if (!name || !email || !phone || !address || !timeSlot || !service) {
    return alert("❌ All fields required");
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

    /* ================= SUCCESS REDIRECT ================= */
    window.location.href =
      "/success.html?bookingId=" + data.bookingId;

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("Server error. Please try again.");
  }
}

/* ================= SLOT BLOCKING ================= */
function highlightSlots() {

  const select = document.getElementById("timeSlot");

  const slots = [
    "08:00-10:00",
    "10:00-12:00",
    "12:00-14:00",
    "14:00-16:00",
    "16:00-18:00"
  ];

  select.innerHTML = `<option value="">Select Time</option>`;

  const booked = bookings
    .filter(b => b.date === selectedDate)
    .map(b => b.timeSlot);

  slots.forEach(slot => {

    const option = document.createElement("option");
    option.value = slot;

    if (booked.includes(slot)) {
      option.textContent = slot + " ❌ Booked";
      option.disabled = true;
      option.style.background = "#ff4d4d";
      option.style.color = "white";
    } else {
      option.textContent = slot + " ✅ Available";
      option.style.background = "#e8fff0";
    }

    select.appendChild(option);
  });
}