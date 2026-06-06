const API = "http://127.0.0.1:3006";
const socket = io(API);

let selectedDate = null;
let selectedSlot = null;

/* ================= ADMIN LOGIN ================= */
async function loginAdmin() {
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("http://127.0.0.1:3006/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = "admin.html";
    } else {
      alert(data.message || "Login failed");
    }

  } catch (err) {
    console.error(err);
    alert("Server not reachable");
  }
}

/* ================= MENU ================= */
function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("active");
}

/* ================= LOAD SLOTS ================= */
window.loadSlots = async function(date) {

  selectedDate = date;
  selectedSlot = null;

  const container = document.getElementById("timeSlots");
  if (!container) return;

  container.innerHTML = "";

  const res = await fetch(API + "/api/availability/" + date);
  const data = await res.json();

  const allSlots = [
    "08:00-10:00",
    "10:00-12:00",
    "12:00-14:00",
    "14:00-16:00",
    "16:00-18:00"
  ];

  allSlots.forEach(slot => {

    const btn = document.createElement("button");
    btn.className = "slot-btn";
    btn.textContent = slot;

    if (data.taken.includes(slot)) {
      btn.disabled = true;
      btn.textContent = slot + " (Booked)";
    } else {
      btn.onclick = () => selectSlot(slot, btn);
    }

    container.appendChild(btn);
  });

  if (data.fullyBooked) {
    container.innerHTML = `<p style="color:red;font-weight:bold;">❌ Fully Booked</p>`;
  }
};

/* ================= SELECT SLOT ================= */
function selectSlot(slot, btn) {

  selectedSlot = slot;

  document.querySelectorAll(".slot-btn").forEach(b => {
    b.classList.remove("active");
  });

  btn.classList.add("active");
}

/* ================= CALENDAR ================= */
function loadCalendar() {

  const calendarEl = document.getElementById("calendar");

  const calendar = new FullCalendar.Calendar(calendarEl, {

    initialView: "dayGridMonth",

    dateClick: function(info) {

      selectedDate = info.dateStr;

      const label = document.getElementById("selectedDate");
      if (label) {
        label.textContent = "Selected: " + selectedDate;
      }

      loadSlots(selectedDate);
    }
  });

  calendar.render();
}

document.addEventListener("DOMContentLoaded", loadCalendar);

/* ================= BOOK ================= */
async function submitBooking() {

  if (!selectedDate || !selectedSlot) {
    alert("Select date + slot");
    return;
  }

  const customer = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    address: document.getElementById("address").value,
    date: selectedDate,
    timeSlot: selectedSlot
  };

  const service = document.getElementById("service").value;

  const res = await fetch(API + "/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, customer })
  });

  const data = await res.json();

  if (data.url) {
    window.location.href = data.url;
  } else {
    alert(data.error || "Booking failed");
  }
}

/* ================= REALTIME ================= */
socket.on("booking-updated", () => {
  if (selectedDate) loadSlots(selectedDate);
});

// 
/* ================= ACTIONS FIX ================= */

async function approve(id) {
  try {
    await fetch(API + "/api/approve/" + id, { method: "POST" });
    load(); // refresh dashboard
  } catch (err) {
    console.error(err);
    alert("Approve failed");
  }
}

async function reject(id) {
  try {
    await fetch(API + "/api/reject/" + id, { method: "POST" });
    load();
  } catch (err) {
    console.error(err);
    alert("Reject failed");
  }
}

async function del(id) {
  try {
    const confirmDelete = confirm("Are you sure you want to delete this booking?");
    if (!confirmDelete) return;

    await fetch(API + "/api/delete/" + id, { method: "DELETE" });

    load(); // IMPORTANT REFRESH
  } catch (err) {
    console.error(err);
    alert("Delete failed");
  }
}