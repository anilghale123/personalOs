"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, RotateCcw, Square } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { matchCategory } from "@/features/wealth/categorize";
import { INCOME_CATEGORIES } from "@/features/wealth/constants";
import { useBudgetStore } from "../store";
import { categoryOptions } from "../utils";

/** Longest recording we take — a quick-add is one sentence. */
const MAX_RECORD_MS = 15_000;

/** Fired after income is saved, so the Income tab can refresh. */
export const INCOME_CHANGED_EVENT = "selfview:income-changed";

function speechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function canRecordAudio() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function micErrorMessage(err) {
  if (err?.name === "NotAllowedError" || err?.name === "SecurityError" || err === "not-allowed") {
    return "Microphone access is blocked. Allow it for this site in your browser settings (iPhone: Settings › Safari › Microphone; installed app: long-press the icon › App info › Permissions).";
  }
  if (err?.name === "NotFoundError") return "No microphone was found on this device.";
  return "Couldn't start the microphone. You can type the entry instead.";
}

async function parseRequest(body) {
  const res = await fetch("/api/wealth/parse-voice", body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Couldn't understand that. Try again.");
    err.code = data.code;
    throw err;
  }
  return data;
}

/**
 * Voice quick-add: mic → transcript → parsed draft → user confirms → saved.
 *
 * Records with MediaRecorder and transcribes server-side (Groq Whisper). If
 * that is unavailable it falls back to the browser's own speech recognition
 * (English), and if neither exists the same dialog accepts typed text — the
 * parser is identical either way. Nothing is saved until "Save" is pressed.
 */
export function VoiceEntry({ categories }) {
  const addExpense = useBudgetStore((s) => s.addExpense);
  const options = React.useMemo(() => categoryOptions(categories), [categories]);

  const [open, setOpen] = React.useState(false);
  // idle | recording | listening | parsing | confirm
  const [phase, setPhase] = React.useState("idle");
  const [error, setError] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  const recorderRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const timersRef = React.useRef([]);
  const preferBrowserRef = React.useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.forEach(clearInterval);
    timersRef.current = [];
  };

  const stopEverything = React.useCallback(() => {
    clearTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    rec?.stream?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  }, []);

  React.useEffect(() => () => stopEverything(), [stopEverything]);

  function reset() {
    stopEverything();
    setPhase("idle");
    setError("");
    setTranscript("");
    setDraft(null);
    setElapsed(0);
  }

  function handleOpenChange(next) {
    setOpen(next);
    if (!next) {
      reset();
      setTyped("");
    }
  }

  function toDraft({ transcript: heard, parsed }) {
    const type = parsed.type === "income" ? "income" : "expense";
    setTranscript(heard);
    setDraft({
      type,
      amount: parsed.amount != null ? String(parsed.amount) : "",
      categoryId: matchCategory(options, type === "expense" ? parsed.category : null),
      incomeCategory: INCOME_CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
      note: parsed.note ?? "",
      date: toDateKey(),
    });
    setPhase("confirm");
  }

  async function parseText(text) {
    setPhase("parsing");
    setError("");
    try {
      toDraft(await parseRequest({ transcript: text }));
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    }
  }

  function startBrowserRecognition() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setError("Voice isn't supported in this browser. Type the entry below instead.");
      setPhase("idle");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let heard = "";
    recognition.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
    };
    recognition.onerror = (e) => {
      recognitionRef.current = null;
      if (e.error === "no-speech" || e.error === "aborted") {
        setError(e.error === "no-speech" ? "Didn't hear anything. Tap the mic and try again." : "");
      } else {
        setError(micErrorMessage(e.error));
      }
      setPhase("idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (heard) parseText(heard);
      else setPhase((p) => (p === "listening" ? "idle" : p));
    };
    recognitionRef.current = recognition;
    setPhase("listening");
    recognition.start();
  }

  async function startRecording() {
    setError("");
    if (preferBrowserRef.current || !canRecordAudio()) {
      startBrowserRecognition();
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(micErrorMessage(err));
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (t) => window.MediaRecorder.isTypeSupported?.(t)
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      clearTimers();
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size < 1000) {
        setError("That was too short. Tap the mic and say the amount and what it was for.");
        setPhase("idle");
        return;
      }
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `voice.${ext}`);
      setPhase("parsing");
      try {
        toDraft(await parseRequest(form));
      } catch (err) {
        if (err.code === "stt_unavailable" && speechRecognitionCtor()) {
          // Server transcription is off — use the browser from now on.
          preferBrowserRef.current = true;
          setError("Server voice isn't available — tap the mic again to use your browser's speech recognition.");
        } else {
          setError(err.message);
        }
        setPhase("idle");
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setPhase("recording");
    setElapsed(0);
    const started = Date.now();
    timersRef.current.push(setInterval(() => setElapsed(Date.now() - started), 250));
    timersRef.current.push(setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_RECORD_MS));
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recognitionRef.current?.stop?.();
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const amountValid = draft && Number(draft.amount) > 0;
  const canSave =
    draft && amountValid && !saving && (draft.type === "income" || Boolean(draft.categoryId));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (draft.type === "expense") {
        await addExpense({
          amount: draft.amount,
          categoryId: draft.categoryId,
          date: draft.date || toDateKey(),
          note: draft.note.trim() || undefined,
          paymentMethod: "cash",
          source: "voice",
        });
        toast.success("Expense added.");
      } else {
        const res = await fetch("/api/wealth/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: draft.amount,
            category: draft.incomeCategory,
            date: draft.date || toDateKey(),
            note: draft.note.trim() || undefined,
            source: "voice",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not save the income.");
        window.dispatchEvent(new Event(INCOME_CHANGED_EVENT));
        toast.success("Income added.");
      }
      handleOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  const listening = phase === "recording" || phase === "listening";

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-9"
        onClick={() => setOpen(true)}
        aria-label="Add by voice"
      >
        <Mic className="h-4 w-4" />
        <span className="hidden sm:inline">Voice</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{phase === "confirm" ? "Check and save" : "Add by voice"}</DialogTitle>
            <DialogDescription>
              {phase === "confirm"
                ? "Fix anything we misheard — nothing is saved until you press Save."
                : "Try “spent 500 on momo” or “income salary 35000”."}
            </DialogDescription>
          </DialogHeader>

          {phase !== "confirm" ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-2">
                <button
                  type="button"
                  onClick={listening ? stopRecording : startRecording}
                  disabled={phase === "parsing"}
                  aria-label={listening ? "Stop" : "Start speaking"}
                  className={cn(
                    "relative flex h-20 w-20 items-center justify-center rounded-full transition-colors disabled:opacity-60",
                    listening
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {listening && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                  )}
                  {phase === "parsing" ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : listening ? (
                    <Square className="relative h-7 w-7" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </button>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {phase === "recording"
                    ? `Listening… ${Math.ceil((MAX_RECORD_MS - elapsed) / 1000)}s — tap to stop`
                    : phase === "listening"
                    ? "Listening… tap to stop"
                    : phase === "parsing"
                    ? "Working it out…"
                    : "Tap and speak"}
                </p>
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) parseText(typed.trim());
                }}
              >
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="…or type it here"
                  maxLength={500}
                  disabled={listening || phase === "parsing"}
                  aria-label="Type the entry"
                />
                <Button type="submit" variant="outline" disabled={!typed.trim() || listening || phase === "parsing"}>
                  Parse
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
                “{transcript}”
              </p>

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Type">
                {["expense", "income"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={draft.type === t}
                    onClick={() => set({ type: t })}
                    className={cn(
                      "rounded-md py-1.5 text-sm font-medium capitalize transition-colors",
                      draft.type === t ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voice-amount">Amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    NPR
                  </span>
                  <Input
                    id="voice-amount"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) => set({ amount: e.target.value })}
                    className="h-12 pl-12 text-lg font-semibold tabular-nums"
                    autoFocus={!amountValid}
                  />
                </div>
                {!amountValid && (
                  <p className="text-xs text-muted-foreground">We didn&apos;t catch an amount — enter it here.</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="voice-category">Category</Label>
                  {draft.type === "expense" ? (
                    <Select
                      id="voice-category"
                      value={draft.categoryId}
                      onChange={(e) => set({ categoryId: e.target.value })}
                    >
                      <option value="" disabled>
                        Select a category
                      </option>
                      {options.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.depth ? "— " : ""}
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      id="voice-category"
                      value={draft.incomeCategory}
                      onChange={(e) => set({ incomeCategory: e.target.value })}
                    >
                      {INCOME_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-date">Date</Label>
                  <Input
                    id="voice-date"
                    type="date"
                    value={draft.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voice-note">Note</Label>
                <Input
                  id="voice-note"
                  value={draft.note}
                  maxLength={500}
                  onChange={(e) => set({ note: e.target.value })}
                />
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                  Try again
                </Button>
                <Button type="button" onClick={save} disabled={!canSave}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save {draft.type}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
