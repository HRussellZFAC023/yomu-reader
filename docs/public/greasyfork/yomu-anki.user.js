(function() {
"use strict";
function isPromiseLike$1(value) {
  return Boolean(value && typeof value.then === "function");
}
async function runLimited(items, concurrency, worker) {
  if (!items.length) return;
  const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
  while (nextIndex < items.length) {
    const index = nextIndex++;
    await worker(items[index], index);
  }
  }));
}
function unique(items) {
  return [...new Set(items)];
}
function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
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
const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
const JPDB_DEFINITION_SOURCE_ID = "__jpdb__";
const JITEN_DEFINITION_SOURCE_ID = "__jiten__";
const BUNPRO_DEFINITION_SOURCE_ID = "__bunpro__";
const WANIKANI_DEFINITION_SOURCE_ID = "__wanikani__";
const ANKI_SOURCE_ID = "__anki__";
const STUDY_TRANSLATION_SOURCE_ID = "__study_translation__";
const STUDY_GRAMMAR_SOURCE_ID = "__study_grammar__";
const IMMERSION_KIT_SOURCE_ID = "__immersion_kit__";
function isAppleTouchBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent2 = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /iPad|iPhone|iPod/i.test(userAgent2) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent2) || platform === "MacIntel");
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
  if (!isHttpUrl$1(url)) return url;
  try {
  const target = new URL(url, location.href);
  return target.origin === location.origin ? target.href : null;
  } catch {
  return null;
  }
}
function isHttpUrl$1(url) {
  return /^https?:\/\//i.test(url);
}
function fetchWithTimeout(url, options) {
  const {
  timeoutMs,
  allowPublicProxies: _allowPublicProxies,
  allowConfiguredProxy: _allowConfiguredProxy,
  allowSensitiveConfiguredProxy: _allowSensitiveConfiguredProxy,
  allowDirectCrossOrigin: _allowDirectCrossOrigin,
  signal,
  ...init
  } = options;
  if (!timeoutMs) return fetch(url, { ...init, signal });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
  window.clearTimeout(timeout);
  signal?.removeEventListener("abort", abort);
  });
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
const LEARNER_LANGUAGE_IDS = [
  "sq",
  "grc",
  "ar",
  "yue",
  "zh",
  "da",
  "nl",
  "en",
  "fi",
  "fr",
  "de",
  "el",
  "hu",
  "id",
  "it",
  "km",
  "ko",
  "lo",
  "la",
  "mn",
  "fa",
  "pl",
  "pt",
  "ro",
  "ru",
  "sh",
  "es",
  "sv",
  "tl",
  "th",
  "tr",
  "vi"
];
const configuredLanguages = languageConfig.languages;
const LEARNER_LANGUAGES = Object.freeze(
  configuredLanguages.map(
  (language) => Object.freeze({
    ...language,
    scripts: Object.freeze([...language.scripts])
  })
  )
);
const LANGUAGE_BY_ID = new Map(
  LEARNER_LANGUAGES.map((language) => [language.id, language])
);
function learnerLanguageById(id) {
  const language = LANGUAGE_BY_ID.get(id);
  if (!language) throw new Error(`Unknown Slice 1 learner language: ${id}`);
  return language;
}
function isLearnerLanguageId(value) {
  return LEARNER_LANGUAGE_IDS.includes(value);
}
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
const COPY = {
  en: {
  settingsTitle: `${APP_NAME} Settings`,
  welcomeLabel: `${APP_NAME} welcome`,
  onboardingEyebrow: "Japanese, wherever it appears",
  onboardingCopy: "Make Japanese text, subtitles, and images tappable.",
  onboardingLanguage: "Settings language",
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
  featureTextBody: "Hover or tap scanned Japanese.",
  featureImages: "Images",
  featureImagesBody: "Read any image by tapping it.",
  featureVideo: "Video",
  featureVideoBody: "Make subtitle words tappable.",
  featureControl: "Control",
  featureControlBody: "Tune features, shortcuts, and color.",
  featureStudy: "Study",
  featureStudyBody: "Review words and kanji on the study page.",
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
  puckStudyPage: "Study page",
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
  loadJapaneseSubtitles: "Load Japanese subtitles",
  loadNativeSubtitles: "Load native subtitles",
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
  ...parseUiCopyTable(String.raw`
interfaceLocalesReady	今すぐ使えます
interfaceLocalesInProgress	準備中
interfaceLocaleRtlPending	右から左へのレイアウト確認が進行中です
interfaceLocaleTranslationPending	翻訳が進行中です
interfaceLocaleBlockedNote	これらの言語も準備中です。それぞれ何を待っているか表示します。
interfaceLocaleReadyCount	表示言語{total}件のうち{ready}件が使えます。
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
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
featureTextBody	日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と漢字を復習。
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
loadJapaneseSubtitles	日本語字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
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
pageScanModeManual	指示したときだけ日本語を検出
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckStudyPage	学習ページ
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
clampedRowReadings	省略行のふりがな
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
function cardStateLabel(state, language, fallback = state) {
  const key = CARD_STATE_LABEL_KEYS[state];
  return key ? uiText(language, key) : fallback;
}
function formatUiText(language, key, values) {
  const message = uiText(language, key);
  return isRtlInterface(language) ? formatIsolated(message, values) : Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  message
  );
}
const CORE_COLOR_TOKENS = {
  white: "#ffffff"
};
const BRAND_COLOR_TOKENS = {
  accent: "#5ea780",
  consoleAccent: "#247a58"
};
const OVERLAY_COLOR_TOKENS = {
  text: CORE_COLOR_TOKENS.white
};
const LOGGER_COLOR_TOKENS = {
  debug: "#6b7280",
  warn: "#a15c00",
  error: "#b91c1c"
};
const ANKI_CARD_COLOR_TOKENS = {
  text: "#f4f7fb",
  background: "#15181e",
  muted: "#bac3d0",
  sentenceBorder: "#323843",
  sentenceBackground: "#1e232b",
  sentenceText: "#d8dee8",
  highlight: "#7ad119",
  sectionBorder: "#303641",
  sectionBackground: "#1b2028",
  headingText: "#c2cad7",
  labelText: "#92a0b3",
  expressionText: CORE_COLOR_TOKENS.white,
  readingText: "#aab4c2",
  chipBorder: "#4b5565",
  chipText: "#cdd5e1",
  metaLabelText: "#8f9aaa",
  tableBorder: "#353c47"
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
const HOSTED_DEMO_SETTINGS_KEYS = new Set(Object.keys(HOSTED_DEMO_VIDEO_SETTINGS_PATCH));
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
function yomuAnkiCompanion() {
  return yomuCompanions().anki;
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
function managedStateEpochTokenRelation(storedToken, current) {
  if (storedToken === managedStateEpochToken(current)) return "same";
  const separator = storedToken.indexOf(":");
  if (separator <= 0) return "malformed";
  const generationText = storedToken.slice(0, separator);
  if (!/^(?:0|[1-9]\d*)$/u.test(generationText)) return "malformed";
  const storedGeneration = Number(generationText);
  if (!Number.isSafeInteger(storedGeneration)) return "malformed";
  if (storedGeneration < current.generation) return "older";
  if (storedGeneration > current.generation) return "newer";
  return "conflict";
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
async function managedGmValue(getValue, key, fallback, epoch) {
  const read = await readManagedGmValue(getValue, key, epoch);
  return read.kind === "found" ? read.value : fallback;
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
  if (isPromiseLike$1(stored)) return null;
  const shared2 = parseManagedStateEpoch(isMissingSentinel(stored) ? void 0 : stored);
  managedStateEpochSession.assertCurrentSync(shared2.generation === 0 ? void 0 : shared2);
  cacheManagedStateEpochForLocalFallback(shared2);
  return shared2;
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
async function assertManagedStateMutationAllowed() {
  const getValue = asyncGmGetValue();
  const epoch = await assertRealmManagedStateEpoch(getValue);
  await assertManagedStateMutationFence(getValue, epoch);
  return epoch;
}
async function gmStorageGet(key, fallback) {
  const getValue = asyncGmGetValue();
  if (!getValue) return localOnlyManagedValue(key, fallback, await assertRealmManagedStateEpoch(null));
  let epoch;
  try {
  epoch = await assertRealmManagedStateEpoch(getValue);
  return await sharedManagedValue(getValue, key, fallback, epoch);
  } catch (error) {
  return failedManagedReadValue(error, key, fallback, epoch);
  }
}
async function sharedManagedValue(getValue, key, fallback, epoch) {
  const pendingPatch = pendingHostedLocalPatch();
  if (pendingPatch) {
  const shared2 = await managedGmValue(getValue, key, void 0, epoch);
  const sharedRecord = isPlainRecord(shared2) ? shared2 : {};
  const reconciled = { ...sharedRecord, ...pendingPatch };
  await gmStorageSet(key, reconciled);
  return reconciled;
  }
  const read = await readManagedGmValue(getValue, key, epoch);
  if (read.kind === "found") return read.value;
  if (read.kind === "deleted") return fallback;
  const migrated = localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, MISSING) : MISSING;
  if (!isMissingSentinel(migrated)) {
  const promoted = sanitizedStrandedLocalValue(key, migrated);
  await gmStorageSet(key, promoted);
  return promoted;
  }
  return fallback;
}
function failedManagedReadValue(error, key, fallback, epoch) {
  if (isStaleManagedStateEpochError(error)) throw error;
  debugStorageError("GM storage read failed", key, error);
  if (epoch && localMirrorBelongsToEpoch(key, epoch)) {
  return localStorageGet(key, fallback);
  }
  return fallback;
}
function localOnlyManagedValue(key, fallback, epoch) {
  const local = localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, MISSING) : MISSING;
  if (!isMissingSentinel(local)) return local;
  return fallback;
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
  if (isPromiseLike$1(stored)) return { kind: "fallback" };
  const readFromCurrentSlot = !isMissingSentinel(stored);
  if (isMissingSentinel(stored) && storageKey !== key) {
    stored = getValue(key, MISSING);
    if (isPromiseLike$1(stored)) return { kind: "fallback" };
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
const HOSTED_SETTINGS_BLOB_KEY = "jpdb-popup-reader-settings";
const HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD = "__yomuHostedPendingGmPatch";
function sanitizedStrandedLocalValue(key, value) {
  if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record2 = { ...value };
  delete record2[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
  for (const demoKey of HOSTED_DEMO_SETTINGS_KEYS) delete record2[demoKey];
  return record2;
}
function pendingHostedLocalPatch(key, epoch) {
  return void 0;
}
function localFallbackValueForWrite(key, value) {
  if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const current = sanitizedStrandedLocalValue(key, value);
  const previousValue = localStorageGet(key, void 0);
  const previous = isPlainRecord(previousValue) ? sanitizedStrandedLocalValue(key, previousValue) : void 0;
  const earlierPatch = isPlainRecord(previousValue) && isPlainRecord(previousValue[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD]) ? previousValue[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD] : {};
  if (!previous) return value;
  const changed = changedRecordFields(previous, current);
  return {
  ...value,
  [HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD]: { ...earlierPatch, ...changed }
  };
}
function changedRecordFields(previous, current) {
  const changed = {};
  for (const [field, value] of Object.entries(current)) {
  if (JSON.stringify(previous[field]) !== JSON.stringify(value)) changed[field] = value;
  }
  return changed;
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
    if (isPromiseLike$1(result)) {
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
    if (isPromiseLike$1(result)) {
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
const ANKI_CONNECT_NEEDS_BRIDGE_MESSAGE = "AnkiConnect needs the userscript request bridge for cross-origin endpoints.";
async function postAnkiJson(url, body, timeoutMs) {
  const userscriptRequest = getUserscriptHttpRequest();
  if (userscriptRequest) return await postAnkiJsonWithUserscript(userscriptRequest, url, body, timeoutMs);
  if (!canDirectFetchAnkiConnect(url)) {
  return Promise.reject(new Error(ANKI_CONNECT_NEEDS_BRIDGE_MESSAGE));
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
  signal: controller.signal
  }).then(async (response) => {
  if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
  return response.json();
  }).catch((error) => {
  if (error instanceof DOMException && error.name === "AbortError") throw new Error("AnkiConnect timed out.");
  throw error;
  }).finally(() => {
  window.clearTimeout(timeoutId);
  });
}
function hasUserscriptAnkiBridge() {
  return Boolean(getUserscriptHttpRequest());
}
function isAnkiConnectAvailabilityError(error) {
  if (error instanceof Error && error.cause && error.cause !== error) {
  return isAnkiConnectAvailabilityError(error.cause);
  }
  if (!(error instanceof Error)) return false;
  return /timed out|failed to fetch|networkerror|request bridge/i.test(error.message);
}
function postAnkiJsonWithUserscript(userscriptRequest, url, body, timeoutMs) {
  return requestViaUserscriptManager(userscriptRequest, {
  details: {
    method: "POST",
    url,
    headers: { "Content-Type": "application/json" },
    data: body,
    responseType: "json",
    timeout: timeoutMs
  },
  readResponse: (response) => {
    if (response.status < 200 || response.status >= 300) throw new Error(`AnkiConnect request failed (${response.status}).`);
    return response.response;
  },
  onError: (error) => error instanceof Error ? error : new Error("AnkiConnect request failed."),
  onTimeout: () => new Error("AnkiConnect timed out.")
  });
}
function canDirectFetchAnkiConnect(url) {
  return canDirectFetchAnkiConnectFrom(url, safeLocationHref());
}
function canDirectFetchAnkiConnectFrom(url, currentHref) {
  const current = readAnkiUrl(currentHref);
  if (!current) return false;
  const target = readAnkiUrl(url, current.href);
  if (!target || !isHttpUrl(target)) return false;
  return target.origin === current.origin;
}
function readAnkiUrl(value, base) {
  try {
  return new URL(value, base);
  } catch {
  return null;
  }
}
function isHttpUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}
function safeLocationHref() {
  return typeof location === "undefined" ? "" : location.href;
}
function resolvedAnkiDeckName(deckOverride, settings) {
  return deckOverride?.trim() || settings.ankiDeck || "よむ";
}
function resolvedAnkiModelName(settings) {
  return settings.ankiModel || "よむ Japanese";
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
const UNIFIED_IDEOGRAPH_RE = /^\p{Unified_Ideograph}$/u;
const UNIFIED_IDEOGRAPH_RUN_RE = /\p{Unified_Ideograph}+/gu;
function isUnifiedIdeograph(value) {
  return UNIFIED_IDEOGRAPH_RE.test(value);
}
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
const BMP_KANJI_CHARACTER_RE = new RegExp(`^[${KANJI}]$`, "u");
function isJapaneseKanjiCharacter(value) {
  return BMP_KANJI_CHARACTER_RE.test(value) || value.length > 1 && isUnifiedIdeograph(value);
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
const LANGUAGE_PROFILE_SCHEMA_VERSION = 2;
const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 9;
const SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS = [9];
function isSupportedLearningTargetModuleInterfaceVersion(value) {
  return SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS.includes(value);
}
const LEARNING_TARGET_CAPABILITY_IDS = [
  "term-lookup",
  "character-lookup",
  "segmentation",
  "morphology",
  "reading-annotation",
  "pronunciation",
  "frequency",
  "examples",
  "grammar",
  "audio",
  "text-to-speech",
  "ocr",
  "subtitles",
  "mining",
  "srs",
  "grading",
  "typing",
  "handwriting"
];
const NO_CAPABILITIES = Object.freeze(
  Object.fromEntries(LEARNING_TARGET_CAPABILITY_IDS.map((id) => [id, false]))
);
const CORE_DELIVERED_CAPABILITIES = Object.freeze({
  "term-lookup": true,
  segmentation: true,
  pronunciation: true,
  "text-to-speech": true,
  subtitles: true,
  typing: true,
  mining: true,
  srs: true,
  grading: true
});
function learningTargetCapabilities(declared = {}, hasGrammarRules = false) {
  return Object.freeze({
  ...NO_CAPABILITIES,
  ...declared,
  ...CORE_DELIVERED_CAPABILITIES,
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
  return Object.freeze({
  interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
  id: spec.id,
  language,
  direction,
  collationLocale: spec.collationLocale ?? language,
  capabilities: learningTargetCapabilities(spec.capabilities, grammar.rules.length > 0),
  featureSemantics: Object.freeze({
    ...spec.featureSemantics,
    phoneticScripts: Object.freeze([...spec.featureSemantics.phoneticScripts])
  }),
  typography: Object.freeze({
    contentLocale: language,
    direction,
    readingAnnotationMode: "none",
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
  capabilities: {
  "character-lookup": true,
  morphology: true,
  "reading-annotation": true,
  frequency: true,
  examples: true,
  audio: true,
  ocr: true,
  handwriting: true
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
  templateLanguageToken: "ja"
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
function referenceOnly(referenceUrl) {
  return createLearningTargetGrammar({ referenceUrl });
}
const GRAMMAR_BY_TARGET = Object.freeze({
  sq: referenceOnly("https://lrc.la.utexas.edu/eieol_toc/albol"),
  grc: referenceOnly("https://en.wikipedia.org/wiki/Ancient_Greek_grammar"),
  ar: referenceOnly("https://en.wikipedia.org/wiki/Arabic_grammar"),
  yue: referenceOnly("https://en.wikipedia.org/wiki/Cantonese_grammar"),
  zh: referenceOnly("https://en.wikipedia.org/wiki/Chinese_grammar"),
  da: referenceOnly("https://en.wikipedia.org/wiki/Danish_grammar"),
  nl: referenceOnly("https://en.wikipedia.org/wiki/Dutch_grammar"),
  en: referenceOnly("https://en.wikipedia.org/wiki/English_grammar"),
  fi: referenceOnly("https://en.wikipedia.org/wiki/Finnish_grammar"),
  fr: FRENCH_GRAMMAR,
  de: GERMAN_GRAMMAR,
  el: referenceOnly("https://en.wikipedia.org/wiki/Modern_Greek_grammar"),
  hu: referenceOnly("https://en.wikipedia.org/wiki/Hungarian_grammar"),
  id: referenceOnly("https://seasite.niu.edu/indonesian/TataBahasa/"),
  it: referenceOnly("https://en.wikipedia.org/wiki/Italian_grammar"),
  km: referenceOnly("https://en.wikipedia.org/wiki/Khmer_grammar"),
  ko: referenceOnly("https://en.wikipedia.org/wiki/Korean_grammar"),
  lo: referenceOnly("https://en.wikipedia.org/wiki/Lao_grammar"),
  la: referenceOnly("https://en.wikipedia.org/wiki/Latin_grammar"),
  mn: referenceOnly("https://www.mongolianlanguage.mn/free-lessons/mongolian-grammar-forms"),
  fa: referenceOnly("https://en.wikipedia.org/wiki/Persian_grammar"),
  pl: referenceOnly("https://en.wikipedia.org/wiki/Polish_grammar"),
  pt: referenceOnly("https://en.wikipedia.org/wiki/Portuguese_grammar"),
  ro: referenceOnly("https://en.wikipedia.org/wiki/Romanian_grammar"),
  ru: RUSSIAN_GRAMMAR,
  sh: referenceOnly("https://en.wikipedia.org/wiki/Serbo-Croatian_grammar"),
  es: SPANISH_GRAMMAR,
  sv: referenceOnly("https://en.wikipedia.org/wiki/Swedish_grammar"),
  tl: referenceOnly("https://en.wikipedia.org/wiki/Tagalog_grammar"),
  th: referenceOnly("https://www.chula.ac.th/en/highlight/123363/"),
  tr: referenceOnly("https://en.wikipedia.org/wiki/Turkish_grammar"),
  vi: referenceOnly("https://en.wikipedia.org/wiki/Vietnamese_grammar")
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
  capabilities: {
  "reading-annotation": true,
  ocr: true,
  // Korean is a hand-written module rather than a generic roster entry, so it
  // misses anything the roster loop derives. Tatoeba mounts for ko with text
  // availability 'available' exactly as it does for the other 31 — caught by the
  // registry-agreement assertion in learning-target-contract.test.ts, which is
  // the whole reason that test exists.
  examples: true
  },
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
    capabilities: {
      morphology: lookupRewrites.length > 0,
      "reading-annotation": readingAnnotation,
      // MEASURED against config/dictionaries/published/v1/catalog.json
      // on 2026-08-02: zh has 4 published `kanji` dictionaries and 9
      // `frequency` ones, yue has 1 and 3. Both flags said Japanese-only,
      // so two capabilities the shipped catalogue already supplies were
      // switched off for the languages that can use them. The Han branch
      // is where the data is, and character-lookup already gates on
      // isUnifiedIdeograph as well, so this reaches only real Han runs —
      // and usesJapaneseProviders() still keeps JPDB, Jiten and Japanese
      // pitch out, exactly as character-lookup.ts anticipated.
      "character-lookup": usesHanScript,
      frequency: usesHanScript,
      // MEASURED 2026-08-02 by running exampleSourcesForTarget: Tatoeba
      // is a registered, mounted, licence-checked example source for
      // every non-Japanese target and reports text availability
      // 'available' for all of them (Japanese uses Immersion Kit
      // instead, which is why it is declared separately). The flag said
      // Japanese-only, so 32 languages that already had example
      // sentences were reporting none. Audio is deliberately NOT implied
      // here — Tatoeba answers 'per-item' for audio and outright 'none'
      // for the smaller corpora, so a boolean would overclaim it.
      // tests/reader/languages/learning-target-contract.test.ts asserts
      // this against the live registry so it cannot go stale again.
      examples: true
    },
    featureSemantics: {
      characterSystem: language.defaultScript,
      phoneticScripts: readingAnnotation ? [language.id === "yue" ? "jyutping" : "pinyin"] : [],
      pronunciation: "ipa",
      readingAnnotation: readingAnnotation ? language.id === "yue" ? "jyutping" : "pinyin" : "none"
    },
    grammar: grammarForRosterTarget(language.id),
    sentenceBoundaries: sentenceBoundariesForScripts(language.scripts),
    typography: readingAnnotation ? { readingAnnotationMode: "ruby" } : void 0,
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
function normalizeLearningTargetLanguage(value) {
  return learningTargetModuleFor(value)?.language ?? defaultLearningTargetModule().language;
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
const DEFAULT_SLICE1_LEARNER_LANGUAGE = "en";
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
const LEARNING_TARGET_ROSTER = Object.freeze([
  JAPANESE_TARGET_ROSTER_ENTRY,
  ...LEARNER_LANGUAGES.map((language) => Object.freeze({
  ...language,
  studyTargetReadiness: READING_ONLY_STUDY_TARGET_IDS.includes(language.id) ? "reading-only" : "planned"
  }))
]);
Object.freeze(
  LEARNER_LANGUAGES.map((language) => canonicalLanguageTag(language.runtimeLocale) ?? language.runtimeLocale)
);
function canonicalTagForSlice1Language(id) {
  const runtimeLocale = learnerLanguageById(id).runtimeLocale;
  return canonicalLanguageTag(runtimeLocale) ?? runtimeLocale;
}
function slice1LanguageIdForTag(value) {
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase().replace(/_/g, "-");
  const inputBase = input.split("-")[0] ?? "";
  if (isLearnerLanguageId(inputBase)) return inputBase;
  const canonical = canonicalLanguageTag(value);
  if (!canonical) return null;
  const base = languageSubtag(canonical);
  if (!base) return null;
  if (base === "sr" || base === "hr" || base === "bs") return "sh";
  if (base === "fil") return "tl";
  return isLearnerLanguageId(base) ? base : null;
}
function normalizeSlice1LearnerLanguage(value, fallback = DEFAULT_SLICE1_LEARNER_LANGUAGE) {
  if (typeof value === "string") {
  const input = value.trim().toLowerCase().replace(/_/g, "-");
  if (isLearnerLanguageId(input)) return canonicalTagForSlice1Language(input);
  }
  const canonical = canonicalLanguageTag(value);
  const canonicalId = canonical ? slice1LanguageIdForTag(canonical) : null;
  if (canonical && canonicalId) {
  if (canonicalId === "sh") return canonicalTagForSlice1Language("sh");
  return canonical;
  }
  const fallbackId = slice1LanguageIdForTag(fallback) ?? DEFAULT_SLICE1_LEARNER_LANGUAGE;
  return canonicalTagForSlice1Language(fallbackId);
}
const ANKI_FIELD_ROLES = ["expression", "reading", "meaning", "sentence", "audio", "sentenceAudio", "image"];
const ankiFieldNames = (names) => names.split("|");
const ANKI_HEADWORD_FIELD_NAME_PREFIX = ankiFieldNames(
  "Vocabulary-Kanji|Vocabulary Kanji|Vocab Kanji|Jlab-Kanji|Japanese_Word|Word|Word Kanji|Japanese Word|Headword|Headword Kanji|Term Kanji|Term Text|Expression Text|Base Form|Dictionary Form"
);
const ANKI_HEADWORD_FIELD_NAME_TAIL = ankiFieldNames(
  "Learnable|Lemma|Primary|Search Term|Target Word|Term|Vocab|Vocabulary|Vocabulary Expression|Word Expression"
);
const ANKI_GENERIC_EXPRESSION_FIELD_NAMES = ankiFieldNames("Expression|Front|Japanese|Kanji|Katakana");
const ANKI_HEADWORD_FIELD_NAMES = [
  ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
  "Expression Reading",
  "Japanese Expression",
  ...ANKI_HEADWORD_FIELD_NAME_TAIL
];
const ANKI_EXPRESSION_FIELD_NAMES = [
  ...ANKI_HEADWORD_FIELD_NAME_PREFIX,
  ...ankiFieldNames("Expression|Expression Reading|Front|Japanese|Japanese Expression|Kanji|Katakana"),
  ...ANKI_HEADWORD_FIELD_NAME_TAIL
];
const ANKI_READING_FIELD_NAMES = ankiFieldNames(
  "Vocabulary-Kana|Vocabulary Kana|Vocabulary-Furigana|Vocabulary Furigana|Vocab Kana|Vocab Furigana|Jlab-Hiragana|Readings|Expression Reading|Furigana|Furigana Reading|Hiragana|Japanese Reading|Kana|Kana Reading|On|On Reading|Onyomi|Kun|Kun Reading|Kunyomi|Pronunciation|Reading|Ruby|Term Kana|Term Reading|Vocab Reading|Vocabulary Reading|Word Kana|Word Reading|Yomi"
);
const ANKI_MEANING_FIELD_NAMES = ankiFieldNames(
  "Vocabulary-English|Vocabulary English|Vocabulary-Meaning|Vocabulary Meaning|Translation_1|Jlab-Translation|RemarksBack|Jlab-Remarks|Other-Back|Jlab-DictionaryLookup|Meaning|Def|Defs|Definition|Definition 1|Definition English|Definitions|English|English Definition|English Meaning|Gloss|Glosses|Glossary|Keyword|MainDefinition|Meanings|Mnemonic|Back|DictionaryDefinitions|Sense|Term Meaning|Translation|Translation 1|Vocab Def|Vocab Definition|Word Meaning"
);
const ANKI_SENTENCE_FIELD_NAMES = ankiFieldNames(
  "Sentence|Example|Example Sentence|Example Sentence Text|Context|Context Sentence|Context Text|ExpressionSentence|Japanese Sentence|Mining Sentence|SentKanji|Sentence Furigana|Sentence Kanji|Sentence-Kanji|Sentence Text|Source Sentence|Source Text"
);
const ANKI_AUDIO_FIELD_NAMES = ankiFieldNames(
  "Audio|Expression Audio|Term Audio|Vocab Audio|Vocabulary Audio|Word Audio|PronunciationAudio|Sound|Voice"
);
const ANKI_SENTENCE_AUDIO_FIELD_NAMES = ankiFieldNames(
  "SentenceAudio|Sentence Audio|SentAudio|Sentence Sound|Context Audio|Example Audio"
);
const ANKI_IMAGE_FIELD_NAMES = ankiFieldNames(
  "Context Image|Example Image|Frame|Image|Image File|Photo|Picture|Snapshot|Screenshot|Sentence Image|Sentence Screenshot|SentencePicture|Still|Source Image|Term Image|Vocab Image|Vocabulary Image|Word Image"
);
const ANKI_FIELD_ROLE_CANDIDATES = {
  expression: ANKI_EXPRESSION_FIELD_NAMES,
  reading: ANKI_READING_FIELD_NAMES,
  meaning: ANKI_MEANING_FIELD_NAMES,
  sentence: ANKI_SENTENCE_FIELD_NAMES,
  audio: ANKI_AUDIO_FIELD_NAMES,
  sentenceAudio: ANKI_SENTENCE_AUDIO_FIELD_NAMES,
  image: ANKI_IMAGE_FIELD_NAMES
};
const ANKI_AUDIO_ROLES = /* @__PURE__ */ new Set(["audio", "sentenceAudio"]);
function isAnkiAudioRole(role) {
  return ANKI_AUDIO_ROLES.has(role);
}
function scanAnkiModelFields(modelName, fields, sampleNotes = []) {
  const usedFields = /* @__PURE__ */ new Set();
  const samples = ankiFieldContentSamples(fields, sampleNotes);
  const suggestions = Object.keys(ANKI_FIELD_ROLE_CANDIDATES).filter((role) => role !== "reading" || activeLearningTarget().featureSemantics.readingAnnotation !== "none").map((role) => {
  const suggestion = suggestAnkiField(role, fields, usedFields, samples);
  if (suggestion.fieldName) usedFields.add(suggestion.fieldName);
  return suggestion;
  });
  return {
  modelName,
  fields,
  suggestions,
  score: ankiModelScanScore(suggestions)
  };
}
function suggestAnkiField(role, fields, usedFields, samples = {}) {
  const candidates = ankiFieldRoleCandidates(role);
  const availableFields = fields.filter((field) => isAvailableAnkiFieldForRole(field, role, usedFields, samples));
  const exact = firstMatchingAnkiField(availableFields, candidates);
  const content = suggestAnkiFieldFromContent(role, availableFields, samples);
  const exactContentScore = exact ? ankiFieldContentRoleScore(role, samples[exact] ?? []) : 0;
  const fuzzy = firstFuzzyAnkiField(availableFields, candidates);
  return bestAnkiFieldSuggestion(role, exact, fuzzy, content, exactContentScore);
}
function ankiFieldRoleCandidates(role) {
  if (role !== "expression") return ANKI_FIELD_ROLE_CANDIDATES[role];
  const language = activeLearningTarget().language.split("-")[0];
  const roster = LEARNING_TARGET_ROSTER.find((entry) => entry.id === language);
  if (!roster) return ANKI_FIELD_ROLE_CANDIDATES.expression;
  return unique([
  roster.englishName,
  roster.nativeName,
  `${roster.englishName} Word`,
  `${roster.nativeName} Word`,
  ...ANKI_FIELD_ROLE_CANDIDATES.expression
  ]);
}
function bestAnkiFieldSuggestion(role, exact, fuzzy, content, exactContentScore) {
  if (shouldPreferContentSuggestion(content, exact, exactContentScore)) return content;
  const suggestions = [
  exact ? { role, fieldName: exact, confidence: "high" } : null,
  contentBeforeFuzzyAnkiFieldSuggestion(content, fuzzy),
  fuzzy ? { role, fieldName: fuzzy, confidence: "medium" } : null,
  content.fieldName ? content : null,
  { role, fieldName: null, confidence: "low" }
  ];
  return suggestions.find(Boolean);
}
function contentBeforeFuzzyAnkiFieldSuggestion(content, fuzzy) {
  if (!content.fieldName) return null;
  return !fuzzy || content.confidence === "high" ? content : null;
}
function isAvailableAnkiFieldForRole(field, role, usedFields, samples) {
  if (usedFields.has(field)) return false;
  if (ankiFieldDisallowedForRole(field, role)) return false;
  return ankiFieldAllowedForRole(field, role) || ankiFieldContentRoleScore(role, samples[field] ?? []) >= 50;
}
function shouldPreferContentSuggestion(content, exact, exactContentScore) {
  if (!content.fieldName) return false;
  if (!exact || isGenericAnkiFieldName(exact)) return true;
  return content.fieldName !== exact && exactContentScore === 0 && content.confidence === "high";
}
function ankiFieldMappingForModel(settings, modelName, fieldNames) {
  const mapping = settings.ankiFieldMappings?.[modelName];
  if (!mapping) return void 0;
  const normalized = {};
  for (const role of ANKI_FIELD_ROLES) {
  const fieldName = mappedFieldName(fieldNames, mapping, role);
  if (fieldName) normalized[role] = fieldName;
  }
  return Object.keys(normalized).length ? normalized : void 0;
}
function mappedFieldName(fieldNames, mapping, role) {
  const fieldName = mapping?.[role]?.trim();
  if (!fieldName) return "";
  const exact = fieldNames.find((candidate) => candidate === fieldName);
  if (exact) return exact;
  const normalizedFieldName = normalizeAnkiFieldName(fieldName);
  return fieldNames.find((candidate) => normalizeAnkiFieldName(candidate) === normalizedFieldName) ?? "";
}
function ankiFieldMappingsSettingsKey(mappings) {
  const normalized = {};
  for (const modelName of Object.keys(mappings ?? {}).sort()) {
  const mapping = mappings?.[modelName];
  if (!mapping) continue;
  const modelMapping = {};
  for (const role of ANKI_FIELD_ROLES) {
    const fieldName = mapping[role]?.trim();
    if (fieldName) modelMapping[role] = fieldName;
  }
  if (Object.keys(modelMapping).length) normalized[modelName] = modelMapping;
  }
  return normalized;
}
function fieldNameForRole(fieldNames, role, mapping) {
  const mapped = mappedFieldName(fieldNames, mapping, role);
  if (mapped) return mapped;
  return suggestAnkiField(role, fieldNames, /* @__PURE__ */ new Set()).fieldName ?? "";
}
function mappedRoleForField(fieldName, mapping) {
  if (!mapping) return null;
  const normalized = normalizeAnkiFieldName(fieldName);
  for (const role of ANKI_FIELD_ROLES) {
  const mapped = mapping[role];
  if (mapped && normalizeAnkiFieldName(mapped) === normalized) return role;
  }
  return null;
}
function yomuFieldForRole(role) {
  return {
  expression: "Expression",
  reading: "Reading",
  meaning: "Meaning",
  sentence: "Sentence",
  audio: "Audio",
  // Yomu's own note type has a single Audio field, so the sentence-audio
  // role maps onto it: buildYomuAnkiFields never emits a SentenceAudio
  // value, and media routing collapses through mergeAudioFilesForNote.
  sentenceAudio: "Audio",
  image: "Image"
  }[role];
}
function flattenNoteFields(fields) {
  const out = {};
  Object.entries(fields ?? {}).forEach(([name, value]) => {
  out[name] = stripHtml$1(String(value?.value ?? ""));
  });
  return out;
}
function noteLooksLikeCard(note, card, settings) {
  const fields = flattenNoteFields(note.fields);
  const mapping = settings ? ankiFieldMappingForModel(settings, note.modelName, Object.keys(fields)) : void 0;
  const expressionTargets = noteCardExpressionTargets(card);
  return noteHasExactTarget(fields, expressionTargets) || noteExpressionContainsTarget(fields, expressionTargets, mapping) || noteReadingContainsTarget(fields, card, mapping, expressionTargets);
}
function noteCardExpressionTargets(card) {
  return unique([card.spelling, ...card.fallbackLookupTerms ?? []].map((value) => normalizeFieldValue(value ?? "")).filter(Boolean));
}
function noteFieldValues(fields) {
  return Object.values(fields).map(normalizeFieldValue).filter(Boolean);
}
function firstNoteReading(fields) {
  return firstNoteField(fields, ANKI_READING_FIELD_NAMES);
}
function firstNoteExpressionValue(fields, mapping) {
  return noteExpressionCandidates(fields, mapping)[0]?.value ?? "";
}
function mappedNoteField(fields, mapping, role) {
  const fieldName = mappedFieldName(Object.keys(fields), mapping, role);
  return fieldName ? fields[fieldName] ?? "" : "";
}
function lookupKeyTermsForCard(card) {
  return unique([card.spelling, card.reading, ...card.fallbackLookupTerms ?? []].map((value) => normalizeFieldValue(value ?? "")).filter(Boolean));
}
function isKanaStatusLookupSurface(value) {
  return /[\u3040-\u30ff]/u.test(value) && !/[\u3400-\u9fff]/u.test(value);
}
function japaneseFieldContainsStandaloneTarget(value, target) {
  const normalizedValue = normalizeFieldValue(value);
  if (normalizedValue === target) return true;
  return normalizedValue.split(/[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u).some((part) => part === target);
}
function japaneseCharacterCount(value) {
  return (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
}
function normalizeAnkiFieldName(value) {
  return value.replace(/[_\s-]+/g, "").toLowerCase();
}
function stripHtml$1(value) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function suggestAnkiFieldFromContent(role, fields, samples) {
  const ranked = fields.map((fieldName) => ({
  fieldName,
  score: ankiFieldContentRoleScore(role, samples[fieldName] ?? [])
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || fields.indexOf(a.fieldName) - fields.indexOf(b.fieldName));
  const best = ranked[0];
  if (!best) return { role, fieldName: null, confidence: "low" };
  return {
  role,
  fieldName: best.fieldName,
  confidence: best.score >= 50 ? "high" : "medium"
  };
}
function ankiFieldContentRoleScore(role, samples) {
  if (!samples.length) return 0;
  const scores = samples.map((sample) => ankiFieldContentSampleRoleScore(role, sample)).filter((score) => score > 0).sort((a, b) => b - a);
  if (!scores.length) return 0;
  const strongest = scores[0] ?? 0;
  const second = scores[1] ?? 0;
  return Math.min(100, strongest + Math.min(15, second / 3) + Math.min(10, scores.length * 2));
}
const ANKI_TEXT_ROLE_SCORERS = {
  expression({ length, hasJapanese, hasKanji, kanaLength, sentenceLike, targetText }) {
  if (activeLearningTarget().language.split("-")[0] !== "ja") {
    return targetText && !sentenceLike && length <= 40 ? 64 + Math.max(0, 12 - Math.floor(length / 2)) : 0;
  }
  if (!hasJapanese || sentenceLike || length > 40) return 0;
  return 28 + (hasKanji ? 24 : 0) + (kanaLength && hasKanji ? 8 : 0) + Math.max(0, 12 - Math.floor(length / 2));
  },
  reading({ length, japaneseLength, hasJapanese, hasKanji, kanaLength }) {
  if (!hasJapanese || hasKanji || length > 40) return 0;
  const mostlyKana = kanaLength >= Math.max(1, japaneseLength - 1);
  return mostlyKana ? 54 + Math.max(0, 10 - Math.floor(length / 4)) : 20;
  },
  meaning({ length, hasJapanese, hasLatin, targetText }) {
  if (activeLearningTarget().language.split("-")[0] !== "ja") {
    if (targetText) return 0;
    return hasLatin ? 54 + (length > 8 ? 6 : 0) : length >= 2 ? 24 : 0;
  }
  if (hasJapanese) return 0;
  if (hasLatin) return 54 + (length > 8 ? 6 : 0);
  return length >= 2 ? 24 : 0;
  },
  sentence({ length, hasJapanese, sentenceLike, targetText }) {
  if (activeLearningTarget().language.split("-")[0] !== "ja") {
    return targetText && sentenceLike ? 65 + (length > 20 ? 8 : 0) : 0;
  }
  if (!hasJapanese) return 0;
  if (sentenceLike) return 65 + (length > 20 ? 8 : 0);
  return length >= 14 ? 42 : 0;
  }
};
function ankiFieldContentSampleRoleScore(role, sample) {
  const raw = sample.raw.trim();
  const text = normalizeFieldValue(sample.text);
  if (isAnkiAudioRole(role)) return ankiAudioFieldContentScore(raw, text);
  if (role === "image") return ankiImageFieldContentScore(raw, text);
  if (ankiAudioFieldContentScore(raw, text) || ankiImageFieldContentScore(raw, text)) return 0;
  if (!text) return 0;
  const scorer = ANKI_TEXT_ROLE_SCORERS[role];
  if (!scorer) return 0;
  const japaneseLength = japaneseCharacterCount(text);
  return scorer({
  length: text.length,
  japaneseLength,
  hasJapanese: japaneseLength > 0,
  hasKanji: /[\u3400-\u9fff]/u.test(text),
  kanaLength: kanaCharacterCount(text),
  hasLatin: /[A-Za-z]/.test(text),
  sentenceLike: japaneseSentenceLike(text),
  targetText: activeLearningTarget().isLookupableText(text)
  });
}
function ankiAudioFieldContentScore(raw, text) {
  const value = `${raw} ${text}`.toLowerCase();
  if (/\[sound:[^\]]+\]/.test(value)) return 90;
  if (/<audio\b/.test(value)) return 85;
  if (/\.(?:mp3|m4a|ogg|oga|wav|flac)(?:[?#"'\s>]|$)/.test(value)) return 75;
  return 0;
}
function ankiImageFieldContentScore(raw, text) {
  const value = `${raw} ${text}`.toLowerCase();
  if (/<img\b/.test(value)) return 90;
  if (/\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#"'\s>]|$)/.test(value)) return 75;
  return 0;
}
function ankiFieldContentSamples(fields, notes) {
  const out = Object.fromEntries(fields.map((field) => [field, []]));
  for (const note of notes) {
  for (const fieldName of fields) {
    const raw = String(note.fields?.[fieldName]?.value ?? "");
    if (!raw.trim()) continue;
    out[fieldName]?.push({ raw, text: stripHtml$1(raw) });
  }
  }
  return out;
}
function isGenericAnkiFieldName(fieldName) {
  const normalized = normalizeAnkiFieldName(fieldName);
  return /^(?:front|back|primary|secondary|text|field\d+|f\d+)$/.test(normalized);
}
function kanaCharacterCount(value) {
  return (value.match(/[\u3040-\u30ff]/gu) ?? []).length;
}
function japaneseSentenceLike(value) {
  if (activeLearningTarget().language.split("-")[0] !== "ja") {
  const target = activeLearningTarget();
  return target.sentenceBoundaries.terminators.some((mark) => value.includes(mark)) || value.length >= 24 && /\s/u.test(value);
  }
  const japaneseLength = japaneseCharacterCount(value);
  return /[。！？!?]/u.test(value) || japaneseLength >= 12 || japaneseLength >= 8 && /(?:^|[\s　]).{2,}[\s　].{2,}/u.test(value);
}
function ankiFieldAllowedForRole(fieldName, role) {
  const normalized = normalizeAnkiFieldName(fieldName);
  const audioLike = /(?:audio|sound|voice)/.test(normalized);
  const imageLike = /(?:image|picture|screenshot|snapshot|photo|frame|still)/.test(normalized);
  if (isAnkiAudioRole(role)) return audioLike && !imageLike;
  if (role === "image") return imageLike && !audioLike && !/^frame(?:id|no|num|number|v?\d)/.test(normalized);
  return !audioLike && !imageLike;
}
function ankiFieldDisallowedForRole(fieldName, role) {
  if (role === "audio") return isSentenceAudioFieldName(fieldName);
  if (role === "sentenceAudio" || role === "image") return false;
  const normalized = normalizeAnkiFieldName(fieldName);
  return /^(?:source|sourceurl|url|origin|originurl|link|deck|deckname|model|modelname|tags?|remarksfront|frontremarks)$/.test(normalized);
}
const NORMALIZED_SENTENCE_AUDIO_FIELD_NAMES = new Set(ANKI_SENTENCE_AUDIO_FIELD_NAMES.map(normalizeAnkiFieldName));
function isSentenceAudioFieldName(fieldName) {
  return NORMALIZED_SENTENCE_AUDIO_FIELD_NAMES.has(normalizeAnkiFieldName(fieldName));
}
function firstMatchingAnkiField(fields, names) {
  const fieldByName = /* @__PURE__ */ new Map();
  fields.forEach((field) => {
  const normalized = normalizeAnkiFieldName(field);
  if (!fieldByName.has(normalized)) fieldByName.set(normalized, field);
  });
  for (const name of names) {
  const match = fieldByName.get(normalizeAnkiFieldName(name));
  if (match) return match;
  }
  return "";
}
function firstFuzzyAnkiField(fields, names) {
  const normalizedNames = names.map(normalizeAnkiFieldName).filter((name) => name.length >= 4);
  return fields.find((field) => {
  const normalized = normalizeAnkiFieldName(field);
  return normalizedNames.some((name) => normalized.includes(name));
  }) ?? "";
}
function ankiModelScanScore(suggestions) {
  return suggestions.reduce((score, suggestion) => {
  if (!suggestion.fieldName) return score;
  const roleWeight = suggestion.role === "expression" ? 6 : suggestion.role === "meaning" ? 4 : suggestion.role === "reading" || suggestion.role === "sentence" ? 3 : 1;
  const confidenceWeight = suggestion.confidence === "high" ? 2 : 1;
  return score + roleWeight * confidenceWeight;
  }, 0);
}
function noteHasExactTarget(fields, exactTargets) {
  const values = noteFieldValues(fields);
  return exactTargets.some((target) => values.some((value) => value === target));
}
function noteExpressionContainsTarget(fields, exactTargets, mapping) {
  const expressions = noteExpressionCandidates(fields, mapping);
  return expressions.some((expression) => exactTargets.some(
  (target) => target.length >= 2 && japaneseFieldContainsStandaloneTarget(expression.value, target) && (!expression.generic || genericExpressionLooksLikeHeadword(expression.value, target))
  ));
}
function firstNoteField(fields, names) {
  const exact = names.map((name) => fields[name]).find(Boolean);
  if (exact) return exact;
  const normalizedNames = new Set(names.map(normalizeAnkiFieldName));
  return Object.entries(fields).find(([name, value]) => normalizedNames.has(normalizeAnkiFieldName(name)) && Boolean(value))?.[1] ?? "";
}
function noteReadingContainsTarget(fields, card, mapping, expressionTargets) {
  const spelling = normalizeFieldValue(card.spelling);
  const readingTarget = normalizeFieldValue(card.reading || (isKanaStatusLookupSurface(spelling) ? spelling : ""));
  const expressionValues = noteExpressionValues(fields, mapping);
  if (expressionValues.length && !expressionValues.some(
  (expression) => expressionTargets.some((target) => target.length >= 2 && japaneseFieldContainsStandaloneTarget(expression, target))
  ) && !isKanaStatusLookupSurface(spelling)) {
  return false;
  }
  const readings = unique([
  mappedNoteField(fields, mapping, "reading"),
  firstNoteReading(fields)
  ].filter(Boolean));
  return Boolean(readingTarget && readingTarget.length >= 2 && readings.some((reading) => japaneseFieldContainsStandaloneTarget(reading, readingTarget)));
}
function noteExpressionValues(fields, mapping) {
  return unique(noteExpressionCandidates(fields, mapping).map((candidate) => candidate.value).filter(Boolean));
}
function noteExpressionCandidates(fields, mapping) {
  const candidates = [];
  const mapped = mappedNoteField(fields, mapping, "expression");
  if (mapped) candidates.push({ value: mapped, generic: false });
  const headword = firstNoteField(fields, ANKI_HEADWORD_FIELD_NAMES);
  if (headword) candidates.push({ value: headword, generic: false });
  const generic = firstNoteField(fields, ANKI_GENERIC_EXPRESSION_FIELD_NAMES);
  if (generic) candidates.push({ value: generic, generic: true });
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((candidate) => {
  const key = normalizeFieldValue(candidate.value);
  if (!key || seen.has(key)) return false;
  seen.add(key);
  return true;
  });
}
function genericExpressionLooksLikeHeadword(value, target) {
  const normalizedValue = normalizeFieldValue(value);
  if (normalizedValue === target) return true;
  if (/[。！？!?]/u.test(normalizedValue)) return false;
  return japaneseCharacterCount(normalizedValue) <= japaneseCharacterCount(target) + 4;
}
function normalizeFieldValue(value) {
  return value.replace(/\s+/g, " ").trim();
}
function yomuFieldAlias(fieldName) {
  return YOMU_FIELD_ALIASES[normalizeAnkiFieldName(fieldName)] ?? "";
}
const YOMU_FIELD_ALIASES = Object.fromEntries([
  ...yomuAliasEntries("Expression", "baseform|character|characters|dictionaryform|expressiontext|headword|headwordkanji|jlabkanji|japaneseword|japaneseexpression|kanji|lemma|searchterm|targetkanji|targetword|termtext|termkanji|word|wordexpression|wordkanji|vocab|vocabkanji|vocabulary|vocabularycharacter|vocabularyexpression|vocabularykanji|term|front"),
  ...yomuAliasEntries("Reading", "expressionreading|furigana|furiganareading|hiragana|jlabhiragana|japanesereading|kanareading|readings|kana|ruby|termkana|termreading|vocabfurigana|vocabkana|vocabreading|vocabularyfurigana|wordkana|vocabularyreading|wordreading|yomi"),
  ...yomuAliasEntries("Meaning", "def|definition1|definition|definitionenglish|definitions|defs|english|englishdefinition|englishmeaning|gloss|glosses|glossary|heisigkeyword|jlabdictionarylookup|jlabremarks|jlabtranslation|keyword|meaningenglish|meanings|otherback|remarksback|sense|termmeaning|translation|translation1|vocabdef|vocabdefinition|vocabularyenglish|vocabularymeaning|wordmeaning|back"),
  ...yomuAliasEntries("Sentence", "example|examplesentence|examplesentencetext|contextsentence|contexttext|sentenceexpression|sentencefurigana|sentencekanji|sentencetext|sentkanji|japanesesentence|miningsentence|sourcesentence|sourcetext"),
  ...yomuAliasEntries("Url", "sourceurl|url"),
  ...yomuAliasEntries("PartOfSpeech", "pos|partofspeech"),
  ...yomuAliasEntries("Pitch", "pitchaccent"),
  ...yomuAliasEntries("DictionaryDefinitions", "dictionary|dictionaries|dictionarydefinition|dictionarydefinitions")
]);
function yomuAliasEntries(field, aliases) {
  return aliases.split("|").map((alias) => [alias, field]);
}
function noteLooksLikeYomuModel(modelName, settings, fieldNames) {
  const configuredModel = resolvedAnkiModelName(settings);
  if (modelName === configuredModel) return true;
  return yomuModelFieldSet(fieldNames);
}
function shouldTreatExistingModelAsYomuManaged(modelName, settings, fieldNames) {
  const configuredModel = resolvedAnkiModelName(settings);
  if (modelName === configuredModel && isDefaultYomuModelName(configuredModel)) return true;
  return yomuModelFieldSet(fieldNames);
}
function isDefaultYomuModelName(modelName) {
  return modelName === "よむ Japanese" || modelName === "Yomu Japanese";
}
function yomuModelFieldSet(fieldNames) {
  const fieldSet = new Set(fieldNames);
  return ["Expression", "Meaning", "Sentence", "DictionaryDefinitions"].every((field) => fieldSet.has(field));
}
const YOMU_MODEL_FIELDS = [
  "Expression",
  "Reading",
  "Meaning",
  "Sentence",
  "Url",
  "Frequency",
  "PartOfSpeech",
  "Image",
  "Audio",
  "JPDB",
  "Status",
  "Pitch",
  "DictionaryDefinitions",
  "Kanji",
  "Source"
];
function missingYomuModelFields(fieldNames) {
  const present = new Set(fieldNames);
  return YOMU_MODEL_FIELDS.filter((fieldName) => !present.has(fieldName));
}
const ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES = ["Pronunciation"];
function imageFromDataUrl(dataUrl, card) {
  const parsed = parseAnkiImageDataUrl(dataUrl);
  if (!parsed) return null;
  return {
  filename: `yomu_${safeAnkiMediaName(card)}_${Date.now()}.${parsed.extension}`,
  data: parsed.data,
  fields: ["Image"]
  };
}
function mergeAudioFilesForNote(fieldNames, options, card, mapping) {
  if (options.audioMergeMode === "theirs") return [];
  const targets2 = ankiAudioFieldTargets(fieldNames, mapping);
  if (!targets2) return [];
  return retargetAudioFilesByKind(audioFilesFromContext(options, card), targets2);
}
function ankiAudioFieldTargets(fieldNames, mapping) {
  const word = fieldNameForRole(fieldNames, "audio", mapping) || mediaFieldName(fieldNames, ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES);
  const context = fieldNameForRole(fieldNames, "sentenceAudio", mapping);
  if (!word && !context) return null;
  return { word: word || context, context: context || word };
}
function retargetAudioFilesByKind(files, targets2) {
  return files.map((file) => {
  const { yomuAudioKind: _kind, ...rest } = file;
  return { ...rest, fields: [ankiAudioFieldForKind(file.yomuAudioKind, targets2)] };
  });
}
function ankiAudioFieldForKind(kind, targets2) {
  return kind === "context" ? targets2.context : targets2.word;
}
function mergePictureFilesForNote(fieldNames, existingFields, options, card, canOwnYomuFields, mapping) {
  const fieldName = fieldNameForRole(fieldNames, "image", mapping);
  if (!fieldName || !options.imageDataUrl) return [];
  if (!canOwnYomuFields && existingFields[fieldName]) return [];
  const image = imageFromDataUrl(options.imageDataUrl, card);
  return image ? [{ ...image, fields: [fieldName] }] : [];
}
function applyMediaFieldClears(fields, audio, picture, audioMergeMode, canOwnYomuFields) {
  if (audioMergeMode === "ours") {
  for (const fieldName of new Set(audio.map((file) => file.fields[0]).filter(Boolean))) fields[fieldName] = "";
  }
  if (picture.length && canOwnYomuFields) fields[picture[0].fields[0]] = "";
}
function mediaFieldName(fieldNames, preferredNames) {
  const exact = preferredNames.find((name) => fieldNames.includes(name));
  if (exact) return exact;
  const preferredLower = new Set(preferredNames.map((name) => name.toLowerCase()));
  return fieldNames.find((name) => preferredLower.has(name.toLowerCase())) ?? "";
}
function retargetMediaFiles(files, fieldName) {
  return files.map((file) => ({ ...file, fields: [fieldName] }));
}
function audioFilesFromContext(options, card) {
  const files = [
  audioFromMedia({ dataUrl: options.wordAudioDataUrl, url: options.wordAudioUrl, kind: "word" }, card),
  audioFromMedia({ dataUrl: options.audioDataUrl, url: options.audioUrl, kind: "context" }, card)
  ].filter((file) => Boolean(file));
  return uniqueAnkiAudioFiles(files);
}
function audioFromMedia(media, card) {
  const fromData = media.dataUrl ? audioFromDataUrl(media.dataUrl, card, media.kind) : null;
  if (fromData) return fromData;
  return media.url ? audioFromUrl(media.url, card, media.kind) : null;
}
function audioFromDataUrl(dataUrl, card, kind) {
  const parsed = parseAnkiAudioDataUrl(dataUrl);
  if (!parsed) return null;
  return {
  filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}.${parsed.extension}`,
  data: parsed.data,
  fields: ["Audio"],
  yomuAudioKind: kind
  };
}
function audioFromUrl(url, card, kind) {
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return null;
  return {
  filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}${audioUrlExtension(cleanUrl)}`,
  url: cleanUrl,
  fields: ["Audio"],
  yomuAudioKind: kind
  };
}
function uniqueAnkiAudioFiles(files) {
  const seen = /* @__PURE__ */ new Set();
  return files.filter((file) => {
  const key = file.data ? `data:${file.data}` : `url:${file.url ?? ""}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
  });
}
function parseAnkiImageDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
  return match ? { extension: ankiImageExtension(match[1]), data: match[2] } : null;
}
function parseAnkiAudioDataUrl(dataUrl) {
  const match = /^data:audio\/([a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
  return match ? { extension: ankiAudioExtension(match[1]), data: match[2] } : null;
}
const ANKI_IMAGE_EXTENSION_ALIASES = {
  "jpeg": "jpg",
  "svg+xml": "svg"
};
function ankiImageExtension(rawExtension) {
  const extension = rawExtension.toLowerCase();
  return ANKI_IMAGE_EXTENSION_ALIASES[extension] ?? extension;
}
const ANKI_AUDIO_EXTENSION_ALIASES = {
  "mpeg": "mp3",
  "mp3": "mp3",
  "wav": "wav",
  "wave": "wav",
  "x-wav": "wav",
  "ogg": "ogg",
  "oga": "ogg",
  "webm": "webm",
  "mp4": "mp4",
  "aac": "aac",
  "flac": "flac"
};
function ankiAudioExtension(rawExtension) {
  return ANKI_AUDIO_EXTENSION_ALIASES[rawExtension.toLowerCase()] ?? "mp3";
}
function audioUrlExtension(url) {
  try {
  const pathname = new URL(url, location.href).pathname;
  const match = /\.([a-z0-9]+)$/i.exec(pathname);
  if (match) return `.${ankiAudioExtension(match[1])}`;
  } catch {
  }
  return ".mp3";
}
function safeAnkiMediaName(card) {
  return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, "_").slice(0, 24) || "yomu";
}
function retargetAnkiNoteToExistingModel(note, fieldNames, settings) {
  const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames);
  const fields = retargetYomuFieldsToExistingModel(note.fields, fieldNames, mapping);
  const audioTargets = ankiAudioFieldTargets(fieldNames, mapping);
  const imageField = fieldNameForRole(fieldNames, "image", mapping);
  return {
  deckName: note.deckName,
  modelName: note.modelName,
  fields,
  tags: note.tags,
  options: note.options,
  ...audioTargets && note.audio?.length ? { audio: retargetAudioFilesByKind(note.audio, audioTargets) } : {},
  ...imageField && note.picture?.length ? { picture: retargetMediaFiles(note.picture, imageField) } : {}
  };
}
function ankiNoteForDuplicatePreflight(note) {
  return {
  deckName: note.deckName,
  modelName: note.modelName,
  fields: note.fields,
  tags: note.tags,
  options: note.options
  };
}
function retargetAnkiNoteForMobileHandoff(note, settings) {
  const mapping = activeMobileHandoffMapping(note, settings);
  if (!mapping) return note;
  return {
  ...note,
  fields: mobileHandoffFieldsWithMappings(note.fields, mapping),
  ...retargetMobileHandoffMedia(note, mapping)
  };
}
function activeMobileHandoffMapping(note, settings) {
  const mapping = settings.ankiFieldMappings?.[note.modelName];
  return mapping && Object.values(mapping).some((value) => value?.trim()) ? mapping : null;
}
function mobileHandoffFieldsWithMappings(yomuFields, mapping) {
  const fields = { ...yomuFields };
  for (const role of ANKI_FIELD_ROLES) {
  const fieldName = mobileMappedFieldName(mapping, role);
  const value = yomuFields[yomuFieldForRole(role)];
  if (fieldName && value) fields[fieldName] = value;
  }
  return fields;
}
function retargetMobileHandoffMedia(note, mapping) {
  const media = {};
  const wordAudioField = mobileMappedFieldName(mapping, "audio");
  const sentenceAudioField = mobileMappedFieldName(mapping, "sentenceAudio");
  const imageField = mobileMappedFieldName(mapping, "image");
  if ((wordAudioField || sentenceAudioField) && note.audio?.length) {
  media.audio = retargetAudioFilesByKind(note.audio, {
    word: wordAudioField || sentenceAudioField,
    context: sentenceAudioField || wordAudioField
  });
  }
  if (imageField && note.picture?.length) media.picture = retargetMediaFiles(note.picture, imageField);
  return media;
}
function mobileMappedFieldName(mapping, role) {
  return mapping[role]?.trim() ?? "";
}
function retargetYomuFieldsToExistingModel(yomuFields, fieldNames, mapping) {
  const valuesByRole = {
  expression: yomuFields.Expression,
  reading: yomuFields.Reading,
  meaning: yomuFields.Meaning,
  sentence: yomuFields.Sentence
  };
  const fields = Object.fromEntries(fieldNames.map((fieldName) => [fieldName, ""]));
  for (const role of ["expression", "reading", "meaning", "sentence"]) {
  const fieldName = fieldNameForRole(fieldNames, role, mapping);
  const value = valuesByRole[role];
  if (fieldName && value) fields[fieldName] = value;
  }
  return fields;
}
function mergedYomuFields(fieldNames, existingFields, yomuFields, canOwnYomuFields, mapping) {
  const fields = {};
  for (const fieldName of fieldNames) {
  const value = yomuValueForExistingField(fieldName, yomuFields, mapping, canOwnYomuFields);
  if (!value) continue;
  if (!canOwnYomuFields && existingFields[fieldName]) continue;
  fields[fieldName] = value;
  }
  return fields;
}
function yomuValueForExistingField(fieldName, yomuFields, mapping, canOwnYomuFields) {
  const mappedRole = mappedRoleForField(fieldName, mapping);
  if (mappedRole) return yomuFields[yomuFieldForRole(mappedRole)] ?? "";
  const alias = yomuFieldAlias(fieldName);
  if (alias && !canOwnYomuFields) return yomuFields[alias] ?? "";
  return yomuFields[fieldName] ?? (alias ? yomuFields[alias] ?? "" : "");
}
new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
const BLOCKED_HTML_ELEMENTS = /* @__PURE__ */ new Set(["base", "embed", "frame", "frameset", "iframe", "link", "meta", "noscript", "object", "portal", "script", "style", "foreignobject"]);
const BLOCKED_ATTRIBUTES = /* @__PURE__ */ new Set(["action", "autofocus", "formaction", "is", "nonce", "ping", "srcdoc", "srcset"]);
const URL_ATTRIBUTES = /* @__PURE__ */ new Set(["href", "poster", "src", "xlink:href"]);
const SAFE_URL_PROTOCOLS = /* @__PURE__ */ new Set(["about:", "blob:", "chrome-extension:", "file:", "http:", "https:", "mailto:", "moz-extension:", "safari-web-extension:", "tel:"]);
const DATA_URL_PATTERN = /^data:(?:image\/(?:avif|bmp|gif|jpe?g|png|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)(?:;[^,]*)?,/i;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let trustedHtmlPolicy;
function setInnerHtml(element, html) {
  if (!replaceWithHtmlFragment(element, html)) element.textContent = html;
}
function parseHtmlDocument(html) {
  const parsed = parseHtmlWithDomParser(html);
  if (parsed) return parsed;
  const fallback = document.implementation.createHTMLDocument("");
  fallback.body.textContent = html;
  return fallback;
}
function replaceWithHtmlFragment(element, html) {
  try {
  const ownerDocument = element.ownerDocument || document;
  const { source, rootSelector } = contextualSanitizerSource(element, html);
  const parsed = new DOMParser().parseFromString(trustedHtml(source), "text/html");
  const parsedRoot = rootSelector ? parsed.querySelector(rootSelector) : parsed.body;
  if (!parsedRoot) return false;
  sanitizeChildren(parsedRoot, parsed);
  const fragment = ownerDocument.createDocumentFragment();
  fragment.append(...Array.from(parsedRoot.childNodes, (node) => ownerDocument.importNode(node, true)));
  sanitizeChildren(fragment, ownerDocument);
  const target = element.localName === "template" && "content" in element ? element.content : element;
  target.replaceChildren(fragment);
  return true;
  } catch {
  return false;
  }
}
function contextualSanitizerSource(element, html) {
  if (element.namespaceURI === SVG_NAMESPACE) {
  return {
    source: `<svg xmlns="${SVG_NAMESPACE}" data-yomu-sanitize-root>${html}</svg>`,
    rootSelector: "[data-yomu-sanitize-root]"
  };
  }
  switch (element.localName.toLowerCase()) {
  case "table":
    return {
      source: `<table data-yomu-sanitize-root>${html}</table>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  case "thead":
  case "tbody":
  case "tfoot":
    return {
      source: `<table><${element.localName} data-yomu-sanitize-root>${html}</${element.localName}></table>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  case "tr":
    return {
      source: `<table><tbody><tr data-yomu-sanitize-root>${html}</tr></tbody></table>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  case "colgroup":
    return {
      source: `<table><colgroup data-yomu-sanitize-root>${html}</colgroup></table>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  case "select":
    return {
      source: `<select data-yomu-sanitize-root>${html}</select>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  case "optgroup":
    return {
      source: `<select><optgroup data-yomu-sanitize-root>${html}</optgroup></select>`,
      rootSelector: "[data-yomu-sanitize-root]"
    };
  default:
    return { source: html, rootSelector: "" };
  }
}
function parseHtmlWithDomParser(html) {
  try {
  return new DOMParser().parseFromString(trustedHtml(html), "text/html");
  } catch {
  return null;
  }
}
function escapeHtml$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function sanitizeChildren(parent, ownerDocument) {
  for (const node of Array.from(parent.childNodes)) {
  if (node.nodeType !== 1) continue;
  const element = node;
  const localName = element.localName.toLowerCase();
  if (BLOCKED_HTML_ELEMENTS.has(localName) || localName.startsWith("animate") || localName === "set") {
    element.remove();
    continue;
  }
  if (localName.includes("-")) {
    sanitizeChildren(element, ownerDocument);
    element.replaceWith(...Array.from(element.childNodes));
    continue;
  }
  sanitizeElement(element, ownerDocument);
  const childRoot = localName === "template" && "content" in element ? element.content : element;
  sanitizeChildren(childRoot, ownerDocument);
  }
}
function sanitizeElement(element, ownerDocument) {
  for (const attribute of Array.from(element.attributes)) {
  const name = attribute.name.toLowerCase();
  if (name.startsWith("on") || BLOCKED_ATTRIBUTES.has(name)) {
    element.removeAttribute(attribute.name);
    continue;
  }
  if (URL_ATTRIBUTES.has(name) && !isSafeHtmlUrl(attribute.value)) {
    element.removeAttribute(attribute.name);
    continue;
  }
  if (name === "style") {
    const style = sanitizedInlineStyle(attribute.value, ownerDocument);
    if (style) element.setAttribute(attribute.name, style);
    else element.removeAttribute(attribute.name);
  }
  }
  if (element.getAttribute("target")?.toLowerCase() === "_blank") {
  const rel = new Set((element.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean));
  rel.add("noopener");
  rel.add("noreferrer");
  element.setAttribute("rel", [...rel].join(" "));
  }
}
function sanitizedInlineStyle(value, ownerDocument) {
  const declaration = ownerDocument.createElement("span").style;
  declaration.cssText = value;
  const containsUnsafeSource = /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|-moz-binding)/i.test(value) || [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !isSafeHtmlUrl(match[2]));
  let removedProperty = false;
  for (const property of Array.from(declaration)) {
  const propertyValue = declaration.getPropertyValue(property);
  if (property === "behavior" || property === "-moz-binding" || /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|-moz-binding)/i.test(propertyValue) || [...propertyValue.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !isSafeHtmlUrl(match[2]))) {
    declaration.removeProperty(property);
    removedProperty = true;
  }
  }
  return containsUnsafeSource || removedProperty ? declaration.cssText : value;
}
function isSafeHtmlUrl(value) {
  const candidate = value.trim().replace(/[\u0000-\u0020\u007f]+/g, "");
  if (!candidate) return true;
  if (candidate.startsWith("#")) return true;
  if (/^data:/i.test(candidate)) return DATA_URL_PATTERN.test(candidate);
  try {
  const parsed = new URL(candidate, "https://yomureader.invalid/");
  return SAFE_URL_PROTOCOLS.has(parsed.protocol) && (parsed.protocol !== "about:" || parsed.href === "about:blank");
  } catch {
  return false;
  }
}
function trustedHtml(value) {
  try {
  const factory = trustedTypesFactory();
  if (!factory) return value;
  if (trustedHtmlPolicy === void 0) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
  return trustedHtmlPolicy?.createHTML(value) ?? value;
  } catch {
  trustedHtmlPolicy = null;
  return value;
  }
}
function trustedTypesFactory() {
  const root = globalThis;
  return [root.trustedTypes, typeof window === "undefined" ? void 0 : window.trustedTypes, root.unsafeWindow?.trustedTypes].find(
  (factory) => Boolean(factory)
  );
}
function createTrustedHtmlPolicy(factory) {
  const existing = factory.getPolicy?.("yomu-reader");
  if (existing?.createHTML) return existing;
  const options = { createHTML: (html) => html };
  return createTrustedHtmlPolicyWithOptions(
  factory,
  pageCompartmentValue(options, {
    cloneFunctions: true,
    wrapReflectors: true
  })
  ) ?? createTrustedHtmlPolicyWithOptions(factory, options);
}
function createTrustedHtmlPolicyWithOptions(factory, options) {
  try {
  return factory.createPolicy?.("yomu-reader", options) ?? null;
  } catch {
  return null;
  }
}
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
function accessibleOcrBackgroundColor(accentColor, opacity = DEFAULT_OCR_BACKGROUND_OPACITY) {
  const accent = sanitizeAccentColor(accentColor);
  const renderedOpacity = accessibleOcrBackgroundOpacity(opacity);
  if (ocrRenderedBackgroundContrast(accent, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
  return accent;
  }
  for (let amount = 0.08; amount <= 1; amount += 0.04) {
  const candidate = sharedMixHex(accent, "#000000", amount, sanitizeAccentColor);
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
accessibleOcrBackgroundColor(
  DEFAULT_ACCENT_COLOR,
  DEFAULT_OCR_BACKGROUND_OPACITY
);
const DEFAULT_LANGUAGE_PROFILE_ID = "default-ja";
const PARSER_PROVIDERS = /* @__PURE__ */ new Set(["local", "jiten", "jpdb", "auto"]);
function readOutputLanguageField(source) {
  return source.schemaVersion === 1 ? source.learnerLanguage ?? source.outputLanguage : source.outputLanguage ?? source.learnerLanguage;
}
function createDefaultLanguageProfile(defaults = {}) {
  return {
  schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
  id: DEFAULT_LANGUAGE_PROFILE_ID,
  ...outputLanguageFields(normalizeSlice1LearnerLanguage(
    readOutputLanguageField(defaults),
    DEFAULT_SLICE1_LEARNER_LANGUAGE
  )),
  targetLanguage: normalizeLearningTargetLanguage(defaults.targetLanguage),
  uiLocale: normalizeUiLocale(defaults.uiLocale, "en"),
  parserProvider: normalizeParserProvider(defaults.parserProvider, "local"),
  dictionaries: emptyProfileDictionaries(),
  definitionTranslationProviderIds: []
  };
}
function outputLanguageFields(outputLanguage) {
  return { outputLanguage, learnerLanguage: outputLanguage };
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
function targetAudioTemplateLanguageToken() {
  return activeLearningTarget().audio.templateLanguageToken;
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
const shared = [
  {
  id: "wiktionary-en",
  label: "Wiktionary EN",
  code: "wiktionaryEn",
  urlTemplate: "https://en.wiktionary.org/wiki/{query}#%code%",
  components: [
    "definition",
    "sentences"
  ],
  enabled: true
  },
  {
  id: "wiktionary-native",
  label: "Wiktionary",
  code: "wiktionary",
  urlTemplate: "https://%code%.wiktionary.org/wiki/{query}",
  components: [
    "definition"
  ],
  enabled: false
  },
  {
  id: "glosbe",
  label: "Glosbe",
  code: "glosbe",
  urlTemplate: "https://glosbe.com/%code%/en/{query}",
  components: [
    "definition",
    "sentences"
  ],
  enabled: false
  },
  {
  id: "tatoeba",
  label: "Tatoeba",
  code: "tatoeba",
  urlTemplate: "https://tatoeba.org/en/sentences/search?from=%code%&to=eng&query={query}",
  components: [
    "sentences"
  ],
  enabled: true
  },
  {
  id: "forvo",
  label: "Forvo",
  code: "forvo",
  urlTemplate: "https://forvo.com/word/{query}/#language-%code%",
  components: [
    "audio"
  ],
  enabled: true
  },
  {
  id: "youglish",
  label: "YouGlish",
  code: "youglish",
  urlTemplate: "https://youglish.com/pronounce/{query}/%code%",
  components: [
    "sentences",
    "audio"
  ],
  enabled: true
  },
  {
  id: "reverso",
  label: "Reverso",
  code: "reverso",
  urlTemplate: "https://context.reverso.net/translation/%code%-english/{query}",
  components: [
    "sentences",
    "audio"
  ],
  enabled: false
  },
  {
  id: "wordreference",
  label: "WordReference",
  code: "wordreference",
  urlTemplate: "https://www.wordreference.com/%code%/{query}",
  components: [
    "definition",
    "sentences",
    "audio"
  ],
  enabled: false
  },
  {
  id: "linguee",
  label: "Linguee",
  code: "linguee",
  urlTemplate: "https://www.linguee.com/english-%code%/search?source=%code%&query={query}",
  components: [
    "sentences"
  ],
  enabled: false
  }
];
const targets = {
  sq: {
  codes: {
    wiktionaryEn: "Albanian",
    wiktionary: "sq",
    glosbe: "sq",
    tatoeba: "sqi",
    forvo: "sq"
  },
  links: [
    {
      id: "fjalorthi",
      label: "Fjalorthi",
      urlTemplate: "https://fjalorthi.com/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  grc: {
  codes: {
    wiktionaryEn: "Ancient_Greek",
    glosbe: "grc",
    tatoeba: "grc"
  },
  links: [
    {
      id: "logeion",
      label: "Logeion",
      urlTemplate: "https://logeion.uchicago.edu/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "lsj",
      label: "LSJ",
      urlTemplate: "https://lsj.gr/wiki/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "scaife",
      label: "Scaife",
      urlTemplate: "https://scaife.perseus.org/search/?q={query}",
      components: [
        "sentences"
      ]
    }
  ]
  },
  ar: {
  codes: {
    wiktionaryEn: "Arabic",
    wiktionary: "ar",
    glosbe: "ar",
    tatoeba: "ara",
    forvo: "ar",
    reverso: "arabic",
    youglish: "arabic"
  },
  links: [
    {
      id: "maajim",
      label: "Maajim",
      urlTemplate: "https://maajim.com/dictionary/{query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  yue: {
  codes: {
    wiktionaryEn: "Chinese",
    wiktionary: "yue",
    glosbe: "yue",
    tatoeba: "yue",
    forvo: "yue"
  },
  links: [
    {
      id: "words-hk",
      label: "words.hk",
      urlTemplate: "https://words.hk/zidin/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "cantowords",
      label: "CantoWords",
      urlTemplate: "https://cantowords.com/dictionary/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    },
    {
      id: "cantodict",
      label: "CantoDict",
      urlTemplate: "https://www.cantonese.sheik.co.uk/dictionary/search/?searchtype=1&text={query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "cccanto",
      label: "CC-Canto",
      urlTemplate: "https://cantonese.org/search.php?q={query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  zh: {
  codes: {
    wiktionaryEn: "Chinese",
    wiktionary: "zh",
    glosbe: "zh",
    tatoeba: "cmn",
    forvo: "zh",
    reverso: "chinese",
    linguee: "chinese",
    youglish: "chinese"
  },
  links: [
    {
      id: "mdbg",
      label: "MDBG",
      urlTemplate: "https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb={query}",
      components: [
        "definition"
      ]
    },
    {
      id: "purpleculture",
      label: "Purple Culture",
      urlTemplate: "https://www.purpleculture.net/dictionary-details/?word={query}",
      components: [
        "definition",
        "sentences",
        "audio",
        "images"
      ]
    },
    {
      id: "zdic",
      label: "Zdic",
      urlTemplate: "https://www.zdic.net/hans/{query}",
      components: [
        "definition",
        "audio"
      ]
    }
  ]
  },
  da: {
  codes: {
    wiktionaryEn: "Danish",
    wiktionary: "da",
    glosbe: "da",
    tatoeba: "dan",
    forvo: "da",
    linguee: "danish"
  },
  links: [
    {
      id: "ddo",
      label: "Den Danske Ordbog",
      urlTemplate: "https://ordnet.dk/ddo/ordbog?query={query}",
      components: [
        "definition",
        "audio"
      ]
    }
  ]
  },
  nl: {
  codes: {
    wiktionaryEn: "Dutch",
    wiktionary: "nl",
    glosbe: "nl",
    tatoeba: "nld",
    forvo: "nl",
    reverso: "dutch",
    wordreference: "nlen",
    linguee: "dutch",
    youglish: "dutch"
  },
  links: [
    {
      id: "woorden",
      label: "woorden.org",
      urlTemplate: "https://www.woorden.org/woord/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "mijnwoordenboek",
      label: "MijnWoordenboek",
      urlTemplate: "https://www.mijnwoordenboek.nl/vertaal/NL/EN/{query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  en: {
  codes: {
    wiktionaryEn: "English",
    tatoeba: "eng",
    forvo: "en",
    youglish: "english"
  },
  links: [
    {
      id: "cambridge",
      label: "Cambridge",
      urlTemplate: "https://dictionary.cambridge.org/dictionary/english/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    }
  ]
  },
  fi: {
  codes: {
    wiktionaryEn: "Finnish",
    wiktionary: "fi",
    glosbe: "fi",
    tatoeba: "fin",
    forvo: "fi",
    linguee: "finnish"
  },
  links: [
    {
      id: "kotus",
      label: "Kielitoimiston",
      urlTemplate: "https://www.kielitoimistonsanakirja.fi/#/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "suomisanakirja",
      label: "Suomisanakirja",
      urlTemplate: "https://www.suomisanakirja.fi/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  fr: {
  codes: {
    wiktionaryEn: "French",
    wiktionary: "fr",
    glosbe: "fr",
    tatoeba: "fra",
    forvo: "fr",
    reverso: "french",
    wordreference: "fren",
    linguee: "french",
    youglish: "french"
  },
  links: [
    {
      id: "cnrtl",
      label: "CNRTL",
      urlTemplate: "https://www.cnrtl.fr/definition/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "larousse",
      label: "Larousse",
      urlTemplate: "https://www.larousse.fr/dictionnaires/francais/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    }
  ]
  },
  de: {
  codes: {
    wiktionaryEn: "German",
    wiktionary: "de",
    glosbe: "de",
    tatoeba: "deu",
    forvo: "de",
    reverso: "german",
    wordreference: "deen",
    youglish: "german"
  },
  links: [
    {
      id: "dwds",
      label: "DWDS",
      urlTemplate: "https://www.dwds.de/wb/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    },
    {
      id: "duden",
      label: "Duden",
      urlTemplate: "https://www.duden.de/suchen/dudenonline/{query}",
      components: [
        "definition",
        "audio"
      ]
    }
  ]
  },
  el: {
  codes: {
    wiktionaryEn: "Greek",
    wiktionary: "el",
    glosbe: "el",
    tatoeba: "ell",
    forvo: "el",
    youglish: "greek"
  },
  links: [
    {
      id: "triantafyllides",
      label: "Triantafyllides",
      urlTemplate: "https://www.greek-language.gr/greekLang/modern_greek/tools/lexica/triantafyllides/search.html?lq={query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  hu: {
  codes: {
    wiktionaryEn: "Hungarian",
    wiktionary: "hu",
    glosbe: "hu",
    tatoeba: "hun",
    forvo: "hu",
    linguee: "hungarian"
  },
  links: [
    {
      id: "wikiszotar",
      label: "WikiSzotar",
      urlTemplate: "https://wikiszotar.hu/ertelmezo-szotar/{query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  id: {
  codes: {
    wiktionaryEn: "Indonesian",
    wiktionary: "id",
    glosbe: "id",
    tatoeba: "ind",
    forvo: "id",
    youglish: "indonesian"
  },
  links: [
    {
      id: "kbbi-web",
      label: "KBBI",
      urlTemplate: "https://kbbi.web.id/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "kbbi-co",
      label: "KBBI.co.id",
      urlTemplate: "https://kbbi.co.id/arti-kata/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  it: {
  codes: {
    wiktionaryEn: "Italian",
    wiktionary: "it",
    glosbe: "it",
    tatoeba: "ita",
    forvo: "it",
    reverso: "italian",
    wordreference: "iten",
    linguee: "italian",
    youglish: "italian"
  },
  links: [
    {
      id: "treccani",
      label: "Treccani",
      urlTemplate: "https://www.treccani.it/vocabolario/{query}/",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "demauro",
      label: "De Mauro",
      urlTemplate: "https://dizionario.internazionale.it/parola/{queryAscii}",
      components: [
        "definition"
      ]
    }
  ]
  },
  km: {
  codes: {
    wiktionaryEn: "Khmer",
    wiktionary: "km",
    glosbe: "km",
    tatoeba: "khm",
    forvo: "km"
  },
  links: [
    {
      id: "khmerdict",
      label: "Khmer Dictionary",
      urlTemplate: "https://khmerdict.com/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  ko: {
  codes: {
    wiktionaryEn: "Korean",
    wiktionary: "ko",
    glosbe: "ko",
    tatoeba: "kor",
    forvo: "ko",
    youglish: "korean"
  },
  links: [
    {
      id: "naver",
      label: "Naver",
      urlTemplate: "https://dict.naver.com/dict.search?query={query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    },
    {
      id: "krdict",
      label: "Krdict",
      urlTemplate: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?nationCode=6&ParaWordNo=&mainSearchWord={query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    },
    {
      id: "daum",
      label: "Daum",
      urlTemplate: "https://dic.daum.net/search.do?q={query}",
      components: [
        "definition",
        "audio"
      ]
    }
  ]
  },
  lo: {
  codes: {
    wiktionaryEn: "Lao",
    wiktionary: "lo",
    glosbe: "lo",
    tatoeba: "lao",
    forvo: "lo"
  },
  links: [
    {
      id: "laoswords",
      label: "Lao Dictionary",
      urlTemplate: "https://www.laoswords.com/{query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  la: {
  codes: {
    wiktionaryEn: "Latin",
    wiktionary: "la",
    glosbe: "la",
    tatoeba: "lat",
    forvo: "la"
  },
  links: [
    {
      id: "logeion",
      label: "Logeion",
      urlTemplate: "https://logeion.uchicago.edu/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "lsj",
      label: "Lewis & Short",
      urlTemplate: "https://lsj.gr/wiki/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "olivetti",
      label: "Olivetti",
      urlTemplate: "https://www.online-latin-dictionary.com/latin-english-dictionary.php?parola={query}",
      components: [
        "definition"
      ]
    },
    {
      id: "scaife",
      label: "Scaife",
      urlTemplate: "https://scaife.perseus.org/search/?q={query}",
      components: [
        "sentences"
      ]
    }
  ]
  },
  mn: {
  codes: {
    wiktionaryEn: "Mongolian",
    wiktionary: "mn",
    glosbe: "mn",
    tatoeba: "mon",
    forvo: "mn"
  },
  links: [
    {
      id: "mongoltoli",
      label: "Mongoltoli",
      urlTemplate: "https://mongoltoli.mn/search.php?opt=1&word={query}",
      components: [
        "definition"
      ]
    },
    {
      id: "toli-query",
      label: "Toli",
      urlTemplate: "https://toli.query.mn/?q={query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  fa: {
  codes: {
    wiktionaryEn: "Persian",
    wiktionary: "fa",
    glosbe: "fa",
    tatoeba: "pes",
    forvo: "fa",
    youglish: "persian"
  },
  links: [
    {
      id: "vajehyab",
      label: "Vajehyab",
      urlTemplate: "https://www.vajehyab.com/?q={query}",
      components: [
        "definition"
      ]
    },
    {
      id: "abadis",
      label: "Abadis",
      urlTemplate: "https://abadis.ir/fatofa/{query}/",
      components: [
        "definition"
      ]
    },
    {
      id: "dehkhoda",
      label: "Dehkhoda",
      urlTemplate: "https://dehkhoda.ut.ac.ir/fa/dictionary/{query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  pl: {
  codes: {
    wiktionaryEn: "Polish",
    wiktionary: "pl",
    glosbe: "pl",
    tatoeba: "pol",
    forvo: "pl",
    reverso: "polish",
    wordreference: "plen",
    linguee: "polish",
    youglish: "polish"
  },
  links: [
    {
      id: "sjp-pwn",
      label: "SJP PWN",
      urlTemplate: "https://sjp.pwn.pl/szukaj/{query}.html",
      components: [
        "definition"
      ]
    }
  ]
  },
  pt: {
  codes: {
    wiktionaryEn: "Portuguese",
    wiktionary: "pt",
    glosbe: "pt",
    tatoeba: "por",
    forvo: "pt",
    reverso: "portuguese",
    wordreference: "pten",
    linguee: "portuguese",
    youglish: "portuguese"
  },
  links: [
    {
      id: "priberam",
      label: "Priberam",
      urlTemplate: "https://dicionario.priberam.org/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "dicio",
      label: "Dicio",
      urlTemplate: "https://www.dicio.com.br/{queryAscii}/",
      components: [
        "definition"
      ]
    }
  ]
  },
  ro: {
  codes: {
    wiktionaryEn: "Romanian",
    wiktionary: "ro",
    glosbe: "ro",
    tatoeba: "ron",
    forvo: "ro",
    reverso: "romanian",
    wordreference: "roen",
    linguee: "romanian",
    youglish: "romanian"
  },
  links: [
    {
      id: "dexonline",
      label: "dexonline",
      urlTemplate: "https://dexonline.ro/definitie/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  ru: {
  codes: {
    wiktionaryEn: "Russian",
    wiktionary: "ru",
    glosbe: "ru",
    tatoeba: "rus",
    forvo: "ru",
    reverso: "russian",
    youglish: "russian"
  },
  links: [
    {
      id: "openrussian",
      label: "OpenRussian",
      urlTemplate: "https://en.openrussian.org/ru/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    },
    {
      id: "gramota",
      label: "Gramota",
      urlTemplate: "https://gramota.ru/poisk?query={query}&mode=all",
      components: [
        "definition"
      ]
    },
    {
      id: "kartaslov",
      label: "Kartaslov",
      urlTemplate: "https://kartaslov.ru/%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-%D1%81%D0%BB%D0%BE%D0%B2%D0%B0/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  sh: {
  codes: {
    wiktionaryEn: "Serbo-Croatian",
    wiktionary: "sh",
    glosbe: "sh",
    tatoeba: "hrv",
    forvo: "hr"
  },
  links: [
    {
      id: "rjecnik-hr",
      label: "Skolski rjecnik",
      urlTemplate: "https://rjecnik.hr/search/?q={query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  es: {
  codes: {
    wiktionaryEn: "Spanish",
    wiktionary: "es",
    glosbe: "es",
    tatoeba: "spa",
    forvo: "es",
    reverso: "spanish",
    wordreference: "esen",
    linguee: "spanish",
    youglish: "spanish"
  },
  links: [
    {
      id: "rae",
      label: "RAE",
      urlTemplate: "https://dle.rae.es/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "spanishdict",
      label: "SpanishDict",
      urlTemplate: "https://www.spanishdict.com/translate/{query}",
      components: [
        "definition",
        "sentences",
        "audio"
      ]
    }
  ]
  },
  sv: {
  codes: {
    wiktionaryEn: "Swedish",
    wiktionary: "sv",
    glosbe: "sv",
    tatoeba: "swe",
    forvo: "sv",
    reverso: "swedish",
    wordreference: "sven",
    linguee: "swedish",
    youglish: "swedish"
  },
  links: [
    {
      id: "svenska-se",
      label: "svenska.se",
      urlTemplate: "https://svenska.se/?q={query}",
      components: [
        "definition"
      ]
    }
  ]
  },
  tl: {
  codes: {
    wiktionaryEn: "Tagalog",
    wiktionary: "tl",
    glosbe: "tl",
    tatoeba: "tgl",
    forvo: "tl"
  },
  links: [
    {
      id: "tagalog-com",
      label: "Tagalog.com",
      urlTemplate: "https://www.tagalog.com/dictionary/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "diksiyonaryo-ph",
      label: "Diksiyonaryo.ph",
      urlTemplate: "https://diksiyonaryo.ph/search/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "pinoydictionary",
      label: "PinoyDictionary",
      urlTemplate: "https://tagalog.pinoydictionary.com/word/{query}/",
      components: [
        "definition"
      ]
    }
  ]
  },
  th: {
  codes: {
    wiktionaryEn: "Thai",
    wiktionary: "th",
    glosbe: "th",
    tatoeba: "tha",
    forvo: "th",
    youglish: "thai"
  },
  links: [
    {
      id: "longdo",
      label: "Longdo",
      urlTemplate: "https://dict.longdo.com/search/{query}",
      components: [
        "definition",
        "sentences"
      ]
    }
  ]
  },
  tr: {
  codes: {
    wiktionaryEn: "Turkish",
    wiktionary: "tr",
    glosbe: "tr",
    tatoeba: "tur",
    forvo: "tr",
    reverso: "turkish",
    youglish: "turkish"
  },
  links: [
    {
      id: "tdk",
      label: "TDK Sozluk",
      urlTemplate: "https://sozluk.gov.tr/?ara={query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "tureng",
      label: "Tureng",
      urlTemplate: "https://tureng.com/en/turkish-english/{query}",
      components: [
        "definition",
        "sentences"
      ]
    },
    {
      id: "seslisozluk",
      label: "Sesli Sozluk",
      urlTemplate: "https://www.seslisozluk.net/{query}-nedir-ne-demek/",
      components: [
        "definition"
      ]
    }
  ]
  },
  vi: {
  codes: {
    wiktionaryEn: "Vietnamese",
    wiktionary: "vi",
    glosbe: "vi",
    tatoeba: "vie",
    forvo: "vi",
    youglish: "vietnamese"
  },
  links: [
    {
      id: "tratu-soha",
      label: "Tra tu Soha",
      urlTemplate: "http://tratu.soha.vn/dict/vn_vn/{query}",
      components: [
        "definition"
      ]
    },
    {
      id: "vdict",
      label: "VDict",
      urlTemplate: "https://vdict.com/{query},2,0,0.html",
      components: [
        "definition"
      ]
    },
    {
      id: "vtudien",
      label: "Vtudien",
      urlTemplate: "https://vtudien.com/viet-viet/dictionary/nghia-cua-tu-{query}",
      components: [
        "definition"
      ]
    }
  ]
  }
};
const catalogue = {
  shared,
  targets
};
const CATALOGUE = catalogue;
/* @__PURE__ */ new Set([
  ...CATALOGUE.shared.map((site) => site.id),
  ...Object.values(CATALOGUE.targets).flatMap((entry) => entry.links.map((site) => site.id))
]);
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
const YOMU_HOSTED_AUDIO_SOURCE = { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true };
function getOrderedAudioSources(settings) {
  const sources = settings.audioSources.filter((source) => source.enabled);
  if (!settings.audioEnableDefaultSources) return sources;
  const hosted = settings.audioSources.find(isYomuHostedAudioSource) ?? YOMU_HOSTED_AUDIO_SOURCE;
  return [
  ...hosted.enabled ? [{ ...hosted }] : [],
  ...sources.filter((source) => !isYomuHostedAudioSource(source))
  ];
}
function isYomuHostedAudioSource(source) {
  return source.type === "custom-json" && source.url.trim() === YOMU_HOSTED_AUDIO_URL;
}
function orderAudioCandidates(candidates, mode, bagKey, shuffledAudio) {
  return orderAudioDeckEntries(candidates.map((candidate, index) => ({
  candidate,
  id: audioCandidateDeckId(candidate, index)
  })), mode, bagKey, shuffledAudio);
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
Logger.scope("Settings");
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
const DEFAULT_AUDIO_SOURCES = [
  { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true },
  { type: "jpod101", url: "", voice: "", enabled: false },
  { type: "language-pod-101", url: "", voice: "", enabled: false },
  { type: "jisho", url: "", voice: "", enabled: false },
  { type: "bunpro", url: "", voice: "", enabled: false },
  { type: "jiten-tts", url: "", voice: "", enabled: false },
  { type: "jpdb-tts", url: "", voice: "", enabled: false },
  { type: "text-to-speech", url: "", voice: "", enabled: false }
];
new Set(AUDIO_SOURCE_TYPE_VALUES);
new Set(
  DEFAULT_AUDIO_SOURCES.filter((source) => source.type !== "custom-json" || source.url !== YOMU_HOSTED_AUDIO_URL).map((source) => source.type)
);
const DEFAULT_NEW_TAB_STUDY_STEP_ORDER = [
  "kanji-doodle",
  "word",
  "type-word",
  "recall-cloze",
  "listen-pitch",
  "speaking"
];
new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
({
  languageProfiles: [createDefaultLanguageProfile()],
  dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
});
new Set(FURIGANA_HIDE_STATE_GROUPS);
new Set(
  "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
);
new Set("heiban,atamadaka,nakadaka,odaka".split(","));
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
function formatPartOfSpeechDetails(tags = []) {
  return tags.length ? tags.join(", ").toUpperCase() : "";
}
Logger.scope("DictionaryArchiveCache");
Logger.scope("Yomitan");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const GLOSSARY_DISPLAY_TEXT_KEYS = /* @__PURE__ */ new Set(["text", "content", "description", "alt", "title"]);
function glossaryValueToText(value) {
  return glossaryValueToProfileText(value, {
  includeDirectDataAttributes: true,
  fallbackTextKeys: GLOSSARY_DISPLAY_TEXT_KEYS
  });
}
function glossaryValueToProfileText(value, options) {
  const primitiveText = primitiveGlossaryText(value);
  if (primitiveText !== void 0) return primitiveText;
  if (Array.isArray(value)) {
  return value.map((child) => glossaryValueToProfileText(child, options)).filter(Boolean).join(" ");
  }
  return isRecord(value) ? glossaryRecordToText(value, options) : "";
}
function primitiveGlossaryText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return void 0;
}
function glossaryRecordToText(record2, options) {
  if (typeof record2.text === "string") return record2.text;
  if ("content" in record2) return glossaryValueToProfileText(record2.content, options);
  const values = glossaryRecordTextValues(record2, options);
  if (values.length) return values.join(" ");
  if ("path" in record2) return glossaryPathRecordText(record2);
  return "";
}
function glossaryPathRecordText(record2) {
  return String(record2.description || record2.alt || "");
}
function glossaryRecordTextValues(record2, options) {
  const values = [];
  for (const [key, childValue] of Object.entries(record2)) {
  if (!shouldReadRecordTextKey(key, options)) continue;
  const childText = glossaryValueToProfileText(childValue, options);
  if (childText) values.push(childText);
  }
  return values;
}
function shouldReadRecordTextKey(key, options) {
  return options.fallbackTextKeys.has(key) || options.includeDirectDataAttributes && key.startsWith("data-");
}
const STRUCTURED_CONTENT_TAGS = /* @__PURE__ */ new Set([
  "br",
  "ruby",
  "rt",
  "rp",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "ol",
  "ul",
  "li",
  "details",
  "summary"
]);
const STRUCTURED_STYLE_PROPERTIES = {
  fontStyle: "font-style",
  fontWeight: "font-weight",
  fontSize: "font-size",
  color: "color",
  background: "background",
  backgroundColor: "background-color",
  textDecorationStyle: "text-decoration-style",
  textDecorationColor: "text-decoration-color",
  borderColor: "border-color",
  borderStyle: "border-style",
  borderRadius: "border-radius",
  borderWidth: "border-width",
  clipPath: "clip-path",
  verticalAlign: "vertical-align",
  textAlign: "text-align",
  textEmphasis: "text-emphasis",
  textShadow: "text-shadow",
  margin: "margin",
  marginTop: "margin-top",
  marginLeft: "margin-left",
  marginRight: "margin-right",
  marginBottom: "margin-bottom",
  padding: "padding",
  paddingTop: "padding-top",
  paddingLeft: "padding-left",
  paddingRight: "padding-right",
  paddingBottom: "padding-bottom",
  wordBreak: "word-break",
  whiteSpace: "white-space",
  cursor: "cursor",
  listStyleType: "list-style-type"
};
const STRUCTURED_NUMERIC_EM_STYLES = /* @__PURE__ */ new Set(["marginTop", "marginLeft", "marginRight", "marginBottom"]);
function renderStructuredGlossaryHtml(value, dictionary = "", options = {}) {
  return renderGlossaryValue(value, {
  dictionary,
  internalSearchLinks: options.internalSearchLinks ?? false
  });
}
function renderGlossaryValue(value, context) {
  if (value == null) return "";
  if (isStructuredPrimitive(value)) return escapeHtml(String(value));
  if (Array.isArray(value)) return renderGlossaryArray(value, context);
  if (!isRecord(value)) return "";
  return renderGlossaryRecord(value, context);
}
function isStructuredPrimitive(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function renderGlossaryArray(value, context) {
  return value.map((item) => renderGlossaryValue(item, context)).filter(Boolean).join("");
}
function renderGlossaryRecord(record2, context) {
  return renderDirectGlossaryRecord(record2, context) ?? renderTaggedGlossaryRecord(record2, context);
}
const DIRECT_GLOSSARY_RECORD_RENDERERS = [
  renderTextGlossaryRecord,
  renderStructuredContentGlossaryRecord,
  renderImageGlossaryRecord,
  renderTextContentGlossaryRecord
];
function renderDirectGlossaryRecord(record2, context) {
  for (const render of DIRECT_GLOSSARY_RECORD_RENDERERS) {
  const html = render(record2, context);
  if (html !== null) return html;
  }
  return null;
}
function renderTextGlossaryRecord(record2) {
  return typeof record2.text === "string" ? escapeHtml(record2.text) : null;
}
function renderStructuredContentGlossaryRecord(record2, context) {
  return record2.type === "structured-content" ? renderStructuredContent(record2, context) : null;
}
function renderImageGlossaryRecord(record2, context) {
  return isStructuredImageRecord(record2) ? renderStructuredImage(record2, context.dictionary) : null;
}
function renderTextContentGlossaryRecord(record2, context) {
  return record2.type === "text" && "content" in record2 ? renderGlossaryValue(record2.content, context) : null;
}
function renderStructuredContent(record2, context) {
  const dictionaryAttr = context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : "";
  return `<span class="structured-content"${dictionaryAttr}>${renderGlossaryValue(record2.content, context)}</span>`;
}
function renderTaggedGlossaryRecord(record2, context) {
  const tag = structuredRecordTag(record2);
  if (!tag) return renderRecordValues(record2, context);
  return renderKnownTaggedGlossaryRecord(record2, tag, context) ?? structuredFallbackContent(record2, taggedRecordContent(record2, tag, context));
}
function renderKnownTaggedGlossaryRecord(record2, tag, context) {
  if (tag === "a") return renderStructuredLink(record2, context);
  if (tag === "img") return renderStructuredImage(record2, context.dictionary);
  const content = taggedRecordContent(record2, tag, context);
  if (tag === "table") return renderStructuredTable(record2, content, context.dictionary);
  if (STRUCTURED_CONTENT_TAGS.has(tag)) return renderStructuredElement(record2, tag, content, context.dictionary);
  return null;
}
function taggedRecordContent(record2, tag, context) {
  return tag === "br" ? "" : renderGlossaryValue(record2.content, context);
}
function structuredFallbackContent(record2, content) {
  return content || escapeHtml(glossaryValueToText(record2));
}
function structuredRecordTag(record2) {
  if (typeof record2.tag === "string") return record2.tag.toLowerCase();
  return "content" in record2 ? "span" : "";
}
function renderRecordValues(record2, context) {
  return Object.values(record2).map((item) => renderGlossaryValue(item, context)).filter(Boolean).join("");
}
function renderStructuredTable(record2, content, dictionary) {
  return `<div class="gloss-sc-table-container"><table${renderStructuredElementAttributes(record2, "table", dictionary)}>${content}</table></div>`;
}
function renderStructuredElement(record2, tag, content, dictionary) {
  const attrs = renderStructuredElementAttributes(record2, tag, dictionary);
  return tag === "br" ? `<br${attrs}>` : `<${tag}${attrs}>${content}</${tag}>`;
}
function renderStructuredElementAttributes(record2, tag, dictionary) {
  return [
  ` class="gloss-sc-${escapeHtml(tag)}"`,
  dictionaryDataAttribute(dictionary),
  renderStructuredDataAttributes(record2.data),
  renderDirectDataAttributes(record2),
  structuredStyleAttribute(record2.style),
  structuredStringAttribute("title", record2.title),
  structuredStringAttribute("lang", record2.lang),
  ...structuredStateAttributes(record2, tag)
  ].filter(Boolean).join("");
}
function dictionaryDataAttribute(dictionary) {
  return dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : "";
}
function structuredStyleAttribute(value) {
  const style = renderStructuredStyle(value);
  return style ? ` style="${escapeHtml(style)}"` : "";
}
function structuredStringAttribute(name, value) {
  return typeof value === "string" ? ` ${name}="${escapeHtml(value)}"` : "";
}
function structuredStateAttributes(record2, tag) {
  return [
  tag === "details" && record2.open === true ? " open" : "",
  tableCellSpanAttribute(record2, tag, "colSpan", "colspan"),
  tableCellSpanAttribute(record2, tag, "rowSpan", "rowspan")
  ];
}
function tableCellSpanAttribute(record2, tag, key, attr) {
  const value = Number(record2[key]);
  return isTableCellTag(tag) && Number.isFinite(value) ? ` ${attr}="${value}"` : "";
}
function isTableCellTag(tag) {
  return tag === "td" || tag === "th";
}
function renderStructuredDataAttributes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value).map(([key, rawValue]) => renderStructuredDataAttribute(key, rawValue)).filter(Boolean).join("");
}
function renderStructuredDataAttribute(key, rawValue) {
  return key && isStructuredAttributeValue(rawValue) ? ` data-sc-${camelToKebabCase(key)}="${escapeHtml(String(rawValue))}"` : "";
}
function isStructuredAttributeValue(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function renderDirectDataAttributes(record2) {
  return Object.entries(record2).map(renderDirectDataAttribute).filter(Boolean).join("");
}
function renderDirectDataAttribute([key, value]) {
  return isDirectDataAttribute(key, value) ? ` ${key}="${escapeHtml(String(value))}"` : "";
}
function isDirectDataAttribute(key, value) {
  return key.startsWith("data-") && isStructuredAttributeValue(value);
}
function renderStructuredStyle(value) {
  const style = structuredStyleRecord(value);
  if (!style) return "";
  const declarations = [];
  const decoration = structuredTextDecoration(style.textDecorationLine);
  if (decoration) declarations.push(decoration);
  for (const [key, property] of Object.entries(STRUCTURED_STYLE_PROPERTIES)) {
  const declaration = structuredStyleDeclaration(key, property, style[key]);
  if (declaration) declarations.push(declaration);
  }
  return declarations.join("");
}
function structuredStyleRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function structuredTextDecoration(value) {
  if (typeof value === "string") return `text-decoration:${value};`;
  if (Array.isArray(value)) return `text-decoration:${value.map(String).join(" ")};`;
  return "";
}
function structuredStyleDeclaration(key, property, rawValue) {
  if (typeof rawValue === "string") return `${property}:${rawValue};`;
  if (typeof rawValue === "number" && STRUCTURED_NUMERIC_EM_STYLES.has(key)) return `${property}:${rawValue}em;`;
  return "";
}
function renderStructuredLink(record2, context) {
  const content = renderGlossaryValue(record2.content, context) || escapeHtml(glossaryValueToText(record2));
  const link = structuredLinkModel(record2, context);
  const icon = link.external ? '<span class="gloss-link-external-icon icon" data-icon="external-link"></span>' : "";
  return `<a${structuredLinkAttrs(link, context.dictionary, record2.lang)}><span class="gloss-link-text">${content}</span>${icon}</a>`;
}
function structuredLinkModel(record2, context) {
  const rawHref = typeof record2.href === "string" ? record2.href : "";
  const searchReference = structuredLinkSearchReference(rawHref, context);
  const kanjiReference = structuredLinkKanjiReference(rawHref, context);
  const href = structuredLinkHref(rawHref, searchReference, kanjiReference);
  return {
  href,
  external: isExternalStructuredHref(href),
  searchReference,
  kanjiReference
  };
}
function structuredLinkSearchReference(rawHref, context) {
  return context.internalSearchLinks ? parseStructuredSearchReference(rawHref) : null;
}
function structuredLinkKanjiReference(rawHref, context) {
  return context.internalSearchLinks ? parseStructuredKanjiReference(rawHref) : null;
}
function structuredLinkHref(rawHref, searchReference, kanjiReference) {
  if (searchReference) return "#jpdb-reader-dictionary-lookup";
  if (kanjiReference) return "#jpdb-reader-kanji-lookup";
  return normalizeStructuredHref(rawHref);
}
function isExternalStructuredHref(href) {
  return Boolean(href && !href.startsWith(locationOrigin()) && !href.startsWith("#"));
}
function structuredLinkAttrs(link, dictionary, lang) {
  return [
  ' class="gloss-link"',
  ` data-external="${link.external}"`,
  dictionaryAttribute(dictionary),
  kanjiReferenceActionAttribute(link),
  searchReferenceQueryAttribute(link),
  searchReferenceReadingAttribute(link),
  hrefAttribute(link.href),
  externalLinkAttributes(link.external),
  langAttribute(lang)
  ].join("");
}
function kanjiReferenceActionAttribute(link) {
  return link.kanjiReference ? ` data-action="kanji" data-kanji="${escapeHtml(link.kanjiReference.kanji)}"` : "";
}
function dictionaryAttribute(dictionary) {
  return dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : "";
}
function searchReferenceQueryAttribute(link) {
  return link.searchReference ? ` data-dictionary-lookup="${escapeHtml(link.searchReference.query)}"` : "";
}
function searchReferenceReadingAttribute(link) {
  return link.searchReference?.reading ? ` data-dictionary-reading="${escapeHtml(link.searchReference.reading)}"` : "";
}
function hrefAttribute(href) {
  return href ? ` href="${escapeHtml(href)}"` : "";
}
function externalLinkAttributes(external) {
  return external ? ' target="_blank" rel="noopener noreferrer"' : "";
}
function langAttribute(lang) {
  return typeof lang === "string" ? ` lang="${escapeHtml(lang)}"` : "";
}
function renderStructuredImage(record2, dictionary) {
  const path = typeof record2.path === "string" ? record2.path : "";
  const title = typeof record2.title === "string" ? record2.title : "";
  const description = structuredImageDescription(record2);
  const src = structuredImageSrc(path);
  const alt = escapeHtml(description || title || "Dictionary image");
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
  return `<span${renderStructuredImageAttributes(record2, dictionary)}${titleAttribute}><img class="gloss-image"${src ? ` src="${escapeHtml(src)}"` : ""} alt="${alt}"><span class="gloss-image-fallback">${alt}</span></span>`;
}
function renderStructuredImageAttributes(record2, dictionary) {
  return [
  ` class="gloss-image-link"`,
  dictionaryAttribute(dictionary),
  structuredImageStateAttribute(record2)
  ].join("");
}
function structuredImageStateAttribute(record2) {
  const path = typeof record2.path === "string" ? record2.path : "";
  return ` data-image-load-state="${structuredImageSrc(path) ? "loaded" : "error"}"`;
}
function structuredImageSrc(path) {
  return /^data:image\//i.test(path) ? path : "";
}
function structuredImageDescription(record2) {
  if (typeof record2.description === "string") return record2.description;
  return typeof record2.alt === "string" ? record2.alt : "";
}
function isStructuredImageRecord(record2) {
  return record2.type === "image" || "path" in record2;
}
function normalizeStructuredHref(href) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href) || href.startsWith("#")) return href;
  if (href.startsWith("?")) return `https://jpdb.io/search${href}`;
  return "";
}
function parseStructuredSearchReference(href) {
  if (!href.startsWith("?")) return null;
  const params = structuredSearchParams(href);
  return params ? structuredSearchReferenceFromParams(params) : null;
}
function parseStructuredKanjiReference(href) {
  const match = /^(?:https:\/\/jpdb\.io)?\/kanji\/([^/?#]+)/i.exec(href.trim());
  if (!match) return null;
  const value = decodeStructuredPathSegment(match[1]);
  const kanji = Array.from(value).find(isJapaneseKanjiCharacter) ?? "";
  return kanji ? { kanji } : null;
}
function decodeStructuredPathSegment(value) {
  try {
  return decodeURIComponent(value);
  } catch {
  return value;
  }
}
function structuredSearchParams(href) {
  try {
  return new URLSearchParams(href.slice(1));
  } catch {
  return null;
  }
}
function structuredSearchReferenceFromParams(params) {
  const query = (params.get("query") ?? "").trim();
  return query ? { query, reading: (params.get("primary_reading") ?? "").trim() } : null;
}
function locationOrigin() {
  try {
  return location.origin;
  } catch {
  return "";
  }
}
function camelToKebabCase(value) {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function glossaryToText(value) {
  return glossaryValueToText(value);
}
function glossaryToHtml(value, dictionary = "", options = {}) {
  const html = renderStructuredGlossaryHtml(value, dictionary, options);
  return html;
}
async function reconcileManagedStateIdbEpoch(db, epoch, options) {
  const token = managedStateEpochToken(epoch);
  const transactionStores = [.../* @__PURE__ */ new Set([
  options.markerStoreName,
  ...options.clearedStoreNames,
  ...(options.deletedRecords ?? []).map((record2) => record2.storeName)
  ])];
  let reconciliationError;
  await new Promise((resolve, reject) => {
  const tx = db.transaction(transactionStores, "readwrite");
  const markerStore = tx.objectStore(options.markerStoreName);
  const request = markerStore.get(options.markerKey);
  request.onsuccess = () => {
    const record2 = request.result;
    const markerMissing = record2 === void 0;
    if (!markerMissing && (!record2 || typeof record2 !== "object" || Array.isArray(record2) || typeof record2.token !== "string")) {
      reconciliationError = managedStateIdbEpochError(options.label, "malformed");
      return;
    }
    const storedToken = markerMissing ? void 0 : record2.token;
    if (storedToken === token) return;
    if (storedToken !== void 0) {
      const relation = managedStateEpochTokenRelation(storedToken, epoch);
      if (relation === "newer" || relation === "conflict" || relation === "malformed") {
        reconciliationError = managedStateIdbEpochError(options.label, relation);
        return;
      }
    }
    if (storedToken !== void 0) {
      for (const storeName of options.clearedStoreNames) tx.objectStore(storeName).clear();
      for (const record22 of options.deletedRecords ?? []) tx.objectStore(record22.storeName).delete(record22.key);
    }
    markerStore.put({ [options.markerKeyPath]: options.markerKey, token });
  };
  request.onerror = () => reject(request.error ?? new Error(`Could not read ${options.label} epoch.`));
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error(`Could not reconcile ${options.label} epoch.`));
  tx.onabort = () => reject(tx.error ?? new Error(`Could not reconcile ${options.label} epoch.`));
  });
  if (reconciliationError) throw reconciliationError;
  await assertManagedStateMutationAllowed();
}
async function runManagedStateIdbWrite(db, marker, storeNames, mutate, options = {}) {
  const epoch = await assertManagedStateMutationAllowed();
  const transactionStores = [.../* @__PURE__ */ new Set([
  marker.storeName,
  ...typeof storeNames === "string" ? [storeNames] : storeNames
  ])];
  const tx = managedStateIdbTransaction(db, transactionStores, options.durability);
  const done = idbTransactionDone$1(tx);
  let mutationError;
  const markerRequest = tx.objectStore(marker.storeName).get(marker.key);
  markerRequest.onsuccess = () => {
  try {
    assertManagedStateIdbMarker(markerRequest.result, epoch);
    mutate(tx);
  } catch (error) {
    mutationError = error;
    try {
      tx.abort();
    } catch {
    }
  }
  };
  try {
  await done;
  } catch (error) {
  throw mutationError ?? error;
  }
  if (mutationError) throw mutationError;
  await assertManagedStateMutationAllowed();
}
function managedStateIdbTransaction(db, storeNames, durability) {
  if (!durability) return db.transaction(storeNames, "readwrite");
  try {
  return db.transaction(storeNames, "readwrite", { durability });
  } catch {
  return db.transaction(storeNames, "readwrite");
  }
}
function idbTransactionDone$1(tx) {
  return new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error("Managed IndexedDB write failed."));
  tx.onabort = () => reject(tx.error ?? new Error("Managed IndexedDB write aborted."));
  });
}
function managedStateIdbEpochError(label, relation) {
  if (relation === "newer") return new Error(`${label} belongs to a newer managed-state epoch.`);
  if (relation === "conflict") return new Error(`${label} has a conflicting managed-state epoch.`);
  return new Error(`${label} has a malformed managed-state epoch.`);
}
function assertManagedStateIdbMarker(record2, epoch) {
  if (!record2 || typeof record2 !== "object" || Array.isArray(record2) || typeof record2.token !== "string") {
  throw new Error("Managed IndexedDB epoch marker is missing or malformed.");
  }
  const storedToken = record2.token;
  if (storedToken !== managedStateEpochToken(epoch)) {
  throw new Error(`Managed IndexedDB epoch marker is stale (${storedToken}).`);
  }
}
new TextDecoder();
Logger.scope("YomitanSettingsImport");
Logger.scope("Yomitan");
function formatMetaFrequency(value) {
  const display = metaFrequencyDisplayValue(value);
  if (display == null) return "";
  return `#${display}`;
}
function metaFrequencyDisplayValue(value) {
  const primitive = primitiveMetaValue(value);
  if (primitive !== null) return primitive;
  const record2 = objectRecord(value);
  return record2 ? scalarMetaValue(nestedMetaValue(record2)) : null;
}
function scalarMetaValue(value) {
  const primitive = primitiveMetaValue(value);
  if (primitive !== null) return primitive;
  const record2 = objectRecord(value);
  return record2 ? scalarMetaValue(nestedMetaValue(record2)) : null;
}
function primitiveMetaValue(value) {
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}
function objectRecord(value) {
  return value && typeof value === "object" ? value : null;
}
function nestedMetaValue(record2) {
  return record2.displayValue ?? record2.frequency ?? record2.value;
}
function groupTermEntriesByDictionary(entries2) {
  const grouped = /* @__PURE__ */ new Map();
  for (const entry of entries2) {
  const group = grouped.get(entry.dictionary) ?? [];
  group.push(entry);
  grouped.set(entry.dictionary, group);
  }
  return grouped;
}
function buildYomuAnkiFields(card, sentence = "", context = {}) {
  const fieldContext = ankiFieldContext(context);
  const jpdbUrl = jpdbVocabularyUrl$1(card);
  return {
  Expression: escapeHtml$1(card.spelling),
  Reading: renderCardReading(card),
  Meaning: renderJpdbMeanings(card),
  Sentence: renderSentence(sentence, sentenceHighlightTargets(card, fieldContext)),
  Url: escapeHtml$1(fieldContext.sourceUrl),
  Frequency: renderFrequency(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
  PartOfSpeech: renderPartOfSpeech(card.partOfSpeech),
  Image: "",
  Audio: "",
  JPDB: renderJpdbLink(jpdbUrl, fieldContext.interfaceLanguage),
  Status: renderCardStatus(card, fieldContext.interfaceLanguage),
  Pitch: renderPitchField(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
  DictionaryDefinitions: renderDictionaryDefinitions(fieldContext.localEntries, fieldContext.dictionaryPreferences),
  Kanji: renderKanjiDefinitions(fieldContext.kanjiEntries, fieldContext.dictionaryPreferences, fieldContext.interfaceLanguage),
  Source: renderSource(fieldContext.sourceUrl, fieldContext.sourceTitle)
  };
}
function buildYomuAnkiPreviewFields$1(card, sentence, settings, context = {}, fieldTargetPlan) {
  const yomuFields = buildYomuAnkiFields(card, sentence, {
  ...context,
  interfaceLanguage: settings.interfaceLanguage
  });
  if (fieldTargetPlan && !fieldTargetPlan.yomuManaged && fieldTargetPlan.fieldNames.length) {
  const mapping2 = ankiFieldMappingForModel(settings, fieldTargetPlan.modelName, fieldTargetPlan.fieldNames);
  const retargeted = retargetYomuFieldsToExistingModel(yomuFields, fieldTargetPlan.fieldNames, mapping2);
  const written = Object.fromEntries(Object.entries(retargeted).filter(([, value]) => value.trim()));
  if (Object.keys(written).length) return written;
  }
  const mapping = settings.ankiFieldMappings?.[settings.ankiModel.trim() || "よむ Japanese"];
  if (!mapping || !Object.values(mapping).some((value) => value?.trim())) return yomuFields;
  const fields = {};
  for (const role of ANKI_FIELD_ROLES) {
  const fieldName = mapping[role]?.trim();
  const value = yomuFields[yomuFieldForRole(role)];
  if (fieldName && value) fields[fieldName] = value;
  }
  return Object.keys(fields).length ? fields : yomuFields;
}
function renderCardReading(card) {
  return card.reading && card.reading !== card.spelling ? escapeHtml$1(card.reading) : "";
}
function renderPartOfSpeech(partOfSpeech) {
  return escapeHtml$1(formatPartOfSpeech(partOfSpeech) || formatPartOfSpeechDetails(partOfSpeech));
}
function renderJpdbLink(jpdbUrl, language) {
  return jpdbUrl ? `<a href="${jpdbUrl}">${escapeHtml$1(uiText(language, "openOnJpdb"))}</a>` : "";
}
function ankiFieldContext(context) {
  return {
  localEntries: fallbackArray(context.localEntries),
  kanjiEntries: fallbackArray(context.kanjiEntries),
  metaEntries: fallbackArray(context.metaEntries),
  dictionaryPreferences: fallbackArray(context.dictionaryPreferences),
  sentenceTarget: fallbackString(context.sentenceTarget),
  sourceUrl: fallbackString(context.sourceUrl),
  sourceTitle: fallbackString(context.sourceTitle),
  interfaceLanguage: context.interfaceLanguage ?? "en"
  };
}
function fallbackArray(value) {
  return value ?? [];
}
function fallbackString(value) {
  return value ?? "";
}
function jpdbVocabularyUrl$1(card) {
  return card.source === "local" || card.source === "anki" ? "" : `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
}
function renderCardStatus(card, language) {
  if (card.source === "local") return `<span class="yomu-chip">${escapeHtml$1(uiText(language, "ankiLocalDictionaryStatus"))}</span>`;
  if (card.source === "anki") return '<span class="yomu-chip">Anki</span>';
  return card.cardState.map((state) => `<span class="yomu-chip">${escapeHtml$1(state)}</span>`).join(" ");
}
function renderJpdbMeanings(card) {
  return card.meanings.slice(0, 8).map((meaning) => {
  const pos = formatPartOfSpeech(meaning.partOfSpeech);
  return `<div class="yomu-definition">
        ${pos ? `<span class="yomu-pos">${escapeHtml$1(pos)}</span>` : ""}
        <div>${escapeHtml$1(meaning.glosses.join("; "))}</div>
    </div>`;
  }).join("");
}
function sentenceHighlightTargets(card, context) {
  return [context.sentenceTarget, card.spelling, card.reading];
}
function renderSentence(sentence, targets2) {
  if (!sentence) return "";
  const target = firstSentenceHighlightTarget(sentence, targets2);
  if (!target) return escapeHtml$1(sentence);
  return sentence.split(target).map((part) => escapeHtml$1(part)).join(`<span class="yomu-highlight">${escapeHtml$1(target)}</span>`);
}
function firstSentenceHighlightTarget(sentence, targets2) {
  const seen = /* @__PURE__ */ new Set();
  for (const target of targets2) {
  const normalized = target.trim();
  if (!normalized || seen.has(normalized)) continue;
  seen.add(normalized);
  if (sentence.includes(normalized)) return normalized;
  }
  return "";
}
function renderDictionaryDefinitions(entries2, preferences) {
  const groups = Array.from(groupTermEntriesByDictionary(entries2).entries()).slice(0, 6);
  return groups.map(([dictionary, items]) => `
    <div class="yomu-dict-group">
        <h3 class="yomu-dict-label">${escapeHtml$1(dictionaryLabel(dictionary, preferences))}</h3>
        ${items.slice(0, 6).map((entry) => `
            <div class="yomu-dict-entry">
                <div class="yomu-dict-head">
                    <span class="yomu-dict-expression">${escapeHtml$1(entry.expression)}</span>
                    ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml$1(entry.reading)}</span>` : ""}
                    ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml$1([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(" · "))}</span>` : ""}
                </div>
                <div class="yomu-glossary" data-dictionary="${escapeHtml$1(entry.dictionary)}">${entry.glossary.slice(0, 5).map((item) => `<div>${safeGlossaryHtml(item, entry.dictionary)}</div>`).join("")}</div>
            </div>
        `).join("")}
    </div>
  `).join("");
}
function renderKanjiDefinitions(entries2, preferences, language) {
  const byCharacter = /* @__PURE__ */ new Map();
  for (const entry of entries2) {
  const group = byCharacter.get(entry.character) ?? [];
  group.push(entry);
  byCharacter.set(entry.character, group);
  }
  return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
    <div class="yomu-kanji-entry">
        <div class="yomu-dict-head">
            <span class="yomu-kanji-char">${escapeHtml$1(character)}</span>
            <span class="yomu-dict-label">${escapeHtml$1(items.map((item) => dictionaryLabel(item.dictionary, preferences)).filter(uniqueValue).slice(0, 3).join(" · "))}</span>
        </div>
        ${items.slice(0, 3).map((item) => `
            <div>
                ${item.onyomi.length ? `<span class="yomu-kanji-reading">${escapeHtml$1(uiText(language, "onReading"))} ${escapeHtml$1(item.onyomi.join("、"))}</span>` : ""}
                ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> ${escapeHtml$1(uiText(language, "kunReading"))} ${escapeHtml$1(item.kunyomi.join("、"))}</span>` : ""}
                <div>${item.meanings.slice(0, 8).map((meaning) => escapeHtml$1(meaning)).join("; ")}</div>
                ${item.tags.length ? `<span class="yomu-tags">${escapeHtml$1(item.tags.join(" · "))}</span>` : ""}
            </div>
        `).join("")}
    </div>
  `).join("");
}
function renderFrequency(card, entries2, preferences) {
  const chips = [];
  if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
  for (const entry of entries2) {
  appendFrequencyChip(chips, entry, preferences);
  if (chips.length >= 8) break;
  }
  return chips.filter(uniqueValue).join(" ");
}
function appendFrequencyChip(chips, entry, preferences) {
  if (entry.mode !== "freq") return;
  const value = formatMetaFrequency(entry.data);
  if (value) chips.push(`<span class="yomu-chip">${escapeHtml$1(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml$1(value)}</span>`);
}
function renderPitchField(card, entries2, preferences) {
  const chips = firstJpdbPitchChip(card);
  for (const entry of entries2) {
  appendPitchChip(chips, entry, preferences);
  if (chips.length >= 4) break;
  }
  return chips.filter(uniqueValue).join(" ");
}
function firstJpdbPitchChip(card) {
  const pitch = card.pitchAccent.find(Boolean);
  if (!pitch) return [];
  const reading = card.reading && card.reading !== card.spelling ? `${card.reading} ` : "";
  return [`<span class="yomu-chip">JPDB ${escapeHtml$1(reading)}${escapeHtml$1(pitch)}</span>`];
}
function appendPitchChip(chips, entry, preferences) {
  if (entry.mode !== "pitch") return;
  const value = formatMetaPitch(entry.data);
  if (value) chips.push(`<span class="yomu-chip">${escapeHtml$1(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml$1(value)}</span>`);
}
function renderSource(sourceUrl, sourceTitle) {
  const source = ankiSourceLink(sourceUrl, sourceTitle);
  if (!source.label) return "";
  return source.href ? `<a href="${escapeHtml$1(source.href)}">${escapeHtml$1(source.label)}</a>` : escapeHtml$1(source.label);
}
function ankiSourceLink(sourceUrl, sourceTitle) {
  return { href: sourceUrl, label: sourceTitle || sourceUrl };
}
function dictionaryLabel(name, preferences) {
  return preferences.find((item) => item.name === name)?.alias || name;
}
function uniqueValue(value, index, array) {
  return array.indexOf(value) === index;
}
function safeGlossaryHtml(value, dictionary) {
  const html = glossaryToHtml(value, dictionary);
  return html || escapeHtml$1(glossaryToText(value));
}
function formatMetaPitch(value) {
  const record2 = metaRecord(value);
  if (!record2) return "";
  const positions = metaPitchPositions(record2);
  return positions.length ? formatPitchPositions(positions) : formatPitchPosition(record2.position);
}
function metaRecord(value) {
  return value && typeof value === "object" ? value : null;
}
function metaPitchPositions(record2) {
  if (Array.isArray(record2.pitches)) return record2.pitches;
  return Array.isArray(record2.positions) ? record2.positions : [];
}
function formatPitchPositions(positions) {
  return positions.slice(0, 4).map(String).join(", ");
}
function formatPitchPosition(position) {
  return typeof position === "number" ? String(position) : "";
}
const ANKI_CARD_STATE_PRIORITY = ["failed", "due", "learning", "known", "new", "suspended", "in-deck", "not-in-deck"];
function emptyAnkiLookupResult() {
  return { state: "not-in-deck", notes: [], primary: null };
}
function untrustedAnkiLookupResult() {
  return { ...emptyAnkiLookupResult(), trusted: false };
}
function cardsByNoteId(cards) {
  const cardsByNote = /* @__PURE__ */ new Map();
  for (const cardInfo of cards) addCardInfoByNoteId(cardsByNote, cardInfo);
  return cardsByNote;
}
function ankiExistingNoteFromInfo(note, noteCards) {
  for (const noteCard of noteCards) applyComputedAnkiNextReviews(noteCard);
  const reviewGradeIntervals = reviewGradeIntervalsFromAnkiCards(noteCards);
  return {
  noteId: note.noteId,
  modelName: note.modelName,
  cardIds: note.cards ?? [],
  fields: flattenNoteFields(note.fields),
  renderedCards: ankiRenderedCards(noteCards),
  tags: note.tags ?? [],
  ...reviewGradeIntervals ? { reviewGradeIntervals } : {},
  ...ankiCardDetailSummary(note, noteCards)
  };
}
function ankiStatusIndexEntryFromInfo(note, noteCards) {
  return {
  noteId: note.noteId,
  modelName: note.modelName,
  ...ankiCardDetailSummary(note, noteCards)
  };
}
function ankiNoteHasRenderableDetails(note) {
  if (note.renderedCards?.some((card) => card.question.trim() || card.answer.trim())) return true;
  return Object.values(note.fields).some((value) => value.trim());
}
function ankiRenderedCardMediaFilenames(card) {
  return unique([card.question, card.answer].flatMap(ankiCardHtmlMediaFilenames).filter(shouldHydrateRenderedAnkiMedia));
}
function ankiCardTemplateLabel(card) {
  const explicit = [card.cardName, card.card, card.template, card.name].map((value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "").find(Boolean);
  if (explicit) return explicit;
  const ordinal = Number(card.ord);
  return Number.isInteger(ordinal) && ordinal >= 0 ? `Card ${ordinal + 1}` : "";
}
function ankiMediaFilenameFromCardUrl$1(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("\\")) return null;
  if (/^(?:https?|data|blob|file|mailto|tel|javascript|vbscript):/i.test(trimmed)) return null;
  const filename = trimmed.split(/[?#]/, 1)[0]?.replace(/^\.\//, "") ?? "";
  if (!filename || filename.includes("..") || /^[a-z][a-z0-9+.-]*:/i.test(filename)) return null;
  try {
  return decodeURIComponent(filename);
  } catch {
  return filename;
  }
}
function ankiMediaMimeType(filename) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return ANKI_MEDIA_MIME_TYPES[extension] ?? "audio/mpeg";
}
function stateFromAnkiCards(cards) {
  if (!cards.length) return "known";
  if (cards.some((card) => card.type === 3 || card.queue === 3)) return "failed";
  if (cards.some(isAnkiCardDue)) return "due";
  if (cards.some((card) => card.queue === 1 || card.type === 1)) return "learning";
  if (cards.some((card) => card.queue === 0 || card.type === 0)) return "new";
  if (cards.every((card) => card.queue === -1)) return "suspended";
  return "known";
}
function stateFromExistingNotes(notes) {
  return ANKI_CARD_STATE_PRIORITY.slice(0, 6).find((state) => notes.some((note) => note.state === state)) ?? (notes.length ? "known" : "not-in-deck");
}
function pickPrimaryCard(cards) {
  const order = (card) => {
  if (card.type === 3 || card.queue === 3) return 0;
  if (isAnkiCardDue(card)) return 1;
  if (card.queue === 1 || card.type === 1) return 2;
  if (card.queue === 0 || card.type === 0) return 3;
  return 4;
  };
  return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}
function applyComputedAnkiNextReviews(card) {
  if (Array.isArray(card.nextReviews) && card.nextReviews.length) return;
  if (card.type !== 2) return;
  const interval = Number(card.interval);
  const ease = Number(card.factor) / 1e3;
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(ease) || ease <= 0) return;
  const hard = Math.max(interval * 1.2, interval + 1);
  const good = Math.max(hard + 1, interval * ease);
  const easy = Math.max(good + 1, good * 1.3);
  card.buttons = [2, 3, 4];
  card.nextReviews = [hard, good, easy].map(formatAnkiIntervalDays);
}
function formatAnkiIntervalDays(days) {
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30.44).toFixed(1).replace(/\.0$/, "")}mo`;
  return `${(days / 365.25).toFixed(1).replace(/\.0$/, "")}y`;
}
function reviewGradeIntervalsFromAnkiCards(cards) {
  return reviewGradeIntervalsFromAnkiCard(pickPrimaryCard(cards));
}
function reviewGradeIntervalsFromAnkiCard(card) {
  const nextReviews = Array.isArray(card?.nextReviews) ? card.nextReviews.map(normalizeAnkiReviewIntervalLabel).filter(Boolean) : [];
  if (!nextReviews.length) return void 0;
  const buttons = ankiReviewButtons(card?.buttons, nextReviews.length);
  const labels = ankiReviewButtonLabels(buttons);
  const intervals = {};
  nextReviews.forEach((intervalLabel, index) => {
  const button = buttons[index];
  if (!button) return;
  const buttonLabel = labels[index] ?? ankiReviewButtonLabel(button);
  const interval = reviewGradeInterval(buttonLabel, intervalLabel);
  for (const grade of ankiGradesForButton(button)) intervals[grade] = interval;
  });
  return Object.keys(intervals).length ? intervals : void 0;
}
function normalizeAnkiReviewIntervalLabel(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
function ankiReviewButtons(value, count) {
  const explicit = Array.isArray(value) ? value.map(Number).filter((button) => Number.isInteger(button) && button > 0) : [];
  if (explicit.length === count) return explicit;
  if (count === 4) return [1, 2, 3, 4];
  if (count === 3) return [1, 2, 3];
  if (count === 2) return [1, 2];
  return Array.from({ length: count }, (_, index) => index + 1);
}
function ankiReviewButtonLabels(buttons) {
  if (buttons.length === 3 && buttons.every((button, index) => button === index + 1)) {
  return ["Again", "Good", "Easy"];
  }
  if (buttons.length === 2 && buttons.every((button, index) => button === index + 1)) {
  return ["Again", "Good"];
  }
  return buttons.map(ankiReviewButtonLabel);
}
function ankiReviewButtonLabel(button) {
  return ANKI_REVIEW_BUTTON_LABELS[button] ?? `Button ${button}`;
}
function ankiGradesForButton(button) {
  return ANKI_GRADES_BY_BUTTON[button] ?? [];
}
function reviewGradeInterval(buttonLabel, intervalLabel) {
  return {
  buttonLabel,
  intervalLabel,
  label: `${buttonLabel} ${intervalLabel}`,
  source: "anki-next-reviews"
  };
}
function isAnkiCardDue(card) {
  if (card.queue !== 2) return false;
  if (typeof card.isDue === "boolean") return card.isDue;
  return Number(card.due ?? 0) <= 0;
}
function pickPrimaryExistingNote(notes) {
  return [...notes].sort((a, b) => ankiCardStateRank(a.state) - ankiCardStateRank(b.state))[0] ?? null;
}
function ankiCardStateRank(state) {
  const index = ANKI_CARD_STATE_PRIORITY.indexOf(state);
  return index < 0 ? ANKI_CARD_STATE_PRIORITY.length : index;
}
function addCardInfoByNoteId(cardsByNote, cardInfo) {
  const noteId = Number(cardInfo.note);
  if (!Number.isFinite(noteId)) return;
  const list = cardsByNote.get(noteId) ?? [];
  list.push(cardInfo);
  cardsByNote.set(noteId, list);
}
function ankiRenderedCards(noteCards) {
  return noteCards.filter((card) => card.question || card.answer).map((card) => {
  const cardName = ankiCardTemplateLabel(card);
  return {
    cardId: card.cardId,
    deckName: card.deckName,
    ...cardName ? { cardName } : {},
    question: String(card.question ?? ""),
    answer: String(card.answer ?? "")
  };
  });
}
function ankiCardHtmlMediaFilenames(html) {
  return Array.from(
  html.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi),
  (match) => ankiMediaFilenameFromCardUrl$1(match[1] ?? match[2] ?? match[3] ?? "")
  ).filter((filename) => Boolean(filename));
}
function shouldHydrateRenderedAnkiMedia(filename) {
  return ankiMediaMimeType(filename).startsWith("image/");
}
function ankiNoteDeckNames(noteCards) {
  return unique(noteCards.map((item) => item.deckName).filter(Boolean));
}
function ankiNotePrimaryCardId(note, noteCards) {
  return pickPrimaryCard(noteCards)?.cardId ?? note.cards?.[0] ?? null;
}
const ANKI_NEVER_FORGET_TAG = "yomu-never-forget";
function ankiCardDetailSummary(note, noteCards) {
  return {
  deckNames: ankiNoteDeckNames(noteCards),
  primaryCardId: ankiNotePrimaryCardId(note, noteCards),
  state: ankiNoteState(note, noteCards),
  ...ankiNoteReviewMetrics(noteCards)
  };
}
function ankiNoteState(note, noteCards) {
  if ((note.tags ?? []).includes(ANKI_NEVER_FORGET_TAG)) return "never-forget";
  return stateFromAnkiCards(noteCards);
}
function ankiNoteReviewMetrics(noteCards) {
  return {
  reps: sumAnkiCardMetric(noteCards, "reps"),
  lapses: sumAnkiCardMetric(noteCards, "lapses")
  };
}
function sumAnkiCardMetric(cards, metric) {
  return cards.reduce((sum, item) => sum + Number(item[metric] || 0), 0);
}
const ANKI_MEDIA_MIME_TYPES = {
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "jfif": "image/jpeg",
  "pjpeg": "image/jpeg",
  "pjp": "image/jpeg",
  "webp": "image/webp",
  "gif": "image/gif",
  "bmp": "image/bmp",
  "avif": "image/avif",
  "svg": "image/svg+xml",
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "ogg": "audio/ogg",
  "oga": "audio/ogg",
  "opus": "audio/ogg",
  "webm": "audio/webm",
  "m4a": "audio/mp4",
  "mp4": "audio/mp4",
  "aac": "audio/mp4",
  "flac": "audio/flac"
};
const ANKI_REVIEW_BUTTON_LABELS = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy"
};
const ANKI_GRADES_BY_BUTTON = {
  1: ["nothing", "fail"],
  2: ["something", "hard"],
  3: ["okay", "pass"],
  4: ["easy"]
};
const ANKI_STATUS_INDEX_STORAGE_KEY = "yomu:anki-status-index:v1";
const ANKI_STATUS_INDEX_VERSION = 1;
const ANKI_STATUS_INDEX_COUNT_CHECK_MS = 5 * 60 * 1e3;
const ANKI_STATUS_INDEX_FOCUS_REFRESH_MIN_MS = 2 * 60 * 1e3;
const ANKI_STATUS_INDEX_MAX_STALE_MS = 30 * 60 * 1e3;
const ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE = 500;
const ANKI_STATUS_INDEX_NOTE_CONCURRENCY = 3;
const ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY = "yomu:anki-status-index-rebuild:v1";
const ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS = 15 * 60 * 1e3;
const ANKI_STATUS_INDEX_DB_NAME = "yomu-anki-status-index";
const ANKI_STATUS_INDEX_DB_VERSION = 2;
const ANKI_STATUS_INDEX_META_STORE = "meta";
const ANKI_STATUS_INDEX_ENTRY_STORE = "entries";
const ANKI_STATUS_INDEX_EPOCH_RECORD_ID = "__yomu-managed-state-epoch__";
const ANKI_STATUS_INDEX_EPOCH_MARKER = {
  storeName: ANKI_STATUS_INDEX_META_STORE,
  key: ANKI_STATUS_INDEX_EPOCH_RECORD_ID
};
const ANKI_STATUS_INDEX_ENTRY_READ_CHUNK_SIZE = 500;
const ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE = 1e3;
const ANKI_STATUS_INDEX_KEY_PART_SEPARATOR = /[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u;
const ANKI_STATUS_INDEX_READING_KEY_PREFIX = "reading:";
const log$1 = Logger.scope("Anki");
function activeAnkiStatusIndexRebuildLease(settingsKey, now = Date.now()) {
  const lease = gmStorageGetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
  if (!isAnkiStatusIndexRebuildLease(lease)) return null;
  if (lease.expiresAt <= now) {
  gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
  return null;
  }
  if (settingsKey && lease.settingsKey !== settingsKey) return null;
  return lease;
}
function claimAnkiStatusIndexRebuildLease(settingsKey, now = Date.now()) {
  if (activeAnkiStatusIndexRebuildLease(void 0, now)) return null;
  const owner = createAnkiStatusIndexRebuildLeaseOwner();
  const lease = {
  owner,
  settingsKey,
  startedAt: now,
  expiresAt: now + ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS
  };
  gmStorageSetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, lease);
  return activeAnkiStatusIndexRebuildLease(void 0, now)?.owner === owner ? owner : null;
}
function touchAnkiStatusIndexRebuildLease(owner, settingsKey, now = Date.now()) {
  const lease = activeAnkiStatusIndexRebuildLease(void 0, now);
  if (!lease || lease.owner !== owner) return;
  gmStorageSetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, {
  ...lease,
  settingsKey,
  expiresAt: now + ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS
  });
}
function releaseAnkiStatusIndexRebuildLease(owner) {
  const lease = gmStorageGetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
  if (isAnkiStatusIndexRebuildLease(lease) && lease.owner === owner) {
  gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
  }
}
async function saveAnkiStatusIndex(index) {
  try {
  await saveAnkiStatusIndexToIndexedDb(index);
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(index));
  } catch (error) {
  log$1.warn("Anki status save fell back", error);
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, { ...index, entryStore: void 0 });
  }
}
async function saveAnkiStatusIndexCheckedAt(index) {
  if (index.entryStore !== "indexeddb") {
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, { ...index, entryStore: void 0 });
  return;
  }
  const meta = ankiStatusIndexMeta(index);
  try {
  await putStoredAnkiStatusIndexMeta(meta);
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
  } catch (error) {
  log$1.warn("Anki status metadata failed", error);
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
  }
}
async function saveAnkiStatusIndexDirtyMarker(index) {
  const dirty = { ...index, syncedAt: 0, checkedAt: 0, dirtyAt: index.dirtyAt ?? Date.now() };
  if (dirty.entryStore !== "indexeddb") {
  gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, { ...dirty, entryStore: void 0 });
  return;
  }
  const meta = ankiStatusIndexMeta(dirty);
  gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
  await putStoredAnkiStatusIndexMeta(meta);
}
async function loadAnkiStatusIndexFromIndexedDb() {
  if (!canUseIndexedDb()) return null;
  const db = await openAnkiStatusIndexDb();
  try {
  const meta = await idbRequest(
    db.transaction(ANKI_STATUS_INDEX_META_STORE, "readonly").objectStore(ANKI_STATUS_INDEX_META_STORE).get("current")
  );
  if (!meta) return null;
  return {
    version: meta.version,
    settingsKey: meta.settingsKey,
    syncedAt: meta.syncedAt,
    checkedAt: meta.checkedAt,
    cardCount: meta.cardCount,
    entryCount: meta.entryCount,
    entryStore: "indexeddb",
    entries: {},
    readingKeys: meta.readingKeys,
    dirtyAt: meta.dirtyAt
  };
  } finally {
  db.close();
  }
}
async function loadAnkiStatusIndexEntriesFromIndexedDb(keys) {
  if (!canUseIndexedDb()) return /* @__PURE__ */ new Map();
  const db = await openAnkiStatusIndexDb();
  try {
  const records = [];
  for (const chunk of chunkArray(unique(keys), ANKI_STATUS_INDEX_ENTRY_READ_CHUNK_SIZE)) {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, "readonly");
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    const chunkRecords = await Promise.all(chunk.map((key) => idbRequest(store.get(key)).then((record2) => [key, record2])));
    await idbTransactionDone(tx);
    records.push(...chunkRecords);
  }
  return new Map(records.filter((record2) => Boolean(record2[1])).map(([key, record2]) => [key, record2.entry]));
  } finally {
  db.close();
  }
}
async function saveAnkiStatusIndexToIndexedDb(index) {
  if (!canUseIndexedDb()) throw new Error("IndexedDB is unavailable.");
  const db = await openAnkiStatusIndexDb();
  try {
  await clearAnkiStatusIndexStores(db);
  const entries2 = Object.entries(index.entries).map(([key, entry]) => ({ key, entry }));
  for (const chunk of chunkArray(entries2, ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE)) {
    await putAnkiStatusIndexEntries(db, chunk);
  }
  await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(index));
  } finally {
  db.close();
  }
}
function ankiStatusIndexMeta(index) {
  return {
  id: "current",
  version: index.version,
  settingsKey: index.settingsKey,
  syncedAt: index.syncedAt,
  checkedAt: index.checkedAt,
  cardCount: index.cardCount,
  entryCount: index.entryCount ?? Object.keys(index.entries).length,
  entryStore: "indexeddb",
  entries: {},
  readingKeys: index.readingKeys,
  dirtyAt: index.dirtyAt
  };
}
async function clearAnkiStatusIndexStores(db) {
  await runAnkiStatusIndexWrite(db, [ANKI_STATUS_INDEX_META_STORE, ANKI_STATUS_INDEX_ENTRY_STORE], (tx) => {
  tx.objectStore(ANKI_STATUS_INDEX_META_STORE).delete("current");
  tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).clear();
  });
}
async function putAnkiStatusIndexMeta(db, meta) {
  await runAnkiStatusIndexWrite(db, ANKI_STATUS_INDEX_META_STORE, (tx) => {
  tx.objectStore(ANKI_STATUS_INDEX_META_STORE).put(meta);
  });
}
async function putBestAnkiStatusIndexEntries(db, entries2) {
  if (!entries2.length) return;
  await runAnkiStatusIndexWrite(db, ANKI_STATUS_INDEX_ENTRY_STORE, (tx) => {
  const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
  entries2.forEach((candidate) => {
    const request = store.get(candidate.key);
    request.onsuccess = () => {
      const current = request.result?.entry;
      if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate.entry)) store.put(candidate);
    };
  });
  });
}
function countAnkiStatusIndexEntries(db) {
  const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, "readonly");
  const done = idbTransactionDone(tx);
  const count = idbRequest(tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).count());
  return count.then(async (value) => {
  await done;
  return value;
  });
}
async function openAnkiStatusIndexDb() {
  const epoch = await assertManagedStateMutationAllowed();
  return new Promise((resolve, reject) => {
  const request = indexedDB.open(ANKI_STATUS_INDEX_DB_NAME, ANKI_STATUS_INDEX_DB_VERSION);
  request.onerror = () => reject(request.error ?? new Error("Could not open Anki status index database."));
  request.onblocked = () => reject(new Error("Anki status index database upgrade was blocked."));
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(ANKI_STATUS_INDEX_META_STORE)) {
      db.createObjectStore(ANKI_STATUS_INDEX_META_STORE, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains(ANKI_STATUS_INDEX_ENTRY_STORE)) {
      db.createObjectStore(ANKI_STATUS_INDEX_ENTRY_STORE, { keyPath: "key" });
    }
  };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => db.close();
    void reconcileAnkiStatusIndexEpoch(db, epoch).then(() => resolve(db)).catch((error) => {
      db.close();
      reject(error);
    });
  };
  });
}
function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}
function statusIndexEntriesForNotes(notes, cardData, settings, updatedAt) {
  const entries2 = /* @__PURE__ */ new Map();
  for (const note of notes) {
  const candidate = statusIndexEntryFromStatusData(note, cardData, updatedAt);
  for (const key of statusIndexKeysForNote(note, settings)) {
    const current = entries2.get(key);
    if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate)) entries2.set(key, candidate);
  }
  }
  return [...entries2].map(([key, entry]) => ({ key, entry }));
}
function statusIndexKeysForCard(card) {
  const keys = noteCardExpressionTargets(card).map(statusIndexKey);
  if (shouldUseStatusReadingKey(card)) keys.push(statusIndexReadingKey(card.reading || card.spelling));
  return unique(keys);
}
function statusIndexEntryForCard(index, card, entries2) {
  for (const key of statusIndexKeysForCard(card)) {
  const entry = entries2?.get(key) ?? index.entries[key];
  if (entry && isAnkiStatusIndexEntryFreshForIndex(index, entry)) return entry;
  }
  return null;
}
function statusIndexEntryFromStatusData(note, cardData, updatedAt) {
  const noteCards = cardData.cardsByNote.get(note.noteId) ?? [];
  const entry = noteCards.length ? ankiStatusIndexEntryFromInfo(note, noteCards) : statusIndexEntryFromStatusSets(note, cardData.sets);
  return updatedAt === void 0 ? entry : { ...entry, updatedAt };
}
function shouldReplaceAnkiStatusIndexEntry(current, candidate) {
  if (sameAnkiStatusIndexEntryIdentity(current, candidate)) {
  return ankiStatusIndexEntryUpdatedAt(candidate) >= ankiStatusIndexEntryUpdatedAt(current);
  }
  return ankiCardStateRank(candidate.state) < ankiCardStateRank(current.state);
}
function sameAnkiStatusIndexEntryIdentity(current, candidate) {
  return current.noteId === candidate.noteId || current.primaryCardId !== null && current.primaryCardId === candidate.primaryCardId;
}
function isAnkiStatusIndexEntryFreshForIndex(index, entry) {
  return !index.dirtyAt || ankiStatusIndexEntryUpdatedAt(entry) > index.dirtyAt;
}
function ankiStatusIndexEntryUpdatedAt(entry) {
  return Number(entry.updatedAt) || 0;
}
async function putAnkiStatusIndexEntries(db, entries2) {
  await runAnkiStatusIndexWrite(db, ANKI_STATUS_INDEX_ENTRY_STORE, (tx) => {
  const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
  entries2.forEach((entry) => store.put(entry));
  });
}
function reconcileAnkiStatusIndexEpoch(db, epoch) {
  return reconcileManagedStateIdbEpoch(db, epoch, {
  label: "Anki status index",
  markerStoreName: ANKI_STATUS_INDEX_META_STORE,
  markerKey: ANKI_STATUS_INDEX_EPOCH_RECORD_ID,
  markerKeyPath: "id",
  clearedStoreNames: [ANKI_STATUS_INDEX_ENTRY_STORE],
  deletedRecords: [{ storeName: ANKI_STATUS_INDEX_META_STORE, key: "current" }]
  });
}
function runAnkiStatusIndexWrite(db, storeNames, mutate) {
  return runManagedStateIdbWrite(db, ANKI_STATUS_INDEX_EPOCH_MARKER, storeNames, mutate);
}
async function putStoredAnkiStatusIndexMeta(meta) {
  if (!canUseIndexedDb()) throw new Error("IndexedDB is unavailable.");
  const db = await openAnkiStatusIndexDb();
  try {
  await putAnkiStatusIndexMeta(db, meta);
  } finally {
  db.close();
  }
}
function idbRequest(request) {
  return new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}
function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
  });
}
function isAnkiStatusIndexRebuildLease(value) {
  if (!value || typeof value !== "object") return false;
  const lease = value;
  return typeof lease.owner === "string" && typeof lease.settingsKey === "string" && typeof lease.startedAt === "number" && typeof lease.expiresAt === "number";
}
function createAnkiStatusIndexRebuildLeaseOwner() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function statusIndexKey(value) {
  return normalizeFieldValue(value).toLocaleLowerCase();
}
function statusIndexReadingKey(value) {
  return `${ANKI_STATUS_INDEX_READING_KEY_PREFIX}${statusIndexKey(value)}`;
}
function statusIndexKeysForNote(note, settings) {
  const fields = flattenNoteFields(note.fields);
  const mapping = ankiFieldMappingForModel(settings, note.modelName, Object.keys(fields));
  const keys = /* @__PURE__ */ new Set();
  addStatusIndexKeys(keys, statusIndexFieldValues(fields, mapping), statusIndexKey, 2);
  addStatusIndexKeys(keys, statusIndexReadingFieldValues(fields, mapping), statusIndexReadingKey, ANKI_STATUS_INDEX_READING_KEY_PREFIX.length + 2);
  return [...keys].filter(Boolean);
}
function addStatusIndexKeys(keys, values, keyForValue, minPartKeyLength) {
  for (const value of values) {
  if (value.length <= 80) keys.add(keyForValue(value));
  value.split(ANKI_STATUS_INDEX_KEY_PART_SEPARATOR).map(keyForValue).filter((key) => key.length >= minPartKeyLength).forEach((key) => keys.add(key));
  }
}
function statusIndexFieldValues(fields, mapping) {
  const expression = firstNoteExpressionValue(fields, mapping);
  const reading = mappedNoteField(fields, mapping, "reading") || firstNoteReading(fields);
  const preferred = (expression ? [expression] : [reading]).map(normalizeFieldValue).filter(Boolean);
  if (preferred.length) return unique(preferred);
  return noteFieldValues(fields).filter((value) => value.length <= 80 && /[\u3040-\u30ff\u3400-\u9fff]/.test(value));
}
function statusIndexReadingFieldValues(fields, mapping) {
  return unique([
  mappedNoteField(fields, mapping, "reading"),
  firstNoteReading(fields)
  ].map(normalizeFieldValue).filter((value) => value.length >= 2));
}
function shouldUseStatusReadingKey(card) {
  const reading = normalizeFieldValue(card.reading || "");
  const spelling = normalizeFieldValue(card.spelling || "");
  const spellingIsKana = isKanaStatusLookupSurface(spelling);
  const readingTarget = reading || (spellingIsKana ? spelling : "");
  if (readingTarget.length < 2 || spelling.length < 2) return false;
  return spelling === readingTarget || spellingIsKana;
}
function statusIndexEntryFromStatusSets(note, cardSets) {
  const cardIds = (note.cards ?? []).map(Number).filter(Number.isFinite);
  const primaryCardId = pickPrimaryCardIdFromStatusSets(cardIds, cardSets);
  const state = stateFromStatusIndexCardIds(cardIds, cardSets);
  return {
  noteId: note.noteId,
  modelName: note.modelName,
  deckNames: [],
  primaryCardId,
  state,
  reps: 0,
  lapses: 0
  };
}
function stateFromStatusIndexCardIds(cardIds, cardSets) {
  if (!cardIds.length) return "known";
  if (cardIds.some((cardId) => cardSets.due.has(cardId))) return "due";
  if (cardIds.some((cardId) => cardSets.learning.has(cardId))) return "learning";
  if (cardIds.some((cardId) => cardSets.new.has(cardId))) return "new";
  if (cardIds.every((cardId) => cardSets.suspended.has(cardId))) return "suspended";
  return "known";
}
function pickPrimaryCardIdFromStatusSets(cardIds, cardSets) {
  const orderedSets = [cardSets.due, cardSets.learning, cardSets.new, cardSets.all, cardSets.suspended];
  for (const set of orderedSets) {
  const match = cardIds.find((cardId) => set.has(cardId));
  if (match !== void 0) return match;
  }
  return cardIds[0] ?? null;
}
const ANKI_SEARCH_SPECIALS_RE = /([\\"*_])/g;
function escapeAnkiSearchText(term) {
  return term.replace(ANKI_SEARCH_SPECIALS_RE, "\\$1");
}
function quoteAnkiSearch(term) {
  return `"${escapeAnkiSearchText(term)}"`;
}
const ANKI_MOBILE_FALLBACK_DECK = "Default";
const YOMU_DEFAULT_DECK_NAMES = /* @__PURE__ */ new Set(["よむ", "yomu"]);
function userAgent() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}
function isAndroidUserAgent() {
  return /Android/i.test(userAgent());
}
function isMobileAnkiHandoffEnvironment() {
  return isAppleTouchBrowser() || isAndroidUserAgent() && /Chrome|Firefox|EdgA/i.test(userAgent());
}
function canUseMobileAnkiHandoff$1(settings) {
  return settings.ankiEnabled && settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}
function mobileAnkiHandoffAppName$1() {
  return isAndroidUserAgent() ? "AnkiDroid" : "AnkiMobile";
}
function mobileAnkiHandoffTarget(note) {
  if (isAndroidUserAgent()) return { appName: "AnkiDroid", url: androidAnkiDroidIntentUrl(note) };
  return { appName: "AnkiMobile", url: iosAnkiMobileUrl(note) };
}
function openMobileAnkiHandoff(note) {
  const handoff = mobileAnkiHandoffTarget(note);
  if (!window.confirm(mobileAnkiHandoffPrompt(note, handoff.appName))) return false;
  location.href = handoff.url;
  return true;
}
function mobileAnkiHandoffPrompt(note, appName) {
  const title = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || "this note");
  return `Open ${appName} to add "${title}"? This creates a new note only.`;
}
function iosAnkiMobileUrl(note) {
  const params = [];
  const add = (key, value) => params.push(`${key}=${encodeURIComponent(value)}`);
  add("type", note.modelName);
  add("deck", iosAnkiMobileDeckName(note.deckName));
  if (note.tags?.length) add("tags", note.tags.join(" "));
  Object.entries(iosAnkiMobileFields(note)).forEach(([field, value]) => {
  const handoffValue = iosAnkiMobileFieldValue(field, value);
  if (handoffValue !== null) add(`fld${field}`, handoffValue);
  });
  return `anki://x-callback-url/addnote?${params.join("&")}`;
}
function iosAnkiMobileDeckName(deckName) {
  const trimmed = deckName.trim();
  return YOMU_DEFAULT_DECK_NAMES.has(trimmed.toLowerCase()) ? ANKI_MOBILE_FALLBACK_DECK : trimmed || ANKI_MOBILE_FALLBACK_DECK;
}
function iosAnkiMobileFields(note) {
  const fields = { ...note.fields };
  const audioUrl = firstRemoteMediaUrl(note.audio);
  const audioField = firstMediaFieldName(note.audio) || "Audio";
  if (audioUrl && !(fields[audioField] ?? "").trim()) fields[audioField] = audioUrl;
  return fields;
}
function firstRemoteMediaUrl(files) {
  return files?.map((file) => file.url ?? "").find(isRemoteMediaUrl) ?? "";
}
function firstMediaFieldName(files) {
  return files?.flatMap((file) => file.fields ?? []).map((field) => field.trim()).find(Boolean) ?? "";
}
function isRemoteMediaUrl(value) {
  return /^https?:\/\//i.test(value) && /\.(?:aac|flac|gif|jpe?g|m4a|mp3|mp4|oga|ogg|opus|png|svg|webm|webp|wav)(?:[?#].*)?$/i.test(value);
}
function iosAnkiMobileFieldValue(field, value) {
  if (field !== "Image") return value;
  const trimmed = value.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return null;
  return trimmed;
}
function androidAnkiDroidIntentUrl(note) {
  const front = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || "");
  const back = stripForMobileHandoff([
  note.fields.Reading,
  note.fields.Meaning,
  note.fields.DictionaryDefinitions,
  note.fields.Source
  ].filter(Boolean).join("\n\n"));
  return [
  "intent:#Intent",
  "action=android.intent.action.SEND",
  "type=text/plain",
  "package=com.ichi2.anki",
  `S.android.intent.extra.SUBJECT=${encodeURIComponent(front)}`,
  `S.android.intent.extra.TEXT=${encodeURIComponent(back)}`,
  `S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=com.ichi2.anki")}`,
  "end"
  ].join(";");
}
function stripForMobileHandoff(value) {
  return stripHtml$1(value).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const YOMU_RECOGNITION_TEMPLATE_NAME = "Recognition";
const YOMU_CONTEXT_TEMPLATE_NAME = "Context";
function yomuCardTemplates(settings) {
  const language = settings.interfaceLanguage;
  const recognitionFront = `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    ${settings.ankiFrontReading ? '{{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}' : ""}
    ${settings.ankiFrontSentence ? '{{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}' : ""}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ""}
</main>`;
  const contextFront = `
<main class="yomu-card yomu-front">
    {{#Sentence}}<div class="yomu-sentence yomu-sentence-front">{{Sentence}}</div>{{/Sentence}}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ""}
    <div class="yomu-prompt">${escapeHtml$1(uiText(language, "ankiPromptRecallWord"))}</div>
</main>`;
  const back = `
{{FrontSide}}
<main class="yomu-card yomu-back">
    <section class="yomu-section yomu-answer">
        <div class="yomu-expression">{{Expression}}</div>
        {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
        {{#Audio}}<div class="yomu-audio">{{Audio}}</div>{{/Audio}}
    </section>
    {{#Meaning}}<section class="yomu-section"><h2>${escapeHtml$1(uiText(language, "ankiMeaningHeading"))}</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>${escapeHtml$1(uiText(language, "dictionaries"))}</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>${escapeHtml$1(uiText(language, "kanji"))}</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>${escapeHtml$1(uiText(language, "factFrequency"))}</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>${escapeHtml$1(uiText(language, "ankiPitchHeading"))}</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>${escapeHtml$1(uiText(language, "ankiPartOfSpeechHeading"))}</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#JPDB}}<div><strong>${escapeHtml$1(uiText(language, "ankiLinksHeading"))}</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>${escapeHtml$1(uiText(language, "ankiSourceHeading"))}</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`;
  const templateName = settings.ankiTemplateMode === "context" ? YOMU_CONTEXT_TEMPLATE_NAME : YOMU_RECOGNITION_TEMPLATE_NAME;
  return {
  [templateName]: {
    Front: settings.ankiTemplateMode === "context" ? contextFront : recognitionFront,
    Back: back
  }
  };
}
function yomuCardCss() {
  const color = ANKI_CARD_COLOR_TOKENS;
  return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: ${color.text};
    background: ${color.background};
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: ${color.muted}; font-size: 24px; }
.yomu-prompt { margin-top: 14px; color: ${color.muted}; font-size: 16px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid ${color.sentenceBorder};
    border-radius: 12px;
    background: ${color.sentenceBackground};
    color: ${color.sentenceText};
}
.yomu-highlight { color: ${color.highlight}; font-weight: 800; }
.yomu-sentence-front { font-size: 28px; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid ${color.sectionBorder};
    border-radius: 12px;
    background: ${color.sectionBackground};
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: ${color.headingText};
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: ${color.labelText};
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: ${color.expressionText}; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: ${color.readingText}; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid ${color.chipBorder};
    border-radius: 999px;
    color: ${color.chipText};
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: ${color.metaLabelText}; }
a { color: ${color.highlight}; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid ${color.tableBorder}; padding: 4px 6px; }
`;
}
const ANKI_VERSION = 6;
const ANKI_FIELD_TARGET_PLAN_TTL_MS = 5 * 60 * 1e3;
const ANKI_STATUS_LOOKUP_TERM_CHUNK_SIZE = 50;
const ANKI_STATUS_LOOKUP_CHUNK_CONCURRENCY = 3;
const ANKI_CONNECT_REQUEST_TIMEOUT_MS = 5e3;
const ANKI_BACKGROUND_REQUEST_TIMEOUT_MS = 1500;
const ANKI_BACKGROUND_AVAILABILITY_TTL_MS = 15e3;
const ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS = 6e4;
const ANKI_STATUS_INDEX_BACKGROUND_REFRESH_DELAY_MS = 2500;
const ANKI_MODEL_SCAN_SAMPLE_NOTE_LIMIT = 24;
const ANKI_MODEL_SCAN_CONCURRENCY = 3;
const ANKI_STATUS_INDEX_CARD_CHUNK_SIZE = 500;
const ANKI_EDITED_SWEEP_MAX_DAYS = 30;
const ANKI_EDITED_SWEEP_MOD_LIMIT = 2e3;
const ANKI_EDITED_SWEEP_DAY_MS = 24 * 60 * 60 * 1e3;
const ANKI_STATUS_INDEX_CARD_CONCURRENCY = 3;
const ANKI_RENDERED_MEDIA_LIMIT = 12;
const ANKI_MEDIA_DATA_URL_CACHE_LIMIT = 64;
const ANKI_RENDERED_MEDIA_CONCURRENCY = 3;
const log = Logger.scope("Anki");
const ANKI_EASE_BY_GRADE = {
  nothing: 1,
  fail: 1,
  something: 2,
  hard: 2,
  okay: 3,
  pass: 3,
  easy: 4
};
function ankiLookupWithUnavailableDetails(lookup) {
  const mark = (note) => ankiNoteHasRenderableDetails(note) ? note : { ...note, detailsUnavailable: true };
  const notes = lookup.notes.map(mark);
  const primary = lookup.primary ? mark(lookup.primary) : null;
  return { ...lookup, notes, primary };
}
class AnkiDuplicateNoteError extends Error {
  constructor(message) {
  super(message);
  this.name = "AnkiDuplicateNoteError";
  }
}
function isAnkiDuplicateNoteError(error) {
  return error instanceof AnkiDuplicateNoteError;
}
class AnkiConnectClient {
  constructor(getSettings) {
  this.getSettings = getSettings;
  this.installFocusStatusRefresh();
  }
  lookupCache = /* @__PURE__ */ new Map();
  // Media manifest cache (P1): base64 payloads from retrieveMediaFile are
  // expensive; repeat plays/hydrations reuse the same data URL by sanitized
  // filename. Failures are evicted so a transient error can retry.
  mediaDataUrlCache = /* @__PURE__ */ new Map();
  statusLookupCache = /* @__PURE__ */ new Map();
  lookupInflight = /* @__PURE__ */ new Map();
  statusIndex;
  statusIndexLoad;
  statusIndexRefresh;
  statusIndexRefreshQueued = false;
  availabilityProbe;
  availabilityCheckedAt = 0;
  unavailableUntil = 0;
  fieldTargetPlanCache;
  isDestroyed = false;
  focusStatusRefreshListener;
  lastFocusStatusRefreshAt = 0;
  // Companion lifecycle API consumed by page and newtab runtimes through the structural Anki client.
  // fallow-ignore-next-line unused-class-member
  destroy() {
  this.isDestroyed = true;
  this.lookupInflight.clear();
  this.statusIndexLoad = void 0;
  this.statusIndexRefresh = void 0;
  this.statusIndexRefreshQueued = false;
  this.availabilityProbe = void 0;
  if (this.focusStatusRefreshListener) {
    window.removeEventListener("focus", this.focusStatusRefreshListener);
    document.removeEventListener("visibilitychange", this.focusStatusRefreshListener);
    this.focusStatusRefreshListener = void 0;
  }
  }
  // The status index is validated by deck card COUNT, which misses reviews
  // done in Anki itself (state changes, same count). Returning to the tab
  // after being away is exactly when that happens, so expire the index then.
  installFocusStatusRefresh() {
  if (typeof window === "undefined") return;
  this.focusStatusRefreshListener = () => {
    if (this.isDestroyed || document.visibilityState === "hidden") return;
    const awayMs = Date.now() - this.lastFocusStatusRefreshAt;
    if (awayMs < ANKI_STATUS_INDEX_FOCUS_REFRESH_MIN_MS) return;
    this.lastFocusStatusRefreshAt = Date.now();
    const index = this.validStatusIndex(this.statusIndex);
    if (!index) return;
    this.statusIndex = { ...index, syncedAt: 0, checkedAt: 0, dirtyAt: Date.now() };
    this.queueStatusIndexRefresh();
  };
  window.addEventListener("focus", this.focusStatusRefreshListener);
  document.addEventListener("visibilitychange", this.focusStatusRefreshListener);
  }
  // Used by settings connection checks through the Anki client dependency.
  // fallow-ignore-next-line unused-class-member
  async isConnected() {
  try {
    await this.invoke("version");
    this.markAvailable();
    return true;
  } catch (error) {
    log.warnOnce("connection-unavailable", "AnkiConnect unavailable", error);
    return false;
  }
  }
  async isAvailableForBackground() {
  if (this.isDestroyed) return false;
  if (this.isLookupCoolingDown()) return false;
  const now = Date.now();
  if (now - this.availabilityCheckedAt < ANKI_BACKGROUND_AVAILABILITY_TTL_MS) return true;
  if (this.availabilityProbe) return this.availabilityProbe;
  this.availabilityProbe = this.invokeWithTimeout("version", {}, ANKI_BACKGROUND_REQUEST_TIMEOUT_MS).then(() => {
    if (this.isDestroyed) return false;
    this.markAvailable();
    return true;
  }).catch((error) => {
    log.warnOnce("background-availability-unavailable", "AnkiConnect unavailable for background work", error);
    this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
    return false;
  }).finally(() => {
    this.availabilityProbe = void 0;
  });
  return this.availabilityProbe;
  }
  async deckNames() {
  const decks = await this.invoke("deckNames");
  return decks;
  }
  async modelNames() {
  const models = await this.invoke("modelNames");
  return models;
  }
  // Mirrors prepareAnkiNoteForConnect's decision so card previews can show
  // exactly which fields a mining write will target instead of silently
  // retargeting into an existing non-Yomu model at write time.
  // Public preview helper used by card render data through the Anki dependency.
  // fallow-ignore-next-line unused-class-member
  async noteFieldTargetPlan() {
  const settings = this.getSettings();
  if (!settings.ankiEnabled) return null;
  if (canUseMobileAnkiHandoff$1(settings) && !hasUserscriptAnkiBridge()) return null;
  const modelName = resolvedAnkiModelName(settings);
  const key = `${settings.ankiConnectUrl}|${modelName}`;
  const now = Date.now();
  if (this.fieldTargetPlanCache?.key === key && this.fieldTargetPlanCache.expiresAt > now) return this.fieldTargetPlanCache.promise;
  const promise = this.loadNoteFieldTargetPlan(modelName, settings).catch(() => null);
  this.fieldTargetPlanCache = { key, expiresAt: now + ANKI_FIELD_TARGET_PLAN_TTL_MS, promise };
  return promise;
  }
  async loadNoteFieldTargetPlan(modelName, settings) {
  const modelNames = await this.modelNames();
  if (!modelNames.includes(modelName)) return { modelName, yomuManaged: true, fieldNames: [] };
  const fieldNames = await this.invokeOrDefault("modelFieldNames", { modelName }, []);
  return { modelName, yomuManaged: shouldTreatExistingModelAsYomuManaged(modelName, settings, fieldNames), fieldNames };
  }
  // Used by settings library scan through the Anki client dependency.
  // fallow-ignore-next-line unused-class-member
  async scanLibrary() {
  const [deckNames, modelNames] = await Promise.all([
    this.deckNames().catch(() => []),
    this.modelNames().catch(() => [])
  ]);
  const models = [];
  await runLimited(modelNames, ANKI_MODEL_SCAN_CONCURRENCY, async (modelName) => {
    const [fields, sampleNotes] = await Promise.all([
      this.invokeOrDefault("modelFieldNames", { modelName }, []),
      this.sampleModelNotes(modelName)
    ]);
    models.push(scanAnkiModelFields(modelName, fields, sampleNotes));
  });
  const sortedModels = [...models].sort((a, b) => b.score - a.score || a.modelName.localeCompare(b.modelName));
  return {
    deckNames,
    models: sortedModels,
    suggestedModel: sortedModels[0] ?? null
  };
  }
  async sampleModelNotes(modelName) {
  const noteIds = await this.invokeOrDefault("findNotes", { query: `note:${quoteAnkiSearch(modelName)}` }, []);
  const sampleIds = Array.isArray(noteIds) ? unique(noteIds.map(Number).filter(Number.isFinite)).slice(0, ANKI_MODEL_SCAN_SAMPLE_NOTE_LIMIT) : [];
  if (!sampleIds.length) return [];
  return await this.invokeOrDefault("notesInfo", { notes: sampleIds }, []);
  }
  // Public warm-up hook used by app, newtab, and card preload flows through the Anki dependency.
  // fallow-ignore-next-line unused-class-member
  warmStatusIndex() {
  if (this.isDestroyed) return Promise.resolve(null);
  return this.refreshStatusIndexIfNeeded({ rebuildIfMissing: true }) ?? this.loadStatusIndex();
  }
  // Public card status lookup used by popup, page, and newtab render paths through the Anki dependency.
  // fallow-ignore-next-line unused-class-member
  async findExistingCards(card) {
  return (await this.findExistingCardsBatch([card]))[0] ?? emptyAnkiLookupResult();
  }
  // Public batched status lookup used by popup, page, and newtab enrichment through the Anki dependency.
  // fallow-ignore-next-line unused-class-member
  async findCachedStatusBatch(cards) {
  const empty = emptyAnkiLookupResult();
  const untrustedEmpty = untrustedAnkiLookupResult();
  if (!cards.length) return [];
  if (!this.canUseCachedStatusLookup()) return cards.map(() => untrustedEmpty);
  const results = cards.map(() => untrustedEmpty);
  const pending = this.collectPendingLookupGroups(cards, results, (cacheKey) => this.readStatusLookupCache(cacheKey));
  if (!pending.length) return results;
  const context = await this.cachedStatusLookupContext(pending);
  if (this.isDestroyed) return cards.map(() => untrustedEmpty);
  const unresolved = this.applyCachedStatusLookupPlan(
    pending,
    results,
    context.statusIndex,
    context.statusEntries,
    context.canUseStatusIndexHits,
    context.canTrustStatusMiss,
    empty
  );
  await this.resolveUncachedStatusLookups(unresolved, results, empty);
  return results;
  }
  canUseCachedStatusLookup() {
  if (this.isDestroyed) return false;
  if (!this.getSettings().ankiEnabled) return false;
  return !this.isLookupCoolingDown();
  }
  queueStatusIndexRefreshForLookup(statusIndex) {
  if (!statusIndex || this.statusIndexNeedsCountCheck(statusIndex) || this.statusIndexIsTooStale(statusIndex)) {
    this.queueStatusIndexRefresh({ rebuildIfMissing: false });
  }
  }
  async cachedStatusLookupContext(pending) {
  const statusIndex = await this.loadStatusIndex();
  if (statusIndex) this.queueStatusIndexRefreshForLookup(statusIndex);
  const statusEntries = await this.loadStatusEntriesForCards(statusIndex, pending.map((item) => item.card));
  const canUseStatusIndexHits = this.canUseStatusIndexHits(statusIndex);
  const hasActiveRebuildLease = this.hasActiveStatusIndexRebuildLease(statusIndex);
  return {
    statusIndex,
    statusEntries,
    canUseStatusIndexHits,
    hasActiveRebuildLease,
    canTrustStatusMiss: this.canTrustStatusIndexMiss(statusIndex, {
      canUseStatusIndexHits,
      hasActiveRebuildLease,
      statusEntries
    })
  };
  }
  canUseStatusIndexHits(statusIndex) {
  return Boolean(statusIndex && this.statusIndexHasEntries(statusIndex));
  }
  hasActiveStatusIndexRebuildLease(statusIndex) {
  return Boolean(activeAnkiStatusIndexRebuildLease(statusIndex?.settingsKey));
  }
  canTrustStatusIndexMiss(statusIndex, context) {
  if (!statusIndex) return false;
  if (!context.canUseStatusIndexHits || context.hasActiveRebuildLease) return false;
  if (!this.isStatusIndexFreshForMissTrust(statusIndex)) return false;
  if (this.hasPendingStatusIndexRefresh()) return false;
  if (this.statusIndexNeedsCountCheck(statusIndex)) return false;
  if (this.statusIndexIsTooStale(statusIndex)) return false;
  return this.hasStatusIndexMissCoverage(statusIndex, context.statusEntries);
  }
  isStatusIndexFreshForMissTrust(statusIndex) {
  return statusIndex.syncedAt > 0 && !this.statusIndexIsDirty(statusIndex);
  }
  hasPendingStatusIndexRefresh() {
  return Boolean(this.statusIndexRefresh || this.statusIndexRefreshQueued);
  }
  hasStatusIndexMissCoverage(statusIndex, statusEntries) {
  return statusIndex.entryStore !== "indexeddb" || Boolean(statusEntries);
  }
  applyCachedStatusLookupPlan(pending, results, statusIndex, statusEntries, canUseStatusIndexHits, canTrustStatusMiss, empty) {
  const unresolved = [];
  for (const group of pending) {
    const indexed = canUseStatusIndexHits ? this.lookupStatusIndex(statusIndex, group.card, statusEntries) : null;
    if (indexed) {
      this.writeStatusLookupCache(group.cacheKey, indexed);
      this.applyLookupGroupResult(results, group.indexes, indexed);
      continue;
    }
    if (!canTrustStatusMiss) {
      unresolved.push(group);
      continue;
    }
    this.writeStatusLookupCache(group.cacheKey, empty);
    this.applyLookupGroupResult(results, group.indexes, empty);
  }
  return unresolved;
  }
  async resolveUncachedStatusLookups(unresolved, results, empty) {
  if (!unresolved.length) return;
  this.queueStatusIndexRefresh();
  try {
    const resolved = await this.findExistingCardsBatchUncachedWithInflight(unresolved, empty);
    for (const group of unresolved) {
      const result = resolved.get(group.cacheKey) ?? empty;
      this.writeStatusLookupCache(group.cacheKey, result);
      this.applyLookupGroupResult(results, group.indexes, result);
    }
  } catch (error) {
    log.warn("Exact Anki status lookup failed", error);
  }
  }
  collectPendingLookupGroups(cards, results, readCache) {
  const pendingByCacheKey = /* @__PURE__ */ new Map();
  cards.forEach((card, index) => {
    const cacheKey = this.lookupCacheKey(card);
    const cached = readCache(cacheKey);
    if (cached) {
      results[index] = cached;
      return;
    }
    let pending = pendingByCacheKey.get(cacheKey);
    if (!pending) {
      pending = { card, indexes: [], cacheKey };
      pendingByCacheKey.set(cacheKey, pending);
    }
    pending.indexes.push(index);
  });
  return [...pendingByCacheKey.values()];
  }
  async findExistingCardsBatch(cards) {
  const empty = emptyAnkiLookupResult();
  if (!cards.length) return [];
  if (this.isDestroyed) return cards.map(() => empty);
  const results = cards.map(() => empty);
  const pending = this.collectPendingLookupGroups(cards, results, (cacheKey) => this.readLookupCache(cacheKey));
  if (!pending.length) return results;
  const batches = this.pendingLookupBatches(pending);
  try {
    const done = log.time("findExistingCardsBatch", { terms: pending.length, inFlight: batches.inFlight.length });
    if (batches.inFlight.length) await this.applyInFlightLookupResults(batches.inFlight, results);
    if (this.isDestroyed) return results;
    const resolved = await this.resolveUncachedLookupBatches(batches.uncached, empty);
    if (this.isDestroyed) return results;
    this.applyResolvedLookupResults(resolved, batches.pendingByCacheKey, results);
    done();
    return results;
  } catch (error) {
    log.warn("Anki batch lookup failed", { terms: pending.length }, error);
    this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
    return results;
  }
  }
  pendingLookupBatches(pending) {
  const inFlight = [];
  const uncached = [];
  const pendingByCacheKey = new Map(pending.map((group) => [group.cacheKey, group]));
  for (const group of pending) {
    const promise = this.lookupInflight.get(group.cacheKey);
    if (promise) inFlight.push([group, promise]);
    else uncached.push(group);
  }
  return { inFlight, uncached, pendingByCacheKey };
  }
  async applyInFlightLookupResults(inFlight, results) {
  await Promise.all(inFlight.map(async ([group, promise]) => {
    const result = await promise;
    if (this.isDestroyed) return;
    this.writeLookupCache(group.cacheKey, result);
    this.applyLookupGroupResult(results, group.indexes, result);
  }));
  }
  async resolveUncachedLookupBatches(uncached, empty) {
  return uncached.length ? await this.findExistingCardsBatchUncachedWithInflight(uncached, empty) : /* @__PURE__ */ new Map();
  }
  applyResolvedLookupResults(resolved, pendingByCacheKey, results) {
  for (const [cacheKey, result] of resolved) {
    this.writeLookupCache(cacheKey, result);
    const indexes = pendingByCacheKey.get(cacheKey)?.indexes;
    if (indexes) this.applyLookupGroupResult(results, indexes, result);
  }
  }
  lookupCacheKey(card) {
  return lookupKeyTermsForCard(card).join("|");
  }
  applyLookupGroupResult(results, indexes, result) {
  indexes.forEach((index) => {
    results[index] = result;
  });
  }
  statusIndexSettingsKey(settings = this.getSettings()) {
  const fieldMappings = ankiFieldMappingsSettingsKey(settings.ankiFieldMappings);
  return JSON.stringify({
    url: settings.ankiConnectUrl || "http://127.0.0.1:8765",
    ...Object.keys(fieldMappings).length ? { fieldMappings } : {}
  });
  }
  loadStatusIndex() {
  if (this.statusIndex !== void 0) return Promise.resolve(this.validStatusIndex(this.statusIndex));
  const syncIndex = this.validStatusIndex(gmStorageGetSync(ANKI_STATUS_INDEX_STORAGE_KEY, null));
  if (syncIndex && syncIndex.entryStore !== "indexeddb") {
    this.statusIndex = syncIndex;
    return Promise.resolve(syncIndex);
  }
  if (!this.statusIndexLoad) {
    this.statusIndexLoad = this.loadStoredStatusIndex().then((index) => {
      this.statusIndex = index;
      return this.statusIndex;
    }).finally(() => {
      this.statusIndexLoad = void 0;
    });
  }
  return this.statusIndexLoad;
  }
  async loadStoredStatusIndex() {
  const indexed = await loadAnkiStatusIndexFromIndexedDb().catch((error) => {
    log.warn("Anki status load failed", error);
    return null;
  });
  const validIndexed = this.validStatusIndex(indexed);
  if (validIndexed) return validIndexed;
  const stored = await gmStorageGet(ANKI_STATUS_INDEX_STORAGE_KEY, null);
  const validStored = this.validStatusIndex(stored);
  return validStored?.entryStore === "indexeddb" ? null : validStored;
  }
  validStatusIndex(index) {
  if (!index || index.version !== ANKI_STATUS_INDEX_VERSION) return null;
  return index.settingsKey === this.statusIndexSettingsKey() ? index : null;
  }
  async loadStatusEntriesForCards(index, cards) {
  if (!index) return null;
  if (index.entryStore !== "indexeddb") return null;
  const keys = unique(cards.flatMap(statusIndexKeysForCard));
  if (!keys.length) return /* @__PURE__ */ new Map();
  return loadAnkiStatusIndexEntriesFromIndexedDb(keys).catch((error) => {
    log.warn("Anki status entry failed", error);
    return null;
  });
  }
  lookupStatusIndex(index, card, entries2) {
  const entry = index ? statusIndexEntryForCard(index, card, entries2) : null;
  if (!entry) return null;
  if (index?.dirtyAt && (!entry.updatedAt || entry.updatedAt < index.dirtyAt)) return null;
  const note = {
    noteId: entry.noteId,
    modelName: entry.modelName,
    deckNames: entry.deckNames,
    cardIds: entry.primaryCardId ? [entry.primaryCardId] : [],
    primaryCardId: entry.primaryCardId,
    state: entry.state,
    fields: {},
    tags: [],
    reps: entry.reps,
    lapses: entry.lapses
  };
  return {
    state: entry.state,
    notes: [note],
    primary: note
  };
  }
  statusIndexHasEntries(index) {
  return index.cardCount === 0 || (index.entryCount ?? Object.keys(index.entries).length) > 0;
  }
  refreshStatusIndexIfNeeded(options = {}) {
  if (this.isDestroyed || this.isLookupCoolingDown()) return null;
  if (this.statusIndexRefresh) return this.statusIndexRefresh;
  this.statusIndexRefresh = this.runStatusIndexRefresh(options).catch((error) => {
    log.warn("Anki status index refresh failed", error);
    return null;
  }).finally(() => {
    this.statusIndexRefresh = void 0;
  });
  return this.statusIndexRefresh;
  }
  async runStatusIndexRefresh(options) {
  const index = await this.loadStatusIndex();
  if (this.isDestroyed) return null;
  const now = Date.now();
  const needsReadingKeyRefresh = this.statusIndexNeedsReadingKeyRefresh(index);
  if (this.canReuseRecentlyCheckedStatusIndex(index, needsReadingKeyRefresh, now)) return index;
  if (this.shouldSkipMissingStatusIndexRebuild(index, options)) return null;
  if (!await this.isAvailableForBackground()) return index;
  if (this.isDestroyed) return null;
  const countCheck = await this.refreshStatusIndexFromCollectionCount(index, needsReadingKeyRefresh, now, options);
  if (countCheck.handled) return countCheck.index;
  return this.rebuildStatusIndexWithLease(index, needsReadingKeyRefresh);
  }
  statusIndexNeedsReadingKeyRefresh(index) {
  return Boolean(index && !index.readingKeys);
  }
  statusIndexIsDirty(index) {
  const dirtyAt = Number(index.dirtyAt) || 0;
  return dirtyAt > 0 && index.syncedAt <= dirtyAt;
  }
  canReuseRecentlyCheckedStatusIndex(index, needsReadingKeyRefresh, now) {
  return Boolean(index && !needsReadingKeyRefresh && !this.statusIndexIsDirty(index) && index.syncedAt > 0 && now - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS && now - index.checkedAt < ANKI_STATUS_INDEX_COUNT_CHECK_MS);
  }
  shouldSkipMissingStatusIndexRebuild(index, options) {
  return !index && !options.rebuildIfMissing;
  }
  async refreshStatusIndexFromCollectionCount(index, needsReadingKeyRefresh, now, options) {
  if (!index) return { handled: false, index: null };
  const deckStatsCardCount = await this.collectionCardCountFromDeckStats();
  if (this.isDestroyed) return { handled: true, index: null };
  if (this.canMarkStatusIndexCountCurrent(index, deckStatsCardCount, needsReadingKeyRefresh, now)) {
    const edited = await this.statusIndexEditedSinceSync(index, now);
    if (this.isDestroyed) return { handled: true, index: null };
    if (!edited) {
      return { handled: true, index: await this.saveCheckedStatusIndex(index, now) };
    }
    const dirty = { ...index, syncedAt: 0, checkedAt: 0, dirtyAt: now };
    this.statusIndex = dirty;
    await saveAnkiStatusIndexDirtyMarker(dirty).catch((error) => {
      log.warn("Anki edited-sweep dirty marker failed", error);
    });
    return { handled: false, index: dirty };
  }
  if (this.canDeferStatusIndexRebuild(index, needsReadingKeyRefresh, options)) {
    return { handled: true, index: await this.saveCheckedStatusIndex(index, now, deckStatsCardCount) };
  }
  return { handled: false, index };
  }
  async statusIndexEditedSinceSync(index, now) {
  const sinceMs = index.syncedAt;
  if (!(sinceMs > 0)) return false;
  const days = Math.min(ANKI_EDITED_SWEEP_MAX_DAYS, Math.max(1, Math.ceil((now - sinceMs) / ANKI_EDITED_SWEEP_DAY_MS) + 1));
  try {
    const ids = await this.invoke("findCards", { query: `edited:${days}` });
    if (this.isDestroyed || !ids.length) return false;
    const mods = await this.invoke("cardsModTime", { cards: ids.slice(0, ANKI_EDITED_SWEEP_MOD_LIMIT) });
    const sinceSeconds = Math.floor(sinceMs / 1e3);
    return mods.some((entry) => Number(entry?.mod) > sinceSeconds);
  } catch {
    return false;
  }
  }
  canMarkStatusIndexCountCurrent(index, deckStatsCardCount, needsReadingKeyRefresh, now) {
  return !needsReadingKeyRefresh && !this.statusIndexIsDirty(index) && deckStatsCardCount !== null && deckStatsCardCount === index.cardCount && index.syncedAt >= 0 && now >= index.syncedAt;
  }
  canDeferStatusIndexRebuild(index, needsReadingKeyRefresh, options) {
  return Boolean(index && !needsReadingKeyRefresh && (!this.statusIndexIsDirty(index) || options.deferDirtyIfCountUnchanged) && !options.rebuildIfMissing);
  }
  async saveCheckedStatusIndex(index, checkedAt, deckStatsCardCount) {
  const cardCountChanged = deckStatsCardCount !== void 0 && deckStatsCardCount !== null && deckStatsCardCount !== index.cardCount;
  const checked = {
    ...index,
    checkedAt,
    ...deckStatsCardCount !== void 0 && deckStatsCardCount !== null ? { cardCount: deckStatsCardCount } : {},
    ...cardCountChanged ? { syncedAt: 0 } : {}
  };
  this.statusIndex = checked;
  await saveAnkiStatusIndexCheckedAt(checked);
  return checked;
  }
  async rebuildStatusIndexWithLease(index, needsReadingKeyRefresh) {
  const settingsKey = this.statusIndexSettingsKey();
  const rebuildLeaseOwner = claimAnkiStatusIndexRebuildLease(settingsKey);
  if (!rebuildLeaseOwner) return index;
  try {
    return await this.rebuildStatusIndexWithClaimedLease(
      index,
      needsReadingKeyRefresh,
      settingsKey,
      rebuildLeaseOwner
    );
  } finally {
    releaseAnkiStatusIndexRebuildLease(rebuildLeaseOwner);
  }
  }
  async rebuildStatusIndexWithClaimedLease(index, needsReadingKeyRefresh, settingsKey, rebuildLeaseOwner) {
  const rebuildStartedAt = Date.now();
  const cardIds = await this.invoke("findCards", { query: "deck:*" });
  touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  if (this.isDestroyed) return null;
  if (this.canReuseStatusIndexAfterCardScan(index, needsReadingKeyRefresh, cardIds.length, rebuildStartedAt)) {
    return await this.saveCheckedStatusIndex(index, rebuildStartedAt);
  }
  return await this.rebuildStatusIndex(cardIds, rebuildStartedAt, rebuildLeaseOwner);
  }
  canReuseStatusIndexAfterCardScan(index, needsReadingKeyRefresh, scannedCardCount, rebuildStartedAt) {
  return Boolean(index && !needsReadingKeyRefresh && scannedCardCount === index.cardCount && rebuildStartedAt - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS);
  }
  queueStatusIndexRefresh(options = {}) {
  if (this.isDestroyed || this.isLookupCoolingDown() || this.statusIndexRefresh || this.statusIndexRefreshQueued) return;
  this.statusIndexRefreshQueued = true;
  const run = () => {
    this.statusIndexRefreshQueued = false;
    if (this.isDestroyed) return;
    void this.refreshStatusIndexIfNeeded(options)?.catch((error) => {
      log.warn("Queued Anki status index refresh failed", error);
      return null;
    });
  };
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(run, ANKI_STATUS_INDEX_BACKGROUND_REFRESH_DELAY_MS);
  } else {
    void Promise.resolve().then(run);
  }
  }
  statusIndexNeedsCountCheck(index, now = Date.now()) {
  return now - index.checkedAt >= ANKI_STATUS_INDEX_COUNT_CHECK_MS;
  }
  statusIndexIsTooStale(index, now = Date.now()) {
  return now - index.syncedAt >= ANKI_STATUS_INDEX_MAX_STALE_MS;
  }
  async collectionCardCountFromDeckStats() {
  const deckNames = await this.deckNames().catch(() => []);
  if (!Array.isArray(deckNames) || !deckNames.length) return null;
  const stats = await this.invokeOrDefault("getDeckStats", { decks: deckNames }, null);
  if (!stats || typeof stats !== "object") return null;
  const totals = Object.values(stats).map((deck) => Number(deck?.total_in_deck)).filter((count) => Number.isFinite(count) && count >= 0);
  if (!totals.length) return null;
  return totals.reduce((sum, count) => sum + count, 0);
  }
  async rebuildStatusIndex(cardIds, now = Date.now(), rebuildLeaseOwner) {
  const rebuild = await this.loadStatusIndexRebuildContext(cardIds, now, rebuildLeaseOwner);
  if (!rebuild) return null;
  const indexed = await this.tryRebuildStatusIndexToIndexedDb(rebuild);
  if (indexed || this.isDestroyed) return indexed;
  return await this.rebuildStatusIndexToValueStorage(rebuild);
  }
  async loadStatusIndexRebuildContext(cardIds, now, rebuildLeaseOwner) {
  if (this.isDestroyed) return null;
  const settings = this.getSettings();
  const settingsKey = this.statusIndexSettingsKey(settings);
  this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  const allCardIds = cardIds ?? await this.invoke("findCards", { query: "deck:*" });
  if (this.isDestroyed) return null;
  this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  const cardData = await this.loadStatusIndexCardData(allCardIds, rebuildLeaseOwner, settingsKey);
  if (this.isDestroyed) return null;
  this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  const noteIds = this.statusIndexNoteIdsFromCardData(cardData) ?? await this.findStatusIndexNoteIds(allCardIds);
  if (this.isDestroyed) return null;
  this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  return { allCardIds, cardData, noteIds, now, rebuildLeaseOwner, settings, settingsKey };
  }
  touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey) {
  if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  }
  async findStatusIndexNoteIds(allCardIds) {
  return allCardIds.length ? await this.invokeOrDefault("findNotes", { query: "deck:*" }, []) : [];
  }
  statusIndexNoteIdsFromCardData(cardData) {
  const noteIds = [...cardData.cardsByNote.keys()].filter(Number.isFinite);
  return noteIds.length ? noteIds : null;
  }
  async tryRebuildStatusIndexToIndexedDb(rebuild) {
  if (!canUseIndexedDb()) return null;
  return await this.rebuildStatusIndexToIndexedDb(
    rebuild.noteIds,
    rebuild.cardData,
    rebuild.allCardIds.length,
    rebuild.now,
    rebuild.settings,
    rebuild.settingsKey,
    rebuild.rebuildLeaseOwner
  ).catch((error) => {
    log.warn("Anki status rebuild fell back", error);
    return null;
  });
  }
  async rebuildStatusIndexToValueStorage(rebuild) {
  const { allCardIds, cardData, noteIds, now, rebuildLeaseOwner, settings, settingsKey } = rebuild;
  const noteChunks = chunkArray(noteIds, ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
  const notesByChunk = Array.from({ length: noteChunks.length }, () => []);
  await runLimited(noteChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async (chunk, index2) => {
    notesByChunk[index2] = await this.invokeOrDefault("notesInfo", { notes: chunk }, []);
    this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  });
  const notes = notesByChunk.flat();
  if (this.isDestroyed) return null;
  const entries2 = {};
  for (const { key, entry } of statusIndexEntriesForNotes(notes, cardData, settings, now)) entries2[key] = entry;
  const index = {
    version: ANKI_STATUS_INDEX_VERSION,
    settingsKey,
    syncedAt: now,
    checkedAt: now,
    cardCount: allCardIds.length,
    entryCount: Object.keys(entries2).length,
    entries: entries2,
    readingKeys: true
  };
  this.statusIndex = index;
  this.statusLookupCache.clear();
  await saveAnkiStatusIndex(index);
  return index;
  }
  async rebuildStatusIndexToIndexedDb(noteIds, cardData, cardCount, now, settings, settingsKey, rebuildLeaseOwner) {
  if (this.isDestroyed) return null;
  const db = await openAnkiStatusIndexDb();
  try {
    await clearAnkiStatusIndexStores(db);
    const noteChunks = chunkArray(noteIds, ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
    let writeQueue = Promise.resolve();
    await runLimited(noteChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async (chunk) => {
      const notes = await this.invokeOrDefault("notesInfo", { notes: chunk }, []);
      if (this.isDestroyed) return;
      if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
      const entries2 = statusIndexEntriesForNotes(notes, cardData, settings, now);
      if (!entries2.length) return;
      writeQueue = writeQueue.then(() => putBestAnkiStatusIndexEntries(db, entries2));
      await writeQueue;
    });
    await writeQueue;
    if (this.isDestroyed) return null;
    const entryCount = await countAnkiStatusIndexEntries(db);
    const index = {
      version: ANKI_STATUS_INDEX_VERSION,
      settingsKey,
      syncedAt: now,
      checkedAt: now,
      cardCount,
      entryCount,
      entryStore: "indexeddb",
      entries: {},
      readingKeys: true
    };
    await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(index));
    await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(index));
    this.statusIndex = index;
    this.statusLookupCache.clear();
    return index;
  } finally {
    db.close();
  }
  }
  async loadStatusIndexCardData(allCardIds, rebuildLeaseOwner, settingsKey) {
  const sets = await this.loadStatusIndexCardSets(allCardIds);
  if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  const cardsByNote = await this.loadStatusIndexCardsByNote(allCardIds, sets, rebuildLeaseOwner, settingsKey);
  if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  return {
    sets,
    cardsByNote
  };
  }
  async loadStatusIndexCardsByNote(allCardIds, sets, rebuildLeaseOwner, settingsKey) {
  const fast = await this.loadStatusIndexCardsByNoteFast(allCardIds, sets, rebuildLeaseOwner, settingsKey);
  if (fast) return fast;
  const cardChunks = chunkArray(unique(allCardIds).map(Number).filter(Number.isFinite), ANKI_STATUS_INDEX_CARD_CHUNK_SIZE);
  const cardsByChunk = Array.from({ length: cardChunks.length }, () => []);
  await runLimited(cardChunks, ANKI_STATUS_INDEX_CARD_CONCURRENCY, async (chunk, index) => {
    const cards = await this.invokeOrDefault("cardsInfo", { cards: chunk }, []);
    cardsByChunk[index] = (Array.isArray(cards) ? cards : []).map((card) => this.statusIndexCardInfoWithDueFlag(card, sets));
    this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
  });
  return cardsByNoteId(cardsByChunk.flat());
  }
  async loadStatusIndexCardsByNoteFast(allCardIds, sets, rebuildLeaseOwner, settingsKey) {
  const cardIds = unique(allCardIds).map(Number).filter(Number.isFinite);
  if (!cardIds.length) return /* @__PURE__ */ new Map();
  try {
    const [noteIds, decks, relearning] = await Promise.all([
      this.invoke("cardsToNotes", { cards: cardIds }),
      this.invoke("getDecks", { cards: cardIds }),
      this.findCardIdSet("deck:* is:learn is:review")
    ]);
    if (!Array.isArray(noteIds) || noteIds.length !== cardIds.length || !decks || typeof decks !== "object") return null;
    this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
    const deckByCard = /* @__PURE__ */ new Map();
    for (const [deckName, deckCardIds] of Object.entries(decks)) {
      for (const id of deckCardIds ?? []) deckByCard.set(Number(id), deckName);
    }
    const cards = cardIds.map((cardId, index) => this.syntheticStatusIndexCardInfo(cardId, Number(noteIds[index]), deckByCard.get(cardId) ?? "", sets, relearning));
    return cardsByNoteId(cards);
  } catch {
    return null;
  }
  }
  // queue/type synthesized so stateFromAnkiCards classifies exactly like
  // the rendering path: relearn > due > learning > new > suspended > known.
  syntheticStatusIndexCardInfo(cardId, noteId, deckName, sets, relearning) {
  const queue = relearning.has(cardId) ? 3 : sets.learning.has(cardId) ? 1 : sets.new.has(cardId) ? 0 : sets.suspended.has(cardId) ? -1 : 2;
  return {
    cardId,
    note: noteId,
    deckName,
    queue,
    type: queue === 3 ? 3 : queue === 1 ? 1 : queue === 0 ? 0 : 2,
    reps: 0,
    lapses: 0,
    isDue: sets.due.has(cardId)
  };
  }
  statusIndexCardInfoWithDueFlag(card, sets) {
  const cardId = Number(card.cardId);
  return Number.isFinite(cardId) ? { ...card, isDue: sets.due.has(cardId) } : card;
  }
  async loadStatusIndexCardSets(allCardIds) {
  const all = new Set(unique(allCardIds).map(Number).filter(Number.isFinite));
  if (!all.size) return { all, due: /* @__PURE__ */ new Set(), learning: /* @__PURE__ */ new Set(), new: /* @__PURE__ */ new Set(), suspended: /* @__PURE__ */ new Set() };
  const [due, learning, newCards, suspended] = await Promise.all([
    this.findCardIdSet("deck:* is:due"),
    this.findCardIdSet("deck:* is:learn"),
    this.findCardIdSet("deck:* is:new"),
    this.findCardIdSet("deck:* is:suspended")
  ]);
  return { all, due, learning, new: newCards, suspended };
  }
  async findCardIdSet(query) {
  const cardIds = await this.invokeOrDefault("findCards", { query }, []);
  return new Set(cardIds.map(Number).filter(Number.isFinite));
  }
  isLookupCoolingDown() {
  if (Date.now() >= this.unavailableUntil) return false;
  if (hasUserscriptAnkiBridge()) {
    this.markAvailable();
    return false;
  }
  return true;
  }
  readLookupCache(cacheKey) {
  const cached = this.lookupCache.get(cacheKey);
  if (!cached || Date.now() - cached.at >= 45e3) return null;
  return cached.result;
  }
  readStatusLookupCache(cacheKey) {
  const cached = this.statusLookupCache.get(cacheKey);
  if (!cached || Date.now() - cached.at >= 45e3) return null;
  return cached.result;
  }
  writeLookupCache(cacheKey, result) {
  this.lookupCache.set(cacheKey, { at: Date.now(), result });
  }
  writeStatusLookupCache(cacheKey, result) {
  this.statusLookupCache.set(cacheKey, { at: Date.now(), result });
  }
  async findExistingCardsBatchUncachedWithInflight(groups, fallback) {
  if (this.isDestroyed) return new Map(groups.map((group) => [group.cacheKey, fallback]));
  const batch = this.findExistingCardsBatchUncached(groups);
  for (const { cacheKey } of groups) {
    const promise = batch.then((results) => results.get(cacheKey) ?? fallback).finally(() => {
      this.lookupInflight.delete(cacheKey);
    });
    this.lookupInflight.set(cacheKey, promise);
    void promise.catch(() => void 0);
  }
  return batch;
  }
  async findExistingCardsBatchUncached(groups) {
  const empty = emptyAnkiLookupResult();
  if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
  const statusNoteIdsByKey = await this.findStatusIndexNoteIdsByLookupKey(groups);
  if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
  const noteIdsByKey = await this.findCombinedCandidateNoteIdsByLookupKey(groups, statusNoteIdsByKey);
  if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
  const allNoteIds = this.uniqueLookupNoteIds(noteIdsByKey);
  if (!allNoteIds.length) return this.emptyLookupResultsForGroups(groups, empty);
  const notes = await this.invoke("notesInfo", { notes: allNoteIds });
  if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
  const matching = this.matchingNotesByLookupKey(groups, noteIdsByKey, notes, statusNoteIdsByKey);
  const cardsByNote = await this.loadCardsByNote(matching.uniqueNotes);
  if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
  return await this.existingLookupResultsFromMatches(groups, matching.notesByCacheKey, cardsByNote, empty);
  }
  async findCombinedCandidateNoteIdsByLookupKey(groups, statusNoteIdsByKey) {
  const noteIdsByKey = this.copyNoteIdsByLookupKey(statusNoteIdsByKey);
  const searchedNoteIds = await this.findCandidateNoteIdsByLookupKey(groups);
  this.mergeNoteIdsByLookupKey(noteIdsByKey, searchedNoteIds);
  return noteIdsByKey;
  }
  copyNoteIdsByLookupKey(noteIdsByKey) {
  return new Map([...noteIdsByKey].map(([cacheKey, noteIds]) => [cacheKey, new Set(noteIds)]));
  }
  mergeNoteIdsByLookupKey(target, source) {
  for (const [cacheKey, noteIds] of source) {
    const merged = target.get(cacheKey) ?? /* @__PURE__ */ new Set();
    noteIds.forEach((noteId) => merged.add(noteId));
    target.set(cacheKey, merged);
  }
  }
  uniqueLookupNoteIds(noteIdsByKey) {
  return unique(Array.from(noteIdsByKey.values()).flatMap((noteIds) => [...noteIds]));
  }
  matchingNotesByLookupKey(groups, noteIdsByKey, notes, trustedNoteIdsByKey) {
  const notesById = new Map(notes.map((note) => [note.noteId, note]));
  const notesByCacheKey = /* @__PURE__ */ new Map();
  const uniqueNotesById = /* @__PURE__ */ new Map();
  for (const { cacheKey, card } of groups) {
    const trustedNoteIds = trustedNoteIdsByKey?.get(cacheKey);
    const matchingNotes = [...noteIdsByKey.get(cacheKey) ?? []].map((noteId) => notesById.get(noteId)).filter((note) => this.isMatchingAnkiNoteForCard(note, card, trustedNoteIds));
    notesByCacheKey.set(cacheKey, matchingNotes);
    matchingNotes.forEach((note) => uniqueNotesById.set(note.noteId, note));
  }
  return {
    notesByCacheKey,
    uniqueNotes: [...uniqueNotesById.values()]
  };
  }
  isMatchingAnkiNoteForCard(note, card, trustedNoteIds) {
  if (!note) return false;
  if (trustedNoteIds?.has(note.noteId)) return true;
  return noteLooksLikeCard(note, card, this.getSettings());
  }
  async existingLookupResultsFromMatches(groups, matchingNotesByKey, cardsByNote, empty) {
  const results = /* @__PURE__ */ new Map();
  for (const { cacheKey } of groups) {
    const matchingNotes = matchingNotesByKey.get(cacheKey) ?? [];
    const existing = matchingNotes.map((note) => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? []));
    if (existing.length) await this.hydrateExistingNoteRenderedMedia(existing);
    results.set(cacheKey, lookupResultFromExistingNotes(existing, empty));
  }
  await this.rememberStatusIndexNotes(unique([...matchingNotesByKey.values()].flatMap((notes) => notes)), cardsByNote).catch((error) => {
    log.warn("Anki status cache update failed", error);
  });
  return results;
  }
  async rememberStatusIndexNotes(notes, cardsByNote) {
  if (!notes.length || this.isDestroyed) return;
  const settings = this.getSettings();
  const settingsKey = this.statusIndexSettingsKey(settings);
  const now = Date.now();
  const entries2 = this.rememberedStatusIndexEntries(notes, cardsByNote, settings, now);
  if (!entries2.length || this.isDestroyed) return;
  const current = this.validStatusIndex(await this.loadStatusIndex());
  const base = await this.baseStatusIndexForRememberedNotes(current, settingsKey, now, entries2.length);
  const checkedAt = Math.max(base.checkedAt, now);
  if (this.shouldRememberStatusIndexEntriesInIndexedDb(base, current)) {
    await this.rememberIndexedDbStatusIndexEntries({ ...base, checkedAt, entryStore: "indexeddb", entries: {} }, entries2);
    return;
  }
  await this.rememberValueStatusIndexEntries(base, checkedAt, entries2);
  }
  rememberedStatusIndexEntries(notes, cardsByNote, settings, updatedAt) {
  return statusIndexEntriesForNotes(notes, {
    cardsByNote,
    sets: emptyAnkiStatusIndexCardSets()
  }, settings, updatedAt);
  }
  async baseStatusIndexForRememberedNotes(current, settingsKey, now, rememberedCount) {
  if (current) return current;
  return {
    version: ANKI_STATUS_INDEX_VERSION,
    settingsKey,
    syncedAt: 0,
    checkedAt: now,
    cardCount: rememberedCount,
    entryCount: 0,
    entries: {},
    readingKeys: true
  };
  }
  shouldRememberStatusIndexEntriesInIndexedDb(base, current) {
  return base.entryStore === "indexeddb" || !current && canUseIndexedDb();
  }
  async rememberValueStatusIndexEntries(base, checkedAt, entries2) {
  const mergedEntries = { ...base.entries };
  for (const candidate of entries2) {
    const currentEntry = mergedEntries[candidate.key];
    if (!currentEntry || shouldReplaceAnkiStatusIndexEntry(currentEntry, candidate.entry)) {
      mergedEntries[candidate.key] = candidate.entry;
    }
  }
  const index = {
    ...base,
    checkedAt,
    entryCount: Object.keys(mergedEntries).length,
    entries: mergedEntries,
    readingKeys: true
  };
  this.statusIndex = index;
  await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, index);
  }
  async rememberIndexedDbStatusIndexEntries(index, entries2) {
  const db = await openAnkiStatusIndexDb();
  try {
    await putBestAnkiStatusIndexEntries(db, entries2);
    const entryCount = await countAnkiStatusIndexEntries(db);
    const next = {
      ...index,
      entryStore: "indexeddb",
      entries: {},
      entryCount,
      readingKeys: true
    };
    await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(next));
    await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(next));
    this.statusIndex = next;
  } finally {
    db.close();
  }
  }
  emptyLookupResultsForGroups(groups, empty) {
  return new Map(groups.map((group) => [group.cacheKey, empty]));
  }
  async findStatusIndexNoteIdsByLookupKey(groups) {
  const noteIdsByKey = new Map(groups.map((group) => [group.cacheKey, /* @__PURE__ */ new Set()]));
  const statusIndex = await this.loadStatusIndex();
  if (!statusIndex || this.isDestroyed) return noteIdsByKey;
  const statusEntries = await this.loadStatusEntriesForCards(statusIndex, groups.map((group) => group.card));
  if (this.isDestroyed) return noteIdsByKey;
  for (const { cacheKey, card } of groups) {
    const noteId = Number(this.lookupStatusIndex(statusIndex, card, statusEntries)?.primary?.noteId);
    if (Number.isFinite(noteId) && noteId > 0) noteIdsByKey.get(cacheKey)?.add(noteId);
  }
  return noteIdsByKey;
  }
  async findCandidateNoteIdsByLookupKey(groups) {
  const noteIdsByKey = new Map(groups.map((group) => [group.cacheKey, /* @__PURE__ */ new Set()]));
  if (this.isDestroyed) return noteIdsByKey;
  const keysByTerm = /* @__PURE__ */ new Map();
  for (const { cacheKey, card } of groups) {
    for (const term of lookupKeyTermsForCard(card)) {
      const keys = keysByTerm.get(term) ?? /* @__PURE__ */ new Set();
      keys.add(cacheKey);
      keysByTerm.set(term, keys);
    }
  }
  const terms = [...keysByTerm.keys()];
  const lookupFields = this.statusLookupFieldNames();
  if (lookupFields.length) {
    const fieldQuery = (term) => lookupFields.map((field) => quoteAnkiSearch(`${field}:${term}`)).join(" OR ");
    await this.collectCandidateNoteIds(terms, keysByTerm, noteIdsByKey, fieldQuery);
    if (this.isDestroyed) return noteIdsByKey;
  }
  const unresolvedTerms = lookupFields.length ? terms.filter((term) => [...keysByTerm.get(term) ?? []].some((cacheKey) => (noteIdsByKey.get(cacheKey)?.size ?? 0) === 0)) : terms;
  if (unresolvedTerms.length) {
    await this.collectCandidateNoteIds(unresolvedTerms, keysByTerm, noteIdsByKey, (term) => quoteAnkiSearch(term));
  }
  return noteIdsByKey;
  }
  statusLookupFieldNames() {
  const settings = this.getSettings();
  const mapping = settings.ankiFieldMappings?.[resolvedAnkiModelName(settings)];
  return [...new Set([mapping?.expression, mapping?.reading].map((value) => value?.trim()).filter((value) => Boolean(value)))];
  }
  async collectCandidateNoteIds(terms, keysByTerm, noteIdsByKey, buildQuery) {
  const chunks = chunkArray(terms, ANKI_STATUS_LOOKUP_TERM_CHUNK_SIZE);
  const chunkResponses = new Array(chunks.length);
  await runLimited(chunks, ANKI_STATUS_LOOKUP_CHUNK_CONCURRENCY, async (chunk, index) => {
    chunkResponses[index] = await this.invokeMulti(chunk.map((term) => ({
      action: "findNotes",
      params: { query: buildQuery(term) }
    })));
  });
  if (this.isDestroyed) return;
  const responses = chunkResponses.flat();
  terms.forEach((term, index) => {
    const ids = responses[index] ?? [];
    for (const cacheKey of keysByTerm.get(term) ?? []) {
      const noteIds = noteIdsByKey.get(cacheKey);
      ids.forEach((id) => noteIds?.add(id));
    }
  });
  }
  async loadExistingNotes(card, noteIds) {
  if (this.isDestroyed) return { existing: [], candidateNotes: 0 };
  const notes = await this.invoke("notesInfo", { notes: [...noteIds] });
  if (this.isDestroyed) return { existing: [], candidateNotes: notes.length };
  const matchingNotes = notes.filter((note) => noteLooksLikeCard(note, card, this.getSettings()));
  const cardsByNote = await this.loadCardsByNote(matchingNotes);
  const existing = matchingNotes.map((note) => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? []));
  await this.hydrateExistingNoteRenderedMedia(existing);
  return {
    existing,
    candidateNotes: notes.length
  };
  }
  async hydrateExistingNoteRenderedMedia(notes) {
  const cards = notes.flatMap((note) => note.renderedCards ?? []);
  if (!cards.length || this.isDestroyed) return;
  await runLimited(cards, ANKI_RENDERED_MEDIA_CONCURRENCY, async (card) => {
    const filenames = ankiRenderedCardMediaFilenames(card).slice(0, ANKI_RENDERED_MEDIA_LIMIT);
    if (!filenames.length || this.isDestroyed) return;
    const mediaDataUrls = {};
    await runLimited(filenames, ANKI_RENDERED_MEDIA_CONCURRENCY, async (filename) => {
      if (this.isDestroyed) return;
      try {
        mediaDataUrls[filename] = await this.mediaFileDataUrl(filename);
      } catch (error) {
        log.warnOnce(`rendered-media:${filename}`, "Could not load Anki rendered card media", { filename }, error);
      }
    });
    if (Object.keys(mediaDataUrls).length) card.mediaDataUrls = mediaDataUrls;
  });
  }
  async loadCardsByNote(notes) {
  if (this.isDestroyed) return /* @__PURE__ */ new Map();
  const cardIds = unique(notes.flatMap((note) => note.cards ?? []));
  const cards = cardIds.length ? await this.invokeOrDefault("cardsInfo", { cards: cardIds }, []) : [];
  if (this.isDestroyed) return /* @__PURE__ */ new Map();
  return cardsByNoteId(await this.annotateDueCards(cards));
  }
  async annotateDueCards(cards) {
  if (this.isDestroyed) return cards;
  const reviewCardIds = cards.filter((card) => card.queue === 2).map((card) => Number(card.cardId)).filter(Number.isFinite);
  if (!reviewCardIds.length) return cards;
  const dueFlags = await this.invokeOrDefault("areDue", { cards: reviewCardIds }, []);
  if (this.isDestroyed) return cards;
  const dueByCardId = new Map(reviewCardIds.map((cardId, index) => [cardId, dueFlags[index]]));
  return cards.map((card) => card.queue === 2 && dueByCardId.has(Number(card.cardId)) ? { ...card, isDue: dueByCardId.get(Number(card.cardId)) === true } : card);
  }
  // Public review action used by card and newtab controls to answer rendered Anki review cards.
  // fallow-ignore-next-line unused-class-member
  async answerCard(cardId, grade) {
  const ease = ankiEaseFromGrade(grade);
  log.info("Answering Anki card", { cardId, grade, ease });
  await this.invoke("answerCards", { answers: [{ cardId, ease }] });
  this.lookupCache.clear();
  this.statusLookupCache.clear();
  this.markStatusIndexDirtyAfterMutation("review");
  }
  // Suspension is Anki's native blacklist analog: suspended cards never
  // come up for review and already render with the dedicated state color.
  // Used by the card action controller's deck-state mapping.
  // fallow-ignore-next-line unused-class-member
  async setCardsSuspended(cardIds, suspended) {
  if (!cardIds.length) return;
  log.info("Setting Anki card suspension", { cardIds, suspended });
  await this.invoke(suspended ? "suspend" : "unsuspend", { cards: cardIds });
  this.lookupCache.clear();
  this.statusLookupCache.clear();
  this.markStatusIndexDirtyAfterMutation("review");
  }
  // The never-forget analog: a tag the user can also filter on inside Anki.
  // Used by the card action controller's deck-state mapping.
  // fallow-ignore-next-line unused-class-member
  async setNotesTag(noteIds, tag, present) {
  if (!noteIds.length) return;
  log.info("Setting Anki note tag", { noteIds, tag, present });
  await this.invoke(present ? "addTags" : "removeTags", { notes: noteIds, tags: tag });
  this.lookupCache.clear();
  this.statusLookupCache.clear();
  this.markStatusIndexDirtyAfterMutation("merge");
  }
  // Used by card action controls to open existing notes from rendered Anki status.
  // fallow-ignore-next-line unused-class-member
  async browseNote(noteId) {
  log.info("Opening Anki note browser", { noteId });
  await this.invoke("guiBrowse", { query: `nid:${noteId}` });
  }
  async mediaFileDataUrl(filename) {
  const cleanFilename = filename.trim();
  if (!cleanFilename) throw new Error(this.text("ankiAudioFileNotFound"));
  const cached = this.mediaDataUrlCache.get(cleanFilename);
  if (cached) return cached;
  const promise = this.fetchMediaFileDataUrl(cleanFilename).catch((error) => {
    this.mediaDataUrlCache.delete(cleanFilename);
    throw error;
  });
  this.mediaDataUrlCache.set(cleanFilename, promise);
  if (this.mediaDataUrlCache.size > ANKI_MEDIA_DATA_URL_CACHE_LIMIT) {
    const oldest = this.mediaDataUrlCache.keys().next().value;
    if (oldest !== void 0) this.mediaDataUrlCache.delete(oldest);
  }
  return promise;
  }
  async fetchMediaFileDataUrl(cleanFilename) {
  const data = await this.invoke("retrieveMediaFile", { filename: cleanFilename });
  if (!data) throw new Error(this.text("ankiAudioFileNotFound"));
  return `data:${ankiMediaMimeType(cleanFilename)};base64,${data}`;
  }
  // Used by card action controls to merge mining context into existing Anki notes.
  // fallow-ignore-next-line unused-class-member
  async mergeYomuData(noteId, card, sentence = "", options = {}) {
  const [note] = await this.invoke("notesInfo", { notes: [noteId] });
  if (!note) throw new Error(this.text("ankiNoteNotFound"));
  const merge = this.buildYomuNoteMerge(note, card, sentence, options);
  if (!merge.updatedFields.length && !merge.audioAdded && !merge.imageAdded) {
    return merge;
  }
  await this.invoke("updateNoteFields", { note: merge.note });
  this.clearLookupCachesForCard(card);
  this.markStatusIndexDirtyAfterMutation("merge");
  return merge;
  }
  // Used by card action controls for desktop Anki mining.
  // fallow-ignore-next-line unused-class-member
  async addCard(card, sentence = "", options = {}) {
  const settings = this.getSettings();
  if (!settings.ankiEnabled) {
    return null;
  }
  const note = this.buildAnkiNote(card, sentence, settings, options);
  if (canUseMobileAnkiHandoff$1(settings) && !hasUserscriptAnkiBridge()) {
    if (!openMobileAnkiHandoff(retargetAnkiNoteForMobileHandoff(note, settings))) throw new Error(this.text("ankiHandoffCancelled"));
    return null;
  }
  try {
    return await this.addNoteViaConnect(note, card);
  } catch (error) {
    return this.addCardWithFallback(error, settings, note, card);
  }
  }
  // Used by card action controls for mobile Anki handoff mining.
  // fallow-ignore-next-line unused-class-member
  async addCardViaMobileHandoff(card, sentence = "", options = {}) {
  const settings = this.getSettings();
  if (!settings.ankiEnabled) return null;
  if (!canUseMobileAnkiHandoff$1(settings)) throw new Error("Mobile Anki handoff is not available here.");
  const note = retargetAnkiNoteForMobileHandoff(this.buildAnkiNote(card, sentence, settings, options), settings);
  if (!openMobileAnkiHandoff(note)) throw new Error(this.text("ankiHandoffCancelled"));
  return null;
  }
  buildAnkiNote(card, sentence, settings, options) {
  const note = {
    deckName: this.ankiDeckName(options, settings),
    modelName: settings.ankiModel || "よむ Japanese",
    fields: buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings)),
    tags: tagsFromString(settings.ankiTags),
    options: {
      allowDuplicate: false,
      duplicateScope: "collection"
    }
  };
  this.attachAnkiNoteImage(note, options.imageDataUrl, card);
  this.attachAnkiNoteAudio(note, options, card);
  return note;
  }
  buildYomuNoteMerge(note, card, sentence, options) {
  const settings = this.getSettings();
  const fieldNames = Object.keys(note.fields ?? {});
  const existingFields = flattenNoteFields(note.fields);
  const yomuFields = buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings));
  const canOwnYomuFields = noteLooksLikeYomuModel(note.modelName, settings, fieldNames);
  const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames);
  const fields = mergedYomuFields(fieldNames, existingFields, yomuFields, canOwnYomuFields, mapping);
  const audio = mergeAudioFilesForNote(fieldNames, options, card, mapping);
  const picture = mergePictureFilesForNote(fieldNames, existingFields, options, card, canOwnYomuFields, mapping);
  applyMediaFieldClears(fields, audio, picture, options.audioMergeMode, canOwnYomuFields);
  return {
    noteId: note.noteId,
    modelName: note.modelName,
    updatedFields: Object.keys(fields),
    audioAdded: Boolean(audio.length),
    imageAdded: Boolean(picture.length),
    note: {
      id: note.noteId,
      fields,
      ...audio.length ? { audio } : {},
      ...picture.length ? { picture } : {}
    }
  };
  }
  ankiDeckName(options, settings) {
  return options.deckName?.trim() || settings.ankiDeck || "よむ";
  }
  ankiFieldContext(options, settings) {
  return {
    ...options,
    sourceUrl: options.sourceUrl ?? safeLocationHref(),
    sourceTitle: options.sourceTitle ?? safeDocumentTitle(),
    dictionaryPreferences: options.dictionaryPreferences ?? settings.dictionaryPreferences,
    interfaceLanguage: options.interfaceLanguage ?? settings.interfaceLanguage
  };
  }
  attachAnkiNoteImage(note, imageDataUrl, card) {
  const image = imageDataUrl ? imageFromDataUrl(imageDataUrl, card) : null;
  if (image) note.picture = [image];
  }
  attachAnkiNoteAudio(note, options, card) {
  const audio = audioFilesFromContext(options, card);
  if (audio.length) note.audio = audio;
  }
  logAnkiNoteAdd(card, note) {
  log.info("Adding Anki note", {
    term: card.spelling,
    deck: note.deckName,
    model: note.modelName,
    hasImage: Boolean(note.picture?.length),
    hasAudio: Boolean(note.audio?.length),
    tags: note.tags
  });
  }
  async addNoteViaConnect(note, card) {
  const preparedNote = await this.prepareAnkiNoteForConnect(note);
  await this.ensureAnkiNoteCanAdd(preparedNote);
  this.logAnkiNoteAdd(card, preparedNote);
  const noteId = await this.invoke("addNote", { note: preparedNote });
  log.info("Anki note added", { term: card.spelling, noteId });
  await this.refreshLookupCacheAfterAdd(card, noteId);
  if (noteId === null) throw new AnkiDuplicateNoteError(this.text("alreadyInAnki"));
  return noteId;
  }
  async ensureAnkiNoteCanAdd(note) {
  const [canAdd] = await this.invoke("canAddNotes", { notes: [ankiNoteForDuplicatePreflight(note)] }).catch((error) => {
    if (isAnkiConnectAvailabilityError(error)) throw error;
    log.warn("Anki duplicate preflight failed", error);
    return [true];
  });
  if (canAdd === false) throw new AnkiDuplicateNoteError(this.text("alreadyInAnki"));
  }
  async prepareAnkiNoteForConnect(note) {
  const settings = this.getSettings();
  await this.ensureDeck(note.deckName);
  const modelNames = await this.modelNames().catch(() => []);
  if (!modelNames.includes(note.modelName)) {
    await this.createYomuModel(note.modelName, settings);
    return note;
  }
  const fieldNames = await this.invokeOrDefault("modelFieldNames", { modelName: note.modelName }, []);
  if (shouldTreatExistingModelAsYomuManaged(note.modelName, settings, fieldNames)) {
    await this.updateExistingModel(note.modelName, settings);
    return note;
  }
  return retargetAnkiNoteToExistingModel(note, fieldNames, settings);
  }
  async refreshLookupCacheAfterAdd(card, noteId) {
  const cacheKey = this.lookupCacheKey(card);
  this.statusLookupCache.delete(cacheKey);
  if (!noteId) {
    this.lookupCache.delete(cacheKey);
    return;
  }
  try {
    const { existing } = await this.loadExistingNotes(card, /* @__PURE__ */ new Set([noteId]));
    const result = {
      state: stateFromExistingNotes(existing),
      notes: existing,
      primary: pickPrimaryExistingNote(existing)
    };
    this.writeLookupCache(cacheKey, result);
    this.writeStatusLookupCache(cacheKey, result);
    this.markStatusIndexDirtyAfterMutation("add");
  } catch (error) {
    log.warn("Anki lookup refresh after add failed", { term: card.spelling, noteId }, error);
    this.lookupCache.delete(cacheKey);
    this.statusLookupCache.delete(cacheKey);
    this.markStatusIndexDirtyAfterMutation("add");
  }
  }
  clearLookupCachesForCard(card) {
  const cacheKey = this.lookupCacheKey(card);
  this.lookupCache.delete(cacheKey);
  this.statusLookupCache.delete(cacheKey);
  }
  markStatusIndexDirtyAfterMutation(reason) {
  const dirtyLoadedIndex = (index) => {
    const valid = this.validStatusIndex(index);
    if (!valid) return false;
    const dirty = { ...valid, syncedAt: 0, checkedAt: 0, dirtyAt: Date.now() };
    this.statusIndex = dirty;
    void saveAnkiStatusIndexDirtyMarker(dirty).catch((error) => {
      log.warn("Anki dirty marker failed", { reason }, error);
    }).finally(() => {
      if (!this.isDestroyed) this.queueStatusIndexRefresh({ deferDirtyIfCountUnchanged: true });
    });
    return true;
  };
  if (this.statusIndex !== void 0) {
    dirtyLoadedIndex(this.statusIndex);
    return;
  }
  void this.loadStatusIndex().then((index) => {
    if (this.isDestroyed) return;
    dirtyLoadedIndex(index);
  }).catch((error) => {
    log.warn("Anki dirty marker failed", { reason }, error);
  });
  }
  addCardWithFallback(error, settings, note, card) {
  if (!canUseMobileAnkiHandoff$1(settings) || !isMobileHandoffRecoverableAddError(error)) throw error;
  log.warn("AnkiConnect add failed", { term: card.spelling }, error);
  if (!openMobileAnkiHandoff(retargetAnkiNoteForMobileHandoff(note, settings))) throw new Error(this.text("ankiHandoffCancelled"));
  return null;
  }
  // Used by settings save/setup flow to prepare the configured Anki deck and model.
  // fallow-ignore-next-line unused-class-member
  async ensureDeckAndModel(deckOverride) {
  const settings = this.getSettings();
  const deckName = resolvedAnkiDeckName(deckOverride, settings);
  const modelName = resolvedAnkiModelName(settings);
  await this.ensureDeck(deckName);
  const modelNames = await this.modelNames().catch(() => []);
  await this.ensureYomuModel(modelNames, modelName, settings);
  }
  async ensureDeck(deckName) {
  await this.invokeOrDefault("createDeck", { deck: deckName }, null);
  }
  // A note type made by an earlier Yomu keeps working, but has no field for
  // what newer releases mine (audio and pitch are the ones users notice).
  // Report what it would gain so settings can offer the update, and null
  // once it already matches — the offer clears itself.
  // Used by the settings Anki panel through the Anki dependency.
  async yomuModelUpdatePlan() {
  const settings = this.getSettings();
  if (!settings.ankiEnabled) return null;
  const modelName = resolvedAnkiModelName(settings);
  const modelNames = await this.modelNames().catch(() => []);
  if (!modelNames.includes(modelName)) return null;
  const fieldNames = await this.invokeOrDefault("modelFieldNames", { modelName }, []);
  if (!fieldNames.length) return null;
  if (!shouldTreatExistingModelAsYomuManaged(modelName, settings, fieldNames)) return null;
  const missingFields = missingYomuModelFields(fieldNames);
  return missingFields.length ? { modelName, missingFields } : null;
  }
  // Accepting the settings offer lands here. It writes only what the plan
  // above says, re-read now: every reason that plan has for staying quiet —
  // a third-party note type, a field read that failed — is a reason to write
  // nothing, and fifteen fields is a collection-wide schema change Anki has
  // no cheap undo for. An offer made against another note type is declined
  // rather than retargeted, so a stale prompt is a no-op.
  // Fields only: templates and styling stay as the user left them.
  // Used by the settings Anki panel through the Anki dependency.
  // fallow-ignore-next-line unused-class-member
  async addMissingYomuModelFields(expectedModelName) {
  const plan = await this.yomuModelUpdatePlan();
  if (!plan) return [];
  if (plan.modelName !== expectedModelName) {
    log.info("Anki note type update declined", { offered: expectedModelName, configured: plan.modelName });
    return [];
  }
  await this.addModelFields(plan.modelName, plan.missingFields);
  this.fieldTargetPlanCache = void 0;
  return plan.missingFields;
  }
  async updateExistingModel(modelName, settings) {
  await this.ensureModelFields(modelName);
  await this.invoke("updateModelTemplates", { model: { name: modelName, templates: yomuCardTemplates(settings) } });
  await this.invoke("updateModelStyling", { model: { name: modelName, css: yomuCardCss() } });
  }
  async ensureYomuModel(modelNames, modelName, settings) {
  return modelNames.includes(modelName) ? await this.updateExistingModel(modelName, settings) : await this.createYomuModel(modelName, settings);
  }
  async createYomuModel(modelName, settings) {
  await this.invoke("createModel", {
    modelName,
    inOrderFields: YOMU_MODEL_FIELDS,
    css: yomuCardCss(),
    cardTemplates: Object.entries(yomuCardTemplates(settings)).map(([Name, template]) => ({ Name, ...template }))
  });
  log.info("Anki model created", { modelName });
  }
  // Adding nothing is the steady state once the note type matches this
  // release. A field list that would not read is a failed request, not a
  // note type with no fields — Anki has no such thing — so it waits for a
  // read it can trust rather than widening a note type it cannot see.
  async ensureModelFields(modelName) {
  const fieldNames = await this.invoke("modelFieldNames", { modelName }).catch(() => null);
  if (!fieldNames?.length) return;
  await this.addModelFields(modelName, missingYomuModelFields(fieldNames));
  }
  async addModelFields(modelName, fieldNames) {
  for (const fieldName of fieldNames) {
    await this.invoke("modelFieldAdd", { modelName, fieldName });
  }
  if (fieldNames.length) log.info("Anki model fields added", { modelName, fields: fieldNames });
  }
  async invoke(action, params = {}) {
  return this.invokeWithTimeout(action, params, ANKI_CONNECT_REQUEST_TIMEOUT_MS);
  }
  async invokeOrDefault(action, params, fallback) {
  return this.invoke(action, params).catch(() => fallback);
  }
  async invokeWithTimeout(action, params, timeoutMs) {
  const settings = this.getSettings();
  const url = settings.ankiConnectUrl || "http://127.0.0.1:8765";
  const body = JSON.stringify({ action, version: ANKI_VERSION, params }, omitInternalAnkiMediaKeys);
  const response = await postAnkiJson(url, body, timeoutMs).catch((error) => {
    if (isAnkiConnectAvailabilityError(error)) this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
    throw this.localizedConnectError(error);
  });
  this.markAvailable();
  if (response.error) {
    log.warn("AnkiConnect action returned error", { action, error: response.error });
    throw new Error(resolveUiLanguage(settings.interfaceLanguage) === "ja" ? this.text("ankiConnectActionFailed") : response.error);
  }
  return response.result;
  }
  async invokeMulti(actions) {
  if (!actions.length) return [];
  try {
    const responses = await this.invoke("multi", { actions });
    return responses.map((response) => isAnkiMultiActionResponse(response) ? response.error ? void 0 : response.result : response);
  } catch (error) {
    if (isAnkiConnectAvailabilityError(error)) {
      log.warn("AnkiConnect multi failed; cooling down", error);
      this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
      return actions.map(() => void 0);
    }
    log.warn("AnkiConnect multi failed; retrying solo", error);
    return Promise.all(actions.map(
      (action) => this.invoke(action.action, action.params ?? {}).catch(() => void 0)
    ));
  }
  }
  text(key) {
  return uiText(this.getSettings().interfaceLanguage, key);
  }
  localizedConnectError(error) {
  const language = this.getSettings().interfaceLanguage;
  if (resolveUiLanguage(language) !== "ja") return error instanceof Error ? error : new Error(this.text("ankiConnectRequestFailed"));
  if (error instanceof Error && /timed out/i.test(error.message)) return new Error(this.text("ankiConnectTimedOut"), { cause: error });
  const status = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : "";
  const suffix = status ? `（${status}）` : "";
  return new Error(`${this.text("ankiConnectRequestFailed")}${suffix}`, error instanceof Error ? { cause: error } : void 0);
  }
  markAvailable() {
  this.availabilityCheckedAt = Date.now();
  this.unavailableUntil = 0;
  }
}
function isAnkiMultiActionResponse(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "result") && Object.prototype.hasOwnProperty.call(value, "error");
}
function emptyAnkiStatusIndexCardSets() {
  return {
  all: /* @__PURE__ */ new Set(),
  due: /* @__PURE__ */ new Set(),
  learning: /* @__PURE__ */ new Set(),
  new: /* @__PURE__ */ new Set(),
  suspended: /* @__PURE__ */ new Set()
  };
}
function lookupResultFromExistingNotes(existing, empty) {
  return existing.length ? {
  state: stateFromExistingNotes(existing),
  notes: existing,
  primary: pickPrimaryExistingNote(existing)
  } : empty;
}
function omitInternalAnkiMediaKeys(key, value) {
  return key === "yomuAudioKind" ? void 0 : value;
}
function captureActiveVideoFrame() {
  const video = Array.from(document.querySelectorAll("video")).filter((item) => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0).sort((a, b) => visibleArea(b) - visibleArea(a))[0];
  if (!video) {
  return void 0;
  }
  try {
  const canvas = document.createElement("canvas");
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return void 0;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  return dataUrl;
  } catch (error) {
  log.warn("Active video frame capture failed", error);
  return void 0;
  }
}
function isMobileHandoffRecoverableAddError(error) {
  if (isAnkiConnectAvailabilityError(error)) return true;
  if (error instanceof Error && error.cause && error.cause !== error) {
  return isMobileHandoffRecoverableAddError(error.cause);
  }
  if (!(error instanceof Error)) return false;
  return /unsupported action|action.*unsupported|unknown action|invalid action|not supported/i.test(error.message);
}
function tagsFromString(value) {
  return value.split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean);
}
function visibleArea(element) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}
function ankiEaseFromGrade(grade) {
  return ANKI_EASE_BY_GRADE[grade] ?? 3;
}
function safeDocumentTitle() {
  return typeof document === "undefined" ? "" : document.title;
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
function blobToDataUrl(blob, language = "en") {
  return readBlobAsDataUrl(blob, uiText(language, "couldNotReadAudio"));
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
let activationTrackingWindow;
function installPageActivationTracking() {
  if (typeof window === "undefined" || activationTrackingWindow === window) return;
  activationTrackingWindow = window;
  const markActive = () => {
  };
  for (const eventName of ["click", "keydown", "pointerdown", "touchstart"]) {
  window.addEventListener(eventName, markActive, { capture: true, passive: true });
  }
}
installPageActivationTracking();
Logger.scope("Audio");
async function resolveAnkiWordAudio(card, settings) {
  if (!settings.audioEnabled) return null;
  const sources = orderAudioSources(
  getOrderedAudioSources(settings).filter((source) => !isBrowserTextToSpeechSource(source)),
  card
  );
  const triedUrls = /* @__PURE__ */ new Set();
  for (const { source } of sources) {
  const audio = await resolveAnkiWordAudioFromSource(source, card, settings, triedUrls).catch(() => null);
  if (audio) return audio;
  }
  return null;
}
async function resolveAnkiWordAudioFromSource(source, card, settings, triedUrls) {
  const candidates = await getAudioCandidates(source, card, settings.audioTimeoutMs, settings.corsProxyUrl);
  const bagKey = getAudioBagKey(source, card);
  const shuffled = new ShuffledAudioDeck();
  for (const { candidate } of orderAudioCandidates(candidates, settings.audioSelectionMode, bagKey, shuffled)) {
  if (!registerAudioAttempt(triedUrls, candidate)) continue;
  const audio = await ankiAudioMediaFromCandidate(candidate, source.type, settings).catch(() => null);
  if (audio) return audio;
  }
  return null;
}
async function ankiAudioMediaFromCandidate(candidate, sourceType, settings) {
  if (candidate.url.startsWith("data:audio/")) return { dataUrl: candidate.url };
  if (candidate.jpdbAudioId) return { dataUrl: await jpdbAudioDataUrl(candidate.jpdbAudioId, settings) };
  try {
  const dataUrl = await fetchAudioDataUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode, settings.corsProxyUrl, settings.interfaceLanguage);
  if (dataUrl) return { dataUrl };
  } catch (error) {
  if (!canUseAnkiRemoteAudioFallback(candidate, sourceType, error)) return null;
  }
  return /^https?:\/\//i.test(candidate.url) ? { url: candidate.url } : null;
}
function canUseAnkiRemoteAudioFallback(candidate, sourceType, error) {
  if (!/^https?:\/\//i.test(candidate.url)) return false;
  if (sourceType === "jpod101" || isJapanesePod101Url(candidate.url) || isJapanesePod101Url(candidate.sourceUrl)) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/instead of audio|no audio|failed \(\d{3}\)/i.test(message)) return false;
  return true;
}
async function jpdbAudioDataUrl(audioId, settings) {
  return blobToDataUrl(await fetchJpdbAudioBlob(audioId, settings), settings.interfaceLanguage);
}
async function fetchAudioDataUrl(url, sourceUrl, timeoutMs, mode, proxyUrl, language) {
  return blobToDataUrl(await fetchAudioBlob(url, sourceUrl, timeoutMs, mode, proxyUrl, language), language);
}
function ankiMediaFilenameFromCardUrl(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("\\")) return null;
  if (/^(?:https?|data|blob|file|mailto|tel|javascript|vbscript):/i.test(trimmed)) return null;
  const filename = trimmed.split(/[?#]/, 1)[0]?.replace(/^\.\//, "") ?? "";
  if (!filename || filename.includes("..") || /^[a-z][a-z0-9+.-]*:/i.test(filename)) return null;
  try {
  return decodeURIComponent(filename);
  } catch {
  return filename;
  }
}
function buildYomuAnkiPreviewFields(card, sentence, settings, context = {}, fieldTargetPlan) {
  return yomuAnkiCompanion()?.buildYomuAnkiPreviewFields(card, sentence, settings, context, fieldTargetPlan) ?? {};
}
function canUseMobileAnkiHandoff(settings) {
  return yomuAnkiCompanion()?.canUseMobileAnkiHandoff(settings) ?? false;
}
function mobileAnkiHandoffAppName() {
  return yomuAnkiCompanion()?.mobileAnkiHandoffAppName() ?? "AnkiMobile";
}
const KANJI_STROKE_SOURCE_ID = "__kanji_stroke__";
const KANJI_JPDB_SOURCE_ID = "__kanji_jpdb__";
const KANJI_DICTIONARIES_SOURCE_ID = "__kanji_dictionaries__";
const KANJI_ORIGINS_SOURCE_ID = "__kanji_origins__";
const BUILT_IN_SOURCE_NAME_KEYS = {
  [ANKI_SOURCE_ID]: "sourceNameAnki",
  [STUDY_TRANSLATION_SOURCE_ID]: "sourceNameTranslation",
  [STUDY_GRAMMAR_SOURCE_ID]: "sourceNameGrammar",
  [IMMERSION_KIT_SOURCE_ID]: "sourceNameImmersionKit",
  [KANJI_STROKE_SOURCE_ID]: "sourceNameStrokePractice",
  [KANJI_JPDB_SOURCE_ID]: "readingsComponents",
  [KANJI_DICTIONARIES_SOURCE_ID]: "sourceNameImportedKanjiDictionaries",
  [KANJI_ORIGINS_SOURCE_ID]: "originStructure"
};
function definitionSourceRows(settings) {
  const language = settings.interfaceLanguage;
  const builtInRows = [
  {
    id: JITEN_DEFINITION_SOURCE_ID,
    name: "Jiten",
    alias: settings.jitenDefinitionsAlias,
    enabled: settings.jitenDefinitionsEnabled,
    priority: settings.jitenDefinitionsPriority,
    prefix: "jitenDefinitions",
    readonly: true,
    help: uiText(language, "sourceHelpJiten")
  },
  {
    id: JPDB_DEFINITION_SOURCE_ID,
    name: "JPDB",
    alias: settings.jpdbDefinitionsAlias,
    enabled: settings.jpdbDefinitionsEnabled,
    priority: settings.jpdbDefinitionsPriority,
    prefix: "jpdbDefinitions",
    readonly: true,
    help: uiText(language, "sourceHelpJpdb")
  },
  {
    id: BUNPRO_DEFINITION_SOURCE_ID,
    name: "Bunpro",
    alias: settings.bunproDefinitionsAlias,
    enabled: settings.bunproDefinitionsEnabled,
    priority: settings.bunproDefinitionsPriority,
    prefix: "bunproDefinitions",
    readonly: true,
    help: uiText(language, "sourceHelpBunpro")
  },
  {
    id: WANIKANI_DEFINITION_SOURCE_ID,
    name: "WaniKani",
    alias: settings.wanikaniDefinitionsAlias,
    enabled: settings.wanikaniDefinitionsEnabled,
    priority: settings.wanikaniDefinitionsPriority,
    prefix: "wanikaniDefinitions",
    readonly: true,
    help: uiText(language, "sourceHelpWanikani")
  },
  {
    id: STUDY_TRANSLATION_SOURCE_ID,
    name: uiText(language, "sourceNameTranslation"),
    alias: settings.studyTranslationAlias,
    enabled: settings.studyTranslationEnabled,
    priority: settings.studyTranslationPriority,
    prefix: "studyTranslation",
    readonly: true,
    help: uiText(language, "sourceHelpTranslation")
  },
  {
    id: ANKI_SOURCE_ID,
    name: "Anki",
    alias: settings.ankiSectionAlias,
    enabled: settings.ankiSectionEnabled,
    priority: settings.ankiSectionPriority,
    prefix: "ankiSection",
    readonly: true,
    help: uiText(language, "sourceHelpAnki")
  },
  {
    id: STUDY_GRAMMAR_SOURCE_ID,
    name: uiText(language, "sourceNameGrammar"),
    alias: settings.studyGrammarAlias,
    enabled: settings.studyGrammarEnabled,
    priority: settings.studyGrammarPriority,
    prefix: "studyGrammar",
    readonly: true,
    help: uiText(language, "sourceHelpGrammar")
  },
  {
    id: IMMERSION_KIT_SOURCE_ID,
    name: uiText(language, "sourceNameImmersionKit"),
    alias: settings.immersionKitAlias,
    enabled: settings.immersionKitEnabled,
    priority: settings.immersionKitPriority,
    prefix: "immersionKit",
    readonly: true,
    help: uiText(language, "sourceHelpImmersionKit")
  }
  ];
  return [
  ...builtInRows,
  ...settings.dictionaryPreferences.filter((preference) => {
    const type = preference.type ?? "terms";
    return type === "terms" || type === "kanji";
  }).map((preference) => ({
    id: preference.name,
    name: preference.name,
    alias: preference.alias,
    enabled: preference.enabled,
    priority: preference.priority,
    prefix: `dictionaryPreferences.${settings.dictionaryPreferences.indexOf(preference)}`,
    readonly: false,
    removable: true,
    dictionaryType: preference.type === "kanji" ? "kanji" : "terms",
    help: ""
  }))
  ].filter((row) => row.id !== IMMERSION_KIT_SOURCE_ID || settings.immersionKitEnabled).sort(compareSourceRows);
}
function definitionSourceLabel(settings, sourceId, fallback = "", language = settings.interfaceLanguage) {
  const row = definitionSourceRows(settings).find((candidate) => candidate.id === sourceId);
  return localizedSourceRowLabel(row, language) || fallback;
}
function compareSourceRows(a, b) {
  return a.priority - b.priority || a.name.localeCompare(b.name);
}
function localizedSourceRowLabel(row, language) {
  if (!row) return "";
  if (row.alias) return row.alias;
  if (row.id === KANJI_JPDB_SOURCE_ID && row.name !== uiText(language, "readingsComponents")) return row.name;
  const key = builtInSourceNameKey(row.id);
  return key ? uiText(language, key) : row.name;
}
function builtInSourceNameKey(sourceId) {
  return BUILT_IN_SOURCE_NAME_KEYS[sourceId];
}
function ankiDetailsStateAttributes(options, key, initiallyOpen) {
  return options.sourceAttributes ? options.sourceAttributes(key, initiallyOpen) : initiallyOpen ? "open" : "";
}
function ankiDeckSourceStateKey(note) {
  return `${ANKI_SOURCE_ID}:deck:${note.deckNames.join("/") || note.modelName}`;
}
const POPOVER_ANKI_SANITIZE = {
  maxFontPx: 30,
  maxFontPt: 22,
  maxFontRelative: 1.8
};
const STUDY_ANKI_SANITIZE = {
  maxFontPx: 52,
  maxFontPt: 39,
  maxFontRelative: 3.1
};
const CONTEXT_SOURCE_LABEL_KEYS = {
  video: "contextVideo",
  image: "contextImage"
};
function renderAnkiActionRow(ankiLookup, settings) {
  if (!settings.ankiEnabled) return "";
  if (ankiLookup.primary) return "";
  if (ankiLookup.state !== "not-in-deck") return "";
  const mobileHandoff = shouldRenderMobileAnkiHandoffAction(ankiLookup, settings);
  if (!mobileHandoff && ankiLookup.trusted === false) return "";
  const label = mobileHandoff ? mobileAnkiHandoffButtonLabel(settings.interfaceLanguage) : uiText(settings.interfaceLanguage, "addToAnki");
  return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${escapeHtml$1(label)}</button></div>`;
}
function mobileAnkiHandoffButtonLabel(language) {
  const app = mobileAnkiHandoffAppName();
  return language === "ja" ? formatUiText(language, "sendToMobileAnki", { app }) : ["Send", "to", app].join(" ");
}
function shouldRenderMobileAnkiHandoffAction(ankiLookup, settings) {
  return canUseMobileAnkiHandoff(settings) && !ankiLookup.primary;
}
function renderAnkiExistingSection(ankiLookup, storedContext, settings, options = {}) {
  if (!settings.ankiEnabled || !settings.ankiSectionEnabled) return "";
  const notes = orderedExistingAnkiNotes(ankiLookup);
  const primary = notes[0];
  if (!primary) return "";
  const language = settings.interfaceLanguage;
  const aggregateState = ankiLookup.state;
  const summary = ankiExistingSectionSummary(primary, notes.length, language, aggregateState);
  const title = definitionSourceLabel(settings, ANKI_SOURCE_ID, "Anki");
  return `
    <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing" ${ankiDetailsStateAttributes(options, ANKI_SOURCE_ID, true)}>
        <summary class="jpdb-reader-local-title">
            <span><span class="jpdb-reader-state-dot anki-${aggregateState}"></span>${escapeHtml$1(title)}${notes.length > 1 ? ` (${notes.length})` : ""}</span>
            <small class="jpdb-reader-source-status">${escapeHtml$1(summary)}</small>
        </summary>
        ${notes.length > 1 ? renderAnkiCollisionSummary(notes, language) : ""}
        ${notes.length === 1 ? renderAnkiExistingNote(primary, storedContext, settings, false, true, options) : notes.map((note, index) => renderAnkiExistingNote(note, index === 0 ? storedContext : null, settings, true, index === 0, options)).join("")}
    </details>
  `;
}
function renderAnkiNewCardPreview(card, sentence, settings, context = {}, fieldTargetPlan) {
  if (!settings.ankiEnabled || !settings.ankiSectionEnabled) return "";
  const fields = buildYomuAnkiPreviewFields(card, sentence ?? card.sentence ?? "", settings, context, fieldTargetPlan);
  const fieldPreview = renderAnkiPreviewFields(fields, settings.interfaceLanguage, { renderHtml: true });
  if (!fieldPreview) return "";
  const title = definitionSourceLabel(settings, ANKI_SOURCE_ID, "Anki");
  return `
    <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing jpdb-reader-anki-new">
        <summary class="jpdb-reader-local-title">
            <span><span class="jpdb-reader-state-dot anki-not-in-deck"></span>${escapeHtml$1(title)}</span>
            <small class="jpdb-reader-source-status">${escapeHtml$1(ankiNewCardSummary(settings))}</small>
        </summary>
        <div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview">
            ${fieldPreview}
        </div>
    </details>
  `;
}
function orderedExistingAnkiNotes(ankiLookup) {
  const notes = [];
  const seen = /* @__PURE__ */ new Set();
  appendUniqueAnkiNote(notes, seen, ankiLookup.primary);
  (ankiLookup.notes ?? []).forEach((note) => appendUniqueAnkiNote(notes, seen, note));
  return notes;
}
function appendUniqueAnkiNote(notes, seen, note) {
  if (!note) return;
  const key = ankiNoteKey(note);
  if (seen.has(key)) return;
  seen.add(key);
  notes.push(note);
}
function ankiNoteKey(note) {
  if (Number.isFinite(note.noteId) && note.noteId > 0) return `note:${note.noteId}`;
  return `${note.modelName}:${note.primaryCardId || note.cardIds.join(",")}:${note.deckNames.join(",")}`;
}
function ankiExistingSectionSummary(primary, count, language, aggregateState) {
  const summary = ankiExistingAggregateSummary(primary, aggregateState, language);
  return count > 1 ? `${summary} · ${count} matches` : summary;
}
function renderAnkiCollisionSummary(notes, language) {
  return `<div class="jpdb-reader-anki-match-summary" aria-label="${escapeHtml$1(uiText(language, "ankiMatches"))}">
    ${notes.map((note) => `<div class="jpdb-reader-anki-match-summary-row">
        <span><span class="jpdb-reader-state-dot anki-${note.state}"></span>${escapeHtml$1(ankiNoteIdentityLabel(note, language))}</span>
        <small>${escapeHtml$1(ankiExistingSummary(note, language))}</small>
    </div>`).join("")}
  </div>`;
}
function renderAnkiExistingNote(note, storedContext, settings, collapsible, open, options) {
  const language = settings.interfaceLanguage;
  const preview = ankiExistingPreview(note, storedContext, language);
  const content = `<div class="jpdb-reader-anki-existing-note-body">
    ${preview.renderedCard}
    ${preview.fields}
    ${preview.pending}
    ${preview.context}
    ${renderAnkiNoteActions(note, language)}
    ${!options.suppressReviewButtons && settings.enableReviews && note.primaryCardId ? renderReviewButtons(settings, note, { targetLabel: ankiCardReviewTargetLabel(note, language) }) : ""}
  </div>`;
  if (!collapsible) {
  return `<div class="jpdb-reader-local-entry jpdb-reader-anki-card-preview" data-anki-note-id="${note.noteId}">
    ${content}
  </div>`;
  }
  return `<details class="jpdb-reader-local-entry jpdb-reader-anki-card-preview jpdb-reader-anki-existing-note" data-anki-note-id="${note.noteId}" ${ankiDetailsStateAttributes(options, ankiDeckSourceStateKey(note), open)}>
    <summary class="jpdb-reader-anki-existing-note-title">
        <span><span class="jpdb-reader-state-dot anki-${note.state}"></span><strong>${escapeHtml$1(ankiNoteIdentityLabel(note, language))}</strong></span>
        <small>${escapeHtml$1(preview.summary)}</small>
    </summary>
    ${content}
  </details>`;
}
function ankiNewCardSummary(settings) {
  return [
  uiText(settings.interfaceLanguage, "ankiNewCard"),
  settings.ankiDeck.trim() || "よむ",
  settings.ankiModel.trim() || "よむ Japanese"
  ].filter(Boolean).join(" · ");
}
function ankiExistingPreview(note, storedContext, language) {
  const renderedCard = renderAnkiRenderedCard(note, language);
  const fields = renderedCard ? "" : renderAnkiStoredFieldsFallback(note, language);
  return {
  summary: ankiExistingSummary(note, language),
  renderedCard,
  fields,
  pending: renderedCard || fields ? "" : renderAnkiDetailsStatus(note, language),
  context: storedContext ? renderLastMiningContext(storedContext, language) : ""
  };
}
function renderAnkiDetailsStatus(note, language) {
  const key = note.detailsUnavailable ? "ankiCardDetailsUnavailable" : "ankiCardDetailsPending";
  return `<div class="jpdb-reader-help jpdb-reader-anki-details-pending" role="status">${escapeHtml$1(uiText(language, key))}</div>`;
}
function renderAnkiStoredFieldsFallback(note, language) {
  const fields = renderAnkiFields(note, language);
  if (!fields) return "";
  return `<details class="jpdb-reader-anki-stored-fields" open>
    <summary>${escapeHtml$1(uiText(language, "ankiStoredFields"))}</summary>
    ${fields}
  </details>`;
}
function ankiExistingSummary(note, language) {
  return [
  ankiStateLabel(note.state, language),
  note.deckNames.length ? note.deckNames.join(", ") : "",
  ankiReviewMetricsLabel(note, language)
  ].filter(Boolean).join(" · ") || "Anki";
}
function ankiExistingAggregateSummary(primary, aggregateState, language) {
  return [
  ankiStateLabel(aggregateState, language),
  primary.deckNames.length ? primary.deckNames.join(", ") : "",
  ankiReviewMetricsLabel(primary, language)
  ].filter(Boolean).join(" · ") || "Anki";
}
function ankiNoteIdentityLabel(note, language) {
  return [
  note.deckNames.length ? note.deckNames.join(", ") : "",
  note.modelName,
  ankiNoteKindLabel(note, language)
  ].filter(Boolean).join(" · ") || "Anki";
}
function ankiNoteKindLabel(note, language) {
  const fields = Object.keys(note.fields).map((name) => name.replace(/[_\s-]+/g, "").toLowerCase());
  const model = note.modelName.replace(/[_\s-]+/g, "").toLowerCase();
  if (fields.some((name) => /^(?:kanji|keyword|onyomi|kunyomi|on|kun|heisig|frame(?:no|number)?|stroke(?:order|diagram|count)?)$/.test(name)) || /(?:rtk|heisig|kanji)/.test(model)) {
  return uiText(language, "kanji");
  }
  if (fields.some((name) => /^(?:katakana|hiragana|kana|mnemonic)$/.test(name))) return language === "ja" ? "かな" : "Kana";
  if (fields.some((name) => /sentence|selectiontext|contextsentence/.test(name))) return language === "ja" ? "文" : "Sentence";
  return uiText(language, "word");
}
function ankiReviewMetricsLabel(note, language) {
  const parts = [
  note.reps ? `${note.reps} ${uiText(language, note.reps === 1 ? "ankiReviewSingular" : "ankiReviewPlural")}` : "",
  note.lapses ? `${note.lapses} ${uiText(language, note.lapses === 1 ? "ankiLapseSingular" : "ankiLapsePlural")}` : ""
  ].filter(Boolean);
  return parts.join(", ");
}
function ankiStateLabel(state, language) {
  return cardStateLabel(state, language);
}
function renderAnkiRenderedCard(note, language) {
  const cards = orderedRenderedCards(note);
  if (!cards.length) return "";
  return cards.map((card, index) => renderAnkiRenderedCardPreview(note, card, language, cards.length > 1, index)).join("");
}
function renderAnkiRenderedCardPreview(note, card, language, showHeading, index) {
  const soundFilenames = ankiSoundFilenames(note);
  const sides = renderAnkiRenderedSides(card, soundFilenames, language);
  if (!sides.length) return "";
  const content = sides.join("");
  if (!showHeading) {
  return `<div class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="${card.cardId}">${content}</div>`;
  }
  const title = renderedCardTitle(card, index);
  return `<details class="jpdb-reader-anki-rendered-card" data-anki-rendered-card-id="${card.cardId}"${index === 0 ? " open" : ""}>
    <summary class="jpdb-reader-anki-rendered-card-title" title="${escapeHtml$1(title)}">${escapeHtml$1(title)}</summary>
    ${content}
  </details>`;
}
function orderedRenderedCards(note) {
  const cards = note.renderedCards ?? [];
  const primary = cards.find((card) => card.cardId === note.primaryCardId);
  return primary ? [primary, ...cards.filter((card) => card.cardId !== primary.cardId)] : cards;
}
function renderedCardTitle(card, index) {
  if (card.cardName) return [card.deckName, card.cardName].filter(Boolean).join(" · ");
  return [card.deckName, `Card ${index + 1}`].filter(Boolean).join(" · ");
}
function renderAnkiRenderedSides(card, soundFilenames, language, options = POPOVER_ANKI_SANITIZE) {
  const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls, options);
  const answerHtml = sanitizeAnkiCardHtml(card.answer, soundFilenames, language, card.mediaDataUrls, options);
  const question = renderAnkiRenderedSideBody(questionHtml);
  const answer = renderAnkiRenderedSideBody(answerHtml);
  if (!question) return answer ? [answer] : [];
  if (!answer) return [question];
  if (renderedAnkiAnswerIncludesQuestion(questionHtml, answerHtml)) return [answer];
  return [question, answer];
}
function renderAnkiRenderedSideBody(html) {
  if (!html || !hasRenderableAnkiCardContent(html)) return "";
  return `<section class="jpdb-reader-anki-rendered-side">
    <div class="jpdb-reader-anki-rendered-side-body jpdb-reader-parseable">${pruneRedundantAnkiGlyphRepeats(html)}</div>
  </section>`;
}
function pruneRedundantAnkiGlyphRepeats(html) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  setInnerHtml(template, html);
  template.content.querySelectorAll("tts").forEach((element) => element.remove());
  const seen = /* @__PURE__ */ new Set();
  const removable = [];
  for (const element of Array.from(template.content.querySelectorAll("span, font, b, strong, div"))) {
  if (element.children.length > 0) continue;
  const text = element.textContent?.replace(/\s+/g, "") ?? "";
  if (!text || text.length > 4 || !JAPANESE_GLYPH_RUN_RE.test(text)) continue;
  if (seen.has(text)) removable.push(element);
  else seen.add(text);
  }
  for (const element of removable) {
  const before = element.previousSibling;
  if (before?.nodeType === Node.TEXT_NODE && !before.textContent?.trim()) before.remove();
  element.remove();
  }
  template.content.querySelectorAll("br + br").forEach((element) => element.remove());
  let last = template.content.lastChild;
  while (last && (last.nodeType === Node.TEXT_NODE && !last.textContent?.trim() || last instanceof Element && last.tagName === "BR")) {
  const previous = last.previousSibling;
  last.remove();
  last = previous;
  }
  return template.innerHTML;
}
const JAPANESE_GLYPH_RUN_RE = /^[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\u3005\u3006\u30f6]+$/;
function renderAnkiRenderedCardStudyBody(card, revealed, language, soundFilenames = []) {
  const questionHtml = sanitizeAnkiCardHtml(card.question, soundFilenames, language, card.mediaDataUrls, STUDY_ANKI_SANITIZE);
  const question = renderAnkiRenderedSideBody(questionHtml);
  const sides = revealed ? renderAnkiRenderedSides(card, soundFilenames, language, STUDY_ANKI_SANITIZE) : [question].filter(Boolean);
  if (!sides.length) return "";
  return `<div class="jpdb-reader-anki-rendered-card jpdb-reader-anki-study-card" data-anki-rendered-card-id="${card.cardId}">${sides.join("")}</div>`;
}
function renderedAnkiAnswerIncludesQuestion(questionHtml, answerHtml) {
  const question = normalizedAnkiRenderedText(questionHtml);
  const answer = normalizedAnkiRenderedText(answerHtml);
  if (!question || !answer) return false;
  if (answer === question) return true;
  if (!answer.startsWith(question)) return false;
  const remainder = answer.slice(question.length).trim();
  return Boolean(remainder);
}
function normalizedAnkiRenderedText(html) {
  if (typeof document === "undefined") return html.replace(/\s+/g, " ").trim();
  return parseHtmlDocument(html).body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
function hasRenderableAnkiCardContent(html) {
  if (typeof document === "undefined") return Boolean(html.trim());
  const body = parseHtmlDocument(html).body;
  const text = body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text) return true;
  return Boolean(body.querySelector([
  "img[src]",
  "audio[src]",
  "audio source[src]",
  "video[src]",
  "video source[src]",
  "svg",
  "canvas",
  "[data-anki-media-name]",
  ".jpdb-reader-anki-sound"
  ].join(",")));
}
function renderAnkiFields(note, language) {
  return renderAnkiPreviewFields(note.fields, language);
}
function renderAnkiPreviewFields(fieldsByName, language, options = {}) {
  const fields = Object.entries(fieldsByName).map(([name, value]) => ({ name, value: value.trim() })).filter((field) => field.value).slice(0, 14);
  if (!fields.length) return "";
  return `<div class="jpdb-reader-anki-fields">
    ${fields.map((field) => previewField(field.name, field.value, language, options)).join("")}
  </div>`;
}
function previewField(label, value, language, options = {}) {
  return `<div class="jpdb-reader-anki-field"><strong title="${escapeHtml$1(label)}">${escapeHtml$1(displayAnkiFieldLabel(label))}</strong><span>${renderFieldText(value, language, options)}</span></div>`;
}
function renderFieldText(value, language, options = {}) {
  const html = options.renderHtml ? sanitizeAnkiCardHtml(value, [], language) : escapeHtml$1(value);
  return html.replace(
  /\[sound:([^\]]+)]/gi,
  (_, filename) => renderAnkiSoundChip(filename, language)
  );
}
function renderAnkiSoundChip(filename, language) {
  const title = ankiAudioLabel(filename, language);
  return `<button class="jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-audio-control" type="button" data-action="anki-media-audio" data-anki-media-name="${escapeHtml$1(filename)}" title="${escapeHtml$1(title)}" aria-label="${escapeHtml$1(title)}">${speakerIcon()}</button>`;
}
function renderAnkiNoteActions(note, language) {
  if (!Number.isFinite(note.noteId) || note.noteId <= 0) return "";
  return `<div class="jpdb-reader-anki-note-actions">
    ${renderAnkiAudioMergeSelect(note, language)}
    <div class="jpdb-reader-anki-note-action-row">
        <button class="jpdb-reader-btn anki compact" data-action="anki-merge" data-note-id="${note.noteId}" title="${escapeHtml$1(uiText(language, "mergeYomuTitle"))}">${escapeHtml$1(uiText(language, "mergeYomu"))}</button>
        <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${note.noteId}">${escapeHtml$1(uiText(language, "editInAnki"))}</button>
    </div>
  </div>`;
}
function renderAnkiAudioMergeSelect(note, language) {
  if (!noteHasAudio(note)) return "";
  return `<label class="jpdb-reader-anki-audio-merge">
    <span>${escapeHtml$1(uiText(language, "audio"))}</span>
    <select data-anki-audio-merge>
        <option value="both">${escapeHtml$1(uiText(language, "keepBothAudio"))}</option>
        <option value="theirs">${escapeHtml$1(uiText(language, "keepAnkiAudio"))}</option>
        <option value="ours">${escapeHtml$1(uiText(language, "useYomuAudio"))}</option>
    </select>
  </label>`;
}
function noteHasAudio(note) {
  return Object.entries(note.fields).some(
  ([name, value]) => /audio|sound|voice|pronunciation/i.test(name) || /\[sound:[^\]]+]/i.test(value)
  );
}
function sanitizeAnkiCardHtml(value, soundFilenames, language, mediaDataUrls = {}, options = POPOVER_ANKI_SANITIZE) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof document === "undefined") return escapeHtml$1(trimmed);
  const template = ankiCardTemplate(trimmed);
  sanitizeAnkiCardFragment(template.content, mediaDataUrls, options);
  installAnkiMediaFallbackButtons(template.content, language, ankiPlaybackMarkerFilenames(template.content, soundFilenames));
  replaceAnkiSoundMarkers(template.content, language);
  replaceAnkiPlaybackMarkers(template.content, soundFilenames, language);
  return template.innerHTML.trim();
}
function sanitizeAnkiCardFragment(fragment, mediaDataUrls, options) {
  fragment.querySelectorAll("script, style, link, iframe, object, embed, base, meta").forEach((node) => node.remove());
  unwrapAnkiCardRuby(fragment);
  fragment.querySelectorAll("*").forEach((node) => sanitizeAnkiCardElement(node, mediaDataUrls, options));
}
function unwrapAnkiCardRuby(fragment) {
  fragment.querySelectorAll("ruby").forEach((ruby) => {
  ruby.querySelectorAll("rt, rp").forEach((node) => node.remove());
  ruby.replaceWith(...Array.from(ruby.childNodes));
  });
  stripAnkiBracketFurigana(fragment);
}
const ANKI_BRACKET_FURIGANA_RE = / ?([㐀-鿿々-〇]+)\[([぀-ヿー・]+)\]/gu;
function stripAnkiBracketFurigana(fragment) {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  const text = node.nodeValue ?? "";
  if (!text.includes("[")) continue;
  const replaced = text.replace(ANKI_BRACKET_FURIGANA_RE, "$1");
  if (replaced !== text) node.nodeValue = replaced;
  }
}
function sanitizeAnkiCardElement(element, mediaDataUrls, options) {
  for (const attr of Array.from(element.attributes)) {
  if (shouldRemoveAnkiCardAttribute(attr.name, attr.value)) {
    element.removeAttribute(attr.name);
    continue;
  }
  rewriteAnkiCardMediaAttribute(element, attr.name, attr.value, mediaDataUrls);
  }
  sanitizeAnkiCardInlineStyle(element, options);
}
function rewriteAnkiCardMediaAttribute(element, name, value, mediaDataUrls) {
  if (!["src", "poster", "xlink:href"].includes(name.toLowerCase())) return;
  const filename = ankiMediaFilenameFromCardUrl(value);
  if (!filename) return;
  const dataUrl = mediaDataUrls[filename] ?? mediaDataUrls[value.trim()];
  element.setAttribute("data-anki-media-name", filename);
  if (dataUrl) element.setAttribute(name, dataUrl);
}
function sanitizeAnkiCardInlineStyle(element, options) {
  if (!(element instanceof HTMLElement)) return;
  const originalStyle = element.getAttribute("style");
  if (!originalStyle) return;
  if (/(?:^|;)\s*font\s*:/i.test(originalStyle)) {
  element.setAttribute("style", capFontShorthandDeclarations(originalStyle, options));
  }
  if (/(?:^|;)\s*font-size\s*:/i.test(element.getAttribute("style") ?? "")) {
  element.setAttribute("style", capFontSizeDeclarations(element.getAttribute("style") ?? "", options));
  }
  removeNestedScrollInlineStyle(element);
  if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
}
function removeNestedScrollInlineStyle(element) {
  ["max-height", "overflow", "overflow-x", "overflow-y", "overscroll-behavior", "overscroll-behavior-x", "overscroll-behavior-y"].forEach((property) => element.style.removeProperty(property));
}
function capFontShorthandDeclarations(style, options) {
  return style.replace(/(^|;)(\s*font\s*:\s*)([^;]+)/gi, (_, separator, prefix, value) => {
  return `${separator}${prefix}${capFontShorthandValue(value, options)}`;
  });
}
function capFontShorthandValue(value, options) {
  return capFontLengthTokens(value, options);
}
function capFontSizeDeclarations(style, options) {
  return style.replace(/(^|;)(\s*font-size\s*:\s*)([^;]+)/gi, (_, separator, prefix, value) => {
  return `${separator}${prefix}${cappedFontSizeValue(value, options)}`;
  });
}
function cappedFontSizeValue(rawValue, options) {
  const value = rawValue.trim();
  const match = /^([\d.]+)\s*(px|pt|em|rem)$/i.exec(value);
  if (!match) return value;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return value;
  if (unit === "px") return `${Math.min(amount, options.maxFontPx)}px`;
  if (unit === "pt") return `${Math.min(amount, options.maxFontPt)}pt`;
  if (unit === "em" || unit === "rem") return `${Math.min(amount, options.maxFontRelative)}${unit}`;
  return value;
}
function capFontLengthTokens(value, options) {
  const capped = value.replace(/(\d+(?:\.\d+)?)(\s*)(px|pt|em|rem)\b/gi, (match, amount, _space, unit) => {
  const cappedValue = cappedFontSizeValue(`${amount}${unit}`, options);
  return cappedValue || match;
  });
  return shouldWrapViewportFontSize(capped) ? `min(${capped}, ${options.maxFontPx}px)` : capped;
}
function shouldWrapViewportFontSize(value) {
  const trimmed = value.trim();
  if (/^(?:clamp|min)\(/i.test(trimmed)) return false;
  return /\b\d+(?:\.\d+)?\s*(?:vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i.test(trimmed) || /^calc\(/i.test(trimmed) || /^max\(/i.test(trimmed);
}
function installAnkiMediaFallbackButtons(root, language, playbackMarkerFilenames = /* @__PURE__ */ new Set()) {
  root.querySelectorAll("audio, video").forEach((media) => {
  const filename = ankiMediaFilenameFromElement(media);
  if (!filename) return;
  media.setAttribute("controls", "");
  if (media.tagName === "AUDIO" && playbackMarkerFilenames.has(filename)) return;
  const template = ankiCardTemplate(renderAnkiSoundChip(filename, language));
  media.before(template.content);
  });
}
function ankiMediaFilenameFromElement(media) {
  const own = media.getAttribute("data-anki-media-name") || ankiMediaFilenameFromCardUrl(media.getAttribute("src") ?? "");
  if (own) return own;
  return Array.from(media.querySelectorAll("source")).map((source) => source.getAttribute("data-anki-media-name") || ankiMediaFilenameFromCardUrl(source.getAttribute("src") ?? "")).find(Boolean) ?? "";
}
function replaceAnkiSoundMarkers(root, language) {
  replaceAnkiTextMarkers(root, /\[sound:[^\]]+]/gi, (marker) => {
  const match = /^\[sound:([^\]]+)]$/i.exec(marker);
  return match ? ankiSoundMarkerNode(match[1], language) : null;
  });
}
function replaceAnkiPlaybackMarkers(root, soundFilenames, language) {
  replaceAnkiTextMarkers(root, /\[anki:play:[^\]]+]/gi, (marker) => ankiPlaybackMarkerNode(marker, soundFilenames, language));
}
function ankiPlaybackMarkerFilenames(root, soundFilenames) {
  const filenames = /* @__PURE__ */ new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
  const text = walker.currentNode.textContent ?? "";
  for (const match of text.matchAll(/\[anki:play:[^\]]+]/gi)) {
    const filename = ankiPlaybackMarkerFilename(match[0], soundFilenames);
    if (filename) filenames.add(filename);
  }
  }
  return filenames;
}
function replaceAnkiTextMarkers(root, pattern, markerNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => replaceAnkiTextMarkerNode(node, pattern, markerNode));
}
function replaceAnkiTextMarkerNode(node, pattern, markerNode) {
  const parts = node.textContent?.split(new RegExp(`(${pattern.source})`, pattern.flags)) ?? [];
  if (parts.length < 2) return;
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
  if (!part) continue;
  fragment.append(markerNode(part) ?? document.createTextNode(part));
  }
  node.replaceWith(fragment);
}
function ankiSoundMarkerNode(value, language) {
  const filename = value.trim();
  if (!filename) return null;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-audio-control";
  chip.dataset.action = "anki-media-audio";
  chip.dataset.ankiMediaName = filename;
  chip.title = ankiAudioLabel(filename, language);
  chip.setAttribute("aria-label", chip.title);
  setInnerHtml(chip, speakerIcon());
  return chip;
}
function ankiPlaybackMarkerNode(value, soundFilenames, language) {
  const audioIndex = ankiPlaybackMarkerIndex(value);
  if (audioIndex === null) return null;
  const filename = ankiPlaybackMarkerFilenameAtIndex(soundFilenames, audioIndex);
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "jpdb-reader-icon-mini jpdb-reader-anki-sound jpdb-reader-anki-playback-marker jpdb-reader-audio-control";
  chip.dataset.action = "anki-media-audio";
  if (filename) chip.dataset.ankiMediaName = filename;
  chip.title = filename ? ankiAudioLabel(filename, language) : uiText(language, "ankiAudioUnavailablePreview");
  chip.setAttribute("aria-label", chip.title);
  chip.disabled = !filename;
  setInnerHtml(chip, speakerIcon());
  return chip;
}
function ankiPlaybackMarkerFilename(value, soundFilenames) {
  const audioIndex = ankiPlaybackMarkerIndex(value);
  return audioIndex === null ? "" : ankiPlaybackMarkerFilenameAtIndex(soundFilenames, audioIndex);
}
function ankiCardTemplate(html) {
  const template = document.createElement("template");
  const body = parseHtmlDocument(html).body;
  for (const node of Array.from(body.childNodes)) {
  template.content.append(document.importNode(node, true));
  }
  return template;
}
function ankiPlaybackMarkerIndex(value) {
  const match = /^\[anki:play:[^:\]]+:(\d+)]$/i.exec(value);
  return match ? Number(match[1]) : null;
}
function ankiPlaybackMarkerFilenameAtIndex(soundFilenames, index) {
  return soundFilenames[index] ?? soundFilenames[0] ?? "";
}
function ankiSoundFilenames(note) {
  const filenames = Object.values(note.fields).flatMap((value) => Array.from(value.matchAll(/\[sound:([^\]]+)]/gi), (match) => match[1]?.trim() ?? "")).filter(Boolean);
  return [...new Set(filenames)];
}
function shouldRemoveAnkiCardAttribute(name, value) {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith("on") || lowerName === "srcdoc") return true;
  if (!["href", "src", "poster", "xlink:href"].includes(lowerName)) return false;
  return isUnsafeAnkiCardUrl(value);
}
function isUnsafeAnkiCardUrl(value) {
  const trimmed = value.trim();
  return /^(javascript|vbscript):/i.test(trimmed) || /^data:text\/html/i.test(trimmed);
}
function renderLastMiningContext(context, language) {
  return `<div class="jpdb-reader-anki-context"><strong>${escapeHtml$1(uiText(language, "lastSeen"))}</strong><span>${escapeHtml$1(localizedContextLabel(context, language))}</span><small>${escapeHtml$1(context.sentence)}</small></div>`;
}
function localizedContextLabel(context, language) {
  const immersionLabel = localizedImmersionContextLabel(context);
  if (immersionLabel) return immersionLabel;
  const sourceLabel = localizedContextSourceLabel(context, language);
  if (sourceLabel) return `${sourceLabel}: ${context.sourceTitle}`;
  return context.sourceTitle || context.sourceUrl || uiText(language, "contextCurrentPage");
}
function localizedImmersionContextLabel(context) {
  return context.sourceKind === "immersion-kit" && context.immersionIndex !== void 0 && context.immersionTotal ? `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}` : "";
}
function localizedContextSourceLabel(context, language) {
  if (!context.sourceTitle) return "";
  if (context.sourceKind === "jpdb") return "JPDB";
  const labelKey = CONTEXT_SOURCE_LABEL_KEYS[context.sourceKind];
  return labelKey ? uiText(language, labelKey) : "";
}
function renderReviewButtons(settings, ankiNote = null, options = {}) {
  const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : "";
  const grades = reviewButtonGrades(settings);
  const target = options.targetLabel ? `<div class="jpdb-reader-review-target">${escapeHtml$1(options.targetLabel)}</div>` : "";
  const intervals = options.intervals ?? ankiNote?.reviewGradeIntervals;
  const intervalSpan = (grade) => {
  const interval = intervals?.[grade];
  const label = interval?.buttonLabel || interval?.intervalLabel || "";
  return label ? `<span class="jpdb-reader-grade-interval">${escapeHtml$1(label)}</span>` : "";
  };
  return `
    ${target}
    <div class="jpdb-reader-row${grades.length === 5 ? " jpdb-reader-grades" : ""}" style="--cols: ${grades.length}">
        ${grades.map(([grade, label]) => `<button class="jpdb-reader-btn ${grade}" data-action="grade" data-grade="${grade}"${ankiAttrs}${reviewButtonAttrs(options, label, settings.interfaceLanguage)}>${label}${intervalSpan(grade)}</button>`).join("")}
    </div>
  `;
}
function reviewButtonAttrs(options, buttonLabel, language) {
  const title = options.title || options.targetLabel || "";
  const disabled = options.disabled ? ` disabled` : "";
  const titleAttr = options.disabled || title ? ` title="${escapeHtml$1(options.disabled ? title || uiText(language, "unavailable") : title)}"` : "";
  const aria = title ? ` aria-label="${escapeHtml$1(`${buttonLabel}: ${title}`)}"` : "";
  return `${disabled}${titleAttr}${aria}`;
}
function reviewButtonGrades(settings) {
  const language = settings.interfaceLanguage;
  return settings.twoButtonReviews ? [["fail", uiText(language, "gradeFailLabel")], ["pass", uiText(language, "gradePassLabel")]] : [["nothing", uiText(language, "gradeNothingLabel")], ["something", uiText(language, "gradeSomethingLabel")], ["hard", uiText(language, "gradeHardLabel")], ["okay", uiText(language, "gradeOkayLabel")], ["easy", uiText(language, "gradeEasyLabel")]];
}
function ankiAudioLabel(filename, language) {
  return filename ? formatUiText(language, "ankiAudioFilenameLabel", { filename }) : uiText(language, "audio");
}
function ankiCardReviewTargetLabel(note, language) {
  const target = ankiCardReviewTargetName(note);
  return formatUiText(language, "gradeAnkiCardTarget", { target });
}
function ankiCardReviewTargetName(note) {
  const primaryCard = primaryRenderedAnkiCard(note);
  const deck = ankiReviewTargetDeck(note, primaryCard);
  const cardLabel = ankiReviewTargetCardLabel(note, primaryCard);
  return cardLabel.includes("#") || primaryCard?.cardName ? [deck, cardLabel].filter(Boolean).join(primaryCard?.cardName ? " · " : " ") : deck;
}
function primaryRenderedAnkiCard(note) {
  if (!note.primaryCardId) return null;
  return note.renderedCards?.find((card) => card.cardId === note.primaryCardId) ?? null;
}
function ankiReviewTargetDeck(note, primaryCard) {
  return primaryCard?.deckName || note.deckNames.join(", ") || note.modelName || "Anki";
}
function ankiReviewTargetCardLabel(note, primaryCard) {
  const cardId = note.primaryCardId ? `#${note.primaryCardId}` : "";
  return primaryCard?.cardName ? `${primaryCard.cardName} ${cardId}`.trim() : cardId;
}
function displayAnkiFieldLabel(label) {
  const cleaned = label.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return label;
  if (!/^[A-Z0-9\s]+$/.test(cleaned) || !/[A-Z]/.test(cleaned)) return cleaned;
  return cleaned.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}
registerYomuCompanion("anki", {
  AnkiConnectClient,
  AnkiDuplicateNoteError,
  ankiLookupWithUnavailableDetails,
  buildYomuAnkiFields,
  buildYomuAnkiPreviewFields: buildYomuAnkiPreviewFields$1,
  canUseMobileAnkiHandoff: canUseMobileAnkiHandoff$1,
  captureActiveVideoFrame,
  isAnkiDuplicateNoteError,
  mobileAnkiHandoffAppName: mobileAnkiHandoffAppName$1,
  resolveAnkiWordAudio,
  renderAnkiActionRow,
  renderAnkiExistingSection,
  renderAnkiNewCardPreview,
  pruneRedundantAnkiGlyphRepeats,
  renderAnkiRenderedCardStudyBody,
  renderReviewButtons,
  reviewButtonGrades
});
})();
