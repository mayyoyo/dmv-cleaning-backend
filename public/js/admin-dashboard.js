

const API_URL = "https://dmv-cleaning-backend.onrender.com/api/dashboard";

let timer;

// ===============================
// SHOW / HIDE SPINNER
// ===============================
function showSpinner() {
  const spinner = document.getElementById("spinner");
  if (spinner) spinner.classList.remove("hidden");
}

function hideSpinner() {
  const spinner = document.getElementById("spinner");
  if (spinner) spinner.classList.add("hidden");
}

// ===============================
// AUTH CHECK (ONLY ONE VERSION - FIXED)
// ===============================
async function checkAuth() {
  try {
    const res = await fetch(API_URL, {
      credentials: "include"
    });

    if (!res.ok) {
      window.location.href = "/admin/login.html";
      return;
    }

    const data = await res.json();

    console.log("Dashboard loaded:", data);

    const bookingsEl = document.getElementById("bookings");
    const customersEl = document.getElementById("customers");
    const profitEl = document.getElementById("profit");

    if (bookingsEl) bookingsEl.innerText = data.totalBookings;
    if (customersEl) customersEl.innerText = data.totalCustomers;
    if (profitEl) profitEl.innerText = "$" + data.totalProfit;

  } catch (err) {
    console.error(err);
    window.location.href = "/admin/login.html";
  }
}

// ===============================
// LOAD DASHBOARD DATA
// ===============================
async function loadDashboard() {
  try {
    showSpinner();

    const res = await fetch(API_URL, {
      credentials: "include"
    });

    if (!res.ok) {
      window.location.href = "/admin/login.html";
      return;
    }

    const data = await res.json();

    const revenueEl = document.getElementById("revenue");
    const bookingsEl = document.getElementById("bookings");
    const profitEl = document.getElementById("profit");

    if (revenueEl) revenueEl.innerText = "$" + (data.depositRevenue || 0);
    if (bookingsEl) bookingsEl.innerText = data.totalBookings || 0;
    if (profitEl) profitEl.innerText = "$" + (data.totalProfit || 0);

  } catch (err) {
    console.error("Dashboard error:", err);
    window.location.href = "/admin/login.html";
  } finally {
    hideSpinner();
  }
}

// ===============================
// AUTO LOGOUT TIMER
// ===============================
function resetTimer() {
  clearTimeout(timer);

  timer = setTimeout(() => {
    alert("Session expired");

    fetch("https://dmv-cleaning-backend.onrender.com/api/admin/logout", {
      method: "GET",
      credentials: "include"
    }).then(() => {
      window.location.href = "/admin/login.html";
    });

  }, 15 * 60 * 1000);
}

// ===============================
// ACTIVITY TRACKING
// ===============================
document.addEventListener("mousemove", resetTimer);
document.addEventListener("keydown", resetTimer);
document.addEventListener("click", resetTimer);

// ===============================
// INIT (CLEAN ORDER)
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  loadDashboard();
  resetTimer();
});

// ===============================
// AUTO REFRESH DASHBOARD
// ===============================
setInterval(loadDashboard, 30000);

```
