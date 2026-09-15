"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { matchCategory } from "@/features/wealth/categorize";
import { INCOME_CATEGORIES } from "@/features/wealth/constants";
import { useBudgetStore } from "../store";
import { categoryOptions } from "../utils";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Where to land after importing: the expense list pinned to the imported
 * withdrawals' date range, or the Income tab when only deposits were chosen.
 * @param {Array<{date: string, direction: string}>} imported
 */
export function importedListUrl(imported) {
  const withdrawals = imported.filter((r) => r.direction === "withdraw");
  if (!withdrawals.length) return "/app/budget/expenses?tab=income";
  const dates = withdrawals.map((r) => r.date).sort();
  const params = new URLSearchParams({ dateFrom: dates[0], dateTo: dates[dates.length - 1] });
  return `/app/budget/expenses?${params}`;
}

/**
 * Bank statement import: upload → preview (edit category, include/exclude)
 * → confirm. Pro only — the page redirects free accounts before rendering this.
 */
export function StatementImport() {
  const router = useRouter();
  const categories = useBudgetStore((s) => s.categories);
  const options = React.useMemo(() => categoryOptions(categories), [categories]);

  // upload | preview — a successful import redirects to the expense list
  const [step, setStep] = React.useState("upload");
  const [file, setFile] = React.useState(null);
  const [password, setPassword] = React.useState("");
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [statement, setStatement] = React.useState(null);
  const [rows, setRows] = React.useState([]);

  async function parse(e) {
    e?.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (password) form.append("password", password);
      const res = await fetch("/api/wealth/imports/parse", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "pdf_password_required" || data.code === "pdf_password_incorrect") {
          setNeedsPassword(true);
        }
        throw new Error(data.error || "Could not read that statement.");
      }
      setStatement(data);
      setRows(
        data.transactions.map((t) => ({
          ...t,
          include: !t.alreadyImported,
          categoryId: t.direction === "withdraw" ? matchCategory(options, t.suggestedCategory) : undefined,
          incomeCategory: t.direction === "deposit" ? t.suggestedCategory : undefined,
        }))
      );
      setStep("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const updateRow = (i, patch) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const importable = rows.filter((r) => !r.alreadyImported);
  const selected = importable.filter((r) => r.include);
  const outPaisa = selected.reduce((s, r) => s + (r.withdraw ? toMinorUnits(r.withdraw) : 0), 0);
  const inPaisa = selected.reduce((s, r) => s + (r.deposit ? toMinorUnits(r.deposit) : 0), 0);
  const missingCategory = selected.some((r) => r.direction === "withdraw" && !r.categoryId);

  async function commit() {
    if (!selected.length || missingCategory) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wealth/imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank: statement.bank,
          transactions: selected.map((r) => ({
            date: r.date,
            description: r.description,
            direction: r.direction,
            amount: r.withdraw ?? r.deposit,
            categoryId: r.direction === "withdraw" ? r.categoryId : undefined,
            incomeCategory: r.direction === "deposit" ? r.incomeCategory : undefined,
            fingerprint: r.fingerprint,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed.");

      toast.success(
        `Imported ${data.created} ${data.created === 1 ? "entry" : "entries"}` +
          (data.skippedDuplicates ? ` · ${data.skippedDuplicates} already imported, skipped` : "") +
          "."
      );

      // Statement rows carry their real dates, which are usually in past
      // months — and the expense list opens on the current month, so without
      // a range the imported expenses would appear to be missing.
      router.push(importedListUrl(selected));
      router.refresh();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  function startOver() {
    setStep("upload");
    setFile(null);
    setPassword("");
    setNeedsPassword(false);
    setStatement(null);
    setRows([]);
    setError("");
  }

  if (step === "upload") {
    return (
      <form onSubmit={parse} className="space-y-4">
        <label
          htmlFor="statement-file"
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:border-primary/50",
            file && "border-primary/50"
          )}
        >
          {file ? <FileText className="h-8 w-8 text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="text-sm font-medium">{file ? file.name : "Choose your statement PDF"}</span>
          <span className="text-xs text-muted-foreground">
            Supported: Citizens Bank electronic account statement · up to 5 MB
          </span>
          <input
            id="statement-file"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError("");
              setNeedsPassword(false);
            }}
          />
        </label>

        {needsPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="statement-password">PDF password</Label>
            <Input
              id="statement-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!file || busy || (needsPassword && !password)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Read statement
          </Button>
          <p className="text-xs text-muted-foreground">
            The PDF is read once and not stored. Nothing is saved until you confirm.
          </p>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-2xl bg-card p-4 text-sm elev-sm">
        <Fact label="Bank" value={statement.bankLabel} />
        {statement.accountMasked && <Fact label="Account" value={statement.accountMasked} />}
        {statement.fromDate && (
          <Fact label="Period" value={`${formatDate(statement.fromDate)} – ${formatDate(statement.toDate)}`} />
        )}
        {statement.openingBalance != null && <Fact label="Opening" value={formatMoney(toMinorUnits(statement.openingBalance))} />}
        {statement.closingBalance != null && <Fact label="Closing" value={formatMoney(toMinorUnits(statement.closingBalance))} />}
        <Fact
          label="Read quality"
          value={
            <span
              className={cn(
                "font-medium capitalize",
                statement.confidence === "high" && "text-emerald-600 dark:text-emerald-400",
                statement.confidence === "medium" && "text-amber-600 dark:text-amber-500",
                statement.confidence === "low" && "text-destructive"
              )}
            >
              {statement.confidence}
            </span>
          }
        />
      </div>

      {statement.fullyImported ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This statement has already been imported.</p>
            <p className="mt-0.5 text-destructive/80">
              All {statement.transactions.length} transactions are already in your records, so there is nothing new to import.
            </p>
          </div>
        </div>
      ) : (
        statement.alreadyImportedCount > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {statement.alreadyImportedCount} of {statement.transactions.length} transactions were imported before and
              can&apos;t be imported again. Only the new ones are selected.
            </p>
          </div>
        )
      )}

      {statement.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {statement.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-2xl bg-card elev-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Include all new transactions"
                  disabled={importable.length === 0}
                  checked={importable.length > 0 && importable.every((r) => r.include)}
                  onChange={(e) =>
                    setRows((list) =>
                      list.map((r) => (r.alreadyImported ? r : { ...r, include: e.target.checked }))
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 text-right font-medium">Withdraw</th>
              <th className="px-3 py-2.5 text-right font-medium">Deposit</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.fingerprint} className={cn("border-b last:border-0", !r.include && "opacity-50")}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Include ${r.description}`}
                    // Already-imported rows are locked out — importing them
                    // again would double-count the money.
                    disabled={r.alreadyImported}
                    title={r.alreadyImported ? "Already imported" : undefined}
                    checked={r.include && !r.alreadyImported}
                    onChange={(e) => updateRow(i, { include: e.target.checked })}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">{r.date}</td>
                <td className="max-w-[260px] px-3 py-2">
                  <p className="line-clamp-2 break-words text-xs">{r.description}</p>
                  {r.alreadyImported && (
                    <span className="mt-0.5 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Already imported
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {r.withdraw != null ? formatMoney(toMinorUnits(r.withdraw)) : "–"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {r.deposit != null ? formatMoney(toMinorUnits(r.deposit)) : "–"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {r.balance != null ? formatMoney(toMinorUnits(r.balance)) : "–"}
                </td>
                <td className="px-3 py-2">
                  {r.direction === "withdraw" ? (
                    <Select
                      className="h-8 w-44 text-xs"
                      value={r.categoryId}
                      onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                      aria-label="Expense category"
                    >
                      <option value="" disabled>
                        Category
                      </option>
                      {options.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      className="h-8 w-44 text-xs"
                      value={r.incomeCategory}
                      onChange={(e) => updateRow(i, { incomeCategory: e.target.value })}
                      aria-label="Income category"
                    >
                      {INCOME_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          Income · {c}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-20 flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 elev-sm md:bottom-4">
        <p className="text-sm">
          <span className="font-medium">{selected.length}</span> selected ·{" "}
          <span className="tabular-nums">−{formatMoney(outPaisa)}</span> ·{" "}
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">+{formatMoney(inPaisa)}</span>
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={startOver} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={commit}
            disabled={busy || statement.fullyImported || !selected.length || missingCategory}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {statement.fullyImported ? "Already imported" : `Import ${selected.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
