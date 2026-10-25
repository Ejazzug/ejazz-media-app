#!/usr/bin/env node
// designer.js -- the Control Room designer tab -- run exactly as served, against a stand-in DOM.
//
// Why this exists: designer.js is browser JavaScript that nothing type-checks, and the usual
// tells (a $('id') with no element behind it, a handler that sends the wrong body) only show up
// in a browser. There is no jsdom on this box, hence the small DOM below. The element ids come
// from the SERVED Control Room page, so a handler reaching for an id that is not in the markup
// fails here rather than killing the tab in the operator's face.
//
//     node /opt/ejazz-media/artifacts/api-server/src/routes/designer.browser.test.cjs
//
// It is .cjs and lives here rather than beside designer.js because this package is ESM and
// everything under public/ is served to the browser -- a test is not part of the page.
//
// No network: every fetch is answered from the stubs below, and the only real request is the
// read of the Control Room page itself (loopback, GET). It reads and writes nothing of the
// operator's -- no template, preset or brand asset is touched.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SRC = path.resolve(__dirname, '../../public/designer.js');
const PAGE_URL = 'http://127.0.0.1:5601/control-room/';   // the trailing slash: /control-room redirects

let failures = 0;
function ok(label, cond) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) failures++;
}
function eq(label, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  console.log((same ? '  ok   ' : '  FAIL ') + label);
  if (!same) { failures++; console.log('        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)); }
}
const settle = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------- the ids the real page carries
function servedIds() {
  const html = execFileSync('curl', ['-sSL', '--max-time', '10', PAGE_URL]).toString();
  if (!/panel-designer/.test(html)) throw new Error('the served page has no designer panel');
  const ids = new Set();
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

// ---------------------------------------------------------------------------- stand-in DOM
function makeDom(ids) {
  const byId = {};
  function node(tag) {
    const n = {
      tagName: String(tag || 'div').toUpperCase(),
      children: [], className: '', _text: '', value: '', disabled: false, label: '',
      attrs: {}, listeners: {}, style: {}, options: [], files: [],
      clientWidth: 520,
      set textContent(v) { this._text = String(v); this.children.length = 0; },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
      get firstChild() { return this.children[0] || null; },
      appendChild(c) {
        this.children.push(c);
        c.parentNode = this;
        if (this.tagName === 'SELECT' && (c.tagName === 'OPTION' || c.tagName === 'OPTGROUP')) this.options.push(c);
        return c;
      },
      insertBefore(c, ref) {
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        c.parentNode = this;
        return c;
      },
      get nextSibling() {
        const p = this.parentNode;
        if (!p) return null;
        return p.children[p.children.indexOf(this) + 1] || null;
      },
      parentNode: null,
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
      addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
      removeEventListener() {},
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      setPointerCapture() {}, releasePointerCapture() {}, click() { this.fire('click'); },
      classList: { toggle() {}, add() {}, remove() {} },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: 400 }; },
      fire(ev, extra) {
        (this.listeners[ev] || []).forEach((fn) => fn(Object.assign({ target: this, preventDefault() {}, stopPropagation() {} }, extra || {})));
      },
      set innerHTML(v) { this._text = v === '' ? '' : String(v); this.children.length = 0; },
      get innerHTML() { return this._text; },
    };
    return n;
  }
  // Only ids the real markup has: anything else answers null, exactly like the browser.
  ids.forEach((id) => { byId[id] = node(id.slice(0, 2) === 'ds' ? 'div' : 'div'); });
  for (const id of ['dsSizeSel', 'dsTemplateSel', 'dsPresetSel', 'dsAddType', 'dsPhType', 'dsPhFit', 'dsPhAlign']) {
    if (byId[id]) byId[id].tagName = 'SELECT';
  }
  // The Size select sits in a .field inside a .dsBar in the real page; the ratio row is inserted
  // beside it, so the stand-in needs those two wrappers.
  if (byId.dsSizeSel) {
    const bar = node('div');
    const field = node('div');
    bar.appendChild(field);
    field.appendChild(byId.dsSizeSel);
  }
  const tabBtn = node('button');
  tabBtn.attrs['data-panel'] = 'panel-designer';
  const document = {
    body: node('body'),
    listeners: {},
    getElementById(id) { return byId[id] || null; },
    createElement(tag) { return node(tag); },
    querySelector(sel) { return /panel-designer/.test(sel) ? tabBtn : null; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    fire(ev) { (this.listeners[ev] || []).forEach((fn) => fn({})); },
  };
  return { document, byId, tabBtn };
}

// Option labels of a <select>, flattened out of its optgroups: [[group, label, value], ...]
function optionRows(sel) {
  const rows = [];
  sel.children.forEach((c) => {
    if (c.tagName === 'OPTGROUP') c.children.forEach((o) => rows.push([c.label, o.textContent, o.value]));
    else rows.push(['', c.textContent, c.value]);
  });
  return rows;
}

function load(ids, opts) {
  const { document, byId, tabBtn } = makeDom(ids);
  const renders = [];      // every body POSTed to /render -- how we read what is being designed
  const saved = [];
  const fetchStub = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (/\/render$/.test(String(url))) {
      renders.push(body);
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: () => '' },
        blob: () => Promise.resolve({ size: 1 }),
        json: () => Promise.resolve({}),
      });
    }
    if (/\/templates$/.test(String(url)) && init && init.method === 'POST') saved.push(body);
    const data = /\/brand/.test(String(url)) ? [] : /\/presets/.test(String(url)) ? [] : (opts && opts.templates) || [];
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), headers: { get: () => '' } });
  };
  const sandbox = {
    document,
    window: { addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, innerHeight: 900 },
    fetch: fetchStub,
    URL: { createObjectURL: () => 'blob:1', revokeObjectURL() {} },
    FileReader: function () { this.readAsText = () => {}; },
    JSON, Math, String, Number, Object, Array, Boolean, Date, isNaN, parseInt, parseFloat, console,
    setTimeout, clearTimeout, setImmediate,
  };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'designer.js' });
  document.fire('DOMContentLoaded');
  tabBtn.fire('click');                      // the designer only boots when its tab is opened
  return { byId, renders, saved, document };
}

// ------------------------------------------------------------------------------------ the tests

// The ratio tick-boxes are built by designer.js next to the Size select, so they are found by
// walking the DOM rather than by id.
function ratioBoxes(byId) {
  const out = {};
  const bar = byId.dsSizeSel.parentNode.parentNode;
  (function walk(n) {
    (n.children || []).forEach((c) => {
      if (c.tagName === 'INPUT' && c.getAttribute('data-ratio')) out[c.getAttribute('data-ratio')] = c;
      walk(c);
    });
  })(bar);
  return out;
}

function tick(box, on) {
  box.checked = on;
  box.fire('change');
}

function commonGuide(byId) {
  return (byId.dsCanvas.children || []).find((c) => c.getAttribute('data-role') === 'common-area') || null;
}

function sent(run) {
  return run.renders[run.renders.length - 1];
}

(async function main() {
  const ids = servedIds();
  ok('the served page has the Size select', ids.has('dsSizeSel'));

  // ---- the three ratios, offered from the start ----
  const a = load(ids);
  await settle();
  eq('a new design is shareable at all three ratios, 9:16 first',
     optionRows(a.byId.dsSizeSel),
     [['', '9:16 story \u00b7 1080\u00d71920', '1080x1920'],
      ['', '4:5 portrait \u00b7 1080\u00d71350', '1080x1350'],
      ['', '1:1 square \u00b7 1080\u00d71080', '1080x1080']]);
  eq('and nothing else is on offer', Object.keys(ratioBoxes(a.byId)),
     ['1080x1920', '1080x1350', '1080x1080']);
  ok('every one of them is ticked',
     Object.keys(ratioBoxes(a.byId)).every((k) => ratioBoxes(a.byId)[k].checked));
  ok('16:9 is gone', optionRows(a.byId.dsSizeSel).every((r) => r[2] !== '1920x1080'));
  eq('the editing size is the first offered', a.byId.dsSizeSel.value, '1080x1920');

  // ---- the guide shows what the offered ratios have in common ----
  const guide = commonGuide(a.byId);
  ok('the canvas marks the area common to all three', !!guide);
  const canvasW = parseInt(a.byId.dsCanvas.style.width, 10);
  ok('and it is the square they share (' + (guide && guide.style.height) + ')',
     guide && parseInt(guide.style.width, 10) === canvasW
       && Math.abs(parseInt(guide.style.height, 10) - canvasW) <= 1);

  // ---- the operator chooses which ratios a design is shared at ----
  const b = load(ids);
  await settle();
  b.renders.length = 0;
  tick(ratioBoxes(b.byId)['1080x1350'], false);
  await settle();
  eq('unticking a ratio stops it being offered', sent(b).template.sizes, ['1080x1920', '1080x1080']);
  tick(ratioBoxes(b.byId)['1080x1080'], false);
  await settle();
  eq('and unticking another leaves just the one', sent(b).template.sizes, ['1080x1920']);
  ok('with one ratio there is nothing to mark in common', !commonGuide(b.byId));
  eq('the Size list follows what is offered', optionRows(b.byId.dsSizeSel).map((r) => r[2]), ['1080x1920']);

  // ---- the last ratio cannot be removed ----
  const before = JSON.stringify(sent(b).template.sizes);
  b.renders.length = 0;
  tick(ratioBoxes(b.byId)['1080x1920'], false);
  await settle();
  ok('the last ratio is refused, with a reason', /at least one ratio/.test(b.byId.dsErr.textContent));
  ok('the tick goes back', ratioBoxes(b.byId)['1080x1920'].checked);
  ok('nothing was re-rendered for a refusal', b.renders.length === 0);
  eq('and the design still offers what it did', before, JSON.stringify(['1080x1920']));

  // ---- ticking one back adds it in SHAPES order, not click order ----
  b.renders.length = 0;
  tick(ratioBoxes(b.byId)['1080x1080'], true);
  await settle();
  tick(ratioBoxes(b.byId)['1080x1350'], true);
  await settle();
  eq('the offered list stays in ratio order, so the share default is stable',
     sent(b).template.sizes, ['1080x1920', '1080x1350', '1080x1080']);

  // ---- undo treats a ratio change like any other change ----
  b.byId.dsUndoBtn.fire('click');
  await settle();
  eq('undo puts the previous set back',
     optionRows(b.byId.dsSizeSel).map((r) => r[2]), ['1080x1920', '1080x1080']);

  // ---- the Size select only changes the view ----
  const c = load(ids);
  await settle();
  c.renders.length = 0;
  c.byId.dsSizeSel.value = '1080x1080';
  c.byId.dsSizeSel.fire('change');
  await settle();
  eq('it renders at the ratio you are laying out on', sent(c).size, '1080x1080');
  eq('and leaves what the design offers alone',
     sent(c).template.sizes, ['1080x1920', '1080x1350', '1080x1080']);
  ok('the canvas is square while editing 1:1',
     parseInt(c.byId.dsCanvas.style.width, 10) === parseInt(c.byId.dsCanvas.style.height, 10));

  // ---- a 9:16 canvas still has to fit on screen ----
  const d = load(ids);
  await settle();
  tick(ratioBoxes(d.byId)['1080x1350'], false);
  await settle();
  tick(ratioBoxes(d.byId)['1080x1080'], false);
  await settle();
  const h = parseInt(d.byId.dsCanvas.style.height, 10);
  const w = parseInt(d.byId.dsCanvas.style.width, 10);
  ok('a 9:16 canvas is 9:16 (' + w + 'x' + h + ')', Math.abs(h / w - 1920 / 1080) < 0.02);
  ok('and fits the viewport (' + h + 'px of 900)', h <= 900 * 0.72 + 1);

  // ---- a size a saved design declares that is not one of the three is kept, and can be dropped
  const legacy = [{
    id: 'old-wide', name: 'Old wide', body: {
      id: 'old-wide', name: 'Old wide', sizes: ['1920x1080', '1080x1080'],
      background: { color: '#070E28' }, placeholders: [],
    },
  }];
  const e = load(ids, { templates: legacy });
  await settle();
  e.byId.dsTemplateSel.value = 'old-wide';
  e.byId.dsTemplateSel.fire('change');
  await settle();
  eq('a non-standard size it already declares is still offered and listed last',
     optionRows(e.byId.dsSizeSel).map((r) => r[2]), ['1080x1080', '1920x1080']);
  ok('it reads as its own ratio',
     optionRows(e.byId.dsSizeSel).some((r) => r[1] === '16:9 \u00b7 1920\u00d71080'));
  e.renders.length = 0;
  tick(ratioBoxes(e.byId)['1920x1080'], false);
  await settle();
  eq('and it can be dropped', sent(e).template.sizes, ['1080x1080']);

  ok('nothing was saved by any of this',
     [a, b, c, d, e].every((run) => run.saved.length === 0));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
