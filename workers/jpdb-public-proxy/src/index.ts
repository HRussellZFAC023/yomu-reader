import { isPrivateOrLocalHostname } from "../../../src/reader/network/private-host";
import { withWorkerSecurityHeaders } from "../../shared/security-headers";
import { serviceRevision } from "../../shared/service-revision";

const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
const FALLBACK_CORS_HEADERS =
  "accept, accept-language, content-type, range, x-forcecaf";
const SENSITIVE_REQUEST_KEY_RE =
  /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = new Set(["GET", "HEAD"]);
const BUNPRO_AUDIO_CDN_HOST = "dk3kgylsgq3k1.cloudfront.net";
const PUBLIC_PROXY_ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "range",
  "x-forcecaf",
]);
const PUBLIC_PROXY_ALLOWLIST_VERSION = "2026-08-10-uchisen-retired";
// Transient gateway / connection / TLS failures where a single retry helps.
// Deliberately EXCLUDES 500 (the app itself errored) and 503 (the server is
// explicitly overloaded / rate-limiting) — retrying those just piles more load
// onto a struggling origin, which is the opposite of what a polite proxy should
// do. Those statuses are returned immediately so the client backs off.
const RETRYABLE_UPSTREAM_STATUSES = new Set([
  502, 504, 520, 521, 522, 523, 524, 525, 526, 527,
]);
const JISHO_SEARCH_RETRY_COUNT = 3;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const proxyWorker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (isStatusRequest(request)) return statusResponse(request, env);
    if (isCorsPreflight(request)) return preflight(request);
    if (publicProxyDisabled(env)) {
      return corsText(request, "Public proxy disabled.", 503, {
        "x-yomu-proxy-error": "disabled",
      });
    }
    const target = targetUrl(request);
    if (!target) return corsText(request, "Missing url parameter.", 400);
    const policy = publicProxyTargetPolicy(request, target);
    if (!policy.allowed) {
      const response = corsText(request, "Target is not proxyable.", 400, {
        "x-yomu-proxy-error": policy.reason,
      });
      maybeRecordProxyAnalytics(ctx, env, request, target, policy.targetKind, response.status, policy.reason);
      return response;
    }

    const budget = consumeDailyBudget(env);
    if (!budget.allowed) {
      const response = withCors(request, budgetExceededResponse(budget), target);
      maybeRecordProxyAnalytics(ctx, env, request, target, policy.targetKind, response.status, "budget-exhausted", budget);
      return response;
    }

    // Edge-cache deterministic, user-agnostic public GETs (e.g. Jiten
    // /vocabulary/<id>/<ri>/info, which the origin marks cacheable for an hour).
    // The same word looked up by many Yomu clients then resolves from
    // Cloudflare's edge instead of hitting the upstream every time — the single
    // biggest lever for not overloading a server with repeated lookups.
    const edgeCache = edgeCacheStore(request, target);
    if (edgeCache) {
      const hit = await edgeCache.match();
      if (hit) {
        const response = withCors(request, hit, target);
        maybeRecordProxyAnalytics(ctx, env, request, target, policy.targetKind, response.status, "edge-cache", budget);
        return response;
      }
    }

    // Honor the upstream's rate limit at the proxy layer. After a 429 from a
    // host, short-circuit further requests to it for a cooldown (Retry-After if
    // the server gave one) and return 429 immediately. This shared proxy then
    // stops forwarding requests it already knows the origin is rejecting,
    // protecting the origin from every hosted client collectively — not just
    // the one that happened to see the 429. (Cache hits above still serve,
    // since they never touch the origin.)
    const rateLimitedUntil = upstreamRateLimitBackoff.get(target.hostname) ?? 0;
    if (Date.now() < rateLimitedUntil) {
      const response = withCors(request, rateLimitResponse(rateLimitedUntil - Date.now()), target);
      maybeRecordProxyAnalytics(ctx, env, request, target, policy.targetKind, response.status, "rate-limited", budget);
      return response;
    }

    // Coalesce concurrent identical cacheable GETs: a burst of clients looking
    // up the same word collapses to ONE upstream request instead of N. This
    // protects the origin even where the edge cache is unavailable (e.g. a
    // workers.dev subdomain, where the Cache API is best-effort). Each caller
    // receives an independent clone of the shared response.
    const response = edgeCache
      ? await coalesceOriginRequest(target.href, () => fetchProxyTarget(request, target))
      : await fetchProxyTarget(request, target);

    if (response.status === 429) {
      const cooldown = retryAfterMsFromResponse(response) ?? UPSTREAM_RATE_LIMIT_BACKOFF_MS;
      upstreamRateLimitBackoff.set(target.hostname, Date.now() + cooldown);
    }

    if (edgeCache && isCacheableUpstreamResponse(response)) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set("cache-control", edgeCache.cacheControl);
      stored.headers.delete("set-cookie");
      stored.headers.delete("vary");
      ctx.waitUntil(edgeCache.put(stored));
    }
    const proxied = withCors(request, response, target);
    maybeRecordProxyAnalytics(ctx, env, request, target, policy.targetKind, proxied.status, "origin", budget);
    return proxied;
  },
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return withWorkerSecurityHeaders(
      await proxyWorker.fetch(request, env, ctx),
    );
  },
};

const MICRO_CACHE_TTL_MS = 60_000;
const MICRO_CACHE_MAX_ENTRIES = 256;

interface OriginRequestEntry {
  promise: Promise<Response>;
  // A resolved, undisturbed clone kept for the brief reuse window. Cloned again
  // per caller so the stored copy's body is never consumed directly.
  response?: Response;
  expiresAt: number;
}

const originRequestCache = new Map<string, OriginRequestEntry>();

// Per-upstream-host cooldown after a 429. Per-isolate (best-effort), but during
// a sustained rate-limit each isolate learns within one request and stops
// forwarding to that host until the cooldown lapses.
const UPSTREAM_RATE_LIMIT_BACKOFF_MS = 30_000;
const upstreamRateLimitBackoff = new Map<string, number>();

interface DailyBudgetState {
  day: string;
  count: number;
}

const dailyBudgetState: DailyBudgetState = {
  day: utcDayKey(),
  count: 0,
};

// Test-only: both maps are module-level and outlive a single request, so tests
// reset them between cases so one case's state can't affect the next.
export function resetProxyWorkerCacheForTests(): void {
  originRequestCache.clear();
  upstreamRateLimitBackoff.clear();
  dailyBudgetState.day = utcDayKey();
  dailyBudgetState.count = 0;
}

function rateLimitResponse(remainingMs: number): Response {
  return new Response("Upstream is rate-limiting; backing off.", {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": String(Math.max(1, Math.ceil(remainingMs / 1000))),
      "x-yomu-proxy-error": "rate-limited",
    },
  });
}

function retryAfterMsFromResponse(response: Response): number | undefined {
  const header = response.headers?.get?.("retry-after");
  if (!header) return undefined;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

// Coalesce concurrent identical upstream GETs AND briefly reuse the result
// (per-isolate, ~60s). This dedups not just simultaneous requests but the
// common burst of many clients looking up the same popular word within seconds
// — and it works on workers.dev, where the Cache API is only best-effort. Only
// user-agnostic, cacheable responses are retained; anything else falls straight
// through. Each caller receives an independent clone.
async function coalesceOriginRequest(
  key: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const now = Date.now();
  const cached = originRequestCache.get(key);
  if (cached && cached.expiresAt > now) {
    const shared = cached.response ?? (await cached.promise);
    return shared.clone();
  }
  if (cached) originRequestCache.delete(key);

  const promise = run();
  const entry: OriginRequestEntry = { promise, expiresAt: now + MICRO_CACHE_TTL_MS };
  originRequestCache.set(key, entry);
  pruneOriginRequestCache(now);
  try {
    const response = await promise;
    if (isCacheableUpstreamResponse(response)) {
      entry.response = response.clone();
      entry.expiresAt = Date.now() + MICRO_CACHE_TTL_MS;
    } else {
      originRequestCache.delete(key);
    }
    return response.clone();
  } catch (error) {
    originRequestCache.delete(key);
    throw error;
  }
}

function pruneOriginRequestCache(now: number): void {
  if (originRequestCache.size <= MICRO_CACHE_MAX_ENTRIES) return;
  for (const [key, entry] of originRequestCache) {
    if (entry.expiresAt <= now) originRequestCache.delete(key);
  }
  while (originRequestCache.size > MICRO_CACHE_MAX_ENTRIES) {
    const oldest = originRequestCache.keys().next().value;
    if (typeof oldest !== "string") break;
    originRequestCache.delete(oldest);
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

interface Env {
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
  PUBLIC_PROXY_DISABLED?: string;
  PUBLIC_PROXY_DAILY_REQUEST_LIMIT?: string;
  PUBLIC_PROXY_ANALYTICS_LOGS?: string;
}

type PublicProxyTargetKind =
  | "bunpro-audio"
  | "immersion-kit-search"
  | "jiten-kanji"
  | "jiten-tts"
  | "jiten-vocabulary-info"
  | "jiten-vocabulary-parse"
  | "jiten-vocabulary-search"
  | "jisho-search"
  | "jpdb-audio"
  | "jpdb-kanji"
  | "jpdb-search"
  | "jpdb-vocabulary"
  | "known-public-audio";

interface PublicProxyPolicy {
  allowed: boolean;
  reason: string;
  targetKind?: PublicProxyTargetKind;
}

interface BudgetDecision {
  allowed: boolean;
  day: string;
  count: number;
  limit: number | null;
  remaining: number | null;
}

function targetUrl(request: Request): URL | null {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("url");
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

function isStatusRequest(request: Request): boolean {
  if (!READ_METHODS.has(request.method.trim().toUpperCase())) return false;
  try {
    const url = new URL(request.url);
    return url.pathname === "/status" || url.pathname === "/healthz";
  } catch {
    return false;
  }
}

function statusResponse(request: Request, env: Env): Response {
  const body = {
    service: "yomu-jpdb-public-proxy",
    status: publicProxyDisabled(env) ? "disabled" : "ok",
    revision: serviceRevision(env),
    allowlistVersion: PUBLIC_PROXY_ALLOWLIST_VERSION,
    allowedMethods: Array.from(READ_METHODS),
    allowedHosts: [
      "api.jiten.moe",
      "apiv2.immersionkit.com",
      "apiv2express.immersionkit.com",
      "assets.languagepod101.com",
      "cdn.innovativelanguage.com",
      "jisho.org",
      "jpdb.io",
      "d1pra95f92lrn3.cloudfront.net",
      "d1vjc5dkcd3yh2.cloudfront.net",
      BUNPRO_AUDIO_CDN_HOST,
    ].sort(),
    policy: {
      anonymousOnly: true,
      privateNetworkTargets: false,
      sensitiveHeadersAndUrlParams: false,
      arbitraryTargets: false,
    },
    budget: budgetSnapshot(env),
    analytics: {
      structuredLogs: publicProxyAnalyticsEnabled(env),
      logsTargetQueries: false,
      logsRequestHeaders: false,
    },
  };
  return jsonResponse(request, body, 200);
}

function publicProxyDisabled(env: Env): boolean {
  return truthyEnv(env.PUBLIC_PROXY_DISABLED);
}

function publicProxyAnalyticsEnabled(env: Env): boolean {
  return truthyEnv(env.PUBLIC_PROXY_ANALYTICS_LOGS);
}

function consumeDailyBudget(env: Env): BudgetDecision {
  resetDailyBudgetIfNeeded();
  const limit = configuredDailyBudgetLimit(env);
  if (limit !== null && dailyBudgetState.count >= limit) {
    return {
      allowed: false,
      day: dailyBudgetState.day,
      count: dailyBudgetState.count,
      limit,
      remaining: 0,
    };
  }
  dailyBudgetState.count += 1;
  return budgetDecision(true, limit);
}

function budgetSnapshot(env: Env): Omit<BudgetDecision, "allowed"> {
  resetDailyBudgetIfNeeded();
  const limit = configuredDailyBudgetLimit(env);
  const decision = budgetDecision(true, limit);
  return {
    day: decision.day,
    count: decision.count,
    limit: decision.limit,
    remaining: decision.remaining,
  };
}

function budgetDecision(allowed: boolean, limit: number | null): BudgetDecision {
  return {
    allowed,
    day: dailyBudgetState.day,
    count: dailyBudgetState.count,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - dailyBudgetState.count),
  };
}

function resetDailyBudgetIfNeeded(): void {
  const day = utcDayKey();
  if (dailyBudgetState.day === day) return;
  dailyBudgetState.day = day;
  dailyBudgetState.count = 0;
}

function configuredDailyBudgetLimit(env: Env): number | null {
  const raw = env.PUBLIC_PROXY_DAILY_REQUEST_LIMIT?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function budgetExceededResponse(budget: BudgetDecision): Response {
  return new Response("Public proxy request budget exhausted.", {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": secondsUntilNextUtcDay(),
      "x-yomu-proxy-error": "budget-exhausted",
      "x-yomu-proxy-budget-limit": String(budget.limit ?? ""),
      "x-yomu-proxy-budget-remaining": String(budget.remaining ?? ""),
    },
  });
}

function secondsUntilNextUtcDay(now = new Date()): string {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return String(Math.max(1, Math.ceil((next - now.getTime()) / 1000)));
}

export function isAllowedPublicProxyTarget(
  method: string,
  target: URL,
  _env: Env = {},
  request?: Request,
): boolean {
  return publicProxyTargetPolicyFor(method, request?.headers ?? new Headers(), target).allowed;
}

function publicProxyTargetPolicy(request: Request, target: URL): PublicProxyPolicy {
  return publicProxyTargetPolicyFor(request.method, request.headers, target);
}

function publicProxyTargetPolicyFor(
  method: string,
  headers: Headers,
  target: URL,
): PublicProxyPolicy {
  const normalizedMethod = method.trim().toUpperCase();
  if (!READ_METHODS.has(normalizedMethod)) {
    return blockedPublicProxyPolicy("method-not-allowed");
  }
  if (target.protocol !== "https:") {
    return blockedPublicProxyPolicy("scheme-not-allowed");
  }
  if (isPrivateOrLocalHostname(target.hostname)) {
    return blockedPublicProxyPolicy("private-network");
  }
  if (hasSensitiveUrlParams(target) || hasSensitiveRequestHeaders(headers)) {
    return blockedPublicProxyPolicy("sensitive-request");
  }
  const targetKind = publicProxyTargetKind(target);
  if (!targetKind) return blockedPublicProxyPolicy("target-not-allowlisted");
  return { allowed: true, reason: "allowed", targetKind };
}

function blockedPublicProxyPolicy(reason: string): PublicProxyPolicy {
  return { allowed: false, reason };
}

function publicProxyTargetKind(target: URL): PublicProxyTargetKind | null {
  const path = target.pathname;
  if (target.hostname === "jpdb.io") {
    if (path === "/search") return "jpdb-search";
    if (path.startsWith("/vocabulary/")) return "jpdb-vocabulary";
    if (path.startsWith("/kanji/")) return "jpdb-kanji";
    if (path.startsWith("/static/v/")) return "jpdb-audio";
    return null;
  }
  if (target.hostname === "api.jiten.moe") {
    if (path.startsWith("/api/tts/word/") || path.startsWith("/api/tts/sentence/")) return "jiten-tts";
    if (path === "/api/vocabulary/search") return "jiten-vocabulary-search";
    if (path === "/api/vocabulary/parse" || path === "/api/vocabulary/parse-normalised") return "jiten-vocabulary-parse";
    if (/^\/api\/vocabulary\/\d+\/\d+\/info$/.test(path)) return "jiten-vocabulary-info";
    if (path.startsWith("/api/kanji/")) return "jiten-kanji";
    return null;
  }
  if (target.hostname === "jisho.org" && path.startsWith("/search/")) return "jisho-search";
  if (target.hostname === "assets.languagepod101.com" && path === "/dictionary/japanese/audiomp3.php") return "known-public-audio";
  if (target.hostname === "cdn.innovativelanguage.com" && path.includes("/learningcenter/audio/")) return "known-public-audio";
  if (
    (target.hostname === "d1pra95f92lrn3.cloudfront.net" ||
      target.hostname === "d1vjc5dkcd3yh2.cloudfront.net") &&
    path.startsWith("/audio/")
  ) return "known-public-audio";
  if (target.hostname === BUNPRO_AUDIO_CDN_HOST && path.startsWith("/audio/")) return "bunpro-audio";
  if (
    (target.hostname === "apiv2express.immersionkit.com" ||
      target.hostname === "apiv2.immersionkit.com") &&
    path === "/search"
  ) return "immersion-kit-search";
  return null;
}

function hasSensitiveRequestHeaders(headers: Headers | undefined): boolean {
  if (!headers) return false;
  return Array.from(headers.keys()).some((name) =>
    SENSITIVE_REQUEST_KEY_RE.test(name),
  );
}

function hasSensitiveUrlParams(target: URL): boolean {
  return Array.from(target.searchParams.keys()).some((name) =>
    SENSITIVE_REQUEST_KEY_RE.test(name),
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
      upstreamInit(request, target),
    );
  }

  const attempts = [upstreamInit(request, target)];
  if (isIdempotentRequest(request)) {
    attempts.push(upstreamInit(request, target));
  }
  return attempts;
}

function upstreamInit(request: Request, target: URL): RequestInit {
  return {
    method: request.method,
    headers: minimalUpstreamHeaders(request, target),
    redirect: "follow",
  };
}

function minimalUpstreamHeaders(request: Request, target: URL): Headers {
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  if (isJpdbAudioTarget(target)) {
    headers.set("x-access", JPDB_AUDIO_ACCESS_HEADER);
    const forceCaf = jpdbAudioForceCaf(request, target);
    if (forceCaf) headers.set("x-forcecaf", forceCaf);
  }
  return headers;
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
  if (header === "1") return header;
  try {
    return new URL(request.url).searchParams.get("x-forcecaf") === "1" ? "1" : "";
  } catch {
    return "";
  }
}

function preflight(request: Request): Response {
  const requestedMethod = request.headers
    .get("access-control-request-method")
    ?.trim()
    .toUpperCase();
  if (requestedMethod && !READ_METHODS.has(requestedMethod)) {
    return corsText(request, "Method is not allowed.", 405, {
      "x-yomu-proxy-error": "method-not-allowed",
    });
  }
  if (hasDisallowedPreflightHeaders(request)) {
    return corsText(request, "Header is not allowed.", 403, {
      "x-yomu-proxy-error": "sensitive-request",
    });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function corsText(
  request: Request,
  text: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "text/plain; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(text, { status, headers });
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers,
  });
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
    ?.trim()
    .toUpperCase();
  return requested && READ_METHODS.has(requested) ? requested : "GET, HEAD";
}

function allowedHeaders(request: Request): string {
  const requested = request.headers.get("access-control-request-headers");
  if (!requested) return FALLBACK_CORS_HEADERS;
  const allowed = requested
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => PUBLIC_PROXY_ALLOWED_REQUEST_HEADERS.has(name));
  return allowed.length ? allowed.join(", ") : FALLBACK_CORS_HEADERS;
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

function hasDisallowedPreflightHeaders(request: Request): boolean {
  const requested = request.headers.get("access-control-request-headers");
  if (!requested) return false;
  return requested
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .some((name) => Boolean(name) && (SENSITIVE_REQUEST_KEY_RE.test(name) || !PUBLIC_PROXY_ALLOWED_REQUEST_HEADERS.has(name)));
}

function maybeRecordProxyAnalytics(
  ctx: ExecutionContext,
  env: Env,
  request: Request,
  target: URL,
  targetKind: PublicProxyTargetKind | undefined,
  status: number,
  outcome: string,
  budget?: BudgetDecision,
): void {
  if (!publicProxyAnalyticsEnabled(env)) return;
  ctx.waitUntil(Promise.resolve().then(() => {
    console.log(JSON.stringify({
      event: "yomu_public_proxy_request",
      method: request.method,
      status,
      outcome,
      targetHost: target.hostname,
      targetKind: targetKind ?? "unknown",
      allowlistVersion: PUBLIC_PROXY_ALLOWLIST_VERSION,
      budgetDay: budget?.day ?? null,
      budgetLimit: budget?.limit ?? null,
      budgetRemaining: budget?.remaining ?? null,
    }));
  }));
}

function truthyEnv(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/i.test(value?.trim() ?? "");
}
