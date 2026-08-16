"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, User as UserIcon, Loader2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  React.useEffect(() => {
    if (!open) return;
    setName(user?.name || "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => {});
  }, [open, user]);

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
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
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
      toast.success(profile?.hasPassword ? "Password changed." : "Password set.");
      setProfile((p) => ({ ...p, hasPassword: true }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
            Manage your name and password.
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
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-semibold uppercase">
                {(profile?.name || user?.name || "U").charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">{profile?.email || user?.email}</p>
                <Badge variant="outline" className="mt-1 capitalize">
                  {profile?.provider || "credentials"} account
                </Badge>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
