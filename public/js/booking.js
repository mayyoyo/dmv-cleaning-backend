/* ================= CONFIG ================= */
const API = "https://dmv-cleaning-backend.onrender.com/api";
const socket = io("https://dmv-cleaning-backend.onrender.com");

/* ================= GLOBAL STATE ================= */
let bookings = [];
let selectedDate = null;

/* ================= DOM ELEMENTS ================= */
const calendarEl = document.getElementById("calendar");
const timeSlot = document.getElementById("timeSlot");
const selectedDateText = document.getElementById("selectedDate");

/* ================= TIME SLOTS ================= */
const SLOTS = [
  "08:00-10:00",
  "10:00-12:00",
  "12:00-14:00",
  "14:00-16:00",
  "16:00-18:00"
];

/* ================= SOCKET REAL-TIME ================= */
socket.on("connect", () => {
  console.log("✅ Connected to server");
});

/* initial load */
socket.on("init-bookings", (data) => {
  bookings = data;
  updateSlots();
});

/* new booking instantly */
socket.on("new-booking", (booking) => {
  bookings.push(booking);
  updateSlots();
});

/* full refresh from server */
socket.on("update-slots", (data) => {
  bookings = data;
  updateSlots();
});

/* ================= LOAD BOOKINGS (fallback) ================= */
async function loadBookings() {
  try {
    const res = await fetch(API + "/public-bookings");
    bookings = await res.json();
    updateSlots();
  } catch (err) {
    console.error("Failed loading bookings:", err);
  }
}

/* ================= UPDATE SLOTS (REAL-TIME UI) ================= */
function updateSlots() {

  if (!selectedDate) return;

  const bookedSlots = bookings
    .filter(b => b.date === selectedDate)
    .map(b => b.timeSlot);

  timeSlot.innerHTML = `<option value="">Select Time</option>`;

  SLOTS.forEach(slot => {

    const option = document.createElement("option");
    option.value = slot;

    if (bookedSlots.includes(slot)) {
      option.textContent = `${slot} ❌ Booked`;
      option.disabled = true;
      option.classList.add("slot-booked");
    } else {
      option.textContent = `${slot} ✅ Available`;
      option.classList.add("slot-free");
    }

    timeSlot.appendChild(option);
  });
}

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", async () => {

  await loadBookings();

  const calendar = new FullCalendar.Calendar(calendarEl, {

    initialView: "dayGridMonth",
    height: 500,

    dateClick: function(info) {

      selectedDate = info.dateStr;

      selectedDateText.innerText =
        "Selected: " + selectedDate;

      updateSlots();
    }
  });

  calendar.render();
});

/* ================= BOOK NOW ================= */
async function bookNow() {

  const data = {
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    address: document.getElementById("address").value.trim(),
    date: selectedDate,
    timeSlot: timeSlot.value,
    service: document.getElementById("service").value,
    paymentType: document.getElementById("paymentType").value
  };

  if (!selectedDate) {
    return alert("❌ Please select a date");
  }

  if (!data.timeSlot) {
    return alert("❌ Please select a time slot");
  }

  try {

    const res = await fetch(API + "/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.status === 409) {
      alert("⚠ Slot already booked. Choose another time.");
      return;
    }

    if (!res.ok) {
      return alert(result.error || "Booking failed");
    }

    alert("✅ Booking successful!");

    /* REDIRECT TO SUCCESS PAGE */
    window.location.href =
      "/success.html?bookingId=" + result.bookingId;

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("Server error. Try again.");
  }
}