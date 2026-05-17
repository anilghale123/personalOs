"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CircleDot, Loader2 } from "lucide-react";

/** Map a NextAuth `?error=` code to a human-readable message. */
const AUTH_ERRORS = {
  AccessDenied:
    "Google sign-in could not be completed — the server could not reach the database. Check your MongoDB connection and try again.",
  Configuration:
    "Authentication is misconfigured. Verify your Google OAuth credentials.",
  OAuthSignin: "Could not start the Google sign-in flow. Please retry.",
  OAuthCallback:
    "Google sign-in failed during callback. Check the authorized redirect URI.",
  CredentialsSignin: "Invalid email or password.",
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Google "G" mark. */
function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function LoginForm({ googleEnabled = false }) {
  const [mode, setMode] = React.useState("login"); // 'login' | 'signup'
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Surface OAuth / callback errors NextAuth passes back via the URL.
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const code = searchParams.get("error");
    if (code) {
      setError(AUTH_ERRORS[code] || "Sign-in failed. Please try again.");
    }
  }, [searchParams]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Registration failed.");
        }
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (!result || result.error) {
        throw new Error("Invalid email or password.");
      }

      // Hard navigation so the new session cookie is sent with the
      // request for the protected dashboard.
      window.location.href = "/compass";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function googleSignIn() {
    setGoogleBusy(true);
    setError("");
    signIn("google", { callbackUrl: "/compass" });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CircleDot className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold">Personal OS</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in to continue to your dashboard."
          : "Start organising your life in minutes."}
      </p>

      {googleEnabled && (
        <>
          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={googleSignIn}
            disabled={googleBusy || busy}
          >
            {googleBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              or with email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form
        onSubmit={submit}
        className={googleEnabled ? "space-y-4" : "mt-6 space-y-4"}
      >
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Amish Singh"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login"
          ? "Don't have an account?"
          : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
