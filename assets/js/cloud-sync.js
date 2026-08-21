globalThis.AM_CLOUD_SYNC = (() => {
  const CONFIG_KEY = "am_cloud_sync_config_v1";
  const EMPLOYEE_KEY = "am_employee_module_safe_v2";
  const ADMIN_KEY = "am_recepci\u00f3n_local_v1";
  const LEGACY_ADMIN_KEY = "am_recepción_local_v1";
  const MASTER_ARCHIVE_KEY = "am_master_taller_archives_v1";
  const QUICK_ARCHIVE_KEY = "am_quick_taller_archives_v1";
  const LOCAL_WRITE_KEY = "am_cloud_local_write_v1";
  const DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbysDn3BlShlZm5NxZOu1WdkTZDrb1vpWhLLUED_J8cuc9RS6n4cr48rvTkFr7X-UbfRBQ/exec";
  const BLOCKED_ENDPOINTS = new Set([
    "https://script.google.com/macros/s/AKfycbwJfuzhng2vZQ338s2GbdXb8El41OhtHz81ZyXgpLhSfJ7QLIfnKT0dQODAkymCLMvs/exec",
    "https://script.google.com/macros/s/AKfycby5D72bQSmpLv2pqJn7BmhiVArsyN5xsQxe7o3LmyvKZh1He1poANYWUH6rV4gZX0J_GA/exec",
    "https://script.google.com/macros/s/AKfycbx2aKTDxKkJbZgOImcT4EDo_Eo2Y8-Ll49JtmVkFyZjTHww_aSbdJerbIjJzkM1BljmuQ/exec",
    "https://script.google.com/macros/s/AKfycbzUvnrRnlqK92rdovgM2i373NM3H2Ig4BRjGqtFnjfiCdRAX2XdyT02ZgRNwXHCE6-siQ/exec"
  ]);
  let timer = null;
  let saving = false;
  let saveTail = Promise.resolve();
  let activeSavePromise = null;
  let initialLoadPromise = null;
  const IMAGE_MAX = 560;
  const IMAGE_QUALITY = 0.42;
  const IMAGE_LIMIT = 70000;

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function config() {
    const stored = readJson(CONFIG_KEY, {}) || {};
    const storedEndpoint = String(stored.endpoint || "").trim();
    const validEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(storedEndpoint) && !BLOCKED_ENDPOINTS.has(storedEndpoint);
    return {
      endpoint: DEFAULT_ENDPOINT,
      account: "oficinaautomotrizmedina@gmail.com",
      ...stored,
      enabled: true,
      endpoint: validEndpoint ? storedEndpoint : DEFAULT_ENDPOINT,
      account: stored.account || "oficinaautomotrizmedina@gmail.com"
    };
  }

  function saveConfig(next) {
    const cfg = { ...config(), ...(next || {}), enabled: true };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  }

  function isReady() {
    const cfg = config();
    return !!(cfg.enabled && cfg.endpoint);
  }

  function cleanServerError(text, status = 0) {
    const raw = String(text || "").trim();
    if (/<!doctype|<html|<body|docs-|drive-|google/i.test(raw)) {
      return "El servidor devolvio una pagina de Google en vez de datos JSON. Revise que la URL publicada de Apps Script termine en /exec y que el despliegue este habilitado como aplicacion web para cualquier usuario.";
    }
    if (!raw) return status ? `Respuesta vacia del servidor. Codigo ${status}.` : "Respuesta vacia del servidor.";
    return raw.slice(0, 360);
  }

  function snapshot() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      localWriteAt: localStorage.getItem(LOCAL_WRITE_KEY) || "",
      account: config().account,
      appState: readJson(ADMIN_KEY, null) || readJson(LEGACY_ADMIN_KEY, null),
      employeeState: readJson(EMPLOYEE_KEY, null),
      archives: {
        master: readJson(MASTER_ARCHIVE_KEY, {}),
        quick: readJson(QUICK_ARCHIVE_KEY, {})
      }
    };
  }

  function compressImageDataUrl(src, max = IMAGE_MAX, quality = IMAGE_QUALITY) {
    return new Promise((resolve) => {
      if (!src || !String(src).startsWith("data:image/") || String(src).length <= IMAGE_LIMIT) {
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
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
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

  async function compactPhoto(photo) {
    if (photo && photo.dataUrl) photo.dataUrl = await compressImageDataUrl(photo.dataUrl);
  }

  async function compactImageRows(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (let i = 0; i < row.length; i += 1) row[i] = await compressImageDataUrl(row[i]);
    }
  }

  async function compactReception(rec) {
    if (!rec) return;
    for (const photo of (Array.isArray(rec.photos) ? rec.photos : [])) await compactPhoto(photo);
    for (const damage of (Array.isArray(rec.damages) ? rec.damages : [])) {
      for (const photo of (Array.isArray(damage.photos) ? damage.photos : [])) await compactPhoto(photo);
    }
    await compactImageRows(rec.trackingImages);
    await compactImageRows(rec.pendingTracking?.images);
    await compactImageRows(rec.adminTrackingDraft?.images);
  }

  async function compactVehicle(vehicle) {
    if (!vehicle) return;
    for (const photo of (Array.isArray(vehicle.photos) ? vehicle.photos : [])) await compactPhoto(photo);
    for (const damage of (Array.isArray(vehicle.damages) ? vehicle.damages : [])) {
      for (const photo of (Array.isArray(damage.photos) ? damage.photos : [])) await compactPhoto(photo);
    }
    await compactImageRows(vehicle.detalleImages);
    await compactImageRows(vehicle.pendingTracking?.images);
  }

  async function compactSnapshotImages(snap) {
    if (!snap || typeof snap !== "object") return snap;
    for (const rec of (Array.isArray(snap.appState?.receptions) ? snap.appState.receptions : [])) await compactReception(rec);
    for (const vehicle of (Array.isArray(snap.employeeState?.vehicles) ? snap.employeeState.vehicles : [])) await compactVehicle(vehicle);
    return snap;
  }

  async function post(action, payload = {}) {
    const cfg = config();
    if (!cfg.endpoint) throw new Error("No se ha configurado la URL de Apps Script.");
    const controller = new AbortController();
    const timeoutMs = action === "saveSnapshot" ? 90000 : 22000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let text;
    try {
      response = await fetch(cfg.endpoint, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8", "Accept": "application/json" },
        body: JSON.stringify({ action, account: cfg.account, payload }),
        signal: controller.signal
      });
      text = await response.text();
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("El servidor tardo demasiado en responder. Revise conexion e intente guardar nuevamente.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(cleanServerError(text, response.status));
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(cleanServerError(text, response.status));
    }
    if (!data.ok) throw new Error(data.error || "El servidor rechazó la operación.");
    return data;
  }

  async function saveNow(reason = "manual", fixedSnapshot = null) {
    if (!isReady()) throw new Error("La nube no está configurada.");
    clearTimeout(timer);
    timer = null;

    const runSave = async () => {
      saving = true;
      try {
        const result = await post("saveSnapshot", { reason, snapshot: await compactSnapshotImages(fixedSnapshot || snapshot()) });
        try { localStorage.removeItem(LOCAL_WRITE_KEY); } catch {}
        window.dispatchEvent(new CustomEvent("am-cloud-sync", { detail: { ok: true, result } }));
        return result;
      } catch (error) {
        window.dispatchEvent(new CustomEvent("am-cloud-sync", { detail: { ok: false, error: error.message } }));
        throw error;
      } finally {
        saving = false;
      }
    };

    const nextSave = saveTail.then(runSave, runSave);
    activeSavePromise = nextSave;
    saveTail = nextSave.catch(() => {});

    try {
      return await nextSave;
    } finally {
      if (activeSavePromise === nextSave) activeSavePromise = null;
    }
  }

  function queueSave(reason = "auto") {
    if (!isReady()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveNow(reason).catch((error) => console.warn("No se pudo sincronizar con la nube", error));
    }, 900);
  }

  async function fetchLatest() {
    const data = await post("loadLatest", {});
    return compactSnapshotImages(data.snapshot || null);
  }

  function receptionKey(rec) {
    return String((rec && (rec.number || rec.id || rec.rec)) || "").trim();
  }

  function makeToken(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }

  function defaultAppState() {
    return {
      config: { schemaVersion: 3, businessName: "Automotriz Medina", adminPin: "2468", employeeToken: "empleado-am-local", nextReceptionNumber: 1 },
      employees: [
        { id: "edwin", name: "Edwin", token: "empleado-edwin" },
        { id: "rafael", name: "Rafael", token: "empleado-rafael" },
        { id: "cristian", name: "Cristian", token: "empleado-cristian" }
      ],
      session: { admin: true, employee: true },
      selectedId: null,
      sequence: { reception: 0, damage: 0, update: 0, inventory: 0 },
      receptions: [],
      deletedReceptionNumbers: [],
      employeeNotifications: []
    };
  }

  function syncEmployeeVehiclesToAppState(appState, employeeState) {
    if (!appState || !employeeState || !Array.isArray(employeeState.vehicles)) return appState;
    const merged = {
      ...appState,
      receptions: Array.isArray(appState.receptions) ? appState.receptions.slice() : [],
      deletedReceptionNumbers: Array.isArray(appState.deletedReceptionNumbers) ? appState.deletedReceptionNumbers.slice() : []
    };
    const deleted = new Set(merged.deletedReceptionNumbers.filter(Boolean));
    const employeeNumbers = employeeState.vehicles.map((vehicle) => String(vehicle?.rec || "").trim()).filter(Boolean);
    const activeAdminCount = merged.receptions.filter((rec) => !rec?.deletedAt && !rec?.archivedAt).length;
    const shouldReviveEmployeeVehicles = employeeNumbers.length > 0 && activeAdminCount === 0;
    const staleDeleteListBlocksAll = shouldReviveEmployeeVehicles && employeeNumbers.every((number) => deleted.has(number));
    if (staleDeleteListBlocksAll) {
      merged.deletedReceptionNumbers = merged.deletedReceptionNumbers.filter((number) => !employeeNumbers.includes(number));
      deleted.clear();
    }

    employeeState.vehicles.forEach((vehicle) => {
      const number = String(vehicle?.rec || "").trim();
      if (!number || deleted.has(number)) return;
      let rec = merged.receptions.find((item) => item.number === number || item.id === `emp-${vehicle.id}`);
      if (!rec) {
        rec = {
          id: `emp-${vehicle.id || makeToken("veh")}`,
          number,
          clientToken: makeToken("cli"),
          trackingToken: makeToken("trk"),
          client: { name: vehicle.clientName || "", phone: vehicle.clientPhone || "" },
          sentToClient: !!(vehicle.autorizado || vehicle.signed),
          signed: !!(vehicle.autorizado || vehicle.signed),
          signatureName: vehicle.signatureName || vehicle.clientName || "",
          signatureDate: vehicle.signatureDate || vehicle.termsAcceptedAt || "",
          signatureDataUrl: vehicle.signatureDataUrl || "",
          manualAuthorization: !!vehicle.manualAuthorization,
          quickAuthorization: !!vehicle.quickAuthorization,
          termsAcceptedAt: vehicle.termsAcceptedAt || vehicle.signatureDate || "",
          authorizationEvidence: vehicle.authorizationEvidence || null,
          inventory: [],
          damages: [],
          photos: [],
          tracking: {},
          internalWork: { internalNote: "", lockedReception: true },
          updates: []
        };
        merged.receptions.unshift(rec);
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
      rec.employeeId = vehicle.eid || rec.employeeId || "";
      rec.employeeName = vehicle.en || rec.employeeName || "";
      rec.status = vehicle.estado || rec.status || "EN REVISIÓN";
      rec.serviceReason = vehicle.motivo || rec.serviceReason || "";
      rec.observations = vehicle.observaciones || rec.observations || "";
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
      rec.vehicle = {
        ...(rec.vehicle || {}),
        marca: vehicle.marca || "",
        modelo: vehicle.modelo || "",
        anio: vehicle.anio || "",
        color: vehicle.color || "",
        placa: vehicle.placa || "",
        vin: vehicle.vin || "",
        kilometraje: vehicle.odometro || ""
      };
      if (Array.isArray(vehicle.photos)) {
        rec.photos = vehicle.photos.map((photo, index) => ({
          label: photo.label || `Foto ${index + 1}`,
          dataUrl: photo.dataUrl || "",
          note: photo.note || "",
          color: photo.color || (index % 2 === 0 ? "#206f78" : "#b52931")
        }));
      }
      if (Array.isArray(vehicle.inventory)) {
        rec.inventory = vehicle.inventory.map((item, index) => ({
          id: item.id || `inv-${rec.id}-${index}`,
          name: item.name || `Inventario ${index + 1}`,
          present: item.present !== false,
          note: item.note || ""
        }));
      }
      if (Array.isArray(vehicle.damages)) {
        rec.damages = vehicle.damages.map((damage, index) => ({
          id: damage.id || `dam-${rec.id}-${index}`,
          area: damage.area || damage["área"] || "Daño",
          detail: damage.detail || "",
          photos: Array.isArray(damage.photos) ? damage.photos : []
        }));
      }
      if (vehicle.pendingTracking) {
        rec.pendingTracking = {
          ...vehicle.pendingTracking,
          employeeId: vehicle.eid || rec.employeeId,
          employeeName: vehicle.en || rec.employeeName
        };
      }
      rec.employeeDeadline = vehicle.deadline || rec.employeeDeadline || "";
      rec.employeeDeadlineSetAt = vehicle.deadlineSetAt || rec.employeeDeadlineSetAt || "";
      rec.employeeDeadlineTokensAvailable = Number(vehicle.deadlineTokensAvailable ?? rec.employeeDeadlineTokensAvailable ?? 3);
      rec.employeeDeadlineTokensUsed = Number(vehicle.deadlineTokensUsed ?? rec.employeeDeadlineTokensUsed ?? 0);
      rec.employeeDeadlineUnlockRequested = !!(vehicle.deadlineUnlockRequested || rec.employeeDeadlineUnlockRequested);
      rec.progress = Number(rec.progress || 0);
      rec.progressLabel = rec.progressLabel || rec.tracking?.state || rec.status || "EN REVISIÓN";
      rec.tracking = {
        ...(rec.tracking || {}),
        receptionDate: [vehicle.fecha, vehicle.hora].filter(Boolean).join(", ") || rec.tracking?.receptionDate || "",
        odometer: `${vehicle.odometro || rec.vehicle.kilometraje || "N/D"} ${vehicle.unidad === "km" ? "KM" : "MILLAS"}`,
        plate: vehicle.placa || rec.tracking?.plate || "N/D",
        vehicleTitle: [vehicle.marca, vehicle.modelo, vehicle.anio].filter(Boolean).join(" ").trim().toUpperCase(),
        state: rec.tracking?.state || vehicle.estado || "EN REVISIÓN",
        processDetails: rec.tracking?.processDetails || ""
      };
      rec.internalWork = {
        ...(rec.internalWork || {}),
        internalNote: Array.isArray(vehicle.bitacora) ? vehicle.bitacora.join("\n") : (vehicle.nota || rec.internalWork?.internalNote || ""),
        lockedReception: true
      };
    });

    return merged;
  }

  function mergeProtectedLocalAppState(remoteAppState, remoteSnapshot = null) {
    try { localStorage.removeItem(LOCAL_WRITE_KEY); } catch {}
    return remoteAppState;
    const localAppState = readJson(ADMIN_KEY, null) || readJson(LEGACY_ADMIN_KEY, null);
    if (!localAppState || !remoteAppState) return remoteAppState;
    const localWriteAt = localStorage.getItem(LOCAL_WRITE_KEY);
    if (!localWriteAt) return remoteAppState;
    const remoteExportedAt = remoteSnapshot && remoteSnapshot.exportedAt;
    if (remoteExportedAt && Date.parse(localWriteAt) <= Date.parse(remoteExportedAt)) {
      try { localStorage.removeItem(LOCAL_WRITE_KEY); } catch {}
      return remoteAppState;
    }
    const remoteActiveCount = (Array.isArray(remoteAppState.receptions) ? remoteAppState.receptions : [])
      .filter((rec) => rec && !rec.deletedAt && !rec.archivedAt).length;
    const localActiveCount = (Array.isArray(localAppState.receptions) ? localAppState.receptions : [])
      .filter((rec) => rec && !rec.deletedAt && !rec.archivedAt).length;
    if (remoteActiveCount > 0 && localActiveCount === 0) {
      try { localStorage.removeItem(LOCAL_WRITE_KEY); } catch {}
      return remoteAppState;
    }

    const merged = { ...remoteAppState };
    const localDeleted = Array.isArray(localAppState.deletedReceptionNumbers) ? localAppState.deletedReceptionNumbers : [];
    const remoteDeleted = Array.isArray(remoteAppState.deletedReceptionNumbers) ? remoteAppState.deletedReceptionNumbers : [];
    const employeeNumbers = new Set(
      (((remoteSnapshot || {}).employeeState || {}).vehicles || [])
        .map((vehicle) => String(vehicle && vehicle.rec || "").trim())
        .filter(Boolean)
    );
    merged.deletedReceptionNumbers = Array.from(new Set([...remoteDeleted, ...localDeleted].filter(Boolean)))
      .filter((number) => !employeeNumbers.has(number));

    const remoteReceptions = Array.isArray(remoteAppState.receptions) ? remoteAppState.receptions : [];
    const localReceptions = Array.isArray(localAppState.receptions) ? localAppState.receptions : [];
    const remoteByKey = new Map(remoteReceptions.map((rec, index) => [receptionKey(rec) || `remote-${index}`, { rec, index }]));

    localReceptions.forEach((localRec, index) => {
      const key = receptionKey(localRec) || `local-${index}`;
      const protectedLocal = localRec && (localRec.deletedAt || localRec.archivedAt || localRec.deliveredAt);
      if (!protectedLocal) return;
      const found = remoteByKey.get(key);
      if (employeeNumbers.has(key)) return;
      if (found) {
        remoteReceptions[found.index] = {
          ...found.rec,
          archivedAt: localRec.archivedAt || found.rec.archivedAt,
          archivedBy: localRec.archivedBy || found.rec.archivedBy,
          deletedAt: localRec.deletedAt || found.rec.deletedAt,
          deletedBy: localRec.deletedBy || found.rec.deletedBy,
          deliveredAt: localRec.deliveredAt || found.rec.deliveredAt,
          deliveredBy: localRec.deliveredBy || found.rec.deliveredBy
        };
      } else {
        remoteReceptions.push(localRec);
      }
    });
    merged.receptions = remoteReceptions;
    return merged;
  }

  function processRowsFromReception(rec) {
    const draft = rec && rec.adminTrackingDraft && typeof rec.adminTrackingDraft === "object" ? rec.adminTrackingDraft : null;
    if (Array.isArray(draft?.rows) && draft.rows.length) {
      return draft.rows
        .map((row) => {
          if (typeof row === "string") return row.trim();
          const text = String(row?.text || "").trim();
          if (!text) return "";
          return `[${row.status === "done" ? "done" : "pending"}] ${text}`;
        })
        .filter(Boolean);
    }
    const pending = rec?.pendingTracking && rec.pendingTracking.status === "pending" ? rec.pendingTracking : null;
    const details = pending?.processDetails || rec?.tracking?.processDetails || "";
    return String(details).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }

  function trackingImagesFromReception(rec) {
    const draft = rec && rec.adminTrackingDraft && typeof rec.adminTrackingDraft === "object" ? rec.adminTrackingDraft : null;
    if (Array.isArray(draft?.images)) return draft.images;
    const pending = rec?.pendingTracking && rec.pendingTracking.status === "pending" ? rec.pendingTracking : null;
    if (Array.isArray(pending?.images)) return pending.images;
    return Array.isArray(rec?.trackingImages) ? rec.trackingImages : [];
  }

  function dataPhotoCount(photos) {
    return (Array.isArray(photos) ? photos : []).filter((photo) => String(photo?.dataUrl || "").trim()).length;
  }

  function employeeVehicleFromReceptionSnapshot(rec) {
    const rows = processRowsFromReception(rec);
    const internalNote = rec?.internalWork?.internalNote || "";
    const internalRows = String(internalNote).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return {
      id: String(rec?.id || "").replace(/^emp-/, "") || makeToken("veh"),
      rec: rec?.number || "",
      express: !!rec?.express,
      tipoServicio: rec?.serviceType || "",
      eid: rec?.employeeId || "",
      en: rec?.employeeName || "",
      fecha: String(rec?.tracking?.receptionDate || "").split(",")[0] || "",
      hora: "",
      marca: rec?.vehicle?.marca || "",
      modelo: rec?.vehicle?.modelo || "",
      anio: rec?.vehicle?.anio || "",
      color: rec?.vehicle?.color || "",
      vin: rec?.vehicle?.vin || "",
      placa: rec?.vehicle?.placa || "",
      odometro: rec?.vehicle?.kilometraje || "",
      unidad: /km/i.test(rec?.tracking?.odometer || "") ? "km" : "mi",
      estado: rec?.adminTrackingDraft?.profile?.state || rec?.pendingTracking?.state || rec?.status || "EN REVISIÓN",
      avance: Number(rec?.adminTrackingDraft?.progress ?? rec?.pendingTracking?.progress ?? rec?.progress ?? 0),
      autorizado: !!rec?.signed,
      signed: !!rec?.signed,
      manualAuthorization: !!rec?.manualAuthorization,
      quickAuthorization: !!rec?.quickAuthorization,
      termsAcceptedAt: rec?.termsAcceptedAt || rec?.signatureDate || "",
      clientName: rec?.client?.name || "",
      clientPhone: rec?.client?.phone || "",
      signatureName: rec?.signatureName || rec?.client?.name || "",
      signatureDate: rec?.signatureDate || "",
      signatureDataUrl: rec?.signatureDataUrl || "",
      authorizationEvidence: rec?.authorizationEvidence ? { ...rec.authorizationEvidence } : null,
      motivo: rec?.serviceReason || rec?.observations || "",
      observaciones: rec?.observations || "",
      detalle: rows.join("\n"),
      detalles: rows,
      detalleImages: trackingImagesFromReception(rec),
      pendingTracking: rec?.pendingTracking?.status === "pending" ? { ...rec.pendingTracking } : null,
      nota: internalRows.join("\n"),
      bitacora: internalRows,
      deadline: rec?.employeeDeadline || "",
      deadlineSetAt: rec?.employeeDeadlineSetAt || "",
      deadlineTokensAvailable: Number(rec?.employeeDeadlineTokensAvailable ?? 3),
      deadlineTokensUsed: Number(rec?.employeeDeadlineTokensUsed || 0),
      deadlineUnlockRequested: !!rec?.employeeDeadlineUnlockRequested,
      notifications: Array.isArray(rec?.employeeNotifications) ? rec.employeeNotifications.map((item) => ({ ...item })) : [],
      photos: Array.isArray(rec?.photos) ? rec.photos.map((photo) => ({ ...photo })) : [],
      inventory: Array.isArray(rec?.inventory) ? rec.inventory.map((item) => ({ ...item })) : [],
      damages: Array.isArray(rec?.damages) ? rec.damages.map((damage) => ({ ...damage, photos: Array.isArray(damage.photos) ? damage.photos : [] })) : []
    };
  }

  function mergeEmployeeVehicle(existing = {}, incoming = {}) {
    const merged = { ...existing, ...incoming };
    ["photos", "inventory", "damages", "detalles", "detalleImages", "bitacora", "notifications"].forEach((key) => {
      const incomingArray = Array.isArray(incoming[key]) ? incoming[key] : null;
      const existingArray = Array.isArray(existing[key]) ? existing[key] : [];
      if (key === "photos" && existingArray.length && incomingArray) {
        merged[key] = dataPhotoCount(incomingArray) >= dataPhotoCount(existingArray) ? incomingArray : existingArray;
      } else if (incomingArray && incomingArray.length) {
        merged[key] = incomingArray;
      } else if (existingArray.length) {
        merged[key] = existingArray;
      } else if (incomingArray) {
        merged[key] = incomingArray;
      }
    });
    if (!String(incoming.detalle || "").trim() && String(existing.detalle || "").trim()) merged.detalle = existing.detalle;
    if (!String(incoming.nota || "").trim() && String(existing.nota || "").trim()) merged.nota = existing.nota;
    if (!incoming.pendingTracking && existing.pendingTracking) merged.pendingTracking = existing.pendingTracking;
    return merged;
  }

  function syncAppReceptionsToEmployeeState(employeeState, appState) {
    if (!appState || !Array.isArray(appState.receptions)) return employeeState;
    const merged = employeeState && typeof employeeState === "object" ? { ...employeeState } : { selected: "", seq: 0, vehicles: [] };
    merged.vehicles = Array.isArray(merged.vehicles) ? merged.vehicles.slice() : [];
    appState.receptions.forEach((rec) => {
      if (!rec?.number || rec.deletedAt || rec.archivedAt || rec.deliveredAt) return;
      const vehicle = employeeVehicleFromReceptionSnapshot(rec);
      const index = merged.vehicles.findIndex((item) => item.rec === vehicle.rec || item.id === vehicle.id);
      if (index >= 0) merged.vehicles[index] = mergeEmployeeVehicle(merged.vehicles[index], vehicle);
      else merged.vehicles.unshift(vehicle);
    });
    return merged;
  }

  function applySnapshot(snap) {
    if (!snap) return null;
    if (!snap.appState && snap.employeeState) snap.appState = defaultAppState();
    if (snap.appState) {
      snap.appState = { ...defaultAppState(), ...snap.appState, config: { ...defaultAppState().config, ...(snap.appState.config || {}), schemaVersion: 3 } };
      snap.appState = syncEmployeeVehiclesToAppState(snap.appState, snap.employeeState);
      snap.appState = mergeProtectedLocalAppState(snap.appState, snap);
      localStorage.setItem(ADMIN_KEY, JSON.stringify(snap.appState));
      if (LEGACY_ADMIN_KEY !== ADMIN_KEY) {
        try { localStorage.removeItem(LEGACY_ADMIN_KEY); } catch {}
      }
    }
    if (snap.appState || snap.employeeState) {
      snap.employeeState = syncAppReceptionsToEmployeeState(snap.employeeState, snap.appState);
      localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(snap.employeeState));
    }
    if (snap.archives?.master) localStorage.setItem(MASTER_ARCHIVE_KEY, JSON.stringify(snap.archives.master));
    if (snap.archives?.quick) localStorage.setItem(QUICK_ARCHIVE_KEY, JSON.stringify(snap.archives.quick));
    window.dispatchEvent(new CustomEvent("am-cloud-loaded", { detail: { ok: true, snapshot: snap } }));
    return snap;
  }

  async function loadLatest() {
    return applySnapshot(await compactSnapshotImages(await fetchLatest()));
  }

  function ready() {
    if (!isReady()) return Promise.resolve(null);
    if (!initialLoadPromise) {
      initialLoadPromise = loadLatest().catch((error) => {
        window.dispatchEvent(new CustomEvent("am-cloud-loaded", { detail: { ok: false, error: error.message } }));
        console.warn("No se pudo cargar el respaldo inicial de nube", error);
        initialLoadPromise = null;
        return null;
      });
    }
    return initialLoadPromise;
  }

  async function ping() {
    return post("ping", { snapshot: snapshot() });
  }

  return { config, saveConfig, isReady, snapshot, saveNow, queueSave, fetchLatest, applySnapshot, loadLatest, ready, ping };
})();
