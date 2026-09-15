"use client";

import * as React from "react";
import { signOutEverywhere } from "@/lib/sign-out";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, User as UserIcon, Loader2, ShieldCheck, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProBadge } from "@/components/pro-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** Server-enforced minimum, mirrored here so the form fails before a
 *  round trip. Keep in step with `password` in lib/validation.js. */
const MIN_PASSWORD = 10;

/** A password field with a show/hide toggle — the closest safe substitute
 * for "viewing" a password, since bcrypt hashes can never be reversed. */
function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ProfileDialog({ open, onOpenChange, user, onUpdated }) {
  const [profile, setProfile] = React.useState(null);
  const [name, setName] = React.useState(user?.name || "");
  const [savingName, setSavingName] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);

  const [extraction, setExtraction] = React.useState(false);
  const [savingPrivacy, setSavingPrivacy] = React.useState(false);

  const [dateFormat, setDateFormat] = React.useState("english");
  const [savingDateFormat, setSavingDateFormat] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(user?.name || "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setExtraction(Boolean(data?.journalExtraction));
        setDateFormat(data?.dateFormat === "nepali" ? "nepali" : "english");
      })
      .catch(() => {});
  }, [open, user]);

  /**
   * Saved the moment it's picked, like the privacy switch — a calendar
   * choice that silently didn't apply would be confusing on the very
   * next screen the user opens.
   */
  async function saveDateFormat(next) {
    setDateFormat(next);
    setSavingDateFormat(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFormat: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next === "nepali"
          ? "Dates will follow the Nepali calendar."
          : "Dates will follow the English calendar."
      );
    } catch {
      setDateFormat(next === "nepali" ? "english" : "nepali");
      toast.error("Couldn't change that setting — nothing was altered.");
    } finally {
      setSavingDateFormat(false);
    }
  }

  /**
   * Saved immediately rather than behind a Save button: a privacy switch
   * that silently didn't apply because the dialog was closed would be the
   * worst possible failure mode for this particular setting.
   */
  async function saveExtraction(next) {
    setExtraction(next);
    setSavingPrivacy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalExtraction: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "Journal analysis is on." : "Journal analysis is off.");
    } catch {
      setExtraction(!next);
      toast.error("Couldn't change that setting — nothing was altered.");
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim() || name.trim() === profile?.name) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update name.");
      setProfile((p) => ({ ...p, name: data.name }));
      onUpdated?.({ name: data.name });
      toast.success("Name updated.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD) {
      toast.error(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update password.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      /**
       * Changing a password now revokes every session, including this one —
       * that is the point, since a password change that leaves an intruder
       * signed in revokes nothing. So sign out deliberately rather than
       * letting the next request fail mysteriously.
       */
      if (data.sessionsRevoked) {
        toast.success("Password updated — signing you back in.");
        setTimeout(() => signOutEverywhere({ callbackUrl: "/login" }), 1200);
        return;
      }

      toast.success(profile?.hasPassword ? "Password changed." : "Password set.");
      setProfile((p) => ({ ...p, hasPassword: true }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Manage your name, password and privacy.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">
              <UserIcon className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security">
              <KeyRound className="h-3.5 w-3.5" />
              Security
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <CalendarDays className="h-3.5 w-3.5" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-semibold uppercase">
                {(profile?.name || user?.name || "U").charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">{profile?.email || user?.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="capitalize">
                    {profile?.provider || "credentials"} account
                  </Badge>
                  {(profile ? profile.plan === "pro" : user?.isPro) && <ProBadge />}
                </div>
              </div>
            </div>

            <form onSubmit={saveName} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingName || !name.trim() || name.trim() === profile?.name}
                >
                  {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save name
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              For your security, passwords are stored as one-way hashes and can never be shown
              again — only changed. Use the eye icon to check what you&apos;re typing before you
              save it somewhere safe (like a password manager).
            </p>

            <form onSubmit={savePassword} className="space-y-3">
              {profile?.hasPassword && (
                <PasswordField
                  id="current-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}
              {profile && !profile.hasPassword && (
                <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  You signed up with Google and don&apos;t have a password yet. Set one below to
                  also be able to sign in with your email.
                </p>
              )}
              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <DialogFooter>
                <Button type="submit" size="sm" disabled={savingPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  {profile?.hasPassword ? "Change password" : "Set password"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Date format</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Which calendar the money screens use to group and label
                months. English is the default; Nepali (Bikram Sambat)
                follows months like Baisakh and Bhadra instead.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { id: "english", label: "English (AD)", hint: "January – December" },
                { id: "nepali", label: "Nepali (BS)", hint: "Baisakh – Chaitra" },
              ].map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                    dateFormat === option.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-sand-200/60",
                    savingDateFormat && "pointer-events-none opacity-60"
                  )}
                >
                  <input
                    type="radio"
                    name="date-format"
                    className="h-4 w-4 accent-[hsl(var(--brand))]"
                    checked={dateFormat === option.id}
                    disabled={savingDateFormat}
                    onChange={() => saveDateFormat(option.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Journal analysis</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                With this on, each journal entry you save is sent — one entry
                at a time, never your whole journal — to Groq to derive a
                tone and a few themes. Those become signals the pattern
                engine can use on days you didn&apos;t set a mood.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                With it off, no journal text leaves the app for this purpose
                and nothing already derived is used. Everything else about
                Discoveries keeps working — the engine reads your numbers,
                not your writing.
              </p>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3">
              <span className="text-sm">
                Analyse my journal entries
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {extraction ? "On" : "Off"}
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--brand))]"
                checked={extraction}
                disabled={savingPrivacy}
                onChange={(e) => saveExtraction(e.target.checked)}
              />
            </label>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
