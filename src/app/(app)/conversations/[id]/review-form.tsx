"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitReviewAction } from "@/app/actions/domain";
import { Button, Field, inputClass, Notice } from "@/components/ui";

export interface EditableField {
  name: string;
  label: string;
  value: string | null;
}

const OUTCOMES: Record<string, string> = {
  ACCEPTED: "Accepted — brief is accurate",
  CORRECTED: "Accepted with corrections",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  ESCALATED: "Escalated to a senior team member",
  CLOSED: "Closed — no further action",
};

export function ReviewForm({
  conversationId,
  fields,
  summary,
  nextAction,
  matches,
  optedOut,
}: {
  conversationId: string;
  fields: EditableField[];
  summary: string;
  nextAction: string;
  matches: { id: string; name: string; decision: string }[];
  optedOut: boolean;
}) {
  const [outcome, setOutcome] = useState(optedOut ? "CLOSED" : "ACCEPTED");
  const [text, setText] = useState(summary);
  const [next, setNext] = useState(nextAction);
  const [followUpAt, setFollowUpAt] = useState("");
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])));
  const [decisions, setDecisions] = useState<Record<string, string>>(Object.fromEntries(matches.map((m) => [m.id, m.decision])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const changedFields = fields.filter((f) => (values[f.name] ?? "") !== (f.value ?? ""));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await submitReviewAction(conversationId, {
        outcome: changedFields.length && outcome === "ACCEPTED" ? "CORRECTED" : outcome,
        correctedSummary: text.trim() !== summary.trim() ? text : "",
        nextAction: next,
        followUpAt: outcome === "FOLLOW_UP_SCHEDULED" ? followUpAt : "",
        fieldCorrections: Object.fromEntries(changedFields.map((f) => [f.name, values[f.name] ?? ""])),
        matchDecisions: decisions,
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      <Field label="Summary for the sales team" htmlFor="summary" hint="Edits are saved alongside the original and logged.">
        <textarea id="summary" rows={5} className={`${inputClass} h-auto py-2 leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>

      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-medium">
          Correct extracted fields {changedFields.length > 0 && <span className="text-ink-3">· {changedFields.length} changed</span>}
        </summary>
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`}>
              <input
                id={`f-${f.name}`}
                className={`${inputClass} h-9 text-[13px]`}
                placeholder="Unknown"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </details>

      {matches.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Product suggestions</p>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="truncate">{m.name}</span>
                <select
                  aria-label={`Decision for ${m.name}`}
                  value={decisions[m.id]}
                  onChange={(e) => setDecisions((p) => ({ ...p, [m.id]: e.target.value }))}
                  className="focus-ring h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]"
                >
                  <option value="PENDING">Not reviewed</option>
                  <option value="ACCEPTED">Relevant</option>
                  <option value="REJECTED">Not relevant</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Review outcome" htmlFor="outcome">
          <select id="outcome" className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {Object.entries(OUTCOMES)
              .filter(([k]) => !(optedOut && k === "FOLLOW_UP_SCHEDULED"))
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </select>
        </Field>
        {outcome === "FOLLOW_UP_SCHEDULED" && (
          <Field label="Follow-up on" htmlFor="fu">
            <input id="fu" type="datetime-local" className={inputClass} value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} required />
          </Field>
        )}
      </div>
      <Field label="Next action" htmlFor="next">
        <input id="next" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>

      {optedOut && <Notice tone="danger">This customer opted out. Follow-ups are disabled and the opt-out cannot be changed here.</Notice>}
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Save review
      </Button>
    </form>
  );
}
