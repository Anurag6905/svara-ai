import { z } from "zod";
import { can } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";

/**
 * Text-to-speech proxy for ElevenLabs. The API key stays on the server.
 * Returns 204 when ElevenLabs isn't configured so the browser uses its own voice.
 */
const bodySchema = z.object({ text: z.string().min(1).max(700) });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorised", { status: 401 });
  if (!can(session.ctx.role, "simulator.run")) return new Response("Forbidden", { status: 403 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response(null, { status: 204 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const model = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: parsed.data.text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      console.warn(`[tts] ElevenLabs HTTP ${res.status}: ${detail.slice(0, 200)}`);
      // 204 tells the browser to fall back to its built-in voice (e.g. free credits used up).
      return new Response(null, { status: 204, headers: { "x-tts-fallback": `elevenlabs-${res.status}` } });
    }
    return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (err) {
    console.warn("[tts] ElevenLabs unavailable:", (err as Error).message);
    return new Response(null, { status: 204, headers: { "x-tts-fallback": "error" } });
  }
}
