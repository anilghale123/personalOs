"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ImportClient() {
  const router = useRouter();
  const inputRef = React.useRef(null);
  const [file, setFile] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");

  function pick(f) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    setError("");
    setResult(null);
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vault/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging
                ? "border-foreground/40 bg-accent"
                : "hover:bg-accent/50"
            )}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              {file ? (
                <FileSpreadsheet className="h-5 w-5" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <p className="text-sm font-medium">
              {file ? file.name : "Drop your broker CSV here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB · click to replace`
                : "or click to browse — Midas format supported"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {error && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
          )}

          <Button
            className="mt-4 w-full"
            onClick={upload}
            disabled={!file || busy}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import transactions
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Import complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {result.imported}
                </p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-2xl font-semibold">
                  {result.skipped}
                </p>
                <p className="text-xs text-muted-foreground">
                  Skipped (dupes)
                </p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-2xl font-semibold text-destructive">
                  {result.errors?.length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-destructive">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {typeof e === "string" ? e : JSON.stringify(e)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Expected CSV columns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your file should have a header row with these columns:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "Date",
              "Symbol",
              "Transaction Type",
              "Quantity",
              "Rate",
              "Amount",
              "Commission",
            ].map((c) => (
              <code
                key={c}
                className="rounded bg-secondary px-1.5 py-0.5 text-xs"
              >
                {c}
              </code>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each row is hashed (MD5) so re-importing the same file will
            skip duplicates rather than create them twice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
