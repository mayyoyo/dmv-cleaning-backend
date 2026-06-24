const API = window.API || "https://dmv-cleaning-backend.onrender.com";

/* ================= LOGIN ================= */
async function login() {

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const msg = document.getElementById("msg");

  if (!username || !password) {
    msg.innerText = "Please fill all fields";
    return;
  }

  try {

    const res = await fetch(`${API}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {

      localStorage.setItem("adminToken", data.token);

      window.location.href = "/admin/dashboard.html";

    } else {
      msg.innerText = data.message || "Login failed";
    }

  } catch (err) {
    console.error(err);
    msg.innerText = "Server error";
  }
}