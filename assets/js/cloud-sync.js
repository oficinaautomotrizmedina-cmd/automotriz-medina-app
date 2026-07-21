globalThis.AM_CLOUD_SYNC = (() => {
  const CONFIG_KEY = "am_cloud_sync_config_v1";
  const EMPLOYEE_KEY = "am_employee_module_safe_v2";
  const ADMIN_KEY = "am_recepción_local_v1";
  const MASTER_ARCHIVE_KEY = "am_master_taller_archives_v1";
  const QUICK_ARCHIVE_KEY = "am_quick_taller_archives_v1";
  const DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwJfuzhng2vZQ338s2GbdXb8El41OhtHz81ZyXgpLhSfJ7QLIfnKT0dQODAkymCLMvs/exec";
  let timer = null;
  let saving = false;

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
    return {
      enabled: false,
      endpoint: DEFAULT_ENDPOINT,
      account: "oficinaautomotrizmedina@gmail.com",
      ...stored,
      endpoint: stored.endpoint || DEFAULT_ENDPOINT,
      account: stored.account || "oficinaautomotrizmedina@gmail.com"
    };
  }

  function saveConfig(next) {
    const cfg = { ...config(), ...(next || {}) };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  }

  function isReady() {
    const cfg = config();
    return !!(cfg.enabled && cfg.endpoint);
  }

  function snapshot() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      account: config().account,
      appState: readJson(ADMIN_KEY, null),
      employeeState: readJson(EMPLOYEE_KEY, null),
      archives: {
        master: readJson(MASTER_ARCHIVE_KEY, {}),
        quick: readJson(QUICK_ARCHIVE_KEY, {})
      }
    };
  }

  async function post(action, payload = {}) {
    const cfg = config();
    if (!cfg.endpoint) throw new Error("No se ha configurado la URL de Apps Script.");
    const response = await fetch(cfg.endpoint, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, account: cfg.account, payload })
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Respuesta inválida del servidor.");
    }
    if (!data.ok) throw new Error(data.error || "El servidor rechazó la operación.");
    return data;
  }

  async function saveNow(reason = "manual") {
    if (!isReady() || saving) return { skipped: true };
    saving = true;
    try {
      const result = await post("saveSnapshot", { reason, snapshot: snapshot() });
      window.dispatchEvent(new CustomEvent("am-cloud-sync", { detail: { ok: true, result } }));
      return result;
    } catch (error) {
      window.dispatchEvent(new CustomEvent("am-cloud-sync", { detail: { ok: false, error: error.message } }));
      throw error;
    } finally {
      saving = false;
    }
  }

  function queueSave(reason = "auto") {
    if (!isReady()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveNow(reason).catch((error) => console.warn("No se pudo sincronizar con la nube", error));
    }, 900);
  }

  async function loadLatest() {
    const data = await post("loadLatest", {});
    const snap = data.snapshot;
    if (!snap) return null;
    if (snap.appState) localStorage.setItem(ADMIN_KEY, JSON.stringify(snap.appState));
    if (snap.employeeState) localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(snap.employeeState));
    if (snap.archives?.master) localStorage.setItem(MASTER_ARCHIVE_KEY, JSON.stringify(snap.archives.master));
    if (snap.archives?.quick) localStorage.setItem(QUICK_ARCHIVE_KEY, JSON.stringify(snap.archives.quick));
    return snap;
  }

  async function ping() {
    return post("ping", { snapshot: snapshot() });
  }

  return { config, saveConfig, isReady, snapshot, saveNow, queueSave, loadLatest, ping };
})();
