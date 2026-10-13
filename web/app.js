const DEFAULT_API =
  localStorage.getItem("vardapp_api") ||
  "https://szonscraperapi.netlify.app".includes("unused")
    ? "http://vardapp.onrender.com"
    : "http://vardapp.onrender.com";

const state = {
  api: localStorage.getItem("vardapp_api") || "http://vardapp.onrender.com",
  token: localStorage.getItem("vardapp_token") || "",
  profile: null,
  newsSource: "kisvarda",
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
  selected: {
    y: new Date().getFullYear(),
    m: new Date().getMonth(),
    d: new Date().getDate()
  },
  nevnapok: {},
  notes: [],
  editingNote: null,
  authMode: "login"
};

const $ = (id) => document.getElementById(id);

function greetingText(name) {
  const h = new Date().getHours();
  let g = "Szép napot";
  if (h < 5) g = "Jó éjszakát";
  else if (h < 10) g = "Jó reggelt";
  else if (h < 18) g = "Szép napot";
  else if (h < 22) g = "Szép estét";
  else g = "Jó éjszakát";
  return name ? `${g}, ${name}!` : `${g}!`;
}

async function api(path, opts = {}) {
  const headers = { Accept: "application/json", ...(opts.headers || {}) };
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${state.api.replace(/\/$/, "")}${path}`, {
    ...opts,
    headers
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ---- Tabs ---- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`panel-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "notes") loadNotes();
  });
});

/* ---- News ---- */
document.querySelectorAll(".source").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".source").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.newsSource = btn.dataset.source;
    loadNews();
  });
});

async function loadNews() {
  const list = $("news-list");
  const loading = $("news-loading");
  const err = $("news-error");
  list.innerHTML = "";
  err.classList.add("hidden");
  loading.classList.remove("hidden");

  const isSzon = state.newsSource === "szon";
  $("news-title").textContent = isSzon ? "Szabolcs hírek" : "Friss hírek";
  $("news-sub").textContent = isSzon ? "Forrás: szon.hu" : "Forrás: kisvarda.hu";

  try {
    const path = isSzon ? "/api/szon-news" : "/api/news";
    const data = await api(path);
    const items = data.items || [];
    if (data.fetchedAt) {
      $("news-meta").textContent = new Date(data.fetchedAt).toLocaleString("hu-HU");
    }
    if (!items.length) {
      list.innerHTML = `<p class="muted">Nincs megjeleníthető hír.</p>`;
    } else {
      list.innerHTML = items
        .map(
          (n) => `
        <article class="card">
          <a href="${n.url || "#"}" target="_blank" rel="noopener">
            <h3>${escapeHtml(n.title || "")}</h3>
            ${n.excerpt ? `<p class="excerpt">${escapeHtml(n.excerpt)}</p>` : ""}
            <p class="date">${escapeHtml(n.date || n.source || "")}</p>
          </a>
        </article>`
        )
        .join("");
    }
  } catch (e) {
    err.textContent =
      e.message +
      " — Ellenőrizd az API URL-t (Egyéb fül), és hogy a szerver fut-e (pl. Render).";
    err.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---- Calendar / névnap ---- */
const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const MONTHS = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December"
];

async function loadNevnapok() {
  try {
    const res = await fetch("nevnapok.json");
    state.nevnapok = await res.json();
  } catch {
    state.nevnapok = {};
  }
}

function nameDays(month, day) {
  const e = state.nevnapok?.[String(month)]?.[String(day)];
  return {
    main: e?.main || [],
    other: e?.other || []
  };
}

function renderCalendar() {
  const { y, m } = state.cal;
  $("cal-month").textContent = `${MONTHS[m]} ${y}`;
  $("cal-weekdays").innerHTML = WEEKDAYS.map((w) => `<span>${w}</span>`).join("");

  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  let html = "";

  for (let i = 0; i < startPad; i++) html += `<button type="button" class="cal-day empty" disabled></button>`;
  for (let d = 1; d <= days; d++) {
    const nd = nameDays(m + 1, d);
    const has = nd.main.length || nd.other.length;
    const isToday =
      today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    const isSel =
      state.selected.y === y && state.selected.m === m && state.selected.d === d;
    const cls = [
      "cal-day",
      isToday ? "today" : "",
      isSel ? "selected" : "",
      has ? "has-name" : ""
    ]
      .filter(Boolean)
      .join(" ");
    html += `<button type="button" class="${cls}" data-day="${d}">${d}</button>`;
  }
  $("cal-grid").innerHTML = html;
  $("cal-grid").querySelectorAll("[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selected = { y, m, d: Number(btn.dataset.day) };
      renderCalendar();
      showNevnap();
    });
  });
  showNevnap();
}

function showNevnap() {
  const { y, m, d } = state.selected;
  const nd = nameDays(m + 1, d);
  const main = nd.main.join(", ") || "—";
  const other = nd.other.join(", ");
  $("nevnap-main").textContent = main;
  $("nevnap-other").textContent = other
    ? `Egyéb: ${other}`
    : `${y}. ${MONTHS[m]} ${d}.`;
}

$("cal-prev").addEventListener("click", () => {
  state.cal.m--;
  if (state.cal.m < 0) {
    state.cal.m = 11;
    state.cal.y--;
  }
  renderCalendar();
});
$("cal-next").addEventListener("click", () => {
  state.cal.m++;
  if (state.cal.m > 11) {
    state.cal.m = 0;
    state.cal.y++;
  }
  renderCalendar();
});

/* ---- Auth ---- */
function updateProfileUi() {
  const name = state.profile?.name || "";
  $("greeting").textContent = greetingText(name);
  if (state.profile?.loggedIn) {
    $("btn-auth").textContent = name || "Fiók";
    $("profile-line").textContent = `${name} · ${state.profile.email || ""}`;
    $("btn-logout").classList.remove("hidden");
    $("btn-new-note").disabled = false;
    $("notes-hint").textContent = "A jegyzetek a szerveren tárolódnak.";
  } else {
    $("btn-auth").textContent = "Belépés";
    $("profile-line").textContent = "Nincs bejelentkezve";
    $("btn-logout").classList.add("hidden");
    $("btn-new-note").disabled = true;
    $("notes-hint").textContent = "Jelentkezz be a jegyzetek szinkronizálásához.";
  }
}

$("btn-auth").addEventListener("click", () => {
  if (state.profile?.loggedIn) {
    document.querySelector('.tab[data-tab="more"]').click();
    return;
  }
  state.authMode = "login";
  syncAuthForm();
  $("auth-modal").showModal();
});

$("auth-close").addEventListener("click", () => $("auth-modal").close());
$("auth-toggle").addEventListener("click", () => {
  state.authMode = state.authMode === "login" ? "register" : "login";
  syncAuthForm();
});

function syncAuthForm() {
  const reg = state.authMode === "register";
  $("auth-title").textContent = reg ? "Regisztráció" : "Belépés";
  $("auth-submit").textContent = reg ? "Regisztráció" : "Belépés";
  $("auth-toggle").textContent = reg ? "Belépés" : "Regisztráció";
  $("auth-name").parentElement.style.display = reg ? "block" : "none";
  $("auth-error").classList.add("hidden");
}

$("auth-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("auth-error").classList.add("hidden");
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const name = $("auth-name").value.trim();
  try {
    const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body =
      state.authMode === "register"
        ? { email, password, name }
        : { email, password };
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    state.token = data.token || "";
    localStorage.setItem("vardapp_token", state.token);
    state.profile = {
      name: data.user?.name || name || "",
      email: data.user?.email || email,
      loggedIn: true
    };
    $("auth-modal").close();
    updateProfileUi();
    loadNotes();
  } catch (e) {
    $("auth-error").textContent = e.message;
    $("auth-error").classList.remove("hidden");
  }
});

$("btn-logout").addEventListener("click", () => {
  state.token = "";
  state.profile = null;
  state.notes = [];
  localStorage.removeItem("vardapp_token");
  updateProfileUi();
  $("notes-list").innerHTML = "";
});

async function trySession() {
  if (!state.token) {
    updateProfileUi();
    return;
  }
  try {
    const me = await api("/api/auth/me");
    state.profile = {
      name: me.user?.name || me.name || "",
      email: me.user?.email || me.email || "",
      loggedIn: true
    };
  } catch {
    state.token = "";
    localStorage.removeItem("vardapp_token");
    state.profile = null;
  }
  updateProfileUi();
}

/* ---- Notes ---- */
async function loadNotes() {
  if (!state.token) {
    $("notes-list").innerHTML = "";
    return;
  }
  try {
    const data = await api("/api/notes");
    state.notes = data.items || data.notes || [];
    renderNotes();
  } catch (e) {
    $("notes-list").innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

function renderNotes() {
  if (!state.notes.length) {
    $("notes-list").innerHTML = `<p class="muted">Még nincs jegyzet.</p>`;
    return;
  }
  $("notes-list").innerHTML = state.notes
    .map(
      (n) => `
    <article class="card note" data-id="${escapeHtml(n.id)}">
      <h3>${escapeHtml(n.title || "Jegyzet")}</h3>
      <p class="excerpt">${escapeHtml((n.body || n.content || "").slice(0, 160))}</p>
    </article>`
    )
    .join("");
  $("notes-list").querySelectorAll(".note").forEach((el) => {
    el.addEventListener("click", () => openNote(el.dataset.id));
  });
}

function openNote(id) {
  const n = state.notes.find((x) => String(x.id) === String(id));
  state.editingNote = n || null;
  $("note-title").textContent = n ? "Jegyzet szerkesztése" : "Új jegyzet";
  $("note-title-input").value = n?.title || "";
  $("note-body").value = n?.body || n?.content || "";
  $("note-delete").classList.toggle("hidden", !n);
  $("note-error").classList.add("hidden");
  $("note-modal").showModal();
}

$("btn-new-note").addEventListener("click", () => openNote(null));
$("note-close").addEventListener("click", () => $("note-modal").close());

$("note-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("note-title-input").value.trim();
  const body = $("note-body").value;
  try {
    if (state.editingNote?.id) {
      await api(`/api/notes/${state.editingNote.id}`, {
        method: "PUT",
        body: JSON.stringify({ title, body })
      });
    } else {
      await api("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title, body })
      });
    }
    $("note-modal").close();
    loadNotes();
  } catch (e) {
    $("note-error").textContent = e.message;
    $("note-error").classList.remove("hidden");
  }
});

$("note-delete").addEventListener("click", async () => {
  if (!state.editingNote?.id) return;
  if (!confirm("Törlöd a jegyzetet?")) return;
  try {
    await api(`/api/notes/${state.editingNote.id}`, { method: "DELETE" });
    $("note-modal").close();
    loadNotes();
  } catch (e) {
    $("note-error").textContent = e.message;
    $("note-error").classList.remove("hidden");
  }
});

/* ---- API settings ---- */
$("api-url").value = state.api;
$("btn-save-api").addEventListener("click", async () => {
  const url = $("api-url").value.trim().replace(/\/$/, "");
  state.api = url;
  localStorage.setItem("vardapp_api", url);
  $("api-status").textContent = "Mentve, ellenőrzés…";
  try {
    const h = await api("/api/health");
    $("api-status").textContent = `OK · ${h.app || "API"} · ${h.storage || ""}`;
    loadNews();
  } catch (e) {
    $("api-status").textContent = `Hiba: ${e.message}`;
  }
});

/* ---- Init ---- */
(async function init() {
  $("greeting").textContent = greetingText("");
  await loadNevnapok();
  renderCalendar();
  await trySession();
  loadNews();

  // health badge silently
  api("/api/health")
    .then((h) => {
      $("api-status").textContent = `Kapcsolódva · ${h.storage || "ok"}`;
    })
    .catch(() => {
      $("api-status").textContent = "API nem elérhető – állítsd be az Egyéb fülön.";
    });
})();
