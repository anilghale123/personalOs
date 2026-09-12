import Groq from "groq-sdk";

let groq;

/**
 * Groq retired llama-3.3-70b-versatile on 16 Aug 2026 (free/developer
 * tiers). Official replacement is openai/gpt-oss-120b; override with
 * GROQ_MODEL if you want qwen/qwen3.6-27b instead.
 * @see https://console.groq.com/docs/deprecations
 */
export const GROQ_CHAT_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/**
 * How long we wait for a completion before giving up.
 *
 * Without a timeout a slow response held the serverless function until the
 * platform killed it, so the user waited the full execution limit and then
 * saw a generic failure. Failing at 25s leaves room to return a real message.
 */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Retries, for transient failures only.
 *
 * The SDK retries 408/409/429/5xx and connection errors; it does not retry a
 * 400 or a 401, which is right — a malformed prompt or a bad key will fail
 * identically the second time and retrying only spends money and latency.
 */
const MAX_RETRIES = 2;

/**
 * Singleton Groq SDK client.
 * @returns {Groq}
 */
export function getGroqClient() {
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return groq;
}

/** True when the AI features are configured at all. */
export const isAiConfigured = Boolean(process.env.GROQ_API_KEY);

/**
 * Turn an SDK failure into something a user can read.
 *
 * The raw errors name the provider, the model and sometimes the prompt, none
 * of which belongs in front of a user — but "it didn't work" is equally
 * useless, so the distinctions that change what they should *do* are kept.
 *
 * @param {unknown} err
 * @returns {{message: string, retryable: boolean}}
 */
export function describeAiError(err) {
  const status = err?.status ?? err?.response?.status;

  if (err?.name === "APIConnectionTimeoutError" || err?.code === "ETIMEDOUT") {
    return {
      message: "That took too long to generate. Please try again in a moment.",
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      message:
        "The AI service is busy right now. Please try again in a few minutes.",
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    // A configuration problem on our side, not something the user can fix.
    return {
      message: "AI features are not available right now.",
      retryable: false,
    };
  }
  if (status >= 500) {
    return {
      message: "The AI service is having trouble. Please try again shortly.",
      retryable: true,
    };
  }
  return {
    message: "That could not be generated right now. Please try again.",
    retryable: true,
  };
}
