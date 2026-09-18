"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * A searchable category picker — a drop-in for the native category <select>
 * once a list outgrows scrolling.
 *
 * The list opens in the page flow under the trigger rather than floating:
 * every place this is used sits inside a dialog that scrolls, where a
 * floating panel would be clipped or push a second scrollbar.
 *
 * @param {object} props
 * @param {Array} props.options rows from `categoryOptions()` — `{_id, name, icon, depth, parentId, isArchived}`
 * @param {string} props.value selected category id
 * @param {(id: string) => void} props.onChange
 * @param {string} [props.id] id for the trigger, so a <Label htmlFor> still works
 * @param {string} [props.placeholder]
 * @param {(query: string) => void} [props.onCreate] offers "Create …" when nothing matches
 * @param {string} [props.className] applied to the trigger
 */
export function CategoryPicker({
  options,
  value,
  onChange,
  id,
  placeholder = "Select a category",
  onCreate,
  className,
  "aria-label": ariaLabel,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef(null);
  const listRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const listId = React.useId();

  const selected = options.find((c) => String(c._id) === String(value));

  const results = React.useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    const byId = new Map(options.map((c) => [String(c._id), c]));
    return options.filter((c) => {
      const parent = c.parentId ? byId.get(String(c.parentId)) : null;
      return norm(c.name).includes(q) || (parent && norm(parent.name).includes(q));
    });
  }, [options, query]);

  const exactMatch = results.some((c) => norm(c.name) === norm(query));
  const canCreate = Boolean(onCreate && norm(query) && !exactMatch);

  function close({ refocus = true } = {}) {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }

  function openPicker() {
    setOpen(true);
    const index = options.findIndex((c) => String(c._id) === String(value));
    setActive(Math.max(index, 0));
  }

  function choose(category) {
    onChange(String(category._id));
    close();
  }

  // Keep the highlight on a real row as the results narrow.
  React.useEffect(() => {
    setActive((i) => Math.min(i, Math.max(results.length - 1, 0)));
  }, [results.length]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) close({ refocus: false });
    };
    // Escape should close the list, not the dialog around it. The dialog
    // listens on the document in the capture phase, so this has to get in
    // earlier still — on the window.
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onSearchKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never let Enter here submit the surrounding form.
      e.preventDefault();
      if (results[active]) choose(results[active]);
      else if (canCreate) {
        onCreate(query.trim());
        close({ refocus: false });
      }
    } else if (e.key === "Tab") {
      close({ refocus: false });
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openPicker())}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
      >
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected ? `${selected.icon} ${selected.name}${selected.isArchived ? " (archived)" : ""}` : placeholder}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-1 overflow-hidden rounded-md border bg-background shadow-md">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search categories…"
              // 16px keeps iOS Safari from zooming the page on focus.
              className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </div>

          <ul ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {results.map((c, i) => {
              const isSelected = String(c._id) === String(value);
              return (
                <li
                  key={c._id}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                    c.depth && !query ? "pl-7" : "",
                    i === active && "bg-accent"
                  )}
                >
                  <span className="w-5 shrink-0 text-center">{c.icon}</span>
                  <span className="flex-1 truncate">
                    {c.name}
                    {c.isArchived && <span className="text-muted-foreground"> (archived)</span>}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </li>
              );
            })}

            {results.length === 0 && !canCreate && (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                {options.length === 0 ? "No categories yet." : `No category matches “${query.trim()}”.`}
              </li>
            )}

            {canCreate && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCreate(query.trim());
                    close({ refocus: false });
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent",
                    results.length === 0 && "bg-accent"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create “{query.trim()}”
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
