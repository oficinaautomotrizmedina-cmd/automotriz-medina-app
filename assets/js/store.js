const AM_SIMPLE_STORE = (() => {
  const KEY = "am_recepción_local_v1";
  const SELECT_KEY = "am_admin_selected_reception_v1";

  const requiredPhotos = [
    "Frente",
    "Lado izquierdo",
    "Atrás",
    "Lado derecho",
    "Tablero con kilometraje",
    "Interior delantero",
    "Interior trasero",
    "Compartimiento del motor",
    "Cajuela o palangana",
    "Frente de tarjeta",
    "Reverso de tarjeta"
  ];

  const carouselPhotos = requiredPhotos.filter((name) => !name.startsWith("Tarjeta"));
  const baseInventory = ["Herramientas", "Llanta de repuesto", "Mica", "Llave de ruedas", "Documentos", "Radio/Pantalla"];

  function cryptoToken() {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function makePhoto(label, seed) {
    return {
      label,
      dataUrl: "",
      note: "",
      color: seed % 2 === 0 ? "#206f78" : "#b52931"
    };
  }

  function makeReception(id, number, employeeId, employeeName, clientName, phone, marca, modelo, anio, color, placa, vin, kilometraje, state, progress, details) {
    const clientToken = "cli_" + cryptoToken();
    const trackingToken = "trk_" + cryptoToken();
    return {
      id,
      number,
      status: "Revisión lista",
      sentToClient: false,
      signed: false,
      signatureName: "",
      signatureDate: "",
      clientToken,
      trackingToken,
      client: { name: clientName, phone },
      employeeId,
      employeeName,
      vehicle: { marca, modelo, anio, color, placa, vin, kilometraje },
      photos: requiredPhotos.map((label, index) => makePhoto(label, index)),
      inventory: baseInventory.map((name, index) => ({
        id: `inv-${id}-${index + 1}`,
        name,
        present: index !== 1,
        note: index === 1 ? "No venia en el vehículo" : ""
      })),
      observations: "Vehículo recibido para revisión. Se observa desgaste normal de uso.",
      damages: [
        {
          id: `dam-${id}-1`,
          área: "Defensa traserá",
          detail: "Rayon visible en esquina derecha.",
          photos: [makePhoto("Daño defensa traserá", 10)]
        }
      ],
      progress,
      progressLabel: state,
      tracking: {
        receptionDate: "18/6/2026, 3:23:00 p.m.",
        deliveryEstimate: "",
        odometer: `${Number(kilometraje || 0).toLocaleString("en-US")} MILLAS`,
        plate: placa || "N/D",
        vehicleTitle: `${marca} ${modelo} ${anio}`.toUpperCase(),
        state,
        processDetails: details
      },
      internalWork: {
        internalNote: "",
        lockedReception: true
      },
      updates: []
    };
  }

  function defaults() {
    return {
      config: {
        schemaVersion: 3,
        businessName: "Automotriz Medina",
        adminPin: "2468",
        employeeToken: "empleado-am-local",
        nextReceptionNumber: 1
      },
      employees: [
        { id: "edwin", name: "Edwin", token: "empleado-edwin" },
        { id: "rafael", name: "Rafael", token: "empleado-rafael" },
        { id: "cristian", name: "Cristian", token: "empleado-cristian" }
      ],
      session: {
        admin: true,
        employee: true
      },
      selectedId: null,
      sequence: { reception: 0, damage: 0, update: 0, inventory: 0 },
      receptions: []
    };
  }

  function loadRaw() {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const initial = defaults();
      save(initial);
      return initial;
    }
    try {
      return JSON.parse(raw);
    } catch {
      const initial = defaults();
      save(initial);
      return initial;
    }
  }

  function save(state, options = {}) {
    const markLocalWrite = options.markLocalWrite !== false;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (markLocalWrite) localStorage.setItem("am_cloud_local_write_v1", new Date().toISOString());
      return true;
    } catch (error) {
      console.warn("No se pudo guardar el estado local.", error);
      return false;
    }
  }

  function ensureShape(state) {
    const base = defaults();
    if (!state || typeof state !== "object") return base;
    if (!Array.isArray(state.receptions)) state.receptions = [];
    if (!state.config || state.config.schemaVersion !== 3) {
      state.config = { ...base.config, ...(state.config || {}), schemaVersion: 3 };
    }
    if (!state.session) state.session = { admin: true, employee: true };
    if (!Array.isArray(state.employees)) state.employees = base.employees;
    if (!state.sequence) state.sequence = base.sequence;
    if (!Array.isArray(state.deletedReceptionNumbers)) state.deletedReceptionNumbers = [];
    if (!Array.isArray(state.employeeNotifications)) state.employeeNotifications = [];
    state.receptions.forEach((rec) => {
      if (!rec.employeeId) {
        rec.employeeId = "edwin";
        rec.employeeName = "Edwin";
      }
      if (!rec.internalWork) rec.internalWork = { internalNote: "", lockedReception: true };
      if (!rec.clientToken || rec.clientToken.startsWith("cliente-demo")) rec.clientToken = "cli_" + cryptoToken();
      if (!rec.trackingToken || rec.trackingToken.startsWith("seguimiento-demo")) rec.trackingToken = "trk_" + cryptoToken();
      if (!rec.tracking) {
        rec.tracking = {
          receptionDate: "18/6/2026, 3:23:00 p.m.",
          deliveryEstimate: "",
          odometer: `${Number(rec.vehicle?.kilometraje || 0).toLocaleString("en-US")} MILLAS`,
          plate: rec.vehicle?.placa || "N/D",
          vehicleTitle: `${rec.vehicle?.marca || ""} ${rec.vehicle?.modelo || ""} ${rec.vehicle?.anio || ""}`.trim().toUpperCase(),
          state: rec.progressLabel || "EN DIAGNÓSTICO",
          processDetails: "Revisión pendiente"
        };
      }
    });
    return state;
  }

  function load() {
    const state = ensureShape(loadRaw());
    try {
      const sessionSelected = sessionStorage.getItem(SELECT_KEY);
      if (sessionSelected && state.receptions.some((rec) => rec.id === sessionSelected)) {
        state.selectedId = sessionSelected;
      }
    } catch {}
    save(state, { markLocalWrite: false });
    return state;
  }

  function setSelectedId(id) {
    try {
      if (id) sessionStorage.setItem(SELECT_KEY, id);
      else sessionStorage.removeItem(SELECT_KEY);
    } catch {}
  }

  function mutate(callback, options = {}) {
    const state = load();
    const result = callback(state);
    save(state, options);
    window.dispatchEvent(new CustomEvent("simple-state-change", { detail: state }));
    return result;
  }

  function reset() {
    localStorage.removeItem(KEY);
    const state = load();
    window.dispatchEvent(new CustomEvent("simple-state-change", { detail: state }));
    return state;
  }

  function selected(state = load()) {
    return state.receptions.find((item) => item.id === state.selectedId) || state.receptions[0];
  }

  function next(state, key) {
    state.sequence[key] += 1;
    return state.sequence[key];
  }

  return { load, save, mutate, reset, selected, setSelectedId, next, requiredPhotos, carouselPhotos, baseInventory, cryptoToken };
})();




