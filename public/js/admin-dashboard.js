const socket = io("https://dmv-cleaning-backend.onrender.com", {
  transports: ["websocket"]
});

let bookings = 0;
let revenue = 0;

// CONNECT
socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);
});

// LIVE BOOKINGS
socket.on("new-booking", () => {
  bookings++;
  document.getElementById("bookings").innerText = bookings;
});

// LIVE PAYMENTS
socket.on("payment-success", (data) => {
  revenue += data.amount || 0;
  document.getElementById("revenue").innerText = "$" + revenue;
});

// TEST
function testBooking() {
  fetch("/api/test-booking", { method: "POST" });
}

function testPayment() {
  fetch("/api/test-payment", { method: "POST" });
}