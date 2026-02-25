// SIGNUP
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      window.location.href = "login.html";
    }
  });
}

// LOGIN
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);
    const data = Object.fromEntries(formData);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (result.token) {
      localStorage.setItem("token", result.token);
      window.location.href = "/dashboard";
    }
  });
}

// DASHBOARD CHECK
if (window.location.pathname === "/dashboard") {

  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "login.html";
  } else {
    const payload = JSON.parse(atob(token.split(".")[1]));
    document.getElementById("welcome").innerText =
      "Welcome " + payload.name;
  }
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}