"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useBudgetStore } from "../store";
import { CATEGORY_TYPES } from "../constants";
import { topLevelCategories } from "../utils";

const QUICK_EMOJI = ["🏷️", "🛒", "🍽️", "🚌", "🏠", "💡", "🩺", "📚", "🛍️", "🎬", "✈️", "🎁"];
const QUICK_COLORS = [
  "#64748b",
  "#16a34a",
  "#2563eb",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];

const EMPTY = { name: "", icon: "🏷️", color: "#64748b", type: "want", parentId: "", note: "" };

/** Names compare the way the server's unique index does: trimmed, case-insensitive. */
const nameKey = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * @param {object} props
 * @param {(category: object) => void} [props.onSaved] called with the saved
 *   category — the expense form uses it to select a category it just created
 * @param {string} [props.initialName] prefills a new category's name
 */
export function CategoryFormDialog({
  open,
  onOpenChange,
  categories,
  editing,
  onSaved,
  initialName = "",
}) {
  const addCategory = useBudgetStore((s) => s.addCategory);
  const updateCategory = useBudgetStore((s) => s.updateCategory);
  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              name: editing.name,
              icon: editing.icon,
              color: editing.color,
              type: editing.type,
              parentId: editing.parentId || "",
              note: editing.note || "",
            }
          : { ...EMPTY, name: initialName }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parentOptions = topLevelCategories(categories).filter((c) => c._id !== editing?._id);

  // Checked as the user types, against the same level the category will sit
  // at, so a duplicate is caught before the round trip rather than after.
  const parentId = editing ? editing.parentId || "" : form.parentId;
  const duplicate = React.useMemo(() => {
    const key = nameKey(form.name);
    if (!key) return null;
    return (
      categories.find(
        (c) =>
          c._id !== editing?._id &&
          String(c.parentId || "") === String(parentId || "") &&
          nameKey(c.name) === key
      ) || null
    );
  }, [categories, editing, form.name, parentId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || duplicate) return;
    setSaving(true);
    try {
      let saved;
      if (editing) {
        saved = await updateCategory(editing._id, {
          name: form.name,
          icon: form.icon,
          color: form.color,
          type: form.type,
          note: form.note,
        });
        toast.success("Category updated.");
      } else {
        saved = await addCategory({
          name: form.name,
          icon: form.icon,
          color: form.color,
          type: form.type,
          parentId: form.parentId || undefined,
          note: form.note || undefined,
        });
        toast.success("Category added.");
      }
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast.error(err.message || "Could not save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-icon">Icon</Label>
              <Input
                id="cat-icon"
                value={form.icon}
                onChange={(e) => set({ icon: e.target.value })}
                className="h-9 w-16 text-center text-lg"
                maxLength={4}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Ride-share"
                required
                aria-invalid={Boolean(duplicate)}
                aria-describedby={duplicate ? "cat-name-duplicate" : undefined}
                autoFocus
              />
            </div>
          </div>
          {duplicate && (
            <p id="cat-name-duplicate" role="alert" className="-mt-2 text-xs text-destructive">
              {duplicate.isArchived
                ? `"${duplicate.name}" already exists as an archived category.`
                : `"${duplicate.name}" already exists.`}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => set({ icon: emoji })}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-base hover:bg-accent",
                  form.icon === emoji && "border-primary bg-primary/10"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-1.5">
              {CATEGORY_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ type: t.id })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    form.type === t.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ color: c })}
                  aria-label={c}
                  className={cn(
                    "h-7 w-7 rounded-full border-2",
                    form.color === c ? "border-foreground" : "border-transparent"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="cat-parent">Parent category (optional — makes this a subcategory)</Label>
              <Select
                id="cat-parent"
                value={form.parentId}
                onChange={(e) => set({ parentId: e.target.value })}
              >
                <option value="">None — top-level category</option>
                {parentOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cat-note">Note (optional)</Label>
            <Textarea
              id="cat-note"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              className="h-16 resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!form.name.trim() || Boolean(duplicate) || saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
