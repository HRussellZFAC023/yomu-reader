(function() {
  "use strict";
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
  const MISSING = { missing: true };
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
      return;
    }
    localStorageSet(key, value);
  }
  function gmStorageSetSync(key, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key, value);
        if (!isPromiseLike(result)) return;
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
  function isPromiseLike(value) {
    return Boolean(value) && typeof value.then === "function";
  }
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    return typeof modern === "function" ? modern.bind(globalThis.GM) : null;
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
      this.parent.write(this.scopeName, message, args, console.warn, WARN_STYLE);
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
  function isAppleTouchBrowser() {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
  }
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_BASE_URL = `${GITHUB_PAGES_ORIGIN}/${APP_REPOSITORY_NAME}/`;
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, JPDB mining, dictionaries, OCR, subtitles, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const DEFAULT_YOMU_PUBLIC_PROXY_URL = "https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev";
  const BUILT_IN_PROXY_BUILDERS = [
    (targetUrl) => configuredProxyFetchUrl(targetUrl, DEFAULT_YOMU_PUBLIC_PROXY_URL) ?? ""
  ];
  const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
  const READ_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD"]);
  const PRIVATE_IPV4_HOSTNAME_PATTERNS = [
    /^(?:0|10|127)\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(?:1[6-9]|2\d|3[0-1])\./
  ];
  const PRIVATE_IPV6_HOSTNAME_PREFIXES = ["fc", "fd", "fe80:"];
  const IMMERSION_KIT_API_HOSTS = /* @__PURE__ */ new Set([
    "apiv2express.immersionkit.com",
    "apiv2.immersionkit.com"
  ]);
  const KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS = /* @__PURE__ */ new Set([
    "d1pra95f92lrn3.cloudfront.net",
    "d1vjc5dkcd3yh2.cloudfront.net"
  ]);
  const SPECIALIZED_PROXY_ROUTE_RULES = [
    {
      method: "GET",
      route: "jisho-search",
      matches: (target) => target.hostname === "jisho.org" && target.pathname.startsWith("/search/")
    },
    {
      method: "GET",
      route: "yomu-public-only",
      matches: (target) => target.hostname === "assets.languagepod101.com" && target.pathname === "/dictionary/japanese/audiomp3.php"
    },
    {
      method: "POST",
      route: "yomu-public-only",
      matches: (target) => target.hostname === "www.japanesepod101.com" && target.pathname === "/learningcenter/reference/dictionary_post"
    },
    {
      method: "GET",
      route: "yomu-public-only",
      matches: (target) => isKnownCorsBlockedPublicAudioCdnUrl(target)
    },
    {
      method: "GET",
      route: "yomu-public-only",
      matches: (target) => target.hostname === "cdn.innovativelanguage.com" && target.pathname.includes("/learningcenter/audio/")
    },
    {
      method: "GET",
      route: "yomu-public-only",
      matches: (target) => target.hostname === "jpdb.io" && target.pathname.startsWith("/static/v/")
    },
    {
      method: "GET",
      route: "yomu-public-only",
      matches: (target) => target.hostname === "api.jiten.moe" && (target.pathname.startsWith("/api/tts/word/") || target.pathname.startsWith("/api/tts/sentence/") || target.pathname === "/api/vocabulary/search" || target.pathname === "/api/vocabulary/parse")
    }
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
  function shouldPreferProxyFirst(targetUrl, hasDirectCandidate, proxySafe) {
    return hasDirectCandidate && proxySafe && !isKnownDirectCorsTarget(targetUrl) && (isHostedGithubPagesApp() || isAppleTouchBrowser()) && isCrossOriginHttpUrl(targetUrl);
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
    return Boolean(target && isCrossOriginHttpTarget(target) && (specializedProxyRoute(target, requestMethod(options)) || isJpdbPublicLookupTarget(target, requestMethod(options)) || isLocalHostedBrowserCorsTarget(target, requestMethod(options))));
  }
  function builtInProxyUrls(targetUrl, options) {
    const specialized = specializedProxyUrls(targetUrl, options);
    const candidates = specialized ?? BUILT_IN_PROXY_BUILDERS.map((builder) => builder(targetUrl));
    return candidates.filter(Boolean);
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
      return new URL(candidateUrl).origin === DEFAULT_YOMU_PUBLIC_PROXY_URL;
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
  function isJpdbPublicLookupTarget(target, method) {
    return method === "GET" && target.hostname === "jpdb.io" && (target.pathname === "/search" || target.pathname.startsWith("/vocabulary/"));
  }
  function isLocalHostedBrowserCorsTarget(target, method) {
    return method === "GET" && isLocalHostedApp() && IMMERSION_KIT_API_HOSTS.has(target.hostname) && target.pathname === "/search";
  }
  function specializedProxyUrls(targetUrl, options) {
    const target = fetchTarget(targetUrl);
    const route = target ? specializedProxyRoute(target, requestMethod(options)) : null;
    if (!target || !route) return null;
    const proxyTargetUrl = target.href;
    if (route === "jisho-search") {
      return [
        yomuPublicProxyUrl(proxyTargetUrl)
      ];
    }
    return [yomuPublicProxyUrl(proxyTargetUrl)];
  }
  function specializedProxyRoute(target, method) {
    return SPECIALIZED_PROXY_ROUTE_RULES.find((rule) => rule.method === method && rule.matches(target))?.route ?? null;
  }
  function yomuPublicProxyUrl(targetUrl) {
    return configuredProxyFetchUrl(targetUrl, DEFAULT_YOMU_PUBLIC_PROXY_URL) ?? "";
  }
  function isHostedGithubPagesApp() {
    if (typeof location === "undefined") return false;
    try {
      const current = new URL(location.href);
      return current.origin === GITHUB_PAGES_ORIGIN && current.pathname.replace(/\/index\.html$/, "/").startsWith(`/${APP_REPOSITORY_NAME}/`);
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
      return isPrivateHostname(url.hostname);
    } catch {
      return false;
    }
  }
  function isPrivateHostname(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return isLocalhostHostname(host) || isPrivateIpv4Hostname(host) || isPrivateIpv6Hostname(host);
  }
  function isLocalhostHostname(host) {
    return host === "localhost" || host.endsWith(".localhost");
  }
  function isPrivateIpv4Hostname(host) {
    return PRIVATE_IPV4_HOSTNAME_PATTERNS.some((pattern) => pattern.test(host));
  }
  function isPrivateIpv6Hostname(host) {
    if (!host.includes(":")) return false;
    return host === "::1" || PRIVATE_IPV6_HOSTNAME_PREFIXES.some((prefix) => host.startsWith(prefix));
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
    if (!candidates.length) throw new Error("Cross-origin request needs a configured proxy or userscript HTTP bridge.");
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
    const direct = directFetchUrl(targetUrl, options);
    const proxySafe = isProxySafeRequest(targetUrl, options);
    const configuredProxySafe = proxySafe || options.allowSensitiveConfiguredProxy === true;
    const configured = configuredProxySafe && options.allowConfiguredProxy !== false ? configuredProxyFetchUrl(targetUrl, configuredProxyUrl) : null;
    const publicProxySafe = proxySafe && options.allowPublicProxies !== false;
    const publicProxies = publicProxySafe ? builtInProxyUrls(targetUrl, options) : [];
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
  function directFetchUrl(targetUrl, options) {
    if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
    if (shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
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
  const BRIDGE_REQUEST_EVENT = "yomu-userscript-http-request";
  const BRIDGE_RESPONSE_EVENT = "yomu-userscript-http-response";
  const BRIDGE_MARKER = "yomuUserscriptHttpBridge";
  const BRIDGE_TIMEOUT_MS = 3e4;
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
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== "true") return void 0;
    return (options) => new Promise((resolve, reject) => {
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
    if (options.preferFetch && (!userscriptRequest || isSameOriginUrl(url))) {
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
  async function requestViaFetch(url, options) {
    const response = await fetchWithCorsFallbacks(url, options.proxyUrl ?? "", {
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
  async function requestText$4(url, options = {}) {
    const value = await requestHttp(url, { ...options, responseType: "text" });
    return typeof value === "string" ? value : String(value ?? "");
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
  const KANJI_MAP_KANJI_BASE = "https://raw.githubusercontent.com/gabor-kovacs/the-kanji-map/main/data/kanji";
  const JAPANESE_RE$1 = /[\u3040-\u30ff\u3400-\u9fff]/u;
  const log$3 = Logger.scope("KanjiOrigin");
  class KanjiOriginClient {
    cache = /* @__PURE__ */ new Map();
    // Called through the nullable kanji-study companion slot (app/main.ts).
    // fallow-ignore-next-line unused-class-member
    lookup(kanji, settings) {
      const key = Array.from(kanji)[0] ?? kanji;
      if (!key || !settings.kanjiOriginsEnabled) {
        return Promise.resolve(null);
      }
      const cacheKey = kanjiOriginCacheKey(key, settings);
      let promise = this.cache.get(cacheKey);
      if (!promise) {
        promise = this.fetchInfo(key, settings);
        this.cache.set(cacheKey, promise);
      }
      return promise;
    }
    async fetchInfo(kanji, settings) {
      const done = log$3.time("Kanji origin lookup", { kanji });
      const kanjiMap = settings.kanjiOriginKanjiMapEnabled ? await fetchKanjiMapInfo(kanji).catch((error) => {
        log$3.warn("Kanji Map origin lookup failed", { kanji, error });
        return void 0;
      }) : void 0;
      const result = kanjiMap ? { kanjiMap } : null;
      done();
      return result;
    }
  }
  function kanjiOriginCacheKey(kanji, settings) {
    return [
      kanji,
      settings.kanjiOriginKanjiMapEnabled ? "map" : ""
    ].join(":");
  }
  async function fetchKanjiMapInfo(kanji) {
    const done = log$3.time("Fetch Kanji Map info", { kanji });
    const sourceUrl = `${KANJI_MAP_KANJI_BASE}/${encodeURIComponent(kanji)}.json`;
    const raw = parseJson(await requestText$3(sourceUrl));
    const info = raw ? parseKanjiMapInfo(raw, kanji, sourceUrl) : void 0;
    done();
    return info;
  }
  function parseKanjiMapInfo(raw, kanji, sourceUrl) {
    const record = asRecord(raw);
    if (!record) return void 0;
    const kanjiAlive = asRecord(record.kanjialiveData);
    const jisho = asRecord(record.jishoData);
    const radical = readKanjiMapRadical(kanjiAlive, jisho);
    const examples = readKanjiMapExamples(kanjiAlive, jisho);
    const references = readKanjiMapReferences(kanjiAlive, jisho);
    const metrics = readKanjiMapMetrics(kanjiAlive, jisho);
    const readings2 = readKanjiMapReadings(kanjiAlive, jisho);
    return {
      kanji,
      ...metrics,
      ...readings2,
      parts: readKanjiMapParts(jisho, kanji),
      hint: stripHtml(stringValue(kanjiAlive?.mn_hint)),
      radical,
      examples,
      references,
      sourceUrl,
      kanjiAliveUrl: `https://app.kanjialive.com/${encodeURIComponent(kanji)}`,
      jishoUrl: stringValue(jisho?.uri)
    };
  }
  function readKanjiMapMetrics(kanjiAlive, jisho) {
    return {
      meaning: kanjiMapMeaning(kanjiAlive, jisho),
      grade: kanjiMapGrade(kanjiAlive, jisho),
      jlpt: normalizeJlpt(stringValue(jisho?.jlptLevel)) ?? "",
      strokeCount: kanjiMapStrokeCount(kanjiAlive, jisho),
      frequencyRank: normalizeFrequency(stringValue(jisho?.newspaperFrequencyRank))
    };
  }
  function kanjiMapMeaning(kanjiAlive, jisho) {
    return stringValue(jisho?.meaning) || stringValue(kanjiAlive?.meaning);
  }
  function kanjiMapGrade(kanjiAlive, jisho) {
    return normalizeGrade(stringValue(jisho?.taughtIn) || numberValue(kanjiAlive?.grade)) ?? "";
  }
  function kanjiMapStrokeCount(kanjiAlive, jisho) {
    return numberValue(jisho?.strokeCount) ?? numberValue(kanjiAlive?.kstroke);
  }
  function readKanjiMapReadings(kanjiAlive, jisho) {
    return {
      kunyomi: stringArray(jisho?.kunyomi, stringValue(kanjiAlive?.kunyomi_ja) || stringValue(kanjiAlive?.kunyomi)),
      onyomi: stringArray(jisho?.onyomi, stringValue(kanjiAlive?.onyomi_ja) || stringValue(kanjiAlive?.onyomi))
    };
  }
  function readKanjiMapParts(jisho, kanji) {
    return stringArray(jisho?.parts).filter((part) => part !== kanji && JAPANESE_RE$1.test(part)).slice(0, 10);
  }
  function stripHtml(value) {
    return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  function buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries, sourceInfo = null) {
    const facts = /* @__PURE__ */ new Map();
    for (const candidate of kanjiFactCandidates(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries, sourceInfo)) {
      addKanjiFact(facts, candidate.label, candidate.value, candidate.source);
    }
    if (!facts.has("Character")) addKanjiFact(facts, "Character", kanji, "current lookup");
    const result = Array.from(facts.values()).filter((fact) => fact.label !== "Character").slice(0, 8);
    return result;
  }
  function kanjiFactCandidates(_kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries, sourceInfo) {
    const local = extractLocalKanjiFacts(entries);
    const map = sourceInfo?.kanjiMap;
    return [
      kanjiMeaningFact(map, jpdbInfo, rtkInfo, entries),
      kanjiTypeFact(jpdbInfo, local, map),
      kanjiJlptFact(local, map),
      kanjiGradeFact(local, map),
      kanjiStrokeFact(kanjiVGInfo, local, map),
      kanjiFrequencyFact(jpdbInfo, local, map),
      kanjiKankenFact(jpdbInfo),
      kanjiRadicalFact(map)
    ];
  }
  function kanjiMeaningFact(map, jpdbInfo, rtkInfo, entries) {
    const meaning = kanjiMeaningCandidate(map, jpdbInfo, rtkInfo, entries);
    return { label: "Meaning", value: meaning?.value ?? "", source: meaning?.source ?? "" };
  }
  function kanjiTypeFact(jpdbInfo, local, map) {
    return {
      label: "Type",
      value: kanjiTypeValue(jpdbInfo, local, map),
      source: kanjiTypeSource(jpdbInfo, local)
    };
  }
  function kanjiTypeValue(jpdbInfo, local, map) {
    return normalizeKanjiType(jpdbInfo?.type) ?? local.type ?? typeFromGrade(map?.grade) ?? "";
  }
  function kanjiTypeSource(jpdbInfo, local) {
    return jpdbInfo?.type ? "JPDB" : local.typeSource ?? "Kanji Alive / Jisho";
  }
  function kanjiJlptFact(local, map) {
    const candidate = firstFactCandidate([
      { value: local.jlpt, source: local.jlptSource },
      { value: map?.jlpt, source: "Jisho" }
    ]);
    return { label: "JLPT", value: candidate?.value ?? "", source: candidate?.source ?? "" };
  }
  function kanjiGradeFact(local, map) {
    return { label: "Grade", value: local.grade ?? map?.grade ?? "", source: local.gradeSource ?? "Kanji Alive / Jisho" };
  }
  function kanjiStrokeFact(kanjiVGInfo, local, map) {
    return { label: "Strokes", value: kanjiStrokeValue(kanjiVGInfo, local, map), source: kanjiStrokeSource(kanjiVGInfo, local) };
  }
  function kanjiFrequencyFact(jpdbInfo, local, map) {
    return {
      label: "Frequency",
      value: kanjiFrequencyValue(jpdbInfo, local, map),
      source: kanjiFrequencySource(jpdbInfo, local, map)
    };
  }
  function kanjiFrequencyValue(jpdbInfo, local, map) {
    return jpdbInfo?.frequency || local.frequency || map?.frequencyRank || "";
  }
  function kanjiFrequencySource(jpdbInfo, local, map) {
    if (jpdbInfo?.frequency) return "JPDB";
    if (local.frequency) return local.frequencySource ?? "local dictionary";
    if (map?.frequencyRank) return "Jisho";
    return "Jisho";
  }
  function kanjiKankenFact(jpdbInfo) {
    const candidate = firstFactCandidate([
      { value: jpdbInfo?.kanken, source: "JPDB" }
    ]);
    return { label: "Kanken", value: candidate?.value ?? "", source: candidate?.source ?? "" };
  }
  function kanjiRadicalFact(map) {
    return { label: "Radical", value: kanjiRadicalValue(map), source: "Kanji Alive / Jisho" };
  }
  function kanjiMeaningCandidate(map, jpdbInfo, rtkInfo, entries) {
    const localMeaning = firstLocalMeaning(entries);
    return firstFactCandidate([
      { value: map?.meaning, source: "Kanji Alive / Jisho" },
      { value: jpdbInfo?.keyword, source: "JPDB" },
      { value: rtkInfo?.keyword, source: "RTK" },
      ...localMeaning ? [localMeaning] : []
    ]);
  }
  function kanjiStrokeValue(kanjiVGInfo, local, map) {
    return kanjiVGInfo?.strokeCount ? String(kanjiVGInfo.strokeCount) : local.strokes ?? normalizeNumber(map?.strokeCount) ?? "";
  }
  function kanjiStrokeSource(kanjiVGInfo, local) {
    return kanjiVGInfo?.strokeCount ? "KanjiVG" : local.strokesSource ?? "Kanji Alive / Jisho";
  }
  function kanjiRadicalValue(map) {
    return map?.radical ? [map.radical.symbol, map.radical.meaning].filter(Boolean).join(" ") : "";
  }
  function addKanjiFact(facts, label, value, source) {
    const normalized = value?.trim();
    if (!normalized || facts.has(label)) return;
    facts.set(label, { label, value: normalized, source: source || "source unknown" });
  }
  function buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, entries, sourceInfo = null, kanjiVGInfo = null) {
    const nodes = /* @__PURE__ */ new Map();
    const edges = [];
    const meanings = entries.flatMap((entry) => entry.meanings).filter(Boolean);
    const kanjiVGPositions = kanjiVGComponentPositionMap(kanjiVGInfo);
    const builder = { kanji, nodes, edges, kanjiVGPositions };
    nodes.set(kanji, {
      id: kanji,
      label: kanji,
      kind: "current",
      detail: first([jpdbInfo?.keyword, rtkInfo?.keyword, sourceInfo?.kanjiMap?.meaning, meanings[0]]) ?? "current kanji",
      source: "current lookup"
    });
    sourceInfo?.kanjiMap?.radical?.symbol && addKanjiOriginComponent(
      builder,
      sourceInfo.kanjiMap.radical.symbol,
      first([sourceInfo.kanjiMap.radical.meaning, sourceInfo.kanjiMap.radical.name]) ?? "radical",
      "radical",
      "Kanji Alive / Jisho",
      sourceInfo.kanjiMap.radical.position
    );
    sourceInfo?.kanjiMap?.parts.forEach((part) => addKanjiOriginComponent(builder, part, "structural part", "structural part", "Kanji structure"));
    jpdbInfo?.components.forEach((component) => addKanjiOriginComponent(builder, component.kanji, component.keyword, "JPDB component", "JPDB"));
    jpdbInfo?.usedInKanji?.forEach((component) => addUsedInKanji(builder, component.kanji, component.keyword, "JPDB"));
    rtkInfo?.componentKanji.forEach((component) => addKanjiOriginComponent(builder, component, "RTK element", "RTK element", "RTK"));
    kanjiVGInfo?.componentPositions?.filter((component) => component.direct).forEach((component) => addDirectKanjiVGComponent(builder, component));
    kanjiVGInfo?.componentPositions?.filter((component) => !component.direct).sort((a, b) => a.depth - b.depth).forEach((component) => addKanjiVGSubcomponent(builder, component));
    splitRtkElements$1(rtkInfo?.elements ?? "").filter((element) => !Array.from(element).some((character) => character === kanji)).slice(0, 6).forEach((element, index) => addRtkMemoryCue(builder, element, index));
    const graph = { nodes: Array.from(nodes.values()).slice(0, 24), edges: edges.slice(0, 36) };
    return graph;
  }
  function addKanjiOriginEdge(builder, from, to, label) {
    if (!from || !to || !canAddKanjiOriginEdge(builder.edges, from, to, label)) return;
    builder.edges.push({ from, to, label });
  }
  function canAddKanjiOriginEdge(edges, from, to, label) {
    if (from === to) return false;
    return !edges.some((edge) => edge.from === from && edge.to === to && edge.label === label);
  }
  function addKanjiOriginComponentNode(builder, id, detail, source, position, geometry) {
    if (!id || id === builder.kanji) return null;
    const existing = builder.nodes.get(id);
    if (existing) updateKanjiOriginComponentNode(existing, detail, position, geometry);
    else builder.nodes.set(id, { id, label: id, kind: "component", detail, source, position, geometry });
    return id;
  }
  function updateKanjiOriginComponentNode(node, detail, position, geometry) {
    if (!node.detail && detail) node.detail = detail;
    if (!node.position && position) node.position = position;
    if (!node.geometry && geometry) node.geometry = geometry;
  }
  function addKanjiOriginComponent(builder, id, detail, label, source, position, geometry) {
    const kanjiVGPosition = builder.kanjiVGPositions.get(id);
    const resolvedPosition = position || kanjiVGPosition?.position;
    const resolvedGeometry = geometry ?? kanjiVGPosition?.geometry;
    const nodeId = addKanjiOriginComponentNode(builder, id, detail, source, resolvedPosition, resolvedGeometry);
    addKanjiOriginEdge(builder, nodeId ?? void 0, builder.kanji, label);
  }
  function addUsedInKanji(builder, id, detail, source) {
    const nodeId = addUsedInKanjiNode(builder, id, detail, source);
    addKanjiOriginEdge(builder, builder.kanji, nodeId ?? void 0, "used in kanji");
  }
  function addUsedInKanjiNode(builder, id, detail, source) {
    if (!id || id === builder.kanji) return null;
    const existing = builder.nodes.get(id);
    if (existing) updateUsedInKanjiNode(existing, detail);
    else builder.nodes.set(id, { id, label: id, kind: "component", detail, source });
    return id;
  }
  function updateUsedInKanjiNode(node, detail) {
    if (!node.detail && detail) node.detail = detail;
  }
  function addDirectKanjiVGComponent(builder, component) {
    const id = resolveKanjiVGComponentId(builder.nodes, component.component, component.original);
    addKanjiOriginComponent(builder, id, "visual component", "KanjiVG component", "KanjiVG", component.position, kanjiVGComponentGeometry(component));
  }
  function addKanjiVGSubcomponent(builder, component) {
    if (!isNestedKanjiVGSubcomponent(component, builder.kanji)) return;
    const parent = nestedKanjiVGParent(component, builder);
    if (!parent) return;
    const child = resolveKanjiVGComponentId(builder.nodes, component.component, component.original);
    if (hasCompetingDirectComponentEdge(builder, component, child)) return;
    addKanjiVGSubcomponentEdge(builder, component, parent, child);
  }
  function addKanjiVGSubcomponentEdge(builder, component, parent, child) {
    const parentPosition = builder.kanjiVGPositions.get(parent);
    const parentId = addKanjiOriginComponentNode(builder, parent, "visual component", "KanjiVG", parentPosition?.position, parentPosition?.geometry) ?? parent;
    const childId = addKanjiOriginComponentNode(builder, child, "visual subcomponent", "KanjiVG", component.position, kanjiVGComponentGeometry(component)) ?? child;
    addKanjiOriginEdge(builder, childId, parentId, "subcomponent");
  }
  function addRtkMemoryCue(builder, element, index) {
    const id = `rtk:${index}:${element}`;
    builder.nodes.set(id, { id, label: element, kind: "related", detail: "RTK keyword", source: "RTK" });
    builder.edges.push({ from: id, to: builder.kanji, label: "memory cue" });
  }
  function isNestedKanjiVGSubcomponent(component, currentKanji) {
    return Boolean(component.component && component.component !== currentKanji && !component.variant);
  }
  function nestedKanjiVGParent(component, builder) {
    if (!component.parent || component.parent === builder.kanji) return "";
    const parent = resolveKanjiVGComponentId(builder.nodes, component.parent, component.parentOriginal);
    return parent === builder.kanji ? "" : parent;
  }
  function hasCompetingDirectComponentEdge(builder, component, child) {
    return [child, component.component, component.original].some((id) => hasDirectComponentEdge(builder, id));
  }
  function hasDirectComponentEdge(builder, id) {
    return Boolean(id && builder.edges.some((edge) => isDirectKanjiComponentEdge(edge, id, builder.kanji)));
  }
  function isDirectKanjiComponentEdge(edge, id, kanji) {
    return edge.from === id && edge.to === kanji && edge.label !== "subcomponent";
  }
  function resolveKanjiVGComponentId(nodes, component, original) {
    if (nodes.has(component)) return component;
    return original && nodes.has(original) ? original : component;
  }
  function kanjiVGComponentPositionMap(info) {
    const positions = /* @__PURE__ */ new Map();
    info?.componentPositions?.forEach((component) => {
      const position = normalizeKanjiVGPosition(component.position);
      if (!position) return;
      const geometry = kanjiVGComponentGeometry(component);
      kanjiVGPositionKeys(component).forEach((key) => {
        const existing = positions.get(key);
        if (!existing || !existing.direct && component.direct) {
          positions.set(key, { position, direct: component.direct, geometry });
        } else if (!existing.geometry && geometry) {
          positions.set(key, { ...existing, geometry });
        }
      });
    });
    return positions;
  }
  function kanjiVGComponentGeometry(component) {
    return component.center ? {
      x: component.center.x,
      y: component.center.y,
      width: component.bounds?.width,
      height: component.bounds?.height
    } : void 0;
  }
  function kanjiVGPositionKeys(component) {
    const componentAliases = KANJIVG_COMPONENT_ALIASES.get(component.component) ?? [];
    const originalAliases = component.original ? KANJIVG_COMPONENT_ALIASES.get(component.original) ?? [] : [];
    return uniqueNonEmptyStrings([
      component.component,
      component.original,
      ...componentAliases,
      ...originalAliases
    ]);
  }
  function normalizeKanjiVGPosition(value) {
    const normalized = value.toLowerCase().trim();
    return KANJIVG_POSITION_ALIASES.get(normalized) ?? normalized;
  }
  const KANJIVG_COMPONENT_ALIASES = /* @__PURE__ */ new Map([
    ["⻖", ["阝", "阜"]],
    ["阜", ["⻖", "阝"]]
  ]);
  const KANJIVG_POSITION_ALIASES = /* @__PURE__ */ new Map([
    ["top", "top"],
    ["tare", "top"],
    ["bottom", "bottom"],
    ["nyo", "bottom"],
    ["left", "left"],
    ["right", "right"],
    ["inside", "center"],
    ["kamae", "center"],
    ["middle", "center"]
  ]);
  function firstFactCandidate(candidates) {
    return candidates.find((candidate) => candidate.value?.trim());
  }
  function firstLocalMeaning(entries) {
    for (const entry of entries) {
      const value = first(entry.meanings);
      if (value) return { value, source: entry.dictionary || "local dictionary" };
    }
    return void 0;
  }
  function readKanjiMapRadical(kanjiAlive, jisho) {
    const context = kanjiMapRadicalContext(kanjiAlive, jisho);
    const basics = readKanjiMapRadicalBasics(context);
    if (!hasKanjiMapRadical(basics)) return void 0;
    return {
      symbol: basics.symbol,
      forms: stringArray(context.jishoRadical?.forms),
      ...readKanjiMapRadicalNames(context),
      meaning: basics.meaning,
      strokes: readKanjiMapRadicalStrokes(context),
      position: readKanjiMapRadicalPosition(context),
      image: basics.image,
      animation: basics.animation
    };
  }
  function kanjiMapRadicalContext(kanjiAlive, jisho) {
    return {
      kanjiAlive,
      aliveRadical: asRecord(kanjiAlive?.radical),
      jishoRadical: asRecord(jisho?.radical)
    };
  }
  function readKanjiMapRadicalNames(context) {
    const name = asRecord(context.aliveRadical?.name);
    return {
      name: firstStringValue([name?.romaji, context.kanjiAlive?.rad_name]),
      reading: firstStringValue([name?.hiragana, context.kanjiAlive?.rad_name_ja])
    };
  }
  function readKanjiMapRadicalBasics(context) {
    return {
      symbol: readKanjiMapRadicalSymbol(context),
      meaning: readKanjiMapRadicalMeaning(context),
      image: safeMediaValue(context.aliveRadical?.image),
      animation: safeMediaValues(context.aliveRadical?.animation).slice(0, 4)
    };
  }
  function readKanjiMapRadicalSymbol(context) {
    return firstStringValue([context.jishoRadical?.symbol, context.kanjiAlive?.rad_utf, context.aliveRadical?.character]);
  }
  function readKanjiMapRadicalMeaning(context) {
    const meaning = asRecord(context.aliveRadical?.meaning);
    return firstStringValue([meaning?.english, context.jishoRadical?.meaning, context.kanjiAlive?.rad_meaning]);
  }
  function readKanjiMapRadicalStrokes(context) {
    return firstNormalizedNumber([context.aliveRadical?.strokes, context.kanjiAlive?.rad_stroke]);
  }
  function readKanjiMapRadicalPosition(context) {
    const position = asRecord(context.aliveRadical?.position);
    return firstStringValue([position?.hiragana, context.kanjiAlive?.rad_position_ja]);
  }
  function firstStringValue(values) {
    for (const value of values) {
      const text = stringValue(value);
      if (text) return text;
    }
    return "";
  }
  function firstNormalizedNumber(values) {
    for (const value of values) {
      const number = normalizeNumber(value);
      if (number !== void 0) return number;
    }
    return "";
  }
  function safeMediaValue(value) {
    return safeMediaUrl(stringValue(value));
  }
  function safeMediaValues(value) {
    return unknownArray(value).map(safeMediaValue).filter(Boolean);
  }
  function hasKanjiMapRadical(radical) {
    return Boolean(radical.symbol || radical.meaning || radical.image);
  }
  function readKanjiMapExamples(kanjiAlive, jisho) {
    const examples = [];
    const add = (expression, reading, meaning) => {
      const item = {
        expression: stringValue(expression),
        reading: stringValue(reading),
        meaning: stringValue(meaning)
      };
      if (!item.expression || examples.some((existing) => existing.expression === item.expression)) return;
      examples.push(item);
    };
    unknownArray(kanjiAlive?.examples).forEach((example) => {
      const record = asRecord(example);
      add(record?.japanese, "", asRecord(record?.meaning)?.english);
    });
    [...unknownArray(jisho?.onyomiExamples), ...unknownArray(jisho?.kunyomiExamples)].forEach((example) => {
      const record = asRecord(example);
      add(record?.example, record?.reading, record?.meaning);
    });
    return examples.slice(0, 6);
  }
  function readKanjiMapReferences(kanjiAlive, jisho) {
    const references = asRecord(kanjiAlive?.references);
    const facts = [];
    const add = (label, value, source) => {
      const text = stringValue(value);
      if (text) facts.push({ label, value: text, source });
    };
    add("Kodansha", references?.kodansha, "Kanji Alive");
    add("Classic Nelson", references?.classic_nelson, "Kanji Alive");
    add("Jisho", jisho?.uri, "Jisho");
    return facts.slice(0, 4);
  }
  function extractLocalKanjiFacts(entries) {
    const facts = {};
    for (const entry of entries) {
      const source = entry.dictionary || "local dictionary";
      for (const tag of entry.tags) {
        readTagFact(tag, facts, source);
      }
      readStatsFacts(entry.stats, facts, source);
    }
    return facts;
  }
  function readTagFact(tag, facts, source) {
    const normalized = tag.trim().toLowerCase().replace(/[＿_]/g, " ");
    readTagTypeFact(normalized, facts, source);
    readTagJlptFact(normalized, facts, source);
    readTagGradeFact(normalized, facts, source);
    readTagStrokeFact(normalized, facts, source);
    readTagFrequencyFact(normalized, facts, source);
  }
  function readTagTypeFact(normalized, facts, source) {
    if (facts.type) return;
    if (/\b(jōyō|jouyou|joyo)\b/.test(normalized)) setFact(facts, "type", "Jōyō kanji", source);
    else if (/\b(jinmeiyō|jinmeiyou|jinmeiyo)\b/.test(normalized)) setFact(facts, "type", "Jinmeiyō kanji", source);
    else if (/\b(hyōgai|hyougai|hyogai|outside|neither)\b/.test(normalized)) setFact(facts, "type", "Outside jōyō/jinmeiyō", source);
  }
  function readTagJlptFact(normalized, facts, source) {
    const jlpt = normalized.match(/\b(?:jlpt\s*)?n?([1-5])\b/);
    if (!facts.jlpt && jlpt && /jlpt|^n[1-5]$/.test(normalized)) setFact(facts, "jlpt", `N${jlpt[1]}`, source);
  }
  function readTagGradeFact(normalized, facts, source) {
    const grade = normalized.match(/\b(?:grade|gakunen|school)\s*([1-6])\b/);
    if (!facts.grade && grade) setFact(facts, "grade", `Grade ${grade[1]}`, source);
  }
  function readTagStrokeFact(normalized, facts, source) {
    const strokes = normalized.match(/\b(?:strokes?|画数)\s*:?\s*(\d{1,2})\b/) ?? normalized.match(/\b(\d{1,2})\s*strokes?\b/);
    if (!facts.strokes && strokes) setFact(facts, "strokes", strokes[1], source);
  }
  function readTagFrequencyFact(normalized, facts, source) {
    const frequency = normalized.match(/\b(?:freq|frequency)\s*:?\s*(\d{1,5})\b/);
    if (!facts.frequency && frequency) setFact(facts, "frequency", `#${frequency[1]}`, source);
  }
  function readStatsFacts(stats, facts, source) {
    if (!stats || typeof stats !== "object") return;
    const values = flattenStats(stats);
    setFact(facts, "jlpt", normalizeJlpt(firstValue(values, ["jlpt", "jlptLevel", "jlpt_level"])), source);
    setFact(facts, "grade", normalizeGrade(firstValue(values, ["grade", "schoolGrade", "gradeLevel", "jouyouGrade"])), source);
    setFact(facts, "strokes", normalizeNumber(firstValue(values, ["strokes", "strokeCount", "stroke_count"])), source);
    setFact(facts, "frequency", normalizeFrequency(firstValue(values, ["frequency", "freq", "frequencyRank"])), source);
  }
  function setFact(facts, key, value, source) {
    if (!value || facts[key]) return;
    facts[key] = value;
    facts[`${key}Source`] = source;
  }
  function flattenStats(stats, prefix = "") {
    const values = /* @__PURE__ */ new Map();
    if (!isPlainStatsRecord(stats)) return values;
    for (const [key, value] of Object.entries(stats)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      values.set(key, value);
      values.set(fullKey, value);
      if (isPlainStatsRecord(value)) flattenStats(value, fullKey).forEach((nestedValue, nestedKey) => values.set(nestedKey, nestedValue));
    }
    return values;
  }
  function isPlainStatsRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }
  function firstValue(values, keys) {
    for (const key of keys) {
      if (values.has(key)) return values.get(key);
    }
    return void 0;
  }
  function normalizeKanjiType(value) {
    if (!value) return void 0;
    if (/jinmeiy/i.test(value)) return "Jinmeiyō kanji";
    if (/j[oō]y[oō]|grade/i.test(value)) return "Jōyō kanji";
    return value;
  }
  function typeFromGrade(value) {
    if (!value) return void 0;
    return /grade/i.test(value) ? "Jōyō kanji" : void 0;
  }
  function normalizeJlpt(value) {
    if (value === void 0 || value === null || value === "") return void 0;
    const match = String(value).match(/[nN]?([1-5])/);
    return match ? `N${match[1]}` : void 0;
  }
  function normalizeGrade(value) {
    if (value === void 0 || value === null || value === "") return "";
    const text = String(value).trim();
    const match = text.match(/(?:grade\s*)?([1-6])/i);
    return match ? `Grade ${match[1]}` : text;
  }
  function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const match = String(value ?? "").match(/\d{1,5}/);
    return match?.[0];
  }
  function normalizeFrequency(value) {
    const number = normalizeNumber(value);
    return number ? `#${number}` : "";
  }
  function splitRtkElements$1(value) {
    return [...new Set(value.split(/[、,;＋+]/).map((item) => item.trim()).filter(Boolean))].slice(0, 16);
  }
  function stringArray(value, fallback = "") {
    const values = Array.isArray(value) ? value : fallback ? fallback.split(/[,、]\s*/) : [];
    return values.map((item) => stringValue(item)).map((item) => item.trim()).filter(Boolean);
  }
  function unknownArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function stringValue(value) {
    if (value === void 0 || value === null) return "";
    if (typeof value === "string") return value.trim();
    if (isFiniteNumber(value)) return String(value);
    return "";
  }
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function numberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const match = String(value ?? "").match(/\d+/);
    return match ? Number(match[0]) : void 0;
  }
  function safeMediaUrl(value) {
    return /^https:\/\/media\.kanjialive\.com\//i.test(value) ? value : "";
  }
  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  }
  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  function requestText$3(url) {
    return requestText$4(url, {
      timeoutMs: 1e4,
      failureLabel: "Kanji origin request",
      timeoutLabel: "Kanji origin request timed out."
    }).catch((error) => {
      log$3.warn("Kanji origin request failed", { host: safeHost(url), error });
      throw error;
    });
  }
  function first(values) {
    return values.find((value) => value?.trim())?.trim();
  }
  function safeHost(url) {
    try {
      return new URL(url, location.href).host;
    } catch {
      return "";
    }
  }
  let trustedHtmlPolicy;
  function parseHtmlDocument(html) {
    const parsed = parseHtmlWithDomParser(html);
    if (parsed) return parsed;
    const fallback = document.implementation.createHTMLDocument("");
    if (assignInnerHtml(fallback.documentElement, html)) return fallback;
    if (assignInnerHtml(fallback.body, html)) return fallback;
    fallback.body.textContent = html;
    return fallback;
  }
  function assignInnerHtml(element, html) {
    try {
      element.innerHTML = trustedHtml(html);
      return true;
    } catch {
      return false;
    }
  }
  function parseXmlDocument(source, mimeType = "text/xml") {
    try {
      return new DOMParser().parseFromString(trustedHtml(source), mimeType);
    } catch {
      return document.implementation.createDocument(null, "");
    }
  }
  function parseHtmlWithDomParser(html) {
    try {
      return new DOMParser().parseFromString(trustedHtml(html), "text/html");
    } catch {
      return null;
    }
  }
  function escapeHtml(value) {
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
  const WEBLIO_LOOKUP_LINK = {
    id: "weblio",
    label: "Weblio",
    urlTemplate: "https://www.weblio.jp/content/{query}",
    enabled: false
  };
  const GOO_LOOKUP_LINK = {
    id: "goo",
    label: "goo",
    urlTemplate: "https://dictionary.goo.ne.jp/srch/all/{query}/m0u/",
    enabled: false
  };
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
    YOMU_LOOKUP_LINK,
    JITEN_LOOKUP_LINK,
    JPDB_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    GOO_LOOKUP_LINK,
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
  [
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    GOO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ];
  Logger.scope("Settings");
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
  new Set(AUDIO_SOURCE_TYPE_VALUES);
  ({
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
  });
  new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  const PROSE_TAGS = /* @__PURE__ */ new Set(["P", "LI", "DD", "DT", "TD", "TH", "BLOCKQUOTE", "FIGCAPTION"]);
  /* @__PURE__ */ new Set([
    ...PROSE_TAGS,
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6"
  ]);
  const COPY = {
    en: {
      settingsTitle: `${APP_NAME} Settings`,
      welcomeLabel: `${APP_NAME} welcome`,
      onboardingEyebrow: "Japanese, wherever it appears",
      onboardingCopy: "Make Japanese text, subtitles, and images tappable while you read.",
      onboardingLanguage: "Settings language",
      onboardingAccentColor: "Accent color",
      customAccentColor: "Custom color",
      onboardingImmersionOptions: "Immersion defaults",
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
      featureStudyBody: "Review JPDB, Anki, Jiten, and optional kanji cards in order on the built-in study page.",
      scanPage: "Scan page",
      noUnscannedJapaneseText: "No unscanned Japanese text found.",
      jpdbScanFailed: "Page scan failed.",
      pageCoverageSummary: "Coverage {percent}% known · {known}/{total} words · {unknown} new · {iPlusOne} i+1",
      settings: "Settings",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "Settings save failed.",
      settingsSections: "Settings sections",
      settingsSearch: "Search settings",
      settingsSearchPlaceholder: "Search settings",
      settingsSearchNoResults: "No settings match your search.",
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
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Paste one JPDB or Jiten API key. Jiten keys start with ak_.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      jpdbApiKeyConfigured: "JPDB key set.",
      jpdbApiKeyMissing: "No JPDB key.",
      jpdbConnected: "Connected to JPDB.",
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
      addToForq: "Also copy JPDB adds to forq",
      enableReviews: "Show review buttons",
      reviewRatingScale: "Review rating scale",
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
      newTabAuto: "Auto: API/Anki, then study words",
      newTabApiSrs: "API SRS (JPDB / Jiten)",
      dictionaryFallback: "Dictionary fallback",
      newTabJpdbReviewMode: "API review mode",
      newTabJpdbReviewAuto: "Auto: live kanji + API vocabulary",
      newTabLiveReview: "Live JPDB review session",
      newTabApiVocabulary: "API vocabulary only (deck order, not JPDB’s review order)",
      corsProxyUrl: "Cross-origin proxy URL",
      newTabKanjiKeywordSource: "Kanji keyword source",
      newTabKanjiKeywordAuto: "Auto: RTK, then {service} kanji facts, then local",
      newTabKanjiKeywordRtk: "RTK / Heisig",
      newTabKanjiKeywordApiFacts: "{service} kanji facts (JPDB / Jiten)",
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
      newTabUrl: "Study address",
      newTabOfflineHelp: "Offline cache keeps your next due cards and queued grades in this browser; grades made offline sync when you reconnect.",
      newTabAddressHelp: "Set this as your browser's start or new-tab page (desktop browsers need a new-tab redirect extension), or add it to your iPad Home Screen.",
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
      parseSelection: "Look up selected text",
      lookupOnClick: "Look up on tap or click",
      lookupOnHover: "Look up on hover",
      lookupOnMiddleMouse: "Look up with middle-mouse hold",
      showFloatingButton: "Show settings puck",
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
      suppressRedundantWordUi: "Hide styling on JPDB-redundant words",
      sheetCloseButtonOnLeft: "Mobile sheet: close button on the left",
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
      suppressAutoAudioOnVideo: "Disable lookup audio auto-play on video pages",
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
      audioProxyGuideIntro: "Public proxy works for most users. Use Worker for private proxy.",
      audioProxyGuideCloudflare: "Open Cloudflare Dashboard.",
      audioProxyGuideWorkers: "Open Workers & Pages, then Create.",
      audioProxyGuideCreateWorker: "Choose Worker, name it, and deploy.",
      audioProxyGuideEditCode: "Edit code and paste the Yomu Worker source.",
      audioProxyGuideDeploy: "Deploy.",
      audioProxyGuideCopyUrl: "Copy the Worker URL, e.g. https://yomu-proxy.yourname.workers.dev.",
      audioProxyGuidePasteUrl: "Paste it into Cross-origin proxy URL. Do not add ?url=.",
      audioProxyGuideTest: "Save, then try lookup, import, or external audio.",
      audioProxyGuideNote: "Worker source is in the repo. Limit hosts before sharing.",
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
      immersionKitHelp: "Examples appear in popups and JPDB. Nadeshiko needs a key.",
      loadingExamples: "Loading examples...",
      noImmersionExamples: "No Immersion Kit examples found.",
      noImmersionExamplesCompact: "No examples",
      immersionKitRateLimited: "Immersion Kit is temporarily rate-limited; retrying later.",
      immersionKitRequest: "Immersion Kit request",
      immersionKitRequestFailed: "Immersion Kit request failed.",
      immersionKitRequestFailedWithStatus: "Immersion Kit request failed ({status}).",
      immersionKitRequestTimedOut: "Immersion Kit request timed out.",
      immersionKitSearchBlocked: "Immersion Kit is blocked here. Configure CORS or use fallback.",
      immersionKitMediaRequest: "Media request",
      immersionKitMediaRequestFailed: "Media request failed.",
      immersionKitMediaRequestFailedWithStatus: "Media request failed ({status}).",
      immersionKitMediaRequestTimedOut: "Media request timed out.",
      immersionKitMediaRequestReturnedNonMedia: "Media request returned an error document instead of audio or image.",
      immersionKitNoMediaCandidate: "No Immersion Kit media candidate could be loaded.",
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
      ocrShowTextOverlay: "Show recognized image text areas",
      ocrVideoPauseFrames: "Read paused video frames",
      ocrVideoFrameStatusCard: "Show paused-frame status card",
      ocrProvider: "Image reading",
      googleLens: "Google Lens (recommended)",
      cloudVision: "Google Cloud Vision",
      localOcr: "Local OCR engine",
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
      ocrBackgroundColor: "Image highlight background",
      ocrBackgroundOpacity: "Image highlight opacity",
      ocrFontScale: "Image text scale",
      ocrEndpointUrl: "Custom local OCR URL",
      ocrCustomLocalServer: "Custom local OCR server",
      ocrEngine: "Local OCR engine",
      cloudVisionApiKey: "Cloud Vision API key",
      ocrHelp: "Reads nearby images; Cloud Vision needs a key.",
      subtitlePlayerEnabled: "Enable video subtitle player",
      subtitleAutoDetect: "Auto-detect page subtitles",
      subtitleOverlayVisible: "Show subtitle overlay",
      subtitleSecondaryVisible: "Show native subtitles when available",
      subtitleNativeBlurred: "Blur native subtitles until hover",
      subtitleKaraokeMode: "Karaoke word timing",
      subtitleTranscriptVisible: "Open transcript panel by default",
      subtitlePausePanel: "Open side panel when paused",
      subtitleTranscriptPlacement: "Transcript panel position",
      subtitleTranscriptAutoScroll: "Scroll transcript with playback",
      subtitleTranscriptAutoScrollResumeSeconds: "Resume transcript auto-scroll after manual scroll (s)",
      subtitleAutoCopyLine: "Auto-copy each subtitle line as it plays",
      subtitleMiningPause: "Pause video when mining subtitle",
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
      youtubeFilterShowing: "{appName} is showing {count} hidden YouTube item{plural}",
      youtubeFilterHid: "{appName} hid {count} non-Japanese-looking YouTube item{plural}",
      youtubeFilterVisible: "{count} Japanese-looking items stayed visible.",
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
      ankiBackIncludes: "Includes dictionary, kanji, pitch, frequency, source, image.",
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
      ankiPreparing: "Creating or refreshing the Yomu deck and note type...",
      ankiScanning: "Reading Anki decks, note types, and fields...",
      ankiScanSummary: "Decks {decks}, note types {models}. Best: {model}. {fields}",
      ankiScanNoModels: "Found {decks} decks. Note types unavailable.",
      ankiScanFieldSummary: "Fields: {fields}",
      ankiUnreachable: "Open desktop Anki, enable AnkiConnect, then check again.",
      ankiCorsBlocked: 'AnkiConnect is running but refuses this site. In Anki: Tools → Add-ons → AnkiConnect → Config, add "{origin}" to webCorsOriginList, then restart Anki.',
      ankiSettingsUnreachable: "AnkiConnect not reached. Open desktop Anki and check again.",
      ankiHostedBridgeMissing: `Enable the ${APP_NAME} userscript, refresh the page, then check again.`,
      ankiStatusOpenDesktop: "Open desktop Anki",
      ankiStatusInstallAddon: "Install/enable AnkiConnect",
      ankiStatusMobileDocs: "Mobile setup docs",
      ankiStatusUseDesktopUrl: "Use the LAN/Tailscale URL on mobile",
      ankiStatusEnableUserscript: `Enable the installed ${APP_NAME} userscript`,
      ankiStatusRefreshAndCheck: "Refresh, then check again",
      ankiHostedCorsHint: "Advanced: direct browser access needs {origin} in AnkiConnect webCorsOriginList.",
      ankiLibraryAdapter: "Existing library adapter",
      ankiLibraryAdapterStatus: "Scans decks and note types, then suggests mappings.",
      ankiLibraryChoices: "Deck and note type",
      ankiLibraryChoicesHelp: "Filled from AnkiConnect. Pick where mining creates or updates notes.",
      ankiTemplateSettings: "Yomu card template",
      ankiTemplateSettingsHelp: "For Yomu note types. Imported templates stay in Anki.",
      ankiMappingConfidenceHelp: "Based on fields and samples. Edit low-confidence mappings.",
      ankiMappingHighConfidence: "High",
      ankiMappingMediumConfidence: "Medium",
      ankiMappingLowConfidence: "Low",
      ankiHelp: "Full Anki uses desktop AnkiConnect over LAN/Tailscale. Handoff only creates new notes.",
      jpdbDefinitionsEnabled: "Show JPDB definitions",
      localDictionariesEnabled: "Show imported dictionary definitions",
      dictionarySourcesInitiallyExpanded: "Open popup sources by default",
      localDictionaryMaxResults: "Dictionary result limit",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import Yomitan settings, ZIPs, or backups.",
      lookupPills: "Lookup pills",
      lookupPillsHelp: "External links. Tokens: {query}, {word}, {reading}.",
      copiesCurrentWord: "Copies the current word",
      lookupPillLabel: "Lookup pill label",
      lookupPillLabelNumber: "Lookup pill {number} label",
      lookupUrlTemplate: "Lookup URL template",
      lookupUrlTemplateNumber: "Lookup pill {number} URL template",
      lookupPillOrder: "Lookup pill order",
      builtInAction: "Built-in action",
      recommendedDownloads: "Recommended dictionaries",
      termDictionaries: "Term dictionaries",
      kanjiDictionaries: "Kanji dictionaries",
      frequencyDictionaries: "Frequency dictionaries",
      homepage: "Homepage",
      install: "Install",
      installing: "Installing",
      queued: "Queued",
      saveAfterInstall: "Save after install",
      download: "Download",
      downloadAndImport: "Download and import into よむ",
      update: "Update",
      noLocalDictionaries: "No local dictionaries yet. Download JMdict or import a Yomitan ZIP.",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryOnlyJpdb: "Only JPDB is enabled. Import Yomitan for local definitions.",
      dictionaryDownloading: "Downloading",
      dictionaryReadingZip: "Reading dictionary ZIP...",
      dictionaryCheckingIndex: "Checking dictionary index...",
      dictionaryBanksFound: "{count} dictionary bank{plural} found.",
      dictionaryRemovingExisting: "removing old entries",
      dictionaryReadingBank: "Reading",
      dictionaryParsingBank: "Parsing",
      dictionarySavingBank: "Saving",
      dictionaryImporting: "Importing",
      importingBundledDictionaries: "Importing bundled dictionaries...",
      dictionaryImported: "Imported",
      dictionaryPreparingImport: "Preparing to import",
      dictionaryRecords: "dictionary records",
      dictionaryEntries: "entries",
      dictionaryTotal: "total",
      dictionaryDownloadProgress: "Downloading dictionary",
      dictionaryStatusSummary: "Dicts {dictionaries}, terms {terms}, kanji {kanji}, meta {metadata}.",
      dictionaryStatusUnavailable: "Dictionary status unavailable.",
      noLocalDictionariesImported: "No local dictionaries imported yet.",
      dictionaryStorageEvicted: "Your {count} imported dictionaries are gone — the browser cleared site storage (Safari evicts inactive sites after ~7 days). Re-import them; regular use or a Home Screen shortcut prevents this.",
      dictionaryDownloadFailed: "Dictionary download failed.",
      dictionaryDownloadTimedOut: "Dictionary download timed out.",
      dictionaryDownloadNotZip: "Dictionary download did not return a ZIP file.",
      dictionaryDownloadNeedsBridge: "Download needs the userscript bridge; else import the ZIP.",
      dictionaryDownloadBlocked: "Download is blocked. Open the URL and import the ZIP manually.",
      dictionaryManualDownloadHint: "Enable the userscript, download again, or import the ZIP.",
      dictionaryInstallQueueHelp: "Installs take a few minutes. Save unlocks when done.",
      dictionaryInstallQueued: "{dictionary} queued; installs after the current dictionary.",
      dictionaryInstallSaveBlocked: "Dictionary import is running. Save unlocks when done.",
      dictionaryImportQueueStatus: "{count} install{plural} running. Save unlocks when done.",
      dictionaryRemoveConfirm: 'Remove "{dictionary}" and all of its imported entries?',
      dictionaryRemoving: "Removing {dictionary}...",
      dictionaryRemoved: "Removed {dictionary}.",
      dictionaryImportComplete: "Imported {records} records from {sources} dictionary source{plural}.",
      dictionaryRecordsImported: "{dictionary}: {records} records imported.",
      settingsImported: "Settings imported.",
      settingsImportedWithDetails: "Settings imported; {details}.",
      settingsExported: "Settings exported.",
      restoredStoredChoices: "restored {count} stored choice{plural}",
      importedDictionaryRecordCount: "imported {count} dictionary record{plural}",
      dictionaryNoSupportedBanks: "No supported Yomitan dictionary banks found.",
      dictionaryUnsupportedJson: "Use Yomitan Dexie, dictionary ZIP, or reader export.",
      dictionaryZipMissingIndex: "Yomitan dictionary ZIP is missing index.json.",
      yomitanSettingsInvalid: "This does not look like a Yomitan settings export.",
      localDictionaryText: "Dictionary text",
      localSenseSingular: "meaning",
      localSensePlural: "meanings",
      localWordSingular: "entry",
      localWordPlural: "entries",
      decksLoaded: "Decks are loaded from your JPDB account.",
      decksUnavailable: "Could not load decks yet; saved IDs are kept.",
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
      jpdbAudioPlayableFileMissing: "JPDB audio did not return a playable file.",
      jpdbAudioResponseNotPlayable: "JPDB audio response was not a playable audio file.",
      audioSourceReturnedNoAudio: "Audio source did not return audio.",
      audioJsonMissingPlayableUrl: "Audio JSON did not include a playable URL.",
      textToSpeechUnavailable: "Text-to-speech is not available in this browser.",
      textToSpeechFailed: "Text-to-speech failed.",
      audioRequest: "Audio request",
      audioRequestTimedOut: "Audio request timed out.",
      audioRequestReturnedNonAudio: "Audio request returned a non-audio response",
      audioRequestReturnedNonAudioWithType: "Audio request returned a non-audio response: {type}.",
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
      copySubtitle: "Copy subtitle",
      subtitleFallbackLabel: "Subtitle",
      subtitlesTitle: "Subtitles",
      openSubtitlePanel: "Open subtitle panel",
      closeSubtitlePanel: "Close subtitle panel",
      closeSubtitleDrawer: "Close subtitle drawer",
      enableSubtitleAutoHide: "Auto-hide panel while playing",
      disableSubtitleAutoHide: "Keep panel open while playing",
      subtitleAutoHideShort: "Auto",
      loadJapaneseSubtitles: "Load Japanese subtitles",
      loadPrimarySubtitles: "Load primary subtitles",
      loadNativeSubtitles: "Load native subtitles",
      toggleNativeSubtitleBlur: "Toggle native subtitle blur",
      subtitleTrackDetectedSingular: "1 subtitle track detected",
      subtitleTracksDetected: "subtitle tracks detected",
      noSubtitleTracksDetected: "No subtitle tracks detected yet.",
      resizeTranscriptPanel: "Resize transcript panel",
      resizeSubtitleTracksPanel: "Resize subtitle tracks panel",
      subtitleNavigation: "Subtitle navigation",
      subtitlePanelMode: "Subtitle panel mode",
      subtitleLines: "Lines",
      subtitleTracks: "Tracks",
      copySubtitleLine: "Copy subtitle line",
      subtitleCopyIncludeTranslation: "Include the translation when copying a line",
      peekSubtitleTranslation: "Show translation",
      hideSubtitleTranslation: "Hide translation",
      loadingSubtitleLines: "Loading subtitle lines",
      waitingForCaptionLines: "Waiting for caption lines",
      subtitleCurrentLineWillAppear: "The current line appears when captions are available.",
      seekSubtitleLine: "Seek subtitle line",
      subtitleTracksHint: "Choose a primary track. Use Lines to browse and jump.",
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
      ocrHidePausedFrameStatusCard: "Hide status card",
      ocrPausedFrameScanning: "Reading paused frame...",
      ocrPausedFrameReady: "Text ready",
      ocrPausedFrameNoText: "No text found",
      ocrPausedFrameFailed: "Could not read text",
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
      helpSupportTitle: "Support よむ",
      helpSupportCopy: SUPPORT_COPY,
      helpSupportCopyExtra: SUPPORT_COPY_EXTRA,
      videoPlayer: "Video Player",
      newTabPage: "New Tab",
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
      jpdbKanjiUpdated: "JPDB kanji updated.",
      jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check JPDB kanji reviews are enabled.",
      apiSrsActionsDisabled: "API mining actions are disabled in settings.",
      addJpdbApiKeyReview: "Add a JPDB API key to review JPDB cards.",
      addJitenApiKeyReview: "Add a Jiten API key to review Jiten cards.",
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
      factoryResetConfirm: "Reset all {appName} data?\n\nDeletes settings, keys, cache, dictionaries, and storage.",
      factoryResetFailed: "Reset failed.",
      factoryResetDictionaryWarning: "Settings reset. Close other tabs before clearing dictionaries.",
      factoryResetOtherTabReloading: "よむ was reset in another tab. Reloading...",
      factoryResetDeleteSettingsFailed: "Could not delete saved settings. Close other tabs and retry.",
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
      kanjiStudyCompanionMissing: "Install or update the Yomu Kanji/Study companion to show JPDB, RTK, stroke order, and origin details.",
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
      reviewBlockedBlacklisted: "This word is blacklisted. Unlist it before reviewing.",
      reviewBlockedNeverForget: "Marked never forget. Remove that before reviewing.",
      reviewBlockedLocked: "This JPDB card is locked. Unlock it in JPDB before reviewing.",
      reviewBlockedRedundant: "JPDB marks this word redundant (covered by another card), so it cannot be reviewed.",
      ankiCardsSuspended: "Suspended in Anki (works like a blacklist).",
      ankiCardsUnsuspended: "Unsuspended in Anki.",
      ankiNeverForgetTagAdded: "Tagged yomu-never-forget in Anki.",
      ankiNeverForgetTagRemoved: "Removed the yomu-never-forget tag in Anki.",
      forget: "Forget",
      never: "Never forget",
      neverHint: "Move to never-forget and count as known.",
      forgetHint: "Remove from never-forget so it can be mined or reviewed.",
      unlist: "Unlist",
      unlistHint: "Remove this from your blacklist to mine or review again.",
      blacklist: "Blacklist",
      blacklistHint: "Ignore this exact word.",
      addToAnki: "Add to Anki",
      checkingAnki: "Checking Anki...",
      sendToMobileAnki: "Send to {app}",
      mobileAnkiActionHint: "Opens mobile Anki to create a new note.",
      ankiAudioFileNotFound: "Anki audio file not found.",
      ankiAudioPlaybackUnavailable: "Anki audio playback is not available here.",
      ankiAudioUnavailablePreview: "Audio not available in preview",
      ankiAudioFilenameLabel: "Anki audio {filename}",
      ankiStoredFields: "Stored fields",
      ankiCardDetailsPending: "Matched in Anki. Loading card details from AnkiConnect...",
      ankiCardDetailsUnavailable: "Matched in Anki. showing cached status.",
      ankiNewCard: "New card",
      ankiMatches: "Anki matches",
      gradeAnkiCardTarget: "Grades Anki card: {target}",
      gradeJpdbCardTarget: "Grades API SRS card",
      ankiMergeNeedsDesktop: "Merging existing Anki notes needs AnkiConnect on desktop.",
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
      openedMobileAnkiHandoff: "Opened mobile Anki handoff. Continue in Anki to create the new note.",
      alreadyInAnki: "Already in Anki. Use Edit in Anki instead.",
      removedFromDeck: "Removed from deck.",
      addedToDeckToast: "Added to deck.",
      apiDeckMediaNotSupported: "Captured image/audio stays in Yomu — this service has no media API.",
      sentToAnkiWithContextImageAndAudio: "Sent to Anki with context image and audio.",
      sentToAnkiWithContextImage: "Sent to Anki with context image.",
      sentToAnkiWithAudio: "Sent to Anki with audio.",
      ankiMergeNoNewData: "Anki note already has the available Yomu data.",
      ankiMergeFieldSingular: "field",
      ankiMergeFieldPlural: "fields",
      ankiMergeAudio: "audio",
      ankiMergeImage: "image",
      ankiMergeComplete: "Merged Yomu data into Anki ({parts}).",
      ankiHandoffCancelled: "Anki handoff cancelled.",
      ankiConnectActionFailed: "AnkiConnect action failed.",
      ankiConnectRequestFailed: "AnkiConnect request failed.",
      ankiConnectTimedOut: "AnkiConnect timed out.",
      ankiConnectNeedsBridge: "AnkiConnect needs the userscript request bridge on content pages.",
      mobileAnkiReady: "Anki is not connected. Mobile handoff can still create notes.",
      ankiConnectionReady: "Connected. AnkiConnect is reachable.",
      ankiConnectedReady: 'Connected. Deck "{deck}" and note type "{model}" are ready.',
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
      imageReadingEnabled: "Image reading enabled.",
      imageReadingHidden: "Image reading hidden.",
      subtitleOverlayEnabled: "Subtitle overlay enabled.",
      subtitleOverlayHidden: "Subtitle overlay hidden.",
      reviewFailed: "Review failed.",
      reviewActionsDisabled: "Review actions are disabled in settings.",
      jpdbLookupFailed: "JPDB lookup failed.",
      jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
      jpdbAddApiKeyRequired: "Add a JPDB API key to add cards to JPDB, or use Add to Anki.",
      addedToJpdb: "Added to JPDB.",
      jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
      jitenAddApiKeyRequired: "Add a Jiten API key to add cards to Jiten, or use Add to Anki.",
      chooseJitenStudyDeck: "Choose a Jiten study deck first.",
      addedToJiten: "Added to Jiten.",
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
      importLocalDefinitionsHelp: "Import Yomitan dictionaries for local definitions.",
      frequencyMetadataHelp: "Frequency, pitch, and kanji metadata appear in badges and kanji data.",
      sourceHelpJpdb: "JPDB meanings from the current card.",
      sourceHelpJiten: "Jiten meanings, examples, and related vocabulary from the current card.",
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
      sourceHelpJitenKanjiFacts: "Jiten kanji facts, exact frequency, readings, and vocabulary.",
      sourceHelpRtk: "RTK keywords, elements, and stories.",
      sourceHelpUchisen: "Uchisen mnemonic image carousel.",
      uchisenMnemonicImages: "Uchisen mnemonic images",
      uchisenMnemonicFor: "Uchisen mnemonic for {kanji}",
      noUchisenImagesYet: "No Uchisen images yet.",
      generateUchisenImage: "Generate image",
      generateUchisenImageToggle: "Generate image +",
      uchisenMnemonicStory: "Mnemonic story",
      uchisenImagePrompt: "Image prompt",
      uchisenGenerateHint: "Edit the story and prompt, then publish a Uchisen image.",
      uchisenGeneratingImage: "Generating image...",
      uchisenPublishingMnemonic: "Publishing mnemonic...",
      uchisenGeneratedImage: "Uchisen image published.",
      uchisenGenerateFailed: "Could not generate Uchisen image.",
      uchisenLoginRequired: "Log in to Uchisen to generate images.",
      noStoryAvailable: "No story available",
      sourceHelpImportedKanjiDictionaries: "Imported Yomitan kanji entries.",
      sourceHelpWordsUsingKanji: "Related vocabulary.",
      sourceHelpComponentGraph: "Kanji facts, component graph, and radical images.",
      recommendedJitendex: "Japanese-English dictionary with examples and notes.",
      recommendedJmdict: "Core Japanese-English dictionary packaged for Yomitan.",
      recommendedJmnedict: "Japanese proper names dictionary.",
      recommendedKanjidic: "Kanji readings, meanings, strokes, levels, and frequency.",
      recommendedJpdbv2Kana: "JPDB frequency data for local frequency chips.",
      recommendedBccwj: "BCCWJ frequency data.",
      recommendedJiten: "Frequency data from the media stats database at jiten.moe.",
      fallbackSetupTitle: "Public JPDB lookup",
      fallbackSetupCopy: "Search works without JPDB. Add dictionaries for offline results.",
      fallbackSetupDictionaries: "Add dictionaries",
      fallbackSetupJpdb: "Add JPDB key",
      getApp: `Get ${APP_NAME}`,
      offlineCacheGradesDisabled: "Offline cache. Grades sync when JPDB or Anki reconnects.",
      recognizing: "Recognizing...",
      noHandwritingMatch: "No handwriting match yet. Type or paste kanji instead.",
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
      allDetectedGrammarKnown: "All detected grammar for this sentence is marked known.",
      grammarShown: "shown",
      grammarKnownHidden: "known hidden",
      grammarGenericShort: "Grammar point: {name}",
      grammarGenericDetail: "This sentence uses {name} in 「{match}」.",
      grammarKindHanabira: "Hanabira grammar",
      grammarLevelCore: "Core"
    }
  };
  function parseUiCopyTable(rows) {
    const copy = {};
    rows.trim().split("\n").forEach((row) => {
      const tab = row.indexOf("	");
      if (tab <= 0) return;
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
onboardingAddApiKey	APIキーを追加
onboardingAddLocalDictionaries	ローカル辞書を追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	スキャン後、日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕がある場合、字幕内の単語もタップできます。
featureControl	調整
featureControlBody	機能、ショートカット、色を調整できます。
featureStudy	学習
featureStudyBody	内蔵の学習ページでJPDB・Anki・Jiten・任意の漢字カードを順番に復習できます。
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
newTabPage	新しいタブ
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
resizeLookupSheet	検索シートのサイズ変更。タップで閉じます
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。設定を確認してください。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
actionFailed	操作に失敗しました。
noDefinitions	有効な定義ソースから結果が返りませんでした。
dictionary	辞書
dictionariesExported	辞書をエクスポートしました。
saveAfterInstall	インストール後に保存
dictionaryDownloading	ダウンロード中
dictionaryReadingZip	辞書ZIPを読み取り中...
dictionaryCheckingIndex	辞書インデックスを確認中...
dictionaryBanksFound	{count}件の辞書バンクが見つかりました。
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
dictionaryStatusSummary	辞書{dictionaries}、語{terms}、漢字{kanji}、メタ{metadata}。
dictionaryStatusUnavailable	辞書状態を取得できません。
noLocalDictionariesImported	ローカル辞書はまだインポートされていません。
dictionaryStorageEvicted	インポート済みの辞書{count}件が消えています。ブラウザがサイトのストレージを削除しました（Safariは約7日間使われないと削除します）。再インポートしてください。定期的な利用やホーム画面への追加で防げます。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ダウンロードにはブリッジが必要です。失敗時はZIPを追加してください。
dictionaryDownloadBlocked	ダウンロードがブロックされています。ZIPを追加してください。
dictionaryManualDownloadHint	ユーザースクリプトを有効にするか、ZIPを追加してください。
dictionaryInstallQueueHelp	インストールには数分かかります。完了後に保存できます。
dictionaryInstallQueued	{dictionary}を待機中です。
dictionaryInstallSaveBlocked	辞書インポート中です。完了すると保存できます。
dictionaryImportQueueStatus	{count}件インストール中です。完了後に保存できます。
dictionaryRemoveConfirm	「{dictionary}」を削除しますか？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
dictionaryImportComplete	{sources}ソースから{records}件インポートしました。
dictionaryRecordsImported	{dictionary}: {records}件インポートしました。
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応しているYomitan辞書バンクが見つかりません。
dictionaryUnsupportedJson	Yomitan Dexie、辞書ZIP、リーダー出力を使ってください。
dictionaryZipMissingIndex	Yomitan辞書ZIPにindex.jsonがありません。
yomitanSettingsInvalid	Yomitan設定エクスポートではないようです。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	既知率{percent}%・{known}/{total}語・新規{unknown}・i+1 {iPlusOne}
noImmersionExamples	イマージョンキットの例文が見つかりません。
noImmersionExamplesCompact	例文なし
noLocalDictionaries	ローカル辞書は未導入です。JMdictかYomitan ZIPを追加してください。
kanjiMapData	漢字マップデータ
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
fallbackSetupTitle	辞書から始める
fallbackSetupCopy	JPDBキーなしでも検索できます。辞書でオフライン対応。
fallbackSetupDictionaries	辞書を追加
fallbackSetupJpdb	JPDBキーを追加
offlineCacheGradesDisabled	オフラインです。採点は再接続時に同期されます。
recognizing	認識中...
noHandwritingMatch	候補がありません。漢字を入力/貼り付けてください。
yourKanjiDrawing	あなたの手書き
jpdbKanjiActions	JPDB漢字操作
couldNotSearchLocalDictionaries	ローカル辞書を検索できませんでした。
subtitlePanel	字幕
lines	行
tracks	トラック
currentLineWillAppear	字幕が利用可能になると現在行が表示されます。
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
immersionKitRateLimited	Immersion Kitは一時制限中です。あとで再試行します。
immersionKitRequest	Immersion Kitリクエスト
immersionKitRequestFailed	Immersion Kitリクエストに失敗しました。
immersionKitRequestFailedWithStatus	Immersion Kitリクエストに失敗しました（{status}）。
immersionKitRequestTimedOut	Immersion Kitリクエストがタイムアウトしました。
immersionKitSearchBlocked	Immersion Kit検索がブロック中です。CORSか代替設定を使ってください。
immersionKitMediaRequest	メディアリクエスト
immersionKitMediaRequestFailed	メディアリクエストに失敗しました。
immersionKitMediaRequestFailedWithStatus	メディアリクエストに失敗しました（{status}）。
immersionKitMediaRequestTimedOut	メディアリクエストがタイムアウトしました。
immersionKitMediaRequestReturnedNonMedia	メディアリクエストがエラードキュメントを返しました。
immersionKitNoMediaCandidate	読み込めるImmersion Kitメディア候補がありませんでした。
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
jpdbExampleAudioUnavailable	この例文で使えるJPDB音声がありません。
jpdbAudioPlayableFileMissing	JPDB音声から再生可能ファイルを取得できません。
jpdbAudioResponseNotPlayable	JPDB音声の応答は再生可能ファイルではありません。
audioSourceReturnedNoAudio	音声ソースから音声を取得できませんでした。
audioJsonMissingPlayableUrl	音声JSONに再生可能なURLがありません。
textToSpeechUnavailable	このブラウザーでは読み上げ機能を利用できません。
textToSpeechFailed	読み上げに失敗しました。
audioRequest	音声リクエスト
audioRequestTimedOut	音声リクエストがタイムアウトしました。
audioRequestReturnedNonAudio	音声リクエストが音声ではない応答を返しました
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101にこの語の音声はありません。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
closeSubtitleDrawer	字幕ドロワーを閉じる
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitleAutoHideShort	自動
loadJapaneseSubtitles	日本語字幕を読み込む
loadPrimarySubtitles	主字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックはまだ検出されていません。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitleNavigation	字幕ナビゲーション
subtitlePanelMode	字幕パネル表示
subtitleLines	行
subtitleTracks	トラック
copySubtitleLine	字幕行をコピー
subtitleCopyIncludeTranslation	行コピー時に翻訳も含める
peekSubtitleTranslation	翻訳を表示
hideSubtitleTranslation	翻訳を隠す
loadingSubtitleLines	字幕行を読み込み中
waitingForCaptionLines	字幕行を待機中
subtitleCurrentLineWillAppear	字幕が利用可能になると現在行が表示されます。
seekSubtitleLine	字幕行へ移動
subtitleTracksHint	主字幕を選び、「行」で一覧と移動を使います。
noAutoDetectedSubtitleTracks	自動検出された字幕トラックはありません。
autoDetectedTracksWillAppear	字幕トラックはここに表示されます。
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
ocrHidePausedFrameStatusCard	ステータスカードを非表示
ocrPausedFrameScanning	一時停止フレームを読み取り中...
ocrPausedFrameReady	テキスト準備完了
ocrPausedFrameNoText	テキストが見つかりません
ocrPausedFrameFailed	テキストを読み取れませんでした
ocrNoReadableImages	近くに読み取れる画像がありません。
showKanji	漢字を表示
strokePractice	筆順と練習
practiceDrawing	手書き練習
strokes	画
textTrace	筆順ガイド
hideTrace	ガイドを隠す
showTrace	ガイドを表示
clear	クリア
kanjiStudyCompanionMissing	Yomu Kanji/Studyコンパニオンをインストールまたは更新すると、JPDB、RTK、筆順、由来情報を表示できます。
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
reviewBlockedRedundant	JPDBで冗長（他のカードでカバー済み）のため、レビューできません。
ankiCardsSuspended	Ankiで保留にしました（ブラックリストと同様の扱い）。
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
ankiHostedCorsHint	上級: 直接接続には {origin} をAnkiConnectのwebCorsOriginListに追加してください。
mobileAnkiReady	Anki未接続。モバイル受け渡しは使えます。
ankiConnectionReady	接続しました。AnkiConnectに到達できます。
ankiConnectedReady	接続済み。デッキ「{deck}」、ノート「{model}」。
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
alreadyInAnki	すでにAnkiにあります。編集はAnkiで行います。
removedFromDeck	デッキから削除しました。
addedToDeckToast	デッキに追加しました。
apiDeckMediaNotSupported	キャプチャした画像・音声はYomuに残ります（このサービスにはメディアAPIがありません）。
sentToAnkiWithContextImageAndAudio	文脈画像と音声付きでAnkiに送信しました。
sentToAnkiWithContextImage	文脈画像付きでAnkiに送信しました。
sentToAnkiWithAudio	音声付きでAnkiに送信しました。
ankiMergeNoNewData	Ankiノートに利用可能なYomuデータは反映済みです。
ankiMergeFieldSingular	フィールド
ankiMergeFieldPlural	フィールド
ankiMergeAudio	音声
ankiMergeImage	画像
ankiMergeComplete	YomuデータをAnkiに統合しました ({parts})。
selection	選択範囲
parsedFrom	解析元
imageReadingEnabled	画像読み取りを有効にしました。
imageReadingHidden	画像読み取りを非表示にしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jpdbAddApiKeyRequired	JPDB追加にはAPIキーかAnki追加が必要です。
addedToJpdb	JPDBに追加しました。
jitenDeckStateApiKeyRequired	Jiten語彙状態の変更にはJiten APIキーが必要です。
jitenAddApiKeyRequired	Jiten追加にはJiten APIキーかAnki追加が必要です。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
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
openSectionToTranslate	このセクションを開くと翻訳します。
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
grammarGenericDetail	この文では「{match}」に「{name}」が使われています。
grammarKindHanabira	Hanabira文法
grammarLevelCore	基本
`);
  const JA_SETTINGS_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致する設定はありません。
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
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	JPDBまたはJiten APIキーを1つ貼り付けます。Jitenキーはak_で始まります。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbApiKeyMissing	JPDBキーなし。
jpdbConnected	JPDBに接続しました。
jpdbConnectionFailed	JPDBがキーを受け付けませんでした（ネットワークまたは無効なキー）。
jitenApiKeyConfigured	Jitenキーあり。
jitenApiKeyMissing	Jitenキーなし。
statusEnabled	有効
statusDisabled	無効
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別の設定に制御されています。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
jpdbPageEnhancementsHelp	
fivePoint	5段階: 全く覚えていないから簡単まで
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後もシートを開いたままにする
popoverBackdropEnabled	ポップオーバーの背後を暗くする
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで広げる
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップの日本語フォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォントスタック
popupFontWeight	ポップアップの日本語の太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabEnabled	学習ページを新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキだけ外します。
newTabSource	学習の復習ソース
newTabAuto	自動: API/Anki、その後に学習語
newTabApiSrs	API SRS（JPDB / Jiten）
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動: ライブ漢字 + API語彙
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順・JPDBの復習順とは異なります）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動: RTK、{service}漢字情報、ローカルの順
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（JPDB / Jiten）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字の書き取りを自動採点
newTabKanjiAutoSubmit	漢字評価を自動送信
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字を学んでから単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプで採点（左＝失敗、右＝合格）
newTabUrl	学習ページのアドレス
newTabOfflineHelp	オフラインキャッシュは次の復習カードと未送信の採点をこのブラウザに保存し、再接続時に同期します。
newTabAddressHelp	ブラウザのスタート/新しいタブページに設定するか（デスクトップではリダイレクト拡張機能が必要）、iPadのホーム画面に追加してください。
newTabJpdbDeck	学習のJPDBデッキ
openNewTabPage	学習を開く
copyAddress	アドレスをコピー
wordColors	単語の色
wordColorNew	新規・デッキ内
wordColorLearning	学習中
wordColorKnown	既知・忘れない
wordColorDue	期限到来
wordColorFailed	失敗
wordColorIgnored	無視・保留・ブラックリスト
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
parseSelection	選択テキストを検索
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
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
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	モバイルシートの閉じるボタンを左側に
hideKnownFurigana	既知カードのみふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバーです。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
similarKanjiWordLimit	類似語の上限
kanjiHelp	
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生する
suppressAutoAudioOnVideo	動画ページでは検索音声の自動再生を無効にする
audioAutoPlayMode	自動再生のきっかけ
audioEnableDefaultSources	内蔵音声ソースを有効にする
audioFallbackChimeEnabled	フォールバックチャイムを有効にする
audioSelectionMode	複数のソースやクリップがあるとき
audioPlayback	音声再生
firstAudio	最初の音声
randomAudio	シャッフル音声
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
audioTimeoutMs	音声タイムアウト (ms)
previewAudio	音声を試聴
audioHelp	URLトークン: {term}、{reading}、{language}。
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
audioCustomJsonPlaceholder	YomitanまたはUltimateの音声ソースURL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースのためURL不要
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyGuideSummary	Cloudflareプロキシを自作する
audioProxyGuideIntro	標準プロキシで十分です。専用ならWorkerへ。
audioProxyGuideCloudflare	Cloudflare Dashboardを開きます。
audioProxyGuideWorkers	Workers & PagesでCreateします。
audioProxyGuideCreateWorker	Workerを選び、名前を付けてDeployします。
audioProxyGuideEditCode	Edit codeでYomu Workerソースを貼ります。
audioProxyGuideDeploy	Deployします。
audioProxyGuideCopyUrl	Worker URLをコピーします。例: https://yomu-proxy.yourname.workers.dev
audioProxyGuidePasteUrl	Cross-origin proxy URLに貼ります。?url=は不要です。
audioProxyGuideTest	保存後、検索・インポート・音声で確認します。
audioProxyGuideNote	Workerソースはリポジトリ内です。共有前にホストを絞ります。
audioProxyWorkerSource	Workerソース
audioProxyDeployGuide	デプロイガイド
immersionKitEnabled	イマージョンキット例文を表示
immersionKitExampleSource	例文プロバイダー
immersionKitAndNadeshiko	イマージョンキット + なでしこ
nadeshikoApiKey	なでしこAPIキー
getNadeshikoKey	キーを取得
immersionKitShowTranslation	例文の翻訳を表示
immersionKitRevealTranslationOnClick	クリックするまで例文の翻訳をぼかす
immersionKitShowImages	例文サムネイルを表示
immersionKitAutoPlayAudio	表示後または前後移動時に例文音声を再生
immersionKitPlayOnHover	サムネイルをホバーしたら例文音声を再生
immersionKitPlayOnImageClick	サムネイルをクリックしたら例文音声を再生
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
immersionKitHelp	例文をポップアップとJPDBに表示。Nadeshikoはキーが必要です。
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
ocrVideoFrameStatusCard	一時停止フレームのステータスカードを表示
ocrProvider	画像読み取り
googleLens	Google Lens (おすすめ)
cloudVision	Google Cloud Vision
localOcr	ローカルOCRエンジン
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
ocrEndpointUrl	カスタムローカルOCR URL
ocrCustomLocalServer	カスタムローカルOCRサーバー
ocrEngine	ローカルOCRエンジン
cloudVisionApiKey	Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Cloud Visionはキーが必要です。
subtitlePlayerEnabled	動画字幕プレイヤーを有効にする
subtitleAutoDetect	ページの字幕を自動検出
subtitleOverlayVisible	字幕オーバーレイを表示
subtitleSecondaryVisible	利用可能ならネイティブ字幕を表示
subtitleNativeBlurred	ホバーするまでネイティブ字幕をぼかす
subtitleKaraokeMode	カラオケ風の単語タイミング
subtitleTranscriptVisible	文字起こしパネルを標準で開く
subtitlePausePanel	一時停止時にサイドパネルを開く
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後に自動スクロールを再開するまで (秒)
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕を採掘するとき動画を一時停止
subtitleControlsMode	字幕コントロール
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
ankiScanSummary	デッキ{decks}件、ノート{models}件。候補: {model}。{fields}
ankiScanNoModels	デッキ{decks}件を検出。ノートタイプは未取得です。
ankiScanFieldSummary	フィールド: {fields}
ankiUnreachable	デスクトップAnkiを開き、AnkiConnectを有効にして再確認してください。
ankiCorsBlocked	AnkiConnectは起動していますが、このサイトを拒否しています。Ankiの「ツール → アドオン → AnkiConnect → 設定」で webCorsOriginList に「{origin}」を追加し、Ankiを再起動してください。
ankiSettingsUnreachable	AnkiConnectに接続できません。デスクトップAnkiを開いて再確認してください。
ankiHostedBridgeMissing	よむユーザースクリプトを有効化し、ページを更新して再確認してください。
ankiStatusOpenDesktop	デスクトップAnkiを開く
ankiStatusInstallAddon	AnkiConnectをインストール/有効化
ankiStatusMobileDocs	モバイル設定ドキュメント
ankiStatusUseDesktopUrl	モバイルではLAN/Tailscale URLを使う
ankiStatusEnableUserscript	インストール済みのよむユーザースクリプトを有効化
ankiStatusRefreshAndCheck	再読み込みして再確認
ankiLibraryAdapter	既存ライブラリアダプター
ankiLibraryAdapterStatus	既存デッキとノートタイプから対応付けを提案します。
ankiLibraryChoices	デッキとノートタイプ
ankiLibraryChoicesHelp	AnkiConnectから読み込み、作成・更新先を選びます。
ankiTemplateSettings	よむカードテンプレート
ankiTemplateSettingsHelp	よむノートタイプ用。既存テンプレートはAnkiに残ります。
ankiMappingConfidenceHelp	フィールド名とサンプルで判断。低信頼度は変更できます。
ankiMappingHighConfidence	高
ankiMappingMediumConfidence	中
ankiMappingLowConfidence	低
ankiHelp	完全なAnki機能はデスクトップAnkiConnectをLAN/Tailscaleで使います。受け渡しは新規ノート作成のみ。
jpdbDefinitionsEnabled	JPDB定義を表示
localDictionariesEnabled	インポート済み辞書の定義を表示
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
localDictionaryMaxResults	辞書結果の上限
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	Yomitan設定、辞書ZIP、バックアップを読み込みます。
lookupPills	検索ピル
lookupPillsHelp	外部リンク。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabel	検索ピルのラベル
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	検索ピル{number}のURLテンプレート
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	おすすめ辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
frequencyDictionaries	頻度辞書
homepage	ホームページ
install	インストール
installing	インストール中
queued	待機中
download	ダウンロード
downloadAndImport	ダウンロードしてよむにインポート
update	更新
checkingDictionaries	インポート済み辞書を確認中...
dictionaryOnlyJpdb	定義ソースはJPDBのみです。Yomitan辞書でローカル定義を追加。
localDictionaryText	辞書テキスト
localSenseSingular	意味
localSensePlural	意味
decksLoaded	JPDBアカウントからデッキを読み込みました。
decksUnavailable	まだデッキを読み込めません。保存済みIDは保持します。
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
helpSupportTitle	よむをサポート
helpSupportCopy	よむはポップアップ検索、JPDB採掘、辞書、OCR、字幕、Ankiを無料でまとめたユーザースクリプトです。
helpSupportCopyExtra	寄付は任意です。開発、端末、サービス、保守、API費用を支えます。
videoPlayer	動画プレイヤー
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書、保存データを削除します。
factoryResetFailed	リセットに失敗しました。
factoryResetDictionaryWarning	設定をリセットしました。他のよむタブを閉じて辞書を確認してください。
factoryResetOtherTabReloading	別のタブでよむがリセットされました。再読み込みします...
factoryResetDeleteSettingsFailed	保存済み設定を削除できません。他のよむタブを閉じて再試行。
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
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書をインポートします。
frequencyMetadataHelp	頻度、ピッチ、漢字メタデータをバッジや漢字データに表示。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	現在のカードのJiten定義、例文、関連語です。
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
sourceHelpJitenKanjiFacts	Jitenの漢字情報、正確な頻度、読み、使用語です。
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
sourceHelpComponentGraph	漢字情報、部品グラフ、部首画像です。
recommendedJitendex	例文とメモ付きの日英辞書です。
recommendedJmdict	Yomitan向けの基本日英辞書です。
recommendedJmnedict	日本語固有名詞辞書です。
recommendedKanjidic	漢字の読み、意味、画数、レベル、頻度です。
recommendedJpdbv2Kana	JPDB頻度データです。
recommendedBccwj	BCCWJ頻度データです。
recommendedJiten	jiten.moe頻度データです。
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
  function splitRtkElements(value) {
    const seen = /* @__PURE__ */ new Set();
    const elements = [];
    value.split(/[、,;＋+]/).map(cleanRtkElementKeyword).filter(Boolean).forEach((keyword) => {
      const key = rtkElementKey(keyword);
      if (seen.has(key)) return;
      seen.add(key);
      elements.push(keyword);
    });
    return elements.slice(0, 16);
  }
  function cleanRtkElementKeyword(value) {
    return value.replace(/\s+/g, " ").trim().replace(/\d+$/u, "").trim();
  }
  function rtkElementKey(value) {
    return cleanRtkElementKeyword(value).toLowerCase().replace(/[’']/g, "");
  }
  const RTK_ELEMENT_GLYPH_FALLBACKS = new Map(
    "heart=心=心|fishhook=乙=乙|fishguts=乙=乙|fish guts=乙=乙|stick=丨|walking stick=丨|drop=丶|drops=丶|a drop of=丶|hook right=⺃|hook (right)=⺃|state of mind=⺖|valentine=⺗|animal legs=ハ|human legs=儿|wind=几|bound up=勹|bound up small=⺈|bound up (small)=⺈|horns=丷|saber=⺉|little=⺌|cliff=厂|water=⺡|fire=⺣|hood=冂|house=宀|flower=艹|pack of wild dogs=⺨|cow left=牜|cow top=⺧|umbrella=𠆢|road=⻌|walking legs=夂|crown=冖|top hat=亠|taskmaster=攵|fiesta=戈|stretch=廴|zoo=疋|zoo left=⺪|cloak=⻂|ice left=冫|ice bottom=⺀|reclining=𠂉|wings=羽=羽|feathers=羽=羽|person=⺅|finger=扌|two hands bottom=廾|elbow=厶|going=彳|altar=⺭|broom=彐|broom old=⺔|rake=⺺|shovel=凵|old man=耂|cocoon=幺|stamp=卩|chop seal=ㄗ|chop seal small=マ|silver=艮|sheaf=㐅|cornucopia=丩|key=ユ|sickness=疒|box=匚|shape=彡|row=业|city walls right=⻏".split("|").map((value) => {
      const [key, glyph, kanji] = value.split("=");
      return [key, kanji ? { glyph, kanji } : { glyph }];
    })
  );
  function rtkElementFallbackGlyph(keyword) {
    return RTK_ELEMENT_GLYPH_FALLBACKS.get(rtkElementKey(keyword));
  }
  new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
  function isKanjiCharacter$1(value) {
    const code = value.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
  }
  function sourceStateAttribute(sourceStateKey, initiallyExpanded) {
    return sourceStateKey ? `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}"` : "";
  }
  function buildRtkComponentSummaries(rtkInfo, jpdbInfo, entries) {
    const elementKeywords = splitRtkElements(rtkInfo?.elements ?? "").filter((keyword) => rtkElementKey(keyword) !== rtkElementKey(rtkInfo?.keyword ?? ""));
    const jpdbByKanji = new Map((jpdbInfo?.components ?? []).map((component) => [component.kanji, component.keyword]));
    const localByKanji = new Map(entries.map((entry) => [entry.character, entry.meanings.slice(0, 3).join(", ")]));
    const summaries = [.../* @__PURE__ */ new Set([...rtkInfo?.componentKanji ?? [], ...jpdbInfo?.components.map((component) => component.kanji) ?? []])].filter(isKanjiCharacter$1).map((kanji, index) => ({
      kanji,
      keyword: jpdbByKanji.get(kanji) || elementKeywords[index] || "",
      meaning: localByKanji.get(kanji) || ""
    }));
    return summaries;
  }
  function renderKanjiKeywordLine(jpdbInfo, rtkInfo, entries, language = "en") {
    const keywords = /* @__PURE__ */ new Map();
    const addKeyword = (text, source) => {
      const normalized = text?.trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase();
      const existing = keywords.get(key) ?? { text: normalized, sources: [] };
      if (!existing.sources.includes(source)) existing.sources.push(source);
      keywords.set(key, existing);
    };
    addKeyword(jpdbInfo?.keyword, "JPDB");
    addKeyword(rtkInfo?.keyword, "RTK");
    entries.flatMap((entry) => entry.meanings).filter(Boolean).slice(0, 3).forEach((keyword) => addKeyword(keyword, uiText(language, "dict")));
    const chips = Array.from(keywords.values()).slice(0, 6).map((keyword) => `<span class="jpdb-reader-kanji-keyword" title="${escapeHtml(keyword.sources.join(" · "))}"><small>${escapeHtml(keyword.sources.join("/"))}</small><span>${escapeHtml(keyword.text)}</span></span>`).join("");
    return chips ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>` : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, "kanjiDetailsUnavailable"))}</div>`;
  }
  function parseRtkElementChip(value) {
    const match = value.match(/^([^\sA-Za-z0-9])\s*(.+)$/u);
    if (!match) return { keyword: value, glyph: "", kanji: "" };
    const glyph = match[1] ?? "";
    return { glyph, kanji: isKanjiCharacter$1(glyph) ? glyph : "", keyword: match[2]?.trim() ?? "" };
  }
  function buildRtkElementChips(info, components2) {
    const componentKanji = new Set(components2.map((component) => component.kanji).filter(Boolean));
    const componentByKeyword = /* @__PURE__ */ new Map();
    components2.forEach((component) => {
      if (component.keyword) componentByKeyword.set(rtkElementKey(component.keyword), { glyph: component.kanji, kanji: component.kanji });
    });
    const chips = splitRtkElements(info.elements).map(parseRtkElementChip).filter((chip) => chip.keyword && rtkElementKey(chip.keyword) !== rtkElementKey(info.keyword)).map((chip) => rtkElementChipWithGlyph(chip, info, componentKanji, componentByKeyword));
    const anchoredKanji = new Set(chips.map((chip) => chip.kanji).filter(Boolean));
    const allKnownComponentsAnchored = componentKanji.size > 0 && [...componentKanji].every((kanji) => anchoredKanji.has(kanji));
    return chips.map((chip, index) => fillRtkChipGlyph(chip, index, chips, allKnownComponentsAnchored));
  }
  function rtkElementChipWithGlyph(chip, info, componentKanji, componentByKeyword) {
    const inferred = rtkElementInferredGlyph(chip, info, componentKanji, componentByKeyword);
    return {
      keyword: chip.keyword,
      glyph: inferred?.glyph ?? "",
      kanji: inferred?.kanji ?? ""
    };
  }
  function rtkElementInferredGlyph(chip, info, componentKanji, componentByKeyword) {
    return inlineRtkElementGlyph(chip, componentKanji) ?? componentByKeyword.get(rtkElementKey(chip.keyword)) ?? info.elementGlyphs?.[rtkElementKey(chip.keyword)] ?? rtkElementFallbackGlyph(chip.keyword);
  }
  function inlineRtkElementGlyph(chip, componentKanji) {
    return chip.glyph && canUseInlineRtkGlyph(chip, componentKanji) ? { glyph: chip.glyph, kanji: chip.kanji } : void 0;
  }
  function canUseInlineRtkGlyph(chip, componentKanji) {
    return !componentKanji.size || componentKanji.has(chip.kanji);
  }
  function fillRtkChipGlyph(chip, index, chips, allKnownComponentsAnchored) {
    if (chip.glyph) return chip;
    const previous = lastAnchoredRtkChip(chips, index);
    if (!previous || !shouldFillRtkChipFromPrevious(chips, index, allKnownComponentsAnchored)) return chip;
    return { ...chip, glyph: previous.glyph, kanji: previous.kanji };
  }
  function shouldFillRtkChipFromPrevious(chips, index, allKnownComponentsAnchored) {
    return allKnownComponentsAnchored || Boolean(nextAnchoredRtkChip(chips, index));
  }
  function lastAnchoredRtkChip(chips, beforeIndex) {
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
      if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
  }
  function nextAnchoredRtkChip(chips, afterIndex) {
    for (let index = afterIndex + 1; index < chips.length; index += 1) {
      if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
  }
  function renderRtkInfo(info, components2, language, initiallyExpanded = true, sourceStateKey) {
    if (!info) return "";
    const elementChips = buildRtkElementChips(info, components2);
    const readings2 = renderRtkReadings(info, language);
    const elementSection = renderRtkElementSection(elementChips, language);
    const stories = renderRtkStories(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-rtk" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
            <summary class="jpdb-reader-local-title">RTK</summary>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml(info.frameNumber)}</span>` : ""}
                </div>
                ${readings2}
                ${elementSection}
                ${stories}
            </div>
        </details>
    `;
  }
  function renderRtkReadings(info, language) {
    if (!info.onYomi && !info.kunYomi) return "";
    return `<div class="jpdb-reader-kanji-readings">
        ${info.onYomi ? `<span>${uiText(language, "onReading")} ${escapeHtml(info.onYomi)}</span>` : ""}
        ${info.kunYomi ? `<span>${uiText(language, "kunReading")} ${escapeHtml(info.kunYomi)}</span>` : ""}
    </div>`;
  }
  function renderRtkElementSection(elementChips, language) {
    return elementChips.length ? `<div class="jpdb-reader-rtk-elements" aria-label="${uiText(language, "rtkComponentKeywords")}">${elementChips.map((chip) => renderRtkElementChip(chip, language)).join("")}</div>` : "";
  }
  function renderRtkElementChip(chip, language) {
    const content = `${chip.glyph ? `<strong>${escapeHtml(chip.glyph)}</strong>` : ""}<span>${escapeHtml(chip.keyword)}</span>`;
    return chip.kanji ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml(chip.kanji)}" title="${escapeHtml(`${uiText(language, "showKanji")}: ${chip.kanji}`)}">${content}</button>` : `<span>${content}</span>`;
  }
  function renderRtkStories(info, language) {
    return [
      info.heisigStory ? `<details><summary>${uiText(language, "heisigStory")}</summary><p>${escapeHtml(info.heisigStory)}</p></details>` : "",
      info.heisigComment ? `<details open><summary>${uiText(language, "heisigComment")}</summary><p>${escapeHtml(info.heisigComment)}</p></details>` : "",
      info.koohiiStories.length ? `<details><summary>${uiText(language, "koohiiStories")}</summary>${info.koohiiStories.map((story) => `<p>${escapeHtml(story)}</p>`).join("")}</details>` : ""
    ].join("");
  }
  function graphEllipseOffset(dx, dy, rx, ry) {
    const denominator = Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry));
    return denominator > 0 ? Math.min(0.48, 1 / denominator) : 0;
  }
  function formatGraphCoordinate(value) {
    return Number(value.toFixed(2)).toString();
  }
  function graphEdgePath(from, to, targetZone = "auto") {
    const normalizedTargetZone = normalizeGraphAnchorZone(targetZone);
    if (normalizedTargetZone === "auto" || normalizedTargetZone === "center") {
      return graphAutoEdgePath(from, to);
    }
    const target = graphFixedAnchorPoint(to, normalizedTargetZone);
    const source = graphAutoBoundaryPoint(from, target);
    return {
      d: `M${formatGraphCoordinate(source.x)} ${formatGraphCoordinate(source.y)} L${formatGraphCoordinate(target.x)} ${formatGraphCoordinate(target.y)}`,
      points: [
        graphLinePoint(source.x, source.y, target.x, target.y, 0.38),
        graphLinePoint(source.x, source.y, target.x, target.y, 0.66)
      ]
    };
  }
  function graphAutoEdgePath(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sourceOffset = graphEllipseOffset(dx, dy, from.rx, from.ry);
    const targetOffset = graphEllipseOffset(dx, dy, to.rx, to.ry);
    const x1 = from.x + dx * sourceOffset;
    const y1 = from.y + dy * sourceOffset;
    const x2 = to.x - dx * targetOffset;
    const y2 = to.y - dy * targetOffset;
    return {
      d: `M${formatGraphCoordinate(x1)} ${formatGraphCoordinate(y1)} L${formatGraphCoordinate(x2)} ${formatGraphCoordinate(y2)}`,
      points: [
        graphLinePoint(x1, y1, x2, y2, 0.38),
        graphLinePoint(x1, y1, x2, y2, 0.66)
      ]
    };
  }
  function graphAutoBoundaryPoint(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const offset = graphEllipseOffset(dx, dy, from.rx, from.ry);
    return {
      x: from.x + dx * offset,
      y: from.y + dy * offset
    };
  }
  function graphFixedAnchorPoint(node, zone) {
    switch (zone) {
      case "top":
        return { x: node.x, y: node.y - node.ry };
      case "left":
        return { x: node.x - node.rx, y: node.y };
      case "right":
        return { x: node.x + node.rx, y: node.y };
      case "bottom":
        return { x: node.x, y: node.y + node.ry };
    }
    return { x: node.x, y: node.y };
  }
  function normalizeGraphAnchorZone(zone) {
    if (zone === "upper") return "top";
    if (zone === "lower") return "bottom";
    return zone;
  }
  function graphLinePoint(x1, y1, x2, y2, t) {
    return {
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t
    };
  }
  const ORIGIN_GRAPH_DRAG_THRESHOLD_PX = 6;
  const ORIGIN_GRAPH_EDGE_PADDING_PERCENT = 1.8;
  function installOriginGraphInteractions(root) {
    root.querySelectorAll(".jpdb-reader-origin-graph-wrap").forEach((wrap) => {
      if (wrap.dataset.graphDragInstalled === "true") {
        refreshOriginGraphEdgesAfterLayout(wrap);
        return;
      }
      wrap.dataset.graphDragInstalled = "true";
      installOriginGraphDrag(wrap);
      installOriginGraphRefreshHooks(wrap);
      refreshOriginGraphEdgesAfterLayout(wrap);
    });
  }
  function installOriginGraphDrag(wrap) {
    let active = null;
    let suppressClick = false;
    wrap.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const node = target?.closest(".jpdb-reader-origin-graph-node");
      if (!node || !wrap.contains(node)) return;
      const pointer = originGraphPointerPercent(wrap, event);
      const center = originGraphNodeCenter(node);
      active = {
        node,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetX: center.x - pointer.x,
        grabOffsetY: center.y - pointer.y,
        moved: false
      };
      node.classList.add("dragging");
      node.setPointerCapture?.(event.pointerId);
    });
    wrap.addEventListener("pointermove", (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      if (!active.moved && pointerDistance(active, event) < ORIGIN_GRAPH_DRAG_THRESHOLD_PX) return;
      event.preventDefault();
      active.moved = true;
      const pointer = originGraphPointerPercent(wrap, event);
      const next = clampOriginGraphNodePosition(wrap, active.node, pointer.x + active.grabOffsetX, pointer.y + active.grabOffsetY);
      moveOriginGraphNode(active.node, next.x, next.y);
      refreshOriginGraphEdges(wrap);
    });
    const finish = (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      active.node.classList.remove("dragging");
      active.node.releasePointerCapture?.(event.pointerId);
      if (active.moved) {
        suppressClick = true;
        event.preventDefault();
        event.stopPropagation();
      }
      active = null;
    };
    wrap.addEventListener("pointerup", finish);
    wrap.addEventListener("pointercancel", finish);
    wrap.addEventListener("click", (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
  function installOriginGraphRefreshHooks(wrap) {
    wrap.closest("details")?.addEventListener("toggle", () => refreshOriginGraphEdgesAfterLayout(wrap));
    wrap.querySelectorAll(".jpdb-reader-origin-graph-toggle input").forEach((input) => {
      input.addEventListener("change", () => refreshOriginGraphEdgesAfterLayout(wrap));
    });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => refreshOriginGraphEdgesAfterLayout(wrap));
      observer.observe(wrap);
      wrap.querySelectorAll(".jpdb-reader-origin-graph-node").forEach((node) => observer.observe(node));
    }
  }
  function pointerDistance(active, event) {
    return Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
  }
  function refreshOriginGraphEdgesAfterLayout(wrap) {
    setOriginGraphReady(wrap, refreshOriginGraphEdges(wrap));
    requestOriginGraphFrame(() => {
      setOriginGraphReady(wrap, refreshOriginGraphEdges(wrap));
    });
  }
  function requestOriginGraphFrame(callback) {
    const requestFrame = typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : (frameCallback) => window.setTimeout(() => frameCallback(performance.now()), 0);
    requestFrame(callback);
  }
  function setOriginGraphReady(wrap, ready) {
    if (ready) {
      wrap.dataset.graphReady = "true";
    } else {
      delete wrap.dataset.graphReady;
    }
  }
  function originGraphPointerPercent(wrap, event) {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 50, y: 50 };
    return {
      x: (event.clientX - rect.left) / rect.width * 100,
      y: (event.clientY - rect.top) / rect.height * 100
    };
  }
  function clampOriginGraphNodePosition(wrap, node, x, y) {
    const measured = measuredOriginGraphNodeRadii(wrap, node);
    const fallbackRx = Number(node.dataset.rx || 5);
    const fallbackRy = Number(node.dataset.ry || 5);
    const rx = measured.rx || fallbackRx;
    const ry = measured.ry || fallbackRy;
    return {
      x: clampGraphPercent(x, rx + ORIGIN_GRAPH_EDGE_PADDING_PERCENT, 100 - rx - ORIGIN_GRAPH_EDGE_PADDING_PERCENT),
      y: clampGraphPercent(y, ry + ORIGIN_GRAPH_EDGE_PADDING_PERCENT, 100 - ry - ORIGIN_GRAPH_EDGE_PADDING_PERCENT)
    };
  }
  function moveOriginGraphNode(node, x, y) {
    node.dataset.x = String(x);
    node.dataset.y = String(y);
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
  }
  function refreshOriginGraphEdges(wrap) {
    const wrapRect = wrap.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return false;
    wrap.querySelectorAll(".jpdb-reader-origin-edge-group").forEach((group) => {
      const from = originGraphNodeGeometry(wrap, group.dataset.from);
      const to = originGraphNodeGeometry(wrap, group.dataset.to);
      if (!from || !to) return;
      const edgePath = graphEdgePath(from, to, originGraphTargetZone(group.dataset.targetZone));
      const path = group.querySelector(".jpdb-reader-origin-edge");
      path?.setAttribute("d", edgePath.d);
    });
    return true;
  }
  function originGraphNodeGeometry(wrap, id) {
    if (!id) return null;
    const node = Array.from(wrap.querySelectorAll(".jpdb-reader-origin-graph-node")).find((candidate) => candidate.dataset.graphNode === id);
    if (!node) return null;
    const measured = measuredOriginGraphNodeRadii(wrap, node);
    return {
      ...originGraphNodeCenter(node),
      rx: measured.rx || Number(node.dataset.rx || 5),
      ry: measured.ry || Number(node.dataset.ry || 5)
    };
  }
  function originGraphNodeCenter(node) {
    return {
      x: Number(node.dataset.x || 0),
      y: Number(node.dataset.y || 0)
    };
  }
  function measuredOriginGraphNodeRadii(wrap, node) {
    const wrapRect = wrap.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return { rx: 0, ry: 0 };
    const width = node.offsetWidth || node.getBoundingClientRect().width;
    const height = node.offsetHeight || node.getBoundingClientRect().height;
    return {
      rx: width > 0 ? width / 2 / wrapRect.width * 100 : 0,
      ry: height > 0 ? height / 2 / wrapRect.height * 100 : 0
    };
  }
  function originGraphTargetZone(value) {
    return value === "top" || value === "upper" || value === "left" || value === "right" || value === "lower" || value === "bottom" || value === "center" ? value : "auto";
  }
  function clampGraphPercent(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number(value.toFixed(2))));
  }
  const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
  const JPDB_BASE_URL = "https://jpdb.io";
  function cleanText$1(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function decodePathPart(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function absoluteJpdbUrl(value, fallback = "") {
    try {
      return new URL(value || "/", JPDB_BASE_URL).toString();
    } catch {
      return fallback;
    }
  }
  function parseJpdbVocabularyUrl(value) {
    if (!value) return null;
    try {
      return parseJpdbVocabularyPath(new URL(value, JPDB_BASE_URL).pathname);
    } catch {
      return null;
    }
  }
  function parseJpdbVocabularyPath(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] !== "vocabulary") return null;
    const vid = Number.parseInt(parts[1] ?? "", 10);
    const reading = decodePathPart(parts[3] ?? "");
    return {
      vid: Number.isFinite(vid) ? vid : 0,
      expression: decodePathPart(parts[2] ?? ""),
      reading: JAPANESE_RE.test(reading) ? reading : ""
    };
  }
  const JPDB_KANJI_BASE_URL = "https://jpdb.io/kanji";
  const log$2 = Logger.scope("JpdbKanji");
  class JpdbKanjiClient {
    constructor(getCorsProxyUrl = () => "") {
      this.getCorsProxyUrl = getCorsProxyUrl;
    }
    cache = /* @__PURE__ */ new Map();
    actions = /* @__PURE__ */ new Map();
    lookup(kanji) {
      const key = Array.from(kanji)[0] ?? kanji;
      if (!key) return Promise.resolve(null);
      let promise = this.cache.get(key);
      if (!promise) {
        promise = this.fetchInfo(key);
        this.cache.set(key, promise);
      }
      return promise;
    }
    async performAction(actionId) {
      const action = this.actions.get(actionId);
      if (!action) throw new Error("JPDB kanji action is no longer available.");
      if (!action.enabled) throw new Error("JPDB kanji action is disabled.");
      log$2.info("Performing JPDB kanji action", { kanji: action.kanji, role: action.role, kind: action.kind });
      await requestText$2(action.url, "", {
        method: action.method,
        payload: action.payload,
        allowProxyFallback: false,
        allowConfiguredProxy: false,
        credentials: "same-origin"
      });
      this.cache.delete(action.kanji);
      return this.lookup(action.kanji);
    }
    async fetchInfo(kanji) {
      const html = await requestText$2(`${JPDB_KANJI_BASE_URL}/${encodeURIComponent(kanji)}`, this.getCorsProxyUrl()).catch((error) => {
        log$2.warn("Kanji page request failed", { kanji }, error);
        return "";
      });
      const info = html ? parseJpdbKanjiHtml(html, kanji) : null;
      if (info) {
        visibleJpdbKanjiActions(info).forEach((action) => this.actions.set(action.id, action));
      }
      return info;
    }
  }
  function parseJpdbKanjiHtml(html, kanji) {
    const doc = parseHtmlDocument(html);
    const keyword = sectionText(doc, "Keyword") || metaKeyword(doc, kanji);
    if (!keyword) return null;
    const parsed = parsedJpdbKanjiPage(doc);
    const actions = kanjiActions(doc, kanji);
    const visibleActions = actions.filter(isVisibleKanjiAction);
    return {
      kanji,
      keyword,
      ...parsed,
      mnemonic: sectionText(doc, "Mnemonic"),
      actions,
      loggedIn: isLoggedIn(doc),
      kanjiReviewsEnabled: visibleActions.length > 0
    };
  }
  function parsedJpdbKanjiPage(doc) {
    const infoRows = infoTableRows(doc);
    return {
      frequency: infoRows.get("Frequency") ?? "",
      type: infoRows.get("Type") ?? "",
      kanken: infoRows.get("Kanken") ?? "",
      heisig: infoRows.get("Heisig") ?? "",
      oldForms: oldForms(doc),
      readings: readings(doc),
      components: components(doc),
      usedInKanji: usedInKanji(doc),
      vocabulary: vocabulary(doc).slice(0, 8)
    };
  }
  function visibleJpdbKanjiActions(info) {
    if (!info?.kanjiReviewsEnabled) return [];
    return info.actions.filter(isVisibleKanjiAction).slice(0, 3);
  }
  function jpdbKanjiActionClass(action) {
    return KANJI_ACTION_CLASS_BY_ROLE[action.role] ?? "";
  }
  const KANJI_ACTION_CLASS_BY_ROLE = {
    mine: "add",
    review: "add",
    known: "nf",
    neverforget: "nf",
    blacklist: "blacklist",
    forget: "nf danger",
    other: ""
  };
  function isVisibleKanjiAction(action) {
    return action.enabled && action.role !== "other";
  }
  function isLoggedIn(doc) {
    return !doc.querySelector('a[href="/login"], a[href^="/login?"], form[action="/login"], form[action^="/login?"]');
  }
  function kanjiActions(doc, kanji) {
    const menu = doc.querySelector(".result.kanji .menu, .kanji .menu, .menu");
    if (!menu) return [];
    const actions = [];
    const push = (action) => {
      const id = `jpdb-kanji:${encodeURIComponent(kanji)}:${actions.length}`;
      actions.push({ ...action, id });
    };
    menu.querySelectorAll("form").forEach((form) => {
      const method = (form.getAttribute("method") || "GET").toUpperCase() === "POST" ? "POST" : "GET";
      const url = absoluteJpdbUrl(form.getAttribute("action") || `/kanji/${encodeURIComponent(kanji)}`, "https://jpdb.io/");
      const submitters = Array.from(form.querySelectorAll('button, input[type="submit"], input[type="button"]')).filter((submitter) => cleanText$1(labelForControl(submitter)) && submitter.getAttribute("type")?.toLowerCase() !== "button");
      const controls = submitters.length ? submitters : [form];
      controls.forEach((control) => {
        const action = kanjiFormAction(form, control, kanji, method, url);
        if (action) push(action);
      });
    });
    menu.querySelectorAll("a[href]").forEach((link) => {
      if (link.closest("form")) return;
      const label = cleanText$1(labelForControl(link));
      if (!label) return;
      const url = absoluteJpdbUrl(link.getAttribute("href") ?? "", "https://jpdb.io/");
      push({
        kanji,
        label,
        role: classifyKanjiAction(label, url),
        kind: "link",
        method: "GET",
        url,
        payload: {},
        enabled: !isDisabled(link)
      });
    });
    return actions.filter((action) => action.role !== "other" || /kanji|review|deck|blacklist|known|forget/i.test(action.label));
  }
  function labelForControl(element) {
    if (element instanceof HTMLInputElement) return inputControlLabel(element);
    return element.getAttribute("aria-label") || element.title || element.textContent || "";
  }
  function kanjiFormAction(form, control, kanji, method, url) {
    const label = cleanText$1(control instanceof HTMLFormElement ? form.textContent ?? "" : labelForControl(control));
    if (!label) return null;
    return {
      kanji,
      label,
      role: classifyKanjiAction(label, `${url} ${kanjiFormActionContext(form, control)}`),
      kind: "form",
      method,
      url,
      payload: formPayload(form, control instanceof HTMLFormElement ? null : control),
      enabled: kanjiFormActionEnabled(form, control)
    };
  }
  function kanjiFormActionContext(form, control) {
    return control instanceof HTMLFormElement ? form.textContent ?? "" : control.getAttribute("value") ?? "";
  }
  function kanjiFormActionEnabled(form, control) {
    if (control instanceof HTMLFormElement) return !isDisabled(form);
    return !isDisabled(control) && !isDisabled(form);
  }
  function classifyKanjiAction(label, context) {
    const labelText = label.toLowerCase();
    const text = `${label} ${context}`.toLowerCase();
    if (KANJI_ACTION_OTHER_RE.test(labelText)) return "other";
    return KANJI_ACTION_PATTERNS.find(({ pattern }) => pattern.test(text))?.role ?? "other";
  }
  function inputControlLabel(element) {
    return element.getAttribute("aria-label") || element.title || element.value || element.name;
  }
  const KANJI_ACTION_OTHER_RE = /\b(enable|settings?|configure|preferences?|history|stats?|open|view)\b/;
  const KANJI_ACTION_PATTERNS = [
    { role: "blacklist", pattern: /\b(blacklist|unblacklist|block|ignore|suspend)\b/ },
    { role: "neverforget", pattern: /\b(never[-\s]?forget|always\s+remember)\b/ },
    { role: "forget", pattern: /\b(forget|remove|delete|unlearn)\b/ },
    { role: "known", pattern: /\b(known|know|learned|mark\s+known|remember)\b/ },
    { role: "review", pattern: /\b(review|due|study)\b/ },
    { role: "mine", pattern: /\b(add|mine|mining|deck|prioriti[sz]e|learn)\b/ }
  ];
  function formPayload(form, submitter) {
    const payload = {};
    form.querySelectorAll("input, select, textarea").forEach((control) => {
      addFormControlPayload(payload, control);
    });
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
      const name = submitter.name;
      if (name) payload[name] = submitter.value;
    }
    return payload;
  }
  function addFormControlPayload(payload, control) {
    if (!control.name || !shouldIncludeFormControl(control)) return;
    payload[control.name] = control.value;
  }
  function shouldIncludeFormControl(control) {
    return !(control instanceof HTMLInputElement) || shouldIncludeInputControl(control);
  }
  function shouldIncludeInputControl(control) {
    const type = control.type.toLowerCase();
    if (IGNORED_FORM_INPUT_TYPES.has(type)) return false;
    return !CHECKED_FORM_INPUT_TYPES.has(type) || control.checked;
  }
  const IGNORED_FORM_INPUT_TYPES = /* @__PURE__ */ new Set(["submit", "button", "image", "reset", "file"]);
  const CHECKED_FORM_INPUT_TYPES = /* @__PURE__ */ new Set(["checkbox", "radio"]);
  function isDisabled(element) {
    return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || element.classList.contains("disabled") || element.classList.contains("is-disabled");
  }
  function sectionText(doc, label) {
    const heading = Array.from(doc.querySelectorAll(".subsection-label")).find((element) => cleanText$1(element.textContent ?? "") === label);
    const section = heading?.parentElement?.querySelector(".subsection") ?? null;
    const value = cleanText$1(section?.textContent ?? "");
    return isMissingSectionValue(value, section) ? "" : value;
  }
  function infoTableRows(doc) {
    const rows = /* @__PURE__ */ new Map();
    doc.querySelectorAll(".cross-table tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) return;
      const key = cleanText$1(cells[0].textContent ?? "");
      const value = cleanInfoTableValue(cells[1]);
      if (value) rows.set(key, value);
    });
    return rows;
  }
  function oldForms(doc) {
    const row = Array.from(doc.querySelectorAll(".cross-table tr")).find((item) => cleanText$1(item.querySelector("td")?.textContent ?? "") === "Old form");
    return Array.from(row?.querySelectorAll('a[href^="/kanji/"]') ?? []).map((link) => cleanText$1(link.textContent ?? "")).filter(Boolean);
  }
  function readings(doc) {
    const seen = /* @__PURE__ */ new Set();
    const entries = [];
    doc.querySelectorAll(".kanji-reading-list-common > div, .kanji-reading-list > div").forEach((row) => {
      const link = row.querySelector("a");
      const reading = cleanText$1(link?.textContent ?? "");
      if (!reading || seen.has(reading)) return;
      seen.add(reading);
      entries.push({
        reading,
        share: cleanText$1(row.textContent ?? "").replace(reading, "").trim(),
        common: row.closest(".kanji-reading-list-common") !== null
      });
    });
    return entries;
  }
  function components(doc) {
    return kanjiSectionEntries(doc, (label) => label.startsWith("Composed of"));
  }
  function usedInKanji(doc) {
    return kanjiSectionEntries(doc, (label) => label.startsWith("Used in kanji"));
  }
  function kanjiSectionEntries(doc, matchesLabel) {
    return Array.from(doc.querySelectorAll(".subsection-composed-of-kanji")).filter((section) => matchesLabel(cleanText$1(section.querySelector(".subsection-label")?.textContent ?? ""))).flatMap((section) => Array.from(section.querySelectorAll(".subsection > div"))).map((element) => ({
      kanji: cleanText$1(element.querySelector(".spelling")?.textContent ?? ""),
      keyword: cleanText$1(element.querySelector(".description")?.textContent ?? "")
    })).filter((component) => component.kanji && component.keyword);
  }
  function vocabulary(doc) {
    const entries = [];
    doc.querySelectorAll(".subsection-used-in .used-in").forEach((element) => {
      const entry = jpdbKanjiVocabularyEntry(element);
      if (entry) entries.push(entry);
    });
    return entries;
  }
  function jpdbKanjiVocabularyEntry(element) {
    const link = element.querySelector('.jp a[href^="/vocabulary/"]');
    if (!link) return null;
    const expression = jpdbKanjiVocabularyExpression(link);
    const meaning = jpdbKanjiVocabularyMeaning(element);
    if (!isJpdbKanjiVocabularyEntry(expression, meaning)) return null;
    return {
      expression,
      reading: jpdbKanjiVocabularyReading(link),
      meaning,
      url: absoluteJpdbUrl(jpdbKanjiVocabularyHref(link))
    };
  }
  function jpdbKanjiVocabularyExpression(link) {
    const identity = parseJpdbVocabularyUrl(jpdbKanjiVocabularyHref(link));
    return identity?.expression || textWithoutRuby(link);
  }
  function jpdbKanjiVocabularyReading(link) {
    return parseJpdbVocabularyUrl(jpdbKanjiVocabularyHref(link))?.reading ?? "";
  }
  function jpdbKanjiVocabularyMeaning(element) {
    return cleanText$1(element.querySelector(".en")?.textContent ?? "");
  }
  function jpdbKanjiVocabularyHref(link) {
    return link.getAttribute("href") ?? "";
  }
  function isJpdbKanjiVocabularyEntry(expression, meaning) {
    return JAPANESE_RE.test(expression) && Boolean(meaning);
  }
  function textWithoutRuby(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("rt, rp").forEach((node) => node.remove());
    return cleanText$1(clone.textContent ?? "");
  }
  function metaKeyword(doc, kanji) {
    const description = doc.querySelector('meta[name="description"]')?.content ?? "";
    const match = new RegExp(`${escapeRegExp(kanji)}[^—-]*[—-]\\s*([^\\n]+)`).exec(description);
    return cleanText$1(match?.[1] ?? "");
  }
  function cleanInfoTableValue(cell) {
    return cleanText$1(cell.textContent ?? "").replace(/\s+\?$/, "");
  }
  function isMissingSectionValue(value, section) {
    const normalized = value.trim().toLowerCase();
    return normalized === "" || normalized === "missing" || section?.querySelector(".keyword-missing") !== null;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function requestText$2(url, proxyUrl = "", options = {}) {
    const method = options.method ?? "GET";
    const body = requestTextBody(options.payload);
    const requestUrl = requestTextUrl(url, method, body);
    const headers = requestTextHeaders(method);
    return requestText$4(requestUrl, {
      method,
      headers,
      data: method === "POST" ? body : void 0,
      proxyUrl,
      credentials: options.credentials ?? "omit",
      redirect: "follow",
      timeoutMs: 8e3,
      allowPublicProxies: options.allowProxyFallback ?? method === "GET",
      allowConfiguredProxy: options.allowConfiguredProxy,
      failureLabel: "JPDB kanji request",
      timeoutLabel: "JPDB kanji request timed out."
    });
  }
  function requestTextBody(payload) {
    return payload && Object.keys(payload).length ? new URLSearchParams(payload).toString() : "";
  }
  function requestTextUrl(url, method, body) {
    return method === "GET" && body ? `${url}${url.includes("?") ? "&" : "?"}${body}` : url;
  }
  function requestTextHeaders(method) {
    return method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : void 0;
  }
  const SVG_PATH_TOKEN = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
  const CURVE_STEPS = 10;
  const PATH_COMMAND_READERS = {
    M: (sampler, relative) => sampler.readMove(relative),
    L: (sampler, relative) => sampler.readLines(relative),
    H: (sampler, relative) => sampler.readHorizontalLines(relative),
    V: (sampler, relative) => sampler.readVerticalLines(relative),
    C: (sampler, relative) => sampler.readCubics(relative),
    S: (sampler, relative) => sampler.readSmoothCubics(relative),
    Q: (sampler, relative) => sampler.readQuadratics(relative),
    T: (sampler, relative) => sampler.readSmoothQuadratics(relative),
    A: (sampler, relative) => sampler.readArcs(relative),
    Z: (sampler) => sampler.closePath()
  };
  function parseSvgPathPoints(pathData) {
    return new SvgPathSampler(pathData).parse();
  }
  class SvgPathSampler {
    tokens;
    index = 0;
    command = "";
    current = { x: 0, y: 0 };
    start = { x: 0, y: 0 };
    lastCubicControl = null;
    lastQuadraticControl = null;
    points = [];
    constructor(pathData) {
      this.tokens = pathData.match(SVG_PATH_TOKEN) ?? [];
    }
    parse() {
      while (this.index < this.tokens.length) {
        if (isPathCommand(this.tokens[this.index])) this.command = this.tokens[this.index++] ?? "";
        if (!this.command) break;
        const before = this.index;
        const reader = PATH_COMMAND_READERS[this.command.toUpperCase()];
        if (!reader?.(this, this.command === this.command.toLowerCase())) return this.points;
        if (this.index === before && !isPathCommand(this.tokens[this.index])) return this.points;
      }
      return this.points;
    }
    readMove(relative) {
      if (!this.hasNumbers(2)) return false;
      this.current = this.absolute(this.read(), this.read(), relative);
      this.start = this.current;
      this.push(this.current);
      this.command = relative ? "l" : "L";
      this.clearControls();
      return true;
    }
    readLines(relative) {
      while (this.hasNumbers(2)) this.lineTo(this.absolute(this.read(), this.read(), relative));
      return true;
    }
    readHorizontalLines(relative) {
      while (this.hasNumbers(1)) {
        const x = this.read();
        this.lineTo({ x: relative ? this.current.x + x : x, y: this.current.y });
      }
      return true;
    }
    readVerticalLines(relative) {
      while (this.hasNumbers(1)) {
        const y = this.read();
        this.lineTo({ x: this.current.x, y: relative ? this.current.y + y : y });
      }
      return true;
    }
    readCubics(relative) {
      return this.readCurve(6, () => {
        this.sampleCubicTo(
          this.readAbsolutePoint(relative),
          this.readAbsolutePoint(relative),
          this.readAbsolutePoint(relative)
        );
      });
    }
    readSmoothCubics(relative) {
      return this.readCurve(4, () => {
        const c1 = this.lastCubicControl ? reflect(this.current, this.lastCubicControl) : this.current;
        this.sampleCubicTo(c1, this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
      });
    }
    readQuadratics(relative) {
      return this.readCurve(4, () => {
        this.sampleQuadraticTo(this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
      });
    }
    readSmoothQuadratics(relative) {
      return this.readCurve(2, () => {
        const control = this.lastQuadraticControl ? reflect(this.current, this.lastQuadraticControl) : { ...this.current };
        this.sampleQuadraticTo(control, this.readAbsolutePoint(relative));
      });
    }
    readCurve(numberCount, readSegment) {
      while (this.hasNumbers(numberCount)) readSegment();
      return true;
    }
    setCubicControl(control) {
      this.lastCubicControl = control;
      this.lastQuadraticControl = null;
    }
    setQuadraticControl(control) {
      this.lastQuadraticControl = control;
      this.lastCubicControl = null;
    }
    readAbsolutePoint(relative) {
      return this.absolute(this.read(), this.read(), relative);
    }
    sampleCubicTo(c1, c2, end) {
      sampleCubic(this.current, c1, c2, end, (point) => this.push(point));
      this.current = end;
      this.setCubicControl(c2);
    }
    sampleQuadraticTo(control, end) {
      sampleQuadratic(this.current, control, end, (point) => this.push(point));
      this.current = end;
      this.setQuadraticControl(control);
    }
    readArcs(relative) {
      while (this.hasNumbers(7)) {
        this.read();
        this.read();
        this.read();
        this.read();
        this.read();
        this.lineTo(this.absolute(this.read(), this.read(), relative));
      }
      return true;
    }
    closePath() {
      this.lineTo(this.start);
      this.command = "";
      return true;
    }
    push(point) {
      const previous = this.points.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-3) this.points.push(point);
    }
    hasNumbers(count) {
      return this.index + count <= this.tokens.length && this.tokens.slice(this.index, this.index + count).every((token) => !isPathCommand(token));
    }
    read() {
      return Number(this.tokens[this.index++]);
    }
    absolute(x, y, relative) {
      return relative ? { x: this.current.x + x, y: this.current.y + y } : { x, y };
    }
    lineTo(point) {
      this.current = point;
      this.push(this.current);
      this.clearControls();
    }
    clearControls() {
      this.lastCubicControl = null;
      this.lastQuadraticControl = null;
    }
  }
  function isPathCommand(token) {
    return Boolean(token && /^[A-Za-z]$/.test(token));
  }
  function reflect(origin, control) {
    return {
      x: origin.x * 2 - control.x,
      y: origin.y * 2 - control.y
    };
  }
  function sampleCubic(from, c1, c2, to, push) {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const mt = 1 - t;
      push({
        x: mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x,
        y: mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y
      });
    }
  }
  function sampleQuadratic(from, c, to, push) {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const mt = 1 - t;
      push({
        x: mt ** 2 * from.x + 2 * mt * t * c.x + t ** 2 * to.x,
        y: mt ** 2 * from.y + 2 * mt * t * c.y + t ** 2 * to.y
      });
    }
  }
  const KANJIVG_RAW_BASE = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";
  const KANJIVG_POSITION_THRESHOLD = 0.12;
  const KANJIVG_HORIZONTAL_DOMINANCE = 1.12;
  const KANJIVG_SAFE_PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/;
  const KANJIVG_STROKE_LABEL = /^[\d]+$/;
  const KANJIVG_TEXT_TRANSFORM = /^matrix\([0-9,.\-\s]+\)$/;
  const log$1 = Logger.scope("KanjiVG");
  const KANJIVG_AXIS_POSITIONS = {
    x: { negative: "left", positive: "right" },
    y: { negative: "top", positive: "bottom" }
  };
  class KanjiVGClient {
    cache = /* @__PURE__ */ new Map();
    // fallow-ignore-next-line unused-class-member
    lookup(kanji) {
      const character = Array.from(kanji)[0] ?? "";
      if (!character) return Promise.resolve(null);
      let promise = this.cache.get(character);
      if (!promise) {
        promise = this.fetchSvg(character);
        this.cache.set(character, promise);
      }
      return promise;
    }
    async fetchSvg(kanji) {
      const url = kanjiVGUrl(kanji);
      const svgText = await requestText$1(url).catch((error) => {
        log$1.warn("Stroke-order request failed", { kanji }, error);
        return "";
      });
      if (!svgText) return null;
      const info = parseKanjiVGSvg(svgText, kanji);
      return info;
    }
  }
  function kanjiVGUrl(kanji) {
    const codePoint = kanji.codePointAt(0) ?? 0;
    return `${KANJIVG_RAW_BASE}/${codePoint.toString(16).padStart(5, "0")}.svg`;
  }
  function parseKanjiVGSvg(svgText, kanji) {
    const doc = parseXmlDocument(svgText, "image/svg+xml");
    const sourceSvg = doc.querySelector("svg");
    if (!sourceSvg) return null;
    const viewBox = sourceSvg.getAttribute("viewBox") || "0 0 109 109";
    const componentPositions = readKanjiVGComponentPositions(sourceSvg, kanji);
    const parsedPaths = readKanjiVGPaths(sourceSvg, viewBox);
    const paths = parsedPaths.map((path) => path.svg);
    if (!paths.length) return null;
    const strokeShapes = parsedPaths.map((path) => path.shape);
    const numbers = readKanjiVGStrokeNumbers(sourceSvg);
    const svg = `<svg class="jpdb-reader-kanjivg-svg" viewBox="${escapeHtml(viewBox)}" role="img" aria-label="Stroke order for ${escapeHtml(kanji)}">
        <g class="jpdb-reader-kanjivg-strokes">${paths.join("")}</g>
        <g class="jpdb-reader-kanjivg-numbers">${numbers.join("")}</g>
    </svg>`;
    return {
      kanji,
      svg,
      strokeCount: paths.length,
      strokeShapes: strokeShapes.every(Boolean) ? strokeShapes : void 0,
      componentPositions
    };
  }
  function readKanjiVGPaths(sourceSvg, viewBox) {
    return Array.from(sourceSvg.querySelectorAll("path")).map((path, index) => readKanjiVGPath(path, index, viewBox)).filter((path) => Boolean(path));
  }
  function readKanjiVGPath(path, index, viewBox) {
    const d = path.getAttribute("d");
    if (!isSafeKanjiVGPathData(d)) return null;
    return {
      svg: renderKanjiVGPath(d, index),
      shape: readKanjiVGStrokeShape(d, viewBox)
    };
  }
  function isSafeKanjiVGPathData(pathData) {
    return Boolean(pathData && KANJIVG_SAFE_PATH_DATA.test(pathData));
  }
  function renderKanjiVGPath(pathData, index) {
    return `<path d="${escapeHtml(pathData)}" style="--stroke-index:${index}" />`;
  }
  function readKanjiVGStrokeNumbers(sourceSvg) {
    return Array.from(sourceSvg.querySelectorAll("text")).map(readKanjiVGStrokeNumber).filter(Boolean);
  }
  function readKanjiVGStrokeNumber(text) {
    const transform = text.getAttribute("transform") ?? "";
    const label = (text.textContent ?? "").trim();
    if (!isSafeKanjiVGStrokeNumber(label, transform)) return "";
    return renderKanjiVGStrokeNumber(transform, label);
  }
  function isSafeKanjiVGStrokeNumber(label, transform) {
    return KANJIVG_STROKE_LABEL.test(label) && KANJIVG_TEXT_TRANSFORM.test(transform);
  }
  function renderKanjiVGStrokeNumber(transform, label) {
    return `<text transform="${escapeHtml(transform)}">${escapeHtml(label)}</text>`;
  }
  function readKanjiVGStrokeShape(pathData, viewBox) {
    const box = parseViewBox(viewBox);
    const points = parseSvgPathPoints(pathData).map((point) => ({
      x: (point.x - box.x) / box.width,
      y: (point.y - box.y) / box.height
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return points.length > 1 ? points : null;
  }
  function parseViewBox(viewBox) {
    const values = viewBox.trim().split(/[\s,]+/).map(Number);
    const [x, y, width, height] = values;
    if (values.length === 4 && values.every(Number.isFinite) && width > 0 && height > 0) {
      return { x, y, width, height };
    }
    return { x: 0, y: 0, width: 109, height: 109 };
  }
  function readKanjiVGComponentPositions(sourceSvg, kanji) {
    const root = Array.from(sourceSvg.querySelectorAll("g")).find((group) => group.getAttribute("kvg:element") === kanji);
    const viewBox = parseViewBox(sourceSvg.getAttribute("viewBox") || "0 0 109 109");
    const context = { kanji, root, viewBox };
    const positions = /* @__PURE__ */ new Map();
    for (const group of sourceSvg.querySelectorAll("g")) {
      for (const entry of readKanjiVGComponentPositionEntries(group, context)) {
        addKanjiVGComponentPosition(positions, entry);
      }
    }
    return Array.from(positions.values());
  }
  function readKanjiVGComponentPositionEntries(group, context) {
    const component = cleanComponent(group.getAttribute("kvg:element") ?? "");
    if (!isNestedKanjiVGComponent(component, context.kanji)) return [];
    const entry = readKanjiVGComponentPositionEntry(group, component, context);
    return entry ? expandKanjiVGOriginalComponent(entry) : [];
  }
  function isNestedKanjiVGComponent(component, kanji) {
    return Boolean(component && component !== kanji);
  }
  function readKanjiVGComponentPositionEntry(group, component, context) {
    const parentGroup = nearestKanjiVGComponentParent(group, context.root);
    const position = readKanjiVGPosition(group, parentGroup, context);
    if (!position) return null;
    const original = cleanComponent(group.getAttribute("kvg:original") ?? "");
    const direct = Boolean(context.root && parentGroup === context.root);
    return {
      component,
      original: original || void 0,
      ...readKanjiVGParent(parentGroup),
      position,
      direct,
      depth: kanjiVGComponentDepth(group, context.root),
      ...readKanjiVGVariant(group),
      ...readKanjiVGComponentGeometry(group, context.viewBox)
    };
  }
  function readKanjiVGPosition(group, parentGroup, context) {
    return cleanComponent(group.getAttribute("kvg:position") ?? geometricKanjiVGPosition(group, parentGroup, context.viewBox) ?? inheritedKanjiVGPosition(group, context.root));
  }
  function readKanjiVGParent(parentGroup) {
    const parent = cleanComponent(parentGroup?.getAttribute("kvg:element") ?? "");
    if (!parent) return {};
    return {
      parent,
      parentOriginal: cleanComponent(parentGroup?.getAttribute("kvg:original") ?? "") || void 0
    };
  }
  function readKanjiVGVariant(group) {
    return group.getAttribute("kvg:variant") === "true" ? { variant: true } : {};
  }
  function readKanjiVGComponentGeometry(group, viewBox) {
    const bounds = normalizedKanjiVGElementBounds(group, viewBox);
    if (!bounds) return {};
    return {
      bounds,
      center: {
        x: roundKanjiVGGeometry(bounds.x + bounds.width / 2),
        y: roundKanjiVGGeometry(bounds.y + bounds.height / 2)
      }
    };
  }
  function expandKanjiVGOriginalComponent(entry) {
    if (!entry.original || entry.original === entry.component) return [entry];
    return [
      entry,
      {
        ...entry,
        component: entry.original,
        original: entry.component
      }
    ];
  }
  function addKanjiVGComponentPosition(positions, entry) {
    const key = kanjiVGComponentPositionKey(entry);
    const existing = positions.get(key);
    if (shouldReplaceKanjiVGComponentPosition(existing, entry)) positions.set(key, entry);
  }
  function kanjiVGComponentPositionKey(entry) {
    return `${entry.component}\0${entry.original ?? ""}\0${entry.parent ?? ""}\0${entry.position}`;
  }
  function shouldReplaceKanjiVGComponentPosition(existing, entry) {
    if (!existing) return true;
    if (!existing.direct && entry.direct) return true;
    return Boolean(existing.variant && !entry.variant);
  }
  function nearestKanjiVGComponentParent(group, root) {
    let parent = group.parentElement;
    while (parent) {
      if (parent === root || cleanComponent(parent.getAttribute("kvg:element") ?? "")) return parent;
      parent = parent.parentElement;
    }
    return void 0;
  }
  function kanjiVGComponentDepth(group, root) {
    let depth = 0;
    let parent = group.parentElement;
    while (parent && parent !== root) {
      if (cleanComponent(parent.getAttribute("kvg:element") ?? "")) depth += 1;
      parent = parent.parentElement;
    }
    return depth + 1;
  }
  function geometricKanjiVGPosition(group, parent, viewBox) {
    const offset = relativeKanjiVGCenterOffset(group, parent, viewBox);
    return offset ? kanjiVGOffsetPosition(offset) : "";
  }
  function relativeKanjiVGCenterOffset(group, parent, viewBox) {
    if (!parent) return null;
    const groupBox = positiveKanjiVGElementBox(group, viewBox);
    const parentBox = positiveKanjiVGElementBox(parent, viewBox);
    if (!groupBox || !parentBox) return null;
    return {
      x: (boxCenterX(groupBox) - boxCenterX(parentBox)) / parentBox.width,
      y: (boxCenterY(groupBox) - boxCenterY(parentBox)) / parentBox.height
    };
  }
  function positiveKanjiVGElementBox(element, viewBox) {
    const box = kanjiVGElementBox(element, viewBox);
    return box && hasPositiveArea(box) ? box : null;
  }
  function hasPositiveArea(box) {
    return box.width > 0 && box.height > 0;
  }
  function boxCenterX(box) {
    return box.x + box.width / 2;
  }
  function boxCenterY(box) {
    return box.y + box.height / 2;
  }
  function kanjiVGOffsetPosition(offset) {
    const axis = dominantKanjiVGOffsetAxis(offset);
    if (axis === "center") return axis;
    return KANJIVG_AXIS_POSITIONS[axis][kanjiVGOffsetDirection(offset[axis])];
  }
  function kanjiVGOffsetDirection(value) {
    return value < 0 ? "negative" : "positive";
  }
  function dominantKanjiVGOffsetAxis(offset) {
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    if (absX > absY * KANJIVG_HORIZONTAL_DOMINANCE && absX > KANJIVG_POSITION_THRESHOLD) return "x";
    if (absY > KANJIVG_POSITION_THRESHOLD) return "y";
    return "center";
  }
  function kanjiVGElementBox(element, viewBox) {
    const points = readKanjiVGElementPoints(element, viewBox);
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function readKanjiVGElementPoints(element, viewBox) {
    return Array.from(element.querySelectorAll("path")).flatMap((path) => readKanjiVGElementPathPoints(path, viewBox));
  }
  function readKanjiVGElementPathPoints(path, viewBox) {
    return parseSvgPathPoints(path.getAttribute("d") ?? "").filter((point) => isKanjiVGGeometryPoint(point, viewBox));
  }
  function isKanjiVGGeometryPoint(point, viewBox) {
    return point.x >= viewBox.x - viewBox.width && point.y >= viewBox.y - viewBox.height;
  }
  function normalizedKanjiVGElementBounds(element, viewBox) {
    const box = positiveKanjiVGElementBox(element, viewBox);
    if (!box) return null;
    const edges = normalizedKanjiVGBoxEdges(box, viewBox);
    return edges ? roundedKanjiVGBounds(edges) : null;
  }
  function normalizedKanjiVGBoxEdges(box, viewBox) {
    const left = clampUnit((box.x - viewBox.x) / viewBox.width);
    const top = clampUnit((box.y - viewBox.y) / viewBox.height);
    const right = clampUnit((box.x + box.width - viewBox.x) / viewBox.width);
    const bottom = clampUnit((box.y + box.height - viewBox.y) / viewBox.height);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom };
  }
  function roundedKanjiVGBounds(edges) {
    return {
      x: roundKanjiVGGeometry(edges.left),
      y: roundKanjiVGGeometry(edges.top),
      width: roundKanjiVGGeometry(edges.right - edges.left),
      height: roundKanjiVGGeometry(edges.bottom - edges.top)
    };
  }
  function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
  }
  function roundKanjiVGGeometry(value) {
    return Number(value.toFixed(4));
  }
  function inheritedKanjiVGPosition(group, root) {
    let parent = group.parentElement;
    while (parent && parent !== root) {
      const position = parent.getAttribute("kvg:position");
      if (position) return position;
      parent = parent.parentElement;
    }
    return "";
  }
  function cleanComponent(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function requestText$1(url) {
    return requestText$4(url, {
      timeoutMs: 8e3,
      failureLabel: "Stroke-order request",
      timeoutLabel: "Stroke-order request timed out."
    });
  }
  function registerYomuCompanion(key, value) {
    writeYomuCompanions({
      ...yomuCompanions(),
      [key]: value
    });
  }
  function yomuCompanions() {
    return readYomuCompanions(globalThis) ?? (typeof window === "undefined" ? void 0 : readYomuCompanions(window)) ?? {};
  }
  function writeYomuCompanions(value) {
    const registry = pageCompartmentValue(value, { cloneFunctions: true, wrapReflectors: true });
    if (writeYomuCompanionsTarget(globalThis, registry)) return;
    if (typeof window !== "undefined" && window !== globalThis) writeYomuCompanionsTarget(window, registry);
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
  function renderJpdbKanjiInfo(info, language, initiallyExpanded = true, sourceStateKey, title = uiText(language, "readingsComponents")) {
    if (!info) return "";
    const facts = [
      [uiText(language, "factKeyword"), info.keyword],
      [uiText(language, "factType"), info.type],
      [uiText(language, "factFrequency"), info.frequency],
      [language === "ja" ? "漢検" : "Kanken", info.kanken],
      ["Heisig", info.heisig],
      [uiText(language, "factOldForms"), info.oldForms.join(", ")]
    ].filter(([, value]) => Boolean(value?.trim()));
    const factSection = renderJpdbKanjiFactSection(facts);
    const readingsSection = renderJpdbKanjiReadings(info);
    const componentSection = renderJpdbKanjiComponents(info, language);
    const mnemonicSection = renderJpdbKanjiMnemonic(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${expandedAttribute(initiallyExpanded)}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${factSection}
                ${readingsSection}
                ${componentSection}
                ${mnemonicSection}
            </div>
        </details>
    `;
  }
  function expandedAttribute(initiallyExpanded) {
    return initiallyExpanded ? "open" : "";
  }
  function renderJpdbKanjiFactSection(facts) {
    if (!facts.length) return "";
    return `<div class="jpdb-reader-kanji-facts">
        ${facts.map(([label, value]) => `<span title="${escapeHtml(`JPDB · ${label}: ${value}`)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(value)}</span></span>`).join("")}
    </div>`;
  }
  function renderJpdbKanjiReadings(info) {
    if (!info.readings.length) return "";
    return `<div class="jpdb-reader-kanji-readings">
        ${info.readings.slice(0, 8).map((reading) => `<span>${escapeHtml(reading.reading)}${reading.share ? ` ${escapeHtml(reading.share)}` : ""}</span>`).join("")}
    </div>`;
  }
  function renderJpdbKanjiComponents(info, language) {
    if (!info.components.length) return "";
    return `<div class="jpdb-reader-component-grid">
        ${info.components.map((component) => `<button class="jpdb-reader-component-card jpdb-reader-component-button" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, "showKanji")}: ${component.kanji}`)}">
            <strong>${escapeHtml(component.kanji)}</strong>
            <span>${escapeHtml(component.keyword)}</span>
        </button>`).join("")}
    </div>`;
  }
  function renderJpdbKanjiMnemonic(info, language) {
    return info.mnemonic ? `<details><summary>${uiText(language, "jpdbMnemonic")}</summary><p>${escapeHtml(info.mnemonic)}</p></details>` : "";
  }
  function renderJpdbKanjiMiningControls(info, language) {
    const actions = visibleJpdbKanjiActions(info);
    if (!actions.length) return "";
    return `
        <div class="jpdb-reader-mining-details jpdb-reader-kanji-mining" role="group" aria-label="${escapeHtml(uiText(language, "deckActions"))}">
            <div class="jpdb-reader-row jpdb-reader-mining-action-row jpdb-reader-kanji-mining-row" style="--cols: ${actions.length}">
                ${actions.map((action) => `<button
                    class="jpdb-reader-btn ${escapeHtml(jpdbKanjiActionClass(action))}"
                    type="button"
                    data-action="jpdb-kanji-action"
                    data-kanji-action-id="${escapeHtml(action.id)}"
                    title="${escapeHtml(jpdbKanjiActionLabel(action, language))}">${escapeHtml(jpdbKanjiActionLabel(action, language))}</button>`).join("")}
            </div>
        </div>
    `;
  }
  function jpdbKanjiActionLabel(action, language) {
    switch (action.role) {
      case "mine":
        return uiText(language, "jpdbKanjiActionMine");
      case "known":
        return uiText(language, "jpdbKanjiActionKnown");
      case "neverforget":
        return uiText(language, "jpdbKanjiActionNeverForget");
      case "forget":
        return uiText(language, "jpdbKanjiActionForget");
      case "blacklist":
        return uiText(language, "jpdbKanjiActionBlacklist");
      case "review":
        return uiText(language, "jpdbKanjiActionReview");
      default:
        return action.label;
    }
  }
  function renderKanjiOriginGraph(graph, language) {
    const model = buildKanjiOriginGraphRenderModel(graph);
    if (!model) return "";
    const { hasSubcomponentEdges, markerId, outboundMarkerId, subcomponentMarkerId } = model;
    const lines = renderOriginGraphLines(model);
    const nodeButtons = renderOriginGraphNodeButtons(model);
    return `
        <div class="jpdb-reader-origin-graph-wrap"${hasSubcomponentEdges ? ' data-origin-has-subcomponents="true"' : ""} aria-label="${uiText(language, "originMapLabel")}">
            <svg class="jpdb-reader-origin-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <marker id="${markerId}" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                    <marker id="${outboundMarkerId}" class="jpdb-reader-origin-edge-arrow-outbound" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                    <marker id="${subcomponentMarkerId}" class="jpdb-reader-origin-edge-arrow-subcomponent" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                </defs>
                ${lines}
            </svg>
            ${renderOriginGraphToggles(model, language)}
            ${nodeButtons}
        </div>
    `;
  }
  function renderOriginGraphToggles(model, language) {
    const toggles = [
      model.hasSubcomponentEdges ? renderOriginGraphToggle(uiText(language, "originShowSubcomponents"), "data-origin-subcomponent-toggle") : "",
      model.hasOutboundEdges ? renderOriginGraphToggle(uiText(language, "originShowOutbound"), "data-origin-outbound-toggle") : ""
    ].filter(Boolean);
    return toggles.length ? `<div class="jpdb-reader-origin-graph-toggles">${toggles.join("")}</div>` : "";
  }
  function renderOriginGraphToggle(label, attribute) {
    return `<label class="jpdb-reader-origin-graph-toggle" title="${escapeHtml(label)}">
        <input type="checkbox" ${attribute} checked>
        <span>${escapeHtml(label)}</span>
    </label>`;
  }
  const SIMPLIFIED_ONLY_COMPONENTS = /* @__PURE__ */ new Set(["讠", "钅", "饣", "纟", "门", "车", "贝", "见", "长", "马", "鸟", "鱼"]);
  const TOP_COMPONENTS = /* @__PURE__ */ new Set(["亠", "宀", "冖", "艹", "⺾", "竹", "⺮", "雨", "穴", "覀", "西", "爫", "𠂉"]);
  const BOTTOM_COMPONENTS = /* @__PURE__ */ new Set(["心", "忄", "灬", "儿", "皿", "貝", "贝", "日", "寸", "廾"]);
  const LEFT_COMPONENTS = /* @__PURE__ */ new Set(["亻", "人", "彳", "氵", "忄", "扌", "木", "言", "訁", "口", "女", "糸", "纟", "土", "王", "犭", "礻", "衤", "月", "火", "禾", "虫", "足", "車", "车"]);
  const RIGHT_COMPONENTS = /* @__PURE__ */ new Set(["阝", "刂", "卩", "頁", "页", "隹", "攵", "殳", "欠", "鳥", "鸟"]);
  const WHOLE_COMPONENTS = /* @__PURE__ */ new Set(["大", "夫", "天", "失", "央", "本", "末", "未"]);
  const KNOWN_COMPONENT_ZONES = [
    ["top", TOP_COMPONENTS],
    ["bottom", BOTTOM_COMPONENTS],
    ["center", WHOLE_COMPONENTS],
    ["left", LEFT_COMPONENTS],
    ["right", RIGHT_COMPONENTS]
  ];
  const COMPONENT_POSITION_ZONES = [
    [/へん|left/, "left"],
    [/つくり|right/, "right"],
    [/かんむり|top|upper/, "top"],
    [/あし|した|bottom|lower/, "bottom"],
    [/かまえ|enclosure|surround/, "center"]
  ];
  const OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES = /* @__PURE__ */ new Map([
    ["夫\0失", "upper"],
    ["夫\0替", "top"],
    ["夫\0難", "left"],
    ["夫\0僕", "lower"]
  ]);
  const INBOUND_COMPONENT_PLACEMENT_OVERRIDES = /* @__PURE__ */ new Map([
    ["友\0ナ", { zone: "upper", x: 33, y: 39 }],
    ["友\0又", { zone: "bottom", x: 58, y: 72 }]
  ]);
  function buildKanjiOriginGraphRenderModel(graph) {
    const base = originGraphBase(graph);
    if (!base) return null;
    const selectedEdges = selectedOriginGraphEdges(base);
    const visible = visibleOriginGraph(base, selectedEdges);
    if (!visible) return null;
    const roles = originGraphNodeRoles(visible.edgeGroups, base.current.id);
    const positioned = forceLayoutOriginGraph(visible.nodes, visible.edgeGroups, base.current.id);
    const markerId = originGraphMarkerId(positioned);
    return {
      current: base.current,
      nodeById: base.nodeById,
      edgeGroups: visible.edgeGroups,
      positioned,
      ...roles,
      markerId,
      outboundMarkerId: `${markerId}-outbound`,
      subcomponentMarkerId: `${markerId}-subcomponent`,
      hasOutboundEdges: visible.edgeGroups.some((edge) => isOriginOutboundEdge(edge, base.current.id)),
      hasSubcomponentEdges: visible.edgeGroups.some(isOriginSubcomponentEdge)
    };
  }
  function originGraphBase(graph) {
    const nodes = originGraphRenderableNodes(graph);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = originGraphRenderableEdges(graph, nodeById);
    if (shouldSkipOriginGraph(nodes, edges)) return null;
    return {
      nodes,
      nodeById,
      edges,
      current: originGraphCurrentNode(nodes)
    };
  }
  function originGraphRenderableNodes(graph) {
    return graph?.nodes.filter((node) => !node.id.startsWith("rtk:")) ?? [];
  }
  function originGraphRenderableEdges(graph, nodeById) {
    const nodeIds = new Set(nodeById.keys());
    return graph?.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)) ?? [];
  }
  function shouldSkipOriginGraph(nodes, edges) {
    return nodes.length <= 1 || !edges.length;
  }
  function originGraphCurrentNode(nodes) {
    return nodes.find((node) => node.kind === "current") ?? nodes[0];
  }
  function selectedOriginGraphEdges(base) {
    const groupedEdges = groupOriginEdges(base.edges);
    const primaryEdges = selectOriginEdgeGroups(
      groupedEdges.filter((edge) => !isOriginOutboundEdge(edge, base.current.id) && !isOriginSubcomponentEdge(edge)),
      base.nodeById
    );
    return [
      ...primaryEdges,
      ...selectOriginSubcomponentEdgeGroups(groupedEdges, base.nodeById),
      ...selectOriginOutboundEdgeGroups(groupedEdges, base.nodeById, base.current.id)
    ];
  }
  function visibleOriginGraph(base, selectedEdges) {
    if (!selectedEdges.length) {
      return null;
    }
    const connectedIds = connectedOriginNodeIds(base.current.id, selectedEdges);
    const graphNodes = base.nodes.filter((node) => connectedIds.has(node.id) && !isNoisyOriginNode(node));
    const visibleNodes = chooseOriginGraphNodes(graphNodes, selectedEdges, base.current.id);
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const edgeGroups = selectedEdges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    if (visibleNodes.length <= 1 || !edgeGroups.length) {
      return null;
    }
    return { nodes: visibleNodes, edgeGroups };
  }
  function connectedOriginNodeIds(currentId, edges) {
    const ids = /* @__PURE__ */ new Set([currentId]);
    edges.forEach((edge) => {
      ids.add(edge.from);
      ids.add(edge.to);
    });
    return ids;
  }
  function originGraphNodeRoles(edgeGroups, currentId) {
    const primaryIds = /* @__PURE__ */ new Set([currentId]);
    const outboundIds = /* @__PURE__ */ new Set();
    const subcomponentIds = /* @__PURE__ */ new Set();
    edgeGroups.forEach((edge) => addOriginGraphNodeRole(edge, currentId, primaryIds, outboundIds, subcomponentIds));
    return { primaryIds, outboundIds, subcomponentIds };
  }
  function addOriginGraphNodeRole(edge, currentId, primaryIds, outboundIds, subcomponentIds) {
    if (isOriginOutboundEdge(edge, currentId)) {
      outboundIds.add(edge.to);
      return;
    }
    if (isOriginSubcomponentEdge(edge)) {
      subcomponentIds.add(edge.from);
      if (edge.to !== currentId) subcomponentIds.add(edge.to);
      return;
    }
    primaryIds.add(edge.from);
    primaryIds.add(edge.to);
  }
  function originGraphMarkerId(positioned) {
    return `jpdb-reader-origin-target-${hashOriginGraphId(positioned.map((item) => item.node.id).join("|"))}`;
  }
  function renderOriginGraphLines(model) {
    const coords = new Map(model.positioned.map((item) => [item.node.id, item]));
    return model.edgeGroups.map((edge) => renderOriginGraphEdgeGroup(edge, coords, model)).join("");
  }
  function renderOriginGraphEdgeGroup(edge, coords, model) {
    const from = coords.get(edge.from);
    const to = coords.get(edge.to);
    if (!from || !to) return "";
    const targetZone = originEdgeTargetZone(edge, model.current.id, model.nodeById);
    const edgePath = clippedOriginEdgePath(from, to, targetZone);
    const label = edge.labels.join(" / ");
    const outbound = isOriginOutboundEdge(edge, model.current.id);
    const subcomponent = isOriginSubcomponentEdge(edge);
    const outboundAttrs = outbound ? ' data-origin-outbound="true"' : "";
    const subcomponentAttrs = subcomponent ? ' data-origin-subcomponent="true"' : "";
    const markerId = outbound ? model.outboundMarkerId : subcomponent ? model.subcomponentMarkerId : model.markerId;
    return `<g class="jpdb-reader-origin-edge-group${outbound ? " outbound" : ""}${subcomponent ? " subcomponent" : ""}" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-label="${escapeHtml(label)}" data-target-zone="${targetZone}"${outboundAttrs}${subcomponentAttrs}>
        <path class="jpdb-reader-origin-edge" d="${edgePath.d}" marker-end="url(#${markerId})"><title>${escapeHtml(label)}</title></path>
    </g>`;
  }
  function renderOriginGraphNodeButtons(model) {
    return model.positioned.map((node) => renderOriginGraphNodeButton(node, model)).join("");
  }
  function renderOriginGraphNodeButton(positioned, model) {
    const { node, x, y, rx, ry } = positioned;
    const style = `left:${formatGraphNumber(x)}%;top:${formatGraphNumber(y)}%`;
    const outboundOnly = node.id !== model.current.id && model.outboundIds.has(node.id) && !model.primaryIds.has(node.id);
    const subcomponentOnly = node.id !== model.current.id && model.subcomponentIds.has(node.id) && !model.primaryIds.has(node.id) && !model.outboundIds.has(node.id);
    const attrs = `data-graph-node="${escapeHtml(node.id)}" data-label-length="${originGraphLabelLengthAttribute(node.label)}" data-x="${formatGraphNumber(x)}" data-y="${formatGraphNumber(y)}" data-rx="${formatGraphNumber(rx)}" data-ry="${formatGraphNumber(ry)}"${outboundOnly ? ' data-origin-outbound="true"' : ""}${subcomponentOnly ? ' data-origin-subcomponent="true"' : ""} style="${style}"`;
    if (node.kind === "related") return renderRelatedOriginGraphNode(node, attrs);
    return renderKanjiOriginGraphNode(node, attrs);
  }
  function originGraphLabelLengthAttribute(label) {
    const length = Array.from(label).length;
    return length > 2 ? "many" : String(length || 1);
  }
  function renderRelatedOriginGraphNode(node, attrs) {
    return `<span class="jpdb-reader-origin-graph-node ${node.kind}" ${attrs} title="${escapeHtml(node.detail)}">${escapeHtml(node.label)}</span>`;
  }
  function renderKanjiOriginGraphNode(node, attrs) {
    const title = [node.detail, node.source].filter(Boolean).join(" · ");
    return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" ${attrs} title="${escapeHtml(title)}">${escapeHtml(node.label)}</button>`;
  }
  function chooseOriginGraphNodes(nodes, edges, currentId) {
    const current = nodes.find((node) => node.id === currentId) ?? nodes[0];
    const degree = /* @__PURE__ */ new Map();
    edges.forEach((edge) => {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    });
    const ranked = nodes.filter((node) => node.id !== current.id).sort((a, b) => {
      const priority = originNodePriority(a.id, edges, current.id) - originNodePriority(b.id, edges, current.id);
      if (priority) return priority;
      const degreeDelta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
      if (degreeDelta) return degreeDelta;
      return a.label.localeCompare(b.label, "ja");
    });
    return [current, ...ranked.slice(0, 18)];
  }
  function originNodePriority(id, edges, currentId) {
    if (edges.some((edge) => edge.from === id && edge.to === currentId)) return 0;
    if (edges.some((edge) => edge.from === currentId && edge.to === id)) return 1;
    if (edges.some((edge) => edge.from === id || edge.to === id)) return 2;
    return 3;
  }
  function selectOriginEdgeGroups(groups, nodeById) {
    const useful = groups.filter((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      return from && to && !isNoisyOriginNode(from) && !isNoisyOriginNode(to);
    });
    const structural = useful.filter((edge) => edge.labels.some((label) => label === "radical" || label === "structural part"));
    if (structural.length) return structural;
    const jpdb = useful.filter((edge) => edge.labels.includes("JPDB component"));
    if (jpdb.length) return jpdb;
    return useful.filter((edge) => !edge.labels.includes("memory cue"));
  }
  function selectOriginOutboundEdgeGroups(groups, nodeById, currentId) {
    return groups.filter((edge) => {
      if (!isOriginOutboundEdge(edge, currentId)) return false;
      const to = nodeById.get(edge.to);
      return to && !isNoisyOriginNode(to);
    });
  }
  function selectOriginSubcomponentEdgeGroups(groups, nodeById) {
    return groups.filter((edge) => {
      if (!isOriginSubcomponentEdge(edge)) return false;
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      return from && to && !isNoisyOriginNode(from) && !isNoisyOriginNode(to);
    });
  }
  function isOriginOutboundEdge(edge, currentId) {
    return edge.from === currentId && edge.to !== currentId;
  }
  function isOriginSubcomponentEdge(edge) {
    return edge.labels.includes("subcomponent");
  }
  function originEdgeTargetZone(edge, currentId, nodeById) {
    if (edge.to === currentId) {
      const source = nodeById.get(edge.from);
      return source ? inferInboundComponentZone(source, currentId) : "auto";
    }
    if (edge.from === currentId) {
      const target = nodeById.get(edge.to);
      return target ? inferOutboundComponentZone(currentId, target) : "auto";
    }
    if (isOriginSubcomponentEdge(edge)) {
      const source = nodeById.get(edge.from);
      return source ? inferInboundComponentZone(source, edge.to) : "auto";
    }
    return "auto";
  }
  function isNoisyOriginNode(node) {
    return SIMPLIFIED_ONLY_COMPONENTS.has(node.id) || SIMPLIFIED_ONLY_COMPONENTS.has(node.label);
  }
  function groupOriginEdges(edges) {
    const groups = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      const key = `${edge.from}\0${edge.to}`;
      const group = groups.get(key) ?? { from: edge.from, to: edge.to, labels: [] };
      if (edge.label && !group.labels.includes(edge.label)) group.labels.push(edge.label);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }
  function forceLayoutOriginGraph(nodes, edges, currentId) {
    const anchors = originGraphAnchors(nodes, edges, currentId);
    const states = createOriginNodeStates(nodes, anchors);
    const byId = new Map(states.map((state) => [state.node.id, state]));
    for (let iteration = 0; iteration < 240; iteration++) {
      const alpha = Math.pow(1 - iteration / 240, 1.45);
      applyOriginNodeRepulsion(states, alpha);
      applyOriginEdgePulls(byId, edges, currentId, alpha);
      applyOriginEdgeNodeAvoidance(states, byId, edges, alpha);
      applyOriginAnchorPulls(states, currentId, alpha);
      integrateOriginNodeStates(states, currentId);
    }
    return positionOriginNodes(states);
  }
  function createOriginNodeStates(nodes, anchors) {
    return nodes.map((node, index) => {
      const { rx, ry } = originNodeRadii(node);
      const anchor = anchors.get(node.id) ?? { x: 50, y: 50 };
      const jitter = index === 0 ? 0 : (index % 2 === 0 ? 1 : -1) * (1.2 + index % 3 * 0.45);
      return {
        node,
        x: anchor.x + jitter,
        y: anchor.y - jitter * 0.6,
        rx,
        ry,
        vx: 0,
        vy: 0,
        anchorX: anchor.x,
        anchorY: anchor.y,
        anchorPinned: anchor.pinned === true,
        collision: Math.max(rx * 1.35, ry) + 5.2
      };
    });
  }
  function applyOriginNodeRepulsion(states, alpha) {
    for (let aIndex = 0; aIndex < states.length; aIndex++) {
      for (let bIndex = aIndex + 1; bIndex < states.length; bIndex++) {
        repelOriginNodePair(states[aIndex], states[bIndex], aIndex, bIndex, alpha);
      }
    }
  }
  function repelOriginNodePair(a, b, aIndex, bIndex, alpha) {
    const delta = originNodeDelta(a, b, aIndex, bIndex);
    const distanceSquared = Math.max(8, delta.dx * delta.dx + delta.dy * delta.dy);
    const distance = Math.sqrt(distanceSquared);
    const repel = Math.min(0.68, 17 * alpha / distanceSquared);
    a.vx -= delta.dx * repel;
    a.vy -= delta.dy * repel;
    b.vx += delta.dx * repel;
    b.vy += delta.dy * repel;
    const minimumDistance = a.collision + b.collision;
    if (distance >= minimumDistance) return;
    const push = (minimumDistance - distance) / distance * 0.14 * alpha;
    a.vx -= delta.dx * push;
    a.vy -= delta.dy * push;
    b.vx += delta.dx * push;
    b.vy += delta.dy * push;
  }
  function originNodeDelta(a, b, aIndex, bIndex) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) + Math.abs(dy) < 0.01 ? { dx: (bIndex - aIndex) * 0.13, dy: (aIndex + bIndex) * 0.11 } : { dx, dy };
  }
  function applyOriginEdgePulls(byId, edges, currentId, alpha) {
    for (const edge of edges) {
      const source = byId.get(edge.from);
      const target = byId.get(edge.to);
      if (source && target) pullOriginEdge(source, target, edge, currentId, alpha);
    }
  }
  function pullOriginEdge(source, target, edge, currentId, alpha) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDistance = isOriginSubcomponentEdge(edge) ? 21 : source.node.id === currentId || target.node.id === currentId ? 36 : 24;
    const pull = (distance - targetDistance) / distance * 0.06 * alpha;
    source.vx += dx * pull;
    source.vy += dy * pull;
    target.vx -= dx * pull;
    target.vy -= dy * pull;
  }
  function applyOriginEdgeNodeAvoidance(states, byId, edges, alpha) {
    for (const edge of edges) {
      const source = byId.get(edge.from);
      const target = byId.get(edge.to);
      if (!source || !target) continue;
      for (const state of states) {
        if (state === source || state === target) continue;
        pushOriginNodeAwayFromEdge(state, source, target, alpha);
      }
    }
  }
  function pushOriginNodeAwayFromEdge(node, source, target, alpha) {
    const closest = closestOriginEdgePoint(node.x, node.y, source.x, source.y, target.x, target.y);
    const dx = node.x - closest.x;
    const dy = node.y - closest.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1e-3;
    const clearance = Math.max(node.rx, node.ry) * 0.72 + 2.2;
    if (distance >= clearance) return;
    const fallback = originEdgeNormal(source, target);
    const ux = distance > 0.01 ? dx / distance : fallback.x;
    const uy = distance > 0.01 ? dy / distance : fallback.y;
    const push = (clearance - distance) * 0.045 * alpha;
    node.vx += ux * push;
    node.vy += uy * push;
  }
  function closestOriginEdgePoint(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-3) return { x: x1, y: y1 };
    const t = clampGraphValue(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
    return { x: x1 + dx * t, y: y1 + dy * t };
  }
  function originEdgeNormal(source, target) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: -dy / length, y: dx / length };
  }
  function applyOriginAnchorPulls(states, currentId, alpha) {
    for (const state of states) {
      const anchorStrength = state.node.id === currentId ? 0.32 : state.anchorPinned ? 0.38 : 0.16;
      state.vx += (state.anchorX - state.x) * anchorStrength * alpha;
      state.vy += (state.anchorY - state.y) * anchorStrength * alpha;
    }
  }
  function integrateOriginNodeStates(states, currentId) {
    for (const state of states) {
      integrateOriginNodeState(state, currentId);
      state.x = clampGraphValue(state.x, 9 + state.rx, 91 - state.rx);
      state.y = clampGraphValue(state.y, 7 + state.ry, 93 - state.ry);
    }
  }
  function integrateOriginNodeState(state, currentId) {
    if (state.node.id === currentId) {
      state.x += (state.anchorX - state.x) * 0.4;
      state.y += (state.anchorY - state.y) * 0.4;
      state.vx = 0;
      state.vy = 0;
      return;
    }
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= 0.58;
    state.vy *= 0.58;
  }
  function positionOriginNodes(states) {
    return states.map(({ node, x, y, rx, ry }) => ({
      node,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      rx,
      ry
    }));
  }
  function originGraphAnchors(nodes, edges, currentId) {
    const anchors = /* @__PURE__ */ new Map();
    const current = nodes.find((node) => node.id === currentId);
    if (current) anchors.set(current.id, { x: 50, y: 50 });
    const currentReference = current ? originNodeGeometryReference(current, { x: 50, y: 50 }) : void 0;
    const incoming = nodes.filter((node) => node.id !== currentId && edges.some((edge) => edge.from === node.id && edge.to === currentId));
    const outgoing = nodes.filter((node) => node.id !== currentId && edges.some((edge) => edge.from === currentId && edge.to === node.id));
    const attached = new Set([...incoming, ...outgoing].map((node) => node.id));
    const others = nodes.filter((node) => node.id !== currentId && !attached.has(node.id));
    if (outgoing.length) {
      spreadInboundComponents(incoming, currentId, currentReference).forEach(({ node, x, y, pinned }) => anchors.set(node.id, { x, y, pinned }));
      spreadOutboundComponents(outgoing, currentId).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    } else {
      spreadInboundComponents(incoming, currentId, currentReference).forEach(({ node, x, y, pinned }) => anchors.set(node.id, { x, y, pinned }));
    }
    spreadNestedComponents(nodes, edges, anchors);
    const anchored = new Set(anchors.keys());
    const remainingOthers = others.filter((node) => !anchored.has(node.id));
    remainingOthers.forEach((node, index) => {
      const t = (index + 1) / (remainingOthers.length + 1);
      anchors.set(node.id, { x: 26 + t * 48, y: 78 + index % 2 * 3 });
    });
    return anchors;
  }
  function spreadNestedComponents(nodes, edges, anchors) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const nestedByParent = nestedEdgesByParent(edges, nodeById);
    for (let pass = 0; pass < nodes.length; pass++) {
      let placed = false;
      nestedByParent.forEach((parentEdges, parentId) => {
        const parentAnchor = anchors.get(parentId);
        if (!parentAnchor) return;
        const sorted = [...parentEdges].sort((a, b) => {
          const aNode = nodeById.get(a.from);
          const bNode = nodeById.get(b.from);
          return componentZoneSort(aNode ? inferInboundComponentZone(aNode, parentId) : "center") - componentZoneSort(bNode ? inferInboundComponentZone(bNode, parentId) : "center") || (aNode?.label ?? a.from).localeCompare(bNode?.label ?? b.from, "ja");
        });
        sorted.forEach((edge, index) => {
          if (anchors.has(edge.from)) return;
          const node = nodeById.get(edge.from);
          if (!node) return;
          const parentNode = nodeById.get(parentId);
          const geometryAnchor = originNodeGeometryAnchor(node, parentNode ? originNodeGeometryReference(parentNode, parentAnchor) : void 0);
          if (geometryAnchor) {
            anchors.set(edge.from, { ...geometryAnchor, pinned: true });
            placed = true;
            return;
          }
          const zone = inferInboundComponentZone(node, parentId);
          anchors.set(edge.from, { ...nestedZoneAnchor(parentAnchor, zone, index, sorted.length), pinned: true });
          placed = true;
        });
      });
      if (!placed) return;
    }
  }
  function nestedEdgesByParent(edges, nodeById) {
    const result = /* @__PURE__ */ new Map();
    edges.filter(isOriginSubcomponentEdge).forEach((edge) => {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
      const list = result.get(edge.to) ?? [];
      list.push(edge);
      result.set(edge.to, list);
    });
    return result;
  }
  function nestedZoneAnchor(parent, zone, index, total) {
    const xStep = 18;
    const yStep = 20;
    const side = nestedExpansionSide(parent.x);
    const offset = (index - (total - 1) / 2) * 14;
    const base = nestedZoneAnchorBase(parent, zone, side, xStep, yStep);
    const withOffset = zone === "top" || zone === "upper" || zone === "bottom" || zone === "lower" ? { x: base.x + offset, y: base.y } : { x: base.x, y: base.y + offset };
    return {
      x: clampGraphValue(withOffset.x, 11, 89),
      y: clampGraphValue(withOffset.y, 12, 88)
    };
  }
  function nestedExpansionSide(parentX) {
    if (parentX <= 34) return 1;
    if (parentX >= 66) return -1;
    return parentX < 50 ? -1 : 1;
  }
  function nestedZoneAnchorBase(parent, zone, side, xStep, yStep) {
    switch (zone) {
      case "top":
        return { x: parent.x, y: parent.y - yStep };
      case "upper":
        return { x: parent.x + side * (xStep * 0.45), y: parent.y - yStep * 0.72 };
      case "left":
        return { x: parent.x - xStep, y: parent.y };
      case "right":
        return { x: parent.x + xStep, y: parent.y };
      case "lower":
        return { x: parent.x + side * (xStep * 0.45), y: parent.y + yStep * 0.72 };
      case "bottom":
        return { x: parent.x, y: parent.y + yStep };
      case "center":
        return { x: parent.x + side * xStep, y: parent.y };
    }
  }
  function spreadInboundComponents(nodes, currentId = "", currentReference) {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferInboundComponentZone(a, currentId)) - componentZoneSort(inferInboundComponentZone(b, currentId)) || a.label.localeCompare(b.label, "ja"));
    const usedByZone = /* @__PURE__ */ new Map();
    return ordered.map((node, index) => {
      const geometryAnchor = originNodeGeometryAnchor(node, currentReference);
      if (geometryAnchor) return { node, ...geometryAnchor, pinned: true };
      const override = inboundPlacementOverride(currentId, node);
      if (override) return { node, x: override.x, y: override.y, pinned: true };
      const zone = inferInboundComponentZone(node, currentId);
      const used = usedByZone.get(zone) ?? 0;
      usedByZone.set(zone, used + 1);
      const anchor = inboundZoneAnchor(zone, used, ordered.filter((item) => inferInboundComponentZone(item, currentId) === zone).length);
      const fallback = spreadConstellation(ordered)[index] ?? { x: 30, y: 50 };
      return { node, x: anchor?.x ?? fallback.x, y: anchor?.y ?? fallback.y, pinned: zone !== "center" };
    });
  }
  function spreadOutboundComponents(nodes, currentId) {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferOutboundComponentZone(currentId, a)) - componentZoneSort(inferOutboundComponentZone(currentId, b)) || a.label.localeCompare(b.label, "ja"));
    const usedByZone = /* @__PURE__ */ new Map();
    return ordered.map((node) => {
      const zone = inferOutboundComponentZone(currentId, node);
      const used = usedByZone.get(zone) ?? 0;
      usedByZone.set(zone, used + 1);
      const anchor = outboundZoneAnchor(zone, used, ordered.filter((item) => inferOutboundComponentZone(currentId, item) === zone).length);
      return { node, x: anchor.x, y: anchor.y };
    });
  }
  function originNodeGeometryAnchor(node, reference) {
    const geometry = node.geometry;
    if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) return void 0;
    const x = 10 + clampGraphValue(geometry.x, 0, 1) * 80;
    const y = 10 + clampGraphValue(geometry.y, 0, 1) * 80;
    const anchor = {
      x: clampGraphValue(x, 10, 90),
      y: clampGraphValue(y, 10, 90)
    };
    return reference ? separateOriginGeometryAnchor(node, anchor, reference) : anchor;
  }
  function separateOriginGeometryAnchor(node, anchor, reference) {
    const radii = originNodeRadii(node);
    const dx = anchor.x - reference.x;
    const dy = anchor.y - reference.y;
    const distance = Math.hypot(dx, dy);
    const direction = distance > 0.01 ? { x: dx / distance, y: dy / distance } : originComponentZoneDirection(inferInboundComponentZone(node));
    const requiredDistance = originEllipseRadius(reference.rx, reference.ry, direction) + originEllipseRadius(radii.rx, radii.ry, direction) + 4.5;
    if (distance >= requiredDistance) return anchor;
    return {
      x: clampGraphValue(reference.x + direction.x * requiredDistance, 9 + radii.rx, 91 - radii.rx),
      y: clampGraphValue(reference.y + direction.y * requiredDistance, 7 + radii.ry, 93 - radii.ry)
    };
  }
  function originNodeGeometryReference(node, point) {
    const radii = originNodeRadii(node);
    return { ...point, rx: radii.rx, ry: radii.ry };
  }
  function originEllipseRadius(rx, ry, direction) {
    const denominator = Math.sqrt(direction.x * direction.x / (rx * rx) + direction.y * direction.y / (ry * ry));
    return denominator > 0 ? 1 / denominator : Math.max(rx, ry);
  }
  function originComponentZoneDirection(zone) {
    switch (zone) {
      case "top":
        return { x: 0, y: -1 };
      case "upper":
        return { x: 0.447, y: -0.894 };
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
      case "lower":
        return { x: 0.447, y: 0.894 };
      case "bottom":
        return { x: 0, y: 1 };
      case "center":
        return { x: -1, y: 0 };
    }
  }
  function inferInboundComponentZone(node, currentId = "") {
    const override = inboundPlacementOverride(currentId, node);
    if (override) return override.zone;
    const position = (node.position ?? "").toLowerCase();
    return zoneFromComponentPosition(position) ?? zoneFromKnownComponent(node) ?? "center";
  }
  function inboundPlacementOverride(currentId, node) {
    return INBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\0${node.id}`) ?? INBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\0${node.label}`);
  }
  function zoneFromComponentPosition(position) {
    return COMPONENT_POSITION_ZONES.find(([pattern]) => pattern.test(position))?.[1] ?? null;
  }
  function zoneFromKnownComponent(node) {
    return KNOWN_COMPONENT_ZONES.find(([, components2]) => components2.has(node.id) || components2.has(node.label))?.[0] ?? null;
  }
  function inferOutboundComponentZone(currentId, node) {
    return OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\0${node.id}`) ?? "center";
  }
  function componentZoneSort(zone) {
    return { top: 0, upper: 1, left: 2, center: 3, right: 4, lower: 5, bottom: 6 }[zone];
  }
  function inboundZoneAnchor(zone, index, total) {
    return zoneAnchor(INBOUND_ZONE_ANCHORS, zone, index, total, 10);
  }
  function outboundZoneAnchor(zone, index, total) {
    if (zone === "center" && total > 2) {
      const offset = (index - (total - 1) / 2) * 19;
      return {
        x: index % 2 === 0 ? 72 : 86,
        y: 50 + offset
      };
    }
    return zoneAnchor(OUTBOUND_ZONE_ANCHORS, zone, index, total, total > 2 ? 20 : 14);
  }
  const INBOUND_ZONE_ANCHORS = {
    top: { x: 50, y: 16, offsetAxis: "x" },
    upper: { x: 58, y: 35, offsetAxis: "x" },
    left: { x: 17, y: 50, offsetAxis: "y" },
    right: { x: 83, y: 50, offsetAxis: "y" },
    lower: { x: 58, y: 65, offsetAxis: "x" },
    bottom: { x: 50, y: 84, offsetAxis: "x" },
    center: { x: 24, y: 50, offsetAxis: "y" }
  };
  const OUTBOUND_ZONE_ANCHORS = {
    top: { x: 72, y: 23, offsetAxis: "x" },
    upper: { x: 79, y: 34, offsetAxis: "x" },
    left: { x: 84, y: 47, offsetAxis: "y" },
    right: { x: 72, y: 47, offsetAxis: "y" },
    lower: { x: 79, y: 66, offsetAxis: "x" },
    bottom: { x: 72, y: 77, offsetAxis: "x" },
    center: { x: 82, y: 50, offsetAxis: "y" }
  };
  function zoneAnchor(anchors, zone, index, total, step) {
    const spec = anchors[zone] ?? anchors.center;
    const offset = (index - (total - 1) / 2) * step;
    return spec.offsetAxis === "x" ? { x: spec.x + offset, y: spec.y } : { x: spec.x, y: spec.y + offset };
  }
  function spreadConstellation(nodes) {
    const presets = [
      [],
      [{ x: 26, y: 50 }],
      [{ x: 28, y: 50 }, { x: 72, y: 50 }],
      [{ x: 50, y: 24 }, { x: 27, y: 65 }, { x: 73, y: 65 }],
      [{ x: 28, y: 34 }, { x: 72, y: 34 }, { x: 28, y: 66 }, { x: 72, y: 66 }],
      [{ x: 50, y: 22 }, { x: 25, y: 40 }, { x: 75, y: 40 }, { x: 32, y: 74 }, { x: 68, y: 74 }]
    ];
    const preset = presets[nodes.length];
    if (preset) return nodes.map((node, index) => ({ node, ...preset[index] }));
    return nodes.map((node, index) => {
      const angle = (-90 + index * (360 / nodes.length)) * Math.PI / 180;
      return {
        node,
        x: 50 + Math.cos(angle) * 30,
        y: 50 + Math.sin(angle) * 28
      };
    });
  }
  function originNodeRadii(node) {
    const length = Array.from(node.label).length;
    if (node.kind === "current") return { rx: 7.6, ry: 12.9 };
    if (node.kind === "related") return { rx: Math.min(13.6, 8.3 + length * 1.2), ry: 14.2 };
    return { rx: Math.min(11.5, 8.4 + Math.max(0, length - 1) * 1.15), ry: 14.2 };
  }
  function clippedOriginEdgePath(from, to, targetZone) {
    return graphEdgePath(from, to, targetZone);
  }
  function clampGraphValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function formatGraphNumber(value) {
    return Number(value.toFixed(2)).toString();
  }
  function hashOriginGraphId(value) {
    let hash = 0;
    for (const character of value) {
      hash = (hash << 5) - hash + character.charCodeAt(0) | 0;
    }
    return Math.abs(hash).toString(36);
  }
  function renderKanjiOrigins(facts, graph, sourceInfo, settings, language, initiallyExpanded = settings.dictionarySourcesInitiallyExpanded, sourceStateKey, excludeFactLabels, title = uiText(language, "originStructure")) {
    if (!hasKanjiOriginContent(facts, graph, sourceInfo)) {
      return "";
    }
    const map = sourceInfo?.kanjiMap;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-origins" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
            ${renderKanjiOriginDetail(map, settings, language)}
            ${settings.kanjiOriginGraphEnabled ? renderKanjiOriginGraph(graph, language) : ""}
            ${renderKanjiFactPills(facts, language, excludeFactLabels)}
        </details>
    `;
  }
  function hasKanjiOriginContent(facts, graph, sourceInfo) {
    return Boolean(facts.length || graph && graph.nodes.length > 1 || sourceInfo?.kanjiMap);
  }
  function renderKanjiFactPills(facts, language, excludeFactLabels) {
    if (!facts.length) return "";
    const excludedFacts = excludeFactLabels ? normalizedFactLabelSet(excludeFactLabels, language) : null;
    const visibleFacts = excludedFacts ? facts.filter((fact) => !excludedFacts.has(normalizedFactLabel(fact.label, language))) : facts;
    if (!visibleFacts.length) return "";
    return `<div class="jpdb-reader-kanji-facts">
        ${visibleFacts.map((fact) => {
      const label = kanjiFactLabel(fact.label, language);
      const title = [fact.source, `${label}: ${fact.value}`].filter(Boolean).join(" · ");
      return `<span title="${escapeHtml(title)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(fact.value)}</span></span>`;
    }).join("")}
    </div>`;
  }
  function normalizedFactLabelSet(labels, language) {
    return new Set(Array.from(labels, (label) => normalizedFactLabel(label, language)));
  }
  function normalizedFactLabel(label, language) {
    const normalized = label.trim().toLocaleLowerCase();
    const knownLabels = /* @__PURE__ */ new Map([
      ["meaning", "meaning"],
      [uiText(language, "factMeaning").toLocaleLowerCase(), "meaning"],
      ["type", "type"],
      [uiText(language, "factType").toLocaleLowerCase(), "type"],
      ["frequency", "frequency"],
      [uiText(language, "factFrequency").toLocaleLowerCase(), "frequency"],
      ["grade", "grade"],
      [uiText(language, "factGrade").toLocaleLowerCase(), "grade"],
      ["strokes", "strokes"],
      [uiText(language, "strokes").toLocaleLowerCase(), "strokes"],
      ["jlpt", "jlpt"],
      ["kanken", "kanken"],
      ["wk", "wk"],
      ["rtk", "rtk"],
      ["klc", "klc"],
      ["tmw", "tmw"]
    ]);
    return knownLabels.get(normalized) ?? normalized;
  }
  function kanjiFactLabel(label, language) {
    switch (label) {
      case "Meaning":
        return uiText(language, "factMeaning");
      case "Type":
        return uiText(language, "factType");
      case "Frequency":
        return uiText(language, "factFrequency");
      case "Grade":
        return uiText(language, "factGrade");
      case "Strokes":
        return uiText(language, "strokes");
      case "Radical":
        return uiText(language, "radical");
      default:
        return label;
    }
  }
  function renderKanjiOriginDetail(map, settings, language) {
    if (!map) return "";
    const radicalCard = renderKanjiRadicalCard(map, settings, language);
    return radicalCard ? `<div class="jpdb-reader-origin-detail">${radicalCard}</div>` : '<div class="jpdb-reader-origin-detail"></div>';
  }
  function renderKanjiRadicalCard(map, settings, language) {
    const radical = map.radical;
    if (!radical && !map.hint) return "";
    return `<div class="jpdb-reader-radical-card">
        ${renderKanjiRadicalGlyph(radical, language)}
        <div>
            ${renderKanjiRadicalSummary(radical, language)}
            ${map.hint ? `<span>${escapeHtml(map.hint)}</span>` : ""}
            ${renderKanjiRadicalFrames(radicalFrameUrls(radical, settings))}
        </div>
    </div>`;
  }
  function renderKanjiRadicalGlyph(radical, language) {
    return radical ? `<strong class="jpdb-reader-radical-glyph">${escapeHtml(radical.symbol || uiText(language, "radical"))}</strong>` : "";
  }
  function renderKanjiRadicalSummary(radical, language) {
    if (!radical) return "";
    const values = [radical.reading, radical.meaning, radical.strokes ? `${radical.strokes} ${uiText(language, "strokes")}` : ""];
    return `<strong>${escapeHtml(values.filter(Boolean).join(" · "))}</strong>`;
  }
  function radicalFrameUrls(radical, settings) {
    return settings.kanjiOriginRadicalImagesEnabled && radical ? [radical.image, ...radical.animation].filter(Boolean).slice(0, 4) : [];
  }
  function renderKanjiRadicalFrames(radicalFrames) {
    if (!radicalFrames.length) return "";
    return `<div class="jpdb-reader-radical-frames">
        ${radicalFrames.map((url, index) => `<img alt="" loading="lazy" data-radical-frame="${index}" data-radical-frame-url="${escapeHtml(url)}">`).join("")}
    </div>`;
  }
  function renderKanjiPractice(info, kanji, language, initiallyExpanded = true, sourceStateKey, title = uiText(language, "strokePractice")) {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, "practiceDrawing")} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, "strokes")}` : uiText(language, "textTrace")}</span>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>${uiText(language, "hideTrace")}</button>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-clear>${uiText(language, "clear")}</button>
            </div>
            <div class="jpdb-reader-newtab-doodle-result" data-newtab-doodle-result></div>
        </details>
    `;
  }
  const RTK_BASE_URL = "https://hrussellzfac023.github.io/rtk";
  const RTK_SEARCH_INDEX_URL = `${RTK_BASE_URL}/assets/js/search.js`;
  const KANJI_RE = /[\u3400-\u9fff]/u;
  const log = Logger.scope("RTK");
  class RtkClient {
    cache = /* @__PURE__ */ new Map();
    keywordIndex;
    // fallow-ignore-next-line unused-class-member
    lookup(kanji) {
      if (!KANJI_RE.test(kanji)) return Promise.resolve(null);
      const key = Array.from(kanji)[0] ?? kanji;
      let promise = this.cache.get(key);
      if (!promise) {
        promise = this.fetchInfo(key);
        this.cache.set(key, promise);
      }
      return promise;
    }
    async fetchInfo(kanji) {
      const html = await requestText(`${RTK_BASE_URL}/${encodeURIComponent(kanji)}/index.html`).catch((error) => {
        log.warn("RTK request failed", { kanji }, error);
        return "";
      });
      if (!html) return null;
      const info = parseRtkHtml(html, kanji);
      return info ? this.withElementGlyphs(info) : null;
    }
    async withElementGlyphs(info) {
      const index = await this.lookupKeywordIndex().catch(() => {
        return /* @__PURE__ */ new Map();
      });
      const elementGlyphs = {};
      splitRtkElements(info.elements).filter((keyword) => rtkElementKey(keyword) !== rtkElementKey(info.keyword)).forEach((keyword) => {
        const key = rtkElementKey(keyword);
        const fallback = rtkElementFallbackGlyph(keyword);
        const indexedKanji = index.get(key) ?? index.get(compactRtkElementKey(key));
        const glyph = fallback ?? (indexedKanji ? { glyph: indexedKanji, kanji: indexedKanji } : void 0);
        if (glyph) elementGlyphs[key] = glyph;
      });
      return Object.keys(elementGlyphs).length ? { ...info, elementGlyphs } : info;
    }
    lookupKeywordIndex() {
      if (!this.keywordIndex) {
        this.keywordIndex = requestText(RTK_SEARCH_INDEX_URL).then(parseRtkSearchIndex).catch((error) => {
          this.keywordIndex = void 0;
          throw error;
        });
      }
      return this.keywordIndex;
    }
  }
  function parseRtkHtml(html, kanji) {
    const doc = parseHtmlDocument(html);
    const keywordElement = doc.querySelector("h2 code");
    const keyword = rtkKeywordText(keywordElement);
    if (!keyword) return null;
    const { onYomi, kunYomi } = rtkReadings(doc);
    const elements = textAfterHeading(doc, "Elements:");
    const heisigStory = textAfterHeading(doc, "Heisig story:");
    const heisigComment = textAfterHeading(doc, "Heisig comment:");
    const koohiiStories = paragraphsAfterHeading(doc, "Koohii stories:").slice(0, 3);
    return {
      kanji,
      keyword,
      frameNumber: rtkFrameNumber(keywordElement),
      onYomi,
      kunYomi,
      elements,
      componentKanji: [...new Set(Array.from(elements).filter((character) => KANJI_RE.test(character) && character !== kanji))],
      heisigStory,
      heisigComment,
      koohiiStories
    };
  }
  function rtkKeywordText(keywordElement) {
    return keywordElement?.textContent?.trim() ?? "";
  }
  function rtkReadings(doc) {
    const yomiText = doc.querySelector("h3")?.textContent ?? "";
    return {
      onYomi: yomiText.match(/On-Yomi:\s*([^—]+)/)?.[1]?.trim() ?? "",
      kunYomi: yomiText.match(/Kun-Yomi:\s*(.+)/)?.[1]?.trim() ?? ""
    };
  }
  function rtkFrameNumber(keywordElement) {
    return keywordElement?.getAttribute("title")?.trim() ?? "";
  }
  function parseRtkSearchIndex(script) {
    const searchEntries = rtkSearchIndexEntries(script);
    const entries = /* @__PURE__ */ new Map();
    const collisions = /* @__PURE__ */ new Set();
    const canonicalKeys = /* @__PURE__ */ new Set();
    searchEntries.forEach((entry) => {
      rtkIndexKeys(entry.keyword).forEach((key) => {
        canonicalKeys.add(key);
        addRtkKeywordIndexEntry(entries, collisions, key, entry.kanji);
      });
    });
    addRtkElementAliasEntries(entries, collisions, canonicalKeys, searchEntries);
    return entries;
  }
  function rtkSearchIndexEntries(script) {
    const entries = [];
    const entryRe = /\{[\s\S]*?\}/g;
    let match;
    while (match = entryRe.exec(script)) {
      const entry = rtkSearchIndexEntry(match[0]);
      if (entry) entries.push(entry);
    }
    return entries;
  }
  function rtkSearchIndexEntry(rawEntry) {
    const kanji = firstKanjiCharacter(rtkSearchIndexField(rawEntry, "kanji"));
    const keyword = rtkSearchIndexField(rawEntry, "keyword");
    if (!kanji || !keyword) return null;
    return {
      kanji,
      keyword,
      elements: rtkSearchIndexField(rawEntry, "elements")
    };
  }
  function rtkSearchIndexField(rawEntry, field) {
    const match = rawEntry.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    if (!match?.[1]) return "";
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1];
    }
  }
  function firstKanjiCharacter(value) {
    return Array.from(value ?? "").find(isKanjiCharacter) ?? "";
  }
  function isKanjiCharacter(character) {
    return KANJI_RE.test(character);
  }
  function addRtkKeywordIndexEntry(entries, collisions, key, kanji) {
    if (!key || collisions.has(key)) return;
    const existing = entries.get(key);
    if (existing && existing !== kanji) {
      entries.delete(key);
      collisions.add(key);
      return;
    }
    entries.set(key, kanji);
  }
  function addRtkElementAliasEntries(entries, collisions, canonicalKeys, searchEntries) {
    const introduced = /* @__PURE__ */ new Map();
    const introducedCollisions = /* @__PURE__ */ new Set();
    searchEntries.forEach((entry) => {
      rtkIndexKeys(entry.keyword).forEach((key) => addRtkKeywordIndexEntry(introduced, introducedCollisions, key, entry.kanji));
      const elements = splitRtkElements(entry.elements);
      addLeadingRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, entry, elements);
      addGroupedRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, elements);
    });
  }
  function addLeadingRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, entry, elements) {
    const keywordKeys = rtkIndexKeys(entry.keyword);
    const keywordIndex = elements.findIndex((element) => rtkIndexKeys(element).some((key) => keywordKeys.includes(key)));
    if (keywordIndex <= 0) return;
    elements.slice(0, keywordIndex).forEach((element) => {
      addRtkElementAliasEntry(entries, collisions, canonicalKeys, introduced, introducedCollisions, element, entry.kanji);
    });
  }
  function addGroupedRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, elements) {
    let owner = "";
    elements.forEach((element) => {
      const introducedOwner = rtkIntroducedElementOwner(introduced, element);
      if (introducedOwner) {
        owner = introducedOwner;
        return;
      }
      if (owner) addRtkElementAliasEntry(entries, collisions, canonicalKeys, introduced, introducedCollisions, element, owner);
    });
  }
  function addRtkElementAliasEntry(entries, collisions, canonicalKeys, introduced, introducedCollisions, element, kanji) {
    if (rtkElementFallbackGlyph(element)) return;
    rtkIndexKeys(element).filter((key) => !canonicalKeys.has(key)).forEach((key) => {
      addRtkKeywordIndexEntry(entries, collisions, key, kanji);
      addRtkKeywordIndexEntry(introduced, introducedCollisions, key, kanji);
    });
  }
  function rtkIntroducedElementOwner(introduced, element) {
    for (const key of rtkIndexKeys(element)) {
      const owner = introduced.get(key);
      if (owner) return owner;
    }
    return "";
  }
  function rtkIndexKeys(value) {
    return [...new Set([rtkElementKey(value), compactRtkElementKey(value)].filter(Boolean))];
  }
  function compactRtkElementKey(value) {
    return rtkElementKey(value).replace(/\s+/g, "");
  }
  function textAfterHeading(doc, label) {
    const heading = Array.from(doc.querySelectorAll("h2")).find((element) => element.textContent?.includes(label));
    const next = heading?.nextElementSibling;
    return next?.tagName === "P" ? cleanText(next.textContent ?? "") : "";
  }
  function paragraphsAfterHeading(doc, label) {
    const heading = Array.from(doc.querySelectorAll("h2")).find((element) => element.textContent?.includes(label));
    const paragraphs = [];
    let next = heading?.nextElementSibling;
    while (next?.tagName === "P") {
      const text = cleanText(next.textContent ?? "");
      if (text) paragraphs.push(text);
      next = next.nextElementSibling;
    }
    return paragraphs;
  }
  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function requestText(url) {
    return requestText$4(url, {
      timeoutMs: 8e3,
      failureLabel: "RTK request",
      timeoutLabel: "RTK request timed out."
    });
  }
  registerYomuCompanion("kanjiStudy", {
    KanjiOriginClient,
    KanjiVGClient,
    RtkClient,
    JpdbKanjiClient,
    renderKanjiOriginGraph,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiPractice,
    renderKanjiOrigins,
    buildRtkComponentSummaries,
    renderKanjiKeywordLine,
    renderRtkInfo,
    installOriginGraphInteractions,
    buildKanjiFacts,
    buildKanjiOriginGraph
  });
})();
