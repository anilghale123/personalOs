import Groq from "groq-sdk";

let groq;

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
