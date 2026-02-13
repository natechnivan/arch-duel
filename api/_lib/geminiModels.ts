// app/api/_lib/geminiModels.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

type ListModelsResp = {
  models?: Array<{
    name?: string; // "models/gemini-2.0-flash"
    supportedGenerationMethods?: string[];
  }>;
};

const FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

declare global {
  // eslint-disable-next-line no-var
  var __archduel_models_cache:
    | { at: number; models: string[] }
    | undefined;
}

function normalizeModelName(name: string) {
  // "models/gemini-2.0-flash" -> "gemini-2.0-flash"
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

export async function listModelsCached(apiKey: string): Promise<string[]> {
  const now = Date.now();
  const cached = globalThis.__archduel_models_cache;

  if (cached && now - cached.at < TTL_MS && cached.models.length > 0) {
    return cached.models;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // avoid any caching surprises
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`ListModels failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as ListModelsResp;

    const supported = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => normalizeModelName(m.name ?? ""))
      .filter(Boolean);

    // Prefer our “known good” ordering but only if present in supported list
    const ordered = [
      ...FALLBACK_MODELS.filter((m) => supported.includes(m)),
      ...supported.filter((m) => !FALLBACK_MODELS.includes(m)),
    ];

    globalThis.__archduel_models_cache = { at: now, models: ordered };
    return ordered.length ? ordered : FALLBACK_MODELS;
  } catch {
    // If ListModels fails (network, auth, etc.) use fallback
    globalThis.__archduel_models_cache = { at: now, models: FALLBACK_MODELS };
    return FALLBACK_MODELS;
  }
}

export function isOverloaded(errMsg: string) {
  const m = errMsg.toLowerCase();
  return (
    errMsg.includes("503") ||
    errMsg.includes("429") ||
    m.includes("high demand") ||
    m.includes("overloaded")
  );
}

export function isModelNotFound(errMsg: string) {
  const m = errMsg.toLowerCase();
  return (
    m.includes("404") ||
    m.includes("not found") ||
    m.includes("not supported") ||
    m.includes("call listmodels")
  );
}

export async function generateTextWithRetry(
  genAI: GoogleGenerativeAI,
  apiKey: string,
  prompt: string
): Promise<string> {
  const modelsToTry = await listModelsCached(apiKey);

  let lastErr: any = null;

  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await model.generateContent(prompt);
        return resp.response.text().trim();
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e);

        // model not available / unsupported: try next model
        if (isModelNotFound(msg)) break;

        // overload: retry same model
        if (isOverloaded(msg)) {
          await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
          continue;
        }

        // other errors: fail fast
        throw e;
      }
    }
  }

  throw lastErr ?? new Error("No model succeeded");
}