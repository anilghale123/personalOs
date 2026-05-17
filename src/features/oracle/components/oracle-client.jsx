"use client";

import * as React from "react";
import { Sparkles, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

/** Render inline **bold** segments. */
function inline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyBase}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>;
  });
}

/** Minimal markdown renderer: headings, bullet lists, paragraphs. */
function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let list = [];

  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul
          key={`ul-${blocks.length}`}
          className="my-2 space-y-1.5 pl-1"
        >
          {list.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/50" />
              <span>{inline(item, `li-${blocks.length}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      return;
    }
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const text = line.replace(/^#{1,3}\s/, "");
      blocks.push(
        <h3
          key={`h-${idx}`}
          className="mt-5 flex items-center gap-2 text-sm font-semibold first:mt-0"
        >
          {inline(text, `h-${idx}`)}
        </h3>
      );
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else {
      flushList();
      blocks.push(
        <p
          key={`p-${idx}`}
          className="my-1.5 text-sm leading-relaxed text-muted-foreground"
        >
          {inline(line, `p-${idx}`)}
        </p>
      );
    }
  });
  flushList();
  return <div>{blocks}</div>;
}

export function OracleClient() {
  const [loading, setLoading] = React.useState(false);
  const [briefing, setBriefing] = React.useState(null);
  const [error, setError] = React.useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/briefing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      setBriefing(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!briefing && !loading && (
        <EmptyState
          icon={Sparkles}
          title="Your Sunday Executive Briefing"
          description="Groq analyses the last 7 days across all modules — goals, finances, journal and habits — and returns a personalised briefing with 3 actions."
        >
          <Button onClick={generate}>
            <Sparkles className="h-4 w-4" />
            Generate briefing
          </Button>
        </EmptyState>
      )}

      {loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Analysing your week with Groq…
            </p>
          </CardContent>
        </Card>
      )}

      {briefing && !loading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Generated{" "}
              {new Date(briefing.generatedAt).toLocaleString()}
            </p>
            <Button variant="outline" size="sm" onClick={generate}>
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
          <Card>
            <CardContent className="p-6">
              <Markdown text={briefing.briefing} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
