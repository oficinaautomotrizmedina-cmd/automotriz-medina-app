const EMPLOYEE_KEY = "am_employee_module_v1";
const requiredPhotos = ["Frente", "Lado izquierdo", "Atras", "Lado derecho", "Tablero con kilometraje", "Interior delantero", "Compartimiento motor", "Tarjeta frente", "Tarjeta reverso"];
const baseInventory = ["Herramientas", "Llanta de repuesto", "Mica", "Llave de ruedas", "Documentos", "Radio/Pantalla"];

function qs(selector, scope = document) { return scope.querySelector(selector); }
function qsa(selector, scope = document) { return Array.from(scope.querySelectorAll(selector)); }

function employeeFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const id = (params.get("empleado") || "edwin").toLowerCase();
  const names = { edwin: "Edwin", rafael: "Rafael", christian: "Christian" };
  return { id: names[id] ? id : "edwin", name: names[id] || "Edwin" };
}

function token() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makePhoto(label) {
  return { label, dataUrl: "", note: "" };
}

function defaults() {
  return {
    selectedId: "",
    sequence: 3,
    vehicles: [
      sampleVehicle("veh-1", "AM-R-0001", "edwin", "Edwin", "NISSAN", "VERSA", "2020", "NEGRO", "N/D", "N/D", "81046", "mi", "EN DIAGNÓSTICO", 20),
      sampleVehicle("veh-2", "AM-R-0002", "edwin", "Edwin", "TOYOTA", "COROLLA", "2018", "BLANCO", "P778-554", "JTDBR32E7200302", "116100", "mi", "EN REVISIÓN", 10),
      sampleVehicle("veh-3", "AM-R-0003", "rafael", "Rafael", "NISSAN", "FRONTIER", "2017", "ROJO", "N122-811", "3N6AD33A9HK0303", "141900", "mi", "ESPERA DE REPUESTOS", 45),
      sampleVehicle("veh-4", "AM-R-0004", "christian", "Christian", "HYUNDAI", "TUCSON", "2019", "GRIS", "P908-332", "KM8J33A49KU0304", "68420", "mi", "EN DIAGNÓSTICO", 25)
    ]
  };
}

function sampleVehicle(id, reception, employeeId, employeeName, marca, modelo, anio, color, placa, vin, odometro, unidad, estado, avance) {
  return {
    id, reception, employeeId, employeeName,
    fecha: "2026-06-24", hora: "14:30",
    marca, modelo, anio, color, vin, placa, odometro, unidad,
    estado, avance,
    autorizado: false,
    observaciones: "Recepción registrada para revisión.",
    detalle: "Revisión inicial pendiente.",
    nota: "",
    photos: requiredPhotos.map(makePhoto),
    inventory: baseInventory.map((name, index) => ({ id: `inv-${id}-${index}`, name, present: true, note: "" })),
    damages: []
  };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(EMPLOYEE_KEY)) || defaults();
  } catch {
    return defaults();
  }
}

function save(state) {
  localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(state));
}

function mutate(fn) {
  const state = load();
  fn(state);
  save(state);
}

function activeVehicle(state = load()) {
  return state.vehicles.find((item) => item.id === state.selectedId);
}

let draft = null;

function initDraft() {
  const employee = employeeFromHash();
  draft = {
    id: "draft-" + token(),
    reception: "",
    employeeId: employee.id,
    employeeName: employee.name,
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    marca: "", modelo: "", anio: "", color: "", vin: "", placa: "", odometro: "", unidad: "mi",
    estado: "EN REVISIÓN", avance: 0, autorizado: false, observaciones: "", detalle: "", nota: "",
    photos: requiredPhotos.map(makePhoto),
    inventory: baseInventory.map((name, index) => ({ id: `draft-inv-${index}`, name, present: true, note: "" })),
    damages: []
  };
}

function showSection(name) {
  qsa("[data-employee-section]").forEach((section) => section.classList.toggle("hidden", section.dataset.employeeSection !== name));
  qsa("[data-employee-section-target]").forEach((button) => button.classList.toggle("active", button.dataset.employeeSectionTarget === name));
  const mobile = qs("[data-employee-nav]");
  if (mobile) mobile.value = name;
}

function showStep(name) {
  qsa("[data-step-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.stepPanel !== name));
}

function photoBox(photo, attrs = "") {
  const style = photo.dataUrl ? ` style="background-image:url('${photo.dataUrl}')"` : "";
  return `<div class="photo-box ${photo.dataUrl ? "has-image" : ""}" data-label="${photo.label}"${style}>${photo.dataUrl ? "" : "Foto pendiente"}</div>`;
}

function render() {
  const employee = employeeFromHash();
  qsa("[data-employee-label]").forEach((el) => { el.textContent = employee.name; });
  qsa("[data-employee-label-inline]").forEach((el) => { el.textContent = employee.name; });
  const state = load();
  const mine = state.vehicles.filter((item) => item.employeeId === employee.id);
  const active = mine.filter((item) => item.estado !== "FINALIZADO");
  const finished = mine.filter((item) => item.estado === "FINALIZADO");
  const metrics = qs("[data-employee-metrics]");
  if (metrics) {
    metrics.innerHTML = `
      <div class="metric"><span>En taller</span><strong>${active.length}</strong><small>${employee.name}</small></div>
      <div class="metric"><span>Finalizados</span><strong>${finished.length}</strong><small>Pendientes de cierre admin</small></div>
      <div class="metric"><span>Empleado</span><strong>${employee.name}</strong><small>Módulo local</small></div>`;
  }
  qs("[data-active-list]").innerHTML = active.map(rowVehicle).join("") || '<tr><td colspan="5">Sin vehículos activos.</td></tr>';
  qs("[data-finished-list]").innerHTML = finished.map((item) => `
    <tr><td><strong>${item.reception}</strong></td><td>${item.marca} ${item.modelo} ${item.anio}</td><td><span class="pill ok">${item.estado}</span></td><td><button class="btn" data-employee-action="open-work" data-id="${item.id}">Ver</button></td></tr>
  `).join("") || '<tr><td colspan="4">Sin vehículos finalizados.</td></tr>';
  renderDraft();
  renderWork();
}

function rowVehicle(item) {
  return `
    <tr>
      <td><strong>${item.reception}</strong><br><small>${item.fecha} ${item.hora}</small></td>
      <td>${item.marca} ${item.modelo} ${item.anio}<br><small>${item.placa || "N/D"}</small></td>
      <td><span class="pill info">${item.estado}</span></td>
      <td>${item.autorizado ? '<span class="pill ok">Autorizado</span>' : '<span class="pill warn">Pendiente</span>'}</td>
      <td><button class="btn primary" data-employee-action="open-work" data-id="${item.id}">Abrir vehículo</button></td>
    </tr>`;
}

function renderDraft() {
  if (!draft) initDraft();
  const employee = employeeFromHash();
  const form = qs("[data-new-form]");
  if (form) {
    const values = { ...draft, tecnico: employee.name };
    Object.entries(values).forEach(([key, value]) => {
      const input = form.elements[key];
      if (input) input.value = value || "";
    });
  }
  qs("[data-photo-list]").innerHTML = draft.photos.map((photo, index) => `
    <article class="photo-card">${photoBox(photo)}<div class="field"><label>${photo.label}</label><input type="file" accept="image/*" data-photo-index="${index}"></div></article>
  `).join("");
  qs("[data-inventory-list]").innerHTML = draft.inventory.map((item) => `
    <label class="check-item"><input type="checkbox" ${item.present ? "checked" : ""} data-inv-present="${item.id}"><span><strong>${item.name}</strong><input placeholder="Detalle" value="${item.note || ""}" data-inv-note="${item.id}"></span></label>
  `).join("");
  qs("[data-damage-list]").innerHTML = draft.damages.map((damage) => `
    <article class="panel"><div class="panel-header"><div><h3>${damage.área}</h3><p>${damage.detail}</p></div></div></article>
  `).join("") || '<div class="notice">No hay daños registrados.</div>';
}

function collectDraftData() {
  const form = qs("[data-new-form]");
  const data = new FormData(form);
  ["fecha", "hora", "marca", "modelo", "anio", "color", "vin", "placa", "odometro", "unidad", "observaciones"].forEach((key) => {
    draft[key] = String(data.get(key) || "").toUpperCase();
  });
  draft.técnico = employeeFromHash().name;
}

function renderWork() {
  const state = load();
  const item = activeVehicle(state);
  qs("[data-work-empty]").classList.toggle("hidden", !!item);
  qs("[data-work-panel]").classList.toggle("hidden", !item);
  if (!item) return;
  qs("[data-work-summary]").innerHTML = `
    <div class="grid cols-4">
      <div class="metric"><span>Recepción</span><strong>${item.reception}</strong><small>${item.estado}</small></div>
      <div class="metric"><span>Vehículo</span><strong>${item.marca} ${item.modelo}</strong><small>${item.anio} - ${item.color}</small></div>
      <div class="metric"><span>Placa</span><strong>${item.placa || "N/D"}</strong><small>VIN: ${item.vin || "N/D"}</small></div>
      <div class="metric"><span>Autorización</span><strong>${item.autorizado ? "Sí" : "No"}</strong><small>${item.autorizado ? "Cliente autorizo" : "Pendiente"}</small></div>
    </div>`;
  qs('[data-work-field="estado"]').value = item.estado;
  qs('[data-work-field="avance"]').value = item.avance;
  qs('[data-work-field="detalle"]').value = item.detalle || "";
  qs('[data-work-field="nota"]').value = item.nota || "";
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-employee-section-target], [data-employee-action]");
    if (!control) return;
    const sectionTarget = control.dataset.employeeSectionTarget;
    if (sectionTarget) return showSection(sectionTarget);
    const action = control.dataset.employeeAction;
    if (action === "new-vehicle") { initDraft(); renderDraft(); showSection("new"); showStep("data"); }
    if (action === "step-data") showStep("data");
    if (action === "step-photos") { collectDraftData(); showStep("photos"); }
    if (action === "step-inventory") { collectDraftData(); showStep("inventory"); }
    if (action === "step-damages") { collectInventory(); showStep("damages"); }
    if (action === "step-finish") { collectDraftData(); collectInventory(); renderFinish(); showStep("finish"); }
    if (action === "add-inventory") {
      const name = prompt("Nombre del inventario");
      if (name) { draft.inventory.push({ id: "inv-" + token(), name, present: true, note: "" }); renderDraft(); }
    }
    if (action === "add-damage") {
      const area = qs('[name="damageArea"]').value || "Área no especificada";
      const detail = qs('[name="damageDetail"]').value || "Detalle pendiente";
      draft.damages.push({ id: "dam-" + token(), área, detail, photos: [] });
      renderDraft();
    }
    if (action === "save-new") saveNewVehicle();
    if (action === "open-work") {
      mutate((state) => { state.selectedId = control.dataset.id; });
      render();
      showSection("work");
    }
    if (action === "save-work") saveWork();
    if (action === "mark-finished") {
      mutate((state) => {
        const item = state.vehicles.find((vehicle) => vehicle.id === state.selectedId);
        if (item) { item.estado = "FINALIZADO"; item.avance = 100; }
      });
      render();
      showSection("finished");
    }
  });
  qs("[data-employee-nav]").addEventListener("change", (event) => showSection(event.target.value));
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input.matches("[data-photo-index]") && input.files[0]) {
      const index = Number(input.dataset.photoIndex);
      const reader = new FileReader();
      reader.onload = () => { draft.photos[index].dataUrl = reader.result; renderDraft(); };
      reader.readAsDataURL(input.files[0]);
    }
  });
}

function collectInventory() {
  draft.inventory.forEach((item) => {
    const present = qs(`[data-inv-present="${item.id}"]`);
    const note = qs(`[data-inv-note="${item.id}"]`);
    item.present = !!present?.checked;
    item.note = note?.value || "";
  });
}

function renderFinish() {
  qs("[data-finish-summary]").innerHTML = `
    <div class="grid cols-3">
      <div class="metric"><span>Vehículo</span><strong>${draft.marca || "Pendiente"} ${draft.modelo || ""}</strong><small>${draft.placa || "Sin placa"}</small></div>
      <div class="metric"><span>Fotos</span><strong>${draft.photos.filter((photo) => photo.dataUrl).length}/${draft.photos.length}</strong><small>Cargadas localmente</small></div>
      <div class="metric"><span>Daños</span><strong>${draft.damages.length}</strong><small>Registrados</small></div>
    </div>`;
}

function saveNewVehicle() {
  collectDraftData();
  collectInventory();
  const employee = employeeFromHash();
  mutate((state) => {
    const next = state.sequence + 1;
    state.sequence = next;
    state.vehicles.unshift({
      ...draft,
      id: "veh-" + next,
      reception: "AM-R-" + String(next).padStart(4, "0"),
      employeeId: employee.id,
      employeeName: employee.name,
      estado: "EN REVISIÓN",
      avance: 0,
      autorizado: false,
      detalle: draft.observaciones || "Recepción registrada",
      nota: ""
    });
  });
  initDraft();
  render();
  showSection("assigned");
}

function saveWork() {
  mutate((state) => {
    const item = state.vehicles.find((vehicle) => vehicle.id === state.selectedId);
    if (!item) return;
    item.estado = qs('[data-work-field="estado"]').value;
    item.avance = Number(qs('[data-work-field="avance"]').value || 0);
    item.detalle = qs('[data-work-field="detalle"]').value || "";
    item.nota = qs('[data-work-field="nota"]').value || "";
  });
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  initDraft();
  render();
  bindEvents();
});



