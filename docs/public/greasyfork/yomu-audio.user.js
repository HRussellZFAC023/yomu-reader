(function() {
"use strict";
const APP_NAME = "よむ";
const ACADEMY_SRS_LABEL = "Academy";
const APP_SLUG = "yomu";
const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
const GITHUB_OWNER = "HRussellZFAC023";
const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
const DOCS_ORIGIN = "https://yomureader.com";
const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
class RetryableTimeoutError extends Error {
  constructor(message = "Request timed out.") {
  super(message);
  this.name = "RetryableTimeoutError";
  }
}
function isAppleTouchBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
}
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
  if (host === "uchisen.com") return path.startsWith("/kanji/");
  if (host === "ik.imagekit.io") return path.startsWith("/uchisen/generated/saved/");
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
function bridgeEventId(event) {
  return safeReadString(normalizedBridgeEventDetail$1(event), "id");
}
function bridgeResponseEventDetail(event) {
  const detail = normalizedBridgeEventDetail$1(event);
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
function normalizedBridgeEventDetail$1(event) {
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
const BRIDGE_REQUEST_EVENT$1 = "yomu-userscript-http-request";
const BRIDGE_RESPONSE_EVENT$1 = "yomu-userscript-http-response";
const BRIDGE_PROBE_EVENT = "yomu-userscript-http-probe";
const BRIDGE_PROBE_RESPONSE_EVENT = "yomu-userscript-http-probe-response";
const BRIDGE_MARKER$1 = "yomuUserscriptHttpBridge";
const BRIDGE_TIMEOUT_MS$1 = 3e4;
const USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS = 120;
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
const EVENT_BRIDGE_TAG = Symbol.for("yomu.userscriptEventBridge");
function isUserscriptEventBridgeRequest(request) {
  return typeof request === "function" && request[EVENT_BRIDGE_TAG] === true;
}
function probeUserscriptEventBridge(request) {
  if (!isUserscriptEventBridgeRequest(request)) return Promise.resolve(true);
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (eventBridgeProbeInFlight) return eventBridgeProbeInFlight;
  const probe = new Promise((resolve) => {
  const id = `yomu-probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let settled = false;
  let responseCleanup = noop$1;
  let bridgeReadyCleanup = noop$1;
  const finish = (alive) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    responseCleanup();
    bridgeReadyCleanup();
    if (!alive) {
      const markerDataset = bridgeMarkerDataset$1();
      if (markerDataset?.[BRIDGE_MARKER$1] === "true") delete markerDataset[BRIDGE_MARKER$1];
    }
    resolve(alive);
  };
  const timeout = window.setTimeout(() => finish(false), USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS);
  responseCleanup = addBridgeEventListener$1(BRIDGE_PROBE_RESPONSE_EVENT, (event) => {
    if (bridgeEventId(event) === id) finish(true);
  });
  bridgeReadyCleanup = addBridgeEventListener$1(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => finish(true));
  dispatchBridgeEvent$1(BRIDGE_PROBE_EVENT, { id });
  });
  eventBridgeProbeInFlight = probe;
  void probe.then(() => {
  if (eventBridgeProbeInFlight === probe) eventBridgeProbeInFlight = void 0;
  });
  return probe;
}
function userscriptHttpEventBridge() {
  if (typeof window === "undefined" || typeof document === "undefined") return void 0;
  if (bridgeMarkerDataset$1()?.[BRIDGE_MARKER$1] !== "true") return void 0;
  return tagEventBridgeRequest((options) => new Promise((resolve, reject) => {
  const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const timeout = window.setTimeout(() => {
    cleanup();
    options.ontimeout?.();
    reject(new Error("Request timed out."));
  }, options.timeout ?? BRIDGE_TIMEOUT_MS$1);
  let cleanupBridgeResponseListener = noop$1;
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanupBridgeResponseListener();
  };
  const onResponse = (event) => {
    handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
  };
  cleanupBridgeResponseListener = addBridgeEventListener$1(BRIDGE_RESPONSE_EVENT$1, onResponse);
  const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
  dispatchBridgeEvent$1(BRIDGE_REQUEST_EVENT$1, { id, options: requestOptions });
  }));
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
const BRIDGE_REQUEST_EVENT = "yomu-userscript-storage-request";
const BRIDGE_RESPONSE_EVENT = "yomu-userscript-storage-response";
const BRIDGE_MARKER = "yomuUserscriptStorageBridge";
const BRIDGE_TIMEOUT_MS = 1e4;
function getUserscriptGmStorage() {
  if (typeof window === "undefined" || typeof document === "undefined") return void 0;
  if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== "true") return void 0;
  return {
  getValue: (key, fallback) => storageBridgeRequest({ op: "get", key }).then((detail) => detail.found ? detail.value : fallback),
  setValue: (key, value) => storageBridgeRequest({ op: "set", key, value }).then(() => void 0),
  deleteValue: (key) => storageBridgeRequest({ op: "delete", key }).then(() => void 0),
  listValues: () => storageBridgeRequest({ op: "list" }).then((detail) => detail.keys ?? []),
  clearPrivateManagedValues: () => storageBridgeRequest({ op: "clear-private-managed" }).then(() => void 0)
  };
}
function storageBridgeRequest(request) {
  return new Promise((resolve, reject) => {
  const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error("Storage bridge request timed out."));
  }, BRIDGE_TIMEOUT_MS);
  let cleanupResponseListener = noop;
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanupResponseListener();
  };
  const onResponse = (event) => {
    const detail = storageBridgeResponseDetail(event);
    if (!detail || detail.id !== id) return;
    cleanup();
    if (detail.ok) resolve(detail);
    else reject(new Error(detail.message || "Storage bridge request failed."));
  };
  cleanupResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
  dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, ...request });
  });
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
function normalizedBridgeEventDetail(event) {
  let detail;
  try {
  detail = event.detail;
  } catch {
  return void 0;
  }
  if (typeof detail !== "string") return detail;
  try {
  return JSON.parse(detail);
  } catch {
  return detail;
  }
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
  onTimeout: () => new Error(options.timeoutLabel ?? `${options.failureLabel ?? "Request"} timed out.`)
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
async function requestText(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "text" });
  return typeof value === "string" ? value : String(value ?? "");
}
async function requestBlob(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "blob" });
  if (value instanceof Blob) return value;
  if (isBlobLike(value)) return new Blob([await value.arrayBuffer()], { type: value.type });
  throw new Error(options.blobFailureMessage ?? `${options.failureLabel ?? "Request"} did not return a blob.`);
}
function isBlobLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string");
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
  grammarNoLocalMatch: "No built-in {language} grammar patterns matched this sentence.",
  grammarDetectionPending: "Built-in {language} grammar detection is still being prepared.",
  grammarReferenceOnly: "Built-in {language} grammar detection is still being prepared. Use the reference below.",
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
  grammarShown: "shown",
  grammarKnownHidden: "known hidden",
  grammarGenericShort: "Grammar point: {name}",
  grammarGenericDetail: "Uses {name} in 「{match}」.",
  grammarLevelCore: "Core"
  },
  ja: {
  findingGrammar: "文法を検索中...",
  grammarNoLocalMatch: "内蔵の{language}文法パターンはこの文に一致しませんでした。",
  grammarDetectionPending: "内蔵の{language}文法検出は準備中です。",
  grammarReferenceOnly: "内蔵の{language}文法検出は準備中です。下のリファレンスを利用できます。",
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
  grammarShown: "件表示",
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
  // no control of its own takes its wording in docs/reference/settings.md from
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
  localDictionariesEnabled: "Show imported dictionary definitions",
  localDictionarySiteStorageHelp: "Imported dictionaries are stored by the site where you import them. Other sites answer from Jiten and your online sources.",
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
  localDictionariesEnabled: "インポート済み辞書の定義を表示",
  localDictionarySiteStorageHelp: "インポート済み辞書は、インポートしたサイトに保存されます。他のサイトではJitenなどのオンラインソースが使われます。",
  clearLocalDictionarySiteStorage: "無効にして保存済み辞書を削除",
  clearLocalDictionarySiteStorageConfirm: "インポート済み辞書を無効にし、このサイトの保存コピーを削除しますか？\n\n以前のバージョンのコピーが残っているサイトは、次回訪問時に自動的に削除されます。辞書はいつでも再インポートできます。",
  clearLocalDictionarySiteStorageClearing: "インポート済み辞書を無効にし、このサイトのコピーを削除中...",
  clearLocalDictionarySiteStorageDone: "インポート済み辞書を無効にしました。このサイトのコピーは削除され、他のサイトも訪問時に順次削除されます。"
  }
};
const TARGET_AWARE_UI_COPY = Object.freeze({
  en: Object.freeze({
  puckStudyTarget: "Study {language}",
  puckLearningTarget: `${APP_NAME} — learning target: {language}`,
  puckAutoDetectTargetSubtitles: "Auto-detect {language} subtitles",
  puckFilterYoutubeTarget: "Filter YouTube for {language}",
  popupLanguageAxes: "Reading {target} · Definitions/translation: {output}",
  contextOccurrences: "In context ×{count}",
  loadTargetSubtitles: "Load {language} subtitles",
  loadOutputSubtitles: "Load {language} subtitles",
  readingAnnotations: "Reading annotations",
  hideReadingsFor: "Hide readings for"
  }),
  ja: Object.freeze({
  puckStudyTarget: "{language}を学習",
  puckLearningTarget: `${APP_NAME} — 学習対象：{language}`,
  puckAutoDetectTargetSubtitles: "{language}の字幕を自動検出",
  puckFilterYoutubeTarget: "YouTubeを{language}向けに絞る",
  popupLanguageAxes: "学習対象：{target}・定義/翻訳：{output}",
  contextOccurrences: "文脈内 ×{count}",
  loadTargetSubtitles: "{language}字幕を読み込む",
  loadOutputSubtitles: "{language}字幕を読み込む",
  readingAnnotations: "読みの注釈",
  hideReadingsFor: "読みを隠す対象"
  })
});
const COPY = {
  en: {
  settingsTitle: `${APP_NAME} Settings`,
  welcomeLabel: `${APP_NAME} welcome`,
  onboardingEyebrow: "{language}, wherever it appears",
  onboardingCopy: "Make {language} text, subtitles, and images tappable.",
  onboardingLanguage: "Settings language",
  onboardingOutputLanguage: "Definition and translation language (output)",
  onboardingTargetLanguage: "Language you are reading (target)",
  onboardingAccentColor: "Accent color",
  customAccentColor: "Custom color",
  onboardingImmersionOptions: "Immersion defaults",
  onboardingInstallOfflineDictionaries: "Download starter dictionaries for this language",
  studyTargetReadinessFull: "Full Yomu support",
  // All 33 targets have the whole loop; Japanese differs by DEPTH, not by
  // whether it can be studied. See learning-target-contract.test.ts.
  studyTargetReadinessReadingOnly: "Read, mine and review",
  studyTargetReadinessPlanned: "Planned",
  studyTargetReadinessFullReason: "Everything, including pitch accent, kanji and grammar.",
  studyTargetReadinessReadingOnlyReason: "Reading, lookup, mining and review are ready.",
  studyTargetReadinessPlannedReason: "Support is planned.",
  onboardingHoverShortcut: "Lookup hover modifier",
  manualPageScanShortcut: "Manual page scan shortcut",
  onboardingAddApiKey: "Add API key",
  onboardingUseWithoutApiKey: "Use without API key",
  closeOnboarding: "Close welcome",
  featureText: "Text",
  featureTextBody: "Hover or tap scanned {language}.",
  featureImages: "Images",
  featureImagesBody: "Read any image by tapping it.",
  featureVideo: "Video",
  featureVideoBody: "Make subtitle words tappable.",
  featureControl: "Control",
  featureControlBody: "Tune features, shortcuts, and color.",
  featureStudy: "Study",
  featureStudyBody: "Review words and characters on the study page.",
  featureGame: "Game",
  featureGameBody: "Install the Yomu app to use in games or anywhere on the PC.",
  scanPage: "Scan page",
  noUnscannedJapaneseText: "No unscanned {language} text found.",
  jpdbScanFailed: "Page scan failed.",
  pageCoverageSummary: "{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1",
  settings: "Settings",
  settingsSaved: "Settings saved.",
  settingsSaveFailed: "Settings save failed.",
  settingsCompanionUnavailable: "Settings are unavailable because part of Yomu did not load.",
  firefoxAuthenticationInfoDenied: "Those account details were not saved because Firefox permission was not granted.",
  firefoxAuthenticationInfoExtensionPageRequired: "Firefox can only ask for that permission on a Yomu page. Open Study, then add the account details in Settings.",
  settingsSections: "Settings sections",
  settingsSearch: "Search settings",
  settingsSearchPlaceholder: "Search settings",
  settingsSearchNoResults: "No matches.",
  save: "Save",
  cancel: "Cancel",
  show: "Show",
  hide: "Hide",
  appearance: "Appearance",
  reading: "Reading",
  dictionaries: "Dictionaries",
  sources: "Sources",
  backupSync: "Backup & sync",
  backupSyncHelp: "Save or move your Yomu setup: export and import settings as plain JSON, back up dictionaries, or sync through Google Drive.",
  backupMovedHelp: "Backup, sync, and settings/dictionary import-export live in the Backup & sync section.",
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
  jpdbPageEnhancementsEnabled: "Enhance dictionary pages",
  jpdbPageWordEnhancementsEnabled: "Add sources to word/search pages",
  jpdbPageKanjiEnhancementsEnabled: "Add sources to kanji pages",
  fivePoint: "Five point: NOTHING to EASY",
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
  popoverBackdropEnabled: "Dim page behind popover",
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
  newTabAuto: `Auto: ${ACADEMY_SRS_LABEL}, accounts, then study words`,
  newTabApiSrs: "API SRS (Jiten / JPDB)",
  newTabBunpro: "Bunpro",
  newTabWanikani: "WaniKani",
  newTabYomuLocal: ACADEMY_SRS_LABEL,
  dictionaryFallback: "Dictionary fallback",
  newTabJpdbReviewMode: "API review mode",
  newTabJpdbReviewAuto: "Auto: live kanji + API vocabulary",
  newTabLiveReview: "Live JPDB review session",
  newTabApiVocabulary: "API vocabulary only",
  corsProxyUrl: "Cross-origin proxy URL",
  newTabKanjiKeywordSource: "Kanji keyword source",
  newTabKanjiKeywordAuto: "Auto: RTK, then {service} kanji facts, then local",
  newTabKanjiKeywordRtk: "RTK / Heisig",
  newTabKanjiKeywordApiFacts: "{service} kanji facts (Jiten / JPDB)",
  newTabKanjiKeywordLocal: "Local card meaning",
  newTabParsingEnabled: "Enable sentence parsing on Study",
  newTabFrontSentenceEnabled: "Show sentence on word fronts",
  newTabKanjiAutogradeEnabled: "Auto-grade kanji drawing",
  newTabKanjiAutoSubmit: "Auto-submit kanji grade",
  newTabOfflineEnabled: "Cache Study for offline use",
  newTabOfflineLimit: "Offline review cache limit",
  newTabDailyGoalMinutes: "Daily study goal (minutes, 0 = off)",
  newTabKanjiUnlockEnabled: "Study kanji before unlocking words",
  newTabStopAtBatchEnd: "Stop at the end of each batch",
  newTabSwipeReviews: "Swipe cards to grade (left = fail, right = pass)",
  newTabShortcutHintsEnabled: "Show Study keyboard shortcut hints",
  newTabUrl: "Study address",
  newTabOfflineHelp: "Caches due cards and queued grades.",
  newTabAddressHelp: "Use as a start page or iPad shortcut.",
  newTabJpdbDeck: "Study JPDB deck",
  newTabStudySteps: "Study steps",
  newTabStudyStepsHelp: "Drag to reorder. Turn off steps for faster reviews; Reveal and grading always stay at the end.",
  newTabStudyStepHeader: "Step",
  newTabStudyStepKanji: "Kanji drawing",
  newTabStudyStepWord: "Word meaning",
  newTabStudyStepRecall: "Write in sentence",
  newTabStudyStepListen: "Pitch listening",
  newTabStudyStepSpeaking: "Speaking",
  newTabStudyStepType: "Type the word",
  newTabStudyStepKanjiHelp: "Draw each kanji before the word answer is shown. Carries the word meaning so the blank is never ambiguous; tap Hint for the kanji keyword.",
  newTabStudyStepWordHelp: "{language} front, meaning and reading on reveal.",
  newTabStudyStepRecallHelp: "Type the missing word in the example sentence. Tap Hint for the first kana, then length. Shown only when a card has an example sentence.",
  newTabStudyStepListenHelp: "Hear the word and choose its pitch pattern from the contour options; correctness stays hidden until the final reveal. Shown only when pitch-accent data is available.",
  newTabStudyStepSpeakingHelp: "Shadow the word aloud — your pitch contour is scored against the model on this device. Shown only when audio is available.",
  newTabStudyStepTypeHelp: "Produce the word after hearing and speaking it: type it, or write it kanji by kanji. Skippable in-session.",
  openNewTabPage: "Open Study",
  copyAddress: "Copy address",
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
  pageScanMode: "{language} text on webpages",
  pageScanModeOff: "Leave pages unchanged",
  pageScanModeAuto: "Scan {language} automatically",
  pageScanModeManual: "Scan only when I ask",
  manualScanEnabled: "Manual page scanning",
  ocrInteractionMode: "Image OCR scanning",
  ocrInteractionModeAuto: "Auto",
  ocrInteractionModeManual: "Tap or hover",
  ocrInteractionModeOff: "Off",
  puckMenuLabel: `${APP_NAME} menu`,
  ...TARGET_AWARE_UI_COPY.en,
  puckPauseAnnotations: "Pause annotations",
  puckResumeAnnotations: "Resume annotations",
  puckOcrAuto: "OCR: Auto",
  puckOcrManual: "OCR: Tap/Hover",
  puckOcrOff: "OCR: Off",
  annotationsPausedToast: "Annotations paused.",
  annotationsResumedToast: "Annotations resumed.",
  puckMuteAudio: "Mute auto-play audio",
  puckUnmuteAudio: "Unmute auto-play audio",
  autoplayAudioOnToast: "Auto-play audio on.",
  autoplayAudioOffToast: "Auto-play audio muted.",
  puckHideFurigana: "Hide furigana",
  furiganaOffToast: "Furigana off. Lookups stay active.",
  showFurigana: "Enable furigana annotations",
  furiganaMode: "Furigana",
  wordColorStates: "Color words",
  appearancePreset: "Quick setup",
  appearancePresetCustom: "Keep current custom settings",
  appearancePresetBalanced: "Balanced reading",
  appearancePresetNoColors: "Plain text",
  appearancePresetNewOnly: "Focus on new words",
  appearancePresetUnderlineNew: "Minimal highlights",
  wordColorStatesAll: "Use all learning states",
  wordColorStatesNewOnly: "Only new / not-in-deck words",
  hideFuriganaFor: "Hide furigana for",
  hideColorFor: "Hide color for",
  furiganaDifficultKanji: "Hard kanji only",
  furiganaDifficultKanjiHelp: `${APP_NAME} keeps a fixed beginner kanji list and shows readings on everything outside it. A bare kanji means that character sits on the list.`,
  statusColorNoSourceHelp: `Status colors read from a deck. Enable ${ACADEMY_SRS_LABEL} in Study, or add a JPDB, Jiten, or Anki source, and words take the color of their learning state.`,
  furiganaHideKnown: "Hide familiar words",
  furiganaHoverOnly: "Show on hover",
  furiganaAllParsed: "Show on every parsed word",
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
  similarKanjiWordLimit: "Similar word limit",
  noSimilarWords: "No additional words found.",
  audioEnabled: "Enable term audio",
  autoPlayAudio: "Auto-play term audio",
  suppressAutoAudioOnVideo: "Disable lookup audio on video pages",
  audioAutoPlayMode: "Auto-play trigger",
  audioEnableDefaultSources: "Enable built-in audio sources",
  audioFallbackChimeEnabled: "Enable fallback chime",
  audioSelectionMode: "When several sources or clips exist",
  audioPlayback: "Audio playback",
  firstAudio: "First audio",
  randomAudio: "Shuffle audio",
  audioTtsMode: "Text-to-speech handling",
  audioTtsFallback: "Fallback after recorded audio",
  audioTtsSourceOrder: "Follow source order / shuffle",
  audioTimeoutMs: "Audio timeout (ms)",
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
  audioProxyGuideSummary: "Make your own Cloudflare proxy",
  audioProxyGuideIntro: "Use a Worker when you want a private proxy.",
  audioProxyGuideCloudflare: "Open Cloudflare.",
  audioProxyGuideWorkers: "Open Workers & Pages, then Create.",
  audioProxyGuideCreateWorker: "Choose Worker, name it, deploy.",
  audioProxyGuideEditCode: "Paste the Yomu Worker source.",
  audioProxyGuideDeploy: "Deploy.",
  audioProxyGuideCopyUrl: "Copy the Worker URL.",
  audioProxyGuidePasteUrl: "Paste it into Cross-origin proxy URL.",
  audioProxyGuideTest: "Save, then test lookup/import/audio.",
  audioProxyGuideNote: "Limit hosts before sharing.",
  audioProxyWorkerSource: "Worker source",
  audioProxyDeployGuide: "Deploy guide",
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
  immersionKitCategory: "Immersion Kit category",
  immersionKitSort: "Example order",
  immersionKitLimitEnabled: "Examples per word limit",
  allExamples: "All examples",
  limitExamples: "Limit examples",
  immersionKitLimit: "Examples per word",
  immersionKitMinLength: "Minimum sentence length",
  immersionKitMaxLength: "Maximum sentence length",
  immersionKitPlaybackRate: "Example audio speed",
  immersionKitExactMatch: "Prefer exact matches",
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
  allCategories: "All",
  anime: "Anime",
  drama: "Drama",
  games: "Games",
  shortestFirst: "Shortest first",
  longestFirst: "Longest first",
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
  youtubeImmersionEnabled: "{language} YouTube only",
  preferJapaneseSiteLanguage: "Open {language} versions of sites",
  youtubeShowChannelRecommendations: "Show Japanese channel suggestions",
  youtubeShowFilterNotice: "Show hidden-video notice",
  youtubeHelp: "Filter YouTube for {language} and open {language} versions of sites.",
  youtubeShowHiddenVideos: "Show hidden videos",
  youtubeHideHiddenVideos: "Hide hidden videos",
  youtubeHideNotice: "Hide notice",
  youtubeFilterShowing: "{appName} shows {count} hidden item{plural}",
  youtubeFilterHid: "{appName} hid {count} other-language item{plural}",
  youtubeFilterVisible: "{count} {language} items stayed visible.",
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
  dictionarySourcesInitiallyExpanded: "Open sources by default",
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
  dictionaryImportHelp: "Import a Yomitan ZIP, settings export, or backup. Term, pronunciation (IPA), Japanese pitch, and frequency dictionaries add definitions, pronunciations, pitch accents, and badges.",
  lookupPills: "Lookup pills",
  lookupPillsHelp: "External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.",
  parserProvider: "Parsing source",
  parserProviderLocal: "Local dictionaries (offline)",
  parserProviderJiten: "Jiten API",
  parserProviderJpdb: "JPDB API",
  parserProviderAuto: "Automatic (Jiten/JPDB)",
  parserProviderHelp: "Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic prefers Jiten, then JPDB.",
  offlineDictionarySetupComplete: "Offline dictionaries installed.",
  offlineDictionarySetupFailed: "Offline dictionary setup failed. Retry from Settings → Sources.",
  copiesCurrentWord: "Copies the current word",
  plaintextHttpLink: "Opens over plaintext HTTP.",
  lookupPillLabelNumber: "Lookup pill {number} label",
  lookupUrlTemplate: "Lookup URL template",
  lookupUrlTemplateNumber: "Pill {number} URL",
  lookupPillOrder: "Lookup pill order",
  builtInAction: "Built-in action",
  recommendedDownloads: "Dictionaries",
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
  mirroredDictionaryLanguageNote: "Dictionaries for reading {language}.",
  install: "Install",
  installing: "Installing",
  queued: "Queued",
  dictionaryGuide: "Guide",
  saveAfterInstall: "Save after install",
  download: "Download",
  update: "Update",
  checkingDictionaries: "Checking imported dictionaries...",
  targetDictionaryUnavailable: "Dictionaries for {language} are not available yet.",
  targetDictionaryAvailabilityUnavailable: "Dictionary availability could not be checked.",
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
  dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
  dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
  dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
  dictionaryInstallQueueHelp: "Install a term dictionary first for definitions. Pronunciation (IPA), Japanese pitch, and frequency dictionaries add pronunciations, pitch accents, and badges, not normal definition text.",
  dictionaryInstallQueued: "{dictionary} queued.",
  dictionaryInstallSaveBlocked: "Import running. Save unlocks when done.",
  dictionaryImportQueueStatus: "{count} install{plural} running.",
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
  yomitanSettingsInvalid: "Not a Yomitan settings export.",
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
  batchMiningNoDestination: "Enable JPDB/Jiten API mining or Anki mining first.",
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
  ocrPlayVideo: "Play video",
  ocrPausedFrameScanning: "Scanning...",
  ocrPausedFrameReady: "Text ready",
  ocrPausedFrameNoText: "No text found",
  ocrPausedFrameFailed: "Could not read text",
  ocrRetryScan: "Scan again",
  ocrNoReadableImages: "No readable images nearby.",
  gradeNothing: "Grade NOTHING",
  gradeSomething: "Grade SOMETHING",
  gradeHard: "Grade HARD",
  gradeOkay: "Grade OKAY",
  gradeEasy: "Grade EASY",
  gradeFail: "Pass/fail: FAIL",
  gradePass: "Pass/fail: PASS",
  helpLinksTitle: "Useful pages",
  helpLinksCopy: "Open reader tools and docs from here.",
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
  updateHelpNotesExtensionStore: "You are running the Yomu browser extension. Update opens your browser’s extension store, where installs update automatically and you can trigger a manual update check.",
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
  newTabAddressCopied: "Study address copied.",
  loading: "Loading...",
  reveal: "Reveal",
  revealTranslation: "Reveal translation",
  immersionExampleControls: "Immersion Kit example controls",
  exampleSearchLinks: "Example searches",
  loadingKanjiDetails: "Loading kanji details...",
  loadingMnemonicImages: "Loading mnemonic images...",
  lookupDialog: `${APP_NAME} lookup`,
  resizeLookupSheet: "Drag to resize lookup sheet, or tap to close",
  showMiningActions: "Show mining actions",
  hideMiningActions: "Hide mining actions",
  switchReviewTarget: "Switch review target",
  switchGradingProvider: "Switch grading provider",
  apiGradingProvider: "Preferred grading service",
  apiGradingProviderHelp: "Which service the popover grades when a word exists in both Jiten and JPDB. Bunpro cards grade to Bunpro; the ⇄ toggle next to the grade buttons switches per word.",
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
  gradeSomethingLabel: "Something",
  gradeHardLabel: "Hard",
  bunproGradeAgainLabel: "Again",
  bunproGradeHardLabel: "Hard",
  bunproGradeGoodLabel: "Good",
  bunproGradeEasyLabel: "Easy",
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
  copyWord: "Copy",
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
  addToDeck: "Add to deck",
  deck: "Deck",
  deckActions: "Deck actions",
  reviewAddsToDeck: "Reviewing will add new words to",
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
  gradeJpdbCardTarget: "Grades API SRS card",
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
  jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
  addedToJpdb: "Added to JPDB.",
  jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
  jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
  bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
  wanikaniAddApiKeyRequired: "Add a WaniKani personal access token to review due assignments.",
  yomuLocalSrsDisabled: `Enable ${ACADEMY_SRS_LABEL} in Settings first.`,
  yomuLocalSrsStorageFailed: "Your Academy deck could not be saved. Browser storage may be full. Free some site storage, then try again.",
  chooseJitenStudyDeck: "Choose a Jiten study deck first.",
  addedToJiten: "Added to Jiten.",
  addedToBunpro: "Added to Bunpro.",
  addedToWanikani: "Recorded on WaniKani.",
  addedToYomuLocal: `Added to ${ACADEMY_SRS_LABEL}.`,
  kanjiDetailsUnavailable: "Kanji details are not available yet.",
  loadingDictionaryDetails: "Loading dictionary details...",
  jitenCompositeWords: "Composite words",
  usedInVocabulary: "Used in vocabulary",
  exampleSentences: "Example sentences",
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
  detailsHeader: "Details",
  displayName: "Display name",
  orderHeader: "Order",
  removeHeader: "Remove",
  definitionSource: "Definition source",
  kanjiSection: "Kanji section",
  dragToReorder: "Drag to reorder",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
  removeImportedDictionary: "Remove imported dictionary",
  customAdvanced: "{label} (advanced)",
  importLocalDefinitionsHelp: "Import Yomitan for local definitions.",
  frequencyMetadataHelp: "Frequency, pitch, and kanji metadata for badges.",
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
  sourceHelpUchisen: "Uchisen mnemonic image carousel.",
  sourceHelpWanikaniKanji: "WaniKani kanji meaning/reading mnemonics, level, and SRS status.",
  uchisenMnemonicImages: "Uchisen mnemonic images",
  uchisenMnemonicFor: "Uchisen mnemonic for {kanji}",
  noUchisenImagesYet: "No Uchisen images yet.",
  generateUchisenImage: "Generate image",
  generateUchisenImageToggle: "Generate image +",
  uchisenMnemonicStory: "Mnemonic story",
  uchisenImagePrompt: "Image prompt",
  uchisenGenerateHint: "Edit story/prompt, then publish a Uchisen image.",
  uchisenGeneratingImage: "Generating image...",
  uchisenPublishingMnemonic: "Publishing mnemonic...",
  uchisenGeneratedImage: "Uchisen image published.",
  uchisenGenerateFailed: "Could not generate Uchisen image.",
  uchisenLoginRequired: "Log in to Uchisen to generate images.",
  noStoryAvailable: "No story available",
  sourceHelpImportedKanjiDictionaries: "Imported Yomitan kanji entries.",
  sourceHelpWordsUsingKanji: "Related vocabulary.",
  sourceHelpComponentGraph: "Kanji facts, components, radical images.",
  recommendedJitendex: "Term definitions with examples.",
  recommendedJmdict: "Core term definitions.",
  recommendedJmnedict: "Proper names.",
  recommendedWtyJapaneseJapanese: "Japanese-to-Japanese term definitions.",
  recommendedPixivLight: "Pixiv terms.",
  recommendedKanjidic: "Kanji facts.",
  recommendedJpdbKanji: "JPDB kanji.",
  recommendedKanjiumPitch: "Pitch accents only; add a term dictionary for definitions.",
  recommendedJpdbv2Kana: "Recommended frequency badges from JPDB.",
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
  ...GRAMMAR_UI_COPY.en,
  // D43 interface-locale picker. Yomu is in scope for 33 interface
  // languages and ships two. The picker names the other 31 and says what
  // each is waiting on, because a language that is listed and then
  // silently replaced by English is the worse of the two failures.
  interfaceLocalesReady: "Ready now",
  interfaceLocalesInProgress: "On the way",
  interfaceLocaleRtlPending: "Right-to-left layout checks are still running",
  interfaceLocaleTranslationPending: "Translation is still in progress",
  interfaceLocaleBlockedNote: "These are coming. Each one shows what it is waiting on.",
  interfaceLocaleReadyCount: "{ready} of {total} interface languages are ready."
  }
};
function parseUiCopyTable(rows) {
  const copy = {};
  rows.trim().split("\n").forEach((row) => {
  const tab = row.indexOf("	");
  if (tab < 0) {
    const key = row.trim();
    if (key) copy[key] = "";
    return;
  }
  if (tab === 0) return;
  copy[row.slice(0, tab)] = row.slice(tab + 1).replaceAll("{APP_NAME}", APP_NAME);
  });
  return copy;
}
const JA_COPY = {
  ...parseUiCopyTable(String.raw`
interfaceLocalesReady	今すぐ使えます
interfaceLocalesInProgress	準備中
interfaceLocaleRtlPending	右から左へのレイアウト確認が進行中です
interfaceLocaleTranslationPending	翻訳が進行中です
interfaceLocaleBlockedNote	これらの言語も準備中です。それぞれ何を待っているか表示します。
interfaceLocaleReadyCount	表示言語{total}件のうち{ready}件が使えます。
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	{language}がある場所ならどこでも
onboardingCopy	本文、字幕、画像の{language}をタップ可能にします。
onboardingLanguage	表示言語
onboardingOutputLanguage	定義・翻訳の言語（出力）
onboardingTargetLanguage	ページで読む言語（対象）
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingInstallOfflineDictionaries	この言語のスターター辞書をダウンロード
studyTargetReadinessFull	よむの全機能
studyTargetReadinessReadingOnly	読んで、集めて、復習
studyTargetReadinessPlanned	準備中
studyTargetReadinessFullReason	ピッチアクセント、漢字、文法まですべて使えます。
studyTargetReadinessReadingOnlyReason	読解、検索、マイニング、復習が使えます。
studyTargetReadinessPlannedReason	対応を準備中です。
offlineDictionarySetupComplete	オフライン辞書をインストールしました。
offlineDictionarySetupFailed	オフライン辞書のセットアップに失敗しました。設定→ソースから再試行してください。
onboardingHoverShortcut	ホバー検索の修飾キー
onboardingAddApiKey	APIキーを追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	スキャンした{language}をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と文字を復習。
featureGame	ゲーム
featureGameBody	Yomuアプリをインストールすると、ゲームやPC上のどこでも使えます。
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
settingsCompanionUnavailable	設定を開けません。よむの一部を読み込めませんでした。
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
newTabAddressCopied	学習ページのアドレスをコピーしました。
loading	読み込み中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
exampleSearchLinks	例文検索リンク
loadingKanjiDetails	漢字情報を読み込み中...
loadingMnemonicImages	覚え方画像を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
switchReviewTarget	採点先を切り替える
switchGradingProvider	採点サービスを切り替える
apiGradingProvider	優先採点サービス
apiGradingProviderHelp	JitenとJPDBの両方にある単語をどちらで採点するかの設定です。BunproのカードはBunproで採点されます。採点ボタン横の⇄で単語ごとに切り替えできます。
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
targetDictionaryUnavailable	{language}の辞書はまだ利用できません。
targetDictionaryAvailabilityUnavailable	辞書の提供状況を確認できませんでした。
noLocalDictionariesImported	辞書は未追加です。まず定義用の語句辞書を追加してください。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
storageRuntimeUnavailable	よむの保存機能を利用できません。ページを再読み込みし、解決しない場合はよむを再インストールしてください。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。発音（IPA）/日本語ピッチ/頻度辞書は発音、ピッチアクセント、バッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
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
yomitanSettingsInvalid	Yomitan設定ではありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの{language}テキストはありません。
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
gradeJpdbCardTarget	API SRSカードを採点
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
gradeSomethingLabel	少し
gradeHardLabel	難しい
bunproGradeAgainLabel	もう一度
bunproGradeHardLabel	難しい
bunproGradeGoodLabel	良い
bunproGradeEasyLabel	簡単
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
copyWord	コピー
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
batchMiningNoDestination	JPDB/Jiten API採掘またはAnki採掘を有効にしてください。
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
ocrPlayVideo	動画を再生
ocrPausedFrameScanning	スキャン中...
ocrPausedFrameReady	テキスト準備完了
ocrPausedFrameNoText	テキストが見つかりません
ocrPausedFrameFailed	テキストを読み取れませんでした
ocrRetryScan	再スキャン
ocrNoReadableImages	近くに読み取れる画像がありません。
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
addToDeck	デッキに追加
deck	デッキ
deckActions	デッキ操作
reviewAddsToDeck	レビューすると新しい単語を追加します:
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
jpdbAddApiKeyRequired	JPDB APIキーかAnki追加が必要です。
addedToJpdb	JPDBに追加しました。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
jitenAddApiKeyRequired	Jiten APIキーかAnki追加が必要です。
bunproAddApiKeyRequired	Bunproのfrontend_api_tokenかAnki追加が必要です。
wanikaniAddApiKeyRequired	期限が来た課題を復習するには、WaniKaniのパーソナルアクセストークンを追加してください。
yomuLocalSrsDisabled	先に設定でAcademyを有効にしてください。
yomuLocalSrsStorageFailed	Academyデッキを保存できませんでした。ブラウザーの保存容量が不足している可能性があります。サイトの保存容量を空けてから、もう一度お試しください。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
addedToBunpro	Bunproに追加しました。
addedToWanikani	WaniKaniに記録しました。
addedToYomuLocal	Academyに追加しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
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
  ...GRAMMAR_UI_COPY.ja
};
const JA_SETTINGS_COPY = {
  ...parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
save	保存
cancel	キャンセル
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
backupSync	バックアップと同期
backupSyncHelp	Yomuの設定を保存・移行できます。設定をJSONでエクスポート/インポート、辞書のバックアップ、Google Drive同期に対応しています。
backupMovedHelp	バックアップ・同期・設定/辞書のインポートとエクスポートは「バックアップと同期」セクションにあります。
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
apiCredentialBunpro	Bunpro frontend API token
apiCredentialWanikani	WaniKaniパーソナルアクセストークン
wanikaniTokenHelp	WaniKaniでread/write権限のパーソナルアクセストークンを作成し、ここに貼り付けてください。ブラウザ内にのみ保存され、プロキシを経由せずapi.wanikani.comへ直接送信され、ログに残ることはありません。
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
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
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
fivePoint	5段階: 全然から簡単まで
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
popoverBackdropEnabled	背後を暗くする
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
newTabAuto	自動: Academy・アカウント後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabWanikani	WaniKani
newTabYomuLocal	Academy
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動: ライブ漢字+API語彙
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動: RTK、{service}、ローカル
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabKanjiAutoSubmit	漢字評価を自動送信
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabShortcutHintsEnabled	学習のキーボードショートカットヒントを表示
newTabUrl	学習ページのアドレス
newTabOfflineHelp	カードと未送信採点を保存。
newTabAddressHelp	新規タブやiPadホーム画面用。
newTabJpdbDeck	学習のJPDBデッキ
newTabStudySteps	学習ステップ
newTabStudyStepsHelp	ドラッグで並べ替え。速く復習したいステップはオフにできます。表示と採点は常に最後です。
newTabStudyStepHeader	ステップ
newTabStudyStepKanji	漢字書き取り
newTabStudyStepWord	単語の意味
newTabStudyStepRecall	文で書く
newTabStudyStepListen	ピッチ聞き取り
newTabStudyStepSpeaking	発音
newTabStudyStepType	単語を書く
newTabStudyStepKanjiHelp	答えが出る前に各漢字を書きます。単語の意味を表示するので空欄が曖昧になりません。ヒントで漢字キーワードを出せます。
newTabStudyStepWordHelp	表は{language}、表示後に意味と読み。
newTabStudyStepRecallHelp	例文の空欄に単語を入力します。ヒントで最初の音、次に長さを表示。例文があるカードのみ表示。
newTabStudyStepListenHelp	音声を聞き、型の候補からピッチ型を選びます。正誤は最後の答え合わせまで表示しません。ピッチアクセント情報がある時のみ表示。
newTabStudyStepSpeakingHelp	単語をシャドーイングします。ピッチの高低をこの端末でお手本と比較して採点します。音声がある時のみ表示。
newTabStudyStepTypeHelp	聞いて発音した単語を書き出します。入力または漢字ごとの手書きで解答できます。セッション中はスキップ可能。
openNewTabPage	学習を開く
copyAddress	アドレスをコピー
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
pageScanMode	ウェブページの{language}
pageScanModeOff	ページを変更しない
pageScanModeAuto	{language}を自動で検出
pageScanModeManual	指示したときだけ{language}を検出
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckPauseAnnotations	注釈を一時停止
puckResumeAnnotations	注釈を再開
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
annotationsPausedToast	注釈を一時停止しました。
annotationsResumedToast	注釈を再開しました。
puckMuteAudio	音声の自動再生をミュート
puckUnmuteAudio	音声の自動再生のミュートを解除
puckHideFurigana	ふりがなを隠す
furiganaOffToast	ふりがなを非表示にしました。単語の検索は引き続き使えます。
autoplayAudioOnToast	音声の自動再生をオンにしました。
autoplayAudioOffToast	音声の自動再生をミュートしました。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePreset	かんたん設定
appearancePresetCustom	現在のカスタム設定を保持
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
furiganaAllParsed	解析済みの全単語に表示
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
similarKanjiWordLimit	類似語の上限
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	自動再生のきっかけ
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioSelectionMode	複数音声があるとき
audioPlayback	音声再生
firstAudio	最初の音声
randomAudio	シャッフル音声
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
audioTimeoutMs	音声タイムアウト (ms)
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
audioProxyGuideSummary	Cloudflareプロキシ
audioProxyGuideIntro	専用プロキシにはWorkerを使います。
audioProxyGuideCloudflare	Cloudflareを開きます。
audioProxyGuideWorkers	Workers & PagesでCreateします。
audioProxyGuideCreateWorker	Workerを選び、名前を付けてDeploy。
audioProxyGuideEditCode	Yomu Workerソースを貼ります。
audioProxyGuideDeploy	Deployします。
audioProxyGuideCopyUrl	Worker URLをコピーします。
audioProxyGuidePasteUrl	Cross-origin proxy URLに貼ります。
audioProxyGuideTest	保存後、検索・インポート・音声で確認。
audioProxyGuideNote	共有前にホストを絞ります。
audioProxyWorkerSource	Workerソース
audioProxyDeployGuide	デプロイガイド
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
immersionKitCategory	例文ソース
immersionKitSort	例文の並び順
immersionKitLimitEnabled	単語ごとの例文数制限
allExamples	すべての例文
limitExamples	例文数を制限
immersionKitLimit	単語ごとの例文数
immersionKitMinLength	最小文長
immersionKitMaxLength	最大文長
immersionKitPlaybackRate	例文音声速度
immersionKitExactMatch	完全一致を優先
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
allCategories	すべて
anime	アニメ
drama	ドラマ
games	ゲーム
shortestFirst	短い順
longestFirst	長い順
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
youtubeImmersionEnabled	{language}のYouTubeのみ
preferJapaneseSiteLanguage	{language}版のサイトを開く
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	YouTubeを{language}向けに絞り、{language}版のサイトを開きます。
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は他の言語のYouTube項目{count}件を非表示
youtubeFilterVisible	{language}らしい項目{count}件は表示したままです。
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
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
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
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/発音（IPA）/日本語ピッチ/頻度辞書で定義、発音、ピッチアクセント、バッジを追加します。
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
plaintextHttpLink	プレーンテキストHTTPで開きます。
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
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
mirroredDictionaryLanguageNote	{language}を読むための辞書です。
install	インストール
installing	インストール中
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
helpLinksCopy	リーダーツールとドキュメントをここから開けます。
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
updateHelpNotesExtensionStore	よむのブラウザ拡張機能版を実行中です。「更新」を押すとブラウザの拡張機能ストアが開きます。ストア版は自動的に更新され、手動での更新確認も行えます。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。
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
detailsHeader	詳細
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
kanjiSection	漢字セクション
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
frequencyMetadataHelp	頻度、ピッチ、漢字メタデータをバッジや漢字データに表示。
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
sourceHelpUchisen	Uchisen語呂合わせ画像カルーセルです。
sourceHelpWanikaniKanji	WaniKaniの漢字の意味・読みの覚え方、レベル、SRS状態です。
uchisenMnemonicImages	Uchisen語呂合わせ画像
uchisenMnemonicFor	{kanji}のUchisen語呂合わせ
noUchisenImagesYet	Uchisen画像はまだありません。
generateUchisenImage	画像を生成
generateUchisenImageToggle	画像を生成 +
uchisenMnemonicStory	語呂合わせストーリー
uchisenImagePrompt	画像プロンプト
uchisenGenerateHint	ストーリーとプロンプトを編集し、Uchisen画像を公開します。
uchisenGeneratingImage	画像を生成中...
uchisenPublishingMnemonic	語呂合わせを公開中...
uchisenGeneratedImage	Uchisen画像を公開しました。
uchisenGenerateFailed	Uchisen画像を生成できませんでした。
uchisenLoginRequired	画像生成にはUchisenへのログインが必要です。
noStoryAvailable	ストーリーはありません
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedJmdict	基本語句定義です。
recommendedJmnedict	固有名詞辞書です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedKanjidic	漢字情報です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedJpdbv2Kana	JPDB由来のおすすめ頻度バッジです。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`),
  ...SUBTITLE_SETTINGS_COPY.ja,
  ...TARGET_AWARE_UI_COPY.ja
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
const CORE_COLOR_TOKENS = {
  white: "#ffffff"
};
const BRAND_COLOR_TOKENS = {
  consoleAccent: "#247a58"
};
const LOGGER_COLOR_TOKENS = {
  debug: "#6b7280",
  warn: "#a15c00",
  error: "#b91c1c"
};
const HOSTED_DEMO_VIDEO_SETTINGS_PATCH = {
  showFurigana: true,
  furiganaMode: "all",
  showPitchAccent: true,
  wordUnderlineColorSource: "pitch",
  subtitlePlayerEnabled: true,
  subtitleAutoDetect: true,
  subtitleOverlayVisible: true,
  subtitleControlsMode: "always",
  subtitleTranscriptVisible: false,
  ocrEnabled: true,
  ocrVideoPauseFrames: true,
  ocrProvider: "google-lens",
  ocrOverlayTheme: "auto"
};
new Set(Object.keys(HOSTED_DEMO_VIDEO_SETTINGS_PATCH));
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
  // Cloud settings sync handoff written before an OAuth redirect.
  { owner: "settings/dialog-controller", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
  // App-level signals / flags / caches.
  { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
  { owner: "app/storage epoch", kind: "gm", key: "yomu:state-epoch" },
  { owner: "app/storage epoch slots", kind: "gm", prefix: "yomu:state-slot:v1:" },
  { owner: "app/storage epoch lease", kind: "gm", prefix: "yomu:state-epoch-lease:v1:" },
  { owner: "app/managed-web-storage", kind: "local", key: "yomu:web-storage-epoch:v1:local" },
  { owner: "app/managed-web-storage", kind: "session", key: "yomu:web-storage-epoch:v1:session" },
  { owner: "app/managed-web-storage", kind: "local", prefix: "yomu:web-storage-slot:v1:" },
  { owner: "app/managed-web-storage", kind: "session", prefix: "yomu:web-storage-slot:v1:" },
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
  { owner: "dictionaries/uchisen-carousel", kind: "gm", prefix: "yomu-jpdb-uchisen-index:" },
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
  { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
  { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
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
  if (!isPlainRecord$1(value) || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.resetId !== "string" || !value.resetId.trim() || typeof value.committedAt !== "number" || !Number.isFinite(value.committedAt) || value.committedAt <= 0) {
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
  return isPlainRecord$1(value) && value.__yomuManagedStateEnvelope === MANAGED_STATE_ENVELOPE_VERSION && typeof value.epoch === "string" && Object.hasOwn(value, "value");
}
function isManagedStateEpochSession(value) {
  return Boolean(value && typeof value === "object" && typeof value.current === "function" && typeof value.capture === "function" && typeof value.assertCurrent === "function" && typeof value.resetForTests === "function");
}
function isPlainRecord$1(value) {
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
const FACTORY_RESET_SIGNAL_KEY = "yomu:factory-reset-signal";
const LOCAL_MIRROR_PROVENANCE_KEY = "yomu:local-storage-provenance:v1";
const managedStateEpochSession = managedStateEpochSessionForRealm();
async function assertRealmManagedStateEpoch(getValue) {
  const readEpoch = getValue ? async () => {
  const epoch2 = await authoritativeManagedStateEpoch(getValue);
  return epoch2.generation === 0 ? void 0 : epoch2;
  } : async () => localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0);
  const epoch = await managedStateEpochSession.assertCurrent(readEpoch);
  if (getValue) cacheManagedStateEpochForLocalFallback(epoch);
  return epoch;
}
async function writeManagedGmValue(key, value, epoch, getValue, setValue) {
  await assertManagedStateMutationFence(getValue, epoch);
  const stored = managedStateStoredValue(value, epoch);
  const storageKey = managedStateStorageKey(key, epoch);
  await setValue(storageKey, stored);
  await assertManagedStateMutationFence(getValue, epoch);
}
async function deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue) {
  const storageKey = managedStateStorageKey(key, epoch);
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
  if (isPromiseLike(stored)) return null;
  const shared = parseManagedStateEpoch(isMissingSentinel(stored) ? void 0 : stored);
  managedStateEpochSession.assertCurrentSync(shared.generation === 0 ? void 0 : shared);
  cacheManagedStateEpochForLocalFallback(shared);
  return shared;
}
function managedStateEpochForSynchronousLocalRead() {
  try {
  const getValue = directGmGetValue();
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
function gmStorageGetSync(key, fallback) {
  const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
  let epoch = null;
  if (getValue) {
  epoch = managedStateEpochFromSynchronousGetter(getValue);
  if (!epoch) return fallback;
  const read = gmStorageSyncRead(key, getValue, epoch);
  if (read.kind === "found") return read.value;
  if (read.kind === "deleted") return fallback;
  }
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
  return migratedLocalStorageSyncValue(key, epoch);
  } catch (error) {
  debugStorageError("GM storage sync read failed", key, error);
  return { kind: "fallback" };
  }
}
function migratedLocalStorageSyncValue(key, epoch) {
  if (!localMirrorBelongsToEpoch(key, epoch)) return { kind: "fallback" };
  const migrated = localStorageGet(key, MISSING);
  if (isMissingSentinel(migrated)) return { kind: "fallback" };
  const promoted = sanitizedStrandedLocalValue(key, migrated);
  void gmStorageSet(key, promoted);
  return { kind: "found", value: promoted };
}
function sanitizedStrandedLocalValue(key, value) {
  return value;
}
function localFallbackValueForWrite(key, value) {
  return value;
}
async function gmStorageSet(key, value) {
  const getValue = asyncGmGetValue();
  const setValue = asyncGmSetValue();
  if (setValue) {
  let epoch2;
  try {
    if (!getValue) throw new Error("Managed storage cannot validate its state epoch.");
    epoch2 = await assertRealmManagedStateEpoch(getValue);
    await writeManagedGmValue(key, value, epoch2, getValue, setValue);
    mirrorManagedValueToHostedStorage(key, value, epoch2);
    return;
  } catch (error) {
    if (isStaleManagedStateEpochError(error)) throw error;
    debugStorageError("GM storage write failed", key, error);
    try {
      epoch2 ??= await assertRealmManagedStateEpoch(null);
      writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), epoch2);
    } catch (fallbackError) {
      throw storageWriteError(key, "GM storage and localStorage fallback writes failed", error, fallbackError);
    }
    throw storageWriteError(key, "GM storage write failed; saved only to localStorage fallback", error);
  }
  }
  const epoch = await assertRealmManagedStateEpoch(null);
  writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), epoch);
}
function gmStorageSetSync(key, value) {
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
        mirrorManagedValueToHostedStorage(key, value, epoch);
      }).catch((error) => debugStorageError("GM storage async write failed", key, error));
      return;
    }
    const after = managedStateEpochFromSynchronousGetter(getValue);
    if (!after || !sameManagedStateEpoch(epoch, after)) return;
    mirrorManagedValueToHostedStorage(key, value, epoch);
    return;
  } catch (error) {
    if (isStaleManagedStateEpochError(error)) {
      debugStorageError("Rejected stale managed state write", key, error);
      return;
    }
    debugStorageError("GM storage sync write failed", key, error);
  }
  }
  if ((!getValue || !setValue) && asyncGmSetValue()) {
  void gmStorageSet(key, value).catch((error) => debugStorageError("GM storage async write failed", key, error));
  return;
  }
  try {
  epoch ??= managedStateEpochForSynchronousLocalRead();
  if (!epoch) return;
  writeLocalManagedValueOrThrow(key, localFallbackValueForWrite(key, value), epoch);
  } catch (error) {
  debugStorageError("localStorage sync write failed", key, error);
  }
}
async function gmStorageDelete(key) {
  const getValue = asyncGmGetValue();
  const setValue = asyncGmSetValue();
  const deleteValue = asyncGmDeleteValue();
  const hasBackend = Boolean(getValue || setValue || deleteValue);
  if (hasBackend && !getValue) {
  throw storageWriteError(key, "Managed storage cannot validate and delete the same backend value");
  }
  if (getValue) {
  try {
    const epoch = await assertRealmManagedStateEpoch(getValue);
    await deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue);
  } catch (error) {
    if (isStaleManagedStateEpochError(error)) throw error;
    debugStorageError("GM storage delete failed", key, error);
    throw storageWriteError(key, "GM storage delete failed", error);
  }
  } else {
  await assertRealmManagedStateEpoch(null);
  }
  removeLocalStorageKey(key);
  removeSessionStorageKey(key);
  removeLocalMirrorProvenance(key);
}
function gmStorageDeleteSync(key) {
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
        removeLocalManagedValue(key);
      }).catch((error) => debugStorageError("GM storage async delete failed", key, error));
      return;
    }
    const after = managedStateEpochFromSynchronousGetter(getValue);
    if (!after || !sameManagedStateEpoch(epoch, after)) return;
    removeLocalManagedValue(key);
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
  try {
  if (!managedStateEpochForSynchronousLocalRead()) return;
  removeLocalManagedValue(key);
  } catch (error) {
  debugStorageError("localStorage sync delete failed", key, error);
  }
}
function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
function mirrorManagedValueToHostedStorage(key, value, epoch) {
  if (!shouldMirrorManagedValueToHostedStorage(key)) return;
  try {
  writeLocalManagedValueOrThrow(key, value, epoch);
  } catch (error) {
  debugStorageError("Hosted localStorage mirror failed", key, error);
  }
}
function cacheManagedStateEpochForLocalFallback(epoch) {
  if (epoch.generation <= 0) {
  removeLocalStorageKey(MANAGED_STATE_EPOCH_KEY);
  return;
  }
  try {
  const local = parseManagedStateEpoch(localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0));
  if (sameManagedStateEpoch(local, epoch)) return;
  } catch {
  }
  localStorageSet(MANAGED_STATE_EPOCH_KEY, epoch);
}
function writeLocalManagedValueOrThrow(key, value, epoch) {
  const serialized = localStorageSetOrThrow(key, value);
  recordLocalMirrorProvenance(key, epoch, serialized);
}
function removeLocalManagedValue(key) {
  removeLocalStorageKey(key);
  removeSessionStorageKey(key);
  removeLocalMirrorProvenance(key);
}
function localMirrorBelongsToEpoch(key, epoch) {
  const serialized = localStorageSerializedValue(key);
  if (serialized === null) return false;
  const entry = localMirrorProvenanceRecord()?.values[key];
  if (!entry) return epoch.generation === 0;
  return entry.epoch === managedStateEpochToken(epoch) && entry.fingerprint === localMirrorFingerprint(serialized);
}
function recordLocalMirrorProvenance(key, epoch, serialized) {
  const current = localMirrorProvenanceRecord();
  const next = {
  version: 1,
  values: {
    ...current?.values ?? {},
    [key]: {
      epoch: managedStateEpochToken(epoch),
      fingerprint: localMirrorFingerprint(serialized)
    }
  }
  };
  localStorageSetOrThrow(LOCAL_MIRROR_PROVENANCE_KEY, next);
}
function removeLocalMirrorProvenance(key) {
  const current = localMirrorProvenanceRecord();
  if (!current || !(key in current.values)) return;
  const values = { ...current.values };
  delete values[key];
  if (Object.keys(values).length) localStorageSet(LOCAL_MIRROR_PROVENANCE_KEY, { version: 1, values });
  else removeLocalStorageKey(LOCAL_MIRROR_PROVENANCE_KEY);
}
function localMirrorProvenanceRecord() {
  const value = localStorageGet(LOCAL_MIRROR_PROVENANCE_KEY, null);
  if (!isPlainRecord(value) || value.version !== 1 || !isPlainRecord(value.values)) return null;
  const values = {};
  for (const [key, entry] of Object.entries(value.values)) {
  if (!isPlainRecord(entry) || typeof entry.epoch !== "string" || typeof entry.fingerprint !== "string") continue;
  values[key] = { epoch: entry.epoch, fingerprint: entry.fingerprint };
  }
  return { version: 1, values };
}
function localStorageSerializedValue(key) {
  try {
  return localStorage.getItem(key);
  } catch {
  return null;
  }
}
function localMirrorFingerprint(serialized) {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
  hash ^= serialized.charCodeAt(index);
  hash = Math.imul(hash, 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function shouldMirrorManagedValueToHostedStorage(key) {
  return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key) && isHostedYomuOrigin();
}
function isHostedYomuOrigin() {
  try {
  const host = location.hostname;
  const path = location.pathname;
  if (location.origin === DOCS_ORIGIN) return true;
  if (host === "hrussellzfac023.github.io") return path.startsWith("/yomu-reader/");
  return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) && (path.includes("/study/") || path.includes("/newtab/"));
  } catch {
  return false;
  }
}
function asyncGmGetValue() {
  if (typeof GM_getValue === "function") return GM_getValue;
  const modern = globalThis.GM?.getValue;
  if (typeof modern === "function") return modern.bind(globalThis.GM);
  const extension = extensionStorageArea();
  if (extension) return async (key, fallback) => {
  const value = (await extension.get(key))[key];
  return value === void 0 ? fallback : value;
  };
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}
function directGmGetValue() {
  if (typeof GM_getValue === "function") return GM_getValue;
  const modern = globalThis.GM?.getValue;
  if (typeof modern === "function") return modern.bind(globalThis.GM);
  const extension = extensionStorageArea();
  return extension ? async (key, fallback) => {
  const value = (await extension.get(key))[key];
  return value === void 0 ? fallback : value;
  } : null;
}
function asyncGmSetValue() {
  if (typeof GM_setValue === "function") return GM_setValue;
  const modern = globalThis.GM?.setValue;
  if (typeof modern === "function") return modern.bind(globalThis.GM);
  const extension = extensionStorageArea();
  if (extension) return (key, value) => extension.set({ [key]: value });
  if (directGmGetValue()) return null;
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, value) => bridge.setValue(key, value) : null;
}
function asyncGmDeleteValue() {
  if (typeof GM_deleteValue === "function") return GM_deleteValue;
  const modern = globalThis.GM?.deleteValue;
  if (typeof modern === "function") return modern.bind(globalThis.GM);
  const extension = extensionStorageArea();
  if (extension) return (key) => extension.remove(key);
  if (directGmGetValue()) return null;
  const bridge = getUserscriptGmStorage();
  return bridge ? (key) => bridge.deleteValue(key) : null;
}
function extensionStorageArea() {
  const candidate = globalThis;
  const browser = candidate.browser;
  if (browser?.runtime?.id && browser.storage?.local) return browser.storage.local;
  const chrome = candidate.chrome;
  if (chrome?.runtime?.id && chrome.storage?.local) return chrome.storage.local;
  return null;
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
class ShuffledAudioDeck {
  constructor(random = Math.random) {
  this.random = random;
  }
  bags = /* @__PURE__ */ new Map();
  order(key, ids) {
  if (!ids.length) return ids;
  const signature = ids.join("\0");
  const current = this.bags.get(key);
  if (reusableAudioBag(current, signature)) return audioDeckOrderWithFallbacks(current.remaining, ids);
  const next = this.buildAudioBag(ids, signature, current);
  this.bags.set(key, next);
  return audioDeckOrderWithFallbacks(next.remaining, ids);
  }
  buildAudioBag(ids, signature, current) {
  const remaining = this.shuffle(ids);
  const lastPlayed = current?.lastPlayed;
  rotateRepeatedAudioLead(remaining, lastPlayed);
  return { signature, remaining, lastPlayed };
  }
  markPlayed(key, id) {
  const current = this.bags.get(key);
  if (!current) return;
  removeAudioDeckId(current.remaining, id);
  current.lastPlayed = id;
  }
  markSkipped(key, id) {
  const current = this.bags.get(key);
  if (!current) return;
  removeAudioDeckId(current.remaining, id);
  }
  shuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(this.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
  }
}
function reusableAudioBag(bag, signature) {
  return Boolean(bag && bag.signature === signature && bag.remaining.length);
}
function audioDeckOrderWithFallbacks(remaining, ids) {
  const unplayed = new Set(remaining);
  return [
  ...remaining,
  ...ids.filter((id) => !unplayed.has(id))
  ];
}
function rotateRepeatedAudioLead(ids, lastPlayed) {
  if (lastPlayed && ids.length > 1 && ids[0] === lastPlayed) ids.push(ids.shift());
}
function removeAudioDeckId(ids, id) {
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
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
const JAPANESE_TEXT_RE$1 = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;
function normalizedJapaneseCardReading(spelling, reading) {
  const cleanSpelling = cleanCardHighlightValue(spelling);
  const cleanReading = cleanCardHighlightValue(reading);
  return cleanReading && JAPANESE_TEXT_RE$1.test(cleanReading) ? cleanReading : cleanSpelling;
}
function cleanCardHighlightValue(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
const UNIFIED_IDEOGRAPH_RUN_RE = /\p{Unified_Ideograph}+/gu;
function hanIdeographSegments(text) {
  return [...text.matchAll(UNIFIED_IDEOGRAPH_RUN_RE)].map((match) => ({
  text: match[0],
  start: match.index,
  end: match.index + match[0].length
  }));
}
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
const KANJI_LIKE_WITH_COUNTERS_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}${KANA_COUNTERS}])`;
const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
const JAPANESE_SCRIPT = `${KANA}${KANJI}${ITERATION_MARKS}${HALFWIDTH_KATAKANA}`;
const HAS_JAPANESE = new RegExp(`(?:[${JAPANESE_SCRIPT}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
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
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
const NUMERIC_COUNTER_SUFFIX_SEGMENTS = /* @__PURE__ */ new Set(["話", "巻", "回", "章", "部", "番", "号", "版", "人", "名", "匹", "頭", "羽", "枚", "本", "冊", "個", "台", "件", "分", "秒", "時", "日", "月", "年", "泊", "円"]);
const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
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
function numericRangeImmediatelyBefore(sourceText, start) {
  const before = sourceText.slice(Math.max(0, start - 24), start).replace(/\s+$/u, "");
  return NUMERIC_RANGE_BEFORE_RE.test(before);
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
const SEGMENTER_BY_LOCALE = /* @__PURE__ */ new Map();
function wordSegmenter(locale) {
  const cached = SEGMENTER_BY_LOCALE.get(locale);
  if (cached !== void 0) return cached;
  let segmenter = null;
  try {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  }
  } catch {
  segmenter = null;
  }
  SEGMENTER_BY_LOCALE.set(locale, segmenter);
  return segmenter;
}
function icuWordSegments(text, locale) {
  const segmenter = wordSegmenter(locale);
  if (!segmenter) return null;
  const segments = [];
  for (const segment of segmenter.segment(text)) {
  if (!segment.isWordLike) continue;
  segments.push({
    text: segment.segment,
    start: segment.index,
    end: segment.index + segment.segment.length
  });
  }
  return segments;
}
function normalizeGenericLookupText(text) {
  return text.split(/([\u0e33\u0eb3])/u).map((part) => part === "ำ" || part === "ຳ" ? part : part.normalize("NFKC")).join("").replace(/\s+/gu, " ").trim();
}
function genericLookupTextVariants(text) {
  const source = text.replace(/\s+/gu, " ").trim();
  return [...new Set([normalizeGenericLookupText(source), source].filter(Boolean))];
}
const LOOKUP_CANDIDATE_LIMIT = 12;
function boundedLookupCandidates(text, language, normalizeText, rewrites) {
  const surface = normalizeText(text);
  if (!surface) return [];
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (term, depth, reasons) => {
  if (!term || seen.has(term) || candidates.length >= LOOKUP_CANDIDATE_LIMIT) return;
  seen.add(term);
  candidates.push({ term, rules: [], reasons, depth });
  };
  add(surface, 0, []);
  const folded = localeLowerCase(surface, language);
  const foldedDepth = folded === surface ? 0 : 1;
  add(folded, 1, ["case fold"]);
  for (const legacySurface of genericLookupTextVariants(text).slice(1)) {
  add(legacySurface, 1, ["source-form fallback"]);
  const legacyFolded = localeLowerCase(legacySurface, language);
  add(legacyFolded, 2, ["source-form fallback", "case fold"]);
  }
  for (const rewrite of rewrites) {
  if (candidates.length >= LOOKUP_CANDIDATE_LIMIT) break;
  const rewritten = applyLookupRewrite(folded, rewrite);
  if (rewritten) {
    add(
      rewritten,
      foldedDepth + 1,
      foldedDepth ? ["case fold", rewrite.reason] : [rewrite.reason]
    );
  }
  }
  return candidates;
}
function localeLowerCase(text, language) {
  try {
  return text.toLocaleLowerCase(language);
  } catch {
  return text.toLowerCase();
  }
}
function applyLookupRewrite(term, rewrite) {
  const prefix = rewrite.prefix ?? "";
  const suffix = rewrite.suffix ?? "";
  if (prefix && !term.startsWith(prefix)) return null;
  if (suffix && !term.endsWith(suffix)) return null;
  if (term.length < prefix.length + suffix.length) return null;
  const stem = term.slice(prefix.length, suffix ? -suffix.length : void 0);
  if (rewrite.blockedStemSuffix && stem.endsWith(rewrite.blockedStemSuffix)) return null;
  if ([...stem].length < rewrite.minStemLength) return null;
  return `${rewrite.replacementPrefix ?? ""}${stem}${rewrite.replacementSuffix ?? ""}`;
}
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
const EMPTY_LEARNING_TARGET_GRAMMAR = createLearningTargetGrammar();
const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 10;
const SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS = [10];
function isSupportedLearningTargetModuleInterfaceVersion(value) {
  return SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS.includes(value);
}
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
  const detects = detectorFor(spec.detectsText);
  const normalizeText = spec.normalizeText ?? defaultNormalizeText;
  const segment = spec.segment ?? ((text) => defaultSegment(text, language));
  const grammar = spec.grammar ?? EMPTY_LEARNING_TARGET_GRAMMAR;
  const experiences = learningTargetExperiences(spec);
  return Object.freeze({
  interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
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
  lookupStartsAtSegmentBoundary: spec.lookupStartsAtSegmentBoundary ?? true,
  ...spec.lookupSubsegments ? { lookupSubsegments: spec.lookupSubsegments } : {},
  ...spec.lookupRunSegments ? { lookupRunSegments: spec.lookupRunSegments } : {},
  lookupSweepMode: spec.lookupSweepMode ?? "global-ranked",
  normalizeText,
  isLookupableText(text) {
    return Boolean(text) && detects(text);
  },
  segment,
  pointerWordSegments: spec.pointerWordSegments ?? segment,
  lookupCandidates: spec.lookupCandidates ?? ((text) => boundedLookupCandidates(text, language, normalizeText, spec.lookupRewrites ?? [])),
  compareLookupCandidates: spec.compareLookupCandidates ?? defaultCompareLookupCandidates,
  matchesLookupCandidateRules: spec.matchesLookupCandidateRules ?? defaultMatchesLookupCandidateRules,
  normalizeReading: spec.normalizeReading ?? defaultNormalizeReading
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
  return spec.experiences?.morphology ?? inferredMorphologyExperience(spec);
}
function inferredMorphologyExperience(spec) {
  if (spec.lookupCandidates) return "deinflection";
  return hasBoundedMorphology(spec) ? "bounded-rewrites" : "dictionary-forms";
}
function hasBoundedMorphology(spec) {
  if (spec.lookupRewrites?.length) return true;
  return Boolean(spec.lookupSubsegments);
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
function detectorFor(value) {
  if (typeof value === "function") return value;
  if (value instanceof RegExp) return (text) => value.test(text);
  return () => false;
}
function defaultNormalizeText(text) {
  return normalizeGenericLookupText(text);
}
function defaultSegment(text, language) {
  return icuWordSegments(text, language) ?? whitespaceSegments(text);
}
function whitespaceSegments(text) {
  const segments = [];
  const pattern = /\S+/gu;
  let match = pattern.exec(text);
  while (match) {
  segments.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  match = pattern.exec(text);
  }
  return segments;
}
function defaultCompareLookupCandidates(a, b) {
  return a.depth - b.depth || b.term.length - a.term.length || a.term.localeCompare(b.term);
}
function defaultMatchesLookupCandidateRules(entryRules, candidateRules) {
  if (!candidateRules.length) return true;
  const entryRuleSet = new Set((entryRules ?? "").split(/\s+/u).filter(Boolean));
  return candidateRules.some((rule) => entryRuleSet.has(rule));
}
function defaultNormalizeReading(spelling, reading) {
  return (reading ?? "").trim() || spelling.trim();
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
function createGrammarRegistry() {
  const rules = GRAMMAR_PATTERN_DATA.trim().split("\n").map(parseGrammarRule);
  const ids = new Set(rules.map((rule) => rule.ruleId));
  if (ids.size !== rules.length) throw new TypeError("Yomu grammar registry contains duplicate rule ids.");
  return Object.freeze(rules);
}
const YOMU_GRAMMAR_REGISTRY = createGrammarRegistry();
new Map(YOMU_GRAMMAR_REGISTRY.map((rule) => [rule.ruleId, rule]));
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
const JAPANESE_LEARNING_TARGET = createLearningTargetModule({
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
  detectsText: HAS_JAPANESE,
  normalizeText: normalizeJapaneseTargetText,
  // Japanese writes no word boundaries, so its segmenter infers them. That is
  // good enough to decide where a reading is drawn and not good enough to
  // decide where a dictionary term may begin, which is why the term engine
  // sweeps every position for this target and lets the dictionary arbitrate.
  lookupStartsAtSegmentBoundary: false,
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
const CEFR_GRAMMAR_LEVEL_SCALE = Object.freeze({
  id: "cefr",
  levels: Object.freeze(["A1", "A2", "B1", "B2", "C1", "C2"])
});
const EAQUALS_PDF = "https://www.eaquals.org/wp-content/uploads/Inventaire_ONLINE_full.pdf";
const EAQUALS_A1 = `${EAQUALS_PDF}#page=58`;
const EAQUALS_A1_EXAMPLES = `${EAQUALS_PDF}#page=66`;
const EAQUALS_A1_EXISTENCE = `${EAQUALS_PDF}#page=67`;
const A1_PROGRESSIVE_INFINITIVE = String.raw`(?:manger|préparer|étudier)`;
const A1_NEAR_FUTURE_INFINITIVE = String.raw`(?:manger|regarder|jouer)`;
const A1_RECENT_PAST_INFINITIVE = String.raw`(?:finir|manger)`;
const A1_IL_FAUT_INFINITIVE = String.raw`(?:bien\s+apprendre|apprendre|crier)`;
const A1_POLITE_CONDITIONAL = String.raw`(?:[Jj]e\s+voudrais|[Jj]['’]aimerais|[Oo]n\s+pourrait\s+avoir\s+l['’]addition)`;
const A1_EXISTENTIAL_COMPLEMENT = String.raw`(?:un\s+canapé|un\s+fauteuil|une\s+table|cinq\s+personnes|beaucoup\s+de\s+restaurants|du\s+soleil)`;
const FRENCH_GRAMMAR = createLearningTargetGrammar({
  levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
  referenceUrl: EAQUALS_A1,
  rules: [
  {
    ruleId: "fr-present-progressive",
    level: "A1",
    name: "Present progressive (être en train de)",
    displayNames: { en: "Present progressive (être en train de)", ja: "être en train de ＋ 不定詞" },
    patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+suis|[Tt]u\s+es|[Ii]l\s+est|[Ee]lle\s+est|[Nn]ous\s+sommes|[Vv]ous\s+êtes|[Ii]ls\s+sont|[Ee]lles\s+sont)\s+en\s+train\s+d(?:e\s+|['’])${A1_PROGRESSIVE_INFINITIVE}(?!\p{L})`,
        priority: 10,
        confidence: "high",
        url: EAQUALS_A1_EXAMPLES
      },
      {
        ruleId: "fr-near-future",
        level: "A1",
        name: "Near future (aller + infinitive)",
        displayNames: { en: "Near future (aller + infinitive)", ja: "aller ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+vais|[Tt]u\s+vas|[Ii]l\s+va|[Ee]lle\s+va|[Nn]ous\s+allons|[Vv]ous\s+allez|[Ii]ls\s+vont|[Ee]lles\s+vont)\s+${A1_NEAR_FUTURE_INFINITIVE}(?!\p{L})`,
        priority: 12,
        confidence: "high",
        url: EAQUALS_A1_EXAMPLES
      },
      {
        ruleId: "fr-recent-past",
        level: "A1",
        name: "Recent past (venir de + infinitive)",
        displayNames: { en: "Recent past (venir de + infinitive)", ja: "venir de ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+viens|[Tt]u\s+viens|[Ii]l\s+vient|[Ee]lle\s+vient|[Nn]ous\s+venons|[Vv]ous\s+venez|[Ii]ls\s+viennent|[Ee]lles\s+viennent)\s+d(?:e\s+|['’])${A1_RECENT_PAST_INFINITIVE}(?!\p{L})`,
    priority: 14,
    confidence: "high",
    url: EAQUALS_A1_EXAMPLES
  },
  {
    ruleId: "fr-est-ce-que-question",
    level: "A1",
    name: "Question with est-ce que",
    displayNames: { en: "Question with est-ce que", ja: "est-ce que 疑問文" },
    patternSource: String.raw`(?<!\p{L})[Ee]st-ce\s+qu(?:e(?!\p{L})|['’])`,
        priority: 16,
        confidence: "high",
        url: EAQUALS_A1_EXAMPLES
      },
      {
        ruleId: "fr-ne-pas-negation",
        level: "A1",
        name: "Negation with ne … pas/jamais",
        displayNames: { en: "Negation with ne … pas/jamais", ja: "ne … pas / jamais の否定" },
        patternSource: String.raw`(?<!\p{L})(?:[Jj]e|[Tt]u|[Ii]l|[Ee]lle|[Nn]ous|[Vv]ous|[Ii]ls|[Ee]lles)\s+n(?:e\s+|['’])\p{L}+(?:\s+\p{L}+){0,2}\s+(?:pas|jamais)(?!\p{L})`,
    priority: 18,
    confidence: "high",
    url: EAQUALS_A1_EXAMPLES
  },
  {
    ruleId: "fr-il-faut-infinitive",
    level: "A1",
    name: "Obligation with il faut",
    displayNames: { en: "Obligation with il faut", ja: "il faut ＋ 不定詞" },
    patternSource: String.raw`(?<!\p{L})[Ii]l\s+faut\s+${A1_IL_FAUT_INFINITIVE}(?!\p{L})`,
    priority: 20,
    confidence: "high",
    url: EAQUALS_A1_EXAMPLES
  },
  {
    ruleId: "fr-polite-conditional",
    level: "A1",
    name: "Polite conditional",
    displayNames: { en: "Polite conditional", ja: "丁寧表現の条件法" },
    patternSource: String.raw`(?<!\p{L})${A1_POLITE_CONDITIONAL}(?!\p{L})`,
    priority: 22,
    confidence: "high",
    url: EAQUALS_A1_EXAMPLES
  },
  {
    ruleId: "fr-existential-il-y-a",
    level: "A1",
    name: "Existence with il y a",
    displayNames: { en: "Existence with il y a", ja: "存在を表す il y a" },
    patternSource: String.raw`(?<!\p{L})[Ii]l\s+y\s+a\s+${A1_EXISTENTIAL_COMPLEMENT}(?!\p{L})`,
    priority: 24,
    confidence: "high",
    url: EAQUALS_A1_EXISTENCE
  }
  ]
});
const GOETHE_A1 = "https://lernen.goethe.de/deutschonline/A1/PDF/DE/deutschonline_Ihr_Kurs_im_U%CC%88berblick.pdf";
const DW_A1 = "https://static.dw.com/downloads/59835913/grammatikuebersicht-nicos-weg-a1.pdf";
const GOETHE_GRAMMAR = "https://www.goethe.de/ins/de/de/m/prf/grm.html";
const CLOCK_HOUR = String.raw`(?:(?:[01]?\d|2[0-3])|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)`;
const COLON_TIME = String.raw`(?:[01]?\d|2[0-3]):[0-5]\d`;
const CLOCK_RANGE = String.raw`(?:${CLOCK_HOUR}\s+Uhr\s+bis\s+${CLOCK_HOUR}(?:\s+Uhr)?|${CLOCK_HOUR}\s+bis\s+${CLOCK_HOUR}\s+Uhr|${COLON_TIME}\s+bis\s+${COLON_TIME})`;
const EQUAL_COMPARISON_WORD = String.raw`(?:schlecht|groß|klein|alt|jung|schnell|langsam|hoch|niedrig|lang|kurz)`;
const COMPARISON_SUBJECT = String.raw`(?:der|die|das|ein|eine|einen|einem|einer|mein|meine|dein|deine|sein|seine|ihr|ihre|unser|unsere)\s+\p{L}+`;
const CHECKED_MODAL_INFINITIVE$1 = String.raw`(?:gehen|kommen|sein)`;
const MODAL_CLAUSE_GAP$1 = String.raw`(?:(?![,;:]|(?<!\p{L})(?:aber|dass|denn|oder|sondern|und)(?!\p{L}))[^.!?…\n]){0,80}?`;
const GERMAN_GRAMMAR = createLearningTargetGrammar({
  levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
  referenceUrl: GOETHE_GRAMMAR,
  rules: [
  {
    ruleId: "de-a1-es-gibt",
    level: "A1",
    name: "Existence with es gibt",
    displayNames: { en: "Existence with es gibt", ja: "存在を表す es gibt" },
    patternSource: String.raw`(?<!\p{L})[Ee]s\s+gibt(?!\p{L})`,
    priority: 10,
    confidence: "high",
    url: `${GOETHE_A1}#page=5`
  },
  {
    ruleId: "de-a1-modal-infinitive",
    level: "A1",
    name: "Modal verb + infinitive",
    displayNames: { en: "Modal verb + infinitive", ja: "法助動詞 ＋ 不定詞" },
    patternSource: String.raw`(?<!\p{L})(?:[Kk]ann|[Kk]annst|[Kk]önnen|[Kk]önnt|[Mm]uss|[Mm]usst|[Mm]üssen|[Mm]üsst|[Ww]ill|[Ww]illst|[Ww]ollen|[Ww]ollt)(?!\p{L})${MODAL_CLAUSE_GAP$1}(?<!\p{L})${CHECKED_MODAL_INFINITIVE$1}(?=\s*(?:[.!?…]|$))`,
    priority: 12,
    confidence: "high",
    url: `${GOETHE_A1}#page=7`
  },
  {
    ruleId: "de-a1-von-bis",
    level: "A1",
    name: "Time range with von … bis",
    displayNames: { en: "Time range with von … bis", ja: "von … bis の時間範囲" },
    patternSource: String.raw`(?<!\p{L})[Vv]on\s+${CLOCK_RANGE}(?=\s*(?:[,.!?…]|$))`,
    priority: 14,
    confidence: "high",
    url: `${DW_A1}#page=3`
  },
  {
    ruleId: "de-a1-so-wie",
    level: "A1",
    name: "Equal comparison with so … wie",
    displayNames: { en: "Equal comparison with so … wie", ja: "so … wie の同等比較" },
    patternSource: String.raw`(?<!\p{L})(?:[Ii]st|[Ss]ind|[Ww]ar|[Ww]aren)\s+so\s+${EQUAL_COMPARISON_WORD}\s+wie\s+${COMPARISON_SUBJECT}(?!\p{L})`,
    priority: 16,
    confidence: "high",
    url: `${DW_A1}#page=5`
  },
  {
    ruleId: "de-a1-comparative-als",
    level: "A1",
    name: "Comparison with als",
    displayNames: { en: "Comparison with als", ja: "比較級 ＋ als" },
    patternSource: String.raw`(?<!\p{L})(?:[Bb]esser|[Ss]chlechter|[Mm]ehr|[Ww]eniger|[Gg]rößer|[Kk]leiner|[Ää]lter|[Jj]ünger|[Ss]chneller|[Ll]angsamer|[Hh]öher|[Nn]iedriger|[Ll]änger|[Kk]ürzer)\s+als(?!\p{L})`,
    priority: 18,
    confidence: "high",
    url: `${DW_A1}#page=5`
  },
  {
    ruleId: "de-a1-aber-denn",
    level: "A1",
    name: "Linking clauses with aber or denn",
    displayNames: { en: "Linking clauses with aber or denn", ja: "aber / denn の接続" },
    patternSource: String.raw`[,;]\s*(?:aber|denn)(?!\p{L})`,
    priority: 20,
    confidence: "high",
    url: `${GOETHE_A1}#page=19`
  },
  {
    ruleId: "de-a1-einladen",
    level: "A1",
    name: "Separable einladen",
    displayNames: { en: "Separable einladen", ja: "分離動詞 einladen" },
    patternSource: String.raw`(?<!\p{L})(?:[Ll]ade|[Ll]ädst|[Ll]ädt|[Ll]aden|[Ll]adet)(?!\p{L})[^.!?…\n]{0,80}?(?<!\p{L})ein(?=\s*(?:[.!?…]|$))`,
    priority: 22,
    confidence: "high",
    url: `${GOETHE_A1}#page=8`
  }
  ]
});
const FOUNDATION_LEVEL = "Foundation";
const HSK_STANDARD_COURSE_LEVEL_SCALE = Object.freeze({
  id: "hsk-standard-course",
  levels: Object.freeze(["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"])
});
const YEE_CEFR_BAND_LEVEL_SCALE = Object.freeze({
  id: "tr-yee-cefr-band",
  levels: Object.freeze(["A1–A2"])
});
function foundationScale(id) {
  return Object.freeze({ id, levels: Object.freeze([FOUNDATION_LEVEL]) });
}
function oneRuleGrammar(referenceUrl, levelScale, rule) {
  return createLearningTargetGrammar({ referenceUrl, levelScale, rules: [rule] });
}
function foundationGrammar(targetScaleId, referenceUrl, rule) {
  return oneRuleGrammar(referenceUrl, foundationScale(targetScaleId), {
  ...rule,
  level: FOUNDATION_LEVEL
  });
}
const ALBANIAN_EXISTENTIALS = "https://edizionicafoscari.unive.it/media/pdf/journals/balcania-et-slavia/2024/1/iss-4-1-2024.pdf#page=18";
const CLASSICAL_GREEK_ONLINE = "https://lrc.la.utexas.edu/eieol/grkol/0";
const MSA_NOMINAL_SENTENCES = "https://openbooks.lib.msu.edu/elemarabicll/chapter/grammar-2/";
const CUHK_CANTONESE_NEGATION = "https://www.cuhk.edu.hk/lin/cbrc/CantoneseGrammar/multimedia/13.htm";
const HSK_STANDARD_COURSE_3 = "https://www.hskstandardcourse.com/hsk-standard-course-level-3/";
const PRINCETON_YUELAIYUE = "https://commons.princeton.edu/chinesecharacters/%E8%B6%8A%E6%9D%A5%E8%B6%8A/";
const DANISH_PRESENTATIVE_DER = "https://ordnet.dk/ddo/ordbog/der";
const DUTCH_PRESENTATIVE_ER = "https://onzetaal.nl/taalloket/wel-of-geen-er";
const BRITISH_COUNCIL_THERE = "https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2/using-there-there-are";
const FINNISH_POSSESSION = "https://kielitoimistonohjepankki.fi/ohje/lauseenvastikkeet-tehdakseen-rakenne-pelaan-voittaakseni-rakenteen-tekija/";
const GREEK_NEGATION = "https://www.greek-language.gr/digitalResources/modern_greek/tools/lexica/glossology_edu/iframe.html?heading=2&id=173";
const HUNGARIAN_POSSESSION = "https://www.gutenberg.org/files/76725/76725-h/76725-h.htm";
const INDONESIAN_NEGATIVE_EXISTENTIAL = "https://seasite.niu.edu/flin/archive/103_handouts/sentences_and_phrases.htm";
const ITALIAN_PRESENTATIVE_CI = "https://www.treccani.it/enciclopedia/ci_%28La-grammatica-italiana%29/";
const KHMER_NEGATION = "https://seasite.niu.edu/khmer/grammar_note/grammar_note7/grammar_note7_text.htm";
const KOREAN_DESIRE = "https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=62657";
const LAO_NEGATION = "https://seasite.niu.edu/lao/LaoLanguage/grammar_notes/grammar2.htm";
const LATIN_NEGATIVE_COPULA = "https://www.usu.edu/markdamen/Latin1000/Presentation/transcriptions/04T.pdf";
const MONGOLIAN_NEGATION = "https://library.huree.edu.mn/data/201021/2023-05-19/An%20Elementary%20Mongolian%20Grammar%20%28%20PDFDrive.com%20%29.pdf";
const PERSIAN_NEGATIVE_COPULA = "https://sites.la.utexas.edu/persian_online_resources/verbs/long-copulas-1/";
const POLISH_NEGATIVE_EXISTENTIAL = "https://zpe.gov.pl/a/odmiana-rzeczownika-i-przymiotnika/D1DL299KT";
const PORTUGUESE_EXISTENTIAL_HAVER = "https://ciberduvidas.iscte-iul.pt/consultorio/perguntas/haverexistir/3409";
const ROMANIAN_NECESSITY = "https://slaviccenters.duke.edu/sites/slaviccenters.duke.edu/files/site-images/2016_romanian_verbs_conjugated.pdf";
const CROATIAN_EXISTENTIAL_NEMA = "https://bosnian.coerll.utexas.edu/c8/m2/lekcija1/grammar/";
const SWEDISH_PRESENTATIVE_FINNS = "https://svenska.se/grammatik/";
const TAGALOG_EXISTENTIALS = "https://seasite.niu.edu/trans/tagalog/Grammar%201/Sentences1/Existential_Sentences.htm";
const THAI_COPULAR_NEGATION = "https://seasite.niu.edu/thai/FLTH/1styearthai.htm";
const YEE_A1_A2 = "https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden-turkce.";
const YEE_VAR_YOK = "https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden4/hayatin-icinden4";
const VIETNAMESE_COMPLETION = "https://seasite.niu.edu/vietnamese/uniLesson8/L8_grammar.htm";
const FOUNDATION_GRAMMAR_BY_TARGET = Object.freeze({
  sq: foundationGrammar("sq-foundation", ALBANIAN_EXISTENTIALS, {
  ruleId: "sq-existential-ka-ketu",
  name: "Existence with ka … këtu",
  displayNames: { en: "Existence with ka … këtu", ja: "ka … këtu の存在文" },
  patternSource: String.raw`(?<!\p{L})[Kk]a\s+\p{L}+(?:-\p{L}+)?\s+këtu(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: ALBANIAN_EXISTENTIALS
  }),
  grc: foundationGrammar("grc-classical-foundation", CLASSICAL_GREEK_ONLINE, {
  ruleId: "grc-negation-ou",
  name: "Negation with οὐ",
  displayNames: { en: "Negation with οὐ", ja: "οὐ による否定" },
  patternSource: String.raw`(?<!\p{L})(?:[Οο]ὐ|[Οο]ὐκ|[Οο]ὐχ)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: CLASSICAL_GREEK_ONLINE
  }),
  ar: foundationGrammar("ar-msa-foundation", MSA_NOMINAL_SENTENCES, {
  ruleId: "ar-msa-laysa-negation",
  name: "Nominal negation with laysa",
  displayNames: { en: "Nominal negation with laysa", ja: "laysa（ليس）による名詞文の否定" },
  patternSource: String.raw`(?<!\p{L})(?:ليس|ليست|لست|لسنا|لستم|لستن|ليسا|ليستا|ليسوا|لسن)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: MSA_NOMINAL_SENTENCES
  }),
  yue: foundationGrammar("yue-foundation", CUHK_CANTONESE_NEGATION, {
  ruleId: "yue-copular-negation-m-haih",
  name: "Copular negation with 唔係",
  displayNames: { en: "Copular negation with 唔係", ja: "唔係 によるコピュラ否定" },
  patternSource: String.raw`唔係`,
  priority: 20,
  confidence: "high",
  url: CUHK_CANTONESE_NEGATION
  }),
  zh: oneRuleGrammar(HSK_STANDARD_COURSE_3, HSK_STANDARD_COURSE_LEVEL_SCALE, {
  ruleId: "zh-hsk3-yuelaiyue",
  level: "HSK 3",
  name: "Increasing degree with 越来越",
  displayNames: { en: "Increasing degree with 越来越", ja: "越来越 による程度変化" },
  patternSource: String.raw`(?:越来越|越來越)(?:冷|热|熱|好|忙|难|難|喜欢|喜歡|想)`,
  priority: 20,
  confidence: "high",
  url: PRINCETON_YUELAIYUE
  }),
  da: foundationGrammar("da-foundation", DANISH_PRESENTATIVE_DER, {
  ruleId: "da-presentative-der-er",
  name: "Presentative der er",
  displayNames: { en: "Presentative der er", ja: "der er の存在構文" },
  patternSource: String.raw`(?:^|(?<=[.!?…]\s))[Dd]er\s+er\s+(?:en|et|mange|ingen|to|tre|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: DANISH_PRESENTATIVE_DER
  }),
  nl: foundationGrammar("nl-foundation", DUTCH_PRESENTATIVE_ER, {
  ruleId: "nl-presentative-er-is-zijn",
  name: "Presentative er is / er zijn",
  displayNames: { en: "Presentative er is / er zijn", ja: "er is / er zijn の存在構文" },
  patternSource: String.raw`(?<!\p{L})[Ee]r\s+(?:is|zijn)\s+(?:een|geen|veel|twee|drie|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: DUTCH_PRESENTATIVE_ER
  }),
  en: oneRuleGrammar(BRITISH_COUNCIL_THERE, CEFR_GRAMMAR_LEVEL_SCALE, {
  ruleId: "en-a1-there-is-are",
  level: "A1",
  name: "Existence with there is / there are",
  displayNames: { en: "Existence with there is / there are", ja: "there is / there are の存在文" },
  patternSource: String.raw`(?<!\p{L})[Tt]here\s+(?:is|are)\s+(?:a|an|some|many|no|one|two|three|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: BRITISH_COUNCIL_THERE
  }),
  fi: foundationGrammar("fi-foundation", FINNISH_POSSESSION, {
  ruleId: "fi-adessive-possession",
  name: "Possession with adessive + on",
  displayNames: { en: "Possession with adessive + on", ja: "接格 ＋ on の所有文" },
  patternSource: String.raw`(?<!\p{L})(?:[Mm]inulla|[Ss]inulla|[Hh]änellä|[Mm]eillä|[Tt]eillä|[Hh]eillä)\s+on(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: FINNISH_POSSESSION
  }),
  el: foundationGrammar("el-modern-foundation", GREEK_NEGATION, {
  ruleId: "el-indicative-negation-den",
  name: "Indicative negation with δεν",
  displayNames: { en: "Indicative negation with δεν", ja: "δεν による直説法の否定" },
  patternSource: String.raw`(?<!\p{L})[Δδ]εν\s+\p{L}{2,}(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: GREEK_NEGATION
  }),
  hu: foundationGrammar("hu-foundation", HUNGARIAN_POSSESSION, {
  ruleId: "hu-dative-possession-van",
  name: "Possession with dative + van",
  displayNames: { en: "Possession with dative + van", ja: "与格 ＋ van の所有文" },
  patternSource: String.raw`(?<!\p{L})(?:[Nn]ekem|[Nn]eked|[Nn]eki|[Nn]ekünk|[Nn]ektek|[Nn]ekik)\s+van(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: HUNGARIAN_POSSESSION
  }),
  id: foundationGrammar("id-foundation", INDONESIAN_NEGATIVE_EXISTENTIAL, {
  ruleId: "id-negative-existential-tidak-ada",
  name: "Negative existence with tidak ada",
  displayNames: { en: "Negative existence with tidak ada", ja: "tidak ada の否定存在文" },
  patternSource: String.raw`(?<!\p{L})[Tt]idak\s+ada(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: INDONESIAN_NEGATIVE_EXISTENTIAL
  }),
  it: foundationGrammar("it-foundation", ITALIAN_PRESENTATIVE_CI, {
  ruleId: "it-presentative-ci",
  name: "Presentative c’è / ci sono",
  displayNames: { en: "Presentative c’è / ci sono", ja: "c’è / ci sono の存在構文" },
  patternSource: String.raw`(?<!\p{L})(?:[Cc][’']è|[Cc]i\s+sono)\s+(?:un|uno|una|due|tre|molti|molte|alcuni|alcune)\s+\p{L}+(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: ITALIAN_PRESENTATIVE_CI
    }),
    km: foundationGrammar("km-foundation", KHMER_NEGATION, {
      ruleId: "km-discontinuous-negation",
      name: "Discontinuous negation with មិន … ទេ",
      displayNames: { en: "Discontinuous negation with មិន … ទេ", ja: "មិន … ទេ の呼応否定" },
      patternSource: String.raw`មិន[^\n។៕!?]{1,50}?ទេ`,
      priority: 20,
      confidence: "high",
      url: KHMER_NEGATION
    }),
    ko: foundationGrammar("ko-foundation", KOREAN_DESIRE, {
      ruleId: "ko-desire-go-sipda",
      name: "Desire with -고 싶다",
      displayNames: { en: "Desire with -고 싶다", ja: "-고 싶다（希望）" },
      patternSource: String.raw`[가-힣]{1,8}고\s+싶(?:다|어요|습니다|어|었어요|었다|습니까|니|죠)(?![가-힣])`,
      priority: 20,
      confidence: "high",
      url: KOREAN_DESIRE
    }),
    lo: foundationGrammar("lo-foundation", LAO_NEGATION, {
      ruleId: "lo-preverbal-negation-bo",
      name: "Preverbal negation with ບໍ່",
      displayNames: { en: "Preverbal negation with ບໍ່", ja: "ບໍ່ による動詞・形容詞の否定" },
      patternSource: String.raw`ບໍ່\s*(?:ແມ່ນ|ໄປ|ມາ|ມັກ|ດີ|ງາມ|ຮູ້)`,
      priority: 20,
      confidence: "high",
      url: LAO_NEGATION
    }),
    la: foundationGrammar("la-classical-foundation", LATIN_NEGATIVE_COPULA, {
      ruleId: "la-negative-copula-non-est",
      name: "Negative copula with nōn est",
      displayNames: { en: "Negative copula with nōn est", ja: "nōn est によるコピュラ否定" },
      patternSource: String.raw`(?<!\p{L})[Nn][oō]n\s+est(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: LATIN_NEGATIVE_COPULA
    }),
    mn: foundationGrammar("mn-khalkha-foundation", MONGOLIAN_NEGATION, {
      ruleId: "mn-nominal-negation-bish",
      name: "Nominal negation with биш",
      displayNames: { en: "Nominal negation with биш", ja: "биш による名詞文の否定" },
      patternSource: String.raw`(?<!\p{L})биш(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: MONGOLIAN_NEGATION
    }),
    fa: foundationGrammar("fa-iranian-foundation", PERSIAN_NEGATIVE_COPULA, {
      ruleId: "fa-negative-long-copula",
      name: "Negative long copula",
      displayNames: { en: "Negative long copula", ja: "否定長形コピュラ نیست" },
      patternSource: String.raw`(?<!\p{L})نیست(?:م|ی|یم|ید|ند)?(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: PERSIAN_NEGATIVE_COPULA
    }),
    pl: foundationGrammar("pl-foundation", POLISH_NEGATIVE_EXISTENTIAL, {
      ruleId: "pl-negative-existential-nie-ma",
      name: "Absence or non-possession with nie ma + genitive",
      displayNames: { en: "Absence or non-possession with nie ma + genitive", ja: "nie ma ＋ 生格（不在・非所有）" },
      patternSource: String.raw`(?<!\p{L})[Nn]ie\s+ma(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: POLISH_NEGATIVE_EXISTENTIAL
    }),
    pt: foundationGrammar("pt-foundation", PORTUGUESE_EXISTENTIAL_HAVER, {
      ruleId: "pt-existential-ha",
      name: "Existence with impersonal há",
      displayNames: { en: "Existence with impersonal há", ja: "非人称 há の存在文" },
      patternSource: String.raw`(?<!\p{L})[Hh]á\s+(?:um|uma|dois|duas|três|muitos|muitas|alguns|algumas)\s+(?:pessoas?|problemas?|livros?|casas?|lugares?)(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: PORTUGUESE_EXISTENTIAL_HAVER
    }),
    ro: foundationGrammar("ro-foundation", ROMANIAN_NECESSITY, {
      ruleId: "ro-necessity-trebuie-sa",
      name: "Necessity with trebuie să",
      displayNames: { en: "Necessity with trebuie să", ja: "trebuie să による必要・義務" },
      patternSource: String.raw`(?<!\p{L})[Tt]rebuie\s+să\s+\p{Ll}{2,}(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: ROMANIAN_NECESSITY
    }),
    sh: foundationGrammar("sh-shtokavian-foundation", CROATIAN_EXISTENTIAL_NEMA, {
      ruleId: "sh-existential-nema-genitive",
      name: "Absence or non-possession with nema + genitive",
      displayNames: { en: "Absence or non-possession with nema + genitive", ja: "nema ＋ 生格（不在・非所有）" },
      patternSource: String.raw`(?<!\p{L})[Nn]ema\s+(?:kave|kruha|vode|problema|vremena|ljudi)(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: CROATIAN_EXISTENTIAL_NEMA
    }),
    sv: foundationGrammar("sv-foundation", SWEDISH_PRESENTATIVE_FINNS, {
      ruleId: "sv-presentative-det-finns",
      name: "Presentative det finns",
      displayNames: { en: "Presentative det finns", ja: "det finns の存在構文" },
      patternSource: String.raw`(?<!\p{L})[Dd]et\s+finns\s+(?:en|ett|många|inga|två|tre|\d+)\s+\p{L}+(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: SWEDISH_PRESENTATIVE_FINNS
    }),
    tl: foundationGrammar("tl-tagalog-foundation", TAGALOG_EXISTENTIALS, {
      ruleId: "tl-existential-may-mayroon",
      name: "Existence with may / mayroon",
      displayNames: { en: "Existence with may / mayroon", ja: "may / mayroon の存在文" },
      patternSource: String.raw`(?<!\p{L})(?:[Mm]ay|[Mm]ayroon(?:g)?)\s+(?:isang|mga|dalawang|tatlong|\p{L}{3,})(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: TAGALOG_EXISTENTIALS
    }),
    th: foundationGrammar("th-foundation", THAI_COPULAR_NEGATION, {
      ruleId: "th-copular-negation-mai-chai",
      name: "Copular negation with ไม่ใช่",
      displayNames: { en: "Copular negation with ไม่ใช่", ja: "ไม่ใช่ によるコピュラ否定" },
      patternSource: String.raw`ไม่ใช่`,
      priority: 20,
      confidence: "high",
      url: THAI_COPULAR_NEGATION
    }),
    tr: oneRuleGrammar(YEE_A1_A2, YEE_CEFR_BAND_LEVEL_SCALE, {
      ruleId: "tr-a1-a2-existence-var-yok",
      level: "A1–A2",
      name: "Existence or possession with var / yok",
      displayNames: { en: "Existence or possession with var / yok", ja: "var / yok の存在・所有文" },
      patternSource: String.raw`(?<!\p{L})(?:bir\s+)?\p{L}{2,}\s+(?:var|yok)(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: YEE_VAR_YOK
    }),
    vi: foundationGrammar("vi-foundation", VIETNAMESE_COMPLETION, {
      ruleId: "vi-completed-da-roi",
      name: "Completed action with đã … rồi",
      displayNames: { en: "Completed action with đã … rồi", ja: "đã … rồi の完了表現" },
      patternSource: String.raw`(?<!\p{L})[Đđ]ã\s+[^\n.!?]{1,50}?\s+rồi(?!\p{L})`,
      priority: 20,
      confidence: "high",
      url: VIETNAMESE_COMPLETION
    })
  });
  const RANEPA_A1 = "https://ion.ranepa.ru/upload/medialibrary/bab/DOOP_Russkiy-yazyk-kak-inostrannyy.-Element-uroven-_A1_.-Obshchee-vladenie_450-chas.pdf";
  const CORNELL_GRAMMAR = "https://russian.cornell.edu/grammar/toc.htm";
  const CHECKED_MODAL_INFINITIVE = String.raw`(?:пойти|поехать)`;
  const CHECKED_NECESSITY_INFINITIVE = String.raw`пойти`;
  const CHECKED_WHERE_POSSIBLE_INFINITIVE = String.raw`купить`;
  const MODAL_CLAUSE_GAP = String.raw`(?:(?![,;:]|(?<!\p{L})(?:а|и|или|но|что)(?!\p{L}))[^.!?…\n]){0,60}?`;
  const RUSSIAN_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: CORNELL_GRAMMAR,
    rules: [
      {
        ruleId: "ru-a1-kto-chto-eto",
        level: "A1",
        name: "Кто/что это? identification question",
        displayNames: { en: "Кто/что это? identification question", ja: "кто/что это? の同定疑問文" },
        patternSource: String.raw`^(?:[Кк]то|[Чч]то)\s+это(?=\s*(?:[?？]|$))`,
        priority: 10,
        confidence: "high",
        url: `${RANEPA_A1}#page=19`
      },
      {
        ruleId: "ru-a1-possessive-starter",
        level: "A1",
        name: "Possession with это + possessive",
        displayNames: { en: "Possession with это + possessive", ja: "это ＋ 所有代名詞" },
        patternSource: String.raw`(?<!\p{L})[Ээ]то\s+(?:мой|моя|моё|мое|мои|твой|твоя|твоё|твое|твои|наш|наша|наше|наши|ваш|ваша|ваше|ваши)(?!\p{L})`,
        priority: 12,
        confidence: "high",
        url: `${RANEPA_A1}#page=19`
      },
      {
        ruleId: "ru-a1-request-imperative",
        level: "A1",
        name: "Requests with дай(те), скажи(те), покажи(те)",
        displayNames: { en: "Requests with дай(те), скажи(те), покажи(те)", ja: "дай(те) / скажи(те) / покажи(те) の依頼" },
        patternSource: String.raw`(?<!\p{L})(?:[Дд]айте|[Дд]ай|[Сс]кажите|[Сс]кажи|[Пп]окажите|[Пп]окажи)(?!\p{L})(?:,\s*пожалуйста(?!\p{L}))?`,
        priority: 14,
        confidence: "high",
        url: `${RANEPA_A1}#page=20`
      },
      {
        ruleId: "ru-a1-dative-nravitsya",
        level: "A1",
        name: "нравится with a dative experiencer",
        displayNames: { en: "нравится with a dative experiencer", ja: "与格 ＋ нравится" },
        patternSource: String.raw`(?<!\p{L})(?:[Мм]не|[Тт]ебе|[Вв]ам)\s+нрав(?:ится|ятся)(?!\p{L})`,
        priority: 16,
        confidence: "high",
        url: `${RANEPA_A1}#page=21`
      },
      {
        ruleId: "ru-a1-potomu-chto",
        level: "A1",
        name: "Reason with потому что",
        displayNames: { en: "Reason with потому что", ja: "理由を表す потому что" },
        patternSource: String.raw`(?<!\p{L})[Пп]отому\s+что(?!\p{L})`,
        priority: 18,
        confidence: "high",
        url: `${RANEPA_A1}#page=22`
      },
      {
        ruleId: "ru-a1-gde-mozhno-infinitive",
        level: "A1",
        name: "Где можно + infinitive",
        displayNames: { en: "Где можно + infinitive", ja: "где можно ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})[Гг]де\s+можно\s+${CHECKED_WHERE_POSSIBLE_INFINITIVE}(?!\p{L})`,
        priority: 20,
        confidence: "high",
        url: `${RANEPA_A1}#page=22`
      },
      {
        ruleId: "ru-a1-want-can-infinitive",
        level: "A1",
        name: "хотеть/мочь + infinitive",
        displayNames: { en: "хотеть/мочь + infinitive", ja: "хотеть/мочь ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})(?:[Хх]очу|[Хх]очешь|[Хх]очет|[Хх]отим|[Хх]отите|[Хх]отят|[Мм]огу|[Мм]ожешь|[Мм]ожет|[Мм]ожем|[Мм]ожете|[Мм]огут)(?!\p{L})${MODAL_CLAUSE_GAP}(?<!\p{L})${CHECKED_MODAL_INFINITIVE}(?!\p{L})`,
        priority: 22,
        confidence: "high",
        url: `${RANEPA_A1}#page=23`
      },
      {
        ruleId: "ru-a1-need-infinitive",
        level: "A1",
        name: "Necessity with надо/нужно",
        displayNames: { en: "Necessity with надо/нужно", ja: "надо/нужно で表す必要" },
        patternSource: String.raw`(?<!\p{L})(?:(?:[Мм]не|[Тт]ебе|[Вв]ам|[Ее]му|[Ее]й|[Нн]ам|[Ии]м)\s+)?(?:[Нн]адо|[Нн]ужно)\s+${CHECKED_NECESSITY_INFINITIVE}(?!\p{L})`,
        priority: 24,
        confidence: "high",
        url: `${RANEPA_A1}#page=24`
      }
    ]
  });
  const CERVANTES_A1_A2 = "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/02_gramatica_inventario_a1-a2.htm";
  const SPANISH_INFINITIVE = String.raw`(?:ir|\p{Ll}[\p{L}\p{M}]*(?:ar|er|ir))(?:me|te|se|lo|la|los|las|le|les|nos|os)?`;
  const SPANISH_PARTICIPLE = String.raw`(?:ido|\p{Ll}[\p{L}\p{M}]*(?:ado|ido)|hecho|escrito|visto)`;
  const SPANISH_GERUND = String.raw`(?:yendo|\p{Ll}[\p{L}\p{M}]*(?:ando|iendo|yendo))`;
  const SPANISH_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: CERVANTES_A1_A2,
    rules: [
      {
        ruleId: "es-me-gusta-infinitive",
        level: "A1",
        name: "gustar + infinitive",
        displayNames: { en: "gustar + infinitive", ja: "gustar ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})[Mm]e\s+gusta\s+${SPANISH_INFINITIVE}(?!\p{L})`,
        priority: 10,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p1223a1`
      },
      {
        ruleId: "es-existential-hay",
        level: "A1",
        name: "Existence with hay",
        displayNames: { en: "Existence with hay", ja: "存在を表す hay" },
        patternSource: String.raw`(?<!\p{L})[Hh]ay\s+(?:un(?:a|os|as)?|much(?:o|a|os|as)|poc(?:o|a|os|as)|\d+|(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez))\s+\p{L}+(?!\p{L})`,
        priority: 12,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p133a1`
      },
      {
        ruleId: "es-causal-porque",
        level: "A1",
        name: "Reason with porque",
        displayNames: { en: "Reason with porque", ja: "理由を表す porque" },
        patternSource: String.raw`(?<!\p{L})[Pp]orque(?!\p{L})`,
        priority: 14,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p1534a1`
      },
      {
        ruleId: "es-negation-no",
        level: "A1",
        name: "Verb negation with no",
        displayNames: { en: "Verb negation with no", ja: "no ＋ 動詞" },
        patternSource: String.raw`(?<!\p{L})[Nn]o\s+(?:soy|eres|es|somos|sois|son|estoy|estás|está|estamos|estáis|están|tengo|tienes|tiene|tenemos|tenéis|tienen)(?!\p{L})`,
        priority: 16,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p133a1`
      },
      {
        ruleId: "es-present-perfect",
        level: "A2",
        name: "Present perfect",
        displayNames: { en: "Present perfect", ja: "haber ＋ 過去分詞" },
        patternSource: String.raw`(?<!\p{L})[Hh](?:e|as|a|emos|abéis|an)\s+${SPANISH_PARTICIPLE}(?!\p{L})`,
        priority: 18,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p916a2`
      },
      {
        ruleId: "es-estar-gerundio",
        level: "A2",
        name: "Progressive with estar",
        displayNames: { en: "Progressive with estar", ja: "estar ＋ 現在分詞" },
        patternSource: String.raw`(?<!\p{L})[Ee]st(?:oy|ás|á|amos|áis|án)\s+${SPANISH_GERUND}(?!\p{L})`,
        priority: 20,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p942a2`
      },
      {
        ruleId: "es-tener-que",
        level: "A2",
        name: "Obligation with tener que",
        displayNames: { en: "Obligation with tener que", ja: "tener que ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})[Tt](?:engo|ienes|iene|enemos|enéis|ienen)\s+que\s+${SPANISH_INFINITIVE}(?!\p{L})`,
        priority: 22,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p121a2`
      },
      {
        ruleId: "es-ir-a-infinitive",
        level: "A2",
        name: "Near future with ir a",
        displayNames: { en: "Near future with ir a", ja: "ir a ＋ 不定詞" },
        patternSource: String.raw`(?<!\p{L})[Vv](?:oy|as|a|amos|ais|an)\s+a\s+${SPANISH_INFINITIVE}(?!\p{L})`,
        priority: 24,
        confidence: "high",
        url: `${CERVANTES_A1_A2}#p121a2`
      }
    ]
  });
  const GRAMMAR_BY_TARGET = Object.freeze({
    sq: FOUNDATION_GRAMMAR_BY_TARGET.sq,
    grc: FOUNDATION_GRAMMAR_BY_TARGET.grc,
    ar: FOUNDATION_GRAMMAR_BY_TARGET.ar,
    yue: FOUNDATION_GRAMMAR_BY_TARGET.yue,
    zh: FOUNDATION_GRAMMAR_BY_TARGET.zh,
    da: FOUNDATION_GRAMMAR_BY_TARGET.da,
    nl: FOUNDATION_GRAMMAR_BY_TARGET.nl,
    en: FOUNDATION_GRAMMAR_BY_TARGET.en,
    fi: FOUNDATION_GRAMMAR_BY_TARGET.fi,
    fr: FRENCH_GRAMMAR,
    de: GERMAN_GRAMMAR,
    el: FOUNDATION_GRAMMAR_BY_TARGET.el,
    hu: FOUNDATION_GRAMMAR_BY_TARGET.hu,
    id: FOUNDATION_GRAMMAR_BY_TARGET.id,
    it: FOUNDATION_GRAMMAR_BY_TARGET.it,
    km: FOUNDATION_GRAMMAR_BY_TARGET.km,
    ko: FOUNDATION_GRAMMAR_BY_TARGET.ko,
    lo: FOUNDATION_GRAMMAR_BY_TARGET.lo,
    la: FOUNDATION_GRAMMAR_BY_TARGET.la,
    mn: FOUNDATION_GRAMMAR_BY_TARGET.mn,
    fa: FOUNDATION_GRAMMAR_BY_TARGET.fa,
    pl: FOUNDATION_GRAMMAR_BY_TARGET.pl,
    pt: FOUNDATION_GRAMMAR_BY_TARGET.pt,
    ro: FOUNDATION_GRAMMAR_BY_TARGET.ro,
    ru: RUSSIAN_GRAMMAR,
    sh: FOUNDATION_GRAMMAR_BY_TARGET.sh,
    es: SPANISH_GRAMMAR,
    sv: FOUNDATION_GRAMMAR_BY_TARGET.sv,
    tl: FOUNDATION_GRAMMAR_BY_TARGET.tl,
    th: FOUNDATION_GRAMMAR_BY_TARGET.th,
    tr: FOUNDATION_GRAMMAR_BY_TARGET.tr,
    vi: FOUNDATION_GRAMMAR_BY_TARGET.vi
  });
  function grammarForRosterTarget(language) {
    return GRAMMAR_BY_TARGET[language];
  }
  const KOREAN_SEGMENT_SUFFIXES = [
    "에게서",
    "이라고",
    "으로",
    "에서",
    "에게",
    "한테",
    "까지",
    "부터",
    "처럼",
    "보다",
    "에는",
    "라고",
    "하고",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "와",
    "과",
    "로",
    "도",
    "만"
  ];
  const REWRITES = {
    es: [
      { suffix: "ces", replacementSuffix: "z", minStemLength: 2, reason: "plural suffix" },
      { suffix: "es", minStemLength: 3, reason: "plural suffix" },
      { suffix: "s", minStemLength: 3, reason: "plural suffix" },
      { suffix: "aron", replacementSuffix: "ar", minStemLength: 2, reason: "verb suffix" },
      { suffix: "ando", replacementSuffix: "ar", minStemLength: 2, reason: "verb suffix" },
      { suffix: "ó", replacementSuffix: "ar", minStemLength: 2, reason: "verb suffix" },
      { suffix: "ieron", replacementSuffix: "er", minStemLength: 2, reason: "verb suffix" },
      { suffix: "ieron", replacementSuffix: "ir", minStemLength: 2, reason: "verb suffix" },
      { suffix: "iendo", replacementSuffix: "er", minStemLength: 2, reason: "verb suffix" },
      { suffix: "iendo", replacementSuffix: "ir", minStemLength: 2, reason: "verb suffix" }
    ],
    de: [
      { prefix: "ge", suffix: "t", replacementSuffix: "en", minStemLength: 3, reason: "participle affixes" },
      { suffix: "ten", replacementSuffix: "en", minStemLength: 3, reason: "verb suffix" },
      { suffix: "te", replacementSuffix: "en", minStemLength: 3, reason: "verb suffix" },
      { suffix: "ern", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "en", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "er", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "es", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "e", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "n", minStemLength: 3, reason: "inflection suffix" },
      { suffix: "s", minStemLength: 3, reason: "inflection suffix" }
    ],
    ru: [
      { suffix: "ами", replacementSuffix: "а", minStemLength: 2, reason: "case suffix" },
      { suffix: "ями", replacementSuffix: "я", minStemLength: 2, reason: "case suffix" },
      { suffix: "ого", replacementSuffix: "ый", minStemLength: 2, reason: "case suffix" },
      { suffix: "ого", replacementSuffix: "ий", minStemLength: 2, reason: "case suffix" },
      { suffix: "ую", replacementSuffix: "ый", minStemLength: 2, reason: "case suffix" },
      { suffix: "ая", replacementSuffix: "ый", minStemLength: 2, reason: "case suffix" },
      { suffix: "ом", replacementSuffix: "о", minStemLength: 2, reason: "case suffix" },
      { suffix: "у", replacementSuffix: "а", minStemLength: 2, reason: "case suffix" },
      { suffix: "ы", replacementSuffix: "а", minStemLength: 2, reason: "case suffix" },
      { suffix: "ила", replacementSuffix: "ить", minStemLength: 2, reason: "verb suffix" },
      { suffix: "ала", replacementSuffix: "ать", minStemLength: 2, reason: "verb suffix" }
    ],
    ar: [
      { prefix: "وال", minStemLength: 2, reason: "conjunction and article prefixes" },
      { prefix: "بال", minStemLength: 2, reason: "preposition and article prefixes" },
      { prefix: "لل", minStemLength: 2, reason: "preposition and article prefixes" },
      { prefix: "و", minStemLength: 3, reason: "conjunction prefix" },
      { prefix: "ب", minStemLength: 3, reason: "preposition prefix" },
      { prefix: "ل", minStemLength: 3, reason: "preposition prefix" },
      { prefix: "ال", minStemLength: 3, reason: "article prefix" },
      { suffix: "تها", replacementSuffix: "ة", minStemLength: 2, reason: "pronoun suffix" },
      { suffix: "ها", blockedStemSuffix: "ت", minStemLength: 3, reason: "pronoun suffix" },
      { suffix: "هم", minStemLength: 3, reason: "pronoun suffix" },
      { suffix: "ون", minStemLength: 3, reason: "plural suffix" },
      { suffix: "ين", minStemLength: 3, reason: "plural suffix" }
    ]
  };
  function lookupRewritesForTarget(target) {
    return REWRITES[target] ?? [];
  }
  function koreanLookupSubsegments(segment, maxLength) {
    const candidates = /* @__PURE__ */ new Set();
    if (segment.length <= maxLength) candidates.add(segment);
    for (const suffix of KOREAN_SEGMENT_SUFFIXES) {
      if (!segment.endsWith(suffix)) continue;
      const stem = segment.slice(0, -suffix.length);
      if (stem && stem.length <= maxLength) candidates.add(stem);
    }
    return [...candidates];
  }
  const HAS_HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/u;
  const KOREAN_LEARNING_TARGET = createLearningTargetModule({
    id: "korean-thin-v1",
    language: "ko",
    featureSemantics: {
      characterSystem: "hangul",
      phoneticScripts: ["hangul"],
      pronunciation: "ipa",
      readingAnnotation: "hangul"
    },
    grammar: grammarForRosterTarget("ko"),
    typography: {
      readingAnnotationMode: "ruby"
    },
    subtitles: {
      languageAliases: ["kor", "korean"]
    },
    // ICU returns whole eojeol. A bounded subsegment sweep lets an installed
    // lemma answer inside 학생이 or 우유를 without teaching core Korean grammar.
    lookupStartsAtSegmentBoundary: false,
    lookupSubsegments: koreanLookupSubsegments,
    detectsText: HAS_HANGUL
  });
  const ENGLISH_FALLBACK_MESSAGES = {
    setupTitle: "Set up Yomu in your language",
    learnerLanguageLabel: "Your language",
    targetLanguageLabel: "Language you are learning",
    targetJapanese: "Japanese",
    recommendedDictionariesTitle: "Recommended Japanese dictionaries",
    automaticTranslationLabel: "Translate automatically into {language}",
    dictionaryCountAndSize: "{count, plural, one {# dictionary} other {# dictionaries}} · {size}",
    setupProgress: "Language setup {current} of {total}",
    continueAction: "Continue",
    originalDefinitionLabel: "Original {language}",
    // D43: a locale that is in scope but not yet selectable says why, in its own
    // language, so the person who came looking for it can read the answer. The
    // interface never offers one of these and then quietly speaks English.
    interfaceRtlVerificationPending: "Right-to-left layout checks are still running.",
    interfaceTranslationPending: "Translation is still in progress."
  };
  function defineLocaleCatalog(locale, reviewStatus, messages) {
    return Object.freeze({
      locale,
      reviewStatus,
      sourceLocale: "en",
      messages: Object.freeze(messages)
    });
  }
  defineLocaleCatalog("ar", "machine-draft", {
    setupTitle: "إعداد ⁨よむ⁩ بلغتك",
    learnerLanguageLabel: "لغتك",
    targetLanguageLabel: "اللغة التي تتعلمها",
    targetJapanese: "اليابانية",
    recommendedDictionariesTitle: "قواميس يابانية موصى بها",
    automaticTranslationLabel: "الترجمة تلقائيًا إلى ⁨{language}⁩",
    dictionaryCountAndSize: "{count, plural, one {عدد القواميس: #} other {عدد القواميس: #}} · ⁨{size}⁩",
    setupProgress: "إعداد اللغة: ⁨{current}⁩ من ⁨{total}⁩",
    continueAction: "متابعة",
    originalDefinitionLabel: "التعريف الأصلي باللغة ⁨{language}⁩",
    interfaceRtlVerificationPending: "لا يزال التحقق من التخطيط من اليمين إلى اليسار جاريًا.",
    interfaceTranslationPending: "الترجمة قيد التقدم."
  });
  defineLocaleCatalog("da", "machine-draft", {
    setupTitle: "Opsæt よむ på dit sprog",
    learnerLanguageLabel: "Dit sprog",
    targetLanguageLabel: "Det sprog, du lærer",
    targetJapanese: "Japansk",
    recommendedDictionariesTitle: "Anbefalede japanske ordbøger",
    automaticTranslationLabel: "Oversæt automatisk til {language}",
    dictionaryCountAndSize: "{count, plural, one {# ordbog} other {# ordbøger}} · {size}",
    setupProgress: "Sprogopsætning: {current} af {total}",
    continueAction: "Fortsæt",
    originalDefinitionLabel: "Original på {language}",
    interfaceRtlVerificationPending: "Kontrollen af højre-til-venstre-layout er stadig i gang.",
    interfaceTranslationPending: "Oversættelsen er stadig i gang."
  });
  defineLocaleCatalog("de", "machine-draft", {
    setupTitle: "よむ in deiner Sprache einrichten",
    learnerLanguageLabel: "Deine Sprache",
    targetLanguageLabel: "Sprache, die du lernst",
    targetJapanese: "Japanisch",
    recommendedDictionariesTitle: "Empfohlene Wörterbücher für Japanisch",
    automaticTranslationLabel: "Automatisch auf {language} übersetzen",
    dictionaryCountAndSize: "{count, plural, one {# Wörterbuch} other {# Wörterbücher}} · {size}",
    setupProgress: "Sprache einrichten: {current} von {total}",
    continueAction: "Weiter",
    originalDefinitionLabel: "Originaldefinition auf {language}",
    interfaceRtlVerificationPending: "Die Prüfungen für das Rechts-nach-links-Layout laufen noch.",
    interfaceTranslationPending: "Die Übersetzung läuft noch."
  });
  defineLocaleCatalog("el", "machine-draft", {
    setupTitle: "Ρυθμίστε το よむ στη γλώσσα σας",
    learnerLanguageLabel: "Η γλώσσα σας",
    targetLanguageLabel: "Γλώσσα που μαθαίνετε",
    targetJapanese: "Ιαπωνικά",
    recommendedDictionariesTitle: "Προτεινόμενα λεξικά για τα Ιαπωνικά",
    automaticTranslationLabel: "Αυτόματη μετάφραση στα {language}",
    dictionaryCountAndSize: "{count, plural, one {# λεξικό} other {# λεξικά}} · {size}",
    setupProgress: "Ρύθμιση γλώσσας: {current} από {total}",
    continueAction: "Συνέχεια",
    originalDefinitionLabel: "Πρωτότυπο κείμενο στα {language}",
    interfaceRtlVerificationPending: "Οι έλεγχοι διάταξης από δεξιά προς αριστερά είναι σε εξέλιξη.",
    interfaceTranslationPending: "Η μετάφραση είναι σε εξέλιξη."
  });
  defineLocaleCatalog(
    "en",
    "source-approved",
    ENGLISH_FALLBACK_MESSAGES
  );
  defineLocaleCatalog("es", "machine-draft", {
    setupTitle: "Configura Yomu en tu idioma",
    learnerLanguageLabel: "Tu idioma",
    targetLanguageLabel: "Idioma que estás aprendiendo",
    targetJapanese: "Japonés",
    recommendedDictionariesTitle: "Diccionarios de japonés recomendados",
    automaticTranslationLabel: "Traducir automáticamente al {language}",
    dictionaryCountAndSize: "{count, plural, one {# diccionario} other {# diccionarios}} · {size}",
    setupProgress: "Configuración del idioma: {current} de {total}",
    continueAction: "Continuar",
    originalDefinitionLabel: "Definición original ({language})",
    interfaceRtlVerificationPending: "Las comprobaciones del diseño de derecha a izquierda siguen en curso.",
    interfaceTranslationPending: "La traducción sigue en curso."
  });
  defineLocaleCatalog("fa", "machine-draft", {
    setupTitle: "راه‌اندازی ⁨よむ⁩ به زبان شما",
    learnerLanguageLabel: "زبان شما",
    targetLanguageLabel: "زبانی که یاد می‌گیرید",
    targetJapanese: "ژاپنی",
    recommendedDictionariesTitle: "واژه‌نامه‌های پیشنهادی زبان ژاپنی",
    automaticTranslationLabel: "ترجمهٔ خودکار به ⁨{language}⁩",
    dictionaryCountAndSize: "{count, plural, one {# واژه‌نامه} other {# واژه‌نامه}} · ⁨{size}⁩",
    setupProgress: "راه‌اندازی زبان: ⁨{current}⁩ از ⁨{total}⁩",
    continueAction: "ادامه",
    originalDefinitionLabel: "تعریف اصلی به زبان ⁨{language}⁩",
    interfaceRtlVerificationPending: "بررسی چیدمان راست‌به‌چپ هنوز در حال انجام است.",
    interfaceTranslationPending: "ترجمه هنوز در حال انجام است."
  });
  defineLocaleCatalog("fi", "machine-draft", {
    setupTitle: "Ota よむ käyttöön omalla kielelläsi",
    learnerLanguageLabel: "Oma kielesi",
    targetLanguageLabel: "Opiskelemasi kieli",
    targetJapanese: "Japani",
    recommendedDictionariesTitle: "Suositellut japanin kielen sanakirjat",
    automaticTranslationLabel: "Käännä automaattisesti: {language}",
    dictionaryCountAndSize: "{count, plural, one {# sanakirja} other {# sanakirjaa}} · {size}",
    setupProgress: "Kieliasetukset: vaihe {current}/{total}",
    continueAction: "Jatka",
    originalDefinitionLabel: "Alkuperäinen määritelmä ({language})",
    interfaceRtlVerificationPending: "Oikealta vasemmalle -asettelun tarkistukset ovat vielä kesken.",
    interfaceTranslationPending: "Käännös on vielä kesken."
  });
  defineLocaleCatalog("fr", "machine-draft", {
    setupTitle: "Configurez よむ dans votre langue",
    learnerLanguageLabel: "Votre langue",
    targetLanguageLabel: "Langue que vous apprenez",
    targetJapanese: "Japonais",
    recommendedDictionariesTitle: "Dictionnaires de japonais recommandés",
    automaticTranslationLabel: "Traduire automatiquement en {language}",
    dictionaryCountAndSize: "{count, plural, one {# dictionnaire} other {# dictionnaires}} · {size}",
    setupProgress: "Configuration de la langue : {current} sur {total}",
    continueAction: "Continuer",
    originalDefinitionLabel: "Définition originale en {language}",
    interfaceRtlVerificationPending: "Les vérifications de la mise en page de droite à gauche sont en cours.",
    interfaceTranslationPending: "La traduction est en cours."
  });
  defineLocaleCatalog("grc", "machine-draft", {
    setupTitle: "Παρασκεύαζε τὸ よむ κατὰ τὴν σὴν γλῶτταν",
    learnerLanguageLabel: "Ἡ σὴ γλῶττα",
    targetLanguageLabel: "Ἡ γλῶττα ἣν μανθάνεις",
    targetJapanese: "Ἰαπωνική",
    recommendedDictionariesTitle: "Τὰ αἱρετὰ λεξικὰ τῆς Ἰαπωνικῆς",
    automaticTranslationLabel: "Μεθερμήνευε αὐτομάτως εἰς {language}",
    dictionaryCountAndSize: "{count, plural, one {# λεξικόν} other {# λεξικά}} · {size}",
    setupProgress: "Ἡ παρασκευὴ τῆς γλώττης· {current} ἐκ {total}",
    continueAction: "Πρόβαινε",
    originalDefinitionLabel: "Τὸ πρωτότυπον ({language})",
    interfaceRtlVerificationPending: "Οἱ ἔλεγχοι τῆς ἐκ δεξιῶν εἰς ἀριστερὰ διατάξεως ἔτι γίγνονται.",
    interfaceTranslationPending: "Ἡ μετάφρασις ἔτι γίγνεται."
  });
  defineLocaleCatalog("hu", "machine-draft", {
    setupTitle: "A よむ beállítása az Ön nyelvén",
    learnerLanguageLabel: "Az Ön nyelve",
    targetLanguageLabel: "A tanult nyelv",
    targetJapanese: "Japán",
    recommendedDictionariesTitle: "Ajánlott japán szótárak",
    automaticTranslationLabel: "Automatikus fordítás {language} nyelvre",
    dictionaryCountAndSize: "{count, plural, one {# szótár} other {# szótár}} · {size}",
    setupProgress: "Nyelvi beállítás: {current}/{total}",
    continueAction: "Folytatás",
    originalDefinitionLabel: "Eredeti meghatározás ({language})",
    interfaceRtlVerificationPending: "A jobbról balra elrendezés ellenőrzése még folyik.",
    interfaceTranslationPending: "A fordítás még folyamatban van."
  });
  defineLocaleCatalog("id", "machine-draft", {
    setupTitle: "Siapkan Yomu dalam bahasa Anda",
    learnerLanguageLabel: "Bahasa Anda",
    targetLanguageLabel: "Bahasa yang sedang Anda pelajari",
    targetJapanese: "Bahasa Jepang",
    recommendedDictionariesTitle: "Kamus bahasa Jepang yang direkomendasikan",
    automaticTranslationLabel: "Terjemahkan secara otomatis ke {language}",
    dictionaryCountAndSize: "{count, plural, one {# kamus} other {# kamus}} · {size}",
    setupProgress: "Penyiapan bahasa {current} dari {total}",
    continueAction: "Lanjutkan",
    originalDefinitionLabel: "Definisi asli dalam {language}",
    interfaceRtlVerificationPending: "Pemeriksaan tata letak kanan ke kiri masih berjalan.",
    interfaceTranslationPending: "Penerjemahan masih berlangsung."
  });
  defineLocaleCatalog("it", "machine-draft", {
    setupTitle: "Configura よむ nella tua lingua",
    learnerLanguageLabel: "La tua lingua",
    targetLanguageLabel: "Lingua che stai imparando",
    targetJapanese: "Giapponese",
    recommendedDictionariesTitle: "Dizionari di giapponese consigliati",
    automaticTranslationLabel: "Traduci automaticamente in {language}",
    dictionaryCountAndSize: "{count, plural, one {# dizionario} other {# dizionari}} · {size}",
    setupProgress: "Configurazione della lingua: {current} di {total}",
    continueAction: "Continua",
    originalDefinitionLabel: "Definizione originale in {language}",
    interfaceRtlVerificationPending: "I controlli del layout da destra a sinistra sono ancora in corso.",
    interfaceTranslationPending: "La traduzione è ancora in corso."
  });
  defineLocaleCatalog("km", "machine-draft", {
    setupTitle: "រៀបចំ よむ ជាភាសារបស់អ្នក",
    learnerLanguageLabel: "ភាសារបស់អ្នក",
    targetLanguageLabel: "ភាសាដែលអ្នកកំពុងរៀន",
    targetJapanese: "ភាសាជប៉ុន",
    recommendedDictionariesTitle: "វចនានុក្រមជប៉ុនដែលបានណែនាំ",
    automaticTranslationLabel: "បកប្រែដោយស្វ័យប្រវត្តិទៅជា {language}",
    dictionaryCountAndSize: "{count, plural, one {វចនានុក្រម #} other {វចនានុក្រម #}} · {size}",
    setupProgress: "ការកំណត់ភាសា៖ {current} នៃ {total}",
    continueAction: "បន្ត",
    originalDefinitionLabel: "និយមន័យដើម ({language})",
    interfaceRtlVerificationPending: "ការពិនិត្យប្លង់ពីស្ដាំទៅឆ្វេងកំពុងដំណើរការ។",
    interfaceTranslationPending: "ការបកប្រែកំពុងដំណើរការ។"
  });
  defineLocaleCatalog("ko", "machine-draft", {
    setupTitle: "내 언어로 よむ 설정하기",
    learnerLanguageLabel: "사용 언어",
    targetLanguageLabel: "학습할 언어",
    targetJapanese: "일본어",
    recommendedDictionariesTitle: "추천 일본어 사전",
    automaticTranslationLabel: "{language}로 자동 번역",
    dictionaryCountAndSize: "{count, plural, one {사전 #개} other {사전 #개}} · {size}",
    setupProgress: "언어 설정: {total}단계 중 {current}단계",
    continueAction: "계속",
    originalDefinitionLabel: "원문({language})",
    interfaceRtlVerificationPending: "오른쪽에서 왼쪽 레이아웃 검사가 아직 진행 중입니다.",
    interfaceTranslationPending: "번역이 아직 진행 중입니다."
  });
  defineLocaleCatalog("la", "machine-draft", {
    setupTitle: "Configura よむ in lingua tua",
    learnerLanguageLabel: "Lingua tua",
    targetLanguageLabel: "Lingua quam discis",
    targetJapanese: "Lingua Iaponica",
    recommendedDictionariesTitle: "Dictionaria linguae Iaponicae commendata",
    automaticTranslationLabel: "Automatice verte in {language}",
    dictionaryCountAndSize: "{count, plural, one {# dictionarium} other {# dictionaria}} · {size}",
    setupProgress: "Configuratio linguae: {current} ex {total}",
    continueAction: "Perge",
    originalDefinitionLabel: "Definitio originalis ({language})",
    interfaceRtlVerificationPending: "Probationes dispositionis a dextra ad sinistram adhuc geruntur.",
    interfaceTranslationPending: "Translatio adhuc geritur."
  });
  defineLocaleCatalog("lo", "machine-draft", {
    setupTitle: "ຕັ້ງຄ່າ よむ ໃນພາສາຂອງທ່ານ",
    learnerLanguageLabel: "ພາສາຂອງທ່ານ",
    targetLanguageLabel: "ພາສາທີ່ທ່ານກຳລັງຮຽນ",
    targetJapanese: "ພາສາຍີ່ປຸ່ນ",
    recommendedDictionariesTitle: "ວັດຈະນານຸກົມພາສາຍີ່ປຸ່ນທີ່ແນະນຳ",
    automaticTranslationLabel: "ແປເປັນ {language} ໂດຍອັດຕະໂນມັດ",
    dictionaryCountAndSize: "{count, plural, one {# ວັດຈະນານຸກົມ} other {# ວັດຈະນານຸກົມ}} · {size}",
    setupProgress: "ການຕັ້ງຄ່າພາສາ: ຂັ້ນຕອນ {current} ຂອງ {total}",
    continueAction: "ສືບຕໍ່",
    originalDefinitionLabel: "ຄຳນິຍາມຕົ້ນສະບັບ ({language})",
    interfaceRtlVerificationPending: "ການກວດສອບການຈັດວາງຈາກຂວາໄປຊ້າຍຍັງດຳເນີນຢູ່.",
    interfaceTranslationPending: "ການແປຍັງດຳເນີນຢູ່."
  });
  defineLocaleCatalog("mn", "machine-draft", {
    setupTitle: "よむ-г өөрийн хэлээр тохируулах",
    learnerLanguageLabel: "Таны хэл",
    targetLanguageLabel: "Таны сурч буй хэл",
    targetJapanese: "Япон хэл",
    recommendedDictionariesTitle: "Санал болгож буй япон хэлний толь бичгүүд",
    automaticTranslationLabel: "{language} хэл рүү автоматаар орчуулах",
    dictionaryCountAndSize: "{count, plural, one {# толь бичиг} other {# толь бичиг}} · {size}",
    setupProgress: "Хэлний тохиргоо: {current}/{total}",
    continueAction: "Үргэлжлүүлэх",
    originalDefinitionLabel: "Эх тайлбар ({language})",
    interfaceRtlVerificationPending: "Баруунаас зүүн тийш байрлалын шалгалт хийгдсээр байна.",
    interfaceTranslationPending: "Орчуулга хийгдсээр байна."
  });
  defineLocaleCatalog("nl", "machine-draft", {
    setupTitle: "Stel よむ in jouw taal in",
    learnerLanguageLabel: "Jouw taal",
    targetLanguageLabel: "Taal die je leert",
    targetJapanese: "Japans",
    recommendedDictionariesTitle: "Aanbevolen Japanse woordenboeken",
    automaticTranslationLabel: "Automatisch vertalen naar {language}",
    dictionaryCountAndSize: "{count, plural, one {# woordenboek} other {# woordenboeken}} · {size}",
    setupProgress: "Taal instellen: {current} van {total}",
    continueAction: "Doorgaan",
    originalDefinitionLabel: "Oorspronkelijke definitie ({language})",
    interfaceRtlVerificationPending: "De controles voor rechts-naar-links-opmaak lopen nog.",
    interfaceTranslationPending: "De vertaling is nog bezig."
  });
  defineLocaleCatalog("pl", "machine-draft", {
    setupTitle: "Skonfiguruj Yomu w swoim języku",
    learnerLanguageLabel: "Twój język",
    targetLanguageLabel: "Język, którego się uczysz",
    targetJapanese: "Japoński",
    recommendedDictionariesTitle: "Polecane słowniki języka japońskiego",
    automaticTranslationLabel: "Tłumacz automatycznie na język {language}",
    dictionaryCountAndSize: "{count, plural, one {# słownik} few {# słowniki} many {# słowników} other {# słownika}} · {size}",
    setupProgress: "Konfiguracja języka: {current} z {total}",
    continueAction: "Kontynuuj",
    originalDefinitionLabel: "Oryginalna definicja ({language})",
    interfaceRtlVerificationPending: "Testy układu od prawej do lewej wciąż trwają.",
    interfaceTranslationPending: "Tłumaczenie wciąż trwa."
  });
  defineLocaleCatalog("pt", "machine-draft", {
    setupTitle: "Configure o Yomu no seu idioma",
    learnerLanguageLabel: "O seu idioma",
    targetLanguageLabel: "Idioma que está a aprender",
    targetJapanese: "Japonês",
    recommendedDictionariesTitle: "Dicionários de japonês recomendados",
    automaticTranslationLabel: "Traduzir automaticamente para {language}",
    dictionaryCountAndSize: "{count, plural, one {# dicionário} other {# dicionários}} · {size}",
    setupProgress: "Configuração do idioma: {current} de {total}",
    continueAction: "Continuar",
    originalDefinitionLabel: "Definição original ({language})",
    interfaceRtlVerificationPending: "As verificações do layout da direita para a esquerda ainda estão em andamento.",
    interfaceTranslationPending: "A tradução ainda está em andamento."
  });
  defineLocaleCatalog("ro", "machine-draft", {
    setupTitle: "Configurează Yomu în limba ta",
    learnerLanguageLabel: "Limba ta",
    targetLanguageLabel: "Limba pe care o înveți",
    targetJapanese: "Japoneză",
    recommendedDictionariesTitle: "Dicționare recomandate pentru limba japoneză",
    automaticTranslationLabel: "Tradu automat în {language}",
    dictionaryCountAndSize: "{count, plural, one {# dicționar} few {# dicționare} other {# de dicționare}} · {size}",
    setupProgress: "Configurarea limbii: {current} din {total}",
    continueAction: "Continuă",
    originalDefinitionLabel: "Definiția originală în {language}",
    interfaceRtlVerificationPending: "Verificările aspectului de la dreapta la stânga sunt încă în curs.",
    interfaceTranslationPending: "Traducerea este încă în curs."
  });
  defineLocaleCatalog("ru", "machine-draft", {
    setupTitle: "Настройте Yomu на своём языке",
    learnerLanguageLabel: "Ваш язык",
    targetLanguageLabel: "Язык, который вы изучаете",
    targetJapanese: "Японский",
    recommendedDictionariesTitle: "Рекомендуемые словари японского языка",
    automaticTranslationLabel: "Автоматически переводить на {language}",
    dictionaryCountAndSize: "{count, plural, one {# словарь} few {# словаря} many {# словарей} other {# словаря}} · {size}",
    setupProgress: "Настройка языка: {current} из {total}",
    continueAction: "Продолжить",
    originalDefinitionLabel: "Оригинал определения ({language})",
    interfaceRtlVerificationPending: "Проверки вёрстки справа налево ещё идут.",
    interfaceTranslationPending: "Перевод ещё выполняется."
  });
  defineLocaleCatalog("sh", "machine-draft", {
    setupTitle: "Podesite Yomu na svom jeziku",
    learnerLanguageLabel: "Vaš jezik",
    targetLanguageLabel: "Jezik koji učite",
    targetJapanese: "Japanski",
    recommendedDictionariesTitle: "Preporučeni japanski rečnici",
    automaticTranslationLabel: "Automatski prevod na jezik {language}",
    dictionaryCountAndSize: "{count, plural, one {# rečnik} few {# rečnika} other {# rečnika}} · {size}",
    setupProgress: "Podešavanje jezika: {current} od {total}",
    continueAction: "Nastavi",
    originalDefinitionLabel: "Originalna definicija ({language})",
    interfaceRtlVerificationPending: "Provjere rasporeda s desna na lijevo još su u toku.",
    interfaceTranslationPending: "Prijevod je još u toku."
  });
  defineLocaleCatalog("sq", "machine-draft", {
    setupTitle: "Konfiguro よむ në gjuhën tënde",
    learnerLanguageLabel: "Gjuha jote",
    targetLanguageLabel: "Gjuha që po mëson",
    targetJapanese: "Japonisht",
    recommendedDictionariesTitle: "Fjalorë të rekomanduar për japonishten",
    automaticTranslationLabel: "Përkthe automatikisht në {language}",
    dictionaryCountAndSize: "{count, plural, one {# fjalor} other {# fjalorë}} · {size}",
    setupProgress: "Konfigurimi i gjuhës: {current} nga {total}",
    continueAction: "Vazhdo",
    originalDefinitionLabel: "Origjinali në {language}",
    interfaceRtlVerificationPending: "Kontrollet e faqosjes nga e djathta në të majtë janë në vazhdim.",
    interfaceTranslationPending: "Përkthimi është në vazhdim."
  });
  defineLocaleCatalog("sv", "machine-draft", {
    setupTitle: "Ställ in よむ på ditt språk",
    learnerLanguageLabel: "Ditt språk",
    targetLanguageLabel: "Språket du lär dig",
    targetJapanese: "Japanska",
    recommendedDictionariesTitle: "Rekommenderade japanska ordböcker",
    automaticTranslationLabel: "Översätt automatiskt till {language}",
    dictionaryCountAndSize: "{count, plural, one {# ordbok} other {# ordböcker}} · {size}",
    setupProgress: "Språkinställning: {current} av {total}",
    continueAction: "Fortsätt",
    originalDefinitionLabel: "Ursprunglig definition på {language}",
    interfaceRtlVerificationPending: "Kontrollerna av höger-till-vänster-layout pågår fortfarande.",
    interfaceTranslationPending: "Översättningen pågår fortfarande."
  });
  defineLocaleCatalog("th", "machine-draft", {
    setupTitle: "ตั้งค่า Yomu ในภาษาของคุณ",
    learnerLanguageLabel: "ภาษาของคุณ",
    targetLanguageLabel: "ภาษาที่คุณกำลังเรียน",
    targetJapanese: "ภาษาญี่ปุ่น",
    recommendedDictionariesTitle: "พจนานุกรมภาษาญี่ปุ่นที่แนะนำ",
    automaticTranslationLabel: "แปลเป็น{language}โดยอัตโนมัติ",
    dictionaryCountAndSize: "{count, plural, other {พจนานุกรม # รายการ}} · {size}",
    setupProgress: "ตั้งค่าภาษา {current} จาก {total}",
    continueAction: "ดำเนินการต่อ",
    originalDefinitionLabel: "คำจำกัดความต้นฉบับ ({language})",
    interfaceRtlVerificationPending: "การตรวจสอบเลย์เอาต์จากขวาไปซ้ายยังดำเนินอยู่",
    interfaceTranslationPending: "การแปลยังดำเนินอยู่"
  });
  defineLocaleCatalog("tl", "machine-draft", {
    setupTitle: "I-set up ang Yomu sa iyong wika",
    learnerLanguageLabel: "Iyong wika",
    targetLanguageLabel: "Wikang pinag-aaralan mo",
    targetJapanese: "Wikang Hapon",
    recommendedDictionariesTitle: "Mga inirerekomendang diksyunaryo ng wikang Hapon",
    automaticTranslationLabel: "Awtomatikong isalin sa {language}",
    dictionaryCountAndSize: "{count, plural, one {# diksyunaryo} other {# diksyunaryo}} · {size}",
    setupProgress: "Pag-set up ng wika: {current} sa {total}",
    continueAction: "Magpatuloy",
    originalDefinitionLabel: "Orihinal na depinisyon ({language})",
    interfaceRtlVerificationPending: "Tumatakbo pa ang mga pagsusuri sa layout mula kanan pakaliwa.",
    interfaceTranslationPending: "Isinasalin pa ito."
  });
  defineLocaleCatalog("tr", "machine-draft", {
    setupTitle: "Yomu'yu dilinizde ayarlayın",
    learnerLanguageLabel: "Diliniz",
    targetLanguageLabel: "Öğrendiğiniz dil",
    targetJapanese: "Japonca",
    recommendedDictionariesTitle: "Önerilen Japonca sözlükler",
    automaticTranslationLabel: "Otomatik olarak {language} diline çevir",
    dictionaryCountAndSize: "{count, plural, one {# sözlük} other {# sözlük}} · {size}",
    setupProgress: "Dil ayarı: {current}/{total}",
    continueAction: "Devam et",
    originalDefinitionLabel: "Orijinal tanım ({language})",
    interfaceRtlVerificationPending: "Sağdan sola yerleşim denetimleri hâlâ sürüyor.",
    interfaceTranslationPending: "Çeviri hâlâ sürüyor."
  });
  defineLocaleCatalog("vi", "machine-draft", {
    setupTitle: "Thiết lập Yomu bằng ngôn ngữ của bạn",
    learnerLanguageLabel: "Ngôn ngữ của bạn",
    targetLanguageLabel: "Ngôn ngữ bạn đang học",
    targetJapanese: "Tiếng Nhật",
    recommendedDictionariesTitle: "Từ điển tiếng Nhật được đề xuất",
    automaticTranslationLabel: "Tự động dịch sang {language}",
    dictionaryCountAndSize: "{count, plural, other {# từ điển}} · {size}",
    setupProgress: "Thiết lập ngôn ngữ: {current} trên {total}",
    continueAction: "Tiếp tục",
    originalDefinitionLabel: "Định nghĩa gốc ({language})",
    interfaceRtlVerificationPending: "Việc kiểm tra bố cục từ phải sang trái vẫn đang diễn ra.",
    interfaceTranslationPending: "Bản dịch vẫn đang được thực hiện."
  });
  defineLocaleCatalog("yue", "machine-draft", {
    setupTitle: "用你嘅語言設定よむ",
    learnerLanguageLabel: "你嘅語言",
    targetLanguageLabel: "你學緊嘅語言",
    targetJapanese: "日文",
    recommendedDictionariesTitle: "推薦嘅日文字典",
    automaticTranslationLabel: "自動翻譯做{language}",
    dictionaryCountAndSize: "{count, plural, one {# 本字典} other {# 本字典}} · {size}",
    setupProgress: "語言設定：第{current}步，共{total}步",
    continueAction: "繼續",
    originalDefinitionLabel: "原文（{language}）",
    interfaceRtlVerificationPending: "由右至左排版檢查仲進行中。",
    interfaceTranslationPending: "翻譯仲進行中。"
  });
  defineLocaleCatalog("zh", "machine-draft", {
    setupTitle: "用您的语言设置よむ",
    learnerLanguageLabel: "您的语言",
    targetLanguageLabel: "您正在学习的语言",
    targetJapanese: "日语",
    recommendedDictionariesTitle: "推荐日语词典",
    automaticTranslationLabel: "自动翻译为{language}",
    dictionaryCountAndSize: "{count, plural, one {#部词典} other {#部词典}} · {size}",
    setupProgress: "语言设置：第{current}步，共{total}步",
    continueAction: "继续",
    originalDefinitionLabel: "{language}原文",
    interfaceRtlVerificationPending: "从右到左的版式检查仍在进行。",
    interfaceTranslationPending: "翻译仍在进行中。"
  });
  const MESSAGE_NAMESPACES = ["chrome", "setup", "errors", "a11y", "docs"];
  new Set(MESSAGE_NAMESPACES);
  const OCR_LANGUAGE_HINTS = Object.freeze({
    fil: "tl",
    yue: "zh",
    grc: "el"
  });
  const GENERIC_ROSTER_LEARNING_TARGETS = Object.freeze(
    LEARNER_LANGUAGES.filter((language) => language.id !== "ko").map((language) => {
      const lookupRewrites = lookupRewritesForTarget(language.id);
      const readingAnnotation = language.id === "zh" || language.id === "yue";
      const usesHanScript = language.scripts.some((script) => script === "Hans" || script === "Hant");
      return createLearningTargetModule({
        id: `${language.id}-roster-v1`,
        language: language.runtimeLocale,
        direction: language.direction,
        experiences: {
          // Published zh/yue character banks warrant a dedicated
          // per-character surface. Other scripts use the normal term
          // dictionary with a single grapheme as their query.
          characterLookup: usesHanScript ? "character-dictionary" : "term-dictionary"
        },
        featureSemantics: {
          characterSystem: language.defaultScript,
          phoneticScripts: readingAnnotation ? [language.id === "yue" ? "jyutping" : "pinyin"] : [],
          pronunciation: "ipa",
          readingAnnotation: readingAnnotation ? language.id === "yue" ? "jyutping" : "pinyin" : "dictionary reading"
        },
        grammar: grammarForRosterTarget(language.id),
        sentenceBoundaries: sentenceBoundariesForScripts(language.scripts),
        ocr: ocrHintFor(language.runtimeLocale),
        detectsText: scriptDetector(language.scripts),
        lookupRewrites,
        ...usesHanScript ? {
          // ICU's zh/yue word guesses can merge 我去 and split 鍾意.
          // Let the installed dictionary arbitrate inside a real Han
          // run, and accept expression hits only.
          lookupStartsAtSegmentBoundary: false,
          lookupRunSegments: hanIdeographSegments,
          lookupSweepMode: "left-to-right-longest-exact",
          pointerWordSegments: hanIdeographSegments
        } : {}
      });
    })
  );
  function sentenceBoundariesForScripts(scripts) {
    const has = (script) => scripts.includes(script);
    const terminators = has("Arab") ? [".", "!", "?", "؟"] : has("Deva") ? [".", "!", "?", "।"] : has("Grek") ? [".", "!", "?", ";"] : has("Hans") || has("Hant") ? ["。", "！", "？", "!", "?"] : [".", "!", "?"];
    const whitespaceIsBoundary = scripts.some((script) => ["Hans", "Hant", "Thai", "Laoo", "Khmr", "Mymr"].includes(script));
    return { terminators, whitespaceIsBoundary };
  }
  function ocrHintFor(runtimeLocale) {
    const hint = OCR_LANGUAGE_HINTS[runtimeLocale.split("-")[0]];
    return hint ? { languageHint: hint } : void 0;
  }
  function scriptDetector(scripts) {
    return new RegExp(
      scripts.map((script) => `\\p{Script=${script === "Hans" || script === "Hant" ? "Han" : script}}`).join("|"),
      "u"
    );
  }
  const DEFAULT_LEARNING_TARGET_LANGUAGE = "ja";
  const MODULE_STACKS_BY_LANGUAGE = /* @__PURE__ */ new Map();
  let registryRevision = 0;
  function learningTargetRegistryRevision() {
    return registryRevision;
  }
  function registerLearningTargetModule(module) {
    if (!isSupportedLearningTargetModuleInterfaceVersion(module.interfaceVersion)) {
      throw new Error(
        `Learning target "${module.id}" declares contract revision ${String(module.interfaceVersion)}; this build supports ${SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS.join(", ")}.`
      );
    }
    const base = languageSubtag(module.language);
    if (!base) throw new Error(`Learning target "${module.id}" has an unusable language tag.`);
    const stack = MODULE_STACKS_BY_LANGUAGE.get(base) ?? [];
    stack.push(module);
    MODULE_STACKS_BY_LANGUAGE.set(base, stack);
    registryRevision++;
    return module;
  }
  function learningTargetModuleFor(language) {
    const canonical = canonicalLanguageTag(language);
    const base = languageSubtag(canonical);
    return base ? MODULE_STACKS_BY_LANGUAGE.get(base)?.at(-1) ?? null : null;
  }
  function defaultLearningTargetModule() {
    return learningTargetModuleFor(DEFAULT_LEARNING_TARGET_LANGUAGE) ?? JAPANESE_LEARNING_TARGET;
  }
  function registerBuiltInLearningTargetModule(module) {
    registerLearningTargetModule(module);
  }
  registerBuiltInLearningTargetModule(JAPANESE_LEARNING_TARGET);
  registerBuiltInLearningTargetModule(KOREAN_LEARNING_TARGET);
  GENERIC_ROSTER_LEARNING_TARGETS.forEach(registerBuiltInLearningTargetModule);
  let requestedTargetLanguage = DEFAULT_LEARNING_TARGET_LANGUAGE;
  let cachedTarget = null;
  let cachedForLanguage = "";
  let cachedForRegistryRevision = -1;
  function activeLearningTarget() {
    const revision = learningTargetRegistryRevision();
    if (cachedTarget && cachedForLanguage === requestedTargetLanguage && cachedForRegistryRevision === revision) {
      return cachedTarget;
    }
    cachedTarget = learningTargetModuleFor(requestedTargetLanguage) ?? defaultLearningTargetModule();
    cachedForLanguage = requestedTargetLanguage;
    cachedForRegistryRevision = revision;
    return cachedTarget;
  }
  const YOMU_HOSTED_AUDIO_SOURCE = { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true };
  const TARGET_SPEECH_SYNTHESIS_SOURCE = { type: "text-to-speech", url: "", voice: "", enabled: true };
  function getOrderedAudioSources(settings) {
    const sources = settings.audioSources.filter((source) => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;
    return defaultAudioSources(settings.audioSources, sources);
  }
  function defaultAudioSources(authoredSources, enabledSources) {
    const target = activeLearningTarget();
    const configured = enabledSources.filter((source) => !isYomuHostedAudioSource(source));
    return [
      ...hostedDefaultAudioSources(authoredSources, target.audio.recordedWordAudio),
      ...configured,
      ...targetSpeechSynthesisSources(configured, target.experiences.audio)
    ];
  }
  function hostedDefaultAudioSources(authoredSources, recordedWordAudio) {
    if (!recordedWordAudio) return [];
    const hosted = authoredSources.find(isYomuHostedAudioSource) ?? YOMU_HOSTED_AUDIO_SOURCE;
    return hosted.enabled ? [{ ...hosted }] : [];
  }
  function targetSpeechSynthesisSources(configured, experience) {
    if (experience !== "speech-synthesis") return [];
    if (configured.some(isBrowserTextToSpeechSource)) return [];
    return [TARGET_SPEECH_SYNTHESIS_SOURCE];
  }
  function isYomuHostedAudioSource(source) {
    return source.type === "custom-json" && source.url.trim() === YOMU_HOSTED_AUDIO_URL;
  }
  function preloadableAudioSources(sources, settings) {
    return settings.audioTtsMode === "source-order" ? sources.filter((source) => !isBrowserTextToSpeechSource(source)) : sources.filter((source) => !isTextToSpeechFallbackSource(source));
  }
  function cheapCandidatePreloadAudioSources(sources, card) {
    return sources.filter((source) => canResolveAudioCandidatesWithoutNetwork(source, card));
  }
  function canResolveAudioCandidatesWithoutNetwork(source, card) {
    switch (source.type) {
      case "custom":
      case "jpod101":
      case "bunpro":
        return true;
      case "jiten-tts":
        return hasJitenAudioReference(card);
      default:
        return false;
    }
  }
  function hasJitenAudioReference(card) {
    return isPositiveFiniteInteger(card.jitenWordId) && isFiniteNonNegativeInteger(card.jitenReadingIndex) || card.source === "jiten" && isPositiveFiniteInteger(card.vid) && isFiniteNonNegativeInteger(card.sid);
  }
  function isPositiveFiniteInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isFiniteNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function audioPreloadLimits(options) {
    return {
      sourceLimit: Math.max(1, options.sourceLimit ?? 1),
      candidateLimit: Math.max(1, options.candidateLimit ?? 1),
      prepareAudio: options.prepareAudio !== false
    };
  }
  function orderAudioCandidates(candidates, mode, bagKey, shuffledAudio) {
    return orderAudioDeckEntries(candidates.map((candidate, index) => ({
      candidate,
      id: audioCandidateDeckId(candidate, index)
    })), mode, bagKey, shuffledAudio);
  }
  function audioCandidateSelectionMode(sourceType, mode) {
    return sourceType === "jpdb-tts" || sourceType === "jiten-tts" ? "random" : mode;
  }
  function orderAudioSources(sources, card) {
    return audioSourceDeckEntries(sources, getAudioSourceBagKey(sources, card));
  }
  function audioSourceDeckEntries(sources, bagKey) {
    return sources.map((source, index) => {
      const signature = getAudioSourceSignature(source);
      return {
        source,
        id: getAudioSourceDeckId(signature, index),
        bagKey,
        signature
      };
    });
  }
  function isBrowserTextToSpeechSource(source) {
    return source.type === "text-to-speech" || source.type === "text-to-speech-reading";
  }
  function isApiTextToSpeechSource(source) {
    return source.type === "jiten-tts" || source.type === "jpdb-tts";
  }
  function isTextToSpeechFallbackSource(source) {
    return isApiTextToSpeechSource(source) || isBrowserTextToSpeechSource(source);
  }
  function audioSubSourceProviderName(name) {
    const trimmed = name.trim().normalize("NFC");
    return trimmed.split(/\s+/, 1)[0] ?? trimmed;
  }
  function audioSubSourceNameKey(name) {
    return audioSubSourceProviderName(name).toLowerCase();
  }
  function disabledAudioSubSourceNameKeys(source) {
    return new Set((source.subSources ?? []).filter((subSource) => !subSource.enabled).map((subSource) => audioSubSourceNameKey(subSource.name)));
  }
  function audioSubSourceFilterKey(source) {
    return [...disabledAudioSubSourceNameKeys(source)].sort().join("");
  }
  function registerAudioAttempt(triedUrls, candidate) {
    const candidateKey2 = normalizeAttemptedAudioUrl(candidate.url);
    if (triedUrls.has(candidateKey2)) return false;
    triedUrls.add(candidateKey2);
    return true;
  }
  function getAudioBagKey(source, card) {
    return [
      source.type,
      source.url,
      source.voice,
      audioSubSourceFilterKey(source),
      card.spelling,
      card.reading
    ].join("");
  }
  function getJpdbAudioBagKey(audioIds) {
    return [
      "jpdb-audio",
      ...[...audioIds].sort()
    ].join("");
  }
  function getAudioCandidateCacheKey(source, card) {
    return [
      source.type,
      source.url.trim(),
      source.voice.trim(),
      audioSubSourceFilterKey(source),
      card.spelling,
      card.reading
    ].join("");
  }
  function preparedAudioCacheKey(candidate, mode, audioViaBlob) {
    return [
      normalizeAttemptedAudioUrl(candidate.url),
      normalizeAttemptedAudioUrl(candidate.sourceUrl),
      mode,
      audioViaBlob ? "blob" : "direct"
    ].join("");
  }
  function cloneAudioCandidates(candidates) {
    return candidates.map((candidate) => ({ ...candidate }));
  }
  function normalizeAttemptedAudioUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.hash = "";
      return url.href;
    } catch {
      return value;
    }
  }
  function audioCandidateDeckId(candidate, index) {
    if (candidate.jpdbAudioId) return `jpdb:${candidate.jpdbAudioId}`;
    return [
      normalizeAttemptedAudioUrl(candidate.url),
      normalizeAttemptedAudioUrl(candidate.sourceUrl),
      index
    ].join("\0");
  }
  function orderAudioDeckEntries(entries2, mode, bagKey, shuffledAudio) {
    if (mode !== "random" || !entries2.length) return entries2;
    const byId = new Map(entries2.map((entry) => [entry.id, entry]));
    const ordered = [];
    for (const id of shuffledAudio.order(bagKey, entries2.map((entry) => entry.id))) {
      const entry = byId.get(id);
      if (entry) ordered.push(entry);
    }
    return ordered;
  }
  function getAudioSourceBagKey(sources, card) {
    return [
      "audio-sources",
      card.spelling,
      card.reading,
      ...sources.map(getAudioSourceSignature)
    ].join("");
  }
  function getAudioSourceDeckId(signature, index) {
    return `${index}\0${signature}`;
  }
  function getAudioSourceSignature(source) {
    return [
      source.type,
      source.url.trim(),
      source.voice.trim(),
      audioSubSourceFilterKey(source)
    ].join("\0");
  }
  function requestAudioUrl(responseUrl, responseType, timeoutMs, options = {}) {
    const language = options.language ?? "en";
    const requestOptions = {
      method: options.method ?? "GET",
      headers: options.headers,
      data: options.data,
      proxyUrl: options.proxyUrl,
      allowDirectCrossOrigin: options.allowDirectCrossOrigin ?? true,
      allowPublicProxies: options.allowPublicProxies,
      allowConfiguredProxy: options.allowConfiguredProxy,
      preferFetch: options.preferFetch ?? shouldPreferFetchForAudioRequests(),
      credentials: options.credentials,
      withCredentials: options.withCredentials,
      timeoutMs,
      failureLabel: uiText(language, "audioRequest"),
      timeoutLabel: uiText(language, "audioRequestTimedOut")
    };
    return responseType === "blob" ? requestBlob(responseUrl, requestOptions) : requestText(responseUrl, requestOptions);
  }
  function shouldPreferFetchForAudioRequests() {
    return typeof window !== "undefined" && window.__YOMU_READER_RUNTIME__ === "newtab";
  }
  function readBlobAsDataUrl(blob, errorMessage = "Could not read media.") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
      reader.readAsDataURL(blob);
    });
  }
  function targetSpeechSynthesisLocale() {
    return activeLearningTarget().audio.speechSynthesisLocale;
  }
  function targetAudioTemplateLanguageToken() {
    return activeLearningTarget().audio.templateLanguageToken;
  }
  const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;
  function isValidJpdbAudioId(value) {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes("..") && !value.startsWith("//"));
  }
  function normalizeJpdbAudioGroup(value) {
    const ids = value.split("+").map((item) => item.trim()).filter(Boolean);
    return ids.length && ids.every(isValidJpdbAudioId) ? ids.join("+") : "";
  }
  const JPDB_AUDIO_BASE_URL = "https://jpdb.io/static/v";
  const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
  const JPDB_AUDIO_XOR_BYTES = [6, 35, 84, 15];
  const LOOPBACK_AUDIO_HOSTS$1 = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
  function normalizeJpdbAudioIds(value) {
    return uniqueJpdbAudioValues(normalizeJpdbAudioGroups(value).flatMap((group) => group.split("+")));
  }
  function jpdbAudioPlaybackCandidates(value) {
    const groups = normalizeJpdbAudioGroups(value);
    return groups.map((group) => ({ audioIds: group.split("+"), deckId: `jpdb:${group}` }));
  }
  function jpdbAudioRequest(audioId, language = "en") {
    if (!isValidJpdbAudioId(audioId)) throw new Error(uiText(language, "invalidJpdbAudioId"));
    if (audioId.startsWith("/static/user/")) {
      return { url: new URL(audioId, "https://jpdb.io").toString(), encoded: false };
    }
    const devUrl = localDevJpdbAudioUrl(audioId);
    if (devUrl) {
      return {
        url: devUrl,
        headers: jpdbAudioHeaders(),
        encoded: true
      };
    }
    return {
      url: `${JPDB_AUDIO_BASE_URL}/${encodeJpdbAudioPath(audioId)}`,
      headers: jpdbAudioHeaders(),
      encoded: true
    };
  }
  async function fetchJpdbAudioBlob(audioId, settings) {
    const request = jpdbAudioRequest(audioId, settings.interfaceLanguage);
    const response = await requestAudioUrl(request.url, "blob", settings.audioTimeoutMs, {
      headers: request.headers,
      proxyUrl: settings.corsProxyUrl,
      language: settings.interfaceLanguage,
      allowDirectCrossOrigin: !settings.corsProxyUrl.trim(),
      credentials: "same-origin",
      withCredentials: true
    });
    if (!(response instanceof Blob)) throw new Error(uiText(settings.interfaceLanguage, "jpdbAudioPlayableFileMissing"));
    return decodeJpdbAudioBlob(response, request.encoded, settings.interfaceLanguage);
  }
  async function decodeJpdbAudioBlob(response, encoded, language = "en") {
    const bytes = new Uint8Array(await blobArrayBuffer(response, language));
    const decoded = encoded ? decodeJpdbAudioBytes(bytes) : bytes;
    const sniffedType = jpdbAudioMimeTypeForBytes(decoded);
    if (!sniffedType) {
      if (!encoded && isAudioBlobType(response.type)) return new Blob([blobPart(decoded)], { type: response.type });
      throw new Error(uiText(language, "jpdbAudioResponseNotPlayable"));
    }
    return new Blob([blobPart(decoded)], { type: sniffedType });
  }
  function jpdbAudioPageSourceUrl(audioId) {
    return audioId.startsWith("/static/user/") ? "https://jpdb.io/" : JPDB_AUDIO_BASE_URL;
  }
  function normalizeJpdbAudioGroups(value) {
    const values = Array.isArray(value) ? value : value.split(",");
    return uniqueJpdbAudioValues(values.map(normalizeJpdbAudioGroup).filter(Boolean));
  }
  function blobArrayBuffer(blob, language = "en") {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error ?? new Error(uiText(language, "couldNotReadAudioBlob")));
      reader.readAsArrayBuffer(blob);
    });
  }
  function jpdbAudioHeaders() {
    const headers = { "X-Access": JPDB_AUDIO_ACCESS_HEADER };
    if (shouldForceJpdbCafAudio()) headers["X-ForceCAF"] = "1";
    return headers;
  }
  function shouldForceJpdbCafAudio() {
    const audio = document.createElement("audio");
    return audio.canPlayType("audio/ogg; codecs=opus") === "" && audio.canPlayType("audio/x-caf") !== "";
  }
  function decodeJpdbAudioBytes(bytes) {
    const decoded = new Uint8Array(bytes);
    JPDB_AUDIO_XOR_BYTES.forEach((mask, index) => {
      if (index < decoded.length) decoded[index] = decoded[index] ^ mask;
    });
    return decoded;
  }
  function jpdbAudioMimeTypeForBytes(bytes) {
    if (startsWithAscii(bytes, "OggS")) return "audio/ogg; codecs=opus";
    if (startsWithAscii(bytes, "caff")) return "audio/x-caf";
    if (startsWithAscii(bytes, "RIFF")) return "audio/wav";
    if (startsWithAscii(bytes, "ID3") || isMp3Frame(bytes)) return "audio/mpeg";
    if (asciiAt(bytes, 4, "ftyp")) return "audio/mp4";
    return "";
  }
  function startsWithAscii(bytes, signature) {
    return asciiAt(bytes, 0, signature);
  }
  function asciiAt(bytes, offset, signature) {
    if (bytes.length < offset + signature.length) return false;
    return Array.from(signature).every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  }
  function isMp3Frame(bytes) {
    return bytes.length >= 2 && bytes[0] === 255 && (bytes[1] & 224) === 224;
  }
  function isAudioBlobType(type) {
    return /^audio\//i.test(type.trim());
  }
  function blobPart(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  function localDevJpdbAudioUrl(audioId) {
    if (!isLocalNewTabDevOrigin()) return "";
    const url = new URL(`/__yomu-jpdb-audio/${encodeJpdbAudioPath(audioId)}`, location.href);
    if (shouldForceJpdbCafAudio()) url.searchParams.set("force_caf", "1");
    return url.toString();
  }
  function isLocalNewTabDevOrigin() {
    if (typeof window === "undefined" || typeof location === "undefined") return false;
    if (window.__YOMU_READER_RUNTIME__ !== "newtab") return false;
    return /^https?:$/.test(location.protocol) && LOOPBACK_AUDIO_HOSTS$1.has(location.hostname.replace(/^\[|\]$/g, ""));
  }
  function encodeJpdbAudioPath(value) {
    return value.split("/").map(encodeURIComponent).join("/");
  }
  function uniqueJpdbAudioValues(values) {
    const seen = /* @__PURE__ */ new Set();
    return values.filter((value) => {
      const key = normalizeAttemptedAudioUrl(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function jpdbVocabularyIdentityFromUrl$1(value) {
    if (!value) return null;
    try {
      const url = new URL(value, "https://jpdb.io");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "vocabulary") return null;
      const vid = Number.parseInt(parts[1] ?? "", 10);
      return {
        vid: Number.isFinite(vid) ? vid : 0,
        spelling: decodeUrlPathPart(parts[2] ?? ""),
        reading: decodeUrlPathPart(parts[3] ?? "")
      };
    } catch {
      return null;
    }
  }
  function decodeUrlPathPart(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  const JITEN_TTS_API_BASE_URL = "https://api.jiten.moe/api/tts";
  const JITEN_TTS_RANDOM_VOICES = ["female", "female2", "male", "male2", "asmr"];
  function jitenTtsVoicesForValue(value) {
    const voice = value?.trim();
    return voice ? [voice] : [...JITEN_TTS_RANDOM_VOICES];
  }
  function jitenWordTtsUrl(wordId, readingIndex, voice) {
    return `${JITEN_TTS_API_BASE_URL}/word/${wordId}/${readingIndex}?voice=${encodeURIComponent(voice)}`;
  }
  const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
  const JAPANESE_POD_101_UNAVAILABLE_SHA256 = "ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906";
  const LOOPBACK_AUDIO_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1"]);
  const KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
  const JPDB_VOCABULARY_BASE_URL = "https://jpdb.io/vocabulary";
  const JPDB_SEARCH_URL = "https://jpdb.io/search";
  const JITEN_VOCABULARY_SEARCH_URL = "https://api.jiten.moe/api/vocabulary/search";
  const JPDB_TTS_VOICE_PREFIXES = {
    female: ["f"],
    male: ["m"],
    f1: ["f1"],
    f2: ["f2"],
    m1: ["m1"],
    m2: ["m2"]
  };
  const JISHO_TEXT_PROXY_BASE_URL = "https://r.jina.ai/http://jisho.org/search";
  const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
  const AUDIO_QUERY_PLACEHOLDER_RE = /\{(?:term|reading)\}/;
  const AUDIO_PRECONNECT_RELS = ["preconnect", "dns-prefetch"];
  const preconnectedAudioOrigins = /* @__PURE__ */ new Set();
  function formatAudioUrl(template, card) {
    const replacements = {
      term: card.spelling,
      reading: card.reading,
      language: targetAudioTemplateLanguageToken()
    };
    return template.replace(
      /\{(term|reading|language)\}/g,
      (_, key) => encodeURIComponent(replacements[key] ?? "")
    );
  }
  function findAudioUrl(value, sourceUrl, mode = "first") {
    const urls = findAudioUrls(value, sourceUrl);
    if (!urls.length) return null;
    return mode === "random" ? urls[Math.floor(Math.random() * urls.length)] : urls[0];
  }
  function findAudioUrls(value, sourceUrl) {
    const direct = directAudioUrlsForValue(value, sourceUrl);
    return direct ?? [];
  }
  async function fetchAudioBlob(url, sourceUrl, timeoutMs, mode, proxyUrl, language = "en") {
    const response = await requestAudioUrl(url, "blob", timeoutMs, { proxyUrl, language });
    if (isJsonAudioResponse(response)) {
      const nestedUrl = findAudioUrl(JSON.parse(await response.text()), sourceUrl, mode);
      if (!nestedUrl) throw new Error(uiText(language, "audioJsonMissingPlayableUrl"));
      return fetchAudioBlob(nestedUrl, sourceUrl, timeoutMs, mode, proxyUrl, language);
    }
    if (!(response instanceof Blob)) throw new Error(uiText(language, "audioSourceReturnedNoAudio"));
    await assertPlayableAudioBlob(response, url, sourceUrl, language);
    return response;
  }
  function directAudioUrlsForValue(value, sourceUrl) {
    if (!value) return [];
    if (typeof value === "string") return findAudioUrlsInString(value, sourceUrl);
    return structuredAudioUrlsForValue(value, sourceUrl);
  }
  function shouldForceBlobAudioPlayback(sourceType) {
    return sourceType === "jpod101";
  }
  function shouldForceBlobAudioCandidate(candidate) {
    return isKnownCorsBlockedPublicAudioCdnUrl(candidate.url) || isKnownCorsBlockedPublicAudioCdnUrl(candidate.sourceUrl) || isJapanesePod101Url(candidate.url) || isJapanesePod101Url(candidate.sourceUrl);
  }
  function shouldFetchDirectMediaAsBlob(url) {
    return /^https?:\/\//i.test(url) && !isLoopbackAudioUrl(url);
  }
  function shouldFetchMediaUrlAsBlobBeforePlayback(url) {
    return isKnownCorsBlockedPublicAudioCdnUrl(url);
  }
  function structuredAudioUrlsForValue(value, sourceUrl) {
    if (Array.isArray(value)) return uniqueAudioUrls(value.flatMap((item) => findAudioUrls(item, sourceUrl)));
    return typeof value === "object" ? findAudioUrlsInRecord(value, sourceUrl) : null;
  }
  function findAudioUrlsInString(value, sourceUrl) {
    if (value.startsWith("data:audio/")) return [value];
    if (/^https?:\/\//.test(value) && isLikelyAudioUrl(value)) return [normalizeAudioUrl(value, sourceUrl)];
    return uniqueAudioUrls(Array.from(value.matchAll(/https?:\/\/[^\s)"'<>\]]+/gi)).map((match) => match[0]).filter(isLikelyAudioUrl).map((url) => normalizeAudioUrl(url, sourceUrl)));
  }
  function findAudioUrlsInRecord(record2, sourceUrl) {
    const known = uniqueAudioUrls([...preferredAudioRecordUrls(record2, sourceUrl), ...directAudioRecordUrls(record2, sourceUrl)]);
    return known.length ? known : nestedAudioRecordUrls(record2, sourceUrl);
  }
  function preferredAudioRecordUrls(record2, sourceUrl) {
    return ["audioSources", "sources", "audio", "audioUrl", "src", "source"].flatMap((key) => findAudioUrls(record2[key], sourceUrl));
  }
  function directAudioRecordUrls(record2, sourceUrl) {
    return typeof record2.url === "string" && isLikelyAudioRecord(record2) ? findAudioUrls(record2.url, sourceUrl) : [];
  }
  function nestedAudioRecordUrls(record2, sourceUrl) {
    const knownKeys = /* @__PURE__ */ new Set(["url", "audioSources", "sources", "audio", "audioUrl", "src", "source"]);
    return uniqueAudioUrls(Object.entries(record2).filter(([key]) => !knownKeys.has(key)).flatMap(([, nested]) => findAudioUrls(nested, sourceUrl)));
  }
  async function isUnavailableJapanesePod101Audio(blob) {
    if (blob.size !== JAPANESE_POD_101_UNAVAILABLE_SIZE) return false;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      return hash === JAPANESE_POD_101_UNAVAILABLE_SHA256;
    } catch {
      return true;
    }
  }
  function isJsonAudioResponse(response) {
    return response instanceof Blob && response.type.includes("json");
  }
  async function assertPlayableAudioBlob(response, url, sourceUrl, language = "en") {
    if (isErrorDocumentAudioBlob(response) || !isLikelyAudioBlob(response) && !isLikelyAudioUrl(url) && !isLikelyAudioUrl(sourceUrl)) {
      throw new Error(formatNonAudioResponseMessage(language, response.type));
    }
    if ((isJapanesePod101Url(url) || isJapanesePod101Url(sourceUrl)) && await isUnavailableJapanesePod101Audio(response)) {
      throw new Error(uiText(language, "japanesePod101NoAudio"));
    }
  }
  function formatNonAudioResponseMessage(language, contentType) {
    const label = contentType || uiText(language, "audioUnknownContentType");
    return uiText(language, "audioRequestReturnedNonAudioWithType").replace("{type}", label);
  }
  function isErrorDocumentAudioBlob(blob) {
    const type = blob.type.toLowerCase();
    return type.startsWith("text/") || ["html", "xml", "json"].some((marker) => type.includes(marker));
  }
  function isLikelyAudioBlob(blob) {
    return blob.type.toLowerCase().startsWith("audio/");
  }
  async function getAudioCandidates(source, card, timeoutMs, proxyUrl) {
    return await (AUDIO_CANDIDATE_LOADERS[source.type] ?? loadNoAudioCandidates)(source, card, timeoutMs, proxyUrl);
  }
  function shouldCacheAudioCandidates(source, candidates) {
    if (!candidates.length) return false;
    return source.type !== "jpdb-tts" || candidates.length > 1;
  }
  const AUDIO_CANDIDATE_LOADERS = {
    custom: loadCustomAudioCandidates,
    "custom-json": loadCustomJsonAudioCandidates,
    jpod101: loadJapanesePod101AudioCandidates,
    "language-pod-101": loadLanguagePod101AudioCandidates,
    jisho: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getJishoAudioUrls(card, timeoutMs, proxyUrl)),
    bunpro: async (source, card) => bunproPronunciationAudioCandidates(source, card),
    "lingua-libre": async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, "lingua-libre", timeoutMs, proxyUrl)),
    wiktionary: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, "wiktionary", timeoutMs, proxyUrl)),
    "jiten-tts": async (source, card, timeoutMs, proxyUrl) => jitenTtsAudioCandidates(source, card, timeoutMs, proxyUrl),
    "jpdb-tts": async (source, card, timeoutMs, proxyUrl) => jpdbAudioIdsToCandidates(filterJpdbAudioIdsForVoice(await getJpdbTtsAudioIds(card, timeoutMs, proxyUrl), source.voice))
  };
  async function loadNoAudioCandidates() {
    return [];
  }
  const BUNPRO_PRONUNCIATION_AUDIO_BASE_URL = "https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/pronunciation/";
  const BUNPRO_AUDIO_VOICES = ["female", "male"];
  async function bunproPronunciationAudioCandidates(source, card) {
    const word = card.spelling.trim();
    if (!word || !JAPANESE_TEXT_RE.test(word)) return [];
    const voiceFilter = source.voice.trim().toLowerCase();
    return BUNPRO_AUDIO_VOICES.filter((voice) => !voiceFilter || voice === voiceFilter).map((voice) => {
      const url = `${BUNPRO_PRONUNCIATION_AUDIO_BASE_URL}${encodeURIComponent(word)}-${voice}.mp3`;
      return { url, sourceUrl: url };
    });
  }
  async function loadCustomAudioCandidates(source, card) {
    if (!source.url.trim()) return [];
    const url = formatAudioUrl(source.url, card);
    return [{ url, sourceUrl: url }];
  }
  async function loadCustomJsonAudioCandidates(source, card, timeoutMs, proxyUrl) {
    const template = source.url.trim();
    if (!template) return [];
    const sourceUrl = formatAudioUrl(withAudioQueryPlaceholders(template), card);
    const response = await requestAudioUrl(sourceUrl, "text", timeoutMs, { proxyUrl });
    if (typeof response !== "string") return [];
    return customJsonAudioCandidates(JSON.parse(response), source, sourceUrl);
  }
  function customJsonAudioCandidates(payload, source, sourceUrl) {
    const named = namedAudioSubSources(payload);
    recordAudioSubSourceNames(source.url, named.map((entry) => audioSubSourceProviderName(entry.name)));
    const disabled = disabledAudioSubSourceNameKeys(source);
    if (named.length && disabled.size) {
      const allowed = named.filter((entry) => !disabled.has(audioSubSourceNameKey(entry.name)));
      return uniqueAudioUrls(allowed.flatMap((entry) => findAudioUrls(entry.url, sourceUrl))).map((url) => ({ url, sourceUrl }));
    }
    return findAudioUrls(payload, sourceUrl).map((url) => ({ url, sourceUrl }));
  }
  function namedAudioSubSources(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record2 = value;
    const entries2 = [];
    for (const list of [record2.audioSources, record2.sources]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const entry = namedAudioSubSource(item);
        if (entry) entries2.push(entry);
      }
    }
    return entries2;
  }
  function namedAudioSubSource(value) {
    if (!value || typeof value !== "object") return null;
    const record2 = value;
    if (typeof record2.name !== "string" || !record2.name.trim()) return null;
    if (typeof record2.url !== "string" || !record2.url.trim()) return null;
    return { name: record2.name.trim(), url: record2.url };
  }
  const knownAudioSubSourcesByUrl = /* @__PURE__ */ new Map();
  function recordAudioSubSourceNames(url, names) {
    const template = url.trim();
    if (!template) return [];
    const known = knownAudioSubSourcesByUrl.get(template) ?? [];
    const seen = new Set(known.map(audioSubSourceNameKey));
    const merged = [...known];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed || seen.has(audioSubSourceNameKey(trimmed))) continue;
      seen.add(audioSubSourceNameKey(trimmed));
      merged.push(trimmed);
    }
    knownAudioSubSourcesByUrl.set(template, merged);
    return [...merged];
  }
  function withAudioQueryPlaceholders(template) {
    if (AUDIO_QUERY_PLACEHOLDER_RE.test(template)) return template;
    const [base, fragment = ""] = splitUrlFragment(template);
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}term={term}&reading={reading}${fragment}`;
  }
  function splitUrlFragment(value) {
    const hash = value.indexOf("#");
    return hash < 0 ? [value, ""] : [value.slice(0, hash), value.slice(hash)];
  }
  async function loadJapanesePod101AudioCandidates(_source, card) {
    const url = getJapanesePod101Url(card);
    return [{ url, sourceUrl: url }];
  }
  async function loadLanguagePod101AudioCandidates(_source, card, timeoutMs, proxyUrl) {
    const urls = await getLanguagePod101AudioUrls(card, timeoutMs, proxyUrl);
    return urlsToAudioCandidates(urls.length ? urls : [getJapanesePod101Url(card)]);
  }
  function urlsToAudioCandidates(urls) {
    return urls.map((url) => ({ url, sourceUrl: url }));
  }
  function jpdbAudioIdsToCandidates(audioIds) {
    return normalizeJpdbAudioIds(audioIds).map((audioId) => ({
      url: jpdbAudioRequest(audioId).url,
      sourceUrl: jpdbAudioPageSourceUrl(audioId),
      jpdbAudioId: audioId
    }));
  }
  function filterJpdbAudioIdsForVoice(audioIds, voice) {
    const normalized = voice.trim().toLowerCase();
    const prefixes = JPDB_TTS_VOICE_PREFIXES[normalized];
    if (prefixes) return audioIds.filter((audioId) => jpdbAudioIdMatchesVoice(audioId, prefixes));
    return audioIds;
  }
  function jpdbAudioIdMatchesVoice(audioId, prefixes) {
    const normalized = audioId.trim().toLowerCase();
    return prefixes.some((prefix) => normalized.startsWith(`${prefix}/`) || prefix.length === 1 && new RegExp(`^${escapeRegExp(prefix)}\\d+/`).test(normalized));
  }
  async function jitenTtsAudioCandidates(source, card, timeoutMs, proxyUrl) {
    const reference = jitenAudioReferenceFromCard(card) ?? await lookupJitenAudioReference(card, timeoutMs, proxyUrl);
    if (!reference) return [];
    const voices = jitenTtsVoicesForSource(source);
    return voices.map((voice) => {
      const url = jitenWordTtsUrl(reference.wordId, reference.readingIndex, voice);
      return { url, sourceUrl: url };
    });
  }
  function jitenTtsVoicesForSource(source) {
    return jitenTtsVoicesForValue(source.voice);
  }
  function jitenAudioReferenceFromCard(card) {
    const wordId = finitePositiveInteger(card.jitenWordId) ?? (card.source === "jiten" ? finitePositiveInteger(card.vid) : void 0);
    const readingIndex = finiteNonNegativeInteger(card.jitenReadingIndex) ?? (card.source === "jiten" ? finiteNonNegativeInteger(card.sid) : void 0);
    return wordId === void 0 || readingIndex === void 0 ? null : { wordId, readingIndex };
  }
  async function lookupJitenAudioReference(card, timeoutMs, proxyUrl) {
    const queries = uniqueStrings([card.spelling, card.reading].map((value) => value.trim()).filter(Boolean));
    for (const query of queries) {
      const url = `${JITEN_VOCABULARY_SEARCH_URL}?query=${encodeURIComponent(query)}&limit=8`;
      const response = await requestAudioUrl(url, "text", timeoutMs, {
        proxyUrl,
        allowDirectCrossOrigin: false,
        preferFetch: true
      }).catch(() => "");
      if (typeof response !== "string") continue;
      const reference = bestJitenAudioReference(card, jitenVocabularySearchResults(response));
      if (reference) return reference;
    }
    return null;
  }
  function jitenVocabularySearchResults(response) {
    try {
      const payload = JSON.parse(response);
      if (!payload || typeof payload !== "object") return [];
      const results = payload.results;
      return Array.isArray(results) ? results.map(normalizeJitenAudioReferenceSearchResult).filter((result) => Boolean(result)) : [];
    } catch {
      return [];
    }
  }
  function normalizeJitenAudioReferenceSearchResult(value) {
    if (!value || typeof value !== "object") return null;
    const record2 = value;
    const wordId = finitePositiveInteger(record2.wordId);
    const readingIndex = finiteNonNegativeInteger(record2.readingIndex);
    if (wordId === void 0 || readingIndex === void 0) return null;
    return {
      wordId,
      readingIndex,
      text: typeof record2.text === "string" ? record2.text.trim() : "",
      reading: cleanJitenRubyText(typeof record2.rubyText === "string" ? record2.rubyText : "").trim()
    };
  }
  function bestJitenAudioReference(card, results) {
    if (!results.length) return null;
    const spelling = card.spelling.trim();
    const reading = card.reading.trim();
    const exact = results.find((result) => result.text === spelling && (!reading || result.reading === reading));
    const spellingOnly = exact ?? results.find((result) => result.text === spelling);
    const readingOnly = spellingOnly ?? results.find((result) => reading && result.reading === reading);
    const match = readingOnly ?? results[0];
    return match ? { wordId: match.wordId, readingIndex: match.readingIndex } : null;
  }
  function cleanJitenRubyText(value) {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, "$2");
  }
  function finitePositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : void 0;
  }
  function finiteNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
  }
  function getJapanesePod101Url(card) {
    const spelling = card.spelling.trim();
    const reading = card.reading.trim() || spelling;
    const params = new URLSearchParams();
    if (spelling && spelling !== reading) params.set("kanji", spelling);
    params.set("kana", reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
}
function isJapanesePod101Url(value) {
  try {
  const url = new URL(value);
  return url.hostname === "assets.languagepod101.com" && url.pathname.endsWith("/audiomp3.php");
  } catch {
  return false;
  }
}
async function getJpdbTtsAudioIds(card, timeoutMs, proxyUrl = "") {
  for (const url of jpdbVocabularyAudioLookupUrls(card)) {
  const response = await requestAudioUrl(url, "text", timeoutMs, { proxyUrl, credentials: "same-origin", withCredentials: true }).catch(() => "");
  if (typeof response !== "string") continue;
  const audioIds = extractJpdbVocabularyAudioIds(response, card, url);
  if (audioIds.length) return audioIds;
  }
  return [];
}
function jpdbVocabularyAudioLookupUrls(card) {
  const urls = [];
  if (card.vid > 0) urls.push(jpdbVocabularyUrl(card.vid, card.spelling, card.reading));
  for (const query of uniqueStrings([card.spelling, card.reading].filter(Boolean))) {
  urls.push(`${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`);
  }
  return uniqueStrings(urls);
}
function jpdbVocabularyUrl(vid, spelling, reading) {
  return `${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`;
}
function extractJpdbVocabularyAudioIds(html, card, sourceUrl = "") {
  return uniqueStrings(jpdbVocabularyAudioHtmlBlocks(html, card, sourceUrl).flatMap(extractJpdbVocabularyAudioIdsFromHtml));
}
function jpdbVocabularyAudioHtmlBlocks(html, card, sourceUrl = "") {
  const resultBlocks = findHtmlBlocksByClass(html, "result").filter((block) => htmlBlockHasClass(block, "vocabulary") && jpdbVocabularyBlockMatchesCard(block, card));
  if (resultBlocks.length) return resultBlocks;
  const singleSearchResultBlocks = findHtmlBlocksByClass(html, "result").filter((block) => htmlBlockHasClass(block, "vocabulary"));
  if (canUseSingleJpdbAliasAudioResult(singleSearchResultBlocks, card, sourceUrl)) return singleSearchResultBlocks;
  return jpdbHtmlMatchesCard(html, card) ? [html] : [];
}
function canUseSingleJpdbAliasAudioResult(resultBlocks, card, sourceUrl) {
  return resultBlocks.length === 1 && isJpdbSearchUrl(sourceUrl) && isJpdbAliasLookup(card, sourceUrl) && extractJpdbVocabularyAudioIdsFromHtml(resultBlocks[0] ?? "").length > 0;
}
function isJpdbSearchUrl(value) {
  try {
  const url = new URL(value, "https://jpdb.io");
  return url.hostname === "jpdb.io" && url.pathname === "/search";
  } catch {
  return false;
  }
}
function isJpdbAliasLookup(card, sourceUrl) {
  const query = jpdbSearchQuery(sourceUrl);
  if (!query || JAPANESE_TEXT_RE.test(query)) return false;
  const normalizedQuery = cleanJpdbIdentityText(query);
  return [card.spelling, card.reading].some((value) => cleanJpdbIdentityText(value) === normalizedQuery);
}
function jpdbSearchQuery(value) {
  return attempt(() => new URL(value, "https://jpdb.io").searchParams.get("q")?.trim() ?? "", "", "candidates.jpdbSearchQuery");
}
function jpdbVocabularyBlockMatchesCard(html, card) {
  return jpdbVocabularyIdentities(html).some((identity) => jpdbVocabularyIdentityMatches(identity, card));
}
function jpdbHtmlMatchesCard(html, card) {
  if (jpdbVocabularyBlockMatchesCard(html, card)) return true;
  const canonical = getHtmlAttributeFromOpeningTag(html, "link", "href", /\brel\s*=\s*(["'])canonical\1/i);
  return canonical ? jpdbVocabularyIdentityMatches(jpdbVocabularyIdentityFromUrl(canonical), card) : false;
}
function jpdbVocabularyIdentities(html) {
  const pattern = /\bhref\s*=\s*(["'])([\s\S]*?\/vocabulary\/[\s\S]*?)\1/gi;
  const identities = [];
  let match;
  while (match = pattern.exec(html)) identities.push(jpdbVocabularyIdentityFromUrl(match[2] ?? ""));
  return identities;
}
function jpdbVocabularyIdentityFromUrl(value) {
  const identity = jpdbVocabularyIdentityFromUrl$1(value);
  return identity ? { vid: identity.vid, expression: identity.spelling, reading: identity.reading } : null;
}
function jpdbVocabularyIdentityMatches(identity, card) {
  if (!identity) return false;
  if (jpdbVocabularyVidMatches(identity, card)) return true;
  return jpdbVocabularyTextIdentityMatches(identity, jpdbCardVocabularyIdentity(card));
}
function jpdbVocabularyVidMatches(identity, card) {
  return card.vid > 0 && identity.vid === card.vid;
}
function jpdbCardVocabularyIdentity(card) {
  const spelling = cleanJpdbIdentityText(card.spelling);
  const reading = cleanJpdbIdentityText(card.reading);
  return {
  requested: new Set([spelling, reading].filter(Boolean)),
  reading,
  spelling
  };
}
function jpdbVocabularyTextIdentityMatches(identity, card) {
  if (!card.requested.size) return true;
  const expression = cleanJpdbIdentityText(identity.expression);
  const reading = cleanJpdbIdentityText(identity.reading);
  if (!jpdbVocabularyCandidateSharesRequestedText(expression, reading, card.requested)) return false;
  return jpdbVocabularyCandidateReadingMatches(expression, reading, card);
}
function jpdbVocabularyCandidateSharesRequestedText(expression, reading, requested) {
  return requested.has(expression) || requested.has(reading);
}
function jpdbVocabularyCandidateReadingMatches(expression, reading, card) {
  if (!card.reading) return true;
  return reading === card.reading || expression === card.reading || expression === card.spelling;
}
function cleanJpdbIdentityText(value) {
  return value.replace(/\s+/g, "").trim();
}
function extractJpdbVocabularyAudioIdsFromHtml(html) {
  const audioIds = [];
  const pattern = /<a\b([^>]*)>/gi;
  let match;
  while (match = pattern.exec(html)) {
  const attributes = match[1] ?? "";
  if (!attributesHaveClass(attributes, "vocabulary-audio")) continue;
  audioIds.push(...normalizeJpdbAudioIds(getHtmlAttribute(attributes, "data-audio") ?? ""));
  }
  return audioIds;
}
function htmlBlockHasClass(html, className) {
  const opening = /^<[^/\s>]+\b([^>]*)>/i.exec(html)?.[1] ?? "";
  return attributesHaveClass(opening, className);
}
function getHtmlAttributeFromOpeningTag(html, tag, attribute, attributePattern) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  let match;
  while (match = pattern.exec(html)) {
  const attributes = match[1] ?? "";
  if (attributes && (!attributePattern || attributePattern.test(attributes))) {
    return getHtmlAttribute(attributes, attribute);
  }
  }
  return null;
}
async function getJishoAudioUrls(card, timeoutMs, proxyUrl = "") {
  const url = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
  const response = shouldSkipJishoHtmlLookup(proxyUrl) ? "" : await requestAudioUrl(url, "text", timeoutMs, {
  proxyUrl,
  preferFetch: false
  }).catch(() => "");
  if (typeof response === "string" && response) {
  const audioHtml = findJishoAudioElement(response, card);
  const urls = audioHtml ? jishoAudioSourceUrls(audioHtml, url) : [];
  if (urls.length) return urls;
  return [];
  }
  return getJishoPublicFallbackAudioUrls(card, timeoutMs, proxyUrl);
}
function shouldSkipJishoHtmlLookup(proxyUrl) {
  return !getUserscriptHttpRequest() && !hasCustomJishoHtmlProxy(proxyUrl);
}
function hasCustomJishoHtmlProxy(proxyUrl) {
  const normalized = proxyUrl.trim();
  if (!normalized) return false;
  try {
  new URL(normalized);
  return true;
  } catch {
  return false;
  }
}
async function getJishoPublicFallbackAudioUrls(card, timeoutMs, proxyUrl) {
  return getJishoTextProxyAudioUrls(card, timeoutMs, proxyUrl);
}
function jishoAudioSourceUrls(audioHtml, baseUrl) {
  return extractAudioSourceUrls(audioHtml, baseUrl).filter(isLikelyAudioUrl);
}
async function getJishoTextProxyAudioUrls(card, timeoutMs, proxyUrl) {
  const url = `${JISHO_TEXT_PROXY_BASE_URL}/${encodeURIComponent(card.spelling)}`;
  const response = await requestAudioUrl(url, "text", timeoutMs, {
  proxyUrl,
  allowDirectCrossOrigin: true,
  allowPublicProxies: false,
  allowConfiguredProxy: false,
  preferFetch: true,
  headers: { "X-Return-Format": "html" }
  }).catch(() => "");
  if (typeof response !== "string" || !response) return [];
  const searchUrl = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
  const audioHtml = findJishoAudioElement(response, card);
  const fromHtml = audioHtml ? jishoAudioSourceUrls(audioHtml, searchUrl) : [];
  if (fromHtml.length) return fromHtml.slice(0, 1);
  return extractJishoTextProxyAudioUrls(response, card).slice(0, 1);
}
function extractJishoTextProxyAudioUrls(markdown, card) {
  const wordsSection = markdownSection(markdown, /^#{1,6}\s+Words\b/im);
  const rawCandidates = findAudioUrls(wordsSection || markdown).filter((url) => {
  try {
    const target = new URL(url);
    return target.hostname === "d1vjc5dkcd3yh2.cloudfront.net" && target.pathname.startsWith("/audio/");
  } catch {
    return false;
  }
  });
  if (!rawCandidates.length) return [];
  const context = compactJapaneseText((wordsSection || markdown).slice(0, Math.max(0, (wordsSection || markdown).indexOf(rawCandidates[0] ?? "")) + 280));
  const spelling = compactJapaneseText(card.spelling);
  const reading = compactJapaneseText(card.reading);
  if (spelling && !context.includes(spelling) && reading && !context.includes(reading)) return [];
  return uniqueAudioUrls(rawCandidates.map(normalizeJishoCloudfrontAudioUrl));
}
function normalizeJishoCloudfrontAudioUrl(url) {
  return url.replace(/^http:\/\//i, "https://");
}
function markdownSection(markdown, startPattern) {
  const start = markdown.search(startPattern);
  if (start < 0) return "";
  const rest = markdown.slice(start);
  const nextHeading = rest.slice(1).search(/^#{1,6}\s+/m);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading + 1);
}
function compactJapaneseText(value) {
  return value.replace(/[^\u3040-\u30ff\u3400-\u9fffー・]/g, "");
}
function findJishoAudioElement(html, card) {
  const exact = findHtmlElementById(html, "audio", `audio_${card.spelling}:${card.reading}`);
  if (exact) return exact;
  if (!canUseKanaJishoAudioFallback(card)) return null;
  return findUniqueJishoReadingAudioElement(html, card.reading.trim());
}
function canUseKanaJishoAudioFallback(card) {
  const spelling = card.spelling.trim();
  const reading = card.reading.trim();
  return Boolean(spelling && reading && KANA_ONLY_RE.test(spelling));
}
function findUniqueJishoReadingAudioElement(html, reading) {
  const matches = findHtmlElements(html, "audio").filter((element) => jishoAudioReading(element).trim() === reading);
  return matches.length === 1 ? matches[0] : null;
}
function jishoAudioReading(audioHtml) {
  const id = htmlAttributeValue(audioHtml, "id") ?? "";
  const marker = id.startsWith("audio_") ? id.slice("audio_".length) : "";
  const colon = marker.lastIndexOf(":");
  return colon >= 0 ? marker.slice(colon + 1) : "";
}
async function getLanguagePod101AudioUrls(card, timeoutMs, proxyUrl = "") {
  const url = "https://www.japanesepod101.com/learningcenter/reference/dictionary_post";
  const response = await requestAudioUrl(url, "text", timeoutMs, { ...languagePod101RequestOptions(card), proxyUrl }).catch(() => "");
  if (typeof response !== "string") return [];
  const urls = [];
  for (const row of findHtmlBlocksByClass(response, "dc-result-row")) {
  if (!languagePod101RowMatchesCard(row, card)) continue;
  urls.push(...extractAudioSourceUrls(row, url));
  }
  return uniqueAudioUrls(urls);
}
function languagePod101RequestOptions(card) {
  return {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  data: languagePod101RequestBody(card)
  };
}
function languagePod101RequestBody(card) {
  const searchQuery = card.spelling.trim() || card.reading;
  return new URLSearchParams({
  post: "dictionary_reference",
  match_type: "exact",
  search_query: searchQuery,
  vulgar: "true"
  }).toString();
}
function languagePod101RowMatchesCard(row, card) {
  return card.reading === card.spelling || languagePod101RowKana(row) === card.reading;
}
function languagePod101RowKana(row) {
  const kanaHtml = findHtmlElementByClass(row, "span", "dc-vocab_kana");
  return stripHtml(kanaHtml ?? "").trim();
}
async function getCommonsAudioUrls(term, source, timeoutMs, proxyUrl = "") {
  const apiUrl = commonsSearchApiUrl(term, source);
  const response = await requestAudioUrl(apiUrl, "text", timeoutMs, { proxyUrl });
  if (typeof response !== "string") return [];
  const urls = [];
  for (const title of commonsSearchTitles(response)) {
  urls.push(...await getCommonsAudioUrlsForTitle(title, term, source, timeoutMs, proxyUrl));
  }
  return urls;
}
function commonsSearchApiUrl(term, source) {
  const search = source === "lingua-libre" ? `intitle:/-(${escapeRegExp(term)}).wav/i incategory:"Lingua_Libre_pronunciation-jpn"` : `intitle:/ja(-[a-zA-Z]{2})?-${escapeRegExp(term)}[0123456789]*.ogg/i`;
  return `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&origin=*&srsearch=${encodeURIComponent(search)}`;
}
function commonsSearchTitles(response) {
  const pages = JSON.parse(response).query?.search ?? [];
  return pages.slice(0, 6).map((page) => page.title).filter((title) => Boolean(title));
}
async function getCommonsAudioUrlsForTitle(title, term, source, timeoutMs, proxyUrl = "") {
  const info = await requestAudioUrl(commonsImageInfoUrl(title), "text", timeoutMs, { proxyUrl }).catch(() => null);
  if (typeof info !== "string") return [];
  return commonsImageInfoUrls(info, title, term, source);
}
function commonsImageInfoUrl(title) {
  return `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&origin=*&titles=${encodeURIComponent(title)}`;
}
function commonsImageInfoUrls(info, title, term, source) {
  const filePages = JSON.parse(info).query?.pages ?? {};
  return Object.values(filePages).map((filePage) => filePage.imageinfo?.[0]).filter((image) => Boolean(image?.url && isValidCommonsAudioFilename(title, image.user ?? "", term, source))).map((image) => image?.url ?? "");
}
function findHtmlElementById(html, tag, id) {
  return findHtmlElement(html, tag, new RegExp(`\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\1`, "i"));
  }
  function htmlAttributeValue(html, attribute) {
    const match = new RegExp(`\\b${escapeRegExp(attribute)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(html);
  return match?.[2] ?? null;
}
function findHtmlElementByClass(html, tag, className) {
  return findHtmlElementsByClass(html, tag, className)[0] ?? null;
}
function findHtmlElementsByClass(html, tag, className) {
  return findHtmlElements(html, tag).filter((element) => htmlElementHasClass(element, tag, className));
}
function findHtmlBlocksByClass(html, className) {
  const starts = [];
  const startPattern = /<[^/!][^>]*>/gi;
  let match;
  while (match = startPattern.exec(html)) {
  if (tagAttributesHaveClass(match[0], className)) starts.push(match.index);
  }
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}
function findHtmlElement(html, tag, attributePattern) {
  return findHtmlElements(html, tag, attributePattern)[0] ?? null;
}
function findHtmlElements(html, tag, attributePattern) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>[\\s\\S]*?<\\/${tag}>`, "gi");
  const matches = [];
  let match;
  while (match = pattern.exec(html)) {
  if (htmlElementMatchesAttributes(match, attributePattern)) matches.push(match[0]);
  }
  return matches;
}
function htmlElementMatchesAttributes(match, attributePattern) {
  const attributes = match[1] ?? "";
  return attributePattern ? attributePattern.test(attributes) : true;
}
function htmlElementHasClass(element, tag, className) {
  const opening = new RegExp(`^<${tag}\\b([^>]*)>`, "i").exec(element)?.[1] ?? "";
  return attributesHaveClass(opening, className);
}
function tagAttributesHaveClass(openingTag, className) {
  const attributes = /^<[^/\s>]+\b([^>]*)>/i.exec(openingTag)?.[1] ?? "";
  return attributesHaveClass(attributes, className);
}
function attributesHaveClass(attributes, className) {
  return (getHtmlAttribute(attributes, "class") ?? "").split(/\s+/).includes(className);
}
function extractAudioSourceUrls(html, baseUrl) {
  const urls = [];
  const sourcePattern = /<source\b([^>]*)>/gi;
  let match;
  while (match = sourcePattern.exec(html)) {
  const src = getHtmlAttribute(match[1] ?? "", "src");
  const url = src ? resolveAudioSourceUrl(src, baseUrl) : "";
  if (url) urls.push(url);
  }
  return uniqueAudioUrls(urls);
}
function resolveAudioSourceUrl(src, baseUrl) {
  return attempt(() => new URL(src, baseUrl).href, "", "candidates.resolveAudioSourceUrl");
}
function getHtmlAttribute(attributes, name) {
  const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match ? decodeHtmlAttribute(match[2]) : null;
}
function decodeHtmlAttribute(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
function stripHtml(value) {
  return decodeHtmlAttribute(value.replace(/<[^>]+>/g, ""));
}
function isValidCommonsAudioFilename(filename, fileUser, term, source) {
  if (!filename) return false;
  if (source === "lingua-libre") {
  return new RegExp(`^File:LL-Q\\d+\\s+\\(jpn\\)-${escapeRegExp(fileUser)}-${escapeRegExp(term)}\\.wav$`, "i").test(filename);
  }
  return new RegExp(`^File:ja(-\\w\\w)?-${escapeRegExp(term)}\\d*\\.ogg$`, "i").test(filename);
}
function normalizeAudioUrl(value, sourceUrl) {
  try {
  const nested = new URL(value);
  if (sourceUrl) alignLoopbackAudioUrl(nested, new URL(sourceUrl));
  return normalizeAudioUrlSlashes(nested.href);
  } catch {
  return normalizeAudioUrlSlashes(value);
  }
}
function alignLoopbackAudioUrl(nested, source) {
  if (!shouldAlignLoopbackAudioUrl(nested, source)) return;
  nested.protocol = source.protocol;
  nested.hostname = source.hostname;
}
function shouldAlignLoopbackAudioUrl(nested, source) {
  return isLoopbackAudioHost(nested.hostname) && !isLoopbackAudioHost(source.hostname) && nested.port === source.port;
}
function isLoopbackAudioHost(hostname) {
  return LOOPBACK_AUDIO_HOSTS.has(hostname);
}
function normalizeAudioUrlSlashes(value) {
  return value.replace(/\\/g, "/");
}
function isLikelyAudioRecord(record2) {
  return typeof record2.url === "string" && audioRecordHasPlayableSignal(record2);
}
function audioRecordHasPlayableSignal(record2) {
  return isLikelyAudioUrl(String(record2.url)) || ["audio", "audioSource"].includes(String(record2.type ?? "")) || typeof record2.name === "string";
}
function isLikelyAudioUrl(value) {
  if (value.startsWith("data:audio/")) return true;
  if (isJapanesePod101Url(value)) return true;
  try {
  const url = new URL(value, location.href);
  const pathname = url.pathname.toLowerCase();
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/.test(pathname) || /(^|[-_/])(audio|sound|voice|pronunciation)([-_/]|$)/i.test(pathname);
  } catch {
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)(?:$|[?#])/i.test(value);
  }
}
function uniqueAudioUrls(urls) {
  const seen = /* @__PURE__ */ new Set();
  return urls.filter((url) => {
  const key = normalizeAttemptedAudioUrl(url);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
  });
}
function shouldFetchCandidateAsBlob(candidate, audioViaBlob) {
  if (!canFetchAudioCandidateAsBlob(candidate, audioViaBlob)) return false;
  return isBlobFetchableAudioCandidate(candidate);
}
function canFetchAudioCandidateAsBlob(candidate, audioViaBlob) {
  return audioViaBlob && !candidate.url.startsWith("blob:") && !candidate.url.startsWith("data:audio/") && !isLoopbackAudioUrl(candidate.url);
}
function isBlobFetchableAudioCandidate(candidate) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(candidate.url)) return false;
  return /^https?:\/\//i.test(candidate.url) || isAppleTouchBrowser() || isJapanesePod101Url(candidate.url) || isJapanesePod101Url(candidate.sourceUrl);
}
function isLoopbackAudioUrl(value) {
  try {
  const base = typeof location === "undefined" ? void 0 : location.href;
  return isLoopbackAudioHost(new URL(value, base).hostname);
  } catch {
  return false;
  }
}
function preconnectAudioUrl(value) {
  const origin = audioPreconnectOrigin(value);
  if (!origin || preconnectedAudioOrigins.has(origin)) return;
  preconnectedAudioOrigins.add(origin);
  appendAudioPreconnectLinks(origin);
}
function audioPreconnectOrigin(value) {
  return attempt(() => new URL(value, location.href).origin, null, "candidates.audioPreconnectOrigin");
}
function appendAudioPreconnectLinks(origin) {
  for (const rel of AUDIO_PRECONNECT_RELS) appendAudioPreconnectLink(origin, rel);
}
function appendAudioPreconnectLink(origin, rel) {
  const link = document.createElement("link");
  link.rel = rel;
  link.href = origin;
  if (rel === "preconnect") link.crossOrigin = "anonymous";
  document.head?.append(link);
}
let activationTrackingWindow;
let pageHasUserActivation = false;
const SILENT_AUDIO_DATA_URL = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
function canAttemptAudiblePlayback(userGesture = false) {
  installPageActivationTracking();
  if (userGesture) {
  pageHasUserActivation = true;
  return true;
  }
  const browserActivation = browserUserActivationState();
  if (browserActivation) pageHasUserActivation = true;
  if (browserActivation !== void 0) return true;
  if (pageHasUserActivation) return true;
  if (isFirefoxLikeBrowser()) return true;
  return true;
}
function canAttemptWebAudioFallback(userGesture = false) {
  installPageActivationTracking();
  if (userGesture) {
  pageHasUserActivation = true;
  return true;
  }
  const browserActivation = browserUserActivationState();
  if (browserActivation) {
  pageHasUserActivation = true;
  return true;
  }
  if (pageHasUserActivation) return true;
  if (browserActivation === false) return false;
  if (isFirefoxLikeBrowser()) return true;
  return true;
}
function installPageActivationTracking() {
  if (typeof window === "undefined" || activationTrackingWindow === window) return;
  activationTrackingWindow = window;
  const markActive = () => {
  pageHasUserActivation = true;
  };
  for (const eventName of ["click", "keydown", "pointerdown", "touchstart"]) {
  window.addEventListener(eventName, markActive, { capture: true, passive: true });
  }
}
function browserUserActivationState() {
  const activation = typeof navigator === "undefined" ? void 0 : navigator.userActivation;
  if (!activation) return void 0;
  return activation.hasBeenActive || activation.isActive;
}
function isFirefoxLikeBrowser() {
  return typeof navigator !== "undefined" && /firefox|iceweasel|fxios/i.test(navigator.userAgent ?? "");
}
function reserveGestureAudioElement(createAudioElement) {
  const audio = createAudioElement(SILENT_AUDIO_DATA_URL);
  audio.loop = true;
  playSilentReservationAudio(audio);
  return audio;
}
function playSilentReservationAudio(audio) {
  try {
  void audio.play().catch(() => void 0);
  } catch {
  }
}
installPageActivationTracking();
function revokeBlobObjectUrl(url) {
  if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
class ObjectUrlCache {
  // `revoke` lets callers release side-channel state tied to the URL (e.g. the
  // retained Blob the Web Audio CSP fallback reads), not just the object URL.
  constructor(ttlMs, revoke = revokeBlobObjectUrl) {
  this.ttlMs = ttlMs;
  this.revoke = revoke;
  }
  entries = /* @__PURE__ */ new Map();
  getOrCreate(key, createUrl) {
  const now = Date.now();
  const cached = this.entries.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  if (cached) this.delete(key);
  const entry = {
    expiresAt: now + this.ttlMs,
    promise: Promise.resolve().then(createUrl).then((url) => {
      entry.url = url;
      entry.timeoutId = globalThis.setTimeout(() => this.expire(key, entry), this.ttlMs);
      return url;
    }).catch((error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    })
  };
  this.entries.set(key, entry);
  return entry.promise;
  }
  clear() {
  for (const key of this.entries.keys()) {
    this.delete(key);
  }
  }
  expire(key, entry) {
  if (this.entries.get(key) !== entry) return;
  this.delete(key);
  }
  delete(key) {
  const entry = this.entries.get(key);
  if (!entry) return;
  if (entry.timeoutId !== void 0) globalThis.clearTimeout(entry.timeoutId);
  this.entries.delete(key);
  if (entry.url !== void 0) this.revoke(entry.url);
  }
}
function pruneExpiringMapEntries(cache, limit, now = Date.now()) {
  for (const [key, entry] of cache) {
  if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > limit) {
  const oldest = cache.keys().next().value;
  if (typeof oldest !== "string") break;
  cache.delete(oldest);
  }
}
const JPDB_HOST_RE = /(^|\.)jpdb\.io$/i;
const AUDIO_EXTENSION_TYPES = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  webm: "audio/webm"
};
const IMAGE_EXTENSION_TYPES = {
  apng: "image/apng",
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};
const PAGE_MEDIA_BLOB_LIMIT = 64;
const pageMediaBlobs = /* @__PURE__ */ new Map();
async function createPageMediaUrl(blob, sourceUrl = "") {
  const typed = withUsableMediaType(blob, sourceUrl);
  const url = shouldUseDataUrlForPageMedia() ? await readBlobAsDataUrl(typed) : URL.createObjectURL(typed);
  if (typed.type.startsWith("audio/")) registerPageMediaBlob(url, typed);
  return url;
}
function getPageMediaBlob(url) {
  return pageMediaBlobs.get(url);
}
function registerPageMediaBlob(url, blob) {
  pageMediaBlobs.delete(url);
  pageMediaBlobs.set(url, blob);
  while (pageMediaBlobs.size > PAGE_MEDIA_BLOB_LIMIT) {
  const oldest = pageMediaBlobs.keys().next().value;
  if (oldest === void 0) break;
  pageMediaBlobs.delete(oldest);
  }
}
function withUsableMediaType(blob, sourceUrl) {
  const type = (blob.type || "").toLowerCase();
  if (type && type !== "application/octet-stream" && type !== "binary/octet-stream") return blob;
  const extension = sourceUrl.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() ?? "";
  return new Blob([blob], { type: IMAGE_EXTENSION_TYPES[extension] ?? AUDIO_EXTENSION_TYPES[extension] ?? "audio/mpeg" });
}
function revokePageMediaUrl(url) {
  pageMediaBlobs.delete(url);
  if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
function shouldUseDataUrlForPageMedia() {
  if (typeof location === "undefined") return false;
  return JPDB_HOST_RE.test(location.hostname);
}
const AUDIO_CANDIDATE_CACHE_TTL_MS = 10 * 60 * 1e3;
const AUDIO_BLOB_CACHE_TTL_MS = 10 * 60 * 1e3;
const READY_AUDIO_CACHE_TTL_MS = 5 * 60 * 1e3;
const AUDIO_CANDIDATE_CACHE_LIMIT = 600;
const READY_AUDIO_CACHE_LIMIT = 160;
const GESTURE_AUDIO_RESERVATION_TTL_MS = 8e3;
const LAST_AUDIO_IDENTITY_LIMIT = 400;
const WEB_AUDIO_RESUME_TIMEOUT_MS = 250;
const SOFT_CHIME_NOTES = [
  { frequency: 587.33, offset: 0, duration: 0.22, gain: 0.032 },
  { frequency: 783.99, offset: 0.11, duration: 0.28, gain: 0.024 }
];
const JPDB_AUDIO_UNAVAILABLE_TTL_MS = 10 * 60 * 1e3;
const log$1 = Logger.scope("Audio");
class AudioPlaybackAttemptError extends Error {
  constructor(error) {
  super(error instanceof Error ? error.message : String(error));
  this.name = "AudioPlaybackAttemptError";
  }
}
class AudioPlayer {
  constructor(getSettings) {
  this.getSettings = getSettings;
  }
  current;
  utterance;
  fallbackChimeContext;
  playRequestId = 0;
  shuffledAudio = new ShuffledAudioDeck();
  candidateCache = /* @__PURE__ */ new Map();
  blobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS, revokePageMediaUrl);
  jpdbAudioBlobUrlCache = new ObjectUrlCache(AUDIO_BLOB_CACHE_TTL_MS, revokePageMediaUrl);
  readyAudioCache = /* @__PURE__ */ new Map();
  unavailableJpdbAudioIds = /* @__PURE__ */ new Map();
  lastAudioIdentityByCard = /* @__PURE__ */ new Map();
  gestureReservation;
  reusableGestureAudio;
  activePlayback;
  clearCaches() {
  this.candidateCache.clear();
  this.blobUrlCache.clear();
  this.jpdbAudioBlobUrlCache.clear();
  this.readyAudioCache.clear();
  this.unavailableJpdbAudioIds.clear();
  }
  async play(card, options = {}) {
  const request = this.audioPlaybackRequest(options);
  this.ensureAudioEnabled(request.settings);
  if (!canAttemptAudiblePlayback(request.userGesture)) return false;
  if (!request.isCurrent()) return false;
  const reservedAudio = this.takeGestureAudioElement(request) ?? this.reserveGestureAudioElement(request);
  this.stopCurrent(reservedAudio);
  if (!request.sources.length) return await this.playNoAudioSources(card, request);
  const done = log$1.time("play", { term: card.spelling, sources: request.sources.map((source) => source.type), viaBlob: true });
  const result = await this.playFromSources(
    request.sources,
    card,
    request.settings,
    request.requestId,
    request.isCurrent,
    request.userGesture,
    reservedAudio,
    request.playbackLifecycle
  );
  if (result.state === "played" && request.reservedGesture && this.current) {
    this.reusableGestureAudio = this.current;
  }
  done();
  return this.finishPlaybackResult(
    card,
    request.settings,
    request.requestId,
    request.isCurrent,
    request.userGesture,
    result,
    request.playbackLifecycle
  );
  }
  audioPlaybackRequest(options) {
  const settings = this.getSettings();
  return {
    requestId: ++this.playRequestId,
    isCurrent: options.isCurrent ?? (() => true),
    settings,
    sources: getOrderedAudioSources(settings),
    userGesture: options.userGesture ?? false,
    reservedGesture: options.reservedGesture ?? false,
    playbackLifecycle: options.playbackLifecycle
  };
  }
  reserveGestureAudioElement(request) {
  if (!shouldReserveGestureAudioElement(request)) return void 0;
  this.stopCurrent();
  return this.reserveCurrentGestureAudioElement();
  }
  reserveCurrentGestureAudioElement() {
  const audio = reserveGestureAudioElement((audioUrl) => this.createAudioElement(audioUrl));
  this.reusableGestureAudio = audio;
  this.current = audio;
  return audio;
  }
  // First-gesture unlock: Safari refuses audible playback until the page has
  // had a real user gesture, so hover autoplay stays silent until something
  // reserves a gesture-authorized element. Word presses already prime one;
  // this lets ANY first tap on the page do it without disturbing playback
  // once an authorized element exists.
  primeUserGestureIfUnprimed() {
  if (this.reusableGestureAudio) return false;
  return this.primeUserGesture();
  }
  primeUserGesture() {
  const request = this.audioPlaybackRequest({ userGesture: true });
  if (!request.settings.audioEnabled || !shouldReserveGestureAudioElement(request)) return false;
  this.releaseGestureReservation();
  this.stopCurrent();
  const audio = this.reserveCurrentGestureAudioElement();
  this.gestureReservation = {
    audio,
    expiresAt: Date.now() + GESTURE_AUDIO_RESERVATION_TTL_MS,
    timer: window.setTimeout(() => this.expireGestureReservation(audio), GESTURE_AUDIO_RESERVATION_TTL_MS)
  };
  return true;
  }
  takeGestureAudioElement(request) {
  if (!shouldUseGestureAudioReservation(request)) return void 0;
  const reservation = this.gestureReservation;
  if (!reservation) return this.reusableAudioForAutoplay(request);
  this.gestureReservation = void 0;
  window.clearTimeout(reservation.timer);
  if (reservation.expiresAt < Date.now()) {
    if (this.current === reservation.audio) this.stopCurrent();
    return this.reusableAudioForAutoplay(request);
  }
  return reservation.audio;
  }
  reusableAudioForAutoplay(request) {
  return request.reservedGesture ? this.reusableGestureAudio : void 0;
  }
  ensureAudioEnabled(settings) {
  if (!settings.audioEnabled) throw new Error(uiText(settings.interfaceLanguage, "audioPlaybackDisabledToast"));
  }
  async playNoAudioSources(card, request) {
  log$1.warn("No audio sources configured", { term: card.spelling });
  return await this.playMissingAudioFallback(
    request.settings,
    request.requestId,
    request.isCurrent,
    request.userGesture,
    request.playbackLifecycle
  );
  }
  async finishPlaybackResult(card, settings, requestId, isCurrent, userGesture, result, playbackLifecycle) {
  if (result.state === "played") return true;
  if (result.state === "playback-error") return false;
  if (result.state === "superseded" || !this.isPlaybackCurrent(requestId, isCurrent)) return false;
  log$1.warn("No playable audio found", { term: card.spelling, errors: result.errors });
  return await this.playMissingAudioFallback(settings, requestId, isCurrent, userGesture, playbackLifecycle);
  }
  async playFromSources(sources, card, settings, requestId, isCurrent, userGesture, reservedAudio, playbackLifecycle) {
  const errors = [];
  const avoidIdentity = settings.audioSelectionMode === "random" ? this.lastPlayedAudioIdentity(card) : void 0;
  const result = await this.playFromSourcesAttempt(
    sources,
    card,
    settings,
    requestId,
    isCurrent,
    errors,
    userGesture,
    reservedAudio,
    avoidIdentity,
    playbackLifecycle
  );
  if (result.state === "miss" && result.skippedAvoidedIdentity) {
    const retry = await this.playFromSourcesAttempt(
      sources,
      card,
      settings,
      requestId,
      isCurrent,
      errors,
      userGesture,
      reservedAudio,
      void 0,
      playbackLifecycle
    );
    return { state: retry.state, errors };
  }
  return { state: result.state, errors };
  }
  async playFromSourcesAttempt(sources, card, settings, requestId, isCurrent, errors, userGesture, reservedAudio, avoidIdentity, playbackLifecycle) {
  const triedUrls = /* @__PURE__ */ new Set();
  const attemptState = { skippedAvoidedIdentity: false };
  const context = {
    card,
    settings,
    requestId,
    triedUrls,
    isCurrent,
    errors,
    reservedAudio,
    avoidIdentity,
    attemptState,
    userGesture,
    playbackLifecycle
  };
  const fallbackContext = { ...context, reservedAudio: void 0 };
  if (settings.audioTtsMode === "source-order") {
    const result = await this.playOrderedSources(orderAudioSources(sources, card), context);
    return { state: result, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
  }
  const realSourceSettings = sources.filter((source) => !isTextToSpeechFallbackSource(source));
  const realAudioSources = orderAudioSources(realSourceSettings, card);
  const realAudioResult = await this.playOrderedSources(realAudioSources, context);
  if (realAudioResult !== "miss") return { state: realAudioResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
  if (attemptState.skippedAvoidedIdentity) return { state: "miss", skippedAvoidedIdentity: true };
  const apiTextToSpeechSources = apiTextToSpeechFallbackSources(sources, card, settings);
  const apiTextToSpeechResult = await this.playOrderedSources(orderAudioSources(apiTextToSpeechSources, card), fallbackContext);
  if (apiTextToSpeechResult !== "miss") return { state: apiTextToSpeechResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
  if (attemptState.skippedAvoidedIdentity) return { state: "miss", skippedAvoidedIdentity: true };
  const textToSpeechResult = await this.playOrderedSources(orderAudioSources(sources.filter(isBrowserTextToSpeechSource), card), fallbackContext);
  return { state: textToSpeechResult, skippedAvoidedIdentity: attemptState.skippedAvoidedIdentity };
  }
  async playOrderedSources(sources, context) {
  for (const sourceEntry of sources) {
    const result = await this.playSourceWithErrors(sourceEntry, context);
    if (result !== "miss") return result;
  }
  return "miss";
  }
  async playSourceWithErrors(sourceEntry, context) {
  if (!this.isPlaybackCurrent(context.requestId, context.isCurrent)) {
    return "superseded";
  }
  try {
    const played = await this.playFromSource(sourceEntry, context);
    const result = this.audioSourceAttemptResult(played, context.requestId, context.isCurrent);
    if (result === "played") this.shuffledAudio.markPlayed(sourceEntry.bagKey, sourceEntry.id);
    else if (result === "miss") this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
    return result;
  } catch (error) {
    context.errors.push(error instanceof Error ? error.message : String(error));
    this.shuffledAudio.markSkipped(sourceEntry.bagKey, sourceEntry.id);
    return "miss";
  }
  }
  audioSourceAttemptResult(played, requestId, isCurrent) {
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return "superseded";
  if (!played) return "miss";
  return "played";
  }
  preload(card, options = {}) {
  const settings = this.getSettings();
  if (!settings.audioEnabled) return false;
  const { sourceLimit, candidateLimit, prepareAudio } = audioPreloadLimits(options);
  const candidateSources = preloadableAudioSources(getOrderedAudioSources(settings), settings);
  const preloadedSources = prepareAudio ? candidateSources : cheapCandidatePreloadAudioSources(candidateSources, card);
  const sources = orderAudioSources(preloadedSources, card).slice(0, sourceLimit);
  if (!sources.length) return false;
  for (const { source } of sources) {
    void this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl).then((candidates) => {
      const triedUrls = /* @__PURE__ */ new Set();
      for (const { candidate } of orderAudioCandidates(candidates, audioCandidateSelectionMode(source.type, settings.audioSelectionMode), getAudioBagKey(source, card), this.shuffledAudio).slice(0, candidateLimit)) {
        if (!registerAudioAttempt(triedUrls, candidate)) continue;
        preconnectAudioUrl(candidate.url);
        if (!prepareAudio) continue;
        void this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, true).catch(() => void 0);
      }
    }).catch(() => void 0);
  }
  return true;
  }
  stop() {
  this.playRequestId++;
  this.stopCurrent();
  }
  destroy() {
  this.playRequestId++;
  this.releaseGestureReservation();
  this.stopCurrent();
  this.reusableGestureAudio = void 0;
  this.clearCaches();
  }
  async playJapaneseText(text, voiceName = "") {
  const settings = this.getSettings();
  const requestId = ++this.playRequestId;
  const trimmed = text.trim();
  if (!trimmed) throw new Error(uiText(settings.interfaceLanguage, "noTextToRead"));
  this.stopCurrent();
  await this.playTextToSpeech(trimmed, voiceName, this.textToSpeechTextBagKey(trimmed, voiceName, settings));
  if (requestId !== this.playRequestId) this.stopCurrent();
  }
  async playJpdbAudio(audioIds, options = {}) {
  const settings = this.getSettings();
  this.ensureAudioEnabled(settings);
  if (!canAttemptAudiblePlayback(options.userGesture)) return false;
  const candidates = this.availableJpdbPlaybackCandidates(jpdbAudioPlaybackCandidates(audioIds));
  if (!candidates.length) throw new Error(uiText(settings.interfaceLanguage, "jpdbExampleAudioUnavailable"));
  const requestId = ++this.playRequestId;
  this.stopCurrent();
  const userGesture = Boolean(options.userGesture);
  const reservedAudio = this.reserveJpdbGestureAudioElement(userGesture);
  const isCurrent = () => true;
  const bagKey = getJpdbAudioBagKey(candidates.map((candidate) => candidate.deckId));
  const byDeckId = new Map(candidates.map((candidate) => [candidate.deckId, candidate]));
  for (const deckId of this.shuffledAudio.order(bagKey, candidates.map((candidate) => candidate.deckId))) {
    const candidate = byDeckId.get(deckId);
    if (!candidate) continue;
    try {
      if (await this.playJpdbAudioCandidate(candidate, settings, requestId, isCurrent, userGesture, reservedAudio)) {
        this.shuffledAudio.markPlayed(bagKey, deckId);
        return true;
      }
    } catch {
      candidate.audioIds.forEach((audioId) => this.markJpdbAudioUnavailable(audioId));
      this.shuffledAudio.markSkipped(bagKey, deckId);
    }
  }
  return await this.playMissingAudioFallback(settings, requestId, isCurrent, userGesture);
  }
  // Runtime audio adapter: ReaderAudioActions calls this through dependency injection.
  // fallow-ignore-next-line unused-class-member
  async playMediaUrl(audioUrl) {
  const settings = this.getSettings();
  this.ensureAudioEnabled(settings);
  if (!canAttemptAudiblePlayback(true)) return false;
  const requestId = ++this.playRequestId;
  this.stopCurrent();
  const playableUrl = await this.prepareDirectMediaUrl(audioUrl, settings);
  const audio = await this.createReadyAudio(playableUrl);
  return await this.playPreparedAudio(audio, requestId, () => true, { userGesture: true });
  }
  // Plays the first workable URL from an ordered candidate list through the
  // same blob-prep + Web Audio CSP fallback as playMediaUrl. Immersion example
  // audio routes here: its pre-fetched page-media blob (registered via the
  // userscript bridge) is recovered by the Web Audio path when a strict
  // media-src (claude.ai, chatgpt.com) refuses the blob URL on a media element.
  async playMediaCandidates(urls, options = {}) {
  const settings = this.getSettings();
  this.ensureAudioEnabled(settings);
  if (!canAttemptAudiblePlayback(true)) return false;
  const isCurrent = options.isCurrent ?? (() => true);
  const candidates = orderedMediaCandidates(urls);
  if (!candidates.length) return false;
  const requestId = ++this.playRequestId;
  this.stopCurrent();
  let lastError;
  for (const url of candidates) {
    if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
    try {
      const playableUrl = await this.prepareDirectMediaUrl(url, settings);
      if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
      const audio = await this.createReadyAudio(playableUrl);
      if (options.playbackRate && Number.isFinite(options.playbackRate)) audio.playbackRate = options.playbackRate;
      if (await this.playPreparedAudio(audio, requestId, isCurrent, { userGesture: true })) return true;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  return false;
  }
  async prepareDirectMediaUrl(audioUrl, settings) {
  if (!shouldFetchDirectMediaAsBlob(audioUrl)) return audioUrl;
  return await this.fetchAudioAsBlobUrl(audioUrl, audioUrl, settings.audioTimeoutMs, settings.audioSelectionMode);
  }
  reserveJpdbGestureAudioElement(userGesture = false) {
  if (!userGesture) return void 0;
  return this.reserveCurrentGestureAudioElement();
  }
  jpdbAudioBlobUrl(audioId, settings) {
  return this.jpdbAudioBlobUrlCache.getOrCreate(audioId, async () => {
    return createPageMediaUrl(await fetchJpdbAudioBlob(audioId, settings));
  });
  }
  async playJpdbAudioCandidate(candidate, settings, requestId, isCurrent, userGesture, reservedAudio) {
  return await this.playJpdbAudioSegment(candidate.audioIds, 0, settings, requestId, isCurrent, userGesture, reservedAudio);
  }
  async playJpdbAudioSegment(audioIds, index, settings, requestId, isCurrent, userGesture, reservedAudio) {
  const audioId = audioIds[index];
  if (!audioId) return false;
  const audioUrl = await this.jpdbAudioBlobUrl(audioId, settings);
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
  const audio = await this.createReadyAudio(audioUrl, reservedAudio);
  if (!await this.playPreparedAudio(audio, requestId, isCurrent, { userGesture })) return false;
  this.queueNextJpdbAudioSegment(audio, audioIds, index + 1, settings, requestId, isCurrent, userGesture);
  return true;
  }
  queueNextJpdbAudioSegment(audio, audioIds, index, settings, requestId, isCurrent, userGesture) {
  if (index >= audioIds.length) return;
  audio.addEventListener("ended", () => {
    if (!this.isPlaybackCurrent(requestId, isCurrent)) return;
    void this.playJpdbAudioSegment(audioIds, index, settings, requestId, isCurrent, userGesture).catch((error) => {
      const audioId = audioIds[index];
      if (audioId) this.markJpdbAudioUnavailable(audioId);
      log$1.warn("JPDB grouped audio segment failed", { audioId }, error);
    });
  }, { once: true });
  }
  stopCurrent(except) {
  this.finishPlayback();
  if (this.current && (this.current !== except || !this.current.loop)) this.current.pause();
  this.current = except;
  if (this.utterance) {
    speechSynthesis.cancel();
    this.utterance = void 0;
  }
  if (this.fallbackChimeContext) {
    void this.fallbackChimeContext.close().catch(() => void 0);
    this.fallbackChimeContext = void 0;
  }
  }
  releaseGestureReservation() {
  const reservation = this.gestureReservation;
  if (!reservation) return;
  this.gestureReservation = void 0;
  window.clearTimeout(reservation.timer);
  }
  expireGestureReservation(audio) {
  const reservation = this.gestureReservation;
  if (!reservation || reservation.audio !== audio) return;
  this.gestureReservation = void 0;
  if (this.current === audio) this.stopCurrent();
  }
  async playFromSource(sourceEntry, context) {
  const { card, settings, requestId, isCurrent } = context;
  const { source } = sourceEntry;
  if (isBrowserTextToSpeechSource(source)) return await this.playFromTextToSpeechSource(source, context);
  const candidates = await this.getCachedAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
  if (!candidates.length) {
    context.errors.push(`${source.type}: ${uiText(settings.interfaceLanguage, "audioSourceReturnedNoAudio")}`);
    return false;
  }
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
  const bagKey = getAudioBagKey(source, card);
  return await this.playFromAudioCandidates(candidates, source.type, context, bagKey);
  }
  async playFromTextToSpeechSource(source, context) {
  const { card, settings, requestId, isCurrent } = context;
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
  const text = source.type === "text-to-speech-reading" ? card.reading : card.spelling;
  const played = await this.playTextToSpeech(text, source.voice, this.textToSpeechSourceBagKey(source, card, settings), {
    avoidIdentity: context.avoidIdentity,
    onAvoided: () => {
      context.attemptState.skippedAvoidedIdentity = true;
    },
    onPlayed: (identity) => this.markAudioIdentityPlayed(card, identity),
    onStart: () => this.startPlayback(requestId, context.playbackLifecycle),
    onEnd: () => this.finishPlayback(requestId)
  });
  return played && this.isPlaybackCurrent(requestId, isCurrent);
  }
  async playFromAudioCandidates(candidates, sourceType, context, bagKey) {
  const { card, settings, requestId, triedUrls, isCurrent, reservedAudio } = context;
  const playableCandidates = this.availableAudioCandidates(sourceType, candidates);
  for (const { candidate, id } of orderAudioCandidates(playableCandidates, audioCandidateSelectionMode(sourceType, settings.audioSelectionMode), bagKey, this.shuffledAudio)) {
    if (!registerAudioAttempt(triedUrls, candidate)) {
      this.shuffledAudio.markSkipped(bagKey, id);
      continue;
    }
    if (this.shouldDeferRepeatedAudioCandidate(candidate, context)) {
      this.shuffledAudio.markSkipped(bagKey, id);
      continue;
    }
    if (await this.playAudioCandidate(
      candidate,
      sourceType,
      id,
      bagKey,
      settings,
      requestId,
      isCurrent,
      card,
      context.errors,
      context.userGesture,
      reservedAudio,
      context.playbackLifecycle
    )) return true;
    this.shuffledAudio.markSkipped(bagKey, id);
  }
  return false;
  }
  async playAudioCandidate(candidate, sourceType, id, bagKey, settings, requestId, isCurrent, card, errors, userGesture, reservedAudio, playbackLifecycle) {
  let audio;
  try {
    audio = await this.createPlayableAudio(candidate, sourceType, settings, reservedAudio, requestId, isCurrent);
  } catch (error) {
    if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
    const fallbackAudio = await this.createDirectMediaFallbackAfterBlobError(candidate, sourceType, reservedAudio).catch(() => void 0);
    if (fallbackAudio) {
      audio = fallbackAudio;
      log$1.warn("Blob-prepared audio failed; retrying as direct media", { url: candidate.url, error: audioErrorMessage(error) });
    } else {
      errors.push(audioErrorMessage(error));
      if (sourceType === "jpdb-tts" && candidate.jpdbAudioId) this.markJpdbAudioUnavailable(candidate.jpdbAudioId);
      return false;
    }
  }
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
  let played = false;
  try {
    played = await this.playPreparedAudio(audio, requestId, isCurrent, { userGesture, playbackLifecycle });
  } catch (error) {
    throw new AudioPlaybackAttemptError(error);
  }
  if (!played) return false;
  this.shuffledAudio.markPlayed(bagKey, id);
  this.markAudioCandidatePlayed(card, candidate);
  return true;
  }
  async createDirectMediaFallbackAfterBlobError(candidate, sourceType, reservedAudio) {
  if (sourceType === "jpdb-tts" || candidate.jpdbAudioId) return void 0;
  if (!shouldFetchMediaUrlAsBlobBeforePlayback(candidate.url)) return void 0;
  if (!/^https?:\/\//i.test(candidate.url)) return void 0;
  return reservedAudio ? this.createReadyAudio(candidate.url, reservedAudio) : this.createAudioElement(candidate.url);
  }
  shouldDeferRepeatedAudioCandidate(candidate, context) {
  const identity = audioCandidatePlaybackIdentity(candidate);
  if (!identity || identity !== context.avoidIdentity) return false;
  context.attemptState.skippedAvoidedIdentity = true;
  return true;
  }
  lastPlayedAudioIdentity(card) {
  for (const key of audioIdentityCardKeys(card)) {
    const identity = this.lastAudioIdentityByCard.get(key);
    if (identity) return identity;
  }
  return void 0;
  }
  markAudioCandidatePlayed(card, candidate) {
  const identity = audioCandidatePlaybackIdentity(candidate);
  if (!identity) return;
  this.markAudioIdentityPlayed(card, identity);
  }
  markAudioIdentityPlayed(card, identity) {
  for (const key of audioIdentityCardKeys(card)) {
    this.lastAudioIdentityByCard.delete(key);
    this.lastAudioIdentityByCard.set(key, identity);
  }
  while (this.lastAudioIdentityByCard.size > LAST_AUDIO_IDENTITY_LIMIT) {
    const oldest = this.lastAudioIdentityByCard.keys().next().value;
    if (!oldest) break;
    this.lastAudioIdentityByCard.delete(oldest);
  }
  }
  availableAudioCandidates(sourceType, candidates) {
  if (sourceType !== "jpdb-tts") return candidates;
  const available = candidates.filter(
    (candidate) => !candidate.jpdbAudioId || !this.isJpdbAudioUnavailable(candidate.jpdbAudioId)
  );
  return available.length ? available : candidates;
  }
  availableJpdbPlaybackCandidates(candidates) {
  const available = candidates.filter((candidate) => candidate.audioIds.every((audioId) => !this.isJpdbAudioUnavailable(audioId)));
  return available.length ? available : candidates;
  }
  markJpdbAudioUnavailable(audioId) {
  this.unavailableJpdbAudioIds.set(audioId, Date.now() + JPDB_AUDIO_UNAVAILABLE_TTL_MS);
  }
  isJpdbAudioUnavailable(audioId) {
  const expiresAt = this.unavailableJpdbAudioIds.get(audioId);
  if (!expiresAt) return false;
  if (expiresAt > Date.now()) return true;
  this.unavailableJpdbAudioIds.delete(audioId);
  return false;
  }
  createPlayableAudio(candidate, sourceType, settings, reservedAudio, requestId, isCurrent) {
  if (sourceType === "jpdb-tts" && candidate.jpdbAudioId) {
    return this.preparePlayableJpdbAudio(candidate.jpdbAudioId, settings, reservedAudio, requestId, isCurrent);
  }
  const audioViaBlob = sourceType !== "jiten-tts" && (settings.audioViaBlob || shouldForceBlobAudioPlayback(sourceType) || shouldForceBlobAudioCandidate(candidate));
  return audioViaBlob ? this.preparePlayableAudio(candidate, settings.audioTimeoutMs, settings.audioSelectionMode, audioViaBlob, reservedAudio, requestId, isCurrent) : reservedAudio ? this.createReadyAudioForRequest(candidate.url, reservedAudio, requestId, isCurrent) : this.createAudioElement(candidate.url);
  }
  async preparePlayableJpdbAudio(audioId, settings, reservedAudio, requestId, isCurrent) {
  const audioUrl = await this.jpdbAudioBlobUrl(audioId, settings);
  return reservedAudio ? this.createReadyAudioForRequest(audioUrl, reservedAudio, requestId, isCurrent) : this.createReadyAudio(audioUrl);
  }
  isPlaybackCurrent(requestId, isCurrent) {
  return requestId === this.playRequestId && isCurrent();
  }
  prepareAudioUrl(candidate, timeoutMs, mode, audioViaBlob) {
  const fetchAsBlob = shouldFetchCandidateAsBlob(candidate, audioViaBlob);
  if (!fetchAsBlob) return Promise.resolve(candidate.url);
  preconnectAudioUrl(candidate.url);
  const key = preparedAudioCacheKey(candidate, mode, fetchAsBlob);
  return this.blobUrlCache.getOrCreate(key, () => this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, timeoutMs, mode));
  }
  preparePlayableAudio(candidate, timeoutMs, mode, audioViaBlob, reservedAudio, requestId, isCurrent) {
  const fetchAsBlob = shouldFetchCandidateAsBlob(candidate, audioViaBlob);
  const key = preparedAudioCacheKey(candidate, mode, fetchAsBlob);
  if (reservedAudio) return this.prepareAudioUrl(candidate, timeoutMs, mode, audioViaBlob).then((audioUrl) => this.createReadyAudioForRequest(audioUrl, reservedAudio, requestId, isCurrent));
  const now = Date.now();
  const cached = this.readyAudioCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise.then((audio) => this.createReadyAudio(audio.src));
  }
  if (cached) this.readyAudioCache.delete(key);
  let promise;
  promise = this.prepareAudioUrl(candidate, timeoutMs, mode, audioViaBlob).then((audioUrl) => this.createReadyAudio(audioUrl)).catch((error) => {
    if (this.readyAudioCache.get(key)?.promise === promise) this.readyAudioCache.delete(key);
    throw error;
  });
  this.readyAudioCache.set(key, { expiresAt: now + READY_AUDIO_CACHE_TTL_MS, promise });
  pruneExpiringMapEntries(this.readyAudioCache, READY_AUDIO_CACHE_LIMIT, now);
  return promise;
  }
  createReadyAudioForRequest(audioUrl, audio, requestId, isCurrent) {
  if (requestId !== void 0 && isCurrent && !this.isPlaybackCurrent(requestId, isCurrent)) {
    return Promise.resolve(audio);
  }
  return this.createReadyAudio(audioUrl, audio);
  }
  async createReadyAudio(audioUrl, audio = this.createAudioElement(audioUrl)) {
  audio.loop = false;
  if (audio.src !== audioUrl) audio.src = audioUrl;
  audio.load?.();
  return audio;
  }
  createAudioElement(audioUrl) {
  const audio = document.createElement("audio");
  audio.src = audioUrl;
  audio.preload = "auto";
  return audio;
  }
  async playPreparedAudio(audio, requestId, isCurrent, options = {}) {
  if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
  this.current = audio;
  this.rewindPreparedAudio(audio);
  try {
    const play = audio.play();
    const started = await Promise.race([
      play.then(() => true),
      waitForAudioContextResumeTimeout(1800)
    ]).finally(() => {
      void play.catch(() => void 0);
    });
    if (!started) {
      if (this.current === audio) audio.pause();
      return false;
    }
    if (!this.isPlaybackCurrent(requestId, isCurrent)) {
      if (this.current === audio) audio.pause();
      return false;
    }
  } catch (error) {
    if (canAttemptWebAudioFallback(options.userGesture) && await this.playViaWebAudio(audio.src, requestId, isCurrent, options.playbackLifecycle)) return true;
    throw error;
  }
  this.startMediaPlayback(audio, requestId, options.playbackLifecycle);
  return true;
  }
  async playViaWebAudio(audioUrl, requestId, isCurrent, playbackLifecycle) {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return false;
  const bytes = await this.webAudioBytes(audioUrl);
  if (!bytes) return false;
  let context;
  try {
    context = new AudioContextCtor();
    if (!await resumeAudioContext(context)) return false;
    if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
    const decoded = await context.decodeAudioData(bytes);
    if (!this.isPlaybackCurrent(requestId, isCurrent)) return false;
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    await new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
      this.startPlayback(requestId, playbackLifecycle);
    });
    this.finishPlayback(requestId);
    return true;
  } catch {
    this.finishPlayback(requestId);
    return false;
  } finally {
    await context?.close().catch(() => void 0);
  }
  }
  startMediaPlayback(audio, requestId, playbackLifecycle) {
  const finish = () => this.finishPlayback(requestId);
  const events = ["ended", "error", "pause"];
  events.forEach((event) => audio.addEventListener(event, finish, { once: true }));
  this.startPlayback(requestId, playbackLifecycle, () => {
    events.forEach((event) => audio.removeEventListener(event, finish));
  });
  }
  startPlayback(requestId, playbackLifecycle, cleanup) {
  this.finishPlayback();
  this.activePlayback = { requestId, onEnd: playbackLifecycle?.onEnd, cleanup };
  try {
    playbackLifecycle?.onStart?.();
  } catch (error) {
    log$1.warn("Audio playback start callback failed", void 0, error);
  }
  }
  finishPlayback(requestId) {
  const active = this.activePlayback;
  if (!active || requestId !== void 0 && active.requestId !== requestId) return;
  this.activePlayback = void 0;
  active.cleanup?.();
  try {
    active.onEnd?.();
  } catch (error) {
    log$1.warn("Audio playback end callback failed", void 0, error);
  }
  }
  // Web Audio decoding is exempt from the page's media-src, so it is the only way
  // to play audio refused by a strict CSP (chatgpt.com, claude.ai). It needs the
  // raw bytes: prefer the Blob we already fetched (via the userscript bridge,
  // which bypasses the page CSP) since re-fetching a blob:/data: URL is itself
  // blocked by connect-src. fetch() is only a fallback for non-strict pages.
  async webAudioBytes(audioUrl) {
  const blob = getPageMediaBlob(audioUrl);
  if (blob) {
    try {
      return await blob.arrayBuffer();
    } catch {
      return void 0;
    }
  }
  if (!audioUrl.startsWith("blob:") && !audioUrl.startsWith("data:")) return void 0;
  try {
    return await (await fetch(audioUrl)).arrayBuffer();
  } catch {
    return void 0;
  }
  }
  rewindPreparedAudio(audio) {
  try {
    if (audio.readyState > HTMLMediaElement.HAVE_NOTHING) audio.currentTime = 0;
  } catch {
  }
  }
  getCachedAudioCandidates(source, card, timeoutMs, proxyUrl) {
  const key = getAudioCandidateCacheKey(source, card);
  const now = Date.now();
  const cached = this.candidateCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise.then(cloneAudioCandidates);
  }
  let promise;
  promise = getAudioCandidates(source, card, timeoutMs, proxyUrl).then((candidates) => {
    if (!shouldCacheAudioCandidates(source, candidates) && this.candidateCache.get(key)?.promise === promise) {
      this.candidateCache.delete(key);
    }
    return cloneAudioCandidates(candidates);
  }).catch((error) => {
    if (this.candidateCache.get(key)?.promise === promise) this.candidateCache.delete(key);
    throw error;
  });
  this.candidateCache.set(key, { expiresAt: now + AUDIO_CANDIDATE_CACHE_TTL_MS, promise });
  pruneExpiringMapEntries(this.candidateCache, AUDIO_CANDIDATE_CACHE_LIMIT, now);
  return promise.then(cloneAudioCandidates);
  }
  async fetchAudioAsBlobUrl(url, sourceUrl, timeoutMs, mode) {
  const settings = this.getSettings();
  return createPageMediaUrl(await fetchAudioBlob(url, sourceUrl, timeoutMs, mode, settings.corsProxyUrl, settings.interfaceLanguage), url);
  }
  playTextToSpeech(text, voiceName, deckKey, options = {}) {
  const settings = this.getSettings();
  if (!("speechSynthesis" in window)) throw new Error(uiText(settings.interfaceLanguage, "textToSpeechUnavailable"));
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetSpeechSynthesisLocale();
    const voices = speechSynthesis.getVoices();
    const choice = this.textToSpeechVoiceChoice(voices, voiceName, utterance.lang, deckKey);
    const identity = textToSpeechPlaybackIdentity(text, choice.voice);
    if (identity === options.avoidIdentity) {
      this.markTextToSpeechVoiceSkipped(choice);
      options.onAvoided?.();
      resolve(false);
      return;
    }
    utterance.voice = choice.voice;
    utterance.onend = () => {
      options.onEnd?.();
      this.markTextToSpeechVoicePlayed(choice);
      options.onPlayed?.(identity);
      resolve(true);
    };
    utterance.onerror = () => {
      options.onEnd?.();
      this.markTextToSpeechVoiceSkipped(choice);
      reject(new Error(uiText(settings.interfaceLanguage, "textToSpeechFailed")));
    };
    this.utterance = utterance;
    options.onStart?.();
    speechSynthesis.speak(utterance);
  });
  }
  textToSpeechVoiceChoice(voices, voiceName, locale, deckKey) {
  const candidates = voicesForLocale(voices, locale);
  const selectedName = voiceName.trim();
  if (selectedName) {
    return {
      voice: candidates.find((voice) => voice.name === selectedName) ?? candidates[0] ?? null
    };
  }
  if (!deckKey || candidates.length < 2) {
    return { voice: candidates[0] ?? null };
  }
  const entries2 = candidates.map((voice, index) => ({
    deckId: textToSpeechVoiceDeckId(voice, index),
    voice
  }));
  const byId = new Map(entries2.map((entry) => [entry.deckId, entry.voice]));
  const deckId = this.shuffledAudio.order(deckKey, entries2.map((entry) => entry.deckId)).find((id) => byId.has(id));
  return {
    deckId,
    deckKey,
    voice: deckId ? byId.get(deckId) ?? null : candidates[0] ?? null
  };
  }
  markTextToSpeechVoicePlayed(choice) {
  if (choice.deckKey && choice.deckId) this.shuffledAudio.markPlayed(choice.deckKey, choice.deckId);
  }
  markTextToSpeechVoiceSkipped(choice) {
  if (choice.deckKey && choice.deckId) this.shuffledAudio.markSkipped(choice.deckKey, choice.deckId);
  }
  textToSpeechSourceBagKey(source, card, settings) {
  return settings.audioSelectionMode === "random" && !source.voice.trim() ? getAudioBagKey(source, card) : void 0;
  }
  textToSpeechTextBagKey(text, voiceName, settings) {
  return settings.audioSelectionMode === "random" && !voiceName.trim() ? ["text-to-speech", text].join("") : void 0;
  }
  async playMissingAudioFallback(settings, requestId, isCurrent, userGesture = false, playbackLifecycle) {
  if (!this.shouldPlayMissingAudioFallback(settings, requestId, isCurrent, userGesture)) return false;
  return await this.tryPlayMissingAudioFallback(requestId, isCurrent, playbackLifecycle);
  }
  shouldPlayMissingAudioFallback(settings, requestId, isCurrent, userGesture = false) {
  if (settings.audioFallbackChimeEnabled && canAttemptWebAudioFallback(userGesture)) return this.isPlaybackCurrent(requestId, isCurrent);
  return false;
  }
  async tryPlayMissingAudioFallback(requestId, isCurrent, playbackLifecycle) {
  try {
    return await this.playSoftChime(requestId, isCurrent, playbackLifecycle);
  } catch {
    return false;
  }
  }
  async playSoftChime(requestId, isCurrent, playbackLifecycle) {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return false;
  const context = new AudioContextCtor();
  this.fallbackChimeContext = context;
  if (!await resumeAudioContext(context)) {
    if (this.fallbackChimeContext === context) this.fallbackChimeContext = void 0;
    await context.close().catch(() => void 0);
    return false;
  }
  if (!this.isPlaybackCurrent(requestId, isCurrent)) {
    if (this.fallbackChimeContext === context) this.fallbackChimeContext = void 0;
    await context.close().catch(() => void 0);
    return false;
  }
  scheduleSoftChime(context, context.currentTime + 0.015);
  this.startPlayback(requestId, playbackLifecycle);
  try {
    await waitForSoftChime();
  } finally {
    this.finishPlayback(requestId);
  }
  if (this.fallbackChimeContext === context) {
    this.fallbackChimeContext = void 0;
    await context.close().catch(() => void 0);
  }
  return true;
  }
}
function voicesForLocale(voices, locale) {
  const canonical = canonicalLanguageTag(locale);
  if (canonical) {
  const exact = voices.filter((voice) => canonicalLanguageTag(voice.lang) === canonical);
  if (exact.length) return exact;
  }
  const language = languageSubtag(locale);
  const matching = language ? voices.filter((voice) => languageSubtag(voice.lang) === language) : [];
  if (matching.length) return matching;
  return language === "ja" ? voices : voices.filter((voice) => languageSubtag(voice.lang) !== "ja");
}
function textToSpeechVoiceDeckId(voice, index) {
  return [
  voice.name,
  voice.lang,
  String(index)
  ].join("\0");
}
function audioCandidatePlaybackIdentity(candidate) {
  if (candidate.jpdbAudioId) return `jpdb:${candidate.jpdbAudioId}`;
  return normalizeAttemptedAudioUrl(candidate.url);
}
function textToSpeechPlaybackIdentity(text, _voice) {
  return [
  "text-to-speech",
  text
  ].join("");
}
function audioIdentityCardKeys(card) {
  const keys = [[
  card.spelling,
  card.reading
  ].join("")];
  if (card.spelling) keys.push(["spelling", card.spelling].join(""));
  return [...new Set(keys)];
}
function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext;
}
async function resumeAudioContext(context) {
  if (context.state !== "suspended") return true;
  const resumed = context.resume().then(() => true).catch(() => false);
  const completed = await Promise.race([
  resumed,
  waitForAudioContextResumeTimeout()
  ]);
  return completed && context.state !== "suspended";
}
function waitForAudioContextResumeTimeout(timeoutMs = WEB_AUDIO_RESUME_TIMEOUT_MS) {
  return new Promise((resolve) => {
  window.setTimeout(() => resolve(false), timeoutMs);
  });
}
function scheduleSoftChime(context, start) {
  const output = createSoftChimeOutput(context, start);
  SOFT_CHIME_NOTES.forEach((note) => scheduleSoftChimeNote(context, output, start, note));
}
function createSoftChimeOutput(context, start) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, start);
  const master = context.createGain();
  master.gain.setValueAtTime(0.72, start);
  filter.connect(master);
  master.connect(context.destination);
  return filter;
}
function scheduleSoftChimeNote(context, output, start, note) {
  const noteStart = start + note.offset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(note.frequency, noteStart);
  gain.gain.setValueAtTime(1e-4, noteStart);
  gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.018);
  gain.gain.exponentialRampToValueAtTime(1e-4, noteStart + note.duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(noteStart);
  oscillator.stop(noteStart + note.duration + 0.03);
}
function waitForSoftChime() {
  return new Promise((resolve) => window.setTimeout(resolve, 460));
}
function shouldReserveGestureAudioElement(request) {
  return request.userGesture && hasGestureReservableAudioSource(request);
}
function shouldUseGestureAudioReservation(request) {
  return (request.userGesture || request.reservedGesture) && hasGestureReservableAudioSource(request);
}
function hasGestureReservableAudioSource(request) {
  return request.sources.some((source) => !isBrowserTextToSpeechSource(source));
}
function apiTextToSpeechFallbackSources(sources, card, settings) {
  const apiSources = sources.filter(isApiTextToSpeechSource);
  if (!shouldAddImplicitJitenTtsFallback(apiSources, card, settings)) return apiSources;
  return [...apiSources, implicitJitenTtsSource(settings)];
}
function shouldAddImplicitJitenTtsFallback(apiSources, card, settings) {
  return settings.audioEnableDefaultSources && !apiSources.some((source) => source.type === "jiten-tts") && hasJitenAudioReference(card);
}
function implicitJitenTtsSource(settings) {
  const configured = settings.audioSources.find((source) => source.type === "jiten-tts");
  return {
  type: "jiten-tts",
  url: "",
  voice: configured?.voice ?? "",
  enabled: true
  };
}
function orderedMediaCandidates(urls) {
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const value of urls) {
  const url = value?.trim();
  if (!url || seen.has(url)) continue;
  seen.add(url);
  candidates.push(url);
  }
  return candidates;
}
function audioErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function userFacingError(copyKey, options = {}) {
  return Object.assign(
  new Error(options.diagnostic ?? uiText("en", copyKey), { cause: options.cause }),
  { name: "UserFacingError", yomuUiCopyKey: copyKey }
  );
}
const log = Logger.scope("ReaderAudioActions");
class ReaderAudioActions {
  constructor(dependencies) {
  this.dependencies = dependencies;
  }
  loadingRequest = 0;
  inFlightTermAudio;
  lastAutoTermAudio;
  async playTermAudio(card, options = {}) {
  if (!this.ensureAudioEnabled()) return;
  const isCurrent = this.termAudioCurrentGuard(options);
  if (this.isStaleTermAudioRequest(isCurrent)) return;
  const key = termAudioRequestKey(card, options);
  const inFlight = this.inFlightTermAudio;
  if (this.shouldJoinInFlightTermAudio(inFlight, key, options)) {
    await inFlight.promise;
    return;
  }
  const autoKey = options.autoPlay ? termAudioAutoRequestKey(card) : key;
  if (options.autoPlay && this.consumeRecentAutoTermAudio(autoKey, options)) return;
  const promise = this.playTermAudioOnce(card, { ...options, isCurrent });
  this.inFlightTermAudio = { key, promise };
  try {
    const played = await promise;
    if (options.autoPlay && played) {
      this.lastAutoTermAudio = {
        key: autoKey,
        at: Date.now(),
        hoverLookupGeneration: options.hoverLookupGeneration
      };
    }
  } finally {
    if (this.inFlightTermAudio?.promise === promise) this.inFlightTermAudio = void 0;
  }
  }
  shouldJoinInFlightTermAudio(inFlight, key, options) {
  return Boolean(options.autoPlay && inFlight?.key === key);
  }
  async playTermAudioOnce(card, options = {}) {
  const isCurrent = this.termAudioCurrentGuard(options);
  const loading = this.beginLoadingAudioRequest(isCurrent);
  if (!loading) return false;
  try {
    this.dependencies.stopImmersionAudio();
    const played = await this.dependencies.audio.play(card, {
      isCurrent,
      userGesture: options.userGesture,
      reservedGesture: options.autoPlay,
      playbackLifecycle: {
        onStart: () => this.setPlaying(loading.popover, loading.requestId),
        onEnd: () => this.clearPlaying(loading.popover, loading.requestId)
      }
    });
    return played;
  } catch (error) {
    log.warn("Term audio playback failed", { term: card.spelling }, error);
    this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, "audioPlaybackFailed"));
    return false;
  } finally {
    this.clearLoading(loading.popover, loading.requestId);
  }
  }
  termAudioCurrentGuard(options) {
  return options.isCurrent ?? (options.hoverLookupGeneration === void 0 ? void 0 : () => this.dependencies.getHoverLookupGeneration() === options.hoverLookupGeneration);
  }
  isStaleTermAudioRequest(isCurrent) {
  return Boolean(isCurrent && !isCurrent());
  }
  beginLoadingAudioRequest(isCurrent) {
  if (this.isStaleTermAudioRequest(isCurrent)) return null;
  const requestId = ++this.loadingRequest;
  const popover = this.dependencies.getActivePopover();
  this.setLoading(popover, requestId);
  return { popover, requestId };
  }
  consumeRecentAutoTermAudio(key, options) {
  const recent = this.lastAutoTermAudio;
  if (!recent || recent.key !== key) return false;
  if (Date.now() - recent.at > 250) return false;
  if (!this.isSameRecentAutoTermAudioHover(recent, options)) return false;
  this.lastAutoTermAudio = { key, at: Date.now(), hoverLookupGeneration: recent.hoverLookupGeneration };
  return true;
  }
  isSameRecentAutoTermAudioHover(recent, options) {
  if (recent.hoverLookupGeneration === void 0 || options.hoverLookupGeneration === void 0) return true;
  return recent.hoverLookupGeneration === options.hoverLookupGeneration;
  }
  async playSentenceAudio(sentence) {
  if (!this.ensureAudioEnabled()) return;
  const text = sentence?.trim();
  if (!text) throw userFacingError("noSentenceToRead");
  const voice = this.dependencies.getSettings().audioSources.find(
    (source) => source.enabled && (source.type === "text-to-speech" || source.type === "text-to-speech-reading") && source.voice.trim()
  )?.voice.trim() ?? "";
  this.dependencies.stopImmersionAudio();
  await this.dependencies.audio.playJapaneseText(text, voice);
  }
  async playJpdbExampleAudio(audioIds, fallbackSentence) {
  if (!this.ensureAudioEnabled()) return;
  this.dependencies.stopImmersionAudio();
  const played = await this.dependencies.audio.playJpdbAudio(audioIds, { userGesture: true });
  if (!played && fallbackSentence) await this.playSentenceAudio(fallbackSentence);
  }
  async playMediaUrl(audioUrl) {
  if (!this.ensureAudioEnabled()) return false;
  this.dependencies.stopImmersionAudio();
  return await this.dependencies.audio.playMediaUrl(audioUrl);
  }
  ensureAudioEnabled() {
  const settings = this.dependencies.getSettings();
  if (settings.audioEnabled) return true;
  this.dependencies.toast(uiText(settings.interfaceLanguage, "audioPlaybackDisabledToast"));
  return false;
  }
  setLoading(popover, requestId) {
  if (!popover?.isConnected) return;
  popover.dataset.audioLoading = "true";
  popover.dataset.audioLoadingRequest = String(requestId);
  }
  clearLoading(popover, requestId) {
  if (!popover?.isConnected || popover.dataset.audioLoadingRequest !== String(requestId)) return;
  delete popover.dataset.audioLoading;
  delete popover.dataset.audioLoadingRequest;
  }
  setPlaying(popover, requestId) {
  if (!popover?.isConnected || popover.dataset.audioLoadingRequest !== String(requestId)) return;
  this.clearLoading(popover, requestId);
  popover.dataset.audioPlaying = "true";
  popover.dataset.audioPlayingRequest = String(requestId);
  }
  clearPlaying(popover, requestId) {
  if (!popover || popover.dataset.audioPlayingRequest !== String(requestId)) return;
  delete popover.dataset.audioPlaying;
  delete popover.dataset.audioPlayingRequest;
  }
}
function termAudioRequestKey(card, options) {
  return [
  card.source ?? "",
  String(card.vid ?? ""),
  String(card.sid ?? ""),
  String(card.rid ?? ""),
  card.spelling,
  card.reading,
  options.userGesture ? "gesture" : "auto",
  options.hoverLookupGeneration === void 0 ? "" : String(options.hoverLookupGeneration)
  ].join("\0");
}
function termAudioAutoRequestKey(card) {
  return [
  card.source ?? "",
  String(card.vid ?? ""),
  String(card.sid ?? ""),
  String(card.rid ?? ""),
  card.spelling,
  card.reading
  ].join("\0");
}
registerYomuCompanion("audio", {
  AudioPlayer,
  ReaderAudioActions
});
})();
