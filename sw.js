var AM_SW_VERSION = 'am-pwa-preserve-all-records-20261001-1';
var AM_OUTBOX_DB = 'am_cloud_outbox_v1';
var AM_OUTBOX_STORE = 'jobs';
var AM_OUTBOX_KEY = 'latest';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'AM_SW_VERSION') {
    event.source.postMessage({ type: 'AM_SW_VERSION', version: AM_SW_VERSION });
  }
});

function openOutboxDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(AM_OUTBOX_DB, 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(AM_OUTBOX_STORE)) db.createObjectStore(AM_OUTBOX_STORE, { keyPath: 'key' });
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

async function outboxRequest(mode, operation) {
  var db = await openOutboxDb();
  try {
    return await new Promise(function (resolve, reject) {
      var tx = db.transaction(AM_OUTBOX_STORE, mode);
      var request = operation(tx.objectStore(AM_OUTBOX_STORE));
      tx.oncomplete = function () { resolve(request && request.result); };
      tx.onerror = function () { reject(tx.error || (request && request.error)); };
      tx.onabort = function () { reject(tx.error || new Error('Outbox transaction aborted')); };
    });
  } finally {
    db.close();
  }
}

function readOutbox() {
  return outboxRequest('readonly', function (store) { return store.get(AM_OUTBOX_KEY); });
}

function writeOutbox(job) {
  return outboxRequest('readwrite', function (store) { return store.put(job); });
}

function deleteOutbox() {
  return outboxRequest('readwrite', function (store) { return store.delete(AM_OUTBOX_KEY); });
}

async function notifyOutboxClients(status, job) {
  var list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(function (client) {
    client.postMessage({ type: 'AM_CLOUD_OUTBOX_STATUS', status: status, job: { operationId: job.operationId, reason: job.reason, context: job.context || {}, createdAt: job.createdAt } });
  });
}

async function postCloud(job, action, payload) {
  var response = await fetch(job.endpoint, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Accept': 'application/json' },
    body: JSON.stringify({ action: action, account: job.account, payload: payload || {} })
  });
  var text = await response.text();
  if (!response.ok) throw new Error('Cloud HTTP ' + response.status);
  var data = JSON.parse(text);
  if (!data.ok) throw new Error(data.error || 'Cloud rejected operation');
  return data;
}

function recordKeys(item) {
  return [item && item.id, item && item.number, item && item.rec, item && item.vehicleId]
    .map(function (value) { return String(value || '').trim(); })
    .filter(Boolean);
}

function recordsMatch(left, right) {
  var leftKeys = recordKeys(left);
  return recordKeys(right).some(function (key) { return leftKeys.indexOf(key) >= 0; });
}

function mediaCount(list) {
  return (Array.isArray(list) ? list : []).filter(function (item) {
    return String(item && (item.dataUrl || item.url) || '').trim();
  }).length;
}

function preserveRicherMedia(localItem, remoteItem) {
  ['photos', 'invoices'].forEach(function (field) {
    var local = Array.isArray(localItem[field]) ? localItem[field] : [];
    var remote = Array.isArray(remoteItem[field]) ? remoteItem[field] : [];
    if (mediaCount(remote) > mediaCount(local)) localItem[field] = remote;
  });
}

function preserveRemoteSnapshot(outgoing, remote) {
  if (!outgoing || !remote) return outgoing;
  outgoing.appState = outgoing.appState || { receptions: [], deletedReceptionNumbers: [] };
  outgoing.employeeState = outgoing.employeeState || { selected: '', seq: 0, vehicles: [] };
  outgoing.appState.receptions = Array.isArray(outgoing.appState.receptions) ? outgoing.appState.receptions : [];
  outgoing.employeeState.vehicles = Array.isArray(outgoing.employeeState.vehicles) ? outgoing.employeeState.vehicles : [];
  var deleted = (Array.isArray(outgoing.appState.deletedReceptionNumbers) ? outgoing.appState.deletedReceptionNumbers : [])
    .map(function (value) { return String(value || '').trim(); });
  var explicitlyDeleted = function (item) {
    return recordKeys(item).some(function (key) { return deleted.indexOf(key) >= 0; });
  };

  (Array.isArray(remote.appState && remote.appState.receptions) ? remote.appState.receptions : []).forEach(function (remoteRec) {
    if (explicitlyDeleted(remoteRec)) return;
    var localRec = outgoing.appState.receptions.find(function (item) { return recordsMatch(item, remoteRec); });
    if (localRec) preserveRicherMedia(localRec, remoteRec);
    else outgoing.appState.receptions.push(remoteRec);
  });
  (Array.isArray(remote.employeeState && remote.employeeState.vehicles) ? remote.employeeState.vehicles : []).forEach(function (remoteVehicle) {
    if (explicitlyDeleted(remoteVehicle)) return;
    var localVehicle = outgoing.employeeState.vehicles.find(function (item) { return recordsMatch(item, remoteVehicle); });
    if (localVehicle) preserveRicherMedia(localVehicle, remoteVehicle);
    else outgoing.employeeState.vehicles.push(remoteVehicle);
  });
  return outgoing;
}

async function processBackgroundSync() {
  var openWindows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (openWindows.some(function (client) { return client.visibilityState === 'visible'; })) return;
  var job = await readOutbox();
  if (!job || job.status === 'error') return;
  if (Date.now() >= Date.parse(job.deadlineAt || '')) {
    job.status = 'error';
    job.errorAt = new Date().toISOString();
    await writeOutbox(job);
    await notifyOutboxClients('error', job);
    return;
  }
  if (Number(job.attempts || 0) < 3) {
    job.attempts = Number(job.attempts || 0) + 1;
    job.lastAttemptAt = new Date().toISOString();
    await writeOutbox(job);
    await notifyOutboxClients('pending', job);
    try {
      var currentCloud = await postCloud(job, 'loadLatest', {});
      var protectedSnapshot = preserveRemoteSnapshot(job.snapshot, currentCloud && currentCloud.snapshot);
      await postCloud(job, 'saveSnapshot', { reason: 'background-' + job.reason, snapshot: protectedSnapshot });
    } catch (_) {}
  }
  var latest = await postCloud(job, 'loadLatest', {});
  if (latest && latest.snapshot && latest.snapshot.clientSync && latest.snapshot.clientSync.operationId === job.operationId) {
    var current = await readOutbox();
    if (current && current.operationId === job.operationId) {
      current.status = 'confirmed';
      current.confirmedAt = new Date().toISOString();
      await writeOutbox(current);
    }
    await notifyOutboxClients('confirmed', job);
    return;
  }
  throw new Error('Cloud backup not confirmed yet');
}

self.addEventListener('sync', function (event) {
  if (event.tag === 'am-cloud-outbox') event.waitUntil(processBackgroundSync());
});
