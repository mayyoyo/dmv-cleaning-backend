let selectedDate = null;

document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
  handleForm();
});

/* CALENDAR */
function initCalendar() {

  const calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView: "dayGridMonth",
      height: 500,

      dateClick: async (info) => {

        selectedDate = info.dateStr;

        document.getElementById("selectedDate").innerText =
          "Selected: " + selectedDate;

        loadSlots();
      }
    }
  );

  calendar.render();
}

/* LOAD BOOKED SLOTS */
async function loadSlots() {

  if (!selectedDate) return;

  const res = await fetch(API + "/public-bookings");
  const bookings = await res.json();

  const select = document.getElementById("timeSlot");

  Array.from(select.options).forEach(opt => {

    if (!opt.value) return;

    const booked = bookings.find(
      b => b.date === selectedDate && b.timeSlot === opt.value
    );

    if (booked) {
      opt.disabled = true;
      opt.textContent = opt.value + " (Booked)";
    } else {
      opt.disabled = false;
      opt.textContent = opt.value;
    }

  });
}

/* FORM */
function handleForm() {

  document
    .getElementById("bookingForm")
    .addEventListener("submit", async (e) => {

      e.preventDefault();

      const data = {
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim(),
        address: address.value.trim(),
        timeSlot: timeSlot.value,
        service: service.value,
        paymentType: paymentType.value,
        date: selectedDate
      };

      if (!selectedDate) return alert("Select date");
      if (!data.timeSlot) return alert("Select time");

      const res = await fetch(API + "/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.status === 409) {
        alert("Slot already booked");
        loadSlots();
        return;
      }

      if (!res.ok) {
        return alert(result.error);
      }

      alert("Booking confirmed!");

      window.location.href =
        "https://mydmvcleaningservice.com/success.html?bookingId=" +
        result.bookingId;
    });
}