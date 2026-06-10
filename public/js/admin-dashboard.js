const socket = io("https://dmv-cleaning-backend.onrender.com");

let bookings = [];

/* ================= INIT ================= */
socket.on("init-bookings", (data) => {
  bookings = data;
  render();
});

/* ================= NEW BOOKING ================= */
socket.on("new-booking", (b) => {
  bookings.unshift(b);
  render();
  flash();
});

/* ================= REAL-TIME UPDATE ================= */
socket.on("update-slots", (data) => {
  bookings = data;
  render();
  flash();
});

/* ================= RENDER DASHBOARD ================= */
function render() {

  const box = document.getElementById("dashboard");
  box.innerHTML = "";

  bookings.forEach(b => {

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${b.name}</h3>
      <p>📅 ${b.date} | ⏰ ${b.timeSlot}</p>
      <p>🧼 ${b.service}</p>
      <p>📍 ${b.address}</p>
      <p>💰 $${b.total}</p>
      <p>Status: ${b.status}</p>
    `;

    box.appendChild(div);
  });
}

/* ================= FLASH ANIMATION ================= */
function flash() {
  document.body.classList.add("flash");

  setTimeout(() => {
    document.body.classList.remove("flash");
  }, 200);
}