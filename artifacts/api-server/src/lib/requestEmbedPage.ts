/**
 * The HTML of the song request widget the websites embed.
 *
 * Its own module, with no express import, so the page can be loaded and its browser
 * script exercised by src/routes/embed.test.ts without pulling the whole server in.
 */

/**
 * The station's own song request widget, for embedding on the website.
 *
 * It exists because the site used to iframe AzuraCast's /public/<station>/embed-requests
 * page, which knows nothing about the request windows set in the Control Room and so
 * takes requests around the clock. This page asks /api/song-requests whether the station
 * is open before it shows a form, and keeps asking, so a form left sitting in a browser
 * tab closes itself when the window ends.
 *
 * Both stations are served by one page: EJazz Xtra has a searchable library
 * (AzuraCast), EJazz Radio takes a written request (its Centova/reliastream panel).
 * Both of those endpoints answer CORS *, so the visitor's own browser talks to them
 * directly and nothing is proxied through this box.
 *
 * WRITING RULES FOR THE TEMPLATE BELOW -- the same ones controlRoom.ts carries, for the
 * same reason, and they have already cost this project a day:
 *  - It is a template literal, so a backslash escape ANYWHERE inside it (a regex, a
 *    string, even a comment) is eaten before the browser sees it. `\s` becomes `s`.
 *    There is deliberately not one backslash in the page: no regexes, and line breaks
 *    come from String.fromCharCode(10).
 *  - There is no ${} interpolation either, so the source between the backticks IS what
 *    is served and can be checked without restarting the service:
 *      curl -s 'http://127.0.0.1:5601/embed/requests' | \
 *        python3 -c "import re,sys;print(re.search(r'<script>(.*?)</script>',sys.stdin.read(),re.S).group(1))" \
 *        > /tmp/embed.js && node --check /tmp/embed.js
 *    The station comes from the page's own query string for exactly this reason: it keeps
 *    the page a constant, and nothing from a URL is ever written into markup.
 */
export const REQUESTS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Song requests</title>
<style>
  /* Transparent by default so it sits in the host page's own background; the colours
     follow the page it is embedded in via prefers-color-scheme, and ?theme= forces one. */
  :root {
    --fg: #1a1a1a;
    --muted: #5e5e5e;
    --line: rgba(0,0,0,.14);
    --field: #ffffff;
    --accent: #FF0056;
    --accent-fg: #ffffff;
    --ok: #0f7b3f;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fg: #F2F4FF;
      --muted: #8A93C4;
      --line: rgba(255,255,255,.18);
      --field: rgba(255,255,255,.07);
      --ok: #7ddba4;
    }
  }
  :root[data-theme="dark"] {
    --fg: #F2F4FF;
    --muted: #8A93C4;
    --line: rgba(255,255,255,.18);
    --field: rgba(255,255,255,.07);
    --ok: #7ddba4;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  body {
    color: var(--fg);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 2px;
  }
  h2 { font-size: 17px; margin: 0 0 2px; }
  p { margin: 0 0 10px; }
  .muted { color: var(--muted); font-size: 13px; }
  .state { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
  .state.closed { border-color: var(--accent); }
  .pill { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
          border-radius: 20px; padding: 2px 10px; color: var(--accent-fg); background: var(--accent); }
  .pill.open { background: var(--ok); }
  .hours { margin: 8px 0 0; padding-left: 18px; }
  .hours li { font-size: 13px; color: var(--muted); }
  label { display: block; font-size: 13px; color: var(--muted); margin: 10px 0 3px; }
  input, textarea {
    width: 100%; font: inherit; color: var(--fg); background: var(--field);
    border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px;
  }
  textarea { min-height: 62px; resize: vertical; }
  button {
    font: inherit; font-weight: 600; cursor: pointer; border: 0; border-radius: 6px;
    padding: 10px 16px; color: var(--accent-fg); background: var(--accent);
  }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); font-weight: 500; }
  button[disabled] { opacity: .55; cursor: default; }
  .searchRow { display: flex; gap: 8px; align-items: stretch; }
  .searchRow input { flex: 1; }
  .results { list-style: none; margin: 12px 0 0; padding: 0; }
  .results li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
  .results img { width: 44px; height: 44px; border-radius: 4px; object-fit: cover; background: var(--field); flex: 0 0 auto; }
  .meta { flex: 1; min-width: 0; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msg { font-size: 14px; margin-top: 10px; }
  .msg.ok { color: var(--ok); }
  .msg.bad { color: var(--accent); }
  .hidden { display: none; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
  @media (max-width: 420px) { .fields { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div id="state" class="state"><span class="muted">Checking whether requests are open…</span></div>

<div id="xtra" class="hidden">
  <div class="searchRow">
    <input type="search" id="q" placeholder="Search for a song or artist" autocomplete="off">
    <button type="button" id="searchBtn">Search</button>
  </div>
  <ul class="results" id="results"></ul>
  <div class="msg" id="xtraMsg"></div>
</div>

<form id="radio" class="hidden" autocomplete="on">
  <div class="fields">
    <div><label for="r_artist">Artist</label><input type="text" id="r_artist" maxlength="120" required></div>
    <div><label for="r_title">Song</label><input type="text" id="r_title" maxlength="120" required></div>
    <div><label for="r_name">Your name</label><input type="text" id="r_name" maxlength="80" required></div>
    <div><label for="r_email">Your email</label><input type="email" id="r_email" maxlength="120" required></div>
  </div>
  <label for="r_dedi">Dedication (optional)</label>
  <textarea id="r_dedi" maxlength="300"></textarea>
  <p style="margin:12px 0 0;"><button type="submit" id="r_send">Send request</button></p>
  <div class="msg" id="radioMsg"></div>
</form>

<script>
(function () {
  var XTRA_API = 'https://stream.ejazzug.com';
  var XTRA_STATION = '2';
  var RADIO_RPC = 'https://eu1.reliastream.com:2199/external/rpc.php';
  var RADIO_USER = 'ejazzug';
  var NL = String.fromCharCode(10);
  var DASHES = [' - ', ' – ', ' — ', ' -', '- '];

  var params = new URLSearchParams(window.location.search);
  var station = params.get('station') === 'radio' ? 'radio' : 'xtra';
  var theme = params.get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function show(node, on) { node.classList[on ? 'remove' : 'add']('hidden'); }
  function say(node, text, kind) {
    node.textContent = text || '';
    node.className = 'msg' + (kind ? ' ' + kind : '');
    sendHeight();
  }

  // The host page cannot know how tall this is, so it is told. The snippet in the
  // Control Room listens for this; without the listener the fixed height still stands.
  var lastHeight = 0;
  function sendHeight() {
    var h = Math.ceil(document.body.scrollHeight) + 4;
    if (h === lastHeight) return;
    lastHeight = h;
    try { window.parent.postMessage({ ejazzRequestsHeight: h }, '*'); } catch (e) { /* framed cross-origin with a strict parent */ }
  }

  // Many files are tagged with the whole string in the title and an empty artist (the
  // same thing the app works around), so a dash is used to split one when it happens.
  function splitText(text) {
    var s = String(text || '').trim();
    for (var i = 0; i < DASHES.length; i += 1) {
      var mark = DASHES[i];
      var cut = s.indexOf(mark);
      if (cut > 0) return { artist: s.slice(0, cut).trim(), title: s.slice(cut + mark.length).trim() };
    }
    return { artist: '', title: s };
  }

  function statusUrl() { return '/api/song-requests?station=' + encodeURIComponent(station); }

  var isOpen = null;

  function renderState(data) {
    var box = $('state');
    box.innerHTML = '';
    box.className = 'state' + (data.open ? '' : ' closed');
    var head = el('div');
    head.appendChild(el('span', 'pill' + (data.open ? ' open' : ''), data.open ? 'Requests open' : 'Requests closed'));
    box.appendChild(head);
    box.appendChild(el('h2', null, data.stationName || ''));
    if (data.open) {
      if (data.nextChangeLabel) box.appendChild(el('p', 'muted', data.nextChangeLabel));
      else box.appendChild(el('p', 'muted', station === 'xtra' ? 'Search the library and send your song to the studio.' : 'Tell us what to play and we will pass it to the studio.'));
    } else {
      box.appendChild(el('p', null, data.closedMessage || 'Song requests are closed right now.'));
      if (data.nextChangeLabel) box.appendChild(el('p', 'muted', data.nextChangeLabel));
      if (data.schedule && data.schedule.length) {
        box.appendChild(el('p', 'muted', 'When requests are open:'));
        var ul = el('ul', 'hours');
        data.schedule.forEach(function (line) { ul.appendChild(el('li', null, line)); });
        box.appendChild(ul);
      }
    }
    show($('xtra'), data.open && station === 'xtra');
    show($('radio'), data.open && station === 'radio');
    sendHeight();
  }

  function refresh() {
    fetch(statusUrl(), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || typeof data.open !== 'boolean') throw new Error('bad status');
        // Clear a stale "sent" message when the window flips, so a closed form never
        // keeps a success line from before it closed.
        if (isOpen !== null && isOpen !== data.open) {
          say($('xtraMsg'), '');
          say($('radioMsg'), '');
        }
        isOpen = data.open;
        renderState(data);
      })
      .catch(function () {
        // Unreachable: say so rather than guessing. Guessing open would show a form that
        // fails; guessing closed would hide one that works.
        var box = $('state');
        box.innerHTML = '';
        box.className = 'state';
        box.appendChild(el('p', 'muted', 'Song requests are unavailable at the moment. Please try again shortly.'));
        show($('xtra'), false);
        show($('radio'), false);
        sendHeight();
      });
  }

  // ---- EJazz Xtra: search the library, request by id ----

  function requestTrack(id, button) {
    button.disabled = true;
    button.textContent = 'Sending…';
    fetch(XTRA_API + '/api/station/' + XTRA_STATION + '/request/' + encodeURIComponent(id), { method: 'POST' })
      .then(function (r) {
        return r.text().then(function (body) {
          var parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
          return { ok: r.ok, data: parsed };
        });
      })
      .then(function (res) {
        // Only a parsed JSON object's own message is ever shown: a refused id answers in
        // plain text, and that body carries a server path, which no listener should see.
        var message = res.data && typeof res.data.message === 'string' ? res.data.message : '';
        if (res.ok) {
          button.textContent = 'Sent';
          say($('xtraMsg'), message || 'Your request was sent to the studio.', 'ok');
        } else {
          button.disabled = false;
          button.textContent = 'Request';
          say($('xtraMsg'), message || 'That track could not be requested right now.', 'bad');
        }
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = 'Request';
        say($('xtraMsg'), 'Your request could not be sent. Please try again.', 'bad');
      });
  }

  function renderResults(rows) {
    var list = $('results');
    list.innerHTML = '';
    rows.forEach(function (item) {
      var song = item && item.song ? item.song : {};
      var artist = String(song.artist || '').trim();
      var title = String(song.title || '').trim();
      if (!artist) {
        var split = splitText(title || song.text);
        artist = split.artist;
        title = split.title || title;
      }
      var li = el('li');
      if (song.art) {
        var img = el('img');
        img.src = song.art;
        img.alt = '';
        img.loading = 'lazy';
        li.appendChild(img);
      }
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', title || 'Unknown title'));
      meta.appendChild(el('div', 'artist', artist || 'Unknown artist'));
      li.appendChild(meta);
      var btn = el('button', 'ghost', 'Request');
      btn.type = 'button';
      btn.onclick = function () { requestTrack(String(item.request_id), btn); };
      li.appendChild(btn);
      list.appendChild(li);
    });
    sendHeight();
  }

  function search() {
    var term = $('q').value.trim();
    if (!term) { say($('xtraMsg'), 'Type a song or artist to search for.', 'bad'); return; }
    say($('xtraMsg'), 'Searching…');
    var url = XTRA_API + '/api/station/' + XTRA_STATION + '/requests?searchPhrase='
      + encodeURIComponent(term) + '&rowCount=25&current=1';
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // The filtered call answers a paginated object; the unfiltered one a bare array.
        var rows = data && Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []);
        rows = rows.filter(function (item) { return item && item.request_id; });
        renderResults(rows);
        say($('xtraMsg'), rows.length ? '' : 'Nothing in the library matches that. Try another spelling.');
      })
      .catch(function () {
        $('results').innerHTML = '';
        say($('xtraMsg'), 'The library could not be searched just now. Please try again.', 'bad');
      });
  }

  $('searchBtn').addEventListener('click', search);
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  // ---- EJazz Radio: a written request ----

  $('radio').addEventListener('submit', function (e) {
    e.preventDefault();
    var artist = $('r_artist').value.trim();
    var title = $('r_title').value.trim();
    var name = $('r_name').value.trim();
    var email = $('r_email').value.trim();
    var dedi = $('r_dedi').value.trim();
    if (!artist || !title || !name || !email) {
      say($('radioMsg'), 'Artist, song, your name and your email are all needed.', 'bad');
      return;
    }
    var send = $('r_send');
    send.disabled = true;
    send.textContent = 'Sending…';
    var url = RADIO_RPC + '?m=request.submit&username=' + encodeURIComponent(RADIO_USER)
      + '&charset=UTF-8&artist=' + encodeURIComponent(artist) + '&title=' + encodeURIComponent(title)
      + '&sender=' + encodeURIComponent(name) + '&email=' + encodeURIComponent(email)
      + (dedi ? '&dedi=' + encodeURIComponent(dedi) : '');
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        var data = payload && Array.isArray(payload.data) ? payload.data : [];
        var accepted = payload && payload.type !== 'error' && data[1] === true;
        var message = typeof data[0] === 'string' ? data[0] : '';
        send.disabled = false;
        send.textContent = 'Send request';
        if (accepted) {
          say($('radioMsg'), message || 'Your request was sent to the studio.', 'ok');
          $('r_artist').value = '';
          $('r_title').value = '';
          $('r_dedi').value = '';
        } else {
          say($('radioMsg'), message || 'The station could not take that request.', 'bad');
        }
      })
      .catch(function () {
        send.disabled = false;
        send.textContent = 'Send request';
        say($('radioMsg'), 'Your request could not be sent. Please try again.', 'bad');
      });
  });

  refresh();
  // A window edge should close an open form without the visitor reloading. 60s, so a
  // page left open all day is 1,440 requests at most against a 30s-cached endpoint.
  setInterval(refresh, 60000);
  window.addEventListener('resize', sendHeight);
})();
</script>
</body>
</html>`;
