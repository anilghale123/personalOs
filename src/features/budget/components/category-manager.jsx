"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { useBudgetStore } from "../store";
import { CATEGORY_TYPES } from "../constants";
import { topLevelCategories, subcategoriesOf } from "../utils";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoryDeleteDialog } from "./category-delete-dialog";

const TYPE_TONE = Object.fromEntries(CATEGORY_TYPES.map((t) => [t.id, t.tone]));
const TYPE_LABEL = Object.fromEntries(CATEGORY_TYPES.map((t) => [t.id, t.label]));

function CategoryRow({ category, categories, onEdit, onDeleteRequest, sub = false }) {
  const updateCategory = useBudgetStore((s) => s.updateCategory);

  async function toggleArchive() {
    try {
      await updateCategory(category._id, { isArchived: !category.isArchived });
      toast.success(category.isArchived ? "Category restored." : "Category archived.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/50 ${
        sub ? "ml-9" : ""
      } ${category.isArchived ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{ background: `${category.color}22` }}
          aria-hidden="true"
        >
          {category.icon}
        </span>
        <span className="truncate font-medium">{category.name}</span>
        <Badge variant={TYPE_TONE[category.type]} className="shrink-0">
          {TYPE_LABEL[category.type]}
        </Badge>
        {category.isArchived && (
          <Badge variant="outline" className="shrink-0">
            Archived
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => onEdit(category)}
          aria-label="Edit category"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={toggleArchive}
          aria-label={category.isArchived ? "Restore category" : "Archive category"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {category.isArchived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => onDeleteRequest(category)}
          aria-label="Delete category"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function CategoryManager({ categories }) {
  const deleteCategory = useBudgetStore((s) => s.deleteCategory);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [expenseCount, setExpenseCount] = React.useState(0);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(category) {
    setEditing(category);
    setFormOpen(true);
  }

  async function requestDelete(category) {
    try {
      // Attempt the delete; if it has expenses the API responds 409 with the count,
      // which we surface as the resolution dialog instead of a blind confirm.
      await deleteCategory(category._id);
      toast.success("Category deleted.");
    } catch (err) {
      if (err.status === 409) {
        setExpenseCount(err.expenseCount || 0);
        setDeleteTarget(category);
      } else {
        toast.error(err.message || "Could not delete category.");
      }
    }
  }

  const topLevel = topLevelCategories(categories);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Archived categories stay visible in past reports but won&apos;t appear when adding a new
          expense.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New category
        </Button>
      </div>

      {topLevel.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="Add your first category to start logging expenses."
        >
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New category
          </Button>
        </EmptyState>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {topLevel.map((c) => (
            <div key={c._id} className="px-2 py-1">
              <CategoryRow
                category={c}
                categories={categories}
                onEdit={openEdit}
                onDeleteRequest={requestDelete}
              />
              {subcategoriesOf(categories, c._id).map((sub) => (
                <CategoryRow
                  key={sub._id}
                  category={sub}
                  categories={categories}
                  onEdit={openEdit}
                  onDeleteRequest={requestDelete}
                  sub
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        editing={editing}
      />
      <CategoryDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        category={deleteTarget}
        categories={categories}
        expenseCount={expenseCount}
      />
    </div>
  );
}
