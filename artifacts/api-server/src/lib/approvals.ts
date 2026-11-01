/**
 * The approval DECISION on a content item, and nothing else.
 *
 * The POLICY -- which kinds need approving at all, and who may approve them -- lives in the
 * dashboard: lib/content_os.py holds the per-kind gate and lib/roles.py's require() is what
 * stops a contributor approving their own work. This file only reads a decision off the wire
 * and says whether it is one.
 *
 * Two rules carried over from content_os rather than reinvented:
 *   - a REJECTION blocks regardless of policy, which is why it is a state and not a flag; and
 *   - the decision is a fact on the row, so `approval_state` defaults to "approved" and every
 *     item from before any of this existed behaves exactly as it did.
 */

export const APPROVAL_STATES = ["approved", "rejected", "pending"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

/** A note is for the person who gets the card back, so it is bounded, not unbounded. */
export const MAX_NOTE = 500;
export const MAX_BY = 80;

export interface ApprovalDecision {
  state: ApprovalState;
  note: string | null;
  by: string;
}

/** What an operator is told when a push was withheld because the card is not approved. */
export const PUSH_WITHHELD = "Not approved, so no notification was sent.";

/**
 * Whether a content row may be PUSHED, judged on its approval state alone.
 *
 * A push is the only thing this system does that cannot be taken back: "retract" keeps the
 * audit row and drops the item from the app, but the notification stays in every tray it
 * reached. So it is the one action the approval gate has to cover, and it is checked at the
 * single choke point every FCM send passes through (lib/contentPush.ts) rather than at each
 * caller -- the scheduler, both card routes and both content routes are covered by one call.
 *
 * An absent state is allowed on purpose, not by oversight: a caller that builds a partial
 * item has no row to read it from, and `approval_state` itself defaults to "approved" for
 * every row that exists, so this changes nothing for anything that worked before.
 */
export function pushAllowedByApproval(state: unknown): boolean {
  if (state === undefined || state === null || state === "") return true;
  return String(state).trim().toLowerCase() === "approved";
}

export function parseApprovalDecision(body: unknown): { decision?: ApprovalDecision; error?: string } {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

  const state = String(b.state ?? "").trim().toLowerCase();
  if (!(APPROVAL_STATES as readonly string[]).includes(state)) {
    return { error: "The decision must be " + APPROVAL_STATES.join(", ") + "." };
  }

  // WHO decided is the whole point of recording it: an approval with no name is an audit row
  // that answers nothing, so it is refused rather than stored as null.
  const by = String(b.by ?? "").trim().replace(/\s+/g, " ");
  if (!by) return { error: "Say who made this decision." };
  if (by.length > MAX_BY) return { error: "That name is longer than " + MAX_BY + " characters." };

  const noteRaw = b.note === null || b.note === undefined ? "" : String(b.note).trim();
  if (noteRaw.length > MAX_NOTE) {
    return { error: "The note is " + noteRaw.length + " characters; keep it under " + MAX_NOTE + "." };
  }
  // A rejection with no reason is the one thing an operator cannot act on, so it is required
  // there and optional everywhere else.
  if (state === "rejected" && !noteRaw) return { error: "Say why it was rejected." };

  return { decision: { state: state as ApprovalState, note: noteRaw || null, by } };
}
