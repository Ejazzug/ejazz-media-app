/*
 * EJazz Control Room -- the designer tab.
 *
 * This file is served as a STATIC FILE and loaded with a script tag on purpose. The Control
 * Room page is one template literal in controlRoom.ts: a backslash anywhere inside it (even in
 * a comment) becomes a real character in the served page, and TypeScript checks none of that
 * JS, so a syntax error there kills every listener on the page including the login button.
 * Out here it is an ordinary file -- regexes, escapes and 'node --check' all work normally.
 *
 * It draws NOTHING. The canvas is HTML boxes showing where each placeholder sits; every pixel
 * the operator judges comes from the preview pane, which is a real render by
 * /opt/radio/lib/designer.py. An editor that drew its own approximation would be a second
 * renderer that quietly disagrees with the one making the files.
 *
 * It also never re-states a rule that lives in Python: validation is the dashboard's
 * /api/design-validate (through POST /api/designer/templates) and applying a preset is a round
 * trip to /api/designer/apply-preset, so the editor and the renderer cannot drift.
 */
(function () {
  'use strict';

  var API = '/api/designer';
  var SNAP = 8;             // px (canvas coordinates) within which an edge or centre grabs
  var MAX_HISTORY = 60;
  var PREVIEW_DEBOUNCE = 700;

  var state = {
    tpl: null,            // the template being edited
    selected: null,       // placeholder id
    size: null,           // "1080x1080"
    history: [],
    future: [],
    brand: [],
    presets: [],
    templates: [],
    previewTimer: null,
    previewUrl: null,
    booted: false
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function say(msg, isError) {
    var box = $(isError ? 'dsErr' : 'dsMsg');
    if (!box) return;
    box.textContent = msg || '';
    if (!isError && msg) {
      window.setTimeout(function () { if (box.textContent === msg) box.textContent = ''; }, 6000);
    }
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function api(path, opts) {
    var options = Object.assign({ credentials: 'include' }, opts || {});
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    return fetch(API + path, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) {
          var detail = body && body.problems ? body.problems.join(' / ') : (body && body.error) || ('HTTP ' + r.status);
          throw new Error(detail);
        }
        return body;
      });
    });
  }

  // ------------------------------------------------------------------ template helpers
  function blankTemplate() {
    return {
      id: 'untitled',
      name: 'Untitled design',
      sizes: ['1080x1080'],
      background: { color: '#070E28' },
      placeholders: []
    };
  }

  function sizeParts(size) {
    var m = /^(\d+)x(\d+)$/.exec(String(size || '').trim());
    return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : { w: 1080, h: 1080 };
  }

  function currentSize() {
    var sizes = (state.tpl && state.tpl.sizes) || ['1080x1080'];
    if (state.size && sizes.indexOf(state.size) !== -1) return state.size;
    return sizes[0];
  }

  function findPh(id) {
    var list = (state.tpl && state.tpl.placeholders) || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }

  /** Snapshot before a change, so undo has something to go back to. */
  function pushHistory() {
    if (!state.tpl) return;
    state.history.push(clone(state.tpl));
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future.length = 0;
    refreshUndoButtons();
  }

  function refreshUndoButtons() {
    if ($('dsUndoBtn')) $('dsUndoBtn').disabled = state.history.length === 0;
    if ($('dsRedoBtn')) $('dsRedoBtn').disabled = state.future.length === 0;
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(clone(state.tpl));
    state.tpl = state.history.pop();
    renderAll();
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(clone(state.tpl));
    state.tpl = state.future.pop();
    renderAll();
  }

  // ------------------------------------------------------------------ canvas
  function canvasScale() {
    var wrap = $('dsCanvasWrap');
    var size = sizeParts(currentSize());
    var available = wrap ? Math.max(240, wrap.clientWidth - 2) : 520;
    return Math.min(1, available / size.w);
  }

  function renderCanvas() {
    var canvas = $('dsCanvas');
    if (!canvas || !state.tpl) return;
    var size = sizeParts(currentSize());
    var scale = canvasScale();
    canvas.style.width = Math.round(size.w * scale) + 'px';
    canvas.style.height = Math.round(size.h * scale) + 'px';
    canvas.style.background = (state.tpl.background && state.tpl.background.color) || '#070E28';
    clear(canvas);

    var guideV = el('div', 'dsGuide dsGuideV');
    var guideH = el('div', 'dsGuide dsGuideH');
    guideV.id = 'dsGuideV';
    guideH.id = 'dsGuideH';
    canvas.appendChild(guideV);
    canvas.appendChild(guideH);

    var list = (state.tpl.placeholders || []).slice().sort(function (a, b) {
      return (a.z || 0) - (b.z || 0);
    });
    list.forEach(function (ph) {
      var box = el('div', 'dsBox' + (String(ph.id) === String(state.selected) ? ' selected' : ''));
      box.style.left = Math.round((ph.x || 0) * scale) + 'px';
      box.style.top = Math.round((ph.y || 0) * scale) + 'px';
      box.style.width = Math.round((ph.width || 0) * scale) + 'px';
      box.style.height = Math.round((ph.height || 0) * scale) + 'px';
      box.setAttribute('data-id', ph.id);
      box.appendChild(el('span', 'dsBoxLabel', ph.id + ' · ' + ph.type));
      var handle = el('span', 'dsHandle');
      handle.setAttribute('data-role', 'resize');
      box.appendChild(handle);
      if (ph.type === 'logo' || ph.type === 'image') {
        box.setAttribute('data-drop', '1');
        box.title = 'Drop a brand logo here';
      }
      canvas.appendChild(box);
    });
    wireCanvasPointer();
  }

  /** One pointer handler for the whole canvas: dragging a box, or resizing from its corner. */
  function wireCanvasPointer() {
    var canvas = $('dsCanvas');
    if (!canvas || canvas.getAttribute('data-wired') === '1') return;
    canvas.setAttribute('data-wired', '1');

    var drag = null;

    canvas.addEventListener('pointerdown', function (ev) {
      var box = ev.target.closest ? ev.target.closest('.dsBox') : null;
      if (!box) return;
      var ph = findPh(box.getAttribute('data-id'));
      if (!ph) return;
      select(ph.id);
      var scale = canvasScale();
      drag = {
        ph: ph,
        mode: ev.target.getAttribute('data-role') === 'resize' ? 'resize' : 'move',
        startX: ev.clientX,
        startY: ev.clientY,
        ox: ph.x || 0,
        oy: ph.y || 0,
        ow: ph.width || 0,
        oh: ph.height || 0,
        scale: scale,
        moved: false
      };
      canvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    canvas.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      if (!drag.moved) { pushHistory(); drag.moved = true; }
      var size = sizeParts(currentSize());
      var dx = Math.round((ev.clientX - drag.startX) / drag.scale);
      var dy = Math.round((ev.clientY - drag.startY) / drag.scale);
      if (drag.mode === 'move') {
        drag.ph.x = clampNum(drag.ox + dx, 0, size.w - drag.ow);
        drag.ph.y = clampNum(drag.oy + dy, 0, size.h - drag.oh);
        applySnap(drag.ph, size);
      } else {
        drag.ph.width = clampNum(drag.ow + dx, 8, size.w - (drag.ph.x || 0));
        drag.ph.height = clampNum(drag.oh + dy, 8, size.h - (drag.ph.y || 0));
        applySnapSize(drag.ph, size);
      }
      renderCanvas();
      fillInspector();
    });

    function end(ev) {
      if (!drag) return;
      var wasMoved = drag.moved;
      drag = null;
      if (ev && ev.pointerId !== undefined && canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
        canvas.releasePointerCapture(ev.pointerId);
      }
      hideGuides();
      if (wasMoved) schedulePreview();
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // Brand logos are dragged in from the brand panel.
    canvas.addEventListener('dragover', function (ev) {
      var box = ev.target.closest ? ev.target.closest('.dsBox[data-drop="1"]') : null;
      if (box) ev.preventDefault();
    });
    canvas.addEventListener('drop', function (ev) {
      var box = ev.target.closest ? ev.target.closest('.dsBox[data-drop="1"]') : null;
      if (!box) return;
      ev.preventDefault();
      var value = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '';
      var ph = findPh(box.getAttribute('data-id'));
      if (!ph || !value) return;
      pushHistory();
      ph.default = value;
      select(ph.id);
      renderAll();
      say('Dropped ' + value.split('/').pop() + ' into ' + ph.id);
    });
  }

  function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

  function showGuide(which, at) {
    var g = $(which === 'v' ? 'dsGuideV' : 'dsGuideH');
    if (!g) return;
    var scale = canvasScale();
    g.style.display = 'block';
    if (which === 'v') g.style.left = Math.round(at * scale) + 'px';
    else g.style.top = Math.round(at * scale) + 'px';
  }

  function hideGuides() {
    if ($('dsGuideV')) $('dsGuideV').style.display = 'none';
    if ($('dsGuideH')) $('dsGuideH').style.display = 'none';
  }

  /** Snap the box's left/right/centre to the canvas edges and centre line, and the same
   * vertically. The guide only shows while the snap is actually holding. */
  function applySnap(ph, size) {
    hideGuides();
    var w = ph.width || 0, h = ph.height || 0;
    var xTargets = [[0, 0], [size.w - w, size.w], [Math.round((size.w - w) / 2), size.w / 2]];
    var yTargets = [[0, 0], [size.h - h, size.h], [Math.round((size.h - h) / 2), size.h / 2]];
    xTargets.forEach(function (t) {
      if (Math.abs((ph.x || 0) - t[0]) <= SNAP) { ph.x = t[0]; showGuide('v', t[1]); }
    });
    yTargets.forEach(function (t) {
      if (Math.abs((ph.y || 0) - t[0]) <= SNAP) { ph.y = t[0]; showGuide('h', t[1]); }
    });
  }

  /** Resizing snaps the far edge to the canvas edge and to the centre line. */
  function applySnapSize(ph, size) {
    hideGuides();
    var right = (ph.x || 0) + (ph.width || 0);
    var bottom = (ph.y || 0) + (ph.height || 0);
    if (Math.abs(right - size.w) <= SNAP) { ph.width = size.w - (ph.x || 0); showGuide('v', size.w); }
    else if (Math.abs(right - size.w / 2) <= SNAP) { ph.width = Math.round(size.w / 2 - (ph.x || 0)); showGuide('v', size.w / 2); }
    if (Math.abs(bottom - size.h) <= SNAP) { ph.height = size.h - (ph.y || 0); showGuide('h', size.h); }
    else if (Math.abs(bottom - size.h / 2) <= SNAP) { ph.height = Math.round(size.h / 2 - (ph.y || 0)); showGuide('h', size.h / 2); }
  }

  // ------------------------------------------------------------------ layers and inspector
  function renderLayers() {
    var box = $('dsLayers');
    if (!box) return;
    clear(box);
    var list = (state.tpl && state.tpl.placeholders) || [];
    if (!list.length) { box.appendChild(el('div', 'empty', 'No placeholders yet.')); return; }
    list.slice().sort(function (a, b) { return (b.z || 0) - (a.z || 0); }).forEach(function (ph) {
      var row = el('div', 'dsLayer' + (String(ph.id) === String(state.selected) ? ' selected' : ''));
      row.appendChild(el('span', 'dsLayerName', ph.id));
      row.appendChild(el('span', 'dsLayerMeta', ph.type + ' · z' + (ph.z || 0)));
      row.addEventListener('click', function () { select(ph.id); renderAll(); });
      box.appendChild(row);
    });
  }

  function select(id) {
    state.selected = id === null || id === undefined ? null : String(id);
    renderLayers();
    fillInspector();
    var canvas = $('dsCanvas');
    if (canvas) {
      Array.prototype.forEach.call(canvas.querySelectorAll('.dsBox'), function (b) {
        b.classList.toggle('selected', b.getAttribute('data-id') === state.selected);
      });
    }
  }

  var INSPECTOR = [
    ['dsPhId', 'id'], ['dsPhType', 'type'], ['dsPhX', 'x'], ['dsPhY', 'y'],
    ['dsPhW', 'width'], ['dsPhH', 'height'], ['dsPhFit', 'fit'], ['dsPhZ', 'z'],
    ['dsPhDefault', 'default']
  ];
  var INSPECTOR_STYLE = [
    ['dsPhFont', 'font'], ['dsPhSize', 'size'], ['dsPhColor', 'color'],
    ['dsPhAlign', 'align'], ['dsPhBg', 'background']
  ];

  function fillInspector() {
    var ph = state.selected ? findPh(state.selected) : null;
    var panel = $('dsInspector');
    if (panel) panel.style.display = ph ? 'block' : 'none';
    if (!ph) return;
    INSPECTOR.forEach(function (pair) {
      var node = $(pair[0]);
      if (node) node.value = ph[pair[1]] === undefined || ph[pair[1]] === null ? '' : String(ph[pair[1]]);
    });
    var style = ph.style || {};
    INSPECTOR_STYLE.forEach(function (pair) {
      var node = $(pair[0]);
      if (node) node.value = style[pair[1]] === undefined || style[pair[1]] === null ? '' : String(style[pair[1]]);
    });
  }

  function readInspector() {
    var ph = state.selected ? findPh(state.selected) : null;
    if (!ph) return;
    pushHistory();
    var newId = ($('dsPhId') && $('dsPhId').value.trim()) || ph.id;
    INSPECTOR.forEach(function (pair) {
      var node = $(pair[0]);
      if (!node) return;
      var raw = node.value.trim();
      var key = pair[1];
      if (key === 'id') { ph.id = raw || ph.id; return; }
      if (key === 'type' || key === 'fit') { if (raw) ph[key] = raw; return; }
      if (key === 'default') { ph.default = raw; return; }
      var num = parseInt(raw, 10);
      if (!isNaN(num)) ph[key] = num;
    });
    var style = {};
    INSPECTOR_STYLE.forEach(function (pair) {
      var node = $(pair[0]);
      if (!node) return;
      var raw = node.value.trim();
      if (!raw) return;
      style[pair[1]] = pair[1] === 'size' ? parseInt(raw, 10) : raw;
    });
    if (Object.keys(style).length) ph.style = style; else delete ph.style;
    state.selected = String(newId);
    renderAll();
    schedulePreview();
  }

  function addPlaceholder() {
    if (!state.tpl) return;
    var type = ($('dsAddType') && $('dsAddType').value) || 'text';
    var size = sizeParts(currentSize());
    var n = 1;
    var base = type;
    while (findPh(base + (n > 1 ? String(n) : ''))) n += 1;
    var id = base + (n > 1 ? String(n) : '');
    var zs = (state.tpl.placeholders || []).map(function (p) { return p.z || 0; });
    pushHistory();
    var ph = {
      id: id,
      type: type,
      x: Math.round(size.w * 0.1),
      y: Math.round(size.h * 0.1),
      width: Math.round(size.w * 0.6),
      height: type === 'text' || type === 'data' ? Math.round(size.h * 0.1) : Math.round(size.h * 0.25),
      z: (zs.length ? Math.max.apply(null, zs) : 0) + 1
    };
    if (type === 'image' || type === 'logo') ph.fit = 'cover';
    if (type === 'text' || type === 'data' || type === 'cta') {
      ph.default = type === 'cta' ? 'Listen on EJazz' : 'New text';
      ph.style = { font: 'Liberation Sans Bold', size: 48, color: '#F2F4FF', align: 'left' };
      if (type === 'cta') ph.style.background = '#FF0056';
    }
    state.tpl.placeholders = (state.tpl.placeholders || []).concat([ph]);
    select(id);
    renderAll();
    schedulePreview();
  }

  function deleteSelected() {
    if (!state.tpl || !state.selected) return;
    pushHistory();
    state.tpl.placeholders = (state.tpl.placeholders || []).filter(function (p) {
      return String(p.id) !== String(state.selected);
    });
    state.selected = null;
    renderAll();
    schedulePreview();
  }

  function nudgeZ(delta) {
    var ph = state.selected ? findPh(state.selected) : null;
    if (!ph) return;
    pushHistory();
    ph.z = (ph.z || 0) + delta;
    renderAll();
    schedulePreview();
  }

  // ------------------------------------------------------------------ preview
  function schedulePreview() {
    if (state.previewTimer) window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(renderPreview, PREVIEW_DEBOUNCE);
  }

  function renderPreview() {
    var img = $('dsPreview');
    var meta = $('dsPreviewMeta');
    if (!img || !state.tpl) return;
    if (meta) meta.textContent = 'Rendering…';
    fetch(API + '/render', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: state.tpl, size: currentSize() })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          throw new Error((body && body.detail) || (body && body.error) || ('HTTP ' + r.status));
        });
      }
      var warn = r.headers.get('x-design-warnings') || '';
      var missing = r.headers.get('x-design-missing-fonts') || '';
      var bytes = r.headers.get('x-design-bytes') || '';
      var quality = r.headers.get('x-design-quality') || '';
      return r.blob().then(function (blob) {
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = URL.createObjectURL(blob);
        img.src = state.previewUrl;
        var bits = [];
        if (bytes) bits.push(Math.round(parseInt(bytes, 10) / 1024) + ' KB at quality ' + quality);
        if (missing) bits.push('fonts not found: ' + missing);
        if (warn) bits.push(warn);
        if (meta) meta.textContent = bits.join(' — ') || 'Rendered.';
      });
    }).catch(function (err) {
      if (meta) meta.textContent = '';
      say('Preview failed: ' + err.message, true);
    });
  }

  // ------------------------------------------------------------------ server data
  function loadBrand() {
    return api('/brand').then(function (items) {
      state.brand = items || [];
      renderBrand();
    }).catch(function (err) { say('Brand assets: ' + err.message, true); });
  }

  function renderBrand() {
    var groups = { logo: $('dsBrandLogos'), colour: $('dsBrandColours'), font: $('dsBrandFonts') };
    Object.keys(groups).forEach(function (k) { if (groups[k]) clear(groups[k]); });
    state.brand.forEach(function (asset) {
      var host = groups[asset.kind];
      if (!host) return;
      if (asset.kind === 'logo') {
        var chip = el('div', 'dsAsset' + (asset.missing ? ' missing' : ''));
        chip.draggable = true;
        chip.appendChild(el('span', 'dsAssetName', asset.name));
        chip.appendChild(el('span', 'dsAssetMeta', asset.missing ? 'file missing on disk' : asset.value.split('/').pop()));
        chip.addEventListener('dragstart', function (ev) {
          ev.dataTransfer.setData('text/plain', asset.value);
        });
        chip.addEventListener('click', function () {
          var ph = state.selected ? findPh(state.selected) : null;
          if (!ph || (ph.type !== 'logo' && ph.type !== 'image')) {
            say('Select a logo or image placeholder first, or drag this onto one.', true);
            return;
          }
          pushHistory();
          ph.default = asset.value;
          renderAll();
          schedulePreview();
        });
        host.appendChild(chip);
      } else if (asset.kind === 'colour') {
        var sw = el('button', 'dsSwatch');
        sw.type = 'button';
        sw.style.background = asset.value;
        sw.title = asset.name + ' ' + asset.value;
        sw.addEventListener('click', function () { applyColour(asset.value); });
        host.appendChild(sw);
      } else {
        var f = el('button', 'dsFont', asset.name + ' — ' + asset.value);
        f.type = 'button';
        f.addEventListener('click', function () { applyFont(asset.value); });
        host.appendChild(f);
      }
    });
  }

  /** A colour goes to the selected placeholder's text, or to the background when nothing is
   * selected -- the two things an operator means by clicking a swatch. */
  function applyColour(value) {
    if (!state.tpl) return;
    pushHistory();
    var ph = state.selected ? findPh(state.selected) : null;
    if (ph) {
      ph.style = Object.assign({}, ph.style || {});
      ph.style[ph.type === 'cta' ? 'background' : 'color'] = value;
    } else {
      state.tpl.background = Object.assign({}, state.tpl.background || {}, { color: value });
      if ($('dsBgColor')) $('dsBgColor').value = value;
    }
    renderAll();
    schedulePreview();
  }

  function applyFont(value) {
    var ph = state.selected ? findPh(state.selected) : null;
    if (!ph) { say('Select a placeholder first.', true); return; }
    pushHistory();
    ph.style = Object.assign({}, ph.style || {}, { font: value });
    renderAll();
    schedulePreview();
  }

  function loadTemplates(selectId) {
    return api('/templates').then(function (items) {
      state.templates = items || [];
      var sel = $('dsTemplateSel');
      if (sel) {
        clear(sel);
        state.templates.forEach(function (t) {
          var o = el('option', null, t.name + (t.source === 'disk' ? ' (shipped)' : ''));
          o.value = t.id;
          sel.appendChild(o);
        });
        if (selectId) sel.value = selectId;
      }
      var wanted = selectId || (sel && sel.value) || (state.templates[0] && state.templates[0].id);
      if (wanted) openTemplate(wanted);
    }).catch(function (err) { say('Templates: ' + err.message, true); });
  }

  function openTemplate(id) {
    var found = null;
    state.templates.forEach(function (t) { if (t.id === id) found = t; });
    state.tpl = found && found.body ? clone(found.body) : blankTemplate();
    state.selected = null;
    state.history.length = 0;
    state.future.length = 0;
    state.size = (state.tpl.sizes || ['1080x1080'])[0];
    renderAll();
    renderPreview();
  }

  function loadPresets() {
    return api('/presets').then(function (items) {
      state.presets = items || [];
      var sel = $('dsPresetSel');
      if (!sel) return;
      clear(sel);
      sel.appendChild(el('option', null, '— choose a preset —'));
      state.presets.forEach(function (p) {
        var o = el('option', null, p.name);
        o.value = p.id;
        sel.appendChild(o);
      });
    }).catch(function (err) { say('Presets: ' + err.message, true); });
  }

  // ------------------------------------------------------------------ actions
  function readTemplateFields() {
    if (!state.tpl) return;
    if ($('dsTplId') && $('dsTplId').value.trim()) state.tpl.id = $('dsTplId').value.trim();
    if ($('dsTplName') && $('dsTplName').value.trim()) state.tpl.name = $('dsTplName').value.trim();
    if ($('dsBgColor') && $('dsBgColor').value.trim()) {
      state.tpl.background = Object.assign({}, state.tpl.background || {}, { color: $('dsBgColor').value.trim() });
    }
  }

  function saveTemplate() {
    readTemplateFields();
    if (!state.tpl) return;
    api('/templates', { method: 'POST', body: JSON.stringify({ body: state.tpl }) })
      .then(function (row) {
        say('Saved ' + row.id + '.');
        return loadTemplates(row.id);
      })
      .catch(function (err) { say('Not saved — ' + err.message, true); });
  }

  function duplicateTemplate() {
    if (!state.tpl) return;
    readTemplateFields();
    var copy = clone(state.tpl);
    var base = String(copy.id || 'untitled').replace(/-copy\d*$/, '');
    var n = 1;
    var taken = {};
    state.templates.forEach(function (t) { taken[t.id] = true; });
    while (taken[base + '-copy' + (n > 1 ? String(n) : '')]) n += 1;
    copy.id = base + '-copy' + (n > 1 ? String(n) : '');
    copy.name = (copy.name || base) + ' (copy)';
    state.tpl = copy;
    state.history.length = 0;
    state.future.length = 0;
    renderAll();
    say('Duplicated as ' + copy.id + ' — it is not saved until you press Save template.');
  }

  /** A preset is presentation only: the background and each placeholder's style. Geometry is
   * deliberately left out -- see the renderer's apply_preset(). */
  function presetFromTemplate() {
    var out = { background: { color: (state.tpl.background || {}).color || '#070E28' }, placeholders: {} };
    (state.tpl.placeholders || []).forEach(function (ph) {
      if (ph.style) out.placeholders[ph.id] = { style: clone(ph.style) };
    });
    return out;
  }

  function savePreset() {
    var nameBox = $('dsPresetName');
    var name = nameBox ? nameBox.value.trim() : '';
    if (!name) { say('A preset needs a name.', true); return; }
    if (!state.tpl) return;
    api('/presets', { method: 'POST', body: JSON.stringify({ name: name, kind: 'design', settings: presetFromTemplate() }) })
      .then(function (row) {
        say('Saved preset ' + row.name + '.');
        if (nameBox) nameBox.value = '';
        return loadPresets();
      })
      .catch(function (err) { say('Preset not saved — ' + err.message, true); });
  }

  /** Applying a preset is a round trip: the merge rules live in the Python renderer and are
   * not restated here, so the canvas and the rendered JPEG cannot disagree. */
  function applyPreset() {
    var sel = $('dsPresetSel');
    var id = sel ? sel.value : '';
    if (!id) { say('Choose a preset first.', true); return; }
    var preset = null;
    state.presets.forEach(function (p) { if (p.id === id) preset = p; });
    if (!preset) { say('That preset is no longer there.', true); return; }
    pushHistory();
    api('/apply-preset', { method: 'POST', body: JSON.stringify({ template: state.tpl, preset: preset.settings }) })
      .then(function (out) {
        state.tpl = out.template;
        renderAll();
        renderPreview();
        say('Applied ' + preset.name + '.');
      })
      .catch(function (err) { say('Could not apply the preset — ' + err.message, true); });
  }

  function exportTemplate() {
    readTemplateFields();
    if (!state.tpl) return;
    var blob = new Blob([JSON.stringify(state.tpl, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.tpl.id || 'template') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function importTemplate(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        say('That file is not valid JSON: ' + err.message, true);
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        say('That file is not a template.', true);
        return;
      }
      pushHistory();
      state.tpl = parsed;
      state.selected = null;
      state.size = (parsed.sizes || ['1080x1080'])[0];
      renderAll();
      renderPreview();
      say('Imported ' + (parsed.id || 'template') + ' — it is not saved until you press Save template.');
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------------ paint everything
  function renderAll() {
    if (!state.tpl) return;
    if ($('dsTplId')) $('dsTplId').value = state.tpl.id || '';
    if ($('dsTplName')) $('dsTplName').value = state.tpl.name || '';
    if ($('dsBgColor')) $('dsBgColor').value = (state.tpl.background || {}).color || '';
    var sizeSel = $('dsSizeSel');
    if (sizeSel) {
      var sizes = state.tpl.sizes || ['1080x1080'];
      clear(sizeSel);
      sizes.forEach(function (s) {
        var o = el('option', null, s);
        o.value = s;
        sizeSel.appendChild(o);
      });
      sizeSel.value = currentSize();
    }
    renderCanvas();
    renderLayers();
    fillInspector();
    refreshUndoButtons();
  }

  function on(id, event, fn) {
    var node = $(id);
    if (node) node.addEventListener(event, fn);
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    state.tpl = blankTemplate();

    on('dsAddBtn', 'click', addPlaceholder);
    on('dsDeleteBtn', 'click', deleteSelected);
    on('dsZUpBtn', 'click', function () { nudgeZ(1); });
    on('dsZDownBtn', 'click', function () { nudgeZ(-1); });
    on('dsUndoBtn', 'click', undo);
    on('dsRedoBtn', 'click', redo);
    on('dsSaveBtn', 'click', saveTemplate);
    on('dsDupBtn', 'click', duplicateTemplate);
    on('dsSavePresetBtn', 'click', savePreset);
    on('dsApplyPresetBtn', 'click', applyPreset);
    on('dsExportBtn', 'click', exportTemplate);
    on('dsRefreshPreview', 'click', renderPreview);
    on('dsImportBtn', 'click', function () { if ($('dsImportFile')) $('dsImportFile').click(); });
    on('dsImportFile', 'change', function (ev) {
      importTemplate(ev.target.files && ev.target.files[0]);
      ev.target.value = '';
    });
    on('dsTemplateSel', 'change', function (ev) { openTemplate(ev.target.value); });
    on('dsSizeSel', 'change', function (ev) {
      state.size = ev.target.value;
      renderAll();
      renderPreview();
    });
    on('dsBgColor', 'change', function () { pushHistory(); readTemplateFields(); renderAll(); schedulePreview(); });

    INSPECTOR.concat(INSPECTOR_STYLE).forEach(function (pair) {
      on(pair[0], 'change', readInspector);
    });

    window.addEventListener('resize', function () { renderCanvas(); });

    loadBrand();
    loadPresets();
    loadTemplates();
  }

  // The tab button is the trigger: the page is behind a login, and nothing should be fetched
  // until the operator actually opens the designer. addEventListener is additive, so the
  // Control Room's own tab handler is untouched.
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.tabBtn[data-panel="panel-designer"]');
    if (btn) btn.addEventListener('click', boot);
  });
})();
