const API = "https://dmv-cleaning-backend.onrender.com/api";

let selectedDate = "";

/* ================= CALENDAR ================= */
document.addEventListener("DOMContentLoaded", function () {

  const calendarEl = document.getElementById("calendar");

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    selectable: true,

    dateClick: function (info) {
      selectedDate = info.dateStr;

      document.getElementById("selectedDate").innerText =
        "Selected Date: " + selectedDate;
    }
  });

  calendar.render();

});

/* ================= BOOKING ================= */
document.getElementById("bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!selectedDate) {
    alert("Please select a date");
    return;
  }

  const data = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    address: document.getElementById("address").value,
    service: document.getElementById("service").value,
    date: selectedDate,
    timeSlot: document.getElementById("timeSlot").value
  };

  try {
    const res = await fetch(API + "/book", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error("Booking failed");

    alert("✅ Booking Confirmed!");
    document.getElementById("bookingForm").reset();
    document.getElementById("selectedDate").innerText = "No date selected";

  } catch (err) {
    console.error(err);
    alert("❌ Error booking service");
  }
});