(function() {
"use strict";
class RetryableTimeoutError extends Error {
  constructor(message = "Request timed out.") {
  super(message);
  this.name = "RetryableTimeoutError";
  }
}
const FURIGANA_HIDE_STATE_GROUPS = ["known", "due", "failed", "learning", "new"];
const APP_NAME = "よむ";
const ACADEMY_SRS_LABEL = "Academy";
const APP_SLUG = "yomu";
const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
const GITHUB_OWNER = "HRussellZFAC023";
const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
const DOCS_ORIGIN = "https://yomureader.com";
const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
const SUPPORT_COPY = "よむ is free: popup lookup, dictionaries, OCR, subtitles, study and Anki in one place.";
const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
const USERSCRIPT_STORAGE_BRIDGE_READY_EVENT = "yomu-userscript-storage-bridge-ready";
const BUNPRO_DEFINITION_SOURCE_ID = "__bunpro__";
const PRIVATE_IPV4_RANGES = [
  [0, 16777215],
  [167772160, 184549375],
  [1681915904, 1686110207],
  [2130706432, 2147483647],
  [2851995648, 2852061183],
  [2886729728, 2887778303],
  [3232235520, 3232301055]
];
function isPrivateOrLocalHostname(hostname) {
  const host = stripIpv6Brackets(hostname.trim().toLowerCase());
  if (!host) return true;
  return isLocalhostName(host) || isPrivateIpv4(host) || isPrivateIpv6(host);
}
function stripIpv6Brackets(host) {
  return host.replace(/^\[/u, "").replace(/\]$/u, "");
}
function isLocalhostName(host) {
  return host === "localhost" || host.endsWith(".localhost");
}
function isPrivateIpv4(host) {
  const value = ipv4LiteralToInt(host);
  return value !== null && isPrivateIpv4Int(value);
}
function isPrivateIpv4Int(value) {
  return PRIVATE_IPV4_RANGES.some(([low, high]) => value >= low && value <= high);
}
function ipv4LiteralToInt(host) {
  const fields = host.split(".");
  if (fields.length === 0 || fields.length > 4) return null;
  const values = [];
  for (const field of fields) {
  const value = parseIpv4Field(field);
  if (value === null) return null;
  values.push(value);
  }
  const head = values.slice(0, -1);
  if (head.some((value) => value > 255)) return null;
  const tail = values[values.length - 1];
  const tailBytes = 4 - head.length;
  const tailMax = tailBytes >= 4 ? 4294967295 : 256 ** tailBytes - 1;
  if (tail > tailMax) return null;
  let result = 0;
  for (const value of head) result = result * 256 + value;
  return result * 256 ** tailBytes + tail;
}
function parseIpv4Field(field) {
  if (!field) return null;
  if (/^0x[0-9a-f]+$/iu.test(field)) return finiteNonNegative(parseInt(field.slice(2), 16));
  if (/^0[0-7]+$/u.test(field)) return finiteNonNegative(parseInt(field.slice(1), 8));
  if (/^[0-9]+$/u.test(field)) return finiteNonNegative(parseInt(field, 10));
  return null;
}
function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function isPrivateIpv6(host) {
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "::") return true;
  const mapped = host.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (mapped) {
  const value = ipv4LiteralToInt(mapped[1]);
  if (value !== null && isPrivateIpv4Int(value)) return true;
  }
  return host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/u.test(host);
}
let recorder = () => void 0;
function setAttemptRecorder(next) {
  recorder = next;
}
function record(label, error) {
  recorder(label, error);
}
function attempt(fn, fallback, label) {
  try {
  return fn();
  } catch (error) {
  record(label, error);
  return fallback;
  }
}
function attemptVoid(fn, label) {
  try {
  fn();
  } catch (error) {
  record(label, error);
  }
}
const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD"]);
const IMMERSION_KIT_API_HOSTS = /* @__PURE__ */ new Set([
  "apiv2express.immersionkit.com",
  "apiv2.immersionkit.com"
]);
const KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS = /* @__PURE__ */ new Set([
  "d1pra95f92lrn3.cloudfront.net",
  "d1vjc5dkcd3yh2.cloudfront.net",
  // Bunpro pronunciation CDN: public (HTTP 200 without auth) but returns no
  // access-control-allow-origin header, so browser fetch()/Web-Audio paths
  // must go through the worker proxy; direct <audio src> playback is fine.
  "dk3kgylsgq3k1.cloudfront.net"
]);
const YOMU_PUBLIC_PROXY_HOSTS = /* @__PURE__ */ new Set([
  "yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev",
  "edge.yomureader.com",
  "proxy.yomureader.com"
]);
const YOMU_SHARED_PUBLIC_PROXY_URL = "https://edge.yomureader.com/";
const YOMU_SHARED_PUBLIC_PROXY_FALLBACK_URLS = [
  YOMU_SHARED_PUBLIC_PROXY_URL,
  "https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/"
];
function configuredProxyFetchUrl(targetUrl, configuredProxyUrl) {
  const proxyUrl = configuredProxyUrl.trim();
  if (!proxyUrl) return null;
  try {
  const url = new URL(proxyUrl);
  url.searchParams.set("url", targetUrl);
  return url.href;
  } catch {
  return null;
  }
}
function isProxySafeRequest(targetUrl, options) {
  return !hasSensitiveRequestHeaders(options.headers) && !hasCredentialedRequest(options.credentials) && !isPrivateJpdbTarget(targetUrl, options) && !isPrivateNetworkTarget(targetUrl) && !hasSensitiveUrlParams(targetUrl);
}
function isSharedPublicProxySafeRequest(targetUrl, options) {
  const target = fetchTarget(targetUrl);
  return Boolean(target && isProxySafeRequest(targetUrl, options) && isReadMethod(options.method) && isSharedPublicProxyAllowlistedTarget(target));
}
function shouldPreferProxyFirst(targetUrl, hasDirectCandidate, proxySafe) {
  return hasDirectCandidate && proxySafe && !isKnownDirectCorsTarget(targetUrl) && isHostedGithubPagesApp() && isCrossOriginHttpUrl(targetUrl);
}
function isKnownCorsBlockedPublicAudioCdnUrl(target) {
  try {
  const url = typeof target === "string" ? typeof location === "undefined" ? new URL(target) : new URL(target, location.href) : target;
  return KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS.has(url.hostname) && url.pathname.startsWith("/audio/");
  } catch {
  return false;
  }
}
function shouldSkipDirectCrossOriginFetch(targetUrl, options) {
  const target = fetchTarget(targetUrl);
  const method = requestMethod(options);
  return Boolean(target && isCrossOriginHttpTarget(target) && (isKnownCorsBlockedConfiguredProxyTarget(target, method) || isJpdbPublicLookupTarget(target, method) || isLocalHostedBrowserCorsTarget(target, method)));
}
function builtInProxyUrls(targetUrl, options) {
  if (!isSharedPublicProxySafeRequest(targetUrl, options)) return [];
  return YOMU_SHARED_PUBLIC_PROXY_FALLBACK_URLS.map((proxyUrl) => configuredProxyFetchUrl(targetUrl, proxyUrl)).filter((url) => Boolean(url));
}
function isJpdbPublicAudioUrl(targetUrl) {
  try {
  const target = new URL(targetUrl, location.href);
  return target.hostname === "jpdb.io" && target.pathname.startsWith("/static/v/") || isKnownCorsBlockedPublicAudioCdnUrl(target);
  } catch {
  return false;
  }
}
function isYomuPublicProxyUrl(candidateUrl) {
  try {
  const url = new URL(candidateUrl);
  return YOMU_PUBLIC_PROXY_HOSTS.has(url.hostname);
  } catch {
  return false;
  }
}
function isKnownDirectCorsTarget(targetUrl) {
  try {
  const target = new URL(targetUrl, location.href);
  return IMMERSION_KIT_API_HOSTS.has(target.hostname) || target.hostname === "api.nadeshiko.co" || target.hostname === "raw.githubusercontent.com";
  } catch {
  return false;
  }
}
function isKnownCorsBlockedConfiguredProxyTarget(target, method) {
  return method === "GET" && (isJpdbPublicAudioUrl(target.href) || target.hostname === "jisho.org" && target.pathname.startsWith("/search/") || target.hostname === "assets.languagepod101.com" && target.pathname === "/dictionary/japanese/audiomp3.php" || target.hostname === "cdn.innovativelanguage.com" && target.pathname.includes("/learningcenter/audio/") || target.hostname === "api.jiten.moe" && (target.pathname.startsWith("/api/tts/word/") || target.pathname.startsWith("/api/tts/sentence/") || target.pathname === "/api/vocabulary/search" || target.pathname === "/api/vocabulary/parse" || /^\/api\/vocabulary\/\d+\/\d+\/info$/u.test(target.pathname)));
}
function isSharedPublicProxyAllowlistedTarget(target) {
  const host = target.hostname.toLowerCase();
  const path = target.pathname;
  if (target.protocol !== "https:") return false;
  if (host === "api.jiten.moe") {
  return path.startsWith("/api/tts/word/") || path.startsWith("/api/tts/sentence/") || path === "/api/vocabulary/search" || path === "/api/vocabulary/parse" || path === "/api/vocabulary/parse-normalised" || /^\/api\/vocabulary\/\d+\/\d+\/info$/u.test(path) || path.startsWith("/api/kanji/");
  }
  if (host === "jpdb.io") {
  return path === "/search" || path.startsWith("/vocabulary/") || path.startsWith("/kanji/") || path.startsWith("/static/v/");
  }
  if (host === "jisho.org") return path.startsWith("/search/");
  if (host === "assets.languagepod101.com") return path === "/dictionary/japanese/audiomp3.php";
  if (host === "cdn.innovativelanguage.com") return path.includes("/learningcenter/audio/");
  if (KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS.has(host)) return path.startsWith("/audio/");
  return IMMERSION_KIT_API_HOSTS.has(host) && path === "/search";
}
function isJpdbPublicLookupTarget(target, method) {
  return method === "GET" && target.hostname === "jpdb.io" && (target.pathname === "/search" || target.pathname.startsWith("/vocabulary/"));
}
function isLocalHostedBrowserCorsTarget(target, method) {
  return method === "GET" && isLocalHostedApp() && IMMERSION_KIT_API_HOSTS.has(target.hostname) && target.pathname === "/search";
}
function isHostedGithubPagesApp() {
  if (typeof location === "undefined") return false;
  try {
  const current = new URL(location.href);
  const path = current.pathname.replace(/\/index\.html$/, "/");
  return current.origin === DOCS_ORIGIN || current.origin === GITHUB_PAGES_ORIGIN && path.startsWith(`/${APP_REPOSITORY_NAME}/`);
  } catch {
  return false;
  }
}
function isLocalHostedApp() {
  if (typeof location === "undefined") return false;
  return ["127.0.0.1", "localhost", "::1"].includes(location.hostname);
}
function isCrossOriginHttpUrl(targetUrl) {
  const target = fetchTarget(targetUrl);
  return Boolean(target && isCrossOriginHttpTarget(target));
}
function isCrossOriginHttpTarget(target) {
  return typeof location !== "undefined" && /^https?:$/i.test(target.protocol) && target.origin !== location.origin;
}
function fetchTarget(targetUrl) {
  try {
  return typeof location === "undefined" ? new URL(targetUrl) : new URL(targetUrl, location.href);
  } catch {
  return null;
  }
}
function requestMethod(options) {
  return String(options.method ?? "GET").toUpperCase();
}
function hasSensitiveRequestHeaders(headers) {
  if (!headers) return false;
  if (headers instanceof Headers) {
  return Array.from(headers.keys()).some((header) => SENSITIVE_REQUEST_KEY_RE.test(header));
  }
  if (Array.isArray(headers)) return headers.some(([header]) => SENSITIVE_REQUEST_KEY_RE.test(header));
  return Object.keys(headers).some((header) => SENSITIVE_REQUEST_KEY_RE.test(header));
}
function hasCredentialedRequest(credentials) {
  return credentials === "include";
}
function isPrivateJpdbTarget(targetUrl, options) {
  try {
  const url = new URL(targetUrl, location.href);
  if (url.hostname !== "jpdb.io") return false;
  if (!isReadMethod(options.method)) return true;
  return url.pathname.startsWith("/api/") || /^\/(?:prioritize|review|settings|login)(?:\/|$)/.test(url.pathname);
  } catch {
  return false;
  }
}
function isPrivateNetworkTarget(targetUrl) {
  try {
  const url = new URL(targetUrl, location.href);
  return isPrivateOrLocalHostname(url.hostname);
  } catch {
  return false;
  }
}
function hasSensitiveUrlParams(targetUrl) {
  try {
  const url = new URL(targetUrl, location.href);
  return Array.from(url.searchParams.keys()).some((key) => SENSITIVE_REQUEST_KEY_RE.test(key));
  } catch {
  return false;
  }
}
function isReadMethod(method) {
  return READ_METHODS.has(String(method ?? "GET").toUpperCase());
}
const NO_PROXY_TRANSPORT_MESSAGE = "No configured proxy.";
async function fetchWithCorsFallbacks(targetUrl, configuredProxyUrl = "", options = {}) {
  const candidates = fetchUrlCandidates(targetUrl, configuredProxyUrl, options);
  if (!candidates.length) throw new Error(NO_PROXY_TRANSPORT_MESSAGE);
  let lastError;
  for (const [index, candidate] of candidates.entries()) {
  if (options.signal?.aborted) throw abortReasonFor(options.signal);
  try {
    const attempt2 = fetchAttemptForCandidate(targetUrl, candidate, options);
    const response = await fetchWithTimeout(attempt2.url, attempt2.options);
    if (shouldTryNextFetchCandidate(response, candidate, index, candidates)) {
      lastError = new Error(`Proxy request failed (${response.status}).`);
      continue;
    }
    return response;
  } catch (error) {
    if (options.signal?.aborted) throw abortReasonFor(options.signal);
    lastError = error;
  }
  }
  throw lastError instanceof Error ? lastError : new Error("Cross-origin request failed.");
}
function abortReasonFor(signal) {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}
function fetchAttemptForCandidate(targetUrl, candidate, options) {
  if (candidate.kind === "direct" || !isJpdbPublicAudioUrl(targetUrl) || !isYomuPublicProxyUrl(candidate.url)) {
  return { url: candidate.url, options };
  }
  return {
  url: proxyControlUrl(candidate.url, options.headers),
  options: {
    ...options,
    headers: stripProxyOnlyHeaders(options.headers, ["x-access", "x-forcecaf"])
  }
  };
}
function proxyControlUrl(candidateUrl, headers) {
  const forceCaf = headerValue(headers, "x-forcecaf");
  if (!forceCaf) return candidateUrl;
  try {
  const url = new URL(candidateUrl);
  url.searchParams.set("x-forcecaf", forceCaf);
  return url.href;
  } catch {
  return candidateUrl;
  }
}
function stripProxyOnlyHeaders(headers, names) {
  if (!headers) return headers;
  const excluded = new Set(names.map((name) => name.toLowerCase()));
  const sanitized = {};
  new Headers(headers).forEach((value, key) => {
  if (!excluded.has(key.toLowerCase())) sanitized[key] = value;
  });
  return Object.keys(sanitized).length ? sanitized : void 0;
}
function headerValue(headers, name) {
  if (!headers) return "";
  return new Headers(headers).get(name) ?? "";
}
function fetchUrlCandidates(targetUrl, configuredProxyUrl, options) {
  const proxySafe = isProxySafeRequest(targetUrl, options);
  const configuredProxySafe = proxySafe || options.allowSensitiveConfiguredProxy === true;
  const configuredUrl = configuredProxyFetchUrl(targetUrl, configuredProxyUrl);
  const configuredUrlIsSharedPublicProxy = configuredUrl ? isYomuPublicProxyUrl(configuredUrl) : false;
  const configured = configuredProxySafe && options.allowConfiguredProxy !== false && !configuredUrlIsSharedPublicProxy ? configuredUrl : null;
  const publicProxySafe = proxySafe && options.allowPublicProxies !== false;
  const configuredPublicProxy = publicProxySafe && configuredUrlIsSharedPublicProxy ? configuredUrl : null;
  const publicProxies = publicProxySafe ? [
  configuredPublicProxy,
  ...builtInProxyUrls(targetUrl, options)
  ].filter((url) => Boolean(url)) : [];
  const proxyCandidates = [
  configured ? { url: configured, kind: "configured-proxy" } : null,
  ...publicProxies.map((url) => ({ url, kind: "public-proxy" }))
  ].filter((candidate) => Boolean(candidate));
  const direct = directFetchUrl(targetUrl, options, proxyCandidates.length > 0);
  const directCandidate = direct ? { url: direct, kind: "direct" } : null;
  const orderedCandidates = shouldPreferProxyFirst(targetUrl, Boolean(directCandidate), proxySafe) ? [...proxyCandidates, directCandidate] : [directCandidate, ...proxyCandidates];
  return uniqueFetchCandidates([
  ...orderedCandidates
  ]);
}
function directFetchUrl(targetUrl, options, hasProxyCandidate) {
  if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
  if (hasProxyCandidate && shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
  return targetUrl;
}
function uniqueFetchCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((candidate) => {
  if (!candidate || seen.has(candidate.url)) return false;
  seen.add(candidate.url);
  return true;
  });
}
function shouldTryNextFetchCandidate(response, _candidate, index, candidates) {
  return !response.ok && response.status !== 429 && index < candidates.length - 1;
}
function browserReadableUrl(url) {
  if (!isHttpUrl(url)) return url;
  try {
  const target = new URL(url, location.href);
  return target.origin === location.origin ? target.href : null;
  } catch {
  return null;
  }
}
function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}
async function fetchWithTimeout(url, options) {
  const {
  timeoutMs,
  timeoutLabel,
  allowPublicProxies: _allowPublicProxies,
  allowConfiguredProxy: _allowConfiguredProxy,
  allowSensitiveConfiguredProxy: _allowSensitiveConfiguredProxy,
  allowDirectCrossOrigin: _allowDirectCrossOrigin,
  signal,
  ...init
  } = options;
  if (!timeoutMs) return fetch(url, { ...init, signal });
  const scope = fetchTimeoutScope(signal, timeoutMs, timeoutLabel);
  try {
  return await fetchWithinAbortScope(url, init, scope.signal);
  } finally {
  scope.dispose();
  }
}
function fetchTimeoutScope(signal, timeoutMs, timeoutLabel) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
  controller.abort(new RetryableTimeoutError(timeoutLabel));
  }, timeoutMs);
  const abort = () => controller.abort(signal ? abortReasonFor(signal) : void 0);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return {
  signal: controller.signal,
  dispose: () => {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
  };
}
async function fetchWithinAbortScope(url, init, signal) {
  try {
  const response = await fetch(url, { ...init, signal });
  throwIfFetchAborted(signal);
  return response;
  } catch (error) {
  throwIfFetchAborted(signal, error);
  throw error;
  }
}
function throwIfFetchAborted(signal, fallback) {
  if (signal.aborted) throw signal.reason ?? fallback;
}
const DOCS_PREVIEW_HOST = "yomureader.localhost";
const WEB_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
const EXTENSION_PROTOCOLS = /* @__PURE__ */ new Set(["chrome-extension:", "moz-extension:", "safari-web-extension:"]);
const TRUSTED_HTTPS_ORIGIN_KINDS = /* @__PURE__ */ new Map([
  [DOCS_ORIGIN, "docs"],
  [GITHUB_PAGES_ORIGIN, "github-pages"]
]);
const TRUSTED_WEB_HOST_KINDS = /* @__PURE__ */ new Map([
  [DOCS_PREVIEW_HOST, "docs-preview"],
  ["127.0.0.1", "loopback"],
  ["localhost", "loopback"],
  ["[::1]", "loopback"]
]);
const PRIVILEGED_LOCAL_DEVELOPMENT_ORIGINS = /* @__PURE__ */ new Set([]);
function isPrivilegedYomuLocalDevelopmentOrigin(origin) {
  return PRIVILEGED_LOCAL_DEVELOPMENT_ORIGINS.has(origin);
}
function readTrustedYomuUrl(value) {
  let url;
  try {
  url = new URL(value);
  } catch {
  return null;
  }
  if (url.username || url.password) return null;
  const path = normalizeYomuHostedPath(url.pathname);
  const originKind = trustedYomuOriginKind(url, path);
  return originKind ? { url, path, originKind } : null;
}
function normalizeYomuHostedPath(pathname) {
  const normalized = pathname.replace(/\/index\.html$/u, "/");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
function isYomuRepositoryPath(path) {
  return path === `/${APP_REPOSITORY_NAME}/` || path.startsWith(`/${APP_REPOSITORY_NAME}/`);
}
function trustedYomuOriginKind(url, path) {
  return trustedHttpsOriginKind(url, path) ?? trustedWebHostKind(url) ?? trustedExtensionOriginKind(url);
}
function trustedHttpsOriginKind(url, path) {
  const originKind = TRUSTED_HTTPS_ORIGIN_KINDS.get(url.origin);
  if (originKind !== "github-pages") return originKind ?? null;
  return isYomuRepositoryPath(path) ? originKind : null;
}
function trustedWebHostKind(url) {
  if (!WEB_PROTOCOLS.has(url.protocol)) return null;
  return TRUSTED_WEB_HOST_KINDS.get(url.hostname) ?? null;
}
function trustedExtensionOriginKind(url) {
  if (!EXTENSION_PROTOCOLS.has(url.protocol)) return null;
  return url.hostname ? "extension" : null;
}
const SETTINGS_PANEL_IDS = [
  "appearance",
  "backup",
  "api",
  "dictionaries",
  "media",
  "mining",
  "newTab",
  "shortcuts",
  "help"
];
new Set(SETTINGS_PANEL_IDS);
const STUDY_ROUTE_POLICIES = {
  docs: isYomuStudyRoutePath,
  "docs-preview": isYomuStudyRoutePath,
  extension: isYomuStudyRoutePath,
  "github-pages": isRepositoryStudyRoutePath,
  loopback: isLoopbackStudyRoutePath
};
function isYomuNewTabUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  return appUrl ? isTrustedStudyRoute(appUrl) : false;
}
function isYomuStudyRoutePath(pathname) {
  const path = normalizeYomuHostedPath(pathname);
  return path === "/study/" || path === "/newtab/";
}
function isTrustedStudyRoute(appUrl) {
  const { originKind, path } = appUrl;
  return STUDY_ROUTE_POLICIES[originKind](path);
}
function isLoopbackStudyRoutePath(path) {
  return isYomuStudyRoutePath(path) || isRepositoryStudyRoutePath(path);
}
function isRepositoryStudyRoutePath(path) {
  return path === `/${APP_REPOSITORY_NAME}/study/` || path === `/${APP_REPOSITORY_NAME}/newtab/`;
}
const PRIVILEGED_APP_POLICIES = {
  docs: isYomuActiveAppRoute,
  "github-pages": isYomuActiveAppRoute,
  extension: () => false,
  loopback: isPrivilegedLocalAppRoute,
  "docs-preview": isPrivilegedLocalAppRoute
};
function isYomuPrivilegedHostedAppUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  return appUrl ? PRIVILEGED_APP_POLICIES[appUrl.originKind](value, appUrl) : false;
}
function isYomuStorageBridgeHostedUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  if (!appUrl) return false;
  if (appUrl.originKind === "docs" || appUrl.originKind === "github-pages") return true;
  return isYomuPrivilegedHostedAppUrl(value);
}
function isYomuActiveAppRoute(value, appUrl) {
  return isYomuNewTabUrl(value) || isExactHostedAppPath(appUrl, "video-player") || isExactHostedAppPath(appUrl, "pdf-reader") || isExactHostedAppPath(appUrl, "academy");
}
function isPrivilegedLocalAppRoute(value, appUrl) {
  return isPrivilegedYomuLocalDevelopmentOrigin(appUrl.url.origin) && isYomuActiveAppRoute(value, appUrl);
}
function isExactHostedAppPath(appUrl, route) {
  if (appUrl.originKind === "github-pages") {
  return appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`;
  }
  return appUrl.path === `/${route}/` || appUrl.originKind === "loopback" && appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`;
}
function bridgeEventId(event) {
  return safeReadString(normalizedBridgeEventDetail(event), "id");
}
function bridgeProgressEventDetail(event) {
  const detail = normalizedBridgeEventDetail(event);
  const id = safeReadString(detail, "id");
  const loaded = safeReadNumber(detail, "loaded");
  if (!id || loaded === void 0) return void 0;
  return {
  id,
  loaded,
  total: safeReadNumber(detail, "total") ?? 0,
  lengthComputable: safeReadProperty(detail, "lengthComputable") === true
  };
}
function bridgeResponseEventDetail(event) {
  const detail = normalizedBridgeEventDetail(event);
  const id = safeReadString(detail, "id");
  const kind = safeReadString(detail, "kind");
  if (!id || kind !== "load" && kind !== "error" && kind !== "timeout") return void 0;
  return {
  id,
  kind,
  response: safeReadProperty(detail, "response"),
  message: safeReadString(detail, "message")
  };
}
function bridgeEventDetail(detail) {
  if (detail === void 0) return void 0;
  const json = bridgeEventJsonDetail(detail);
  return json ?? detail;
}
function bridgeEventJsonDetail(detail) {
  let unsupported = false;
  try {
  const json = JSON.stringify(detail, (_key, value) => {
    if (isUnsupportedBridgeJsonValue(value)) {
      unsupported = true;
      return void 0;
    }
    return value;
  });
  return unsupported || typeof json !== "string" ? void 0 : json;
  } catch {
  return void 0;
  }
}
function normalizedBridgeEventDetail(event) {
  const detail = safeEventDetail(event);
  if (typeof detail !== "string") return detail;
  try {
  return JSON.parse(detail);
  } catch {
  return detail;
  }
}
function isUnsupportedBridgeJsonValue(value) {
  return isUnsupportedPrimitiveBridgeJsonValue(value) || isArrayBufferBridgeJsonValue(value) || isBlobBridgeJsonValue(value) || isFormDataBridgeJsonValue(value);
}
function isUnsupportedPrimitiveBridgeJsonValue(value) {
  return typeof value === "function" || typeof value === "symbol";
}
function isArrayBufferBridgeJsonValue(value) {
  if (typeof ArrayBuffer === "undefined") return false;
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}
function isBlobBridgeJsonValue(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}
function isFormDataBridgeJsonValue(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}
function safeEventDetail(event) {
  try {
  return event.detail;
  } catch {
  return void 0;
  }
}
function safeReadProperty(source, key) {
  if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
  try {
  return source[key];
  } catch {
  return void 0;
  }
}
function safeReadString(source, key) {
  const value = safeReadProperty(source, key);
  return typeof value === "string" ? value : void 0;
}
function safeReadNumber(source, key) {
  const value = safeReadProperty(source, key);
  return typeof value === "number" ? value : void 0;
}
function userscriptRequestCandidates() {
  const candidates = [];
  const add = (request, thisArg) => {
  candidates.push({ request, thisArg });
  };
  const direct = directUserscriptGlobals();
  add(direct.GM_xmlhttpRequest, globalThis);
  add(direct.GM?.xmlHttpRequest, direct.GM);
  add(direct.GM?.xmlhttpRequest, direct.GM);
  for (const source of userscriptRequestSources()) {
  add(readSourceProperty(source, "GM_xmlhttpRequest"), source);
  const gm = readSourceProperty(source, "GM");
  add(readSourceProperty(gm, "xmlHttpRequest"), gm);
  add(readSourceProperty(gm, "xmlhttpRequest"), gm);
  }
  return candidates;
}
function asUserscriptRequest(value) {
  return typeof value === "function" ? value : void 0;
}
function isPromiseLike$1(value) {
  return Boolean(value) && typeof value.then === "function";
}
function directUserscriptGlobals() {
  return {
  GM_xmlhttpRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : void 0,
  GM: typeof GM === "object" && GM ? GM : void 0
  };
}
function userscriptRequestSources() {
  const sources = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (value) => {
  if (!isRequestSource(value) || seen.has(value)) return;
  seen.add(value);
  sources.push(value);
  };
  for (const mounted of mountedMonkeyWindows()) add(mounted);
  add(globalThis);
  if (typeof window !== "undefined") add(window);
  return sources;
}
function mountedMonkeyWindows() {
  if (typeof document === "undefined") return [];
  return Object.getOwnPropertyNames(document).filter((key) => key.startsWith("__monkeyWindow-")).map((key) => readSourceProperty(document, key)).filter(isRequestSource);
}
function isRequestSource(value) {
  return Boolean(value) && (typeof value === "object" || typeof value === "function");
}
function readSourceProperty(source, key) {
  if (!isRequestSource(source)) return void 0;
  try {
  return source[key];
  } catch {
  return void 0;
  }
}
let initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
let initialWindowAddEventListener = initialWindowMethod("addEventListener");
let initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
function createWindowCustomEvent(type, detail, init = {}) {
  const eventInit = { ...init, detail: cloneCustomEventDetail(detail) };
  const documentEvent = createDocumentCustomEvent(type, eventInit);
  if (documentEvent) return documentEvent;
  const CustomEventConstructor = eventConstructor(window, "CustomEvent") ?? eventConstructor(globalThis, "CustomEvent");
  if (CustomEventConstructor) {
  try {
    return new CustomEventConstructor(type, eventInit);
  } catch {
  }
  }
  throw new Error(`Unable to create window custom event: ${type}`);
}
function cloneCustomEventDetail(detail) {
  if (detail === void 0 || typeof window === "undefined") return detail;
  const cloneInto = readMethod(globalThis, "cloneInto");
  if (!cloneInto) return detail;
  try {
  return cloneInto(detail, window, { cloneFunctions: false, wrapReflectors: true });
  } catch {
  try {
    return JSON.stringify(detail);
  } catch {
    return void 0;
  }
  }
}
function dispatchWindowEvent(event) {
  const target = window;
  const directDispatch = readMethod(target, "dispatchEvent");
  const directResult = callEventTargetMethod(directDispatch, target, event);
  if (directResult.called) return directResult.result;
  const initialResult = initialWindowDispatchEvent === directDispatch ? { called: false } : callEventTargetMethod(initialWindowDispatchEvent, target, event);
  if (initialResult.called) return initialResult.result;
  const prototypeResult = dispatchWithPrototypeMethod(target, directDispatch, event);
  if (prototypeResult.called) return prototypeResult.result;
  const unshadowedResult = callWithUnshadowedWindowDispatch(event);
  if (unshadowedResult.called) return unshadowedResult.result;
  return false;
}
function addWindowEventListener(type, listener, options) {
  const target = window;
  const directAdd = readMethod(target, "addEventListener");
  const directResult = callAddEventListener$2(directAdd, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowAddEventListener === directAdd ? { called: false } : callAddEventListener$2(initialWindowAddEventListener, target, type, listener, options);
  if (initialResult.called) return true;
  const prototypeResult = addListenerWithPrototypeMethod(target, directAdd, type, listener, options);
  if (prototypeResult.called) return true;
  const unshadowedResult = callWithUnshadowedWindowAddEventListener(type, listener, options);
  if (unshadowedResult.called) return true;
  return false;
}
function removeWindowEventListener(type, listener, options) {
  const target = window;
  const directRemove = readMethod(target, "removeEventListener");
  const directResult = callRemoveEventListener$2(directRemove, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowRemoveEventListener === directRemove ? { called: false } : callRemoveEventListener$2(initialWindowRemoveEventListener, target, type, listener, options);
  if (initialResult.called) return true;
  const prototypeResult = removeListenerWithPrototypeMethod(target, directRemove, type, listener, options);
  if (prototypeResult.called) return true;
  const unshadowedResult = callWithUnshadowedWindowRemoveEventListener(type, listener, options);
  if (unshadowedResult.called) return true;
  return false;
}
function initialWindowMethod(key) {
  if (typeof window === "undefined") return void 0;
  return readMethod(window, key);
}
function dispatchWithPrototypeMethod(target, directDispatch, event) {
  for (const prototypeDispatch of eventTargetPrototypeMethods(target, "dispatchEvent")) {
  if (prototypeDispatch === directDispatch) continue;
  const result = callEventTargetMethod(prototypeDispatch, target, event);
  if (result.called) return result;
  }
  return { called: false };
}
function addListenerWithPrototypeMethod(target, directAdd, type, listener, options) {
  for (const prototypeAdd of eventTargetPrototypeMethods(target, "addEventListener")) {
  if (prototypeAdd === directAdd) continue;
  const result = callAddEventListener$2(prototypeAdd, target, type, listener, options);
  if (result.called) return result;
  }
  return { called: false };
}
function removeListenerWithPrototypeMethod(target, directRemove, type, listener, options) {
  for (const prototypeRemove of eventTargetPrototypeMethods(target, "removeEventListener")) {
  if (prototypeRemove === directRemove) continue;
  const result = callRemoveEventListener$2(prototypeRemove, target, type, listener, options);
  if (result.called) return result;
  }
  return { called: false };
}
function eventConstructor(source, key) {
  const value = readProperty(source, key);
  return typeof value === "function" ? value : void 0;
}
function createDocumentCustomEvent(type, init) {
  if (typeof document === "undefined" || typeof document.createEvent !== "function") return void 0;
  try {
  const event = document.createEvent("CustomEvent");
  event.initCustomEvent(type, Boolean(init.bubbles), Boolean(init.cancelable), init.detail);
  return event;
  } catch {
  return void 0;
  }
}
function eventTargetPrototypeMethods(target, key) {
  const methods = [];
  const add = (method) => {
  if (method && !methods.includes(method)) methods.push(method);
  };
  let prototype = Object.getPrototypeOf(target);
  while (prototype) {
  add(readOwnMethod(prototype, key));
  prototype = Object.getPrototypeOf(prototype);
  }
  const WindowEventTarget = readProperty(window, "EventTarget");
  add(readMethod(WindowEventTarget?.prototype, key));
  if (typeof EventTarget !== "undefined") add(readMethod(EventTarget.prototype, key));
  return methods;
}
function readMethod(source, key) {
  const value = readProperty(source, key);
  return typeof value === "function" ? value : void 0;
}
function readOwnMethod(source, key) {
  if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
  if (!Object.prototype.hasOwnProperty.call(source, key)) return void 0;
  return readMethod(source, key);
}
function readProperty(source, key) {
  if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
  return attempt(() => source[key], void 0, "window-events.readProperty");
}
function callEventTargetMethod(method, target, event) {
  if (!method) return { called: false };
  try {
  return { called: true, result: method.call(target, event) };
  } catch (error) {
  return { called: false, error };
  }
}
function callAddEventListener$2(method, target, type, listener, options) {
  if (!method) return { called: false };
  try {
  method.call(target, type, listener, options);
  return { called: true };
  } catch (error) {
  return { called: false, error };
  }
}
function callRemoveEventListener$2(method, target, type, listener, options) {
  if (!method) return { called: false };
  try {
  method.call(target, type, listener, options);
  return { called: true };
  } catch (error) {
  return { called: false, error };
  }
}
function callWithUnshadowedWindowDispatch(event) {
  const target = window.wrappedJSObject || window;
  const descriptor = safeWindowPropertyDescriptor("dispatchEvent");
  if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
  try {
  if (!Reflect.deleteProperty(target, "dispatchEvent")) return { called: false };
  return callEventTargetMethod(readMethod(window, "dispatchEvent"), window, event);
  } catch (error) {
  return { called: false, error };
  } finally {
  restoreWindowProperty("dispatchEvent", descriptor);
  }
}
function callWithUnshadowedWindowAddEventListener(type, listener, options) {
  const target = window.wrappedJSObject || window;
  const descriptor = safeWindowPropertyDescriptor("addEventListener");
  if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
  try {
  if (!Reflect.deleteProperty(target, "addEventListener")) return { called: false };
  return callAddEventListener$2(readMethod(window, "addEventListener"), window, type, listener, options);
  } catch (error) {
  return { called: false, error };
  } finally {
  restoreWindowProperty("addEventListener", descriptor);
  }
}
function callWithUnshadowedWindowRemoveEventListener(type, listener, options) {
  const target = window.wrappedJSObject || window;
  const descriptor = safeWindowPropertyDescriptor("removeEventListener");
  if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
  try {
  if (!Reflect.deleteProperty(target, "removeEventListener")) return { called: false };
  return callRemoveEventListener$2(readMethod(window, "removeEventListener"), window, type, listener, options);
  } catch (error) {
  return { called: false, error };
  } finally {
  restoreWindowProperty("removeEventListener", descriptor);
  }
}
function restoreWindowProperty(key, descriptor) {
  attemptVoid(() => {
  const target = window.wrappedJSObject || window;
  Object.defineProperty(target, key, pageCompartmentDescriptor(normalizedPropertyDescriptor(descriptor), target));
  }, "window-events.restoreWindowProperty");
}
function pageCompartmentDescriptor(descriptor, _target) {
  return pageCompartmentValue(descriptor, { cloneFunctions: true, wrapReflectors: true });
}
function pageCompartmentValue(value, options = {}) {
  const cloneInto = readMethod(globalThis, "cloneInto");
  if (!cloneInto || typeof window === "undefined") return value;
  try {
  return cloneInto(value, window, options);
  } catch {
  return value;
  }
}
function safeWindowPropertyDescriptor(key) {
  try {
  const target = window.wrappedJSObject || window;
  return Object.getOwnPropertyDescriptor(target, key);
  } catch {
  return void 0;
  }
}
function shouldTemporarilyUnshadowWindowProperty(descriptor) {
  if (!descriptor) return false;
  return attempt(() => typeof descriptor.value !== "function", false, "window-events.shouldTemporarilyUnshadowWindowProperty");
}
function normalizedPropertyDescriptor(descriptor) {
  const hasDataShape = Object.prototype.hasOwnProperty.call(descriptor, "value") || Object.prototype.hasOwnProperty.call(descriptor, "writable");
  const hasAccessorShape = Object.prototype.hasOwnProperty.call(descriptor, "get") || Object.prototype.hasOwnProperty.call(descriptor, "set");
  if (!hasDataShape || !hasAccessorShape) return descriptor;
  try {
  return {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    value: descriptor.value,
    writable: descriptor.writable
  };
  } catch {
  return {
    configurable: true,
    value: void 0,
    writable: true
  };
  }
}
function userscriptGmApi() {
  const lexical = typeof GM === "object" && GM ? GM : void 0;
  return lexical ?? globalRecord("GM");
}
function userscriptGmInfo() {
  const lexical = typeof GM_info === "object" && GM_info ? GM_info : void 0;
  return lexical ?? globalRecord("GM_info") ?? userscriptGmApi()?.info;
}
function globalRecord(name) {
  const value = globalThis[name];
  return value && typeof value === "object" ? value : void 0;
}
function extensionRuntimeMayBeYomu() {
  return false;
}
const INSTALLED_READER_RUNTIME_MARKER_ID = "jpdb-reader-installed-runtime";
function detectInstalledReaderRuntime(globals = globalThis) {
  return userscriptManagerApi(globals) ? "userscript" : null;
}
function userscriptManagerApi(globals) {
  const ambient = globals === globalThis;
  const gm = ambient ? userscriptGmApi() : globals.GM;
  return ambient && typeof GM_getValue === "function" || typeof globals.GM_getValue === "function" || typeof gm?.getValue === "function" || typeof gm?.xmlHttpRequest === "function" || typeof gm?.xmlhttpRequest === "function" || Boolean(ambient ? userscriptGmInfo() : globals.GM_info);
}
function announcedInstalledReaderRuntime(root = document) {
  const kind = root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset?.yomuInstalledRuntimeKind;
  return kind === "extension" || kind === "userscript" ? kind : null;
}
function expectedBridgeKind(trustedPage) {
  if (detectInstalledReaderRuntime()) return null;
  const announced = announcedInstalledReaderRuntime();
  return announced && trustedPage() ? announced : null;
}
function readyBridgeOwner(dataset, keys, expected) {
  if (dataset?.[keys.ready] !== "true") return null;
  const kind = dataset[keys.kind];
  if (kind === "extension" || kind === "userscript") {
  if (expected && kind !== expected && kind !== "extension") return null;
  return { ownerId: dataset[keys.owner], kind };
  }
  return { ownerId: dataset[keys.owner], kind: expected ?? "userscript" };
}
const MANAGED_STORAGE_KEY_PREFIXES = [
  "yomu-",
  "yomu:",
  "yomu.",
  // Yomu-internal redirect handoff keys use a leading double underscore.
  // Factory reset clears hosted web storage by managed prefix, so include it.
  "__yomu",
  "jpdb-reader-",
  "jpdb-popup-reader-"
];
const MANAGED_STATE_SLOT_KEY_PREFIX = "yomu:state-slot:v1:";
const MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX = "yomu:web-storage-slot:v1:";
const MANAGED_SLOT_KEY_PREFIXES = [
  MANAGED_STATE_SLOT_KEY_PREFIX,
  MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX
];
function isManagedStorageKey(key) {
  return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function isPrivateManagedStorageKey(key) {
  return logicalManagedStorageKey(key)?.startsWith("yomu:private:") === true;
}
function logicalManagedStorageKey(key) {
  const prefix = MANAGED_SLOT_KEY_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (!prefix) return key;
  const encoded = key.slice(prefix.length);
  const separator = encoded.indexOf(":");
  if (separator < 1 || separator === encoded.length - 1) return null;
  try {
  const logicalKey = decodeURIComponent(encoded.slice(separator + 1));
  return logicalKey && !isManagedStorageSlotKey(logicalKey) && isManagedStorageKey(logicalKey) ? logicalKey : null;
  } catch {
  return null;
  }
}
function isManagedStorageSlotKey(key) {
  return MANAGED_SLOT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}
const BRIDGE_REQUEST_EVENT$1 = "yomu-userscript-storage-request";
const BRIDGE_RESPONSE_EVENT$1 = "yomu-userscript-storage-response";
const BRIDGE_MARKER$1 = "yomuUserscriptStorageBridge";
const BRIDGE_OWNER = "yomuStorageBridgeOwner";
const BRIDGE_KIND = "yomuStorageBridgeKind";
const BRIDGE_KEYS$1 = { ready: BRIDGE_MARKER$1, owner: BRIDGE_OWNER, kind: BRIDGE_KIND };
const EXTENSION_STORAGE_BRIDGE_MARKER = "yomuExtensionStorageBridge";
const EXTENSION_STORAGE_TARGET = "extension-storage";
const BRIDGE_TIMEOUT_MS$1 = 1e4;
let clientOwner$1;
function getUserscriptGmStorage() {
  if (!storageBridgeClientAvailable()) return void 0;
  clientOwner$1 ??= pinnableOwner(readyBridgeOwner(bridgeMarkerDataset$1(), BRIDGE_KEYS$1, expectedStorageBridgeKind()));
  const request = (detail) => storageBridgeRequest(detail);
  return {
  getValue: (key, fallback) => request({ op: "get", key }).then((detail) => detail.found ? detail.value : fallback),
  setValue: (key, value) => request({ op: "set", key, value }).then(() => void 0),
  deleteValue: (key) => request({ op: "delete", key }).then(() => void 0),
  listValues: () => request({ op: "list" }).then((detail) => detail.keys ?? []),
  clearPrivateManagedValues: () => request({ op: "clear-private-managed" }).then(() => void 0),
  clearLegacyExtensionManagedValues: () => extensionStorageBridgeAdvertised() ? request({
    op: "clear-legacy-extension-managed",
    target: EXTENSION_STORAGE_TARGET
  }).then(() => void 0) : Promise.resolve()
  };
}
function storageBridgeClientAvailable() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return Boolean(clientOwner$1 || expectedStorageBridgeKind() || readyBridgeOwner(bridgeMarkerDataset$1(), BRIDGE_KEYS$1, null));
}
function expectedStorageBridgeKind() {
  return expectedBridgeKind(shouldInstallUserscriptStorageBridge);
}
function installedStorageResponderReady() {
  return readyBridgeOwner(bridgeMarkerDataset$1(), BRIDGE_KEYS$1, expectedStorageBridgeKind()) !== null;
}
function storageBridgeRequest(request) {
  return new Promise((resolve, reject) => {
  const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let pinned;
  let cleanupListeners = noop$1;
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanupListeners();
  };
  const fail = (message) => {
    cleanup();
    reject(new Error(message));
  };
  const timeout = window.setTimeout(() => {
    if (!pinned) fail("Installed Yomu storage did not connect; reload to reconnect.");
    else if (!pinnedOwnerCurrent(pinned)) fail("Storage bridge authority changed during the request.");
    else fail("Storage bridge request timed out.");
  }, BRIDGE_TIMEOUT_MS$1);
  const onResponse = (event) => {
    const detail = storageBridgeResponseDetail(event);
    if (!detail || detail.id !== id) return;
    if (!pinned || !pinnedOwnerCurrent(pinned)) return fail("Storage bridge authority changed during the request.");
    cleanup();
    if (detail.ok) resolve(detail);
    else reject(new Error(detail.message || "Storage bridge request failed."));
  };
  const send = (owner) => {
    pinned = owner;
    cleanupListeners();
    cleanupListeners = addBridgeEventListener$1(BRIDGE_RESPONSE_EVENT$1, onResponse);
    dispatchBridgeEvent$1(BRIDGE_REQUEST_EVENT$1, { id, ownerId: owner.ownerId, ...request });
  };
  const connect = () => {
    if (clientOwner$1) {
      if (pinnedOwnerCurrent(clientOwner$1)) send(clientOwner$1);
      else fail("Storage bridge authority changed; reload to reconnect.");
      return true;
    }
    const owner = readyBridgeOwner(bridgeMarkerDataset$1(), BRIDGE_KEYS$1, expectedStorageBridgeKind());
    if (!owner) return false;
    clientOwner$1 = pinnableOwner(owner);
    send(owner);
    return true;
  };
  if (connect()) return;
  cleanupListeners = addBridgeEventListener$1(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, () => {
    if (!pinned) connect();
  });
  });
}
function pinnableOwner(owner) {
  return owner?.ownerId === void 0 ? void 0 : owner;
}
function pinnedOwnerCurrent(owner) {
  const dataset = bridgeMarkerDataset$1();
  return dataset?.[BRIDGE_MARKER$1] === "true" && dataset[BRIDGE_OWNER] === owner.ownerId;
}
function shouldInstallUserscriptStorageBridge() {
  try {
  return typeof location !== "undefined" && isYomuStorageBridgeHostedUrl(location.href);
  } catch {
  return false;
  }
}
function storageBridgeResponseDetail(event) {
  const detail = normalizedBridgeEventDetail(event);
  if (!detail || typeof detail !== "object") return void 0;
  const record2 = detail;
  if (typeof record2.id !== "string" || typeof record2.ok !== "boolean") return void 0;
  return {
  id: record2.id,
  ok: record2.ok,
  found: typeof record2.found === "boolean" ? record2.found : void 0,
  value: record2.value,
  keys: Array.isArray(record2.keys) ? record2.keys.filter((key) => typeof key === "string") : void 0,
  message: typeof record2.message === "string" ? record2.message : void 0
  };
}
function extensionStorageBridgeAdvertised() {
  return bridgeMarkerDataset$1()?.[EXTENSION_STORAGE_BRIDGE_MARKER] === "true";
}
function addBridgeEventListener$1(type, listener) {
  const cleanups = [];
  if (addWindowEventListener(type, listener)) {
  cleanups.push(() => removeWindowEventListener(type, listener));
  }
  const documentTarget = bridgeDocumentTarget$1();
  if (documentTarget && callAddEventListener$1(documentTarget, type, listener)) {
  cleanups.push(() => callRemoveEventListener$1(documentTarget, type, listener));
  }
  return () => {
  for (const cleanup of cleanups) cleanup();
  };
}
function dispatchBridgeEvent$1(type, detail) {
  const eventDetail = bridgeEventDetail(detail);
  let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
  const documentTarget = bridgeDocumentTarget$1();
  if (documentTarget) {
  dispatched = callDispatchEvent$1(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
  }
  return dispatched;
}
function bridgeDocumentTarget$1() {
  if (typeof document === "undefined") return void 0;
  return document.documentElement instanceof HTMLElement ? document.documentElement : void 0;
}
function bridgeMarkerDataset$1() {
  if (typeof document === "undefined") return void 0;
  const root = document.documentElement;
  return root?.dataset;
}
function callAddEventListener$1(target, type, listener) {
  try {
  target.addEventListener(type, listener);
  return true;
  } catch {
  return false;
  }
}
function callRemoveEventListener$1(target, type, listener) {
  try {
  target.removeEventListener(type, listener);
  } catch {
  }
}
function callDispatchEvent$1(target, event) {
  try {
  return target.dispatchEvent(event);
  } catch {
  return false;
  }
}
function noop$1() {
}
const BRIDGE_REQUEST_EVENT = "yomu-userscript-http-request";
const BRIDGE_RESPONSE_EVENT = "yomu-userscript-http-response";
const BRIDGE_PROBE_EVENT = "yomu-userscript-http-probe";
const BRIDGE_PROBE_RESPONSE_EVENT = "yomu-userscript-http-probe-response";
const BRIDGE_PROGRESS_EVENT = "yomu-userscript-http-progress";
const BRIDGE_MARKER = "yomuUserscriptHttpBridge";
const BRIDGE_KEYS = { ready: BRIDGE_MARKER, owner: "yomuHttpBridgeOwner", kind: "yomuHttpBridgeKind" };
const BRIDGE_TIMEOUT_MS = 3e4;
const BRIDGE_READY_TIMEOUT_MS = 1e4;
const USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS = 120;
let clientOwner;
let eventBridgeProbeInFlight;
function getUserscriptHttpRequest() {
  for (const candidate of userscriptRequestCandidates()) {
  const request = asUserscriptRequest(candidate.request);
  if (request) {
    return request.bind(candidate.thisArg);
  }
  }
  return userscriptHttpEventBridge();
}
function shouldInstallUserscriptHttpBridge() {
  try {
  return typeof location !== "undefined" && isYomuPrivilegedHostedAppUrl(location.href);
  } catch {
  return false;
  }
}
const EVENT_BRIDGE_TAG = Symbol.for("yomu.userscriptEventBridge");
function isUserscriptEventBridgeRequest(request) {
  return typeof request === "function" && request[EVENT_BRIDGE_TAG] === true;
}
function probeUserscriptEventBridge(request) {
  if (!isUserscriptEventBridgeRequest(request)) return Promise.resolve(true);
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (eventBridgeProbeInFlight) return eventBridgeProbeInFlight;
  const current = currentHttpBridgeOwner();
  const probe = current !== void 0 ? current ? probeHttpBridgeOwner(current) : Promise.resolve(false) : httpBridgeOwner().then((owner) => owner ? probeHttpBridgeOwner(owner) : false);
  eventBridgeProbeInFlight = probe;
  void probe.then(() => {
  if (eventBridgeProbeInFlight === probe) eventBridgeProbeInFlight = void 0;
  });
  return probe;
}
function probeHttpBridgeOwner(owner) {
  return new Promise((resolve) => {
  const id = `yomu-probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let settled = false;
  let responseCleanup = noop;
  const finish = (alive) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    responseCleanup();
    if (!alive) {
      const markerDataset = bridgeMarkerDataset();
      if (markerDataset?.[BRIDGE_MARKER] === "true") delete markerDataset[BRIDGE_MARKER];
    }
    resolve(alive);
  };
  const timeout = window.setTimeout(() => finish(false), USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS);
  responseCleanup = addBridgeEventListener(BRIDGE_PROBE_RESPONSE_EVENT, (event) => {
    if (bridgeEventId(event) === id) finish(true);
  });
  dispatchBridgeEvent(BRIDGE_PROBE_EVENT, { id, ownerId: owner.ownerId });
  });
}
function httpBridgeOwner() {
  const current = currentHttpBridgeOwner();
  if (current !== void 0) return Promise.resolve(current);
  return new Promise((resolve) => {
  const cleanups = [];
  const settle = (owner) => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    resolve(owner);
  };
  const recheck = () => {
    const owner = currentHttpBridgeOwner();
    if (owner !== void 0) settle(owner);
  };
  const timeout = window.setTimeout(() => settle(null), BRIDGE_READY_TIMEOUT_MS);
  cleanups.push(() => window.clearTimeout(timeout));
  cleanups.push(addBridgeEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, recheck));
  cleanups.push(addBridgeEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, () => {
    const later = window.setTimeout(recheck, 0);
    cleanups.push(() => window.clearTimeout(later));
  }));
  });
}
function currentHttpBridgeOwner() {
  const dataset = bridgeMarkerDataset();
  if (clientOwner) {
  return dataset?.[BRIDGE_MARKER] === "true" && dataset[BRIDGE_KEYS.owner] === clientOwner.ownerId ? clientOwner : null;
  }
  const expected = expectedHttpBridgeKind();
  const owner = readyBridgeOwner(dataset, BRIDGE_KEYS, expected);
  if (owner?.ownerId) clientOwner = owner;
  if (owner) return owner;
  return expected && !installedStorageResponderReady() ? void 0 : null;
}
function expectedHttpBridgeKind() {
  return expectedBridgeKind(shouldInstallUserscriptHttpBridge);
}
function userscriptHttpEventBridge() {
  if (typeof window === "undefined" || typeof document === "undefined") return void 0;
  if (currentHttpBridgeOwner() === null) return void 0;
  return tagEventBridgeRequest((options) => new Promise((resolve, reject) => {
  const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const onTimeout = () => {
    cleanup();
    options.ontimeout?.();
    reject(new Error("Request timed out."));
  };
  let timeout = window.setTimeout(onTimeout, options.timeout ?? BRIDGE_TIMEOUT_MS);
  let cleanupBridgeListeners = noop;
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanupBridgeListeners();
  };
  const onResponse = (event) => {
    handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
  };
  const onProgress = (event) => {
    const progress = bridgeProgressEventDetail(event);
    if (progress?.id !== id) return;
    window.clearTimeout(timeout);
    timeout = window.setTimeout(onTimeout, options.timeout ?? BRIDGE_TIMEOUT_MS);
    options.onprogress?.(progress);
  };
  void httpBridgeOwner().then((owner) => {
    if (!owner) {
      cleanup();
      const error = new Error("Installed Yomu request bridge is unavailable; reload to reconnect.");
      options.onerror?.(error);
      reject(error);
      return;
    }
    const reportProgress = typeof options.onprogress === "function";
    const cleanups = [addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse)];
    if (reportProgress) cleanups.push(addBridgeEventListener(BRIDGE_PROGRESS_EVENT, onProgress));
    cleanupBridgeListeners = () => cleanups.forEach((cleanupListener) => cleanupListener());
    dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, {
      id,
      ownerId: owner.ownerId,
      options: { ...withoutCallbacks(options), ...reportProgress ? { reportProgress: true } : {} }
    });
  });
  }));
}
function withoutCallbacks(options) {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value !== "function"));
}
function tagEventBridgeRequest(request) {
  request[EVENT_BRIDGE_TAG] = true;
  return request;
}
function handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject) {
  const detail = bridgeResponseEventDetail(event);
  if (!detail || detail.id !== id) return;
  cleanup();
  if (detail.kind === "load" && detail.response) {
  options.onload?.(detail.response);
  resolve(detail.response);
  return;
  }
  rejectBridgeResponse(detail, options, reject);
}
function rejectBridgeResponse(detail, options, reject) {
  const message = detail.message || "Request failed.";
  if (detail.kind === "timeout") options.ontimeout?.();
  else options.onerror?.(new Error(message));
  reject(new Error(message));
}
function addBridgeEventListener(type, listener) {
  const cleanups = [];
  if (addWindowEventListener(type, listener)) {
  cleanups.push(() => removeWindowEventListener(type, listener));
  }
  const documentTarget = bridgeDocumentTarget();
  if (documentTarget && callAddEventListener(documentTarget, type, listener)) {
  cleanups.push(() => callRemoveEventListener(documentTarget, type, listener));
  }
  return () => {
  for (const cleanup of cleanups) cleanup();
  };
}
function dispatchBridgeEvent(type, detail) {
  const eventDetail = bridgeEventDetail(detail);
  let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
  const documentTarget = bridgeDocumentTarget();
  if (documentTarget) {
  dispatched = callDispatchEvent(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
  }
  return dispatched;
}
function bridgeDocumentTarget() {
  if (typeof document === "undefined") return void 0;
  return document.documentElement instanceof HTMLElement ? document.documentElement : void 0;
}
function bridgeMarkerDataset() {
  if (typeof document === "undefined") return void 0;
  const root = document.documentElement;
  return root?.dataset;
}
function callAddEventListener(target, type, listener) {
  try {
  target.addEventListener(type, listener);
  return true;
  } catch {
  return false;
  }
}
function callRemoveEventListener(target, type, listener) {
  try {
  target.removeEventListener(type, listener);
  } catch {
  }
}
function callDispatchEvent(target, event) {
  try {
  return target.dispatchEvent(event);
  } catch {
  return false;
  }
}
function noop() {
}
function requestViaUserscriptManager(request, config) {
  return new Promise((resolve, reject) => {
  const signal = config.signal;
  if (signal?.aborted) {
    reject(abortReason(config));
    return;
  }
  let handle;
  let aborted = false;
  const tryAbort = () => {
    if (aborted) return;
    aborted = true;
    try {
      handle?.abort?.();
    } catch {
    }
  };
  let settled = false;
  let deadline;
  const finish = (settle) => {
    if (settled) return;
    settled = true;
    if (deadline !== void 0) clearTimeout(deadline);
    if (signal) signal.removeEventListener("abort", onAbort);
    try {
      settle();
    } catch (error) {
      reject(error);
    }
  };
  const handleLoad = (response) => finish(() => {
    resolve(config.readResponse(response));
  });
  const handleError = (error) => finish(() => reject(errorReason(config, error)));
  const handleTimeout = () => {
    finish(() => reject(timeoutReason(config)));
    tryAbort();
  };
  const onAbort = () => {
    finish(() => reject(abortReason(config)));
    tryAbort();
  };
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  deadline = setTimeout(handleTimeout, localDeadlineMs(config));
  const reportProgress = config.details.onprogress;
  const onprogress = reportProgress === void 0 ? void 0 : (event) => {
    if (!settled) {
      if (deadline !== void 0) clearTimeout(deadline);
      deadline = setTimeout(handleTimeout, localDeadlineMs(config));
    }
    reportProgress(event);
  };
  try {
    const result = request({
      ...config.details,
      ...onprogress === void 0 ? {} : { onprogress },
      onload: handleLoad,
      onerror: handleError,
      ontimeout: handleTimeout
    });
    if (result && typeof result.abort === "function") {
      handle = result;
    }
    if (isPromiseLike$1(result)) result.then(handleLoad, handleError);
  } catch (error) {
    handleError(error);
  }
  });
}
const DROPPED_CALLBACK_DEADLINE_MS = 12e4;
function localDeadlineMs(config) {
  const budget = config.deadlineMs ?? config.details.timeout;
  return budget && budget > 0 ? budget : DROPPED_CALLBACK_DEADLINE_MS;
}
function errorReason(config, error) {
  if (config.onError) return config.onError(error);
  return error instanceof Error ? error : new Error("Request failed.");
}
function timeoutReason(config) {
  return config.onTimeout ? config.onTimeout() : new Error("Request timed out.");
}
function abortReason(config) {
  if (config.onAbort) return config.onAbort();
  if (typeof DOMException === "function") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
async function requestHttp(url, options = {}) {
  let userscriptRequest = getUserscriptHttpRequest();
  if (userscriptRequest && isUserscriptEventBridgeRequest(userscriptRequest)) {
  const bridgeIsAlive = await probeUserscriptEventBridge(userscriptRequest);
  if (!bridgeIsAlive) userscriptRequest = void 0;
  }
  if (options.preferFetch && (!userscriptRequest || isSameOriginUrl(url) || window.__YOMU_READER_RUNTIME__ === "newtab" && options.responseType === "blob")) {
  try {
    return await requestViaFetch(url, options, userscriptRequest ?? null);
  } catch (error) {
    if (!userscriptRequest) throw error;
    return await requestViaUserscript(url, options, userscriptRequest);
  }
  }
  if (userscriptRequest) {
  try {
    return await requestViaUserscript(url, options, userscriptRequest);
  } catch (error) {
    if (!shouldRetryWithFetch(error) && !shouldRetryEventBridgeFailureWithFetch(userscriptRequest, error)) throw error;
    userscriptRequest = void 0;
  }
  }
  return requestViaFetch(url, browserFetchFallbackOptions(url, options, userscriptRequest), userscriptRequest ?? null);
}
function requestViaUserscript(url, options, userscriptRequest) {
  return requestViaUserscriptManager(userscriptRequest, {
  details: {
    method: options.method ?? "GET",
    url,
    headers: recordHeaders(options.headers),
    data: options.data,
    responseType: options.responseType,
    timeout: options.timeoutMs,
    anonymous: options.anonymous,
    withCredentials: options.withCredentials,
    cookie: options.cookie
  },
  deadlineMs: options.timeoutMs,
  signal: options.signal ?? void 0,
  readResponse: (response) => {
    if (response.status < 200 || response.status >= 300) throw new Error(formatStatusFailure(options, response.status));
    return normalizeUserscriptResponse(response, options.responseType ?? "text");
  },
  onError: (error) => error instanceof Error ? error : new Error(formatFailure(options)),
  // Typed like the page fetch's own timeout, so a caller can tell a host
  // that stopped answering from one that refused, whatever the label says.
  onTimeout: () => new RetryableTimeoutError(options.timeoutLabel ?? `${options.failureLabel ?? "Request"} timed out.`)
  });
}
function normalizeUserscriptResponse(response, responseType) {
  return USERSCRIPT_RESPONSE_NORMALIZERS[responseType]?.(response) ?? userscriptTextResponse(response);
}
const USERSCRIPT_RESPONSE_NORMALIZERS = {
  blob: (response) => response.response,
  arraybuffer: (response) => response.response,
  json: userscriptJsonResponse,
  text: userscriptTextResponse
};
function userscriptJsonResponse(response) {
  return response.response !== void 0 && typeof response.response !== "string" ? response.response : JSON.parse(String(response.responseText ?? response.response ?? "null"));
}
function userscriptTextResponse(response) {
  return String(response.responseText ?? response.response ?? "");
}
function hostedFallbackProxyUrl(url, options = {}, userscriptRequest = getUserscriptHttpRequest() ?? null) {
  if (userscriptRequest) return "";
  if (!isSharedPublicProxySafeRequest(url, options)) return "";
  return YOMU_SHARED_PUBLIC_PROXY_URL;
}
async function requestViaFetch(url, options, userscriptRequest = getUserscriptHttpRequest() ?? null) {
  const response = await fetchWithCorsFallbacks(url, (options.proxyUrl ?? "").trim() || hostedFallbackProxyUrl(url, options, userscriptRequest), {
  method: options.method ?? "GET",
  headers: options.headers,
  body: options.data,
  credentials: options.credentials ?? "omit",
  redirect: options.redirect ?? "follow",
  referrerPolicy: options.referrerPolicy ?? "no-referrer",
  timeoutMs: options.timeoutMs,
  timeoutLabel: options.timeoutLabel,
  allowConfiguredProxy: options.allowConfiguredProxy,
  allowSensitiveConfiguredProxy: options.allowSensitiveConfiguredProxy,
  allowPublicProxies: options.allowPublicProxies,
  allowDirectCrossOrigin: options.allowDirectCrossOrigin,
  signal: options.signal
  });
  if (!response.ok) throw new Error(formatStatusFailure(options, response.status));
  return readFetchResponseBody(response, options.responseType);
}
function browserFetchFallbackOptions(url, options, userscriptRequest) {
  if (userscriptRequest || options.allowDirectCrossOrigin !== void 0) return options;
  const method = String(options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" || !isKnownDirectCorsTarget(url) || !isProxySafeRequest(url, options)) return options;
  return { ...options, allowDirectCrossOrigin: true };
}
function readFetchResponseBody(response, responseType) {
  return FETCH_RESPONSE_READERS[responseType ?? "text"]?.(response) ?? response.text();
}
const FETCH_RESPONSE_READERS = {
  blob: (response) => response.blob(),
  arraybuffer: (response) => response.arrayBuffer(),
  json: (response) => response.json(),
  text: (response) => response.text()
};
function formatFailure(options) {
  return options.failureMessage ?? `${options.failureLabel ?? "Request"} failed.`;
}
function formatStatusFailure(options, status) {
  return options.statusFailureMessage?.(status) ?? `${options.failureLabel ?? "Request"} failed (${status}).`;
}
function isSameOriginUrl(url) {
  if (typeof location === "undefined") return false;
  try {
  return new URL(url, location.href).origin === location.origin;
  } catch {
  return false;
  }
}
function shouldRetryEventBridgeFailureWithFetch(userscriptRequest, error) {
  if (!isUserscriptEventBridgeRequest(userscriptRequest)) return false;
  if (!(error instanceof Error)) return true;
  return !/\(\d{3}\)/.test(error.message);
}
function shouldRetryWithFetch(error) {
  if (!(error instanceof Error)) return true;
  if (/\(\d{3}\)/.test(error.message)) return false;
  if (/timed out|timeout/i.test(error.message)) return false;
  return /network|cors|blocked|request failed/i.test(error.message);
}
function recordHeaders(headers) {
  if (!headers) return void 0;
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}
function httpStatusFromError(error) {
  if (!error || typeof error !== "object") return void 0;
  const value = error;
  const status = value.status ?? value.statusCode;
  return typeof status === "number" && Number.isFinite(status) ? status : void 0;
}
const BUNPRO_FRONTEND_API_BASE_URL = "https://api.bunpro.jp/api/frontend";
const REQUEST_TIMEOUT_MS = 3e4;
const TOKEN_EXPIRED_CODE_RE = /AUTH_USER_DENIED|token expired|expired|\b401\b/i;
const TRANSPORT_FAILURE_BACKOFF_MS = 5 * 60 * 1e3;
const TRANSPORT_FAILURE_MESSAGE_RE = /NetworkError|Failed to fetch|load failed|cross-origin|CORS/i;
class BunproApiError extends Error {
  /** `yomuUiCopyKey` names the message a learner sees instead of a generic failure. */
  constructor(message, status, yomuUiCopyKey) {
  super(message);
  this.status = status;
  this.yomuUiCopyKey = yomuUiCopyKey;
  this.name = "BunproApiError";
  }
}
class BunproClient {
  getFrontendToken;
  getLegacyApiKey;
  frontendBaseUrl;
  requestImpl;
  timeoutMs;
  getProxyUrl;
  isTransportAvailable;
  transportRetryAfter = 0;
  constructor(options = {}) {
  this.getFrontendToken = options.getFrontendToken ?? (() => "");
  this.getLegacyApiKey = options.getLegacyApiKey ?? (() => "");
  this.getProxyUrl = options.getProxyUrl ?? (() => "");
  this.frontendBaseUrl = trimBaseUrl(options.frontendBaseUrl ?? BUNPRO_FRONTEND_API_BASE_URL);
  this.requestImpl = options.requestImpl ?? requestHttp;
  this.isTransportAvailable = options.isTransportAvailable ?? (() => true);
  this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }
  hasFrontendCredential() {
  return Boolean(this.getFrontendToken().trim());
  }
  /** Cheap non-reversible fingerprint of the frontend token, so persisted
   * per-account caches can be validated without storing the token itself. */
  // fallow-ignore-next-line unused-class-member
  frontendCredentialFingerprint() {
  const token = this.getFrontendToken().trim();
  if (!token) return "";
  let hash = 5381;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) + hash + token.charCodeAt(index) >>> 0;
  }
  return `${hash.toString(16)}:${token.length}`;
  }
  // fallow-ignore-next-line unused-class-member
  hasLegacyCredential() {
  return Boolean(this.getLegacyApiKey().trim());
  }
  getUser() {
  return this.frontend("/user");
  }
  getDueCount() {
  return this.frontend("/user/due");
  }
  getQueue() {
  return this.frontend("/reviews/quiz_index");
  }
  // fallow-ignore-next-line unused-class-member
  getUserFurigana() {
  return this.frontend("/user/user_furigana");
  }
  // fallow-ignore-next-line unused-class-member
  getReviews(page = 1, perPage = 25) {
  return this.frontend("/reviews", {
    query: {
      page: String(Math.max(1, Math.floor(page))),
      per_page: String(Math.max(1, Math.floor(perPage)))
    }
  });
  }
  getBaseStats() {
  return this.frontend("/user_stats/base_stats");
  }
  // fallow-ignore-next-line unused-class-member
  getJlptProgress() {
  return this.frontend("/user_stats/jlpt_progress_mixed");
  }
  // Called through a structural Pick<> by the word-state store, which the
  // member-usage analysis cannot see.
  // fallow-ignore-next-line unused-class-member
  getSrsOverview() {
  return this.frontend("/user_stats/srs_level_overview");
  }
  // Live API rejects numeric levels: `level` is the tier name Bunpro's own
  // stats page sends (beginner/adept/seasoned/expert/master/ghost). Called
  // through a structural Pick<> by the word-state store.
  // fallow-ignore-next-line unused-class-member
  getSrsLevelDetails(level, reviewableType, page = 1) {
  return this.frontend("/user_stats/srs_level_details", {
    query: {
      level,
      reviewable_type: reviewableType,
      page: String(Math.max(1, Math.floor(page)))
    }
  });
  }
  // fallow-ignore-next-line unused-class-member
  getForecastDaily() {
  return this.frontend("/user_stats/forecast_daily");
  }
  // fallow-ignore-next-line unused-class-member
  getForecastHourly() {
  return this.frontend("/user_stats/forecast_hourly");
  }
  // fallow-ignore-next-line unused-class-member
  getReviewActivity() {
  return this.frontend("/user_stats/review_activity");
  }
  getVocab(slugOrId) {
  return this.frontend(`/reviewables/vocab/${encodeURIComponent(String(slugOrId))}`, { auth: "optional" });
  }
  getGrammarPoint(id) {
  return this.frontend(`/reviewables/grammar_point/${encodeURIComponent(String(id))}`, { auth: "optional" });
  }
  async search(query, options = {}) {
  return this.frontend("/search/reviewables_v1_1", {
    method: "POST",
    // Definition/frequency lookups read public reviewable data; only a
    // search that asks for the learner's review state needs the token.
    auth: options.includeReviews ? "required" : "optional",
    body: {
      query,
      options: {
        // Definition/mining lookups do not need the learner's
        // private notes or bookmarks. Review relationships are
        // opt-in for the rare caller that actually consumes them.
        include_reviews: options.includeReviews ?? false,
        include_bookmarks: false,
        include_notes: false,
        only_bookmarks: false
      },
      is_searching_grammar: options.grammar ?? true,
      is_searching_vocab: options.vocab ?? true
    },
    trimLimit: options.limit
  });
  }
  updateReviewsViaActionType(request) {
  return this.frontend("/reviews/update_via_action_type", {
    method: "PATCH",
    body: {
      deck_id: request.deckId ?? null,
      action_type: request.actionType,
      reviewables: request.reviewables.map((item) => [item.type, item.id])
    }
  });
  }
  updateReview(reviewId, body, endpoint = "review") {
  const collection = endpoint === "ghost-review" ? "ghost_reviews" : endpoint === "self-study-review" ? "self_study_reviews" : "reviews";
  return this.frontend(`/${collection}/${encodeURIComponent(String(reviewId))}/update`, {
    method: "POST",
    body
  });
  }
  async frontend(path, options = {}) {
  const token = this.getFrontendToken().trim();
  const optionalAuth = options.auth === "optional";
  if (!token && !optionalAuth) throw new BunproApiError("Bunpro frontend token is not set.");
  let response;
  try {
    response = await this.frontendRequest(path, options, token);
  } catch (error) {
    const status = error instanceof BunproApiError ? error.status : httpStatusFromError(error);
    if (!optionalAuth || !token || status !== 401 && status !== 403) throw error;
    response = await this.frontendRequest(path, options, "");
  }
  return options.trimLimit ? trimBunproSearchResponse(response, options.trimLimit) : response;
  }
  frontendRequest(path, options, token) {
  const url = urlWithQuery(`${this.frontendBaseUrl}${path}`, options.query);
  return this.requestJson(url, {
    method: options.method ?? "GET",
    headers: {
      ...token ? { Authorization: `Bearer ${token}` } : {},
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    data: options.body === void 0 ? void 0 : JSON.stringify(options.body),
    statusFailureMessage: (status) => status === 401 ? "Bunpro token expired or was denied (401)." : `Bunpro API request failed (${status}).`
  });
  }
  async requestJson(url, options) {
  if (!this.isTransportAvailable()) {
    throw new BunproApiError("Bunpro needs the Yomu browser companion or a configured personal proxy in the hosted app.");
  }
  if (this.transportRetryAfter > Date.now()) {
    throw new BunproApiError("Bunpro is unreachable from this page (cross-origin blocked); backing off.");
  }
  try {
    const response = await this.requestImpl(url, {
      ...options,
      responseType: "json",
      timeoutMs: this.timeoutMs,
      preferFetch: true,
      allowDirectCrossOrigin: true,
      // The Bearer token must never transit the SHARED public proxy,
      // but the user's own configured proxy is their infrastructure —
      // and on hosted pages with no userscript bridge it is the only
      // transport that can carry an authenticated Bunpro request.
      proxyUrl: this.getProxyUrl(),
      allowPublicProxies: false,
      allowSensitiveConfiguredProxy: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      failureLabel: "Bunpro request"
    });
    this.transportRetryAfter = 0;
    return response;
  } catch (error) {
    if (isBunproTransportFailure(error)) this.transportRetryAfter = Date.now() + TRANSPORT_FAILURE_BACKOFF_MS;
    throw normalizeBunproError(error);
  }
  }
}
function isBunproTransportFailure(error) {
  if (httpStatusFromError(error) !== void 0) return false;
  if (error instanceof BunproApiError) return false;
  return error instanceof Error && TRANSPORT_FAILURE_MESSAGE_RE.test(`${error.name} ${error.message}`);
}
function normalizeBunproError(error) {
  if (error instanceof BunproApiError) return error;
  const status = httpStatusFromError(error);
  if (!(error instanceof Error)) return new BunproApiError("Bunpro request failed.", status);
  if (status === 401 || TOKEN_EXPIRED_CODE_RE.test(error.message)) return new BunproApiError("Bunpro token expired or was denied.", 401);
  return error;
}
function trimBaseUrl(value) {
  return value.replace(/\/+$/u, "");
}
function urlWithQuery(url, query) {
  if (!query) return url;
  const next = new URL(url);
  Object.entries(query).forEach(([key, value]) => {
  if (value !== void 0) next.searchParams.set(key, value);
  });
  return next.href;
}
function trimBunproSearchResponse(raw, limit) {
  const maxItems = Math.max(1, Math.floor(limit));
  if (!raw || typeof raw !== "object") return raw;
  const value = raw;
  return {
  ...value,
  grammar_points: trimBunproSearchSection(value.grammar_points, maxItems),
  vocabs: trimBunproSearchSection(value.vocabs, maxItems)
  };
}
function trimBunproSearchSection(section, limit) {
  if (!section || typeof section !== "object") return section;
  const value = section;
  if (!Array.isArray(value.data)) return section;
  return { ...value, data: value.data.slice(0, limit) };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonNullObject(value) {
  return typeof value === "object" && value !== null;
}
function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}
const entries = [];
const registeredEntryIndexes = /* @__PURE__ */ new Map();
let resetWritesSuppressed = false;
function registerManagedState(entry) {
  const identity = managedStateIdentity(entry);
  const existingIndex = registeredEntryIndexes.get(identity);
  if (existingIndex !== void 0) {
  const existing = entries[existingIndex];
  if (existing.owner !== entry.owner) {
    throw new Error(`Managed state ${identity} has conflicting owners: ${existing.owner}, ${entry.owner}.`);
  }
  if (existing.enumerate && entry.enumerate && existing.enumerate !== entry.enumerate) {
    throw new Error(`Managed state ${identity} has conflicting enumerators.`);
  }
  if (!existing.enumerate && entry.enumerate) entries[existingIndex] = { ...existing, enumerate: entry.enumerate };
  return;
  }
  registeredEntryIndexes.set(identity, entries.length);
  entries.push(entry);
}
function registerManagedStates(list) {
  for (const entry of list) registerManagedState(entry);
}
function managedStateIdentity(entry) {
  return `${entry.kind}:${entry.key ?? ""}:${entry.prefix ?? ""}`;
}
function managedStateEntries() {
  return entries;
}
function managedStateWritesSuppressed() {
  return resetWritesSuppressed;
}
let sandboxCompanions = {};
function registerYomuCompanion(key, value) {
  writeYomuCompanions({
  ...yomuCompanions(),
  [key]: value
  });
}
function yomuLocalDictionaries() {
  return yomuCompanions().localDictionaries;
}
function yomuCompanions() {
  return readYomuCompanions(globalThis) ?? sandboxCompanions ?? (typeof window === "undefined" ? void 0 : readYomuCompanions(window)) ?? {};
}
function writeYomuCompanions(value) {
  sandboxCompanions = value;
  writeYomuCompanionsTarget(globalThis, value);
  if (typeof window !== "undefined" && window !== globalThis) {
  const pageValue = pageCompartmentRegistryValue(value);
  if (pageValue) writeYomuCompanionsTarget(window, pageValue);
  }
}
function pageCompartmentRegistryValue(value) {
  const cloneInto = globalThis.cloneInto;
  if (typeof cloneInto !== "function") return value;
  try {
  return cloneInto(value, window, { cloneFunctions: true, wrapReflectors: true });
  } catch {
  return void 0;
  }
}
function writeYomuCompanionsTarget(target, value) {
  if (!target || typeof target !== "object" && typeof target !== "function") return false;
  const writable = target;
  try {
  writable.__yomuCompanions = value;
  return true;
  } catch {
  }
  try {
  Object.defineProperty(writable, "__yomuCompanions", {
    configurable: true,
    enumerable: false,
    writable: true,
    value
  });
  return true;
  } catch {
  return false;
  }
}
function readYomuCompanions(target) {
  if (!target || typeof target !== "object" && typeof target !== "function") return void 0;
  try {
  return target.__yomuCompanions;
  } catch {
  return void 0;
  }
}
async function enumerateDictionaryArchiveStorageKeys() {
  const enumerate = yomuLocalDictionaries()?.enumerateDictionaryArchiveStorageKeys;
  if (!enumerate) throw new Error("The local-dictionary companion cannot enumerate archive storage.");
  return enumerate();
}
const MANAGED_STATE_MANIFEST = [
  // Settings (also legacy migration keys). The bunpro token / pill selections /
  // colours all live inside these settings objects.
  { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
  { owner: "settings", kind: "gm", key: "yomu:prefer-japanese-site-language:v1" },
  { owner: "settings (pre-ledger pins)", kind: "gm", key: "yomu:explicit-user-settings:v1" },
  { owner: "settings/intent-ledger", kind: "gm", key: "yomu:settings-intent:v2" },
  { owner: "settings (retired promotion marker; purge only)", kind: "gm", key: "yomu:extension-study-legacy-promotion:v1" },
  // Private, one-use cloud settings OAuth handoff. The old page-readable key
  // remains reset-only so upgrades erase a stranded pre-1.9 callback marker.
  { owner: "settings/dialog-controller", kind: "gm", key: "yomu:private:cloud-settings-sync-pending:v1" },
  { owner: "settings/dialog-controller (legacy)", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
  // App-level signals / flags / caches.
  { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
  { owner: "app/storage epoch", kind: "gm", key: "yomu:state-epoch" },
  { owner: "app/storage epoch slots", kind: "gm", prefix: "yomu:state-slot:v1:" },
  { owner: "app/storage epoch lease", kind: "gm", prefix: "yomu:state-epoch-lease:v1:" },
  { owner: "app/managed-web-storage", kind: "local", key: "yomu:web-storage-epoch:v1:local" },
  { owner: "app/managed-web-storage", kind: "session", key: "yomu:web-storage-epoch:v1:session" },
  { owner: "app/managed-web-storage", kind: "local", prefix: "yomu:web-storage-slot:v1:" },
  { owner: "app/managed-web-storage", kind: "session", prefix: "yomu:web-storage-slot:v1:" },
  { owner: "app/managed-web-storage", kind: "local", prefix: "yomu:web-owner:v2:" },
  { owner: "app/managed-web-storage", kind: "session", prefix: "yomu:web-owner:v2:" },
  { owner: "app/storage local provenance", kind: "local", key: "yomu:local-storage-provenance:v1" },
  { owner: "app/card-state-signal", kind: "gm", key: "yomu:card-state-signal" },
  { owner: "app/storage leases", kind: "gm", prefix: "yomu:lease:" },
  { owner: "srs/account-sync", kind: "gm", key: "yomu:private:academy-device:v1" },
  { owner: "srs/account-sync", kind: "gm", key: "yomu:private:academy-device-pending:v1" },
  { owner: "app/logger", kind: "gm", key: "yomu:enable-logs" },
  { owner: "app/main", kind: "local", key: "yomu:jpdb-review-examples-visible:v1" },
  { owner: "core/hosted-appearance-boot", kind: "local", key: "yomu-page-theme" },
  // Deliberately per-origin: this is the bootstrap hint for this site, never
  // the preference itself. Runtime reads and writes use the managed facade.
  { owner: "app/preferred-site-language", kind: "local", key: "yomu:prefer-japanese-site-language" },
  { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps" },
  { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps:hosts" },
  // Local no-account SRS deck.
  { owner: "srs/local-yomu-store (legacy)", kind: "gm", key: "yomu:srs-local:v1" },
  { owner: "srs/local-yomu-store", kind: "gm", prefix: "yomu:srs-local:v2:" },
  // Anki status index (GM leases + IndexedDB store).
  { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index:v1" },
  { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index-rebuild:v1" },
  { owner: "anki/status-index", kind: "idb", key: "yomu-anki-status-index" },
  // Bunpro vocab SRS-state index for page word colouring.
  { owner: "bunpro/word-states", kind: "gm", key: "yomu:bunpro-word-states:v1" },
  // Public lookup caches.
  { owner: "jpdb/jpdb-public-cache", kind: "local", key: "yomu:jpdb-cache:v1" },
  { owner: "dictionaries/jiten-public-cache (legacy)", kind: "gm", key: "yomu:jiten-public-cache:v1" },
  { owner: "dictionaries/jiten-public-cache", kind: "local", key: "yomu:jiten-public-cache:v2" },
  { owner: "dictionaries/jiten-stats-cache", kind: "gm", key: "jpdb-reader-jiten-daily-stats" },
  // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
  // store's own deleteDatabase during reset; registered so the invariant test
  // asserts it and the reset sweep nets it as a fallback.
  { owner: "dictionaries/yomitan", kind: "idb", key: "jpdb-popup-reader-yomitan" },
  { owner: "dictionaries/archive-cache", kind: "gm", key: "yomu-dictionary-archives" },
  {
  owner: "dictionaries/archive-cache",
  kind: "gm",
  prefix: "yomu-dictionary-archive:",
  enumerate: enumerateDictionaryArchiveStorageKeys
  },
  // Replication was removed in 1.8.78 (dictionaries live only where they
  // are imported); the state key stays registered so resets sweep what
  // earlier releases left behind.
  { owner: "dictionaries/replication (legacy)", kind: "local", key: "yomu-dictionary-replication-state" },
  { owner: "dictionaries/replica-purge", kind: "gm", key: "yomu:dictionary-replica-purge:v1" },
  { owner: "dictionaries/replica-purge", kind: "local", key: "yomu:dictionary-replica-purged:v1" },
  // OCR result cache.
  { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v1" },
  { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v2" },
  { owner: "ocr/canvas-mirror", kind: "session", key: "yomu:bw:mirror-loadguard" },
  // The one-time reader-canvas tap hint appears once per site. Each site's record
  // is private and keyed by a hash of its origin, so no page can read it.
  { owner: "ocr/reader-canvas-tap-hint", kind: "gm", prefix: "yomu:private:ocr-canvas-tap-hint-seen:v1:" },
  // The popup grade keycaps retire after the learner's first popup grade.
  { owner: "cards/grade-key-hints", kind: "gm", key: "yomu:private:grade-key-hints-retired:v1" },
  // Reader CSS last-good cache. v3 is deliberately version-independent (see
  // styles/index) so an upgrade does not start cold; the v2 prefix family
  // stays registered so the per-version entries older installs left behind
  // are still swept on reset.
  { owner: "styles/index", kind: "gm", key: "yomu:reader-css-cache:v3" },
  { owner: "styles/index (legacy)", kind: "gm", prefix: "yomu:reader-css-cache:v2:" },
  // Study / grammar / mining stores.
  { owner: "study/grammar-knowledge", kind: "gm", key: "yomu.grammarPreferences.v1" },
  { owner: "study/grammar-knowledge", kind: "gm", prefix: "yomu.grammarPreferences.v1:" },
  { owner: "study/mining-context", kind: "gm", prefix: "yomu-mining-context:" },
  // Retired Uchisen carousel index. Keep the prefix registered so Factory
  // Reset still removes harmless selection keys left by older releases.
  { owner: "dictionaries/uchisen-carousel (retired)", kind: "gm", prefix: "yomu-jpdb-uchisen-index:" },
  // Popup / drawer geometry.
  { owner: "popup/shell", kind: "gm", key: "jpdb-reader-sheet-height-ratio" },
  { owner: "popup/shell", kind: "gm", key: "jpdb-reader-settings-drawer-height-ratio" },
  // Sources open/closed state.
  { owner: "sources/state", kind: "gm", key: "jpdb-reader-source-open-state" },
  // Subtitle layout geometry.
  { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-transcript-panel-size" },
  { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-drag-offset" },
  { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-control-rail-position" },
  // YouTube subscription snapshot + oembed title cache.
  { owner: "subtitles/youtube", kind: "gm", key: "yomu:youtube-all-subscribed:v1" },
  { owner: "subtitles/youtube", kind: "session", prefix: "yomu:youtube-oembed-title:v1:" },
  { owner: "subtitles/controller", kind: "session", prefix: "yomu:subtitle-parse:v" },
  // New Tab study surface stores.
  { owner: "study/practice-session", kind: "idb", key: "yomu-practice-sessions-v1" },
  { owner: "study/practice-session", kind: "session", key: "yomu:practice-session-tab:v1" },
  { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
  { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
  { owner: "newtab/grade-queue", kind: "gm", key: "yomu:newtab-live-review:v1" },
  { owner: "newtab/review-queue-owner", kind: "gm", key: "yomu:private:review-delivery:v2" },
  { owner: "newtab/packaged-review-queue-client", kind: "session", key: "yomu:review-action-draft:v2" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-current-word" },
  { owner: "newtab/controller-config", kind: "session", key: "jpdb-reader-newtab-current-word" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-jpdb-stats-history" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-disabled-anki-decks" },
  { owner: "newtab/session-progress", kind: "local", key: "jpdb-reader-newtab-daily-study-time" },
  { owner: "newtab/controller", kind: "local", key: "yomu-newtab-support-banner-dismissed" },
  // Local pitch-accent SRS (debounced writer — the canonical reset escapee).
  { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-items:v1" },
  { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-history:v1" }
];
let manifestRegistered = false;
function registerManagedStateManifest() {
  if (manifestRegistered) return;
  manifestRegistered = true;
  registerManagedStates(MANAGED_STATE_MANIFEST);
}
registerManagedStateManifest();
const MANAGED_STATE_EPOCH_KEY = "yomu:state-epoch";
const MANAGED_STATE_ENVELOPE_VERSION = 1;
const MANAGED_STATE_EPOCH_SESSION_SLOT = Symbol.for("yomu.managed-state-epoch-session.v1");
const MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT = Symbol.for("yomu.managed-state-epoch-canonical-session.v1");
const INITIAL_MANAGED_STATE_EPOCH = Object.freeze({
  version: 1,
  generation: 0,
  resetId: "legacy",
  committedAt: 0
});
class StaleManagedStateEpochError extends Error {
  constructor(expected, actual) {
  super(`Managed state belongs to epoch ${managedStateEpochToken(expected)}, but the current epoch is ${managedStateEpochToken(actual)}.`);
  this.expected = expected;
  this.actual = actual;
  this.name = "StaleManagedStateEpochError";
  }
  code = "YOMU_STALE_MANAGED_STATE_EPOCH";
}
function isStaleManagedStateEpochError(error) {
  return Boolean(error && typeof error === "object" && error.code === "YOMU_STALE_MANAGED_STATE_EPOCH");
}
class ManagedStateEpochSession {
  captured;
  captureInFlight;
  current() {
  return this.captured;
  }
  async capture(readEpoch) {
  if (this.captured) return this.captured;
  if (!this.captureInFlight) {
    this.captureInFlight = readEpoch().then(parseManagedStateEpoch).then((epoch) => {
      this.captured = epoch;
      return epoch;
    }).finally(() => {
      this.captureInFlight = void 0;
    });
  }
  return this.captureInFlight;
  }
  captureSync(rawEpoch) {
  const epoch = parseManagedStateEpoch(rawEpoch);
  this.captured ??= epoch;
  return this.captured;
  }
  async assertCurrent(readEpoch) {
  const expected = await this.capture(readEpoch);
  const actual = parseManagedStateEpoch(await readEpoch());
  assertManagedStateEpoch(expected, actual);
  return expected;
  }
  assertCurrentSync(rawEpoch) {
  const expected = this.captureSync(rawEpoch);
  const actual = parseManagedStateEpoch(rawEpoch);
  assertManagedStateEpoch(expected, actual);
  return expected;
  }
  /** Test-only lifecycle support for Vitest's reused JavaScript realm. */
  resetForTests() {
  this.captured = void 0;
  this.captureInFlight = void 0;
  }
}
function managedStateEpochSessionForRealm(root = globalThis) {
  const slots = root;
  const existing = slots[MANAGED_STATE_EPOCH_SESSION_SLOT];
  if (isManagedStateEpochSession(existing)) return existing;
  const session = new ManagedStateEpochSession();
  slots[MANAGED_STATE_EPOCH_SESSION_SLOT] = session;
  slots[MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT] ??= session;
  return session;
}
function parseManagedStateEpoch(value) {
  if (value === void 0 || value === null) return INITIAL_MANAGED_STATE_EPOCH;
  if (!isPlainRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.resetId !== "string" || !value.resetId.trim() || typeof value.committedAt !== "number" || !Number.isFinite(value.committedAt) || value.committedAt <= 0) {
  throw new Error("The managed-state epoch is malformed.");
  }
  return {
  version: 1,
  generation: value.generation,
  resetId: value.resetId,
  committedAt: value.committedAt
  };
}
function managedStateStoredValue(value, epoch) {
  if (epoch.generation === 0) return value;
  const envelope = {
  __yomuManagedStateEnvelope: MANAGED_STATE_ENVELOPE_VERSION,
  epoch: managedStateEpochToken(epoch),
  value
  };
  return envelope;
}
function managedStateLogicalValue(stored, epoch, fallback) {
  if (epoch.generation === 0) {
  if (!isManagedStateEnvelope(stored)) return stored;
  return stored.epoch === managedStateEpochToken(epoch) ? stored.value : fallback;
  }
  if (!isManagedStateEnvelope(stored)) return fallback;
  return stored.epoch === managedStateEpochToken(epoch) ? stored.value : fallback;
}
function managedStateEpochToken(epoch) {
  return `${epoch.generation}:${epoch.resetId}`;
}
function sameManagedStateEpoch(left, right) {
  return left.generation === right.generation && left.resetId === right.resetId;
}
function assertManagedStateEpoch(expected, actual) {
  if (!sameManagedStateEpoch(expected, actual)) throw new StaleManagedStateEpochError(expected, actual);
}
function isManagedStateEnvelope(value) {
  return isPlainRecord(value) && value.__yomuManagedStateEnvelope === MANAGED_STATE_ENVELOPE_VERSION && typeof value.epoch === "string" && Object.hasOwn(value, "value");
}
function isManagedStateEpochSession(value) {
  return Boolean(value && typeof value === "object" && typeof value.current === "function" && typeof value.capture === "function" && typeof value.assertCurrent === "function" && typeof value.resetForTests === "function");
}
function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
const MISSING = { __yomuStorageValueMissing: true };
function isMissingSentinel(value) {
  if (value === MISSING) return true;
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.__yomuStorageValueMissing === true);
}
async function rawAuthoritativeManagedStateEpoch(getValue) {
  const stored = await getValue(MANAGED_STATE_EPOCH_KEY, MISSING);
  return isMissingSentinel(stored) ? void 0 : stored;
}
async function authoritativeManagedStateEpoch(getValue) {
  return parseManagedStateEpoch(await rawAuthoritativeManagedStateEpoch(getValue));
}
function managedStateStorageKey(key, epoch) {
  if (epoch.generation === 0) return key;
  return `${MANAGED_STATE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(key)}`;
}
async function readManagedGmValue(getValue, key, epoch) {
  const storageKey = managedStateStorageKey(key, epoch);
  const scoped = await getValue(storageKey, MISSING);
  const readFromCurrentSlot = !isMissingSentinel(scoped);
  const stored = readFromCurrentSlot || storageKey === key ? scoped : await getValue(key, MISSING);
  if (isMissingSentinel(stored)) return { kind: "missing" };
  const unreadable = Symbol("unreadable-managed-state");
  const logical = managedStateLogicalValue(stored, epoch, unreadable);
  if (logical === unreadable) return readFromCurrentSlot ? { kind: "deleted" } : { kind: "missing" };
  if (isMissingSentinel(logical)) return { kind: "deleted" };
  return { kind: "found", value: logical };
}
function isHostedYomuLocation(origin, hostname, pathname) {
  if (origin === DOCS_ORIGIN) return true;
  if (isHostedGithubPagesLocation(hostname, pathname)) return true;
  return isHostedLocalDevelopmentLocation(origin, pathname);
}
function isHostedYomuOrigin() {
  try {
  return isHostedYomuLocation(location.origin, location.hostname, location.pathname);
  } catch {
  return false;
  }
}
function isHostedGithubPagesLocation(hostname, pathname) {
  return hostname === "hrussellzfac023.github.io" && pathname.startsWith("/yomu-reader/");
}
function isHostedLocalDevelopmentLocation(origin, pathname) {
  if (!isPrivilegedYomuLocalDevelopmentOrigin(origin)) return false;
  return pathname.includes("/study/") || pathname.includes("/newtab/");
}
const MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX = "yomu:state-epoch-lease:v1:";
const STORAGE_LEASE_KEY_PREFIX = "yomu:lease:";
function isStorageLeaseLapsed(error) {
  return error instanceof Error && error.name === "StorageLeaseLapsedError";
}
const guardingLeases = /* @__PURE__ */ new Set();
function fenceStorageLeaseWrite(key) {
  for (const lease of guardingLeases) if (lease.guards(key)) lease.fenceWrite();
}
const EXCLUDED_BACKUP_STORAGE_KEYS = /* @__PURE__ */ new Set([
  "yomu:factory-reset-signal",
  MANAGED_STATE_EPOCH_KEY,
  "yomu:local-storage-provenance:v1",
  // Transient cloud-sync handoff written before an OAuth redirect. Factory
  // reset owns it via the '__yomu' prefix, but backups must not replay it.
  "__yomu_cloud_settings_sync_pending_action"
]);
function isManagedStorageBackupKey(key) {
  return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key) && !isManagedStorageSlotKey(key) && !key.startsWith(MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX) && !key.startsWith(STORAGE_LEASE_KEY_PREFIX) && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
}
function localStorageGet(key, fallback) {
  try {
  const value = localStorage.getItem(key);
  return value == null ? fallback : JSON.parse(value);
  } catch {
  return fallback;
  }
}
function localStorageSet(key, value) {
  try {
  localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
function removeLocalStorageKey(key) {
  try {
  localStorage.removeItem(key);
  } catch {
  }
}
function removeSessionStorageKey(key) {
  try {
  sessionStorage.removeItem(key);
  } catch {
  }
}
function localStorageSetOrThrow(key, value) {
  try {
  const serialized = JSON.stringify(value);
  if (serialized === void 0) throw new Error("value is not JSON-serializable");
  localStorage.setItem(key, serialized);
  if (localStorage.getItem(key) !== serialized) throw new Error("read-back did not match");
  return serialized;
  } catch (error) {
  throw storageWriteError(key, "localStorage write failed", error);
  }
}
function storageWriteError(key, message, ...causes) {
  const details = causes.map((cause) => cause instanceof Error ? cause.message : String(cause)).filter(Boolean).join("; ");
  return new Error(`${message} for "${key}"${details ? `: ${details}` : ""}`);
}
const SETTINGS_STORAGE_KEY = "jpdb-popup-reader-settings";
const RETIRED_SETTINGS_STORAGE_KEYS = [
  "jpdb-reader-settings",
  "yomu-reader-settings",
  "yomu-settings",
  "yomu:explicit-user-settings:v1"
];
const SETTINGS_INTENT_LEDGER_STORAGE_KEY = "yomu:settings-intent:v2";
const PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY = "yomu:prefer-japanese-site-language:v1";
const PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY = "yomu:prefer-japanese-site-language";
const SETTINGS_AUTHORITY_STORAGE_KEYS = /* @__PURE__ */ new Set([
  SETTINGS_STORAGE_KEY,
  ...RETIRED_SETTINGS_STORAGE_KEYS,
  SETTINGS_INTENT_LEDGER_STORAGE_KEY,
  PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
  PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY
]);
function isSettingsAuthorityStorageKey(key) {
  return SETTINGS_AUTHORITY_STORAGE_KEYS.has(key);
}
const HOSTED_LOCAL_SETTINGS_KEYS = [
  "showFurigana",
  "furiganaMode",
  "showPitchAccent",
  "wordUnderlineColorSource",
  "subtitlePlayerEnabled",
  "subtitleAutoDetect",
  "subtitleOverlayVisible",
  "subtitleControlsMode",
  "subtitleTranscriptVisible",
  "ocrEnabled",
  "ocrVideoPauseFrames",
  "ocrProvider",
  "ocrOverlayTheme",
  "preferJapaneseSiteLanguage"
];
const PROVENANCE_KEY = "yomu:local-storage-provenance:v1";
const JAPANESE_SITE_LANGUAGE_KEY = "yomu:prefer-japanese-site-language:v1";
function captureLocalFallbackStoredState(key) {
  try {
  const serializedValue = localStorage.getItem(key);
  const entry = provenanceValues()[key];
  return {
    serializedValue,
    provenance: entry ? { ...entry } : null
  };
  } catch (error) {
  throw storageWriteError(key, "Local fallback read failed", error);
  }
}
function restoreLocalFallbackStoredState(key, state) {
  try {
  if (state.serializedValue === null) localStorage.removeItem(key);
  else localStorage.setItem(key, state.serializedValue);
  if (localStorage.getItem(key) !== state.serializedValue) throw new Error("read-back did not match");
  } catch (error) {
  throw storageWriteError(key, "Local fallback restore failed", error);
  }
  updateProvenance(key, state.provenance, true);
}
function writeLocalManagedValueOrThrow(key, value, epoch) {
  const previous = captureLocalFallbackStoredState(key);
  try {
  const serialized = localStorageSetOrThrow(key, value);
  updateProvenance(key, {
    epoch: managedStateEpochToken(epoch),
    fingerprint: fingerprint(serialized)
  }, true);
  } catch (error) {
  try {
    restoreLocalFallbackStoredState(key, previous);
  } catch (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      `Local fallback publication and rollback failed for "${key}".`
    );
  }
  throw error;
  }
}
function removeLocalManagedValue(key) {
  removeLocalStorageKey(key);
  removeSessionStorageKey(key);
  updateProvenance(key, null);
}
function localMirrorBelongsToEpoch(key, epoch) {
  const serialized = recoverableSerializedValue(key);
  if (serialized === null) return false;
  const entry = provenanceValues()[key];
  return entry ? entry.epoch === managedStateEpochToken(epoch) && entry.fingerprint === fingerprint(serialized) : epoch.generation === 0;
}
function removeLocalMirrorProvenance(key) {
  updateProvenance(key, null);
}
function updateProvenance(key, entry, strict = false) {
  const values = provenanceValues();
  if (!mutateProvenance(values, key, entry)) return;
  persistProvenance(values, strict);
}
function mutateProvenance(values, key, entry) {
  if (entry) {
  values[key] = entry;
  return true;
  }
  if (!(key in values)) return false;
  delete values[key];
  return true;
}
function persistProvenance(values, strict) {
  if (Object.keys(values).length) {
  const value = { version: 1, values };
  if (strict) localStorageSetOrThrow(PROVENANCE_KEY, value);
  else localStorageSet(PROVENANCE_KEY, value);
  return;
  }
  removeLocalStorageKey(PROVENANCE_KEY);
}
function provenanceValues() {
  const stored = localStorageGet(PROVENANCE_KEY, null);
  if (!isStoredProvenance(stored)) return {};
  const values = {};
  for (const [key, value] of Object.entries(stored.values)) {
  const normalized = normalizedEntry(value);
  if (normalized) values[key] = normalized;
  }
  return values;
}
function isStoredProvenance(value) {
  if (!isRecord(value) || value.version !== 1) return false;
  return isRecord(value.values);
}
function normalizedEntry(value) {
  if (!isRecord(value)) return null;
  if (typeof value.epoch !== "string") return null;
  if (typeof value.fingerprint !== "string") return null;
  return { epoch: value.epoch, fingerprint: value.fingerprint };
}
function recoverableSerializedValue(key) {
  if (key === JAPANESE_SITE_LANGUAGE_KEY) return null;
  try {
  return localStorage.getItem(key);
  } catch {
  return null;
  }
}
function fingerprint(serialized) {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
  hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
const SETTINGS_KEY = "jpdb-popup-reader-settings";
const INTENT_LEDGER_KEY = "yomu:settings-intent:v2";
const LOCAL_SRS_V2_INDEX_KEY = "yomu:srs-local:v2:index";
const LAST_KEYS = [LOCAL_SRS_V2_INDEX_KEY, "yomu:prefer-japanese-site-language:v1", INTENT_LEDGER_KEY, SETTINGS_KEY];
const COORDINATION_FIELDS = ["__yomuSettingsPersistenceTransactionV1", "__yomuSettingsPersistenceCommitV1"];
const HOSTED_PATCH_FIELD = "__yomuHostedPendingGmPatch";
const OWNER_NAMESPACE_PREFIX = "yomu:web-owner:v2:";
let adoption;
function websiteOnlyValuePresent(key, epoch) {
  return isHostedYomuOrigin() && isWebsiteStoreKey(key) && localMirrorBelongsToEpoch(key, epoch);
}
function adoptWebsiteOnlyStore(getValue, epoch, write) {
  const token = managedStateEpochToken(epoch);
  if (adoption?.token === token) return adoption.done;
  const done = runAdoption(getValue, epoch, write).finally(() => {
  if (adoption?.done === done) adoption = void 0;
  });
  adoption = { token, done };
  return done;
}
async function runAdoption(getValue, epoch, write) {
  if (!isHostedYomuOrigin()) return;
  const installed = await readManagedGmValue(getValue, SETTINGS_KEY, epoch);
  const ledger = await readManagedGmValue(getValue, INTENT_LEDGER_KEY, epoch);
  if (installed.kind === "found" && !saysNoTargetChosen(installed.value) && recordsChoices(ledger)) return;
  const settingsUnitAbsent = installed.kind === "missing" && ledger.kind === "missing";
  for (const key of websiteOnlyKeys(epoch)) {
  if (isSettingsAuthorityStorageKey(key) && !settingsUnitAbsent) continue;
  if ((await readManagedGmValue(getValue, key, epoch)).kind !== "missing") continue;
  const value = localStorageGet(key, MISSING);
  if (!isMissingSentinel(value)) await write(key, adoptedValue(key, value));
  }
}
function websiteOnlyKeys(epoch) {
  const keys = [];
  for (let index = 0; index < localStorage.length; index++) {
  const key = localStorage.key(index);
  if (key && websiteOnlyValuePresent(key, epoch)) keys.push(key);
  }
  const rank = (key) => LAST_KEYS.indexOf(key);
  return keys.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}
function isWebsiteStoreKey(key) {
  return isManagedStorageBackupKey(key) && !key.startsWith(OWNER_NAMESPACE_PREFIX) && !RETIRED_SETTINGS_STORAGE_KEYS.includes(key) && managedStateEntries().some((entry) => entry.kind === "gm" && (entry.key === key || entry.prefix !== void 0 && key.startsWith(entry.prefix)));
}
function adoptedValue(key, value) {
  if (!isRecord(value)) return value;
  const record2 = withoutFields(value, COORDINATION_FIELDS);
  if (key === SETTINGS_KEY) return withoutFields(record2, [HOSTED_PATCH_FIELD, ...HOSTED_LOCAL_SETTINGS_KEYS]);
  if (key === INTENT_LEDGER_KEY && isRecord(record2.records)) {
  return { ...record2, records: withoutFields(record2.records, HOSTED_LOCAL_SETTINGS_KEYS) };
  }
  return record2;
}
function withoutFields(record2, fields) {
  const copy2 = { ...record2 };
  for (const field of fields) delete copy2[field];
  return copy2;
}
function saysNoTargetChosen(settings) {
  return isRecord(settings) && settings.learningTargetChosen === false;
}
function recordsChoices(ledger) {
  if (ledger.kind !== "found" || !isRecord(ledger.value)) return false;
  const records = ledger.value.records;
  return isRecord(records) && Object.keys(records).length > 0;
}
function asyncGmGetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmGetValue();
  if (direct) return direct;
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}
function directGmGetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return modernGmGetValue() ?? legacyGmGetValue() ?? rawExtensionStorageGetValue();
}
function legacyGmGetValue() {
  return typeof GM_getValue === "function" ? GM_getValue : null;
}
function modernGmGetValue() {
  const gm = userscriptGmApi();
  return typeof gm?.getValue === "function" ? gm.getValue.bind(gm) : null;
}
function asyncGmSetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmSetValue();
  if (direct) return direct;
  if (directGmGetValue()) return null;
  return bridgeGmSetValue();
}
function directGmSetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return legacyGmSetValue() ?? modernGmSetValue() ?? extensionGmSetValue();
}
function legacyGmSetValue() {
  return typeof GM_setValue === "function" ? GM_setValue : null;
}
function modernGmSetValue() {
  const gm = userscriptGmApi();
  return typeof gm?.setValue === "function" ? gm.setValue.bind(gm) : null;
}
function extensionGmSetValue() {
  const extension = extensionStorageArea();
  return extension ? (key, value) => extension.set({ [key]: value }) : null;
}
function bridgeGmSetValue() {
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, value) => bridge.setValue(key, value) : null;
}
function asyncGmDeleteValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmDeleteValue();
  if (direct) return direct;
  if (directGmGetValue()) return null;
  return bridgeGmDeleteValue();
}
function directGmDeleteValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return legacyGmDeleteValue() ?? modernGmDeleteValue() ?? extensionGmDeleteValue();
}
function legacyGmDeleteValue() {
  return typeof GM_deleteValue === "function" ? GM_deleteValue : null;
}
function modernGmDeleteValue() {
  const gm = userscriptGmApi();
  return typeof gm?.deleteValue === "function" ? gm.deleteValue.bind(gm) : null;
}
function extensionGmDeleteValue() {
  const extension = extensionStorageArea();
  return extension ? (key) => extension.remove(key) : null;
}
function bridgeGmDeleteValue() {
  const bridge = getUserscriptGmStorage();
  return bridge ? (key) => bridge.deleteValue(key) : null;
}
function extensionStorageArea() {
  return extensionCapability((extension) => extension.storage?.local);
}
function extensionCapability(select) {
  const candidate = globalThis;
  return activeExtensionCapability(candidate.browser, select) ?? activeExtensionCapability(candidate.chrome, select) ?? null;
}
function activeExtensionCapability(extension, select) {
  return extension?.runtime?.id && extensionRuntimeMayBeYomu() ? select(extension) : void 0;
}
function packagedExtensionStorageAdapterMissing() {
  if (!isPackagedExtensionDocument()) return false;
  const runtimeInstalled = globalThis.__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ === true;
  return !runtimeInstalled || typeof GM_getValue !== "function" || typeof GM_setValue !== "function";
}
function isPackagedExtensionDocument() {
  try {
  const protocol = globalThis.location?.protocol ?? "";
  return /^(?:chrome|moz|safari-web)-extension:$/.test(protocol);
  } catch {
  return false;
  }
}
function rawExtensionStorageGetValue() {
  const extension = extensionStorageArea();
  return extension ? extensionStorageGetValue(extension) : null;
}
function extensionStorageGetValue(extension) {
  return async (key, fallback) => {
  const value = (await extension.get(key))[key];
  return value === void 0 ? fallback : value;
  };
}
const FACTORY_RESET_SIGNAL_KEY = "yomu:factory-reset-signal";
const managedStateEpochSession = managedStateEpochSessionForRealm();
async function assertRealmManagedStateEpoch(getValue) {
  const readEpoch = getValue ? async () => {
  const epoch2 = await authoritativeManagedStateEpoch(getValue);
  return epoch2.generation === 0 ? void 0 : epoch2;
  } : async () => localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0);
  const epoch = await managedStateEpochSession.assertCurrent(readEpoch);
  return epoch;
}
async function writeManagedGmValue(key, value, epoch, getValue, setValue) {
  await assertManagedStateMutationFence(getValue, epoch);
  const stored = managedStateStoredValue(value, epoch);
  const storageKey = managedStateStorageKey(key, epoch);
  fenceStorageLeaseWrite(key);
  await setValue(storageKey, stored);
  await assertManagedStateMutationFence(getValue, epoch);
}
async function deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue) {
  const storageKey = managedStateStorageKey(key, epoch);
  fenceStorageLeaseWrite(key);
  if (storageKey === key) {
  if (!deleteValue) throw new Error("Managed storage cannot delete its legacy value.");
  await deleteValue(key);
  await assertRealmManagedStateEpoch(getValue);
  return;
  }
  if (!setValue) throw new Error("Managed storage cannot persist a deletion tombstone.");
  await setValue(storageKey, managedStateStoredValue(MISSING, epoch));
  await assertRealmManagedStateEpoch(getValue);
  if (deleteValue) {
  try {
    await deleteValue(key);
  } catch (error) {
    debugStorageError("Managed GM logical-key delete mirror failed", key, error);
  }
  await assertRealmManagedStateEpoch(getValue);
  }
}
function managedStateEpochFromSynchronousGetter(getValue) {
  const stored = getValue(MANAGED_STATE_EPOCH_KEY, MISSING);
  if (isPromiseLike(stored)) {
  void Promise.resolve(stored).catch((error) => debugStorageError("Synchronous epoch probe could not read async storage", MANAGED_STATE_EPOCH_KEY, error));
  return null;
  }
  const shared = parseManagedStateEpoch(isMissingSentinel(stored) ? void 0 : stored);
  managedStateEpochSession.assertCurrentSync(shared.generation === 0 ? void 0 : shared);
  return shared;
}
function managedStateEpochForSynchronousLocalRead() {
  try {
  const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
  if (getValue) {
    const synchronous = managedStateEpochFromSynchronousGetter(getValue);
    if (synchronous) return synchronous;
    return managedStateEpochSession.current() ?? null;
  }
  if (asyncGmGetValue()) return managedStateEpochSession.current() ?? null;
  return managedStateEpochSession.assertCurrentSync(
    localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0)
  );
  } catch (error) {
  debugStorageError("Managed state epoch sync read failed", MANAGED_STATE_EPOCH_KEY, error);
  return null;
  }
}
async function gmStorageGet(key, fallback) {
  const getValue = asyncGmGetValue();
  if (!getValue) {
  if (packagedExtensionStorageAdapterMissing()) return fallback;
  return localOnlyManagedValue(key, fallback, await assertRealmManagedStateEpoch(null));
  }
  let epoch;
  try {
  epoch = await assertRealmManagedStateEpoch(getValue);
  return await sharedManagedValue(getValue, key, fallback, epoch);
  } catch (error) {
  return failedManagedReadValue(error, key, fallback);
  }
}
async function sharedManagedValue(getValue, key, fallback, epoch) {
  const read = await readManagedGmValue(getValue, key, epoch);
  if (read.kind === "found") return read.value;
  if (read.kind === "deleted" || !websiteOnlyValuePresent(key, epoch)) return fallback;
  await adoptWebsiteOnlyStore(getValue, epoch, gmStorageSet).catch((error) => debugStorageError("Website-only store adoption failed", key, error));
  const adopted = await readManagedGmValue(getValue, key, epoch);
  return adopted.kind === "found" ? adopted.value : fallback;
}
function failedManagedReadValue(error, key, fallback) {
  if (isStaleManagedStateEpochError(error)) throw error;
  debugStorageError("GM storage read failed", key, error);
  return fallback;
}
function localOnlyManagedValue(key, fallback, epoch) {
  const local = localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, MISSING) : MISSING;
  if (!isMissingSentinel(local)) return local;
  return fallback;
}
function gmStorageGetSync(key, fallback) {
  if (packagedExtensionStorageAdapterMissing()) return fallback;
  const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
  let epoch = null;
  if (getValue) {
  epoch = managedStateEpochFromSynchronousGetter(getValue);
  if (!epoch) return fallback;
  const read = gmStorageSyncRead(key, getValue, epoch);
  if (read.kind === "found") return read.value;
  if (read.kind === "deleted") return fallback;
  }
  if (asyncGmGetValue()) return fallback;
  epoch ??= managedStateEpochForSynchronousLocalRead();
  return epoch && localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, fallback) : fallback;
}
function gmStorageSyncRead(key, getValue, epoch) {
  try {
  const storageKey = managedStateStorageKey(key, epoch);
  let stored = getValue(storageKey, MISSING);
  if (isPromiseLike(stored)) return { kind: "fallback" };
  const readFromCurrentSlot = !isMissingSentinel(stored);
  if (isMissingSentinel(stored) && storageKey !== key) {
    stored = getValue(key, MISSING);
    if (isPromiseLike(stored)) return { kind: "fallback" };
  }
  if (!isMissingSentinel(stored)) {
    const unreadable = Symbol("unreadable-managed-state");
    const value = managedStateLogicalValue(stored, epoch, unreadable);
    if (value === unreadable) return readFromCurrentSlot ? { kind: "deleted" } : { kind: "fallback" };
    if (isMissingSentinel(value)) return { kind: "deleted" };
    return { kind: "found", value };
  }
  return { kind: "fallback" };
  } catch (error) {
  debugStorageError("GM storage sync read failed", key, error);
  return { kind: "fallback" };
  }
}
async function gmStorageSet(key, value) {
  const getValue = asyncGmGetValue();
  const setValue = asyncGmSetValue();
  if (setValue) return setSharedManagedValue(key, value, getValue, setValue);
  if (getValue) throw storageWriteError(key, "Installed storage has no writer");
  if (packagedExtensionStorageAdapterMissing()) {
  throw storageWriteError(key, "Packaged Study storage adapter is unavailable");
  }
  const epoch = await assertRealmManagedStateEpoch(null);
  writeLocalManagedValueOrThrow(key, value, epoch);
}
async function setSharedManagedValue(key, value, getValue, setValue) {
  let epoch;
  try {
  if (!getValue) throw new Error("Managed storage cannot validate its state epoch.");
  epoch = await assertRealmManagedStateEpoch(getValue);
  await writeManagedGmValue(key, value, epoch, getValue, setValue);
  } catch (error) {
  if (isStaleManagedStateEpochError(error) || isStorageLeaseLapsed(error)) throw error;
  throw storageWriteError(key, "GM storage write failed", error);
  }
}
function gmStorageSetSync(key, value) {
  if (packagedExtensionStorageAdapterMissing()) {
  debugStorageError("Packaged Study storage adapter is unavailable", key, null);
  return;
  }
  const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
  const setValue = typeof GM_setValue === "function" ? GM_setValue : null;
  let epoch = null;
  if (getValue && setValue) {
  try {
    epoch = managedStateEpochFromSynchronousGetter(getValue);
    if (!epoch) {
      void gmStorageSet(key, value).catch((error) => debugStorageError("GM storage async write failed", key, error));
      return;
    }
    const stored = managedStateStoredValue(value, epoch);
    const storageKey = managedStateStorageKey(key, epoch);
    const result = setValue(storageKey, stored);
    if (isPromiseLike(result)) {
      void result.then(async () => {
        await assertRealmManagedStateEpoch(getValue);
      }).catch((error) => debugStorageError("GM storage async write failed", key, error));
      return;
    }
    const after = managedStateEpochFromSynchronousGetter(getValue);
    if (!after || !sameManagedStateEpoch(epoch, after)) return;
    return;
  } catch (error) {
    if (isStaleManagedStateEpochError(error)) {
      debugStorageError("Rejected stale managed state write", key, error);
      return;
    }
    debugStorageError("GM storage sync write failed", key, error);
    return;
  }
  }
  if ((!getValue || !setValue) && asyncGmSetValue()) {
  void gmStorageSet(key, value).catch((error) => debugStorageError("GM storage async write failed", key, error));
  return;
  }
  if (asyncGmGetValue()) return;
  try {
  epoch ??= managedStateEpochForSynchronousLocalRead();
  if (!epoch) return;
  writeLocalManagedValueOrThrow(key, value, epoch);
  } catch (error) {
  debugStorageError("localStorage sync write failed", key, error);
  }
}
async function gmStorageDelete(key) {
  const getValue = asyncGmGetValue();
  const setValue = asyncGmSetValue();
  const deleteValue = asyncGmDeleteValue();
  const hasBackend = Boolean(getValue || setValue || deleteValue);
  if (!hasBackend && packagedExtensionStorageAdapterMissing()) {
  throw storageWriteError(key, "Packaged Study storage adapter is unavailable");
  }
  if (hasBackend && !getValue) {
  throw storageWriteError(key, "Managed storage cannot validate and delete the same backend value");
  }
  if (getValue) {
  try {
    const epoch = await assertRealmManagedStateEpoch(getValue);
    await deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue);
  } catch (error) {
    if (isStaleManagedStateEpochError(error) || isStorageLeaseLapsed(error)) throw error;
    debugStorageError("GM storage delete failed", key, error);
    throw storageWriteError(key, "GM storage delete failed", error);
  }
  } else {
  await assertRealmManagedStateEpoch(null);
  }
  if (getValue) return;
  removeLocalStorageKey(key);
  removeSessionStorageKey(key);
  removeLocalMirrorProvenance(key);
}
function gmStorageDeleteSync(key) {
  if (packagedExtensionStorageAdapterMissing()) {
  debugStorageError("Packaged Study storage adapter is unavailable", key, null);
  return;
  }
  const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
  const setValue = typeof GM_setValue === "function" ? GM_setValue : null;
  const deleteValue = typeof GM_deleteValue === "function" ? GM_deleteValue : null;
  if (getValue && (setValue || deleteValue)) {
  try {
    const epoch = managedStateEpochFromSynchronousGetter(getValue);
    if (!epoch) {
      void gmStorageDelete(key).catch((error) => debugStorageError("GM storage async delete failed", key, error));
      return;
    }
    const storageKey = managedStateStorageKey(key, epoch);
    const result = storageKey === key ? deleteValue?.(key) : setValue?.(storageKey, managedStateStoredValue(MISSING, epoch));
    if (result === void 0 && (storageKey === key ? !deleteValue : !setValue)) {
      void gmStorageDelete(key).catch((error) => debugStorageError("GM storage async delete failed", key, error));
      return;
    }
    if (isPromiseLike(result)) {
      void result.then(async () => {
        await assertRealmManagedStateEpoch(getValue);
      }).catch((error) => debugStorageError("GM storage async delete failed", key, error));
      return;
    }
    const after = managedStateEpochFromSynchronousGetter(getValue);
    if (!after || !sameManagedStateEpoch(epoch, after)) return;
    return;
  } catch (error) {
    debugStorageError("GM storage sync delete failed", key, error);
    return;
  }
  }
  if (asyncGmDeleteValue() || asyncGmSetValue()) {
  void gmStorageDelete(key).catch((error) => debugStorageError("GM storage async delete failed", key, error));
  return;
  }
  if (asyncGmGetValue()) return;
  try {
  if (!managedStateEpochForSynchronousLocalRead()) return;
  removeLocalManagedValue(key);
  } catch (error) {
  debugStorageError("localStorage sync delete failed", key, error);
  }
}
function parseFactoryResetSignal(value) {
  const parsed = typeof value === "string" ? parseJsonRecord(value) : value;
  if (!isFactoryResetSignalRecord(parsed)) return null;
  const record2 = parsed;
  if (!isValidFactoryResetPhase(record2.phase)) return null;
  return {
  id: record2.id,
  phase: record2.phase,
  at: factoryResetSignalTime(record2.at),
  href: factoryResetSignalHref(record2.href)
  };
}
function factoryResetSignalTime(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}
function factoryResetSignalHref(value) {
  return typeof value === "string" ? value : "";
}
function isFactoryResetSignalRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && value.id?.trim());
}
function isValidFactoryResetPhase(value) {
  return value === "prepare" || value === "complete";
}
function parseJsonRecord(value) {
  try {
  return JSON.parse(value);
  } catch {
  return null;
  }
}
async function assertManagedStateMutationFence(getValue, expected) {
  const before = getValue ? await authoritativeManagedStateEpoch(getValue) : parseManagedStateEpoch(localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0));
  if (!sameManagedStateEpoch(expected, before)) throw new StaleManagedStateEpochError(expected, before);
  const rawSignal = getValue ? await getValue(FACTORY_RESET_SIGNAL_KEY, MISSING) : localStorageGet(FACTORY_RESET_SIGNAL_KEY, MISSING);
  const signal = isMissingSentinel(rawSignal) ? null : parseFactoryResetSignal(rawSignal);
  if (signal?.phase === "prepare" || managedStateWritesSuppressed()) {
  throw new Error("Managed state writes are suppressed during factory reset.");
  }
  const after = getValue ? await authoritativeManagedStateEpoch(getValue) : parseManagedStateEpoch(localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0));
  if (!sameManagedStateEpoch(expected, after)) throw new StaleManagedStateEpochError(expected, after);
}
function debugStorageError(message, key, error) {
  if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key, error });
}
const BUNPRO_SRS_TIERS = ["beginner", "adept", "seasoned", "expert", "master", "ghost"];
const BUNPRO_WORD_STATES_STORAGE_KEY = "yomu:bunpro-word-states:v1";
const BUNPRO_WORD_STATES_TTL_MS = 6 * 60 * 60 * 1e3;
const BUNPRO_WORD_STATES_RETRY_BACKOFF_MS = 5 * 60 * 1e3;
const BUNPRO_WORD_STATES_MAX_PAGES = 50;
class BunproWordStateStore {
  constructor(client, ttlMs = BUNPRO_WORD_STATES_TTL_MS) {
  this.client = client;
  this.ttlMs = ttlMs;
  }
  states = null;
  pending = null;
  /** Drop the in-memory index (settings may have changed). The persisted
   * cache stays — it is validated against the credential fingerprint on the
   * next load, so a token swap can never colour from the previous account
   * while an unrelated settings change keeps the cheap warm cache. */
  clear() {
  this.states = null;
  this.retryAfter = 0;
  }
  async load(now = Date.now()) {
  if (this.states) return this.states;
  if (now < this.retryAfter) return null;
  this.pending ??= this.loadFresh(now).finally(() => {
    this.pending = null;
  });
  return this.pending;
  }
  retryAfter = 0;
  async loadFresh(now) {
  const credential = this.client.frontendCredentialFingerprint();
  const stored = await gmStorageGet(BUNPRO_WORD_STATES_STORAGE_KEY, null);
  const storedForUser = stored && (stored.credential ?? "") === credential ? stored : null;
  const cached = restoreBunproWordStates(storedForUser);
  if (cached && storedForUser && now - storedForUser.fetchedAt < this.ttlMs) {
    this.states = cached;
    return cached;
  }
  if (!this.client.hasFrontendCredential()) return cached;
  try {
    const fetched = await fetchBunproWordStates(this.client);
    await gmStorageSet(BUNPRO_WORD_STATES_STORAGE_KEY, persistableBunproWordStates(fetched, now, credential));
    this.states = fetched;
    return fetched;
  } catch {
    this.states = cached;
    if (!cached) this.retryAfter = now + BUNPRO_WORD_STATES_RETRY_BACKOFF_MS;
    return cached;
  }
  }
}
function effectiveBunproWordState(entry, now = Date.now()) {
  const duePromotable = entry.state === "learning" || entry.state === "known";
  if (duePromotable && entry.dueAt !== null && entry.dueAt <= now) return "due";
  return entry.state;
}
async function fetchBunproWordStates(client) {
  const overview = await client.getSrsOverview();
  const vocabCounts = tierCounts(overview);
  const states = /* @__PURE__ */ new Map();
  let pageBudget = BUNPRO_WORD_STATES_MAX_PAGES;
  for (const tier of BUNPRO_SRS_TIERS) {
  if (!vocabCounts[tier]) continue;
  let page = 1;
  let pages = 1;
  while (page <= pages && pageBudget > 0) {
    pageBudget -= 1;
    const response = await client.getSrsLevelDetails(tier, "Vocab", page);
    pages = Math.min(pageCount(response), page + pageBudget);
    collectBunproWordStates(response, tier, states);
    page += 1;
  }
  }
  return states;
}
function collectBunproWordStates(response, tier, states) {
  const reviews = objectAt$1(response, "reviews") ?? (isNonNullObject(response) ? response : null);
  if (!reviews) return;
  const titles = reviewableTitlesById(arrayAt(reviews, "included"));
  for (const review of arrayAt(reviews, "data")) {
  addBunproWordState(review, tier, titles, states);
  }
}
function addBunproWordState(review, tier, titles, states) {
  const attributes = objectAt$1(review, "attributes") ?? (isNonNullObject(review) ? review : null);
  if (!attributes) return;
  const title = titles.get(String(attributes.reviewable_id ?? ""));
  if (!title) return;
  states.set(title, {
  state: bunproTierCardState(tier, numberAt(attributes, "streak")),
  dueAt: parseEpoch(attributes.next_review)
  });
}
function bunproTierCardState(tier, streak) {
  if (tier === "ghost") return "failed";
  if (tier === "master") return "known";
  if (streak !== null && streak <= 0) return "new";
  return "learning";
}
function reviewableTitlesById(included) {
  const titles = /* @__PURE__ */ new Map();
  for (const item of included) {
  const attributes = objectAt$1(item, "attributes");
  if (!attributes) continue;
  const id = String(attributes.id ?? "");
  const title = typeof attributes.title === "string" ? attributes.title.trim() : "";
  if (id && title) titles.set(id, title);
  }
  return titles;
}
function tierCounts(overview) {
  const vocab = objectAt$1(overview, "vocab");
  const counts = {};
  for (const tier of BUNPRO_SRS_TIERS) {
  const count = numberAt(vocab, tier);
  counts[tier] = count ?? (vocab ? 0 : 1);
  }
  return counts;
}
function pageCount(response) {
  return numberAt(objectAt$1(response, "pagy"), "pages") ?? 1;
}
function restoreBunproWordStates(stored) {
  if (!stored || !isNonNullObject(stored.states)) return null;
  const states = /* @__PURE__ */ new Map();
  for (const [expression, entry] of Object.entries(stored.states)) {
  if (!isNonNullObject(entry) || typeof entry.s !== "string") continue;
  states.set(expression, {
    state: entry.s,
    dueAt: typeof entry.d === "number" ? entry.d : null
  });
  }
  return states;
}
function persistableBunproWordStates(states, fetchedAt, credential) {
  const stored = {};
  states.forEach((entry, expression) => {
  stored[expression] = { s: entry.state, d: entry.dueAt };
  });
  return { fetchedAt, credential, states: stored };
}
function parseEpoch(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function numberAt(value, key) {
  if (!isNonNullObject(value)) return null;
  const raw = Number(value[key]);
  return Number.isFinite(raw) ? raw : null;
}
function arrayAt(value, key) {
  if (!isNonNullObject(value)) return [];
  const raw = value[key];
  return Array.isArray(raw) ? raw : [];
}
function objectAt$1(value, key) {
  const nested = isNonNullObject(value) ? value[key] : null;
  return isNonNullObject(nested) && !Array.isArray(nested) ? nested : null;
}
const BUNPRO_SETTINGS_URL = "https://bunpro.jp/settings/api";
function createBunproSrsAdapter(client) {
  return {
  id: "bunpro",
  label: "Bunpro",
  capabilities: { stats: true, queue: true, review: true, mine: true, import: false },
  hasCredential: () => client.hasFrontendCredential(),
  verify: () => client.getUser().then(() => true, () => false),
  stats: async () => {
    const [base, due] = await Promise.all([client.getBaseStats(), client.getDueCount().catch(() => null)]);
    return normalizeBunproStatsResponse(base, due);
  },
  queue: async (limit) => normalizeBunproQueueResponse(await client.getQueue(), limit),
  review: (request) => reviewBunproCard(client, request),
  mine: (request) => mineBunproCard(client, request)
  };
}
function normalizeBunproQueueResponse(raw, limit = 50) {
  const reviewSessionId = readString(raw, ["review_session_id", "reviewSessionId"]);
  const cards = collectBunproReviewables(raw).map((card) => normalizeBunproReviewable(card)).filter((card) => card !== null).map((card) => {
  if (!reviewSessionId) return card;
  const endpoint = normalizeBunproReviewEndpoint(readString(card.raw, ["review_endpoint_kind", "reviewEndpointKind"]));
  return {
    ...card,
    reviewSession: {
      id: reviewSessionId,
      inputMode: endpoint === "review" && readBoolean(card.raw, ["is_fsrs", "isFsrs"]) ? "fsrs" : "regular",
      endpoint
    }
  };
  }).slice(0, Math.max(0, Math.floor(limit)));
  return {
  providerId: "bunpro",
  fetchedAt: Date.now(),
  cards,
  dueCount: readFirstNumber(raw, ["due_count", "dueCount", "reviews_due", "reviewsDue", "total_pending_attempt_count"]) ?? cards.filter((card) => card.state.includes("due")).length,
  newCount: readFirstNumber(raw, ["new_count", "newCount", "new_cards", "newCards"]) ?? cards.filter((card) => card.state.includes("new")).length,
  reviewCount: readFirstNumber(raw, ["review_count", "reviewCount", "reviews_count", "reviewsCount"]) ?? cards.length
  };
}
function normalizeBunproStatsResponse(raw, due) {
  const source = isNonNullObject(raw) ? { ...objectAt(raw, "facts") ?? {}, ...raw } : raw;
  return {
  providerId: "bunpro",
  fetchedAt: Date.now(),
  reviewsDue: bunproDueTotal(due) ?? readFirstNumber(source, ["reviews_due", "reviewsDue", "due", "due_count"]),
  reviewsToday: readFirstNumber(source, ["reviews_today", "reviewsToday", "reviews_done_today"]),
  newToday: readFirstNumber(source, ["new_today", "newToday", "new_cards_today"]),
  streakDays: readFirstNumber(source, ["streak", "streak_days", "streakDays"]),
  levelCounts: normalizeLevelCounts(raw),
  raw
  };
}
function bunproDueTotal(due) {
  const grammar = readFirstNumber(due, ["total_due_grammar"]);
  const vocab = readFirstNumber(due, ["total_due_vocab"]);
  if (grammar === void 0 && vocab === void 0) return void 0;
  return (grammar ?? 0) + (vocab ?? 0);
}
function normalizeBunproReviewable(raw, fallbackKind = "grammar") {
  const record2 = reviewableRecord(raw);
  if (!record2) return null;
  const id = readString(record2, ["id", "review_id", "reviewId", "card_id", "cardId"]) || readString(raw, ["id"]) || readString(record2, ["reviewable_id", "reviewableId", "grammar_id", "grammarId", "vocab_id", "vocabId"]);
  const reviewableId = readString(record2, ["reviewable_id", "reviewableId", "grammar_id", "grammarId", "vocab_id", "vocabId"]);
  const expression = readString(record2, ["grammar_point", "grammarPoint", "japanese", "word", "expression", "slug", "title"]) || readString(raw, ["slug", "title"]);
  if (!id || !expression) return null;
  const kind = normalizeBunproKind(
  readString(record2, ["reviewable_type", "reviewableType", "type", "kind"]),
  inferBunproKind(record2, fallbackKind)
  );
  const slug = readString(record2, ["slug", "grammar_point_slug", "grammarPointSlug"]);
  return {
  providerId: "bunpro",
  providerCardId: id,
  providerReviewId: readString(record2, ["review_id", "reviewId"]) || id,
  providerReviewableId: reviewableId || void 0,
  kind,
  expression,
  reading: readString(record2, ["reading", "kana", "furigana"]) || expression,
  meanings: normalizeBunproMeanings(record2, kind),
  state: normalizeBunproCardState(readString(record2, ["srs_stage", "srsStage", "srs_level", "srsLevel", "status", "state"])),
  srsLevel: readString(record2, ["srs_stage", "srsStage", "srs_level", "srsLevel"]) || void 0,
  dueAt: readFirstDate(record2, ["next_review_at", "nextReviewAt", "due_at", "dueAt"]),
  lastReviewAt: readFirstDate(record2, ["last_reviewed_at", "lastReviewedAt", "last_review_at", "lastReviewAt"]),
  sourceUrl: bunproReviewableUrl(kind, slug || reviewableId || id),
  raw
  };
}
async function reviewBunproCard(client, request) {
  const reviewId = request.card.providerReviewId || request.card.providerCardId;
  const session = request.card.reviewSession;
  if (!positiveIntegerString(reviewId)) {
  throw new BunproApiError("Bunpro grading needs a valid numeric review id. Reload the Bunpro queue and try again.");
  }
  if (!session || !positiveIntegerString(session.id)) {
  throw new BunproApiError("Bunpro grading needs an active review session. Reload the Bunpro queue and try again.");
  }
  if (session.inputMode === "fsrs" && session.endpoint !== "review") {
  throw new BunproApiError("Bunpro FSRS grading is available only for ordinary review cards. Reload the queue and try again.");
  }
  const input = bunproReviewInput(session.inputMode, request.grade);
  const body = {
  review_session_id: Number(session.id),
  correct: input.correct,
  fsrs_input: input.fsrsInput,
  loaded_review_ids: null,
  loaded_ghost_review_ids: null,
  loaded_self_study_review_ids: null
  };
  if (input.incorrectAnswer) body.incorrect_answer = input.incorrectAnswer;
  const raw = await client.updateReview(reviewId, body, session.endpoint);
  const normalized = normalizeBunproReviewable(raw);
  return { card: normalized ? { ...normalized, reviewSession: session } : request.card, raw };
}
async function mineBunproCard(client, request) {
  const rawSearch = await client.search(request.expression, { grammar: request.kind !== "vocabulary", vocab: request.kind !== "grammar", limit: 12 });
  const requestedKind = request.kind === "grammar" ? "grammar" : "vocabulary";
  const reviewable = exactBunproSearchReviewable(rawSearch, request.expression, request.reading, requestedKind);
  if (!reviewable) throw new BunproApiError(`No Bunpro item found for "${request.expression}".`, void 0, "bunproNoMatchingWord");
  if (reviewable.kind !== "vocabulary" && reviewable.kind !== "grammar") {
  throw new BunproApiError(`Bunpro can only add vocabulary and grammar points from Yomu (${reviewable.kind} was returned).`);
  }
  const providerReviewableId = reviewable.providerReviewableId || reviewable.providerCardId;
  const providerReviewableIdNumber = Number(providerReviewableId);
  if (!Number.isFinite(providerReviewableIdNumber) || providerReviewableIdNumber <= 0) {
  throw new BunproApiError(`Bunpro returned no addable reviewable id for "${request.expression}".`);
  }
  const type = reviewable.kind === "vocabulary" ? "Vocab" : "GrammarPoint";
  const raw = await client.updateReviewsViaActionType({
  actionType: "add",
  reviewables: [{ type, id: providerReviewableIdNumber }]
  });
  return { card: { ...reviewable, providerReviewableId }, raw };
}
function bunproReviewInput(mode, grade) {
  if (mode === "regular") {
  if (grade === "fail") return { correct: false, fsrsInput: null, incorrectAnswer: "__FLASHCARD_REGULAR_HARD" };
  if (grade === "pass") return { correct: true, fsrsInput: null };
  throw new BunproApiError("This Bunpro review accepts only Hard or Good.");
  }
  if (grade === "nothing" || grade === "again") return { correct: false, fsrsInput: "again", incorrectAnswer: "__FLASHCARD_FSRS_AGAIN" };
  if (grade === "hard") return { correct: false, fsrsInput: "hard", incorrectAnswer: "__FLASHCARD_FSRS_HARD" };
  if (grade === "okay" || grade === "good") return { correct: true, fsrsInput: "good" };
  if (grade === "easy") return { correct: true, fsrsInput: "easy" };
  throw new BunproApiError("This Bunpro FSRS review accepts Again, Hard, Good, or Easy.");
}
function collectBunproReviewables(raw) {
  const quizEntries = collectBunproQuizIndexEntries(raw);
  if (quizEntries.length) return quizEntries;
  const arrays = [
  readArray(raw, ["data"]),
  readArray(raw, ["reviews"]),
  readArray(raw, ["reviewables"]),
  readArray(raw, ["items"]),
  readArray(raw, ["queue"]),
  readArray(raw, ["due"])
  ];
  return arrays.find((items) => items.length) ?? (Array.isArray(raw) ? raw : []);
}
function collectBunproQuizIndexEntries(raw) {
  if (!isNonNullObject(raw)) return [];
  const entries2 = [...readArray(raw, ["pending_attempt"]), ...readArray(raw, ["pending_wrapup"])];
  return entries2.map((entry) => flattenBunproQuizIndexEntry(entry)).filter((entry) => entry !== null);
}
function flattenBunproQuizIndexEntry(entry) {
  if (!isNonNullObject(entry)) return null;
  const review = objectAt(entry, "data");
  if (!review) return null;
  const attributes = objectAt(review, "attributes") ?? {};
  const reviewId = readString(review, ["id"]) || readString(attributes, ["id"]);
  if (!reviewId) return null;
  const reviewable = bunproQuizIndexReviewable(entry, attributes);
  return {
  ...reviewable,
  ...attributes,
  // Slugs can be disambiguated ("カレー-dup"); the title is the word.
  japanese: readString(reviewable, ["title"]) || void 0,
  id: reviewId,
  review_id: reviewId,
  review_endpoint_kind: bunproQuizReviewEndpoint(attributes),
  // `state` is the last key the shared normalizer's srs_stage/srs_level/
  // status/state chain reads, so nothing else may reintroduce those keys.
  state: "due",
  srs_stage: void 0,
  srs_level: void 0,
  status: void 0,
  next_review_at: readString(attributes, ["next_review"]) || void 0
  };
}
function bunproQuizReviewEndpoint(attributes) {
  if (readString(attributes, ["user_study_question_id", "userStudyQuestionId"])) return "self-study-review";
  return Object.prototype.hasOwnProperty.call(attributes, "ghost_count") ? "review" : "ghost-review";
}
function normalizeBunproReviewEndpoint(value) {
  if (value === "ghost-review" || value === "self-study-review") return value;
  return "review";
}
function bunproQuizIndexReviewable(entry, reviewAttributes) {
  const type = readString(reviewAttributes, ["reviewable_type"]).toLowerCase();
  const wantedKind = type.includes("vocab") ? "vocab" : "grammar_point";
  const included = readArray(entry, ["included"]);
  for (const item of included) {
  if (!isNonNullObject(item) || readString(item, ["type"]) !== wantedKind) continue;
  const attributes = objectAt(item, "attributes");
  if (attributes) return attributes;
  }
  return {};
}
function exactBunproSearchReviewable(raw, expression, reading, preferredKind) {
  const record2 = isNonNullObject(raw) ? raw : {};
  const section = preferredKind === "vocabulary" ? record2.vocabs : record2.grammar_points;
  const hits = readArray(section, ["data"]).map((hit) => normalizeBunproReviewable(hit, preferredKind)).filter((hit) => hit !== null).filter((hit) => normalizedLookupText$1(hit.expression) === normalizedLookupText$1(expression));
  if (!hits.length) return null;
  if (reading) {
  const readingMatches = hits.filter((hit) => normalizedLookupText$1(hit.reading) === normalizedLookupText$1(reading));
  if (readingMatches.length === 1) return readingMatches[0] ?? null;
  if (readingMatches.length > 1) return sameBunproReviewableIdentity(readingMatches) ? readingMatches[0] ?? null : null;
  return null;
  }
  return hits.length === 1 || sameBunproReviewableIdentity(hits) ? hits[0] ?? null : null;
}
function normalizedLookupText$1(value) {
  return value.normalize("NFKC").trim();
}
function sameBunproReviewableIdentity(cards) {
  const first = cards[0];
  return Boolean(first && cards.every((card) => card.providerCardId === first.providerCardId));
}
function positiveIntegerString(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}
function reviewableRecord(raw) {
  const unwrapped = unwrapBunproData(raw);
  if (!isNonNullObject(unwrapped)) return null;
  const attributes = objectAt(unwrapped, "attributes");
  return attributes ? { ...unwrapped, ...attributes } : unwrapped;
}
function unwrapBunproData(value) {
  if (!isNonNullObject(value)) return value;
  const data = value.data;
  if (isNonNullObject(data) && !Array.isArray(data)) return data;
  const review = value.review;
  if (isNonNullObject(review)) return review;
  const item = value.item;
  if (isNonNullObject(item)) return item;
  return value;
}
function normalizeBunproKind(value, fallback) {
  const normalized = value.toLowerCase();
  if (normalized.includes("vocab")) return "vocabulary";
  if (normalized.includes("grammar")) return "grammar";
  if (normalized.includes("kanji")) return "kanji";
  if (normalized.includes("sentence") || normalized.includes("question")) return "sentence";
  return fallback;
}
function inferBunproKind(record2, fallback) {
  if (readString(record2, ["vocab_id", "vocabId", "vocabulary_id", "vocabularyId", "word"])) return "vocabulary";
  if (readString(record2, ["grammar_id", "grammarId", "grammar_point", "grammarPoint"])) return "grammar";
  return fallback;
}
function normalizeBunproCardState(value) {
  const normalized = value.toLowerCase();
  if (!normalized) return ["in-deck"];
  if (normalized.includes("due") || normalized.includes("review")) return ["due"];
  if (normalized.includes("new") || normalized.includes("beginner")) return ["new"];
  if (normalized.includes("ghost") || normalized.includes("fail")) return ["failed"];
  if (normalized.includes("master") || normalized.includes("known")) return ["known"];
  if (normalized.includes("seasoned") || normalized.includes("expert") || normalized.includes("adept")) return ["learning"];
  return ["in-deck"];
}
function normalizeBunproMeanings(record2, kind) {
  const glosses = readStringList(record2, ["meaning", "meanings", "english", "translation", "translations", "definition"]).filter(Boolean);
  return glosses.length ? [{ glosses, partOfSpeech: kind === "grammar" ? ["grammar"] : [] }] : [];
}
function normalizeLevelCounts(raw) {
  const record2 = objectAt(raw, "srs_level_counts") ?? objectAt(raw, "srsLevelCounts") ?? objectAt(raw, "level_counts") ?? objectAt(raw, "levelCounts");
  if (!record2) return void 0;
  const counts = {};
  for (const [key, value] of Object.entries(record2)) {
  const number = Number(value);
  if (Number.isFinite(number)) counts[key] = number;
  }
  return Object.keys(counts).length ? counts : void 0;
}
function bunproReviewableUrl(kind, slugOrId) {
  const value = slugOrId.trim();
  if (!value) return BUNPRO_SETTINGS_URL;
  const encoded = encodeURIComponent(value);
  if (kind === "vocabulary") return `https://bunpro.jp/vocabs/${encoded}`;
  if (kind === "sentence") return BUNPRO_SETTINGS_URL;
  return `https://bunpro.jp/grammar_points/${encoded}`;
}
function readFirstDate(value, keys) {
  const raw = readString(value, keys);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
function readFirstNumber(value, keys) {
  const record2 = isNonNullObject(value) ? value : null;
  if (!record2) return void 0;
  for (const key of keys) {
  const number = Number(record2[key]);
  if (Number.isFinite(number)) return number;
  }
  const data = record2.data;
  if (isNonNullObject(data) && !Array.isArray(data)) return readFirstNumber(data, keys);
  const attributes = objectAt(record2, "attributes");
  return attributes ? readFirstNumber(attributes, keys) : void 0;
}
function readBoolean(value, keys) {
  const record2 = isNonNullObject(value) ? value : null;
  if (!record2) return false;
  for (const key of keys) {
  const raw = record2[key];
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "1" || raw === "true") return true;
  }
  const data = record2.data;
  if (isNonNullObject(data) && !Array.isArray(data)) return readBoolean(data, keys);
  const attributes = objectAt(record2, "attributes");
  return attributes ? readBoolean(attributes, keys) : false;
}
function readString(value, keys) {
  const record2 = isNonNullObject(value) ? value : null;
  if (!record2) return "";
  for (const key of keys) {
  const raw = record2[key];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  const data = record2.data;
  if (isNonNullObject(data) && !Array.isArray(data)) return readString(data, keys);
  return "";
}
function readStringList(value, keys) {
  const record2 = isNonNullObject(value) ? value : null;
  if (!record2) return [];
  for (const key of keys) {
  const raw = record2[key];
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (Array.isArray(raw)) return raw.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  }
  return [];
}
function readArray(value, keys) {
  const record2 = isNonNullObject(value) ? value : null;
  if (!record2) return [];
  for (const key of keys) {
  const raw = record2[key];
  if (Array.isArray(raw)) return raw;
  }
  const data = record2.data;
  if (isNonNullObject(data) && !Array.isArray(data)) return readArray(data, keys);
  return [];
}
function objectAt(value, key) {
  if (!isNonNullObject(value)) return null;
  const nested = value[key];
  return isNonNullObject(nested) && !Array.isArray(nested) ? nested : null;
}
const locales = [
  {
  tag: "en",
  reviewStatus: "source-approved",
  rtlVerified: true,
  humanReview: {
    reviewer: "source locale",
    evidence: "English is the source of record for every message ID."
  },
  available: true,
  blockers: []
  },
  {
  tag: "ja",
  reviewStatus: "native-reviewed",
  rtlVerified: true,
  humanReview: {
    reviewer: "owner",
    evidence: "Japanese is a shipped reference locale; tests/reader/i18n.test.ts enforces exact key parity with English and rejects the 未翻訳 placeholder."
  },
  available: true,
  blockers: []
  },
  {
  tag: "ar",
  reviewStatus: "machine-draft",
  rtlVerified: false,
  humanReview: null,
  available: false,
  blockers: [
    "rtl-verification-pending",
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "fa",
  reviewStatus: "machine-draft",
  rtlVerified: false,
  humanReview: null,
  available: false,
  blockers: [
    "rtl-verification-pending",
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "sq",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "grc",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "yue",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "zh",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "da",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "nl",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "fi",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "fr",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "de",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "el",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "hu",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "id",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "it",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "km",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "ko",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "lo",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "la",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "mn",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "pl",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "pt",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "ro",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "ru",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "sh",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "es",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "sv",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "tl",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "th",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "tr",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  },
  {
  tag: "vi",
  reviewStatus: "machine-draft",
  rtlVerified: true,
  humanReview: null,
  available: false,
  blockers: [
    "translation-incomplete",
    "human-review-pending"
  ]
  }
];
const rtlGate = {
  items: [
  {
    id: "direction-propagation",
    done: true,
    note: "lang/dir stamped on every reader-owned root, shadow host, overlay, popover, bottom sheet, backdrop, new-tab/study app and the hosted docs document. The host page's own documentElement is deliberately NOT touched: Yomu is injected into pages it does not own, and flipping their dir would rewrite the page a learner is reading."
  },
  {
    id: "logical-css-properties",
    done: false,
    note: "Shared chrome CSS converted from margin/padding-left/right and text-align:left/right to inline logical properties. Deferred: subtitles-youtube.css and youtube-filter.css, whose offsets are computed against video frame geometry, and every `left`/`right`/`inset` used for positioning, which the plan requires to stay physical."
  },
  {
    id: "bidi-isolation",
    done: false,
    note: "HALF DONE, and the half that is missing is the larger one. Substituted values ARE isolated: formatUiText routes through formatIsolated when the interface is RTL, so a term, count, version or source name interpolated into a message cannot reorder the sentence around it. NOT done: systematically wrapping the target terms, definitions, source names, URLs, codes and keyboard shortcuts that chrome renders as their own elements with lang and dir=auto. Those are rendered in dozens of templates and each needs its own decision."
  },
  {
    id: "font-stacks",
    done: true,
    note: "Per-script interface font stacks in the locale manifest."
  },
  {
    id: "geometry-verification",
    done: false,
    note: "Popover collision/flip, selection anchor and arrow, resize/drag handles, pinned HUD, toast, bottom sheet, nested menus, vertical Japanese text and media controls under an RTL interface. Not verified."
  },
  {
    id: "viewport-and-zoom-matrix",
    done: false,
    note: "Arabic, Farsi and a long pseudo-RTL locale at 320/768/1440px, 100%/200% zoom, four anchor edges, keyboard-only navigation and reduced motion. Not run."
  },
  {
    id: "real-app-screenshots",
    done: false,
    note: "Approved real-app screenshots, not fixture-only proof. Only the disabled-with-reason picker state has been captured."
  },
  {
    id: "owner-acceptance",
    done: false,
    note: "Explicit owner acceptance of Arabic/Farsi overlay and popover behaviour."
  }
  ]
};
const interfaceLocaleLedger = {
  locales,
  rtlGate
};
const languages = [
  {
  id: "sq",
  runtimeLocale: "sq",
  englishName: "Albanian",
  nativeName: "Shqip",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "grc",
  runtimeLocale: "grc",
  englishName: "Ancient Greek",
  nativeName: "Ἑλληνιστί",
  defaultScript: "Grek",
  scripts: [
    "Grek"
  ],
  direction: "ltr"
  },
  {
  id: "ar",
  runtimeLocale: "ar",
  englishName: "Arabic",
  nativeName: "العربية",
  defaultScript: "Arab",
  scripts: [
    "Arab"
  ],
  direction: "rtl"
  },
  {
  id: "yue",
  runtimeLocale: "yue-Hant",
  englishName: "Cantonese",
  nativeName: "粵語",
  defaultScript: "Hant",
  scripts: [
    "Hant"
  ],
  direction: "ltr"
  },
  {
  id: "zh",
  runtimeLocale: "zh-Hans",
  englishName: "Chinese",
  nativeName: "中文（简体）",
  defaultScript: "Hans",
  scripts: [
    "Hans",
    "Hant"
  ],
  direction: "ltr"
  },
  {
  id: "da",
  runtimeLocale: "da",
  englishName: "Danish",
  nativeName: "Dansk",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "nl",
  runtimeLocale: "nl",
  englishName: "Dutch",
  nativeName: "Nederlands",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "en",
  runtimeLocale: "en",
  englishName: "English",
  nativeName: "English",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "fi",
  runtimeLocale: "fi",
  englishName: "Finnish",
  nativeName: "Suomi",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "fr",
  runtimeLocale: "fr",
  englishName: "French",
  nativeName: "Français",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "de",
  runtimeLocale: "de",
  englishName: "German",
  nativeName: "Deutsch",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "el",
  runtimeLocale: "el",
  englishName: "Greek",
  nativeName: "Ελληνικά",
  defaultScript: "Grek",
  scripts: [
    "Grek"
  ],
  direction: "ltr"
  },
  {
  id: "hu",
  runtimeLocale: "hu",
  englishName: "Hungarian",
  nativeName: "Magyar",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "id",
  runtimeLocale: "id",
  englishName: "Indonesian",
  nativeName: "Bahasa Indonesia",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "it",
  runtimeLocale: "it",
  englishName: "Italian",
  nativeName: "Italiano",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "km",
  runtimeLocale: "km",
  englishName: "Khmer",
  nativeName: "ខ្មែរ",
  defaultScript: "Khmr",
  scripts: [
    "Khmr"
  ],
  direction: "ltr"
  },
  {
  id: "ko",
  runtimeLocale: "ko",
  englishName: "Korean",
  nativeName: "한국어",
  defaultScript: "Kore",
  scripts: [
    "Kore"
  ],
  direction: "ltr"
  },
  {
  id: "lo",
  runtimeLocale: "lo",
  englishName: "Lao",
  nativeName: "ລາວ",
  defaultScript: "Laoo",
  scripts: [
    "Laoo"
  ],
  direction: "ltr"
  },
  {
  id: "la",
  runtimeLocale: "la",
  englishName: "Latin",
  nativeName: "Latina",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "mn",
  runtimeLocale: "mn-Cyrl",
  englishName: "Mongolian",
  nativeName: "Монгол",
  defaultScript: "Cyrl",
  scripts: [
    "Cyrl",
    "Mong"
  ],
  direction: "ltr"
  },
  {
  id: "fa",
  runtimeLocale: "fa",
  englishName: "Persian",
  nativeName: "فارسی",
  defaultScript: "Arab",
  scripts: [
    "Arab"
  ],
  direction: "rtl"
  },
  {
  id: "pl",
  runtimeLocale: "pl",
  englishName: "Polish",
  nativeName: "Polski",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "pt",
  runtimeLocale: "pt",
  englishName: "Portuguese",
  nativeName: "Português",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "ro",
  runtimeLocale: "ro",
  englishName: "Romanian",
  nativeName: "Română",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "ru",
  runtimeLocale: "ru",
  englishName: "Russian",
  nativeName: "Русский",
  defaultScript: "Cyrl",
  scripts: [
    "Cyrl"
  ],
  direction: "ltr"
  },
  {
  id: "sh",
  runtimeLocale: "sr-Latn",
  englishName: "Serbo-Croatian",
  nativeName: "Srpskohrvatski",
  defaultScript: "Latn",
  scripts: [
    "Latn",
    "Cyrl"
  ],
  direction: "ltr"
  },
  {
  id: "es",
  runtimeLocale: "es",
  englishName: "Spanish",
  nativeName: "Español",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "sv",
  runtimeLocale: "sv",
  englishName: "Swedish",
  nativeName: "Svenska",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "tl",
  runtimeLocale: "fil",
  englishName: "Tagalog",
  nativeName: "Tagalog",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "th",
  runtimeLocale: "th",
  englishName: "Thai",
  nativeName: "ไทย",
  defaultScript: "Thai",
  scripts: [
    "Thai"
  ],
  direction: "ltr"
  },
  {
  id: "tr",
  runtimeLocale: "tr",
  englishName: "Turkish",
  nativeName: "Türkçe",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  },
  {
  id: "vi",
  runtimeLocale: "vi",
  englishName: "Vietnamese",
  nativeName: "Tiếng Việt",
  defaultScript: "Latn",
  scripts: [
    "Latn"
  ],
  direction: "ltr"
  }
];
const languageConfig = {
  languages
};
const configuredLanguages = languageConfig.languages;
const LEARNER_LANGUAGES = Object.freeze(
  configuredLanguages.map(
  (language) => Object.freeze({
    ...language,
    scripts: Object.freeze([...language.scripts])
  })
  )
);
new Map(
  LEARNER_LANGUAGES.map((language) => [language.id, language])
);
const JAPANESE_INTERFACE_LOCALE = Object.freeze({
  id: "ja",
  runtimeLocale: "ja",
  englishName: "Japanese",
  nativeName: "日本語",
  defaultScript: "Jpan",
  direction: "ltr"
});
const RTL_SCRIPTS$1 = /* @__PURE__ */ new Set(["Arab", "Hebr", "Thaa", "Nkoo", "Adlm", "Syrc"]);
const SCRIPT_FONT_STACKS = Object.freeze({
  Latn: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Grek: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Cyrl: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Arab: '"SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, "Noto Naskh Arabic", system-ui, sans-serif',
  Jpan: 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif',
  Hans: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  Hant: 'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif',
  Kore: 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
  Thai: 'system-ui, -apple-system, "Thonburi", "Leelawadee UI", "Noto Sans Thai", sans-serif',
  Laoo: 'system-ui, -apple-system, "Lao Sangam MN", "Leelawadee UI", "Noto Sans Lao", sans-serif',
  Khmr: 'system-ui, -apple-system, "Khmer Sangam MN", "Leelawadee UI", "Noto Sans Khmer", sans-serif',
  Mong: 'system-ui, -apple-system, "Noto Sans Mongolian", sans-serif'
});
const FALLBACK_FONT_STACK = SCRIPT_FONT_STACKS.Latn;
function scriptFontStack(script) {
  return SCRIPT_FONT_STACKS[script] ?? FALLBACK_FONT_STACK;
}
function directionForScript(script) {
  return RTL_SCRIPTS$1.has(script) ? "rtl" : "ltr";
}
const LEDGER_ROWS = new Map(
  interfaceLocaleLedger.locales.map((row) => [row.tag, row])
);
function fallbackChainFor(tag, id) {
  const chain = [];
  const push = (value) => {
  if (value !== tag && !chain.includes(value)) chain.push(value);
  };
  const base = tag.split("-")[0];
  push(base);
  push(id);
  if (id === "sh") {
  push("sr");
  push("hr");
  push("bs");
  }
  if (id === "tl") push("fil");
  if (id !== "en") push("en");
  return Object.freeze(chain);
}
function buildLocale(source) {
  const ledger = LEDGER_ROWS.get(source.id);
  if (!ledger) throw new Error(`Interface locale ${source.id} has no review-ledger row`);
  return Object.freeze({
  tag: source.runtimeLocale,
  id: source.id,
  fallbacks: fallbackChainFor(source.runtimeLocale, source.id),
  nativeName: source.nativeName,
  englishName: source.englishName,
  script: source.defaultScript,
  // languages.json and the script table must agree; the script is the
  // source of truth so one new RTL locale cannot arrive marked ltr.
  direction: directionForScript(source.defaultScript),
  fontStack: scriptFontStack(source.defaultScript),
  reviewStatus: ledger.reviewStatus,
  available: ledger.available,
  blockers: Object.freeze([...ledger.blockers])
  });
}
const INTERFACE_LOCALES = Object.freeze(
  [
  ...LEARNER_LANGUAGES.map(
    (language) => buildLocale({ ...language, direction: language.direction })
  ),
  buildLocale(JAPANESE_INTERFACE_LOCALE)
  ].sort((left, right) => {
  const rank = (tag) => tag === "en" ? 0 : tag === "ja" ? 1 : 2;
  return rank(left.tag) - rank(right.tag) || left.englishName.localeCompare(right.englishName, "en");
  })
);
const LOCALE_BY_KEY = new Map([
  ...INTERFACE_LOCALES.map((locale) => [locale.id, locale]),
  ...INTERFACE_LOCALES.map((locale) => [locale.tag, locale])
]);
(() => {
  const english = LOCALE_BY_KEY.get("en");
  if (!english) throw new Error("The interface manifest must always contain English");
  return english;
})();
Object.freeze(
  INTERFACE_LOCALES.filter((locale) => locale.direction === "rtl")
);
Object.freeze(
  interfaceLocaleLedger.rtlGate.items.map(
  (item) => Object.freeze({ ...item })
  )
);
const GRAMMAR_UI_COPY = {
  en: {
  findingGrammar: "Finding grammar...",
  grammarNoLocalMatch: "No built-in Japanese grammar patterns matched this sentence.",
  grammarCheckUnavailable: "Grammar could not be checked.",
  grammarReference: "Open grammar reference",
  grammarKnown: "Known",
  grammarReview: "Review",
  grammarDetails: "Details",
  grammarFoundIn: "Found in",
  grammarExample: "Example",
  grammarGuide: "Guide",
  grammarHideKnown: "Hide known",
  grammarShowKnown: "Show known",
  allDetectedGrammarKnown: "All detected grammar is marked known.",
  grammarKnownHidden: "known hidden",
  grammarGenericShort: "Grammar point: {name}",
  grammarGenericDetail: "Uses {name} in 「{match}」.",
  grammarLevelCore: "Core"
  },
  ja: {
  findingGrammar: "文法を検索中...",
  grammarNoLocalMatch: "内蔵の日本語文法パターンはこの文に一致しませんでした。",
  grammarCheckUnavailable: "文法を確認できませんでした。",
  grammarReference: "文法リファレンスを開く",
  grammarKnown: "既知",
  grammarReview: "復習",
  grammarDetails: "詳細",
  grammarFoundIn: "検出箇所",
  grammarExample: "例",
  grammarGuide: "ガイド",
  grammarHideKnown: "既知を隠す",
  grammarShowKnown: "既知を表示",
  allDetectedGrammarKnown: "検出文法はすべて既知です。",
  grammarKnownHidden: "件の既知を非表示",
  grammarGenericShort: "文法項目: {name}",
  grammarGenericDetail: "「{match}」に「{name}」。",
  grammarLevelCore: "基本"
  }
};
const EN_SUBTITLE_SETTINGS_COPY = {
  subtitlePlayerEnabled: "Enable video subtitle player",
  subtitleAutoDetect: "Auto-detect page subtitles",
  subtitleOverlayVisible: "Show subtitle overlay",
  // Not a control label: no checkbox writes this any more, the three-way
  // `subtitleNativeDisplay` select does. It stays because a stored setting with
  // no control of its own takes its wording in docs/dev/settings-reference.md from
  // the i18n entry keyed by its own name, and this sentence is what the stored
  // boolean means.
  subtitleSecondaryVisible: "Show native subtitles",
  subtitleNativeBlurred: "Blur native subtitles until hover",
  subtitleNativeDisplay: "Translation",
  subtitleNativeDisplayBlurred: "Blur until reveal (recommended)",
  subtitleNativeDisplayShown: "Always show",
  subtitleNativeDisplayHidden: "Hide completely",
  subtitleNativeBlurStrength: "Blur strength",
  subtitleKaraokeMode: "Karaoke word timing",
  subtitleTranscriptVisible: "Open transcript panel by default",
  subtitlePausePanel: "Open side panel when paused",
  subtitleShadowAutoPause: "Auto-pause after each shadow line",
  subtitleTranscriptPlacement: "Transcript panel position",
  subtitleTranscriptAutoScroll: "Scroll transcript with playback",
  subtitleTranscriptAutoScrollResumeSeconds: "Resume auto-scroll delay (s)",
  subtitleAutoCopyLine: "Auto-copy subtitle lines",
  subtitleMiningPause: "Pause video on subtitle click",
  subtitleHoverPause: "Pause video on subtitle hover",
  subtitleControlsMode: "Subtitle controls",
  subtitleFontSize: "Subtitle font size (px)",
  subtitleBottomOffset: "Subtitle bottom offset (%)",
  subtitleTextColor: "Subtitle color",
  subtitleOutlineColor: "Subtitle outline",
  subtitleBackgroundColor: "Subtitle background",
  subtitleBackgroundOpacity: "Subtitle background opacity",
  subtitleFontFamily: "Subtitle font family",
  subtitleFontWeight: "Subtitle font weight",
  subtitleSeekPadding: "Subtitle seek padding (s)",
  subtitlePreview: "Live subtitle preview"
};
const JA_SUBTITLE_SETTINGS_COPY = {
  subtitlePlayerEnabled: "動画字幕プレイヤーを有効にする",
  subtitleAutoDetect: "ページの字幕を自動検出",
  subtitleOverlayVisible: "字幕オーバーレイを表示",
  subtitleSecondaryVisible: "利用可能ならネイティブ字幕を表示",
  subtitleNativeBlurred: "ホバーするまでネイティブ字幕をぼかす",
  subtitleNativeDisplay: "母語訳",
  subtitleNativeDisplayBlurred: "表示するまでぼかす（おすすめ）",
  subtitleNativeDisplayShown: "常に表示",
  subtitleNativeDisplayHidden: "完全に隠す",
  subtitleNativeBlurStrength: "ぼかしの強さ",
  subtitleKaraokeMode: "カラオケ風の単語タイミング",
  subtitleTranscriptVisible: "文字起こしパネルを標準で開く",
  subtitlePausePanel: "一時停止時にサイドパネルを開く",
  subtitleShadowAutoPause: "シャドー中は各行の後で一時停止",
  subtitleTranscriptPlacement: "文字起こしパネル位置",
  subtitleTranscriptAutoScroll: "再生に合わせて文字起こしをスクロール",
  subtitleTranscriptAutoScrollResumeSeconds: "手動スクロール後の再開 (秒)",
  subtitleAutoCopyLine: "各字幕行を再生時に自動コピー",
  subtitleMiningPause: "字幕クリック時に動画を一時停止",
  subtitleHoverPause: "字幕ホバー時に動画を一時停止",
  subtitleControlsMode: "字幕コントロール",
  subtitleFontSize: "字幕フォントサイズ (px)",
  subtitleBottomOffset: "字幕下端オフセット (%)",
  subtitleTextColor: "字幕の色",
  subtitleOutlineColor: "字幕の縁取り",
  subtitleBackgroundColor: "字幕背景",
  subtitleBackgroundOpacity: "字幕背景の不透明度",
  subtitleFontFamily: "字幕フォントファミリー",
  subtitleFontWeight: "字幕フォントの太さ",
  subtitleSeekPadding: "字幕シーク余白 (s)",
  subtitlePreview: "字幕ライブプレビュー"
};
const SUBTITLE_SETTINGS_COPY = {
  en: EN_SUBTITLE_SETTINGS_COPY,
  ja: JA_SUBTITLE_SETTINGS_COPY
};
const LOCAL_DICTIONARY_STORAGE_COPY = {
  enSettings: {
  extensionDictionaryUnavailable: "The extension dictionary service is unavailable. Retry, or reload the Yomu extension.",
  extensionDictionaryConnectionLost: "The extension dictionary connection was lost. Check whether the operation completed before retrying.",
  localDictionariesEnabled: "Show imported dictionary definitions",
  localDictionarySiteStorageHelp: "Imported dictionaries stay on your device.",
  clearLocalDictionarySiteStorage: "Disable and remove stored dictionaries",
  clearLocalDictionarySiteStorageConfirm: "Disable imported dictionaries and delete this site's stored copy?\n\nSites that still hold a copy from earlier versions remove it the next time you visit them. You can re-import dictionaries at any time.",
  clearLocalDictionarySiteStorageClearing: "Disabling imported dictionaries and clearing this site's copy...",
  clearLocalDictionarySiteStorageDone: "Imported dictionaries are disabled. This site's copy was deleted; other sites clean up as you visit them."
  },
  enImport: {
  dictionaryImportComplete: "Imported {records} from {sources} source{plural}.",
  dictionaryImportResultWithFailures: "Imported {records} from {sources} source{plural}. {failed} file{failedPlural} failed: {files}."
  },
  jaImport: {
  dictionaryImportComplete: "{sources}から{records}件インポートしました。",
  dictionaryImportResultWithFailures: "{sources}から{records}件インポートしました。{failed}ファイルのインポートに失敗しました: {files}。"
  },
  jaSettings: {
  extensionDictionaryUnavailable: "拡張機能の辞書サービスを利用できません。再試行するか、よむ拡張機能を再読み込みしてください。",
  extensionDictionaryConnectionLost: "拡張機能の辞書サービスとの接続が切れました。再試行する前に、操作が完了していないか確認してください。",
  localDictionariesEnabled: "インポート済み辞書の定義を表示",
  localDictionarySiteStorageHelp: "インポートした辞書は端末内に保存されます。",
  clearLocalDictionarySiteStorage: "無効にして保存済み辞書を削除",
  clearLocalDictionarySiteStorageConfirm: "インポート済み辞書を無効にし、このサイトの保存コピーを削除しますか？\n\n以前のバージョンのコピーが残っているサイトは、次回訪問時に自動的に削除されます。辞書はいつでも再インポートできます。",
  clearLocalDictionarySiteStorageClearing: "インポート済み辞書を無効にし、このサイトのコピーを削除中...",
  clearLocalDictionarySiteStorageDone: "インポート済み辞書を無効にしました。このサイトのコピーは削除され、他のサイトも訪問時に順次削除されます。"
  }
};
const SETTINGS_RECOVERY_COPY = {
  en: {
  settingsImportUnsupportedFormat: "This settings backup format is not supported.",
  settingsImportIncomplete: "The settings data in this backup is incomplete.",
  extensionSettingsRecoveryTitle: "Could not load settings",
  extensionSettingsRecoveryBody: "Your saved settings have not been changed.",
  extensionSettingsRecoveryRetry: "Try again",
  extensionSettingsRecoveryReload: "Reload Study",
  extensionSettingsRecoveryRetrying: "Loading settings…",
  extensionSettingsRecoveryStillBlocked: "Settings are still unavailable.",
  saveAfterImport: "Save after import",
  settingsImportSaveBlocked: "Settings import is running. Save unlocks when it finishes.",
  settingsImportStaleSaveDiscarded: "Settings import replaced the earlier pending Save."
  },
  ja: {
  settingsImportUnsupportedFormat: "このバックアップの設定形式には対応していません。",
  settingsImportIncomplete: "このバックアップの設定データが不完全です。",
  extensionSettingsRecoveryTitle: "設定を読み込めませんでした",
  extensionSettingsRecoveryBody: "保存済みの設定は変更されていません。",
  extensionSettingsRecoveryRetry: "再試行",
  extensionSettingsRecoveryReload: "Studyを再読み込み",
  extensionSettingsRecoveryRetrying: "設定を読み込み中…",
  extensionSettingsRecoveryStillBlocked: "まだ設定を読み込めません。",
  saveAfterImport: "インポート後に保存",
  settingsImportSaveBlocked: "設定をインポート中です。完了後に保存できます。",
  settingsImportStaleSaveDiscarded: "設定のインポートを優先し、先に待機していた保存は破棄しました。"
  }
};
const PRACTICE_SESSION_COPY = {
  en: {
  practiceTitle: "Practice",
  practicePurpose: "Session type",
  practiceRecognition: "Read words",
  practiceCloze: "Complete sentences",
  practiceWriting: "Write words",
  practiceListening: "Listen",
  practiceSpeaking: "Speak",
  practiceStart: "Start session",
  practiceResume: "Resume",
  practiceSaved: "Saved sessions",
  practiceCurrentSelection: "Use current selection",
  practiceScheduleUnchanged: "Your scheduled reviews stay unchanged.",
  practicePreparing: "Preparing session…",
  practiceUnavailable: "This session could not be opened.",
  practiceNoMaterial: "No selected words are ready for this session type.",
  practiceSaveFailed: "Progress could not be saved. Try again.",
  practiceConflict: "This session changed in another window. Copy any unsaved answer before reopening.",
  practiceReopen: "Reopen saved progress",
  practiceEmptyAnswer: "Enter an answer.",
  practiceCheck: "Check",
  practiceCorrect: "Matches the word",
  practiceAccepted: "Reading matches",
  practiceDifferent: "Try again, or compare with the answer.",
  practiceRemembered: "I remembered",
  practiceNotYet: "Not yet",
  practiceNext: "Next",
  practiceSkip: "Skip",
  practicePause: "Pause",
  practiceComplete: "Session complete",
  practiceBack: "Back to Study",
  practiceNew: "New session",
  practiceWordsCount: "{count} words",
  practicePosition: "{current} of {total}",
  practiceResponse: "Your answer",
  practiceAudio: "Play question audio"
  },
  ja: {
  practiceTitle: "練習",
  practicePurpose: "練習方法",
  practiceRecognition: "単語を読む",
  practiceCloze: "文の空欄を埋める",
  practiceWriting: "単語を書く",
  practiceListening: "聞き取り",
  practiceSpeaking: "発話",
  practiceStart: "練習を開始",
  practiceResume: "再開",
  practiceSaved: "保存した練習",
  practiceCurrentSelection: "現在の選択を使う",
  practiceScheduleUnchanged: "復習予定には影響しません。",
  practicePreparing: "練習を準備中…",
  practiceUnavailable: "この練習を開けませんでした。",
  practiceNoMaterial: "選択した単語では、この形式の練習を開始できません。",
  practiceSaveFailed: "進捗を保存できませんでした。もう一度お試しください。",
  practiceConflict: "別のウィンドウで進捗が変わりました。未保存の回答をコピーしてから開き直してください。",
  practiceReopen: "保存済みの進捗を開く",
  practiceEmptyAnswer: "回答を入力してください。",
  practiceCheck: "確認",
  practiceCorrect: "表記が一致",
  practiceAccepted: "読みが一致",
  practiceDifferent: "もう一度試すか、答えを確認してください。",
  practiceRemembered: "思い出せた",
  practiceNotYet: "まだ覚えていない",
  practiceNext: "次へ",
  practiceSkip: "スキップ",
  practicePause: "中断",
  practiceComplete: "練習完了",
  practiceBack: "学習に戻る",
  practiceNew: "新しい練習",
  practiceWordsCount: "{count}語",
  practicePosition: "{total}問中{current}問",
  practiceResponse: "回答",
  practiceAudio: "問題の音声を再生"
  }
};
const SAVE_WAIT_COPY = {
  en: {
  saveWaitingForAnotherTab: `Waiting for another ${APP_NAME} tab to finish saving…`
  },
  ja: {
  saveWaitingForAnotherTab: `ほかの${APP_NAME}タブの保存が終わるのを待っています…`
  }
};
const GRADING_SERVICE_COPY = {
  en: {
  switchReviewTarget: "Switch review target",
  switchGradingProvider: "Switch grading provider",
  apiGradingProvider: "Preferred grading service",
  apiGradingProviderHelp: "Where grades go when both Jiten and JPDB are connected; Automatic parsing follows it too. Study review cards grade to the service they came from, and the ⇄ toggle next to the grade buttons switches only that word.",
  gradingServiceWordNotFound: "Not graded: this word was not found in your preferred grading service."
  },
  ja: {
  switchReviewTarget: "採点先を切り替える",
  switchGradingProvider: "採点サービスを切り替える",
  apiGradingProvider: "優先採点サービス",
  apiGradingProviderHelp: "JitenとJPDBの両方を接続しているときの採点先です。解析ソースが「自動」の場合も、この設定に従います。Studyの復習カードは取得元のサービスで採点され、採点ボタン横の⇄はその単語だけを切り替えます。",
  gradingServiceWordNotFound: "優先採点サービスでこの単語が見つからなかったため、採点していません。"
  }
};
const EN = {
  collectNoDestination: "None of your decks can take this word. Turn one on in Settings.",
  collectWordNotFound: "Not saved: this word was not found in your preferred grading service.",
  // An ordinary page can read these, so they name no service, deck or Anki state (ADR-0020).
  collectAlreadySaved: "Already in one of your decks. Open Study to edit it.",
  collectHandoffOpened: "Opened your deck app. Finish saving there.",
  collectNotSaved: "This word was not saved. Try again, or open Study for details.",
  jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
  addedToJpdb: "Added to JPDB.",
  jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
  // Jiten takes a single word only into a word list (StudyDeckType 2).
  jitenNeedsWordList: "To save words to Jiten, create a word list on jiten.moe.",
  addedToJiten: "Added to Jiten.",
  bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
  bunproNoMatchingWord: "Bunpro has no entry for this word.",
  addedToBunpro: "Added to Bunpro.",
  yomuLocalSrsDisabled: `Enable ${ACADEMY_SRS_LABEL} in Settings first.`,
  yomuLocalSrsStorageFailed: "Your Academy deck could not be saved. Browser storage may be full. Free some site storage, then try again.",
  yomuLocalSrsSaveInterrupted: "Your Academy deck was not saved because saving was interrupted. Try again.",
  addedToYomuLocal: `Added to ${ACADEMY_SRS_LABEL}.`,
  // An Academy word kept without a schedule (Library, Stats and the popups).
  savedWord: "Saved"
};
const JA = {
  collectNoDestination: "この単語を追加できるデッキがありません。設定でデッキを有効にしてください。",
  collectWordNotFound: "優先採点サービスでこの単語が見つからなかったため、保存していません。",
  collectAlreadySaved: "すでにデッキにあります。編集はStudyで行えます。",
  collectHandoffOpened: "デッキのアプリを開きました。そちらで保存を完了してください。",
  collectNotSaved: "この単語は保存されませんでした。もう一度お試しいただくか、Studyで詳細を確認してください。",
  jpdbAddApiKeyRequired: "JPDB APIキーかAnki追加が必要です。",
  addedToJpdb: "JPDBに追加しました。",
  jitenAddApiKeyRequired: "Jiten APIキーかAnki追加が必要です。",
  jitenNeedsWordList: "Jitenに単語を保存するには、jiten.moeで単語リストを作成してください。",
  addedToJiten: "Jitenに追加しました。",
  bunproAddApiKeyRequired: "Bunproのfrontend_api_tokenかAnki追加が必要です。",
  bunproNoMatchingWord: "この単語はBunproに見つかりませんでした。",
  addedToBunpro: "Bunproに追加しました。",
  yomuLocalSrsDisabled: "先に設定でAcademyを有効にしてください。",
  yomuLocalSrsStorageFailed: "Academyデッキを保存できませんでした。ブラウザーの保存容量が不足している可能性があります。サイトの保存容量を空けてから、もう一度お試しください。",
  yomuLocalSrsSaveInterrupted: "保存が中断されたため、Academyデッキに保存されませんでした。もう一度お試しください。",
  addedToYomuLocal: "Academyに追加しました。",
  savedWord: "保存済み"
};
const COLLECTION_COPY = { en: EN, ja: JA };
const EN_OCR_STATUS_COPY = {
  ocrPlayVideo: "Play video",
  ocrPausedFrameScanning: "Scanning...",
  ocrPausedFrameReady: "Text ready",
  ocrPausedFrameNoText: "No text found",
  ocrPausedFrameFailed: "Could not read text",
  ocrRetryScan: "Scan again",
  ocrNoReadableImages: "No readable images nearby.",
  ocrCanvasTapHint: "Tap or click the page to read it",
  ocrCanvasTapHintDismiss: "Dismiss tip"
};
const JA_OCR_STATUS_COPY = {
  ocrPlayVideo: "動画を再生",
  ocrPausedFrameScanning: "スキャン中...",
  ocrPausedFrameReady: "テキスト準備完了",
  ocrPausedFrameNoText: "テキストが見つかりません",
  ocrPausedFrameFailed: "テキストを読み取れませんでした",
  ocrRetryScan: "再スキャン",
  ocrNoReadableImages: "近くに読み取れる画像がありません。",
  ocrCanvasTapHint: "ページをタップまたはクリックすると読めます",
  ocrCanvasTapHintDismiss: "ヒントを閉じる"
};
const OCR_STATUS_COPY = {
  en: EN_OCR_STATUS_COPY,
  ja: JA_OCR_STATUS_COPY
};
const COPY = {
  en: {
  ...PRACTICE_SESSION_COPY.en,
  ...COLLECTION_COPY.en,
  settingsTitle: `${APP_NAME} Settings`,
  manualPageScanShortcut: "Manual page scan shortcut",
  scanPage: "Scan page",
  noUnscannedJapaneseText: "No unscanned Japanese text found.",
  statsEmptyHelp: "Your reviews and progress show up here after your first session.",
  libraryEmpty: "Save a word while you read and it shows up here.",
  moreLookupLinks: "More links",
  audioSourcesTitle: "Audio sources",
  contextOccurrences: "In context ×{count}",
  puckAutoDetectSubtitles: "Auto-detect subtitles",
  loadTargetSubtitles: "Load Japanese subtitles",
  loadOutputSubtitles: "Load English subtitles",
  jpdbScanFailed: "Page scan failed.",
  pageCoverageSummary: "{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1",
  settings: "Settings",
  settingsSaved: "Settings saved.",
  settingsSaveFailed: "Settings save failed.",
  settingsCompanionUnavailable: "Settings could not be opened.",
  ...SETTINGS_RECOVERY_COPY.en,
  ...SAVE_WAIT_COPY.en,
  firefoxAuthenticationInfoDenied: "Those account details were not saved because Firefox permission was not granted.",
  firefoxAuthenticationInfoExtensionPageRequired: "Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.",
  settingsSections: "Settings sections",
  settingsSearch: "Search settings",
  settingsSearchPlaceholder: "Search settings",
  settingsSearchNoResults: "No matches.",
  accountSettingsTrustedSurfaceTitle: "Open Settings in Study",
  accountSettingsTrustedSurfaceHelp: "This page can read and change its own controls, so Yomu does not put settings, account details, imports, or recovery codes here. Open the Yomu-owned Study page to edit and save them safely.",
  openAccountSettingsTrustedSurface: "Open Study settings",
  save: "Save",
  cancel: "Cancel",
  closeSettings: "Close settings",
  settingsLauncherHelp: "Settings open in Study, where this site can't read them.",
  openInStudy: "Open in Study",
  show: "Show",
  hide: "Hide",
  appearance: "Appearance",
  reading: "Reading",
  dictionaries: "Dictionaries",
  sources: "Sources",
  backupSync: "Backup & sync",
  media: "Media",
  mining: "Mining",
  shortcuts: "Shortcuts",
  help: "Help",
  reader: "Reader",
  kanji: "Kanji",
  audio: "Audio",
  images: "Image text (OCR)",
  video: "Video",
  youTube: "YouTube",
  anki: "Anki",
  jpdb: "JPDB",
  api: "API",
  apiCredential: "API key",
  apiCredentialJpdb: "JPDB API key",
  apiCredentialJiten: "Jiten API key",
  apiCredentialBunpro: "Bunpro frontend API token",
  apiCredentialBunproLegacy: "Bunpro API key",
  apiCredentialWanikani: "WaniKani personal access token",
  apiKey: "API key",
  jitenApiKey: "Jiten API key",
  apiAccess: "API access",
  storedCredentialPlaceholder: "Saved — enter a replacement",
  clearStoredCredential: "Remove saved credential",
  apiAccessHelp: "Add each service credential here. Bunpro only needs the frontend token: import it from Bunpro settings, treat it like a password, and note that it is saved before it is verified. Academy reviews work locally without an account.",
  wanikaniTokenHelp: "Create a read/write personal access token on WaniKani and paste it here. It is stored only in your browser, sent directly to api.wanikani.com (never through a proxy), and never logged.",
  jpdbSettings: "JPDB settings",
  jitenSettings: "Jiten settings",
  bunproSettings: "Bunpro settings",
  wanikaniSettings: "WaniKani settings",
  jpdbApiKeyConfigured: "JPDB key set.",
  jpdbAndJitenApiKeysConfigured: "Jiten and JPDB keys are set.",
  jpdbConnected: "Connected to JPDB.",
  jpdbAndJitenConnected: "Connected to Jiten and JPDB.",
  jpdbConnectionFailed: "JPDB did not accept the key (network or invalid key).",
  statusReady: "Ready",
  statusAttention: "Needs setup",
  statusError: "Error",
  disabledControlDescription: "Controlled by another setting.",
  jpdbMiningEnabled: "Allow API review/deck changes",
  bunproMiningEnabled: "Allow Bunpro review/mining",
  wanikaniReviewEnabled: "Allow WaniKani review (due assignments only)",
  wanikaniGradeMappingHelp: "Yomu maps its grade to WaniKani’s pass/fail answer counts: Okay, Good, and Easy submit a clean pass. Anything below Okay submits one incorrect meaning answer and, unless the subject is a radical, one incorrect reading answer.",
  yomuLocalSrsEnabled: `Enable ${ACADEMY_SRS_LABEL}`,
  addToForq: "Also copy JPDB adds to forq",
  enableReviews: "Show review buttons",
  reviewRatingScale: "Review rating scale",
  gradeTargetSelector: "Grade target",
  gradeTargetBoth: "Both",
  gradeTargetJpdb: "Grades JPDB",
  gradeTargetJiten: "Grades Jiten",
  gradeTargetBunpro: "Grades Bunpro",
  gradeTargetWanikani: "Grades WaniKani",
  gradeTargetYomuLocal: `Grades ${ACADEMY_SRS_LABEL}`,
  gradeTargetAnki: "Grades Anki card: {target}",
  gradeTargetJpdbAndAnki: "Grades JPDB + Anki card: {target}",
  gradeTargetJitenAndAnki: "Grades Jiten + Anki card: {target}",
  gradeTargetBunproAndAnki: "Grades Bunpro + Anki card: {target}",
  gradeTargetYomuLocalAndAnki: `Grades ${ACADEMY_SRS_LABEL} + Anki card: {target}`,
  missingAnkiCardId: "Missing Anki card id.",
  jpdbPageEnhancements: "Dictionary site enhancements",
  jpdbPageEnhancementsEnabled: "Enhance JPDB and Jiten pages",
  jpdbPageWordEnhancementsEnabled: "Add sources to word/search pages",
  jpdbPageKanjiEnhancementsEnabled: "Add sources to kanji pages",
  fivePoint: "Provider default",
  fourGradeShortcutsHelp: "Four-grade reviews use the first four shortcuts: Again, Hard, Good, Easy.",
  twoPoint: "Two point: FAIL / PASS",
  settingsLanguage: "Settings language",
  automatic: "Automatic",
  english: "English",
  japanese: "日本語",
  theme: "Theme",
  auto: "Auto",
  dark: "Dark",
  light: "Light",
  switchToDarkTheme: "Switch to dark theme",
  switchToLightTheme: "Switch to light theme",
  popupMode: "Popup mode",
  hoverPopupMode: "Hover popup mode",
  bottomSheet: "Bottom sheet",
  popover: "Popover",
  stickyBottomSheet: "Keep sheet open after lookup",
  popoverWidth: "Popover width (px)",
  popoverHeight: "Popover height (px)",
  popoverHeightMode: "Popover height behavior",
  popoverHeightAvailable: "Grow to available space",
  popoverHeightFixed: "Use height setting",
  readerFontFamily: "Reader interface font",
  popupFontFamily: "Popup font",
  fontPresetYomuDefault: "Built-in font",
  fontPresetJapaneseSans: "Japanese sans",
  fontPresetHiraginoYuGothic: "Hiragino / Yu Gothic",
  fontPresetJapaneseRounded: "Japanese rounded",
  fontPresetJapaneseSerif: "Japanese serif",
  fontPresetSystemUi: "System UI",
  fontPresetCustom: "Custom...",
  customFontFamily: "Custom font stack",
  popupFontWeight: "Popup font weight",
  enableLogging: "Enable diagnostic logging",
  diagnostics: "Diagnostics",
  diagnosticsHelp: "Print diagnostics to the console.",
  accentColor: "Accent color",
  newTab: "Study",
  newTabAnkiEnabled: "Use Anki cards in Study",
  newTabAnkiReviewDecks: "Anki review decks",
  newTabAnkiReviewDecksHelp: "Uncheck decks to skip.",
  newTabSource: "Study review source",
  newTabAuto: "Automatic",
  newTabApiSrs: "API SRS (Jiten / JPDB)",
  newTabBunpro: "Bunpro",
  newTabWanikani: "WaniKani",
  newTabYomuLocal: ACADEMY_SRS_LABEL,
  dictionaryFallback: "Dictionary fallback",
  newTabJpdbReviewMode: "API review mode",
  newTabJpdbReviewAuto: "Automatic",
  newTabLiveReview: "Live JPDB review session",
  newTabApiVocabulary: "API vocabulary only",
  corsProxyUrl: "Cross-origin proxy URL",
  newTabKanjiKeywordSource: "Kanji keyword source",
  newTabKanjiKeywordAuto: "Automatic",
  newTabKanjiKeywordRtk: "RTK / Heisig",
  newTabKanjiKeywordApiFacts: "{service} kanji facts (Jiten / JPDB)",
  newTabKanjiKeywordLocal: "Local card meaning",
  newTabParsingEnabled: "Enable sentence parsing on Study",
  newTabFrontSentenceEnabled: "Show sentence on word fronts",
  newTabKanjiAutogradeEnabled: "Auto-grade kanji drawing",
  newTabOfflineEnabled: "Cache Study for offline use",
  newTabOfflineLimit: "Offline review cache limit",
  newTabDailyGoalMinutes: "Daily study goal (minutes, 0 = off)",
  newTabKanjiUnlockEnabled: "Study kanji before unlocking words",
  newTabStopAtBatchEnd: "Stop at the end of each batch",
  newTabSwipeReviews: "Swipe cards to grade (left = fail, right = pass)",
  newTabShortcutHintsEnabled: "Show Study keyboard shortcut hints",
  newTabOfflineHelp: "Caches due cards and queued grades.",
  newTabJpdbDeck: "Study JPDB deck",
  wordColors: "Word colors",
  wordColorNew: "New and in deck",
  wordColorLearning: "Learning",
  wordColorKnown: "Known and never forget",
  wordColorDue: "Due",
  wordColorFailed: "Failed",
  wordColorIgnored: "Ignored, suspended, and blacklisted",
  pitchAccentColors: "Pitch accent colors",
  pitchColorHeiban: "Heiban (flat)",
  pitchColorAtamadaka: "Atamadaka (head-high)",
  pitchColorNakadaka: "Nakadaka (middle-high)",
  pitchColorOdaka: "Odaka (tail-high)",
  pitchColorUnknown: "Unknown",
  pronunciation: "Pronunciation",
  noExactPitch: "Exact pitch unavailable",
  colorChannels: "Color channels",
  wordHighlightColorSource: "Word highlight color",
  wordUnderlineColorSource: "Word underline color",
  wordTextColorSource: "Word text color",
  subtitleHighlightColorSource: "Subtitle highlight color",
  subtitleUnderlineColorSource: "Subtitle underline color",
  subtitleTextColorSource: "Subtitle text color",
  colorSourceStatus: "All study statuses",
  colorSourceJpdb: "Primary deck status",
  colorSourceAnki: "Anki status",
  colorSourcePitch: "Pitch accent",
  colorSourceNone: "None",
  popupLookup: "Popup lookup",
  popupLookupEnabled: "Show Yomu lookup popup",
  popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
  lookupOnClick: "Look up on tap or click",
  lookupOnHover: "Look up on hover",
  lookupOnMiddleMouse: "Look up with middle-mouse hold",
  showFloatingButton: "Show settings puck",
  pageScanMode: "Japanese text on webpages",
  pageScanModeAuto: "Scan Japanese automatically",
  pageScanModeManual: "Scan only when I ask",
  manualScanEnabled: "Manual page scanning",
  ocrInteractionMode: "Image OCR scanning",
  ocrInteractionModeAuto: "Auto",
  ocrInteractionModeManual: "Tap or hover",
  ocrInteractionModeOff: "Off",
  puckMenuLabel: `${APP_NAME} menu`,
  puckPowerOnFurigana: `${APP_NAME} on · furigana shown`,
  puckPowerOnNoFurigana: `${APP_NAME} on · furigana hidden`,
  puckPowerOff: `${APP_NAME} off`,
  puckOcrAuto: "OCR: Auto",
  puckOcrManual: "OCR: Tap/Hover",
  puckOcrOff: "OCR: Off",
  autoplayAudioOn: "Auto-play audio on",
  autoplayAudioOff: "Auto-play audio off",
  showFurigana: "Enable furigana annotations",
  furiganaMode: "Furigana",
  wordColorStates: "Color words",
  appearancePreset: "Quick setup",
  appearancePresetCustom: "Custom",
  appearancePresetBalanced: "Balanced reading",
  appearancePresetNoColors: "Plain text",
  appearancePresetNewOnly: "Focus on new words",
  appearancePresetUnderlineNew: "Minimal highlights",
  wordColorStatesAll: "All learning states",
  wordColorStatesNewOnly: "Only new / not-in-deck words",
  hideFuriganaFor: "Hide furigana for",
  hideColorFor: "Hide color for",
  furiganaDifficultKanji: "Hard kanji only",
  furiganaDifficultKanjiHelp: `${APP_NAME} keeps a fixed beginner kanji list and shows readings on everything outside it. A bare kanji means that character sits on the list.`,
  statusColorNoSourceHelp: `Status colors read from a deck. Enable ${ACADEMY_SRS_LABEL} in Study, or add a JPDB, Jiten, or Anki source, and words take the color of their learning state.`,
  furiganaHideKnown: "Hide familiar words",
  furiganaHoverOnly: "Show on hover",
  furiganaAllParsed: "All parsed words",
  clampedRowReadings: "Readings on clamped rows",
  clampedRowReadingsShow: "Show (row grows)",
  clampedRowReadingsHover: "Hover only",
  showPitchAccent: "Show pronunciation",
  showLookupPillFrequency: "Show site frequency in pills",
  suppressRedundantWordUi: "Hide JPDB-redundant styling",
  sheetCloseButtonOnLeft: "Sheet close button on left",
  hideKnownFurigana: "Hide furigana for known cards only",
  readerHelp: "Set a hover key. Blank means plain hover.",
  hoverLookupSettings: "Hover lookup",
  kanjiOriginKanjiMapEnabled: "Show kanji facts and component graph",
  kanjiOriginGraphEnabled: "Show component graph",
  kanjiOriginRadicalImagesEnabled: "Show radical images",
  noSimilarWords: "No additional words found.",
  audioEnabled: "Enable term audio",
  autoPlayAudio: "Auto-play term audio",
  suppressAutoAudioOnVideo: "Disable lookup audio on video pages",
  audioAutoPlayMode: "Auto-play term audio",
  audioEnableDefaultSources: "Enable built-in audio sources",
  audioFallbackChimeEnabled: "Enable fallback chime",
  audioPlayback: "Audio playback",
  audioTtsMode: "Text-to-speech handling",
  audioTtsFallback: "Fallback after recorded audio",
  audioTtsSourceOrder: "Follow source order / shuffle",
  previewAudio: "Preview audio",
  audioHelp: "URL tokens: {term}, {reading}, {language}.",
  audioSource: "Audio source",
  urlVoice: "URL / voice",
  addAudioSource: "Add audio source",
  audioAutoPlayAll: "Hover and tap/click",
  audioAutoPlayHover: "Hover only",
  audioAutoPlayTap: "Tap/click only",
  automaticBrowserVoice: "Automatic browser voice",
  savedVoiceLabel: "Saved voice: {voice}",
  audioSourceOrder: "Audio source order",
  audioSourceNumber: "Audio source {number}",
  enableAudioSourceNumber: "Enable audio source {number}",
  enableLookupPillName: "Enable lookup pill: {name}",
  enableSourceName: "Enable source: {name}",
  textToSpeechVoiceNumber: "Text-to-speech voice {number}",
  audioSourceJpod101: "JapanesePod101",
  audioSourceLanguagePod101: "LanguagePod101",
  audioSourceJisho: "Jisho.org",
  audioSourceBunpro: "Bunpro",
  audioSourceLinguaLibre: "(Commons) Lingua Libre",
  audioSourceWiktionary: "(Commons) Wiktionary",
  audioSourceJitenTts: "Jiten text-to-speech",
  audioSourceJpdbTts: "JPDB text-to-speech",
  audioSourceTextToSpeech: "Text-to-speech",
  audioSourceTextToSpeechReading: "Text-to-speech (reading)",
  audioSourceCustom: "Custom direct audio file URL",
  audioSourceCustomJson: "Custom URL",
  audioCustomJsonPlaceholder: "Yomitan or Ultimate audio source URL",
  audioCustomUrlPlaceholder: "Direct audio file URL",
  audioBuiltInPlaceholder: "Built-in source, no URL needed",
  audioDetectingSubSources: "Checking included sources…",
  audioNoSubSourcesDetected: "No named sources reported by this URL.",
  audioSubSourcesHelp: "Sources offered by this URL — untick any you don’t want:",
  audioSubSourceOverlapHint: "also listed as its own source",
  defaultVoiceSuffix: "default",
  audioGuideLinkLabel: "Yomitan audio guide",
  audioProxyDeployGuide: "Proxy setup",
  immersionKit: "Immersion Kit",
  immersionKitEnabled: "Show Immersion Kit examples",
  immersionKitExampleSource: "Example provider",
  immersionKitAndNadeshiko: "Immersion Kit + Nadeshiko",
  nadeshikoApiKey: "Nadeshiko API key",
  getNadeshikoKey: "Get a key",
  immersionKitShowTranslation: "Show example translations",
  immersionKitRevealTranslationOnClick: "Blur example translations until clicked",
  immersionKitShowImages: "Show example thumbnails",
  immersionKitAutoPlayAudio: "Play example audio after reveal or next/previous",
  immersionKitPlayOnHover: "Play example audio when hovering thumbnails",
  immersionKitPlayOnImageClick: "Play example audio when clicking thumbnails",
  immersionKitLimitEnabled: "Examples per word limit",
  immersionKitLimit: "Examples per word (0 = all)",
  immersionKitPlaybackRate: "Example audio speed",
  immersionKitHelp: "Examples appear in popups. Nadeshiko needs a key.",
  loadingExamples: "Loading examples...",
  noImmersionExamplesCompact: "No examples",
  immersionKitRateLimited: "Immersion Kit rate-limited; retrying later.",
  immersionKitRequest: "Immersion Kit request",
  immersionKitRequestFailed: "Immersion Kit request failed.",
  immersionKitRequestFailedWithStatus: "Immersion Kit request failed ({status}).",
  immersionKitRequestTimedOut: "Immersion Kit request timed out.",
  immersionKitSearchBlocked: "Immersion Kit blocked. Configure CORS.",
  immersionKitMediaRequest: "Media request",
  immersionKitMediaRequestFailed: "Media request failed.",
  immersionKitMediaRequestFailedWithStatus: "Media request failed ({status}).",
  immersionKitMediaRequestTimedOut: "Media request timed out.",
  immersionKitMediaRequestReturnedNonMedia: "Media request returned an error page.",
  immersionKitNoMediaCandidate: "No Immersion Kit media loaded.",
  nadeshikoRequest: "Nadeshiko request",
  nadeshikoRequestFailed: "Nadeshiko request failed.",
  nadeshikoRequestFailedWithStatus: "Nadeshiko request failed ({status}).",
  nadeshikoRequestTimedOut: "Nadeshiko request timed out.",
  previousExample: "Previous example",
  nextExample: "Next example",
  playExampleAudio: "Play example audio",
  anime: "Anime",
  drama: "Drama",
  games: "Games",
  ocrEnabled: "Read text in images",
  ocrAutoScanImages: "Read images automatically",
  ocrShowTextOverlay: "Show recognized text areas",
  ocrVideoPauseFrames: "Auto-read paused video frames",
  ocrInvertDarkPanels: "Read light text on dark panels",
  ocrProvider: "Image reading",
  ocrOverlayTheme: "OCR overlay theme",
  ocrOverlayThemeAuto: "Match app theme",
  ocrOverlayThemeLight: "Light overlay",
  ocrOverlayThemeDark: "Dark overlay",
  googleLens: "Google Lens (free, recommended)",
  cloudVision: "Google Cloud Vision (API key)",
  localOcr: "Local OCR server",
  off: "Off",
  ocrMaxImagesPerPage: "Images to read per page",
  ocrMinImageArea: "Smallest image to read",
  ocrMaxImagePixels: "Image detail",
  lightWork: "Light",
  normal: "Normal",
  more: "More",
  largeOnly: "Large images only",
  includeSmall: "Include small images",
  faster: "Faster",
  balanced: "Balanced",
  sharper: "Sharper",
  ocrTextColor: "Image text color",
  ocrOutlineColor: "Image text outline",
  ocrBackgroundOpacity: "Image highlight opacity",
  ocrFontScale: "Image text scale",
  ocrEndpointUrl: "Local OCR server URL",
  ocrEngine: "Local OCR engine",
  ocrEngineMangaOcr: "MangaOCR (best for manga)",
  ocrEngineAppleVision: "Apple Vision (macOS)",
  cloudVisionApiKey: "Google Cloud Vision API key",
  ocrHelp: "Reads nearby images. Google Lens needs no setup.",
  ocrCloudHelp: "Paste a Google Cloud Vision API key.",
  ocrLocalHelp: "Run MangaOCR/Apple Vision locally and enter its URL.",
  ...SUBTITLE_SETTINGS_COPY.en,
  right: "Right",
  left: "Left",
  bottom: "Below",
  showWhenNeeded: "Compact controls",
  hideControls: "Hide controls",
  alwaysVisible: "Always visible",
  preview: "Preview",
  youtubeImmersionEnabled: "Japanese YouTube only",
  preferJapaneseSiteLanguage: "Request Japanese sites",
  youtubeShowChannelRecommendations: "Show Japanese channel suggestions",
  youtubeShowFilterNotice: "Show hidden-video notice",
  youtubeHelp: "Filter YouTube for Japanese.",
  youtubeShowHiddenVideos: "Show hidden videos",
  youtubeHideHiddenVideos: "Hide hidden videos",
  youtubeHideNotice: "Hide notice",
  youtubeFilterShowing: "{appName} shows {count} hidden item{plural}",
  youtubeFilterHid: "{appName} hid {count} other-language item{plural}",
  youtubeFilterVisible: "{count} Japanese items stayed visible.",
  youtubeToggleToastOn: "YouTube immersion filter enabled.",
  youtubeToggleToastOff: "YouTube immersion filter disabled.",
  ankiEnabled: "Enable Anki mining",
  ankiMineWithJpdb: "Also add to Anki when adding via API",
  ankiCaptureScreenshot: "Attach context image when possible",
  ankiConnectUrl: "AnkiConnect URL",
  ankiDeck: "Anki deck",
  ankiModel: "Anki note type",
  mobileAnkiHandoff: "Mobile Anki add-note fallback",
  ankiTemplateMode: "Anki card template",
  ankiFrontReading: "Show reading on word-first front",
  ankiFrontSentence: "Show sentence on word-first front",
  ankiFrontImage: "Show image on front",
  wordFirst: "Word first",
  sentenceFirst: "Sentence first",
  ankiTags: "Tags",
  sentenceFirstPreset: "Sentence first preset",
  wordFirstPreset: "Word first preset",
  front: "Front",
  back: "Back",
  imageAbovePrompt: "Image appears above the prompt when available.",
  recallHighlightedWord: "Recall the highlighted word from context.",
  imageOnFront: "Image appears on the front when available.",
  recallMeaning: "Recall the meaning first.",
  ankiBackIncludes: "Includes dictionary, kanji, pitch, source, image.",
  exampleMeaning: "to read",
  scanAnkiFirst: "Connect Anki first",
  notMapped: "Not mapped",
  noScannedFields: "Check AnkiConnect to load this note type's fields.",
  mappingForNoteType: "Mapping for {model}",
  currentNoteType: "current note type",
  ankiFieldMappingSelect: "{role} field",
  ankiRoleExpression: "Expression",
  ankiRoleReading: "Reading",
  ankiRoleMeaning: "Meaning",
  ankiRoleSentence: "Sentence",
  ankiRoleAudio: "Word audio",
  ankiRoleSentenceAudio: "Sentence audio",
  ankiRoleImage: "Image",
  testAnki: "Check AnkiConnect",
  prepareAnki: "Set up Yomu note type",
  updateAnkiModel: "Update note type",
  ankiModelUpdateAvailable: 'New fields are ready for "{model}": {fields}.',
  ankiModelUpdating: "Adding note type fields...",
  ankiModelUpdated: "Note type updated. Added {fields}.",
  ankiModelUpToDate: "Note type is up to date.",
  ankiCheckingConnection: "Checking AnkiConnect at {url}.",
  ankiMiningDisabledStatus: "Anki mining disabled.",
  ankiTesting: "Checking AnkiConnect...",
  ankiPreparing: "Setting up Yomu deck and note type...",
  ankiScanning: "Reading decks, note types, fields...",
  ankiScanSummary: "Decks {decks}, types {models}. Best: {model}. {fields}",
  ankiScanNoModels: "Found {decks} decks. Note types unavailable.",
  ankiScanFieldSummary: "Fields: {fields}",
  ankiUnreachable: "Open desktop Anki and check again.",
  ankiCorsBlocked: 'Add "{origin}" to webCorsOriginList; restart Anki.',
  ankiSettingsUnreachable: "AnkiConnect not reached.",
  ankiHostedBridgeMissing: `Enable ${APP_NAME}, refresh, then check again.`,
  ankiStatusOpenDesktop: "Open desktop Anki",
  ankiStatusInstallAddon: "Install/enable AnkiConnect",
  ankiStatusMobileDocs: "Mobile setup docs",
  ankiStatusUseDesktopUrl: "Use the LAN/Tailscale URL on mobile",
  ankiStatusEnableUserscript: `Enable installed ${APP_NAME}`,
  ankiStatusRefreshAndCheck: "Refresh and check",
  ankiHostedCorsHint: "Add {origin} to webCorsOriginList.",
  ankiLibraryAdapter: "Existing library adapter",
  ankiLibraryAdapterStatus: "Scans decks/types and suggests mappings.",
  ankiLibraryChoices: "Deck and note type",
  ankiLibraryChoicesHelp: "Pick where mining saves notes.",
  ankiTemplateSettings: "Yomu card template",
  ankiTemplateSettingsHelp: "For Yomu note types. Templates stay in Anki.",
  ankiMappingConfidenceHelp: "Based on fields/samples. Edit weak mappings.",
  ankiMappingHighConfidence: "High",
  ankiMappingMediumConfidence: "Medium",
  ankiMappingLowConfidence: "Low",
  ankiHelp: "Install AnkiConnect and keep desktop Anki open. If CORS appears, add this site to webCorsOriginList. Mobile handoff creates notes only.",
  jpdbDefinitionsEnabled: "Show JPDB definitions",
  ...LOCAL_DICTIONARY_STORAGE_COPY.enSettings,
  localDictionaryMaxResults: "Dictionary result limit",
  cloudSettingsSync: "Google Drive settings sync",
  cloudSettingsSyncHelp: "Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.",
  academyAccountSync: "Academy account sync",
  academyAccountSyncHelp: "Keep Academy SRS progress in sync across the Reader and your signed-in Yomu account. Create or manage your account on the website, then generate a one-time pairing code.",
  academyAccountManage: "Manage account & pairing code",
  academyPairingCode: "One-time pairing code",
  academyPairingCodePlaceholder: "XXXX-XXXX-XXXX-XXXX-XXXX",
  academyAccountConnect: "Connect",
  academyAccountSyncNow: "Sync now",
  academyRecoveryCodeCreate: "Create website recovery code",
  academyRecoveryCodeCreating: "Creating a one-time website recovery code...",
  academyRecoveryCodeReady: "Website recovery code: {code}. Enter it in Profile & sync within 10 minutes.",
  academyRecoveryCodeDone: "Website recovery code created.",
  academyAccountDisconnect: "Disconnect",
  academyAccountChecking: "Checking Academy account connection...",
  academyAccountDisconnected: "Not connected. Academy reviews stay on this device until you connect an account.",
  academyAccountConnected: "Connected as {name}.",
  academyAccountConnectedNoName: "Academy account connected.",
  academyAccountLastSynced: "Last synced {time}.",
  academyAccountNeverSynced: "Not synced yet.",
  academyAccountConnectionProblem: "Could not refresh the account status: {message}",
  academyAccountConnecting: "Connecting and syncing Academy progress...",
  academyAccountSyncing: "Syncing Academy progress...",
  academyAccountDisconnecting: "Disconnecting this Reader...",
  academyPairingCodeRequired: "Enter the one-time pairing code from your Yomu account.",
  academyAccountConnectedDone: "Academy account connected and progress synced.",
  academyAccountSyncedDone: "Academy progress synced.",
  academyAccountDisconnectedDone: "This Reader is disconnected. Local Academy progress is still available.",
  importSettings: "Import settings JSON",
  exportSettings: "Export settings JSON",
  importDictionaries: "Import dictionaries",
  exportDictionaries: "Export dictionaries",
  lookupPills: "Lookup pills",
  lookupPillsHelp: "External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.",
  parserProvider: "Parsing source",
  parserProviderLocal: "Local dictionaries (offline)",
  parserProviderJiten: "Jiten API",
  parserProviderJpdb: "JPDB API",
  parserProviderAuto: "Automatic (Jiten/JPDB)",
  parserProviderHelp: "Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic uses your preferred grading service when both keys are set, otherwise Jiten, then JPDB.",
  copiesCurrentWord: "Copies the current word",
  plaintextHttpLink: "Opens over plaintext HTTP.",
  lookupPillLabelNumber: "Lookup pill {number} label",
  lookupUrlTemplate: "Lookup URL template",
  lookupUrlTemplateNumber: "Pill {number} URL",
  lookupPillOrder: "Lookup pill order",
  builtInAction: "Built-in action",
  recommendedDownloads: "Dictionaries",
  recommendedJapaneseDictionaries: "Recommended Japanese dictionaries",
  recommendedDictionaryCountAndSize: "Dictionaries: {count} · {size}",
  termDictionaries: "Term dictionaries",
  kanjiDictionaries: "Kanji dictionaries",
  pitchDictionaries: "Pitch dictionaries",
  pronunciationDictionaries: "Pronunciation dictionaries",
  frequencyDictionaries: "Frequency dictionaries",
  nameDictionaries: "Name dictionaries",
  grammarDictionaries: "Grammar dictionaries",
  exampleDictionaries: "Example sentence dictionaries",
  thesaurusDictionaries: "Thesauruses",
  encyclopediaDictionaries: "Encyclopedias",
  utilityDictionaries: "Utility dictionaries",
  mirroredDictionaries: "All mirrored dictionaries",
  mirroredDictionariesSummary: "{count} more dictionaries · {size} total",
  mirroredDictionarySearch: "Search dictionaries",
  mirroredDictionarySearchNoResults: "No dictionaries match your search.",
  install: "Install",
  installing: "Installing",
  installed: "Installed",
  queued: "Queued",
  dictionaryGuide: "Guide",
  saveAfterInstall: "Save after install",
  download: "Download",
  update: "Update",
  checkingDictionaries: "Checking imported dictionaries...",
  dictionaryDownloading: "Downloading",
  dictionaryReadingZip: "Reading dictionary ZIP...",
  dictionaryCheckingIndex: "Checking index...",
  dictionaryBanksFound: "{count} bank{plural} found.",
  dictionaryRemovingExisting: "removing old entries",
  dictionaryReadingBank: "Reading",
  dictionaryParsingBank: "Parsing",
  dictionarySavingBank: "Saving",
  dictionaryImporting: "Importing",
  importingBundledDictionaries: "Importing bundled dictionaries...",
  dictionaryImported: "Imported",
  dictionaryPreparingImport: "Preparing import",
  dictionaryRecords: "dictionary records",
  dictionaryEntries: "entries",
  dictionaryTotal: "total",
  dictionaryDownloadProgress: "Downloading",
  dictionaryStatusSummary: "Dicts {dictionaries}, terms {terms}, kanji {kanji}, meta {metadata}",
  dictionaryStatusUnavailable: "Unavailable.",
  noLocalDictionariesImported: "No dictionaries imported yet. Start with a term dictionary for definitions.",
  dictionaryDownloadFailed: "Dictionary download failed.",
  storageRuntimeUnavailable: "よむ storage is unavailable. Reload the page; if this continues, reinstall よむ.",
  dictionaryDownloadTimedOut: "Dictionary download timed out.",
  dictionaryDownloadNotZip: "Download was not a ZIP.",
  dictionaryStorageFull: "Not enough storage space for this dictionary. Free up space or remove a dictionary, then try again.",
  dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
  dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
  dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
  dictionaryInstallQueueHelp: "Install a term dictionary first for definitions. Pronunciation (IPA), Japanese pitch, and frequency dictionaries add pronunciations, pitch accents, and badges, not normal definition text.",
  dictionaryInstallQueued: "{dictionary} queued.",
  dictionaryInstallSaveBlocked: "Import running. Save unlocks when done.",
  dictionaryImportQueueStatus: "{count} install{plural} running.",
  dictionaryInstallRunning: "{count} install{plural} running.",
  dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
  dictionaryRemoving: "Removing {dictionary}...",
  dictionaryRemoved: "Removed {dictionary}.",
  ...LOCAL_DICTIONARY_STORAGE_COPY.enImport,
  dictionaryRecordsImported: "{dictionary}: {records} records.",
  settingsImported: "Settings imported.",
  settingsImportedWithDetails: "Settings imported; {details}.",
  settingsExported: "Settings exported.",
  restoredStoredChoices: "restored {count} stored choice{plural}",
  importedDictionaryRecordCount: "imported {count} dictionary record{plural}",
  dictionaryNoSupportedBanks: "No supported banks found.",
  dictionaryUnsupportedJson: "Use Dexie, ZIP, or export.",
  dictionaryZipMissingIndex: "ZIP missing index.json.",
  localWordSingular: "entry",
  localWordPlural: "entries",
  decksLoaded: "Decks are loaded from your JPDB account.",
  decksUnavailable: "Could not load decks; saved IDs kept.",
  addApiKeyChooseDecks: "Add your JPDB API key to choose decks.",
  miningDeck: "Mining deck",
  neverForgetDeck: "Never forget deck",
  blacklistDeck: "Blacklist deck",
  allStudyDecks: "All study decks",
  savedValue: "Saved: {value}",
  holdWhileHovering: "Hold while hovering",
  hoverOpenDelayMs: "Hover open delay (ms)",
  hoverCloseDelayMs: "Hover close delay (ms)",
  pressKeys: "Press keys",
  blankPlainHover: "Blank = hover, no key",
  openSettings: "Open settings",
  resizeSettings: "Resize settings",
  playAudio: "Play audio",
  playingAudioPreview: `Playing ${APP_NAME}...`,
  audioPreviewFailed: "Audio preview failed.",
  audioPlaybackDisabled: "Audio playback is disabled",
  audioPlaybackDisabledToast: "Audio playback is disabled.",
  audioPlaybackFailed: "Audio playback failed.",
  noSentenceToRead: "No sentence to read aloud.",
  noTextToRead: "No text to read aloud.",
  jpdbExampleAudioUnavailable: "No JPDB audio is available for this example.",
  jpdbAudioPlayableFileMissing: "JPDB audio returned no playable file.",
  jpdbAudioResponseNotPlayable: "JPDB audio was not playable.",
  audioSourceReturnedNoAudio: "Audio source did not return audio.",
  audioJsonMissingPlayableUrl: "Audio JSON had no playable URL.",
  textToSpeechUnavailable: "Text-to-speech is unavailable.",
  textToSpeechFailed: "Text-to-speech failed.",
  audioRequest: "Audio request",
  audioRequestTimedOut: "Audio request timed out.",
  audioRequestReturnedNonAudioWithType: "Audio request returned non-audio: {type}.",
  audioUnknownContentType: "an unknown content type",
  japanesePod101NoAudio: "JapanesePod101 has no audio for this term.",
  invalidJpdbAudioId: "Invalid JPDB audio id.",
  couldNotReadAudio: "Could not read audio.",
  couldNotReadAudioBlob: "Could not read audio blob.",
  closeDrawer: "Close drawer",
  closePopup: "Close popup",
  previousLookupWord: "Previous word",
  nextLookupWord: "Next word",
  previousSubtitle: "Previous subtitle",
  nextSubtitle: "Next subtitle",
  jumpToCurrentSubtitle: "Jump to current subtitle",
  pauseVideo: "Pause video",
  readVideoFrame: "Read video frame (OCR)",
  readVideoFrameStop: "Stop reading video frames (OCR)",
  copySubtitle: "Copy subtitle",
  subtitleFallbackLabel: "Subtitle",
  subtitlesTitle: "Subtitles",
  openSubtitlePanel: "Open subtitle panel",
  closeSubtitlePanel: "Close subtitle panel",
  subtitleStyle: "Subtitle style",
  subtitleResetDefaults: "Reset defaults",
  enableSubtitleAutoHide: "Auto-hide panel while playing",
  disableSubtitleAutoHide: "Keep panel open while playing",
  subtitlePanelOptions: "Panel options",
  searchAnimeSubtitles: "Search anime subtitles",
  toggleNativeSubtitleBlur: "Toggle native subtitle blur",
  subtitleTrackDetectedSingular: "1 subtitle track detected",
  subtitleTracksDetected: "subtitle tracks detected",
  noSubtitleTracksDetected: "No subtitle tracks detected yet.",
  resizeTranscriptPanel: "Resize transcript panel",
  resizeSubtitleTracksPanel: "Resize subtitle tracks panel",
  subtitlePanelMode: "Mode",
  subtitleLines: "Lines",
  shadow: "Shadow",
  subtitleTracks: "Tracks",
  subtitleTrackTiming: "Subtitle timing",
  subtitleOffsetPrevious: "Align previous subtitle to current time",
  subtitleOffsetNext: "Align next subtitle to current time",
  subtitleOffsetPreviousShort: "Prev",
  subtitleOffsetNextShort: "Next",
  subtitleOffsetEarlier: "Show subtitles 100 ms earlier",
  subtitleOffsetLater: "Show subtitles 100 ms later",
  resetSubtitleOffset: "Reset subtitle timing",
  copySubtitleLine: "Copy subtitle line",
  subtitleCopyIncludeTranslation: "Copy line translation too",
  peekSubtitleTranslation: "Show translation",
  hideSubtitleTranslation: "Hide translation",
  loadingSubtitleLines: "Loading subtitle lines",
  waitingForCaptionLines: "Waiting for caption lines",
  subtitleCurrentLineWillAppear: "Current line appears when captions load.",
  seekSubtitleLine: "Seek subtitle line",
  subtitleTracksHint: "Choose a primary track. Use Lines to jump.",
  autoDetectedTracksWillAppear: "Subtitle tracks appear here.",
  autoDetectedOptionSingular: "1 subtitle option",
  autoDetectedOptions: "subtitle options",
  detected: "Detected",
  primaryOverlay: "primary overlay",
  nativeOverlay: "native overlay",
  unsetPrimarySubtitles: "Unset primary",
  primarySubtitles: "Primary",
  unsetNativeSubtitles: "Unset native",
  nativeSubtitles: "Native",
  choosePrimarySubtitles: "Choose primary subtitles",
  transcript: "Transcript",
  subtitleOptionSingular: "option",
  subtitleOptionPlural: "options",
  subtitleLineSingular: "line",
  subtitleLinePlural: "lines",
  trackKindPageTrack: "page track",
  trackKindPageFile: "page file",
  trackKindYouTubeCaptions: "YouTube captions",
  youTubeSubtitles: "YouTube subtitles",
  autoGeneratedSubtitle: "auto-generated",
  trackKindLoadedFile: "loaded file",
  trackStatusLoading: "loading",
  trackStatusWaiting: "waiting for captions",
  trackStatusFailed: "failed",
  moveSubtitles: "Move subtitles",
  moveSubtitlesAccessible: "Move subtitles. Drag, or use the arrow and Page Up/Page Down keys. Press Home or 0 to reset.",
  moveSubtitleControls: "Subtitle controls. Tap to expand or collapse. Drag, or use the arrow keys, to move. Press Home or 0 to reset.",
  toggleImageReading: "Toggle image reading",
  toggleSubtitleOverlay: "Toggle subtitle overlay",
  toggleYoutubeImmersion: "Toggle YouTube filter",
  readImagesNow: "Read images now",
  massReviewVisible: "Mass review visible words (Jiten)",
  studyReveal: "Study: reveal card",
  studyRevealAlternate: "Study: reveal card (alternate)",
  studyUndo: "Study: undo last review",
  studyPrevious: "Study: previous card",
  studyPreviousAlternate: "Study: previous card (alternate)",
  studyNext: "Study: next card",
  studyNextAlternate: "Study: next card (alternate)",
  massReviewNoWords: "No due Jiten words on screen.",
  massReviewNoKey: "Add a Jiten API key to mass review.",
  massReviewDone: "Reviewed {count} words as Good.",
  massReviewFailed: "Mass review failed.",
  adapterStateDisabled: "Off",
  adapterStateProbing: "Probing",
  adapterStateUnreachable: "Unreachable",
  adapterStateConnected: "Connected",
  adapterStateScanning: "Scanning",
  adapterStateSuggested: "Mapped",
  adapterStateStale: "Needs review",
  adapterStateReady: "Ready",
  ankiMappingConfidenceHigh: "high match",
  ankiMappingConfidenceMedium: "fuzzy match",
  ankiMappingConfidenceLow: "unmapped",
  ankiMappingStaleField: "saved field missing",
  ...OCR_STATUS_COPY.en,
  gradeNothing: "Grade NOTHING",
  gradeSomething: "Grade SOMETHING",
  gradeHard: "Grade HARD",
  gradeOkay: "Grade OKAY",
  gradeEasy: "Grade EASY",
  gradeFail: "Pass/fail: FAIL",
  gradePass: "Pass/fail: PASS",
  helpLinksTitle: "Useful pages",
  versionAndUpdates: "Version",
  currentYomuVersion: "Yomu",
  updateStatusIdle: "Current {current}. Latest check pending.",
  updateStatusChecking: "Current {current}. Checking latest...",
  updateStatusCurrent: "Current {current}. Latest {latest}. Up to date.",
  updateStatusAvailable: "Current {current}. Latest {latest}. Update available.",
  updateStatusUnknown: "Current {current}. Latest check failed; reinstall if needed.",
  updateStatusIncomparable: "Current {current}. Latest {latest}. Cannot compare versions; use Update if this install is old.",
  updateHelpNotesManager: 'Keep one Yomu script enabled. Update opens your userscript manager’s install screen. If the browser shows a blocked-install banner instead, open your extensions page, open the manager’s details, and turn on "Allow user scripts" (or Developer mode), then retry.',
  updateHelpNotesManagerDashboard: "On Chrome or Edge, Update opens the Tampermonkey dashboard instructions: Utilities → Check for userscript updates. This avoids the browser’s blocked website-install banner.",
  updateHelpNotesExternalManager: "Keep one Yomu script enabled. Update opens the script source; your userscript app reads it from the open tab to update. If updates stall on iPhone/iPad, open this link in Safari and leave the tab open.",
  updateHelpNotesNoManager: "No userscript manager was detected here, and browsers block direct script installs — Update opens the install guide with per-browser steps.",
  updateHelpNotesExtensionStore: "Updates come from the browser extension store.",
  updateUserscript: "Update",
  duplicateStatusSingle: "One Yomu runtime active ({kind}).",
  duplicateStatusUnknown: "Duplicate check unavailable. If Yomu appears twice, disable the older script.",
  ankiConnectSetupTitle: "AnkiConnect setup",
  ankiConnectSetupCopy: "Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.",
  ankiConnectSetupConfig: "Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:",
  ankiConnectSetupMobile: "For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.",
  ankiConnectSetupBrave: "In Brave, disable Shields for the Study page if local Anki checks are blocked.",
  helpSupportTitle: "Support よむ",
  helpSupportCopy: SUPPORT_COPY,
  helpSupportCopyExtra: SUPPORT_COPY_EXTRA,
  videoPlayer: "Video Player",
  pdfReader: "PDF Reader",
  newTabPage: "Study",
  github: "GitHub",
  word: "Word",
  search: "Search",
  loading: "Loading...",
  reveal: "Reveal",
  revealTranslation: "Reveal translation",
  immersionExampleControls: "Immersion Kit example controls",
  exampleSearchLinks: "Example searches",
  loadingKanjiDetails: "Loading kanji details...",
  lookupDialog: `${APP_NAME} lookup`,
  resizeLookupSheet: "Drag to resize lookup sheet, or tap to close",
  showMiningActions: "More actions",
  hideMiningActions: "Fewer actions",
  ...GRADING_SERVICE_COPY.en,
  jpdbKanjiUpdated: "JPDB kanji updated.",
  jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check kanji reviews.",
  apiSrsActionsDisabled: "API mining actions are disabled in settings.",
  addJpdbApiKeyReview: "Add a JPDB API key to review JPDB cards.",
  addJitenApiKeyReview: "Add a Jiten API key to review Jiten cards.",
  addBunproApiKeyReview: "Add a Bunpro frontend API token to review Bunpro cards.",
  addWanikaniApiKeyReview: "Add a WaniKani personal access token to review due WaniKani assignments.",
  actionFailed: "Action failed.",
  dictionary: "Dictionary",
  dictionariesExported: "Dictionaries exported.",
  local: "Local",
  dict: "dict",
  filterStudy: "Study",
  filterAll: "All",
  sortFrequency: "Frequency",
  stateNew: "New",
  stateLearning: "Learning",
  stateYoung: "Young",
  stateMature: "Mature",
  stateDue: "Due",
  stateFailed: "Failed",
  stateKnown: "Known",
  stateMastered: "Mastered",
  stateNeverForget: "Never forget",
  stateSuspended: "Suspended",
  stateLocked: "Locked",
  stateBlacklisted: "Blacklisted",
  stateRedundant: "Redundant",
  stateFrequent: "Frequent",
  stateUnparsed: "Unparsed",
  stateInDeck: "In deck",
  stateNotInDeck: "Not in deck",
  ankiReviewSingular: "review",
  ankiReviewPlural: "reviews",
  ankiLapseSingular: "lapse",
  ankiLapsePlural: "lapses",
  gradeNothingLabel: "Nothing",
  gradeAgainLabel: "Again",
  gradeGoodLabel: "Good",
  gradeSomethingLabel: "Something",
  gradeHardLabel: "Hard",
  gradeOkayLabel: "Okay",
  gradeEasyLabel: "Easy",
  gradeFailLabel: "Fail",
  gradePassLabel: "Pass",
  factKeyword: "Keyword",
  factType: "Type",
  factFrequency: "Frequency",
  factMeaning: "Meaning",
  factGrade: "Grade",
  factOldForms: "Old forms",
  docs: "Docs",
  factoryReset: "Factory Reset",
  factoryResetConfirm: "Reset all {appName} data?\n\nDeletes settings, keys, cache, dicts.",
  factoryResetFailed: "Reset failed.",
  factoryResetStorageIncomplete: "Reset stopped because not every saved item could be found or deleted. Close other よむ tabs and retry. If it still fails, clear よむ storage in your userscript manager.",
  factoryResetOtherTabReloading: "よむ reset elsewhere. Reloading...",
  issues: "Issues",
  donate: "Donate",
  discord: "Discord",
  openOnJpdb: "Open on JPDB",
  openOnLookup: "Open on {label}",
  viewOnLookup: "View on {label}",
  copyWordTitle: "Copy word",
  copiedWord: "Copied word.",
  backToWord: "Back to word",
  backToKanji: "Back to kanji",
  previousKanji: "Previous kanji",
  nextKanji: "Next kanji",
  openKanjiOnJpdb: "Open kanji on JPDB",
  strokePractice: "Stroke order + practice",
  practiceDrawing: "Practice drawing",
  strokes: "strokes",
  textTrace: "text trace",
  hideTrace: "Hide trace",
  showTrace: "Show trace",
  clear: "Clear",
  originStructure: "Component graph",
  originMapLabel: "2D kanji origin and component map",
  originShowSubcomponents: "Subcomponents",
  originShowOutbound: "Outbounds",
  kanjiAlive: "Kanji Alive",
  wiktionary: "Wiktionary",
  radical: "Radical",
  readingsComponents: "Readings and components",
  showKanji: "Show kanji",
  jpdbMnemonic: "JPDB mnemonic",
  rtkComponentKeywords: "RTK component keywords",
  onReading: "On",
  kunReading: "Kun",
  heisigStory: "Heisig story",
  heisigComment: "Heisig comment",
  koohiiStories: "Koohii stories",
  add: "Add",
  addToDeck: "Add to deck…",
  deck: "Deck",
  deckActions: "Deck actions",
  reviewBlockedBlacklisted: "Blacklisted. Unlist before reviewing.",
  reviewBlockedNeverForget: "Never-forget. Remove before reviewing.",
  reviewBlockedRedundant: "JPDB marks this redundant.",
  ankiCardsSuspended: "Suspended in Anki (works like a blacklist).",
  ankiCardsUnsuspended: "Unsuspended in Anki.",
  ankiNeverForgetTagAdded: "Tagged yomu-never-forget.",
  ankiNeverForgetTagRemoved: "Removed yomu-never-forget.",
  forget: "Forget",
  never: "Never forget",
  unlist: "Unlist",
  blacklist: "Blacklist",
  vocabularyStatusUpdated: "Vocabulary status updated.",
  addToAnki: "Add to Anki",
  sendToMobileAnki: "Send to {app}",
  ankiAudioFileNotFound: "Anki audio file not found.",
  ankiAudioPlaybackUnavailable: "Anki audio playback is not available here.",
  ankiAudioUnavailablePreview: "Audio not available in preview",
  ankiAudioFilenameLabel: "Anki audio {filename}",
  ankiStoredFields: "Stored fields",
  ankiCardDetailsPending: "Matched in Anki. Loading details...",
  ankiCardDetailsUnavailable: "Matched in Anki. showing cached status.",
  ankiNewCard: "New card",
  ankiMatches: "Anki matches",
  gradeAnkiCardTarget: "Grades Anki card: {target}",
  ankiNoteNotFound: "Anki note not found.",
  mergeYomu: "Merge Yomu",
  mergeYomuTitle: "Update matching fields and add Yomu media to this note",
  editInAnki: "Edit in Anki",
  keepBothAudio: "Keep both",
  keepAnkiAudio: "Keep Anki",
  useYomuAudio: "Use Yomu",
  lastSeen: "Last seen",
  unavailable: "Unavailable",
  openedInAnki: "Opened in Anki.",
  addedToDeckAndReviewed: "Added to deck and reviewed.",
  sentToAnki: "Sent to Anki.",
  openedMobileAnkiHandoff: "Opened Anki handoff. Continue in Anki.",
  alreadyInAnki: "Already in Anki. Use Edit in Anki instead.",
  removedFromDeck: "Removed from deck.",
  addedToDeckToast: "Added to deck.",
  apiDeckMediaNotSupported: "Media stays in Yomu; no media API.",
  sentToAnkiWithContextImageAndAudio: "Sent to Anki with image and audio.",
  sentToAnkiWithContextImage: "Sent to Anki with image.",
  sentToAnkiWithAudio: "Sent to Anki with audio.",
  ankiMergeNoNewData: "Anki note already has the Yomu data.",
  ankiMergeFieldSingular: "field",
  ankiMergeFieldPlural: "fields",
  ankiMergeAudio: "audio",
  ankiMergeImage: "image",
  ankiMergeComplete: "Merged Yomu data into Anki ({parts}).",
  ankiHandoffCancelled: "Anki handoff cancelled.",
  ankiConnectActionFailed: "AnkiConnect action failed.",
  ankiConnectRequestFailed: "AnkiConnect request failed.",
  ankiConnectTimedOut: "AnkiConnect timed out.",
  mobileAnkiReady: "Anki offline. Handoff can create notes.",
  ankiConnectionReady: "Connected. AnkiConnect is reachable.",
  ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
  ankiPromptRecallWord: "Recall the highlighted word.",
  ankiMeaningHeading: "Meaning",
  ankiPitchHeading: "Pitch",
  ankiPartOfSpeechHeading: "Part of speech",
  ankiLinksHeading: "Links",
  ankiSourceHeading: "Source",
  ankiLocalDictionaryStatus: "local dictionary",
  composedOf: "Composed of",
  ocrModeAutoToast: "Image OCR automatic.",
  ocrModeManualToast: "Image OCR on tap or hover.",
  ocrModeOffToast: "Image OCR off.",
  subtitleOverlayEnabled: "Subtitle overlay enabled.",
  subtitleOverlayHidden: "Subtitle overlay hidden.",
  reviewFailed: "Review failed.",
  reviewActionsDisabled: "Review actions are disabled in settings.",
  jpdbLookupFailed: "JPDB lookup failed.",
  jpdbApiKeyMissingError: "Add a JPDB API key in Settings.",
  jpdbApiKeyRejectedError: "JPDB rejected the API key. Check it in Settings.",
  jpdbRateLimitedError: "JPDB is busy. Try again in a moment.",
  jpdbConnectionCoolingDownError: "JPDB is temporarily unreachable. Try again in a moment.",
  jpdbRequestTimedOutError: "JPDB took too long to respond. Try again.",
  jpdbRequestFailedError: "JPDB request failed. Try again.",
  jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
  jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
  wanikaniAddApiKeyRequired: "Add a WaniKani personal access token to review due assignments.",
  addedToWanikani: "Recorded on WaniKani.",
  kanjiDetailsUnavailable: "Kanji details are not available yet.",
  loadingDictionaryDetails: "Loading dictionary details...",
  jitenCompositeWords: "Composite words",
  usedInVocabulary: "Used in vocabulary",
  exampleSentences: "Example sentences",
  moreMeanings: "More meanings",
  moreExamples: "More examples",
  // U46: every one of these is a state a learner can reach. They exist
  // because an example source with nothing to show used to render nothing
  // at all, so an unsupported language looked exactly like a broken one.
  exampleSourceEmpty: "No examples for this word yet.",
  exampleSourceEmptyShort: "None yet",
  exampleSourceLimitedCorpus: "This corpus is small, so many words have no example yet.",
  exampleSourceUnsupported: "This source has no {language} sentences.",
  exampleSourceUnsupportedShort: "Other languages",
  exampleSourceFailed: "Examples did not load.",
  exampleSourceFailedShort: "Not loaded",
  exampleSourceRetry: "Try again",
  exampleSourceAudioPerItem: "Audio plays where the recording is openly licensed.",
  exampleSourceNoSentenceAudio: "Open {language} sentence audio is not available yet.",
  exampleSourceNoLicensedAudio: "These sentences came without openly licensed audio.",
  exampleSourceNoImage: "Scene images are Japanese only for now.",
  exampleSourceNoTranslation: "No {language} translation yet.",
  exampleSourceMachineTranslation: "Machine translation",
  exampleSourceIndirectTranslation: "Translated via another language",
  exampleSourcePlayAudio: "Play sentence audio",
  acceptedInputs: "Accepted inputs",
  relatedWords: "Related words",
  bunproUsedInVocab: "Used in",
  relatedGrammar: "Related grammar",
  antonymWord: "Antonym",
  bunproCaution: "Caution",
  bunproStructure: "Structure",
  playJpdbExampleAudio: "Play JPDB example audio",
  contextVideo: "Video",
  contextImage: "Image",
  contextCurrentPage: "Current page",
  jpdbKanjiActionMine: "Add",
  jpdbKanjiActionKnown: "Known",
  jpdbKanjiActionNeverForget: "Never forget",
  jpdbKanjiActionForget: "Forget",
  jpdbKanjiActionBlacklist: "Blacklist",
  jpdbKanjiActionReview: "Review",
  noDefinitions: "No enabled definition source returned results.",
  enabledHeader: "On",
  labelHeader: "Label",
  displayName: "Display name",
  orderHeader: "Order",
  removeHeader: "Remove",
  definitionSource: "Definition source",
  popupOrderTitle: "Popup order",
  kanjiSection: "Kanji section",
  dragToReorder: "Drag to reorder",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
  removeImportedDictionary: "Remove imported dictionary",
  customAdvanced: "{label} (advanced)",
  importLocalDefinitionsHelp: "Import Yomitan for local definitions.",
  metadataDictionariesHelp: "Metadata dictionaries appear as badges or kanji data.",
  sourceHelpJpdb: "JPDB meanings from the current card.",
  sourceHelpJiten: "Jiten meanings, examples, and related words.",
  sourceHelpBunpro: "Bunpro vocabulary and grammar meanings, nuance, and examples.",
  sourceHelpWanikani: "WaniKani vocabulary meanings, mnemonics, and SRS status for subjects on your account.",
  sourceHelpAnki: "Matching Anki card content and status.",
  sourceHelpTranslation: "Sentence translation.",
  sourceHelpGrammar: "Local grammar hints.",
  sourceHelpImmersionKit: "Example sentences, images, and audio.",
  sourceNameImmersionKit: "Immersion Kit",
  sourceNameAnki: "Anki",
  sourceNameTranslation: "Translation",
  sourceNameGrammar: "Grammar",
  sourceNameStrokePractice: "Stroke practice",
  sourceNameImportedKanjiDictionaries: "Imported kanji dictionaries",
  sourceNameWordsUsingKanji: "Related vocabulary",
  sourceNameJitenKanjiFacts: "Jiten kanji facts",
  sourceHelpImportedKanjiDictionary: "Imported Yomitan kanji dictionary.",
  sourceHelpStrokePractice: "Stroke order preview and drawing pad.",
  sourceHelpReadingsComponents: "JPDB readings, components, and mnemonic.",
  sourceHelpJitenKanjiFacts: "Jiten kanji facts, frequency, readings, words.",
  sourceHelpRtk: "RTK keywords, elements, and stories.",
  sourceHelpWanikaniKanji: "WaniKani kanji meaning/reading mnemonics, level, and SRS status.",
  sourceHelpImportedKanjiDictionaries: "Imported Yomitan kanji entries.",
  sourceHelpWordsUsingKanji: "Related vocabulary.",
  sourceHelpComponentGraph: "Kanji facts, components, radical images.",
  recommendedJitendex: "Term definitions with examples.",
  recommendedWtyJapaneseJapanese: "Japanese-to-Japanese term definitions.",
  recommendedPixivLight: "Pixiv terms.",
  recommendedJpdbKanji: "JPDB kanji.",
  recommendedKanjiumPitch: "Pitch accents only; add a term dictionary for definitions.",
  recommendedBccwj: "Frequency badges from BCCWJ.",
  recommendedJiten: "Frequency badges from Jiten.",
  lines: "Lines",
  tracks: "Tracks",
  native: "Native",
  options: "options",
  option: "option",
  line: "line",
  translation: "Translation",
  grammar: "Grammar",
  meaning: "Meaning",
  readSentenceAloud: "Read sentence aloud",
  openSectionToTranslate: "Open this section to translate.",
  translationUnavailable: "Translation unavailable.",
  translating: "Translating...",
  ...GRAMMAR_UI_COPY.en
  }
};
function parseUiCopyTable(rows) {
  const copy2 = {};
  rows.trim().split("\n").map((row) => row.replace(/^ +/u, "")).forEach((row) => {
  const tab = row.indexOf("	");
  if (tab < 0) {
    const key = row.trim();
    if (key) copy2[key] = "";
    return;
  }
  if (tab === 0) return;
  copy2[row.slice(0, tab)] = row.slice(tab + 1).replaceAll("{APP_NAME}", APP_NAME);
  });
  return copy2;
}
const JA_COPY = {
  ...parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
statsEmptyHelp	最初の学習のあと、復習の記録と進み具合がここに表示されます。
libraryEmpty	読みながら単語を保存すると、ここに表示されます。
moreLookupLinks	その他のリンク
audioSourcesTitle	音声ソース
settingsSaveFailed	設定を保存できませんでした。
settingsCompanionUnavailable	設定を開けませんでした。
firefoxAuthenticationInfoDenied	Firefoxの許可がなかったため、アカウント情報は保存しませんでした。
firefoxAuthenticationInfoExtensionPageRequired	Firefoxでこの許可を求めるにはYomuのページが必要です。学習ページを開き、設定からアカウント情報を追加してください。
dictionaries	辞書
sources	ソース
localWordSingular	項目
localWordPlural	項目
kanji	漢字
audio	音声
front	表面
back	裏面
newTabPage	学習
word	単語
search	検索
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
loading	読み込み中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
exampleSearchLinks	例文検索リンク
loadingKanjiDetails	漢字情報を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	その他の操作
hideMiningActions	操作を閉じる
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
addBunproApiKeyReview	Bunproレビューにはfrontend_api_tokenが必要です。
addWanikaniApiKeyReview	期限が来たWaniKaniの課題を復習するには、パーソナルアクセストークンを追加してください。
actionFailed	操作に失敗しました。
noDefinitions	有効な定義ソースから結果が返りませんでした。
dictionary	辞書
dictionariesExported	辞書をエクスポートしました。
saveAfterInstall	インストール後に保存
dictionaryDownloading	ダウンロード中
dictionaryReadingZip	辞書ZIPを読み取り中...
dictionaryCheckingIndex	インデックス確認中...
dictionaryBanksFound	{count}件のバンクを検出
dictionaryRemovingExisting	既存項目を削除中
dictionaryReadingBank	読み取り中
dictionaryParsingBank	解析中
dictionarySavingBank	保存中
dictionaryImporting	インポート中
importingBundledDictionaries	同梱辞書をインポート中...
dictionaryImported	インポート済み
dictionaryPreparingImport	インポート準備中
dictionaryRecords	辞書レコード
dictionaryEntries	件
dictionaryTotal	合計
dictionaryDownloadProgress	辞書をダウンロード中
dictionaryStatusSummary	辞書{dictionaries}、語{terms}、漢字{kanji}、メタ{metadata}
dictionaryStatusUnavailable	辞書状態を取得不可。
noLocalDictionariesImported	辞書は未追加です。まず定義用の語句辞書を追加してください。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
storageRuntimeUnavailable	よむの保存機能を利用できません。ページを再読み込みし、解決しない場合はよむを再インストールしてください。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryStorageFull	この辞書を保存する空き容量が足りません。空き容量を増やすか辞書を削除してから、もう一度お試しください。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。発音（IPA）/日本語ピッチ/頻度辞書は発音、ピッチアクセント、バッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryInstallRunning	{count}件インストール中。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
${Object.entries(LOCAL_DICTIONARY_STORAGE_COPY.jaImport).map(([key, value]) => `${key}	${value}`).join("\n")}
dictionaryRecordsImported	{dictionary}: {records}件
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応辞書バンクがありません。
dictionaryUnsupportedJson	Dexie、ZIP、出力を使ってください。
dictionaryZipMissingIndex	ZIPにindex.jsonがありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
contextOccurrences	文脈内 ×{count}
puckAutoDetectSubtitles	字幕を自動検出
loadTargetSubtitles	日本語字幕を読み込む
loadOutputSubtitles	英語字幕を読み込む
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	{percent}%・{known}/{total}・新{unknown}・i+1 {iPlusOne}
noImmersionExamplesCompact	例文なし
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
lines	行
tracks	トラック
native	母語
options	件
option	件
line	行
filterStudy	学習
filterAll	すべて
sortFrequency	頻度
stateNew	新規
stateLearning	学習中
stateYoung	若い
stateMature	成熟
stateDue	復習予定
stateFailed	失敗
stateKnown	既知
stateMastered	習得済み
stateNeverForget	忘れない
jpdbAndJitenApiKeysConfigured	JitenとJPDBキーあり。
stateSuspended	停止中
stateLocked	ロック中
stateBlacklisted	ブラックリスト
stateRedundant	重複
stateFrequent	頻出
stateUnparsed	未解析
stateInDeck	デッキ内
stateNotInDeck	デッキ外
gradeAnkiCardTarget	Ankiカードを採点: {target}
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
gradeAgainLabel	もう一度
gradeGoodLabel	良い
gradeSomethingLabel	少し
gradeHardLabel	難しい
gradeOkayLabel	OK
gradeEasyLabel	簡単
gradeFailLabel	失敗
gradePassLabel	合格
gradeNothing	採点: 全然
gradeSomething	採点: 少し
gradeHard	採点: 難しい
gradeOkay	採点: OK
gradeEasy	採点: 簡単
gradeFail	合否: 失敗
gradePass	合否: 合格
studyReveal	学習: カードを表示
studyRevealAlternate	学習: カードを表示（代替）
studyUndo	学習: 直前のレビューを取り消す
studyPrevious	学習: 前のカード
studyPreviousAlternate	学習: 前のカード（代替）
studyNext	学習: 次のカード
studyNextAlternate	学習: 次のカード（代替）
factKeyword	キーワード
factType	種類
factFrequency	頻度
factMeaning	意味
factGrade	学年
factOldForms	旧字体
noSimilarWords	追加の単語は見つかりませんでした。
loadingExamples	例文を読み込み中...
immersionKitRateLimited	Immersion Kit制限中。あとで再試行。
immersionKitRequest	Immersion Kitリクエスト
immersionKitRequestFailed	Immersion Kitリクエストに失敗しました。
immersionKitRequestFailedWithStatus	Immersion Kitリクエストに失敗しました（{status}）。
immersionKitRequestTimedOut	Immersion Kitリクエストがタイムアウトしました。
immersionKitSearchBlocked	Immersion Kit検索がブロック中です。CORSを設定してください。
immersionKitMediaRequest	メディアリクエスト
immersionKitMediaRequestFailed	メディアリクエストに失敗しました。
immersionKitMediaRequestFailedWithStatus	メディアリクエストに失敗しました（{status}）。
immersionKitMediaRequestTimedOut	メディアリクエストがタイムアウトしました。
immersionKitMediaRequestReturnedNonMedia	メディアリクエストがエラードキュメントを返しました。
immersionKitNoMediaCandidate	読み込めるメディア候補なし。
nadeshikoRequest	Nadeshikoリクエスト
nadeshikoRequestFailed	Nadeshikoリクエストに失敗しました。
nadeshikoRequestFailedWithStatus	Nadeshikoリクエストに失敗しました（{status}）。
nadeshikoRequestTimedOut	Nadeshikoリクエストがタイムアウトしました。
previousExample	前の例文
nextExample	次の例文
playExampleAudio	例文音声を再生
openOnJpdb	JPDBで開く
openOnLookup	{label}で開く
viewOnLookup	{label}で見る
copyWordTitle	単語をコピー
backToWord	単語に戻る
backToKanji	漢字に戻る
previousKanji	前の漢字
nextKanji	次の漢字
openKanjiOnJpdb	JPDBで漢字を開く
playAudio	音声を再生
audioPlaybackDisabled	音声再生は無効です
audioPlaybackDisabledToast	音声再生は無効です。
audioPlaybackFailed	音声の再生に失敗しました。
noSentenceToRead	読み上げる例文がありません。
noTextToRead	読み上げるテキストがありません。
jpdbExampleAudioUnavailable	この例文にJPDB音声なし。
jpdbAudioPlayableFileMissing	JPDB音声に再生ファイルなし。
jpdbAudioResponseNotPlayable	JPDB音声は再生不可。
audioSourceReturnedNoAudio	音声ソースに音声なし。
audioJsonMissingPlayableUrl	音声JSONに再生URLなし。
textToSpeechUnavailable	読み上げを利用できません。
textToSpeechFailed	読み上げに失敗しました。
audioRequest	音声リクエスト
audioRequestTimedOut	音声リクエストがタイムアウトしました。
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitlePanelOptions	パネル設定
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitlePanelMode	表示
subtitleLines	行
shadow	シャドー
subtitleTracks	トラック
subtitleTrackTiming	字幕タイミング
subtitleOffsetPrevious	前の字幕を現在時刻に合わせる
subtitleOffsetNext	次の字幕を現在時刻に合わせる
subtitleOffsetPreviousShort	前
subtitleOffsetNextShort	次
subtitleOffsetEarlier	字幕を100ミリ秒早く表示
subtitleOffsetLater	字幕を100ミリ秒遅く表示
resetSubtitleOffset	字幕タイミングをリセット
copySubtitleLine	字幕行をコピー
subtitleCopyIncludeTranslation	行コピー時に翻訳も含める
peekSubtitleTranslation	翻訳を表示
hideSubtitleTranslation	翻訳を隠す
loadingSubtitleLines	字幕行を読み込み中
waitingForCaptionLines	字幕行を待機中
subtitleCurrentLineWillAppear	字幕が来ると現在行を表示します。
seekSubtitleLine	字幕行へ移動
subtitleTracksHint	主字幕を選び、「行」で移動。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetPrimarySubtitles	主字幕を解除
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
choosePrimarySubtitles	主字幕を選択
transcript	文字起こし
subtitleOptionSingular	件
subtitleOptionPlural	件
subtitleLineSingular	行
subtitleLinePlural	行
trackKindPageTrack	ページ内トラック
trackKindPageFile	ページ内ファイル
trackKindYouTubeCaptions	YouTube字幕
youTubeSubtitles	YouTube字幕
autoGeneratedSubtitle	自動生成
trackKindLoadedFile	読み込んだファイル
trackStatusLoading	読み込み中
trackStatusWaiting	字幕待機中
trackStatusFailed	失敗
showKanji	漢字を表示
strokePractice	筆順と練習
practiceDrawing	手書き練習
strokes	画
textTrace	筆順ガイド
hideTrace	ガイドを隠す
showTrace	ガイドを表示
clear	クリア
originStructure	部品グラフ
originMapLabel	2D漢字由来・部品マップ
originShowSubcomponents	下位部品
originShowOutbound	派生先
radical	部首
readingsComponents	読みと部品
jpdbMnemonic	JPDBの覚え方
rtkComponentKeywords	RTK部品キーワード
onReading	音
kunReading	訓
heisigStory	Heisigストーリー
heisigComment	Heisigコメント
koohiiStories	Koohiiストーリー
add	追加
addToDeck	デッキに追加…
deck	デッキ
deckActions	デッキ操作
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
unlist	解除
blacklist	ブラックリスト
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
sendToMobileAnki	{app}へ送る
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiHostedCorsHint	webCorsOriginListに{origin}を追加してください。
mobileAnkiReady	Anki未接続。受け渡しでカード作成できます。
ankiConnectionReady	接続しました。AnkiConnectに到達できます。
ankiConnectedReady	接続済み。「{deck}」/「{model}」準備完了。
ankiPromptRecallWord	ハイライトされた単語を思い出してください。
ankiMeaningHeading	意味
ankiPitchHeading	ピッチ
ankiPartOfSpeechHeading	品詞
ankiLinksHeading	リンク
ankiSourceHeading	出典
ankiLocalDictionaryStatus	ローカル辞書
mergeYomu	Yomuを統合
mergeYomuTitle	一致フィールドを更新し、Yomuメディアを追加
editInAnki	Ankiで編集
keepBothAudio	両方残す
keepAnkiAudio	Ankiを残す
useYomuAudio	Yomuを使う
lastSeen	最後に見た場所
unavailable	利用不可
openedInAnki	Ankiで開きました。
addedToDeckAndReviewed	デッキに追加してレビューしました。
sentToAnki	Ankiに送信しました。
openedMobileAnkiHandoff	モバイルAnki受け渡しを開きました。
alreadyInAnki	すでにAnkiにあります。
removedFromDeck	デッキから削除しました。
addedToDeckToast	デッキに追加しました。
apiDeckMediaNotSupported	メディアはYomuに残ります。
sentToAnkiWithContextImageAndAudio	画像と音声付きでAnkiに送信しました。
sentToAnkiWithContextImage	画像付きでAnkiに送信しました。
sentToAnkiWithAudio	音声付きでAnkiに送信しました。
ankiMergeNoNewData	Yomuデータは反映済みです。
ankiMergeFieldSingular	フィールド
ankiMergeFieldPlural	フィールド
ankiMergeAudio	音声
ankiMergeImage	画像
ankiMergeComplete	YomuデータをAnkiに統合しました ({parts})。
composedOf	構成語
ocrModeAutoToast	画像OCRを自動にしました。
ocrModeManualToast	画像OCRをタップ/ホバーにしました。
ocrModeOffToast	画像OCRをオフにしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbApiKeyMissingError	設定でJPDB APIキーを追加してください。
jpdbApiKeyRejectedError	JPDBがAPIキーを拒否しました。設定でキーを確認してください。
jpdbRateLimitedError	JPDBへのリクエストが多すぎます。しばらくしてからもう一度お試しください。
jpdbConnectionCoolingDownError	JPDBに一時的に接続できません。しばらくしてからもう一度お試しください。
jpdbRequestTimedOutError	JPDBからの応答に時間がかかりすぎました。もう一度お試しください。
jpdbRequestFailedError	JPDBへのリクエストに失敗しました。もう一度お試しください。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
wanikaniAddApiKeyRequired	期限が来た課題を復習するには、WaniKaniのパーソナルアクセストークンを追加してください。
addedToWanikani	WaniKaniに記録しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
moreMeanings	ほかの意味
moreExamples	ほかの例文
exampleSourceEmpty	この語の例文はまだありません。
exampleSourceEmptyShort	例文なし
exampleSourceLimitedCorpus	コーパスが小さいため、例文がまだない語もあります。
exampleSourceUnsupported	この情報源に{language}の例文はありません。
exampleSourceUnsupportedShort	他言語のみ
exampleSourceFailed	例文を読み込めませんでした。
exampleSourceFailedShort	読み込み失敗
exampleSourceRetry	もう一度試す
exampleSourceAudioPerItem	公開ライセンスの録音がある例文では音声を再生できます。
exampleSourceNoSentenceAudio	{language}の文音声は公開ライセンスのものがまだありません。
exampleSourceNoLicensedAudio	公開ライセンスの音声が付いていない例文です。
exampleSourceNoImage	場面画像は今のところ日本語のみです。
exampleSourceNoTranslation	{language}の訳はまだありません。
exampleSourceMachineTranslation	機械翻訳
exampleSourceIndirectTranslation	別の言語を経由した訳
exampleSourcePlayAudio	例文の音声を再生
acceptedInputs	入力として認められる表現
relatedWords	関連語
bunproUsedInVocab	使われている単語
relatedGrammar	関連文法
antonymWord	対義語
bunproCaution	注意
bunproStructure	構造
playJpdbExampleAudio	JPDB例文音声を再生
kanjiDictionaries	漢字辞書
sourceNameWordsUsingKanji	関連語彙
contextVideo	動画
contextImage	画像
contextCurrentPage	現在のページ
jpdbKanjiActionMine	追加
jpdbKanjiActionKnown	既知
jpdbKanjiActionNeverForget	忘れない
jpdbKanjiActionForget	忘れる
jpdbKanjiActionBlacklist	ブラックリスト
jpdbKanjiActionReview	レビュー
immersionKit	イマージョンキット
translation	翻訳
grammar	文法
meaning	意味
readSentenceAloud	文を読み上げ
openSectionToTranslate	開くと翻訳します。
translationUnavailable	翻訳を利用できません。
translating	翻訳中...
`),
  ...GRAMMAR_UI_COPY.ja,
  ...SETTINGS_RECOVERY_COPY.ja,
  ...PRACTICE_SESSION_COPY.ja,
  ...SAVE_WAIT_COPY.ja,
  ...GRADING_SERVICE_COPY.ja,
  ...COLLECTION_COPY.ja,
  ...OCR_STATUS_COPY.ja
};
const JA_SETTINGS_COPY = {
  accountSettingsTrustedSurfaceTitle: "Studyで設定を開く",
  accountSettingsTrustedSurfaceHelp: "このページは自身の入力欄を読み書きできるため、よむは設定、アカウント情報、インポート、復旧コードをここに表示しません。よむが管理するStudyページで安全に編集・保存してください。",
  openAccountSettingsTrustedSurface: "Studyの設定を開く",
  ...parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
save	保存
cancel	キャンセル
closeSettings	設定を閉じる
settingsLauncherHelp	設定は、このサイトから読み取れないStudyで開きます。
openInStudy	Studyで開く
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
backupSync	バックアップと同期
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
reader	リーダー
images	画像テキスト (OCR)
video	動画
youTube	YouTube
anki	Anki
jpdb	JPDB
api	API
apiCredential	APIキー
apiCredentialJpdb	JPDB APIキー
apiCredentialJiten	Jiten APIキー
apiCredentialBunpro	BunproフロントエンドAPIトークン
apiCredentialWanikani	WaniKaniパーソナルアクセストークン
wanikaniTokenHelp	WaniKaniでread/write権限のパーソナルアクセストークンを作成し、ここに貼り付けてください。ブラウザ内にのみ保存され、プロキシを経由せずapi.wanikani.comへ直接送信され、ログに残ることはありません。
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
storedCredentialPlaceholder	保存済み — 変更する場合のみ入力
clearStoredCredential	保存済みの認証情報を削除
apiAccessHelp	各サービスの認証情報を設定します。Bunproに必要なのはフロントエンドトークンだけです。Bunpro設定から取り込み、パスワードと同様に扱ってください。保存時点では未確認です。Academyの復習はアカウントなしでも使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
wanikaniSettings	WaniKani設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
bunproMiningEnabled	Bunproの復習・採掘を許可
wanikaniReviewEnabled	WaniKaniの復習を許可(期限が来た課題のみ)
wanikaniGradeMappingHelp	よむの採点結果はWaniKaniの正誤カウントに変換されます。Okay、Good、Easyは正解として送信します。Okay未満は意味を1回不正解として送信し、ラジカル以外では読みも1回不正解として送信します。
yomuLocalSrsEnabled	Academyを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
gradeTargetWanikani	WaniKaniを採点
gradeTargetYomuLocal	Academyに記録
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
gradeTargetBunproAndAnki	Bunpro + Ankiカードを採点: {target}
gradeTargetYomuLocalAndAnki	Academy + Ankiカードに記録: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	JPDB・Jitenのページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
fivePoint	サービスの標準評価
fourGradeShortcutsHelp	4段階の復習では、最初の4つのショートカットを「もう一度・難しい・良い・簡単」に使います。
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
hoverPopupMode	ホバー時の表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後も開く
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップのフォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップのフォントの太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabWanikani	WaniKani
newTabYomuLocal	Academy
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabShortcutHintsEnabled	学習のキーボードショートカットヒントを表示
newTabOfflineHelp	カードと未送信採点を保存。
newTabJpdbDeck	学習のJPDBデッキ
wordColors	単語の色
wordColorNew	新規・デッキ内
wordColorLearning	学習中
wordColorKnown	既知・忘れない
wordColorDue	期限到来
wordColorFailed	失敗
wordColorIgnored	無視・保留・ブラックリスト中
pitchAccentColors	ピッチアクセントの色
pitchColorHeiban	平板
pitchColorAtamadaka	頭高
pitchColorNakadaka	中高
pitchColorOdaka	尾高
pitchColorUnknown	不明
pronunciation	発音
noExactPitch	完全一致のピッチは利用不可
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	すべての学習状態
colorSourceJpdb	メインデッキの学習状態
colorSourceAnki	Ankiの学習状態
colorSourcePitch	ピッチアクセント
colorSourceNone	なし
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ウェブページの日本語
pageScanModeAuto	日本語を自動で検出
pageScanModeManual	指示したときだけ日本語を検出
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckPowerOnFurigana	{APP_NAME} オン・ふりがな表示
puckPowerOnNoFurigana	{APP_NAME} オン・ふりがな非表示
puckPowerOff	{APP_NAME} オフ
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
autoplayAudioOn	音声の自動再生 オン
autoplayAudioOff	音声の自動再生 オフ
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePreset	かんたん設定
appearancePresetCustom	カスタム
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
hideFuriganaFor	ふりがなを隠す対象
hideColorFor	色を隠す対象
furiganaDifficultKanji	難しい漢字のみ
furiganaDifficultKanjiHelp	Yomuは初級漢字の固定リストを持ち、その外側の漢字にふりがなを表示します。ふりがなのない漢字は、そのリストに載っています。
statusColorNoSourceHelp	学習状態の色はデッキから読み取ります。StudyでAcademyを有効にするか、JPDB・Jiten・Ankiのいずれかを追加すると、単語が学習状態の色になります。
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語
clampedRowReadings	省略行の読み
clampedRowReadingsShow	表示（行が広がる）
clampedRowReadingsHover	ホバー時のみ
showPitchAccent	発音を表示
showLookupPillFrequency	サイトの頻度をピルに表示
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左に
hideKnownFurigana	既知カードのふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバー。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	単語音声の自動再生
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioPlayback	音声再生
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
previewAudio	音声を試聴
audioHelp	URL: {term}、{reading}、{language}。
audioSource	音声ソース
urlVoice	URL / 音声
addAudioSource	音声ソースを追加
audioAutoPlayAll	ホバーとタップ/クリック
audioAutoPlayHover	ホバーのみ
audioAutoPlayTap	タップ/クリックのみ
automaticBrowserVoice	ブラウザの自動音声
savedVoiceLabel	保存済み音声: {voice}
audioSourceOrder	音声ソースの順序
audioSourceNumber	音声ソース {number}
enableAudioSourceNumber	音声ソース {number} を有効にする
enableLookupPillName	検索ピル「{name}」を有効にする
enableSourceName	ソース「{name}」を有効にする
textToSpeechVoiceNumber	読み上げ音声 {number}
audioSourceJpod101	JapanesePod101
audioSourceLanguagePod101	LanguagePod101
audioSourceJisho	Jisho.org
audioSourceBunpro	Bunpro
audioSourceLinguaLibre	(Commons) Lingua Libre
audioSourceWiktionary	(Commons) Wiktionary
audioSourceJitenTts	Jiten読み上げ
audioSourceJpdbTts	JPDB読み上げ
audioSourceTextToSpeech	ブラウザ読み上げ
audioSourceTextToSpeechReading	ブラウザ読み上げ (読み)
audioSourceCustom	直接音声ファイルURL
audioSourceCustomJson	カスタムURL
audioCustomJsonPlaceholder	Yomitan/Ultimate音声URL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースはURL不要
audioDetectingSubSources	内部ソースを確認中…
audioNoSubSourcesDetected	このURLは名前付きソースを返しませんでした。
audioSubSourcesHelp	このURLが提供するソース。不要なものはオフに:
audioSubSourceOverlapHint	下の単独ソースと重複
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyDeployGuide	プロキシの設定
immersionKitEnabled	イマージョンキット例文を表示
immersionKitExampleSource	例文プロバイダー
immersionKitAndNadeshiko	イマージョンキット + なでしこ
nadeshikoApiKey	なでしこAPIキー
getNadeshikoKey	キーを取得
immersionKitShowTranslation	例文の翻訳を表示
immersionKitRevealTranslationOnClick	クリックまで翻訳をぼかす
immersionKitShowImages	例文サムネイルを表示
immersionKitAutoPlayAudio	表示後や移動時に音声再生
immersionKitPlayOnHover	ホバーで例文音声を再生
immersionKitPlayOnImageClick	クリックで例文音声を再生
immersionKitLimitEnabled	単語ごとの例文数制限
immersionKitLimit	単語ごとの例文数（0 = すべて）
immersionKitPlaybackRate	例文音声速度
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
anime	アニメ
drama	ドラマ
games	ゲーム
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを自動で読む
ocrInvertDarkPanels	暗いコマの白い文字を読む
ocrProvider	画像読み取り
ocrOverlayTheme	OCRオーバーレイテーマ
ocrOverlayThemeAuto	アプリのテーマに合わせる
ocrOverlayThemeLight	ライトオーバーレイ
ocrOverlayThemeDark	ダークオーバーレイ
googleLens	Google Lens — 無料・設定不要（おすすめ）
cloudVision	Google Cloud Vision — APIキーが必要
localOcr	ローカルOCRサーバー — 上級者向け
off	オフ
ocrMaxImagesPerPage	ページごとに読む画像数
ocrMinImageArea	読む画像の最小サイズ
ocrMaxImagePixels	画像の精細さ
lightWork	軽め
normal	標準
more	多め
largeOnly	大きい画像のみ
includeSmall	小さい画像も含める
faster	高速
balanced	バランス
sharper	高精細
ocrTextColor	画像テキストの色
ocrOutlineColor	画像テキストの縁取り
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrEngine	ローカルOCRエンジン
ocrEngineMangaOcr	MangaOCR（マンガに最適）
ocrEngineAppleVision	Apple Vision（macOS）
cloudVisionApiKey	Google Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Google Lensは設定不要です。
ocrCloudHelp	Google Cloud Vision APIキーを貼ります。
ocrLocalHelp	MangaOCR/Apple VisionのローカルURLを入力します。
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
moveSubtitles	字幕を移動
moveSubtitlesAccessible	字幕を移動します。ドラッグするか、矢印キーまたはPage Up/Page Downキーを使います。Homeまたは0でリセットします。
moveSubtitleControls	字幕コントロール。タップで展開・折りたたみ。ドラッグまたは矢印キーで移動します。Homeまたは0でリセットします。
right	右
left	左
bottom	下
showWhenNeeded	コンパクト表示
hideControls	コントロールを隠す
alwaysVisible	常に表示
preview	プレビュー
youtubeImmersionEnabled	日本語のYouTubeのみ
preferJapaneseSiteLanguage	日本語版サイトをリクエスト
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	YouTubeを日本語向けに絞ります。
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は他の言語のYouTube項目{count}件を非表示
youtubeFilterVisible	日本語らしい項目{count}件は表示したままです。
youtubeToggleToastOn	YouTube没入フィルターをオンにしました。
youtubeToggleToastOff	YouTube没入フィルターをオフにしました。
ankiEnabled	Anki採掘を有効にする
ankiMineWithJpdb	API経由で追加するときAnkiにも追加
ankiCaptureScreenshot	可能なら文脈画像を添付
ankiConnectUrl	AnkiConnect URL
ankiDeck	Ankiデッキ
ankiModel	Ankiノートタイプ
mobileAnkiHandoff	モバイルAnki新規ノート作成
ankiTemplateMode	Ankiカードテンプレート
ankiFrontReading	単語優先の表面に読みを表示
ankiFrontSentence	単語優先の表面に文を表示
ankiFrontImage	表面に画像を表示
wordFirst	単語を先に表示
sentenceFirst	文を先に表示
ankiTags	タグ
sentenceFirstPreset	文を先に表示するプリセット
wordFirstPreset	単語を先に表示するプリセット
imageAbovePrompt	画像があれば問題文の上に表示します。
recallHighlightedWord	文脈からハイライト語を思い出します。
imageOnFront	利用可能な場合、画像は表面に表示されます。
recallMeaning	まず意味を思い出します。
ankiBackIncludes	辞書、漢字、ピッチ、頻度、出典、画像を含みます。
exampleMeaning	読む
scanAnkiFirst	先にAnkiConnectに接続
notMapped	対応付けなし
noScannedFields	読み取れるフィールドがありません。
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	単語音声
ankiRoleSentenceAudio	文音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを準備
updateAnkiModel	ノートタイプを更新
ankiModelUpdateAvailable	「{model}」に追加できる新しいフィールドがあります: {fields}
ankiModelUpdating	ノートタイプにフィールドを追加中...
ankiModelUpdated	ノートタイプを更新しました。{fields} を追加しました。
ankiModelUpToDate	ノートタイプは最新です。
ankiCheckingConnection	{url} のAnkiConnectを確認中。
ankiMiningDisabledStatus	Ankiマイニングは無効です。
ankiTesting	AnkiConnectを確認中...
ankiPreparing	よむデッキとノートタイプを作成または更新中...
ankiScanning	Ankiデッキ、ノートタイプ、フィールドを読み込み中...
ankiScanSummary	デッキ{decks}、ノート{models}。候補: {model}。{fields}
ankiScanNoModels	デッキ{decks}件を検出。ノートタイプは未取得です。
ankiScanFieldSummary	フィールド: {fields}
ankiUnreachable	デスクトップAnkiとAnkiConnectを確認してください。
ankiCorsBlocked	webCorsOriginListに「{origin}」を追加し再起動してください。
ankiSettingsUnreachable	AnkiConnectに接続できません。
ankiHostedBridgeMissing	よむを有効化し、更新してください。
ankiStatusOpenDesktop	デスクトップAnkiを開く
ankiStatusInstallAddon	AnkiConnectをインストール/有効化
ankiStatusMobileDocs	モバイル設定ドキュメント
ankiStatusUseDesktopUrl	モバイルではLAN/Tailscale URLを使う
ankiStatusEnableUserscript	よむを有効化
ankiStatusRefreshAndCheck	更新して再確認
ankiLibraryAdapter	既存ライブラリアダプター
ankiLibraryAdapterStatus	既存デッキから対応付けを提案します。
ankiLibraryChoices	デッキとノートタイプ
ankiLibraryChoicesHelp	作成・更新先を選びます。
ankiTemplateSettings	よむカードテンプレート
ankiTemplateSettingsHelp	よむノートタイプ用。テンプレートはAnkiに残ります。
ankiMappingConfidenceHelp	フィールド名とサンプルで判断します。
ankiMappingHighConfidence	高
ankiMappingMediumConfidence	中
ankiMappingLowConfidence	低
ankiHelp	AnkiConnectを入れてデスクトップ版Ankiを開きます。CORS表示が出る場合はこのサイトをwebCorsOriginListに追加してください。モバイル受け渡しは新規ノート作成のみです。
jpdbDefinitionsEnabled	JPDB定義を表示
${Object.entries(LOCAL_DICTIONARY_STORAGE_COPY.jaSettings).map(([key, value]) => `${key}	${value}`).join("\n")}
localDictionaryMaxResults	辞書結果の上限
cloudSettingsSync	Google Drive設定同期
cloudSettingsSyncHelp	Yomuの設定をGoogle Driveのアプリデータに保存します。辞書は端末内に残ります。
academyAccountSync	Academyアカウント同期
academyAccountSyncHelp	ReaderのAcademy SRS進捗を、ログイン中のYomuアカウントと端末間で同期します。Webサイトでアカウントを作成または管理し、1回限りのペアリングコードを発行してください。
academyAccountManage	アカウントとペアリングコードを管理
academyPairingCode	1回限りのペアリングコード
academyPairingCodePlaceholder	XXXX-XXXX-XXXX-XXXX-XXXX
academyAccountConnect	接続
academyAccountSyncNow	今すぐ同期
academyRecoveryCodeCreate	Webサイト復旧コードを作成
academyRecoveryCodeCreating	1回限りのWebサイト復旧コードを作成中...
academyRecoveryCodeReady	Webサイト復旧コード: {code}。10分以内に「プロフィールと同期」で入力してください。
academyRecoveryCodeDone	Webサイト復旧コードを作成しました。
academyAccountDisconnect	接続解除
academyAccountChecking	Academyアカウントの接続を確認中...
academyAccountDisconnected	未接続です。アカウントに接続するまで、Academyの復習データはこの端末に保存されます。
academyAccountConnected	{name}として接続中です。
academyAccountConnectedNoName	Academyアカウントに接続中です。
academyAccountLastSynced	最終同期: {time}。
academyAccountNeverSynced	まだ同期していません。
academyAccountConnectionProblem	アカウント状態を更新できませんでした: {message}
academyAccountConnecting	接続してAcademyの進捗を同期中...
academyAccountSyncing	Academyの進捗を同期中...
academyAccountDisconnecting	このReaderの接続を解除中...
academyPairingCodeRequired	Yomuアカウントで1回限りのペアリングコードを発行し、入力してください。
academyAccountConnectedDone	Academyアカウントに接続し、進捗を同期しました。
academyAccountSyncedDone	Academyの進捗を同期しました。
academyAccountDisconnectedDone	このReaderの接続を解除しました。Academyの進捗は端末に残ります。
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動は両方のキーがあれば優先採点サービスを使い、それ以外はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
plaintextHttpLink	プレーンテキストHTTPで開きます。
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
recommendedJapaneseDictionaries	おすすめの日本語辞書
recommendedDictionaryCountAndSize	辞書{count}件 · {size}
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
pronunciationDictionaries	発音辞書
frequencyDictionaries	頻度辞書
nameDictionaries	固有名詞辞書
grammarDictionaries	文法辞書
exampleDictionaries	例文辞書
thesaurusDictionaries	類語辞書
encyclopediaDictionaries	百科事典
utilityDictionaries	補助辞書
mirroredDictionaries	配信中のすべての辞書
mirroredDictionariesSummary	他{count}件の辞書 · 合計{size}
mirroredDictionarySearch	辞書を検索
mirroredDictionarySearchNoResults	検索に一致する辞書がありません。
install	インストール
installing	インストール中
installed	インストール済み
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
update	更新
checkingDictionaries	インポート済み辞書を確認中...
decksLoaded	JPDBアカウントからデッキを読み込みました。
decksUnavailable	デッキを読み込めません。保存IDは保持します。
addApiKeyChooseDecks	デッキを選ぶにはJPDB APIキーを追加してください。
miningDeck	採掘デッキ
neverForgetDeck	忘れないデッキ
blacklistDeck	ブラックリストデッキ
allStudyDecks	すべての学習デッキ
savedValue	保存済み: {value}
holdWhileHovering	ホバー中に押すキー
hoverOpenDelayMs	ホバーで開く遅延 (ms)
hoverCloseDelayMs	ホバーを閉じる遅延 (ms)
pressKeys	キーを押してください
blankPlainHover	空欄ならキーなしホバー
openSettings	設定を開く
resizeSettings	設定パネルのサイズ変更
closePopup	ポップアップを閉じる
previousLookupWord	前の単語
nextLookupWord	次の単語
playingAudioPreview	{APP_NAME}を再生中...
audioPreviewFailed	音声プレビューに失敗しました。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
toggleImageReading	画像読み取りを切り替え
toggleSubtitleOverlay	字幕オーバーレイを切り替え
toggleYoutubeImmersion	YouTubeフィルターを切り替え
readImagesNow	今すぐ画像を読む
massReviewVisible	画面内の単語を一括レビュー（Jiten）
massReviewNoWords	画面内に復習対象のJiten単語がありません。
massReviewNoKey	一括レビューにはJiten APIキーが必要です。
massReviewDone	{count}語を「Good」でレビューしました。
massReviewFailed	一括レビューに失敗しました。
adapterStateDisabled	オフ
adapterStateProbing	接続確認中
adapterStateUnreachable	接続不可
adapterStateConnected	接続済み
adapterStateScanning	スキャン中
adapterStateSuggested	対応付け済み
adapterStateStale	要確認
adapterStateReady	準備完了
ankiMappingConfidenceHigh	完全一致
ankiMappingConfidenceMedium	曖昧一致
ankiMappingConfidenceLow	未対応
ankiMappingStaleField	保存済みフィールドなし
helpLinksTitle	便利なページ
versionAndUpdates	バージョン
currentYomuVersion	Yomu
updateStatusIdle	現在 {current}。確認待ち。
updateStatusChecking	現在 {current}。確認中...
updateStatusCurrent	現在 {current}。最新 {latest}。最新です。
updateStatusAvailable	現在 {current}。最新 {latest}。更新できます。
updateStatusUnknown	現在 {current}。確認できません。必要なら再インストールしてください。
updateStatusIncomparable	現在 {current}。最新 {latest}。バージョンを比較できません。古い場合は「更新」を使ってください。
updateHelpNotesManager	よむスクリプトは1つだけ有効にしてください。「更新」でユーザースクリプトマネージャーのインストール画面が開きます。ブラウザにインストールブロックの警告が出る場合は、拡張機能ページでマネージャーの詳細を開き、「ユーザースクリプトを許可」（または開発者モード）を有効にしてから再試行してください。
updateHelpNotesManagerDashboard	Chrome または Edge では、「更新」を押すと Tampermonkey の更新手順が開きます。ダッシュボードの「ユーティリティ」→「ユーザースクリプトの更新を確認」を使うため、ウェブサイトからのインストールをブロックする警告を回避できます。
updateHelpNotesExternalManager	よむスクリプトは1つだけ有効にしてください。「更新」でスクリプトのソースが開き、ユーザースクリプトアプリが開いたタブから読み取って更新します。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてタブを開いたままにしてください。
updateHelpNotesNoManager	この環境ではユーザースクリプトマネージャーが検出されませんでした。ブラウザはスクリプトの直接インストールをブロックするため、「更新」ではブラウザ別の手順があるインストールガイドを開きます。
updateHelpNotesExtensionStore	更新はブラウザの拡張機能ストアから届きます。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料のツールです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
newTabPage	学習
github	GitHub
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書を削除。
factoryResetFailed	リセットに失敗しました。
factoryResetStorageIncomplete	保存データをすべて検出または削除できなかったため、リセットを中止しました。ほかのよむタブを閉じて再試行してください。解決しない場合は、ユーザースクリプトマネージャーでよむのストレージを消去してください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
issues	Issue
donate	寄付
discord	Discord
enabledHeader	有効
labelHeader	ラベル
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
popupOrderTitle	ポップアップの順序
kanjiSection	漢字セクション
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
metadataDictionariesHelp	メタデータ辞書は、バッジや漢字データとして表示されます。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	Jiten定義、例文、関連語です。
sourceHelpBunpro	Bunproの語彙・文法の意味、ニュアンス、例文です。
sourceHelpWanikani	あなたのアカウントのWaniKani語彙の意味、覚え方、SRS状態です。
sourceHelpAnki	一致するAnkiカード内容と状態です。
sourceHelpTranslation	文の自動翻訳です。
sourceHelpGrammar	ローカル文法ヒントです。
sourceHelpImmersionKit	例文、画像、音声です。
sourceNameImmersionKit	イマージョンキット
sourceNameAnki	Anki
sourceNameTranslation	翻訳
sourceNameGrammar	文法
sourceNameStrokePractice	筆順練習
sourceNameImportedKanjiDictionaries	インポート済み漢字辞書
sourceNameWordsUsingKanji	相关词汇
sourceNameJitenKanjiFacts	Jiten漢字情報
sourceHelpImportedKanjiDictionary	インポート済みYomitan漢字辞書です。
sourceHelpStrokePractice	筆順プレビューと書き取りパッドです。
sourceHelpReadingsComponents	JPDBの読み、部品、語呂合わせです。
sourceHelpJitenKanjiFacts	Jitenの漢字情報、頻度、読み、使用語です。
sourceHelpRtk	RTKキーワード、要素、ストーリーです。
sourceHelpWanikaniKanji	WaniKaniの漢字の意味・読みの覚え方、レベル、SRS状態です。
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`),
  ...SUBTITLE_SETTINGS_COPY.ja
};
function resolveUiLanguage(language) {
  if (language === "ja" || language === "en") return language;
  return browserPrefersJapanese() ? "ja" : "en";
}
function browserPrefersJapanese() {
  const navigatorLanguages = typeof navigator === "undefined" ? [] : [
  ...Array.isArray(navigator.languages) ? navigator.languages : [],
  navigator.language
  ];
  return navigatorLanguages.some(isJapaneseLocale);
}
function isJapaneseLocale(value) {
  return typeof value === "string" && value.toLowerCase().startsWith("ja");
}
function uiText(language, key) {
  return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? COPY.en[key] : COPY.en[key];
}
const AUTHENTICATION_INFO_PERMISSION = "authenticationInfo";
function requestFirefoxAuthenticationInfoPermission() {
  if (!isFirefoxExtensionRuntime()) return Promise.resolve("granted");
  const permissions = firefoxExtensionApi()?.permissions;
  const request = permissions?.request;
  if (typeof request !== "function") return Promise.resolve("extension-page-required");
  try {
  return Promise.resolve(request.call(permissions, {
    data_collection: [AUTHENTICATION_INFO_PERMISSION]
  })).then((granted) => granted ? "granted" : "denied", () => "denied");
  } catch {
  return Promise.resolve("denied");
  }
}
function firefoxAuthenticationInfoRequiresExtensionPage() {
  if (!isFirefoxExtensionRuntime()) return false;
  return typeof firefoxExtensionApi()?.permissions?.request !== "function";
}
function firefoxAuthenticationInfoSettingsPageUrl() {
  if (!isFirefoxExtensionRuntime()) return "";
  const runtime = firefoxExtensionApi()?.runtime;
  if (!runtime?.id || typeof runtime.getURL !== "function") return "";
  try {
  return `${runtime.getURL("newtab/index.html")}#settings=api`;
  } catch {
  return "";
  }
}
function firefoxExtensionApi() {
  try {
  return globalThis.browser;
  } catch {
  return void 0;
  }
}
function isFirefoxExtensionRuntime() {
  const firefox = firefoxExtensionApi();
  if (!firefox?.runtime?.id) return false;
  const getURL = firefox.runtime.getURL;
  if (typeof getURL === "function") {
  try {
    return getURL.call(firefox.runtime, "").startsWith("moz-extension://");
  } catch {
  }
  }
  try {
  return /\bFirefox\/\d/u.test(navigator.userAgent);
  } catch {
  return false;
  }
}
const BUNPRO_FRONTEND_API_TOKEN_COOKIE = "frontend_api_token";
const IMPORTER_ID = "jpdb-reader-bunpro-token-importer";
const BUNPRO_SETTINGS_PATH = "/settings/api";
const INSTALL_FLAG = "__yomuBunproFrontendTokenImporterInstalled";
function isBunproApiSettingsPage(href = safeHref()) {
  try {
  const url = new URL(href, safeHref());
  return isBunproHost(url.hostname) && normalizePathname(url.pathname) === BUNPRO_SETTINGS_PATH;
  } catch {
  return false;
  }
}
async function readBunproFrontendToken(options = {}) {
  const fromCookieStore = await readBunproFrontendTokenFromCookieStore(options.cookieStore ?? globalCookieStore());
  if (fromCookieStore) return fromCookieStore;
  return readBunproFrontendTokenFromCookieHeader(options.cookieHeader?.() ?? safeDocumentCookie());
}
function readBunproFrontendTokenFromCookieHeader(cookieHeader) {
  const token = cookieValue(cookieHeader, BUNPRO_FRONTEND_API_TOKEN_COOKIE);
  return token ? { token, expiresAt: "" } : null;
}
async function installBunproFrontendTokenImporter(options) {
  if (typeof document === "undefined") return;
  if (!isBunproHostFromHref(importerHref(options))) return;
  await waitForBody();
  if (!document.body) return;
  installRouteWatcher(options);
  await renderImporterForCurrentRoute(options);
}
async function renderImporterForCurrentRoute(options) {
  if (!document.body) return;
  if (!isBunproApiSettingsPage(importerHref(options))) {
  document.getElementById(IMPORTER_ID)?.remove();
  return;
  }
  const existing = document.getElementById(IMPORTER_ID);
  if (existing) {
  document.body.append(existing);
  return;
  }
  const language = resolveUiLanguage(options.language?.() ?? options.getSettings().interfaceLanguage);
  const extensionPageRequired = firefoxAuthenticationInfoRequiresExtensionPage();
  const token = extensionPageRequired ? null : await readBunproFrontendToken(options);
  const root = document.createElement("section");
  root.id = IMPORTER_ID;
  root.className = "jpdb-reader-bunpro-token-importer";
  root.dataset.jpdbReaderRoot = "true";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", copy(language).title);
  root.append(renderBunproImporterContent(token, language, extensionPageRequired));
  document.body.append(root);
  const button = root.querySelector('[data-action="import-bunpro-token"]');
  button?.addEventListener("click", () => {
  if (extensionPageRequired) {
    const settingsUrl = firefoxAuthenticationInfoSettingsPageUrl();
    if (settingsUrl) window.open(settingsUrl, "_blank", "noopener");
    return;
  }
  void importBunproToken(options, root, language);
  });
}
async function importBunproToken(options, root, language) {
  const ui = copy(language);
  const status = root.querySelector("[data-bunpro-import-status]");
  const consent = await requestFirefoxAuthenticationInfoPermission();
  if (consent !== "granted") {
  const message = consent === "extension-page-required" ? ui.permissionPageRequired : ui.permissionDenied;
  if (status) status.textContent = message;
  options.toast?.(message);
  return;
  }
  if (status) status.textContent = ui.reading;
  const latestToken = await readBunproFrontendToken(options);
  if (!latestToken) {
  if (status) status.textContent = ui.missing;
  return;
  }
  const nextSettings = {
  ...options.getSettings(),
  bunproFrontendApiToken: latestToken.token,
  bunproFrontendApiTokenExpiresAt: latestToken.expiresAt,
  bunproMiningEnabled: true
  };
  if (status) status.textContent = ui.saving;
  try {
  options.setSettings(nextSettings);
  await options.saveSettings(nextSettings, {
    explicitUserChoiceKeys: [
      "bunproFrontendApiToken",
      "bunproFrontendApiTokenExpiresAt",
      "bunproMiningEnabled"
    ]
  });
  if (status) status.textContent = ui.saved;
  options.toast?.(ui.saved);
  } catch {
  if (status) status.textContent = ui.failed;
  options.toast?.(ui.failed);
  }
}
function renderBunproImporterContent(token, language, extensionPageRequired = false) {
  const ui = copy(language);
  const content = document.createElement("div");
  content.className = "jpdb-reader-bunpro-token-importer-card";
  const title = document.createElement("div");
  title.className = "jpdb-reader-bunpro-token-importer-title";
  title.textContent = ui.title;
  const body = document.createElement("p");
  body.textContent = extensionPageRequired ? ui.permissionPageRequired : token ? ui.ready : ui.missing;
  const meta = document.createElement("div");
  meta.className = "jpdb-reader-bunpro-token-importer-meta";
  meta.textContent = extensionPageRequired ? "" : token?.expiresAt ? ui.expires(token.expiresAt) : ui.expiryUnknown;
  const actions = document.createElement("div");
  actions.className = "jpdb-reader-bunpro-token-importer-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "jpdb-reader-bunpro-token-importer-button";
  button.dataset.action = "import-bunpro-token";
  button.textContent = extensionPageRequired ? ui.openStudySettings : ui.action;
  const status = document.createElement("span");
  status.dataset.bunproImportStatus = "true";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  actions.append(button, status);
  content.append(title, body, meta, actions);
  return content;
}
async function readBunproFrontendTokenFromCookieStore(cookieStore) {
  if (!cookieStore?.get) return null;
  try {
  const cookie = await cookieStore.get(BUNPRO_FRONTEND_API_TOKEN_COOKIE);
  const token = normalizeCookieValue(cookie?.value ?? "");
  if (!token) return null;
  return { token, expiresAt: normalizeCookieExpires(cookie?.expires) };
  } catch {
  return null;
  }
}
function cookieValue(cookieHeader, name) {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
  const [rawName, ...rawValue] = part.split("=");
  if (rawName?.trim() !== name) continue;
  return normalizeCookieValue(rawValue.join("="));
  }
  return "";
}
function normalizeCookieValue(value) {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed) return "";
  try {
  return decodeURIComponent(trimmed).trim();
  } catch {
  return trimmed;
  }
}
function normalizeCookieExpires(value) {
  if (value instanceof Date) return finiteDateIso(value);
  if (typeof value === "number") {
  if (!Number.isFinite(value) || value <= 0) return "";
  return finiteDateIso(new Date(value));
  }
  if (typeof value === "string") {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? finiteDateIso(new Date(parsed)) : "";
  }
  return "";
}
function finiteDateIso(date) {
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
function normalizePathname(pathname) {
  return pathname.replace(/\/+$/u, "") || "/";
}
function isBunproHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "bunpro.jp" || host.endsWith(".bunpro.jp");
}
function isBunproHostFromHref(href = safeHref()) {
  try {
  return isBunproHost(new URL(href, safeHref()).hostname);
  } catch {
  return false;
  }
}
function importerHref(options) {
  return typeof options.href === "function" ? options.href() : options.href;
}
function installRouteWatcher(options) {
  const global = globalThis;
  if (global[INSTALL_FLAG]) return;
  global[INSTALL_FLAG] = true;
  const rerender = () => {
  void renderImporterForCurrentRoute(options);
  };
  window.addEventListener("popstate", rerender);
  wrapHistoryMethod("pushState", rerender);
  wrapHistoryMethod("replaceState", rerender);
  const observer = new MutationObserver(() => {
  const root = document.getElementById(IMPORTER_ID);
  if (root && document.body?.lastElementChild !== root) document.body.append(root);
  });
  if (document.body) observer.observe(document.body, { childList: true });
}
function wrapHistoryMethod(method, after) {
  const original = history[method];
  if (typeof original !== "function") return;
  history[method] = function yomuBunproHistoryWrapper(...args) {
  original.apply(this, args);
  window.setTimeout(after, 0);
  };
}
function globalCookieStore() {
  return globalThis.cookieStore;
}
function safeDocumentCookie() {
  try {
  return document.cookie ?? "";
  } catch {
  return "";
  }
}
function safeHref() {
  try {
  return location.href;
  } catch {
  return "https://bunpro.jp/settings/api";
  }
}
function waitForBody() {
  if (document.body || document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
  document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}
function copy(language) {
  if (language === "ja") {
  return {
    title: "Yomu Bunpro連携",
    ready: "Bunproのログイン用トークンを見つけました。Yomuに保存してBunpro復習を有効にできます。",
    missing: "トークンを読めませんでした。ログイン中ならFirefoxのCookie制限で隠れている可能性があります。",
    expiryUnknown: "有効期限はブラウザから読めませんでした。",
    expires: (iso) => `期限: ${new Date(iso).toLocaleDateString("ja-JP")}`,
    action: "Yomuで使う",
    reading: "確認中...",
    saving: "保存中...",
    saved: "BunproトークンをYomuに保存しました。",
    failed: "保存できませんでした。Yomuの権限を確認してください。",
    permissionDenied: "Firefoxの許可がなかったため、Bunproトークンは保存しませんでした。",
    permissionPageRequired: "Firefoxでは、Bunproトークンを読み取る前にYomuの学習ページから許可を求めます。トークンはまだ読み取っていません。",
    openStudySettings: "学習ページの設定を開く"
  };
  }
  return {
  title: "Yomu Bunpro setup",
  ready: "Yomu found your Bunpro session token. Save it to enable Bunpro reviews and mining.",
  missing: "Yomu could not read the token. If you are signed in, Firefox may be hiding this cookie.",
  expiryUnknown: "Expiry is not visible in this browser.",
  expires: (iso) => `Expires ${new Date(iso).toLocaleDateString("en-GB")}`,
  action: "Use in Yomu",
  reading: "Checking...",
  saving: "Saving...",
  saved: "Bunpro token saved to Yomu.",
  failed: "Could not save. Check your Yomu userscript permissions.",
  permissionDenied: "Bunpro stays off because Firefox permission was not granted. Nothing was saved.",
  permissionPageRequired: "Firefox asks from Yomu Study before reading a Bunpro token. Nothing has been read yet.",
  openStudySettings: "Open Study settings"
  };
}
function sandboxSharedState(key, create) {
  const realm = globalThis;
  const slot = Symbol.for(key);
  const existing = realm[slot];
  if (existing && typeof existing === "object") return existing;
  const created = create();
  Object.defineProperty(realm, slot, {
  configurable: true,
  enumerable: false,
  value: created,
  writable: true
  });
  return created;
}
const { guardedDocuments, guards } = sandboxSharedState("yomu.compat-guard.v1", () => ({
  guardedDocuments: /* @__PURE__ */ new WeakSet(),
  guards: /* @__PURE__ */ new WeakMap()
}));
sandboxSharedState("yomu.trusted-interaction.v1", () => ({
  pendingClick: {},
  authorizedClicks: /* @__PURE__ */ new WeakSet(),
  authorizedEvents: /* @__PURE__ */ new WeakSet(),
  localActivationRoots: /* @__PURE__ */ new WeakSet(),
  documentActivation: /* @__PURE__ */ new WeakMap()
}));
const HIRAGANA = "぀-ゟ";
const KATAKANA = "゠-ヿ";
const KANA = "぀-ヿ";
const HALFWIDTH_KATAKANA = "ｦ-ﾟ";
const KANJI = "㐀-鿿";
const UNIFIED_IDEOGRAPH = "\\p{Unified_Ideograph}";
const SUPPLEMENTARY_KANJI_PATTERN = `(?:(?![\\u0000-\\uFFFF])${UNIFIED_IDEOGRAPH})`;
const KANJI_PATTERN = `(?:[${KANJI}]|${SUPPLEMENTARY_KANJI_PATTERN})`;
const ITERATION_MARK = "々";
const ITERATION_MARKS = `${ITERATION_MARK}〆`;
const KANA_COUNTERS = "ヵヶ";
const PROLONGED_SOUND_MARK = "ー";
const KATAKANA_MIDDLE_DOT = "・";
const HIRAGANA_LETTERS = "ぁ-ゖゝ-ゟ";
const KATAKANA_LETTERS = "ァ-ヺヽ-ヿ";
const HALFWIDTH_KATAKANA_LETTERS = "ｦ-ｯｱ-ﾝ";
const KANJI_LIKE_WITH_COUNTERS_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}${KANA_COUNTERS}])`;
const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
const READING_KANA = `${KANA}${PROLONGED_SOUND_MARK}${KATAKANA_MIDDLE_DOT}`;
const JAPANESE_LETTERS = `${HIRAGANA_LETTERS}${KATAKANA_LETTERS}${KANJI}${HALFWIDTH_KATAKANA_LETTERS}`;
const HAS_JAPANESE_LETTER = new RegExp(`(?:[${JAPANESE_LETTERS}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
const KANJI_RE = new RegExp(KANJI_PATTERN, "u");
const READING_KANA_CHAR_RE = new RegExp(`[${READING_KANA}]`, "u");
const READING_KANA_ONLY_RE = new RegExp(`^[${READING_KANA}]+$`, "u");
new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
const NUMERIC_COUNTER_SUFFIX_SEGMENTS = /* @__PURE__ */ new Set(["話", "巻", "回", "章", "部", "番", "号", "版", "人", "名", "匹", "頭", "羽", "枚", "本", "冊", "個", "台", "件", "分", "秒", "時", "日", "月", "年", "泊", "円"]);
const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
function numericRangeImmediatelyBefore(sourceText, start) {
  const before = sourceText.slice(Math.max(0, start - 24), start).replace(/\s+$/u, "");
  return NUMERIC_RANGE_BEFORE_RE.test(before);
}
function isCounterAfterNumber(surface, sentence, start) {
  return NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(surface) && Boolean(sentence) && start >= 0 && sentence.slice(start, start + surface.length) === surface && numericRangeImmediatelyBefore(sentence, start);
}
const TOKEN_ATTRIBUTE = "data-yomu-private-token";
const MAX_PENDING_VALUES = 16384;
const { valuesByElement, pendingValues, replayableBlueprints, domainSlots } = sandboxSharedState("yomu.private-element-state.v1", () => ({
  valuesByElement: /* @__PURE__ */ new WeakMap(),
  pendingValues: /* @__PURE__ */ new Map(),
  replayableBlueprints: /* @__PURE__ */ new Map(),
  domainSlots: /* @__PURE__ */ new Map()
}));
function createPrivateElementStateSlot(domain, snapshot, options = {}) {
  const slot = domainSlot(domain);
  return {
  attributes(value) {
    const token = registerPendingValue(slot, snapshot(value), options.replayable === true);
    return ` ${TOKEN_ATTRIBUTE}="${token}"`;
  },
  prepareSerialization(element, value) {
    const token = registerPendingValue(slot, snapshot(value), options.replayable === true);
    const current = element.getAttribute(TOKEN_ATTRIBUTE)?.trim();
    element.setAttribute(TOKEN_ATTRIBUTE, current ? `${current} ${token}` : token);
  },
  bind(element, value) {
    element.removeAttribute(TOKEN_ATTRIBUTE);
    setPrivateValue(element, slot, snapshot(value));
  },
  read(element) {
    return element ? valuesByElement.get(element)?.get(slot) : void 0;
  }
  };
}
function domainSlot(domain) {
  const existing = domainSlots.get(domain);
  if (existing) return existing;
  const slot = Symbol(`yomu-private-element-state:${domain}`);
  domainSlots.set(domain, slot);
  return slot;
}
function registerPendingValue(slot, value, replayable) {
  const token = privateStateToken();
  const pending = { slot, value };
  pendingValues.set(token, pending);
  if (replayable) replayableBlueprints.set(token, pending);
  prunePendingValues();
  return token;
}
function setPrivateValue(element, slot, value) {
  const values = valuesByElement.get(element) ?? /* @__PURE__ */ new Map();
  values.set(slot, value);
  valuesByElement.set(element, values);
}
function prunePendingValues() {
  pruneOldestPrivateValues(pendingValues);
  pruneOldestPrivateValues(replayableBlueprints);
}
function pruneOldestPrivateValues(values) {
  while (values.size > MAX_PENDING_VALUES) {
  const oldest = values.keys().next().value;
  if (oldest === void 0) return;
  values.delete(oldest);
  }
}
function privateStateToken() {
  const bytes = new Uint32Array(4);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36)).join("-");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const BRAND_COLOR_TOKENS = {
  accent: "#b8324e",
  consoleAccent: "#b8324e"
};
const CORE_COLOR_TOKENS = {
  white: "#ffffff"
};
const READER_THEME_COLOR_TOKENS = {
  dark: {
  bg: "#181b20"
  }
};
const OVERLAY_COLOR_TOKENS = {
  text: CORE_COLOR_TOKENS.white,
  background: READER_THEME_COLOR_TOKENS.dark.bg
};
const LOGGER_COLOR_TOKENS = {
  debug: "#6b7280",
  warn: "#a15c00",
  error: "#b91c1c"
};
const __vite_import_meta_env__ = { "DEV": false };
const LOG_PREFIX = "[Yomu]";
const LOG_STYLE = `background: ${BRAND_COLOR_TOKENS.consoleAccent}; color: ${CORE_COLOR_TOKENS.white}; border-radius: 3px; padding: 2px 5px; font-weight: 700;`;
const SCOPE_STYLE = `color: ${BRAND_COLOR_TOKENS.consoleAccent}; font-weight: 700;`;
const DEBUG_STYLE = `color: ${LOGGER_COLOR_TOKENS.debug};`;
const WARN_STYLE = `color: ${LOGGER_COLOR_TOKENS.warn}; font-weight: 700;`;
const ERROR_STYLE = `color: ${LOGGER_COLOR_TOKENS.error}; font-weight: 700;`;
const RUNTIME_LOG_KEY = "yomu:enable-logs";
const REDACTED = "[redacted]";
const OPTIONAL_CORS_BRIDGE_MESSAGE = "No configured proxy.";
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie)/i;
const env = __vite_import_meta_env__;
const BUILD_IS_DEV_MODE = Boolean(env?.DEV);
const BUILD_LOGGING_ENABLED = BUILD_IS_DEV_MODE;
class ScopedLogger {
  constructor(parent, scopeName) {
  this.parent = parent;
  this.scopeName = scopeName;
  }
  debug(message, ...args) {
  this.parent.write(this.scopeName, message, args, writeDebugToConsole, DEBUG_STYLE);
  }
  info(message, ...args) {
  this.parent.write(this.scopeName, message, args, console.info, "");
  }
  warn(message, ...args) {
  const optional = args.some(isOptionalCorsBridgeError);
  this.parent.write(this.scopeName, message, args, optional ? writeDebugToConsole : console.warn, optional ? DEBUG_STYLE : WARN_STYLE);
  }
  error(message, ...args) {
  this.parent.write(this.scopeName, message, args, console.error, ERROR_STYLE);
  }
  warnOnce(key, message, ...args) {
  this.parent.warnOnce(`${this.scopeName}:${key}`, this.scopeName, message, args);
  }
  time(label, ...args) {
  if (!this.parent.isEnabled()) return () => void 0;
  const start = nowMs();
  this.debug(`${label} started`, ...args);
  return () => this.debug(`${label} finished`, { durationMs: Math.round((nowMs() - start) * 10) / 10 });
  }
}
class LoggerImpl {
  settingsProvider;
  forceEnabled = false;
  onceKeys = /* @__PURE__ */ new Set();
  configure(options) {
  this.settingsProvider = options.settingsProvider ?? this.settingsProvider;
  this.forceEnabled = options.forceEnabled ?? this.forceEnabled;
  }
  scope(scopeName) {
  return new ScopedLogger(this, scopeName);
  }
  isEnabled() {
  if (BUILD_LOGGING_ENABLED) return true;
  if (this.forceEnabled || getRuntimeLoggingOverride()) return true;
  try {
    return this.settingsProvider?.().enableLogging === true;
  } catch {
    return false;
  }
  }
  isDevMode() {
  return isDevMode();
  }
  enable(persist = false) {
  this.forceEnabled = true;
  if (persist) setRuntimeLoggingOverride(true);
  this.scope("Logger").info("Runtime logging enabled.", { persisted: persist });
  }
  disable(persist = false) {
  this.scope("Logger").info("Runtime logging disabled.", { persisted: persist });
  this.forceEnabled = false;
  if (persist) setRuntimeLoggingOverride(false);
  }
  reset() {
  this.onceKeys.clear();
  }
  warnOnce(key, scope, message, args) {
  if (this.onceKeys.has(key)) return;
  this.onceKeys.add(key);
  this.write(scope, message, args, console.warn, WARN_STYLE);
  }
  write(scope, message, args, writer, levelStyle) {
  if (!this.isEnabled()) return;
  writer(`%c${LOG_PREFIX}%c [${scope}]%c ${message}`, LOG_STYLE, SCOPE_STYLE, levelStyle, ...args.map(sanitizeForConsole));
  }
}
const Logger = new LoggerImpl();
setAttemptRecorder((label, error) => Logger.scope("Attempt").debug(`${label} failed`, error));
function isDevMode() {
  return BUILD_IS_DEV_MODE;
}
function writeDebugToConsole(...args) {
  if (isDevMode()) console.log(...args);
  else console.debug(...args);
}
function isOptionalCorsBridgeError(value) {
  return value instanceof Error && value.message === OPTIONAL_CORS_BRIDGE_MESSAGE;
}
let runtimeLoggingOverride;
function getRuntimeLoggingOverride() {
  if (runtimeLoggingOverride !== void 0) return runtimeLoggingOverride;
  try {
  runtimeLoggingOverride = gmStorageGetSync(RUNTIME_LOG_KEY, false) === true;
  } catch {
  runtimeLoggingOverride = false;
  }
  return runtimeLoggingOverride;
}
function setRuntimeLoggingOverride(enabled) {
  runtimeLoggingOverride = enabled;
  try {
  if (enabled) gmStorageSetSync(RUNTIME_LOG_KEY, true);
  else gmStorageDeleteSync(RUNTIME_LOG_KEY);
  } catch {
  }
}
function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function sanitizeForConsole(value) {
  if (typeof value === "string") return redactString(value);
  if (value === null || value === void 0 || typeof value !== "object") return value;
  const sanitized = sanitizeSpecialConsoleValue(value);
  if (sanitized.handled) return sanitized.value;
  if (Array.isArray(value)) return value.map(sanitizeForConsole);
  return sanitizeRecordForConsole(value);
}
function sanitizeSpecialConsoleValue(value) {
  for (const sanitizer of CONSOLE_VALUE_SANITIZERS) {
  const sanitized = sanitizer(value);
  if (sanitized.handled) return sanitized;
  }
  return { handled: false };
}
const CONSOLE_VALUE_SANITIZERS = [
  (value) => value instanceof Error ? { handled: true, value: { name: value.name, message: value.message, stack: value.stack } } : { handled: false },
  (value) => typeof URL !== "undefined" && value instanceof URL ? { handled: true, value: value.href } : { handled: false },
  (value) => typeof Blob !== "undefined" && value instanceof Blob ? { handled: true, value: { type: value.type, size: value.size } } : { handled: false },
  (value) => typeof Event !== "undefined" && value instanceof Event ? { handled: true, value: { type: value.type } } : { handled: false }
];
function sanitizeRecordForConsole(record2) {
  return Object.fromEntries(Object.entries(record2).map(([key, value]) => [
  key,
  shouldRedactEntry(key, value) ? REDACTED : sanitizeFlatValue(value)
  ]));
}
function sanitizeFlatValue(value) {
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}
function shouldRedactEntry(key, value) {
  if (!SECRET_KEY_PATTERN.test(key)) return false;
  if (typeof value === "number" && /tokens?/i.test(key)) return false;
  return true;
}
function redactString(value) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`).replace(/(["']?(?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
}
if (typeof window !== "undefined") {
  window.__YOMU_LOGGER__ = Logger;
  window.YomuLogger = Logger;
}
Logger.scope("SettingsChangeBus");
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;
function normalizedJapaneseCardReading(spelling, reading) {
  const cleanSpelling = cleanCardHighlightValue(spelling);
  const cleanReading = cleanCardHighlightValue(reading);
  return cleanReading && JAPANESE_TEXT_RE.test(cleanReading) ? cleanReading : cleanSpelling;
}
function cleanCardHighlightValue(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
const DEINFLECTION_CONDITION = {
  Ichidan: 1 << 0,
  GodanU: 1 << 1,
  GodanK: 1 << 2,
  GodanG: 1 << 3,
  GodanS: 1 << 4,
  GodanT: 1 << 5,
  GodanN: 1 << 6,
  GodanB: 1 << 7,
  GodanM: 1 << 8,
  GodanR: 1 << 9,
  Suru: 1 << 10,
  Kuru: 1 << 11,
  IAdjective: 1 << 12,
  Masu: 1 << 13,
  Te: 1 << 14,
  Ta: 1 << 15,
  Conditional: 1 << 16,
  Adverbial: 1 << 17
};
const GODAN_CONDITIONS = DEINFLECTION_CONDITION.GodanU | DEINFLECTION_CONDITION.GodanK | DEINFLECTION_CONDITION.GodanG | DEINFLECTION_CONDITION.GodanS | DEINFLECTION_CONDITION.GodanT | DEINFLECTION_CONDITION.GodanN | DEINFLECTION_CONDITION.GodanB | DEINFLECTION_CONDITION.GodanM | DEINFLECTION_CONDITION.GodanR;
const INPUT_CONDITIONS_BY_REASON = {
  negative: DEINFLECTION_CONDITION.IAdjective,
  desiderative: DEINFLECTION_CONDITION.IAdjective,
  potential: DEINFLECTION_CONDITION.Ichidan,
  "potential/passive": DEINFLECTION_CONDITION.Ichidan,
  passive: DEINFLECTION_CONDITION.Ichidan,
  causative: DEINFLECTION_CONDITION.Ichidan,
  "causative passive": DEINFLECTION_CONDITION.Ichidan,
  excessive: DEINFLECTION_CONDITION.Ichidan,
  progressive: DEINFLECTION_CONDITION.Ichidan,
  "contracted progressive": DEINFLECTION_CONDITION.Ichidan,
  completion: DEINFLECTION_CONDITION.GodanU,
  "contracted completion": DEINFLECTION_CONDITION.GodanU,
  polite: DEINFLECTION_CONDITION.Masu,
  "te-form": DEINFLECTION_CONDITION.Te,
  past: DEINFLECTION_CONDITION.Ta,
  conditional: DEINFLECTION_CONDITION.Conditional,
  adverbial: DEINFLECTION_CONDITION.Adverbial
};
const CONDITION_FLAG_BY_RULE = {
  v1: DEINFLECTION_CONDITION.Ichidan,
  v5u: DEINFLECTION_CONDITION.GodanU,
  v5k: DEINFLECTION_CONDITION.GodanK,
  v5g: DEINFLECTION_CONDITION.GodanG,
  v5s: DEINFLECTION_CONDITION.GodanS,
  v5t: DEINFLECTION_CONDITION.GodanT,
  v5n: DEINFLECTION_CONDITION.GodanN,
  v5b: DEINFLECTION_CONDITION.GodanB,
  v5m: DEINFLECTION_CONDITION.GodanM,
  v5r: DEINFLECTION_CONDITION.GodanR,
  v5: GODAN_CONDITIONS,
  vs: DEINFLECTION_CONDITION.Suru,
  "vs-s": DEINFLECTION_CONDITION.Suru,
  suru: DEINFLECTION_CONDITION.Suru,
  vk: DEINFLECTION_CONDITION.Kuru,
  kuru: DEINFLECTION_CONDITION.Kuru,
  "adj-i": DEINFLECTION_CONDITION.IAdjective,
  "i-adj": DEINFLECTION_CONDITION.IAdjective
};
const GODAN_R_SPECIAL_RULES = /* @__PURE__ */ new Set(["v5aru"]);
const GODAN_ROWS = [
  { ending: "う", a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った", rules: ["v5u", "v5"] },
  { ending: "く", a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた", rules: ["v5k", "v5"] },
  { ending: "ぐ", a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ", rules: ["v5g", "v5"] },
  { ending: "す", a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した", rules: ["v5s", "v5"] },
  { ending: "つ", a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った", rules: ["v5t", "v5"] },
  { ending: "ぬ", a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ", rules: ["v5n", "v5"] },
  { ending: "ぶ", a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ", rules: ["v5b", "v5"] },
  { ending: "む", a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ", rules: ["v5m", "v5"] },
  { ending: "る", a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った", rules: ["v5r", "v5"] }
];
const ICHIDAN_RULES = [
  ["ながら", "る", "simultaneous action"],
  ["ました", "る", "polite past"],
  ["ませんでした", "る", "polite negative past"],
  ["ません", "る", "polite negative"],
  ["ましょう", "る", "polite volitional"],
  ["ます", "る", "polite"],
  ["なかった", "る", "negative past"],
  ["なくて", "る", "negative te-form"],
  ["なければ", "る", "negative conditional"],
  ["ない", "る", "negative"],
  ["ず", "る", "negative archaic"],
  ["たかった", "る", "desiderative past"],
  ["たくなかった", "る", "desiderative negative past"],
  ["たくない", "る", "desiderative negative"],
  ["たい", "る", "desiderative"],
  ["なさい", "る", "polite request"],
  ["すぎる", "る", "excessive"],
  ["られなかった", "る", "potential/passive negative past"],
  ["られない", "る", "potential/passive negative"],
  ["られて", "る", "potential/passive te-form"],
  ["られた", "る", "potential/passive past"],
  ["られる", "る", "potential/passive"],
  ["させられた", "る", "causative passive past"],
  ["させられる", "る", "causative passive"],
  ["させない", "る", "causative negative"],
  ["させて", "る", "causative te-form"],
  ["させた", "る", "causative past"],
  ["させる", "る", "causative"],
  ["れば", "る", "conditional"],
  ["よう", "る", "volitional"],
  ["ろ", "る", "imperative"],
  ["て", "る", "te-form"],
  ["た", "る", "past"]
];
const I_ADJECTIVE_RULES = [
  ["くなかった", "い", "negative past"],
  ["くありませんでした", "い", "polite negative past"],
  ["くありません", "い", "polite negative"],
  ["かった", "い", "past"],
  ["くない", "い", "negative"],
  ["くて", "い", "te-form"],
  ["ければ", "い", "conditional"],
  ["そう", "い", "looks"],
  ["すぎる", "い", "excessive"],
  ["く", "い", "adverbial"]
];
const SURU_RULES = [
  ["しながら", "する", "simultaneous action"],
  ["しませんでした", "する", "polite negative past"],
  ["しません", "する", "polite negative"],
  ["しました", "する", "polite past"],
  ["しましょう", "する", "polite volitional"],
  ["します", "する", "polite"],
  ["しなかった", "する", "negative past"],
  ["しなくて", "する", "negative te-form"],
  ["しなければ", "する", "negative conditional"],
  ["しない", "する", "negative"],
  ["せず", "する", "negative archaic"],
  ["しなさい", "する", "polite request"],
  ["しすぎる", "する", "excessive"],
  ["された", "する", "passive past"],
  ["されて", "する", "passive te-form"],
  ["される", "する", "passive"],
  ["させた", "する", "causative past"],
  ["させて", "する", "causative te-form"],
  ["させる", "する", "causative"],
  ["できなかった", "する", "potential negative past"],
  ["できない", "する", "potential negative"],
  ["できた", "する", "potential past"],
  ["できて", "する", "potential te-form"],
  ["できる", "する", "potential"],
  ["すれば", "する", "conditional"],
  ["しよう", "する", "volitional"],
  ["しろ", "する", "imperative"],
  ["せよ", "する", "imperative"],
  ["した", "する", "past"],
  ["して", "する", "te-form"]
];
const KURU_RULES = [
  ["来ながら", "来る", "simultaneous action"],
  ["来ませんでした", "来る", "polite negative past"],
  ["来ません", "来る", "polite negative"],
  ["来ました", "来る", "polite past"],
  ["来ます", "来る", "polite"],
  ["来なかった", "来る", "negative past"],
  ["来なくて", "来る", "negative te-form"],
  ["来ない", "来る", "negative"],
  ["来なさい", "来る", "polite request"],
  ["来すぎる", "来る", "excessive"],
  ["来られた", "来る", "potential/passive past"],
  ["来られて", "来る", "potential/passive te-form"],
  ["来られる", "来る", "potential/passive"],
  ["来れば", "来る", "conditional"],
  ["来よう", "来る", "volitional"],
  ["来い", "来る", "imperative"],
  ["来た", "来る", "past"],
  ["来て", "来る", "te-form"],
  ["きながら", "くる", "simultaneous action"],
  ["きませんでした", "くる", "polite negative past"],
  ["きません", "くる", "polite negative"],
  ["きました", "くる", "polite past"],
  ["きます", "くる", "polite"],
  ["こなかった", "くる", "negative past"],
  ["こなくて", "くる", "negative te-form"],
  ["こない", "くる", "negative"],
  ["こず", "くる", "negative archaic"],
  ["きなさい", "くる", "polite request"],
  ["きすぎる", "くる", "excessive"],
  ["こられた", "くる", "potential/passive past"],
  ["こられて", "くる", "potential/passive te-form"],
  ["こられる", "くる", "potential/passive"],
  ["くれば", "くる", "conditional"],
  ["こよう", "くる", "volitional"],
  ["こい", "くる", "imperative"],
  ["きた", "くる", "past"],
  ["きて", "くる", "te-form"]
];
const TE_ASPECT_SUFFIXES = [
  ["いる", "progressive"],
  ["います", "polite progressive"],
  ["いました", "polite progressive past"],
  ["いません", "polite progressive negative"],
  ["いませんでした", "polite progressive negative past"],
  ["いた", "progressive past"],
  ["いて", "progressive te-form"],
  ["いない", "progressive negative"],
  ["いなかった", "progressive negative past"],
  ["いれば", "progressive conditional"],
  ["る", "contracted progressive"],
  ["ます", "contracted polite progressive"],
  ["ました", "contracted polite progressive past"],
  ["た", "contracted progressive past"],
  ["て", "contracted progressive te-form"],
  ["ない", "contracted progressive negative"],
  ["なかった", "contracted progressive negative past"]
];
const TE_COMPLETION_SUFFIXES = [
  ["しまう", "completion"],
  ["しまった", "completion past"],
  ["しまって", "completion te-form"],
  ["しまわない", "completion negative"],
  ["しまいます", "polite completion"],
  ["しまいました", "polite completion past"]
];
const CONTRACTED_COMPLETION_SUFFIXES = [
  ["う", "contracted completion"],
  ["った", "contracted completion past"],
  ["って", "contracted completion te-form"],
  ["わない", "contracted completion negative"],
  ["います", "contracted polite completion"],
  ["いました", "contracted polite completion past"]
];
const RULES = [
  ...ICHIDAN_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["v1"] })),
  ...teCompoundRules("て", "る", ["v1"]),
  ...I_ADJECTIVE_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["adj-i", "i-adj"] })),
  ...SURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["vs", "vs-s", "suru"] })),
  ...teCompoundRules("して", "する", ["vs", "vs-s", "suru"]),
  ...KURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["vk", "kuru"] })),
  ...teCompoundRules("来て", "来る", ["vk", "kuru"]),
  ...teCompoundRules("きて", "くる", ["vk", "kuru"]),
  ...GODAN_ROWS.flatMap((row) => godanRules(row)),
  { from: "行って", to: "行く", reason: "te-form", rules: ["v5k", "v5"] },
  { from: "行った", to: "行く", reason: "past", rules: ["v5k", "v5"] },
  { from: "行っちゃう", to: "行く", reason: "contracted completion", rules: ["v5k", "v5"] },
  { from: "行っちゃった", to: "行く", reason: "contracted completion past", rules: ["v5k", "v5"] }
].map(conditionDeinflectionRule);
const DEINFLECTION_CACHE_MAX = 4e3;
const deinflectionCache = /* @__PURE__ */ new Map();
function deinflectJapaneseTerm(source) {
  const cached = deinflectionCache.get(source);
  if (cached) return cached;
  const results = [{ term: source, rules: [], reasons: [], depth: 0, conditions: 0 }];
  const seen = /* @__PURE__ */ new Set([candidateKey(results[0])]);
  const queue = [results[0]];
  expandDeinflectionQueue(queue, results, seen);
  const sorted = sortDeinflectedTerms(results).map(publicDeinflectionCandidate);
  if (deinflectionCache.size >= DEINFLECTION_CACHE_MAX) {
  const oldest = deinflectionCache.keys().next().value;
  if (oldest !== void 0) deinflectionCache.delete(oldest);
  }
  deinflectionCache.set(source, sorted);
  return sorted;
}
function expandDeinflectionQueue(queue, results, seen) {
  for (let index = 0; index < queue.length; index++) {
  expandDeinflectedTerm(queue[index], queue, results, seen);
  }
}
function expandDeinflectedTerm(current, queue, results, seen) {
  for (const rule of RULES) {
  rememberExpandedDeinflection(current, rule, queue, results, seen);
  }
}
function rememberExpandedDeinflection(current, rule, queue, results, seen) {
  const next = deinflectedCandidate(current, rule);
  if (!next) return;
  if (!rememberDeinflectedCandidate(next, seen)) return;
  results.push(next);
  queue.push(next);
}
function sortDeinflectedTerms(results) {
  return results.sort((a, b) => a.depth - b.depth || b.term.length - a.term.length || a.term.localeCompare(b.term));
}
function deinflectedCandidate(current, rule) {
  if (!ruleMatchesDeinflectionState(current, rule)) return null;
  const term = transformedDeinflectionTerm(current.term, rule);
  if (!term) return null;
  return {
  term,
  rules: rule.rules,
  reasons: [...current.reasons, rule.reason],
  depth: current.depth + 1,
  conditions: rule.conditionsOut
  };
}
function ruleMatchesDeinflectionState(current, rule) {
  return conditionsMatch(current.conditions, rule.conditionsIn) && current.term.endsWith(rule.from);
}
function transformedDeinflectionTerm(term, rule) {
  const transformed = `${term.slice(0, -rule.from.length)}${rule.to}`;
  return transformed && transformed !== term ? transformed : null;
}
function rememberDeinflectedCandidate(candidate, seen) {
  const key = candidateKey(candidate);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
function termRulesMatch(entryRules, candidateRules) {
  if (!candidateRules.length) return true;
  const entryRuleSet = entryRulesSet(entryRules);
  if (!entryRuleSet.size) return false;
  const candidateGodanClasses = godanRuleClasses(candidateRules);
  return candidateRules.some((rule) => termRuleMatches(rule, entryRuleSet, candidateGodanClasses));
}
function entryRulesSet(entryRules) {
  return new Set((entryRules ?? "").split(/\s+/).filter(Boolean));
}
function termRuleMatches(rule, entryRuleSet, candidateGodanClasses) {
  if (entryRuleSet.has(rule)) return true;
  const candidateGodanClass = godanRuleClass(rule);
  if (candidateGodanClass) {
  return entryHasGodanClass(entryRuleSet, candidateGodanClass);
  }
  if (rule === "v5") {
  return entryHasGenericGodanMatch(entryRuleSet, candidateGodanClasses);
  }
  return TERM_RULE_MATCHERS.some((matches) => matches(rule, entryRuleSet));
}
function entryHasGodanClass(entryRuleSet, candidateGodanClass) {
  if (entryRuleSet.has("v5")) return true;
  return [...entryRuleSet].some((entryRule) => godanRuleClass(entryRule) === candidateGodanClass);
}
function entryHasGenericGodanMatch(entryRuleSet, candidateGodanClasses) {
  if (!candidateGodanClasses.size) return [...entryRuleSet].some(isGodanRule);
  return [...entryRuleSet].some((entryRule) => {
  const entryGodanClass = godanRuleClass(entryRule);
  return entryGodanClass !== void 0 && candidateGodanClasses.has(entryGodanClass);
  });
}
function isGodanRule(rule) {
  return rule === "v5" || godanRuleClass(rule) !== void 0;
}
const TERM_RULE_MATCHERS = [
  (rule, entryRuleSet) => rule === "i-adj" && entryRuleSet.has("adj-i"),
  (rule, entryRuleSet) => rule === "adj-i" && entryRuleSet.has("i-adj")
];
function godanRuleClasses(rules) {
  const result = /* @__PURE__ */ new Set();
  for (const rule of rules) {
  const ruleClass = godanRuleClass(rule);
  if (ruleClass) result.add(ruleClass);
  }
  return result;
}
function godanRuleClass(rule) {
  if (GODAN_R_SPECIAL_RULES.has(rule)) return "r";
  return /^v5([ukgstnbmr])(?:-|$)/u.exec(rule)?.[1];
}
function godanRules(row) {
  const rules = row.rules;
  return [
  ...teCompoundRules(row.te, row.ending, rules),
  { from: `${row.i}ながら`, to: row.ending, reason: "simultaneous action", rules },
  { from: row.i, to: row.ending, reason: "continuative stem", rules },
  { from: row.te, to: row.ending, reason: "te-form", rules },
  { from: row.ta, to: row.ending, reason: "past", rules },
  { from: `${row.a}なかった`, to: row.ending, reason: "negative past", rules },
  { from: `${row.a}なくて`, to: row.ending, reason: "negative te-form", rules },
  { from: `${row.a}なければ`, to: row.ending, reason: "negative conditional", rules },
  { from: `${row.a}ない`, to: row.ending, reason: "negative", rules },
  { from: `${row.a}ず`, to: row.ending, reason: "negative archaic", rules },
  { from: `${row.i}ませんでした`, to: row.ending, reason: "polite negative past", rules },
  { from: `${row.i}ません`, to: row.ending, reason: "polite negative", rules },
  { from: `${row.i}ました`, to: row.ending, reason: "polite past", rules },
  { from: `${row.i}ましょう`, to: row.ending, reason: "polite volitional", rules },
  { from: `${row.i}ます`, to: row.ending, reason: "polite", rules },
  { from: `${row.i}たかった`, to: row.ending, reason: "desiderative past", rules },
  { from: `${row.i}たくなかった`, to: row.ending, reason: "desiderative negative past", rules },
  { from: `${row.i}たくない`, to: row.ending, reason: "desiderative negative", rules },
  { from: `${row.i}たい`, to: row.ending, reason: "desiderative", rules },
  { from: `${row.i}なさい`, to: row.ending, reason: "polite request", rules },
  { from: `${row.i}すぎる`, to: row.ending, reason: "excessive", rules },
  { from: `${row.e}ば`, to: row.ending, reason: "conditional", rules },
  { from: `${row.o}う`, to: row.ending, reason: "volitional", rules },
  { from: `${row.e}なかった`, to: row.ending, reason: "potential negative past", rules },
  { from: `${row.e}ない`, to: row.ending, reason: "potential negative", rules },
  { from: `${row.e}た`, to: row.ending, reason: "potential past", rules },
  { from: `${row.e}て`, to: row.ending, reason: "potential te-form", rules },
  { from: `${row.e}る`, to: row.ending, reason: "potential", rules },
  { from: `${row.a}れなかった`, to: row.ending, reason: "passive negative past", rules },
  { from: `${row.a}れない`, to: row.ending, reason: "passive negative", rules },
  { from: `${row.a}れて`, to: row.ending, reason: "passive te-form", rules },
  { from: `${row.a}れた`, to: row.ending, reason: "passive past", rules },
  { from: `${row.a}れる`, to: row.ending, reason: "passive", rules },
  { from: `${row.a}せない`, to: row.ending, reason: "causative negative", rules },
  { from: `${row.a}せて`, to: row.ending, reason: "causative te-form", rules },
  { from: `${row.a}せた`, to: row.ending, reason: "causative past", rules },
  { from: `${row.a}せる`, to: row.ending, reason: "causative", rules },
  { from: row.e, to: row.ending, reason: "imperative", rules }
  ];
}
function teCompoundRules(te, to, rules) {
  return [
  ...TE_ASPECT_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
  ...TE_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
  ...contractedCompletionRules(te, to, rules)
  ];
}
function contractedCompletionRules(te, to, rules) {
  const stem = contractedCompletionStem(te);
  return stem ? CONTRACTED_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${stem}${suffix}`, to, reason, rules })) : [];
}
function contractedCompletionStem(te) {
  if (te.endsWith("て")) return `${te.slice(0, -1)}ちゃ`;
  if (te.endsWith("で")) return `${te.slice(0, -1)}じゃ`;
  return "";
}
function conditionDeinflectionRule(rule) {
  return {
  ...rule,
  conditionsIn: inputConditionsForReason(rule.reason),
  conditionsOut: conditionFlagsForRules(rule.rules)
  };
}
function conditionsMatch(currentConditions, nextConditions) {
  return currentConditions === 0 || (currentConditions & nextConditions) !== 0;
}
function inputConditionsForReason(reason) {
  return INPUT_CONDITIONS_BY_REASON[reason] ?? 0;
}
function conditionFlagsForRules(rules) {
  const specificGodanConditions = unionConditionFlags(rules.filter(isSpecificGodanConditionRule));
  return specificGodanConditions || unionConditionFlags(rules);
}
function isSpecificGodanConditionRule(rule) {
  return /^v5[ukgstnbmr]$/u.test(rule);
}
function unionConditionFlags(rules) {
  return rules.reduce((conditions, rule) => conditions | conditionFlagForRule(rule), 0);
}
function conditionFlagForRule(rule) {
  return CONDITION_FLAG_BY_RULE[rule] ?? 0;
}
function publicDeinflectionCandidate(state) {
  const { conditions: _conditions, ...candidate } = state;
  return candidate;
}
function candidateKey(candidate) {
  return `${candidate.term}
${candidate.conditions}`;
}
function uniqueStrings(values, options = {}) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
  const normalized = options.trim ? value?.trim() : value;
  if (normalized === void 0 || normalized === null) continue;
  if (options.dropEmpty && !normalized) continue;
  if (seen.has(normalized)) continue;
  seen.add(normalized);
  result.push(normalized);
  }
  return result;
}
function uniqueNonEmptyStrings(values) {
  return uniqueStrings(values, { dropEmpty: true });
}
function codePointBoundaryAtOrBefore(text, offset) {
  const clamped = Math.max(0, Math.min(offset, text.length));
  if (clamped > 0 && clamped < text.length && isLowSurrogate(text.charCodeAt(clamped)) && isHighSurrogate(text.charCodeAt(clamped - 1))) {
  return clamped - 1;
  }
  return clamped;
}
function codePointSafePrefix(text, maxUtf16Units) {
  return text.slice(0, codePointBoundaryAtOrBefore(text, maxUtf16Units));
}
function isHighSurrogate(value) {
  return value >= 55296 && value <= 56319;
}
function isLowSurrogate(value) {
  return value >= 56320 && value <= 57343;
}
const JAPANESE_SCRIPT_GROUP_RE = new RegExp(
  `${KANJI_LIKE_WITH_COUNTERS_PATTERN}+|[${HIRAGANA_WITH_PROLONGED}]+|[${KATAKANA_WITH_PROLONGED}]+|[${HALFWIDTH_KATAKANA}]+`,
  "gu"
);
const JAPANESE_TEXT_RUN_RE = new RegExp(
  `(?:[${KANA}${PROLONGED_SOUND_MARK}${HALFWIDTH_KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})+`,
  "gu"
);
const JAPANESE_CHARACTER_RE = new RegExp(
  `(?:[${KANA}${HALFWIDTH_KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
  "u"
);
const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
const FALLBACK_INFLECTION_MAX_LENGTH = 18;
const FALLBACK_LOOKUP_TERM_LIMIT = 8;
const INFLECTION_BOUNDARY_SEGMENTS = /* @__PURE__ */ new Set(["は", "が", "を", "に", "へ", "と", "で", "の", "や", "から", "まで", "より", "だけ", "しか", "など", "ね"]);
const KANA_GRAMMAR_BOUNDARY_SEGMENTS = /* @__PURE__ */ new Set([...INFLECTION_BOUNDARY_SEGMENTS, "な"]);
const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first, second) => second.length - first.length);
const PARTICLE_PREFIX_REMAINDER_RE = new RegExp(
  `^(?:[${KATAKANA_WITH_PROLONGED}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
  "u"
);
const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なか|なかっ|なかった|ながら|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
const HIRAGANA_SEGMENT_RE = new RegExp(`^[${HIRAGANA_WITH_PROLONGED}]+$`, "u");
const KATAKANA_SEGMENT_RE = new RegExp(`^[${KATAKANA}${HALFWIDTH_KATAKANA}${PROLONGED_SOUND_MARK}]+$`, "u");
const SEGMENT_SEPARATORS = "・･゠·•";
const SEGMENT_SEPARATOR_RE = new RegExp(`[${SEGMENT_SEPARATORS}]`, "u");
const SEGMENT_SEPARATOR_RUN_RE = new RegExp(`[${SEGMENT_SEPARATORS}]+`, "gu");
const SINGLE_KANJI_SEGMENT_RE = new RegExp(`^${KANJI_PATTERN}$`, "u");
const SINGLE_KANJI_HIRAGANA_STEM_RE = new RegExp(
  `^${KANJI_PATTERN}[${HIRAGANA_WITH_PROLONGED}]*$`,
  "u"
);
const KANJI_KANA_KANJI_SPAN_RE = new RegExp(
  `${KANJI_LIKE_WITH_COUNTERS_PATTERN}[${HIRAGANA_WITH_PROLONGED}]+${KANJI_LIKE_WITH_COUNTERS_PATTERN}`,
  "u"
);
const HIRAGANA_END_RE = new RegExp(`[${HIRAGANA_WITH_PROLONGED}]$`, "u");
const TRAILING_POLITE_PARTICLE_RE = /(?:ます|ません|です|でした)ね$/u;
const SURU_STEM_SEGMENT_RE = new RegExp(
  `(?:[${KATAKANA}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})`,
  "u"
);
const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
const KANA_VERB_STEM_END_RE = /[うくぐすずつづぬふぶぷむゆる]$/u;
const KANA_I_ADJECTIVE_END_RE = /い$/u;
const SMALL_TSU_RE = /っ/u;
const KANA_CONTENT_WORD_MIN_LENGTH = 3;
function normalizeFallbackTerm(text) {
  return codePointSafePrefix(text.replace(/\s+/g, " ").trim(), 80);
}
let cachedSegmenterConstructor;
let cachedJapaneseWordSegmenter;
function segmentJapaneseText(text) {
  const segmenter = japaneseWordSegmenter();
  if (!segmenter) {
  return Array.from(text.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap((match) => {
    const start = match.index ?? 0;
    return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(match[0], start), text);
  });
  }
  return Array.from(text.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap((match) => {
  const start = match.index ?? 0;
  return segmentJapaneseRun(match[0], start, segmenter, text);
  });
}
function segmentJapaneseRun(text, offset, segmenter, sourceText) {
  const segments = Array.from(segmenter.segment(text)).filter(isUsefulJapaneseSegment).map((segment) => ({
  surface: segment.segment,
  start: offset + segment.index,
  end: offset + segment.index + segment.segment.length
  }));
  if (segments.at(-1)?.end !== offset + text.length) {
  return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(text, offset), sourceText);
  }
  return finalizeJapaneseRunSegments(segments, sourceText);
}
function finalizeJapaneseRunSegments(segments, sourceText) {
  const separatedSegments = splitNumericCounterPrefixSegments(splitSeparatorSegments(segments), sourceText);
  const normalizedSegments = splitTrailingPoliteParticleSegments(
  mergeContiguousKanaSegments(mergeContiguousKatakanaSegments(separatedSegments))
  );
  return mergeInflectedFallbackSegments(
  splitLeadingParticleSegments(normalizedSegments),
  sourceText
  );
}
function splitTrailingPoliteParticleSegments(segments) {
  return segments.flatMap((segment, index) => {
  if (!segment.surface.endsWith("ね") || segment.surface === "ね") return [segment];
  const previous = segments[index - 1]?.surface ?? "";
  if (!TRAILING_POLITE_PARTICLE_RE.test(`${previous}${segment.surface}`)) return [segment];
  const particleStart = segment.end - 1;
  const stem = segment.surface.slice(0, -1);
  return [
    ...stem ? [{ surface: stem, start: segment.start, end: particleStart }] : [],
    { surface: "ね", start: particleStart, end: segment.end }
  ];
  });
}
function splitSeparatorSegments(segments) {
  if (!segments.some((segment) => SEGMENT_SEPARATOR_RE.test(segment.surface))) return segments;
  return segments.flatMap(splitSeparatorSegment);
}
function splitSeparatorSegment(segment) {
  if (!SEGMENT_SEPARATOR_RE.test(segment.surface)) return [segment];
  const pieces = [];
  let cursor = 0;
  for (const match of segment.surface.matchAll(SEGMENT_SEPARATOR_RUN_RE)) {
  const index = match.index ?? 0;
  if (index > cursor) pieces.push(separatorFreeSegmentSlice(segment, cursor, index));
  cursor = index + match[0].length;
  }
  if (cursor < segment.surface.length) pieces.push(separatorFreeSegmentSlice(segment, cursor, segment.surface.length));
  return pieces;
}
function separatorFreeSegmentSlice(segment, from, to) {
  return {
  surface: segment.surface.slice(from, to),
  start: segment.start + from,
  end: segment.start + to
  };
}
function mergeContiguousKanaSegments(segments) {
  const merged = [];
  for (let index = 0; index < segments.length; ) {
  const runEnd = contiguousKanaRunEnd(segments, index);
  const previous = segments[index - 1];
  const followsAnotherScript = runEnd > index + 1 && previous && previous.end === segments[index].start && !isPureKanaSegment(previous.surface);
  if (followsAnotherScript) {
    merged.push(...segments.slice(index, runEnd));
    index = runEnd;
    continue;
  }
  const span = contiguousKanaMergeSpanAt(segments, index);
  if (span) {
    merged.push(span.segment);
    index = span.nextIndex;
    continue;
  }
  merged.push(segments[index]);
  index += 1;
  }
  return merged;
}
function mergeContiguousKatakanaSegments(segments) {
  const merged = [];
  for (let index = 0; index < segments.length; ) {
  const first = segments[index];
  if (!KATAKANA_SEGMENT_RE.test(first.surface)) {
    merged.push(first);
    index += 1;
    continue;
  }
  let surface = first.surface;
  let runEnd = index + 1;
  while (runEnd < segments.length && KATAKANA_SEGMENT_RE.test(segments[runEnd].surface) && segments[runEnd].start === segments[runEnd - 1].end) {
    surface += segments[runEnd].surface;
    runEnd += 1;
  }
  merged.push(runEnd - index > 1 ? { surface, start: first.start, end: segments[runEnd - 1].end } : first);
  index = runEnd;
  }
  return merged;
}
function contiguousKanaMergeSpanAt(segments, startIndex) {
  const first = segments[startIndex];
  if (!first || !isPureKanaSegment(first.surface)) return null;
  const previous = segments[startIndex - 1];
  const canStartKanaWord = !previous || previous.end !== first.start || KANA_GRAMMAR_BOUNDARY_SEGMENTS.has(previous.surface);
  if (KANA_GRAMMAR_BOUNDARY_SEGMENTS.has(first.surface) && !canStartKanaWord) return null;
  if (isKanaContentWordSpan(first.surface)) return null;
  const runEnd = contiguousKanaRunEnd(segments, startIndex);
  if (runEnd - startIndex < 2) return null;
  let surface = first.surface;
  let lastIndex = startIndex;
  for (let index = startIndex + 1; index < runEnd; index += 1) {
  const current = segments[index];
  const trailingSpan = sliceKanaSpanSurface(segments, index, runEnd);
  if (KANA_GRAMMAR_BOUNDARY_SEGMENTS.has(current.surface) || isKanaContentWordSpan(trailingSpan)) break;
  surface += current.surface;
  lastIndex = index;
  }
  if (lastIndex === startIndex) return null;
  return {
  segment: { surface, start: first.start, end: segments[lastIndex].end },
  nextIndex: lastIndex + 1
  };
}
function contiguousKanaRunEnd(segments, startIndex) {
  let index = startIndex + 1;
  while (index < segments.length && isPureKanaSegment(segments[index].surface) && segments[index].start === segments[index - 1].end) {
  index += 1;
  }
  return index;
}
function sliceKanaSpanSurface(segments, startIndex, endIndex) {
  let surface = "";
  for (let index = startIndex; index < endIndex; index += 1) surface += segments[index].surface;
  return surface;
}
function isPureKanaSegment(surface) {
  return HIRAGANA_SEGMENT_RE.test(surface);
}
function isKanaContentWordSpan(span) {
  if (isKanaInflectableBaseShape(span)) return true;
  return deinflectJapaneseTerm(span).some((candidate) => candidate.depth > 0 && Array.from(candidate.term).length >= 2 && !SMALL_TSU_RE.test(candidate.term) && (KANA_VERB_STEM_END_RE.test(candidate.term) || KANA_I_ADJECTIVE_END_RE.test(candidate.term)));
}
function isKanaInflectableBaseShape(span) {
  if (Array.from(span).length < KANA_CONTENT_WORD_MIN_LENGTH || SMALL_TSU_RE.test(span)) return false;
  return KANA_VERB_STEM_END_RE.test(span) || KANA_I_ADJECTIVE_END_RE.test(span);
}
function splitNumericCounterPrefixSegments(segments, sourceText) {
  return segments.flatMap((segment) => splitNumericCounterPrefixSegment(segment, sourceText));
}
function splitNumericCounterPrefixSegment(segment, sourceText) {
  const first = Array.from(segment.surface)[0] ?? "";
  if (!first || first === segment.surface || !NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(first)) return [segment];
  if (!numericRangeImmediatelyBefore(sourceText, segment.start)) return [segment];
  const second = Array.from(segment.surface)[1] ?? "";
  if (second === "間") return [segment];
  return [
  { surface: first, start: segment.start, end: segment.start + first.length },
  { surface: segment.surface.slice(first.length), start: segment.start + first.length, end: segment.end }
  ];
}
function splitLeadingParticleSegments(segments) {
  return segments.flatMap(splitLeadingParticleSegment);
}
function splitLeadingParticleSegment(segment) {
  const prefix = PARTICLE_PREFIX_SEGMENTS.find((candidate) => {
  if (!segment.surface.startsWith(candidate) || segment.surface.length <= candidate.length) return false;
  return PARTICLE_PREFIX_REMAINDER_RE.test(segment.surface.slice(candidate.length));
  });
  if (!prefix) return [segment];
  return [
  { surface: prefix, start: segment.start, end: segment.start + prefix.length },
  { surface: segment.surface.slice(prefix.length), start: segment.start + prefix.length, end: segment.end }
  ];
}
function mergeInflectedFallbackSegments(segments, sourceText) {
  const merged = [];
  for (let index = 0; index < segments.length; ) {
  const span = inflectedFallbackSpanAt(segments, index, sourceText);
  if (span) {
    merged.push(span.segment);
    index = span.nextIndex;
    continue;
  }
  merged.push(segments[index]);
  index += 1;
  }
  return merged;
}
function inflectedFallbackSpanAt(segments, startIndex, sourceText) {
  const first = segments[startIndex];
  if (!first || isBoundarySegment(first.surface)) return null;
  let surface = "";
  let best = null;
  for (let index = startIndex; index < fallbackInflectionScanEnd(segments, startIndex); index += 1) {
  const current = nextInflectedFallbackSegment(segments, index, startIndex, first, surface, sourceText);
  if (!current) break;
  surface += current.surface;
  if (surface.length > FALLBACK_INFLECTION_MAX_LENGTH) break;
  best = inflectedFallbackCandidateAt(segments, startIndex, index, first, current, surface) ?? best;
  }
  return best;
}
function fallbackInflectionScanEnd(segments, startIndex) {
  return Math.min(segments.length, startIndex + FALLBACK_INFLECTION_MAX_SEGMENTS);
}
function nextInflectedFallbackSegment(segments, index, startIndex, first, surface, sourceText) {
  const current = segments[index];
  if (!current || !isContiguousFallbackSegment(segments, index, startIndex, first)) return null;
  if (index > startIndex && isNumericCounterFallbackStem(first, sourceText)) return null;
  const politeNegativePast = index > startIndex && isPoliteNegativePastContinuation(segments, index, surface);
  if (index > startIndex && isBoundarySegment(current.surface) && !politeNegativePast) return null;
  if (index > startIndex && !politeNegativePast && !canContinueInflectedFallbackSpan(surface, current.surface)) return null;
  return current;
}
function isPoliteNegativePastContinuation(segments, index, surface) {
  return surface.endsWith("ません") && segments[index]?.surface === "で" && segments[index + 1]?.surface === "した";
}
function isContiguousFallbackSegment(segments, index, startIndex, first) {
  const expectedStart = index === startIndex ? first.start : segments[index - 1]?.end;
  return segments[index]?.start === expectedStart;
}
function inflectedFallbackCandidateAt(segments, startIndex, index, first, current, surface) {
  if (index === startIndex) return null;
  const lookupTerms = fallbackLookupTermsForText(surface);
  if (lookupTerms.length <= 1) return null;
  if (shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms)) return null;
  return {
  segment: { surface, start: first.start, end: current.end },
  nextIndex: index + 1
  };
}
function isBoundarySegment(surface) {
  return INFLECTION_BOUNDARY_SEGMENTS.has(surface);
}
function isInflectionContinuationSegment(surface) {
  return INFLECTION_CONTINUATION_SEGMENT_RE.test(surface);
}
function canContinueInflectedFallbackSpan(currentSurface, nextSurface) {
  return isInflectionContinuationSegment(nextSurface) || SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface) && HIRAGANA_END_RE.test(currentSurface) && SINGLE_KANJI_SEGMENT_RE.test(nextSurface) || HIRAGANA_SEGMENT_RE.test(nextSurface) && (SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface) || KANJI_KANA_KANJI_SPAN_RE.test(currentSurface)) && !hasUsefulFallbackDeinflection(currentSurface);
}
function isNumericCounterFallbackStem(segment, sourceText) {
  return NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(segment.surface) && numericRangeImmediatelyBefore(sourceText, segment.start);
}
function hasUsefulFallbackDeinflection(surface) {
  return fallbackLookupTermsForText(surface).length > 1;
}
function shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms) {
  const first = segments[startIndex]?.surface ?? "";
  if (!first || !SURU_STEM_SEGMENT_RE.test(first)) return false;
  const suffix = surface.slice(first.length);
  if (!SURU_AUXILIARY_SUFFIX_RE.test(suffix)) return false;
  if (hasSingleKanjiGodanSAlternative(first, lookupTerms)) return false;
  return true;
}
function hasSingleKanjiGodanSAlternative(first, lookupTerms) {
  return SINGLE_KANJI_SEGMENT_RE.test(first) && lookupTerms.some((term) => term === `${first}す`);
}
function japaneseWordSegmenter() {
  const Segmenter = intlSegmenter();
  if (!Segmenter) {
  cachedSegmenterConstructor = null;
  cachedJapaneseWordSegmenter = null;
  return null;
  }
  if (cachedSegmenterConstructor !== Segmenter) {
  cachedSegmenterConstructor = Segmenter;
  cachedJapaneseWordSegmenter = new Segmenter("ja", { granularity: "word" });
  }
  return cachedJapaneseWordSegmenter ?? null;
}
function isUsefulJapaneseSegment(segment) {
  const surface = segment.segment.trim();
  return JAPANESE_CHARACTER_RE.test(surface);
}
function intlSegmenter() {
  const candidate = Intl.Segmenter;
  return typeof candidate === "function" ? candidate : null;
}
function fallbackJapaneseRunSegment(text, offset) {
  const surface = text.trim();
  if (!surface || !JAPANESE_CHARACTER_RE.test(surface)) return [];
  const start = offset + text.indexOf(surface);
  return [{ surface, start, end: start + surface.length }];
}
function fallbackLookupTermsForText(text) {
  const source = normalizeFallbackTerm(text);
  if (!source) return [];
  const terms = deinflectJapaneseTerm(source).filter(isUsefulFallbackLookupCandidate).sort(compareFallbackLookupCandidates).map((candidate) => normalizeFallbackTerm(candidate.term)).filter(Boolean);
  return uniqueNonEmptyStrings([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
}
function isUsefulFallbackLookupCandidate(candidate) {
  return candidate.depth > 0 && JAPANESE_CHARACTER_RE.test(candidate.term) && candidate.term.length > 1;
}
function compareJapaneseLookupCandidates(a, b) {
  return a.depth - b.depth || fallbackRulePriority(a) - fallbackRulePriority(b) || b.term.length - a.term.length || a.term.localeCompare(b.term);
}
const compareFallbackLookupCandidates = compareJapaneseLookupCandidates;
function fallbackRulePriority(candidate) {
  if (candidate.rules.some((rule) => rule === "vs" || rule === "vs-s" || rule === "suru" || rule === "vk" || rule === "kuru")) return 0;
  if (candidate.rules.some((rule) => rule === "v1")) return 1;
  if (candidate.rules.some((rule) => rule.startsWith("v5") || rule === "v5")) return 1;
  if (candidate.rules.some((rule) => rule === "adj-i" || rule === "i-adj")) return 2;
  return 3;
}
const RTL_SCRIPTS = /* @__PURE__ */ new Set([
  "Adlm",
  "Arab",
  "Hebr",
  "Nkoo",
  "Rohg",
  "Syrc",
  "Thaa"
]);
const RTL_LANGUAGES = /* @__PURE__ */ new Set([
  "ar",
  "dv",
  "fa",
  "he",
  "ku",
  "ps",
  "ur",
  "yi"
]);
function canonicalLanguageTag(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim().replace(/_/g, "-");
  if (!candidate || candidate.length > 255) return null;
  try {
  return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
  return null;
  }
}
function languageSubtag(value) {
  const canonical = canonicalLanguageTag(value);
  if (!canonical) return null;
  try {
  return new Intl.Locale(canonical).language;
  } catch {
  return canonical.split("-")[0]?.toLowerCase() ?? null;
  }
}
function localeDirection(value) {
  const canonical = canonicalLanguageTag(value);
  if (!canonical) return "ltr";
  try {
  const locale = new Intl.Locale(canonical);
  const script = locale.script || locale.maximize().script;
  if (script && RTL_SCRIPTS.has(script)) return "rtl";
  return RTL_LANGUAGES.has(locale.language) ? "rtl" : "ltr";
  } catch {
  return RTL_LANGUAGES.has(canonical.split("-")[0]?.toLowerCase() ?? "") ? "rtl" : "ltr";
  }
}
const LANGUAGE_PROFILE_SCHEMA_VERSION = 2;
const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 10;
const CORE_DELIVERED_CAPABILITIES = Object.freeze({
  "term-lookup": true,
  "character-lookup": true,
  segmentation: true,
  "reading-annotation": true,
  pronunciation: true,
  frequency: true,
  examples: true,
  audio: true,
  "text-to-speech": true,
  ocr: true,
  subtitles: true,
  typing: true,
  handwriting: true,
  mining: true,
  srs: true,
  grading: true
});
function learningTargetCapabilities(experiences, hasGrammarRules = false) {
  return Object.freeze({
  ...CORE_DELIVERED_CAPABILITIES,
  // A literal depth-0 dictionary candidate is lookup, not morphology.
  // Morphology is present only when a target owns deinflection, bounded
  // rewrite rules, or a target-specific subsegment Adapter.
  morphology: experiences.morphology !== "dictionary-forms",
  // Derived, never declared: a target has grammar support exactly when it
  // ships grammar rules. Same principle as the block above — the capability
  // reports the machinery instead of promising alongside it.
  grammar: hasGrammarRules
  });
}
function createLearningTargetModule(spec) {
  const language = canonicalLanguageTag(spec.language) ?? spec.language;
  const base = languageSubtag(language) ?? language;
  const regionalTag = maximizedLocaleTag(language);
  const direction = spec.direction ?? localeDirection(language);
  const detects = spec.detectsText;
  const grammar = spec.grammar;
  const experiences = learningTargetExperiences(spec);
  return Object.freeze({
  interfaceVersion: LEARNING_TARGET_MODULE_INTERFACE_VERSION,
  id: spec.id,
  language,
  direction,
  collationLocale: spec.collationLocale ?? language,
  capabilities: learningTargetCapabilities(experiences, grammar.rules.length > 0),
  experiences,
  featureSemantics: Object.freeze({
    ...spec.featureSemantics,
    phoneticScripts: Object.freeze([...spec.featureSemantics.phoneticScripts])
  }),
  typography: Object.freeze({
    contentLocale: language,
    direction,
    readingAnnotationMode: "ruby",
    supportsVerticalWriting: false,
    ...spec.typography
  }),
  typing: Object.freeze({
    inputNormalizer: "preserve",
    answerNormalizer: "target-text",
    ...spec.typing
  }),
  audio: Object.freeze({
    speechSynthesisLocale: regionalTag,
    templateLanguageToken: base,
    recordedWordAudio: false,
    ...spec.audio
  }),
  ocr: Object.freeze({
    defaultLanguage: regionalTag,
    languageHint: base,
    ...spec.ocr
  }),
  subtitles: Object.freeze({
    languageTag: spec.subtitles?.languageTag ?? base,
    languageAliases: Object.freeze([...spec.subtitles?.languageAliases ?? []])
  }),
  grammar,
  sentenceBoundaries: Object.freeze({
    terminators: Object.freeze([...spec.sentenceBoundaries?.terminators ?? [".", "!", "?"]]),
    whitespaceIsBoundary: spec.sentenceBoundaries?.whitespaceIsBoundary ?? false
  }),
  normalizeText: spec.normalizeText,
  isLookupableText(text) {
    return Boolean(text) && detects.test(text);
  },
  segment: spec.segment,
  pointerWordSegments: spec.pointerWordSegments,
  lookupCandidates: spec.lookupCandidates,
  compareLookupCandidates: spec.compareLookupCandidates,
  matchesLookupCandidateRules: spec.matchesLookupCandidateRules,
  normalizeReading: spec.normalizeReading
  });
}
function learningTargetExperiences(spec) {
  return Object.freeze({
  characterLookup: "term-dictionary",
  morphology: morphologyExperience(spec),
  readingAnnotation: "dictionary-reading",
  frequency: "dictionary-rank-or-context-occurrences",
  audio: audioExperience(spec.audio?.recordedWordAudio ?? false),
  ocr: "target-locale",
  handwriting: "self-check",
  ...spec.experiences
  });
}
function morphologyExperience(spec) {
  return spec.experiences?.morphology ?? "deinflection";
}
function audioExperience(recordedWordAudio) {
  return recordedWordAudio ? "recorded-and-speech-synthesis" : "speech-synthesis";
}
function maximizedLocaleTag(language) {
  try {
  const locale = new Intl.Locale(language);
  if (locale.region) return `${locale.language}-${locale.region}`;
  const region = locale.maximize().region;
  return region ? `${locale.language}-${region}` : locale.language;
  } catch {
  return language;
  }
}
const GRAMMAR_PATTERN_DATA = String.raw`
potential-koto-ga-dekiru	N4	ことができる	{F}ことができ(?:る|ます|ない|ません|た|ました|なかった|ませんでした)?	5	h	@g/koto-ga-dekiru/
potential-dekiru	N4	できる	{P}でき(?:る|ます|た|ました|ない|ません|なかった|ませんでした)	8	h
obligation-nakereba-naranai	N4	なければならない	{F}(?:なければならない|なければなりません|なくてはならない|なくてはなりません|なくてはいけない|なくてはいけません|なければいけない|なければいけません|なきゃ(?:いけない|だめ)?|なくちゃ(?:いけない|だめ)?|ないといけない|ねばならない)	4	h	@g/nakereba-naranai/
permission-not-required-nakutemo-ii	N5	なくてもいい	{F}なくても(?:いい|よい|大丈夫)(?:です)?	4	h
prohibition-tewa-ikenai	N4	てはいけない	{F}(?:(?:[てで]は|ちゃ|じゃ)いけ(?:ない|ません|なかった|ませんでした)|(?:[てで]は|ちゃ|じゃ)なら(?:ない|ません)|(?:[てで]は|ちゃ|じゃ)だめ(?:だ|です)?)	5	h	@g/tewa-ikenai/
permission-temo-ii	N5	てもいい	{F}[てで]も(?:いい|よい|よかった|よくない|よくありません|大丈夫(?:です)?|かまわない|かまいません|構わない|構いません)(?:です)?	5	h	@g/temoii/
request-te-kudasai	N5	てください	{F}[てで]ください(?:ませんか)?	6	h
polite-request-te-itadakemasen-ka	N4	ていただけませんか	{F}[てで](?:いただけませんか|くださいませんか)	6	h
request-naide-kudasai	N5	ないでください	{F}ないでください	5	h
advice-hou-ga-ii	N4	方がいい	{F}ほうが(?:いい|よい)(?:です)?	6	h
command-nasai	N4	なさい	{F}なさい	6	h
experience-ta-koto-ga-aru	N4	たことがある	{F}たことが(?:あ(?:る|ります|った|りました|りません|りませんでした)|ない|なかった|ありません|ありませんでした)	6	h	@g/ta-koto-ga-aru/
completion-te-shimau	N4	てしまう	(?:{F}[てで]しま(?:う|います|った|いました|わない|いません|わなかった|いませんでした)|{F}(?:ちゃう|ちゃいます|ちゃった|ちゃいました|ちゃわない|ちゃいません|ちゃわなかった|ちゃいませんでした|じゃう|じゃいます|じゃった|じゃいました|じゃわない|じゃいません|じゃわなかった|じゃいませんでした))	6	h	@g/te-shimau/
attempt-te-miru	N4	てみる	{F}[てで]み(?:る|ます|た|ました|たい|ない|ません|なかった|ませんでした)	6	h	@g/te-miru/
preparation-te-oku	N4	ておく	(?:{F}[てで]お(?:く|きます|いた|きました|かない|きません|かなかった|きませんでした)|{F}(?:とく|ときます|といた|ときました|とかない|ときません|とかなかった|ときませんでした|どく|どきます|どいた|どきました|どかない|どきません|どかなかった|どきませんでした))	6	h	@g/teoku/
desire-other-te-hoshii	N4	てほしい	{F}[てで]ほし(?:い|いです|かった|かったです|くない|くありません|くなかった|くありませんでした)	7	h
benefactive-te-kureru-morau	N4	てくれる / てもらう	{F}[てで](?:くれ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|くださ(?:る|います|った|いました|らない|いません|らなかった|いませんでした)|あげ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|や(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)|もら(?:う|います|った|いました|わない|いません|わなかった|いませんでした|え(?:る|ます|た|ました|ない|ません|なかった|ませんでした))|いただ(?:く|きます|いた|きました|かない|きません|かなかった|きませんでした|け(?:る|ます|た|ました|ない|ません|なかった|ませんでした)))	8	m	@g/te-kureru/
change-you-ni-naru	N4	ようになる	{F}ようにな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています|っていない|っていません)	8	h	@g/you-ni-naru/
habit-you-ni-suru	N4	ようにする	{F}ように(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした))	8	h	@g/you-ni-suru/
verb-suru	N5	する	(?:{P}を)?{P}(?:す(?:る|れば|るな|るの|ること|るため|る前|る後)|し(?:ます|ました|ません|ませんでした|た|て|ない|なかった|なければ|よう|ろ)|され(?:る|ます|た|ました)|させ(?:る|ます|た|ました)|でき(?:る|ます|た|ました|ない|ません))	1d	h	@g/suru/
choice-ni-suru	N4	にする	{P}に(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	a	h
change-ku-suru	N4	くする	{P}く(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	a	h
change-ku-naru-ni-naru	N5	くなる / になる	(?:{P}くな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)|{P}(?<!よう)にな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)|{P}とな(?:る|ります|った|りました))	a	h
copula-desu-da	N5	です / だ	(?:です|でした|だ|だった)(?=$|[、。！？!?よねな])	17	h	@g/desu/
negative-copula-dewa-nai	N5	ではない / じゃない	(?:では|じゃ)(?:ない|ありません|なかった|ありませんでした)	c	h
formal-copula-de-aru	N3	である	であ(?:る|ります|った|りました)	k	h
voice-causative-passive	N3	させられる	{F}(?:させられ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]せられ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]され(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	8	m	@g/verb-causative-form-saseru/
voice-causative	N4	させる	{F}(?:させ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]せ(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	9	m	@g/verb-causative-form-saseru/
voice-passive-potential	N4	れる / られる	{F}(?:られ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまわ]れ(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	9	m	@g/verb-passive-form-rareru/
evidence-rashii-mitai	N4	らしい / みたい	(?:{F}らし(?:い|かった|くない|く)|{F}みたい(?:だ|です|でした|じゃない|ではない|に|な)?(?=$|[、。！？!?ねよ]))	9	m	@g/rashii/
modality-kamoshirenai	N4	かもしれない	(?:かもしれない|かもしれません|かも)	9	h	@g/kamoshirenai/
modality-deshou-darou	N5	でしょう / だろう	(?:でしょう|でしょうか|だろう|だろうか)	a	h	@g/deshou/
quotation-to-omou	N4	と思う	{F}と思(?:う|います|った|いました|っている|っています|わない|いません|わなかった|いませんでした)	a	h	@g/to-omou/
attempt-you-to-suru	N3	ようとする	{F}ようと(?:す(?:る|ます|た|ました|ている|ています)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	b	m	@g/verb-volitional-form-you/
plan-tsumori-yotei	N4	つもり / 予定	{F}(?:つもり|予定)(?:だ|です|だった|でした)?	c	m	@g/tsumori/
expectation-hazu	N4	はず	{F}はず(?:だ|です|だった|でした|がない|はない)?	c	h	@g/hazu/
reasoning-wake	N3	わけ	{F}わけ(?:ではない|じゃない|がない|にはいかない|だ|です)?	o	m	@g/wake/
reasoning-wake-dewa-nai	N3	わけではない	{F}わけ(?:では|じゃ)(?:ない|ありません)	b	h
impossibility-wake-ga-nai	N3	わけがない	{F}わけが(?:ない|ありません)	b	h
constraint-wake-ni-wa-ikanai	N3	わけにはいかない	{F}わけにはい(?:かない|きません)	b	h
purpose-tame-ni	N4	ために	{F}ために	c	h	@g/tame-ni/
purpose-you-ni	N4	ように	{F}ように	s	m	@g/you-ni/
timing-tokoro	N4	ところ	{F}ところ(?:だ|です|だった|でした|で|に)?	e	m	@j/tokoro-bakari/
simultaneous-nagara	N4	ながら	{F}(?<!残念)ながら	e	h	@g/nagara/
state-mama	N3	まま	{F}まま	f	m	@g/mama/
list-tari	N5	たり	(?:[^、。！？!?\\s]{1,30}?[だた]り[^、。！？!?\\s]{1,30}?[だた]り(?:する|します|した|しました|しない|しません|しなかった|しませんでした)?|{F}[だた]り(?:する|します|した|しました|しない|しません|しなかった|しませんでした))	g	m	@g/tari/
limitation-bakari	N4	ばかり	{F}ばかり	g	m	@j/tokoro-bakari/
recent-ta-bakari	N4	たばかり	{F}たばかり(?:だ|です|だった|でした)?	c	h	@j/tokoro-bakari/
limitation-dake-shika	N5	だけ / しか	{F}(?:だけ|しか)	i	m	@g/dake/
degree-hodo-kurai	N4	ほど / くらい	{F}(?:ほど|くらい|ぐらい)	i	m	@g/hodo/
role-toshite	N3	として	{F}として	i	h
relation-ni-yotte	N3	によって	{F}によ(?:って|る)	i
topic-ni-tsuite	N3	について	{F}について	i	h
target-ni-taishite	N3	に対して	{F}に対(?:して|する|し)	i
concession-ni-mo-kakawarazu	N2	にもかかわらず	{F}にもかかわらず	i	h
concession-kuse-ni	N3	くせに	{F}くせに	i
suffix-tachi	N5	たち / 達	{P}(?:たち|(?<!友)達)	1e
particle-wa	N5	は	{P}は(?!ず)	1j	h	@g/particle-wa/
particle-ga	N5	が	{P}が	1j	h	@g/particle-ga/
particle-wo	N5	を	{P}を	1j	h	@g/particle-wo/
particle-de	N5	で	{P}(?<![まん])で(?!き|す|し)	1j	m	@g/particle-de/
particle-ni	N5	に	{P}に(?!なる)	1j	m	@g/particle-ni/
particle-e	N5	へ	{P}へ	1j
particle-to	N5	と	{P}(?<![っッこコ])と(?!して|いう|思)	1j	m	@g/particle-to/
particle-no	N5	の	{P}の	1j	m	@g/particle-no-noun-modifier/
particle-mo	N5	も	{P}も	1j
particle-ya	N5	や	{P}や	1j
aspect-te-iru	N5	ている	{F}[てで](?:いる|います|いた|いました|いない|いません|いなかった|いませんでした|る|た)	14	h	@g/verb-continuous-form-teiru/
aspect-te-aru	N4	てある	{F}[てで]あ(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)	c	h
aspect-te-kuru	N4	てくる	{F}[てで](?:くる|きます|きた|きました|こない|きません|こなかった|きませんでした)	k
aspect-te-iku	N4	ていく	{F}[てで]い(?:く|きます|った|きました|かない|きません|かなかった|きませんでした)	k
desire-tai	N5	たい	{F}(?:たい(?:です)?|たく(?:ない|ありません|なかった|ありませんでした)|たかった(?:です)?)	18	h	@g/tai-form/
ease-yasui-nikui	N4	やすい / にくい	{F}(?:やすい|にくい|づらい)	m	h
excess-sugiru	N4	すぎる	{F}すぎ(?:る|ます|た|ました|て|ない|ません|なかった|ませんでした|だ|です)	m	h
method-kata	N5	方	{F}方	1c
negative-nai	N5	ない	{F}(?:ない|ません|なかった|ませんでした)	1a	m	@g/verb-negative-nai-form/
polite-past-mashita	N5	ました	{F}ました	18	h	@g/masu/
polite-masu	N5	ます	{F}ます	19	m	@g/masu/
conditional-tara	N4	たら	{F}たら	h	h	@g/conditional-form-tara/
conditional-ba	N4	ば	{F}(?:えば|ければ)	i	h	@g/verb-conditional-form-ba/
conditional-ba-ii	N4	ばいい / ばよかった	{F}(?:えば|ければ|[えけげせてねべめれ]ば)(?:いい|よい|よかった)(?:です)?	d
conditional-nara	N4	なら	{F}なら(?:ば)?	i	h
conditional-to	N4	と	{F}と(?=、)	12
concession-temo-demo	N4	ても / でも	{F}[てで]も	s	m	@g/temo/
reason-node	N4	ので	(?:なので|ので)(?!は)	m	h	@g/conjunctive-particle-node/
reason-kara	N5	から	{F}から	z	m	@g/particle-kara/
appearance-sou	N4	そう	{F}そう(?:に|な)?	u	m	@g/verb-sou/
hearsay-sou-da	N4	そうだ	{F}(?:る|い|だ|た|ない)そう(?:だ|です)	j
volitional-you	N5	よう	{F}(?:よう|ろう)	19	m	@g/verb-volitional-form-you/
concession-noni	N4	のに	のに	k	h	@g/conjunctive-particle-noni/
nominalizer-koto	N5	こと	こと(?:が|を|に|は|も)	16	m	@g/koto/
plain-past-ta	N5	た	(?:{F}(?:かった|だった|った|いた|いだ|(?<!で)した|んだ|[きぎしじちにびみりえけげせてねべめれ]た|[来見寝出]た)|(?<!で)した)(?![いらり])	1b
sequence-te-kara	N5	てから	{F}[てで]から	d	h
time-mae-ni	N5	前に	{F}前に	m
time-ato-de-ni	N5	後で / 後に	{F}後(?:で|に)	m
time-toki	N5	とき	{F}とき	m
limit-made-made-ni	N5	まで / までに	{F}まで(?:に)?	s
comparison-yori-nohou	N5	より / の方が	{F}(?:より|のほうが|の方が)	u
superlative-ichiban	N5	一番	一番	m	h
question-ka-douka	N4	かどうか	{F}かどうか	d	h
purpose-masu-stem-ni-iku	N5	に行く / に来る	{F}[いきぎしじちにびみりえけげせてねべめ見寝出]に(?:行(?:く|きます|った|きました)|来(?:る|ます|た|ました)|帰(?:る|ります|った|りました))	e	h
nominalizer-no	N5	の	{F}の(?=[はがをにも])	i	m	@g/no-nominalizer/
quotation-to-iu	N4	という	{F}という	e
casual-tte	N4	って	{F}って(?=(?:言|聞|思|呼|書|いう|こと|、|。|？|!|！|$))	o
explanation-n-desu	N5	んです / のです	{F}(?:ん|の)です	m
explanation-no-da	N4	のだ / んだ	{F}(?:の|ん)(?:だ|だった|じゃない|ではない)	m
existence-ga-aru-iru	N5	がある / がいる	{P}が(?:あ(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)|い(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	o	h
skill-ga-suki-jouzu-heta	N5	が好き / が上手 / が下手	{P}が(?:好き|すき|上手|じょうず|下手|へた)(?:だ|です|ではない|じゃない)?	i	h
skill-no-ga-suki	N5	のが好き	{F}のが(?:好き|すき|嫌い|きらい|上手|じょうず|下手|へた|得意|苦手)(?:だ|です|ではない|じゃない)?	g	h
invitation-mashou	N5	ましょう / ましょうか	{F}ましょう(?:か)?	c	h
invitation-masen-ka	N5	ませんか	{F}ませんか	b	h
relief-te-yokatta	N4	てよかった	{F}[てで]よかった(?:です)?	a	h
without-zuni	N4	ずに	{F}ずに	c	h
without-naide	N4	ないで	{F}ないで(?!ください)	g	h
apology-te-sumimasen	N4	てすみません	{F}[てで]すみません	a	h
necessity-ga-hitsuyou	N4	が必要	{P}が必要(?:だ|です|だった|でした)?	f	h
sensation-ga-suru	N4	がする	{P}が(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	d	h
case-baai	N4	場合	{F}場合(?:は|には)?	g	h
examples-nado	N4	など	{P}など	g	h
examples-toka	N4	とか	{F}とか(?:{F}とか)?	i
hearsay-to-iwarete-iru	N4	と言われている	{F}と言われてい(?:る|ます|ない|ません)|{F}と言われ(?:た|ました)	a	h
hearsay-to-kiita	N4	と聞いた	{F}と聞(?:いた|きました|いている|いています)	c	h
similarity-you-da	N4	ようだ / ような	{F}よう(?:だ|です|な|に)	t
permission-sasete-kudasai	N4	させてください	{F}させてください	5	h
decision-koto-ni-suru	N4	ことにする	{F}ことに(?:す(?:る|ます|た|ました|ている|ています)|し(?:ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした))	9	h
arrangement-koto-ni-naru	N4	ことになる	{F}ことにな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)	9	h
honorific-o-go-ni-naru-suru	N3	お〜になる / お〜する	(?:お|ご){F}(?:になる|になります|する|します|いたす|いたします|ください)	8
polite-gozaimasu	N5	ございます	{F}ござい(?:ます|ました|ません|ませんでした)	u
advice-beki	N3	べき	{F}べき(?:だ|です|ではない|じゃない)?	f	h
time-aida-aida-ni	N4	間 / 間に	{F}間(?:に|は)?	m
time-uchi-ni	N3	うちに	{F}うちに	e
time-saichuu-ni	N3	最中に	{F}最中に	g	h
repetition-tabi-ni	N3	たびに	{F}たびに	e	h
incidental-tsuide-ni	N3	ついでに	{F}ついでに	e
phase-compound-verb	N4	始める / 続ける / 終わる	{F}(?:(?:始め|続け)(?:る|ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした)|(?:出し|終わ)(?:る|ます|た|ました))	i
state-ppanashi	N3	っぱなし	{F}っぱなし	e	h
covered-darake	N3	だらけ	{F}だらけ	f	h
fresh-tate	N3	たて	{F}たて	i
elapsed-buri-ni	N3	ぶりに	{F}ぶりに	e	h
interval-goto-ni	N3	ごとに	{F}ごとに	e	h
interval-oki-ni	N3	おきに	{F}おきに	f	h
emphasis-kara-koso	N3	からこそ	{F}からこそ	c	h
source-ni-yoru-to	N3	によると / によれば	{F}によ(?:ると|れば)	c	h
topic-ni-kansuru	N3	に関する	{F}に関する	d	h
context-ni-okeru	N3	における	{F}における	d	h
standard-ni-shite-wa	N3	にしては	{F}にしては	e	h
simultaneous-to-douji-ni	N3	と同時に	{F}と同時に	c	h
supposition-to-shitara	N3	としたら / とすれば	{F}と(?:したら|すれば|すると)	d	h
almost-tokoro-datta	N3	ところだった	{F}ところ(?:だった|でした)	c	h
nonlimiting-wa-mochiron	N3	はもちろん	{F}はもちろん	e	h
pretend-furi-wo-suru	N3	ふりをする	{F}ふりを(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています))	c	h
instant-ta-totan-ni	N3	たとたんに	{F}たとたん(?:に)?	c	h
difficulty-gatai	N3	がたい	{F}がたい	i	h
only-shika-nai	N3	しかない	{F}しか(?:ない|ありません|なかった|ありませんでした)	c	h
emphasis-sae	N3	さえ / でさえ	[^、。！？!?\s]{1,24}(?:で)?さえ	i
emphasis-koso	N3	こそ	{P}こそ	i
try-te-goran	N3	てごらん	{F}[てで]ごらん	d	h
cause-sei-okage-de	N3	せいで / おかげで	{F}(?:せい|おかげ)で	e	h
manner-toori	N3	とおり	{F}(?:とおり|通り)(?:に|だ|です)?	g	h
certainty-ni-chigai-nai	N3	に違いない	{F}に違い(?:ない|ありません)	f	h
certainty-ni-kimatte-iru	N3	に決まっている	{F}に決まってい(?:る|ます)	f	h
qualification-to-wa-kagiranai	N3	とは限らない	{F}とは限(?:らない|りません)	f	h
contrast-ippou-de	N3	一方で	{F}一方(?:で)?	g
contrast-hanmen	N3	反面	{F}反面	g
substitution-kawari-ni	N3	かわりに	{F}かわりに	g
topic-ni-kanshite	N3	に関して	{F}に関して	h	h
comparison-ni-kurabete	N3	に比べて	{F}に比べて	h	h
basis-ni-motozuite	N3	に基づいて	{F}に基づいて	h	h
following-ni-sotte	N3	に沿って	{F}に沿って	h
following-change-ni-shitagatte	N3	に従って	{F}に従って	h
change-ni-tsurete	N3	につれて	{F}につれて	h
together-to-tomo-ni	N3	とともに	{F}とともに	h
context-ni-oite	N3	において	{F}において	h	h
means-wo-tsuujite-tooshite	N3	を通じて / を通して	{F}を通(?:じて|して)	h
representative-wo-hajime	N3	をはじめ	{F}をはじめ	h
limit-ni-kagiru-kagirazu	N3	に限る / に限らず	{F}に限(?:る|ります|らない|らず|って)	h
suffix-gachi	N3	がち	{F}がち	o
suffix-gimi	N3	気味	{F}気味	o
suffix-ge	N3	げ	{F}げ	o
suffix-ppoi	N3	っぽい	{F}っぽい	o
negative-youni-nai	N3	ようがない	{F}ようが(?:ない|ありません)	g	h
impossible-kkonai	N3	っこない	{F}っこない	i
condition-kara-ni-wa	N2	からには	{F}からには	c	h
qualification-kara-to-itte	N2	からといって	{F}からといって	c	h
condition-nai-kagiri	N2	ない限り	{F}ない限り	c	h
condition-ijou-wa	N2	以上は	{F}以上は	b	h
condition-ue-wa	N2	上は	{F}上は	c	h
sequence-ue-de	N2	上で	{F}上で	d	h
addition-ue-ni	N2	上に	{F}上に	d	h
viewpoint-kara-miru-to	N2	から見ると / からすると	{F}から(?:見ると|見れば|すると|すれば|言うと|言えば)	g
starting-kara-shite	N2	からして	{F}からして	g
concession-ni-shitemo-toshitemo	N2	にしても / としても	{F}(?:にしても|としても)	e	h
concession-ni-shiro-ni-seyo	N2	にしろ / にせよ	{F}に(?:しろ|せよ)	e	h
after-all-ageku	N2	あげく	{F}あげく(?:に)?	d	h
after-effort-sue-ni	N2	末に	{F}末に	d	h
only-ni-suginai	N2	にすぎない	{F}にすぎ(?:ない|ません)	e	h
essence-ni-hoka-naranai	N2	にほかならない	{F}にほかならない	e	h
necessity-zaru-wo-enai	N2	ざるを得ない	{F}ざるを得(?:ない|ません)	a	h
compulsion-zu-ni-wa-irarenai	N2	ずにはいられない	{F}(?:ずには|ないでは)いられ(?:ない|ません|なかった|ませんでした)	a	h
possibility-eru-enai	N2	得る / 得ない	{F}得(?:る|ます|た|ました|ない|ません|なかった|ませんでした)	k
risk-kanenai	N2	かねない	{F}かね(?:ない|ません)	e	h
difficulty-kaneru	N2	かねる	{F}かね(?:る|ます|た|ました)	e	h
emotion-te-naranai	N2	てならない	{F}[てで]ならない	e
emotion-te-tamaranai	N2	てたまらない	{F}[てで]たまらない	e
emotion-te-shouganai	N2	てしょうがない	{F}[てで](?:しょうがない|仕方がない)	e
timing-shidai	N2	次第	{F}次第	g
time-sai-ni	N2	際に	{F}際に	g	h
occasion-ni-atatte	N2	にあたって	{F}にあたって	g	h
occasion-ni-saishite	N2	に際して	{F}に際して	g	h
prior-ni-sakidatte	N2	に先立って	{F}に先立って	g	h
trigger-wo-kikkake-ni	N2	をきっかけに	{F}をきっかけに	g	h
trigger-wo-keiki-ni	N2	を契機に	{F}を契機に	g
span-ni-watatte	N2	にわたって	{F}にわたって	h	h
accompany-ni-tomonatte	N2	に伴って	{F}に伴って	h	h
response-ni-oujite	N2	に応じて	{F}に応じて	h
basis-wo-fumaete	N2	を踏まえて	{F}を踏まえて	h	h
merit-dake-atte	N2	だけあって	{F}だけあって	g
because-dake-ni	N2	だけに	{F}だけに	g
concession-youga-maiga	N1	ようが / まいが	{F}(?:ろうが|ようが){F}まいが	8	h
concession-nagara-mo	N2	ながらも	{F}ながらも	g
continuation-tsutsu	N2	つつ / つつある	{F}つつ(?:ある)?	i
cause-bakari-ni	N2	ばかりに	{F}ばかりに	f	h
contrast-dokoro-ka	N2	どころか	{F}どころか	f	h
impossible-dokoro-dewa-nai	N2	どころではない	{F}どころではない	f	h
nonlimiting-dake-denaku	N3	だけでなく	{F}だけでなく	k	h
regardless-ni-kakawarazu	N2	にかかわらず	{F}にかかわらず	g	h
contrary-ni-hanshite	N2	に反して	{F}に反して	g	h
addition-ni-kuwaete	N2	に加えて	{F}に加えて	g	h
target-ni-kotaete	N2	に応えて	{F}に(?:応|こた)えて	h
center-wo-chuushin-ni	N2	を中心に	{F}を中心に	h	h
regardless-wo-toyazu	N2	を問わず	{F}を問わず	g	h
topic-wo-megutte	N2	をめぐって	{F}をめぐって	g	h
direction-muke-muki	N3	向け / 向き	{F}向(?:け|き)	m
relative-wari-ni	N2	わりに	{F}わりに	i
memory-kke	N2	っけ	{F}っけ	s
quote-to-iu-yori	N2	というより	{F}というより	i
example-to-itta	N2	といった	{F}といった(?=[^、。！？!?\\s])	k
topic-to-ieba	N2	といえば	{F}といえば	k
thing-mono-da	N2	ものだ	{F}もの(?:だ|です)	o
cause-mono-dakara	N2	ものだから	{F}ものだから	g
concession-mono-no	N2	ものの	{F}ものの	g	h
advice-koto-da	N2	ことだ	{F}こと(?:だ|です)	m
unnecessary-koto-wa-nai	N2	ことはない	{F}ことは(?:ない|ありません)	e	h
double-negative-nai-koto-wa-nai	N2	ないことはない	{F}ないことは(?:ない|ありません)	d	h
explanation-to-iu-koto-da	N2	ということだ	{F}ということ(?:だ|です)	g
nature-to-iu-mono-da	N2	というものだ	{F}というもの(?:だ|です)	g
not-nature-to-iu-mono-dewa-nai	N2	というものではない	{F}というものでは(?:ない|ありません)	f
wish-nai-mono-ka	N2	ないものか	{F}ないものか	g
instant-ga-hayai-ka	N1	が早いか	{F}が早いか	8	h
instant-ya-inaya	N1	や否や	{F}や否や	8	h
instant-nari	N1	なり	{F}なり	c
repetition-soba-kara	N1	そばから	{F}そばから	a	h
unexpected-ka-to-omoi-kiya	N1	かと思いきや	{F}かと思いきや	a	h
incidental-katagata	N1	かたがた	{F}かたがた	e
incidental-gatera	N1	がてら	{F}がてら	e
starting-wo-kawakiri-ni	N1	を皮切りに	{F}を皮切りに	e	h
endpoint-wo-kagiri-ni	N1	を限りに	{F}を限りに	e	h
means-wo-motte	N1	をもって	{F}をもって	e	h
turning-wo-sakai-ni	N1	を境に	{F}を境に	f
range-ni-itaru-made	N1	に至るまで	{F}に至るまで	e	h
stage-ni-itatte	N1	に至って	{F}に至って(?:は|も)?	f
context-ni-atte	N1	にあって	{F}にあって	g
standard-ni-sokushite	N1	に即して	{F}に即して	f	h
exclusive-wo-oite	N1	をおいて	{F}をおいて	d	h
defiance-wo-mono-to-mo-sezu	N1	をものともせず	{F}をものともせず	c	h
forced-wo-yogi-naku-sareru	N1	を余儀なくされる	{F}を余儀なくされ(?:る|ます|た|ました)	a	h
force-wo-yogi-naku-saseru	N1	を余儀なくさせる	{F}を余儀なくさせ(?:る|ます|た|ました)	a	h
emotion-ni-taenai	N1	に堪えない	{F}に堪え(?:ない|ません)	e
reluctance-ni-shinobinai	N1	に忍びない	{F}に忍びない	d	h
easy-inference-ni-katagunai	N1	に難くない	{F}に難くない	d	h
worthy-ni-ataru	N1	に値する	{F}に値する	d	h
sufficient-ni-taru	N1	に足る	{F}に足る	d
utmost-no-itari	N1	の至り	{F}の至り	g
extreme-kiwamaru-kiwamarinai	N1	極まる / 極まりない	{F}(?:極まる|極まりない)	g
deep-wish-te-yamanai	N1	てやまない	{F}[てで]や(?:まない|みません)	c	h
since-te-kara-to-iu-mono	N1	てからというもの	{F}[てで]からというもの	a	h
consequence-zu-ni-wa-okanai	N1	ずにはおかない	{F}(?:ずには|ないでは)おかない	a	h
consequence-zu-ni-wa-sumanai	N1	ずにはすまない	{F}(?:ずには|ないでは)すまない	a	h
prohibition-bekarazu	N1	べからず	{F}べからず	c	h
improper-majiki	N1	まじき	{F}まじき	c	h
role-taru-mono	N1	たるもの	{F}たるもの	c	h
surprise-tomo-arou-mono-ga	N1	ともあろうものが	{F}ともあろうものが	c	h
stage-tomo-naru-to	N1	ともなると	{F}ともなると	e
any-de-are	N1	であれ	{F}であれ	g
pair-to-ii-to-ii	N1	といい	[^、。！？!?\\s]{1,24}といい[^、。！？!?\\s]{1,24}といい	i
concession-to-wa-ie	N1	とはいえ	{F}とはいえ	e	h
without-nakushite	N1	なくして	{F}なくして	d	h
basis-atte-no	N1	あっての	{F}あっての	d
unique-nara-dewa	N1	ならでは	{F}ならでは	d	h
covered-mamire	N1	まみれ	{F}まみれ	k
full-zukume	N1	ずくめ	{F}ずくめ	k
depending-ikan	N1	いかん	{F}いかん(?:だ|で|によって|にかかわらず)?	g
result-shimatsu-da	N1	始末だ	{F}始末(?:だ|です)	i
rhetorical-denakute-nandarou	N1	でなくてなんだろう	{F}でなくてなんだろう	i
extreme-to-ittara-nai	N1	といったらない	{F}といったらない	i
extreme-tara-aryashinai	N1	たらありゃしない	{F}たらありゃしない	i
best-ni-koshita-koto-wa-nai	N2	に越したことはない	{F}に越したことは(?:ない|ありません)	e	h
excess-ni-mo-hodo-ga-aru	N1	にもほどがある	{F}にもほどがある	e	h
emphatic-no-nanno	N1	のなんの	{F}のなんの	m
minimal-tari-tomo	N1	たりとも	{F}たりとも	e	h
minimal-dani	N1	だに	{F}だに	k
minimal-sura	N1	すら	{F}すら	k
comparison-gotoki	N1	ごとき	{F}ごとき	k
suffix-meku	N1	めく	{F}め(?:く|いて|き)	k
unnecessary-made-mo-nai	N1	までもない	{F}までもない	e	h
unnecessary-ni-wa-oyobanai	N1	には及ばない	{F}には及(?:ばない|びません)	g
situation-tokoro-wo	N1	ところを	{F}ところを	e	h
`;
function expandGrammarGuideUrl(url) {
  if (!url) return "";
  return url.replace("@g/", "https://www.tofugu.com/japanese-grammar/").replace("@j/", "https://www.tofugu.com/japanese/");
}
function parseGrammarRule(row) {
  const [ruleId, level, name, patternSource, priority, confidence = "m", url = ""] = row.split("	");
  if (!ruleId || !name || !patternSource || !priority) throw new TypeError(`Invalid Yomu grammar registry row: ${row}`);
  if (!["Core", "N5", "N4", "N3", "N2", "N1"].includes(level)) {
  throw new TypeError(`Invalid Yomu grammar level for ${ruleId}: ${level}`);
  }
  return Object.freeze({
  ruleId,
  level,
  name,
  patternSource,
  priority: parseInt(priority, 36),
  confidence: confidence === "h" ? "high" : "medium",
  url: expandGrammarGuideUrl(url),
  // Per-rule examples ship only as test fixtures (tests/reader/fixtures/
  // grammar-rule-examples.ts); the reader render path uses remote copy JSON.
  examples: Object.freeze([])
  });
}
function parseGrammarRegistry(data) {
  const rules = data.trim().split("\n").map((row) => parseGrammarRule(row.replace(/^ +/u, "")));
  const ids = new Set(rules.map((rule) => rule.ruleId));
  if (ids.size !== rules.length) throw new TypeError("Yomu grammar registry contains duplicate rule ids.");
  return Object.freeze(rules);
}
const YOMU_GRAMMAR_REGISTRY = parseGrammarRegistry(GRAMMAR_PATTERN_DATA);
new Map(YOMU_GRAMMAR_REGISTRY.map((rule) => [rule.ruleId, rule]));
const MAX_GRAMMAR_HINTS = 12;
const MAX_OCCURRENCES_PER_RULE = 2;
const GRAMMAR_CACHE_LIMIT = 240;
function createLearningTargetGrammar(spec = {}) {
  const ruleSpecs = [...spec.rules ?? []];
  const levelScale = normalizedLevelScale(spec.levelScale, ruleSpecs);
  const compiled = compileGrammarRules(ruleSpecs, levelScale, spec.expandPatternSource);
  const rules = Object.freeze(compiled.map(({ spec: rule }) => Object.freeze({
  ruleId: rule.ruleId,
  level: rule.level,
  name: rule.name,
  ...rule.displayNames ? { displayNames: Object.freeze({ ...rule.displayNames }) } : {},
  url: rule.url
  })));
  const normalizeSentence = spec.normalizeSentence ?? defaultNormalizeGrammarSentence;
  const cache = /* @__PURE__ */ new Map();
  const copyIds = new Map(ruleSpecs.flatMap((rule) => {
  const copyId = spec.ruleCopyIdFor?.(rule) ?? rule.ruleCopyId;
  return copyId ? [[rule.ruleId, copyId]] : [];
  }));
  return Object.freeze({
  levelScale,
  rules,
  referenceUrl: spec.referenceUrl?.trim() ?? "",
  detect(sentence) {
    const normalized = normalizeSentence(sentence);
    if (!normalized) return [];
    const cached = cache.get(normalized);
    if (cached) return cached;
    const selected = selectGrammarMatches(compiled, normalized, spec);
    const matches = Object.freeze(selected.sort(compareGrammarMatches).map(({ priority: _priority, ...match }) => Object.freeze(match)));
    cache.set(normalized, matches);
    if (cache.size > GRAMMAR_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (typeof oldest === "string") cache.delete(oldest);
    }
    return matches;
  },
  ruleCopyId(ruleId) {
    return copyIds.get(ruleId) ?? null;
  }
  });
}
function normalizedLevelScale(value, rules) {
  if (!value) {
  if (rules.length) throw new TypeError("Grammar rules require a target-owned level scale.");
  return null;
  }
  const id = value.id.trim();
  const levels = value.levels.map((level) => level.trim()).filter(Boolean);
  if (!id || !levels.length || new Set(levels).size !== levels.length) {
  throw new TypeError("Grammar level scales require a stable id and unique level names.");
  }
  return Object.freeze({ id, levels: Object.freeze(levels) });
}
function compileGrammarRules(rules, levelScale, expandPatternSource) {
  const ids = /* @__PURE__ */ new Set();
  const levels = new Set(levelScale?.levels ?? []);
  return Object.freeze(rules.map((rule) => {
  if (!rule.ruleId.trim() || !rule.name.trim() || !rule.patternSource || !Number.isFinite(rule.priority)) {
    throw new TypeError(`Invalid grammar rule: ${rule.ruleId || "(missing id)"}`);
  }
  if (ids.has(rule.ruleId)) throw new TypeError(`Duplicate grammar rule id: ${rule.ruleId}`);
  if (!levels.has(rule.level)) {
    throw new TypeError(`Grammar rule ${rule.ruleId} uses ${rule.level}, outside the ${levelScale?.id ?? "missing"} scale.`);
  }
  ids.add(rule.ruleId);
  const source = expandPatternSource?.(rule.patternSource) ?? rule.patternSource;
  return Object.freeze({ spec: rule, pattern: new RegExp(source, "gu") });
  }));
}
function defaultNormalizeGrammarSentence(sentence) {
  return sentence.normalize("NFKC");
}
function selectGrammarMatches(rules, sentence, spec) {
  const seenMatches = /* @__PURE__ */ new Set();
  const seenRuleCounts = /* @__PURE__ */ new Map();
  const selected = [];
  const ranked = rules.flatMap((rule) => grammarMatches(rule, sentence, spec)).sort(compareRankedGrammarMatches);
  for (const item of ranked) {
  const key = `${item.ruleId}:${item.match}:${item.index}`;
  if (seenMatches.has(key)) continue;
  const count = seenRuleCounts.get(item.ruleId) ?? 0;
  if (count >= MAX_OCCURRENCES_PER_RULE) continue;
  if (selected.some((existing) => shouldSuppressOverlappingMatch(existing, item, spec))) continue;
  seenMatches.add(key);
  seenRuleCounts.set(item.ruleId, count + 1);
  selected.push(item);
  if (selected.length >= MAX_GRAMMAR_HINTS) break;
  }
  return selected;
}
function grammarMatches(rule, sentence, detector) {
  return Array.from(sentence.matchAll(rule.pattern)).filter((match) => !detector.shouldSkipMatch?.(rule.spec, grammarMatchContext(sentence, match))).map((match) => rankedGrammarMatch(rule.spec, match, detector.learnerFacingMatch)).filter((match) => Boolean(match));
}
function rankedGrammarMatch(rule, match, learnerFacingMatch) {
  const rawMatch = match[0];
  const learnerMatch = learnerFacingMatch?.(rule, rawMatch) ?? rawMatch;
  if (!learnerMatch) return null;
  const learnerOffset = rawMatch.lastIndexOf(learnerMatch);
  const indexOffset = learnerOffset > 0 ? learnerOffset : 0;
  return {
  ruleId: rule.ruleId,
  name: rule.name,
  level: rule.level,
  ...rule.displayNames ? { displayNames: rule.displayNames } : {},
  match: learnerMatch,
  confidence: rule.confidence,
  index: (match.index ?? 0) + indexOffset,
  url: rule.url,
  priority: rule.priority
  };
}
function grammarMatchContext(sentence, match) {
  const rawMatch = match[0];
  const start = match.index ?? 0;
  const end = start + rawMatch.length;
  return {
  rawMatch,
  before: sentence.slice(Math.max(0, start - 4), start),
  following: sentence.slice(end, end + 6)
  };
}
function compareRankedGrammarMatches(a, b) {
  return a.priority - b.priority || a.index - b.index || b.match.length - a.match.length || a.name.localeCompare(b.name);
}
function compareGrammarMatches(a, b) {
  return a.index - b.index || a.name.localeCompare(b.name);
}
function shouldSuppressOverlappingMatch(existing, next, spec) {
  if (!grammarMatchRangesOverlap(existing, next)) return false;
  if (existing.match === next.match && existing.index === next.index) return true;
  if (spec.keepOverlappingMatches?.(existing, next)) return false;
  if (existing.priority < 40 && next.priority < 40) return false;
  return next.priority >= 40 && existing.priority < next.priority || grammarMatchContains(existing, next) && existing.priority <= next.priority && existing.match.length > next.match.length;
}
function grammarMatchRangesOverlap(a, b) {
  const aEnd = a.index + a.match.length;
  const bEnd = b.index + b.match.length;
  return a.index < bEnd && b.index < aEnd;
}
function grammarMatchContains(outer, inner) {
  return inner.index >= outer.index && inner.index + inner.match.length <= outer.index + outer.match.length;
}
const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやのて、。！？!?\s]{1,24}`;
const FORM_CHUNK = String.raw`[^はがをにへとでもやのてで、。！？!?\s]{0,24}`;
const JAPANESE_GRAMMAR = createLearningTargetGrammar({
  levelScale: {
  id: "jlpt",
  levels: ["Core", "N5", "N4", "N3", "N2", "N1"]
  },
  referenceUrl: "https://www.tofugu.com/japanese-grammar/",
  rules: YOMU_GRAMMAR_REGISTRY,
  normalizeSentence: (sentence) => sentence.normalize("NFKC").replace(/\s+/g, ""),
  expandPatternSource: (source) => source.replaceAll("{F}", FORM_CHUNK).replaceAll("{P}", PARTICLE_CHUNK),
  shouldSkipMatch: (rule, context) => shouldSkipJapaneseGrammarMatch(rule.ruleId, context),
  learnerFacingMatch: (rule, rawMatch) => japaneseLearnerMatch(rule.name, rawMatch),
  keepOverlappingMatches: (existing, next) => existing.ruleId === "copula-desu-da" && next.priority < 50,
  // The two hosted copy files are the established Japanese inventory. Other
  // targets omit this hook, so a coincidentally equal rule id cannot inherit
  // Japanese prose.
  ruleCopyIdFor: (rule) => rule.ruleId
});
const BARE_MITAI_DESIRE_FALSE_POSITIVE_RE = /(?:読み|飲み|住み|休み|頼み|望み|悩み|包み|噛み|組み|編み|摘み|進み|歩み|楽しみ|悲しみ|苦しみ|試み)たい$/u;
const LEXICAL_DESIRE_TAI_RE = /^(?:いたい|痛い|冷たい|重たい|やたい)(?:です)?$/u;
const LEXICAL_NEGATIVE_NAI_RE = /(?:少ない|危ない|まかない|何気ない|さりげない|なにげない)$/u;
const LEXICAL_METHOD_KATA_RE = /(?:夕方|地方|親方|行方|方法|の方)$/u;
const LEXICAL_SUFFIX_GE_RE = /(?:からあげ|おかげ|さりげ|なにげ)$/u;
const LEXICAL_SUFFIX_MEKU_RE = /(?:きめき|きらめく|ひらめき|うごめく)$/u;
const LEXICAL_POSSIBILITY_ERU_RE = /^(?:得る|得ます|得た|得ました|得ない|得ません|得なかった|得ませんでした)$/u;
const PRONOUN_POSSESSIVE_NOMINALIZER_RE = /(?:私|僕|俺|彼|彼女|誰|何)の$/u;
const GRAMMAR_MATCH_SKIP_PREDICATES = {
  "appearance-sou": ({ rawMatch }) => rawMatch === "そう" || /(?:かわいそう|ごちそう)$/u.test(rawMatch),
  "hearsay-sou-da": ({ rawMatch }) => /(?:かわいそう|ごちそう)/u.test(rawMatch),
  "volitional-you": ({ rawMatch }) => rawMatch === "よう" || rawMatch === "さよう",
  "similarity-you-da": ({ rawMatch }) => rawMatch.startsWith("さよう"),
  "conditional-nara": ({ rawMatch }) => rawMatch.endsWith("さようなら"),
  "desire-tai": ({ rawMatch }) => LEXICAL_DESIRE_TAI_RE.test(rawMatch),
  "without-naide": ({ rawMatch, following }) => rawMatch.endsWith("ないで") && following.startsWith("す"),
  "negative-nai": ({ rawMatch }) => LEXICAL_NEGATIVE_NAI_RE.test(rawMatch),
  "method-kata": shouldSkipMethodKataMatch,
  "suffix-ge": ({ rawMatch }) => LEXICAL_SUFFIX_GE_RE.test(rawMatch),
  "state-mama": ({ rawMatch, before }) => rawMatch.includes("わがまま") || rawMatch === "まま" && before.endsWith("わが"),
  "difficulty-gatai": ({ rawMatch }) => rawMatch.endsWith("ありがたい"),
  "substitution-kawari-ni": ({ rawMatch }) => rawMatch.endsWith("おかわりに"),
  "suffix-meku": ({ rawMatch }) => LEXICAL_SUFFIX_MEKU_RE.test(rawMatch),
  "possibility-eru-enai": ({ rawMatch }) => LEXICAL_POSSIBILITY_ERU_RE.test(rawMatch) || rawMatch.startsWith("心得"),
  "suffix-gimi": ({ rawMatch }) => rawMatch.endsWith("不気味"),
  "fresh-tate": ({ rawMatch }) => rawMatch === "たて",
  "elapsed-buri-ni": ({ rawMatch }) => rawMatch.endsWith("すぶりに"),
  "ease-yasui-nikui": ({ rawMatch }) => rawMatch === "やすい",
  "examples-toka": ({ following }) => following.startsWith("言") || following.startsWith("聞") || following.startsWith("思"),
  "explanation-no-da": ({ rawMatch }) => /(?:私|僕|俺|彼|彼女|誰|何)の(?:だ|だった|じゃない|ではない)$/u.test(rawMatch),
  "skill-no-ga-suki": shouldSkipPronounPossessiveNominalizerMatch,
  "nominalizer-no": shouldSkipPronounPossessiveNominalizerMatch,
  "sensation-ga-suru": ({ rawMatch }) => /(?:彼|彼女|私|僕|俺|君|あなた|先生|友だち|子ども)がす/u.test(rawMatch),
  "standard-ni-shite-wa": ({ following }) => /^(?:いけ|なら|だめ)/u.test(following),
  "emphasis-sae": ({ rawMatch }) => rawMatch.endsWith("ささえ"),
  "emphasis-koso": ({ rawMatch }) => rawMatch.endsWith("ようこそ"),
  "evidence-rashii-mitai": ({ rawMatch }) => BARE_MITAI_DESIRE_FALSE_POSITIVE_RE.test(rawMatch)
};
function shouldSkipJapaneseGrammarMatch(ruleId, context) {
  return GRAMMAR_MATCH_SKIP_PREDICATES[ruleId]?.(context) ?? false;
}
function shouldSkipMethodKataMatch({
  rawMatch,
  before,
  following
}) {
  return LEXICAL_METHOD_KATA_RE.test(rawMatch) || rawMatch === "方" && (following.startsWith("法") || before.endsWith("の") || /[夕地親行]/u.test(before.slice(-1)));
}
function shouldSkipPronounPossessiveNominalizerMatch({
  rawMatch
}) {
  return PRONOUN_POSSESSIVE_NOMINALIZER_RE.test(rawMatch);
}
const LEARNER_MATCH_ENDING_NAMES = /* @__PURE__ */ new Set([
  "たい",
  "ない",
  "ました",
  "ます",
  "た",
  "よう",
  "そう",
  "方",
  "やすい / にくい",
  "すぎる",
  "れる / られる",
  "させる",
  "させられる",
  "がち",
  "気味",
  "げ",
  "っぽい",
  "めく"
]);
const LEARNER_MATCH_HELPER_NAMES = /* @__PURE__ */ new Set([
  "てください",
  "ていただけませんか",
  "ないでください",
  "させてください",
  "てほしい",
  "てくれる / てもらう",
  "てしまう",
  "てみる",
  "ておく",
  "ている",
  "てある",
  "てくる",
  "ていく",
  "てから"
]);
function japaneseLearnerMatch(name, rawMatch) {
  let match = rawMatch.replace(/^(?:そして|それで|でも|また|しかし|それに|つまり|ただし|だから)/u, "");
  if (LEARNER_MATCH_HELPER_NAMES.has(name)) {
  const afterClauseBoundary = match.replace(/^.*(?:[、。！？!?]|たら|なら|ので|から)/u, "");
  if (afterClauseBoundary) match = afterClauseBoundary;
  }
  if (!LEARNER_MATCH_ENDING_NAMES.has(name)) return match;
  const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, "");
  return afterLastParticle || match;
}
const JAPANESE_POINTER_WORD_RE = new RegExp(
  `(?:[${KANA}${HALFWIDTH_KATAKANA}${PROLONGED_SOUND_MARK}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})+`,
  "gu"
);
createLearningTargetModule({
  id: "japanese-v1",
  language: "ja",
  direction: "ltr",
  collationLocale: "ja",
  experiences: {
  characterLookup: "character-dictionary",
  morphology: "deinflection",
  audio: "recorded-and-speech-synthesis",
  handwriting: "stroke-feedback"
  },
  featureSemantics: {
  characterSystem: "kanji",
  phoneticScripts: ["hiragana", "katakana"],
  pronunciation: "pitch-accent",
  readingAnnotation: "furigana"
  },
  grammar: JAPANESE_GRAMMAR,
  sentenceBoundaries: {
  terminators: ["。", "！", "？", "!", "?"],
  whitespaceIsBoundary: true
  },
  typography: {
  contentLocale: "ja",
  readingAnnotationMode: "ruby",
  supportsVerticalWriting: true
  },
  typing: {
  inputNormalizer: "romaji-kana",
  answerNormalizer: "japanese-kana"
  },
  audio: {
  speechSynthesisLocale: "ja-JP",
  templateLanguageToken: "ja",
  recordedWordAudio: true
  },
  ocr: {
  defaultLanguage: "ja-JP",
  languageHint: "ja"
  },
  subtitles: {
  languageTag: "ja",
  languageAliases: []
  },
  detectsText: HAS_JAPANESE_LETTER,
  normalizeText: normalizeJapaneseTargetText,
  segment(text) {
  return segmentJapaneseText(text).map((segment) => ({
    text: segment.surface,
    start: segment.start,
    end: segment.end
  }));
  },
  pointerWordSegments: japanesePointerWordSegments,
  // Morphology is the deinflector itself, verbatim and unnormalized: the
  // dictionary engine hands over raw substrings of the page and needs the
  // candidates to line up with those substrings character for character.
  // Anything that wants normalized input calls normalizeText first.
  lookupCandidates: deinflectJapaneseTerm,
  // The ranking JMdict tags imply: a suru/kuru reading beats ichidan/godan
  // beats i-adjective. Shared verbatim with the Japanese fallback path so
  // both doors into the deinflector return the same order.
  compareLookupCandidates: compareJapaneseLookupCandidates,
  matchesLookupCandidateRules: termRulesMatch,
  normalizeReading(spelling, reading) {
  return normalizedJapaneseCardReading(spelling, reading);
  }
});
function normalizeJapaneseTargetText(text) {
  return normalizeFallbackTerm(text.normalize("NFKC"));
}
function japanesePointerWordSegments(text) {
  return [...text.matchAll(JAPANESE_POINTER_WORD_RE)].map((match) => ({
  text: match[0],
  start: match.index,
  end: match.index + match[0].length
  }));
}
const JAPANESE_TARGET_ROSTER_ENTRY = Object.freeze({
  id: "ja",
  runtimeLocale: "ja",
  englishName: "Japanese",
  nativeName: "日本語",
  defaultScript: "Jpan",
  scripts: Object.freeze(["Jpan"]),
  direction: "ltr",
  studyTargetReadiness: "full"
});
const READING_ONLY_STUDY_TARGET_ID_LIST = "sq grc ar yue zh da nl en fi fr de el hu id it km ko lo la mn fa pl pt ro ru sh es sv tl th tr vi";
const READING_ONLY_STUDY_TARGET_IDS = READING_ONLY_STUDY_TARGET_ID_LIST.split(" ");
Object.freeze([
  JAPANESE_TARGET_ROSTER_ENTRY,
  ...LEARNER_LANGUAGES.map((language) => Object.freeze({
  ...language,
  studyTargetReadiness: READING_ONLY_STUDY_TARGET_IDS.includes(language.id) ? "reading-only" : "planned"
  }))
]);
Object.freeze(
  LEARNER_LANGUAGES.map((language) => canonicalLanguageTag(language.runtimeLocale) ?? language.runtimeLocale)
);
const ankiFieldNames = (names) => names.split("|");
const ANKI_HEADWORD_FIELD_NAME_PREFIX = ankiFieldNames(
  "Vocabulary-Kanji|Vocabulary Kanji|Vocab Kanji|Jlab-Kanji|Japanese_Word|Word|Word Kanji|Japanese Word|Headword|Headword Kanji|Term Kanji|Term Text|Expression Text|Base Form|Dictionary Form"
);
const ANKI_HEADWORD_FIELD_NAME_TAIL = ankiFieldNames(
  "Learnable|Lemma|Primary|Search Term|Target Word|Term|Vocab|Vocabulary|Vocabulary Expression|Word Expression"
);
ankiFieldNames("Expression|Front|Japanese|Kanji|Katakana");
[
  ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
  "Expression Reading",
  "Japanese Expression",
  ...ANKI_HEADWORD_FIELD_NAME_TAIL
];
[
  ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
  ...ankiFieldNames("Expression|Expression Reading|Front|Japanese|Japanese Expression|Kanji|Katakana"),
  ...ANKI_HEADWORD_FIELD_NAME_TAIL
];
ankiFieldNames(
  "Vocabulary-Kana|Vocabulary Kana|Vocabulary-Furigana|Vocabulary Furigana|Vocab Kana|Vocab Furigana|Jlab-Hiragana|Readings|Expression Reading|Furigana|Furigana Reading|Hiragana|Japanese Reading|Kana|Kana Reading|On|On Reading|Onyomi|Kun|Kun Reading|Kunyomi|Pronunciation|Reading|Ruby|Term Kana|Term Reading|Vocab Reading|Vocabulary Reading|Word Kana|Word Reading|Yomi"
);
ankiFieldNames(
  "Vocabulary-English|Vocabulary English|Vocabulary-Meaning|Vocabulary Meaning|Translation_1|Jlab-Translation|RemarksBack|Jlab-Remarks|Other-Back|Jlab-DictionaryLookup|Meaning|Def|Defs|Definition|Definition 1|Definition English|Definitions|English|English Definition|English Meaning|Gloss|Glosses|Glossary|Keyword|MainDefinition|Meanings|Mnemonic|Back|DictionaryDefinitions|Sense|Term Meaning|Translation|Translation 1|Vocab Def|Vocab Definition|Word Meaning"
);
ankiFieldNames(
  "Sentence|Example|Example Sentence|Example Sentence Text|Context|Context Sentence|Context Text|ExpressionSentence|Japanese Sentence|Mining Sentence|SentKanji|Sentence Furigana|Sentence Kanji|Sentence-Kanji|Sentence Text|Source Sentence|Source Text"
);
ankiFieldNames(
  "Audio|Expression Audio|Term Audio|Vocab Audio|Vocabulary Audio|Word Audio|PronunciationAudio|Sound|Voice"
);
const ANKI_SENTENCE_AUDIO_FIELD_NAMES = ankiFieldNames(
  "SentenceAudio|Sentence Audio|SentAudio|Sentence Sound|Context Audio|Example Audio"
);
ankiFieldNames(
  "Context Image|Example Image|Frame|Image|Image File|Photo|Picture|Snapshot|Screenshot|Sentence Image|Sentence Screenshot|SentencePicture|Still|Source Image|Term Image|Vocab Image|Vocabulary Image|Word Image"
);
function normalizeAnkiFieldName(value) {
  return value.replace(/[_\s-]+/g, "").toLowerCase();
}
new Set(ANKI_SENTENCE_AUDIO_FIELD_NAMES.map(normalizeAnkiFieldName));
const FALLBACK_HEX_COLOR = "#000000";
function normalizeHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_HEX_COLOR;
}
function sharedContrastRatio(a, b, normalizeColor = normalizeHexColor) {
  const l1 = relativeLuminance(a, normalizeColor);
  const l2 = relativeLuminance(b, normalizeColor);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}
function relativeLuminance(color, normalizeColor = normalizeHexColor) {
  const [red, green, blue] = sharedHexToRgb(color, normalizeColor).map((value) => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
function sharedMixHex(from, to, amount, normalizeColor = normalizeHexColor) {
  const a = sharedHexToRgb(from, normalizeColor);
  const b = sharedHexToRgb(to, normalizeColor);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}
function sharedHexToRgb(color, normalizeColor = normalizeHexColor) {
  const safe = normalizeHexColor(normalizeColor(color));
  return [
  parseInt(safe.slice(1, 3), 16),
  parseInt(safe.slice(3, 5), 16),
  parseInt(safe.slice(5, 7), 16)
  ];
}
const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;
function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (!shortHex) return fallback;
  return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
}
function accessibleOcrBackgroundOpacity(opacity) {
  const numericOpacity = Number(opacity);
  const clampedOpacity = Number.isFinite(numericOpacity) ? Math.max(0, Math.min(1, numericOpacity)) : DEFAULT_OCR_BACKGROUND_OPACITY;
  return Math.max(OCR_BACKGROUND_MIN_RENDERED_OPACITY, clampedOpacity);
}
function accessibleOcrBackgroundColor(opacity = DEFAULT_OCR_BACKGROUND_OPACITY) {
  const ink = OVERLAY_COLOR_TOKENS.background;
  const renderedOpacity = accessibleOcrBackgroundOpacity(opacity);
  if (ocrRenderedBackgroundContrast(ink, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
  return ink;
  }
  for (let amount = 0.08; amount <= 1; amount += 0.04) {
  const candidate = sharedMixHex(ink, "#000000", amount, sanitizeAccentColor);
  if (ocrRenderedBackgroundContrast(candidate, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
    return candidate;
  }
  }
  return "#000000";
}
function ocrRenderedBackgroundContrast(color, opacity) {
  const renderedOnWhite = sharedMixHex("#ffffff", color, opacity, sanitizeAccentColor);
  return sharedContrastRatio(renderedOnWhite, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor);
}
accessibleOcrBackgroundColor(DEFAULT_OCR_BACKGROUND_OPACITY);
const DEFAULT_LANGUAGE_PROFILE_ID = "default-ja";
const PARSER_PROVIDERS = /* @__PURE__ */ new Set(["local", "jiten", "jpdb", "auto"]);
function readOutputLanguageField(source) {
  return source.schemaVersion === 1 ? source.learnerLanguage ?? source.outputLanguage : source.outputLanguage ?? source.learnerLanguage;
}
function createDefaultLanguageProfile(defaults = {}) {
  return {
  schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
  id: DEFAULT_LANGUAGE_PROFILE_ID,
  ...outputLanguageFields(storedOutputLanguage(readOutputLanguageField(defaults))),
  targetLanguage: storedTargetLanguage(defaults.targetLanguage),
  uiLocale: normalizeUiLocale(defaults.uiLocale, "en"),
  parserProvider: normalizeParserProvider(defaults.parserProvider, "local"),
  dictionaries: emptyProfileDictionaries(),
  definitionTranslationProviderIds: []
  };
}
function outputLanguageFields(outputLanguage) {
  return { outputLanguage, learnerLanguage: outputLanguage };
}
function storedTargetLanguage(value) {
  return canonicalLanguageTag(value) ?? "ja";
}
function storedOutputLanguage(value) {
  return canonicalLanguageTag(value) ?? "en";
}
function normalizeUiLocale(value, fallback) {
  if (value === "auto") return "auto";
  return canonicalLanguageTag(value) ?? fallback;
}
function normalizeParserProvider(value, fallback) {
  return PARSER_PROVIDERS.has(value) ? value : fallback;
}
function emptyProfileDictionaries() {
  return { installed: [], enabled: [], order: [] };
}
function speakerIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
}
const IMMERSION_KIT_SEARCH_URL_TEMPLATE = "https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1";
const NADESHIKO_SEARCH_URL_TEMPLATE = "https://nadeshiko.co/search/{query}";
const JPDB_LOOKUP_LINK = {
  id: "jpdb",
  label: "JPDB",
  urlTemplate: "https://jpdb.io/search?q={query}",
  enabled: true
};
const JITEN_LIVE_FREQUENCY_PILL = {
  id: "jiten-frequency",
  label: "Jiten",
  urlTemplate: "",
  enabled: true,
  action: "frequency-live"
};
const JPDB_LIVE_FREQUENCY_PILL = {
  id: "jpdb-frequency",
  label: "JPDB",
  urlTemplate: "",
  enabled: true,
  action: "frequency-live"
};
const JISHO_LOOKUP_LINK = {
  id: "jisho",
  label: "Jisho",
  urlTemplate: "https://jisho.org/search/{query}",
  enabled: false
};
const YOMU_LOOKUP_LINK = {
  id: "yomu-search",
  label: "Yomu",
  urlTemplate: `${NEW_TAB_PAGE_URL}index.html?q={query}`,
  enabled: true
};
const JITEN_LOOKUP_LINK = {
  id: "jiten",
  label: "Jiten",
  urlTemplate: "https://jiten.moe/parse?text={query}",
  enabled: true
};
const BUNPRO_LOOKUP_LINK = {
  id: "bunpro",
  label: "Bunpro",
  urlTemplate: "https://bunpro.jp/search?query={query}",
  enabled: true
};
const BUNPRO_LIVE_FREQUENCY_PILL = {
  id: "bunpro-frequency",
  label: "Bunpro",
  urlTemplate: "",
  enabled: true,
  action: "frequency-live"
};
const WEBLIO_LOOKUP_LINK = {
  id: "weblio",
  label: "Weblio",
  urlTemplate: "https://www.weblio.jp/content/{query}",
  enabled: false
};
const REMOVED_GOO_LOOKUP_LINK_ID = "goo";
const KOTOBANK_LOOKUP_LINK = {
  id: "kotobank",
  label: "Kotobank",
  urlTemplate: "https://kotobank.jp/search?q={query}",
  enabled: false
};
const TAKOBOTO_LOOKUP_LINK = {
  id: "takoboto",
  label: "Takoboto",
  urlTemplate: "https://takoboto.jp/?q={query}",
  enabled: false
};
const WIKTIONARY_LOOKUP_LINK = {
  id: "wiktionary-ja",
  label: "Wiktionary",
  urlTemplate: "https://ja.wiktionary.org/wiki/{query}",
  enabled: false
};
const IMMERSION_KIT_LOOKUP_LINK = {
  id: "immersion-kit",
  label: "Immersion Kit",
  urlTemplate: IMMERSION_KIT_SEARCH_URL_TEMPLATE,
  enabled: false
};
const NADESHIKO_LOOKUP_LINK = {
  id: "nadeshiko",
  label: "Nadeshiko",
  urlTemplate: NADESHIKO_SEARCH_URL_TEMPLATE,
  enabled: false
};
const UCHISEN_LOOKUP_LINK = {
  id: "uchisen",
  label: "Uchisen",
  urlTemplate: "https://uchisen.com/kanji/{query}",
  enabled: false
};
const COPY_LOOKUP_LINK = {
  id: "copy",
  label: "Copy",
  urlTemplate: "",
  enabled: true,
  action: "copy"
};
const DEFAULT_DICTIONARY_LOOKUP_LINKS = [
  YOMU_LOOKUP_LINK,
  JITEN_LOOKUP_LINK,
  JITEN_LIVE_FREQUENCY_PILL,
  JPDB_LOOKUP_LINK,
  JPDB_LIVE_FREQUENCY_PILL,
  BUNPRO_LOOKUP_LINK,
  BUNPRO_LIVE_FREQUENCY_PILL,
  JISHO_LOOKUP_LINK,
  WEBLIO_LOOKUP_LINK,
  KOTOBANK_LOOKUP_LINK,
  TAKOBOTO_LOOKUP_LINK,
  WIKTIONARY_LOOKUP_LINK,
  IMMERSION_KIT_LOOKUP_LINK,
  NADESHIKO_LOOKUP_LINK,
  UCHISEN_LOOKUP_LINK,
  COPY_LOOKUP_LINK
];
[
  { ...JPDB_LOOKUP_LINK, enabled: false },
  { ...JISHO_LOOKUP_LINK, enabled: true },
  COPY_LOOKUP_LINK
];
[[
  // The Yomu-first default immediately before the Nadeshiko search pill was
  // added. Untouched installs receive the new pill beside Immersion Kit;
  // custom orders still keep their order and get new built-ins appended.
  YOMU_LOOKUP_LINK.id,
  JITEN_LOOKUP_LINK.id,
  JITEN_LIVE_FREQUENCY_PILL.id,
  JPDB_LOOKUP_LINK.id,
  JPDB_LIVE_FREQUENCY_PILL.id,
  BUNPRO_LOOKUP_LINK.id,
  BUNPRO_LIVE_FREQUENCY_PILL.id,
  JISHO_LOOKUP_LINK.id,
  WEBLIO_LOOKUP_LINK.id,
  KOTOBANK_LOOKUP_LINK.id,
  TAKOBOTO_LOOKUP_LINK.id,
  WIKTIONARY_LOOKUP_LINK.id,
  IMMERSION_KIT_LOOKUP_LINK.id,
  UCHISEN_LOOKUP_LINK.id,
  COPY_LOOKUP_LINK.id
], [
  // The jiten-first default that shipped before Yomu was promoted to the front
  // of the pill row. Users who never re-ordered their pills are migrated to the
  // current Yomu-first default order instead of being pinned to the old layout.
  JITEN_LOOKUP_LINK.id,
  JITEN_LIVE_FREQUENCY_PILL.id,
  JPDB_LOOKUP_LINK.id,
  JPDB_LIVE_FREQUENCY_PILL.id,
  YOMU_LOOKUP_LINK.id,
  BUNPRO_LOOKUP_LINK.id,
  JISHO_LOOKUP_LINK.id,
  WEBLIO_LOOKUP_LINK.id,
  KOTOBANK_LOOKUP_LINK.id,
  TAKOBOTO_LOOKUP_LINK.id,
  WIKTIONARY_LOOKUP_LINK.id,
  IMMERSION_KIT_LOOKUP_LINK.id,
  UCHISEN_LOOKUP_LINK.id,
  COPY_LOOKUP_LINK.id
], [
  YOMU_LOOKUP_LINK.id,
  JITEN_LOOKUP_LINK.id,
  JPDB_LOOKUP_LINK.id,
  JISHO_LOOKUP_LINK.id,
  WEBLIO_LOOKUP_LINK.id,
  REMOVED_GOO_LOOKUP_LINK_ID,
  KOTOBANK_LOOKUP_LINK.id,
  TAKOBOTO_LOOKUP_LINK.id,
  WIKTIONARY_LOOKUP_LINK.id,
  IMMERSION_KIT_LOOKUP_LINK.id,
  UCHISEN_LOOKUP_LINK.id,
  COPY_LOOKUP_LINK.id
], [
  JITEN_LOOKUP_LINK.id,
  JPDB_LOOKUP_LINK.id,
  YOMU_LOOKUP_LINK.id,
  JISHO_LOOKUP_LINK.id,
  WEBLIO_LOOKUP_LINK.id,
  REMOVED_GOO_LOOKUP_LINK_ID,
  KOTOBANK_LOOKUP_LINK.id,
  TAKOBOTO_LOOKUP_LINK.id,
  WIKTIONARY_LOOKUP_LINK.id,
  IMMERSION_KIT_LOOKUP_LINK.id,
  UCHISEN_LOOKUP_LINK.id,
  COPY_LOOKUP_LINK.id
], [
  JPDB_LOOKUP_LINK.id,
  JISHO_LOOKUP_LINK.id,
  COPY_LOOKUP_LINK.id,
  YOMU_LOOKUP_LINK.id,
  JITEN_LOOKUP_LINK.id,
  WEBLIO_LOOKUP_LINK.id,
  REMOVED_GOO_LOOKUP_LINK_ID,
  KOTOBANK_LOOKUP_LINK.id,
  TAKOBOTO_LOOKUP_LINK.id,
  WIKTIONARY_LOOKUP_LINK.id,
  IMMERSION_KIT_LOOKUP_LINK.id,
  UCHISEN_LOOKUP_LINK.id
]];
const RETIRED_READING_MODES = ["all", "auto"];
const RETIRED_SETTING_DEFAULTS = [
  { keys: ["furiganaMode"], retired: RETIRED_READING_MODES.map((mode) => [mode]) },
  // The mode the puck brings back when furigana is shown again.
  { keys: ["puckFuriganaModeBeforeHide"], retired: RETIRED_READING_MODES.map((mode) => [mode]) },
  // A word the learner just failed keeps its reading.
  { keys: ["furiganaHiddenStateGroups"], retired: [[["known", "due", "failed"]]] },
  { keys: ["wordHighlightColorSource", "wordUnderlineColorSource", "wordTextColorSource"], retired: [["jpdb", "pitch", "anki"]] },
  { keys: ["subtitleHighlightColorSource", "subtitleUnderlineColorSource", "subtitleTextColorSource"], retired: [["jpdb", "pitch", "anki"]] },
  { keys: ["wordColorHiddenStateGroups"], retired: [[[]]] }
];
RETIRED_SETTING_DEFAULTS.flatMap((group) => group.keys);
const AUDIO_SOURCE_TYPE_VALUES = [
  "jpod101",
  "language-pod-101",
  "jisho",
  "bunpro",
  "lingua-libre",
  "wiktionary",
  "jiten-tts",
  "jpdb-tts",
  "text-to-speech",
  "text-to-speech-reading",
  "custom",
  "custom-json"
];
new Set(AUDIO_SOURCE_TYPE_VALUES);
Logger.scope("Settings");
({
  languageProfiles: [createDefaultLanguageProfile()],
  // Numbered as normalization numbers them, so the defaults are already
  // normal and an untouched Save writes them back unchanged.
  dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link, priority) => ({ ...link, priority }))
});
new Set(FURIGANA_HIDE_STATE_GROUPS);
const commandCapabilities = createPrivateElementStateSlot("commands", immutableCommandSnapshot);
function privateCommandAttributes(command) {
  return commandCapabilities.attributes(command);
}
function immutableCommandSnapshot(command) {
  if (command.kind === "subtitle-action" && command.batchPlans) {
  return Object.freeze({ ...command, batchPlans: Object.freeze([...command.batchPlans]) });
  }
  if (command.kind === "card-action" && command.audioUrls) {
  return Object.freeze({ ...command, audioUrls: Object.freeze([...command.audioUrls]) });
  }
  if (command.kind === "card-ui" && command.choices) {
  return Object.freeze({ ...command, choices: Object.freeze(command.choices.map((choice) => Object.freeze({ ...choice }))) });
  }
  return Object.freeze({ ...command });
}
const OVERHANG_CLASS = "jpdb-reader-ruby-overhang";
const AT_START_CLASS = "jpdb-reader-ruby-at-start";
const AT_END_CLASS = "jpdb-reader-ruby-at-end";
function rubyOverhangClassAttribute(surface, start, end, reading, readingBeside) {
  if (readingBeside || Array.from(reading).length <= 2 * Array.from(surface.slice(start, end)).length) return "";
  const edges = [start === 0 ? ` ${AT_START_CLASS}` : "", end === surface.length ? ` ${AT_END_CLASS}` : ""].join("");
  return ` class="${OVERHANG_CLASS}${edges}"`;
}
new Set(
  "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
);
new Set("heiban,atamadaka,nakadaka,odaka".split(","));
function renderRuby(surface, token, kanjiNavigation, preserveTokenRubies = false) {
  return renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies);
}
function renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies, layout) {
  let html = "";
  let localOffset = 0;
  const rubies = effectiveTokenRubies(surface, token, preserveTokenRubies);
  rubies.forEach((ruby, index) => {
  const start = ruby.start - token.start;
  const end = ruby.end - token.start;
  html += renderKanjiNavigationText(surface.slice(localOffset, start));
  const base = renderKanjiNavigationText(surface.slice(start, end));
  const readingBeside = index > 0 && start === localOffset || rubies[index + 1]?.start === ruby.end;
  html += `<ruby${rubyOverhangClassAttribute(surface, start, end, ruby.text, readingBeside)}><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
  localOffset = end;
  });
  html += renderKanjiNavigationText(surface.slice(localOffset));
  return html;
}
function inferredInflectedSurfaceRubies(surface, spelling, reading) {
  const visibleSurface = surface.trim();
  const baseSpelling = spelling.trim();
  const baseReading = reading.trim();
  if (!visibleSurface || !baseSpelling || visibleSurface === baseSpelling) return [];
  if (!KANJI_RE.test(visibleSurface) || !READING_KANA_ONLY_RE.test(baseReading) || baseReading === baseSpelling) return [];
  for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
  if (!baseReading.endsWith(spellingSuffix)) continue;
  const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
  if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
  const surfaceSuffix = visibleSurface.slice(spellingStem.length);
  if (surfaceSuffix && !READING_KANA_ONLY_RE.test(surfaceSuffix)) continue;
  const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
  if (rubies.length) return rubies;
  }
  if (visibleSurface.startsWith(baseSpelling) && !READING_KANA_CHAR_RE.test(baseSpelling)) {
  const surfaceSuffix = visibleSurface.slice(baseSpelling.length);
  if (!surfaceSuffix || READING_KANA_ONLY_RE.test(surfaceSuffix)) {
    return [{
      text: baseReading,
      start: 0,
      end: baseSpelling.length,
      length: baseSpelling.length
    }];
  }
  }
  return [];
}
function trailingKanaSuffixes(value) {
  const suffixes = [];
  for (let index = 0; index < value.length; index += 1) {
  const suffix = value.slice(index);
  if (suffix && READING_KANA_ONLY_RE.test(suffix)) suffixes.push(suffix);
  }
  return suffixes.sort((first, second) => second.length - first.length);
}
function stemRubiesForInflectedSurface(surfaceStem, readingStem) {
  const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
  if (!trimmed.surface || !trimmed.reading) return [];
  if (!KANJI_RE.test(trimmed.surface) || !READING_KANA_ONLY_RE.test(trimmed.reading)) return [];
  return [{
  text: trimmed.reading,
  start: trimmed.offset,
  end: trimmed.offset + trimmed.surface.length,
  length: trimmed.surface.length
  }];
}
function trimSharedKanaAffixes(surface, reading) {
  let trimmedSurface = surface;
  let trimmedReading = reading;
  let offset = 0;
  while (trimmedSurface && trimmedReading && sameKanaCharacter(trimmedSurface[0], trimmedReading[0])) {
  trimmedSurface = trimmedSurface.slice(1);
  trimmedReading = trimmedReading.slice(1);
  offset += 1;
  }
  while (trimmedSurface && trimmedReading && sameKanaCharacter(
  trimmedSurface[trimmedSurface.length - 1],
  trimmedReading[trimmedReading.length - 1]
  )) {
  trimmedSurface = trimmedSurface.slice(0, -1);
  trimmedReading = trimmedReading.slice(0, -1);
  }
  return { surface: trimmedSurface, reading: trimmedReading, offset };
}
function sameKanaCharacter(first, second) {
  return Boolean(first && second && first === second && READING_KANA_ONLY_RE.test(first));
}
function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
  const sources = sourceTokenRubies(surface, token);
  if (preserveTokenRubies) {
  return sources.flatMap((ruby) => {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];
    const base = surface.slice(range.start, range.end);
    if (!KANJI_RE.test(base)) return [];
    if (!READING_KANA_CHAR_RE.test(base)) return [ruby];
    const parts = kanjiOnlyRubySegments(surface, token, ruby);
    return parts.length ? parts : [ruby];
  });
  }
  return sources.flatMap((ruby) => kanjiOnlyRubySegments(surface, token, ruby));
}
function sourceTokenRubies(surface, token) {
  if (isCounterAfterNumber(surface, token.sentence, token.start - (token.sentenceStart ?? 0))) return [];
  if (token.rubies.length) return explicitTokenRubies(surface, token);
  const reading = distinctTokenReading(surface, token);
  if (!reading) return [];
  if (surface.trim() === token.card.spelling.trim()) {
  return [{ text: reading, start: token.start, end: token.end, length: token.length }];
  }
  return inferredTokenRubies(surface, reading, token);
}
function explicitTokenRubies(surface, token) {
  return explicitRubyReadingMatchesSurface(surface, token) ? [] : token.rubies;
}
function distinctTokenReading(surface, token) {
  if (!surface) return null;
  const reading = trimmedTokenReading(token);
  if (!reading) return null;
  if (reading.normalize("NFC") === surface.normalize("NFC")) return null;
  return reading;
}
function trimmedTokenReading(token) {
  return token.card.reading?.trim() ?? "";
}
function inferredTokenRubies(surface, reading, token) {
  if (!KANJI_RE.test(surface)) return [];
  if (!READING_KANA_ONLY_RE.test(reading)) return [];
  const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
  return inferred.map((ruby) => ({
  ...ruby,
  start: token.start + ruby.start,
  end: token.start + ruby.end
  }));
}
function explicitRubyReadingMatchesSurface(surface, token) {
  const ranges = token.rubies.flatMap((ruby) => {
  const range = localRubyRange(surface, token, ruby);
  return range ? [{ ...range, text: ruby.text }] : [];
  }).sort((first, second) => first.start - second.start);
  if (!ranges.length) return false;
  let cursor = 0;
  let reconstructed = "";
  for (const range of ranges) {
  if (range.start < cursor) return false;
  reconstructed += surface.slice(cursor, range.start) + range.text;
  cursor = range.end;
  }
  reconstructed += surface.slice(cursor);
  return reconstructed.normalize("NFC") === surface.normalize("NFC");
}
function kanjiOnlyRubySegments(surface, token, ruby) {
  const range = localRubyRange(surface, token, ruby);
  if (!range) return [];
  return kanjiRubyParts(surface.slice(range.start, range.end), ruby.text.trim()).map((part) => ({
  text: part.text,
  start: token.start + range.start + part.start,
  end: token.start + range.start + part.end,
  length: part.end - part.start
  }));
}
function localRubyRange(surface, token, ruby) {
  const start = ruby.start - token.start;
  const end = ruby.end - token.start;
  if (start < 0 || end > surface.length || end <= start) return null;
  return { start, end };
}
function kanjiRubyParts(base, reading) {
  if (!base || !reading || !KANJI_RE.test(base)) return [];
  if (!READING_KANA_ONLY_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];
  const anchors = alignRubyKanaAnchors(base, reading);
  if (!anchors) return trimRubyPartToKanji(base, reading);
  const parts = [];
  let baseOffset = 0;
  let readingOffset = 0;
  for (const anchor of anchors) {
  appendRubyGap(parts, base, baseOffset, anchor.baseStart, reading.slice(readingOffset, anchor.readingStart));
  baseOffset = anchor.baseEnd;
  readingOffset = anchor.readingEnd;
  }
  appendRubyGap(parts, base, baseOffset, base.length, reading.slice(readingOffset));
  return parts.length ? parts : trimRubyPartToKanji(base, reading);
}
function appendRubyGap(parts, base, start, end, reading) {
  const part = trimRubyPartToKanji(base.slice(start, end), reading)[0];
  if (part) parts.push({ text: part.text, start: start + part.start, end: start + part.end });
}
function trimRubyPartToKanji(base, reading) {
  const trimmed = trimSharedKanaAffixes(base, reading);
  if (!trimmed.surface || !trimmed.reading || !KANJI_RE.test(trimmed.surface)) return [];
  const kanjiOnly = kanaTrimmedKanjiRange(trimmed.surface, trimmed.reading);
  if (kanjiOnly) {
  return [{
    text: trimmed.reading,
    start: trimmed.offset + kanjiOnly.start,
    end: trimmed.offset + kanjiOnly.end
  }];
  }
  return [{
  text: trimmed.reading,
  start: trimmed.offset,
  end: trimmed.offset + trimmed.surface.length
  }];
}
function kanaTrimmedKanjiRange(base, reading) {
  if (!READING_KANA_ONLY_RE.test(reading) || !READING_KANA_CHAR_RE.test(base)) return null;
  const chars = Array.from(base);
  const first = chars.findIndex((char) => KANJI_RE.test(char));
  if (first < 0) return null;
  let last = -1;
  for (let index = chars.length - 1; index >= first; index -= 1) {
  if (KANJI_RE.test(chars[index])) {
    last = index;
    break;
  }
  }
  if (last < first || first === 0 && last === chars.length - 1) return null;
  return { start: first, end: last + 1 };
}
function alignRubyKanaAnchors(base, reading) {
  const runs = rubyBaseKanaRuns(base);
  if (!runs.length) return [];
  return findRubyKanaAnchorPlan(base, reading, runs, 0, 0, []);
}
function findRubyKanaAnchorPlan(base, reading, runs, index, readingOffset, anchors) {
  if (index >= runs.length) return rubyKanaAnchorPlanIsValid(base, reading, anchors) ? anchors : null;
  const run = runs[index];
  for (const readingStart of readingRunOccurrences(reading, run.text, readingOffset)) {
  const nextAnchors = anchors.concat({
    ...run,
    readingStart,
    readingEnd: readingStart + run.text.length
  });
  const plan = findRubyKanaAnchorPlan(base, reading, runs, index + 1, readingStart + run.text.length, nextAnchors);
  if (plan) return plan;
  }
  return null;
}
function readingRunOccurrences(reading, text, offset) {
  const occurrences = [];
  let index = reading.indexOf(text, offset);
  while (index >= 0) {
  occurrences.push(index);
  index = reading.indexOf(text, index + 1);
  }
  return occurrences;
}
function rubyKanaAnchorPlanIsValid(base, reading, anchors) {
  let baseOffset = 0;
  let readingOffset = 0;
  for (const anchor of anchors) {
  if (!rubyGapCanOwnReading(base.slice(baseOffset, anchor.baseStart), reading.slice(readingOffset, anchor.readingStart))) return false;
  baseOffset = anchor.baseEnd;
  readingOffset = anchor.readingEnd;
  }
  return rubyGapCanOwnReading(base.slice(baseOffset), reading.slice(readingOffset));
}
function rubyGapCanOwnReading(base, reading) {
  return KANJI_RE.test(base) ? reading.length > 0 : reading.length === 0;
}
function rubyBaseKanaRuns(base) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= base.length; index += 1) {
  const isKana = index < base.length && READING_KANA_CHAR_RE.test(base[index]);
  if (isKana && start < 0) start = index;
  if ((!isKana || index === base.length) && start >= 0) {
    runs.push({ text: base.slice(start, index), baseStart: start, baseEnd: index });
    start = -1;
  }
  }
  return runs;
}
function renderKanjiNavigationText(value, options) {
  return escapeHtml(value);
}
createPrivateElementStateSlot(
  "rendered-word",
  (state) => Object.freeze({ ...state }),
  { replayable: true }
);
const selectorPairs = (names, attributes = ["class", "id"]) => names.split(",").flatMap((name) => attributes.map((attribute) => `[${attribute}*="${name}" i]`)).join(",");
const roleSelectors = (names) => names.split(",").map((name) => `[role="${name}"]`).join(",");
`a[href],button,summary,label,${roleSelectors("button,link,menuitem,option,tab,checkbox,radio,switch")},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
`[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs("audio,button,control,play,sound,speaker,toggle", ["class"])}`;
`time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs("author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username", ["class"])}`;
`button,label,summary,${roleSelectors("button,tab,menuitem,option,checkbox,radio,switch,combobox")}`;
`header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs("account,chooser,dialog,dropdown,login,menu,modal,panel,picker,profile,signin,toolbar")}`;
`[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs("alert,banner,notice,notification,snackbar,toast", ["class"])},${selectorPairs("assistant,prompt,question", ["class", "id"])}`;
roleSelectors("option,menuitem,menuitemcheckbox,menuitemradio");
`button,summary,label,${roleSelectors("button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio,combobox")},[slot="more-button"],.more-button,#more,#less`;
roleSelectors("menu,menubar,toolbar,tablist");
new Set(
  "ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(",")
);
new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
selectorPairs("control,toggle,player", ["class"]);
new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
const POS_LABELS = {
  abbr: "abbreviation",
  adj: "adjective",
  "adj-f": "pre-noun adjective",
  "adj-i": "i-adjective",
  "adj-ix": "yoi/ii adjective",
  "adj-na": "na-adjective",
  "adj-no": "no-adjective",
  "adj-pn": "pre-noun adjectival",
  "adj-t": "taru adjective",
  adv: "adverb",
  "adv-to": "adverb taking to",
  arch: "archaic",
  ateji: "phonetic kanji spelling",
  aux: "auxiliary",
  "aux-adj": "auxiliary adjective",
  "aux-v": "auxiliary verb",
  col: "colloquial",
  conj: "conjunction",
  cop: "copula",
  ctr: "counter",
  dated: "dated term",
  derog: "derogatory",
  exp: "expression",
  fam: "familiar language",
  fem: "female language",
  form: "formal language",
  gikun: "special kanji reading",
  hon: "honorific language",
  hum: "humble language",
  id: "idiomatic expression",
  ik: "irregular kana form",
  io: "irregular okurigana",
  int: "interjection",
  joc: "jocular language",
  male: "male language",
  n: "noun",
  "n-adv": "adverbial noun",
  "n-pr": "proper noun",
  "n-pref": "noun used as a prefix",
  "n-suf": "noun used as a suffix",
  "n-t": "temporal noun",
  "net-sl": "internet slang",
  num: "number",
  obs: "obsolete term",
  obsc: "obscure term",
  ok: "outdated kana form",
  "on-mim": "onomatopoeic or mimetic word",
  pn: "pronoun",
  poet: "poetic term",
  pol: "polite language",
  pref: "prefix",
  prt: "particle",
  proverb: "proverb",
  rare: "rare term",
  rk: "rare kana form",
  sens: "sensitive term",
  sl: "slang",
  suf: "suffix",
  unc: "unclassified",
  uk: "usually written using kana alone",
  vi: "intransitive verb",
  vt: "transitive verb",
  v1: "ichidan verb",
  v5: "godan verb",
  v5aru: "aru ending",
  v5b: "bu ending",
  v5g: "gu ending",
  v5k: "ku ending",
  v5m: "mu ending",
  v5n: "nu ending",
  v5r: "ru ending",
  v5s: "su ending",
  v5t: "tsu ending",
  v5u: "u ending",
  vk: "kuru verb",
  vs: "suru verb",
  "vs-c": "su verb",
  "vs-i": "suru verb",
  "vs-s": "suru verb (special class)",
  vulgar: "vulgar expression",
  vz: "zuru verb"
};
function formatPartOfSpeech(tags = []) {
  const labels = tags.map((tag) => POS_LABELS[tag.toLowerCase()] ?? tag).filter(Boolean);
  return [...new Set(labels)].join(", ");
}
Logger.scope("DictionaryArchiveCache");
Logger.scope("DictionaryReplicaPurge");
Logger.scope("Yomitan");
new TextDecoder();
Logger.scope("Yomitan");
const VISIBLE_EXAMPLE_COUNT = 1;
function renderMoreDisclosure(innerHtml, label, kind = "meanings") {
  return `<details class="jpdb-reader-more" data-more-kind="${kind}"><summary class="jpdb-reader-more-summary">${escapeHtml(label)}</summary>${innerHtml}</details>`;
}
function renderExampleListWithMore(items, label) {
  const list = (html) => `<ul class="jpdb-reader-jpdb-examples">${html}</ul>`;
  if (items.length <= VISIBLE_EXAMPLE_COUNT + 1) return list(items.join(""));
  return `${list(items.slice(0, VISIBLE_EXAMPLE_COUNT).join(""))}${renderMoreDisclosure(list(items.slice(VISIBLE_EXAMPLE_COUNT).join("")), label, "examples")}`;
}
function renderProviderExamples(provider, sourceId, collection, sourceAttributes, language) {
  const availability = collection.availability;
  const items = availability === "loaded" ? collection.items : [];
  return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" data-example-provider="${provider}" data-examples-availability="${availability}" ${sourceAttributes(definitionSourceStateKey$1(`${sourceId}:examples`), items.length > 0)}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, "exampleSentences"))}</span>
                ${renderProviderExampleStatus(collection, language)}
            </summary>
            <div class="jpdb-reader-local-glossary">
                ${items.length ? renderExampleListWithMore(items.map((example) => renderProviderExample(example, language)), uiText(language, "moreExamples")) : renderProviderExampleAvailabilityReason(collection, language)}
            </div>
        </details>
    `;
}
function renderProviderExampleStatus(collection, language) {
  if (collection.availability === "loaded" && collection.items.length) return "";
  const status = uiText(language, collection.availability === "unavailable" ? "exampleSourceFailedShort" : "exampleSourceEmptyShort");
  return `<span class="jpdb-reader-source-status jpdb-reader-example-count">${escapeHtml(status)}</span>`;
}
function renderProviderExampleAvailabilityReason(collection, language) {
  const reason = collection.availability === "unavailable" ? collection.reason : "no-results";
  const failed = collection.availability === "unavailable";
  return `<p class="jpdb-reader-help" data-example-reason="${escapeHtml(reason)}">${escapeHtml(uiText(language, failed ? "exampleSourceFailed" : "exampleSourceEmpty"))}</p>`;
}
function definitionSourceStateKey$1(sourceId) {
  return `definition-source:${sourceId}`;
}
function renderProviderExample(example, language) {
  const hasAudio = Boolean(example.audio);
  const translation = example.translation.trim();
  const translationPending = !translation;
  return `
        <li class="${classes("jpdb-reader-jpdb-example", example.itemClassName)}" data-provider-example-id="${escapeHtml(example.id)}">
            <div class="${classes("jpdb-reader-jpdb-example-row", example.rowClassName, hasAudio ? "has-audio" : "")}">
                ${example.audio ? renderProviderExampleAudio(example.audio) : ""}
                <div class="${classes("jpdb-reader-jpdb-example-text", example.textClassName)}">
                    <div class="${classes("jpdb-reader-example-sentence jpdb-reader-parseable", example.sentenceClassName)}" data-provider-example-sentence data-yomu-furigana-mode="all">${example.sentenceHtml}</div>
                    <div class="jpdb-reader-example-translation" data-provider-example-translation data-provider-translation-blurred="true"${translationPending ? ` data-provider-translation-pending="true" data-provider-translation-sentence="${escapeHtml(example.sentence)}" hidden` : ""} role="button" tabindex="0" aria-label="${escapeHtml(uiText(language, "revealTranslation"))}">${escapeHtml(translation)}</div>
                </div>
            </div>
        </li>
    `;
}
function renderProviderExampleAudio(audio) {
  const attributes = Object.entries(audio.attributes).filter(([name]) => /^data-[a-z0-9-]+$/u.test(name)).map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join("");
  const command = providerExampleAudioCommand(audio);
  const capability = command ? privateCommandAttributes(command) : "";
  return `<button class="${classes("jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio", audio.className)}" type="button" data-action="${escapeHtml(audio.action)}"${attributes}${capability} title="${escapeHtml(audio.label)}" aria-label="${escapeHtml(audio.label)}">${speakerIcon()}</button>`;
}
function providerExampleAudioCommand(audio) {
  if (!isProviderExampleCardAction(audio.action)) return null;
  const attributes = audio.attributes;
  return {
  kind: "card-action",
  action: audio.action,
  sentence: attributes["data-study-sentence"] || attributes["data-jpdb-example-sentence"],
  audioUrl: attributes["data-audio-url"],
  audioIds: attributes["data-jpdb-audio"],
  audioUrls: parsedStringArray(attributes["data-jiten-audio-urls"]),
  jitenSentenceId: finiteInteger(attributes["data-jiten-sentence-id"], 1),
  jitenWordId: finiteInteger(attributes["data-jiten-word-id"], 1),
  jitenReadingIndex: finiteInteger(attributes["data-jiten-reading-index"], 0)
  };
}
function isProviderExampleCardAction(value) {
  return value === "jpdb-example-audio" || value === "jiten-audio" || value === "bunpro-audio" || value === "wanikani-audio";
}
function parsedStringArray(value) {
  if (!value) return void 0;
  try {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : void 0;
  } catch {
  return void 0;
  }
}
function finiteInteger(value, minimum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : void 0;
}
function classes(...values) {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join(" ");
}
function definitionSourceStateKey(sourceId) {
  return `definition-source:${sourceId}`;
}
function renderPassiveReference(view) {
  const reading = visibleReferenceReading(view.text, view.reading);
  const identity = Object.entries(view.identityAttributes ?? {}).map(([name, value]) => `${name}="${escapeHtml(value)}"`).join(" ");
  const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : "";
  const identityAttributes = identity ? ` ${identity}` : "";
  const extraClass = view.className?.trim();
  const classes2 = `jpdb-reader-word jpdb-reader-passive-word jpdb-reader-parseable${reading ? " jpdb-reader-has-furi" : ""}${extraClass ? ` ${escapeHtml(extraClass)}` : ""}`;
  const content = reading && view.annotatedReading && /\[[^\]]+\]/.test(view.annotatedReading) ? renderAnnotatedReadingRuby(view.annotatedReading) : renderPassiveReferenceContent(view.text, reading);
  return `<span class="${classes2}" data-jpdb-reader-passive="true"${identityAttributes} data-dictionary="${escapeHtml(view.dictionary)}" data-pitch-class="" data-sentence="${escapeHtml(view.sentence ?? view.text)}" data-expression="${escapeHtml(view.text)}"${readingAttribute} tabindex="-1">${content}</span>`;
}
function renderAnnotatedReadingRuby(value) {
  const source = value.trim();
  if (!source) return "";
  let html = "";
  let offset = 0;
  const regex = /([一-龯々-〇]+)\[([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
  html += escapeHtml(source.slice(offset, match.index));
  html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? "")}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? "")}</rt><rp>)</rp></ruby>`;
  offset = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(offset));
  return html;
}
function renderPassiveReferenceContent(text, reading) {
  return reading ? renderRuby(text, referenceRubyToken(text, reading)) : escapeHtml(text);
}
function referenceRubyToken(text, reading) {
  return {
  card: {
    vid: 0,
    sid: 0,
    rid: 0,
    spelling: text,
    reading,
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ["not-in-deck"],
    pitchAccent: [],
    wordWithReading: null
  },
  start: 0,
  end: text.length,
  length: text.length,
  rubies: [],
  pitchClass: "",
  sentence: text
  };
}
function visibleReferenceReading(text, reading) {
  const normalizedText = text.trim();
  const normalizedReading = reading.trim();
  return normalizedReading && normalizedReading !== normalizedText ? normalizedReading : "";
}
class LruCache {
  constructor(maxSize) {
  this.maxSize = maxSize;
  }
  map = /* @__PURE__ */ new Map();
  get(key) {
  const value = this.map.get(key);
  if (value !== void 0) {
    this.map.delete(key);
    this.map.set(key, value);
  }
  return value;
  }
  set(key, value) {
  this.map.delete(key);
  this.map.set(key, value);
  if (this.map.size > this.maxSize) {
    const oldest = this.map.keys().next().value;
    if (oldest !== void 0) {
      this.map.delete(oldest);
    }
  }
  }
  clear() {
  this.map.clear();
  }
}
const BUNPRO_EXAMPLE_LIMIT = 10;
async function lookupBunproDefinitionResult(client, card) {
  const raw = await client.search(card.spelling, { grammar: true, vocab: true, limit: 12 });
  const result = selectBunproDefinitionSearch(raw, card.spelling, card.reading, {
  id: card.bunproReviewableId,
  kind: bunproDefinitionKind(card.bunproReviewableType)
  });
  if (!result.info) return result;
  const info = result.info;
  try {
  const detail = await bunproReviewableDetail(client, info);
  applyBunproReviewableDetail(info, detail);
  applyBunproExampleCollection(info, normalizeBunproExampleCollection(detail, info.sourceUrl));
  } catch (error) {
  applyBunproExampleCollection(info, { availability: "unavailable", items: [], reason: bunproExampleFailureReason(error) });
  }
  await resolveBunproUsedInVocab(client, info);
  return { state: "success", info };
}
const BUNPRO_FREQUENCY_LISTS = ["general", "anime", "novels", "netflix", "dictionary"];
function applyBunproReviewableDetail(info, raw) {
  const attributes = objectRecord(objectRecord(objectRecord(raw)?.data)?.attributes);
  if (!attributes) return;
  info.pitchAccentStress = textValue(attributes.pitch_accent_stress);
  info.frequencies = BUNPRO_FREQUENCY_LISTS.map((list) => ({ list, rank: numberValue(attributes[`frequency_${list}`]) })).filter((entry) => entry.rank > 0);
  info.relatedWords = bunproJmdictRelatedWords(attributes.jmdict_data, info);
  info.caution = stripBunproMarkup(textValue(attributes.caution));
  info.register = textValue(attributes.register);
  info.registerTranslation = textValue(attributes.register_translation);
  info.structures = [["polite", attributes.polite_structure], ["casual", attributes.casual_structure]].map(([label, value]) => ({ label, lines: bunproStructureLines(textValue(value)) })).filter((entry) => entry.lines.length);
  info.relatedGrammar = uniqueRelatedGrammar([
  bunproRelatedGrammarPoint(attributes.previous_grammar_point),
  bunproRelatedGrammarPoint(attributes.next_grammar_point)
  ]).filter((entry) => entry.id !== info.id);
  info.coverageVocabIds = bunproCoverageVocabIds(attributes.coverage_vocab_ids);
}
function bunproCoverageVocabIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => numberValue(value)).filter((id) => id > 0).slice(0, 50);
}
const BUNPRO_USED_IN_LIMIT = 5;
const BUNPRO_USED_IN_TIMEOUT_MS = 4e3;
const bunproUsedInVocabCache = new LruCache(200);
async function resolveBunproUsedInVocab(client, info) {
  if (info.kind !== "grammar") return;
  const ids = info.coverageVocabIds.slice(0, BUNPRO_USED_IN_LIMIT);
  if (!ids.length) return;
  const resolved = await Promise.race([
  Promise.all(ids.map((id) => bunproUsedInVocabEntry(client, id))),
  new Promise((resolve) => setTimeout(() => resolve(null), BUNPRO_USED_IN_TIMEOUT_MS))
  ]);
  if (!resolved) return;
  info.usedInVocab = resolved.filter((entry) => entry !== null);
}
async function bunproUsedInVocabEntry(client, id) {
  const cached = bunproUsedInVocabCache.get(id);
  if (cached) return cached;
  try {
  const attributes = objectRecord(objectRecord(objectRecord(await client.getVocab(id))?.data)?.attributes);
  const kana = textValue(attributes?.kana);
  const text = textValue(attributes?.word) || kana;
  if (!text) return null;
  const entry = {
    id,
    text,
    reading: kana && kana !== text ? kana : "",
    meaning: stripBunproMarkup(textValue(attributes?.meaning))
  };
  bunproUsedInVocabCache.set(id, entry);
  return entry;
  } catch {
  return null;
  }
}
function bunproJmdictRelatedWords(raw, info) {
  const senses = objectRecord(raw)?.sense;
  if (!Array.isArray(senses)) return [];
  const seen = /* @__PURE__ */ new Set([info.expression, info.reading]);
  const related = [];
  for (const sense of senses) {
  const record2 = objectRecord(sense);
  for (const relation of ["related", "antonym"]) {
    for (const reference of Array.isArray(record2?.[relation]) ? record2[relation] : []) {
      const text = textValue(Array.isArray(reference) ? reference[0] : reference);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      related.push({ text, relation });
    }
  }
  }
  return related.slice(0, 20);
}
function bunproStructureLines(value) {
  return value.split(/<br\s*\/?\s*>|\n/gi).map((line) => stripBunproFurigana(stripBunproMarkup(line)).trim()).filter(Boolean).slice(0, 12);
}
function bunproRelatedGrammarPoint(raw) {
  const record2 = objectRecord(raw);
  const id = numberValue(record2?.id);
  const title = textValue(record2?.title);
  if (!id || !title) return null;
  return { id, title, slug: textValue(record2?.slug) || title };
}
function uniqueRelatedGrammar(entries2) {
  const seen = /* @__PURE__ */ new Set();
  return entries2.filter((entry) => {
  if (!entry || seen.has(entry.id)) return false;
  seen.add(entry.id);
  return true;
  });
}
function bunproReviewableDetail(client, info) {
  return info.kind === "vocabulary" ? client.getVocab(info.slug || info.id) : client.getGrammarPoint(info.id);
}
function normalizeBunproExampleCollection(raw, sourceUrl) {
  const included = objectRecord(raw)?.included;
  if (!Array.isArray(included)) return { availability: "unavailable", items: [], reason: "schema" };
  const questions = included.filter((value) => textValue(objectRecord(value)?.type) === "study_question");
  if (!questions.length) return { availability: "empty", items: [] };
  const examples = questions.map((value) => bunproExampleSentence(value, sourceUrl)).filter((item) => item !== null).sort((a, b) => a.order - b.order);
  if (!examples.length) return { availability: "unavailable", items: [], reason: "schema" };
  const deduped = dedupeBunproExamples(examples).slice(0, BUNPRO_EXAMPLE_LIMIT).map(({ order: _order, ...example }) => example);
  return { availability: "loaded", items: deduped };
}
function applyBunproExampleCollection(info, collection) {
  info.examples = collection.items;
  info.examplesAvailability = collection.availability;
  info.examplesUnavailableReason = collection.availability === "unavailable" ? collection.reason : "";
}
function bunproExampleSentence(value, sourceUrl) {
  const record2 = objectRecord(value);
  if (textValue(record2?.type) !== "study_question") return null;
  const attributes = objectRecord(record2?.attributes);
  if (!attributes) return null;
  const answer = textValue(attributes.kanji_answer) || textValue(attributes.answer);
  const content = fillBunproClozeContent(textValue(attributes.content), answer);
  const parts = bunproSentenceParts(content);
  const text = stripBunproFurigana(parts.map((part) => part.text).join("")).trim();
  if (!text || !/[぀-ヿ㐀-鿿]/u.test(text)) return null;
  return {
  id: textValue(record2?.id) || textValue(attributes.id) || `example-${Number(attributes.sentence_order) || 0}`,
  parts,
  text,
  translation: stripBunproMarkup(textValue(attributes.translation)),
  audioUrls: uniqueText([
    bunproHttpsUrl(textValue(attributes.female_audio_url)),
    bunproHttpsUrl(textValue(attributes.male_audio_url))
  ]),
  source: { provider: "bunpro", url: sourceUrl },
  order: Number(attributes.sentence_order) || 0
  };
}
function dedupeBunproExamples(examples) {
  const unique = /* @__PURE__ */ new Map();
  for (const example of examples) {
  const key = `${normalizedDisplayText(example.text)}\0${normalizedDisplayText(example.translation)}`;
  const current = unique.get(key);
  if (!current) {
    unique.set(key, example);
    continue;
  }
  current.audioUrls = uniqueText([...current.audioUrls, ...example.audioUrls]);
  }
  return Array.from(unique.values());
}
function bunproExampleFailureReason(error) {
  const status = error instanceof BunproApiError ? error.status : httpStatusFromError(error);
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "schema";
  return "network";
}
function fillBunproClozeContent(content, answer) {
  if (!answer || !/_{2,}/u.test(content)) return content;
  return content.replace(/_{2,}/u, `<strong>${answer}</strong>`);
}
function bunproSentenceParts(content) {
  const parts = [];
  content.split(/<strong[^>]*>([\s\S]*?)<\/strong>/gi).forEach((segment, index) => {
  const text = stripBunproMarkup(segment ?? "");
  if (!text) return;
  parts.push({ text, target: index % 2 === 1 });
  });
  return parts;
}
function stripBunproMarkup(value) {
  return decodeBasicEntities(value.replace(/<[^>]*>/g, ""));
}
function decodeBasicEntities(value) {
  return value.replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function bunproHttpsUrl(value) {
  return value.startsWith("https://") ? value : "";
}
function selectBunproDefinitionSearch(raw, expression, reading = "", selection = {}) {
  const candidates = bunproDefinitionCandidates(raw);
  if (!candidates.length) return noBunproMatch("no-results");
  const selectedById = selectBunproDefinitionById(candidates, selection);
  if (selectedById) return selectedById;
  const eligible = selection.kind ? candidates.filter((item) => item.kind === selection.kind) : candidates;
  return selectExactBunproDefinition(eligible, expression, reading);
}
function bunproDefinitionCandidates(raw) {
  return [
  ...searchItems(raw, "vocabs").map((item) => definitionInfo(item, "vocabulary")),
  ...searchItems(raw, "grammar_points").map((item) => definitionInfo(item, "grammar"))
  ].filter((item) => item !== null);
}
function selectBunproDefinitionById(candidates, selection) {
  const expectedId = numberValue(selection.id);
  if (!expectedId) return null;
  const info = candidates.find((item) => item.id === expectedId && (!selection.kind || item.kind === selection.kind));
  return info ? bunproMatch(info) : noBunproMatch("selection-not-found");
}
function selectExactBunproDefinition(candidates, expression, reading) {
  const normalizedExpression = normalizedLookupText(expression);
  const exactExpression = candidates.filter((item) => normalizedLookupText(item.expression) === normalizedExpression);
  if (!exactExpression.length) return noBunproMatch("expression-mismatch");
  return reading ? selectExactBunproReading(exactExpression, reading) : selectUnambiguousBunproDefinition(exactExpression, "ambiguous");
}
function selectExactBunproReading(candidates, reading) {
  const normalizedReading = normalizedLookupText(reading);
  const exactReading = candidates.filter((item) => normalizedLookupText(item.reading) === normalizedReading);
  return exactReading.length ? selectUnambiguousBunproDefinition(exactReading, "ambiguous") : noBunproMatch("reading-mismatch");
}
function selectUnambiguousBunproDefinition(candidates, ambiguousReason) {
  if (candidates.length === 1 || sameDefinitionIdentity(candidates)) return bunproMatch(candidates[0]);
  return noBunproMatch(ambiguousReason);
}
function bunproMatch(info) {
  return { state: "success", info };
}
function noBunproMatch(reason) {
  return { state: "no-match", reason, info: null };
}
function renderBunproDefinitionSource(card, sourceAttributes, info, language, title = "Bunpro") {
  if (!info) return "";
  const japanese = resolveUiLanguage(language) === "ja";
  const registerTag = japanese ? info.register : info.registerTranslation || info.register;
  const details = [
  info.jlptLevel ? `<span class="jpdb-reader-dict-tag">${escapeHtml(info.jlptLevel)}</span>` : "",
  ...info.partOfSpeech.slice(0, 4).map((value) => `<span class="jpdb-reader-dict-tag">${escapeHtml(value)}</span>`),
  registerTag ? `<span class="jpdb-reader-dict-tag">${escapeHtml(registerTag)}</span>` : ""
  ].filter(Boolean).join("");
  const accepted = info.kind === "grammar" ? distinctDisplayText(info.acceptedAnswers, [info.expression, info.reading]).slice(0, 8) : [];
  const nuanceLabel = japanese ? "ニュアンス" : "Nuance";
  const glosses = distinctBunproGlosses(info);
  const extras = `${renderBunproExamples(info, sourceAttributes, language)}${renderBunproUsedInVocab(info, sourceAttributes, language)}${renderBunproRelatedWords(info, sourceAttributes, language)}${renderBunproRelatedGrammar(info, sourceAttributes, language)}`;
  return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-bunpro-definition" data-source="bunpro" ${sourceAttributes(definitionSourceStateKey(BUNPRO_DEFINITION_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <article class="jpdb-reader-local-entry jpdb-reader-local-term">
                ${renderBunproHeadword(card, info)}
                ${details ? `<div class="jpdb-reader-local-tags">${details}</div>` : ""}
                ${glosses.meaning ? `<div class="jpdb-reader-local-senses"><div class="jpdb-reader-local-sense"><span>${escapeHtml(glosses.meaning)}</span></div></div>` : ""}
                ${glosses.nuance.length ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(nuanceLabel)}</strong><div>${glosses.nuance.map(renderBunproGlossText).join("")}</div></div>` : ""}
                ${accepted.length ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, "acceptedInputs"))}</strong><div>${accepted.map(escapeHtml).join(" · ")}</div></div>` : ""}
                ${renderBunproStructures(info, language)}
                ${info.caution ? `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, "bunproCaution"))}</strong><div>${escapeHtml(info.caution)}</div></div>` : ""}
            </article>
            <div class="jpdb-reader-jpdb-extras jpdb-reader-bunpro-extras">${extras}</div>
        </details>
    `;
}
function renderBunproHeadword(card, info, _language) {
  if (repeatsLookupHeadword(card, info)) return "";
  const reference = renderPassiveReference({
  text: info.expression,
  reading: info.reading,
  dictionary: "Bunpro",
  className: "jpdb-reader-bunpro-headword-target"
  });
  return `<div class="jpdb-reader-local-head jpdb-reader-bunpro-headword">${reference}</div>`;
}
function renderBunproGlossText(value) {
  if (!/[぀-ヿ㐀-鿿]/u.test(value)) return `<div>${escapeHtml(value)}</div>`;
  return `<div class="jpdb-reader-parseable">${escapeHtml(stripBunproFurigana(value))}</div>`;
}
function renderBunproStructures(info, language) {
  if (!info.structures.length) return "";
  const blocks = info.structures.map((structure) => `
        <div class="jpdb-reader-bunpro-structure" data-structure="${structure.label}">
            ${structure.lines.map((line) => `<div class="jpdb-reader-parseable">${escapeHtml(line)}</div>`).join("")}
        </div>
    `).join("");
  return `<div class="jpdb-reader-local-glossary"><strong>${escapeHtml(uiText(language, "bunproStructure"))}</strong>${blocks}</div>`;
}
function renderBunproRelatedGroup(stateSuffix, titleKey, rows, sourceAttributes, language) {
  return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-used-in-group" ${sourceAttributes(definitionSourceStateKey(`${BUNPRO_DEFINITION_SOURCE_ID}:${stateSuffix}`), false)}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, titleKey))}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                <ul class="jpdb-reader-jpdb-used-in">${rows}</ul>
            </div>
        </details>
    `;
}
function renderBunproUsedInVocab(info, sourceAttributes, language) {
  if (!info.usedInVocab.length) return "";
  const rows = info.usedInVocab.map((entry) => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.text)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.text)}</span>
                </a>
                ${entry.reading ? `<small lang="ja">${escapeHtml(entry.reading)}</small>` : ""}
                ${entry.meaning ? `<small>${escapeHtml(entry.meaning)}</small>` : ""}
            </span>
        </li>
    `).join("");
  return renderBunproRelatedGroup("used-in", "bunproUsedInVocab", rows, sourceAttributes, language);
}
function renderBunproRelatedWords(info, sourceAttributes, language) {
  if (!info.relatedWords.length) return "";
  const rows = info.relatedWords.map((entry) => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.text)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.text)}</span>
                </a>
                ${entry.relation === "antonym" ? `<small>${escapeHtml(uiText(language, "antonymWord"))}</small>` : ""}
            </span>
        </li>
    `).join("");
  return renderBunproRelatedGroup("related-words", "relatedWords", rows, sourceAttributes, language);
}
function renderBunproRelatedGrammar(info, sourceAttributes, language) {
  if (!info.relatedGrammar.length) return "";
  const rows = info.relatedGrammar.map((entry) => `
        <li class="jpdb-reader-jpdb-used-in-row">
            <span class="jpdb-reader-jpdb-used-in-main">
                <a class="gloss-link jpdb-reader-jpdb-used-in-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="${escapeHtml(entry.title)}" data-dictionary="Bunpro" data-external="false">
                    <span class="jpdb-reader-jpdb-compound-head">${escapeHtml(entry.title)}</span>
                </a>
            </span>
        </li>
    `).join("");
  return renderBunproRelatedGroup("related-grammar", "relatedGrammar", rows, sourceAttributes, language);
}
function renderBunproExamples(info, sourceAttributes, language) {
  const collection = info.examplesAvailability === "loaded" ? { availability: "loaded", items: info.examples } : info.examplesAvailability === "unavailable" ? { availability: "unavailable", items: [], reason: info.examplesUnavailableReason || "schema" } : { availability: "empty", items: [] };
  const view = collection.availability === "loaded" ? { availability: "loaded", items: collection.items.map((example) => bunproExampleView(example, language)) } : collection;
  return renderProviderExamples("bunpro", BUNPRO_DEFINITION_SOURCE_ID, view, sourceAttributes, language);
}
function renderBunproExamplePart(part, sentence) {
  const plain = stripBunproFurigana(part.text);
  if (!part.target) return escapeHtml(plain);
  return renderPassiveReference({
  text: plain,
  reading: bunproAnnotatedKana(part.text),
  dictionary: "Bunpro",
  sentence,
  className: "jpdb-reader-example-target jpdb-reader-bunpro-example-target",
  annotatedReading: bunproBracketAnnotated(part.text)
  });
}
function bunproExampleView(example, language) {
  const audioUrl = example.audioUrls[0] ?? "";
  return {
  id: example.id,
  sentence: example.text,
  sentenceHtml: example.parts.map((part) => renderBunproExamplePart(part, example.text)).join(""),
  translation: example.translation,
  audio: {
    action: "bunpro-audio",
    label: uiText(language, "playAudio"),
    attributes: {
      "data-study-sentence": example.text,
      ...audioUrl ? { "data-audio-url": audioUrl } : {}
    }
  }
  };
}
const BUNPRO_FURIGANA_RE = /([一-龯々-〇]+)（([ぁ-ゖァ-ヺー・]+)）/g;
function stripBunproFurigana(value) {
  BUNPRO_FURIGANA_RE.lastIndex = 0;
  return value.replace(BUNPRO_FURIGANA_RE, "$1");
}
function bunproBracketAnnotated(value) {
  BUNPRO_FURIGANA_RE.lastIndex = 0;
  return value.replace(BUNPRO_FURIGANA_RE, "$1[$2]");
}
function bunproAnnotatedKana(value) {
  BUNPRO_FURIGANA_RE.lastIndex = 0;
  const rendered = value.replace(BUNPRO_FURIGANA_RE, "$2").trim();
  return rendered === value.trim() ? "" : rendered;
}
function definitionInfo(value, kind) {
  const record2 = objectRecord(value);
  const attributes = objectRecord(record2?.attributes) ?? record2;
  if (!attributes) return null;
  const id = numberValue(attributes.id ?? record2?.id);
  const expression = textValue(attributes.title ?? attributes.grammar_point ?? attributes.word);
  if (!id || !expression) return null;
  const reading = textValue(attributes.kana ?? attributes.furigana ?? attributes.reading) || expression;
  const slug = textValue(attributes.slug) || expression;
  return {
  id,
  kind,
  expression,
  reading,
  slug,
  meaning: textValue(attributes.meaning),
  nuance: stripBunproMarkup(textValue(attributes.nuance)),
  nuanceTranslation: stripBunproMarkup(textValue(attributes.nuance_translation)),
  acceptedAnswers: textList(attributes.accepted_answers),
  partOfSpeech: normalizeBunproPartOfSpeech(attributes.jmdict_pos),
  jlptLevel: normalizeBunproJlptLevel(attributes.jlpt_level),
  sourceUrl: kind === "vocabulary" ? `https://bunpro.jp/vocabs/${encodeURIComponent(slug)}` : `https://bunpro.jp/grammar_points/${encodeURIComponent(slug)}`,
  examples: [],
  examplesAvailability: "empty",
  examplesUnavailableReason: "",
  pitchAccentStress: "",
  frequencies: [],
  relatedWords: [],
  caution: "",
  register: "",
  registerTranslation: "",
  structures: [],
  relatedGrammar: [],
  coverageVocabIds: [],
  usedInVocab: []
  };
}
function searchItems(raw, key) {
  const section = objectRecord(objectRecord(raw)?.[key]);
  return Array.isArray(section?.data) ? section.data : [];
}
function repeatsLookupHeadword(card, info) {
  return info.expression === card.spelling && (!card.reading || info.reading === card.reading || info.reading === info.expression);
}
function bunproDefinitionKind(type) {
  if (type === "vocabulary" || type === "grammar") return type;
  return void 0;
}
function normalizedLookupText(value) {
  return value.normalize("NFKC").trim();
}
function normalizeBunproJlptLevel(value) {
  const level = textValue(value).normalize("NFKC").toUpperCase();
  return /^N[1-5]$/u.test(level) ? level : "";
}
function normalizeBunproPartOfSpeech(value) {
  return uniqueText(textList(value).filter((tag) => !/^(?:unc|unclassified)$/iu.test(tag)).map((tag) => formatPartOfSpeech([tag]).trim()).filter((label) => label && !/^unclassified$/iu.test(label)));
}
function distinctBunproGlosses(info) {
  const meaning = info.meaning.trim();
  return {
  meaning,
  nuance: distinctDisplayText([info.nuance, info.nuanceTranslation], meaning ? [meaning] : [])
  };
}
function distinctDisplayText(values, excluded = []) {
  const seen = new Set(excluded.map(normalizedDisplayText).filter(Boolean));
  const result = [];
  for (const value of values) {
  const text = value.trim();
  const key = normalizedDisplayText(text);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  result.push(text);
  }
  return result;
}
function normalizedDisplayText(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}
function uniqueText(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function sameDefinitionIdentity(items) {
  const first = items[0];
  return Boolean(first && items.every((item) => item.id === first.id && item.kind === first.kind));
}
function textList(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  const text = textValue(value);
  return text ? text.split(/[;,]\s*/u).map((item) => item.trim()).filter(Boolean) : [];
}
function textValue(value) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}
function numberValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}
function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
registerYomuCompanion("bunpro", {
  BunproClient,
  BunproWordStateStore,
  createBunproSrsAdapter,
  effectiveBunproWordState,
  installBunproFrontendTokenImporter,
  lookupBunproDefinitionResult,
  renderBunproDefinitionSource
});
})();
