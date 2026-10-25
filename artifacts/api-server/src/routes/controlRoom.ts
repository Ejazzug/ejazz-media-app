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
    margin: 0; font-family: system-ui, -apple-system, sans-serif;
    background: #070E28; color: #F2F4FF; min-height: 100vh;
  }
  header {
    padding: 18px 24px; background: #0F2153; border-bottom: 1px solid rgba(242,244,255,0.12);
    display:flex; align-items:center; justify-content:space-between;
  }
  header .brand { font-weight: 800; letter-spacing: 0.5px; }
  header .brand span { color: #FF0056; }
  button {
    background: #FF0056; color: #fff; border: none; border-radius: 7px;
    padding: 8px 14px; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  button.secondary { background: transparent; border: 1px solid rgba(242,244,255,0.25); color: #F2F4FF; }
  button:hover:not(:disabled) { background: #BE024A; }
  button.secondary:hover:not(:disabled) { background: rgba(255,0,86,0.12); }
  button:disabled { opacity: 0.5; cursor: default; }
  #loginView { max-width: 340px; margin: 80px auto; padding: 0 16px; }
  #loginView input {
    width: 100%; padding: 10px 12px; border-radius: 7px; border: 1px solid rgba(242,244,255,0.2);
    background: #070E28; color: #fff; margin: 10px 0; font-size: 14px;
  }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px 16px; display: none; }
  h2 { font-size: 15px; color: #FF0056; letter-spacing: 0.3px; margin: 28px 0 10px 0; }
  .card {
    background: #16265C; border: 1px solid rgba(242,244,255,0.08); border-radius: 10px; padding: 16px;
  }
  .field { margin-bottom: 12px; }
  .field label { display:block; font-size: 11.5px; color: #8A93C4; margin-bottom: 4px; font-weight: 700; }
  .field input, .field select, .field textarea {
    width: 100%; padding: 9px 10px; border-radius: 6px; border: 1px solid rgba(242,244,255,0.15);
    background: #070E28; color: #fff; font-size: 13.5px; font-family: inherit;
  }
  .row { display:flex; gap: 12px; }
  .row > .field { flex: 1; }
  .checkbox { display:flex; align-items:center; gap:8px; font-size: 13px; }
  .checkbox input { width: auto; }
  .items { display:flex; flex-direction:column; gap: 10px; margin-top: 10px; }
  .item {
    border: 1px solid rgba(242,244,255,0.08); border-radius: 9px; padding: 12px 14px;
    display:flex; justify-content:space-between; align-items:flex-start; gap: 12px;
  }
  .item .meta { font-size: 11px; color: #8A93C4; margin-top: 3px; }
  .badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 5px; text-transform: uppercase; }
  .badge.live { background: rgba(81,157,197,0.2); color: #519DC5; }
  .badge.draft { background: rgba(242,244,255,0.1); color: #F2F4FF; }
  .badge.withdrawn { background: rgba(242,244,255,0.06); color: #8A93C4; }
  .badge.expired { background: rgba(242,244,255,0.06); color: #8A93C4; }
  .actions { display:flex; gap: 6px; flex-shrink: 0; }
  .err { color: #FF0056; font-size: 12.5px; margin-top: 6px; min-height: 16px; }
  .empty { color: #8A93C4; font-size: 13px; padding: 10px 2px; }
  /* Three tabs to a row: the tab strip used to wrap unevenly as tabs were added,
     and a fixed grid keeps it predictable however many there are. */
  nav.tabs { display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  nav.tabs button { background: transparent; border: 1px solid rgba(242,244,255,0.2); color: #F2F4FF; padding: 9px 10px; }
  nav.tabs button.active { background: #FF0056; border-color: #FF0056; color: #fff; }
  @media (max-width: 560px) { nav.tabs { grid-template-columns: repeat(2, 1fr); } }
  .panel { display: none; }
  .panel.active { display: block; }
  h3 { font-size: 13.5px; margin: 0 0 4px 0; color: #F2F4FF; }
  .hint { font-size: 12px; color: #8A93C4; margin: 0 0 12px 0; line-height: 1.45; }
  .section { margin-bottom: 14px; }
  .okmsg { color: #519DC5; font-size: 12.5px; margin-top: 6px; min-height: 16px; }

  /* Collapsible sections. Native <details> on purpose: no listener to register, so a
     section cannot be left stuck shut by a script error elsewhere on the page. */
  details.section > summary {
    cursor: pointer; font-size: 13.5px; font-weight: 800; color: #F2F4FF;
    list-style: none; display:flex; align-items:center; justify-content:space-between; gap: 10px;
  }
  details.section > summary::-webkit-details-marker { display: none; }
  details.section > summary::after { content: "+"; color: #FF0056; font-size: 16px; font-weight: 800; }
  details.section[open] > summary::after { content: "−"; }
  details.section > summary:hover { color: #FF0056; }
  details.section > summary .sumhint { font-weight: 500; font-size: 11.5px; color: #8A93C4; flex: 1; }
  /* App controls: three sections to a row. An opened section spans the full row so its
     form fields keep a usable width, and the others reflow around it. */
  #controlsForm { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
  #controlsForm details.section { margin-bottom: 0; }
  #controlsForm details.section[open] { grid-column: 1 / -1; }
  #controlsForm details.section > summary { flex-wrap: wrap; }
  #controlsForm details.section > summary .sumhint { flex-basis: 100%; order: 3; }
  @media (max-width: 760px) { #controlsForm { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px) { #controlsForm { grid-template-columns: 1fr; } }
  .section-body { padding-top: 14px; margin-top: 12px; border-top: 1px solid rgba(242,244,255,0.08); }

  /* Station sub-tabs inside the programme panel. */
  nav.subtabs { display:flex; gap: 8px; margin-bottom: 12px; }
  nav.subtabs button { flex: 1; background: transparent; border: 1px solid rgba(242,244,255,0.2); color: #F2F4FF; }
  nav.subtabs button.active { background: rgba(255,0,86,0.18); border-color: #FF0056; color: #fff; }

  .pickgrid { display:flex; flex-wrap: wrap; gap: 6px; }
  .pickgrid label {
    display:inline-flex; align-items:center; gap: 5px; font-size: 12px; white-space: nowrap;
    border: 1px solid rgba(242,244,255,0.15); border-radius: 6px; padding: 5px 8px; cursor: pointer;
  }
  .pickgrid label:has(input:checked) { background: rgba(255,0,86,0.18); border-color: #FF0056; color: #fff; }
  .pickgrid input { width: auto; margin: 0; }
  .chips { display:flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display:inline-flex; align-items:center; gap: 6px; font-size: 12px;
    background: rgba(242,244,255,0.07); border-radius: 6px; padding: 5px 8px;
  }
  .chip button { background: transparent; border: none; color: #FF0056; padding: 0 2px; font-size: 14px; }
  .slotrow { display:flex; align-items:center; gap: 8px; margin-bottom: 8px; }
  .slotrow input { width: auto; }
  .slotrow .dash { color: #8A93C4; font-size: 12px; }
  .slotrow button { background: transparent; border: 1px solid rgba(242,244,255,0.2); color: #FF0056; padding: 6px 9px; }
  /* A request window: one repeat pattern plus its times of day. */
  .wcard { border: 1px solid rgba(242,244,255,0.14); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
  .wcard-head { display:flex; align-items:center; gap: 8px; margin-bottom: 4px; }
  .wcard-head input[type=text] { flex: 1; }
  .wcard-head .wcard-on { display:inline-flex; align-items:center; gap: 5px; font-size: 12px; color: #8A93C4; white-space: nowrap; margin: 0; }
  .wcard-head .wcard-on input { width: auto; margin: 0; }
  .srnow { font-size: 12px; color: #8A93C4; margin-bottom: 8px; }
  .srnow.open { color: #519DC5; }
  .thumb { width: 42px; height: 42px; border-radius: 7px; object-fit: cover; background: rgba(242,244,255,0.06); flex-shrink: 0; }
  .item .lead { display:flex; gap: 10px; align-items: flex-start; }

  /* ---- Designer tab. The canvas here shows WHERE things sit, never how they look:
     the preview pane beside it is a real render by the Python renderer of record. ---- */
  .dsBar { display:flex; flex-wrap:wrap; gap: 8px; align-items:flex-end; }
  .dsBar .field { margin-bottom: 0; min-width: 120px; }
  .dsWork { display:flex; gap: 14px; align-items:flex-start; margin-top: 12px; flex-wrap: wrap; }
  .dsCol { flex: 1 1 320px; min-width: 280px; }
  #dsCanvasWrap { background: rgba(0,0,0,0.25); border-radius: 10px; padding: 10px; overflow:auto; }
  #dsCanvas { position: relative; margin: 0 auto; border-radius: 6px; overflow: hidden;
              box-shadow: 0 0 0 1px rgba(242,244,255,0.18); touch-action: none; }
  .dsBox { position:absolute; border: 1px dashed rgba(242,244,255,0.55); cursor: move;
           background: rgba(81,157,197,0.10); }
  .dsBox.selected { border: 1px solid #FF0056; background: rgba(255,0,86,0.14); }
  .dsBoxLabel { position:absolute; top: 2px; left: 4px; font-size: 10px; font-weight: 700;
                color: #F2F4FF; text-shadow: 0 1px 2px rgba(0,0,0,0.8); pointer-events:none; }
  .dsHandle { position:absolute; right: -5px; bottom: -5px; width: 12px; height: 12px;
              border-radius: 3px; background: #FF0056; cursor: nwse-resize; }
  .dsGuide { position:absolute; display:none; background: #519DC5; pointer-events:none; }
  .dsGuideV { top:0; bottom:0; width: 1px; }
  .dsGuideH { left:0; right:0; height: 1px; }
  .dsLayer { display:flex; justify-content:space-between; gap: 8px; padding: 7px 9px; cursor:pointer;
             border: 1px solid rgba(242,244,255,0.08); border-radius: 7px; margin-bottom: 6px; }
  .dsLayer.selected { border-color: #FF0056; background: rgba(255,0,86,0.10); }
  .dsLayerName { font-size: 12.5px; font-weight: 700; }
  .dsLayerMeta { font-size: 11px; color: #8A93C4; }
  .dsAsset { border: 1px solid rgba(242,244,255,0.14); border-radius: 7px; padding: 7px 9px;
             margin-bottom: 6px; cursor: grab; }
  .dsAsset.missing { border-color: #FF0056; opacity: 0.75; }
  .dsAssetName { display:block; font-size: 12.5px; font-weight: 700; }
  .dsAssetMeta { display:block; font-size: 10.5px; color: #8A93C4; }
  .dsSwatch { width: 30px; height: 30px; border-radius: 6px; border: 1px solid rgba(242,244,255,0.25);
              padding: 0; margin: 0 6px 6px 0; }
  .dsFont { display:block; width: 100%; text-align:left; background: transparent; color: #F2F4FF;
            border: 1px solid rgba(242,244,255,0.14); margin-bottom: 6px; font-weight: 600; }
  #dsPreview { width: 100%; border-radius: 8px; display:block; background: rgba(0,0,0,0.3); }
  #dsPreviewMeta { font-size: 11px; color: #8A93C4; margin-top: 6px; min-height: 14px; }
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
    <button class="tabBtn" data-panel="panel-designer">Designer</button>
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
    <div id="pushExtraFields" style="display:none;">
      <div class="field" style="margin-top:10px;">
        <label for="f_image">Notification image (optional, https link)</label>
        <input type="text" id="f_image" placeholder="https://.../poster.jpg">
      </div>
      <div class="field">
        <label for="f_link">Link (optional)</label>
        <input type="text" id="f_link" placeholder="https://play.google.com/store/apps/details?id=...">
      </div>
      <div class="field">
        <label for="f_openMode">When someone taps the notification</label>
        <select id="f_openMode">
          <option value="details">Open the full message in the app</option>
          <option value="link">Go straight to the link</option>
        </select>
      </div>
      <button type="button" class="secondary" id="insertLinkBtn" style="width:auto;margin-bottom:6px;">Insert a link in the body</button>
      <p class="hint">A notification tray cannot hold a tappable word, so it shows the plain words (for example "Click Here"). In the app the words become a real link. Insert one with the button, or type it as [Click Here](https://...).</p>
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

  <details class="card section" id="itemsBox">
    <summary>Live &amp; Draft content<span class="sumhint" id="itemsHint">Loading…</span></summary>
    <div class="section-body">
      <p class="meta" style="margin:0 0 10px;">
        Everything created here, oldest first. <strong>Withdraw</strong> takes an item out of the app
        and keeps the row; <strong>Delete</strong> removes the row for good. Neither recalls a push
        already delivered to a phone's tray, which nothing can. Clearing rows does not touch the
        Notifications log, which is the record of what was actually sent.
      </p>
      <div class="actions" style="gap:8px; flex-wrap:wrap;">
        <button type="button" class="secondary" id="clearWithdrawnBtn" style="width:auto;">Clear what has gone out</button>
        <button type="button" class="secondary" id="clearAllContentBtn" style="width:auto;">Clear everything</button>
      </div>
      <div class="err" id="itemsErr"></div>
      <div class="items" id="itemsList"><div class="empty">Loading…</div></div>
    </div>
  </details>
  </section>

  <section id="panel-controls" class="panel">
    <h2>App controls</h2>
    <p class="hint">Changes reach phones the next time the app opens (or returns to the foreground). Controls need the app version built with remote controls; older installs ignore them.</p>
    <p class="hint" style="margin-bottom:10px;">
      Every section below is collapsed — open the one you need.
      <a href="#" id="expandAll">open all</a> · <a href="#" id="collapseAll">close all</a>
    </p>
    <div id="controlsForm"></div>
    <div style="margin-top:14px;">
      <button id="saveControlsBtn">Save app controls</button>
    </div>
    <div class="okmsg" id="controlsMsg"></div>
  </section>

  <section id="panel-schedule" class="panel">
    <h2>Programme line-up</h2>
    <p class="hint">Drives "Live now / Next / Later" on the app Home. Times are East Africa Time.
      Each station has its own line-up — pick the station first, and everything below belongs to it.</p>

    <nav class="subtabs" id="stationTabs">
      <button class="stationBtn active" data-station="radio">EJazz Radio</button>
      <button class="stationBtn" data-station="xtra">EJazz Xtra</button>
    </nav>

    <details class="card section" id="showFormBox">
      <summary><span id="showFormTitle">Add a show</span><span class="sumhint" id="showFormHint"></span></summary>
      <div class="section-body">
        <div class="row">
          <div class="field"><label for="s_name">Show name</label><input type="text" id="s_name"></div>
          <div class="field"><label for="s_host">Host</label><input type="text" id="s_host"></div>
        </div>
        <div class="row">
          <div class="field"><label for="s_station">Station</label>
            <select id="s_station"><option value="radio">EJazz Radio</option><option value="xtra">EJazz Xtra</option></select>
          </div>
          <div class="field"><label for="s_repeat">When it airs</label>
            <select id="s_repeat">
              <option value="weekly">Days of the week</option>
              <option value="monthly">Dates of the month</option>
              <option value="dates">Specific dates</option>
            </select>
          </div>
        </div>

        <div class="field" id="weeklyBox">
          <label>Which days</label>
          <div class="pickgrid" id="dayBoxes"></div>
          <p class="hint" style="margin:6px 0 0;">
            Quick pick:
            <a href="#" class="dayPick" data-pick="all">every day</a> ·
            <a href="#" class="dayPick" data-pick="weekdays">Mon–Fri</a> ·
            <a href="#" class="dayPick" data-pick="weekend">weekend</a> ·
            <a href="#" class="dayPick" data-pick="none">clear</a>
          </p>
        </div>

        <div class="field" id="monthlyBox" style="display:none;">
          <label>Which dates of the month</label>
          <div class="pickgrid" id="domBoxes"></div>
          <p class="hint" style="margin:6px 0 0;">A month without that date (the 31st, say) simply skips it.</p>
        </div>

        <div class="field" id="datesBox" style="display:none;">
          <label for="s_datePick">Exact dates</label>
          <div class="row">
            <div class="field"><input type="date" id="s_datePick"></div>
            <div class="field"><button type="button" class="secondary" id="addDateBtn">Add this date</button></div>
          </div>
          <div class="chips" id="dateList"></div>
          <p class="hint" style="margin:6px 0 0;">For one-offs and specials. A date in the past is kept but never airs again.</p>
        </div>

        <div class="field">
          <label>Times in the day</label>
          <div id="slotList"></div>
          <button type="button" class="secondary" id="addSlotBtn">Add another time</button>
          <p class="hint" style="margin:6px 0 0;">
            Several times in the same day are fine — a show at 09:00 and again at 18:00 is two times, not two shows.
            They must not overlap each other.
          </p>
        </div>

        <div class="field">
          <label for="s_image">Artwork link (optional)</label>
          <input type="text" id="s_image" placeholder="https://...">
          <p class="hint" style="margin:6px 0 0;">An https link to a square image. Left empty, the app shows the station logo.</p>
        </div>
        <div class="field" id="imagePreviewBox" style="display:none;">
          <img id="imagePreview" class="thumb" style="width:84px;height:84px;" alt="">
        </div>

        <div class="field"><label for="s_desc">Description (optional)</label><input type="text" id="s_desc"></div>

        <div style="display:flex; gap:8px; align-items:center;">
          <button id="saveShowBtn">Add show</button>
          <button type="button" class="secondary" id="cancelEditBtn" style="display:none;">Cancel edit</button>
        </div>
        <div class="err" id="showErr"></div>
      </div>
    </details>

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

  <section id="panel-designer" class="panel">
    <h2>Designer</h2>
    <div class="card">
      <p class="meta" style="margin:0 0 10px;">
        Lay out a shareable here; the preview on the right is a real render by the station
        renderer, so what you see is the file. The boxes only say where things sit.
      </p>
      <div class="dsBar">
        <div class="field"><label>Template</label><select id="dsTemplateSel"></select></div>
        <div class="field"><label>Size</label><select id="dsSizeSel"></select></div>
        <div class="field"><label>Id</label><input type="text" id="dsTplId"></div>
        <div class="field"><label>Name</label><input type="text" id="dsTplName"></div>
        <div class="field"><label>Background</label><input type="text" id="dsBgColor" placeholder="#070E28"></div>
      </div>
      <div class="dsBar" style="margin-top:10px;">
        <div class="field"><label>Add placeholder</label>
          <select id="dsAddType">
            <option value="text">text</option>
            <option value="image">image</option>
            <option value="logo">logo</option>
            <option value="cta">cta</option>
            <option value="data">data</option>
          </select>
        </div>
        <button id="dsAddBtn">Add</button>
        <button class="secondary" id="dsDeleteBtn">Delete</button>
        <button class="secondary" id="dsZUpBtn">Bring forward</button>
        <button class="secondary" id="dsZDownBtn">Send back</button>
        <button class="secondary" id="dsUndoBtn">Undo</button>
        <button class="secondary" id="dsRedoBtn">Redo</button>
      </div>
      <div class="dsBar" style="margin-top:10px;">
        <button id="dsSaveBtn">Save template</button>
        <button class="secondary" id="dsDupBtn">Duplicate</button>
        <button class="secondary" id="dsExportBtn">Export JSON</button>
        <button class="secondary" id="dsImportBtn">Import JSON</button>
        <input type="file" id="dsImportFile" accept="application/json,.json" style="display:none;">
      </div>
      <div class="dsBar" style="margin-top:10px;">
        <div class="field"><label>Save as preset (name required)</label><input type="text" id="dsPresetName" placeholder="Launch night"></div>
        <button class="secondary" id="dsSavePresetBtn">Save as preset</button>
        <div class="field"><label>Apply preset</label><select id="dsPresetSel"></select></div>
        <button class="secondary" id="dsApplyPresetBtn">Apply preset</button>
      </div>
      <div class="err" id="dsErr"></div>
      <div class="meta" id="dsMsg"></div>
    </div>

    <div class="dsWork">
      <div class="dsCol">
        <div id="dsCanvasWrap"><div id="dsCanvas"></div></div>
        <details class="card section" style="margin-top:12px;">
          <summary>Layers</summary>
          <div id="dsLayers"></div>
        </details>
      </div>

      <div class="dsCol">
        <div class="card" id="dsInspector" style="display:none;">
          <div class="row">
            <div class="field"><label>Id</label><input type="text" id="dsPhId"></div>
            <div class="field"><label>Type</label>
              <select id="dsPhType">
                <option value="text">text</option>
                <option value="image">image</option>
                <option value="logo">logo</option>
                <option value="cta">cta</option>
                <option value="data">data</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div class="field"><label>X</label><input type="number" id="dsPhX"></div>
            <div class="field"><label>Y</label><input type="number" id="dsPhY"></div>
          </div>
          <div class="row">
            <div class="field"><label>Width</label><input type="number" id="dsPhW"></div>
            <div class="field"><label>Height</label><input type="number" id="dsPhH"></div>
          </div>
          <div class="row">
            <div class="field"><label>Fit</label>
              <select id="dsPhFit">
                <option value="cover">cover</option>
                <option value="contain">contain</option>
              </select>
            </div>
            <div class="field"><label>Z</label><input type="number" id="dsPhZ"></div>
          </div>
          <div class="field"><label>Default</label><input type="text" id="dsPhDefault"></div>
          <div class="row">
            <div class="field"><label>Font</label><input type="text" id="dsPhFont" placeholder="Liberation Sans Bold"></div>
            <div class="field"><label>Size</label><input type="number" id="dsPhSize"></div>
          </div>
          <div class="row">
            <div class="field"><label>Colour</label><input type="text" id="dsPhColor" placeholder="#F2F4FF"></div>
            <div class="field"><label>Align</label>
              <select id="dsPhAlign">
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Background (cta pill, or a plate behind a logo)</label><input type="text" id="dsPhBg" placeholder="#FF0056"></div>
          <div class="row">
            <div class="field"><label>Plate padding</label><input type="number" id="dsPhPlatePad"></div>
            <div class="field"><label>Plate radius</label><input type="number" id="dsPhRadius"></div>
          </div>
          <p class="meta" id="dsPlateNote" style="margin:0;"></p>
        </div>

        <details class="card section" style="margin-top:12px;" open>
          <summary>Brand</summary>
          <p class="meta" style="margin:8px 0 6px;">Drag a logo onto a logo or image box. A colour goes to the
            selected placeholder, or to the background when nothing is selected.</p>
          <div id="dsBrandLogos"></div>
          <div id="dsBrandColours" style="margin:8px 0;"></div>
          <div id="dsBrandFonts"></div>
        </details>
      </div>

      <div class="dsCol">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:13px;">Preview</strong>
            <button class="secondary" id="dsRefreshPreview">Refresh</button>
          </div>
          <img id="dsPreview" alt="Server render of this template">
          <div id="dsPreviewMeta"></div>
        </div>
      </div>
    </div>
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
  hint.style.color = '#FF0056';
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
  $('createErr').style.color = delivery.sent ? '#519DC5' : '#FF0056';
  $('createErr').textContent = delivery.error ||
    ('FCM notification sent to the "' + delivery.topic + '" topic.');
}

$('f_push').addEventListener('change', () => {
  $('pushTopicField').style.display = $('f_push').checked ? 'block' : 'none';
  $('pushExtraFields').style.display = $('f_push').checked ? 'block' : 'none';
});

$('insertLinkBtn').addEventListener('click', () => {
  const label = window.prompt('The words people will tap, for example: Click Here');
  if (!label) return;
  const target = window.prompt('Where should it go? A full address, for example https://...');
  if (!target || target.indexOf('http') !== 0) { $('createErr').textContent = 'The link must start with https://'; return; }
  const box = $('f_body');
  const markup = '[' + label.trim() + '](' + target.trim() + ')';
  const at = box.selectionStart == null ? box.value.length : box.selectionStart;
  box.value = box.value.slice(0, at) + markup + box.value.slice(at);
  if (!$('f_link').value) $('f_link').value = target.trim();
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
    imageUrl: $('f_image').value.trim() || null,
    linkUrl: $('f_link').value.trim() || null,
    openMode: $('f_openMode').value,
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
    $('pushExtraFields').style.display = 'none';
    $('f_image').value = ''; $('f_link').value = ''; $('f_openMode').value = 'details';
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
  // The section is collapsed by default, so its summary has to say what is inside.
  const count = (st) => items.filter((i) => i.status === st).length;
  $('itemsHint').textContent = items.length
    ? items.length + ' item(s) - ' + count('live') + ' live, ' + count('draft') + ' draft, ' + count('withdrawn') + ' gone out'
    : 'Nothing yet';
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
    actions.push('<button data-id="' + item.id + '" data-title="' + escapeHtml(item.title) + '" class="secondary delItem">Delete</button>');
    return '<div class="item">' +
      '<div><div><strong>' + escapeHtml(item.title) + '</strong> <span class="badge ' + item.status + '">' + item.status + '</span></div>' +
      '<div class="meta">' + escapeHtml(meta) + '</div></div>' +
      '<div class="actions">' + actions.join('') + '</div></div>';
  }).join('');
  document.querySelectorAll('.setStatus').forEach((btn) => {
    btn.addEventListener('click', () => setStatus(btn.getAttribute('data-id'), btn.getAttribute('data-status')));
  });
  document.querySelectorAll('.delItem').forEach((btn) => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-id'), btn.getAttribute('data-title')));
  });
}

async function deleteItem(id, title) {
  if (!confirm('Delete "' + title + '" for good? It disappears from the app and from this list.')) return;
  $('itemsErr').textContent = '';
  try {
    await api('/content/' + id, { method: 'DELETE' });
    await loadItems();
  } catch (e) { $('itemsErr').textContent = 'Could not delete: ' + e.message; }
}

// Clearing the list. Line breaks in these warnings are built with String.fromCharCode(10),
// never a backslash escape: this page is one template literal, and such an escape reaches
// the browser as a real newline inside a quoted string -- a SyntaxError that kills every
// listener on the page. Same reason as the notification log's own Clear all below.
async function clearContent(onlyWithdrawn) {
  const br = String.fromCharCode(10);
  const warning = onlyWithdrawn
    ? 'Clear everything that has gone out?' + br + br
      + 'Only withdrawn items are removed. Anything still live or draft stays exactly as it is.'
    : 'Clear the WHOLE content list?' + br + br
      + 'Live items are removed too, so they stop showing in the app. The Notifications log keeps '
      + 'the record of what was sent, and a push already in a phone tray cannot be recalled.';
  if (!confirm(warning)) return;
  $('itemsErr').textContent = '';
  try {
    const r = await api('/content?confirm=yes' + (onlyWithdrawn ? '&only=withdrawn' : ''), { method: 'DELETE' });
    await loadItems();
    $('itemsErr').textContent = 'Removed ' + r.deleted + ' item(s).';
  } catch (e) { $('itemsErr').textContent = 'Could not clear: ' + e.message; }
}

$('clearWithdrawnBtn').addEventListener('click', () => clearContent(true));
$('clearAllContentBtn').addEventListener('click', () => clearContent(false));

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
    ['features.pulse', 'bool', 'Fun fact card on Home (Clock it)'],
    ['features.schedule', 'bool', 'Coming Up row on Home'],
    ['features.scheduleRadio', 'bool', 'Coming Up row on the Radio screen'],
  ] },
  { title: 'Song requests', hint: 'Open or close requests per station, and set the hours they are open.', fields: [
    ['songRequests.radioEnabled', 'bool', 'EJazz Radio takes requests'],
    ['songRequests.xtraEnabled', 'bool', 'EJazz Xtra takes requests'],
    ['songRequests.closedMessage', 'text', 'Message shown when closed'],
  ], extra: () => songRequestsExtraHtml() },
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
  { title: 'Contact & general links', hint: 'Shown in the More tab for the whole app (each station has its own social sections below). Leave blank to keep the app defaults. Only https links are accepted.', fields: [
    ['links.contactEmail', 'text', 'Contact email'],
    ['links.instagramUrl', 'text', 'Instagram link'],
    ['links.whatsappUrl', 'text', 'WhatsApp link (https://wa.me/...)'],
    ['links.websiteUrl', 'text', 'Website link'],
    ['links.privacyUrl', 'text', 'Privacy policy link'],
    ['links.termsUrl', 'text', 'Terms link'],
    ['links.shareText', 'text', 'Message when listeners share a station (the app link is added automatically)'],
    ['links.shareAppText', 'text', 'Message when listeners share the app (the app link is added automatically; blank = built-in wording)'],
  ] },
  { title: 'EJazz Radio socials', hint: 'Shown in the More tab under this station. Leave blank to hide. Only https links are accepted.', fields: [
    ['links.radio.instagramUrl', 'text', 'Instagram'],
    ['links.radio.facebookUrl', 'text', 'Facebook'],
    ['links.radio.xUrl', 'text', 'X (Twitter)'],
    ['links.radio.tiktokUrl', 'text', 'TikTok'],
    ['links.radio.youtubeUrl', 'text', 'YouTube'],
    ['links.radio.whatsappUrl', 'text', 'WhatsApp (https://wa.me/...)'],
    ['links.radio.websiteUrl', 'text', 'Website'],
  ] },
  { title: 'EJazz Xtra socials', hint: 'Shown in the More tab under this station. Leave blank to hide. Only https links are accepted.', fields: [
    ['links.xtra.instagramUrl', 'text', 'Instagram'],
    ['links.xtra.facebookUrl', 'text', 'Facebook'],
    ['links.xtra.xUrl', 'text', 'X (Twitter)'],
    ['links.xtra.tiktokUrl', 'text', 'TikTok'],
    ['links.xtra.youtubeUrl', 'text', 'YouTube'],
    ['links.xtra.whatsappUrl', 'text', 'WhatsApp (https://wa.me/...)'],
    ['links.xtra.websiteUrl', 'text', 'Website'],
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
    // A section may add markup its field list cannot express (the request windows).
    return sectionHtml(sec.title, sec.hint, fields + (sec.extra ? sec.extra() : ''));
  }).join('') +
    sectionHtml('Podcasts',
      'One show per line: Name | feed link. Leave empty to keep the podcasts built into the app. Up to 12.',
      '<div class="field"><textarea id="cfg_podcasts" rows="4" placeholder="The Xtreme BPM | https://anchor.fm/s/281a6d78/podcast/rss"></textarea></div>') +
    funFactsSectionHtml() +
    songFactsSectionHtml() +
    countdownChartsSectionHtml() +
    stationChartsSectionHtml();
}

// One collapsed section. <details> rather than a click handler on a heading: the App
// controls tab is a long page of eleven sections, and a native element cannot be left
// stuck shut by a script error somewhere else on the page.
function sectionHtml(title, hint, body) {
  return '<details class="card section"><summary>' + escapeHtml(title) +
    '<span class="sumhint">' + escapeHtml(hint) + '</span></summary>' +
    '<div class="section-body">' + body + '</div></details>';
}

function funFactsSectionHtml() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBoxes = days.map((d, i) =>
    '<label style="margin-right:12px;white-space:nowrap;"><input type="checkbox" class="ffDay" value="' + i + '"> ' + d + '</label>'
  ).join('');
  return sectionHtml('Automatic fun facts',
    'Writes a fact with AI and pushes it, at the dayparts you tick.',
    '<p class="hint">The time of day and the weekday are given to the AI as context, so a drive-time fact reads differently from a morning one. ' +
    'A fact is only ever created together with its push — if the push fails the fact is withdrawn, never left sitting silently.</p>' +
    '<div class="checkbox" style="margin-bottom:10px;"><input type="checkbox" id="cfg_ff_enabled"><label for="cfg_ff_enabled" style="margin:0;">Automatic fun facts ON</label></div>' +
    '<div class="field"><label>Days</label><div id="ffDays" style="padding:4px 0;">' + dayBoxes + '</div>' +
    '<p class="hint" style="margin-top:4px;">Tick none to run every day.</p></div>' +
    '<div class="field"><label for="cfg_ff_topic">Push audience</label><select id="cfg_ff_topic">' +
    '<option value="all">All listeners</option><option value="radio">EJazz Radio</option><option value="xtra">EJazz Xtra</option>' +
    '</select></div>' +
    '<div class="field"><label>Dayparts</label><div id="ffDayparts"></div>' +
    '<p class="hint" style="margin-top:4px;">Each ticked daypart fires once on a chosen day, within 10 minutes of its time. A slot missed while the server was down is skipped, not posted late.</p></div>' +
    '<div class="err" id="ffWarn" style="display:none;"></div>' +
    '<div id="ffLog" class="items" style="margin-top:12px;"><div class="empty">Loading the log…</div></div>');
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
  fillSongRequests(cfg);
  fillFunFacts(cfg.funFacts || {});
  const sfc = cfg.songFacts || {};
  $('sf_auto').checked = sfc.autoGenerate !== false;
  $('sf_hour').value = sfc.maxPerHour == null ? 40 : sfc.maxPerHour;
  $('sf_day').value = sfc.maxPerDay == null ? 300 : sfc.maxPerDay;
  $('sf_provider').value = sfc.provider === 'groq' || sfc.provider === 'none' ? sfc.provider : 'gemini';
  $('sf_sheet').value = sfc.sheetUrl || '';
  loadSongFacts();
  const cc = cfg.charts || {};
  $('cfg_cc_mode').value = ['week', 'month', 'custom'].indexOf(cc.pastMode) !== -1 ? cc.pastMode : 'off';
  $('cfg_cc_from').value = cc.customFrom || '';
  $('cfg_cc_keep').value = cc.keepDays == null ? 365 : cc.keepDays;
  ccToggleCustom();
  loadCountdownCharts();
  loadStationCharts();
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
    // Without an API key nothing here can ever produce a fact, so say so and disable the
    // buttons rather than letting a click fail after the fact.
    if (data.geminiConfigured === false) {
      document.querySelectorAll('.ffRun').forEach((b) => {
        b.disabled = true;
        b.title = 'GEMINI_API_KEY is not set for this service.';
      });
      const warn = $('ffWarn');
      if (warn) {
        warn.textContent = 'Automatic fun facts cannot run: GEMINI_API_KEY is not set for this service. '
          + 'Scheduled dayparts will fail too until it is.';
        warn.style.display = 'block';
      }
    }
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


// ---------- facts that follow the song on air ----------
// Shown under the player on each Radio view while a matching song plays. A fact is matched
// on the normalised artist (and title); an artist with no title applies to all their songs.
function songFactsSectionHtml() {
  return sectionHtml('Song facts',
    'A short fact under the player while a matching song plays.',
    '<p class="hint">Written by AI the first time a song plays, or typed here. A fact you type always wins and is never overwritten. Leave the song title blank for a fact about the artist that suits any of their songs.</p>' +
    '<div class="checkbox" style="margin-bottom:10px;"><input type="checkbox" id="sf_auto"><label for="sf_auto" style="margin:0;">Write a fact with AI the first time a song plays (saved with the Save button below)</label></div>' +
    '<div class="field"><label for="sf_provider">AI that writes the facts</label><select id="sf_provider">' +
    '<option value="gemini">Gemini (checks the web first when it can)</option><option value="none">No AI - only the sheet and facts I type</option><option value="groq">Groq (faster, no web check - leave facts you are unsure about to the sheet)</option>' +
    '</select><div class="hint" id="sf_provhint" style="margin-top:4px;"></div></div>' +
    '<div class="row"><div class="field"><label for="sf_hour">Most new AI facts per hour</label><input type="number" id="sf_hour" min="0" max="1000"></div>' +
    '<div class="field"><label for="sf_day">Most new AI facts per day</label><input type="number" id="sf_day" min="0" max="10000"></div></div>' +
    '<p class="hint">Songs that already have a fact never count. At the limit a new song simply shows no fact until there is room. 0 stops AI writing.</p>' +
    '<div class="field"><label for="sf_sheet">Facts from a Google Sheet (optional)</label>' +
    '<input type="text" id="sf_sheet" placeholder="https://docs.google.com/spreadsheets/d/...">' +
    '<div class="hint" style="margin-top:4px;">Columns: artist, title, fact (header row; the title can be blank for a fact about the artist). Share the sheet as anyone with the link can view, or publish it as CSV. Used before any AI, so these cost nothing. Checked every hour; rows removed from the sheet are removed here. Facts you type here are never overwritten by it. Save keeps the link.</div>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;"><button type="button" class="secondary" id="sf_sync" style="width:auto;margin:0;">Sync now</button><span class="hint" id="sf_syncmsg" style="margin:0;"></span></div></div>' +
    '<div class="row"><div class="field"><label for="sf_artist">Artist</label><input type="text" id="sf_artist"></div>' +
    '<div class="field"><label for="sf_title">Song (optional)</label><input type="text" id="sf_title"></div></div>' +
    '<div class="field"><label for="sf_body">Fact</label><textarea id="sf_body" rows="2" maxlength="400"></textarea></div>' +
    '<button type="button" id="sf_add" style="width:auto;">Add fact</button>' +
    '<div class="err" id="sf_err"></div>' +
    '<div id="sf_list" class="items" style="margin-top:12px;"><div class="empty">Loading…</div></div>');
}

async function loadSongFacts() {
  const host = $('sf_list');
  if (!host) return;
  try {
    const data = await api('/song-facts', { method: 'GET' });
    const items = data.items || [];
    const pv = $('sf_provider').value;
    const missing = pv === 'none' ? false : pv === 'groq' ? !data.groqConfigured : !data.geminiConfigured;
    $('sf_provhint').textContent = missing ? 'This AI is not set up on the server (its key is missing), so no facts will be written by it.' : '';
    if (data.lastSync) $('sf_syncmsg').textContent = 'Last sync ' + String(data.lastSync.at).slice(0, 16).replace('T', ' ') + ' UTC: ' + data.lastSync.message;
    if (!items.length) { host.innerHTML = '<div class="empty">No facts yet. They appear here as songs play.</div>'; return; }
    host.innerHTML = items.map((f) => {
      const who = f.title ? f.artist + ' - ' + f.title : f.artist + ' (any song)';
      const marker = f.body ? '' : ' <span class="badge expired">no fact found</span>';
      return '<div class="item" data-id="' + f.id + '"><div class="lead"><div style="flex:1;min-width:0;">' +
        '<div class="title">' + escapeHtml(who) + ' <span class="badge ' + (f.source === 'manual' ? 'live' : 'draft') + '">' + (f.source === 'manual' ? 'typed' : f.source === 'sheet' ? 'sheet' : 'AI') + '</span>' +
        (f.enabled || !f.body ? '' : ' <span class="badge expired">off</span>') + marker + '</div>' +
        '<div class="meta">' + escapeHtml(f.body) + '</div></div>' +
        '<div class="actions">' +
        '<button type="button" class="secondary sfEdit" data-id="' + f.id + '">Edit</button>' +
        (f.body ? '<button type="button" class="secondary sfToggle" data-id="' + f.id + '">' + (f.enabled ? 'Turn off' : 'Turn on') + '</button>' : '') +
        '<button type="button" class="secondary sfDel" data-id="' + f.id + '">Delete</button></div></div></div>';
    }).join('');
    const byId = {};
    items.forEach((f) => { byId[f.id] = f; });
    host.querySelectorAll('.sfEdit').forEach((b) => b.addEventListener('click', async () => {
      const f = byId[b.dataset.id];
      const next = window.prompt('Fact for ' + f.artist + (f.title ? ' - ' + f.title : ''), f.body || '');
      if (next === null) return;
      try { await api('/song-facts/' + f.id, { method: 'PATCH', body: JSON.stringify({ body: next, enabled: true }) }); loadSongFacts(); }
      catch (e) { $('sf_err').textContent = e.message; }
    }));
    host.querySelectorAll('.sfToggle').forEach((b) => b.addEventListener('click', async () => {
      const f = byId[b.dataset.id];
      try { await api('/song-facts/' + f.id, { method: 'PATCH', body: JSON.stringify({ body: f.body, enabled: !f.enabled }) }); loadSongFacts(); }
      catch (e) { $('sf_err').textContent = e.message; }
    }));
    host.querySelectorAll('.sfDel').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Delete this fact? A new one may be written by AI the next time the song plays.')) return;
      try { await api('/song-facts/' + b.dataset.id, { method: 'DELETE' }); loadSongFacts(); }
      catch (e) { $('sf_err').textContent = e.message; }
    }));
  } catch (e) {
    host.innerHTML = '<div class="empty">Could not load the facts: ' + escapeHtml(e.message) + '</div>';
  }
}

document.addEventListener('click', async (ev) => {
  if (ev.target && ev.target.id === 'sf_sync') {
    const msg = $('sf_syncmsg');
    msg.textContent = 'Syncing...';
    try {
      const r = await api('/song-facts/sync', { method: 'POST', body: JSON.stringify({ url: $('sf_sheet').value.trim() }) });
      msg.textContent = r.message + ' Added ' + r.added + ', updated ' + r.updated + ', removed ' + r.removed + ', skipped ' + r.skipped + '. Press Save to keep this link.';
      loadSongFacts();
    } catch (e) { msg.textContent = 'Sync failed: ' + e.message; }
    return;
  }
  if (!ev.target || ev.target.id !== 'sf_add') return;
  const err = $('sf_err');
  err.textContent = '';
  try {
    await api('/song-facts', { method: 'POST', body: JSON.stringify({ artist: $('sf_artist').value, title: $('sf_title').value, body: $('sf_body').value }) });
    $('sf_artist').value = ''; $('sf_title').value = ''; $('sf_body').value = '';
    loadSongFacts();
  } catch (e) { err.textContent = e.message; }
});

// ---------- countdown charts ----------
// The dashboard saved countdowns, shown on a station Radio screen. Ticking a station saves
// that countdown chart every day from then on; the past-charts settings below are saved
// with the page Save button, the ticks and the Clear button act immediately.
function countdownChartsSectionHtml() {
  return sectionHtml('Countdown charts',
    'Show a saved countdown on a station Radio screen, with optional past days.',
    '<p class="hint">These are the countdowns saved on the dashboard Countdown page. Tick Radio and/or Xtra to show that countdown chart (the songs on air today) in the app. ' +
    'History is saved from the moment you tick it, so past days only exist from then on.</p>' +
    '<div class="err" id="cc_err"></div>' +
    '<div id="cc_list" class="items"><div class="empty">Loading…</div></div>' +
    '<div class="field" style="margin-top:14px;"><label for="cfg_cc_mode">Past charts in the app</label><select id="cfg_cc_mode">' +
    '<option value="off">Today only</option>' +
    '<option value="week">Up to a week back</option>' +
    '<option value="month">Up to a month back</option>' +
    '<option value="custom">Back to a date I choose</option></select></div>' +
    '<div class="field" id="cc_customWrap" style="display:none;"><label for="cfg_cc_from">Earliest date listeners can view</label><input type="date" id="cfg_cc_from"></div>' +
    '<div class="field"><label for="cfg_cc_keep">Keep saved days for (days)</label><input type="number" id="cfg_cc_keep" min="7" max="3650">' +
    '<p class="hint" style="margin-top:4px;">Older days are deleted automatically. A day is about half a kilobyte, and a day where the chart did not change is not stored again.</p></div>' +
    '<p class="hint" id="cc_stats"></p>' +
    '<div class="actions"><button type="button" class="secondary" id="cc_clear" style="width:auto;">Clear saved history</button></div>');
}

function ccFmtBytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }
function ccToggleCustom() { $('cc_customWrap').style.display = $('cfg_cc_mode').value === 'custom' ? '' : 'none'; }

async function loadCountdownCharts() {
  const host = $('cc_list');
  if (!host) return;
  try {
    const data = await api('/countdown-charts', { method: 'GET' });
    $('cc_err').textContent = data.warning || '';
    const t = data.totals || { savedDays: 0, bytes: 0 };
    $('cc_stats').textContent = 'Stored now: ' + t.savedDays + ' saved chart day(s), ' + ccFmtBytes(t.bytes) + ' in total.';
    const items = data.items || [];
    if (!items.length) { host.innerHTML = '<div class="empty">No saved countdowns yet. Create one on the dashboard Countdown page.</div>'; return; }
    host.innerHTML = items.map((c) => {
      const has = (s) => (c.stations || []).indexOf(s) !== -1;
      const onAir = c.building ? 'being rebuilt right now' : (c.onAir ? c.onAir + ' songs on air' : 'nothing built yet');
      const saved = c.savedDays ? c.savedDays + ' day(s) saved since ' + c.firstDay : 'no history yet';
      return '<div class="item"><div class="lead"><div style="flex:1;min-width:0;">' +
        '<div class="title">' + escapeHtml(c.name) + '</div>' +
        '<div class="meta">' + escapeHtml(onAir) + ' - ' + escapeHtml(saved) + (c.error ? ' - ' + escapeHtml(c.error) : '') + '</div></div>' +
        '<div class="actions" style="gap:12px;align-items:center;">' +
        '<label style="white-space:nowrap;"><input type="checkbox" class="ccBox" data-id="' + escapeHtml(c.id) + '" data-st="radio"' + (has('radio') ? ' checked' : '') + '> Radio</label>' +
        '<label style="white-space:nowrap;"><input type="checkbox" class="ccBox" data-id="' + escapeHtml(c.id) + '" data-st="xtra"' + (has('xtra') ? ' checked' : '') + '> Xtra</label>' +
        '</div></div></div>';
    }).join('');
    host.querySelectorAll('.ccBox').forEach((b) => b.addEventListener('change', async () => {
      const id = b.dataset.id;
      const stations = Array.from(host.querySelectorAll('.ccBox')).filter((x) => x.dataset.id === id && x.checked).map((x) => x.dataset.st);
      $('cc_err').textContent = '';
      try { await api('/countdown-charts/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ stations: stations }) }); loadCountdownCharts(); }
      catch (e) { $('cc_err').textContent = e.message; loadCountdownCharts(); }
    }));
  } catch (e) {
    host.innerHTML = '<div class="empty">Could not load the countdowns: ' + escapeHtml(e.message) + '</div>';
  }
}

document.addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'cfg_cc_mode') ccToggleCustom();
});

document.addEventListener('click', async (ev) => {
  if (!ev.target || ev.target.id !== 'cc_clear') return;
  if (!confirm('Clear all saved chart history? Today chart stays on the app, and history starts again from today. This cannot be undone.')) return;
  $('cc_err').textContent = '';
  try {
    const r = await api('/countdown-charts/history?confirm=yes', { method: 'DELETE' });
    $('cc_err').textContent = 'Cleared ' + r.removed + ' saved day(s).';
    loadCountdownCharts();
  } catch (e) { $('cc_err').textContent = 'Could not clear: ' + e.message; }
});

// ---------- charts per station ----------
// A chart reaches listeners only once it is assigned here. Assigning takes a snapshot, so
// the app never depends on the dashboard being reachable.
function stationChartsSectionHtml() {
  return sectionHtml('Charts per station',
    'Choose which charts show in each station view of the app.',
    '<p class="hint">Charts are made on the dashboard Charts page. Nothing shows in the app until you tick a station here. Un-tick both to remove a chart from the app.</p>' +
    '<div class="err" id="sc_err"></div>' +
    '<div id="sc_list" class="items"><div class="empty">Loading…</div></div>');
}

async function loadStationCharts() {
  const host = $('sc_list');
  if (!host) return;
  try {
    const data = await api('/station-charts', { method: 'GET' });
    $('sc_err').textContent = data.warning || '';
    const items = data.items || [];
    if (!items.length) { host.innerHTML = '<div class="empty">No charts yet. Generate one on the dashboard Charts page.</div>'; return; }
    host.innerHTML = items.map((c) => {
      const has = (s) => (c.stations || []).indexOf(s) !== -1;
      return '<div class="item" data-id="' + escapeHtml(c.id) + '"><div class="lead"><div style="flex:1;min-width:0;">' +
        '<div class="title">' + escapeHtml(c.title) + '</div>' +
        '<div class="meta">' + c.count + ' songs - ' + escapeHtml(String(c.date || '').slice(0, 10)) + '</div></div>' +
        '<div class="actions" style="gap:12px;align-items:center;">' +
        '<label style="white-space:nowrap;"><input type="checkbox" class="scBox" data-id="' + escapeHtml(c.id) + '" data-st="radio"' + (has('radio') ? ' checked' : '') + '> Radio</label>' +
        '<label style="white-space:nowrap;"><input type="checkbox" class="scBox" data-id="' + escapeHtml(c.id) + '" data-st="xtra"' + (has('xtra') ? ' checked' : '') + '> Xtra</label>' +
        '</div></div></div>';
    }).join('');
    host.querySelectorAll('.scBox').forEach((b) => b.addEventListener('change', async () => {
      const id = b.dataset.id;
      const stations = Array.from(host.querySelectorAll('.scBox')).filter((x) => x.dataset.id === id && x.checked).map((x) => x.dataset.st);
      $('sc_err').textContent = '';
      try { await api('/station-charts/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ stations: stations }) }); }
      catch (e) { $('sc_err').textContent = e.message; loadStationCharts(); }
    }));
  } catch (e) {
    host.innerHTML = '<div class="empty">Could not load the charts: ' + escapeHtml(e.message) + '</div>';
  }
}

function setAllSections(open) {
  document.querySelectorAll('#controlsForm details.section').forEach((d) => { d.open = open; });
}
$('expandAll').addEventListener('click', (e) => { e.preventDefault(); setAllSections(true); });
$('collapseAll').addEventListener('click', (e) => { e.preventDefault(); setAllSections(false); });

async function loadControls() {
  $('controlsMsg').textContent = '';
  try {
    if (!$('controlsForm').innerHTML) { renderControls(); srWire(); }
    controlsConfig = await api('/app-config', { method: 'GET' });
    fillControls(controlsConfig);
  } catch (e) {
    $('controlsMsg').style.color = '#FF0056';
    $('controlsMsg').textContent = 'Could not load: ' + e.message;
  }
}

$('saveControlsBtn').addEventListener('click', async () => {
  const msg = $('controlsMsg');
  msg.style.color = '#519DC5';
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
    next.songFacts = { autoGenerate: $('sf_auto').checked, maxPerHour: Number($('sf_hour').value), maxPerDay: Number($('sf_day').value), provider: $('sf_provider').value, sheetUrl: $('sf_sheet').value.trim() };
    next.charts = { pastMode: $('cfg_cc_mode').value, customFrom: $('cfg_cc_from').value, keepDays: Number($('cfg_cc_keep').value) };
    // Merged, not replaced: the switches and the closed message were just set by the loop
    // above, and this adds only the schedules. It throws on a half-finished window, before
    // anything is sent.
    next.songRequests = Object.assign({}, next.songRequests, collectSongRequests());
    controlsConfig = await api('/app-config', { method: 'PUT', body: JSON.stringify(next) });
    fillControls(controlsConfig);
    msg.textContent = 'Saved. Phones pick this up the next time the app opens. Anything left blank or invalid (for example a link that is not https) was reset to the default.';
  } catch (e) {
    msg.style.color = '#FF0056';
    msg.textContent = 'Could not save: ' + e.message;
  }
});

// ---------- song request windows ----------
// When each station takes requests. One window is one repeat pattern plus the times of
// day inside it, so "weekdays 10-13 and 16-19, all day Saturday" is two windows. The
// rules live server-side in lib/requestWindows.ts; this is only the editor for them.
// Held as state and re-rendered on every structural change, because a window's fields
// depend on its repeat type. Text and time inputs write back on 'change' and do NOT
// re-render, so typing is never interrupted.
const REQ_STATIONS = [['radio', 'EJazz Radio'], ['xtra', 'EJazz Xtra']];
const REQ_REPEATS = [
  ['daily', 'Every day'],
  ['weekly', 'Days of the week'],
  ['monthly', 'Dates of the month'],
  ['dates', 'Specific dates'],
];
let srState = { radio: { mode: 'always', windows: [] }, xtra: { mode: 'always', windows: [] } };

function srMinutes(value) {
  const parts = String(value || '').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}
function srTime(minute) {
  if (minute >= 1440) return '23:59';
  return pad2(Math.floor(minute / 60)) + ':' + pad2(minute % 60);
}
function srBlankWindow() {
  return { id: '', label: '', repeatMode: 'daily', daysOfWeek: [1, 2, 3, 4, 5], datesOfMonth: [1], dates: [], slots: [{ startMinute: 600, endMinute: 780 }], enabled: true };
}

/** The part of the Song requests section that the declarative field list cannot express. */
function songRequestsExtraHtml() {
  const blocks = REQ_STATIONS.map((s) => {
    const key = s[0];
    return '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(242,244,255,0.08);">' +
      '<h3>' + escapeHtml(s[1]) + '</h3>' +
      '<div class="srnow" id="sr_now_' + key + '">Checking…</div>' +
      '<div class="field"><label for="sr_mode_' + key + '">When requests are taken</label>' +
      '<select id="sr_mode_' + key + '">' +
      '<option value="always">Any time the switch above is on</option>' +
      '<option value="scheduled">Only at the times below</option>' +
      '</select></div>' +
      '<div id="sr_wins_' + key + '"></div>' +
      '<button type="button" class="secondary" id="sr_add_' + key + '">Add a request window</button>' +
      '</div>';
  }).join('');
  return '<p class="hint">The switches above are each station’s own on/off. The hours below apply only to a station set to ' +
    '"Only at the times below" — outside them the app and the website widget say requests are closed and show no form. ' +
    'Times are East Africa Time. Several windows per station, several times a day, repeating daily, on chosen weekdays, ' +
    'on dates of the month, or on exact dates.</p>' +
    '<p class="hint">A window closes the FORM. The station’s own request API stays reachable, so this is a published ' +
    'opening time, not a lock — which is all a song request needs.</p>' +
    blocks +
    '<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(242,244,255,0.08);">' +
    '<h3>Put the request form on the website</h3>' +
    '<p class="hint">This replaces the AzuraCast request page the site embeds now, which takes requests around the clock ' +
    'because it knows nothing about the hours above. Paste one of these into a Custom HTML block (WP Admin &rarr; the page ' +
    'or widget area) in place of the old iframe. It closes itself when a window ends, with no reload.</p>' +
    '<div class="field"><label for="sr_snippet_station">Snippet for</label>' +
    '<select id="sr_snippet_station"><option value="xtra">EJazz Xtra (searchable library)</option><option value="radio">EJazz Radio (written request)</option></select></div>' +
    '<textarea id="sr_snippet" rows="7" readonly style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;"></textarea>' +
    '<button type="button" class="secondary" id="sr_copy">Copy the snippet</button>' +
    '<span class="okmsg" id="sr_copied"></span></div>';
}

function srSnippet(station) {
  const src = 'https://control.ejazzug.com/embed/requests?station=' + station;
  const nl = String.fromCharCode(10);
  return [
    '<iframe src="' + src + '" title="Song requests" id="ejazzRequests"',
    '        style="width:100%;border:0;min-height:420px" height="480" loading="lazy"></iframe>',
    '<script>',
    'window.addEventListener("message", function (e) {',
    '  if (e.origin !== "https://control.ejazzug.com") return;',
    '  var h = e.data && e.data.ejazzRequestsHeight;',
    '  var f = document.getElementById("ejazzRequests");',
    '  if (h && f) f.style.height = h + "px";',
    '});',
    '<' + '/script>',
  ].join(nl);
}

function srRenderSnippet() {
  $('sr_snippet').value = srSnippet($('sr_snippet_station').value);
  $('sr_copied').textContent = '';
}

/** What the station is doing right now, read back from the public endpoint. */
function srLoadStatus() {
  REQ_STATIONS.forEach((s) => {
    const key = s[0];
    const box = $('sr_now_' + key);
    if (!box) return;
    fetch('/api/song-requests?station=' + key, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => {
        const label = d.open ? 'Open right now' : 'Closed right now';
        box.textContent = d.nextChangeLabel ? label + ' — ' + d.nextChangeLabel.toLowerCase() : label;
        box.className = 'srnow' + (d.open ? ' open' : '');
      })
      .catch(() => { box.textContent = 'Could not read the current state.'; box.className = 'srnow'; });
  });
}

function srRender(station) {
  const host = $('sr_wins_' + station);
  if (!host) return;
  const state = srState[station];
  $('sr_mode_' + station).value = state.mode;
  host.innerHTML = '';
  // The windows only matter on a scheduled station; hiding them on "any time" keeps a
  // schedule that is not in force from reading as if it were.
  host.style.display = state.mode === 'scheduled' ? '' : 'none';
  $('sr_add_' + station).style.display = state.mode === 'scheduled' ? '' : 'none';
  if (state.mode !== 'scheduled') return;
  if (!state.windows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No windows yet, so requests never open. Add one.';
    host.appendChild(empty);
  }
  state.windows.forEach((win, index) => host.appendChild(srWindowCard(station, win, index)));
}

function srWindowCard(station, win, index) {
  const card = document.createElement('div');
  card.className = 'wcard';

  const head = document.createElement('div');
  head.className = 'wcard-head';
  const label = document.createElement('input');
  label.type = 'text';
  label.placeholder = 'Name this window (optional, e.g. Drive time)';
  label.maxLength = 60;
  label.value = win.label || '';
  label.onchange = () => { win.label = label.value; };
  head.appendChild(label);

  const onBox = document.createElement('label');
  onBox.className = 'wcard-on';
  const on = document.createElement('input');
  on.type = 'checkbox';
  on.checked = win.enabled !== false;
  on.onchange = () => { win.enabled = on.checked; srRender(station); };
  onBox.appendChild(on);
  onBox.appendChild(document.createTextNode('On'));
  head.appendChild(onBox);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'secondary';
  del.textContent = 'Remove';
  del.onclick = () => { srState[station].windows.splice(index, 1); srRender(station); };
  head.appendChild(del);
  card.appendChild(head);

  const repeatField = document.createElement('div');
  repeatField.className = 'field';
  const repeatLabel = document.createElement('label');
  repeatLabel.textContent = 'Repeats';
  const repeat = document.createElement('select');
  REQ_REPEATS.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r[0];
    opt.textContent = r[1];
    repeat.appendChild(opt);
  });
  repeat.value = win.repeatMode || 'daily';
  repeat.onchange = () => { win.repeatMode = repeat.value; srRender(station); };
  repeatField.appendChild(repeatLabel);
  repeatField.appendChild(repeat);
  card.appendChild(repeatField);

  if (win.repeatMode === 'weekly') {
    const field = document.createElement('div');
    field.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = 'Which days';
    field.appendChild(lab);
    const grid = document.createElement('div');
    grid.className = 'pickgrid';
    DAY_SHORT.forEach((name, day) => {
      const wrap = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = (win.daysOfWeek || []).indexOf(day) !== -1;
      box.onchange = () => {
        const days = (win.daysOfWeek || []).filter((d) => d !== day);
        if (box.checked) days.push(day);
        win.daysOfWeek = days.sort((a, b) => a - b);
        srRender(station);
      };
      wrap.appendChild(box);
      wrap.appendChild(document.createTextNode(name));
      grid.appendChild(wrap);
    });
    field.appendChild(grid);
    const picks = document.createElement('p');
    picks.className = 'hint';
    picks.style.margin = '6px 0 0';
    [['every day', [0, 1, 2, 3, 4, 5, 6]], ['Mon–Fri', [1, 2, 3, 4, 5]], ['weekend', [0, 6]]].forEach((p, i) => {
      if (i) picks.appendChild(document.createTextNode(' · '));
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = p[0];
      a.onclick = (e) => { e.preventDefault(); win.daysOfWeek = p[1].slice(); srRender(station); };
      picks.appendChild(a);
    });
    field.appendChild(picks);
    card.appendChild(field);
  }

  if (win.repeatMode === 'monthly') {
    const field = document.createElement('div');
    field.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = 'Which dates of the month';
    field.appendChild(lab);
    const grid = document.createElement('div');
    grid.className = 'pickgrid';
    for (let date = 1; date <= 31; date += 1) {
      const day = date;
      const wrap = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = (win.datesOfMonth || []).indexOf(day) !== -1;
      box.onchange = () => {
        const dates = (win.datesOfMonth || []).filter((d) => d !== day);
        if (box.checked) dates.push(day);
        win.datesOfMonth = dates.sort((a, b) => a - b);
        srRender(station);
      };
      wrap.appendChild(box);
      wrap.appendChild(document.createTextNode(String(day)));
      grid.appendChild(wrap);
    }
    field.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'hint';
    note.style.margin = '6px 0 0';
    note.textContent = 'A month without that date (the 31st, say) simply skips it.';
    field.appendChild(note);
    card.appendChild(field);
  }

  if (win.repeatMode === 'dates') {
    const field = document.createElement('div');
    field.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = 'Exact dates';
    field.appendChild(lab);
    const row = document.createElement('div');
    row.className = 'slotrow';
    const pick = document.createElement('input');
    pick.type = 'date';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary';
    add.textContent = 'Add this date';
    add.onclick = () => {
      const value = pick.value;
      if (!value) return;
      const dates = (win.dates || []).slice();
      if (dates.indexOf(value) === -1) dates.push(value);
      win.dates = dates.sort();
      srRender(station);
    };
    row.appendChild(pick);
    row.appendChild(add);
    field.appendChild(row);
    const chips = document.createElement('div');
    chips.className = 'chips';
    (win.dates || []).forEach((date) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.appendChild(document.createTextNode(date));
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.onclick = () => { win.dates = (win.dates || []).filter((d) => d !== date); srRender(station); };
      chip.appendChild(x);
      chips.appendChild(chip);
    });
    field.appendChild(chips);
    card.appendChild(field);
  }

  const times = document.createElement('div');
  times.className = 'field';
  const timesLabel = document.createElement('label');
  timesLabel.textContent = 'Open from / to';
  times.appendChild(timesLabel);
  (win.slots || []).forEach((slot, slotIndex) => {
    const row = document.createElement('div');
    row.className = 'slotrow';
    const from = document.createElement('input');
    from.type = 'time';
    from.value = srTime(slot.startMinute);
    from.onchange = () => { const m = srMinutes(from.value); if (m !== null) slot.startMinute = m; };
    const dash = document.createElement('span');
    dash.className = 'dash';
    dash.textContent = 'to';
    const to = document.createElement('input');
    to.type = 'time';
    to.value = srTime(slot.endMinute);
    to.onchange = () => { const m = srMinutes(to.value); if (m !== null) slot.endMinute = m; };
    row.appendChild(from);
    row.appendChild(dash);
    row.appendChild(to);
    if ((win.slots || []).length > 1) {
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.textContent = 'Remove';
      drop.onclick = () => { win.slots.splice(slotIndex, 1); srRender(station); };
      row.appendChild(drop);
    }
    times.appendChild(row);
  });
  const addTime = document.createElement('button');
  addTime.type = 'button';
  addTime.className = 'secondary';
  addTime.textContent = 'Add another time';
  addTime.onclick = () => {
    win.slots = (win.slots || []).concat([{ startMinute: 960, endMinute: 1140 }]);
    srRender(station);
  };
  times.appendChild(addTime);
  const timeHint = document.createElement('p');
  timeHint.className = 'hint';
  timeHint.style.margin = '6px 0 0';
  timeHint.textContent = 'Several times in the same day are fine. A window cannot cross midnight: '
    + 'for 23:00 to 01:00, use 23:00 to 23:59 and a second time from 00:00 to 01:00.';
  times.appendChild(timeHint);
  card.appendChild(times);
  return card;
}

function fillSongRequests(cfg) {
  const sr = cfg.songRequests || {};
  REQ_STATIONS.forEach((s) => {
    const key = s[0];
    const stored = sr[key] || {};
    srState[key] = {
      mode: stored.mode === 'scheduled' ? 'scheduled' : 'always',
      windows: (stored.windows || []).map((w) => ({
        id: w.id || '',
        label: w.label || '',
        repeatMode: w.repeatMode || 'daily',
        daysOfWeek: (w.daysOfWeek || []).slice(),
        datesOfMonth: (w.datesOfMonth || []).slice(),
        dates: (w.dates || []).slice(),
        slots: (w.slots || []).map((sl) => ({ startMinute: sl.startMinute, endMinute: sl.endMinute })),
        enabled: w.enabled !== false,
      })),
    };
    srRender(key);
  });
  srRenderSnippet();
  srLoadStatus();
}

/**
 * Refuse rather than quietly fix. normalizeStationSchedule() on the server coerces a
 * half-finished window (a weekly pattern with no days becomes every day) so one bad
 * window cannot take the whole config down -- which is right for a save that has already
 * happened, and wrong for one the operator is making now: nobody checks the app until a
 * listener notices requests are open on the wrong day.
 */
function collectSongRequests() {
  const out = {};
  REQ_STATIONS.forEach((s) => {
    const key = s[0];
    const name = s[1];
    const state = srState[key];
    if (state.mode === 'scheduled' && !state.windows.filter((w) => w.enabled !== false).length) {
      throw new Error(name + ' is set to open only at the times below, but has no window switched on, so requests would never open.');
    }
    state.windows.forEach((win, i) => {
      const where = name + ', window ' + (i + 1) + (win.label ? ' (' + win.label + ')' : '');
      if (!win.slots.length) throw new Error(where + ' has no times.');
      win.slots.forEach((slot) => {
        if (!Number.isInteger(slot.startMinute) || !Number.isInteger(slot.endMinute) || slot.endMinute <= slot.startMinute) {
          throw new Error(where + ': each time must end after it starts, inside the same day.');
        }
      });
      if (win.repeatMode === 'weekly' && !win.daysOfWeek.length) throw new Error(where + ': pick at least one day of the week.');
      if (win.repeatMode === 'monthly' && !win.datesOfMonth.length) throw new Error(where + ': pick at least one date of the month.');
      if (win.repeatMode === 'dates' && !win.dates.length) throw new Error(where + ': add at least one date.');
    });
    out[key] = { mode: state.mode, windows: state.windows };
  });
  return out;
}

/** Wired once, right after the controls form is built (it is rendered only once). */
function srWire() {
  REQ_STATIONS.forEach((st) => {
    const key = st[0];
    $('sr_mode_' + key).onchange = () => { srState[key].mode = $('sr_mode_' + key).value; srRender(key); };
    $('sr_add_' + key).onclick = () => {
      srState[key].windows = srState[key].windows.concat([srBlankWindow()]);
      srRender(key);
    };
  });
  $('sr_snippet_station').onchange = srRenderSnippet;
  $('sr_copy').onclick = () => {
    const box = $('sr_snippet');
    box.select();
    // navigator.clipboard needs a secure context and a permission the admin page may not
    // have; the textarea is selected either way, so Ctrl+C always works.
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
    $('sr_copied').textContent = copied ? 'Copied.' : 'Selected — press Ctrl+C to copy.';
  };
}

// ---------- programme line-up ----------
// One entry per show-on-a-station, with a repeat pattern and one or more times in the
// day. The server flattens that into per-day rows for the app (lib/showSchedule.ts), so
// this page never has to think about the shape the app reads.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATION_NAMES = { radio: 'EJazz Radio', xtra: 'EJazz Xtra' };

function minuteToTime(m) { return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60); }
function timeToMinute(t) {
  const parts = String(t || '').split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]); const m = Number(parts[1]);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

let scheduleStation = 'radio';   // which station's line-up is on screen
let showEntries = [];            // what the server last told us
let editingShowId = null;        // null = the form is adding, not editing
let formDates = [];              // staged "specific dates", newest edit wins
let formSlots = [{ start: '', end: '' }];

// ---- the day / date-of-month pickers, built once ----
function buildPickers() {
  $('dayBoxes').innerHTML = DAY_NAMES.map((name, i) =>
    '<label><input type="checkbox" class="dayBox" value="' + i + '">' + DAY_SHORT[i] + '</label>'
  ).join('');
  let dom = '';
  for (let d = 1; d <= 31; d += 1) {
    dom += '<label><input type="checkbox" class="domBox" value="' + d + '">' + d + '</label>';
  }
  $('domBoxes').innerHTML = dom;
}

function checkedValues(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter((b) => b.checked)
    .map((b) => Number(b.value));
}

function setChecked(selector, values) {
  document.querySelectorAll(selector).forEach((b) => {
    b.checked = values.indexOf(Number(b.value)) !== -1;
  });
}

document.querySelectorAll('.dayPick').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const pick = link.getAttribute('data-pick');
    const map = { all: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekend: [0, 6], none: [] };
    setChecked('.dayBox', map[pick] || []);
  });
});

// ---- repeat type ----
function repeatModeChanged() {
  const mode = $('s_repeat').value;
  $('weeklyBox').style.display = mode === 'weekly' ? 'block' : 'none';
  $('monthlyBox').style.display = mode === 'monthly' ? 'block' : 'none';
  $('datesBox').style.display = mode === 'dates' ? 'block' : 'none';
}
$('s_repeat').addEventListener('change', repeatModeChanged);

// ---- specific dates ----
function renderDates() {
  const host = $('dateList');
  if (!formDates.length) {
    host.innerHTML = '<span class="meta">No dates yet.</span>';
    return;
  }
  host.innerHTML = formDates.map((d, i) =>
    '<span class="chip">' + escapeHtml(d) +
    '<button type="button" class="dropDate" data-i="' + i + '" title="Remove">&times;</button></span>'
  ).join('');
  document.querySelectorAll('.dropDate').forEach((b) => b.addEventListener('click', () => {
    formDates.splice(Number(b.getAttribute('data-i')), 1);
    renderDates();
  }));
}

$('addDateBtn').addEventListener('click', () => {
  const value = $('s_datePick').value;
  if (!value) return;
  if (formDates.indexOf(value) === -1) formDates.push(value);
  formDates.sort();
  $('s_datePick').value = '';
  renderDates();
});

// ---- times in the day ----
// Read the inputs back before every re-render, so a half-typed time is not lost when a
// row is added or removed.
function harvestSlots() {
  const rows = document.querySelectorAll('.slotrow');
  if (!rows.length) return;
  formSlots = Array.from(rows).map((row) => ({
    start: row.querySelector('.slotStart').value,
    end: row.querySelector('.slotEnd').value,
  }));
}

function renderSlots() {
  $('slotList').innerHTML = formSlots.map((slot, i) =>
    '<div class="slotrow">' +
    '<input type="time" class="slotStart" value="' + escapeHtml(slot.start) + '">' +
    '<span class="dash">to</span>' +
    '<input type="time" class="slotEnd" value="' + escapeHtml(slot.end) + '">' +
    (formSlots.length > 1 ? '<button type="button" class="dropSlot" data-i="' + i + '">Remove</button>' : '') +
    '</div>'
  ).join('');
  document.querySelectorAll('.dropSlot').forEach((b) => b.addEventListener('click', () => {
    harvestSlots();
    formSlots.splice(Number(b.getAttribute('data-i')), 1);
    if (!formSlots.length) formSlots = [{ start: '', end: '' }];
    renderSlots();
  }));
}

$('addSlotBtn').addEventListener('click', () => {
  harvestSlots();
  formSlots.push({ start: '', end: '' });
  renderSlots();
});

// ---- artwork preview ----
function refreshImagePreview() {
  const value = $('s_image').value.trim();
  const ok = value.indexOf('https://') === 0;
  $('imagePreviewBox').style.display = ok ? 'block' : 'none';
  if (ok) $('imagePreview').src = value;
}
$('s_image').addEventListener('change', refreshImagePreview);
$('s_image').addEventListener('blur', refreshImagePreview);

// ---- station sub-tabs ----
document.querySelectorAll('.stationBtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stationBtn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    scheduleStation = btn.getAttribute('data-station');
    // A new show typed here belongs to the station being looked at, unless an edit is
    // already in progress -- that entry keeps its own station.
    if (editingShowId === null) $('s_station').value = scheduleStation;
    renderShows();
  });
});

// ---- the form ----
function resetShowForm() {
  editingShowId = null;
  formDates = [];
  formSlots = [{ start: '', end: '' }];
  $('s_name').value = '';
  $('s_host').value = '';
  $('s_desc').value = '';
  $('s_image').value = '';
  $('s_station').value = scheduleStation;
  $('s_repeat').value = 'weekly';
  setChecked('.dayBox', []);
  setChecked('.domBox', []);
  $('showErr').textContent = '';
  $('showFormTitle').textContent = 'Add a show';
  $('showFormHint').textContent = '';
  $('saveShowBtn').textContent = 'Add show';
  $('cancelEditBtn').style.display = 'none';
  repeatModeChanged();
  renderDates();
  renderSlots();
  refreshImagePreview();
}

function editShow(id) {
  const entry = showEntries.filter((s) => s.id === id)[0];
  if (!entry) return;
  editingShowId = id;
  $('s_name').value = entry.name || '';
  $('s_host').value = entry.hostName || '';
  $('s_desc').value = entry.description || '';
  $('s_image').value = entry.imageUrl || '';
  $('s_station').value = entry.station;
  $('s_repeat').value = entry.repeatMode || 'weekly';
  setChecked('.dayBox', entry.daysOfWeek || []);
  setChecked('.domBox', entry.datesOfMonth || []);
  formDates = (entry.dates || []).slice();
  formSlots = (entry.slots || []).map((s) => ({
    start: minuteToTime(s.startMinute),
    end: minuteToTime(s.endMinute),
  }));
  if (!formSlots.length) formSlots = [{ start: '', end: '' }];
  $('showErr').textContent = '';
  $('showFormTitle').textContent = 'Editing ' + entry.name;
  $('showFormHint').textContent = STATION_NAMES[entry.station] || '';
  $('saveShowBtn').textContent = 'Save changes';
  $('cancelEditBtn').style.display = 'inline-block';
  repeatModeChanged();
  renderDates();
  renderSlots();
  refreshImagePreview();
  $('showFormBox').open = true;
  $('showFormBox').scrollIntoView({ block: 'nearest' });
}

$('cancelEditBtn').addEventListener('click', () => resetShowForm());

function collectShowPayload() {
  harvestSlots();
  const mode = $('s_repeat').value;
  const slots = [];
  for (let i = 0; i < formSlots.length; i += 1) {
    const start = timeToMinute(formSlots[i].start);
    const end = timeToMinute(formSlots[i].end);
    if (start === null || end === null) return { error: 'Every time needs both a start and an end.' };
    if (end <= start) return { error: 'A time must end after it starts (row ' + (i + 1) + ').' };
    slots.push({ startMinute: start, endMinute: end });
  }
  const payload = {
    name: $('s_name').value.trim(),
    hostName: $('s_host').value.trim(),
    station: $('s_station').value,
    repeatMode: mode,
    slots: slots,
    daysOfWeek: mode === 'weekly' ? checkedValues('.dayBox') : [],
    datesOfMonth: mode === 'monthly' ? checkedValues('.domBox') : [],
    dates: mode === 'dates' ? formDates.slice() : [],
    description: $('s_desc').value.trim(),
    imageUrl: $('s_image').value.trim(),
  };
  if (!payload.name) return { error: 'The show needs a name.' };
  if (mode === 'weekly' && !payload.daysOfWeek.length) return { error: 'Pick at least one day of the week.' };
  if (mode === 'monthly' && !payload.datesOfMonth.length) return { error: 'Pick at least one date of the month.' };
  if (mode === 'dates' && !payload.dates.length) return { error: 'Add at least one date.' };
  return { payload: payload };
}

$('saveShowBtn').addEventListener('click', async () => {
  $('showErr').textContent = '';
  const collected = collectShowPayload();
  if (collected.error) { $('showErr').textContent = collected.error; return; }
  const editing = editingShowId;
  try {
    if (editing === null) {
      await api('/shows', { method: 'POST', body: JSON.stringify(collected.payload) });
    } else {
      await api('/shows/' + editing, { method: 'PATCH', body: JSON.stringify(collected.payload) });
    }
    // Show the station that was just saved to, so the entry is visible straight away
    // even when it was moved to the other station.
    scheduleStation = collected.payload.station;
    document.querySelectorAll('.stationBtn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-station') === scheduleStation);
    });
    resetShowForm();
    $('showFormBox').open = false;
    await loadShows();
  } catch (e) {
    $('showErr').textContent = (editing === null ? 'Could not add: ' : 'Could not save: ') + e.message;
  }
});

// ---- the list ----
function slotSummary(entry) {
  return (entry.slots || []).map((s) => minuteToTime(s.startMinute) + '-' + minuteToTime(s.endMinute)).join(', ');
}

function renderShows() {
  const list = $('showsList');
  const mine = showEntries.filter((s) => s.station === scheduleStation);
  if (!mine.length) {
    list.innerHTML = '<div class="empty">Nothing on ' + escapeHtml(STATION_NAMES[scheduleStation]) +
      ' yet — add the first show above.</div>';
    return;
  }
  list.innerHTML = mine.map((s) => {
    const meta = [s.repeatSummary, slotSummary(s), s.hostName].filter(Boolean).join(' · ');
    const art = s.imageUrl
      ? '<img class="thumb" src="' + escapeHtml(s.imageUrl) + '" alt="">'
      : '';
    return '<div class="item"><div class="lead">' + art +
      '<div><div><strong>' + escapeHtml(s.name) + '</strong></div>' +
      '<div class="meta">' + escapeHtml(meta) + '</div>' +
      (s.description ? '<div class="meta">' + escapeHtml(s.description) + '</div>' : '') +
      '</div></div>' +
      '<div class="actions">' +
      '<button class="secondary editShow" data-id="' + s.id + '">Edit</button>' +
      '<button class="secondary delShow" data-id="' + s.id + '">Remove</button>' +
      '</div></div>';
  }).join('');
  document.querySelectorAll('.editShow').forEach((btn) => {
    btn.addEventListener('click', () => editShow(Number(btn.getAttribute('data-id'))));
  });
  document.querySelectorAll('.delShow').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      const entry = showEntries.filter((s) => s.id === id)[0];
      if (!confirm('Remove ' + (entry ? entry.name : 'this show') + ' from the line-up?')) return;
      try {
        await api('/shows/' + id, { method: 'DELETE' });
        if (editingShowId === id) resetShowForm();
        await loadShows();
      } catch (e) {
        $('showErr').textContent = 'Could not remove: ' + e.message;
      }
    });
  });
}

async function loadShows() {
  const list = $('showsList');
  try {
    showEntries = await api('/shows', { method: 'GET' });
    renderShows();
  } catch (e) {
    list.innerHTML = '<div class="empty">Could not load the line-up: ' + escapeHtml(e.message) + '</div>';
  }
}

buildPickers();
resetShowForm();

checkSession();
</script>
<script src="/control-room/designer.js" defer></script>
</body>
</html>`;

router.get("/", (_req, res) => {
  res.type("html").send(PAGE);
});

export default router;
