"use client";

import clsx from "clsx";
import { AudioLines, Bot, CornerDownLeft, Loader2, Play, RotateCcw, User, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { runCustomAction, runScenarioAction } from "@/app/actions/domain";
import { Badge, Button, Card, CardHeader, inputClass, Notice } from "@/components/ui";
import { enquiryLabelFor, runConversation, OUTCOMES, type CustomerInput } from "@/lib/conversation/engine";
import type { Scenario } from "@/lib/conversation/scenarios";

export interface SimLead {
  id: string;
  name: string;
  externalId: string;
  category: string | null;
  language: string | null;
}

export function Simulator({
  leads,
  scenarios,
  lenderName,
  initialLeadId,
}: {
  leads: SimLead[];
  scenarios: Scenario[];
  lenderName: string;
  initialLeadId?: string;
}) {
  const [leadId, setLeadId] = useState(initialLeadId && leads.some((l) => l.id === initialLeadId) ? initialLeadId : leads[0]?.id ?? "");
  const [mode, setMode] = useState<"scenario" | "live">("scenario");
  const [scenarioKey, setScenarioKey] = useState(scenarios[0]?.key ?? "");
  const [inputs, setInputs] = useState<CustomerInput[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lead = leads.find((l) => l.id === leadId);
  const engineCtx = useMemo(
    () => ({
      lenderName,
      enquiryLabel: enquiryLabelFor(lead?.category),
      firstName: lead?.name,
    }),
    [lead, lenderName],
  );
  const startHindi = lead?.language === "Hindi";

  // Preview runs the same deterministic engine the server uses.
  const preview = useMemo(() => {
    const src = mode === "scenario" ? scenarios.find((s) => s.key === scenarioKey)?.inputs ?? [] : inputs;
    return runConversation(engineCtx, src, { startHindi });
  }, [mode, scenarioKey, scenarios, inputs, engineCtx, startHindi]);

  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [preview.turns.length]);

  function send(text: string) {
    if (preview.ended) return;
    setInputs((p) => [...p, { text }]);
    setDraft("");
  }

  function save() {
    setError(null);
    start(async () => {
      const r = mode === "scenario" ? await runScenarioAction(leadId, scenarioKey) : await runCustomAction(leadId, inputs);
      if (r && !r.ok) setError(r.message);
    });
  }

  if (leads.length === 0) {
    return <Notice tone="warn">No permissioned leads are available. Import leads with a complete permission record first.</Notice>;
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="1 · Choose a lead" description="Only permissioned leads appear here." />
          <div className="p-5">
            <select className={inputClass} value={leadId} onChange={(e) => { setLeadId(e.target.value); setInputs([]); }} aria-label="Lead">
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.category ?? "No category"} · {l.externalId}
                </option>
              ))}
            </select>
            {lead && (
              <p className="mt-2 text-xs text-ink-3">
                Preferred language: {lead.language ?? "not provided"}
                {startHindi && " — the assistant opens in Hindi"}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="2 · Choose how to run it" />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 text-[13px] font-medium">
              {(["scenario", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setInputs([]); }}
                  className={clsx("focus-ring rounded-md px-3 py-1.5 transition-colors", mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
                >
                  {m === "scenario" ? "Scripted scenario" : "Play the customer"}
                </button>
              ))}
            </div>
            {mode === "scenario" ? (
              <ul className="mt-4 space-y-2">
                {scenarios.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setScenarioKey(s.key)}
                      className={clsx(
                        "focus-ring w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        s.key === scenarioKey ? "border-ink bg-surface-2" : "border-line hover:border-ink-4",
                      )}
                    >
                      <span className="block text-[13px] font-medium">{s.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{s.description}</span>
                      <span className="mt-2 flex flex-wrap gap-1">{s.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-ink-3">
                Type what the customer says. Try Hindi or Hinglish, ask about interest rates, stay silent, or say “please don&apos;t call me again”.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10"><AudioLines className="size-4" /></span>
            <div>
              <p className="text-[13px] font-medium">Simulated call · {lead?.name}</p>
              <p className="text-[11px] text-white/60">No real call is placed · deterministic mock voice agent</p>
            </div>
          </div>
          <span className="rounded-md border border-white/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Simulation</span>
        </div>

        <ol ref={listRef} className="max-h-[520px] min-h-[360px] space-y-3 overflow-y-auto bg-canvas px-5 py-5" aria-live="polite">
          {preview.turns.map((t, i) => (
            <li key={i} className={clsx("flex gap-2.5", t.speaker === "CUSTOMER" && "flex-row-reverse")}>
              {t.speaker !== "SYSTEM" && (
                <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full", t.speaker === "AI" ? "bg-ink text-white" : "border border-line-strong bg-surface text-ink-2")}>
                  {t.speaker === "AI" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                </span>
              )}
              {t.speaker === "SYSTEM" ? (
                <p className="mx-auto flex items-center gap-1.5 text-xs text-ink-3"><VolumeX className="size-3.5" /> {t.text}</p>
              ) : (
                <div className={clsx("max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed", t.speaker === "AI" ? "rounded-tl-sm border border-line bg-surface" : "rounded-tr-sm bg-ink text-white")}>
                  {t.text}
                  {t.interrupted && <span className="ml-1 text-xs text-ink-4">— interrupted</span>}
                  <span className={clsx("mt-1 block text-[10px] tabular", t.speaker === "AI" ? "text-ink-4" : "text-white/50")}>
                    {Math.floor(t.timestampMs / 60000)}:{String(Math.floor((t.timestampMs % 60000) / 1000)).padStart(2, "0")}
                  </span>
                </div>
              )}
            </li>
          ))}
          {preview.ended && (
            <li className="pt-2 text-center">
              <Badge tone={preview.outcome === "OPTED_OUT" ? "danger" : "neutral"}>Call ended · {preview.outcome ? OUTCOMES[preview.outcome] : ""}</Badge>
            </li>
          )}
        </ol>

        {mode === "live" && !preview.ended && (
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) send(draft.trim());
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type the customer's reply…" className={inputClass} aria-label="Customer reply" maxLength={500} />
            <Button type="button" variant="ghost" onClick={() => send("")} title="Customer stays silent">Silence</Button>
            <Button type="submit" disabled={!draft.trim()}><CornerDownLeft className="size-4" /></Button>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-xs text-ink-3">
            {preview.ended ? "Save to generate the evidence-backed need profile, matches and summary." : mode === "live" ? "Keep replying until the call ends, or save now." : ""}
          </p>
          <div className="flex gap-2">
            {mode === "live" && inputs.length > 0 && (
              <Button variant="ghost" onClick={() => setInputs([])}><RotateCcw className="size-4" /> Restart</Button>
            )}
            <Button variant="primary" onClick={save} disabled={pending || !leadId || (mode === "live" && inputs.length === 0)}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Save & analyse conversation
            </Button>
          </div>
        </div>
        {error && <div className="px-5 pb-4"><Notice tone="danger">{error}</Notice></div>}
      </Card>
    </div>
  );
}
