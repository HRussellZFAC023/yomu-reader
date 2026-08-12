(function() {
"use strict";
const APP_NAME = "よむ";
const ACADEMY_SRS_LABEL = "Academy";
const APP_SLUG = "yomu";
const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
const GITHUB_OWNER = "HRussellZFAC023";
const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
const DOCS_ORIGIN = "https://yomureader.com";
const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
class RetryableTimeoutError extends Error {
  constructor(message = "Request timed out.") {
  super(message);
  this.name = "RetryableTimeoutError";
  }
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
function attempt(fn, fallback, label) {
  try {
  return fn();
  } catch (error) {
  return fallback;
  }
}
function attemptVoid(fn, label) {
  try {
  fn();
  } catch (error) {
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
function bridgeEventId(event) {
  return safeReadString(normalizedBridgeEventDetail(event), "id");
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
function isPromiseLike(value) {
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
  const directResult = callAddEventListener$1(directAdd, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowAddEventListener === directAdd ? { called: false } : callAddEventListener$1(initialWindowAddEventListener, target, type, listener, options);
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
  const directResult = callRemoveEventListener$1(directRemove, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowRemoveEventListener === directRemove ? { called: false } : callRemoveEventListener$1(initialWindowRemoveEventListener, target, type, listener, options);
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
  const result = callAddEventListener$1(prototypeAdd, target, type, listener, options);
  if (result.called) return result;
  }
  return { called: false };
}
function removeListenerWithPrototypeMethod(target, directRemove, type, listener, options) {
  for (const prototypeRemove of eventTargetPrototypeMethods(target, "removeEventListener")) {
  if (prototypeRemove === directRemove) continue;
  const result = callRemoveEventListener$1(prototypeRemove, target, type, listener, options);
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
  return attempt(() => source[key], void 0);
}
function callEventTargetMethod(method, target, event) {
  if (!method) return { called: false };
  try {
  return { called: true, result: method.call(target, event) };
  } catch (error) {
  return { called: false, error };
  }
}
function callAddEventListener$1(method, target, type, listener, options) {
  if (!method) return { called: false };
  try {
  method.call(target, type, listener, options);
  return { called: true };
  } catch (error) {
  return { called: false, error };
  }
}
function callRemoveEventListener$1(method, target, type, listener, options) {
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
  return callAddEventListener$1(readMethod(window, "addEventListener"), window, type, listener, options);
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
  return callRemoveEventListener$1(readMethod(window, "removeEventListener"), window, type, listener, options);
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
  });
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
  return attempt(() => typeof descriptor.value !== "function", false);
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
const BRIDGE_REQUEST_EVENT = "yomu-userscript-http-request";
const BRIDGE_RESPONSE_EVENT = "yomu-userscript-http-response";
const BRIDGE_PROBE_EVENT = "yomu-userscript-http-probe";
const BRIDGE_PROBE_RESPONSE_EVENT = "yomu-userscript-http-probe-response";
const BRIDGE_MARKER = "yomuUserscriptHttpBridge";
const BRIDGE_TIMEOUT_MS = 3e4;
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
  let responseCleanup = noop;
  let bridgeReadyCleanup = noop;
  const finish = (alive) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    responseCleanup();
    bridgeReadyCleanup();
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
  bridgeReadyCleanup = addBridgeEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, () => finish(true));
  dispatchBridgeEvent(BRIDGE_PROBE_EVENT, { id });
  });
  eventBridgeProbeInFlight = probe;
  void probe.then(() => {
  if (eventBridgeProbeInFlight === probe) eventBridgeProbeInFlight = void 0;
  });
  return probe;
}
function userscriptHttpEventBridge() {
  if (typeof window === "undefined" || typeof document === "undefined") return void 0;
  if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== "true") return void 0;
  return tagEventBridgeRequest((options) => new Promise((resolve, reject) => {
  const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const timeout = window.setTimeout(() => {
    cleanup();
    options.ontimeout?.();
    reject(new Error("Request timed out."));
  }, options.timeout ?? BRIDGE_TIMEOUT_MS);
  let cleanupBridgeResponseListener = noop;
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanupBridgeResponseListener();
  };
  const onResponse = (event) => {
    handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
  };
  cleanupBridgeResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
  const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
  dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, options: requestOptions });
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
    if (isPromiseLike(result)) result.then(handleLoad, handleError);
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
async function requestJson(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "json" });
  return value;
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
const RTL_SCRIPTS = /* @__PURE__ */ new Set(["Arab", "Hebr", "Thaa", "Nkoo", "Adlm", "Syrc"]);
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
  return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
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
function interfaceLocaleByTag(tag) {
  return LOCALE_BY_KEY.get(tag);
}
const ENGLISH_INTERFACE_LOCALE = (() => {
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
const FIRST_STRONG_ISOLATE = "⁨";
const POP_DIRECTIONAL_ISOLATE = "⁩";
function interfaceDirectionOf(tag) {
  return (interfaceLocaleByTag(tag) ?? ENGLISH_INTERFACE_LOCALE).direction;
}
function isRtlInterface(tag) {
  return interfaceDirectionOf(tag) === "rtl";
}
function isolate(value) {
  if (!value) return value;
  return `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;
}
function formatIsolated(message, values) {
  return Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, isolate(String(value))),
  message
  );
}
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
  onboardingChooseTarget: "Choose a learning language…",
  onboardingTargetRequired: "Choose a learning language before continuing.",
  onboardingUnselectedTargetName: "your learning language",
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
  gamingChooseTargetTitle: "Choose the language you want to read",
  gamingChooseTargetBody: "Yomu can read any supported language on your screen after you choose it.",
  gamingChooseTargetAction: "Choose a language",
  gamingTargetRequired: "Choose the language you want to read before capturing your screen.",
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
  accountSettingsTrustedSurfaceTitle: "Open Settings in Study",
  accountSettingsTrustedSurfaceHelp: "This page can read and change its own controls, so Yomu does not put settings, account details, imports, or recovery codes here. Open the Yomu-owned Study page to edit and save them safely.",
  openAccountSettingsTrustedSurface: "Open Study settings",
  onboardingTrustedSurfaceEyebrow: "Finish setup in Study",
  onboardingTrustedSurfaceCopy: "This website can change anything shown here. Choose your learning language and preferences on the Yomu-owned Study page.",
  openOnboardingTrustedSurface: "Continue setup in Study",
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
  sourceHelpWanikaniKanji: "WaniKani kanji meaning/reading mnemonics, level, and SRS status.",
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
  // D43 interface-locale picker: Yomu ships two of 33 in-scope interface languages.
  // The picker names what the other 31 are waiting on instead of silently replacing them with English.
  interfaceLocalesReady: "Ready now",
  interfaceLocalesInProgress: "On the way",
  interfaceLocaleRtlPending: "Right-to-left layout checks are still running",
  interfaceLocaleTranslationPending: "Translation is still in progress",
  interfaceLocaleBlockedNote: "These are coming. Each one shows what it is waiting on.",
  interfaceLocaleReadyCount: "{ready} of {total} interface languages are ready."
  }
};
const CARD_STATE_LABEL_KEYS = {
  new: "stateNew",
  learning: "stateLearning",
  young: "stateYoung",
  mature: "stateMature",
  known: "stateKnown",
  mastered: "stateMastered",
  due: "stateDue",
  failed: "stateFailed",
  locked: "stateLocked",
  "never-forget": "stateNeverForget",
  blacklisted: "stateBlacklisted",
  suspended: "stateSuspended",
  "in-deck": "stateInDeck",
  "not-in-deck": "stateNotInDeck",
  redundant: "stateRedundant",
  frequent: "stateFrequent",
  unparsed: "stateUnparsed"
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
  gamingChooseTargetTitle: "読みたい言語を選んでください",
  gamingChooseTargetBody: "言語を選ぶと、画面上の対応言語を読み取れるようになります。",
  gamingChooseTargetAction: "言語を選ぶ",
  gamingTargetRequired: "画面をキャプチャする前に、読みたい言語を選んでください。",
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
onboardingChooseTarget	学習する言語を選ぶ…
onboardingTargetRequired	続ける前に学習する言語を選んでください。
onboardingUnselectedTargetName	学習中の言語
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
  accountSettingsTrustedSurfaceTitle: "Studyで設定を開く",
  accountSettingsTrustedSurfaceHelp: "このページは自身の入力欄を読み書きできるため、よむは設定、アカウント情報、インポート、復旧コードをここに表示しません。よむが管理するStudyページで安全に編集・保存してください。",
  openAccountSettingsTrustedSurface: "Studyの設定を開く",
  onboardingTrustedSurfaceEyebrow: "Studyで初期設定を完了",
  onboardingTrustedSurfaceCopy: "このウェブサイトは、ここに表示された内容を変更できます。よむが管理するStudyページで学習言語と設定を安全に選んでください。",
  openOnboardingTrustedSurface: "Studyで初期設定を続ける",
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
sourceHelpWanikaniKanji	WaniKaniの漢字の意味・読みの覚え方、レベル、SRS状態です。
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
const JA_GRAMMAR_RULE_COPY_URL = `${DOCS_BASE_URL}data/ja-grammar-rule-copy.json`;
let jaGrammarRuleCopyPromise;
function resolveUiLanguage(language) {
  if (language === "ja" || language === "en") return language;
  return browserPrefersJapanese() ? "ja" : "en";
}
function nextExplicitUiLanguage(language) {
  return resolveUiLanguage(language) === "ja" ? "en" : "ja";
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
async function grammarRuleText(language, ruleId) {
  if (resolveUiLanguage(language) !== "ja") return void 0;
  const copy = await loadJaGrammarRuleCopy();
  return copy[ruleId];
}
function uiText(language, key) {
  return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? COPY.en[key] : COPY.en[key];
}
function cardStateLabel(state, language, fallback = state) {
  const key = CARD_STATE_LABEL_KEYS[state];
  return key ? uiText(language, key) : fallback;
}
function audioSourceLabel(language, type) {
  return uiText(language, AUDIO_SOURCE_LABEL_KEYS[type]);
}
function formatUiText(language, key, values) {
  const message = uiText(language, key);
  return isRtlInterface(language) ? formatIsolated(message, values) : Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  message
  );
}
function uiList(language, parts) {
  return new Intl.ListFormat(resolveUiLanguage(language), { style: "short", type: "conjunction" }).format(parts);
}
const AUDIO_SOURCE_LABEL_KEYS = {
  jpod101: "audioSourceJpod101",
  "language-pod-101": "audioSourceLanguagePod101",
  jisho: "audioSourceJisho",
  bunpro: "audioSourceBunpro",
  "lingua-libre": "audioSourceLinguaLibre",
  wiktionary: "audioSourceWiktionary",
  "jiten-tts": "audioSourceJitenTts",
  "jpdb-tts": "audioSourceJpdbTts",
  "text-to-speech": "audioSourceTextToSpeech",
  "text-to-speech-reading": "audioSourceTextToSpeechReading",
  custom: "audioSourceCustom",
  "custom-json": "audioSourceCustomJson"
};
async function loadJaGrammarRuleCopy() {
  jaGrammarRuleCopyPromise ??= requestJson(JA_GRAMMAR_RULE_COPY_URL, {
  failureLabel: "Japanese grammar copy request",
  timeoutMs: 15e3,
  allowDirectCrossOrigin: true,
  credentials: "omit",
  anonymous: true
  }).then(normalizeGrammarRuleCopy).catch(() => {
  jaGrammarRuleCopyPromise = void 0;
  return {};
  });
  return jaGrammarRuleCopyPromise;
}
function normalizeGrammarRuleCopy(value) {
  if (!isGrammarRuleCopyRecord(value)) return {};
  const copy = {};
  for (const [ruleId, item] of Object.entries(value)) {
  const ruleCopy = normalizeGrammarRuleCopyItem(item);
  if (!ruleCopy) continue;
  copy[ruleId] = ruleCopy;
  }
  return copy;
}
function normalizeGrammarRuleCopyItem(value) {
  if (!isGrammarRuleCopyRecord(value)) return null;
  const kind = grammarRuleCopyText(value.kind);
  const short = grammarRuleCopyText(value.short);
  const detail = grammarRuleCopyText(value.detail);
  if (kind === void 0 || short === void 0 || detail === void 0) return null;
  return { kind, short, detail };
}
function grammarRuleCopyText(value) {
  return typeof value === "string" ? value : void 0;
}
function isGrammarRuleCopyRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
let sandboxCompanions = {};
function registerYomuCompanion(key, value) {
  writeYomuCompanions({
  ...yomuCompanions(),
  [key]: value
  });
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
registerYomuCompanion("i18n", {
  CARD_STATE_LABEL_KEYS,
  audioSourceLabel,
  cardStateLabel,
  formatUiText,
  grammarRuleText,
  nextExplicitUiLanguage,
  resolveUiLanguage,
  uiList,
  uiText
});
})();
