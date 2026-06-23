const API = "https://dmv-cleaning-backend.onrender.com/api";

/* ================= STATE ================= */
let bookings = [];

/* ================= INIT ================= */
window.onload = () => {
  const auth = localStorage.getItem("adminAuth");

  if (auth !== "true") {
    window.location.href = "login.html";
    return;
  }

  loadDashboard();
  setInterval(loadDashboard, 5000);
};

/* ================= LOAD DASHBOARD (UPDATED) ================= */
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/admin/dashboard`);
    const data = await res.json();

    bookings = data.bookings || [];

    renderTable();
    renderRevenue(data);
  } catch (err) {
    console.error("Load error:", err);
  }
}

/* ================= TABLE ================= */
function renderTable() {
  const tbody = document.getElementById("data");
  tbody.innerHTML = "";

  bookings.forEach(b => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${b._id || b.id}</td>
      <td>${b.name || "-"}</td>
      <td>${b.email || "-"}</td>
      <td>${b.service}</td>
      <td>${b.date}</td>
      <td>${b.timeSlot}</td>
      <td>${b.paymentStatus || "pending"}</td>
      <td>$${b.price || 0}</td>
      <td>
        <button class="btn-complete" onclick="completeJob('${b._id}')">Complete</button>
        <button class="btn-charge" onclick="chargeRemaining('${b._id}')">Charge</button>
        <button onclick="deleteBooking('${b._id}')">❌</button>
        <button onclick="editBooking('${b._id}')">✏️</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

/* ================= REVENUE (UPDATED BALANCE SYSTEM) ================= */
function renderRevenue(data) {

  document.getElementById("revenue").innerText =
    "$" + (data.totalDepositRevenue || 0).toFixed(2);

  document.getElementById("totalBookings").innerText =
    data.totalBookings || 0;

  /* NEW BALANCE DISPLAY (if you add these HTML IDs) */
  const pendingEl = document.getElementById("pendingBalance");
  if (pendingEl) {
    pendingEl.innerText =
      "$" + (data.totalPendingBalance || 0).toFixed(2);
  }

  const totalRevenueEl = document.getElementById("totalRevenue");
  if (totalRevenueEl) {
    totalRevenueEl.innerText =
      "$" + (data.totalDepositRevenue + data.totalPendingBalance).toFixed(2);
  }
}

/* ================= COMPLETE JOB ================= */
async function completeJob(id) {
  try {
    const res = await fetch(`${API}/complete-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: id
      })
    });

    const data = await res.json();
    alert(data.message || "Job completed");

    loadDashboard();
  } catch (err) {
    console.error("Complete error:", err);
  }
}

/* ================= CHARGE REMAINING ================= */
async function chargeRemaining(id) {
  try {
    const res = await fetch(`${API}/pay-remaining`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: id })
    });

    const data = await res.json();

    if (data.success) {
      window.location.href = data.url;
    } else {
      alert(data.message || "Unable to charge");
    }

  } catch (err) {
    console.error("Charge error:", err);
  }
}

/* ================= DELETE BOOKING ================= */
async function deleteBooking(id) {
  if (!confirm("Delete booking?")) return;

  try {
    await fetch(`${API}/book/${id}`, {
      method: "DELETE"
    });

    loadDashboard();
  } catch (err) {
    console.error("Delete error:", err);
  }
}

/* ================= EDIT BOOKING ================= */
async function editBooking(id) {
  const b = bookings.find(x => x._id === id);

  if (!b) return;

  const name = prompt("Name", b.name);
  const service = prompt("Service", b.service);
  const date = prompt("Date", b.date);
  const timeSlot = prompt("Time Slot", b.timeSlot);
  const price = prompt("Price", b.price);

  try {
    await fetch(`${API}/book/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        service,
        date,
        timeSlot,
        price
      })
    });

    loadDashboard();
  } catch (err) {
    console.error("Edit error:", err);
  }
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("adminAuth");
  window.location.href = "login.html";
}