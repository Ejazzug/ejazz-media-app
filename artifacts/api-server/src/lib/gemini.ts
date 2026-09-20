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
