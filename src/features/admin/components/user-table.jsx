"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, Ban, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS, ROLE_ORDER, canActOn } from "@/lib/roles";
import { PLANS, PLAN_LABELS } from "@/lib/plans";

/** Coarse relative time — an admin table needs "when", not "exactly when". */
function ago(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function shortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function UserTable({
  initial,
  actorId,
  actorRole,
  assignable,
  query,
  pageSize,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = React.useState(initial.users);
  const [q, setQ] = React.useState(query.q ?? "");
  const [busyId, setBusyId] = React.useState(null);

  React.useEffect(() => {
    setUsers(initial.users);
  }, [initial.users]);

  /** Push a filter change into the URL so the page is shareable and back works. */
  function applyFilter(next) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change invalidates the current page number.
    if (!("page" in next)) params.delete("page");
    router.push(`/sysadmin/users?${params.toString()}`);
  }

  // Debounced, so typing a name does not fire a navigation per keystroke.
  React.useEffect(() => {
    if (q === (query.q ?? "")) return;
    const t = setTimeout(() => applyFilter({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function patchUser(id, body, describe) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/sysadmin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That change did not apply.");

      setUsers((list) =>
        list.map((u) =>
          u.id === id
            ? {
                ...u,
                role: data.user.role,
                plan: data.user.plan,
                isSuspended: data.user.isSuspended,
              }
            : u
        )
      );
      toast.success(describe);
      // The dashboard counts by role, so keep server data in step.
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(initial.total / pageSize));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="h-9 pl-8"
            aria-label="Search users"
          />
        </div>
        <Select
          className="h-9 w-40"
          value={query.role ?? ""}
          onChange={(e) => applyFilter({ role: e.target.value })}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLE_ORDER.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-background">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Sign-in</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 font-medium">Last active</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No accounts match that search.
                </td>
              </tr>
            )}

            {users.map((u) => {
              const isSelf = u.id === actorId;
              // The server enforces this too — the UI only avoids offering
              // an action that would be refused.
              const manageable = !isSelf && canActOn(actorRole, u.role);
              const busy = busyId === u.id;

              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    u.isSuspended && "bg-destructive/5"
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                        {(u.name || u.email || "?").charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name}
                          {isSelf && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      </div>
                    </div>
                    {u.isSuspended && (
                      <span className="mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        Suspended
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.linkedProviders?.length
                      ? u.linkedProviders
                          .map((p) => (p === "google" ? "Google" : "Email"))
                          .join(" + ")
                      : u.provider === "google"
                      ? "Google"
                      : "Email"}
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {shortDate(u.createdAt)}
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <span
                      className={cn(
                        !u.lastLoginAt && "text-amber-600 dark:text-amber-500"
                      )}
                    >
                      {ago(u.lastLoginAt)}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {manageable ? (
                      <Select
                        className="h-8 w-24"
                        value={u.plan ?? "free"}
                        disabled={busy}
                        onChange={(e) =>
                          patchUser(
                            u.id,
                            { plan: e.target.value },
                            `${u.name} is now on ${PLAN_LABELS[e.target.value]}.`
                          )
                        }
                        aria-label={`Plan for ${u.name}`}
                      >
                        {PLANS.map((plan) => (
                          <option key={plan} value={plan}>
                            {PLAN_LABELS[plan]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {PLAN_LABELS[u.plan] ?? "Free"}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {manageable && assignable.length > 0 ? (
                      <Select
                        className="h-8 w-32"
                        value={u.role}
                        disabled={busy}
                        onChange={(e) =>
                          patchUser(
                            u.id,
                            { role: e.target.value },
                            `${u.name} is now ${ROLE_LABELS[e.target.value]}.`
                          )
                        }
                        aria-label={`Role for ${u.name}`}
                      >
                        {/* The current role is always listed, even when it is
                            not one this actor could assign, so the control
                            shows the truth rather than a blank. */}
                        {[...new Set([u.role, ...assignable])].map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {u.role === "superadmin" && (
                          <ShieldCheck className="h-3 w-3" />
                        )}
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {busy ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                    ) : manageable ? (
                      <Button
                        size="sm"
                        variant={u.isSuspended ? "outline" : "ghost"}
                        onClick={() =>
                          patchUser(
                            u.id,
                            { isSuspended: !u.isSuspended },
                            u.isSuspended
                              ? `${u.name} can sign in again.`
                              : `${u.name} has been suspended.`
                          )
                        }
                      >
                        {u.isSuspended ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Ban className="h-3.5 w-3.5" />
                            Suspend
                          </>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {query.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={query.page <= 1}
              onClick={() => applyFilter({ page: String(query.page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={query.page >= totalPages}
              onClick={() => applyFilter({ page: String(query.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Suspending an account blocks sign-in and ends any session it already
        holds, but keeps all of its data. Changing a role also ends that
        user&apos;s sessions, so it takes effect immediately.
      </p>
    </div>
  );
}
