const API = "https://dmv-cleaning-backend.onrender.com";

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

    if (data.success) {
      localStorage.setItem("token", data.token);
      window.location.href = "/admin/dashboard.html";
    } else {
      alert(data.error || "Invalid login");
    }

  } catch (err) {
    console.error(err);
    alert("Server error");
  }
}