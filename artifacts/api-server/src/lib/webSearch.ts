export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.SEARXNG_URL);
}

export async function searchWeb(query: string, count = 5): Promise<SearchResult[]> {
  const base = process.env.SEARXNG_URL;
  if (!base) {
    throw new Error("SEARXNG_URL is not set");
  }
  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const headers: Record<string, string> = {};
  const secret = process.env.SEARXNG_SHARED_SECRET;
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`search request failed with status ${res.status}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).slice(0, count).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}
