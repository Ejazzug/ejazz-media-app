/**
 * Tests for the website request widget (GET /embed/requests).
 *
 * The page's behaviour lives entirely in the browser script inside it, which TypeScript
 * does not check and which cannot be clicked from this box. So the script is pulled out
 * of the page exactly as a browser would get it and run against a small stand-in DOM,
 * with fetch answered by hand. That covers what actually matters: the window gate opens
 * and closes the right form, a refused request never leaks the station's error body, and
 * the two stations post to the endpoints they are supposed to.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/requestEmbedPage.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/requestEmbedPage.test.mjs && node /tmp/requestEmbedPage.test.mjs
 *
 * Touches no database and no network.
 */
import { REQUESTS_PAGE } from "../lib/requestEmbedPage";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { pass += 1; } else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}

// ---------- the page as a browser receives it ----------

const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(REQUESTS_PAGE);
check("the page carries exactly one script", Boolean(scriptMatch));
const SCRIPT = scriptMatch ? scriptMatch[1] : "";

// The two traps this file exists to keep shut: a backslash escape is eaten by the
// template literal before the browser sees it, and ${} would make the served page differ
// from the source (so none of this would prove anything about what is served).
check("no backslash anywhere in the page", !REQUESTS_PAGE.includes("\\"));
check("no template interpolation in the page", !REQUESTS_PAGE.includes("${"));

const markupIds = [...REQUESTS_PAGE.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const scriptIds = [...SCRIPT.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
check("every element the script reaches for exists in the markup",
  scriptIds.every((id) => markupIds.includes(id)),
  scriptIds.filter((id) => !markupIds.includes(id)));

// ---------- a stand-in DOM, only as much as the script uses ----------

interface FakeEl {
  tagName: string;
  children: FakeEl[];
  _class: string;
  textContent: string;
  value: string;
  type: string;
  src: string;
  alt: string;
  loading: string;
  disabled: boolean;
  onclick: null | (() => void);
  handlers: Record<string, ((e: unknown) => void)[]>;
  classList: { add(name: string): void; remove(name: string): void; contains(name: string): boolean };
  className: string;
  innerHTML: string;
  appendChild(child: FakeEl): FakeEl;
  addEventListener(name: string, fn: (e: unknown) => void): void;
  fire(name: string, event?: unknown): void;
  /** All text in this element and below it, the way a reader would see it. */
  text(): string;
  find(tag: string): FakeEl[];
}

function makeEl(tag: string): FakeEl {
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    children: [],
    _class: "",
    textContent: "",
    value: "",
    type: "",
    src: "",
    alt: "",
    loading: "",
    disabled: false,
    onclick: null,
    handlers: {},
    classList: {
      add(name: string) { if (!el._class.split(" ").includes(name)) el._class = (el._class + " " + name).trim(); },
      remove(name: string) { el._class = el._class.split(" ").filter((c) => c && c !== name).join(" "); },
      contains(name: string) { return el._class.split(" ").includes(name); },
    },
    get className() { return el._class; },
    set className(v: string) { el._class = v; },
    get innerHTML() { return ""; },
    set innerHTML(_v: string) { el.children = []; },
    appendChild(child: FakeEl) { el.children.push(child); return child; },
    addEventListener(name: string, fn: (e: unknown) => void) {
      (el.handlers[name] = el.handlers[name] || []).push(fn);
    },
    fire(name: string, event: unknown = { preventDefault() {} }) {
      (el.handlers[name] || []).forEach((fn) => fn(event));
    },
    text(): string {
      return [el.textContent, ...el.children.map((c) => c.text())].filter(Boolean).join(" ");
    },
    find(tag2: string): FakeEl[] {
      return el.children.flatMap((c) => (c.tagName === tag2.toUpperCase() ? [c, ...c.find(tag2)] : c.find(tag2)));
    },
  };
  return el;
}

type Fetched = { url: string; init: Record<string, unknown> | undefined };

function runPage(opts: { station: string; answers: (url: string) => unknown }) {
  const byId = new Map<string, FakeEl>();
  for (const id of markupIds) byId.set(id, makeEl(id === "radio" ? "form" : "div"));
  const body = makeEl("body");
  const calls: Fetched[] = [];
  let intervalFn: (() => void) | null = null;

  const doc = {
    getElementById: (id: string): FakeEl | null => byId.get(id) ?? null,
    createElement: (tag: string) => makeEl(tag),
    documentElement: { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } },
    body,
  };

  const sandbox = {
    document: doc,
    window: {
      location: { search: "?station=" + opts.station },
      parent: { postMessage() {} },
      addEventListener() {},
    },
    URLSearchParams,
    setInterval: (fn: () => void) => { intervalFn = fn; return 1; },
    fetch: (url: string, init?: Record<string, unknown>) => {
      calls.push({ url, init });
      const answer = opts.answers(url);
      if (answer instanceof Error) return Promise.reject(answer);
      const payload = answer as { status?: number; body?: unknown; text?: string };
      const text = payload.text !== undefined ? payload.text : JSON.stringify(payload.body ?? {});
      return Promise.resolve({
        ok: (payload.status ?? 200) < 400,
        status: payload.status ?? 200,
        json: () => Promise.resolve(JSON.parse(text)),
        text: () => Promise.resolve(text),
      });
    },
    Math,
    JSON,
    String,
    Number,
    Array,
    Promise,
    Error,
    encodeURIComponent,
    console,
  };

  const keys = Object.keys(sandbox);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(...keys, SCRIPT)(...keys.map((k) => (sandbox as Record<string, unknown>)[k]));
  return { byId, calls, tick: () => intervalFn?.() };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

const OPEN_XTRA = {
  body: {
    station: "xtra", stationName: "EJazz Xtra", open: true, mode: "scheduled",
    closedMessage: "Requests are closed.", closesAt: "2026-10-19T18:00:00.000Z", opensAt: null,
    nextChangeLabel: "Open until 21:00", schedule: ["Every day · 18:00-21:00"],
  },
};
const CLOSED_XTRA = {
  body: {
    station: "xtra", stationName: "EJazz Xtra", open: false, mode: "scheduled",
    closedMessage: "Requests open at 6pm.", closesAt: null, opensAt: "2026-10-19T15:00:00.000Z",
    nextChangeLabel: "Opens today at 18:00", schedule: ["Every day · 18:00-21:00"],
  },
};

async function main() {
  // ---------- closed ----------
  {
    const page = runPage({ station: "xtra", answers: () => CLOSED_XTRA });
    await settle();
    const state = page.byId.get("state")!;
    check("closed: the station's own message is shown", state.text().includes("Requests open at 6pm."), state.text());
    check("closed: says when it opens next", state.text().includes("Opens today at 18:00"));
    check("closed: lists the opening times", state.text().includes("18:00-21:00"));
    check("closed: the search form is hidden", page.byId.get("xtra")!.classList.contains("hidden"));
    check("closed: the written form is hidden too", page.byId.get("radio")!.classList.contains("hidden"));
    check("closed: nothing was asked of the station", page.calls.length === 1 && page.calls[0].url.startsWith("/api/song-requests"));
    check("closed: the status call names the station", page.calls[0].url.includes("station=xtra"));
  }

  // ---------- open, EJazz Xtra: search and request ----------
  {
    const rows = {
      body: {
        rows: [
          { request_id: "abc123", song: { art: "https://art/1", artist: "Asake", title: "WHY LOVE" } },
          { request_id: "def456", song: { art: "", artist: "", title: "Burna Boy - Last Last", text: "Burna Boy - Last Last" } },
          { song: { artist: "No", title: "Id" } },
        ],
      },
    };
    const page = runPage({
      station: "xtra",
      answers: (url) => {
        if (url.startsWith("/api/song-requests")) return OPEN_XTRA;
        if (url.includes("/requests?searchPhrase=")) return rows;
        if (url.includes("/request/abc123")) return { body: { message: "WHY LOVE has been added." } };
        // A refused id answers 404 in PLAIN TEXT, and that body carries a server path.
        if (url.includes("/request/def456")) return { status: 404, text: "Not found: /var/azuracast/www/backend/src/Thing.php line 42" };
        return { body: {} };
      },
    });
    await settle();
    check("open: the search form is shown", !page.byId.get("xtra")!.classList.contains("hidden"));
    check("open: the written form stays hidden on Xtra", page.byId.get("radio")!.classList.contains("hidden"));
    check("open: says when it closes", page.byId.get("state")!.text().includes("Open until 21:00"));

    page.byId.get("q")!.value = "  love  ";
    page.byId.get("searchBtn")!.fire("click");
    await settle();
    const searchCall = page.calls.find((c) => c.url.includes("searchPhrase="))!;
    check("search: hits AzuraCast with the trimmed term and a row count",
      searchCall.url === "https://stream.ejazzug.com/api/station/2/requests?searchPhrase=love&rowCount=25&current=1",
      searchCall.url);

    const results = page.byId.get("results")!;
    check("search: a row without a request id is dropped", results.children.length === 2, results.children.length);
    check("search: artist and title are shown as tagged", results.children[0].text().includes("WHY LOVE") && results.children[0].text().includes("Asake"));
    check("search: a title holding the whole string is split on the dash",
      results.children[1].text().includes("Last Last") && results.children[1].text().includes("Burna Boy"),
      results.children[1].text());

    const firstBtn = results.children[0].find("button")[0];
    firstBtn.onclick!();
    await settle();
    const postCall = page.calls.find((c) => c.url.includes("/request/abc123"))!;
    check("request: POSTs to the request id", postCall.init?.method === "POST");
    check("request: the station's own confirmation is shown",
      page.byId.get("xtraMsg")!.textContent === "WHY LOVE has been added.",
      page.byId.get("xtraMsg")!.textContent);
    check("request: the button says it went", firstBtn.textContent === "Sent" && firstBtn.disabled);

    const secondBtn = results.children[1].find("button")[0];
    secondBtn.onclick!();
    await settle();
    const shown = page.byId.get("xtraMsg")!.textContent;
    check("a refused request shows a plain message", shown === "That track could not be requested right now.", shown);
    check("a refused request never leaks the server path", !shown.includes("/var/azuracast"), shown);
    check("a refused request can be tried again", secondBtn.disabled === false && secondBtn.textContent === "Request");
  }

  // ---------- open, EJazz Radio: a written request ----------
  {
    const page = runPage({
      station: "radio",
      answers: (url) => {
        if (url.startsWith("/api/song-requests")) {
          return { body: { ...CLOSED_XTRA.body, station: "radio", stationName: "EJazz Radio", open: true, nextChangeLabel: "Open until 13:00" } };
        }
        if (url.includes("rpc.php")) return { body: { type: "ok", data: ["Your request is in the queue.", true] } };
        return { body: {} };
      },
    });
    await settle();
    check("radio: the written form is shown", !page.byId.get("radio")!.classList.contains("hidden"));
    check("radio: the search form stays hidden", page.byId.get("xtra")!.classList.contains("hidden"));

    const form = page.byId.get("radio")!;
    form.fire("submit");
    await settle();
    check("radio: an empty form is refused before anything is sent",
      page.byId.get("radioMsg")!.textContent.includes("all needed") && !page.calls.some((c) => c.url.includes("rpc.php")));

    page.byId.get("r_artist")!.value = "Ayra Starr";
    page.byId.get("r_title")!.value = "Rush";
    page.byId.get("r_name")!.value = "Jane";
    page.byId.get("r_email")!.value = "jane@example.com";
    page.byId.get("r_dedi")!.value = "For the team";
    form.fire("submit");
    await settle();
    const rpc = page.calls.find((c) => c.url.includes("rpc.php"))!;
    check("radio: the request goes to the station's own RPC with every field",
      rpc.url.includes("m=request.submit") && rpc.url.includes("username=ejazzug")
      && rpc.url.includes("artist=Ayra%20Starr") && rpc.url.includes("title=Rush")
      && rpc.url.includes("sender=Jane") && rpc.url.includes("email=jane%40example.com")
      && rpc.url.includes("dedi=For%20the%20team"),
      rpc.url);
    check("radio: the station's confirmation is shown",
      page.byId.get("radioMsg")!.textContent === "Your request is in the queue.");
    check("radio: the song fields are cleared for the next one",
      page.byId.get("r_artist")!.value === "" && page.byId.get("r_title")!.value === "");
    check("radio: the name and email are kept", page.byId.get("r_name")!.value === "Jane");
  }

  // ---------- the window closing while the page sits open ----------
  {
    let open = true;
    const page = runPage({
      station: "xtra",
      answers: (url) => {
        if (url.startsWith("/api/song-requests")) return open ? OPEN_XTRA : CLOSED_XTRA;
        if (url.includes("/request/abc123")) return { body: { message: "Added." } };
        if (url.includes("searchPhrase=")) return { body: { rows: [{ request_id: "abc123", song: { artist: "A", title: "B" } }] } };
        return { body: {} };
      },
    });
    await settle();
    page.byId.get("q")!.value = "b";
    page.byId.get("searchBtn")!.fire("click");
    await settle();
    page.byId.get("results")!.children[0].find("button")[0].onclick!();
    await settle();
    check("a sent request leaves a confirmation", page.byId.get("xtraMsg")!.textContent === "Added.");

    open = false;
    page.tick();
    await settle();
    check("the form closes itself when the window ends", page.byId.get("xtra")!.classList.contains("hidden"));
    check("the stale confirmation is cleared", page.byId.get("xtraMsg")!.textContent === "");
    check("the closed message replaces it", page.byId.get("state")!.text().includes("Requests open at 6pm."));
  }

  // ---------- the status endpoint unreachable ----------
  {
    const page = runPage({ station: "xtra", answers: () => new Error("offline") });
    await settle();
    const state = page.byId.get("state")!;
    check("unreachable: says so rather than guessing", state.text().includes("unavailable"), state.text());
    check("unreachable: no form is offered",
      page.byId.get("xtra")!.classList.contains("hidden") && page.byId.get("radio")!.classList.contains("hidden"));
  }

  // ---------- an unknown station falls back, it does not break ----------
  {
    const page = runPage({ station: "nonsense", answers: () => OPEN_XTRA });
    await settle();
    check("an unknown station is treated as Xtra", page.calls[0].url.includes("station=xtra"), page.calls[0].url);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
