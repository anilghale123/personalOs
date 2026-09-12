"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleDot, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Matches the server's minimum so the form fails before a round trip. */
const MIN_PASSWORD = 10;

/** Why a link is no longer usable, in words the user can act on. */
const DEAD_LINK = {
  unknown: "This reset link isn't valid. It may have been mistyped or already replaced by a newer one.",
  used: "This link has already been used. If you still need to change your password, request a new link.",
  expired: "This link has expired. Reset links are valid for 30 minutes — request a fresh one below.",
};

/**
 * Two screens in one component, chosen by whether the URL carries a token:
 * "email me a link" and "choose a new password".
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  return token ? (
    <ChoosePassword token={token} router={router} />
  ) : (
    <RequestLink />
  );
}

/* ------------------------------------------------------------------ */

function RequestLink() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the reset email.");
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell
        title="Check your email"
        subtitle="If an account exists for that address, a reset link is on its way. It expires in 30 minutes."
      >
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <p>
            Nothing after a few minutes? Check your spam folder, then{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-medium text-foreground underline underline-offset-2"
            >
              try a different address
            </button>
            .
          </p>
        </div>
        <BackToLogin />
      </Shell>
    );
  }

  return (
    <Shell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to choose a new password."
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
          Send reset link
        </Button>
      </form>
      <BackToLogin />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function ChoosePassword({ token, router }) {
  const [status, setStatus] = React.useState("checking");
  const [deadReason, setDeadReason] = React.useState(null);
  const [form, setForm] = React.useState({ password: "", confirm: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Check the link before asking anyone to type a password twice for nothing.
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/password-reset?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (data.valid) setStatus("ready");
        else {
          setDeadReason(data.reason || "unknown");
          setStatus("dead");
        }
      } catch {
        if (active) {
          setDeadReason("unknown");
          setStatus("dead");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const tooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD;
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const canSubmit =
    form.password.length >= MIN_PASSWORD && form.password === form.confirm && !busy;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: form.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change your password.");
      toast.success("Password changed. Sign in with your new password.");
      router.push("/login");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (status === "checking") {
    return (
      <Shell title="Reset your password" subtitle="Checking your link…">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (status === "dead") {
    return (
      <Shell title="This link no longer works" subtitle={DEAD_LINK[deadReason]}>
        <Button asChild className="w-full">
          <Link href="/reset-password">Request a new link</Link>
        </Button>
        <BackToLogin />
      </Shell>
    );
  }

  return (
    <Shell
      title="Choose a new password"
      subtitle={`At least ${MIN_PASSWORD} characters. Signing in elsewhere will be logged out.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <FormError>{error}</FormError>}
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
