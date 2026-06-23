const API = window.API;

// ================= STATE =================
let selectedDate = null;
let bookedSlots = [];

// ================= PRICE =================
function getServicePrice(service) {
  if (!service) return 120;
  if (service.includes("$120")) return 120;
  if (service.includes("$150")) return 150;
  if (service.includes("$200")) return 200;
  if (service.includes("$250")) return 250;
  return 120;
}

// ================= POPUP =================
function showPopup() {
  document.getElementById("emailPopup").classList.remove("hidden");
}

function hidePopup() {
  document.getElementById("emailPopup").classList.add("hidden");
}

// ================= LOAD CALENDAR (PRO BLOCKING) =================
document.addEventListener("DOMContentLoaded", async () => {

  try {
    const res = await fetch(`${API}/booked-slots`);
    bookedSlots = await res.json();
  } catch (err) {
    console.error("API error:", err);
    bookedSlots = [];
  }

  const events = bookedSlots.map(b => ({
    title: "BOOKED ❌",
    start: b.date,
    color: "red",
    display: "background"
  }));

  const calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView: "dayGridMonth",
      height: 500,
      events,

      dateClick(info) {
        const blocked = bookedSlots.some(b => b.date === info.dateStr);

        if (blocked) {
          alert("❌ This date is fully booked");
          return;
        }

        selectedDate = info.dateStr;
        document.getElementById("selectedDate").innerText =
          "Selected: " + selectedDate;
      }
    }
  );

  calendar.render();
});

// ================= PAY NOW =================
async function handlePayNow() {

  const service = document.getElementById("service").value;
  const email = document.getElementById("email").value;
  const timeSlot = document.getElementById("timeSlot").value;

  if (!service || !email || !selectedDate || !timeSlot) {
    alert("Please fill all fields");
    return;
  }

  const price = getServicePrice(service);

  showPopup();

  try {
    const res = await fetch(`${API}/create-deposit-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service,
        price,
        email,
        date: selectedDate,
        timeSlot
      })
    });

    const data = await res.json();

    hidePopup();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Stripe failed");
    }

  } catch (err) {
    hidePopup();
    alert("Backend not reachable");
  }
}

// ================= PAY LATER =================
async function handlePayLater() {

  const service = document.getElementById("service").value;

  if (!service || !selectedDate) {
    alert("Fill required fields");
    return;
  }

  const price = getServicePrice(service);

  const data = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    address: document.getElementById("address").value,
    service,
    date: selectedDate,
    timeSlot: document.getElementById("timeSlot").value,
    price
  };

  showPopup();

  const res = await fetch(`${API}/book-pay-later`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  hidePopup();

  if (result.success) {
    window.location.href =
      `${window.location.origin}/success.html?session_id=${result.bookingId}`;
  } else {
    alert(result.message || "Booking failed");
  }
}