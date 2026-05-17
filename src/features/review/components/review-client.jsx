"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Star,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";

/* ---------- minimal markdown renderer for the AI briefing ---------- */

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

function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let list = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 space-y-1.5 pl-1">
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
    if (!line.trim()) return flush();
    if (/^#{1,3}\s/.test(line)) {
      flush();
      blocks.push(
        <h3 key={`h-${idx}`} className="mt-5 text-sm font-semibold first:mt-0">
          {inline(line.replace(/^#{1,3}\s/, ""), `h-${idx}`)}
        </h3>
      );
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else {
      flush();
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
  flush();
  return <div>{blocks}</div>;
}

/* ----------------------------- page ----------------------------- */

function completion(goal) {
  if (!goal.checklistItems?.length) return 0;
  return Math.round(
    (goal.checklistItems.filter((i) => i.isComplete).length /
      goal.checklistItems.length) *
      100
  );
}

export function ReviewClient({ initialGoals }) {
  const goals = initialGoals || [];
  const [ratings, setRatings] = React.useState(() =>
    Object.fromEntries(
      goals.map((g) => [g._id, g.evaluation?.rating || 0])
    )
  );
  const [reflections, setReflections] = React.useState(() =>
    Object.fromEntries(
      goals.map((g) => [g._id, g.evaluation?.reflection || ""])
    )
  );
  const [saving, setSaving] = React.useState(false);

  const [briefing, setBriefing] = React.useState(null);
  const [loadingAI, setLoadingAI] = React.useState(false);
  const [aiError, setAiError] = React.useState("");

  async function saveEvaluations() {
    setSaving(true);
    try {
      const results = await Promise.all(
        goals.map((g) =>
          fetch(`/api/weekly-goals/${g._id}/evaluate`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rating: ratings[g._id] || undefined,
              reflection: reflections[g._id] || "",
              completionRate: completion(g),
            }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error();
      toast.success("Week evaluated and saved.");
    } catch {
      toast.error("Could not save evaluations — please retry.");
    } finally {
      setSaving(false);
    }
  }

  async function generateBriefing() {
    setLoadingAI(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/briefing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      setBriefing(data);
    } catch (err) {
      setAiError(err.message);
      toast.error(err.message);
    } finally {
      setLoadingAI(false);
    }
  }

  const avgCompletion = goals.length
    ? Math.round(
        goals.reduce((s, g) => s + completion(g), 0) / goals.length
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* AI executive summary */}
      <Card className="border-brand/30 bg-brand/5">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-brand" />
            AI Executive Summary
          </CardTitle>
          {briefing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={generateBriefing}
              disabled={loadingAI}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={generateBriefing}
              disabled={loadingAI}
            >
              {loadingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {aiError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {aiError}
            </p>
          )}
          {loadingAI && !briefing && (
            <p className="text-sm text-muted-foreground">
              Analysing your week with Groq…
            </p>
          )}
          {briefing ? (
            <Markdown text={briefing.briefing} />
          ) : (
            !loadingAI &&
            !aiError && (
              <p className="text-sm text-muted-foreground">
                Generate an AI briefing across your goals, finances,
                journal and habits for the past 7 days.
              </p>
            )
          )}
        </CardContent>
      </Card>

      {/* Weekly goal evaluation */}
      {goals.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No goals to review"
          description="Add weekly goals on the Goals & Habits page, then return here at week's end to evaluate them."
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Goal Evaluation</h2>
            <Badge variant="secondary">
              {avgCompletion}% avg completion
            </Badge>
          </div>

          {goals.map((goal) => {
            const pct = completion(goal);
            return (
              <Card key={goal._id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base font-medium">
                      {goal.title}
                    </CardTitle>
                    <Badge
                      variant={
                        pct >= 80
                          ? "success"
                          : pct >= 50
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {pct}%
                    </Badge>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {goal.checklistItems.map((item) => (
                      <div
                        key={item._id}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          item.isComplete
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        )}
                      >
                        {item.isComplete ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        {item.text}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      How well did you do this week?
                    </p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() =>
                            setRatings((r) => ({ ...r, [goal._id]: n }))
                          }
                          className="p-0.5 transition-transform hover:scale-110"
                          aria-label={`Rate ${n}`}
                        >
                          <Star
                            className={cn(
                              "h-5 w-5",
                              (ratings[goal._id] || 0) >= n
                                ? "fill-brand text-brand"
                                : "text-border"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Brief reflection (optional)
                    </p>
                    <Textarea
                      placeholder="What went well? What to improve next week?"
                      className="h-20 resize-none text-sm"
                      value={reflections[goal._id] || ""}
                      onChange={(e) =>
                        setReflections((r) => ({
                          ...r,
                          [goal._id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Button
            className="w-full"
            onClick={saveEvaluations}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save week evaluations"}
          </Button>
        </>
      )}
    </div>
  );
}
