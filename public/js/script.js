const API = "http://127.0.0.1:3006";

let selectedDate = null;
let bookedSlots = {};
let selectedTimeSlot = "";

/* =========================
   MAIN INIT (SAFE SINGLE DOM LOAD)
========================= */
document.addEventListener("DOMContentLoaded", () => {

  /* ================= NAV MENU ================= */
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("navLinks");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      navLinks.classList.toggle("active");

      hamburger.textContent = navLinks.classList.contains("active")
        ? "✖"
        : "☰";
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("active");
        hamburger.textContent = "☰";
      });
    });
  }

  /* ================= ACTIVE LINK ================= */
  const links = document.querySelectorAll(".nav-links a");
  const currentPage = window.location.pathname.split("/").pop();

  links.forEach(link => {
    const href = link.getAttribute("href");

    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active-link");
    }
  });

  /* ================= CALENDAR ================= */
  const calendarEl = document.getElementById("calendar");

  if (calendarEl && typeof FullCalendar !== "undefined") {

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",

      validRange: {
        start: new Date().toISOString().split("T")[0]
      },

      dateClick: function(info) {
        selectedDate = info.dateStr;

        const el = document.getElementById("selectedDate");
        if (el) el.innerText = "Selected: " + selectedDate;

        loadBookedSlots();
      }
    });

    calendar.render();
    loadBookedSlots();
  }

  /* ================= FOOTER ANIMATION ================= */
  const footer = document.querySelector(".footer");

  if (footer) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          footer.classList.add("show");
        }
      });
    }, { threshold: 0.2 });

    observer.observe(footer);
  }

});

/* =========================
   LOAD BOOKED SLOTS
========================= */
async function loadBookedSlots() {
  try {
    const res = await fetch(`${API}/api/booked-dates`);
    bookedSlots = await res.json();
    updateSlots();
  } catch (err) {
    console.log("LOAD ERROR:", err);
  }
}

/* =========================
   TIME SLOT UPDATE
========================= */
function updateSlots() {

  const select = document.getElementById("timeSlot");
  if (!select || !selectedDate) return;

  const booked = bookedSlots[selectedDate] || [];

  Array.from(select.options).forEach(option => {
    const isBooked = booked.includes(option.value);

    option.disabled = isBooked;
    option.style.color = isBooked ? "#999" : "#000";
  });
}

/* =========================
   SELECT TIME
========================= */
function selectTime(e, slot) {
  selectedTimeSlot = slot;

  document.querySelectorAll(".time-slot").forEach(el => {
    el.classList.remove("active");
  });

  if (e?.target) e.target.classList.add("active");
}

/* =========================
   BOOK NOW (STRIPE FLOW)
========================= */
async function bookNow() {

  if (!selectedDate) {
    alert("Please select a date");
    return;
  }

  const service = document.getElementById("service")?.value;
  const timeSlot = document.getElementById("timeSlot")?.value;

  const name = document.getElementById("name")?.value;
  const phone = document.getElementById("phone")?.value;
  const email = document.getElementById("email")?.value;
  const address = document.getElementById("address")?.value;

  if (!name || !phone || !email || !address) {
    alert("Please fill all fields");
    return;
  }

  const customer = {
    name,
    phone,
    email,
    address,
    date: selectedDate,
    timeSlot
  };

  let total = 120;

  if (service === "Deep Cleaning") total = 200;
  if (service === "Office Cleaning") total = 150;
  if (service === "Move In/Out Cleaning") total = 180;

  try {

    const res = await fetch(`${API}/api/create-booking-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, total, customer })
    });

    const data = await res.json();

    if (!data?.url) {
      alert("Stripe session failed");
      return;
    }

    window.location.href = data.url;

  } catch (err) {
    console.log("SERVER ERROR:", err);
    alert("Server not reachable");
  }
}
// STICKY NAVBAR ACTIVE HIGHLIGHT (ADD TO js/script.js)
// ================= SMOOTH SCROLL =================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();

    const target = document.querySelector(this.getAttribute("href"));

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
});
// SMOOTH SCROLL NAVIGATION (ADD TO js/script.js)
// ================= SMOOTH SCROLL =================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();

    const target = document.querySelector(this.getAttribute("href"));

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
});
// 
// ================= DARK / LIGHT TOGGLE =================
const toggle = document.getElementById("themeToggle");

if (toggle) {
  toggle.addEventListener("click", () => {

    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
      toggle.innerText = "☀️";
    } else {
      toggle.innerText = "🌙";
    }

  });
}