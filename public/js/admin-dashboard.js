const API = window.API || "https://dmv-cleaning-backend.onrender.com/api";

/* ================= LOAD DASHBOARD ================= */
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/admin/dashboard`);
    const data = await res.json();

    document.getElementById("totalBookings").innerText = data.totalBookings || 0;
    document.getElementById("depositRevenue").innerText = "$" + (data.totalDepositRevenue || 0);
    document.getElementById("pendingBalance").innerText = "$" + (data.totalPendingBalance || 0);

    const table = document.getElementById("tableBody");
    table.innerHTML = "";

    data.bookings.forEach(b => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${b.name || "-"}</td>
        <td>${b.service || "-"}</td>
        <td>${b.date || "-"}</td>
        <td>${b.timeSlot || "-"}</td>
        <td>${b.paymentStatus || "pending"}</td>
        <td>$${b.price || 0}</td>
      `;

      table.appendChild(row);
    });

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

/* ================= LIVE AUTO UPDATE ================= */
loadDashboard();
setInterval(loadDashboard, 5000);