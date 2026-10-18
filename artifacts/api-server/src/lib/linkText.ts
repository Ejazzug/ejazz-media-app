/**
 * Link markup for notification bodies: [label](https://example.com).
 *
 * A system notification tray cannot hold a tappable word, so the PUSH carries the plain
 * text ("Click Here") and the in-app message screen turns the same markup into a real
 * link. Only http(s) links are ever accepted, so a pasted "javascript:" can never become
 * tappable.
 */
const MARKUP = /\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]{1,500})\)/g;

/** "Rate us [Click Here](https://x)" -> "Rate us Click Here" (what the tray shows). */
export function stripLinkMarkup(text: string): string {
  return text.replace(MARKUP, "$1");
}

/** http(s) only, no spaces, bounded length. Returns the cleaned URL or null. */
export function cleanHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 600 || /\s/.test(value)) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The first markup link in a body, used when a tap should open "the" link. */
export function firstMarkupUrl(text: string): string | null {
  MARKUP.lastIndex = 0;
  const m = MARKUP.exec(text);
  MARKUP.lastIndex = 0;
  return m ? m[2] : null;
}
