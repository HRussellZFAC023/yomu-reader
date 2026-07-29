(function() {
  "use strict";
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_ORIGIN = "https://yomureader.com";
  const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
  const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
  const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
  const WANIKANI_DEFINITION_SOURCE_ID = "__wanikani__";
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
        const attempt = fetchAttemptForCandidate(targetUrl, candidate, options);
        const response = await fetchWithTimeout(attempt.url, attempt.options);
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
    try {
      return source[key];
    } catch {
      return void 0;
    }
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
    try {
      const target = window.wrappedJSObject || window;
      Object.defineProperty(target, key, pageCompartmentDescriptor(normalizedPropertyDescriptor(descriptor), target));
    } catch {
    }
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
    try {
      return typeof descriptor.value !== "function";
    } catch {
      return false;
    }
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
  function isManagedStorageKey(key) {
    return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  function isPrivateManagedStorageKey(key) {
    return key.startsWith("yomu:private:");
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
      listValues: () => storageBridgeRequest({ op: "list" }).then((detail) => detail.keys ?? [])
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
    const record = detail;
    if (typeof record.id !== "string" || typeof record.ok !== "boolean") return void 0;
    return {
      id: record.id,
      ok: record.ok,
      found: typeof record.found === "boolean" ? record.found : void 0,
      value: record.value,
      keys: Array.isArray(record.keys) ? record.keys.filter((key) => typeof key === "string") : void 0,
      message: typeof record.message === "string" ? record.message : void 0
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
  const WANIKANI_API_BASE_URL = "https://api.wanikani.com/v2";
  const WANIKANI_REVISION = "20170710";
  const REQUEST_TIMEOUT_MS = 3e4;
  const FREE_TIER_MAX_LEVEL = 3;
  class WanikaniApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "WanikaniApiError";
    }
  }
  const MIN_REQUEST_INTERVAL_MS = 1100;
  function fingerprintWanikaniToken(value) {
    const token = value.trim();
    if (!token) return "";
    let first = 2166136261;
    let second = 2654435769;
    for (let index = 0; index < token.length; index += 1) {
      const code = token.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619) >>> 0;
      second = Math.imul(second ^ code, 2246822507) >>> 0;
    }
    return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}:${token.length}`;
  }
  class WanikaniClient {
    getToken;
    baseUrl;
    requestImpl;
    timeoutMs;
    minRequestIntervalMs;
    now;
    sleep;
    lastRequestAt = 0;
    requestStartQueue = Promise.resolve();
    pending = /* @__PURE__ */ new Map();
    responseCache = /* @__PURE__ */ new Map();
    verifiedUser = null;
    verifiedFingerprint = "";
    constructor(options = {}) {
      this.getToken = options.getToken ?? (() => "");
      this.baseUrl = trimBaseUrl(options.baseUrl ?? WANIKANI_API_BASE_URL);
      this.requestImpl = options.requestImpl ?? requestHttp;
      this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
      this.minRequestIntervalMs = Math.max(0, options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS);
      this.now = options.now ?? Date.now;
      this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    }
    hasCredential() {
      return Boolean(this.getToken().trim());
    }
    tokenFingerprint() {
      return fingerprintWanikaniToken(this.getToken());
    }
    async getUser(force = false) {
      const fingerprint = this.currentFingerprint();
      if (!force && this.verifiedUser && this.verifiedFingerprint === fingerprint) return this.verifiedUser;
      const raw = await this.request("/user", {}, { cacheTtlMs: force ? 0 : 6e4 });
      const user = parseWanikaniUser(raw);
      this.verifiedUser = user;
      this.verifiedFingerprint = fingerprint;
      return user;
    }
    async effectiveMaxLevel() {
      const user = this.verifiedUser ?? await this.getUser();
      const subscription = user.subscription;
      if (!subscription.active) return FREE_TIER_MAX_LEVEL;
      if (!KNOWN_SUBSCRIPTION_TYPES.has(subscription.type)) return FREE_TIER_MAX_LEVEL;
      if (subscription.type === "free") return FREE_TIER_MAX_LEVEL;
      const granted = Number(subscription.max_level_granted);
      return Number.isFinite(granted) && granted > 0 ? Math.min(60, granted) : FREE_TIER_MAX_LEVEL;
    }
    async getSummary() {
      await this.ensureUser();
      return this.request("/summary", {}, { cacheTtlMs: 3e4 });
    }
    async getAssignments(options = {}) {
      await this.ensureUser();
      return this.collect("/assignments", options, 3e4);
    }
    async getSubjects(options = {}) {
      await this.ensureUser();
      const maxLevel = await this.effectiveMaxLevel();
      const requestedLevels = options.levels?.filter((level) => level >= 1 && level <= maxLevel);
      if (options.levels?.length && !requestedLevels?.length) return [];
      const levels = requestedLevels?.length ? requestedLevels : Array.from({ length: maxLevel }, (_, index) => index + 1);
      const subjects = await this.collect("/subjects", { ...options, levels }, 24 * 60 * 60 * 1e3);
      return subjects.filter((subject) => rawSubjectLevel(subject) <= maxLevel);
    }
    async getStudyMaterials(options = {}) {
      await this.ensureUser();
      return this.collect("/study_materials", options, 6e4);
    }
    async getReviewStatistics(options = {}) {
      await this.ensureUser();
      return this.collect("/review_statistics", options, 6e4);
    }
    async createReview(body) {
      await this.ensureUser();
      const response = await this.request("/reviews", {
        method: "POST",
        body: { review: body }
      });
      this.invalidateReviewStateCaches();
      return response;
    }
    async ensureUser() {
      return this.getUser();
    }
    async collect(path, options, cacheTtlMs = 0) {
      const dedupeKey = `${this.currentFingerprint()}:${path}?${stableOptionsKey(options)}`;
      const cachedResponse = this.responseCache.get(dedupeKey);
      if (cachedResponse && cachedResponse.expiresAt > this.now()) return cachedResponse.value;
      const cached = this.pending.get(dedupeKey);
      if (cached) return cached;
      const promise = this.collectUncached(path, options).then((items) => {
        if (cacheTtlMs > 0) this.responseCache.set(dedupeKey, { expiresAt: this.now() + cacheTtlMs, value: items });
        return items;
      }).finally(() => this.pending.delete(dedupeKey));
      this.pending.set(dedupeKey, promise);
      return promise;
    }
    async collectUncached(path, options) {
      const items = [];
      let url = `${this.baseUrl}${path}${queryString(options)}`;
      const visited = /* @__PURE__ */ new Set();
      while (url) {
        if (!this.isSafeApiUrl(url)) throw new WanikaniApiError("WaniKani returned an unsafe pagination URL.");
        if (visited.has(url)) throw new WanikaniApiError("WaniKani pagination repeated a page URL.");
        if (visited.size >= 1e3) throw new WanikaniApiError("WaniKani pagination exceeded the safety limit.");
        visited.add(url);
        const page = await this.requestUrl(url);
        if (Array.isArray(page.data)) items.push(...page.data);
        url = typeof page.pages?.next_url === "string" ? page.pages.next_url : null;
      }
      return items;
    }
    request(path, options = {}, cache = {}) {
      const url = `${this.baseUrl}${path}`;
      if (!cache.cacheTtlMs || options.method === "POST") return this.requestUrl(url, options);
      const key = `${this.currentFingerprint()}:${url}`;
      const cached = this.responseCache.get(key);
      if (cached && cached.expiresAt > this.now()) return Promise.resolve(cached.value);
      const pending = this.pending.get(key);
      if (pending) return pending;
      const request = this.requestUrl(url, options).then((value) => {
        this.responseCache.set(key, { expiresAt: this.now() + (cache.cacheTtlMs ?? 0), value });
        return value;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, request);
      return request;
    }
    async requestUrl(url, options = {}) {
      const token = this.getToken().trim();
      if (!token) throw new WanikaniApiError("WaniKani API token is not set.");
      if (!this.isSafeApiUrl(url)) throw new WanikaniApiError("Blocked a WaniKani request outside the official API origin.");
      let attempt = 0;
      while (true) {
        await this.throttle();
        try {
          return await this.requestImpl(url, {
            method: options.method ?? "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Wanikani-Revision": WANIKANI_REVISION,
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            data: options.body === void 0 ? void 0 : JSON.stringify(options.body),
            responseType: "json",
            timeoutMs: this.timeoutMs,
            preferFetch: true,
            allowDirectCrossOrigin: true,
            proxyUrl: "",
            allowPublicProxies: false,
            allowConfiguredProxy: false,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            failureLabel: "WaniKani request",
            statusFailureMessage: (status) => status === 401 ? "WaniKani token expired or was denied (401)." : status === 403 ? "WaniKani token lacks permission for this request (403)." : `WaniKani API request failed (${status}).`
          });
        } catch (error) {
          const normalized = normalizeWanikaniError(error);
          if (attempt === 0 && isRateLimitError(normalized)) {
            attempt += 1;
            await this.sleep(Math.max(2e3, this.minRequestIntervalMs * 2));
            continue;
          }
          throw normalized;
        }
      }
    }
    throttle() {
      const scheduled = this.requestStartQueue.then(async () => {
        const wait = this.lastRequestAt + this.minRequestIntervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
        this.lastRequestAt = this.now();
      });
      this.requestStartQueue = scheduled.catch(() => void 0);
      return scheduled;
    }
    currentFingerprint() {
      const fingerprint = this.tokenFingerprint();
      if (!fingerprint) throw new WanikaniApiError("WaniKani API token is not set.");
      if (this.verifiedFingerprint && this.verifiedFingerprint !== fingerprint) {
        this.verifiedUser = null;
        this.verifiedFingerprint = "";
        this.pending.clear();
        this.responseCache.clear();
      }
      return fingerprint;
    }
    invalidateReviewStateCaches() {
      const fingerprint = this.tokenFingerprint();
      const summaryKey = `${fingerprint}:${this.baseUrl}/summary`;
      for (const key of this.responseCache.keys()) {
        if (key === summaryKey || key.startsWith(`${fingerprint}:/assignments?`) || key.startsWith(`${fingerprint}:/review_statistics?`)) {
          this.responseCache.delete(key);
        }
      }
    }
    isSafeApiUrl(value) {
      try {
        const url = new URL(value);
        const base = new URL(`${this.baseUrl}/`);
        return url.protocol === "https:" && url.origin === base.origin && url.pathname.startsWith(base.pathname);
      } catch {
        return false;
      }
    }
  }
  const KNOWN_SUBSCRIPTION_TYPES = /* @__PURE__ */ new Set(["free", "recurring", "lifetime"]);
  function parseWanikaniUser(raw) {
    const record = isRecord$2(raw) ? isRecord$2(raw.data) ? raw.data : raw : {};
    const subscriptionRaw = isRecord$2(record.subscription) ? record.subscription : {};
    return {
      id: typeof record.id === "string" ? record.id : "",
      level: typeof record.level === "number" ? record.level : 0,
      subscription: {
        active: subscriptionRaw.active === true,
        type: typeof subscriptionRaw.type === "string" ? subscriptionRaw.type : "",
        max_level_granted: typeof subscriptionRaw.max_level_granted === "number" ? subscriptionRaw.max_level_granted : 0,
        period_ends_at: typeof subscriptionRaw.period_ends_at === "string" ? subscriptionRaw.period_ends_at : null
      }
    };
  }
  function queryString(options) {
    const params = new URLSearchParams();
    if (options.ids?.length) params.set("ids", options.ids.join(","));
    if (options.levels?.length) params.set("levels", options.levels.join(","));
    if (options.types?.length) params.set("types", options.types.join(","));
    if (options.updatedAfter) params.set("updated_after", options.updatedAfter);
    if (options.hidden !== void 0) params.set("hidden", String(options.hidden));
    if (options.immediatelyAvailableForReview !== void 0) params.set("immediately_available_for_review", String(options.immediatelyAvailableForReview));
    if (options.immediatelyAvailableForLessons !== void 0) params.set("immediately_available_for_lessons", String(options.immediatelyAvailableForLessons));
    if (options.subjectIds?.length) params.set("subject_ids", options.subjectIds.join(","));
    if (options.slugs?.length) params.set("slugs", options.slugs.join(","));
    if (options.srsStages?.length) params.set("srs_stages", options.srsStages.join(","));
    if (options.availableBefore) params.set("available_before", options.availableBefore);
    if (options.started !== void 0) params.set("started", String(options.started));
    if (options.unlocked !== void 0) params.set("unlocked", String(options.unlocked));
    if (options.page !== void 0) params.set("page", String(options.page));
    const query = params.toString();
    return query ? `?${query}` : "";
  }
  function normalizeWanikaniError(error) {
    if (error instanceof WanikaniApiError) return error;
    const status = httpStatusFromError(error);
    if (!(error instanceof Error)) return new WanikaniApiError("WaniKani request failed.", status);
    if (status === 401) return new WanikaniApiError("WaniKani token expired or was denied.", 401);
    if (status === 403) return new WanikaniApiError("WaniKani token lacks permission for this request.", 403);
    if (status !== void 0) return new WanikaniApiError(error.message, status);
    return error;
  }
  function isRateLimitError(error) {
    return error instanceof WanikaniApiError && error.status === 429 || /\(429\)|rate limit/i.test(error.message);
  }
  function rawSubjectLevel(value) {
    if (!isRecord$2(value) || !isRecord$2(value.data)) return Number.POSITIVE_INFINITY;
    return typeof value.data.level === "number" ? value.data.level : Number.POSITIVE_INFINITY;
  }
  function stableOptionsKey(options) {
    return JSON.stringify(Object.fromEntries(Object.entries(options).sort(([left], [right]) => left.localeCompare(right))));
  }
  function trimBaseUrl(value) {
    return value.replace(/\/+$/u, "");
  }
  function isRecord$2(value) {
    return typeof value === "object" && value !== null;
  }
  function parseWanikaniSubject(raw) {
    if (!isRecord$1(raw)) return null;
    const type = typeof raw.object === "string" ? raw.object : "";
    if (!isSubjectType(type)) return null;
    const data = isRecord$1(raw.data) ? raw.data : {};
    const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      type,
      level: typeof data.level === "number" ? data.level : 0,
      slug: typeof data.slug === "string" ? data.slug : "",
      characters: typeof data.characters === "string" ? data.characters : null,
      documentUrl: typeof data.document_url === "string" ? data.document_url : "",
      meanings: parseMeanings(data.meanings),
      auxiliaryMeanings: parseAuxiliaryMeanings(data.auxiliary_meanings),
      readings: type === "radical" ? [] : parseReadings(data.readings),
      meaningMnemonic: typeof data.meaning_mnemonic === "string" ? data.meaning_mnemonic : "",
      meaningHint: typeof data.meaning_hint === "string" ? data.meaning_hint : void 0,
      readingMnemonic: typeof data.reading_mnemonic === "string" ? data.reading_mnemonic : void 0,
      readingHint: typeof data.reading_hint === "string" ? data.reading_hint : void 0,
      componentSubjectIds: parseNumberArray(data.component_subject_ids),
      amalgamationSubjectIds: parseNumberArray(data.amalgamation_subject_ids),
      visuallySimilarSubjectIds: parseNumberArray(data.visually_similar_subject_ids),
      contextSentences: parseContextSentences(data.context_sentences),
      audio: type === "vocabulary" || type === "kana_vocabulary" ? parseAudio(data.pronunciation_audios) : [],
      hiddenAt: typeof data.hidden_at === "string" ? data.hidden_at : null
    };
  }
  function primaryMeaning(subject) {
    return subject.meanings.find((meaning) => meaning.primary)?.meaning ?? subject.meanings[0]?.meaning ?? "";
  }
  function primaryReading(subject) {
    return subject.readings.find((reading) => reading.primary)?.reading ?? subject.readings[0]?.reading ?? "";
  }
  function subjectsWithinLevel(subjects, maxLevel) {
    return subjects.filter((subject) => subject.level <= maxLevel);
  }
  function isSubjectType(value) {
    return value === "radical" || value === "kanji" || value === "vocabulary" || value === "kana_vocabulary";
  }
  function parseMeanings(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord$1).map((item) => ({
      meaning: typeof item.meaning === "string" ? item.meaning : "",
      primary: item.primary === true,
      acceptedAsCorrect: item.accepted_answer === true || item.accepted_as_correct === true
    })).filter((item) => item.meaning);
  }
  function parseAuxiliaryMeanings(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord$1).map((item) => ({
      meaning: typeof item.meaning === "string" ? item.meaning : "",
      type: item.type === "whitelist" || item.type === "blacklist" ? item.type : "unknown"
    })).filter((item) => item.meaning);
  }
  function parseReadings(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord$1).map((item) => {
      const type = item.type === "onyomi" || item.type === "kunyomi" || item.type === "nanori" ? item.type : void 0;
      return {
        reading: typeof item.reading === "string" ? item.reading : "",
        primary: item.primary === true,
        acceptedAsCorrect: item.accepted_answer === true || item.accepted_as_correct === true,
        type
      };
    }).filter((item) => item.reading);
  }
  function parseNumberArray(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === "number");
  }
  function parseContextSentences(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord$1).map((item) => ({
      en: typeof item.en === "string" ? item.en : "",
      ja: typeof item.ja === "string" ? item.ja : ""
    })).filter((item) => item.en || item.ja);
  }
  function parseAudio(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord$1).map((item) => {
      const metadata = isRecord$1(item.metadata) ? item.metadata : {};
      return {
        url: typeof item.url === "string" ? item.url : "",
        contentType: typeof item.content_type === "string" ? item.content_type : "",
        sourceId: typeof metadata.source_id === "number" ? metadata.source_id : void 0,
        pronunciation: typeof metadata.pronunciation === "string" ? metadata.pronunciation : void 0,
        voiceGender: typeof metadata.gender === "string" ? metadata.gender : void 0,
        voiceActorName: typeof metadata.voice_actor_name === "string" ? metadata.voice_actor_name : void 0,
        voiceDescription: typeof metadata.voice_description === "string" ? metadata.voice_description : void 0
      };
    }).filter((item) => item.url);
  }
  function isRecord$1(value) {
    return typeof value === "object" && value !== null;
  }
  class WanikaniLookupClient {
    constructor(client) {
      this.client = client;
    }
    pending = /* @__PURE__ */ new Map();
    lookupCard(card) {
      const key = [this.client.tokenFingerprint(), card.wanikaniSubjectId ?? "", card.spelling.trim(), card.reading.trim()].join(":");
      const cached = this.pending.get(key);
      if (cached) return cached;
      const promise = this.lookup(card).finally(() => this.pending.delete(key));
      this.pending.set(key, promise);
      return promise;
    }
    lookupKanji(kanji) {
      return this.lookupCard({
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: kanji,
        reading: kanji,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: [],
        pitchAccent: [],
        wordWithReading: kanji,
        source: "fallback"
      });
    }
    async lookup(card) {
      if (!this.client.hasCredential()) return null;
      const spelling = card.spelling.trim();
      if (!spelling && !card.wanikaniSubjectId) return null;
      const rawSubjects = await this.client.getSubjects(card.wanikaniSubjectId ? { ids: [card.wanikaniSubjectId] } : { slugs: unique([spelling, card.reading.trim()]), types: subjectTypesFor(spelling) });
      const subjects = rawSubjects.map(parseWanikaniSubject).filter((subject2) => Boolean(subject2 && !subject2.hiddenAt));
      const subject = exactSubject(subjects, spelling, card.reading.trim());
      if (!subject) return null;
      const [assignments, materials, statistics, relatedRaw] = await Promise.all([
        this.client.getAssignments({ subjectIds: [subject.id] }),
        this.client.getStudyMaterials({ subjectIds: [subject.id] }),
        this.client.getReviewStatistics({ subjectIds: [subject.id] }),
        this.relatedSubjects(subject)
      ]);
      const related = relatedRaw.map(parseWanikaniSubject).filter((item) => Boolean(item && !item.hiddenAt));
      const components = related.filter((item) => subject.componentSubjectIds.includes(item.id));
      const visuallySimilar = related.filter((item) => subject.visuallySimilarSubjectIds.includes(item.id));
      const relatedVocabulary = related.filter((item) => subject.amalgamationSubjectIds.includes(item.id));
      return {
        subject,
        assignment: parseAssignment$1(assignments[0]),
        studyMaterial: parseStudyMaterial(materials[0]),
        reviewStatistic: parseReviewStatistic(statistics[0]),
        components,
        visuallySimilar,
        relatedVocabulary
      };
    }
    relatedSubjects(subject) {
      const ids = uniqueNumbers([
        ...subject.componentSubjectIds,
        ...subject.visuallySimilarSubjectIds,
        ...subject.amalgamationSubjectIds.slice(0, 24)
      ]);
      return ids.length ? this.client.getSubjects({ ids }) : Promise.resolve([]);
    }
  }
  function exactSubject(subjects, spelling, reading) {
    const exactCharacters = subjects.filter((subject) => subject.characters === spelling || subject.slug === spelling);
    if (!exactCharacters.length) return subjects.length === 1 ? subjects[0] : null;
    if (!reading || reading === spelling) {
      return exactCharacters.find((subject) => subject.type === "kanji") ?? exactCharacters[0];
    }
    return exactCharacters.find((subject) => subject.readings.some((candidate) => candidate.reading === reading)) ?? exactCharacters[0];
  }
  function subjectTypesFor(spelling) {
    return Array.from(spelling).length === 1 && /[\u3400-\u9fff\uf900-\ufaff]/u.test(spelling) ? ["kanji", "vocabulary", "kana_vocabulary"] : ["vocabulary", "kana_vocabulary"];
  }
  function parseAssignment$1(raw) {
    const record = dataRecord(raw);
    const outer = asRecord(raw);
    const id = numberValue(outer?.id);
    if (!record || id === null) return null;
    return {
      id,
      srsStage: numberValue(record.srs_stage) ?? 0,
      availableAt: stringValue(record.available_at),
      burnedAt: stringValue(record.burned_at),
      unlockedAt: stringValue(record.unlocked_at)
    };
  }
  function parseStudyMaterial(raw) {
    const data = dataRecord(raw);
    if (!data) return null;
    return {
      meaningNote: stringValue(data.meaning_note) ?? "",
      readingNote: stringValue(data.reading_note) ?? "",
      meaningSynonyms: Array.isArray(data.meaning_synonyms) ? data.meaning_synonyms.filter((value) => typeof value === "string") : []
    };
  }
  function parseReviewStatistic(raw) {
    const data = dataRecord(raw);
    if (!data) return null;
    return {
      meaningCorrect: numberValue(data.meaning_correct) ?? 0,
      meaningIncorrect: numberValue(data.meaning_incorrect) ?? 0,
      readingCorrect: numberValue(data.reading_correct) ?? 0,
      readingIncorrect: numberValue(data.reading_incorrect) ?? 0,
      percentageCorrect: numberValue(data.percentage_correct) ?? 0
    };
  }
  function dataRecord(value) {
    const record = asRecord(value);
    return asRecord(record?.data);
  }
  function asRecord(value) {
    return typeof value === "object" && value !== null ? value : null;
  }
  function numberValue(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function stringValue(value) {
    return typeof value === "string" ? value : null;
  }
  function unique(values) {
    return values.filter((value, index) => Boolean(value) && values.indexOf(value) === index);
  }
  function uniqueNumbers(values) {
    return values.filter((value, index) => Number.isFinite(value) && value > 0 && values.indexOf(value) === index);
  }
  const HIRAGANA = "぀-ゟ";
  const KATAKANA = "゠-ヿ";
  const KANA = "぀-ヿ";
  const HALFWIDTH_KATAKANA = "ｦ-ﾟ";
  const KANJI = "㐀-鿿";
  const ITERATION_MARK = "々";
  const ITERATION_MARKS = `${ITERATION_MARK}〆`;
  const KANA_COUNTERS = "ヵヶ";
  const PROLONGED_SOUND_MARK = "ー";
  const KANJI_LIKE = `${KANJI}${ITERATION_MARKS}`;
  const KANJI_LIKE_WITH_COUNTERS = `${KANJI_LIKE}${KANA_COUNTERS}`;
  const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
  const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
  const JAPANESE_SCRIPT = `${KANA}${KANJI}${ITERATION_MARKS}${HALFWIDTH_KATAKANA}`;
  const HAS_JAPANESE = new RegExp(`[${JAPANESE_SCRIPT}]`);
  new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
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
  const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;
  function normalizedJapaneseCardReading(spelling, reading) {
    const cleanSpelling = cleanCardHighlightValue(spelling);
    const cleanReading = cleanCardHighlightValue(reading);
    return cleanReading && JAPANESE_TEXT_RE.test(cleanReading) ? cleanReading : cleanSpelling;
  }
  function cleanCardHighlightValue(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }
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
  ];
  const DEINFLECTION_CACHE_MAX = 4e3;
  const deinflectionCache = /* @__PURE__ */ new Map();
  function deinflectJapaneseTerm(source) {
    const cached = deinflectionCache.get(source);
    if (cached) return cached;
    const results = [{ term: source, rules: [], reasons: [], depth: 0 }];
    const seen = /* @__PURE__ */ new Set([candidateKey(results[0])]);
    const queue = [results[0]];
    expandDeinflectionQueue(queue, results, seen);
    const sorted = sortDeinflectedTerms(results);
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
    if (isTerminalDeinflection(current)) return;
    for (const rule of RULES) {
      rememberExpandedDeinflection(current, rule, queue, results, seen);
    }
  }
  function isTerminalDeinflection(current) {
    return current.depth >= 2 || current.reasons.at(-1) === "simultaneous action";
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
    if (!canApplyDeinflectionRule(current.term, rule)) return null;
    const term = `${current.term.slice(0, -rule.from.length)}${rule.to}`;
    if (!term || term === current.term) return null;
    return {
      term,
      rules: rule.rules,
      reasons: [...current.reasons, rule.reason],
      depth: current.depth + 1
    };
  }
  function canApplyDeinflectionRule(term, rule) {
    return term.endsWith(rule.from) && (term.length > rule.from.length || rule.to.length > 0);
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
    return entryRuleSet.size > 0 && candidateRules.some((rule) => termRuleMatches(rule, entryRuleSet));
  }
  function entryRulesSet(entryRules) {
    return new Set((entryRules ?? "").split(/\s+/).filter(Boolean));
  }
  function termRuleMatches(rule, entryRuleSet) {
    return TERM_RULE_MATCHERS.some((matches) => matches(rule, entryRuleSet));
  }
  const TERM_RULE_MATCHERS = [
    (rule, entryRuleSet) => entryRuleSet.has(rule),
    (rule, entryRuleSet) => rule.startsWith("v5") && entryRuleSet.has("v5"),
    (rule, entryRuleSet) => rule === "v5" && [...entryRuleSet].some((entryRule) => entryRule.startsWith("v5")),
    (rule, entryRuleSet) => rule === "i-adj" && entryRuleSet.has("adj-i"),
    (rule, entryRuleSet) => rule === "adj-i" && entryRuleSet.has("i-adj")
  ];
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
  function candidateKey(candidate) {
    return `${candidate.term}
${candidate.rules.join(" ")}
${candidate.depth}`;
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
  const JAPANESE_SCRIPT_GROUP_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}]+|[${HIRAGANA_WITH_PROLONGED}]+|[${KATAKANA_WITH_PROLONGED}]+|[${HALFWIDTH_KATAKANA}]+`, "gu");
  const JAPANESE_TEXT_RUN_RE = new RegExp(`[${KANA}${KANJI_LIKE_WITH_COUNTERS}${PROLONGED_SOUND_MARK}${HALFWIDTH_KATAKANA}]+`, "gu");
  const JAPANESE_CHARACTER_RE = new RegExp(`[${KANA}${KANJI_LIKE_WITH_COUNTERS}${HALFWIDTH_KATAKANA}]`, "u");
  const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
  const FALLBACK_INFLECTION_MAX_LENGTH = 18;
  const FALLBACK_LOOKUP_TERM_LIMIT = 8;
  const INFLECTION_BOUNDARY_SEGMENTS = /* @__PURE__ */ new Set(["は", "が", "を", "に", "へ", "と", "で", "の", "や", "から", "まで", "より", "だけ", "しか", "など", "ね"]);
  const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first, second) => second.length - first.length);
  const PARTICLE_PREFIX_REMAINDER_RE = new RegExp(`^[${KANJI_LIKE_WITH_COUNTERS}${KATAKANA_WITH_PROLONGED}]`, "u");
  const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なか|なかっ|なかった|ながら|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
  const HIRAGANA_SEGMENT_RE = new RegExp(`^[${HIRAGANA_WITH_PROLONGED}]+$`, "u");
  const KATAKANA_SEGMENT_RE = new RegExp(`^[${KATAKANA}${HALFWIDTH_KATAKANA}${PROLONGED_SOUND_MARK}]+$`, "u");
  const SEGMENT_SEPARATORS = "・･゠·•";
  const SEGMENT_SEPARATOR_RE = new RegExp(`[${SEGMENT_SEPARATORS}]`, "u");
  const SEGMENT_SEPARATOR_RUN_RE = new RegExp(`[${SEGMENT_SEPARATORS}]+`, "gu");
  const SINGLE_KANJI_SEGMENT_RE = new RegExp(`^[${KANJI}]$`, "u");
  const SINGLE_KANJI_HIRAGANA_STEM_RE = new RegExp(`^[${KANJI}][${HIRAGANA_WITH_PROLONGED}]*$`, "u");
  const KANJI_KANA_KANJI_SPAN_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}][${HIRAGANA_WITH_PROLONGED}]+[${KANJI_LIKE_WITH_COUNTERS}]`, "u");
  const HIRAGANA_END_RE = new RegExp(`[${HIRAGANA_WITH_PROLONGED}]$`, "u");
  const TRAILING_POLITE_PARTICLE_RE = /(?:ます|ません|です|でした)ね$/u;
  const SURU_STEM_SEGMENT_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}${KATAKANA}]`, "u");
  const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
  const NUMERIC_COUNTER_SUFFIX_SEGMENTS = /* @__PURE__ */ new Set(["話", "巻", "回", "章", "部", "番", "号", "版", "人", "名", "匹", "頭", "羽", "枚", "本", "冊", "個", "台", "件", "分", "秒", "時", "日", "月", "年", "泊", "円"]);
  const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
  const SEGMENTER_COMPOUND_OVERRIDES = /* @__PURE__ */ new Set(["巨乳"]);
  const SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH = Array.from(SEGMENTER_COMPOUND_OVERRIDES).reduce((max, value) => Math.max(max, value.length), 0);
  const KANA_VERB_STEM_END_RE = /[うくぐすずつづぬふぶぷむゆる]$/u;
  const KANA_I_ADJECTIVE_END_RE = /い$/u;
  const SMALL_TSU_RE = /っ/u;
  const KANA_CONTENT_WORD_MIN_LENGTH = 3;
  const NON_HIRAGANA_SCRIPT_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}${KATAKANA}${HALFWIDTH_KATAKANA}]`, "u");
  function normalizeFallbackTerm(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 80);
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
      mergeContiguousKanaSegments(mergeContiguousKatakanaSegments(mergeSegmenterCompoundOverrides(separatedSegments)))
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
    if (segments.some((segment) => NON_HIRAGANA_SCRIPT_RE.test(segment.surface))) return segments;
    const merged = [];
    for (let index = 0; index < segments.length; ) {
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
    const atKanaRunStart = !previous || !isPureKanaSegment(previous.surface) || previous.end !== first.start;
    if (isBoundarySegment(first.surface) && !atKanaRunStart) return null;
    const runEnd = contiguousKanaRunEnd(segments, startIndex);
    if (runEnd - startIndex < 2) return null;
    let surface = first.surface;
    let lastIndex = startIndex;
    for (let index = startIndex + 1; index < runEnd; index += 1) {
      const current = segments[index];
      const trailingSpan = sliceKanaSpanSurface(segments, index, runEnd);
      if (isBoundarySegment(current.surface) || isKanaContentWordSpan(trailingSpan)) break;
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
  function mergeSegmenterCompoundOverrides(segments) {
    const merged = [];
    for (let index = 0; index < segments.length; ) {
      const span = segmenterCompoundOverrideSpanAt(segments, index);
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
  function segmenterCompoundOverrideSpanAt(segments, startIndex) {
    const first = segments[startIndex];
    if (!first) return null;
    let surface = "";
    let best = null;
    for (let index = startIndex; index < segments.length; index += 1) {
      const current = segments[index];
      if (!current || index > startIndex && segments[index - 1]?.end !== current.start) break;
      surface += current.surface;
      if (surface.length > SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH) break;
      if (index > startIndex && SEGMENTER_COMPOUND_OVERRIDES.has(surface)) {
        best = {
          segment: { surface, start: first.start, end: current.end },
          nextIndex: index + 1
        };
      }
    }
    return best;
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
  const LANGUAGE_PROFILE_SCHEMA_VERSION = 1;
  const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 4;
  const SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS = [4];
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
  function learningTargetCapabilities(declared = {}) {
    return Object.freeze({ ...NO_CAPABILITIES, ...declared });
  }
  function createLearningTargetModule(spec) {
    const language = canonicalLanguageTag(spec.language) ?? spec.language;
    const base = languageSubtag(language) ?? language;
    const regionalTag = maximizedLocaleTag(language);
    const direction = spec.direction ?? localeDirection(language);
    const detects = detectorFor(spec.detectsText);
    const normalizeText = spec.normalizeText ?? defaultNormalizeText;
    return Object.freeze({
      interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
      id: spec.id,
      language,
      direction,
      collationLocale: spec.collationLocale ?? language,
      capabilities: learningTargetCapabilities(spec.capabilities),
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
      lookupStartsAtSegmentBoundary: spec.lookupStartsAtSegmentBoundary ?? true,
      normalizeText,
      isLookupableText(text) {
        return Boolean(text) && detects(text);
      },
      segment: spec.segment ?? ((text) => defaultSegment(text, language)),
      lookupCandidates: spec.lookupCandidates ?? ((text) => defaultLookupCandidates(normalizeText(text))),
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
    return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
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
  function defaultLookupCandidates(term) {
    return term ? [{ term, rules: [], reasons: [], depth: 0 }] : [];
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
  const JAPANESE_LEARNING_TARGET = createLearningTargetModule({
    id: "japanese-v1",
    language: "ja",
    direction: "ltr",
    collationLocale: "ja",
    capabilities: {
      "term-lookup": true,
      "character-lookup": true,
      segmentation: true,
      morphology: true,
      "reading-annotation": true,
      pronunciation: true,
      frequency: true,
      examples: true,
      grammar: true,
      audio: true,
      "text-to-speech": true,
      ocr: true,
      subtitles: true,
      mining: true,
      srs: true,
      grading: true,
      typing: true,
      handwriting: true
    },
    featureSemantics: {
      characterSystem: "kanji",
      phoneticScripts: ["hiragana", "katakana"],
      pronunciation: "pitch-accent",
      readingAnnotation: "furigana"
    },
    typography: {
      contentLocale: "ja",
      readingAnnotationMode: "ruby",
      supportsVerticalWriting: true
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
  const HAS_HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/u;
  const KOREAN_LEARNING_TARGET = createLearningTargetModule({
    id: "korean-thin-v1",
    language: "ko",
    capabilities: {
      segmentation: true,
      "text-to-speech": true,
      ocr: true,
      subtitles: true,
      typing: true
    },
    featureSemantics: {
      characterSystem: "hangul",
      phoneticScripts: ["hangul"],
      pronunciation: "none",
      readingAnnotation: "none"
    },
    subtitles: {
      languageAliases: ["kor", "korean"]
    },
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
    originalDefinitionLabel: "Original {language}"
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
    originalDefinitionLabel: "التعريف الأصلي باللغة ⁨{language}⁩"
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
    originalDefinitionLabel: "Original på {language}"
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
    originalDefinitionLabel: "Originaldefinition auf {language}"
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
    originalDefinitionLabel: "Πρωτότυπο κείμενο στα {language}"
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
    originalDefinitionLabel: "Definición original ({language})"
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
    originalDefinitionLabel: "تعریف اصلی به زبان ⁨{language}⁩"
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
    originalDefinitionLabel: "Alkuperäinen määritelmä ({language})"
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
    originalDefinitionLabel: "Définition originale en {language}"
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
    originalDefinitionLabel: "Τὸ πρωτότυπον ({language})"
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
    originalDefinitionLabel: "Eredeti meghatározás ({language})"
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
    originalDefinitionLabel: "Definisi asli dalam {language}"
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
    originalDefinitionLabel: "Definizione originale in {language}"
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
    originalDefinitionLabel: "និយមន័យដើម ({language})"
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
    originalDefinitionLabel: "원문({language})"
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
    originalDefinitionLabel: "Definitio originalis ({language})"
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
    originalDefinitionLabel: "ຄຳນິຍາມຕົ້ນສະບັບ ({language})"
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
    originalDefinitionLabel: "Эх тайлбар ({language})"
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
    originalDefinitionLabel: "Oorspronkelijke definitie ({language})"
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
    originalDefinitionLabel: "Oryginalna definicja ({language})"
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
    originalDefinitionLabel: "Definição original ({language})"
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
    originalDefinitionLabel: "Definiția originală în {language}"
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
    originalDefinitionLabel: "Оригинал определения ({language})"
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
    originalDefinitionLabel: "Originalna definicija ({language})"
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
    originalDefinitionLabel: "Origjinali në {language}"
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
    originalDefinitionLabel: "Ursprunglig definition på {language}"
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
    originalDefinitionLabel: "คำจำกัดความต้นฉบับ ({language})"
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
    originalDefinitionLabel: "Orihinal na depinisyon ({language})"
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
    originalDefinitionLabel: "Orijinal tanım ({language})"
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
    originalDefinitionLabel: "Định nghĩa gốc ({language})"
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
    originalDefinitionLabel: "原文（{language}）"
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
    originalDefinitionLabel: "{language}原文"
  });
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
  const GENERIC_ROSTER_LEARNING_TARGETS = Object.freeze(
    LEARNER_LANGUAGES.filter((language) => language.id !== "ko").map((language) => createLearningTargetModule({
      id: `${language.id}-roster-v1`,
      language: language.runtimeLocale,
      direction: language.direction,
      capabilities: {
        segmentation: true,
        "text-to-speech": true,
        subtitles: true,
        typing: true
      },
      featureSemantics: {
        characterSystem: language.defaultScript,
        phoneticScripts: [],
        pronunciation: "none",
        readingAnnotation: "none"
      },
      detectsText: scriptDetector(language.scripts)
    }))
  );
  function scriptDetector(scripts) {
    return new RegExp(
      scripts.map((script) => `\\p{Script=${script === "Hans" || script === "Hant" ? "Han" : script}}`).join("|"),
      "u"
    );
  }
  const DEFAULT_LEARNING_TARGET_LANGUAGE = "ja";
  const MODULE_STACKS_BY_LANGUAGE = /* @__PURE__ */ new Map();
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
  const registeredKeys = /* @__PURE__ */ new Set();
  function registerManagedState(entry) {
    const identity = managedStateIdentity(entry);
    if (registeredKeys.has(identity)) return;
    registeredKeys.add(identity);
  }
  function registerManagedStates(list) {
    for (const entry of list) registerManagedState(entry);
  }
  function managedStateIdentity(entry) {
    return `${entry.kind}:${entry.key ?? ""}:${entry.prefix ?? ""}`;
  }
  const MANAGED_STATE_MANIFEST = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
    { owner: "settings", kind: "gm", key: "yomu:prefer-japanese-site-language:v1" },
    // Cloud settings sync handoff written before an OAuth redirect.
    { owner: "settings/dialog-controller", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
    // App-level signals / flags / caches.
    { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
    { owner: "app/card-state-signal", kind: "gm", key: "yomu:card-state-signal" },
    { owner: "app/storage leases", kind: "gm", prefix: "yomu:lease:" },
    { owner: "srs/account-sync", kind: "gm", key: "yomu:private:academy-device:v1" },
    { owner: "srs/account-sync", kind: "gm", key: "yomu:private:academy-device-pending:v1" },
    { owner: "app/logger", kind: "gm", key: "yomu:enable-logs" },
    { owner: "app/main", kind: "gm", key: "yomu:jpdb-review-examples-visible:v1" },
    // Written with a raw localStorage.setItem, deliberately per-origin: it is the
    // bootstrap hint for this site, never the preference itself.
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
    { owner: "jpdb/jpdb-public-cache", kind: "gm", key: "yomu:jpdb-cache:v1" },
    { owner: "dictionaries/jiten-public-cache (legacy)", kind: "gm", key: "yomu:jiten-public-cache:v1" },
    { owner: "dictionaries/jiten-public-cache", kind: "gm", key: "yomu:jiten-public-cache:v2" },
    { owner: "dictionaries/jiten-stats-cache", kind: "gm", key: "jpdb-reader-jiten-daily-stats" },
    // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
    // store's own deleteDatabase during reset; registered so the invariant test
    // asserts it and the reset sweep nets it as a fallback.
    { owner: "dictionaries/yomitan", kind: "idb", key: "jpdb-popup-reader-yomitan" },
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
    { owner: "subtitles/controller", kind: "session", prefix: "yomu:subtitle-parse:v3:" },
    // New Tab study surface stores.
    { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
    { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "session", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-jpdb-stats-history" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-disabled-anki-decks" },
    { owner: "newtab/session-progress", kind: "local", key: "jpdb-reader-newtab-daily-study-time" },
    { owner: "newtab/controller", kind: "gm", key: "yomu-newtab-support-banner-dismissed" },
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
  const MISSING = { __yomuStorageValueMissing: true };
  function isMissingSentinel(value) {
    if (value === MISSING) return true;
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.__yomuStorageValueMissing === true);
  }
  function gmStorageGetSync(key, fallback) {
    const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
    if (getValue) {
      const read = gmStorageSyncRead(key, getValue);
      if (read.kind === "found") return read.value;
    }
    return localStorageGet(key, fallback);
  }
  function gmStorageSyncRead(key, getValue) {
    try {
      const value = getValue(key, MISSING);
      if (isPromiseLike(value)) return { kind: "fallback" };
      if (!isMissingSentinel(value)) return { kind: "found", value };
      return migratedLocalStorageSyncValue(key);
    } catch (error) {
      debugStorageError("GM storage sync read failed", key, error);
      return { kind: "fallback" };
    }
  }
  function migratedLocalStorageSyncValue(key) {
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
    const setValue = asyncGmSetValue();
    if (setValue) {
      try {
        await setValue(key, value);
        mirrorManagedValueToHostedStorage(key, value);
        return;
      } catch (error) {
        debugStorageError("GM storage write failed", key, error);
      }
    }
    localStorageSetOrThrow(key, localFallbackValueForWrite(key, value));
  }
  function gmStorageSetSync(key, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key, value);
        if (!isPromiseLike(result)) {
          mirrorManagedValueToHostedStorage(key, value);
          return;
        }
        result.catch((error) => debugStorageError("GM storage async write failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync write failed", key, error);
      }
    }
    localStorageSet(key, localFallbackValueForWrite(key, value));
  }
  function gmStorageDeleteSync(key) {
    if (typeof GM_deleteValue === "function") {
      try {
        const result = GM_deleteValue(key);
        if (isPromiseLike(result)) result.catch((error) => debugStorageError("GM storage async delete failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync delete failed", key, error);
      }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
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
    localStorage.setItem(key, JSON.stringify(value));
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
  function mirrorManagedValueToHostedStorage(key, value) {
    if (!shouldMirrorManagedValueToHostedStorage(key)) return;
    localStorageSet(key, value);
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
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const extension = extensionStorageArea();
    if (extension) return (key, value) => extension.set({ [key]: value });
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
  }
  function extensionStorageArea() {
    const candidate = globalThis;
    const browser = candidate.browser;
    if (browser?.runtime?.id && browser.storage?.local) return browser.storage.local;
    const chrome = candidate.chrome;
    if (chrome?.runtime?.id && chrome.storage?.local) return chrome.storage.local;
    return null;
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
  function getRuntimeLoggingOverride() {
    try {
      return gmStorageGetSync(RUNTIME_LOG_KEY, false) === true;
    } catch {
      return false;
    }
  }
  function setRuntimeLoggingOverride(enabled) {
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
  function sanitizeRecordForConsole(record) {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [
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
  const DEFAULT_SLICE1_LEARNER_LANGUAGE = "en";
  const JAPANESE_TARGET_ROSTER_ENTRY = Object.freeze({
    id: "ja",
    runtimeLocale: "ja",
    englishName: "Japanese",
    nativeName: "日本語",
    defaultScript: "Jpan",
    scripts: Object.freeze(["Jpan"]),
    direction: "ltr"
  });
  Object.freeze([
    JAPANESE_TARGET_ROSTER_ENTRY,
    ...LEARNER_LANGUAGES
  ]);
  const RUNTIME_BASE_TO_CATALOGUE_ID = new Map(
    LEARNER_LANGUAGES.map((language) => [
      languageSubtag(language.runtimeLocale) ?? language.id,
      language.id
    ])
  );
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
    return RUNTIME_BASE_TO_CATALOGUE_ID.get(base) ?? null;
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
  const DEFAULT_LANGUAGE_PROFILE_ID = "default-ja";
  const PARSER_PROVIDERS = /* @__PURE__ */ new Set(["local", "jiten", "jpdb", "auto"]);
  function createDefaultLanguageProfile(defaults = {}) {
    return {
      schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
      id: DEFAULT_LANGUAGE_PROFILE_ID,
      learnerLanguage: normalizeSlice1LearnerLanguage(
        defaults.learnerLanguage,
        DEFAULT_SLICE1_LEARNER_LANGUAGE
      ),
      targetLanguage: normalizeLearningTargetLanguage(defaults.targetLanguage),
      uiLocale: normalizeUiLocale(defaults.uiLocale, "en"),
      parserProvider: normalizeParserProvider(defaults.parserProvider, "local"),
      dictionaries: emptyProfileDictionaries(),
      definitionTranslationProviderIds: []
    };
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
  parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingInstallOfflineDictionaries	オフライン辞書をダウンロード（Jitendex＋ピッチアクセント）
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
finishSetup	セットアップを完了
finishSetupDictionaryHelp	どのページでも定義を表示できるように、オフライン辞書を追加しましょう。
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
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。ピッチ/頻度辞書はアクセントやバッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
dictionaryImportComplete	{sources}から{records}件インポートしました。
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
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
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
findingGrammar	文法を検索中...
grammarKnown	既知
grammarReview	復習
grammarDetails	詳細
grammarFoundIn	検出箇所
grammarExample	例
grammarGuide	ガイド
grammarHideKnown	既知を隠す
grammarShowKnown	既知を表示
allDetectedGrammarKnown	検出文法はすべて既知です。
grammarShown	件表示
grammarKnownHidden	件の既知を非表示
grammarGenericShort	文法項目: {name}
grammarGenericDetail	「{match}」に「{name}」。
grammarLevelCore	基本
`);
  parseUiCopyTable(String.raw`
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
popupFontFamily	ポップアップの日本語フォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップの日本語の太さ
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
newTabStudyStepWordHelp	表は日本語、表示後に意味と読み。
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
noExactPitch	完全一致のピッチは利用不可
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	JPDB + Ankiの状態
colorSourceJpdb	JPDBの状態
colorSourceAnki	Ankiの状態
colorSourceDeck	デッキの学習状態
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
pageScanModeOff	ページを変更しない
pageScanModeAuto	日本語を自動で検出
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
showPitchAccent	ピッチアクセントを表示
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
audioSourceTextToSpeechReading	ブラウザ読み上げ (かな読み)
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
subtitlePlayerEnabled	動画字幕プレイヤーを有効にする
subtitleAutoDetect	ページの字幕を自動検出
subtitleOverlayVisible	字幕オーバーレイを表示
subtitleSecondaryVisible	利用可能ならネイティブ字幕を表示
subtitleNativeBlurred	ホバーするまでネイティブ字幕をぼかす
subtitleKaraokeMode	カラオケ風の単語タイミング
subtitleTranscriptVisible	文字起こしパネルを標準で開く
subtitlePausePanel	一時停止時にサイドパネルを開く
subtitleShadowAutoPause	シャドー中は各行の後で一時停止
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後の再開 (秒)
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕クリック時に動画を一時停止
subtitleHoverPause	字幕ホバー時に動画を一時停止
subtitleControlsMode	字幕コントロール
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
subtitleFontSize	字幕フォントサイズ (px)
subtitleBottomOffset	字幕下端オフセット (%)
subtitleTextColor	字幕の色
subtitleOutlineColor	字幕の縁取り
subtitleBackgroundColor	字幕背景
subtitleBackgroundOpacity	字幕背景の不透明度
subtitleFontFamily	字幕フォントファミリー
subtitleFontWeight	字幕フォントの太さ
subtitleSeekPadding	字幕シーク余白 (s)
subtitlePreview	字幕ライブプレビュー
preview	プレビュー
youtubeImmersionEnabled	日本語YouTubeのみ
preferJapaneseSiteLanguage	サイトの言語と地域を日本優先にする
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	日本語UIと日本向け内容を優先します。
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は日本語らしくないYouTube項目{count}件を非表示
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
localDictionariesEnabled	インポート済み辞書の定義を表示
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
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/ピッチ/頻度辞書で定義、アクセント、バッジを追加します。
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
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
mirroredDictionaryOtherLanguage	日本語を読むための辞書ではありません。
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
factoryResetDictionaryWarning	設定をリセットしました。他のタブを閉じてください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
factoryResetDeleteSettingsFailed	設定を削除できません。他のタブを閉じてください。
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
`);
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
  Logger.scope("Settings");
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
  const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
  const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;
  const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
  const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  accessibleOcrBackgroundColor(DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY);
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
  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  function accessibleOcrBackgroundOpacity(opacity) {
    return Math.max(
      OCR_BACKGROUND_MIN_RENDERED_OPACITY,
      clampNumber(opacity, 0, 1, DEFAULT_OCR_BACKGROUND_OPACITY)
    );
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
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  selectorPairs("control,toggle,player", ["class"]);
  new Set("heiban,atamadaka,nakadaka,odaka".split(","));
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const KANJI_WANIKANI_SOURCE_ID = "__kanji_wanikani__";
  Logger.scope("DictionaryArchiveCache");
  Logger.scope("Yomitan");
  new TextDecoder();
  Logger.scope("YomitanSettingsImport");
  Logger.scope("Yomitan");
  function definitionSourceStateKey(sourceId) {
    return `definition-source:${sourceId}`;
  }
  function kanjiSourceStateKey(sourceId) {
    return `kanji:${sourceId}`;
  }
  const KNOWN_TAGS = /* @__PURE__ */ new Set(["radical", "kanji", "vocabulary", "reading", "meaning", "ja"]);
  const TAG_RE = /<(\/?)(radical|kanji|vocabulary|reading|meaning|ja)>/gu;
  function renderWanikaniMarkup(text) {
    if (!text) return "";
    let result = "";
    let lastIndex = 0;
    const openTags = [];
    TAG_RE.lastIndex = 0;
    let match;
    while ((match = TAG_RE.exec(text)) !== null) {
      const [full, closing, tag] = match;
      result += escapeHtml(text.slice(lastIndex, match.index));
      lastIndex = match.index + full.length;
      if (!KNOWN_TAGS.has(tag)) continue;
      if (closing) {
        if (openTags.at(-1) === tag) {
          result += "</span>";
          openTags.pop();
        } else {
          result += escapeHtml(full);
        }
      } else {
        result += `<span class="yomu-wanikani-tag yomu-wanikani-tag-${tag}">`;
        openTags.push(tag);
      }
    }
    result += escapeHtml(text.slice(lastIndex));
    while (openTags.pop()) result += "</span>";
    return result;
  }
  function escapeHtml(value) {
    return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
  }
  function renderWanikaniDefinitionMount(card, settings, sourceAttributes) {
    if (!settings.wanikaniDefinitionsEnabled || !settings.wanikaniApiToken.trim()) return "";
    return `<div data-wanikani-definition-mount data-wanikani-expression="${escapeHtml$1(card.spelling)}" data-wanikani-reading="${escapeHtml$1(card.reading)}">
        ${renderLoadingSource(settings.wanikaniDefinitionsAlias || "WaniKani", sourceAttributes(definitionSourceStateKey(WANIKANI_DEFINITION_SOURCE_ID)))}
    </div>`;
  }
  class WanikaniSourceController {
    constructor(lookup, getSettings, sourceAttributes, onRendered) {
      this.lookup = lookup;
      this.getSettings = getSettings;
      this.sourceAttributes = sourceAttributes;
      this.onRendered = onRendered;
    }
    installDefinitionMounts(root, card) {
      for (const mount of root.querySelectorAll("[data-wanikani-definition-mount]")) {
        if (mount.dataset.wanikaniLoading === "true" || mount.dataset.wanikaniLoaded === "true") continue;
        mount.dataset.wanikaniLoading = "true";
        void this.lookup.lookupCard(card).then((info) => {
          if (!mount.isConnected) return;
          if (!info) {
            mount.remove();
            return;
          }
          const settings = this.getSettings();
          setInnerHtml(mount, renderWanikaniSource(
            info,
            settings,
            this.sourceAttributes(definitionSourceStateKey(WANIKANI_DEFINITION_SOURCE_ID)),
            // fallow-ignore-next-line code-duplication
            settings.wanikaniDefinitionsAlias || "WaniKani"
          ));
          mount.dataset.wanikaniLoaded = "true";
          this.onRendered?.(mount);
        }).catch(() => {
          if (mount.isConnected) mount.remove();
        }).finally(() => delete mount.dataset.wanikaniLoading);
      }
    }
    installKanjiMount(root, kanji) {
      const mount = root.querySelector("[data-kanji-wanikani-mount]");
      if (!mount || mount.dataset.wanikaniLoading === "true" || mount.dataset.wanikaniLoaded === "true") return;
      const settings = this.getSettings();
      if (!settings.wanikaniKanjiEnabled || !settings.wanikaniApiToken.trim()) {
        mount.remove();
        return;
      }
      mount.dataset.wanikaniLoading = "true";
      setInnerHtml(mount, renderLoadingSource(settings.wanikaniKanjiAlias || "WaniKani", this.sourceAttributes(kanjiSourceStateKey(KANJI_WANIKANI_SOURCE_ID))));
      void this.lookup.lookupKanji(kanji).then((info) => {
        if (!mount.isConnected) return;
        if (!info || info.subject.type !== "kanji") {
          mount.remove();
          return;
        }
        setInnerHtml(mount, renderWanikaniSource(
          info,
          settings,
          this.sourceAttributes(kanjiSourceStateKey(KANJI_WANIKANI_SOURCE_ID)),
          // fallow-ignore-next-line code-duplication
          settings.wanikaniKanjiAlias || "WaniKani"
        ));
        mount.dataset.wanikaniLoaded = "true";
        this.onRendered?.(mount);
      }).catch(() => {
        if (mount.isConnected) mount.remove();
      }).finally(() => delete mount.dataset.wanikaniLoading);
    }
  }
  function renderWanikaniSource(info, settings, attributes, label = "WaniKani") {
    const subject = info.subject;
    const meanings = subject.meanings.map((item) => `${escapeHtml$1(item.meaning)}${item.primary ? " <strong>primary</strong>" : ""}${item.acceptedAsCorrect ? "" : " <small>not accepted</small>"}`).join(", ");
    const readings = subject.readings.map((item) => `${escapeHtml$1(item.reading)}${item.type ? ` <small>${escapeHtml$1(item.type)}</small>` : ""}${item.acceptedAsCorrect ? "" : " <small>not accepted</small>"}`).join(", ");
    const acceptedAlternatives = subject.auxiliaryMeanings.filter((item) => item.type === "whitelist").map((item) => escapeHtml$1(item.meaning)).join(", ");
    const blockedAlternatives = subject.auxiliaryMeanings.filter((item) => item.type === "blacklist").map((item) => escapeHtml$1(item.meaning)).join(", ");
    const synonyms = info.studyMaterial?.meaningSynonyms.map(escapeHtml$1).join(", ") ?? "";
    const stage = info.assignment ? wanikaniStageLabel$1(info.assignment.srsStage) : "";
    const due = info.assignment?.availableAt ? formatDate(info.assignment.availableAt, settings.interfaceLanguage) : "";
    const components = renderSubjectLinks("Components", info.components);
    const similar = renderSubjectLinks("Visually similar", info.visuallySimilar);
    const related = renderSubjectLinks("Related vocabulary", info.relatedVocabulary);
    const sentences = subject.contextSentences.map((sentence) => `<li><span lang="ja">${escapeHtml$1(sentence.ja)}</span><br>${escapeHtml$1(sentence.en)}</li>`).join("");
    const audio = preferredWanikaniAudio(subject.audio).map((item, index) => `<button type="button" class="jpdb-reader-action-pill" data-action="wanikani-audio" data-audio-url="${escapeHtml$1(item.url)}" aria-label="Play WaniKani pronunciation ${index + 1}"${item.voiceDescription ? ` title="${escapeHtml$1(item.voiceDescription)}"` : ""}>▶ ${escapeHtml$1(item.voiceActorName || `Audio ${index + 1}`)}</button>`).join(" ");
    const publicDefinitionPayload = [
      ...subject.meanings.map((item) => item.meaning),
      ...subject.auxiliaryMeanings.filter((item) => item.type === "whitelist" || item.type === "blacklist").map((item) => item.meaning)
    ].filter(Boolean).join("\n");
    return `<details class="jpdb-reader-local jpdb-reader-source-card yomu-wanikani-source" data-source="wanikani" ${attributes}>
        <summary class="jpdb-reader-local-title">${escapeHtml$1(label)}</summary>
        <div class="jpdb-reader-local-entry yomu-wanikani-body">
            <div class="jpdb-reader-meta">Level ${subject.level}${stage ? ` · ${escapeHtml$1(stage)}` : ""}${due ? ` · due ${escapeHtml$1(due)}` : ""}${info.reviewStatistic ? ` · ${info.reviewStatistic.percentageCorrect}% correct` : ""}</div>
            <div class="yomu-wanikani-public-definitions"${publicDefinitionPayload ? ` data-definition-translation-text data-definition-translation-payload="${escapeHtml$1(publicDefinitionPayload)}"` : ""}>
                <p><strong>Meanings:</strong> ${meanings}</p>
                ${acceptedAlternatives ? `<p><strong>Also accepted:</strong> ${acceptedAlternatives}</p>` : ""}
                ${blockedAlternatives ? `<p><strong>Not accepted:</strong> ${blockedAlternatives}</p>` : ""}
            </div>
            ${readings ? `<p><strong>Readings:</strong> ${readings}</p>` : ""}
            ${synonyms ? `<p><strong>Your synonyms:</strong> ${synonyms}</p>` : ""}
            ${audio ? `<div class="yomu-wanikani-audio">${audio}</div>` : ""}
            ${renderMnemonic("Meaning mnemonic", subject.meaningMnemonic)}
            ${renderMnemonic("Meaning hint", subject.meaningHint)}
            ${renderMnemonic("Reading mnemonic", subject.readingMnemonic)}
            ${renderMnemonic("Reading hint", subject.readingHint)}
            ${renderNote("Your meaning note", info.studyMaterial?.meaningNote)}
            ${renderNote("Your reading note", info.studyMaterial?.readingNote)}
            ${components}${similar}${related}
            ${sentences ? `<div><strong>Context sentences</strong><ul>${sentences}</ul></div>` : ""}
            ${safeExternalUrl(subject.documentUrl) ? `<p><a href="${escapeHtml$1(subject.documentUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml$1(subject.characters || subject.slug)} on WaniKani</a></p>` : ""}
        </div>
    </details>`;
  }
  function renderLoadingSource(label, attributes) {
    return `<details class="jpdb-reader-local jpdb-reader-source-card yomu-wanikani-source" data-source="wanikani" ${attributes}><summary class="jpdb-reader-local-title">${escapeHtml$1(label)}</summary><div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading WaniKani…</div></div></details>`;
  }
  function renderMnemonic(label, value) {
    return value ? `<div class="yomu-wanikani-mnemonic"><strong>${escapeHtml$1(label)}</strong><p>${renderWanikaniMarkup(value)}</p></div>` : "";
  }
  function renderNote(label, value) {
    return value ? `<div><strong>${escapeHtml$1(label)}</strong><p>${escapeHtml$1(value)}</p></div>` : "";
  }
  function renderSubjectLinks(label, subjects) {
    if (!subjects.length) return "";
    return `<p><strong>${escapeHtml$1(label)}:</strong> ${subjects.map((subject) => safeExternalUrl(subject.documentUrl) ? `<a href="${escapeHtml$1(subject.documentUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml$1(subject.characters || primaryMeaning(subject) || subject.slug)}</a>` : escapeHtml$1(subject.characters || primaryMeaning(subject) || subject.slug)).join(", ")}</p>`;
  }
  function wanikaniStageLabel$1(stage) {
    if (stage <= 0) return "lesson";
    if (stage <= 4) return `apprentice ${stage}`;
    if (stage <= 6) return `guru ${stage - 4}`;
    return stage === 7 ? "master" : stage === 8 ? "enlightened" : "burned";
  }
  function formatDate(value, language) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
  function safeMediaUrl(value) {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }
  function preferredWanikaniAudio(items) {
    const preferred = /* @__PURE__ */ new Map();
    for (const item of items.filter((candidate) => safeMediaUrl(candidate.url))) {
      const key = item.sourceId !== void 0 ? `source:${item.sourceId}` : item.voiceActorName || item.pronunciation || item.voiceGender ? `voice:${item.voiceActorName ?? ""}:${item.pronunciation ?? ""}:${item.voiceGender ?? ""}` : `url:${item.url}`;
      const existing = preferred.get(key);
      if (!existing || audioFormatPreference(item.contentType) > audioFormatPreference(existing.contentType)) {
        preferred.set(key, item);
      }
    }
    return [...preferred.values()];
  }
  function audioFormatPreference(contentType) {
    if (contentType === "audio/mpeg") return 3;
    if (contentType === "audio/webm") return 2;
    if (contentType === "audio/ogg") return 1;
    return 0;
  }
  function safeExternalUrl(value) {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }
  const WANIKANI_DASHBOARD_URL = "https://www.wanikani.com/dashboard";
  function createWanikaniSrsAdapter(client) {
    return {
      id: "wanikani",
      label: "WaniKani",
      capabilities: { stats: true, queue: true, review: true, mine: false, import: false },
      hasCredential: () => client.hasCredential(),
      // /user must be verified before anything else is trusted or fetched.
      verify: () => client.getUser().then(() => true, () => false),
      stats: () => wanikaniStats(client),
      queue: (limit) => wanikaniQueue(client, limit),
      review: (request) => reviewWanikaniCard(client, request),
      mine: () => Promise.reject(new WanikaniApiError("WaniKani has no API to add arbitrary words; only due reviews can be graded from Yomu."))
    };
  }
  async function wanikaniStats(client) {
    await client.getUser();
    const summary = await client.getSummary();
    return {
      providerId: "wanikani",
      fetchedAt: Date.now(),
      reviewsDue: summaryDueCount(summary),
      levelCounts: {},
      raw: summary
    };
  }
  async function wanikaniQueue(client, limit = 50) {
    await client.getUser();
    const maxLevel = await client.effectiveMaxLevel();
    const summary = await client.getSummary();
    const dueSubjectIds = summaryDueSubjectIds(summary);
    const assignments = dueSubjectIds.size ? await client.getAssignments({ subjectIds: [...dueSubjectIds], immediatelyAvailableForReview: true }) : [];
    const parsedAssignments = parseAssignments(assignments).filter((assignment) => dueSubjectIds.has(assignment.subjectId)).slice(0, Math.max(0, Math.floor(limit)));
    if (!parsedAssignments.length) {
      return { providerId: "wanikani", fetchedAt: Date.now(), cards: [], dueCount: 0, newCount: 0, reviewCount: 0 };
    }
    const rawSubjects = await client.getSubjects({ ids: parsedAssignments.map((assignment) => assignment.subjectId) });
    const subjectById = /* @__PURE__ */ new Map();
    for (const raw of rawSubjects) {
      const subject = parseWanikaniSubject(raw);
      if (subject) subjectById.set(subject.id, subject);
    }
    const allowedSubjects = new Set(subjectsWithinLevel([...subjectById.values()], maxLevel).map((subject) => subject.id));
    const cards = parsedAssignments.filter((assignment) => allowedSubjects.has(assignment.subjectId)).map((assignment) => reviewableFromAssignment(assignment, subjectById.get(assignment.subjectId))).filter((card) => card !== null);
    return {
      providerId: "wanikani",
      fetchedAt: Date.now(),
      cards,
      dueCount: cards.length,
      newCount: cards.filter((card) => card.state.includes("new")).length,
      reviewCount: cards.length
    };
  }
  function reviewableFromAssignment(assignment, subject) {
    if (!subject) return null;
    return {
      providerId: "wanikani",
      providerCardId: String(assignment.id),
      providerReviewId: String(assignment.id),
      providerReviewableId: String(subject.id),
      kind: subject.type === "radical" ? "unknown" : subject.type === "kanji" ? "kanji" : "vocabulary",
      expression: subject.characters ?? subject.slug,
      reading: subject.type === "radical" ? "" : primaryReading(subject) || (subject.characters ?? subject.slug),
      meanings: [{ glosses: subject.meanings.map((meaning) => meaning.meaning), partOfSpeech: [] }],
      state: wanikaniAssignmentCardState(assignment),
      srsLevel: wanikaniStageLabel(assignment.srsStage),
      dueAt: assignment.availableAt ? Date.parse(assignment.availableAt) : null,
      sourceUrl: subject.documentUrl || WANIKANI_DASHBOARD_URL,
      raw: { assignment, subject }
    };
  }
  function wanikaniAssignmentCardState(assignment) {
    if (assignment.burnedAt) return ["known"];
    if (assignment.srsStage === 0) return ["new"];
    if (assignment.availableAt && Date.parse(assignment.availableAt) <= Date.now()) {
      return assignment.srsStage >= 7 ? ["due", "mastered"] : ["due", "learning"];
    }
    if (assignment.srsStage >= 7) return ["mastered"];
    return ["learning"];
  }
  function wanikaniStageLabel(srsStage) {
    if (srsStage <= 0) return "lesson";
    if (srsStage <= 4) return "apprentice";
    if (srsStage <= 6) return "guru";
    if (srsStage === 7) return "master";
    if (srsStage === 8) return "enlightened";
    return "burned";
  }
  function parseAssignments(raw) {
    return raw.map(parseAssignment).filter((assignment) => assignment !== null);
  }
  function parseAssignment(raw) {
    if (!isRecord(raw)) return null;
    const data = isRecord(raw.data) ? raw.data : {};
    const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
    const subjectId = typeof data.subject_id === "number" ? data.subject_id : Number(data.subject_id);
    if (!Number.isFinite(id) || !Number.isFinite(subjectId)) return null;
    return {
      id,
      subjectId,
      subjectType: typeof data.subject_type === "string" ? data.subject_type : "",
      srsStage: typeof data.srs_stage === "number" ? data.srs_stage : 0,
      availableAt: typeof data.available_at === "string" ? data.available_at : null,
      startedAt: typeof data.started_at === "string" ? data.started_at : null,
      burnedAt: typeof data.burned_at === "string" ? data.burned_at : null,
      unlockedAt: typeof data.unlocked_at === "string" ? data.unlocked_at : null
    };
  }
  function summaryDueSubjectIds(summary) {
    const ids = /* @__PURE__ */ new Set();
    const reviews = isRecord(summary) && isRecord(summary.data) ? summary.data.reviews : void 0;
    if (!Array.isArray(reviews)) return ids;
    const now = Date.now();
    for (const entry of reviews) {
      if (!isRecord(entry)) continue;
      const availableAt = typeof entry.available_at === "string" ? Date.parse(entry.available_at) : NaN;
      if (Number.isFinite(availableAt) && availableAt > now) continue;
      const subjectIds = Array.isArray(entry.subject_ids) ? entry.subject_ids : [];
      for (const subjectId of subjectIds) if (typeof subjectId === "number") ids.add(subjectId);
    }
    return ids;
  }
  function summaryDueCount(summary) {
    return summaryDueSubjectIds(summary).size;
  }
  function wanikaniReviewInput(card, grade) {
    const subject = isRecord(card.raw) && isRecord(card.raw.subject) ? card.raw.subject : void 0;
    const isRadical = subject?.type === "radical";
    const failed = grade === "nothing" || grade === "again" || grade === "fail" || grade === "something" || grade === "hard";
    return {
      incorrectMeaningAnswers: failed ? 1 : 0,
      incorrectReadingAnswers: !failed || isRadical ? 0 : 1
    };
  }
  async function reviewWanikaniCard(client, request) {
    if (request.card.providerId !== "wanikani" || !request.card.state.includes("due")) {
      throw new WanikaniApiError("Only a currently due WaniKani assignment can be reviewed. Reload the WaniKani queue and try again.");
    }
    const assignmentId = Number(request.card.providerCardId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      throw new WanikaniApiError("WaniKani grading needs a valid assignment id. Reload the WaniKani queue and try again.");
    }
    const input = wanikaniReviewInput(request.card, request.grade);
    const raw = await client.createReview({
      assignment_id: assignmentId,
      incorrect_meaning_answers: input.incorrectMeaningAnswers,
      incorrect_reading_answers: input.incorrectReadingAnswers
    });
    const response = isRecord(raw) ? raw : void 0;
    const reviewData = response && isRecord(response.data) ? response.data : response;
    const resourcesUpdated = response && isRecord(response.resources_updated) ? response.resources_updated : reviewData && isRecord(reviewData.resources_updated) ? reviewData.resources_updated : void 0;
    const assignment = parseAssignment(resourcesUpdated && isRecord(resourcesUpdated.assignment) ? resourcesUpdated.assignment : reviewData);
    if (!assignment) return { card: request.card, raw };
    return {
      card: {
        ...request.card,
        state: wanikaniAssignmentCardState(assignment),
        srsLevel: wanikaniStageLabel(assignment.srsStage),
        dueAt: assignment.availableAt ? Date.parse(assignment.availableAt) : null
      },
      raw
    };
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  registerYomuCompanion("wanikani", {
    WanikaniClient,
    WanikaniLookupClient,
    WanikaniSourceController,
    renderWanikaniDefinitionMount,
    createWanikaniSrsAdapter
  });
})();
