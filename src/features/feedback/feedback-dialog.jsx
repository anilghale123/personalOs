"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Loader2, Bug, Lightbulb, HelpCircle, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The kinds of thing someone might want to say. Offering concrete options
 * rather than a bare text box does two jobs: it makes triage possible, and it
 * tells the user that "this is confusing" is a welcome report.
 */
const KINDS = [
  { id: "bug", label: "Something's broken", icon: Bug },
  { id: "confusing", label: "This is confusing", icon: HelpCircle },
  { id: "idea", label: "I have an idea", icon: Lightbulb },
  { id: "praise", label: "Something I like", icon: Heart },
];

const MAX_LENGTH = 4000;

/**
 * Feedback capture, available on every screen — and on the sign-in page,
 * where `signedIn={false}` adds an optional contact email.
 *
 * The route and viewport are attached automatically: nobody accurately
 * recalls which screen they were on.
 *
 * Pass `open`/`onOpenChange` to drive it from outside — e.g. from a sheet
 * that closes itself first — in which case no trigger is rendered unless
 * one is given.
 */
export function FeedbackDialog({
  trigger,
  className,
  signedIn = true,
  open: openProp,
  onOpenChange,
}) {
  const pathname = usePathname();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = controlled ? onOpenChange : setUncontrolledOpen;
  const [kind, setKind] = React.useState("bug");
  const [message, setMessage] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const tooShort = message.trim().length < 3;

  async function submit(e) {
    e.preventDefault();
    if (tooShort || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          type: kind,
          email: !signedIn && email.trim() ? email.trim() : undefined,
          route: pathname,
          viewport:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send that just now.");

      toast.success("Thank you — this goes straight to the developer.");
      setMessage("");
      setEmail("");
      setKind("bug");
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(!controlled || trigger) && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="sm" className={cn("gap-2", className)}>
              <MessageSquarePlus className="h-4 w-4" />
              Send feedback
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Your report genuinely changes what gets fixed next. The screen
            you&apos;re on is attached automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>What kind of feedback?</Label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors",
                      active
                        ? "border-foreground bg-muted font-medium"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="leading-tight">{k.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="feedback-message">Tell us more</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {message.length}/{MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              rows={5}
              required
              placeholder={
                kind === "bug"
                  ? "What did you expect to happen, and what happened instead?"
                  : "As much or as little as you like."
              }
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {!signedIn && (
            <div className="space-y-2">
              <Label htmlFor="feedback-email">
                Your email <span className="font-normal text-muted-foreground">(optional, so we can reply)</span>
              </Label>
              <Input
                id="feedback-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={tooShort || busy} className="w-full sm:w-auto">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send feedback
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
