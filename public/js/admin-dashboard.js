const API = "https://dmv-cleaning-backend.onrender.com/api";

/* SOCKET REALTIME */
const socket = io("https://dmv-cleaning-backend.onrender.com");

/* ================= DASHBOARD ================= */
async function loadDashboard() {
  const res = await fetch(API + "/dashboard", {
    credentials: "include"
  });

  const data = await res.json();

  document.getElementById("bookings").innerText = data.totalBookings;
  document.getElementById("pending").innerText = data.pending;
  document.getElementById("approved").innerText = data.approved;
  document.getElementById("rejected").innerText = data.rejected;
}

/* ================= BOOKINGS LIST ================= */
async function loadBookings() {
  const res = await fetch(API + "/bookings");
  const data = await res.json();

  const list = document.getElementById("bookingList");
  list.innerHTML = "";

  data.forEach(b => {
    const div = document.createElement("div");
    div.className = "booking";

    div.innerHTML = `
      <p><b>${b.name}</b> - ${b.service}</p>
      <p>${b.date} | ${b.timeSlot}</p>
      <p>Status: <b>${b.status}</b></p>

      <button onclick="approveBooking(${b.id})">Approve</button>
      <button onclick="rejectBooking(${b.id})">Reject</button>
    `;

    list.appendChild(div);
  });
}

/* ================= APPROVE ================= */
async function approveBooking(id) {
  await fetch(API + "/bookings/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  loadDashboard();
  loadBookings();
}

/* ================= REJECT ================= */
async function rejectBooking(id) {
  await fetch(API + "/bookings/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  loadDashboard();
  loadBookings();
}

/* ================= LOGOUT ================= */
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch(API + "/admin/logout", {
    credentials: "include"
  });

  window.location.href = "/admin/login.html";
});

/* ================= REALTIME ================= */
socket.on("new-booking", () => {
  loadDashboard();
  loadBookings();
});

/* ================= INIT ================= */
loadDashboard();
loadBookings();
setInterval(() => {
  loadDashboard();
  loadBookings();
}, 30000);