/**
 * Groq as an alternative text generator for song facts, so a fact can be written without
 * spending Gemini quota. Plain fetch against the OpenAI-compatible endpoint (no SDK).
 *
 * MODEL is openai/gpt-oss-120b because that is what this key lists. It is a REASONING model:
 * it spends completion tokens thinking before any visible text, so a low ceiling returns
 * HTTP 200 with content "" and finish_reason "length". Keep max_completion_tokens generous
 * (~460 tokens were needed for a one-sentence answer) and read finish_reason before blaming
 * the key or the prompt. It has no search grounding, so facts rely on the NONE-if-unsure rule.
 */
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function generateWithGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Status only: the body can echo request details and must not reach logs verbatim.
    throw new Error(`Groq returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";
  if (!text) throw new Error(`Groq returned an empty reply (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  return text;
}
