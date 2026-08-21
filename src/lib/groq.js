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
 * Singleton Groq SDK client.
 * @returns {Groq}
 */
export function getGroqClient() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}
