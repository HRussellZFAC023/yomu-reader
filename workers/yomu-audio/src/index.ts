const READ_METHODS = new Set(["GET", "HEAD"]);
const DEFAULT_EMPTY_AUDIO_RESPONSE = { type: "audioSourceList", audioSources: [] };

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  AUDIO_UPSTREAM_URL?: string;
  AUDIO_DISABLED?: string;
  AUDIO_ANALYTICS_LOGS?: string;
}

interface AudioStatus {
  service: "yomu-audio";
  status: "ok" | "disabled" | "unconfigured";
  upstreamConfigured: boolean;
  cors: true;
  cache: {
    queryTtlSeconds: number;
  };
}

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

  if (truthyEnv(env.AUDIO_DISABLED)) {
    return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200, { "x-yomu-audio-error": "disabled" });
  }

  const term = url.searchParams.get("term")?.trim() ?? "";
  const reading = url.searchParams.get("reading")?.trim() ?? "";
  if (!term && !reading) return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200);

  const upstream = upstreamAudioUrl(env, term, reading);
  if (!upstream) return jsonResponse(request, DEFAULT_EMPTY_AUDIO_RESPONSE, 200, { "x-yomu-audio-error": "unconfigured" });

  const cached = await cacheMatch(request, upstream);
  if (cached) return withCors(request, cached);

  const response = await fetch(upstream, {
    method: "GET",
    headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    redirect: "follow",
  });
  const normalized = normalizeAudioResponse(response);
  ctx.waitUntil(cachePut(request, upstream, normalized.clone()));
  recordAudioAnalytics(ctx, env, request, response.status);
  return withCors(request, normalized);
}

function audioStatus(env: Env): AudioStatus {
  return {
    service: "yomu-audio",
    status: truthyEnv(env.AUDIO_DISABLED) ? "disabled" : env.AUDIO_UPSTREAM_URL ? "ok" : "unconfigured",
    upstreamConfigured: Boolean(env.AUDIO_UPSTREAM_URL?.trim()),
    cors: true,
    cache: { queryTtlSeconds: 3600 },
  };
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

function recordAudioAnalytics(ctx: ExecutionContext, env: Env, request: Request, status: number): void {
  if (!truthyEnv(env.AUDIO_ANALYTICS_LOGS)) return;
  ctx.waitUntil(Promise.resolve().then(() => {
    console.log(JSON.stringify({
      event: "yomu_audio_request",
      status,
      hasTerm: new URL(request.url).searchParams.has("term"),
      hasReading: new URL(request.url).searchParams.has("reading"),
    }));
  }));
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
