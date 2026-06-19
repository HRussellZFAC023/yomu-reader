const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
const FALLBACK_CORS_HEADERS =
  "accept, authorization, content-type, range, x-access, x-forcecaf";
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const PROXY_CONTROL_REQUEST_HEADERS = new Set([
  "access-control-request-headers",
  "access-control-request-method",
]);
const BROWSER_FETCH_METADATA_RE = /^(?:cf-|sec-fetch-)/i;
const RETRYABLE_UPSTREAM_STATUSES = new Set([
  500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527,
]);
const JISHO_SEARCH_RETRY_COUNT = 3;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (isCorsPreflight(request)) return preflight(request);
    const target = targetUrl(request);
    if (!target) return corsText(request, "Missing url parameter.", 400);
    if (!isAllowedPublicProxyTarget(request.method, target, env))
      return corsText(request, "Target is not proxyable.", 400);

    // Edge-cache deterministic, user-agnostic public GETs (e.g. Jiten
    // /vocabulary/<id>/<ri>/info, which the origin marks cacheable for an hour).
    // The same word looked up by many Yomu clients then resolves from
    // Cloudflare's edge instead of hitting the upstream every time — the single
    // biggest lever for not overloading a server with repeated lookups.
    const edgeCache = edgeCacheStore(request, target);
    if (edgeCache) {
      const hit = await edgeCache.match();
      if (hit) return withCors(request, hit, target);
    }

    // Coalesce concurrent identical cacheable GETs: a burst of clients looking
    // up the same word collapses to ONE upstream request instead of N. This
    // protects the origin even where the edge cache is unavailable (e.g. a
    // workers.dev subdomain, where the Cache API is best-effort). Each caller
    // receives an independent clone of the shared response.
    const response = edgeCache
      ? await coalesceOriginRequest(target.href, () => fetchProxyTarget(request, target))
      : await fetchProxyTarget(request, target);

    if (edgeCache && isCacheableUpstreamResponse(response)) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set("cache-control", edgeCache.cacheControl);
      stored.headers.delete("set-cookie");
      stored.headers.delete("vary");
      ctx.waitUntil(edgeCache.put(stored));
    }
    return withCors(request, response, target);
  },
};

// In-flight de-duplication of identical upstream GETs. Keyed by target URL; the
// entry is cleared once the shared fetch settles, so it only collapses requests
// that overlap in time. Per-isolate (best-effort) but needs no external state,
// so it works everywhere the Worker runs.
const inflightOriginRequests = new Map<string, Promise<Response>>();

async function coalesceOriginRequest(
  key: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const existing = inflightOriginRequests.get(key);
  if (existing) return (await existing).clone();
  const promise = run();
  inflightOriginRequests.set(key, promise);
  try {
    return (await promise).clone();
  } finally {
    inflightOriginRequests.delete(key);
  }
}

const EDGE_CACHE_TTL_SECONDS = 3600;
const SHORT_EDGE_CACHE_TTL_SECONDS = 600;

interface EdgeCache {
  match(): Promise<Response | undefined>;
  put(response: Response): Promise<void>;
  cacheControl: string;
}

type EdgeCacheBackend = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

// Only deterministic, user-AGNOSTIC public GETs are cached. Anything carrying an
// Authorization header (a user's API key) is never cached, so per-user state
// (known-word state, SRS data) can never leak across clients.
function edgeCacheStore(request: Request, target: URL): EdgeCache | null {
  if (typeof caches === "undefined" || request.method !== "GET") return null;
  if (request.headers.has("authorization")) return null;
  const ttl = edgeCacheTtlSeconds(target);
  if (ttl <= 0) return null;
  const backend = (caches as unknown as { default?: EdgeCacheBackend }).default;
  if (!backend) return null;
  const key = new Request(target.href, { method: "GET" });
  return {
    match: () => backend.match(key),
    put: (response: Response) => backend.put(key, response),
    cacheControl: `public, max-age=${ttl}`,
  };
}

function edgeCacheTtlSeconds(target: URL): number {
  const path = target.pathname;
  if (target.hostname === "api.jiten.moe") {
    if (/^\/api\/vocabulary\/\d+\/\d+\/info$/.test(path)) return EDGE_CACHE_TTL_SECONDS;
    if (path.startsWith("/api/kanji/")) return EDGE_CACHE_TTL_SECONDS;
    if (
      path === "/api/vocabulary/parse" ||
      path === "/api/vocabulary/parse-normalised" ||
      path === "/api/vocabulary/search"
    )
      return SHORT_EDGE_CACHE_TTL_SECONDS;
    return 0;
  }
  if (target.hostname === "jpdb.io") {
    if (path === "/search" || path.startsWith("/vocabulary/"))
      return SHORT_EDGE_CACHE_TTL_SECONDS;
    return 0;
  }
  return 0;
}

function isCacheableUpstreamResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  const cacheControl = response.headers.get("cache-control") ?? "";
  return !/\b(?:no-store|private)\b/i.test(cacheControl);
}

interface Env {}

function targetUrl(request: Request): URL | null {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("url");
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

export function isAllowedPublicProxyTarget(
  method: string,
  target: URL,
  _env: Env = {},
): boolean {
  return (
    Boolean(method.trim()) &&
    (target.protocol === "https:" || target.protocol === "http:")
  );
}

async function fetchProxyTarget(
  request: Request,
  target: URL,
): Promise<Response> {
  let lastError: unknown;
  for (const init of upstreamAttempts(request, target)) {
    try {
      const response = await fetch(new Request(target.href, init));
      if (!isRetryableUpstreamResponse(response)) return response;
      lastError = new Error(`Upstream request failed with ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
  }
  return proxyFailureResponse(lastError);
}

function upstreamAttempts(request: Request, target: URL): RequestInit[] {
  if (isJishoSearchTarget(target) && isIdempotentRequest(request)) {
    return Array.from({ length: JISHO_SEARCH_RETRY_COUNT }, () =>
      upstreamInit(request, target, { minimalHeaders: true }),
    );
  }

  const attempts = [upstreamInit(request, target)];
  if (isIdempotentRequest(request)) {
    attempts.push(upstreamInit(request, target, { minimalHeaders: true }));
  }
  return attempts;
}

function upstreamInit(
  request: Request,
  target: URL,
  options: { minimalHeaders?: boolean } = {},
): RequestInit {
  const headers = options.minimalHeaders
    ? minimalUpstreamHeaders(request, target)
    : upstreamHeaders(request, target);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "follow",
  };
  if (init.body) init.duplex = "half";
  return init;
}

function minimalUpstreamHeaders(request: Request, target: URL): Headers {
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  if (isJpdbAudioTarget(target)) {
    headers.set(
      "x-access",
      request.headers.get("x-access") || JPDB_AUDIO_ACCESS_HEADER,
    );
    const forceCaf = jpdbAudioForceCaf(request, target);
    if (forceCaf) headers.set("x-forcecaf", forceCaf);
  }
  return headers;
}

function upstreamHeaders(request: Request, target: URL): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (shouldForwardRequestHeader(key)) headers.set(key, value);
  });
  if (isJpdbAudioTarget(target)) {
    headers.set(
      "x-access",
      request.headers.get("x-access") || JPDB_AUDIO_ACCESS_HEADER,
    );
    const forceCaf = jpdbAudioForceCaf(request, target);
    if (forceCaf) headers.set("x-forcecaf", forceCaf);
  }
  return headers;
}

function shouldForwardRequestHeader(name: string): boolean {
  const key = name.toLowerCase();
  return (
    !HOP_BY_HOP_REQUEST_HEADERS.has(key) &&
    !PROXY_CONTROL_REQUEST_HEADERS.has(key) &&
    !BROWSER_FETCH_METADATA_RE.test(key)
  );
}

function isIdempotentRequest(request: Request): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

function isRetryableUpstreamResponse(response: Response): boolean {
  return RETRYABLE_UPSTREAM_STATUSES.has(response.status);
}

function proxyFailureResponse(error: unknown): Response {
  const detail =
    error instanceof Error && error.message
      ? error.message
      : "Unknown upstream error.";
  return new Response(`Upstream request failed. ${detail}`, {
    status: 502,
    statusText: "Bad Gateway",
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-yomu-proxy-error": "upstream",
    },
  });
}

function isJishoSearchTarget(target: URL): boolean {
  return (
    target.hostname === "jisho.org" && target.pathname.startsWith("/search/")
  );
}

function isJpdbAudioTarget(target: URL): boolean {
  return (
    target.hostname === "jpdb.io" && target.pathname.startsWith("/static/v/")
  );
}

function jpdbAudioForceCaf(request: Request, target: URL): string {
  if (!isJpdbAudioTarget(target)) return "";
  const header = request.headers.get("x-forcecaf") ?? "";
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get("x-forcecaf") ?? "";
  } catch {
    return "";
  }
}

function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function corsText(request: Request, text: string, status: number): Response {
  return new Response(text, { status, headers: corsHeaders(request) });
}

function withCors(
  request: Request,
  response: Response,
  _target: URL,
): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, headers);
  cors.forEach((value, key) => headers.set(key, value));
  headers.delete("set-cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(request: Request, responseHeaders?: Headers): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", allowedOrigin(request));
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", allowedMethods(request));
  headers.set("access-control-allow-headers", allowedHeaders(request));
  headers.set("access-control-expose-headers", exposedHeaders(responseHeaders));
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
}

function allowedOrigin(request: Request): string {
  return request.headers.get("origin") || "*";
}

function allowedMethods(request: Request): string {
  const requested = request.headers
    .get("access-control-request-method")
    ?.trim();
  return requested || "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
}

function allowedHeaders(request: Request): string {
  return (
    request.headers.get("access-control-request-headers") ||
    FALLBACK_CORS_HEADERS
  );
}

function exposedHeaders(responseHeaders: Headers | undefined): string {
  const names = responseHeaders
    ? Array.from(responseHeaders.keys()).filter(
        (name) => name.toLowerCase() !== "set-cookie",
      )
    : [];
  return names.length ? names.join(", ") : "*";
}

function isCorsPreflight(request: Request): boolean {
  return (
    request.method === "OPTIONS" &&
    request.headers.has("access-control-request-method")
  );
}
