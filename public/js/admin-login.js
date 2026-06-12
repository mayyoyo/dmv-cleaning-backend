const API = "https://dmv-cleaning-backend.onrender.com/api";

async function login() {

  try {

    const res = await fetch(API + "/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "Login failed");
    }

    localStorage.setItem("token", data.token);

    alert("Login success ✅");

    window.location.href = "/admin/dashboard.html";

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    alert("Server error");
  }
}