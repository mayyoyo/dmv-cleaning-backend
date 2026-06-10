const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = null;
let bookings = [];

/* ================= SOCKET ================= */
const socket = io("https://dmv-cleaning-backend.onrender.com");

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  const res = await fetch(API + "/public-bookings");
  bookings = await res.json();
}

/* ================= GET BOOKED DATES ================= */
function getBookedDates() {
  return bookings.map(b => b.date);
}

/* ================= SLOT LIST ================= */
const ALL_SLOTS = [
  "08:00-10:00",
  "10:00-12:00",
  "12:00-14:00",
  "14:00-16:00",
  "16:00-18:00"
];

/* ================= UPDATE SLOTS ================= */
function highlightSlots() {

  const select = document.getElementById("timeSlot");

  select.innerHTML = `<option value="">Select Time</option>`;

  const booked = bookings
    .filter(b => b.date === selectedDate)
    .map(b => b.timeSlot);

  ALL_SLOTS.forEach(slot => {

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

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", async () => {

  await loadBookings();

  const calendarEl = document.getElementById("calendar");

  const calendar = new FullCalendar.Calendar(calendarEl, {

    initialView: "dayGridMonth",
    height: 500,

    /* ================= COLOR BOOKED DAYS ================= */
    dayCellDidMount: function(info) {

      const dateStr = info.date.toISOString().split("T")[0];
      const bookedDates = getBookedDates();

      if (bookedDates.includes(dateStr)) {
        info.el.style.backgroundColor = "#ff4d4d";
        info.el.style.color = "white";
        info.el.style.opacity = "0.7";
        info.el.style.borderRadius = "6px";
      }
    },

    /* ================= CLICK DATE ================= */
    dateClick: function(info) {

      selectedDate = info.dateStr;

      document.getElementById("selectedDate").innerText =
        "Selected: " + selectedDate;

      highlightSlots();
    }
  });

  calendar.render();

  /* ================= REAL-TIME UPDATES ================= */
  socket.on("init-bookings", async (data) => {
    bookings = data;
    calendar.refetchEvents();
    highlightSlots();
  });

  socket.on("new-booking", async (booking) => {
    bookings.push(booking);
    calendar.refetchEvents();
    highlightSlots();
    animateRefresh();
  });

  socket.on("update-slots", async (data) => {
    bookings = data;
    calendar.refetchEvents();
    highlightSlots();
    animateRefresh();
  });
});

/* ================= SMALL UI ANIMATION ================= */
function animateRefresh() {
  document.body.style.transition = "0.2s";
  document.body.style.transform = "scale(1.01)";

  setTimeout(() => {
    document.body.style.transform = "scale(1)";
  }, 150);
}