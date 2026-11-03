"use client";

/**
 * Browser voice-call demo. The AI "calls" you: your screen rings, you answer,
 * the assistant speaks (Web Speech synthesis) and listens (Web Speech
 * recognition). Every AI turn comes from the same deterministic engine the
 * server replays on save — no telephony, no audio leaves the browser except
 * what the browser's own speech service processes.
 */
import clsx from "clsx";
import { Keyboard, Loader2, Mic, MicOff, Phone, PhoneOff, Play, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentReplyAction, saveAgentCallAction, startAgentCallAction } from "@/app/actions/agent";
import { runCustomAction } from "@/app/actions/domain";
import { Badge, Button, Card, CardHeader, Field, inputClass, Notice } from "@/components/ui";
import { enquiryLabelFor, OUTCOMES, runConversation, type CustomerInput, type Outcome } from "@/lib/conversation/engine";

export interface CallLead {
  id: string;
  name: string;
  externalId: string;
  category: string | null;
  language: string | null;
}

type Phase = "setup" | "ringing" | "active" | "ended";
type Activity = "idle" | "speaking" | "listening" | "processing";

// Minimal typing for the Web Speech recognition API (Chrome/Edge expose the webkit prefix).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "en-IN" && /female|heera|neerja|veena|google/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

/** Split long turns into sentences: Chrome can stall on long utterances. */
function chunks(text: string): string[] {
  return text.match(/[^.?!।]+[.?!।]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/** Simple two-tone ring using Web Audio. Returns a stop function. */
function startRingtone(): () => void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    let stopped = false;
    const ring = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      for (const [freq, offset] of [[440, 0], [480, 0]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + offset);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
        g.gain.setValueAtTime(0.08, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 1.2);
      }
    };
    ring();
    const id = window.setInterval(ring, 3000);
    return () => {
      stopped = true;
      window.clearInterval(id);
      ctx.close().catch(() => undefined);
    };
  } catch {
    return () => undefined;
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type AgentTurnC = { speaker: "AI" | "CUSTOMER" | "SYSTEM"; text: string; sig?: string };
interface AgentState {
  callId: string;
  turns: AgentTurnC[];
  ended: boolean;
  outcome: Outcome | null;
  outcomeSig: string | null;
  lastSource: string | null;
}

export function VoiceCall({ leads, lenderName, smart, serverVoice }: { leads: CallLead[]; lenderName: string; smart: boolean; serverVoice: boolean }) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [callerName, setCallerName] = useState("");
  const [recogLang, setRecogLang] = useState("en-IN");
  const [phase, setPhase] = useState<Phase>("setup");
  const [activity, setActivity] = useState<Activity>("idle");
  const [inputs, setInputs] = useState<CustomerInput[]>([]);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [support, setSupport] = useState({ tts: true, stt: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [endedBy, setEndedBy] = useState<"assistant" | "you" | null>(null);

  const [agent, setAgent] = useState<AgentState | null>(null);
  const agentRef = useRef<AgentState | null>(null);
  agentRef.current = agent;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceSource, setVoiceSource] = useState<"elevenlabs" | "browser">(serverVoice ? "elevenlabs" : "browser");
  const spokenRef = useRef(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const interruptNext = useRef(false);
  const stopRing = useRef<() => void>(() => undefined);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("setup");
  phaseRef.current = phase;

  const lead = leads.find((l) => l.id === leadId);
  const engineCtx = useMemo(
    () => ({ lenderName, enquiryLabel: enquiryLabelFor(lead?.category), firstName: callerName.trim() || lead?.name }),
    [lead, lenderName, callerName],
  );
  const scripted = useMemo(() => runConversation(engineCtx, inputs, { startHindi: lead?.language === "Hindi" }), [engineCtx, inputs, lead]);
  // In smart mode the conversation comes from the server-side LLM agent.
  const run = smart && agent ? { turns: agent.turns, ended: agent.ended, outcome: agent.outcome } : scripted;

  useEffect(() => {
    setSupport({ tts: typeof window !== "undefined" && "speechSynthesis" in window, stt: !!getRecognitionCtor() });
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices(); // warm the voice list
    return () => {
      stopRing.current();
      recRef.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (phase !== "active") return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [run.turns.length, interim]);

  const commit = useCallback(
    (text: string) => {
      const interrupt = interruptNext.current;
      interruptNext.current = false;
      setInterim("");
      setActivity("processing");
      setInputs((prev) => [...prev, interrupt ? { text, interrupt: true } : { text }]);
      const a = agentRef.current;
      if (smart && a) {
        const history: AgentTurnC[] = [...a.turns, { speaker: "CUSTOMER", text }];
        setAgent({ ...a, turns: history });
        agentReplyAction(a.callId, leadId, callerName.trim() || undefined, history).then((r) => {
          const cur = agentRef.current;
          if (!cur || cur.callId !== a.callId || phaseRef.current !== "active") return;
          if (!r.ok) {
            setError(r.message);
            setActivity("idle");
            return;
          }
          setAgent({ ...cur, turns: [...history, r.turn], ended: r.ended, outcome: r.outcome, outcomeSig: r.outcomeSig, lastSource: r.source });
        });
      }
    },
    [smart, leadId, callerName],
  );

  const listen = useCallback(() => {
    if (phaseRef.current !== "active") return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setTyping(true);
      setActivity("idle");
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = recogLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    let failed = false;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + " " + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        failed = true;
        setError("Microphone access was blocked. Allow the microphone in your browser, or type your replies instead.");
        setTyping(true);
        setActivity("idle");
      } else if (e.error === "aborted") {
        failed = true;
      }
    };
    rec.onend = () => {
      recRef.current = null;
      if (failed || phaseRef.current !== "active") return;
      // No speech heard counts as silence — the assistant re-prompts once, then ends.
      commit(finalText.trim());
    };
    recRef.current = rec;
    setActivity("listening");
    try {
      rec.start();
    } catch {
      setTyping(true);
      setActivity("idle");
    }
  }, [commit, recogLang]);

  // Speak any new assistant turns, then listen (or finish the call).
  useEffect(() => {
    if (phase !== "active") return;
    const aiTurns = run.turns.filter((t) => t.speaker === "AI");
    const pending = aiTurns.slice(spokenRef.current);
    if (pending.length === 0) return;
    spokenRef.current = aiTurns.length;
    const synth = window.speechSynthesis;
    synth.cancel();
    setActivity("speaking");
    const voice = support.tts ? pickVoice() : null;
    const finish = () => {
      if (phaseRef.current !== "active") return;
      if (run.ended) {
        setActivity("idle");
        setEndedBy("assistant");
        window.setTimeout(() => setPhase("ended"), 700);
      } else if (muted || typing) setActivity("idle");
      else listen();
    };

    // Prefer the server voice (ElevenLabs); fall back to the browser voice.
    if (voiceSource === "elevenlabs") {
      const text = pending.map((t) => t.text).join(" ");
      let cancelled = false;
      fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 700) }) })
        .then(async (res) => {
          if (cancelled || phaseRef.current !== "active") return;
          if (res.status !== 200) {
            setVoiceSource("browser");
            speakBrowser(pending.flatMap((t) => chunks(t.text)));
            return;
          }
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            finish();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            setVoiceSource("browser");
            speakBrowser(pending.flatMap((t) => chunks(t.text)));
          };
          audio.play().catch(() => speakBrowser(pending.flatMap((t) => chunks(t.text))));
        })
        .catch(() => speakBrowser(pending.flatMap((t) => chunks(t.text))));
      return () => {
        cancelled = true;
      };
    }
    speakBrowser(pending.flatMap((t) => chunks(t.text)));

    function speakBrowser(pieces: string[]) {

    const next = (i: number) => {
      if (phaseRef.current !== "active") return;
      if (i >= pieces.length || !support.tts) {
        finish();
        return;
      }
      const u = new SpeechSynthesisUtterance(pieces[i]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-IN";
      u.rate = 1.02;
      u.pitch = 1.05;
      // Chrome sometimes never fires onend; advance after a generous estimate.
      let done = false;
      const advance = () => {
        if (done) return;
        done = true;
        window.clearTimeout(guard);
        next(i + 1);
      };
      const guard = window.setTimeout(advance, 2500 + pieces[i].split(/\s+/).length * 600);
      u.onend = advance;
      u.onerror = advance;
      synth.speak(u);
    };
    next(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, run.turns.length]);

  async function placeCall() {
    setError(null);
    setInputs([]);
    setElapsed(0);
    setEndedBy(null);
    setAgent(null);
    spokenRef.current = 0;
    if (smart) {
      const r = await startAgentCallAction(leadId, callerName.trim() || undefined);
      if (!r.ok) return setError(r.message);
      setAgent({ callId: r.callId, turns: [r.greeting], ended: false, outcome: null, outcomeSig: null, lastSource: null });
    }
    setPhase("ringing");
    stopRing.current = startRingtone();
  }

  async function answer() {
    stopRing.current();
    if (support.stt && !typing) {
      try {
        // Ask for the mic up front so the first "listen" doesn't stall on a prompt.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError("Microphone access was blocked. You can still type your replies.");
        setTyping(true);
      }
    }
    setPhase("active");
  }

  function decline() {
    stopRing.current();
    setPhase("setup");
  }

  function hangUp() {
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    recRef.current?.abort();
    setActivity("idle");
    setEndedBy((e) => e ?? "you");
    setPhase("ended");
  }

  function interrupt() {
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    interruptNext.current = true;
    listen();
  }

  function toggleMute() {
    if (!muted) {
      recRef.current?.abort();
      setActivity("idle");
    }
    setMuted((m) => !m);
    if (muted && activity === "idle" && !run.ended) listen();
  }

  function sendTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || run.ended) return;
    recRef.current?.abort();
    commit(draft.trim());
    setDraft("");
  }

  async function save() {
    if (inputs.length === 0) return setError("You didn't say anything, so there's nothing to analyse. Place the call again.");
    setSaving(true);
    const r =
      smart && agent
        ? await saveAgentCallAction(agent.callId, leadId, agent.turns, agent.ended ? { outcome: agent.outcome, outcomeSig: agent.outcomeSig } : null)
        : await runCustomAction(leadId, inputs, { channel: "BROWSER_VOICE", callerName: callerName.trim() || undefined });
    if (r && !r.ok) {
      setError(r.message);
      setSaving(false);
    }
  }

  if (leads.length === 0) return <Notice tone="warn">No permissioned leads are available for a demo call.</Notice>;

  const turns = run.turns;
  const outcomeLabel = run.outcome ? OUTCOMES[run.outcome] : "Ended by customer";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Left: setup or live captions */}
      <div className="space-y-6">
        {phase === "setup" ? (
          <Card>
            <CardHeader
              title="Set up the demo call"
              description="You play the customer. The assistant calls you on behalf of the lender."
              action={
                <span className="flex gap-1.5">
                  <Badge tone={smart ? "ok" : "neutral"}>{smart ? "Gemini brain on" : "Scripted brain"}</Badge>
                  <Badge tone={serverVoice ? "ok" : "neutral"}>{serverVoice ? "ElevenLabs voice on" : "Browser voice"}</Badge>
                </span>
              }
            />
            {!smart && (
              <div className="px-5 pt-4">
                <Notice tone="neutral">
                  Add <code className="font-mono text-xs">GEMINI_API_KEY</code> to <code className="font-mono text-xs">.env.local</code> and restart to let the assistant answer open questions about the catalogue. Without it, the call follows the fixed script.
                </Notice>
              </div>
            )}
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Lead record to use" htmlFor="lead" hint="Permission checks run against this lead.">
                <select id="lead" className={inputClass} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.category ?? "Loan"} · {l.externalId}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Your first name (for the greeting)" htmlFor="caller" hint="Optional. Not stored on the lead.">
                <input id="caller" className={inputClass} placeholder={lead?.name} value={callerName} maxLength={40} onChange={(e) => setCallerName(e.target.value)} />
              </Field>
              <Field label="Speech recognition language" htmlFor="lang" hint="English (India) handles Hinglish best.">
                <select id="lang" className={inputClass} value={recogLang} onChange={(e) => setRecogLang(e.target.value)}>
                  <option value="en-IN">English (India) — recommended</option>
                  <option value="en-US">English (US)</option>
                </select>
              </Field>
              <Field label="How you'll reply" htmlFor="mode">
                <select id="mode" className={inputClass} value={typing ? "type" : "voice"} onChange={(e) => setTyping(e.target.value === "type")}>
                  <option value="voice" disabled={!support.stt}>Speak (microphone)</option>
                  <option value="type">Type replies</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <Button
                variant="ghost"
                onClick={() => {
                  const u = new SpeechSynthesisUtterance(`Hello, this is the ${lenderName} assistant. Can you hear me clearly?`);
                  const v = pickVoice();
                  if (v) u.voice = v;
                  window.speechSynthesis.cancel();
                  window.speechSynthesis.speak(u);
                }}
                disabled={!support.tts}
              >
                <Volume2 className="size-4" /> Test speaker
              </Button>
              <Button variant="primary" onClick={placeCall}>
                <Phone className="size-4" /> Start demo call
              </Button>
            </div>
            {(!support.stt || !support.tts) && (
              <div className="px-5 pb-5">
                <Notice tone="warn">
                  {!support.stt && "This browser can't do speech recognition — use Chrome or Edge on a laptop to talk, or type your replies. "}
                  {!support.tts && "This browser can't speak aloud — the assistant's lines will appear as captions."}
                </Notice>
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Live captions"
              description={phase === "ended" ? `Call ended · ${outcomeLabel}` : "What the assistant said and what it heard you say."}
              action={
                <span className="flex gap-1.5">
                  <Badge tone={smart ? "ok" : "neutral"}>{smart ? (agent?.lastSource === "script" ? "Brain: script (Gemini unavailable)" : "Brain: Gemini") : "Brain: script"}</Badge>
                  <Badge>{voiceSource === "elevenlabs" ? "Voice: ElevenLabs" : "Voice: browser"}</Badge>
                </span>
              }
            />
            <div className="max-h-[480px] min-h-[320px] space-y-3 overflow-y-auto px-5 py-5">
              {phase === "ringing" && <p className="text-sm text-ink-3">Waiting for you to answer…</p>}
              {phase !== "ringing" &&
                turns.map((t, i) =>
                  t.speaker === "SYSTEM" ? (
                    <p key={i} className="text-center text-xs italic text-ink-4">{t.text}</p>
                  ) : (
                    <div key={i} className={clsx("flex", t.speaker === "CUSTOMER" && "justify-end")}>
                      <div className={clsx("max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed", t.speaker === "AI" ? "rounded-tl-sm border border-line bg-surface-2" : "rounded-tr-sm bg-ink text-white")}>
                        <span className={clsx("mb-0.5 block text-[10px] font-semibold uppercase tracking-wider", t.speaker === "AI" ? "text-ink-4" : "text-white/50")}>
                          {t.speaker === "AI" ? `${lenderName} assistant` : "You"}
                        </span>
                        {t.text}
                      </div>
                    </div>
                  ),
                )}
              {interim && (
                <div className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-dashed border-ink-4 px-3.5 py-2.5 text-[13px] italic text-ink-3">{interim}…</div>
                </div>
              )}
              <div ref={transcriptEnd} />
            </div>
            {phase === "active" && (typing || muted) && !run.ended && (
              <form onSubmit={sendTyped} className="flex gap-2 border-t border-line p-3">
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} placeholder="Type what you'd say…" maxLength={500} aria-label="Your reply" />
                <Button type="submit" variant="primary" disabled={!draft.trim()}>Send</Button>
              </form>
            )}
            {phase === "ended" && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
                <p className="text-xs text-ink-3">Save to turn this call into an evidence-backed brief for review.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setPhase("setup")}>New call</Button>
                  <Button variant="primary" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Save & analyse
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Notice tone="sim" title="How this demo works">
          No phone call is placed. Your browser transcribes your replies. {smart ? "Replies are written by Gemini, grounded only in the approved catalogue, and screened by code: opt-out and requests for a person always end the call, and replies with rates, approval promises or credential requests are blocked." : "Replies come from the deterministic SVARA script."} {serverVoice ? "The voice is generated by ElevenLabs, falling back to the browser voice if credits run out." : ""} Speech and text are processed by third-party services, so use made-up details only.
        </Notice>
      </div>

      {/* Right: the phone */}
      <div className="lg:sticky lg:top-6">
        <div className="mx-auto w-full max-w-[340px] rounded-[44px] bg-[#0a0a0a] p-3 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)]">
          <div className="relative flex h-[640px] flex-col overflow-hidden rounded-[34px] bg-gradient-to-b from-[#1a1a1a] to-[#050505] text-white">
            <div className="mx-auto mt-3 h-6 w-28 rounded-full bg-black" aria-hidden />
            <div className="flex flex-1 flex-col items-center px-6 pt-10 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                {phase === "ringing" ? "Incoming call" : phase === "active" ? fmt(elapsed) : phase === "ended" ? "Call ended" : "Ready"}
              </p>
              <div className="relative mt-8 grid size-28 place-items-center">
                {(phase === "ringing" || activity === "speaking") && (
                  <>
                    <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
                    <span className="absolute inset-3 animate-pulse rounded-full bg-white/10" />
                  </>
                )}
                {activity === "listening" && <span className="absolute inset-0 animate-pulse rounded-full ring-2 ring-white/60" />}
                <span className="relative grid size-24 place-items-center rounded-full bg-white text-[#0a0a0a]">
                  <svg viewBox="0 0 28 28" className="size-11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M7 14v0" /><path d="M10.5 10.5v7" /><path d="M14 7.5v13" /><path d="M17.5 11v6" /><path d="M21 14h0" />
                  </svg>
                </span>
              </div>
              <p className="mt-6 text-2xl font-semibold tracking-tight">{lenderName}</p>
              <p className="mt-1 text-sm text-white/60">Automated assistant · {lead?.category ?? "Loan enquiry"}</p>

              <div className="mt-8 h-10">
                {phase === "active" && (
                  <p className="flex items-center justify-center gap-2 text-sm text-white/80" aria-live="polite">
                    {activity === "speaking" && <><span className="flex h-4 items-end gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-1 animate-pulse rounded bg-white" style={{ height: `${40 + ((i * 23) % 60)}%`, animationDelay: `${i * 120}ms` }} />)}</span> Assistant speaking</>}
                    {activity === "listening" && <><Mic className="size-4" /> Listening… speak now</>}
                    {activity === "processing" && <><Loader2 className="size-4 animate-spin" /> …</>}
                    {activity === "idle" && (typing || muted ? <><Keyboard className="size-4" /> Type your reply</> : null)}
                  </p>
                )}
                {phase === "ended" && <p className="text-sm text-white/70">{endedBy === "you" && !run.ended ? "You hung up" : outcomeLabel}</p>}
              </div>
            </div>

            <div className="px-8 pb-12">
              {phase === "ringing" && (
                <div className="flex justify-between">
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={decline} aria-label="Decline" className="focus-ring grid size-16 place-items-center rounded-full bg-[#e5484d] transition-transform hover:scale-105">
                      <PhoneOff className="size-7" />
                    </button>
                    <span className="text-xs text-white/60">Decline</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={answer} aria-label="Accept" className="focus-ring grid size-16 place-items-center rounded-full bg-[#30a46c] ring-4 ring-[#30a46c]/30 transition-transform hover:scale-105">
                      <Phone className="size-7" />
                    </button>
                    <span className="text-xs text-white/60">Accept</span>
                  </div>
                </div>
              )}
              {phase === "active" && (
                <div className="flex items-end justify-between">
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className={clsx("focus-ring grid size-14 place-items-center rounded-full transition-colors", muted ? "bg-white text-black" : "bg-white/15 hover:bg-white/25")}>
                      {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
                    </button>
                    <span className="text-[11px] text-white/60">{muted ? "Muted" : "Mute"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={hangUp} aria-label="End call" className="focus-ring grid size-16 place-items-center rounded-full bg-[#e5484d] transition-transform hover:scale-105">
                      <PhoneOff className="size-7" />
                    </button>
                    <span className="text-[11px] text-white/60">End</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={interrupt} disabled={activity !== "speaking" || muted || typing} aria-label="Interrupt and speak" className="focus-ring grid size-14 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-30">
                      <Volume2 className="size-6" />
                    </button>
                    <span className="text-[11px] text-white/60">Interrupt</span>
                  </div>
                </div>
              )}
              {phase === "setup" && (
                <button onClick={placeCall} className="focus-ring mx-auto flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-white/90">
                  <Phone className="size-4" /> Start demo call
                </button>
              )}
              {phase === "ended" && (
                <button onClick={save} disabled={saving} className="focus-ring mx-auto flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Save & analyse call
                </button>
              )}
            </div>
            <div className="mx-auto mb-2 h-1 w-28 rounded-full bg-white/40" aria-hidden />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">Best in Chrome or Edge on a laptop, with headphones.</p>
      </div>
    </div>
  );
}
