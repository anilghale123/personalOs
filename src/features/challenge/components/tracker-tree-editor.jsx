"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { METRICS, MAX_DEPTH } from "@/features/challenge/constants";
import { RampPreview } from "./ramp-preview";

/**
 * The edit form for one tracker node: its name, metric, the rollup / sets
 * toggles, and (for things that have a target) the goal, starting level and
 * ramp type. A live RampPreview sits under it so the numbers can be
 * sanity-checked before saving.
 *
 * Everything is controlled: `node` in, `onChange(patch)` out.
 */
function NodeFields({ node, onChange, challenge }) {
  const isCheck = node.metric === "check";
  const hasTarget = !isCheck && !node.rollup;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={node.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name"
          aria-label="Name"
          className="h-8 min-w-[8rem] flex-1 bg-background text-sm"
        />
        <select
          value={node.metric}
          onChange={(e) => onChange({ metric: e.target.value })}
          aria-label="Metric"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {!isCheck && (
          <Input
            value={node.unit || ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="unit"
            aria-label="Unit"
            className="h-8 w-16 bg-background px-2 text-sm"
          />
        )}
      </div>

      {/* A parent chooses "total of sub-items" or "track separately"; a
          leaf chooses "track sets". */}
      <div className="flex flex-wrap gap-2">
        {node.hasChildren && (
          <Toggle
            on={node.rollup}
            onToggle={() => onChange({ rollup: !node.rollup })}
            label="Total of sub-items"
          />
        )}
        {!node.hasChildren && !node.rollup && (
          <Toggle
            on={node.useSets}
            onToggle={() => onChange({ useSets: !node.useSets })}
            label="Track sets"
          />
        )}
      </div>

      {hasTarget && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Goal (final day)">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={node.goal ?? ""}
              onChange={(e) =>
                onChange({
                  goal: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 bg-background text-sm"
            />
          </Field>
          <Field label="Starting level">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={node.baseline ?? ""}
              placeholder="Calibrate"
              onChange={(e) =>
                onChange({
                  baseline:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 bg-background text-sm"
            />
          </Field>
          <Field label="Ramp">
            <select
              value={node.rampType}
              onChange={(e) => onChange({ rampType: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="linear">Linear</option>
              <option value="percent">Percent</option>
            </select>
          </Field>
          <Field label="Direction">
            <select
              value={node.direction}
              onChange={(e) => onChange({ direction: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
            </select>
          </Field>
        </div>
      )}

      {node.baseline == null && hasTarget && (
        <p className="text-[11px] text-muted-foreground">
          No starting level — day 1 is a calibration day.
        </p>
      )}

      <RampPreview challenge={challenge} tracker={node} />
    </div>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          on ? "bg-primary" : "bg-muted-foreground/40"
        )}
      />
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * One node, rendered with its own children nested beneath it.
 *
 * The depth limits nesting: at level 3 (a variation) no "add item" button is
 * offered — the UI half of the model's depth rule.
 */
function NodeRow({
  node,
  depth,
  nodes,
  challenge,
  onChange,
  onAddChild,
  onRemove,
  onMove,
}) {
  const children = nodes.filter((n) => n.parentId === node.key);
  const canAddChild = depth < MAX_DEPTH - 1;
  const siblings = nodes.filter(
    (n) => n.parentId === node.parentId && !n.archived
  );
  const isFirst = siblings[0]?.key === node.key;
  const isLast = siblings[siblings.length - 1]?.key === node.key;

  return (
    <div className={cn("rounded-xl border p-3", depth === 0 && "bg-muted/30")}>
      <div className="flex items-start gap-2">
        {depth === 0 && (
          <Dumbbell className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <NodeFields
            node={{ ...node, hasChildren: children.length > 0 }}
            onChange={onChange}
            challenge={challenge}
          />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-0.5">
            <IconBtn
              onClick={() => onMove(node.key, -1)}
              disabled={isFirst}
              label="Move up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              onClick={() => onMove(node.key, 1)}
              disabled={isLast}
              label="Move down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn onClick={() => onRemove(node.key)} label="Remove" danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </div>
      </div>

      {children.length > 0 && (
        <div
          className={cn(
            "mt-2 space-y-2 border-l pl-3",
            depth === 0 ? "ml-2" : "ml-3"
          )}
        >
          {children.map((c) => (
            <NodeRow
              key={c.key}
              node={c}
              depth={depth + 1}
              nodes={nodes}
              challenge={challenge}
              onChange={onChange}
              onAddChild={onAddChild}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}
        </div>
      )}

      {canAddChild && (
        <button
          type="button"
          onClick={() => onAddChild(node.key)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add {depth === 0 ? "item" : "variation"}
        </button>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, disabled, label, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-30",
        danger
          ? "hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

/**
 * The whole tracker tree, plus the "add a habit" control.
 *
 * `nodes` is the flat list the builder owns; the editor only edits it through
 * the callbacks, so the builder stays the single source of truth — and the
 * same list is what gets sent to the API.
 */
export function TrackerTreeEditor({
  nodes,
  challenge,
  onAddTop,
  onAddChild,
  onChange,
  onRemove,
  onMove,
}) {
  const tops = nodes.filter((n) => n.parentId === null);

  return (
    <div className="space-y-2">
      {tops.map((n) => (
        <NodeRow
          key={n.key}
          node={n}
          depth={0}
          nodes={nodes}
          challenge={challenge}
          onChange={onChange}
          onAddChild={onAddChild}
          onRemove={onRemove}
          onMove={onMove}
        />
      ))}
      <button
        type="button"
        onClick={onAddTop}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add a habit
      </button>
    </div>
  );
}
