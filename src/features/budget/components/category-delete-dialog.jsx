"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useBudgetStore } from "../store";

/**
 * Forces a choice when deleting a category that has expenses —
 * reassign them elsewhere, or archive the category instead. Expenses
 * are never orphaned or silently deleted.
 */
export function CategoryDeleteDialog({ open, onOpenChange, category, categories, expenseCount }) {
  const deleteCategory = useBudgetStore((s) => s.deleteCategory);
  const [reassignTo, setReassignTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const otherOptions = categories.filter((c) => c._id !== category?._id && !c.isArchived);

  React.useEffect(() => {
    if (open) setReassignTo("");
  }, [open]);

  async function handleArchive() {
    setBusy(true);
    try {
      await deleteCategory(category._id, { archive: true });
      toast.success("Category archived — it stays visible in past reports.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReassignAndDelete() {
    if (!reassignTo) return;
    setBusy(true);
    try {
      await deleteCategory(category._id, { reassignTo });
      toast.success("Expenses reassigned and category deleted.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{category.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            {expenseCount} expense{expenseCount === 1 ? "" : "s"} use this category. Choose what
            happens to them — nothing is ever deleted silently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Archive instead (recommended)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Keeps all history intact. The category stays visible in past reports but won&apos;t
              appear in the &ldquo;add expense&rdquo; picker.
            </p>
            <Button size="sm" variant="outline" className="mt-2" onClick={handleArchive} disabled={busy}>
              Archive category
            </Button>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Reassign expenses and delete</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Moves every expense in this category to another one, then deletes it permanently.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="flex-1">
                <option value="">Choose a category…</option>
                {otherOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReassignAndDelete}
                disabled={!reassignTo || busy}
              >
                Reassign & delete
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
