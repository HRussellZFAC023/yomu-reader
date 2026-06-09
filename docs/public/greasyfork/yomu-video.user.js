(function() {
  "use strict";
  var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
  const CARD_STATES = /* @__PURE__ */ new Set([
    "new",
    "learning",
    "young",
    "mature",
    "known",
    "mastered",
    "due",
    "failed",
    "locked",
    "never-forget",
    "blacklisted",
    "suspended",
    "in-deck",
    "not-in-deck",
    "redundant",
    "frequent",
    "unparsed"
  ]);
  const CARD_STATE_ALIASES = {
    never_forget: "never-forget",
    neverforget: "never-forget",
    "never forget": "never-forget",
    not_in_deck: "not-in-deck",
    notindeck: "not-in-deck",
    "not in deck": "not-in-deck",
    in_deck: "in-deck",
    indeck: "in-deck",
    "in deck": "in-deck",
    blacklist: "blacklisted",
    blacklisted: "blacklisted",
    ignored: "blacklisted",
    unknown: "new"
  };
  function normalizeCardState(value) {
    const keys = normalizedCardStateKeys(value);
    if (!keys) return null;
    const aliased = aliasedCardState(keys.trimmed, keys.dashed, keys.compact);
    if (aliased) return aliased;
    return knownCardState(keys.dashed);
  }
  function normalizedCardStateKeys(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    return {
      trimmed,
      dashed: trimmed.replace(/[_\s]+/g, "-"),
      compact: trimmed.replace(/[_\s-]+/g, "")
    };
  }
  function aliasedCardState(...keys) {
    return keys.map((key2) => CARD_STATE_ALIASES[key2]).find(Boolean);
  }
  function knownCardState(value) {
    if (CARD_STATES.has(value)) return value;
    return null;
  }
  function normalizeCardStates(value, fallback = "not-in-deck") {
    const states = uniqueNormalizedCardStates(Array.isArray(value) ? value : [value]);
    return states.length ? states : [fallback];
  }
  function uniqueNormalizedCardStates(rawStates) {
    const states = [];
    for (const rawState of rawStates) {
      appendNormalizedCardState(states, rawState);
    }
    return states;
  }
  function appendNormalizedCardState(states, rawState) {
    const state = normalizeCardState(rawState);
    if (!state || states.includes(state)) return;
    states.push(state);
  }
  function primaryCardState(value) {
    return normalizeCardStates(value)[0] ?? "not-in-deck";
  }
  const CORE_COLOR_TOKENS = {
    white: "#ffffff"
  };
  const BRAND_COLOR_TOKENS = {
    accent: "#5ea780",
    consoleAccent: "#247a58"
  };
  const LOGGER_COLOR_TOKENS = {
    debug: "#6b7280",
    warn: "#a15c00",
    error: "#b91c1c"
  };
  const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const READER_ROOT_SELECTOR = "[data-jpdb-reader-root]";
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
  function parseXmlDocument(source, mimeType = "text/xml") {
    try {
      return new DOMParser().parseFromString(trustedHtml(source), mimeType);
    } catch {
      return document.implementation.createDocument(null, "");
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
      return factory.createPolicy?.("yomu-reader", { createHTML: (html) => html }) ?? null;
    } catch {
      return null;
    }
  }
  const READABLE_IGNORED_TAGS = /* @__PURE__ */ new Set(["RT", "RP", "SCRIPT", "STYLE"]);
  function unwrapReaderWords(root = document, options = {}) {
    const words = Array.from(root.querySelectorAll(".jpdb-reader-word")).filter((word) => options.includeReaderRoot || !word.closest(READER_ROOT_SELECTOR)).filter((word) => !options.excludeSelector || !word.matches(options.excludeSelector));
    const parents = /* @__PURE__ */ new Set();
    for (const word of words) {
      const parent = word.parentNode;
      if (!parent) continue;
      parents.add(parent);
      word.replaceWith(document.createTextNode(readerWordSurfaceText(word)));
    }
    parents.forEach((parent) => parent.normalize());
    return words.length;
  }
  function readerWordSurfaceText(element) {
    let text = "";
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? "";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const child = node;
      if (isSurfaceIgnoredElement(child)) return;
      text += readerWordSurfaceText(child);
    });
    return text;
  }
  function isSurfaceIgnoredElement(element) {
    return READABLE_IGNORED_TAGS.has(element.tagName) || element.matches('[data-jpdb-reader-surface-ignore="true"],.jpdb-reader-furi,.jpdb-ocr-furi');
  }
  const MISSING = { missing: true };
  function gmStorageGetSync(key2, fallback) {
    const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
    if (getValue) {
      const read = gmStorageSyncRead(key2, getValue);
      if (read.kind === "found") return read.value;
    }
    return localStorageGet(key2, fallback);
  }
  function gmStorageSyncRead(key2, getValue) {
    try {
      const value = getValue(key2, MISSING);
      if (isPromiseLike(value)) return { kind: "fallback" };
      if (value !== MISSING) return { kind: "found", value };
      return migratedLocalStorageSyncValue(key2);
    } catch (error) {
      debugStorageError("GM storage sync read failed", key2, error);
      return { kind: "fallback" };
    }
  }
  function migratedLocalStorageSyncValue(key2) {
    const migrated = localStorageGet(key2, MISSING);
    if (migrated === MISSING) return { kind: "fallback" };
    void gmStorageSet(key2, migrated);
    return { kind: "found", value: migrated };
  }
  async function gmStorageSet(key2, value) {
    const setValue = asyncGmSetValue();
    if (setValue) {
      await setValue(key2, value);
      return;
    }
    localStorageSet(key2, value);
  }
  function gmStorageSetSync(key2, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key2, value);
        if (!isPromiseLike(result)) return;
      } catch (error) {
        debugStorageError("GM storage sync write failed", key2, error);
      }
    }
    localStorageSet(key2, value);
  }
  function gmStorageDeleteSync(key2) {
    if (typeof GM_deleteValue === "function") {
      try {
        const result = GM_deleteValue(key2);
        if (isPromiseLike(result)) result.catch((error) => debugStorageError("GM storage async delete failed", key2, error));
      } catch (error) {
        debugStorageError("GM storage sync delete failed", key2, error);
      }
    }
    removeLocalStorageKey(key2);
    removeSessionStorageKey(key2);
  }
  function localStorageGet(key2, fallback) {
    try {
      const value = localStorage.getItem(key2);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  function localStorageSet(key2, value) {
    try {
      localStorage.setItem(key2, JSON.stringify(value));
    } catch {
    }
  }
  function removeLocalStorageKey(key2) {
    try {
      localStorage.removeItem(key2);
    } catch {
    }
  }
  function removeSessionStorageKey(key2) {
    try {
      sessionStorage.removeItem(key2);
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
  function debugStorageError(message, key2, error) {
    if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key: key2, error });
  }
  const JITEN_API_KEY_PREFIX = "ak_";
  function effectiveJpdbApiKey(settings) {
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? "" : apiKey;
  }
  function effectiveJitenApiKey(settings) {
    const explicit = settings.jitenApiKey.trim();
    if (explicit) return explicit;
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? apiKey : "";
  }
  function hasJpdbApiCredential(settings) {
    return Boolean(effectiveJpdbApiKey(settings));
  }
  function hasJitenApiCredential(settings) {
    return Boolean(effectiveJitenApiKey(settings));
  }
  function isJitenApiCredential(value) {
    return value.trim().startsWith(JITEN_API_KEY_PREFIX);
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
    warnOnce(key2, message, ...args) {
      this.parent.warnOnce(`${this.scopeName}:${key2}`, this.scopeName, message, args);
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
    warnOnce(key2, scope, message, args) {
      if (this.onceKeys.has(key2)) return;
      this.onceKeys.add(key2);
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
    return Object.fromEntries(Object.entries(record).map(([key2, value]) => [
      key2,
      shouldRedactEntry(key2, value) ? REDACTED : sanitizeFlatValue(value)
    ]));
  }
  function sanitizeFlatValue(value) {
    if (typeof value === "string") return redactString(value);
    if (value instanceof Error) return { name: value.name, message: value.message };
    return value;
  }
  function shouldRedactEntry(key2, value) {
    if (!SECRET_KEY_PATTERN.test(key2)) return false;
    if (typeof value === "number" && /tokens?/i.test(key2)) return false;
    return true;
  }
  function redactString(value) {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`).replace(/(["']?(?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
  }
  if (typeof window !== "undefined") {
    window.__YOMU_LOGGER__ = Logger;
    window.YomuLogger = Logger;
  }
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, JPDB mining, dictionaries, OCR, subtitles, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const OPEN_SUBTITLE_TRACKS_EVENT = "yomu-open-subtitle-tracks";
  const initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
  const initialWindowAddEventListener = initialWindowMethod("addEventListener");
  const initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
  function createWindowEvent(type, init = {}) {
    const documentEvent = createDocumentEvent(type, init);
    if (documentEvent) return documentEvent;
    const EventConstructor = eventConstructor(window, "Event") ?? eventConstructor(globalThis, "Event");
    if (EventConstructor) {
      try {
        return new EventConstructor(type, init);
      } catch {
      }
    }
    throw new Error(`Unable to create window event: ${type}`);
  }
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
      return detail;
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
  function initialWindowMethod(key2) {
    if (typeof window === "undefined") return void 0;
    return readMethod(window, key2);
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
  function eventConstructor(source, key2) {
    const value = readProperty(source, key2);
    return typeof value === "function" ? value : void 0;
  }
  function createDocumentEvent(type, init) {
    if (typeof document === "undefined" || typeof document.createEvent !== "function") return void 0;
    try {
      const event = document.createEvent("Event");
      event.initEvent(type, Boolean(init.bubbles), Boolean(init.cancelable));
      return event;
    } catch {
      return void 0;
    }
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
  function eventTargetPrototypeMethods(target, key2) {
    const methods = [];
    const add = (method) => {
      if (method && !methods.includes(method)) methods.push(method);
    };
    let prototype = Object.getPrototypeOf(target);
    while (prototype) {
      add(readOwnMethod(prototype, key2));
      prototype = Object.getPrototypeOf(prototype);
    }
    const WindowEventTarget = readProperty(window, "EventTarget");
    add(readMethod(WindowEventTarget?.prototype, key2));
    if (typeof EventTarget !== "undefined") add(readMethod(EventTarget.prototype, key2));
    return methods;
  }
  function readMethod(source, key2) {
    const value = readProperty(source, key2);
    return typeof value === "function" ? value : void 0;
  }
  function readOwnMethod(source, key2) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    if (!Object.prototype.hasOwnProperty.call(source, key2)) return void 0;
    return readMethod(source, key2);
  }
  function readProperty(source, key2) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key2];
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
  function restoreWindowProperty(key2, descriptor) {
    try {
      const target = window.wrappedJSObject || window;
      Object.defineProperty(target, key2, normalizedPropertyDescriptor(descriptor));
    } catch {
    }
  }
  function safeWindowPropertyDescriptor(key2) {
    try {
      const target = window.wrappedJSObject || window;
      return Object.getOwnPropertyDescriptor(target, key2);
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
    JISHO_LOOKUP_LINK,
    COPY_LOOKUP_LINK
  ];
  function matchesShortcut(event, shortcut = "") {
    if (!shortcut) return false;
    const parts = parseShortcut(shortcut);
    const key2 = parts.key?.toLowerCase();
    if (!key2) return false;
    const eventKey = normalizeEventKey(event.key).toLowerCase();
    return eventKey === key2 && shortcutModifiersMatch(event, parts.modifiers);
  }
  function shortcutModifiersMatch(event, modifiers) {
    return event.altKey === modifiers.has("alt") && event.ctrlKey === modifiers.has("ctrl") && event.metaKey === modifiers.has("meta") && event.shiftKey === modifiers.has("shift");
  }
  function parseShortcut(shortcut) {
    const parts = shortcut.split("+").map((part) => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map((part) => part.toLowerCase()));
    const key2 = [...parts].reverse().find((part) => !isModifierKey(part)) ?? "";
    return { key: key2.toLowerCase(), modifiers };
  }
  function normalizeShortcutPart(part) {
    const value = typeof part === "string" ? part.trim() : "";
    if (!value) return "";
    const lower = value.toLowerCase();
    const alias = shortcutPartAlias(lower);
    if (alias) return alias;
    if (value.length === 1) return value.toUpperCase();
    return value[0]?.toUpperCase() + value.slice(1);
  }
  function shortcutPartAlias(lower) {
    return SHORTCUT_PART_ALIASES.get(lower) ?? "";
  }
  const SHORTCUT_PART_ALIASES = /* @__PURE__ */ new Map([
    ["control", "Ctrl"],
    ["cmd", "Meta"],
    ["command", "Meta"],
    ["win", "Meta"],
    ["windows", "Meta"],
    ["option", "Alt"],
    ["esc", "Escape"],
    ["spacebar", "Space"],
    [" ", "Space"]
  ]);
  function normalizeEventKey(key2) {
    if (key2 === " ") return "Space";
    return normalizeShortcutPart(key2);
  }
  function isModifierKey(key2) {
    return key2 === "Alt" || key2 === "Ctrl" || key2 === "Meta" || key2 === "Shift";
  }
  Logger.scope("Settings");
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
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
  const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status"]);
  ({
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
  });
  function hasPersonalizedFuriganaSource(settings) {
    return Boolean(hasJpdbApiCredential(settings) || hasJitenApiCredential(settings) || settings.ankiEnabled);
  }
  function effectiveFuriganaMode(settings) {
    if (!settings.showFurigana || settings.furiganaMode === "off") return "off";
    if (isExplicitFuriganaMode(settings.furiganaMode)) return settings.furiganaMode;
    return hasPersonalizedFuriganaSource(settings) ? "known-status" : "difficult-kanji";
  }
  function isExplicitFuriganaMode(value) {
    return EXPLICIT_FURIGANA_MODES.has(value);
  }
  function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  function accentToRgba(color, alpha) {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
  }
  const KANJI_RE = /[\u3400-\u9fff]/u;
  const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
  const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
  const EASY_FURIGANA_KANJI = new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  const PITCH_CLASSES = /* @__PURE__ */ new Set(["heiban", "atamadaka", "nakadaka", "odaka", "kifuku"]);
  const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
  const MINING_INSIGHT_UNKNOWN_STATES = /* @__PURE__ */ new Set(["new", "not-in-deck", "in-deck"]);
  const MINING_INSIGHT_MIN_CARD_COUNT = 3;
  const KNOWN_STATUS_FURIGANA_HIDDEN_STATES = /* @__PURE__ */ new Set([
    "young",
    "mature",
    "known",
    "mastered",
    "due",
    "never-forget",
    "redundant"
  ]);
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
  function renderTokensToHtml(text, tokens, settings) {
    let html = "";
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    const miningInsightKeys = miningInsightTokenKeys(safeTokens);
    for (const token of safeTokens) {
      if (token.start > offset) html += escapeHtml(text.slice(offset, token.start));
      html += renderTokenHtml(text.slice(token.start, token.end), token, settings, miningInsightKeys);
      offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
  }
  function nonOverlappingTokens(tokens, textLength) {
    const safe = [];
    let offset = 0;
    for (const token of tokens) {
      if (!isSafeTokenSpan(token, offset, textLength)) continue;
      safe.push(token);
      offset = token.end;
    }
    return safe;
  }
  function isSafeTokenSpan(token, offset, textLength) {
    return token.start >= offset && token.start >= 0 && token.end > token.start && token.end <= textLength;
  }
  function miningInsightTokenKeys(tokens) {
    const sentences = /* @__PURE__ */ new Map();
    for (const token of tokens) {
      const sentence = miningInsightSentenceKey(token);
      if (!sentence || isParticleCard(token.card)) continue;
      const cardKey = readerCardKey(token.card);
      const sentenceCards = sentences.get(sentence) ?? /* @__PURE__ */ new Map();
      if (!sentences.has(sentence)) sentences.set(sentence, sentenceCards);
      if (!sentenceCards.has(cardKey)) {
        sentenceCards.set(cardKey, { unknown: isMiningUnknownCard(token.card) });
      }
    }
    const keys = /* @__PURE__ */ new Set();
    sentences.forEach((cards, sentence) => {
      if (cards.size < MINING_INSIGHT_MIN_CARD_COUNT) return;
      const unknownCards = [...cards.entries()].filter(([, card]) => card.unknown);
      if (unknownCards.length !== 1) return;
      keys.add(miningInsightKey(sentence, unknownCards[0][0]));
    });
    return keys;
  }
  function isMiningUnknownCard(card) {
    return MINING_INSIGHT_UNKNOWN_STATES.has(primaryCardState(card.cardState));
  }
  function miningInsightTokenKey(token) {
    return miningInsightKey(miningInsightSentenceKey(token), readerCardKey(token.card));
  }
  function miningInsightKey(sentence, cardKey) {
    return `${sentence}\0${cardKey}`;
  }
  function miningInsightSentenceKey(token) {
    return (token.sentence ?? "").replace(/\s+/g, " ").trim();
  }
  function readerCardKey(card) {
    return `${readerCardSource(card)}:${readerCardId(card)}/${readerReadingIndex(card)}`;
  }
  function readerCardSource(card) {
    return card.source ?? (card.reviewSource === "jiten-api" ? "jiten" : "jpdb");
  }
  function readerCardId(card) {
    return readerCardSource(card) === "jiten" ? card.jitenWordId ?? card.vid : card.vid;
  }
  function readerReadingIndex(card) {
    return readerCardSource(card) === "jiten" ? card.jitenReadingIndex ?? card.sid : card.sid;
  }
  function renderTokenHtml(surface, token, settings, miningInsightKeys) {
    const state = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
    const classes = [
      readerWordClassName(state, token),
      hasRuby ? "jpdb-reader-has-furi" : "",
      hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
    ].filter(Boolean).join(" ");
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : "";
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : "";
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : "";
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange} data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? "")}"${miningInsight}${expression}${reading} tabindex="-1">${content}</span>`;
  }
  function shouldRenderRuby(surface, token, settings, allowRuby = true, preserveTokenRubies = false) {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token);
  }
  function furiganaModeAllowsRuby(mode, surface, token) {
    if (mode === "off") return false;
    if (mode === "known-status") return !knownStatusHidesTokenFurigana(token);
    return mode !== "difficult-kanji" || hasDifficultKanji(surface);
  }
  function knownStatusHidesTokenFurigana(token) {
    return KNOWN_STATUS_FURIGANA_HIDDEN_STATES.has(primaryCardState(token.card.cardState));
  }
  function hasDifficultKanji(surface) {
    for (const char of surface) {
      if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
  }
  function readerWordClassName(state, token) {
    const classes = ["jpdb-reader-word"];
    if (isParticleCard(token.card)) {
      classes.push("jpdb-reader-particle");
      return classes.join(" ");
    }
    if (hasKnownCardState(token.card)) {
      classes.push(`jpdb-${state}`);
      const source = readerCardSource(token.card);
      if (source !== "jpdb") classes.push(`${source}-${state}`);
    }
    classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
    return classes.join(" ");
  }
  function hasKnownCardState(card) {
    return Array.isArray(card.cardState) && card.cardState.length > 0;
  }
  function isParticleCard(card) {
    return card.partOfSpeech.includes("prt") || PARTICLE_SURFACE_RE.test(card.spelling.trim());
  }
  function safePitchClass(value) {
    return PITCH_CLASSES.has(value) ? value : "unknown";
  }
  function renderRuby(surface, token, kanjiNavigation, preserveTokenRubies = false) {
    let html = "";
    let localOffset = 0;
    for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
      const start = ruby.start - token.start;
      const end = ruby.end - token.start;
      html += renderKanjiNavigationText(surface.slice(localOffset, start));
      html += `<ruby><span class="jpdb-reader-ruby-base">${renderKanjiNavigationText(surface.slice(start, end))}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
      localOffset = end;
    }
    html += renderKanjiNavigationText(surface.slice(localOffset));
    return html;
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
    return Boolean(first && second && first === second && KANA_RE.test(first));
  }
  function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
    const sources = sourceTokenRubies(surface, token);
    if (preserveTokenRubies) {
      return sources.filter((ruby) => {
        const range = localRubyRange(surface, token, ruby);
        return range !== null && KANJI_RE.test(surface.slice(range.start, range.end));
      });
    }
    return sources.flatMap((ruby) => kanjiOnlyRubySegments(surface, token, ruby));
  }
  function sourceTokenRubies(surface, token) {
    if (token.rubies.length) return token.rubies;
    const reading = token.card.reading.trim();
    if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !KANA_RE.test(reading)) return [];
    return [{ text: reading, start: token.start, end: token.end, length: token.length }];
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
    if (!KANA_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];
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
    return [{
      text: trimmed.reading,
      start: trimmed.offset,
      end: trimmed.offset + trimmed.surface.length
    }];
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
      const isKana = index < base.length && KANA_CHAR_RE.test(base[index]);
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
  function normalizeOcrRenderedText(root) {
    normalizeOcrRuby(root);
    normalizeOcrPlainText(root);
  }
  function normalizeOcrRuby(root) {
    root.querySelectorAll("ruby").forEach((ruby) => {
      const replacement = document.createElement("span");
      replacement.className = "jpdb-ocr-ruby";
      const furi = document.createElement("span");
      furi.className = "jpdb-ocr-furi";
      furi.dataset.jpdbReaderSurfaceIgnore = "true";
      furi.setAttribute("aria-hidden", "true");
      const base = document.createElement("span");
      base.className = "jpdb-ocr-ruby-base";
      for (const child of Array.from(ruby.childNodes)) {
        if (child instanceof HTMLElement && child.tagName === "RT") {
          furi.textContent += child.textContent ?? "";
        } else if (!(child instanceof HTMLElement && child.tagName === "RP")) {
          base.append(child.cloneNode(true));
        }
      }
      replacement.append(furi, base);
      ruby.replaceWith(replacement);
    });
  }
  function normalizeOcrPlainText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains("jpdb-ocr-furi") || parent.classList.contains("jpdb-ocr-ruby-base")) return NodeFilter.FILTER_REJECT;
        return parent === root || parent.classList.contains("jpdb-reader-word") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text) textNodes.push(node);
    }
    for (const textNode of textNodes) {
      const replacement = document.createElement("span");
      replacement.className = "jpdb-ocr-plain";
      replacement.textContent = textNode.textContent ?? "";
      textNode.replaceWith(replacement);
    }
  }
  function isAppleTouchBrowser() {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
  }
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
      return Array.from(url.searchParams.keys()).some((key2) => SENSITIVE_REQUEST_KEY_RE.test(key2));
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
    new Headers(headers).forEach((value, key2) => {
      if (!excluded.has(key2.toLowerCase())) sanitized[key2] = value;
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
  function safeReadProperty(source, key2) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key2];
    } catch {
      return void 0;
    }
  }
  function safeReadString(source, key2) {
    const value = safeReadProperty(source, key2);
    return typeof value === "string" ? value : void 0;
  }
  var key = `__monkeyWindow-` + new URL(_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("yomu-video.user.js", document.baseURI).href || location.href).origin;
  var monkeyWindow = document[key] ?? window;
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
    add(monkeyWindow);
    add(globalThis);
    if (typeof window !== "undefined") add(window);
    return sources;
  }
  function mountedMonkeyWindows() {
    if (typeof document === "undefined") return [];
    return Object.getOwnPropertyNames(document).filter((key2) => key2.startsWith("__monkeyWindow-")).map((key2) => readSourceProperty(document, key2)).filter(isRequestSource);
  }
  function isRequestSource(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function");
  }
  function readSourceProperty(source, key2) {
    if (!isRequestSource(source)) return void 0;
    try {
      return source[key2];
    } catch {
      return void 0;
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
        return await requestViaUserscript$1(url, options, userscriptRequest);
      }
    }
    if (userscriptRequest) {
      try {
        return await requestViaUserscript$1(url, options, userscriptRequest);
      } catch (error) {
        if (!shouldRetryWithFetch(error)) throw error;
      }
    }
    return requestViaFetch(url, options);
  }
  function requestViaUserscript$1(url, options, userscriptRequest) {
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
  async function requestJson$1(url, options = {}) {
    const value = await requestHttp(url, { ...options, responseType: "json" });
    return value;
  }
  const COPY = {
    en: {
      settingsTitle: `${APP_NAME} Settings`,
      welcomeLabel: `${APP_NAME} welcome`,
      onboardingEyebrow: "Japanese, wherever it appears",
      onboardingCopy: "Make Japanese text, subtitles, and images tappable while you read.",
      onboardingLanguage: "Settings language",
      onboardingImmersionOptions: "Immersion defaults",
      onboardingAddApiKey: "Add API key",
      onboardingAddLocalDictionaries: "Add local dictionaries",
      onboardingUseWithoutApiKey: "Use without API key",
      closeOnboarding: "Close welcome",
      featureText: "Text",
      featureTextBody: "Hover or tap scanned Japanese.",
      featureImages: "Images",
      featureImagesBody: "Read image text near the viewport.",
      featureVideo: "Video",
      featureVideoBody: "Make subtitle words tappable.",
      featureControl: "Control",
      featureControlBody: "Tune features, shortcuts, and color.",
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
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Paste one JPDB or Jiten API key. Jiten keys start with ak_.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      jpdbApiKeyConfigured: "JPDB key set.",
      jpdbApiKeyMissing: "No JPDB key.",
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
      fontPresetYomuDefault: "Yomu default",
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
      newTabEnabled: "Enable Yomu study page",
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
      newTabApiVocabulary: "API vocabulary only",
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
      newTabUrl: "Study address",
      newTabOfflineHelp: "Saves recent reviews for offline study.",
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
      settingsPuckHelp: "Keeps Settings reachable on phones and tablets.",
      showFurigana: "Enable furigana annotations",
      furiganaMode: "Furigana",
      furiganaDifficultKanji: "Difficult kanji only",
      furiganaHideKnown: "Hide known words",
      furiganaAllParsed: "All parsed words",
      showPitchAccent: "Show pitch accent",
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
      toggleImageReading: "Toggle image reading",
      toggleYoutubeImmersion: "Toggle YouTube filter",
      readImagesNow: "Read images now",
      ocrEnabledToast: "Image reading enabled.",
      ocrHiddenToast: "Image reading hidden.",
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
onboardingImmersionOptions	没入設定の初期値
onboardingAddApiKey	APIキーを追加
onboardingAddLocalDictionaries	ローカル辞書を追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	スキャン後、日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	近くの画像テキストを検出します。
featureVideo	動画
featureVideoBody	字幕がある場合、字幕内の単語もタップできます。
featureControl	調整
featureControlBody	機能、ショートカット、色を調整できます。
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
dictionaries	辞書
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
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	JPDBまたはJiten APIキーを1つ貼り付けます。Jitenキーはak_で始まります。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbApiKeyMissing	JPDBキーなし。
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
fontPresetYomuDefault	よむ既定
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
newTabEnabled	よむの学習ページを有効にする
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
newTabApiVocabulary	API語彙のみ
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
newTabUrl	学習ページのアドレス
newTabOfflineHelp	最近の復習をオフライン用に保存します。
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
settingsPuckHelp	スマホやタブレットで設定ボタンを残します。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
furiganaDifficultKanji	難しい漢字のみ
furiganaHideKnown	既知語を非表示
furiganaAllParsed	解析済みの全単語
showPitchAccent	ピッチアクセントを表示
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
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕を採掘するとき動画を一時停止
subtitleControlsMode	字幕コントロール
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
toggleYoutubeImmersion	YouTubeフィルターを切り替え
readImagesNow	今すぐ画像を読む
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
  function uiText(language, key2) {
    return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key2] ?? JA_COPY[key2] ?? "未翻訳" : COPY.en[key2];
  }
  function waitForIdle(timeoutMs = 75, fallbackDelayMs = 0) {
    if (timeoutMs <= 0 && fallbackDelayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      if (scheduleIdleCallback(() => resolve(), timeoutMs)) return;
      window.setTimeout(resolve, Math.max(0, fallbackDelayMs));
    });
  }
  function scheduleIdleCallback(callback, timeoutMs = 75) {
    const requestIdleCallback = window.requestIdleCallback;
    if (typeof requestIdleCallback !== "function") return false;
    requestIdleCallback.call(window, callback, { timeout: timeoutMs });
    return true;
  }
  function readBlobAsDataUrl(blob, errorMessage = "Could not read media.") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
      reader.readAsDataURL(blob);
    });
  }
  function pushJapaneseOcrLine(lines, text, box) {
    if (!text || !box || !HAS_JAPANESE.test(text)) return;
    lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
  }
  function clampBox(box, width, height) {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
  }
  function unionBoxes(boxes) {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.left + box.width));
    const bottom = Math.max(...boxes.map((box) => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
  }
  function cleanOcrText(value) {
    const text = typeof value === "string" ? value : String(value ?? "");
    const normalized = text.replace(/[ \t\r\n]+/g, HAS_JAPANESE.test(text) ? "" : " ").trim();
    return normalized.replaceAll("．．．", "…");
  }
  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight) {
    const state = { width: fallbackWidth, height: fallbackHeight, lines: [] };
    for (const response of cloudVisionResponses(record)) {
      appendCloudVisionPages(response, state);
      appendCloudVisionTextAnnotations(response, state);
    }
    return state.lines.length ? { width: state.width, height: state.height, lines: state.lines } : null;
  }
  function cloudVisionResponses(record) {
    if (Array.isArray(record.responses)) return record.responses;
    return "fullTextAnnotation" in record ? [record] : [];
  }
  function appendCloudVisionPages(response, state) {
    const annotation = response?.fullTextAnnotation;
    const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
    for (const page of pages) appendCloudVisionPage(page, state);
  }
  function appendCloudVisionPage(page, state) {
    state.width = numberFrom(page.width) || state.width;
    state.height = numberFrom(page.height) || state.height;
    for (const block of cloudVisionPageBlocks(page)) {
      for (const paragraph of cloudVisionBlockParagraphs(block)) {
        pushCloudVisionParagraphLines(paragraph, state.lines, state.width, state.height);
      }
    }
  }
  function cloudVisionPageBlocks(page) {
    return Array.isArray(page.blocks) ? page.blocks : [];
  }
  function cloudVisionBlockParagraphs(block) {
    const paragraphs = block?.paragraphs;
    return Array.isArray(paragraphs) ? paragraphs : [];
  }
  function appendCloudVisionTextAnnotations(response, state) {
    const annotations = Array.isArray(response?.textAnnotations) ? response.textAnnotations : [];
    if (state.lines.length || annotations.length <= 1) return;
    for (const annotationItem of annotations.slice(1)) {
      const item = annotationItem;
      const text = cleanOcrText(item.description);
      const box = normalizeCloudVisionVertices(item.boundingPoly?.vertices, state.width, state.height);
      pushJapaneseOcrLine(state.lines, text, box);
    }
  }
  function pushCloudVisionParagraphLines(paragraph, lines, width, height) {
    const words = Array.isArray(paragraph.words) ? paragraph.words : [];
    const current = { text: "", boxes: [] };
    for (const word of words) {
      cloudVisionWordSymbols(word).forEach((symbol) => appendCloudVisionSymbol(symbol, current, lines, width, height));
    }
    pushCloudVisionLine(lines, current);
  }
  function cloudVisionWordSymbols(word) {
    const symbols = word?.symbols;
    return Array.isArray(symbols) ? symbols : [];
  }
  function appendCloudVisionSymbol(symbol, current, lines, width, height) {
    const symbolRecord = symbol;
    current.text += String(symbolRecord.text ?? "");
    const box = normalizeCloudVisionVertices(symbolRecord.boundingBox?.vertices, width, height);
    if (box) current.boxes.push(box);
    const breakType = cloudVisionSymbolBreakType(symbolRecord);
    if (cloudVisionBreakAddsSpace(breakType)) current.text += " ";
    if (cloudVisionBreakEndsLine(breakType)) pushCloudVisionLine(lines, current);
  }
  function cloudVisionSymbolBreakType(symbol) {
    return symbol.property?.detectedBreak?.type;
  }
  function cloudVisionBreakAddsSpace(breakType) {
    return breakType === "SPACE" || breakType === "SURE_SPACE" || breakType === "UNKNOWN";
  }
  function cloudVisionBreakEndsLine(breakType) {
    return breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE" || breakType === "HYPHEN";
  }
  function pushCloudVisionLine(lines, current) {
    pushJapaneseOcrLine(lines, cleanOcrText(current.text), unionBoxes(current.boxes));
    current.text = "";
    current.boxes = [];
  }
  function normalizeCloudVisionVertices(value, width, height) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map((vertex) => numberFrom(vertex?.x) ?? 0);
    const ys = value.map((vertex) => numberFrom(vertex?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
  }
  const SIMPLE_JS_ESCAPE_SEQUENCES = /* @__PURE__ */ new Map([
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["b", "\b"],
    ["f", "\f"],
    ["v", "\v"],
    ["0", "\0"],
    ["\n", ""]
  ]);
  function googleLensUploadCallbackLiteral(html, key2) {
    const marker = "AF_initDataCallback(";
    let searchIndex = 0;
    while (searchIndex < html.length) {
      const markerIndex = html.indexOf(marker, searchIndex);
      if (markerIndex < 0) return null;
      const literalStart = markerIndex + marker.length;
      const literal = readBalancedLiteral(html, literalStart);
      if (literal && callbackLiteralHasKey(literal, key2)) return literal;
      searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
  }
  function callbackLiteralHasKey(literal, key2) {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key2)}['"]`).test(literal);
  }
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function readBalancedLiteral(source, startIndex) {
    const index = balancedLiteralStart(source, startIndex);
    if (index < 0) return null;
    const end = balancedLiteralEnd(source, index);
    return end >= 0 ? source.slice(index, end + 1) : null;
  }
  function balancedLiteralStart(source, startIndex) {
    let index = startIndex;
    while (/\s/.test(source[index] ?? "")) index += 1;
    return source[index] === "{" ? index : -1;
  }
  function balancedLiteralEnd(source, startIndex) {
    let depth = 0;
    for (let current = startIndex; current < source.length; current += 1) {
      const char = source[current];
      if (isQuote(char)) {
        current = quotedLiteralEnd(source, current, char);
        if (current < 0) return -1;
        continue;
      }
      depth += balancedDepthDelta(char);
      if (depth === 0) return current;
    }
    return -1;
  }
  function quotedLiteralEnd(source, startIndex, quote) {
    for (let current = startIndex + 1; current < source.length; current += 1) {
      const char = source[current];
      if (char === "\\") {
        current += 1;
      } else if (char === quote) {
        return current;
      }
    }
    return -1;
  }
  function isQuote(char) {
    return char === '"' || char === "'";
  }
  function balancedDepthDelta(char) {
    if (char === "{" || char === "[" || char === "(") return 1;
    if (char === "}" || char === "]" || char === ")") return -1;
    return 0;
  }
  function parseJsDataLiteral(source) {
    let index = 0;
    const value = parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error("Unexpected trailing data.");
    return value;
    function parseValue() {
      skipWhitespace();
      const char = source[index];
      if (char === "{") return parseObject();
      if (char === "[") return parseArray();
      if (char === '"' || char === "'") return parseString();
      if (char === "-" || /\d/.test(char ?? "")) return parseNumber();
      return parseIdentifierValue();
    }
    function parseObject() {
      const record = {};
      index += 1;
      skipWhitespace();
      while (source[index] !== "}") {
        const key2 = parseObjectKey();
        skipWhitespace();
        expect(":");
        record[key2] = parseValue();
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          continue;
        }
        break;
      }
      expect("}");
      return record;
    }
    function parseObjectKey() {
      skipWhitespace();
      const char = source[index];
      if (char === '"' || char === "'") return parseString();
      return parseIdentifier();
    }
    function parseArray() {
      const values = [];
      index += 1;
      skipWhitespace();
      while (source[index] !== "]") {
        if (source[index] === ",") {
          values.push(null);
          index += 1;
          skipWhitespace();
          continue;
        }
        values.push(parseValue());
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          continue;
        }
        break;
      }
      expect("]");
      return values;
    }
    function parseString() {
      const quote = source[index];
      let value2 = "";
      index += 1;
      while (index < source.length) {
        const char = source[index++];
        if (char === quote) return value2;
        if (char !== "\\") {
          value2 += char;
          continue;
        }
        value2 += parseEscapeSequence();
      }
      throw new Error("Unterminated string.");
    }
    function parseEscapeSequence() {
      const escaped = source[index++];
      const simpleEscape = SIMPLE_JS_ESCAPE_SEQUENCES.get(escaped ?? "");
      if (typeof simpleEscape === "string") return simpleEscape;
      if (escaped === "\r") return parseCarriageReturnEscape();
      return parseNamedEscapeSequence(escaped);
    }
    function parseCarriageReturnEscape() {
      if (source[index] === "\n") index += 1;
      return "";
    }
    function parseNamedEscapeSequence(escaped) {
      if (escaped === "x") return codePointEscape(2);
      if (escaped === "u") return parseUnicodeEscape();
      return escaped ?? "";
    }
    function parseUnicodeEscape() {
      if (source[index] === "{") {
        const end = source.indexOf("}", index + 1);
        if (end < 0) throw new Error("Invalid unicode escape.");
        const value2 = Number.parseInt(source.slice(index + 1, end), 16);
        index = end + 1;
        return Number.isFinite(value2) ? String.fromCodePoint(value2) : "";
      }
      return codePointEscape(4);
    }
    function codePointEscape(length) {
      const hex = source.slice(index, index + length);
      if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error("Invalid character escape.");
      index += length;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    function parseNumber() {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) throw new Error("Invalid number.");
      index += match[0].length;
      return Number(match[0]);
    }
    function parseIdentifierValue() {
      const identifier = parseIdentifier();
      if (identifier === "null" || identifier === "undefined" || identifier === "NaN") return null;
      if (identifier === "true") return true;
      if (identifier === "false") return false;
      if (identifier === "Infinity") return Infinity;
      return identifier;
    }
    function parseIdentifier() {
      const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
      if (!match) throw new Error("Expected identifier.");
      index += match[0].length;
      return match[0];
    }
    function skipWhitespace() {
      while (/\s/.test(source[index] ?? "")) index += 1;
    }
    function expect(char) {
      if (source[index] !== char) throw new Error(`Expected ${char}.`);
      index += 1;
    }
  }
  const LENS_WRITING_TOP_TO_BOTTOM = 2;
  const OCR_KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
  const OCR_KANJI_RE = /[\u3400-\u9fff々〆]/u;
  function normalizeOcrResult(value, fallbackWidth = 1, fallbackHeight = 1) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const cloudVision = normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight);
    if (cloudVision) return cloudVision;
    const { width, height } = ocrResultDimensions(record, fallbackWidth, fallbackHeight);
    const lines = collectGenericOcrLines(record, width, height);
    return japaneseOcrResult(width, height, lines);
  }
  function ocrResultDimensions(record, fallbackWidth, fallbackHeight) {
    const resolution = record.context_resolution;
    const width = numberFrom(record.width) || numberFrom(resolution?.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution?.height) || fallbackHeight;
    return { width, height };
  }
  function collectGenericOcrLines(record, width, height) {
    const lines = [];
    appendGenericOcrLines(lines, genericRawLines(record), width, height, normalizeSimpleLines);
    appendGenericOcrLines(lines, record.results, width, height, normalizeStructuredOcrResults);
    appendGenericOcrLines(lines, record.ocr_regions, width, height, normalizeOcrRegionResults);
    return lines;
  }
  function genericRawLines(record) {
    return Array.isArray(record.lines) ? record.lines : record.regions;
  }
  function appendGenericOcrLines(lines, value, width, height, normalize) {
    if (Array.isArray(value)) lines.push(...normalize(value, width, height));
  }
  function normalizeSimpleLines(values, width, height) {
    return values.map((item) => normalizeSimpleLine(item, width, height)).filter((line) => Boolean(line));
  }
  function normalizeStructuredOcrResults(values, width, height) {
    return values.flatMap((item) => normalizeStructuredOcrResult(item, width, height));
  }
  function normalizeOcrRegionResults(regions, width, height) {
    return regions.flatMap((region) => normalizeSingleOcrRegionResults(region, width, height));
  }
  function normalizeSingleOcrRegionResults(region, width, height) {
    const regionRecord = asRecord(region);
    if (!regionRecord) return [];
    const regionBox = normalizeOcrRegion(regionRecord, width, height);
    const { scaleWidth, scaleHeight } = ocrRegionScale(regionBox, width, height);
    if (!Array.isArray(regionRecord.results)) return [];
    const lines = normalizeStructuredOcrResults(regionRecord.results, scaleWidth, scaleHeight);
    return offsetRegionLines(lines, regionBox, width, height);
  }
  function ocrRegionScale(regionBox, width, height) {
    return {
      scaleWidth: regionBox?.width ?? width,
      scaleHeight: regionBox?.height ?? height
    };
  }
  function offsetRegionLines(lines, regionBox, width, height) {
    if (!regionBox) return lines;
    return lines.map((line) => offsetLineToRegion(line, regionBox, width, height)).filter((line) => Boolean(line));
  }
  function japaneseOcrResult(width, height, lines) {
    const japaneseLines = removeStandaloneFuriganaLines(lines).filter((line) => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
  }
  function cleanOcrLookupLines(lines, parsed) {
    const cleaned = lines.map((line, index) => {
      const text = cleanOcrLookupText(line.text, parsed[index] ?? []);
      return text === line.text ? line : { ...line, text };
    });
    return removeStandaloneFuriganaLines(cleaned);
  }
  function ocrLinesChanged(original, cleaned) {
    return original.length !== cleaned.length || cleaned.some((line, index) => line.text !== original[index]?.text);
  }
  function cleanOcrLookupText(text, tokens) {
    const rubies = tokens.flatMap((token) => token.rubies.map((ruby) => ({ ruby, token }))).sort((a, b) => b.ruby.start - a.ruby.start);
    let cleaned = text;
    for (const { ruby } of rubies) {
      if (!OCR_KANJI_RE.test(cleaned.slice(ruby.start, ruby.end))) continue;
      cleaned = removeOcrReadingAroundRuby(cleaned, ruby.text, ruby.start, ruby.end);
    }
    return cleanOcrText(cleaned);
  }
  function removeOcrReadingAroundRuby(text, reading, start, end) {
    const cleanReading = cleanOcrText(reading);
    if (!cleanReading) return text;
    if (text.slice(Math.max(0, start - cleanReading.length), start) === cleanReading) {
      return text.slice(0, start - cleanReading.length) + text.slice(start);
    }
    if (text.slice(end, end + cleanReading.length) === cleanReading) {
      return text.slice(0, end) + text.slice(end + cleanReading.length);
    }
    return text;
  }
  function removeStandaloneFuriganaLines(lines) {
    const filtered = lines.filter((line, index) => !isStandaloneFuriganaLine(line, lines, index));
    return filtered.length ? filtered : lines;
  }
  function isStandaloneFuriganaLine(line, lines, index) {
    const text = cleanOcrText(line.text).replace(/\s+/g, "");
    if (!text || text.length > 10 || !OCR_KANA_ONLY_RE.test(text)) return false;
    return lines.some((other, otherIndex) => otherIndex !== index && OCR_KANJI_RE.test(other.text) && ocrLineLooksLikeFuriganaFor(line, other));
  }
  function ocrLineLooksLikeFuriganaFor(furi, base) {
    if (furi.vertical || base.vertical) return ocrLineLooksLikeVerticalFuriganaFor(furi, base);
    const overlap = horizontalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.width, base.box.width));
    const smaller = furi.box.height <= base.box.height * 0.75 || furi.box.width <= base.box.width * 0.65;
    const nearTop = furi.box.top <= base.box.top + base.box.height * 0.5 && furi.box.top + furi.box.height >= base.box.top - Math.max(base.box.height * 0.45, furi.box.height * 3);
    return overlapRatio >= 0.32 && smaller && nearTop;
  }
  function horizontalOverlap(a, b) {
    return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  }
  function ocrLineLooksLikeVerticalFuriganaFor(furi, base) {
    if (!furi.vertical || !base.vertical) return false;
    const overlap = verticalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.height, base.box.height));
    const smaller = furi.box.width <= base.box.width * 0.75 || furi.box.height <= base.box.height * 0.65;
    const nearSide = horizontalGap(furi.box, base.box) <= Math.max(base.box.width * 0.75, furi.box.width * 2);
    return overlapRatio >= 0.32 && smaller && nearSide;
  }
  function verticalOverlap(a, b) {
    return Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  }
  function horizontalGap(a, b) {
    if (a.left + a.width < b.left) return b.left - (a.left + a.width);
    if (b.left + b.width < a.left) return a.left - (b.left + b.width);
    return 0;
  }
  function parseGoogleLensResponse(bytes, width, height) {
    const root = decodeProtoMessage(bytes);
    const objectsResponse = protoFirstMessage(root, 2);
    const text = objectsResponse ? protoFirstMessage(objectsResponse, 3) : null;
    const layout = text ? protoFirstMessage(text, 1) : null;
    if (!layout) return null;
    const lines = protoMessages(layout, 1).flatMap((paragraph) => googleLensParagraphLines(paragraph, width, height));
    return lines.length ? { width, height, lines } : null;
  }
  function googleLensParagraphLines(paragraph, width, height) {
    const vertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
    const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
    return protoMessages(paragraph, 2).map((line) => googleLensLine(line, vertical, paragraphBox, width, height)).filter((line) => Boolean(line));
  }
  function googleLensLine(line, paragraphVertical, paragraphBox, width, height) {
    const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
    const words = googleLensWords(line, width, height);
    const text = googleLensLineText(words, paragraphVertical);
    if (!text || !HAS_JAPANESE.test(text)) return null;
    const box = googleLensLineBox(lineBox, words, paragraphBox);
    if (!box) return null;
    return {
      text,
      box,
      vertical: paragraphVertical || box.height > box.width * 1.25 && text.length > 1
    };
  }
  function googleLensWords(line, width, height) {
    return protoMessages(line, 1).map((word) => ({
      text: protoString(word, 2),
      separator: protoString(word, 3),
      box: protoBox(protoFirstMessage(word, 4), width, height)
    })).filter((word) => Boolean(word.text));
  }
  function googleLensLineText(words, paragraphVertical) {
    const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => (a.box?.left ?? 0) - (b.box?.left ?? 0));
    return cleanOcrText(orderedWords.map(googleLensWordText).join(""));
  }
  function googleLensWordText(word, index, words) {
    return word.text + (word.separator || (index < words.length - 1 ? " " : ""));
  }
  function googleLensLineBox(lineBox, words, paragraphBox) {
    return lineBox ?? unionBoxes(words.map((word) => word.box).filter((item) => Boolean(item))) ?? paragraphBox;
  }
  function parseGoogleLensUploadHtml(html, width, height) {
    const literal = googleLensUploadCallbackLiteral(html, "ds:1");
    if (!literal) return null;
    try {
      const callback = parseJsDataLiteral(literal);
      const lines = [];
      for (const item of googleLensUploadLineItems(callback.data)) {
        const { text, box } = googleLensUploadLine(item, width, height);
        pushJapaneseOcrLine(lines, text, box);
      }
      return lines.length ? { width, height, lines } : null;
    } catch {
      return null;
    }
  }
  function googleLensUploadLineItems(data) {
    return googleLensUploadBlocks(data).flatMap((block) => googleLensUploadBlockLineItems(block));
  }
  function googleLensUploadBlocks(data) {
    const blocks = data?.[2]?.[3]?.[0] ?? [];
    return Array.isArray(blocks) ? blocks : [];
  }
  function googleLensUploadBlockLineItems(block) {
    const blockData = Array.isArray(block) ? block : [];
    const rawLines = blockData[2]?.[0]?.[5]?.[3];
    const lineItems = rawLines?.[0];
    return Array.isArray(lineItems) ? lineItems : [];
  }
  function googleLensUploadLine(item, width, height) {
    const lineData = Array.isArray(item) ? item : [];
    return {
      text: googleLensUploadLineText(lineData[0]),
      box: googleLensUploadLineBox(lineData[1], width, height)
    };
  }
  function googleLensUploadLineText(value) {
    const words = Array.isArray(value) ? value : [];
    return cleanOcrText(words.map(googleLensUploadWordText).join(""));
  }
  function googleLensUploadWordText(word) {
    const wordData = Array.isArray(word) ? word : [];
    return `${wordData[0] ?? ""}${wordData[3] ?? ""}`;
  }
  function googleLensUploadLineBox(value, width, height) {
    const boxData = Array.isArray(value) ? value : [];
    if (boxData.length < 4) return null;
    return clampBox({
      top: Number(boxData[0]) * height,
      left: Number(boxData[1]) * width,
      width: Number(boxData[2]) * width,
      height: Number(boxData[3]) * height
    }, width, height);
  }
  function normalizeSimpleLine(value, width, height) {
    const record = asRecord(value);
    if (!record) return null;
    const text = simpleLineText(record);
    const box = simpleLineBox(record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: simpleLineIsVertical(record) };
  }
  function simpleLineText(record) {
    return stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
  }
  function simpleLineBox(record, width, height) {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
  }
  function simpleLineIsVertical(record) {
    return Boolean(record.vertical ?? record.is_vertical);
  }
  function normalizeStructuredOcrResult(value, width, height) {
    if (!value || typeof value !== "object") return [];
    const record = value;
    const textLines = structuredOcrTextLines(record);
    const vertical = structuredOcrVertical(record);
    const lines = textLines.map((item) => normalizeStructuredOcrLine(item, width, height, vertical)).filter((line) => line !== null);
    if (lines.length) return lines;
    return normalizeStructuredOcrFallback(record, textLines, width, height, vertical);
  }
  function structuredOcrTextLines(record) {
    if (Array.isArray(record.text_lines)) return record.text_lines;
    return Array.isArray(record.text) ? record.text : [];
  }
  function structuredOcrVertical(record) {
    return Boolean(record.is_vertical ?? record.box?.isVertical);
  }
  function normalizeStructuredOcrLine(item, width, height, inheritedVertical) {
    const lineRecord = asRecord(item);
    if (!lineRecord) return null;
    const text = structuredOcrLineText(lineRecord);
    const box = structuredOcrLineBox(lineRecord, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
  }
  function structuredOcrLineText(record) {
    return stringFrom(record.content ?? record.text ?? record.word);
  }
  function structuredOcrLineBox(record, width, height) {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
  }
  function structuredOcrLineVertical(record, inheritedVertical) {
    return Boolean(record.is_vertical ?? record.box?.isVertical ?? inheritedVertical);
  }
  function normalizeStructuredOcrFallback(record, textLines, width, height, vertical) {
    const text = textLines.map((item) => stringFrom(item?.content)).filter(Boolean).join("");
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
  }
  function normalizeOcrRegion(record, width, height) {
    const region = readOcrRegion(record);
    if (!region) return null;
    const box = clampBox(scaleOcrRegion(region, width, height), width, height);
    return box && !isFullImageOcrRegion(box, width, height) ? box : null;
  }
  function readOcrRegion(record) {
    const position = record.position;
    const size = record.size;
    if (!position || !size) return null;
    return completeOcrRegionParts({
      left: numberFrom(position.left),
      top: numberFrom(position.top),
      width: numberFrom(size.width),
      height: numberFrom(size.height)
    });
  }
  function completeOcrRegionParts(parts) {
    if (parts.left === null) return null;
    if (parts.top === null) return null;
    if (parts.width === null) return null;
    if (parts.height === null) return null;
    return { left: parts.left, top: parts.top, width: parts.width, height: parts.height };
  }
  function scaleOcrRegion(region, width, height) {
    const divisor = Math.max(region.left, region.top, region.width, region.height) <= 1 ? 1 : 100;
    return {
      left: region.left / divisor * width,
      top: region.top / divisor * height,
      width: region.width / divisor * width,
      height: region.height / divisor * height
    };
  }
  function isFullImageOcrRegion(box, width, height) {
    return box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
  }
  function offsetLineToRegion(line, region, width, height) {
    const box = clampBox({
      left: region.left + line.box.left,
      top: region.top + line.box.top,
      width: line.box.width,
      height: line.box.height
    }, width, height);
    return box ? { ...line, box } : null;
  }
  function normalizeBox(value, width, height) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return normalizePositionDimensionsBox(record, width, height) ?? normalizeDirectBox(record, width, height) ?? normalizePointBox(record, width, height);
  }
  function normalizePositionDimensionsBox(record, width, height) {
    const position = asRecord(record.position);
    const dimensions = asRecord(record.dimensions);
    if (!position || !dimensions) return null;
    return boxFromNumbers({
      left: numberFrom(position.left),
      top: numberFrom(position.top),
      width: numberFrom(dimensions.width),
      height: numberFrom(dimensions.height)
    }, width, height, "percent-100");
  }
  function normalizeDirectBox(record, width, height) {
    const box = directBoxNumbers(record);
    return boxFromNumbers(box, width, height, directBoxScale(box));
  }
  function directBoxNumbers(record) {
    return {
      left: numberFrom(record.left ?? record.x),
      top: numberFrom(record.top ?? record.y),
      width: numberFrom(record.width ?? record.w),
      height: numberFrom(record.height ?? record.h)
    };
  }
  function directBoxScale(box) {
    return Object.values(box).every((value) => value !== null && value <= 1) ? "fraction" : "pixels";
  }
  function normalizePointBox(record, width, height) {
    const points = ["top_left", "top_right", "bottom_right", "bottom_left"].map((key2) => asRecord(record[key2])).filter((point) => Boolean(point));
    if (points.length < 2) return null;
    const xs = points.map((point) => numberFrom(point?.x)).filter((item) => item !== null);
    const ys = points.map((point) => numberFrom(point?.y)).filter((item) => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = coordinatesAreFractional(xs, ys);
    const scaledXs = scaleCoordinates(xs, width, percent);
    const scaledYs = scaleCoordinates(ys, height, percent);
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
  }
  function coordinatesAreFractional(xs, ys) {
    return xs.every(isFractionalCoordinate) && ys.every(isFractionalCoordinate);
  }
  function isFractionalCoordinate(value) {
    return value >= 0 && value <= 1;
  }
  function scaleCoordinates(values, scale, enabled) {
    return enabled ? values.map((value) => value * scale) : values;
  }
  function boxFromNumbers(box, imageWidth, imageHeight, scale) {
    if (!hasCompleteBoxNumbers(box)) return null;
    const scaleInfo = boxScaleInfo(scale);
    return clampBox({
      left: scaleBoxNumber(box.left, imageWidth, scaleInfo),
      top: scaleBoxNumber(box.top, imageHeight, scaleInfo),
      width: scaleBoxNumber(box.width, imageWidth, scaleInfo),
      height: scaleBoxNumber(box.height, imageHeight, scaleInfo)
    }, imageWidth, imageHeight);
  }
  function hasCompleteBoxNumbers(box) {
    return box.left !== null && box.top !== null && box.width !== null && box.height !== null;
  }
  function boxScaleInfo(scale) {
    return {
      fractional: scale !== "pixels",
      factor: scale === "percent-100" ? 100 : 1
    };
  }
  function scaleBoxNumber(value, dimension, scale) {
    return scale.fractional ? value / scale.factor * dimension : value;
  }
  function decodeProtoMessage(bytes) {
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
      const [tag, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
      const field = Number(tag >> 3n);
      const wire = Number(tag & 7n);
      if (!field) break;
      if (wire === 0) {
        const [value, afterValue] = readVarint(bytes, offset);
        offset = afterValue;
        fields.push({ field, wire, value });
      } else if (wire === 1) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true) });
        offset += 8;
      } else if (wire === 2) {
        const [length, afterLength] = readVarint(bytes, offset);
        offset = afterLength;
        const end = offset + Number(length);
        fields.push({ field, wire, value: bytes.slice(offset, end) });
        offset = end;
      } else if (wire === 5) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true) });
        offset += 4;
      } else {
        break;
      }
    }
    return fields;
  }
  function readVarint(bytes, offset) {
    let shift = 0n;
    let result = 0n;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return [result, offset];
      shift += 7n;
    }
    return [result, offset];
  }
  function protoMessages(fields, field) {
    return fields.filter((item) => item.field === field && item.wire === 2 && item.value instanceof Uint8Array).map((item) => decodeProtoMessage(item.value));
  }
  function protoFirstMessage(fields, field) {
    return protoMessages(fields, field)[0] ?? null;
  }
  function protoString(fields, field) {
    const item = fields.find((value) => value.field === field && value.wire === 2 && value.value instanceof Uint8Array);
    return item ? new TextDecoder().decode(item.value) : "";
  }
  function protoNumber(fields, field) {
    const item = fields.find((value) => value.field === field);
    if (!item) return 0;
    return typeof item.value === "bigint" ? Number(item.value) : typeof item.value === "number" ? item.value : 0;
  }
  function protoBox(geometry, width, height) {
    const dimensions = protoBoxDimensions(geometry);
    if (!dimensions) return null;
    return clampBox(scaledProtoBox(dimensions, protoBoxIsNormalized(dimensions), width, height), width, height);
  }
  function protoBoxDimensions(geometry) {
    const box = geometry ? protoFirstMessage(geometry, 1) : null;
    if (!box) return null;
    const dimensions = {
      centerX: protoNumber(box, 1),
      centerY: protoNumber(box, 2),
      width: protoNumber(box, 3),
      height: protoNumber(box, 4)
    };
    return dimensions.width && dimensions.height ? dimensions : null;
  }
  function protoBoxIsNormalized(box) {
    return box.centerX <= 2 && box.centerY <= 2 && box.width <= 2 && box.height <= 2;
  }
  function scaledProtoBox(box, normalized, width, height) {
    const scaledWidth = scaledProtoBoxValue(box.width, width, normalized);
    const scaledHeight = scaledProtoBoxValue(box.height, height, normalized);
    return {
      left: scaledProtoBoxValue(box.centerX, width, normalized) - scaledWidth / 2,
      top: scaledProtoBoxValue(box.centerY, height, normalized) - scaledHeight / 2,
      width: scaledWidth,
      height: scaledHeight
    };
  }
  function scaledProtoBoxValue(value, scale, normalized) {
    return normalized ? value * scale : value;
  }
  function stringFrom(value) {
    return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
  }
  function asRecord(value) {
    return value && typeof value === "object" ? value : null;
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
  function deinflectJapaneseTerm(source) {
    const results = [{ term: source, rules: [], reasons: [], depth: 0 }];
    const seen = /* @__PURE__ */ new Set([candidateKey(results[0])]);
    const queue = [results[0]];
    expandDeinflectionQueue(queue, results, seen);
    const sorted = sortDeinflectedTerms(results);
    return sorted;
  }
  function expandDeinflectionQueue(queue, results, seen) {
    for (let index = 0; index < queue.length; index++) {
      expandDeinflectedTerm(queue[index], queue, results, seen);
    }
  }
  function expandDeinflectedTerm(current, queue, results, seen) {
    if (isDeinflectionDepthLimitReached(current)) return;
    for (const rule of RULES) {
      rememberExpandedDeinflection(current, rule, queue, results, seen);
    }
  }
  function isDeinflectionDepthLimitReached(current) {
    return current.depth >= 2;
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
    const key2 = candidateKey(candidate);
    if (seen.has(key2)) return false;
    seen.add(key2);
    return true;
  }
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
  function candidateKey(candidate) {
    return `${candidate.term}
${candidate.rules.join(" ")}
${candidate.depth}`;
  }
  new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
  function stableHash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function stablePositiveHashId(value) {
    return stableHash32(value) || 1;
  }
  function stableHashBase36(value) {
    return stableHash32(value).toString(36);
  }
  Logger.scope("Yomitan");
  new TextDecoder();
  Logger.scope("YomitanSettingsImport");
  Logger.scope("Yomitan");
  const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
  const JAPANESE_TEXT_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]+/gu;
  const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u;
  const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
  const FALLBACK_INFLECTION_MAX_LENGTH = 18;
  const FALLBACK_LOOKUP_TERM_LIMIT = 8;
  const INFLECTION_BOUNDARY_SEGMENTS = /* @__PURE__ */ new Set(["は", "が", "を", "に", "へ", "と", "で", "の", "や", "から", "まで", "より", "だけ", "しか", "など"]);
  const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なかっ|なかった|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
  const HIRAGANA_SEGMENT_RE = /^[\u3040-\u309fー]+$/u;
  const SINGLE_KANJI_HIRAGANA_STEM_RE = /^[\u3400-\u9fff][\u3040-\u309fー]*$/u;
  const SURU_STEM_SEGMENT_RE = /[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ff]/u;
  const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
  Logger.scope("ReaderParser");
  function normalizeFallbackTerm(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  let cachedSegmenterConstructor;
  let cachedJapaneseWordSegmenter;
  function fallbackJapaneseSegments(text) {
    return segmentJapaneseText(text);
  }
  function segmentJapaneseText(text) {
    const segmenter = japaneseWordSegmenter();
    if (!segmenter) {
      return Array.from(text.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap((match) => {
        const start = match.index ?? 0;
        return fallbackJapaneseRunSegment(match[0], start);
      });
    }
    return Array.from(text.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap((match) => {
      const start = match.index ?? 0;
      return segmentJapaneseRun(match[0], start, segmenter);
    });
  }
  function segmentJapaneseRun(text, offset, segmenter) {
    const segments = Array.from(segmenter.segment(text)).filter(isUsefulJapaneseSegment).map((segment) => ({
      surface: segment.segment,
      start: offset + segment.index,
      end: offset + segment.index + segment.segment.length
    }));
    return mergeInflectedFallbackSegments(segments);
  }
  function mergeInflectedFallbackSegments(segments) {
    const merged = [];
    for (let index = 0; index < segments.length; ) {
      const span = inflectedFallbackSpanAt(segments, index);
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
  function inflectedFallbackSpanAt(segments, startIndex) {
    const first = segments[startIndex];
    if (!first || isInflectionBoundarySegment(first.surface)) return null;
    let surface = "";
    let best = null;
    for (let index = startIndex; index < fallbackInflectionScanEnd(segments, startIndex); index += 1) {
      const current = nextInflectedFallbackSegment(segments, index, startIndex, first, surface);
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
  function nextInflectedFallbackSegment(segments, index, startIndex, first, surface) {
    const current = segments[index];
    if (!current || !isContiguousFallbackSegment(segments, index, startIndex, first)) return null;
    if (index > startIndex && isInflectionBoundarySegment(current.surface)) return null;
    if (index > startIndex && !canContinueInflectedFallbackSpan(surface, current.surface)) return null;
    return current;
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
  function isInflectionBoundarySegment(surface) {
    return INFLECTION_BOUNDARY_SEGMENTS.has(surface);
  }
  function isInflectionContinuationSegment(surface) {
    return INFLECTION_CONTINUATION_SEGMENT_RE.test(surface);
  }
  function canContinueInflectedFallbackSpan(currentSurface, nextSurface) {
    return isInflectionContinuationSegment(nextSurface) || HIRAGANA_SEGMENT_RE.test(nextSurface) && SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface);
  }
  function shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms) {
    const first = segments[startIndex]?.surface ?? "";
    if (!first || !SURU_STEM_SEGMENT_RE.test(first)) return false;
    const suffix = surface.slice(first.length);
    return SURU_AUXILIARY_SUFFIX_RE.test(suffix) && lookupTerms.some((term) => term.endsWith("する"));
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
    return uniqueStrings$1([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
  }
  function isUsefulFallbackLookupCandidate(candidate) {
    return candidate.depth > 0 && JAPANESE_CHARACTER_RE.test(candidate.term) && candidate.term.length > 1;
  }
  function compareFallbackLookupCandidates(a, b) {
    return a.depth - b.depth || fallbackRulePriority(a) - fallbackRulePriority(b) || b.term.length - a.term.length || a.term.localeCompare(b.term);
  }
  function fallbackRulePriority(candidate) {
    if (candidate.rules.some((rule) => rule === "vs" || rule === "vs-s" || rule === "suru" || rule === "vk" || rule === "kuru")) return 0;
    if (candidate.rules.some((rule) => rule === "v1")) return 1;
    if (candidate.rules.some((rule) => rule.startsWith("v5") || rule === "v5")) return 1;
    if (candidate.rules.some((rule) => rule === "adj-i" || rule === "i-adj")) return 2;
    return 3;
  }
  function uniqueStrings$1(values) {
    const seen = /* @__PURE__ */ new Set();
    return values.filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  const MAX_CACHE_ITEMS = 36;
  const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15e3;
  const GOOGLE_LENS_ENDPOINT = "https://lensfrontend-pa.googleapis.com/v1/crupload";
  const GOOGLE_LENS_API_KEY = "AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY";
  const DEFAULT_LOCAL_OCR_ENDPOINT_URL = "http://127.0.0.1:7331/ocr";
  const LENS_PLATFORM_WEB = 3;
  const LENS_SURFACE_CHROMIUM = 4;
  const LENS_AUTO_FILTER = 7;
  const log$2 = Logger.scope("OCR");
  const OCR_RECOGNIZERS = {
    "google-lens": recognizeViaGoogleLens,
    "cloud-vision": recognizeViaCloudVision,
    "local-service": recognizeViaLocalService
  };
  const OCR_PROVIDER_CONFIGURED = {
    "google-lens": () => true,
    "cloud-vision": (settings) => Boolean(settings.ocrCloudVisionApiKey.trim()),
    "local-service": () => true
  };
  const OCR_PROVIDER_LABELS = {
    "google-lens": () => "google-lens",
    "cloud-vision": (settings) => settings.ocrCloudVisionApiKey.trim() ? "cloud-vision" : null,
    "local-service": localServiceProviderLabel
  };
  function shouldSkipOcrRequest(state, userRequested) {
    return state.autoSkipped && !userRequested;
  }
  function updateOcrRequestFlags(state, image, userRequested) {
    state.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
    state.manualRequested ||= userRequested;
    if (userRequested) state.autoSkipped = false;
  }
  function isOcrImageStateIdle(state) {
    return !state.result && !state.loading && !state.autoSkipped;
  }
  class LocalOcrUnavailableError extends Error {
    constructor(endpointUrl) {
      super("Local OCR server is unreachable.");
      this.endpointUrl = endpointUrl;
      this.name = "LocalOcrUnavailableError";
    }
  }
  function beginOcrScan(state, image, settings, manualRequested) {
    state.loading = true;
    const provider = inlineProviderLabel(settings);
    return {
      provider,
      done: log$2.time("scanImage", { provider, image: imageSummary(image), manualRequested })
    };
  }
  function finishOcrScan(state) {
    state.loading = false;
    state.manualRequested = false;
  }
  function renderNoOcrLines(state) {
    state.autoSkipped = true;
    state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
  }
  function logOcrFailure(state, provider, manualRequested, error) {
    state.autoSkipped = !manualRequested;
    if (isLocalOcrUnavailableError(error)) {
      log$2.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, "Local OCR endpoint unavailable; pausing requests", { provider, endpoint: error.endpointUrl });
      return;
    }
    log$2.warn("OCR scan failed", { provider, manualRequested }, error);
  }
  class ImageOcrController {
    constructor(options) {
      this.options = options;
    }
    states = /* @__PURE__ */ new Map();
    cache = /* @__PURE__ */ new Map();
    localOcrUnavailable;
    observer;
    observerMargin = "";
    mutationObserver;
    queue = [];
    busy = false;
    positionFrame = 0;
    refreshTimer = 0;
    lastPointerMoveImage;
    handleDocumentPointerDown = (event) => {
      this.unpinOcrLinesFromDocumentEvent(event);
      this.requestOcrFromPointerEvent(event);
    };
    handleDocumentPointerOver = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentPointerMove = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentClick = (event) => this.unpinOcrLinesFromDocumentEvent(event);
    init() {
      this.refresh();
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.addEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.addEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.addEventListener("click", this.handleDocumentClick, true);
      window.addEventListener("scroll", () => {
        if (!this.options.getSettings().ocrEnabled) return;
        this.schedulePosition();
        this.scheduleRefresh(240);
      }, { passive: true });
      window.addEventListener("resize", () => {
        if (!this.options.getSettings().ocrEnabled) return;
        this.schedulePosition();
        this.scheduleRefresh(300);
      }, { passive: true });
      this.mutationObserver = new MutationObserver((mutations) => this.handleRenderableMediaMutations(mutations));
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "loading", "poster"]
      });
    }
    destroy() {
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.removeEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.removeEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.removeEventListener("click", this.handleDocumentClick, true);
      this.mutationObserver?.disconnect();
      if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
      this.clear();
    }
    refresh(options = {}) {
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled) {
        this.clear();
        return;
      }
      if (this.shouldSkipRefresh(settings, options)) {
        this.pruneDisconnectedStates();
        this.schedulePosition();
        return;
      }
      this.pruneDisconnectedStates();
      this.ensureObserver(settings);
      const images = this.refreshImages(settings);
      for (const image of images) {
        this.observeRefreshImage(image, settings);
      }
      this.schedulePosition();
    }
    shouldSkipRefresh(settings, options) {
      if (options.userRequested) return false;
      if (this.canAutoScanImage(settings)) return false;
      return !settings.ocrAutoScanImages || !this.hasVisibleInlineOcrFallback(settings);
    }
    handleRenderableMediaMutations(mutations) {
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled) return;
      const summary = summarizeRenderableMediaMutations(mutations);
      if (!summary.touched) return;
      this.schedulePosition();
      if (!canAutoRefreshOcrAfterMutation(settings, this.options.shouldAutoScan)) return;
      this.scheduleRefresh(summary.addedImage ? 0 : 40);
    }
    hasVisibleInlineOcrFallback(settings) {
      return Array.from(document.images).some((image) => {
        if (!readFallbackOcrResult(image, false)) return false;
        return isCandidateImage(image, settings) && shouldObserveImage(image, settings);
      });
    }
    refreshImages(settings) {
      return Array.from(document.images).filter((image) => isCandidateImage(image, settings) && shouldObserveImage(image, settings)).sort((a, b) => this.compareRefreshImages(a, b)).slice(0, settings.ocrMaxImagesPerPage);
    }
    compareRefreshImages(a, b) {
      const priorityDelta = this.observePriority(a) - this.observePriority(b);
      return priorityDelta || imageViewportDistance(a) - imageViewportDistance(b);
    }
    observeRefreshImage(image, settings) {
      const state = this.ensureState(image);
      this.observer?.observe(image);
      if (this.shouldAutoEnqueueImage(image, state, settings)) this.enqueue(image);
    }
    shouldAutoEnqueueImage(image, state, settings) {
      return (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) && isOcrImageStateIdle(state) && isNearViewport(image, settings.ocrPrefetchMargin);
    }
    canAutoScanImage(settings) {
      return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
    }
    async scanVisible() {
      this.refresh({ userRequested: true });
      const images = [...this.states.keys()].filter((image) => isNearViewport(image, 120));
      if (!images.length) {
        this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, "ocrNoReadableImages"));
        return;
      }
      images.forEach((image) => this.enqueue(image, true));
      log$2.info("Manual OCR scan queued images", { images: images.length });
    }
    captureSourceImageForElement(element) {
      const line = element?.closest?.(".jpdb-ocr-line");
      if (!line) return void 0;
      const state = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (!state) return void 0;
      const image = captureImageElement(state.image);
      return image;
    }
    pinLineForElement(element) {
      const line = element?.closest?.(".jpdb-ocr-line");
      if (!line) return;
      const state = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (state) this.pinLine(state, line);
    }
    ensureObserver(settings) {
      const rootMargin = `${settings.ocrPrefetchMargin}px 0px`;
      if (this.observer && this.observerMargin === rootMargin) return;
      this.observer?.disconnect();
      this.observerMargin = rootMargin;
      if (typeof IntersectionObserver !== "function") {
        this.observer = void 0;
        return;
      }
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const image = entry.target;
          this.positionState(image);
          const current = this.options.getSettings();
          if (current.ocrAutoScanImages && shouldObserveImage(image, current)) this.enqueue(image);
        }
      }, { rootMargin });
    }
    ensureState(image) {
      const existing = this.states.get(image);
      if (existing) return existing;
      const overlay = document.createElement("div");
      overlay.className = "jpdb-ocr-layer";
      overlay.dataset.jpdbReaderRoot = "true";
      document.body.append(overlay);
      const state = { image, overlay, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
      image.addEventListener("load", () => {
        this.resetStateIfImageChanged(state);
        this.schedulePosition();
        this.scheduleRefresh(0);
      });
      this.states.set(image, state);
      if (image.complete && image.naturalWidth > 0) {
        this.schedulePosition();
        const settings = this.options.getSettings();
        if (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) this.enqueue(image);
      }
      return state;
    }
    enqueue(image, userRequested = false) {
      const state = this.states.get(image) ?? this.ensureState(image);
      if (!this.shouldQueueOcrRequest(state, image, userRequested)) return;
      this.queueOcrRequest(image);
    }
    shouldQueueOcrRequest(state, image, userRequested) {
      if (shouldSkipOcrRequest(state, userRequested)) return false;
      const forceExistingOverlay = userRequested && !state.overlayRequested;
      updateOcrRequestFlags(state, image, userRequested);
      if (this.renderExistingOcrResult(state, forceExistingOverlay)) return false;
      return !state.loading;
    }
    queueOcrRequest(image) {
      this.queueImageForOcr(image);
      this.drainQueue();
    }
    renderExistingOcrResult(state, userRequested) {
      if (!state.result) return false;
      if (userRequested) void this.renderResult(state, state.result, true);
      return true;
    }
    requestOcrFromPointerEvent(event) {
      const image = ocrImageFromPointerEvent(event, this.options.getSettings());
      if (!image) return;
      if (event.type === "pointermove" && image === this.lastPointerMoveImage) return;
      if (event.type === "pointermove") this.lastPointerMoveImage = image;
      else this.lastPointerMoveImage = void 0;
      this.enqueue(image, true);
    }
    queueImageForOcr(image) {
      if (!this.queue.includes(image)) this.queue.push(image);
    }
    drainQueue() {
      if (this.busy) return;
      const image = this.queue.shift();
      if (!image) return;
      this.busy = true;
      const hasFastText = Boolean(readFallbackOcrResult(image, false));
      const delay = this.states.get(image)?.overlayRequested || hasFastText ? 0 : 900;
      void waitForIdle(delay, delay).then(() => this.scanImage(image)).finally(() => {
        this.busy = false;
        this.drainQueue();
      });
    }
    async scanImage(image) {
      const state = this.states.get(image) ?? this.ensureState(image);
      const settings = this.options.getSettings();
      const key2 = imageCacheKey(image);
      const manualRequested = state.manualRequested;
      this.resetStateIfImageChanged(state);
      if (await this.renderCachedOcrResult(state, key2)) return;
      const scan = beginOcrScan(state, image, settings, manualRequested);
      try {
        await this.scanUncachedImage(state, image, key2, settings, scan.provider, manualRequested);
      } catch (error) {
        await this.renderOcrFailure(state, image, scan.provider, manualRequested, error);
      } finally {
        finishOcrScan(state);
        scan.done();
      }
    }
    async renderCachedOcrResult(state, key2) {
      const cached = this.cache.get(key2);
      if (!cached) return false;
      await this.renderResult(state, cached);
      state.manualRequested = false;
      return true;
    }
    async scanUncachedImage(state, image, key2, settings, provider, manualRequested) {
      const inlineFallback = readFallbackOcrResult(image, false);
      const providerResult = inlineFallback ? null : await this.recognizeImage(image, settings);
      const result = inlineFallback ?? providerResult;
      if (!result?.lines.length) {
        renderNoOcrLines(state);
        return;
      }
      this.remember(key2, result);
      state.key = key2;
      await this.renderResult(state, result);
      log$2.info("OCR result rendered", { provider, lines: result.lines.length, manualRequested });
    }
    async renderOcrFailure(state, image, provider, manualRequested, error) {
      const fallback = readFallbackOcrResult(image, false);
      if (fallback?.lines.length) {
        log$2.warn("OCR provider failed", { provider }, error);
        await this.renderResult(state, fallback);
        return;
      }
      logOcrFailure(state, provider, manualRequested, error);
    }
    recognizeImage(image, settings) {
      const recognizer = ocrRecognizer(settings);
      if (!recognizer) return Promise.resolve(null);
      if (settings.ocrProvider !== "local-service") return recognizer(image, settings);
      return this.recognizeViaLocalServiceWithBackoff(image, settings, recognizer);
    }
    async recognizeViaLocalServiceWithBackoff(image, settings, recognizer) {
      const endpointUrl = localOcrEndpointUrl(settings);
      if (this.isLocalOcrUnavailable(endpointUrl)) throw new LocalOcrUnavailableError(endpointUrl);
      try {
        const result = await recognizer(image, settings);
        this.clearLocalOcrUnavailable(endpointUrl);
        return result;
      } catch (error) {
        if (isLocalOcrConnectionError(error)) this.rememberLocalOcrUnavailable(endpointUrl);
        throw error;
      }
    }
    isLocalOcrUnavailable(endpointUrl) {
      const unavailable = this.localOcrUnavailable;
      if (!unavailable || unavailable.endpointUrl !== endpointUrl) return false;
      if (Date.now() < unavailable.retryAt) return true;
      this.localOcrUnavailable = void 0;
      return false;
    }
    rememberLocalOcrUnavailable(endpointUrl) {
      this.localOcrUnavailable = { endpointUrl, retryAt: Date.now() + LOCAL_OCR_UNAVAILABLE_RETRY_MS };
    }
    clearLocalOcrUnavailable(endpointUrl) {
      if (this.localOcrUnavailable?.endpointUrl === endpointUrl) this.localOcrUnavailable = void 0;
    }
    async renderResult(state, result, forceOverlay = false) {
      state.result = result;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
      const settings = this.options.getSettings();
      const showText = settings.ocrShowTextOverlay || forceOverlay;
      const initialParsed = await this.parseOcrLines(result.lines);
      const lines = cleanOcrLookupLines(result.lines, initialParsed);
      const parsed = ocrLinesChanged(result.lines, lines) ? await this.parseOcrLines(lines) : initialParsed;
      const sentence = lines.map((line) => line.text).join("\n");
      const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
        line.text,
        parsed[index] ?? [],
        this.options.fallbackCardFromText ?? ocrFallbackCardFromText
      ));
      const flatTokens = renderedTokens.flat();
      await this.options.enrichTokensBeforeRender?.(flatTokens);
      applyOcrOverlayStyle(state.overlay, settings);
      for (const [index, line] of lines.entries()) {
        state.overlay.append(this.renderOcrLineElement(state, result, line, renderedTokens[index] ?? [], sentence, showText, settings));
      }
      this.positionState(state.image);
      void this.options.enrichRenderedTokens?.(flatTokens, state.overlay);
    }
    async parseOcrLines(lines) {
      const options = ocrParseOptions();
      return Promise.all(lines.map((line) => this.options.parseJapanese(line.text, options).catch(() => {
        return [];
      })));
    }
    renderOcrLineElement(state, result, line, tokens, sentence, showText, settings) {
      const element = createOcrLineElement(result, line, tokens, sentence, showText, settings);
      element.addEventListener("click", (event) => this.toggleOcrLinePinned(state, element, event));
      return element;
    }
    toggleOcrLinePinned(state, element, event) {
      const word = event.target.closest(".jpdb-reader-word[data-vid]");
      if (element.dataset.pinned === "true") {
        this.unpinLine(element);
        if (word) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      element.focus({ preventScroll: true });
      this.pinLine(state, element);
      if (word) return;
      event.preventDefault();
      event.stopPropagation();
    }
    pinLine(state, element) {
      state.overlay.querySelectorAll(".jpdb-ocr-line-active").forEach((line) => {
        if (line !== element) this.unpinLine(line);
      });
      element.classList.add("jpdb-ocr-line-active");
      element.dataset.pinned = "true";
    }
    unpinLine(element) {
      element.classList.remove("jpdb-ocr-line-active");
      element.dataset.pinned = "false";
    }
    unpinOcrLinesFromDocumentEvent(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab")) return;
      this.unpinAllLines();
    }
    unpinAllLines() {
      for (const state of this.states.values()) {
        state.overlay.querySelectorAll(".jpdb-ocr-line-active").forEach((line) => this.unpinLine(line));
      }
    }
    observePriority(image) {
      const state = this.states.get(image);
      if (!state) return 0;
      if (!state.result) return state.autoSkipped ? 2 : 0;
      return 1;
    }
    resetStateIfImageChanged(state) {
      const key2 = imageCacheKey(state.image);
      if (key2 === state.key) return;
      state.key = key2;
      state.result = void 0;
      state.loading = false;
      state.overlayRequested = false;
      state.manualRequested = false;
      state.autoSkipped = false;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
    }
    remember(key2, result) {
      this.cache.set(key2, result);
      while (this.cache.size > MAX_CACHE_ITEMS) {
        const oldest = this.cache.keys().next().value;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
    }
    schedulePosition() {
      if (this.positionFrame) return;
      this.positionFrame = requestAnimationFrame(() => {
        this.positionFrame = 0;
        for (const image of this.states.keys()) this.positionState(image);
      });
    }
    scheduleRefresh(delay) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refresh(), delay);
    }
    positionState(image) {
      const state = this.states.get(image);
      if (!state) return;
      const rect = image.getBoundingClientRect();
      const visible = isImageVisibleForOcr(image, rect);
      state.overlay.hidden = !visible;
      if (!visible) return;
      state.overlay.style.left = `${rect.left}px`;
      state.overlay.style.top = `${rect.top}px`;
      state.overlay.style.width = `${rect.width}px`;
      state.overlay.style.height = `${rect.height}px`;
      this.fitLineFonts(state, renderedOcrImageFrame(image, rect, state.result));
    }
    fitLineFonts(state, frame) {
      const scale = this.options.getSettings().ocrFontScale;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((element) => {
        const boxLeft = frame.imageLeft + Number(element.dataset.boxLeft) * frame.imageWidth;
        const boxTop = frame.imageTop + Number(element.dataset.boxTop) * frame.imageHeight;
        const boxWidth = Number(element.dataset.boxWidth) * frame.imageWidth;
        const boxHeight = Number(element.dataset.boxHeight) * frame.imageHeight;
        if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
        const text = element.dataset.ocrText ?? "";
        const vertical = element.dataset.vertical === "true";
        element.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
        this.fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, frame, vertical);
      });
    }
    fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, frame, vertical) {
      const textElement = element.querySelector(".jpdb-ocr-line-text");
      if (!textElement) return;
      const hasFurigana = element.dataset.hasFuri === "true";
      const fontSize = Number.parseFloat(element.style.fontSize) || 16;
      const padX = Math.max(4, Math.round(fontSize * 0.16));
      const padTop = hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08));
      const padBottom = Math.max(3, Math.round(fontSize * 0.1));
      element.style.setProperty("--jpdb-ocr-pad-x", `${padX}px`);
      element.style.setProperty("--jpdb-ocr-pad-top", `${padTop}px`);
      element.style.setProperty("--jpdb-ocr-pad-bottom", `${padBottom}px`);
      const contentRect = textElement.getBoundingClientRect();
      const contentWidth = Math.max(1, contentRect.width);
      const contentHeight = Math.max(1, contentRect.height);
      const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
      const frameWidth = Math.min(frame.imageWidth, Math.max(boxWidth, minHitSize, contentWidth + padX * 2));
      const frameHeight = Math.min(frame.imageHeight, Math.max(boxHeight, minHitSize, contentHeight + padTop + padBottom));
      const minLeft = frame.imageLeft;
      const minTop = frame.imageTop;
      const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - frameWidth);
      const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - frameHeight);
      const left = clampNumber$1(boxLeft + boxWidth / 2 - frameWidth / 2, minLeft, maxLeft);
      const centeredTop = boxTop + boxHeight / 2 - frameHeight / 2;
      const baselineAlignedTop = boxTop + boxHeight - frameHeight + padBottom;
      const top = clampNumber$1(shouldCenterOcrText(element.dataset.ocrText ?? "", vertical) ? centeredTop : baselineAlignedTop, minTop, maxTop);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.width = `${frameWidth}px`;
      element.style.height = `${frameHeight}px`;
    }
    clear() {
      this.observer?.disconnect();
      this.observer = void 0;
      this.observerMargin = "";
      window.clearTimeout(this.refreshTimer);
      this.queue = [];
      for (const state of this.states.values()) {
        state.overlay.remove();
      }
      this.states.clear();
    }
    pruneDisconnectedStates() {
      for (const [image, state] of this.states) {
        if (image.isConnected) continue;
        this.observer?.unobserve(image);
        state.overlay.remove();
        this.states.delete(image);
      }
    }
  }
  function applyOcrOverlayStyle(overlay, settings) {
    overlay.style.setProperty("--jpdb-ocr-text-color", settings.ocrTextColor);
    overlay.style.setProperty("--jpdb-ocr-outline-color", settings.ocrOutlineColor);
    overlay.style.setProperty("--jpdb-ocr-background-rgba", accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
    overlay.style.setProperty("--jpdb-ocr-background-active-rgba", accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));
  }
  function ocrParseOptions() {
    return {
      allowSegmentedFallback: true,
      includeLocalPitch: true
    };
  }
  function ocrTokensWithFallbackGaps(text, tokens, fallbackCardFromText) {
    const safeTokens = tokens.filter((token) => isRenderableOcrToken(token, text.length));
    const fallbackTokens = fallbackJapaneseSegments(text).filter((segment) => !safeTokens.some((token) => rangesOverlap(segment.start, segment.end, token.start, token.end))).map((segment) => ocrFallbackToken(text, segment, fallbackCardFromText));
    return fallbackTokens.length ? [...safeTokens, ...fallbackTokens].sort(compareOcrTokens) : safeTokens;
  }
  function isRenderableOcrToken(token, textLength) {
    return Number.isFinite(token.start) && Number.isFinite(token.end) && token.start >= 0 && token.end <= textLength && token.end > token.start;
  }
  function ocrFallbackToken(sentence, segment, fallbackCardFromText) {
    const card = fallbackCardFromText(segment.surface);
    return {
      card,
      start: segment.start,
      end: segment.end,
      length: segment.end - segment.start,
      rubies: [],
      pitchClass: "",
      sentence
    };
  }
  function rangesOverlap(start, end, otherStart, otherEnd) {
    return start < otherEnd && otherStart < end;
  }
  function compareOcrTokens(first, second) {
    return first.start - second.start || second.length - first.length;
  }
  function ocrFallbackCardFromText(text) {
    const spelling = text.replace(/\s+/g, " ").trim().slice(0, 80);
    const id = -stablePositiveHashId(`ocr-fallback
${spelling}`);
    return {
      vid: id,
      sid: id,
      rid: 0,
      spelling,
      reading: "",
      frequencyRank: null,
      partOfSpeech: [],
      meanings: [],
      cardState: ["not-in-deck"],
      pitchAccent: [],
      wordWithReading: null,
      source: "fallback"
    };
  }
  function createOcrLineElement(result, line, tokens, sentence, showText, settings) {
    const element = document.createElement("div");
    element.className = showText ? "jpdb-ocr-line jpdb-ocr-line-visible" : "jpdb-ocr-line";
    setOcrLineDataset(element, result, line, sentence);
    element.tabIndex = 0;
    element.style.writingMode = line.vertical ? "vertical-rl" : "horizontal-tb";
    element.setAttribute("aria-label", line.text);
    const textElement = createOcrLineText(line, tokens, settings);
    element.append(textElement);
    element.dataset.hasFuri = String(Boolean(textElement.querySelector(".jpdb-reader-has-furi")));
    setOcrLinePosition(element, result, line);
    return element;
  }
  function setOcrLineDataset(element, result, line, sentence) {
    element.dataset.ocrText = line.text;
    element.dataset.boxLeft = String(line.box.left / result.width);
    element.dataset.boxTop = String(line.box.top / result.height);
    element.dataset.vertical = String(line.vertical);
    element.dataset.boxWidth = String(line.box.width / result.width);
    element.dataset.boxHeight = String(line.box.height / result.height);
    element.dataset.sentence = sentence;
  }
  function createOcrLineText(line, tokens, settings) {
    const textElement = document.createElement("span");
    textElement.className = "jpdb-ocr-line-text";
    setInnerHtml(textElement, tokens.length ? renderTokensToHtml(line.text, tokens, settings) : escapeHtml(line.text));
    normalizeOcrRenderedText(textElement);
    return textElement;
  }
  function setOcrLinePosition(element, result, line) {
    element.style.left = `${100 * line.box.left / result.width}%`;
    element.style.top = `${100 * line.box.top / result.height}%`;
    element.style.width = `${100 * line.box.width / result.width}%`;
    element.style.height = `${100 * line.box.height / result.height}%`;
  }
  function renderedOcrImageFrame(image, rect, result) {
    const style = getComputedStyle(image);
    const content = imageContentBox(image, rect, style);
    const { sourceWidth, sourceHeight } = ocrSourceDimensions(image, rect, content, result);
    const object = fittedObjectSize(style.objectFit, sourceWidth, sourceHeight, content.width, content.height);
    const offset = objectPositionOffset(style.objectPosition, content.width - object.width, content.height - object.height);
    return {
      imageLeft: content.left + offset.x,
      imageTop: content.top + offset.y,
      imageWidth: Math.max(1, object.width),
      imageHeight: Math.max(1, object.height)
    };
  }
  function ocrSourceDimensions(image, rect, content, result) {
    return {
      sourceWidth: firstTruthyNumber(result?.width, image.naturalWidth, image.width, content.width, rect.width),
      sourceHeight: firstTruthyNumber(result?.height, image.naturalHeight, image.height, content.height, rect.height)
    };
  }
  function firstTruthyNumber(...values) {
    const value = values.find((candidate) => Boolean(candidate));
    return value === void 0 ? 1 : value;
  }
  function imageContentBox(image, rect, style) {
    const scaleX = rectScale(rect.width, image.offsetWidth);
    const scaleY = rectScale(rect.height, image.offsetHeight);
    const left = scaledBoxEdge(style.borderLeftWidth, scaleX) + scaledBoxEdge(style.paddingLeft, scaleX);
    const right = scaledBoxEdge(style.borderRightWidth, scaleX) + scaledBoxEdge(style.paddingRight, scaleX);
    const top = scaledBoxEdge(style.borderTopWidth, scaleY) + scaledBoxEdge(style.paddingTop, scaleY);
    const bottom = scaledBoxEdge(style.borderBottomWidth, scaleY) + scaledBoxEdge(style.paddingBottom, scaleY);
    return {
      left,
      top,
      width: Math.max(1, rect.width - left - right),
      height: Math.max(1, rect.height - top - bottom)
    };
  }
  function rectScale(rectSize, layoutSize) {
    return layoutSize > 0 ? rectSize / layoutSize : 1;
  }
  function scaledBoxEdge(value, scale) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed * scale : 0;
  }
  function fittedObjectSize(objectFit, sourceWidth, sourceHeight, contentWidth, contentHeight) {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const safeContentWidth = Math.max(1, contentWidth);
    const safeContentHeight = Math.max(1, contentHeight);
    const contain = () => scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.min(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
    switch (objectFit) {
      case "contain":
        return contain();
      case "cover":
        return scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.max(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
      case "none":
        return { width: safeSourceWidth, height: safeSourceHeight };
      case "scale-down": {
        const contained = contain();
        return contained.width < safeSourceWidth || contained.height < safeSourceHeight ? contained : { width: safeSourceWidth, height: safeSourceHeight };
      }
      case "fill":
      default:
        return { width: safeContentWidth, height: safeContentHeight };
    }
  }
  function scaledObjectSize(width, height, scale) {
    return {
      width: Math.max(1, width * scale),
      height: Math.max(1, height * scale)
    };
  }
  function objectPositionOffset(value, freeX, freeY) {
    const tokens = cssPositionTokens(value);
    const axes = parseObjectPositionAxes(tokens);
    return {
      x: axisPositionOffset(axes.x, freeX),
      y: axisPositionOffset(axes.y, freeY)
    };
  }
  function cssPositionTokens(value) {
    return value.trim().match(/(?:calc\([^)]*\)|[^\s]+)/g) ?? [];
  }
  function parseObjectPositionAxes(tokens) {
    const paired = parseKeywordPositionAxes(tokens);
    if (paired) return paired;
    const [first = "50%", second] = tokens;
    if (isVerticalPositionKeyword(first)) return { x: positionAxis(second || "50%"), y: positionAxis(first) };
    return { x: positionAxis(first), y: positionAxis(second || "50%") };
  }
  function parseKeywordPositionAxes(tokens) {
    let x = null;
    let y = null;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (isHorizontalPositionKeyword(token)) {
        x = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
        continue;
      }
      if (isVerticalPositionKeyword(token)) {
        y = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
      }
    }
    return x || y ? { x: x ?? positionAxis("50%"), y: y ?? positionAxis("50%") } : null;
  }
  function positionAxis(token) {
    return positionKeyword(token) ? { keyword: token } : { token };
  }
  function positionOffsetToken(token) {
    return token && !positionKeyword(token) ? token : void 0;
  }
  function axisPositionOffset(axis, freeSpace) {
    const base = axis.keyword ? keywordPositionOffset(axis.keyword, freeSpace) : tokenPositionOffset(axis.token, freeSpace);
    const offset = cssLengthPx(axis.offset);
    if (axis.keyword === "right" || axis.keyword === "bottom") return base - offset;
    return base + offset;
  }
  function keywordPositionOffset(keyword, freeSpace) {
    if (keyword === "right" || keyword === "bottom") return freeSpace;
    if (keyword === "center") return freeSpace / 2;
    return 0;
  }
  function tokenPositionOffset(token, freeSpace) {
    if (!token) return freeSpace / 2;
    if (token.endsWith("%")) return freeSpace * (Number.parseFloat(token) || 0) / 100;
    return cssLengthPx(token);
  }
  function cssLengthPx(value) {
    if (!value) return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function positionKeyword(token) {
    return isHorizontalPositionKeyword(token) || isVerticalPositionKeyword(token) || token === "center";
  }
  function isHorizontalPositionKeyword(token) {
    return token === "left" || token === "right";
  }
  function isVerticalPositionKeyword(token) {
    return token === "top" || token === "bottom";
  }
  function captureImageElement(image) {
    try {
      if (!image.naturalWidth || !image.naturalHeight) return void 0;
      const canvas = document.createElement("canvas");
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return void 0;
    }
  }
  function readFallbackOcrResult(image, _includeAccessibleText = false) {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    return parseFallbackOcrLines(image.dataset.ocrLines, width, height);
  }
  function parseFallbackOcrLines(data, width, height) {
    if (!data) return null;
    try {
      return normalizeOcrResult({ width, height, lines: JSON.parse(data) }, width, height);
    } catch {
      return null;
    }
  }
  function ocrFontPx(text, boxWidth, boxHeight, vertical, scale) {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const length = Math.max(1, visualTextLength(text));
    const byBoxThickness = vertical ? boxWidth * 0.72 : boxHeight * 0.58;
    const byBoxLength = vertical ? boxHeight / length * 1.12 : boxWidth / length * 1.08;
    const fitted = Math.min(byBoxThickness, byBoxLength) * safeScale;
    return Math.max(11, Math.min(38, fitted));
  }
  function visualTextLength(text) {
    return [...text.trim()].reduce((total, char) => {
      if (/\s/.test(char)) return total + 0.35;
      if (/[\u0000-\u00ff]/.test(char)) return total + 0.62;
      return total + 1;
    }, 0);
  }
  function shouldCenterOcrText(text, vertical) {
    return vertical || visualTextLength(text) <= 1.5;
  }
  function clampNumber$1(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  async function recognizeViaLocalService(image, settings) {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
    const engine = settings.ocrEngine === "auto" ? "" : settings.ocrEngine;
    const body = JSON.stringify({
      id: imageCacheKey(image),
      language_code: settings.ocrLanguage || "ja-JP",
      language: {
        bcp47_tag: settings.ocrLanguage || "ja-JP",
        two_letter_code: (settings.ocrLanguage || "ja").slice(0, 2)
      },
      base64_image: payload.base64,
      image: payload.base64,
      image_bytes: payload.base64,
      ocr_engine: engine,
      ocr_adapter_name: engine,
      detection_only: false
    });
    const response = await requestJson(localOcrEndpointUrl(settings), body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaCloudVision(image, settings) {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
    const body = JSON.stringify({
      requests: [{
        image: { content: payload.base64 },
        features: [{ type: "TEXT_DETECTION", maxResults: 50, model: "builtin/latest" }],
        imageContext: { languageHints: [(settings.ocrLanguage || "ja-JP").slice(0, 2)] }
      }]
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const response = await requestJson(url, body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaGoogleLens(image, settings) {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, "image/jpeg", 0.88);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    try {
      const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
      return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
    } catch (error) {
      log$2.warn("Google Lens protobuf failed", error);
      return recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs);
    }
  }
  function ocrRecognizer(settings) {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
  }
  function isOcrProviderConfigured(settings) {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
  }
  async function imageToBase64Payload(image, maxPixels) {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, "image/jpeg", 0.86);
    return { base64: (await readBlobAsDataUrl(blob, "Blob read failed.")).split(",")[1] ?? "", width: canvas.width, height: canvas.height };
  }
  async function imageToBlobPayload(image, maxPixels, type, quality) {
    const canvas = await imageToCanvas(image, maxPixels);
    try {
      return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
      const fallbackCanvas = await imageBlobToCanvas(image, maxPixels);
      return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
  }
  async function recognizeViaGoogleLensUpload(blob, width, height, timeout) {
    const data = new FormData();
    data.append("encoded_image", blob, "image.jpg");
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout);
    return parseGoogleLensUploadHtml(response, width, height);
  }
  async function imageToCanvas(image, maxPixels) {
    try {
      const canvas = drawImageToCanvas(image, maxPixels);
      assertCanvasReadable(canvas);
      return canvas;
    } catch {
      return imageBlobToCanvas(image, maxPixels);
    }
  }
  async function imageBlobToCanvas(image, maxPixels) {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith("data:")) throw new Error("Image cannot be read by OCR.");
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const loaded = await loadImage(objectUrl);
      const canvas = drawImageToCanvas(loaded, maxPixels);
      assertCanvasReadable(canvas);
      return canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function drawImageToCanvas(image, maxPixels) {
    const size = loadedImageSize(image);
    const canvas = scaledCanvas(size, maxPixels);
    drawableCanvasContext(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  function loadedImageSize(image) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("Image is not loaded yet.");
    return { width, height };
  }
  function scaledCanvas(size, maxPixels) {
    const scale = Math.min(1, Math.sqrt(Math.max(16e4, maxPixels) / (size.width * size.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    return canvas;
  }
  function drawableCanvasContext(canvas) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable.");
    return context;
  }
  function assertCanvasReadable(canvas) {
    canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
  }
  function createGoogleLensRequest(imageBytes, width, height, locale) {
    const [language = "ja", region = "US"] = (locale || "ja-JP").split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const requestId = protoMessage(
      protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1e6))),
      protoVarintField(2, 1),
      protoVarintField(3, 1),
      protoBytesField(4, randomBytes(16))
    );
    const localeContext = protoMessage(
      protoStringField(1, language || "ja"),
      protoStringField(2, region || "US"),
      protoStringField(3, timeZone)
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
      protoVarintField(1, LENS_PLATFORM_WEB),
      protoVarintField(2, LENS_SURFACE_CHROMIUM),
      protoMessageField(4, localeContext),
      protoMessageField(17, clientFilters)
    );
    const requestContext = protoMessage(
      protoMessageField(3, requestId),
      protoMessageField(4, clientContext)
    );
    const imageData = protoMessage(
      protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
      protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height)))
    );
    return protoMessage(protoMessageField(1, protoMessage(
      protoMessageField(1, requestContext),
      protoMessageField(3, imageData)
    )));
  }
  function isCandidateImage(image, settings) {
    if (isIgnoredOcrImage(image)) return false;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < settings.ocrMinImageArea) return false;
    if (!isNearViewport(image, settings.ocrPrefetchMargin)) return false;
    if (isImageOccludedByVideo(image, rect)) return false;
    return isVisibleOcrImage(image);
  }
  function ocrImageFromPointerEvent(event, settings) {
    if (!settings.ocrEnabled || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
    return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
  }
  function shouldHandleOcrPointerEvent(event) {
    if (event.type === "pointerdown") return event.button === void 0 || event.button === 0;
    return (event.type === "pointerover" || event.type === "pointermove") && isHoverPointerType(event.pointerType);
  }
  function isPointerLikeEvent(event) {
    const candidate = event;
    return typeof candidate.clientX === "number" && typeof candidate.clientY === "number";
  }
  function isHoverPointerType(pointerType) {
    return !pointerType || pointerType === "mouse" || pointerType === "pen";
  }
  function pointerEventImageTarget(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-jpdb-reader-root]")) return null;
    return target instanceof HTMLImageElement ? target : target.closest("img");
  }
  function pointerEventImageAtPoint(event) {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (!element || element.closest("[data-jpdb-reader-root]")) return null;
    return element instanceof HTMLImageElement ? element : element.closest("img");
  }
  function isIgnoredOcrImage(image) {
    return Boolean(image.closest("[data-jpdb-reader-root]") || image.closest('[aria-hidden="true"], [hidden], .slick-cloned'));
  }
  function isVisibleOcrImage(image) {
    return !isHiddenByCss(image) && !isInsideHiddenAncestor(image);
  }
  function isImageVisibleForOcr(image, rect) {
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && !isImageOccludedByVideo(image, rect);
  }
  function isInsideHiddenAncestor(element) {
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      if (isHiddenByCss(current) || isHiddenByAttribute(current)) return true;
    }
    return false;
  }
  function isHiddenByCss(element) {
    const style = getComputedStyle(element);
    return style.visibility === "hidden" || style.display === "none" || Number(style.opacity || "1") <= 0;
  }
  function isHiddenByAttribute(element) {
    return element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden");
  }
  function mutationTouchesRenderableMedia(mutation) {
    if (mutation.type === "childList") {
      return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsRenderableMedia);
    }
    return mutation.target instanceof Element && nodeContainsRenderableMedia(mutation.target);
  }
  function summarizeRenderableMediaMutations(mutations) {
    let addedImage = false;
    let touched = false;
    for (const mutation of mutations) {
      if (!mutationTouchesRenderableMedia(mutation)) continue;
      touched = true;
      if (mutation.type === "childList" && [...mutation.addedNodes].some(nodeContainsRenderableMedia)) addedImage = true;
      if (addedImage) break;
    }
    return { touched, addedImage };
  }
  function canAutoRefreshOcrAfterMutation(settings, shouldAutoScan) {
    return settings.ocrAutoScanImages && shouldAutoScan?.() !== false;
  }
  function nodeContainsRenderableMedia(node) {
    return node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLSourceElement || node instanceof Element && Boolean(node.querySelector("img, video, source"));
  }
  function isImageOccludedByVideo(image, rect = image.getBoundingClientRect()) {
    const imageArea = rect.width * rect.height;
    if (imageArea < 4) return false;
    const imageRoot = image.getRootNode();
    for (const video of document.querySelectorAll("video")) {
      if (!isVisiblePeerVideo(video, image, imageRoot)) continue;
      if (videoOccludesImage(video, rect, imageArea)) return true;
    }
    return false;
  }
  function isVisiblePeerVideo(video, image, imageRoot) {
    return video.isConnected && video.getRootNode() === imageRoot && !isSameMediaNode(video, image) && visibleVideoRect(video) !== null && !isHiddenByCss(video);
  }
  function visibleVideoRect(video) {
    const rect = video.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 ? rect : null;
  }
  function videoOccludesImage(video, imageRect, imageArea) {
    const videoRect = visibleVideoRect(video);
    return Boolean(videoRect && intersectionArea(imageRect, videoRect) / imageArea >= 0.6);
  }
  function isSameMediaNode(video, image) {
    return video === image.parentElement || image === video.parentElement;
  }
  function intersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }
  function shouldObserveImage(image, settings) {
    return settings.ocrProvider !== "off" && (hasInlineOcrFallback(image) || isOcrProviderConfigured(settings));
  }
  function hasInlineOcrFallback(image) {
    return Boolean(readFallbackOcrResult(image, false));
  }
  function isNearViewport(element, margin) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.right >= -margin && rect.left <= window.innerWidth + margin;
  }
  function imageViewportDistance(image) {
    const rect = image.getBoundingClientRect();
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    if (rect.right < 0) return -rect.right;
    if (rect.left > window.innerWidth) return rect.left - window.innerWidth;
    return 0;
  }
  function imageCacheKey(image) {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
  }
  function protoMessage(...parts) {
    return concatBytes(parts);
  }
  function protoMessageField(field, value) {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
  }
  function protoBytesField(field, value) {
    return protoMessageField(field, value);
  }
  function protoStringField(field, value) {
    return protoBytesField(field, new TextEncoder().encode(value));
  }
  function protoVarintField(field, value) {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
  }
  function protoTag(field, wire) {
    return encodeVarint(field << 3 | wire);
  }
  function encodeVarint(value) {
    let item = BigInt(value);
    const bytes = [];
    do {
      let byte = Number(item & 0x7fn);
      item >>= 7n;
      if (item) byte |= 128;
      bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
  }
  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  function requestJson(url, data, timeout) {
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      headers: { "content-type": "application/json" },
      data,
      responseType: "json",
      timeout
    }, (response) => response.response ?? (response.responseText ? JSON.parse(response.responseText) : null), (status) => `OCR endpoint returned ${status}.`, "OCR timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetchJsonWithTimeout(url, data, timeout).then((response) => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
  }
  function fetchJsonWithTimeout(url, data, timeout) {
    if (!timeout) return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data });
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data, signal: controller.signal }).catch((error) => {
      if (timedOut || isAbortError(error)) throw new Error("OCR timed out.");
      throw error;
    }).finally(() => window.clearTimeout(timeoutId));
  }
  function requestArrayBuffer(url, data, timeout) {
    const body = new Uint8Array(data);
    const headers = {
      "content-type": "application/x-protobuf",
      "x-goog-api-key": GOOGLE_LENS_API_KEY,
      accept: "*/*",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8"
    };
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      headers,
      data: body.buffer,
      responseType: "arraybuffer",
      timeout
    }, (response) => response.response, (status) => `Google Lens returned ${status}.`, "Google Lens timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, {
      method: "POST",
      headers,
      body: body.buffer
    }).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
  }
  function requestTextForm(url, data, timeout) {
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      data,
      responseType: "text",
      timeout
    }, (response) => String(response.responseText ?? response.response ?? ""), (status) => `Google Lens upload returned ${status}.`, "Google Lens upload timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, { method: "POST", body: data }).then((response) => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
  }
  function requestBlob(url) {
    const userscriptRequest = requestViaUserscript({
      method: "GET",
      url,
      responseType: "blob"
    }, (response) => response.response, (status) => `Image fetch returned ${status}.`);
    if (userscriptRequest) return userscriptRequest;
    return fetch(url).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
  }
  function requestViaUserscript(options, readResponse, statusMessage, timeoutMessage) {
    const userscriptRequest = getUserscriptHttpRequest();
    if (!userscriptRequest) return null;
    return new Promise((resolve, reject) => {
      userscriptRequest({
        ...options,
        onload: (response) => isSuccessfulHttpStatus(response.status) ? resolve(readResponse(response)) : reject(new Error(statusMessage(response.status))),
        onerror: reject,
        ...timeoutMessage ? { ontimeout: () => reject(new Error(timeoutMessage)) } : {}
      });
    });
  }
  function isSuccessfulHttpStatus(status) {
    return status >= 200 && status < 300;
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image decode failed."));
      image.src = url;
    });
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image encoding failed.")), type, quality);
    });
  }
  function imageSummary(image) {
    return {
      host: safeHost$1(image.currentSrc || image.src),
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      altLength: image.alt?.length ?? 0
    };
  }
  function inlineProviderLabel(settings) {
    return configuredOcrProviderLabel(settings) ?? settings.ocrProvider;
  }
  function configuredOcrProviderLabel(settings) {
    return OCR_PROVIDER_LABELS[settings.ocrProvider]?.(settings) ?? null;
  }
  function localServiceProviderLabel(settings) {
    return `local-service:${ocrEngineLabel(settings)}`;
  }
  function ocrEngineLabel(settings) {
    return settings.ocrEngine || "auto";
  }
  function localOcrEndpointUrl(settings) {
    return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
  }
  function isLocalOcrConnectionError(error) {
    if (isLocalOcrUnavailableError(error)) return true;
    if (!(error instanceof Error)) return true;
    return error.name === "TypeError" || error.name === "AbortError" || /network|failed to fetch|load failed|cors|blocked|timed out|timeout|request failed/i.test(error.message);
  }
  function isLocalOcrUnavailableError(error) {
    return error instanceof LocalOcrUnavailableError;
  }
  function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
  }
  function safeHost$1(value) {
    try {
      return new URL(value, location.href).host;
    } catch {
      return "inline-or-invalid";
    }
  }
  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }
  const ACTIVE_CUE_START_TOLERANCE_SECONDS = 0.05;
  const ACTIVE_CUE_END_GRACE_SECONDS = 0.12;
  const MIN_SUBTITLE_CUE_DURATION_SECONDS = 0.12;
  function normalizeSubtitleCues(cues, options = {}) {
    const normalized = [];
    for (const cue of cues) normalized.push(...normalizedSubtitleCueParts(cue, options));
    return normalized.sort((a, b) => a.start - b.start);
  }
  function normalizedSubtitleCueParts(cue, options) {
    const base = normalizedSubtitleCueBase(cue, options);
    if (!base) return [];
    const sentenceParts = splitCueDisplayText(base.text);
    if (sentenceParts.length <= 1) return [{ ...base, transcriptEligible: base.transcriptEligible }];
    const timedParts = distributeCueParts(base, sentenceParts);
    const normalized = timedParts.map((part) => normalizedSubtitleCuePart(base, part));
    return normalized.length ? normalized : [{ ...base, transcriptEligible: base.transcriptEligible }];
  }
  function normalizedSubtitleCueBase(cue, options) {
    const text = normalizeCaptionText(cue.text);
    if (!hasUsableSubtitleCueBounds(cue, text)) return null;
    const end = Math.max(cue.end, cue.start + MIN_SUBTITLE_CUE_DURATION_SECONDS);
    const words = exactSubtitleWords(cue, cue.start, end);
    return {
      ...cue,
      text,
      start: cue.start,
      end,
      originalText: cue.originalText ?? text,
      words,
      wordTimingsExact: Boolean(words?.length),
      transcriptEligible: options.transcriptEligible ?? cue.transcriptEligible ?? true
    };
  }
  function hasUsableSubtitleCueBounds(cue, text) {
    return Boolean(text && Number.isFinite(cue.start) && Number.isFinite(cue.end));
  }
  function normalizedSubtitleCuePart(base, part) {
    const partWords = sliceCueWords(base, part.start, part.end);
    return {
      start: part.start,
      end: part.end,
      text: part.text,
      originalText: base.originalText,
      words: partWords,
      wordTimingsExact: Boolean(partWords?.length),
      transcriptEligible: base.transcriptEligible
    };
  }
  function splitCueDisplayText(text) {
    const normalized = normalizeCaptionText(text);
    if (!normalized) return [];
    const sentenceParts = splitSentencesByPunctuation(normalized);
    if (sentenceParts.length > 1) return sentenceParts;
    if (displayTextWeight(normalized) <= 38) return [normalized];
    return splitOverlongCue(normalized);
  }
  function splitSentencesByPunctuation(text) {
    const parts = [];
    let start = 0;
    let offset = 0;
    for (const char of Array.from(text)) {
      offset += char.length;
      const end = subtitleSentenceBoundaryEnd(text, char, offset);
      if (end === null) continue;
      offset = end;
      pushSubtitleSentencePart(parts, text, start, offset);
      start = offset;
    }
    pushSubtitleSentencePart(parts, text, start, text.length);
    return parts.length ? parts : [text];
  }
  function subtitleSentenceBoundaryEnd(text, char, offset) {
    if (!isSubtitleSentencePunctuation(char)) return null;
    return consumeClosingSubtitlePunctuation(text, offset);
  }
  function isSubtitleSentencePunctuation(char) {
    return /[。！？!?]/u.test(char);
  }
  function consumeClosingSubtitlePunctuation(text, offset) {
    let end = offset;
    while (end < text.length && isSubtitleSentenceCloser(text[end])) end++;
    return end;
  }
  function isSubtitleSentenceCloser(char) {
    return /["'」』）\]]/u.test(char);
  }
  function pushSubtitleSentencePart(parts, text, start, end) {
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
  }
  function splitOverlongCue(text) {
    const parts = [];
    const tokens = overlongCueTokens(text);
    let current = "";
    for (const token of tokens) {
      if (shouldFlushOverlongCuePart(current, token)) {
        parts.push(current.trim());
        current = token.trimStart();
      } else {
        current += token;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return splitCuePartsOrOriginal(parts, text);
  }
  function overlongCueTokens(text) {
    return text.includes(" ") ? text.split(/(\s+)/u).filter(Boolean) : Array.from(text);
  }
  function shouldFlushOverlongCuePart(current, token) {
    return displayTextWeight(current + token) > 32 && Boolean(current.trim());
  }
  function splitCuePartsOrOriginal(parts, text) {
    return parts.length > 1 ? parts : [text];
  }
  function distributeCueParts(cue, parts) {
    const duration = Math.max(0.12, cue.end - cue.start);
    const weights = parts.map((part) => Math.max(1, displayTextWeight(part)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || parts.length;
    let cursor = cue.start;
    return parts.map((part, index) => {
      const partDuration = index === parts.length - 1 ? cue.end - cursor : duration * (weights[index] / totalWeight);
      const start = cursor;
      const end = index === parts.length - 1 ? cue.end : Math.min(cue.end, cursor + Math.max(0.12, partDuration));
      cursor = end;
      return { text: part, start, end: Math.max(end, start + 0.12) };
    });
  }
  function exactSubtitleWords(cue, start, end) {
    if (!cue.wordTimingsExact || !cue.words?.length) return void 0;
    const words = cue.words.filter((word) => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > start && word.start < end).map((word) => ({ ...word, start: clampNumber(word.start, start, end), end: clampNumber(word.end, start, end) })).filter((word) => word.end > word.start);
    return words.length ? words : void 0;
  }
  function sliceCueWords(cue, start, end) {
    return exactSubtitleWords(cue, start, end);
  }
  function renderKaraokeTextParts(text, progress) {
    const chars = Array.from(text);
    const split = clampNumber(Math.round(progress), 0, chars.length);
    const past = chars.slice(0, split).join("");
    const current = chars.slice(split, split + 1).join("");
    const upcoming = chars.slice(split + 1).join("");
    return [
      past ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-spoken">${escapeHtml(past)}</span>` : "",
      current ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-current">${escapeHtml(current)}</span>` : "",
      upcoming ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-pending">${escapeHtml(upcoming)}</span>` : ""
    ].join("");
  }
  function karaokeCharacterProgress(cue, words, time) {
    const total = compactTextLength(cue.text);
    const edgeProgress = karaokeEdgeProgress(cue, time, total);
    if (edgeProgress !== null) return edgeProgress;
    return karaokeTimedWordProgress(sortedSubtitleWords(words), total, time);
  }
  function karaokeEdgeProgress(cue, time, total) {
    if (!total) return 0;
    if (time <= cue.start) return 0;
    if (time >= cue.end) return total;
    return null;
  }
  function sortedSubtitleWords(words) {
    return [...words].filter(hasUsableSubtitleWordTiming).sort((a, b) => a.start - b.start);
  }
  function hasUsableSubtitleWordTiming(word) {
    return Boolean(word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end));
  }
  function karaokeTimedWordProgress(words, total, time) {
    let cursor = 0;
    for (const word of words) {
      const length = compactTextLength(word.text);
      if (!length) continue;
      if (time >= word.end) {
        cursor += length;
        continue;
      }
      if (time <= word.start) return Math.min(total, cursor);
      return karaokeProgressInsideWord(total, cursor, length, word, time);
    }
    return Math.min(total, cursor);
  }
  function karaokeProgressInsideWord(total, cursor, length, word, time) {
    const ratio = clampNumber((time - word.start) / Math.max(0.04, word.end - word.start), 0, 1);
    return Math.min(total, cursor + Math.max(1, Math.floor(length * ratio)));
  }
  function compactTextLength(text) {
    return Array.from(text.replace(/\s+/gu, "")).length;
  }
  function displayTextWeight(text) {
    return compactTextLength(text);
  }
  function parseVttCuePayload(raw, cueStart, cueEnd) {
    const timestampPattern = /<((?:(?:\d+:)?\d{2}:)?\d{2}[,.]\d{3})>/g;
    const markers = vttTimestampMarkers(raw, timestampPattern);
    const text = vttCueTextWithoutMarkers(raw, timestampPattern);
    if (!markers.length) return { text };
    return vttCuePayloadWithMarkers(raw, timestampPattern, markers, text, cueStart, cueEnd);
  }
  function vttCuePayloadWithMarkers(raw, timestampPattern, markers, text, cueStart, cueEnd) {
    const words = [];
    for (let index = 0; index < markers.length; index++) {
      const markerWord = vttMarkerWord(raw, timestampPattern, markers, index);
      if (!markerWord) continue;
      if (/\s/u.test(markerWord.text)) return { text };
      words.push(vttWordTiming(markerWord, cueStart, cueEnd));
    }
    return { text, words: words.length ? words : void 0, wordTimingsExact: Boolean(words.length) };
  }
  function vttTimestampMarkers(raw, timestampPattern) {
    const markers = [];
    raw.replace(timestampPattern, (match, rawTime, index) => {
      appendVttTimestampMarker(markers, match, rawTime, index);
      return match;
    });
    return markers;
  }
  function appendVttTimestampMarker(markers, match, rawTime, index) {
    const time = parseSubtitleTime(rawTime.includes(":") ? rawTime : `00:${rawTime}`);
    if (Number.isFinite(time)) markers.push({ time, index, endIndex: index + match.length });
  }
  function vttCueTextWithoutMarkers(raw, timestampPattern) {
    return raw.replace(timestampPattern, "").replace(/<[^>]+>/g, "").trim();
  }
  function vttMarkerWord(raw, timestampPattern, markers, index) {
    const marker = markers[index];
    const next = markers[index + 1];
    const segmentRaw = raw.slice(marker.endIndex, next?.index ?? raw.length).replace(timestampPattern, "").replace(/<[^>]+>/g, "");
    const segmentText = segmentRaw.trim();
    return segmentText ? { text: segmentText, start: marker.time, end: next?.time ?? Number.POSITIVE_INFINITY } : null;
  }
  function vttWordTiming(markerWord, cueStart, cueEnd) {
    const start = clampNumber(markerWord.start, cueStart, cueEnd);
    const end = clampNumber(markerWord.end, cueStart, cueEnd);
    return { text: markerWord.text, start, end: Math.max(start + 0.04, end) };
  }
  function parseSubtitleText(text, options = {}) {
    const normalizedText = text.replace(/^\uFEFF/, "");
    return parseKnownSubtitleText(normalizedText, options) ?? parseVttSubtitleText(normalizedText, options);
  }
  function parseKnownSubtitleText(text, options) {
    const youtubeJson = parseYouTubeJson3SubtitleText(text, options);
    if (youtubeJson.length) return youtubeJson;
    const youtubeXml = parseYouTubeXmlSubtitleText(text, options);
    if (youtubeXml.length) return youtubeXml;
    return looksLikeAssSubtitleText(text) ? parseAssSubtitleText(text) : void 0;
  }
  function looksLikeAssSubtitleText(text) {
    return /^\s*\[Script Info\]/im.test(text) || /^\s*Dialogue:/im.test(text);
  }
  function parseVttSubtitleText(text, options) {
    const cues = text.replace(/\r/g, "").replace(/^WEBVTT.*?\n\n/s, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map(readVttCueBlock).filter((cue) => Boolean(cue));
    const sorted = cues.sort((a, b) => a.start - b.start);
    return options.smoothYouTubeFragments ? smoothFragmentedYouTubeCues(sorted) : sorted;
  }
  function readVttCueBlock(block) {
    const lines = block.split("\n").filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) return null;
    const [startRaw, endRaw] = lines[timeIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseSubtitleTime(startRaw);
    const end = parseSubtitleTime(endRaw);
    const payload = parseVttCuePayload(lines.slice(timeIndex + 1).join("\n"), start, end);
    return Number.isFinite(start) && Number.isFinite(end) && payload.text ? { start, end, text: payload.text, words: payload.words, wordTimingsExact: payload.wordTimingsExact } : null;
  }
  function parseYouTubeJson3SubtitleText(text, options = {}) {
    if (!/^\s*\{/.test(text)) return [];
    try {
      const parsed = JSON.parse(text);
      const sorted = parseYouTubeJson3Events(parsed.events ?? [], options);
      return smoothFragmentedYouTubeCues(normalizeYouTubeAutoCaptionTiming(sorted, options.youtubeAutoGenerated === true));
    } catch {
      return [];
    }
  }
  function parseYouTubeJson3Events(events, options) {
    return events.map((event) => readYouTubeJson3Cue(event, options)).filter((cue) => Boolean(cue)).sort((a, b) => a.start - b.start);
  }
  function readYouTubeJson3Cue(event, options) {
    const start = Number(event.tStartMs ?? Number.NaN) / 1e3;
    const duration = Number(event.dDurationMs ?? 0) / 1e3;
    const end = start + Math.max(duration, 0.75);
    const text = youtubeJson3CueText(event.segs ?? []);
    if (!isUsableYouTubeJson3Cue(start, end, text)) return null;
    const words = options.youtubeAutoGenerated ? void 0 : youtubeJson3WordTimings(event.segs ?? [], start, end);
    return { start, end, text, words, wordTimingsExact: Boolean(words?.length) };
  }
  function youtubeJson3CueText(segs) {
    return segs.map((seg) => seg.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
  }
  function isUsableYouTubeJson3Cue(start, end, text) {
    return Number.isFinite(start) && Number.isFinite(end) && Boolean(text);
  }
  function youtubeJson3WordTimings(segs, cueStart, cueEnd) {
    const visible = segs.map((seg) => ({ text: seg.utf8 ?? "", offset: Number(seg.tOffsetMs) })).filter((seg) => seg.text.trim());
    const timed = visible.filter((seg) => Number.isFinite(seg.offset) && !/\s/u.test(seg.text.trim()));
    if (!timed.length || timed.length !== visible.length) return void 0;
    return timed.map((seg, index) => {
      const nextOffset = timed[index + 1]?.offset;
      const start = cueStart + seg.offset / 1e3;
      const end = nextOffset === void 0 ? cueEnd : cueStart + nextOffset / 1e3;
      return { text: seg.text, start: clampNumber(start, cueStart, cueEnd), end: clampNumber(end, cueStart, cueEnd) };
    }).filter((word) => word.end > word.start);
  }
  function parseYouTubeXmlSubtitleText(text, options = {}) {
    if (!looksLikeYouTubeXmlSubtitleText(text)) return [];
    try {
      const document2 = parseXmlDocument(text, "text/xml");
      const srv3 = parseYouTubeSrv3Rows(document2, options);
      const cues = [
        ...parseYouTubeTimedTextElements(document2),
        ...parseYouTubeTtmlParagraphs(document2),
        ...srv3.cues
      ];
      const sorted = cues.sort((a, b) => a.start - b.start);
      const autoGenerated = isYouTubeXmlAutoGenerated(options, srv3, sorted);
      const normalized = normalizeYouTubeAutoCaptionTiming(sorted, autoGenerated);
      return autoGenerated ? normalized : smoothFragmentedYouTubeCues(normalized);
    } catch {
      return [];
    }
  }
  function looksLikeYouTubeXmlSubtitleText(text) {
    return /^\s*</.test(text) && /(<text\b|<p\b)/i.test(text);
  }
  function isYouTubeXmlAutoGenerated(options, srv3, cues) {
    return options.youtubeAutoGenerated === true || srv3.sawLineBoundary || looksLikeOverlappingAutoGeneratedCues(cues);
  }
  function parseYouTubeTimedTextElements(document2) {
    return Array.from(document2.querySelectorAll("text[start]")).map(readYouTubeTimedTextCue).filter((cue) => Boolean(cue));
  }
  function readYouTubeTimedTextCue(element) {
    const start = Number(element.getAttribute("start"));
    const duration = Number(element.getAttribute("dur") ?? 0);
    const text = normalizeCaptionText(element.textContent ?? "");
    return Number.isFinite(start) && text ? { start, end: start + Math.max(duration, 0.75), text } : null;
  }
  function parseYouTubeTtmlParagraphs(document2) {
    return Array.from(document2.querySelectorAll("p[begin]")).map(readYouTubeTtmlCue).filter((cue) => Boolean(cue));
  }
  function readYouTubeTtmlCue(element) {
    const start = parseSubtitleClockValue(element.getAttribute("begin") ?? "");
    const end = parseSubtitleClockValue(element.getAttribute("end") ?? "");
    const text = normalizeCaptionText(element.textContent ?? "");
    return Number.isFinite(start) && Number.isFinite(end) && text ? { start, end, text } : null;
  }
  function parseYouTubeSrv3Rows(document2, options) {
    const rows = Array.from(document2.querySelectorAll("p[t], p[_t]"));
    let sawLineBoundary = false;
    const cues = [];
    for (let index = 0; index < rows.length; index++) {
      const result = readYouTubeSrv3Row(rows[index], rows[index + 1], options);
      sawLineBoundary ||= result.sawLineBoundary;
      if (result.cue) cues.push(result.cue);
    }
    return { cues, sawLineBoundary };
  }
  function readYouTubeSrv3Row(element, nextElement, options) {
    const timing = youtubeSrv3Timing(element, nextElement);
    const words = youtubeSrv3Words(element, timing, options);
    const text = youtubeSrv3CueText(element, words);
    return {
      cue: Number.isFinite(timing.start) && text ? youtubeSrv3Cue(timing, text, words) : null,
      sawLineBoundary: Number.isFinite(timing.nextLineBoundary)
    };
  }
  function youtubeSrv3Timing(element, nextElement) {
    const startMs = Number(youtubeSrv3StartAttribute(element));
    const durationMs = Number(element.getAttribute("d") ?? element.getAttribute("_d") ?? 0);
    const start = startMs / 1e3;
    const nextLineBoundary = youtubeSrv3LineBoundaryTime(nextElement);
    const rawEnd = start + Math.max(durationMs / 1e3, 0.75);
    return {
      start,
      end: youtubeSrv3CueEnd(start, rawEnd, nextLineBoundary),
      nextLineBoundary
    };
  }
  function youtubeSrv3CueEnd(start, rawEnd, nextLineBoundary) {
    return Number.isFinite(nextLineBoundary) && nextLineBoundary > start ? Math.min(rawEnd, nextLineBoundary) : rawEnd;
  }
  function youtubeSrv3Words(element, timing, options) {
    return shouldReadYouTubeSrv3WordTimings(options, timing.nextLineBoundary) ? parseYouTubeSrv3WordNodes(element, timing.start, timing.end) : [];
  }
  function shouldReadYouTubeSrv3WordTimings(options, nextLineBoundary) {
    return !options.youtubeAutoGenerated && !Number.isFinite(nextLineBoundary);
  }
  function youtubeSrv3CueText(element, words) {
    return normalizeCaptionText(words.length ? words.map((word) => word.text).join("") : element.textContent ?? "");
  }
  function youtubeSrv3Cue(timing, text, words) {
    return {
      start: timing.start,
      end: timing.end,
      text,
      words: words.length ? words : void 0,
      wordTimingsExact: Boolean(words.length)
    };
  }
  function youtubeSrv3LineBoundaryTime(element) {
    if (!element) return Number.NaN;
    if (!isYouTubeSrv3LineBoundaryText(element.textContent ?? "")) return Number.NaN;
    const startMs = Number(youtubeSrv3StartAttribute(element));
    return Number.isFinite(startMs) ? startMs / 1e3 : Number.NaN;
  }
  function isYouTubeSrv3LineBoundaryText(text) {
    return text === "\n" || !text.trim();
  }
  function youtubeSrv3StartAttribute(element) {
    return element.getAttribute("t") ?? element.getAttribute("_t");
  }
  function normalizeYouTubeAutoCaptionTiming(cues, knownAutoGenerated) {
    if (!cues.length) return cues;
    const probablyAutoGenerated = knownAutoGenerated || looksLikeOverlappingAutoGeneratedCues(cues);
    if (!probablyAutoGenerated) return cues;
    return cues.map((cue, index) => {
      const next = cues[index + 1];
      const nextStart = next?.start;
      const end = Number.isFinite(nextStart) && nextStart > cue.start ? Math.max(cue.start, Math.min(cue.end, nextStart - 1e-3)) : cue.end;
      return {
        ...cue,
        end,
        words: void 0,
        wordTimingsExact: false
      };
    });
  }
  function looksLikeOverlappingAutoGeneratedCues(cues) {
    const sampled = cues.slice(0, 80);
    if (sampled.length < 3) return false;
    let overlapping = 0;
    for (let index = 1; index < sampled.length; index++) {
      if (sampled[index - 1].end > sampled[index].start + 0.05) overlapping += 1;
    }
    return overlapping / sampled.length > 0.5;
  }
  function smoothFragmentedYouTubeCues(cues) {
    if (!shouldSmoothFragmentedYouTubeCues(cues)) return cues;
    const merged = [];
    let current;
    for (const cue of cues) {
      current = mergeYouTubeFragmentIntoGroup(merged, current, cue);
    }
    if (current) merged.push(current);
    return merged;
  }
  function shouldSmoothFragmentedYouTubeCues(cues) {
    return cues.length >= 3 && looksLikeFragmentedYouTubeCues(cues);
  }
  function mergeYouTubeFragmentIntoGroup(merged, current, cue) {
    const normalized = normalizeYouTubeCueFragment(cue);
    if (!normalized.text) return current;
    if (!current) {
      return pushCurrentYouTubeCueGroup(merged, current, normalized);
    }
    if (shouldBreakYouTubeLine(current, normalized)) return pushCurrentYouTubeCueGroup(merged, current, normalized);
    return mergeYouTubeCueFragments(current, normalized);
  }
  function normalizeYouTubeCueFragment(cue) {
    const hasExactWords = cueHasExactWordTimings(cue);
    return {
      ...cue,
      text: normalizeCaptionText(cue.text),
      words: hasExactWords ? cue.words : void 0,
      wordTimingsExact: hasExactWords
    };
  }
  function pushCurrentYouTubeCueGroup(merged, current, next) {
    if (current) merged.push(current);
    return next;
  }
  function looksLikeFragmentedYouTubeCues(cues) {
    const sampled = cues.slice(0, 80);
    const fragments = sampled.filter((cue) => displayTextWeight(cue.text) <= 14 || cue.end - cue.start <= 1.35).length;
    return fragments / sampled.length >= 0.42;
  }
  function shouldBreakYouTubeLine(current, next) {
    const gap = next.start - current.end;
    if (isYouTubeContinuationFragment(current, next)) return false;
    return gap > 2.6 || gap < -0.2 && !isProgressiveYouTubeCaption(current.text, next.text) || hasYouTubeLineBreakText(current);
  }
  function hasYouTubeLineBreakText(cue) {
    return /[。！？!?]$/u.test(cue.text.trim()) || cue.end - cue.start >= 12 || displayTextWeight(cue.text) >= 68;
  }
  function isYouTubeContinuationFragment(current, next) {
    return isTrailingPunctuationFragment(next.text) || isShortYouTubeContinuationFragment(next.text) || hasYouTubeCaptionTextOverlap(current.text, next.text);
  }
  function mergeYouTubeCueFragments(current, next) {
    const progressive = isProgressiveYouTubeCaption(current.text, next.text);
    const overlap = progressive ? 0 : youtubeCaptionTextOverlapLength(current.text, next.text);
    const text = progressive ? next.text : mergeYouTubeCaptionFragmentText(current.text, next.text);
    const words = mergedYouTubeCueWords(current, next, { progressive, overlap });
    return {
      ...current,
      end: Math.max(current.end, next.end),
      text,
      originalText: text,
      words,
      wordTimingsExact: Boolean(words?.length)
    };
  }
  function mergedYouTubeCueWords(current, next, merge) {
    const words = youtubeCueMergeWords(current, next);
    if (merge.progressive) return words.next;
    if (!canMergeYouTubeCueWords(words.current, words.next, next.text)) return void 0;
    return [...words.current, ...trimmedNextYouTubeCueWords(words.next, merge.overlap)];
  }
  function youtubeCueMergeWords(current, next) {
    return {
      current: cueHasExactWordTimings(current) ? current.words : void 0,
      next: cueHasExactWordTimings(next) ? next.words : void 0
    };
  }
  function trimmedNextYouTubeCueWords(words, overlap) {
    return words ? subtitleWordsAfterCompactOffset(words, overlap) : [];
  }
  function canMergeYouTubeCueWords(currentWords, nextWords, nextText) {
    return Boolean(currentWords && (nextWords || isTrailingPunctuationFragment(nextText)));
  }
  function mergeYouTubeCaptionFragmentText(left, right) {
    const a = left.trim();
    const b = right.trim();
    const overlap = youtubeCaptionTextOverlapLength(a, b);
    if (overlap > 0) {
      const tail = sliceByCompactOffset(b, overlap);
      return tail ? joinYouTubeCaptionFragments(a, tail) : a;
    }
    return joinYouTubeCaptionFragments(a, b);
  }
  function isProgressiveYouTubeCaption(current, next) {
    const compactCurrent = compactCaptionText(current);
    const compactNext = compactCaptionText(next);
    return compactCurrent.length >= 2 && compactNext.length > compactCurrent.length && compactNext.startsWith(compactCurrent);
  }
  function joinYouTubeCaptionFragments(left, right) {
    const a = left.trim();
    const b = right.trim();
    const emptyJoin = emptyYouTubeCaptionFragmentJoin(a, b);
    if (emptyJoin !== null) return emptyJoin;
    return `${a}${youtubeCaptionFragmentSeparator(a, b)}${b}`;
  }
  function emptyYouTubeCaptionFragmentJoin(left, right) {
    if (!left) return right;
    return right ? null : left;
  }
  function youtubeCaptionFragmentSeparator(left, right) {
    if (shouldJoinYouTubeCaptionFragmentsDirectly(left, right)) return "";
    return shouldSpaceYouTubeCaptionFragments(left, right) ? " " : "";
  }
  function shouldJoinYouTubeCaptionFragmentsDirectly(left, right) {
    return /^[、。，．！？!?））」』\]}]/u.test(right) || /[\s「『（([{]$/u.test(left);
  }
  function shouldSpaceYouTubeCaptionFragments(left, right) {
    return /[A-Za-z0-9]$/u.test(left) && /^[A-Za-z0-9]/u.test(right);
  }
  function isTrailingPunctuationFragment(text) {
    return /^[、。，．！？!?…・]+$/u.test(text.trim());
  }
  function isShortYouTubeContinuationFragment(text) {
    const compact = compactCaptionText(text);
    return compact.length <= 3 && /^[っッゃゅょぁぃぅぇぉャュョァィゥェォー〜、。，．！？!?…・んン]+$/u.test(compact);
  }
  function hasYouTubeCaptionTextOverlap(left, right) {
    return youtubeCaptionTextOverlapLength(left, right) >= Math.min(6, compactCaptionText(right).length);
  }
  function youtubeCaptionTextOverlapLength(left, right) {
    const a = compactCaptionText(left);
    const b = compactCaptionText(right);
    const max = Math.min(a.length, b.length);
    for (let length = max; length >= 2; length--) {
      if (a.endsWith(b.slice(0, length))) return length;
    }
    return 0;
  }
  function compactCaptionText(text) {
    return text.replace(/\s+/gu, "");
  }
  function subtitleWordsAfterCompactOffset(words, compactOffset) {
    if (compactOffset <= 0) return words;
    let cursor = 0;
    return words.filter((word) => {
      const start = cursor;
      cursor += compactTextLength(word.text);
      return start >= compactOffset;
    });
  }
  function sliceByCompactOffset(text, compactOffset) {
    if (compactOffset <= 0) return text;
    for (const step of compactTextOffsetSteps(text)) {
      if (step.seen >= compactOffset) return text.slice(step.index);
    }
    return "";
  }
  function compactTextOffsetSteps(text) {
    const steps = [];
    let index = 0;
    let seen = 0;
    for (const char of Array.from(text)) {
      index += char.length;
      if (/\s/u.test(char)) continue;
      steps.push({ index, seen: ++seen });
    }
    return steps;
  }
  function parseYouTubeSrv3WordNodes(element, cueStart, cueEnd) {
    const nodes = Array.from(element.querySelectorAll("s"));
    if (!nodes.length) return [];
    if (nodes.some((node) => /\s/u.test((node.textContent ?? "").trim()))) return [];
    const starts = nodes.map((node) => youtubeSrv3WordStart(node, cueStart));
    return nodes.map((node, index) => readYouTubeSrv3WordTiming(node, index, starts, cueStart, cueEnd)).filter((word) => Boolean(word?.text.trim() && word.end > word.start));
  }
  function youtubeSrv3WordStart(node, cueStart) {
    const raw = Number(node.getAttribute("t") ?? node.getAttribute("_t"));
    return Number.isFinite(raw) ? cueStart + raw / 1e3 : Number.NaN;
  }
  function readYouTubeSrv3WordTiming(node, index, starts, cueStart, cueEnd) {
    const text = node.textContent ?? "";
    if (!text) return null;
    const start = Number.isFinite(starts[index]) ? starts[index] : cueStart;
    const end = nextYouTubeSrv3WordEnd(starts, index, cueEnd);
    return { text, start: clampNumber(start, cueStart, cueEnd), end: clampNumber(end, cueStart, cueEnd) };
  }
  function nextYouTubeSrv3WordEnd(starts, index, cueEnd) {
    const nextStart = starts.slice(index + 1).find(Number.isFinite);
    return typeof nextStart === "number" && Number.isFinite(nextStart) ? nextStart : cueEnd;
  }
  function parseAssSubtitleText(text) {
    const state = createAssParseState();
    for (const rawLine of text.replace(/\r/g, "").split("\n")) {
      readAssSubtitleLine(rawLine.trim(), state);
    }
    return state.cues.sort((a, b) => a.start - b.start);
  }
  function createAssParseState() {
    return {
      cues: [],
      inEvents: false,
      format: ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"]
    };
  }
  function readAssSubtitleLine(line, state) {
    if (!shouldParseAssCueLine(line, state)) return;
    const cue = readAssDialogueCue(line, state.format);
    if (cue) state.cues.push(cue);
  }
  function shouldParseAssCueLine(line, state) {
    if (shouldIgnoreAssLine(line)) return false;
    if (updateAssSectionState(line, state)) return false;
    if (!shouldReadAssDialogueLine(line, state)) return false;
    return !readAssFormatLine(line, state);
  }
  function shouldReadAssDialogueLine(line, state) {
    return state.inEvents || /^Dialogue:/i.test(line);
  }
  function shouldIgnoreAssLine(line) {
    return !line || line.startsWith(";");
  }
  function updateAssSectionState(line, state) {
    if (/^\[Events\]/i.test(line)) {
      state.inEvents = true;
      return true;
    }
    if (/^\[.+\]/.test(line)) {
      state.inEvents = false;
      return true;
    }
    return false;
  }
  function readAssFormatLine(line, state) {
    if (!/^Format:/i.test(line)) return false;
    state.format = line.slice(line.indexOf(":") + 1).split(",").map((part) => part.trim().toLowerCase());
    return true;
  }
  function readAssDialogueCue(line, format) {
    if (!/^Dialogue:/i.test(line)) return null;
    const values = splitAssDialogue(line.slice(line.indexOf(":") + 1), format.length);
    const fields = assDialogueFields(values, format);
    const start = parseSubtitleTime(fields.start);
    const end = parseSubtitleTime(fields.end);
    const cueText = cleanAssSubtitleText(fields.text);
    return Number.isFinite(start) && Number.isFinite(end) && cueText ? { start, end, text: cueText } : null;
  }
  function assDialogueFields(values, format) {
    const textIndex = format.indexOf("text");
    return {
      start: values[format.indexOf("start")] ?? "",
      end: values[format.indexOf("end")] ?? "",
      text: values.slice(textIndex >= 0 ? textIndex : values.length - 1).join(",")
    };
  }
  function splitAssDialogue(value, fieldCount) {
    const parts = [];
    let start = 0;
    const maxSplits = Math.max(0, fieldCount - 1);
    for (let index = 0; index < value.length && parts.length < maxSplits; index++) {
      if (value[index] !== ",") continue;
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
    parts.push(value.slice(start).trim());
    return parts;
  }
  function cleanAssSubtitleText(value) {
    return value.replace(/\{[^}]*}/g, "").replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ").replace(/<[^>]+>/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }
  function parseSubtitleTime(value) {
    const match = value.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/);
    if (!match) return Number.NaN;
    const [, hours = "0", minutes, seconds, fraction = "0"] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, "0")) / 1e3;
  }
  function parseSubtitleClockValue(value) {
    const trimmed = value.trim();
    if (!trimmed) return Number.NaN;
    if (/^\d+(?:\.\d+)?s$/i.test(trimmed)) return Number(trimmed.slice(0, -1));
    if (/^\d+(?:\.\d+)?ms$/i.test(trimmed)) return Number(trimmed.slice(0, -2)) / 1e3;
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return parseSubtitleTime(trimmed);
  }
  function formatSubtitleTime(value) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  function findAlignedCue(cues, cue) {
    return cues.map((item) => ({
      item,
      overlap: Math.max(0, Math.min(cue.end, item.end) - Math.max(cue.start, item.start)),
      startDistance: Math.abs(cue.start - item.start)
    })).filter((candidate) => candidate.overlap > 0 || candidate.startDistance <= 0.45).sort((a, b) => b.overlap - a.overlap || a.startDistance - b.startDistance)[0]?.item;
  }
  function findActiveSubtitleCue(cues, time) {
    return findActiveSubtitleCueFromIndex(cues, time, latestSubtitleCueStartIndex(cues, time));
  }
  function findActiveSubtitleCueFromIndex(cues, time, index) {
    let best;
    for (let i = index; i >= 0; i--) {
      const result = activeSubtitleCueSearchResult(cues[i], time, best);
      best = result.best;
      if (result.done) break;
    }
    return best;
  }
  function activeSubtitleCueSearchResult(cue, time, best) {
    if (shouldStopActiveSubtitleCueSearch(cue, best)) return { best, done: true };
    if (!isSubtitleCueActiveAtTime(cue, time)) return { best, done: false };
    return {
      best: isBetterActiveSubtitleCue(cue, best) ? cue : best,
      done: false
    };
  }
  function latestSubtitleCueStartIndex(cues, time) {
    let low = 0;
    let high = cues.length - 1;
    let index = -1;
    const latestAllowedStart = time + ACTIVE_CUE_START_TOLERANCE_SECONDS;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (cues[mid].start <= latestAllowedStart) {
        index = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return index;
  }
  function shouldStopActiveSubtitleCueSearch(cue, best) {
    return Boolean(best && cue.start < best.start);
  }
  function isSubtitleCueActiveAtTime(cue, time) {
    return time >= cue.start - ACTIVE_CUE_START_TOLERANCE_SECONDS && time < cue.end + ACTIVE_CUE_END_GRACE_SECONDS;
  }
  function isBetterActiveSubtitleCue(cue, best) {
    if (!best) return true;
    if (cue.start > best.start) return true;
    return cue.start === best.start && cue.end > best.end;
  }
  function subtitleCueSignature(cue) {
    return `${cue.start.toFixed(2)}:${cue.end.toFixed(2)}:${cue.text.trim()}`;
  }
  function cueHasExactWordTimings(cue) {
    return Boolean(cue?.wordTimingsExact && cue.words?.length);
  }
  function normalizeCaptionText(value) {
    return value.replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  }
  function escapeWithBreaks(value) {
    return withBreaks(escapeHtml(value));
  }
  function withBreaks(value) {
    return value.replace(/\n/g, "<br>");
  }
  const SUBTITLE_MIN_VISIBLE_VIDEO_RATIO = 0.2;
  const SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH = 120;
  const SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT = 80;
  const TRANSCRIPT_PLACEMENTS = ["left", "bottom", "right"];
  function renderPanelNavigationControls(enabled, language) {
    const previous = uiText(language, "previousSubtitle");
    const next = uiText(language, "nextSubtitle");
    return `
        <div class="jpdb-subtitle-panel-nav" aria-label="${escapeHtml(uiText(language, "subtitleNavigation"))}">
            <button type="button" data-action="previous" title="${escapeHtml(previous)}" aria-label="${escapeHtml(previous)}" ${enabled ? "" : "disabled"}>‹</button>
            <button type="button" data-action="next" title="${escapeHtml(next)}" aria-label="${escapeHtml(next)}" ${enabled ? "" : "disabled"}>›</button>
        </div>
    `;
  }
  function renderPanelModeControls(mode, canShowLines, language) {
    return `
        <div class="jpdb-subtitle-panel-mode" aria-label="${escapeHtml(uiText(language, "subtitlePanelMode"))}">
            <button type="button" data-action="panel-lines" aria-pressed="${mode === "lines"}" ${canShowLines ? "" : "disabled"}>${escapeHtml(uiText(language, "subtitleLines"))}</button>
            <button type="button" data-action="panel-tracks" aria-pressed="${mode === "tracks"}">${escapeHtml(uiText(language, "subtitleTracks"))}</button>
        </div>
    `;
  }
  function renderPausePanelToggle(enabled, language) {
    const label = uiText(language, enabled ? "disableSubtitleAutoHide" : "enableSubtitleAutoHide");
    return `
        <button class="jpdb-subtitle-drawer-auto" type="button" data-action="toggle-pause-panel" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${enabled}">
            ${subtitleIcon("auto-hide")}
            <span>${escapeHtml(uiText(language, "subtitleAutoHideShort"))}</span>
        </button>
    `;
  }
  function renderPanelPlacementControls(currentPlacement, language) {
    const label = uiText(language, "subtitleTranscriptPlacement");
    return `
        <div class="jpdb-subtitle-panel-placement" role="group" aria-label="${escapeHtml(label)}">
            ${TRANSCRIPT_PLACEMENTS.map((placement) => renderPanelPlacementButton(placement, currentPlacement, label, language)).join("")}
        </div>
    `;
  }
  function renderPanelPlacementButton(placement, currentPlacement, groupLabel, language) {
    const placementLabel = uiText(language, placement);
    const label = `${groupLabel}: ${placementLabel}`;
    return `<button type="button" data-action="transcript-placement" data-placement="${placement}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${placement === currentPlacement}">${subtitleIcon(transcriptPlacementIcon(placement))}</button>`;
  }
  function subtitleOverlayLayout(rect) {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const minWidth = Math.min(260, viewportWidth);
    const minHeight = Math.min(160, viewportHeight);
    const overflowX = rect.left < 0 || rect.right > viewportWidth;
    const overflowY = rect.top < 0 || rect.bottom > viewportHeight;
    const left = overlayAxisStart(rect.left, rect.right, viewportWidth, minWidth, overflowX);
    const top = overlayAxisStart(rect.top, rect.bottom, viewportHeight, minHeight, overflowY);
    return {
      left,
      top,
      width: overlayAxisSize(rect.left, rect.right, viewportWidth, minWidth, overflowX, left),
      height: overlayAxisSize(rect.top, rect.bottom, viewportHeight, minHeight, overflowY, top)
    };
  }
  function applyElementLayout(element, layout) {
    setStylePropertyIfChanged(element, "left", `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(element, "top", `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(element, "right", "auto");
    setStylePropertyIfChanged(element, "bottom", "auto");
    setStylePropertyIfChanged(element, "width", `${Math.round(layout.width)}px`);
    setStylePropertyIfChanged(element, "height", `${Math.round(layout.height)}px`);
  }
  function setStylePropertyIfChanged(element, property, value) {
    if (element.style.getPropertyValue(property) === value) return;
    element.style.setProperty(property, value);
  }
  function transcriptPlacementIcon(placement) {
    if (placement === "left") return "panel-left";
    if (placement === "bottom") return "panel-bottom";
    return "panel-right";
  }
  function subtitleIcon(name) {
    const paths = {
      "auto-hide": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/><path d="M8 9v6"/><path d="M11 9v6"/>',
      close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
      copy: '<path d="M14 3H6a2 2 0 0 0-2 2v12"/><path d="M10 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M14 11v6"/><path d="M11 14h6"/>',
      eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
      menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
      "panel-bottom": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
      "panel-left": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
      "panel-right": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
      play: '<path d="M8 5v14l11-7-11-7Z"/>',
      tracks: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>',
      transcript: '<path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>'
    };
    return `<svg class="jpdb-subtitle-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  }
  function compareSubtitleVideoCandidates(a, b) {
    return videoElementVisibleArea(b) - videoElementVisibleArea(a) || videoElementArea(b) - videoElementArea(a);
  }
  function isSubtitleOverlayVideoVisible(rect) {
    const visible = rectViewportIntersection(rect);
    if (visible.width < SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH || visible.height < SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT) return false;
    const area = rectArea$1(rect);
    return area > 0 && rectArea$1(visible) / area >= SUBTITLE_MIN_VISIBLE_VIDEO_RATIO;
  }
  function overlayAxisStart(start, end, viewportSize, minSize, overflow) {
    if (!overflow) return start;
    const visibleStart = clampNumber(start, 0, Math.max(0, viewportSize - 1));
    const visibleEnd = clampNumber(end, visibleStart, viewportSize);
    const size = Math.max(minSize, visibleEnd - visibleStart || viewportSize);
    return clampNumber(visibleStart, 0, Math.max(0, viewportSize - size));
  }
  function overlayAxisSize(start, end, viewportSize, minSize, overflow, clampedStart) {
    if (!overflow) return Math.max(minSize, end - start);
    const visibleEnd = clampNumber(end, clampedStart, viewportSize);
    return Math.max(minSize, visibleEnd - clampedStart);
  }
  function videoElementArea(video) {
    const rect = video.getBoundingClientRect();
    return rect.width * rect.height;
  }
  function videoElementVisibleArea(video) {
    return rectViewportIntersectionArea$1(video.getBoundingClientRect());
  }
  function rectViewportIntersectionArea$1(rect) {
    return rectArea$1(rectViewportIntersection(rect));
  }
  function rectViewportIntersection(rect) {
    const left = clampNumber(rect.left, 0, window.innerWidth);
    const top = clampNumber(rect.top, 0, window.innerHeight);
    const right = clampNumber(rect.right, left, window.innerWidth);
    const bottom = clampNumber(rect.bottom, top, window.innerHeight);
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  }
  function rectArea$1(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  const TRANSCRIPT_PANEL_MARGIN = 10;
  const TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT = 220;
  const TRANSCRIPT_PANEL_SIZE_KEY = "jpdb-reader-transcript-panel-size";
  const TRANSCRIPT_PANEL_MAX_BOTTOM_VIEWPORT_RATIO = 0.5;
  const TRANSCRIPT_PANEL_MIN_BOTTOM_PLAYER_HEIGHT = 280;
  function computeSubtitleDrawerLayout(options) {
    const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
    const size = options.size ?? {};
    const preferredPlacement = options.preferredPlacement ?? "right";
    return options.compactPanel || preferredPlacement === "bottom" ? compactSubtitleDrawerLayout(options, size, margin) : sideSubtitleDrawerLayout(options, size, margin, preferredPlacement);
  }
  function compactSubtitleDrawerLayout(options, size, margin) {
    const maxHeight = maxTranscriptBottomPanelHeight(options.viewportHeight, margin);
    const height = clampNumber(
      size.bottomHeight ?? Math.min(420, options.viewportHeight * 0.46),
      TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
      maxHeight
    );
    return {
      placement: "bottom",
      left: margin,
      top: Math.max(margin, options.viewportHeight - height - margin),
      width: options.viewportWidth - margin * 2,
      height,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      margin
    };
  }
  function maxTranscriptBottomPanelHeight(viewportHeight, margin = TRANSCRIPT_PANEL_MARGIN) {
    const viewportMax = Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT, viewportHeight - margin * 3);
    const ratioMax = Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT, viewportHeight * TRANSCRIPT_PANEL_MAX_BOTTOM_VIEWPORT_RATIO);
    const playerMax = Math.max(
      TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
      viewportHeight - Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_PLAYER_HEIGHT, viewportHeight * 0.38) - margin * 2
    );
    return Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT, Math.min(viewportMax, ratioMax, playerMax));
  }
  function sideSubtitleDrawerLayout(options, size, margin, preferredPlacement) {
    const top = clampNumber(options.anchorTop ?? 72, margin, Math.max(margin, options.viewportHeight - 280));
    const width = clampNumber(
      size.sideWidth ?? Math.min(460, options.viewportWidth * 0.32),
      340,
      Math.max(340, options.viewportWidth - margin * 3)
    );
    const placement = preferredPlacement === "left" ? "left" : "right";
    return {
      placement,
      left: placement === "left" ? margin : Math.max(margin, options.viewportWidth - width - margin),
      top,
      width,
      height: Math.max(260, options.viewportHeight - top - margin),
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      margin,
      maxWidth: Math.max(340, options.viewportWidth - margin * 3)
    };
  }
  function shouldUseCompactSubtitleDrawer(viewportWidth) {
    return viewportWidth < 700;
  }
  function applyTranscriptPanelLayout(panel, layout) {
    setStylePropertyIfChanged(panel, "position", "fixed");
    setStylePropertyIfChanged(panel, "left", `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(panel, "top", `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(panel, "right", "auto");
    setStylePropertyIfChanged(panel, "bottom", "auto");
    setStylePropertyIfChanged(panel, "box-sizing", "border-box");
    setStylePropertyIfChanged(panel, "z-index", "2147483645");
    setStylePropertyIfChanged(panel, "pointer-events", "auto");
    setStylePropertyIfChanged(panel, "width", `${Math.round(Math.max(260, Math.min(layout.width, layout.viewportWidth - layout.margin * 2)))}px`);
    const minHeight = layout.placement === "bottom" ? 80 : 150;
    const height = `${Math.round(Math.max(minHeight, layout.height))}px`;
    setStylePropertyIfChanged(panel, "height", height);
    setStylePropertyIfChanged(panel, "max-height", height);
  }
  function loadTranscriptPanelSize() {
    try {
      const parsed = gmStorageGetSync(TRANSCRIPT_PANEL_SIZE_KEY, {});
      return {
        sideWidth: Number.isFinite(parsed.sideWidth) ? parsed.sideWidth : void 0,
        bottomHeight: Number.isFinite(parsed.bottomHeight) ? parsed.bottomHeight : void 0
      };
    } catch {
      return {};
    }
  }
  function saveTranscriptPanelSize(size) {
    try {
      gmStorageSetSync(TRANSCRIPT_PANEL_SIZE_KEY, size);
    } catch {
    }
  }
  function collectPageSubtitleSources(root = document) {
    const pageTitle = pageSubtitleTitle(root);
    return dedupeSubtitleSources([
      ...collectTrackSubtitleSources(root, pageTitle),
      ...collectLinkSubtitleSources(root, pageTitle)
    ]);
  }
  function collectTrackSubtitleSources(root, pageTitle) {
    return Array.from(root.querySelectorAll("track[src]")).map((track) => subtitleSourceFromTrack(track, pageTitle)).filter((source) => Boolean(source));
  }
  function subtitleSourceFromTrack(track, pageTitle) {
    if (!isSubtitleTrackElement(track)) return null;
    const url = subtitleTrackSourceUrl(track);
    if (!url) return null;
    const label = subtitleTrackSourceLabel(track, url, pageTitle);
    return {
      url,
      label,
      language: normalizeSubtitleLanguage(track.srclang || inferSubtitleLanguage(label, url)),
      sourceKey: pageSubtitleSourceKey("track", url)
    };
  }
  function isSubtitleTrackElement(track) {
    return !track.kind || /subtitles|captions/i.test(track.kind);
  }
  function subtitleTrackSourceUrl(track) {
    return subtitleSourceUrl(track.src || track.getAttribute("src") || "");
  }
  function subtitleTrackSourceLabel(track, url, pageTitle) {
    return subtitleSourceLabel(track.label || track.srclang || track.getAttribute("aria-label") || "", url, {
      pageTitle,
      preferPageTitleForGeneric: true
    });
  }
  function collectLinkSubtitleSources(root, pageTitle) {
    return Array.from(root.querySelectorAll("a[href]")).map((link) => subtitleSourceFromLink(link, pageTitle)).filter((source) => Boolean(source));
  }
  function subtitleSourceFromLink(link, pageTitle) {
    const url = subtitleSourceUrl(link.href || link.getAttribute("href") || "");
    if (!url) return null;
    const label = subtitleSourceLabel(linkSubtitleLabelText(link), url, { pageTitle });
    return {
      url,
      label,
      language: normalizeSubtitleLanguage(link.lang || inferSubtitleLanguage(label, url)),
      sourceKey: pageSubtitleSourceKey("link", url)
    };
  }
  function linkSubtitleLabelText(link) {
    return link.getAttribute("download") || link.getAttribute("aria-label") || link.getAttribute("title") || link.textContent || "";
  }
  function subtitleSourceUrl(value) {
    const url = resolveSubtitleSourceUrl(value);
    return url && isSupportedSubtitleSourceUrl(url) ? url : "";
  }
  function dedupeSubtitleSources(sources) {
    const seen = /* @__PURE__ */ new Set();
    return sources.filter((source) => {
      const key2 = source.sourceKey;
      if (seen.has(key2)) return false;
      seen.add(key2);
      return true;
    });
  }
  function pageSubtitleTitle(root) {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    return cleanSubtitleTitle(pageSubtitleTitleCandidate(doc));
  }
  function pageSubtitleTitleCandidate(doc) {
    return openGraphSubtitleTitle(doc) || headingSubtitleTitle(doc) || doc.title || "";
  }
  function openGraphSubtitleTitle(doc) {
    return doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.content ?? "";
  }
  function headingSubtitleTitle(doc) {
    return doc.querySelector("h1")?.textContent ?? "";
  }
  function resolveSubtitleSourceUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      if (!/^(https?|blob|data):$/i.test(url.protocol)) return "";
      return url.href;
    } catch {
      return "";
    }
  }
  function isSupportedSubtitleSourceUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      const haystack = [
        decodeURIComponent(url.pathname),
        ...Array.from(url.searchParams.values()).map((part) => decodeURIComponent(part))
      ].join(" ");
      return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(`${haystack} `);
    } catch {
      return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(value);
    }
  }
  function subtitleSourceLabel(value, url, options = {}) {
    const cleaned = cleanSubtitleTitle(value);
    const filename = subtitleSourceFilenameLabel(url);
    const specific = specificSubtitleLabel(cleaned, filename);
    if (specific) return specific;
    return genericSubtitleLabel(cleaned, filename, options);
  }
  function genericSubtitleLabel(cleaned, filename, options) {
    if (shouldUsePageTitleForGeneric(cleaned, options)) return options.pageTitle ?? "";
    return cleaned || filename || "Subtitle file";
  }
  function shouldUsePageTitleForGeneric(cleaned, options) {
    if (!options.pageTitle) return false;
    return !cleaned || Boolean(options.preferPageTitleForGeneric && cleaned);
  }
  function specificSubtitleLabel(cleaned, filename) {
    if (cleaned && !isGenericSubtitleLabel(cleaned)) return cleaned;
    if (filename && !isGenericSubtitleLabel(filename)) return filename;
    return "";
  }
  function subtitleSourceFilenameLabel(url) {
    try {
      const parsed = new URL(url, document.baseURI);
      const filename = parsed.searchParams.get("filename") || parsed.pathname.split("/").pop() || "";
      return cleanSubtitleTitle(decodeURIComponent(filename).replace(/[_-]+/g, " "));
    } catch {
      return "";
    }
  }
  function cleanSubtitleTitle(value) {
    return value.replace(/\.(vtt|srt|ass|ssa)$/i, "").replace(/\s+/g, " ").trim();
  }
  function isGenericSubtitleLabel(value) {
    return /^(?:vtt|srt|ass|ssa|subtitles?|captions?|cc|closed captions?|日本語|英語|japanese|english|native|ja(?:panese)?|en(?:glish)?)$/i.test(value.trim());
  }
  function inferSubtitleLanguage(label, url) {
    const text = `${label} ${url}`;
    if (/(^|[\s._/-])(ja|jp|jpn|japanese|日本語)(?=$|[\s._/-])/i.test(text) || /[\u3040-\u30ff\u3400-\u9fff]/u.test(label)) return "ja";
    if (/(^|[\s._/-])(en|eng|english|native)(?=$|[\s._/-])/i.test(text)) return "en";
    return void 0;
  }
  function normalizeSubtitleLanguage(language) {
    if (!language) return void 0;
    if (/^(ja|jp|jpn)(?:[-_]|$)/i.test(language)) return "ja";
    if (/^(en|eng)(?:[-_]|$)/i.test(language)) return "en";
    return language;
  }
  function pageSubtitleSourceKey(kind, url) {
    return `${kind}:${normalizedSubtitleUrl(url)}`;
  }
  function normalizedSubtitleUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      url.searchParams.delete("v");
      url.hash = "";
      return url.href;
    } catch {
      return value;
    }
  }
  function sameSubtitleUrl(a, b) {
    return normalizedSubtitleUrl(a) === normalizedSubtitleUrl(b);
  }
  class SubtitleVideoInsetAdapter {
    lastSignature = "";
    apply(options) {
      const metrics = videoInsetMetrics(options);
      if (metrics.signature === this.lastSignature) return;
      this.lastSignature = metrics.signature;
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-left", options.side === "left");
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-right", options.side === "right");
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-bottom", options.side === "bottom");
      document.documentElement.style.setProperty("--jpdb-subtitle-video-inset", metrics.inset);
      applyYouTubePlayerInset(options.side, metrics.width, metrics.insetPixels, metrics.height);
      applyGenericVideoInsetIfNeeded(options, metrics);
      resizeYouTubePlayer(metrics.width, metrics.height);
      dispatchVideoLayoutResize();
    }
    clear(video) {
      if (!hasActiveVideoInset(this.lastSignature)) return;
      this.lastSignature = "";
      document.documentElement.classList.remove("jpdb-subtitle-video-inset-left", "jpdb-subtitle-video-inset-right", "jpdb-subtitle-video-inset-bottom");
      document.documentElement.style.removeProperty("--jpdb-subtitle-video-inset");
      const watchFlexy = document.querySelector("ytd-watch-flexy");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-width");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-height");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-min-player-height");
      for (const element of youtubePlayerContainers()) clearYouTubePlayerContainerInset(element);
      if (video) clearGenericVideoInset(video);
      resetYouTubePlayerResizeTracking();
      dispatchVideoLayoutResize();
    }
  }
  function hasActiveVideoInset(lastSignature) {
    return Boolean(lastSignature) || document.documentElement.classList.contains("jpdb-subtitle-video-inset-left") || document.documentElement.classList.contains("jpdb-subtitle-video-inset-right") || document.documentElement.classList.contains("jpdb-subtitle-video-inset-bottom");
  }
  function videoInsetMetrics(options) {
    const insetPixels = Math.max(0, Math.round(options.panelSize) + options.margin);
    const width = videoInsetWidth(options);
    const height = videoInsetHeight(options);
    const inset = `${insetPixels}px`;
    return {
      insetPixels,
      inset,
      width,
      height,
      signature: `${options.side}:${inset}:${width}:${height}`
    };
  }
  function videoInsetWidth(options) {
    return options.side === "bottom" ? Math.max(320, Math.round(options.videoRect.width)) : Math.max(320, Math.round(options.playerSize));
  }
  function videoInsetHeight(options, _width) {
    if (options.side === "bottom") return Math.max(180, Math.round(options.playerSize));
    return Math.max(180, Math.round(options.videoRect.height));
  }
  function applyGenericVideoInsetIfNeeded(options, metrics) {
    if (!isYouTubePage$1() && options.video) {
      applyGenericVideoInset(options.video, options.side, options.side === "bottom" ? metrics.height : metrics.width, metrics.height);
    }
  }
  function createSubtitleVideoInsetAdapter() {
    return new SubtitleVideoInsetAdapter();
  }
  function subtitleVideoLayoutRect(video) {
    if (isYouTubePage$1()) {
      const scopedRect = video ? youtubePlayerRectForVideo(video) : void 0;
      if (scopedRect) return scopedRect;
      const rect = youtubeVisiblePlayerRect();
      if (rect) return rect;
    }
    return video?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }
  function transcriptAvoidanceTarget(video) {
    const videoRect = video.getBoundingClientRect();
    let best = genericVideoLayoutTarget(video);
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      if (isUsefulTranscriptAvoidanceTarget(ancestor, videoRect)) best = ancestor;
    }
    return best;
  }
  function isUsefulTranscriptAvoidanceTarget(element, videoRect) {
    const rect = element.getBoundingClientRect();
    return usableVideoRect(rect) && rectContainsRect(rect, videoRect, 2) && !isViewportSizedVideoRect(rect) && hasMeaningfulVideoInsetSpace(rect, videoRect);
  }
  function isViewportSizedVideoRect(rect) {
    return rect.width > window.innerWidth * 0.92 || rect.height > window.innerHeight * 0.9;
  }
  function hasMeaningfulVideoInsetSpace(rect, videoRect) {
    return rect.width - videoRect.width >= 180 || rect.height - videoRect.height >= 80;
  }
  function videoAspectRatio(video) {
    if (!video) return 9 / 16;
    if (video.videoWidth && video.videoHeight) return video.videoHeight / video.videoWidth;
    if (!video.currentSrc && !video.src) return 9 / 16;
    const rect = video.getBoundingClientRect();
    return rect.height / Math.max(1, rect.width);
  }
  function applyYouTubePlayerInset(side, width, inset, height) {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    applyYouTubeWatchFlexyInset(watchFlexy, side, width, height);
    for (const element of youtubePlayerContainers()) {
      applyYouTubePlayerContainerInset(element, side, width, inset, bottomInsetHeight(side, height));
    }
  }
  function applyYouTubeWatchFlexyInset(watchFlexy, side, width, height) {
    if (side !== "bottom") watchFlexy?.style.setProperty("--ytd-watch-flexy-player-width", `${width}px`);
    if (height) watchFlexy?.style.setProperty("--ytd-watch-flexy-player-height", `${height}px`);
    if (side === "bottom" && height) watchFlexy?.style.setProperty("--ytd-watch-flexy-min-player-height", `${height}px`);
  }
  function bottomInsetHeight(side, height) {
    return side === "bottom" ? height : 0;
  }
  const youtubePlayerContainerBaseRects = /* @__PURE__ */ new WeakMap();
  function youtubePlayerContainers() {
    if (!isYouTubePage$1()) return [];
    return [
      document.querySelector("ytd-watch-flexy #primary"),
      document.querySelector("ytd-watch-flexy #primary-inner")
    ].filter((element) => Boolean(element));
  }
  function applyYouTubePlayerContainerInset(element, side, width, inset, height = 0) {
    if (side === "bottom") {
      applyBottomYouTubePlayerContainerInset(element, height);
      return;
    }
    applySideYouTubePlayerContainerInset(element, side, width, inset);
  }
  function applyBottomYouTubePlayerContainerInset(element, height) {
    if (!height) return;
    setStylePropertyIfChanged(element, "height", `${height}px`);
    setStylePropertyIfChanged(element, "max-height", `${height}px`);
    setStylePropertyIfChanged(element, "min-height", "0px");
  }
  function applySideYouTubePlayerContainerInset(element, side, width, inset) {
    const rect = element.getBoundingClientRect();
    const baseRect = youtubePlayerContainerBaseRects.get(element) ?? { left: rect.left, right: rect.right };
    if (!youtubePlayerContainerBaseRects.has(element)) youtubePlayerContainerBaseRects.set(element, baseRect);
    const widthValue = `${width}px`;
    setStylePropertyIfChanged(element, "width", widthValue);
    setStylePropertyIfChanged(element, "max-width", widthValue);
    setStylePropertyIfChanged(element, "min-width", "0px");
    const margin = side === "left" ? `${Math.max(0, Math.round(inset - baseRect.left))}px` : `${Math.max(0, Math.round(baseRect.right - (window.innerWidth - inset)))}px`;
    setStylePropertyIfChanged(element, side === "left" ? "margin-left" : "margin-right", margin);
    setStylePropertyIfChanged(element, side === "left" ? "margin-right" : "margin-left", "0px");
  }
  function youtubeVisiblePlayerRect() {
    const rects = [
      "#movie_player",
      ".html5-video-player",
      "ytd-watch-flexy #player-container-inner",
      "ytd-watch-flexy #player-container-outer",
      "ytd-watch-flexy #player"
    ].flatMap((selector) => Array.from(document.querySelectorAll(selector))).map((element) => element.getBoundingClientRect()).filter(usableVideoRect);
    return rects.sort(compareVideoLayoutRects)[0];
  }
  function youtubePlayerRectForVideo(video) {
    const candidates = [
      video.closest("#movie_player"),
      video.closest(".html5-video-player"),
      video.closest("ytd-player"),
      video.closest("ytd-reel-video-renderer"),
      video.closest("ytd-shorts")
    ];
    for (const element of candidates) {
      const rect2 = element?.getBoundingClientRect();
      if (usableVideoRect(rect2)) return rect2;
    }
    const rect = video.getBoundingClientRect();
    return usableVideoRect(rect) ? rect : void 0;
  }
  function compareVideoLayoutRects(a, b) {
    return rectViewportIntersectionArea(b) - rectViewportIntersectionArea(a) || rectArea(b) - rectArea(a);
  }
  function rectViewportIntersectionArea(rect) {
    const left = Math.max(0, Math.min(window.innerWidth, rect.left));
    const top = Math.max(0, Math.min(window.innerHeight, rect.top));
    const right = Math.max(left, Math.min(window.innerWidth, rect.right));
    const bottom = Math.max(top, Math.min(window.innerHeight, rect.bottom));
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }
  function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  function resizeYouTubePlayer(width, height) {
    if (!isYouTubePage$1()) return;
    const signature = youtubeResizeSignature(width, height);
    if (signature === lastYouTubePlayerResizeSignature) return;
    lastYouTubePlayerResizeSignature = signature;
    const player = youtubeMoviePlayer();
    try {
      if (canResizeYouTubePlayer(player, width, height)) player.setSize(Math.round(width), Math.round(height));
    } catch {
    }
  }
  let lastYouTubePlayerResizeSignature = "";
  let pendingVideoLayoutResize;
  function youtubeResizeSignature(width, height) {
    return `${Math.round(width)}:${Math.round(height)}`;
  }
  function dispatchVideoLayoutResize() {
    dispatchWindowEvent(createWindowEvent("resize"));
    if (pendingVideoLayoutResize !== void 0) window.clearTimeout(pendingVideoLayoutResize);
    pendingVideoLayoutResize = window.setTimeout(() => {
      pendingVideoLayoutResize = void 0;
      dispatchWindowEvent(createWindowEvent("resize"));
    }, 80);
  }
  function resetYouTubePlayerResizeTracking() {
    lastYouTubePlayerResizeSignature = "";
  }
  function youtubeMoviePlayer() {
    return document.querySelector("#movie_player");
  }
  function canResizeYouTubePlayer(player, width, height) {
    return Boolean(player?.setSize && width > 0 && height > 0);
  }
  function clearYouTubePlayerContainerInset(element) {
    for (const property of ["width", "max-width", "min-width", "height", "max-height", "min-height", "margin-left", "margin-right"]) {
      if (element.style.getPropertyValue(property)) element.style.removeProperty(property);
    }
    youtubePlayerContainerBaseRects.delete(element);
  }
  const genericVideoInsetStyles = /* @__PURE__ */ new WeakMap();
  const genericVideoInsetBaseRects = /* @__PURE__ */ new WeakMap();
  const genericVideoInsetTargets = /* @__PURE__ */ new WeakMap();
  function applyGenericVideoInset(video, side, size, height = 0) {
    const target = prepareGenericVideoInsetTarget(video, side);
    if (side === "bottom") {
      applyGenericBottomInset(target, size, video);
      return;
    }
    applyGenericSideInset(target, side, size, height, video);
  }
  function prepareGenericVideoInsetTarget(video, side) {
    const previousTarget = genericVideoInsetTargets.get(video);
    const target = previousTarget && side !== "bottom" ? previousTarget : genericVideoLayoutTarget(video, side);
    if (previousTarget && previousTarget !== target) clearGenericVideoInsetTarget(previousTarget);
    genericVideoInsetTargets.set(video, target);
    rememberGenericVideoInsetStyles(target);
    return target;
  }
  function rememberGenericVideoInsetStyles(target) {
    if (genericVideoInsetStyles.has(target)) return;
    const rect = target.getBoundingClientRect();
    genericVideoInsetBaseRects.set(target, { left: rect.left, right: rect.right, height: rect.height });
    genericVideoInsetStyles.set(target, {
      width: target.style.width,
      height: target.style.height,
      maxWidth: target.style.maxWidth,
      maxHeight: target.style.maxHeight,
      minWidth: target.style.minWidth,
      minHeight: target.style.minHeight,
      marginLeft: target.style.marginLeft,
      marginRight: target.style.marginRight,
      justifySelf: target.style.justifySelf,
      objectFit: target.style.objectFit
    });
  }
  function applyGenericBottomInset(target, size, video) {
    restoreGenericSideInsetStyles(target);
    const height = genericBottomInsetHeight(target, size, video);
    setStylePropertyIfChanged(target, "height", `${Math.round(height)}px`);
    setStylePropertyIfChanged(target, "max-height", `${Math.round(height)}px`);
    setStylePropertyIfChanged(target, "min-height", "0px");
    if (target === video) setStylePropertyIfChanged(target, "object-fit", "contain");
  }
  function genericBottomInsetHeight(target, size, video) {
    if (!target.matches("[data-yomu-video-frame]")) return size;
    return Math.min(size, target.getBoundingClientRect().width * videoAspectRatio(video));
  }
  function applyGenericSideInset(target, side, size, height, video) {
    restoreGenericBottomInsetStyles(target);
    const rect = target.getBoundingClientRect();
    const baseRect = genericVideoInsetBaseRects.get(target) ?? rect;
    const inset = Number.parseFloat(document.documentElement.style.getPropertyValue("--jpdb-subtitle-video-inset")) || 0;
    const margin = side === "left" ? Math.max(0, Math.round(inset - baseRect.left)) : Math.max(0, Math.round(baseRect.right - (window.innerWidth - inset)));
    const stableHeight = sideInsetStableHeight(target, height);
    setStylePropertyIfChanged(target, "width", `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, "max-width", `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, "min-width", "0px");
    setStylePropertyIfChanged(target, "justify-self", "start");
    if (stableHeight > 0) {
      setStylePropertyIfChanged(target, "height", `${Math.round(stableHeight)}px`);
      setStylePropertyIfChanged(target, "max-height", `${Math.round(stableHeight)}px`);
      setStylePropertyIfChanged(target, "min-height", "0px");
    }
    if (target === video) setStylePropertyIfChanged(target, "object-fit", "contain");
    else applyContainedVideoHeight(video, height);
    setStylePropertyIfChanged(target, side === "left" ? "margin-left" : "margin-right", `${margin}px`);
    setStylePropertyIfChanged(target, side === "left" ? "margin-right" : "margin-left", "0px");
  }
  function sideInsetStableHeight(target, fallbackHeight) {
    const rectHeight = genericVideoInsetBaseRects.get(target)?.height ?? target.getBoundingClientRect().height;
    return Math.max(0, Math.round(rectHeight || fallbackHeight));
  }
  function applyContainedVideoHeight(video, height) {
    const stableHeight = sideInsetStableHeight(video, height);
    if (stableHeight <= 0) return;
    rememberGenericVideoInsetStyles(video);
    setStylePropertyIfChanged(video, "height", `${Math.round(stableHeight)}px`);
    setStylePropertyIfChanged(video, "max-height", `${Math.round(stableHeight)}px`);
    setStylePropertyIfChanged(video, "min-height", "0px");
    setStylePropertyIfChanged(video, "object-fit", "contain");
  }
  function restoreGenericSideInsetStyles(target) {
    restoreGenericInsetStyleProperties(target, [
      "width",
      "height",
      "maxWidth",
      "maxHeight",
      "minWidth",
      "minHeight",
      "marginLeft",
      "marginRight",
      "justifySelf",
      "objectFit"
    ]);
  }
  function restoreGenericBottomInsetStyles(target) {
    restoreGenericInsetStyleProperties(target, ["height", "maxHeight", "minHeight"]);
  }
  function clearGenericVideoInset(video) {
    const target = genericVideoInsetTargets.get(video) ?? genericVideoLayoutTarget(video, "right");
    clearGenericVideoInsetTarget(target);
    if (target !== video) clearGenericVideoInsetTarget(video);
    genericVideoInsetTargets.delete(video);
  }
  function clearGenericVideoInsetTarget(target) {
    if (!restoreGenericInsetStyleProperties(target, [
      "width",
      "height",
      "maxWidth",
      "maxHeight",
      "minWidth",
      "minHeight",
      "marginLeft",
      "marginRight",
      "justifySelf",
      "objectFit"
    ])) return;
    genericVideoInsetStyles.delete(target);
    genericVideoInsetBaseRects.delete(target);
  }
  function restoreGenericInsetStyleProperties(target, properties) {
    const previous = genericVideoInsetStyles.get(target);
    if (!previous) return false;
    properties.forEach((property) => {
      setRestoredStyleProperty(target, stylePropertyName(property), previous[property]);
    });
    return true;
  }
  function stylePropertyName(property) {
    return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }
  function genericVideoLayoutTarget(video, side = "right") {
    const parent = video.parentElement;
    if (!isGenericVideoLayoutParent(parent)) return video;
    if (side === "bottom" && !parent.matches("[data-yomu-video-frame]")) return video;
    const parentRect = parent.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    return shouldUseGenericVideoParent(parent, parentRect, videoRect) ? parent : video;
  }
  function isGenericVideoLayoutParent(parent) {
    return Boolean(parent && parent !== document.body && parent !== document.documentElement);
  }
  function shouldUseGenericVideoParent(parent, parentRect, videoRect) {
    if (parent.matches("[data-yomu-video-frame]")) return true;
    if (rectsHaveMatchingSize(parentRect, videoRect, 3)) return false;
    return rectContainsRect(parentRect, videoRect);
  }
  function rectsHaveMatchingSize(a, b, tolerance) {
    return Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
  }
  function rectContainsRect(container, child, tolerance = 0) {
    return container.left <= child.left + tolerance && container.top <= child.top + tolerance && container.right >= child.right - tolerance && container.bottom >= child.bottom - tolerance;
  }
  function setRestoredStyleProperty(element, property, value) {
    if (value) {
      element.style.setProperty(property, value);
    } else {
      element.style.removeProperty(property);
    }
  }
  function usableVideoRect(rect) {
    return Boolean(rect && rect.width >= 120 && rect.height >= 80);
  }
  function isYouTubePage$1() {
    return /(^|\.)youtube\.com$/i.test(location.hostname);
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
  const YOUTUBE_VIDEO_PLAYER_SELECTOR = "#movie_player, .html5-video-player";
  const YOUTUBE_VIDEO_OWNER_SELECTOR = `${YOUTUBE_VIDEO_PLAYER_SELECTOR}, ytd-player, ytd-watch-flexy, #player, #player-container, #player-container-outer, .html5-video-container`;
  async function discoverYouTubeCaptionTracks() {
    const pageTracks = getYouTubeCaptionTracks();
    const androidTracks = await getAndroidYouTubeCaptionTracks();
    return uniqueYouTubeCaptionTrackCandidates([
      ...pageTracks,
      ...androidTracks
    ]);
  }
  async function loadYouTubeTrackCues(track, options) {
    if (!track.url) return [];
    applyPreferredYouTubeCaptionCandidate(track);
    const tried = /* @__PURE__ */ new Set();
    const primary = await loadYouTubeCueUrls(track, youtubeSubtitleRequestUrls(track.url), options, tried);
    if (primary.length) return primary;
    for (const candidate of await fallbackYouTubeCaptionCandidates(track)) {
      const cues = await loadYouTubeCueUrls(track, youtubeSubtitleRequestUrls(candidate.url), options, tried);
      if (!cues.length) continue;
      track.url = candidate.url;
      track.youtubeTrack = candidate.raw;
      return cues;
    }
    return [];
  }
  async function loadYouTubeCueUrls(track, urls, options, tried) {
    for (const url of urls) {
      if (tried.has(url)) continue;
      tried.add(url);
      try {
        const text = await options.requestText(url);
        if (!text.trim()) throw new Error("YouTube timedtext response was empty.");
        const cues = normalizeSubtitleCues(parseSubtitleText(text, {
          smoothYouTubeFragments: true,
          youtubeAutoGenerated: isAutoGeneratedSubtitleTrack(track)
        }));
        if (cues.length) return cues;
      } catch (error) {
        options.onRequestError?.(track, url, error);
      }
    }
    return [];
  }
  function applyPreferredYouTubeCaptionCandidate(track) {
    const preferred = findPreferredYouTubeCaptionCandidate(track);
    if (!preferred) return;
    if (!track.url || !shouldRefreshYouTubeTrackUrl(preferred.url, track.url)) return;
    track.url = preferred.url;
    track.youtubeTrack = preferred.raw;
  }
  async function loadFirstUsableYouTubeSibling(track, tracks, options) {
    const siblings = tracks.filter((candidate) => candidate.kind === "youtube" && candidate !== track && compatibleYouTubeCaptionTracks(candidate, track) && candidate.url);
    for (const sibling of siblings) {
      const cues = sibling.cues?.length ? sibling.cues : await loadYouTubeTrackCues(sibling, options);
      if (!cues.length) continue;
      sibling.cues = cues;
      return { track: sibling, cues };
    }
    return null;
  }
  function getYouTubeCaptionTracks() {
    const playerTracks = getYouTubePlayerCaptionTracks();
    const response = getYouTubePlayerResponse();
    const renderer = response?.captions?.playerCaptionsTracklistRenderer;
    const rawTracks = renderer?.captionTracks;
    return uniqueYouTubeCaptionTracks([
      ...playerTracks,
      ...Array.isArray(rawTracks) ? rawTracks : []
    ], renderer?.translationLanguages);
  }
  async function fallbackYouTubeCaptionCandidates(track) {
    if (track.kind !== "youtube") return [];
    const candidates = await getAndroidYouTubeCaptionTracks();
    return candidates.filter((candidate) => youtubeCaptionCandidateMatchesTrack(candidate, track)).sort((a, b) => youtubeTrackUrlScore(b.url) - youtubeTrackUrlScore(a.url));
  }
  function youtubeCaptionCandidateMatchesTrack(candidate, track) {
    return compatibleYouTubeCaptionTracks(candidate, track);
  }
  function activateYouTubeCaptionTrack(track) {
    if (!isYouTubePage()) return;
    const player = youtubeCaptionPlayer();
    if (!player?.setOption) return;
    try {
      player.loadModule?.("captions");
      setYouTubeCaptionTrack(player, findMatchingYouTubePlayerTrack(track, player) ?? track.youtubeTrack);
      player.setOption("captions", "reload", true);
    } catch {
    }
  }
  function youtubeCaptionPlayer() {
    return document.querySelector("#movie_player");
  }
  function setYouTubeCaptionTrack(player, candidate) {
    if (candidate) player.setOption?.("captions", "track", candidate);
  }
  function getYouTubeVideoId() {
    const url = new URL(location.href);
    return url.searchParams.get("v") ?? url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] ?? "";
  }
  function isYouTubePage() {
    return /(^|\.)youtube\.com$/i.test(location.hostname);
  }
  function isYouTubeOwnedVideoElement(video) {
    if (!isYouTubePage()) return true;
    const currentVideoId = getYouTubeVideoId();
    if (!video || !currentVideoId) return false;
    const player = video.closest(YOUTUBE_VIDEO_PLAYER_SELECTOR);
    const owner = video.closest(YOUTUBE_VIDEO_OWNER_SELECTOR);
    const playerVideoId = getYouTubePlayerVideoId(player ?? owner);
    if (playerVideoId && playerVideoId !== currentVideoId) return isLikelyVisibleYouTubeWatchVideo(video);
    return Boolean(owner) || isLikelyVisibleYouTubeWatchVideo(video);
  }
  function shouldRefreshYouTubeTrackUrl(next, current) {
    if (!next || next === current) return false;
    return youtubeTrackUrlScore(next) >= youtubeTrackUrlScore(current);
  }
  function isAutoGeneratedSubtitleTrack(track) {
    return track.sourceType === "asr" || track.sourceType === "translation" || Boolean(track.autoGenerated) || /asr|auto(?:matic)?|auto-generated|自動生成|自動字幕/i.test(`${track.label} ${track.language ?? ""}`);
  }
  function youtubeCaptionTrackIdentity(track) {
    if (track.youtubeIdentity) return track.youtubeIdentity;
    const language = normalizedYouTubeLanguageCode(track.language);
    const sourceType = track.sourceType ?? (track.autoGenerated ? "asr" : "manual");
    const sourceLanguage = normalizedYouTubeLanguageCode(track.sourceLanguage) || language;
    const targetLanguage = normalizedYouTubeLanguageCode(track.targetLanguage) || (sourceType === "translation" ? language : "");
    return [
      sourceType,
      sourceLanguage,
      targetLanguage || language,
      track.vssId ?? "",
      track.vssId ? "" : normalizedYouTubeCaptionLabel(track.label)
    ].join(":");
  }
  function compatibleYouTubeCaptionTracks(candidate, track) {
    if (youtubeCaptionTrackIdentity(candidate) === youtubeCaptionTrackIdentity(track)) return true;
    if (hasSpecificYouTubeCaptionIdentity(track)) return false;
    return Boolean(candidate.language && track.language && normalizedYouTubeLanguageCode(candidate.language) === normalizedYouTubeLanguageCode(track.language));
  }
  function hasSpecificYouTubeCaptionIdentity(track) {
    return Boolean(track.youtubeIdentity || track.sourceType || track.sourceLanguage || track.targetLanguage || track.vssId);
  }
  function normalizedYouTubeLanguageCode(language) {
    return (language ?? "").trim().toLowerCase();
  }
  function normalizedYouTubeCaptionLabel(label) {
    return label.replace(/\s+·\s+auto-generated$/iu, "").replace(/\s+·\s+auto-translated from .+$/iu, "").replace(/\([^)]*\)\s*$/u, "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function getYouTubePlayerCaptionTracks() {
    const player = document.querySelector("#movie_player");
    const videoId = getYouTubeVideoId();
    if (!videoId) return [];
    const playerVideoId = getYouTubePlayerVideoId(player);
    const tracks = player?.getAudioTrack?.()?.captionTracks;
    if (playerVideoId && playerVideoId !== videoId) return [];
    return Array.isArray(tracks) ? tracks.filter((track) => youtubeRawCaptionTrackMatchesVideo(track, videoId)) : [];
  }
  function getYouTubePlayerVideoId(player) {
    try {
      return player?.getVideoData?.()?.video_id ?? "";
    } catch {
      return "";
    }
  }
  function isLikelyVisibleYouTubeWatchVideo(video) {
    if (!video.isConnected) return false;
    if (video.closest("[data-jpdb-reader-root], [data-yomu-jpdb-addon]")) return false;
    const rect = video.getBoundingClientRect();
    const width = Math.max(rect.width, video.clientWidth);
    const height = Math.max(rect.height, video.clientHeight);
    if (width >= 240 && height >= 135) return true;
    return video.classList.contains("html5-main-video") && (video.readyState >= 1 || width > 0 || height > 0);
  }
  function uniqueYouTubeCaptionTracks(rawTracks, rawTranslationLanguages = []) {
    return uniqueYouTubeCaptionTrackCandidates(youtubeCaptionTracksWithTranslations(rawTracks, rawTranslationLanguages));
  }
  function uniqueYouTubeCaptionTrackCandidates(candidates) {
    const tracks = /* @__PURE__ */ new Map();
    for (const parsed of candidates) {
      const key2 = youtubeCaptionTrackIdentity(parsed);
      const existing = tracks.get(key2);
      if (!existing || shouldRefreshYouTubeTrackUrl(parsed.url, existing.url)) tracks.set(key2, parsed);
    }
    return [...tracks.values()];
  }
  function youtubeCaptionTracksWithTranslations(rawTracks, rawTranslationLanguages) {
    const baseTracks = rawTracks.map(parseYouTubeCaptionTrack).filter((track) => Boolean(track));
    const translationLanguages = preferredYouTubeTranslationLanguages(rawTranslationLanguages);
    if (!translationLanguages.length) return baseTracks;
    return [
      ...baseTracks,
      ...baseTracks.flatMap((track) => translationLanguages.filter((language) => language.code !== normalizedYouTubeLanguageCode(track.language)).map((language) => translatedYouTubeCaptionTrack(track, language)))
    ];
  }
  function parseYouTubeCaptionTrack(track) {
    const record = track;
    const url = normalizedYouTubeCaptionUrl(record);
    if (!url) return null;
    const language = record.languageCode;
    const label = youtubeCaptionTrackLabel(record, language);
    const autoGenerated = isAutoGeneratedYouTubeCaptionTrack(record, label);
    const autoSuffix = youtubeCaptionAutoSuffix(autoGenerated, label);
    const sourceType = autoGenerated ? "asr" : "manual";
    const parsed = {
      label: `${label}${language ? ` (${language})` : ""}${autoSuffix}`,
      language,
      autoGenerated,
      url: url.toString(),
      raw: track,
      sourceType,
      sourceLanguage: language,
      vssId: record.vssId
    };
    return { ...parsed, youtubeIdentity: youtubeCaptionTrackIdentity(parsed) };
  }
  function preferredYouTubeTranslationLanguages(rawLanguages) {
    const languages = rawLanguages.map(parseYouTubeTranslationLanguage).filter((language) => Boolean(language));
    if (!languages.length) return [];
    const byCode = new Map(languages.map((language) => [language.code, language]));
    const preferred = uniqueNonEmptyStrings(["ja", "en", normalizedYouTubeLanguageCode(readYouTubeConfigString$1("HL"))]);
    return preferred.flatMap((code) => {
      const language = byCode.get(code);
      return language ? [language] : [];
    });
  }
  function parseYouTubeTranslationLanguage(value) {
    const record = value;
    const code = normalizedYouTubeLanguageCode(record.languageCode);
    if (!code) return null;
    return { code, label: firstYouTubeCaptionTrackLabel(record, code) || code };
  }
  function translatedYouTubeCaptionTrack(source, language) {
    const url = new URL(source.url, location.href);
    url.searchParams.set("tlang", language.code);
    const sourceLabel = sourceLabelForTranslation(source);
    const label = `${language.label} (${language.code}) · auto-translated from ${sourceLabel}`;
    const translated = {
      label,
      language: language.code,
      autoGenerated: true,
      url: url.toString(),
      raw: {
        source: source.raw,
        translationLanguage: language
      },
      sourceType: "translation",
      sourceLanguage: source.language,
      targetLanguage: language.code,
      vssId: `${source.vssId ?? source.language ?? "source"}>${language.code}`
    };
    return { ...translated, youtubeIdentity: youtubeCaptionTrackIdentity(translated) };
  }
  function sourceLabelForTranslation(source) {
    return source.label.replace(/\s+·\s+auto-generated$/iu, "").replace(/\([^)]*\)\s*$/u, "").trim() || source.language || "source";
  }
  function normalizedYouTubeCaptionUrl(record) {
    const rawUrl = rawYouTubeCaptionUrl(record);
    if (!rawUrl) return null;
    const url = new URL(rawUrl, location.href);
    url.searchParams.set("fmt", "srv3");
    if (record.languageCode && !url.searchParams.has("lang")) url.searchParams.set("lang", record.languageCode);
    applyYouTubeCaptionClientName(url, readYouTubeClientName());
    return url;
  }
  function rawYouTubeCaptionUrl(record) {
    return typeof record.url === "string" ? record.url : typeof record.baseUrl === "string" ? record.baseUrl : "";
  }
  function applyYouTubeCaptionClientName(url, clientName) {
    if (clientName && !url.searchParams.has("c")) url.searchParams.set("c", clientName);
  }
  async function getAndroidYouTubeCaptionTracks() {
    const request = androidYouTubeCaptionRequest();
    if (!request) return [];
    try {
      return await fetchAndroidYouTubeCaptionTracks(request);
    } catch {
      return [];
    }
  }
  function androidYouTubeCaptionRequest() {
    const videoId = getYouTubeVideoId();
    const apiKey = readYouTubeConfigString$1("INNERTUBE_API_KEY");
    if (!videoId || !apiKey) return null;
    return {
      url: `${location.origin}/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
      init: {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: androidYouTubeCaptionRequestBody(videoId)
      },
      videoId
    };
  }
  async function fetchAndroidYouTubeCaptionTracks(request) {
    const response = await fetch(request.url, request.init);
    if (!response.ok) return [];
    const payload = await response.json();
    return androidYouTubeCaptionTracksFromPayload(payload, request.videoId);
  }
  function androidYouTubeCaptionRequestBody(videoId) {
    return JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.10.38",
          hl: readYouTubeConfigString$1("HL") || "en"
        }
      },
      videoId
    });
  }
  function androidYouTubeCaptionTracksFromPayload(payload, videoId) {
    if (!isMatchingYouTubePlayerResponse(payload, videoId)) return [];
    const renderer = payload.captions?.playerCaptionsTracklistRenderer;
    const rawTracks = renderer?.captionTracks;
    return uniqueYouTubeCaptionTracks(Array.isArray(rawTracks) ? rawTracks : [], renderer?.translationLanguages);
  }
  function youtubeCaptionTrackLabel(record, language) {
    return firstYouTubeCaptionTrackLabel(record, language) || "YouTube subtitles";
  }
  function firstYouTubeCaptionTrackLabel(record, language) {
    return [
      youtubeCaptionText(record.name),
      youtubeCaptionText(record.displayName),
      youtubeCaptionText(record.languageName),
      language
    ].find((label) => Boolean(label)) ?? "";
  }
  function youtubeCaptionText(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const record = value;
    if (typeof record.simpleText === "string") return record.simpleText;
    if (!Array.isArray(record.runs)) return "";
    return record.runs.map((run) => typeof run === "object" && run ? run.text : "").filter((text) => typeof text === "string").join("");
  }
  function youtubeCaptionAutoSuffix(autoGenerated, label) {
    return autoGenerated && !/asr|auto(?:matic)?|auto-generated|自動生成|自動字幕/i.test(label) ? " · auto-generated" : "";
  }
  function isAutoGeneratedYouTubeCaptionTrack(track, label = "") {
    return youtubeAutoGeneratedSignals(track, label).some((signal) => signal.matches(signal.value));
  }
  function youtubeAutoGeneratedSignals(track, label) {
    return [
      { value: track.kind ?? "", matches: (value) => /asr/i.test(value) },
      { value: track.vssId ?? "", matches: (value) => /^a\./i.test(value) },
      { value: `${label} ${track.languageCode ?? ""}`, matches: (value) => /asr|auto(?:matic)?|auto-generated|自動生成|自動字幕/i.test(value) }
    ];
  }
  function findMatchingYouTubePlayerTrack(track, player) {
    const rawTracks = [
      ...extractYouTubeTrackArray(player.getAudioTrack?.()?.captionTracks),
      ...extractYouTubeTrackArray(player.getOption?.("captions", "tracklist"))
    ];
    const targetIdentity = youtubeCaptionTrackIdentity(track);
    const exact = rawTracks.find((raw) => {
      const parsed = parseYouTubeCaptionTrack(raw);
      return parsed && youtubeCaptionTrackIdentity(parsed) === targetIdentity;
    });
    if (exact) return exact;
    if (track.sourceType === "translation") {
      return rawTracks.find((raw) => {
        const parsed = parseYouTubeCaptionTrack(raw);
        return parsed?.language && track.sourceLanguage && normalizedYouTubeLanguageCode(parsed.language) === normalizedYouTubeLanguageCode(track.sourceLanguage);
      }) ?? null;
    }
    return rawTracks.find((raw) => {
      const parsed = parseYouTubeCaptionTrack(raw);
      return parsed?.language && track.language && normalizedYouTubeLanguageCode(parsed.language) === normalizedYouTubeLanguageCode(track.language);
    }) ?? null;
  }
  function findPreferredYouTubeCaptionCandidate(track) {
    if (track.kind !== "youtube") return null;
    const renderer = getYouTubePlayerResponse()?.captions?.playerCaptionsTracklistRenderer;
    const candidates = uniqueYouTubeCaptionTracks([
      ...getYouTubePlayerCaptionTracks(),
      ...renderer?.captionTracks ?? []
    ], renderer?.translationLanguages);
    const targetIdentity = youtubeCaptionTrackIdentity(track);
    return candidates.filter((candidate) => youtubeCaptionTrackIdentity(candidate) === targetIdentity).sort((a, b) => youtubeTrackUrlScore(b.url) - youtubeTrackUrlScore(a.url))[0] ?? null;
  }
  function extractYouTubeTrackArray(value) {
    if (Array.isArray(value)) return value;
    const record = value;
    return Array.isArray(record?.captionTracks) ? record.captionTracks : [];
  }
  function getYouTubePlayerResponse() {
    const videoId = getYouTubeVideoId();
    if (!videoId) return null;
    const fromWindow = window.ytInitialPlayerResponse;
    if (isMatchingYouTubePlayerResponse(fromWindow, videoId)) return fromWindow;
    const fromConfig = readYouTubePlayerResponseFromConfig(videoId);
    if (fromConfig) return fromConfig;
    return readYouTubePlayerResponseFromScripts(videoId);
  }
  function readYouTubePlayerResponseFromScripts(videoId) {
    for (const script of Array.from(document.scripts)) {
      const parsed = readYouTubePlayerResponseFromScript(script.textContent ?? "", videoId);
      if (parsed) return parsed;
    }
    return null;
  }
  function readYouTubePlayerResponseFromScript(text, videoId) {
    return readYouTubeInitialPlayerResponse(text, videoId) ?? readEscapedYouTubePlayerResponse(text, videoId);
  }
  function readYouTubeInitialPlayerResponse(text, videoId) {
    for (const marker of ["ytInitialPlayerResponse = ", "ytInitialPlayerResponse=", "var ytInitialPlayerResponse = "]) {
      const parsed = parseYouTubePlayerResponseMarker(text, marker, videoId);
      if (parsed) return parsed;
    }
    return null;
  }
  function parseYouTubePlayerResponseMarker(text, marker, videoId) {
    const start = text.indexOf(marker);
    if (start < 0) return null;
    const raw = extractJsonObject(text, start + marker.length);
    return raw ? parseMatchingYouTubePlayerResponse(raw, videoId) : null;
  }
  function readEscapedYouTubePlayerResponse(text, videoId) {
    const escaped = text.match(/"playerResponse"\s*:\s*"((?:\\.|[^"\\])+)"/);
    if (!escaped?.[1]) return null;
    try {
      return parseMatchingYouTubePlayerResponse(JSON.parse(`"${escaped[1]}"`), videoId);
    } catch {
      return null;
    }
  }
  function parseMatchingYouTubePlayerResponse(raw, videoId) {
    try {
      const parsed = JSON.parse(raw);
      return isMatchingYouTubePlayerResponse(parsed, videoId) ? parsed : null;
    } catch {
      return null;
    }
  }
  function readYouTubePlayerResponseFromConfig(videoId) {
    const ytcfg = window.ytcfg;
    const candidates = [
      ytcfg?.get?.("PLAYER_RESPONSE"),
      ytcfg?.get?.("PLAYER_VARS"),
      ytcfg?.data_?.PLAYER_RESPONSE,
      ytcfg?.data_?.PLAYER_VARS
    ];
    for (const candidate of candidates) {
      const response = readYouTubePlayerResponseCandidate(candidate);
      if (isMatchingYouTubePlayerResponse(response, videoId)) return response;
    }
    return null;
  }
  function readYouTubePlayerResponseCandidate(candidate) {
    if (!candidate) return null;
    if (typeof candidate === "string") return parseYouTubePlayerResponseJson(candidate);
    if (typeof candidate === "object") return readYouTubePlayerResponseObject(candidate);
    return null;
  }
  function parseYouTubePlayerResponseJson(candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  function readYouTubePlayerResponseObject(candidate) {
    const record = candidate;
    return readYouTubePlayerResponseCandidate(record.player_response ?? record.raw_player_response) ?? candidate;
  }
  function isMatchingYouTubePlayerResponse(value, videoId) {
    const response = youtubePlayerResponseRecord(value);
    return Boolean(response && hasYouTubeCaptionTracks(response) && youtubePlayerResponseMatchesVideo(response, videoId));
  }
  function youtubePlayerResponseRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function hasYouTubeCaptionTracks(response) {
    return Boolean(response.captions?.playerCaptionsTracklistRenderer?.captionTracks);
  }
  function youtubePlayerResponseMatchesVideo(response, videoId) {
    if (!videoId) return false;
    const responseVideoId = response.videoDetails?.videoId;
    if (responseVideoId) return responseVideoId === videoId;
    return youtubePlayerResponseCaptionUrlsMatchVideo(response, videoId);
  }
  function youtubePlayerResponseCaptionUrlsMatchVideo(response, videoId) {
    const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) && tracks.some((track) => youtubeRawCaptionTrackMatchesVideo(track, videoId));
  }
  function youtubeRawCaptionTrackMatchesVideo(track, videoId) {
    try {
      const rawUrl = rawYouTubeCaptionUrl(track);
      if (!rawUrl) return false;
      return new URL(rawUrl, location.href).searchParams.get("v") === videoId;
    } catch {
      return false;
    }
  }
  function extractJsonObject(text, start) {
    const objectStart = text.indexOf("{", start);
    if (objectStart < 0) return null;
    const state = createJsonObjectScanState();
    for (let index = objectStart; index < text.length; index++) {
      if (scanJsonObjectCharacter(state, text[index])) return text.slice(objectStart, index + 1);
    }
    return null;
  }
  function createJsonObjectScanState() {
    return { depth: 0, inString: false, escaped: false };
  }
  function scanJsonObjectCharacter(state, char) {
    if (state.inString) {
      scanJsonStringCharacter(state, char);
      return false;
    }
    if (char === '"') {
      state.inString = true;
      return false;
    }
    if (char === "{") state.depth += 1;
    if (char !== "}") return false;
    state.depth -= 1;
    return state.depth === 0;
  }
  function scanJsonStringCharacter(state, char) {
    if (state.escaped) {
      state.escaped = false;
      return;
    }
    if (char === "\\") state.escaped = true;
    if (char === '"') state.inString = false;
  }
  function youtubeSubtitleRequestUrls(url) {
    return uniqueNonEmptyStrings([
      withYouTubeSubtitleFormat(url, "srv3"),
      withYouTubeSubtitleFormat(url, "json3"),
      withYouTubeSubtitleFormat(url, "vtt"),
      url
    ]);
  }
  function withYouTubeSubtitleFormat(url, format) {
    const parsed = new URL(url);
    parsed.searchParams.set("fmt", format);
    const clientName = readYouTubeClientName();
    if (clientName && !parsed.searchParams.has("c")) parsed.searchParams.set("c", clientName);
    return parsed.href;
  }
  function readYouTubeClientName() {
    return readYouTubeConfigString$1("INNERTUBE_CLIENT_NAME");
  }
  function readYouTubeConfigString$1(key2) {
    const ytcfg = window.ytcfg;
    const value = ytcfg?.get?.(key2) ?? ytcfg?.data_?.[key2];
    if (typeof value === "string" && value) return value;
    return readYouTubeConfigStringFromScripts(key2);
  }
  function readYouTubeConfigStringFromScripts(key2) {
    const escapedKey = escapeRegExp$1(key2);
    const patterns = [
      new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u"),
      new RegExp(`${escapedKey}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u")
    ];
    for (const script of Array.from(document.scripts)) {
      const text = script.textContent ?? "";
      const raw = patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
      if (raw) return unescapeYouTubeConfigString$1(raw);
    }
    return "";
  }
  function unescapeYouTubeConfigString$1(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  }
  function youtubeTrackUrlScore(value) {
    if (!value) return 0;
    try {
      const url = new URL(value, location.href);
      return youtubeTrackSearchParamScore(url.searchParams);
    } catch {
      return 0;
    }
  }
  function youtubeTrackSearchParamScore(params) {
    return [
      params.has("pot") ? 8 : 0,
      params.has("potc") ? 4 : 0,
      params.has("signature") ? 2 : 0,
      params.has("kind") ? 1 : 0
    ].reduce((sum, item) => sum + item, 0);
  }
  function escapeRegExp$1(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  async function loadSubtitleTrackCues(track, options) {
    if (track.cues?.length) return { track, cues: track.cues };
    if (track.translatedFromTrackId) {
      return loadTranslatedTrackCues(track, options);
    }
    if (track.track) return loadNativeTrackCues(track);
    if (isRemoteSubtitleTrack(track)) {
      const cues = await loadRemoteTrackCues(track, options);
      track.cues = cues;
      return { track, cues };
    }
    if (isYouTubeSubtitleTrack(track)) return loadYouTubeTrackWithFallback(track, options);
    return { track, cues: track.cues ?? [] };
  }
  async function loadTranslatedTrackCues(track, options) {
    const sourceTrack = options.tracks.find((t) => t.id === track.translatedFromTrackId);
    if (!sourceTrack) return { track, cues: [] };
    const { cues: sourceCues } = await loadSubtitleTrackCues(sourceTrack, options);
    const { translateSubtitleCues: translateSubtitleCues2 } = await Promise.resolve().then(() => subtitleTranslate);
    const translatedCues = await translateSubtitleCues2(sourceCues, sourceTrack.language || "en", track.targetLanguage || track.language || "ja");
    track.cues = translatedCues;
    return { track, cues: translatedCues };
  }
  function isRemoteSubtitleTrack(track) {
    return track.kind === "remote" && Boolean(track.url);
  }
  function isYouTubeSubtitleTrack(track) {
    return track.kind === "youtube" && Boolean(track.url);
  }
  async function loadNativeTrackCues(track) {
    const nativeTrack = track.track;
    if (!nativeTrack) return { track, cues: [] };
    ensureTextTrackReadable(nativeTrack);
    const cues = readTextTrackCues(nativeTrack);
    return { track, cues: cues.length ? cues : await waitForTextTrackCues(nativeTrack) };
  }
  async function loadYouTubeTrackWithFallback(track, options) {
    const youtubeOptions = {
      requestText: options.requestText,
      onRequestError: options.onYouTubeRequestError
    };
    const cues = await loadYouTubeTrackCues(track, youtubeOptions);
    if (cues.length) {
      track.cues = cues;
      return { track, cues };
    }
    const fallback = await loadFirstUsableYouTubeSibling(track, options.tracks, youtubeOptions);
    if (fallback) return fallback;
    track.cues = [];
    return { track, cues: [] };
  }
  function ensureTextTrackReadable(track) {
    if (track.mode === "disabled") track.mode = "hidden";
  }
  function readTextTrackCues(track) {
    return normalizeSubtitleCues(Array.from(track.cues ?? []).map((cue) => ({ start: cue.startTime, end: cue.endTime, text: getTextTrackCueText(cue).trim() })).filter((cue) => cue.text).sort((a, b) => a.start - b.start));
  }
  function waitForTextTrackCues(track, timeoutMs = 900) {
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const poll = () => {
        const cues = readTextTrackCues(track);
        if (cues.length || performance.now() - startedAt >= timeoutMs) {
          resolve(cues);
          return;
        }
        window.setTimeout(poll, 50);
      };
      poll();
    });
  }
  function getTextTrackCueText(cue) {
    if ("text" in cue && typeof cue.text === "string") return cue.text;
    return "";
  }
  async function loadRemoteTrackCues(track, options) {
    try {
      const cues = normalizeSubtitleCues(parseSubtitleText(await options.requestText(track.url ?? "")), {
        transcriptEligible: options.transcriptEligible
      });
      if (cues.length) return cues;
      options.onRemoteEmpty?.(track);
    } catch (error) {
      options.onRemoteError?.(track, error);
    }
    return [];
  }
  function trackStatusText(track, language = "en") {
    if (track.loadingState === "loading") return ` · ${uiText(language, "trackStatusLoading")}`;
    if (track.loadingState === "waiting") return ` · ${uiText(language, "trackStatusWaiting")}`;
    if (track.loadingState === "error") return ` · ${uiText(language, "trackStatusFailed")}`;
    return "";
  }
  function formatTrackKind(kind, language = "en") {
    if (kind === "native") return uiText(language, "trackKindPageTrack");
    if (kind === "remote") return uiText(language, "trackKindPageFile");
    if (kind === "youtube") return uiText(language, "trackKindYouTubeCaptions");
    return uiText(language, "trackKindLoadedFile");
  }
  function compareSubtitleTrackOptions(a, b) {
    return subtitleTrackRank(a) - subtitleTrackRank(b) || (a.language ?? "").localeCompare(b.language ?? "", void 0, { sensitivity: "base" }) || a.label.localeCompare(b.label, void 0, { sensitivity: "base" });
  }
  function isJapaneseSubtitleTrack(track) {
    const language = explicitSubtitleLanguage(track);
    if (language) return language === "ja";
    const label = track.label.toLowerCase();
    return /日本語|japanese/.test(label);
  }
  function isEnglishSubtitleTrack(track) {
    const language = explicitSubtitleLanguage(track);
    if (language) return language === "en";
    return /(^|\b)(en|eng|english)(\b|$)/i.test(`${track.label} ${track.language ?? ""}`);
  }
  function shouldReplaceWaitingNativeTrack(selected, replacement, cues) {
    return isWaitingNativeTrack(selected, cues) && (hasSameSubtitleRole(selected, replacement) || hasSameNormalizedSubtitleLanguage(selected, replacement));
  }
  function isWaitingNativeTrack(selected, cues) {
    return Boolean(selected && selected.kind === "native" && !cues.length);
  }
  function hasSameSubtitleRole(selected, replacement) {
    return isJapaneseSubtitleTrack(selected) && isJapaneseSubtitleTrack(replacement) || isEnglishSubtitleTrack(selected) && isEnglishSubtitleTrack(replacement);
  }
  function hasSameNormalizedSubtitleLanguage(selected, replacement) {
    const selectedLanguage = normalizeSubtitleLanguage(selected.language);
    const replacementLanguage = normalizeSubtitleLanguage(replacement.language);
    return Boolean(selectedLanguage && replacementLanguage && selectedLanguage === replacementLanguage);
  }
  function explicitSubtitleLanguage(track) {
    const language = track.targetLanguage ?? track.language;
    if (!isLanguageCode(language)) return void 0;
    return normalizeSubtitleLanguage(language);
  }
  function isLanguageCode(language) {
    return Boolean(language?.trim().match(/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i));
  }
  function subtitleTrackRank(track) {
    return SUBTITLE_TRACK_RANKS.find((rule) => rule.matches(track))?.rank ?? 5;
  }
  const SUBTITLE_TRACK_RANKS = [
    { rank: 0, matches: (track) => track.kind === "file" },
    { rank: 1, matches: isManualJapaneseSubtitleTrack },
    { rank: 2, matches: isJapaneseSubtitleTrack },
    { rank: 3, matches: isAutoGeneratedSubtitleTrack },
    { rank: 4, matches: isEnglishOrNativeSubtitleTrack }
  ];
  function isManualJapaneseSubtitleTrack(track) {
    return isJapaneseSubtitleTrack(track) && !isAutoGeneratedSubtitleTrack(track);
  }
  function isEnglishOrNativeSubtitleTrack(track) {
    return isEnglishSubtitleTrack(track) || track.kind === "native";
  }
  function renderSubtitleTrackPanel(state) {
    const language = state.language;
    return `
        <div class="jpdb-subtitle-drawer-head">
            <div class="jpdb-subtitle-drawer-brand">
                <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, "subtitlesTitle"))}</strong>
                <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
      mode: "tracks",
      count: state.tracks.length,
      tracks: state.tracks,
      selectedTrackId: state.selectedTrackId,
      secondaryTrackId: state.secondaryTrackId,
      language
    }))}</span>
            </div>
            <div class="jpdb-subtitle-drawer-actions">
                ${renderPanelModeControls("tracks", state.hasTranscriptSurface, language)}
                ${state.hasNavigableLines ? renderPanelNavigationControls(true, language) : ""}
                ${renderPanelPlacementControls(state.placement, language)}
                ${renderPausePanelToggle(state.pausePanelEnabled, language)}
            </div>
        </div>
        <div class="jpdb-subtitle-list-scroll">
            <div class="jpdb-subtitle-track-tools">
                <button type="button" data-action="load">${escapeHtml(uiText(language, "loadJapaneseSubtitles"))}</button>
                <button type="button" data-action="load-secondary">${escapeHtml(uiText(language, "loadNativeSubtitles"))}</button>
            </div>
            <div class="jpdb-subtitle-track-summary">${escapeHtml(trackPanelSummaryText(state.autoDetected, language))}</div>
            <div class="jpdb-subtitle-track-hint">${escapeHtml(uiText(language, "subtitleTracksHint"))}</div>
            ${state.tracks.length ? state.tracks.map((track) => renderSubtitleTrackRow(track, state)).join("") : ""}
        </div>
        <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeSubtitleTracksPanel"))}"></div>
    `;
  }
  function subtitleDrawerMetaText(options) {
    const primaryTrack = options.tracks.find((track) => track.id === options.selectedTrackId);
    const secondaryTrack = options.tracks.find((track) => track.id === options.secondaryTrackId);
    const primary = primaryTrack ? localizedSubtitleTrackLabel(primaryTrack, options.language) : void 0;
    const secondary = secondaryTrack ? localizedSubtitleTrackLabel(secondaryTrack, options.language) : void 0;
    return drawerMetaParts(options.mode, options.count, primary, secondary, options.language).filter(Boolean).join(" · ");
  }
  function renderSubtitleTrackRow(track, state) {
    const isPrimary = track.id === state.selectedTrackId;
    const isSecondary = track.id === state.secondaryTrackId;
    const language = state.language;
    return `
        <div class="jpdb-subtitle-track-row ${isPrimary || isSecondary ? "active" : ""}" data-track-id="${escapeHtml(track.id)}">
            <div class="jpdb-subtitle-track-title">
                    <strong>${escapeHtml(localizedSubtitleTrackLabel(track, language))}</strong>
                    <span>${escapeHtml(formatTrackKind(track.kind, language))}</span>
                </div>
            <span>${escapeHtml(trackLanguageLabel(track, language))}${trackRoleText(isPrimary, isSecondary, language)}${trackStatusText(track, language)}</span>
            <div class="jpdb-subtitle-track-actions">
                <button type="button" data-action="primary-track" aria-pressed="${isPrimary}">${escapeHtml(uiText(language, isPrimary ? "unsetPrimarySubtitles" : "primarySubtitles"))}</button>
                <button type="button" data-action="secondary-track" aria-pressed="${isSecondary}">${escapeHtml(uiText(language, isSecondary ? "unsetNativeSubtitles" : "nativeSubtitles"))}</button>
            </div>
        </div>
    `;
  }
  function trackPanelSummaryText(autoDetected, language) {
    return autoDetected ? autoDetected === 1 ? uiText(language, "autoDetectedOptionSingular") : `${autoDetected} ${uiText(language, "autoDetectedOptions")}` : uiText(language, "autoDetectedTracksWillAppear");
  }
  function trackLanguageLabel(track, language) {
    return track.language ? track.language.toUpperCase() : uiText(language, "detected");
  }
  function localizedSubtitleTrackLabel(track, language) {
    if (language !== "ja") return track.label;
    if (track.label === "YouTube subtitles") return uiText(language, "youTubeSubtitles");
    return track.label.replace(/ \u00b7 auto-generated$/u, ` · ${uiText(language, "autoGeneratedSubtitle")}`);
  }
  function trackRoleText(isPrimary, isSecondary, language) {
    return [
      isPrimary ? ` · ${uiText(language, "primaryOverlay")}` : "",
      isSecondary ? ` · ${uiText(language, "nativeOverlay")}` : ""
    ].join("");
  }
  function drawerMetaParts(mode, count, primary, secondary, language) {
    return mode === "tracks" ? drawerTrackMetaParts(count, primary, secondary, language) : drawerLineMetaParts(count, primary, secondary, language);
  }
  function drawerTrackMetaParts(count, primary, secondary, language) {
    return [
      `${count} ${uiText(language, count === 1 ? "subtitleOptionSingular" : "subtitleOptionPlural")}`,
      primary ? `${uiText(language, "primarySubtitles")}: ${primary}` : uiText(language, "choosePrimarySubtitles"),
      secondary ? `${uiText(language, "nativeSubtitles")}: ${secondary}` : ""
    ];
  }
  function drawerLineMetaParts(count, primary, secondary, language) {
    return [
      primary || uiText(language, "transcript"),
      `${count} ${uiText(language, count === 1 ? "subtitleLineSingular" : "subtitleLinePlural")}`,
      secondary ? `${uiText(language, "nativeSubtitles")}: ${secondary}` : ""
    ];
  }
  function hasSelectedSubtitleTrackOrLines(selectedTrackId, hasLines) {
    return Boolean(selectedTrackId || hasLines);
  }
  function subtitleTrackPanelState(tracks) {
    const sortedTracks = [...tracks].sort(compareSubtitleTrackOptions);
    return {
      tracks: sortedTracks,
      autoDetected: sortedTracks.filter(isAutoDetectedSubtitleTrack).length
    };
  }
  function syncSubtitleTrackStatus(status, trackCount, language) {
    status.textContent = subtitleTrackStatusText(trackCount, language);
  }
  function syncSubtitleLineNavigationButton(button, action, hasLines, hasVideo, hiddenByPanel, language) {
    button.hidden = !hasLines || hiddenByPanel;
    button.disabled = !hasVideo || !hasLines;
    const label = uiText(language, action === "previous" ? "previousSubtitle" : "nextSubtitle");
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  function subtitleDrawerButtonState(options) {
    const canOpenTranscript = options.hasLines || options.hasTranscriptSurface;
    const canOpenTracks = options.hasVideo || options.trackCount > 0;
    return {
      panelOpen: options.panelOpen,
      disabled: !canOpenTranscript && !canOpenTracks
    };
  }
  function syncSubtitleDrawerButton(button, options) {
    button.hidden = false;
    button.disabled = options.disabled;
    button.title = uiText(options.language, options.pressed ? "closeSubtitlePanel" : "openSubtitlePanel");
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(options.pressed));
    setInnerHtml(button, subtitleIcon(transcriptPlacementIcon(options.placement)));
  }
  function syncTranscriptPlacementButtons(panel, placement, language) {
    if (!panel || panel.hidden) return;
    const groupLabel = uiText(language, "subtitleTranscriptPlacement");
    for (const button of Array.from(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]'))) {
      const buttonPlacement = button.dataset.placement;
      const pressed = buttonPlacement === placement;
      button.setAttribute("aria-pressed", String(pressed));
      if (buttonPlacement === "left" || buttonPlacement === "right" || buttonPlacement === "bottom") {
        const label = `${groupLabel}: ${uiText(language, buttonPlacement)}`;
        button.title = label;
        button.setAttribute("aria-label", label);
      }
    }
  }
  function isAutoDetectedSubtitleTrack(track) {
    return track.kind === "youtube" || track.kind === "native" || track.kind === "remote";
  }
  function subtitleTrackStatusText(trackCount, language) {
    if (trackCount === 0) return uiText(language, "noSubtitleTracksDetected");
    if (trackCount === 1) return uiText(language, "subtitleTrackDetectedSingular");
    return `${trackCount} ${uiText(language, "subtitleTracksDetected")}`;
  }
  function applySubtitleNativeTrackModes(state) {
    const youtubePage = isYouTubePage();
    const hasYomuCaptionContent = Boolean(state.hasPrimaryCues || state.currentCueText);
    const yomuCaptionsActive = Boolean(state.overlayVisible && (state.selectedTrackId || hasYomuCaptionContent));
    if (!youtubePage) return applyGenericNativeTrackModes(state);
    return applyYouTubeNativeTrackModes(state, yomuCaptionsActive);
  }
  function applyGenericNativeTrackModes(state) {
    for (const option of state.tracks) {
      if (option.track && isSelectedSubtitleTrack(option, state)) ensureTextTrackReadable(option.track);
    }
    document.documentElement.classList.remove("jpdb-subtitle-yomu-captions-active");
    return false;
  }
  function applyYouTubeNativeTrackModes(state, yomuCaptionsActive) {
    applyYouTubeTextTrackModes(state);
    const hideYouTubeNativeCaptions = yomuCaptionsActive;
    document.documentElement.classList.toggle("jpdb-subtitle-yomu-captions-active", hideYouTubeNativeCaptions);
    return hideYouTubeNativeCaptions;
  }
  function applyYouTubeTextTrackModes(state) {
    for (const option of state.tracks) {
      if (option.track) option.track.mode = isSelectedSubtitleTrack(option, state) ? "hidden" : "disabled";
    }
  }
  function isSelectedSubtitleTrack(option, state) {
    return option.id === state.selectedTrackId || option.id === state.secondaryTrackId;
  }
  function mutationNodes(mutation, options = {}) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes)
    ];
    if (options.removed) nodes.push(...Array.from(mutation.removedNodes));
    return nodes;
  }
  function mutationInsideClosest(mutation, selector) {
    return mutationNodes(mutation, { removed: true }).every((node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean(element?.closest?.(selector));
    });
  }
  function subtitleSourceContextKey(video) {
    const url = new URL(location.href);
    url.hash = "";
    if (isYouTubePage()) return getYouTubeVideoId() ? `youtube:${getYouTubeVideoId()}` : "";
    if (isCijVideoPage()) return `cij:${url.origin}${url.pathname}${url.search}`;
    const videoSource = videoSourceKey(video);
    return `page:${url.origin}${url.pathname}${url.search}${videoSource ? `|video:${videoSource}` : ""}`;
  }
  function videoSourceKey(video) {
    if (!video) return "";
    const direct = video.currentSrc || video.src;
    if (direct) return normalizeMediaSourceForContext(direct);
    const source = video.querySelector("source[src]")?.src;
    return source ? normalizeMediaSourceForContext(source) : "";
  }
  function normalizeMediaSourceForContext(value) {
    try {
      const url = new URL(value, location.href);
      url.hash = "";
      return url.href;
    } catch {
      return value;
    }
  }
  function isCijVideoPage() {
    return /(^|\.)cijapanese\.com$/i.test(location.hostname) && /^\/video\//i.test(location.pathname);
  }
  function shouldHideSubtitleRoot(settings, video, cues, tracks) {
    return !settings.subtitlePlayerEnabled || !Boolean(video || cues.length || tracks.length);
  }
  function shouldKeepIdleControlClass(root, settings) {
    return settings.subtitleControlsMode === "auto" && root.classList.contains("jpdb-subtitle-controls-idle");
  }
  function canUseDomCaptionFallback(options) {
    if (isYouTubePage()) {
      return Boolean(getYouTubeVideoId()) && isYouTubeOwnedVideoElement(options.video) && Boolean(options.selectedTrackId || !options.tracks.some((track) => track.kind === "youtube"));
    }
    const selectedNativeTrackNeedsDomFallback = Boolean(options.selected?.kind === "native" && options.selected.track && !options.cues.length);
    return !options.selectedTrackId || selectedNativeTrackNeedsDomFallback;
  }
  function videoSummary(video) {
    return {
      currentSrcHost: safeHost(video.currentSrc || video.src),
      width: video.videoWidth || video.clientWidth,
      height: video.videoHeight || video.clientHeight,
      textTracks: video.textTracks.length
    };
  }
  function safeHost(value) {
    try {
      return new URL(value, location.href).host;
    } catch {
      return value ? "inline-or-invalid" : "";
    }
  }
  function mutationInsideReaderRoot$1(mutation) {
    return mutationInsideClosest(mutation, "[data-jpdb-reader-root]");
  }
  function mutationCouldAffectVideoDiscovery(mutation) {
    return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some(nodeContainsVideoElement);
  }
  function nodeContainsVideoElement(node) {
    if (node instanceof HTMLVideoElement) return true;
    return node instanceof Element && Boolean(node.querySelector("video"));
  }
  function renderSubtitlePrimary(input) {
    const activeCue = input.cue;
    const parsedHasReaderWords = input.parsedHtml?.includes("jpdb-reader-word") ?? false;
    const karaokeActive = input.karaokeMode && cueHasExactWordTimings(activeCue) && !parsedHasReaderWords;
    const mode = subtitlePrimaryRenderMode(input, karaokeActive, parsedHasReaderWords);
    return {
      html: renderSubtitlePrimaryHtml(input, mode),
      karaokeActive,
      shouldRequestParse: input.hasParser && !input.parsedHtml,
      nextRenderedPrimary: nextRenderedPrimaryCache(input, karaokeActive)
    };
  }
  function subtitlePrimaryRenderMode(input, karaokeActive, parsedHasReaderWords) {
    if (parsedHasReaderWords) return "parsed";
    if (hasPlainKaraokeRender(input, karaokeActive)) return "karaoke";
    if (input.parsedHtml) return "parsed";
    if (hasReusablePrimaryParserCache(input)) return "cached-parser";
    return parserFallbackRenderMode(input.hasParser);
  }
  function hasPlainKaraokeRender(input, karaokeActive) {
    return Boolean(karaokeActive && input.cue);
  }
  function parserFallbackRenderMode(hasParser) {
    return hasParser ? "loading-parser" : "plain";
  }
  function hasReusablePrimaryParserCache(input) {
    return Boolean(input.hasParser && input.lastRenderedText === input.text && input.lastRenderedHtml);
  }
  function renderSubtitlePrimaryHtml(input, mode) {
    return SUBTITLE_PRIMARY_RENDERERS[mode](input);
  }
  const SUBTITLE_PRIMARY_RENDERERS = {
    parsed: (input) => input.parsedHtml ?? "",
    karaoke: (input) => renderSubtitleKaraokeCue(input.cue, input.time),
    "cached-parser": (input) => input.lastRenderedHtml,
    "loading-parser": (input) => `<span class="jpdb-subtitle-primary-loading">${escapeWithBreaks(input.text)}</span>`,
    plain: (input) => escapeWithBreaks(input.text)
  };
  function nextRenderedPrimaryCache(input, karaokeActive) {
    if (input.parsedHtml) return { text: input.text, html: input.parsedHtml };
    return karaokeActive ? { text: input.text, html: "" } : void 0;
  }
  function renderSubtitleSecondary(text, nativeBlurred, language = "en") {
    const blurClass = nativeBlurred ? "jpdb-subtitle-secondary-blurred" : "jpdb-subtitle-secondary-clear";
    const label = uiText(language, "toggleNativeSubtitleBlur");
    return `<button class="jpdb-subtitle-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="${label}" aria-label="${label}">${escapeWithBreaks(text)}</button>`;
  }
  function renderSubtitleKaraokeCue(cue, time) {
    if (!cue?.text.trim()) return "";
    if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
    const words = cue.words;
    if (!words.length) return "";
    const progress = karaokeCharacterProgress(cue, words, time);
    return renderKaraokeTextParts(cue.text, progress);
  }
  function updatePageSubtitleTrack(track, source) {
    if (track.label === source.label && track.language === source.language && track.sourceKey === source.sourceKey) return false;
    track.label = source.label;
    track.language = source.language;
    track.sourceKey = source.sourceKey;
    return true;
  }
  function isStalePageSubtitleTrack(track, sourceKeys, sourceUrls) {
    return track.kind === "remote" && !sourceKeys.has(track.sourceKey ?? "") && !hasCurrentPageSubtitleTrackUrl(track, sourceUrls);
  }
  function hasCurrentPageSubtitleTrackUrl(track, sourceUrls) {
    return Boolean(track.url && sourceUrls.has(normalizedSubtitleUrl(track.url)));
  }
  function compareNativeOverlaySubtitleTrackOptions(a, b) {
    return Number(isAutoGeneratedSubtitleTrack(a)) - Number(isAutoGeneratedSubtitleTrack(b)) || compareSubtitleTrackOptions(a, b);
  }
  function loadedTrackState(cues) {
    return cues.length ? "ready" : "waiting";
  }
  function planTranscriptHydrationIndexes(options) {
    const indexes = /* @__PURE__ */ new Set();
    addVisibleIndexes(indexes, options);
    const cappedOptions = { ...options, maxRows: Math.max(options.maxRows, indexes.size) };
    addPreferredIndexes(indexes, cappedOptions);
    const nextCursor = addBackgroundIndexes(indexes, cappedOptions);
    return { indexes: [...indexes].sort((a, b) => a - b), nextCursor };
  }
  function addPreferredIndexes(indexes, options) {
    if (options.preferredIndex >= 0) {
      for (const index of preferredHydrationRange(options)) {
        if (shouldStopHydrating(indexes, index, options)) break;
        addHydrationIndex(indexes, index, options);
        if (indexes.size >= options.maxRows) break;
      }
      return;
    }
    for (let index = 0; index < fallbackHydrationRows(options); index++) {
      if (shouldStopHydrating(indexes, index, options)) break;
      addHydrationIndex(indexes, index, options);
    }
  }
  function preferredHydrationRange(options) {
    const start = options.preferredIndex - options.activeBehind;
    const end = options.preferredIndex + options.activeAhead;
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => start + offset);
  }
  function addHydrationIndex(indexes, index, options) {
    if (index >= 0 && index < options.rowCount) indexes.add(index);
  }
  function shouldStopHydrating(indexes, index, options) {
    return indexes.size >= options.maxRows && !indexes.has(index);
  }
  function fallbackHydrationRows(options) {
    return Math.min(options.fallbackRows ?? 6, options.rowCount);
  }
  function addVisibleIndexes(indexes, options) {
    const rows = visibleTranscriptRows(options);
    if (!rows) return;
    for (const row of rows.elements) {
      addVisibleTranscriptRowIndex(indexes, row, rows.scrollerRect, options);
    }
  }
  function visibleTranscriptRows(options) {
    const scrollerRect = options.scroller?.getBoundingClientRect();
    return options.scroller && scrollerRect ? { elements: Array.from(options.scroller.querySelectorAll(".jpdb-subtitle-list-row")), scrollerRect } : null;
  }
  function addVisibleTranscriptRowIndex(indexes, row, scrollerRect, options) {
    const index = visibleTranscriptRowIndex(row, scrollerRect, options.rowCount);
    if (index !== null) indexes.add(index);
  }
  function visibleTranscriptRowIndex(row, scrollerRect, rowCount) {
    const rect = row.getBoundingClientRect();
    if (!isTranscriptRowVisible(rect, scrollerRect)) return null;
    const index = Number(row.dataset.rowIndex);
    return validTranscriptRowIndex(index, rowCount) ? index : null;
  }
  function isTranscriptRowVisible(rect, scrollerRect) {
    return rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom;
  }
  function validTranscriptRowIndex(index, rowCount) {
    return Number.isInteger(index) && index >= 0 && index < rowCount;
  }
  function addBackgroundIndexes(indexes, options) {
    let nextCursor = options.cursor;
    for (let count = 0; count < options.backgroundBatch && options.rowCount && indexes.size < options.maxRows; count++) {
      const index = nextCursor % options.rowCount;
      nextCursor = (nextCursor + 1) % options.rowCount;
      indexes.add(index);
    }
    return nextCursor;
  }
  const CAPTION_SELECTOR_LIST = [
    ".caption-visual-line",
    ".captions-text",
    '[data-purpose="captions-text"]',
    ".ytp-caption-segment"
  ];
  const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(",");
  const CAPTION_CONTAINER_SELECTORS = '.caption-visual-line,.captions-text,[data-purpose="captions-text"],.caption-window,.ytp-caption-segment';
  function readPageCaptionText(video, readerRoot, options = {}) {
    const direct = readDirectPageCaptionText(video, readerRoot, options);
    if (direct || !video) return direct;
    return isYouTubePage() ? readHiddenYouTubeCaptionText(video, readerRoot, options) : readNearbyPageCaptionText(video, readerRoot, options);
  }
  function readDirectPageCaptionText(video, readerRoot, options = {}) {
    return collectCaptionTexts([...document.querySelectorAll(CAPTION_SELECTORS)], video, readerRoot, false, options);
  }
  function readNearbyPageCaptionText(video, readerRoot, options = {}) {
    return collectCaptionTexts(
      [...document.querySelectorAll("span, p, div")],
      video,
      readerRoot,
      true,
      options
    );
  }
  function readHiddenYouTubeCaptionText(video, readerRoot, options = {}) {
    const root = youtubeCaptionSearchRoot(video);
    const lines = [];
    const seen = /* @__PURE__ */ new Set();
    for (const element of Array.from(root.querySelectorAll(".ytp-caption-segment, .caption-window"))) {
      const text = hiddenYouTubeCaptionLine(element, readerRoot, options);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(text);
      if (lines.length >= 2) break;
    }
    return lines.join(" ").replace(/\s+/g, " ").trim();
  }
  function youtubeCaptionSearchRoot(video) {
    return video.closest("#movie_player, .html5-video-player, ytd-player, ytd-watch-flexy, ytd-reel-video-renderer, ytd-shorts") ?? video.parentElement ?? document;
  }
  function hiddenYouTubeCaptionLine(element, readerRoot, options = {}) {
    if (isCaptionElementExcluded(element, readerRoot)) return "";
    const text = normalizeCaptionText(element.innerText || element.textContent || "");
    return isAllowedCaptionText(text, options) ? text : "";
  }
  function collectCaptionTexts(elements, video, readerRoot, nearVideoOnly = false, options = {}) {
    const lines = [];
    const seen = /* @__PURE__ */ new Set();
    for (const element of elements) {
      if (!isLikelyCaptionElement(element, video, readerRoot, nearVideoOnly, options)) continue;
      const text = unseenCaptionText(element, seen);
      if (!text) continue;
      seen.add(text);
      lines.push(text);
      if (lines.length >= 2) break;
    }
    return lines.join(" ").replace(/\s+/g, " ").trim();
  }
  function unseenCaptionText(element, seen) {
    const text = normalizeCaptionText(element.innerText || element.textContent || "");
    return text && !seen.has(text) ? text : "";
  }
  function isLikelyCaptionElement(element, video, readerRoot, nearVideoOnly = false, options = {}) {
    if (!isCaptionCandidateElement(element, readerRoot, options)) return false;
    const rect = element.getBoundingClientRect();
    return isVisibleCaptionRect(element, rect) && matchesCaptionVideoScope(rect, video, nearVideoOnly);
  }
  function isCaptionCandidateElement(element, readerRoot, options = {}) {
    if (isCaptionElementExcluded(element, readerRoot)) return false;
    return isCaptionTextShape(element, normalizeCaptionText(element.innerText || element.textContent || ""), options);
  }
  function matchesCaptionVideoScope(rect, video, nearVideoOnly = false) {
    if (!video) return !nearVideoOnly;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return !nearVideoOnly;
    return isCaptionNearVideo(rect, videoRect);
  }
  function isCaptionElementExcluded(element, readerRoot) {
    return !element.isConnected || Boolean(readerRoot && (element === readerRoot || readerRoot.contains(element))) || Boolean(element.closest([
      "[data-jpdb-reader-root]",
      ".asbplayer-offscreen",
      ".asbplayer-subtitles-container-bottom",
      ".asbplayer-subtitle",
      ".asbplayer-drag-zone",
      ".asbplayer-overlay-container",
      "script",
      "style",
      "noscript",
      "textarea",
      "input",
      "select",
      "button"
    ].join(",")));
  }
  function isCaptionTextShape(element, text, options) {
    const allowsChildText = element.matches(CAPTION_CONTAINER_SELECTORS);
    if (!isAllowedCaptionText(text, options)) return false;
    if (text.split("\n").length > 4) return false;
    return allowsChildText || !hasCaptionChildText(element, options);
  }
  function isAllowedCaptionText(text, options) {
    return hasCaptionTextLength(text) && (options.allowNonJapanese || isJapaneseCaptionText(text));
  }
  function isJapaneseCaptionText(text) {
    return Boolean(text && /[\u3040-\u30ff\u3400-\u9fff]/.test(text));
  }
  function hasCaptionTextLength(text) {
    return text.length >= 2 && text.length <= 180;
  }
  function hasCaptionChildText(element, options) {
    return [...element.children].some((child) => isAllowedCaptionText(normalizeCaptionText(child.textContent ?? ""), options));
  }
  function isVisibleCaptionRect(element, rect) {
    if (!hasVisibleCaptionRectBounds(rect)) return false;
    const style = getComputedStyle(element);
    return hasVisibleCaptionStyle(style);
  }
  function hasVisibleCaptionRectBounds(rect) {
    return rect.width >= 24 && rect.height >= 10 && rect.bottom >= 0 && rect.top <= window.innerHeight;
  }
  function hasVisibleCaptionStyle(style) {
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
  }
  function isCaptionNearVideo(rect, videoRect) {
    const horizontalOverlap2 = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap2 / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = captionOverlapsVideo(rect, videoRect, overlapRatio);
    const belowVideo = captionSitsBelowVideo(rect, videoRect, overlapRatio);
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    return !tooLarge && (overlapsVideo || belowVideo);
  }
  function captionOverlapsVideo(rect, videoRect, overlapRatio) {
    return rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
  }
  function captionSitsBelowVideo(rect, videoRect, overlapRatio) {
    return rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
  }
  function isApiMiningEnabled(settings) {
    return settings.jpdbMiningEnabled;
  }
  const SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS = 1200;
  const SUBTITLE_EMPTY_PARSE_RETRY_MS = 2500;
  function canParseSubtitleTranscriptRows(settings) {
    return hasSubtitleParserSource();
  }
  function shouldApplyParsedTranscriptHtml(target, key2, provisional = false) {
    if (target.dataset.parseKey !== key2) return false;
    if (target.dataset.parsedKey !== key2) return true;
    return !provisional && target.dataset.parsedProvisional === "true";
  }
  function hasAttemptedTranscriptParse(target, key2) {
    return target.dataset.parsedKey === key2 || hasRecentTranscriptParseAttempt(target.dataset.parseEmptyKey, target.dataset.parseEmptyAt, key2) || hasRecentTranscriptParseAttempt(target.dataset.parseFailedKey, target.dataset.parseFailedAt, key2);
  }
  function parsedSubtitleHtmlHasReaderWords(html) {
    return html.includes("jpdb-reader-word");
  }
  function subtitleParseSourceSignature(settings) {
    const jpdbApiKey = effectiveJpdbApiKey(settings);
    const jitenApiKey = effectiveJitenApiKey(settings);
    return [
      jpdbApiKey ? `jpdb-api:${stableSubtitleHash(jpdbApiKey)}` : "jpdb-api:off",
      jitenApiKey ? `jiten-api:${stableSubtitleHash(jitenApiKey)}` : "jiten-api:off",
      settings.localDictionariesEnabled ? "local:on" : "local:off",
      settings.localDictionariesEnabled ? dictionaryPreferencesSignature(settings) : "",
      settings.ankiEnabled ? `anki:${stableSubtitleHash(settings.ankiConnectUrl.trim())}` : "anki:off",
      isApiMiningEnabled(settings) ? "api-mining:on" : "api-mining:off"
    ].join("|");
  }
  function waitForBackgroundTranscriptParseTurn(delayMs) {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  function subtitleParseOptions(settings) {
    return {
      jpdbTimeoutMs: SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS,
      allowJpdbTimeoutFallback: true,
      allowSegmentedFallback: shouldAllowSegmentedSubtitleFallback(),
      includeLocalPitch: false
    };
  }
  function provisionalSubtitleParseOptions() {
    return {
      skipJpdb: true,
      allowSegmentedFallback: true,
      includeLocalPitch: false
    };
  }
  function authoritativeSubtitleParseOptions() {
    return {
      requireJpdb: true,
      includeLocalPitch: false
    };
  }
  function hasSubtitleParserSource(_settings) {
    return true;
  }
  function hasRecentTranscriptParseAttempt(markerKey, markerAt, key2) {
    if (markerKey !== key2) return false;
    const markedAt = Number(markerAt || 0);
    return Number.isFinite(markedAt) && Date.now() - markedAt < SUBTITLE_EMPTY_PARSE_RETRY_MS;
  }
  function stableSubtitleHash(value) {
    return stableHashBase36(value);
  }
  function dictionaryPreferencesSignature(settings) {
    return settings.dictionaryPreferences.map((preference) => [
      preference.name,
      preference.alias,
      preference.enabled ? "1" : "0",
      preference.priority,
      preference.allowSecondarySearches ? "1" : "0",
      preference.type ?? ""
    ].join(",")).join(";");
  }
  function shouldAllowSegmentedSubtitleFallback(_settings) {
    return true;
  }
  function renderControllerPrimarySubtitle(options) {
    const hasReusablePrimary = options.lastRenderedKey === options.parseKey && (parsedSubtitleHtmlHasReaderWords(options.lastRenderedHtml) || options.hasFreshEmptyParsedHtml);
    return renderSubtitlePrimary({
      cue: options.cue,
      text: options.text,
      parsedHtml: options.parsedHtml,
      hasParser: options.hasParser,
      lastRenderedText: hasReusablePrimary ? options.lastRenderedText : "",
      lastRenderedHtml: hasReusablePrimary ? options.lastRenderedHtml : "",
      karaokeMode: options.settings.subtitleKaraokeMode,
      time: options.time
    });
  }
  function planSubtitleParseBatch(items, cachedHtml, pendingHtml) {
    const ready = [];
    const batch = [];
    for (const item of items) {
      const cached = cachedHtml(item.key);
      if (cached !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: cached }));
        continue;
      }
      const pending = pendingHtml(item.key);
      if (pending) ready.push(pending.then((html) => ({ key: item.key, html })));
      else batch.push(item);
    }
    return { ready, batch };
  }
  function planProvisionalSubtitleParseBatch(items, parsedHtmlCache, provisionalParsedHtmlCache, pendingProvisionalParsedHtml) {
    const ready = [];
    const batch = [];
    for (const item of items) {
      const cached = parsedHtmlCache.get(item.key);
      if (cached !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: cached }));
        continue;
      }
      const provisional = provisionalParsedHtmlCache.get(item.key);
      if (provisional !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: provisional, provisional: true }));
        continue;
      }
      const pending = pendingProvisionalParsedHtml.get(item.key);
      if (pending) ready.push(pending.then((html) => ({ key: item.key, html, provisional: true })));
      else batch.push(item);
    }
    return { ready, batch };
  }
  const SUBTITLE_REQUEST_TIMEOUT_MS = 8e3;
  function requestSubtitleText(url) {
    if (/^(blob|data):/i.test(url)) {
      return fetchSubtitleText(url);
    }
    if (isYouTubeTimedTextUrl(url)) {
      return requestSubtitleTextWithUserscript(url).catch((error) => fetchSubtitleText(url).catch(() => Promise.reject(error)));
    }
    if (shouldFetchSubtitleInPageContext(url)) {
      return fetchSubtitleText(url).catch((error) => requestSubtitleTextWithUserscript(url, error));
    }
    return requestSubtitleTextWithUserscript(url);
  }
  function subtitleRequestFailureDetails(url) {
    try {
      const parsed = new URL(url, location.href);
      return {
        host: parsed.hostname,
        path: parsed.pathname,
        format: parsed.searchParams.get("fmt") ?? "",
        language: parsed.searchParams.get("lang") ?? ""
      };
    } catch {
      return { url: "invalid" };
    }
  }
  function requestSubtitleTextWithUserscript(url, pageFetchError) {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
      return new Promise((resolve, reject) => {
        userscriptRequest({
          method: "GET",
          url,
          responseType: "text",
          timeout: SUBTITLE_REQUEST_TIMEOUT_MS,
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(String(response.responseText ?? response.response ?? "")) : reject(new Error(`Subtitle request failed (${response.status}).`)),
          onerror: reject,
          ontimeout: () => reject(new Error("Subtitle request timed out."))
        });
      });
    }
    if (pageFetchError) return Promise.reject(pageFetchError);
    return fetchSubtitleText(url);
  }
  function fetchSubtitleText(url) {
    return fetch(url, { credentials: "include", signal: subtitleRequestSignal() }).then((response) => {
      if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
      return response.text();
    });
  }
  function subtitleRequestSignal() {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(SUBTITLE_REQUEST_TIMEOUT_MS) : void 0;
  }
  function shouldFetchSubtitleInPageContext(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin;
    } catch {
      return false;
    }
  }
  function isYouTubeTimedTextUrl(url) {
    if (!isYouTubePage()) return false;
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)youtube\.com$/i.test(parsed.hostname) && /\/api\/timedtext$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  const TRANSCRIPT_PANEL_ANIMATION_MS = 180;
  const TRANSCRIPT_PANEL_MIN_SIDE_WIDTH = 340;
  const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_WIDTH = 560;
  const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_RATIO = 0.52;
  const TRANSCRIPT_PANEL_KEYBOARD_STEP_PX = 48;
  function transcriptResizeBounds(viewportWidth, viewportHeight) {
    return {
      maxBottomHeight: maxTranscriptBottomPanelHeight(viewportHeight, TRANSCRIPT_PANEL_MARGIN),
      maxSideWidth: Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, viewportWidth - TRANSCRIPT_PANEL_MARGIN * 3)
    };
  }
  function transcriptResizeKeyboardDirection(placement, key2) {
    if (key2 === transcriptResizeIncreaseKey(placement)) return 1;
    if (key2 === transcriptResizeDecreaseKey(placement)) return -1;
    return 0;
  }
  function transcriptResizeHandleMetrics(options) {
    return isBottomTranscriptPlacement(options.layout?.placement ?? options.placement) ? transcriptBottomResizeHandleMetrics(options) : transcriptSideResizeHandleMetrics(options);
  }
  function transcriptResizePatchForKeyboard(options) {
    const delta = options.direction * TRANSCRIPT_PANEL_KEYBOARD_STEP_PX;
    if (isBottomTranscriptPlacement(options.placement)) {
      return {
        bottomHeight: Math.round(clampNumber(
          options.panelRect.height + delta,
          TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
          options.bounds.maxBottomHeight
        ))
      };
    }
    return {
      sideWidth: Math.round(clampNumber(
        options.panelRect.width + delta,
        TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
        options.bounds.maxSideWidth
      ))
    };
  }
  function transcriptResizePatchForPointerDrag(options) {
    if (options.placement === "bottom") {
      return {
        bottomHeight: Math.round(clampNumber(
          options.startHeight + options.startY - options.currentY,
          TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
          options.bounds.maxBottomHeight
        ))
      };
    }
    const widthDelta = options.placement === "left" ? options.currentX - options.startX : options.startX - options.currentX;
    return {
      sideWidth: Math.round(clampNumber(
        options.startWidth + widthDelta,
        TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
        options.bounds.maxSideWidth
      ))
    };
  }
  function shouldUseBottomTranscriptLayoutForAvailableWidth(videoWidth, availableWidth) {
    const referenceWidth = Math.max(videoWidth, availableWidth);
    return availableWidth < minimumSideTranscriptPlayerWidth(referenceWidth);
  }
  function minimumSideTranscriptPlayerWidth(referenceWidth) {
    return Math.min(
      referenceWidth,
      Math.max(TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_WIDTH, referenceWidth * TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_RATIO)
    );
  }
  function transcriptBottomResizeHandleMetrics(options) {
    return {
      current: options.layout?.height ?? options.panelRect?.height ?? 0,
      max: options.bounds.maxBottomHeight,
      min: TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT,
      orientation: "horizontal"
    };
  }
  function transcriptSideResizeHandleMetrics(options) {
    return {
      current: options.layout?.width ?? options.panelRect?.width ?? 0,
      max: options.bounds.maxSideWidth,
      min: TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
      orientation: "vertical"
    };
  }
  function isBottomTranscriptPlacement(placement) {
    return placement === "bottom";
  }
  function transcriptResizeIncreaseKey(placement) {
    if (placement === "bottom") return "ArrowUp";
    return placement === "left" ? "ArrowRight" : "ArrowLeft";
  }
  function transcriptResizeDecreaseKey(placement) {
    if (placement === "bottom") return "ArrowDown";
    return placement === "left" ? "ArrowLeft" : "ArrowRight";
  }
  const YOUTUBE_SUBTITLE_NAVIGATION_EVENTS = [
    "yt-navigate-finish",
    "yt-page-data-updated",
    "yt-page-type-changed",
    "popstate",
    "hashchange"
  ];
  function isYouTubeTheaterMode() {
    return isYouTubePage() && Boolean(document.querySelector("ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]"));
  }
  function subtitleMinimumFontSize(root) {
    const rootRect = root.getBoundingClientRect();
    return rootRect.width < 420 || rootRect.height < 260 ? 11 : 14;
  }
  function subtitleFrameTargetFontSize(root, settings) {
    const rootRect = root.getBoundingClientRect();
    const width = Math.max(1, rootRect.width);
    const height = Math.max(1, rootRect.height);
    const baseline = Math.max(16, Math.min(64, settings.subtitleFontSize));
    const frameScale = Math.sqrt(Math.min(width / 1280, height / 720));
    const scaled = Math.round(baseline * Math.max(0.62, Math.min(1.45, frameScale)));
    return Math.max(subtitleMinimumFontSize(root), Math.min(64, scaled));
  }
  function subtitleElementOverflows(element) {
    return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
  }
  function nextSubtitleFontSize(element, fitted, minimum) {
    const heightScale = element.clientHeight / Math.max(1, element.scrollHeight);
    const widthScale = element.clientWidth / Math.max(1, element.scrollWidth);
    return Math.max(minimum, Math.floor(fitted * Math.min(0.92, heightScale, widthScale)));
  }
  function applyKaraokeClassToWordElement(element, cursor, progress) {
    element.classList.remove("jpdb-subtitle-word-pending", "jpdb-subtitle-word-spoken", "jpdb-subtitle-word-current");
    const surface = readerWordSurfaceText(element).replace(/\s+/g, "");
    if (!surface) return cursor;
    const start = cursor;
    const end = cursor + compactTextLength(surface);
    element.classList.add(karaokeWordClass(progress, start, end));
    return end;
  }
  function karaokeWordClass(progress, start, end) {
    if (progress >= end) return "jpdb-subtitle-word-spoken";
    return progress > start ? "jpdb-subtitle-word-current" : "jpdb-subtitle-word-pending";
  }
  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  function clearWindowTimeout(id) {
    if (id !== void 0) window.clearTimeout(id);
    return void 0;
  }
  function clearWindowAnimationFrame(id) {
    if (id !== void 0) window.cancelAnimationFrame(id);
    return void 0;
  }
  const SUBTITLE_ACTIVE_PREPARSE_BEHIND = 2;
  const SUBTITLE_ACTIVE_PREPARSE_AHEAD = 7;
  const SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS = 2500;
  const TRANSCRIPT_ACTIVE_HYDRATION_BEHIND = 1;
  const TRANSCRIPT_ACTIVE_HYDRATION_AHEAD = 3;
  const TRANSCRIPT_HYDRATION_MAX_ROWS = 12;
  const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 1;
  const TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY = 2;
  const TRANSCRIPT_BACKGROUND_PARSE_BATCH = 4;
  const TRANSCRIPT_BACKGROUND_PARSE_AHEAD = 32;
  const TRANSCRIPT_BACKGROUND_PARSE_BEHIND = 6;
  const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = 40;
  const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
  const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
  const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 5e3;
  const YOUTUBE_CAPTION_ACTIVATION_RETRY_MS = 2e3;
  const DOM_CAPTION_STABLE_DELAY_MS = 180;
  const YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY = "youtube-dom-caption-fallback";
  const SUBTITLE_FILE_ACCEPT = ".srt,.vtt,.ass,.ssa,text/vtt";
  const log$1 = Logger.scope("Subtitles");
  const TRACK_LOAD_OPTIONS = {
    requestText: requestSubtitleText,
    onYouTubeRequestError: (track, url, error) => log$1.debug("YouTube subtitle request failed", {
      label: track.label,
      ...subtitleRequestFailureDetails(url),
      error
    })
  };
  function normalizedSubtitleText(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }
  function transcriptWarmupIndexes(priority, focusIndex, rowCount) {
    return [
      ...priority,
      ...forwardIndexes(focusIndex, Math.min(rowCount, focusIndex + TRANSCRIPT_BACKGROUND_PARSE_AHEAD)),
      ...backwardIndexes(focusIndex - 1, Math.max(0, focusIndex - TRANSCRIPT_BACKGROUND_PARSE_BEHIND))
    ];
  }
  function uniqueSubtitleParseTexts(texts) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const text of texts.map((value) => value.trim()).filter(Boolean)) {
      if (seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }
  function forwardIndexes(start, endExclusive) {
    const indexes = [];
    for (let index = start; index < endExclusive; index++) indexes.push(index);
    return indexes;
  }
  function backwardIndexes(start, endInclusive) {
    const indexes = [];
    for (let index = start; index >= endInclusive; index--) indexes.push(index);
    return indexes;
  }
  function shouldReplaceLoadedCue(next, current) {
    return Boolean(next && next !== current);
  }
  function shouldClearLoadedCue(next, current, time) {
    return Boolean(!next && current && time > current.end + 0.12);
  }
  function subtitleClipboardText(primary, secondary) {
    return [primary?.text.trim(), secondary?.text.trim()].filter(Boolean).join("\n");
  }
  function fittedSubtitleFontSize(element, fitted, minimum, apply) {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!subtitleElementOverflows(element)) return fitted;
      const next = nextSubtitleFontSize(element, fitted, minimum);
      if (next >= fitted) break;
      fitted = next;
      apply(fitted);
    }
    return fitted;
  }
  class SubtitlePlayerController {
    constructor(options) {
      this.options = options;
    }
    root;
    subtitleEl;
    transcriptPanel;
    abortController;
    video;
    cues = [];
    secondaryCues = [];
    tracks = [];
    currentCue;
    secondaryCue;
    observer;
    videoResizeObserver;
    discoverTimer;
    tickTimer;
    alignFrame;
    destroyed = false;
    selectedTrackId = "";
    secondaryTrackId = "";
    youtubeVideoId = "";
    youtubeAutoSelectSuppressedVideoId = "";
    lastDomCaption = "";
    pendingDomCaption;
    parsedHtmlCache = /* @__PURE__ */ new Map();
    provisionalParsedHtmlCache = /* @__PURE__ */ new Map();
    emptyParsedHtmlCache = /* @__PURE__ */ new Map();
    pendingParsedHtml = /* @__PURE__ */ new Map();
    pendingProvisionalParsedHtml = /* @__PURE__ */ new Map();
    parsedTokenCache = /* @__PURE__ */ new Map();
    parsedTokenNotifiedAt = /* @__PURE__ */ new Map();
    transcriptTextTargetsByParseKey = /* @__PURE__ */ new Map();
    renderSerial = 0;
    panelMode = "lines";
    lastTranscriptSignature = "";
    transcriptScrollFrame;
    transcriptHydrateFrame;
    transcriptInsetRealignFrame;
    transcriptPanelAnimationFrame;
    transcriptPanelHideTimer;
    pointerActivityFrame;
    pendingPointerActivity;
    controlsIdleTimer;
    transcriptHydrationSerial = 0;
    transcriptCacheWarmupSerial = 0;
    transcriptCacheWarmupSignature = "";
    transcriptPanelSize = loadTranscriptPanelSize();
    videoInset = createSubtitleVideoInsetAdapter();
    lastYomuCaptionsActive = false;
    youtubeDomCaptionFallbackTrackId = "";
    fullscreen = false;
    lastRenderedPrimaryText = "";
    lastRenderedPrimaryHtml = "";
    lastRenderedPrimaryKey = "";
    parseWarmupSerial = 0;
    transcriptHydrationCursor = 0;
    effectiveTranscriptPlacement = "right";
    lastAutoCopiedCueSignature = "";
    youtubeTrackDiscoveryInFlight = false;
    lastYouTubeTrackDiscoveryAt = 0;
    lastYouTubeCaptionActivationAt = 0;
    transcriptPanelClosing = false;
    transcriptLayoutReferenceRect;
    transcriptLayoutReferenceViewport = "";
    primarySelectionRequest = 0;
    secondarySelectionRequest = 0;
    subtitleSourceContextKey = "";
    pausePanelOpen = false;
    pausePanelDismissed = false;
    clickHandlers = {
      cue: (target) => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
      previous: () => this.seekSubtitle(-1),
      next: () => this.seekSubtitle(1),
      copy: () => {
        void this.copySubtitle();
      },
      "copy-row": (target) => {
        void this.copyTranscriptRow(this.rowIndexFromTarget(target));
      },
      load: () => this.openSubtitleFilePicker("primary"),
      "load-secondary": () => this.openSubtitleFilePicker("secondary"),
      panel: () => this.toggleTranscriptDrawer(),
      "panel-lines": () => this.openLinesPanel(),
      "panel-tracks": () => this.openTracksPanel(),
      "close-panel": () => this.closeTranscriptPanel(),
      "transcript-placement": (target) => this.changeTranscriptPlacement(target),
      "toggle-pause-panel": () => this.togglePausePanelMode(),
      "primary-track": (target) => {
        void this.choosePrimaryTrack(this.trackIdFromTarget(target));
      },
      "secondary-track": (target) => {
        void this.chooseSecondaryTrack(this.trackIdFromTarget(target));
      },
      "toggle-native-blur": () => this.toggleNativeSubtitleBlur()
    };
    init() {
      this.destroy();
      this.destroyed = false;
      this.abortController = new AbortController();
      this.install();
      this.observer = new MutationObserver((mutations) => {
        if (mutations.every(mutationInsideReaderRoot$1)) return;
        if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
        this.scheduleDiscoverVideo();
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("keydown", (event) => this.handleKeydown(event), this.eventOptions());
      document.addEventListener("pointerdown", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
      document.addEventListener("pointermove", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
      window.addEventListener(OPEN_SUBTITLE_TRACKS_EVENT, () => this.openSubtitleTracksPanelFromHost(), this.eventOptions());
      for (const eventName of YOUTUBE_SUBTITLE_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, () => this.handleYouTubeNavigation(), this.eventOptions());
      }
      document.addEventListener("fullscreenchange", () => {
        this.fullscreen = Boolean(document.fullscreenElement);
        this.syncFullscreenState();
        this.scheduleAlignToVideo();
        this.render();
      }, this.eventOptions());
      window.addEventListener("scroll", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      window.addEventListener("resize", () => {
        this.scheduleAlignToVideo();
      }, this.eventOptions({ passive: true }));
      this.discoverVideo();
      this.tick();
      log$1.info("Subtitle controller initialized");
    }
    handleYouTubeNavigation() {
      if (!isYouTubePage()) return;
      this.lastYouTubeTrackDiscoveryAt = 0;
      this.scheduleDiscoverVideo();
      void this.discoverYouTubeTracksThrottled(true);
      this.scheduleAlignToVideo();
    }
    destroy() {
      this.destroyed = true;
      this.abortController?.abort();
      this.abortController = void 0;
      this.observer?.disconnect();
      this.observer = void 0;
      this.videoResizeObserver?.disconnect();
      this.videoResizeObserver = void 0;
      this.discoverTimer = clearWindowTimeout(this.discoverTimer);
      this.tickTimer = clearWindowTimeout(this.tickTimer);
      this.clearControlsIdleTimer();
      this.alignFrame = clearWindowAnimationFrame(this.alignFrame);
      this.transcriptScrollFrame = clearWindowAnimationFrame(this.transcriptScrollFrame);
      this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
      this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
      this.clearTranscriptPanelAnimation();
      this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
      this.pendingPointerActivity = void 0;
      this.clearVideoInsetForTranscriptPanel();
      this.transcriptPanel?.remove();
      this.root?.remove();
      this.root = void 0;
      this.subtitleEl = void 0;
      this.transcriptPanel = void 0;
      this.video = void 0;
    }
    eventOptions(options = {}) {
      return this.abortController ? { ...options, signal: this.abortController.signal } : options;
    }
    refresh() {
      if (!this.root) return;
      const settings = this.options.getSettings();
      this.syncRootVisibility(settings);
      this.syncTranscriptPlacementClass();
      this.syncFullscreenState();
      this.syncRootStyleSettings(settings);
      this.openTranscriptPanelFromSettings(settings);
      this.syncPauseTranscriptPanel();
      this.scheduleAlignToVideo();
      this.syncControls();
      this.render();
      this.hideControlsImmediately();
    }
    syncRootVisibility(settings) {
      if (!this.root) return;
      const hidden = shouldHideSubtitleRoot(settings, this.video, this.cues, this.tracks);
      this.root.hidden = hidden;
      if (hidden && this.transcriptPanel) this.hideTranscriptPanelElement({ immediate: true });
      this.root.classList.toggle("jpdb-subtitle-hidden", !settings.subtitleOverlayVisible);
      this.root.classList.toggle("jpdb-subtitle-controls-auto", settings.subtitleControlsMode === "auto");
      this.root.classList.toggle("jpdb-subtitle-controls-hidden", settings.subtitleControlsMode === "hidden");
      this.root.classList.toggle("jpdb-subtitle-controls-always", settings.subtitleControlsMode === "always");
      this.root.classList.toggle("jpdb-subtitle-controls-idle", shouldKeepIdleControlClass(this.root, settings));
      this.transcriptPanel?.classList.toggle("jpdb-subtitle-controls-hidden", settings.subtitleControlsMode === "hidden");
    }
    syncRootStyleSettings(settings) {
      if (!this.root) return;
      setStylePropertyIfChanged(this.root, "--subtitle-font-size-target", `${settings.subtitleFontSize}px`);
      setStylePropertyIfChanged(this.root, "--subtitle-font-size", `${settings.subtitleFontSize}px`);
      this.root.style.setProperty("--subtitle-bottom", `${settings.subtitleBottomOffset}%`);
      this.root.style.setProperty("--subtitle-color", settings.subtitleTextColor);
      this.root.style.setProperty("--subtitle-outline", settings.subtitleOutlineColor);
      this.root.style.setProperty("--subtitle-background-rgba", accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
      this.root.style.setProperty("--subtitle-family", settings.subtitleFontFamily);
      this.root.style.setProperty("--subtitle-weight", String(settings.subtitleFontWeight));
    }
    openTranscriptPanelFromSettings(settings) {
      if (!settings.subtitleTranscriptVisible || !this.hasTranscriptSurface() || !this.transcriptPanel?.hidden) return;
      this.panelMode = "lines";
      this.showTranscriptPanelElement();
      this.renderTranscriptPanel(true);
    }
    install() {
      if (this.root) return;
      document.querySelectorAll('.jpdb-subtitle-player[data-jpdb-reader-root="true"], .jpdb-subtitle-list[data-jpdb-reader-root="true"]').forEach((element) => element.remove());
      const root = document.createElement("div");
      root.className = "jpdb-subtitle-player";
      root.dataset.jpdbReaderRoot = "true";
      const settings = this.options.getSettings();
      const previousLabel = uiText(settings.interfaceLanguage, "previousSubtitle");
      const nextLabel = uiText(settings.interfaceLanguage, "nextSubtitle");
      const panelLabel = uiText(settings.interfaceLanguage, "openSubtitlePanel");
      setInnerHtml(root, `
            <div class="jpdb-subtitle-text" aria-live="polite"></div>
            <div class="jpdb-subtitle-status" aria-live="polite"></div>
            <div class="jpdb-subtitle-rail">
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel" title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon("panel-right")}</button>
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
        `);
      root.addEventListener("click", (event) => this.handleClick(event));
      this.subtitleEl = root.querySelector(".jpdb-subtitle-text");
      this.transcriptPanel = root.querySelector(".jpdb-subtitle-list");
      this.transcriptPanel.dataset.jpdbReaderRoot = "true";
      this.transcriptPanel.addEventListener("click", (event) => this.handleClick(event), this.eventOptions());
      this.transcriptPanel.addEventListener("keydown", (event) => this.handleTranscriptPanelKeydown(event), this.eventOptions());
      document.body.appendChild(root);
      document.body.appendChild(this.transcriptPanel);
      this.root = root;
      this.refresh();
    }
    scheduleDiscoverVideo() {
      if (this.discoverTimer !== void 0) return;
      this.discoverTimer = window.setTimeout(() => {
        this.discoverTimer = void 0;
        if (this.destroyed) return;
        this.discoverVideo();
      }, 120);
    }
    discoverVideo() {
      if (!this.shouldDiscoverVideo()) {
        this.refresh();
        return;
      }
      this.discoverEnabledVideo();
    }
    shouldDiscoverVideo() {
      const settings = this.options.getSettings();
      return settings.subtitlePlayerEnabled && settings.subtitleAutoDetect;
    }
    discoverEnabledVideo() {
      const candidate = this.discoverVideoCandidate();
      if (!candidate) {
        if (this.video && !this.isSubtitleVideoCandidate(this.video)) this.clearDiscoveredVideoCandidate();
        this.syncSubtitleSourceContext(void 0);
        this.refresh();
        return;
      }
      if (candidate && candidate !== this.video) this.useDiscoveredVideoCandidate(candidate);
      this.syncSubtitleSourceContext(candidate ?? this.video);
      this.discoverPageSubtitleTracks();
      void this.discoverYouTubeTracksThrottled(true);
      this.refresh();
    }
    discoverVideoCandidate() {
      return Array.from(document.querySelectorAll("video")).filter((video) => this.isSubtitleVideoCandidate(video)).sort(compareSubtitleVideoCandidates)[0];
    }
    isSubtitleVideoCandidate(video) {
      if (isYouTubePage() && !isYouTubeOwnedVideoElement(video)) return false;
      return video.readyState >= 1 || video.clientWidth > 120 || video.getBoundingClientRect().width > 120;
    }
    clearDiscoveredVideoCandidate() {
      this.video = void 0;
      this.subtitleSourceContextKey = "";
      this.youtubeVideoId = "";
      this.youtubeAutoSelectSuppressedVideoId = "";
      this.youtubeDomCaptionFallbackTrackId = "";
      this.clearTransientSubtitleState();
      this.removeSubtitleTracks((track) => track.kind !== "file");
      this.setNativeTrackModes();
      this.render();
      this.syncControls();
    }
    useDiscoveredVideoCandidate(candidate) {
      this.video = candidate;
      this.clearTransientSubtitleState();
      this.removeStaleNativeTracks(candidate);
      this.attachTextTracks(candidate);
      this.observeVideoLayout(candidate);
      log$1.info("Subtitle video detected", videoSummary(candidate));
    }
    attachTextTracks(video) {
      for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
      video.textTracks.addEventListener?.("addtrack", (event) => {
        if (video !== this.video) return;
        const track = event.track;
        if (track) this.addNativeTrack(track);
      }, this.eventOptions());
    }
    syncSubtitleSourceContext(video = this.video) {
      const key2 = subtitleSourceContextKey(video);
      if (!key2) return false;
      if (!this.subtitleSourceContextKey) {
        this.subtitleSourceContextKey = key2;
        return false;
      }
      if (this.subtitleSourceContextKey === key2) return false;
      this.subtitleSourceContextKey = key2;
      this.youtubeAutoSelectSuppressedVideoId = "";
      this.lastYouTubeTrackDiscoveryAt = 0;
      this.clearTransientSubtitleState();
      this.removeSubtitleTracks((track) => track.kind !== "file");
      return true;
    }
    clearTransientSubtitleState() {
      this.currentCue = void 0;
      this.secondaryCue = void 0;
      this.pendingDomCaption = void 0;
      this.lastDomCaption = "";
      this.lastAutoCopiedCueSignature = "";
      this.lastRenderedPrimaryText = "";
      this.lastRenderedPrimaryHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
    }
    removeStaleNativeTracks(video) {
      const textTracks = new Set(Array.from(video.textTracks));
      this.removeSubtitleTracks((track) => track.kind === "native" && (!track.track || !textTracks.has(track.track)));
    }
    removeSubtitleTracks(predicate) {
      const removed = this.tracks.filter(predicate);
      if (!removed.length) return 0;
      this.removeSubtitleTrackIds(new Set(removed.map((track) => track.id)));
      this.lastTranscriptSignature = "";
      this.render();
      this.renderOpenSubtitlePanel();
      this.syncControls();
      return removed.length;
    }
    removeSubtitleTrackIds(removedIds) {
      this.tracks = this.tracks.filter((track) => !removedIds.has(track.id));
      if (removedIds.has(this.selectedTrackId)) this.resetPrimarySubtitleState();
      if (removedIds.has(this.secondaryTrackId)) this.resetSecondarySubtitleState();
    }
    renderOpenSubtitlePanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
      if (this.panelMode === "tracks" || !this.hasTranscriptSurface()) this.renderTrackPanel();
      else this.renderTranscriptPanel(true);
    }
    observeVideoLayout(video) {
      this.videoResizeObserver?.disconnect();
      this.videoResizeObserver = new ResizeObserver(() => this.scheduleAlignToVideo());
      this.videoResizeObserver.observe(video);
      video.addEventListener("loadedmetadata", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      video.addEventListener("loadeddata", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      video.addEventListener("pause", () => this.syncPauseTranscriptPanel(), this.eventOptions({ passive: true }));
      video.addEventListener("play", () => {
        this.pausePanelDismissed = false;
        this.closePauseTranscriptPanel();
        this.scheduleAlignToVideo();
      }, this.eventOptions({ passive: true }));
      this.scheduleAlignToVideo();
    }
    addNativeTrack(track) {
      if (isYouTubePage()) return;
      if (this.tracks.some((item) => item.track === track)) return;
      const id = `native-${this.tracks.length}`;
      const label = track.label || track.language || `${uiText(this.options.getSettings().interfaceLanguage, "subtitleFallbackLabel")} ${this.tracks.length + 1}`;
      const option = { id, label, kind: "native", language: track.language, track };
      this.tracks.push(option);
      track.addEventListener("cuechange", () => this.updateFromNativeTrack(track), this.eventOptions());
      this.maybeAutoSelectNativeTrack(option);
      window.setTimeout(() => {
        if (this.destroyed) return;
        this.setNativeTrackModes();
        this.syncControls();
      }, 0);
      this.syncControls();
    }
    discoverPageSubtitleTracks() {
      const sources = collectPageSubtitleSources(document);
      const removed = this.removeStalePageSubtitleTracks(sources);
      if (!sources.length) return;
      const changes = this.addOrUpdatePageSubtitleTracks(sources, removed);
      this.finishPageSubtitleTrackDiscovery(changes);
    }
    removeStalePageSubtitleTracks(sources) {
      const sourceKeys = new Set(sources.map((source) => source.sourceKey));
      const sourceUrls = new Set(sources.map((source) => normalizedSubtitleUrl(source.url)));
      return this.removeSubtitleTracks((track) => isStalePageSubtitleTrack(track, sourceKeys, sourceUrls));
    }
    addOrUpdatePageSubtitleTracks(sources, removed) {
      const changes = { added: 0, updated: 0, removed };
      for (const source of sources) {
        const result = this.addOrUpdatePageSubtitleTrack(source);
        changes.added += result.added;
        changes.updated += result.updated;
      }
      return changes;
    }
    finishPageSubtitleTrackDiscovery(changes) {
      const generated = this.ensureTranslatedJapaneseTrack();
      if (changes.added || changes.updated || changes.removed || generated) {
        this.renderTrackPanel();
        this.syncControls();
      }
    }
    addOrUpdatePageSubtitleTrack(source) {
      const existing = this.findPageSubtitleTrack(source);
      if (existing) return { added: 0, updated: updatePageSubtitleTrack(existing, source) ? 1 : 0 };
      const track = this.createPageSubtitleTrack(source);
      this.tracks.push(track);
      this.maybeAutoSelectPageSubtitleTrack(track);
      return { added: 1, updated: 0 };
    }
    findPageSubtitleTrack(source) {
      return this.tracks.find((track) => track.sourceKey === source.sourceKey || track.url && sameSubtitleUrl(track.url, source.url));
    }
    createPageSubtitleTrack(source) {
      return {
        id: `remote-${this.tracks.length}`,
        label: source.label,
        kind: "remote",
        language: source.language,
        url: source.url,
        sourceKey: source.sourceKey
      };
    }
    maybeAutoSelectPageSubtitleTrack(option) {
      if (option.kind !== "remote" || !option.url) return;
      const selected = this.tracks.find((track) => track.id === this.selectedTrackId);
      const secondary = this.tracks.find((track) => track.id === this.secondaryTrackId);
      if (this.shouldAutoSelectPrimaryPageTrack(option, selected)) {
        void this.selectTrack(option.id);
        return;
      }
      if (this.shouldAutoSelectSecondaryPageTrack(option, secondary)) {
        void this.selectSecondaryTrack(option.id);
      }
    }
    shouldAutoSelectPrimaryPageTrack(option, selected) {
      return isJapaneseSubtitleTrack(option) && (!this.selectedTrackId || shouldReplaceWaitingNativeTrack(selected, option, this.cues));
    }
    shouldAutoSelectSecondaryPageTrack(option, secondary) {
      return isEnglishSubtitleTrack(option) && (!this.secondaryTrackId || shouldReplaceWaitingNativeTrack(secondary, option, this.secondaryCues));
    }
    maybeAutoSelectNativeTrack(option) {
      const track = option.track;
      if (!track) return;
      const role = this.autoSelectableNativeTrackRole(option);
      if (role) this.autoSelectNativeTrack(option, track, role);
    }
    autoSelectableNativeTrackRole(option) {
      if (!this.selectedTrackId && isJapaneseSubtitleTrack(option)) return "primary";
      if (!this.secondaryTrackId && isEnglishSubtitleTrack(option)) return "secondary";
      return null;
    }
    autoSelectNativeTrack(option, track, role) {
      const requestId = this.beginTrackSelection(role);
      this.setSelectedNativeTrackId(role, option.id);
      ensureTextTrackReadable(track);
      void this.loadNativeTrackCues(option, role, requestId);
    }
    setSelectedNativeTrackId(role, id) {
      if (role === "primary") this.selectedTrackId = id;
      else this.secondaryTrackId = id;
    }
    async loadNativeTrackCues(option, role, requestId) {
      const track = option.track;
      if (!track) return;
      const cues = readTextTrackCues(track);
      const loadedCues = cues.length ? cues : await waitForTextTrackCues(track);
      if (!this.canApplyNativeTrackCues(option, role, requestId, loadedCues)) return;
      this.applyNativeTrackCues(role, option.id, loadedCues);
      option.loadingState = "ready";
      this.updateFromLoadedCues();
      this.render();
      this.syncControls();
    }
    canApplyNativeTrackCues(option, role, requestId, cues) {
      return cues.length > 0 && this.isTrackSelectionCurrent(role, requestId, option.id);
    }
    applyNativeTrackCues(role, optionId, cues) {
      if (role === "primary" && this.selectedTrackId === optionId) this.cues = cues;
      if (role === "secondary" && this.secondaryTrackId === optionId) this.secondaryCues = cues;
    }
    updateFromNativeTrack(track) {
      const active = track.activeCues?.[0];
      if (!active) return;
      this.updatePrimaryNativeTrackCue(track, active);
      this.updateSecondaryNativeTrackCue(track, active);
      this.render();
      this.renderTranscriptPanel();
      this.syncPauseTranscriptPanel();
      this.syncControls();
    }
    updatePrimaryNativeTrackCue(track, active) {
      const primary = this.tracks.find((item) => item.id === this.selectedTrackId);
      if (primary?.track === track) {
        this.currentCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active) }])[0];
        if (!this.cues.length) this.cues = readTextTrackCues(track);
        void this.autoCopyCurrentCue();
      }
    }
    updateSecondaryNativeTrackCue(track, active) {
      const secondary = this.tracks.find((item) => item.id === this.secondaryTrackId);
      if (secondary?.track === track) {
        this.secondaryCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active), transcriptEligible: false }])[0];
        if (!this.secondaryCues.length) this.secondaryCues = readTextTrackCues(track);
      }
    }
    tick() {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (settings.subtitlePlayerEnabled) this.tickSubtitlePlayer(settings);
      this.tickTimer = window.setTimeout(() => {
        this.tickTimer = void 0;
        this.tick();
      }, 250);
    }
    tickSubtitlePlayer(settings) {
      this.refreshSubtitleSourcesForTick();
      this.refreshNativeCueLists();
      this.updateFromLoadedCues();
      this.syncPlayerChromeIdleState();
      if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
      if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }
    syncPlayerChromeIdleState() {
      if (!this.root || !this.shouldAutoIdleControls() || !this.videoPlayerChromeHidden()) return;
      this.hideControlsImmediately();
    }
    refreshSubtitleSourcesForTick() {
      if (this.syncSubtitleSourceContext(this.video)) this.refreshDiscoveredSubtitleTracks();
      if (this.shouldRefreshYouTubeTracks()) void this.discoverYouTubeTracksThrottled();
    }
    refreshDiscoveredSubtitleTracks() {
      this.discoverPageSubtitleTracks();
      void this.discoverYouTubeTracksThrottled(true);
    }
    shouldRefreshYouTubeTracks() {
      return isYouTubePage() && Boolean(getYouTubeVideoId()) && (!this.video || isYouTubeOwnedVideoElement(this.video)) && (!this.selectedTrackId || !this.cues.length);
    }
    shouldUpdateFromDomCaptions() {
      if (!isYouTubePage()) return true;
      return Boolean(getYouTubeVideoId()) && isYouTubeOwnedVideoElement(this.video) && !this.cues.length && (Boolean(this.selectedTrackId) || !this.tracks.some((track) => track.kind === "youtube"));
    }
    refreshNativeCueLists() {
      const primary = this.tracks.find((item) => item.id === this.selectedTrackId);
      const secondary = this.tracks.find((item) => item.id === this.secondaryTrackId);
      this.refreshNativeCueList(primary, this.cues.length, (cues) => {
        this.cues = cues;
      });
      this.refreshNativeCueList(secondary, this.secondaryCues.length, (cues) => {
        this.secondaryCues = cues;
      });
    }
    refreshNativeCueList(track, currentLength, assign) {
      if (!track?.track) return;
      const cues = readTextTrackCues(track.track);
      if (cues.length && cues.length !== currentLength) assign(cues);
    }
    alignToVideo() {
      if (!this.root || !this.video) {
        this.root?.classList.remove("jpdb-subtitle-video-out-of-view");
        this.positionTranscriptPanel();
        return;
      }
      const rect = this.videoLayoutRect();
      this.applyVideoLayout(rect);
    }
    applyVideoLayout(rect) {
      if (!this.root) return;
      const videoVisible = isSubtitleOverlayVideoVisible(rect);
      this.root.classList.toggle("jpdb-subtitle-video-out-of-view", !videoVisible);
      if (!videoVisible) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      const layout = subtitleOverlayLayout(rect);
      this.root.classList.toggle("jpdb-subtitle-compact-video", layout.width < 560 || layout.height < 260);
      if (rect.width < 120 || rect.height < 80) {
        applyElementLayout(this.root, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
        this.positionTranscriptPanel();
        this.fitSubtitleTextToVideo();
        return;
      }
      applyElementLayout(this.root, layout);
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.fitSubtitleTextToVideo();
    }
    updateFromLoadedCues() {
      if (!this.video) return;
      const time = this.video.currentTime;
      const cue = this.selectedTrackId ? findActiveSubtitleCue(this.cues, time) : void 0;
      const secondary = this.secondaryTrackId ? findActiveSubtitleCue(this.secondaryCues, time) : void 0;
      if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
    }
    updateLoadedCueState(cue, secondary, time) {
      return this.updateLoadedPrimaryCue(cue, time) || this.updateLoadedSecondaryCue(secondary);
    }
    afterLoadedCueStateChanged() {
      this.render();
      this.renderTranscriptPanel();
      this.syncPauseTranscriptPanel();
      this.syncControls();
      this.warmParseAroundActiveCue();
      this.scheduleTranscriptCacheWarmup();
      void this.autoCopyCurrentCue();
    }
    updateLoadedPrimaryCue(cue, time) {
      if (shouldReplaceLoadedCue(cue, this.currentCue)) return this.replaceLoadedPrimaryCue(cue);
      if (shouldClearLoadedCue(cue, this.currentCue, time)) return this.clearLoadedPrimaryCue();
      return false;
    }
    replaceLoadedPrimaryCue(cue) {
      this.currentCue = cue;
      return true;
    }
    clearLoadedPrimaryCue() {
      this.currentCue = void 0;
      return true;
    }
    updateLoadedSecondaryCue(secondary) {
      if (secondary === this.secondaryCue) return false;
      this.secondaryCue = secondary;
      return true;
    }
    updateFromDomCaptions() {
      const fallback = this.domCaptionFallback();
      if (!fallback) return;
      this.applyDomCaptionFallback(fallback.text, fallback.selected);
    }
    domCaptionFallback() {
      if (this.cues.length) return null;
      let selected = this.tracks.find((track) => track.id === this.selectedTrackId);
      if (!this.shouldUseDomCaptionFallback(selected)) return null;
      selected = this.ensureDomCaptionFallbackTrack(selected);
      this.ensureYouTubeDomCaptionFallbackActive(selected);
      const text = readPageCaptionText(this.video, this.root, {
        allowNonJapanese: this.shouldAllowNonJapaneseDomCaptionFallback(selected)
      });
      if (!text) {
        this.clearDomCaptionFallbackIfExpired();
        return null;
      }
      if (!this.isDomCaptionStable(text, performance.now())) return null;
      return { text, selected };
    }
    ensureYouTubeDomCaptionFallbackActive(selected) {
      if (selected?.kind !== "youtube") return;
      if (this.youtubeDomCaptionFallbackTrackId !== this.selectedTrackId) return;
      const now = performance.now();
      if (now - this.lastYouTubeCaptionActivationAt < YOUTUBE_CAPTION_ACTIVATION_RETRY_MS) return;
      this.lastYouTubeCaptionActivationAt = now;
      activateYouTubeCaptionTrack(selected);
    }
    shouldUseDomCaptionFallback(selected) {
      if (!this.canUseDomCaptionFallback(selected)) return false;
      return this.options.getSettings().subtitleOverlayVisible;
    }
    canUseDomCaptionFallback(selected) {
      return canUseDomCaptionFallback({
        selected,
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        cues: this.cues,
        video: this.video
      });
    }
    ensureDomCaptionFallbackTrack(selected) {
      if (!isYouTubePage() || selected || this.tracks.some((track2) => track2.kind === "youtube")) return selected;
      const track = this.createYouTubeDomCaptionFallbackTrack();
      this.tracks.push(track);
      this.selectedTrackId = track.id;
      this.youtubeDomCaptionFallbackTrackId = track.id;
      return track;
    }
    createYouTubeDomCaptionFallbackTrack() {
      const videoId = getYouTubeVideoId();
      return {
        id: `youtube-dom-${this.youtubeVideoId || videoId}`,
        label: "YouTube native captions",
        kind: "youtube",
        loadingState: "waiting",
        sourceKey: YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY
      };
    }
    shouldAllowNonJapaneseDomCaptionFallback(selected) {
      return Boolean(selected?.kind === "youtube" && selected.sourceKey !== YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY);
    }
    clearDomCaptionFallbackIfExpired() {
      this.pendingDomCaption = void 0;
      if (!this.cues.length && this.currentCue && (this.video?.currentTime ?? 0) > this.currentCue.end) {
        this.currentCue = void 0;
        this.lastDomCaption = "";
        this.render();
        this.syncControls();
      }
    }
    isDomCaptionStable(text, nowMs2) {
      if (this.pendingDomCaption?.text !== text) {
        this.pendingDomCaption = { text, firstSeenAt: nowMs2 };
        return false;
      }
      return nowMs2 - this.pendingDomCaption.firstSeenAt >= DOM_CAPTION_STABLE_DELAY_MS && text !== this.lastDomCaption;
    }
    applyDomCaptionFallback(text, selected) {
      this.lastDomCaption = text;
      const now = this.video?.currentTime ?? 0;
      this.currentCue = normalizeSubtitleCues([{ start: now, end: now + 4, text }])[0];
      if (selected?.loadingState === "waiting") selected.loadingState = "ready";
      this.render();
      this.renderTranscriptPanel();
      this.syncControls();
      void this.autoCopyCurrentCue();
    }
    render() {
      if (!this.subtitleEl) return;
      const settings = this.options.getSettings();
      const text = this.currentCue?.text.trim() ?? "";
      if (!text) {
        this.renderEmptySubtitle(settings);
        return;
      }
      this.renderActiveSubtitle(text, settings);
    }
    renderEmptySubtitle(settings) {
      if (!this.subtitleEl) return;
      setInnerHtml(this.subtitleEl, this.secondaryCue?.text ? renderSubtitleSecondary(this.secondaryCue.text, settings.subtitleNativeBlurred, settings.interfaceLanguage) : "");
    }
    renderActiveSubtitle(text, settings) {
      if (!this.subtitleEl) return;
      const primary = this.renderPrimarySubtitle(text, settings);
      setInnerHtml(this.subtitleEl, `<div class="jpdb-subtitle-primary">${primary.html}</div>${this.renderSecondarySubtitle(settings)}`);
      this.applyRenderedPrimarySubtitle(primary, text);
    }
    renderPrimarySubtitle(text, settings) {
      const activeCue = this.currentCue;
      const parseKey = this.parseCacheKey(text, settings);
      return renderControllerPrimarySubtitle({
        cue: activeCue,
        text,
        settings,
        parseKey,
        parsedHtml: this.primaryParsedHtmlForRender(text, settings, parseKey),
        lastRenderedKey: this.lastRenderedPrimaryKey,
        lastRenderedText: this.lastRenderedPrimaryText,
        lastRenderedHtml: this.lastRenderedPrimaryHtml,
        hasFreshEmptyParsedHtml: this.hasFreshEmptyParsedHtml(parseKey),
        hasParser: this.shouldParseSubtitles(settings),
        time: this.video?.currentTime ?? activeCue?.start ?? 0
      });
    }
    primaryParsedHtmlForRender(text, settings, key2) {
      const cached = this.parsedHtmlCache.get(key2);
      if (cached !== void 0) return cached;
      const provisional = this.provisionalParsedHtmlCache.get(key2);
      if (provisional !== void 0) {
        if (this.shouldUseProvisionalSubtitleParse(settings)) this.ensureAuthoritativeParsedCueHtml(text, settings, key2);
        return provisional;
      }
      return void 0;
    }
    renderSecondarySubtitle(settings) {
      return settings.subtitleSecondaryVisible && this.secondaryCue?.text ? renderSubtitleSecondary(this.secondaryCue.text, settings.subtitleNativeBlurred, settings.interfaceLanguage) : "";
    }
    applyRenderedPrimarySubtitle(primary, text) {
      this.applyRenderedPrimaryKaraoke(primary);
      this.fitSubtitleTextToVideo();
      this.cacheRenderedPrimarySubtitle(primary);
      this.requestParsedPrimaryIfNeeded(primary, text);
    }
    applyRenderedPrimaryKaraoke(primary) {
      const activeCue = this.currentCue;
      if (primary.karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video?.currentTime ?? activeCue.start);
    }
    cacheRenderedPrimarySubtitle(primary) {
      if (!primary.nextRenderedPrimary) return;
      this.lastRenderedPrimaryText = primary.nextRenderedPrimary.text;
      this.lastRenderedPrimaryHtml = primary.nextRenderedPrimary.html;
    }
    requestParsedPrimaryIfNeeded(primary, text) {
      if (primary.shouldRequestParse) void this.renderParsedPrimary(text);
    }
    async renderParsedPrimary(text) {
      const settings = this.options.getSettings();
      const key2 = this.parseCacheKey(text, settings);
      const serial = ++this.renderSerial;
      const cached = this.parsedHtmlCache.get(key2);
      if (cached) {
        const root = this.replacePrimaryHtml(cached, serial);
        if (root) this.notifyParsedTokensForKey(key2, true, [root]);
        return;
      }
      try {
        const html = await this.parseCueHtml(text, settings);
        this.applyParsedPrimaryHtml(key2, text, html, serial);
      } catch {
      }
    }
    replacePrimaryHtml(html, serial) {
      if (serial !== this.renderSerial) return null;
      const primary = this.subtitleEl?.querySelector(".jpdb-subtitle-primary");
      if (primary) {
        const currentCue = this.currentCue ?? null;
        const shouldKaraoke = !parsedSubtitleHtmlHasReaderWords(html) && this.shouldRenderKaraokePrimary(primary, currentCue);
        setInnerHtml(primary, this.primaryReplacementHtml(html, currentCue, shouldKaraoke));
        this.syncKaraokePrimary(currentCue, shouldKaraoke);
        this.fitSubtitleTextToVideo();
        return primary;
      }
      return null;
    }
    shouldRenderKaraokePrimary(primary, currentCue) {
      return Boolean(this.options.getSettings().subtitleKaraokeMode && currentCue && cueHasExactWordTimings(currentCue) && normalizedSubtitleText(primary.textContent) === normalizedSubtitleText(currentCue.text));
    }
    primaryReplacementHtml(html, currentCue, shouldKaraoke) {
      return shouldKaraoke && currentCue && !html.includes("jpdb-reader-word") ? renderSubtitleKaraokeCue(currentCue, this.video?.currentTime ?? currentCue.start) : html;
    }
    syncKaraokePrimary(currentCue, shouldKaraoke) {
      if (!shouldKaraoke || !currentCue) return;
      this.applyKaraokeStateToPrimary(currentCue, this.video?.currentTime ?? currentCue.start);
    }
    shouldParseSubtitles(settings = this.options.getSettings()) {
      return canParseSubtitleTranscriptRows();
    }
    parseCacheKey(text, settings = this.options.getSettings()) {
      return [
        subtitleParseSourceSignature(settings),
        settings.showFurigana,
        settings.furiganaMode,
        settings.hideKnownFurigana,
        settings.wordHighlightColorSource,
        settings.wordUnderlineColorSource,
        settings.wordTextColorSource,
        settings.subtitleHighlightColorSource,
        settings.subtitleUnderlineColorSource,
        settings.subtitleTextColorSource,
        text
      ].join(":");
    }
    async parseCueHtml(text, settings = this.options.getSettings(), options = {}) {
      const key2 = this.parseCacheKey(text, settings);
      const cached = this.parsedHtmlCache.get(key2);
      if (cached) {
        return cached;
      }
      const emptyCached = this.freshEmptyParsedHtml(key2);
      if (emptyCached) return emptyCached;
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseProvisionalCueHtml(text, settings, key2);
      const pending = this.pendingParsedHtml.get(key2);
      if (pending) return pending;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, subtitleParseOptions());
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key2, html, tokens);
        return html;
      })();
      this.pendingParsedHtml.set(key2, promise);
      try {
        return await promise;
      } finally {
        this.pendingParsedHtml.delete(key2);
      }
    }
    async parseProvisionalCueHtml(text, settings, key2) {
      this.ensureAuthoritativeParsedCueHtml(text, settings, key2);
      const cached = this.provisionalParsedHtmlCache.get(key2);
      if (cached) {
        return cached;
      }
      const pending = this.pendingProvisionalParsedHtml.get(key2);
      if (pending) return pending;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key2, html, tokens, { provisional: true });
        return html;
      })();
      this.pendingProvisionalParsedHtml.set(key2, promise);
      try {
        return await promise;
      } finally {
        this.pendingProvisionalParsedHtml.delete(key2);
      }
    }
    ensureAuthoritativeParsedCueHtml(text, settings, key2) {
      this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key: key2 }], settings);
    }
    ensureAuthoritativeParsedCueHtmlBatch(items, settings) {
      const missing = items.filter((item) => !this.parsedHtmlCache.has(item.key) && !this.pendingParsedHtml.has(item.key));
      if (!missing.length) return;
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(missing.map((item) => item.text), authoritativeSubtitleParseOptions()) : Promise.all(missing.map((item) => this.options.parseJapanese(item.text, authoritativeSubtitleParseOptions())));
      const parsedHtml = missing.map((item, index) => parsed.then((tokens) => {
        const tokenList = tokens[index] ?? [];
        const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
        this.rememberParsedCueHtml(item.key, html, tokenList, { forceNotify: true });
        this.applyAuthoritativeParsedCueHtml(item.key, item.text, html);
        return html;
      }));
      missing.forEach((item, index) => this.pendingParsedHtml.set(item.key, parsedHtml[index]));
      void Promise.allSettled(parsedHtml).finally(() => {
        missing.forEach((item, index) => {
          if (this.pendingParsedHtml.get(item.key) === parsedHtml[index]) this.pendingParsedHtml.delete(item.key);
        });
      });
    }
    applyAuthoritativeParsedCueHtml(key2, text, html) {
      this.updateTranscriptRowsForParseKey(key2, html);
      if (this.currentPrimaryParseCacheKey() !== key2) return;
      this.applyParsedPrimaryHtml(key2, text, html, ++this.renderSerial);
    }
    applyParsedPrimaryHtml(key2, text, html, serial) {
      const root = this.replacePrimaryHtml(html, serial);
      this.lastRenderedPrimaryKey = key2;
      this.lastRenderedPrimaryText = text;
      this.lastRenderedPrimaryHtml = html;
      if (root) this.notifyParsedTokensForKey(key2, true, [root]);
    }
    currentPrimaryParseCacheKey() {
      const text = this.currentCue?.text.trim() ?? "";
      return text ? this.parseCacheKey(text, this.options.getSettings()) : "";
    }
    async parseCueHtmlBatch(texts, settings = this.options.getSettings(), options = {}) {
      const items = uniqueSubtitleParseTexts(texts).map((text) => ({ text, key: this.parseCacheKey(text, settings) }));
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseCueHtmlBatchWithProvisionalFallback(items, settings);
      const { ready, batch } = planSubtitleParseBatch(
        items,
        (key2) => this.parsedHtmlCache.get(key2) ?? this.freshEmptyParsedHtml(key2),
        (key2) => this.pendingParsedHtml.get(key2)
      );
      if (!batch.length) return Promise.all(ready);
      if (!this.options.parseJapaneseBatch) {
        return Promise.all([...ready, ...batch.map(async (item) => ({
          key: item.key,
          html: await this.parseCueHtml(item.text, settings, options)
        }))]);
      }
      const parsed = this.options.parseJapaneseBatch(batch.map((item) => item.text), subtitleParseOptions());
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings);
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingParsedHtml);
    }
    async parseCueHtmlBatchWithProvisionalFallback(items, settings) {
      this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
      const { ready, batch } = planProvisionalSubtitleParseBatch(
        items,
        this.parsedHtmlCache,
        this.provisionalParsedHtmlCache,
        this.pendingProvisionalParsedHtml
      );
      if (!batch.length) return Promise.all(ready);
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(batch.map((item) => item.text), provisionalSubtitleParseOptions()) : Promise.all(batch.map((item) => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true });
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingProvisionalParsedHtml);
    }
    renderParsedHtmlBatch(batch, parsed, settings, options = {}) {
      return batch.map((item, index) => parsed.then((tokens) => {
        const tokenList = tokens[index] ?? [];
        const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
        this.rememberParsedCueHtml(item.key, html, tokenList, options);
        return options.provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
      }));
    }
    async resolveParsedHtmlBatch(ready, batch, parsedHtml, pendingCache) {
      const pendingHtml = parsedHtml.map((promise) => promise.then((result) => result.html));
      batch.forEach((item, index) => pendingCache.set(item.key, pendingHtml[index]));
      try {
        return await Promise.all([...ready, ...parsedHtml]);
      } finally {
        batch.forEach((item, index) => {
          if (pendingCache.get(item.key) === pendingHtml[index]) pendingCache.delete(item.key);
        });
      }
    }
    rememberParsedCueHtml(key2, html, tokens = [], options = {}) {
      if (parsedSubtitleHtmlHasReaderWords(html)) {
        if (options.provisional) this.provisionalParsedHtmlCache.set(key2, html);
        else {
          this.parsedHtmlCache.set(key2, html);
          this.provisionalParsedHtmlCache.delete(key2);
        }
        this.emptyParsedHtmlCache.delete(key2);
        if (tokens.length) this.parsedTokenCache.set(key2, tokens);
        this.pruneParsedSubtitleCaches();
      } else {
        if (!options.provisional) {
          this.emptyParsedHtmlCache.set(key2, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
          this.pruneParsedSubtitleCaches();
        }
      }
    }
    pruneParsedSubtitleCaches() {
      this.pruneParsedSubtitleCache(this.parsedHtmlCache);
      this.pruneParsedSubtitleCache(this.provisionalParsedHtmlCache);
      while (this.emptyParsedHtmlCache.size > 180) this.deleteParsedSubtitleKey(this.emptyParsedHtmlCache.keys().next().value ?? "");
      while (this.parsedTokenCache.size > 180) this.deleteParsedSubtitleKey(this.parsedTokenCache.keys().next().value ?? "");
    }
    pruneParsedSubtitleCache(cache) {
      while (cache.size > 180) this.deleteParsedSubtitleKey(cache.keys().next().value ?? "");
    }
    deleteParsedSubtitleKey(key2) {
      if (!key2) return;
      this.parsedHtmlCache.delete(key2);
      this.provisionalParsedHtmlCache.delete(key2);
      this.emptyParsedHtmlCache.delete(key2);
      this.pendingParsedHtml.delete(key2);
      this.pendingProvisionalParsedHtml.delete(key2);
      this.parsedTokenCache.delete(key2);
      this.parsedTokenNotifiedAt.delete(key2);
    }
    notifyParsedTokensForKey(key2, force = false, roots) {
      if (!this.options.afterParseTokens) return;
      const tokens = this.parsedTokenCache.get(key2);
      if (!tokens?.length) return;
      const now = Date.now();
      const lastNotifiedAt = this.parsedTokenNotifiedAt.get(key2) ?? 0;
      if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
      this.parsedTokenNotifiedAt.set(key2, now);
      this.options.afterParseTokens(tokens, roots);
    }
    shouldUseProvisionalSubtitleParse(settings) {
      return Boolean(hasJpdbApiCredential(settings) && isYouTubePage());
    }
    hasFreshEmptyParsedHtml(key2) {
      return Boolean(this.freshEmptyParsedHtml(key2));
    }
    freshEmptyParsedHtml(key2) {
      const cached = this.emptyParsedHtmlCache.get(key2);
      if (!cached) return void 0;
      if (cached.expiresAt > Date.now()) return cached.html;
      this.emptyParsedHtmlCache.delete(key2);
      return void 0;
    }
    warmParseAroundActiveCue() {
      if (!this.shouldParseSubtitles() || !this.cues.length) return;
      const active = this.activeTranscriptIndex();
      const start = Math.max(0, active >= 0 ? active - SUBTITLE_ACTIVE_PREPARSE_BEHIND : 0);
      const end = Math.min(
        this.cues.length,
        active >= 0 ? active + SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1 : SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1
      );
      const serial = ++this.parseWarmupSerial;
      const settings = this.options.getSettings();
      const texts = this.subtitleWarmupTexts(start, end, settings);
      if (!texts.length) return;
      void (async () => {
        try {
          await this.parseCueHtmlBatch(texts, settings, { allowProvisional: false });
        } catch {
        }
        if (serial !== this.parseWarmupSerial) return;
        if (this.currentCue?.text.trim()) this.render();
      })();
    }
    subtitleWarmupTexts(start, end, settings) {
      const texts = [];
      const seen = /* @__PURE__ */ new Set();
      for (let index = start; index < end; index++) {
        const text = this.cues[index]?.text.trim();
        if (!text) continue;
        const key2 = this.parseCacheKey(text, settings);
        if (seen.has(key2) || this.parsedHtmlCache.has(key2) || this.hasFreshEmptyParsedHtml(key2)) continue;
        seen.add(key2);
        texts.push(text);
      }
      return texts;
    }
    fitSubtitleTextToVideo() {
      if (!this.root || !this.subtitleEl) return;
      const settings = this.options.getSettings();
      const target = subtitleFrameTargetFontSize(this.root, settings);
      let fitted = target;
      this.root.style.setProperty("--subtitle-font-size-target", `${target}px`);
      this.root.style.setProperty("--subtitle-font-size", `${fitted}px`);
      const primary = this.subtitleEl.querySelector(".jpdb-subtitle-primary");
      if (!primary) return;
      const minimum = subtitleMinimumFontSize(this.root);
      fitted = this.fitSubtitleFontSize(fitted, minimum);
      this.root.style.setProperty("--subtitle-font-size", `${fitted}px`);
    }
    fitSubtitleFontSize(fitted, minimum) {
      if (!this.root || !this.subtitleEl) return fitted;
      return fittedSubtitleFontSize(this.subtitleEl, fitted, minimum, (value) => {
        this.root?.style.setProperty("--subtitle-font-size", `${value}px`);
      });
    }
    applyKaraokeStateToPrimary(cue, time) {
      const state = this.primaryKaraokeState(cue);
      if (!state) return;
      const progress = karaokeCharacterProgress(cue, state.words, time);
      let cursor = 0;
      for (const element of state.wordElements) {
        cursor = applyKaraokeClassToWordElement(element, cursor, progress);
      }
    }
    primaryKaraokeState(cue) {
      const primary = this.subtitleEl?.querySelector(".jpdb-subtitle-primary");
      if (!primary || !cueHasExactWordTimings(cue)) return null;
      const words = cue.words;
      const wordElements = Array.from(primary.querySelectorAll(".jpdb-reader-word"));
      return words.length && wordElements.length ? { words, wordElements } : null;
    }
    handleClick(event) {
      if (event.target.closest?.(".jpdb-reader-word")) return;
      const target = event.target.closest("[data-action]");
      const action = target?.dataset.action;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      this.showControlsTemporarily();
      const handler = this.clickHandlers[action];
      if (!handler) return;
      handler(target);
      if (event.detail > 0) target.closest("button")?.blur();
      if (action !== "menu") this.syncControls();
    }
    handleTranscriptPanelKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (target.closest("button, input, [data-resize-transcript], .jpdb-reader-word")) return;
      const row = target.closest(".jpdb-subtitle-list-row[data-row-index]");
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      this.seekToTranscriptRow(this.rowIndexFromTarget(row));
    }
    rowIndexFromTarget(target) {
      return Number(target.closest("[data-row-index]")?.dataset.rowIndex);
    }
    trackIdFromTarget(target) {
      return target.closest("[data-track-id]")?.dataset.trackId;
    }
    transcriptPlacementFromTarget(target) {
      const placement = target.closest("[data-placement]")?.dataset.placement;
      return placement === "left" || placement === "right" || placement === "bottom" ? placement : void 0;
    }
    changeTranscriptPlacement(target) {
      const placement = this.transcriptPlacementFromTarget(target);
      if (!placement) return;
      const settings = this.options.getSettings();
      settings.subtitleTranscriptPlacement = placement;
      if (placement !== "bottom") this.clampStoredSideWidthForCurrentVideo(placement);
      this.options.onSettingsChange();
      this.renderOpenSubtitlePanel();
      this.videoInset.clear(this.video);
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncControls();
    }
    handlePointerActivity(event) {
      if (event.type === "pointermove") {
        this.pendingPointerActivity = { x: event.clientX, y: event.clientY };
        if (this.pointerActivityFrame !== void 0) return;
        this.pointerActivityFrame = requestAnimationFrame(() => {
          this.pointerActivityFrame = void 0;
          const activity = this.pendingPointerActivity;
          this.pendingPointerActivity = void 0;
          if (activity) this.syncPointerActivity(activity.x, activity.y);
        });
        return;
      }
      this.syncPointerActivity(event.clientX, event.clientY);
    }
    syncPointerActivity(clientX, clientY) {
      if (this.isPointerNearSubtitleSurface(clientX, clientY)) {
        this.showControlsTemporarily();
      } else {
        this.hideControlsImmediately();
      }
    }
    showControlsTemporarily() {
      if (!this.root) return;
      this.root.classList.remove("jpdb-subtitle-controls-idle");
      this.scheduleControlsIdle();
    }
    hideControlsImmediately() {
      this.clearControlsIdleTimer();
      if (!this.root || !this.shouldAutoIdleControls()) return;
      this.root.classList.add("jpdb-subtitle-controls-idle");
    }
    scheduleControlsIdle() {
      this.clearControlsIdleTimer();
      if (!this.shouldAutoIdleControls()) return;
      this.controlsIdleTimer = window.setTimeout(() => {
        this.controlsIdleTimer = void 0;
        this.hideControlsImmediately();
      }, SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS);
    }
    clearControlsIdleTimer() {
      this.controlsIdleTimer = clearWindowTimeout(this.controlsIdleTimer);
    }
    shouldAutoIdleControls() {
      const settings = this.options.getSettings();
      if (!this.hasAutoIdleMode(settings)) return false;
      if (!this.canIdleSubtitleControls()) return false;
      return !this.video || this.videoIsLargeEnoughForIdleControls();
    }
    hasAutoIdleMode(settings) {
      return Boolean(this.root && settings.subtitleControlsMode === "auto");
    }
    canIdleSubtitleControls() {
      if (this.hasActiveSubtitleUi()) return false;
      return this.hasSubtitleIdleSurface();
    }
    hasActiveSubtitleUi() {
      return Boolean(this.root?.matches(":focus-within"));
    }
    hasSubtitleIdleSurface() {
      return Boolean(this.video || this.cues.length || this.currentCue?.text);
    }
    videoIsLargeEnoughForIdleControls() {
      const rect = this.video?.getBoundingClientRect();
      return Boolean(rect && rect.width > 120 && rect.height > 90);
    }
    isPointerNearSubtitleSurface(x, y) {
      if (!this.root) return false;
      if (this.pointInElement(this.root.querySelector(".jpdb-subtitle-rail"), x, y)) return true;
      if (this.pointInOpenTranscriptPanel(x, y)) return true;
      if (!this.video) return true;
      if (this.videoPlayerChromeHidden()) return false;
      return pointInRect(x, y, this.video.getBoundingClientRect());
    }
    videoPlayerChromeHidden() {
      const player = this.video?.closest("#movie_player, .html5-video-player");
      return Boolean(player?.classList.contains("ytp-autohide") || player?.classList.contains("ytp-hide-controls") || player?.classList.contains("ytp-player-minimized"));
    }
    pointInOpenTranscriptPanel(x, y) {
      return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing && this.pointInElement(this.transcriptPanel, x, y));
    }
    pointInElement(element, x, y) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    handleKeydown(event) {
      const settings = this.options.getSettings();
      if (!settings.subtitlePlayerEnabled) return;
      if (matchesShortcut(event, settings.shortcuts.previousSubtitle)) {
        event.preventDefault();
        this.seekSubtitle(-1);
      } else if (matchesShortcut(event, settings.shortcuts.nextSubtitle)) {
        event.preventDefault();
        this.seekSubtitle(1);
      } else if (matchesShortcut(event, settings.shortcuts.copySubtitle)) {
        event.preventDefault();
        void this.copySubtitle();
      }
    }
    seekSubtitle(direction) {
      if (!this.video) return;
      if (!this.cues.length) {
        this.seekVideoTo(Math.max(0, this.video.currentTime + direction * 5));
        return;
      }
      const time = this.video.currentTime;
      const activeIndex = this.cues.findIndex((cue) => time >= cue.start && time <= cue.end);
      const nextFuture = this.cues.findIndex((cue) => cue.start > time);
      const baseIndex = activeIndex >= 0 ? activeIndex : Math.max(0, nextFuture);
      const index = Math.max(0, Math.min(this.cues.length - 1, baseIndex + direction));
      this.seekToCue(index);
    }
    seekToCue(index) {
      const cue = Number.isFinite(index) ? this.cues[index] : void 0;
      if (!cue) return;
      this.seekToCueObject(cue);
    }
    seekToTranscriptRow(index) {
      const row = Number.isFinite(index) ? this.transcriptRows()[index] : void 0;
      if (!row) return;
      if (row.cueIndex >= 0) {
        const cue = this.cues[row.cueIndex];
        if (cue) this.seekToCueObject(cue, { exact: true });
        return;
      }
      this.seekToCueObject(row.cue, { exact: true });
    }
    seekToCueObject(cue, options = {}) {
      const padding = options.exact ? 0 : this.options.getSettings().subtitleSeekPadding;
      this.seekVideoTo(Math.max(0, cue.start + padding));
      this.currentCue = cue;
      this.secondaryCue = this.secondaryCues.find((item) => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
      this.render();
      this.syncControls();
      this.renderTranscriptPanel();
    }
    seekVideoTo(time) {
      const video = this.video;
      if (!video) return;
      const shouldResume = !video.paused && !video.ended;
      video.currentTime = time;
      if (shouldResume) this.resumeVideoAfterSeek(video);
    }
    resumeVideoAfterSeek(video) {
      const requestPlay = () => {
        if (this.video !== video || !video.paused) return;
        void video.play().catch(() => void 0);
      };
      const handleSeeked = () => requestPlay();
      requestPlay();
      video.addEventListener("seeked", handleSeeked, { once: true });
      window.setTimeout(() => {
        video.removeEventListener("seeked", handleSeeked);
        requestPlay();
      }, 160);
    }
    async copySubtitle(index) {
      const text = this.subtitleCopyText(Number.isInteger(index) ? index : void 0);
      if (!text) return;
      await this.writeSubtitleClipboard(text, "Subtitle clipboard copy failed");
    }
    subtitleCopyText(rowIndex) {
      const cue = rowIndex !== void 0 ? this.cues[rowIndex] : this.currentCue;
      const secondary = rowIndex !== void 0 && cue ? findAlignedCue(this.secondaryCues, cue) : this.secondaryCue;
      return subtitleClipboardText(cue, secondary);
    }
    async copyTranscriptRow(index) {
      const row = Number.isFinite(index) ? this.transcriptRows()[index] : void 0;
      if (!row) return;
      if (row.cueIndex >= 0) {
        await this.copySubtitle(row.cueIndex);
        return;
      }
      const secondary = findAlignedCue(this.secondaryCues, row.cue);
      const text = subtitleClipboardText(row.cue, secondary);
      if (!text) return;
      await this.writeSubtitleClipboard(text, "Subtitle clipboard copy failed");
    }
    async writeSubtitleClipboard(text, failureMessage) {
      await navigator.clipboard?.writeText(text).catch((error) => log$1.warn(failureMessage, error));
    }
    async autoCopyCurrentCue() {
      if (!this.options.getSettings().subtitleAutoCopyLine || !this.currentCue?.text.trim()) return;
      const signature = subtitleCueSignature(this.currentCue);
      if (signature === this.lastAutoCopiedCueSignature) return;
      this.lastAutoCopiedCueSignature = signature;
      await navigator.clipboard?.writeText(this.currentCue.text.trim()).catch((error) => log$1.warn("Subtitle auto-copy failed", error));
    }
    openSubtitleFilePicker(kind) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = SUBTITLE_FILE_ACCEPT;
      input.style.setProperty("display", "none", "important");
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.remove();
        if (file) void this.loadSubtitleFile(kind, file);
      }, { once: true });
      input.addEventListener("cancel", () => input.remove(), { once: true });
      (document.body || document.documentElement).appendChild(input);
      input.click();
    }
    async loadSubtitleFile(kind, file) {
      if (!file) return;
      const text = await file.text();
      const cues = normalizeSubtitleCues(parseSubtitleText(text), { transcriptEligible: kind === "primary" });
      const track = {
        id: `file-${kind}-${Date.now()}`,
        label: file.name.replace(/\.(srt|vtt|ass|ssa)$/i, ""),
        kind: "file",
        cues
      };
      this.tracks.push(track);
      if (kind === "primary") await this.selectTrack(track.id);
      else await this.selectSecondaryTrack(track.id);
      this.updateFromLoadedCues();
      log$1.info("Subtitle file loaded", { kind, name: file.name, cues: cues.length });
    }
    async selectTrack(id) {
      const requestId = this.preparePrimaryTrackSelection(id);
      this.revealPrimarySubtitleOverlay();
      const loaded = await this.loadPrimaryTrackSelection(id, requestId);
      if (!loaded) return;
      this.applyPrimaryTrackSelection(loaded);
      this.finishPrimaryTrackSelection(id, loaded.track);
    }
    preparePrimaryTrackSelection(id) {
      const requestId = this.beginTrackSelection("primary");
      this.selectedTrackId = id;
      this.lastAutoCopiedCueSignature = "";
      if (this.secondaryTrackId === id) this.clearSecondaryTrackSelection();
      this.cues = [];
      this.currentCue = void 0;
      this.pendingDomCaption = void 0;
      return requestId;
    }
    clearSecondaryTrackSelection() {
      this.invalidateTrackSelection("secondary");
      this.secondaryTrackId = "";
      this.secondaryCues = [];
      this.secondaryCue = void 0;
    }
    revealPrimarySubtitleOverlay() {
      const settings = this.options.getSettings();
      if (!settings.subtitleOverlayVisible) {
        settings.subtitleOverlayVisible = true;
        this.options.onSettingsChange();
      }
      this.root?.classList.remove("jpdb-subtitle-hidden");
    }
    async loadPrimaryTrackSelection(id, requestId) {
      return this.loadTrackSelection({ id, requestId, role: "primary", transcriptEligible: true });
    }
    markTrackLoading(track) {
      track.loadingState = "loading";
      this.renderTrackPanel();
    }
    async loadTrackSelection(request) {
      const selected = this.tracks.find((option) => option.id === request.id);
      if (!selected) return this.currentTrackSelection(request.role, request.requestId, request.id, void 0, []);
      this.markTrackLoading(selected);
      this.setNativeTrackModes();
      const loaded = await loadSubtitleTrackCues(selected, {
        ...TRACK_LOAD_OPTIONS,
        tracks: this.tracks,
        transcriptEligible: request.transcriptEligible
      });
      return this.loadedTrackSelection(request, loaded.track, loaded.cues);
    }
    loadedTrackSelection(request, selected, cues) {
      if (!this.isTrackSelectionCurrent(request.role, request.requestId, request.id)) return null;
      const trackId = selected.id;
      this.setSelectedTrackId(request.role, trackId);
      return this.currentTrackSelection(request.role, request.requestId, trackId, selected, cues);
    }
    currentTrackSelection(role, requestId, trackId, track, cues) {
      return this.isTrackSelectionCurrent(role, requestId, trackId) ? { track, trackId, cues } : null;
    }
    setSelectedTrackId(role, trackId) {
      if (role === "primary") this.selectedTrackId = trackId;
      else this.secondaryTrackId = trackId;
    }
    applyPrimaryTrackSelection(selection) {
      this.cues = selection.cues;
      if (selection.trackId !== this.selectedTrackId) this.selectedTrackId = selection.trackId;
      this.applyYouTubeCaptionFallback(selection.track, selection.trackId);
      if (selection.track) selection.track.loadingState = loadedTrackState(this.cues);
    }
    applyYouTubeCaptionFallback(track, trackId) {
      if (track?.kind !== "youtube") {
        this.youtubeDomCaptionFallbackTrackId = "";
        return;
      }
      this.youtubeDomCaptionFallbackTrackId = this.cues.length ? "" : trackId;
      this.lastYouTubeCaptionActivationAt = 0;
      if (!this.cues.length) this.ensureYouTubeDomCaptionFallbackActive(track);
    }
    finishPrimaryTrackSelection(id, selected) {
      this.finishTrackSelection("Primary", id, selected, this.cues.length);
    }
    async selectSecondaryTrack(id) {
      const requestId = this.prepareSecondaryTrackSelection(id);
      this.revealSecondarySubtitleOverlay();
      const loaded = await this.loadSecondaryTrackSelection(id, requestId);
      if (!loaded) return;
      this.applySecondaryTrackSelection(loaded);
      this.finishSecondaryTrackSelection(id, loaded.track);
    }
    prepareSecondaryTrackSelection(id) {
      if (this.selectedTrackId === id) {
        this.suppressYouTubeAutoSelectForCurrentVideo();
        this.invalidateTrackSelection("primary");
        this.selectedTrackId = "";
        this.cues = [];
        this.currentCue = void 0;
        this.pendingDomCaption = void 0;
        this.youtubeDomCaptionFallbackTrackId = "";
      }
      const requestId = this.beginTrackSelection("secondary");
      this.secondaryTrackId = id;
      this.secondaryCues = [];
      this.secondaryCue = void 0;
      return requestId;
    }
    revealSecondarySubtitleOverlay() {
      const settings = this.options.getSettings();
      if (!settings.subtitleSecondaryVisible) {
        settings.subtitleSecondaryVisible = true;
        this.options.onSettingsChange();
      }
    }
    async loadSecondaryTrackSelection(id, requestId) {
      return this.loadTrackSelection({ id, requestId, role: "secondary", transcriptEligible: false });
    }
    applySecondaryTrackSelection(selection) {
      this.secondaryCues = selection.cues;
      if (selection.trackId !== this.secondaryTrackId) this.secondaryTrackId = selection.trackId;
      if (selection.track) selection.track.loadingState = loadedTrackState(this.secondaryCues);
    }
    finishSecondaryTrackSelection(id, selected) {
      this.finishTrackSelection("Secondary", id, selected, this.secondaryCues.length);
    }
    finishTrackSelection(role, id, selected, cues) {
      this.setNativeTrackModes();
      this.updateFromLoadedCues();
      this.warmParseAroundActiveCue();
      this.render();
      this.refreshTranscriptPanelAfterTrackChange();
      this.syncControls();
      log$1.info(`${role} subtitle track selected`, { id, label: selected?.label ?? "", kind: selected?.kind ?? "unknown", cues });
    }
    setNativeTrackModes() {
      const settings = this.options.getSettings();
      this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
        hasPrimaryCues: Boolean(this.cues.length),
        currentCueText: this.currentCue?.text,
        youtubeDomCaptionFallbackTrackId: this.youtubeDomCaptionFallbackTrackId,
        lastYomuCaptionsActive: this.lastYomuCaptionsActive
      });
    }
    async discoverYouTubeTracksThrottled(force = false) {
      if (this.youtubeTrackDiscoveryInFlight) return;
      const now = performance.now();
      const interval = this.tracks.some((track) => track.kind === "youtube") ? 5e3 : 1500;
      if (!force && now - this.lastYouTubeTrackDiscoveryAt < interval) return;
      this.lastYouTubeTrackDiscoveryAt = now;
      this.youtubeTrackDiscoveryInFlight = true;
      try {
        await this.discoverYouTubeTracks();
      } finally {
        this.youtubeTrackDiscoveryInFlight = false;
      }
    }
    async discoverYouTubeTracks() {
      if (!location.hostname.includes("youtube.com")) return;
      const videoId = getYouTubeVideoId();
      if (!videoId) return;
      this.updateYouTubeDiscoveryVideo(videoId);
      const tracks = await discoverYouTubeCaptionTracks();
      if (!tracks.length) return;
      this.removeYouTubeDomCaptionFallbackTracks();
      const { added, updatedSelectedTrack } = this.mergeYouTubeCaptionTracks(tracks);
      this.finishYouTubeTrackDiscovery(added, updatedSelectedTrack);
    }
    removeYouTubeDomCaptionFallbackTracks() {
      this.removeSubtitleTracks((track) => track.sourceKey === YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY);
    }
    updateYouTubeDiscoveryVideo(videoId) {
      if (videoId === this.youtubeVideoId) return;
      this.youtubeVideoId = videoId;
      this.clearTransientSubtitleState();
      this.removeSubtitleTracks((track) => track.kind === "youtube");
      this.youtubeDomCaptionFallbackTrackId = "";
      this.youtubeAutoSelectSuppressedVideoId = "";
      this.lastYouTubeTrackDiscoveryAt = 0;
    }
    mergeYouTubeCaptionTracks(tracks) {
      let added = 0;
      let updatedSelectedTrack = false;
      for (const track of tracks) {
        const existing = this.findExistingYouTubeTrack(track);
        if (existing) {
          updatedSelectedTrack ||= this.updateExistingYouTubeTrack(existing, track);
          continue;
        }
        this.addYouTubeCaptionTrack(track);
        added += 1;
      }
      return { added, updatedSelectedTrack };
    }
    findExistingYouTubeTrack(track) {
      const key2 = youtubeCaptionTrackIdentity(track);
      return this.tracks.find((option) => option.kind === "youtube" && youtubeCaptionTrackIdentity(option) === key2);
    }
    updateExistingYouTubeTrack(existing, track) {
      let updatedSelectedTrack = false;
      if (shouldRefreshYouTubeTrackUrl(track.url, existing.url)) {
        existing.url = track.url;
        updatedSelectedTrack = existing.id === this.selectedTrackId && !this.cues.length;
      }
      existing.youtubeTrack = track.raw;
      existing.autoGenerated = track.autoGenerated;
      existing.sourceType = track.sourceType;
      existing.sourceLanguage = track.sourceLanguage;
      existing.targetLanguage = track.targetLanguage;
      existing.vssId = track.vssId;
      existing.youtubeIdentity = track.youtubeIdentity;
      return updatedSelectedTrack;
    }
    addYouTubeCaptionTrack(track) {
      this.tracks.push({
        id: `youtube-${this.tracks.length}`,
        label: track.label,
        kind: "youtube",
        language: track.language,
        autoGenerated: track.autoGenerated,
        url: track.url,
        youtubeTrack: track.raw,
        sourceType: track.sourceType,
        sourceLanguage: track.sourceLanguage,
        targetLanguage: track.targetLanguage,
        vssId: track.vssId,
        youtubeIdentity: track.youtubeIdentity
      });
    }
    finishYouTubeTrackDiscovery(added, updatedSelectedTrack) {
      const generated = this.ensureTranslatedJapaneseTrack();
      const autoPrimaryTrack = this.findAutoPrimaryYouTubeTrack();
      const autoSecondaryTrack = this.findAutoSecondaryYouTubeTrack(autoPrimaryTrack?.id);
      const primaryTrackId = autoPrimaryTrack?.id || (this.shouldReloadUpdatedSelectedTrack(updatedSelectedTrack) ? this.selectedTrackId : "");
      if (primaryTrackId) {
        void this.selectTrack(primaryTrackId);
        if (autoSecondaryTrack) void this.selectSecondaryTrack(autoSecondaryTrack.id);
        return;
      }
      if (autoSecondaryTrack) {
        void this.selectSecondaryTrack(autoSecondaryTrack.id);
        return;
      }
      if (!added && !generated) return;
      this.renderTrackPanel();
      this.syncControls();
    }
    ensureTranslatedJapaneseTrack() {
      const hasJapanese = this.tracks.some((track) => isJapaneseSubtitleTrack(track));
      if (hasJapanese) return false;
      const englishTracks = this.tracks.filter((track) => isEnglishSubtitleTrack(track)).sort(compareSubtitleTrackOptions);
      if (!englishTracks.length) return false;
      const source = englishTracks[0];
      const existing = this.tracks.find((t) => t.translatedFromTrackId === source.id);
      if (existing) return false;
      const settings = this.options.getSettings();
      const synthetic = {
        id: `translated-${source.id}`,
        label: `${uiText(settings.interfaceLanguage, "translation")} (${source.label})`,
        kind: source.kind,
        language: "ja",
        autoGenerated: true,
        translatedFromTrackId: source.id
      };
      this.tracks.push(synthetic);
      return true;
    }
    shouldReloadUpdatedSelectedTrack(updatedSelectedTrack) {
      return updatedSelectedTrack && Boolean(this.selectedTrackId);
    }
    findAutoPrimaryYouTubeTrack() {
      if (this.selectedTrackId) return void 0;
      if (this.youtubeAutoSelectSuppressedVideoId && this.youtubeAutoSelectSuppressedVideoId === this.youtubeVideoId) return void 0;
      return [...this.tracks].filter((track) => track.kind === "youtube" && isJapaneseSubtitleTrack(track)).sort(compareSubtitleTrackOptions)[0];
    }
    findAutoSecondaryYouTubeTrack(primaryTrackId = this.selectedTrackId) {
      if (!primaryTrackId || this.secondaryTrackId) return void 0;
      return [...this.tracks].filter((track) => track.kind === "youtube" && track.id !== primaryTrackId && isEnglishSubtitleTrack(track)).sort(compareNativeOverlaySubtitleTrackOptions)[0];
    }
    syncControls() {
      const hasLines = this.hasVisibleSubtitleLines();
      this.root?.classList.toggle("jpdb-subtitle-panel-open", this.isTranscriptPanelOpen());
      this.root?.classList.toggle("jpdb-subtitle-has-lines", hasLines);
      this.root?.classList.toggle("jpdb-subtitle-has-track", hasSelectedSubtitleTrackOrLines(this.selectedTrackId, hasLines));
      this.syncTranscriptPlacementClass();
      this.syncLineNavigationButtons(hasLines);
      this.syncDrawerButtons(hasLines);
      this.syncStatus();
      this.setNativeTrackModes();
    }
    hasVisibleSubtitleLines() {
      return Boolean(this.cues.length || this.currentCue?.text);
    }
    syncStatus() {
      const status = this.root?.querySelector(".jpdb-subtitle-status");
      if (!status) return;
      syncSubtitleTrackStatus(status, this.tracks.length, this.options.getSettings().interfaceLanguage);
    }
    syncLineNavigationButtons(hasLines) {
      const panelOpen = this.isTranscriptPanelDockedOpen();
      const hideRailNavigation = panelOpen || this.options.getSettings().subtitleControlsMode === "hidden";
      const language = this.options.getSettings().interfaceLanguage;
      for (const action of ["previous", "next"]) {
        const railButton = this.root?.querySelector(`.jpdb-subtitle-rail [data-action="${action}"]`);
        if (railButton) syncSubtitleLineNavigationButton(railButton, action, hasLines, Boolean(this.video), hideRailNavigation, language);
        for (const button of this.panelLineNavigationButtons(action)) syncSubtitleLineNavigationButton(button, action, hasLines, Boolean(this.video), false, language);
      }
    }
    isTranscriptPanelDockedOpen() {
      return Boolean(this.isTranscriptPanelOpen() && !this.fullscreen);
    }
    panelLineNavigationButtons(action) {
      return Array.from(this.transcriptPanel?.querySelectorAll(`.jpdb-subtitle-panel-nav [data-action="${action}"]`) ?? []);
    }
    syncDrawerButtons(hasLines) {
      const panelButton = this.root?.querySelector('[data-action="panel"]');
      if (!panelButton) return;
      const state = subtitleDrawerButtonState({
        panelOpen: this.isTranscriptPanelOpen(),
        hasLines,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        hasVideo: Boolean(this.video),
        trackCount: this.tracks.length
      });
      syncSubtitleDrawerButton(panelButton, {
        disabled: state.disabled,
        pressed: state.panelOpen,
        placement: state.panelOpen ? this.effectiveTranscriptPlacement : this.options.getSettings().subtitleTranscriptPlacement,
        language: this.options.getSettings().interfaceLanguage
      });
    }
    syncPanelState() {
      const hasLines = Boolean(this.cues.length || this.currentCue?.text);
      const panel = this.transcriptPanel;
      if (this.isTranscriptPanelOpen() && panel) {
        panel.classList.toggle("jpdb-subtitle-lines-panel", this.panelMode === "lines");
        panel.classList.toggle("jpdb-subtitle-tracks-panel", this.panelMode === "tracks");
      }
      this.syncLineNavigationButtons(hasLines);
    }
    syncTranscriptPlacementClass() {
      if (!this.root) return;
      for (const element of [this.root, this.transcriptPanel].filter((item) => Boolean(item))) {
        element.classList.toggle("jpdb-subtitle-transcript-right", this.effectiveTranscriptPlacement === "right");
        element.classList.toggle("jpdb-subtitle-transcript-left", this.effectiveTranscriptPlacement === "left");
        element.classList.toggle("jpdb-subtitle-transcript-bottom", this.effectiveTranscriptPlacement === "bottom");
      }
      this.root.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
      if (this.transcriptPanel) this.transcriptPanel.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
      this.syncPanelPlacementButtons();
    }
    syncPanelPlacementButtons() {
      syncTranscriptPlacementButtons(
        this.transcriptPanel ?? null,
        this.effectiveTranscriptPlacement,
        this.options.getSettings().interfaceLanguage
      );
    }
    hasTranscriptSurface() {
      return Boolean(this.cues.length || this.currentCue?.text || this.selectedTrackId);
    }
    preferredTranscriptDrawerMode() {
      if (this.panelMode === "lines" && this.hasTranscriptSurface()) return "lines";
      if (this.panelMode === "tracks") return "tracks";
      return this.hasTranscriptSurface() ? "lines" : "tracks";
    }
    toggleTranscriptDrawer() {
      if (!this.transcriptPanel) return;
      if (this.isTranscriptPanelOpen()) {
        this.closeTranscriptPanel();
        return;
      }
      if (this.preferredTranscriptDrawerMode() === "tracks") this.openTracksPanel();
      else this.openLinesPanel();
    }
    showTranscriptPanelElement() {
      const panel = this.transcriptPanel;
      if (!panel) return;
      this.clearTranscriptPanelAnimation();
      this.transcriptPanelClosing = false;
      panel.hidden = false;
      panel.classList.remove("jpdb-subtitle-panel-closing");
      panel.classList.add("jpdb-subtitle-panel-entering");
      this.transcriptPanelAnimationFrame = requestAnimationFrame(() => this.finishTranscriptPanelEnter(panel));
    }
    finishTranscriptPanelEnter(panel) {
      this.transcriptPanelAnimationFrame = void 0;
      if (!this.shouldFinishTranscriptPanelEnter(panel)) return;
      panel.classList.remove("jpdb-subtitle-panel-entering");
      panel.classList.add("jpdb-subtitle-panel-opened");
    }
    shouldFinishTranscriptPanelEnter(panel) {
      return Boolean(this.transcriptPanel && this.transcriptPanel === panel && !panel.hidden && !this.transcriptPanelClosing);
    }
    hideTranscriptPanelElement(options = {}) {
      const panel = this.transcriptPanel;
      if (!panel) return;
      this.clearTranscriptPanelAnimation();
      this.transcriptPanelClosing = true;
      panel.classList.remove("jpdb-subtitle-panel-entering", "jpdb-subtitle-panel-opened");
      if (options.immediate || panel.hidden) {
        this.finishTranscriptPanelHide(panel);
        return;
      }
      panel.classList.add("jpdb-subtitle-panel-closing");
      this.transcriptPanelHideTimer = window.setTimeout(() => this.finishTranscriptPanelHide(panel), TRANSCRIPT_PANEL_ANIMATION_MS);
    }
    finishTranscriptPanelHide(panel) {
      if (this.transcriptPanel !== panel) return;
      this.clearTranscriptPanelAnimation();
      panel.hidden = true;
      panel.classList.remove("jpdb-subtitle-panel-entering", "jpdb-subtitle-panel-opened", "jpdb-subtitle-panel-closing");
      this.transcriptPanelClosing = false;
      this.syncControls();
    }
    clearTranscriptPanelAnimation() {
      this.transcriptPanelAnimationFrame = clearWindowAnimationFrame(this.transcriptPanelAnimationFrame);
      this.transcriptPanelHideTimer = clearWindowTimeout(this.transcriptPanelHideTimer);
    }
    openLinesPanel(options = {}) {
      if (!this.transcriptPanel || !this.hasTranscriptSurface()) return;
      const persist = options.persist ?? true;
      if (!options.autoPause) this.pausePanelDismissed = false;
      this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
      this.panelMode = "lines";
      this.showTranscriptPanelElement();
      if (persist) {
        this.options.getSettings().subtitleTranscriptVisible = true;
        this.options.onSettingsChange();
      }
      this.renderTranscriptPanel(true);
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncControls();
    }
    toggleNativeSubtitleBlur() {
      const settings = this.options.getSettings();
      settings.subtitleNativeBlurred = !settings.subtitleNativeBlurred;
      this.options.onSettingsChange();
      this.render();
      log$1.info("Native subtitle blur toggled", { blurred: settings.subtitleNativeBlurred });
    }
    togglePausePanelMode() {
      const settings = this.options.getSettings();
      settings.subtitlePausePanel = !settings.subtitlePausePanel;
      if (settings.subtitlePausePanel) {
        settings.subtitleTranscriptVisible = false;
        if (this.video && this.video.paused && !this.video.ended && this.hasTranscriptSurface()) {
          this.openLinesPanel({ persist: false, autoPause: true });
        } else if (this.isTranscriptPanelOpen()) {
          this.closeTranscriptPanel({ persist: false, autoPause: true });
        }
      } else {
        this.pausePanelOpen = false;
      }
      this.options.onSettingsChange();
      this.renderOpenSubtitlePanel();
      this.syncControls();
    }
    refreshTranscriptPanelAfterTrackChange() {
      if (this.shouldRestoreTranscriptPanel()) {
        this.openLinesPanel();
        return;
      }
      if (!this.isTranscriptPanelOpen()) return;
      if (this.panelMode === "lines") {
        if (this.hasTranscriptSurface()) this.renderTranscriptPanel(true);
        else this.closeTranscriptPanel();
        return;
      }
      this.renderTrackPanel();
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncPanelState();
    }
    shouldRestoreTranscriptPanel() {
      return this.options.getSettings().subtitleTranscriptVisible && this.hasTranscriptSurface();
    }
    isTranscriptPanelOpen() {
      return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }
    openTracksPanel(options = {}) {
      if (!this.transcriptPanel) return;
      const persist = options.persist ?? true;
      if (!options.autoPause) this.pausePanelDismissed = false;
      this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
      this.panelMode = "tracks";
      this.showTranscriptPanelElement();
      if (persist) {
        this.options.getSettings().subtitleTranscriptVisible = false;
        this.options.onSettingsChange();
      }
      this.renderTrackPanel();
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncPanelState();
    }
    shouldAutoHideOpenPanel(options) {
      if (options.autoPause) return true;
      const settings = this.options.getSettings();
      return Boolean(settings.subtitlePausePanel && this.video && this.video.paused && !this.video.ended);
    }
    closeTranscriptPanel(options = {}) {
      if (!this.transcriptPanel) return;
      const persist = options.persist ?? true;
      if (!options.autoPause) {
        this.pausePanelOpen = false;
        if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
      }
      this.hideTranscriptPanelElement();
      if (persist) {
        this.options.getSettings().subtitleTranscriptVisible = false;
        this.options.onSettingsChange();
      }
      this.clearVideoInsetForTranscriptPanel();
      this.syncControls();
    }
    syncPauseTranscriptPanel() {
      const settings = this.options.getSettings();
      if (!settings.subtitlePausePanel || !this.video || !this.video.paused || this.video.ended || !this.hasTranscriptSurface()) {
        this.closePauseTranscriptPanel();
        return;
      }
      if (this.pausePanelDismissed || this.isTranscriptPanelOpen()) return;
      this.openLinesPanel({ persist: false, autoPause: true });
    }
    closePauseTranscriptPanel() {
      if (!this.pausePanelOpen) return;
      this.pausePanelOpen = false;
      this.closeTranscriptPanel({ persist: false, autoPause: true });
    }
    openSubtitleTracksPanelFromHost() {
      this.openTracksPanel({ persist: false });
      this.showControlsTemporarily();
      this.syncControls();
    }
    renderTranscriptPanel(force = false) {
      const panel = this.renderableTranscriptPanel();
      if (!panel) return;
      const state = this.transcriptPanelRenderState();
      if (this.canRefreshTranscriptPanel(force, state)) return;
      this.lastTranscriptSignature = state.signature;
      setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
      this.afterTranscriptPanelRender(state);
    }
    renderableTranscriptPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
      return this.panelMode === "lines" ? this.transcriptPanel : null;
    }
    canRefreshTranscriptPanel(force, state) {
      if (force) return false;
      return this.refreshExistingTranscriptPanel(state);
    }
    transcriptPanelRenderState() {
      const rows = this.transcriptRows();
      const currentCueIndex = this.activeTranscriptIndex();
      const currentRowIndex = this.activeTranscriptRowIndex(rows, currentCueIndex);
      const settings = this.options.getSettings();
      const signature = [
        rows.length,
        this.selectedTrackId,
        this.tracks.find((track) => track.id === this.selectedTrackId)?.loadingState ?? "",
        !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : "",
        this.parseCacheKey("", settings)
      ].join(":");
      return { rows, currentRowIndex, signature };
    }
    refreshExistingTranscriptPanel(state) {
      if (this.lastTranscriptSignature !== state.signature) return false;
      this.updateTranscriptActiveLine(state.currentRowIndex);
      this.scheduleTranscriptHydration(state.currentRowIndex);
      this.scheduleTranscriptCacheWarmup(state.rows, state.currentRowIndex);
      return true;
    }
    renderTranscriptPanelHtml(state) {
      const settings = this.options.getSettings();
      const language = settings.interfaceLanguage;
      return `
            <div class="jpdb-subtitle-drawer-head">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, "subtitlesTitle"))}</strong>
                    <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
        mode: "lines",
        count: state.rows.length,
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        language
      }))}</span>
                </div>
                <div class="jpdb-subtitle-drawer-actions">
                    ${renderPanelModeControls("lines", this.hasTranscriptSurface(), language)}
                    ${renderPanelNavigationControls(Boolean(this.video && state.rows.length), language)}
                    ${renderPanelPlacementControls(this.effectiveTranscriptPlacement, language)}
                    ${renderPausePanelToggle(settings.subtitlePausePanel, language)}
                </div>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${state.rows.length ? state.rows.map((row, index) => this.renderTranscriptRow(row, index, state.currentRowIndex)).join("") : this.renderTranscriptWaitingState()}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeTranscriptPanel"))}"></div>
        `;
    }
    afterTranscriptPanelRender(state) {
      this.indexTranscriptTextTargets();
      this.bindTranscriptScroller();
      this.bindTranscriptResizeHandle();
      this.positionTranscriptPanel();
      this.scrollTranscriptToActive();
      this.scheduleTranscriptHydration(state.currentRowIndex);
      this.scheduleTranscriptCacheWarmup(state.rows, state.currentRowIndex);
      this.syncPanelState();
    }
    renderTranscriptRow(row, index, currentIndex) {
      const cue = row.cue;
      const settings = this.options.getSettings();
      const parsedKey = this.parseCacheKey(cue.text, settings);
      const parsed = this.parsedHtmlCache.get(parsedKey) ?? this.provisionalParsedHtmlCache.get(parsedKey);
      const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parsedKey)}"` : "";
      const provisionalAttribute = parsed && !this.parsedHtmlCache.has(parsedKey) ? ' data-parsed-provisional="true"' : "";
      const seekLabel = `${uiText(settings.interfaceLanguage, "seekSubtitleLine")} ${formatSubtitleTime(cue.start)}`;
      return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? "active" : ""}" data-action="cue" data-row-index="${index}" data-cue-index="${row.cueIndex}" role="button" tabindex="0" aria-label="${escapeHtml(seekLabel)}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}" data-parse-key="${escapeHtml(parsedKey)}"${parsedKeyAttribute}${provisionalAttribute}>${parsed ?? escapeWithBreaks(cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-row-index="${index}" title="${escapeHtml(uiText(settings.interfaceLanguage, "copySubtitleLine"))}" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, "copySubtitleLine"))}">${subtitleIcon("copy")}</button>
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                </div>
            </div>
        `;
    }
    transcriptRows() {
      if (this.cues.length) {
        return this.cues.map((cue, cueIndex) => ({ cue, cueIndex })).filter((row) => row.cue.transcriptEligible !== false);
      }
      return this.currentCue && this.currentCue.transcriptEligible !== false ? [{ cue: this.currentCue, cueIndex: -1 }] : [];
    }
    renderTranscriptWaitingState() {
      const selected = this.tracks.find((track) => track.id === this.selectedTrackId);
      const language = this.options.getSettings().interfaceLanguage;
      const label = selected?.label ? `: ${escapeHtml(selected.label)}` : "";
      const status = selected?.loadingState === "loading" ? uiText(language, "loadingSubtitleLines") : uiText(language, "waitingForCaptionLines");
      return `<div class="jpdb-subtitle-list-empty">${escapeHtml(status)}${label}. ${escapeHtml(uiText(language, "subtitleCurrentLineWillAppear"))}</div>`;
    }
    updateTranscriptActiveLine(currentIndex) {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== "lines") return;
      this.transcriptPanel.querySelectorAll(".jpdb-subtitle-list-row.active").forEach((row) => row.classList.remove("active"));
      const active = this.transcriptPanel.querySelector(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
      if (active) active.classList.add("active");
      this.scrollTranscriptToActive();
    }
    scrollTranscriptToActive() {
      if (!this.options.getSettings().subtitleTranscriptAutoScroll || !this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
      if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
      this.transcriptScrollFrame = requestAnimationFrame(() => {
        this.transcriptScrollFrame = void 0;
        if (this.destroyed) return;
        const active = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-row.active");
        active?.scrollIntoView?.({ block: "center", inline: "nearest" });
      });
    }
    bindTranscriptScroller() {
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller || scroller.dataset.transcriptHydrationBound === "true") return;
      scroller.dataset.transcriptHydrationBound = "true";
      scroller.addEventListener("scroll", () => this.scheduleTranscriptHydration(), { passive: true });
    }
    bindTranscriptResizeHandle() {
      const handle = this.transcriptPanel?.querySelector("[data-resize-transcript]");
      if (!handle || handle.dataset.transcriptResizeBound === "true") return;
      handle.dataset.transcriptResizeBound = "true";
      handle.addEventListener("pointerdown", (event) => this.startTranscriptResize(event));
      handle.addEventListener("keydown", (event) => this.resizeTranscriptPanelFromKeyboard(event));
      this.syncTranscriptResizeHandle();
    }
    startTranscriptResize(event) {
      if (!this.transcriptPanel) return;
      event.preventDefault();
      event.stopPropagation();
      const placement = this.effectiveTranscriptPlacement;
      const panelRect = this.transcriptPanel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = panelRect.width;
      const startHeight = panelRect.height;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const onMove = (moveEvent) => {
        Object.assign(this.transcriptPanelSize, transcriptResizePatchForPointerDrag({
          bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY,
          placement,
          startHeight,
          startWidth,
          startX,
          startY
        }));
        this.positionTranscriptPanel();
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        saveTranscriptPanelSize(this.transcriptPanelSize);
        this.positionTranscriptPanel();
      };
      window.addEventListener("pointermove", onMove, this.eventOptions());
      window.addEventListener("pointerup", onUp, this.eventOptions({ once: true }));
    }
    resizeTranscriptPanelFromKeyboard(event) {
      const panel = this.transcriptPanel;
      if (!panel) return;
      const placement = this.effectiveTranscriptPlacement;
      const direction = transcriptResizeKeyboardDirection(placement, event.key);
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      Object.assign(this.transcriptPanelSize, transcriptResizePatchForKeyboard({
        bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
        direction,
        panelRect: panel.getBoundingClientRect(),
        placement
      }));
      saveTranscriptPanelSize(this.transcriptPanelSize);
      this.positionTranscriptPanel();
    }
    syncTranscriptResizeHandle(layout) {
      const handle = this.transcriptPanel?.querySelector("[data-resize-transcript]");
      if (!handle) return;
      const metrics = transcriptResizeHandleMetrics({
        bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
        layout,
        panelRect: this.transcriptPanel?.getBoundingClientRect(),
        placement: this.effectiveTranscriptPlacement
      });
      handle.setAttribute("role", "separator");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-orientation", metrics.orientation);
      handle.setAttribute("aria-valuemin", String(metrics.min));
      handle.setAttribute("aria-valuemax", String(metrics.max));
      handle.setAttribute("aria-valuenow", String(Math.round(metrics.current)));
    }
    scheduleTranscriptHydration(preferredIndex = this.activeTranscriptRowIndex()) {
      if (this.transcriptHydrateFrame) return;
      this.transcriptHydrateFrame = requestAnimationFrame(() => {
        this.transcriptHydrateFrame = void 0;
        if (this.destroyed) return;
        void this.hydrateTranscriptRows(preferredIndex);
      });
    }
    activeTranscriptIndex() {
      if (!this.currentCue) return -1;
      const exact = this.cues.findIndex((cue) => cue === this.currentCue);
      if (exact >= 0) return exact;
      return this.cues.findIndex((cue) => Math.abs(cue.start - this.currentCue.start) < 0.05 && Math.abs(cue.end - this.currentCue.end) < 0.05 && cue.text.trim() === this.currentCue.text.trim());
    }
    activeTranscriptRowIndex(rows = this.transcriptRows(), activeCueIndex = this.activeTranscriptIndex()) {
      if (!rows.length) return -1;
      const exact = this.currentTranscriptRowIndex(rows);
      if (exact >= 0) return exact;
      if (activeCueIndex >= 0) return rows.findIndex((row) => row.cueIndex === activeCueIndex);
      return this.cues.length ? -1 : 0;
    }
    currentTranscriptRowIndex(rows) {
      return this.currentCue ? rows.findIndex((row) => row.cue === this.currentCue) : -1;
    }
    async hydrateTranscriptRows(preferredIndex) {
      const request = this.transcriptHydrationRequest();
      if (!request) return;
      const serial = ++this.transcriptHydrationSerial;
      const indexes = this.transcriptHydrationIndexes(preferredIndex, request.rows.length);
      const targets = [];
      for (const index of indexes) {
        if (serial !== this.transcriptHydrationSerial) return;
        const hydration = this.transcriptRowHydrationTarget(index, request.settings, request.rows);
        if (!hydration) continue;
        const cached = this.parsedHtmlCache.get(hydration.key);
        if (cached) this.applyCachedTranscriptRowHtml(hydration, cached);
        else targets.push(hydration);
      }
      if (targets.length) await this.hydrateTranscriptRowTargets(targets, request.settings, serial);
    }
    transcriptHydrationRequest() {
      if (!this.canHydrateTranscriptRows()) return null;
      const settings = this.options.getSettings();
      const rows = this.transcriptRows();
      return rows.length ? { settings, rows } : null;
    }
    canHydrateTranscriptRows() {
      return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing && this.panelMode === "lines");
    }
    transcriptHydrationIndexes(preferredIndex, rowCount) {
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      const plan = planTranscriptHydrationIndexes({
        preferredIndex,
        rowCount,
        scroller,
        cursor: this.transcriptHydrationCursor,
        activeBehind: TRANSCRIPT_ACTIVE_HYDRATION_BEHIND,
        activeAhead: TRANSCRIPT_ACTIVE_HYDRATION_AHEAD,
        maxRows: TRANSCRIPT_HYDRATION_MAX_ROWS,
        backgroundBatch: TRANSCRIPT_BACKGROUND_HYDRATION_BATCH
      });
      this.transcriptHydrationCursor = plan.nextCursor;
      return plan.indexes;
    }
    async hydrateTranscriptRowTargets(targets, settings, serial) {
      try {
        const parsed = await this.parseCueHtmlBatch(targets.map((target) => target.cue.text), settings);
        if (serial !== this.transcriptHydrationSerial) return;
        for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
      } catch {
        targets.forEach((hydration) => {
          hydration.target.dataset.parseFailedKey = hydration.key;
          hydration.target.dataset.parseFailedAt = String(Date.now());
          delete hydration.target.dataset.parsedKey;
        });
      }
    }
    transcriptRowHydrationTarget(index, settings, rows) {
      const cue = rows[index]?.cue;
      const target = this.transcriptPanel?.querySelector(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
      if (!cue || !target) return null;
      const key2 = this.parseCacheKey(cue.text, settings);
      return hasAttemptedTranscriptParse(target, key2) ? null : { cue, target, key: key2 };
    }
    applyCachedTranscriptRowHtml(hydration, html) {
      hydration.target.dataset.parsedKey = hydration.key;
      delete hydration.target.dataset.parsedProvisional;
      delete hydration.target.dataset.parseEmptyKey;
      delete hydration.target.dataset.parseEmptyAt;
      delete hydration.target.dataset.parseFailedKey;
      delete hydration.target.dataset.parseFailedAt;
      setInnerHtml(hydration.target, html);
    }
    scheduleTranscriptCacheWarmup(rows = this.transcriptRows(), preferredIndex = this.activeTranscriptRowIndex(rows)) {
      const settings = this.options.getSettings();
      if (!this.shouldParseSubtitles(settings) || !rows.length) return;
      const signature = this.transcriptCacheWarmupKey(rows, settings, preferredIndex);
      if (signature === this.transcriptCacheWarmupSignature) return;
      this.transcriptCacheWarmupSignature = signature;
      const serial = ++this.transcriptCacheWarmupSerial;
      void this.warmTranscriptParseCache(rows, preferredIndex, settings, serial);
    }
    transcriptCacheWarmupKey(rows, settings, preferredIndex) {
      const first = rows[0]?.cue;
      const last = rows.at(-1)?.cue;
      return [
        this.selectedTrackId,
        rows.length,
        preferredIndex >= 0 ? Math.floor(preferredIndex / TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE) : "start",
        first ? subtitleCueSignature(first) : "",
        last ? subtitleCueSignature(last) : "",
        this.parseCacheKey("", settings)
      ].join("|");
    }
    async warmTranscriptParseCache(rows, preferredIndex, settings, serial) {
      const planned = this.transcriptWarmupPlan(rows, preferredIndex, settings);
      if (!planned.length) return;
      let cursor = 0;
      const pauseMs = this.transcriptBackgroundParsePauseMs();
      const worker = async () => {
        while (cursor < planned.length) {
          if (serial !== this.transcriptCacheWarmupSerial) return;
          const batch = this.nextTranscriptWarmupBatch(planned, () => cursor++);
          if (!batch.length) continue;
          try {
            const parsed = await this.parseCueHtmlBatch(batch.map((item) => item.text), settings, { allowProvisional: false });
            if (serial !== this.transcriptCacheWarmupSerial) return;
            for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
          } catch {
          }
          if (cursor < planned.length) await waitForBackgroundTranscriptParseTurn(pauseMs);
        }
      };
      const workers = Array.from(
        { length: Math.min(TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY, planned.length) },
        () => worker()
      );
      await Promise.all(workers);
    }
    nextTranscriptWarmupBatch(planned, takeNextIndex) {
      const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
      const batch = [];
      while (batch.length < batchSize) {
        const item = planned[takeNextIndex()];
        if (!item) break;
        if (this.parsedHtmlCache.has(item.key) || this.hasFreshEmptyParsedHtml(item.key)) continue;
        batch.push(item);
      }
      return batch;
    }
    transcriptWarmupPlan(rows, preferredIndex, settings) {
      const priority = this.transcriptHydrationIndexes(preferredIndex, rows.length);
      const focusIndex = preferredIndex >= 0 ? preferredIndex : 0;
      const orderedIndexes = transcriptWarmupIndexes(priority, focusIndex, rows.length);
      const seen = /* @__PURE__ */ new Set();
      const plan = [];
      for (const rowIndex of orderedIndexes) {
        this.addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings);
        if (plan.length >= TRANSCRIPT_BACKGROUND_PARSE_LIMIT) break;
      }
      return plan;
    }
    addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings) {
      const text = rows[rowIndex]?.cue.text.trim();
      if (!text) return;
      const key2 = this.parseCacheKey(text, settings);
      if (seen.has(key2) || this.parsedHtmlCache.has(key2)) return;
      seen.add(key2);
      plan.push({ rowIndex, text, key: key2 });
    }
    transcriptBackgroundParsePauseMs() {
      return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }
    updateTranscriptRowsForParseKey(key2, html, options = {}) {
      const panel = this.updatableTranscriptPanel();
      if (!panel) return;
      const hasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
      const updatedRoots = [];
      for (const target of this.transcriptTextTargetsForParseKey(panel, key2)) {
        if (!shouldApplyParsedTranscriptHtml(target, key2, options.provisional === true)) continue;
        if (hasReaderWords) {
          target.dataset.parsedKey = key2;
          if (options.provisional) target.dataset.parsedProvisional = "true";
          else delete target.dataset.parsedProvisional;
          delete target.dataset.parseEmptyKey;
          delete target.dataset.parseEmptyAt;
          delete target.dataset.parseFailedKey;
          delete target.dataset.parseFailedAt;
          setInnerHtml(target, html);
          updatedRoots.push(target);
        } else {
          target.dataset.parseEmptyKey = key2;
          target.dataset.parseEmptyAt = String(Date.now());
          delete target.dataset.parsedKey;
          delete target.dataset.parsedProvisional;
          delete target.dataset.parseFailedKey;
          delete target.dataset.parseFailedAt;
        }
      }
      if (updatedRoots.length) this.notifyParsedTokensForKey(key2, true, updatedRoots);
    }
    indexTranscriptTextTargets(panel = this.updatableTranscriptPanel()) {
      this.transcriptTextTargetsByParseKey.clear();
      if (!panel) return;
      for (const target of Array.from(panel.querySelectorAll("[data-transcript-text][data-parse-key]"))) {
        const key2 = target.dataset.parseKey;
        if (!key2) continue;
        const targets = this.transcriptTextTargetsByParseKey.get(key2);
        if (targets) targets.push(target);
        else this.transcriptTextTargetsByParseKey.set(key2, [target]);
      }
    }
    transcriptTextTargetsForParseKey(panel, key2) {
      if (!this.transcriptTextTargetsByParseKey.size) this.indexTranscriptTextTargets(panel);
      const targets = this.transcriptTextTargetsByParseKey.get(key2) ?? [];
      return targets.filter((target) => target.isConnected && panel.contains(target));
    }
    updatableTranscriptPanel() {
      if (!this.transcriptPanel) return null;
      if (this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
      if (this.panelMode !== "lines") return null;
      return this.transcriptPanel;
    }
    renderTrackPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== "tracks") return;
      this.transcriptTextTargetsByParseKey.clear();
      const state = subtitleTrackPanelState(this.tracks);
      const settings = this.options.getSettings();
      setInnerHtml(this.transcriptPanel, renderSubtitleTrackPanel({
        ...state,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        hasNavigableLines: Boolean(this.video && this.cues.length),
        pausePanelEnabled: settings.subtitlePausePanel,
        placement: this.effectiveTranscriptPlacement,
        language: settings.interfaceLanguage
      }));
      this.bindTranscriptResizeHandle();
      this.syncPanelState();
    }
    beginTrackSelection(role) {
      if (role === "primary") {
        this.primarySelectionRequest += 1;
        return this.primarySelectionRequest;
      }
      this.secondarySelectionRequest += 1;
      return this.secondarySelectionRequest;
    }
    invalidateTrackSelection(role) {
      this.beginTrackSelection(role);
    }
    isTrackSelectionCurrent(role, requestId, trackId) {
      return role === "primary" ? this.primarySelectionRequest === requestId && this.selectedTrackId === trackId : this.secondarySelectionRequest === requestId && this.secondaryTrackId === trackId;
    }
    resetPrimarySubtitleState() {
      this.invalidateTrackSelection("primary");
      this.selectedTrackId = "";
      this.cues = [];
      this.currentCue = void 0;
      this.lastDomCaption = "";
      this.pendingDomCaption = void 0;
      this.youtubeDomCaptionFallbackTrackId = "";
      this.lastAutoCopiedCueSignature = "";
      this.lastRenderedPrimaryText = "";
      this.lastRenderedPrimaryHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
    }
    resetSecondarySubtitleState() {
      this.invalidateTrackSelection("secondary");
      this.secondaryTrackId = "";
      this.secondaryCues = [];
      this.secondaryCue = void 0;
    }
    async choosePrimaryTrack(id) {
      if (!id) return;
      if (id === this.selectedTrackId) {
        this.clearPrimaryTrack();
        return;
      }
      this.youtubeAutoSelectSuppressedVideoId = "";
      await this.discoverYouTubeTracksThrottled(true);
      await this.selectTrack(id);
    }
    async chooseSecondaryTrack(id) {
      if (!id) return;
      if (id === this.secondaryTrackId) {
        this.clearSecondaryTrack();
        return;
      }
      await this.discoverYouTubeTracksThrottled(true);
      await this.selectSecondaryTrack(id);
    }
    clearPrimaryTrack() {
      this.suppressYouTubeAutoSelectForCurrentVideo();
      this.resetPrimarySubtitleState();
      this.clearPrimaryTrackLoadingStates();
      this.setNativeTrackModes();
      this.render();
      this.refreshOpenTranscriptPanelAfterPrimaryClear();
      this.syncControls();
      log$1.info("Primary subtitle track cleared");
    }
    clearPrimaryTrackLoadingStates() {
      for (const track of this.tracks) {
        if (track.loadingState && track.id !== this.secondaryTrackId) track.loadingState = "idle";
      }
    }
    refreshOpenTranscriptPanelAfterPrimaryClear() {
      if (!this.isTranscriptPanelOpen()) return;
      this.panelMode = "tracks";
      this.renderTrackPanel();
    }
    suppressYouTubeAutoSelectForCurrentVideo() {
      if (!isYouTubePage()) return;
      this.youtubeAutoSelectSuppressedVideoId = this.youtubeVideoId || getYouTubeVideoId();
    }
    clearSecondaryTrack() {
      this.resetSecondarySubtitleState();
      this.clearSecondaryTrackLoadingStates();
      this.setNativeTrackModes();
      this.render();
      this.refreshOpenTranscriptPanelAfterSecondaryClear();
      this.syncControls();
      log$1.info("Secondary subtitle track cleared");
    }
    clearSecondaryTrackLoadingStates() {
      for (const track of this.tracks) {
        if (track.loadingState && track.id !== this.selectedTrackId) track.loadingState = "idle";
      }
    }
    refreshOpenTranscriptPanelAfterSecondaryClear() {
      if (!this.isTranscriptPanelOpen()) return;
      if (this.panelMode === "lines") this.renderTranscriptPanel(true);
      else this.renderTrackPanel();
    }
    positionTranscriptPanel(options = {}) {
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      const panel = this.transcriptPanel;
      const viewportWidth = Math.max(320, window.innerWidth);
      const viewportHeight = Math.max(240, window.innerHeight);
      const settings = this.options.getSettings();
      const referenceVideoRect = this.transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight);
      const layout = this.transcriptDrawerLayout({
        viewportWidth,
        viewportHeight,
        anchorTop: this.transcriptAnchorRect().top,
        compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
        preferredPlacement: settings.subtitleTranscriptPlacement,
        size: this.transcriptPanelSize
      }, referenceVideoRect);
      applyTranscriptPanelLayout(panel, layout);
      this.effectiveTranscriptPlacement = layout.placement;
      this.syncTranscriptPlacementClass();
      this.syncTranscriptResizeHandle(layout);
      this.syncDrawerButtons(this.hasVisibleSubtitleLines());
      this.applyVideoInsetForTranscriptLayout(layout, referenceVideoRect);
      if (options.realignAfterInset) this.scheduleTranscriptPanelRealignAfterInset();
    }
    transcriptDrawerLayout(options, referenceVideoRect) {
      const layoutOptions = this.withConstrainedSideTranscriptSize(options, referenceVideoRect);
      const layout = computeSubtitleDrawerLayout(layoutOptions);
      if (!this.shouldUseBottomTranscriptLayout(layout, referenceVideoRect)) return layout;
      return computeSubtitleDrawerLayout({
        ...layoutOptions,
        compactPanel: true,
        preferredPlacement: "bottom"
      });
    }
    withConstrainedSideTranscriptSize(options, referenceVideoRect) {
      if (options.compactPanel || options.preferredPlacement === "bottom" || !this.video) return options;
      const placement = options.preferredPlacement === "left" ? "left" : "right";
      const sideWidth = this.constrainedSideTranscriptWidth(placement, options, referenceVideoRect);
      if (sideWidth === void 0 || sideWidth === options.size?.sideWidth) return options;
      return {
        ...options,
        size: {
          ...options.size ?? {},
          sideWidth
        }
      };
    }
    constrainedSideTranscriptWidth(placement, options, referenceVideoRect = this.transcriptLayoutReferenceVideoRect(options.viewportWidth, options.viewportHeight)) {
      const maxWidth = this.maxSideTranscriptWidthForVideo(placement, options, referenceVideoRect);
      if (maxWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return void 0;
      const currentWidth = options.size?.sideWidth ?? Math.min(460, options.viewportWidth * 0.32);
      return Math.round(Math.min(currentWidth, maxWidth));
    }
    maxSideTranscriptWidthForVideo(placement, options, videoRect) {
      if (videoRect.width <= 0) return 0;
      const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
      const minimumPlayerWidth = minimumSideTranscriptPlayerWidth(videoRect.width);
      return placement === "left" ? Math.floor(videoRect.right - margin * 2 - minimumPlayerWidth) : Math.floor(options.viewportWidth - videoRect.left - margin * 2 - minimumPlayerWidth);
    }
    clampStoredSideWidthForCurrentVideo(placement) {
      const constrained = this.constrainedSideTranscriptWidth(placement, {
        viewportWidth: Math.max(320, window.innerWidth),
        viewportHeight: Math.max(240, window.innerHeight),
        anchorTop: this.transcriptAnchorRect().top,
        compactPanel: shouldUseCompactSubtitleDrawer(Math.max(320, window.innerWidth)),
        preferredPlacement: placement,
        size: this.transcriptPanelSize
      });
      if (constrained !== void 0) this.transcriptPanelSize.sideWidth = constrained;
    }
    shouldUseBottomTranscriptLayout(layout, videoRect = this.videoLayoutRect()) {
      if (layout.placement === "bottom" || !this.video) return false;
      if (isYouTubeTheaterMode()) return true;
      if (videoRect.width <= 0) return false;
      const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
      return shouldUseBottomTranscriptLayoutForAvailableWidth(videoRect.width, availableWidth);
    }
    scheduleTranscriptPanelRealignAfterInset() {
      if (this.transcriptInsetRealignFrame !== void 0) return;
      this.transcriptInsetRealignFrame = requestAnimationFrame(() => this.realignTranscriptPanelAfterInset());
    }
    realignTranscriptPanelAfterInset() {
      this.transcriptInsetRealignFrame = void 0;
      if (!this.shouldRealignTranscriptPanelAfterInset()) return;
      this.alignToVideo();
    }
    shouldRealignTranscriptPanelAfterInset() {
      return Boolean(!this.destroyed && this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }
    transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight) {
      const current = this.videoLayoutRect();
      const viewportKey = `${viewportWidth}x${viewportHeight}`;
      const degenerate = current.width < 200 || current.height < 120;
      if (degenerate) return this.transcriptLayoutReferenceRect ?? current;
      if (!this.transcriptLayoutReferenceRect || this.transcriptLayoutReferenceViewport !== viewportKey || current.width > this.transcriptLayoutReferenceRect.width + 20 || current.height > this.transcriptLayoutReferenceRect.height + 20) {
        this.transcriptLayoutReferenceRect = current;
        this.transcriptLayoutReferenceViewport = viewportKey;
      }
      return this.transcriptLayoutReferenceRect;
    }
    applyVideoInsetForTranscriptLayout(layout, videoRect = this.videoLayoutRect()) {
      if (!this.video) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      if (layout.placement === "bottom") {
        this.applyPageVideoInset("bottom", layout.top - videoRect.top - layout.margin, layout.height, videoRect);
        return;
      }
      const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
      this.applyPageVideoInset(layout.placement, Math.max(0, availableWidth), layout.width, videoRect);
    }
    availablePlayerWidthForSideLayout(layout, videoRect) {
      return layout.placement === "left" ? videoRect.right - (layout.left + layout.width + layout.margin) : layout.left - videoRect.left - layout.margin;
    }
    syncFullscreenState() {
      this.fullscreen = Boolean(document.fullscreenElement);
      document.documentElement.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      this.root?.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
      if (this.isTranscriptPanelOpen()) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!this.destroyed && !this.fullscreen) this.positionTranscriptPanel({ realignAfterInset: true });
        }));
      }
    }
    scheduleAlignToVideo() {
      if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
      this.alignFrame = requestAnimationFrame(() => {
        this.alignFrame = void 0;
        if (this.destroyed) return;
        this.alignToVideo();
      });
    }
    videoLayoutRect() {
      return subtitleVideoLayoutRect(this.video);
    }
    transcriptAnchorRect() {
      if (isYouTubePage()) return this.videoLayoutRect();
      if (!this.video) return this.videoLayoutRect();
      return transcriptAvoidanceTarget(this.video).getBoundingClientRect();
    }
    clearVideoInsetForTranscriptPanel() {
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
      this.videoInset.clear(this.video);
    }
    applyPageVideoInset(side, playerSize, panelSize, videoRect = this.videoLayoutRect()) {
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      const panelRect = this.transcriptPanel?.getBoundingClientRect();
      this.videoInset.apply({
        video: this.video,
        side,
        playerSize,
        panelSize: panelSize ?? ((side === "bottom" ? panelRect?.height : panelRect?.width) ?? 0),
        videoRect,
        margin: TRANSCRIPT_PANEL_MARGIN
      });
    }
  }
  const YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS = [
    { id: "all", label: "All" },
    { id: "starter", label: "Starter" },
    { id: "captions", label: "Captions" },
    { id: "native", label: "Native" },
    { id: "kids", label: "Kids" },
    { id: "gaming", label: "Gaming" },
    { id: "travel", label: "Travel" },
    { id: "food", label: "Food" }
  ];
  const YOUTUBE_CHANNEL_RECOMMENDATIONS = [
    { handle: "@SuitTravel", name: "Suit Travel", level: "N1", topics: ["Travel", "Culture"], captions: [], sources: ["nihongotube"] },
    { handle: "@oi_ken", name: "けんた食堂", level: "N2", topics: ["Food"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@ore.fiction", name: "俺フィク", level: "N2", topics: ["Comedy"], captions: [], sources: ["nihongotube"] },
    { handle: "@higemilk", name: "髭ミルク", level: "N3", topics: ["Fashion"], captions: [], sources: ["nihongotube"] },
    { handle: "@norunine", name: "兄者弟者", level: "N2", topics: ["Gaming"], captions: [], sources: ["nihongotube"] },
    { handle: "@mentalistdaigo", name: "メンタリスト DaiGo", level: "N2", topics: ["Philosophy", "Education"], captions: [], sources: ["nihongotube"] },
    { handle: "@zetsubouline", name: "絶望ライン工ch", level: "N2", topics: ["Comedy", "Lifestyle"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@android_", name: "散歩するアンドロイド", level: "N3", topics: ["Travel"], captions: [], sources: ["nihongotube"] },
    { handle: "@musyokutabi_jp", name: "musyokutabi", level: "N3", topics: ["Travel"], captions: [], sources: ["nihongotube"] },
    { handle: "@Akane-JapaneseClass", name: "あかね的日本語教室", level: "N4", topics: ["Education"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@はいじぃ迷作劇場", name: "Haiji's Japanese Food Collection", level: "N3", topics: ["Food"], captions: [], sources: ["nihongotube"] },
    { handle: "@SuzukawaAyako", name: "鈴川絢子", level: "N3", topics: ["Travel", "Transport"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@NKTofficial", name: "中田敦彦のYouTube大学", level: "N1", topics: ["Education"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@daihenshinn", name: "大変身ちゃんねる", level: "N3", topics: ["Fashion"], captions: [], sources: ["nihongotube"] },
    { handle: "@teru5300", name: "TERUちゃん", level: "N3", topics: ["Anime & Manga"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@mishima3", name: "ミシマ.", level: "N2", topics: ["Anime & Manga"], captions: [], sources: ["nihongotube"] },
    { handle: "@habushiura", name: "Active Otaku Channel", level: "N2", topics: ["Anime & Manga", "Travel"], captions: [], sources: ["nihongotube"] },
    { handle: "@shogo51", name: "森翔吾", level: "N3", topics: ["Travel", "Culture"], captions: [], sources: ["nihongotube"] },
    { handle: "@paka_channel", name: "パーカー / 大学生の日常", level: "N3", topics: ["Lifestyle"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@haruanne", name: "はるあん", level: "N4", topics: ["Food"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@pockysweets", name: "ポッキー", level: "N3", topics: ["Gaming", "Comedy"], captions: [], sources: ["nihongotube"] },
    { handle: "@osho_taigu", name: "大愚和尚の一問一答", level: "N2", topics: ["Philosophy"], captions: [], sources: ["nihongotube"] },
    { handle: "@ikechan0920", name: "いけちゃん", level: "N3", topics: ["Travel", "Lifestyle"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@JSI55", name: "Japanese super immersion", level: "N3", topics: ["Education"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@jarujaruisland8111", name: "ジャルジャルアイランド", level: "N1", topics: ["Comedy"], captions: [], sources: ["nihongotube"] },
    { handle: "@YAKISHIMA_TRAVEL_秘境ハンター", name: "YAKISHIMA TRAVEL TV", level: "N2", topics: ["Travel"], captions: [], sources: ["nihongotube"] },
    { handle: "@yuuka_chan815", name: "Yuka", level: "N2", topics: ["Travel"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@wakuwakujapanese", name: "WAKU WAKU JAPANESE", level: "N5", topics: ["Education", "Drama"], captions: ["hard", "furigana"], sources: ["nihongotube"] },
    { handle: "@EASYJAPANESE", name: "EASY JAPANESE PODCAST", level: "N3", topics: ["Education"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@MaichanJapanesePodcast", name: "MAIの日本語Podcast", level: "N3", topics: ["Education"], captions: ["soft", "hard", "furigana"], sources: ["nihongotube"] },
    { handle: "@pekopeko_japanese", name: "peko peko vlog", level: "N2", topics: ["Education"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@japanese-listening-podcast", name: "日本語の聴解のためのPodcast", level: "N4", topics: ["Education"], captions: [], sources: ["nihongotube"] },
    { handle: "@ひよりの虫日記", name: "ひよりの虫日記", level: "N2", topics: ["Nature"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@bstbs6ch-inujikan-nekojiman", name: "いぬじかん&ねこ自慢", level: "N3", topics: ["Animals", "Documentary"], captions: [], sources: ["nihongotube"] },
    { handle: "@NipponFoundationPR", name: "日本財団", level: "N2", topics: ["Lifestyle", "Documentary"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@JapanesewithShun", name: "Japanese with Shun", level: "N5", topics: ["Education"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@kimagurecook", name: "きまぐれクック", level: "N3", topics: ["Food"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@kurzgesagt_jp", name: "Kurzgesagt JP", level: "N2", topics: ["Education", "Science"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@KOUSEI0828", name: "Kousei cooking", level: "N2", topics: ["Food"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@ShigeTravel", name: "しげ旅", level: "N2", topics: ["Travel"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@tsubasa6417", name: "がみ", level: "N2", topics: ["Travel", "Transport"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@shioneru", name: "しおねる", level: "N2", topics: ["Travel", "Transport"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@anothersky_ntv", name: "アナザースカイ", level: "N2", topics: ["Travel", "Culture"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@BappaShota", name: "Bappa Shota", level: "N2", topics: ["Travel", "Documentary"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@the_bitesize_japanese_podcast", name: "Bite Size Japanese", level: "N4", topics: ["Education"], captions: ["soft", "hard", "furigana"], sources: ["nihongotube"] },
    { handle: "@TheNihongoNook", name: "The Nihongo Nook", level: "N5", topics: ["Education"], captions: [], sources: ["nihongotube"] },
    { handle: "@afromask", name: "アフロマスク", level: "N2", topics: ["Gaming"], captions: [], sources: ["nihongotube"] },
    { handle: "@joevlog7", name: "JOE VLOG", level: "N2", topics: ["Travel", "Documentary"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@chinese-muimui", name: "とある中国人のむいむい", level: "N2", topics: ["Lifestyle", "Culture"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@hima_hima", name: "HIMA HIMA CHANNEL", level: "N3", topics: ["Lifestyle"], captions: ["hard", "soft"], sources: ["nihongotube"] },
    { handle: "@tsuchikure-princess", name: "土くれプリンセス さおりの暮らし", level: "N3", topics: ["Nature", "Lifestyle"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@DailyJapanese", name: "Daily Japanese with Naoko", level: "N5", topics: ["Education"], captions: ["hard", "soft", "furigana"], sources: ["nihongotube"] },
    { handle: "@Aki-SenseiJPN", name: "Akiko Japanese Conversations", level: "N5", topics: ["Education"], captions: ["hard", "soft"], sources: ["nihongotube"] },
    { handle: "@Akokitamura", name: "Ako from Nihongo Picnic", level: "N4", topics: ["Education"], captions: [], sources: ["nihongotube"] },
    { handle: "@podcast-kotonoha", name: "ことのは・日本語の会話", level: "N4", topics: ["Education"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@kensanokaeri", name: "けんさんおかえり", level: "N5", topics: ["Education"], captions: ["hard", "soft", "furigana"], sources: ["nihongotube"] },
    { handle: "@LearnJapanesewithNoriko", name: "Learn Japanese with Noriko", level: "N3", topics: ["Education"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@OkkeiJapanese", name: "OkkeiJapanese", level: "N4", topics: ["Education"], captions: ["hard", "soft"], sources: ["nihongotube"] },
    { handle: "@06haruna09", name: "はるちゃんねる", level: "N3", topics: ["Gaming"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@mitubacraft", name: "みつば / MitubaCraft", level: "N2", topics: ["Gaming"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@SHIZUKU-ichu", name: "しずく", level: "N4", topics: ["Gaming"], captions: [], sources: ["nihongotube"] },
    { handle: "@Atashinchi", name: "あたしンち公式チャンネル", level: "N4", topics: ["Anime & Manga", "Comedy"], captions: [], sources: ["nihongotube"] },
    { handle: "@CuriousGeorgeJP", name: "おさるのジョージ", level: "N4", topics: ["Anime & Manga", "Kids"], captions: [], sources: ["nihongotube"] },
    { handle: "@SHIMAJIROCH", name: "しまじろうチャンネル", level: "N4", topics: ["Kids"], captions: [], sources: ["nihongotube"] },
    { handle: "@iroriro", name: "いろりろチャンネル", level: "N4", topics: ["Kids"], captions: [], sources: ["nihongotube"] },
    { handle: "@disneyjuniorjp", name: "ディズニージュニア公式", level: "N4", topics: ["Kids"], captions: [], sources: ["nihongotube"] },
    { handle: "@meicari", name: "メイキャリ", level: "N1", topics: ["Career", "Education"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@tentyou", name: "遊楽舎ちゃんねる", level: "N1", topics: ["Hobby"], captions: [], sources: ["nihongotube"] },
    { handle: "@reiwanotora", name: "令和の虎CHANNEL", level: "N1", topics: ["Business"], captions: [], sources: ["nihongotube"] },
    { handle: "@MrPsychopass", name: "サイコパスおじさん", level: "N1", topics: ["Psychology", "Society"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@karadayorokobu", name: "カラダヨロコブ", level: "N1", topics: ["Health"], captions: [], sources: ["nihongotube"] },
    { handle: "@ICHIKEN1", name: "イチケン", level: "N1", topics: ["Technology", "Hobby"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@tobalog_toba", name: "トバログ", level: "N1", topics: ["Technology"], captions: ["soft", "hard"], sources: ["nihongotube"] },
    { handle: "@bossb5553", name: "天文物理学者BossB", level: "N1", topics: ["Science", "Education"], captions: ["hard"], sources: ["nihongotube"] },
    { handle: "@Shimizu_OC", name: "清水貴裕", level: "N1", topics: ["Hobby", "Technology"], captions: [], sources: ["nihongotube"] },
    { handle: "@cijapanese", name: "Comprehensible Japanese", level: "N5", topics: ["Education"], captions: ["soft"], sources: ["nihongotube", "jpdb", "search"] },
    { handle: "@nihongoconteppei", name: "Teppei", level: "N5", topics: ["Education"], captions: [], sources: ["nihongotube"] },
    { handle: "@Udonsobakantou", name: "うどんそば 関東", level: "N1", topics: ["Travel", "Food"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@KozueChibaManga", name: "千葉コズエ", level: "N2", topics: ["Art", "Anime & Manga"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@namishodo", name: "Namishodo", level: "N3", topics: ["Education", "Culture"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@GamerGrandma", name: "Gamer Grandma", level: "N3", topics: ["Gaming"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@NihongoDekita", name: "NihongoDekita with Sayaka", level: "N4", topics: ["Education"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@TokyoTrivia", name: "東京限定雑学", level: "N1", topics: ["Education"], captions: ["soft"], sources: ["nihongotube"] },
    { handle: "@musclearuaru", name: "筋肉あるある", level: "N1", topics: ["Fitness", "Science"], captions: [], sources: ["nihongotube"] },
    { handle: "@tomorunblog", name: "ともらん ! Japan Running", level: "N1", topics: ["Fitness"], captions: [], sources: ["nihongotube"] },
    { handle: "@Dark-world_Tourist", name: "闇世界のツーリスト", level: "N1", topics: ["Entertainment", "Mystery"], captions: [], sources: ["nihongotube"] },
    { handle: "@Rap_EJ", name: "Rap EJ", level: "N1", topics: ["Entertainment", "Music"], captions: [], sources: ["nihongotube"] },
    { handle: "@CROSSROADLAB", name: "CROSSROAD LAB", level: "N1", topics: ["Food"], captions: [], sources: ["nihongotube"] },
    { handle: "@soezimaxTV", name: "ソエジマックスのモトブログ", level: "N1", topics: ["Transport"], captions: [], sources: ["nihongotube"] },
    { handle: "@shogihoroki", name: "将棋放浪記", level: "N1", topics: ["Gaming"], captions: [], sources: ["nihongotube"] },
    { handle: "@Taichi25", name: "たいち", level: "N1", topics: ["Gaming"], captions: [], sources: ["nihongotube"] },
    { handle: "@programming_tutorial_youtube", name: "プログラミングチュートリアル", level: "N1", topics: ["Education", "Technology"], captions: [], sources: ["nihongotube"] },
    { handle: "@naokimanshow-naokiman", name: "Naokiman Show", level: "N1", topics: ["Entertainment", "Mystery"], captions: [], sources: ["nihongotube"] },
    { handle: "@pokemonkidstvJP", name: "ポケモン Kids TV", level: "N4", topics: ["Entertainment", "Kids"], captions: [], sources: ["nihongotube"] },
    { handle: "@iroironanihongo", name: "いろいろな日本語", level: "N5", topics: ["Education", "Anime & Manga"], captions: [], sources: ["nihongotube"] },
    { handle: "@KahoMiyake", name: "三宅書店", level: "N2", topics: ["Books"], captions: [], sources: ["nihongotube"] },
    { handle: "@MyLittlePonyJapanese", name: "My Little Pony JP", level: "N4", topics: ["Film & Animation"], captions: [], sources: ["nihongotube"] },
    { handle: "@nihongo-no-jikan", name: "にほんごのじかん", level: "N5", topics: ["Education", "Culture", "Gaming"], captions: ["soft"], sources: ["user", "search"] },
    { handle: "@nihongo-learning7582", name: "Nihongo-Learning", level: "N5", topics: ["Education", "Travel", "Culture"], captions: ["soft"], sources: ["reddit"] },
    { handle: "@SpeakJapaneseNaturally", name: "Speak Japanese Naturally", level: "N4", topics: ["Education", "Pronunciation", "Travel"], captions: ["soft"], sources: ["reddit", "search"] }
  ];
  const YOUTUBE_CHANNEL_RECOMMENDATION_COUNT = YOUTUBE_CHANNEL_RECOMMENDATIONS.length;
  function allYouTubeChannelRecommendations() {
    return [...YOUTUBE_CHANNEL_RECOMMENDATIONS];
  }
  function youtubeChannelUrl(channel) {
    return `https://www.youtube.com/${encodeURI(channel.handle)}`;
  }
  function youtubeChannelRecommendationDescription(channel) {
    const topics = channel.topics.slice(0, 2).join(" and ").toLowerCase();
    const captionHint = channel.captions.length ? " Captions are often available." : "";
    return `${topics || "Japanese"} videos around ${channel.level}.${captionHint}`;
  }
  function filterYouTubeChannelRecommendations(filter) {
    return YOUTUBE_CHANNEL_RECOMMENDATIONS.filter((channel) => matchesYouTubeChannelRecommendationFilter(channel, filter));
  }
  function starterYouTubeChannelRecommendations(limit) {
    return YOUTUBE_CHANNEL_RECOMMENDATIONS.filter((channel) => matchesYouTubeChannelRecommendationFilter(channel, "starter")).slice(0, limit);
  }
  function matchesYouTubeChannelRecommendationFilter(channel, filter) {
    if (filter === "all") return true;
    if (filter === "starter") return channel.level === "N5" || channel.level === "N4";
    if (filter === "captions") return channel.captions.length > 0;
    if (filter === "native") return channel.level === "N3" || channel.level === "N2" || channel.level === "N1";
    return channel.topics.some((topic) => topic.toLowerCase().includes(filter));
  }
  const HIRAGANA_RE = /\p{Script=Hiragana}/u;
  const KATAKANA_RE = /\p{Script=Katakana}/u;
  const HAN_RE = /\p{Script=Han}/u;
  const NIHONGO_TUBE_SYMBOL_RE = /[≧≦°ಠ●◕○◯⊙▽△_∩∪ﾟ∇♪ω◇◆◎⌒※☆★♡♥︶︸ಥ¬╯╰┻┳━┛┗┓┏┫┣╋╂┃━─┌┐└┘├┤┴┬╱╲╳]/u;
  const JAPANESE_LEARNING_INTENT_RE = /\b(?:comprehensible\s+(?:input|japanese)|japanese\s+comprehensible\s+input|learn(?:ing)?\s+japanese|japanese\s+(?:daily\s+conversation|listening|conversation|conversations|grammar|vocabulary|shadowing|immersion|input|lesson|lessons|podcast|podcasts|phrases?|story|stories|practice|words?)|beginner\s+japanese|complete\s+beginner\s+japanese|absolute\s+beginner\s+japanese|nihongo|jlpt|n[1-5](?:\s*[/-]\s*n[1-5])?)\b|#(?:learnjapanese|japanese|nihongo)\b/i;
  const YOUTUBE_FILTER_DECISION_RULES = [
    alwaysHiddenYouTubeFilterDecision,
    missingTitleYouTubeFilterDecision,
    missingFilterTextYouTubeFilterDecision,
    japaneseYouTubeFilterDecision
  ];
  function classifyYouTubeFilterCandidates(candidates, options) {
    const decisions = [];
    const visibleVideoIds = /* @__PURE__ */ new Set();
    let filteredCount = 0;
    let shownCount = 0;
    for (const candidate of candidates) {
      const decision = classifyYouTubeFilterCandidate(candidate, options);
      decisions.push(decision);
      if (candidate.alwaysHidden || decision.reason === "non-japanese" || decision.reason === "revealed") filteredCount += 1;
      if (decision.kind === "show") {
        shownCount += 1;
        if (!candidate.alwaysHidden && candidate.videoId) visibleVideoIds.add(candidate.videoId);
      }
    }
    return { decisions, filteredCount, shownCount, visibleVideoIds };
  }
  function isProbablyJapaneseYouTubeText(text) {
    const compact = normalizeYouTubeTitleForLanguageCheck(text);
    if (JAPANESE_LEARNING_INTENT_RE.test(compact)) return true;
    if (!HAS_JAPANESE.test(compact)) return false;
    return HIRAGANA_RE.test(compact) || KATAKANA_RE.test(compact) || HAN_RE.test(compact);
  }
  function classifyYouTubeFilterCandidate(candidate, options) {
    for (const rule of YOUTUBE_FILTER_DECISION_RULES) {
      const decision = rule(candidate, options);
      if (decision) return decision;
    }
    return nonJapaneseYouTubeFilterDecision(candidate, options);
  }
  function alwaysHiddenYouTubeFilterDecision(candidate, options) {
    if (candidate.alwaysHidden) {
      return {
        candidate,
        kind: options.revealed ? "show" : "hide",
        reason: options.revealed ? "always-hidden-revealed" : "always-hidden"
      };
    }
    return null;
  }
  function missingTitleYouTubeFilterDecision(candidate) {
    return candidate.title ? null : { candidate, kind: "skip", reason: "missing-title" };
  }
  function missingFilterTextYouTubeFilterDecision(candidate, options) {
    if (!candidate.filterText) {
      return {
        candidate,
        kind: options.revealed ? "skip" : "hide",
        reason: "missing-filter-text"
      };
    }
    return null;
  }
  function japaneseYouTubeFilterDecision(candidate) {
    return isProbablyJapaneseYouTubeText(candidate.filterText) ? { candidate, kind: "show", reason: "japanese" } : null;
  }
  function nonJapaneseYouTubeFilterDecision(candidate, options) {
    return {
      candidate,
      kind: options.revealed ? "show" : "hide",
      reason: options.revealed ? "revealed" : "non-japanese"
    };
  }
  function normalizeYouTubeTitleForLanguageCheck(text) {
    return text.replace(/fypシ゚/g, "").replace(/fypシ/g, "").replace(/ミックスリスト/g, "").replace(NIHONGO_TUBE_SYMBOL_RE, "").replace(/\s+/g, " ").trim();
  }
  const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
  const YOUTUBE_READER_ROOT_SELECTOR = "[data-jpdb-reader-root]";
  const YOUTUBE_FILTERED_CLASS = "jpdb-youtube-filtered";
  const YOUTUBE_PENDING_CLASS = "jpdb-youtube-filter-pending";
  const YOUTUBE_COLLAPSING_CLASS = "jpdb-youtube-filter-collapsing";
  const YOUTUBE_COLLAPSED_CLASS = "jpdb-youtube-filter-collapsed";
  const YOUTUBE_FILTERED_SELECTOR = `[data-yomu-youtube-filtered="true"],[data-yomu-youtube-pending="true"],.${YOUTUBE_FILTERED_CLASS},.${YOUTUBE_PENDING_CLASS}`;
  const SHELF_SELECTOR = "grid-shelf-view-model,ytd-rich-shelf-renderer,ytd-reel-shelf-renderer,ytd-shelf-renderer,ytm-reel-shelf-renderer";
  const SHORTS_CARD_SELECTOR = "ytd-reel-item-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2";
  const VIDEO_CARD_HIDE_TARGET_SELECTOR = `ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytm-rich-item-renderer,ytm-compact-video-renderer,ytm-video-card-renderer,ytm-video-with-context-renderer,ytm-channel-featured-video-renderer,${SHORTS_CARD_SELECTOR}`;
  const VIDEO_CARD_SELECTOR = `${VIDEO_CARD_HIDE_TARGET_SELECTOR},yt-lockup-view-model`;
  const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;
  const NON_VIDEO_CONTAINER_SELECTOR = `${SHELF_SELECTOR},ytd-playlist-renderer,ytd-compact-playlist-renderer,ytd-radio-renderer,ytd-compact-radio-renderer,ytm-playlist-renderer,ytm-compact-playlist-renderer`;
  const FILTERABLE_VIDEO_SHELF_SELECTOR = SHELF_SELECTOR;
  const SHORTS_WATCH_ITEM_SELECTOR = "ytd-shorts,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2";
  const TITLE_SELECTORS = [
    "#video-title",
    "a#video-title",
    "yt-formatted-string#video-title",
    "h3 a",
    "h3",
    ".yt-lockup-metadata-view-model-wiz__title",
    ".ytLockupMetadataViewModelTitle",
    ".ytLockupMetadataViewModelHeadingReset",
    "h3.details > span.yt-core-attributed-string",
    "h4.video-card-title > span.yt-core-attributed-string",
    "h4.YtmCompactMediaItemHeadline > span.yt-core-attributed-string",
    ".YtmCompactMediaItemHeadline",
    "h3.media-item-headline > span.yt-core-attributed-string",
    ".media-item-headline",
    ".shortsLockupViewModelHostMetadataTitle span",
    ".shortsLockupViewModelHostMetadataTitle",
    'a[href*="/watch"]',
    'a[href*="/shorts"]'
  ];
  const WATCH_LINK_SELECTOR = 'a[href*="/watch"]';
  const SHORTS_LOCAL_LINK_SELECTOR = 'a[href^="/shorts/"]';
  const SHORTS_ABSOLUTE_LINK_SELECTOR = 'a[href*="youtube.com/shorts/"]';
  const VIDEO_LINK_SELECTORS = `${WATCH_LINK_SELECTOR},${SHORTS_LOCAL_LINK_SELECTOR},${SHORTS_ABSOLUTE_LINK_SELECTOR},a.video-card-title-container,a.video-card-image,a.YtmCompactMediaItemMetadataContent,a.YtmCompactMediaItemImage,a.media-item-thumbnail-container,a.shortsLockupViewModelHostEndpoint,ytm-media-item a[href],.yt-lockup-view-model__content-image,ytd-thumbnail > a,a.yt-simple-endpoint,a#video-title,yt-formatted-string#title > a.yt-simple-endpoint`;
  const VIDEO_ANCHOR_SELECTOR = `a[href^="/watch"],a[href*="/watch?v="],a[href*="youtube.com/watch"],${SHORTS_LOCAL_LINK_SELECTOR},${SHORTS_ABSOLUTE_LINK_SELECTOR}`;
  const PLAYLIST_BADGE_SELECTOR = 'ytd-thumbnail-overlay-bottom-panel-renderer,ytd-thumbnail-overlay-side-panel-renderer,ytd-badge-supported-renderer,.badge-shape-wiz__text,[aria-label*="再生リスト"],[aria-label*="ミックス"]';
  const YOUTUBE_WATCH_TITLE_SELECTOR = "ytd-watch-metadata h1,ytd-watch-metadata #title";
  const YOUTUBE_FEED_CONTAINER_SELECTOR = "ytd-rich-grid-renderer,ytd-section-list-renderer,ytd-item-section-renderer,ytm-app,ytm-browse,ytm-rich-grid-renderer,ytm-item-section-renderer,ytm-search,lazy-list";
  const OEMBED_TITLE_CACHE_LIMIT = 240;
  const OEMBED_SESSION_CACHE_PREFIX = "yomu:youtube-oembed-title:v1:";
  const OEMBED_SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
  const OEMBED_BATCH_RESCAN_DELAY_MS = 180;
  const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 4200;
  const YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS = 90;
  const YOUTUBE_FILTER_COLLAPSE_DELAY_MS = 80;
  const YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS = 650;
  const YOUTUBE_FILTER_SCROLL_SETTLE_MS = 280;
  const YOUTUBE_FILTER_COLLAPSE_DURATION_MS = 240;
  const YOUTUBE_VISIBLE_BACKFILL_TARGET = 18;
  const YOUTUBE_BACKFILL_THROTTLE_MS = 2400;
  const YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY = "--yomu-youtube-filter-card-height";
  const YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT = 6;
  const YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT = 8;
  const YOUTUBE_NAVIGATION_RESCAN_DELAY_MS = 120;
  const YOUTUBE_NAVIGATION_EVENTS = [
    "yt-navigate-finish",
    "yt-page-data-updated",
    "yt-page-type-changed",
    "popstate",
    "hashchange"
  ];
  function isYouTubeHost(hostname = location.hostname) {
    return YOUTUBE_HOST_RE.test(hostname);
  }
  function collectYouTubeVideoCards(root = document) {
    const cards = /* @__PURE__ */ new Set();
    root.querySelectorAll(VIDEO_CARD_SELECTOR).forEach((card) => {
      const normalized = normalizeYouTubeVideoCard(card);
      if (normalized) cards.add(normalized);
    });
    root.querySelectorAll(VIDEO_ANCHOR_SELECTOR).forEach((link) => {
      const closestCard = link.closest(VIDEO_CARD_CLOSEST_SELECTOR);
      const normalized = closestCard ? normalizeYouTubeVideoCard(closestCard) : null;
      if (normalized) cards.add(normalized);
    });
    return [...cards].filter((card) => card.isConnected);
  }
  function readYouTubeCardInfo(card) {
    const title = TITLE_SELECTORS.map((selector) => card.querySelector(selector)).find(Boolean);
    const titleText = title ? readYouTubeTitleText(title) : "";
    return {
      card,
      title: (titleText.trim() || card.textContent?.trim() || "").trim(),
      videoId: readYouTubeVideoId(card)
    };
  }
  class YoutubeImmersionFilter {
    constructor(options) {
      this.options = options;
    }
    observer;
    events;
    timer;
    metadataRescanTimer;
    noticeTimer;
    bar;
    channelShelf;
    revealed = false;
    dismissedNoticeScope = "";
    dismissedChannelShelfScope = "";
    noticeRouteKey = "";
    channelShelfRouteKey = "";
    channelShelfExpanded = false;
    channelShelfFilter = "all";
    subscriptionBusy = false;
    lastBackfillAt = Number.NEGATIVE_INFINITY;
    lastScrollAt = Number.NEGATIVE_INFINITY;
    destroyed = true;
    oembedTitleCache = /* @__PURE__ */ new Map();
    pendingOembedTitles = /* @__PURE__ */ new Set();
    channelPreviewCache = /* @__PURE__ */ new Map();
    channelIdCache = /* @__PURE__ */ new Map();
    pendingChannelPreviews = /* @__PURE__ */ new Set();
    cardTimers = /* @__PURE__ */ new WeakMap();
    compactChannelRecommendations = randomStarterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
    // fallow-ignore-next-line unused-class-member
    init() {
      this.destroy();
      this.destroyed = false;
      if (!this.isActivePage() || !document.body || !this.options.getSettings().youtubeImmersionEnabled) {
        this.destroyed = true;
        return;
      }
      this.setFilterActiveClass(true);
      this.startWatching();
      this.scan();
    }
    startWatching() {
      if (this.observer || !document.body) return;
      this.events = new AbortController();
      this.observer = new MutationObserver((mutations) => {
        if (mutations.every(mutationInsideReaderRoot)) return;
        if (!mutations.some(mutationMayAffectYouTubeCards)) return;
        this.maskAddedYouTubeCards(mutations);
        this.schedule(YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
      });
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "title", "aria-label"],
        characterData: true
      });
      for (const eventName of YOUTUBE_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, () => this.schedule(YOUTUBE_NAVIGATION_RESCAN_DELAY_MS), { signal: this.events.signal });
      }
      window.addEventListener("scroll", () => {
        this.lastScrollAt = Date.now();
        if (isNearPageBottom()) this.schedule(180);
      }, { passive: true, signal: this.events.signal });
    }
    // fallow-ignore-next-line unused-class-member
    refresh() {
      if (!this.isActivePage()) {
        this.destroy();
        return;
      }
      if (!this.options.getSettings().youtubeImmersionEnabled) {
        this.destroyed = true;
        this.stopWatching();
        this.clear();
        return;
      }
      this.destroyed = false;
      this.setFilterActiveClass(true);
      this.startWatching();
      window.clearTimeout(this.timer);
      this.timer = void 0;
      this.scan();
    }
    destroy() {
      this.destroyed = true;
      this.stopWatching();
      this.clear();
    }
    stopWatching() {
      this.events?.abort();
      this.events = void 0;
      this.observer?.disconnect();
      this.observer = void 0;
    }
    isActivePage() {
      return this.options.isActivePage?.() ?? isYouTubeHost();
    }
    schedule(delay) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.timer = void 0;
        this.scan();
      }, delay);
    }
    scan() {
      const settings = this.options.getSettings();
      if (!settings.youtubeImmersionEnabled) {
        this.clear();
        return;
      }
      document.querySelectorAll(YOUTUBE_FILTERED_SELECTOR).forEach((card) => {
        if (shouldIgnoreYouTubeCardElement(card)) {
          this.showCard(card);
        }
      });
      unwrapYouTubeWatchTitleReaderWords();
      this.restoreCurrentShortsWatchItem();
      const result = classifyYouTubeFilterCandidates(this.collectFilterCandidates(), { revealed: this.revealed });
      result.decisions.forEach((decision) => this.applyFilterDecision(decision));
      this.syncFilterableVideoShelves();
      if (settings.youtubeShowFilterNotice && shouldShowFilterNoticeForRoute()) {
        this.renderNotice(result.filteredCount, result.shownCount, settings);
      } else {
        this.bar?.remove();
        this.bar = void 0;
      }
      this.syncChannelShelf(result.filteredCount, settings);
      this.maybeBackfillFeed(result.filteredCount, result.shownCount, result.visibleVideoIds.size);
    }
    collectFilterCandidates() {
      return collectYouTubeFilterItems().map((card) => this.filterCandidateForCard(card));
    }
    filterCandidateForCard(card) {
      if (isYouTubeAlwaysHiddenItem(card)) return hiddenYouTubeFilterCandidate(card);
      const info = readYouTubeCardInfo(card);
      return visibleYouTubeFilterCandidate(info, this.resolveTitleForFiltering(info));
    }
    applyFilterDecision(decision) {
      if (isCurrentYouTubeShortsWatchCard(decision.candidate.card)) {
        this.showCard(decision.candidate.card);
        return;
      }
      if (decision.kind === "skip") {
        this.clearPendingCard(decision.candidate.card);
        return;
      }
      if (decision.kind === "show") {
        this.showCard(decision.candidate.card);
        return;
      }
      this.hideCard(decision.candidate.card);
    }
    syncFilterableVideoShelves() {
      for (const shelf of collectFilterableVideoShelves()) {
        const cards = collectYouTubeVideoCards(shelf);
        if (!cards.length) continue;
        if (cards.every((card) => card.classList.contains(YOUTUBE_FILTERED_CLASS))) {
          this.hideCard(shelf);
        } else {
          this.showCard(shelf);
        }
      }
    }
    restoreCurrentShortsWatchItem() {
      if (!isYouTubeShortsWatchPage()) return;
      document.querySelectorAll(SHORTS_WATCH_ITEM_SELECTOR).forEach((item) => {
        if (isCurrentYouTubeShortsWatchCard(item)) this.showCard(item);
      });
    }
    hideCard(card) {
      const alreadyFiltered = card.classList.contains(YOUTUBE_FILTERED_CLASS);
      this.clearPendingCard(card);
      if (alreadyFiltered) return;
      this.prepareFilteredCard(card);
      card.classList.add(YOUTUBE_FILTERED_CLASS);
      card.dataset.yomuYoutubeFiltered = "true";
      if (!card.hasAttribute("aria-hidden")) card.dataset.yomuYoutubeAriaHidden = "true";
      card.setAttribute("aria-hidden", "true");
      this.queueFilteredCardCollapse(card, this.filteredCardCollapseDelay());
    }
    showCard(card) {
      this.clearCardTimers(card);
      this.clearPendingCard(card);
      card.classList.remove(YOUTUBE_FILTERED_CLASS, YOUTUBE_COLLAPSING_CLASS, YOUTUBE_COLLAPSED_CLASS);
      card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
      if (card.dataset.yomuYoutubeAriaHidden === "true") {
        card.removeAttribute("aria-hidden");
        delete card.dataset.yomuYoutubeAriaHidden;
      }
      delete card.dataset.yomuYoutubeFiltered;
    }
    maskAddedYouTubeCards(mutations) {
      const cards = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          this.collectYouTubeCardsInAddedNode(node).forEach((card) => cards.add(card));
        });
      }
      cards.forEach((card) => this.markPendingCard(card));
    }
    collectYouTubeCardsInAddedNode(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      const element = node;
      const cards = /* @__PURE__ */ new Set();
      const normalized = normalizeYouTubeFilterItem(element);
      if (normalized) cards.add(normalized);
      collectYouTubeFilterItems(element).forEach((card) => cards.add(card));
      return [...cards].filter((card) => card.isConnected);
    }
    markPendingCard(card) {
      if (card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
      card.classList.add(YOUTUBE_PENDING_CLASS);
      card.dataset.yomuYoutubePending = "true";
    }
    clearPendingCard(card) {
      card.classList.remove(YOUTUBE_PENDING_CLASS);
      delete card.dataset.yomuYoutubePending;
    }
    prepareFilteredCard(card) {
      const height = measuredYouTubeCardHeight(card);
      if (height > 0) card.style.setProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY, `${Math.ceil(height)}px`);
    }
    filteredCardCollapseDelay() {
      return this.scrollSettleDelay() > 0 ? YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS : YOUTUBE_FILTER_COLLAPSE_DELAY_MS;
    }
    scrollSettleDelay() {
      const elapsed = Date.now() - this.lastScrollAt;
      if (!Number.isFinite(elapsed)) return 0;
      return Math.max(0, YOUTUBE_FILTER_SCROLL_SETTLE_MS - elapsed);
    }
    queueFilteredCardCollapse(card, delay) {
      this.queueCardTimer(card, () => this.collapseFilteredCard(card), delay);
    }
    collapseFilteredCard(card) {
      if (!card.isConnected || !card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
      if (card.classList.contains(YOUTUBE_COLLAPSED_CLASS)) return;
      const settleDelay = this.scrollSettleDelay();
      if (settleDelay > 0) {
        this.queueFilteredCardCollapse(card, settleDelay + YOUTUBE_FILTER_COLLAPSE_DELAY_MS);
        return;
      }
      card.classList.add(YOUTUBE_COLLAPSING_CLASS);
      this.queueCardTimer(card, () => {
        if (!card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
        card.classList.add(YOUTUBE_COLLAPSED_CLASS);
        card.classList.remove(YOUTUBE_COLLAPSING_CLASS);
        card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
      }, YOUTUBE_FILTER_COLLAPSE_DURATION_MS);
    }
    queueCardTimer(card, callback, delay) {
      const timer = window.setTimeout(() => {
        const timers2 = this.cardTimers.get(card)?.filter((id) => id !== timer) ?? [];
        if (timers2.length) this.cardTimers.set(card, timers2);
        else this.cardTimers.delete(card);
        callback();
      }, delay);
      const timers = this.cardTimers.get(card) ?? [];
      timers.push(timer);
      this.cardTimers.set(card, timers);
    }
    clearCardTimers(card) {
      const timers = this.cardTimers.get(card);
      if (!timers) return;
      timers.forEach((timer) => window.clearTimeout(timer));
      this.cardTimers.delete(card);
    }
    renderNotice(filteredCount, shownCount, settings) {
      if (!filteredCount) {
        this.removeNotice();
        return;
      }
      const noticeScope = this.currentNoticeScope();
      if (!this.bar && this.dismissedNoticeScope === noticeScope) return;
      const shouldStartTimer = !this.bar;
      const notice = this.ensureNoticeBar();
      this.updateNoticeSummary(notice.summary, filteredCount, shownCount, settings);
      this.updateNoticeActions(notice, settings);
      if (shouldStartTimer) this.startNoticeTimer(noticeScope);
    }
    ensureNoticeBar() {
      if (!this.bar) {
        this.bar = this.createNoticeBar();
        document.body.append(this.bar);
      }
      return this.noticeElements(this.bar);
    }
    createNoticeBar() {
      const bar = document.createElement("div");
      bar.className = "jpdb-youtube-filter-bar";
      bar.dataset.jpdbReaderRoot = "true";
      const summary = document.createElement("span");
      summary.dataset.role = "summary";
      const actions = document.createElement("div");
      actions.className = "jpdb-youtube-filter-actions";
      actions.append(noticeButton("toggle-hidden"), noticeButton("hide-notice"));
      bar.append(summary, actions);
      bar.addEventListener("click", (event) => this.handleNoticeClick(event));
      return bar;
    }
    noticeElements(bar) {
      return {
        summary: bar.querySelector('[data-role="summary"]'),
        toggleHidden: bar.querySelector('[data-action="toggle-hidden"]'),
        hideNotice: bar.querySelector('[data-action="hide-notice"]')
      };
    }
    handleNoticeClick(event) {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "toggle-hidden") this.toggleHiddenVideos();
      if (action === "hide-notice") this.dismissFilterNotice();
    }
    toggleHiddenVideos() {
      this.revealed = !this.revealed;
      this.schedule(0);
    }
    dismissFilterNotice() {
      this.options.setShowFilterNotice?.(false);
      this.dismissedNoticeScope = this.currentNoticeScope();
      this.removeNotice();
    }
    updateNoticeSummary(summary, filteredCount, shownCount, settings) {
      summary.textContent = this.noticeSummaryText(filteredCount, settings);
      summary.title = shownCount ? formatYoutubeText(uiText(settings.interfaceLanguage, "youtubeFilterVisible"), { count: String(shownCount) }) : "";
    }
    noticeSummaryText(filteredCount, settings) {
      const plural = filteredCount === 1 ? "" : "s";
      const key2 = this.revealed ? "youtubeFilterShowing" : "youtubeFilterHid";
      return formatYoutubeText(uiText(settings.interfaceLanguage, key2), {
        appName: APP_NAME,
        count: String(filteredCount),
        plural
      });
    }
    updateNoticeActions(notice, settings) {
      notice.toggleHidden.textContent = this.revealed ? uiText(settings.interfaceLanguage, "youtubeHideHiddenVideos") : uiText(settings.interfaceLanguage, "youtubeShowHiddenVideos");
      notice.hideNotice.textContent = uiText(settings.interfaceLanguage, "youtubeHideNotice");
    }
    syncChannelShelf(filteredCount, settings) {
      if (!this.shouldShowChannelShelf(filteredCount, settings)) {
        this.removeChannelShelf();
        return;
      }
      const scope = this.currentChannelShelfScope();
      if (!this.channelShelf && this.dismissedChannelShelfScope === scope) return;
      const shelf = this.ensureChannelShelf();
      const elements = this.channelShelfElements(shelf);
      this.renderChannelShelf(elements);
      this.placeChannelShelf(shelf);
    }
    shouldShowChannelShelf(filteredCount, settings) {
      if (!settings.youtubeShowChannelRecommendations) return false;
      if (this.revealed) return false;
      if (!shouldShowChannelRecommendationsForRoute()) return false;
      return filteredCount > 0 || isYouTubeHomePage();
    }
    ensureChannelShelf() {
      if (!this.channelShelf) this.channelShelf = this.createChannelShelf();
      return this.channelShelf;
    }
    createChannelShelf() {
      const shelf = document.createElement("section");
      shelf.className = "jpdb-youtube-channel-shelf";
      shelf.dataset.jpdbReaderRoot = "true";
      shelf.setAttribute("role", "region");
      shelf.setAttribute("aria-label", "Japanese channel recommendations");
      const header = document.createElement("div");
      header.className = "jpdb-youtube-channel-shelf-head";
      const copy = document.createElement("div");
      copy.className = "jpdb-youtube-channel-shelf-copy";
      const eyebrow = document.createElement("div");
      eyebrow.className = "jpdb-youtube-channel-shelf-eyebrow";
      eyebrow.textContent = APP_NAME;
      const title = document.createElement("h2");
      title.dataset.role = "channel-title";
      const description = document.createElement("p");
      description.dataset.role = "channel-copy";
      copy.append(eyebrow, title, description);
      const actions = document.createElement("div");
      actions.className = "jpdb-youtube-channel-shelf-actions";
      actions.append(
        channelShelfButton("subscribe-visible"),
        channelShelfButton("subscribe-all"),
        channelShelfButton("dismiss"),
        channelShelfButton("never")
      );
      header.append(copy, actions);
      const filters = document.createElement("div");
      filters.className = "jpdb-youtube-channel-shelf-filters";
      filters.dataset.role = "channel-filters";
      const list = document.createElement("ol");
      list.className = "jpdb-youtube-channel-shelf-list";
      list.dataset.role = "channel-list";
      const footer = document.createElement("div");
      footer.className = "jpdb-youtube-channel-shelf-foot";
      const status = document.createElement("div");
      status.className = "jpdb-youtube-channel-shelf-status";
      status.dataset.role = "channel-status";
      status.setAttribute("aria-live", "polite");
      const expand = channelShelfButton("expand");
      footer.append(status, expand);
      shelf.append(header, filters, list, footer);
      shelf.addEventListener("click", (event) => this.handleChannelShelfClick(event));
      return shelf;
    }
    channelShelfElements(shelf) {
      return {
        title: shelf.querySelector('[data-role="channel-title"]'),
        copy: shelf.querySelector('[data-role="channel-copy"]'),
        status: shelf.querySelector('[data-role="channel-status"]'),
        filters: shelf.querySelector('[data-role="channel-filters"]'),
        list: shelf.querySelector('[data-role="channel-list"]'),
        expand: shelf.querySelector('[data-yomu-youtube-channel-action="expand"]'),
        subscribeVisible: shelf.querySelector('[data-yomu-youtube-channel-action="subscribe-visible"]'),
        subscribeAll: shelf.querySelector('[data-yomu-youtube-channel-action="subscribe-all"]'),
        dismiss: shelf.querySelector('[data-yomu-youtube-channel-action="dismiss"]'),
        never: shelf.querySelector('[data-yomu-youtube-channel-action="never"]')
      };
    }
    renderChannelShelf(elements) {
      const recommendations = this.currentChannelRecommendations();
      const visibleRecommendations = this.channelShelfExpanded ? recommendations : this.compactChannelRecommendations;
      const renderedRecommendations = visibleRecommendations.slice(0, this.channelShelfExpanded ? YOUTUBE_CHANNEL_RECOMMENDATION_COUNT : YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
      this.channelShelf?.classList.toggle("is-expanded", this.channelShelfExpanded);
      elements.title.textContent = "Start your Japanese YouTube feed";
      elements.copy.textContent = this.channelShelfExpanded ? `${recommendations.length} shown from ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels.` : `${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels, shown as compact YouTube-style rows.`;
      elements.subscribeVisible.textContent = `Subscribe visible (${renderedRecommendations.length})`;
      elements.subscribeAll.textContent = `Subscribe all ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT}`;
      elements.dismiss.textContent = "Dismiss";
      elements.never.textContent = "Hide";
      elements.expand.textContent = this.channelShelfExpanded ? "Collapse" : "Browse all channels";
      elements.expand.setAttribute("aria-expanded", String(this.channelShelfExpanded));
      if (!this.subscriptionBusy) elements.status.textContent = readYouTubeClientConfig() ? "Previews load from YouTube on this page." : "Subscribe here when YouTube session data is available.";
      this.renderChannelFilters(elements.filters);
      elements.list.replaceChildren(...renderedRecommendations.map((channel) => this.renderChannelRow(channel)));
      this.setChannelShelfBusy(this.subscriptionBusy);
      void this.hydrateChannelPreviews(renderedRecommendations.slice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT));
    }
    currentChannelRecommendations() {
      return this.channelShelfExpanded ? filterYouTubeChannelRecommendations(this.channelShelfFilter) : this.compactChannelRecommendations;
    }
    renderChannelFilters(filters) {
      filters.hidden = !this.channelShelfExpanded;
      if (!this.channelShelfExpanded) {
        filters.replaceChildren();
        return;
      }
      filters.replaceChildren(...YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS.map((filter) => {
        const button = channelShelfButton("filter");
        button.dataset.filter = filter.id;
        button.textContent = filter.label;
        button.setAttribute("aria-pressed", String(filter.id === this.channelShelfFilter));
        return button;
      }));
    }
    renderChannelRow(channel) {
      const preview = this.channelPreviewCache.get(channel.handle) ?? null;
      const row = document.createElement("li");
      row.className = "jpdb-youtube-channel-row";
      row.dataset.yomuChannelHandle = channel.handle;
      row.append(
        this.renderChannelAvatar(channel, preview),
        this.renderChannelBody(channel, preview),
        this.renderChannelSubscribeButton(channel)
      );
      return row;
    }
    renderChannelAvatar(channel, preview) {
      const avatar = document.createElement("a");
      avatar.className = "jpdb-youtube-channel-avatar";
      avatar.href = youtubeChannelUrl(channel);
      avatar.target = "_blank";
      avatar.rel = "noopener";
      avatar.setAttribute("aria-label", `${channel.name} on YouTube`);
      const fallback = document.createElement("span");
      fallback.textContent = channel.name.trim().charAt(0).toUpperCase() || "日";
      const image = document.createElement("img");
      const avatarUrl = preview?.avatarUrl ?? "";
      image.alt = "";
      image.hidden = !avatarUrl;
      if (avatarUrl) image.src = avatarUrl;
      avatar.append(image, fallback);
      return avatar;
    }
    renderChannelBody(channel, preview) {
      const body = document.createElement("div");
      body.className = "jpdb-youtube-channel-body";
      const name = document.createElement("a");
      name.className = "jpdb-youtube-channel-name";
      name.href = youtubeChannelUrl(channel);
      name.target = "_blank";
      name.rel = "noopener";
      name.textContent = preview?.title || channel.name;
      const meta = document.createElement("div");
      meta.className = "jpdb-youtube-channel-meta";
      meta.textContent = channelRowMetaText(channel, preview);
      const description = document.createElement("div");
      description.className = "jpdb-youtube-channel-description";
      description.textContent = preview?.description || youtubeChannelRecommendationDescription(channel);
      const tags = document.createElement("div");
      tags.className = "jpdb-youtube-channel-tags";
      channelRowTags(channel).forEach((tag) => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tags.append(chip);
      });
      body.append(name, meta, description, tags);
      return body;
    }
    renderChannelSubscribeButton(channel) {
      const subscribe = channelShelfButton("subscribe-one");
      subscribe.dataset.handle = channel.handle;
      subscribe.textContent = "Subscribe";
      subscribe.setAttribute("aria-label", `Subscribe to ${channel.name}`);
      return subscribe;
    }
    placeChannelShelf(shelf) {
      if (shelf.isConnected) return;
      const anchor = findChannelShelfAnchor();
      if (anchor) {
        anchor.prepend(shelf);
        return;
      }
      document.body?.prepend(shelf);
    }
    handleChannelShelfClick(event) {
      const button = event.target.closest("[data-yomu-youtube-channel-action]");
      if (!button) return;
      this.handleChannelShelfAction(button);
    }
    handleChannelShelfAction(button) {
      const action = button.dataset.yomuYoutubeChannelAction;
      if (this.handleChannelShelfViewAction(action, button)) return;
      this.handleChannelShelfSubscriptionAction(action, button);
    }
    handleChannelShelfViewAction(action, button) {
      switch (action) {
        case "expand":
          this.channelShelfExpanded = !this.channelShelfExpanded;
          this.renderChannelShelf(this.channelShelfElements(this.ensureChannelShelf()));
          return true;
        case "filter":
          this.channelShelfFilter = button.dataset.filter ?? "all";
          this.channelShelfExpanded = true;
          this.renderChannelShelf(this.channelShelfElements(this.ensureChannelShelf()));
          return true;
        case "dismiss":
          this.dismissedChannelShelfScope = this.currentChannelShelfScope();
          this.removeChannelShelf();
          return true;
        case "never":
          this.options.setShowChannelRecommendations?.(false);
          this.removeChannelShelf();
          return true;
        default:
          return false;
      }
    }
    handleChannelShelfSubscriptionAction(action, button) {
      switch (action) {
        case "subscribe-one":
          this.subscribeToChannelHandle(button.dataset.handle);
          return;
        case "subscribe-visible":
          void this.subscribeToChannels(this.currentRenderedChannels());
          return;
        case "subscribe-all":
          void this.subscribeToChannels(allYouTubeChannelRecommendations());
          return;
      }
    }
    subscribeToChannelHandle(handle) {
      const channel = allYouTubeChannelRecommendations().find((candidate) => candidate.handle === handle);
      if (channel) void this.subscribeToChannels([channel]);
    }
    currentRenderedChannels() {
      if (!this.channelShelfExpanded) return this.compactChannelRecommendations;
      return filterYouTubeChannelRecommendations(this.channelShelfFilter);
    }
    async hydrateChannelPreviews(channels) {
      const config = readYouTubeClientConfig();
      if (!config) return;
      for (const channel of channels) {
        if (this.channelPreviewCache.has(channel.handle) || this.pendingChannelPreviews.has(channel.handle)) continue;
        this.pendingChannelPreviews.add(channel.handle);
        void fetchYouTubeChannelPreview(channel, config, this.channelIdCache).then((preview) => {
          this.channelPreviewCache.set(channel.handle, preview);
          if (preview?.channelId) this.channelIdCache.set(channel.handle, preview.channelId);
          this.updateRenderedChannelPreview(channel);
        }).catch(() => {
          this.channelPreviewCache.set(channel.handle, null);
        }).finally(() => {
          this.pendingChannelPreviews.delete(channel.handle);
        });
      }
    }
    updateRenderedChannelPreview(channel) {
      if (!this.channelShelf) return;
      const row = Array.from(this.channelShelf.querySelectorAll("[data-yomu-channel-handle]")).find((candidate) => candidate.dataset.yomuChannelHandle === channel.handle);
      if (!row) return;
      const replacement = this.renderChannelRow(channel);
      row.replaceWith(replacement);
    }
    async subscribeToChannels(channels) {
      if (this.subscriptionBusy || !channels.length) return;
      const elements = this.channelShelfElements(this.ensureChannelShelf());
      const config = readYouTubeClientConfig();
      if (!config) {
        elements.status.textContent = "YouTube session data is not available on this page yet.";
        return;
      }
      this.subscriptionBusy = true;
      this.setChannelShelfBusy(true);
      let subscribed = 0;
      let failed = 0;
      for (let index = 0; index < channels.length; index += 1) {
        const channel = channels[index];
        elements.status.textContent = `Subscribing ${index + 1}/${channels.length}: ${channel.name}`;
        try {
          const channelId = await resolveYouTubeChannelId(channel, config, this.channelIdCache);
          if (!channelId) throw new Error("Missing YouTube channel id.");
          await subscribeYouTubeChannel(channelId, config);
          subscribed += 1;
        } catch {
          failed += 1;
        }
      }
      this.subscriptionBusy = false;
      this.setChannelShelfBusy(false);
      elements.status.textContent = failed ? `Subscribed to ${subscribed}; ${failed} could not be completed by YouTube.` : `Subscribed to ${subscribed} channel${subscribed === 1 ? "" : "s"}.`;
    }
    setChannelShelfBusy(busy) {
      this.channelShelf?.querySelectorAll('[data-yomu-youtube-channel-action^="subscribe"]').forEach((button) => {
        button.disabled = busy;
      });
      this.channelShelf?.setAttribute("aria-busy", String(busy));
    }
    removeChannelShelf() {
      this.channelShelf?.remove();
      this.channelShelf = void 0;
    }
    currentChannelShelfScope() {
      const routeKey = this.currentRouteKey();
      if (this.channelShelfRouteKey !== routeKey) {
        this.channelShelfRouteKey = routeKey;
        this.dismissedChannelShelfScope = "";
        this.removeChannelShelf();
      }
      return routeKey;
    }
    clear() {
      window.clearTimeout(this.timer);
      window.clearTimeout(this.metadataRescanTimer);
      this.timer = void 0;
      this.metadataRescanTimer = void 0;
      this.revealed = false;
      this.clearFilteredCards();
      this.removeNotice();
      this.removeChannelShelf();
      this.dismissedNoticeScope = "";
      this.dismissedChannelShelfScope = "";
      this.noticeRouteKey = "";
      this.channelShelfRouteKey = "";
      this.channelShelfExpanded = false;
      this.channelShelfFilter = "all";
      this.subscriptionBusy = false;
      this.lastBackfillAt = Number.NEGATIVE_INFINITY;
      this.lastScrollAt = Number.NEGATIVE_INFINITY;
      this.setFilterActiveClass(false);
    }
    resolveTitleForFiltering(info) {
      if (!info.videoId) return info.title;
      const cached = this.cachedOEmbedTitle(info.videoId);
      if (cached !== void 0) return cached || info.title;
      this.fetchOriginalTitle(info.videoId);
      return info.title;
    }
    fetchOriginalTitle(videoId) {
      if (this.pendingOembedTitles.has(videoId)) return;
      this.pendingOembedTitles.add(videoId);
      void fetchYouTubeOEmbedTitle(videoId).then((title) => {
        this.rememberOEmbedTitle(videoId, title);
      }).catch(() => {
        this.rememberOEmbedTitle(videoId, null);
      }).finally(() => {
        this.pendingOembedTitles.delete(videoId);
        if (!this.destroyed && this.options.getSettings().youtubeImmersionEnabled) this.scheduleMetadataRescan();
      });
    }
    cachedOEmbedTitle(videoId) {
      if (this.oembedTitleCache.has(videoId)) return this.oembedTitleCache.get(videoId) ?? null;
      const stored = readStoredOEmbedTitle(videoId);
      if (stored === void 0) return void 0;
      this.rememberOEmbedTitle(videoId, stored, { persist: false });
      return stored;
    }
    rememberOEmbedTitle(videoId, title, options = {}) {
      if (this.oembedTitleCache.size >= OEMBED_TITLE_CACHE_LIMIT) {
        const oldest = this.oembedTitleCache.keys().next().value;
        if (oldest) this.oembedTitleCache.delete(oldest);
      }
      this.oembedTitleCache.set(videoId, title);
      if (options.persist !== false) writeStoredOEmbedTitle(videoId, title);
    }
    scheduleMetadataRescan() {
      if (this.metadataRescanTimer !== void 0) return;
      this.metadataRescanTimer = window.setTimeout(() => {
        this.metadataRescanTimer = void 0;
        this.schedule(0);
      }, OEMBED_BATCH_RESCAN_DELAY_MS);
    }
    startNoticeTimer(noticeScope) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = window.setTimeout(() => {
        if (this.currentNoticeScope() !== noticeScope) return;
        this.dismissedNoticeScope = noticeScope;
        this.removeNotice();
      }, YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS);
    }
    removeNotice() {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = void 0;
      this.bar?.remove();
      this.bar = void 0;
    }
    clearFilteredCards() {
      document.querySelectorAll(YOUTUBE_FILTERED_SELECTOR).forEach((card) => this.showCard(card));
    }
    currentNoticeScope() {
      const routeKey = this.currentRouteKey();
      if (this.noticeRouteKey !== routeKey) {
        this.noticeRouteKey = routeKey;
        this.dismissedNoticeScope = "";
        this.removeNotice();
      }
      return `${routeKey}:${this.revealed ? "revealed" : "hidden"}`;
    }
    currentRouteKey() {
      return `${location.pathname}${location.search}`;
    }
    maybeBackfillFeed(filteredCount, shownCount, visibleUniqueCount) {
      const now = performance.now();
      if (!shouldBackfillYouTubeFeed({
        filteredCount,
        lastBackfillAt: this.lastBackfillAt,
        now,
        revealed: this.revealed,
        shownCount,
        visibleUniqueCount
      })) return;
      const continuation = findYouTubeContinuationItem();
      if (!continuation) return;
      if (nudgeYouTubeContinuationItem(continuation)) this.lastBackfillAt = now;
    }
    setFilterActiveClass(active) {
      document.documentElement.classList.toggle("jpdb-youtube-filter-active", active);
    }
  }
  function formatYoutubeText(template, values) {
    return template.replace(/\{(\w+)\}/g, (_match, key2) => values[key2] ?? "");
  }
  function noticeButton(action) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    return button;
  }
  function channelShelfButton(action) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.yomuYoutubeChannelAction = action;
    return button;
  }
  function channelRowMetaText(channel, preview) {
    const subscriberText = preview?.subscriberText ?? "";
    return subscriberText ? `${channel.handle} · ${subscriberText}` : channel.handle;
  }
  function channelRowTags(channel) {
    const tags = [channel.level, ...channel.topics.slice(0, 2)];
    if (channel.captions.length) tags.push("captions");
    return tags;
  }
  function findChannelShelfAnchor() {
    return document.querySelector(
      "ytd-rich-grid-renderer #contents, ytd-two-column-browse-results-renderer #contents, ytd-section-list-renderer, ytm-rich-grid-renderer, ytm-browse, ytm-search, main"
    );
  }
  function isYouTubeHomePage() {
    return location.pathname === "/" || location.pathname === "/feed/explore";
  }
  function shouldShowChannelRecommendationsForRoute() {
    if (isYouTubeWatchPage()) return false;
    if (isYouTubeShortsWatchPage()) return false;
    return isYouTubeHomePage() || location.pathname === "/results" || location.pathname.startsWith("/feed/subscriptions");
  }
  function readYouTubeClientConfig() {
    const ytcfg = readYouTubeConfigSource();
    const apiKey = readYouTubeConfigString(ytcfg, "INNERTUBE_API_KEY");
    if (!apiKey) return null;
    const context = readYouTubeInnerTubeContext(ytcfg);
    const client = recordValue(context.client) ?? {};
    return {
      apiKey,
      context,
      clientName: readYouTubeClientString(ytcfg, client, "INNERTUBE_CLIENT_NAME", "clientName", "1"),
      clientVersion: readYouTubeClientString(ytcfg, client, "INNERTUBE_CLIENT_VERSION", "clientVersion"),
      visitorId: readYouTubeClientString(ytcfg, client, "VISITOR_DATA", "visitorData")
    };
  }
  function readYouTubeConfigSource() {
    return window.ytcfg ?? readYouTubeConfigSourceFromScripts();
  }
  function readYouTubeConfigString(ytcfg, key2) {
    return stringValue(readYouTubeConfigValue(ytcfg, key2));
  }
  function readYouTubeConfigValue(ytcfg, key2) {
    try {
      if (typeof ytcfg?.get === "function") return ytcfg.get(key2);
    } catch {
    }
    return ytcfg?.data_?.[key2];
  }
  function readYouTubeConfigSourceFromScripts() {
    const data = {};
    for (const key2 of ["INNERTUBE_API_KEY", "INNERTUBE_CLIENT_NAME", "INNERTUBE_CLIENT_VERSION", "VISITOR_DATA"]) {
      const value = readYouTubeConfigScriptValue(key2);
      if (value) data[key2] = value;
    }
    const context = readYouTubeConfigScriptObject("INNERTUBE_CONTEXT");
    if (context) data.INNERTUBE_CONTEXT = context;
    return Object.keys(data).length ? { data_: data } : void 0;
  }
  function readYouTubeConfigScriptValue(key2) {
    const escapedKey = escapeRegExp(key2);
    const patterns = [
      new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u"),
      new RegExp(`${escapedKey}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u")
    ];
    for (const script of Array.from(document.scripts)) {
      const text = script.textContent ?? "";
      const raw = patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
      if (raw) return unescapeYouTubeConfigString(raw);
    }
    return "";
  }
  function readYouTubeConfigScriptObject(key2) {
    const escapedKey = escapeRegExp(key2);
    const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*(\\{.+?\\})\\s*,\\s*"`, "su");
    for (const script of Array.from(document.scripts)) {
      const text = script.textContent ?? "";
      const raw = text.match(pattern)?.[1];
      if (!raw) continue;
      try {
        return recordValue(JSON.parse(raw));
      } catch {
        return null;
      }
    }
    return null;
  }
  function unescapeYouTubeConfigString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  }
  function readYouTubeInnerTubeContext(ytcfg) {
    return recordValue(readYouTubeConfigValue(ytcfg, "INNERTUBE_CONTEXT")) ?? defaultYouTubeInnerTubeContext(ytcfg);
  }
  function defaultYouTubeInnerTubeContext(ytcfg) {
    return {
      client: {
        clientName: firstStringValue(readYouTubeConfigValue(ytcfg, "INNERTUBE_CLIENT_NAME"), "WEB"),
        clientVersion: firstStringValue(readYouTubeConfigValue(ytcfg, "INNERTUBE_CLIENT_VERSION"), "2.20240101.00.00")
      }
    };
  }
  function readYouTubeClientString(ytcfg, client, configKey, clientKey, fallback = "") {
    return firstStringValue(readYouTubeConfigValue(ytcfg, configKey), client[clientKey], fallback);
  }
  async function fetchYouTubeChannelPreview(channel, config, channelIdCache) {
    const channelId = await resolveYouTubeChannelId(channel, config, channelIdCache);
    if (!channelId) return null;
    const data = await postYouTubeInnerTube("browse", config, { browseId: channelId });
    return youTubeChannelPreviewFromBrowseData(channel, channelId, data);
  }
  function youTubeChannelPreviewFromBrowseData(channel, channelId, data) {
    const metadata = youTubeChannelMetadata(data);
    return {
      channelId,
      title: youTubeChannelPreviewTitle(channel, metadata, data),
      avatarUrl: youTubeChannelPreviewAvatarUrl(metadata, data),
      subscriberText: findNestedString(data, "subscriberCountText"),
      description: youTubeChannelPreviewDescription(metadata, data)
    };
  }
  function youTubeChannelMetadata(data) {
    return recordValue(recordValue(data.metadata)?.channelMetadataRenderer) ?? {};
  }
  function youTubeChannelPreviewTitle(channel, metadata, data) {
    return firstStringValue(metadata.title, findNestedString(data, "title"), channel.name);
  }
  function youTubeChannelPreviewAvatarUrl(metadata, data) {
    const avatarUrl = thumbnailUrl(metadata.avatar);
    return avatarUrl || findNestedThumbnailUrl(data);
  }
  function youTubeChannelPreviewDescription(metadata, data) {
    return firstStringValue(metadata.description, findNestedString(data, "description"));
  }
  async function resolveYouTubeChannelId(channel, config, channelIdCache) {
    if (channelIdCache.has(channel.handle)) return channelIdCache.get(channel.handle) ?? null;
    const data = await postYouTubeInnerTube("navigation/resolve_url", config, {
      url: youtubeChannelUrl(channel)
    });
    const channelId = findNestedString(data, "browseId", (value) => /^UC[\w-]{20,}$/u.test(value));
    channelIdCache.set(channel.handle, channelId);
    return channelId;
  }
  async function subscribeYouTubeChannel(channelId, config) {
    await postYouTubeInnerTube("subscription/subscribe", config, {
      channelIds: [channelId]
    });
  }
  async function postYouTubeInnerTube(path, config, body) {
    const response = await fetch(`${location.origin}/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
      method: "POST",
      credentials: "same-origin",
      headers: youtubeInnerTubeHeaders(config),
      body: JSON.stringify({ context: config.context, ...body })
    });
    if (!response.ok) throw new Error(`YouTube request failed: ${response.status}`);
    const json = await response.json();
    return recordValue(json) ?? {};
  }
  function youtubeInnerTubeHeaders(config) {
    const headers = {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": config.clientName,
      "X-YouTube-Client-Version": config.clientVersion
    };
    if (config.visitorId) headers["X-Goog-Visitor-Id"] = config.visitorId;
    return headers;
  }
  function findNestedString(value, key2, predicate = Boolean) {
    return findNestedYouTubeValue(value, (candidate) => nestedYouTubeText(candidate, key2, predicate));
  }
  function findNestedThumbnailUrl(value) {
    return findNestedYouTubeValue(value, nestedYouTubeThumbnailUrl);
  }
  function findNestedYouTubeValue(value, readValue) {
    if (!isNestedYouTubeValue(value)) return "";
    const direct = readValue(value);
    if (direct) return direct;
    for (const child of nestedYouTubeChildren(value)) {
      const found = findNestedYouTubeValue(child, readValue);
      if (found) return found;
    }
    return "";
  }
  function nestedYouTubeText(value, key2, predicate) {
    const record = recordValue(value);
    if (!record) return "";
    const text = textFromYouTubeValue(record[key2]);
    return text && predicate(text) ? text : "";
  }
  function nestedYouTubeThumbnailUrl(value) {
    const record = recordValue(value);
    if (!record) return "";
    return thumbnailUrl(record.thumbnail) || thumbnailUrl(record.avatar);
  }
  function nestedYouTubeChildren(value) {
    return Array.isArray(value) ? value : Object.values(value);
  }
  function isNestedYouTubeValue(value) {
    return Boolean(value) && typeof value === "object";
  }
  function thumbnailUrl(value) {
    const thumbnails = recordValue(value)?.thumbnails;
    if (!Array.isArray(thumbnails)) return "";
    const candidates = thumbnails.map((thumbnail) => recordValue(thumbnail)).filter(Boolean).sort((a, b) => Number(b?.width ?? 0) - Number(a?.width ?? 0));
    return stringValue(candidates[0]?.url);
  }
  function textFromYouTubeValue(value) {
    if (typeof value === "string") return value.trim();
    const record = recordValue(value);
    if (!record) return "";
    const simpleText = stringValue(record.simpleText);
    if (simpleText) return simpleText;
    const runs = record.runs;
    if (Array.isArray(runs)) {
      return runs.map((run) => stringValue(recordValue(run)?.text)).join("").trim();
    }
    return "";
  }
  function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function firstStringValue(...values) {
    for (const value of values) {
      const text = stringValue(value);
      if (text) return text;
    }
    return "";
  }
  function recordValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function randomStarterYouTubeChannelRecommendations(limit) {
    const channels = starterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
    return shuffleYouTubeChannels(channels).slice(0, limit);
  }
  function shuffleYouTubeChannels(channels) {
    const shuffled = [...channels];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }
  function hiddenYouTubeFilterCandidate(card) {
    return {
      card,
      title: "",
      videoId: "",
      filterText: "",
      alwaysHidden: true
    };
  }
  function visibleYouTubeFilterCandidate(info, filterText) {
    return {
      card: info.card,
      title: youTubeFilterCandidateTitle(info, filterText),
      videoId: info.videoId,
      filterText,
      alwaysHidden: false
    };
  }
  function youTubeFilterCandidateTitle(info, filterText) {
    return info.title || filterText || info.videoId || "";
  }
  function readYouTubeTitleText(title) {
    const visibleTitle = [
      title.getAttribute("title"),
      title.textContent
    ].find((value) => value?.trim());
    if (visibleTitle) return visibleTitle.trim();
    return cleanYouTubeAriaTitle(title.getAttribute("aria-label") ?? "");
  }
  function cleanYouTubeAriaTitle(title) {
    return title.split(/\s+by\s+/i)[0].split(/\s+視聴回数\s*/)[0].split(/\s+再生回数\s*/)[0].split(/\s+回視聴\s*/)[0].split(/\s+views?\s*/i)[0].split(/\s+•\s*/)[0].split(/\s+·\s*/)[0].split(/\s*,\s*/)[0].trim();
  }
  function collectYouTubeFilterItems(root = document) {
    const items = new Set(collectYouTubeVideoCards(root));
    root.querySelectorAll(`${VIDEO_CARD_SELECTOR},${NON_VIDEO_CONTAINER_SELECTOR}`).forEach((element) => {
      const normalized = normalizeYouTubeFilterItem(element);
      if (normalized) items.add(normalized);
    });
    return [...items].filter((item) => item.isConnected);
  }
  function collectFilterableVideoShelves(root = document) {
    return Array.from(root.querySelectorAll(FILTERABLE_VIDEO_SHELF_SELECTOR)).filter(isFilterableVideoShelf);
  }
  function normalizeYouTubeFilterItem(element) {
    if (shouldIgnoreYouTubeCardElement(element)) return null;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return normalizeYouTubeNonVideoContainer(element);
    if (isYouTubePlaylistLikeCard(element)) {
      const target = youtubeCardHideTarget(element);
      if (target) return target;
      if (element.matches("ytd-playlist-renderer,ytd-compact-playlist-renderer,ytm-playlist-renderer,ytm-compact-playlist-renderer,ytd-grid-playlist-renderer,yt-lockup-view-model")) {
        return element;
      }
      return null;
    }
    return normalizeYouTubeVideoCard(element);
  }
  function isYouTubeAlwaysHiddenItem(card) {
    return card.matches(NON_VIDEO_CONTAINER_SELECTOR) || isYouTubePlaylistLikeCard(card);
  }
  function normalizeYouTubeNonVideoContainer(element) {
    if (isFilterableVideoShelf(element)) return null;
    return element;
  }
  function isFilterableVideoShelf(element) {
    return element.matches(FILTERABLE_VIDEO_SHELF_SELECTOR) && collectYouTubeVideoCards(element).length > 0;
  }
  function normalizeYouTubeVideoCard(element) {
    if (!isNormalizableYouTubeVideoCard(element)) return null;
    return youtubeCardHideTarget(element);
  }
  function isNormalizableYouTubeVideoCard(element) {
    if (shouldIgnoreYouTubeCardElement(element)) return false;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return false;
    if (!hasYouTubeVideoLink(element)) return false;
    if (isYouTubePlaylistLikeCard(element)) return false;
    return !isInsideExcludedYouTubeContainer(element);
  }
  function shouldIgnoreYouTubeCardElement(element) {
    if (!element.isConnected) return true;
    if (element.closest(YOUTUBE_READER_ROOT_SELECTOR)) return true;
    const ignoredShellSelector = [
      "ytd-watch-metadata",
      "ytm-watch",
      "#movie_player",
      ".html5-video-player",
      "ytd-comments",
      "#comments",
      "ytd-masthead",
      "#masthead",
      "ytd-guide-renderer",
      "#guide",
      "ytd-playlist-header-renderer",
      "ytm-playlist-header-renderer",
      "ytd-c4-tabbed-header-renderer",
      "ytd-channel-sub-menu-renderer"
    ].join(",");
    if (closestCrossingShadow(element, ignoredShellSelector)) return true;
    return false;
  }
  function closestCrossingShadow(element, selector) {
    let current = element;
    while (current) {
      if (current instanceof HTMLElement && current.matches(selector)) {
        return current;
      }
      if (current.parentNode) {
        current = current.parentNode;
      } else if (current instanceof ShadowRoot) {
        current = current.host;
      } else {
        current = null;
      }
    }
    return null;
  }
  function hasYouTubeVideoLink(element) {
    return Boolean(element.querySelector(VIDEO_LINK_SELECTORS));
  }
  function isInsideExcludedYouTubeContainer(element) {
    const excluded = element.closest(NON_VIDEO_CONTAINER_SELECTOR);
    if (!excluded || excluded.matches(VIDEO_CARD_SELECTOR)) return false;
    const cardInsideExcluded = element.closest(VIDEO_CARD_SELECTOR);
    return !cardInsideExcluded || cardInsideExcluded === excluded;
  }
  function youtubeCardHideTarget(element) {
    const outer = element.closest(VIDEO_CARD_HIDE_TARGET_SELECTOR);
    if (outer?.querySelector(VIDEO_LINK_SELECTORS)) return outer;
    return element.closest(VIDEO_CARD_SELECTOR);
  }
  function measuredYouTubeCardHeight(card) {
    const rect = card.getBoundingClientRect();
    return Math.max(rect.height, card.offsetHeight, card.scrollHeight, 0);
  }
  function readYouTubeVideoId(card) {
    const link = Array.from(card.querySelectorAll(VIDEO_LINK_SELECTORS)).find((candidate) => extractYouTubeVideoId(candidate.getAttribute("href")));
    return link ? extractYouTubeVideoId(link.getAttribute("href")) : "";
  }
  function extractYouTubeVideoId(href) {
    if (!href) return "";
    try {
      const url = new URL(href, "https://www.youtube.com");
      if (url.pathname === "/watch") return url.searchParams.get("v") ?? "";
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      return shortsMatch?.[1] ?? "";
    } catch {
      return "";
    }
  }
  function isYouTubeShortsWatchPage() {
    return location.pathname.startsWith("/shorts/");
  }
  function isCurrentYouTubeShortsWatchCard(card) {
    if (!isYouTubeShortsWatchPage()) return false;
    const item = card.closest(SHORTS_WATCH_ITEM_SELECTOR) ?? card;
    if (isActiveYouTubeShortsReel(item)) return true;
    const currentVideoId = currentYouTubeShortsVideoId();
    return Boolean(currentVideoId) && readYouTubeVideoId(item) === currentVideoId;
  }
  function isActiveYouTubeShortsReel(item) {
    if (item.hasAttribute("is-active") || item.getAttribute("aria-hidden") === "false") return true;
    const rect = item.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const viewportCenter = window.innerHeight / 2;
    return rect.top <= viewportCenter && rect.bottom >= viewportCenter;
  }
  function currentYouTubeShortsVideoId() {
    return location.pathname.match(/^\/shorts\/([^/?#]+)/)?.[1] ?? "";
  }
  function isNearPageBottom() {
    const page = document.scrollingElement ?? document.documentElement;
    return window.scrollY + window.innerHeight >= page.scrollHeight - Math.max(900, window.innerHeight);
  }
  function shouldBackfillYouTubeFeed(options) {
    if (options.revealed) return false;
    if (!options.filteredCount) return false;
    if (isYouTubeWatchPage()) return false;
    if (isYouTubeShortsWatchPage()) return false;
    if (Math.max(options.shownCount, options.visibleUniqueCount) >= YOUTUBE_VISIBLE_BACKFILL_TARGET) return false;
    return options.now - options.lastBackfillAt >= YOUTUBE_BACKFILL_THROTTLE_MS;
  }
  function findYouTubeContinuationItem() {
    const continuation = document.querySelector("ytd-continuation-item-renderer, ytm-continuation-item-renderer, tp-yt-paper-spinner-lite");
    return continuation?.isConnected ? continuation : null;
  }
  function nudgeYouTubeContinuationItem(continuation) {
    if (!isNearPageBottom()) return false;
    continuation.scrollIntoView({ block: "end" });
    return true;
  }
  function isYouTubeWatchPage() {
    return location.pathname === "/watch";
  }
  function shouldShowFilterNoticeForRoute() {
    return !isYouTubeWatchPage() && !isYouTubeShortsWatchPage();
  }
  function unwrapYouTubeWatchTitleReaderWords() {
    if (!isYouTubeWatchPage()) return;
    document.querySelectorAll(YOUTUBE_WATCH_TITLE_SELECTOR).forEach((title) => {
      unwrapReaderWords(title);
    });
  }
  function isYouTubePlaylistLikeCard(card) {
    if (card.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    const links = Array.from(card.querySelectorAll("a[href]"));
    const playlistLinks = links.filter((link) => {
      const href = link.getAttribute("href") ?? "";
      return href.includes("/playlist?") || href.includes("/watch_videos?") || /[?&]start_radio=/.test(href) || !extractYouTubeVideoId(href) && /[?&]list=/.test(href);
    });
    if (playlistLinks.length && playlistLinks.length >= links.filter((link) => extractYouTubeVideoId(link.getAttribute("href"))).length) {
      return true;
    }
    return Array.from(card.querySelectorAll(PLAYLIST_BADGE_SELECTOR)).some((element) => {
      const text = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`;
      return /\bplaylist\b|\bmix\b|\bradio\b|再生リスト|ミックス|ラジオ/i.test(text);
    });
  }
  async function fetchYouTubeOEmbedTitle(videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
  }
  function readStoredOEmbedTitle(videoId) {
    try {
      const raw = sessionStorage.getItem(storedOEmbedTitleKey(videoId));
      if (!raw) return void 0;
      const parsed = JSON.parse(raw);
      if (!Number.isFinite(parsed.cachedAt) || Date.now() - Number(parsed.cachedAt) > OEMBED_SESSION_CACHE_TTL_MS) {
        sessionStorage.removeItem(storedOEmbedTitleKey(videoId));
        return void 0;
      }
      return typeof parsed.title === "string" ? parsed.title : null;
    } catch {
      return void 0;
    }
  }
  function writeStoredOEmbedTitle(videoId, title) {
    try {
      const stored = { title, cachedAt: Date.now() };
      sessionStorage.setItem(storedOEmbedTitleKey(videoId), JSON.stringify(stored));
    } catch {
    }
  }
  function storedOEmbedTitleKey(videoId) {
    return `${OEMBED_SESSION_CACHE_PREFIX}${videoId}`;
  }
  function mutationInsideReaderRoot(mutation) {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every((node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean(element?.closest?.(YOUTUBE_READER_ROOT_SELECTOR));
    });
  }
  function mutationMayAffectYouTubeCards(mutation) {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return nodes.some(nodeMayAffectYouTubeCards);
  }
  function nodeMayAffectYouTubeCards(node) {
    const element = elementForYouTubeCardMutation(node);
    if (!element) return false;
    if (isYouTubeCardOrFeedElement(element)) return true;
    if (element.querySelector(VIDEO_CARD_SELECTOR)) return true;
    return Boolean(element.querySelector(VIDEO_ANCHOR_SELECTOR));
  }
  function elementForYouTubeCardMutation(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || element.closest(YOUTUBE_READER_ROOT_SELECTOR)) return null;
    return element;
  }
  function isYouTubeCardOrFeedElement(element) {
    if (element.matches(VIDEO_CARD_SELECTOR)) return true;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (element.matches(YOUTUBE_FEED_CONTAINER_SELECTOR)) return true;
    return Boolean(element.closest(VIDEO_CARD_SELECTOR));
  }
  function registerYomuCompanion(key2, value) {
    const target = globalThis;
    target.__yomuCompanions = {
      ...target.__yomuCompanions ?? {},
      [key2]: value
    };
  }
  registerYomuCompanion("video", {
    SubtitlePlayerController,
    YoutubeImmersionFilter
  });
  registerYomuCompanion("ocr", {
    ImageOcrController
  });
  const TRANSLATION_BATCH_SIZE = 25;
  const TRANSLATION_TIMEOUT_MS = 8e3;
  const TRANSLATION_SEPARATOR = "\n";
  const log = Logger.scope("SubtitleTranslate");
  async function translateSubtitleCues(cues, sourceLanguage, targetLanguage) {
    if (!cues.length) return [];
    const texts = cues.map((cue) => cue.text.trim());
    const batches = batchTexts(texts, TRANSLATION_BATCH_SIZE);
    const translated = [];
    for (const batch of batches) {
      const results = await translateBatch(batch, sourceLanguage, targetLanguage);
      translated.push(...results);
    }
    return cues.map((cue, index) => ({
      ...cue,
      text: translated[index] || cue.text
    }));
  }
  function batchTexts(texts, size) {
    const batches = [];
    for (let start = 0; start < texts.length; start += size) {
      batches.push(texts.slice(start, start + size));
    }
    return batches;
  }
  async function translateBatch(texts, sourceLanguage, targetLanguage) {
    const joined = texts.join(TRANSLATION_SEPARATOR);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&dj=1&q=${encodeURIComponent(joined)}`;
    const done = log.time("Translate subtitle batch", { count: texts.length });
    try {
      const json = await requestJson$1(url, {
        timeoutMs: TRANSLATION_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
        allowConfiguredProxy: false,
        allowPublicProxies: false,
        preferFetch: true,
        failureLabel: "Subtitle translation request",
        timeoutLabel: "Subtitle translation timed out."
      });
      const result = (json.sentences ?? []).map((item) => item.trans ?? "").join("");
      const lines = result.split(TRANSLATION_SEPARATOR);
      log.info("Subtitle batch translated", { count: texts.length, resultCount: lines.length });
      return padTranslationResults(lines, texts);
    } catch (error) {
      log.warn("Subtitle batch translation failed", { count: texts.length, error });
      return texts;
    } finally {
      done();
    }
  }
  function padTranslationResults(translated, originals) {
    const result = translated.map((text) => text.trim());
    while (result.length < originals.length) result.push(originals[result.length]);
    return result;
  }
  const subtitleTranslate = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    translateSubtitleCues
  }, Symbol.toStringTag, { value: "Module" }));
})();
