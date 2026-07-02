const READ_METHODS = new Set(["GET", "HEAD"]);
const DEFAULT_EMPTY_AUDIO_RESPONSE: AudioSourceListResponse = { type: "audioSourceList", audioSources: [] };
const DEFAULT_AUDIO_MANIFEST_KEY = "index/audio-index.json";
const MANIFEST_CACHE_TTL_MS = 60_000;
const JAPANESE_POD_101_AUDIO_URL = "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  AUDIO_BUCKET?: R2Bucket;
  AUDIO_MANIFEST_KEY?: string;
  AUDIO_UPSTREAM_URL?: string;
  AUDIO_DISABLED?: string;
  AUDIO_ANALYTICS_LOGS?: string;
}

interface AudioStatus {
  service: "yomu-audio";
  status: "ok" | "disabled" | "unconfigured";
  r2Configured: boolean;
  manifestKey: string;
  upstreamConfigured: boolean;
  cors: true;
  cache: {
    queryTtlSeconds: number;
  };
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
}

interface R2ObjectBody {
  body: ReadableStream | null;
  size?: number;
  etag?: string;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata?(headers: Headers): void;
  text?(): Promise<string>;
}

interface AudioManifest {
  entries?: Record<string, AudioManifestSource[]> | AudioManifestRecord[];
}

interface AudioManifestRecord {
  term?: string;
  reading?: string;
  sources?: AudioManifestSource[];
  audioSources?: AudioManifestSource[];
}

interface AudioManifestSource {
  name?: string;
  path?: string;
  key?: string;
  url?: string;
  contentType?: string;
}

interface AudioSourceListResponse {
  type: "audioSourceList";
  audioSources: Array<{ name: string; url: string }>;
}

interface CachedManifest {
  key: string;
  expiresAt: number;
  manifest: AudioManifest | null;
}

let cachedManifest: CachedManifest | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({
        event: "yomu_audio_error",
        message: error instanceof Error ? error.message : "unknown",
        path: safePath(request),
      }));
      return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200, {
        "x-yomu-audio-error": "upstream",
      });
    }
  },
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (isCorsPreflight(request)) return preflight(request);
  if (!READ_METHODS.has(request.method.trim().toUpperCase())) {
    return textResponse(request, "Method not allowed.", 405, { allow: "GET, HEAD, OPTIONS" });
  }

  const url = new URL(request.url);
  if (url.pathname === "/status" || url.pathname === "/healthz") {
    return jsonResponse(request, audioStatus(env), 200, { "cache-control": "public, max-age=60" });
  }

  if (url.pathname.startsWith("/audio/")) {
    return serveR2AudioObject(request, env, decodeURIComponent(url.pathname.slice("/audio/".length)));
  }

  if (truthyEnv(env.AUDIO_DISABLED)) {
    return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200, { "x-yomu-audio-error": "disabled" });
  }

  const term = url.searchParams.get("term")?.trim() ?? "";
  const reading = url.searchParams.get("reading")?.trim() ?? "";
  if (!term && !reading) return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200);

  const manifestAudio = await audioSourcesFromManifest(request, env, term, reading);
  if (manifestAudio) {
    const response = jsonResponse(request, manifestAudio, 200, { "cache-control": "public, max-age=3600" });
    recordAudioAnalytics(ctx, env, request, 200, "r2-manifest");
    return response;
  }

  const upstream = upstreamAudioUrl(env, term, reading);
  if (!upstream) return japanesePod101Fallback(request, env, ctx, term, reading);

  const cached = await cacheMatch(request, upstream);
  if (cached) return withCors(request, cached);

  const response = await fetch(upstream, {
    method: "GET",
    headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    redirect: "follow",
  });
  const normalized = normalizeAudioResponse(response);
  ctx.waitUntil(cachePut(request, upstream, normalized.clone()));
  recordAudioAnalytics(ctx, env, request, response.status, "upstream");
  return withCors(request, normalized);
}

function audioStatus(env: Env): AudioStatus {
  const r2Configured = Boolean(env.AUDIO_BUCKET);
  const upstreamConfigured = Boolean(env.AUDIO_UPSTREAM_URL?.trim());
  return {
    service: "yomu-audio",
    status: truthyEnv(env.AUDIO_DISABLED) ? "disabled" : r2Configured || upstreamConfigured ? "ok" : "unconfigured",
    r2Configured,
    manifestKey: manifestKey(env),
    upstreamConfigured,
    cors: true,
    cache: { queryTtlSeconds: 3600 },
  };
}

async function serveR2AudioObject(request: Request, env: Env, rawKey: string): Promise<Response> {
  if (isUnsafeAudioKey(rawKey)) return textResponse(request, "Audio object not found.", 404);
  if (!env.AUDIO_BUCKET) return textResponse(request, "Audio storage is not configured.", 404);
  const object = await env.AUDIO_BUCKET.get(rawKey);
  if (!object?.body) return textResponse(request, "Audio object not found.", 404);
  const headers = new Headers({
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  });
  object.writeHttpMetadata?.(headers);
  if (!headers.has("content-type")) headers.set("content-type", object.httpMetadata?.contentType || contentTypeForAudioKey(rawKey));
  if (object.etag) headers.set("etag", object.etag);
  if (typeof object.size === "number") headers.set("content-length", String(object.size));
  return withCors(request, new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers }));
}

async function audioSourcesFromManifest(
  request: Request,
  env: Env,
  term: string,
  reading: string,
): Promise<AudioSourceListResponse | null> {
  if (!env.AUDIO_BUCKET) return null;
  const manifest = await loadAudioManifest(env);
  const sources = lookupManifestSources(manifest, term, reading);
  if (!sources.length) return null;
  const origin = new URL(request.url).origin;
  return {
    type: "audioSourceList",
    audioSources: sources.map((source) => ({
      name: source.name?.trim() || source.path || source.key || "Yomu audio",
      url: manifestSourceUrl(origin, source),
    })),
  };
}

async function loadAudioManifest(env: Env): Promise<AudioManifest | null> {
  const key = manifestKey(env);
  const now = Date.now();
  if (cachedManifest?.key === key && cachedManifest.expiresAt > now) return cachedManifest.manifest;
  const object = await env.AUDIO_BUCKET?.get(key);
  const manifest = object ? parseAudioManifest(await r2ObjectText(object)) : null;
  cachedManifest = { key, manifest, expiresAt: now + MANIFEST_CACHE_TTL_MS };
  return manifest;
}

function lookupManifestSources(manifest: AudioManifest | null, term: string, reading: string): AudioManifestSource[] {
  if (!manifest?.entries) return [];
  if (!Array.isArray(manifest.entries)) {
    return [
      ...(manifest.entries[manifestKeyFor(term, reading)] ?? []),
      ...(manifest.entries[manifestKeyFor(term, "")] ?? []),
    ].filter(isManifestSource);
  }
  return manifest.entries
    .filter((record) => normalizedManifestText(record.term) === normalizedManifestText(term)
      && (!normalizedManifestText(record.reading) || normalizedManifestText(record.reading) === normalizedManifestText(reading)))
    .flatMap((record) => record.sources ?? record.audioSources ?? [])
    .filter(isManifestSource);
}

function manifestSourceUrl(origin: string, source: AudioManifestSource): string {
  const externalUrl = safeExternalAudioUrl(source.url);
  if (externalUrl) return externalUrl;
  const key = source.path || source.key || "";
  return `${origin}/audio/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function safeExternalAudioUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function parseAudioManifest(text: string): AudioManifest | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value as AudioManifest : null;
  } catch {
    return null;
  }
}

async function r2ObjectText(object: R2ObjectBody): Promise<string> {
  if (typeof object.text === "function") return object.text();
  return object.body ? await new Response(object.body).text() : "";
}

// The R2 manifest only covers the words that have been exported so far; without
// this fallback every other word returns an empty list and Yomu clients whose
// only enabled source is the hosted one go silent ("No playable audio found").
// JapanesePod101's public dictionary endpoint carries the same jpod recordings,
// so hand its URL to the client. The clip cannot be probed here — its
// CloudFront origin rejects Cloudflare Worker egress with 403 — but the Yomu
// client already recognises and rejects the endpoint's fixed "not available"
// placeholder clip by size and hash before playing anything.
function japanesePod101Fallback(request: Request, env: Env, ctx: ExecutionContext, term: string, reading: string): Response {
  const fallbackUrl = japanesePod101Url(term, reading);
  if (!fallbackUrl) return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200, { "x-yomu-audio-error": "unconfigured" });
  recordAudioAnalytics(ctx, env, request, 200, "jpod101-fallback");
  return jsonResponse(request, {
    type: "audioSourceList",
    audioSources: [{ name: "jpod", url: fallbackUrl }],
  }, 200, { "cache-control": "public, max-age=3600", "x-yomu-audio-source": "jpod101-fallback" });
}

function japanesePod101Url(term: string, reading: string): string | null {
  const kana = reading || term;
  if (!kana) return null;
  const url = new URL(JAPANESE_POD_101_AUDIO_URL);
  if (term && term !== kana) url.searchParams.set("kanji", term);
  url.searchParams.set("kana", kana);
  return url.href;
}

function upstreamAudioUrl(env: Env, term: string, reading: string): string | null {
  const raw = env.AUDIO_UPSTREAM_URL?.trim();
  if (!raw) return null;
  try {
    const upstream = new URL(raw);
    if (upstream.protocol !== "https:" && upstream.hostname !== "localhost" && upstream.hostname !== "127.0.0.1") return null;
    upstream.searchParams.set("term", term);
    upstream.searchParams.set("reading", reading);
    return upstream.href;
  } catch {
    return null;
  }
}

function normalizeAudioResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=3600");
  headers.delete("set-cookie");
  if (!response.ok) {
    return Response.json(DEFAULT_EMPTY_AUDIO_RESPONSE, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=60",
        "x-yomu-audio-error": `upstream-${response.status}`,
      },
    });
  }
  return new Response(response.body, {
    status: 200,
    statusText: "OK",
    headers,
  });
}

async function cacheMatch(request: Request, upstream: string): Promise<Response | undefined> {
  if (typeof caches === "undefined" || request.method !== "GET") return undefined;
  const backend = (caches as unknown as { default?: Cache }).default;
  return backend?.match(cacheKey(upstream));
}

async function cachePut(request: Request, upstream: string, response: Response): Promise<void> {
  if (typeof caches === "undefined" || request.method !== "GET" || !response.ok) return;
  const backend = (caches as unknown as { default?: Cache }).default;
  await backend?.put(cacheKey(upstream), response);
}

function cacheKey(upstream: string): Request {
  return new Request(upstream, { method: "GET" });
}

function recordAudioAnalytics(ctx: ExecutionContext, env: Env, request: Request, status: number, source: "r2-manifest" | "upstream" | "jpod101-fallback"): void {
  if (!truthyEnv(env.AUDIO_ANALYTICS_LOGS)) return;
  ctx.waitUntil(Promise.resolve().then(() => {
    console.log(JSON.stringify({
      event: "yomu_audio_request",
      status,
      source,
      hasTerm: new URL(request.url).searchParams.has("term"),
      hasReading: new URL(request.url).searchParams.has("reading"),
    }));
  }));
}

function manifestKey(env: Env): string {
  return env.AUDIO_MANIFEST_KEY?.trim() || DEFAULT_AUDIO_MANIFEST_KEY;
}

function manifestKeyFor(term: string, reading: string): string {
  return `${normalizedManifestText(term)}\t${normalizedManifestText(reading)}`;
}

function normalizedManifestText(value: string | undefined): string {
  return (value ?? "").trim().normalize("NFC");
}

function isManifestSource(value: unknown): value is AudioManifestSource {
  return Boolean(value && typeof value === "object" && (typeof (value as AudioManifestSource).url === "string"
    || typeof (value as AudioManifestSource).path === "string"
    || typeof (value as AudioManifestSource).key === "string"));
}

function isUnsafeAudioKey(key: string): boolean {
  return !key || key.startsWith("/") || key.includes("..") || /[\u0000-\u001f\\]/u.test(key);
}

function contentTypeForAudioKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".opus")) return "audio/ogg; codecs=opus";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  return "application/octet-stream";
}

export function resetAudioWorkerCacheForTests(): void {
  cachedManifest = null;
}

function isCorsPreflight(request: Request): boolean {
  return request.method === "OPTIONS" && request.headers.has("access-control-request-method");
}

function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(request: Request, body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), { status, headers });
}

function textResponse(request: Request, text: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "text/plain; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(text, { status, headers });
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", request.headers.get("origin") || "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "accept, content-type");
  headers.set("access-control-expose-headers", "*");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
}

function truthyEnv(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}
