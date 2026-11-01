/**
 * Tests for reading the approval policy off the dashboard.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/contentGate.test.ts --bundle --platform=node --format=esm \
 *     --packages=external --outfile=dist/contentGate.test.mjs \
 *     && node dist/contentGate.test.mjs 2>/dev/null | grep -E "^  (ok|FAIL)|^(OK|FAILED):"
 *
 * Unlike the other test files here it bundles into dist/ with --packages=external, because
 * this module logs: pino cannot be bundled into a /tmp ESM file (dynamic require), and from
 * dist/ the bare import resolves against the package's own node_modules. The grep is there
 * because the fail-closed paths log a warning, by design, into the same stdout.
 *
 * No database and no network: `fetch` is replaced. What is actually under test is the
 * direction this thing fails in -- a policy read that cannot be made must leave a new card
 * WAITING, never published, because the push a published card can carry cannot be recalled.
 */
import { approvalRequired, resetGateCache } from "./contentGate";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail === undefined ? "" : " -- " + JSON.stringify(detail))); }
}

const calls: string[] = [];
function answer(body: unknown, status = 200) {
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    calls.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  };
}
function throws(err: Error) {
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    calls.push(String(url));
    throw err;
  };
}

async function main() {
  resetGateCache();
  answer({ kind: "card", required: true });
  check("a gate that is on is reported on", (await approvalRequired("card")) === true);
  check("the kind is in the query", calls[0].includes("kind=card"), calls[0]);

  resetGateCache();
  answer({ kind: "card", required: false });
  check("a gate that is off is reported off", (await approvalRequired("card")) === false);

  // Every failure path leaves the gate ON. A card that waits is one click from live; a card
  // that published itself because a policy read timed out may already have pushed.
  resetGateCache();
  answer({ error: "unknown kind" }, 400);
  check("a 400 fails closed", (await approvalRequired("card")) === true);

  resetGateCache();
  answer({}, 500);
  check("a 500 fails closed", (await approvalRequired("card")) === true);

  resetGateCache();
  throws(new Error("connect ECONNREFUSED"));
  check("an unreachable dashboard fails closed", (await approvalRequired("card")) === true);

  resetGateCache();
  answer({ kind: "card" });
  check("a 200 with no gate value in it fails closed", (await approvalRequired("card")) === true);

  resetGateCache();
  answer({ required: "yes" });
  check("and so does a non-boolean one", (await approvalRequired("card")) === true);

  // The cache exists so a burst of creates is not a burst of HTTP calls, and it is seconds
  // long so that turning the gate on and making a card straight after behaves as expected.
  resetGateCache();
  answer({ required: false });
  calls.length = 0;
  await approvalRequired("card");
  await approvalRequired("card");
  await approvalRequired("card");
  check("a repeated read is answered from the cache", calls.length === 1, calls.length);

  // A failure is not cached: the next card asks again rather than inheriting a dead answer.
  resetGateCache();
  throws(new Error("down"));
  calls.length = 0;
  await approvalRequired("card");
  await approvalRequired("card");
  check("a failed read is never cached", calls.length === 2, calls.length);

  console.log((fail === 0 ? "OK" : "FAILED") + ": " + pass + " passed, " + fail + " failed");
  if (fail > 0) process.exit(1);
}

void main();
