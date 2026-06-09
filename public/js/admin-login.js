const API = "https://dmv-cleaning-backend.onrender.com/api";

async function login() {
  const btn = document.getElementById("loginBtn");
  const error = document.getElementById("error");

  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value.trim();

  error.innerText = "";

  if (!username || !password) {
    error.innerText = "❌ Please fill all fields";
    return;
  }

  btn.disabled = true;
  btn.innerText = "Logging in...";

  try {
    const res = await fetch(API + "/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      error.innerText = data.error || "Login failed";
      btn.disabled = false;
      btn.innerText = "Login";
      return;
    }

    window.location.href = "/admin/dashboard.html";

  } catch (err) {
    console.error(err);
    error.innerText = "❌ Server error (backend not responding)";
  }

  btn.disabled = false;
  btn.innerText = "Login";
}