"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Loader2, Mic, Pause, Play, Send, Trash2, Undo2 } from "lucide-react";
import { cn, toDateKey } from "@/lib/utils";
import { formatMoney, toMinorUnits } from "@/lib/money";
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
import { CategoryPicker } from "./category-picker";

/** Longest recording — a voice note is a sentence or two. */
const MAX_RECORD_MS = 60_000;
/** Shorter than this is a tap, not a recording. */
const MIN_RECORD_MS = 700;

/** Fired after income is saved or removed, so the Income tab can refresh. */
export const INCOME_CHANGED_EVENT = "selfview:income-changed";

const LANGUAGE_KEY = "voice-language";
const LANGUAGES = [
  { id: "auto", label: "Auto", hint: "Nepali + English mixed" },
  { id: "en", label: "English", hint: "English only" },
  { id: "ne", label: "नेपाली", hint: "Nepali only" },
];

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
  const name = typeof err === "string" ? err : err?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "not-allowed") {
    return "Microphone access is blocked. Allow it for this site in your browser settings (iPhone: Settings › Safari › Microphone; installed app: long-press the icon › App info › Permissions).";
  }
  if (name === "NotFoundError") return "No microphone was found on this device.";
  return "Couldn't start the microphone. You can type the entry instead.";
}

function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function parseRequest(body) {
  const res = await fetch(
    "/api/wealth/parse-voice",
    body instanceof FormData
      ? { method: "POST", body }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Couldn't understand that. Try again.");
    err.code = data.code;
    throw err;
  }
  return data;
}

/**
 * Voice quick-add, messenger style.
 *
 *   hold the mic → record → release → play it back → Send
 *   → transcribed and parsed → saved straight away, with Undo
 *
 * Saving is automatic whenever an amount was understood; the toast and the
 * "saved" list both offer Undo for the times the transcript was wrong. Only
 * when no amount is heard does a form open to fill it in.
 *
 * Records with MediaRecorder and transcribes server-side (Groq Whisper). If
 * that is unavailable, holding the mic uses the browser's own speech
 * recognition instead (no playback in that mode). Typing works everywhere.
 */
export function VoiceEntry({ categories }) {
  const addExpense = useBudgetStore((s) => s.addExpense);
  const deleteExpense = useBudgetStore((s) => s.deleteExpense);
  const options = React.useMemo(() => categoryOptions(categories), [categories]);

  const [open, setOpen] = React.useState(false);
  // idle | recording | review | sending | confirm
  const [phase, setPhase] = React.useState("idle");
  const [language, setLanguageState] = React.useState("auto");
  const [clip, setClip] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState([]);

  const recorderRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const holdingRef = React.useRef(false);
  const startedAtRef = React.useRef(0);
  const timersRef = React.useRef([]);
  const audioRef = React.useRef(null);
  const clipUrlRef = React.useRef(null);
  const preferBrowserRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (LANGUAGES.some((l) => l.id === stored)) setLanguageState(stored);
    } catch {
      // Storage unavailable — keep the default.
    }
  }, []);

  function setLanguage(id) {
    setLanguageState(id);
    try {
      localStorage.setItem(LANGUAGE_KEY, id);
    } catch {
      // Not persisted; still applies for this session.
    }
  }

  const clearTimers = () => {
    timersRef.current.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    timersRef.current = [];
  };

  /** Stop every capture without producing a clip. Refs only, so safe anywhere. */
  const teardown = React.useCallback(() => {
    holdingRef.current = false;
    timersRef.current.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    timersRef.current = [];
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
  }, []);

  React.useEffect(() => teardown, [teardown]);

  function discardClip() {
    audioRef.current?.pause();
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = null;
    setClip(null);
    setPlaying(false);
  }

  function handleOpenChange(next) {
    setOpen(next);
    if (!next) {
      teardown();
      setClip(null);
      setPlaying(false);
      setPhase("idle");
      setError("");
      setHint("");
      setDraft(null);
      setTyped("");
      setSaved([]);
    }
  }

  function startTimers(onMax) {
    startedAtRef.current = Date.now();
    setElapsed(0);
    timersRef.current.push(setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200));
    timersRef.current.push(setTimeout(onMax, MAX_RECORD_MS));
  }

  /* ---------------- capture ---------------- */

  async function startHold() {
    if (phase !== "idle" || holdingRef.current) return;
    holdingRef.current = true;
    setError("");
    setHint("");

    if (preferBrowserRef.current || !canRecordAudio()) {
      startRecognition();
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      holdingRef.current = false;
      setError(micErrorMessage(err));
      return;
    }

    // Released while the permission prompt was up: nothing to record yet.
    if (!holdingRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setHint("Microphone is ready — press and hold to record.");
      return;
    }
    streamRef.current = stream;

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (t) => window.MediaRecorder.isTypeSupported?.(t)
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearTimers();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;

      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (durationMs < MIN_RECORD_MS || blob.size < 500) {
        setPhase("idle");
        setHint("Keep holding the mic while you speak, then let go.");
        return;
      }
      const url = URL.createObjectURL(blob);
      clipUrlRef.current = url;
      setClip({ blob, url, durationMs });
      setPhase("review");
    };

    recorderRef.current = recorder;
    recorder.start();
    navigator.vibrate?.(15);
    setPhase("recording");
    startTimers(endHold);
  }

  function startRecognition() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      holdingRef.current = false;
      setError("Voice recording isn't supported in this browser. Type the entry below instead.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang =
      language === "ne" || (language === "auto" && navigator.language?.startsWith("ne"))
        ? "ne-NP"
        : "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;
    let heard = "";
    recognition.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ").trim();
    };
    recognition.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") setError(micErrorMessage(e.error));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      holdingRef.current = false;
      clearTimers();
      if (heard) sendText(heard);
      else {
        setPhase("idle");
        setHint("Didn't catch that — hold the mic while you speak.");
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setPhase("recording");
    startTimers(endHold);
  }

  function endHold() {
    holdingRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recognitionRef.current?.stop();
  }

  /* ---------------- playback ---------------- */

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  /* ---------------- send, parse, save ---------------- */

  async function sendClip() {
    if (!clip) return;
    audioRef.current?.pause();
    setPlaying(false);
    setPhase("sending");
    setError("");

    const type = clip.blob.type;
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("audio", clip.blob, `voice.${ext}`);
    form.append("language", language);

    try {
      const result = await parseRequest(form);
      discardClip();
      await handleParsed(result);
    } catch (err) {
      if (err.code === "stt_unavailable" && speechRecognitionCtor()) {
        preferBrowserRef.current = true;
        discardClip();
        setPhase("idle");
        setError("Server voice isn't available — hold the mic again to use your browser's speech recognition.");
      } else {
        // Keep the clip so Send can be retried.
        setPhase("review");
        setError(err.message);
      }
    }
  }

  async function sendText(text) {
    setPhase("sending");
    setError("");
    try {
      await handleParsed(await parseRequest({ transcript: text }));
      setTyped("");
    } catch (err) {
      setPhase("idle");
      setError(err.message);
    }
  }

  function buildDraft(parsed) {
    const type = parsed.type === "income" ? "income" : "expense";
    return {
      type,
      amount: parsed.amount != null ? String(parsed.amount) : "",
      categoryId: matchCategory(options, type === "expense" ? parsed.category : null),
      incomeCategory: INCOME_CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
      note: parsed.note ?? "",
      date: toDateKey(),
    };
  }

  const draftComplete = (d) => Number(d.amount) > 0 && (d.type === "income" || Boolean(d.categoryId));

  async function handleParsed({ transcript: heard, parsed }) {
    const next = buildDraft(parsed);
    if (draftComplete(next)) {
      try {
        await persist(next, heard);
        setPhase("idle");
        return;
      } catch (err) {
        setError(err.message || "Could not save that.");
      }
    } else {
      setError(
        Number(next.amount) > 0
          ? "Pick a category, then save."
          : "We didn't catch an amount — add it below, then save."
      );
    }
    setTranscript(heard);
    setDraft(next);
    setPhase("confirm");
  }

  /** Save a draft and offer Undo. Throws on failure. */
  async function persist(d, heard) {
    const note = d.note.trim() || undefined;
    let entry;

    if (d.type === "expense") {
      const saved = await addExpense({
        amount: d.amount,
        categoryId: d.categoryId,
        date: d.date || toDateKey(),
        note,
        paymentMethod: "cash",
        source: "voice",
      });
      const category = options.find((c) => String(c._id) === String(d.categoryId));
      entry = {
        id: saved._id,
        kind: "expense",
        amountPaisa: saved.amountPaisa ?? toMinorUnits(d.amount),
        label: [category?.name, note].filter(Boolean).join(" · "),
      };
    } else {
      const res = await fetch("/api/wealth/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: d.amount,
          category: d.incomeCategory,
          date: d.date || toDateKey(),
          note,
          source: "voice",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the income.");
      window.dispatchEvent(new Event(INCOME_CHANGED_EVENT));
      entry = {
        id: data._id,
        kind: "income",
        amountPaisa: data.amountPaisa ?? toMinorUnits(d.amount),
        label: [d.incomeCategory, note].filter(Boolean).join(" · "),
      };
    }

    entry = { ...entry, transcript: heard, undone: false, undoing: false };
    setSaved((list) => [entry, ...list].slice(0, 10));
    navigator.vibrate?.([10, 40, 10]);
    toast.success(
      `${entry.kind === "income" ? "Income" : "Expense"} saved · ${formatMoney(entry.amountPaisa)}`,
      {
        description: entry.label || undefined,
        action: { label: "Undo", onClick: () => undo(entry) },
      }
    );
    return entry;
  }

  async function undo(entry) {
    const mark = (patch) =>
      setSaved((list) => list.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)));
    mark({ undoing: true });
    try {
      if (entry.kind === "expense") {
        await deleteExpense(entry.id);
      } else {
        const res = await fetch(`/api/wealth/income/${entry.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        window.dispatchEvent(new Event(INCOME_CHANGED_EVENT));
      }
      mark({ undoing: false, undone: true });
      toast.success("Removed.");
    } catch {
      mark({ undoing: false });
      toast.error("Couldn't undo that — delete it from the list instead.");
    }
  }

  async function saveDraft() {
    if (!draft || !draftComplete(draft) || saving) return;
    setSaving(true);
    try {
      await persist(draft, transcript);
      setDraft(null);
      setError("");
      setPhase("idle");
    } catch (err) {
      setError(err.message || "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- render ---------------- */

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const busy = phase === "recording" || phase === "sending";
  const holdHandlers = {
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startHold();
    },
    onPointerUp: endHold,
    onPointerCancel: endHold,
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        startHold();
      }
    },
    onKeyUp: (e) => {
      if (e.key === " " || e.key === "Enter") endHold();
    },
  };

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
            <DialogTitle>{phase === "confirm" ? "Almost there" : "Add by voice"}</DialogTitle>
            <DialogDescription>
              {phase === "confirm"
                ? "Fill in what we missed, then save."
                : "Hold the mic and say “spent 500 on momo” or “मोमोमा ५०० खर्च”. Release, then send — it saves straight away."}
            </DialogDescription>
          </DialogHeader>

          {phase !== "confirm" ? (
            <div className="space-y-4">
              <div
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
                role="radiogroup"
                aria-label="Spoken language"
              >
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={language === l.id}
                    title={l.hint}
                    disabled={busy}
                    onClick={() => setLanguage(l.id)}
                    className={cn(
                      "rounded-md py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                      language === l.id ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {saved.length > 0 && (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                  {saved.map((e) => (
                    <li
                      key={e.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm",
                        e.undone && "opacity-50"
                      )}
                    >
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate font-medium tabular-nums", e.undone && "line-through")}>
                          {e.kind === "income" ? "+" : "−"}
                          {formatMoney(e.amountPaisa)}
                          {e.label && <span className="font-normal text-muted-foreground"> · {e.label}</span>}
                        </p>
                        {e.transcript && (
                          <p className="truncate text-xs italic text-muted-foreground">“{e.transcript}”</p>
                        )}
                      </div>
                      {e.undone ? (
                        <span className="text-xs text-muted-foreground">Undone</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={e.undoing}
                          onClick={() => undo(e)}
                        >
                          {e.undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                          Undo
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {phase === "idle" || phase === "recording" ? (
                <div className="flex flex-col items-center gap-3 py-3">
                  <button
                    type="button"
                    {...holdHandlers}
                    aria-label={phase === "recording" ? "Recording — release to stop" : "Hold to record"}
                    className={cn(
                      "relative flex h-24 w-24 touch-none select-none items-center justify-center rounded-full transition-transform [-webkit-touch-callout:none]",
                      phase === "recording"
                        ? "scale-110 bg-destructive text-destructive-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {phase === "recording" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                    )}
                    <Mic className="relative h-9 w-9" />
                  </button>
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {phase === "recording" ? (
                      <span className="font-medium text-destructive tabular-nums">
                        ● {clock(elapsed)} — release to stop
                      </span>
                    ) : (
                      "Hold to record"
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-muted p-1.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 rounded-full text-muted-foreground"
                    onClick={() => {
                      discardClip();
                      setPhase("idle");
                      setError("");
                    }}
                    disabled={phase === "sending"}
                    aria-label="Delete recording"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={phase === "sending" || !clip}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-background px-3 py-2 text-sm disabled:opacity-60"
                    aria-label={playing ? "Pause" : "Play recording"}
                  >
                    {playing ? <Pause className="h-4 w-4 shrink-0" /> : <Play className="h-4 w-4 shrink-0" />}
                    <span className="flex h-4 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
                      {Array.from({ length: 24 }, (_, i) => (
                        <span
                          key={i}
                          className={cn("w-[3px] rounded-full bg-foreground/40", playing && "animate-pulse")}
                          style={{ height: `${30 + ((i * 37) % 70)}%` }}
                        />
                      ))}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {clip ? clock(clip.durationMs) : "0:00"}
                    </span>
                  </button>

                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full"
                    onClick={sendClip}
                    disabled={phase === "sending" || !clip}
                    aria-label="Send"
                  >
                    {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>

                  {clip && (
                    <audio ref={audioRef} src={clip.url} onEnded={() => setPlaying(false)} className="hidden" />
                  )}
                </div>
              )}

              {phase === "sending" && !clip && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </p>
              )}

              {hint && !error && <p className="text-center text-sm text-muted-foreground">{hint}</p>}

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim() && phase === "idle") sendText(typed.trim());
                }}
              >
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="…or type it: 500 ko momo"
                  maxLength={500}
                  disabled={phase !== "idle"}
                  aria-label="Type the entry"
                />
                <Button type="submit" size="icon" variant="outline" disabled={!typed.trim() || phase !== "idle"} aria-label="Send text">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              {transcript && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">“{transcript}”</p>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

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
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="voice-category">Category</Label>
                  {draft.type === "expense" ? (
                    <CategoryPicker
                      id="voice-category"
                      options={options}
                      value={draft.categoryId}
                      onChange={(categoryId) => set({ categoryId })}
                    />
                  ) : (
                    <Select id="voice-category" value={draft.incomeCategory} onChange={(e) => set({ incomeCategory: e.target.value })}>
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
                  <Input id="voice-date" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voice-note">Note</Label>
                <Input id="voice-note" value={draft.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(null);
                    setError("");
                    setPhase("idle");
                  }}
                >
                  Discard
                </Button>
                <Button type="button" onClick={saveDraft} disabled={!draftComplete(draft) || saving}>
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
