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
        if (this.tagName === 'SELECT' && (c.tagName === 'OPTION' || c.tagName === 'OPTGROUP')) this.options.push(c);
        return c;
      },
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
(async function main() {
  const ids = servedIds();
  ok('the served page has the Size select', ids.has('dsSizeSel'));

  // ---- the shapes on offer ----
  const a = load(ids);
  await settle();
  const sel = a.byId.dsSizeSel;
  const rows = optionRows(sel);
  eq('a blank design is square, and the other shapes are offered',
     rows,
     [['This design', '1:1 square · 1080×1080', '1080x1080'],
      ['Redesign at', '9:16 story · 1080×1920', '1080x1920'],
      ['Redesign at', '4:5 portrait · 1080×1350', '1080x1350'],
      ['Redesign at', '16:9 wide · 1920×1080', '1920x1080']]);
  ok('every label leads with its ratio', rows.every((r) => /^\d+:\d+ /.test(r[1])));
  eq('the selected size is the one being designed', sel.value, '1080x1080');

  // ---- picking a shape the design was not drawn for retargets it ----
  const b = load(ids);
  await settle();
  b.renders.length = 0;
  b.byId.dsSizeSel.value = '1080x1920';
  b.byId.dsSizeSel.fire('change');
  await settle();
  const sent = b.renders[b.renders.length - 1];
  eq('the preview is asked for at the new size', sent && sent.size, '1080x1920');
  eq('the design now declares that one shape only', sent && sent.template.sizes, ['1080x1920']);
  ok('it says what happened', /9:16 story/.test(b.byId.dsMsg.textContent));
  const canvas = b.byId.dsCanvas;
  const w = parseInt(canvas.style.width, 10), h = parseInt(canvas.style.height, 10);
  ok('the canvas is 9:16 (' + w + 'x' + h + ')', Math.abs(h / w - 1920 / 1080) < 0.02);
  ok('a 9:16 canvas still fits the viewport (' + h + 'px of 900)', h <= 900 * 0.72 + 1);
  eq('the list now reads 9:16 as this design',
     optionRows(b.byId.dsSizeSel).filter((r) => r[0] === 'This design'),
     [['This design', '9:16 story · 1080×1920', '1080x1920']]);

  // ---- undo puts the old shape back, since retargeting is a change like any other ----
  // (Asserted on the editor, not the preview: undo() re-paints but leaves the preview until the
  // next change or Refresh, which is how it behaved before this.)
  b.byId.dsUndoBtn.fire('click');
  await settle();
  eq('undo returns the design to 1:1',
     optionRows(b.byId.dsSizeSel).filter((r) => r[0] === 'This design').map((r) => r[2]),
     ['1080x1080']);
  ok('and the canvas is square again',
     parseInt(b.byId.dsCanvas.style.width, 10) === parseInt(b.byId.dsCanvas.style.height, 10));

  // ---- a size the design already declares is only a view switch ----
  const multi = [{
    id: 'both', name: 'Both shapes', body: {
      id: 'both', name: 'Both shapes', sizes: ['1080x1080', '1080x1920'],
      background: { color: '#070E28' }, placeholders: [],
    },
  }];
  const c = load(ids, { templates: multi });
  await settle();
  c.byId.dsTemplateSel.value = 'both';
  c.byId.dsTemplateSel.fire('change');
  await settle();
  eq('both declared shapes are listed as this design',
     optionRows(c.byId.dsSizeSel).filter((r) => r[0] === 'This design').map((r) => r[2]),
     ['1080x1080', '1080x1920']);
  c.renders.length = 0;
  c.byId.dsSizeSel.value = '1080x1920';
  c.byId.dsSizeSel.fire('change');
  await settle();
  const view = c.renders[c.renders.length - 1];
  eq('switching to a declared shape renders at it', view && view.size, '1080x1920');
  eq('and leaves the allow-list alone', view && view.template.sizes, ['1080x1080', '1080x1920']);
  ok('nothing was saved by any of this', c.saved.length === 0 && a.saved.length === 0 && b.saved.length === 0);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
