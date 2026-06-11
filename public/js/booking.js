const API = "https://dmv-cleaning-backend.onrender.com/api";
const socket = io("https://dmv-cleaning-backend.onrender.com");

let bookings = [];
let selectedDate = null;
let calendar;

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  const res = await fetch(API + "/public-bookings");
  bookings = await res.json();
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {

  await loadBookings();

  updateStats(); // ✅ load stats on start

  calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView: "dayGridMonth",
      height: 500,

      dateClick: function(info) {
        selectedDate = info.dateStr;

        document.getElementById("selectedDate").innerText =
          "Selected: " + selectedDate;

        updateSlots();
      }
    }
  );

  calendar.render();

  /* ================= REAL-TIME ================= */
  socket.on("new-booking", (b) => {
    bookings.unshift(b); // ✅ important (latest first)
    calendar.render();
    updateSlots();
    updateStats(); // ✅ stats update
  });

  socket.on("update-slots", (data) => {
    bookings = data;
    calendar.render();
    updateSlots();
    updateStats(); // ✅ stats update
  });

});

/* ================= STATS ================= */
function updateStats() {
  const total = bookings.reduce((sum, b) => sum + (b.total || 0), 0);

  const statsBox = document.getElementById("stats");

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="stat">📦 Total Bookings: ${bookings.length}</div>
      <div class="stat">💰 Total Income: $${total}</div>
    `;
  }
}

/* ================= SLOTS ================= */
function updateSlots() {

  const select = document.getElementById("timeSlot");
  if (!selectedDate) return;

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
      option.style.color = "red";
    } else {
      option.textContent = slot + " ✅ Available";
    }

    select.appendChild(option);
  });
}

/* ================= BOOK ================= */
async function bookNow() {

  const data = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    address: document.getElementById("address").value,
    date: selectedDate,
    timeSlot: document.getElementById("timeSlot").value,
    service: document.getElementById("service").value
  };

  if (!selectedDate) return alert("Select date");

  try {

    const res = await fetch(API + "/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("BACKEND ERROR:", result);
      return alert(result.error || "Booking failed");
    }

    window.location.href =
      "/success.html?bookingId=" + result.bookingId;

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("Error: " + err.message);
  }
}

/* ================= STRIPE SAVE CARD ================= */
async function saveCardAndBook() {
  alert("Stripe UI step coming next");
}