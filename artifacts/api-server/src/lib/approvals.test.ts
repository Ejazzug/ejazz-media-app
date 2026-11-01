/**
 * Tests for reading an approval decision off the wire.
 *
 * There is no test runner in this repo, so it is bundled and run directly:
 *
 *   cd artifacts/api-server
 *   npx esbuild src/lib/approvals.test.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/approvals.test.mjs && node /tmp/approvals.test.mjs
 *
 * Touches no database and no network.
 */
import { parseApprovalDecision, APPROVAL_STATES, MAX_NOTE, MAX_BY } from "./approvals";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { pass += 1; } else { fail += 1; console.log("FAIL:", label, extra ?? ""); }
}

check("the three states are approved, rejected and pending",
  JSON.stringify(APPROVAL_STATES) === JSON.stringify(["approved", "rejected", "pending"]));

let r = parseApprovalDecision({ state: "approved", by: "jj" });
check("an approval needs no note", r.decision?.state === "approved" && r.decision?.note === null, r);
check("and records who", r.decision?.by === "jj");

r = parseApprovalDecision({ state: "APPROVED", by: "  JJ  Mukasa " });
check("the state is case-insensitive", r.decision?.state === "approved", r);
check("the name is tidied, not rejected", r.decision?.by === "JJ Mukasa", r.decision);

r = parseApprovalDecision({ state: "rejected", by: "jj", note: "  The stat is wrong.  " });
check("a rejection keeps its reason, trimmed", r.decision?.note === "The stat is wrong.", r.decision);

r = parseApprovalDecision({ state: "rejected", by: "jj" });
check("a rejection with no reason is refused -- it is the one thing nobody can act on",
  r.error?.includes("why") === true, r);

r = parseApprovalDecision({ state: "approved" });
check("a decision with no name is refused", r.error?.includes("who") === true, r);
r = parseApprovalDecision({ state: "approved", by: "   " });
check("and whitespace is not a name", r.error?.includes("who") === true, r);

r = parseApprovalDecision({ state: "maybe", by: "jj" });
check("an unknown state is refused and the three are named",
  r.error?.includes("approved, rejected, pending") === true, r);
r = parseApprovalDecision({ by: "jj" });
check("a missing state is refused", Boolean(r.error), r);
r = parseApprovalDecision("not an object");
check("a non-object body is refused, not crashed into", Boolean(r.error), r);
r = parseApprovalDecision(null);
check("neither is null", Boolean(r.error), r);

r = parseApprovalDecision({ state: "pending", by: "jj", note: "n".repeat(MAX_NOTE) });
check("a note at the limit is kept", r.decision?.note?.length === MAX_NOTE, r.error);
r = parseApprovalDecision({ state: "pending", by: "jj", note: "n".repeat(MAX_NOTE + 1) });
check("one over is refused, with both numbers",
  r.error?.includes(String(MAX_NOTE + 1)) === true && r.error?.includes(String(MAX_NOTE)) === true, r);
r = parseApprovalDecision({ state: "approved", by: "x".repeat(MAX_BY + 1) });
check("an over-long name is refused", r.error?.includes(String(MAX_BY)) === true, r);

r = parseApprovalDecision({ state: "pending", by: "jj" });
check("sending it back to pending is a decision like any other", r.decision?.state === "pending", r);

console.log((fail === 0 ? "OK" : "FAILED") + ": " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
