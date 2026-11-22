import { GoogleGenAI } from "@google/genai";
import { searchWeb, isWebSearchConfigured } from "./webSearch";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface GeminiGenerateResult {
  text: string;
  model: string;
  grounded: boolean;
  /**
   * What a grounded answer says it read, when it says anything: `[]` on an ungrounded call and
   * on a grounded one that cited nothing.
   *
   * **These are citations for a HUMAN to check, not sources anything here can quote from.**
   * Gemini hands back `vertexaisearch.cloud.google.com/grounding-api-redirect/...` links
   * rather than publisher URLs, and they expire. So they are worth storing beside a fact so a
   * person can see what was behind it, and they must never be passed to a writer that
   * verifies quotes by re-fetching a source (podcast_lib/news_articles.py) as if they were
   * real reporting. `generateGroundedViaSearch()` below is the one that returns clean URLs,
   * and it needs SEARXNG_URL, which is not set on this box.
   */
  sources: { title: string; url: string }[];
}

/** The grounding chunks, defensively: one missing field must not cost the whole answer. */
function groundingSources(response: unknown): { title: string; url: string }[] {
  const chunks = (response as {
    candidates?: { groundingMetadata?: { groundingChunks?: { web?: { title?: string; uri?: string } }[] } }[];
  })?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const url = chunk?.web?.uri;
    if (typeof url !== "string" || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: String(chunk.web?.title || "").slice(0, 200), url: url.slice(0, 2000) });
  }
  return out;
}

export async function generateWithGemini(
  prompt: string,
  opts: { grounded?: boolean; model?: string } = {},
): Promise<GeminiGenerateResult> {
  const ai = getClient();
  const model = opts.model || DEFAULT_MODEL;
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    ...(opts.grounded ? { config: { tools: [{ googleSearch: {} }] } } : {}),
  });
  return {
    text: response.text ?? "",
    model,
    grounded: Boolean(opts.grounded),
    sources: opts.grounded ? groundingSources(response) : [],
  };
}


export { isWebSearchConfigured };

export interface GroundedSearchResult extends GeminiGenerateResult {
  sources: { title: string; url: string }[];
}

export async function generateGroundedViaSearch(
  prompt: string,
  opts: { model?: string; searchCount?: number } = {},
): Promise<GroundedSearchResult> {
  if (!isWebSearchConfigured()) {
    throw new Error("SEARXNG_URL is not set; self-hosted search is not configured");
  }
  const results = await searchWeb(prompt, opts.searchCount ?? 5);
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
    .join("\n\n");
  const augmentedPrompt = [
    "You are answering using the search results below.",
    "Cite sources by number like [1] where relevant.",
    "If the results don't answer the question, say so honestly rather than guessing.",
    "",
    "Search results:",
    context || "(no results found)",
    "",
    `Question: ${prompt}`,
  ].join("\n");
  const result = await generateWithGemini(augmentedPrompt, { model: opts.model });
  return {
    ...result,
    sources: results.map((r) => ({ title: r.title, url: r.url })),
  };
}
