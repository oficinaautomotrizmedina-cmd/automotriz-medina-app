const AM_CONFIG = {
  folderName: 'Automotriz Medina - Sistema',
  spreadsheetName: 'Automotriz Medina - Base de datos',
  latestFileName: 'ultimo-respaldo-am.json',
  indexFileName: 'indice-expedientes.json',
  activeFolderName: 'activos',
  archivedFolderName: 'archivados',
  backupFolderName: 'respaldos'
};

function setup() {
  const folder = getOrCreateFolder_(AM_CONFIG.folderName);
  const spreadsheet = getOrCreateSpreadsheet_(folder, AM_CONFIG.spreadsheetName);
  ensureSheets_(spreadsheet);
  return {
    ok: true,
    folderId: folder.getId(),
    spreadsheetId: spreadsheet.getId()
  };
}

function doGet() {
  const env = setup();
  return json_({
    ok: true,
    message: 'Automotriz Medina backend activo',
    folderId: env.folderId,
    spreadsheetId: env.spreadsheetId
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || '';

    if (action === 'ping') {
      const env = setup();
      return json_({
        ok: true,
        folderId: env.folderId,
        spreadsheetId: env.spreadsheetId,
        serverTime: new Date().toISOString()
      });
    }

    if (action === 'saveSnapshot') {
      return json_(saveSnapshot_(body.payload || {}, body.account || ''));
    }

    if (action === 'loadLatest') {
      return json_(loadLatest_());
    }

    if (action === 'loadIndex') {
      return json_(loadIndex_());
    }

    if (action === 'loadReception') {
      return json_(loadReception_(body.payload || {}));
    }

    return json_({ ok: false, error: 'Accion no reconocida: ' + action });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function saveSnapshot_(payload, account) {
  const env = setup();
  const folder = DriveApp.getFolderById(env.folderId);
  const spreadsheet = SpreadsheetApp.openById(env.spreadsheetId);
  const snapshot = payload.snapshot || {};
  const reason = payload.reason || 'sin motivo';
  const content = JSON.stringify(snapshot);
  const latest = upsertTextFile_(folder, AM_CONFIG.latestFileName, content, 'application/json');
  const shouldArchive = /manual-admin|respaldo|backup|archive/i.test(reason);
  const archive = shouldArchive
    ? folder.createFile('respaldo-am-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '.json', content, MimeType.PLAIN_TEXT)
    : null;

  appendLog_(spreadsheet, {
    action: 'saveSnapshot',
    account: account || snapshot.account || '',
    reason: reason,
    bytes: content.length,
    latestFileId: latest.getId(),
    archiveFileId: archive ? archive.getId() : ''
  });
  writeSummary_(spreadsheet, snapshot);
  const structured = writeStructuredSnapshot_(folder, snapshot);

  return {
    ok: true,
    folderId: env.folderId,
    spreadsheetId: env.spreadsheetId,
    latestFileId: latest.getId(),
    archiveFileId: archive ? archive.getId() : '',
    bytes: content.length,
    structured: structured
  };
}

function loadLatest_() {
  const env = setup();
  const folder = DriveApp.getFolderById(env.folderId);
  const files = folder.getFilesByName(AM_CONFIG.latestFileName);
  if (!files.hasNext()) {
    return {
      ok: true,
      folderId: env.folderId,
      spreadsheetId: env.spreadsheetId,
      snapshot: null
    };
  }
  const file = files.next();
  return {
    ok: true,
    folderId: env.folderId,
    spreadsheetId: env.spreadsheetId,
    latestFileId: file.getId(),
    snapshot: JSON.parse(file.getBlob().getDataAsString('UTF-8'))
  };
}

function loadIndex_() {
  const env = setup();
  const folder = DriveApp.getFolderById(env.folderId);
  const files = folder.getFilesByName(AM_CONFIG.indexFileName);
  if (!files.hasNext()) {
    return {
      ok: true,
      folderId: env.folderId,
      spreadsheetId: env.spreadsheetId,
      index: { version: 1, updatedAt: '', receptions: [] }
    };
  }
  const file = files.next();
  return {
    ok: true,
    folderId: env.folderId,
    spreadsheetId: env.spreadsheetId,
    indexFileId: file.getId(),
    index: JSON.parse(file.getBlob().getDataAsString('UTF-8'))
  };
}

function loadReception_(payload) {
  const env = setup();
  const root = DriveApp.getFolderById(env.folderId);
  const number = String(payload.number || payload.reception || '').trim();
  if (!number) return { ok: false, error: 'Recepcion requerida.' };
  const folders = findReceptionFolders_(root, number);
  if (!folders.length) return { ok: false, error: 'No se encontro la carpeta del expediente ' + number + '.' };
  const data = readJsonFileFromFolder_(folders[0], 'expediente.json') || {};
  return {
    ok: true,
    folderId: folders[0].getId(),
    number: number,
    reception: data
  };
}

function writeStructuredSnapshot_(root, snapshot) {
  const appState = snapshot && snapshot.appState || {};
  const receptions = Array.isArray(appState.receptions) ? appState.receptions : [];
  const activos = getOrCreateChildFolder_(root, AM_CONFIG.activeFolderName);
  const archivados = getOrCreateChildFolder_(root, AM_CONFIG.archivedFolderName);
  const respaldos = getOrCreateChildFolder_(root, AM_CONFIG.backupFolderName);
  const index = {
    version: 1,
    updatedAt: snapshot.exportedAt || new Date().toISOString(),
    total: receptions.length,
    receptions: []
  };

  receptions.forEach(function(rec) {
    if (!rec || !rec.number) return;
    const archived = !!(rec.archivedAt || rec.deliveredAt);
    const deleted = !!rec.deletedAt;
    const parent = archived ? getOrCreateClientArchiveFolder_(archivados, rec) : activos;
    const folderName = receptionFolderName_(rec, archived);
    const folder = getOrCreateChildFolder_(parent, folderName);
    const data = buildReceptionPackage_(rec, snapshot);
    upsertJsonFile_(folder, 'expediente.json', data);
    upsertJsonFile_(folder, 'archivo.json', data.archivo);
    upsertJsonFile_(folder, 'seguimiento.json', data.seguimiento);
    upsertJsonFile_(folder, 'bitacora.json', data.bitacora);
    upsertJsonFile_(folder, 'notificaciones.json', data.notificaciones);
    upsertJsonFile_(folder, 'autorizacion.json', data.autorizacion);
    upsertJsonFile_(folder, 'facturas.json', data.facturas);
    index.receptions.push(buildIndexRecord_(rec, folder, archived, deleted));
  });

  upsertJsonFile_(root, AM_CONFIG.indexFileName, index);
  upsertJsonFile_(respaldos, 'indice-expedientes-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '.json', index);
  return {
    ok: true,
    indexFileName: AM_CONFIG.indexFileName,
    activeCount: index.receptions.filter(function(item) { return !item.archived && !item.deleted; }).length,
    archivedCount: index.receptions.filter(function(item) { return item.archived; }).length,
    total: index.receptions.length
  };
}

function buildReceptionPackage_(rec, snapshot) {
  return {
    version: 1,
    exportedAt: snapshot.exportedAt || new Date().toISOString(),
    number: rec.number || '',
    id: rec.id || '',
    estado: rec.status || '',
    cliente: rec.client || {},
    vehiculo: rec.vehicle || {},
    tecnico: { id: rec.employeeId || '', nombre: rec.employeeName || '' },
    archivo: {
      number: rec.number || '',
      client: rec.client || {},
      vehicle: rec.vehicle || {},
      photos: rec.photos || [],
      inventory: rec.inventory || [],
      damages: rec.damages || [],
      observations: rec.observations || '',
      serviceReason: rec.serviceReason || ''
    },
    seguimiento: {
      status: rec.status || '',
      progress: rec.progress || 0,
      progressLabel: rec.progressLabel || '',
      tracking: rec.tracking || {},
      trackingImages: rec.trackingImages || [],
      pendingTracking: rec.pendingTracking || null,
      adminTrackingDraft: rec.adminTrackingDraft || null,
      publishedProgress: rec.publishedProgress || 0,
      publishedTracking: rec.publishedTracking || null
    },
    bitacora: rec.internalWork || {},
    notificaciones: {
      employeeNotifications: rec.employeeNotifications || [],
      updates: rec.updates || []
    },
    autorizacion: {
      sentToClient: !!rec.sentToClient,
      signed: !!rec.signed,
      manualAuthorization: !!rec.manualAuthorization,
      quickAuthorization: !!rec.quickAuthorization,
      clientToken: rec.clientToken || '',
      trackingToken: rec.trackingToken || '',
      signatureName: rec.signatureName || '',
      signatureDate: rec.signatureDate || '',
      signatureDataUrl: rec.signatureDataUrl || '',
      termsAcceptedAt: rec.termsAcceptedAt || '',
      authorizationEvidence: rec.authorizationEvidence || null
    },
    facturas: rec.invoices || rec.facturas || [],
    raw: rec
  };
}

function buildIndexRecord_(rec, folder, archived, deleted) {
  const vehicle = rec.vehicle || {};
  const client = rec.client || {};
  return {
    id: rec.id || '',
    number: rec.number || '',
    folderId: folder.getId(),
    folderName: folder.getName(),
    archived: !!archived,
    deleted: !!deleted,
    status: rec.status || '',
    employeeId: rec.employeeId || '',
    employeeName: rec.employeeName || '',
    clientName: client.name || '',
    clientPhone: client.phone || '',
    marca: vehicle.marca || '',
    modelo: vehicle.modelo || '',
    anio: vehicle.anio || '',
    placa: vehicle.placa || '',
    vin: vehicle.vin || '',
    updatedAt: rec.updatedAt || rec.modifiedAt || rec.signatureDate || ''
  };
}

function getOrCreateClientArchiveFolder_(archivedRoot, rec) {
  const clientName = rec && rec.client && rec.client.name || 'Cliente sin nombre';
  return getOrCreateChildFolder_(archivedRoot, safeName_(clientName));
}

function receptionFolderName_(rec, archived) {
  const parts = [
    rec.number || rec.id || 'SIN-RECEPCION',
    archived ? '' : rec.client && rec.client.name,
    rec.vehicle && rec.vehicle.marca,
    rec.vehicle && rec.vehicle.modelo,
    rec.vehicle && rec.vehicle.anio
  ].filter(Boolean);
  return safeName_(parts.join(' - '));
}

function findReceptionFolders_(root, number) {
  const found = [];
  [AM_CONFIG.activeFolderName, AM_CONFIG.archivedFolderName].forEach(function(name) {
    const parents = root.getFoldersByName(name);
    while (parents.hasNext()) scanFoldersForReception_(parents.next(), number, found);
  });
  return found;
}

function scanFoldersForReception_(folder, number, found) {
  if (folder.getName().indexOf(number) !== -1) found.push(folder);
  const children = folder.getFolders();
  while (children.hasNext()) scanFoldersForReception_(children.next(), number, found);
}

function readJsonFileFromFolder_(folder, name) {
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  return JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
}

function upsertJsonFile_(folder, name, value) {
  return upsertTextFile_(folder, name, JSON.stringify(value), 'application/json');
}

function getOrCreateChildFolder_(parent, name) {
  const safe = safeName_(name);
  const folders = parent.getFoldersByName(safe);
  return folders.hasNext() ? folders.next() : parent.createFolder(safe);
}

function safeName_(value) {
  return String(value || 'Sin nombre')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Sin nombre';
}

function writeSummary_(spreadsheet, snapshot) {
  const sheet = spreadsheet.getSheetByName('Recepciones');
  sheet.clearContents();
  sheet.appendRow([
    'Recepcion',
    'Cliente',
    'Telefono',
    'Tecnico',
    'Marca',
    'Modelo',
    'Anio',
    'Placa',
    'VIN',
    'Estado',
    'Autorizado',
    'Motivo',
    'Actualizado'
  ]);

  const receptions = (snapshot.appState && snapshot.appState.receptions) || [];
  receptions.forEach(function(rec) {
    sheet.appendRow([
      rec.number || '',
      rec.client && rec.client.name || '',
      rec.client && rec.client.phone || '',
      rec.employeeName || '',
      rec.vehicle && rec.vehicle.marca || '',
      rec.vehicle && rec.vehicle.modelo || '',
      rec.vehicle && rec.vehicle.anio || '',
      rec.vehicle && rec.vehicle.placa || '',
      rec.vehicle && rec.vehicle.vin || '',
      rec.status || '',
      rec.signed ? 'SI' : 'NO',
      rec.serviceReason || rec.observations || '',
      snapshot.exportedAt || ''
    ]);
  });
}

function appendLog_(spreadsheet, info) {
  const sheet = spreadsheet.getSheetByName('Bitacora');
  sheet.appendRow([
    new Date(),
    info.action || '',
    info.account || '',
    info.reason || '',
    info.bytes || 0,
    info.latestFileId || '',
    info.archiveFileId || ''
  ]);
}

function ensureSheets_(spreadsheet) {
  ['Recepciones', 'Bitacora', 'Config'].forEach(function(name) {
    if (!spreadsheet.getSheetByName(name)) spreadsheet.insertSheet(name);
  });
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getOrCreateSpreadsheet_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(file.getId());
    }
  }

  const spreadsheet = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(spreadsheet.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return spreadsheet;
}

function upsertTextFile_(folder, name, content, mimeType) {
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(content);
    return file;
  }
  return folder.createFile(name, content, mimeType || MimeType.PLAIN_TEXT);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
