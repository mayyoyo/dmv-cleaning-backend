const socket = io("https://dmv-cleaning-backend.onrender.com");

let bookings = [];

/* ================= INIT ================= */
socket.on("init-bookings", (data) => {
  bookings = data;
  render();
  updateStats();
  drawChart();
});

/* ================= NEW BOOKING ================= */
socket.on("new-booking", (b) => {
  bookings.unshift(b);
  render();
  updateStats();
  drawChart();
});

/* ================= UPDATE ================= */
socket.on("update-slots", (data) => {
  bookings = data;
  render();
  updateStats();
  drawChart();
});

/* ================= STATS ================= */
function updateStats() {
  const total = bookings.reduce((s, b) => s + (b.total || 0), 0);

  const statsBox = document.getElementById("stats");

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="stat">📦 Total Bookings: ${bookings.length}</div>
      <div class="stat">💰 Total Income: $${total}</div>
    `;
  }
}

/* ================= RENDER ================= */
function render() {
  const box = document.getElementById("dashboard");
  box.innerHTML = "";

  bookings.forEach((b) => {

    const div = document.createElement("div");
    div.className = "card";

    const status = b.status || "Unpaid";
    const statusClass = status === "Paid" ? "paid" : "unpaid";

    div.innerHTML = `
      <h3>${b.name}</h3>

      <p>📅 ${b.date} | ⏰ ${b.timeSlot}</p>
      <p>🧼 ${b.service}</p>
      <p>📍 ${b.address || ""}</p>
      <p>💰 $${b.total || 0}</p>

      <p>Status: <span class="${statusClass}">
        ${status}
      </span></p>

      <button class="charge"
        onclick="chargeCustomer('${b.id}', ${b.total || 0})">
        💳 Charge Customer
      </button>

      <button onclick="downloadInvoice('${b.id}')">
        📥 Invoice PDF
      </button>
    `;

    box.appendChild(div);
  });
}

/* ================= CHARGE CUSTOMER (STRIPE READY) ================= */
async function chargeCustomer(id, amount) {

  if (!confirm("Charge customer $" + amount + "?")) return;

  try {
    const res = await fetch("https://dmv-cleaning-backend.onrender.com/api/charge-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: id,
        amount
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "Payment failed");
    }

    alert("💳 Payment Successful!");

    loadBookings?.();

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
}

/* ================= PDF INVOICE ================= */
function downloadInvoice(id) {
  window.open(
    `https://dmv-cleaning-backend.onrender.com/api/invoice/${id}`,
    "_blank"
  );
}

/* ================= CHART (DAILY INCOME) ================= */
function drawChart() {
  const ctx = document.getElementById("incomeChart");

  if (!ctx || typeof Chart === "undefined") return;

  const daily = {};

  bookings.forEach((b) => {
    const date = b.date;
    daily[date] = (daily[date] || 0) + (b.total || 0);
  });

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(daily),
      datasets: [
        {
          label: "Daily Income",
          data: Object.values(daily),
          backgroundColor: "#111"
        }
      ]
    }
  });
}

/* ================= MENU TOGGLE ================= */
function toggleMenu() {
  document.getElementById("navMenu")?.classList.toggle("active");
}