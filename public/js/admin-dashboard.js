const API = "https://dmv-cleaning-backend.onrender.com/api";

/* SOCKET */
const socket = io("https://dmv-cleaning-backend.onrender.com");

/* LOAD DASHBOARD */
async function load() {
  const res = await fetch(API + "/bookings");
  const data = await res.json();

  renderBookings(data);
  updateStats(data);
}

/* STATS */
function updateStats(data) {
  document.getElementById("total").innerText = data.length;
  document.getElementById("pending").innerText = data.filter(b => b.status === "Pending").length;
  document.getElementById("approved").innerText = data.filter(b => b.status === "Approved").length;
  document.getElementById("rejected").innerText = data.filter(b => b.status === "Rejected").length;
}

/* BOOKINGS UI */
function renderBookings(bookings) {
  const container = document.getElementById("bookingList");
  container.innerHTML = "";

  bookings.reverse().forEach(b => {

    const div = document.createElement("div");
    div.className = "booking";

    div.innerHTML = `
      <h4>${b.name} (${b.service})</h4>
      <small>${b.date} | ${b.timeSlot}</small>
      <p>Status: ${b.status}</p>

      <div class="actions">
        <button class="approve" onclick="approve(${b.id})">Approve</button>
        <button class="reject" onclick="reject(${b.id})">Reject</button>
      </div>
    `;

    container.appendChild(div);
  });
}

/* APPROVE */
async function approve(id) {
  await fetch(API + "/bookings/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  load();
}

/* REJECT */
async function reject(id) {
  await fetch(API + "/bookings/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  load();
}

/* REALTIME UPDATE */
socket.on("new-booking", () => {
  load();
});

/* LOGOUT */
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch(API + "/admin/logout", {
    credentials: "include"
  });

  window.location.href = "/admin/login.html";
});

/* INIT */
load();