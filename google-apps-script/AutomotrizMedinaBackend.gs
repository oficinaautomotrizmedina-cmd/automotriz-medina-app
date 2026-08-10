const AM_CONFIG = {
  folderName: 'Automotriz Medina - Sistema',
  spreadsheetName: 'Automotriz Medina - Base de datos',
  latestFileName: 'ultimo-respaldo-am.json'
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

  return {
    ok: true,
    folderId: env.folderId,
    spreadsheetId: env.spreadsheetId,
    latestFileId: latest.getId(),
    archiveFileId: archive ? archive.getId() : '',
    bytes: content.length
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
