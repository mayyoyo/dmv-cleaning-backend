/* ================= API ================= */
const API = "https://dmv-cleaning-backend.onrender.com/api";

/* ================= SOCKET ================= */
const socket = io("https://dmv-cleaning-backend.onrender.com");

/* ================= GLOBAL ================= */
let bookings = [];
let selectedDate = null;
let calendar;

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
try {
const res = await fetch(API + "/public-bookings");
bookings = await res.json();
} catch (err) {
console.error("LOAD ERROR:", err);
}
}

/* ================= FORMAT DATE ================= */
function formatDate(date) {
return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", async () => {

await loadBookings();

calendar = new FullCalendar.Calendar(
document.getElementById("calendar"),
{
initialView: "dayGridMonth",
height: 500,

```
  /* 🔴 RED BOOKED DAYS */
  dayCellDidMount: function(info) {
    const dateStr = formatDate(info.date);

    const bookedDates = bookings.map(b => b.date);

    if (bookedDates.includes(dateStr)) {
      info.el.style.backgroundColor = "#ff4d4d";
      info.el.style.color = "#fff";
    }
  },

  /* CLICK DATE */
  dateClick: function(info) {
    selectedDate = info.dateStr;

    document.getElementById("selectedDate").innerText =
      "Selected: " + selectedDate;

    updateSlots(); // 🔥 load slots
  }
}
```

);

calendar.render();

/* ================= SOCKET LIVE ================= */

socket.on("init-bookings", (data) => {
bookings = data;
calendar.render();
updateSlots();
});

socket.on("new-booking", (booking) => {
bookings.push(booking);
calendar.render();
updateSlots();
});

socket.on("update-slots", (data) => {
bookings = data;
calendar.render();
updateSlots();
});

});

/* ================= UPDATE SLOTS (UPDATED 🔥) ================= */
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

const bookedSlots = bookings
.filter(b => b.date === selectedDate)
.map(b => b.timeSlot);

slots.forEach(slot => {

```
const option = document.createElement("option");
option.value = slot;

if (bookedSlots.includes(slot)) {
  option.textContent = slot + " ❌ Booked";
  option.disabled = true;
  option.style.color = "red"; // 🔴 cleaner than background
} else {
  option.textContent = slot + " ✅ Available";
}

select.appendChild(option);
```

});
}

/* ================= BOOK ================= */
async function bookNow() {

const name = document.getElementById("name").value;
const email = document.getElementById("email").value;
const phone = document.getElementById("phone").value;
const address = document.getElementById("address").value;
const timeSlot = document.getElementById("timeSlot").value;
const service = document.getElementById("service").value;
const paymentType = document.getElementById("paymentType").value;

if (!selectedDate) return alert("Select date");

if (!name || !email || !phone || !address || !timeSlot || !service) {
return alert("All fields required");
}

try {
const res = await fetch(API + "/book", {
method: "POST",
headers: {"Content-Type": "application/json"},
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

```
const data = await res.json();

if (!res.ok) return alert(data.error || "Booking failed");

window.location.href =
  "/success.html?bookingId=" + data.bookingId;
```

} catch (err) {
console.error("BOOK ERROR:", err);
alert("Server error");
}
}
