(function() {
  "use strict";
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
    if (writeYomuCompanionsTarget(globalThis, value)) return;
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
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const SETTINGS_TITLE = `${APP_NAME} Settings`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_BASE_URL = `${GITHUB_PAGES_ORIGIN}/${APP_REPOSITORY_NAME}/`;
  const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}`;
  const ANKI_CONNECT_ADDON_URL = "https://ankiweb.net/shared/info/2055492159";
  const DISCORD_INVITE_URL = "https://discord.gg/WvDt57uk5";
  const DONATE_URL = "https://paypal.me/HenryRussell163";
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
  const VIDEO_PLAYER_PAGE_URL = `${DOCS_BASE_URL}video-player/index.html`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, JPDB mining, dictionaries, OCR, subtitles, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const NADESHIKO_URL = "https://nadeshiko.co/";
  const NADESHIKO_DEVELOPER_URL = `${NADESHIKO_URL}user/developer`;
  const SETTINGS_CHANGE_EVENT = "yomu-settings-change";
  const JPDB_DEFINITION_SOURCE_ID = "__jpdb__";
  const JITEN_DEFINITION_SOURCE_ID = "__jiten__";
  const ANKI_SOURCE_ID = "__anki__";
  const STUDY_TRANSLATION_SOURCE_ID = "__study_translation__";
  const STUDY_GRAMMAR_SOURCE_ID = "__study_grammar__";
  const IMMERSION_KIT_SOURCE_ID = "__immersion_kit__";
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
  function canUseMobileAnkiHandoff(settings) {
    return yomuAnkiCompanion()?.canUseMobileAnkiHandoff(settings) ?? false;
  }
  async function diagnoseAnkiConnectFailure(url) {
    if (typeof fetch !== "function") return "unreachable";
    try {
      await fetch(url, { method: "GET", mode: "no-cors" });
      return "cors-blocked";
    } catch {
      return "unreachable";
    }
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  function createAudioPreviewCard() {
    return {
      vid: 1456360,
      sid: 0,
      rid: 0,
      spelling: "読む",
      reading: "よむ",
      frequencyRank: null,
      partOfSpeech: [],
      meanings: [],
      cardState: [],
      pitchAccent: [],
      wordWithReading: null,
      source: "jpdb"
    };
  }
  const CORE_COLOR_TOKENS = {
    black: "#000000",
    white: "#ffffff"
  };
  const BRAND_COLOR_TOKENS = {
    accent: "#5ea780",
    consoleAccent: "#247a58"
  };
  const READER_THEME_COLOR_TOKENS = {
    dark: {
      bg: "#181b20"
    }
  };
  const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white,
    outline: CORE_COLOR_TOKENS.black,
    background: READER_THEME_COLOR_TOKENS.dark.bg
  };
  const DEFAULT_WORD_COLOR_TOKENS = {
    new: "#58a6ff",
    learning: "#ffd166",
    known: "#7bd88f",
    due: "#5fb3b3",
    failed: "#ff6b6b",
    ignored: "#b8a7ff"
  };
  const DEFAULT_PITCH_COLOR_TOKENS = {
    heiban: "#359eff",
    atamadaka: "#fe4b74",
    nakadaka: "#fba840",
    odaka: "#57ccb7",
    kifuku: "#9050f6",
    unknown: "#94a3b8"
  };
  const LOGGER_COLOR_TOKENS = {
    debug: "#6b7280",
    warn: "#a15c00",
    error: "#b91c1c"
  };
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
    const surface = readerWordChildSurfaceText(element);
    if (surface || !isReaderWordElement(element)) return surface;
    return element.dataset.surface ?? "";
  }
  function readerWordChildSurfaceText(element) {
    let text = "";
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? "";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const child = node;
      if (isSurfaceIgnoredElement(child)) return;
      text += readerWordChildSurfaceText(child);
    });
    return text;
  }
  function isReaderWordElement(element) {
    return element instanceof HTMLElement && element.classList.contains("jpdb-reader-word");
  }
  function isSurfaceIgnoredElement(element) {
    return READABLE_IGNORED_TAGS.has(element.tagName) || element.matches('[data-jpdb-reader-surface-ignore="true"],.jpdb-reader-furi,.jpdb-ocr-furi');
  }
  const MISSING = { missing: true };
  const FACTORY_RESET_SIGNAL_KEY = "yomu:factory-reset-signal";
  const MANAGED_STORAGE_KEY_PREFIXES = [
    "yomu-",
    "yomu:",
    "yomu.",
    "jpdb-reader-",
    "jpdb-popup-reader-"
  ];
  const KNOWN_MANAGED_STORAGE_KEYS = [
    "jpdb-popup-reader-settings",
    "jpdb-reader-settings",
    "yomu-reader-settings",
    "yomu-settings",
    "jpdb-reader-newtab-card-cache",
    "jpdb-reader-newtab-grade-queue",
    "jpdb-reader-newtab-current-word",
    "jpdb-reader-newtab-ui",
    "jpdb-reader-newtab-jpdb-stats-history",
    "jpdb-reader-newtab-disabled-anki-decks",
    "jpdb-reader-source-open-state",
    "jpdb-reader-settings-drawer-height-ratio",
    "jpdb-reader-sheet-height-ratio",
    "jpdb-reader-transcript-panel-size",
    "yomu:anki-status-index:v1",
    "yomu:anki-status-index-rebuild:v1",
    "yomu.grammarPreferences.v1",
    "yomu:enable-logs",
    "yomu:prefer-japanese-site-language",
    FACTORY_RESET_SIGNAL_KEY
  ];
  const EXCLUDED_BACKUP_STORAGE_KEYS = /* @__PURE__ */ new Set([
    FACTORY_RESET_SIGNAL_KEY
  ]);
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
  async function gmStorageDelete(key) {
    const deleteValue = asyncGmDeleteValue();
    if (deleteValue) {
      try {
        await deleteValue(key);
      } catch (error) {
        debugStorageError("GM storage delete failed", key, error);
      }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
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
  async function exportStoredValues(prefixes) {
    const keys = (await storageKeys(prefixes)).filter(isBackupStorageKey);
    const entries = await Promise.all(keys.map(async (key) => [key, await gmStorageGet(key, void 0)]));
    return Object.fromEntries(entries.filter(([, value]) => value !== void 0));
  }
  async function exportManagedStoredValues() {
    return await exportStoredValues(MANAGED_STORAGE_KEY_PREFIXES);
  }
  async function importStoredValues(values) {
    let count = 0;
    for (const [key, value] of managedStoredValueEntries(values)) {
      await gmStorageSet(key, value);
      localStorageSet(key, value);
      count++;
    }
    return count;
  }
  function managedStoredValueEntries(values) {
    return isStorageImportRecord(values) ? Object.entries(values).filter(([key]) => isBackupStorageKey(key)) : [];
  }
  function isStorageImportRecord(values) {
    return Boolean(values && typeof values === "object" && !Array.isArray(values));
  }
  async function storageKeys(prefixes) {
    const keys = /* @__PURE__ */ new Set();
    await addPrefixedGmStorageKeys(keys, prefixes);
    addLocalStorageKeys(keys, prefixes);
    await addKnownManagedStorageKeys(keys, prefixes);
    return [...keys].sort();
  }
  async function addPrefixedGmStorageKeys(keys, prefixes) {
    const listValues = asyncGmListValues();
    if (!listValues) return;
    try {
      addMatchingStorageKeys(keys, await listValues(), prefixes);
    } catch (error) {
      debugStorageError("GM storage list failed", "GM_listValues", error);
    }
  }
  function addLocalStorageKeys(keys, prefixes) {
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && storageKeyMatchesPrefix(key, prefixes)) keys.add(key);
      }
    } catch {
    }
  }
  async function addKnownManagedStorageKeys(keys, prefixes) {
    for (const key of KNOWN_MANAGED_STORAGE_KEYS) {
      if (storageKeyMatchesPrefix(key, prefixes) && await storedValueExists(key)) keys.add(key);
    }
  }
  function addMatchingStorageKeys(keys, candidates, prefixes) {
    for (const key of candidates) {
      if (storageKeyMatchesPrefix(key, prefixes)) keys.add(key);
    }
  }
  function storageKeyMatchesPrefix(key, prefixes) {
    return prefixes.some((prefix) => key.startsWith(prefix));
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
  async function storedValueExists(key) {
    const getValue = asyncGmGetValue();
    if (getValue) {
      try {
        if (await getValue(key, MISSING) !== MISSING) return true;
      } catch (error) {
        debugStorageError("GM storage existence check failed", key, error);
      }
    }
    return webStorageHasKey(localStorage, key) || webStorageHasKey(sessionStorage, key);
  }
  function webStorageHasKey(storage, key) {
    try {
      return storage.getItem(key) !== null;
    } catch {
      return false;
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
    return typeof modern === "function" ? modern.bind(globalThis.GM) : null;
  }
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    return typeof modern === "function" ? modern.bind(globalThis.GM) : null;
  }
  function asyncGmDeleteValue() {
    if (typeof GM_deleteValue === "function") return GM_deleteValue;
    const modern = globalThis.GM?.deleteValue;
    return typeof modern === "function" ? modern.bind(globalThis.GM) : null;
  }
  function asyncGmListValues() {
    const directListValues = globalThis.GM_listValues;
    if (typeof directListValues === "function") return directListValues;
    const modern = globalThis.GM?.listValues;
    return typeof modern === "function" ? modern.bind(globalThis.GM) : null;
  }
  function isManagedStorageKey(key) {
    return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  function isBackupStorageKey(key) {
    return isManagedStorageKey(key) && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
  }
  function debugStorageError(message, key, error) {
    if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key, error });
  }
  const JITEN_API_KEY_PREFIX = "ak_";
  function combinedApiCredentialLabel(settings) {
    const jpdb = Boolean(effectiveJpdbApiKey(settings));
    const jiten = Boolean(effectiveJitenApiKey(settings));
    if (jpdb && jiten) return "JPDB + Jiten";
    if (jiten) return "Jiten";
    return "JPDB";
  }
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
  function splitApiCredential(value) {
    const credential = value.trim();
    if (!credential) return { apiKey: "", jitenApiKey: "" };
    return isJitenApiCredential(credential) ? { apiKey: "", jitenApiKey: credential } : { apiKey: credential, jitenApiKey: "" };
  }
  function readApiCredentialsFromFormData(data) {
    if (data.has("apiCredentialJpdb") || data.has("apiCredentialJiten")) {
      return mergeApiCredentialValues(
        String(data.get("apiCredentialJpdb") ?? ""),
        String(data.get("apiCredentialJiten") ?? "")
      );
    }
    if (data.has("apiCredential")) return splitApiCredential(String(data.get("apiCredential") ?? ""));
    return {
      apiKey: String(data.get("apiKey") ?? "").trim(),
      jitenApiKey: String(data.get("jitenApiKey") ?? "").trim()
    };
  }
  function mergeApiCredentialValues(jpdbValue, jitenValue) {
    const values = [jpdbValue.trim(), jitenValue.trim()].filter(Boolean);
    const jitenApiKey = values.find(isJitenApiCredential) ?? "";
    const apiKey = values.find((value) => !isJitenApiCredential(value)) ?? "";
    return { apiKey, jitenApiKey };
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
  function configureLogger(options) {
    Logger.configure(options);
  }
  function loggingSettingsSummary(settings) {
    return {
      enableLogging: settings.enableLogging,
      hasApiKey: hasJpdbApiCredential(settings),
      hasJitenApiKey: hasJitenApiCredential(settings),
      localDictionariesEnabled: settings.localDictionariesEnabled,
      localDictionarySources: settings.dictionaryPreferences.length,
      ankiEnabled: settings.ankiEnabled,
      newTabEnabled: settings.newTabEnabled,
      newTabSource: settings.newTabSource,
      ocrEnabled: settings.ocrEnabled,
      subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
      youtubeImmersionEnabled: settings.youtubeImmersionEnabled
    };
  }
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
  const ANKI_FIELD_MAPPING_ROLES$2 = ["expression", "reading", "meaning", "sentence", "audio", "image"];
  function normalizeAnkiFieldMappings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out = {};
    Object.entries(value).forEach(([modelName, mapping]) => {
      const normalizedModelName = modelName.trim();
      if (!normalizedModelName || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) return;
      const normalizedMapping = {};
      for (const role of ANKI_FIELD_MAPPING_ROLES$2) {
        const fieldName = mapping[role];
        if (typeof fieldName !== "string") continue;
        const normalizedFieldName = fieldName.trim();
        if (normalizedFieldName) normalizedMapping[role] = normalizedFieldName;
      }
      if (Object.keys(normalizedMapping).length) out[normalizedModelName] = normalizedMapping;
    });
    return out;
  }
  function hasOwn(value, key) {
    return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
  }
  function objectRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function trimmedText(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function stringValue(value) {
    return typeof value === "string" ? value : "";
  }
  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function booleanValue(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  const MAX_DICTIONARY_LOOKUP_LINKS = 12;
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
  const LEGACY_DEFAULT_LOOKUP_LINK_SET = [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK
  ];
  const PREVIOUS_DEFAULT_LOOKUP_LINK_IDS = [
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
  function normalizeDictionaryLookupLinkSettings(value) {
    const links = normalizeDictionaryLookupLinks(
      value?.dictionaryLookupLinks,
      !hasOwn(value, "dictionaryLookupLinks") && Boolean(value?.apiKey?.trim())
    );
    if (isPreviousDefaultLookupLinkSet(value?.dictionaryLookupLinks)) return savedLookupLinksInDefaultOrder(links);
    return isLegacyDefaultLookupLinkSet(value?.dictionaryLookupLinks) ? legacyDefaultLookupLinksWithNewBuiltIns(links) : links;
  }
  function normalizeDictionaryPreferences(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeDictionaryPreference).filter((item) => item !== null).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }
  function normalizeDictionaryPreference(item, index) {
    const record = objectRecord(item);
    if (!record) return null;
    const name = stringValue(record.name);
    if (!name.trim()) return null;
    const alias = stringValue(record.alias);
    return {
      name,
      alias: alias.trim() ? alias : name,
      enabled: booleanValue(record.enabled, true),
      priority: finiteNumber(record.priority, index),
      allowSecondarySearches: booleanValue(record.allowSecondarySearches, false),
      type: normalizeDictionaryType(record.type, name)
    };
  }
  function defaultDictionaryLookupLinks(mode = "local") {
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({
      ...link,
      enabled: mode === "jpdb" ? link.id === "jpdb" || link.id === "jiten" || link.id === "yomu-search" : link.enabled
    }));
  }
  function legacyDefaultLookupLinksWithNewBuiltIns(links) {
    const linkById = new Map(links.map((link) => [link.id, link]));
    return defaultDictionaryLookupLinks("local").map((defaultLink) => {
      const link = linkById.get(defaultLink.id) ?? defaultLink;
      if (link.id === JPDB_LOOKUP_LINK.id || link.id === YOMU_LOOKUP_LINK.id) return { ...link, enabled: true };
      if (link.id === JISHO_LOOKUP_LINK.id) return { ...link, enabled: false };
      return link;
    });
  }
  function isLegacyDefaultLookupLinkSet(value) {
    const links = normalizeLegacyLookupLinkSet(value);
    return Boolean(links && LEGACY_DEFAULT_LOOKUP_LINK_SET.every((expected, index) => matchesLegacyLookupLink(links[index], expected)));
  }
  function isPreviousDefaultLookupLinkSet(value) {
    const links = normalizeLookupLinkSet(value, PREVIOUS_DEFAULT_LOOKUP_LINK_IDS.length);
    return Boolean(links && PREVIOUS_DEFAULT_LOOKUP_LINK_IDS.every((id, index) => links[index]?.id === id));
  }
  function normalizeLegacyLookupLinkSet(value) {
    return normalizeLookupLinkSet(value, LEGACY_DEFAULT_LOOKUP_LINK_SET.length);
  }
  function normalizeLookupLinkSet(value, length) {
    if (!Array.isArray(value) || value.length !== length) return null;
    const links = value.map(normalizeDictionaryLookupLink);
    return links.every(isDictionaryLookupLink) ? links : null;
  }
  function isDictionaryLookupLink(link) {
    return link !== null;
  }
  function matchesLegacyLookupLink(link, expected) {
    return Boolean(link && link.id === expected.id && link.label === expected.label && link.urlTemplate === expected.urlTemplate && link.enabled === expected.enabled && (expected.action === void 0 || link.action === expected.action));
  }
  function normalizeDictionaryLookupLinks(value, preferJpdb = false) {
    const builtIns = defaultDictionaryLookupLinks(defaultLookupLinkMode(preferJpdb));
    if (!Array.isArray(value)) return builtIns;
    const normalized = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (link) => {
      const id = link.id.trim();
      if (!id || seen.has(id) || normalized.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
      seen.add(id);
      normalized.push({ ...link, id });
    };
    for (const item of value) {
      const link = normalizeDictionaryLookupLink(item);
      if (link) add(link);
    }
    appendMissingBuiltInLookupLinks(builtIns, seen, add);
    return normalized.slice(0, MAX_DICTIONARY_LOOKUP_LINKS);
  }
  function defaultLookupLinkMode(preferJpdb) {
    return preferJpdb ? "jpdb" : "local";
  }
  function savedLookupLinksInDefaultOrder(links) {
    const linkById = new Map(links.map((link) => [link.id, link]));
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map((defaultLink) => linkById.get(defaultLink.id) ?? defaultLink);
  }
  function appendMissingBuiltInLookupLinks(builtIns, seen, add) {
    for (const builtIn of builtIns) {
      if (!seen.has(builtIn.id)) add(builtIn);
    }
  }
  function normalizeDictionaryLookupLink(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const id = normalizedLookupLinkId(record);
    const label = normalizedLookupLinkLabel(record, id);
    const urlTemplate = normalizedLookupLinkUrlTemplate(record);
    const action = normalizedLookupLinkAction(record, id);
    if (!isUsableDictionaryLookupLink(id, label, urlTemplate, action)) return null;
    return {
      id,
      label,
      urlTemplate,
      enabled: normalizedLookupLinkEnabled(record),
      action
    };
  }
  function normalizedLookupLinkUrlTemplate(record) {
    return typeof record.urlTemplate === "string" ? record.urlTemplate.trim() : "";
  }
  function normalizedLookupLinkEnabled(record) {
    return typeof record.enabled === "boolean" ? record.enabled : true;
  }
  function isUsableDictionaryLookupLink(id, label, urlTemplate, action) {
    if (!id || !label) return false;
    return action === "copy" || Boolean(urlTemplate && isSafeLookupUrlTemplate(urlTemplate));
  }
  function normalizedLookupLinkId(record) {
    if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
    return typeof record.label === "string" ? `custom-${stableLookupLinkId(record.label)}` : "";
  }
  function normalizedLookupLinkLabel(record, id) {
    return typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 24) : id;
  }
  function normalizedLookupLinkAction(record, id) {
    return record.action === "copy" || id === "copy" ? "copy" : "open";
  }
  function stableLookupLinkId(value) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
    return slug || "lookup";
  }
  function isSafeLookupUrlTemplate(value) {
    try {
      const url = new URL(value.replace(/\{[^}]+\}/g, "x"));
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }
  function mergeDictionaryPreferences(current, names, types = {}) {
    const merged = new Map(current.map((item) => [item.name, item]));
    for (const name of names) {
      mergeDictionaryPreference(merged, name, types[name] ?? inferDictionaryTypeFromName(name));
    }
    return normalizeDictionaryPreferences([...merged.values()]);
  }
  function mergeDictionaryPreference(merged, name, type) {
    const existing = merged.get(name);
    if (!existing) {
      merged.set(name, defaultDictionaryPreference(name, type, merged.size));
      return;
    }
    if (!existing.type) merged.set(name, { ...existing, type });
  }
  function defaultDictionaryPreference(name, type, priority) {
    return {
      name,
      alias: name,
      enabled: true,
      priority,
      allowSecondarySearches: false,
      type
    };
  }
  function normalizeDictionaryType(value, name = "") {
    if (value === "terms" || value === "kanji" || value === "frequency" || value === "metadata") return value;
    return inferDictionaryTypeFromName(name);
  }
  function inferDictionaryTypeFromName(name) {
    const normalized = name.toLowerCase();
    if (/\b(?:frequency|freq|jpdbv?\d*|bccwj|jiten|cc100|kwdlc|aozora|netflix|novel|anime|vn)\b/.test(normalized)) return "frequency";
    if (/\b(?:kanjidic|kanji)\b/.test(normalized)) return "kanji";
    return "terms";
  }
  function formatShortcutEvent(event) {
    const parts = [];
    addShortcutModifierParts(parts, event);
    addShortcutKeyPart(parts, normalizeEventKey(event.key));
    return dedupeShortcutParts(parts).join("+");
  }
  function addShortcutModifierParts(parts, event) {
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
  }
  function addShortcutKeyPart(parts, key) {
    if (!isModifierKey(key)) parts.push(key);
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
  function normalizeEventKey(key) {
    if (key === " ") return "Space";
    return normalizeShortcutPart(key);
  }
  function isModifierKey(key) {
    return key === "Alt" || key === "Ctrl" || key === "Meta" || key === "Shift";
  }
  function dedupeShortcutParts(parts) {
    return parts.filter((part, index) => parts.indexOf(part) === index);
  }
  const SETTINGS_STORAGE_KEY = "jpdb-popup-reader-settings";
  const log$4 = Logger.scope("Settings");
  const DEFAULT_AUDIO_URL = "http://localhost:9090/?term={term}&reading={reading}";
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
  const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
  const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
  const DEFAULT_READER_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const DEFAULT_POPUP_FONT_FAMILY = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';
  const DEFAULT_SUBTITLE_FONT_FAMILY = DEFAULT_READER_FONT_FAMILY;
  const DEFAULT_WORD_COLORS = DEFAULT_WORD_COLOR_TOKENS;
  const DEFAULT_PITCH_COLORS = DEFAULT_PITCH_COLOR_TOKENS;
  const AUDIO_GUIDE_URL = "https://yomitan.wiki/advanced/#audio";
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
  const AUDIO_SOURCE_UI_TYPE_VALUES = AUDIO_SOURCE_TYPE_VALUES.filter((type) => type !== "custom");
  const DEFAULT_AUDIO_SOURCES = [
    { type: "jpod101", url: "", voice: "", enabled: true },
    { type: "language-pod-101", url: "", voice: "", enabled: true },
    { type: "jisho", url: "", voice: "", enabled: true },
    { type: "jiten-tts", url: "", voice: "", enabled: true },
    { type: "jpdb-tts", url: "", voice: "", enabled: true },
    { type: "text-to-speech", url: "", voice: "", enabled: true }
  ];
  const AUDIO_SOURCE_TYPES = new Set(AUDIO_SOURCE_TYPE_VALUES);
  const LEGACY_DEFAULT_AUDIO_SOURCE_TYPES = ["jpod101", "language-pod-101", "jisho", "text-to-speech"];
  const READER_COLOR_SOURCES = /* @__PURE__ */ new Set(["auto", "status", "jpdb", "anki", "pitch", "off"]);
  const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status", "hover"]);
  const OCR_ENGINE_ALIASES = /* @__PURE__ */ new Map([
    ["MangaOcrAdapter", "MangaOCR"],
    ["PpOcrAdapter", "PaddleOCR"],
    ["AppleVisionAdapter", "AppleVision"]
  ]);
  const DEFAULT_COLOR_CHANNELS = {
    wordHighlightColorSource: "jpdb",
    wordUnderlineColorSource: "pitch",
    wordTextColorSource: "anki",
    subtitleHighlightColorSource: "jpdb",
    subtitleUnderlineColorSource: "pitch",
    subtitleTextColorSource: "anki"
  };
  const KANJI_BOOLEAN_SETTING_KEYS = [
    "jpdbKanjiEnabled",
    "kanjiImmersionKitEnabled",
    "uchisenEnabled"
  ];
  const LOOKUP_PAGE_ENHANCEMENT_KEYS = [
    "jpdbPageEnhancementsEnabled",
    "jpdbPageWordEnhancementsEnabled",
    "jpdbPageKanjiEnhancementsEnabled"
  ];
  const API_DEFINITION_BOOLEAN_SETTING_KEYS = [
    "jpdbDefinitionsEnabled",
    "jitenDefinitionsEnabled"
  ];
  const API_DEFINITION_NUMBER_SETTING_RANGES = {
    jpdbDefinitionsPriority: { min: 0, max: 999 },
    jitenDefinitionsPriority: { min: 0, max: 999 }
  };
  const MINING_BOOLEAN_SETTING_KEYS = [
    "jpdbMiningEnabled",
    "dictionarySourcesInitiallyExpanded"
  ];
  const SUBTITLE_BOOLEAN_SETTING_KEYS = [
    "subtitleNativeBlurred",
    "subtitleKaraokeMode",
    "subtitlePausePanel",
    "subtitleAutoCopyLine",
    "subtitleCopyIncludeTranslation"
  ];
  const ANKI_STUDY_BOOLEAN_SETTING_KEYS = [
    "ankiFrontReading",
    "ankiFrontSentence",
    "ankiFrontImage",
    "ankiMobileHandoff",
    "studyTranslationEnabled",
    "studyGrammarEnabled",
    "enableLogging"
  ];
  const ANKI_STUDY_NUMBER_SETTING_RANGES = {
    ankiSectionPriority: { min: 0, max: 999 },
    studyTranslationPriority: { min: 0, max: 999 },
    studyGrammarPriority: { min: 0, max: 999 }
  };
  const KANJI_NUMBER_SETTING_RANGES = {
    jpdbKanjiPriority: { min: 0, max: 999 },
    kanjiImmersionKitPriority: { min: 0, max: 999 },
    uchisenPriority: { min: 0, max: 999 },
    rtkPriority: { min: 0, max: 999 },
    kanjivgPriority: { min: 0, max: 999 },
    kanjiOriginsPriority: { min: 0, max: 999 },
    kanjiDictionariesPriority: { min: 0, max: 999 },
    similarKanjiWordsPriority: { min: 0, max: 999 },
    similarKanjiWordLimit: { min: 2, max: 24 }
  };
  const READER_ACCENT_COLOR_SETTING_KEYS = [
    "wordColorNew",
    "wordColorLearning",
    "wordColorKnown",
    "wordColorDue",
    "wordColorFailed",
    "wordColorIgnored",
    "pitchColorHeiban",
    "pitchColorAtamadaka",
    "pitchColorNakadaka",
    "pitchColorOdaka",
    "pitchColorKifuku",
    "pitchColorUnknown"
  ];
  const ANKI_TEMPLATE_MODES = ["context", "recognition"];
  const INTERFACE_LANGUAGES = ["en", "ja", "auto"];
  const THEMES = ["dark", "light", "auto"];
  const POPUP_MODES = ["sheet", "popover", "auto"];
  const POPOVER_HEIGHT_MODES = ["fixed", "available"];
  const AUDIO_AUTO_PLAY_MODES = ["off", "all", "hover", "tap"];
  const AUDIO_TTS_MODES = ["source-order", "fallback"];
  const IMMERSION_KIT_CATEGORIES = ["anime", "drama", "games", "all"];
  const IMMERSION_KIT_SORTS = ["sentence_length:desc", "sentence_length:asc"];
  const IMMERSION_EXAMPLE_SOURCES = ["nadeshiko", "combined", "immersion-kit"];
  const SUBTITLE_CONTROL_MODES = ["always", "hidden", "auto"];
  const SUBTITLE_TRANSCRIPT_PLACEMENTS = ["left", "bottom", "right"];
  const NEW_TAB_SOURCES = ["jpdb", "anki", "auto", "dictionary"];
  const NEW_TAB_JPDB_REVIEW_MODES = ["auto", "api-vocabulary", "live-review"];
  const NEW_TAB_KANJI_KEYWORD_SOURCES = ["auto", "rtk", "jpdb", "local"];
  const LEGACY_COLOR_CHANNEL_DEFAULTS = {
    wordHighlightColorSource: "auto",
    wordUnderlineColorSource: "auto",
    wordTextColorSource: "off",
    subtitleHighlightColorSource: "off",
    subtitleUnderlineColorSource: "pitch",
    subtitleTextColorSource: "auto"
  };
  const LEGACY_DEFAULT_ANKI_DECK_NAMES = /* @__PURE__ */ new Set(["よむ", "Yomu", "yomu"]);
  const LEGACY_DEFAULT_ANKI_MODEL_NAMES = /* @__PURE__ */ new Set(["よむ Japanese", "Yomu Japanese"]);
  const LEGACY_PREVIOUS_SUBTITLE_SHORTCUT = "Alt+ArrowLeft";
  const LEGACY_NEXT_SUBTITLE_SHORTCUT = "Alt+ArrowRight";
  const DEFAULT_SETTINGS = {
    apiKey: "",
    jitenApiKey: "",
    onboardingSeen: false,
    interfaceLanguage: "ja",
    accentColor: DEFAULT_ACCENT_COLOR,
    wordColorNew: DEFAULT_WORD_COLORS.new,
    wordColorLearning: DEFAULT_WORD_COLORS.learning,
    wordColorKnown: DEFAULT_WORD_COLORS.known,
    wordColorDue: DEFAULT_WORD_COLORS.due,
    wordColorFailed: DEFAULT_WORD_COLORS.failed,
    wordColorIgnored: DEFAULT_WORD_COLORS.ignored,
    pitchColorHeiban: DEFAULT_PITCH_COLORS.heiban,
    pitchColorAtamadaka: DEFAULT_PITCH_COLORS.atamadaka,
    pitchColorNakadaka: DEFAULT_PITCH_COLORS.nakadaka,
    pitchColorOdaka: DEFAULT_PITCH_COLORS.odaka,
    pitchColorKifuku: DEFAULT_PITCH_COLORS.kifuku,
    pitchColorUnknown: DEFAULT_PITCH_COLORS.unknown,
    ...DEFAULT_COLOR_CHANNELS,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    jitenDefinitionsEnabled: true,
    jitenDefinitionsPriority: 1,
    jpdbPageEnhancementsEnabled: true,
    jpdbPageWordEnhancementsEnabled: true,
    jpdbPageKanjiEnhancementsEnabled: true,
    jpdbKanjiEnabled: true,
    jpdbKanjiPriority: 10,
    kanjiImmersionKitEnabled: true,
    kanjiImmersionKitPriority: 60,
    uchisenEnabled: true,
    uchisenPriority: 50,
    rtkEnabled: true,
    rtkPriority: 20,
    kanjivgEnabled: true,
    kanjivgPriority: 0,
    kanjiOriginsEnabled: true,
    kanjiOriginsPriority: 30,
    kanjiOriginKanjiMapEnabled: true,
    kanjiOriginGraphEnabled: true,
    kanjiOriginRadicalImagesEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordsPriority: 40,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    suppressAutoAudioOnVideo: true,
    audioAutoPlayMode: "all",
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioFallbackChimeEnabled: true,
    audioTimeoutMs: 6e3,
    audioSelectionMode: "random",
    audioTtsMode: "fallback",
    immersionKitEnabled: true,
    immersionKitExampleSource: "immersion-kit",
    nadeshikoApiKey: "",
    immersionKitPriority: 80,
    immersionKitLimitEnabled: true,
    immersionKitLimit: 3,
    immersionKitMinLength: 8,
    immersionKitMaxLength: 80,
    immersionKitCategory: "all",
    immersionKitSort: "sentence_length:asc",
    immersionKitExactMatch: false,
    immersionKitShowTranslation: true,
    immersionKitRevealTranslationOnClick: true,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlayOnHover: true,
    immersionKitPlayOnImageClick: true,
    immersionKitPlaybackRate: 1,
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    lookupOnMiddleMouse: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 80,
    popupActivationMode: "hover",
    scanModifierKey: "shift",
    showFloatingButton: true,
    newTabEnabled: false,
    newTabAnkiEnabled: false,
    newTabAnkiDisabledDecks: [],
    newTabSource: "auto",
    newTabJpdbDeck: "all",
    newTabJpdbReviewMode: "auto",
    corsProxyUrl: "https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev",
    newTabKanjiKeywordSource: "auto",
    newTabParsingEnabled: true,
    newTabFrontSentenceEnabled: true,
    newTabOfflineEnabled: true,
    newTabOfflineLimit: 50,
    newTabDailyGoalMinutes: 60,
    newTabKanjiUnlockEnabled: true,
    newTabStopAtBatchEnd: false,
    newTabSwipeReviews: true,
    newTabKanjiAutogradeEnabled: true,
    newTabKanjiAutoSubmit: false,
    puckPositionX: void 0,
    puckPositionY: void 0,
    showFurigana: true,
    furiganaMode: "difficult-kanji",
    furiganaHiddenStateGroups: ["known", "due", "failed"],
    wordColorStates: "all",
    showPitchAccent: true,
    suppressRedundantWordUi: false,
    sheetCloseButtonOnLeft: false,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrVideoPauseFrames: true,
    ocrVideoFrameStatusCard: true,
    ocrShowTextOverlay: false,
    ocrProvider: "google-lens",
    ocrEndpointUrl: "",
    ocrEngine: "auto",
    ocrCloudVisionApiKey: "",
    ocrLanguage: "ja-JP",
    ocrMaxImagePixels: 12e5,
    ocrMinImageArea: 45e3,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: DEFAULT_OVERLAY_TEXT_COLOR,
    ocrOutlineColor: DEFAULT_OVERLAY_OUTLINE_COLOR,
    ocrBackgroundColor: DEFAULT_OVERLAY_BACKGROUND_COLOR,
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    kanjiDictionariesPriority: 30,
    dictionarySourcesInitiallyExpanded: true,
    dictionaryPreferences: [],
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link })),
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: false,
    subtitleSecondaryVisible: false,
    subtitleNativeBlurred: true,
    subtitleKaraokeMode: true,
    subtitleTranscriptVisible: false,
    subtitlePausePanel: false,
    subtitleTranscriptPlacement: "right",
    subtitleTranscriptAutoScroll: true,
    subtitleTranscriptAutoScrollResumeSeconds: 4,
    subtitleAutoCopyLine: false,
    subtitleCopyIncludeTranslation: true,
    subtitleControlsMode: "auto",
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleTextColor: DEFAULT_OVERLAY_TEXT_COLOR,
    subtitleOutlineColor: DEFAULT_OVERLAY_OUTLINE_COLOR,
    subtitleBackgroundColor: DEFAULT_OVERLAY_BACKGROUND_COLOR,
    subtitleBackgroundOpacity: 0,
    subtitleFontFamily: DEFAULT_SUBTITLE_FONT_FAMILY,
    subtitleFontWeight: 760,
    subtitleMiningPause: false,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: true,
    preferJapaneseSiteLanguage: true,
    // Keep Anki opt-in: fresh installs/factory resets cannot assume Anki exists, and the send button costs real space on mobile popups.
    ankiEnabled: false,
    ankiSectionEnabled: false,
    ankiSectionPriority: 90,
    ankiConnectUrl: "http://127.0.0.1:8765",
    ankiDeck: "よむ",
    ankiModel: "よむ Japanese",
    ankiTemplateMode: "recognition",
    ankiFrontReading: true,
    ankiFrontSentence: true,
    ankiFrontImage: true,
    ankiMobileHandoff: false,
    studyTranslationEnabled: true,
    studyGrammarEnabled: true,
    enableLogging: false,
    ankiTags: "yomu",
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    ankiFieldMappings: {},
    theme: "light",
    popupMode: "auto",
    stickyBottomSheet: false,
    popoverBackdropEnabled: true,
    popoverWidth: 520,
    popoverHeight: 540,
    popoverHeightMode: "fixed",
    readerFontFamily: DEFAULT_READER_FONT_FAMILY,
    popupFontFamily: DEFAULT_POPUP_FONT_FAMILY,
    popupFontWeight: 400,
    jpdbMiningEnabled: true,
    miningDeck: "forq",
    autoMineOnReview: false,
    neverForgetDeck: "never-forget",
    blacklistDeck: "blacklist",
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    studyTranslationPriority: 10,
    studyGrammarPriority: 20,
    shortcuts: {
      scanPage: "Alt+J",
      hoverLookup: "",
      openSettings: "Alt+Shift+J",
      playAudio: "A",
      closePopup: "Escape",
      previousLookupWord: "Alt+Shift+ArrowLeft",
      nextLookupWord: "Alt+Shift+ArrowRight",
      previousSubtitle: "A",
      nextSubtitle: "D",
      copySubtitle: "Alt+C",
      toggleOcr: "Alt+O",
      toggleSubtitleOverlay: "Shift+H",
      toggleYoutubeImmersion: "Alt+Y",
      scanImages: "Alt+I",
      massReviewVisible: "Alt+M",
      studyReveal: "Space",
      studyRevealAlternate: "Enter",
      studyUndo: "U",
      studyPrevious: "ArrowLeft",
      studyPreviousAlternate: "P",
      studyNext: "ArrowRight",
      studyNextAlternate: "N",
      gradeNothing: "1",
      gradeSomething: "2",
      gradeHard: "3",
      gradeOkay: "4",
      gradeEasy: "5",
      gradeFail: "1",
      gradePass: "2"
    }
  };
  const LEGACY_DEFAULT_TRUE_ANKI_SETTINGS = [
    "ankiMobileHandoff",
    "ankiMineWithJpdb",
    "ankiSectionEnabled",
    "ankiFrontReading",
    "ankiFrontSentence",
    "ankiFrontImage",
    "ankiCaptureScreenshot"
  ];
  const LEGACY_DEFAULT_ANKI_STRING_SETTINGS = [
    ["ankiConnectUrl", DEFAULT_SETTINGS.ankiConnectUrl],
    ["ankiTemplateMode", DEFAULT_SETTINGS.ankiTemplateMode],
    ["ankiTags", DEFAULT_SETTINGS.ankiTags]
  ];
  function mergeSettings(value) {
    const settingsValue = migrateLegacyDefaultMobileSettings(value);
    const audio = normalizeAudioSettings(settingsValue);
    const supportedSettings = stripUnsupportedSettings(settingsValue);
    const apiCredentials = normalizeApiCredentialSettings(settingsValue);
    return {
      ...DEFAULT_SETTINGS,
      ...supportedSettings ?? {},
      ...apiCredentials,
      ...normalizeLookupSettings(settingsValue),
      ...normalizeNewTabSettings(settingsValue),
      ...normalizeReaderDisplaySettings(settingsValue),
      ...audio,
      ...normalizeMediaSettings(settingsValue),
      ...normalizeSubtitleSettings(settingsValue),
      ...normalizeKanjiSettings(settingsValue),
      ...normalizeAnkiAndStudySettings(settingsValue),
      ...normalizePresentationSettings(settingsValue),
      ...normalizeMiningSettings(settingsValue),
      ...normalizeRemovedDictionarySettings(settingsValue),
      dictionaryPreferences: normalizeDictionaryPreferences(settingsValue?.dictionaryPreferences),
      dictionaryLookupLinks: normalizeDictionaryLookupLinkSettings(settingsValue),
      shortcuts: normalizeShortcutSettings(settingsValue)
    };
  }
  function normalizeReaderSettings(value) {
    return mergeSettings(value);
  }
  function normalizeApiCredentialSettings(value) {
    const apiKey = trimmedStringSetting(value, "apiKey", DEFAULT_SETTINGS.apiKey);
    const jitenApiKey = trimmedStringSetting(value, "jitenApiKey", DEFAULT_SETTINGS.jitenApiKey);
    if (isJitenApiCredential(apiKey)) return { apiKey: "", jitenApiKey: jitenApiKey || apiKey };
    return { apiKey, jitenApiKey };
  }
  function stripUnsupportedSettings(value) {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => supportedKeys.has(key))
    );
  }
  function migrateLegacyDefaultMobileSettings(value) {
    if (!value) return value;
    const migrateAnki = isLegacyDefaultAnkiSettings(value);
    const migrateNewTabAnki = isLegacyDefaultNewTabAnkiSettings(value);
    if (!migrateAnki && !migrateNewTabAnki) return value;
    const migrated = { ...value };
    if (migrateAnki) {
      migrated.ankiEnabled = false;
      migrated.ankiSectionEnabled = false;
      migrated.ankiMobileHandoff = false;
      migrated.ankiMineWithJpdb = false;
    }
    if (migrateNewTabAnki) migrated.newTabAnkiEnabled = false;
    return migrated;
  }
  function isLegacyDefaultAnkiSettings(value) {
    if (!isPreCurrentSavedSettingsPayload(value)) return false;
    return legacyAnkiBooleanSettingsAreDefault(value) && legacyAnkiStringSettingsAreDefault(value) && legacyStringSettingIn(value, "ankiDeck", LEGACY_DEFAULT_ANKI_DECK_NAMES) && legacyStringSettingIn(value, "ankiModel", LEGACY_DEFAULT_ANKI_MODEL_NAMES) && legacyAnkiFieldMappingsAreDefault(value);
  }
  function legacyAnkiBooleanSettingsAreDefault(value) {
    return LEGACY_DEFAULT_TRUE_ANKI_SETTINGS.every((key) => legacyBooleanSettingMatches(value, key, true));
  }
  function legacyAnkiStringSettingsAreDefault(value) {
    return LEGACY_DEFAULT_ANKI_STRING_SETTINGS.every(([key, expected]) => legacyStringSettingMatches(value, key, expected));
  }
  function isLegacyDefaultNewTabAnkiSettings(value) {
    if (!isPreCurrentSavedSettingsPayload(value)) return false;
    return legacyBooleanSettingMatches(value, "newTabAnkiEnabled", true) && legacyBooleanSettingMatches(value, "newTabEnabled", false) && legacyStringListSettingIsEmpty(value, "newTabAnkiDisabledDecks") && legacyStringSettingMatches(value, "newTabSource", DEFAULT_SETTINGS.newTabSource) && legacyStringSettingMatches(value, "newTabJpdbDeck", DEFAULT_SETTINGS.newTabJpdbDeck) && legacyStringSettingMatches(value, "newTabJpdbReviewMode", DEFAULT_SETTINGS.newTabJpdbReviewMode);
  }
  function isPreCurrentSavedSettingsPayload(value) {
    return !hasOwn(value, "jitenApiKey");
  }
  function legacyBooleanSettingMatches(value, key, expected) {
    return hasOwn(value, key) && value[key] === expected;
  }
  function legacyStringSettingMatches(value, key, expected) {
    const raw = value[key];
    return hasOwn(value, key) && typeof raw === "string" && raw.trim() === expected;
  }
  function legacyStringSettingIn(value, key, expected) {
    const raw = value[key];
    return hasOwn(value, key) && typeof raw === "string" && expected.has(raw.trim());
  }
  function legacyStringListSettingIsEmpty(value, key) {
    const raw = value[key];
    return hasOwn(value, key) && Array.isArray(raw) && raw.length === 0;
  }
  function legacyAnkiFieldMappingsAreDefault(value) {
    const raw = value.ankiFieldMappings;
    return hasOwn(value, "ankiFieldMappings") && Boolean(raw) && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 0;
  }
  function normalizeAudioSettings(value) {
    const settings = value ?? {};
    const hasSavedAudioSources = hasOwn(settings, "audioSources") || Boolean(settings.audioSourceUrl);
    const audioSources = hasSavedAudioSources ? normalizeAudioSources(settings.audioSources, settings.audioSourceUrl) : DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
    const audioAutoPlayMode = normalizeAudioAutoPlayMode(settings.audioAutoPlayMode);
    return {
      autoPlayAudio: audioAutoPlayMode === "off" ? false : booleanSetting(value, "autoPlayAudio"),
      suppressAutoAudioOnVideo: booleanSetting(value, "suppressAutoAudioOnVideo"),
      audioAutoPlayMode,
      audioSources,
      audioSourceUrl: preferredAudioSourceUrl(audioSources, settings.audioSourceUrl),
      audioTtsMode: normalizeAudioTtsMode(settings.audioTtsMode)
    };
  }
  function preferredAudioSourceUrl(audioSources, fallback) {
    return audioSources.find((source) => source.url)?.url ?? fallback ?? DEFAULT_AUDIO_URL;
  }
  function normalizeShortcutSettings(value) {
    const shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      ...value?.shortcuts ?? {}
    };
    if (value?.shortcuts && !hasOwn(value.shortcuts, "hoverLookup")) {
      shortcuts.hoverLookup = value.popupActivationMode === "modifier" ? shortcutFromLegacyModifier(value.scanModifierKey) : "";
    }
    migrateLegacySubtitleLineShortcuts(shortcuts, value?.shortcuts);
    return shortcuts;
  }
  function migrateLegacySubtitleLineShortcuts(shortcuts, savedShortcuts) {
    if (!savedShortcuts) return;
    if (savedShortcuts.previousSubtitle === LEGACY_PREVIOUS_SUBTITLE_SHORTCUT) {
      shortcuts.previousSubtitle = DEFAULT_SETTINGS.shortcuts.previousSubtitle;
    }
    if (savedShortcuts.nextSubtitle === LEGACY_NEXT_SUBTITLE_SHORTCUT) {
      shortcuts.nextSubtitle = DEFAULT_SETTINGS.shortcuts.nextSubtitle;
    }
  }
  function normalizeLookupSettings(value) {
    return {
      interfaceLanguage: normalizeInterfaceLanguage(value?.interfaceLanguage),
      ...normalizeBooleanSettingGroup(value, API_DEFINITION_BOOLEAN_SETTING_KEYS),
      ...normalizeNumberSettingGroup(value, API_DEFINITION_NUMBER_SETTING_RANGES),
      ...normalizeBooleanSettingGroup(value, LOOKUP_PAGE_ENHANCEMENT_KEYS),
      lookupOnClick: booleanSettingWithFallback(value, "lookupOnClick", true),
      lookupOnHover: booleanSettingWithFallback(value, "lookupOnHover", value?.popupActivationMode !== "click"),
      lookupOnMiddleMouse: booleanSettingWithFallback(value, "lookupOnMiddleMouse", true),
      hoverOpenDelayMs: clampNumber$1(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
      hoverCloseDelayMs: clampNumber$1(value?.hoverCloseDelayMs, 0, 3e3, DEFAULT_SETTINGS.hoverCloseDelayMs)
    };
  }
  function normalizeRemovedDictionarySettings(value) {
    return {
      jpdbDefinitionsEnabled: booleanSetting(value, "jpdbDefinitionsEnabled"),
      localDictionariesEnabled: booleanSetting(value, "localDictionariesEnabled"),
      dictionarySourcesInitiallyExpanded: booleanSetting(value, "dictionarySourcesInitiallyExpanded"),
      localDictionaryMaxResults: DEFAULT_SETTINGS.localDictionaryMaxResults,
      localDictionaryShowKanji: booleanSetting(value, "localDictionaryShowKanji")
    };
  }
  function normalizeNewTabSettings(value) {
    return {
      newTabEnabled: booleanSetting(value, "newTabEnabled"),
      newTabAnkiEnabled: booleanSetting(value, "newTabAnkiEnabled"),
      newTabAnkiDisabledDecks: normalizeStringList(value?.newTabAnkiDisabledDecks),
      newTabSource: normalizeNewTabSource(value?.newTabSource),
      newTabJpdbDeck: normalizeDeckIdSetting(value?.newTabJpdbDeck, DEFAULT_SETTINGS.newTabJpdbDeck),
      newTabJpdbReviewMode: normalizeNewTabJpdbReviewMode(value?.newTabJpdbReviewMode),
      corsProxyUrl: normalizeCorsProxyUrl(value?.corsProxyUrl),
      newTabKanjiKeywordSource: normalizeNewTabKanjiKeywordSource(value?.newTabKanjiKeywordSource),
      newTabParsingEnabled: booleanSetting(value, "newTabParsingEnabled"),
      newTabFrontSentenceEnabled: booleanSetting(value, "newTabFrontSentenceEnabled"),
      newTabOfflineEnabled: booleanSetting(value, "newTabOfflineEnabled"),
      newTabOfflineLimit: clampNumber$1(value?.newTabOfflineLimit, 0, 500, DEFAULT_SETTINGS.newTabOfflineLimit),
      newTabDailyGoalMinutes: clampNumber$1(value?.newTabDailyGoalMinutes, 0, 1440, DEFAULT_SETTINGS.newTabDailyGoalMinutes),
      newTabKanjiUnlockEnabled: booleanSetting(value, "newTabKanjiUnlockEnabled"),
      newTabStopAtBatchEnd: booleanSetting(value, "newTabStopAtBatchEnd"),
      newTabSwipeReviews: booleanSetting(value, "newTabSwipeReviews"),
      newTabKanjiAutogradeEnabled: booleanSetting(value, "newTabKanjiAutogradeEnabled"),
      newTabKanjiAutoSubmit: booleanSetting(value, "newTabKanjiAutoSubmit")
    };
  }
  function normalizeReaderDisplaySettings(value) {
    const settings = value ?? {};
    return {
      accentColor: sanitizeAccentColor(settings.accentColor),
      ...normalizeAccentColorSettings(settings, READER_ACCENT_COLOR_SETTING_KEYS),
      ...normalizeReaderColorChannelSettings(value),
      puckPositionX: normalizeOptionalCoordinate(settings.puckPositionX),
      puckPositionY: normalizeOptionalCoordinate(settings.puckPositionY),
      showFurigana: booleanSetting(value, "showFurigana"),
      furiganaMode: normalizeFuriganaMode(settings.furiganaMode, value),
      furiganaHiddenStateGroups: normalizeFuriganaHiddenStateGroups(settings.furiganaHiddenStateGroups),
      wordColorStates: settings.wordColorStates === "new-only" ? "new-only" : "all",
      hideKnownFurigana: booleanSetting(value, "hideKnownFurigana")
    };
  }
  function normalizeAccentColorSettings(settings, keys) {
    const normalized = {};
    for (const key of keys) {
      normalized[key] = sanitizeAccentColor(settings[key], String(DEFAULT_SETTINGS[key]));
    }
    return normalized;
  }
  function normalizeKanjiSettings(value) {
    return {
      ...normalizeBooleanSettingGroup(value, KANJI_BOOLEAN_SETTING_KEYS),
      ...normalizeNumberSettingGroup(value, KANJI_NUMBER_SETTING_RANGES)
    };
  }
  function normalizeAnkiAndStudySettings(value) {
    const settings = value ?? {};
    return {
      ankiSectionEnabled: normalizeAnkiSectionEnabled(value),
      ...normalizeNumberSettingGroup(value, ANKI_STUDY_NUMBER_SETTING_RANGES),
      ankiConnectUrl: normalizeUrl(settings.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
      ankiDeck: normalizeAnkiName(settings.ankiDeck, DEFAULT_SETTINGS.ankiDeck, "Yomu"),
      ankiModel: normalizeAnkiName(settings.ankiModel, DEFAULT_SETTINGS.ankiModel, "Yomu Japanese"),
      ankiTemplateMode: normalizeAnkiTemplateMode(settings.ankiTemplateMode),
      ankiFieldMappings: normalizeAnkiFieldMappings(settings.ankiFieldMappings),
      ...normalizeBooleanSettingGroup(value, ANKI_STUDY_BOOLEAN_SETTING_KEYS)
    };
  }
  function normalizeAnkiSectionEnabled(value) {
    const ankiEnabled = booleanSetting(value, "ankiEnabled");
    return hasOwn(value, "ankiSectionEnabled") ? booleanSetting(value, "ankiSectionEnabled") : ankiEnabled;
  }
  function normalizePresentationSettings(value) {
    return {
      theme: normalizeTheme(value?.theme),
      popupMode: normalizePopupMode(value?.popupMode),
      stickyBottomSheet: booleanSetting(value, "stickyBottomSheet"),
      popoverBackdropEnabled: booleanSetting(value, "popoverBackdropEnabled"),
      popoverWidth: clampNumber$1(value?.popoverWidth, 280, 900, DEFAULT_SETTINGS.popoverWidth),
      popoverHeight: clampNumber$1(value?.popoverHeight, 220, 900, DEFAULT_SETTINGS.popoverHeight),
      popoverHeightMode: normalizePopoverHeightMode(value?.popoverHeightMode),
      readerFontFamily: normalizeFontFamily(value?.readerFontFamily, DEFAULT_SETTINGS.readerFontFamily),
      popupFontFamily: normalizeFontFamily(value?.popupFontFamily, DEFAULT_SETTINGS.popupFontFamily),
      popupFontWeight: clampNumber$1(value?.popupFontWeight, 300, 900, DEFAULT_SETTINGS.popupFontWeight)
    };
  }
  function normalizeMiningSettings(value) {
    return {
      ankiTags: trimmedStringSetting(value, "ankiTags", DEFAULT_SETTINGS.ankiTags),
      miningDeck: normalizeDeckIdSetting(value?.miningDeck, DEFAULT_SETTINGS.miningDeck),
      autoMineOnReview: typeof value?.autoMineOnReview === "boolean" ? value.autoMineOnReview : DEFAULT_SETTINGS.autoMineOnReview,
      neverForgetDeck: normalizeDeckIdSetting(value?.neverForgetDeck, DEFAULT_SETTINGS.neverForgetDeck),
      blacklistDeck: normalizeDeckIdSetting(value?.blacklistDeck, DEFAULT_SETTINGS.blacklistDeck),
      ...normalizeBooleanSettingGroup(value, MINING_BOOLEAN_SETTING_KEYS)
    };
  }
  function normalizeMediaSettings(value) {
    const settings = value ?? {};
    return {
      audioViaBlob: booleanSetting(value, "audioViaBlob"),
      audioFallbackChimeEnabled: booleanSetting(value, "audioFallbackChimeEnabled"),
      immersionKitExampleSource: normalizeImmersionExampleSource(settings.immersionKitExampleSource),
      nadeshikoApiKey: trimmedStringSetting(value, "nadeshikoApiKey", DEFAULT_SETTINGS.nadeshikoApiKey),
      immersionKitPriority: clampNumber$1(settings.immersionKitPriority, 0, 999, DEFAULT_SETTINGS.immersionKitPriority),
      immersionKitLimitEnabled: booleanSetting(value, "immersionKitLimitEnabled"),
      immersionKitLimit: clampNumber$1(settings.immersionKitLimit, 1, 12, DEFAULT_SETTINGS.immersionKitLimit),
      immersionKitMinLength: clampNumber$1(settings.immersionKitMinLength, 0, 120, DEFAULT_SETTINGS.immersionKitMinLength),
      immersionKitMaxLength: clampNumber$1(settings.immersionKitMaxLength, 0, 240, DEFAULT_SETTINGS.immersionKitMaxLength),
      immersionKitCategory: normalizeImmersionKitCategory(settings.immersionKitCategory),
      immersionKitSort: normalizeImmersionKitSort(settings.immersionKitSort),
      immersionKitPlaybackRate: clampNumber$1(settings.immersionKitPlaybackRate, 0.5, 2, DEFAULT_SETTINGS.immersionKitPlaybackRate),
      immersionKitRevealTranslationOnClick: booleanSetting(value, "immersionKitRevealTranslationOnClick"),
      immersionKitPlayOnHover: booleanSetting(value, "immersionKitPlayOnHover"),
      immersionKitPlayOnImageClick: booleanSetting(value, "immersionKitPlayOnImageClick"),
      ocrVideoFrameStatusCard: booleanSetting(value, "ocrVideoFrameStatusCard"),
      ocrProvider: normalizeOcrProvider(settings.ocrProvider, value),
      ocrEngine: normalizeOcrEngine(settings.ocrEngine),
      ocrCloudVisionApiKey: normalizeCloudVisionApiKey(settings.ocrCloudVisionApiKey),
      ocrTextColor: sanitizeAccentColor(settings.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor),
      ocrOutlineColor: sanitizeAccentColor(settings.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor),
      ocrBackgroundColor: sanitizeAccentColor(settings.ocrBackgroundColor, DEFAULT_SETTINGS.ocrBackgroundColor),
      ocrBackgroundOpacity: clampNumber$1(settings.ocrBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.ocrBackgroundOpacity),
      ocrFontScale: clampNumber$1(settings.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale)
    };
  }
  function normalizeSubtitleSettings(value) {
    return {
      ...normalizeBooleanSettingGroup(value, SUBTITLE_BOOLEAN_SETTING_KEYS),
      subtitleControlsMode: normalizeSubtitleControlsMode(value?.subtitleControlsMode),
      subtitleTranscriptPlacement: normalizeSubtitleTranscriptPlacement(value?.subtitleTranscriptPlacement),
      subtitleTextColor: sanitizeAccentColor(value?.subtitleTextColor, DEFAULT_SETTINGS.subtitleTextColor),
      subtitleOutlineColor: sanitizeAccentColor(value?.subtitleOutlineColor, DEFAULT_SETTINGS.subtitleOutlineColor),
      subtitleBackgroundColor: sanitizeAccentColor(value?.subtitleBackgroundColor, DEFAULT_SETTINGS.subtitleBackgroundColor),
      subtitleBackgroundOpacity: clampNumber$1(value?.subtitleBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.subtitleBackgroundOpacity),
      subtitleFontFamily: normalizeFontFamily(value?.subtitleFontFamily, DEFAULT_SETTINGS.subtitleFontFamily),
      subtitleFontWeight: clampNumber$1(value?.subtitleFontWeight, 100, 900, DEFAULT_SETTINGS.subtitleFontWeight)
    };
  }
  function normalizeFontFamily(value, fallback) {
    return trimmedText(value) || fallback;
  }
  function normalizeOptionalCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : void 0;
  }
  function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))];
  }
  function normalizeAnkiName(value, fallback, oldDefault) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
    return trimmed;
  }
  function normalizeAnkiTemplateMode(value) {
    return normalizeOption(value, ANKI_TEMPLATE_MODES, DEFAULT_SETTINGS.ankiTemplateMode);
  }
  function normalizeInterfaceLanguage(value) {
    return normalizeOption(value, INTERFACE_LANGUAGES, DEFAULT_SETTINGS.interfaceLanguage);
  }
  function normalizeTheme(value) {
    return normalizeOption(value, THEMES, DEFAULT_SETTINGS.theme);
  }
  function normalizePopupMode(value) {
    return normalizeOption(value, POPUP_MODES, DEFAULT_SETTINGS.popupMode);
  }
  function normalizePopoverHeightMode(value) {
    return normalizeOption(value, POPOVER_HEIGHT_MODES, DEFAULT_SETTINGS.popoverHeightMode);
  }
  function normalizeAudioAutoPlayMode(value) {
    return normalizeOption(value, AUDIO_AUTO_PLAY_MODES, DEFAULT_SETTINGS.audioAutoPlayMode);
  }
  function normalizeAudioTtsMode(value) {
    return normalizeOption(value, AUDIO_TTS_MODES, DEFAULT_SETTINGS.audioTtsMode);
  }
  function normalizeImmersionKitCategory(value) {
    return normalizeOption(value, IMMERSION_KIT_CATEGORIES, DEFAULT_SETTINGS.immersionKitCategory);
  }
  function normalizeImmersionKitSort(value) {
    return normalizeOption(value, IMMERSION_KIT_SORTS, DEFAULT_SETTINGS.immersionKitSort);
  }
  function normalizeImmersionExampleSource(value) {
    return normalizeOption(value, IMMERSION_EXAMPLE_SOURCES, DEFAULT_SETTINGS.immersionKitExampleSource);
  }
  function normalizeOption(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }
  function normalizeUrl(value, fallback) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      return new URL(value.trim()).toString().replace(/\/$/, "");
    } catch {
      return fallback;
    }
  }
  function shortcutFromLegacyModifier(value) {
    if (value === "alt") return "Alt";
    if (value === "ctrl") return "Ctrl";
    if (value === "meta") return "Meta";
    return value === "shift" ? "Shift" : "";
  }
  function clampNumber$1(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function normalizeBooleanSettingGroup(value, keys) {
    const normalized = {};
    for (const key of keys) {
      normalized[key] = booleanSetting(value, key);
    }
    return normalized;
  }
  function normalizeNumberSettingGroup(value, ranges) {
    const normalized = {};
    for (const key of Object.keys(ranges)) {
      const { min, max } = ranges[key];
      const fallback = DEFAULT_SETTINGS[key];
      normalized[key] = clampNumber$1(value?.[key], min, max, typeof fallback === "number" ? fallback : 0);
    }
    return normalized;
  }
  function booleanSetting(value, key) {
    const rawValue = value?.[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof rawValue === "boolean") return rawValue;
    return typeof fallback === "boolean" ? fallback : false;
  }
  function booleanSettingWithFallback(value, key, fallback) {
    const rawValue = value?.[key];
    return typeof rawValue === "boolean" ? rawValue : fallback;
  }
  function trimmedStringSetting(value, key, fallback) {
    const rawValue = value?.[key];
    return typeof rawValue === "string" ? rawValue.trim() : fallback;
  }
  function normalizeSubtitleControlsMode(value) {
    return normalizeOption(value, SUBTITLE_CONTROL_MODES, DEFAULT_SETTINGS.subtitleControlsMode);
  }
  function normalizeSubtitleTranscriptPlacement(value) {
    return normalizeOption(value, SUBTITLE_TRANSCRIPT_PLACEMENTS, DEFAULT_SETTINGS.subtitleTranscriptPlacement);
  }
  function normalizeNewTabSource(value) {
    return normalizeOption(value, NEW_TAB_SOURCES, DEFAULT_SETTINGS.newTabSource);
  }
  function normalizeNewTabJpdbReviewMode(value) {
    return normalizeOption(value, NEW_TAB_JPDB_REVIEW_MODES, DEFAULT_SETTINGS.newTabJpdbReviewMode);
  }
  function normalizeCorsProxyUrl(value) {
    if (value == null) return DEFAULT_SETTINGS.corsProxyUrl;
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href.replace(/\/+$/, "") : "";
    } catch {
      return "";
    }
  }
  function normalizeNewTabKanjiKeywordSource(value) {
    return normalizeOption(value, NEW_TAB_KANJI_KEYWORD_SOURCES, DEFAULT_SETTINGS.newTabKanjiKeywordSource);
  }
  function normalizeReaderColorChannelSettings(value) {
    if (isLegacyDefaultColorChannelSettings(value)) return { ...DEFAULT_COLOR_CHANNELS };
    const channels = {
      wordHighlightColorSource: normalizeReaderColorSource(value?.wordHighlightColorSource, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource, legacyHighlightColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordHighlightColorSource)),
      wordUnderlineColorSource: normalizeReaderColorSource(value?.wordUnderlineColorSource, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordUnderlineColorSource)),
      wordTextColorSource: normalizeReaderColorSource(value?.wordTextColorSource, DEFAULT_COLOR_CHANNELS.wordTextColorSource, legacyReaderColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.wordTextColorSource)),
      subtitleHighlightColorSource: normalizeReaderColorSource(value?.subtitleHighlightColorSource, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource, legacySubtitleHighlightColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource)),
      subtitleUnderlineColorSource: normalizeReaderColorSource(value?.subtitleUnderlineColorSource, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleUnderlineColorSource)),
      subtitleTextColorSource: normalizeReaderColorSource(value?.subtitleTextColorSource, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource, legacySubtitleColorSourceForAuto(value, DEFAULT_COLOR_CHANNELS.subtitleTextColorSource))
    };
    return normalizeStaleDoublePitchHighlightChannels(value, channels);
  }
  function isLegacyDefaultColorChannelSettings(value) {
    if (!value) return false;
    return Object.keys(LEGACY_COLOR_CHANNEL_DEFAULTS).every((key) => hasOwn(value, key) && value[key] === LEGACY_COLOR_CHANNEL_DEFAULTS[key]);
  }
  function normalizeReaderColorSource(value, fallback, autoFallback = fallback) {
    const source = value === "auto" ? autoFallback : value;
    return READER_COLOR_SOURCES.has(source) ? source : fallback;
  }
  function normalizeStaleDoublePitchHighlightChannels(settings, channels) {
    const staleWordHighlight = hasStaleWordPitchHighlight(settings, channels);
    const staleSubtitleHighlight = hasStaleSubtitlePitchHighlight(settings, channels);
    if (!staleWordHighlight && !staleSubtitleHighlight) return channels;
    return {
      ...channels,
      wordHighlightColorSource: staleWordHighlight ? DEFAULT_COLOR_CHANNELS.wordHighlightColorSource : channels.wordHighlightColorSource,
      subtitleHighlightColorSource: staleSubtitleHighlight ? DEFAULT_COLOR_CHANNELS.subtitleHighlightColorSource : channels.subtitleHighlightColorSource
    };
  }
  function hasStaleWordPitchHighlight(settings, channels) {
    if (!settings) return false;
    if (settings.wordHighlightMode === "pitch") return true;
    return hasStalePitchHighlightPair(settings, channels, "wordHighlightColorSource", "wordUnderlineColorSource");
  }
  function hasStaleSubtitlePitchHighlight(settings, channels) {
    if (!settings) return false;
    if (settings.wordHighlightMode === "pitch") return true;
    return hasStalePitchHighlightPair(settings, channels, "subtitleHighlightColorSource", "subtitleUnderlineColorSource");
  }
  function hasStalePitchHighlightPair(settings, channels, highlight, underline) {
    return (isPreCurrentSavedSettingsPayload(settings) || hasOwn(settings, "wordHighlightMode")) && isRawPitchPair(settings, highlight, underline) && channels[highlight] === "pitch" && channels[underline] === "pitch";
  }
  function isRawPitchPair(settings, highlight, underline) {
    return settings[highlight] === "pitch" && settings[underline] === "pitch";
  }
  function legacyHighlightColorSourceForAuto(settings, fallback) {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (mode === "pitch") return fallback;
    return legacyReaderColorSourceForAuto(settings, fallback);
  }
  function legacyReaderColorSourceForAuto(settings, fallback) {
    const mode = legacyEffectiveWordHighlightMode(settings);
    return mode === "status" ? fallback : mode ?? fallback;
  }
  function legacySubtitleHighlightColorSourceForAuto(settings, fallback) {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (mode === "pitch") return fallback;
    return legacySubtitleColorSourceForAuto(settings, fallback);
  }
  function legacySubtitleColorSourceForAuto(settings, fallback) {
    const mode = legacyEffectiveWordHighlightMode(settings);
    if (!mode) return fallback;
    return mode === "status" ? "jpdb" : mode;
  }
  function legacyEffectiveWordHighlightMode(settings) {
    if (!settings || !hasOwn(settings, "wordHighlightMode")) return null;
    if (settings.wordHighlightMode === "status" || settings.wordHighlightMode === "pitch" || settings.wordHighlightMode === "off") return settings.wordHighlightMode;
    return hasLegacyMiningStatusSource(settings) ? "status" : "pitch";
  }
  function hasLegacyMiningStatusSource(settings) {
    return Boolean(settings.ankiEnabled || settings.jpdbMiningEnabled && settings.apiKey?.trim());
  }
  function normalizeFuriganaMode(value, settings) {
    if (value === "auto") return effectiveLegacyAutoFuriganaMode(settings);
    if (isFuriganaMode(value)) return value;
    if (legacyBooleanSettingIs(settings, "showFurigana", false)) return "off";
    if (legacyBooleanSettingIs(settings, "hideKnownFurigana", false)) return "all";
    return DEFAULT_SETTINGS.furiganaMode;
  }
  function effectiveLegacyAutoFuriganaMode(settings) {
    return settings && hasPersonalizedFuriganaSource(settings) ? "known-status" : "difficult-kanji";
  }
  function isFuriganaMode(value) {
    return value === "auto" || value === "all" || value === "difficult-kanji" || value === "known-status" || value === "hover" || value === "off";
  }
  const FURIGANA_STATE_GROUPS = /* @__PURE__ */ new Set(["new", "learning", "known", "due", "failed"]);
  function normalizeFuriganaHiddenStateGroups(value) {
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.furiganaHiddenStateGroups];
    const groups = value.filter((item) => typeof item === "string" && FURIGANA_STATE_GROUPS.has(item));
    return [...new Set(groups)];
  }
  function legacyBooleanSettingIs(settings, key, expected) {
    return Boolean(settings && Object.prototype.hasOwnProperty.call(settings, key) && settings[key] === expected);
  }
  function normalizeDeckIdSetting(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }
  function hasPersonalizedFuriganaSource(settings) {
    const credentials = {
      apiKey: settings.apiKey ?? "",
      jitenApiKey: settings.jitenApiKey ?? ""
    };
    return Boolean(hasJpdbApiCredential(credentials) || hasJitenApiCredential(credentials) || settings.ankiEnabled);
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
  function normalizeOcrProvider(value, settings) {
    if (isBlankLegacyLocalOcrSetting(value, settings)) return DEFAULT_SETTINGS.ocrProvider;
    if (typeof value !== "string") return DEFAULT_SETTINGS.ocrProvider;
    return OCR_PROVIDER_ALIASES[value] ?? (OCR_PROVIDERS.has(value) ? value : DEFAULT_SETTINGS.ocrProvider);
  }
  const OCR_PROVIDER_ALIASES = {
    auto: "google-lens",
    fast: "google-lens",
    "page-text": "google-lens",
    "custom-json": "local-service"
  };
  const OCR_PROVIDERS = /* @__PURE__ */ new Set(["google-lens", "cloud-vision", "local-service", "off"]);
  function normalizeCloudVisionApiKey(value) {
    return typeof value === "string" ? value.trim() : DEFAULT_SETTINGS.ocrCloudVisionApiKey;
  }
  function isBlankLegacyLocalOcrSetting(value, settings) {
    if (value !== "local-service" || !settings) return false;
    if (hasOwn(settings, "ocrCloudVisionApiKey")) return false;
    return !(typeof settings.ocrEndpointUrl === "string" && settings.ocrEndpointUrl.trim());
  }
  function normalizeOcrEngine(value) {
    const normalized = normalizedOcrEngineInput(value);
    return normalized ? OCR_ENGINE_ALIASES.get(normalized) ?? normalized : DEFAULT_SETTINGS.ocrEngine;
  }
  function normalizedOcrEngineInput(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  async function saveSettings(settings) {
    try {
      const normalizedSettings = mergeSettings(settings);
      const storedSettings = stripUnsupportedSettings(normalizedSettings) ?? normalizedSettings;
      await gmStorageSet(SETTINGS_STORAGE_KEY, storedSettings);
      dispatchSettingsChange(storedSettings);
    } catch (error) {
      log$4.warn("Settings save failed", { error });
      throw error;
    }
  }
  function dispatchSettingsChange(settings) {
    try {
      dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { settings }));
    } catch {
    }
  }
  function isAudioSourceType(value) {
    return typeof value === "string" && AUDIO_SOURCE_TYPES.has(value);
  }
  function normalizeAudioSource(value) {
    const record = audioSourceRecord(value);
    if (!record) return null;
    if (!isAudioSourceType(record.type)) return null;
    return {
      type: record.type,
      url: stringValue(record.url),
      voice: stringValue(record.voice),
      enabled: audioSourceEnabled(record.enabled)
    };
  }
  function audioSourceRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function audioSourceEnabled(value) {
    return typeof value === "boolean" ? value : true;
  }
  function normalizeAudioSources(value, legacyUrl) {
    const sources = Array.isArray(value) ? value.map(normalizeAudioSource).filter((source) => source !== null) : [];
    if (Array.isArray(value)) return migrateLegacyDefaultAudioSources(sources);
    if (typeof legacyUrl === "string" && legacyUrl.trim()) {
      return [{ type: "custom-json", url: legacyUrl.trim(), voice: "", enabled: true }];
    }
    return DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
  }
  function migrateLegacyDefaultAudioSources(sources) {
    const types = new Set(sources.map((source) => source.type));
    if (!LEGACY_DEFAULT_AUDIO_SOURCE_TYPES.every((type) => types.has(type))) return sources;
    const migrated = sources.map((source) => ({ ...source }));
    ensureBuiltInAudioSource(migrated, { type: "jpdb-tts", url: "", voice: "", enabled: true }, "text-to-speech");
    ensureBuiltInAudioSource(migrated, { type: "jiten-tts", url: "", voice: "", enabled: true }, "jpdb-tts");
    return migrated;
  }
  function ensureBuiltInAudioSource(sources, source, beforeType) {
    if (sources.some((candidate) => candidate.type === source.type)) return;
    const insertIndex = sources.findIndex((candidate) => candidate.type === beforeType);
    if (insertIndex < 0) sources.push(source);
    else sources.splice(insertIndex, 0, source);
  }
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
  const NEW_TAB_CACHE_KEY = "jpdb-reader-newtab-card-cache";
  function clearNewTabOfflineCache() {
    return gmStorageDelete(NEW_TAB_CACHE_KEY);
  }
  const RECOMMENDED_JAPANESE_DICTIONARIES = [
    {
      id: "jitendex",
      category: "terms",
      name: "Jitendex",
      descriptionKey: "recommendedJitendex",
      homepage: "https://jitendex.org",
      downloadUrl: "https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip"
    },
    {
      id: "jmdict",
      category: "terms",
      name: "JMdict",
      descriptionKey: "recommendedJmdict",
      homepage: "https://github.com/yomidevs/jmdict-yomitan#jmdict-for-yomitan",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip"
    },
    {
      id: "jmnedict",
      category: "terms",
      name: "JMnedict",
      descriptionKey: "recommendedJmnedict",
      homepage: "https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#jmnedict-for-yomitan",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip"
    },
    {
      id: "wty-ja-ja",
      category: "terms",
      name: "WTY JA-JA",
      descriptionKey: "recommendedWtyJapaneseJapanese",
      homepage: "https://github.com/yomidevs/wiktionary-to-yomitan"
    },
    {
      id: "marvnc-monolingual",
      category: "terms",
      name: "MarvNC JA-JA",
      descriptionKey: "recommendedMarvncMonolingual",
      homepage: "https://github.com/MarvNC/yomitan-dictionaries"
    },
    {
      id: "kanjidic",
      category: "kanji",
      name: "KANJIDIC",
      descriptionKey: "recommendedKanjidic",
      homepage: "https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#kanjidic-for-yomitan",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip"
    },
    {
      id: "jpdbv2-kana",
      category: "frequency",
      name: "JPDBv2㋕",
      descriptionKey: "recommendedJpdbv2Kana",
      homepage: "https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#jpdb-v22-frequency",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip"
    },
    {
      id: "bccwj",
      category: "frequency",
      name: "BCCWJ",
      descriptionKey: "recommendedBccwj",
      homepage: "https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#bccwj-suw-luw-combined",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip"
    },
    {
      id: "jiten",
      category: "frequency",
      name: "Jiten",
      descriptionKey: "recommendedJiten",
      homepage: "https://jiten.moe/other",
      downloadUrl: "https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan"
    }
  ];
  function findRecommendedDictionary(id) {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find((dictionary) => dictionary.id === id);
  }
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
      recommendedWtyJapaneseJapanese: "Monolingual Wiktionary.",
      recommendedMarvncMonolingual: "Monolingual collection.",
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
recommendedWtyJapaneseJapanese	Wiktionary日日辞書。
recommendedMarvncMonolingual	日日辞書集。
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
  function audioSourceLabel(language, type) {
    return uiText(language, AUDIO_SOURCE_LABEL_KEYS[type]);
  }
  function formatUiText(language, key, values) {
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      uiText(language, key)
    );
  }
  const AUDIO_SOURCE_LABEL_KEYS = {
    jpod101: "audioSourceJpod101",
    "language-pod-101": "audioSourceLanguagePod101",
    jisho: "audioSourceJisho",
    "lingua-libre": "audioSourceLinguaLibre",
    wiktionary: "audioSourceWiktionary",
    "jiten-tts": "audioSourceJitenTts",
    "jpdb-tts": "audioSourceJpdbTts",
    "text-to-speech": "audioSourceTextToSpeech",
    "text-to-speech-reading": "audioSourceTextToSpeechReading",
    custom: "audioSourceCustom",
    "custom-json": "audioSourceCustomJson"
  };
  const SETTINGS_DRAWER_HEIGHT_STORAGE_KEY = "jpdb-reader-settings-drawer-height-ratio";
  const DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO = 0.88;
  const MIN_SETTINGS_DRAWER_HEIGHT_PX = 280;
  const SETTINGS_DRAWER_FULL_HEIGHT_THRESHOLD_PX = 12;
  const SETTINGS_DRAWER_TAP_MOVEMENT_PX = 8;
  const SETTINGS_DRAWER_KEYBOARD_STEP_PX = 56;
  function createHandleDragController(options) {
    let state = initialDragState();
    let pointerId = 0;
    let touchId = 0;
    let dragging = false;
    let moved = false;
    let activeInput = null;
    let activeHandle = null;
    let activeCaptureTarget = null;
    const movementDistance = options.movementDistance ?? ((dragState) => Math.hypot(dragState.deltaX, dragState.deltaY));
    const setLastPoint = (point) => {
      state = {
        ...state,
        lastX: point.x,
        lastY: point.y,
        deltaX: point.x - state.startX,
        deltaY: point.y - state.startY
      };
    };
    const updateDrag = (point) => {
      if (!activeHandle) return;
      setLastPoint(point);
      if (movementDistance(state) > options.tapMovementPx) moved = true;
      options.onUpdate?.(state, activeHandle);
    };
    const beginDrag = (handle, point, input2) => {
      if (dragging || activeInput) return false;
      state = {
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        deltaX: 0,
        deltaY: 0
      };
      dragging = true;
      moved = false;
      activeInput = input2;
      activeHandle = handle;
      options.onBegin?.(handle, state, input2);
      return true;
    };
    const finishDrag = () => {
      if (!dragging) return;
      const wasMoved = moved;
      const handle = activeHandle;
      const captureTarget = activeCaptureTarget;
      dragging = false;
      moved = false;
      activeInput = null;
      activeHandle = null;
      activeCaptureTarget = null;
      cleanupListeners();
      releasePointerCapture(captureTarget, pointerId);
      options.onFinish(state, wasMoved, handle);
    };
    function cleanupListeners() {
      if (typeof document === "undefined") return;
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
      document.removeEventListener("touchmove", handleTouchMove, true);
      document.removeEventListener("touchend", handleTouchEnd, true);
      document.removeEventListener("touchcancel", handleTouchCancel, true);
    }
    function cancel() {
      if (!dragging) return;
      const handle = activeHandle;
      const captureTarget = activeCaptureTarget;
      dragging = false;
      moved = false;
      activeInput = null;
      activeHandle = null;
      activeCaptureTarget = null;
      cleanupListeners();
      releasePointerCapture(captureTarget, pointerId);
      options.onCancel?.(state, handle);
    }
    function handlePointerMove(event) {
      if (!dragging || activeInput !== "pointer" || event.pointerId !== pointerId) return;
      consumeDragEvent(event);
      updateDrag({ x: event.clientX, y: event.clientY });
    }
    function handlePointerUp(event) {
      if (!dragging || activeInput !== "pointer" || event.pointerId !== pointerId) return;
      consumeDragEvent(event);
      if (options.updateOnEnd) updateDrag({ x: event.clientX, y: event.clientY });
      else setLastPoint({ x: event.clientX, y: event.clientY });
      finishDrag();
    }
    function handlePointerCancel(event) {
      if (activeInput !== "pointer" || event.pointerId !== pointerId) return;
      cancel();
    }
    function handleTouchMove(event) {
      if (!dragging || activeInput !== "touch") return;
      const touch = changedTouch(event, touchId);
      if (!touch) return;
      consumeDragEvent(event);
      updateDrag({ x: touch.clientX, y: touch.clientY });
    }
    function handleTouchEnd(event) {
      if (!dragging || activeInput !== "touch") return;
      const touch = changedTouch(event, touchId);
      if (!touch) return;
      consumeDragEvent(event);
      if (options.updateOnEnd) updateDrag({ x: touch.clientX, y: touch.clientY });
      else setLastPoint({ x: touch.clientX, y: touch.clientY });
      finishDrag();
    }
    function handleTouchCancel(event) {
      if (activeInput !== "touch" || !changedTouch(event, touchId)) return;
      cancel();
    }
    return {
      isDragging: () => dragging,
      pointerDown(handle, event) {
        if (activeInput) return;
        if (event.button !== void 0 && event.button !== 0) return;
        consumeDragEvent(event);
        if (!beginDrag(handle, { x: event.clientX, y: event.clientY }, "pointer")) return;
        pointerId = event.pointerId;
        activeCaptureTarget = event.target instanceof Element ? event.target : handle;
        setPointerCapture(activeCaptureTarget, event.pointerId);
        document.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
        document.addEventListener("pointerup", handlePointerUp, true);
        document.addEventListener("pointercancel", handlePointerCancel, true);
      },
      touchStart(handle, event) {
        if (activeInput) return;
        const touch = firstChangedTouch(event);
        if (!touch) return;
        consumeDragEvent(event);
        if (!beginDrag(handle, { x: touch.clientX, y: touch.clientY }, "touch")) return;
        touchId = touch.identifier;
        document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
        document.addEventListener("touchend", handleTouchEnd, true);
        document.addEventListener("touchcancel", handleTouchCancel, true);
      },
      cancel,
      cleanupListeners
    };
  }
  function initialDragState() {
    return {
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      deltaX: 0,
      deltaY: 0
    };
  }
  function getContainedClosest(target, root, selector, onFound) {
    if (!(target instanceof Element)) return null;
    const element = target.closest(selector);
    if (!element || !root.contains(element)) return null;
    onFound?.(element);
    return element;
  }
  function consumeDragEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function changedTouch(event, touchId) {
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier === touchId) return touch;
    }
    return null;
  }
  function firstChangedTouch(event) {
    return event.changedTouches.item(0);
  }
  function releasePointerCapture(handle, id) {
    try {
      handle?.releasePointerCapture?.(id);
    } catch {
    }
  }
  function setPointerCapture(handle, id) {
    try {
      handle.setPointerCapture?.(id);
    } catch {
    }
  }
  function addViewportChangeListeners(listener, signal) {
    const options = { passive: true, signal };
    window.addEventListener("resize", listener, options);
    window.addEventListener("orientationchange", listener, options);
    window.visualViewport?.addEventListener?.("resize", listener, options);
    window.visualViewport?.addEventListener?.("scroll", listener, options);
  }
  function installSettingsDrawerHandle(drawer, label = "Resize settings") {
    if (drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled === "true") return;
    drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled = "true";
    let viewportHeight = 0;
    let drawerHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    const isFullHeight = () => viewportHeight > 0 && drawerHeight >= viewportHeight - SETTINGS_DRAWER_FULL_HEIGHT_THRESHOLD_PX;
    const syncHandle = (handle) => {
      handle.setAttribute("role", "separator");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", label);
      handle.setAttribute("aria-orientation", "horizontal");
      handle.setAttribute("aria-valuemin", String(settingsDrawerMinHeight(viewportHeight)));
      handle.setAttribute("aria-valuemax", String(viewportHeight));
      handle.setAttribute("aria-valuenow", String(Math.round(drawerHeight)));
    };
    const syncHandleState = () => {
      drawer.querySelectorAll(".jpdb-reader-settings-drag-handle").forEach(syncHandle);
    };
    const applyDrawerHeight = (height, persist = false) => {
      const nextHeight = clampDrawerHeight(height, viewportHeight, settingsDrawerMinHeight(viewportHeight));
      drawerHeight = nextHeight;
      drawer.style.setProperty("--jpdb-reader-settings-drawer-height", `${Math.round(nextHeight)}px`);
      drawer.classList.toggle("jpdb-reader-settings-drawer-expanded", isFullHeight());
      syncHandleState();
      if (persist) storeHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, nextHeight, viewportHeight);
    };
    const applyViewportSize = () => {
      const previousViewportHeight = viewportHeight;
      const bottomInset = settingsDrawerBottomInset();
      viewportHeight = visualViewportHeight();
      drawer.style.setProperty("--jpdb-reader-settings-drawer-bottom", `${bottomInset}px`);
      drawer.style.setProperty("--jpdb-reader-settings-drawer-viewport-height", `${viewportHeight}px`);
      drawer.style.setProperty("--jpdb-reader-settings-drawer-min-height", `${settingsDrawerMinHeight(viewportHeight)}px`);
      drawer.classList.toggle("jpdb-reader-settings-keyboard-open", bottomInset > 0);
      const ratio = previousViewportHeight > 0 && drawerHeight > 0 ? drawerHeight / previousViewportHeight : readHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO);
      applyDrawerHeight(viewportHeight * ratio);
    };
    const clearDragStyles = () => {
      drawer.classList.remove("jpdb-reader-settings-drawer-resizing");
    };
    const reset = () => {
      drawer.style.transition = "height .16s ease, max-height .16s ease, border-radius .16s ease";
      clearDragStyles();
      window.setTimeout(() => {
        drawer.style.transition = "";
      }, 180);
    };
    const getHandleFromEvent = (event) => getContainedClosest(event, drawer, ".jpdb-reader-settings-drag-handle", syncHandle);
    const drawerDrag = createHandleDragController({
      tapMovementPx: SETTINGS_DRAWER_TAP_MOVEMENT_PX,
      movementDistance: (state) => Math.abs(state.deltaY),
      onBegin: () => {
        startHeight = drawerHeight || restoredSettingsDrawerHeight(viewportHeight);
        rawDragHeight = startHeight;
        drawer.style.transition = "";
        drawer.classList.add("jpdb-reader-settings-drawer-resizing");
      },
      onUpdate: (state) => {
        rawDragHeight = startHeight - state.deltaY;
        applyDrawerHeight(rawDragHeight);
      },
      onFinish: (_state, wasMoved) => {
        const finishHeight = rawDragHeight;
        if (wasMoved) {
          applyDrawerHeight(finishHeight, true);
        }
        reset();
      },
      onCancel: reset
    });
    const handleViewportChange = () => {
      if (drawerDrag.isDragging()) drawerDrag.cancel();
      drawer.style.transition = "";
      applyViewportSize();
      clearDragStyles();
      syncHandleState();
    };
    applyViewportSize();
    syncHandleState();
    const viewportController = new AbortController();
    let disposed = false;
    let disposeObserver;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      drawerDrag.cleanupListeners();
      viewportController.abort();
      disposeObserver?.disconnect();
    };
    disposeObserver = new MutationObserver(() => {
      if (!drawer.isConnected) dispose();
    });
    if (document.documentElement) {
      disposeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    drawer.addEventListener("click", (event) => {
      const handle = getHandleFromEvent(event.target);
      if (!handle) return;
      event.preventDefault();
      event.stopPropagation();
    });
    drawer.addEventListener("pointerdown", (event) => {
      const handle = getHandleFromEvent(event.target);
      if (!handle) return;
      drawerDrag.pointerDown(handle, event);
    });
    drawer.addEventListener("touchstart", (event) => {
      const handle = getHandleFromEvent(event.target);
      if (!handle) return;
      drawerDrag.touchStart(handle, event);
    }, { capture: true, passive: false });
    drawer.addEventListener("keydown", (event) => {
      const handle = getHandleFromEvent(event.target);
      if (!handle) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        applyDrawerHeight(drawerHeight + (event.key === "ArrowUp" ? SETTINGS_DRAWER_KEYBOARD_STEP_PX : -SETTINGS_DRAWER_KEYBOARD_STEP_PX), true);
        reset();
      }
    });
    addViewportChangeListeners(handleViewportChange, viewportController.signal);
  }
  function visualViewportHeight() {
    return Math.max(0, Math.round(window.visualViewport?.height ?? layoutViewportHeight()));
  }
  function settingsDrawerBottomInset() {
    const visual = window.visualViewport;
    if (!visual) return 0;
    const layoutHeight = layoutViewportHeight();
    if (layoutHeight <= 0) return 0;
    return Math.max(0, Math.round(layoutHeight - visual.offsetTop - visual.height));
  }
  function layoutViewportHeight() {
    return Math.max(0, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
  }
  function settingsDrawerMinHeight(viewportHeight) {
    if (viewportHeight <= 0) return MIN_SETTINGS_DRAWER_HEIGHT_PX;
    return Math.min(viewportHeight, MIN_SETTINGS_DRAWER_HEIGHT_PX, Math.max(220, Math.round(viewportHeight * 0.38)));
  }
  function restoredSettingsDrawerHeight(viewportHeight) {
    return clampDrawerHeight(
      viewportHeight * readHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO),
      viewportHeight,
      settingsDrawerMinHeight(viewportHeight)
    );
  }
  function clampDrawerHeight(height, viewportHeight, minHeight) {
    if (viewportHeight <= 0) return Math.max(minHeight, Math.round(height));
    return Math.max(minHeight, Math.min(viewportHeight, Math.round(height)));
  }
  function readHeightRatio(storageKey, fallback) {
    const value = gmStorageGetSync(storageKey, fallback);
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
  }
  function storeHeightRatio(storageKey, height, viewportHeight) {
    if (viewportHeight <= 0) return;
    const ratio = Math.max(0, Math.min(1, height / viewportHeight));
    gmStorageSetSync(storageKey, Number(ratio.toFixed(4)));
  }
  function runningAsBrowserExtension() {
    const global = globalThis;
    try {
      return Boolean(global.chrome?.runtime?.id || global.browser?.runtime?.id);
    } catch {
      return false;
    }
  }
  function externalLinkIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 17 17 7"></path>
        <path d="M9 7h8v8"></path>
    </svg>`;
  }
  function speakerIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
  }
  const SETTINGS_LABEL_TEXT_CLASS = "jpdb-reader-settings-label-text";
  function input(name, label, value, type = "text", attributes = {}) {
    const fieldClass = ["jpdb-reader-settings-field"];
    if (type === "number" || type === "color") fieldClass.push(`jpdb-reader-settings-field-${type}`);
    return `<label class="${fieldClass.join(" ")}">${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"${attributeHtml(attributes)}></label>`;
  }
  function shortcutInput(name, label, value, placeholder = "Press keys") {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none" aria-label="${escapeHtml(label)}"></label>`;
  }
  function checkbox(name, label, checked, attributes = {}) {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}${booleanAttributeHtml(attributes)}>${label}</label>`;
  }
  function select(name, label, value, options) {
    return `<label>${label}<select name="${name}">${options.map(
      ([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(text)}</option>`
    ).join("")}</select></label>`;
  }
  function radioGroup(name, label, value, options) {
    return `<fieldset class="jpdb-reader-radio-group"><legend>${label}</legend>${options.map(
      ([optionValue, text]) => `<label class="inline"><input name="${name}" type="radio" value="${escapeHtml(optionValue)}" ${optionValue === value ? "checked" : ""}>${escapeHtml(text)}</label>`
    ).join("")}</fieldset>`;
  }
  function settingsTabButton(panel, label, active = false) {
    return `<button class="jpdb-reader-settings-tab" type="button" role="tab" data-action="settings-panel" data-panel="${escapeHtml(panel)}" aria-controls="${settingsTabControls(panel)}" aria-selected="${active ? "true" : "false"}" tabindex="${active ? "0" : "-1"}">${escapeHtml(label)}</button>`;
  }
  function miniIcon(name) {
    const paths = {
      drag: '<path d="M9 5h.01"></path><path d="M15 5h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 19h.01"></path><path d="M15 19h.01"></path>',
      up: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
      down: '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>',
      remove: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  }
  function settingsTabControls(panel) {
    return {
      api: "jpdb-reader-settings-panel-api",
      newTab: "jpdb-reader-settings-panel-newtab",
      appearance: "jpdb-reader-settings-panel-appearance jpdb-reader-settings-panel-reader",
      reading: "jpdb-reader-settings-panel-reader jpdb-reader-settings-panel-kanji",
      dictionaries: "jpdb-reader-settings-panel-dictionaries jpdb-reader-settings-panel-kanji",
      media: "jpdb-reader-settings-panel-audio jpdb-reader-settings-panel-immersion-kit jpdb-reader-settings-panel-ocr jpdb-reader-settings-panel-video jpdb-reader-settings-panel-youtube",
      mining: "jpdb-reader-settings-panel-mining",
      shortcuts: "jpdb-reader-settings-panel-shortcuts",
      help: "jpdb-reader-settings-panel-help"
    }[panel] ?? "jpdb-reader-settings-panel-api";
  }
  function attributeHtml(attributes) {
    return Object.entries(attributes).map(([key, attributeValue]) => ` ${key}="${escapeHtml(String(attributeValue))}"`).join("");
  }
  function booleanAttributeHtml(attributes) {
    return Object.entries(attributes).filter(([, value]) => value).map(([key]) => ` ${key}`).join("");
  }
  function updateSourceRowEditor(action, control) {
    const row = control?.closest("[data-source-row]");
    const container = row?.closest("[data-source-editor]");
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll("[data-source-row]"));
    const index = rows.indexOf(row);
    const targetIndex = action === "dictionary-source-up" ? index - 1 : index + 1;
    moveSourceRow(container, index, targetIndex);
  }
  function installSourceRowDrag(root) {
    let drag = null;
    const dragDocument = root.ownerDocument;
    root.addEventListener("pointerdown", (event) => {
      if (drag) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const handle = event.target.closest("[data-source-drag-handle]");
      if (!handle || !root.contains(handle)) return;
      const row = handle.closest("[data-source-row]");
      const container = row?.closest("[data-source-editor]");
      if (!row || !container) return;
      event.preventDefault();
      setSourceRowPointerCapture(handle, event.pointerId);
      drag = { active: false, container, handle, pointerId: event.pointerId, row, startY: event.clientY };
      row.classList.add("jpdb-reader-order-row-drag-pending");
      dragDocument.addEventListener("pointermove", moveDrag);
      dragDocument.addEventListener("pointerup", finishDrag);
      dragDocument.addEventListener("pointercancel", finishDrag);
    });
    const moveDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.active && Math.abs(event.clientY - drag.startY) < 4) return;
      event.preventDefault();
      drag.active = true;
      drag.row.classList.add("jpdb-reader-order-row-dragging");
      moveSourceRowToPointer(drag.container, drag.row, event.clientY);
    };
    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      releaseSourceRowPointerCapture(drag.handle, event.pointerId);
      drag.row.classList.remove("jpdb-reader-order-row-drag-pending", "jpdb-reader-order-row-dragging");
      syncSourceRowOrder(drag.container);
      drag = null;
      dragDocument.removeEventListener("pointermove", moveDrag);
      dragDocument.removeEventListener("pointerup", finishDrag);
      dragDocument.removeEventListener("pointercancel", finishDrag);
    };
    root.addEventListener("pointermove", moveDrag);
    root.addEventListener("pointerup", finishDrag);
    root.addEventListener("pointercancel", finishDrag);
  }
  function moveSourceRow(container, index, targetIndex) {
    const rows = Array.from(container.querySelectorAll("[data-source-row]"));
    if (!canMoveSourceRow(index, targetIndex, rows.length)) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncSourceRowOrder(container);
  }
  function setSourceRowPointerCapture(handle, pointerId) {
    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
    }
  }
  function releaseSourceRowPointerCapture(handle, pointerId) {
    try {
      handle.releasePointerCapture?.(pointerId);
    } catch {
    }
  }
  function moveSourceRowToPointer(container, row, clientY) {
    const rows = Array.from(container.querySelectorAll("[data-source-row]")).filter((candidate) => candidate !== row);
    const target = rows.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    if (target) container.insertBefore(row, target);
    else container.appendChild(row);
    syncSourceRowOrder(container);
  }
  function canMoveSourceRow(index, targetIndex, rowCount) {
    return index >= 0 && targetIndex >= 0 && index < rowCount && targetIndex < rowCount && index !== targetIndex;
  }
  function syncSourceRowOrder(container) {
    const rows = Array.from(container.querySelectorAll("[data-source-row]"));
    rows.forEach((row, index) => {
      const priority = row.querySelector('input[name$=".priority"]');
      if (priority) priority.value = String(index);
      const indexLabel = row.querySelector(".jpdb-reader-order-toggle span");
      if (indexLabel) indexLabel.textContent = String(index + 1);
    });
    if (container.matches("[data-audio-source-editor]")) syncAudioSourceIndexes(container, rows);
    if (container.classList.contains("jpdb-reader-lookup-links")) syncDictionaryLookupLinkIndexes(container, rows);
  }
  function syncAudioSourceIndexes(container, rows = Array.from(container.querySelectorAll("[data-audio-source-row]"))) {
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
      row.dataset.sourceId = `audio-${index}`;
      row.querySelectorAll('[name^="audioSources."]').forEach((control) => {
        control.name = control.name.replace(/^audioSources\.\d+\./, `audioSources.${index}.`);
        if (control instanceof HTMLSelectElement && control.name.endsWith(".type")) {
          control.setAttribute("aria-label", uiText(language, "audioSourceNumber").replace("{number}", String(index + 1)));
        }
        if (control instanceof HTMLInputElement && control.name.endsWith(".enabled")) {
          control.setAttribute("aria-label", uiText(language, "enableAudioSourceNumber").replace("{number}", String(index + 1)));
        }
        if (control instanceof HTMLSelectElement && control.name.endsWith(".voice")) {
          control.setAttribute("aria-label", uiText(language, "textToSpeechVoiceNumber").replace("{number}", String(index + 1)));
        }
      });
    });
  }
  function syncDictionaryLookupLinkIndexes(container, rows = Array.from(container.querySelectorAll("[data-lookup-link-row]"))) {
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
      row.dataset.index = String(index);
      row.dataset.sourceId = `lookup-link-${index}`;
      row.querySelectorAll('[name^="dictionaryLookupLinks."]').forEach((control) => {
        control.name = control.name.replace(/^dictionaryLookupLinks\.\d+\./, `dictionaryLookupLinks.${index}.`);
        if (control.name.endsWith(".label")) control.setAttribute("aria-label", uiText(language, "lookupPillLabelNumber").replace("{number}", String(index + 1)));
        if (control.name.endsWith(".urlTemplate")) control.setAttribute("aria-label", uiText(language, "lookupUrlTemplateNumber").replace("{number}", String(index + 1)));
      });
    });
  }
  function settingsLanguageForElement(element) {
    const control = element.closest("form")?.elements.namedItem("interfaceLanguage");
    const value = control instanceof HTMLSelectElement ? control.value : "en";
    return value === "auto" || value === "en" || value === "ja" ? value : "en";
  }
  function createSettingsFormReader(data, colorSource) {
    const get = (key) => String(data.get(key) ?? "");
    const getAll = (key) => data.getAll(key).map((value) => String(value));
    const number = (key, fallback) => readNumber(get(key), fallback);
    return {
      get,
      getAll,
      has: (key) => data.has(key),
      number,
      clamped: (key, min, max, fallback) => Math.max(min, Math.min(max, number(key, fallback))),
      colorSource
    };
  }
  function readNumber(value, fallback) {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  const log$3 = Logger.scope("SettingsForm");
  const CUSTOM_FONT_FAMILY_VALUE = "__custom_font_family__";
  const COLOR_SOURCE_VALUES = ["status", "jpdb", "anki", "pitch", "off"];
  const COLOR_SOURCE_OPTIONS = [
    ["status", "JPDB + Anki status"],
    ["jpdb", "JPDB status"],
    ["anki", "Anki status"],
    ["pitch", "Pitch accent"],
    ["off", "Off"]
  ];
  const DEFAULT_COLOR_SOURCE_VALUES = {
    wordHighlightColorSource: "jpdb",
    wordUnderlineColorSource: "pitch",
    wordTextColorSource: "anki",
    subtitleHighlightColorSource: "jpdb",
    subtitleUnderlineColorSource: "pitch",
    subtitleTextColorSource: "anki"
  };
  const ACCENT_COLOR_SETTING_NAMES = [
    "accentColor",
    "wordColorNew",
    "wordColorLearning",
    "wordColorKnown",
    "wordColorDue",
    "wordColorFailed",
    "wordColorIgnored",
    "pitchColorHeiban",
    "pitchColorAtamadaka",
    "pitchColorNakadaka",
    "pitchColorOdaka",
    "pitchColorKifuku",
    "pitchColorUnknown"
  ];
  const COLOR_SOURCE_SETTING_NAMES = [
    "wordHighlightColorSource",
    "wordUnderlineColorSource",
    "wordTextColorSource",
    "subtitleHighlightColorSource",
    "subtitleUnderlineColorSource",
    "subtitleTextColorSource"
  ];
  const SHORTCUT_SETTING_NAMES = [
    "scanPage",
    "hoverLookup",
    "massReviewVisible",
    "openSettings",
    "playAudio",
    "closePopup",
    "previousLookupWord",
    "nextLookupWord",
    "previousSubtitle",
    "nextSubtitle",
    "copySubtitle",
    "toggleOcr",
    "toggleSubtitleOverlay",
    "toggleYoutubeImmersion",
    "scanImages",
    "studyReveal",
    "studyRevealAlternate",
    "studyUndo",
    "studyPrevious",
    "studyPreviousAlternate",
    "studyNext",
    "studyNextAlternate",
    "gradeNothing",
    "gradeSomething",
    "gradeHard",
    "gradeOkay",
    "gradeEasy",
    "gradeFail",
    "gradePass"
  ];
  const KANJI_ADDON_SOURCE_ROWS = [
    ["jpdbKanji", "jpdbKanjiEnabled", "jpdbKanjiPriority"],
    ["kanjiImmersionKit", "kanjiImmersionKitEnabled", "kanjiImmersionKitPriority"],
    ["uchisen", "uchisenEnabled", "uchisenPriority"],
    ["rtk", "rtkEnabled", "rtkPriority"],
    ["kanjivg", "kanjivgEnabled", "kanjivgPriority"],
    ["kanjiOrigins", "kanjiOriginsEnabled", "kanjiOriginsPriority"]
  ];
  function settingsColorSourceValue(settings, name) {
    const source = settings[name];
    return source === "auto" ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
  }
  function colorSourceOptions(settings) {
    const apiLabel = combinedApiCredentialLabel(settings);
    return COLOR_SOURCE_OPTIONS.map(([value, label]) => [
      value,
      value === "status" ? `${apiLabel} + Anki status` : value === "jpdb" ? `${apiLabel} status` : label
    ]);
  }
  function readFormSettings(data, current) {
    const colorSource = (key, fallback) => readOption(String(data.get(key) ?? ""), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader = createSettingsFormReader(data, colorSource);
    const { get, has } = reader;
    const audioSources = readAudioSources(data);
    const furiganaMode = readOption(get("furiganaMode"), ["all", "difficult-kanji", "known-status", "hover", "off"], current.furiganaMode === "auto" ? DEFAULT_SETTINGS.furiganaMode : current.furiganaMode);
    const apiDefinitionRowsPresent = {
      jpdb: hasSourceRow(has, "jpdbDefinitions"),
      jiten: hasSourceRow(has, "jitenDefinitions")
    };
    const dictionaryPreferences = readDictionaryPreferences$1(data, current.dictionaryPreferences, reader);
    const kanjiDictionaryPreferences = dictionaryPreferences.filter((preference) => preference.type === "kanji");
    const apiCredentials = readApiCredentialsFromFormData(data);
    const settings = {
      ...current,
      ...apiCredentials,
      interfaceLanguage: readOption(get("interfaceLanguage"), ["auto", "en", "ja"], current.interfaceLanguage),
      ...readApiDefinitionFormSettings(reader, current, apiDefinitionRowsPresent),
      ...readKanjiAddonFormSettings(reader, current),
      ...readAudioFormSettings(reader, current, audioSources),
      ...readColorFormSettings(reader, current),
      ...readImmersionKitFormSettings(reader, current),
      ...readLookupBehaviorFormSettings(reader, current),
      ...readNewTabFormSettings(reader, current),
      ...readReadingDisplayFormSettings(reader, furiganaMode),
      ...readOcrFormSettings(reader, current),
      ...readLocalDictionaryFormSettings(reader, current, kanjiDictionaryPreferences),
      dictionaryPreferences,
      dictionaryLookupLinks: readDictionaryLookupLinks(data),
      ...readSubtitleFormSettings(reader, current),
      ...readYoutubeFormSettings(reader),
      ...readAnkiFormSettings(reader, current),
      ...readStudyToolFormSettings(reader, current),
      enableLogging: has("enableLogging"),
      ...readPopupFormSettings(reader, current),
      ...readMiningFormSettings(reader),
      shortcuts: readShortcutFormSettings(reader, current)
    };
    const normalized = normalizeReaderSettings(settings);
    log$3.info("Read settings form data", {
      enableLogging: normalized.enableLogging,
      dictionaries: normalized.dictionaryPreferences.length,
      lookupLinks: normalized.dictionaryLookupLinks.length,
      audioSources: normalized.audioSources.length,
      ocrEnabled: normalized.ocrEnabled,
      subtitlePlayerEnabled: normalized.subtitlePlayerEnabled,
      ankiEnabled: normalized.ankiEnabled
    });
    return normalized;
  }
  function colorSourceFallback(key, fallback) {
    if (fallback !== "auto") return fallback;
    return isColorSourceSettingName(key) ? DEFAULT_COLOR_SOURCE_VALUES[key] : "jpdb";
  }
  function isColorSourceSettingName(value) {
    return Object.prototype.hasOwnProperty.call(DEFAULT_COLOR_SOURCE_VALUES, value);
  }
  function hasSourceRow(has, prefix) {
    return has(`${prefix}.name`) || has(`${prefix}.priority`) || has(`${prefix}.enabled`);
  }
  function readApiDefinitionFormSettings(reader, current, rowsPresent) {
    const { has, clamped } = reader;
    const jpdbPageEnhancementsEnabled = has("jpdbPageEnhancementsEnabled");
    return {
      jpdbDefinitionsEnabled: true,
      jpdbDefinitionsPriority: clamped("jpdbDefinitions.priority", 0, 999, current.jpdbDefinitionsPriority),
      jitenDefinitionsEnabled: rowsPresent.jiten ? has("jitenDefinitions.enabled") : current.jitenDefinitionsEnabled,
      jitenDefinitionsPriority: clamped("jitenDefinitions.priority", 0, 999, current.jitenDefinitionsPriority),
      jpdbPageEnhancementsEnabled,
      jpdbPageWordEnhancementsEnabled: jpdbPageEnhancementsEnabled && has("jpdbPageWordEnhancementsEnabled"),
      jpdbPageKanjiEnhancementsEnabled: jpdbPageEnhancementsEnabled && has("jpdbPageKanjiEnhancementsEnabled")
    };
  }
  function readKanjiAddonFormSettings(reader, current) {
    const { has, clamped } = reader;
    return {
      ...readSourcePriorityRows(reader, current, KANJI_ADDON_SOURCE_ROWS),
      kanjiOriginKanjiMapEnabled: has("kanjiOriginKanjiMapEnabled"),
      kanjiOriginGraphEnabled: has("kanjiOriginGraphEnabled"),
      kanjiOriginRadicalImagesEnabled: has("kanjiOriginRadicalImagesEnabled"),
      similarKanjiWords: has("similarKanjiWords.enabled"),
      similarKanjiWordsPriority: clamped("similarKanjiWords.priority", 0, 999, current.similarKanjiWordsPriority),
      similarKanjiWordLimit: clamped("similarKanjiWordLimit", 2, 24, current.similarKanjiWordLimit)
    };
  }
  function readSourcePriorityRows(reader, current, rows) {
    const settings = {};
    const out = settings;
    for (const [rowName, enabledKey, priorityKey] of rows) {
      out[enabledKey] = reader.has(`${rowName}.enabled`);
      out[priorityKey] = reader.clamped(`${rowName}.priority`, 0, 999, Number(current[priorityKey]));
    }
    return settings;
  }
  function readAudioFormSettings(reader, current, audioSources) {
    const { get, has, clamped } = reader;
    const audioAutoPlayMode = readOption(get("audioAutoPlayMode"), ["off", "all", "hover", "tap"], current.audioAutoPlayMode);
    return {
      audioEnabled: has("audioEnabled"),
      autoPlayAudio: has("autoPlayAudio") && audioAutoPlayMode !== "off",
      suppressAutoAudioOnVideo: has("suppressAutoAudioOnVideo"),
      audioAutoPlayMode,
      audioSources,
      audioEnableDefaultSources: has("audioEnableDefaultSources"),
      audioSourceUrl: audioSources.find((source) => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
      audioViaBlob: current.audioViaBlob,
      audioFallbackChimeEnabled: has("audioFallbackChimeEnabled"),
      audioTimeoutMs: clamped("audioTimeoutMs", 1e3, 3e4, current.audioTimeoutMs),
      audioSelectionMode: readOption(get("audioSelectionMode"), ["first", "random"], current.audioSelectionMode),
      audioTtsMode: readOption(get("audioTtsMode"), ["fallback", "source-order"], current.audioTtsMode)
    };
  }
  function readColorFormSettings(reader, current) {
    return {
      ...readAccentColorSettings(reader, current),
      ...readColorSourceSettings(reader, current)
    };
  }
  function readAccentColorSettings(reader, current) {
    const settings = {};
    ACCENT_COLOR_SETTING_NAMES.forEach((name) => {
      settings[name] = sanitizeAccentColor(reader.get(name), current[name]);
    });
    return settings;
  }
  function readColorSourceSettings(reader, current) {
    const settings = {};
    COLOR_SOURCE_SETTING_NAMES.forEach((name) => {
      settings[name] = reader.colorSource(name, current[name]);
    });
    return settings;
  }
  function readLookupBehaviorFormSettings(reader, current) {
    const { has, clamped } = reader;
    return {
      parseSelection: has("parseSelection"),
      lookupOnClick: has("lookupOnClick"),
      lookupOnHover: has("lookupOnHover"),
      lookupOnMiddleMouse: has("lookupOnMiddleMouse"),
      hoverOpenDelayMs: clamped("hoverOpenDelayMs", 0, 1500, current.hoverOpenDelayMs),
      hoverCloseDelayMs: clamped("hoverCloseDelayMs", 0, 3e3, current.hoverCloseDelayMs),
      popupActivationMode: current.popupActivationMode,
      scanModifierKey: current.scanModifierKey,
      showFloatingButton: has("showFloatingButton")
    };
  }
  function readNewTabFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    return {
      // UT-74: the control only renders in extension builds (userscripts
      // can't override the browser new tab) — read it there, preserve the
      // stored value everywhere else.
      newTabEnabled: runningAsBrowserExtension() ? has("newTabEnabled") : current.newTabEnabled,
      newTabAnkiEnabled: has("newTabAnkiEnabled"),
      newTabAnkiDisabledDecks: get("newTabAnkiDisabledDecks").split(",").map((deck) => deck.trim()).filter(Boolean),
      newTabSource: readOption(get("newTabSource"), ["auto", "jpdb", "anki", "dictionary"], current.newTabSource),
      newTabJpdbDeck: get("newTabJpdbDeck").trim() || current.newTabJpdbDeck,
      newTabJpdbReviewMode: readOption(get("newTabJpdbReviewMode"), ["auto", "api-vocabulary", "live-review"], current.newTabJpdbReviewMode),
      corsProxyUrl: get("corsProxyUrl").trim(),
      newTabKanjiKeywordSource: readOption(get("newTabKanjiKeywordSource"), ["auto", "rtk", "jpdb", "local"], current.newTabKanjiKeywordSource),
      newTabParsingEnabled: has("newTabParsingEnabled"),
      newTabFrontSentenceEnabled: has("newTabFrontSentenceEnabled"),
      newTabOfflineEnabled: has("newTabOfflineEnabled"),
      newTabOfflineLimit: clamped("newTabOfflineLimit", 0, 500, current.newTabOfflineLimit),
      newTabDailyGoalMinutes: clamped("newTabDailyGoalMinutes", 0, 1440, current.newTabDailyGoalMinutes),
      newTabKanjiUnlockEnabled: has("newTabKanjiUnlockEnabled"),
      newTabStopAtBatchEnd: has("newTabStopAtBatchEnd"),
      newTabSwipeReviews: has("newTabSwipeReviews"),
      newTabKanjiAutogradeEnabled: has("newTabKanjiAutogradeEnabled"),
      newTabKanjiAutoSubmit: has("newTabKanjiAutoSubmit")
    };
  }
  function readReadingDisplayFormSettings(reader, furiganaMode) {
    const { has } = reader;
    const { get } = reader;
    return {
      showFurigana: furiganaMode !== "off",
      furiganaMode,
      furiganaHiddenStateGroups: ["new", "learning", "known", "due", "failed"].filter((group) => has(`furiganaHide-${group}`)),
      wordColorStates: readOption(get("wordColorStates"), ["all", "new-only"], "all"),
      showPitchAccent: has("showPitchAccent"),
      suppressRedundantWordUi: has("suppressRedundantWordUi"),
      sheetCloseButtonOnLeft: has("sheetCloseButtonOnLeft"),
      hideKnownFurigana: furiganaMode === "known-status"
    };
  }
  function readLocalDictionaryFormSettings(reader, current, kanjiPreferences) {
    const { has, clamped } = reader;
    return {
      localDictionariesEnabled: true,
      localDictionaryShowKanji: has("kanjiDictionaries.enabled") || kanjiPreferences.some((preference) => preference.enabled),
      kanjiDictionariesPriority: clamped("kanjiDictionaries.priority", 0, 999, current.kanjiDictionariesPriority),
      dictionarySourcesInitiallyExpanded: true,
      localDictionaryMaxResults: DEFAULT_SETTINGS.localDictionaryMaxResults
    };
  }
  function readAnkiFormSettings(reader, current) {
    const { get, has } = reader;
    const ankiEnabled = has("ankiEnabled");
    return {
      ankiEnabled,
      ...readAnkiSectionFormSettings(reader, current, ankiEnabled),
      ankiConnectUrl: get("ankiConnectUrl").trim() || current.ankiConnectUrl,
      ankiDeck: get("ankiDeck").trim() || current.ankiDeck,
      ankiModel: get("ankiModel").trim() || current.ankiModel,
      ankiTemplateMode: readOption(get("ankiTemplateMode"), ["recognition", "context"], current.ankiTemplateMode),
      ankiFrontReading: has("ankiFrontReading"),
      ankiFrontSentence: has("ankiFrontSentence"),
      ankiFrontImage: has("ankiFrontImage"),
      ankiFieldMappings: readAnkiFieldMappings(get("ankiFieldMappings"), current.ankiFieldMappings),
      ankiTags: get("ankiTags").trim(),
      ankiMineWithJpdb: has("ankiMineWithJpdb"),
      ankiCaptureScreenshot: has("ankiCaptureScreenshot"),
      ankiMobileHandoff: has("ankiMobileHandoff")
    };
  }
  function readAnkiSectionFormSettings(reader, current, ankiEnabled) {
    if (!ankiSectionRowPresent(reader)) {
      return {
        ankiSectionEnabled: current.ankiSectionEnabled,
        ankiSectionPriority: current.ankiSectionPriority
      };
    }
    return {
      ankiSectionEnabled: reader.has("ankiSection.enabled") || shouldAutoEnableAnkiSection(ankiEnabled, current),
      ankiSectionPriority: reader.clamped("ankiSection.priority", 0, 999, current.ankiSectionPriority)
    };
  }
  function ankiSectionRowPresent(reader) {
    return formReaderValuePresent(reader, "ankiSection.name") || formReaderValuePresent(reader, "ankiSection.priority") || reader.has("ankiSection.enabled");
  }
  function formReaderValuePresent(reader, name) {
    return Boolean(reader.get(name));
  }
  function shouldAutoEnableAnkiSection(ankiEnabled, current) {
    return ankiEnabled && !current.ankiEnabled && !current.ankiSectionEnabled;
  }
  function readAnkiFieldMappings(value, fallback) {
    if (!value.trim()) return fallback;
    try {
      const parsed = JSON.parse(value);
      return normalizeAnkiFieldMappings(parsed);
    } catch {
      return fallback;
    }
  }
  function readStudyToolFormSettings(reader, current) {
    const { has, clamped } = reader;
    return {
      studyTranslationEnabled: has("studyTranslation.enabled"),
      studyTranslationPriority: clamped("studyTranslation.priority", 0, 999, current.studyTranslationPriority),
      studyGrammarEnabled: has("studyGrammar.enabled"),
      studyGrammarPriority: clamped("studyGrammar.priority", 0, 999, current.studyGrammarPriority)
    };
  }
  function readPopupFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    const popupMode = readOption(get("popupMode"), ["auto", "sheet", "popover"], current.popupMode);
    return {
      theme: readOption(get("theme"), ["auto", "dark", "light"], current.theme),
      popupMode,
      stickyBottomSheet: has("stickyBottomSheet"),
      popoverBackdropEnabled: has("popoverBackdropEnabled"),
      popoverWidth: clamped("popoverWidth", 280, 900, current.popoverWidth),
      popoverHeight: clamped("popoverHeight", 220, 900, current.popoverHeight),
      popoverHeightMode: readOption(get("popoverHeightMode"), ["available", "fixed"], current.popoverHeightMode),
      readerFontFamily: readFontFamilySetting(reader, "readerFontFamily", current.readerFontFamily),
      popupFontFamily: readFontFamilySetting(reader, "popupFontFamily", current.popupFontFamily),
      popupFontWeight: clamped("popupFontWeight", 300, 900, current.popupFontWeight)
    };
  }
  function readFontFamilySetting(reader, name, fallback) {
    const value = reader.get(name).trim();
    if (value === CUSTOM_FONT_FAMILY_VALUE) return reader.get(`${name}Custom`).trim() || fallback;
    return value || fallback;
  }
  function readMiningFormSettings(reader) {
    const { get, has } = reader;
    return {
      jpdbMiningEnabled: has("jpdbMiningEnabled"),
      autoMineOnReview: has("autoMineOnReview"),
      miningDeck: get("miningDeck").trim() || "forq",
      neverForgetDeck: get("neverForgetDeck").trim() || "never-forget",
      blacklistDeck: get("blacklistDeck").trim() || "blacklist",
      addToForq: has("addToForq"),
      enableReviews: has("enableReviews"),
      twoButtonReviews: get("twoButtonReviews") === "true"
    };
  }
  function readOcrFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    return {
      ocrEnabled: has("ocrEnabled"),
      ocrAutoScanImages: formReaderValuePresent(reader, "ocrAutoScanImages") ? has("ocrAutoScanImages") : current.ocrAutoScanImages,
      ocrShowTextOverlay: has("ocrShowTextOverlay"),
      ocrVideoPauseFrames: has("ocrVideoPauseFrames"),
      ocrVideoFrameStatusCard: has("ocrVideoFrameStatusCard"),
      ocrProvider: normalizeOcrProvider(get("ocrProvider")),
      ocrEndpointUrl: get("ocrEndpointUrl").trim(),
      ocrEngine: get("ocrEngine").trim() || "auto",
      ocrCloudVisionApiKey: get("ocrCloudVisionApiKey").trim(),
      ocrLanguage: get("ocrLanguage").trim() || "ja-JP",
      ocrMaxImagePixels: clamped("ocrMaxImagePixels", 16e4, 28e5, current.ocrMaxImagePixels),
      ocrMinImageArea: clamped("ocrMinImageArea", 1e4, 8e5, current.ocrMinImageArea),
      ocrMaxImagesPerPage: clamped("ocrMaxImagesPerPage", 1, 30, current.ocrMaxImagesPerPage),
      ocrPrefetchMargin: clamped("ocrPrefetchMargin", 0, 3e3, current.ocrPrefetchMargin),
      ocrTextColor: sanitizeAccentColor(get("ocrTextColor"), current.ocrTextColor),
      ocrOutlineColor: sanitizeAccentColor(get("ocrOutlineColor"), current.ocrOutlineColor),
      ocrBackgroundColor: sanitizeAccentColor(get("ocrBackgroundColor"), current.ocrBackgroundColor),
      ocrBackgroundOpacity: clamped("ocrBackgroundOpacity", 0, 1, current.ocrBackgroundOpacity),
      ocrFontScale: clamped("ocrFontScale", 0.7, 1.8, current.ocrFontScale)
    };
  }
  function readSubtitleFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    return {
      subtitlePlayerEnabled: has("subtitlePlayerEnabled"),
      subtitleAutoDetect: has("subtitleAutoDetect"),
      subtitleOverlayVisible: has("subtitleOverlayVisible"),
      subtitleSecondaryVisible: has("subtitleSecondaryVisible"),
      subtitleNativeBlurred: has("subtitleNativeBlurred"),
      subtitleKaraokeMode: has("subtitleKaraokeMode"),
      subtitleTranscriptVisible: has("subtitleTranscriptVisible"),
      subtitlePausePanel: has("subtitlePausePanel"),
      subtitleTranscriptPlacement: readOption(get("subtitleTranscriptPlacement"), ["right", "left", "bottom"], current.subtitleTranscriptPlacement),
      subtitleTranscriptAutoScroll: has("subtitleTranscriptAutoScroll"),
      subtitleTranscriptAutoScrollResumeSeconds: clamped("subtitleTranscriptAutoScrollResumeSeconds", 1, 30, current.subtitleTranscriptAutoScrollResumeSeconds),
      subtitleAutoCopyLine: has("subtitleAutoCopyLine"),
      subtitleCopyIncludeTranslation: has("subtitleCopyIncludeTranslation"),
      subtitleControlsMode: readOption(get("subtitleControlsMode"), ["auto", "always", "hidden"], current.subtitleControlsMode),
      subtitleFontSize: clamped("subtitleFontSize", 16, 64, current.subtitleFontSize),
      subtitleBottomOffset: clamped("subtitleBottomOffset", 2, 40, current.subtitleBottomOffset),
      subtitleTextColor: sanitizeAccentColor(get("subtitleTextColor"), current.subtitleTextColor),
      subtitleOutlineColor: sanitizeAccentColor(get("subtitleOutlineColor"), current.subtitleOutlineColor),
      subtitleBackgroundColor: sanitizeAccentColor(get("subtitleBackgroundColor"), current.subtitleBackgroundColor),
      subtitleBackgroundOpacity: clamped("subtitleBackgroundOpacity", 0, 1, current.subtitleBackgroundOpacity),
      subtitleFontFamily: readFontFamilySetting(reader, "subtitleFontFamily", current.subtitleFontFamily),
      subtitleFontWeight: clamped("subtitleFontWeight", 100, 900, current.subtitleFontWeight),
      subtitleMiningPause: has("subtitleMiningPause"),
      subtitleSeekPadding: clamped("subtitleSeekPadding", -2, 2, current.subtitleSeekPadding)
    };
  }
  function readImmersionKitFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    const mediaEnabled = has("immersionKitEnabled");
    const sourceRowPresent = Boolean(get("immersionKit.name") || get("immersionKit.priority"));
    const sourceEnabled = sourceRowPresent ? has("immersionKit.enabled") : true;
    return {
      immersionKitEnabled: mediaEnabled && sourceEnabled,
      immersionKitExampleSource: readOption(get("immersionKitExampleSource"), ["immersion-kit", "nadeshiko", "combined"], current.immersionKitExampleSource),
      nadeshikoApiKey: get("nadeshikoApiKey").trim(),
      immersionKitPriority: clamped("immersionKit.priority", 0, 999, current.immersionKitPriority),
      immersionKitLimitEnabled: get("immersionKitLimitEnabled") === "on",
      immersionKitLimit: clamped("immersionKitLimit", 1, 12, current.immersionKitLimit),
      immersionKitMinLength: clamped("immersionKitMinLength", 0, 120, current.immersionKitMinLength),
      immersionKitMaxLength: clamped("immersionKitMaxLength", 0, 240, current.immersionKitMaxLength),
      immersionKitCategory: readOption(get("immersionKitCategory"), ["all", "anime", "drama", "games"], current.immersionKitCategory),
      immersionKitSort: readOption(get("immersionKitSort"), ["sentence_length:asc", "sentence_length:desc"], current.immersionKitSort),
      immersionKitExactMatch: has("immersionKitExactMatch"),
      immersionKitShowTranslation: has("immersionKitShowTranslation"),
      immersionKitRevealTranslationOnClick: has("immersionKitShowTranslation") && has("immersionKitRevealTranslationOnClick"),
      immersionKitShowImages: has("immersionKitShowImages"),
      immersionKitAutoPlayAudio: has("immersionKitAutoPlayAudio"),
      immersionKitPlayOnHover: has("immersionKitPlayOnHover"),
      immersionKitPlayOnImageClick: has("immersionKitPlayOnImageClick"),
      immersionKitPlaybackRate: clamped("immersionKitPlaybackRate", 0.5, 2, current.immersionKitPlaybackRate)
    };
  }
  function readYoutubeFormSettings(reader) {
    const { has } = reader;
    return {
      youtubeImmersionEnabled: has("youtubeImmersionEnabled"),
      preferJapaneseSiteLanguage: has("preferJapaneseSiteLanguage"),
      youtubeShowChannelRecommendations: has("youtubeShowChannelRecommendations"),
      youtubeShowFilterNotice: has("youtubeShowFilterNotice")
    };
  }
  function readShortcutFormSettings(reader, current) {
    return Object.fromEntries(SHORTCUT_SETTING_NAMES.map((name) => {
      const key = `shortcuts.${name}`;
      return [name, reader.has(key) ? readShortcutFormValue(reader, key, current.shortcuts[name]) : current.shortcuts[name]];
    }));
  }
  function readShortcutFormValue(reader, key, currentValue) {
    const values = reader.getAll(key);
    if (!values.length) return currentValue;
    const changedValues = Array.from(new Set(values.filter((value) => value !== currentValue)));
    if (changedValues.length === 1) return changedValues[0] ?? "";
    return values.at(-1) ?? "";
  }
  function readOption(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }
  function readDictionaryPreferences$1(data, current, reader) {
    const get = (key) => String(data.get(key) ?? "");
    const count = Math.max(0, Number(get("dictionaryPreferenceCount")) || 0);
    if (!count) return current;
    return Array.from({ length: count }, (_, index) => ({
      name: get(`dictionaryPreferences.${index}.name`).trim(),
      alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
      enabled: data.has(`dictionaryPreferences.${index}.enabled`),
      priority: reader.number(`dictionaryPreferences.${index}.priority`, index),
      type: readDictionaryType(get(`dictionaryPreferences.${index}.type`))
    })).filter((item) => item.name).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }
  function readDictionaryType(value) {
    return value === "kanji" || value === "frequency" || value === "metadata" ? value : "terms";
  }
  function readAudioSources(data) {
    const get = (key) => String(data.get(key) ?? "");
    const count = Math.max(0, Number(get("audioSourceCount")) || 0);
    const sources = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map((source) => source.type));
    for (let index = 0; index < count; index++) {
      const source = readAudioSourceRow(data, get, index);
      if (!source || shouldSkipAudioSourceRow(source, builtInTypes)) continue;
      sources.push(source);
    }
    return sources;
  }
  function readAudioSourceRow(data, get, index) {
    return normalizeAudioSource({
      type: get(`audioSources.${index}.type`),
      url: get(`audioSources.${index}.url`).trim(),
      voice: get(`audioSources.${index}.voice`).trim(),
      enabled: data.has(`audioSources.${index}.enabled`)
    });
  }
  function shouldSkipAudioSourceRow(source, builtInTypes) {
    return !source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type);
  }
  function readDictionaryLookupLinks(data) {
    const get = (key) => String(data.get(key) ?? "");
    const count = Math.max(0, Math.min(MAX_DICTIONARY_LOOKUP_LINKS, Number(get("dictionaryLookupLinkCount")) || 0));
    const links = [];
    for (let index = 0; index < count; index++) {
      const link = readDictionaryLookupLinkRow(data, get, index);
      if (link) links.push(link);
    }
    return normalizeDictionaryLookupLinks(links);
  }
  function readDictionaryLookupLinkRow(data, get, index) {
    const label = get(`dictionaryLookupLinks.${index}.label`).trim();
    const urlTemplate = get(`dictionaryLookupLinks.${index}.urlTemplate`).trim();
    const action = dictionaryLookupLinkAction(get(`dictionaryLookupLinks.${index}.action`));
    if (!shouldKeepDictionaryLookupLink(label, urlTemplate, action)) return null;
    return {
      id: get(`dictionaryLookupLinks.${index}.id`).trim() || `custom-${index}`,
      label: dictionaryLookupLinkLabel(label, action),
      urlTemplate: dictionaryLookupLinkUrlTemplate(urlTemplate, action),
      enabled: data.has(`dictionaryLookupLinks.${index}.enabled`),
      action
    };
  }
  function dictionaryLookupLinkAction(value) {
    return value === "copy" ? "copy" : "open";
  }
  function shouldKeepDictionaryLookupLink(label, urlTemplate, action) {
    return Boolean(label || urlTemplate || action === "copy");
  }
  function dictionaryLookupLinkLabel(label, action) {
    return action === "copy" && !label ? COPY_LOOKUP_LINK.label : label;
  }
  function dictionaryLookupLinkUrlTemplate(urlTemplate, action) {
    return action === "copy" ? "" : urlTemplate;
  }
  const SOURCE_ROW_COPY_KEYS_BY_ID = {
    __jpdb__: { helpKey: "sourceHelpJpdb" },
    __jiten__: { helpKey: "sourceHelpJiten" },
    __anki__: { nameKey: "sourceNameAnki", helpKey: "sourceHelpAnki" },
    __study_translation__: { nameKey: "sourceNameTranslation", helpKey: "sourceHelpTranslation" },
    __study_grammar__: { nameKey: "sourceNameGrammar", helpKey: "sourceHelpGrammar" },
    __immersion_kit__: { nameKey: "sourceNameImmersionKit", helpKey: "sourceHelpImmersionKit" },
    __kanji_stroke__: { nameKey: "sourceNameStrokePractice", helpKey: "sourceHelpStrokePractice" },
    __kanji_rtk__: { helpKey: "sourceHelpRtk" },
    __kanji_uchisen__: { helpKey: "sourceHelpUchisen" },
    __kanji_dictionaries__: { nameKey: "sourceNameImportedKanjiDictionaries", helpKey: "sourceHelpImportedKanjiDictionaries" },
    __kanji_similar_words__: { nameKey: "sourceNameWordsUsingKanji", helpKey: "sourceHelpWordsUsingKanji" },
    __kanji_origins__: { nameKey: "originStructure", helpKey: "sourceHelpComponentGraph" }
  };
  const SOURCE_ROW_ORDER_LABELS = { drag: "Drag to reorder", up: "Move up", down: "Move down" };
  function miniIconButton(icon, label, attributes) {
    const dragClass = icon === "drag" ? " jpdb-reader-drag-handle" : "";
    return `<button type="button" class="jpdb-reader-icon-mini${dragClass}" ${attributes} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${miniIcon(icon)}</button>`;
  }
  function renderRowOrderTools(options) {
    const ariaLabel = options.label ? ` aria-label="${escapeHtml(options.label)}"` : "";
    return `<div class="jpdb-reader-row-tools jpdb-reader-row-order-tools"${ariaLabel}>
                    ${options.leading ?? ""}
                    ${miniIconButton("drag", options.labels.drag, 'data-source-drag-handle tabindex="-1"')}
                    ${miniIconButton("up", options.labels.up, `data-action="${options.upAction}"`)}
                    ${miniIconButton("down", options.labels.down, `data-action="${options.downAction}"`)}
                </div>`;
  }
  function renderRowRemoveTools(control) {
    return `<div class="jpdb-reader-row-tools jpdb-reader-row-remove-tools">
                    ${control}
                </div>`;
  }
  function renderSourceRowsList(rows, options) {
    const removableCount = rows.filter((row) => row.removable).length;
    const showRemove = removableCount > 0;
    const context = {
      ...options,
      layoutClass: sourceRowsLayoutClass(options.showAlias, showRemove),
      showRemove
    };
    return `
        <div class="jpdb-reader-dictionary-head jpdb-reader-order-head ${context.layoutClass}">
            <span>On</span>
            <span>${escapeHtml(options.sourceLabel)}</span>
            ${options.showAlias ? "<span>Display name</span>" : ""}
            <span>Order</span>
            ${showRemove ? "<span>Remove</span>" : ""}
        </div>
        ${renderSourceRowsCountInput(options, removableCount)}
        ${rows.map((row, index) => renderSourceRow(row, index, context)).join("")}
    `;
  }
  function sourceRowsLayoutClass(showAlias, showRemove) {
    return [
      showAlias ? "" : "compact",
      showRemove ? "has-remove" : "no-remove"
    ].filter(Boolean).join(" ");
  }
  function renderSourceRowsCountInput(options, removableCount) {
    if (!options.countName) return "";
    return `<input type="hidden" name="${escapeHtml(options.countName)}" value="${options.countValue ?? removableCount}">`;
  }
  function renderSourceRow(row, index, context) {
    const keys = sourceRowCopyKeys(row);
    return `
            <div class="jpdb-reader-dictionary-row jpdb-reader-order-row ${context.layoutClass}" data-source-row data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                    <input name="${row.prefix}.enabled" type="checkbox" data-source-enable-toggle ${row.enabled ? "checked" : ""}>
                    <span>${index + 1}</span>
                </label>
                ${sourceField(sourceRowDisplayName(row, context.showAlias), row.name, row.prefix, "name", context.sourceLabel, keys?.nameKey)}
                ${renderSourceAliasControl(row, context.showAlias, keys)}
                ${renderRowOrderTools({
      upAction: "dictionary-source-up",
      downAction: "dictionary-source-down",
      labels: SOURCE_ROW_ORDER_LABELS,
      leading: `<input name="${row.prefix}.priority" type="hidden" value="${index}">`
    })}
                ${renderSourceRemoveCell(row, context.showRemove)}
                ${renderSourceTypeInput(row)}
                ${renderSourceRowHelp(row, keys)}
            </div>
        `;
  }
  function renderSourceAliasControl(row, showAlias, keys) {
    if (!showAlias) return "";
    if (row.readonly) return sourceField(row.alias, row.alias, row.prefix, "alias", "Display name", keys?.nameKey);
    return `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="Dictionary display name" placeholder="${escapeHtml(row.name)}">`;
  }
  function renderSourceRemoveCell(row, showRemove) {
    if (!showRemove) return "";
    return renderRowRemoveTools(renderSourceRemoveButton(row));
  }
  function renderSourceRemoveButton(row) {
    if (!row.removable) return "";
    return miniIconButton("remove", "Remove imported dictionary", `data-action="delete-yomitan-dictionary" data-dictionary-name="${escapeHtml(row.name)}"`);
  }
  function renderSourceTypeInput(row) {
    if (!row.removable) return "";
    return `<input name="${row.prefix}.type" type="hidden" value="${escapeHtml(row.dictionaryType ?? "terms")}">`;
  }
  function renderSourceRowHelp(row, keys) {
    if (!row.help) return "";
    const keyAttribute = keys?.helpKey ? `data-source-help-key="${escapeHtml(keys.helpKey)}"` : "";
    return `<div class="jpdb-reader-dictionary-row-help" ${keyAttribute}>${escapeHtml(row.help)}</div>`;
  }
  function sourceRowDisplayName(row, showAlias) {
    return !showAlias && !row.readonly && row.alias ? row.alias : row.name;
  }
  function sourceField(displayValue, formValue, prefix, field, label, nameKey) {
    return `
        <span class="jpdb-reader-field-display" aria-label="${escapeHtml(label)}" ${nameKey ? `data-source-name-key="${escapeHtml(nameKey)}"` : ""}>${escapeHtml(displayValue)}</span>
        <input name="${prefix}.${field}" type="hidden" value="${escapeHtml(formValue)}">
    `;
  }
  function sourceRowCopyKeys(row) {
    return SOURCE_ROW_COPY_KEYS_BY_ID[row.id] ?? importedKanjiDictionaryCopyKeys(row.id);
  }
  function importedKanjiDictionaryCopyKeys(rowId) {
    return rowId.startsWith("__kanji_dictionary__:") ? { helpKey: "sourceHelpImportedKanjiDictionary" } : void 0;
  }
  const AUDIO_URL_PLACEHOLDER_KEYS = {
    "custom-json": "audioCustomJsonPlaceholder",
    custom: "audioCustomUrlPlaceholder"
  };
  const JITEN_TTS_VOICE_OPTIONS = [
    ["", "Random Jiten voice"],
    ["female", "Female"],
    ["female2", "Female 2"],
    ["male", "Male"],
    ["male2", "Male 2"],
    ["asmr", "ASMR"]
  ];
  const JPDB_TTS_VOICE_OPTIONS = [
    ["", "Random JPDB voice"],
    ["f1", "Female 1"],
    ["f2", "Female 2"],
    ["m1", "Male 1"],
    ["m2", "Male 2"]
  ];
  function escapedUiText$3(language, key) {
    return escapeHtml(uiText(language, key));
  }
  function renderAudioSourceEditor(sources, language = "en") {
    return `
        <div class="jpdb-reader-audio-source-head jpdb-reader-order-head">
            <span>${escapedUiText$3(language, "enabledHeader")}</span>
            <span>${escapedUiText$3(language, "audioSource")}</span>
            <span>${escapedUiText$3(language, "urlVoice")}</span>
            <span>${escapedUiText$3(language, "orderHeader")}</span>
            <span>${escapedUiText$3(language, "removeHeader")}</span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources), language)}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">${escapedUiText$3(language, "addAudioSource")}</button>
    `;
  }
  function renderAudioSourceRows(rows, language) {
    const count = rows.length;
    const orderTools = renderRowOrderTools({
      label: uiText(language, "audioSourceOrder"),
      upAction: "audio-source-up",
      downAction: "audio-source-down",
      labels: {
        drag: uiText(language, "dragToReorder"),
        up: uiText(language, "moveUp"),
        down: uiText(language, "moveDown")
      }
    });
    const removeTools = renderRowRemoveTools(miniIconButton("remove", uiText(language, "remove"), 'data-action="audio-source-remove"'));
    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row jpdb-reader-order-row" data-source-row data-audio-source-row data-source-id="audio-${index}">
                <label class="inline jpdb-reader-audio-index jpdb-reader-order-toggle">
                    <input name="audioSources.${index}.enabled" type="checkbox" aria-label="${escapeHtml(uiText(language, "enableAudioSourceNumber").replace("{number}", String(index + 1)))}" ${source.enabled ? "checked" : ""}>
                    <span>${index + 1}</span>
                </label>
                <div class="jpdb-reader-audio-source-choice">
                    <select name="audioSources.${index}.type" aria-label="${escapeHtml(uiText(language, "audioSourceNumber").replace("{number}", String(index + 1)))}">
                        ${audioSourceSelectOptions(source.type, language).map(
      ([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? "selected" : ""}>${escapeHtml(text)}</option>`
    ).join("")}
                    </select>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="preview-audio" title="${escapedUiText$3(language, "previewAudio")}" aria-label="${escapedUiText$3(language, "previewAudio")}">${speakerIcon()}</button>
                </div>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${escapeHtml(audioUrlPlaceholder(source.type, language))}" ${audioSourceUsesUrl(source.type) ? "" : "hidden"}>
                    <select data-audio-voice-field data-audio-voice-kind="${audioSourceVoiceKind(source.type)}" name="audioSources.${index}.voice" aria-label="${escapeHtml(uiText(language, "textToSpeechVoiceNumber").replace("{number}", String(index + 1)))}" data-selected-voice="${escapeHtml(source.voice)}" ${audioSourceUsesVoice(source.type) ? "" : "hidden"}>
                        ${audioVoiceSelectOptions(source, language)}
                    </select>
                </div>
                ${orderTools}
                ${removeTools}
            </div>
        `).join("")}
    `;
  }
  function audioSourceSelectOptions(type, language) {
    if (type === "custom") {
      return [
        ...AUDIO_SOURCE_UI_TYPE_VALUES.map((value) => [value, audioSourceLabel(language, value)]),
        ["custom", uiText(language, "customAdvanced").replace("{label}", audioSourceLabel(language, "custom"))]
      ];
    }
    return AUDIO_SOURCE_UI_TYPE_VALUES.map((value) => [value, audioSourceLabel(language, value)]);
  }
  function audioSourceRowsForSettings(sources) {
    const rows = sources.map((source) => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
  }
  function audioUrlPlaceholder(type, language) {
    return uiText(language, audioUrlPlaceholderKey(type));
  }
  function audioUrlPlaceholderKey(type) {
    return AUDIO_URL_PLACEHOLDER_KEYS[type ?? ""] ?? "audioBuiltInPlaceholder";
  }
  function audioSourceUsesUrl(type) {
    return type === "custom" || type === "custom-json";
  }
  function audioSourceUsesVoice(type) {
    return audioSourceVoiceKind(type) !== "none";
  }
  function audioSourceVoiceKind(type) {
    if (type === "jiten-tts") return "jiten";
    if (type === "jpdb-tts") return "jpdb";
    if (type === "text-to-speech" || type === "text-to-speech-reading") return "browser";
    return "none";
  }
  function audioVoiceSelectOptions(source, language) {
    if (audioSourceVoiceKind(source.type) === "jiten") return jitenTtsVoiceSelectOptions(source.voice);
    if (audioSourceVoiceKind(source.type) === "jpdb") return jpdbTtsVoiceSelectOptions(source.voice);
    const label = source.voice || uiText(language, "automaticBrowserVoice");
    return `<option value="${escapeHtml(source.voice)}">${escapeHtml(label)}</option>`;
  }
  function jitenTtsVoiceSelectOptions(selectedVoice) {
    const selected = selectedVoice.trim();
    const options = JITEN_TTS_VOICE_OPTIONS.map(
      ([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    );
    if (selected && !JITEN_TTS_VOICE_OPTIONS.some(([value]) => value === selected)) {
      options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
    }
    return options.join("");
  }
  function jpdbTtsVoiceSelectOptions(selectedVoice) {
    const selected = selectedVoice.trim();
    const options = JPDB_TTS_VOICE_OPTIONS.map(
      ([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`
    );
    if (selected && !JPDB_TTS_VOICE_OPTIONS.some(([value]) => value === selected)) {
      options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
    }
    return options.join("");
  }
  function syncAudioSourceRow(row, type) {
    if (!row) return;
    row.querySelectorAll("[data-audio-url-field]").forEach((node) => {
      node.hidden = !audioSourceUsesUrl(type);
    });
    row.querySelectorAll("[data-audio-voice-field]").forEach((node) => {
      const voiceKind = audioSourceVoiceKind(type);
      node.hidden = voiceKind === "none";
      node.dataset.audioVoiceKind = voiceKind;
      if (node instanceof HTMLSelectElement && voiceKind === "jiten") {
        const selected = node.value || node.dataset.selectedVoice || "";
        setInnerHtml(node, jitenTtsVoiceSelectOptions(selected));
      }
      if (node instanceof HTMLSelectElement && voiceKind === "jpdb") {
        const selected = node.value || node.dataset.selectedVoice || "";
        setInnerHtml(node, jpdbTtsVoiceSelectOptions(selected));
      }
    });
  }
  function syncBrowserTtsVoiceOptions(form) {
    const voices = "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
    const language = form.lang === "ja" ? "ja" : "en";
    const text = (key) => uiText(language, key);
    const sortedVoices = voices.slice().sort((a, b) => {
      const aJapanese = a.lang.toLowerCase().startsWith("ja") ? 0 : 1;
      const bJapanese = b.lang.toLowerCase().startsWith("ja") ? 0 : 1;
      return aJapanese - bJapanese || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
    });
    form.querySelectorAll('select[data-audio-voice-field][data-audio-voice-kind="browser"]').forEach((select2) => {
      const selected = select2.value || select2.dataset.selectedVoice || "";
      const options = [
        `<option value="" ${selected ? "" : "selected"}>${escapeHtml(text("automaticBrowserVoice"))}</option>`,
        ...sortedVoices.map((voice) => {
          const label = `${voice.name}${voice.lang ? ` (${voice.lang})` : ""}${voice.default ? ` - ${text("defaultVoiceSuffix")}` : ""}`;
          return `<option value="${escapeHtml(voice.name)}" ${voice.name === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
      ];
      if (selected && !sortedVoices.some((voice) => voice.name === selected)) {
        options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(text("savedVoiceLabel").replace("{voice}", selected))}</option>`);
      }
      setInnerHtml(select2, options.join(""));
    });
  }
  function isAudioSourceTypeValue(value) {
    return AUDIO_SOURCE_UI_TYPE_VALUES.includes(value) || value === "custom";
  }
  function updateAudioSourceEditor(form, action, control) {
    const container = form.querySelector(".jpdb-reader-audio-sources");
    if (!container) return;
    const row = control?.closest("[data-audio-source-row]");
    const rows = Array.from(container.querySelectorAll("[data-audio-source-row]"));
    const index = row ? rows.indexOf(row) : -1;
    if (isAudioSourceMoveAction(action)) {
      moveSourceRow(container, index, audioSourceMoveTargetIndex(action, index));
      return;
    }
    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    updateAudioSourceRows(sources, action, index);
    setInnerHtml(container, renderAudioSourceEditor(sources, form.lang === "ja" ? "ja" : "en"));
  }
  function isAudioSourceMoveAction(action) {
    return action === "audio-source-up" || action === "audio-source-down";
  }
  function audioSourceMoveTargetIndex(action, index) {
    return action === "audio-source-up" ? index - 1 : index + 1;
  }
  function updateAudioSourceRows(sources, action, index) {
    if (action === "audio-source-add") addAudioSourceRow(sources);
    if (action === "audio-source-remove") removeAudioSourceRow(sources, index);
  }
  function addAudioSourceRow(sources) {
    if (sources.length < 12) sources.push({ type: "custom-json", url: "", voice: "", enabled: true });
  }
  function removeAudioSourceRow(sources, index) {
    if (index >= 0 && sources.length > 1) sources.splice(index, 1);
  }
  function renderDictionaryLookupLinkEditor(links) {
    const rows = normalizeDictionaryLookupLinks(links);
    return `
        <div class="jpdb-reader-lookup-link-head jpdb-reader-order-head">
            <span>On</span>
            <span>Label</span>
            <span>URL template</span>
            <span>Order</span>
            <span>Remove</span>
        </div>
        ${renderDictionaryLookupLinkRows(rows)}
        <div class="jpdb-reader-lookup-link-actions">
            <button class="jpdb-reader-btn add" type="button" data-action="lookup-link-add">Add</button>
        </div>
    `;
  }
  function renderDictionaryLookupLinkRows(rows) {
    const orderTools = renderRowOrderTools({
      label: "Lookup pill order",
      upAction: "lookup-link-up",
      downAction: "lookup-link-down",
      labels: { drag: "Drag to reorder", up: "Move up", down: "Move down" }
    });
    return `
        <input type="hidden" name="dictionaryLookupLinkCount" value="${rows.length}">
        ${rows.map((link, index) => {
      const isCopyAction = link.action === "copy";
      const urlControl = isCopyAction ? `<span class="jpdb-reader-lookup-link-note">Copies the current word</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">` : `<input name="dictionaryLookupLinks.${index}.urlTemplate" type="text" value="${escapeHtml(link.urlTemplate)}" placeholder="https://takoboto.jp/?q={query}" aria-label="Lookup URL template">`;
      const removeControl = isCopyAction ? '<span class="jpdb-reader-lookup-link-fixed" aria-label="Built-in action"></span>' : miniIconButton("remove", "Remove", 'data-action="lookup-link-remove"');
      return `
                <div class="jpdb-reader-lookup-link-row jpdb-reader-order-row" data-source-row data-lookup-link-row data-source-id="lookup-link-${index}" data-index="${index}">
                    <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                        <input name="dictionaryLookupLinks.${index}.enabled" type="checkbox" data-lookup-link-enable-toggle ${link.enabled ? "checked" : ""}>
                        <span>${index + 1}</span>
                    </label>
                    <input name="dictionaryLookupLinks.${index}.label" type="text" value="${escapeHtml(link.label)}" aria-label="Lookup pill label">
                    ${urlControl}
                    <input name="dictionaryLookupLinks.${index}.id" type="hidden" value="${escapeHtml(link.id)}">
                    <input name="dictionaryLookupLinks.${index}.action" type="hidden" value="${escapeHtml(link.action ?? "open")}">
                    ${orderTools}
                    ${renderRowRemoveTools(removeControl)}
                </div>
            `;
    }).join("")}
    `;
  }
  function updateDictionaryLookupLinkEditor(form, action, control) {
    const container = form.querySelector(".jpdb-reader-lookup-links");
    if (!container) return;
    const links = readDictionaryLookupLinks(new FormData(form));
    const row = control?.closest("[data-lookup-link-row]");
    const index = row ? Array.from(container.querySelectorAll("[data-lookup-link-row]")).indexOf(row) : -1;
    updateDictionaryLookupLinks(links, action, index);
    setInnerHtml(container, renderDictionaryLookupLinkEditor(links));
  }
  function updateDictionaryLookupLinks(links, action, index) {
    if (action === "lookup-link-add") addDictionaryLookupLink(links);
    if (action === "lookup-link-remove") removeDictionaryLookupLink(links, index);
    if (action === "lookup-link-up") moveDictionaryLookupLink(links, index, index - 1);
    if (action === "lookup-link-down") moveDictionaryLookupLink(links, index, index + 1);
  }
  function addDictionaryLookupLink(links) {
    if (links.length >= MAX_DICTIONARY_LOOKUP_LINKS) return;
    links.push({
      id: `custom-${Date.now().toString(36)}`,
      label: "",
      urlTemplate: "https://takoboto.jp/?q={query}",
      enabled: true
    });
  }
  function removeDictionaryLookupLink(links, index) {
    if (index >= 0 && links.length > 1 && links[index]?.action !== "copy") links.splice(index, 1);
  }
  function moveDictionaryLookupLink(links, from, to) {
    if (from < 0 || to < 0 || from >= links.length || to >= links.length) return;
    const [link] = links.splice(from, 1);
    links.splice(to, 0, link);
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
  function renderAnkiTagsEditor(value, language) {
    const tags = ankiTagList(value);
    return `
        <div class="jpdb-reader-tag-editor" data-anki-tags-editor>
            <input type="hidden" name="ankiTags" value="${escapeHtml(tags.join(" "))}">
            <label class="jpdb-reader-settings-label-text" for="jpdb-reader-anki-tag-input">${escapeHtml(uiText(language, "ankiTags"))}</label>
            <div class="jpdb-reader-tag-chip-list" data-anki-tag-chips>${renderAnkiTagChipHtml(tags, language)}</div>
            <div class="jpdb-reader-tag-add-row">
                <input id="jpdb-reader-anki-tag-input" type="text" data-anki-tag-input autocomplete="off" placeholder="${escapeHtml(language === "ja" ? "タグを追加" : "Add tag")}">
                <button class="jpdb-reader-btn secondary" type="button" data-action="anki-tag-add">${escapeHtml(language === "ja" ? "追加" : "Add")}</button>
            </div>
        </div>
    `;
  }
  function updateAnkiTagsEditor(form, action, control) {
    const editor = control?.closest("[data-anki-tags-editor]") ?? form.querySelector("[data-anki-tags-editor]");
    const hidden = editor?.querySelector('input[name="ankiTags"]');
    if (!editor || !hidden) return;
    const language = formInterfaceLanguage(form);
    const tags = ankiTagList(hidden.value);
    if (action === "anki-tag-add") {
      const input2 = editor.querySelector("[data-anki-tag-input]");
      ankiTagList(input2?.value ?? "").forEach((tag) => {
        if (!tags.includes(tag)) tags.push(tag);
      });
      if (input2) input2.value = "";
    } else {
      const tag = control?.dataset.tag?.trim();
      if (tag) {
        const index = tags.indexOf(tag);
        if (index >= 0) tags.splice(index, 1);
      }
    }
    hidden.value = tags.join(" ");
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    renderAnkiTagChips(editor, tags, language);
  }
  function ankiTagList(value) {
    return uniqueStrings(value.split(/[\s,]+/u).map((tag) => tag.trim()).filter(Boolean));
  }
  function renderAnkiTagChipHtml(tags, language) {
    return tags.map((tag) => `
        <button class="jpdb-reader-tag-chip" type="button" data-action="anki-tag-remove" data-tag="${escapeHtml(tag)}" aria-label="${escapeHtml(tagRemoveLabel(tag, language))}">
            <span>${escapeHtml(tag)}</span>
            <span aria-hidden="true">×</span>
        </button>
    `).join("");
  }
  function renderAnkiTagChips(editor, tags, language) {
    const list = editor.querySelector("[data-anki-tag-chips]");
    if (!list) return;
    setInnerHtml(list, renderAnkiTagChipHtml(tags, language));
  }
  function tagRemoveLabel(tag, language) {
    return language === "ja" ? `タグを削除: ${tag}` : `${uiText(language, "remove")}: ${tag}`;
  }
  function formInterfaceLanguage(form) {
    const control = form.elements.namedItem("interfaceLanguage");
    const value = control instanceof HTMLSelectElement ? control.value : form.lang;
    return value === "auto" || value === "en" || value === "ja" ? value : "en";
  }
  const ANKI_FIELD_MAPPING_ROLES$1 = ["expression", "reading", "meaning", "sentence", "audio", "image"];
  const ANKI_MOBILE_FALLBACK_DECK = "Default";
  function escapedUiText$2(language, key) {
    return escapeHtml(uiText(language, key));
  }
  function renderAnkiMiningSettingsPanel(settings, ankiStatus) {
    return `
            <fieldset id="jpdb-reader-settings-panel-mining" role="tabpanel" data-settings-panel="mining" data-legend-key="anki" aria-describedby="settings-help-anki" hidden>
                <legend>Anki</legend>
                <input type="hidden" name="ankiFieldMappings" value="${escapeHtml(JSON.stringify(settings.ankiFieldMappings))}">
                <input type="hidden" data-anki-scan-fields value="{}">
                <input type="hidden" data-anki-scan-confidence value="{}">
                <div class="jpdb-reader-anki-layout">
                    <div class="jpdb-reader-anki-main">
                        <div class="grid jpdb-reader-anki-connection-grid">
                            ${checkbox("ankiEnabled", "Enable Anki mining", settings.ankiEnabled)}
                            ${checkbox("ankiMineWithJpdb", "Also add to Anki when adding via API", settings.jpdbMiningEnabled && settings.ankiMineWithJpdb, { disabled: !settings.jpdbMiningEnabled })}
                            ${checkbox("ankiCaptureScreenshot", "Attach context image when possible", settings.ankiCaptureScreenshot)}
                            ${checkbox("ankiMobileHandoff", "Mobile Anki add-note fallback", settings.ankiMobileHandoff)}
                            ${input("ankiConnectUrl", "AnkiConnect URL", settings.ankiConnectUrl)}
                            <div class="jpdb-reader-settings-wide jpdb-reader-help jpdb-reader-status-line" data-anki-status data-status-tone="${ankiStatus.tone}" role="status" aria-live="polite">${ankiStatus.html}</div>
                        </div>
                        <div class="jpdb-reader-settings-subsection">
                            <div id="settings-help-anki" class="jpdb-reader-help" data-anki-setup-help></div>
                            <div class="jpdb-reader-settings-actions jpdb-reader-anki-actions">
                                <button class="jpdb-reader-btn" type="button" data-action="test-anki">${escapedUiText$2(settings.interfaceLanguage, "testAnki")}</button>
                                <button class="jpdb-reader-btn secondary" type="button" data-action="prepare-anki">${escapedUiText$2(settings.interfaceLanguage, "prepareAnki")}</button>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-library-choice">
                            <div class="jpdb-reader-local-title" data-anki-library-choices-title>${escapedUiText$2(settings.interfaceLanguage, "ankiLibraryChoices")}</div>
                            <div class="jpdb-reader-help" data-anki-library-choices-help>${escapedUiText$2(settings.interfaceLanguage, "ankiLibraryChoicesHelp")}</div>
                            <div class="jpdb-reader-anki-choice-grid">
                                <label><span class="jpdb-reader-settings-label-text">Anki deck</span><select name="ankiDeck" data-anki-deck-options>${renderAnkiDeckLibraryOptions([settings.ankiDeck].filter(Boolean), settings.ankiDeck, settings.interfaceLanguage)}</select></label>
                                <label><span class="jpdb-reader-settings-label-text">Anki note type</span><select name="ankiModel" data-anki-model-options>${renderAnkiLibraryOptions([settings.ankiModel, ...Object.keys(settings.ankiFieldMappings)].filter(Boolean), settings.ankiModel, settings.interfaceLanguage)}</select></label>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-template-settings">
                            <div class="jpdb-reader-local-title" data-anki-template-settings-title>${escapedUiText$2(settings.interfaceLanguage, "ankiTemplateSettings")}</div>
                            <div class="jpdb-reader-help" data-anki-template-settings-help>${escapedUiText$2(settings.interfaceLanguage, "ankiTemplateSettingsHelp")}</div>
                            <div class="grid jpdb-reader-anki-card-grid">
                                ${select("ankiTemplateMode", "Anki card template", settings.ankiTemplateMode, [["recognition", "Word first"], ["context", "Sentence first"]])}
                                ${checkbox("ankiFrontReading", "Word-first front: show reading", settings.ankiFrontReading)}
                                ${checkbox("ankiFrontSentence", "Word-first front: show sentence", settings.ankiFrontSentence)}
                                ${checkbox("ankiFrontImage", "Show image on front", settings.ankiFrontImage)}
                                ${renderAnkiTagsEditor(settings.ankiTags, settings.interfaceLanguage)}
                            </div>
                            <div data-anki-template-preview>
                                ${renderAnkiTemplatePreview(settings)}
                            </div>
                        </div>
                    </div>
                    <div class="jpdb-reader-settings-subsection jpdb-reader-anki-adapter" data-anki-library-adapter>
                        <div class="jpdb-reader-local-title" data-anki-library-adapter-title>Existing library adapter</div>
                        <div class="jpdb-reader-help" data-anki-library-availability>${escapedUiText$2(settings.interfaceLanguage, "ankiLibraryAdapterStatus")}</div>
                        <div data-anki-field-mapping-editor>
                            ${renderAnkiFieldMappingEditor(settings, settings.ankiModel, [], settings.interfaceLanguage)}
                        </div>
                    </div>
                </div>
            </fieldset>
    `;
  }
  function renderAnkiLibraryOptions(options, value, language = "en") {
    const values = uniqueStrings([value, ...options].filter(Boolean));
    const rows = values.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`);
    return rows.length ? rows.join("") : `<option value="" selected>${escapedUiText$2(language, "scanAnkiFirst")}</option>`;
  }
  function renderAnkiDeckLibraryOptions(options, value, language = "en") {
    return renderAnkiLibraryOptions([...options, ANKI_MOBILE_FALLBACK_DECK], value, language);
  }
  function renderAnkiFieldMappingEditor(settings, modelName = settings.ankiModel, scannedFields = [], language = settings.interfaceLanguage, confidenceByRole = {}) {
    const model = modelName.trim();
    const mapping = model ? settings.ankiFieldMappings[model] ?? {} : {};
    const fields = uniqueStrings([...scannedFields, ...Object.values(mapping).filter(Boolean)]);
    const options = (selected = "") => [
      `<option value="" ${selected ? "" : "selected"}>${escapedUiText$2(language, "notMapped")}</option>`,
      ...fields.map((field) => `<option value="${escapeHtml(field)}" ${field === selected ? "selected" : ""}>${escapeHtml(field)}</option>`)
    ].join("");
    const rows = ANKI_FIELD_MAPPING_ROLES$1.map((role) => {
      const value = mapping[role] ?? "";
      const roleLabel = ankiFieldMappingRoleLabel(role, language);
      const confidence = value ? confidenceByRole[role] : void 0;
      return `
                <label>
                    <span class="jpdb-reader-anki-field-role-row">
                        <span>${escapeHtml(roleLabel)}</span>
                        ${confidence ? renderAnkiMappingConfidence(confidence, language) : ""}
                    </span>
                    <select data-anki-field-role="${escapeHtml(role)}" aria-label="${escapeHtml(uiText(language, "ankiFieldMappingSelect").replace("{role}", roleLabel))}">
                        ${options(value)}
                    </select>
                </label>
        `;
    }).join("");
    const emptyState = fields.length ? "" : `<div class="jpdb-reader-help">${escapedUiText$2(language, "noScannedFields")}</div>`;
    return `
            <div data-anki-field-mapping-model="${escapeHtml(model)}">
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, "mappingForNoteType").replace("{model}", model || uiText(language, "currentNoteType")))}</div>
                <div class="grid">
                    ${rows}
                </div>
                ${fields.length ? `<div class="jpdb-reader-help">${escapedUiText$2(language, "ankiMappingConfidenceHelp")}</div>` : ""}
                ${emptyState}
            </div>
    `;
  }
  function renderAnkiMappingConfidence(confidence, language) {
    const key = confidence === "high" ? "ankiMappingHighConfidence" : confidence === "medium" ? "ankiMappingMediumConfidence" : "ankiMappingLowConfidence";
    return `<span class="jpdb-reader-anki-confidence" data-confidence="${confidence}">${escapedUiText$2(language, key)}</span>`;
  }
  function ankiFieldMappingRoleLabel(role, language) {
    return {
      expression: uiText(language, "ankiRoleExpression"),
      reading: uiText(language, "ankiRoleReading"),
      meaning: uiText(language, "ankiRoleMeaning"),
      sentence: uiText(language, "ankiRoleSentence"),
      audio: uiText(language, "ankiRoleAudio"),
      image: uiText(language, "ankiRoleImage")
    }[role];
  }
  function renderDeckControls(settings, decks, hasApiKey, language = settings.interfaceLanguage) {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map((deck) => [deck.id, deck.name]);
    const miningOptions = [["forq", "FORQ"], ...deckOptions];
    const newTabOptions = [["all", "All study decks"], ["never-forget", "Never forget"], ...deckOptions];
    return `
        <div class="grid">
            ${deckSelect("miningDeck", "Mining deck", settings.miningDeck, miningOptions, disabled, language)}
            ${checkbox("autoMineOnReview", "Add reviewed words to the mining deck automatically", settings.autoMineOnReview)}
            ${deckSelect("newTabJpdbDeck", "New tab JPDB deck", settings.newTabJpdbDeck, newTabOptions, disabled, language)}
            ${deckSelect("neverForgetDeck", "Never forget deck", settings.neverForgetDeck, deckOptions, disabled, language)}
            ${deckSelect("blacklistDeck", "Blacklist deck", settings.blacklistDeck, deckOptions, disabled, language)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? decks.length ? "Decks are loaded from your JPDB account." : "Could not load decks yet; saved deck IDs will be kept." : "Add your JPDB API key to choose decks."}</div>
    `;
  }
  function deckSelect(name, label, value, options, disabled, language) {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const savedLabel = uiText(language, "savedValue").replace("{value}", value);
    const merged = hasValue || !value ? options : [[value, savedLabel], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? "disabled" : ""}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ""}
    </label>`;
  }
  function renderAnkiTemplatePreview(settings) {
    const contextMode = settings.ankiTemplateMode === "context";
    const front = contextMode ? `${settings.ankiFrontImage ? "<small>Image appears above the prompt when available.</small>" : ""}<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div><small>Recall the highlighted word from context.</small>` : [
      '<div class="jpdb-reader-template-expression">読む</div>',
      settings.ankiFrontReading ? '<div class="jpdb-reader-template-reading">よむ</div>' : "",
      settings.ankiFrontSentence ? '<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div>' : "",
      settings.ankiFrontImage ? "<small>Image appears on the front when available.</small>" : "",
      "<small>Recall the meaning first.</small>"
    ].filter(Boolean).join("");
    return `
        <div class="jpdb-reader-template-preview">
            <div class="jpdb-reader-template-preview-title">${contextMode ? "Sentence first preset" : "Word first preset"}</div>
            <div class="jpdb-reader-template-preview-grid">
                <div>
                    <strong>Front</strong>
                    ${front}
                </div>
                <div>
                    <strong>Back</strong>
                    <div class="jpdb-reader-template-expression">読む</div>
                    <div class="jpdb-reader-template-reading">よむ</div>
                    <div class="jpdb-reader-template-meaning">to read</div>
                    <small>Includes dictionary, kanji, pitch, frequency, source, and image fields when available.</small>
                </div>
            </div>
        </div>
    `;
  }
  const MOBILE_ANKI_SETUP_DOCS_URL = `${DOCS_BASE_URL}getting-started#use-desktop-anki-from-a-phone-ipad-or-android`;
  function escapedUiText$1(language, key) {
    return escapeHtml(uiText(language, key));
  }
  function renderJpdbStatusLine(settings) {
    const { message, tone } = jpdbStatusLineForSettings(settings, settings.interfaceLanguage);
    return `<div class="jpdb-reader-help jpdb-reader-status-line" data-jpdb-status data-status-tone="${tone}" role="status" aria-live="polite">${formatSettingsStatusLine({ message, tone }, settings.interfaceLanguage)}</div>`;
  }
  function formatStatusTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
  }
  function jpdbStatusLineForSettings(settings, language) {
    return jpdbStatusLineFromValues(hasJpdbApiCredential(settings), hasJitenApiCredential(settings), language);
  }
  function jpdbStatusLineFromValues(hasJpdbApiKey, hasJitenApiKey, language) {
    if (!hasJpdbApiKey && !hasJitenApiKey) {
      return {
        message: jitenAwareMissingApiKeyMessage(language),
        tone: "pending"
      };
    }
    if (!hasJpdbApiKey) {
      return {
        message: jitenApiKeyConfiguredMessage(language),
        tone: "success"
      };
    }
    return {
      message: uiText(language, "jpdbApiKeyConfigured"),
      tone: "success"
    };
  }
  function jitenAwareMissingApiKeyMessage(language) {
    return resolveUiLanguage(language) === "ja" ? "JPDBまたはJitenキーなし。" : "No JPDB or Jiten key.";
  }
  function jitenApiKeyConfiguredMessage(language) {
    return resolveUiLanguage(language) === "ja" ? "Jitenキーあり。" : "Jiten key set.";
  }
  function ankiStatusLineForSettings(settings, language) {
    return ankiStatusLineFromValues(settings.ankiEnabled, settings.ankiConnectUrl, language);
  }
  function formatSettingsStatusLine(line, language) {
    return `${escapedUiText$1(language, settingsStatusToneLabelKey(line.tone))}: ${escapeHtml(line.message)}`;
  }
  function renderAnkiStatusHtml(line, language) {
    const chip = line.state ? `<span class="jpdb-reader-adapter-state-chip" data-adapter-state="${escapeHtml(line.state)}">${escapedUiText$1(language, ankiAdapterStateLabelKey(line.state))}</span> ` : "";
    const summary = `<div class="jpdb-reader-status-main">${chip}${formatSettingsStatusLine(line, language)}</div>`;
    const actions = [...line.details ?? [], ...ankiStatusActions(line.action, language)];
    if (!actions.length) return summary;
    return `${summary}<ul class="jpdb-reader-status-checklist">${actions.map(renderStatusAction).join("")}</ul>`;
  }
  function ankiAdapterStateLabelKey(state) {
    const keys = {
      disabled: "adapterStateDisabled",
      probing: "adapterStateProbing",
      unreachable: "adapterStateUnreachable",
      connected: "adapterStateConnected",
      scanning: "adapterStateScanning",
      suggested: "adapterStateSuggested",
      stale: "adapterStateStale",
      ready: "adapterStateReady"
    };
    return keys[state];
  }
  function renderStatusAction(action) {
    const label = action.href ? `<a href="${escapeHtml(action.href)}" target="_blank" rel="noopener">${escapeHtml(action.label)}</a>` : escapeHtml(action.label);
    return `<li>${label}${action.suffix ? ` <span>${escapeHtml(action.suffix)}</span>` : ""}</li>`;
  }
  function ankiStatusActions(action, language) {
    if (action === "anki-unreachable") {
      const actions = [
        { label: uiText(language, "ankiStatusOpenDesktop") },
        { label: uiText(language, "ankiStatusInstallAddon"), href: ANKI_CONNECT_ADDON_URL },
        { label: uiText(language, "ankiStatusMobileDocs"), href: MOBILE_ANKI_SETUP_DOCS_URL, suffix: uiText(language, "ankiStatusUseDesktopUrl") }
      ];
      if (typeof location !== "undefined" && location.hostname && !["127.0.0.1", "localhost", "::1"].includes(location.hostname)) {
        if (!hasUserscriptAnkiBridge()) {
          actions.unshift(
            { label: uiText(language, "ankiStatusEnableUserscript") },
            { label: uiText(language, "ankiStatusRefreshAndCheck") }
          );
        }
        actions.push({
          label: formatUiText(language, "ankiHostedCorsHint", { origin: location.origin })
        });
      }
      return actions;
    }
    return [];
  }
  function settingsStatusToneLabelKey(tone) {
    if (tone === "success") return "statusReady";
    if (tone === "error") return "statusError";
    return "statusAttention";
  }
  function ankiStatusLineFromValues(ankiEnabled, ankiConnectUrl, language) {
    if (!ankiEnabled) {
      return {
        message: uiText(language, "ankiMiningDisabledStatus"),
        tone: "pending",
        state: "disabled"
      };
    }
    return {
      message: formatStatusTemplate(uiText(language, "ankiCheckingConnection"), {
        url: ankiConnectUrl.trim()
      }),
      tone: "pending",
      state: "probing"
    };
  }
  function localizeJpdbStatus(form, language) {
    const status = form.querySelector("[data-jpdb-status]");
    if (!status) return;
    const credentials = readApiCredentialsFromFormData(new FormData(form));
    const line = jpdbStatusLineFromValues(hasJpdbApiCredential(credentials), hasJitenApiCredential(credentials), language);
    status.dataset.statusTone = line.tone;
    status.replaceChildren(line.message);
  }
  function localizeInitialAnkiStatus(form, language) {
    const status = form.querySelector("[data-anki-status]");
    if (!status || !isInitialAnkiSettingsStatus(status.textContent ?? "")) return;
    const ankiEnabled = form.querySelector('input[name="ankiEnabled"]')?.checked ?? false;
    const ankiConnectUrl = form.querySelector('input[name="ankiConnectUrl"]')?.value ?? "";
    const line = ankiStatusLineFromValues(ankiEnabled, ankiConnectUrl, language);
    status.dataset.statusTone = line.tone;
    setInnerHtml(status, renderAnkiStatusHtml(line, language));
  }
  function isInitialAnkiSettingsStatus(value) {
    return /Checking AnkiConnect|Anki mining disabled|AnkiConnect.*確認中|Ankiマイニングは無効/.test(value);
  }
  const KANJI_STROKE_SOURCE_ID = "__kanji_stroke__";
  const KANJI_JPDB_SOURCE_ID = "__kanji_jpdb__";
  const KANJI_RTK_SOURCE_ID = "__kanji_rtk__";
  const KANJI_UCHISEN_SOURCE_ID = "__kanji_uchisen__";
  const KANJI_DICTIONARIES_SOURCE_ID = "__kanji_dictionaries__";
  const KANJI_ORIGINS_SOURCE_ID = "__kanji_origins__";
  const KANJI_DICTIONARY_SOURCE_PREFIX = "__kanji_dictionary__:";
  function definitionSourceRows(settings) {
    const language = settings.interfaceLanguage;
    const builtInRows = [
      {
        id: JPDB_DEFINITION_SOURCE_ID,
        name: "JPDB",
        alias: "JPDB",
        enabled: settings.jpdbDefinitionsEnabled,
        priority: settings.jpdbDefinitionsPriority,
        prefix: "jpdbDefinitions",
        readonly: true,
        help: uiText(language, "sourceHelpJpdb")
      },
      {
        id: JITEN_DEFINITION_SOURCE_ID,
        name: "Jiten",
        alias: "Jiten",
        enabled: settings.jitenDefinitionsEnabled,
        priority: settings.jitenDefinitionsPriority,
        prefix: "jitenDefinitions",
        readonly: true,
        help: uiText(language, "sourceHelpJiten")
      },
      {
        id: STUDY_TRANSLATION_SOURCE_ID,
        name: uiText(language, "sourceNameTranslation"),
        alias: uiText(language, "sourceNameTranslation"),
        enabled: settings.studyTranslationEnabled,
        priority: settings.studyTranslationPriority,
        prefix: "studyTranslation",
        readonly: true,
        help: uiText(language, "sourceHelpTranslation")
      },
      {
        id: ANKI_SOURCE_ID,
        name: "Anki",
        alias: "Anki",
        enabled: settings.ankiSectionEnabled,
        priority: settings.ankiSectionPriority,
        prefix: "ankiSection",
        readonly: true,
        help: uiText(language, "sourceHelpAnki")
      },
      {
        id: STUDY_GRAMMAR_SOURCE_ID,
        name: uiText(language, "sourceNameGrammar"),
        alias: uiText(language, "sourceNameGrammar"),
        enabled: settings.studyGrammarEnabled,
        priority: settings.studyGrammarPriority,
        prefix: "studyGrammar",
        readonly: true,
        help: uiText(language, "sourceHelpGrammar")
      },
      {
        id: IMMERSION_KIT_SOURCE_ID,
        name: uiText(language, "sourceNameImmersionKit"),
        alias: uiText(language, "sourceNameImmersionKit"),
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
  function frequencySourceRows(settings) {
    return settings.dictionaryPreferences.filter((preference) => preference.type === "frequency").map((preference) => ({
      id: preference.name,
      name: preference.name,
      alias: preference.alias,
      enabled: preference.enabled,
      priority: preference.priority,
      prefix: `dictionaryPreferences.${settings.dictionaryPreferences.indexOf(preference)}`,
      readonly: false,
      removable: true,
      dictionaryType: "frequency",
      help: ""
    })).sort(compareSourceRows);
  }
  function kanjiSourceRows(settings) {
    const language = settings.interfaceLanguage;
    const apiSource = activeKanjiFactSource(settings);
    const readingsComponentsName = apiSource.name === "Jiten" ? uiText(language, "sourceNameJitenKanjiFacts") : uiText(language, "readingsComponents");
    const kanjiDictionaryRows = settings.dictionaryPreferences.filter((preference) => preference.type === "kanji").map((preference) => ({
      id: kanjiDictionarySourceId(preference.name),
      name: preference.name,
      alias: preference.alias,
      enabled: settings.localDictionaryShowKanji && preference.enabled,
      priority: preference.priority,
      prefix: `dictionaryPreferences.${settings.dictionaryPreferences.indexOf(preference)}`,
      readonly: false,
      removable: true,
      dictionaryType: "kanji",
      help: uiText(language, "sourceHelpImportedKanjiDictionary")
    }));
    return [
      {
        id: KANJI_STROKE_SOURCE_ID,
        name: uiText(language, "sourceNameStrokePractice"),
        alias: uiText(language, "sourceNameStrokePractice"),
        enabled: settings.kanjivgEnabled,
        priority: settings.kanjivgPriority,
        prefix: "kanjivg",
        readonly: true,
        help: uiText(language, "sourceHelpStrokePractice")
      },
      {
        id: KANJI_JPDB_SOURCE_ID,
        name: readingsComponentsName,
        alias: readingsComponentsName,
        enabled: settings.jpdbKanjiEnabled,
        priority: settings.jpdbKanjiPriority,
        prefix: "jpdbKanji",
        readonly: true,
        help: apiSource.name === "Jiten" ? uiText(language, "sourceHelpJitenKanjiFacts") : uiText(language, "sourceHelpReadingsComponents")
      },
      {
        id: KANJI_RTK_SOURCE_ID,
        name: "RTK",
        alias: "RTK",
        enabled: settings.rtkEnabled,
        priority: settings.rtkPriority,
        prefix: "rtk",
        readonly: true,
        help: uiText(language, "sourceHelpRtk")
      },
      {
        id: IMMERSION_KIT_SOURCE_ID,
        name: uiText(language, "sourceNameImmersionKit"),
        alias: uiText(language, "sourceNameImmersionKit"),
        enabled: settings.kanjiImmersionKitEnabled,
        priority: settings.kanjiImmersionKitPriority,
        prefix: "kanjiImmersionKit",
        readonly: true,
        help: uiText(language, "sourceHelpImmersionKit")
      },
      {
        id: KANJI_UCHISEN_SOURCE_ID,
        name: "Uchisen",
        alias: "Uchisen",
        enabled: settings.uchisenEnabled,
        priority: settings.uchisenPriority,
        prefix: "uchisen",
        readonly: true,
        help: uiText(language, "sourceHelpUchisen")
      },
      ...kanjiDictionaryRows.length ? [] : [{
        id: KANJI_DICTIONARIES_SOURCE_ID,
        name: uiText(language, "sourceNameImportedKanjiDictionaries"),
        alias: uiText(language, "sourceNameImportedKanjiDictionaries"),
        enabled: settings.localDictionaryShowKanji,
        priority: settings.kanjiDictionariesPriority,
        prefix: "kanjiDictionaries",
        readonly: true,
        help: uiText(language, "sourceHelpImportedKanjiDictionaries")
      }],
      ...kanjiDictionaryRows,
      {
        id: KANJI_ORIGINS_SOURCE_ID,
        name: uiText(language, "originStructure"),
        alias: uiText(language, "originStructure"),
        enabled: settings.kanjiOriginsEnabled,
        priority: settings.kanjiOriginsPriority,
        prefix: "kanjiOrigins",
        readonly: true,
        help: uiText(language, "sourceHelpComponentGraph")
      }
    ].sort(compareSourceRows);
  }
  function activeKanjiFactSource(settings) {
    return hasJitenApiCredential(settings) && !hasJpdbApiCredential(settings) ? { name: "Jiten" } : { name: "JPDB" };
  }
  function kanjiDictionarySourceId(name) {
    return `${KANJI_DICTIONARY_SOURCE_PREFIX}${name}`;
  }
  function compareSourceRows(a, b) {
    return a.priority - b.priority || a.name.localeCompare(b.name);
  }
  const COLOR_SOURCE_CLASS_VALUES = ["status", "jpdb", "anki", "pitch"];
  const DEFAULT_JITEN_SETTINGS_URL = "https://jiten.moe/settings";
  const PROXY_WORKER_SOURCE_URL = `${GITHUB_REPOSITORY_URL}/blob/main/workers/jpdb-public-proxy/src/index.ts`;
  const PROXY_WORKER_README_URL = `${GITHUB_REPOSITORY_URL}/tree/main/workers/jpdb-public-proxy`;
  const DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID = "jpdb-reader-disabled-control-description";
  const API_KEY_INPUT_ATTRIBUTES = {
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    "data-1p-ignore": "true",
    "data-lpignore": "true",
    "data-bwignore": "true",
    "data-protonpass-ignore": "true",
    "data-form-type": "other"
  };
  const API_KEY_INPUT_ATTRIBUTE_HTML = ' autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other"';
  const AUTOFILL_IGNORE_ATTRIBUTE_HTML = ' data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other"';
  const JAPANESE_SANS_FONT_FAMILY = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
  const HIRAGINO_YU_GOTHIC_FONT_FAMILY = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  const JAPANESE_SERIF_FONT_FAMILY = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif';
  const FONT_FAMILY_PRESETS = [
    { value: DEFAULT_POPUP_FONT_FAMILY, labelKey: "fontPresetYomuDefault", fallbackLabel: "Built-in font" },
    { value: JAPANESE_SANS_FONT_FAMILY, labelKey: "fontPresetJapaneseSans", fallbackLabel: "Japanese sans" },
    { value: HIRAGINO_YU_GOTHIC_FONT_FAMILY, labelKey: "fontPresetHiraginoYuGothic", fallbackLabel: "Hiragino / Yu Gothic" },
    { value: JAPANESE_SERIF_FONT_FAMILY, labelKey: "fontPresetJapaneseSerif", fallbackLabel: "Japanese serif" },
    { value: DEFAULT_READER_FONT_FAMILY, labelKey: "fontPresetSystemUi", fallbackLabel: "System UI" }
  ];
  const DEFAULT_SETTINGS_PANEL = "appearance";
  const SETTINGS_TABS = [
    { panel: "appearance", label: "Appearance", active: true },
    { panel: "api", label: "API" },
    { panel: "dictionaries", label: "Sources", labelKey: "sources" },
    { panel: "media", label: "Media" },
    { panel: "mining", label: "Mining" },
    { panel: "newTab", label: "Study" },
    { panel: "shortcuts", label: "Shortcuts" },
    { panel: "help", label: "Help" }
  ];
  const WORD_COLOR_FIELDS = [
    ["wordColorNew", "New and in deck"],
    ["wordColorLearning", "Learning"],
    ["wordColorKnown", "Known and never forget"],
    ["wordColorDue", "Due"],
    ["wordColorFailed", "Failed"],
    ["wordColorIgnored", "Ignored, suspended, and blacklisted"]
  ];
  const PITCH_COLOR_FIELDS = [
    ["pitchColorHeiban", "Heiban (flat)"],
    ["pitchColorAtamadaka", "Atamadaka (head-high)"],
    ["pitchColorNakadaka", "Nakadaka (middle-high)"],
    ["pitchColorOdaka", "Odaka (tail-high)"],
    ["pitchColorKifuku", "Kifuku (variable)"],
    ["pitchColorUnknown", "Unknown / inherited"]
  ];
  const OCR_COLOR_FIELDS = [
    ["ocrTextColor", "Image text color"],
    ["ocrOutlineColor", "Image text outline"],
    ["ocrBackgroundColor", "Image highlight background"]
  ];
  const SUBTITLE_COLOR_FIELDS = [
    ["subtitleTextColor", "Subtitle color"],
    ["subtitleOutlineColor", "Subtitle outline"],
    ["subtitleBackgroundColor", "Subtitle background"]
  ];
  const COLOR_CHANNEL_FIELDS = [
    ["wordHighlightColorSource", "Word highlight color"],
    ["wordUnderlineColorSource", "Word underline color"],
    ["wordTextColorSource", "Word text color"],
    ["subtitleHighlightColorSource", "Subtitle highlight color"],
    ["subtitleUnderlineColorSource", "Subtitle underline color"],
    ["subtitleTextColorSource", "Subtitle text color"]
  ];
  function escapedUiText(language, key) {
    return escapeHtml(uiText(language, key));
  }
  function renderHelpLinksPanel() {
    return `
        <div class="jpdb-reader-help-links-card">
            <div class="jpdb-reader-settings-subsection">
                <div class="jpdb-reader-local-title" data-help-links-title>Useful pages</div>
                <div class="jpdb-reader-help" data-help-links-copy>Open the hosted reader tools and docs from here.</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn" href="${VIDEO_PLAYER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="video-player">${externalButtonLabel("Video Player")}</a>
                    <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-help-link="new-tab">${externalButtonLabel("New Tab")}</a>
                    <a class="jpdb-reader-btn" href="${DOCS_BASE_URL}" target="_blank" rel="noopener" data-help-link="docs">${externalButtonLabel("Docs")}</a>
                    <button class="jpdb-reader-btn jpdb-reader-help-reset" type="button" data-action="factory-reset" data-help-link="factory-reset">Factory Reset</button>
                </div>
            </div>
            <div class="jpdb-reader-settings-subsection">
                <div class="jpdb-reader-local-title" data-help-support-title>Support よむ</div>
                <div class="jpdb-reader-help" data-help-support-copy>${escapeHtml(SUPPORT_COPY)}</div>
                <div class="jpdb-reader-help" data-help-support-copy-extra>${escapeHtml(SUPPORT_COPY_EXTRA)}</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn jpdb-reader-help-donate" href="${DONATE_URL}" target="_blank" rel="noopener" data-help-link="donate">${externalButtonLabel("Donate")}</a>
                    <a class="jpdb-reader-btn" href="${GITHUB_REPOSITORY_URL}/issues" target="_blank" rel="noopener" data-help-link="issues">${externalButtonLabel("Issues")}</a>
                    <a class="jpdb-reader-btn" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener" data-help-link="discord">${externalButtonLabel("Discord")}</a>
                </div>
            </div>
        </div>
    `;
  }
  function renderSettingsForm(settings, jpdbSettingsUrl, jitenSettingsUrl = DEFAULT_JITEN_SETTINGS_URL) {
    return `
            ${renderAutofillTrap()}
            <div class="jpdb-reader-settings-head">
                <div class="jpdb-reader-settings-drag-handle"></div>
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            ${renderSettingsTabs()}
            ${renderSettingsSearch(settings.interfaceLanguage)}
            <div class="jpdb-reader-settings-scroll">
            ${renderApiSettingsPanel(settings, jpdbSettingsUrl, jitenSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderNewTabSettingsPanel(settings)}
            ${renderAudioSettingsPanel(settings)}
            ${renderImmersionKitSettingsPanel(settings)}
            ${renderReaderSettingsPanel(settings)}
            ${renderDictionariesSettingsPanel(settings)}
            ${renderKanjiSettingsPanel(settings)}
            ${renderImageSettingsPanel(settings)}
            ${renderVideoSettingsPanel(settings)}
            ${renderYoutubeSettingsPanel(settings)}
            ${renderMiningSettingsPanel(settings)}
            ${renderShortcutSettingsPanel(settings)}
            ${renderHelpSettingsPanel(settings)}
            </div>
            ${renderSettingsFooter()}
        `;
  }
  function renderSettingsTabs() {
    return `
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${SETTINGS_TABS.map((tab) => settingsTabButton(tab.panel, tab.label, Boolean(tab.active))).join("")}
            </div>
    `;
  }
  function renderAutofillTrap() {
    return `
            <div class="jpdb-reader-autofill-trap" aria-hidden="true">
                <input type="text" name="yomu-autofill-trap-user" tabindex="-1" autocomplete="username" aria-hidden="true">
                <input type="password" name="yomu-autofill-trap-pass" tabindex="-1" autocomplete="current-password" aria-hidden="true">
            </div>
    `;
  }
  function renderSettingsSearch(language) {
    return `
            <div class="jpdb-reader-settings-search">
                <label>
                    <span class="jpdb-reader-settings-label-text">${escapedUiText(language, "settingsSearch")}</span>
                    <input type="search" name="yomu-settings-search" data-settings-search placeholder="${escapedUiText(language, "settingsSearchPlaceholder")}" autocomplete="off"${AUTOFILL_IGNORE_ATTRIBUTE_HTML}>
                </label>
            </div>
            <div class="jpdb-reader-settings-search-empty" data-settings-search-empty hidden>${escapedUiText(language, "settingsSearchNoResults")}</div>
    `;
  }
  function renderApiSettingsPanel(settings, jpdbSettingsUrl, jitenSettingsUrl) {
    const jpdbStatus = renderJpdbStatusLine(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-api" role="tabpanel" data-settings-panel="api" data-legend-key="api" hidden>
                <legend>API</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">API access</div>
                    <div class="grid">
                        ${input("apiCredentialJpdb", `JPDB API key <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">JPDB settings</a>`, effectiveJpdbApiKey(settings), "text", { ...API_KEY_INPUT_ATTRIBUTES, class: "jpdb-reader-masked-input" })}
                        ${input("apiCredentialJiten", `Jiten API key <a href="${jitenSettingsUrl}" target="_blank" rel="noopener">Jiten settings</a>`, effectiveJitenApiKey(settings), "text", { ...API_KEY_INPUT_ATTRIBUTES, class: "jpdb-reader-masked-input" })}
                    </div>
                    <div class="jpdb-reader-help" data-jpdb-api-key-help>Both keys can be set at once — reviews then mix both queues. Jiten keys start with ak_.</div>
                </div>
                ${jpdbStatus}
                <div data-jpdb-decks>
                    ${renderDeckControls(settings, [], hasJpdbApiCredential(settings), settings.interfaceLanguage)}
                </div>
                ${checkbox("jpdbMiningEnabled", "Allow API review/deck changes", settings.jpdbMiningEnabled)}
                ${checkbox("addToForq", "Also copy JPDB adds to forq", settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox("enableReviews", "Show review buttons", settings.enableReviews)}
                <div data-review-config ${settings.enableReviews ? "" : "hidden"}>
                    ${select("twoButtonReviews", "Review rating scale", settings.twoButtonReviews ? "true" : "false", [["false", "Five point: NOTHING to EASY"], ["true", "Two point: FAIL / PASS"]])}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Dictionary site enhancements</div>
                    <div class="grid">
                        ${checkbox("jpdbPageEnhancementsEnabled", "Enhance dictionary pages", settings.jpdbPageEnhancementsEnabled)}
                        ${checkbox("jpdbPageWordEnhancementsEnabled", "Add sources to word/search pages", settings.jpdbPageEnhancementsEnabled && settings.jpdbPageWordEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                        ${checkbox("jpdbPageKanjiEnhancementsEnabled", "Add sources to kanji pages", settings.jpdbPageEnhancementsEnabled && settings.jpdbPageKanjiEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                    </div>
                    <div class="jpdb-reader-help">Adds your dictionaries, Immersion Kit, kanji practice, and other sources to jpdb.io and jiten.moe vocabulary, kanji, and parse pages. Toggle individual sources under Dictionaries and Reading.</div>
                </div>
            </fieldset>
    `;
  }
  function renderInterfaceSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-appearance" role="tabpanel" data-settings-panel="appearance" data-legend-key="appearance">
                <legend>Appearance</legend>
                <div class="grid">
                    ${select("interfaceLanguage", "Settings language", settings.interfaceLanguage, [["auto", "Automatic"], ["en", "English"], ["ja", "日本語"]])}
                    ${themeSegmentedControl(settings.theme)}
                    ${select("popupMode", "Popup mode", settings.popupMode, [["auto", "Auto"], ["sheet", "Bottom sheet"], ["popover", "Popover"]])}
                    ${renderStickyBottomSheetControl(settings)}
                    ${checkbox("popoverBackdropEnabled", "Dim page behind popover", settings.popoverBackdropEnabled)}
                    ${input("popoverWidth", "Popover width (px)", String(settings.popoverWidth), "number", { min: 280, max: 900, step: 10 })}
                    ${input("popoverHeight", "Popover height (px)", String(settings.popoverHeight), "number", { min: 220, max: 900, step: 10 })}
                    ${select("popoverHeightMode", "Popover height behavior", settings.popoverHeightMode, [["available", "Grow to available space"], ["fixed", "Use height setting"]])}
                    ${fontFamilyControl("readerFontFamily", "Reader interface font", settings.readerFontFamily)}
                    ${fontFamilyControl("popupFontFamily", "Popup Japanese font", settings.popupFontFamily)}
                    ${input("popupFontWeight", "Popup Japanese weight", String(settings.popupFontWeight), "number", { min: 300, max: 900, step: 10 })}
                    ${input("accentColor", "Accent color", sanitizeAccentColor(settings.accentColor), "color")}
                </div>
                ${renderWordColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
                ${renderAppearancePreview()}
            </fieldset>
    `;
  }
  function renderStickyBottomSheetControl(settings) {
    const unavailable = settings.popupMode === "popover";
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? "hidden" : ""}>
                        ${checkbox("stickyBottomSheet", "Keep sheet open after lookup", settings.stickyBottomSheet && !unavailable, { disabled: unavailable })}
                    </div>`;
  }
  function renderNewTabSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-newtab" role="tabpanel" data-settings-panel="newTab" data-legend-key="newTab" hidden>
                <legend>Study</legend>
                ${renderNewTabSettingsSubsection(settings)}
            </fieldset>
    `;
  }
  function renderNewTabSettingsSubsection(settings) {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Study</div>
                    <div class="grid">
                        ${runningAsBrowserExtension() ? checkbox("newTabEnabled", "Set Study as the new tab", settings.newTabEnabled) : ""}
                        ${checkbox("newTabAnkiEnabled", "Use Anki cards in Study", settings.newTabAnkiEnabled)}
                        ${renderNewTabAnkiDeckControls(settings)}
                        ${select("newTabSource", "Study review source", settings.newTabSource, [["auto", "Auto: API/Anki, then study words"], ["jpdb", "API SRS (JPDB / Jiten)"], ["anki", "Anki"], ["dictionary", "Dictionary fallback"]])}
                        ${select("newTabJpdbReviewMode", "API review mode", settings.newTabJpdbReviewMode, [["auto", "Auto: live kanji + API vocabulary"], ["live-review", "Live JPDB review session"], ["api-vocabulary", "API vocabulary only"]])}
                        ${select("newTabKanjiKeywordSource", "Kanji keyword source", settings.newTabKanjiKeywordSource, kanjiKeywordSourceOptions(settings))}
                        ${checkbox("newTabParsingEnabled", "Parse sentences on Study", settings.newTabParsingEnabled)}
                        ${checkbox("newTabKanjiUnlockEnabled", "Study kanji before unlocking words", settings.newTabKanjiUnlockEnabled)}
                        ${checkbox("newTabStopAtBatchEnd", "Stop at the end of each batch", settings.newTabStopAtBatchEnd)}
                        ${checkbox("newTabSwipeReviews", "Swipe cards to grade (left = fail, right = pass)", settings.newTabSwipeReviews)}
                        ${checkbox("newTabFrontSentenceEnabled", "Show sentence on word fronts", settings.newTabFrontSentenceEnabled)}
                        ${checkbox("newTabKanjiAutogradeEnabled", "Autograde kanji drawing", settings.newTabKanjiAutogradeEnabled)}
                        ${checkbox("newTabKanjiAutoSubmit", "Submit kanji grade after autograde", settings.newTabKanjiAutoSubmit)}
                        ${checkbox("newTabOfflineEnabled", "Cache Study for offline use", settings.newTabOfflineEnabled)}
                        ${input("newTabOfflineLimit", "Offline review cache limit", String(settings.newTabOfflineLimit), "number", { min: 0, max: 500, step: 10 })}
                        ${input("newTabDailyGoalMinutes", "Daily study goal (minutes, 0 = off)", String(settings.newTabDailyGoalMinutes), "number", { min: 0, max: 1440, step: 5 })}
                        <label>Study address<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>Open Study</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">Copy address</button>
                    </div>
                    <div class="jpdb-reader-help" data-newtab-address-help>Set this as your browser's start or new-tab page (desktop browsers need a new-tab redirect extension), or add it to your iPad Home Screen.</div>
                    <div class="jpdb-reader-help" data-newtab-offline-help>Offline cache keeps your next due cards and queued grades in this browser; grades made offline sync when you reconnect.</div>
                </div>
    `;
  }
  function kanjiKeywordSourceOptions(settings, text) {
    const apiLabel = combinedApiCredentialLabel(settings);
    const auto = text ? text("newTabKanjiKeywordAuto").replace("{service}", apiLabel) : `Auto: RTK, then ${apiLabel} kanji facts, then local`;
    const apiFacts = text ? text("newTabKanjiKeywordApiFacts").replace("{service}", apiLabel) : `${apiLabel} kanji facts (JPDB / Jiten)`;
    return [
      ["auto", auto],
      ["rtk", text ? text("newTabKanjiKeywordRtk") : "RTK / Heisig"],
      ["jpdb", apiFacts],
      ["local", text ? text("newTabKanjiKeywordLocal") : "Local card meaning"]
    ];
  }
  function renderNewTabAnkiDeckControls(settings) {
    const disabled = canonicalNewTabAnkiDisabledDecks(settings.newTabAnkiDisabledDecks);
    const selector = renderNewTabAnkiDeckSelector(disabled, disabled, settings.interfaceLanguage);
    return `
                        ${renderNewTabAnkiDisabledDecksInput(disabled)}
                        <div class="jpdb-reader-newtab-anki-decks jpdb-reader-settings-wide" data-newtab-anki-decks ${selector ? "" : "hidden"}>
                            ${selector}
                        </div>`;
  }
  function renderNewTabAnkiDisabledDecksInput(disabled) {
    return `<input type="hidden" name="newTabAnkiDisabledDecks" value="${escapeHtml(disabled.join(", "))}">`;
  }
  function renderNewTabAnkiDeckSelector(disabledDecks, deckNames, language) {
    const disabled = canonicalNewTabAnkiDisabledDecks(disabledDecks);
    const decks = uniqueStrings([...deckNames, ...disabled]).map((deck) => deck.trim()).filter(Boolean);
    if (!decks.length) return "";
    return `
                            <div class="jpdb-reader-newtab-anki-decks-head">
                                <div class="jpdb-reader-newtab-anki-decks-title" data-newtab-anki-decks-title>${escapedUiText(language, "newTabAnkiReviewDecks")}</div>
                                <div class="jpdb-reader-help" data-newtab-anki-decks-help>${escapedUiText(language, "newTabAnkiReviewDecksHelp")}</div>
                            </div>
                            <div class="jpdb-reader-newtab-anki-deck-list" data-newtab-anki-deck-list>
                                ${decks.map((deck) => renderNewTabAnkiDeckToggle(deck, !isNewTabAnkiDeckDisabled(deck, disabled))).join("")}
                            </div>`;
  }
  function renderNewTabAnkiDeckToggle(deck, checked) {
    return `
                                <label class="jpdb-reader-newtab-anki-deck-toggle" data-newtab-anki-deck-row data-active="${checked ? "true" : "false"}">
                                    <input type="checkbox" data-newtab-anki-deck-toggle data-newtab-anki-deck="${escapeHtml(deck)}" ${checked ? "checked" : ""}>
                                    <span>${escapeHtml(deck)}</span>
                                </label>`;
  }
  function isNewTabAnkiDeckDisabled(deck, disabledDecks) {
    return disabledDecks.some((disabled) => disabled === deck || isAnkiSubdeckOf(deck, disabled));
  }
  function renderWordColorSettingsSubsection(settings) {
    return renderColorSettingsSubsection("Word colors", WORD_COLOR_FIELDS, settings);
  }
  function canonicalNewTabAnkiDisabledDecks(deckNames) {
    const unique = [];
    deckNames.map((deck) => deck.trim()).filter(Boolean).forEach((deck) => {
      if (!unique.includes(deck)) unique.push(deck);
    });
    return unique.filter((deck) => !unique.some((parent) => parent !== deck && isAnkiSubdeckOf(deck, parent)));
  }
  function isAnkiSubdeckOf(deck, parent) {
    return Boolean(parent && deck.startsWith(`${parent}::`));
  }
  const FURIGANA_HIDE_GROUPS = [
    ["known", "Known"],
    ["due", "Due"],
    ["failed", "Failed"],
    ["learning", "Learning"],
    ["new", "New"]
  ];
  const APPEARANCE_PRESET_OPTIONS = [
    ["", "Keep current custom settings"],
    ["balanced", "Balanced reading"],
    ["new-only", "Focus on new words"],
    ["underline-new", "Minimal highlights"],
    ["no-colors", "Plain text"]
  ];
  const FURIGANA_MODE_OPTIONS = [
    ["known-status", "Hide familiar words"],
    ["difficult-kanji", "Hard kanji only"],
    ["hover", "Show on hover"],
    ["all", "Show on every parsed word"],
    ["off", "Off"]
  ];
  const WORD_COLOR_STATE_OPTIONS = [
    ["all", "Use all learning states"],
    ["new-only", "Only new / not-in-deck words"]
  ];
  function renderFuriganaHiddenStateGroupControls(settings) {
    const selected = new Set(settings.furiganaHiddenStateGroups);
    const boxes = FURIGANA_HIDE_GROUPS.map(([group, label]) => checkbox(`furiganaHide-${group}`, label, selected.has(group))).join("");
    return `<fieldset class="jpdb-reader-radio-group" data-furigana-hide-groups${effectiveFuriganaMode(settings) === "known-status" ? "" : " hidden"}><legend>Hide furigana for</legend>${boxes}</fieldset>`;
  }
  function renderAppearancePreview() {
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-settings-preview-section">
                    <div class="jpdb-reader-local-title" data-settings-preview-title>Preview</div>
                    <div class="jpdb-reader-settings-appearance-preview" data-yomu-appearance-preview data-settings-preview-lookup lang="ja" aria-hidden="true">${appearancePreviewHtml()}</div>
                </div>`;
  }
  function appearancePreviewHtml() {
    const word = (classes, base, furi, tail = "") => `<span class="jpdb-reader-word jpdb-reader-has-furi ${classes}"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rt class="jpdb-reader-furi">${furi}</rt></ruby>${tail}</span>`;
    return `${word("jpdb-new anki-new jpdb-pitch-heiban", "新", "あたら", "しい")}${word("jpdb-learning anki-learning jpdb-pitch-atamadaka", "言葉", "ことば")}を${word("jpdb-due anki-due jpdb-pitch-nakadaka", "毎日", "まいにち")}${word("jpdb-failed anki-failed jpdb-pitch-odaka", "勉強", "べんきょう")}して、${word("jpdb-known anki-known jpdb-pitch-kifuku", "日本語", "にほんご")}が${word("jpdb-never-forget anki-known jpdb-pitch-heiban", "上手", "じょうず")}になる。`;
  }
  function renderPitchColorSettingsSubsection(settings) {
    return renderColorSettingsSubsection("Pitch accent colors", PITCH_COLOR_FIELDS, settings);
  }
  function renderColorChannelSettingsSubsection(settings) {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Color channels</div>
                    <div class="grid">
                        ${COLOR_CHANNEL_FIELDS.map(([name, label]) => select(name, label, settingsColorSourceValue(settings, name), colorSourceOptions(settings))).join("")}
                    </div>
                </div>
    `;
  }
  function renderColorSettingsSubsection(title, fields, settings) {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapeHtml(title)}</div>
                    <div class="grid jpdb-reader-color-grid">
                        ${renderColorInputs(fields, settings)}
                    </div>
                </div>
    `;
  }
  function renderColorInputs(fields, settings) {
    return fields.map(([name, label]) => input(name, label, settings[name], "color")).join("");
  }
  function renderAudioSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const autoPlayMode = settings.audioAutoPlayMode === "off" ? "all" : settings.audioAutoPlayMode;
    return `
            <fieldset id="jpdb-reader-settings-panel-audio" role="tabpanel" data-settings-panel="media" data-legend-key="audio" aria-describedby="settings-help-audio" hidden>
                <legend>${escapedUiText(language, "audio")}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("audioEnabled", uiText(language, "audioEnabled"), settings.audioEnabled)}
                    ${checkbox("suppressAutoAudioOnVideo", uiText(language, "suppressAutoAudioOnVideo"), settings.suppressAutoAudioOnVideo)}
                    ${checkbox("audioEnableDefaultSources", uiText(language, "audioEnableDefaultSources"), settings.audioEnableDefaultSources)}
                    ${checkbox("audioFallbackChimeEnabled", uiText(language, "audioFallbackChimeEnabled"), settings.audioFallbackChimeEnabled)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${checkbox("autoPlayAudio", uiText(language, "autoPlayAudio"), settings.autoPlayAudio)}
                    ${audioAutoPlayModeSelect(language, autoPlayMode, !settings.autoPlayAudio)}
                    ${select("audioSelectionMode", uiText(language, "audioSelectionMode"), settings.audioSelectionMode, [["first", uiText(language, "firstAudio")], ["random", uiText(language, "randomAudio")]])}
                    ${select("audioTtsMode", uiText(language, "audioTtsMode"), settings.audioTtsMode, [["fallback", uiText(language, "audioTtsFallback")], ["source-order", uiText(language, "audioTtsSourceOrder")]])}
                    ${input("audioTimeoutMs", uiText(language, "audioTimeoutMs"), String(settings.audioTimeoutMs), "number", { min: 1e3, max: 3e4, step: 500 })}
                    ${input("corsProxyUrl", uiText(language, "corsProxyUrl"), settings.corsProxyUrl, "url", { placeholder: "https://your-worker.workers.dev" })}
                </div>
                ${renderProxySetupGuide(language)}
                <div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>
                    ${renderAudioSourceEditor(settings.audioSources, language)}
                </div>
                <div id="settings-help-audio" class="jpdb-reader-help" data-help-key="audioHelp">${audioHelpHtml(language)}</div>
            </fieldset>
    `;
  }
  function audioAutoPlayModeSelect(language, value, disabled) {
    const options = [
      ["all", uiText(language, "audioAutoPlayAll")],
      ["hover", uiText(language, "audioAutoPlayHover")],
      ["tap", uiText(language, "audioAutoPlayTap")]
    ];
    return `<label>${escapedUiText(language, "audioAutoPlayMode")}<select name="audioAutoPlayMode" ${disabled ? "disabled" : ""}>${options.map(
      ([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(text)}</option>`
    ).join("")}</select>${disabled ? `<input type="hidden" name="audioAutoPlayMode" value="${escapeHtml(value)}">` : ""}</label>`;
  }
  function renderProxySetupGuide(language) {
    return `
                <details class="jpdb-reader-proxy-guide">
                    <summary>
                        <span data-proxy-guide-summary>${escapedUiText(language, "audioProxyGuideSummary")}</span>
                        <span class="jpdb-reader-proxy-guide-toggle" aria-hidden="true">
                            <span data-proxy-guide-show>${escapedUiText(language, "show")}</span>
                            <span data-proxy-guide-hide>${escapedUiText(language, "hide")}</span>
                        </span>
                    </summary>
                    <div class="jpdb-reader-proxy-guide-body">
                        <p>${escapedUiText(language, "audioProxyGuideIntro")}</p>
                        <ol>
                            <li>${escapedUiText(language, "audioProxyGuideCloudflare")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideWorkers")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideCreateWorker")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideEditCode")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideDeploy")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideCopyUrl")}</li>
                            <li>${escapedUiText(language, "audioProxyGuidePasteUrl")}</li>
                            <li>${escapedUiText(language, "audioProxyGuideTest")}</li>
                        </ol>
                        <p>${escapedUiText(language, "audioProxyGuideNote")}</p>
                        <div class="jpdb-reader-help-actions">
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_SOURCE_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, "audioProxyWorkerSource"))}</a>
                            <a class="jpdb-reader-btn" href="${PROXY_WORKER_README_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, "audioProxyDeployGuide"))}</a>
                        </div>
                    </div>
                </details>
    `;
  }
  function renderImmersionKitSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-immersion-kit" role="tabpanel" data-settings-panel="media" data-legend-key="immersionKit" aria-describedby="settings-help-immersion-kit" hidden>
                <legend>${escapedUiText(language, "immersionKit")}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("immersionKitEnabled", uiText(language, "immersionKitEnabled"), settings.immersionKitEnabled)}
                    ${checkbox("immersionKitShowTranslation", uiText(language, "immersionKitShowTranslation"), settings.immersionKitShowTranslation)}
                    ${checkbox("immersionKitRevealTranslationOnClick", uiText(language, "immersionKitRevealTranslationOnClick"), settings.immersionKitRevealTranslationOnClick, { disabled: !settings.immersionKitShowTranslation })}
                    ${checkbox("immersionKitShowImages", uiText(language, "immersionKitShowImages"), settings.immersionKitShowImages)}
                    ${checkbox("immersionKitExactMatch", uiText(language, "immersionKitExactMatch"), settings.immersionKitExactMatch)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select("immersionKitExampleSource", uiText(language, "immersionKitExampleSource"), settings.immersionKitExampleSource, [["immersion-kit", uiText(language, "immersionKit")], ["nadeshiko", "Nadeshiko"], ["combined", uiText(language, "immersionKitAndNadeshiko")]])}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${select("immersionKitCategory", uiText(language, "immersionKitCategory"), settings.immersionKitCategory, [["all", uiText(language, "allCategories")], ["anime", uiText(language, "anime")], ["drama", uiText(language, "drama")], ["games", uiText(language, "games")]])}
                    ${select("immersionKitSort", uiText(language, "immersionKitSort"), settings.immersionKitSort, [["sentence_length:asc", uiText(language, "shortestFirst")], ["sentence_length:desc", uiText(language, "longestFirst")]])}
                    ${radioGroup("immersionKitLimitEnabled", uiText(language, "immersionKitLimitEnabled"), settings.immersionKitLimitEnabled ? "on" : "off", [["off", uiText(language, "allExamples")], ["on", uiText(language, "limitExamples")]])}
                    ${input("immersionKitLimit", uiText(language, "immersionKitLimit"), String(settings.immersionKitLimit), "number", { min: 1, max: 12, step: 1 })}
                    ${input("immersionKitMinLength", uiText(language, "immersionKitMinLength"), String(settings.immersionKitMinLength), "number", { min: 0, max: 120, step: 1 })}
                    ${input("immersionKitMaxLength", uiText(language, "immersionKitMaxLength"), String(settings.immersionKitMaxLength), "number", { min: 0, max: 240, step: 1 })}
                    ${input("immersionKitPlaybackRate", uiText(language, "immersionKitPlaybackRate"), String(settings.immersionKitPlaybackRate), "number", { min: 0.5, max: 2, step: 0.05 })}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, "audioPlayback")}</div>
                    <div class="grid jpdb-reader-settings-tgrid">
                        ${checkbox("immersionKitAutoPlayAudio", uiText(language, "immersionKitAutoPlayAudio"), settings.immersionKitAutoPlayAudio)}
                        ${checkbox("immersionKitPlayOnHover", uiText(language, "immersionKitPlayOnHover"), settings.immersionKitPlayOnHover)}
                        ${checkbox("immersionKitPlayOnImageClick", uiText(language, "immersionKitPlayOnImageClick"), settings.immersionKitPlayOnImageClick)}
                    </div>
                </div>
                <div id="settings-help-immersion-kit" class="jpdb-reader-help" data-help-key="immersionKitHelp">${escapedUiText(language, "immersionKitHelp")}</div>
            </fieldset>
    `;
  }
  function renderNadeshikoApiKeyField(settings) {
    const language = settings.interfaceLanguage;
    return `
                    <div data-nadeshiko-api-key-field ${usesNadeshikoExamples(settings.immersionKitExampleSource) ? "" : "hidden"}>
                        ${input("nadeshikoApiKey", `${escapedUiText(language, "nadeshikoApiKey")} <a href="${NADESHIKO_DEVELOPER_URL}" target="_blank" rel="noopener">${externalButtonLabel(uiText(language, "getNadeshikoKey"))}</a>`, settings.nadeshikoApiKey, "text", { class: "jpdb-reader-masked-input" })}
                    </div>`;
  }
  function usesNadeshikoExamples(source) {
    return source === "nadeshiko" || source === "combined";
  }
  function renderReaderSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-reader" role="tabpanel" data-settings-panel="appearance" data-legend-key="reader" aria-describedby="settings-help-reader" hidden>
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox("parseSelection", "Look up selected text", settings.parseSelection)}
                    ${checkbox("lookupOnClick", "Look up on tap or click", settings.lookupOnClick)}
                    ${checkbox("lookupOnHover", "Look up on hover", settings.lookupOnHover)}
                    ${checkbox("lookupOnMiddleMouse", "Look up with middle-mouse hold", settings.lookupOnMiddleMouse)}
                    ${checkbox("showFloatingButton", uiText(settings.interfaceLanguage, "showFloatingButton"), settings.showFloatingButton)}
                    ${select("appearancePreset", "Quick setup", "", APPEARANCE_PRESET_OPTIONS)}
                    ${select("furiganaMode", "Furigana", effectiveFuriganaMode(settings), FURIGANA_MODE_OPTIONS)}
                    ${renderFuriganaHiddenStateGroupControls(settings)}
                    ${select("wordColorStates", "Color words", settings.wordColorStates, WORD_COLOR_STATE_OPTIONS)}
                    ${checkbox("showPitchAccent", "Show pitch accent", settings.showPitchAccent)}
                    ${checkbox("suppressRedundantWordUi", "Hide styling on JPDB-redundant words", settings.suppressRedundantWordUi)}
                    ${checkbox("sheetCloseButtonOnLeft", "Mobile sheet: close button on the left", settings.sheetCloseButtonOnLeft)}
                </div>
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderHoverLookupSettingsSubsection(settings)}
                <div id="settings-help-reader" class="jpdb-reader-help" data-help-key="readerHelp">Set a hover key. Blank means plain hover.</div>
            </fieldset>
    `;
  }
  function renderHoverLookupSettingsSubsection(settings) {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-hover-lookup-title>Hover lookup</div>
                    <div class="grid">
                        ${shortcutInput("shortcuts.hoverLookup", "Hold while hovering", settings.shortcuts.hoverLookup, "Blank means hover without a key")}
                        ${input("hoverOpenDelayMs", "Hover open delay (ms)", String(settings.hoverOpenDelayMs), "number")}
                        ${input("hoverCloseDelayMs", "Hover close delay (ms)", String(settings.hoverCloseDelayMs), "number")}
                    </div>
                </div>
    `;
  }
  function renderKanjiSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-kanji" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="kanji" hidden>
                <legend>Kanji</legend>
                <div class="jpdb-reader-kanji-priorities" data-source-editor>
                    ${renderKanjiSourceRows(settings)}
                </div>
                ${renderHiddenKanjiDetailSettings(settings)}
            </fieldset>
    `;
  }
  function renderHiddenKanjiDetailSettings(settings) {
    return `
                ${hiddenBooleanSetting("kanjiOriginKanjiMapEnabled", settings.kanjiOriginKanjiMapEnabled)}
                ${hiddenBooleanSetting("kanjiOriginGraphEnabled", settings.kanjiOriginGraphEnabled)}
                ${hiddenBooleanSetting("kanjiOriginRadicalImagesEnabled", settings.kanjiOriginRadicalImagesEnabled)}
                <input type="hidden" name="similarKanjiWordLimit" value="${settings.similarKanjiWordLimit}">
    `;
  }
  function hiddenBooleanSetting(name, enabled) {
    return enabled ? `<input type="hidden" name="${name}" value="on">` : "";
  }
  function renderImageSettingsPanel(settings) {
    const localOcrHidden = settings.ocrProvider === "local-service" ? "" : "hidden";
    const cloudOcrHidden = settings.ocrProvider === "cloud-vision" ? "" : "hidden";
    return `
            <fieldset id="jpdb-reader-settings-panel-ocr" role="tabpanel" data-settings-panel="media" data-legend-key="images" aria-describedby="settings-help-ocr" hidden>
                <legend>Image text (OCR)</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("ocrEnabled", "Read text in images", settings.ocrEnabled)}
                    ${checkbox("ocrShowTextOverlay", "Show recognized text on images", settings.ocrShowTextOverlay)}
                    ${checkbox("ocrVideoPauseFrames", "Read paused video frames", settings.ocrVideoPauseFrames)}
                    ${checkbox("ocrVideoFrameStatusCard", "Show paused-frame status card", settings.ocrVideoFrameStatusCard)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select("ocrProvider", "Image reading", settings.ocrProvider, [["google-lens", "Google Lens (recommended)"], ["cloud-vision", "Google Cloud Vision"], ["local-service", "Local OCR engine"], ["off", "Off"]])}
                    ${select("ocrMaxImagesPerPage", "Images to read per page", String(settings.ocrMaxImagesPerPage), [["3", "Light"], ["8", "Normal"], ["16", "More"]])}
                    ${select("ocrMinImageArea", "Smallest image to read", String(settings.ocrMinImageArea), [["80000", "Large images only"], ["45000", "Normal"], ["15000", "Include small images"]])}
                    ${select("ocrMaxImagePixels", "Image detail", String(settings.ocrMaxImagePixels), [["640000", "Faster"], ["1200000", "Balanced"], ["2000000", "Sharper"]])}
                    ${renderColorInputs(OCR_COLOR_FIELDS, settings)}
                    ${input("ocrBackgroundOpacity", "Image highlight opacity", String(settings.ocrBackgroundOpacity), "number")}
                    ${input("ocrFontScale", "Image text scale", String(settings.ocrFontScale), "number")}
                    <div data-local-ocr ${localOcrHidden}>${select("ocrEngine", "Local OCR engine", settings.ocrEngine, [["auto", "Automatic"], ["MangaOCR", "MangaOCR"], ["PaddleOCR", "PaddleOCR"], ["AppleVision", "Apple Vision"]])}</div>
                    <details data-local-ocr ${localOcrHidden}>
                        <summary>Custom local OCR server</summary>
                        <label>Custom local OCR URL<input name="ocrEndpointUrl" type="url" value="${escapeHtml(settings.ocrEndpointUrl)}" placeholder="http://127.0.0.1:7331/ocr" autocomplete="off"></label>
                    </details>
                    <label data-cloud-ocr ${cloudOcrHidden}>Cloud Vision API key<input name="ocrCloudVisionApiKey" type="text" class="jpdb-reader-masked-input" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"${API_KEY_INPUT_ATTRIBUTE_HTML}></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                </div>
                <div id="settings-help-ocr" class="jpdb-reader-help" data-help-key="ocrHelp">Reads images near the viewport.</div>
            </fieldset>
    `;
  }
  function renderVideoSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-video" role="tabpanel" data-settings-panel="media" data-legend-key="video" hidden>
                <legend>Video</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("subtitlePlayerEnabled", "Enable video subtitle player", settings.subtitlePlayerEnabled)}
                    ${checkbox("subtitleAutoDetect", "Auto-detect page subtitles", settings.subtitleAutoDetect)}
                    ${checkbox("subtitleOverlayVisible", "Show subtitle overlay", settings.subtitleOverlayVisible)}
                    ${checkbox("subtitleSecondaryVisible", "Show native subtitles when available", settings.subtitleSecondaryVisible)}
                    ${checkbox("subtitleNativeBlurred", "Blur native subtitles until hover", settings.subtitleNativeBlurred)}
                    ${checkbox("subtitleKaraokeMode", "Karaoke word timing", settings.subtitleKaraokeMode)}
                    ${checkbox("subtitleTranscriptVisible", "Open transcript panel by default", settings.subtitleTranscriptVisible)}
                    ${checkbox("subtitlePausePanel", "Open side panel when paused", settings.subtitlePausePanel)}
                    ${checkbox("subtitleTranscriptAutoScroll", "Scroll transcript with playback", settings.subtitleTranscriptAutoScroll)}
                    ${checkbox("subtitleAutoCopyLine", "Auto-copy each subtitle line as it plays", settings.subtitleAutoCopyLine)}
                    ${checkbox("subtitleCopyIncludeTranslation", "Include the translation when copying a line", settings.subtitleCopyIncludeTranslation)}
                    ${checkbox("subtitleMiningPause", "Pause video when mining subtitle", settings.subtitleMiningPause)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${input("subtitleTranscriptAutoScrollResumeSeconds", "Resume transcript auto-scroll after manual scroll (s)", String(settings.subtitleTranscriptAutoScrollResumeSeconds), "number")}
                    ${select("subtitleControlsMode", "Subtitle controls", settings.subtitleControlsMode, [["auto", "Compact controls"], ["hidden", "Hide controls"], ["always", "Always visible"]])}
                    ${input("subtitleFontSize", "Subtitle font size (px)", String(settings.subtitleFontSize), "number")}
                    ${input("subtitleBottomOffset", "Subtitle bottom offset (%)", String(settings.subtitleBottomOffset), "number")}
                    ${renderColorInputs(SUBTITLE_COLOR_FIELDS, settings)}
                    ${input("subtitleBackgroundOpacity", "Subtitle background opacity", String(settings.subtitleBackgroundOpacity), "number")}
                    ${fontFamilyControl("subtitleFontFamily", "Subtitle font family", settings.subtitleFontFamily)}
                    ${input("subtitleFontWeight", "Subtitle font weight", String(settings.subtitleFontWeight), "number")}
                    ${input("subtitleSeekPadding", "Subtitle seek padding (s)", String(settings.subtitleSeekPadding), "number")}
                </div>
                ${renderSubtitlePreview()}
            </fieldset>
    `;
  }
  function renderSubtitlePreview() {
    return `
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-settings-preview-lookup="新しい" data-sentence="新しい言葉を読む" tabindex="-1">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning jpdb-pitch-atamadaka" data-settings-preview-lookup="言葉" data-sentence="新しい言葉を読む" tabindex="-1">言葉</span>
                        <span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka" data-settings-preview-lookup="を" data-sentence="新しい言葉を読む" tabindex="-1">を</span>
                        <span class="jpdb-reader-word jpdb-due jpdb-pitch-odaka" data-settings-preview-lookup="読む" data-sentence="新しい言葉を読む" tabindex="-1">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">Live subtitle preview</div>
                </div>
    `;
  }
  function renderYoutubeSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-youtube" role="tabpanel" data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>YouTube</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("youtubeImmersionEnabled", "Japanese YouTube only", settings.youtubeImmersionEnabled)}
                    ${checkbox("preferJapaneseSiteLanguage", "Prefer Japanese site language and location", settings.preferJapaneseSiteLanguage)}
                    ${checkbox("youtubeShowChannelRecommendations", "Show Japanese channel suggestions", settings.youtubeShowChannelRecommendations)}
                    ${checkbox("youtubeShowFilterNotice", "Show hidden-video notice", settings.youtubeShowFilterNotice)}
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>Prefer Japanese UI and Japan-local content.</div>
            </fieldset>
    `;
  }
  function renderMiningSettingsPanel(settings) {
    const ankiStatus = ankiStatusLineForSettings(settings, settings.interfaceLanguage);
    return renderAnkiMiningSettingsPanel(settings, {
      tone: ankiStatus.tone,
      html: renderAnkiStatusHtml(ankiStatus, settings.interfaceLanguage)
    });
  }
  function renderDictionariesSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-dictionaries" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="sources" hidden>
                <legend>Sources</legend>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status role="status" aria-live="polite">Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div data-frequency-dictionaries>${renderFrequencyDictionaryRows(settings)}</div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">Lookup pills</div>
                    <div class="jpdb-reader-help">External links. Tokens: {query}, {word}, {reading}.</div>
                    <div class="jpdb-reader-lookup-links" data-source-editor>
                        ${renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks)}
                    </div>
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries([])}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
    `;
  }
  function renderShortcutSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-shortcuts" role="tabpanel" data-settings-panel="shortcuts" data-legend-key="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput("shortcuts.scanPage", "Scan page", settings.shortcuts.scanPage)}
                    ${shortcutInput("shortcuts.hoverLookup", "Hold while hovering", settings.shortcuts.hoverLookup, "Blank means hover without a key")}
                    ${shortcutInput("shortcuts.openSettings", "Open settings", settings.shortcuts.openSettings)}
                    ${shortcutInput("shortcuts.playAudio", "Play audio", settings.shortcuts.playAudio)}
                    ${shortcutInput("shortcuts.closePopup", "Close popup", settings.shortcuts.closePopup)}
                    ${shortcutInput("shortcuts.previousLookupWord", "Previous word", settings.shortcuts.previousLookupWord)}
                    ${shortcutInput("shortcuts.nextLookupWord", "Next word", settings.shortcuts.nextLookupWord)}
                    ${shortcutInput("shortcuts.previousSubtitle", "Previous subtitle", settings.shortcuts.previousSubtitle)}
                    ${shortcutInput("shortcuts.nextSubtitle", "Next subtitle", settings.shortcuts.nextSubtitle)}
                    ${shortcutInput("shortcuts.copySubtitle", "Copy subtitle", settings.shortcuts.copySubtitle)}
                    ${shortcutInput("shortcuts.toggleOcr", "Toggle image reading", settings.shortcuts.toggleOcr)}
                    ${shortcutInput("shortcuts.toggleSubtitleOverlay", "Toggle subtitle overlay", settings.shortcuts.toggleSubtitleOverlay)}
                    ${shortcutInput("shortcuts.toggleYoutubeImmersion", "Toggle YouTube filter", settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput("shortcuts.scanImages", "Read images now", settings.shortcuts.scanImages)}
                    ${shortcutInput("shortcuts.massReviewVisible", "Mass review visible words (Jiten)", settings.shortcuts.massReviewVisible)}
                    ${shortcutInput("shortcuts.studyReveal", "Study: reveal card", settings.shortcuts.studyReveal)}
                    ${shortcutInput("shortcuts.studyRevealAlternate", "Study: reveal card (alternate)", settings.shortcuts.studyRevealAlternate)}
                    ${shortcutInput("shortcuts.studyUndo", "Study: undo last review", settings.shortcuts.studyUndo)}
                    ${shortcutInput("shortcuts.studyPrevious", "Study: previous card", settings.shortcuts.studyPrevious)}
                    ${shortcutInput("shortcuts.studyPreviousAlternate", "Study: previous card (alternate)", settings.shortcuts.studyPreviousAlternate)}
                    ${shortcutInput("shortcuts.studyNext", "Study: next card", settings.shortcuts.studyNext)}
                    ${shortcutInput("shortcuts.studyNextAlternate", "Study: next card (alternate)", settings.shortcuts.studyNextAlternate)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
    `;
  }
  function renderHelpSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-help" role="tabpanel" data-settings-panel="help" data-legend-key="help" hidden>
                <legend>Help</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-diagnostics-title>Diagnostics</div>
                    <div class="grid">
                        ${checkbox("enableLogging", "Enable console logging", settings.enableLogging)}
                    </div>
                    <div class="jpdb-reader-help" data-diagnostics-help>Print diagnostics to the console.</div>
                </div>
                ${renderHelpLinksPanel()}
            </fieldset>
    `;
  }
  function renderSettingsFooter() {
    return `
            <div class="footer">
                <div class="jpdb-reader-settings-save-status" data-settings-save-status role="status" aria-live="polite" hidden></div>
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
    `;
  }
  function fontFamilyControl(name, label, value, text) {
    const selectedValue = fontFamilyPresetValue(value);
    return `
        <div class="jpdb-reader-font-family-control" data-font-family-control="${name}">
            ${select(name, label, selectedValue, fontFamilyOptions(text))}
            <label class="jpdb-reader-font-family-custom" data-font-family-custom ${selectedValue === CUSTOM_FONT_FAMILY_VALUE ? "" : "hidden"}>
                Custom font stack
                <input name="${name}Custom" type="text" value="${escapeHtml(value)}" placeholder="&quot;Noto Sans JP&quot;, sans-serif" autocomplete="off">
            </label>
        </div>
    `;
  }
  function fontFamilyPresetValue(value) {
    return FONT_FAMILY_PRESETS.some((preset) => preset.value === value) ? value : CUSTOM_FONT_FAMILY_VALUE;
  }
  function fontFamilyOptions(text) {
    return [
      ...FONT_FAMILY_PRESETS.map((preset) => [
        preset.value,
        text ? text(preset.labelKey) : preset.fallbackLabel
      ]),
      [CUSTOM_FONT_FAMILY_VALUE, text ? text("fontPresetCustom") : "Custom..."]
    ];
  }
  function themeSegmentedControl(value) {
    const isDark = value === "dark";
    return `
        <div class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>Theme</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${isDark ? "Switch to light theme" : "Switch to dark theme"}" aria-labelledby="jpdb-reader-theme-label" aria-describedby="jpdb-reader-theme-label" aria-checked="${isDark}" title="${isDark ? "Switch to light theme" : "Switch to dark theme"}">
                    <span class="check">
                        <span class="icon">
                            <span class="vpi-sun sun" aria-hidden="true"></span>
                            <span class="vpi-moon moon" aria-hidden="true"></span>
                        </span>
                    </span>
                </button>
            </div>
        </div>
    `;
  }
  function getFormInterfaceLanguage(form, fallback) {
    const value = getNamedControl(form, "interfaceLanguage")?.value;
    return value === "auto" || value === "en" || value === "ja" ? value : fallback;
  }
  function localizeSettingsForm(form, language) {
    unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: "[data-settings-preview-lookup], [data-settings-preview-lookup] .jpdb-reader-word" });
    const text = (key) => uiText(language, key);
    localizeSettingsShell(form, language, text);
    localizeSettingsLabels(form, text);
    localizeSettingsSectionTitles(form, text);
    localizeSettingsSelects(form, text);
    localizeSettingsShortcuts(form, text);
    localizeSettingsHelpText(form, text);
    localizeSettingsActions(form, text);
    localizeSettingsEditorChrome(form, text);
    localizeHelpLinksPanel(form, language);
    syncSettingsSelectOptionMeta(form, language);
    normalizeSettingsLabelTextContainers(form);
    syncDisabledSettingsControlDescriptions(form, language);
  }
  function syncDisabledSettingsControlDescriptions(form, language) {
    const description = ensureDisabledControlDescription(form);
    description.textContent = uiText(language, "disabledControlDescription");
    form.querySelectorAll("input:disabled, select:disabled, textarea:disabled").forEach((control) => {
      appendDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
    form.querySelectorAll("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)").forEach((control) => {
      removeDescribedBy(control, DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID);
    });
  }
  function ensureDisabledControlDescription(form) {
    let description = form.querySelector(`#${DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID}`);
    if (description) return description;
    description = document.createElement("div");
    description.id = DISABLED_SETTINGS_CONTROL_DESCRIPTION_ID;
    description.className = "jpdb-reader-sr-only";
    form.prepend(description);
    return description;
  }
  function appendDescribedBy(control, id) {
    const ids = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
    ids.add(id);
    control.setAttribute("aria-describedby", Array.from(ids).join(" "));
  }
  function removeDescribedBy(control, id) {
    const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).filter((value) => value !== id);
    if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
    else control.removeAttribute("aria-describedby");
  }
  const LOCAL_TITLE_TEXT_KEYS = [
    [/API access|APIアクセス/, "apiAccess"],
    [/Word colors|単語の色/, "wordColors"],
    [/Pitch accent colors|ピッチアクセント/, "pitchAccentColors"],
    [/Color channels|色チャンネル/, "colorChannels"],
    [/Study|学習|New tab|新規タブ/, "newTab"],
    [/Dictionary site enhancements|辞書サイト拡張|JPDB page enhancements|JPDBページ拡張/, "jpdbPageEnhancements"],
    [/Lookup pills|検索ピル/, "lookupPills"]
  ];
  const SELECTOR_TEXT_KEYS = [
    ["[data-hover-lookup-title]", "hoverLookupSettings"],
    ["[data-diagnostics-title]", "diagnostics"],
    ["[data-anki-library-adapter-title]", "ankiLibraryAdapter"],
    ["[data-jpdb-api-key-help]", "apiAccessHelp"],
    ["[data-subtitle-preview] .jpdb-subtitle-secondary", "subtitlePreview"],
    ["[data-settings-preview-title]", "preview"],
    ["[data-proxy-guide-summary]", "audioProxyGuideSummary"],
    ["[data-proxy-guide-show]", "show"],
    ["[data-proxy-guide-hide]", "hide"]
  ];
  const SETTINGS_ACTION_TEXT_KEYS = [
    ['[data-action="test-anki"]', "testAnki"],
    ['[data-action="prepare-anki"]', "prepareAnki"],
    ['[data-action="copy-newtab-url"]', "copyAddress"],
    ["[data-newtab-url-link]", "openNewTabPage"],
    ['[data-action="import-yomitan-settings"]', "importSettings"],
    ['[data-action="export-reader-settings"]', "exportSettings"],
    ['[data-action="import-yomitan-dictionary"]', "importDictionaries"],
    ['[data-action="export-yomitan-dictionary"]', "exportDictionaries"],
    ['[data-action="audio-source-add"]', "addAudioSource"],
    ['[data-action="cancel"]', "cancel"]
  ];
  const HELP_LINK_PANEL_TEXT_KEYS = [
    ["[data-help-links-title]", "helpLinksTitle"],
    ["[data-help-links-copy]", "helpLinksCopy"],
    ["[data-help-support-title]", "helpSupportTitle"],
    ["[data-help-support-copy]", "helpSupportCopy"],
    ["[data-help-support-copy-extra]", "helpSupportCopyExtra"],
    ['[data-help-link="factory-reset"]', "factoryReset"]
  ];
  const HELP_LINK_BUTTON_TEXT_KEYS = [
    ["video-player", "videoPlayer"],
    ["new-tab", "newTabPage"],
    ["docs", "docs"],
    ["issues", "issues"],
    ["donate", "donate"],
    ["discord", "discord"]
  ];
  const ANKI_TEMPLATE_PREVIEW_SMALL_TEXT_KEYS = [
    [/above the prompt/, "imageAbovePrompt"],
    [/highlighted word/, "recallHighlightedWord"],
    [/front when available/, "imageOnFront"],
    [/meaning first/, "recallMeaning"],
    [/Includes dictionary/, "ankiBackIncludes"]
  ];
  const DECK_HELP_TEXT_KEYS = [
    [/Decks are loaded|JPDBアカウント/, "decksLoaded"],
    [/Could not load decks|まだデッキ/, "decksUnavailable"],
    [/Add your JPDB API key|JPDB APIキー/, "addApiKeyChooseDecks"]
  ];
  function localizeSettingsShell(form, language, text) {
    form.lang = resolveUiLanguage(language);
    form.setAttribute("aria-label", text("settingsTitle"));
    form.querySelector("h2")?.replaceChildren(text("settingsTitle"));
    form.querySelector(".jpdb-reader-settings-tabs")?.setAttribute("aria-label", text("settingsSections"));
    form.querySelector(".jpdb-reader-settings-drag-handle")?.setAttribute("aria-label", text("resizeSettings"));
    localizeThemeSwitch(form, text);
    localizeSettingsTabs(form, text);
    localizeSettingsSearch(form, text);
    localizeSettingsLegends(form, text);
  }
  function localizeThemeSwitch(form, text) {
    const switchButton = form.querySelector("[data-theme-switch]");
    if (!switchButton) return;
    const isDark = switchButton.getAttribute("aria-checked") === "true";
    const label = isDark ? text("switchToLightTheme") : text("switchToDarkTheme");
    switchButton.setAttribute("aria-label", label);
    switchButton.title = label;
  }
  function localizeSettingsTabs(form, text) {
    SETTINGS_TABS.forEach(({ panel, labelKey }) => {
      const key = labelKey ?? panel;
      form.querySelector(`[data-action="settings-panel"][data-panel="${panel}"]`)?.replaceChildren(text(key));
    });
  }
  function localizeSettingsSearch(form, text) {
    const input2 = form.querySelector("[data-settings-search]");
    input2?.closest("label")?.querySelector(":scope > .jpdb-reader-settings-label-text")?.replaceChildren(text("settingsSearch"));
    if (input2) {
      input2.placeholder = text("settingsSearchPlaceholder");
      input2.setAttribute("aria-label", text("settingsSearch"));
    }
    form.querySelector("[data-settings-search-empty]")?.replaceChildren(text("settingsSearchNoResults"));
    applySettingsSearch(form, input2?.value ?? "");
  }
  function localizeSettingsLegends(form, text) {
    getSettingsPanelFieldsets(form).forEach((fieldset) => {
      const key = fieldset.dataset.legendKey;
      if (!isSettingsTextKey(key)) return;
      directFieldsetLegend(fieldset)?.replaceChildren(text(key));
    });
  }
  function apiCredentialSettingsFromForm(form) {
    const jpdbField = getNamedControl(form, "apiCredentialJpdb");
    const jitenField = getNamedControl(form, "apiCredentialJiten");
    if (jpdbField || jitenField) return mergeApiCredentialValues(jpdbField?.value ?? "", jitenField?.value ?? "");
    const combined = getNamedControl(form, "apiCredential")?.value ?? "";
    if (combined.trim()) return { apiKey: combined, jitenApiKey: "" };
    return {
      apiKey: getNamedControl(form, "apiKey")?.value ?? "",
      jitenApiKey: getNamedControl(form, "jitenApiKey")?.value ?? ""
    };
  }
  function apiCredentialLabelFromForm(form) {
    return combinedApiCredentialLabel(apiCredentialSettingsFromForm(form));
  }
  function localizeSettingsLabels(form, text) {
    SETTINGS_CONTROL_LABELS.forEach(([name, key]) => setControlLabel(form, name, text(key)));
    const jpdbSettings = form.querySelector('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text("jpdbSettings");
    const jitenSettings = form.querySelector('label a[href*="jiten.moe/settings"]');
    if (jitenSettings) jitenSettings.textContent = text("jitenSettings");
    const nadeshikoKeyLink = form.querySelector('label a[href*="nadeshiko.co/user/developer"]');
    if (nadeshikoKeyLink) nadeshikoKeyLink.textContent = text("getNadeshikoKey");
    localizeBlockControlLabel(form, "ocrEndpointUrl", text("ocrEndpointUrl"));
    localizeBlockControlLabel(form, "ocrCloudVisionApiKey", text("cloudVisionApiKey"));
    localizeFontFamilyCustomLabels(form, text);
  }
  function localizeBlockControlLabel(form, name, label) {
    const labelElement = getNamedControl(form, name)?.closest("label");
    if (labelElement) setBlockLabelText(labelElement, label);
  }
  function localizeFontFamilyCustomLabels(form, text) {
    form.querySelectorAll(".jpdb-reader-font-family-custom").forEach((label) => {
      setBlockLabelText(label, text("customFontFamily"));
    });
  }
  function localizeSettingsSectionTitles(form, text) {
    LOCAL_TITLE_TEXT_KEYS.forEach(([pattern, key]) => replaceLocalTitle(form, pattern, text(key)));
    SELECTOR_TEXT_KEYS.forEach(([selector, key]) => {
      form.querySelector(selector)?.replaceChildren(text(key));
    });
  }
  function replaceLocalTitle(form, pattern, value) {
    const title = Array.from(form.querySelectorAll(".jpdb-reader-local-title")).find((element) => pattern.test(element.textContent ?? ""));
    title?.replaceChildren(value);
  }
  function localizeSettingsSelects(form, text) {
    localizeBasicSettingsSelects(form, text);
    localizeColorAndReaderSelects(form, text);
    localizeMediaSettingsSelects(form, text);
    localizeMiningSettingsSelects(form, text);
  }
  function localizeBasicSettingsSelects(form, text) {
    setSelectOptionLabels(form, "interfaceLanguage", [
      ["auto", text("automatic")],
      ["en", text("english")],
      ["ja", text("japanese")]
    ]);
    form.querySelector("[data-theme-title]")?.replaceChildren(text("theme"));
    setSelectOptionLabels(form, "popupMode", [
      ["auto", text("auto")],
      ["sheet", text("bottomSheet")],
      ["popover", text("popover")]
    ]);
    setSelectOptionLabels(form, "popoverHeightMode", [
      ["available", text("popoverHeightAvailable")],
      ["fixed", text("popoverHeightFixed")]
    ]);
    setSelectOptionLabels(form, "readerFontFamily", fontFamilyOptions(text));
    setSelectOptionLabels(form, "popupFontFamily", fontFamilyOptions(text));
    setSelectOptionLabels(form, "newTabSource", [
      ["auto", text("newTabAuto")],
      ["jpdb", text("newTabApiSrs")],
      ["anki", "Anki"],
      ["dictionary", text("dictionaryFallback")]
    ]);
    setSelectOptionLabels(form, "newTabJpdbReviewMode", [
      ["auto", text("newTabJpdbReviewAuto")],
      ["live-review", text("newTabLiveReview")],
      ["api-vocabulary", text("newTabApiVocabulary")]
    ]);
    setSelectOptionLabels(form, "newTabKanjiKeywordSource", kanjiKeywordSourceOptions(apiCredentialSettingsFromForm(form), text));
    setSelectOptionLabels(form, "twoButtonReviews", [
      ["false", text("fivePoint")],
      ["true", text("twoPoint")]
    ]);
  }
  function localizeColorAndReaderSelects(form, text) {
    localizeColorSourceSelects(form, text);
    setSelectOptionLabels(form, "appearancePreset", [
      ["", text("appearancePresetCustom")],
      ["balanced", text("appearancePresetBalanced")],
      ["new-only", text("appearancePresetNewOnly")],
      ["underline-new", text("appearancePresetUnderlineNew")],
      ["no-colors", text("appearancePresetNoColors")]
    ]);
    setSelectOptionLabels(form, "wordColorStates", [
      ["all", text("wordColorStatesAll")],
      ["new-only", text("wordColorStatesNewOnly")]
    ]);
    setSelectOptionLabels(form, "furiganaMode", [
      ["auto", text("automatic")],
      ["known-status", text("furiganaHideKnown")],
      ["difficult-kanji", text("furiganaDifficultKanji")],
      ["hover", text("furiganaHoverOnly")],
      ["all", text("furiganaAllParsed")],
      ["off", text("off")]
    ]);
  }
  function localizeColorSourceSelects(form, text) {
    const apiLabel = apiCredentialLabelFromForm(form);
    [
      "wordHighlightColorSource",
      "wordUnderlineColorSource",
      "wordTextColorSource",
      "subtitleHighlightColorSource",
      "subtitleUnderlineColorSource",
      "subtitleTextColorSource"
    ].forEach((name) => setSelectOptionLabels(form, name, [
      ["status", text("colorSourceStatus").replace("JPDB", apiLabel)],
      ["jpdb", text("colorSourceJpdb").replace("JPDB", apiLabel)],
      ["anki", text("colorSourceAnki")],
      ["pitch", text("colorSourcePitch")],
      ["off", text("off")]
    ]));
  }
  function localizeMediaSettingsSelects(form, text) {
    setSelectOptionLabels(form, "audioAutoPlayMode", [
      ["all", text("audioAutoPlayAll")],
      ["hover", text("audioAutoPlayHover")],
      ["tap", text("audioAutoPlayTap")]
    ]);
    setSelectOptionLabels(form, "audioSelectionMode", [
      ["first", text("firstAudio")],
      ["random", text("randomAudio")]
    ]);
    setSelectOptionLabels(form, "audioTtsMode", [
      ["fallback", text("audioTtsFallback")],
      ["source-order", text("audioTtsSourceOrder")]
    ]);
    setSelectOptionLabels(form, "immersionKitCategory", [
      ["all", text("allCategories")],
      ["anime", text("anime")],
      ["drama", text("drama")],
      ["games", text("games")]
    ]);
    setSelectOptionLabels(form, "immersionKitExampleSource", [
      ["immersion-kit", text("immersionKit")],
      ["nadeshiko", "Nadeshiko"],
      ["combined", text("immersionKitAndNadeshiko")]
    ]);
    setSelectOptionLabels(form, "immersionKitSort", [
      ["sentence_length:asc", text("shortestFirst")],
      ["sentence_length:desc", text("longestFirst")]
    ]);
    localizeOcrSettingsSelects(form, text);
    setSelectOptionLabels(form, "subtitleControlsMode", [
      ["auto", text("showWhenNeeded")],
      ["hidden", text("hideControls")],
      ["always", text("alwaysVisible")]
    ]);
    setSelectOptionLabels(form, "subtitleTranscriptPlacement", [
      ["right", text("right")],
      ["left", text("left")],
      ["bottom", text("bottom")]
    ]);
    setSelectOptionLabels(form, "subtitleFontFamily", fontFamilyOptions(text));
  }
  function localizeOcrSettingsSelects(form, text) {
    setSelectOptionLabels(form, "ocrProvider", [
      ["google-lens", text("googleLens")],
      ["cloud-vision", text("cloudVision")],
      ["local-service", text("localOcr")],
      ["off", text("off")]
    ]);
    setSelectOptionLabels(form, "ocrMaxImagesPerPage", [
      ["3", text("lightWork")],
      ["8", text("normal")],
      ["16", text("more")]
    ]);
    setSelectOptionLabels(form, "ocrMinImageArea", [
      ["80000", text("largeOnly")],
      ["45000", text("normal")],
      ["15000", text("includeSmall")]
    ]);
    setSelectOptionLabels(form, "ocrMaxImagePixels", [
      ["640000", text("faster")],
      ["1200000", text("balanced")],
      ["2000000", text("sharper")]
    ]);
    setSelectOptionLabels(form, "ocrEngine", [
      ["auto", text("automatic")],
      ["MangaOCR", "MangaOCR"],
      ["PaddleOCR", "PaddleOCR"],
      ["AppleVision", "Apple Vision"]
    ]);
  }
  function localizeMiningSettingsSelects(form, text) {
    setSelectOptionLabels(form, "ankiTemplateMode", [
      ["recognition", text("wordFirst")],
      ["context", text("sentenceFirst")]
    ]);
    form.querySelector("[data-anki-library-choices-title]")?.replaceChildren(text("ankiLibraryChoices"));
    form.querySelector("[data-anki-library-choices-help]")?.replaceChildren(text("ankiLibraryChoicesHelp"));
    form.querySelector("[data-anki-template-settings-title]")?.replaceChildren(text("ankiTemplateSettings"));
    form.querySelector("[data-anki-template-settings-help]")?.replaceChildren(text("ankiTemplateSettingsHelp"));
    form.querySelectorAll("[data-confidence]").forEach((chip) => {
      const confidence = chip.dataset.confidence;
      if (confidence === "high") chip.replaceChildren(text("ankiMappingHighConfidence"));
      else if (confidence === "medium") chip.replaceChildren(text("ankiMappingMediumConfidence"));
      else if (confidence === "low") chip.replaceChildren(text("ankiMappingLowConfidence"));
    });
  }
  function localizeSettingsShortcuts(form, text) {
    setShortcutPlaceholder(form, "shortcuts.hoverLookup", text("blankPlainHover"));
    form.querySelectorAll("[data-shortcut-input]").forEach((inputEl) => {
      if (inputEl.name !== "shortcuts.hoverLookup") inputEl.placeholder = text("pressKeys");
    });
    const immersionLimitLegend = getNamedControl(form, "immersionKitLimitEnabled")?.closest(".jpdb-reader-radio-group")?.querySelector("legend");
    immersionLimitLegend?.replaceChildren(text("immersionKitLimitEnabled"));
    setRadioLabel(form, "immersionKitLimitEnabled", "off", text("allExamples"));
    setRadioLabel(form, "immersionKitLimitEnabled", "on", text("limitExamples"));
  }
  function localizeSettingsHelpText(form, text) {
    localizeKeyedHelpText(form, text);
    form.querySelector("[data-youtube-help]")?.replaceChildren(text("youtubeHelp"));
    localizeNewTabHelp(form, text);
    localizeDictionaryImportHelp(form, text);
    localizeLookupPillsHelp(form, text);
    const ankiHelp = form.querySelector("[data-anki-setup-help]");
    if (ankiHelp) setInnerHtml(ankiHelp, ankiSetupHelpHtml(resolveUiLanguageFromText(text)));
    form.querySelector("[data-anki-library-availability]")?.replaceChildren(text("ankiLibraryAdapterStatus"));
    form.querySelector("[data-diagnostics-help]")?.replaceChildren(text("diagnosticsHelp"));
    form.querySelector("details[data-local-ocr] > summary")?.replaceChildren(text("ocrCustomLocalServer"));
  }
  function localizeNewTabHelp(form, text) {
    form.querySelector("[data-newtab-address-help]")?.replaceChildren(text("newTabAddressHelp"));
    form.querySelector("[data-newtab-offline-help]")?.replaceChildren(text("newTabOfflineHelp"));
    form.querySelector("[data-newtab-anki-decks-title]")?.replaceChildren(text("newTabAnkiReviewDecks"));
    form.querySelector("[data-newtab-anki-decks-help]")?.replaceChildren(text("newTabAnkiReviewDecksHelp"));
  }
  function resolveUiLanguageFromText(text) {
    return text("save") === "保存" ? "ja" : "en";
  }
  function localizeKeyedHelpText(form, text) {
    form.querySelectorAll("[data-help-key]").forEach((help) => {
      const key = help.dataset.helpKey;
      if (!isSettingsTextKey(key)) return;
      if (key === "audioHelp") {
        setInnerHtml(help, audioHelpHtml(resolveUiLanguageFromText(text)));
        return;
      }
      help.replaceChildren(text(key));
    });
  }
  function isSettingsTextKey(value) {
    return Boolean(value);
  }
  function localizeLookupPillsHelp(form, text) {
    const lookupLinks = form.querySelector(".jpdb-reader-lookup-links");
    lookupLinks?.closest(".jpdb-reader-settings-subsection")?.querySelector(":scope > .jpdb-reader-help")?.replaceChildren(text("lookupPillsHelp"));
  }
  function localizeDictionaryImportHelp(form, text) {
    const importStatus = form.querySelector("[data-import-status]");
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? "")) importStatus.textContent = text("dictionaryImportHelp");
  }
  function localizeSettingsActions(form, text) {
    SETTINGS_ACTION_TEXT_KEYS.forEach(([selector, key]) => {
      form.querySelectorAll(selector).forEach((button) => button.replaceChildren(text(key)));
    });
    form.querySelector('button[type="submit"]')?.replaceChildren(text("save"));
    localizePreviewAudioButtons(form, text);
  }
  function localizePreviewAudioButtons(form, text) {
    form.querySelectorAll('[data-action="preview-audio"]').forEach((button) => {
      button.title = text("previewAudio");
      button.setAttribute("aria-label", text("previewAudio"));
    });
  }
  function localizeSettingsEditorChrome(form, text) {
    const audioHead = form.querySelectorAll(".jpdb-reader-audio-source-head span");
    audioHead[0]?.replaceChildren(text("enabledHeader"));
    audioHead[1]?.replaceChildren(text("audioSource"));
    audioHead[2]?.replaceChildren(text("urlVoice"));
    audioHead[3]?.replaceChildren(text("orderHeader"));
    audioHead[4]?.replaceChildren(text("removeHeader"));
    form.querySelector('[data-action="lookup-link-add"]')?.replaceChildren(text("add"));
    form.querySelector(".jpdb-reader-recommended-title")?.replaceChildren(text("recommendedDownloads"));
    form.querySelector("[data-recommended-dictionary-help]")?.replaceChildren(text("dictionaryInstallQueueHelp"));
    form.querySelectorAll(".jpdb-reader-recommended-name a").forEach((link) => {
      link.textContent = text("homepage");
    });
    localizeOrderButtons(form, text);
    localizeLookupLinkEditor(form, text);
    localizeDeckControls(form, text);
    const statusLanguage2 = resolveUiLanguageFromText(text);
    localizeJpdbStatus(form, statusLanguage2);
    localizeInitialAnkiStatus(form, statusLanguage2);
    localizeSourceRows(form, text);
    localizeRecommendedDictionaryGroups(form, text);
    localizeRecommendedDictionaryDescriptions(form, text);
    localizeAnkiTemplatePreview(form, text);
    localizeAudioSourceFields(form, text);
    localizeRecommendedDictionaryButtons(form, text);
    localizeDictionaryStatus(form, text);
  }
  function localizeOrderButtons(form, text) {
    form.querySelectorAll("[data-source-drag-handle]").forEach((button) => setButtonTitle(button, text("dragToReorder")));
    form.querySelectorAll('[data-action$="-up"]').forEach((button) => setButtonTitle(button, text("moveUp")));
    form.querySelectorAll('[data-action$="-down"]').forEach((button) => setButtonTitle(button, text("moveDown")));
    form.querySelectorAll('[data-action$="-remove"]').forEach((button) => setButtonTitle(button, text("remove")));
    form.querySelectorAll('[data-action="delete-yomitan-dictionary"]').forEach((button) => setButtonTitle(button, text("removeImportedDictionary")));
  }
  function setButtonTitle(button, label) {
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  function localizeLookupLinkEditor(form, text) {
    const lookupHead = form.querySelectorAll(".jpdb-reader-lookup-link-head span");
    lookupHead[0]?.replaceChildren(text("enabledHeader"));
    lookupHead[1]?.replaceChildren(text("labelHeader"));
    lookupHead[2]?.replaceChildren(text("lookupUrlTemplate"));
    lookupHead[3]?.replaceChildren(text("orderHeader"));
    lookupHead[4]?.replaceChildren(text("removeHeader"));
    form.querySelectorAll(".jpdb-reader-lookup-link-note").forEach((note) => note.replaceChildren(text("copiesCurrentWord")));
    form.querySelectorAll(".jpdb-reader-lookup-link-fixed").forEach((note) => note.setAttribute("aria-label", text("builtInAction")));
    form.querySelectorAll('input[name^="dictionaryLookupLinks."][name$=".label"]').forEach((input2, index) => {
      input2.setAttribute("aria-label", text("lookupPillLabelNumber").replace("{number}", String(index + 1)));
    });
    form.querySelectorAll('input[name^="dictionaryLookupLinks."][name$=".urlTemplate"]').forEach((input2, index) => {
      input2.setAttribute("aria-label", text("lookupUrlTemplateNumber").replace("{number}", String(index + 1)));
    });
    form.querySelectorAll("[data-lookup-link-enable-toggle]").forEach((input2) => {
      const row = input2.closest("[data-lookup-link-row]");
      const name = row?.querySelector('input[name$=".label"]')?.value.trim() || row?.querySelector(".jpdb-reader-lookup-link-note")?.textContent?.trim() || input2.closest("label")?.textContent?.trim() || "";
      input2.setAttribute("aria-label", text("enableLookupPillName").replace("{name}", name));
    });
    form.querySelectorAll(".jpdb-reader-lookup-link-row .jpdb-reader-row-order-tools").forEach((row) => {
      row.setAttribute("aria-label", text("lookupPillOrder"));
    });
  }
  function localizeDeckControls(form, text) {
    setSelectOptionLabels(form, "newTabJpdbDeck", [
      ["all", text("allStudyDecks")],
      ["never-forget", text("never")]
    ]);
    const deckHelp = form.querySelector("[data-jpdb-decks] .jpdb-reader-help");
    if (!deckHelp) return;
    const key = textKeyForPattern(deckHelp.textContent ?? "", DECK_HELP_TEXT_KEYS);
    if (key) deckHelp.replaceChildren(text(key));
  }
  function localizeSourceRows(form, text) {
    form.querySelectorAll(".jpdb-reader-dictionary-head").forEach((head) => localizeSourceHead(head, text));
    form.querySelectorAll("[data-source-name-key]").forEach((element) => {
      const key = element.dataset.sourceNameKey;
      if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    form.querySelectorAll("[data-source-help-key]").forEach((element) => {
      const key = element.dataset.sourceHelpKey;
      if (isSettingsTextKey(key)) element.replaceChildren(text(key));
    });
    replaceSourceHelp(form, /Import Yomitan dictionaries|Yomitan辞書をインポート/, text("importLocalDefinitionsHelp"));
    replaceSourceHelp(form, /Frequency, pitch, and kanji metadata|頻度、ピッチ、漢字メタデータ/, text("frequencyMetadataHelp"));
    const rows = [
      ["Translation", "sourceNameTranslation", "sourceHelpTranslation"],
      ["Grammar", "sourceNameGrammar", "sourceHelpGrammar"],
      ["Immersion Kit", "sourceNameImmersionKit", "sourceHelpImmersionKit"],
      ["Stroke practice", "sourceNameStrokePractice", "sourceHelpStrokePractice"],
      ["Readings and components", "readingsComponents", "sourceHelpReadingsComponents"],
      ["Imported kanji dictionaries", "sourceNameImportedKanjiDictionaries", "sourceHelpImportedKanjiDictionaries"],
      ["Component graph", "originStructure", "sourceHelpComponentGraph"]
    ];
    rows.forEach(([sourceName, nameKey, helpKey]) => {
      form.querySelectorAll("[data-dictionary-source-row]").forEach((row) => {
        const display = row.querySelector(".jpdb-reader-field-display");
        if (display?.textContent === sourceName) display.replaceChildren(text(nameKey));
        const help = row.querySelector(".jpdb-reader-dictionary-row-help");
        if (help && !help.dataset.sourceHelpKey && sourceRowHelpMatches(help.textContent ?? "", sourceName)) help.replaceChildren(text(helpKey));
      });
    });
    replaceSourceHelp(form, /JPDB meanings shown/, text("sourceHelpJpdb"));
    replaceSourceHelp(form, /Example sentences, images, and audio/, text("sourceHelpImmersionKit"));
    replaceSourceHelp(form, /Remembering the Kanji/, text("sourceHelpRtk"));
    replaceSourceHelp(form, /Uchisen mnemonic/, text("sourceHelpUchisen"));
    replaceSourceHelp(form, /Imported Yomitan kanji dictionary/, text("sourceHelpImportedKanjiDictionary"));
    form.querySelectorAll("[data-source-enable-toggle]").forEach((input2) => {
      const row = input2.closest("[data-dictionary-source-row]");
      const name = row?.querySelector(".jpdb-reader-field-display")?.textContent?.trim() || input2.closest("label")?.textContent?.trim() || "";
      input2.setAttribute("aria-label", text("enableSourceName").replace("{name}", name));
    });
  }
  function localizeSourceHead(head, text) {
    const spans = head.querySelectorAll("span");
    spans[0]?.replaceChildren(text("enabledHeader"));
    const sourceLabel = spans[1]?.textContent === "Kanji section" ? text("kanjiSection") : text("definitionSource");
    spans[1]?.replaceChildren(sourceLabel);
    if (spans.length === 5) {
      spans[2]?.replaceChildren(text("displayName"));
      spans[3]?.replaceChildren(text("orderHeader"));
      spans[4]?.replaceChildren(text("removeHeader"));
    } else {
      spans[2]?.replaceChildren(text("orderHeader"));
    }
  }
  function replaceSourceHelp(form, pattern, value) {
    form.querySelectorAll(".jpdb-reader-help, .jpdb-reader-dictionary-row-help").forEach((help) => {
      if (pattern.test(help.textContent ?? "")) help.replaceChildren(value);
    });
  }
  function sourceRowHelpMatches(value, sourceName) {
    return value.includes(sourceName);
  }
  function localizeRecommendedDictionaryGroups(form, text) {
    const labels = [text("termDictionaries"), text("kanjiDictionaries"), text("frequencyDictionaries")];
    form.querySelectorAll(".jpdb-reader-recommended-group-title").forEach((title, index) => {
      if (labels[index]) title.replaceChildren(labels[index]);
    });
  }
  function localizeRecommendedDictionaryDescriptions(form, text) {
    RECOMMENDED_JAPANESE_DICTIONARIES.forEach((dictionary) => {
      const button = form.querySelector(`[data-action="download-recommended-dictionary"][data-dictionary-id="${dictionary.id}"]`);
      button?.closest(".jpdb-reader-recommended-item")?.querySelector(".jpdb-reader-help")?.replaceChildren(text(dictionary.descriptionKey));
    });
  }
  function localizeAnkiTemplatePreview(form, text) {
    const preview = form.querySelector(".jpdb-reader-template-preview");
    if (!preview) return;
    const contextMode = getNamedControl(form, "ankiTemplateMode")?.value === "context";
    preview.querySelector(".jpdb-reader-template-preview-title")?.replaceChildren(text(contextMode ? "sentenceFirstPreset" : "wordFirstPreset"));
    const headings = preview.querySelectorAll("strong");
    headings[0]?.replaceChildren(text("front"));
    headings[1]?.replaceChildren(text("back"));
    preview.querySelector(".jpdb-reader-template-meaning")?.replaceChildren(text("exampleMeaning"));
    preview.querySelectorAll("small").forEach((small) => {
      const key = textKeyForPattern(small.textContent ?? "", ANKI_TEMPLATE_PREVIEW_SMALL_TEXT_KEYS);
      if (key) small.replaceChildren(text(key));
    });
  }
  function textKeyForPattern(value, options) {
    return options.find(([pattern]) => pattern.test(value))?.[1];
  }
  function localizeAudioSourceFields(form, text) {
    form.querySelectorAll('input[name^="audioSources."][name$=".enabled"]').forEach((input2, index) => {
      input2.setAttribute("aria-label", text("enableAudioSourceNumber").replace("{number}", String(index + 1)));
    });
    form.querySelectorAll('select[name^="audioSources."][name$=".type"]').forEach((select2, index) => {
      select2.setAttribute("aria-label", text("audioSourceNumber").replace("{number}", String(index + 1)));
      localizeAudioSourceTypeOptions(select2, text);
    });
    form.querySelectorAll("select[data-audio-voice-field]").forEach((select2, index) => {
      select2.setAttribute("aria-label", text("textToSpeechVoiceNumber").replace("{number}", String(index + 1)));
    });
    form.querySelectorAll("[data-audio-url-field]").forEach((input2) => {
      input2.placeholder = localizedAudioUrlPlaceholder(input2, text);
    });
  }
  function localizeAudioSourceTypeOptions(select2, text) {
    const language = resolveUiLanguageFromText(text);
    Array.from(select2.options).forEach((option) => {
      if (!isAudioSourceTypeValue(option.value)) return;
      const label = audioSourceLabel(language, option.value);
      option.textContent = option.value === "custom" ? text("customAdvanced").replace("{label}", label) : label;
    });
  }
  function localizedAudioUrlPlaceholder(input2, text) {
    const type = input2.closest("[data-audio-source-row]")?.querySelector('select[name$=".type"]')?.value;
    return text(audioUrlPlaceholderKey(type));
  }
  function localizeRecommendedDictionaryButtons(form, text) {
    form.querySelectorAll('[data-action="download-recommended-dictionary"]').forEach((button) => {
      const installed = button.dataset.installed === "true";
      const state = button.dataset.importState;
      const label = state === "installing" ? text("installing") : state === "queued" ? text("queued") : installed ? text("update") : text("install");
      button.textContent = label;
      button.title = button.dataset.importMessage || label;
      button.setAttribute("aria-label", button.title);
    });
  }
  function localizeDictionaryStatus(form, text) {
    const dictionaryStatus = form.querySelector("[data-dictionary-status]");
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? "")) {
      dictionaryStatus.textContent = text("checkingDictionaries");
    }
  }
  const DIRECT_SETTINGS_CONTROL_LABEL_KEYS = [
    "apiCredential",
    "apiCredentialJpdb",
    "apiCredentialJiten",
    "miningDeck",
    "newTabJpdbDeck",
    "neverForgetDeck",
    "blacklistDeck",
    "jpdbMiningEnabled",
    "addToForq",
    "enableReviews",
    "jpdbPageEnhancementsEnabled",
    "jpdbPageWordEnhancementsEnabled",
    "jpdbPageKanjiEnhancementsEnabled",
    "popupMode",
    "stickyBottomSheet",
    "popoverBackdropEnabled",
    "popoverWidth",
    "popoverHeight",
    "popoverHeightMode",
    "readerFontFamily",
    "popupFontFamily",
    "popupFontWeight",
    "enableLogging",
    "accentColor",
    "newTabAnkiEnabled",
    "newTabSource",
    "newTabJpdbReviewMode",
    "corsProxyUrl",
    "newTabKanjiKeywordSource",
    "newTabParsingEnabled",
    "newTabFrontSentenceEnabled",
    "newTabKanjiAutogradeEnabled",
    "newTabKanjiAutoSubmit",
    "newTabOfflineEnabled",
    "newTabOfflineLimit",
    "newTabDailyGoalMinutes",
    "newTabKanjiUnlockEnabled",
    "newTabStopAtBatchEnd",
    "newTabSwipeReviews",
    "newTabUrl",
    "wordColorNew",
    "wordColorLearning",
    "wordColorKnown",
    "wordColorDue",
    "wordColorFailed",
    "wordColorIgnored",
    "pitchColorHeiban",
    "pitchColorAtamadaka",
    "pitchColorNakadaka",
    "pitchColorOdaka",
    "pitchColorKifuku",
    "pitchColorUnknown",
    "wordHighlightColorSource",
    "wordUnderlineColorSource",
    "wordTextColorSource",
    "subtitleHighlightColorSource",
    "subtitleUnderlineColorSource",
    "subtitleTextColorSource",
    "parseSelection",
    "lookupOnClick",
    "lookupOnHover",
    "lookupOnMiddleMouse",
    "showFloatingButton",
    "furiganaMode",
    "wordColorStates",
    "showPitchAccent",
    "suppressRedundantWordUi",
    "sheetCloseButtonOnLeft",
    "audioEnabled",
    "autoPlayAudio",
    "suppressAutoAudioOnVideo",
    "audioAutoPlayMode",
    "audioEnableDefaultSources",
    "audioFallbackChimeEnabled",
    "audioSelectionMode",
    "audioTtsMode",
    "audioTimeoutMs",
    "immersionKitEnabled",
    "immersionKitExampleSource",
    "nadeshikoApiKey",
    "immersionKitShowTranslation",
    "immersionKitRevealTranslationOnClick",
    "immersionKitShowImages",
    "immersionKitAutoPlayAudio",
    "immersionKitPlayOnHover",
    "immersionKitPlayOnImageClick",
    "immersionKitCategory",
    "immersionKitSort",
    "immersionKitLimit",
    "immersionKitMinLength",
    "immersionKitMaxLength",
    "immersionKitPlaybackRate",
    "immersionKitExactMatch",
    "ocrEnabled",
    "ocrAutoScanImages",
    "ocrShowTextOverlay",
    "ocrVideoPauseFrames",
    "ocrVideoFrameStatusCard",
    "ocrProvider",
    "ocrMaxImagesPerPage",
    "ocrMinImageArea",
    "ocrMaxImagePixels",
    "ocrTextColor",
    "ocrOutlineColor",
    "ocrBackgroundColor",
    "ocrBackgroundOpacity",
    "ocrFontScale",
    "ocrEndpointUrl",
    "ocrEngine",
    "subtitlePlayerEnabled",
    "subtitleAutoDetect",
    "subtitleOverlayVisible",
    "subtitleSecondaryVisible",
    "subtitleNativeBlurred",
    "subtitleKaraokeMode",
    "subtitleTranscriptVisible",
    "subtitlePausePanel",
    "subtitleTranscriptPlacement",
    "subtitleTranscriptAutoScroll",
    "subtitleTranscriptAutoScrollResumeSeconds",
    "subtitleAutoCopyLine",
    "subtitleCopyIncludeTranslation",
    "subtitleMiningPause",
    "subtitleControlsMode",
    "subtitleFontSize",
    "subtitleBottomOffset",
    "subtitleTextColor",
    "subtitleOutlineColor",
    "subtitleBackgroundColor",
    "subtitleBackgroundOpacity",
    "subtitleFontFamily",
    "subtitleFontWeight",
    "subtitleSeekPadding",
    "ankiEnabled",
    "ankiMineWithJpdb",
    "ankiCaptureScreenshot",
    "ankiConnectUrl",
    "ankiDeck",
    "ankiModel",
    "ankiTemplateMode",
    "ankiFrontReading",
    "ankiFrontSentence",
    "ankiFrontImage",
    "ankiTags",
    "youtubeImmersionEnabled",
    "preferJapaneseSiteLanguage",
    "youtubeShowChannelRecommendations",
    "youtubeShowFilterNotice",
    "hoverOpenDelayMs",
    "hoverCloseDelayMs"
  ];
  const SETTINGS_CONTROL_LABEL_ALIASES = [
    ["twoButtonReviews", "reviewRatingScale"],
    ["interfaceLanguage", "settingsLanguage"],
    ["ocrCloudVisionApiKey", "cloudVisionApiKey"],
    ["ankiMobileHandoff", "mobileAnkiHandoff"],
    ["shortcuts.hoverLookup", "holdWhileHovering"],
    ["shortcuts.scanPage", "scanPage"],
    ["shortcuts.openSettings", "openSettings"],
    ["shortcuts.playAudio", "playAudio"],
    ["shortcuts.closePopup", "closePopup"],
    ["shortcuts.previousLookupWord", "previousLookupWord"],
    ["shortcuts.nextLookupWord", "nextLookupWord"],
    ["shortcuts.previousSubtitle", "previousSubtitle"],
    ["shortcuts.nextSubtitle", "nextSubtitle"],
    ["shortcuts.copySubtitle", "copySubtitle"],
    ["shortcuts.toggleOcr", "toggleImageReading"],
    ["shortcuts.toggleSubtitleOverlay", "toggleSubtitleOverlay"],
    ["shortcuts.toggleYoutubeImmersion", "toggleYoutubeImmersion"],
    ["shortcuts.scanImages", "readImagesNow"],
    ["shortcuts.massReviewVisible", "massReviewVisible"],
    ["shortcuts.studyReveal", "studyReveal"],
    ["shortcuts.studyRevealAlternate", "studyRevealAlternate"],
    ["shortcuts.studyUndo", "studyUndo"],
    ["shortcuts.studyPrevious", "studyPrevious"],
    ["shortcuts.studyPreviousAlternate", "studyPreviousAlternate"],
    ["shortcuts.studyNext", "studyNext"],
    ["shortcuts.studyNextAlternate", "studyNextAlternate"],
    ["shortcuts.gradeNothing", "gradeNothing"],
    ["shortcuts.gradeSomething", "gradeSomething"],
    ["shortcuts.gradeHard", "gradeHard"],
    ["shortcuts.gradeOkay", "gradeOkay"],
    ["shortcuts.gradeEasy", "gradeEasy"],
    ["shortcuts.gradeFail", "gradeFail"],
    ["shortcuts.gradePass", "gradePass"]
  ];
  const SETTINGS_CONTROL_LABELS = [
    ...DIRECT_SETTINGS_CONTROL_LABEL_KEYS.map((key) => [key, key]),
    ...SETTINGS_CONTROL_LABEL_ALIASES
  ];
  function getNamedControl(form, name) {
    const item = form.elements.namedItem(name);
    if (item instanceof HTMLInputElement || item instanceof HTMLSelectElement || item instanceof HTMLTextAreaElement) {
      return item;
    }
    if (item instanceof RadioNodeList) {
      return Array.from(form.elements).find(
        (element) => element instanceof HTMLInputElement && element.name === name
      ) ?? null;
    }
    return null;
  }
  function setControlLabel(form, name, label) {
    const controls = namedFormControls(form, name);
    controls.forEach((control) => {
      const labelElement = control.closest("label");
      if (!labelElement) return;
      if (labelElement.classList.contains("inline")) setInlineLabelText(labelElement, label);
      else setBlockLabelText(labelElement, label);
    });
  }
  function namedFormControls(form, name) {
    return Array.from(form.elements).filter(
      (element) => (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.name === name
    );
  }
  function setBlockLabelText(label, text) {
    const container = directSettingsLabelTextContainer(label);
    if (container) {
      setLeadingText(container, text);
      return;
    }
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
  }
  function setInlineLabelText(label, text) {
    const container = directSettingsLabelTextContainer(label);
    if (container) {
      container.replaceChildren(text);
      return;
    }
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim());
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
  }
  function directSettingsLabelTextContainer(label) {
    return Array.from(label.children).find(
      (child) => child instanceof HTMLElement && child.classList.contains(SETTINGS_LABEL_TEXT_CLASS)
    ) ?? null;
  }
  function setLeadingText(container, text) {
    const textNode = Array.from(container.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = text;
    else container.insertBefore(document.createTextNode(text), container.firstChild);
  }
  function normalizeSettingsLabelTextContainers(form) {
    form.querySelectorAll("label").forEach(normalizeSettingsLabelTextContainer);
  }
  function normalizeSettingsLabelTextContainer(label) {
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      const wrapper = document.createElement("span");
      wrapper.className = SETTINGS_LABEL_TEXT_CLASS;
      label.insertBefore(wrapper, pending[0]);
      pending.forEach((node) => wrapper.append(node));
      pending = [];
    };
    for (const node of Array.from(label.childNodes)) {
      if (isWrappableSettingsLabelNode(node)) {
        pending.push(node);
        continue;
      }
      flush();
    }
    flush();
  }
  function isWrappableSettingsLabelNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent ?? "").trim());
    return node instanceof HTMLAnchorElement;
  }
  function setRadioLabel(form, name, value, label) {
    const radio = Array.from(form.elements).find(
      (element) => element instanceof HTMLInputElement && element.type === "radio" && element.name === name && element.value === value
    );
    const labelElement = radio?.closest("label");
    if (labelElement) setInlineLabelText(labelElement, label);
  }
  function setSelectOptionLabels(form, name, options) {
    const selectElement = Array.from(form.elements).find(
      (element) => element instanceof HTMLSelectElement && element.name === name
    ) ?? null;
    if (!selectElement) return;
    options.forEach(([value, label]) => {
      const option = Array.from(selectElement.options).find((item) => item.value === value);
      if (option) option.textContent = label;
    });
  }
  function syncSettingsSelectOptionMeta(form, language) {
    const showMeta = resolveUiLanguage(language) === "ja";
    form.querySelectorAll("select").forEach((selectElement) => {
      const existing = selectElement.nextElementSibling;
      const existingMeta = existing instanceof HTMLElement && existing.matches("[data-settings-select-options-meta]") ? existing : null;
      if (!showMeta) {
        existingMeta?.remove();
        return;
      }
      const labels = Array.from(selectElement.options).map((option) => option.textContent?.replace(/\s+/g, " ").trim() ?? "").filter((label) => /[\u3040-\u30ff\u3400-\u9fff]/.test(label));
      if (!labels.length) {
        existingMeta?.remove();
        return;
      }
      const wasExpanded = existingMeta?.classList.contains("expanded") ?? false;
      const meta = existingMeta ?? document.createElement("div");
      meta.className = wasExpanded ? "jpdb-reader-select-options-meta expanded" : "jpdb-reader-select-options-meta";
      meta.dataset.settingsSelectOptionsMeta = "";
      if (labels.length <= 5) {
        meta.textContent = `${uiText(language, "selectOptions")}: ${labels.join(" / ")}`;
      } else {
        meta.replaceChildren();
        const prefixText = `${uiText(language, "selectOptions")}: `;
        const truncatedSpan = document.createElement("span");
        truncatedSpan.className = "jpdb-reader-select-options-truncated";
        truncatedSpan.textContent = prefixText + labels.slice(0, 4).join(" / ");
        meta.appendChild(truncatedSpan);
        const separatorSpan = document.createElement("span");
        separatorSpan.className = "jpdb-reader-select-options-separator";
        separatorSpan.textContent = " / ";
        meta.appendChild(separatorSpan);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "jpdb-reader-select-options-toggle";
        toggle.textContent = `+${labels.length - 4}`;
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          meta.classList.add("expanded");
        });
        meta.appendChild(toggle);
        const fullSpan = document.createElement("span");
        fullSpan.className = "jpdb-reader-select-options-full";
        fullSpan.textContent = prefixText + labels.join(" / ");
        meta.appendChild(fullSpan);
      }
      if (!existingMeta) {
        selectElement.insertAdjacentElement("afterend", meta);
      }
    });
  }
  function setShortcutPlaceholder(form, name, placeholder) {
    form.querySelectorAll("[data-shortcut-input]").forEach((inputElement) => {
      if (inputElement.name === name) inputElement.placeholder = placeholder;
    });
  }
  function getSettingsPanelFieldsets(form) {
    return Array.from(form.querySelectorAll("fieldset[data-settings-panel]"));
  }
  function directFieldsetLegend(fieldset) {
    return Array.from(fieldset?.children ?? []).find(
      (child) => child instanceof HTMLLegendElement
    ) ?? null;
  }
  function localizeHelpLinksPanel(form, language) {
    const panel = form.querySelector(".jpdb-reader-help-links-card");
    if (!panel) return;
    const text = (key) => uiText(language, key);
    HELP_LINK_PANEL_TEXT_KEYS.forEach(([selector, key]) => {
      panel.querySelector(selector)?.replaceChildren(text(key));
    });
    HELP_LINK_BUTTON_TEXT_KEYS.forEach(([link, key]) => {
      setExternalButtonLabel(panel.querySelector(`[data-help-link="${link}"]`), text(key));
    });
  }
  function externalButtonLabel(label) {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
  }
  function setExternalButtonLabel(element, label) {
    if (!element) return;
    setInnerHtml(element, externalButtonLabel(label));
  }
  function renderReviewShortcutInputs(settings) {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeNothing", "Grade NOTHING", settings.shortcuts.gradeNothing)}
            ${shortcutInput("shortcuts.gradeSomething", "Grade SOMETHING", settings.shortcuts.gradeSomething)}
            ${shortcutInput("shortcuts.gradeHard", "Grade HARD", settings.shortcuts.gradeHard)}
            ${shortcutInput("shortcuts.gradeOkay", "Grade OKAY", settings.shortcuts.gradeOkay)}
            ${shortcutInput("shortcuts.gradeEasy", "Grade EASY", settings.shortcuts.gradeEasy)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeFail", "Pass/fail: FAIL", settings.shortcuts.gradeFail)}
            ${shortcutInput("shortcuts.gradePass", "Pass/fail: PASS", settings.shortcuts.gradePass)}
        </div>
    `;
  }
  function activateSettingsPanel(form, panel) {
    const normalizedPanel = normalizeSettingsPanel(panel);
    const search = form.querySelector("[data-settings-search]");
    if (search?.value.trim()) {
      search.value = "";
      applySettingsSearch(form, "");
    }
    applySettingsPanelState(form, normalizedPanel);
  }
  function applySettingsSearch(form, query) {
    const searchInput = form.querySelector("[data-settings-search]");
    const empty = form.querySelector("[data-settings-search-empty]");
    const normalizedQuery = normalizeSettingsSearchText(query);
    if (searchInput && searchInput.value !== query) searchInput.value = query;
    form.dataset.settingsSearching = normalizedQuery ? "true" : "false";
    if (!normalizedQuery) {
      if (empty) empty.hidden = true;
      activateSettingsPanelWithoutClearingSearch(form, activeSettingsPanel(form));
      return;
    }
    let visibleCount = 0;
    getSettingsPanelFieldsets(form).forEach((fieldset) => {
      const matches = normalizeSettingsSearchText(fieldset.textContent ?? "").includes(normalizedQuery);
      fieldset.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    if (empty) empty.hidden = visibleCount > 0;
  }
  function activateSettingsPanelWithoutClearingSearch(form, panel) {
    applySettingsPanelState(form, normalizeSettingsPanel(panel));
  }
  function applySettingsPanelState(form, normalizedPanel) {
    form.querySelectorAll("[data-settings-panel]").forEach((section) => {
      section.hidden = section.dataset.settingsPanel !== normalizedPanel;
    });
    form.querySelectorAll('[data-action="settings-panel"]').forEach((button) => {
      const active = button.dataset.panel === normalizedPanel;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
  function activeSettingsPanel(form) {
    return form.querySelector('[data-action="settings-panel"][aria-selected="true"]')?.dataset.panel ?? DEFAULT_SETTINGS_PANEL;
  }
  function normalizeSettingsPanel(panel) {
    if (panel === "basics" || panel === "jpdb") return "api";
    if (panel === "reading" || panel === "reader") return "appearance";
    if (panel === "kanji") return "dictionaries";
    return panel;
  }
  function normalizeSettingsSearchText(value) {
    return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }
  function audioHelpHtml(language) {
    const copy = uiText(language, "audioHelp");
    const linkLabel = uiText(language, "audioGuideLinkLabel");
    const [before, after = ""] = copy.split(linkLabel);
    return `${escapeHtml(before)}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a>${escapeHtml(after)}`;
  }
  function ankiSetupHelpHtml(language) {
    const copy = uiText(language, "ankiHelp");
    const addOnLabel = language === "ja" ? "AnkiConnectアドオンを開く" : "Open AnkiConnect add-on";
    const docsLabel = language === "ja" ? "モバイルAnki設定ドキュメント" : "Mobile Anki setup docs";
    return `${escapeHtml(copy)} <a href="${ANKI_CONNECT_ADDON_URL}" target="_blank" rel="noopener">${externalButtonLabel(addOnLabel)}</a> <a href="${MOBILE_ANKI_SETUP_DOCS_URL}" target="_blank" rel="noopener">${externalButtonLabel(docsLabel)}</a>`;
  }
  function installShortcutCapture(root) {
    root.querySelectorAll("[data-shortcut-input]").forEach((inputEl) => {
      inputEl.addEventListener("keydown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Backspace" || event.key === "Delete") {
          inputEl.value = "";
          syncDuplicateShortcutInputs(root, inputEl);
          return;
        }
        inputEl.value = formatShortcutEvent(event);
        syncDuplicateShortcutInputs(root, inputEl);
      });
      inputEl.addEventListener("input", () => syncDuplicateShortcutInputs(root, inputEl));
      inputEl.addEventListener("paste", (event) => event.preventDefault());
    });
  }
  function syncDuplicateShortcutInputs(root, source) {
    root.querySelectorAll("[data-shortcut-input]").forEach((inputEl) => {
      if (inputEl !== source && inputEl.name === source.name) inputEl.value = source.value;
    });
  }
  function syncReviewSettingsVisibility(form) {
    const reviewsEnabled = form.querySelector('input[name="enableReviews"]')?.checked ?? true;
    const passFail = form.querySelector('select[name="twoButtonReviews"]')?.value === "true";
    form.querySelectorAll("[data-review-config]").forEach((node) => {
      node.hidden = !reviewsEnabled;
    });
    form.querySelectorAll('[data-review-scale="five"]').forEach((node) => {
      node.hidden = !reviewsEnabled || passFail;
    });
    form.querySelectorAll('[data-review-scale="pass-fail"]').forEach((node) => {
      node.hidden = !reviewsEnabled || !passFail;
    });
  }
  function syncJpdbMiningDependentSettings(form) {
    const jpdbDeckActionsEnabled = form.querySelector('input[name="jpdbMiningEnabled"]')?.checked ?? true;
    for (const name of ["addToForq", "ankiMineWithJpdb"]) {
      const input2 = form.querySelector(`input[name="${name}"]`);
      if (!input2) continue;
      input2.disabled = !jpdbDeckActionsEnabled;
      if (!jpdbDeckActionsEnabled) input2.checked = false;
    }
  }
  function syncStickyBottomSheetAvailability(form) {
    const popupMode = form.querySelector('select[name="popupMode"]')?.value;
    const unavailable = popupMode === "popover";
    const input2 = form.querySelector('input[name="stickyBottomSheet"]');
    const field = input2?.closest("[data-sticky-bottom-sheet-field]") ?? input2?.closest("label");
    if (field) field.hidden = unavailable;
    if (!input2) return;
    input2.disabled = unavailable;
    if (unavailable) input2.checked = false;
  }
  function syncFontFamilyControls(form) {
    form.querySelectorAll("[data-font-family-control]").forEach((control) => {
      const selectElement = control.querySelector("select");
      const customField = control.querySelector("[data-font-family-custom]");
      if (customField) customField.hidden = selectElement?.value !== CUSTOM_FONT_FAMILY_VALUE;
    });
  }
  function syncSubtitlePreview(form) {
    const preview = form.querySelector("[data-subtitle-preview]");
    if (!preview) return;
    const value = (name, fallback) => getNamedControl(form, name)?.value || fallback;
    const numberValue = (name, fallback) => {
      const number = Number(value(name, String(fallback)));
      return Number.isFinite(number) ? number : fallback;
    };
    preview.style.setProperty("--subtitle-font-size", `${Math.max(16, Math.min(64, numberValue("subtitleFontSize", 28)))}px`);
    preview.style.setProperty("--subtitle-color", sanitizeAccentColor(value("subtitleTextColor", DEFAULT_OVERLAY_TEXT_COLOR), DEFAULT_OVERLAY_TEXT_COLOR));
    preview.style.setProperty("--subtitle-outline", sanitizeAccentColor(value("subtitleOutlineColor", DEFAULT_OVERLAY_OUTLINE_COLOR), DEFAULT_OVERLAY_OUTLINE_COLOR));
    preview.style.setProperty(
      "--subtitle-background-rgba",
      accentToRgba(
        sanitizeAccentColor(value("subtitleBackgroundColor", DEFAULT_OVERLAY_BACKGROUND_COLOR), DEFAULT_OVERLAY_BACKGROUND_COLOR),
        Math.max(0, Math.min(1, numberValue("subtitleBackgroundOpacity", 0)))
      )
    );
    preview.style.setProperty("--subtitle-family", formFontFamilyValue(form, "subtitleFontFamily", "system-ui"));
    preview.style.setProperty("--subtitle-weight", String(Math.max(100, Math.min(900, numberValue("subtitleFontWeight", 760)))));
    syncSubtitlePreviewColorClasses(form, preview);
  }
  function formFontFamilyValue(form, name, fallback) {
    const value = getNamedControl(form, name)?.value.trim() ?? "";
    if (value === CUSTOM_FONT_FAMILY_VALUE) return getNamedControl(form, `${name}Custom`)?.value.trim() || fallback;
    return value || fallback;
  }
  function syncSubtitlePreviewColorClasses(form, preview) {
    const value = (name, fallback) => getNamedControl(form, name)?.value || fallback;
    const classes = {
      highlight: readOption(value("subtitleHighlightColorSource", "jpdb"), COLOR_SOURCE_VALUES, "jpdb"),
      underline: readOption(value("subtitleUnderlineColorSource", "pitch"), COLOR_SOURCE_VALUES, "pitch"),
      text: readOption(value("subtitleTextColorSource", "jpdb"), COLOR_SOURCE_VALUES, "jpdb")
    };
    Object.keys(classes).forEach((channel) => {
      COLOR_SOURCE_CLASS_VALUES.forEach((source) => {
        preview.classList.toggle(`jpdb-reader-subtitle-${channel}-${source}`, classes[channel] === source);
      });
    });
  }
  function renderDictionarySourceRows(settings) {
    const rows = definitionSourceRows(settings);
    const showAlias = rows.some((row) => !row.readonly);
    const visibleNames = /* @__PURE__ */ new Set([
      ...rows.filter((row) => row.removable).map((row) => row.name),
      ...frequencySourceRows(settings).map((row) => row.name)
    ]);
    const hiddenPreferences = settings.dictionaryPreferences.filter((preference) => !visibleNames.has(preference.name));
    const hidden = hiddenPreferences.map((preference) => {
      const index = settings.dictionaryPreferences.indexOf(preference);
      return `
            <input type="hidden" name="dictionaryPreferences.${index}.name" value="${escapeHtml(preference.name)}">
            <input type="hidden" name="dictionaryPreferences.${index}.alias" value="${escapeHtml(preference.alias)}">
            ${preference.enabled ? `<input type="hidden" name="dictionaryPreferences.${index}.enabled" value="on">` : ""}
            <input type="hidden" name="dictionaryPreferences.${index}.priority" value="${escapeHtml(String(preference.priority))}">
            <input type="hidden" name="dictionaryPreferences.${index}.type" value="${escapeHtml(preference.type ?? "terms")}">
        `;
    }).join("");
    const metadataHelp = hiddenPreferences.length ? '<div class="jpdb-reader-help">Metadata dictionaries appear as badges or kanji data.</div>' : "";
    if (!rows.some((row) => row.removable)) return `
        <div class="jpdb-reader-help">Import Yomitan dictionaries for local definitions.</div>
        ${renderSourceRowsList(rows, { sourceLabel: "Definition source", countName: "dictionaryPreferenceCount", countValue: settings.dictionaryPreferences.length, showAlias })}
        ${metadataHelp}
        ${hidden}
    `;
    return `${renderSourceRowsList(rows, { sourceLabel: "Definition source", countName: "dictionaryPreferenceCount", countValue: settings.dictionaryPreferences.length, showAlias })}${metadataHelp}${hidden}`;
  }
  function renderKanjiSourceRows(settings) {
    return renderSourceRowsList(kanjiSourceRows(settings), { sourceLabel: "Kanji section", showAlias: false });
  }
  function renderFrequencyDictionaryRows(settings) {
    const rows = frequencySourceRows(settings);
    if (!rows.length) return "";
    return `
        <div class="jpdb-reader-settings-subsection">
            <div class="jpdb-reader-local-title">Frequency dictionaries</div>
            <div class="jpdb-reader-help">Order controls which frequency badge shows first.</div>
            <div class="jpdb-reader-dictionary-priorities" data-source-editor>
                ${renderSourceRowsList(rows, { sourceLabel: "Frequency dictionary", showAlias: true })}
            </div>
        </div>
    `;
  }
  function renderRecommendedDictionaries(installed) {
    const groups = [
      ["terms", "Term dictionaries"],
      ["kanji", "Kanji dictionaries"],
      ["frequency", "Frequency dictionaries"]
    ];
    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionaries</div>
        <div class="jpdb-reader-help jpdb-reader-recommended-note" data-recommended-dictionary-help>${escapedUiText("en", "dictionaryInstallQueueHelp")}</div>
        ${groups.map(([category, label]) => {
      const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter((dictionary) => dictionary.category === category);
      if (!dictionaries.length) return "";
      return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title">${escapeHtml(label)}</div>
                    ${dictionaries.map((dictionary) => renderRecommendedDictionary(dictionary, installed)).join("")}
                </div>
            `;
    }).join("")}
    `;
  }
  function renderRecommendedDictionary(dictionary, installed) {
    const alreadyInstalled = isRecommendedDictionaryInstalled(dictionary, installed);
    const action = dictionary.downloadUrl ? `<button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? "Update" : "Install"}
            </button>` : `<a class="jpdb-reader-btn" href="${dictionary.homepage}" target="_blank" rel="noopener">Open</a>`;
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                    <a href="${dictionary.homepage}" target="_blank" rel="noopener">Homepage</a>
                </div>
                <div class="jpdb-reader-help">${escapedUiText("en", dictionary.descriptionKey)}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            ${action}
        </div>
    `;
  }
  function isRecommendedDictionaryInstalled(dictionary, installed) {
    const targetName = normalizedDictionaryName(dictionary.name);
    return installed.some((item) => dictionary.downloadUrl && item.downloadUrl === dictionary.downloadUrl || normalizedDictionaryName(item.title).includes(targetName));
  }
  function normalizedDictionaryName(value) {
    return value.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]/g, "");
  }
  const log$2 = Logger.scope("SettingsFileIO");
  function recommendedDictionaryFilename(dictionary) {
    if (!dictionary.downloadUrl) return `${dictionary.id}.zip`;
    try {
      const parsed = new URL(dictionary.downloadUrl);
      const lastPath = parsed.pathname.split("/").filter(Boolean).pop();
      if (lastPath && /\.zip$/i.test(lastPath)) return decodeURIComponent(lastPath);
    } catch {
    }
    return `${dictionary.id}.zip`;
  }
  function getReaderSettingsExport(value) {
    const record = readerSettingsExportRecord(value);
    return record && isReaderSettingsExport(record) ? record.settings : null;
  }
  function getReaderDictionaryExport(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    if (record.formatName !== "yomu-reader-settings" && record.formatName !== "jpdb-popup-reader-settings") return null;
    return isReaderDictionaryExport(record.dictionaries) ? record.dictionaries : record.dictionaryData;
  }
  function readerDictionaryExportHasData(value) {
    if (!isReaderDictionaryExport(value)) return false;
    const record = value;
    return arrayHasItems(record.dictionaries) || arrayHasItems(record.entries) || arrayHasItems(record.terms) || arrayHasItems(record.kanji) || arrayHasItems(record.termMeta) || arrayHasItems(record.kanjiMeta);
  }
  function readerSettingsExportRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function isReaderSettingsExport(record) {
    return isReaderSettingsExportFormat(record.formatName) && Boolean(record.settings) && typeof record.settings === "object";
  }
  function isReaderSettingsExportFormat(formatName) {
    return formatName === "yomu-reader-settings" || formatName === "jpdb-popup-reader-settings";
  }
  function isReaderDictionaryExport(value) {
    if (!value || typeof value !== "object") return false;
    const formatName = value.formatName;
    return formatName === "yomu-yomitan-dictionaries" || formatName === "jpdb-reader-yomitan-dictionaries";
  }
  function arrayHasItems(value) {
    return Array.isArray(value) && value.length > 0;
  }
  function pickFile(root, type) {
    const inputEl = root.querySelector(`input[data-file="${type}"]`);
    if (!inputEl) {
      log$2.warn("File picker input missing", { type });
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      inputEl.onchange = () => {
        const file = inputEl.files?.[0] ?? null;
        inputEl.value = "";
        log$2.info("File picker completed", { type, name: file?.name ?? "", size: file?.size ?? 0 });
        resolve(file);
      };
      inputEl.click();
    });
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
    log$2.info("Downloaded blob", { filename, size: blob.size, type: blob.type });
  }
  function dateStamp() {
    return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
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
  new TextDecoder();
  const log$1 = Logger.scope("YomitanSettingsImport");
  const AUDIO_BOOLEAN_IMPORTS = [
    { sourceKey: "enabled", targetKey: "audioEnabled" },
    { sourceKey: "autoPlay", targetKey: "autoPlayAudio" },
    { sourceKey: "enableDefaultAudioSources", targetKey: "audioEnableDefaultSources" }
  ];
  const ANKI_BOOLEAN_IMPORTS = [
    { sourceKey: "enable", targetKey: "ankiEnabled" }
  ];
  function parseYomitanSettingsExport(value, language = "en") {
    const done = log$1.time("Yomitan settings export parse");
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) {
      done();
      log$1.warn("Yomitan settings export rejected", { reason: "missing-profile-options" });
      throw new Error(uiText(language, "yomitanSettingsInvalid"));
    }
    const settings = {};
    const sections = readYomitanProfileSections(profileOptions);
    applyAudioSettings(settings, sections.audio);
    applyGeneralSettings(settings, sections.general);
    applyScanningSettings(settings, sections.scanning);
    applyAnkiSettings(settings, sections.anki);
    const dictionaryPreferences = readDictionaryPreferences(profileOptions);
    applyDictionarySettings(settings, dictionaryPreferences);
    const dictionaryNames = dictionaryPreferences.filter((item) => item.enabled).map((item) => item.name);
    settings.yomitanSettingsBackup = value;
    applyInputShortcuts(settings, sections.inputs);
    done();
    log$1.info("Yomitan settings import parsed", {
      hasAudioSources: Boolean(settings.audioSources?.length),
      parseSelection: settings.parseSelection,
      theme: settings.theme
    });
    return { settings, dictionaryNames };
  }
  function readYomitanProfileSections(profileOptions) {
    return {
      audio: profileOptions.audio,
      general: profileOptions.general,
      scanning: profileOptions.scanning,
      anki: profileOptions.anki,
      inputs: profileOptions.inputs
    };
  }
  function applyAudioSettings(settings, audio) {
    applyBooleanSettingImports(settings, audio, AUDIO_BOOLEAN_IMPORTS);
    applyAudioFallbackChimeSetting(settings, audio?.fallbackSoundType);
    applyAudioSourceSettings(settings, audio?.sources);
  }
  function applyBooleanSettingImports(settings, source, imports) {
    for (const item of imports) {
      if (typeof source?.[item.sourceKey] === "boolean") assignImportedSetting(settings, item.targetKey, source[item.sourceKey]);
    }
  }
  function applyTrimmedStringSetting(settings, value, targetKey) {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) assignImportedSetting(settings, targetKey, trimmed);
  }
  function assignImportedSetting(settings, key, value) {
    settings[key] = value;
  }
  function applyAudioFallbackChimeSetting(settings, value) {
    if (typeof value === "string") settings.audioFallbackChimeEnabled = value !== "none";
  }
  function applyAudioSourceSettings(settings, sources) {
    if (!Array.isArray(sources)) return;
    settings.audioSources = sources.map(normalizeAudioSource).filter((source) => source !== null);
    settings.audioSourceUrl = settings.audioSources.find((source) => source.url)?.url;
  }
  function applyGeneralSettings(settings, general) {
    applyImportedLanguage(settings, general?.language);
    applyImportedTheme(settings, general);
    applyGeneralPopupSizeSettings(settings, general);
    applyLocalDictionaryMaxResults(settings, general?.maxResults);
    applyPitchDisplaySetting(settings, general);
  }
  function applyImportedLanguage(settings, value) {
    const language = importedInterfaceLanguage(value);
    if (language) settings.interfaceLanguage = language;
  }
  function applyImportedTheme(settings, general) {
    const theme = importedPopupTheme(general);
    if (theme) settings.theme = theme;
  }
  function applyGeneralPopupSizeSettings(settings, general) {
    applyPositiveNumberSetting(settings, general?.popupWidth, "popoverWidth", 280, 900);
    applyPositiveNumberSetting(settings, general?.popupHeight, "popoverHeight", 220, 900);
    if (hasPositiveNumber(general?.popupVerticalOffset)) settings.subtitleBottomOffset = importedPopupVerticalOffset(general);
  }
  function applyPositiveNumberSetting(settings, value, targetKey, min, max) {
    if (hasPositiveNumber(value)) assignImportedSetting(settings, targetKey, clampNumber(value, min, max));
  }
  function applyLocalDictionaryMaxResults(settings, value) {
    if (typeof value === "number") settings.localDictionaryMaxResults = Math.max(1, Math.min(64, value));
  }
  function applyPitchDisplaySetting(settings, general) {
    const pitchEnabled = importedPitchDisplayEnabled(general);
    if (typeof pitchEnabled === "boolean") settings.showPitchAccent = pitchEnabled;
  }
  function importedInterfaceLanguage(value) {
    return value === "en" || value === "ja" || value === "auto" ? value : "";
  }
  function importedPopupTheme(general) {
    return general?.popupTheme === "dark" || general?.popupTheme === "light" ? general.popupTheme : "";
  }
  function hasPositiveNumber(value) {
    return typeof value === "number" && value > 0;
  }
  function importedPopupVerticalOffset(general) {
    return Math.max(6, Math.min(24, Math.round(Number(general?.popupVerticalOffset) || 12)));
  }
  function importedPitchDisplayEnabled(general) {
    const values = [
      general?.showPitchAccentDownstepNotation,
      general?.showPitchAccentPositionNotation,
      general?.showPitchAccentGraph
    ].filter((value) => typeof value === "boolean");
    return values.length ? values.some(Boolean) : void 0;
  }
  function applyScanningSettings(settings, scanning) {
    if (typeof scanning?.selectText === "boolean") settings.parseSelection = scanning.selectText;
    if (typeof scanning?.delay === "number") settings.hoverOpenDelayMs = clampNumber(scanning.delay, 0, 1500);
    if (typeof scanning?.hideDelay === "number") settings.hoverCloseDelayMs = clampNumber(scanning.hideDelay, 0, 3e3);
    applyScanInputSettings(settings, scanning);
  }
  function applyAnkiSettings(settings, anki) {
    applyBooleanSettingImports(settings, anki, ANKI_BOOLEAN_IMPORTS);
    applyTrimmedStringSetting(settings, anki?.server, "ankiConnectUrl");
    applyAnkiTagsSetting(settings, anki?.tags);
    applyAnkiCardFormatSettings(settings, firstYomitanTermCardFormat(anki?.cardFormats));
    applyAnkiScreenshotSetting(settings, anki?.screenshot);
  }
  function applyAnkiTagsSetting(settings, value) {
    if (Array.isArray(value)) settings.ankiTags = value.map((tag) => String(tag).trim()).filter(Boolean).join(" ");
  }
  function applyAnkiCardFormatSettings(settings, cardFormat) {
    if (!cardFormat) return;
    applyTrimmedStringSetting(settings, cardFormat.deck, "ankiDeck");
    applyTrimmedStringSetting(settings, cardFormat.model, "ankiModel");
  }
  function applyAnkiScreenshotSetting(settings, value) {
    if (isObjectRecord(value)) settings.ankiCaptureScreenshot = true;
  }
  function firstYomitanTermCardFormat(value) {
    if (!Array.isArray(value)) return null;
    return value.find((item) => isObjectRecord(item) && (item.type === "term" || item.type == null)) ?? null;
  }
  function applyDictionarySettings(settings, preferences) {
    if (!preferences.length) return;
    settings.dictionaryPreferences = normalizeDictionaryPreferences(preferences);
  }
  function applyInputShortcuts(settings, inputs) {
    applyYomitanShortcut(settings, inputs, "playAudio", "playAudio");
    applyYomitanShortcut(settings, inputs, "close", "closePopup");
  }
  function applyYomitanShortcut(settings, inputs, action, target) {
    const hotkey = inputs?.hotkeys?.find((item) => item.action === action && item.enabled !== false);
    if (!hotkey) return;
    const key = String(hotkey.key || "").replace(/^Key/, "");
    const modifiers = Array.isArray(hotkey.modifiers) ? hotkey.modifiers.map((v) => String(v)) : [];
    settings.shortcuts = {
      ...settings.shortcuts,
      [target]: [...modifiers.map(capitalize), key].filter(Boolean).join("+")
    };
  }
  function readDictionaryPreferences(profileOptions) {
    const dictionaries = Array.isArray(profileOptions.dictionaries) ? profileOptions.dictionaries : [];
    return dictionaries.map((item, index) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return null;
      return {
        name,
        alias: typeof item.alias === "string" && item.alias.trim() ? item.alias.trim() : name,
        enabled: item.enabled !== false,
        priority: index,
        allowSecondarySearches: item.allowSecondarySearches === true
      };
    }).filter((item) => item !== null);
  }
  function applyScanInputSettings(settings, scanning) {
    const scanInput = firstScanInput(scanning);
    if (!scanInput) return;
    const include = String(scanInput.include ?? "").toLowerCase();
    const modifier = ["shift", "alt", "ctrl", "meta"].find((key) => include.includes(key));
    if (modifier) {
      settings.lookupOnHover = true;
      settings.popupActivationMode = "modifier";
      settings.scanModifierKey = modifier;
      settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
      return;
    }
    const options = scanInput.options;
    if (shouldEnablePlainHoverScan(options, include)) {
      settings.lookupOnHover = true;
      settings.popupActivationMode = "hover";
      settings.shortcuts = { ...settings.shortcuts, hoverLookup: "" };
    }
  }
  function firstScanInput(scanning) {
    if (!Array.isArray(scanning?.inputs)) return null;
    return scanning.inputs.find(isRecordScanInput) ?? null;
  }
  function isRecordScanInput(input2) {
    return Boolean(input2 && typeof input2 === "object");
  }
  function isObjectRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }
  function shouldEnablePlainHoverScan(options, include) {
    return options?.scanOnPenHover === true || options?.scanOnTouchTap === true || include === "";
  }
  function getYomitanProfileOptions(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return profileOptionsFromRoot(record.options) ?? profileOptionsFromProfiles(record.profiles, record);
  }
  function profileOptionsFromRoot(rootOptions) {
    if (!rootOptions || typeof rootOptions !== "object") return null;
    const rootOptionRecord = rootOptions;
    return nestedProfileOptions(rootOptionRecord.profiles, rootOptionRecord.profileCurrent) ?? rootOptionRecord;
  }
  function profileOptionsFromProfiles(profilesValue, fallback) {
    const profile = selectedProfileRecord(profilesValue, fallback.profileCurrent) ?? fallback;
    const options = profile.options;
    return options && typeof options === "object" ? options : null;
  }
  function nestedProfileOptions(profilesValue, profileCurrent) {
    const options = selectedProfileRecord(profilesValue, profileCurrent)?.options;
    return options && typeof options === "object" ? options : null;
  }
  function selectedProfileRecord(value, profileCurrent) {
    if (!Array.isArray(value)) return null;
    const index = Number(profileCurrent);
    const selected = Number.isInteger(index) && index >= 0 && index < value.length ? value[index] : null;
    const profile = selected && typeof selected === "object" ? selected : value.find((item) => item && typeof item === "object");
    return profile ? profile : null;
  }
  function capitalize(value) {
    return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : value;
  }
  function clampNumber(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
  }
  Logger.scope("Yomitan");
  const log = Logger.scope("SettingsDialog");
  const JPDB_SETTINGS_URL = "https://jpdb.io/settings";
  const JITEN_SETTINGS_URL = "https://jiten.moe/settings";
  const AUTO_REPLACE_ANKI_DECK_NAMES = /* @__PURE__ */ new Set(["", "よむ", "Yomu"]);
  const ANKI_FIELD_MAPPING_ROLES = /* @__PURE__ */ new Set(["expression", "reading", "meaning", "sentence", "audio", "image"]);
  const ANKI_SCAN_CONFIDENCE_VALUES = /* @__PURE__ */ new Set(["high", "medium", "low"]);
  const SETTINGS_FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "summary",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  const SETTINGS_FOCUS_SCROLL_SELECTOR = [
    'input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"])',
    "select",
    "textarea"
  ].join(",");
  const SETTINGS_FOCUS_SCROLL_MARGIN_PX = 16;
  const SETTINGS_FOCUS_SCROLL_RETRY_MS = 320;
  function settingsStatusSetter(status) {
    return (message) => {
      if (status) status.textContent = message;
    };
  }
  function focusPreviewAudioSource(form, button, previewSettings) {
    const row = button?.closest("[data-audio-source-row]");
    if (!row) return;
    const source = previewSettings.audioSources[sourceRowIndex(form, row)];
    if (!source) return;
    previewSettings.audioSources = [{ ...source, enabled: true }];
    previewSettings.audioEnableDefaultSources = false;
  }
  function sourceRowIndex(form, row) {
    return Array.from(form.querySelectorAll("[data-audio-source-row]")).indexOf(row);
  }
  function recommendedDictionaryForControl(control) {
    const dictionary = control?.dataset.dictionaryId ? findRecommendedDictionary(control.dataset.dictionaryId) : void 0;
    if (!dictionary) throw new Error("Recommended dictionary not found.");
    return dictionary;
  }
  function recommendedDictionaryDownloadStatus(control, dictionaryName, language) {
    const action = control?.dataset.installed === "true" ? uiText(language, "update") : uiText(language, "dictionaryDownloading");
    return `${dictionaryName}: ${action}...`;
  }
  function settingsActionButton(control) {
    return control instanceof HTMLButtonElement ? control : control?.closest("button") ?? null;
  }
  function namedSettingsControl(form, name) {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement ? control : null;
  }
  function suppressCredentialAutofill(form) {
    const guarded = form.querySelectorAll(
      "input.jpdb-reader-masked-input, input[data-settings-search]"
    );
    guarded.forEach((input2) => {
      if (input2.dataset.autofillGuarded === "true") return;
      input2.dataset.autofillGuarded = "true";
      input2.readOnly = true;
      const enable = () => {
        input2.readOnly = false;
      };
      input2.addEventListener("focus", enable);
      input2.addEventListener("pointerdown", enable);
      input2.addEventListener("keydown", enable);
    });
  }
  function ankiScanFormControls(form) {
    return {
      deck: namedSettingsControl(form, "ankiDeck"),
      model: namedSettingsControl(form, "ankiModel")
    };
  }
  function settingsControlValue(control) {
    return control?.value.trim() || "";
  }
  function shouldUseScannedAnkiDeck(deckNames, currentDeck) {
    return Boolean(
      deckNames.length && !deckNames.includes(currentDeck) && (deckNames.length === 1 || AUTO_REPLACE_ANKI_DECK_NAMES.has(currentDeck))
    );
  }
  function selectedAnkiScanDeck(deckNames, currentDeck) {
    return shouldUseScannedAnkiDeck(deckNames, currentDeck) ? deckNames[0] ?? currentDeck : currentDeck;
  }
  function ankiScanSelection(controls, scan) {
    return {
      selectedDeck: selectedAnkiScanDeck(scan.deckNames, settingsControlValue(controls.deck)),
      selectedModel: scan.suggestedModel?.modelName || settingsControlValue(controls.model)
    };
  }
  function applySettingsControlValue(control, value) {
    if (!control || !value) return;
    control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function ankiConnectionAction(action) {
    return action === "test-anki" || action === "prepare-anki" ? action : null;
  }
  function ankiConnectionPendingKey(action) {
    return action === "prepare-anki" ? "ankiPreparing" : "ankiTesting";
  }
  function ankiStatusSetter(status) {
    return (message, tone, action) => {
      if (!status) return;
      status.dataset.statusTone = tone;
      if (action) status.dataset.statusAction = action;
      else delete status.dataset.statusAction;
      setInnerHtml(status, renderAnkiStatusHtml({ message, tone, action }, statusLanguage(status)));
    };
  }
  function statusLanguage(status) {
    return status.closest("form")?.querySelector('select[name="interfaceLanguage"]')?.value ?? "en";
  }
  function isAnkiFieldMappingRole(role) {
    return ANKI_FIELD_MAPPING_ROLES.has(role);
  }
  function isAnkiScanConfidence(value) {
    return typeof value === "string" && ANKI_SCAN_CONFIDENCE_VALUES.has(value);
  }
  function ankiScanConfidenceEntries(confidence) {
    const entries = [];
    for (const [role, value] of Object.entries(confidence)) {
      if (isAnkiFieldMappingRole(role) && isAnkiScanConfidence(value)) entries.push([role, value]);
    }
    return entries;
  }
  function readNewTabAnkiDisabledDecks(form) {
    return canonicalNewTabAnkiDisabledDecks(
      namedSettingsControl(form, "newTabAnkiDisabledDecks")?.value.split(",").map((deck) => deck.trim()).filter(Boolean) ?? []
    );
  }
  function selectedSettingsPanel(control) {
    return control?.dataset.panel ?? "api";
  }
  function focusedSettingsControl(target, form) {
    if (!(target instanceof HTMLElement)) return null;
    const control = target.closest(SETTINGS_FOCUS_SCROLL_SELECTOR);
    if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) && form.contains(control)) {
      return control;
    }
    return null;
  }
  function requestSettingsControlVisibility(form, control) {
    const run = () => scrollSettingsControlIntoView(form, control);
    requestFrame(() => requestFrame(run));
    window.setTimeout(run, SETTINGS_FOCUS_SCROLL_RETRY_MS);
  }
  function requestFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => callback());
      return;
    }
    window.setTimeout(callback, 16);
  }
  function requestCancelableFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(() => callback());
    }
    return window.setTimeout(callback, 16);
  }
  function cancelCancelableFrame(id) {
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
  }
  function scrollSettingsControlIntoView(form, control) {
    const geometry = settingsControlScrollGeometry(form, control);
    if (geometry) applySettingsControlScroll(geometry);
  }
  function settingsControlScrollGeometry(form, control) {
    if (!canScrollFocusedSettingsControl(form, control)) return null;
    const scroll = settingsControlScrollContainer(form, control);
    if (!scroll) return null;
    const scrollRect = scroll.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    if (!hasMeasuredRect(scrollRect) || !hasMeasuredRect(controlRect)) return null;
    const limits = settingsControlScrollLimits(form, scrollRect);
    return limits ? { scroll, controlRect, ...limits } : null;
  }
  function canScrollFocusedSettingsControl(form, control) {
    return form.isConnected && control.isConnected && document.activeElement === control;
  }
  function settingsControlScrollContainer(form, control) {
    const scroll = control.closest(".jpdb-reader-settings-scroll");
    return scroll && form.contains(scroll) ? scroll : null;
  }
  function settingsControlScrollLimits(form, scrollRect) {
    const viewport = settingsControlViewportBounds(scrollRect);
    const topLimit = Math.max(scrollRect.top, viewport.top) + SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    const bottomLimit = Math.min(scrollRect.bottom, viewport.bottom, measuredSettingsFooterTop(form)) - SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    return validSettingsControlScrollLimits(bottomLimit, topLimit);
  }
  function settingsControlViewportBounds(scrollRect) {
    const top = Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0));
    const height = Math.max(0, Math.round(window.visualViewport?.height ?? settingsControlViewportHeightFallback(scrollRect)));
    return { bottom: top + height, top };
  }
  function settingsControlViewportHeightFallback(scrollRect) {
    if (window.innerHeight) return window.innerHeight;
    if (document.documentElement.clientHeight) return document.documentElement.clientHeight;
    return scrollRect.bottom;
  }
  function measuredSettingsFooterTop(form) {
    const footerRect = form.querySelector(".footer")?.getBoundingClientRect();
    if (!footerRect || !hasMeasuredRect(footerRect)) return Number.POSITIVE_INFINITY;
    return footerRect.top;
  }
  function validSettingsControlScrollLimits(bottomLimit, topLimit) {
    return bottomLimit > topLimit ? { bottomLimit, topLimit } : null;
  }
  function applySettingsControlScroll({ bottomLimit, controlRect, scroll, topLimit }) {
    if (controlRect.bottom > bottomLimit) {
      scroll.scrollTop += Math.ceil(controlRect.bottom - bottomLimit);
      return;
    }
    if (controlRect.top < topLimit) {
      scroll.scrollTop -= Math.ceil(topLimit - controlRect.top);
    }
  }
  function hasMeasuredRect(rect) {
    return Boolean(rect.width || rect.height || rect.top || rect.right || rect.bottom || rect.left);
  }
  function nextSettingsTabIndex(key, currentIndex, tabCount) {
    if (currentIndex < 0 || tabCount <= 0) return -1;
    if (key === "ArrowRight" || key === "ArrowDown") return (currentIndex + 1) % tabCount;
    if (key === "ArrowLeft" || key === "ArrowUp") return (currentIndex - 1 + tabCount) % tabCount;
    if (key === "Home") return 0;
    if (key === "End") return tabCount - 1;
    return -1;
  }
  function handleSettingsActionError(action, control, setStatus, error, language) {
    log.warn("Settings action failed", { action }, error);
    if (shouldReenableSettingsAction(action)) control?.removeAttribute("disabled");
    const message = errorMessage(error, uiText(language, "actionFailed"));
    setStatus(message);
    return message;
  }
  function shouldReenableSettingsAction(action) {
    return action === "download-recommended-dictionary" || action === "delete-yomitan-dictionary";
  }
  function dictionaryStatusElements(form) {
    return {
      status: form.querySelector("[data-dictionary-status]"),
      priorities: form.querySelector(".jpdb-reader-dictionary-priorities"),
      frequency: form.querySelector("[data-frequency-dictionaries]"),
      recommended: form.querySelector("[data-recommended-dictionaries]")
    };
  }
  function renderDictionaryStatusElements(elements, summary, settings) {
    if (elements.status) elements.status.textContent = dictionaryStatusText(summary, settings.interfaceLanguage);
    if (elements.priorities) setInnerHtml(elements.priorities, renderDictionarySourceRows(settings));
    if (elements.frequency) setInnerHtml(elements.frequency, renderFrequencyDictionaryRows(settings));
    if (elements.recommended) setInnerHtml(elements.recommended, renderRecommendedDictionaries(summary.dictionaries));
  }
  function dictionaryStatusText(summary, language) {
    if (summary.dictionaries.length) {
      return formatUiTemplate(uiText(language, "dictionaryStatusSummary"), {
        dictionaries: summary.dictionaries.length.toLocaleString(),
        terms: summary.terms.toLocaleString(),
        kanji: summary.kanji.toLocaleString(),
        metadata: summary.termMeta.toLocaleString()
      });
    }
    return uiText(language, "noLocalDictionariesImported");
  }
  function setDictionaryStatusError(status, error, language) {
    if (status) status.textContent = errorMessage(error, uiText(language, "dictionaryStatusUnavailable"));
  }
  function errorMessage(error, fallback) {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === "string" && error.trim()) return error;
    return fallback;
  }
  function isAnkiConnectSetupError(error) {
    if (isAnkiConnectAvailabilityError(error)) return true;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return /AnkiConnect/i.test(message) && /(not reachable|request failed|timed out|failed to fetch|networkerror|request bridge|CORS)/i.test(message);
  }
  class SettingsDialogController {
    constructor(dependencies) {
      this.dependencies = dependencies;
    }
    dictionaryOperationQueue = Promise.resolve();
    pendingDictionaryOperations = 0;
    recommendedDictionaryOperations = /* @__PURE__ */ new Map();
    currentForm;
    previouslyFocusedElement;
    modalSiblingState;
    saveRequestId = 0;
    ankiConnectionProbeId = 0;
    jpdbConnectionProbeId = 0;
    ankiLibraryScanId = 0;
    open(panel) {
      log.info("Opening settings", { panel: panel ?? "default" });
      this.previouslyFocusedElement = document.activeElement instanceof HTMLElement && !document.activeElement.closest(".jpdb-reader-settings") ? document.activeElement : void 0;
      const form = this.createSettingsForm(panel);
      const backdrop = this.dependencies.createBackdrop();
      this.bindFormSubmit(form);
      this.bindFocusedControlScrolling(form);
      this.bindSettingsSearch(form);
      this.bindSettingsTabs(form);
      this.bindLivePreview(form);
      this.bindEditorControls(form);
      this.currentForm = form;
      this.dependencies.mountDialog(backdrop, form);
      this.hideBackgroundForModal(backdrop);
      installSettingsDrawerHandle(form, uiText(this.settings.interfaceLanguage, "resizeSettings"));
      this.dependencies.beginSettingsPreview(this.settings.accentColor, this.settings.interfaceLanguage, this.settings.theme);
      this.syncRecommendedDictionaryInstallControls(form);
      this.syncDictionaryOperationState(form);
      this.syncJpdbStatus(form);
      void this.refreshAnkiConnectionStatus(form);
      void this.refreshJpdbConnectionStatus(form);
      void this.refreshDictionaryStatus(form);
      void this.refreshDeckControls(form);
      this.refreshSettingsJapaneseParse(form);
    }
    refreshLanguage(language = this.settings.interfaceLanguage) {
      const form = this.currentForm;
      if (!form?.isConnected) return;
      localizeSettingsForm(form, language);
      this.syncRecommendedDictionaryInstallControls(form);
      this.syncDictionaryOperationState(form);
      this.syncJpdbStatus(form);
      void this.refreshAnkiConnectionStatus(form);
      syncSubtitlePreview(form);
      this.refreshSettingsJapaneseParse(form);
    }
    get settings() {
      return this.dependencies.getSettings();
    }
    set settings(settings) {
      this.dependencies.setSettings(settings);
    }
    createSettingsForm(panel) {
      const form = document.createElement("form");
      form.className = "jpdb-reader-settings";
      form.dataset.jpdbReaderRoot = "true";
      form.setAttribute("role", "dialog");
      form.setAttribute("aria-modal", "true");
      form.setAttribute("aria-label", SETTINGS_TITLE);
      form.tabIndex = -1;
      setInnerHtml(form, renderSettingsForm(this.settings, JPDB_SETTINGS_URL, JITEN_SETTINGS_URL));
      localizeSettingsForm(form, this.settings.interfaceLanguage);
      if (panel) activateSettingsPanel(form, panel);
      return form;
    }
    bindFormSubmit(form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.pendingDictionaryOperations > 0) {
          this.showDictionarySaveBlocked(form);
          return;
        }
        const previousInitialOpen = this.settings.dictionarySourcesInitiallyExpanded;
        this.settings = readFormSettings(new FormData(form), this.settings);
        configureLogger({ forceEnabled: this.settings.enableLogging });
        if (this.settings.dictionarySourcesInitiallyExpanded !== previousInitialOpen) {
          this.dependencies.clearDictionarySourceOpenOverrides();
        }
        const saveRequestId = ++this.saveRequestId;
        void saveSettings(this.settings).then(() => this.afterSettingsSaved(form, saveRequestId)).catch((error) => {
          log.error("Settings save failed", error);
          this.dependencies.toast(errorMessage(error, uiText(this.settings.interfaceLanguage, "settingsSaveFailed")));
        });
      });
      form.querySelector('[data-action="cancel"]')?.addEventListener("click", () => this.dismissSettings());
      form.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        this.dismissSettings();
      });
      form.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || event.isComposing) return;
        this.trapFocus(form, event);
      });
    }
    dismissSettings() {
      const restoreTarget = this.previouslyFocusedElement;
      this.previouslyFocusedElement = void 0;
      this.currentForm = void 0;
      this.restoreBackgroundFromModal();
      this.dependencies.dismiss();
      if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    }
    hideBackgroundForModal(backdrop) {
      this.restoreBackgroundFromModal();
      const dialogRoot = backdrop.isConnected ? backdrop : this.currentForm;
      const directRoot = dialogRoot?.parentElement === document.body ? dialogRoot : this.currentForm?.parentElement;
      if (!directRoot) return;
      this.modalSiblingState = Array.from(document.body.children).filter((element) => element instanceof HTMLElement && element !== directRoot && !element.contains(this.currentForm ?? null)).map((element) => {
        const state = {
          element,
          ariaHidden: element.getAttribute("aria-hidden"),
          inert: element.inert
        };
        element.setAttribute("aria-hidden", "true");
        element.inert = true;
        return state;
      });
    }
    restoreBackgroundFromModal() {
      this.modalSiblingState?.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        element.inert = inert;
      });
      this.modalSiblingState = void 0;
    }
    /**
     * Clear the `aria-hidden`/`inert` the modal placed on background siblings.
     * The controller's own close paths (Escape, Cancel, Save) already restore,
     * but the dialog can also be torn down from outside the controller — a
     * backdrop click, factory reset, or the close-popup shortcut all route
     * through ReaderApp.dismiss(). Those paths call this so the page is never
     * stranded `inert` (which silently swallows every click until reload).
     * Idempotent: a no-op once the background has been released.
     */
    releaseModalBackground() {
      if (!this.currentForm?.isConnected) this.currentForm = void 0;
      this.restoreBackgroundFromModal();
    }
    trapFocus(form, event) {
      const focusable = Array.from(form.querySelectorAll(SETTINGS_FOCUSABLE_SELECTOR)).filter((element) => !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        form.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === form)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    bindSettingsSearch(form) {
      const input2 = form.querySelector("[data-settings-search]");
      input2?.addEventListener("input", () => {
        applySettingsSearch(form, input2.value);
      });
    }
    bindFocusedControlScrolling(form) {
      form.addEventListener("focusin", (event) => {
        const control = focusedSettingsControl(event.target, form);
        if (!control) return;
        requestSettingsControlVisibility(form, control);
      });
    }
    bindSettingsTabs(form) {
      form.querySelector(".jpdb-reader-settings-tabs")?.addEventListener("keydown", (event) => {
        if (!(event.target instanceof HTMLButtonElement) || event.target.dataset.action !== "settings-panel") return;
        const tabs = Array.from(form.querySelectorAll('[data-action="settings-panel"]'));
        const currentIndex = tabs.indexOf(event.target);
        const nextIndex = nextSettingsTabIndex(event.key, currentIndex, tabs.length);
        if (nextIndex < 0) return;
        event.preventDefault();
        tabs[nextIndex]?.focus();
        activateSettingsPanel(form, tabs[nextIndex]?.dataset.panel ?? "api");
      });
    }
    afterSettingsSaved(form, saveRequestId) {
      if (this.currentForm !== form || !form.isConnected || this.saveRequestId !== saveRequestId) return;
      log.info("Settings saved", loggingSettingsSummary(this.settings));
      this.dependencies.jpdb.clear();
      this.dependencies.applyTheme();
      this.dependencies.installFab();
      this.dependencies.subtitles.refresh();
      this.dependencies.ocr.refresh();
      this.dependencies.youtube.refresh();
      this.dependencies.clearSettingsPreview();
      this.dismissSettings();
      this.dependencies.scheduleDictionaryRescan();
      this.dependencies.refreshNewTabIfCurrent();
      this.dependencies.toast(uiText(this.settings.interfaceLanguage, "settingsSaved"));
      void this.refreshDictionaryStylesAfterSave();
    }
    async refreshDictionaryStylesAfterSave() {
      try {
        await this.dependencies.refreshDictionaryStyles();
      } catch (error) {
        log.warn("Dictionary style refresh failed", error);
        this.dependencies.toast(errorMessage(error, uiText(this.settings.interfaceLanguage, "actionFailed")));
      }
    }
    bindLivePreview(form) {
      const applyThemePreview = () => this.dependencies.applyTheme(readFormSettings(new FormData(form), this.settings));
      let pendingAccentColor;
      let accentPreviewFrame;
      const flushAccentPreview = () => {
        accentPreviewFrame = void 0;
        const accentColor = pendingAccentColor;
        pendingAccentColor = void 0;
        if (!accentColor || !form.isConnected) return;
        this.dependencies.applyAccentColor(accentColor);
      };
      const scheduleAccentPreview = (accentColor) => {
        pendingAccentColor = accentColor;
        if (accentPreviewFrame !== void 0) return;
        accentPreviewFrame = requestCancelableFrame(flushAccentPreview);
      };
      const commitAccentPreview = (accentColor) => {
        if (accentPreviewFrame !== void 0) {
          cancelCancelableFrame(accentPreviewFrame);
          accentPreviewFrame = void 0;
        }
        pendingAccentColor = void 0;
        this.dependencies.applyAccentColor(accentColor);
        publishSettingsChange({ accentColor }, { preview: true });
      };
      form.querySelector('input[name="accentColor"]')?.addEventListener("input", (event) => {
        const accentColor = event.currentTarget.value;
        scheduleAccentPreview(accentColor);
      });
      form.querySelector('input[name="accentColor"]')?.addEventListener("change", (event) => {
        const accentColor = event.currentTarget.value;
        commitAccentPreview(accentColor);
      });
      let wordColorPreviewFrame;
      const scheduleWordColorPreview = () => {
        if (wordColorPreviewFrame !== void 0) return;
        wordColorPreviewFrame = requestCancelableFrame(() => {
          wordColorPreviewFrame = void 0;
          if (form.isConnected) this.dependencies.applyWordColors(readFormSettings(new FormData(form), this.settings));
        });
      };
      form.querySelectorAll('input[name^="wordColor"], input[name^="pitchColor"]').forEach((input2) => {
        input2.addEventListener("input", scheduleWordColorPreview);
      });
      const autoPlayAudio = form.querySelector('input[name="autoPlayAudio"]');
      const audioAutoPlayMode = form.querySelector('select[name="audioAutoPlayMode"]');
      autoPlayAudio?.addEventListener("change", () => {
        if (audioAutoPlayMode) audioAutoPlayMode.disabled = !autoPlayAudio.checked;
      });
      this.syncThemeSwitch(form);
      form.querySelector("[data-theme-switch]")?.addEventListener("click", (event) => {
        event.preventDefault();
        const input2 = form.querySelector("[data-theme-value]");
        const current = this.effectiveTheme(input2?.value);
        const next = current === "dark" ? "light" : "dark";
        if (input2) input2.value = next;
        this.settings.theme = next;
        applyThemePreview();
        this.syncThemeSwitch(form);
        publishSettingsChange({ theme: next }, { preview: true });
      });
      window.addEventListener(SETTINGS_CHANGE_EVENT, (event) => {
        if (this.currentForm !== form || !form.isConnected) return;
        const theme = themeFromSettingsChangeEvent(event);
        if (!theme) return;
        const input2 = form.querySelector("[data-theme-value]");
        if (!input2 || input2.value === theme) return;
        input2.value = theme;
        this.settings.theme = theme;
        applyThemePreview();
        this.syncThemeSwitch(form);
      });
      syncSubtitlePreview(form);
      syncFontFamilyControls(form);
      form.addEventListener("input", (event) => {
        if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
      });
      form.addEventListener("change", (event) => {
        if (this.isFontFamilyControl(event.target)) syncFontFamilyControls(form);
        if (this.isAnkiFieldMappingControl(event.target)) this.syncAnkiFieldMappingsFromEditor(form);
        if (this.isAnkiModelControl(event.target)) this.renderAnkiFieldMappingEditor(form);
        if (this.isSubtitleControl(event.target)) syncSubtitlePreview(form);
        if (this.isColorSourceControl(event.target) || this.isReaderDisplayControl(event.target)) applyThemePreview();
      });
      this.bindAppearancePresets(form, applyThemePreview);
      form.querySelector('select[name="popupMode"]')?.addEventListener("change", () => syncStickyBottomSheetAvailability(form));
      syncStickyBottomSheetAvailability(form);
      const syncImmersionTranslationReveal = () => {
        const translations = form.querySelector('input[name="immersionKitShowTranslation"]');
        const reveal = form.querySelector('input[name="immersionKitRevealTranslationOnClick"]');
        if (!translations || !reveal) return;
        reveal.disabled = !translations.checked;
        if (!translations.checked) reveal.checked = false;
        syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      };
      form.querySelector('input[name="immersionKitShowTranslation"]')?.addEventListener("change", syncImmersionTranslationReveal);
      syncImmersionTranslationReveal();
      const syncImmersionEnabled = (source) => {
        form.querySelectorAll('input[name="immersionKitEnabled"], input[name="immersionKit.enabled"]').forEach((input2) => {
          if (input2 !== source) input2.checked = source.checked;
        });
      };
      form.querySelectorAll('input[name="immersionKitEnabled"], input[name="immersionKit.enabled"]').forEach((input2) => {
        input2.addEventListener("change", () => syncImmersionEnabled(input2));
      });
      const syncNadeshikoKeyField = () => {
        const source = form.querySelector('select[name="immersionKitExampleSource"]')?.value;
        const usesNadeshiko = source === "nadeshiko" || source === "combined";
        form.querySelectorAll("[data-nadeshiko-api-key-field]").forEach((field) => {
          field.hidden = !usesNadeshiko;
        });
      };
      form.querySelector('select[name="immersionKitExampleSource"]')?.addEventListener("change", syncNadeshikoKeyField);
      syncNadeshikoKeyField();
      const syncImmersionLimit = () => {
        const enabled = form.querySelector('input[name="immersionKitLimitEnabled"][value="on"]')?.checked ?? false;
        const limit = form.querySelector('input[name="immersionKitLimit"]');
        if (limit) limit.disabled = !enabled;
        syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      };
      form.querySelectorAll('input[name="immersionKitLimitEnabled"]').forEach((input2) => {
        input2.addEventListener("change", syncImmersionLimit);
      });
      syncImmersionLimit();
      form.querySelector('select[name="interfaceLanguage"]')?.addEventListener("change", (event) => {
        const value = event.currentTarget.value;
        if (value !== "auto" && value !== "en" && value !== "ja") return;
        this.settings.interfaceLanguage = value;
        this.refreshLanguage(value);
        this.dependencies.installFab();
      });
      form.querySelector('select[name="ocrProvider"]')?.addEventListener("change", (event) => {
        const value = event.currentTarget.value;
        form.querySelectorAll("[data-local-ocr]").forEach((node) => {
          node.hidden = value !== "local-service";
        });
        form.querySelectorAll("[data-cloud-ocr]").forEach((node) => {
          node.hidden = value !== "cloud-vision";
        });
      });
    }
    bindEditorControls(form) {
      suppressCredentialAutofill(form);
      syncBrowserTtsVoiceOptions(form);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.addEventListener("voiceschanged", () => syncBrowserTtsVoiceOptions(form), { once: true });
      }
      form.querySelector('input[name="enableReviews"]')?.addEventListener("change", () => {
        syncReviewSettingsVisibility(form);
        syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.syncJpdbStatus(form);
      });
      form.querySelector('select[name="twoButtonReviews"]')?.addEventListener("change", () => syncReviewSettingsVisibility(form));
      form.querySelector('input[name="jpdbMiningEnabled"]')?.addEventListener("change", () => {
        syncJpdbMiningDependentSettings(form);
        syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.syncJpdbStatus(form);
      });
      syncJpdbMiningDependentSettings(form);
      syncDisabledSettingsControlDescriptions(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      for (const apiKeyInput of form.querySelectorAll('input[name="apiCredential"], input[name="apiCredentialJpdb"], input[name="apiCredentialJiten"]')) {
        apiKeyInput.addEventListener("input", () => this.syncJpdbStatus(form));
        apiKeyInput.addEventListener("change", () => {
          void this.refreshDeckControls(form);
          void this.refreshJpdbConnectionStatus(form);
        });
      }
      form.querySelector('input[name="ankiEnabled"]')?.addEventListener("change", () => void this.refreshAnkiConnectionStatus(form));
      form.querySelector('input[name="ankiMobileHandoff"]')?.addEventListener("change", () => void this.refreshAnkiConnectionStatus(form));
      form.querySelector('input[name="ankiConnectUrl"]')?.addEventListener("change", () => void this.refreshAnkiConnectionStatus(form));
      form.addEventListener("change", (event) => this.handleSettingsFormChange(form, event));
      installShortcutCapture(form);
      installSourceRowDrag(form);
      form.addEventListener("click", (event) => {
        if (this.handleSettingsPreviewLookup(event)) return;
        const control = event.target.closest("[data-action]");
        const action = control?.dataset.action;
        if (!action || action === "cancel") return;
        event.preventDefault();
        event.stopPropagation();
        void this.handleSettingsAction(form, action, control);
      });
      form.addEventListener("keydown", (event) => {
        if (this.handleAnkiTagInputKeydown(form, event)) {
          event.preventDefault();
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        if (this.handleSettingsPreviewLookup(event)) event.preventDefault();
      });
    }
    handleSettingsPreviewLookup(event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const word = target?.closest("[data-settings-preview-lookup], .jpdb-reader-settings .jpdb-reader-word");
      if (!word || !this.dependencies.lookupText) return false;
      const expression = word.dataset.settingsPreviewLookup?.trim() || readerWordSurfaceText(word).trim() || word.textContent?.trim() || "";
      if (!expression) return false;
      event.preventDefault();
      event.stopPropagation();
      void this.dependencies.lookupText(expression, word.dataset.sentence || expression, word);
      return true;
    }
    handleSettingsFormChange(form, event) {
      const sourceSelect = event.target.closest('select[name^="audioSources."][name$=".type"]');
      if (sourceSelect) {
        syncAudioSourceRow(sourceSelect.closest("[data-audio-source-row]"), sourceSelect.value);
        syncBrowserTtsVoiceOptions(form);
      }
      const templateControl = event.target.closest('select[name="ankiTemplateMode"], input[name="ankiFrontReading"], input[name="ankiFrontSentence"], input[name="ankiFrontImage"]');
      if (templateControl) {
        const preview = form.querySelector("[data-anki-template-preview]");
        if (preview) setInnerHtml(preview, renderAnkiTemplatePreview(readFormSettings(new FormData(form), this.settings)));
      }
      const newTabAnkiDeckToggle = event.target.closest("[data-newtab-anki-deck-toggle]");
      if (newTabAnkiDeckToggle) this.syncNewTabAnkiDeckToggles(form);
    }
    syncThemeSwitch(form) {
      const input2 = form.querySelector("[data-theme-value]");
      const button = form.querySelector("[data-theme-switch]");
      if (!button) return;
      const theme = this.effectiveTheme(input2?.value);
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const label = uiText(language, theme === "dark" ? "switchToLightTheme" : "switchToDarkTheme");
      button.setAttribute("aria-checked", String(theme === "dark"));
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    effectiveTheme(value) {
      if (value === "dark" || value === "light") return value;
      return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    isSubtitleControl(target) {
      const name = target?.name ?? "";
      return name.startsWith("subtitle");
    }
    isFontFamilyControl(target) {
      const name = target?.name ?? "";
      return name === "readerFontFamily" || name === "popupFontFamily" || name === "subtitleFontFamily";
    }
    isColorSourceControl(target) {
      const name = target?.name ?? "";
      return [
        "wordHighlightColorSource",
        "wordUnderlineColorSource",
        "wordTextColorSource",
        "subtitleHighlightColorSource",
        "subtitleUnderlineColorSource",
        "subtitleTextColorSource"
      ].includes(name);
    }
    // UT-47: one-click appearance presets — each maps onto the underlying
    // controls and replays the live theme preview, so the sample sentence and
    // the page restyle immediately. The hidden-state fieldset only makes
    // sense for the known-status mode.
    bindAppearancePresets(form, applyThemePreview) {
      const preview = form.querySelector("[data-yomu-appearance-preview]");
      if (preview) setInnerHtml(preview, appearancePreviewHtml());
      const setSelect = (name, value) => {
        const control = form.querySelector(`select[name="${name}"]`);
        if (control) control.value = value;
      };
      const setGroups = (groups) => {
        for (const group of ["new", "learning", "known", "due", "failed"]) {
          const box = form.querySelector(`input[name="furiganaHide-${group}"]`);
          if (box) box.checked = groups.includes(group);
        }
      };
      const setColorSources = (highlight, underline, text) => {
        setSelect("wordHighlightColorSource", highlight);
        setSelect("wordUnderlineColorSource", underline);
        setSelect("wordTextColorSource", text);
        setSelect("subtitleHighlightColorSource", highlight);
        setSelect("subtitleUnderlineColorSource", underline);
        setSelect("subtitleTextColorSource", text);
      };
      const syncGroupVisibility = () => {
        const fieldset = form.querySelector("[data-furigana-hide-groups]");
        const mode = form.querySelector('select[name="furiganaMode"]')?.value;
        if (fieldset) fieldset.hidden = mode !== "known-status";
      };
      const smartFuriganaMode = () => this.settings.apiKey.trim() || this.settings.jitenApiKey.trim() || this.settings.ankiEnabled ? "known-status" : "difficult-kanji";
      form.querySelector('select[name="furiganaMode"]')?.addEventListener("change", syncGroupVisibility);
      const preset = form.querySelector('select[name="appearancePreset"]');
      preset?.addEventListener("change", () => {
        const value = preset.value;
        if (!value) return;
        if (value === "balanced" || value === "default") {
          setSelect("wordColorStates", "all");
          setSelect("furiganaMode", smartFuriganaMode());
          setGroups(["known", "due", "failed"]);
          setColorSources("jpdb", "pitch", "anki");
        } else if (value === "no-colors") {
          setSelect("wordColorStates", "all");
          setSelect("furiganaMode", "off");
          setColorSources("off", "off", "off");
        } else if (value === "new-only") {
          setSelect("wordColorStates", "new-only");
          setSelect("furiganaMode", smartFuriganaMode());
          setGroups(["known", "due", "failed"]);
          setColorSources("jpdb", "pitch", "anki");
        } else if (value === "underline-new") {
          setSelect("wordColorStates", "new-only");
          setSelect("furiganaMode", "hover");
          setColorSources("off", "jpdb", "off");
        } else if (value === "furi-all") {
          setSelect("furiganaMode", "all");
        } else if (value === "furi-known-hidden") {
          setSelect("furiganaMode", "known-status");
          setGroups(["known", "due", "failed"]);
        } else if (value === "furi-hover") {
          setSelect("furiganaMode", "hover");
        } else if (value === "furi-off") {
          setSelect("furiganaMode", "off");
        }
        syncGroupVisibility();
        applyThemePreview();
      });
    }
    isReaderDisplayControl(target) {
      const name = target?.name ?? "";
      return ["furiganaMode", "wordColorStates", "theme", "readerFontFamily", "readerFontFamilyCustom", "popupFontFamily", "popupFontFamilyCustom", "popupFontWeight"].includes(name) || name.startsWith("furiganaHide-");
    }
    isAnkiFieldMappingControl(target) {
      return Boolean(target?.closest?.("[data-anki-field-role]"));
    }
    isAnkiModelControl(target) {
      return Boolean(target?.closest?.('[name="ankiModel"]'));
    }
    async refreshDeckControls(form) {
      const container = form.querySelector("[data-jpdb-decks]");
      if (!container) return;
      this.syncJpdbStatus(form);
      const formSettings = readFormSettings(new FormData(form), this.settings);
      const apiKey = effectiveJpdbApiKey(formSettings);
      if (!apiKey) {
        setInnerHtml(container, renderDeckControls(formSettings, [], false, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.refreshSettingsJapaneseParse(form);
        return;
      }
      const originalKey = this.settings.apiKey;
      this.settings.apiKey = apiKey;
      try {
        const decks = await this.dependencies.jpdb.listDecks();
        setInnerHtml(container, renderDeckControls(formSettings, decks, true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
      } catch (error) {
        log.warn("Deck controls failed to load", error);
        setInnerHtml(container, renderDeckControls(formSettings, [], true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
      } finally {
        this.settings.apiKey = originalKey;
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.refreshSettingsJapaneseParse(form);
      }
    }
    syncJpdbStatus(form) {
      const status = form.querySelector("[data-jpdb-status]");
      if (!status) return;
      const line = jpdbStatusLineForSettings(
        readFormSettings(new FormData(form), this.settings),
        getFormInterfaceLanguage(form, this.settings.interfaceLanguage)
      );
      status.dataset.statusTone = line.tone;
      status.textContent = formatSettingsStatusLine(line, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
    }
    // Live probe via jpdb /ping: upgrades the static "key set" line to a real
    // connected/rejected answer (Anki and Jiten already have live probes).
    async refreshJpdbConnectionStatus(form) {
      this.syncJpdbStatus(form);
      const status = form.querySelector("[data-jpdb-status]");
      if (!status) return;
      const formSettings = readFormSettings(new FormData(form), this.settings);
      const apiKey = effectiveJpdbApiKey(formSettings);
      if (!apiKey) return;
      if (typeof this.dependencies.jpdb.ping !== "function") return;
      const requestId = ++this.jpdbConnectionProbeId;
      const originalKey = this.settings.apiKey;
      this.settings.apiKey = apiKey;
      let connected = false;
      try {
        connected = await this.dependencies.jpdb.ping();
      } finally {
        this.settings.apiKey = originalKey;
      }
      if (this.currentForm !== form || !form.isConnected || requestId !== this.jpdbConnectionProbeId) return;
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const line = connected ? { message: uiText(language, "jpdbConnected"), tone: "success" } : { message: uiText(language, "jpdbConnectionFailed"), tone: "error" };
      status.dataset.statusTone = line.tone;
      status.textContent = formatSettingsStatusLine(line, language);
    }
    async refreshAnkiConnectionStatus(form) {
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const formSettings = readFormSettings(new FormData(form), this.settings);
      const initialLine = ankiStatusLineForSettings(formSettings, language);
      const requestId = ++this.ankiConnectionProbeId;
      this.ankiLibraryScanId++;
      this.setAnkiStatus(form, initialLine.message, initialLine.tone, initialLine.action);
      if (!formSettings.ankiEnabled) return;
      const previous = this.settings;
      this.settings = formSettings;
      try {
        const connected = await this.dependencies.anki.isConnected();
        if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
        if (connected) {
          this.setAnkiStatus(form, uiText(language, "ankiConnectionReady"), "success", void 0, "connected");
          this.queueAutomaticAnkiLibraryScan(form, language);
        } else {
          this.setAnkiStatusLine(form, this.ankiSetupUnavailableStatus(formSettings, language));
          void this.refineAnkiUnavailableStatus(form, requestId, formSettings, language);
        }
      } catch (error) {
        if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
        log.warn("Anki settings probe failed", error);
        this.setAnkiStatusLine(form, this.ankiSetupUnavailableStatus(formSettings, language));
        void this.refineAnkiUnavailableStatus(form, requestId, formSettings, language);
      } finally {
        this.settings = previous;
      }
    }
    shouldApplyAnkiConnectionProbe(form, requestId) {
      return this.currentForm === form && form.isConnected && requestId === this.ankiConnectionProbeId;
    }
    queueAutomaticAnkiLibraryScan(form, language) {
      const requestId = ++this.ankiLibraryScanId;
      window.setTimeout(() => {
        void this.refreshAnkiLibraryScan(form, requestId, language).finally(() => {
          void this.warmAnkiStatusIndexForConnection(form, requestId);
        });
      }, 0);
    }
    async refreshAnkiLibraryScan(form, requestId, language) {
      if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
      const scanLibrary = this.dependencies.anki.scanLibrary;
      if (typeof scanLibrary !== "function") return;
      const previous = this.settings;
      this.settings = readFormSettings(new FormData(form), this.settings);
      if (!this.settings.ankiEnabled) {
        this.settings = previous;
        return;
      }
      this.setAnkiStatus(form, uiText(language, "ankiScanning"), "pending", void 0, "scanning");
      try {
        const scan = await scanLibrary.call(this.dependencies.anki);
        if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
        const staleDetails = this.staleAnkiFieldMappingDetails(form, scan, language);
        this.applyAnkiScanToForm(form, scan);
        const state = staleDetails.length ? "stale" : scan.suggestedModel ? "suggested" : "ready";
        const tone = staleDetails.length ? "pending" : "success";
        this.setAnkiStatus(form, this.ankiScanMessage(scan, language), tone, void 0, state, [
          ...staleDetails,
          ...this.ankiScanDetails(scan, language)
        ]);
        log.info("Auto Anki scan ok", { decks: scan.deckNames.length, models: scan.models.length, suggestedModel: scan.suggestedModel?.modelName });
      } catch (error) {
        if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
        log.warn("Automatic Anki library scan failed", error);
        this.setAnkiStatus(form, uiText(language, "ankiConnectionReady"), "success", void 0, "connected");
      } finally {
        this.settings = previous;
      }
    }
    shouldApplyAnkiLibraryScan(form, requestId) {
      return this.currentForm === form && form.isConnected && requestId === this.ankiLibraryScanId;
    }
    async warmAnkiStatusIndexForConnection(form, requestId) {
      if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
      const warmStatusIndex = this.dependencies.anki.warmStatusIndex;
      if (typeof warmStatusIndex !== "function") return;
      const previous = this.settings;
      this.settings = readFormSettings(new FormData(form), this.settings);
      if (!this.settings.ankiEnabled) {
        this.settings = previous;
        return;
      }
      try {
        await warmStatusIndex.call(this.dependencies.anki);
        log.info("Auto Anki status index warmup ok");
      } catch (error) {
        log.warn("Automatic Anki status index warmup failed", error);
      } finally {
        this.settings = previous;
      }
    }
    setAnkiStatusLine(form, line) {
      const status = form.querySelector("[data-anki-status]");
      if (!status) return;
      status.dataset.statusTone = line.tone;
      if (line.action) status.dataset.statusAction = line.action;
      else delete status.dataset.statusAction;
      if (line.state) status.dataset.ankiAdapterState = line.state;
      else delete status.dataset.ankiAdapterState;
      setInnerHtml(status, renderAnkiStatusHtml(line, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
    }
    setAnkiStatus(form, message, tone, action, state, details) {
      this.setAnkiStatusLine(form, { message, tone, action, state, details });
    }
    async refreshDictionaryStatus(form) {
      const elements = dictionaryStatusElements(form);
      try {
        const summary = await this.dependencies.dictionaries.summary();
        await this.applyDictionaryStatus(form, elements, summary);
      } catch (error) {
        log.warn("Dictionary status unavailable", error);
        setDictionaryStatusError(elements.status, error, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      }
    }
    async applyDictionaryStatus(form, elements, summary) {
      await this.mergeDictionaryPreferencesFromSummary(summary);
      await this.dependencies.refreshDictionaryStyles();
      renderDictionaryStatusElements(elements, summary, this.settings);
      localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      this.syncRecommendedDictionaryInstallControls(form);
      this.syncDictionaryOperationState(form);
      this.refreshSettingsJapaneseParse(form);
    }
    refreshSettingsJapaneseParse(form) {
      void this.dependencies.parseSettingsJapanese?.(form);
    }
    async mergeDictionaryPreferencesFromSummary(summary) {
      const names = summary.dictionaries.map((item) => item.title);
      const types = Object.fromEntries(summary.dictionaries.map((item) => [item.title, item.type]));
      const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names, types);
      if (merged.length === this.settings.dictionaryPreferences.length) return;
      this.settings.dictionaryPreferences = merged;
      await saveSettings(this.settings);
    }
    async enqueueDictionaryOperation(form, task) {
      this.pendingDictionaryOperations++;
      this.syncDictionaryOperationState(form);
      const operation = this.dictionaryOperationQueue.then(task);
      this.dictionaryOperationQueue = operation.then(() => void 0, () => void 0);
      try {
        return await operation;
      } finally {
        this.pendingDictionaryOperations = Math.max(0, this.pendingDictionaryOperations - 1);
        this.syncDictionaryOperationState(form);
      }
    }
    syncDictionaryOperationState(form) {
      const save = form.querySelector('button[type="submit"]');
      const status = form.querySelector("[data-settings-save-status]");
      const busy = this.pendingDictionaryOperations > 0;
      const message = busy ? formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryImportQueueStatus"), {
        count: this.pendingDictionaryOperations.toLocaleString(),
        plural: this.pendingDictionaryOperations === 1 ? "" : "s"
      }) : "";
      if (save) {
        save.setAttribute("aria-disabled", String(busy));
        save.disabled = busy;
        if (busy) {
          save.dataset.saveBlocked = "dictionary-import";
          save.replaceChildren(uiText(this.settings.interfaceLanguage, "saveAfterInstall"));
          save.title = message;
          save.setAttribute("aria-label", message);
        } else {
          delete save.dataset.saveBlocked;
          save.replaceChildren(uiText(this.settings.interfaceLanguage, "save"));
          save.title = uiText(this.settings.interfaceLanguage, "save");
          save.setAttribute("aria-label", uiText(this.settings.interfaceLanguage, "save"));
        }
      }
      if (!status) return;
      status.hidden = !busy;
      status.textContent = message;
    }
    showDictionarySaveBlocked(form) {
      this.syncDictionaryOperationState(form);
      const message = uiText(this.settings.interfaceLanguage, "dictionaryInstallSaveBlocked");
      const status = form.querySelector("[data-settings-save-status]");
      if (status) {
        status.hidden = false;
        status.textContent = message;
      }
      this.dependencies.toast(message);
    }
    setRecommendedDictionaryInstallState(form, dictionaryId, state, message) {
      this.recommendedDictionaryOperations.set(dictionaryId, { state, message });
      this.syncRecommendedDictionaryInstallControls(form);
    }
    clearRecommendedDictionaryInstallState(form, dictionaryId) {
      this.recommendedDictionaryOperations.delete(dictionaryId);
      this.syncRecommendedDictionaryInstallControls(form);
    }
    syncRecommendedDictionaryInstallControls(form) {
      form.querySelectorAll('[data-action="download-recommended-dictionary"]').forEach((button) => {
        const dictionaryId = button.dataset.dictionaryId ?? "";
        const operation = this.recommendedDictionaryOperations.get(dictionaryId);
        const status = button.closest(".jpdb-reader-recommended-item")?.querySelector("[data-recommended-dictionary-status]");
        if (!operation) {
          delete button.dataset.importState;
          delete button.dataset.importMessage;
          button.disabled = false;
          button.removeAttribute("disabled");
          if (status) {
            status.hidden = true;
            status.textContent = "";
            delete status.dataset.importState;
          }
          const installed = button.dataset.installed === "true";
          const label2 = installed ? uiText(this.settings.interfaceLanguage, "update") : uiText(this.settings.interfaceLanguage, "install");
          button.replaceChildren(label2);
          button.title = label2;
          button.setAttribute("aria-label", label2);
          return;
        }
        const label = uiText(this.settings.interfaceLanguage, operation.state === "installing" ? "installing" : "queued");
        button.disabled = true;
        button.dataset.importState = operation.state;
        button.dataset.importMessage = operation.message;
        button.replaceChildren(label);
        button.title = operation.message;
        button.setAttribute("aria-label", operation.message);
        if (status) {
          status.hidden = false;
          status.dataset.importState = operation.state;
          status.textContent = operation.message;
        }
      });
    }
    async handleSettingsAction(form, action, control) {
      const status = form.querySelector("[data-import-status]");
      const setStatus = settingsStatusSetter(status);
      try {
        await this.runSettingsAction(form, action, control, setStatus);
      } catch (error) {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const message = handleSettingsActionError(action, control, setStatus, error, language);
        this.dependencies.toast(message);
      }
    }
    async runSettingsAction(form, action, control, setStatus) {
      const handled = this.handleSettingsEditorAction(form, action, control) || await this.handleSettingsAudioAction(form, action, control) || await this.handleSettingsDictionaryAction(form, action, control, setStatus) || await this.handleSettingsImportExportAction(form, action, setStatus);
      if (!handled) await this.handleSettingsConnectionOrSupportAction(form, action, control, setStatus);
    }
    async handleSettingsConnectionOrSupportAction(form, action, control, setStatus) {
      if (await this.handleSettingsConnectionAction(form, action, control)) return true;
      return await this.handleSettingsSupportAction(action, control, setStatus);
    }
    handleSettingsEditorAction(form, action, control) {
      if (action === "settings-panel") {
        const panel = selectedSettingsPanel(control);
        activateSettingsPanel(form, panel);
        return true;
      }
      if (isDictionarySourceOrderAction(action)) {
        updateSourceRowEditor(action, control);
        return true;
      }
      if (isAudioSourceEditorAction(action)) {
        updateAudioSourceEditor(form, action, control);
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        syncBrowserTtsVoiceOptions(form);
        return true;
      }
      if (isLookupLinkEditorAction(action)) {
        updateDictionaryLookupLinkEditor(form, action, control);
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        return true;
      }
      if (action === "anki-tag-add" || action === "anki-tag-remove") {
        updateAnkiTagsEditor(form, action, control);
        return true;
      }
      return false;
    }
    handleAnkiTagInputKeydown(form, event) {
      if (event.key !== "Enter") return false;
      const input2 = event.target?.closest("[data-anki-tag-input]");
      if (!input2) return false;
      updateAnkiTagsEditor(form, "anki-tag-add", input2);
      return true;
    }
    async handleSettingsAudioAction(form, action, control) {
      if (action !== "preview-audio") return false;
      const button = settingsActionButton(control);
      const previous = this.settings;
      const previewSettings = readFormSettings(new FormData(form), this.settings);
      focusPreviewAudioSource(form, button, previewSettings);
      this.settings = { ...previewSettings, audioEnabled: true, audioViaBlob: true };
      button?.setAttribute("disabled", "true");
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      try {
        this.dependencies.toast(uiText(language, "playingAudioPreview"));
        await this.dependencies.audio.play(createAudioPreviewCard(), { userGesture: true });
        log.info("Audio settings preview started");
      } catch (error) {
        log.warn("Audio settings preview failed", error);
        this.dependencies.toast(errorMessage(error, uiText(language, "audioPreviewFailed")));
      } finally {
        this.settings = previous;
        button?.removeAttribute("disabled");
      }
      return true;
    }
    async handleSettingsDictionaryAction(form, action, control, setStatus) {
      if (action === "delete-yomitan-dictionary") {
        await this.deleteDictionaryFromSettings(form, control, setStatus);
        return true;
      }
      if (action === "import-yomitan-dictionary") {
        await this.importDictionaryFromSettings(form, setStatus);
        return true;
      }
      if (action === "download-recommended-dictionary") {
        this.queueRecommendedDictionaryDownloadFromSettings(form, control, setStatus);
        return true;
      }
      if (action === "export-yomitan-dictionary") {
        const blob = await this.dependencies.dictionaries.exportJson();
        downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
        setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), "dictionariesExported"));
        log.info("Dictionaries exported");
        return true;
      }
      return false;
    }
    async handleSettingsImportExportAction(form, action, setStatus) {
      if (action === "import-yomitan-settings") {
        await this.importReaderSettingsFromFile(form, setStatus);
        return true;
      }
      if (action === "export-reader-settings") {
        const dictionaries = await this.exportReaderDictionaryBackup();
        downloadBlob(new Blob([JSON.stringify({
          formatName: "yomu-reader-settings",
          formatVersion: 3,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          settings: this.settings,
          storage: await exportManagedStoredValues(),
          ...dictionaries ? { dictionaries } : {}
        }, null, 2)], { type: "application/json" }), `yomu-settings-${dateStamp()}.json`);
        setStatus(uiText(getFormInterfaceLanguage(form, this.settings.interfaceLanguage), "settingsExported"));
        log.info("Settings exported");
        return true;
      }
      return false;
    }
    async exportReaderDictionaryBackup() {
      const summary = await this.dependencies.dictionaries.summary().catch(() => ({ dictionaries: [] }));
      if (!summary.dictionaries.length) return void 0;
      const blob = await this.dependencies.dictionaries.exportJson();
      const json = JSON.parse(await blob.text());
      return readerDictionaryExportHasData(json) ? json : void 0;
    }
    async handleSettingsConnectionAction(form, action, control) {
      const connectionAction = ankiConnectionAction(action);
      if (!connectionAction) return false;
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const button = settingsActionButton(control);
      const setAnkiStatus = ankiStatusSetter(form.querySelector("[data-anki-status]"));
      const previous = this.settings;
      this.settings = readFormSettings(new FormData(form), this.settings);
      button?.setAttribute("disabled", "true");
      setAnkiStatus(uiText(language, ankiConnectionPendingKey(connectionAction)), "pending");
      try {
        if (!await this.checkAnkiConnectionForSettings(setAnkiStatus, language)) return true;
        if (connectionAction === "test-anki") {
          this.finishAnkiConnectionTest(form, setAnkiStatus, language);
          return true;
        }
        await this.prepareAnkiConnectionAction(form, setAnkiStatus, language);
      } catch (error) {
        this.handleAnkiConnectionActionError(error, setAnkiStatus, language);
      } finally {
        this.settings = previous;
        button?.removeAttribute("disabled");
      }
      return true;
    }
    async checkAnkiConnectionForSettings(setAnkiStatus, language) {
      try {
        if (await this.dependencies.anki.isConnected()) return true;
      } catch (error) {
        log.warn("Anki settings check failed", error);
      }
      const line = this.ankiSetupUnavailableStatus(this.settings, language);
      setAnkiStatus(line.message, line.tone, line.action);
      return false;
    }
    finishAnkiConnectionTest(form, setAnkiStatus, language) {
      setAnkiStatus(uiText(language, "ankiConnectionReady"), "success");
      this.queueAutomaticAnkiLibraryScan(form, language);
      log.info("Anki settings check ok", { url: this.settings.ankiConnectUrl });
    }
    async prepareAnkiConnectionAction(form, setAnkiStatus, language) {
      await this.dependencies.anki.ensureDeckAndModel();
      setAnkiStatus(this.ankiReadyMessage(language), "success");
      this.queueAutomaticAnkiLibraryScan(form, language);
      log.info("Anki settings prepare succeeded", { deck: this.settings.ankiDeck, model: this.settings.ankiModel });
    }
    handleAnkiConnectionActionError(error, setAnkiStatus, language) {
      if (isAnkiConnectAvailabilityError(error) || isAnkiConnectSetupError(error)) {
        const line = this.ankiSetupUnavailableStatus(this.settings, language);
        log.warn("Anki settings action unavailable", error);
        setAnkiStatus(line.message, line.tone, line.action);
        return;
      }
      const message = this.ankiConnectionErrorMessage(error, language);
      log.warn("Anki settings test failed", error);
      setAnkiStatus(message, "error");
      this.dependencies.toast(message);
    }
    applyAnkiScanToForm(form, scan) {
      this.applyAnkiFieldMappingsToForm(form, scan);
      const controls = ankiScanFormControls(form);
      const selection = ankiScanSelection(controls, scan);
      this.applyAnkiScanControlsToForm(form, scan, selection);
      applySettingsControlValue(controls.model, selection.selectedModel);
      applySettingsControlValue(controls.deck, selection.selectedDeck);
      this.renderAnkiFieldMappingEditor(form);
    }
    applyAnkiFieldMappingsToForm(form, scan) {
      const input2 = namedSettingsControl(form, "ankiFieldMappings");
      if (!input2) return;
      const existing = readFormSettings(new FormData(form), this.settings).ankiFieldMappings;
      const next = { ...existing };
      for (const model of scan.models) {
        const currentMapping = next[model.modelName] ?? {};
        const liveFields = new Set(model.fields);
        const mapping = Object.fromEntries(model.suggestions.flatMap((suggestion) => {
          const savedField = currentMapping[suggestion.role]?.trim();
          const fieldName = liveFields.has(savedField ?? "") ? savedField : suggestion.fieldName?.trim();
          return fieldName ? [[suggestion.role, fieldName]] : [];
        }));
        if (Object.keys(mapping).length) next[model.modelName] = mapping;
      }
      input2.value = JSON.stringify(next);
      input2.dispatchEvent(new Event("input", { bubbles: true }));
    }
    applyAnkiScanControlsToForm(form, scan, selected = {}) {
      const deckOptions = form.querySelector("[data-anki-deck-options]");
      const currentDeck = selected.selectedDeck ?? namedSettingsControl(form, "ankiDeck")?.value.trim() ?? "";
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      if (deckOptions) setInnerHtml(deckOptions, renderAnkiDeckLibraryOptions([currentDeck, ...scan.deckNames].filter(Boolean), currentDeck, language));
      this.renderNewTabAnkiDeckToggles(form, scan.deckNames, language);
      const modelOptions = form.querySelector("[data-anki-model-options]");
      if (modelOptions) {
        const currentModel = selected.selectedModel ?? namedSettingsControl(form, "ankiModel")?.value.trim() ?? "";
        setInnerHtml(modelOptions, renderAnkiLibraryOptions([currentModel, ...scan.models.map((model) => model.modelName)].filter(Boolean), currentModel, language));
      }
      const fieldsInput = form.querySelector("[data-anki-scan-fields]");
      if (fieldsInput) {
        fieldsInput.value = JSON.stringify(Object.fromEntries(scan.models.map((model) => [model.modelName, model.fields])));
      }
      const confidenceInput = form.querySelector("[data-anki-scan-confidence]");
      if (confidenceInput) {
        confidenceInput.value = JSON.stringify(Object.fromEntries(scan.models.map((model) => [
          model.modelName,
          Object.fromEntries(model.suggestions.flatMap(
            (suggestion) => suggestion.fieldName ? [[suggestion.role, suggestion.confidence]] : []
          ))
        ])));
      }
      this.renderAnkiFieldMappingEditor(form);
    }
    renderNewTabAnkiDeckToggles(form, deckNames, language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage), disabledDecks = readNewTabAnkiDisabledDecks(form)) {
      const container = form.querySelector("[data-newtab-anki-decks]");
      if (!container) return;
      const html = renderNewTabAnkiDeckSelector(disabledDecks, deckNames, language);
      container.hidden = !html;
      setInnerHtml(container, html);
    }
    syncNewTabAnkiDeckToggles(form) {
      const hidden = namedSettingsControl(form, "newTabAnkiDisabledDecks");
      if (!hidden) return;
      const toggles = Array.from(form.querySelectorAll("[data-newtab-anki-deck-toggle]"));
      const visibleDecks = toggles.map((toggle) => toggle.dataset.newtabAnkiDeck?.trim() ?? "").filter(Boolean);
      const visibleDeckSet = new Set(visibleDecks);
      const previousDisabled = readNewTabAnkiDisabledDecks(form);
      const previousDisabledSet = new Set(previousDisabled);
      const visibleDisabled = toggles.filter((toggle) => !toggle.checked).map((toggle) => toggle.dataset.newtabAnkiDeck?.trim() ?? "").filter(Boolean);
      const visibleDisabledSet = new Set(visibleDisabled);
      const disabled = canonicalNewTabAnkiDisabledDecks([
        ...previousDisabled.filter((deck) => !visibleDeckSet.has(deck) || visibleDisabledSet.has(deck)),
        ...visibleDisabled.filter((deck) => !previousDisabledSet.has(deck))
      ]);
      hidden.value = disabled.join(", ");
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      this.renderNewTabAnkiDeckToggles(form, visibleDecks, getFormInterfaceLanguage(form, this.settings.interfaceLanguage), disabled);
    }
    renderAnkiFieldMappingEditor(form) {
      const container = form.querySelector("[data-anki-field-mapping-editor]");
      if (!container) return;
      const settings = readFormSettings(new FormData(form), this.settings);
      const modelName = namedSettingsControl(form, "ankiModel")?.value.trim() || settings.ankiModel;
      setInnerHtml(container, renderAnkiFieldMappingEditor(
        settings,
        modelName,
        this.ankiScanFieldsForModel(form, modelName),
        getFormInterfaceLanguage(form, this.settings.interfaceLanguage),
        this.ankiScanConfidenceForModel(form, modelName)
      ));
    }
    syncAnkiFieldMappingsFromEditor(form) {
      const input2 = namedSettingsControl(form, "ankiFieldMappings");
      const modelName = namedSettingsControl(form, "ankiModel")?.value.trim();
      if (!input2 || !modelName) return;
      const settings = readFormSettings(new FormData(form), this.settings);
      const next = { ...settings.ankiFieldMappings };
      const mapping = {};
      form.querySelectorAll("[data-anki-field-role]").forEach((select2) => {
        const role = select2.dataset.ankiFieldRole;
        const value = select2.value.trim();
        if (role && value) mapping[role] = value;
      });
      if (Object.keys(mapping).length) next[modelName] = mapping;
      else delete next[modelName];
      input2.value = JSON.stringify(next);
      input2.dispatchEvent(new Event("input", { bubbles: true }));
    }
    ankiScanFieldsForModel(form, modelName) {
      const input2 = form.querySelector("[data-anki-scan-fields]");
      if (!input2?.value.trim()) return [];
      try {
        const parsed = JSON.parse(input2.value);
        const fields = parsed[modelName];
        return Array.isArray(fields) ? fields.map(String).filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    ankiScanConfidenceForModel(form, modelName) {
      const input2 = form.querySelector("[data-anki-scan-confidence]");
      if (!input2?.value.trim()) return {};
      try {
        const parsed = JSON.parse(input2.value);
        const confidence = parsed[modelName] ?? {};
        return Object.fromEntries(ankiScanConfidenceEntries(confidence));
      } catch {
        return {};
      }
    }
    ankiScanMessage(scan, language) {
      if (!scan.suggestedModel) {
        return formatUiTemplate(uiText(language, "ankiScanNoModels"), {
          decks: String(scan.deckNames.length)
        });
      }
      const fields = scan.suggestedModel.suggestions.filter((suggestion) => suggestion.fieldName).map((suggestion) => `${suggestion.role}: ${suggestion.fieldName}`).join(", ");
      return formatUiTemplate(uiText(language, "ankiScanSummary"), {
        decks: String(scan.deckNames.length),
        models: String(scan.models.length),
        model: scan.suggestedModel.modelName,
        fields: formatUiTemplate(uiText(language, "ankiScanFieldSummary"), { fields })
      });
    }
    ankiReadyMessage(language) {
      return formatUiTemplate(uiText(language, "ankiConnectedReady"), {
        deck: this.settings.ankiDeck,
        model: this.settings.ankiModel
      });
    }
    ankiUnreachableMessage(language) {
      return uiText(language, "ankiSettingsUnreachable");
    }
    // Diagnostic-UX ticket: when the direct probe fails, tell the user WHICH
    // step failed. A no-cors probe that resolves means AnkiConnect is up but
    // rejected this origin (webCorsOriginList) — name the origin to add; only
    // a true network failure keeps the generic 'open Anki' guidance.
    async refineAnkiUnavailableStatus(form, requestId, settings, language) {
      if (canUseMobileAnkiHandoff(settings) || hasUserscriptAnkiBridge()) return;
      const url = settings.ankiConnectUrl || "http://127.0.0.1:8765";
      const verdict = await diagnoseAnkiConnectFailure(url).catch(() => "unreachable");
      if (!this.shouldApplyAnkiConnectionProbe(form, requestId)) return;
      if (verdict !== "cors-blocked") return;
      const origin = typeof location !== "undefined" ? location.origin : "";
      this.setAnkiStatus(form, uiText(language, "ankiCorsBlocked").replace("{origin}", origin), "pending");
    }
    ankiSetupUnavailableStatus(settings, language) {
      if (canUseMobileAnkiHandoff(settings)) {
        return { message: uiText(language, "mobileAnkiReady"), tone: "pending", state: "ready" };
      }
      if (typeof location !== "undefined" && location.hostname && !["127.0.0.1", "localhost", "::1"].includes(location.hostname) && !hasUserscriptAnkiBridge()) {
        return { message: uiText(language, "ankiHostedBridgeMissing"), tone: "pending", action: "anki-unreachable", state: "unreachable" };
      }
      return { message: this.ankiUnreachableMessage(language), tone: "pending", action: "anki-unreachable", state: "unreachable" };
    }
    // Field-mapping suggestions with their confidence, shown as the status
    // checklist instead of hidden mapping JSON (P1 adapter state machine).
    ankiScanDetails(scan, language) {
      const suggestions = scan.suggestedModel?.suggestions ?? [];
      return suggestions.filter((suggestion) => suggestion.fieldName || suggestion.confidence === "low").map((suggestion) => ({
        label: `${suggestion.role}: ${suggestion.fieldName ?? "—"}`,
        suffix: uiText(language, suggestion.confidence === "high" ? "ankiMappingConfidenceHigh" : suggestion.confidence === "medium" ? "ankiMappingConfidenceMedium" : "ankiMappingConfidenceLow")
      }));
    }
    staleAnkiFieldMappingDetails(form, scan, language) {
      const controls = ankiScanFormControls(form);
      const selection = ankiScanSelection(controls, scan);
      const modelName = selection.selectedModel?.trim();
      if (!modelName) return [];
      const model = scan.models.find((candidate) => candidate.modelName === modelName);
      if (!model) return [];
      const liveFields = new Set(model.fields);
      const mapping = readFormSettings(new FormData(form), this.settings).ankiFieldMappings[modelName] ?? {};
      return Object.entries(mapping).filter((entry) => isAnkiFieldMappingRole(entry[0]) && !liveFields.has(entry[1])).map(([role, fieldName]) => ({
        label: `${role}: ${fieldName}`,
        suffix: uiText(language, "ankiMappingStaleField")
      }));
    }
    ankiConnectionErrorMessage(error, language) {
      return error instanceof Error ? error.message : uiText(language, "ankiUnreachable");
    }
    async handleSettingsSupportAction(action, control, setStatus) {
      if (action === "copy-newtab-url") {
        await copyText(NEW_TAB_PAGE_URL);
        this.dependencies.toast(uiText(this.settings.interfaceLanguage, "newTabAddressCopied"));
        return true;
      }
      if (action === "factory-reset") {
        const button = settingsActionButton(control);
        button?.setAttribute("disabled", "true");
        try {
          await this.dependencies.resetAllData();
        } finally {
          button?.removeAttribute("disabled");
        }
        return true;
      }
      setStatus("");
      return false;
    }
    async deleteDictionaryFromSettings(form, control, setStatus) {
      const dictionary = control?.dataset.dictionaryName;
      if (!dictionary) throw new Error("Dictionary not found.");
      if (!window.confirm(formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryRemoveConfirm"), { dictionary }))) return;
      control?.setAttribute("disabled", "true");
      setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryRemoving"), { dictionary }));
      await this.dependencies.dictionaries.deleteDictionary(dictionary);
      await clearNewTabOfflineCache().catch(() => void 0);
      this.settings.dictionaryPreferences = this.settings.dictionaryPreferences.filter((item) => item.name !== dictionary);
      await saveSettings(this.settings);
      await this.dependencies.refreshDictionaryStyles();
      this.dependencies.scheduleDictionaryRescan();
      await this.refreshDictionaryStatus(form);
      this.dependencies.refreshNewTabIfCurrent();
      setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryRemoved"), { dictionary }));
      log.info("Dictionary removed", { dictionary });
    }
    async importDictionaryFromSettings(form, setStatus) {
      const file = await pickFile(form, "dictionary");
      if (!file) return;
      await this.enqueueDictionaryOperation(form, async () => {
        const summary = await this.dependencies.dictionaries.importFile(file, (message) => setStatus(message));
        await this.persistDictionaryImport(summary);
        setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryImportComplete"), {
          records: summary.entries.toLocaleString(),
          sources: summary.dictionaries.length.toLocaleString(),
          plural: summary.dictionaries.length === 1 ? "" : "s"
        }));
        log.info("Dictionary file imported", summary);
        await this.refreshDictionaryStatus(form);
        this.dependencies.refreshNewTabIfCurrent();
      });
    }
    queueRecommendedDictionaryDownloadFromSettings(form, control, setStatus) {
      void this.downloadRecommendedDictionaryFromSettings(form, control, setStatus).catch((error) => {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const message = handleSettingsActionError("download-recommended-dictionary", control, setStatus, error, language);
        this.dependencies.toast(message);
      });
    }
    async downloadRecommendedDictionaryFromSettings(form, control, setStatus) {
      const dictionary = recommendedDictionaryForControl(control);
      if (this.recommendedDictionaryOperations.has(dictionary.id)) return;
      const queuedMessage = formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryInstallQueued"), { dictionary: dictionary.name });
      this.setRecommendedDictionaryInstallState(form, dictionary.id, "queued", queuedMessage);
      setStatus(queuedMessage);
      await this.enqueueDictionaryOperation(form, async () => {
        try {
          const startedMessage = recommendedDictionaryDownloadStatus(control, dictionary.name, this.settings.interfaceLanguage);
          this.setRecommendedDictionaryInstallState(form, dictionary.id, "installing", startedMessage);
          setStatus(startedMessage);
          log.info("Downloading selected dictionary", { dictionary: dictionary.name });
          const summary = await this.downloadRecommendedDictionary(dictionary, control, (message) => {
            setStatus(message);
            this.setRecommendedDictionaryInstallState(form, dictionary.id, "installing", `${dictionary.name}: ${message}`);
          });
          if (!summary) return;
          await this.persistDictionaryImport(summary);
          setStatus(formatUiTemplate(uiText(this.settings.interfaceLanguage, "dictionaryRecordsImported"), {
            dictionary: dictionary.name,
            records: summary.entries.toLocaleString()
          }));
          await this.refreshDictionaryStatus(form);
          this.dependencies.refreshNewTabIfCurrent();
          log.info("Selected dictionary downloaded", { dictionary: dictionary.name, entries: summary.entries });
        } finally {
          this.clearRecommendedDictionaryInstallState(form, dictionary.id);
        }
      });
    }
    async persistDictionaryImport(summary) {
      this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {});
      this.settings.localDictionariesEnabled = true;
      await saveSettings(this.settings);
      await this.dependencies.refreshDictionaryStyles();
      this.dependencies.scheduleDictionaryRescan();
    }
    async downloadRecommendedDictionary(dictionary, control, setStatus) {
      if (!dictionary.downloadUrl) return null;
      const downloadUrl = dictionary.downloadUrl;
      try {
        return await this.dependencies.dictionaries.importFromUrl(downloadUrl, recommendedDictionaryFilename(dictionary), (message) => setStatus(message));
      } catch (error) {
        return this.handleRecommendedDictionaryDownloadError(dictionary, downloadUrl, control, setStatus, error);
      }
    }
    handleRecommendedDictionaryDownloadError(dictionary, downloadUrl, control, setStatus, error) {
      const message = errorMessage(error, uiText(this.settings.interfaceLanguage, "dictionaryDownloadFailed"));
      control?.removeAttribute("disabled");
      if (!this.shouldPromptManualDictionaryDownload(error, downloadUrl)) throw error;
      const status = `${message} ${uiText(this.settings.interfaceLanguage, "dictionaryManualDownloadHint")}`;
      setStatus(status);
      this.dependencies.toast(status);
      log.warn("Dictionary auto-download unavailable", { dictionary: dictionary.name, message });
      return null;
    }
    shouldPromptManualDictionaryDownload(error, downloadUrl) {
      const message = String(error?.message ?? "").toLowerCase();
      const manualDownloadHints = [
        "blocked in this browser",
        "cross-site",
        "request bridge",
        "request bridge is unavailable",
        "userscript bridge",
        "needs the yomu userscript",
        "needs yomu userscript",
        "need the yomu userscript",
        "needs the userscript",
        "user script request",
        "userscript request",
        "ブロック",
        "リクエストブリッジ",
        "ユーザースクリプト"
      ];
      return Boolean(downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) && manualDownloadHints.some((hint) => message.includes(hint));
    }
    async importReaderSettingsFromFile(form, setStatus) {
      const file = await pickFile(form, "settings");
      if (!file) return;
      const json = JSON.parse(await file.text());
      const readerSettings = getReaderSettingsExport(json);
      this.settings = readerSettings ? normalizeReaderSettings({ ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } }) : importedYomitanSettings(json, this.settings);
      const restoredValues = await importStoredValues(getReaderStorageExport(json));
      const dictionarySummary = await this.importReaderDictionaryBackup(json, setStatus);
      await this.mergeImportedDictionaryPreferences();
      await saveSettings(this.settings);
      setStatus(importSettingsStatus(restoredValues, dictionarySummary, this.settings.interfaceLanguage));
      this.dependencies.applyTheme();
      void this.dependencies.refreshDictionaryStyles();
      this.dependencies.scheduleDictionaryRescan();
      this.dependencies.installFab();
      this.dependencies.subtitles.refresh();
      this.dependencies.youtube.refresh();
      this.dependencies.clearSettingsPreview();
      log.info("Settings imported", loggingSettingsSummary(this.settings));
      this.open();
    }
    async importReaderDictionaryBackup(json, setStatus) {
      const dictionaryExport = getReaderDictionaryExport(json);
      if (!readerDictionaryExportHasData(dictionaryExport)) return null;
      setStatus(uiText(this.settings.interfaceLanguage, "importingBundledDictionaries"));
      const file = new File([JSON.stringify(dictionaryExport)], "yomu-dictionaries-from-settings.json", { type: "application/json" });
      const summary = await this.dependencies.dictionaries.importFile(file, (message) => setStatus(message));
      await this.persistDictionaryImport(summary);
      return summary;
    }
    async mergeImportedDictionaryPreferences() {
      const importedSummary = await this.dependencies.dictionaries.summary().catch(() => ({ dictionaries: [] }));
      const importedNames = importedSummary.dictionaries.map((item) => item.title);
      const importedTypes = Object.fromEntries(importedSummary.dictionaries.map((item) => [item.title, item.type]));
      this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames, importedTypes);
    }
  }
  function isDictionarySourceOrderAction(action) {
    return action === "dictionary-source-up" || action === "dictionary-source-down";
  }
  function isAudioSourceEditorAction(action) {
    return action === "audio-source-add" || action === "audio-source-remove" || action === "audio-source-up" || action === "audio-source-down";
  }
  function isLookupLinkEditorAction(action) {
    return action === "lookup-link-add" || action === "lookup-link-remove" || action === "lookup-link-up" || action === "lookup-link-down";
  }
  function getReaderStorageExport(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return record.formatName === "yomu-reader-settings" || record.formatName === "jpdb-popup-reader-settings" ? record.storage : null;
  }
  function publishSettingsChange(settings, options = {}) {
    dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { preview: options.preview === true, settings }));
  }
  function themeFromSettingsChangeEvent(event) {
    const theme = event.detail?.settings?.theme;
    return theme === "auto" || theme === "dark" || theme === "light" ? theme : void 0;
  }
  function importSettingsStatus(restoredValues, dictionarySummary, language) {
    const details = [];
    if (restoredValues) {
      details.push(formatUiTemplate(uiText(language, "restoredStoredChoices"), {
        count: restoredValues.toLocaleString(),
        plural: restoredValues === 1 ? "" : "s"
      }));
    }
    if (dictionarySummary) {
      details.push(formatUiTemplate(uiText(language, "importedDictionaryRecordCount"), {
        count: dictionarySummary.entries.toLocaleString(),
        plural: dictionarySummary.entries === 1 ? "" : "s"
      }));
    }
    return details.length ? formatUiTemplate(uiText(language, "settingsImportedWithDetails"), { details: details.join("; ") }) : uiText(language, "settingsImported");
  }
  function formatUiTemplate(template, values) {
    return template.replace(/\{([a-z]+)\}/gi, (_, key) => values[key] ?? "");
  }
  function importedYomitanSettings(json, current) {
    const imported = parseYomitanSettingsExport(json, current.interfaceLanguage);
    return normalizeReaderSettings({
      ...current,
      ...imported.settings,
      shortcuts: {
        ...current.shortcuts,
        ...imported.settings.shortcuts ?? {}
      }
    });
  }
  registerYomuCompanion("settings", { SettingsDialogController });
})();
