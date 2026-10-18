/**
 * Link markup in notification bodies: [Click Here](https://example.com). A system tray
 * cannot hold a tappable word, so the push carries the plain words and this screen-side
 * parser turns the same markup into real links. Bare https:// addresses are linked too.
 * Only http(s) is ever linked, so "javascript:" and friends can never become tappable.
 */
export type TextPart = { text: string; url?: string };

const MARKUP = /\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]{1,500})\)/g;
const BARE = /(https?:\/\/[^\s<>()\[\]]{3,500})/g;

export function stripLinkMarkup(text: string): string {
  return text.replace(MARKUP, '$1');
}

export function parseLinkText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const pushPlain = (chunk: string) => {
    if (!chunk) return;
    let at = 0;
    for (const m of chunk.matchAll(BARE)) {
      const start = m.index ?? 0;
      if (start > at) parts.push({ text: chunk.slice(at, start) });
      const url = m[1].replace(/[.,;:!?]+$/, '');
      parts.push({ text: url, url });
      at = start + url.length;
    }
    if (at < chunk.length) parts.push({ text: chunk.slice(at) });
  };
  for (const m of text.matchAll(MARKUP)) {
    const start = m.index ?? 0;
    pushPlain(text.slice(last, start));
    parts.push({ text: m[1], url: m[2] });
    last = start + m[0].length;
  }
  pushPlain(text.slice(last));
  return parts;
}

export function firstLinkUrl(text: string): string | null {
  return parseLinkText(text).find((p) => p.url)?.url ?? null;
}
