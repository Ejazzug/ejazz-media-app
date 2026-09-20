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
  <h2>Create content</h2>
  <div class="card">
    <div class="row">
      <div class="field">
        <label>Type</label>
        <select id="f_type">
          <option value="fact">Fact (Clock It)</option>
          <option value="poll">Poll (Aura Check)</option>
          <option value="announcement">Announcement</option>
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
    <div class="row">
      <div class="field"><label>Related artist</label><input type="text" id="f_artist"></div>
      <div class="field"><label>Related song</label><input type="text" id="f_song"></div>
    </div>
    <div class="row">
      <div class="field"><label>Related show</label><input type="text" id="f_show"></div>
      <div class="field"><label>Related station</label><input type="text" id="f_station"></div>
    </div>
    <div class="field" id="pollOptionsField" style="display:none;">
      <label>Poll options (comma-separated)</label>
      <input type="text" id="f_pollOptions" placeholder="Asake, Rema, Burna Boy, Wizkid">
    </div>
    <div class="checkbox">
      <input type="checkbox" id="f_push">
      <label for="f_push" style="margin:0;">Send push notification</label>
    </div>
    <div style="margin-top:14px;">
      <button id="createBtn">Create</button>
    </div>
    <div class="err" id="createErr"></div>
  </div>

  <h2>Live &amp; Draft content</h2>
  <div class="items" id="itemsList"><div class="empty">Loading…</div></div>
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

$('f_type').addEventListener('change', () => {
  $('pollOptionsField').style.display = $('f_type').value === 'poll' ? 'block' : 'none';
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
    placement: 'home',
  };
  if (type === 'poll') {
    const opts = $('f_pollOptions').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) {
      $('createErr').textContent = 'Add at least 2 poll options.';
      return;
    }
    payload.pollOptions = opts.map((label) => ({ label, votes: 0 }));
  }
  if (!payload.title) {
    $('createErr').textContent = 'Title is required.';
    return;
  }
  try {
    await api('/content', { method: 'POST', body: JSON.stringify(payload) });
    $('f_title').value = ''; $('f_body').value = ''; $('f_artist').value = '';
    $('f_song').value = ''; $('f_show').value = ''; $('f_station').value = '';
    $('f_pollOptions').value = ''; $('f_push').checked = false;
    await loadItems();
  } catch (e) {
    $('createErr').textContent = 'Could not create: ' + e.message;
  }
});

async function setStatus(id, status) {
  await api('/content/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
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
    const meta = [item.type, item.relatedArtist, item.relatedSong].filter(Boolean).join(' · ');
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

checkSession();
</script>
</body>
</html>`;

router.get("/", (_req, res) => {
  res.type("html").send(PAGE);
});

export default router;
