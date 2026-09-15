import webpush from "web-push";
import { log } from "@/lib/logger";

let configured = null;

/**
 * True when VAPID keys are present, configuring web-push on first call.
 *
 * Missing keys disable reminders rather than failing anything else — env.js
 * warns about them at boot.
 */
export function pushConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (configured = false);

  try {
    // Apple rejects pushes whose subject is not a real mailto: or https: URL.
    webpush.setVapidDetails(vapidSubject(process.env.VAPID_SUBJECT), publicKey, privateKey);
    return (configured = true);
  } catch (err) {
    // Malformed keys (a placeholder pasted from .env.example, say) throw
    // here; treat that as "not configured" rather than failing every run.
    log.error("VAPID keys are invalid — push reminders disabled", {
      message: err.message,
    });
    return (configured = false);
  }
}

/**
 * Deliver one notification.
 *
 * `gone` means the push service says this subscription no longer exists
 * (uninstalled, permission revoked, expired) — the caller should delete it,
 * or every future run keeps paying for a request that can never land.
 *
 * @param {{endpoint: string, keys: {p256dh: string, auth: string}}} subscription
 * @param {{title: string, body: string, url?: string, tag?: string}} payload
 * @returns {Promise<{ok: boolean, gone?: boolean}>}
 */
export async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      // A 10 am nudge that arrives at 3 pm is noise; let it expire instead.
      { TTL: 4 * 60 * 60, urgency: "normal" }
    );
    return { ok: true };
  } catch (err) {
    const gone = err?.statusCode === 404 || err?.statusCode === 410;
    if (!gone) {
      log.warn("Push delivery failed", {
        status: err?.statusCode,
        // The host identifies the push service (FCM, Apple, Mozilla) without
        // logging the per-device endpoint itself.
        service: safeHost(subscription.endpoint),
      });
    }
    return { ok: false, gone };
  }
}

/**
 * The VAPID subject as web-push requires it: a `mailto:` or `https:` URL.
 * A bare email is the natural thing to paste, and web-push rejects it
 * outright — which silently disabled every reminder — so add the scheme.
 */
export function vapidSubject(raw) {
  const value = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!value) return "mailto:admin@example.com";
  if (/^(mailto:|https:\/\/)/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+$/.test(value)) return `mailto:${value}`;
  return value;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}
