// Server-only helper for calling the Google Gemini API (REST `generateContent`).
//
// Verified against the Gemini API docs (ai.google.dev, October 2026):
//  - `gemini-3.8-flash` is a stable model id. Its DEFAULT thinking level is
//    "medium" and it "can use more tokens on longer running and complex tasks,
//    by design" - far too slow for OCR + a large JSON answer. Supported levels
//    are low | medium | high ("minimal" is rejected), so we default to "low".
//  - `temperature`, `top_p` and `top_k` are deprecated for Gemini 3.6+ (ignored
//    today, HTTP 400 in future generations) -> they are never sent.
//  - A request whose last turn has role "model" (prefill) returns HTTP 400 ->
//    the conversation is normalised so it always ends with a user turn.
//
// Nothing in this file ever returns provider details to callers: every thrown
// AiError carries a safe, user-presentable message; technical details are only
// written to the server log (never the API key, never prescription content).

const DEFAULT_MODEL = "gemini-3.8-flash";
// Used when the primary model is overloaded (503), out of quota (429), times
// out, or is not found (404). Quotas are per model, so this also helps on 429.
const DEFAULT_FALLBACK_MODEL = "gemini-3.6-flash";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 45_000; // one HTTP attempt
const DEFAULT_TOTAL_TIMEOUT_MS = 75_000; // everything: retries + fallback
const ATTEMPTS_PER_MODEL = 2; // for 429/5xx/network only - timeouts go straight to the fallback
const MIN_ATTEMPT_MS = 8_000; // do not start an attempt with less budget than this
const MAX_RETRY_WAIT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192; // includes thinking tokens
const MAX_CONCURRENT_REQUESTS = Math.max(1, Number(process.env.GEMINI_MAX_CONCURRENCY) || 3);

export type AiErrorCode =
  | "unavailable"
  | "rate_limited"
  | "credits"
  | "timeout"
  | "bad_request"
  | "config"
  | "empty"
  | "blocked"
  | "invalid_response";

export class AiError extends Error {
  code: AiErrorCode;
  /** HTTP status from Gemini when the failure came from an HTTP response (server-side use only). */
  status?: number;
  /** Server-suggested wait before retrying (429/503), in ms. */
  retryAfterMs?: number;

  constructor(code: AiErrorCode, message: string, meta?: { status?: number; retryAfterMs?: number }) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = meta?.status;
    this.retryAfterMs = meta?.retryAfterMs;
  }
}

const SAFE_MESSAGES: Record<AiErrorCode, string> = {
  unavailable: "The AI service is temporarily unavailable. Please try again in a moment.",
  rate_limited: "Too many requests right now. Please wait a few seconds and try again.",
  credits: "The AI service is temporarily unavailable. Please try again later.",
  timeout: "The AI service took too long to respond. Please try again.",
  bad_request: "This content could not be processed. Please try again with a clearer input.",
  config: "The AI service is not available right now. Please try again later.",
  empty: "The AI service returned no result. Please try again.",
  blocked: "The AI service could not process this content. Please try a different image.",
  invalid_response: "The AI service returned an unreadable response. Please try again.",
};

function aiError(code: AiErrorCode, meta?: { status?: number; retryAfterMs?: number }): AiError {
  return new AiError(code, SAFE_MESSAGES[code], meta);
}

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
};

export type CallAiOptions = {
  /** Override the model. Defaults to GEMINI_MODEL or gemini-3.8-flash. A legacy "google/" prefix is stripped. */
  model?: string;
  messages: AiMessage[];
  responseFormat?: "json_object";
  /** Reasoning effort. "minimal" is NOT supported by gemini-3.8-flash. Default "low". */
  thinkingLevel?: "low" | "medium" | "high";
  /** Max tokens to generate, INCLUDING thinking tokens. Default 8192. */
  maxOutputTokens?: number;
  /** Timeout for ONE HTTP attempt, in ms. */
  timeoutMs?: number;
  /** Overall budget for the call (all retries + fallback), in ms. */
  totalTimeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Concurrency limit: the results page fires several AI calls at once. Bursting
// them is the quickest way to hit the per-minute limit (HTTP 429), so cap the
// number of in-flight Gemini requests per server process and queue the rest.
// ---------------------------------------------------------------------------
let activeRequests = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }
  // The slot is handed over by releaseSlot() without touching the counter.
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next();
  else activeRequests--;
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------
function normaliseModel(name: string): string {
  return name.trim().replace(/^models\//, "").replace(/^google\//, "");
}

function pickModels(requested?: string): string[] {
  const primary = normaliseModel(requested || process.env.GEMINI_MODEL || DEFAULT_MODEL);
  const rawFallback = process.env.GEMINI_FALLBACK_MODEL;
  const fallback =
    rawFallback === undefined ? DEFAULT_FALLBACK_MODEL : normaliseModel(rawFallback);
  const list = [primary];
  if (fallback && fallback.toLowerCase() !== "off" && fallback !== primary) list.push(fallback);
  return list.filter((m) => /^[A-Za-z0-9._-]+$/.test(m));
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------
type GeminiPart = Record<string, unknown>;
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toParts(content: AiMessage["content"]): GeminiPart[] {
  if (typeof content === "string") return content.trim() ? [{ text: content }] : [];
  const parts: GeminiPart[] = [];
  for (const item of content) {
    if (item.type === "text" && item.text) parts.push({ text: item.text });
    if (item.type === "image_url" && item.image_url?.url) {
      // data:image/jpeg;base64,AAAA...  ->  Gemini inline_data
      const match = item.image_url.url.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
  }
  return parts;
}

function buildBody(opts: CallAiOptions): Record<string, unknown> {
  const system = opts.messages.find((m) => m.role === "system");

  // Merge consecutive turns of the same role (a failed chat reply leaves two
  // user turns in a row) and make sure the conversation starts and ends with a
  // user turn, which is what the API requires.
  const contents: GeminiContent[] = [];
  for (const message of opts.messages) {
    if (message.role === "system") continue;
    const parts = toParts(message.content);
    if (parts.length === 0) continue;
    const role = message.role === "assistant" ? "model" : "user";
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else contents.push({ role, parts });
  }
  while (contents.length > 0 && contents[0].role === "model") contents.shift();
  while (contents.length > 0 && contents[contents.length - 1].role === "model") contents.pop();
  if (contents.length === 0) throw aiError("bad_request");

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingLevel: opts.thinkingLevel ?? "low" },
      ...(opts.responseFormat === "json_object" ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (system) {
    const text =
      typeof system.content === "string"
        ? system.content
        : system.content
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text)
            .join("\n");
    if (text.trim()) body.systemInstruction = { parts: [{ text }] };
  }

  return body;
}

// ---------------------------------------------------------------------------
// HTTP error classification
// ---------------------------------------------------------------------------
function parseRetryDelayMs(errorJson: unknown, retryAfterHeader: string | null): number | undefined {
  const details = (errorJson as { error?: { details?: unknown } } | null)?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const delay = (d as { retryDelay?: unknown } | null)?.retryDelay;
      if (typeof delay === "string") {
        const m = delay.match(/^(\d+(?:\.\d+)?)s$/);
        if (m) return Math.round(Number(m[1]) * 1000);
      }
    }
  }
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  }
  return undefined;
}

function httpError(status: number, bodyText: string, retryAfterHeader: string | null): AiError {
  let parsed: { error?: { status?: string; message?: string } } | null = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    /* not JSON */
  }
  const apiStatus = parsed?.error?.status ?? "";
  const apiMessage = parsed?.error?.message ?? "";
  const retryAfterMs = parseRetryDelayMs(parsed, retryAfterHeader);

  let code: AiErrorCode;
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") code = "rate_limited";
  else if (status === 504 || apiStatus === "DEADLINE_EXCEEDED" || status === 408) code = "timeout";
  else if (status >= 500) code = "unavailable";
  // Misconfiguration: bad/restricted key (Gemini answers 400 "API key not valid"),
  // billing/region problems (FAILED_PRECONDITION), unknown or retired model (404).
  else if (status === 401 || status === 403 || status === 404) code = "config";
  else if (status === 400 && (apiStatus === "FAILED_PRECONDITION" || /api[ _]?key/i.test(apiMessage)))
    code = "config";
  else code = "bad_request";

  // Full technical detail goes to the server log only (the key is never in the URL or body).
  console.error(
    `[ai] Gemini HTTP ${status} status=${apiStatus || "-"} category=${code} ` +
      `message=${apiMessage.slice(0, 300) || bodyText.slice(0, 300)}`,
  );
  return aiError(code, { status, retryAfterMs });
}

function isAbort(error: unknown): boolean {
  const e = error as { name?: string; cause?: { name?: string } } | null;
  return (
    e?.name === "AbortError" ||
    e?.name === "TimeoutError" ||
    e?.cause?.name === "AbortError" ||
    e?.cause?.name === "TimeoutError"
  );
}

const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
  "RECITATION",
]);

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    thoughtsTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

function extractText(json: GeminiResponse | null, model: string, ms: number): string {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .filter((p) => p && !p.thought)
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("")
    : "";
  const finish = candidate?.finishReason ?? "-";
  const u = json?.usageMetadata;

  console.log(
    `[ai] ok model=${model} ms=${ms} finish=${finish} ` +
      `tokens(in/think/out)=${u?.promptTokenCount ?? "?"}/${u?.thoughtsTokenCount ?? 0}/${u?.candidatesTokenCount ?? "?"}`,
  );

  if (!text.trim()) {
    const blocked = Boolean(json?.promptFeedback?.blockReason) || BLOCKED_FINISH_REASONS.has(finish);
    console.error(
      `[ai] empty response model=${model} finish=${finish} blockReason=${json?.promptFeedback?.blockReason ?? "-"}`,
    );
    throw aiError(blocked ? "blocked" : "empty");
  }
  if (finish === "MAX_TOKENS") {
    console.warn(`[ai] output hit maxOutputTokens (model=${model}); JSON answers may be truncated`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// One HTTP attempt. The timer stays armed until the response BODY has been
// read, so a stalled body can no longer hang the request forever.
// ---------------------------------------------------------------------------
async function requestOnce(model: string, body: string, key: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw httpError(res.status, errorText, res.headers.get("retry-after"));
    }

    let json: GeminiResponse;
    try {
      json = (await res.json()) as GeminiResponse;
    } catch (e) {
      if (isAbort(e) || controller.signal.aborted) throw aiError("timeout");
      console.error("[ai] Gemini returned a non-JSON body", e instanceof Error ? e.message : e);
      throw aiError("invalid_response");
    }
    return extractText(json, model, Date.now() - started);
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (isAbort(error) || controller.signal.aborted) {
      console.error(`[ai] request timed out after ${timeoutMs}ms model=${model}`);
      throw aiError("timeout");
    }
    // DNS / TLS / connection reset / IPv6 trouble etc. Keep the root cause visible.
    const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
    console.error(
      `[ai] network error model=${model} ${error instanceof Error ? error.name + ": " + error.message : String(error)}` +
        (cause ? ` cause=${cause.code ?? ""} ${cause.message ?? ""}` : ""),
    );
    throw aiError("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransient(err: AiError): boolean {
  return err.code === "unavailable" || err.code === "rate_limited" || err.code === "timeout";
}

export async function callAi(opts: CallAiOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.error("[ai] GEMINI_API_KEY is not set (add it to .env and restart the dev server)");
    throw aiError("config");
  }

  const models = pickModels(opts.model);
  if (models.length === 0) {
    console.error("[ai] invalid GEMINI_MODEL / model name");
    throw aiError("config");
  }
  const body = JSON.stringify(buildBody(opts));

  await acquireSlot();
  try {
    const deadline = Date.now() + (opts.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
    const attemptTimeout = opts.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    let last: AiError | null = null;

    for (let m = 0; m < models.length; m++) {
      const model = models[m];
      const hasNextModel = m < models.length - 1;

      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining < MIN_ATTEMPT_MS) throw last ?? aiError("timeout");

        try {
          return await requestOnce(model, body, key, Math.min(attemptTimeout, remaining));
        } catch (e) {
          const err = e instanceof AiError ? e : aiError("unavailable");
          last = err;
          console.warn(`[ai] attempt ${attempt}/${ATTEMPTS_PER_MODEL} model=${model} failed: ${err.code}`);

          // Unknown/retired model: only the fallback can help.
          if (err.status === 404 && hasNextModel) break;
          if (!isTransient(err)) throw err;
          // A timeout will not get better by asking the same model again.
          if (err.code === "timeout") break;
          if (attempt === ATTEMPTS_PER_MODEL) break;

          const jitter = Math.floor(Math.random() * 400);
          const wait = Math.min(err.retryAfterMs ?? 1000 * 2 ** (attempt - 1) + jitter, MAX_RETRY_WAIT_MS);
          // Not enough budget left to wait AND retry: give up on this model.
          if (wait > deadline - Date.now() - MIN_ATTEMPT_MS) break;
          await sleep(wait);
        }
      }

      if (hasNextModel) {
        console.warn(`[ai] falling back from ${model} to ${models[m + 1]} (last error: ${last?.code})`);
      }
    }

    throw last ?? aiError("unavailable");
  } finally {
    releaseSlot();
  }
}

/**
 * Safely parse JSON returned by the AI.
 * Handles ```json fences and JSON objects/arrays surrounded by stray prose.
 * Returns null when nothing parseable is found.
 */
export function parseAiJson<T = unknown>(raw: string): T | null {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through to slice-based recovery */
  }

  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const order: Array<[string, string]> =
    firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)
      ? [
          ["[", "]"],
          ["{", "}"],
        ]
      : [
          ["{", "}"],
          ["[", "]"],
        ];

  for (const [open, close] of order) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        /* try the next shape */
      }
    }
  }
  return null;
}
