"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleDot, Loader2, MailCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Matches the server's minimum so the form fails before a round trip. */
const MIN_PASSWORD = 10;
const CODE_LENGTH = 6;
/** Mirrors RESEND_COOLDOWN_SEC on the server. */
const RESEND_COOLDOWN_SEC = 60;
const EXPIRY_MINUTES = 15;

async function postJson(method, body) {
  const res = await fetch("/api/password-reset", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.code = data.code;
    throw err;
  }
  return data;
}

/**
 * Forgot password, in two steps on one screen: "email me a code", then
 * "enter the code and a new password".
 */
export function ResetPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [step, setStep] = React.useState("request");
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode(address) {
    await postJson("POST", { email: address });
    setCooldown(RESEND_COOLDOWN_SEC);
  }

  return step === "request" ? (
    <RequestCode
      email={email}
      setEmail={setEmail}
      onSent={async () => {
        await requestCode(email);
        setStep("verify");
      }}
    />
  ) : (
    <VerifyCode
      email={email}
      cooldown={cooldown}
      onResend={() => requestCode(email)}
      onChangeEmail={() => setStep("request")}
    />
  );
}

/* ------------------------------------------------------------------ */

function RequestCode({ email, setEmail, onSent }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a 6-digit code."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <FormError>{error}</FormError>}
        <div className="space-y-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !email}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Send code
        </Button>
      </form>
      <BackToLogin />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function VerifyCode({ email, cooldown, onResend, onChangeEmail }) {
  const router = useRouter();
  const [form, setForm] = React.useState({ code: "", password: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [error, setError] = React.useState("");

  const codeValid = new RegExp(`^\\d{${CODE_LENGTH}}$`).test(form.code);
  const tooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD;
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const canSubmit =
    codeValid &&
    form.password.length >= MIN_PASSWORD &&
    form.password === form.confirm &&
    !busy;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await postJson("PUT", {
        email,
        code: form.code,
        newPassword: form.password,
      });
      toast.success("Password changed. Sign in with your new password.");
      router.push("/login");
    } catch (err) {
      setError(err.message);
      if (err.code === "invalid_code") setForm((f) => ({ ...f, code: "" }));
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    setError("");
    try {
      await onResend();
      toast.success("If that account exists, a new code is on its way.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <Shell
      title="Check your email"
      subtitle={`If an account exists for ${email}, we sent a ${CODE_LENGTH}-digit code. It expires in ${EXPIRY_MINUTES} minutes.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <FormError>{error}</FormError>}

        <div className="space-y-2">
          <Label htmlFor="reset-code">Code</Label>
          <Input
            id="reset-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            required
            autoFocus
            placeholder="123456"
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                code: e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH),
              }))
            }
            className="h-12 text-center font-mono text-xl tracking-[0.5em]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          {tooShort && (
            <p className="text-xs text-muted-foreground">
              {MIN_PASSWORD - form.password.length} more character
              {MIN_PASSWORD - form.password.length === 1 ? "" : "s"} needed.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          {mismatch && (
            <p className="text-xs text-destructive">
              These two passwords don&apos;t match.
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Change password
        </Button>
      </form>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
        <p>
          Nothing yet? Check spam, then{" "}
          {cooldown > 0 ? (
            <span className="tabular-nums">resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {resending ? "sending…" : "send a new code"}
            </button>
          )}{" "}
          or{" "}
          <button
            type="button"
            onClick={onChangeEmail}
            className="font-medium text-foreground underline underline-offset-2"
          >
            use a different email
          </button>
          . Signing in elsewhere will be logged out after the change.
        </p>
      </div>
      <BackToLogin />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function Shell({ title, subtitle, children }) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
          <CircleDot className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold">selfView</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function FormError({ children }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function BackToLogin() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link
        href="/login"
        className="font-medium text-foreground underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </p>
  );
}
