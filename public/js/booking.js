const API = "https://dmv-cleaning-backend.onrender.com/api";

async function bookNow() {

  const res = await fetch(API + "/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email,
      phone,
      address,
      date: selectedDate,
      timeSlot,
      service
    })
  });

  const data = await res.json();

  if (!res.ok) {
    return alert(data.error || "Booking failed");
  }

  alert("Booking successful!");

  // ✅ THIS IS THE ONLY REQUIRED LINE
  window.location.href = "/success.html?bookingId=" + data.bookingId;
}