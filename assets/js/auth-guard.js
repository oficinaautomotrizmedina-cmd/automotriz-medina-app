(function () {
  const USER = "ATM";
  const PASS = "atm241290";
  const AUTH_KEY = "am_auth_device_ok_v1";
  const protectedFiles = new Set([
    "admin.html",
    "empleado.html",
    "autorizacion-rapida.html",
    "modulo-master-taller.html",
    "modulo-empleados-rapido-taller.html"
  ]);

  function currentFile() {
    const path = String(location.pathname || "").replace(/\\/g, "/");
    return path.split("/").pop() || "";
  }

  function isProtectedPage() {
    return protectedFiles.has(currentFile());
  }

  function isAuthorized() {
    return localStorage.getItem(AUTH_KEY) === "1";
  }

  function markAuthorized() {
    localStorage.setItem(AUTH_KEY, "1");
  }

  function injectStyles() {
    if (document.getElementById("am-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "am-auth-styles";
    style.textContent = `
      body.am-auth-locked > :not(.am-auth-overlay) {
        filter: blur(6px);
        pointer-events: none;
        user-select: none;
      }
      .am-auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(32, 87, 104, .42), rgba(8, 15, 25, .88));
        padding: 20px;
      }
      .am-auth-card {
        width: min(430px, calc(100vw - 32px));
        background: #ffffff;
        color: #172331;
        border: 1px solid #d5e0ea;
        border-radius: 10px;
        box-shadow: 0 30px 90px rgba(0,0,0,.32);
        padding: 26px;
      }
      .am-auth-card h2 {
        margin: 0 0 6px;
        font-size: 24px;
      }
      .am-auth-card p {
        margin: 0 0 18px;
        color: #5c6d7f;
      }
      .am-auth-card label {
        display: block;
        font-weight: 700;
        margin-top: 12px;
      }
      .am-auth-card input {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        border: 1px solid #cfdbe7;
        border-radius: 8px;
        padding: 13px 14px;
        font: inherit;
      }
      .am-auth-card button {
        width: 100%;
        margin-top: 18px;
        border: 0;
        border-radius: 8px;
        background: #1f7f89;
        color: #fff;
        padding: 13px 16px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .am-auth-error {
        min-height: 20px;
        margin-top: 12px;
        color: #bd2631;
        font-weight: 700;
      }
      [data-theme="dark"] .am-auth-card {
        background: #141d28;
        color: #eef6fb;
        border-color: #314358;
      }
      [data-theme="dark"] .am-auth-card p {
        color: #b8c8d8;
      }
      [data-theme="dark"] .am-auth-card input {
        background: #0f1722;
        color: #eef6fb;
        border-color: #314358;
      }
    `;
    document.head.appendChild(style);
  }

  function unlock(overlay) {
    document.body.classList.remove("am-auth-locked");
    overlay?.remove();
  }

  function showLogin() {
    injectStyles();
    document.body.classList.add("am-auth-locked");
    const overlay = document.createElement("div");
    overlay.className = "am-auth-overlay";
    overlay.innerHTML = `
      <form class="am-auth-card" data-am-auth-form>
        <h2>Acceso autorizado</h2>
        <p>Ingrese usuario y contraseña para continuar.</p>
        <label>Usuario
          <input data-am-auth-user autocomplete="username" autofocus>
        </label>
        <label>Contraseña
          <input data-am-auth-pass type="password" autocomplete="current-password">
        </label>
        <button type="submit">Ingresar</button>
        <div class="am-auth-error" data-am-auth-error></div>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("[data-am-auth-form]");
    const user = overlay.querySelector("[data-am-auth-user]");
    const pass = overlay.querySelector("[data-am-auth-pass]");
    const error = overlay.querySelector("[data-am-auth-error]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (String(user.value || "").trim().toUpperCase() === USER && String(pass.value || "") === PASS) {
        markAuthorized();
        unlock(overlay);
        return;
      }
      error.textContent = "Usuario o contraseña incorrectos.";
      pass.value = "";
      pass.focus();
    });
  }

  function init() {
    if (!isProtectedPage() || isAuthorized()) return;
    showLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
