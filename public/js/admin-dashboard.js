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

  loadBookings();
  setInterval(loadBookings, 5000);
};

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  try {
    const res = await fetch(`${API}/public-bookings`);
    bookings = await res.json();

    renderTable();
    renderRevenue();
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
      <td>${b.id}</td>
      <td>${b.name || "-"}</td>
      <td>${b.email || "-"}</td>
      <td>${b.service}</td>
      <td>${b.date}</td>
      <td>${b.timeSlot}</td>
      <td>${b.status || "pending"}</td>
      <td>$${b.price || 0}</td>
      <td>
        <button class="btn-complete" onclick="completeJob(${b.id})">Complete</button>
        <button class="btn-charge" onclick="chargeRemaining(${b.id})">Charge</button>
        <button onclick="deleteBooking(${b.id})">❌</button>
        <button onclick="editBooking(${b.id})">✏️</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

/* ================= REVENUE ================= */
function renderRevenue() {
  const total = bookings.reduce((sum, b) => sum + Number(b.price || 0), 0);

  document.getElementById("revenue").innerText =
    "$" + total.toFixed(2);

  document.getElementById("totalBookings").innerText =
    bookings.length;
}

/* ================= COMPLETE JOB ================= */
async function completeJob(id) {
  try {
    const res = await fetch(`${API}/complete-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: id,
        customerId: "",
        remainingAmount: 0
      })
    });

    const data = await res.json();

    alert(data.message || "Job completed");
    loadBookings();

  } catch (err) {
    console.error("Complete error:", err);
  }
}

/* ================= CHARGE REMAINING ================= */
async function chargeRemaining(id) {
  alert("Next step: connect Stripe saved card (SetupIntent) for auto charging remaining balance.");
}

/* ================= DELETE BOOKING ================= */
async function deleteBooking(id) {
  if (!confirm("Delete booking?")) return;

  try {
    await fetch(`${API}/book/${id}`, {
      method: "DELETE"
    });

    loadBookings();
  } catch (err) {
    console.error("Delete error:", err);
  }
}

/* ================= EDIT BOOKING ================= */
async function editBooking(id) {
  const b = bookings.find(x => x.id === id);

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

    loadBookings();
  } catch (err) {
    console.error("Edit error:", err);
  }
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("adminAuth");
  window.location.href = "login.html";
}