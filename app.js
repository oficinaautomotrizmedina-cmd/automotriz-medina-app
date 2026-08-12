function qs(selector, scope = document) { return scope.querySelector(selector); }
function qsa(selector, scope = document) { return Array.from(scope.querySelectorAll(selector)); }
function state() { return AM_SIMPLE_STORE.load(); }
let adminLocalArchivePreviewRec = null;
function selected() { return adminLocalArchivePreviewRec || AM_SIMPLE_STORE.selected(); }
function today() { return new Intl.DateTimeFormat("es-SV", { day: "numeric", month: "long", year: "numeric" }).format(new Date()); }

function statusTone(status) {
  if (/firmad|enviado|autorizado/i.test(status)) return "ok";
  if (/pendiente|revisión|lista/i.test(status)) return "warn";
  if (/rechaz/i.test(status)) return "danger";
  return "info";
}

function toast(message, tone = "") {
  let host = qs("[data-toast]");
  if (!host) {
    host = document.createElement("div");
    host.dataset.toast = "";
    host.className = "toast notice";
    document.body.appendChild(host);
  }
  host.className = `toast notice ${tone}`;
  host.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => host.remove(), 3200);
}

function showAccessGate(role) {
  const isAdmin = role === "admin";
  document.body.innerHTML = `
    <main class="public-main">
      <article class="panel" style="max-width:520px;margin:40px auto">
        <div class="panel-header"><div><h3>${isAdmin ? "Acceso administrador" : "Acceso empleado"}</h3><p>Automotriz Medina</p></div></div>
        <div class="panel-body grid">
          <div class="notice">${isAdmin ? "Ingrese el PIN administrativo." : "Ingrese el token de empleado."}</div>
          <div class="field">
            <label>${isAdmin ? "PIN" : "Token"}</label>
            <input ${isAdmin ? 'type="password"' : 'type="text"'} data-login-value autofocus>
          </div>
          <button class="btn primary" data-action="${isAdmin ? "admin-login" : "employee-login"}">Entrar</button>
          <button class="btn" data-action="${isAdmin ? "admin-quick-login" : "employee-quick-login"}">${isAdmin ? "Entrar como administrador" : "Entrar como empleado"}</button>
          <small>${isAdmin ? "PIN: 2468" : "Token: empleado-am-local"}</small>
        </div>
      </article>
    </main>`;
}

function requireLocalAccess(page) {
  const current = state();
  if (page === "admin" && !current.session.admin) {
    AM_SIMPLE_STORE.mutate((state) => { state.session.admin = true; });
    return true;
  }
  if (page === "employee" && !current.session.employee) {
    AM_SIMPLE_STORE.mutate((state) => { state.session.employee = true; });
    return true;
  }
  /*
  if (page === "admin" && !current.session.admin) {
    showAccessGate("admin");
    return false;
  }
  if (page === "employee" && !current.session.employee) {
    showAccessGate("employee");
    return false;
  }
  */
  return true;
}

const AM_IMAGE_MAX = 560;
const AM_IMAGE_QUALITY = 0.42;

function compressImageDataUrl(src, max = AM_IMAGE_MAX, quality = AM_IMAGE_QUALITY) {
  return new Promise((resolve) => {
    if (!src || !String(src).startsWith("data:image/")) {
      resolve(src || "");
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out && out.length < src.length ? out : src);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function readFile(input, callback) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => callback(await compressImageDataUrl(reader.result));
  reader.readAsDataURL(file);
}

function readFilePromise(input) {
  return new Promise((resolve, reject) => {
    const file = input.files && input.files[0];
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = async () => resolve(await compressImageDataUrl(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function photoVisual(photo) {
  if (!photo) {
    return '<div class="photo-box" data-label="Foto">Foto pendiente</div>';
  }
  if (photo.dataUrl) {
    return `<button type="button" class="photo-box has-image" data-action="open-image-preview-direct" data-src="${esc(photo.dataUrl)}" data-label="${esc(photo.label)}" style="background-image:url('${photo.dataUrl}')"></button>`;
  }
  return `<div class="photo-box" data-label="${photo.label}" style="background:linear-gradient(135deg, ${photo.color || "#206f78"}, #eef2f5)">Foto pendiente</div>`;
}

const WORK_STATUSES = ["EN REVISIÓN", "EN DIAGNÓSTICO", "EN REPARACIÓN", "ESPERA DE REPUESTOS", "EN PAUSA", "FINALIZADO", "ENTREGADO"];

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function deadlineInputValue(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function deadlineInfo(deadline, startedAt = "") {
  if (!deadline) return { active: false, label: "Esperando cálculo de sistema", tone: "info", progress: 0 };
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return { active: false, label: "Esperando cálculo de sistema", tone: "info", progress: 0 };
  const now = Date.now();
  const diff = end.getTime() - now;
  const startDate = startedAt ? new Date(startedAt) : null;
  const start = startDate && !Number.isNaN(startDate.getTime()) ? startDate.getTime() : now;
  const total = Math.max(1, end.getTime() - start);
  const progress = Math.max(0, Math.min(100, Math.round(((now - start) / total) * 100)));
  const tone = diff <= 0 || progress >= 75 ? "danger" : progress >= 50 ? "warn" : "ok";
  return {
    active: true,
    label: diff <= 0 ? "Tiempo vencido" : `Faltan ${formatRemaining(diff)}`,
    tone,
    progress
  };
}

function deadlineBadge(rec) {
  const info = deadlineInfo(rec?.employeeDeadline, rec?.employeeDeadlineSetAt);
  if (!info.active) return '<span class="pill info">Esperando cálculo de sistema</span>';
  const tokens = Number(rec?.employeeDeadlineTokensAvailable ?? 3);
  const request = rec?.employeeDeadlineUnlockRequested ? '<br><span class="pill danger">Solicitud de desbloqueo</span>' : "";
  return `<span class="pill ${info.tone}">${esc(info.label)}</span><br><small>${tokens} token(s) disponible(s)</small>${request}`;
}

function statusOptions(value) {
  return WORK_STATUSES.map((status) => `<option ${status === value ? "selected" : ""}>${status}</option>`).join("");
}

function yearOptions(value = "") {
  const currentYear = new Date().getFullYear();
  let html = '<option value="">Seleccione año</option>';
  for (let year = currentYear; year >= 1965; year -= 1) {
    html += `<option value="${year}" ${String(value) === String(year) ? "selected" : ""}>${year}</option>`;
  }
  return html;
}

function rawProcessRows(rec) {
  const details = trackingProfile(rec).processDetails || "";
  return details.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function processRowItems(rec) {
  return rawProcessRows(rec).map(parseProcessRow).filter((item) => item.text);
}

function pendingTracking(rec) {
  return rec?.pendingTracking && rec.pendingTracking.status === "pending" ? rec.pendingTracking : null;
}

function finalizationNeedsPublish(rec) {
  if (String(rec?.status || "").toUpperCase() !== "FINALIZADO") return false;
  const trackingState = String(rec?.tracking?.state || "").toUpperCase();
  const publishedProgress = Number(rec?.publishedProgress ?? rec?.progress ?? 0);
  return pendingTracking(rec) || trackingState !== "FINALIZADO" || publishedProgress < 100;
}

function adminProcessRowItems(rec) {
  const pending = pendingTracking(rec);
  if (pending) {
    return String(pending.processDetails || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).map(parseProcessRow).filter((item) => item.text);
  }
  return processRowItems(rec);
}

function adminTrackingImages(rec) {
  const pending = pendingTracking(rec);
  if (pending) return Array.isArray(pending.images) ? pending.images : [];
  return Array.isArray(rec?.trackingImages) ? rec.trackingImages : [];
}

function parseProcessRow(row) {
  if (/^\[done\]\s*/i.test(row)) return { status: "done", text: row.replace(/^\[done\]\s*/i, "").trim() };
  if (/^\[pending\]\s*/i.test(row)) return { status: "pending", text: row.replace(/^\[pending\]\s*/i, "").trim() };
  if (/^✓\s*/.test(row)) return { status: "done", text: row.replace(/^✓\s*/, "").trim() };
  if (/^⏳\s*/.test(row)) return { status: "pending", text: row.replace(/^⏳\s*/, "").trim() };
  return { status: "pending", text: row };
}

function formatProcessRow(item) {
  return `[${item.status === "done" ? "done" : "pending"}] ${String(item.text || "").trim()}`;
}

function processRows(rec) {
  return processRowItems(rec).map((item) => item.text);
}

function collectAdminProcessRows() {
  return qsa("[data-admin-process-row]").map((input) => ({
    status: input.dataset.detailStatus || "pending",
    text: input.value.trim()
  })).filter((item) => item.text);
}

function adminTrackingProfileSnapshot(rec, sourceProfile = trackingProfile(rec)) {
  return {
    receptionDate: sourceProfile.receptionDate || "",
    deliveryEstimate: sourceProfile.deliveryEstimate || "",
    vehicleTitle: sourceProfile.vehicleTitle || "",
    odometer: sourceProfile.odometer || "",
    plate: sourceProfile.plate || "",
    state: sourceProfile.state || rec?.status || "EN REVISIÓN"
  };
}

function createAdminTrackingDraft(rec) {
  const profile = trackingProfile(rec);
  const pending = pendingTracking(rec);
  const savedDraft = rec?.adminTrackingDraft && typeof rec.adminTrackingDraft === "object" ? rec.adminTrackingDraft : null;
  if (!pending && savedDraft) {
    return {
      id: rec?.id || "",
      sourcePendingAt: savedDraft.sourcePendingAt || "",
      profile: { ...adminTrackingProfileSnapshot(rec, profile), ...(savedDraft.profile || {}) },
      progress: Number(savedDraft.progress ?? rec?.progress ?? 0),
      rows: Array.isArray(savedDraft.rows) ? savedDraft.rows : processRowItems(rec),
      images: Array.isArray(savedDraft.images) ? savedDraft.images : (Array.isArray(rec?.trackingImages) ? rec.trackingImages : []),
      deadline: savedDraft.deadline ?? rec?.employeeDeadline ?? ""
    };
  }
  return {
    id: rec?.id || "",
    sourcePendingAt: pending?.submittedAt || "",
    profile: pending ? { ...adminTrackingProfileSnapshot(rec, profile), state: pending.state || profile.state || rec.status } : adminTrackingProfileSnapshot(rec, profile),
    progress: pending ? Number(pending.progress || 0) : Number(rec?.progress || 0),
    rows: pending ? adminProcessRowItems(rec) : processRowItems(rec),
    images: pending ? adminTrackingImages(rec) : (Array.isArray(rec?.trackingImages) ? rec.trackingImages : []),
    deadline: rec?.employeeDeadline || ""
  };
}

function ensureAdminTrackingDraft(rec) {
  const pending = pendingTracking(rec);
  const pendingAt = pending?.submittedAt || "";
  if (!adminTrackingDraft || adminTrackingDraft.id !== rec?.id || adminTrackingDraft.sourcePendingAt !== pendingAt) {
    adminTrackingDraft = createAdminTrackingDraft(rec);
  }
  return adminTrackingDraft;
}

function captureAdminTrackingDraftFromDom(rec) {
  const draft = ensureAdminTrackingDraft(rec);
  qsa("[data-track-field]").forEach((input) => {
    draft.profile[input.dataset.trackField] = input.value;
  });
  if (qs("[data-admin-progress]")) draft.progress = Number(qs("[data-admin-progress]").value || 0);
  const rows = collectAdminProcessRows();
  if (rows.length || qsa("[data-admin-process-row]").length) {
    draft.rows = rows;
    draft.images = (draft.images || []).slice(0, rows.length);
  }
  draft.deadline = qs("[data-admin-deadline]")?.value || draft.deadline || "";
  return draft;
}

function persistAdminTrackingDraft(current, draft, publish = false) {
  const rec = AM_SIMPLE_STORE.selected(current);
  if (!rec) return;
  const profile = trackingProfile(rec);
  const rows = (draft.rows || []).filter((row) => String(row?.text || "").trim());
  const images = (draft.images || []).slice(0, rows.length).map((rowImages) => Array.isArray(rowImages) ? rowImages : []);
  const privateDraft = {
    id: rec.id,
    sourcePendingAt: draft.sourcePendingAt || "",
    savedAt: new Date().toISOString(),
    profile: { ...draft.profile },
    progress: Number(draft.progress || 0),
    rows,
    images,
    deadline: draft.deadline || ""
  };
  rec.adminTrackingDraft = privateDraft;
  rec.pendingTracking = {
    ...(rec.pendingTracking || {}),
    status: "pending",
    employeeId: rec.employeeId || "",
    employeeName: rec.employeeName || "ADMINISTRADOR",
    submittedAt: privateDraft.savedAt,
    editedByAdmin: true,
    state: privateDraft.profile.state || rec.status || "EN REVISIÓN",
    progress: privateDraft.progress,
    processDetails: rows.map(formatProcessRow).join("\n"),
    images
  };

  const deadlineValue = draft.deadline || "";
  if ((rec.employeeDeadline || "") !== deadlineValue) {
    rec.employeeDeadlineSetAt = deadlineValue ? new Date().toISOString() : "";
    rec.employeeDeadlineUnlockRequested = false;
  }
  rec.employeeDeadline = deadlineValue;
  if (deadlineValue && rec.employeeDeadlineTokensAvailable == null) rec.employeeDeadlineTokensAvailable = 3;
  if (deadlineValue && rec.employeeDeadlineTokensUsed == null) rec.employeeDeadlineTokensUsed = 0;
  if (!deadlineValue) {
    rec.employeeDeadlineUnlockRequested = false;
    rec.employeeDeadlineTokensAvailable = 3;
    rec.employeeDeadlineTokensUsed = 0;
  }

  if (!publish) return;
  Object.assign(profile, draft.profile);
  rec.progress = Number(draft.progress || 0);
  rec.publishedProgress = rec.progress;
  profile.processDetails = rows.map(formatProcessRow).join("\n");
  rec.trackingImages = images;
  rec.status = profile.state || rec.status;
  rec.progressLabel = profile.state || "En proceso";
  if (pendingTracking(rec)) {
    rec.pendingTracking = {
      ...rec.pendingTracking,
      status: "published",
      publishedAt: new Date().toISOString()
    };
  }
}

function internalRows(rec) {
  const note = rec.internalWork?.internalNote || "";
  return note.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function whatsappPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 8) return `503${digits}`;
  return digits;
}

function absoluteHref(page, token) {
  const base = location.href.replace(/[^/\\]*$/, "");
  return `${base}${tokenHref(page, token)}`;
}

function closeActionMenus(except = null) {
  qsa(".action-menu[open]").forEach((menu) => {
    if (menu !== except) menu.open = false;
  });
}

function hasOpenActionMenu() {
  return !!qs(".action-menu[open]");
}

function initActionMenus() {
  qsa(".action-menu").forEach((menu) => {
    if (menu.dataset.menuReady) return;
    menu.dataset.menuReady = "1";
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      closeActionMenus(menu);
      if (!history.state?.menuOpen) {
        history.pushState({ ...(history.state || {}), menuOpen: true }, "");
      }
    });
  });
}

function encodePayload(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data || {}))));
}

function vehiclePayloadFromReception(rec) {
  const profile = trackingProfile(rec);
  return {
    fecha: String(profile.receptionDate || "").split(",")[0] || "",
    hora: "",
    tecnico: rec.employeeName || "",
    marca: rec.vehicle?.marca || "",
    modelo: rec.vehicle?.modelo || "",
    anio: rec.vehicle?.anio || "",
    color: rec.vehicle?.color || "",
    vin: rec.vehicle?.vin || "",
    placa: rec.vehicle?.placa || "",
    odometro: rec.vehicle?.kilometraje || "",
    odometroUnidad: /km/i.test(profile.odometer || "") ? "km" : "mi",
    rec: rec.number || "",
    updatedAt: new Date().toISOString()
  };
}

function masterFileHref(rec) {
  const params = new URLSearchParams();
  params.set("rec", rec.number || rec.id || "");
  params.set("vehicle", encodePayload(vehiclePayloadFromReception(rec)));
  params.set("v", masterArchiveVersion(rec));
  params.set("modulev", "20260801-master-shared-archive1");
  return `modulo-master-taller.html?${params.toString()}`;
}

function masterArchiveVersion(rec) {
  const archive = masterArchiveForReception(rec);
  return archive?.updatedAt || "nuevo";
}

function archiveNorm(value) {
  return String(value || "").trim().toUpperCase();
}

function archiveVehicleKey(data = {}) {
  return [data.marca, data.modelo, data.anio].map(archiveNorm).filter(Boolean).join("|");
}

function archiveDataFromCandidate(archive = {}) {
  return archive.data || archive.vehicle || {};
}

function archiveMatchesReception(archive, rec) {
  const data = archiveDataFromCandidate(archive);
  const recKeys = [
    rec.number,
    rec.id,
    rec.vehicle?.vin,
    rec.vehicle?.placa
  ].map(archiveNorm).filter(Boolean);
  const archiveKeys = [
    archive.rec,
    data.rec,
    data.recepcion,
    data.vin,
    data.placa
  ].map(archiveNorm).filter(Boolean);
  if (archiveKeys.some((key) => recKeys.includes(key))) return true;
  const recVehicleKey = archiveVehicleKey({
    marca: rec.vehicle?.marca,
    modelo: rec.vehicle?.modelo,
    anio: rec.vehicle?.anio
  });
  return !!recVehicleKey && recVehicleKey === archiveVehicleKey(data);
}

function archiveContentScore(archive) {
  const data = archiveDataFromCandidate(archive);
  let score = 0;
  ["items", "repuestos", "repuestosIngreso", "authItems", "authRepuestos"].forEach((key) => {
    if (Array.isArray(data[key])) score += data[key].length * 5;
  });
  if (data.masterDocs && typeof data.masterDocs === "object") score += 20;
  if (data.ticketDoc && typeof data.ticketDoc === "object") score += 10;
  ["marca", "modelo", "anio", "color", "vin", "placa", "odometro", "tecnico"].forEach((key) => {
    if (String(data[key] || "").trim()) score += 1;
  });
  if (archive.html && !/No habia un archivo|No había un archivo|todavía no tiene un archivo/i.test(archive.html)) score += 1000;
  return score;
}

function newestUsefulArchive(candidates) {
  return [...new Set(candidates)].sort((a, b) => {
    const scoreDiff = archiveContentScore(b) - archiveContentScore(a);
    if (scoreDiff) return scoreDiff;
    return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
  })[0] || null;
}

function authorizationMessage(rec) {
  const link = absoluteHref("cliente.html", rec.clientToken);
  return [
    `Hola ${rec.client?.name || ""}.`,
    `Le saluda Automotriz Medina.`,
    `Le compartimos el link privado de autorización para revisar la recepción, fotografías, inventario, observaciones y términos del servicio de su vehículo ${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}.`,
    `Por favor abra el enlace y, si todo esta correcto, autorice el diagnóstico o reparación:`,
    link
  ].join("\n\n");
}

function photoReviewMessage(rec) {
  const link = absoluteHref("cliente.html", rec.clientToken);
  return [
    `Hola ${rec.client?.name || ""}.`,
    `Le saluda Automotriz Medina.`,
    `Su autorización ya fue firmada en recepción. Le compartimos este enlace privado para revisar las fotografías e información visual registrada de su vehículo ${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}.`,
    `Al terminar la revisión, presione Siguiente para abrir el seguimiento de su vehículo:`,
    link
  ].join("\n\n");
}

function trackingMessage(rec) {
  const link = absoluteHref("seguimiento.html", rec.trackingToken);
  return [
    `Hola ${rec.client?.name || ""}.`,
    `Le saluda Automotriz Medina.`,
    `Le compartimos el link privado de seguimiento de su vehículo ${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}.`,
    `Normalmente los avances se actualizan cada 24 a 48 horas según el proceso y la información disponible del taller:`,
    link
  ].join("\n\n");
}

function safeFileName(value) {
  return String(value || "archivo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "archivo";
}

function safeFolderName(value, fallback = "CARPETA") {
  return String(value || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .toUpperCase() || fallback;
}

function archiveDateInfo(rec) {
  const stamp = receptionDateMs(rec) || Date.now();
  const date = new Date(stamp);
  const year = String(date.getFullYear());
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const monthName = date.toLocaleDateString("es-SV", { month: "long" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  return {
    year,
    monthFolder: `${monthNumber} - ${safeFolderName(monthName, "MES")}`,
    dateLabel: `${year}-${monthNumber}-${day}`
  };
}

function excelDate() {
  return new Date().toLocaleString("es-SV");
}

function downloadBlob(filename, content, type = "application/vnd.ms-excel;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function workbookHtml(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#17202a}
    h1{font-size:22px;color:#206f78}h2{font-size:16px;margin-top:22px;color:#206f78}
    table{border-collapse:collapse;width:100%;margin-bottom:14px}td,th{border:1px solid #bfcad3;padding:7px 8px;vertical-align:top}
    th{background:#e9f2f3;text-align:left}.muted{color:#637282}.photo{max-width:180px;max-height:140px}
  </style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

function kvRows(rows) {
  return `<table><tbody>${rows.map(([key, value]) => `<tr><th>${esc(key)}</th><td>${value == null ? "" : esc(value)}</td></tr>`).join("")}</tbody></table>`;
}

function tableRows(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => {
    const raw = typeof cell === "string" && cell.startsWith("<img ");
    return `<td>${cell == null ? "" : (raw ? cell : esc(cell))}</td>`;
  }).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Sin datos registrados.</td></tr>`}</tbody></table>`;
}

function photoBackupRows(rec) {
  return (rec.photos || []).map((photo) => [
    photo.label || "Foto",
    photo.note || "",
    photo.dataUrl ? "Incluida en respaldo" : "Sin imagen",
    photo.dataUrl ? `<img class="photo" src="${photo.dataUrl}">` : ""
  ]);
}

function backupWorkbook(rec) {
  const profile = trackingProfile(rec);
  const evidence = rec.authorizationEvidence || {};
  const inventory = (rec.inventory || []).map((item) => [item.name, item.present ? "Presente" : "Faltante", item.note || ""]);
  const damages = (rec.damages || []).map((damage) => [damage.área || damage.area || "", damage.detail || "", (damage.photos || []).length]);
  const photos = photoBackupRows(rec);
  const updates = processRows(rec).map((row, index) => [index + 1, row]);
  const internal = internalRows(rec).map((row, index) => [index + 1, row]);
  return workbookHtml(`Respaldo expediente ${rec.number}`, `
    <p class="muted">Generado: ${esc(excelDate())}</p>
    <h2>Cliente</h2>${kvRows([["Nombre", rec.client?.name || ""], ["Teléfono", rec.client?.phone || ""], ["Estado autorización", rec.signed ? "Autorizado" : (rec.express ? "No aplica - servicio express" : "Pendiente")], ["Fecha autorización", rec.signatureDate || ""], ["Token cliente", rec.clientToken || ""], ["Token seguimiento", rec.trackingToken || ""]])}
    <h2>Vehículo</h2>${kvRows([["Recepción", rec.number], ["Tipo", rec.express ? `Servicio express: ${rec.serviceType || ""}` : "Vehículo en taller"], ["Técnico", rec.employeeName || ""], ["Estado", rec.status || ""], ["Marca", rec.vehicle?.marca || ""], ["Modelo", rec.vehicle?.modelo || ""], ["Año", rec.vehicle?.anio || ""], ["Color", rec.vehicle?.color || ""], ["Placa", rec.vehicle?.placa || ""], ["VIN", rec.vehicle?.vin || ""], ["Kilometraje", rec.vehicle?.kilometraje || ""]])}
    <h2>Motivo y observaciones</h2>${kvRows([["Motivo de recepción / falla reportada", serviceReason(rec) || ""], ["Observaciones", rec.observations || ""]])}
    <h2>Inventario</h2>${tableRows(["Elemento", "Estado", "Detalle"], inventory)}
    <h2>Daños</h2>${tableRows(["Área", "Detalle", "Fotos"], damages)}
    <h2>Fotografías</h2>${tableRows(["Foto", "Nota", "Estado", "Imagen"], photos)}
    <h2>Seguimiento publicado</h2>${kvRows([["Recepción visible", profile.receptionDate || ""], ["Estimación entrega", profile.deliveryEstimate || ""], ["Vehículo visible", profile.vehicleTitle || ""], ["Odómetro visible", profile.odometer || ""], ["Placa visible", profile.plate || ""], ["Estado visible", profile.state || ""], ["Avance %", rec.progress || 0], ["Texto progreso", rec.progressLabel || ""]])}
    ${tableRows(["#", "Detalle"], updates)}
    <h2>Bitácora interna</h2>${tableRows(["#", "Nota interna"], internal)}
    <h2>Constancia técnica de autorización</h2>${kvRows([["Navegador", evidence.userAgent || ""], ["Plataforma", evidence.platform || ""], ["Idioma", evidence.language || ""], ["Zona horaria", evidence.timezone || ""], ["Pantalla", evidence.screen || ""], ["Ventana", evidence.viewport || ""]])}
  `);
}

function internalWorkbook(rec) {
  const rows = internalRows(rec).map((row, index) => [index + 1, row]);
  const profile = trackingProfile(rec);
  return workbookHtml(`Archivo interno ${rec.number}`, `
    <p class="muted">Generado: ${esc(excelDate())}</p>
    ${kvRows([["Recepción", rec.number], ["Fecha recepción", profile.receptionDate || ""], ["Técnico", rec.employeeName || ""], ["Cliente", rec.client?.name || ""], ["Teléfono", rec.client?.phone || ""], ["Vehículo", `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim()], ["Color", rec.vehicle?.color || ""], ["VIN", rec.vehicle?.vin || ""], ["Placa", rec.vehicle?.placa || ""], ["Odómetro", rec.vehicle?.kilometraje || ""], ["Estado", rec.status || ""], ["Avance %", rec.progress || 0], ["Motivo", serviceReason(rec) || ""]])}
    <h2>Bitácora interna</h2>${tableRows(["#", "Renglón"], rows)}
    <h2>Detalle de seguimiento</h2>${tableRows(["#", "Renglón"], processRows(rec).map((row, index) => [index + 1, row]))}
  `);
}

function downloadReceptionBackup(rec) {
  if (!rec) return;
  const backup = buildReceptionBackup(rec);
  const base = `${safeFileName(rec.number)}-${safeFileName(`${rec.vehicle?.marca || ""}-${rec.vehicle?.modelo || ""}-${rec.vehicle?.anio || ""}`)}`;
  downloadBlob(`respaldo-${base}.amr`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

const LOCAL_ARCHIVE_DB = "am-local-archive-folder-v1";
const LOCAL_ARCHIVE_STORE = "handles";
const LOCAL_ARCHIVE_HANDLE_KEY = "archiveFolder";
let adminArchiveDirectoryHandle = null;
let adminLocalArchivedBackups = [];

function supportsLocalArchiveFolders() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && "indexedDB" in window;
}

function archiveFolderParts(rec) {
  const dateInfo = archiveDateInfo(rec);
  const vehicleBase = `${rec.vehicle?.marca || "VEHICULO"} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim();
  const plate = rec.vehicle?.placa ? ` ${rec.vehicle.placa}` : "";
  const vehicle = `${vehicleBase}${plate}`.trim();
  return [
    safeFolderName(rec.client?.name || "CLIENTE PENDIENTE", "CLIENTE PENDIENTE"),
    safeFolderName(vehicle || "VEHICULO", "VEHICULO"),
    dateInfo.year,
    dateInfo.monthFolder,
    safeFolderName(`${dateInfo.dateLabel} - ${rec.number || rec.id || "EXPEDIENTE"}`, "EXPEDIENTE")
  ];
}

function localArchiveFileName(rec) {
  const vehicle = safeFileName(`${rec.vehicle?.marca || ""}-${rec.vehicle?.modelo || ""}-${rec.vehicle?.anio || ""}` || "vehiculo");
  return `${safeFileName(rec.number || rec.id)}-${vehicle}`;
}

function localArchivePath(rec) {
  return [...archiveFolderParts(rec), `${localArchiveFileName(rec)}.amr`].join("/");
}

function openLocalArchiveDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_ARCHIVE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_ARCHIVE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalArchiveHandle(handle) {
  const db = await openLocalArchiveDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_ARCHIVE_STORE, "readwrite");
    tx.objectStore(LOCAL_ARCHIVE_STORE).put(handle, LOCAL_ARCHIVE_HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadLocalArchiveHandle() {
  if (adminArchiveDirectoryHandle || !supportsLocalArchiveFolders()) return adminArchiveDirectoryHandle;
  const db = await openLocalArchiveDb();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_ARCHIVE_STORE, "readonly");
    const request = tx.objectStore(LOCAL_ARCHIVE_STORE).get(LOCAL_ARCHIVE_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  adminArchiveDirectoryHandle = handle || null;
  return adminArchiveDirectoryHandle;
}

async function verifyDirectoryPermission(handle, write = false) {
  if (!handle) return false;
  const options = { mode: write ? "readwrite" : "read" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function configureLocalArchiveFolder() {
  if (!supportsLocalArchiveFolders()) {
    toast("Este navegador no permite seleccionar carpetas locales. Use Chrome o Edge en computadora.", "danger");
    return null;
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const ok = await verifyDirectoryPermission(handle, true);
  if (!ok) throw new Error("No se concedió permiso para escribir en la carpeta.");
  adminArchiveDirectoryHandle = handle;
  await saveLocalArchiveHandle(handle);
  localStorage.setItem("am_local_archive_folder_name", handle.name || "Carpeta configurada");
  toast(`Carpeta de archivados configurada: ${handle.name || "lista"}`);
  renderLocalArchiveStatus();
  return handle;
}

async function getLocalArchiveFolder(write = false) {
  let handle = await loadLocalArchiveHandle();
  if (!handle) return null;
  const ok = await verifyDirectoryPermission(handle, write);
  return ok ? handle : null;
}

async function ensureLocalArchiveFolder() {
  return (await getLocalArchiveFolder(true)) || configureLocalArchiveFolder();
}

async function getOrCreateFolder(root, parts) {
  let current = root;
  for (const part of parts) current = await current.getDirectoryHandle(part, { create: true });
  return current;
}

async function writeTextFile(folder, name, content, type = "text/plain;charset=utf-8") {
  const fileHandle = await folder.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([content], { type }));
  await writable.close();
  const file = await fileHandle.getFile();
  return file.size > 0;
}

async function writeLocalArchiveBackup(rec) {
  const root = await ensureLocalArchiveFolder();
  if (!root) throw new Error("Configure primero la carpeta local de archivados.");
  const backup = buildReceptionBackup(rec);
  const folder = await getOrCreateFolder(root, archiveFolderParts(rec));
  const base = localArchiveFileName(rec);
  const json = JSON.stringify(backup, null, 2);
  const wroteBackup = await writeTextFile(folder, `${base}.amr`, json, "application/json;charset=utf-8");
  const wroteHtml = await writeTextFile(folder, `${base}.html`, backup.files?.expedienteHtml || backupWorkbook(rec), "text/html;charset=utf-8");
  const wroteArchiveHtml = await writeTextFile(folder, `${base}-archivo.html`, backup.files?.archivoTallerHtml || backup.files?.expedienteHtml || backupWorkbook(rec), "text/html;charset=utf-8");
  if (!wroteBackup || !wroteHtml || !wroteArchiveHtml) throw new Error("No se pudo verificar el respaldo local.");
  return { path: localArchivePath(rec), exportedAt: backup.exportedAt };
}

async function deleteLocalArchiveBackup(entry) {
  const root = await getLocalArchiveFolder(true);
  if (!root) throw new Error("Configure primero la carpeta local de archivados.");
  const parts = String(entry?.path || "").split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("No se pudo identificar el archivo local.");
  let folder = root;
  for (const part of parts) {
    folder = await folder.getDirectoryHandle(part);
  }
  const names = new Set([fileName]);
  const rec = entry?.backup?.reception;
  if (rec) {
    const base = localArchiveFileName(rec);
    names.add(`${base}.amr`);
    names.add(`${base}.html`);
    names.add(`${base}-archivo.html`);
  }
  for (const name of names) {
    try {
      await folder.removeEntry(name);
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
    }
  }
}

async function freshReceptionForLocalArchive(rec) {
  if (!rec) return null;
  try {
    if (globalThis.AM_CLOUD_SYNC?.isReady?.() && globalThis.AM_CLOUD_SYNC?.fetchLatest) {
      const snapshot = await AM_CLOUD_SYNC.fetchLatest();
      AM_CLOUD_SYNC.applySnapshot?.(snapshot);
    }
  } catch (error) {
    console.warn("No se pudo actualizar desde nube antes de archivar", error);
  }
  return state().receptions.find((item) => item.id === rec.id || item.number === rec.number) || rec;
}

async function readLocalArchiveFiles(dirHandle, prefix = "") {
  const results = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      results.push(...await readLocalArchiveFiles(handle, path));
    } else if (/\.amr$/i.test(name) || /datos-expediente\.json$/i.test(name)) {
      try {
        const file = await handle.getFile();
        const backup = JSON.parse(await file.text());
        if (backup?.type === "am-recepcion-backup" && backup.reception) {
          results.push({ path, backup, updatedAt: file.lastModified });
        }
      } catch (error) {
        console.warn("No se pudo leer respaldo archivado", path, error);
      }
    }
  }
  return results;
}

async function loadLocalArchivedBackups() {
  const root = await getLocalArchiveFolder(false);
  if (!root) {
    renderLocalArchiveStatus("Configure la carpeta local para cargar archivados.");
    return [];
  }
  adminLocalArchivedBackups = await readLocalArchiveFiles(root);
  renderLocalArchiveStatus();
  renderLocalArchiveTable();
  return adminLocalArchivedBackups;
}

function renderLocalArchiveStatus(message = "") {
  const host = qs("[data-local-archive-status]");
  if (!host) return;
  const folderName = localStorage.getItem("am_local_archive_folder_name") || "";
  const count = adminLocalArchivedBackups.length;
  host.textContent = message || (folderName ? `Carpeta configurada: ${folderName}. ${count} expediente(s) local(es) cargado(s).` : "No hay carpeta local cargada.");
}

function renderLocalArchiveTable() {
  const tbody = qs("[data-local-archive-table]");
  if (!tbody) return;
  const current = state();
  tbody.innerHTML = adminLocalArchivedBackups.map((entry, index) => {
    const rec = entry.backup.reception;
    const cloudRec = current.receptions.find((item) => item.id === rec.id || item.number === rec.number);
    return `<tr>
      <td><strong>${esc(`${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim() || rec.number)}</strong><br><small>${esc(rec.vehicle?.placa || rec.number || "")}</small></td>
      <td>${esc(rec.client?.name || "Cliente pendiente")}<br><small>${esc(rec.client?.phone || "")}</small></td>
      <td>${esc(rec.employeeName || "")}</td>
      <td><span class="pill ${statusTone(rec.status)}">${esc(rec.status || "")}</span></td>
      <td><small>${esc(entry.path)}</small></td>
      <td><div class="table-actions">
        <button class="btn" data-action="restore-local-archive-preview" data-local-archive-index="${index}">Ver</button>
        <button class="btn primary" data-action="restore-local-archive-dashboard" data-local-archive-index="${index}">Restaurar</button>
        <button class="btn danger" data-action="delete-local-archive" data-local-archive-index="${index}">Borrar local</button>
        ${cloudRec ? `<button class="btn danger" data-action="delete-cloud-archived" data-id="${cloudRec.id}">Borrar de la nube</button>` : ""}
      </div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="6">No hay expedientes archivados en la carpeta local.</td></tr>';
}

function archiveDataFromHtml(html = "") {
  const match = String(html || "").match(/<pre[^>]*id=["']expediente-json["'][^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) return null;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = match[1];
  return safeJsonParse(textarea.value, null);
}

function archiveFromLocalBackup(backup, rec) {
  const archives = backup?.archives?.master || {};
  const candidates = Object.values(archives).filter(Boolean);
  const matched = candidates.filter((archive) => archiveMatchesReception(archive, rec));
  let archive = newestUsefulArchive(matched.length ? matched : candidates);
  const html = backup?.files?.archivoTallerHtml || "";
  const htmlData = archiveDataFromHtml(html);
  if (!archive && (htmlData || html)) {
    archive = {
      rec: rec.number || htmlData?.rec || "",
      updatedAt: backup.exportedAt || new Date().toISOString(),
      data: htmlData || vehiclePayloadFromReception(rec),
      html
    };
  }
  if (archive && !archive.html && html) archive = { ...archive, html };
  if (archive && (!archive.data || !Object.keys(archive.data).length)) {
    archive = { ...archive, data: htmlData || vehiclePayloadFromReception(rec) };
  }
  return archive || null;
}

function seedArchiveViewerFromLocalBackup(backup, rec) {
  if (!backup || !rec) return false;
  const archive = archiveFromLocalBackup(backup, rec);
  if (!archive?.data) return false;
  const key = archiveNorm(rec.number || archive.rec || archive.data.rec || rec.id || rec.vehicle?.vin || rec.vehicle?.placa || "");
  if (!key) return false;
  const nextArchive = {
    rec: archive.rec || rec.number || key,
    updatedAt: archive.updatedAt || backup.exportedAt || new Date().toISOString(),
    data: {
      ...archive.data,
      rec: archive.data.rec || rec.number || archive.rec || key
    },
    html: archive.html || ""
  };
  const store = safeJsonParse(localStorage.getItem("am_master_taller_archives_v1"), {});
  const aliases = [
    key,
    rec.number,
    rec.id,
    rec.vehicle?.vin,
    rec.vehicle?.placa,
    nextArchive.rec,
    nextArchive.data.rec,
    nextArchive.data.vin,
    nextArchive.data.placa
  ].map(archiveNorm).filter(Boolean);
  aliases.forEach((alias) => { store[alias] = nextArchive; });
  localStorage.setItem("am_master_taller_archives_v1", JSON.stringify(store));
  return true;
}

function openLocalArchiveAsExpediente(entry) {
  const backupRec = entry?.backup?.reception;
  if (!backupRec) return;
  const cloudRec = state().receptions.find((item) => item.id === backupRec.id || item.number === backupRec.number);
  adminFileTab = "seguimiento";
  adminLocalArchivePreviewRec = {
    ...backupRec,
    id: backupRec.id || cloudRec?.id || backupRec.number,
    __localBackup: entry.backup,
    __cloudId: cloudRec?.id || "",
    archivedAt: backupRec.archivedAt || entry.backup.exportedAt || new Date().toISOString(),
    archivedBy: backupRec.archivedBy || "Respaldo local",
    localArchivePreviewOnly: true
  };
  seedArchiveViewerFromLocalBackup(entry.backup, adminLocalArchivePreviewRec);
  renderAdmin();
  showSection("expediente");
  showAdminFileTab("seguimiento");
}

function safeJsonParse(value, fallback = {}) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function archiveAliasesForReception(rec) {
  return [rec.number, rec.id, rec.vehicle?.vin, rec.vehicle?.placa].map(archiveNorm).filter(Boolean);
}

function relatedArchivesForReception(rec, key) {
  const store = safeJsonParse(localStorage.getItem(key), {});
  const out = {};
  const aliases = archiveAliasesForReception(rec);
  const keepHtml = key === "am_master_taller_archives_v1";
  Object.entries(store).forEach(([archiveKey, archive]) => {
    if (aliases.includes(archiveNorm(archiveKey)) || archiveMatchesReception(archive, rec)) {
      const data = archive?.data || {};
      const compactKey = archiveNorm(archive?.rec || data.rec || archiveKey);
      out[compactKey] = compactArchiveEntry(archive, keepHtml);
    }
  });
  return out;
}

function compactArchiveEntry(archive, keepHtml = false) {
  const data = archive?.data || {};
  return {
    rec: archive?.rec || data.rec || "",
    updatedAt: archive?.updatedAt || new Date().toISOString(),
    data,
    ...(keepHtml && archive?.html ? { html: archive.html } : {})
  };
}

function compactArchiveStoreValue(store = {}, keepHtml = false) {
  const compact = {};
  Object.values(store || {}).forEach((archive) => {
    const data = archive?.data || {};
    const key = archiveNorm(archive?.rec || data.rec || data.vin || data.placa || "");
    if (!key) return;
    const next = compactArchiveEntry(archive, keepHtml);
    const existing = compact[key];
    if (!existing || archiveContentScore(next) >= archiveContentScore(existing) || Date.parse(next.updatedAt || 0) > Date.parse(existing.updatedAt || 0)) {
      compact[key] = next;
    }
  });
  return compact;
}

function saveCompactedArchiveStore(key, incoming = {}, keepHtml = false) {
  const compact = compactArchiveStoreValue(incoming, keepHtml);
  localStorage.removeItem(key);
  localStorage.setItem(key, JSON.stringify(compact));
  return compact;
}

function setStorageSafely(key, value, fallbackValue = null) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`No se pudo guardar ${key}; limpiando espacio`, error);
    if (key !== "am_quick_taller_archives_v1") {
      try { localStorage.removeItem("am_quick_taller_archives_v1"); } catch {}
    }
    if (key !== "am_master_taller_archives_v1") {
      try { localStorage.removeItem("am_master_taller_archives_v1"); } catch {}
    }
    if (fallbackValue != null) {
      try {
        localStorage.setItem(key, fallbackValue);
        return true;
      } catch (fallbackError) {
        console.warn(`No se pudo guardar respaldo reducido para ${key}`, fallbackError);
      }
    }
    return false;
  }
}

function compactLocalArchiveStores() {
  try {
    saveCompactedArchiveStore("am_quick_taller_archives_v1", safeJsonParse(localStorage.getItem("am_quick_taller_archives_v1"), {}), false);
  } catch (error) {
    console.warn("No se pudo compactar archivo rápido", error);
    try { localStorage.removeItem("am_quick_taller_archives_v1"); } catch {}
  }
  try {
    saveCompactedArchiveStore("am_master_taller_archives_v1", safeJsonParse(localStorage.getItem("am_master_taller_archives_v1"), {}), true);
  } catch (error) {
    console.warn("No se pudo compactar archivo maestro", error);
  }
}

function employeeVehicleFromReception(rec) {
  const draft = rec?.adminTrackingDraft && typeof rec.adminTrackingDraft === "object" ? rec.adminTrackingDraft : null;
  const pending = pendingTracking(rec);
  const hasDraftRows = !!draft && Array.isArray(draft.rows);
  const draftRows = Array.isArray(draft?.rows) ? draft.rows.filter((row) => String(row?.text || "").trim()) : [];
  const pendingRows = pending ? String(pending.processDetails || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).map(parseProcessRow).filter((item) => item.text) : [];
  const rowItems = hasDraftRows ? draftRows : (pendingRows.length ? pendingRows : processRowItems(rec));
  const details = rowItems.map(formatProcessRow);
  const detailImages = Array.isArray(draft?.images) ? draft.images : (pending && Array.isArray(pending.images) ? pending.images : (Array.isArray(rec.trackingImages) ? rec.trackingImages : []));
  const internal = internalRows(rec);
  return {
    id: String(rec.id || `restored-${AM_SIMPLE_STORE.cryptoToken()}`).replace(/^emp-/, "") || AM_SIMPLE_STORE.cryptoToken(),
    rec: rec.number || "",
    express: !!rec.express,
    tipoServicio: rec.serviceType || "",
    eid: rec.employeeId || String(rec.employeeName || "edwin").toLowerCase(),
    en: rec.employeeName || "Edwin",
    fecha: String(trackingProfile(rec).receptionDate || "").split(",")[0] || new Date().toISOString().slice(0, 10),
    hora: "",
    marca: rec.vehicle?.marca || "",
    modelo: rec.vehicle?.modelo || "",
    anio: rec.vehicle?.anio || "",
    color: rec.vehicle?.color || "",
    vin: rec.vehicle?.vin || "",
    placa: rec.vehicle?.placa || "",
    odometro: rec.vehicle?.kilometraje || "",
    unidad: /km/i.test(trackingProfile(rec).odometer || "") ? "km" : "mi",
    estado: draft?.profile?.state || pending?.state || rec.status || "EN REVISIÓN",
    avance: Number(draft?.progress ?? pending?.progress ?? rec.progress ?? 0),
    autorizado: !!rec.signed,
    signed: !!rec.signed,
    manualAuthorization: !!rec.manualAuthorization,
    quickAuthorization: !!rec.quickAuthorization,
    adminSignatureReviewedAt: rec.adminSignatureReviewedAt || "",
    adminSignatureReviewedBy: rec.adminSignatureReviewedBy || "",
    termsAcceptedAt: rec.termsAcceptedAt || rec.signatureDate || "",
    clientName: rec.client?.name || "",
    clientPhone: rec.client?.phone || "",
    signatureName: rec.signatureName || rec.client?.name || "",
    signatureDate: rec.signatureDate || "",
    signatureDataUrl: rec.signatureDataUrl || "",
    authorizationEvidence: rec.authorizationEvidence ? { ...rec.authorizationEvidence } : null,
    motivo: serviceReason(rec) || "",
    observaciones: rec.observations || "",
    detalle: details.join("\n"),
    detalles: details,
    detalleImages: detailImages,
    __forceTrackingSync: true,
    pendingTracking: rec.pendingTracking?.status === "pending" ? { ...rec.pendingTracking } : null,
    beforeFinishedTracking: rec.beforeFinishedTracking || null,
    autoCorrection: !!rec.autoCorrection,
    autoCorrectionAttempts: Number(rec.autoCorrectionAttempts || 0),
    autoCorrectionForced: !!rec.autoCorrectionForced,
    adminReactivateAllowed: !!rec.adminReactivateAllowed,
    nota: internal.join("\n"),
    bitacora: internal,
    deadline: rec.employeeDeadline || "",
    deadlineSetAt: rec.employeeDeadlineSetAt || "",
    deadlineTokensAvailable: Number(rec.employeeDeadlineTokensAvailable ?? 3),
    deadlineTokensUsed: Number(rec.employeeDeadlineTokensUsed || 0),
    deadlineUnlockRequested: !!rec.employeeDeadlineUnlockRequested,
    notifications: Array.isArray(rec.employeeNotifications) ? rec.employeeNotifications.map((item) => ({ ...item })) : [],
    photos: Array.isArray(rec.photos) ? rec.photos.map((photo) => ({ ...photo })) : [],
    inventory: Array.isArray(rec.inventory) ? rec.inventory.map((item) => ({ ...item })) : [],
    damages: Array.isArray(rec.damages) ? rec.damages.map((damage) => ({ ...damage })) : []
  };
}

function mergeEmployeeVehicle(existing = {}, incoming = {}) {
  const merged = { ...existing, ...incoming };
  ["photos", "inventory", "damages", "detalles", "detalleImages", "bitacora", "notifications"].forEach((key) => {
    const incomingArray = Array.isArray(incoming[key]) ? incoming[key] : null;
    const existingArray = Array.isArray(existing[key]) ? existing[key] : [];
    if (incomingArray && incomingArray.length) merged[key] = incomingArray;
    else if (existingArray.length) merged[key] = existingArray;
    else if (incomingArray) merged[key] = incomingArray;
  });
  if (!incoming.__forceTrackingSync && !String(incoming.detalle || "").trim() && String(existing.detalle || "").trim()) merged.detalle = existing.detalle;
  if (!String(incoming.nota || "").trim() && String(existing.nota || "").trim()) merged.nota = existing.nota;
  if (!incoming.__forceTrackingSync && !incoming.pendingTracking && existing.pendingTracking) merged.pendingTracking = existing.pendingTracking;
  if (incoming.__forceTrackingSync) {
    merged.detalles = Array.isArray(incoming.detalles) ? incoming.detalles : [];
    merged.detalle = incoming.detalle || "";
    merged.detalleImages = Array.isArray(incoming.detalleImages) ? incoming.detalleImages : [];
    merged.estado = incoming.estado || merged.estado;
    merged.avance = Number(incoming.avance || 0);
    merged.pendingTracking = incoming.pendingTracking || null;
  }
  delete merged.__forceTrackingSync;
  return merged;
}

function buildReceptionBackup(rec) {
  const masterArchives = relatedArchivesForReception(rec, "am_master_taller_archives_v1");
  const masterArchive = masterArchiveForReception(rec);
  const archivoTallerHtml = masterArchive?.html && !/todavía no tiene un archivo|No habia un archivo|No había un archivo/i.test(masterArchive.html)
    ? masterArchive.html
    : backupWorkbook(rec);
  return {
    type: "am-recepcion-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    reception: rec,
    employeeVehicle: employeeVehicleFromReception(rec),
    files: {
      expedienteHtml: backupWorkbook(rec),
      archivoTallerHtml
    },
    archives: {
      master: masterArchives,
      quick: {}
    }
  };
}

function buildFullProgramBackup() {
  const current = state();
  return {
    type: "am-recepcion-full-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    appState: current,
    employeeState: safeJsonParse(localStorage.getItem("am_employee_module_safe_v2"), null),
    archives: {
      master: compactArchiveStoreValue(safeJsonParse(localStorage.getItem("am_master_taller_archives_v1"), {}), true),
      quick: {}
    },
    receptions: (current.receptions || []).map((rec) => buildReceptionBackup(rec))
  };
}

function mergeArchiveStore(key, incoming = {}) {
  const keepHtml = key === "am_master_taller_archives_v1";
  const store = compactArchiveStoreValue(safeJsonParse(localStorage.getItem(key), {}), keepHtml);
  Object.entries(incoming || {}).forEach(([archiveKey, archive]) => {
    if (!archiveKey || !archive) return;
    const data = archive?.data || {};
    const keyName = archiveNorm(archive?.rec || data.rec || archiveKey);
    store[keyName] = compactArchiveEntry(archive, keepHtml);
  });
  saveCompactedArchiveStore(key, store, keepHtml);
}

function persistRestoredArchiveAliases(rec, backup) {
  const key = archiveNorm(rec.number || rec.id || rec.vehicle?.vin || rec.vehicle?.placa || "");
  if (!key) return;
  const masterStore = compactArchiveStoreValue(safeJsonParse(localStorage.getItem("am_master_taller_archives_v1"), {}), true);
  const quickStore = compactArchiveStoreValue(safeJsonParse(localStorage.getItem("am_quick_taller_archives_v1"), {}), false);
  const masterArchive = masterArchiveForReception(rec) || {
    rec: rec.number,
    updatedAt: backup.exportedAt || new Date().toISOString(),
    data: vehiclePayloadFromReception(rec),
    html: backup.files?.archivoTallerHtml || masterWorkbookFallback(rec)
  };
  const quickArchive = {
    rec: rec.number,
    updatedAt: backup.exportedAt || new Date().toISOString(),
    data: employeeVehicleFromReception(rec)
  };
  masterStore[key] = compactArchiveEntry(masterArchive, true);
  quickStore[key] = compactArchiveEntry(quickArchive, false);
  try {
    saveCompactedArchiveStore("am_master_taller_archives_v1", masterStore, true);
  } catch (error) {
    console.warn("No se pudo restaurar archivo maestro completo", error);
    saveCompactedArchiveStore("am_master_taller_archives_v1", { [key]: { ...masterArchive, html: "" } }, true);
  }
  try {
    saveCompactedArchiveStore("am_quick_taller_archives_v1", quickStore, false);
  } catch (error) {
    console.warn("No se pudo restaurar archivo rápido completo", error);
    saveCompactedArchiveStore("am_quick_taller_archives_v1", { [key]: quickArchive }, false);
  }
}

function upsertEmployeeVehicle(vehicle) {
  if (!vehicle?.rec) return;
  const employeeState = safeJsonParse(localStorage.getItem("am_employee_module_safe_v2"), { selected: "", seq: 0, vehicles: [] });
  if (!Array.isArray(employeeState.vehicles)) employeeState.vehicles = [];
  const index = employeeState.vehicles.findIndex((item) => item.rec === vehicle.rec || item.id === vehicle.id);
  const nextVehicle = index >= 0 ? mergeEmployeeVehicle(employeeState.vehicles[index], vehicle) : vehicle;
  if (index >= 0) employeeState.vehicles[index] = nextVehicle;
  else employeeState.vehicles.unshift(nextVehicle);
  const maxSeq = employeeState.vehicles.reduce((max, item) => {
    const number = Number(String(item.id || "").replace(/\D/g, ""));
    return Math.max(max, Number.isFinite(number) ? number : 0);
  }, Number(employeeState.seq || 0));
  employeeState.seq = Math.max(maxSeq, Number(employeeState.seq || 0), employeeState.vehicles.length);
  setStorageSafely("am_employee_module_safe_v2", JSON.stringify(employeeState), JSON.stringify({ selected: "", seq: employeeState.seq || 0, vehicles: [nextVehicle] }));
}

function syncSelectedAdminReceptionToEmployee() {
  const rec = AM_SIMPLE_STORE.selected(state());
  if (rec) upsertEmployeeVehicle(employeeVehicleFromReception(rec));
}

async function handleAdminTrackingAction(action, button, event) {
  if (!["save-admin-tracking", "save-progress", "admin-add-detail-row", "admin-detail-status", "admin-remove-detail-row"].includes(action)) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  const rec = selected();
  if (!rec) {
    toast("Seleccione un expediente para modificar seguimiento.", "warn");
    return true;
  }
  if (action === "admin-detail-status") {
    const row = qs(`[data-admin-process-row="${button.dataset.index}"]`);
    if (row) {
      const nextStatus = button.dataset.status || "pending";
      row.dataset.detailStatus = nextStatus;
      row.closest(".admin-detail-row")?.querySelector("textarea")?.setAttribute("data-detail-status", nextStatus);
      button.parentElement?.querySelectorAll("button").forEach((item) => item.classList.toggle("primary", item === button));
    }
    return true;
  }
  const draft = captureAdminTrackingDraftFromDom(rec);
  if (action === "save-admin-tracking" || action === "save-progress") {
    AM_SIMPLE_STORE.mutate((current) => {
      persistAdminTrackingDraft(current, draft, action === "save-progress");
    });
    if (action === "save-progress") adminTrackingDraft = null;
    syncSelectedAdminReceptionToEmployee();
    renderAdmin();
    const message = action === "save-progress" ? "Seguimiento publicado." : "Seguimiento guardado.";
    const reason = action === "save-progress" ? "publish-tracking" : "save-admin-tracking";
    if (!await confirmCloudSaved(message, reason)) return true;
    renderAdmin();
    return true;
  }
  if (action === "admin-add-detail-row") {
    const field = qs("[data-admin-new-detail]");
    const next = field?.value.trim() || "";
    if (!next) {
      field?.focus();
      return true;
    }
    draft.rows.push({ status: "pending", text: next });
    draft.images.push([]);
    if (field) field.value = "";
  }
  if (action === "admin-remove-detail-row") {
    const index = Number(button.dataset.index);
    if (!Number.isFinite(index)) return true;
    if (!confirm("¿Está seguro de que desea eliminar este renglón de seguimiento?")) return true;
    draft.rows.splice(index, 1);
    draft.images.splice(index, 1);
  }
  AM_SIMPLE_STORE.mutate((current) => {
    persistAdminTrackingDraft(current, draft, false);
  });
  renderAdmin();
  toast("Cambio preparado. Presione Guardar seguimiento para respaldarlo.", "ok");
  return true;
}

async function handleAdminTrackingImageChange(input, event) {
  if (!input?.matches?.("[data-admin-detail-image]")) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  const rec = selected();
  if (!rec) {
    toast("Seleccione un expediente para agregar imagen.", "warn");
    input.value = "";
    return true;
  }
  const rowIndex = Number(input.dataset.adminDetailImage);
  try {
    const dataUrl = await readFilePromise(input);
    if (!dataUrl || !Number.isFinite(rowIndex)) return true;
    const draft = captureAdminTrackingDraftFromDom(rec);
    while (draft.images.length <= rowIndex) draft.images.push([]);
    if (!Array.isArray(draft.images[rowIndex])) draft.images[rowIndex] = [];
    draft.images[rowIndex].push(dataUrl);
    AM_SIMPLE_STORE.mutate((current) => {
      persistAdminTrackingDraft(current, draft, false);
    });
    renderAdmin();
    toast("Imagen agregada. Presione Guardar seguimiento para respaldarla.", "ok");
  } catch (error) {
    console.error(error);
    toast(error.message || "No se pudo guardar la imagen.", "danger");
  } finally {
    input.value = "";
  }
  return true;
}

function reactivateReception(rec) {
  if (!rec) return null;
  const previousProgress = Number(rec.publishedProgress ?? rec.progress ?? 0);
  const nextProgress = previousProgress >= 100 ? 99 : Math.max(0, previousProgress);
  rec.status = rec.reactivatedState && rec.reactivatedState !== "FINALIZADO" ? rec.reactivatedState : "EN REVISIÓN";
  rec.archivedAt = "";
  rec.archivedBy = "";
  rec.deletedAt = "";
  rec.deletedBy = "";
  rec.employeeDeadlineUnlockRequested = false;
  rec.autoCorrection = false;
  rec.autoCorrectionAttempts = 0;
  rec.autoCorrectionForced = false;
  rec.autoCorrectionSentAt = "";
  rec.autoCorrectionDiscount = 0;
  rec.finalizationPublishedAt = "";
  rec.adminReactivateAllowed = true;
  rec.beforeFinishedTracking = null;
  rec.reactivatedAt = new Date().toISOString();
  rec.reactivatedBy = "Administrador";
  rec.progress = nextProgress;
  rec.publishedProgress = nextProgress;
  rec.progressLabel = rec.status;
  if (!rec.tracking) rec.tracking = {};
  rec.tracking.state = rec.status;
  rec.pendingTracking = {
    status: "pending",
    employeeName: rec.employeeName || "EMPLEADO",
    submittedAt: new Date().toISOString(),
    state: rec.status,
    progress: nextProgress,
    processDetails: rec.tracking.processDetails || "",
    images: Array.isArray(rec.trackingImages) ? rec.trackingImages : []
  };
  return rec;
}

function restoreReceptionBackup(backup) {
  const rec = backup?.reception;
  if (!rec?.number) throw new Error("El respaldo individual no contiene una recepción válida.");
  rec.archivedAt = "";
  rec.archivedBy = "";
  rec.deletedAt = "";
  rec.deletedBy = "";
  rec.localArchiveConfirmedAt = "";
  AM_SIMPLE_STORE.mutate((current) => {
    if (!Array.isArray(current.receptions)) current.receptions = [];
    if (!Array.isArray(current.deletedReceptionNumbers)) current.deletedReceptionNumbers = [];
    current.deletedReceptionNumbers = current.deletedReceptionNumbers.filter((number) => number !== rec.number);
    const existing = current.receptions.findIndex((item) => item.number === rec.number || item.id === rec.id);
    if (existing >= 0) current.receptions[existing] = rec;
    else current.receptions.unshift(rec);
    current.selectedId = rec.id;
  });
  mergeArchiveStore("am_master_taller_archives_v1", backup.archives?.master || {});
  localStorage.removeItem("am_quick_taller_archives_v1");
  persistRestoredArchiveAliases(rec, backup);
  upsertEmployeeVehicle(backup.employeeVehicle || employeeVehicleFromReception(rec));
}

function restoreFullProgramBackup(backup) {
  if (backup?.appState?.receptions) {
    AM_SIMPLE_STORE.save(backup.appState);
  }
  const restoredEmployeeState = { selected: "", seq: 0, vehicles: [] };
  (backup.appState?.receptions || backup.receptions?.map((item) => item.reception) || []).filter(Boolean).forEach((rec) => {
    restoredEmployeeState.vehicles.push(employeeVehicleFromReception(rec));
  });
  restoredEmployeeState.seq = restoredEmployeeState.vehicles.length;
  setStorageSafely("am_employee_module_safe_v2", JSON.stringify(restoredEmployeeState), JSON.stringify({ selected: "", seq: 0, vehicles: [] }));
  mergeArchiveStore("am_master_taller_archives_v1", backup.archives?.master || {});
  localStorage.removeItem("am_quick_taller_archives_v1");
  (backup.receptions || []).forEach((item) => {
    if (item?.reception?.number) {
      mergeArchiveStore("am_master_taller_archives_v1", item.archives?.master || {});
      persistRestoredArchiveAliases(item.reception, item);
      upsertEmployeeVehicle(item.employeeVehicle || employeeVehicleFromReception(item.reception));
    }
  });
}

async function importBackupFile(file, expectedType = "") {
  if (!file) return;
  const backup = JSON.parse(await file.text());
  if (expectedType === "single" && backup.type !== "am-recepcion-backup") {
    throw new Error("Este botón solo acepta respaldos individuales de cliente/vehículo.");
  }
  if (expectedType === "full" && backup.type !== "am-recepcion-full-backup") {
    throw new Error("Este botón solo acepta respaldos completos del programa.");
  }
  if (backup.type === "am-recepcion-backup") {
    restoreReceptionBackup(backup);
    toast("Respaldo individual cargado.");
  } else if (backup.type === "am-recepcion-full-backup") {
    restoreFullProgramBackup(backup);
    toast("Respaldo completo cargado.");
  } else {
    throw new Error("El archivo no corresponde a un respaldo de Automotriz Medina.");
  }
  renderAdmin();
  showSection("dashboard");
}

function renderBackupPreview(backup) {
  const host = qs("[data-backup-viewer-content]");
  const restoreButton = qs("[data-preview-restore]");
  if (!host) return;
  previewBackup = null;
  if (!backup || backup.type !== "am-recepcion-backup" || !backup.reception) {
    if (restoreButton) restoreButton.disabled = true;
    host.innerHTML = '<div class="notice warn">Este visor temporal solo acepta respaldos individuales de cliente.</div>';
    return;
  }
  previewBackup = backup;
  const rec = backup.reception;
  if (restoreButton) restoreButton.disabled = false;
  const frameHtml = backup.files?.expedienteHtml || backupWorkbook(rec);
  host.innerHTML = `
    <article class="panel backup-preview">
      <div class="panel-header">
        <div><h3>${esc(rec.number || "Expediente")}</h3><p>Vista temporal. No altera el dashboard hasta restaurarlo.</p></div>
        <span class="pill info">Temporal</span>
      </div>
      <div class="panel-body grid">
        <div class="grid cols-4">
          <div class="metric"><span>Cliente</span><strong>${esc(rec.client?.name || "Cliente pendiente")}</strong><small>${esc(rec.client?.phone || "Sin teléfono")}</small></div>
          <div class="metric"><span>Vehículo</span><strong>${esc(`${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""}`.trim() || "Vehículo")}</strong><small>${esc(`${rec.vehicle?.anio || ""} ${rec.vehicle?.placa || ""}`.trim() || "Sin placa")}</small></div>
          <div class="metric"><span>Técnico</span><strong>${esc(rec.employeeName || "N/D")}</strong><small>${esc(rec.status || "Sin estado")}</small></div>
          <div class="metric"><span>Autorización</span><strong>${rec.signed ? "Autorizado" : "Pendiente"}</strong><small>${esc(rec.signatureDate || "")}</small></div>
        </div>
        <div class="photo-grid">
          <article class="photo-card">${photoVisual(frontReceptionPhoto(rec) || { label: "Frente", dataUrl: "" })}<div class="field"><label>Fotografía</label></div></article>
          <article class="photo-card">${photoVisual(receptionPhotoByLabel(rec, "Tarjeta reverso") || { label: "Tarjeta reverso", dataUrl: "" })}<div class="field"><label>Tarjeta reverso</label></div></article>
          <article class="photo-card">${photoVisual(receptionPhotoByLabel(rec, "Tarjeta frente") || { label: "Tarjeta frente", dataUrl: "" })}<div class="field"><label>Tarjeta frente</label></div></article>
        </div>
        <iframe class="backup-preview-frame" title="Expediente temporal" srcdoc="${esc(frameHtml)}"></iframe>
      </div>
    </article>`;
}

async function previewBackupFile(file) {
  if (!file) return;
  const backup = JSON.parse(await file.text());
  renderBackupPreview(backup);
  toast("Expediente cargado en visor temporal.");
}

function textBytes(text) {
  return new TextEncoder().encode(String(text == null ? "" : text));
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipTimeParts(date = new Date()) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: (date.getFullYear() - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function zipHeader(values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function zipLongs(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, true));
  return bytes;
}

function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const now = zipTimeParts();
  files.forEach((file) => {
    const name = textBytes(file.path.replace(/\\/g, "/"));
    const data = typeof file.data === "string" ? textBytes(file.data) : file.data;
    const crc = crc32(data);
    const local = concatBytes([
      zipLongs([0x04034b50]),
      zipHeader([20, 0x0800, 0, now.time, now.day]),
      zipLongs([crc, data.length, data.length]),
      zipHeader([name.length, 0]),
      name,
      data
    ]);
    const central = concatBytes([
      zipLongs([0x02014b50]),
      zipHeader([20, 20, 0x0800, 0, now.time, now.day]),
      zipLongs([crc, data.length, data.length]),
      zipHeader([name.length, 0, 0, 0, 0, 0]),
      zipLongs([offset]),
      name
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  });
  const centralBytes = concatBytes(centrals);
  const localBytes = concatBytes(locals);
  const end = concatBytes([
    zipLongs([0x06054b50]),
    zipHeader([0, 0, files.length, files.length]),
    zipLongs([centralBytes.length, localBytes.length]),
    zipHeader([0])
  ]);
  return concatBytes([localBytes, centralBytes, end]);
}

function dataUrlFile(dataUrl, fallbackName) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return { name: `${safeFileName(fallbackName)}.${ext}`, bytes };
}

function backupFolderName(rec, index) {
  const client = safeFileName(rec.client?.name || "sin-cliente");
  const vehicle = safeFileName(`${rec.vehicle?.marca || ""}-${rec.vehicle?.modelo || ""}-${rec.vehicle?.anio || ""}` || "vehiculo");
  return `${String(index + 1).padStart(2, "0")}-${safeFileName(rec.number || rec.id)}-${client}-${vehicle}`;
}

function allBackupSummaryWorkbook(receptions) {
  return workbookHtml("Resumen general de recepciones", `
    <p class="muted">Generado: ${esc(excelDate())}</p>
    ${tableRows(["Recepción", "Cliente", "Teléfono", "Vehículo", "Técnico", "Estado", "Autorización", "Motivo"], receptions.map((rec) => [
      rec.number || "",
      rec.client?.name || "",
      rec.client?.phone || "",
      `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim(),
      rec.employeeName || "",
      rec.status || "",
      rec.signed ? "Autorizado" : (rec.express ? "No aplica" : "Pendiente"),
      serviceReason(rec) || ""
    ]))}
  `);
}

function collectReceptionFiles(rec, index) {
  const folder = `respaldo-automotriz-medina/${backupFolderName(rec, index)}`;
  const files = [
    { path: `${folder}/datos-expediente.json`, data: JSON.stringify(rec, null, 2) },
    { path: `${folder}/expediente-completo.xls`, data: backupWorkbook(rec) },
    { path: `${folder}/expediente-completo.html`, data: backupWorkbook(rec) },
    { path: `${folder}/archivo-taller.xls`, data: masterArchiveForReception(rec)?.html || masterWorkbookFallback(rec) }
  ];
  (rec.photos || []).forEach((photo, photoIndex) => {
    const file = dataUrlFile(photo.dataUrl, `${String(photoIndex + 1).padStart(2, "0")}-${photo.label || "foto-recepcion"}`);
    if (file) files.push({ path: `${folder}/fotografias-recepcion/${file.name}`, data: file.bytes });
  });
  (rec.damages || []).forEach((damage, damageIndex) => {
    (damage.photos || []).forEach((photo, photoIndex) => {
      const file = dataUrlFile(photo.dataUrl, `${String(damageIndex + 1).padStart(2, "0")}-${damage.área || damage.area || "danio"}-${photoIndex + 1}`);
      if (file) files.push({ path: `${folder}/fotografias-danios/${file.name}`, data: file.bytes });
    });
  });
  return files;
}

function downloadAllProgramBackup() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  downloadBlob(`respaldo-completo-automotriz-medina-${stamp}.amr`, JSON.stringify(buildFullProgramBackup(), null, 2), "application/json;charset=utf-8");
}

function masterArchiveForReception(rec) {
  try {
    if (rec?.__localBackup?.files?.archivoTallerHtml) {
      return {
        rec: rec.number,
        updatedAt: rec.__localBackup.exportedAt || new Date().toISOString(),
        data: vehiclePayloadFromReception(rec),
        html: rec.__localBackup.files.archivoTallerHtml
      };
    }
    const master = JSON.parse(localStorage.getItem("am_master_taller_archives_v1") || "{}") || {};
    const quick = JSON.parse(localStorage.getItem("am_quick_taller_archives_v1") || "{}") || {};
    const lookupKeys = [rec.number, rec.id, rec.vehicle?.vin, rec.vehicle?.placa].map(archiveNorm).filter(Boolean);
    const exactCandidates = lookupKeys.flatMap((key) => [
      master[key],
      master[rec.number],
      master[rec.id],
      quick[key],
      quick[rec.number],
      quick[rec.id]
    ]);
    const scannedCandidates = [
      ...Object.values(master),
      ...Object.values(quick)
    ].filter((archive) => archiveMatchesReception(archive, rec));
    const candidates = [...exactCandidates, ...scannedCandidates].filter(Boolean);
    if (!candidates.length) return null;
    const archive = newestUsefulArchive(candidates);
    if (archive && !archive.html) {
      return {
        ...archive,
        html: archiveDataWorkbook(archive, rec)
      };
    }
    return archive;
  } catch {
    return null;
  }
}

function archiveDataWorkbook(archive, rec) {
  const data = archiveDataFromCandidate(archive) || {};
  const profile = trackingProfile(rec);
  const title = `Archivo taller ${data.rec || rec.number || ""}`.trim();
  const items = Array.isArray(data.items) ? data.items : [];
  const parts = Array.isArray(data.repuestos) ? data.repuestos : [];
  const authItems = Array.isArray(data.authItems) ? data.authItems : [];
  const authParts = Array.isArray(data.authRepuestos) ? data.authRepuestos : [];
  const itemRows = items.map((item) => [
    item.tipo || item.type || "",
    item.cant || item.cantidad || "",
    item.descripcion || item.description || "",
    item.asistencia || "",
    item.autorizado ? "Si" : ""
  ]);
  const partRows = parts.map((item) => [
    item.cant || item.cantidad || "",
    item.descripcion || item.description || "",
    item.precio || item.price || "",
    item.total || ""
  ]);
  const authRows = authItems.map((item) => [
    item.tipo || item.type || "",
    item.cant || item.cantidad || "",
    item.descripcion || item.description || "",
    item.asistencia || "",
    item.autorizado ? "Si" : ""
  ]);
  const authPartRows = authParts.map((item) => [
    item.cant || item.cantidad || "",
    item.descripcion || item.description || "",
    item.precio || item.price || "",
    item.total || ""
  ]);
  return workbookHtml(title, `
    <p class="muted">Archivo cargado desde el respaldo guardado para este expediente.</p>
    ${kvRows([
      ["Recepción", data.rec || rec.number],
      ["Fecha recepción", data.fecha || profile.receptionDate || ""],
      ["Hora", data.hora || ""],
      ["Técnico", data.tecnico || rec.employeeName || ""],
      ["Cliente", rec.client?.name || ""],
      ["Teléfono", rec.client?.phone || ""],
      ["Marca", data.marca || rec.vehicle?.marca || ""],
      ["Modelo", data.modelo || rec.vehicle?.modelo || ""],
      ["Año", data.anio || rec.vehicle?.anio || ""],
      ["Color", data.color || rec.vehicle?.color || ""],
      ["VIN", data.vin || rec.vehicle?.vin || ""],
      ["Placa", data.placa || rec.vehicle?.placa || ""],
      ["Odómetro", data.odometro || rec.vehicle?.kilometraje || ""],
      ["Estado", rec.status || ""],
      ["Motivo", serviceReason(rec) || ""]
    ])}
    <h2>Ingreso</h2>
    ${tableRows(["Tipo", "Cant", "Descripción", "Asistencia", "Autorizado"], itemRows)}
    <h2>Repuestos</h2>
    ${tableRows(["Cant", "Descripción", "Precio", "Total"], partRows)}
    <h2>Autorizado</h2>
    ${tableRows(["Tipo", "Cant", "Descripción", "Asistencia", "Autorizado"], authRows)}
    <h2>Repuestos autorizados</h2>
    ${tableRows(["Cant", "Descripción", "Precio", "Total"], authPartRows)}
  `);
}

function masterWorkbookFallback(rec) {
  const profile = trackingProfile(rec);
  return workbookHtml(`Archivo taller ${rec.number}`, `
    <p class="muted">Este expediente todavía no tiene un archivo de taller guardado. Se muestra una ficha base con los datos disponibles.</p>
    ${kvRows([["Recepción", rec.number], ["Fecha recepción", profile.receptionDate || ""], ["Técnico", rec.employeeName || ""], ["Cliente", rec.client?.name || ""], ["Teléfono", rec.client?.phone || ""], ["Vehículo", `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim()], ["Color", rec.vehicle?.color || ""], ["VIN", rec.vehicle?.vin || ""], ["Placa", rec.vehicle?.placa || ""], ["Odómetro", rec.vehicle?.kilometraje || ""], ["Estado", rec.status || ""], ["Motivo", serviceReason(rec) || ""]])}
  `);
}

function trackingProfile(rec) {
  if (!rec.tracking) {
    rec.tracking = {
      receptionDate: "18/6/2026, 3:23:00 p.m.",
      deliveryEstimate: "",
      odometer: "81,046 MILLAS",
      plate: "N/D",
      vehicleTitle: "NISSAN VERSA 2020",
      state: "EN DIAGNÓSTICO",
      processDetails: "Revisión de suspensión y dirección"
    };
    rec.progress = 20;
    rec.progressLabel = rec.tracking.state;
  }
  return rec.tracking;
}

function renderNav() {
  const buttons = qsa("[data-section-target]");
  if (!buttons.length) return;
  const mobile = qs("[data-mobile-nav]");
  buttons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.sectionTarget === "dashboard") {
      adminLocalArchivePreviewRec = null;
      adminDashboardFilter = "all";
      adminEmployeeFilter = "";
      const employeeMenu = qs("[data-employee-filter-menu]");
      if (employeeMenu) employeeMenu.classList.add("hidden");
      if (document.body.dataset.page === "admin") pushAdminHash("dashboard");
    }
    showSection(button.dataset.sectionTarget, { fromExpediente: button.hasAttribute("data-expediente-vineta") });
    if (button.dataset.sectionTarget === "dashboard") renderReceptionTable();
    if (button.dataset.sectionTarget === "clientes") renderClientCatalog();
    if (button.dataset.sectionTarget === "archivados") loadLocalArchivedBackups().catch((error) => {
      console.warn("No se pudieron cargar archivados locales", error);
      renderLocalArchiveStatus("No se pudieron cargar los archivados locales.");
    });
  }));
  if (mobile) mobile.addEventListener("change", (event) => {
    showSection(event.target.value);
    if (event.target.value === "archivados") loadLocalArchivedBackups().catch((error) => {
      console.warn("No se pudieron cargar archivados locales", error);
      renderLocalArchiveStatus("No se pudieron cargar los archivados locales.");
    });
  });
  showSection(buttons[0].dataset.sectionTarget);
}

const wizardOrder = ["datos", "fotos", "inventario", "danos", "finalizar"];

function showEmployeeStep(index) {
  const target = wizardOrder[Math.max(0, Math.min(index, wizardOrder.length - 1))];
  qsa("[data-section]").forEach((section) => section.classList.toggle("hidden", section.dataset.section !== target));
  qsa("[data-section-target]").forEach((button) => button.classList.toggle("active", button.dataset.sectionTarget === target));
  const mobile = qs("[data-mobile-nav]");
  if (mobile) mobile.value = target;
  const finalSummary = qs("[data-final-summary]");
  if (finalSummary) {
    const rec = selected();
    finalSummary.innerHTML = `
      <div class="grid cols-3">
        <div class="metric"><span>Vehículo</span><strong>${rec.vehicle.marca || "Pendiente"} ${rec.vehicle.modelo || ""}</strong><small>${rec.vehicle.placa || "Sin placa"}</small></div>
        <div class="metric"><span>Fotos</span><strong>${rec.photos.filter((p) => p.dataUrl).length}/${rec.photos.length}</strong><small>Cargadas</small></div>
        <div class="metric"><span>Daños</span><strong>${rec.damages.length}</strong><small>Registrados</small></div>
      </div>`;
  }
}

function renderTabs() {
  qsa("[data-tabs]").forEach((tabs) => {
    if (tabs.dataset.tabsReady) return;
    tabs.dataset.tabsReady = "1";
    const host = tabs.closest(".panel");
    const buttons = qsa("[data-tab-target]", tabs);
    const panels = qsa("[data-tab]", host);
    const show = (target) => {
      buttons.forEach((button) => button.classList.toggle("active", button.dataset.tabTarget === target));
      panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tab === target));
    };
    buttons.forEach((button) => button.addEventListener("click", () => show(button.dataset.tabTarget)));
    if (buttons[0]) show(buttons[0].dataset.tabTarget);
  });
}

let adminFileTab = "";
let adminDashboardFilter = "all";
let adminEmployeeFilter = "";
let previewBackup = null;
let adminDashboardQuickSearch = "";
let adminTrackingDraft = null;
let adminSearchFilters = {
  text: "",
  dateFrom: "",
  dateTo: "",
  vehicleYear: ""
};

function isArchived(rec) {
  return !!rec?.archivedAt && !rec?.deletedAt;
}

function isDeleted(rec) {
  return !!rec?.deletedAt;
}

function isPublishedFinalized(rec) {
  return String(rec?.status || "").toUpperCase() === "FINALIZADO" && !!rec?.finalizationPublishedAt;
}

function isActiveDashboardRec(rec) {
  return !isArchived(rec) && !isDeleted(rec);
}

function employeeDisplayName(id) {
  const key = String(id || "").toLowerCase();
  return ({ edwin: "EDWIN", rafael: "RAFAEL", cristian: "CRISTIAN" }[key] || String(id || "EMPLEADO")).toUpperCase();
}

function notificationId() {
  return `ntf_${Date.now()}_${AM_SIMPLE_STORE.cryptoToken()}`;
}

function notificationDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-SV");
}

const ALERTZY_ACCOUNT_KEY = "vyeddqocw7iw9jk";

function alertzyPriorityLabel(priority) {
  return priority === "danger" ? "Código rojo urgente" : "Código amarillo";
}

async function sendAlertzyNotification({ employeeName, type, priority, message, recNumber, vehicleTitle, plate }) {
  if (!ALERTZY_ACCOUNT_KEY) return false;
  const title = `${type || "Notificación"} - ${employeeName || "EMPLEADO"}`;
  const lines = [
    `Empleado: ${employeeName || "EMPLEADO"}`,
    `Tipo: ${type || "Notificación"}`,
    `Prioridad: ${alertzyPriorityLabel(priority)}`
  ];
  if (recNumber) lines.push(`Recepción: ${recNumber}`);
  if (vehicleTitle) lines.push(`Vehículo: ${vehicleTitle}`);
  if (plate) lines.push(`Placa: ${plate}`);
  lines.push("", message || "");
  const body = lines.join("\n");
  const url = `https://alertzy.app/send?accountKey=${encodeURIComponent(ALERTZY_ACCOUNT_KEY)}&title=${encodeURIComponent(title)}&message=${encodeURIComponent(body)}`;
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    return true;
  } catch (error) {
    console.warn("No se pudo enviar notificación Alertzy", error);
    return false;
  }
}

function ensureEmployeeNotifications(current) {
  if (!Array.isArray(current.employeeNotifications)) current.employeeNotifications = [];
  return current.employeeNotifications;
}

function ensureReceptionNotifications(rec) {
  if (!Array.isArray(rec.employeeNotifications)) rec.employeeNotifications = [];
  return rec.employeeNotifications;
}

function renderNotificationCards(items, emptyText = "Sin notificaciones.") {
  if (!items || !items.length) return `<div class="notice">${emptyText}</div>`;
  const cardStatus = (item) => item.completedAt && item.adminAckAt ? "validated" : (item.completedAt ? "completed" : "active");
  return items.map((item) => `
    <article class="notice notification-card priority-${esc(item.priority || "warn")} ${cardStatus(item)}">
      <strong>${esc(item.employeeName || employeeDisplayName(item.employeeId))}</strong>
      <span class="pill ${item.priority === "danger" ? "danger" : "warn"}">${item.priority === "danger" ? "Rojo" : "Amarillo"}</span>
      <small>${item.recNumber ? `Vehículo: ${esc(item.recNumber)}` : "Notificación general"}</small>
      ${item.completedAt && !item.adminAckAt ? '<span class="pill danger">Empleado cumplió - pendiente de validar</span>' : ""}
      ${item.completedAt && item.adminAckAt ? '<span class="pill ok">Cumplimiento validado</span>' : ""}
      <p>${esc(item.message || "")}</p>
      <small>${esc(notificationDate(item.createdAt || new Date().toISOString()))}</small>
      ${item.completedAt ? `<br><small><strong>${esc(item.completedBy || "Empleado")} ya realizó lo solicitado:</strong> ${esc(notificationDate(item.completedAt))}</small>` : ""}
      ${item.adminAckAt ? `<br><small><strong>Validado por administración:</strong> ${esc(notificationDate(item.adminAckAt))}</small>` : ""}
      <div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn" data-action="edit-notification" data-id="${esc(item.id)}">Editar</button>
        <button type="button" class="btn danger" data-action="delete-notification" data-id="${esc(item.id)}">Eliminar</button>
        ${item.completedAt && !item.adminAckAt ? `<button type="button" class="btn primary" data-action="ack-notification" data-id="${esc(item.id)}">Validar cumplimiento</button>` : ""}
        ${item.completedAt && item.adminAckAt ? `<button type="button" class="btn" data-action="reactivate-notification" data-id="${esc(item.id)}">Reactivar notificación</button>` : ""}
      </div>
    </article>`).join("");
}

function allAdminNotifications(current = state()) {
  const global = ensureEmployeeNotifications(current).map((item) => ({ ...item, source: "general" }));
  const vehicle = (current.receptions || []).flatMap((rec) => ensureReceptionNotifications(rec).map((item) => ({
    ...item,
    source: "vehículo",
    recNumber: item.recNumber || rec.number,
    vehicleTitle: `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim()
  })));
  return [...global, ...vehicle].sort((a, b) => String(b.completedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.createdAt || "")));
}

function adminPendingNotificationAcks(current = state()) {
  return allAdminNotifications(current).filter((item) => item.completedAt && !item.adminAckAt);
}

function receptionNotificationAckCount(rec) {
  return ensureReceptionNotifications(rec).filter((item) => item.completedAt && !item.adminAckAt).length;
}

function openAdminNotificationSummary() {
  let modal = qs("[data-admin-notification-modal]");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "image-modal hidden";
    modal.dataset.adminNotificationModal = "1";
    modal.innerHTML = `
      <div class="image-modal-card notification-modal-card" role="dialog" aria-modal="true">
        <div class="image-modal-head">
          <h3>Notificaciones del sistema</h3>
          <button type="button" class="btn" data-action="close-admin-notification-summary">Cerrar</button>
        </div>
        <div class="panel-body grid" data-admin-notification-modal-body></div>
      </div>`;
    document.body.appendChild(modal);
  }
  const body = qs("[data-admin-notification-modal-body]", modal);
  const items = allAdminNotifications();
  body.innerHTML = items.length ? renderNotificationCards(items, "No hay notificaciones.") : '<div class="notice">No hay notificaciones.</div>';
  modal.classList.remove("hidden");
}

function openNotificationEditor(item) {
  return new Promise((resolve) => {
    qs("[data-notification-editor]")?.remove();
    const modal = document.createElement("div");
    modal.className = "image-modal";
    modal.dataset.notificationEditor = "1";
    modal.innerHTML = `
      <div class="image-modal-card notification-modal-card" role="dialog" aria-modal="true">
        <div class="image-modal-head">
          <h3>Editar notificación</h3>
          <button type="button" class="btn" data-edit-notification-cancel>Cerrar</button>
        </div>
        <div class="panel-body form-grid">
          <label class="full">Mensaje
            <textarea rows="5" data-edit-notification-message></textarea>
          </label>
          <label>Prioridad
            <select data-edit-notification-priority>
              <option value="warn">Amarillo</option>
              <option value="danger">Rojo</option>
            </select>
          </label>
          <div class="btn-row full">
            <button type="button" class="btn primary" data-edit-notification-save>Guardar edición</button>
            <button type="button" class="btn" data-edit-notification-cancel>Cancelar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const message = qs("[data-edit-notification-message]", modal);
    const priority = qs("[data-edit-notification-priority]", modal);
    if (message) {
      message.value = item?.message || "";
      setTimeout(() => message.focus(), 30);
    }
    if (priority) priority.value = item?.priority === "danger" ? "danger" : "warn";
    const close = (value) => {
      modal.remove();
      resolve(value);
    };
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-edit-notification-cancel]")) {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.target.closest("[data-edit-notification-save]")) {
        event.preventDefault();
        const nextMessage = message?.value.trim() || "";
        if (!nextMessage) {
          toast("Escriba el mensaje de la notificación.", "warn");
          return;
        }
        close({ message: nextMessage, priority: priority?.value === "danger" ? "danger" : "warn" });
      }
    });
  });
}

function openManualAuthorizationDialog(rec) {
  return new Promise((resolve) => {
    qs("[data-manual-authorization-modal]")?.remove();
    const modal = document.createElement("div");
    modal.className = "image-modal";
    modal.dataset.manualAuthorizationModal = "1";
    modal.innerHTML = `
      <div class="image-modal-card notification-modal-card" role="dialog" aria-modal="true">
        <div class="image-modal-head">
          <h3>Autorizar manualmente</h3>
          <button type="button" class="btn" data-manual-auth-cancel>Cerrar</button>
        </div>
        <div class="panel-body form-grid">
          <div class="notice warn full">
            Se registrará autorización manual para el expediente <strong>${esc(rec?.number || "")}</strong>.
          </div>
          <label class="full">Motivo o referencia
            <textarea rows="4" data-manual-auth-reason>Cliente autoriza personalmente en taller / por llamada</textarea>
          </label>
          <div class="btn-row full">
            <button type="button" class="btn primary" data-manual-auth-save>Registrar autorización</button>
            <button type="button" class="btn" data-manual-auth-cancel>Cancelar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const reason = qs("[data-manual-auth-reason]", modal);
    setTimeout(() => reason?.focus(), 30);
    const close = (value) => {
      modal.remove();
      resolve(value);
    };
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-manual-auth-cancel]")) {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.target.closest("[data-manual-auth-save]")) {
        event.preventDefault();
        close(reason?.value.trim() || "Autorización manual registrada por administrador");
      }
    });
  });
}

function purgeExpiredTrash(current) {
  const limit = 60 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const before = current.receptions.length;
  current.receptions = current.receptions.filter((rec) => {
    if (!rec.deletedAt) return true;
    const deletedAt = Date.parse(rec.deletedAt);
    return Number.isFinite(deletedAt) && now - deletedAt <= limit;
  });
  if (current.selectedId && !current.receptions.some((rec) => rec.id === current.selectedId)) {
    current.selectedId = "";
  }
  return before !== current.receptions.length;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function receptionDateMs(rec) {
  const raw = rec?.tracking?.receptionDate || rec?.fecha || rec?.createdAt || rec?.signatureDate || "";
  if (!raw) return 0;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const isoMatch = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime();
  const svMatch = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (svMatch) return new Date(Number(svMatch[3]), Number(svMatch[2]) - 1, Number(svMatch[1])).getTime();
  return 0;
}

function dateInputMs(value, endOfDay = false) {
  if (!value) return 0;
  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function receptionSearchHaystack(rec) {
  const vehicle = rec.vehicle || {};
  const client = rec.client || {};
  return normalizeSearchText([
    rec.number,
    client.name,
    client.phone,
    vehicle.marca,
    vehicle.modelo,
    vehicle.anio,
    vehicle.color,
    vehicle.placa,
    vehicle.vin,
    vehicle.kilometraje,
    rec.employeeName,
    rec.employeeId,
    rec.status,
    rec.serviceType,
    serviceReason(rec),
    rec.tracking?.receptionDate
  ].filter(Boolean).join(" "));
}

function matchesAdminSearch(rec) {
  const textFilter = normalizeSearchText(adminSearchFilters.text);
  if (textFilter && !receptionSearchHaystack(rec).includes(textFilter)) return false;
  const year = String(adminSearchFilters.vehicleYear || "").trim();
  if (year && String(rec.vehicle?.anio || "").trim() !== year) return false;
  const time = receptionDateMs(rec);
  const from = dateInputMs(adminSearchFilters.dateFrom);
  const to = dateInputMs(adminSearchFilters.dateTo, true);
  if (from && (!time || time < from)) return false;
  if (to && (!time || time > to)) return false;
  return true;
}

function matchesDashboardQuickSearch(rec) {
  const textFilter = normalizeSearchText(adminDashboardQuickSearch);
  return !textFilter || receptionSearchHaystack(rec).includes(textFilter);
}

function applyAdminSearchFilters(receptions) {
  return (receptions || []).filter(matchesAdminSearch);
}

function syncAdminSearchInputs() {
  qsa("[data-admin-search]").forEach((input) => { if (input.value !== adminSearchFilters.text) input.value = adminSearchFilters.text; });
  qsa("[data-admin-date-from]").forEach((input) => { if (input.value !== adminSearchFilters.dateFrom) input.value = adminSearchFilters.dateFrom; });
  qsa("[data-admin-date-to]").forEach((input) => { if (input.value !== adminSearchFilters.dateTo) input.value = adminSearchFilters.dateTo; });
  qsa("[data-admin-vehicle-year]").forEach((input) => { if (input.value !== adminSearchFilters.vehicleYear) input.value = adminSearchFilters.vehicleYear; });
}

function syncDashboardQuickSearchInput() {
  qsa("[data-dashboard-quick-search]").forEach((input) => {
    if (input.value !== adminDashboardQuickSearch) input.value = adminDashboardQuickSearch;
  });
}

function renderCloudSettings() {
  if (!globalThis.AM_CLOUD_SYNC) return;
  const cfg = AM_CLOUD_SYNC.config();
  const endpoint = qs("[data-cloud-endpoint]");
  const account = qs("[data-cloud-account]");
  const enabled = qs("[data-cloud-enabled]");
  const status = qs("[data-cloud-status]");
  if (endpoint && endpoint.value !== cfg.endpoint) endpoint.value = cfg.endpoint || "";
  if (account && account.value !== cfg.account) account.value = cfg.account || "oficinaautomotrizmedina@gmail.com";
  if (enabled) enabled.checked = !!cfg.enabled;
  if (status) {
    status.textContent = cfg.enabled && cfg.endpoint ? "Nube activa" : "Sin configurar";
    status.className = `pill ${cfg.enabled && cfg.endpoint ? "ok" : "info"}`;
  }
}

function cloudLog(message, tone = "") {
  const host = qs("[data-cloud-log]");
  if (host) {
    host.className = `notice ${tone}`;
    host.textContent = message;
  }
  if (message) toast(message, tone);
}

function adminSavingOverlay() {
  let overlay = qs("[data-admin-saving-overlay]");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.dataset.adminSavingOverlay = "1";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:none;place-items:center;background:rgba(8,16,28,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)";
  overlay.innerHTML = `
    <article style="width:min(460px,calc(100vw - 34px));border:1px solid rgba(92,184,205,.45);border-radius:8px;background:#0b2038;color:#eef8ff;padding:26px;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.42)">
      <strong data-admin-saving-title style="display:block;font-size:21px;margin-bottom:14px">Guardando y respaldando</strong>
      <div style="height:12px;border-radius:999px;background:rgba(255,255,255,.16);overflow:hidden;margin-bottom:14px"><span data-admin-saving-bar style="display:block;width:18%;height:100%;border-radius:999px;background:linear-gradient(90deg,#49c7ff,#1b83ff);transition:width .35s ease"></span></div>
      <p data-admin-saving-message style="margin:0;color:#cfe4f5">Esperando confirmacion del servidor.</p>
    </article>`;
  document.body.appendChild(overlay);
  return overlay;
}

function setAdminSaving(show, title = "Guardando y respaldando", message = "Esperando confirmacion del servidor.", progress = 18) {
  const overlay = adminSavingOverlay();
  overlay.style.display = show ? "grid" : "none";
  const titleEl = overlay.querySelector("[data-admin-saving-title]");
  const msgEl = overlay.querySelector("[data-admin-saving-message]");
  const bar = overlay.querySelector("[data-admin-saving-bar]");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchConfirmedCloudSnapshot(exportedAt) {
  if (!globalThis.AM_CLOUD_SYNC?.fetchLatest) throw new Error("La nube no esta disponible.");
  let last = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    setAdminSaving(true, "Guardando y respaldando", attempt < 2 ? "Enviando respaldo al servidor." : "Confirmando lectura desde nube.", 30 + attempt * 12);
    const snapshot = await AM_CLOUD_SYNC.fetchLatest();
    last = snapshot;
    if (snapshot && (!exportedAt || snapshot.exportedAt === exportedAt)) return snapshot;
    await sleep(1200 + attempt * 650);
  }
  throw new Error(last ? "El servidor respondio, pero no confirmo la version recien guardada." : "No se pudo leer el respaldo de nube.");
}

async function confirmCloudSaved(message = "Guardado confirmado en nube.", reason = "confirmed-save") {
  if (!globalThis.AM_CLOUD_SYNC?.isReady?.()) {
    toast("La nube no esta disponible. No se confirmo el guardado.", "danger");
    return false;
  }
  setAdminSaving(true, "Guardando y respaldando", "Preparando respaldo seguro.", 16);
  try {
    const fixedSnapshot = AM_CLOUD_SYNC.snapshot ? AM_CLOUD_SYNC.snapshot() : null;
    await AM_CLOUD_SYNC.saveNow(reason, fixedSnapshot);
    const confirmed = await fetchConfirmedCloudSnapshot(fixedSnapshot?.exportedAt);
    AM_CLOUD_SYNC.applySnapshot?.(confirmed);
    setAdminSaving(true, "Guardado confirmado", "El respaldo fue confirmado correctamente.", 100);
    await sleep(650);
    toast(message, "ok");
    return true;
  } catch (error) {
    console.error(error);
    toast(`No se pudo confirmar en nube: ${error.message || error}`, "danger");
    return false;
  } finally {
    setAdminSaving(false);
  }
}

function resizeAdminMasterFrame() {
  const frame = qs("[data-master-file-frame]");
  if (!frame) return;
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    const body = doc?.body;
    const root = doc?.documentElement;
    const contentHeight = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      window.innerHeight
    );
    frame.style.height = `${Math.max(contentHeight + 80, window.innerHeight - 120)}px`;
  } catch (error) {
    frame.style.height = "2600px";
  }
}

function setAdminMasterFrameSource(href) {
  const frame = qs("[data-master-file-frame]");
  if (!frame) return;
  frame.removeAttribute("srcdoc");
  frame.removeAttribute("sandbox");
  frame.addEventListener("load", () => {
    resizeAdminMasterFrame();
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (doc?.body && !frame.dataset.resizeObserverAttached) {
        const observer = new MutationObserver(() => resizeAdminMasterFrame());
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true });
        frame.dataset.resizeObserverAttached = "1";
      }
    } catch (error) {
      // Si el navegador bloquea acceso al iframe, queda la altura de respaldo.
    }
    setTimeout(resizeAdminMasterFrame, 300);
    setTimeout(resizeAdminMasterFrame, 900);
  }, { once: true });
  if (frame.getAttribute("src") !== href) {
    delete frame.dataset.resizeObserverAttached;
    frame.setAttribute("src", href);
  } else {
    resizeAdminMasterFrame();
  }
}

function setAdminMasterFrameForReception(rec) {
  const frame = qs("[data-master-file-frame]");
  const open = qs("[data-master-file-open]");
  if (!frame || !rec) return;
  if (rec.localArchivePreviewOnly && rec.__localBackup) seedArchiveViewerFromLocalBackup(rec.__localBackup, rec);
  const href = masterFileHref(rec);
  setAdminMasterFrameSource(href);
  if (open) {
    open.href = href;
    open.classList.remove("hidden");
  }
}

function showAdminFileTab(target = adminFileTab) {
  adminFileTab = target || "";
  qsa("[data-admin-file-tab]").forEach((button) => {
    button.classList.toggle("active", !!adminFileTab && button.dataset.adminFileTab === adminFileTab);
  });
  qsa('[data-section="expediente"] [data-tab]').forEach((panel) => {
    panel.classList.toggle("active", !!adminFileTab && panel.dataset.tab === adminFileTab);
  });
  if (adminFileTab === "archivo") {
    const rec = selected();
    if (rec) {
      setAdminMasterFrameForReception(rec);
    }
  }
}

function initTheme() {
  const button = qs("[data-theme-toggle]");
  if (!button) return;
  const saved = localStorage.getItem("am_simple_theme") || "light";
  document.documentElement.dataset.theme = saved;
  button.textContent = saved === "dark" ? "Modo claro" : "Modo oscuro";
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("am_simple_theme", next);
    button.textContent = next === "dark" ? "Modo claro" : "Modo oscuro";
  });
}

function renderReceptionSummary(host, reception = selected()) {
  if (!reception) {
    host.innerHTML = '<div class="notice">No hay expediente seleccionado.</div>';
    return;
  }
  host.innerHTML = `
    ${adminSignatureReviewNotice(reception)}
    <div class="grid cols-3">
      <div class="metric"><span>Recepción</span><strong>${reception.number}</strong><small>${reception.status}</small></div>
      <div class="metric"><span>Cliente</span><strong>${reception.client.name}</strong><small>${reception.client.phone}</small></div>
      <div class="metric"><span>Vehículo</span><strong>${reception.vehicle.marca} ${reception.vehicle.modelo}</strong><small>${reception.vehicle.anio} - ${reception.vehicle.color}</small></div>
    </div>`;
}

function hasCapturedClientSignature(rec) {
  const evidence = rec?.authorizationEvidence || {};
  return !!(
    rec?.quickAuthorization ||
    rec?.signatureDataUrl ||
    evidence.signatureDataUrl ||
    /firma presencial/i.test(evidence.authorizationType || "")
  );
}

function signatureNeedsAdminReview(rec) {
  return hasCapturedClientSignature(rec) && !rec?.adminSignatureReviewedAt;
}

function adminSignatureReviewNotice(rec) {
  if (!signatureNeedsAdminReview(rec)) return "";
  return `
    <div class="notice warn signature-review-alert">
      <strong>Firma del cliente pendiente de revisión administrativa.</strong><br>
      Revise la constancia de autorización y autorice el expediente para habilitar el trabajo del empleado.
    </div>`;
}

function adminAuthorizationCell(rec) {
  if (signatureNeedsAdminReview(rec)) {
    return '<span class="pill warn">Firma capturada</span><br><small class="signature-admin-pending">Revisar y autorizar</small>';
  }
  return rec.signed
    ? '<span class="pill ok">Autorizado</span>'
    : (rec.express ? '<span class="pill info">No aplica</span>' : '<span class="pill warn">Pendiente</span>');
}

function serviceReason(rec) {
  return rec?.serviceReason || rec?.motivo || rec?.reason || rec?.observations || "";
}

function shortText(value, limit = 96) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function makePrivateTokens() {
  return {
    clientToken: "cli_" + AM_SIMPLE_STORE.cryptoToken(),
    trackingToken: "trk_" + AM_SIMPLE_STORE.cryptoToken()
  };
}

function tokenHref(page, token) {
  return `${page}#token=${encodeURIComponent(token)}`;
}

function syncEmployeeModuleVehiclesIntoAdmin() {
  if (document.body.dataset.page !== "admin") return;
  let employeeState = null;
  try {
    employeeState = JSON.parse(localStorage.getItem("am_employee_module_safe_v2") || "null");
  } catch {
    employeeState = null;
  }
  if (!employeeState || !Array.isArray(employeeState.vehicles)) return;
  if (!employeeState.vehicles.length) return;
  AM_SIMPLE_STORE.mutate((current) => {
    if (!Array.isArray(current.deletedReceptionNumbers)) current.deletedReceptionNumbers = [];
    const employeeNumbers = employeeState.vehicles.map((vehicle) => String(vehicle.rec || vehicle.reception || "").trim()).filter(Boolean);
    const activeAdminCount = current.receptions.filter((rec) => !rec?.deletedAt && !rec?.archivedAt).length;
    const shouldReviveEmployeeVehicles = employeeNumbers.length > 0 && activeAdminCount === 0;
    const staleDeleteListBlocksAll = shouldReviveEmployeeVehicles && employeeNumbers.every((number) => current.deletedReceptionNumbers.includes(number));
    if (staleDeleteListBlocksAll) {
      current.deletedReceptionNumbers = current.deletedReceptionNumbers.filter((number) => !employeeNumbers.includes(number));
    }
    employeeState.vehicles.forEach((vehicle) => {
      const number = vehicle.rec || vehicle.reception || "";
      if (!number) return;
      if (current.deletedReceptionNumbers.includes(number)) return;
      let rec = current.receptions.find((item) => item.number === number);
      if (!rec) {
        rec = {
          id: `emp-${vehicle.id || AM_SIMPLE_STORE.cryptoToken()}`,
          number,
          express: !!vehicle.express,
          serviceType: vehicle.tipoServicio || "",
          status: vehicle.estado || "EN REVISIÓN",
          sentToClient: !!(vehicle.autorizado || vehicle.signed),
          signed: !!(vehicle.autorizado || vehicle.signed),
          signatureName: vehicle.signatureName || vehicle.clientName || "",
          signatureDate: vehicle.signatureDate || vehicle.termsAcceptedAt || "",
          signatureDataUrl: vehicle.signatureDataUrl || "",
          manualAuthorization: !!vehicle.manualAuthorization,
          quickAuthorization: !!vehicle.quickAuthorization,
          termsAcceptedAt: vehicle.termsAcceptedAt || vehicle.signatureDate || "",
          authorizationEvidence: vehicle.authorizationEvidence || null,
          clientToken: "cli_" + AM_SIMPLE_STORE.cryptoToken(),
          trackingToken: "trk_" + AM_SIMPLE_STORE.cryptoToken(),
          client: { name: vehicle.clientName || "", phone: vehicle.clientPhone || "" },
          employeeId: vehicle.eid || "edwin",
          employeeName: vehicle.en || "Edwin",
          serviceReason: vehicle.motivo || "",
          vehicle: {},
          photos: [],
          inventory: [],
          observations: "",
          damages: [],
          progress: 0,
          progressLabel: vehicle.estado || "EN REVISIÓN",
          tracking: {},
          internalWork: { internalNote: "", lockedReception: true },
          updates: []
        };
        current.receptions.unshift(rec);
      }
      if (shouldReviveEmployeeVehicles) {
        rec.deletedAt = "";
        rec.deletedBy = "";
        rec.archivedAt = "";
        rec.archivedBy = "";
        rec.deliveredAt = "";
        rec.deliveredBy = "";
      }
      rec.express = !!vehicle.express;
      rec.serviceType = vehicle.tipoServicio || rec.serviceType || "";
      rec.employeeId = vehicle.eid || rec.employeeId || "edwin";
      rec.employeeName = vehicle.en || rec.employeeName || "Edwin";
      rec.status = vehicle.estado || rec.status;
      const vehicleSigned = !!(vehicle.autorizado || vehicle.signed || vehicle.signatureDataUrl);
      rec.sentToClient = vehicleSigned || !!rec.sentToClient;
      rec.signed = vehicleSigned || !!rec.signed;
      if (vehicle.clientName || vehicle.clientPhone) rec.client = { ...(rec.client || {}), name: vehicle.clientName || rec.client?.name || "", phone: vehicle.clientPhone || rec.client?.phone || "" };
      if (vehicle.signatureName || vehicle.clientName) rec.signatureName = vehicle.signatureName || vehicle.clientName;
      if (vehicle.signatureDate || vehicle.termsAcceptedAt) rec.signatureDate = vehicle.signatureDate || vehicle.termsAcceptedAt;
      if (vehicle.signatureDataUrl) rec.signatureDataUrl = vehicle.signatureDataUrl;
      if (vehicle.termsAcceptedAt || vehicle.signatureDate) rec.termsAcceptedAt = vehicle.termsAcceptedAt || vehicle.signatureDate;
      if (vehicle.manualAuthorization) rec.manualAuthorization = true;
      if (vehicle.quickAuthorization) rec.quickAuthorization = true;
      if (vehicle.authorizationEvidence) rec.authorizationEvidence = vehicle.authorizationEvidence;
      rec.serviceReason = vehicle.motivo || rec.serviceReason || "";
      rec.vehicle = {
        marca: vehicle.marca || "",
        modelo: vehicle.modelo || "",
        anio: vehicle.anio || "",
        color: vehicle.color || "",
        placa: vehicle.placa || "",
        vin: vehicle.vin || "",
        kilometraje: vehicle.odometro || vehicle.kilometraje || ""
      };
      rec.photos = Array.isArray(vehicle.photos) ? vehicle.photos.map((photo, index) => ({
        label: photo.label || `Foto ${index + 1}`,
        dataUrl: photo.dataUrl || "",
        note: photo.note || "",
        color: photo.color || (index % 2 === 0 ? "#206f78" : "#b52931")
      })) : rec.photos;
      rec.inventory = Array.isArray(vehicle.inventory) ? vehicle.inventory.map((item, index) => ({
        id: item.id || `inv-${rec.id}-${index}`,
        name: item.name || `Inventario ${index + 1}`,
        present: item.present !== false,
        note: item.note || ""
      })) : rec.inventory;
      rec.observations = vehicle.observaciones || rec.observations || "";
      rec.damages = Array.isArray(vehicle.damages) ? vehicle.damages.map((damage, index) => ({
        id: damage.id || `dam-${rec.id}-${index}`,
        area: damage.area || "Daño",
        detail: damage.detail || "",
        photos: Array.isArray(damage.photos) ? damage.photos : []
      })) : rec.damages;
      if (vehicle.pendingTracking) {
        rec.pendingTracking = {
          ...vehicle.pendingTracking,
          employeeId: vehicle.eid || rec.employeeId,
          employeeName: vehicle.en || rec.employeeName || "EMPLEADO"
        };
        if (rec.publishedProgress != null) rec.progress = Number(rec.publishedProgress || 0);
        else if (Number(rec.progress || 0) === Number(vehicle.pendingTracking.progress || 0)) rec.progress = 0;
      }
      rec.progress = Number(rec.progress || 0);
      rec.progressLabel = rec.progressLabel || rec.tracking?.state || "EN REVISIÓN";
      rec.employeeDeadline = vehicle.deadline || rec.employeeDeadline || "";
      rec.employeeDeadlineSetAt = vehicle.deadlineSetAt || rec.employeeDeadlineSetAt || "";
      rec.employeeDeadlineTokensAvailable = Number(vehicle.deadlineTokensAvailable ?? rec.employeeDeadlineTokensAvailable ?? 3);
      rec.employeeDeadlineTokensUsed = Number(vehicle.deadlineTokensUsed ?? rec.employeeDeadlineTokensUsed ?? 0);
      rec.employeeDeadlineUnlockRequested = !!(vehicle.deadlineUnlockRequested || rec.employeeDeadlineUnlockRequested);
      rec.tracking = {
        ...(rec.tracking || {}),
        receptionDate: [vehicle.fecha, vehicle.hora].filter(Boolean).join(", ") || rec.tracking?.receptionDate || "",
        odometer: `${vehicle.odometro || rec.vehicle.kilometraje || "N/D"} ${vehicle.unidad === "km" ? "KM" : "MILLAS"}`,
        plate: vehicle.placa || "N/D",
        vehicleTitle: `${vehicle.marca || ""} ${vehicle.modelo || ""} ${vehicle.anio || ""}`.trim().toUpperCase(),
        state: rec.tracking?.state || "EN REVISIÓN",
        processDetails: rec.tracking?.processDetails || ""
      };
      if (vehicle.express) {
        rec.tracking.processDetails = vehicle.detalle || `Servicio express: ${vehicle.tipoServicio || "N/D"}`;
      }
      rec.internalWork = {
        ...(rec.internalWork || {}),
        internalNote: vehicle.express ? (rec.internalWork?.internalNote || "Servicio express registrado desde módulo de empleado.") : (Array.isArray(vehicle.bitacora) ? vehicle.bitacora.join("\n") : (vehicle.nota || rec.internalWork?.internalNote || "")),
        lockedReception: true
      };
    });
  }, { markLocalWrite: false });
}

function frontReceptionPhoto(rec) {
  const photos = Array.isArray(rec.photos) ? rec.photos : [];
  return photos.find((photo) => photoLabelKey(photo.label) === "frente") || photos[0] || null;
}

function photoLabelKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function photoLabelTargets(label, fallback = "") {
  const aliasMap = {
    "tarjeta reverso": ["tarjeta reverso", "reverso tarjeta", "reverso de tarjeta"],
    "reverso tarjeta": ["tarjeta reverso", "reverso tarjeta", "reverso de tarjeta"],
    "reverso de tarjeta": ["tarjeta reverso", "reverso tarjeta", "reverso de tarjeta"],
    "tarjeta frente": ["tarjeta frente", "frente tarjeta", "frente de tarjeta"],
    "frente tarjeta": ["tarjeta frente", "frente tarjeta", "frente de tarjeta"],
    "frente de tarjeta": ["tarjeta frente", "frente tarjeta", "frente de tarjeta"],
    "compartimiento motor": ["compartimiento motor", "compartimiento del motor", "compartimento de motor"],
    "compartimiento del motor": ["compartimiento motor", "compartimiento del motor", "compartimento de motor"]
  };
  const keys = [photoLabelKey(label), photoLabelKey(fallback)].filter(Boolean);
  return new Set(keys.flatMap((key) => aliasMap[key] || [key]));
}

function receptionPhotoByLabel(rec, label, fallback = "") {
  const photos = Array.isArray(rec.photos) ? rec.photos : [];
  const targets = photoLabelTargets(label, fallback);
  return photos.find((photo) => targets.has(photoLabelKey(photo.label))) || null;
}

function receptionTableThumb(rec, label = "Frente", fallback = "", className = "") {
  const photo = label === "Frente" ? frontReceptionPhoto(rec) : receptionPhotoByLabel(rec, label, fallback);
  const shortLabel = label.replace(/^Tarjeta\s+/i, "");
  if (photo?.dataUrl) {
    return `<button type="button" class="table-thumb ${className}" data-action="open-image-preview" data-id="${esc(rec.id)}" data-label="${esc(label)}" title="Ver ${esc(label)}"><img src="${photo.dataUrl}" alt="${esc(label)} ${esc(rec.vehicle?.marca || "vehículo")}"></button>`;
  }
  return `<div class="table-thumb table-thumb-empty ${className}">${esc(shortLabel)}</div>`;
}

function closeImagePreview() {
  qs("[data-image-modal]")?.classList.add("hidden");
}

function openImagePreview(recId, label) {
  const rec = state().receptions.find((item) => item.id === recId);
  if (!rec) return;
  const photo = label === "Frente" ? frontReceptionPhoto(rec) : receptionPhotoByLabel(rec, label);
  if (!photo?.dataUrl) return;
  openImagePreviewFromData(photo.dataUrl, `${label} - ${rec.number || ""}`, `${label} ${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""}`.trim());
}

function openImagePreviewFromData(dataUrl, title = "Imagen", alt = "") {
  if (!dataUrl) return;
  let modal = qs("[data-image-modal]");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "image-modal hidden";
    modal.dataset.imageModal = "1";
    modal.innerHTML = `
      <div class="image-modal-card" role="dialog" aria-modal="true">
        <div class="image-modal-head">
          <h3 data-image-modal-title>Imagen</h3>
          <button type="button" class="btn" data-action="close-image-preview">Cerrar</button>
        </div>
        <div class="image-modal-body"><img data-image-modal-img alt=""></div>
      </div>`;
    document.body.appendChild(modal);
  }
  qs("[data-image-modal-title]", modal).textContent = title;
  const img = qs("[data-image-modal-img]", modal);
  img.src = dataUrl;
  img.alt = alt || title;
  modal.classList.remove("hidden");
}

function authorizationTermsHtml() {
  return `
    <h3>Contrato de servicio</h3>
    <p>El cliente autoriza a Automotriz Medina a recibir el vehículo identificado en esta recepción y a realizar las revisiones, pruebas, diagnósticos y verificaciones necesarias para determinar el estado del vehículo y el trabajo requerido.</p>
    <p>El cliente comprende que durante una revisión pueden aparecer fallas preexistentes, intermitentes o no visibles al momento de la recepción. Automotriz Medina no se responsabiliza por fallas previas, desgaste natural, manipulaciones anteriores o condiciones ocultas del vehículo.</p>
    <p>La garantía de mano de obra aplica por 30 días continuos, cuando corresponda y siempre que el vehículo no haya sido intervenido por terceros. Componentes eléctricos, electrónicos, sensores, módulos, computadoras, piezas usadas, piezas reparadas y repuestos proporcionados por el cliente quedan excluidos de garantía salvo acuerdo escrito distinto.</p>
    <p>El cliente declara haber revisado las fotografías, el inventario, las observaciones y los daños registrados. Dinero, documentos, herramientas, objetos personales o accesorios no declarados en esta recepción quedan bajo responsabilidad del cliente.</p>
    <p>Una vez notificado que el vehículo está listo para retiro, el cliente tendrá 72 horas para retirarlo sin cargo adicional. Después de ese periodo podrá aplicarse un cargo diario de $5.00 USD por resguardo, parqueo, pernocta o custodia.</p>
    <p>Sí el vehículo no es retirado ni reclamado durante 90 días continuos después de la notificación, podrá considerarse abandonado y Automotriz Medina podrá iniciar las gestiones legales correspondientes para recuperar saldos pendientes por diagnóstico, reparación, repuestos, almacenaje u otros cargos relacionados.</p>
    <p>Automotriz Medina podrá retener el vehículo hasta que el cliente cancele por completo facturas, repuestos, mano de obra, diagnósticos, almacenaje, custodia u otros cargos autorizados o derivados del servicio.</p>
    <p>Al aceptar estos términos, el cliente autoriza proceder con el diagnóstico y/o reparación segun la información acordada con el taller.</p>`;
}

function authorizationProofHtml(rec) {
  const evidence = rec.authorizationEvidence || {};
  return rec.signed ? `
    <div class="notice">
      <strong>Autorizado por:</strong> ${esc(rec.signatureName || rec.client.name || "Cliente")}<br>
      <strong>Fecha:</strong> ${esc(rec.signatureDate || "")}<br>
      <strong>Tipo de autorización:</strong> ${esc(evidence.authorizationType || "Cliente por link")}<br>
      <strong>Registrado por:</strong> ${esc(evidence.registeredBy || "Cliente")}<br>
      <strong>Token:</strong> ${esc(rec.clientToken || "")}<br>
      <strong>Navegador:</strong> ${esc(evidence.userAgent || "No registrado")}<br>
      <strong>Plataforma:</strong> ${esc(evidence.platform || "No registrado")}<br>
      <strong>Idioma:</strong> ${esc(evidence.language || "No registrado")}<br>
      <strong>Zona horaria:</strong> ${esc(evidence.timezone || "No registrado")}<br>
      <strong>Pantalla:</strong> ${esc(evidence.screen || "No registrado")}<br>
      <strong>Ventana:</strong> ${esc(evidence.viewport || "No registrado")}
    </div>
    ${rec.signatureDataUrl ? `<div class="signature-preview"><strong>Firma registrada:</strong><br><img src="${rec.signatureDataUrl}" alt="Firma del cliente"></div>` : ""}` : '<div class="notice warn">Aún no hay autorización del cliente.</div>';
}

function renderAdminAuthorizationView(rec) {
  const host = qs("[data-admin-authorization-view]");
  if (!host) return;
  const statusLabel = rec.signed ? "Autorizado" : "Pendiente de autorización";
  const statusClass = rec.signed ? "ok" : "warn";
  host.innerHTML = `
    <article class="panel admin-authorization-view" data-admin-authorization-card>
      <div class="panel-header">
        <div><h3>Autorización administrativa</h3><p>Vista interna del expediente enviado y constancia del cliente.</p></div>
        <span class="pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="panel-body grid">
        <div class="grid cols-3">
          <div class="metric"><span>Cliente</span><strong>${esc(rec.client.name || "Cliente pendiente")}</strong><small>${esc(rec.client.phone || "Sin teléfono")}</small></div>
          <div class="metric"><span>Vehículo</span><strong>${esc(`${rec.vehicle.marca || ""} ${rec.vehicle.modelo || ""}`.trim() || "Vehículo")}</strong><small>${esc(`${rec.vehicle.anio || ""} ${rec.vehicle.placa || ""}`.trim() || "Sin placa")}</small></div>
          <div class="metric"><span>Recepción</span><strong>${esc(rec.number || "")}</strong><small>${esc(rec.status || "")}</small></div>
        </div>
        <div class="notice">
          <strong>Motivo de recepción / falla reportada:</strong><br>
          ${esc(serviceReason(rec) || "Sin motivo registrado.")}
        </div>
        <div class="notice ${rec.signed ? "" : "warn"}">
          ${rec.signed
            ? "El cliente ya aceptó esta autorización. Esta es la copia administrativa de lo que autorizo y la constancia registrada para imprimir."
            : "Esta autorización aún no ha sido aceptada por el cliente. Aquí puede revisar el expediente que se envió o se enviará al cliente."}
        </div>
        <div class="terms-box" tabindex="0">${authorizationTermsHtml()}</div>
        <article class="panel">
          <div class="panel-header"><h3>Constancia de autorización</h3></div>
          <div class="panel-body grid">${authorizationProofHtml(rec)}</div>
        </article>
      </div>
    </article>`;
}

function receptionRowActions(rec) {
  if (isDeleted(rec)) {
    return `
      <button class="btn" data-action="download-backup" data-id="${rec.id}" title="Descargar respaldo individual">Descargar</button>
      <button class="btn" data-action="restore-trash-reception" data-id="${rec.id}" title="Restaurar al dashboard">Restaurar</button>
      <button class="btn danger icon-remove table-remove" data-action="purge-trash-reception" data-id="${rec.id}" title="Eliminar definitivamente">X</button>`;
  }
  if (isArchived(rec)) {
    return `
      <button class="btn" data-action="download-backup" data-id="${rec.id}" title="Descargar respaldo individual">Descargar</button>
      <button class="btn" data-action="unarchive-reception" data-id="${rec.id}" title="Sacar de archivados">Desarchivar</button>
      ${rec.localArchiveConfirmedAt ? `<button class="btn danger" data-action="delete-cloud-archived" data-id="${rec.id}" title="Eliminar este expediente del respaldo activo de nube">Borrar de la nube</button>` : ""}
      <button class="btn danger icon-remove table-remove" data-action="delete-reception" data-id="${rec.id}" title="Mover a papelera">X</button>`;
  }
  return `
    <button class="btn" data-action="download-backup" data-id="${rec.id}" title="Descargar respaldo individual">Descargar</button>
    <button class="btn" data-action="grant-deadline-token" data-id="${rec.id}" title="Habilitar tokens extra">Token +</button>
    ${String(rec.status || "").toUpperCase() === "FINALIZADO" ? `<button class="btn primary" data-action="reactivate-reception" data-id="${rec.id}" title="Reactivar y devolver a vehículos en taller">Reactivar</button>` : ""}
    <button class="btn" data-action="archive-reception" data-id="${rec.id}" title="Archivar expediente">Archivar</button>
    <button class="btn danger icon-remove table-remove" data-action="delete-reception" data-id="${rec.id}" title="Mover a papelera">X</button>`;
}

function renderReceptionTable() {
  const tbody = qs("[data-reception-table]");
  if (!tbody) return;
  const current = state();
  const filtered = applyAdminSearchFilters(current.receptions.filter((rec) => {
    if (adminDashboardFilter === "archived") return isArchived(rec);
    if (adminDashboardFilter === "trash") return isDeleted(rec);
    if (adminDashboardFilter === "finished") return isActiveDashboardRec(rec) && rec.status === "FINALIZADO";
    if (!isActiveDashboardRec(rec)) return false;
    if (isPublishedFinalized(rec)) return false;
    if (adminDashboardFilter === "employee") {
      const employeeId = String(rec.employeeId || rec.employeeName || "").toLowerCase();
      return employeeId.includes(adminEmployeeFilter);
    }
    if (adminDashboardFilter === "workshop") return rec.status !== "FINALIZADO" && rec.status !== "ENTREGADO";
    if (adminDashboardFilter === "delivered") return rec.status === "ENTREGADO";
    if (adminDashboardFilter === "pending") return !rec.signed;
    if (adminDashboardFilter === "sent") return !!rec.sentToClient;
    return true;
  })).filter(matchesDashboardQuickSearch);
  syncDashboardQuickSearchInput();
  qsa("[data-admin-search-count]").forEach((input) => { input.value = `${filtered.length} expediente(s)`; });
  tbody.innerHTML = filtered.map((rec) => `
    <tr class="clickable-row ${String(rec.status || "").toUpperCase() === "FINALIZADO" ? "row-finalized" : ""} ${signatureNeedsAdminReview(rec) ? "row-signature-review" : ""}" data-open-file-row="${rec.id}" tabindex="0" title="Abrir seguimiento">
      <td data-label="Vehículo">${finalizationNeedsPublish(rec) ? `<button class="btn primary publish-finalization-btn" data-action="publish-finalization" data-id="${rec.id}" title="Publicar finalización al cliente">Publicar finalización</button>` : ""}<strong>${rec.vehicle.marca} ${rec.vehicle.modelo} ${rec.vehicle.anio}</strong>${receptionNotificationAckCount(rec) ? `<span class="vehicle-notify-count admin-vehicle-notify-count" title="Confirmaciones pendientes">${receptionNotificationAckCount(rec)}</span>` : ""}${signatureNeedsAdminReview(rec) ? `<span class="vehicle-notify-count admin-vehicle-notify-count signature-review-count" title="Firma pendiente de revisión">!</span>` : ""}<br><small>${rec.vehicle.placa}</small></td>
      <td data-label="Fotografía">${receptionTableThumb(rec, "Frente")}</td>
      <td data-label="Tarjeta reverso">${receptionTableThumb(rec, "Tarjeta reverso", "", "card-thumb")}</td>
      <td data-label="Tarjeta frente">${receptionTableThumb(rec, "Tarjeta frente", "", "card-thumb")}</td>
      <td data-label="Técnico">${rec.employeeName || "N/D"}</td>
      <td data-label="Tiempo límite">${deadlineBadge(rec)}</td>
      <td data-label="Estado"><span class="pill ${statusTone(rec.status)}">${rec.status}</span>${rec.express ? `<br><small>${esc(rec.serviceType || "Servicio express")}</small>` : ""}</td>
      <td data-label="Autorización">${adminAuthorizationCell(rec)}</td>
      <td data-label="Cliente">${rec.client.name || "Cliente pendiente"}<br><small>${rec.client.phone || "Sin teléfono"}</small></td>
      <td data-label="Motivo">${esc(shortText(serviceReason(rec) || "Sin motivo registrado", 110))}</td>
      <td data-label="Recepción"><strong>${rec.number}</strong><br><small>${isDeleted(rec) ? `Papelera: ${new Date(rec.deletedAt).toLocaleDateString("es-SV")}` : rec.clientToken}</small><div class="table-actions">${receptionRowActions(rec)}</div></td>
    </tr>`).join("") || '<tr><td colspan="11">No hay vehículos en este filtro.</td></tr>';
  qsa("[data-admin-filter]").forEach((button) => {
    const isEmployee = button.dataset.adminFilter === "employee" && adminDashboardFilter === "employee" && button.dataset.employeeFilter === adminEmployeeFilter;
    const isDirect = button.dataset.adminFilter !== "employee" && button.dataset.adminFilter === adminDashboardFilter;
    button.classList.toggle("active", isEmployee || isDirect);
  });
  const employeeMenu = qs("[data-employee-filter-menu]");
  if (employeeMenu) employeeMenu.classList.toggle("hidden", adminDashboardFilter !== "employee" && adminDashboardFilter !== "workshop");
  qsa("[data-admin-metric-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminMetricFilter === adminDashboardFilter);
  });
}

function clientCatalogKey(rec) {
  const client = rec.client || {};
  const name = normalizeSearchText(client.name || "cliente pendiente");
  const phone = normalizeSearchText(client.phone || "");
  return `${name}|${phone}`;
}

function clientDisplayName(rec) {
  return rec.client?.name || "Cliente pendiente";
}

function clientYearSummary(records) {
  const counts = {};
  records.forEach((rec) => {
    const time = receptionDateMs(rec);
    const year = time ? new Date(time).getFullYear() : "Sin fecha";
    counts[year] = (counts[year] || 0) + 1;
  });
  return Object.entries(counts)
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .map(([year, count]) => `${year}: ${count}`)
    .join(" | ");
}

function renderClientCatalog() {
  const host = qs("[data-client-catalog]");
  if (!host) return;
  const records = applyAdminSearchFilters(state().receptions.filter((rec) => !isDeleted(rec)));
  const groups = new Map();
  records.forEach((rec) => {
    const key = clientCatalogKey(rec);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  });
  const clients = Array.from(groups.values()).sort((a, b) => clientDisplayName(a[0]).localeCompare(clientDisplayName(b[0]), "es"));
  qsa("[data-admin-search-count]").forEach((input) => { input.value = `${records.length} expediente(s) / ${clients.length} cliente(s)`; });
  host.innerHTML = clients.map((recordsForClient) => {
    const first = recordsForClient[0];
    const vehicles = new Set(recordsForClient.map((rec) => normalizeSearchText(`${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""} ${rec.vehicle?.placa || ""}`)).filter(Boolean));
    const sorted = recordsForClient.slice().sort((a, b) => receptionDateMs(b) - receptionDateMs(a));
    return `
      <article class="panel client-card">
        <div class="panel-header">
          <div>
            <h3>${esc(clientDisplayName(first))}</h3>
            <p>${esc(first.client?.phone || "Sin teléfono")} | ${recordsForClient.length} expediente(s) | ${vehicles.size || recordsForClient.length} vehículo(s)</p>
          </div>
          <span class="pill info">${esc(clientYearSummary(recordsForClient) || "Sin fechas")}</span>
        </div>
        <div class="panel-body table-wrap">
          <table>
            <thead><tr><th>Vehículo</th><th>Recepción</th><th>Técnico</th><th>Estado</th><th>Autorización</th><th>Acción</th></tr></thead>
            <tbody>
              ${sorted.map((rec) => `
                <tr class="clickable-row" data-open-file-row="${rec.id}" tabindex="0" title="Abrir seguimiento">
                  <td data-label="Vehículo">${esc(`${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim() || "Vehículo")}<br><small>${esc(rec.vehicle?.placa || rec.vehicle?.vin || "Sin placa")}</small></td>
                  <td data-label="Recepción"><strong>${esc(rec.number || "")}</strong><br><small>${esc(rec.tracking?.receptionDate || "")}</small></td>
                  <td data-label="Técnico">${esc(rec.employeeName || "N/D")}</td>
                  <td data-label="Estado"><span class="pill ${statusTone(rec.status)}">${esc(rec.status || "")}</span>${isArchived(rec) ? '<br><small>Archivado</small>' : ""}</td>
                  <td data-label="Autorización">${rec.signed ? '<span class="pill ok">Autorizado</span>' : (rec.express ? '<span class="pill info">No aplica</span>' : '<span class="pill warn">Pendiente</span>')}</td>
                  <td data-label="Acción"><div class="table-actions"><button class="btn" data-action="download-backup" data-id="${rec.id}">Descargar</button><button class="btn primary" data-action="open-file" data-id="${rec.id}">Abrir</button></div></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </article>`;
  }).join("") || '<div class="notice">No hay clientes que coincidan con la búsqueda.</div>';
}

function saveAdminAllFromDom(current) {
  const rec = AM_SIMPLE_STORE.selected(current);
  if (!rec) return;
  qsa("[data-admin-client-field]").forEach((input) => {
    const key = input.dataset.adminClientField;
    if (key) rec.client[key] = input.value || "";
  });
  const get = (key) => qs(`[data-admin-edit="${key}"]`)?.value || "";
  if (qs('[data-admin-edit="employeeName"]')) {
    rec.employeeName = get("employeeName") || rec.employeeName;
    rec.employeeId = String(rec.employeeName || "").toLowerCase();
    rec.status = get("status") || rec.status;
    rec.adminEdited = true;
    rec.vehicle.marca = get("marca");
    rec.vehicle.modelo = get("modelo");
    rec.vehicle.anio = get("anio");
    rec.vehicle.color = get("color");
    rec.vehicle.placa = get("placa");
    rec.vehicle.vin = get("vin");
    rec.vehicle.kilometraje = get("kilometraje");
    rec.serviceReason = get("serviceReason");
    rec.observations = get("observations");
    rec.inventory.forEach((item) => {
      item.present = !!qs(`[data-admin-inv-present="${item.id}"]`)?.checked;
      item.note = qs(`[data-admin-inv-note="${item.id}"]`)?.value || "";
    });
    rec.photos.forEach((photo, index) => {
      photo.note = qs(`[data-admin-photo-note="${index}"]`)?.value || "";
    });
    rec.damages.forEach((damage) => {
      damage.área = qs(`[data-admin-damage-área="${damage.id}"]`)?.value || "";
      damage.detail = qs(`[data-admin-damage-detail="${damage.id}"]`)?.value || "";
    });
  }
  const profile = trackingProfile(rec);
  qsa("[data-track-field]").forEach((input) => {
    profile[input.dataset.trackField] = input.value;
  });
  if (qs("[data-admin-progress]")) rec.progress = Number(qs("[data-admin-progress]").value || 0);
  const processInputs = qsa("[data-admin-process-row]");
  if (processInputs.length) profile.processDetails = collectAdminProcessRows().map(formatProcessRow).join("\n");
  const internalInputs = qsa("[data-admin-internal-row]");
  if (internalInputs.length) {
    const rows = internalInputs.map((input) => input.value.trim()).filter(Boolean);
    rec.internalWork = { ...(rec.internalWork || {}), internalNote: rows.join("\n"), lockedReception: true };
  }
  profile.vehicleTitle = profile.vehicleTitle || `${rec.vehicle.marca} ${rec.vehicle.modelo} ${rec.vehicle.anio}`.trim().toUpperCase();
  profile.plate = profile.plate || rec.vehicle.placa || "N/D";
  profile.odometer = profile.odometer || (rec.vehicle.kilometraje ? `${rec.vehicle.kilometraje} MILLAS` : "N/D");
  rec.status = profile.state || rec.status;
  rec.progressLabel = profile.state || rec.status || "En proceso";
}

function adminHashParams() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  return new URLSearchParams(raw);
}

function pushAdminHash(hash) {
  const next = hash.startsWith("#") ? hash : `#${hash}`;
  if (location.hash === next) return;
  history.pushState(null, "", next);
}

function applyAdminHashRoute() {
  if (document.body.dataset.page !== "admin") return;
  const params = adminHashParams();
  const fileId = params.get("expediente");
  if (fileId) {
    const current = state();
    if (current.receptions.some((rec) => rec.id === fileId)) AM_SIMPLE_STORE.setSelectedId(fileId);
    adminFileTab = params.get("tab") || adminFileTab || "seguimiento";
    renderAdmin();
    showSection("expediente");
    showAdminFileTab(adminFileTab);
    return;
  }
  renderAdmin();
  showSection("dashboard");
}

function openAdminReceptionFile(id, shouldPush = true) {
  if (!id) return;
  adminLocalArchivePreviewRec = null;
  const current = state();
  if (!current.receptions.some((rec) => rec.id === id)) {
    toast("No se encontró el expediente seleccionado.", "danger");
    return;
  }
  AM_SIMPLE_STORE.setSelectedId(id);
  if (shouldPush) pushAdminHash(`expediente=${encodeURIComponent(id)}&tab=seguimiento`);
  adminFileTab = "seguimiento";
  renderAdmin();
  showSection("expediente");
  showAdminFileTab("seguimiento");
  toast("Expediente abierto.");
}

function showSection(target, options = {}) {
  qsa("[data-section]").forEach((section) => section.classList.toggle("hidden", section.dataset.section !== target));
  qsa("[data-section-target]").forEach((button) => button.classList.toggle("active", button.dataset.sectionTarget === target));
  const dashboardFilters = qs("[data-dashboard-filter-menu]");
  const searchPanel = qs("[data-admin-search-panel]");
  if (searchPanel) searchPanel.classList.toggle("hidden", !(target === "dashboard" && adminDashboardFilter === "archived"));
  const expedienteMenu = qs("[data-expediente-menu]");
  const expedienteVineta = target === "vineta" && options.fromExpediente;
  if (target !== "expediente" && !expedienteVineta && expedienteMenu) expedienteMenu.classList.add("hidden");
  if (target === "dashboard") {
    if (expedienteMenu) expedienteMenu.classList.add("hidden");
    if (dashboardFilters) dashboardFilters.classList.remove("hidden");
  } else if (target === "expediente" || expedienteVineta) {
    if (expedienteMenu) expedienteMenu.classList.remove("hidden");
    if (dashboardFilters) dashboardFilters.classList.add("hidden");
  } else if (dashboardFilters) {
    dashboardFilters.classList.remove("hidden");
  }
  const mobile = qs("[data-mobile-nav]");
  if (mobile && mobile.querySelector(`option[value="${target}"]`)) mobile.value = target;
  if (target === "nube") renderCloudSettings();
}

function fillReceptionForm() {
  const form = qs("[data-reception-form]");
  if (!form) return;
  const rec = selected();
  Object.entries({ ...rec.client, ...rec.vehicle, observations: rec.observations }).forEach(([key, value]) => {
    const input = qs(`[name="${key}"]`, form);
    if (input) input.value = value || "";
  });
}

function collectReceptionForm() {
  const form = qs("[data-reception-form]");
  const data = new FormData(form);
  return {
    client: { name: data.get("name") || "Cliente", phone: data.get("phone") || "" },
    vehicle: {
      marca: data.get("marca") || "",
      modelo: data.get("modelo") || "",
      anio: data.get("anio") || "",
      color: data.get("color") || "",
      placa: data.get("placa") || "",
      vin: data.get("vin") || "",
      kilometraje: data.get("kilometraje") || ""
    },
    observations: data.get("observations") || ""
  };
}

function renderPhotoEditor() {
  const host = qs("[data-photo-editor]");
  if (!host) return;
  const rec = selected();
  host.innerHTML = rec.photos.map((photo, index) => `
    <article class="photo-card">
      ${photoVisual(photo)}
      <div class="field">
        <label>${photo.label}</label>
        <input type="file" accept="image/*" capture="environment" data-photo-index="${index}">
        <input placeholder="Nota opcional" value="${photo.note || ""}" data-photo-note="${index}">
      </div>
    </article>`).join("");
}

function renderInventory() {
  const host = qs("[data-inventory]");
  if (!host) return;
  const rec = selected();
  host.innerHTML = rec.inventory.map((item) => `
    <div class="check-item">
      <input type="checkbox" ${item.present ? "checked" : ""} data-inventory-present="${item.id}">
      <div style="width:100%">
        <strong>${item.name}</strong>
        <input placeholder="Detalle" value="${item.note || ""}" data-inventory-note="${item.id}">
      </div>
    </div>`).join("");
}

function renderDamageEditor() {
  const host = qs("[data-damages]");
  if (!host) return;
  const rec = selected();
  host.innerHTML = rec.damages.map((damage) => `
    <article class="panel">
      <div class="panel-header">
        <div><h3>${damage.área}</h3><p>${damage.detail}</p></div>
        <button class="btn danger" data-action="remove-damage" data-id="${damage.id}">Quitar</button>
      </div>
      <div class="panel-body">
        <div class="photo-grid">
          ${damage.photos.map((photo, photoIndex) => `
            <article class="photo-card">
              ${photoVisual(photo)}
              <div class="field">
                <label>Foto del daño</label>
                <input type="file" accept="image/*" capture="environment" data-damage-photo="${damage.id}" data-photo-index="${photoIndex}">
              </div>
            </article>`).join("")}
        </div>
      </div>
    </article>`).join("") || '<div class="notice">No hay daños registrados.</div>';
}

function renderAdmin() {
  syncEmployeeModuleVehiclesIntoAdmin();
  AM_SIMPLE_STORE.mutate((current) => {
    purgeExpiredTrash(current);
  });
  syncAdminHashSelection();
  const current = state();
  const rec = selected();
  const metrics = qs("[data-admin-metrics]");
  if (metrics) {
    const visible = current.receptions.filter((rec) => isActiveDashboardRec(rec) && !isPublishedFinalized(rec));
    const activeRecords = current.receptions.filter(isActiveDashboardRec);
    const pending = visible.filter((r) => !r.signed).length;
    const sent = visible.filter((r) => r.sentToClient).length;
    const finished = activeRecords.filter((r) => r.status === "FINALIZADO").length;
    const delivered = activeRecords.filter((r) => r.status === "ENTREGADO").length;
    const archived = current.receptions.filter(isArchived).length;
    const adminNotifications = adminPendingNotificationAcks(current).length;
    metrics.innerHTML = `
      <button type="button" class="metric metric-button" data-admin-metric-filter="all"><span>Recepciones</span><strong>${visible.length}</strong><small>Activas en dashboard</small></button>
      <button type="button" class="metric metric-button" data-admin-metric-filter="pending"><span>Pendientes</span><strong>${pending}</strong><small>Cliente aún no autoriza</small></button>
      <button type="button" class="metric metric-button" data-admin-metric-filter="sent"><span>Enviadas</span><strong>${sent}</strong><small>Link generado</small></button>
      <button type="button" class="metric metric-button" data-admin-metric-filter="finished"><span>Finalizados</span><strong>${finished}</strong><small>Pendientes de entrega</small></button>
      <button type="button" class="metric metric-button" data-admin-metric-filter="delivered"><span>Entregados</span><strong>${delivered}</strong><small>Cerrados por admin</small></button>
      <button type="button" class="metric metric-button" data-admin-metric-filter="archived"><span>Archivados</span><strong>${archived}</strong><small>Fuera del dashboard</small></button>
      <button type="button" class="metric metric-button ${adminNotifications ? "admin-notification-alert" : ""}" data-action="open-admin-notification-summary"><span>Notificaciones</span><strong>${adminNotifications}</strong><small>${adminNotifications ? "Empleado cumplió - validar" : "Sin confirmaciones pendientes"}</small></button>`;
  }
  renderReceptionTable();
  const summary = qs("[data-admin-selected-summary]");
  if (summary) renderReceptionSummary(summary, rec);
  const links = qs("[data-client-links]");
  if (links) {
    links.innerHTML = rec ? `
      <div class="notice">
        Autorización cliente: <a href="${tokenHref("cliente.html", rec.clientToken)}">${tokenHref("cliente.html", rec.clientToken)}</a><br>
        Seguimiento: <a href="${tokenHref("seguimiento.html", rec.trackingToken)}">${tokenHref("seguimiento.html", rec.trackingToken)}</a>
      </div>` : '<div class="notice">Seleccione un expediente para ver enlaces.</div>';
  }
  const openClient = qs("[data-open-client]");
  if (openClient && rec) openClient.href = tokenHref("cliente.html", rec.clientToken);
  const openTracking = qs("[data-open-tracking]");
  if (openTracking && rec) openTracking.href = tokenHref("seguimiento.html", rec.trackingToken);
  renderAdminFile(rec);
  renderTrackingAdmin();
  renderTabs();
  showAdminFileTab(adminFileTab);
  syncAdminSearchInputs();
  renderClientCatalog();
  renderAdminNotifications();
}

function renderAdminNotifications() {
  const current = state();
  const globalHost = qs("[data-admin-global-notifications]");
  if (globalHost) {
    const items = ensureEmployeeNotifications(current).slice().sort((a, b) => String(b.completedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.createdAt || "")));
    globalHost.innerHTML = renderNotificationCards(items, "No hay notificaciones generales enviadas.");
  }
  const countHost = qs("[data-admin-notification-count]");
  if (countHost) {
    const pending = adminPendingNotificationAcks(current).length;
    countHost.textContent = `${pending} pendiente(s)`;
    countHost.className = `pill ${pending ? "danger" : "ok"}`;
  }
  const vehicleHost = qs("[data-admin-vehicle-notifications]");
  if (vehicleHost) {
    const rec = selected();
    const items = rec ? ensureReceptionNotifications(rec).slice().sort((a, b) => String(b.completedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.createdAt || ""))) : [];
    vehicleHost.innerHTML = renderNotificationCards(items, "No hay notificaciones para este vehículo.");
  }
}

function findNotificationInState(current, id) {
  const global = ensureEmployeeNotifications(current);
  const globalIndex = global.findIndex((item) => item.id === id);
  if (globalIndex >= 0) return { type: "global", list: global, index: globalIndex, item: global[globalIndex], rec: null };
  for (const rec of current.receptions || []) {
    const list = ensureReceptionNotifications(rec);
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) return { type: "vehicle", list, index, item: list[index], rec };
  }
  return null;
}

function syncAdminHashSelection() {
  if (document.body.dataset.page !== "admin") return;
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(raw);
  const fileId = params.get("expediente");
  if (!fileId) return;
  const current = state();
  if (current.selectedId === fileId) return;
  if (!current.receptions.some((rec) => rec.id === fileId)) return;
  AM_SIMPLE_STORE.mutate((state) => {
    state.selectedId = fileId;
  });
}

function renderAdminFile(rec) {
  const hasSelection = !!rec;
  const empty = qs("[data-admin-file-empty]");
  const panel = qs("[data-admin-file-panel]");
  const expedienteMenu = qs("[data-expediente-menu]");
  if (empty) empty.classList.toggle("hidden", hasSelection);
  if (panel) panel.classList.toggle("hidden", !hasSelection);
  if (expedienteMenu) expedienteMenu.classList.toggle("hidden", !hasSelection);
  if (!hasSelection) return;
  qsa("[data-admin-client-field]").forEach((input) => {
    input.value = rec.client?.[input.dataset.adminClientField] || "";
  });
  const links = qs("[data-admin-file-links]");
  if (links) {
    links.innerHTML = `
      <div class="notice">
        <strong>Link de autorización:</strong> <a href="${tokenHref("cliente.html", rec.clientToken)}">${tokenHref("cliente.html", rec.clientToken)}</a><br>
        <strong>Link de seguimiento:</strong> <a href="${tokenHref("seguimiento.html", rec.trackingToken)}">${tokenHref("seguimiento.html", rec.trackingToken)}</a>
      </div>`;
  }
  setAdminMasterFrameForReception(rec);
  const vehicle = qs("[data-admin-file-vehicle]");
  if (vehicle) {
    vehicle.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Técnico</label><select data-admin-edit="employeeName"><option ${String(rec.employeeName || "").toUpperCase() === "EDWIN" ? "selected" : ""}>EDWIN</option><option ${String(rec.employeeName || "").toUpperCase() === "RAFAEL" ? "selected" : ""}>RAFAEL</option><option ${String(rec.employeeName || "").toUpperCase() === "CRISTIAN" ? "selected" : ""}>CRISTIAN</option></select></div>
        <div class="field"><label>Estado</label><select data-admin-edit="status">${statusOptions(rec.status)}</select></div>
        <div class="field"><label>Marca</label><input data-admin-edit="marca" value="${esc(rec.vehicle.marca)}"></div>
        <div class="field"><label>Modelo</label><input data-admin-edit="modelo" value="${esc(rec.vehicle.modelo)}"></div>
        <div class="field"><label>Año</label><select data-admin-edit="anio">${yearOptions(rec.vehicle.anio)}</select></div>
        <div class="field"><label>Color</label><input data-admin-edit="color" value="${esc(rec.vehicle.color)}"></div>
        <div class="field"><label>Placa</label><input data-admin-edit="placa" value="${esc(rec.vehicle.placa)}"></div>
        <div class="field"><label>VIN</label><input data-admin-edit="vin" value="${esc(rec.vehicle.vin)}"></div>
        <div class="field"><label>Kilometraje</label><input data-admin-edit="kilometraje" value="${esc(rec.vehicle.kilometraje)}"></div>
        <div class="field full"><label>Motivo de recepción / falla reportada</label><textarea data-admin-edit="serviceReason">${esc(serviceReason(rec))}</textarea></div>
      </div>`;
  }
  const inventory = qs("[data-admin-file-inventory]");
  if (inventory) {
    inventory.innerHTML = rec.inventory.map((item) => `
      <div class="check-item">
        <input type="checkbox" ${item.present ? "checked" : ""} data-admin-inv-present="${item.id}">
        <div style="width:100%">
          <strong>${item.name}</strong>
          <input placeholder="Detalle" value="${esc(item.note || "")}" data-admin-inv-note="${item.id}">
        </div>
      </div>`).join("");
  }
  const photos = qs("[data-admin-file-photos]");
  if (photos) {
    photos.innerHTML = rec.photos.map((photo, index) => `
      <article class="photo-card">
        ${photoVisual(photo)}
        <div class="field">
          <label>${photo.label}</label>
          <input type="file" accept="image/*" capture="environment" data-admin-photo-index="${index}">
          <input placeholder="Nota" value="${esc(photo.note || "")}" data-admin-photo-note="${index}">
        </div>
      </article>`).join("");
  }
  const damages = qs("[data-admin-file-damages]");
  if (damages) {
    damages.innerHTML = `
      <div class="field"><label>Observaciones generales</label><textarea data-admin-edit="observations">${esc(rec.observations || "")}</textarea></div>
      ${rec.damages.map((damage, damageIndex) => `
        <article class="panel">
          <div class="panel-header"><div><h3>Daño encontrado</h3><p>${damage.área || "Área"}</p></div><button class="btn danger" data-action="admin-remove-damage" data-id="${damage.id}">X</button></div>
          <div class="panel-body grid">
            <div class="form-grid">
              <div class="field"><label>Área</label><input value="${esc(damage.área)}" data-admin-damage-área="${damage.id}"></div>
              <div class="field"><label>Detalle</label><input value="${esc(damage.detail)}" data-admin-damage-detail="${damage.id}"></div>
            </div>
            <div class="photo-grid">${(damage.photos || []).map((photo, photoIndex) => `
              <article class="photo-card">
                ${photoVisual(photo)}
                <div class="field"><label>Foto daño</label><input type="file" accept="image/*" capture="environment" data-admin-damage-photo="${damage.id}" data-photo-index="${photoIndex}"></div>
              </article>`).join("")}</div>
            <button class="btn" data-action="admin-add-damage-photo" data-id="${damage.id}">Agregar foto al daño</button>
          </div>
        </article>
      `).join("") || '<div class="notice">No hay daños registrados.</div>'}
      <button class="btn" data-action="admin-add-damage">Agregar daño</button>`;
  }
  const internalHost = qs("[data-admin-internal-rows]");
  if (internalHost) {
    const rows = internalRows(rec);
    internalHost.innerHTML = rows.map((row, index) => `
      <div class="detail-row">
        <span>${index + 1}</span>
        <textarea data-admin-internal-row="${index}">${esc(row)}</textarea>
        <button type="button" class="btn icon-remove" data-action="admin-remove-internal-row" data-index="${index}">X</button>
      </div>`).join("") || '<div class="notice">Sin bitácora interna.</div>';
  }
  const proof = qs("[data-authorization-proof]");
  if (proof) {
    proof.innerHTML = authorizationProofHtml(rec);
  }
  renderAdminAuthorizationView(rec);
}

function renderEmployee() {
  fillReceptionForm();
  renderPhotoEditor();
  renderInventory();
  renderDamageEditor();
  const summary = qs("[data-employee-summary]");
  if (summary) renderReceptionSummary(summary);
  const finalSummary = qs("[data-final-summary]");
  if (finalSummary) showEmployeeStep(wizardOrder.indexOf(qs("[data-section]:not(.hidden)")?.dataset.section || "datos"));
}

function renderTrackingAdmin() {
  const rec = selected();
  if (!rec) return;
  const draft = ensureAdminTrackingDraft(rec);
  qsa("[data-track-field]").forEach((input) => {
    input.value = draft.profile[input.dataset.trackField] || "";
  });
  const progress = qs("[data-admin-progress]");
  if (progress) {
    progress.value = Number(draft.progress || 0);
    const progressValue = qs("[data-progress-value]");
    if (progressValue) progressValue.textContent = `${Number(draft.progress || 0)}%`;
  }
  const deadlineInput = qs("[data-admin-deadline]");
  if (deadlineInput) deadlineInput.value = deadlineInputValue(draft.deadline || rec.employeeDeadline || "");
  const deadlineStatus = qs("[data-admin-deadline-status]");
  if (deadlineStatus) {
    const info = deadlineInfo(rec.employeeDeadline, rec.employeeDeadlineSetAt);
    deadlineStatus.value = info.label;
    deadlineStatus.className = `deadline-status ${info.tone}`;
  }
  const detailHost = qs("[data-admin-detail-rows]");
  if (detailHost) {
    const rows = draft.rows || [];
    const images = draft.images || [];
    detailHost.innerHTML = rows.map((row, index) => `
      <div class="admin-detail-row">
        <span>${index + 1}</span>
        <div class="admin-detail-status">
          <button type="button" class="btn ${row.status === "pending" ? "primary" : ""}" data-action="admin-detail-status" data-index="${index}" data-status="pending" title="En proceso">⏳</button>
          <button type="button" class="btn ${row.status === "done" ? "primary" : ""}" data-action="admin-detail-status" data-index="${index}" data-status="done" title="Finalizado satisfactoriamente">✓</button>
        </div>
        <div class="admin-detail-content">
          <textarea data-admin-process-row="${index}" data-detail-status="${row.status}">${esc(row.text)}</textarea>
          <div class="photo-grid">${(Array.isArray(images?.[index]) ? images[index] : []).map((src, imgIndex) => `<button type="button" class="photo-box has-image" data-action="open-image-preview-direct" data-src="${esc(src)}" data-label="Avance ${index + 1}.${imgIndex + 1}" style="background-image:url('${src}')"></button>`).join("")}</div>
          <label class="btn admin-inline-upload">
            Agregar imagen
            <input class="hidden" type="file" accept="image/*" capture="environment" data-admin-detail-image="${index}">
          </label>
        </div>
        <button type="button" class="btn icon-remove" data-action="admin-remove-detail-row" data-index="${index}">X</button>
      </div>`).join("") || '<div class="notice">Sin renglones publicados.</div>';
  }
  const pendingPanel = qs("[data-pending-tracking-panel]");
  const pendingView = qs("[data-pending-tracking-view]");
  if (pendingPanel) pendingPanel.classList.add("hidden");
  if (pendingView) pendingView.innerHTML = "";
  const updates = qs("[data-admin-updates]");
  if (updates) {
    updates.innerHTML = rec.updates.map((item) => `
      <div class="timeline-item">
        <time>${item.date}</time>
        <div>
          <h4>${item.title}</h4>
          <p>${item.text}</p>
        </div>
      </div>`).join("");
  }
}

function activeEmployee() {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(raw);
  const id = (params.get("empleado") || "edwin").toLowerCase();
  const employees = state().employees || [];
  return employees.find((employee) => employee.id === id) || employees[0] || { id: "edwin", name: "Edwin" };
}

function setEmployeeLabels(employee) {
  qsa("[data-employee-name]").forEach((node) => { node.textContent = employee.name; });
  qsa("[data-employee-name-inline]").forEach((node) => { node.textContent = employee.name; });
  const tecnico = qs('[name="tecnico"]');
  if (tecnico) tecnico.value = employee.name;
}

function employeeVehicles(employee) {
  return state().receptions.filter((rec) => rec.employeeId === employee.id);
}

function renderEmployeeLists(employee) {
  const vehicles = employeeVehicles(employee);
  const active = vehicles.filter((rec) => rec.status !== "FINALIZADO" && rec.status !== "ENTREGADO");
  const finished = vehicles.filter((rec) => rec.status === "FINALIZADO");
  const metrics = qs("[data-employee-metrics]");
  if (metrics) {
    metrics.innerHTML = `
      <div class="metric"><span>En taller</span><strong>${active.length}</strong><small>Asignados a ${employee.name}</small></div>
      <div class="metric"><span>Finalizados</span><strong>${finished.length}</strong><small>Pendientes de cierre admin</small></div>
      <div class="metric"><span>Empleado</span><strong>${employee.name}</strong><small>Módulo interno</small></div>`;
  }
  const activeList = qs("[data-employee-active-list]");
  if (activeList) {
    activeList.innerHTML = active.map((rec) => `
      <tr>
        <td><strong>${rec.number}</strong><br><small>${rec.tracking?.receptionDate || ""}</small></td>
        <td>${rec.vehicle.marca} ${rec.vehicle.modelo} ${rec.vehicle.anio}<br><small>${rec.vehicle.placa || "N/D"}</small></td>
        <td><span class="pill ${statusTone(rec.status)}">${rec.status}</span></td>
        <td>${rec.signed ? '<span class="pill ok">Autorizado</span>' : '<span class="pill warn">Pendiente</span>'}</td>
        <td><button class="btn primary" data-action="open-employee-vehicle" data-id="${rec.id}">Abrir vehículo</button></td>
      </tr>`).join("") || '<tr><td colspan="5">No hay vehículos activos para este empleado.</td></tr>';
  }
  const finishedList = qs("[data-employee-finished-list]");
  if (finishedList) {
    finishedList.innerHTML = finished.map((rec) => `
      <tr>
        <td><strong>${rec.number}</strong></td>
        <td>${rec.vehicle.marca} ${rec.vehicle.modelo} ${rec.vehicle.anio}</td>
        <td><span class="pill ok">${rec.status}</span></td>
        <td><button class="btn" data-action="open-employee-vehicle" data-id="${rec.id}">Ver</button></td>
      </tr>`).join("") || '<tr><td colspan="4">No hay vehículos finalizados.</td></tr>';
  }
}

function setEmployeeWizardStep(step) {
  const formPanel = qs("[data-reception-form]")?.closest(".panel");
  if (formPanel) formPanel.classList.toggle("hidden", step !== "datos");
  qsa("[data-employee-wizard-step]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.employeeWizardStep !== step);
  });
}

function collectReceptionForm() {
  const form = qs("[data-reception-form]");
  const data = new FormData(form);
  return {
    fecha: data.get("fecha") || "",
    hora: data.get("hora") || "",
    tecnico: data.get("tecnico") || activeEmployee().name,
    client: { name: "", phone: "" },
    vehicle: {
      marca: String(data.get("marca") || "").toUpperCase(),
      modelo: String(data.get("modelo") || "").toUpperCase(),
      anio: String(data.get("anio") || "").toUpperCase(),
      color: String(data.get("color") || "").toUpperCase(),
      placa: String(data.get("placa") || "").toUpperCase(),
      vin: String(data.get("vin") || "").toUpperCase(),
      kilometraje: String(data.get("kilometraje") || "").toUpperCase(),
      odometroUnidad: data.get("odometroUnidad") || "mi"
    },
    observations: data.get("observations") || "",
    serviceReason: data.get("serviceReason") || data.get("motivo") || ""
  };
}

function fillReceptionForm() {
  const form = qs("[data-reception-form]");
  if (!form) return;
  const rec = selected();
  const employee = activeEmployee();
  const now = new Date();
  const values = {
    fecha: rec?.tracking?.receptionDate ? "" : now.toISOString().slice(0, 10),
    hora: now.toTimeString().slice(0, 5),
    tecnico: employee.name,
    marca: rec?.vehicle?.marca || "",
    modelo: rec?.vehicle?.modelo || "",
    anio: rec?.vehicle?.anio || "",
    color: rec?.vehicle?.color || "",
    placa: rec?.vehicle?.placa || "",
    vin: rec?.vehicle?.vin || "",
    kilometraje: rec?.vehicle?.kilometraje || "",
    odometroUnidad: rec?.vehicle?.odometroUnidad || "mi",
    observations: rec?.observations || "",
    serviceReason: serviceReason(rec)
  };
  Object.entries(values).forEach(([key, value]) => {
    const input = qs(`[name="${key}"]`, form);
    if (input) input.value = value || "";
  });
}

function createReception() {
  const employee = activeEmployee();
  AM_SIMPLE_STORE.mutate((current) => {
    const next = AM_SIMPLE_STORE.next(current, "reception");
    const id = `rec-${next}`;
    const clientToken = "cli_" + AM_SIMPLE_STORE.cryptoToken();
    const trackingToken = "trk_" + AM_SIMPLE_STORE.cryptoToken();
    const photos = AM_SIMPLE_STORE.requiredPhotos.map((label, index) => ({ label, dataUrl: "", note: "", color: index % 2 === 0 ? "#206f78" : "#b52931" }));
    current.receptions.unshift({
      id,
      number: `AM-R-${String(next).padStart(4, "0")}`,
      status: "BORRADOR",
      sentToClient: false,
      signed: false,
      signatureName: "",
      signatureDate: "",
      clientToken,
      trackingToken,
      employeeId: employee.id,
      employeeName: employee.name,
      client: { name: "", phone: "" },
      vehicle: { marca: "", modelo: "", anio: "", color: "", placa: "", vin: "", kilometraje: "", odometroUnidad: "mi" },
      photos,
      inventory: AM_SIMPLE_STORE.baseInventory.map((name, index) => ({ id: `inv-${id}-${index + 1}`, name, present: true, note: "" })),
      observations: "",
      damages: [],
      progress: 0,
      progressLabel: "EN REVISIÓN",
      tracking: {
        receptionDate: "",
        deliveryEstimate: "",
        odometer: "",
        plate: "",
        vehicleTitle: "",
        state: "EN REVISIÓN",
        processDetails: ""
      },
      internalWork: { internalNote: "", lockedReception: false },
      updates: []
    });
    current.selectedId = id;
  });
  fillReceptionForm();
  renderPhotoEditor();
  renderInventory();
  renderDamageEditor();
  setEmployeeWizardStep("datos");
  showSection("nuevo");
  toast("Nuevo vehículo listo para registrar.");
}

function saveReception() {
  const collected = collectReceptionForm();
  const employee = activeEmployee();
  saveInventoryFromDom();
  AM_SIMPLE_STORE.mutate((current) => {
    let rec = AM_SIMPLE_STORE.selected(current);
    if (!rec || rec.employeeId !== employee.id) {
      const next = AM_SIMPLE_STORE.next(current, "reception");
      const id = `rec-${next}`;
      rec = {
        id,
        number: `AM-R-${String(next).padStart(4, "0")}`,
        photos: AM_SIMPLE_STORE.requiredPhotos.map((label, index) => ({ label, dataUrl: "", note: "", color: index % 2 === 0 ? "#206f78" : "#b52931" })),
        inventory: AM_SIMPLE_STORE.baseInventory.map((name, index) => ({ id: `inv-${id}-${index + 1}`, name, present: true, note: "" })),
        damages: [],
        updates: []
      };
      current.receptions.unshift(rec);
      current.selectedId = id;
    }
    rec.client = { name: "", phone: "" };
    rec.vehicle = collected.vehicle;
    rec.employeeId = employee.id;
    rec.employeeName = employee.name;
    rec.serviceReason = collected.serviceReason || rec.serviceReason || "";
    rec.observations = collected.observations;
    rec.status = "EN REVISIÓN";
    rec.progressLabel = "EN REVISIÓN";
    rec.internalWork = { ...(rec.internalWork || {}), lockedReception: true };
    rec.tracking = {
      ...(rec.tracking || {}),
      receptionDate: `${collected.fecha || new Date().toLocaleDateString("es-SV")}, ${collected.hora || new Date().toLocaleTimeString("es-SV")}`,
      odometer: `${Number(collected.vehicle.kilometraje || 0).toLocaleString("en-US")} ${collected.vehicle.odometroUnidad === "km" ? "KILÓMETROS" : "MILLAS"}`,
      plate: collected.vehicle.placa || "N/D",
      vehicleTitle: `${collected.vehicle.marca} ${collected.vehicle.modelo} ${collected.vehicle.anio}`.trim(),
      state: "EN REVISIÓN",
      processDetails: collected.observations || collected.serviceReason || "Recepción registrada"
    };
  });
  renderEmployee();
  showSection("asignados");
  toast("Registro guardado y agregado a vehículos asignados.");
}

function renderEmployeeVehicle() {
  const current = state();
  const rec = current.receptions.find((item) => item.id === current.selectedId);
  const empty = qs("[data-employee-vehicle-empty]");
  const panel = qs("[data-employee-vehicle-panel]");
  if (empty) empty.classList.toggle("hidden", !!rec);
  if (panel) panel.classList.toggle("hidden", !rec);
  if (!rec) return;
  const summary = qs("[data-employee-vehicle-summary]");
  if (summary) {
    summary.innerHTML = `
      <div class="grid cols-4">
        <div class="metric"><span>Recepción</span><strong>${rec.number}</strong><small>${rec.status}</small></div>
        <div class="metric"><span>Vehículo</span><strong>${rec.vehicle.marca} ${rec.vehicle.modelo}</strong><small>${rec.vehicle.anio} - ${rec.vehicle.color}</small></div>
        <div class="metric"><span>Placa</span><strong>${rec.vehicle.placa || "N/D"}</strong><small>VIN: ${rec.vehicle.vin || "N/D"}</small></div>
        <div class="metric"><span>Autorización</span><strong>${rec.signed ? "Sí" : "No"}</strong><small>${rec.signed ? "Cliente autorizo" : "Pendiente"}</small></div>
      </div>`;
  }
  const statusInput = qs('[data-employee-work="status"]');
  if (statusInput) statusInput.value = rec.status || "EN REVISIÓN";
  const progressInput = qs('[data-employee-work="progress"]');
  if (progressInput) progressInput.value = rec.progress || 0;
  const detailInput = qs('[data-employee-work="processDetails"]');
  if (detailInput) detailInput.value = rec.tracking?.processDetails || "";
  const noteInput = qs('[data-employee-work="internalNote"]');
  if (noteInput) noteInput.value = rec.internalWork?.internalNote || "";
}

function renderEmployee() {
  const employee = activeEmployee();
  setEmployeeLabels(employee);
  renderEmployeeLists(employee);
  fillReceptionForm();
  renderPhotoEditor();
  renderInventory();
  renderDamageEditor();
  renderEmployeeVehicle();
}

let carouselIndex = 0;
function renderClient() {
  const rec = findReceptionByParam("clientToken");
  if (!rec) return renderMissingToken();
  const flow = qs("[data-authorization-flow]");
  const authorizedOnly = qs("[data-authorized-only]");
  const processingOnly = qs("[data-processing-only]");
  const signedInShopNeedsPhotoAck = !!(rec.quickAuthorization && rec.signed && !rec.photoAcknowledged);
  if (processingOnly) processingOnly.classList.add("hidden");
  if (flow) flow.classList.toggle("hidden", rec.signed && !signedInShopNeedsPhotoAck);
  if (authorizedOnly) authorizedOnly.classList.toggle("hidden", !rec.signed || signedInShopNeedsPhotoAck);
  const summary = qs("[data-client-summary]");
  if (summary) {
    renderReceptionSummary(summary, rec);
    summary.insertAdjacentHTML("beforeend", `
      <article class="panel">
        <div class="panel-header"><h3>Motivo de recepción</h3></div>
        <div class="panel-body">
          <div class="notice"><strong>Motivo por el cual recibimos el vehículo:</strong><br>${esc(serviceReason(rec) || "Sin motivo registrado.")}</div>
        </div>
      </article>`);
  }
  renderClientCarousel(rec);
  renderClientInventory(rec);
  renderClientDamages(rec);
  const observations = qs("[data-client-observations]");
  if (observations) observations.innerHTML = `<strong>Observaciones generales:</strong><br>${rec.observations || "Sin observaciones registradas."}`;
  const authorizeButton = qs("[data-action='authorize-client']");
  if (authorizeButton) authorizeButton.classList.toggle("hidden", rec.signed);
  const termsPanel = qs("[data-client-terms-panel]");
  if (termsPanel) termsPanel.classList.toggle("hidden", signedInShopNeedsPhotoAck);
  const photoAckPanel = qs("[data-photo-ack-panel]");
  if (photoAckPanel) photoAckPanel.classList.toggle("hidden", !signedInShopNeedsPhotoAck);
  const termsCheck = qs("[data-terms-check]");
  if (termsCheck) {
    termsCheck.checked = rec.signed;
    if (authorizeButton) authorizeButton.disabled = !termsCheck.checked;
  }
  const trackingLink = qs("[data-tracking-link]");
  if (trackingLink) trackingLink.href = tokenHref("seguimiento.html", rec.trackingToken);
}

function renderClientCarousel(rec) {
  const host = qs("[data-carousel]");
  if (!host) return;
  const photos = rec.photos.filter((photo) => AM_SIMPLE_STORE.carouselPhotos.includes(photo.label));
  const photo = photos[carouselIndex] || photos[0];
  host.innerHTML = `
    <div class="carousel-stage">${photoVisual(photo)}</div>
    <div class="carousel-caption">${carouselIndex + 1} de ${photos.length}: ${photo.label}</div>
    <div class="btn-row">
      <button class="btn" data-action="prev-photo">Anterior</button>
      <button class="btn primary" data-action="next-photo">Siguiente</button>
    </div>`;
}

function renderClientInventory(rec) {
  const host = qs("[data-client-inventory]");
  if (!host) return;
  host.innerHTML = rec.inventory.map((item) => `
    <div class="check-item">
      <span class="pill ${item.present ? "ok" : "danger"}">${item.present ? "Presente" : "Falta"}</span>
      <div><strong>${item.name}</strong><br><small>${item.note || "Sin detalle"}</small></div>
    </div>`).join("");
}

function renderClientDamages(rec) {
  const host = qs("[data-client-damages]");
  if (!host) return;
  host.innerHTML = rec.damages.map((damage) => `
    <article class="panel">
      <div class="panel-header"><div><h3>${damage.área}</h3><p>${damage.detail}</p></div></div>
      <div class="panel-body photo-grid">${damage.photos.map(photoVisual).join("")}</div>
    </article>`).join("") || '<div class="notice">No se registraron daños adicionales.</div>';
}

function renderTracking() {
  const rec = findReceptionByParam("trackingToken");
  if (!rec) return renderMissingToken();
  if (rec.deletedAt || rec.archivedAt || String(rec.status || "").toUpperCase() === "ENTREGADO") {
    return renderInactiveTrackingLink();
  }
  const profile = trackingProfile(rec);
  const photos = Array.isArray(rec.photos) ? rec.photos : [];
  const publicProgress = pendingTracking(rec) ? (rec.publishedProgress ?? 0) : (rec.publishedProgress ?? rec.progress ?? profile.progress ?? 0);
  const progress = Math.max(0, Math.min(100, Number(publicProgress) || 0));
  AM_SIMPLE_STORE.mutate((current) => {
    const item = current.receptions.find((candidate) => candidate.id === rec.id);
    if (item && !item.tracking) item.tracking = profile;
  });
  const host = qs("[data-tracking-view]");
  if (!host) return;
  const frontPhoto = photos.find((photo) => /frente/i.test(photo.label || "")) || photos[0];
  const cardPhoto = photos.find((photo) => /reverso.*tarjeta|tarjeta.*reverso/i.test(photo.label || ""))
    || photos.find((photo) => /frente.*tarjeta|tarjeta.*frente/i.test(photo.label || ""));
  const isFinalized = String(profile.state || "").toUpperCase() === "FINALIZADO";
  host.innerHTML = `
    <div class="tracking-label">RECEPCION:</div>
    <div class="tracking-date">${profile.receptionDate}</div>

    <div class="tracking-vehicle-row">
      <div class="tracking-vehicle-photo">${photoVisual(frontPhoto)}</div>
      <div class="tracking-vehicle-info">
        <div class="tracking-purple">ESTIMACION DE ENTREGA:</div>
        <h2>${profile.vehicleTitle}</h2>
        <p>ODOMETRO: ${profile.odometer}</p>
        <p>PLACA:${profile.plate}</p>
      </div>
    </div>

    <div class="tracking-label">TARJETA DE CIRCULACION</div>
    <div class="tracking-card-photo">${photoVisual(cardPhoto)}</div>

    ${isFinalized ? `
      <section class="tracking-finalized">
        <div class="tracking-final-icon">✓</div>
        <div>
          <span>Proceso finalizado</span>
          <h3>El diagnóstico o reparación de tu vehículo ha sido culminado exitosamente.</h3>
          <p>Automotriz Medina agradece tu confianza. Puedes comunicarte con el taller para coordinar la entrega de tu vehículo.</p>
        </div>
      </section>
    ` : `
      <div class="tracking-progress-head">
        <span>AVANCE %</span>
        <strong>${progress}</strong>
      </div>
      <div class="tracking-progress"><div style="width:${progress}%"></div></div>

      <div class="tracking-section">
        <div class="tracking-label">ESTADO DEL VEHICULO:</div>
        <strong>${profile.state}</strong>
      </div>

      <div class="tracking-section">
        <h3>Detalles del proceso Actual:</h3>
        <div class="timeline">
          ${processRowItems(rec).map((row, index) => `
            <div class="timeline-item">
              <time class="${row.status === "done" ? "done" : "pending"}">${row.status === "done" ? "✓" : "⏳"}</time>
              <div>
                <p>${esc(row.text)}</p>
                <div class="photo-grid">${(Array.isArray(rec.trackingImages?.[index]) ? rec.trackingImages[index] : []).map((src, imgIndex) => `<button type="button" class="photo-box has-image" data-action="open-image-preview-direct" data-src="${esc(src)}" data-label="Avance ${index + 1}.${imgIndex + 1}" style="background-image:url('${src}')"></button>`).join("")}</div>
              </div>
            </div>`).join("") || "<p>Sin avances publicados.</p>"}
        </div>
      </div>
    `}

  `;
}

function findReceptionByParam(key) {
  const rawHash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(location.search || rawHash);
  const token = params.get("token");
  const current = state();
  if (!token && (key === "clientToken" || key === "trackingToken")) return null;
  if (!token) return AM_SIMPLE_STORE.selected(current);
  const found = current.receptions.find((rec) => rec[key] === token);
  if (found) return found;
  return null;
}

function renderMissingToken() {
  document.body.innerHTML = '<main class="public-main"><div class="notice danger">Token no válido o recepción no encontrada.</div></main>';
}

function renderInactiveTrackingLink() {
  document.body.innerHTML = `
    <main class="public-main">
      <article class="panel" style="max-width:640px;margin:34px auto">
        <div class="panel-header"><div><h3>Seguimiento no disponible</h3><p>Automotriz Medina</p></div></div>
        <div class="panel-body grid">
          <div class="notice warn">
            Este link privado ya no está asignado a ningún vehículo activo.
          </div>
          <p class="muted-note">Si necesita información adicional, comuníquese directamente con el taller.</p>
        </div>
      </article>
    </main>`;
}

function saveReception() {
  const collected = collectReceptionForm();
  AM_SIMPLE_STORE.mutate((current) => {
    const rec = AM_SIMPLE_STORE.selected(current);
    rec.client = collected.client;
    rec.vehicle = collected.vehicle;
    rec.serviceReason = collected.serviceReason || rec.serviceReason || "";
    rec.observations = collected.observations;
    rec.status = "Revisión lista";
    rec.sentToClient = false;
  });
  renderEmployee();
  toast("Registro completo guardado. El administrador ya puede revisarlo.");
}

function saveReceptionDraft() {
  const collected = collectReceptionForm();
  AM_SIMPLE_STORE.mutate((current) => {
    const rec = AM_SIMPLE_STORE.selected(current);
    rec.client = collected.client;
    rec.vehicle = collected.vehicle;
    rec.serviceReason = collected.serviceReason || rec.serviceReason || "";
    rec.observations = collected.observations;
    if (rec.status === "Nueva recepción") rec.status = "Borrador empleado";
  });
  fillReceptionForm();
}

function saveInventoryFromDom() {
  AM_SIMPLE_STORE.mutate((current) => {
    const rec = AM_SIMPLE_STORE.selected(current);
    rec.inventory.forEach((item) => {
      const present = qs(`[data-inventory-present="${item.id}"]`);
      const note = qs(`[data-inventory-note="${item.id}"]`);
      item.present = !!present?.checked;
      item.note = note?.value || "";
    });
  });
}

function createReception() {
  AM_SIMPLE_STORE.mutate((current) => {
    const next = AM_SIMPLE_STORE.next(current, "reception");
    const id = `rec-${next}`;
    const base = AM_SIMPLE_STORE.selected(current);
    const tokens = makePrivateTokens();
    current.receptions.unshift({
      ...JSON.parse(JSON.stringify(base)),
      id,
      number: `AM-R-${String(next).padStart(4, "0")}`,
      status: "Nueva recepción",
      sentToClient: false,
      signed: false,
      signatureName: "",
      signatureDate: "",
      clientToken: tokens.clientToken,
      trackingToken: tokens.trackingToken,
      client: { name: "Nuevo cliente", phone: "" },
      vehicle: { marca: "", modelo: "", anio: "", color: "", placa: "", vin: "", kilometraje: "" },
      observations: "",
      damages: [],
      updates: []
    });
    current.selectedId = id;
  });
  renderEmployee();
  toast("Nueva recepción creada.");
}

function createReception() {
  const employee = activeEmployee();
  AM_SIMPLE_STORE.mutate((current) => {
    const next = AM_SIMPLE_STORE.next(current, "reception");
    const id = `rec-${next}`;
    const clientToken = "cli_" + AM_SIMPLE_STORE.cryptoToken();
    const trackingToken = "trk_" + AM_SIMPLE_STORE.cryptoToken();
    const photos = AM_SIMPLE_STORE.requiredPhotos.map((label, index) => ({ label, dataUrl: "", note: "", color: index % 2 === 0 ? "#206f78" : "#b52931" }));
    current.receptions.unshift({
      id,
      number: `AM-R-${String(next).padStart(4, "0")}`,
      status: "BORRADOR",
      sentToClient: false,
      signed: false,
      signatureName: "",
      signatureDate: "",
      clientToken,
      trackingToken,
      employeeId: employee.id,
      employeeName: employee.name,
      client: { name: "", phone: "" },
      vehicle: { marca: "", modelo: "", anio: "", color: "", placa: "", vin: "", kilometraje: "", odometroUnidad: "mi" },
      photos,
      inventory: AM_SIMPLE_STORE.baseInventory.map((name, index) => ({ id: `inv-${id}-${index + 1}`, name, present: true, note: "" })),
      observations: "",
      damages: [],
      progress: 0,
      progressLabel: "EN REVISIÓN",
      tracking: {
        receptionDate: "",
        deliveryEstimate: "",
        odometer: "",
        plate: "",
        vehicleTitle: "",
        state: "EN REVISIÓN",
        processDetails: ""
      },
      internalWork: { internalNote: "", lockedReception: false },
      updates: []
    });
    current.selectedId = id;
  });
  fillReceptionForm();
  renderPhotoEditor();
  renderInventory();
  renderDamageEditor();
  setEmployeeWizardStep("datos");
  showSection("nuevo");
  toast("Nuevo vehículo listo para registrar.");
}

function saveReception() {
  const collected = collectReceptionForm();
  const employee = activeEmployee();
  saveInventoryFromDom();
  AM_SIMPLE_STORE.mutate((current) => {
    const rec = AM_SIMPLE_STORE.selected(current);
    if (!rec) return;
    rec.client = { name: "", phone: "" };
    rec.vehicle = collected.vehicle;
    rec.employeeId = employee.id;
    rec.employeeName = employee.name;
    rec.serviceReason = collected.serviceReason || rec.serviceReason || "";
    rec.observations = collected.observations;
    rec.status = "EN REVISIÓN";
    rec.progressLabel = "EN REVISIÓN";
    rec.internalWork = { ...(rec.internalWork || {}), lockedReception: true };
    rec.tracking = {
      ...(rec.tracking || {}),
      receptionDate: `${collected.fecha || new Date().toLocaleDateString("es-SV")}, ${collected.hora || new Date().toLocaleTimeString("es-SV")}`,
      odometer: `${Number(collected.vehicle.kilometraje || 0).toLocaleString("en-US")} ${collected.vehicle.odometroUnidad === "km" ? "KILÓMETROS" : "MILLAS"}`,
      plate: collected.vehicle.placa || "N/D",
      vehicleTitle: `${collected.vehicle.marca} ${collected.vehicle.modelo} ${collected.vehicle.anio}`.trim(),
      state: "EN REVISIÓN",
      processDetails: collected.observations || collected.serviceReason || "Recepción registrada"
    };
  });
  renderEmployee();
  showSection("asignados");
  toast("Registro guardado y agregado a vehículos asignados.");
}

function handleActions() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hasOpenActionMenu()) {
      closeActionMenus();
      return;
    }
    const row = event.target.closest?.("[data-open-file-row]");
    if (!row || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openAdminReceptionFile(row.dataset.openFileRow);
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-action]");
    if (!button) return;
    await handleAdminTrackingAction(button.dataset.action || "", button, event);
  }, true);
  document.addEventListener("change", async (event) => {
    const input = event.target;
    await handleAdminTrackingImageChange(input, event);
  }, true);
  document.addEventListener("click", async (event) => {
    const clickedMenu = event.target.closest?.(".action-menu");
    if (!clickedMenu) closeActionMenus();
    if (event.target.matches?.("[data-image-modal]")) {
      closeImagePreview();
      return;
    }
    const tabButton = event.target.closest("[data-admin-file-tab]");
    if (tabButton) {
      showSection("expediente");
      showAdminFileTab(tabButton.dataset.adminFileTab);
      const rec = selected();
      if (rec?.id) pushAdminHash(`expediente=${encodeURIComponent(rec.id)}&tab=${encodeURIComponent(tabButton.dataset.adminFileTab)}`);
      return;
    }
    const metricFilterButton = event.target.closest("[data-admin-metric-filter]");
    if (metricFilterButton) {
      adminDashboardFilter = metricFilterButton.dataset.adminMetricFilter || "all";
      adminEmployeeFilter = "";
      const employeeMenu = qs("[data-employee-filter-menu]");
      if (employeeMenu) employeeMenu.classList.add("hidden");
      showSection("dashboard");
      renderReceptionTable();
      pushAdminHash("dashboard");
      return;
    }
    const filterButton = event.target.closest("[data-admin-filter]");
    if (filterButton) {
      const filter = filterButton.dataset.adminFilter || "all";
      const employeeMenu = qs("[data-employee-filter-menu]");
      if (filter === "workshop") {
        adminDashboardFilter = "workshop";
        adminEmployeeFilter = "";
        if (employeeMenu) employeeMenu.classList.remove("hidden");
      } else if (filter === "employee") {
        adminDashboardFilter = "employee";
        adminEmployeeFilter = filterButton.dataset.employeeFilter || "";
        if (employeeMenu) employeeMenu.classList.remove("hidden");
      } else {
        adminDashboardFilter = filter;
        adminEmployeeFilter = "";
        if (employeeMenu) employeeMenu.classList.add("hidden");
      }
      showSection("dashboard");
      renderReceptionTable();
      return;
    }
    const row = event.target.closest("[data-open-file-row]");
    if (row && !event.target.closest("[data-action]")) {
      openAdminReceptionFile(row.dataset.openFileRow);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (button.closest(".action-menu")) setTimeout(() => closeActionMenus(), 0);
    if (action === "open-image-preview") {
      event.preventDefault();
      event.stopPropagation();
      openImagePreview(button.dataset.id, button.dataset.label || "Imagen");
      return;
    }
    if (action === "open-image-preview-direct") {
      event.preventDefault();
      event.stopPropagation();
      openImagePreviewFromData(button.dataset.src || "", button.dataset.label || "Imagen");
      return;
    }
    if (action === "open-admin-notification-summary") {
      event.preventDefault();
      openAdminNotificationSummary();
      return;
    }
    if (action === "close-admin-notification-summary") {
      event.preventDefault();
      qs("[data-admin-notification-modal]")?.classList.add("hidden");
      return;
    }
    if (action === "close-image-preview") {
      event.preventDefault();
      closeImagePreview();
      return;
    }
    if (document.body.dataset.page === "employee" && handleEmployeeModuleAction(action, button, event)) return;
    if (action === "admin-login") {
      const value = qs("[data-login-value]")?.value || "";
      AM_SIMPLE_STORE.mutate((current) => {
        if (value === current.config.adminPin) current.session.admin = true;
      });
      if (state().session.admin) location.reload();
      else toast("PIN incorrecto.", "danger");
    }
    if (action === "admin-quick-login") {
      AM_SIMPLE_STORE.mutate((current) => { current.session.admin = true; });
      location.reload();
    }
    if (action === "employee-login") {
      const value = qs("[data-login-value]")?.value || "";
      AM_SIMPLE_STORE.mutate((current) => {
        if (value === current.config.employeeToken) current.session.employee = true;
      });
      if (state().session.employee) location.reload();
      else toast("Token de empleado incorrecto.", "danger");
    }
    if (action === "employee-quick-login") {
      AM_SIMPLE_STORE.mutate((current) => { current.session.employee = true; });
      location.reload();
    }
    if (action === "admin-logout") {
      AM_SIMPLE_STORE.mutate((current) => { current.session.admin = false; });
      location.reload();
    }
    if (action === "employee-logout") {
      AM_SIMPLE_STORE.mutate((current) => { current.session.employee = false; });
      location.reload();
    }
    if (action === "import-full-backup") {
      event.preventDefault();
      qs('[data-backup-input="full"]')?.click();
    }
    if (action === "import-single-backup") {
      event.preventDefault();
      qs('[data-backup-input="single"]')?.click();
    }
    if (action === "clear-admin-search") {
      event.preventDefault();
      adminSearchFilters = { text: "", dateFrom: "", dateTo: "", vehicleYear: "" };
      syncAdminSearchInputs();
      renderReceptionTable();
      renderClientCatalog();
      toast("Búsqueda limpia.");
    }
    if (action === "save-cloud-config") {
      event.preventDefault();
      if (!globalThis.AM_CLOUD_SYNC) {
        cloudLog("No se cargó el módulo de conexión nube.", "danger");
        return;
      }
      AM_CLOUD_SYNC.saveConfig({
        endpoint: qs("[data-cloud-endpoint]")?.value.trim() || "",
        account: qs("[data-cloud-account]")?.value.trim() || "oficinaautomotrizmedina@gmail.com",
        enabled: !!qs("[data-cloud-enabled]")?.checked
      });
      renderCloudSettings();
      cloudLog("Configuración de nube guardada.");
    }
    if (action === "test-cloud") {
      event.preventDefault();
      if (!globalThis.AM_CLOUD_SYNC) return;
      AM_CLOUD_SYNC.saveConfig({
        endpoint: qs("[data-cloud-endpoint]")?.value.trim() || "",
        account: qs("[data-cloud-account]")?.value.trim() || "oficinaautomotrizmedina@gmail.com",
        enabled: !!qs("[data-cloud-enabled]")?.checked
      });
      cloudLog("Probando conexión con Apps Script...");
      AM_CLOUD_SYNC.ping().then((result) => {
        renderCloudSettings();
        cloudLog(`Conexión correcta. Hoja: ${result.spreadsheetId || "lista"}.`, "ok");
      }).catch((error) => cloudLog(`No se pudo conectar: ${error.message}`, "danger"));
    }
    if (action === "sync-cloud-now") {
      event.preventDefault();
      if (!globalThis.AM_CLOUD_SYNC) return;
      AM_CLOUD_SYNC.saveConfig({
        endpoint: qs("[data-cloud-endpoint]")?.value.trim() || "",
        account: qs("[data-cloud-account]")?.value.trim() || "oficinaautomotrizmedina@gmail.com",
        enabled: !!qs("[data-cloud-enabled]")?.checked
      });
      cloudLog("Guardando respaldo completo en nube...");
      if (await confirmCloudSaved("Respaldo guardado correctamente en nube.", "manual-admin")) {
        cloudLog("Respaldo guardado correctamente en nube.", "ok");
      } else {
        cloudLog("No se pudo confirmar el respaldo en nube.", "danger");
      }
    }
    if (action === "load-cloud-latest") {
      event.preventDefault();
      if (!globalThis.AM_CLOUD_SYNC) return;
      if (!confirm("Esto reemplazará los datos actuales del navegador con el último respaldo guardado en nube. ¿Desea continuar?")) return;
      AM_CLOUD_SYNC.saveConfig({
        endpoint: qs("[data-cloud-endpoint]")?.value.trim() || "",
        account: qs("[data-cloud-account]")?.value.trim() || "oficinaautomotrizmedina@gmail.com",
        enabled: !!qs("[data-cloud-enabled]")?.checked
      });
      cloudLog("Cargando último respaldo de nube...");
      AM_CLOUD_SYNC.loadLatest().then((snapshot) => {
        if (!snapshot) {
          cloudLog("No hay respaldo guardado en nube.", "warn");
          return;
        }
        cloudLog("Respaldo cargado. Recargando pantalla...", "ok");
        setTimeout(() => location.reload(), 900);
      }).catch((error) => cloudLog(`No se pudo cargar la nube: ${error.message}`, "danger"));
    }
    if (action === "select-backup-preview") {
      event.preventDefault();
      qs("[data-backup-viewer-input]")?.click();
    }
    if (action === "restore-preview-backup") {
      event.preventDefault();
      if (!previewBackup) {
        toast("Primero cargue un respaldo individual en el visor.", "warn");
        return;
      }
      restoreReceptionBackup(previewBackup);
      const restoredNumber = previewBackup.reception?.number || "";
      previewBackup = null;
      const restored = state().receptions.find((item) => item.number === restoredNumber);
      if (restored) upsertEmployeeVehicle(employeeVehicleFromReception(restored));
      adminDashboardFilter = "workshop";
      renderAdmin();
      showSection("dashboard");
      if (!await confirmCloudSaved("Expediente restaurado al dashboard.", "restore-preview-backup")) return;
      toast("Expediente restaurado al dashboard.");
    }
    if (action === "grant-deadline-token") {
      event.preventDefault();
      event.stopPropagation();
      const amount = Number(prompt("¿Cuántos tokens desea habilitar para este vehículo?", "1") || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = current.receptions.find((item) => item.id === button.dataset.id);
        if (!rec) return;
        rec.employeeDeadlineTokensAvailable = Number(rec.employeeDeadlineTokensAvailable ?? 3) + Math.floor(amount);
        rec.employeeDeadlineUnlockRequested = false;
      });
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (rec) upsertEmployeeVehicle(employeeVehicleFromReception(rec));
      renderAdmin();
      toast("Token habilitado para el empleado.");
    }
    if (action === "reactivate-reception") {
      event.preventDefault();
      event.stopPropagation();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!confirm(`¿Reactivar ${rec.number} y devolverlo a vehículos en taller?`)) return;
      let updated = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const item = current.receptions.find((candidate) => candidate.id === rec.id);
        updated = reactivateReception(item);
      });
      if (updated) upsertEmployeeVehicle(employeeVehicleFromReception(updated));
      const saved = await confirmCloudSaved("Vehículo reactivado y devuelto a taller.", "reactivate-reception");
      if (!saved) {
        renderAdmin();
        toast("No se pudo confirmar la reactivación. Intente nuevamente.", "danger");
        return;
      }
      const confirmed = state().receptions.find((item) => item.id === rec.id || item.number === rec.number);
      if (confirmed) upsertEmployeeVehicle(employeeVehicleFromReception(confirmed));
      adminDashboardFilter = "workshop";
      renderAdmin();
      showSection("dashboard");
    }
    if (action === "send-global-notification") {
      event.preventDefault();
      const employeeId = qs("[data-admin-notification-employee]")?.value || "";
      const textField = qs("[data-admin-global-notification-text]");
      const priority = qs("[data-admin-global-notification-priority]")?.value || "warn";
      const message = textField?.value.trim() || "";
      if (!employeeId || !message) {
        toast("Seleccione empleado y escriba la notificación.", "warn");
        return;
      }
      const employeeName = employeeDisplayName(employeeId);
      AM_SIMPLE_STORE.mutate((current) => {
        ensureEmployeeNotifications(current).unshift({
          id: notificationId(),
          employeeId,
          employeeName,
          message,
          priority,
          createdAt: new Date().toISOString(),
          read: false
        });
      });
      renderAdmin();
      const saved = await confirmCloudSaved("Notificación enviada al empleado.", "send-global-notification");
      if (!saved) return;
      const alertSent = await sendAlertzyNotification({
        employeeName,
        type: "Notificación general",
        priority,
        message
      });
      if (!alertSent) toast("La notificación quedó guardada, pero Alertzy no confirmó el envío externo.", "warn");
      if (textField) textField.value = "";
      renderAdmin();
    }
    if (action === "send-vehicle-notification") {
      event.preventDefault();
      const textField = qs("[data-admin-vehicle-notification-text]");
      const priority = qs("[data-admin-vehicle-notification-priority]")?.value || "warn";
      const message = textField?.value.trim() || "";
      if (!message) {
        toast("Escriba la notificación del vehículo.", "warn");
        return;
      }
      if (!selected()) {
        toast("Seleccione un expediente para enviar la notificación.", "warn");
        return;
      }
      let alertPayload = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        if (!rec) return;
        const employeeId = rec.employeeId || String(rec.employeeName || "edwin").toLowerCase();
        const employeeName = rec.employeeName || employeeDisplayName(employeeId);
        const vehicleTitle = `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim();
        alertPayload = {
          employeeName,
          type: "Notificación de vehículo",
          priority,
          message,
          recNumber: rec.number,
          vehicleTitle,
          plate: rec.vehicle?.placa || ""
        };
        ensureReceptionNotifications(rec).unshift({
          id: notificationId(),
          employeeId,
          employeeName,
          recId: rec.id,
          recNumber: rec.number,
          message,
          priority,
          createdAt: new Date().toISOString(),
          read: false
        });
      });
      syncSelectedAdminReceptionToEmployee();
      const saved = await confirmCloudSaved("Notificación enviada al vehículo.", "send-vehicle-notification");
      if (!saved) return;
      if (alertPayload) {
        const alertSent = await sendAlertzyNotification(alertPayload);
        if (!alertSent) toast("La notificación del vehículo quedó guardada, pero Alertzy no confirmó el envío externo.", "warn");
      }
      if (textField) textField.value = "";
      renderAdmin();
    }
    if (action === "edit-notification") {
      event.preventDefault();
      const id = button.dataset.id || "";
      const currentMatch = findNotificationInState(state(), id);
      if (!currentMatch) return;
      const edit = await openNotificationEditor(currentMatch.item);
      if (!edit) return;
      let affectedRec = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const match = findNotificationInState(current, id);
        if (!match) return;
        affectedRec = match.rec;
        match.item.message = edit.message;
        match.item.priority = edit.priority;
        match.item.editedAt = new Date().toISOString();
      });
      if (affectedRec) upsertEmployeeVehicle(employeeVehicleFromReception(affectedRec));
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      const saved = await confirmCloudSaved("Notificación editada.", "edit-notification");
      if (!saved) return;
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      toast("Notificación editada.");
    }
    if (action === "delete-notification") {
      event.preventDefault();
      const id = button.dataset.id || "";
      if (!confirm("¿Eliminar esta notificación?")) return;
      let affectedRec = null;
      let deleted = false;
      AM_SIMPLE_STORE.mutate((current) => {
        const match = findNotificationInState(current, id);
        if (!match) return;
        affectedRec = match.rec;
        match.list.splice(match.index, 1);
        deleted = true;
      });
      if (!deleted) {
        toast("No se encontró la notificación para eliminar.", "warn");
        return;
      }
      if (affectedRec) upsertEmployeeVehicle(employeeVehicleFromReception(affectedRec));
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      const saved = await confirmCloudSaved("Notificación eliminada.", "delete-notification");
      const stillExists = !!findNotificationInState(state(), id);
      if (!saved || stillExists) {
        renderAdmin();
        if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
        toast("No se pudo confirmar que la notificación fue eliminada. Intente nuevamente.", "danger");
        return;
      }
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
    }
    if (action === "ack-notification") {
      event.preventDefault();
      const id = button.dataset.id || "";
      let affectedRec = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const match = findNotificationInState(current, id);
        if (!match) return;
        affectedRec = match.rec;
        match.item.adminAckAt = new Date().toISOString();
        match.item.adminAckBy = "Administrador";
      });
      if (affectedRec) upsertEmployeeVehicle(employeeVehicleFromReception(affectedRec));
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      const saved = await confirmCloudSaved("Cumplimiento validado.", "ack-notification");
      if (!saved) return;
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      toast("Cumplimiento validado.");
    }
    if (action === "reactivate-notification") {
      event.preventDefault();
      const id = button.dataset.id || "";
      if (!confirm("¿Reactivar esta notificación y enviarla nuevamente al empleado?")) return;
      let affectedRec = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const match = findNotificationInState(current, id);
        if (!match) return;
        affectedRec = match.rec;
        match.item.completedAt = "";
        match.item.completedBy = "";
        match.item.adminAckAt = "";
        match.item.read = false;
        match.item.readAt = "";
        match.item.readBy = "";
        match.item.reactivatedAt = new Date().toISOString();
        match.item.reactivatedBy = "Administrador";
      });
      if (affectedRec) upsertEmployeeVehicle(employeeVehicleFromReception(affectedRec));
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      const saved = await confirmCloudSaved("Notificación reactivada para el empleado.", "reactivate-notification");
      if (!saved) return;
      renderAdmin();
      if (qs("[data-admin-notification-modal]:not(.hidden)")) openAdminNotificationSummary();
      toast("Notificación reactivada para el empleado.");
    }
    if (action === "save-reception") {
      saveInventoryFromDom();
      saveReception();
    }
    if (action === "next-step" || action === "prev-step") {
      const currentSection = button.closest("[data-section]");
      const currentIndex = wizardOrder.indexOf(currentSection?.dataset.section || "datos");
      if (action === "next-step") {
        if (currentSection?.dataset.section === "datos") {
          const form = qs("[data-reception-form]");
          if (form && !form.reportValidity()) return;
          saveReceptionDraft();
        }
        if (currentSection?.dataset.section === "inventario") {
          saveInventoryFromDom();
        }
        showEmployeeStep(currentIndex + 1);
      } else {
        showEmployeeStep(currentIndex - 1);
      }
    }
    if (action === "new-reception") createReception();
    if (action === "add-inventory") {
      const name = prompt("Nombre del inventario");
      if (!name) return;
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const next = AM_SIMPLE_STORE.next(current, "inventory");
        rec.inventory.push({ id: `inv-${next}`, name, present: true, note: "" });
      });
      renderEmployee();
    }
    if (action === "add-damage") {
      const area = qs("[name='damageArea']")?.value || "Área no especificada";
      const detail = qs("[name='damageDetail']")?.value || "Detalle pendiente";
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const next = AM_SIMPLE_STORE.next(current, "damage");
        rec.damages.push({ id: `dam-${next}`, área, detail, photos: [{ label: `Daño ${área}`, dataUrl: "", note: "", color: "#b52931" }] });
      });
      renderEmployee();
      toast("Daño agregado.");
    }
    if (action === "remove-damage") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        rec.damages = rec.damages.filter((item) => item.id !== button.dataset.id);
      });
      renderEmployee();
    }
    if (action === "select-reception") {
      AM_SIMPLE_STORE.mutate((current) => { current.selectedId = button.dataset.id; });
      renderAdmin();
      toast("Recepción seleccionada.");
    }
    if (action === "open-file") {
      event.preventDefault();
      openAdminReceptionFile(button.dataset.id);
    }
    if (action === "download-backup") {
      event.preventDefault();
      const rec = button.dataset.id ? state().receptions.find((item) => item.id === button.dataset.id) : AM_SIMPLE_STORE.selected(state());
      if (!rec) return;
      downloadReceptionBackup(rec);
      toast("Descargando respaldo del expediente y archivo interno.");
    }
    if (action === "download-all-backup") {
      event.preventDefault();
      downloadAllProgramBackup();
      toast("Descargando respaldo completo del programa.");
    }
    if (action === "configure-local-archive-folder") {
      event.preventDefault();
      try {
        await configureLocalArchiveFolder();
      } catch (error) {
        console.error(error);
        toast(error.message || "No se pudo configurar la carpeta local.", "danger");
      }
    }
    if (action === "load-local-archives") {
      event.preventDefault();
      try {
        await loadLocalArchivedBackups();
        toast("Archivados locales cargados.");
      } catch (error) {
        console.error(error);
        toast(error.message || "No se pudieron cargar los archivados locales.", "danger");
      }
    }
    if (action === "restore-local-archive-preview") {
      event.preventDefault();
      const entry = adminLocalArchivedBackups[Number(button.dataset.localArchiveIndex)];
      if (!entry?.backup) return;
      openLocalArchiveAsExpediente(entry);
      toast("Expediente archivado abierto.");
    }
    if (action === "restore-local-archive-dashboard") {
      event.preventDefault();
      const entry = adminLocalArchivedBackups[Number(button.dataset.localArchiveIndex)];
      if (!entry?.backup) return;
      const rec = entry.backup.reception;
      if (!confirm(`Restaurar ${rec.number} al dashboard y volverlo activo?`)) return;
      restoreReceptionBackup(entry.backup);
      const restored = state().receptions.find((item) => item.id === rec.id || item.number === rec.number);
      if (restored) upsertEmployeeVehicle(employeeVehicleFromReception(restored));
      adminDashboardFilter = "workshop";
      renderAdmin();
      showSection("dashboard");
      const saved = await confirmCloudSaved("Expediente restaurado al dashboard.", "restore-local-archive-dashboard");
      if (!saved) {
        toast("No se pudo confirmar la restauración en nube. Intente nuevamente.", "danger");
        return;
      }
      toast("Expediente restaurado y activo.");
    }
    if (action === "delete-local-archive") {
      event.preventDefault();
      const entry = adminLocalArchivedBackups[Number(button.dataset.localArchiveIndex)];
      if (!entry?.backup) return;
      const rec = entry.backup.reception || {};
      if (!confirm(`Borrar localmente ${rec.number || "este expediente"}? Esto eliminará el respaldo guardado en la carpeta local.`)) return;
      try {
        await deleteLocalArchiveBackup(entry);
        if (adminLocalArchivePreviewRec?.id === rec.id || adminLocalArchivePreviewRec?.number === rec.number) {
          adminLocalArchivePreviewRec = null;
        }
        await loadLocalArchivedBackups();
        toast("Respaldo local borrado.");
      } catch (error) {
        console.error(error);
        toast(error.message || "No se pudo borrar el respaldo local.", "danger");
      }
    }
    if (action === "delete-reception") {
      event.preventDefault();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!confirm(`Mover ${rec.number} a la papelera de reciclaje? Permanecerá disponible para restaurar durante 60 días.`)) return;
      AM_SIMPLE_STORE.mutate((current) => {
        const item = current.receptions.find((candidate) => candidate.id === rec.id);
        if (!item) return;
        item.deletedAt = new Date().toISOString();
        item.archivedAt = "";
        item.deletedBy = "Administrador";
        if (current.selectedId === item.id) current.selectedId = "";
      });
      if (location.hash.includes(rec.id)) history.replaceState(null, "", "admin.html");
      renderAdmin();
      showSection("dashboard");
      if (!await confirmCloudSaved("Expediente enviado a papelera.", "delete-reception")) return;
    }
    if (action === "archive-reception") {
      event.preventDefault();
      let rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      let localResult = null;
      try {
        toast("Leyendo respaldo de nube para preparar archivado local...");
        rec = await freshReceptionForLocalArchive(rec);
        if (!rec) throw new Error("No se pudo localizar el expediente actualizado para archivar.");
        rec = JSON.parse(JSON.stringify(rec));
        if (!rec.client?.name) {
          const clientName = prompt(`Este expediente no tiene nombre de cliente. Escriba el nombre de la carpeta para ${rec.number}:`, "");
          if (!clientName) return;
          rec.client = { ...(rec.client || {}), name: clientName };
        }
        const archivePath = localArchivePath(rec);
        if (!confirm(`Se guardará el expediente en esta ubicación:\n\n${archivePath}\n\n¿Desea archivar aquí?`)) return;
        toast("Guardando expediente completo en carpeta local...");
        localResult = await writeLocalArchiveBackup(rec);
      } catch (error) {
        console.error(error);
        toast(error.message || "No se pudo guardar el respaldo local. No se archivó nada.", "danger");
        return;
      }
      AM_SIMPLE_STORE.mutate((current) => {
        const item = current.receptions.find((candidate) => candidate.id === rec.id);
        if (!item) return;
        item.archivedAt = new Date().toISOString();
        item.deletedAt = "";
        item.archivedBy = "Administrador";
        item.localArchiveConfirmedAt = localResult.exportedAt || new Date().toISOString();
        item.localArchivePath = localResult.path || "";
      });
      renderAdmin();
      if (!await confirmCloudSaved("Expediente archivado y respaldado localmente.", "archive-reception")) return;
      await loadLocalArchivedBackups().catch(() => {});
    }
    if (action === "unarchive-reception") {
      event.preventDefault();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!confirm(`Restaurar ${rec.number} al dashboard y devolverlo a vehículos en taller?`)) return;
      let updated = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const item = current.receptions.find((candidate) => candidate.id === rec.id);
        if (!item) return;
        item.archivedAt = "";
        item.archivedBy = "";
        item.deletedAt = "";
        item.deletedBy = "";
        item.localArchiveConfirmedAt = "";
        item.localArchivePath = "";
        if (String(item.status || "").toUpperCase() === "FINALIZADO") {
          item.status = "EN REVISIÓN";
          item.progressLabel = item.status;
          if (!item.tracking) item.tracking = {};
          item.tracking.state = item.status;
        }
        updated = item;
      });
      if (updated) upsertEmployeeVehicle(employeeVehicleFromReception(updated));
      adminDashboardFilter = "workshop";
      renderAdmin();
      showSection("dashboard");
      if (!await confirmCloudSaved("Expediente restaurado al dashboard.", "unarchive-reception")) return;
    }
    if (action === "delete-cloud-archived") {
      event.preventDefault();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!rec.localArchiveConfirmedAt) {
        toast("Primero debe existir un respaldo local confirmado.", "danger");
        return;
      }
      if (!confirm(`Borrar ${rec.number} de la nube? El expediente debe permanecer respaldado en la carpeta local.`)) return;
      const previous = JSON.parse(JSON.stringify(rec));
      AM_SIMPLE_STORE.mutate((current) => {
        current.receptions = current.receptions.filter((item) => item.id !== rec.id);
        if (current.selectedId === rec.id) current.selectedId = "";
      });
      renderAdmin();
      const saved = await confirmCloudSaved("Expediente borrado de la nube.", "delete-cloud-archived");
      if (!saved) {
        AM_SIMPLE_STORE.mutate((current) => {
          if (!current.receptions.some((item) => item.id === previous.id)) current.receptions.push(previous);
        });
        renderAdmin();
        toast("No se confirmó el borrado en nube. Se restauró el expediente localmente para reintentar.", "danger");
        return;
      }
      await loadLocalArchivedBackups().catch(() => {});
    }
    if (action === "restore-trash-reception") {
      event.preventDefault();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      AM_SIMPLE_STORE.mutate((current) => {
        const item = current.receptions.find((candidate) => candidate.id === rec.id);
        if (!item) return;
        item.deletedAt = "";
        item.deletedBy = "";
        item.archivedAt = "";
      });
      adminDashboardFilter = "all";
      renderAdmin();
      if (!await confirmCloudSaved("Expediente restaurado al dashboard.", "restore-trash-reception")) return;
    }
    if (action === "purge-trash-reception") {
      event.preventDefault();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!confirm(`Eliminar definitivamente ${rec.number}? Esta acción ya no se podrá restaurar desde papelera.`)) return;
      AM_SIMPLE_STORE.mutate((current) => {
        if (!Array.isArray(current.deletedReceptionNumbers)) current.deletedReceptionNumbers = [];
        if (rec.number && !current.deletedReceptionNumbers.includes(rec.number)) current.deletedReceptionNumbers.push(rec.number);
        current.receptions = current.receptions.filter((item) => item.id !== rec.id);
        if (current.selectedId === rec.id) current.selectedId = "";
      });
      if (location.hash.includes(rec.id)) history.replaceState(null, "", "admin.html");
      renderAdmin();
      if (!await confirmCloudSaved("Expediente eliminado definitivamente.", "purge-trash-reception")) return;
    }
    if (action === "send-client") {
      let target = "";
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        rec.sentToClient = true;
        rec.status = "Enviado al cliente";
        const phone = whatsappPhone(rec.client?.phone);
        const text = encodeURIComponent(authorizationMessage(rec));
        target = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
      });
      renderAdmin();
      if (target) window.open(target, "_blank");
      if (!await confirmCloudSaved("Link de autorización generado para WhatsApp.", "send-client-authorization")) return;
    }
    if (action === "send-client-photos") {
      let target = "";
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        rec.photoReviewSentAt = new Date().toISOString();
        const phone = whatsappPhone(rec.client?.phone);
        const text = encodeURIComponent(photoReviewMessage(rec));
        target = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
      });
      renderAdmin();
      if (target) window.open(target, "_blank");
      if (!await confirmCloudSaved("Link de revisión de fotografías generado para WhatsApp.", "send-client-photos")) return;
    }
    if (action === "send-client-tracking") {
      let target = "";
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        rec.trackingSentAt = new Date().toISOString();
        const phone = whatsappPhone(rec.client?.phone);
        const text = encodeURIComponent(trackingMessage(rec));
        target = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
      });
      renderAdmin();
      if (target) window.open(target, "_blank");
      if (!await confirmCloudSaved("Link de seguimiento generado para WhatsApp.", "send-client-tracking")) return;
    }
    if (action === "open-admin-authorization") {
      const card = qs("[data-admin-authorization-card]");
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.classList.add("focus-flash");
        setTimeout(() => card.classList.remove("focus-flash"), 1200);
      }
      toast("Vista administrativa de autorización abierta.");
    }
    if (action === "admin-manual-authorize") {
      event.preventDefault();
      const selectedRec = AM_SIMPLE_STORE.selected(state());
      if (!selectedRec) {
        toast("Seleccione un expediente antes de autorizar.", "warn");
        return;
      }
      const reason = await openManualAuthorizationDialog(selectedRec);
      if (reason === null) return;
      let updatedRec = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        if (!rec) return;
        rec.signed = true;
        rec.sentToClient = true;
        rec.manualAuthorization = true;
        rec.adminSignatureReviewedAt = new Date().toISOString();
        rec.adminSignatureReviewedBy = "Administrador";
        rec.signatureName = rec.client?.name || "Autorización manual administrativa";
        rec.signatureDate = new Date().toLocaleString("es-SV");
        rec.status = "Autorizado";
        rec.authorizationEvidence = {
          acceptedAtIso: new Date().toISOString(),
          token: rec.clientToken,
          authorizationType: "Manual por administrador",
          registeredBy: "Administrador",
          reason: reason || "Autorización manual registrada por administrador",
          userAgent: navigator.userAgent || "",
          platform: navigator.platform || "",
          language: navigator.language || "",
          languages: Array.isArray(navigator.languages) ? navigator.languages.join(", ") : "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          screen: `${screen.width}x${screen.height}`,
          viewport: `${innerWidth}x${innerHeight}`
        };
        updatedRec = rec;
      });
      if (updatedRec) upsertEmployeeVehicle(employeeVehicleFromReception(updatedRec));
      renderAdmin();
      if (!await confirmCloudSaved("Autorización manual registrada.", "manual-authorization")) return;
      renderAdmin();
      toast("Autorización manual registrada.");
    }
    if (action === "admin-remove-authorization") {
      const rec = AM_SIMPLE_STORE.selected(state());
      if (!rec) return;
      if (!confirm(`Quitar la autorización de ${rec.number}? El expediente volverá a estado pendiente.`)) return;
      let updatedRec = null;
      AM_SIMPLE_STORE.mutate((current) => {
        const item = AM_SIMPLE_STORE.selected(current);
        const keepClientSignature = hasCapturedClientSignature(item);
        item.signed = keepClientSignature;
        item.sentToClient = keepClientSignature;
        item.manualAuthorization = false;
        item.adminSignatureReviewedAt = "";
        item.adminSignatureReviewedBy = "";
        if (!keepClientSignature) {
          item.signatureName = "";
          item.signatureDate = "";
          item.signatureDataUrl = "";
          item.termsAcceptedAt = "";
          item.quickAuthorization = false;
        } else {
          item.quickAuthorization = true;
        }
        item.status = "Pendiente de autorización";
        item.authorizationEvidence = {
          ...(keepClientSignature && item.authorizationEvidence ? item.authorizationEvidence : {}),
          removedAtIso: new Date().toISOString(),
          authorizationType: "Autorización eliminada",
          registeredBy: "Administrador",
          reason: "Autorización quitada manualmente por administrador"
        };
        updatedRec = item;
      });
      if (updatedRec) syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Autorización eliminada.", "remove-authorization")) return;
      renderAdmin();
    }
    if (action === "save-client-profile") {
      AM_SIMPLE_STORE.mutate((current) => {
        saveAdminAllFromDom(current);
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Guardado.", "save-client-profile")) return;
    }
    if (action === "save-admin-expediente") {
      AM_SIMPLE_STORE.mutate((current) => {
        saveAdminAllFromDom(current);
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Guardado.", "save-admin-expediente")) return;
    }
    if (action === "save-admin-all") {
      AM_SIMPLE_STORE.mutate((current) => {
        saveAdminAllFromDom(current);
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Guardado.", "save-admin-all")) return;
    }
    if (action === "admin-add-damage") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const next = AM_SIMPLE_STORE.next(current, "damage");
        rec.damages.push({ id: `adm-dam-${next}`, área: "Área", detail: "Detalle", photos: [{ label: "Foto daño", dataUrl: "", note: "", color: "#b52931" }] });
      });
      renderAdmin();
      toast("Daño agregado.");
    }
    if (action === "admin-remove-damage") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        rec.damages = rec.damages.filter((damage) => damage.id !== button.dataset.id);
      });
      renderAdmin();
      toast("Daño eliminado.");
    }
    if (action === "admin-add-damage-photo") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const damage = rec.damages.find((item) => item.id === button.dataset.id);
        if (!damage) return;
        if (!Array.isArray(damage.photos)) damage.photos = [];
        damage.photos.push({ label: `Foto daño ${damage.photos.length + 1}`, dataUrl: "", note: "", color: "#b52931" });
      });
      renderAdmin();
      toast("Foto agregada al daño.");
    }
    if (action === "copy-client-link") copyText(qs("[data-client-links] a")?.href || "");
    if (action === "save-admin-tracking") {
      event.preventDefault();
      const selectedRec = selected();
      if (!selectedRec) {
        toast("Seleccione un expediente para guardar seguimiento.", "warn");
        return;
      }
      const draft = captureAdminTrackingDraftFromDom(selectedRec);
      AM_SIMPLE_STORE.mutate((current) => {
        persistAdminTrackingDraft(current, draft, false);
      });
      syncSelectedAdminReceptionToEmployee();
      const saved = await confirmCloudSaved("Seguimiento guardado.", "save-admin-tracking");
      if (!saved) return;
      renderAdmin();
    }
    if (action === "save-progress") {
      event.preventDefault();
      const selectedRec = selected();
      if (!selectedRec) {
        toast("Seleccione un expediente para publicar seguimiento.", "warn");
        return;
      }
      const draft = captureAdminTrackingDraftFromDom(selectedRec);
      AM_SIMPLE_STORE.mutate((current) => {
        persistAdminTrackingDraft(current, draft, true);
      });
      adminTrackingDraft = null;
      syncSelectedAdminReceptionToEmployee();
      const saved = await confirmCloudSaved("Seguimiento publicado.", "publish-tracking");
      if (!saved) return;
      renderAdmin();
    }
    if (action === "publish-pending-tracking") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const pending = rec.pendingTracking && rec.pendingTracking.status === "pending" ? rec.pendingTracking : null;
        if (!pending) return;
        const profile = trackingProfile(rec);
        profile.state = pending.state || profile.state || rec.status;
        profile.processDetails = pending.processDetails || "";
        rec.progress = Number(pending.progress || 0);
        rec.publishedProgress = rec.progress;
        rec.progressLabel = profile.state || "En proceso";
        rec.status = profile.state || rec.status;
        rec.trackingImages = Array.isArray(pending.images) ? pending.images : [];
        rec.pendingTracking = {
          ...pending,
          status: "published",
          publishedAt: new Date().toISOString()
        };
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Seguimiento publicado al cliente.", "publish-pending-tracking")) return;
    }
    if (action === "publish-finalization") {
      event.preventDefault();
      event.stopPropagation();
      const rec = state().receptions.find((item) => item.id === button.dataset.id);
      if (!rec) return;
      if (!confirm(`¿Publicar la finalización de ${rec.number} al cliente? El seguimiento privado mostrará el vehículo como finalizado.`)) return;
      let updated = null;
      AM_SIMPLE_STORE.mutate((current) => {
        updated = current.receptions.find((item) => item.id === rec.id);
        if (!updated) return;
        const profile = trackingProfile(updated);
        profile.state = "FINALIZADO";
        updated.status = "FINALIZADO";
        updated.progress = 100;
        updated.publishedProgress = 100;
        updated.progressLabel = "FINALIZADO";
        updated.finalizationPublishedAt = new Date().toISOString();
        if (updated.pendingTracking) {
          updated.pendingTracking = {
            ...updated.pendingTracking,
            status: "published",
            state: "FINALIZADO",
            progress: 100,
            publishedAt: new Date().toISOString()
          };
        }
        if (!updated.internalWork) updated.internalWork = {};
        const stamp = new Date().toLocaleString("es-SV");
        const note = `FINALIZACIÓN PUBLICADA AL CLIENTE: ${stamp}`;
        const existing = String(updated.internalWork.internalNote || "").trim();
        updated.internalWork.internalNote = existing ? `${existing}\n${note}` : note;
      });
      if (updated) upsertEmployeeVehicle(employeeVehicleFromReception(updated));
      renderAdmin();
      if (!await confirmCloudSaved("Finalizacion publicada al cliente.", "publish-finalization")) return;
    }
    if (action === "admin-add-detail-row") {
      const rec = selected();
      const draft = captureAdminTrackingDraftFromDom(rec);
      const next = qs("[data-admin-new-detail]")?.value.trim();
      if (next) {
        draft.rows.push({ status: "pending", text: next });
        draft.images.push([]);
      }
      AM_SIMPLE_STORE.mutate((current) => {
        persistAdminTrackingDraft(current, draft, false);
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (next && !await confirmCloudSaved("Seguimiento guardado.", "admin-add-detail-row")) return;
    }
    if (action === "admin-detail-status") {
      const row = qs(`[data-admin-process-row="${button.dataset.index}"]`);
      if (row) {
        const nextStatus = button.dataset.status || "pending";
        row.dataset.detailStatus = nextStatus;
        row.closest(".admin-detail-row")?.querySelector("textarea")?.setAttribute("data-detail-status", nextStatus);
        button.parentElement?.querySelectorAll("button").forEach((item) => item.classList.toggle("primary", item === button));
      }
    }
    if (action === "admin-remove-detail-row") {
      const rec = selected();
      const draft = captureAdminTrackingDraftFromDom(rec);
      const index = Number(button.dataset.index);
      draft.rows.splice(index, 1);
      draft.images.splice(index, 1);
      AM_SIMPLE_STORE.mutate((current) => {
        persistAdminTrackingDraft(current, draft, false);
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Seguimiento guardado.", "admin-remove-detail-row")) return;
    }
    if (action === "save-internal-log") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const rows = qsa("[data-admin-internal-row]").map((input) => input.value.trim()).filter(Boolean);
        rec.internalWork = { ...(rec.internalWork || {}), internalNote: rows.join("\n"), lockedReception: true };
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Bitácora interna guardada.", "save-internal-log")) return;
    }
    if (action === "admin-add-internal-row") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const rows = internalRows(rec);
        const next = qs("[data-admin-new-internal]")?.value.trim();
        if (next) rows.push(next);
        rec.internalWork = { ...(rec.internalWork || {}), internalNote: rows.join("\n"), lockedReception: true };
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Bitácora interna guardada.", "admin-add-internal-row")) return;
    }
    if (action === "admin-remove-internal-row") {
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const rows = qsa("[data-admin-internal-row]").map((input) => input.value.trim()).filter(Boolean);
        rows.splice(Number(button.dataset.index), 1);
        rec.internalWork = { ...(rec.internalWork || {}), internalNote: rows.join("\n"), lockedReception: true };
      });
      syncSelectedAdminReceptionToEmployee();
      renderAdmin();
      if (!await confirmCloudSaved("Bitácora interna guardada.", "admin-remove-internal-row")) return;
    }
    if (action === "print-authorization") {
      const rec = AM_SIMPLE_STORE.selected(state());
      const evidence = rec.authorizationEvidence || {};
      const logoUrl = location.href.replace(/[^/\\]*$/, "") + "automotriz-medina-logo.png";
      const vehicleName = `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim().toUpperCase();
      const authorizationType = evidence.authorizationType || (rec.quickAuthorization ? "Firma presencial en taller" : "Cliente por link");
      const inventoryRows = (rec.inventory || []).map((item) => `
        <tr>
          <td>${esc(item.name)}</td>
          <td><span class="${item.present ? "ok-text" : "danger-text"}">${item.present ? "Presente" : "Faltante"}</span></td>
          <td>${esc(item.note || "Sin observación")}</td>
        </tr>`).join("");
      const damageRows = (rec.damages || []).map((damage) => `
        <tr>
          <td>${esc(damage.área || damage.area || "Área no indicada")}</td>
          <td>${esc(damage.detail || "Sin detalle")}</td>
          <td>${(damage.photos || []).length}</td>
        </tr>`).join("");
      const photoRows = (rec.photos || []).map((photo) => `
        <tr>
          <td>${esc(photo.label || "Fotografía")}</td>
          <td>${photo.dataUrl ? "Registrada" : "Pendiente"}</td>
          <td>${esc(photo.note || "")}</td>
        </tr>`).join("");
      const signatureMarkup = rec.signatureDataUrl
        ? `<img class="signature-img" src="${rec.signatureDataUrl}" alt="Firma del cliente">`
        : `<div class="signature-line"></div><small>Firma no capturada en este documento</small>`;
      const html = `
        <!doctype html><html><head><meta charset="utf-8"><title>Autorización ${esc(rec.number)}</title><style>
          *{box-sizing:border-box}
          body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#16212c;background:#eef3f6;line-height:1.42}
          .page{max-width:960px;margin:0 auto;background:#fff;min-height:100vh;padding:34px 38px}
          .header{display:grid;grid-template-columns:170px 1fr 230px;gap:22px;align-items:start;border-bottom:4px solid #206f78;padding-bottom:18px;margin-bottom:18px}
          .logo{width:150px;max-height:118px;object-fit:contain}
          .brand h1{margin:0;font-size:24px;line-height:1.15;text-transform:uppercase;letter-spacing:.03em;color:#17202a}
          .brand p,.meta p{margin:4px 0;color:#637282}
          .meta{text-align:right;font-size:13px}
          .status{display:inline-block;border-radius:999px;padding:7px 12px;font-weight:800;background:${rec.signed ? "#e7f4ed" : "#fff3d8"};color:${rec.signed ? "#24744a" : "#8a5b00"};margin-top:7px}
          .folio{font-weight:800;color:#17202a;font-size:18px}
          .notice{border-left:5px solid #206f78;background:#f4f8f9;padding:13px 15px;margin:14px 0;border-radius:4px}
          h2{font-size:14px;margin:22px 0 9px;color:#206f78;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #d9e1e8;padding-bottom:6px}
          table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px}
          td,th{border:1px solid #d9e1e8;padding:8px 9px;vertical-align:top}
          th{background:#eef5f6;text-align:left;color:#17202a}
          td:first-child{font-weight:700;color:#344255;width:28%}
          .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
          .legal{font-size:12.5px;text-align:justify}
          .legal h3{margin:0 0 8px;color:#17202a;font-size:15px}
          .legal p{margin:0 0 9px}
          .proof-table td:first-child{width:32%}
          .signature{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-top:24px;align-items:stretch}
          .box{border:1px solid #d9e1e8;border-radius:6px;padding:14px;min-height:128px;background:#fbfdfe}
          .signature-img{display:block;width:100%;max-height:160px;object-fit:contain;background:#fff;border:1px solid #d9e1e8;border-radius:4px;margin:8px 0}
          .signature-line{border-bottom:2px solid #17202a;height:72px;margin:20px 0 10px}
          .ok-text{color:#24744a;font-weight:700}
          .danger-text{color:#b52931;font-weight:700}
          .footer{margin-top:24px;border-top:1px solid #d9e1e8;padding-top:10px;color:#637282;font-size:11px;display:flex;justify-content:space-between;gap:16px}
          @media print{body{background:#fff}.page{padding:18px 20px}.no-break{break-inside:avoid}.header{grid-template-columns:130px 1fr 200px}.logo{width:118px}.legal{font-size:11.5px}}
        </style></head><body>
        <main class="page">
          <section class="header">
            <div><img class="logo" src="${logoUrl}" alt="Automotriz Medina"></div>
            <div class="brand">
              <h1>Autorización de diagnóstico y/o reparación</h1>
              <p><strong>Automotriz Medina</strong></p>
              <p>Documento de consentimiento informado del cliente</p>
            </div>
            <div class="meta">
              <p class="folio">${esc(rec.number)}</p>
              <p><strong>Impresión:</strong> ${new Date().toLocaleString("es-SV")}</p>
              <p><strong>Token:</strong> ${esc(rec.clientToken || "")}</p>
              <span class="status">${rec.signed ? "AUTORIZADO POR EL CLIENTE" : "PENDIENTE DE AUTORIZACION"}</span>
            </div>
          </section>

          <div class="notice">
            Este documento deja constancia formal de la recepción del vehículo, la información presentada al cliente, las condiciones registradas por el taller y la autorización otorgada para proceder con diagnóstico y/o reparación según corresponda.
          </div>

          <section class="grid-2 no-break">
            <div>
              <h2>Datos del cliente</h2>
              <table>
                <tr><td>Nombre</td><td>${esc(rec.client?.name || "Cliente pendiente")}</td></tr>
                <tr><td>Teléfono</td><td>${esc(rec.client?.phone || "Sin teléfono")}</td></tr>
                <tr><td>Autorizado por</td><td>${esc(rec.signatureName || rec.client?.name || "")}</td></tr>
                <tr><td>Fecha autorización</td><td>${esc(rec.signatureDate || "Pendiente")}</td></tr>
              </table>
            </div>
            <div>
              <h2>Datos del vehículo</h2>
              <table>
                <tr><td>Vehículo</td><td>${esc(vehicleName || "Vehículo pendiente")}</td></tr>
                <tr><td>Color</td><td>${esc(rec.vehicle?.color || "N/D")}</td></tr>
                <tr><td>Placa</td><td>${esc(rec.vehicle?.placa || "N/D")}</td></tr>
                <tr><td>VIN</td><td>${esc(rec.vehicle?.vin || "N/D")}</td></tr>
                <tr><td>Kilometraje</td><td>${esc(rec.vehicle?.kilometraje || "N/D")}</td></tr>
                <tr><td>Técnico receptor</td><td>${esc(rec.employeeName || "N/D")}</td></tr>
              </table>
            </div>
          </section>

          <h2>Motivo de recepción / falla reportada</h2>
          <div class="notice">${esc(serviceReason(rec) || "Sin motivo registrado.")}</div>

          <h2>Observaciones de recepción</h2>
          <div class="notice">${esc(rec.observations || "Sin observaciones registradas.")}</div>

          <h2>Inventario registrado</h2>
          <table><thead><tr><th>Elemento</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${inventoryRows || '<tr><td colspan="3">Sin inventario registrado.</td></tr>'}</tbody></table>

          <h2>Daños u observaciones de carrocería</h2>
          <table><thead><tr><th>Área</th><th>Detalle</th><th>Fotos</th></tr></thead><tbody>${damageRows || '<tr><td colspan="3">Sin daños registrados.</td></tr>'}</tbody></table>

          <h2>Registro fotográfico</h2>
          <table><thead><tr><th>Fotografía</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${photoRows || '<tr><td colspan="3">Sin fotografías registradas.</td></tr>'}</tbody></table>

          <h2>Cláusulas de autorización</h2>
          <div class="legal no-break">${authorizationTermsHtml()}</div>

          <h2>Constancia técnica de aceptación</h2>
          <table class="proof-table">
            <tr><td>Estado</td><td>${rec.signed ? "Autorizado" : "Pendiente"}</td></tr>
            <tr><td>Tipo de autorización</td><td>${esc(authorizationType)}</td></tr>
            <tr><td>Registrado por</td><td>${esc(evidence.registeredBy || (rec.quickAuthorization ? rec.employeeName : "Cliente"))}</td></tr>
            <tr><td>Motivo / referencia</td><td>${esc(evidence.reason || "")}</td></tr>
            <tr><td>Fecha de autorización</td><td>${esc(rec.signatureDate || "")}</td></tr>
            <tr><td>Token privado</td><td>${esc(rec.clientToken || "")}</td></tr>
            <tr><td>Navegador</td><td>${esc(evidence.userAgent || "No registrado")}</td></tr>
            <tr><td>Plataforma</td><td>${esc(evidence.platform || "No registrado")}</td></tr>
            <tr><td>Idioma</td><td>${esc(evidence.language || "No registrado")}</td></tr>
            <tr><td>Zona horaria</td><td>${esc(evidence.timezone || "No registrado")}</td></tr>
            <tr><td>Pantalla / ventana</td><td>${esc([evidence.screen, evidence.viewport].filter(Boolean).join(" / ") || "No registrado")}</td></tr>
          </table>

          <section class="signature no-break">
            <div class="box">
              <strong>Cliente / responsable</strong><br>
              ${esc(rec.signatureName || rec.client?.name || "")}
              ${signatureMarkup}
              <small>Autorización registrada en el expediente ${esc(rec.number || "")}.</small>
            </div>
            <div class="box">
              <strong>Automotriz Medina</strong><br>
              Recepción y resguardo del expediente.<br><br>
              <div class="signature-line"></div>
              <small>Firma / sello interno</small>
            </div>
          </section>

          <div class="footer">
            <span>Documento generado desde el sistema de recepción de Automotriz Medina.</span>
            <span>${esc(rec.number || "")} · ${new Date().toLocaleDateString("es-SV")}</span>
          </div>
        </main>
        </body></html>`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
      }
    }
    if (action === "add-update") {
      const title = qs("[name='updateTitle']")?.value || "Avance";
      const text = qs("[name='updateText']")?.value || "Avance registrado.";
      AM_SIMPLE_STORE.mutate((current) => {
        const rec = AM_SIMPLE_STORE.selected(current);
        const next = AM_SIMPLE_STORE.next(current, "update");
        rec.updates.unshift({ id: `upd-${next}`, date: today(), title, text, photo: "" });
      });
      renderAdmin();
      toast("Avance publicado en seguimiento.");
    }
    if (action === "prev-photo" || action === "next-photo") {
      const rec = findReceptionByParam("clientToken");
      const total = rec.photos.filter((photo) => AM_SIMPLE_STORE.carouselPhotos.includes(photo.label)).length;
      carouselIndex = action === "next-photo" ? (carouselIndex + 1) % total : (carouselIndex - 1 + total) % total;
      renderClientCarousel(rec);
    }
    if (action === "authorize-client") {
      const rec = findReceptionByParam("clientToken");
      const flow = qs("[data-authorization-flow]");
      const processingOnly = qs("[data-processing-only]");
      const authorizedOnly = qs("[data-authorized-only]");
      if (flow) flow.classList.add("hidden");
      if (authorizedOnly) authorizedOnly.classList.add("hidden");
      if (processingOnly) processingOnly.classList.remove("hidden");
      setTimeout(() => {
        AM_SIMPLE_STORE.mutate((current) => {
          const item = current.receptions.find((candidate) => candidate.id === rec.id);
          item.signed = true;
          item.signatureName = item.client.name;
          item.signatureDate = new Date().toLocaleString("es-SV");
          item.status = "Autorizado";
          item.authorizationEvidence = {
            acceptedAtIso: new Date().toISOString(),
            token: item.clientToken,
            userAgent: navigator.userAgent || "",
            platform: navigator.platform || "",
            language: navigator.language || "",
            languages: Array.isArray(navigator.languages) ? navigator.languages.join(", ") : "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            screen: `${screen.width}x${screen.height}`,
            viewport: `${innerWidth}x${innerHeight}`
          };
        });
        renderClient();
        toast("Autorización recibida. Link de seguimiento generado.");
      }, 3000);
    }
    if (action === "acknowledge-client-photos") {
      const rec = findReceptionByParam("clientToken");
      const flow = qs("[data-authorization-flow]");
      const processingOnly = qs("[data-processing-only]");
      const authorizedOnly = qs("[data-authorized-only]");
      if (flow) flow.classList.add("hidden");
      if (authorizedOnly) authorizedOnly.classList.add("hidden");
      if (processingOnly) processingOnly.classList.remove("hidden");
      setTimeout(() => {
        AM_SIMPLE_STORE.mutate((current) => {
          const item = current.receptions.find((candidate) => candidate.id === rec.id);
          item.photoAcknowledged = true;
          item.photoAcknowledgedAt = new Date().toLocaleString("es-SV");
          item.photoAcknowledgementEvidence = {
            acceptedAtIso: new Date().toISOString(),
            token: item.clientToken,
            userAgent: navigator.userAgent || "",
            platform: navigator.platform || "",
            language: navigator.language || "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            screen: `${screen.width}x${screen.height}`,
            viewport: `${innerWidth}x${innerHeight}`
          };
        });
        renderClient();
        toast("Fotografías revisadas. Seguimiento habilitado.");
      }, 1400);
    }
  });

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (input.matches?.("[data-dashboard-quick-search]")) {
      adminDashboardQuickSearch = input.value || "";
      renderReceptionTable();
      return;
    }
    if (input.matches?.("[data-admin-search], [data-admin-date-from], [data-admin-date-to], [data-admin-vehicle-year]")) {
      adminSearchFilters.text = qs("[data-admin-search]")?.value || "";
      adminSearchFilters.dateFrom = qs("[data-admin-date-from]")?.value || "";
      adminSearchFilters.dateTo = qs("[data-admin-date-to]")?.value || "";
      adminSearchFilters.vehicleYear = qs("[data-admin-vehicle-year]")?.value || "";
      syncAdminSearchInputs();
      renderReceptionTable();
      renderClientCatalog();
    }
  });

  document.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.matches?.("[data-admin-search], [data-admin-date-from], [data-admin-date-to], [data-admin-vehicle-year]")) {
      adminSearchFilters.text = qs("[data-admin-search]")?.value || "";
      adminSearchFilters.dateFrom = qs("[data-admin-date-from]")?.value || "";
      adminSearchFilters.dateTo = qs("[data-admin-date-to]")?.value || "";
      adminSearchFilters.vehicleYear = qs("[data-admin-vehicle-year]")?.value || "";
      syncAdminSearchInputs();
      renderReceptionTable();
      renderClientCatalog();
      return;
    }
    if (input.matches("[data-backup-input]")) {
      importBackupFile(input.files?.[0], input.dataset.backupInput || "").catch((error) => {
        console.error(error);
        toast(error.message || "No se pudo cargar el respaldo.", "danger");
      }).finally(() => {
        input.value = "";
      });
      return;
    }
    if (input.matches("[data-backup-viewer-input]")) {
      previewBackupFile(input.files?.[0]).catch((error) => {
        console.error(error);
        toast(error.message || "No se pudo abrir el expediente temporal.", "danger");
      }).finally(() => {
        input.value = "";
      });
      return;
    }
    if (input.matches("[data-photo-index]") && input.dataset.damagePhoto == null) {
      const index = Number(input.dataset.photoIndex);
      readFile(input, (dataUrl) => {
        AM_SIMPLE_STORE.mutate((current) => {
          AM_SIMPLE_STORE.selected(current).photos[index].dataUrl = dataUrl;
        });
        renderPhotoEditor();
      });
    }
    if (input.matches("[data-damage-photo]")) {
      const damageId = input.dataset.damagePhoto;
      const photoIndex = Number(input.dataset.photoIndex);
      readFile(input, (dataUrl) => {
        AM_SIMPLE_STORE.mutate((current) => {
          const damage = AM_SIMPLE_STORE.selected(current).damages.find((item) => item.id === damageId);
          if (damage) damage.photos[photoIndex].dataUrl = dataUrl;
        });
        renderDamageEditor();
      });
    }
    if (input.matches("[data-admin-photo-index]")) {
      const photoIndex = Number(input.dataset.adminPhotoIndex);
      readFile(input, (dataUrl) => {
        AM_SIMPLE_STORE.mutate((current) => {
          const rec = AM_SIMPLE_STORE.selected(current);
          if (rec.photos[photoIndex]) rec.photos[photoIndex].dataUrl = dataUrl;
        });
        renderAdmin();
      });
    }
    if (input.matches("[data-admin-detail-image]")) {
      const rec = selected();
      const rowIndex = Number(input.dataset.adminDetailImage);
      try {
        const dataUrl = await readFilePromise(input);
        if (!dataUrl) return;
        const draft = captureAdminTrackingDraftFromDom(rec);
        while (draft.images.length <= rowIndex) draft.images.push([]);
        if (!Array.isArray(draft.images[rowIndex])) draft.images[rowIndex] = [];
        draft.images[rowIndex].push(dataUrl);
        AM_SIMPLE_STORE.mutate((current) => {
          persistAdminTrackingDraft(current, draft, false);
        });
        syncSelectedAdminReceptionToEmployee();
        renderAdmin();
        if (!await confirmCloudSaved("Imagen de seguimiento guardada.", "admin-detail-image")) return;
      } catch (error) {
        console.error(error);
        toast(error.message || "No se pudo guardar la imagen.", "danger");
      } finally {
        input.value = "";
      }
      return;
    }
    if (input.matches("[data-admin-damage-photo]")) {
      const damageId = input.dataset.adminDamagePhoto;
      const photoIndex = Number(input.dataset.photoIndex);
      readFile(input, (dataUrl) => {
        AM_SIMPLE_STORE.mutate((current) => {
          const rec = AM_SIMPLE_STORE.selected(current);
          const damage = rec.damages.find((item) => item.id === damageId);
          if (damage?.photos?.[photoIndex]) damage.photos[photoIndex].dataUrl = dataUrl;
        });
        renderAdmin();
      });
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-admin-progress]")) {
      const value = qs("[data-progress-value]");
      if (value) value.textContent = `${event.target.value}%`;
    }
    if (event.target.matches("[data-terms-check]")) {
      const button = qs("[data-action='authorize-client']");
      if (button) button.disabled = !event.target.checked;
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-terms-check]")) {
      const button = qs("[data-action='authorize-client']");
      if (button) button.disabled = !event.target.checked;
    }
  });
}

function handleEmployeeModuleAction(action, button, event) {
  if (action === "employee-new-vehicle") {
    createReception();
    return true;
  }
  if (action === "next-step") {
    saveReceptionDraft();
    setEmployeeWizardStep("fotos");
    return true;
  }
  if (action === "employee-step-data") {
    setEmployeeWizardStep("datos");
    return true;
  }
  if (action === "employee-step-photos") {
    setEmployeeWizardStep("fotos");
    return true;
  }
  if (action === "employee-step-inventory") {
    saveReceptionDraft();
    setEmployeeWizardStep("inventario");
    return true;
  }
  if (action === "employee-step-damages") {
    saveInventoryFromDom();
    setEmployeeWizardStep("danos");
    return true;
  }
  if (action === "employee-step-finish") {
    const finalSummary = qs("[data-final-summary]");
    const rec = selected();
    if (finalSummary && rec) {
      finalSummary.innerHTML = `
        <div class="grid cols-3">
          <div class="metric"><span>Vehículo</span><strong>${rec.vehicle.marca || "Pendiente"} ${rec.vehicle.modelo || ""}</strong><small>${rec.vehicle.placa || "Sin placa"}</small></div>
          <div class="metric"><span>Fotos</span><strong>${rec.photos.filter((p) => p.dataUrl).length}/${rec.photos.length}</strong><small>Cargadas</small></div>
          <div class="metric"><span>Daños</span><strong>${rec.damages.length}</strong><small>Registrados</small></div>
        </div>`;
    }
    setEmployeeWizardStep("finalizar");
    return true;
  }
  if (action === "save-reception") {
    saveReception();
    return true;
  }
  if (action === "add-inventory") {
    const name = prompt("Nombre del inventario");
    if (!name) return true;
    AM_SIMPLE_STORE.mutate((current) => {
      const rec = AM_SIMPLE_STORE.selected(current);
      if (!rec) return;
      const next = AM_SIMPLE_STORE.next(current, "inventory");
      rec.inventory.push({ id: `inv-${next}`, name, present: true, note: "" });
    });
    renderEmployee();
    return true;
  }
  if (action === "add-damage") {
    const area = qs("[name='damageArea']")?.value || "Área no especificada";
    const detail = qs("[name='damageDetail']")?.value || "Detalle pendiente";
    AM_SIMPLE_STORE.mutate((current) => {
      const rec = AM_SIMPLE_STORE.selected(current);
      if (!rec) return;
      const next = AM_SIMPLE_STORE.next(current, "damage");
      rec.damages.push({ id: `dam-${next}`, área, detail, photos: [{ label: `Daño ${área}`, dataUrl: "", note: "", color: "#b52931" }] });
    });
    renderEmployee();
    toast("Daño agregado.");
    return true;
  }
  if (action === "remove-damage") {
    AM_SIMPLE_STORE.mutate((current) => {
      const rec = AM_SIMPLE_STORE.selected(current);
      if (!rec) return;
      rec.damages = rec.damages.filter((item) => item.id !== button.dataset.id);
    });
    renderEmployee();
    return true;
  }
  if (action === "open-employee-vehicle") {
    AM_SIMPLE_STORE.mutate((current) => { current.selectedId = button.dataset.id; });
    renderEmployee();
    showSection("vehiculo");
    return true;
  }
  if (action === "employee-save-work") {
    AM_SIMPLE_STORE.mutate((current) => {
      const rec = AM_SIMPLE_STORE.selected(current);
      if (!rec) return;
      const status = qs('[data-employee-work="status"]')?.value || rec.status;
      const progress = Number(qs('[data-employee-work="progress"]')?.value || rec.progress || 0);
      const details = qs('[data-employee-work="processDetails"]')?.value || "";
      const note = qs('[data-employee-work="internalNote"]')?.value || "";
      rec.status = status;
      rec.pendingTracking = {
        status: "pending",
        employeeName: rec.employeeName || "EMPLEADO",
        submittedAt: new Date().toISOString(),
        state: status,
        progress,
        processDetails: details,
        images: []
      };
      rec.internalWork = { ...(rec.internalWork || {}), internalNote: note };
    });
    renderEmployee();
    toast("Cambios guardados.");
    return true;
  }
  if (action === "employee-mark-finished") {
    AM_SIMPLE_STORE.mutate((current) => {
      const rec = AM_SIMPLE_STORE.selected(current);
      if (!rec) return;
      rec.status = "FINALIZADO";
      rec.pendingTracking = {
        ...(rec.pendingTracking || {}),
        status: "pending",
        employeeName: rec.employeeName || "EMPLEADO",
        submittedAt: new Date().toISOString(),
        state: "FINALIZADO",
        progress: 100,
        processDetails: rec.pendingTracking?.processDetails || rec.tracking?.processDetails || "",
        images: rec.pendingTracking?.images || []
      };
    });
    renderEmployee();
    showSection("finalizados");
    toast("Vehículo marcado como finalizado.");
    return true;
  }
  return false;
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
  toast("Link copiado al portapapeles.");
}

function enableSpanishSpellcheck(root = document) {
  root.querySelectorAll?.("input:not([type='number']):not([type='date']):not([type='time']):not([type='range']):not([type='file']), textarea").forEach((field) => {
    field.setAttribute("spellcheck", "true");
    field.setAttribute("lang", "es");
  });
}

function initBackupViewer() {
  const drop = qs("[data-backup-viewer-drop]");
  const input = qs("[data-backup-viewer-input]");
  if (!drop && !input) return;
  if (drop && !drop.dataset.ready) {
    drop.dataset.ready = "1";
    ["dragenter", "dragover"].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      drop.addEventListener(type, () => drop.classList.remove("dragover"));
    });
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      previewBackupFile(event.dataTransfer?.files?.[0]).catch((error) => {
        console.error(error);
        toast(error.message || "No se pudo abrir el expediente temporal.", "danger");
      });
    });
    drop.addEventListener("click", () => input?.click());
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  handleActions();
  initActionMenus();
  initBackupViewer();
  const page = document.body.dataset.page;
  if (page === "admin") compactLocalArchiveStores();
  if ((page === "admin" || page === "employee") && !requireLocalAccess(page)) return;
  if (globalThis.AM_CLOUD_SYNC?.isReady?.() && ["admin", "client", "tracking"].includes(page)) {
    try {
      await AM_CLOUD_SYNC.ready();
      if (page === "admin") cloudLog("Datos cargados desde nube.", "ok");
    } catch (error) {
      if (page === "admin") cloudLog(`No se pudo cargar nube: ${error.message || error}`, "danger");
      else toast(`No se pudo cargar nube: ${error.message || error}`, "danger");
    }
  }
  renderNav();
  renderTabs();
  if (page === "admin") {
    applyAdminHashRoute();
  }
  if (page === "employee") renderEmployee();
  if (page === "client") renderClient();
  if (page === "tracking") renderTracking();
  enableSpanishSpellcheck();
  if (page === "admin") {
    setInterval(() => {
      const dashboard = qs('[data-section="dashboard"]');
      if (dashboard && !dashboard.classList.contains("hidden")) renderReceptionTable();
    }, 1000);
  }
});

document.addEventListener("focusin", (event) => {
  if (event.target.matches?.("input, textarea")) enableSpanishSpellcheck(document);
});

window.addEventListener("hashchange", () => {
  if (document.body.dataset.page !== "admin") return;
  applyAdminHashRoute();
});

window.addEventListener("popstate", () => {
  if (hasOpenActionMenu()) closeActionMenus();
});




