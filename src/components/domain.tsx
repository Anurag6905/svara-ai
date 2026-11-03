import { Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import type { LeadStatus, SourceType } from "@/db/enums";
import { LEAD_STATUS_META, type GateResult } from "@/lib/leads";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const m = LEAD_STATUS_META[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function GateBadge({ gate, status }: { gate: GateResult; status?: LeadStatus }) {
  if (status === "OPTED_OUT")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
        <Ban className="size-3.5" /> Suppressed
      </span>
    );
  return gate.allowed ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
      <CheckCircle2 className="size-3.5" /> Permissioned
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn" title={gate.reasons.join("\n")}>
      <ShieldAlert className="size-3.5" /> Blocked
    </span>
  );
}

const SOURCE_META: Record<SourceType, { label: string; tone: "ok" | "sim" | "neutral" }> = {
  CUSTOMER_STATED: { label: "Customer-stated", tone: "ok" },
  AI_INFERRED: { label: "AI-inferred", tone: "sim" },
  UNKNOWN: { label: "Unknown", tone: "neutral" },
};

export function SourceBadge({ source }: { source: SourceType }) {
  const m = SOURCE_META[source];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink-4">—</span>;
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${pct}%`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-xs text-ink-3">{pct}%</span>
    </span>
  );
}

export function SimulationTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-sim px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
      Simulation
    </span>
  );
}
