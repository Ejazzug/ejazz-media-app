/**
 * Does a new item of this kind need approving before it goes out?
 *
 * The POLICY lives in the dashboard -- `lib/content_os.py`, switched on by an operator on
 * /approvals -- and this service holds the DECISION, as `content_items.approval_state`. Two
 * stores, one each, and this is the only place they meet: the dashboard is asked, over
 * loopback, what the gate for a kind currently is. Keeping a copy of the policy here would
 * mean two settings that can disagree, and the one an operator could see would be the wrong
 * one.
 *
 * Two deliberate choices:
 *
 * - **It fails CLOSED.** If the dashboard cannot be reached, a new card is created `pending`.
 *   That is the recoverable direction: a card waiting on a decision is visible on /approvals
 *   and one click from live, while a card that published itself because a policy read timed
 *   out cannot be un-sent if it carried a push.
 * - **It caches for a few seconds, not minutes.** An operator who turns the gate on and
 *   immediately makes a card should see the gate apply. The cache only exists so a burst of
 *   creates is not a burst of HTTP calls.
 */
import { logger } from "./logger";

const DASHBOARD_GATE_URL =
  process.env.DASHBOARD_GATE_URL || "http://127.0.0.1:9000/api/internal/content-gate";
const TIMEOUT_MS = 2500;
const CACHE_MS = 5000;

const cache = new Map<string, { at: number; required: boolean }>();

export async function approvalRequired(kind: string): Promise<boolean> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.required;
  try {
    const r = await fetch(DASHBOARD_GATE_URL + "?kind=" + encodeURIComponent(kind), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error("the dashboard answered " + r.status);
    const body = (await r.json()) as { required?: unknown };
    // A 200 with no boolean in it is a malformed answer, not an open gate: it goes down the
    // same fail-closed path as a timeout rather than quietly approving everything.
    if (typeof body.required !== "boolean") throw new Error("the dashboard sent no gate value");
    const required = body.required;
    cache.set(kind, { at: Date.now(), required });
    return required;
  } catch (err) {
    // Fail closed, and say so: an operator wondering why every card arrives pending should
    // find the reason in the log rather than in this file.
    logger.warn({ err, kind }, "The approval policy could not be read; treating the gate as ON");
    return true;
  }
}

/** Only for tests: forget what the gate said. */
export function resetGateCache(): void {
  cache.clear();
}
