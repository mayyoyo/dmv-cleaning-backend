const API = "https://dmv-cleaning-backend.onrender.com/api";

/* make sure this exists somewhere */
let selectedDate = null;

async function bookNow(paymentType = "pay_later") {

  if (!selectedDate) return alert("Select date first");

  const data = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    address: document.getElementById("address").value,
    date: selectedDate,
    timeSlot: document.getElementById("timeSlot").value,
    service: document.getElementById("service").value,
    paymentType: paymentType
  };

  if (!data.name || !data.email || !data.timeSlot || !data.service) {
    return alert("Please fill all required fields");
  }

  try {
    const res = await fetch(API + "/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("BACKEND ERROR:", result);
      return alert(result.error || "Booking failed");
    }

    if (result.success && result.bookingId) {
      window.location.href = `/success.html?bookingId=${result.bookingId}`;
    } else {
      alert("Booking failed: Missing booking ID");
    }

  } catch (err) {
    console.error("BOOK ERROR:", err);
    alert("Error: " + err.message);
  }
}