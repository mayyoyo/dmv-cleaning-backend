const API = "http://127.0.0.1:3006";

async function login() {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const msg = document.getElementById("msg");

    msg.innerText = "Logging in...";

    const res = await fetch(API + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    // ❗ handle server errors properly
    if (!res.ok) {
      throw new Error("Server error: " + res.status);
    }

    const data = await res.json();

    console.log("LOGIN RESPONSE:", data);

    if (data.success) {
      msg.style.color = "#22c55e";
      msg.innerText = "Login successful...";

      setTimeout(() => {
        window.location.href = "/admin/dashboard.html";
      }, 800);

    } else {
      msg.style.color = "#ef4444";
      msg.innerText = "Invalid username or password";
    }

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    const msg = document.getElementById("msg");
    msg.innerText = "Server error. Check backend.";
  }
}