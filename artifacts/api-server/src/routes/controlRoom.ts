import { Router, type IRouter } from "express";

const router: IRouter = Router();

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EJazz Pulse — Control Room</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    background: #0d0714; color: #f2eef5; min-height: 100vh;
  }
  header {
    padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.08);
    display:flex; align-items:center; justify-content:space-between;
  }
  header .brand { font-weight: 800; letter-spacing: 0.5px; }
  header .brand span { color: #e0304a; }
  button {
    background: #e0304a; color: #fff; border: none; border-radius: 7px;
    padding: 8px 14px; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  button.secondary { background: transparent; border: 1px solid rgba(255,255,255,0.25); color: #f2eef5; }
  button:disabled { opacity: 0.5; cursor: default; }
  #loginView { max-width: 340px; margin: 80px auto; padding: 0 16px; }
  #loginView input {
    width: 100%; padding: 10px 12px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.2);
    background: #1a1024; color: #fff; margin: 10px 0; font-size: 14px;
  }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px 16px; display: none; }
  h2 { font-size: 15px; color: #ff5f70; letter-spacing: 0.3px; margin: 28px 0 10px 0; }
  .card {
    background: #170f21; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px;
  }
  .field { margin-bottom: 12px; }
  .field label { display:block; font-size: 11.5px; color: #b8aec4; margin-bottom: 4px; font-weight: 700; }
  .field input, .field select, .field textarea {
    width: 100%; padding: 9px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15);
    background: #0d0714; color: #fff; font-size: 13.5px; font-family: inherit;
  }
  .row { display:flex; gap: 12px; }
  .row > .field { flex: 1; }
  .checkbox { display:flex; align-items:center; gap:8px; font-size: 13px; }
  .checkbox input { width: auto; }
  .items { display:flex; flex-direction:column; gap: 10px; margin-top: 10px; }
  .item {
    border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; padding: 12px 14px;
    display:flex; justify-content:space-between; align-items:flex-start; gap: 12px;
  }
  .item .meta { font-size: 11px; color: #8a8195; margin-top: 3px; }
  .badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 5px; text-transform: uppercase; }
  .badge.live { background: rgba(56,200,120,0.18); color: #48d68a; }
  .badge.draft { background: rgba(255,255,255,0.1); color: #cfc7d6; }
  .badge.withdrawn { background: rgba(255,255,255,0.06); color: #7a7285; }
  .badge.expired { background: rgba(255,255,255,0.06); color: #7a7285; }
  .actions { display:flex; gap: 6px; flex-shrink: 0; }
  .err { color: #ff6b7a; font-size: 12.5px; margin-top: 6px; min-height: 16px; }
  .empty { color: #8a8195; font-size: 13px; padding: 10px 2px; }
  nav.tabs { display:flex; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
  nav.tabs button { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cfc7d6; }
  nav.tabs button.active { background: #e0304a; border-color: #e0304a; color: #fff; }
  .panel { display: none; }
  .panel.active { display: block; }
  h3 { font-size: 13.5px; margin: 0 0 4px 0; color: #f2eef5; }
  .hint { font-size: 12px; color: #8a8195; margin: 0 0 12px 0; line-height: 1.45; }
  .section { margin-bottom: 14px; }
  .okmsg { color: #a7f3d0; font-size: 12.5px; margin-top: 6px; min-height: 16px; }
</style>
</head>
<body>

<header>
  <div class="brand">EJAZZ <span>PULSE</span> — Control Room</div>
  <button class="secondary" id="logoutBtn" style="display:none;">Log out</button>
</header>

<div id="loginView">
  <div class="card">
    <div class="field">
      <label>Admin password</label>
      <input type="password" id="passwordInput" autocomplete="current-password">
    </div>
    <button id="loginBtn" style="width:100%;">Log in</button>
    <div class="err" id="loginErr"></div>
  </div>
</div>

<main id="mainView">
  <nav class="tabs">
    <button class="tabBtn active" data-panel="panel-content">Content &amp; push</button>
    <button class="tabBtn" data-panel="panel-controls">App controls</button>
    <button class="tabBtn" data-panel="panel-schedule">Programme schedule</button>
    <button class="tabBtn" data-panel="panel-notifications">Notifications</button>
  </nav>

  <section id="panel-content" class="panel active">
  <h2>Create content</h2>
  <div class="card">
    <div class="row">
      <div class="field">
        <label>Type</label>
        <select id="f_type">
          <option value="fact">Fact (Clock It)</option>
          <option value="poll">Poll (Aura Check)</option>
          <option value="announcement">Announcement</option>
          <option value="quiz">Quiz</option>
          <option value="song_battle">Song battle</option>
          <option value="push_alert">Push alert</option>
          <option value="show_alert">Show alert</option>
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="f_status">
          <option value="draft">Draft</option>
          <option value="live" selected>Publish now (Live)</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Title</label>
      <input type="text" id="f_title" placeholder="e.g. Asake just teased a new single">
    </div>
    <div class="field">
      <label>Body</label>
      <textarea id="f_body" rows="3" placeholder="The actual content..."></textarea>
    </div>
    <div class="field" id="pickerBox">
      <label>Fill from the station</label>
      <p class="hint" id="pickerHint" style="margin:0 0 8px;">Pick something already produced on the dashboard instead of typing it. You can still edit every field afterwards.</p>
      <div class="row">
        <div class="field">
          <select id="p_element"><option value="">Content element…</option></select>
        </div>
        <div class="field">
          <select id="p_chart"><option value="">Chart…</option></select>
        </div>
      </div>
      <div class="field" id="p_songWrap" style="display:none;">
        <select id="p_song"><option value="">Song from that chart…</option></select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Related artist</label><input type="text" id="f_artist"></div>
      <div class="field"><label>Related song</label><input type="text" id="f_song"></div>
    </div>
    <div class="row">
      <div class="field"><label>Related show</label><input type="text" id="f_show"></div>
      <div class="field"><label>Related station</label><input type="text" id="f_station"></div>
    </div>
    <div class="field" id="pollOptionsField" style="display:none;">
      <label id="pollOptionsLabel">Poll options (comma-separated)</label>
      <input type="text" id="f_pollOptions" placeholder="Asake, Rema, Burna Boy, Wizkid">
    </div>
    <div class="field" id="quizAnswerField" style="display:none;">
      <label for="f_quizCorrect">Correct answer (which option number, starting at 1)</label>
      <input type="text" id="f_quizCorrect" placeholder="1">
    </div>
    <div class="checkbox">
      <input type="checkbox" id="f_push">
      <label for="f_push" style="margin:0;">Send push notification</label>
    </div>
    <div class="field" id="pushTopicField" style="display:none; margin-top:10px;">
      <label for="f_pushTopic">Notification audience</label>
      <select id="f_pushTopic">
        <option value="all">All listeners</option>
        <option value="radio">EJazz Radio</option>
        <option value="xtra">EJazz Xtra</option>
      </select>
    </div>
    <div class="field" style="margin-top:10px;">
      <label for="f_schedule">Send later (optional) - saves as a draft and publishes + sends the push at this time</label>
      <input type="datetime-local" id="f_schedule">
    </div>
    <div style="margin-top:14px;">
      <button id="createBtn">Create</button>
    </div>
    <div class="err" id="createErr"></div>
  </div>

  <h2>Live &amp; Draft content</h2>
  <div class="items" id="itemsList"><div class="empty">Loading…</div></div>
  </section>

  <section id="panel-controls" class="panel">
    <h2>App controls</h2>
    <p class="hint">Changes reach phones the next time the app opens (or returns to the foreground). Controls need the app version built with remote controls; older installs ignore them.</p>
    <div id="controlsForm"></div>
    <div style="margin-top:14px;">
      <button id="saveControlsBtn">Save app controls</button>
    </div>
    <div class="okmsg" id="controlsMsg"></div>
  </section>

  <section id="panel-schedule" class="panel">
    <h2>Programme schedule</h2>
    <p class="hint">Drives "Live now / Next / Later" on the app Home. Times are East Africa Time. Add one row per show per day.</p>
    <div class="card">
      <div class="row">
        <div class="field"><label>Show name</label><input type="text" id="s_name"></div>
        <div class="field"><label>Host</label><input type="text" id="s_host"></div>
      </div>
      <div class="row">
        <div class="field"><label>Station</label>
          <select id="s_station"><option value="radio">EJazz Radio</option><option value="xtra">EJazz Xtra</option></select>
        </div>
        <div class="field"><label>Day</label>
          <select id="s_day">
            <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option>
            <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Starts</label><input type="time" id="s_start"></div>
        <div class="field"><label>Ends</label><input type="time" id="s_end"></div>
      </div>
      <div class="field"><label>Description (optional)</label><input type="text" id="s_desc"></div>
      <button id="addShowBtn">Add show</button>
      <div class="err" id="showErr"></div>
    </div>
    <div class="items" id="showsList"><div class="empty">Loading…</div></div>
  </section>

  <section id="panel-notifications" class="panel">
    <h2>Notifications</h2>
    <div class="card">
      <p class="meta" style="margin:0 0 10px;">
        Every push that was actually sent. <strong>Retract</strong> stops the notification
        showing in the app for everyone — it does not recall a message already delivered to a
        phone's tray, which nothing can.
        <strong>Delete</strong> only removes the row from this log and changes nothing on any device.
      </p>
      <button id="clearNotifsBtn" class="secondary">Clear all</button>
      <div class="err" id="notifErr"></div>
    </div>
    <div class="items" id="notifList"><div class="empty">Loading…</div></div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);

function api(path, opts) {
  return fetch('/api/admin' + path, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts))
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body && body.error && JSON.stringify(body.error)) || ('HTTP ' + r.status));
      return body;
    });
}

async function checkSession() {
  const s = await api('/session', { method: 'GET' });
  if (s.authenticated) {
    // Confirm the cookie actually still verifies against a protected route
    try {
      await loadItems();
      showMain();
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  $('loginView').style.display = 'block';
  $('mainView').style.display = 'none';
  $('logoutBtn').style.display = 'none';
}
function showMain() {
  $('loginView').style.display = 'none';
  $('mainView').style.display = 'block';
  $('logoutBtn').style.display = 'inline-block';
  // Fire and forget: the picker is an optional convenience, so a dashboard that is down
  // must not block the Content & push form from being usable.
  void loadPickers();
}

$('loginBtn').addEventListener('click', async () => {
  $('loginErr').textContent = '';
  try {
    await api('/login', { method: 'POST', body: JSON.stringify({ password: $('passwordInput').value }) });
    $('passwordInput').value = '';
    await loadItems();
    showMain();
  } catch (e) {
    $('loginErr').textContent = 'Wrong password.';
  }
});

$('passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });

$('logoutBtn').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  showLogin();
});

// poll, quiz and song_battle all need a list of options; only a quiz has a correct answer.
const OPTION_TYPES = ['poll', 'quiz', 'song_battle'];
const OPTION_LABELS = {
  poll: 'Poll options (comma-separated)',
  quiz: 'Answer options (comma-separated)',
  song_battle: 'The two songs (comma-separated)',
};
$('f_type').addEventListener('change', () => {
  const t = $('f_type').value;
  const needsOptions = OPTION_TYPES.indexOf(t) !== -1;
  $('pollOptionsField').style.display = needsOptions ? 'block' : 'none';
  $('quizAnswerField').style.display = t === 'quiz' ? 'block' : 'none';
  if (needsOptions) $('pollOptionsLabel').textContent = OPTION_LABELS[t];
  $('f_pollOptions').placeholder = t === 'song_battle' ? 'Song A, Song B' : 'Asake, Rema, Burna Boy, Wizkid';
});

// ---------- picker: content elements and charts from the Flask dashboard ----------
// Same origin (ejazz-proxy forwards anything it does not claim to Flask on 9000), so these
// are plain relative fetches with no CORS and no second host to configure. The four text
// fields below stay the source of truth: the picker only fills them in, and if either fetch
// fails the picker hides itself and the fields are simply typed by hand as before.
let chartCache = {};

function pickerFailed(what) {
  const hint = $('pickerHint');
  hint.textContent = 'Could not reach the dashboard (' + what + '). Type the fields in by hand.';
  hint.style.color = '#fca5a5';
}

async function loadPickers() {
  try {
    const d = await fetch('/api/content-elements').then((r) => r.json());
    const sel = $('p_element');
    (d.items || []).forEach((it) => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.title + (it.station ? ' — ' + it.station : '');
      o.dataset.payload = JSON.stringify(it);
      sel.appendChild(o);
    });
    if (!(d.items || []).length) sel.options[0].textContent = 'No content elements yet';
  } catch (e) {
    $('p_element').style.display = 'none';
    pickerFailed('content elements');
  }

  try {
    const d = await fetch('/api/charts').then((r) => r.json());
    const sel = $('p_chart');
    (d.items || []).forEach((c) => {
      chartCache[c.id] = c;
      const o = document.createElement('option');
      o.value = c.id;
      const when = c.date ? new Date(c.date).toLocaleDateString() : '';
      o.textContent = (c.title || 'Untitled chart') + (when ? ' — ' + when : '') + ' (' + (c.entries || []).length + ')';
      sel.appendChild(o);
    });
    if (!(d.items || []).length) sel.options[0].textContent = 'No charts yet';
  } catch (e) {
    $('p_chart').style.display = 'none';
    $('p_songWrap').style.display = 'none';
    pickerFailed('charts');
  }
}

$('p_element').addEventListener('change', () => {
  const opt = $('p_element').selectedOptions[0];
  if (!opt || !opt.dataset.payload) return;
  const it = JSON.parse(opt.dataset.payload);
  if (!$('f_title').value) $('f_title').value = it.title || '';
  if (!$('f_body').value) $('f_body').value = it.body || '';
  if (it.station) $('f_station').value = it.station;
});

$('p_chart').addEventListener('change', () => {
  const chart = chartCache[$('p_chart').value];
  const wrap = $('p_songWrap');
  const sel = $('p_song');
  sel.innerHTML = '<option value="">Song from that chart…</option>';
  if (!chart) { wrap.style.display = 'none'; return; }
  (chart.entries || []).forEach((e, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = (e.position != null ? e.position + '. ' : '') + e.title + (e.artist ? ' — ' + e.artist : '');
    sel.appendChild(o);
  });
  wrap.style.display = (chart.entries || []).length ? 'block' : 'none';
});

$('p_song').addEventListener('change', () => {
  const chart = chartCache[$('p_chart').value];
  const idx = Number($('p_song').value);
  if (!chart || !chart.entries || !chart.entries[idx]) return;
  const e = chart.entries[idx];
  $('f_song').value = e.title || '';
  $('f_artist').value = e.artist || '';
});

function showPushDelivery(delivery) {
  if (!delivery) return;
  $('createErr').style.color = delivery.sent ? '#a7f3d0' : '#fca5a5';
  $('createErr').textContent = delivery.error ||
    ('FCM notification sent to the "' + delivery.topic + '" topic.');
}

$('f_push').addEventListener('change', () => {
  $('pushTopicField').style.display = $('f_push').checked ? 'block' : 'none';
});

$('createBtn').addEventListener('click', async () => {
  $('createErr').textContent = '';
  const type = $('f_type').value;
  const payload = {
    type,
    status: $('f_status').value,
    title: $('f_title').value,
    body: $('f_body').value || null,
    relatedArtist: $('f_artist').value || null,
    relatedSong: $('f_song').value || null,
    relatedShow: $('f_show').value || null,
    relatedStation: $('f_station').value || null,
    pushEnabled: $('f_push').checked,
    pushTopic: $('f_pushTopic').value,
    placement: 'home',
  };
  if ($('f_schedule').value) {
    payload.status = 'draft';
    payload.scheduleAt = localToIso($('f_schedule').value);
  }
  if (OPTION_TYPES.indexOf(type) !== -1) {
    const opts = $('f_pollOptions').value.split(',').map((s) => s.trim()).filter(Boolean);
    const least = type === 'song_battle' ? 2 : 2;
    if (opts.length < least) {
      $('createErr').textContent = type === 'song_battle'
        ? 'A song battle needs two songs, separated by a comma.'
        : 'Add at least 2 options.';
      return;
    }
    if (type === 'song_battle' && opts.length !== 2) {
      $('createErr').textContent = 'A song battle takes exactly two songs.';
      return;
    }
    payload.pollOptions = opts.map((label) => ({ label, votes: 0 }));
    if (type === 'quiz') {
      const n = Number($('f_quizCorrect').value);
      if (!Number.isInteger(n) || n < 1 || n > opts.length) {
        $('createErr').textContent = 'Give the correct answer as a number between 1 and ' + opts.length + '.';
        return;
      }
      payload.quizCorrectIndex = n - 1;   // stored zero-based; typed one-based
    }
  }
  if (!payload.title) {
    $('createErr').textContent = 'Title is required.';
    return;
  }
  try {
    const created = await api('/content', { method: 'POST', body: JSON.stringify(payload) });
    showPushDelivery(created.pushDelivery);
    $('f_title').value = ''; $('f_body').value = ''; $('f_artist').value = '';
    $('f_song').value = ''; $('f_show').value = ''; $('f_station').value = '';
    $('f_pollOptions').value = ''; $('f_push').checked = false; $('f_schedule').value = '';
    $('f_quizCorrect').value = '';
    $('p_element').value = ''; $('p_chart').value = ''; $('p_songWrap').style.display = 'none';
    $('pushTopicField').style.display = 'none';
    await loadItems();
  } catch (e) {
    $('createErr').textContent = 'Could not create: ' + e.message;
  }
});

async function setStatus(id, status) {
  const result = await api('/content/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
  showPushDelivery(result.pushDelivery);
  await loadItems();
}

async function loadItems() {
  const items = await api('/content', { method: 'GET' });
  const list = $('itemsList');
  if (!items.length) {
    list.innerHTML = '<div class="empty">Nothing yet — create something above.</div>';
    return;
  }
  list.innerHTML = items.map((item) => {
    const meta = [item.type, item.relatedArtist, item.relatedSong,
      item.scheduleAt && item.status === 'draft' ? 'scheduled ' + new Date(item.scheduleAt).toLocaleString() : '',
      item.pushSentAt ? 'push sent ' + new Date(item.pushSentAt).toLocaleString() + ' (' + item.pushTopic + ')' : ''
    ].filter(Boolean).join(' · ');
    const actions = [];
    if (item.status !== 'live') actions.push('<button data-id="' + item.id + '" data-status="live" class="setStatus">Publish</button>');
    if (item.status === 'live') actions.push('<button data-id="' + item.id + '" data-status="withdrawn" class="secondary setStatus">Withdraw</button>');
    return '<div class="item">' +
      '<div><div><strong>' + escapeHtml(item.title) + '</strong> <span class="badge ' + item.status + '">' + item.status + '</span></div>' +
      '<div class="meta">' + escapeHtml(meta) + '</div></div>' +
      '<div class="actions">' + actions.join('') + '</div></div>';
  }).join('');
  document.querySelectorAll('.setStatus').forEach((btn) => {
    btn.addEventListener('click', () => setStatus(btn.getAttribute('data-id'), btn.getAttribute('data-status')));
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- notifications ----------
// api() above is hardcoded to the /api/admin prefix; the notification routes live at
// /api/notifications (the app reads the public one), so they need their own caller.
function apiRoot(path, opts) {
  return fetch('/api' + path, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts))
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body && body.error) || ('HTTP ' + r.status));
      return body;
    });
}

async function loadNotifications() {
  const list = $('notifList');
  $('notifErr').textContent = '';
  try {
    const data = await apiRoot('/notifications/admin', { method: 'GET' });
    const rows = data.notifications || [];
    if (!rows.length) {
      list.innerHTML = '<div class="empty">Nothing sent yet.</div>';
      return;
    }
    list.innerHTML = rows.map((n) => {
      const retracted = Boolean(n.retractedAt);
      const expired = n.expiresAt && new Date(n.expiresAt) <= new Date();
      const meta = [
        'to ' + n.topic,
        'sent ' + new Date(n.sentAt).toLocaleString(),
        n.expiresAt ? (expired ? 'expired ' : 'expires ') + new Date(n.expiresAt).toLocaleString() : '',
        retracted ? 'RETRACTED ' + new Date(n.retractedAt).toLocaleString() : '',
      ].filter(Boolean).join(' · ');
      const actions = retracted
        ? '<button data-id="' + n.id + '" class="secondary notifUnretract">Un-retract</button>'
        : '<button data-id="' + n.id + '" class="secondary notifRetract">Retract</button>';
      return '<div class="item">' +
        '<div><div><strong>' + escapeHtml(n.title) + '</strong>' +
        (retracted ? ' <span class="badge withdrawn">retracted</span>' : '') +
        (expired && !retracted ? ' <span class="badge expired">expired</span>' : '') +
        '</div><div class="meta">' + escapeHtml(meta) + '</div></div>' +
        '<div class="actions">' + actions +
        '<button data-id="' + n.id + '" class="secondary notifDelete">Delete</button></div></div>';
    }).join('');

    document.querySelectorAll('.notifRetract').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Retract this notification? It will disappear from the app for everyone. Already-delivered phone alerts cannot be recalled.')) return;
      await notifAction('/notifications/' + b.getAttribute('data-id') + '/retract', { method: 'POST' });
    }));
    document.querySelectorAll('.notifUnretract').forEach((b) => b.addEventListener('click', async () => {
      await notifAction('/notifications/' + b.getAttribute('data-id') + '/unretract', { method: 'POST' });
    }));
    document.querySelectorAll('.notifDelete').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete from this log only? Devices that already have it keep it — use Retract to hide it in the app.')) return;
      await notifAction('/notifications/' + b.getAttribute('data-id'), { method: 'DELETE' });
    }));
  } catch (e) {
    list.innerHTML = '<div class="empty">Could not load the log.</div>';
    $('notifErr').textContent = e.message;
  }
}

async function notifAction(path, opts) {
  try {
    await apiRoot(path, opts);
    await loadNotifications();
  } catch (e) {
    $('notifErr').textContent = e.message;
  }
}

$('clearNotifsBtn').addEventListener('click', async () => {
  // Build the line break with String.fromCharCode(10) rather than a backslash escape.
  // This whole page is a template literal, so a backslash escape is consumed when the
  // HTML is built and reaches the browser as a real newline inside a quoted string --
  // a SyntaxError that kills the entire script, every listener on the page included.
  // That applies in comments too, which is why this one spells none of it literally.
  // Same reason the podcasts section above uses this idiom.
  const br = String.fromCharCode(10);
  const warning = 'Clear the entire notification log?' + br + br
    + 'This only empties this list. It does not retract anything — a retracted notification '
    + 'that is deleted here becomes visible in the app again. Retract first, then clear.';
  if (!confirm(warning)) return;
  await notifAction('/notifications?confirm=yes', { method: 'DELETE' });
});

// ---------- tabs ----------
document.querySelectorAll('.tabBtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabBtn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(btn.getAttribute('data-panel')).classList.add('active');
    if (btn.getAttribute('data-panel') === 'panel-controls') loadControls();
    if (btn.getAttribute('data-panel') === 'panel-schedule') loadShows();
    if (btn.getAttribute('data-panel') === 'panel-notifications') loadNotifications();
  });
});

function pad2(n) { return String(n).padStart(2, '0'); }
function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function localToIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function getPath(o, p) { return p.split('.').reduce((a, k) => (a ? a[k] : undefined), o); }
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => { if (!a[k] || typeof a[k] !== 'object') a[k] = {}; return a[k]; }, o);
  t[last] = v;
}

// ---------- app controls ----------
// field = [path, type, label]; type: bool | text | textarea | datetime
const CONTROL_SECTIONS = [
  { title: 'Feature switches', hint: 'Turn parts of the app on or off without a new release. Use these as a kill switch if a section misbehaves.', fields: [
    ['features.news', 'bool', 'News tab'],
    ['features.podcasts', 'bool', 'Podcasts'],
    ['features.songRequests', 'bool', 'Song requests (both stations)'],
    ['features.share', 'bool', 'Share buttons'],
    ['features.pulse', 'bool', 'EJazz Pulse cards on Home'],
    ['features.schedule', 'bool', '"Coming Up" programme on Home'],
  ] },
  { title: 'Song requests', hint: 'Open or close requests per station.', fields: [
    ['songRequests.radioEnabled', 'bool', 'EJazz Radio requests open'],
    ['songRequests.xtraEnabled', 'bool', 'EJazz Xtra requests open'],
    ['songRequests.closedMessage', 'text', 'Message shown when closed'],
  ] },
  { title: 'Updates & maintenance', hint: 'Maintenance mode blocks the whole app with your message. Minimum version forces older apps to update; latest version only shows a dismissible banner. Versions look like 2.0.5.', fields: [
    ['maintenance.enabled', 'bool', 'Maintenance mode ON (blocks the app)'],
    ['maintenance.title', 'text', 'Maintenance title'],
    ['maintenance.message', 'textarea', 'Maintenance message'],
    ['update.minVersion', 'text', 'Minimum version (older apps must update)'],
    ['update.latestVersion', 'text', 'Latest version (older apps see a banner)'],
    ['update.message', 'text', 'Update message'],
    ['update.storeUrl', 'text', 'Play Store link (https://...)'],
  ] },
  { title: 'Live streams', hint: 'Leave blank to use the stream built into the app. The backup is tried automatically if the main stream keeps failing. Changing a link here moves every phone, so double-check it plays.', fields: [
    ['streams.radio.url', 'text', 'EJazz Radio stream URL'],
    ['streams.radio.backupUrl', 'text', 'EJazz Radio backup stream URL'],
    ['streams.xtra.url', 'text', 'EJazz Xtra stream URL'],
    ['streams.xtra.backupUrl', 'text', 'EJazz Xtra backup stream URL'],
  ] },
  { title: 'Featured on Home', hint: 'A highlighted card under the Home headline.', fields: [
    ['featured.enabled', 'bool', 'Show featured card'],
    ['featured.kicker', 'text', 'Small label (e.g. FEATURED, NEW SHOW)'],
    ['featured.title', 'text', 'Title'],
    ['featured.body', 'textarea', 'Text'],
    ['featured.imageUrl', 'text', 'Image URL (https://...)'],
    ['featured.linkUrl', 'text', 'Link when tapped (https://...)'],
    ['featured.startAt', 'datetime', 'Show from (optional)'],
    ['featured.endAt', 'datetime', 'Hide after (optional)'],
  ] },
  { title: 'Promo banner', hint: 'A message strip at the top of Home for events, contests and campaigns.', fields: [
    ['banner.enabled', 'bool', 'Show banner'],
    ['banner.title', 'text', 'Title'],
    ['banner.message', 'textarea', 'Message'],
    ['banner.imageUrl', 'text', 'Image URL (optional)'],
    ['banner.linkUrl', 'text', 'Link when tapped (optional)'],
    ['banner.dismissible', 'bool', 'Listeners can dismiss it'],
    ['banner.startAt', 'datetime', 'Show from (optional)'],
    ['banner.endAt', 'datetime', 'Hide after (optional)'],
  ] },
  { title: 'Sponsor slot', hint: 'A sponsor image on Home. Always labelled so listeners know it is sponsored.', fields: [
    ['sponsor.enabled', 'bool', 'Show sponsor slot'],
    ['sponsor.label', 'text', 'Label (e.g. SPONSORED)'],
    ['sponsor.imageUrl', 'text', 'Sponsor image URL (https://...)'],
    ['sponsor.linkUrl', 'text', 'Link when tapped (https://...)'],
    ['sponsor.startAt', 'datetime', 'Show from (optional)'],
    ['sponsor.endAt', 'datetime', 'Hide after (optional)'],
  ] },
  { title: 'Contact & social links', hint: 'Shown in the More tab. Leave blank to keep the app defaults. Only https links are accepted.', fields: [
    ['links.contactEmail', 'text', 'Contact email'],
    ['links.instagramUrl', 'text', 'Instagram link'],
    ['links.whatsappUrl', 'text', 'WhatsApp link (https://wa.me/...)'],
    ['links.websiteUrl', 'text', 'Website link'],
    ['links.privacyUrl', 'text', 'Privacy policy link'],
    ['links.termsUrl', 'text', 'Terms link'],
    ['links.shareText', 'text', 'Text added when listeners share a station'],
  ] },
];

let controlsConfig = null;
const fid = (path) => 'cfg_' + path.split('.').join('_');

function renderControls() {
  const host = $('controlsForm');
  host.innerHTML = CONTROL_SECTIONS.map((sec) => {
    const fields = sec.fields.map((f) => {
      const id = fid(f[0]);
      if (f[1] === 'bool') {
        return '<div class="checkbox" style="margin-bottom:10px;"><input type="checkbox" id="' + id + '"><label for="' + id + '" style="margin:0;">' + escapeHtml(f[2]) + '</label></div>';
      }
      if (f[1] === 'textarea') {
        return '<div class="field"><label for="' + id + '">' + escapeHtml(f[2]) + '</label><textarea id="' + id + '" rows="2"></textarea></div>';
      }
      const type = f[1] === 'datetime' ? 'datetime-local' : 'text';
      return '<div class="field"><label for="' + id + '">' + escapeHtml(f[2]) + '</label><input type="' + type + '" id="' + id + '"></div>';
    }).join('');
    return '<div class="card section"><h3>' + escapeHtml(sec.title) + '</h3><p class="hint">' + escapeHtml(sec.hint) + '</p>' + fields + '</div>';
  }).join('') +
    '<div class="card section"><h3>Podcasts</h3><p class="hint">One show per line: Name | feed link. Leave empty to keep the podcasts built into the app. Up to 12.</p>' +
    '<div class="field"><textarea id="cfg_podcasts" rows="4" placeholder="The Xtreme BPM | https://anchor.fm/s/281a6d78/podcast/rss"></textarea></div></div>' +
    funFactsSectionHtml();
}

function funFactsSectionHtml() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBoxes = days.map((d, i) =>
    '<label style="margin-right:12px;white-space:nowrap;"><input type="checkbox" class="ffDay" value="' + i + '"> ' + d + '</label>'
  ).join('');
  return '<div class="card section"><h3>Automatic fun facts</h3>' +
    '<p class="hint">Writes a fact with AI and pushes it, at the dayparts you tick. The time of day and the weekday are given to the AI as context, so a drive-time fact reads differently from a morning one. ' +
    'A fact is only ever created together with its push — if the push fails the fact is withdrawn, never left sitting silently.</p>' +
    '<div class="checkbox" style="margin-bottom:10px;"><input type="checkbox" id="cfg_ff_enabled"><label for="cfg_ff_enabled" style="margin:0;">Automatic fun facts ON</label></div>' +
    '<div class="field"><label>Days</label><div id="ffDays" style="padding:4px 0;">' + dayBoxes + '</div>' +
    '<p class="hint" style="margin-top:4px;">Tick none to run every day.</p></div>' +
    '<div class="field"><label for="cfg_ff_topic">Push audience</label><select id="cfg_ff_topic">' +
    '<option value="all">All listeners</option><option value="radio">EJazz Radio</option><option value="xtra">EJazz Xtra</option>' +
    '</select></div>' +
    '<div class="field"><label>Dayparts</label><div id="ffDayparts"></div>' +
    '<p class="hint" style="margin-top:4px;">Each ticked daypart fires once on a chosen day, within 10 minutes of its time. A slot missed while the server was down is skipped, not posted late.</p></div>' +
    '<div id="ffLog" class="items" style="margin-top:12px;"><div class="empty">Loading the log…</div></div>' +
    '</div>';
}

function fillControls(cfg) {
  CONTROL_SECTIONS.forEach((sec) => sec.fields.forEach((f) => {
    const el = $(fid(f[0]));
    const v = getPath(cfg, f[0]);
    if (f[1] === 'bool') el.checked = Boolean(v);
    else if (f[1] === 'datetime') el.value = isoToLocal(v);
    else el.value = v == null ? '' : v;
  }));
  const nl = String.fromCharCode(10);
  $('cfg_podcasts').value = (cfg.podcasts || []).map((p) => p.name + ' | ' + p.feedUrl).join(nl);
  fillFunFacts(cfg.funFacts || {});
}

function fillFunFacts(ff) {
  $('cfg_ff_enabled').checked = Boolean(ff.enabled);
  $('cfg_ff_topic').value = ff.topic || 'all';
  const days = ff.days || [];
  document.querySelectorAll('.ffDay').forEach((b) => { b.checked = days.indexOf(Number(b.value)) !== -1; });
  $('ffDayparts').innerHTML = (ff.dayparts || []).map((d) =>
    '<div class="checkbox" style="margin-bottom:8px;gap:10px;">' +
    '<input type="checkbox" class="ffPartOn" data-id="' + escapeHtml(d.id) + '"' + (d.enabled ? ' checked' : '') + '>' +
    '<label style="margin:0;min-width:92px;">' + escapeHtml(d.label) + '</label>' +
    '<input type="time" class="ffPartTime" data-id="' + escapeHtml(d.id) + '" value="' + escapeHtml(d.time) + '" style="width:auto;margin:0;">' +
    '<button type="button" class="secondary ffRun" data-id="' + escapeHtml(d.id) + '" style="width:auto;margin:0;">Send one now</button>' +
    '</div>'
  ).join('');
  document.querySelectorAll('.ffRun').forEach((b) => b.addEventListener('click', () => runFunFactNow(b)));
  loadFunFactLog();
}

/** The shape saveControls sends back; dayparts are rebuilt from the rendered rows. */
function collectFunFacts() {
  const days = Array.from(document.querySelectorAll('.ffDay')).filter((b) => b.checked).map((b) => Number(b.value));
  const times = {};
  document.querySelectorAll('.ffPartTime').forEach((t) => { times[t.getAttribute('data-id')] = t.value; });
  const dayparts = Array.from(document.querySelectorAll('.ffPartOn')).map((b) => {
    const id = b.getAttribute('data-id');
    return { id: id, enabled: b.checked, time: times[id] };
  });
  return { enabled: $('cfg_ff_enabled').checked, days: days, topic: $('cfg_ff_topic').value, dayparts: dayparts };
}

async function runFunFactNow(btn) {
  const id = btn.getAttribute('data-id');
  if (!confirm('Write a fact now and push it to listeners? This is a real push, not a preview.')) return;
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await api('/fun-facts/run', { method: 'POST', body: JSON.stringify({ daypartId: id }) });
    await loadFunFactLog();
  } catch (e) {
    alert('Could not send: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

async function loadFunFactLog() {
  const host = $('ffLog');
  if (!host) return;
  try {
    const data = await api('/fun-facts/log', { method: 'GET' });
    const items = data.items || [];
    if (!items.length) {
      host.innerHTML = '<div class="empty">Nothing has auto-fired yet.</div>';
      return;
    }
    host.innerHTML = items.map((it) => {
      const slot = String(it.createdBy || '').split(':')[2] || '?';
      const meta = [slot, new Date(it.createdAt).toLocaleString(),
        it.pushSentAt ? 'pushed to ' + it.pushTopic : 'NOT PUSHED'].filter(Boolean).join(' · ');
      return '<div class="item"><div><div><strong>' + escapeHtml(it.title) + '</strong></div>' +
        '<div class="meta">' + escapeHtml(meta) + '</div>' +
        '<div class="meta">' + escapeHtml(String(it.body || '').slice(0, 160)) + '</div></div></div>';
    }).join('');
  } catch (e) {
    host.innerHTML = '<div class="empty">Could not load the log.</div>';
  }
}

async function loadControls() {
  $('controlsMsg').textContent = '';
  try {
    if (!$('controlsForm').innerHTML) renderControls();
    controlsConfig = await api('/app-config', { method: 'GET' });
    fillControls(controlsConfig);
  } catch (e) {
    $('controlsMsg').style.color = '#ff6b7a';
    $('controlsMsg').textContent = 'Could not load: ' + e.message;
  }
}

$('saveControlsBtn').addEventListener('click', async () => {
  const msg = $('controlsMsg');
  msg.style.color = '#a7f3d0';
  msg.textContent = 'Saving…';
  try {
    const next = JSON.parse(JSON.stringify(controlsConfig || {}));
    CONTROL_SECTIONS.forEach((sec) => sec.fields.forEach((f) => {
      const el = $(fid(f[0]));
      if (f[1] === 'bool') setPath(next, f[0], el.checked);
      else if (f[1] === 'datetime') setPath(next, f[0], localToIso(el.value));
      else setPath(next, f[0], el.value);
    }));
    const nl = String.fromCharCode(10);
    next.podcasts = $('cfg_podcasts').value.split(nl).map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split('|');
      return { name: (parts[0] || '').trim(), feedUrl: (parts.slice(1).join('|') || '').trim() };
    });
    next.funFacts = collectFunFacts();
    controlsConfig = await api('/app-config', { method: 'PUT', body: JSON.stringify(next) });
    fillControls(controlsConfig);
    msg.textContent = 'Saved. Phones pick this up the next time the app opens. Anything left blank or invalid (for example a link that is not https) was reset to the default.';
  } catch (e) {
    msg.style.color = '#ff6b7a';
    msg.textContent = 'Could not save: ' + e.message;
  }
});

// ---------- programme schedule ----------
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function minuteToTime(m) { return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60); }
function timeToMinute(t) {
  const parts = String(t || '').split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]); const m = Number(parts[1]);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

async function loadShows() {
  const list = $('showsList');
  try {
    const shows = await api('/shows', { method: 'GET' });
    if (!shows.length) { list.innerHTML = '<div class="empty">No shows yet - add the first one above.</div>'; return; }
    list.innerHTML = shows.map((s) => {
      const meta = DAY_NAMES[s.dayOfWeek] + ' ' + minuteToTime(s.startMinute) + '-' + minuteToTime(s.endMinute) + ' · ' + (s.station === 'xtra' ? 'EJazz Xtra' : 'EJazz Radio') + (s.hostName ? ' · ' + s.hostName : '');
      return '<div class="item"><div><strong>' + escapeHtml(s.name) + '</strong><div class="meta">' + escapeHtml(meta) + '</div></div>' +
        '<div class="actions"><button class="secondary delShow" data-id="' + s.id + '">Remove</button></div></div>';
    }).join('');
    document.querySelectorAll('.delShow').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this show from the schedule?')) return;
        await api('/shows/' + btn.getAttribute('data-id'), { method: 'DELETE' });
        loadShows();
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="empty">Could not load shows: ' + escapeHtml(e.message) + '</div>';
  }
}

$('addShowBtn').addEventListener('click', async () => {
  $('showErr').textContent = '';
  const startMinute = timeToMinute($('s_start').value);
  const endMinute = timeToMinute($('s_end').value);
  if (!$('s_name').value.trim()) { $('showErr').textContent = 'Show name is required.'; return; }
  if (startMinute === null || endMinute === null) { $('showErr').textContent = 'Set start and end times.'; return; }
  if (endMinute <= startMinute) { $('showErr').textContent = 'End time must be after the start time.'; return; }
  try {
    await api('/shows', { method: 'POST', body: JSON.stringify({
      name: $('s_name').value.trim(),
      hostName: $('s_host').value.trim() || null,
      station: $('s_station').value,
      dayOfWeek: Number($('s_day').value),
      startMinute: startMinute,
      endMinute: endMinute,
      description: $('s_desc').value.trim() || null,
    }) });
    $('s_name').value = ''; $('s_host').value = ''; $('s_desc').value = '';
    loadShows();
  } catch (e) {
    $('showErr').textContent = 'Could not add: ' + e.message;
  }
});

checkSession();
</script>
</body>
</html>`;

router.get("/", (_req, res) => {
  res.type("html").send(PAGE);
});

export default router;
