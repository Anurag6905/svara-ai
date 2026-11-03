import clsx from "clsx";
import { AlertTriangle, ArrowLeft, Ban, Bot, CheckCircle2, CircleHelp, Lock, PhoneForwarded, User, VolumeX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Confidence, SimulationTag, SourceBadge } from "@/components/domain";
import { Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { effectiveValue, getConversationDetail, REVIEW_OUTCOMES, type ReviewOutcome } from "@/lib/conversations";
import { FIELD_LABELS, PROFILE_FIELDS } from "@/lib/extraction/schema";
import { MATCH_LABEL } from "@/lib/matching";
import { maskPhone } from "@/lib/leads";
import { NotFoundError } from "@/lib/tenant";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Conversation" };

const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { ctx } = await requirePermission("leads.view");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  let d;
  try {
    d = await getConversationDetail(getDb(), ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { conversation: c, lead, segments, profile, corrections, matches, summary, latestReview } = d;
  const optedOut = lead.status === "OPTED_OUT";
  const canReview = can(ctx.role, "reviews.write");
  const evidenceSeqs = new Set<number>();
  if (profile) for (const f of PROFILE_FIELDS) if (profile.fields[f].evidenceSeq !== null) evidenceSeqs.add(profile.fields[f].evidenceSeq!);
  const durationSec = c.endedAt ? Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 1000) : 0;
  const productMatches = matches.filter((m) => m.productId);
  const noMatch = matches.find((m) => !m.productId);

  return (
    <>
      <Link href="/conversations" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Review queue
      </Link>
      <PageHeader
        eyebrow={`${lead.externalLeadId} · ${maskPhone(lead.phoneNumber)}`}
        title={`${lead.firstName ?? "Customer"} — ${d.outcomeLabel}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SimulationTag />
            <Badge>{dt.format(c.startedAt)}</Badge>
            <Badge>{clock(durationSec * 1000)} min</Badge>
            <Badge>{c.language}</Badge>
            <Badge tone={c.status === "REVIEWED" ? "ok" : "warn"} dot>{c.status === "REVIEWED" ? "Reviewed" : "Awaiting review"}</Badge>
          </span>
        }
        actions={
          <Link href={`/leads/${lead.id}`} className="text-[13px] font-medium underline-offset-4 hover:underline">
            Open lead
          </Link>
        }
      />

      {isNew && <div className="mb-6"><Notice tone="ok" icon={CheckCircle2} title="Conversation analysed">Transcript, need profile, product suggestions and summary were generated. Review them below before anything goes to the sales team.</Notice></div>}
      {optedOut && <div className="mb-6"><Notice tone="danger" icon={Ban} title="Customer opted out">The call stopped immediately and the lead is permanently suppressed from every calling workflow.</Notice></div>}
      {profile?.flags.humanRequested && <div className="mb-6"><Notice tone="warn" icon={PhoneForwarded} title="Customer asked for a person">Prioritise a human callback.</Notice></div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Transcript */}
        <Card className="xl:sticky xl:top-6">
          <CardHeader title="Transcript" description="Highlighted turns are cited as evidence. Click a field's evidence link to jump here." />
          <ol className="max-h-[70vh] space-y-1 overflow-y-auto p-3">
            {segments.map((s) => (
              <li
                key={s.id}
                id={`seg-${s.seq}`}
                className={clsx(
                  "scroll-mt-24 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed transition-colors target:bg-warn-soft target:ring-1 target:ring-warn/40",
                  evidenceSeqs.has(s.seq) && "bg-surface-2",
                )}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                  {s.speaker === "AI" ? <Bot className="size-3.5" /> : s.speaker === "CUSTOMER" ? <User className="size-3.5" /> : <VolumeX className="size-3.5" />}
                  <span className="font-medium uppercase tracking-wide">{s.speaker === "AI" ? "Assistant" : s.speaker === "CUSTOMER" ? "Customer" : "System"}</span>
                  <span className="tabular font-mono">{clock(s.timestampMs)}</span>
                  <span className="font-mono text-ink-4">#{s.seq}</span>
                  {evidenceSeqs.has(s.seq) && <Badge className="ml-auto">Evidence</Badge>}
                </div>
                <p className={s.speaker === "CUSTOMER" ? "font-medium text-ink" : s.speaker === "SYSTEM" ? "italic text-ink-3" : "text-ink-2"}>{s.text}</p>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          {/* Need profile */}
          <Card>
            <CardHeader
              title="Credit-need profile"
              description={`Extracted by ${d.profileMeta?.extractionVersion ?? "—"}. Customer-stated facts, AI inferences and unknowns are labelled separately.`}
            />
            {profile ? (
              <>
                <ul className="divide-y divide-line">
                  {PROFILE_FIELDS.map((name) => {
                    const f = profile.fields[name];
                    const corrected = corrections[name];
                    const value = effectiveValue(profile, corrections, name);
                    return (
                      <li key={name} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start">
                        <p className="text-xs font-medium text-ink-3">{FIELD_LABELS[name]}</p>
                        <div className="min-w-0">
                          {value ? (
                            <p className="text-[13px] font-medium text-ink">{value}</p>
                          ) : (
                            <p className="text-[13px] italic text-ink-4">Unknown — not stated</p>
                          )}
                          {corrected && (
                            <p className="mt-0.5 text-[11px] text-sim">Corrected by a reviewer (was: {f.value ?? "Unknown"})</p>
                          )}
                          {f.evidenceSeq !== null && (
                            <a href={`#seg-${f.evidenceSeq}`} className="mt-1 block truncate text-xs text-ink-3 hover:text-ink">
                              <span className="font-mono">#{f.evidenceSeq}</span> “{f.evidenceText}”
                            </a>
                          )}
                          {f.note && <p className="mt-0.5 text-[11px] text-ink-4">{f.note}</p>}
                        </div>
                        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                          <SourceBadge source={f.sourceType} />
                          <Confidence value={f.confidence} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
                  <div className="bg-surface px-5 py-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><CircleHelp className="size-3.5" /> Customer questions</p>
                    {profile.questions.length ? (
                      <ul className="mt-2 space-y-1 text-[13px]">
                        {profile.questions.map((q) => (
                          <li key={q.topic}><a href={`#seg-${q.evidenceSeq}`} className="hover:underline">{q.topic}</a> <span className="font-mono text-[11px] text-ink-4">#{q.evidenceSeq}</span></li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-[13px] text-ink-4">None asked</p>}
                  </div>
                  <div className="bg-surface px-5 py-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><AlertTriangle className="size-3.5" /> Missing information</p>
                    {profile.missing.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">{profile.missing.map((m) => <Badge key={m} tone="warn">{m}</Badge>)}</ul>
                    ) : <p className="mt-2 text-[13px] text-ok">Purpose, amount and timeline all stated</p>}
                  </div>
                </div>
              </>
            ) : (
              <p className="p-5 text-sm text-ink-3">No profile was generated.</p>
            )}
          </Card>

          {/* Matches */}
          <Card>
            <CardHeader title="Possible product matches" description="Deterministic rules against the lender's approved catalogue." />
            <div className="border-b border-line bg-ink px-5 py-2.5 text-xs font-medium text-white">{MATCH_LABEL}</div>
            {noMatch ? (
              <div className="p-5"><Notice tone="warn" icon={AlertTriangle}>{noMatch.message}</Notice></div>
            ) : (
              <ul className="divide-y divide-line">
                {productMatches.map((m, i) => (
                  <li key={m.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        <span className="mr-2 font-mono text-xs text-ink-4">{i + 1}</span>
                        {m.productName}
                      </p>
                      <span className="flex gap-1.5">
                        <Badge tone={m.status === "POSSIBLE_MATCH" ? "ok" : "warn"}>{m.status === "POSSIBLE_MATCH" ? "Possible match" : "Partial — gaps to confirm"}</Badge>
                        {m.humanReviewStatus !== "PENDING" && <Badge tone={m.humanReviewStatus === "ACCEPTED" ? "accent" : "danger"}>{m.humanReviewStatus === "ACCEPTED" ? "Reviewer: relevant" : "Reviewer: not relevant"}</Badge>}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
                      {m.reasons.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" />{r}</li>)}
                      {m.conflicts.map((r) => <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />{r}</li>)}
                      {m.missing.map((r) => <li key={r} className="flex gap-2"><CircleHelp className="mt-0.5 size-3.5 shrink-0 text-warn" />{r}</li>)}
                    </ul>
                    {m.productDisclaimer && <p className="mt-2 text-[11px] leading-relaxed text-ink-4">{m.productDisclaimer}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Review */}
          <Card>
            <CardHeader
              title="Human review"
              description={latestReview ? `Last reviewed by ${latestReview.reviewer} · ${dt.format(latestReview.review.reviewedAt)} · ${REVIEW_OUTCOMES[latestReview.review.outcome as ReviewOutcome] ?? latestReview.review.outcome}` : "Nothing reaches the sales team until a person reviews it."}
            />
            {canReview && profile ? (
              <ReviewForm
                key={latestReview?.review.id ?? "new"}
                conversationId={c.id}
                summary={latestReview?.review.correctedSummary ?? summary?.text ?? ""}
                nextAction={latestReview?.review.nextAction ?? summary?.nextAction ?? ""}
                fields={PROFILE_FIELDS.filter((f) => f !== "interest").map((f) => ({ name: f, label: FIELD_LABELS[f], value: effectiveValue(profile, corrections, f) }))}
                matches={productMatches.map((m) => ({ id: m.id, name: m.productName ?? "", decision: m.humanReviewStatus }))}
                optedOut={optedOut}
              />
            ) : (
              <div className="space-y-3 p-5 text-[13px]">
                <p className="leading-relaxed text-ink-2">{latestReview?.review.correctedSummary ?? summary?.text}</p>
                <p className="text-ink-3"><span className="font-medium text-ink">Next action:</span> {latestReview?.review.nextAction ?? summary?.nextAction}</p>
                <Notice tone="neutral" icon={Lock}>{ROLE_LABELS[ctx.role]}s can read reviews but not change them.</Notice>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
