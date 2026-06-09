const API = "https://dmv-cleaning-backend.onrender.com/api";

let timer;

/* ================= AUTH ================= */
async function checkAuth() {
  try {
    const res = await fetch(API + "/dashboard", {
      credentials: "include"
    });

    if (!res.ok) {
      window.location.href = "/admin/login.html";
      return;
    }

    const data = await res.json();

    document.getElementById("bookings").innerText = data.totalBookings || 0;
    document.getElementById("customers").innerText = data.totalCustomers || 0;
    document.getElementById("profit").innerText = "$" + (data.totalProfit || 0);

  } catch (err) {
    window.location.href = "/admin/login.html";
  }
}

/* ================= LOAD BOOKINGS ================= */
async function loadBookings() {
  try {
    const res = await fetch(API + "/bookings", {
      credentials: "include"
    });

    if (!res.ok) return;

    const bookings = await res.json();

    const table = document.getElementById("bookingTable");
    table.innerHTML = "";

    bookings.forEach(b => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${b.name}</td>
        <td>${b.phone}</td>
        <td>${b.service}</td>
        <td>${b.date}</td>
        <td>${b.timeSlot}</td>
        <td>
          <select class="status" data-id="${b.id}">
            <option value="Pending" ${b.status === "Pending" ? "selected" : ""}>Pending</option>
            <option value="Confirmed" ${b.status === "Confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="Done" ${b.status === "Done" ? "selected" : ""}>Done</option>
          </select>
        </td>
      `;

      table.appendChild(row);
    });

    bindStatusEvents();

  } catch (err) {
    console.error(err);
  }
}

/* ================= UPDATE STATUS ================= */
function bindStatusEvents() {
  document.querySelectorAll(".status").forEach(select => {
    select.addEventListener("change", async function () {
      const id = this.dataset.id;
      const status = this.value;

      await fetch(API + "/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ id, status })
      });
    });
  });
}

/* ================= LOGOUT ================= */
function setupLogout() {
  const btn = document.getElementById("logoutBtn");

  if (!btn) return;

  btn.addEventListener("click", async () => {
    await fetch(API + "/admin/logout", {
      credentials: "include"
    });

    window.location.href = "/admin/login.html";
  });
}

/* ================= AUTO LOGOUT ================= */
function resetTimer() {
  clearTimeout(timer);

  timer = setTimeout(async () => {
    alert("Session expired");

    await fetch(API + "/admin/logout", {
      credentials: "include"
    });

    window.location.href = "/admin/login.html";
  }, 15 * 60 * 1000);
}

document.addEventListener("mousemove", resetTimer);
document.addEventListener("keydown", resetTimer);
document.addEventListener("click", resetTimer);

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  loadBookings();
  setupLogout();
  resetTimer();
});

/* ================= AUTO REFRESH ================= */
setInterval(loadBookings, 30000);