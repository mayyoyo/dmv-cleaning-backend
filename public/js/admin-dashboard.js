const API = window.API || "https://dmv-cleaning-backend.onrender.com";

/* ================= COPY ================= */
function copyText(text) {
  navigator.clipboard.writeText(text);
  alert("Copied ✔");
}

/* ================= DELETE BOOKING ================= */
async function deleteBooking(id) {
  if (!confirm("Delete this booking?")) return;

  await fetch(`${API}/api/admin/booking/${id}`, {
    method: "DELETE",
    headers: { Authorization: "admin-token" }
  });

  loadDashboard();
}

/* ================= LOAD DASHBOARD ================= */
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/admin/dashboard`);
    const data = await res.json();

    document.getElementById("totalBookings").innerText = data.totalBookings || 0;
    document.getElementById("depositRevenue").innerText = "$" + (data.totalDepositRevenue || 0);
    document.getElementById("pendingBalance").innerText = "$" + (data.totalPendingBalance || 0);

    const table = document.getElementById("tableBody");
    table.innerHTML = "";

    data.bookings.forEach(b => {

      const row = document.createElement("tr");

      row.innerHTML = `
        <td onclick="copyText('${b.name}')">${b.name || "-"}</td>
        <td onclick="copyText('${b.service}')">${b.service || "-"}</td>
        <td onclick="copyText('${b.date}')">${b.date || "-"}</td>
        <td onclick="copyText('${b.timeSlot}')">${b.timeSlot || "-"}</td>
        <td onclick="copyText('${b.paymentStatus}')">${b.paymentStatus || "pending"}</td>
        <td onclick="copyText('$${b.price || 0}')">$${b.price || 0}</td>

        <td>
          <button onclick="deleteBooking('${b._id}')">🗑 Delete</button>
          <button onclick="copyText('${b.name} | ${b.service} | $${b.price || 0}')">📋 Copy</button>
        </td>
      `;

      table.appendChild(row);
    });

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

/* ================= AUTO REFRESH ================= */
loadDashboard();
setInterval(loadDashboard, 5000);