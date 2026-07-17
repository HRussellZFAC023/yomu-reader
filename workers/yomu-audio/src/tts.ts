/**
 * Pitch-aware Japanese TTS for the yomu-audio worker.
 *
 * Follows the yomitan-ultimate-audio architecture (Cloudflare Worker + D1
 * pitch DB + AWS Polly neural ja-JP with `x-amazon-pron-kana` phonemes) and
 * extends it with (a) a per-character voice registry so Academy dialogue and
 * listening activities get distinct, natural voices, and (b) a Workers AI
 * MeloTTS fallback engine so audio works before AWS credentials exist.
 *
 * Word audio     GET  /audio/tts?term=&reading=&voice=
 *   Pitch comes from the D1 `pitch_accents` table (Kanjium-derived; see
 *   scripts/build-pitch-accents-sql.mjs). With pitch we speak an SSML
 *   phoneme in the x-amazon-pron-kana alphabet (apostrophe = downstep), so
 *   the synthesis carries the correct accent. Without pitch we fall back to
 *   a ruby phoneme (reading-guided) and finally plain text.
 *
 * Line audio     GET  /voice/line?text=&speaker=   (admin-token gated)
 *   Sentence/dialogue synthesis for story voicing. The speaker maps to a
 *   voice + prosody through VOICE_REGISTRY. Generated audio is cached in R2
 *   (voice/<speaker>/<sha256>.mp3) so synthesis is billed once per line.
 *
 * Engines: Polly when AWS_POLLY_ENABLED + credentials (pitch-aware,
 * multi-voice); otherwise Workers AI `@cf/myshell-ai/melotts` (natural ja,
 * one voice, no accent control). Cache keys embed the engine so MeloTTS
 * output never shadows later Polly output.
 */

import { AwsClient } from "aws4fetch";

export interface TtsEnv {
  AWS_POLLY_ENABLED?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_POLLY_REGION?: string;
  VOICE_ADMIN_TOKEN?: string;
  AI?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
  AUDIO_BUCKET?: {
    get(key: string): Promise<{ body: ReadableStream | null; arrayBuffer(): Promise<ArrayBuffer> } | null>;
    put(key: string, value: ArrayBuffer | ReadableStream, options?: unknown): Promise<unknown>;
  };
  AUDIO_DB?: {
    prepare(query: string): {
      bind(...params: unknown[]): { all(): Promise<{ success: boolean; results?: unknown[] }> };
    };
  };
}

/** Amazon Polly neural ja-JP voices. Neural is required for natural output. */
export type PollyJaVoice = "Tomoko" | "Kazuha" | "Takumi";

export interface CharacterVoice {
  readonly voice: PollyJaVoice;
  /** SSML prosody attributes widening the 3-voice palette per character. */
  readonly prosody?: { readonly rate?: string; readonly pitch?: string };
}

/**
 * Academy cast → voice. Three neural ja-JP voices exist on Polly today, so
 * distinctness beyond three speakers comes from measured prosody offsets
 * (keep offsets subtle or the result stops sounding natural). Any speaker
 * not listed gets the narrator default.
 */
export const VOICE_REGISTRY: Readonly<Record<string, CharacterVoice>> = {
  narrator: { voice: "Tomoko" },
  rie: { voice: "Tomoko" },
  sophie: { voice: "Kazuha" },
  jenny: { voice: "Kazuha", prosody: { pitch: "+6%" } },
  mika: { voice: "Kazuha", prosody: { rate: "94%" } },
  jodi: { voice: "Tomoko", prosody: { pitch: "-4%", rate: "96%" } },
  henry: { voice: "Takumi" },
  aakash: { voice: "Takumi", prosody: { pitch: "-5%" } },
  alex: { voice: "Takumi", prosody: { rate: "94%" } },
  tom: { voice: "Takumi", prosody: { pitch: "+5%", rate: "104%" } },
  sam: { voice: "Takumi", prosody: { pitch: "+8%" } },
  shin: { voice: "Takumi", prosody: { rate: "92%", pitch: "-3%" } },
  christian: { voice: "Takumi", prosody: { pitch: "-8%", rate: "97%" } },
  felix: { voice: "Takumi", prosody: { pitch: "+3%" } },
};

const DEFAULT_REGION = "eu-central-1";
const WORD_TTS_PREFIX = "tts";
const LINE_TTS_PREFIX = "voice";

function pollyEnabled(env: TtsEnv): boolean {
  return (
    (env.AWS_POLLY_ENABLED ?? "").trim().toLowerCase() === "true"
    && Boolean(env.AWS_ACCESS_KEY_ID?.trim())
    && Boolean(env.AWS_SECRET_ACCESS_KEY?.trim())
  );
}

export type TtsEngine = "polly" | "melotts";

export function ttsEngine(env: TtsEnv): TtsEngine | null {
  if (pollyEnabled(env)) return "polly";
  if (env.AI) return "melotts";
  return null;
}

export function ttsEnabled(env: TtsEnv): boolean {
  return ttsEngine(env) !== null;
}

interface PitchRow {
  expression: string;
  reading: string;
  pitch: string;
  count: number;
}

/** Most-attested pitch for (term, reading) from the Kanjium-derived D1 table. */
export async function lookupPitch(env: TtsEnv, term: string, reading: string): Promise<string> {
  if (!env.AUDIO_DB) return "";
  try {
    const condition = reading ? "WHERE expression = ?1 AND reading = ?2" : "WHERE expression = ?1";
    const params = reading ? [term, reading] : [term];
    const result = await env.AUDIO_DB
      .prepare(`SELECT expression, reading, pitch, count FROM pitch_accents ${condition} ORDER BY count DESC LIMIT 1`)
      .bind(...params)
      .all();
    if (!result.success || !result.results?.length) return "";
    return String((result.results[0] as PitchRow).pitch ?? "");
  } catch {
    // Missing table (fresh D1) must not break TTS — fall back to ruby/plain.
    return "";
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function wordSsml(term: string, reading: string, pitch: string): { text: string; type: "ssml" | "text" } {
  if (pitch) {
    return {
      type: "ssml",
      text: `<speak><phoneme alphabet="x-amazon-pron-kana" ph="${escapeXml(pitch)}">${escapeXml(term)}</phoneme></speak>`,
    };
  }
  if (reading && reading !== term) {
    return {
      type: "ssml",
      text: `<speak><phoneme type="ruby" ph="${escapeXml(reading)}">${escapeXml(term)}</phoneme></speak>`,
    };
  }
  return { type: "text", text: term };
}

export function lineSsml(text: string, character: CharacterVoice): { text: string; type: "ssml" | "text" } {
  if (!character.prosody) return { type: "text", text };
  const attrs = [
    character.prosody.rate ? `rate="${escapeXml(character.prosody.rate)}"` : "",
    character.prosody.pitch ? `pitch="${escapeXml(character.prosody.pitch)}"` : "",
  ].filter(Boolean).join(" ");
  return { type: "ssml", text: `<speak><prosody ${attrs}>${escapeXml(text)}</prosody></speak>` };
}

async function synthesizePolly(
  env: TtsEnv,
  voice: PollyJaVoice,
  payload: { text: string; type: "ssml" | "text" },
): Promise<ArrayBuffer> {
  const region = env.AWS_POLLY_REGION?.trim() || DEFAULT_REGION;
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    region,
  });
  const response = await aws.fetch(`https://polly.${region}.amazonaws.com/v1/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      Engine: "neural",
      LanguageCode: "ja-JP",
      OutputFormat: "mp3",
      SampleRate: "24000",
      Text: payload.text,
      TextType: payload.type,
      VoiceId: voice,
    }),
  });
  if (!response.ok) {
    throw new Error(`polly_failed_${response.status}:${(await response.text()).slice(0, 200)}`);
  }
  return response.arrayBuffer();
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function synthesizeMelo(env: TtsEnv, text: string): Promise<ArrayBuffer> {
  const result = await env.AI!.run("@cf/myshell-ai/melotts", { prompt: text, lang: "ja" });
  if (result instanceof ArrayBuffer) return result;
  if (result && typeof result === "object" && "audio" in result && typeof (result as { audio: unknown }).audio === "string") {
    return base64ToArrayBuffer((result as { audio: string }).audio);
  }
  if (result instanceof ReadableStream) return new Response(result).arrayBuffer();
  throw new Error("melotts_unexpected_response");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cachedSynthesis(
  env: TtsEnv,
  key: string,
  make: () => Promise<ArrayBuffer>,
): Promise<{ audio: ArrayBuffer; cached: boolean }> {
  const existing = await env.AUDIO_BUCKET?.get(key);
  if (existing) return { audio: await existing.arrayBuffer(), cached: true };
  const audio = await make();
  await env.AUDIO_BUCKET?.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  return { audio, cached: false };
}

function audioResponse(audio: ArrayBuffer, cached: boolean, extra: Record<string, string> = {}): Response {
  return new Response(audio, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
      "x-yomu-tts-cache": cached ? "hit" : "miss",
      ...extra,
    },
  });
}

function errorJson(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

/** GET /audio/tts?term=&reading=&voice= — pitch-aware word audio. */
export async function handleWordTts(url: URL, env: TtsEnv): Promise<Response> {
  const engine = ttsEngine(env);
  if (!engine) return errorJson(503, "tts_disabled");
  const term = url.searchParams.get("term")?.trim() ?? "";
  const reading = url.searchParams.get("reading")?.trim() ?? "";
  if (!term) return errorJson(400, "term_required");
  const requestedVoice = url.searchParams.get("voice")?.trim() || "Tomoko";
  if (!["Tomoko", "Kazuha", "Takumi"].includes(requestedVoice)) return errorJson(400, "unknown_voice");
  const voice = requestedVoice as PollyJaVoice;

  const pitch = engine === "polly" ? await lookupPitch(env, term, reading) : "";
  const payload = wordSsml(term, reading, pitch);
  const key = engine === "polly"
    ? `${WORD_TTS_PREFIX}/${voice}/${await sha256Hex(`${term} ${reading} ${pitch}`)}.mp3`
    : `${WORD_TTS_PREFIX}/melotts/${await sha256Hex(reading || term)}.mp3`;
  const { audio, cached } = await cachedSynthesis(env, key, () =>
    engine === "polly" ? synthesizePolly(env, voice, payload) : synthesizeMelo(env, reading || term));
  return audioResponse(audio, cached, {
    "x-yomu-tts-engine": engine,
    "x-yomu-tts-pitch": pitch ? "accented" : reading && reading !== term ? "ruby" : "plain",
  });
}

/** GET /voice/line?text=&speaker= — character-voiced dialogue (admin gated). */
export async function handleLineTts(request: Request, url: URL, env: TtsEnv): Promise<Response> {
  const engine = ttsEngine(env);
  if (!engine) return errorJson(503, "tts_disabled");
  const expected = env.VOICE_ADMIN_TOKEN?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!expected || header !== `Bearer ${expected}`) return errorJson(401, "voice_admin_required");

  const text = url.searchParams.get("text")?.trim() ?? "";
  if (!text || text.length > 500) return errorJson(400, "text_required_max_500");
  const speaker = (url.searchParams.get("speaker")?.trim() || "narrator").toLowerCase();
  const character = VOICE_REGISTRY[speaker] ?? VOICE_REGISTRY.narrator;

  const payload = lineSsml(text, character);
  const key = engine === "polly"
    ? `${LINE_TTS_PREFIX}/${speaker}/${await sha256Hex(`${character.voice} ${payload.text}`)}.mp3`
    : `${LINE_TTS_PREFIX}/melotts/${await sha256Hex(text)}.mp3`;
  const { audio, cached } = await cachedSynthesis(env, key, () =>
    engine === "polly" ? synthesizePolly(env, character.voice, payload) : synthesizeMelo(env, text));
  return audioResponse(audio, cached, {
    "x-yomu-tts-engine": engine,
    "x-yomu-tts-speaker": speaker,
    "x-yomu-tts-voice": engine === "polly" ? character.voice : "melotts-ja",
  });
}
