(function () {
  'use strict';

  const DICT_KEY = 'automotriz_medina_diccionario_ortografico_v2';

  const REPLACEMENTS = [
    ['diagnostico', 'diagn\u00f3stico'],
    ['diagnosticos', 'diagn\u00f3sticos'],
    ['revision', 'revisi\u00f3n'],
    ['reparacion', 'reparaci\u00f3n'],
    ['programacion', 'programaci\u00f3n'],
    ['direccion', 'direcci\u00f3n'],
    ['suspension', 'suspensi\u00f3n'],
    ['alineacion', 'alineaci\u00f3n'],
    ['basico', 'b\u00e1sico'],
    ['electrico', 'el\u00e9ctrico'],
    ['electronico', 'electr\u00f3nico'],
    ['electronica', 'electr\u00f3nica'],
    ['mecanico', 'mec\u00e1nico'],
    ['mecanica', 'mec\u00e1nica'],
    ['transmision', 'transmisi\u00f3n'],
    ['presion', 'presi\u00f3n'],
    ['compresion', 'compresi\u00f3n'],
    ['combustion', 'combusti\u00f3n'],
    ['medicion', 'medici\u00f3n'],
    ['codigo', 'c\u00f3digo'],
    ['codigos', 'c\u00f3digos'],
    ['modulo', 'm\u00f3dulo'],
    ['modulos', 'm\u00f3dulos'],
    ['arbol', '\u00e1rbol'],
    ['arboles', '\u00e1rboles'],
    ['camara', 'c\u00e1mara'],
    ['valvula', 'v\u00e1lvula'],
    ['valvulas', 'v\u00e1lvulas'],
    ['ciguenal', 'cig\u00fce\u00f1al'],
    ['cigue\u00f1al', 'cig\u00fce\u00f1al'],
    ['inyeccion', 'inyecci\u00f3n'],
    ['calibracion', 'calibraci\u00f3n'],
    ['instalacion', 'instalaci\u00f3n'],
    ['sustitucion', 'sustituci\u00f3n'],
    ['verificacion', 'verificaci\u00f3n'],
    ['liquido', 'l\u00edquido'],
    ['liquidos', 'l\u00edquidos'],
    ['hidraulico', 'hidr\u00e1ulico'],
    ['hidraulica', 'hidr\u00e1ulica'],
    ['bateria', 'bater\u00eda'],
    ['bujia', 'buj\u00eda'],
    ['bujias', 'buj\u00edas'],
    ['llanteria', 'llanter\u00eda'],
    ['garantia', 'garant\u00eda'],
    ['garantias', 'garant\u00edas'],
    ['perdida', 'p\u00e9rdida'],
    ['perdidas', 'p\u00e9rdidas'],
    ['oxigeno', 'ox\u00edgeno'],
    ['temperatura', 'temperatura'],
    ['terminales de direccion', 'terminales de direcci\u00f3n'],
    ['alineado basico', 'alineado b\u00e1sico'],
    ['diagnostico obd', 'diagn\u00f3stico OBD'],
    ['respaldo de codigos', 'respaldo de c\u00f3digos'],
    ['modulo de control', 'm\u00f3dulo de control'],
    ['remplazo', 'reemplazo'],
    ['reemplaso', 'reemplazo'],
    ['canvio', 'cambio'],
    ['cambiode', 'cambio de'],
    ['faya', 'falla'],
    ['revicion', 'revisi\u00f3n'],
    ['reparasion', 'reparaci\u00f3n'],
    ['direcion', 'direcci\u00f3n'],
    ['suspenion', 'suspensi\u00f3n'],
    ['amortiguadorres', 'amortiguadores'],
    ['terminalez', 'terminales'],
    ['delanteroz', 'delanteros'],
    ['traseroz', 'traseros'],
    ['aseite', 'aceite'],
    ['azulfre', 'azufre'],
    ['baleros', 'baleros'],
    ['polberas', 'polveras']
  ];

  const ACRONYMS = ['obd', 'abs', 'ecu', 'tcm', 'pcm', 'hvac', 'vin', 'rpm', 'tpms'];

  function loadDictionary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DICT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveDictionary(list) {
    localStorage.setItem(DICT_KEY, JSON.stringify(Array.from(new Set(list)).sort()));
  }

  function normalizeTerm(value) {
    return String(value || '').trim().toLocaleLowerCase('es-SV');
  }

  function isInDictionary(value) {
    const term = normalizeTerm(value);
    return term && loadDictionary().includes(term);
  }

  function addToDictionary(value) {
    const term = normalizeTerm(value);
    if (!term) return false;
    const list = loadDictionary();
    if (!list.includes(term)) {
      list.push(term);
      saveDictionary(list);
    }
    return true;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function keepCase(original, replacement) {
    if (!original) return replacement;
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function isText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function splitSentences(text) {
    return String(text || '').replace(/(^|[.!?:]\s+|\n+)([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1])/g, function (_, prefix, letter) {
      return prefix + letter.toUpperCase();
    });
  }

  const WORD_REPLACEMENTS = new Map(REPLACEMENTS.filter(function ([bad]) {
    return !/\s/.test(bad);
  }).map(function ([bad, good]) {
    return [bad.toLocaleLowerCase('es-SV'), good];
  }));

  function normalizeWord(value) {
    return String(value || '').toLocaleLowerCase('es-SV');
  }

  function replaceWordByWord(text) {
    return String(text || '').replace(/[A-Za-z\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1]+/g, function (word) {
      if (isInDictionary(word)) return word;
      const normalized = normalizeWord(word);
      if (WORD_REPLACEMENTS.has(normalized)) return keepCase(word, WORD_REPLACEMENTS.get(normalized));
      if (ACRONYMS.includes(normalized)) return word.toUpperCase();
      return word;
    });
  }

  function applyCorrections(value) {
    let out = String(value || '');
    out = out.replace(/\r\n/g, '\n');
    out = out.replace(/[ \t]{2,}/g, ' ');
    out = out.replace(/\s+([,.;:])/g, '$1');
    out = out.replace(/([,.;:])(?=\S)/g, '$1 ');
    out = splitSentences(out);

    REPLACEMENTS.forEach(function ([bad, good]) {
      if (!/\s/.test(bad)) return;
      const re = new RegExp('\\b' + escapeRegExp(bad) + '\\b', 'gi');
      out = out.replace(re, function (match) {
        return isInDictionary(match) ? match : keepCase(match, good);
      });
    });

    out = replaceWordByWord(out);

    return out.trimStart();
  }

  function targetFromObject(item, key, label, renderAfter) {
    return {
      label,
      get: function () { return item[key]; },
      set: function (value) { item[key] = value; },
      renderAfter
    };
  }

  function addObjectArrayTargets(targets, array, label, renderAfter) {
    if (!Array.isArray(array)) return;
    array.forEach(function (item, index) {
      if (!item || typeof item !== 'object') return;
      ['desc', 'descripcion', 'description'].forEach(function (key) {
        if (isText(item[key])) targets.push(targetFromObject(item, key, label + ' ' + (index + 1), renderAfter));
      });
    });
  }

  function readableCellLabel(el, index) {
    const table = el.closest('table');
    const row = el.closest('tr');
    const cell = el.closest('td');
    const headers = table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()).filter(Boolean) : [];
    const colIndex = cell ? Array.from(row.children).indexOf(cell) : -1;
    const col = headers[colIndex] || el.dataset.field || 'Campo';
    const section = el.closest('.sheet-box')?.querySelector('h3')?.textContent?.trim()
      || el.closest('.panel')?.querySelector('h2')?.textContent?.trim()
      || 'Celda';
    const rowIndex = row?.dataset?.index != null ? Number(row.dataset.index) + 1 : index + 1;
    return section + ' - fila ' + rowIndex + ' - ' + col;
  }

  function addDomTargets(targets) {
    const seen = new Set();
    document.querySelectorAll('textarea, input[type="text"]:not([readonly]), input:not([type]):not([readonly])').forEach(function (el, index) {
      if (!isText(el.value)) return;
      if (seen.has(el)) return;
      seen.add(el);
      targets.push({
        label: readableCellLabel(el, index),
        get: function () { return el.value; },
        set: function (value) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.focus();
        },
        renderAfter: null
      });
    });
  }

  function collectTargets() {
    const targets = [];
    const rerender = function () {
      if (typeof renderAndMarkDirty === 'function') renderAndMarkDirty();
      else {
        if (typeof render === 'function') render();
        if (typeof markDirty === 'function') markDirty();
      }
    };

    try { if (typeof items !== 'undefined') addObjectArrayTargets(targets, items, '\u00cdtem de trabajo', rerender); } catch (e) {}
    try { if (typeof repuestos !== 'undefined') addObjectArrayTargets(targets, repuestos, 'Repuesto', rerender); } catch (e) {}
    try { if (typeof authItems !== 'undefined') addObjectArrayTargets(targets, authItems, '\u00cdtem autorizado', rerender); } catch (e) {}
    try { if (typeof authRepuestos !== 'undefined') addObjectArrayTargets(targets, authRepuestos, 'Repuesto autorizado', rerender); } catch (e) {}
    try {
      if (typeof masterDocs !== 'undefined') {
        Object.entries(masterDocs || {}).forEach(function ([kind, doc]) {
          addObjectArrayTargets(targets, doc && doc.lines, kind, rerender);
        });
      }
    } catch (e) {}

    addDomTargets(targets);

    return targets;
  }

  function issueForTarget(target) {
    const original = target.get();
    const suggestion = applyCorrections(original);
    if (String(original).normalize('NFC') === String(suggestion).normalize('NFC')) return null;
    return { target, original, suggestion };
  }

  function findIssues() {
    return collectTargets().map(issueForTarget).filter(Boolean);
  }

  function ensureModal() {
    let modal = document.getElementById('spellModal');
    if (modal) return modal;

    const style = document.createElement('style');
    style.textContent = [
      '.spell-modal{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:9999;display:none;align-items:center;justify-content:center;padding:18px}',
      '.spell-card{width:min(760px,100%);background:#fff;border:1px solid #d7dde7;border-radius:8px;box-shadow:0 24px 60px rgba(15,23,42,.24);padding:16px;color:#172033}',
      '.spell-card h2{margin:0 0 4px;font-size:20px}.spell-card p{margin:0 0 12px;color:#667085}',
      '.spell-loc{font-weight:700;margin-bottom:10px}.spell-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.spell-box{border:1px solid #d7dde7;border-radius:8px;padding:10px;min-height:120px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc}',
      '.spell-box.suggestion{background:#effaf2;border-color:#a7d7b3}',
      '.spell-label{font-size:11px;text-transform:uppercase;color:#667085;margin-bottom:5px;letter-spacing:.04em}',
      '.spell-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}',
      '.spell-actions button.primary{background:#155e75;border-color:#155e75;color:#fff}',
      '@media(max-width:720px){.spell-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'spellModal';
    modal.className = 'spell-modal';
    modal.innerHTML = [
      '<div class="spell-card">',
      '<h2>Corrector ortogr\u00e1fico</h2>',
      '<p id="spellCount"></p>',
      '<div class="spell-loc" id="spellLocation"></div>',
      '<div class="spell-grid">',
      '<div><div class="spell-label">Original</div><div class="spell-box" id="spellOriginal"></div></div>',
      '<div><div class="spell-label">Sugerencia</div><div class="spell-box suggestion" id="spellSuggestion"></div></div>',
      '</div>',
      '<div class="spell-actions">',
      '<button id="spellClose" type="button">Cerrar</button>',
      '<button id="spellAddWord" type="button">Agregar al diccionario</button>',
      '<button id="spellSkip" type="button">Omitir</button>',
      '<button id="spellApply" class="primary" type="button">Corregir</button>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    return modal;
  }

  let issues = [];
  let issueIndex = 0;

  function showIssue() {
    const modal = ensureModal();
    if (!issues.length || issueIndex >= issues.length) {
      modal.style.display = 'none';
      alert('Corrector terminado. No quedan sugerencias pendientes.');
      return;
    }
    const issue = issues[issueIndex];
    document.getElementById('spellCount').textContent = 'Sugerencia ' + (issueIndex + 1) + ' de ' + issues.length;
    document.getElementById('spellLocation').textContent = issue.target.label;
    document.getElementById('spellOriginal').textContent = issue.original;
    document.getElementById('spellSuggestion').textContent = issue.suggestion;
    modal.style.display = 'flex';
  }

  function startSpellCheck() {
    issues = findIssues();
    issueIndex = 0;
    if (!issues.length) {
      alert('No encontr\u00e9 sugerencias ortogr\u00e1ficas en \u00edtems ni repuestos.');
      return;
    }
    showIssue();
  }

  function addCurrentToDictionary() {
    const issue = issues[issueIndex];
    if (!issue) return;
    const term = prompt('Escribe la palabra o frase que quieres agregar al diccionario:', issue.original);
    if (!term) return;
    addToDictionary(term);
    issues = findIssues();
    issueIndex = Math.min(issueIndex, Math.max(issues.length - 1, 0));
    showIssue();
  }

  function initSpellChecker() {
    let btn = document.getElementById('spellCheckBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'spellCheckBtn';
      btn.className = 'spell-check-btn';
      btn.textContent = 'Corrector';
      btn.type = 'button';
      const save = document.getElementById('saveFile');
      (save?.parentElement || document.body).insertBefore(btn, save || null);
    }
    document.querySelectorAll('.spell-check-btn, #spellCheckBtn').forEach(function (spellBtn) {
      if (spellBtn.dataset.spellReady === '1') return;
      spellBtn.dataset.spellReady = '1';
      spellBtn.addEventListener('click', startSpellCheck);
    });

    const modal = ensureModal();
    if (modal.dataset.spellModalReady === '1') return;
    modal.dataset.spellModalReady = '1';
    document.getElementById('spellClose').addEventListener('click', function () { modal.style.display = 'none'; });
    document.getElementById('spellSkip').addEventListener('click', function () { issueIndex += 1; showIssue(); });
    document.getElementById('spellAddWord').addEventListener('click', addCurrentToDictionary);
    document.getElementById('spellApply').addEventListener('click', function () {
      const issue = issues[issueIndex];
      issue.target.set(issue.suggestion);
      if (typeof issue.target.renderAfter === 'function') issue.target.renderAfter();
      issues = findIssues();
      issueIndex = Math.min(issueIndex, Math.max(issues.length - 1, 0));
      showIssue();
    });
  }

  function editableCells(table) {
    return Array.from(table.querySelectorAll('textarea, input:not([type="checkbox"]):not([readonly]), select'))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function focusCellFrom(current, rowDelta, colDelta) {
    const table = current.closest('table');
    const row = current.closest('tr');
    const cell = current.closest('td');
    if (!table || !row || !cell) return false;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    const colIndex = Array.from(row.children).indexOf(cell);
    let nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex + rowDelta));
    let nextCol = Math.max(0, colIndex + colDelta);

    for (let guard = 0; guard < rows.length * 4; guard += 1) {
      const cells = Array.from(rows[nextRow].children);
      nextCol = Math.max(0, Math.min(cells.length - 1, nextCol));
      const target = cells[nextCol]?.querySelector('textarea, input:not([type="checkbox"]):not([readonly]), select');
      if (target && !target.disabled) {
        target.focus();
        if (target.select && target.tagName !== 'SELECT') target.select();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
      }
      if (rowDelta !== 0) {
        nextRow = Math.max(0, Math.min(rows.length - 1, nextRow + (rowDelta > 0 ? 1 : -1)));
      } else {
        nextCol += colDelta >= 0 ? 1 : -1;
        if (nextCol < 0 || nextCol >= cells.length) return false;
      }
    }
    return false;
  }

  function installGridNavigation() {
    document.addEventListener('keydown', function (ev) {
      const el = ev.target;
      if (!el || !el.closest || !el.closest('.sheet-table, .quote-table, .calc-table')) return;
      const isTextarea = el.tagName === 'TEXTAREA';

      if (ev.key === 'Enter') {
        if (isTextarea && ev.shiftKey) return;
        ev.preventDefault();
        focusCellFrom(el, 1, 0);
        return;
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.automdSpellChecker = {
      preview: applyCorrections,
      start: startSpellCheck,
      addToDictionary,
      dictionary: loadDictionary
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initSpellChecker();
      installGridNavigation();
    });
  } else {
    initSpellChecker();
    installGridNavigation();
  }
})();
