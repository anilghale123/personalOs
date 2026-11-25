"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useClientClock } from "@/lib/client-clock";
import { toDateKey } from "@/lib/utils";
import { COLORS, DURATION_PRESETS } from "@/features/challenge/constants";
import { TrackerTreeEditor } from "./tracker-tree-editor";

/** A short id for a node the API doesn't know yet. */
let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/**
 * Turn a tracker the API returned into a node the builder owns. Existing
 * trackers keep their _id so an edit can be sent back; new ones get a key.
 */
function toNodes(trackers, startDayDefault = 1) {
  return (trackers || []).map((t, i) => ({
    key: t._id,
    _id: t._id,
    parentId: t.parentId ? String(t.parentId) : null,
    name: t.name,
    metric: t.metric,
    unit: t.unit || "",
    rollup: t.rollup,
    useSets: t.useSets,
    baseline: t.baseline ?? null,
    goal: t.goal ?? null,
    rampType: t.rampType || "linear",
    direction: t.direction || "increase",
    startDay: t.startDay ?? startDayDefault,
    order: t.order ?? i,
    archived: t.archived,
  }));
}

function newNode(parentId, metric = "count", order) {
  return {
    key: newKey(),
    _id: undefined,
    parentId,
    name: "",
    metric,
    unit: "",
    rollup: false,
    useSets: false,
    baseline: null,
    goal: null,
    rampType: "linear",
    direction: "increase",
    startDay: 1,
    order,
    archived: false,
  };
}

/**
 * Create or edit a challenge.
 *
 * The state is a flat `nodes` list plus the header fields; the API payload is
 * built from it at save time. `existing` seeds both when editing. A duration
 * preset and a custom days field stay in step.
 */
export function ChallengeBuilder({ existing }) {
  const router = useRouter();
  const [todayKey] = useClientClock(toDateKey);
  const [title, setTitle] = React.useState(existing?.title || "");
  const [description, setDescription] = React.useState(
    existing?.description || ""
  );
  const [startDate, setStartDate] = React.useState(
    existing?.startDate || todayKey || ""
  );
  const [totalDays, setTotalDays] = React.useState(existing?.totalDays || 30);
  const [color, setColor] = React.useState(existing?.color || "blue");
  const [status, setStatus] = React.useState(existing?.status || "active");
  const [nodes, setNodes] = React.useState(
    existing ? toNodes(existing.trackers) : [newNode(null, "minutes", 0)]
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  const isCustom = !DURATION_PRESETS.some((p) => p.days === totalDays);
  const presetDays = DURATION_PRESETS.some((p) => p.days === totalDays)
    ? totalDays
    : null;

  const challenge = React.useMemo(
    () => ({
      startDate: startDate || "2000-01-01",
      totalDays: totalDays || 1,
      trackers: nodes.map((n) => ({
        _id: n.key,
        parentId: n.parentId,
        name: n.name,
        metric: n.metric,
        rollup: n.rollup,
        useSets: n.useSets,
        baseline: n.baseline,
        goal: n.goal,
        rampType: n.rampType,
        direction: n.direction,
        startDay: n.startDay,
      })),
    }),
    [startDate, totalDays, nodes]
  );

  function patchNode(key, patch) {
    setNodes((list) => list.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  }

  function addTop() {
    const order = nodes.filter((n) => n.parentId === null).length;
    setNodes((list) => [...list, newNode(null, "count", order)]);
  }

  function addChild(parentKey) {
    const parent = nodes.find((n) => n.key === parentKey);
    const siblings = nodes.filter((n) => n.parentId === parentKey).length;
    setNodes((list) => [
      ...list,
      newNode(parentKey, parent?.metric || "count", siblings),
    ]);
  }

  function remove(key) {
    setNodes((list) =>
      list.filter((n) => {
        let cur = n;
        while (cur) {
          if (cur.key === key) return false;
          cur = cur.parentId ? list.find((x) => x.key === cur.parentId) : null;
        }
        return true;
      })
    );
  }

  function move(key, dir) {
    setNodes((list) => {
      const node = list.find((n) => n.key === key);
      if (!node) return list;
      const siblings = list.filter((n) => n.parentId === node.parentId);
      const idx = siblings.findIndex((n) => n.key === key);
      const swap = siblings[idx + dir];
      if (!swap) return list;
      const a = { ...node, order: swap.order };
      const b = { ...swap, order: node.order };
      return list.map((n) =>
        n.key === key ? a : n.key === swap.key ? b : n
      );
    });
  }

  async function save() {
    if (!title.trim()) return setError("Give the challenge a title.");
    if (!startDate) return setError("Pick a start date.");
    if (!nodes.some((n) => n.parentId === null))
      return setError("Add at least one habit.");
    for (const n of nodes) {
      if (!n.name.trim()) return setError("Every habit needs a name.");
      if (n.metric !== "check" && !n.rollup && n.goal == null)
        return setError(`${n.name} needs a goal for the final day.`);
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      startDate,
      totalDays: Number(totalDays),
      color,
      ...(existing ? { status } : {}),
      trackers: nodes
        .filter((n) => !n.archived)
        .map((n) => ({
          ...(n._id ? { _id: n._id } : { key: n.key }),
          parentId: n.parentId,
          name: n.name.trim(),
          metric: n.metric,
          unit: n.unit || null,
          rollup: n.rollup,
          useSets: n.useSets,
          baseline: n.baseline,
          goal: n.goal,
          rampType: n.rampType,
          direction: n.direction,
          startDay: n.startDay,
          order: n.order,
        })),
    };

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        existing ? `/api/challenges/${existing._id}` : "/api/challenges",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save the challenge.");
      }
      const saved = await res.json();
      toast.success(existing ? "Challenge updated." : "Challenge created.");
      router.push(`/app/challenges/${saved._id}`);
    } catch (e) {
      setError(e.message || "Could not save the challenge.");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-4 rounded-2xl bg-card elev-sm p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 88-Day Reset"
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Why this one, and what it changes."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              max={todayKey || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex h-10 items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={
                    "h-6 w-6 rounded-full transition-transform " +
                    (color === c
                      ? "scale-110 ring-2 ring-foreground ring-offset-2"
                      : "")
                  }
                  style={{ background: colorDot(c) }}
                />
              ))}
            </div>
          </div>
        </div>

        {existing && (
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              {["active", "completed", "abandoned"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={
                    "rounded-full border px-3 py-1.5 text-sm capitalize " +
                    (status === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Duration</Label>
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setTotalDays(p.days)}
                className={
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium " +
                  (presetDays === p.days
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent")
                }
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={totalDays}
                onChange={(e) =>
                  setTotalDays(
                    Math.max(1, Math.min(365, Number(e.target.value) || 1))
                  )
                }
                className="h-9 w-20 rounded-md border bg-background px-2 text-sm"
                aria-label="Custom days"
              />
              <span className="text-sm text-muted-foreground">days</span>
              {isCustom && (
                <span className="text-xs text-muted-foreground">custom</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">What you&apos;ll track</h2>
          <p className="text-xs text-muted-foreground">up to 3 levels deep</p>
        </div>
        <TrackerTreeEditor
          nodes={nodes}
          challenge={challenge}
          onAddTop={addTop}
          onAddChild={addChild}
          onChange={patchNode}
          onRemove={remove}
          onMove={move}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : existing ? "Save changes" : "Create challenge"}
        </Button>
      </div>
    </div>
  );
}

function colorDot(c) {
  const map = {
    blue: "#3b82f6",
    green: "#22c55e",
    amber: "#f59e0b",
    red: "#ef4444",
    purple: "#a855f7",
    pink: "#ec4899",
  };
  return map[c] || "#3b82f6";
}
