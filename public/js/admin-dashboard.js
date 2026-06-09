const API = "https://dmv-cleaning-backend.onrender.com/api";

const token = localStorage.getItem("adminToken");

/* ================= SECURITY CHECK ================= */
if (!token) {
  window.location.href = "../admin/login.html";
}

/* ================= LOAD ANALYTICS ================= */
async function loadAnalytics() {

  try {

    const res = await fetch(API + "/admin/analytics", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!res.ok) throw new Error("Unauthorized");

    const data = await res.json();

    document.getElementById("revenue").innerText = "$" + (data.revenue || 0);
    document.getElementById("bookings").innerText = data.total || 0;

    /* CHART 1 - SERVICE */
    new Chart(document.getElementById("serviceChart"), {
      type: "bar",
      data: {
        labels: Object.keys(data.services || {}),
        datasets: [{
          label: "Revenue by Service",
          data: Object.values(data.services || {}),
          backgroundColor: "#3b82f6"
        }]
      }
    });

    /* CHART 2 - MONTHLY */
    new Chart(document.getElementById("monthlyChart"), {
      type: "line",
      data: {
        labels: Object.keys(data.monthly || {}),
        datasets: [{
          label: "Monthly Revenue",
          data: Object.values(data.monthly || {}),
          borderColor: "#10b981",
          fill: false
        }]
      }
    });

  } catch (err) {
    console.error(err);
  }
}

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {

  const res = await fetch(API + "/bookings", {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const data = await res.json();

  const tbody = document.querySelector("#table tbody");
  tbody.innerHTML = "";

  data.forEach(b => {

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${b.name || "-"}</td>
      <td>${b.service || "-"}</td>
      <td>${b.date || "-"}</td>
      <td>$${b.total || 0}</td>
      <td>${b.status || "Pending"}</td>
    `;

    tbody.appendChild(row);
  });
}

/* ================= CSV EXPORT ================= */
function exportCSV() {

  let csv = "Name,Service,Date,Total,Status\n";

  document.querySelectorAll("#table tbody tr").forEach(row => {

    const cols = row.querySelectorAll("td");

    csv += Array.from(cols)
      .map(c => `"${c.innerText}"`)
      .join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "bookings.csv";
  a.click();
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("adminToken");
  window.location.href = "../admin/login.html";
}

/* ================= INIT ================= */
loadAnalytics();
loadBookings();