const API = "https://dmv-cleaning-backend.onrender.com/api";

let bookings = [];

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  const res = await fetch(API + "/public-bookings");
  bookings = await res.json();

  renderTable();
  renderRevenue();
}

/* ================= TABLE ================= */
function renderTable() {
  const tbody = document.getElementById("data");
  tbody.innerHTML = "";

  bookings.forEach(b => {

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${b.name}</td>
      <td>${b.email}</td>
      <td>${b.service}</td>
      <td>${b.date}</td>
      <td>${b.timeSlot}</td>
      <td>$${b.price}</td>
      <td>
        <button onclick="deleteBooking(${b.id})">❌ Delete</button>
        <button onclick="editBooking(${b.id})">✏️ Edit</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

/* ================= REVENUE ================= */
function renderRevenue() {
  const total = bookings.reduce((sum, b) => sum + Number(b.price || 0), 0);

  document.getElementById("revenue").innerText =
    "💰 Total Revenue: $" + total.toFixed(2);
}

/* ================= DELETE ================= */
async function deleteBooking(id) {
  if (!confirm("Delete this booking?")) return;

  await fetch(API + "/book/" + id, {
    method: "DELETE"
  });

  loadBookings();
}

/* ================= EDIT ================= */
async function editBooking(id) {

  const b = bookings.find(x => x.id === id);

  const name = prompt("Name", b.name);
  const service = prompt("Service", b.service);
  const date = prompt("Date", b.date);
  const timeSlot = prompt("Time Slot", b.timeSlot);
  const price = prompt("Price", b.price);

  await fetch(API + "/book/" + id, {
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
}

/* ================= AUTO REFRESH ================= */
loadBookings();
setInterval(loadBookings, 5000);