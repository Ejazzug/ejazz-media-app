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
