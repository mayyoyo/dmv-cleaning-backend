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
// AUTH CHECK (NEW ADDED)
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

    document.getElementById("bookings").innerText = data.totalBookings;
    document.getElementById("customers").innerText = data.totalCustomers;
    document.getElementById("profit").innerText = "$" + data.totalProfit;

  } catch (err) {
    console.error(err);
    window.location.href = "/admin/login.html";
  }
}

// ===============================
// LOAD DASHBOARD DATA (WITH LOADING)
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

    document.getElementById("revenue").innerText =
      "$" + (data.depositRevenue || 0);

    document.getElementById("bookings").innerText =
      data.totalBookings || 0;

    document.getElementById("profit").innerText =
      "$" + (data.totalProfit || 0);

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
      method: "POST",
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
// INIT PAGE
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();        // 🔥 NEW (AUTH FIRST)
  loadDashboard();    // LOAD DATA
  resetTimer();       // START TIMER
});

// ===============================
// AUTO REFRESH DASHBOARD
// ===============================
setInterval(loadDashboard, 30000);