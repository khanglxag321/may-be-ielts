(function () {
  "use strict";

  const STORAGE_KEY = "maybe_team_google_session_v1";
  const REMEMBER_KEY = "maybe_team_remembered_account_v1";

  // Storage can be blocked (private browsing, device policy, full quota).
  function readStore(store, key) {
    try { return JSON.parse(window[store].getItem(key) || "null"); } catch { return null; }
  }
  function writeStore(store, key, value) {
    try { window[store].setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function removeStore(store, key) {
    try { window[store].removeItem(key); } catch { /* unavailable storage */ }
  }
  function rememberAccount(session) {
    const claims = decodeCredential(session.credential);
    if (claims && claims.aud === config().googleClientId && claims.sub) {
      writeStore("localStorage", REMEMBER_KEY, { loginHint: String(claims.sub) });
    }
  }
  function getLoginHint() {
    const remembered = readStore("localStorage", REMEMBER_KEY);
    return remembered && typeof remembered.loginHint === "string" ? remembered.loginHint : "";
  }
  function saveSession(session) {
    if (session.demo) {
      writeStore("sessionStorage", STORAGE_KEY, session);
      return;
    }
    rememberAccount(session);
    if (writeStore("localStorage", STORAGE_KEY, session)) removeStore("sessionStorage", STORAGE_KEY);
    else writeStore("sessionStorage", STORAGE_KEY, session);
  }

  function config() {
    return window.MAYBE_TEAM_CONFIG || { googleClientId: "", scheduleApiUrl: "" };
  }

  function isConfigured() {
    const clientId = String(config().googleClientId || "");
    const apiUrl = String(config().scheduleApiUrl || "");
    return clientId.includes(".apps.googleusercontent.com") &&
      !clientId.startsWith("PASTE_") &&
      /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl);
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function decodeCredential(credential) {
    try {
      const parts = String(credential || "").split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
      return null;
    }
  }

  async function createSession(credential) {
    const claims = decodeCredential(credential);
    const expectedAudience = config().googleClientId;
    const now = Math.floor(Date.now() / 1000);
    if (!claims || claims.aud !== expectedAudience || !Number.isFinite(claims.exp) || claims.exp <= now || claims.email_verified !== true || !claims.email) {
      throw new Error("Google không trả về phiên đăng nhập hợp lệ.");
    }
    const response = await fetch(config().scheduleApiUrl, {
      method: "POST",
      body: JSON.stringify({ action: "AUTH_ME", idToken: credential })
    });
    if (!response.ok) throw new Error("Không kết nối được hệ thống phân quyền.");
    const result = await response.json();
    if (result.status !== "success" || !result.user) {
      throw new Error(result.message || "Tài khoản Google này chưa được cấp quyền vào hệ thống.");
    }
    const profile = result.user;
    if (String(profile.email || "").toLowerCase() !== String(claims.email || "").toLowerCase()) {
      throw new Error("Thông tin tài khoản từ máy chủ không khớp.");
    }
    const session = {
      credential,
      email: claims.email.toLowerCase(),
      picture: claims.picture || "",
      name: profile.name || claims.name || claims.email,
      role: profile.role === "manager" ? "manager" : "teacher",
      teacherId: profile.teacherId || "",
      expiresAt: claims.exp * 1000,
      demo: false
    };
    saveSession(session);
    return session;
  }

  function getSession() {
    // Migrate existing tab sessions; demo sessions must never survive the tab.
    for (const store of ["localStorage", "sessionStorage"]) {
      const session = readStore(store, STORAGE_KEY);
      if (!session) continue;
      const expiresAt = Number(session.expiresAt);
      const claims = decodeCredential(session.credential);
      const validAccount = session.demo
        ? store === "sessionStorage" && isLocalPreview()
        : claims && claims.aud === config().googleClientId && claims.email_verified === true &&
          String(claims.email || "").toLowerCase() === session.email && Number.isFinite(claims.exp);
      if (validAccount && !session.demo) rememberAccount(session);
      if (!session.email || !validAccount || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
          (!session.demo && claims.exp * 1000 <= Date.now())) {
        removeStore(store, STORAGE_KEY);
        continue;
      }
      if (!session.demo && store === "sessionStorage") saveSession(session);
      if (!session.demo) session.picture = claims.picture || session.picture || "";
      return session;
    }
    return null;
  }

  function isLocalPreview() {
    return location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  }

  function createDemoSession(teacherId, role) {
    if (!isLocalPreview()) throw new Error("Chế độ demo chỉ dùng trên máy cá nhân.");
    const names = { bach: "Hồ Bách", nhi: "Tuệ Nhi", khang: "Gia Khang" };
    const session = {
      credential: "",
      email: `${teacherId}@demo.local`,
      picture: "",
      name: names[teacherId] || "Thành viên MAYBE",
      role: role === "manager" ? "manager" : "teacher",
      teacherId,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      demo: true
    };
    saveSession(session);
    return session;
  }

  function logout(returnTo) {
    removeStore("sessionStorage", STORAGE_KEY);
    removeStore("localStorage", STORAGE_KEY);
    removeStore("localStorage", REMEMBER_KEY);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    location.href = returnTo || "index.html";
  }

  function requireSession() {
    const session = getSession();
    if (!session) {
      const current = location.pathname.split("/").pop() || "index.html";
      location.replace(`index.html?returnTo=${encodeURIComponent(current)}`);
      throw new Error("AUTH_REQUIRED");
    }
    return session;
  }

  let renewal = null;
  function avatarMarkup(session) {
    const initials = String(session.name || 'M').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
    const escape = text => String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    return /^https:\/\//.test(session.picture || '')
      ? `<img src="${escape(session.picture)}" alt="${escape(initials)}" referrerpolicy="no-referrer">`
      : escape(initials);
  }

  async function ensureSession() {
    const current = getSession();
    if (current) return current;
    if (!getLoginHint()) return requireSession();
    if (renewal) return renewal;
    // A stored Google token cannot be extended. Obtain and verify a fresh one,
    // keeping the current page/form in place if Google needs a confirmation.
    renewal = new Promise((resolve) => {
      const panel = document.createElement('div');
      panel.className = 'session-restore';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Khôi phục đăng nhập');
      panel.innerHTML = '<div class="session-restore-card"><strong>Chào mừng bạn trở lại.</strong><p class="session-restore-message">Đang khôi phục tài khoản Google đã lưu…</p><div class="session-restore-google"></div><a href="index.html">Về trang đăng nhập</a></div>';
      document.body.appendChild(panel);
      const message = panel.querySelector('.session-restore-message');
      let started = false;
      function initialize() {
        if (started || !window.google?.accounts?.id) return;
        started = true;
        google.accounts.id.initialize({
          client_id: config().googleClientId,
          login_hint: getLoginHint(),
          auto_select: true,
          button_auto_select: true,
          callback: async response => {
            try {
              const session = await createSession(response.credential);
              panel.remove();
              resolve(session);
            } catch (error) { message.textContent = error.message; }
          }
        });
        google.accounts.id.renderButton(panel.querySelector('.session-restore-google'), {theme:'outline',size:'large',shape:'pill',text:'continue_with',width:280});
        message.textContent = 'Nếu Google yêu cầu xác nhận, chọn tài khoản bên dưới để tiếp tục.';
        google.accounts.id.prompt();
      }
      if (window.google?.accounts?.id) initialize();
      else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = initialize;
        script.onerror = () => {message.textContent = 'Chưa kết nối được Google. Vui lòng tải lại trang.';};
        document.head.appendChild(script);
      }
    });
    try { return await renewal; } finally { renewal = null; }
  }

  function safeReturnTo() {
    const value = new URLSearchParams(location.search).get("returnTo") || "";
    return ["admin.html", "students.html"].includes(value) ? value : "";
  }

  window.MaybeTeamAuth = Object.freeze({
    createDemoSession,
    createSession,
    ensureSession,
    avatarMarkup,
    getSession,
    getLoginHint,
    isConfigured,
    isLocalPreview,
    logout,
    requireSession,
    safeReturnTo
  });
})();
