import type { Outcome } from "@/lib/conversation/engine";
import { extractMock, MOCK_EXTRACTION_VERSION, type SegmentLike } from "./mock";
import { needProfileSchema, type NeedProfile } from "./schema";

/**
 * Provider-agnostic extraction interface (PRD §10). The deterministic mock is
 * the default and the safety net: any LLM output that fails schema validation,
 * or cites evidence that doesn't exist, is discarded in favour of the mock.
 */
export interface ExtractionProvider {
  name: string;
  extract(segments: SegmentLike[], outcome: Outcome | null): Promise<{ profile: NeedProfile; version: string }>;
}

export const mockProvider: ExtractionProvider = {
  name: "mock",
  async extract(segments, outcome) {
    return { profile: needProfileSchema.parse(extractMock(segments, outcome)), version: MOCK_EXTRACTION_VERSION };
  },
};

const SYSTEM_PROMPT = `You extract a structured credit-need profile from a loan sales call transcript.
Rules: use ONLY what the CUSTOMER said. Never guess. If a field was not stated, set sourceType "UNKNOWN", value null, confidence null, evidenceSeq null, evidenceText null.
Use "AI_INFERRED" only for loanCategory and preferredLanguage when not explicitly stated, and explain in "note".
evidenceSeq must be the seq of a CUSTOMER segment that supports the value; evidenceText must quote that segment.
Never infer creditworthiness, income, religion, caste, health or any sensitive trait.
Return JSON only, matching the provided example shape exactly.`;

/** Optional Anthropic-backed provider. Enabled with LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY. */
export const anthropicProvider: ExtractionProvider = {
  name: "anthropic",
  async extract(segments, outcome) {
    const fallback = await mockProvider.extract(segments, outcome);
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return fallback;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Transcript (JSON):\n${JSON.stringify(segments)}\nCall outcome: ${outcome}\nExample of the exact output shape (values illustrative):\n${JSON.stringify(fallback.profile)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return fallback;
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === "text")?.text ?? "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const parsed = needProfileSchema.safeParse(json);
      if (!parsed.success) return fallback;
      // Every cited segment must exist and be a customer turn.
      const customerSeqs = new Set(segments.filter((s) => s.speaker === "CUSTOMER").map((s) => s.seq));
      const cites = Object.values(parsed.data.fields).map((f) => f.evidenceSeq).filter((x): x is number => x !== null);
      if (!cites.every((s) => customerSeqs.has(s))) return fallback;
      // Safety flags always come from the deterministic outcome, never the model.
      return { profile: { ...parsed.data, flags: fallback.profile.flags }, version: `anthropic:${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"}` };
    } catch {
      return fallback;
    }
  },
};

export function getExtractionProvider(): ExtractionProvider {
  return process.env.LLM_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY ? anthropicProvider : mockProvider;
}
