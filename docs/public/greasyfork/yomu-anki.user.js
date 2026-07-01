(function() {
  "use strict";
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
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_ORIGIN = "https://yomureader.com";
  const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
  const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const JPDB_DEFINITION_SOURCE_ID = "__jpdb__";
  const JITEN_DEFINITION_SOURCE_ID = "__jiten__";
  const ANKI_SOURCE_ID = "__anki__";
  const STUDY_TRANSLATION_SOURCE_ID = "__study_translation__";
  const STUDY_GRAMMAR_SOURCE_ID = "__study_grammar__";
  const IMMERSION_KIT_SOURCE_ID = "__immersion_kit__";
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
    "d1vjc5dkcd3yh2.cloudfront.net"
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
    if (!isOfficialHostedReaderOrigin$1() || !isSharedPublicProxySafeRequest(targetUrl, options)) return [];
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
      return IMMERSION_KIT_API_HOSTS.has(target.hostname) || target.hostname === "api.nadeshiko.co";
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
  function isOfficialHostedReaderOrigin$1() {
    if (typeof location === "undefined") return false;
    return location.hostname === "yomureader.com" || location.hostname === "www.yomureader.com";
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
  async function fetchWithCorsFallbacks(targetUrl, configuredProxyUrl = "", options = {}) {
    const candidates = fetchUrlCandidates(targetUrl, configuredProxyUrl, options);
    if (!candidates.length) throw new Error("No configured proxy.");
    let lastError;
    for (const [index, candidate] of candidates.entries()) {
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
    const direct = directFetchUrl(targetUrl, options, Boolean(configured));
    const directCandidate = direct ? { url: direct, kind: "direct" } : null;
    const proxyCandidates = [
      configured ? { url: configured, kind: "configured-proxy" } : null,
      ...publicProxies.map((url) => ({ url, kind: "public-proxy" }))
    ].filter((candidate) => Boolean(candidate));
    const orderedCandidates = shouldPreferProxyFirst(targetUrl, Boolean(directCandidate), proxySafe) ? [...proxyCandidates, directCandidate] : [directCandidate, ...proxyCandidates];
    return uniqueFetchCandidates([
      ...orderedCandidates
    ]);
  }
  function directFetchUrl(targetUrl, options, hasConfiguredProxy) {
    if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
    if (hasConfiguredProxy && shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
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
  const initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
  const initialWindowAddEventListener = initialWindowMethod("addEventListener");
  const initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
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
    return pageCompartmentValue(detail, { cloneFunctions: false, wrapReflectors: true });
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
  const BRIDGE_MARKER$1 = "yomuUserscriptHttpBridge";
  const BRIDGE_TIMEOUT_MS$1 = 3e4;
  function getUserscriptHttpRequest() {
    for (const candidate of userscriptRequestCandidates()) {
      const request = asUserscriptRequest(candidate.request);
      if (request) {
        return request.bind(candidate.thisArg);
      }
    }
    return userscriptHttpEventBridge();
  }
  function userscriptHttpEventBridge() {
    if (typeof window === "undefined" || typeof document === "undefined") return void 0;
    if (bridgeMarkerDataset$1()?.[BRIDGE_MARKER$1] !== "true") return void 0;
    return (options) => new Promise((resolve, reject) => {
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
    });
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
  async function requestHttp(url, options = {}) {
    const userscriptRequest = getUserscriptHttpRequest();
    if (options.preferFetch && (!userscriptRequest || isSameOriginUrl(url) || window.__YOMU_READER_RUNTIME__ === "newtab" && options.responseType === "blob")) {
      try {
        return await requestViaFetch(url, options);
      } catch (error) {
        if (!userscriptRequest) throw error;
        return await requestViaUserscript(url, options, userscriptRequest);
      }
    }
    if (userscriptRequest) {
      try {
        return await requestViaUserscript(url, options, userscriptRequest);
      } catch (error) {
        if (!shouldRetryWithFetch(error)) throw error;
      }
    }
    return requestViaFetch(url, options);
  }
  function requestViaUserscript(url, options, userscriptRequest) {
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      let handle;
      const tryAbort = () => {
        try {
          handle?.abort?.();
        } catch {
        }
      };
      const handleLoad = (response) => {
        if (response.status < 200 || response.status >= 300) {
          reject(new Error(formatStatusFailure(options, response.status)));
          return;
        }
        try {
          resolve(normalizeUserscriptResponse(response, options.responseType ?? "text"));
        } catch (error) {
          reject(error);
        }
      };
      const onAbort = () => {
        tryAbort();
        reject(abortError());
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const result = userscriptRequest({
        method: options.method ?? "GET",
        url,
        headers: recordHeaders(options.headers),
        data: options.data,
        responseType: options.responseType,
        timeout: options.timeoutMs,
        anonymous: options.anonymous,
        withCredentials: options.withCredentials,
        cookie: options.cookie,
        onload: handleLoad,
        onerror: (error) => reject(error instanceof Error ? error : new Error(formatFailure(options))),
        ontimeout: () => {
          tryAbort();
          reject(new Error(options.timeoutLabel ?? `${options.failureLabel ?? "Request"} timed out.`));
        }
      });
      if (result && typeof result.then === "function") {
        result.then(handleLoad, (error) => reject(error instanceof Error ? error : new Error(formatFailure(options))));
      } else if (result && typeof result.abort === "function") {
        handle = result;
      }
    });
  }
  function abortError() {
    if (typeof DOMException === "function") return new DOMException("Aborted", "AbortError");
    const error = new Error("Aborted");
    error.name = "AbortError";
    return error;
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
  function hostedFallbackProxyUrl(url, options = {}) {
    if (getUserscriptHttpRequest()) return "";
    if (!isOfficialHostedReaderOrigin()) return "";
    if (!isSharedPublicProxySafeRequest(url, options)) return "";
    return YOMU_SHARED_PUBLIC_PROXY_URL;
  }
  function isOfficialHostedReaderOrigin() {
    if (typeof location === "undefined") return false;
    return location.hostname === "yomureader.com" || location.hostname === "www.yomureader.com";
  }
  async function requestViaFetch(url, options) {
    const response = await fetchWithCorsFallbacks(url, (options.proxyUrl ?? "").trim() || hostedFallbackProxyUrl(url, options), {
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
      onboardingHoverShortcut: "Lookup hover modifier",
      manualPageScanShortcut: "Manual page scan shortcut",
      onboardingAddApiKey: "Add API key",
      onboardingAddLocalDictionaries: "Add local dictionaries",
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
      scanPage: "Scan page",
      noUnscannedJapaneseText: "No unscanned Japanese text found.",
      jpdbScanFailed: "Page scan failed.",
      pageCoverageSummary: "{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1",
      settings: "Settings",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "Settings save failed.",
      settingsSections: "Settings sections",
      settingsSearch: "Search settings",
      settingsSearchPlaceholder: "Search settings",
      settingsSearchNoResults: "No matches.",
      selectOptions: "Options",
      save: "Save",
      cancel: "Cancel",
      show: "Show",
      hide: "Hide",
      appearance: "Appearance",
      reading: "Reading",
      dictionaries: "Dictionaries",
      sources: "Sources",
      media: "Media",
      mining: "Mining",
      shortcuts: "Shortcuts",
      help: "Help",
      interface: "Interface",
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
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Paste separate API keys here. For Bunpro, open Bunpro settings while signed in and press the Yomu import button. Local Yomu SRS works without an account.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      bunproSettings: "Bunpro settings",
      jpdbApiKeyConfigured: "JPDB key set.",
      jpdbAndJitenApiKeysConfigured: "Jiten and JPDB keys are set.",
      jpdbApiKeyMissing: "No JPDB key.",
      jpdbConnected: "Connected to JPDB.",
      jpdbAndJitenConnected: "Connected to Jiten and JPDB.",
      jpdbConnectionFailed: "JPDB did not accept the key (network or invalid key).",
      jitenApiKeyConfigured: "Jiten key set.",
      jitenApiKeyMissing: "No Jiten key.",
      statusEnabled: "enabled",
      statusDisabled: "disabled",
      statusReady: "Ready",
      statusAttention: "Needs setup",
      statusError: "Error",
      disabledControlDescription: "Controlled by another setting.",
      jpdbMiningEnabled: "Allow API review/deck changes",
      bunproMiningEnabled: "Allow Bunpro review/mining",
      yomuLocalSrsEnabled: "Enable local Yomu SRS",
      addToForq: "Also copy JPDB adds to forq",
      enableReviews: "Show review buttons",
      reviewRatingScale: "Review rating scale",
      gradeTargetSelector: "Grade target",
      gradeTargetBoth: "Both",
      gradeTargetJpdb: "Grades JPDB",
      gradeTargetJiten: "Grades Jiten",
      gradeTargetBunpro: "Grades Bunpro",
      gradeTargetYomuLocal: "Grades Yomu",
      gradeTargetAnki: "Grades Anki card: {target}",
      gradeTargetJpdbAndAnki: "Grades JPDB + Anki card: {target}",
      gradeTargetJitenAndAnki: "Grades Jiten + Anki card: {target}",
      gradeTargetBunproAndAnki: "Grades Bunpro + Anki card: {target}",
      gradeTargetYomuLocalAndAnki: "Grades Yomu + Anki card: {target}",
      missingAnkiCardId: "Missing Anki card id.",
      jpdbPageEnhancements: "Dictionary site enhancements",
      jpdbPageEnhancementsEnabled: "Enhance dictionary pages",
      jpdbPageWordEnhancementsEnabled: "Add sources to word/search pages",
      jpdbPageKanjiEnhancementsEnabled: "Add sources to kanji pages",
      jpdbPageEnhancementsHelp: "",
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
      popupFontFamily: "Popup Japanese font",
      fontPresetYomuDefault: "Built-in font",
      fontPresetJapaneseSans: "Japanese sans",
      fontPresetHiraginoYuGothic: "Hiragino / Yu Gothic",
      fontPresetJapaneseRounded: "Japanese rounded",
      fontPresetJapaneseSerif: "Japanese serif",
      fontPresetSystemUi: "System UI",
      fontPresetCustom: "Custom...",
      customFontFamily: "Custom font stack",
      popupFontWeight: "Popup Japanese weight",
      enableLogging: "Enable diagnostic logging",
      diagnostics: "Diagnostics",
      diagnosticsHelp: "Print diagnostics to the console.",
      accentColor: "Accent color",
      newTab: "Study",
      newTabEnabled: "Set Study as the new tab",
      newTabAnkiEnabled: "Use Anki cards in Study",
      newTabAnkiReviewDecks: "Anki review decks",
      newTabAnkiReviewDecksHelp: "Uncheck decks to skip.",
      newTabSource: "Study review source",
      newTabAuto: "Auto: Yomu, accounts, then study words",
      newTabApiSrs: "API SRS (Jiten / JPDB)",
      newTabBunpro: "Bunpro",
      newTabYomuLocal: "Yomu local SRS",
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
      pitchColorKifuku: "Kifuku (variable)",
      pitchColorUnknown: "Unknown / inherited",
      colorChannels: "Color channels",
      wordHighlightColorSource: "Word highlight color",
      wordUnderlineColorSource: "Word underline color",
      wordTextColorSource: "Word text color",
      subtitleHighlightColorSource: "Subtitle highlight color",
      subtitleUnderlineColorSource: "Subtitle underline color",
      subtitleTextColorSource: "Subtitle text color",
      colorSourceStatus: "JPDB + Anki status",
      colorSourceJpdb: "JPDB status",
      colorSourceAnki: "Anki status",
      colorSourcePitch: "Pitch accent",
      colorChannelsHelp: "",
      interfaceHelp: "",
      popupLookup: "Popup lookup",
      popupLookupEnabled: "Show Yomu lookup popup",
      popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
      parseSelection: "Selection popups",
      lookupOnClick: "Look up on tap or click",
      lookupOnHover: "Look up on hover",
      lookupOnMiddleMouse: "Look up with middle-mouse hold",
      showFloatingButton: "Show settings puck",
      pageScanMode: "Page scanning",
      pageScanModeOff: "Off",
      pageScanModeAuto: "Auto",
      pageScanModeManual: "Manual",
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
      showFurigana: "Enable furigana annotations",
      furiganaMode: "Furigana",
      wordColorStates: "Color words",
      appearancePresetCustom: "Keep current custom settings",
      appearancePresetBalanced: "Balanced reading",
      appearancePresetNoColors: "Plain text",
      appearancePresetNewOnly: "Focus on new words",
      appearancePresetUnderlineNew: "Minimal highlights",
      wordColorStatesAll: "Use all learning states",
      wordColorStatesNewOnly: "Only new / not-in-deck words",
      furiganaDifficultKanji: "Hard kanji only",
      furiganaHideKnown: "Hide familiar words",
      furiganaHoverOnly: "Show on hover",
      furiganaAllParsed: "Show on every parsed word",
      showPitchAccent: "Show pitch accent",
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
      loadingSimilarWords: "Loading words...",
      openToLoadSimilarWords: "Open to load words.",
      noSimilarWords: "No additional words found.",
      kanjiHelp: "",
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
      savedVoice: "Saved voice",
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
      audioSourceLinguaLibre: "(Commons) Lingua Libre",
      audioSourceWiktionary: "(Commons) Wiktionary",
      audioSourceJitenTts: "Jiten text-to-speech",
      audioSourceJpdbTts: "JPDB text-to-speech",
      audioSourceTextToSpeech: "Text-to-speech",
      audioSourceTextToSpeechReading: "Text-to-speech (Kana reading)",
      audioSourceCustom: "Custom direct audio file URL",
      audioSourceCustomJson: "Custom URL",
      audioCustomJsonPlaceholder: "Yomitan or Ultimate audio source URL",
      audioCustomUrlPlaceholder: "Direct audio file URL",
      audioBuiltInPlaceholder: "Built-in source, no URL needed",
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
      noImmersionExamples: "No Immersion Kit examples found.",
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
      randomOrder: "Random",
      ocrEnabled: "Read text in images",
      ocrAutoScanImages: "Read images automatically",
      ocrShowTextOverlay: "Show recognized text areas",
      ocrVideoPauseFrames: "Read paused video frames",
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
      ocrBackgroundColor: "Image highlight",
      ocrBackgroundOpacity: "Image highlight opacity",
      ocrFontScale: "Image text scale",
      ocrEndpointUrl: "Local OCR server URL",
      ocrCustomLocalServer: "Local OCR server URL",
      ocrEngine: "Local OCR engine",
      ocrEngineMangaOcr: "MangaOCR (best for manga)",
      ocrEngineAppleVision: "Apple Vision (macOS)",
      cloudVisionApiKey: "Google Cloud Vision API key",
      ocrHelp: "Reads nearby images. Google Lens needs no setup.",
      ocrCloudHelp: "Paste a Google Cloud Vision API key.",
      ocrLocalHelp: "Run MangaOCR/Apple Vision locally and enter its URL.",
      subtitlePlayerEnabled: "Enable video subtitle player",
      subtitleAutoDetect: "Auto-detect page subtitles",
      subtitleOverlayVisible: "Show subtitle overlay",
      subtitleSecondaryVisible: "Show native subtitles",
      subtitleNativeBlurred: "Blur native subtitles until hover",
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
      right: "Right",
      left: "Left",
      bottom: "Below",
      showWhenNeeded: "Compact controls",
      hideControls: "Hide controls",
      alwaysVisible: "Always visible",
      subtitleFontSize: "Subtitle font size (px)",
      subtitleBottomOffset: "Subtitle bottom offset (%)",
      subtitleTextColor: "Subtitle color",
      subtitleOutlineColor: "Subtitle outline",
      subtitleBackgroundColor: "Subtitle background",
      subtitleBackgroundOpacity: "Subtitle background opacity",
      subtitleFontFamily: "Subtitle font family",
      subtitleFontWeight: "Subtitle font weight",
      subtitleSeekPadding: "Subtitle seek padding (s)",
      subtitlePreview: "Live subtitle preview",
      preview: "Preview",
      youtubeImmersionEnabled: "Japanese YouTube only",
      preferJapaneseSiteLanguage: "Prefer Japanese site language and location",
      youtubeShowChannelRecommendations: "Show Japanese channel suggestions",
      youtubeShowFilterNotice: "Show hidden-video notice",
      youtubeHelp: "Prefer Japanese UI and Japan-local content.",
      youtubeFilterOn: "YouTube filter on",
      youtubeFilterOff: "YouTube filter off",
      youtubeShowHiddenVideos: "Show hidden videos",
      youtubeHideHiddenVideos: "Hide hidden videos",
      youtubeHideNotice: "Hide notice",
      youtubeFilterShowing: "{appName} shows {count} hidden item{plural}",
      youtubeFilterHid: "{appName} hid {count} non-Japanese item{plural}",
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
      noScannedFields: "",
      mappingForNoteType: "Mapping for {model}",
      currentNoteType: "current note type",
      ankiFieldMappingSelect: "{role} field",
      ankiRoleExpression: "Expression",
      ankiRoleReading: "Reading",
      ankiRoleMeaning: "Meaning",
      ankiRoleSentence: "Sentence",
      ankiRoleAudio: "Audio",
      ankiRoleImage: "Image",
      testAnki: "Check AnkiConnect",
      prepareAnki: "Create Yomu note type",
      ankiCheckingConnection: "Checking AnkiConnect at {url}.",
      ankiMiningDisabledStatus: "Anki mining disabled.",
      ankiTesting: "Checking AnkiConnect...",
      ankiPreparing: "Creating Yomu deck/note type...",
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
      localDictionariesEnabled: "Show imported dictionary definitions",
      dictionarySourcesInitiallyExpanded: "Open sources by default",
      localDictionaryMaxResults: "Dictionary result limit",
      cloudSettingsSync: "Google Drive settings sync",
      cloudSettingsSyncHelp: "Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import a Yomitan ZIP, settings export, or backup. Term, pitch, and frequency dictionaries add definitions, accents, and badges.",
      lookupPills: "Lookup pills",
      lookupPillsHelp: "External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.",
      copiesCurrentWord: "Copies the current word",
      lookupPillLabel: "Lookup pill label",
      lookupPillLabelNumber: "Lookup pill {number} label",
      lookupUrlTemplate: "Lookup URL template",
      lookupUrlTemplateNumber: "Pill {number} URL",
      lookupPillOrder: "Lookup pill order",
      builtInAction: "Built-in action",
      recommendedDownloads: "Dictionaries",
      termDictionaries: "Term dictionaries",
      kanjiDictionaries: "Kanji dictionaries",
      pitchDictionaries: "Pitch dictionaries",
      frequencyDictionaries: "Frequency dictionaries",
      install: "Install",
      installing: "Installing",
      queued: "Queued",
      dictionaryGuide: "Guide",
      saveAfterInstall: "Save after install",
      download: "Download",
      downloadAndImport: "Download and import",
      update: "Update",
      noLocalDictionaries: "No term dictionary imported yet. Install JMdict, Jitendex, or WTY for definitions; pitch/frequency dictionaries only add accents or badges.",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryOnlyJpdb: "Only JPDB is enabled. Import JMdict, Jitendex, WTY, or another term dictionary for local definitions.",
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
      dictionaryDownloadTimedOut: "Dictionary download timed out.",
      dictionaryDownloadNotZip: "Download was not a ZIP.",
      dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
      dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
      dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
      dictionaryInstallQueueHelp: "Install a term dictionary first for definitions. Pitch and frequency dictionaries add accents and badges, not normal definition text.",
      dictionaryInstallQueued: "{dictionary} queued.",
      dictionaryInstallSaveBlocked: "Import running. Save unlocks when done.",
      dictionaryImportQueueStatus: "{count} install{plural} running.",
      dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
      dictionaryRemoving: "Removing {dictionary}...",
      dictionaryRemoved: "Removed {dictionary}.",
      dictionaryImportComplete: "Imported {records} from {sources} source{plural}.",
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
      localDictionaryText: "Dictionary text",
      localSenseSingular: "meaning",
      localSensePlural: "meanings",
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
      blankPlainHover: "Blank means hover without a key",
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
      audioRequestReturnedNonAudio: "Audio request returned non-audio",
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
      playVideo: "Play video",
      pauseVideo: "Pause video",
      enterFullscreen: "Enter fullscreen",
      exitFullscreen: "Exit fullscreen",
      copySubtitle: "Copy subtitle",
      subtitleFallbackLabel: "Subtitle",
      subtitlesTitle: "Subtitles",
      openSubtitlePanel: "Open subtitle panel",
      closeSubtitlePanel: "Close subtitle panel",
      subtitleStyle: "Subtitle style",
      subtitleResetDefaults: "Reset defaults",
      closeSubtitleDrawer: "Close subtitle drawer",
      enableSubtitleAutoHide: "Auto-hide panel while playing",
      disableSubtitleAutoHide: "Keep panel open while playing",
      subtitleAutoHideShort: "Auto",
      loadJapaneseSubtitles: "Load Japanese subtitles",
      loadPrimarySubtitles: "Load primary subtitles",
      loadNativeSubtitles: "Load native subtitles",
      searchAnimeSubtitles: "Search anime subtitles",
      toggleNativeSubtitleBlur: "Toggle native subtitle blur",
      subtitleTrackDetectedSingular: "1 subtitle track detected",
      subtitleTracksDetected: "subtitle tracks detected",
      noSubtitleTracksDetected: "No subtitle tracks detected yet.",
      resizeTranscriptPanel: "Resize transcript panel",
      resizeSubtitleTracksPanel: "Resize subtitle tracks panel",
      subtitleNavigation: "Subtitle nav",
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
      noAutoDetectedSubtitleTracks: "",
      autoDetectedTracksWillAppear: "Subtitle tracks appear here.",
      autoDetectedOptionSingular: "1 subtitle option",
      autoDetectedOptions: "subtitle options",
      detected: "Detected",
      japaneseOverlay: "Japanese overlay",
      primaryOverlay: "primary overlay",
      nativeOverlay: "native overlay",
      unsetJapaneseSubtitles: "Unset Japanese",
      unsetPrimarySubtitles: "Unset primary",
      japaneseSubtitles: "Japanese",
      primarySubtitles: "Primary",
      unsetNativeSubtitles: "Unset native",
      nativeSubtitles: "Native",
      chooseJapaneseSubtitles: "Choose Japanese subtitles",
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
      ocrEnabledToast: "Image reading enabled.",
      ocrHiddenToast: "Image reading hidden.",
      ocrPlayVideo: "Play video",
      ocrResumeVideo: "Resume video",
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
      updateHelpNotes: "Keep one Yomu script enabled. If updates stall on iPhone/iPad, open this link in Safari.",
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
      localAudio: "Local Audio",
      changelog: "Changelog",
      support: "Support",
      github: "GitHub",
      word: "Word",
      search: "Search",
      statsImportJpdbHistory: "Import JPDB review history",
      openYomuSettings: `Open ${APP_NAME} settings`,
      newTabAddressCopied: "Study address copied.",
      loading: "Loading...",
      refreshing: "Refreshing...",
      reveal: "Reveal",
      revealTranslation: "Reveal translation",
      immersionExampleControls: "Immersion Kit example controls",
      loadingKanjiDetails: "Loading kanji details...",
      loadingMnemonicImages: "Loading mnemonic images...",
      lookupDialog: `${APP_NAME} lookup`,
      resizeLookupSheet: "Drag to resize lookup sheet, or tap to close",
      showMiningActions: "Show mining actions",
      hideMiningActions: "Hide mining actions",
      switchReviewTarget: "Switch review target",
      switchGradingProvider: "Switch grading provider",
      jpdbKanjiUpdated: "JPDB kanji updated.",
      jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check kanji reviews.",
      apiSrsActionsDisabled: "API mining actions are disabled in settings.",
      addJpdbApiKeyReview: "Add a JPDB API key to review JPDB cards.",
      addJitenApiKeyReview: "Add a Jiten API key to review Jiten cards.",
      addBunproApiKeyReview: "Add a Bunpro frontend API token to review Bunpro cards.",
      actionFailed: "Action failed.",
      dictionary: "Dictionary",
      dictionariesExported: "Dictionaries exported.",
      local: "Local",
      dict: "dict",
      filterStudy: "Study",
      filterAll: "All",
      sourceAuto: "Auto",
      sortRandom: "Random",
      sortFrequency: "Frequency",
      sortState: "State",
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
      factoryResetDictionaryWarning: "Settings reset. Close other tabs.",
      factoryResetOtherTabReloading: "よむ reset elsewhere. Reloading...",
      factoryResetDeleteSettingsFailed: "Could not delete settings.",
      issues: "Issues",
      donate: "Donate",
      discord: "Discord",
      documentation: "Documentation",
      openOnJpdb: "Open on JPDB",
      openOnLookup: "Open on {label}",
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
      kanjiMapData: "Kanji Map data",
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
      addToMining: "Add to deck",
      addToMiningHint: "Add to selected API SRS deck.",
      addToDeck: "Add to deck",
      addToDeckHint: "Add without grading.",
      deck: "Deck",
      deckActions: "Deck actions",
      reviewAddsToDeck: "Reviewing will add new words to",
      reviewBlockedBlacklisted: "Blacklisted. Unlist before reviewing.",
      reviewBlockedNeverForget: "Never-forget. Remove before reviewing.",
      reviewBlockedLocked: "Locked. Unlock before reviewing.",
      reviewBlockedRedundant: "JPDB marks this redundant.",
      ankiCardsSuspended: "Suspended in Anki (works like a blacklist).",
      ankiCardsUnsuspended: "Unsuspended in Anki.",
      ankiNeverForgetTagAdded: "Tagged yomu-never-forget.",
      ankiNeverForgetTagRemoved: "Removed yomu-never-forget.",
      forget: "Forget",
      never: "Never forget",
      neverHint: "Move to never-forget and count as known.",
      forgetHint: "Remove from never-forget to mine/review.",
      unlist: "Unlist",
      unlistHint: "Remove from blacklist to mine/review.",
      blacklist: "Blacklist",
      blacklistHint: "Ignore this exact word.",
      vocabularyStatusUpdated: "Vocabulary status updated.",
      addToAnki: "Add to Anki",
      checkingAnki: "Checking Anki...",
      sendToMobileAnki: "Send to {app}",
      mobileAnkiActionHint: "Opens mobile Anki for a new note.",
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
      ankiMergeNeedsDesktop: "Merging needs desktop AnkiConnect.",
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
      ankiConnectNeedsBridge: "AnkiConnect needs the userscript bridge.",
      mobileAnkiReady: "Anki offline. Handoff can create notes.",
      ankiConnectionReady: "Connected. AnkiConnect is reachable.",
      ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
      ankiPromptRecallWord: "Recall the highlighted word.",
      ankiMeaningHeading: "Meaning",
      ankiPitchHeading: "Pitch",
      ankiPartOfSpeechHeading: "Part of speech",
      ankiLinksHeading: "Links",
      ankiSourceHeading: "Source",
      ankiTemplateContext: "Context",
      ankiTemplateRecognition: "Recognition",
      ankiLocalDictionaryStatus: "local dictionary",
      selection: "Selection",
      parsedFrom: "Parsed from",
      selectionPopoverShowTranslation: "Show translation in selection popovers",
      imageReadingEnabled: "Image reading enabled.",
      imageReadingHidden: "Image reading hidden.",
      ocrModeAutoToast: "Image OCR automatic.",
      ocrModeManualToast: "Image OCR on tap or hover.",
      ocrModeOffToast: "Image OCR off.",
      subtitleOverlayEnabled: "Subtitle overlay enabled.",
      subtitleOverlayHidden: "Subtitle overlay hidden.",
      reviewFailed: "Review failed.",
      reviewActionsDisabled: "Review actions are disabled in settings.",
      jpdbLookupFailed: "JPDB lookup failed.",
      jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
      jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
      addedToJpdb: "Added to JPDB.",
      jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
      jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
      bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
      yomuLocalSrsDisabled: "Enable local Yomu SRS in Settings first.",
      chooseJitenStudyDeck: "Choose a Jiten study deck first.",
      addedToJiten: "Added to Jiten.",
      addedToBunpro: "Added to Bunpro.",
      addedToYomuLocal: "Added to Yomu.",
      kanjiDetailsUnavailable: "Kanji details are not available yet.",
      loadingDictionaryDetails: "Loading dictionary details...",
      sourceSingular: "source",
      sourcePlural: "sources",
      jitenCompositeWords: "Composite words",
      usedInVocabulary: "Used in vocabulary",
      exampleSentences: "Example sentences",
      playJpdbExampleAudio: "Play JPDB example audio",
      wordsUsingKanji: "Words using {kanji}",
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
      kanjiSection: "Kanji section",
      dictionaryDisplayName: "Dictionary display name",
      sourcePriority: "{source} priority",
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
      recommendedMarvncMonolingual: "Monolingual collection.",
      fallbackSetupTitle: "Public lookup",
      fallbackSetupCopy: "Search without a JPDB key. Add dictionaries offline.",
      fallbackSetupDictionaries: "Add dictionaries",
      fallbackSetupJpdb: "Add JPDB key",
      getApp: `Get ${APP_NAME}`,
      offlineCacheGradesDisabled: "Offline cache. Grades sync on reconnect.",
      recognizing: "Recognizing...",
      noHandwritingMatch: "No match yet. Type or paste kanji.",
      yourKanjiDrawing: "Your kanji drawing",
      jpdbKanjiActions: "JPDB kanji actions",
      couldNotSearchLocalDictionaries: "Could not search local dictionaries.",
      subtitlePanel: "Subtitles",
      lines: "Lines",
      tracks: "Tracks",
      currentLineWillAppear: "The current line appears when captions are available.",
      native: "Native",
      unsetJapanese: "Unset Japanese",
      unsetNative: "Unset native",
      options: "options",
      option: "option",
      line: "line",
      subtitleTrackDetected: "subtitle track detected",
      translation: "Translation",
      grammar: "Grammar",
      meaning: "Meaning",
      japaneseLabel: "Japanese",
      readSentenceAloud: "Read sentence aloud",
      openSectionToTranslate: "Open this section to translate.",
      translationUnavailable: "Translation unavailable.",
      translating: "Translating...",
      findingGrammar: "Finding grammar...",
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
      grammarKindHanabira: "Hanabira grammar",
      grammarLevelCore: "Core"
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
  const JA_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingHoverShortcut	ホバー検索の修飾キー
onboardingAddApiKey	APIキーを追加
onboardingAddLocalDictionaries	ローカル辞書を追加
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
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
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
statsImportJpdbHistory	JPDB復習履歴を読み込む
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
openYomuSettings	{APP_NAME}の設定を開く
newTabAddressCopied	学習ページのアドレスをコピーしました。
getApp	{APP_NAME}を入手
loading	読み込み中...
refreshing	更新中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
loadingKanjiDetails	漢字情報を読み込み中...
loadingMnemonicImages	覚え方画像を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
switchReviewTarget	採点先を切り替える
switchGradingProvider	採点サービスを切り替える
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
addBunproApiKeyReview	Bunproレビューにはfrontend_api_tokenが必要です。
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
noImmersionExamples	イマージョンキットの例文が見つかりません。
noImmersionExamplesCompact	例文なし
noLocalDictionaries	語句辞書は未追加です。定義にはJMdict、Jitendex、WTYなどを追加してください。ピッチ/頻度辞書だけでは定義文は増えません。
kanjiMapData	漢字マップデータ
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
fallbackSetupTitle	辞書から始める
fallbackSetupCopy	JPDBキーなしで検索。辞書でオフライン対応。
fallbackSetupDictionaries	辞書を追加
fallbackSetupJpdb	JPDBキーを追加
offlineCacheGradesDisabled	オフラインです。採点は再接続時に同期されます。
recognizing	認識中...
noHandwritingMatch	候補なし。漢字を入力/貼り付け。
yourKanjiDrawing	あなたの手書き
jpdbKanjiActions	JPDB漢字操作
couldNotSearchLocalDictionaries	ローカル辞書を検索できませんでした。
subtitlePanel	字幕
lines	行
tracks	トラック
currentLineWillAppear	字幕が来ると現在行を表示。
native	母語
unsetJapanese	日本語を解除
unsetNative	母語字幕を解除
options	件
option	件
line	行
subtitleTrackDetected	字幕トラックを検出
filterStudy	学習
filterAll	すべて
sourceAuto	自動
sortRandom	ランダム
sortFrequency	頻度
sortState	状態
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
loadingSimilarWords	単語を読み込み中...
openToLoadSimilarWords	開くと単語を読み込みます。
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
audioRequestReturnedNonAudio	音声ではない応答です
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
playVideo	動画を再生
pauseVideo	動画を一時停止
enterFullscreen	全画面表示
exitFullscreen	全画面表示を終了
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
closeSubtitleDrawer	字幕ドロワーを閉じる
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitleAutoHideShort	自動
loadJapaneseSubtitles	日本語字幕を読み込む
loadPrimarySubtitles	主字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitleNavigation	字幕ナビ
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
noAutoDetectedSubtitleTracks	自動検出字幕はありません。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
japaneseOverlay	日本語オーバーレイ
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetJapaneseSubtitles	日本語を解除
unsetPrimarySubtitles	主字幕を解除
japaneseSubtitles	日本語
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
chooseJapaneseSubtitles	日本語字幕を選択
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
ocrEnabledToast	画像読み取りを有効にしました。
ocrHiddenToast	画像読み取りを非表示にしました。
ocrPlayVideo	動画を再生
ocrResumeVideo	動画を再開
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
addToDeckHint	採点せずに追加します。
deck	デッキ
deckActions	デッキ操作
reviewAddsToDeck	レビューすると新しい単語を追加します:
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedLocked	JPDBでロック中です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
neverHint	忘れないデッキへ移動します。
forgetHint	忘れないデッキから外します。
unlist	解除
unlistHint	ブラックリストから外します。
blacklist	ブラックリスト
blacklistHint	この単語を無視します。
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
checkingAnki	Ankiを確認中...
sendToMobileAnki	{app}へ送る
mobileAnkiActionHint	モバイルAnkiで新規ノートを作成します。
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiMergeNeedsDesktop	ノート統合にはデスクトップAnkiConnectが必要です。
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiConnectNeedsBridge	AnkiConnectにはブリッジが必要です。
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
ankiTemplateContext	文脈
ankiTemplateRecognition	認識
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
selection	選択範囲
parsedFrom	解析元
selectionPopoverShowTranslation	選択ポップアップに翻訳を表示
imageReadingEnabled	画像読み取りを有効にしました。
imageReadingHidden	画像読み取りを非表示にしました。
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
yomuLocalSrsDisabled	先に設定でローカルよむSRSを有効にしてください。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
addedToBunpro	Bunproに追加しました。
addedToYomuLocal	よむに追加しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
sourceSingular	ソース
sourcePlural	ソース
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
playJpdbExampleAudio	JPDB例文音声を再生
wordsUsingKanji	{kanji}を使う単語
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
japaneseLabel	日本語
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
grammarKindHanabira	Hanabira文法
grammarLevelCore	基本
`);
  const JA_SETTINGS_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
selectOptions	選択肢
save	保存
cancel	キャンセル
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
interface	インターフェイス
interfaceHelp	インターフェイス設定です。
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
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	APIキーを別々に貼ります。Bunproはログインした状態でBunpro設定を開き、Yomuの取り込みボタンを押します。ローカルよむSRSはアカウントなしで使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbApiKeyMissing	JPDBキーなし。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
jitenApiKeyConfigured	Jitenキーあり。
jitenApiKeyMissing	Jitenキーなし。
statusEnabled	有効
statusDisabled	無効
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
bunproMiningEnabled	Bunproの復習・採掘を許可
yomuLocalSrsEnabled	ローカルよむSRSを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
gradeTargetYomuLocal	よむを採点
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
gradeTargetBunproAndAnki	Bunpro + Ankiカードを採点: {target}
gradeTargetYomuLocalAndAnki	よむ + Ankiカードを採点: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
jpdbPageEnhancementsHelp
fivePoint	5段階: 全然から簡単まで
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
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
newTabEnabled	学習を新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動: よむ・アカウント後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabYomuLocal	ローカルよむSRS
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
pitchColorKifuku	起伏
pitchColorUnknown	不明 / 継承
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
colorSourcePitch	ピッチアクセント
colorChannelsHelp
interfaceHelp	インターフェイス設定です。
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
parseSelection	選択ポップアップを表示
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ページスキャン
pageScanModeOff	オフ
pageScanModeAuto	自動
pageScanModeManual	手動
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
autoplayAudioOnToast	音声の自動再生をオンにしました。
autoplayAudioOffToast	音声の自動再生をミュートしました。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePresetCustom	現在のカスタム設定を保持
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
furiganaDifficultKanji	難しい漢字のみ
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語に表示
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
kanjiHelp
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
savedVoice	保存済み音声
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
randomOrder	ランダム
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを読む
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
ocrBackgroundColor	画像ハイライト背景
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrCustomLocalServer	ローカルOCRサーバーURL
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
youtubeFilterOn	YouTubeフィルター: オン
youtubeFilterOff	YouTubeフィルター: オフ
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
noScannedFields
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを作成
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
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/ピッチ/頻度辞書で定義、アクセント、バッジを追加します。
lookupPills	検索ピル
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabel	検索ピルのラベル
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
install	インストール
installing	インストール中
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
downloadAndImport	ダウンロードしてよむにインポート
update	更新
checkingDictionaries	インポート済み辞書を確認中...
dictionaryOnlyJpdb	JPDBのみです。JMdict、Jitendex、WTYなどの語句辞書でローカル定義を追加してください。
localDictionaryText	辞書テキスト
localSenseSingular	意味
localSensePlural	意味
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
playVideo	動画を再生
pauseVideo	動画を一時停止
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
updateHelpNotes	よむスクリプトは1つだけ有効にしてください。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてください。
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
localAudio	ローカル音声
changelog	変更履歴
support	サポート
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
documentation	ドキュメント
addToMining	デッキに追加
addToMiningHint	選択中のAPI SRSデッキに追加します。
enabledHeader	有効
labelHeader	ラベル
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
kanjiSection	漢字セクション
dictionaryDisplayName	辞書表示名
sourcePriority	{source}の優先度
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
recommendedMarvncMonolingual	日本語辞書集です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedJpdbv2Kana	JPDB由来のおすすめ頻度バッジです。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`);
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
    return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? "未翻訳" : COPY.en[key];
  }
  function cardStateLabel(state, language, fallback = state) {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : fallback;
  }
  function formatUiText(language, key, values) {
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      uiText(language, key)
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
  const MISSING = { missing: true };
  async function gmStorageGet(key, fallback) {
    const getValue = asyncGmGetValue();
    if (getValue) {
      try {
        const value = await getValue(key, MISSING);
        if (value !== MISSING) return value;
        const migrated = localStorageGet(key, MISSING);
        if (migrated !== MISSING) {
          await gmStorageSet(key, migrated);
          return migrated;
        }
        return fallback;
      } catch (error) {
        debugStorageError("GM storage read failed", key, error);
      }
    }
    return localStorageGet(key, fallback);
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
      if (value !== MISSING) return { kind: "found", value };
      return migratedLocalStorageSyncValue(key);
    } catch (error) {
      debugStorageError("GM storage sync read failed", key, error);
      return { kind: "fallback" };
    }
  }
  function migratedLocalStorageSyncValue(key) {
    const migrated = localStorageGet(key, MISSING);
    if (migrated === MISSING) return { kind: "fallback" };
    void gmStorageSet(key, migrated);
    return { kind: "found", value: migrated };
  }
  async function gmStorageSet(key, value) {
    const setValue = asyncGmSetValue();
    if (setValue) {
      await setValue(key, value);
      mirrorManagedValueToHostedStorage(key, value);
      return;
    }
    localStorageSet(key, value);
  }
  function gmStorageSetSync(key, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key, value);
        if (!isPromiseLike(result)) {
          mirrorManagedValueToHostedStorage(key, value);
          return;
        }
      } catch (error) {
        debugStorageError("GM storage sync write failed", key, error);
      }
    }
    localStorageSet(key, value);
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
    return isManagedStorageKey(key) && isHostedYomuOrigin();
  }
  function isHostedYomuOrigin() {
    try {
      const host = location.hostname;
      const path = location.pathname;
      if (location.origin === DOCS_ORIGIN) return true;
      if (host === "hrussellzfac023.github.io") return path.startsWith("/yomu-reader/");
      return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) && path.includes("/newtab/");
    } catch {
      return false;
    }
  }
  function isPromiseLike(value) {
    return Boolean(value) && typeof value.then === "function";
  }
  function asyncGmGetValue() {
    if (typeof GM_getValue === "function") return GM_getValue;
    const modern = globalThis.GM?.getValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
  }
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
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
    return new Promise((resolve, reject) => {
      const handleLoad = (response) => {
        if (response.status >= 200 && response.status < 300) resolve(response.response);
        else reject(new Error(`AnkiConnect request failed (${response.status}).`));
      };
      const result = userscriptRequest({
        method: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        data: body,
        responseType: "json",
        timeout: timeoutMs,
        onload: handleLoad,
        onerror: (error) => reject(error instanceof Error ? error : new Error("AnkiConnect request failed.")),
        ontimeout: () => reject(new Error("AnkiConnect timed out."))
      });
      if (result && typeof result.then === "function") {
        result.then(handleLoad, reject);
      }
    });
  }
  function canDirectFetchAnkiConnect(url) {
    return canDirectFetchAnkiConnectFrom(url, safeLocationHref$1());
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
  function safeLocationHref$1() {
    return typeof location === "undefined" ? "" : location.href;
  }
  function resolvedAnkiDeckName(deckOverride, settings) {
    return deckOverride?.trim() || settings.ankiDeck || "よむ";
  }
  function resolvedAnkiModelName(settings) {
    return settings.ankiModel || "よむ Japanese";
  }
  const ANKI_FIELD_ROLES = ["expression", "reading", "meaning", "sentence", "audio", "image"];
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
    "Audio|Expression Audio|Term Audio|Vocab Audio|Vocabulary Audio|Word Audio|PronunciationAudio|Context Audio|Example Audio|SentAudio|Sentence Audio|Sentence Sound|SentenceAudio|Sound|Voice"
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
    image: ANKI_IMAGE_FIELD_NAMES
  };
  function scanAnkiModelFields(modelName, fields, sampleNotes = []) {
    const usedFields = /* @__PURE__ */ new Set();
    const samples = ankiFieldContentSamples(fields, sampleNotes);
    const suggestions = Object.keys(ANKI_FIELD_ROLE_CANDIDATES).map((role) => {
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
    const candidates = ANKI_FIELD_ROLE_CANDIDATES[role];
    const availableFields = fields.filter((field) => isAvailableAnkiFieldForRole(field, role, usedFields, samples));
    const exact = firstMatchingAnkiField(availableFields, candidates);
    const content = suggestAnkiFieldFromContent(role, availableFields, samples);
    const exactContentScore = exact ? ankiFieldContentRoleScore(role, samples[exact] ?? []) : 0;
    const fuzzy = firstFuzzyAnkiField(availableFields, candidates);
    return bestAnkiFieldSuggestion(role, exact, fuzzy, content, exactContentScore);
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
    expression({ length, hasJapanese, hasKanji, kanaLength, sentenceLike }) {
      if (!hasJapanese || sentenceLike || length > 40) return 0;
      return 28 + (hasKanji ? 24 : 0) + (kanaLength && hasKanji ? 8 : 0) + Math.max(0, 12 - Math.floor(length / 2));
    },
    reading({ length, japaneseLength, hasJapanese, hasKanji, kanaLength }) {
      if (!hasJapanese || hasKanji || length > 40) return 0;
      const mostlyKana = kanaLength >= Math.max(1, japaneseLength - 1);
      return mostlyKana ? 54 + Math.max(0, 10 - Math.floor(length / 4)) : 20;
    },
    meaning({ length, hasJapanese, hasLatin }) {
      if (hasJapanese) return 0;
      if (hasLatin) return 54 + (length > 8 ? 6 : 0);
      return length >= 2 ? 24 : 0;
    },
    sentence({ length, hasJapanese, sentenceLike }) {
      if (!hasJapanese) return 0;
      if (sentenceLike) return 65 + (length > 20 ? 8 : 0);
      return length >= 14 ? 42 : 0;
    }
  };
  function ankiFieldContentSampleRoleScore(role, sample) {
    const raw = sample.raw.trim();
    const text = normalizeFieldValue(sample.text);
    if (role === "audio") return ankiAudioFieldContentScore(raw, text);
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
      sentenceLike: japaneseSentenceLike(text)
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
    const japaneseLength = japaneseCharacterCount(value);
    return /[。！？!?]/u.test(value) || japaneseLength >= 12 || japaneseLength >= 8 && /(?:^|[\s　]).{2,}[\s　].{2,}/u.test(value);
  }
  function ankiFieldAllowedForRole(fieldName, role) {
    const normalized = normalizeAnkiFieldName(fieldName);
    const audioLike = /(?:audio|sound|voice)/.test(normalized);
    const imageLike = /(?:image|picture|screenshot|snapshot|photo|frame|still)/.test(normalized);
    if (role === "audio") return audioLike && !imageLike;
    if (role === "image") return imageLike && !audioLike && !/^frame(?:id|no|num|number|v?\d)/.test(normalized);
    return !audioLike && !imageLike;
  }
  function ankiFieldDisallowedForRole(fieldName, role) {
    if (role === "audio" || role === "image") return false;
    const normalized = normalizeAnkiFieldName(fieldName);
    return /^(?:source|sourceurl|url|origin|originurl|link|deck|deckname|model|modelname|tags?|remarksfront|frontremarks)$/.test(normalized);
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
    const fieldName = fieldNameForRole(fieldNames, "audio", mapping) || mediaFieldName(fieldNames, ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES);
    if (!fieldName) return [];
    return retargetMediaFiles(audioFilesFromContext(options, card), fieldName);
  }
  function mergePictureFilesForNote(fieldNames, existingFields, options, card, canOwnYomuFields, mapping) {
    const fieldName = fieldNameForRole(fieldNames, "image", mapping);
    if (!fieldName || !options.imageDataUrl) return [];
    if (!canOwnYomuFields && existingFields[fieldName]) return [];
    const image = imageFromDataUrl(options.imageDataUrl, card);
    return image ? [{ ...image, fields: [fieldName] }] : [];
  }
  function applyMediaFieldClears(fields, audio, picture, audioMergeMode, canOwnYomuFields) {
    if (audio.length && audioMergeMode === "ours") fields[audio[0].fields[0]] = "";
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
      fields: ["Audio"]
    };
  }
  function audioFromUrl(url, card, kind) {
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return null;
    return {
      filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}${audioUrlExtension(cleanUrl)}`,
      url: cleanUrl,
      fields: ["Audio"]
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
    const audioField = fieldNameForRole(fieldNames, "audio", mapping);
    const imageField = fieldNameForRole(fieldNames, "image", mapping);
    return {
      deckName: note.deckName,
      modelName: note.modelName,
      fields,
      tags: note.tags,
      options: note.options,
      ...audioField && note.audio?.length ? { audio: retargetMediaFiles(note.audio, audioField) } : {},
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
    const audioField = mobileMappedFieldName(mapping, "audio");
    const imageField = mobileMappedFieldName(mapping, "image");
    if (audioField && note.audio?.length) media.audio = retargetMediaFiles(note.audio, audioField);
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
  let trustedHtmlPolicy;
  function setInnerHtml(element, html) {
    if (!assignInnerHtml(element, html)) element.textContent = html;
  }
  function assignInnerHtml(element, html) {
    try {
      element.innerHTML = trustedHtml(html);
      return true;
    } catch {
      return false;
    }
  }
  function escapeHtml$1(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trustedHtml(value) {
    try {
      const factory = trustedTypesFactory();
      if (!factory) return value;
      if (trustedHtmlPolicy === void 0) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
      return trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === "function" ? trustedHtmlPolicy.createHTML(value) : value;
    } catch {
      trustedHtmlPolicy = null;
      return value;
    }
  }
  function trustedTypesFactory() {
    const root = globalThis;
    return [
      root.trustedTypes,
      typeof window === "undefined" ? void 0 : window.trustedTypes,
      root.unsafeWindow?.trustedTypes
    ].find((factory) => Boolean(factory));
  }
  function createTrustedHtmlPolicy(factory) {
    try {
      const existing = factory.getPolicy?.("yomu-reader");
      if (existing && typeof existing.createHTML === "function") return existing;
      const options = { createHTML: (html) => html };
      return createTrustedHtmlPolicyWithOptions(factory, pageCompartmentValue(options, { cloneFunctions: true, wrapReflectors: true })) ?? createTrustedHtmlPolicyWithOptions(factory, options);
    } catch {
      return null;
    }
  }
  function createTrustedHtmlPolicyWithOptions(factory, options) {
    try {
      return factory.createPolicy?.("yomu-reader", options) ?? null;
    } catch {
      return null;
    }
  }
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
    enabled: false
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
    urlTemplate: "https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1",
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
    JITEN_LOOKUP_LINK,
    JITEN_LIVE_FREQUENCY_PILL,
    JPDB_LOOKUP_LINK,
    JPDB_LIVE_FREQUENCY_PILL,
    YOMU_LOOKUP_LINK,
    BUNPRO_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    KOTOBANK_LOOKUP_LINK,
    TAKOBOTO_LOOKUP_LINK,
    WIKTIONARY_LOOKUP_LINK,
    IMMERSION_KIT_LOOKUP_LINK,
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK
  ];
  [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK
  ];
  [[
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
    "recall-cloze",
    "listen-pitch",
    "speaking"
  ];
  new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
  ({
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
  const selectorPairs = (names, attributes = ["class", "id"]) => names.split(",").flatMap((name) => attributes.map((attribute) => `[${attribute}*="${name}" i]`)).join(",");
  const roleSelectors = (names) => names.split(",").map((name) => `[role="${name}"]`).join(",");
  selectorPairs("control,toggle,player", ["class"]);
  new Set("heiban,atamadaka,nakadaka,odaka,kifuku".split(","));
  `a[href],button,summary,label,${roleSelectors("button,link,menuitem,option,tab,checkbox,radio,switch")},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
  `[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs("audio,button,control,play,sound,speaker,toggle", ["class"])}`;
  `time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs("author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username", ["class"])}`;
  `button,label,summary,${roleSelectors("button,tab,menuitem,option,checkbox,radio,switch")}`;
  `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs("account,chooser,dialog,dropdown,login,menu,modal,picker,profile,signin,toolbar")}`;
  selectorPairs("banner,book,card,carousel,gallery,grid,item,lockup,movie,poster,product,rail,scroll,shelf,slick,slider,splide,swiper,thumb,tile,video,volume,work", ["class"]);
  `canvas,img,picture,svg,video,${selectorPairs("cover,image,poster,thumb", ["class"])}`;
  `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs("alert,banner,notice,notification,snackbar,toast", ["class"])},${selectorPairs("assistant,prompt,question", ["class", "id"])}`;
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const POS_LABELS = {
    adj: "adjective",
    adv: "adverb",
    aux: "auxiliary",
    "aux-v": "auxiliary verb",
    conj: "conjunction",
    cop: "copula",
    ctr: "counter",
    exp: "expression",
    int: "interjection",
    n: "noun",
    num: "number",
    pn: "pronoun",
    pref: "prefix",
    prt: "particle",
    suf: "suffix",
    unc: "unclassified",
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
    vz: "zuru verb"
  };
  function formatPartOfSpeech(tags = []) {
    const labels = tags.map((tag) => POS_LABELS[tag.toLowerCase()] ?? tag).filter(Boolean);
    return [...new Set(labels)].join(", ");
  }
  function formatPartOfSpeechDetails(tags = []) {
    return tags.length ? tags.join(", ").toUpperCase() : "";
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
    ["ました", "る", "polite past"],
    ["ませんでした", "る", "polite negative past"],
    ["ません", "る", "polite negative"],
    ["ましょう", "る", "polite volitional"],
    ["ます", "る", "polite"],
    ["なかった", "る", "negative past"],
    ["なくて", "る", "negative te-form"],
    ["なければ", "る", "negative conditional"],
    ["ない", "る", "negative"],
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
    ["しませんでした", "する", "polite negative past"],
    ["しません", "する", "polite negative"],
    ["しました", "する", "polite past"],
    ["しましょう", "する", "polite volitional"],
    ["します", "する", "polite"],
    ["しなかった", "する", "negative past"],
    ["しなくて", "する", "negative te-form"],
    ["しなければ", "する", "negative conditional"],
    ["しない", "する", "negative"],
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
    ["きませんでした", "くる", "polite negative past"],
    ["きません", "くる", "polite negative"],
    ["きました", "くる", "polite past"],
    ["きます", "くる", "polite"],
    ["こなかった", "くる", "negative past"],
    ["こなくて", "くる", "negative te-form"],
    ["こない", "くる", "negative"],
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
  [
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
  function godanRules(row) {
    const rules = row.rules;
    return [
      ...teCompoundRules(row.te, row.ending, rules),
      { from: row.te, to: row.ending, reason: "te-form", rules },
      { from: row.ta, to: row.ending, reason: "past", rules },
      { from: `${row.a}なかった`, to: row.ending, reason: "negative past", rules },
      { from: `${row.a}なくて`, to: row.ending, reason: "negative te-form", rules },
      { from: `${row.a}なければ`, to: row.ending, reason: "negative conditional", rules },
      { from: `${row.a}ない`, to: row.ending, reason: "negative", rules },
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
  Logger.scope("Yomitan");
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
    return isRecord$1(value) ? glossaryRecordToText(value, options) : "";
  }
  function primitiveGlossaryText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return void 0;
  }
  function glossaryRecordToText(record, options) {
    if (typeof record.text === "string") return record.text;
    if ("content" in record) return glossaryValueToProfileText(record.content, options);
    const values = glossaryRecordTextValues(record, options);
    if (values.length) return values.join(" ");
    if ("path" in record) return glossaryPathRecordText(record);
    return "";
  }
  function glossaryPathRecordText(record) {
    return String(record.description || record.alt || "");
  }
  function glossaryRecordTextValues(record, options) {
    const values = [];
    for (const [key, childValue] of Object.entries(record)) {
      if (!shouldReadRecordTextKey(key, options)) continue;
      const childText = glossaryValueToProfileText(childValue, options);
      if (childText) values.push(childText);
    }
    return values;
  }
  function shouldReadRecordTextKey(key, options) {
    return options.fallbackTextKeys.has(key) || options.includeDirectDataAttributes && key.startsWith("data-");
  }
  function isRecord$1(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
  function renderGlossaryRecord(record, context) {
    return renderDirectGlossaryRecord(record, context) ?? renderTaggedGlossaryRecord(record, context);
  }
  const DIRECT_GLOSSARY_RECORD_RENDERERS = [
    renderTextGlossaryRecord,
    renderStructuredContentGlossaryRecord,
    renderImageGlossaryRecord,
    renderTextContentGlossaryRecord
  ];
  function renderDirectGlossaryRecord(record, context) {
    for (const render of DIRECT_GLOSSARY_RECORD_RENDERERS) {
      const html = render(record, context);
      if (html !== null) return html;
    }
    return null;
  }
  function renderTextGlossaryRecord(record) {
    return typeof record.text === "string" ? escapeHtml(record.text) : null;
  }
  function renderStructuredContentGlossaryRecord(record, context) {
    return record.type === "structured-content" ? renderStructuredContent(record, context) : null;
  }
  function renderImageGlossaryRecord(record, context) {
    return isStructuredImageRecord(record) ? renderStructuredImage(record, context.dictionary) : null;
  }
  function renderTextContentGlossaryRecord(record, context) {
    return record.type === "text" && "content" in record ? renderGlossaryValue(record.content, context) : null;
  }
  function renderStructuredContent(record, context) {
    const dictionaryAttr = context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : "";
    return `<span class="structured-content"${dictionaryAttr}>${renderGlossaryValue(record.content, context)}</span>`;
  }
  function renderTaggedGlossaryRecord(record, context) {
    const tag = structuredRecordTag(record);
    if (!tag) return renderRecordValues(record, context);
    return renderKnownTaggedGlossaryRecord(record, tag, context) ?? structuredFallbackContent(record, taggedRecordContent(record, tag, context));
  }
  function renderKnownTaggedGlossaryRecord(record, tag, context) {
    if (tag === "a") return renderStructuredLink(record, context);
    if (tag === "img") return renderStructuredImage(record, context.dictionary);
    const content = taggedRecordContent(record, tag, context);
    if (tag === "table") return renderStructuredTable(record, content, context.dictionary);
    if (STRUCTURED_CONTENT_TAGS.has(tag)) return renderStructuredElement(record, tag, content, context.dictionary);
    return null;
  }
  function taggedRecordContent(record, tag, context) {
    return tag === "br" ? "" : renderGlossaryValue(record.content, context);
  }
  function structuredFallbackContent(record, content) {
    return content || escapeHtml(glossaryValueToText(record));
  }
  function structuredRecordTag(record) {
    if (typeof record.tag === "string") return record.tag.toLowerCase();
    return "content" in record ? "span" : "";
  }
  function renderRecordValues(record, context) {
    return Object.values(record).map((item) => renderGlossaryValue(item, context)).filter(Boolean).join("");
  }
  function renderStructuredTable(record, content, dictionary) {
    return `<div class="gloss-sc-table-container"><table${renderStructuredElementAttributes(record, "table", dictionary)}>${content}</table></div>`;
  }
  function renderStructuredElement(record, tag, content, dictionary) {
    const attrs = renderStructuredElementAttributes(record, tag, dictionary);
    return tag === "br" ? `<br${attrs}>` : `<${tag}${attrs}>${content}</${tag}>`;
  }
  function renderStructuredElementAttributes(record, tag, dictionary) {
    return [
      ` class="gloss-sc-${escapeHtml(tag)}"`,
      dictionaryDataAttribute(dictionary),
      renderStructuredDataAttributes(record.data),
      renderDirectDataAttributes(record),
      structuredStyleAttribute(record.style),
      structuredStringAttribute("title", record.title),
      structuredStringAttribute("lang", record.lang),
      ...structuredStateAttributes(record, tag)
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
  function structuredStateAttributes(record, tag) {
    return [
      tag === "details" && record.open === true ? " open" : "",
      tableCellSpanAttribute(record, tag, "colSpan", "colspan"),
      tableCellSpanAttribute(record, tag, "rowSpan", "rowspan")
    ];
  }
  function tableCellSpanAttribute(record, tag, key, attr) {
    const value = Number(record[key]);
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
  function renderDirectDataAttributes(record) {
    return Object.entries(record).map(renderDirectDataAttribute).filter(Boolean).join("");
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
  function renderStructuredLink(record, context) {
    const content = renderGlossaryValue(record.content, context) || escapeHtml(glossaryValueToText(record));
    const link = structuredLinkModel(record, context);
    const icon = link.external ? '<span class="gloss-link-external-icon icon" data-icon="external-link"></span>' : "";
    return `<a${structuredLinkAttrs(link, context.dictionary, record.lang)}><span class="gloss-link-text">${content}</span>${icon}</a>`;
  }
  function structuredLinkModel(record, context) {
    const rawHref = typeof record.href === "string" ? record.href : "";
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
  function renderStructuredImage(record, dictionary) {
    const path = typeof record.path === "string" ? record.path : "";
    const title = typeof record.title === "string" ? record.title : "";
    const description = structuredImageDescription(record);
    const src = structuredImageSrc(path);
    const alt = escapeHtml(description || title || "Dictionary image");
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<span${renderStructuredImageAttributes(record, dictionary)}${titleAttribute}><img class="gloss-image"${src ? ` src="${escapeHtml(src)}"` : ""} alt="${alt}"><span class="gloss-image-fallback">${alt}</span></span>`;
  }
  function renderStructuredImageAttributes(record, dictionary) {
    return [
      ` class="gloss-image-link"`,
      dictionaryAttribute(dictionary),
      structuredImageStateAttribute(record)
    ].join("");
  }
  function structuredImageStateAttribute(record) {
    const path = typeof record.path === "string" ? record.path : "";
    return ` data-image-load-state="${structuredImageSrc(path) ? "loaded" : "error"}"`;
  }
  function structuredImageSrc(path) {
    return /^data:image\//i.test(path) ? path : "";
  }
  function structuredImageDescription(record) {
    if (typeof record.description === "string") return record.description;
    return typeof record.alt === "string" ? record.alt : "";
  }
  function isStructuredImageRecord(record) {
    return record.type === "image" || "path" in record;
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
    const kanji = Array.from(value).find(isStructuredKanjiCharacter) ?? "";
    return kanji ? { kanji } : null;
  }
  function decodeStructuredPathSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function isStructuredKanjiCharacter(value) {
    const code = value.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
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
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const record = objectRecord(value);
    return record ? scalarMetaValue(nestedMetaValue(record)) : null;
  }
  function scalarMetaValue(value) {
    const primitive = primitiveMetaValue(value);
    if (primitive !== null) return primitive;
    const record = objectRecord(value);
    return record ? scalarMetaValue(nestedMetaValue(record)) : null;
  }
  function primitiveMetaValue(value) {
    return typeof value === "number" || typeof value === "string" ? String(value) : null;
  }
  function objectRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function nestedMetaValue(record) {
    return record.displayValue ?? record.frequency ?? record.value;
  }
  function groupTermEntriesByDictionary(entries) {
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of entries) {
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
  function renderSentence(sentence, targets) {
    if (!sentence) return "";
    const target = firstSentenceHighlightTarget(sentence, targets);
    if (!target) return escapeHtml$1(sentence);
    return sentence.split(target).map((part) => escapeHtml$1(part)).join(`<span class="yomu-highlight">${escapeHtml$1(target)}</span>`);
  }
  function firstSentenceHighlightTarget(sentence, targets) {
    const seen = /* @__PURE__ */ new Set();
    for (const target of targets) {
      const normalized = target.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      if (sentence.includes(normalized)) return normalized;
    }
    return "";
  }
  function renderDictionaryDefinitions(entries, preferences) {
    const groups = Array.from(groupTermEntriesByDictionary(entries).entries()).slice(0, 6);
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
  function renderKanjiDefinitions(entries, preferences, language) {
    const byCharacter = /* @__PURE__ */ new Map();
    for (const entry of entries) {
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
  function renderFrequency(card, entries, preferences) {
    const chips = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
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
  function renderPitchField(card, entries, preferences) {
    const chips = firstJpdbPitchChip(card);
    for (const entry of entries) {
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
    const record = metaRecord(value);
    if (!record) return "";
    const positions = metaPitchPositions(record);
    return positions.length ? formatPitchPositions(positions) : formatPitchPosition(record.position);
  }
  function metaRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function metaPitchPositions(record) {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
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
  const ANKI_STATUS_INDEX_DB_VERSION = 1;
  const ANKI_STATUS_INDEX_META_STORE = "meta";
  const ANKI_STATUS_INDEX_ENTRY_STORE = "entries";
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
        const chunkRecords = await Promise.all(chunk.map((key) => idbRequest(store.get(key)).then((record) => [key, record])));
        await idbTransactionDone(tx);
        records.push(...chunkRecords);
      }
      return new Map(records.filter((record) => Boolean(record[1])).map(([key, record]) => [key, record.entry]));
    } finally {
      db.close();
    }
  }
  async function saveAnkiStatusIndexToIndexedDb(index) {
    if (!canUseIndexedDb()) throw new Error("IndexedDB is unavailable.");
    const db = await openAnkiStatusIndexDb();
    try {
      await clearAnkiStatusIndexStores(db);
      const entries = Object.entries(index.entries).map(([key, entry]) => ({ key, entry }));
      for (const chunk of chunkArray(entries, ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE)) {
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
  function clearAnkiStatusIndexStores(db) {
    const tx = db.transaction([ANKI_STATUS_INDEX_META_STORE, ANKI_STATUS_INDEX_ENTRY_STORE], "readwrite");
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).clear();
    tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).clear();
    return idbTransactionDone(tx);
  }
  function putAnkiStatusIndexMeta(db, meta) {
    const tx = db.transaction(ANKI_STATUS_INDEX_META_STORE, "readwrite");
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).put(meta);
    return idbTransactionDone(tx);
  }
  function putBestAnkiStatusIndexEntries(db, entries) {
    if (!entries.length) return Promise.resolve();
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    entries.forEach((candidate) => {
      const request = store.get(candidate.key);
      request.onsuccess = () => {
        const current = request.result?.entry;
        if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate.entry)) store.put(candidate);
      };
    });
    return idbTransactionDone(tx);
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
  function openAnkiStatusIndexDb() {
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
        resolve(db);
      };
    });
  }
  function canUseIndexedDb() {
    return typeof indexedDB !== "undefined";
  }
  function statusIndexEntriesForNotes(notes, cardData, settings, updatedAt) {
    const entries = /* @__PURE__ */ new Map();
    for (const note of notes) {
      const candidate = statusIndexEntryFromStatusData(note, cardData, updatedAt);
      for (const key of statusIndexKeysForNote(note, settings)) {
        const current = entries.get(key);
        if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate)) entries.set(key, candidate);
      }
    }
    return [...entries].map(([key, entry]) => ({ key, entry }));
  }
  function statusIndexKeysForCard(card) {
    const keys = noteCardExpressionTargets(card).map(statusIndexKey);
    if (shouldUseStatusReadingKey(card)) keys.push(statusIndexReadingKey(card.reading || card.spelling));
    return unique(keys);
  }
  function statusIndexEntryForCard(index, card, entries) {
    for (const key of statusIndexKeysForCard(card)) {
      const entry = entries?.get(key) ?? index.entries[key];
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
  function putAnkiStatusIndexEntries(db, entries) {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    entries.forEach((entry) => store.put(entry));
    return idbTransactionDone(tx);
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
  function isAppleTouchBrowser() {
    if (typeof navigator === "undefined") return false;
    const userAgent2 = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    return /iPad|iPhone|iPod/i.test(userAgent2) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent2) || platform === "MacIntel");
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
    lookupStatusIndex(index, card, entries) {
      const entry = index ? statusIndexEntryForCard(index, card, entries) : null;
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
      const entries = {};
      for (const { key, entry } of statusIndexEntriesForNotes(notes, cardData, settings, now)) entries[key] = entry;
      const index = {
        version: ANKI_STATUS_INDEX_VERSION,
        settingsKey,
        syncedAt: now,
        checkedAt: now,
        cardCount: allCardIds.length,
        entryCount: Object.keys(entries).length,
        entries,
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
          const entries = statusIndexEntriesForNotes(notes, cardData, settings, now);
          if (!entries.length) return;
          writeQueue = writeQueue.then(() => putBestAnkiStatusIndexEntries(db, entries));
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
      const entries = this.rememberedStatusIndexEntries(notes, cardsByNote, settings, now);
      if (!entries.length || this.isDestroyed) return;
      const current = this.validStatusIndex(await this.loadStatusIndex());
      const base = await this.baseStatusIndexForRememberedNotes(current, settingsKey, now, entries.length);
      const checkedAt = Math.max(base.checkedAt, now);
      if (this.shouldRememberStatusIndexEntriesInIndexedDb(base, current)) {
        await this.rememberIndexedDbStatusIndexEntries({ ...base, checkedAt, entryStore: "indexeddb", entries: {} }, entries);
        return;
      }
      await this.rememberValueStatusIndexEntries(base, checkedAt, entries);
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
    async rememberValueStatusIndexEntries(base, checkedAt, entries) {
      const mergedEntries = { ...base.entries };
      for (const candidate of entries) {
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
    async rememberIndexedDbStatusIndexEntries(index, entries) {
      const db = await openAnkiStatusIndexDb();
      try {
        await putBestAnkiStatusIndexEntries(db, entries);
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
    async ensureModelFields(modelName) {
      const fieldNames = await this.invokeOrDefault("modelFieldNames", { modelName }, []);
      const existing = new Set(fieldNames);
      for (const fieldName of YOMU_MODEL_FIELDS) {
        if (!existing.has(fieldName)) {
          await this.invoke("modelFieldAdd", { modelName, fieldName });
        }
      }
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
      const body = JSON.stringify({ action, version: ANKI_VERSION, params });
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
  function safeLocationHref() {
    return typeof location === "undefined" ? "" : location.href;
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
  function registerAudioAttempt(triedUrls, candidate) {
    const candidateKey = normalizeAttemptedAudioUrl(candidate.url);
    if (triedUrls.has(candidateKey)) return false;
    triedUrls.add(candidateKey);
    return true;
  }
  function getAudioBagKey(source, card) {
    return [
      source.type,
      source.url,
      source.voice,
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
  function orderAudioDeckEntries(entries, mode, bagKey, shuffledAudio) {
    if (mode !== "random" || !entries.length) return entries;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const ordered = [];
    for (const id of shuffledAudio.order(bagKey, entries.map((entry) => entry.id))) {
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
      source.voice.trim()
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
      language: "ja"
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
  function findAudioUrlsInRecord(record, sourceUrl) {
    const known = uniqueAudioUrls([...preferredAudioRecordUrls(record, sourceUrl), ...directAudioRecordUrls(record, sourceUrl)]);
    return known.length ? known : nestedAudioRecordUrls(record, sourceUrl);
  }
  function preferredAudioRecordUrls(record, sourceUrl) {
    return ["audioSources", "sources", "audio", "audioUrl", "src", "source"].flatMap((key) => findAudioUrls(record[key], sourceUrl));
  }
  function directAudioRecordUrls(record, sourceUrl) {
    return typeof record.url === "string" && isLikelyAudioRecord(record) ? findAudioUrls(record.url, sourceUrl) : [];
  }
  function nestedAudioRecordUrls(record, sourceUrl) {
    const knownKeys = /* @__PURE__ */ new Set(["url", "audioSources", "sources", "audio", "audioUrl", "src", "source"]);
    return uniqueAudioUrls(Object.entries(record).filter(([key]) => !knownKeys.has(key)).flatMap(([, nested]) => findAudioUrls(nested, sourceUrl)));
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
    "lingua-libre": async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, "lingua-libre", timeoutMs, proxyUrl)),
    wiktionary: async (_source, card, timeoutMs, proxyUrl) => urlsToAudioCandidates(await getCommonsAudioUrls(card.spelling, "wiktionary", timeoutMs, proxyUrl)),
    "jiten-tts": async (source, card, timeoutMs, proxyUrl) => jitenTtsAudioCandidates(source, card, timeoutMs, proxyUrl),
    "jpdb-tts": async (source, card, timeoutMs, proxyUrl) => jpdbAudioIdsToCandidates(filterJpdbAudioIdsForVoice(await getJpdbTtsAudioIds(card, timeoutMs, proxyUrl), source.voice))
  };
  async function loadNoAudioCandidates() {
    return [];
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
    const urls = typeof response === "string" ? findAudioUrls(JSON.parse(response), sourceUrl) : [];
    return urls.map((url) => ({ url, sourceUrl }));
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
    const record = value;
    const wordId = finitePositiveInteger(record.wordId);
    const readingIndex = finiteNonNegativeInteger(record.readingIndex);
    if (wordId === void 0 || readingIndex === void 0) return null;
    return {
      wordId,
      readingIndex,
      text: typeof record.text === "string" ? record.text.trim() : "",
      reading: cleanJitenRubyText(typeof record.rubyText === "string" ? record.rubyText : "").trim()
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
    try {
      return new URL(value, "https://jpdb.io").searchParams.get("q")?.trim() ?? "";
    } catch {
      return "";
    }
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
    try {
      return new URL(src, baseUrl).href;
    } catch {
      return "";
    }
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
  function isLikelyAudioRecord(record) {
    return typeof record.url === "string" && audioRecordHasPlayableSignal(record);
  }
  function audioRecordHasPlayableSignal(record) {
    return isLikelyAudioUrl(String(record.url)) || ["audio", "audioSource"].includes(String(record.type ?? "")) || typeof record.name === "string";
  }
  function isLikelyAudioUrl(value) {
    if (value.startsWith("data:audio/")) return true;
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
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  let activationTrackingInstalled = false;
  function installPageActivationTracking() {
    if (activationTrackingInstalled || typeof window === "undefined") return;
    activationTrackingInstalled = true;
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
  function yomuCompanions() {
    return readYomuCompanions(globalThis) ?? sandboxCompanions ?? (typeof window === "undefined" ? void 0 : readYomuCompanions(window)) ?? {};
  }
  function writeYomuCompanions(value) {
    sandboxCompanions = value;
    writeYomuCompanionsTarget(globalThis, value);
    if (typeof window !== "undefined" && window !== globalThis) {
      writeYomuCompanionsTarget(window, value);
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
  function speakerIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
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
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  function hasRenderableAnkiCardContent(html) {
    if (typeof document === "undefined") return Boolean(html.trim());
    const template = document.createElement("template");
    template.innerHTML = html;
    const text = template.content.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text) return true;
    return Boolean(template.content.querySelector([
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
    const template = document.createElement("template");
    template.innerHTML = trimmed;
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
      media.insertAdjacentHTML("beforebegin", renderAnkiSoundChip(filename, language));
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
    chip.innerHTML = speakerIcon();
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
    chip.innerHTML = speakerIcon();
    return chip;
  }
  function ankiPlaybackMarkerFilename(value, soundFilenames) {
    const audioIndex = ankiPlaybackMarkerIndex(value);
    return audioIndex === null ? "" : ankiPlaybackMarkerFilenameAtIndex(soundFilenames, audioIndex);
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
