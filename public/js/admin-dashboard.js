const API_URL = "https://my-dmv-backend.onrender.com/api/dashboard";

let timer;

// ===============================
// LOAD DASHBOARD DATA
// ===============================
async function loadDashboard() {
  try {
    const res = await fetch(API_URL, {
      credentials: "include"
    });

    if (!res.ok) throw new Error("API error");

    const data = await res.json();

    console.log("Dashboard:", data);

    document.getElementById("revenue").innerText =
      "$" + (data.depositRevenue || 0);

    document.getElementById("bookings").innerText =
      data.totalBookings || 0;

    document.getElementById("profit").innerText =
      "$" + (data.totalProfit || 0);

  } catch (err) {
    console.error("Dashboard load error:", err);
  }
}

// ===============================
// AUTO LOGOUT TIMER (15 MIN)
// ===============================
function resetTimer() {
  clearTimeout(timer);

  timer = setTimeout(() => {
    alert("Session expired");

    fetch("https://my-dmv-backend.onrender.com/api/admin/logout", {
      method: "POST",
      credentials: "include"
    })
    .then(() => {
      window.location.href = "/admin/login.html";
    });

  }, 15 * 60 * 1000); // 15 minutes
}

// ===============================
// ACTIVITY TRACKING
// ===============================
document.addEventListener("mousemove", resetTimer);
document.addEventListener("keydown", resetTimer);
document.addEventListener("click", resetTimer);

// ===============================
// INIT DASHBOARD
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  resetTimer();
});

// ===============================
// AUTO REFRESH
// ===============================
setInterval(loadDashboard, 30000);