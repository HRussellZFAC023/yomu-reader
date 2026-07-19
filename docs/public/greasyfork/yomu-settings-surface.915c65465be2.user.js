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
  const APP_NAME = "よむ";
  const ACADEMY_SRS_LABEL = "Academy";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const SETTINGS_TITLE = `${APP_NAME} Settings`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_ORIGIN = "https://yomureader.com";
  const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
  const GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}`;
  const ANKI_CONNECT_ADDON_URL = "https://ankiweb.net/shared/info/2055492159";
  const DISCORD_INVITE_URL = "https://discord.gg/jD6NPURewD";
  const DONATE_URL = "https://support.yomureader.com/donate";
  const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
  const USERSCRIPT_INSTALL_URL = `${DOCS_BASE_URL}yomu.user.js`;
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
  const NEW_TAB_VERSION_URL = `${NEW_TAB_PAGE_URL}version.json`;
  const VIDEO_PLAYER_PAGE_URL = `${DOCS_BASE_URL}video-player/index.html`;
  const PDF_READER_PAGE_URL = `${DOCS_BASE_URL}pdf-reader/index.html`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const NADESHIKO_URL = "https://nadeshiko.co/";
  const NADESHIKO_DEVELOPER_URL = `${NADESHIKO_URL}user/developer`;
  const USERSCRIPT_HTTP_BRIDGE_READY_EVENT = "yomu-userscript-http-bridge-ready";
  const SETTINGS_CHANGE_EVENT = "yomu-settings-change";
  const JPDB_DEFINITION_SOURCE_ID = "__jpdb__";
  const JITEN_DEFINITION_SOURCE_ID = "__jiten__";
  const BUNPRO_DEFINITION_SOURCE_ID = "__bunpro__";
  const ANKI_SOURCE_ID = "__anki__";
  const STUDY_TRANSLATION_SOURCE_ID = "__study_translation__";
  const STUDY_GRAMMAR_SOURCE_ID = "__study_grammar__";
  const IMMERSION_KIT_SOURCE_ID = "__immersion_kit__";
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
  function isAppleTouchBrowser() {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
  }
  const SCALE_EPSILON = 0.05;
  const MAX_PAGE_SCALE = 3;
  const REDDIT_APPLE_TOUCH_ADAPTER = "reddit-apple-touch-page-scale";
  const rememberedRectScales = /* @__PURE__ */ new WeakMap();
  function isRedditHostname(hostname) {
    const normalized = hostname.toLowerCase().replace(/\.$/, "");
    return normalized === "reddit.com" || normalized.endsWith(".reddit.com");
  }
  function redditPageScale(environment) {
    if (!isRedditHostname(environment.hostname) || !environment.appleTouch) return 1;
    if (!positiveFinite(environment.innerWidth) || !positiveFinite(environment.outerWidth)) return 1;
    const scale = environment.outerWidth / environment.innerWidth;
    if (!Number.isFinite(scale) || scale <= 1 + SCALE_EPSILON) return 1;
    return Math.min(scale, MAX_PAGE_SCALE);
  }
  function redditOverlayViewport(environment = currentEnvironment()) {
    const pageScale = redditPageScale(environment);
    return {
      width: environment.innerWidth * pageScale,
      height: environment.innerHeight * pageScale,
      pageScale
    };
  }
  function redditOverlayViewportBounds(environment = currentEnvironment(), visualViewport = currentVisualViewport()) {
    const pageScale = redditPageScale(environment);
    const width = positiveFinite(visualViewport?.width) ? visualViewport.width : environment.innerWidth;
    const height = positiveFinite(visualViewport?.height) ? visualViewport.height : environment.innerHeight;
    const left = finiteCoordinate(visualViewport?.offsetLeft) * pageScale;
    const top = finiteCoordinate(visualViewport?.offsetTop) * pageScale;
    const scaledWidth = width * pageScale;
    const scaledHeight = height * pageScale;
    return {
      left,
      top,
      right: left + scaledWidth,
      bottom: top + scaledHeight,
      width: scaledWidth,
      height: scaledHeight,
      pageScale
    };
  }
  function redditLayoutPointToOverlay(point, pageScale = redditOverlayViewport().pageScale) {
    return {
      x: point.x * pageScale,
      y: point.y * pageScale
    };
  }
  function redditSourceRectToOverlay(rect, source, pageScale = redditOverlayViewport().pageScale) {
    const rememberedScale = rememberedRectScales.get(rect);
    const root = compensatedRedditOverlayRoot(source);
    const rectScale = rememberedScale ?? (root ? compensatedRootRectScale(root, pageScale) : pageScale);
    const overlayRect = scaleRect(rect, rectScale);
    rememberedRectScales.set(overlayRect, 1);
    return overlayRect;
  }
  function compensatedRedditOverlayRoot(source) {
    const element2 = source instanceof Element ? source : source?.parentElement;
    const root = element2?.closest(`[data-jpdb-reader-scale-adapter="${REDDIT_APPLE_TOUCH_ADAPTER}"]`);
    return root instanceof HTMLElement ? root : null;
  }
  function applyRedditOverlayScale(element2, environment = currentEnvironment()) {
    const pageScale = redditPageScale(environment);
    if (pageScale === 1) {
      clearOwnedScale(element2);
      return;
    }
    const inverseScale = 1 / pageScale;
    element2.style.setProperty("zoom", formatScale(inverseScale), "important");
    element2.dataset.jpdbReaderScaleAdapter = REDDIT_APPLE_TOUCH_ADAPTER;
    element2.dataset.jpdbReaderPageScale = formatScale(pageScale);
    element2.dataset.jpdbReaderScaleCompensation = formatScale(inverseScale);
  }
  function hasRedditOverlayScale(element2) {
    return element2?.dataset.jpdbReaderScaleAdapter === REDDIT_APPLE_TOUCH_ADAPTER;
  }
  function currentEnvironment() {
    return {
      hostname: location.hostname,
      appleTouch: isAppleTouchBrowser(),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth
    };
  }
  function currentVisualViewport() {
    const viewport = window.visualViewport;
    return viewport ? {
      width: viewport.width,
      height: viewport.height,
      offsetLeft: viewport.offsetLeft,
      offsetTop: viewport.offsetTop
    } : void 0;
  }
  function clearOwnedScale(element2) {
    if (!hasRedditOverlayScale(element2)) return;
    element2.style.removeProperty("zoom");
    delete element2.dataset.jpdbReaderScaleAdapter;
    delete element2.dataset.jpdbReaderPageScale;
    delete element2.dataset.jpdbReaderScaleCompensation;
  }
  function compensatedRootRectScale(root, pageScale = redditOverlayViewport().pageScale) {
    if (pageScale === 1) return 1;
    const rect = root.getBoundingClientRect();
    const ratios = [
      dimensionRatio(rect.width, root.offsetWidth),
      dimensionRatio(rect.height, root.offsetHeight)
    ].filter((ratio) => ratio !== void 0);
    if (!ratios.length) return 1;
    const measuredScale = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    const inverseScale = Number.parseFloat(root.dataset.jpdbReaderScaleCompensation ?? "") || 1 / pageScale;
    return Math.abs(measuredScale - inverseScale) < Math.abs(measuredScale - 1) ? pageScale : 1;
  }
  function dimensionRatio(rectSize, offsetSize) {
    if (!positiveFinite(rectSize) || !positiveFinite(offsetSize)) return void 0;
    return rectSize / offsetSize;
  }
  function scaleRect(rect, scale) {
    return new DOMRect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
  }
  function positiveFinite(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }
  function finiteCoordinate(value) {
    return Number.isFinite(value) ? value ?? 0 : 0;
  }
  function formatScale(value) {
    return String(Number(value.toFixed(6)));
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
  function openUrlInNewTab(url) {
    if (!isOpenableExternalUrl(url)) return false;
    const userscriptOpen = userscriptOpenInTab();
    if (userscriptOpen) {
      try {
        userscriptOpen(url, { active: true, insert: true, setParent: false });
        return true;
      } catch {
      }
    }
    const opened = window.open(url, "_blank", "noopener");
    if (opened) {
      try {
        opened.opener = null;
      } catch {
      }
      return true;
    }
    return false;
  }
  function userscriptOpenInTab() {
    if (typeof GM_openInTab === "function") return GM_openInTab;
    if (typeof GM !== "undefined" && typeof GM?.openInTab === "function") return GM.openInTab;
    return void 0;
  }
  function isOpenableExternalUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
  const INSTALL_GUIDE_URL = `${DOCS_BASE_URL}getting-started`;
  const UPDATE_GUIDE_URL = `${INSTALL_GUIDE_URL}#update-an-existing-install`;
  const EXTERNAL_APP_HANDLERS = /* @__PURE__ */ new Set(["userscripts", "stay"]);
  const INTERCEPTING_HANDLERS = /* @__PURE__ */ new Set(["tampermonkey", "violentmonkey", "greasemonkey", "scriptcat", "orangemonkey", "firemonkey", "adguard"]);
  const CHROMIUM_DASHBOARD_HANDLERS = /* @__PURE__ */ new Set(["tampermonkey"]);
  function scriptHandlerName(info) {
    if (!info || typeof info !== "object") return "";
    const handler = info.scriptHandler;
    return typeof handler === "string" ? handler.trim() : "";
  }
  function readGmInfo() {
    const g = globalThis;
    return g.GM_info ?? g.GM?.info;
  }
  function hasCallableOpenInTab() {
    const g = globalThis;
    return typeof g.GM_openInTab === "function" || typeof g.GM?.openInTab === "function";
  }
  function readUserAgent() {
    return typeof navigator === "object" && typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  }
  function isChromiumBrowser(userAgent) {
    return /(?:Chrome|Chromium|Edg)\/\d/i.test(userAgent);
  }
  function detectYomuUpdateFlow(info = readGmInfo(), openInTabAvailable = hasCallableOpenInTab(), userAgent = readUserAgent()) {
    if (!info || typeof info !== "object") return { kind: "no-manager", handler: "", url: INSTALL_GUIDE_URL };
    const handler = scriptHandlerName(info);
    const normalizedHandler = handler.toLowerCase();
    if (EXTERNAL_APP_HANDLERS.has(normalizedHandler)) return { kind: "external-manager", handler, url: USERSCRIPT_INSTALL_URL };
    if (CHROMIUM_DASHBOARD_HANDLERS.has(normalizedHandler) && isChromiumBrowser(userAgent)) {
      return { kind: "manager-dashboard", handler, url: UPDATE_GUIDE_URL };
    }
    if (INTERCEPTING_HANDLERS.has(normalizedHandler) || openInTabAvailable) return { kind: "manager", handler, url: USERSCRIPT_INSTALL_URL };
    return { kind: "no-manager", handler, url: INSTALL_GUIDE_URL };
  }
  function updateFlowNoteKey(kind) {
    switch (kind) {
      case "manager-dashboard":
        return "updateHelpNotesManagerDashboard";
      case "external-manager":
        return "updateHelpNotesExternalManager";
      case "no-manager":
        return "updateHelpNotesNoManager";
      case "manager":
      default:
        return "updateHelpNotesManager";
    }
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
  const READER_ROOT_SELECTOR = "[data-jpdb-reader-root]";
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
    },
    light: {
      text: "#17202a"
    }
  };
  const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white,
    outline: CORE_COLOR_TOKENS.black,
    background: READER_THEME_COLOR_TOKENS.dark.bg
  };
  const OCR_OVERLAY_COLOR_TOKENS = {
    text: READER_THEME_COLOR_TOKENS.light.text,
    outline: CORE_COLOR_TOKENS.white
  };
  const DEFAULT_WORD_COLOR_TOKENS = {
    new: "#ffffff",
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
    unknown: "#94a3b8"
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
  let trustedHtmlPolicy;
  function setInnerHtml(element2, html) {
    if (!assignInnerHtml(element2, html)) element2.textContent = html;
  }
  function assignInnerHtml(element2, html) {
    try {
      element2.innerHTML = trustedHtml(html);
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
    const words = Array.from(root.querySelectorAll(".jpdb-reader-word")).filter((word) => options.includeReaderRoot || !word.closest(READER_ROOT_SELECTOR)).filter((word) => !word.closest("[data-jpdb-reader-surface-ignore]")).filter((word) => !options.excludeSelector || !word.matches(options.excludeSelector));
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
  function readerWordSurfaceText(element2) {
    const surface = readerWordChildSurfaceText(element2);
    return surface || element2.getAttribute("data-surface") || "";
  }
  function readerWordChildSurfaceText(element2) {
    let text = "";
    element2.childNodes.forEach((node) => {
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
  function isSurfaceIgnoredElement(element2) {
    return READABLE_IGNORED_TAGS.has(element2.tagName) || element2.matches("[data-jpdb-reader-surface-ignore],.jpdb-reader-furi,.jpdb-ocr-furi");
  }
  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
  }
  const entries = [];
  const registeredKeys = /* @__PURE__ */ new Set();
  function registerManagedState(entry) {
    const identity = managedStateIdentity(entry);
    if (registeredKeys.has(identity)) return;
    registeredKeys.add(identity);
    entries.push(entry);
  }
  function registerManagedStates(list) {
    for (const entry of list) registerManagedState(entry);
  }
  function managedStateIdentity(entry) {
    return `${entry.kind}:${entry.key ?? ""}:${entry.prefix ?? ""}`;
  }
  function registeredManagedStorageKeys() {
    const keys = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (entry.kind !== "idb" && entry.key) keys.add(entry.key);
    }
    return [...keys];
  }
  const MANAGED_STATE_MANIFEST = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
    // Cloud settings sync handoff written before an OAuth redirect.
    { owner: "settings/dialog-controller", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
    // App-level signals / flags / caches.
    { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
    { owner: "app/card-state-signal", kind: "gm", key: "yomu:card-state-signal" },
    { owner: "app/logger", kind: "gm", key: "yomu:enable-logs" },
    { owner: "app/main", kind: "gm", key: "yomu:jpdb-review-examples-visible:v1" },
    { owner: "app/preferred-site-language", kind: "gm", key: "yomu:prefer-japanese-site-language" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps:hosts" },
    // Local no-account SRS deck.
    { owner: "app/storage", kind: "gm", key: "yomu:srs-local:v1" },
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
    // Reader CSS cache (version-suffixed → prefix family).
    { owner: "styles/index", kind: "gm", prefix: "yomu:reader-css-cache:v2:" },
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
  const FACTORY_RESET_SIGNAL_KEY = "yomu:factory-reset-signal";
  const YOMU_LOCAL_SRS_STORAGE_KEY = "yomu:srs-local:v1";
  const EXCLUDED_BACKUP_STORAGE_KEYS = /* @__PURE__ */ new Set([
    FACTORY_RESET_SIGNAL_KEY,
    // Transient cloud-sync handoff written before an OAuth redirect. Factory
    // reset owns it via the '__yomu' prefix, but backups must not replay it.
    "__yomu_cloud_settings_sync_pending_action"
  ]);
  async function gmStorageGet(key, fallback) {
    const getValue = asyncGmGetValue();
    if (getValue) {
      try {
        const value = await getValue(key, MISSING);
        if (!isMissingSentinel(value)) return value;
        const migrated = localStorageGet(key, MISSING);
        if (!isMissingSentinel(migrated)) {
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
    void gmStorageSet(key, migrated);
    return { kind: "found", value: migrated };
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
        result.catch((error) => debugStorageError("GM storage async write failed", key, error));
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
    const entries2 = await Promise.all(keys.map(async (key) => [key, await gmStorageGet(key, void 0)]));
    return Object.fromEntries(entries2.filter(([, value]) => value !== void 0));
  }
  async function exportManagedStoredValues() {
    return await exportStoredValues(MANAGED_STORAGE_KEY_PREFIXES);
  }
  async function importStoredValues(values) {
    let count = 0;
    for (const [key, value] of managedStoredValueEntries(values)) {
      const storedValue = key === YOMU_LOCAL_SRS_STORAGE_KEY ? await mergeYomuLocalSrsDeckImport(value) : value;
      await gmStorageSet(key, storedValue);
      localStorageSet(key, storedValue);
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
  async function mergeYomuLocalSrsDeckImport(imported) {
    const importedDeck = yomuLocalSrsDeckRecord(imported);
    if (!importedDeck) return imported;
    const existingDeck = yomuLocalSrsDeckRecord(await gmStorageGet(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null));
    if (!existingDeck) return importedDeck;
    return {
      version: 1,
      cards: mergeYomuLocalSrsCards(existingDeck.cards, importedDeck.cards)
    };
  }
  function yomuLocalSrsDeckRecord(value) {
    if (!isPlainRecord(value) || value.version !== 1 || !isPlainRecord(value.cards)) return null;
    const cards = {};
    for (const [id, card] of Object.entries(value.cards)) {
      if (isPlainRecord(card)) cards[id] = card;
    }
    return { version: 1, cards };
  }
  function mergeYomuLocalSrsCards(existingCards, importedCards) {
    const cards = { ...existingCards };
    for (const [id, importedCard] of Object.entries(importedCards)) {
      const existingCard = cards[id];
      cards[id] = existingCard ? mergeYomuLocalSrsCard(existingCard, importedCard) : importedCard;
    }
    return cards;
  }
  function mergeYomuLocalSrsCard(existingCard, importedCard) {
    return {
      ...importedCard,
      ...existingCard,
      meanings: uniquePrimitiveStrings([
        ...stringArray(importedCard.meanings),
        ...stringArray(existingCard.meanings)
      ]),
      sentence: existingCard.sentence || importedCard.sentence,
      sourceUrl: existingCard.sourceUrl || importedCard.sourceUrl,
      tags: uniquePrimitiveStrings([
        ...stringArray(importedCard.tags),
        ...stringArray(existingCard.tags)
      ]),
      createdAt: minFiniteNumber(importedCard.createdAt, existingCard.createdAt) ?? existingCard.createdAt ?? importedCard.createdAt,
      updatedAt: maxFiniteNumber(importedCard.updatedAt, existingCard.updatedAt) ?? existingCard.updatedAt ?? importedCard.updatedAt
    };
  }
  function stringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
  }
  function uniquePrimitiveStrings(values) {
    return Array.from(new Set(values));
  }
  function minFiniteNumber(a, b) {
    const values = [a, b].filter((value) => typeof value === "number" && Number.isFinite(value));
    return values.length ? Math.min(...values) : void 0;
  }
  function maxFiniteNumber(a, b) {
    const values = [a, b].filter((value) => typeof value === "number" && Number.isFinite(value));
    return values.length ? Math.max(...values) : void 0;
  }
  function isPlainRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    for (const key of registeredManagedStorageKeys()) {
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
        if (!isMissingSentinel(await getValue(key, MISSING))) return true;
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
  function asyncGmDeleteValue() {
    if (typeof GM_deleteValue === "function") return GM_deleteValue;
    const modern = globalThis.GM?.deleteValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key) => bridge.deleteValue(key) : null;
  }
  function asyncGmListValues() {
    const directListValues = globalThis.GM_listValues;
    if (typeof directListValues === "function") return directListValues;
    const modern = globalThis.GM?.listValues;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? () => bridge.listValues() : null;
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
    if (jpdb && jiten) return "Jiten + JPDB";
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
  function effectiveBunproFrontendApiToken(settings) {
    return settings.bunproFrontendApiToken?.trim() ?? "";
  }
  function hasBunproFrontendCredential(settings) {
    return Boolean(effectiveBunproFrontendApiToken(settings));
  }
  function isBunproFrontendCredentialExpired(settings, now = Date.now()) {
    const raw = settings.bunproFrontendApiTokenExpiresAt?.trim();
    if (!raw || !hasBunproFrontendCredential(settings)) return false;
    const expiresAt = Date.parse(raw);
    return Number.isFinite(expiresAt) && expiresAt <= now;
  }
  function splitApiCredential(value) {
    const credential = value.trim();
    if (!credential) return { apiKey: "", jitenApiKey: "" };
    return isJitenApiCredential(credential) ? { apiKey: "", jitenApiKey: credential } : { apiKey: credential, jitenApiKey: "" };
  }
  function readApiCredentialsFromFormData(data) {
    const bunpro = readBunproCredentialsFromFormData(data);
    if (data.has("apiCredentialJpdb") || data.has("apiCredentialJiten")) {
      return {
        ...mergeApiCredentialValues(
          String(data.get("apiCredentialJpdb") ?? ""),
          String(data.get("apiCredentialJiten") ?? "")
        ),
        ...bunpro
      };
    }
    if (data.has("apiCredential")) return { ...splitApiCredential(String(data.get("apiCredential") ?? "")), ...bunpro };
    return {
      apiKey: String(data.get("apiKey") ?? "").trim(),
      jitenApiKey: String(data.get("jitenApiKey") ?? "").trim(),
      ...bunpro
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
  function readBunproCredentialsFromFormData(data) {
    return {
      bunproApiKey: String(data.get("apiCredentialBunproLegacy") ?? data.get("bunproApiKey") ?? "").trim(),
      bunproFrontendApiToken: String(data.get("apiCredentialBunpro") ?? data.get("bunproFrontendApiToken") ?? "").trim(),
      bunproFrontendApiTokenExpiresAt: String(data.get("bunproFrontendApiTokenExpiresAt") ?? "").trim()
    };
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
  const MAX_DICTIONARY_LOOKUP_LINKS = 16;
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
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK
  ];
  const LEGACY_DEFAULT_LOOKUP_LINK_SET = [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK
  ];
  const PREVIOUS_DEFAULT_LOOKUP_LINK_ID_ORDERS = [[
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
    return DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link, index) => ({
      ...link,
      priority: index,
      enabled: mode === "jpdb" ? link.id === "jpdb" || link.id === "jiten" || link.id === "yomu-search" || link.id === "bunpro" || link.id === "jiten-frequency" || link.id === "jpdb-frequency" || link.id === "bunpro-frequency" : link.enabled
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
    if (!Array.isArray(value)) return false;
    const links = normalizeLookupLinkSet(value, value.length);
    if (!links) return false;
    const linkIds = links.map((link) => link.id).filter((id) => !isRemovedBuiltInLookupLinkId(id));
    return PREVIOUS_DEFAULT_LOOKUP_LINK_ID_ORDERS.some((ids) => {
      const expectedIds = ids.filter((id) => !isRemovedBuiltInLookupLinkId(id));
      return linkIds.length === expectedIds.length && expectedIds.every((id, index) => linkIds[index] === id);
    });
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
      if (link && !isRemovedBuiltInLookupLink(link)) add(link);
    }
    appendMissingBuiltInLookupLinks(builtIns, seen, add);
    return withLookupLinkPriorities(ensureJitenBeforeJpdb(normalized.slice(0, MAX_DICTIONARY_LOOKUP_LINKS)));
  }
  function isRemovedBuiltInLookupLink(link) {
    return isRemovedBuiltInLookupLinkId(link.id);
  }
  function isRemovedBuiltInLookupLinkId(id) {
    return id === REMOVED_GOO_LOOKUP_LINK_ID;
  }
  function defaultLookupLinkMode(preferJpdb) {
    return preferJpdb ? "jpdb" : "local";
  }
  function savedLookupLinksInDefaultOrder(links) {
    const linkById = new Map(links.map((link) => [link.id, link]));
    return withLookupLinkPriorities(DEFAULT_DICTIONARY_LOOKUP_LINKS.map((defaultLink) => linkById.get(defaultLink.id) ?? defaultLink));
  }
  function withLookupLinkPriorities(links) {
    return links.map((link, index) => ({
      ...link,
      priority: link.priority === void 0 || link.priority === Number.MAX_SAFE_INTEGER ? index : link.priority
    }));
  }
  function ensureJitenBeforeJpdb(links) {
    const jitenIndex = links.findIndex((link) => link.id === JITEN_LOOKUP_LINK.id);
    const jpdbIndex = links.findIndex((link) => link.id === JPDB_LOOKUP_LINK.id);
    if (jitenIndex < 0 || jpdbIndex < 0 || jitenIndex < jpdbIndex) return links;
    const reordered = [...links];
    const [jiten] = reordered.splice(jitenIndex, 1);
    const insertAt = reordered.findIndex((link) => link.id === JPDB_LOOKUP_LINK.id);
    reordered.splice(Math.max(0, insertAt), 0, jiten);
    return reordered;
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
      action,
      priority: finiteNumber(record.priority, Number.MAX_SAFE_INTEGER)
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
    return action === "copy" || action === "frequency-live" || action === "frequency-local" || Boolean(urlTemplate && isSafeLookupUrlTemplate(urlTemplate));
  }
  function normalizedLookupLinkId(record) {
    if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
    return typeof record.label === "string" ? `custom-${stableLookupLinkId(record.label)}` : "";
  }
  function normalizedLookupLinkLabel(record, id) {
    return typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 24) : id;
  }
  function normalizedLookupLinkAction(record, id) {
    if (record.action === "copy" || id === "copy") return "copy";
    if (record.action === "frequency-live" || id === "jiten-frequency" || id === "jpdb-frequency") return "frequency-live";
    if (record.action === "frequency-local" || id.startsWith("frequency-local:")) return "frequency-local";
    return "open";
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
  const log$7 = Logger.scope("Settings");
  const DEFAULT_AUDIO_URL = YOMU_HOSTED_AUDIO_URL;
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
  const DEFAULT_OVERLAY_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  const DEFAULT_OVERLAY_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
  const DEFAULT_OVERLAY_BACKGROUND_COLOR = OVERLAY_COLOR_TOKENS.background;
  const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
  const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;
  const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
  const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  const DEFAULT_OCR_OUTLINE_COLOR = OVERLAY_COLOR_TOKENS.outline;
  const DEFAULT_OCR_BACKGROUND_COLOR = accessibleOcrBackgroundColor(DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY);
  const LEGACY_DEFAULT_OCR_TEXT_COLOR = OCR_OVERLAY_COLOR_TOKENS.text;
  const LEGACY_DEFAULT_OCR_OUTLINE_COLOR = OCR_OVERLAY_COLOR_TOKENS.outline;
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
  const AUDIO_SOURCE_UI_TYPE_VALUES = AUDIO_SOURCE_TYPE_VALUES.filter((type) => type !== "custom");
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
  const AUDIO_SOURCE_TYPES = new Set(AUDIO_SOURCE_TYPE_VALUES);
  const LEGACY_DEFAULT_AUDIO_SOURCES_WITHOUT_API_TTS = [
    { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true },
    { type: "jpod101", url: "", voice: "", enabled: true },
    { type: "language-pod-101", url: "", voice: "", enabled: true },
    { type: "jisho", url: "", voice: "", enabled: true },
    { type: "text-to-speech", url: "", voice: "", enabled: true }
  ];
  const LEGACY_DEFAULT_AUDIO_SOURCES_WITH_API_TTS = [
    { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true },
    { type: "jpod101", url: "", voice: "", enabled: true },
    { type: "language-pod-101", url: "", voice: "", enabled: true },
    { type: "jisho", url: "", voice: "", enabled: true },
    { type: "jiten-tts", url: "", voice: "", enabled: true },
    { type: "jpdb-tts", url: "", voice: "", enabled: true },
    { type: "text-to-speech", url: "", voice: "", enabled: true }
  ];
  const DEFAULT_OFF_AUDIO_SOURCE_TYPES = new Set(
    DEFAULT_AUDIO_SOURCES.filter((source) => source.type !== "custom-json" || source.url !== YOMU_HOSTED_AUDIO_URL).map((source) => source.type)
  );
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
    "jitenDefinitionsEnabled",
    "bunproDefinitionsEnabled"
  ];
  const API_DEFINITION_NUMBER_SETTING_RANGES = {
    jpdbDefinitionsPriority: { min: 0, max: 999 },
    jitenDefinitionsPriority: { min: 0, max: 999 },
    bunproDefinitionsPriority: { min: 0, max: 999 }
  };
  const SOURCE_ALIAS_SETTING_KEYS = [
    "jpdbDefinitionsAlias",
    "jitenDefinitionsAlias",
    "bunproDefinitionsAlias",
    "jpdbKanjiAlias",
    "kanjiImmersionKitAlias",
    "uchisenAlias",
    "rtkAlias",
    "kanjivgAlias",
    "kanjiOriginsAlias",
    "kanjiDictionariesAlias",
    "immersionKitAlias",
    "ankiSectionAlias",
    "studyTranslationAlias",
    "studyGrammarAlias"
  ];
  const MINING_BOOLEAN_SETTING_KEYS = [
    "jpdbMiningEnabled",
    "bunproMiningEnabled",
    "yomuLocalSrsEnabled",
    "dictionarySourcesInitiallyExpanded"
  ];
  const SUBTITLE_BOOLEAN_SETTING_KEYS = [
    "subtitleNativeBlurred",
    "subtitleKaraokeMode",
    "subtitlePausePanel",
    "subtitleShadowAutoPause",
    "subtitleAutoCopyLine",
    "subtitleCopyIncludeTranslation",
    "subtitleMiningPause",
    "subtitleHoverPause"
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
    "pitchColorUnknown"
  ];
  const ANKI_TEMPLATE_MODES = ["context", "recognition"];
  const INTERFACE_LANGUAGES = ["en", "ja", "auto"];
  const THEMES = ["dark", "light", "auto"];
  const POPUP_MODES = ["sheet", "popover", "auto"];
  const HOVER_POPUP_MODES = ["sheet", "popover", "auto"];
  const POPOVER_HEIGHT_MODES = ["fixed", "available"];
  const AUDIO_AUTO_PLAY_MODES = ["off", "all", "hover", "tap"];
  const AUDIO_TTS_MODES = ["source-order", "fallback"];
  const IMMERSION_KIT_CATEGORIES = ["anime", "drama", "games", "all"];
  const IMMERSION_KIT_SORTS = ["sentence_length:desc", "sentence_length:asc"];
  const IMMERSION_EXAMPLE_SOURCES = ["nadeshiko", "combined", "immersion-kit"];
  const OCR_OVERLAY_THEMES = ["auto", "dark", "light"];
  const SUBTITLE_CONTROL_MODES = ["always", "hidden", "auto"];
  const SUBTITLE_TRANSCRIPT_PLACEMENTS = ["left", "bottom", "right"];
  const NEW_TAB_SOURCES = ["jpdb", "bunpro", "yomu-local", "anki", "auto", "dictionary"];
  const NEW_TAB_JPDB_REVIEW_MODES = ["auto", "api-vocabulary", "live-review"];
  const NEW_TAB_KANJI_KEYWORD_SOURCES = ["auto", "rtk", "jpdb", "local"];
  const DEFAULT_NEW_TAB_STUDY_STEP_ORDER = [
    "kanji-doodle",
    "word",
    "type-word",
    "recall-cloze",
    "listen-pitch",
    "speaking"
  ];
  const NEW_TAB_STUDY_CHALLENGE_STEPS$1 = new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
  const NEW_TAB_TYPE_WORD_INPUT_MODES = ["keyboard", "handwriting"];
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
    bunproApiKey: "",
    bunproFrontendApiToken: "",
    bunproFrontendApiTokenExpiresAt: "",
    onboardingSeen: false,
    interfaceLanguage: "en",
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
    pitchColorUnknown: DEFAULT_PITCH_COLORS.unknown,
    ...DEFAULT_COLOR_CHANNELS,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsAlias: "",
    jpdbDefinitionsPriority: 1,
    jitenDefinitionsEnabled: true,
    jitenDefinitionsAlias: "",
    jitenDefinitionsPriority: 0,
    bunproDefinitionsEnabled: true,
    bunproDefinitionsAlias: "",
    bunproDefinitionsPriority: 2,
    jpdbPageEnhancementsEnabled: true,
    jpdbPageWordEnhancementsEnabled: true,
    jpdbPageKanjiEnhancementsEnabled: true,
    jpdbKanjiEnabled: true,
    jpdbKanjiAlias: "",
    jpdbKanjiPriority: 10,
    kanjiImmersionKitEnabled: true,
    kanjiImmersionKitAlias: "",
    kanjiImmersionKitPriority: 60,
    uchisenEnabled: true,
    uchisenAlias: "",
    uchisenPriority: 50,
    rtkEnabled: true,
    rtkAlias: "",
    rtkPriority: 20,
    kanjivgEnabled: true,
    kanjivgAlias: "",
    kanjivgPriority: 0,
    kanjiOriginsEnabled: true,
    kanjiOriginsAlias: "",
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
    immersionKitAlias: "",
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
    lookupOnClick: true,
    lookupOnHover: true,
    lookupOnMiddleMouse: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 80,
    popupActivationMode: "hover",
    scanModifierKey: "shift",
    showFloatingButton: true,
    // First-install default: fresh browser-extension installs get Study on the
    // new tab (the page gates on this + runningAsBrowserExtension()). The page
    // never flips a user's explicit false back to true, so unchecking sticks.
    // Userscript / hosted new-tab is not gated by this flag, so the default is
    // harmless there.
    newTabEnabled: false,
    newTabAnkiEnabled: false,
    newTabAnkiDisabledDecks: [],
    newTabSource: "auto",
    newTabJpdbDeck: "all",
    newTabJpdbReviewMode: "auto",
    corsProxyUrl: "",
    newTabKanjiKeywordSource: "auto",
    newTabParsingEnabled: true,
    newTabFrontSentenceEnabled: true,
    newTabOfflineEnabled: true,
    newTabOfflineLimit: 50,
    newTabDailyGoalMinutes: 60,
    newTabKanjiUnlockEnabled: true,
    newTabStopAtBatchEnd: false,
    newTabSwipeReviews: true,
    newTabShortcutHintsEnabled: true,
    newTabKanjiAutogradeEnabled: true,
    newTabKanjiAutoSubmit: false,
    newTabStudyStepOrder: [...DEFAULT_NEW_TAB_STUDY_STEP_ORDER],
    newTabStudyDisabledSteps: [],
    newTabTypeWordInputMode: "keyboard",
    newTabStudyTourSeen: false,
    puckPositionX: void 0,
    puckPositionY: void 0,
    manualScanEnabled: false,
    annotationsPaused: false,
    showFurigana: true,
    furiganaMode: "difficult-kanji",
    clampedRowReadings: "show",
    puckFuriganaModeBeforeHide: "",
    furiganaHiddenStateGroups: ["known", "due", "failed"],
    wordColorStates: "all",
    wordColorHiddenStateGroups: [],
    showPitchAccent: true,
    showLookupPillFrequency: true,
    suppressRedundantWordUi: false,
    sheetCloseButtonOnLeft: false,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrVideoPauseFrames: false,
    ocrShowTextOverlay: false,
    ocrOverlayTheme: "auto",
    ocrProvider: "google-lens",
    ocrEndpointUrl: "",
    ocrEngine: "auto",
    ocrCloudVisionApiKey: "",
    ocrLanguage: "ja-JP",
    ocrMaxImagePixels: 12e5,
    ocrMinImageArea: 45e3,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrPrefetchPages: 2,
    ocrConcurrency: 3,
    ocrInvertDarkPanels: true,
    ocrTextColor: DEFAULT_OCR_TEXT_COLOR,
    ocrOutlineColor: DEFAULT_OCR_OUTLINE_COLOR,
    ocrBackgroundColor: DEFAULT_OCR_BACKGROUND_COLOR,
    ocrBackgroundOpacity: DEFAULT_OCR_BACKGROUND_OPACITY,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    parserProvider: "local",
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    kanjiDictionariesAlias: "",
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
    subtitleShadowAutoPause: false,
    subtitleTranscriptPlacement: "right",
    subtitleTranscriptAutoScroll: true,
    subtitleTranscriptAutoScrollResumeSeconds: 30,
    subtitleAutoCopyLine: false,
    subtitleCopyIncludeTranslation: true,
    subtitleControlsMode: "auto",
    subtitleFontSize: 28,
    subtitleBottomOffset: 16,
    subtitleTextColor: DEFAULT_OVERLAY_TEXT_COLOR,
    subtitleOutlineColor: DEFAULT_OVERLAY_OUTLINE_COLOR,
    subtitleBackgroundColor: DEFAULT_OVERLAY_BACKGROUND_COLOR,
    subtitleBackgroundOpacity: 0,
    subtitleFontFamily: DEFAULT_SUBTITLE_FONT_FAMILY,
    subtitleFontWeight: 760,
    subtitleMiningPause: true,
    subtitleHoverPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    // Default TRUE: only stored records that PREDATE this key (the era when
    // the notice's hide button persisted the setting off) migrate below.
    youtubeFilterNoticeRestored20260711: true,
    youtubeShowChannelRecommendations: true,
    preferJapaneseSiteLanguage: true,
    // Keep Anki opt-in: fresh installs/factory resets cannot assume Anki exists, and the send button costs real space on mobile popups.
    ankiEnabled: false,
    ankiSectionEnabled: false,
    ankiSectionAlias: "",
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
    studyTranslationAlias: "",
    studyGrammarEnabled: true,
    studyGrammarAlias: "",
    enableLogging: false,
    ankiTags: "yomu",
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    ankiFieldMappings: {},
    theme: "light",
    popupMode: "auto",
    hoverPopupMode: "popover",
    stickyBottomSheet: false,
    popoverBackdropEnabled: true,
    popoverWidth: 520,
    popoverHeight: 540,
    popoverHeightMode: "fixed",
    readerFontFamily: DEFAULT_READER_FONT_FAMILY,
    popupFontFamily: DEFAULT_POPUP_FONT_FAMILY,
    popupFontWeight: 400,
    jpdbMiningEnabled: true,
    // JPDB parity: the credential is the real gate, so importing a Bunpro
    // token makes grading work without hunting for a second checkbox.
    bunproMiningEnabled: true,
    yomuLocalSrsEnabled: true,
    apiGradingProvider: "jiten",
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
      scanPage: "Shift+J",
      hoverLookup: "",
      openSettings: "Ctrl+Shift+J",
      playAudio: "A",
      closePopup: "Escape",
      previousLookupWord: "Shift+ArrowLeft",
      nextLookupWord: "Shift+ArrowRight",
      previousSubtitle: "A",
      nextSubtitle: "D",
      copySubtitle: "Shift+C",
      toggleOcr: "Shift+O",
      toggleSubtitleOverlay: "Shift+H",
      toggleYoutubeImmersion: "Shift+Y",
      scanImages: "Shift+I",
      massReviewVisible: "Shift+M",
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
    const settingsValue = migrateHiddenFilterNotice(migrateLegacyDefaultMobileSettings(value));
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
      ...normalizeSourceAliasSettings(settingsValue),
      ...normalizeRemovedDictionarySettings(settingsValue),
      dictionaryPreferences: normalizeDictionaryPreferences(settingsValue?.dictionaryPreferences),
      dictionaryLookupLinks: normalizeDictionaryLookupLinkSettings(settingsValue),
      parserProvider: normalizeParserProvider(settingsValue),
      shortcuts: normalizeShortcutSettings(settingsValue)
    };
  }
  function normalizeParserProvider(value) {
    const provider = value?.parserProvider;
    if (provider === "local" || provider === "jiten" || provider === "jpdb" || provider === "auto") return provider;
    return value ? "auto" : DEFAULT_SETTINGS.parserProvider;
  }
  function normalizeReaderSettings(value) {
    return mergeSettings(value);
  }
  function normalizeApiCredentialSettings(value) {
    const apiKey = trimmedStringSetting(value, "apiKey", DEFAULT_SETTINGS.apiKey);
    const jitenApiKey = trimmedStringSetting(value, "jitenApiKey", DEFAULT_SETTINGS.jitenApiKey);
    const bunproApiKey = trimmedStringSetting(value, "bunproApiKey", DEFAULT_SETTINGS.bunproApiKey);
    const bunproFrontendApiToken = trimmedStringSetting(value, "bunproFrontendApiToken", DEFAULT_SETTINGS.bunproFrontendApiToken);
    const bunproFrontendApiTokenExpiresAt = normalizeOptionalIsoDateString(value?.bunproFrontendApiTokenExpiresAt);
    if (isJitenApiCredential(apiKey)) return { apiKey: "", jitenApiKey: jitenApiKey || apiKey, bunproApiKey, bunproFrontendApiToken, bunproFrontendApiTokenExpiresAt };
    return { apiKey, jitenApiKey, bunproApiKey, bunproFrontendApiToken, bunproFrontendApiTokenExpiresAt };
  }
  function stripUnsupportedSettings(value) {
    if (!value) return null;
    const supportedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => supportedKeys.has(key))
    );
  }
  function migrateHiddenFilterNotice(value) {
    if (!value) return value;
    if (value.youtubeFilterNoticeRestored20260711) return value;
    const migrated = { ...value, youtubeFilterNoticeRestored20260711: true };
    if (migrated.youtubeShowFilterNotice === false) migrated.youtubeShowFilterNotice = true;
    return migrated;
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
    if (value?.popupActivationMode === "modifier" && !shortcuts.hoverLookup.trim()) {
      shortcuts.hoverLookup = shortcutFromLegacyModifier(value.scanModifierKey) || "Shift";
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
      ...normalizeDefinitionSourcePrioritySettings(value),
      ...normalizeBooleanSettingGroup(value, LOOKUP_PAGE_ENHANCEMENT_KEYS),
      lookupOnClick: booleanSettingWithFallback(value, "lookupOnClick", true),
      lookupOnHover: booleanSettingWithFallback(value, "lookupOnHover", value?.popupActivationMode !== "click"),
      lookupOnMiddleMouse: booleanSettingWithFallback(value, "lookupOnMiddleMouse", true),
      hoverOpenDelayMs: clampNumber$1(value?.hoverOpenDelayMs, 0, 1500, DEFAULT_SETTINGS.hoverOpenDelayMs),
      hoverCloseDelayMs: clampNumber$1(value?.hoverCloseDelayMs, 0, 3e3, DEFAULT_SETTINGS.hoverCloseDelayMs)
    };
  }
  function normalizeDefinitionSourcePrioritySettings(value) {
    const normalized = normalizeNumberSettingGroup(value, API_DEFINITION_NUMBER_SETTING_RANGES);
    const ordered = isLegacyDefaultDefinitionSourceOrder(value) ? {
      ...normalized,
      jpdbDefinitionsPriority: DEFAULT_SETTINGS.jpdbDefinitionsPriority,
      jitenDefinitionsPriority: DEFAULT_SETTINGS.jitenDefinitionsPriority
    } : normalized;
    if (!hasOwn(value, "bunproDefinitionsPriority")) {
      ordered.bunproDefinitionsPriority = Math.min(999, Math.max(ordered.jpdbDefinitionsPriority, ordered.jitenDefinitionsPriority) + 1);
    }
    return ordered;
  }
  function normalizeSourceAliasSettings(value) {
    const aliases = {};
    for (const key of SOURCE_ALIAS_SETTING_KEYS) {
      aliases[key] = trimmedStringSetting(value, key, DEFAULT_SETTINGS[key]);
    }
    return aliases;
  }
  function isLegacyDefaultDefinitionSourceOrder(value) {
    return hasOwn(value, "jpdbDefinitionsPriority") && hasOwn(value, "jitenDefinitionsPriority") && value?.jpdbDefinitionsPriority === 0 && value?.jitenDefinitionsPriority === 1;
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
      newTabShortcutHintsEnabled: booleanSetting(value, "newTabShortcutHintsEnabled"),
      newTabKanjiAutogradeEnabled: booleanSetting(value, "newTabKanjiAutogradeEnabled"),
      newTabKanjiAutoSubmit: booleanSetting(value, "newTabKanjiAutoSubmit"),
      newTabStudyStepOrder: normalizeNewTabStudyStepOrder(value?.newTabStudyStepOrder),
      newTabStudyDisabledSteps: normalizeNewTabStudyDisabledSteps(value?.newTabStudyDisabledSteps),
      newTabTypeWordInputMode: normalizeOption(value?.newTabTypeWordInputMode, NEW_TAB_TYPE_WORD_INPUT_MODES, DEFAULT_SETTINGS.newTabTypeWordInputMode),
      newTabStudyTourSeen: booleanSetting(value, "newTabStudyTourSeen")
    };
  }
  function normalizeNewTabStudyStepOrder(value) {
    const ordered = normalizeStudyStepList(value);
    const legacyDefault = ["kanji-doodle", "word", "recall-cloze", "listen-pitch", "speaking", "type-word"];
    if (ordered.join(",") === legacyDefault.join(",")) return [...DEFAULT_NEW_TAB_STUDY_STEP_ORDER];
    return [
      ...ordered,
      ...DEFAULT_NEW_TAB_STUDY_STEP_ORDER.filter((step) => !ordered.includes(step))
    ];
  }
  function normalizeNewTabStudyDisabledSteps(value) {
    return normalizeStudyStepList(value);
  }
  function normalizeStudyStepList(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
      if (!isNewTabStudyChallengeStep$1(item) || out.includes(item)) continue;
      out.push(item);
    }
    return out;
  }
  function isNewTabStudyChallengeStep$1(value) {
    return typeof value === "string" && NEW_TAB_STUDY_CHALLENGE_STEPS$1.has(value);
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
      clampedRowReadings: settings.clampedRowReadings === "hover" ? "hover" : "show",
      puckFuriganaModeBeforeHide: isFuriganaMode(settings.puckFuriganaModeBeforeHide) && settings.puckFuriganaModeBeforeHide !== "off" ? settings.puckFuriganaModeBeforeHide : "",
      furiganaHiddenStateGroups: normalizeFuriganaHiddenStateGroups(settings.furiganaHiddenStateGroups),
      wordColorStates: settings.wordColorStates === "new-only" ? "new-only" : "all",
      wordColorHiddenStateGroups: normalizeWordColorHiddenStateGroups(settings.wordColorHiddenStateGroups),
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
      hoverPopupMode: normalizeHoverPopupMode(value?.hoverPopupMode),
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
      apiGradingProvider: normalizeApiGradingProvider(value?.apiGradingProvider),
      ...normalizeBooleanSettingGroup(value, MINING_BOOLEAN_SETTING_KEYS)
    };
  }
  function normalizeApiGradingProvider(value) {
    if (value === "jpdb") return "jpdb";
    if (value === "jiten") return "jiten";
    if (value === "bunpro") return "bunpro";
    return DEFAULT_SETTINGS.apiGradingProvider;
  }
  function normalizeOptionalIsoDateString(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    const time = Date.parse(value.trim());
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  }
  function normalizeMediaSettings(value) {
    const settings = value ?? {};
    const ocrBackgroundOpacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
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
      ocrProvider: normalizeOcrProvider(settings.ocrProvider, value),
      ocrOverlayTheme: normalizeOcrOverlayTheme(settings.ocrOverlayTheme),
      ocrEngine: normalizeOcrEngine(settings.ocrEngine),
      ocrCloudVisionApiKey: normalizeCloudVisionApiKey(settings.ocrCloudVisionApiKey),
      ocrTextColor: normalizeOcrTextColor(settings),
      ocrOutlineColor: normalizeOcrOutlineColor(settings),
      ocrBackgroundColor: accessibleOcrBackgroundColor(settings.accentColor, ocrBackgroundOpacity),
      ocrBackgroundOpacity,
      ocrFontScale: clampNumber$1(settings.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale)
    };
  }
  function normalizeOcrTextColor(settings) {
    const color = sanitizeAccentColor(settings.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor);
    return color === LEGACY_DEFAULT_OCR_TEXT_COLOR ? DEFAULT_SETTINGS.ocrTextColor : color;
  }
  function normalizeOcrOutlineColor(settings) {
    const color = sanitizeAccentColor(settings.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor);
    return color === LEGACY_DEFAULT_OCR_OUTLINE_COLOR ? DEFAULT_SETTINGS.ocrOutlineColor : color;
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
  function normalizeHoverPopupMode(value) {
    return normalizeOption(value, HOVER_POPUP_MODES, DEFAULT_SETTINGS.hoverPopupMode);
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
  function clampNumber$1(value, min, max2, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max2, number)) : fallback;
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
      const { min, max: max2 } = ranges[key];
      const fallback = DEFAULT_SETTINGS[key];
      normalized[key] = clampNumber$1(value?.[key], min, max2, typeof fallback === "number" ? fallback : 0);
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
  function normalizeOcrOverlayTheme(value) {
    return normalizeOption(value, OCR_OVERLAY_THEMES, DEFAULT_SETTINGS.ocrOverlayTheme);
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
  function normalizeWordColorHiddenStateGroups(value) {
    if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.wordColorHiddenStateGroups];
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
  function accessibleOcrBackgroundOpacity(opacity) {
    return Math.max(
      OCR_BACKGROUND_MIN_RENDERED_OPACITY,
      clampNumber$1(opacity, 0, 1, DEFAULT_OCR_BACKGROUND_OPACITY)
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
      await persistSettings(settings);
    } catch (error) {
      log$7.warn("Settings save failed", { error });
      throw error;
    }
  }
  async function persistSettings(settings) {
    const normalizedSettings = mergeSettings(settings);
    const storedSettings = stripUnsupportedSettings(normalizedSettings) ?? normalizedSettings;
    await gmStorageSet(SETTINGS_STORAGE_KEY, storedSettings);
    dispatchSettingsChange(storedSettings);
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
    if (Array.isArray(value)) return sources.length ? ensureHostedAudioSourceFirst(withBunproAudioSource(migrateLegacyDefaultAudioSources(sources))) : sources;
    if (typeof legacyUrl === "string" && legacyUrl.trim()) {
      return ensureHostedAudioSourceFirst([{ type: "custom-json", url: legacyUrl.trim(), voice: "", enabled: true }]);
    }
    return DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
  }
  function ensureHostedAudioSourceFirst(sources) {
    const hosted = sources.find(isHostedAudioSource) ?? DEFAULT_AUDIO_SOURCES[0];
    return [
      { ...hosted },
      ...sources.filter((source) => !isHostedAudioSource(source)).map((source) => ({ ...source }))
    ];
  }
  function isHostedAudioSource(source) {
    return source.type === "custom-json" && source.url.trim() === YOMU_HOSTED_AUDIO_URL;
  }
  function migrateLegacyDefaultAudioSources(sources) {
    if (!isUntouchedLegacyDefaultAudioSources(sources)) return sources;
    const migrated = sources.map((source) => ({ ...source }));
    ensureBuiltInAudioSource(migrated, { type: "jpdb-tts", url: "", voice: "", enabled: false }, "text-to-speech");
    ensureBuiltInAudioSource(migrated, { type: "jiten-tts", url: "", voice: "", enabled: false }, "jpdb-tts");
    for (const source of migrated) {
      if (isDefaultOffAudioSource(source)) source.enabled = false;
    }
    return migrated;
  }
  function isUntouchedLegacyDefaultAudioSources(sources) {
    return audioSourceListMatches(sources, LEGACY_DEFAULT_AUDIO_SOURCES_WITHOUT_API_TTS) || audioSourceListMatches(sources, LEGACY_DEFAULT_AUDIO_SOURCES_WITH_API_TTS);
  }
  function audioSourceListMatches(sources, expected) {
    return sources.length === expected.length && expected.every((source, index) => audioSourceMatches(sources[index], source));
  }
  function audioSourceMatches(source, expected) {
    return Boolean(source && source.type === expected.type && source.url === expected.url && source.voice === expected.voice && source.enabled === expected.enabled);
  }
  function isDefaultOffAudioSource(source) {
    return DEFAULT_OFF_AUDIO_SOURCE_TYPES.has(source.type) && !source.url.trim() && !source.voice.trim();
  }
  function withBunproAudioSource(sources) {
    const result = sources.map((source) => ({ ...source }));
    ensureBuiltInAudioSource(result, { type: "bunpro", url: "", voice: "", enabled: false }, "jiten-tts");
    return result;
  }
  function ensureBuiltInAudioSource(sources, source, beforeType) {
    if (sources.some((candidate) => candidate.type === source.type)) return;
    const insertIndex = sources.findIndex((candidate) => candidate.type === beforeType);
    if (insertIndex < 0) sources.push(source);
    else sources.splice(insertIndex, 0, source);
  }
  new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  selectorPairs("control,toggle,player", ["class"]);
  new Set("heiban,atamadaka,nakadaka,odaka".split(","));
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const NEW_TAB_CACHE_KEY = "jpdb-reader-newtab-card-cache";
  function clearNewTabOfflineCache() {
    return gmStorageDelete(NEW_TAB_CACHE_KEY);
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
  async function requestJson(url, options = {}) {
    const value = await requestHttp(url, { ...options, responseType: "json" });
    return value;
  }
  const CURRENT_YOMU_VERSION = "1.6.232".trim() ? "1.6.232".trim() : "dev";
  function latestYomuVersionFromVersionJson(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    if (typeof record.buildId !== "string") return null;
    return yomuVersionFromBuildId(record.buildId, typeof record.appHash === "string" ? record.appHash : void 0);
  }
  function yomuVersionFromBuildId(buildId, appHash) {
    const value = buildId.trim();
    const hash = appHash?.trim();
    if (hash && value.endsWith(`-${hash}`)) return normalizedVersion(value.slice(0, -hash.length - 1));
    const match = value.match(/^(.+)-[a-f0-9]{12}$/i);
    return normalizedVersion(match?.[1] ?? value);
  }
  function compareYomuVersions(current, latest) {
    const currentParts = semanticVersionParts(current);
    const latestParts = semanticVersionParts(latest);
    if (!currentParts || !latestParts) return null;
    for (let index = 0; index < currentParts.length; index++) {
      if (currentParts[index] < latestParts[index]) return -1;
      if (currentParts[index] > latestParts[index]) return 1;
    }
    return 0;
  }
  function normalizedVersion(value) {
    const version = value?.trim() ?? "";
    return semanticVersionParts(version) ? version : null;
  }
  function semanticVersionParts(value) {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const RECOMMENDED_JAPANESE_DICTIONARIES = [
    {
      id: "jitendex",
      category: "terms",
      name: "Jitendex",
      descriptionKey: "recommendedJitendex",
      downloadUrl: "https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip"
    },
    {
      id: "jmdict",
      category: "terms",
      name: "JMdict",
      descriptionKey: "recommendedJmdict",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip"
    },
    {
      id: "jmnedict",
      category: "terms",
      name: "JMnedict",
      descriptionKey: "recommendedJmnedict",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip"
    },
    {
      id: "wty-ja-ja",
      category: "terms",
      name: "WTY JA-JA",
      descriptionKey: "recommendedWtyJapaneseJapanese",
      downloadUrl: "https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ja/ja/wty-ja-ja.zip"
    },
    {
      id: "pixiv-light",
      category: "terms",
      name: "Pixiv Light",
      descriptionKey: "recommendedPixivLight",
      downloadUrl: "https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip"
    },
    {
      id: "kanjidic",
      category: "kanji",
      name: "KANJIDIC",
      descriptionKey: "recommendedKanjidic",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip"
    },
    {
      id: "jpdb-kanji",
      category: "kanji",
      name: "JPDB Kanji",
      descriptionKey: "recommendedJpdbKanji",
      downloadUrl: "https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BKanji%5D%20JPDB%20Kanji.zip"
    },
    {
      id: "kanjium-pitch",
      category: "pitch",
      name: "Kanjium pitch accents",
      descriptionKey: "recommendedKanjiumPitch",
      downloadUrl: "https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip"
    },
    {
      id: "jpdbv2-kana",
      category: "frequency",
      name: "JPDBv2㋕",
      descriptionKey: "recommendedJpdbv2Kana",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip"
    },
    {
      id: "jiten",
      category: "frequency",
      name: "Jiten",
      descriptionKey: "recommendedJiten",
      downloadUrl: "https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan"
    },
    {
      id: "bccwj",
      category: "frequency",
      name: "BCCWJ",
      descriptionKey: "recommendedBccwj",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip"
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
      onboardingCopy: "Make Japanese text, subtitles, and images tappable.",
      onboardingLanguage: "Settings language",
      onboardingAccentColor: "Accent color",
      customAccentColor: "Custom color",
      onboardingImmersionOptions: "Immersion defaults",
      onboardingInstallOfflineDictionaries: "Download offline dictionaries (Jitendex + pitch accents)",
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
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Add each service credential here. Bunpro only needs the frontend token: import it from Bunpro settings, treat it like a password, and note that it is saved before it is verified. Academy reviews work locally without an account.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      bunproSettings: "Bunpro settings",
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
      yomuLocalSrsEnabled: `Enable ${ACADEMY_SRS_LABEL}`,
      addToForq: "Also copy JPDB adds to forq",
      enableReviews: "Show review buttons",
      reviewRatingScale: "Review rating scale",
      gradeTargetSelector: "Grade target",
      gradeTargetBoth: "Both",
      gradeTargetJpdb: "Grades JPDB",
      gradeTargetJiten: "Grades Jiten",
      gradeTargetBunpro: "Grades Bunpro",
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
      newTabAuto: `Auto: ${ACADEMY_SRS_LABEL}, accounts, then study words`,
      newTabApiSrs: "API SRS (Jiten / JPDB)",
      newTabBunpro: "Bunpro",
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
      newTabStudyStepWordHelp: "Japanese front, meaning and reading on reveal.",
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
      noExactPitch: "Exact pitch unavailable",
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
      colorSourceNone: "None",
      popupLookup: "Popup lookup",
      popupLookupEnabled: "Show Yomu lookup popup",
      popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
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
      puckHideFurigana: "Hide furigana",
      furiganaOffToast: "Furigana off. Lookups stay active.",
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
      hideFuriganaFor: "Hide furigana for",
      hideColorFor: "Hide color for",
      furiganaDifficultKanji: "Hard kanji only",
      furiganaHideKnown: "Hide familiar words",
      furiganaHoverOnly: "Show on hover",
      furiganaAllParsed: "Show on every parsed word",
      clampedRowReadings: "Readings on clamped rows",
      clampedRowReadingsShow: "Show (row grows)",
      clampedRowReadingsHover: "Hover only",
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
      parserProvider: "Parsing source",
      parserProviderLocal: "Local dictionaries (offline)",
      parserProviderJiten: "Jiten API",
      parserProviderJpdb: "JPDB API",
      parserProviderAuto: "Automatic (Jiten/JPDB)",
      parserProviderHelp: "Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic prefers Jiten, then JPDB.",
      offlineDictionarySetupComplete: "Offline dictionaries installed.",
      offlineDictionarySetupFailed: "Offline dictionary setup failed. Retry from Settings → Sources.",
      copiesCurrentWord: "Copies the current word",
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
      academy: "Academy",
      newTabPage: "Study",
      localAudio: "Local Audio",
      changelog: "Changelog",
      support: "Support",
      github: "GitHub",
      word: "Word",
      search: "Search",
      newTabAddressCopied: "Study address copied.",
      loading: "Loading...",
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
      apiGradingProvider: "Preferred grading service",
      apiGradingProviderHelp: "Which service the popover grades when a word exists in both Jiten and JPDB. Bunpro cards grade to Bunpro; the ⇄ toggle next to the grade buttons switches per word.",
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
      factoryResetDictionaryWarning: "Settings reset. Close other tabs.",
      factoryResetOtherTabReloading: "よむ reset elsewhere. Reloading...",
      factoryResetDeleteSettingsFailed: "Could not delete settings.",
      issues: "Issues",
      donate: "Donate",
      discord: "Discord",
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
      jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
      jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
      addedToJpdb: "Added to JPDB.",
      jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
      jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
      bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
      yomuLocalSrsDisabled: `Enable ${ACADEMY_SRS_LABEL} in Settings first.`,
      chooseJitenStudyDeck: "Choose a Jiten study deck first.",
      addedToJiten: "Added to Jiten.",
      addedToBunpro: "Added to Bunpro.",
      addedToYomuLocal: `Added to ${ACADEMY_SRS_LABEL}.`,
      kanjiDetailsUnavailable: "Kanji details are not available yet.",
      loadingDictionaryDetails: "Loading dictionary details...",
      jitenCompositeWords: "Composite words",
      usedInVocabulary: "Used in vocabulary",
      exampleSentences: "Example sentences",
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
yomuLocalSrsDisabled	先に設定でAcademyを有効にしてください。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
addedToBunpro	Bunproに追加しました。
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
  const JA_SETTINGS_COPY = parseUiCopyTable(String.raw`
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
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	各サービスの認証情報を設定します。Bunproに必要なのはフロントエンドトークンだけです。Bunpro設定から取り込み、パスワードと同様に扱ってください。保存時点では未確認です。Academyの復習はアカウントなしでも使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
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
yomuLocalSrsEnabled	Academyを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
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
newTabEnabled	学習を新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動: Academy・アカウント後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
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
colorSourcePitch	ピッチアクセント
colorSourceNone	なし
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
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
puckHideFurigana	ふりがなを隠す
furiganaOffToast	ふりがなを非表示にしました。単語の検索は引き続き使えます。
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
hideFuriganaFor	ふりがなを隠す対象
hideColorFor	色を隠す対象
furiganaDifficultKanji	難しい漢字のみ
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
noScannedFields
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
academy	アカデミー
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
    const element2 = target.closest(selector);
    if (!element2 || !root.contains(element2)) return null;
    onFound?.(element2);
    return element2;
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
  const SETTINGS_DRAWER_HEIGHT_STORAGE_KEY = "jpdb-reader-settings-drawer-height-ratio";
  const DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO = 0.88;
  const MIN_SETTINGS_DRAWER_HEIGHT_PX = 280;
  const SETTINGS_DRAWER_FULL_HEIGHT_THRESHOLD_PX = 12;
  const SETTINGS_DRAWER_TAP_MOVEMENT_PX = 8;
  const SETTINGS_DRAWER_KEYBOARD_STEP_PX = 56;
  function installSettingsDrawerHandle(drawer, label = "Resize settings", onTap) {
    if (drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled === "true") return;
    drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled = "true";
    let viewportHeight = 0;
    let drawerHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    let dragPageScale = 1;
    let suppressNextHandleClick = false;
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
      applyRedditOverlayScale(drawer);
      const previousViewportHeight = viewportHeight;
      const { pageScale } = redditOverlayViewport();
      const bottomInset = settingsDrawerBottomInset() * pageScale;
      viewportHeight = fixedChromeViewportHeight();
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
      movementDistance: (state) => Math.abs(state.deltaY * dragPageScale),
      onBegin: () => {
        dragPageScale = redditOverlayViewport().pageScale;
        startHeight = drawerHeight || restoredSettingsDrawerHeight(viewportHeight);
        rawDragHeight = startHeight;
        drawer.style.transition = "";
        drawer.classList.add("jpdb-reader-settings-drawer-resizing");
      },
      onUpdate: (state) => {
        rawDragHeight = startHeight - state.deltaY * dragPageScale;
        applyDrawerHeight(rawDragHeight);
      },
      onFinish: (_state, wasMoved) => {
        const finishHeight = rawDragHeight;
        if (wasMoved) {
          suppressNextHandleClick = true;
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
      if (suppressNextHandleClick) {
        suppressNextHandleClick = false;
        return;
      }
      onTap?.();
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
  function fixedChromeViewportHeight() {
    const overlayViewport = redditOverlayViewport();
    return overlayViewport.pageScale > 1 ? Math.max(0, Math.round(redditOverlayViewportBounds().height)) : visualViewportHeight();
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
      backup: "jpdb-reader-settings-panel-backup",
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
      const pageScale = redditOverlayViewport().pageScale;
      drag = {
        active: false,
        container,
        handle,
        pageScale,
        pointerId: event.pointerId,
        row,
        startY: sourceRowOverlayY(event.clientY, pageScale)
      };
      row.classList.add("jpdb-reader-order-row-drag-pending");
      dragDocument.addEventListener("pointermove", moveDrag);
      dragDocument.addEventListener("pointerup", finishDrag);
      dragDocument.addEventListener("pointercancel", finishDrag);
    });
    const moveDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const overlayY = sourceRowOverlayY(event.clientY, drag.pageScale);
      if (!drag.active && Math.abs(overlayY - drag.startY) < 4) return;
      event.preventDefault();
      drag.active = true;
      drag.row.classList.add("jpdb-reader-order-row-dragging");
      moveSourceRowToPointer(drag.container, drag.row, overlayY, drag.pageScale);
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
  function moveSourceRowToPointer(container, row, overlayY, pageScale) {
    const rows = Array.from(container.querySelectorAll("[data-source-row]")).filter((candidate) => candidate !== row);
    const target = rows.find((candidate) => {
      const rect = redditSourceRectToOverlay(candidate.getBoundingClientRect(), candidate, pageScale);
      return overlayY < rect.top + rect.height / 2;
    });
    if (target) container.insertBefore(row, target);
    else container.appendChild(row);
    syncSourceRowOrder(container);
  }
  function sourceRowOverlayY(clientY, pageScale) {
    return redditLayoutPointToOverlay({ x: 0, y: clientY }, pageScale).y;
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
  function settingsLanguageForElement(element2) {
    const control = element2.closest("form")?.elements.namedItem("interfaceLanguage");
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
      clamped: (key, min, max2, fallback) => Math.max(min, Math.min(max2, number(key, fallback))),
      colorSource
    };
  }
  function readNumber(value, fallback) {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function ocrInteractionModeFromSettings(settings) {
    if (!settings.ocrEnabled) return "off";
    return settings.ocrAutoScanImages ? "auto" : "manual";
  }
  const log$6 = Logger.scope("SettingsForm");
  const CUSTOM_FONT_FAMILY_VALUE = "__custom_font_family__";
  const COLOR_SOURCE_VALUES = ["status", "jpdb", "anki", "pitch", "off"];
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
    ["jpdbKanji", "jpdbKanjiEnabled", "jpdbKanjiPriority", "jpdbKanjiAlias"],
    ["kanjiImmersionKit", "kanjiImmersionKitEnabled", "kanjiImmersionKitPriority", "kanjiImmersionKitAlias"],
    ["uchisen", "uchisenEnabled", "uchisenPriority", "uchisenAlias"],
    ["rtk", "rtkEnabled", "rtkPriority", "rtkAlias"],
    ["kanjivg", "kanjivgEnabled", "kanjivgPriority", "kanjivgAlias"],
    ["kanjiOrigins", "kanjiOriginsEnabled", "kanjiOriginsPriority", "kanjiOriginsAlias"]
  ];
  const NEW_TAB_STUDY_CHALLENGE_STEPS = [
    "kanji-doodle",
    "word",
    "recall-cloze",
    "listen-pitch",
    "speaking",
    "type-word"
  ];
  function settingsColorSourceValue(settings, name) {
    const source = settings[name];
    return source === "auto" ? DEFAULT_COLOR_SOURCE_VALUES[name] : source;
  }
  function readFormSettings(data, current) {
    const colorSource = (key, fallback) => readOption(String(data.get(key) ?? ""), COLOR_SOURCE_VALUES, colorSourceFallback(key, fallback));
    const reader = createSettingsFormReader(data, colorSource);
    const { get, has } = reader;
    const audioSources = readAudioSources(data);
    const furiganaMode = readOption(get("furiganaMode"), ["all", "difficult-kanji", "known-status", "hover", "off"], current.furiganaMode === "auto" ? DEFAULT_SETTINGS.furiganaMode : current.furiganaMode);
    const apiDefinitionRowsPresent = {
      jpdb: hasSourceRow(has, "jpdbDefinitions"),
      jiten: hasSourceRow(has, "jitenDefinitions"),
      bunpro: hasSourceRow(has, "bunproDefinitions")
    };
    const dictionaryPreferences = readDictionaryPreferences$1(data, current.dictionaryPreferences, reader);
    const kanjiDictionaryPreferences = dictionaryPreferences.filter((preference) => preference.type === "kanji");
    const apiCredentials = readApiCredentialsFromFormData(data);
    const settings = {
      ...current,
      ...apiCredentials,
      // The deprecated key is no longer shown because Bunpro's full Yomu
      // integration uses only the frontend token. Preserve an older saved
      // value so opening Settings does not silently destroy user data.
      bunproApiKey: apiCredentials.bunproApiKey || current.bunproApiKey,
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
      ...readMiningFormSettings(reader, current),
      shortcuts: readShortcutFormSettings(reader, current)
    };
    const normalized = normalizeReaderSettings(settings);
    log$6.info("Read settings form data", {
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
      jpdbDefinitionsAlias: readSourceAlias(reader, "jpdbDefinitions", current.jpdbDefinitionsAlias),
      jpdbDefinitionsPriority: clamped("jpdbDefinitions.priority", 0, 999, current.jpdbDefinitionsPriority),
      jitenDefinitionsEnabled: rowsPresent.jiten ? has("jitenDefinitions.enabled") : current.jitenDefinitionsEnabled,
      jitenDefinitionsAlias: readSourceAlias(reader, "jitenDefinitions", current.jitenDefinitionsAlias),
      jitenDefinitionsPriority: clamped("jitenDefinitions.priority", 0, 999, current.jitenDefinitionsPriority),
      bunproDefinitionsEnabled: rowsPresent.bunpro ? has("bunproDefinitions.enabled") : current.bunproDefinitionsEnabled,
      bunproDefinitionsAlias: readSourceAlias(reader, "bunproDefinitions", current.bunproDefinitionsAlias),
      bunproDefinitionsPriority: clamped("bunproDefinitions.priority", 0, 999, current.bunproDefinitionsPriority),
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
    for (const [rowName, enabledKey, priorityKey, aliasKey] of rows) {
      out[enabledKey] = reader.has(`${rowName}.enabled`);
      out[priorityKey] = reader.clamped(`${rowName}.priority`, 0, 999, Number(current[priorityKey]));
      if (aliasKey) out[aliasKey] = readSourceAlias(reader, rowName, String(current[aliasKey] ?? ""));
    }
    return settings;
  }
  function readSourceAlias(reader, prefix, current) {
    const key = `${prefix}.alias`;
    return reader.has(key) ? reader.get(key).trim() : current;
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
    const { get, has, clamped } = reader;
    const pageScanMode = readOption(get("pageScanMode"), ["off", "auto", "manual"], pageScanModeFromSettings$2(current));
    return {
      lookupOnClick: has("lookupOnClick"),
      lookupOnHover: has("lookupOnHover"),
      lookupOnMiddleMouse: has("lookupOnMiddleMouse"),
      hoverOpenDelayMs: clamped("hoverOpenDelayMs", 0, 1500, current.hoverOpenDelayMs),
      hoverCloseDelayMs: clamped("hoverCloseDelayMs", 0, 3e3, current.hoverCloseDelayMs),
      popupActivationMode: has("popupLookupEnabled") ? current.popupActivationMode === "off" ? DEFAULT_SETTINGS.popupActivationMode : current.popupActivationMode : "off",
      scanModifierKey: current.scanModifierKey,
      showFloatingButton: has("showFloatingButton"),
      annotationsPaused: pageScanMode === "off",
      manualScanEnabled: pageScanMode === "manual"
    };
  }
  function pageScanModeFromSettings$2(settings) {
    if (settings.annotationsPaused) return "off";
    return settings.manualScanEnabled ? "manual" : "auto";
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
      newTabSource: readOption(get("newTabSource"), ["auto", "jpdb", "bunpro", "yomu-local", "anki", "dictionary"], current.newTabSource),
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
      newTabShortcutHintsEnabled: has("newTabShortcutHintsEnabled"),
      newTabKanjiAutogradeEnabled: has("newTabKanjiAutogradeEnabled"),
      newTabKanjiAutoSubmit: has("newTabKanjiAutoSubmit"),
      newTabStudyStepOrder: readNewTabStudyStepOrder(reader, current),
      newTabStudyDisabledSteps: readNewTabStudyDisabledSteps(reader, current),
      newTabStudyTourSeen: get("newTabStudyTourSeen") === "true"
    };
  }
  function readNewTabStudyStepOrder(reader, current) {
    const ordered = reader.getAll("newTabStudyStepOrder").filter(isNewTabStudyChallengeStep);
    return ordered.length ? ordered : current.newTabStudyStepOrder;
  }
  function readNewTabStudyDisabledSteps(reader, current) {
    const ordered = readNewTabStudyStepOrder(reader, current);
    const enabled = new Set(reader.getAll("newTabStudyEnabledStep").filter(isNewTabStudyChallengeStep));
    return ordered.filter((step) => !enabled.has(step));
  }
  function isNewTabStudyChallengeStep(value) {
    return NEW_TAB_STUDY_CHALLENGE_STEPS.includes(value);
  }
  function readReadingDisplayFormSettings(reader, furiganaMode) {
    const { has } = reader;
    const { get } = reader;
    return {
      showFurigana: furiganaMode !== "off",
      furiganaMode,
      furiganaHiddenStateGroups: ["new", "learning", "known", "due", "failed"].filter((group) => has(`furiganaHide-${group}`)),
      wordColorStates: readOption(get("wordColorStates"), ["all", "new-only"], "all"),
      clampedRowReadings: readOption(get("clampedRowReadings"), ["show", "hover"], "show"),
      wordColorHiddenStateGroups: ["new", "learning", "known", "due", "failed"].filter((group) => has(`colorHide-${group}`)),
      showPitchAccent: has("showPitchAccent"),
      showLookupPillFrequency: has("showLookupPillFrequency"),
      suppressRedundantWordUi: has("suppressRedundantWordUi"),
      sheetCloseButtonOnLeft: has("sheetCloseButtonOnLeft"),
      hideKnownFurigana: furiganaMode === "known-status"
    };
  }
  function readLocalDictionaryFormSettings(reader, current, kanjiPreferences) {
    const { get, has, clamped } = reader;
    return {
      localDictionariesEnabled: true,
      parserProvider: readOption(get("parserProvider"), ["local", "jiten", "jpdb", "auto"], current.parserProvider),
      localDictionaryShowKanji: has("kanjiDictionaries.enabled") || kanjiPreferences.some((preference) => preference.enabled),
      kanjiDictionariesAlias: readSourceAlias(reader, "kanjiDictionaries", current.kanjiDictionariesAlias),
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
        ankiSectionAlias: current.ankiSectionAlias,
        ankiSectionPriority: current.ankiSectionPriority
      };
    }
    return {
      ankiSectionEnabled: reader.has("ankiSection.enabled") || shouldAutoEnableAnkiSection(ankiEnabled, current),
      ankiSectionAlias: readSourceAlias(reader, "ankiSection", current.ankiSectionAlias),
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
      studyTranslationAlias: readSourceAlias(reader, "studyTranslation", current.studyTranslationAlias),
      studyTranslationPriority: clamped("studyTranslation.priority", 0, 999, current.studyTranslationPriority),
      studyGrammarEnabled: has("studyGrammar.enabled"),
      studyGrammarAlias: readSourceAlias(reader, "studyGrammar", current.studyGrammarAlias),
      studyGrammarPriority: clamped("studyGrammar.priority", 0, 999, current.studyGrammarPriority)
    };
  }
  function readPopupFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    const popupMode = readOption(get("popupMode"), ["auto", "sheet", "popover"], current.popupMode);
    return {
      theme: readOption(get("theme"), ["auto", "dark", "light"], current.theme),
      popupMode,
      hoverPopupMode: readOption(get("hoverPopupMode"), ["auto", "sheet", "popover"], current.hoverPopupMode),
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
  function readMiningFormSettings(reader, current) {
    const { get, has } = reader;
    return {
      jpdbMiningEnabled: has("jpdbMiningEnabled"),
      bunproMiningEnabled: has("bunproMiningEnabled"),
      yomuLocalSrsEnabled: has("yomuLocalSrsEnabled"),
      autoMineOnReview: has("autoMineOnReview"),
      miningDeck: get("miningDeck").trim() || "forq",
      neverForgetDeck: get("neverForgetDeck").trim() || "never-forget",
      blacklistDeck: get("blacklistDeck").trim() || "blacklist",
      addToForq: has("addToForq"),
      enableReviews: has("enableReviews"),
      twoButtonReviews: get("twoButtonReviews") === "true",
      apiGradingProvider: readOption(get("apiGradingProvider"), ["jiten", "jpdb"], current.apiGradingProvider === "jpdb" ? "jpdb" : "jiten")
    };
  }
  function readOcrFormSettings(reader, current) {
    const { get, has, clamped } = reader;
    const ocrInteractionMode = readOption(get("ocrInteractionMode"), ["auto", "manual", "off"], ocrInteractionModeFromSettings(current));
    return {
      ocrEnabled: ocrInteractionMode !== "off",
      ocrAutoScanImages: ocrInteractionMode === "auto",
      ocrShowTextOverlay: has("ocrShowTextOverlay"),
      ocrVideoPauseFrames: has("ocrVideoPauseFrames"),
      ocrInvertDarkPanels: has("ocrInvertDarkPanels"),
      ocrOverlayTheme: readOption(get("ocrOverlayTheme"), ["auto", "dark", "light"], current.ocrOverlayTheme),
      ocrProvider: normalizeOcrProvider(get("ocrProvider")),
      ocrEndpointUrl: get("ocrEndpointUrl").trim(),
      ocrEngine: get("ocrEngine").trim() || "auto",
      ocrCloudVisionApiKey: get("ocrCloudVisionApiKey").trim(),
      ocrLanguage: get("ocrLanguage").trim() || "ja-JP",
      ocrMaxImagePixels: clamped("ocrMaxImagePixels", 16e4, 28e5, current.ocrMaxImagePixels),
      ocrMinImageArea: clamped("ocrMinImageArea", 1e4, 8e5, current.ocrMinImageArea),
      ocrMaxImagesPerPage: clamped("ocrMaxImagesPerPage", 1, 30, current.ocrMaxImagesPerPage),
      ocrPrefetchMargin: clamped("ocrPrefetchMargin", 0, 3e3, current.ocrPrefetchMargin),
      ocrPrefetchPages: clamped("ocrPrefetchPages", 0, 10, current.ocrPrefetchPages),
      ocrConcurrency: clamped("ocrConcurrency", 1, 8, current.ocrConcurrency),
      ocrTextColor: sanitizeAccentColor(get("ocrTextColor"), current.ocrTextColor),
      ocrOutlineColor: sanitizeAccentColor(get("ocrOutlineColor"), current.ocrOutlineColor),
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
      subtitleShadowAutoPause: has("subtitleShadowAutoPause"),
      subtitleTranscriptPlacement: readOption(get("subtitleTranscriptPlacement"), ["right", "left", "bottom"], current.subtitleTranscriptPlacement),
      subtitleTranscriptAutoScroll: has("subtitleTranscriptAutoScroll"),
      subtitleTranscriptAutoScrollResumeSeconds: clamped("subtitleTranscriptAutoScrollResumeSeconds", 1, 30, current.subtitleTranscriptAutoScrollResumeSeconds),
      subtitleAutoCopyLine: has("subtitleAutoCopyLine"),
      subtitleCopyIncludeTranslation: has("subtitleCopyIncludeTranslation"),
      subtitleControlsMode: readOption(get("subtitleControlsMode"), ["auto", "always", "hidden"], current.subtitleControlsMode),
      subtitleFontSize: clamped("subtitleFontSize", 16, 64, current.subtitleFontSize),
      // The drag gesture may park the line anywhere on screen, which for a short
      // frame near the bottom of a tall viewport is far above 100% of the frame
      // height; only guard against garbage, not against legitimate positions.
      subtitleBottomOffset: clamped("subtitleBottomOffset", -200, 500, current.subtitleBottomOffset),
      subtitleTextColor: sanitizeAccentColor(get("subtitleTextColor"), current.subtitleTextColor),
      subtitleOutlineColor: sanitizeAccentColor(get("subtitleOutlineColor"), current.subtitleOutlineColor),
      subtitleBackgroundColor: sanitizeAccentColor(get("subtitleBackgroundColor"), current.subtitleBackgroundColor),
      subtitleBackgroundOpacity: clamped("subtitleBackgroundOpacity", 0, 1, current.subtitleBackgroundOpacity),
      subtitleFontFamily: readFontFamilySetting(reader, "subtitleFontFamily", current.subtitleFontFamily),
      subtitleFontWeight: clamped("subtitleFontWeight", 100, 900, current.subtitleFontWeight),
      subtitleMiningPause: has("subtitleMiningPause"),
      subtitleHoverPause: has("subtitleHoverPause"),
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
      immersionKitAlias: readSourceAlias(reader, "immersionKit", current.immersionKitAlias),
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
      action,
      priority: Number(get(`dictionaryLookupLinks.${index}.priority`)) || index
    };
  }
  function dictionaryLookupLinkAction(value) {
    if (value === "copy") return "copy";
    if (value === "frequency-live") return "frequency-live";
    if (value === "frequency-local") return "frequency-local";
    return "open";
  }
  function shouldKeepDictionaryLookupLink(label, urlTemplate, action) {
    return Boolean(label || urlTemplate || action === "copy" || action === "frequency-live" || action === "frequency-local");
  }
  function dictionaryLookupLinkLabel(label, action) {
    return action === "copy" && !label ? COPY_LOOKUP_LINK.label : label;
  }
  function dictionaryLookupLinkUrlTemplate(urlTemplate, action) {
    return action === "copy" || action === "frequency-live" || action === "frequency-local" ? "" : urlTemplate;
  }
  const SOURCE_ROW_COPY_KEYS_BY_ID = {
    __jpdb__: { helpKey: "sourceHelpJpdb" },
    __jiten__: { helpKey: "sourceHelpJiten" },
    __bunpro__: { helpKey: "sourceHelpBunpro" },
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
    const keyAttribute = keys?.nameKey ? ` data-source-placeholder-key="${escapeHtml(keys.nameKey)}"` : "";
    return `<input name="${row.prefix}.alias" type="text" value="${escapeHtml(row.alias)}" aria-label="Source display name" placeholder="${escapeHtml(row.name)}"${keyAttribute}>`;
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
    return !showAlias && row.alias ? row.alias : row.name;
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
  function renderDictionaryLookupLinkEditor(links, localFrequencyPreferences = []) {
    const rows = lookupPillEditorRows(links, localFrequencyPreferences);
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
      const isFrequencyAction = link.action === "frequency-live" || link.action === "frequency-local";
      const urlControl = isCopyAction ? `<span class="jpdb-reader-lookup-link-note" data-lookup-link-note="copy">Copies the current word</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">` : isFrequencyAction ? `<span class="jpdb-reader-lookup-link-note" data-lookup-link-note="frequency">${escapeHtml(frequencyLookupPillNote(link))}</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">` : `<input name="dictionaryLookupLinks.${index}.urlTemplate" type="text" value="${escapeHtml(link.urlTemplate)}" placeholder="https://takoboto.jp/?q={query}" aria-label="Lookup URL template">`;
      const removeControl = isCopyAction || isFrequencyAction ? '<span class="jpdb-reader-lookup-link-fixed" aria-label="Built-in action"></span>' : miniIconButton("remove", "Remove", 'data-action="lookup-link-remove"');
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
                    <input name="dictionaryLookupLinks.${index}.priority" type="hidden" value="${escapeHtml(String(link.priority ?? index))}">
                    ${orderTools}
                    ${renderRowRemoveTools(removeControl)}
                </div>
            `;
    }).join("")}
    `;
  }
  function lookupPillEditorRows(links, localFrequencyPreferences) {
    const normalized = normalizeDictionaryLookupLinks(links);
    const byId = new Map(normalized.map((link) => [link.id, link]));
    for (const preference of localFrequencyPreferences) {
      const id = localFrequencyLookupPillId(preference.name);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          label: preference.alias || preference.name,
          urlTemplate: "",
          enabled: true,
          action: "frequency-local",
          priority: preference.priority
        });
      }
    }
    return Array.from(byId.values()).sort(compareLookupPillEditorRows).slice(0, MAX_DICTIONARY_LOOKUP_LINKS);
  }
  function compareLookupPillEditorRows(a, b) {
    const priority = (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);
    if (priority) return priority;
    return a.id.localeCompare(b.id);
  }
  function localFrequencyLookupPillId(dictionary) {
    return `frequency-local:${dictionary}`;
  }
  function frequencyLookupPillNote(link) {
    if (link.action === "frequency-local") return "Installed local frequency dictionary badge. Replaces matching live site frequency.";
    return link.id === "jpdb-frequency" ? "Live JPDB frequency from site lookup; no local dictionary install." : "Live Jiten frequency from site lookup; no local dictionary install.";
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
  const JAPANESE_SANS_FONT_FAMILY = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
  const HIRAGINO_YU_GOTHIC_FONT_FAMILY = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  const JAPANESE_ROUNDED_FONT_FAMILY = '"Hiragino Maru Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif';
  const JAPANESE_SERIF_FONT_FAMILY = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif';
  const FONT_FAMILY_PRESETS = [
    { value: DEFAULT_POPUP_FONT_FAMILY, labelKey: "fontPresetYomuDefault", fallbackLabel: "Built-in font" },
    { value: JAPANESE_SANS_FONT_FAMILY, labelKey: "fontPresetJapaneseSans", fallbackLabel: "Japanese sans" },
    { value: HIRAGINO_YU_GOTHIC_FONT_FAMILY, labelKey: "fontPresetHiraginoYuGothic", fallbackLabel: "Hiragino / Yu Gothic" },
    { value: JAPANESE_ROUNDED_FONT_FAMILY, labelKey: "fontPresetJapaneseRounded", fallbackLabel: "Japanese rounded" },
    { value: JAPANESE_SERIF_FONT_FAMILY, labelKey: "fontPresetJapaneseSerif", fallbackLabel: "Japanese serif" },
    { value: DEFAULT_READER_FONT_FAMILY, labelKey: "fontPresetSystemUi", fallbackLabel: "System UI" }
  ];
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const DEFAULT_WEB_OAUTH_CLIENT_ID = "697885991868-bj7l5ja9vgbgk5i2ojcf5jfnkdg5h47g.apps.googleusercontent.com";
  const WEB_OAUTH_CLIENT_ID = DEFAULT_WEB_OAUTH_CLIENT_ID;
  const CLOUD_SETTINGS_SYNC_ENABLED = Boolean(WEB_OAUTH_CLIENT_ID);
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const SETTINGS_FILE_NAME = "yomu-settings.json";
  const SETTINGS_MIME_TYPE = "application/json";
  const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
  const OAUTH_BROKER_URL = "https://yomureader.com/oauth/google-drive.html";
  const OAUTH_RETURN_HASH_KEY = "yomu-drive-oauth-return";
  const OAUTH_TOKEN_HASH_KEY = "yomu-drive-oauth-token";
  const OAUTH_WINDOW_NAME_TYPE = "yomu-drive-oauth-token";
  const TOKEN_EARLY_REFRESH_MS = 6e4;
  const DRIVE_TIMEOUT_MS = 2e4;
  let cachedToken = null;
  let lastAuthRedirectResult = consumeAuthRedirectResult();
  function cloudSettingsSyncAvailable() {
    return CLOUD_SETTINGS_SYNC_ENABLED;
  }
  function cloudSettingsAuthRedirectResult() {
    return lastAuthRedirectResult;
  }
  async function uploadCloudSettingsToCloud(settings) {
    requireConfigured();
    const snapshot = {
      formatName: "yomu-google-drive-settings-sync",
      formatVersion: 1,
      syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
      settings,
      storage: await exportManagedStoredValues()
    };
    const serialized = JSON.stringify(snapshot);
    const existing = await findSettingsFile();
    const file = existing ? await updateSettingsFile(existing.id, serialized) : await createSettingsFile(serialized);
    return { syncedAt: snapshot.syncedAt, fileId: file.id, modifiedTime: file.modifiedTime };
  }
  async function downloadCloudSettingsFromCloud() {
    requireConfigured();
    const existing = await findSettingsFile();
    if (!existing?.id) return null;
    const body = await driveRequestText(`/drive/v3/files/${encodeURIComponent(existing.id)}?alt=media`);
    return parseSettingsSnapshot(body);
  }
  function requireConfigured() {
    if (!CLOUD_SETTINGS_SYNC_ENABLED) {
      throw new Error("Google Drive settings sync is not configured for this build.");
    }
  }
  async function findSettingsFile() {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      pageSize: "1",
      fields: "files(id,name,modifiedTime,size)",
      q: `name = '${SETTINGS_FILE_NAME.replace(/'/g, "\\'")}'`
    });
    const body = await driveRequestJson(`/drive/v3/files?${params.toString()}`);
    const files = isRecord(body) && Array.isArray(body.files) ? body.files : [];
    const first = files[0];
    return isRecord(first) && typeof first.id === "string" ? first : null;
  }
  async function createSettingsFile(serialized) {
    const boundary = `yomu_drive_sync_${randomBoundary()}`;
    const metadata = { name: SETTINGS_FILE_NAME, mimeType: SETTINGS_MIME_TYPE, parents: ["appDataFolder"] };
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${SETTINGS_MIME_TYPE}`,
      "",
      serialized,
      `--${boundary}--`,
      ""
    ].join("\r\n");
    const result = await driveRequestJson("/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      data: body
    });
    return driveFileFromResponse(result);
  }
  async function updateSettingsFile(fileId, serialized) {
    const result = await driveRequestJson(
      `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,
      { method: "PATCH", headers: { "Content-Type": SETTINGS_MIME_TYPE }, data: serialized }
    );
    return driveFileFromResponse(result);
  }
  async function driveRequestJson(path, options = {}) {
    return driveRequest(options, (body) => requestJson(driveUrl(path), body));
  }
  async function driveRequestText(path, options = {}) {
    return driveRequest(options, (body) => requestText(driveUrl(path), body));
  }
  async function driveRequest(options, run) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await acquireAccessToken(attempt === 0);
      try {
        return await run({
          method: options.method ?? "GET",
          headers: { ...options.headers ?? {}, Authorization: `Bearer ${token}` },
          data: options.data,
          responseType: "json",
          timeoutMs: DRIVE_TIMEOUT_MS,
          allowDirectCrossOrigin: true,
          preferFetch: true,
          failureLabel: "Google Drive settings sync"
        });
      } catch (error) {
        if (attempt === 0 && isUnauthorized(error)) {
          cachedToken = null;
          continue;
        }
        throw error;
      }
    }
    throw new Error("Google Drive settings sync failed to authorise.");
  }
  function driveUrl(path) {
    return `https://www.googleapis.com${path}`;
  }
  async function acquireAccessToken(allowCached) {
    if (allowCached && cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EARLY_REFRESH_MS) {
      return cachedToken.token;
    }
    const token = isUserscriptContext() ? await tokenViaPageRedirect() : await tokenViaIdentityServices();
    cachedToken = { token: token.accessToken, expiresAt: Date.now() + token.expiresInSeconds * 1e3 };
    return cachedToken.token;
  }
  async function tokenViaIdentityServices() {
    const gis = await loadIdentityServices();
    return new Promise((resolve, reject) => {
      try {
        const client = gis.accounts.oauth2.initTokenClient({
          client_id: WEB_OAUTH_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(googleTokenError(response)));
              return;
            }
            resolve({ accessToken: response.access_token, expiresInSeconds: Number(response.expires_in) || 3600 });
          },
          error_callback: (error) => reject(new Error(error?.message || "Google authorization was cancelled."))
        });
        client.requestAccessToken({ prompt: "" });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Google authorization failed to start."));
      }
    });
  }
  function tokenViaPageRedirect() {
    return new Promise((resolve, reject) => {
      const browserWindow = typeof window !== "undefined" ? window : void 0;
      if (!browserWindow?.location?.href) {
        reject(new Error("Google Drive settings sync needs a browser page."));
        return;
      }
      const state = randomBoundary();
      const brokerUrl = new URL(OAUTH_BROKER_URL);
      brokerUrl.searchParams.set("return_url", browserWindow.location.href);
      brokerUrl.searchParams.set("client_id", WEB_OAUTH_CLIENT_ID);
      brokerUrl.searchParams.set("state", state);
      try {
        navigateToOAuthBroker(browserWindow, brokerUrl.href);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Google authorization failed to start."));
      }
    });
  }
  function navigateToOAuthBroker(browserWindow, url) {
    const testNavigate = globalThis.__YOMU_TEST_NAVIGATE_TO_OAUTH__;
    if (testNavigate) {
      testNavigate(url);
      return;
    }
    browserWindow.location.assign(url);
  }
  function consumeAuthRedirectResult() {
    const browserWindow = typeof window !== "undefined" ? window : void 0;
    if (!browserWindow?.location?.href) return null;
    const state = oauthReturnState(browserWindow.location.href);
    if (!state) return null;
    const payload = parseOAuthReturnPayload(browserWindow.location.href) ?? parseOAuthWindowName(browserWindow.name);
    clearOAuthReturnHash(browserWindow);
    if (!payload || payload.type !== OAUTH_WINDOW_NAME_TYPE || payload.state !== state) {
      return { ok: false, state, error: "Google authorization returned without a Yomu token." };
    }
    browserWindow.name = "";
    if (typeof payload.accessToken === "string" && payload.accessToken) {
      const expiresInSeconds = Number(payload.expiresIn) || 3600;
      cachedToken = { token: payload.accessToken, expiresAt: Date.now() + expiresInSeconds * 1e3 };
      return { ok: true, state };
    }
    return { ok: false, state, error: payload.error || "Google authorization failed." };
  }
  function parseOAuthWindowName(value) {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function parseOAuthReturnPayload(href) {
    const encoded = oauthHashParam(href, OAUTH_TOKEN_HASH_KEY);
    if (!encoded) return null;
    try {
      const parsed = JSON.parse(encoded);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function oauthReturnState(href) {
    return oauthHashParam(href, OAUTH_RETURN_HASH_KEY);
  }
  function oauthHashParam(href, key) {
    let hash = "";
    try {
      hash = new URL(href).hash.slice(1);
    } catch {
      return "";
    }
    const prefix = `${key}=`;
    const entry = hash.split("&").find((part) => part.startsWith(prefix));
    if (!entry) return "";
    try {
      return decodeURIComponent(entry.slice(prefix.length));
    } catch {
      return "";
    }
  }
  function clearOAuthReturnHash(browserWindow) {
    if (!browserWindow.history?.replaceState) return;
    try {
      const url = new URL(browserWindow.location.href);
      const removedKeys = /* @__PURE__ */ new Set([OAUTH_RETURN_HASH_KEY, OAUTH_TOKEN_HASH_KEY]);
      const remainingHash = url.hash.slice(1).split("&").filter((part) => {
        if (!part) return false;
        const key = part.includes("=") ? part.slice(0, part.indexOf("=")) : part;
        return !removedKeys.has(key);
      }).join("&");
      url.hash = remainingHash ? `#${remainingHash}` : "";
      browserWindow.history.replaceState(browserWindow.history.state, document.title, url.toString());
    } catch {
    }
  }
  let identityServicesPromise = null;
  function loadIdentityServices() {
    const existing = googleIdentityServices();
    if (existing) return Promise.resolve(existing);
    if (identityServicesPromise) return identityServicesPromise;
    identityServicesPromise = new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error("Google Identity Services is unavailable in this context."));
        return;
      }
      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const gis = googleIdentityServices();
        if (gis) resolve(gis);
        else reject(new Error("Google Identity Services failed to initialise."));
      };
      script.onerror = () => {
        identityServicesPromise = null;
        reject(new Error("Failed to load Google Identity Services."));
      };
      document.head.appendChild(script);
    });
    return identityServicesPromise;
  }
  function googleIdentityServices() {
    const candidate = globalThis.google;
    return candidate?.accounts?.oauth2 ? candidate : null;
  }
  function isUserscriptContext() {
    const global = globalThis;
    return typeof GM_xmlhttpRequest === "function" || typeof global.GM?.xmlHttpRequest === "function" || typeof global.GM?.xmlhttpRequest === "function" || Boolean(global.GM_info);
  }
  function parseSettingsSnapshot(body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
    if (!isRecord(parsed) || parsed.formatName !== "yomu-google-drive-settings-sync") return null;
    if (!isRecord(parsed.settings)) return null;
    return parsed;
  }
  function driveFileFromResponse(value) {
    if (isRecord(value) && typeof value.id === "string") return value;
    throw new Error("Google Drive did not return the saved file.");
  }
  function isUnauthorized(error) {
    return error instanceof Error && /\(401\)|unauthor/i.test(error.message);
  }
  function googleTokenError(response) {
    return response.error_description || response.error || "Google authorization failed.";
  }
  function randomBoundary() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  function renderBunproStatusLine(settings) {
    const line = bunproStatusLineForSettings(settings, settings.interfaceLanguage);
    return `<div class="jpdb-reader-help jpdb-reader-status-line" data-bunpro-status data-status-tone="${line.tone}" role="status" aria-live="polite">${formatSettingsStatusLine(line, settings.interfaceLanguage)}</div>`;
  }
  function formatStatusTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
  }
  function jpdbStatusLineForSettings(settings, language) {
    return jpdbStatusLineFromValues(hasJpdbApiCredential(settings), hasJitenApiCredential(settings), language);
  }
  function bunproStatusLineForSettings(settings, language) {
    if (!hasBunproFrontendCredential(settings)) {
      return {
        message: resolveUiLanguage(language) === "ja" ? "Bunproトークンなし。" : "No Bunpro token.",
        tone: "pending"
      };
    }
    if (isBunproFrontendCredentialExpired(settings)) {
      return {
        message: resolveUiLanguage(language) === "ja" ? "Bunproトークンの期限切れ。" : "Bunpro token expired.",
        tone: "error"
      };
    }
    const expiresAt = settings.bunproFrontendApiTokenExpiresAt?.trim() ?? "";
    const date = expiresAt ? new Date(expiresAt) : null;
    const expires = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(resolveUiLanguage(language) === "ja" ? "ja-JP" : "en-GB") : "";
    return {
      message: expires ? resolveUiLanguage(language) === "ja" ? `Bunproトークン保存済み（未確認）。期限: ${expires}` : `Bunpro token saved (not verified). Expires ${expires}.` : resolveUiLanguage(language) === "ja" ? "Bunproトークン保存済み（未確認）。" : "Bunpro token saved (not verified).",
      tone: "pending"
    };
  }
  function jpdbStatusLineFromValues(hasJpdbApiKey, hasJitenApiKey, language) {
    if (!hasJpdbApiKey && !hasJitenApiKey) {
      return {
        message: jitenAwareMissingApiKeyMessage(language),
        tone: "pending"
      };
    }
    if (hasJpdbApiKey && hasJitenApiKey) {
      return {
        message: uiText(language, "jpdbAndJitenApiKeysConfigured"),
        tone: "success"
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
    return resolveUiLanguage(language) === "ja" ? "JitenまたはJPDBキーなし。" : "No Jiten or JPDB key.";
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
  function localizeBunproStatus(form, language) {
    const status = form.querySelector("[data-bunpro-status]");
    if (!status) return;
    const credentials = readApiCredentialsFromFormData(new FormData(form));
    const line = bunproStatusLineForSettings(credentials, language);
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
        alias: settings.kanjivgAlias,
        enabled: settings.kanjivgEnabled,
        priority: settings.kanjivgPriority,
        prefix: "kanjivg",
        readonly: true,
        help: uiText(language, "sourceHelpStrokePractice")
      },
      {
        id: KANJI_JPDB_SOURCE_ID,
        name: readingsComponentsName,
        alias: settings.jpdbKanjiAlias,
        enabled: settings.jpdbKanjiEnabled,
        priority: settings.jpdbKanjiPriority,
        prefix: "jpdbKanji",
        readonly: true,
        help: apiSource.name === "Jiten" ? uiText(language, "sourceHelpJitenKanjiFacts") : uiText(language, "sourceHelpReadingsComponents")
      },
      {
        id: KANJI_RTK_SOURCE_ID,
        name: "RTK",
        alias: settings.rtkAlias,
        enabled: settings.rtkEnabled,
        priority: settings.rtkPriority,
        prefix: "rtk",
        readonly: true,
        help: uiText(language, "sourceHelpRtk")
      },
      {
        id: IMMERSION_KIT_SOURCE_ID,
        name: uiText(language, "sourceNameImmersionKit"),
        alias: settings.kanjiImmersionKitAlias,
        enabled: settings.kanjiImmersionKitEnabled,
        priority: settings.kanjiImmersionKitPriority,
        prefix: "kanjiImmersionKit",
        readonly: true,
        help: uiText(language, "sourceHelpImmersionKit")
      },
      {
        id: KANJI_UCHISEN_SOURCE_ID,
        name: "Uchisen",
        alias: settings.uchisenAlias,
        enabled: settings.uchisenEnabled,
        priority: settings.uchisenPriority,
        prefix: "uchisen",
        readonly: true,
        help: uiText(language, "sourceHelpUchisen")
      },
      ...kanjiDictionaryRows.length ? [] : [{
        id: KANJI_DICTIONARIES_SOURCE_ID,
        name: uiText(language, "sourceNameImportedKanjiDictionaries"),
        alias: settings.kanjiDictionariesAlias,
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
        alias: settings.kanjiOriginsAlias,
        enabled: settings.kanjiOriginsEnabled,
        priority: settings.kanjiOriginsPriority,
        prefix: "kanjiOrigins",
        readonly: true,
        help: uiText(language, "sourceHelpComponentGraph")
      }
    ].sort(compareSourceRows);
  }
  function activeKanjiFactSource(settings) {
    return hasJitenApiCredential(settings) ? { name: "Jiten" } : { name: "JPDB" };
  }
  function kanjiDictionarySourceId(name) {
    return `${KANJI_DICTIONARY_SOURCE_PREFIX}${name}`;
  }
  function compareSourceRows(a, b) {
    return a.priority - b.priority || a.name.localeCompare(b.name);
  }
  const COLOR_SOURCE_CLASS_VALUES = ["status", "jpdb", "anki", "pitch"];
  const DEFAULT_JITEN_SETTINGS_URL = "https://jiten.moe/settings";
  const DEFAULT_BUNPRO_SETTINGS_URL = "https://bunpro.jp/settings/api";
  const PROXY_WORKER_SOURCE_URL = `${GITHUB_REPOSITORY_URL}/blob/main/workers/jpdb-public-proxy/src/index.ts`;
  const PROXY_WORKER_README_URL = `${GITHUB_REPOSITORY_URL}/tree/main/workers/jpdb-public-proxy`;
  function localizedOptions(text, table) {
    return table.map(([value, key]) => [value, text(key)]);
  }
  function settingsText(language) {
    return (key) => uiText(language, key);
  }
  function newTabSourceOptions(text) {
    return [
      ["auto", text("newTabAuto")],
      ["yomu-local", text("newTabYomuLocal")],
      ["jpdb", text("newTabApiSrs")],
      ["bunpro", text("newTabBunpro")],
      ["anki", "Anki"],
      ["dictionary", text("dictionaryFallback")]
    ];
  }
  function immersionKitExampleSourceOptions(text) {
    return [
      ["immersion-kit", text("immersionKit")],
      ["nadeshiko", "Nadeshiko"],
      ["combined", text("immersionKitAndNadeshiko")]
    ];
  }
  function ocrEngineOptions(text) {
    return [
      ["auto", text("automatic")],
      ["MangaOCR", text("ocrEngineMangaOcr")],
      ["PaddleOCR", "PaddleOCR"],
      ["AppleVision", text("ocrEngineAppleVision")]
    ];
  }
  function colorSourceSelectOptions(text, apiLabel) {
    return [
      ["status", text("colorSourceStatus").replace("JPDB", apiLabel)],
      ["jpdb", text("colorSourceJpdb").replace("JPDB", apiLabel)],
      ["anki", text("colorSourceAnki")],
      ["pitch", text("colorSourcePitch")],
      ["off", text("colorSourceNone")]
    ];
  }
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
  const NEW_TAB_STUDY_STEP_LABEL_KEYS = {
    "kanji-doodle": "newTabStudyStepKanji",
    word: "newTabStudyStepWord",
    "recall-cloze": "newTabStudyStepRecall",
    "listen-pitch": "newTabStudyStepListen",
    speaking: "newTabStudyStepSpeaking",
    "type-word": "newTabStudyStepType"
  };
  const NEW_TAB_STUDY_STEP_HELP_KEYS = {
    "kanji-doodle": "newTabStudyStepKanjiHelp",
    word: "newTabStudyStepWordHelp",
    "recall-cloze": "newTabStudyStepRecallHelp",
    "listen-pitch": "newTabStudyStepListenHelp",
    speaking: "newTabStudyStepSpeakingHelp",
    "type-word": "newTabStudyStepTypeHelp"
  };
  const DEFAULT_SETTINGS_PANEL = "appearance";
  const SETTINGS_TABS = [
    { panel: "appearance", active: true },
    { panel: "backup", labelKey: "backupSync" },
    { panel: "api" },
    { panel: "dictionaries", labelKey: "sources" },
    { panel: "media" },
    { panel: "mining" },
    { panel: "newTab" },
    { panel: "shortcuts" },
    { panel: "help" }
  ];
  const WORD_COLOR_FIELDS = [
    ["wordColorNew", "wordColorNew"],
    ["wordColorLearning", "wordColorLearning"],
    ["wordColorKnown", "wordColorKnown"],
    ["wordColorDue", "wordColorDue"],
    ["wordColorFailed", "wordColorFailed"],
    ["wordColorIgnored", "wordColorIgnored"]
  ];
  const PITCH_COLOR_FIELDS = [
    ["pitchColorHeiban", "pitchColorHeiban"],
    ["pitchColorAtamadaka", "pitchColorAtamadaka"],
    ["pitchColorNakadaka", "pitchColorNakadaka"],
    ["pitchColorOdaka", "pitchColorOdaka"],
    ["pitchColorUnknown", "pitchColorUnknown"]
  ];
  const OCR_COLOR_FIELDS = [
    ["ocrTextColor", "ocrTextColor"],
    ["ocrOutlineColor", "ocrOutlineColor"]
  ];
  const SUBTITLE_COLOR_FIELDS = [
    ["subtitleTextColor", "subtitleTextColor"],
    ["subtitleOutlineColor", "subtitleOutlineColor"],
    ["subtitleBackgroundColor", "subtitleBackgroundColor"]
  ];
  const COLOR_CHANNEL_FIELDS = [
    ["wordHighlightColorSource", "wordHighlightColorSource"],
    ["wordUnderlineColorSource", "wordUnderlineColorSource"],
    ["wordTextColorSource", "wordTextColorSource"],
    ["subtitleHighlightColorSource", "subtitleHighlightColorSource"],
    ["subtitleUnderlineColorSource", "subtitleUnderlineColorSource"],
    ["subtitleTextColorSource", "subtitleTextColorSource"]
  ];
  function escapedUiText(language, key) {
    return escapeHtml(uiText(language, key));
  }
  function renderHelpLinksPanel(language = "en") {
    return `
        <div class="jpdb-reader-help-links-card">
            <div class="jpdb-reader-settings-subsection jpdb-reader-help-update-strip" data-help-update-strip>
                <div class="jpdb-reader-help-version-row">
                    <div class="jpdb-reader-help-version-copy">
                        <div class="jpdb-reader-local-title" data-help-update-title>Version</div>
                        <div class="jpdb-reader-help-version-current" data-help-update-current>Yomu <span data-yomu-current-version>${escapeHtml(CURRENT_YOMU_VERSION)}</span></div>
                    </div>
                    <a class="jpdb-reader-btn jpdb-reader-help-update-link" href="${escapeHtml(detectYomuUpdateFlow().url)}" target="_blank" rel="noopener" data-action="open-yomu-update" data-help-link="update-userscript">${externalButtonLabel("Update")}</a>
                </div>
                <div class="jpdb-reader-help-update-meta">
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-update-status data-status-tone="pending" role="status" aria-live="polite" data-help-update-status>${escapeHtml(formatUiText("en", "updateStatusIdle", { current: CURRENT_YOMU_VERSION }))}</div>
                    <div class="jpdb-reader-help jpdb-reader-help-update-status" data-yomu-duplicate-status data-status-tone="success" role="status" data-help-duplicate-status>${escapeHtml(duplicateRuntimeStatusText("en"))}</div>
                </div>
                <div class="jpdb-reader-help jpdb-reader-help-update-note" data-help-update-notes>${escapeHtml(uiText(language, updateFlowNoteKey(detectYomuUpdateFlow().kind)))}</div>
            </div>
            <details class="jpdb-reader-settings-subsection jpdb-reader-help-disclosure" data-help-anki-disclosure>
                <summary class="jpdb-reader-local-title" data-help-anki-title>AnkiConnect setup</summary>
                <div class="jpdb-reader-help" data-help-anki-copy>Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.</div>
                <div class="jpdb-reader-help" data-help-anki-config-copy>Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:</div>
                <pre class="jpdb-reader-help-code"><code>{
  "webCorsOriginList": [
    "https://yomureader.com",
    "http://localhost",
    "http://127.0.0.1"
  ]
}</code></pre>
                <div class="jpdb-reader-help" data-help-anki-mobile>For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.</div>
                <div class="jpdb-reader-help" data-help-anki-brave>In Brave, disable Shields for the Study page if local Anki checks are blocked.</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn" href="${ANKI_CONNECT_ADDON_URL}" target="_blank" rel="noopener" data-help-link="anki-connect-addon">${externalButtonLabel("Open AnkiConnect add-on")}</a>
                    <a class="jpdb-reader-btn" href="${MOBILE_ANKI_SETUP_DOCS_URL}" target="_blank" rel="noopener" data-help-link="anki-mobile-docs">${externalButtonLabel("Mobile Anki setup docs")}</a>
                </div>
            </details>
            <div class="jpdb-reader-settings-subsection">
                <div class="jpdb-reader-local-title" data-help-links-title>Useful pages</div>
                <div class="jpdb-reader-help" data-help-links-copy>Open the hosted reader tools and docs from here.</div>
                <div class="jpdb-reader-help-actions">
                    <a class="jpdb-reader-btn" href="${VIDEO_PLAYER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="video-player">${externalButtonLabel("Video Player")}</a>
                    <a class="jpdb-reader-btn" href="${PDF_READER_PAGE_URL}" target="_blank" rel="noopener" data-help-link="pdf-reader">${externalButtonLabel("PDF Reader")}</a>
                    <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-help-link="new-tab">${externalButtonLabel(uiText(language, "newTabPage"))}</a>
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
                <h2>${escapedUiText(settings.interfaceLanguage, "settingsTitle")}</h2>
            </div>
            ${renderSettingsTabs(settings.interfaceLanguage)}
            ${renderSettingsSearch(settings.interfaceLanguage)}
            <div class="jpdb-reader-settings-scroll">
            ${renderApiSettingsPanel(settings, jpdbSettingsUrl, jitenSettingsUrl)}
            ${renderInterfaceSettingsPanel(settings)}
            ${renderNewTabSettingsPanel(settings)}
            ${renderAudioSettingsPanel(settings)}
            ${renderImmersionKitSettingsPanel(settings)}
            ${renderReaderSettingsPanel(settings)}
            ${renderDictionariesSettingsPanel(settings)}
            ${renderBackupSettingsPanel(settings)}
            ${renderKanjiSettingsPanel(settings)}
            ${renderImageSettingsPanel(settings)}
            ${renderVideoSettingsPanel(settings)}
            ${renderYoutubeSettingsPanel(settings)}
            ${renderMiningSettingsPanel(settings)}
            ${renderShortcutSettingsPanel(settings)}
            ${renderHelpSettingsPanel(settings)}
            </div>
            ${renderSettingsFooter(settings.interfaceLanguage)}
        `;
  }
  function renderSettingsTabs(language) {
    return `
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="${escapedUiText(language, "settingsSections")}">
                ${SETTINGS_TABS.map((tab) => settingsTabButton(tab.panel, uiText(language, tab.labelKey ?? tab.panel), Boolean(tab.active))).join("")}
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const jpdbStatus = renderJpdbStatusLine(settings);
    const bunproStatus = renderBunproStatusLine(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-api" role="tabpanel" data-settings-panel="api" data-legend-key="api" hidden>
                <legend>${escapedUiText(language, "api")}</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, "apiAccess")}</div>
                    <div class="grid">
                        ${input("apiCredentialJiten", `${escapedUiText(language, "apiCredentialJiten")} <a href="${jitenSettingsUrl}" target="_blank" rel="noopener">${escapedUiText(language, "jitenSettings")}</a>`, effectiveJitenApiKey(settings), "text", { ...API_KEY_INPUT_ATTRIBUTES, class: "jpdb-reader-masked-input" })}
                        ${input("apiCredentialJpdb", `${escapedUiText(language, "apiCredentialJpdb")} <a href="${jpdbSettingsUrl}" target="_blank" rel="noopener">${escapedUiText(language, "jpdbSettings")}</a>`, effectiveJpdbApiKey(settings), "text", { ...API_KEY_INPUT_ATTRIBUTES, class: "jpdb-reader-masked-input" })}
                        ${input("apiCredentialBunpro", `${escapedUiText(language, "apiCredentialBunpro")} <a href="${DEFAULT_BUNPRO_SETTINGS_URL}" target="_blank" rel="noopener">${escapedUiText(language, "bunproSettings")}</a>`, settings.bunproFrontendApiToken, "text", { ...API_KEY_INPUT_ATTRIBUTES, class: "jpdb-reader-masked-input", placeholder: "frontend_api_token" })}
                        <input type="hidden" name="bunproFrontendApiTokenExpiresAt" value="${escapeHtml(settings.bunproFrontendApiTokenExpiresAt)}">
                    </div>
                    <div class="jpdb-reader-help" data-jpdb-api-key-help>${escapedUiText(language, "apiAccessHelp")}</div>
                </div>
                ${jpdbStatus}
                ${bunproStatus}
                <div data-jpdb-decks>
                    ${renderDeckControls(settings, [], hasJpdbApiCredential(settings), settings.interfaceLanguage)}
                </div>
                ${checkbox("jpdbMiningEnabled", text("jpdbMiningEnabled"), settings.jpdbMiningEnabled)}
                ${checkbox("bunproMiningEnabled", text("bunproMiningEnabled"), settings.bunproMiningEnabled)}
                ${checkbox("addToForq", text("addToForq"), settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                ${checkbox("enableReviews", text("enableReviews"), settings.enableReviews)}
                ${select("apiGradingProvider", text("apiGradingProvider"), settings.apiGradingProvider === "bunpro" ? "jiten" : settings.apiGradingProvider, [["jiten", "Jiten"], ["jpdb", "JPDB"]])}
                <div class="jpdb-reader-help" data-grading-provider-help>${escapedUiText(language, "apiGradingProviderHelp")}</div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, "jpdbPageEnhancements")}</div>
                    <div class="grid">
                        ${checkbox("jpdbPageEnhancementsEnabled", text("jpdbPageEnhancementsEnabled"), settings.jpdbPageEnhancementsEnabled)}
                        ${checkbox("jpdbPageWordEnhancementsEnabled", text("jpdbPageWordEnhancementsEnabled"), settings.jpdbPageEnhancementsEnabled && settings.jpdbPageWordEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                        ${checkbox("jpdbPageKanjiEnhancementsEnabled", text("jpdbPageKanjiEnhancementsEnabled"), settings.jpdbPageEnhancementsEnabled && settings.jpdbPageKanjiEnhancementsEnabled, { disabled: !settings.jpdbPageEnhancementsEnabled })}
                    </div>
                    <div class="jpdb-reader-help">Adds your dictionaries, Immersion Kit, kanji practice, and other sources to jpdb.io and jiten.moe vocabulary, kanji, and parse pages. Toggle individual sources under Dictionaries and Reading.</div>
                </div>
            </fieldset>
    `;
  }
  function renderInterfaceSettingsPanel(settings) {
    const text = settingsText(settings.interfaceLanguage);
    return `
            <fieldset id="jpdb-reader-settings-panel-appearance" role="tabpanel" data-settings-panel="appearance" data-legend-key="appearance">
                <legend>${escapedUiText(settings.interfaceLanguage, "appearance")}</legend>
                <div class="grid">
                    ${select("interfaceLanguage", text("settingsLanguage"), settings.interfaceLanguage, localizedOptions(text, INTERFACE_LANGUAGE_OPTIONS))}
                    ${themeSegmentedControl(settings.theme, text)}
                    ${select("popupMode", text("popupMode"), settings.popupMode, localizedOptions(text, POPUP_MODE_OPTIONS))}
                    ${select("hoverPopupMode", text("hoverPopupMode"), settings.hoverPopupMode, localizedOptions(text, POPUP_MODE_OPTIONS))}
                    ${renderStickyBottomSheetControl(settings)}
                    ${checkbox("popoverBackdropEnabled", text("popoverBackdropEnabled"), settings.popoverBackdropEnabled)}
                    ${input("popoverWidth", text("popoverWidth"), String(settings.popoverWidth), "number", { min: 280, max: 900, step: 10 })}
                    ${input("popoverHeight", text("popoverHeight"), String(settings.popoverHeight), "number", { min: 220, max: 900, step: 10 })}
                    ${select("popoverHeightMode", text("popoverHeightMode"), settings.popoverHeightMode, localizedOptions(text, POPOVER_HEIGHT_MODE_OPTIONS))}
                    ${fontFamilyControl("readerFontFamily", text("readerFontFamily"), settings.readerFontFamily, text)}
                    ${fontFamilyControl("popupFontFamily", text("popupFontFamily"), settings.popupFontFamily, text)}
                    ${input("popupFontWeight", text("popupFontWeight"), String(settings.popupFontWeight), "number", { min: 300, max: 900, step: 10 })}
                    ${input("accentColor", text("accentColor"), sanitizeAccentColor(settings.accentColor), "color")}
                </div>
                ${renderWordColorSettingsSubsection(settings)}
                ${renderColorChannelSettingsSubsection(settings)}
                ${renderAppearancePreview(settings.interfaceLanguage)}
            </fieldset>
    `;
  }
  function renderStickyBottomSheetControl(settings) {
    const unavailable = settings.popupMode === "popover";
    return `
                    <div data-sticky-bottom-sheet-field ${unavailable ? "hidden" : ""}>
                        ${checkbox("stickyBottomSheet", uiText(settings.interfaceLanguage, "stickyBottomSheet"), settings.stickyBottomSheet && !unavailable, { disabled: unavailable })}
                    </div>`;
  }
  function renderNewTabSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-newtab" role="tabpanel" data-settings-panel="newTab" data-legend-key="newTab" hidden>
                <legend>${escapedUiText(settings.interfaceLanguage, "newTab")}</legend>
                ${renderNewTabSettingsSubsection(settings)}
            </fieldset>
    `;
  }
  function renderNewTabSettingsSubsection(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, "newTab")}</div>
                    <div class="grid jpdb-reader-settings-cgrid">
                        ${runningAsBrowserExtension() ? checkbox("newTabEnabled", "Set Study as the new tab", settings.newTabEnabled) : ""}
                        ${checkbox("newTabAnkiEnabled", text("newTabAnkiEnabled"), settings.newTabAnkiEnabled)}
                        ${renderNewTabAnkiDeckControls(settings)}
                        ${select("newTabSource", text("newTabSource"), settings.newTabSource, newTabSourceOptions(text))}
                        ${checkbox("yomuLocalSrsEnabled", text("yomuLocalSrsEnabled"), settings.yomuLocalSrsEnabled)}
                        ${select("newTabJpdbReviewMode", text("newTabJpdbReviewMode"), settings.newTabJpdbReviewMode, localizedOptions(text, NEW_TAB_JPDB_REVIEW_MODE_OPTIONS))}
                        <div data-review-config ${settings.enableReviews ? "" : "hidden"}>
                            ${select("twoButtonReviews", text("reviewRatingScale"), settings.twoButtonReviews ? "true" : "false", localizedOptions(text, TWO_BUTTON_REVIEW_OPTIONS))}
                        </div>
                        ${select("newTabKanjiKeywordSource", text("newTabKanjiKeywordSource"), settings.newTabKanjiKeywordSource, kanjiKeywordSourceOptions(settings, text))}
                    </div>
                    ${renderNewTabStudyStepOrderEditor(settings)}
                    <div class="grid jpdb-reader-settings-tgrid jpdb-reader-settings-study-options">
                        ${checkbox("newTabParsingEnabled", text("newTabParsingEnabled"), settings.newTabParsingEnabled)}
                        ${checkbox("newTabKanjiUnlockEnabled", text("newTabKanjiUnlockEnabled"), settings.newTabKanjiUnlockEnabled)}
                        ${checkbox("newTabStopAtBatchEnd", text("newTabStopAtBatchEnd"), settings.newTabStopAtBatchEnd)}
                        ${checkbox("newTabSwipeReviews", text("newTabSwipeReviews"), settings.newTabSwipeReviews)}
                        ${checkbox("newTabShortcutHintsEnabled", text("newTabShortcutHintsEnabled"), settings.newTabShortcutHintsEnabled)}
                        ${checkbox("newTabFrontSentenceEnabled", text("newTabFrontSentenceEnabled"), settings.newTabFrontSentenceEnabled)}
                        ${checkbox("newTabKanjiAutogradeEnabled", text("newTabKanjiAutogradeEnabled"), settings.newTabKanjiAutogradeEnabled)}
                        ${checkbox("newTabKanjiAutoSubmit", text("newTabKanjiAutoSubmit"), settings.newTabKanjiAutoSubmit)}
                        ${checkbox("newTabOfflineEnabled", text("newTabOfflineEnabled"), settings.newTabOfflineEnabled)}
                    </div>
                    <div class="grid jpdb-reader-settings-cgrid jpdb-reader-settings-study-options">
                        ${input("newTabOfflineLimit", text("newTabOfflineLimit"), String(settings.newTabOfflineLimit), "number", { min: 0, max: 500, step: 10 })}
                        ${input("newTabDailyGoalMinutes", text("newTabDailyGoalMinutes"), String(settings.newTabDailyGoalMinutes), "number", { min: 0, max: 1440, step: 5 })}
                        <label>${escapedUiText(language, "newTabUrl")}<input name="newTabUrl" type="text" value="${escapeHtml(NEW_TAB_PAGE_URL)}" readonly autocomplete="off"></label>
                    </div>
                    <div class="jpdb-reader-settings-actions">
                        <a class="jpdb-reader-btn" href="${NEW_TAB_PAGE_URL}" target="_blank" rel="noopener" data-newtab-url-link>${escapedUiText(language, "openNewTabPage")}</a>
                        <button class="jpdb-reader-btn" type="button" data-action="copy-newtab-url">${escapedUiText(language, "copyAddress")}</button>
                    </div>
                    <div class="jpdb-reader-help" data-newtab-address-help>${escapedUiText(language, "newTabAddressHelp")}</div>
                    <div class="jpdb-reader-help" data-newtab-offline-help>${escapedUiText(language, "newTabOfflineHelp")}</div>
                </div>
    `;
  }
  function renderNewTabStudyStepOrderEditor(settings) {
    const disabled = new Set(settings.newTabStudyDisabledSteps);
    const language = settings.interfaceLanguage;
    return `
                        <div class="jpdb-reader-settings-study-steps" data-source-editor data-study-step-editor>
                            <div class="jpdb-reader-settings-label-text" data-study-step-editor-title>${escapedUiText(language, "newTabStudySteps")}</div>
                            <div class="jpdb-reader-help" data-study-step-editor-help>${escapedUiText(language, "newTabStudyStepsHelp")}</div>
                            <div class="jpdb-reader-order-head jpdb-reader-study-step-head">
                                <span data-study-step-head="enabled">${escapedUiText(language, "enabledHeader")}</span>
                                <span data-study-step-head="step">${escapedUiText(language, "newTabStudyStepHeader")}</span>
                                <span data-study-step-head="details">${escapedUiText(language, "detailsHeader")}</span>
                                <span data-study-step-head="order">${escapedUiText(language, "orderHeader")}</span>
                            </div>
                            ${settings.newTabStudyStepOrder.map((step, index) => renderNewTabStudyStepRow(step, index, !disabled.has(step), language)).join("")}
                            <input name="newTabStudyTourSeen" type="hidden" value="${settings.newTabStudyTourSeen ? "true" : "false"}">
                        </div>
    `;
  }
  function renderNewTabStudyStepRow(step, index, enabled, language) {
    return `
                            <div class="jpdb-reader-order-row jpdb-reader-study-step-row" data-source-row data-study-step-row data-source-id="study-step-${escapeHtml(step)}">
                                <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                                    <input name="newTabStudyEnabledStep" type="checkbox" value="${escapeHtml(step)}" ${enabled ? "checked" : ""}>
                                    <span>${index + 1}</span>
                                </label>
                                <span class="jpdb-reader-field-display" data-study-step-label-key="${escapeHtml(NEW_TAB_STUDY_STEP_LABEL_KEYS[step])}">${escapedUiText(language, NEW_TAB_STUDY_STEP_LABEL_KEYS[step])}</span>
                                <div class="jpdb-reader-dictionary-row-help" data-study-step-help-key="${escapeHtml(NEW_TAB_STUDY_STEP_HELP_KEYS[step])}">${escapedUiText(language, NEW_TAB_STUDY_STEP_HELP_KEYS[step])}</div>
                                ${renderRowOrderTools({
      upAction: "dictionary-source-up",
      downAction: "dictionary-source-down",
      labels: { drag: uiText(language, "dragToReorder"), up: uiText(language, "moveUp"), down: uiText(language, "moveDown") },
      leading: `<input name="newTabStudyStepOrder" type="hidden" value="${escapeHtml(step)}">`
    })}
                            </div>
    `;
  }
  function kanjiKeywordSourceOptions(settings, text) {
    const apiLabel = combinedApiCredentialLabel(settings);
    const auto = text ? text("newTabKanjiKeywordAuto").replace("{service}", apiLabel) : `Auto: RTK, then ${apiLabel} kanji facts, then local`;
    const apiFacts = text ? text("newTabKanjiKeywordApiFacts").replace("{service}", apiLabel) : `${apiLabel} kanji facts (Jiten / JPDB)`;
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
    return renderColorSettingsSubsection("wordColors", WORD_COLOR_FIELDS, settings);
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
    "known",
    "due",
    "failed",
    "learning",
    "new"
  ];
  const INTERFACE_LANGUAGE_OPTIONS = [
    ["auto", "automatic"],
    ["en", "english"],
    ["ja", "japanese"]
  ];
  const POPUP_MODE_OPTIONS = [
    ["auto", "auto"],
    ["sheet", "bottomSheet"],
    ["popover", "popover"]
  ];
  const POPOVER_HEIGHT_MODE_OPTIONS = [
    ["available", "popoverHeightAvailable"],
    ["fixed", "popoverHeightFixed"]
  ];
  const PARSER_PROVIDER_OPTIONS = [
    ["local", "parserProviderLocal"],
    ["jiten", "parserProviderJiten"],
    ["jpdb", "parserProviderJpdb"],
    ["auto", "parserProviderAuto"]
  ];
  const NEW_TAB_JPDB_REVIEW_MODE_OPTIONS = [
    ["auto", "newTabJpdbReviewAuto"],
    ["live-review", "newTabLiveReview"],
    ["api-vocabulary", "newTabApiVocabulary"]
  ];
  const TWO_BUTTON_REVIEW_OPTIONS = [
    ["false", "fivePoint"],
    ["true", "twoPoint"]
  ];
  const APPEARANCE_PRESET_OPTIONS = [
    ["", "appearancePresetCustom"],
    ["balanced", "appearancePresetBalanced"],
    ["new-only", "appearancePresetNewOnly"],
    ["underline-new", "appearancePresetUnderlineNew"],
    ["no-colors", "appearancePresetNoColors"]
  ];
  const FURIGANA_MODE_OPTIONS = [
    ["known-status", "furiganaHideKnown"],
    ["difficult-kanji", "furiganaDifficultKanji"],
    ["hover", "furiganaHoverOnly"],
    ["all", "furiganaAllParsed"],
    ["off", "off"]
  ];
  const WORD_COLOR_STATE_OPTIONS = [
    ["all", "wordColorStatesAll"],
    ["new-only", "wordColorStatesNewOnly"]
  ];
  const CLAMPED_ROW_READINGS_OPTIONS = [
    ["show", "clampedRowReadingsShow"],
    ["hover", "clampedRowReadingsHover"]
  ];
  const AUDIO_AUTO_PLAY_MODE_OPTIONS = [
    ["all", "audioAutoPlayAll"],
    ["hover", "audioAutoPlayHover"],
    ["tap", "audioAutoPlayTap"]
  ];
  const AUDIO_SELECTION_MODE_OPTIONS = [
    ["first", "firstAudio"],
    ["random", "randomAudio"]
  ];
  const AUDIO_TTS_MODE_OPTIONS = [
    ["fallback", "audioTtsFallback"],
    ["source-order", "audioTtsSourceOrder"]
  ];
  const IMMERSION_KIT_CATEGORY_OPTIONS = [
    ["all", "allCategories"],
    ["anime", "anime"],
    ["drama", "drama"],
    ["games", "games"]
  ];
  const IMMERSION_KIT_SORT_OPTIONS = [
    ["sentence_length:asc", "shortestFirst"],
    ["sentence_length:desc", "longestFirst"]
  ];
  const SUBTITLE_CONTROLS_MODE_OPTIONS = [
    ["auto", "showWhenNeeded"],
    ["hidden", "hideControls"],
    ["always", "alwaysVisible"]
  ];
  const OCR_PROVIDER_OPTIONS = [
    ["google-lens", "googleLens"],
    ["cloud-vision", "cloudVision"],
    ["local-service", "localOcr"],
    ["off", "off"]
  ];
  const OCR_OVERLAY_THEME_OPTIONS = [
    ["auto", "ocrOverlayThemeAuto"],
    ["light", "ocrOverlayThemeLight"],
    ["dark", "ocrOverlayThemeDark"]
  ];
  const OCR_MAX_IMAGES_PER_PAGE_OPTIONS = [
    ["3", "lightWork"],
    ["8", "normal"],
    ["16", "more"]
  ];
  const OCR_MIN_IMAGE_AREA_OPTIONS = [
    ["80000", "largeOnly"],
    ["45000", "normal"],
    ["15000", "includeSmall"]
  ];
  const OCR_MAX_IMAGE_PIXELS_OPTIONS = [
    ["640000", "faster"],
    ["1200000", "balanced"],
    ["2000000", "sharper"]
  ];
  function renderFuriganaHiddenStateGroupControls(settings) {
    const language = settings.interfaceLanguage;
    const selected = new Set(settings.furiganaHiddenStateGroups);
    const boxes = FURIGANA_HIDE_GROUPS.map((group) => checkbox(`furiganaHide-${group}`, uiText(language, CARD_STATE_LABEL_KEYS[group]), selected.has(group))).join("");
    return `<fieldset class="jpdb-reader-radio-group" data-furigana-hide-groups${effectiveFuriganaMode(settings) === "known-status" ? "" : " hidden"}><legend>${escapedUiText(language, "hideFuriganaFor")}</legend>${boxes}</fieldset>`;
  }
  function renderWordColorHiddenStateGroupControls(settings) {
    const language = settings.interfaceLanguage;
    const selected = new Set(settings.wordColorHiddenStateGroups);
    const boxes = FURIGANA_HIDE_GROUPS.map((group) => checkbox(`colorHide-${group}`, uiText(language, CARD_STATE_LABEL_KEYS[group]), selected.has(group))).join("");
    return `<fieldset class="jpdb-reader-radio-group" data-word-color-hide-groups><legend>${escapedUiText(language, "hideColorFor")}</legend>${boxes}</fieldset>`;
  }
  function renderAppearancePreview(language) {
    return `
                <div class="jpdb-reader-settings-subsection jpdb-reader-settings-preview-section">
                    <div class="jpdb-reader-local-title" data-settings-preview-title>${escapedUiText(language, "preview")}</div>
                    <div class="jpdb-reader-settings-appearance-preview" data-yomu-appearance-preview data-settings-preview-lookup lang="ja" aria-hidden="true">${appearancePreviewContentHtml()}</div>
                </div>`;
  }
  function appearancePreviewContentHtml() {
    return `<span class="jpdb-reader-settings-appearance-preview-line">${appearancePreviewHtml()}</span>`;
  }
  function appearancePreviewHtml() {
    const word = (classes, base, furi, tail = "") => `<span class="jpdb-reader-word jpdb-reader-has-furi ${classes}"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rt class="jpdb-reader-furi">${furi}</rt></ruby>${tail}</span>`;
    return `${word("jpdb-new anki-new jpdb-pitch-heiban", "新", "あたら", "しい")}${word("jpdb-learning anki-learning jpdb-pitch-atamadaka", "言葉", "ことば")}を${word("jpdb-due anki-due jpdb-pitch-nakadaka", "毎日", "まいにち")}${word("jpdb-failed anki-failed jpdb-pitch-odaka", "勉強", "べんきょう")}して、${word("jpdb-known anki-known jpdb-pitch-unknown", "日本語", "にほんご")}が${word("jpdb-never-forget anki-known jpdb-pitch-heiban", "上手", "じょうず")}になる。`;
  }
  function renderPitchColorSettingsSubsection(settings) {
    return renderColorSettingsSubsection("pitchAccentColors", PITCH_COLOR_FIELDS, settings);
  }
  function renderColorChannelSettingsSubsection(settings) {
    const text = settingsText(settings.interfaceLanguage);
    const options = colorSourceSelectOptions(text, combinedApiCredentialLabel(settings));
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapeHtml(text("colorChannels"))}</div>
                    <div class="grid">
                        ${COLOR_CHANNEL_FIELDS.map(([name, key]) => select(name, text(key), settingsColorSourceValue(settings, name), options)).join("")}
                    </div>
                </div>
    `;
  }
  function renderColorSettingsSubsection(titleKey, fields, settings) {
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(settings.interfaceLanguage, titleKey)}</div>
                    <div class="grid jpdb-reader-color-grid">
                        ${renderColorInputs(fields, settings)}
                    </div>
                </div>
    `;
  }
  function renderColorInputs(fields, settings) {
    const text = settingsText(settings.interfaceLanguage);
    return fields.map(([name, key]) => input(name, text(key), settings[name], "color")).join("");
  }
  function renderAudioSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
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
                    ${select("audioSelectionMode", uiText(language, "audioSelectionMode"), settings.audioSelectionMode, localizedOptions(text, AUDIO_SELECTION_MODE_OPTIONS))}
                    ${select("audioTtsMode", uiText(language, "audioTtsMode"), settings.audioTtsMode, localizedOptions(text, AUDIO_TTS_MODE_OPTIONS))}
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
    const options = localizedOptions(settingsText(language), AUDIO_AUTO_PLAY_MODE_OPTIONS);
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
    const text = settingsText(language);
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
                    ${select("immersionKitExampleSource", uiText(language, "immersionKitExampleSource"), settings.immersionKitExampleSource, immersionKitExampleSourceOptions(text))}
                    ${renderNadeshikoApiKeyField(settings)}
                    ${select("immersionKitCategory", uiText(language, "immersionKitCategory"), settings.immersionKitCategory, localizedOptions(text, IMMERSION_KIT_CATEGORY_OPTIONS))}
                    ${select("immersionKitSort", uiText(language, "immersionKitSort"), settings.immersionKitSort, localizedOptions(text, IMMERSION_KIT_SORT_OPTIONS))}
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
  function popupLookupEnabledSetting(settings) {
    return settings.popupActivationMode !== "off" && (settings.lookupOnClick || settings.lookupOnHover || settings.lookupOnMiddleMouse);
  }
  function renderReaderSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pageScanMode = pageScanModeFromSettings$1(settings);
    return `
            <fieldset id="jpdb-reader-settings-panel-reader" role="tabpanel" data-settings-panel="appearance" data-legend-key="reader" aria-describedby="settings-help-reader" hidden>
                <legend>${escapedUiText(language, "reader")}</legend>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-popup-lookup-title>${escapedUiText(language, "popupLookup")}</div>
                    <div class="grid">
                        ${checkbox("popupLookupEnabled", text("popupLookupEnabled"), popupLookupEnabledSetting(settings))}
                    </div>
                    <div class="jpdb-reader-help" data-help-key="popupLookupHelp">${escapedUiText(language, "popupLookupHelp")}</div>
                </div>
                <div class="grid">
                    ${checkbox("lookupOnClick", text("lookupOnClick"), settings.lookupOnClick)}
                    ${checkbox("lookupOnHover", text("lookupOnHover"), settings.lookupOnHover)}
                    ${checkbox("lookupOnMiddleMouse", text("lookupOnMiddleMouse"), settings.lookupOnMiddleMouse)}
                    ${checkbox("showFloatingButton", text("showFloatingButton"), settings.showFloatingButton)}
                    ${radioGroup("pageScanMode", text("pageScanMode"), pageScanMode, [
      ["off", text("pageScanModeOff")],
      ["auto", text("pageScanModeAuto")],
      ["manual", text("pageScanModeManual")]
    ])}
                    <div class="jpdb-reader-shortcut-group" data-page-scan-manual-shortcut ${pageScanMode === "manual" ? "" : "hidden"}>
                        <div data-manual-page-scan-shortcut-label>${shortcutInput("shortcuts.scanPage", text("manualPageScanShortcut"), settings.shortcuts.scanPage)}</div>
                    </div>
                    ${select("appearancePreset", "Quick setup", "", localizedOptions(text, APPEARANCE_PRESET_OPTIONS))}
                    ${select("furiganaMode", text("furiganaMode"), effectiveFuriganaMode(settings), localizedOptions(text, FURIGANA_MODE_OPTIONS))}
                    ${select("clampedRowReadings", text("clampedRowReadings"), settings.clampedRowReadings, localizedOptions(text, CLAMPED_ROW_READINGS_OPTIONS))}
                    ${renderFuriganaHiddenStateGroupControls(settings)}
                    ${select("wordColorStates", text("wordColorStates"), settings.wordColorStates, localizedOptions(text, WORD_COLOR_STATE_OPTIONS))}
                    ${renderWordColorHiddenStateGroupControls(settings)}
                    ${checkbox("showPitchAccent", text("showPitchAccent"), settings.showPitchAccent)}
                    ${checkbox("suppressRedundantWordUi", text("suppressRedundantWordUi"), settings.suppressRedundantWordUi)}
                    ${checkbox("sheetCloseButtonOnLeft", text("sheetCloseButtonOnLeft"), settings.sheetCloseButtonOnLeft)}
                </div>
                ${renderPitchColorSettingsSubsection(settings)}
                ${renderHoverLookupSettingsSubsection(settings)}
                <div id="settings-help-reader" class="jpdb-reader-help" data-help-key="readerHelp">${escapedUiText(language, "readerHelp")}</div>
            </fieldset>
    `;
  }
  function pageScanModeFromSettings$1(settings) {
    if (settings.annotationsPaused) return "off";
    return settings.manualScanEnabled ? "manual" : "auto";
  }
  function renderHoverLookupSettingsSubsection(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-hover-lookup-title>${escapedUiText(language, "hoverLookupSettings")}</div>
                    <div class="grid">
                        ${shortcutInput("shortcuts.hoverLookup", text("holdWhileHovering"), settings.shortcuts.hoverLookup, uiText(language, "blankPlainHover"))}
                        ${input("hoverOpenDelayMs", text("hoverOpenDelayMs"), String(settings.hoverOpenDelayMs), "number")}
                        ${input("hoverCloseDelayMs", text("hoverCloseDelayMs"), String(settings.hoverCloseDelayMs), "number")}
                    </div>
                </div>
    `;
  }
  function renderKanjiSettingsPanel(settings) {
    return `
            <fieldset id="jpdb-reader-settings-panel-kanji" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="kanji" hidden>
                <legend>${escapedUiText(settings.interfaceLanguage, "kanji")}</legend>
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-ocr" role="tabpanel" data-settings-panel="media" data-legend-key="images" aria-describedby="settings-help-ocr" hidden>
                <legend>${escapedUiText(language, "images")}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${radioGroup("ocrInteractionMode", text("ocrInteractionMode"), ocrInteractionModeFromSettings(settings), [
      ["auto", text("ocrInteractionModeAuto")],
      ["manual", text("ocrInteractionModeManual")],
      ["off", text("ocrInteractionModeOff")]
    ])}
                    ${checkbox("ocrShowTextOverlay", text("ocrShowTextOverlay"), settings.ocrShowTextOverlay)}
                    ${checkbox("ocrVideoPauseFrames", text("ocrVideoPauseFrames"), settings.ocrVideoPauseFrames)}
                    ${checkbox("ocrInvertDarkPanels", text("ocrInvertDarkPanels"), settings.ocrInvertDarkPanels)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${select("ocrProvider", text("ocrProvider"), settings.ocrProvider, localizedOptions(text, OCR_PROVIDER_OPTIONS))}
                    ${select("ocrOverlayTheme", text("ocrOverlayTheme"), settings.ocrOverlayTheme, localizedOptions(text, OCR_OVERLAY_THEME_OPTIONS))}
                    ${select("ocrMaxImagesPerPage", text("ocrMaxImagesPerPage"), String(settings.ocrMaxImagesPerPage), localizedOptions(text, OCR_MAX_IMAGES_PER_PAGE_OPTIONS))}
                    ${select("ocrMinImageArea", text("ocrMinImageArea"), String(settings.ocrMinImageArea), localizedOptions(text, OCR_MIN_IMAGE_AREA_OPTIONS))}
                    ${select("ocrMaxImagePixels", text("ocrMaxImagePixels"), String(settings.ocrMaxImagePixels), localizedOptions(text, OCR_MAX_IMAGE_PIXELS_OPTIONS))}
                    ${renderColorInputs(OCR_COLOR_FIELDS, settings)}
                    ${input("ocrBackgroundOpacity", text("ocrBackgroundOpacity"), String(settings.ocrBackgroundOpacity), "number")}
                    ${input("ocrFontScale", text("ocrFontScale"), String(settings.ocrFontScale), "number")}
                    <div class="jpdb-reader-help" data-local-ocr ${localOcrHidden} data-help-key="ocrLocalHelp">${escapedUiText(language, "ocrLocalHelp")}</div>
                    <div data-local-ocr ${localOcrHidden}>${select("ocrEngine", text("ocrEngine"), settings.ocrEngine, ocrEngineOptions(text))}</div>
                    <label data-local-ocr ${localOcrHidden}>${escapedUiText(language, "ocrEndpointUrl")}<input name="ocrEndpointUrl" type="url" value="${escapeHtml(settings.ocrEndpointUrl)}" placeholder="http://127.0.0.1:7331/ocr" autocomplete="off"></label>
                    <div class="jpdb-reader-help" data-cloud-ocr ${cloudOcrHidden} data-help-key="ocrCloudHelp">${escapedUiText(language, "ocrCloudHelp")}</div>
                    <label data-cloud-ocr ${cloudOcrHidden}>${escapedUiText(language, "cloudVisionApiKey")}<input name="ocrCloudVisionApiKey" type="text" class="jpdb-reader-masked-input" value="${escapeHtml(settings.ocrCloudVisionApiKey)}" autocomplete="off"${API_KEY_INPUT_ATTRIBUTE_HTML}></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${settings.ocrPrefetchMargin}">
                    <input type="hidden" name="ocrPrefetchPages" value="${settings.ocrPrefetchPages}">
                    <input type="hidden" name="ocrConcurrency" value="${settings.ocrConcurrency}">
                </div>
                <div id="settings-help-ocr" class="jpdb-reader-help" data-help-key="ocrHelp">${escapedUiText(language, "ocrHelp")}</div>
            </fieldset>
    `;
  }
  function renderVideoSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-video" role="tabpanel" data-settings-panel="media" data-legend-key="video" hidden>
                <legend>${escapedUiText(language, "video")}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("subtitlePlayerEnabled", text("subtitlePlayerEnabled"), settings.subtitlePlayerEnabled)}
                    ${checkbox("subtitleAutoDetect", text("subtitleAutoDetect"), settings.subtitleAutoDetect)}
                    ${checkbox("subtitleOverlayVisible", text("subtitleOverlayVisible"), settings.subtitleOverlayVisible)}
                    ${checkbox("subtitleSecondaryVisible", text("subtitleSecondaryVisible"), settings.subtitleSecondaryVisible)}
                    ${checkbox("subtitleNativeBlurred", text("subtitleNativeBlurred"), settings.subtitleNativeBlurred)}
                    ${checkbox("subtitleKaraokeMode", text("subtitleKaraokeMode"), settings.subtitleKaraokeMode)}
                    ${checkbox("subtitleTranscriptVisible", text("subtitleTranscriptVisible"), settings.subtitleTranscriptVisible)}
                    ${checkbox("subtitlePausePanel", text("subtitlePausePanel"), settings.subtitlePausePanel)}
                    ${checkbox("subtitleShadowAutoPause", text("subtitleShadowAutoPause"), settings.subtitleShadowAutoPause)}
                    ${checkbox("subtitleTranscriptAutoScroll", text("subtitleTranscriptAutoScroll"), settings.subtitleTranscriptAutoScroll)}
                    ${checkbox("subtitleAutoCopyLine", text("subtitleAutoCopyLine"), settings.subtitleAutoCopyLine)}
                    ${checkbox("subtitleCopyIncludeTranslation", text("subtitleCopyIncludeTranslation"), settings.subtitleCopyIncludeTranslation)}
                    ${checkbox("subtitleMiningPause", text("subtitleMiningPause"), settings.subtitleMiningPause)}
                    ${checkbox("subtitleHoverPause", text("subtitleHoverPause"), settings.subtitleHoverPause)}
                </div>
                <div class="grid jpdb-reader-settings-cgrid">
                    ${input("subtitleTranscriptAutoScrollResumeSeconds", text("subtitleTranscriptAutoScrollResumeSeconds"), String(settings.subtitleTranscriptAutoScrollResumeSeconds), "number")}
                    ${select("subtitleControlsMode", text("subtitleControlsMode"), settings.subtitleControlsMode, localizedOptions(text, SUBTITLE_CONTROLS_MODE_OPTIONS))}
                    ${input("subtitleFontSize", text("subtitleFontSize"), String(settings.subtitleFontSize), "number")}
                    ${input("subtitleBottomOffset", text("subtitleBottomOffset"), String(settings.subtitleBottomOffset), "number")}
                    ${renderColorInputs(SUBTITLE_COLOR_FIELDS, settings)}
                    ${input("subtitleBackgroundOpacity", text("subtitleBackgroundOpacity"), String(settings.subtitleBackgroundOpacity), "number")}
                    ${fontFamilyControl("subtitleFontFamily", text("subtitleFontFamily"), settings.subtitleFontFamily, text)}
                    ${input("subtitleFontWeight", text("subtitleFontWeight"), String(settings.subtitleFontWeight), "number")}
                    ${input("subtitleSeekPadding", text("subtitleSeekPadding"), String(settings.subtitleSeekPadding), "number")}
                </div>
                ${renderSubtitlePreview(language)}
            </fieldset>
    `;
  }
  function renderSubtitlePreview(language) {
    return `
                <div class="jpdb-reader-subtitle-preview" data-subtitle-preview>
                    <div class="jpdb-subtitle-primary">
                        <span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-settings-preview-lookup="新しい" data-sentence="新しい言葉を読む" tabindex="-1">新しい</span>
                        <span class="jpdb-reader-word jpdb-learning jpdb-pitch-atamadaka" data-settings-preview-lookup="言葉" data-sentence="新しい言葉を読む" tabindex="-1">言葉</span>
                        <span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka" data-settings-preview-lookup="を" data-sentence="新しい言葉を読む" tabindex="-1">を</span>
                        <span class="jpdb-reader-word jpdb-due jpdb-pitch-odaka" data-settings-preview-lookup="読む" data-sentence="新しい言葉を読む" tabindex="-1">読む</span>
                    </div>
                    <div class="jpdb-subtitle-secondary">${escapedUiText(language, "subtitlePreview")}</div>
                </div>
    `;
  }
  function renderYoutubeSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-youtube" role="tabpanel" data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>${escapedUiText(language, "youTube")}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    ${checkbox("youtubeImmersionEnabled", text("youtubeImmersionEnabled"), settings.youtubeImmersionEnabled)}
                    ${checkbox("preferJapaneseSiteLanguage", text("preferJapaneseSiteLanguage"), settings.preferJapaneseSiteLanguage)}
                    ${checkbox("youtubeShowChannelRecommendations", text("youtubeShowChannelRecommendations"), settings.youtubeShowChannelRecommendations)}
                    ${checkbox("youtubeShowFilterNotice", text("youtubeShowFilterNotice"), settings.youtubeShowFilterNotice)}
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>${escapedUiText(language, "youtubeHelp")}</div>
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
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-dictionaries" role="tabpanel" data-settings-panel="dictionaries" data-legend-key="sources" hidden>
                <legend>${escapedUiText(language, "sources")}</legend>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status role="status" aria-live="polite">${escapedUiText(language, "checkingDictionaries")}</div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-help" data-help-key="parserProviderHelp">${escapedUiText(language, "parserProviderHelp")}</div>
                    ${select("parserProvider", text("parserProvider"), settings.parserProvider, localizedOptions(text, PARSER_PROVIDER_OPTIONS))}
                </div>
                <div class="jpdb-reader-dictionary-priorities" data-source-editor data-definition-source-editor>
                    ${renderDictionarySourceRows(settings)}
                </div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title">${escapedUiText(language, "lookupPills")}</div>
                    <div class="jpdb-reader-help">${escapedUiText(language, "lookupPillsHelp")}</div>
                    ${checkbox("showLookupPillFrequency", text("showLookupPillFrequency"), settings.showLookupPillFrequency)}
                    <div class="jpdb-reader-lookup-links" data-source-editor>
                        ${renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks, installedFrequencyDictionaryPreferences(settings, installedDictionariesFromPreferences(settings.dictionaryPreferences)))}
                    </div>
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries(installedDictionariesFromPreferences(settings.dictionaryPreferences))}
                </div>
                <div class="jpdb-reader-help" data-import-status hidden></div>
                <div class="jpdb-reader-help" data-help-key="backupMovedHelp">${escapedUiText(language, "backupMovedHelp")}</div>
            </fieldset>
    `;
  }
  function renderBackupSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-backup" role="tabpanel" data-settings-panel="backup" data-legend-key="backupSync" hidden>
                <legend>${escapedUiText(language, "backupSync")}</legend>
                <div class="jpdb-reader-help" data-help-key="backupSyncHelp">${escapedUiText(language, "backupSyncHelp")}</div>
                ${CLOUD_SETTINGS_SYNC_ENABLED ? renderCloudSettingsSyncSection(settings) : ""}
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">${escapedUiText(language, "importSettings")}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">${escapedUiText(language, "exportSettings")}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">${escapedUiText(language, "importDictionaries")}</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">${escapedUiText(language, "exportDictionaries")}</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
    `;
  }
  function renderCloudSettingsSyncSection(settings) {
    const language = resolveUiLanguage(settings.interfaceLanguage);
    const uploadLabel = language === "ja" ? "Google Driveに同期" : "Sync to Google Drive";
    const restoreLabel = language === "ja" ? "Google Driveから復元" : "Restore from Google Drive";
    return `
                <div class="jpdb-reader-settings-subsection" data-cloud-settings-sync>
                    <div class="jpdb-reader-local-title" data-cloud-settings-sync-title>Google Drive settings sync</div>
                    <div class="jpdb-reader-help" data-help-key="cloudSettingsSyncHelp">Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.</div>
                    <div class="jpdb-reader-settings-actions jpdb-reader-settings-actions-single">
                        <button class="jpdb-reader-btn" type="button" data-action="sync-cloud-settings">${uploadLabel}</button>
                        <button class="jpdb-reader-btn" type="button" data-action="restore-cloud-settings">${restoreLabel}</button>
                    </div>
                </div>
    `;
  }
  function renderShortcutSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pressKeys = uiText(language, "pressKeys");
    return `
            <fieldset id="jpdb-reader-settings-panel-shortcuts" role="tabpanel" data-settings-panel="shortcuts" data-legend-key="shortcuts" hidden>
                <legend>${escapedUiText(language, "shortcuts")}</legend>
                <div class="grid">
                    ${shortcutInput("shortcuts.scanPage", text("scanPage"), settings.shortcuts.scanPage, pressKeys)}
                    ${shortcutInput("shortcuts.hoverLookup", text("holdWhileHovering"), settings.shortcuts.hoverLookup, uiText(language, "blankPlainHover"))}
                    ${shortcutInput("shortcuts.openSettings", text("openSettings"), settings.shortcuts.openSettings, pressKeys)}
                    ${shortcutInput("shortcuts.playAudio", text("playAudio"), settings.shortcuts.playAudio, pressKeys)}
                    ${shortcutInput("shortcuts.closePopup", text("closePopup"), settings.shortcuts.closePopup, pressKeys)}
                    ${shortcutInput("shortcuts.previousLookupWord", text("previousLookupWord"), settings.shortcuts.previousLookupWord, pressKeys)}
                    ${shortcutInput("shortcuts.nextLookupWord", text("nextLookupWord"), settings.shortcuts.nextLookupWord, pressKeys)}
                    ${shortcutInput("shortcuts.previousSubtitle", text("previousSubtitle"), settings.shortcuts.previousSubtitle, pressKeys)}
                    ${shortcutInput("shortcuts.nextSubtitle", text("nextSubtitle"), settings.shortcuts.nextSubtitle, pressKeys)}
                    ${shortcutInput("shortcuts.copySubtitle", text("copySubtitle"), settings.shortcuts.copySubtitle, pressKeys)}
                    ${shortcutInput("shortcuts.toggleOcr", text("toggleImageReading"), settings.shortcuts.toggleOcr, pressKeys)}
                    ${shortcutInput("shortcuts.toggleSubtitleOverlay", text("toggleSubtitleOverlay"), settings.shortcuts.toggleSubtitleOverlay, pressKeys)}
                    ${shortcutInput("shortcuts.toggleYoutubeImmersion", text("toggleYoutubeImmersion"), settings.shortcuts.toggleYoutubeImmersion, pressKeys)}
                    ${shortcutInput("shortcuts.scanImages", text("readImagesNow"), settings.shortcuts.scanImages, pressKeys)}
                    ${shortcutInput("shortcuts.massReviewVisible", text("massReviewVisible"), settings.shortcuts.massReviewVisible, pressKeys)}
                    ${shortcutInput("shortcuts.studyReveal", text("studyReveal"), settings.shortcuts.studyReveal, pressKeys)}
                    ${shortcutInput("shortcuts.studyRevealAlternate", text("studyRevealAlternate"), settings.shortcuts.studyRevealAlternate, pressKeys)}
                    ${shortcutInput("shortcuts.studyUndo", text("studyUndo"), settings.shortcuts.studyUndo, pressKeys)}
                    ${shortcutInput("shortcuts.studyPrevious", text("studyPrevious"), settings.shortcuts.studyPrevious, pressKeys)}
                    ${shortcutInput("shortcuts.studyPreviousAlternate", text("studyPreviousAlternate"), settings.shortcuts.studyPreviousAlternate, pressKeys)}
                    ${shortcutInput("shortcuts.studyNext", text("studyNext"), settings.shortcuts.studyNext, pressKeys)}
                    ${shortcutInput("shortcuts.studyNextAlternate", text("studyNextAlternate"), settings.shortcuts.studyNextAlternate, pressKeys)}
                    ${renderReviewShortcutInputs(settings)}
                </div>
            </fieldset>
    `;
  }
  function renderHelpSettingsPanel(settings) {
    const language = settings.interfaceLanguage;
    return `
            <fieldset id="jpdb-reader-settings-panel-help" role="tabpanel" data-settings-panel="help" data-legend-key="help" hidden>
                <legend>${escapedUiText(language, "help")}</legend>
                ${renderHelpLinksPanel(settings.interfaceLanguage)}
                <div class="jpdb-reader-settings-subsection">
                    <div class="jpdb-reader-local-title" data-diagnostics-title>${escapedUiText(language, "diagnostics")}</div>
                    <div class="grid">
                        ${checkbox("enableLogging", uiText(language, "enableLogging"), settings.enableLogging)}
                    </div>
                    <div class="jpdb-reader-help" data-diagnostics-help>${escapedUiText(language, "diagnosticsHelp")}</div>
                </div>
            </fieldset>
    `;
  }
  function renderSettingsFooter(language) {
    return `
            <div class="footer">
                <div class="jpdb-reader-settings-save-status" data-settings-save-status role="status" aria-live="polite" hidden></div>
                <div class="jpdb-reader-settings-footer-version" data-yomu-settings-version>Yomu ${escapeHtml(CURRENT_YOMU_VERSION)}</div>
                <button class="jpdb-reader-btn" type="button" data-action="cancel">${escapedUiText(language, "cancel")}</button>
                <button class="jpdb-reader-btn add" type="submit">${escapedUiText(language, "save")}</button>
            </div>
    `;
  }
  function fontFamilyControl(name, label, value, text) {
    const selectedValue = fontFamilyPresetValue(value);
    return `
        <div class="jpdb-reader-font-family-control" data-font-family-control="${name}">
            ${select(name, label, selectedValue, fontFamilyOptions(text))}
            <label class="jpdb-reader-font-family-custom" data-font-family-custom ${selectedValue === CUSTOM_FONT_FAMILY_VALUE ? "" : "hidden"}>
                ${escapeHtml(text ? text("customFontFamily") : "Custom font stack")}
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
  function themeSegmentedControl(value, text) {
    const isDark = value === "dark";
    const switchLabel = escapeHtml(isDark ? text("switchToLightTheme") : text("switchToDarkTheme"));
    return `
        <div class="jpdb-reader-theme-field" data-theme-field>
            <span class="jpdb-reader-theme-title" id="jpdb-reader-theme-label" data-theme-title>${escapeHtml(text("theme"))}</span>
            <input type="hidden" name="theme" value="${escapeHtml(value)}" data-theme-value>
            <div class="VPNavBarAppearance appearance jpdb-reader-theme-appearance">
                <button class="VPSwitch VPSwitchAppearance jpdb-reader-theme-switch" type="button" role="switch" data-theme-switch data-newtab-action="theme" aria-label="${switchLabel}" aria-labelledby="jpdb-reader-theme-label" aria-describedby="jpdb-reader-theme-label" aria-checked="${isDark}" title="${switchLabel}">
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
    withNamedControlIndex(form, () => {
      localizeSettingsShell(form, language, text);
      localizeSettingsLabels(form, text);
      localizeSettingsSectionTitles(form, text);
      localizeSettingsSelects(form, text);
      localizeSettingsShortcuts(form, text);
      localizeSettingsHelpText(form, text);
      localizeSettingsActions(form, text);
      localizeSettingsEditorChrome(form, text);
      localizeHelpLinksPanel(form, language);
      removeSettingsSelectOptionMeta(form);
      normalizeSettingsLabelTextContainers(form);
      syncDisabledSettingsControlDescriptions(form, language);
    });
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
    [/Version and updates|Version|バージョンと更新|バージョン/, "versionAndUpdates"],
    [/Word colors|単語の色/, "wordColors"],
    [/Pitch accent colors|ピッチアクセント/, "pitchAccentColors"],
    [/Color channels|色チャンネル/, "colorChannels"],
    [/Study|学習|New tab|新規タブ/, "newTab"],
    [/Dictionary site enhancements|辞書サイト拡張|JPDB page enhancements|JPDBページ拡張/, "jpdbPageEnhancements"],
    [/Lookup pills|検索ピル/, "lookupPills"]
  ];
  const SELECTOR_TEXT_KEYS = [
    ["[data-popup-lookup-title]", "popupLookup"],
    ["[data-hover-lookup-title]", "hoverLookupSettings"],
    ["[data-diagnostics-title]", "diagnostics"],
    ["[data-anki-library-adapter-title]", "ankiLibraryAdapter"],
    ["[data-jpdb-api-key-help]", "apiAccessHelp"],
    ["[data-grading-provider-help]", "apiGradingProviderHelp"],
    ["[data-subtitle-preview] .jpdb-subtitle-secondary", "subtitlePreview"],
    ["[data-settings-preview-title]", "preview"],
    ["[data-proxy-guide-summary]", "audioProxyGuideSummary"],
    ["[data-proxy-guide-show]", "show"],
    ["[data-proxy-guide-hide]", "hide"],
    ["[data-cloud-settings-sync-title]", "cloudSettingsSync"]
  ];
  const HIDE_GROUP_LEGEND_TEXT_KEYS = [
    ["[data-furigana-hide-groups]", "hideFuriganaFor"],
    ["[data-word-color-hide-groups]", "hideColorFor"]
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
    ["[data-help-update-title]", "versionAndUpdates"],
    ["[data-help-update-current]", "currentYomuVersion"],
    ["[data-help-anki-title]", "ankiConnectSetupTitle"],
    ["[data-help-anki-copy]", "ankiConnectSetupCopy"],
    ["[data-help-anki-config-copy]", "ankiConnectSetupConfig"],
    ["[data-help-anki-mobile]", "ankiConnectSetupMobile"],
    ["[data-help-anki-brave]", "ankiConnectSetupBrave"],
    ["[data-help-links-title]", "helpLinksTitle"],
    ["[data-help-links-copy]", "helpLinksCopy"],
    ["[data-help-support-title]", "helpSupportTitle"],
    ["[data-help-support-copy]", "helpSupportCopy"],
    ["[data-help-support-copy-extra]", "helpSupportCopyExtra"],
    ['[data-help-link="factory-reset"]', "factoryReset"]
  ];
  const HELP_LINK_BUTTON_TEXT_KEYS = [
    ["update-userscript", "updateUserscript"],
    ["anki-connect-addon", "ankiStatusInstallAddon"],
    ["anki-mobile-docs", "ankiStatusMobileDocs"],
    ["video-player", "videoPlayer"],
    ["pdf-reader", "pdfReader"],
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
    const bunproSettings = form.querySelector('label a[href*="bunpro.jp/settings"]');
    if (bunproSettings) bunproSettings.textContent = text("bunproSettings");
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
    HIDE_GROUP_LEGEND_TEXT_KEYS.forEach(([selector, key]) => {
      form.querySelector(`${selector} > legend`)?.replaceChildren(text(key));
    });
  }
  function replaceLocalTitle(form, pattern, value) {
    const title = Array.from(form.querySelectorAll(".jpdb-reader-local-title")).find((element2) => pattern.test(element2.textContent ?? ""));
    title?.replaceChildren(value);
  }
  function localizeSettingsSelects(form, text) {
    localizeBasicSettingsSelects(form, text);
    localizeColorAndReaderSelects(form, text);
    localizeMediaSettingsSelects(form, text);
    localizeMiningSettingsSelects(form, text);
  }
  function localizeBasicSettingsSelects(form, text) {
    setSelectOptionLabels(form, "interfaceLanguage", localizedOptions(text, INTERFACE_LANGUAGE_OPTIONS));
    form.querySelector("[data-theme-title]")?.replaceChildren(text("theme"));
    setSelectOptionLabels(form, "popupMode", localizedOptions(text, POPUP_MODE_OPTIONS));
    setSelectOptionLabels(form, "hoverPopupMode", localizedOptions(text, POPUP_MODE_OPTIONS));
    setSelectOptionLabels(form, "popoverHeightMode", localizedOptions(text, POPOVER_HEIGHT_MODE_OPTIONS));
    setSelectOptionLabels(form, "readerFontFamily", fontFamilyOptions(text));
    setSelectOptionLabels(form, "popupFontFamily", fontFamilyOptions(text));
    setSelectOptionLabels(form, "parserProvider", localizedOptions(text, PARSER_PROVIDER_OPTIONS));
    setSelectOptionLabels(form, "newTabSource", newTabSourceOptions(text));
    setSelectOptionLabels(form, "newTabJpdbReviewMode", localizedOptions(text, NEW_TAB_JPDB_REVIEW_MODE_OPTIONS));
    setSelectOptionLabels(form, "newTabKanjiKeywordSource", kanjiKeywordSourceOptions(apiCredentialSettingsFromForm(form), text));
    setSelectOptionLabels(form, "twoButtonReviews", localizedOptions(text, TWO_BUTTON_REVIEW_OPTIONS));
  }
  function localizeColorAndReaderSelects(form, text) {
    localizeColorSourceSelects(form, text);
    setSelectOptionLabels(form, "appearancePreset", localizedOptions(text, APPEARANCE_PRESET_OPTIONS));
    setSelectOptionLabels(form, "wordColorStates", localizedOptions(text, WORD_COLOR_STATE_OPTIONS));
    setSelectOptionLabels(form, "clampedRowReadings", localizedOptions(text, CLAMPED_ROW_READINGS_OPTIONS));
    setSelectOptionLabels(form, "furiganaMode", localizedOptions(text, FURIGANA_MODE_OPTIONS));
  }
  function localizeColorSourceSelects(form, text) {
    const options = colorSourceSelectOptions(text, apiCredentialLabelFromForm(form));
    COLOR_CHANNEL_FIELDS.forEach(([name]) => setSelectOptionLabels(form, name, options));
  }
  function localizeMediaSettingsSelects(form, text) {
    setSelectOptionLabels(form, "audioAutoPlayMode", localizedOptions(text, AUDIO_AUTO_PLAY_MODE_OPTIONS));
    setSelectOptionLabels(form, "audioSelectionMode", localizedOptions(text, AUDIO_SELECTION_MODE_OPTIONS));
    setSelectOptionLabels(form, "audioTtsMode", localizedOptions(text, AUDIO_TTS_MODE_OPTIONS));
    setSelectOptionLabels(form, "immersionKitCategory", localizedOptions(text, IMMERSION_KIT_CATEGORY_OPTIONS));
    setSelectOptionLabels(form, "immersionKitExampleSource", immersionKitExampleSourceOptions(text));
    setSelectOptionLabels(form, "immersionKitSort", localizedOptions(text, IMMERSION_KIT_SORT_OPTIONS));
    localizeOcrSettingsSelects(form, text);
    setSelectOptionLabels(form, "subtitleControlsMode", localizedOptions(text, SUBTITLE_CONTROLS_MODE_OPTIONS));
    setSelectOptionLabels(form, "subtitleTranscriptPlacement", [
      ["right", text("right")],
      ["left", text("left")],
      ["bottom", text("bottom")]
    ]);
    setSelectOptionLabels(form, "subtitleFontFamily", fontFamilyOptions(text));
  }
  function localizeOcrSettingsSelects(form, text) {
    setSelectOptionLabels(form, "ocrProvider", localizedOptions(text, OCR_PROVIDER_OPTIONS));
    setSelectOptionLabels(form, "ocrOverlayTheme", localizedOptions(text, OCR_OVERLAY_THEME_OPTIONS));
    setSelectOptionLabels(form, "ocrMaxImagesPerPage", localizedOptions(text, OCR_MAX_IMAGES_PER_PAGE_OPTIONS));
    setSelectOptionLabels(form, "ocrMinImageArea", localizedOptions(text, OCR_MIN_IMAGE_AREA_OPTIONS));
    setSelectOptionLabels(form, "ocrMaxImagePixels", localizedOptions(text, OCR_MAX_IMAGE_PIXELS_OPTIONS));
    setSelectOptionLabels(form, "ocrEngine", ocrEngineOptions(text));
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
    const pageScanLegend = getNamedControl(form, "pageScanMode")?.closest(".jpdb-reader-radio-group")?.querySelector("legend");
    pageScanLegend?.replaceChildren(text("pageScanMode"));
    setRadioLabel(form, "pageScanMode", "off", text("pageScanModeOff"));
    setRadioLabel(form, "pageScanMode", "auto", text("pageScanModeAuto"));
    setRadioLabel(form, "pageScanMode", "manual", text("pageScanModeManual"));
    const manualPageScanShortcutLabel = form.querySelector("[data-manual-page-scan-shortcut-label] label");
    if (manualPageScanShortcutLabel) setBlockLabelText(manualPageScanShortcutLabel, text("manualPageScanShortcut"));
    const ocrModeLegend = getNamedControl(form, "ocrInteractionMode")?.closest(".jpdb-reader-radio-group")?.querySelector("legend");
    ocrModeLegend?.replaceChildren(text("ocrInteractionMode"));
    setRadioLabel(form, "ocrInteractionMode", "auto", text("ocrInteractionModeAuto"));
    setRadioLabel(form, "ocrInteractionMode", "manual", text("ocrInteractionModeManual"));
    setRadioLabel(form, "ocrInteractionMode", "off", text("ocrInteractionModeOff"));
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
    form.querySelectorAll("[data-import-status]").forEach((importStatus) => {
      if (/Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? "")) importStatus.textContent = text("dictionaryImportHelp");
    });
  }
  function localizeSettingsActions(form, text) {
    SETTINGS_ACTION_TEXT_KEYS.forEach(([selector, key]) => {
      form.querySelectorAll(selector).forEach((button2) => button2.replaceChildren(text(key)));
    });
    form.querySelector('button[type="submit"]')?.replaceChildren(text("save"));
    localizePreviewAudioButtons(form, text);
  }
  function localizePreviewAudioButtons(form, text) {
    form.querySelectorAll('[data-action="preview-audio"]').forEach((button2) => {
      button2.title = text("previewAudio");
      button2.setAttribute("aria-label", text("previewAudio"));
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
    localizeOrderButtons(form, text);
    localizeLookupLinkEditor(form, text);
    localizeDeckControls(form, text);
    const statusLanguage2 = resolveUiLanguageFromText(text);
    localizeJpdbStatus(form, statusLanguage2);
    localizeBunproStatus(form, statusLanguage2);
    localizeInitialAnkiStatus(form, statusLanguage2);
    localizeSourceRows(form, text);
    localizeStudyStepEditor(form, text);
    localizeRecommendedDictionaryGroups(form, text);
    localizeRecommendedDictionaryDescriptions(form, text);
    localizeAnkiTemplatePreview(form, text);
    localizeAudioSourceFields(form, text);
    localizeRecommendedDictionaryButtons(form, text);
    localizeDictionaryStatus(form, text);
  }
  function localizeOrderButtons(form, text) {
    form.querySelectorAll("[data-source-drag-handle]").forEach((button2) => setButtonTitle(button2, text("dragToReorder")));
    form.querySelectorAll('[data-action$="-up"]').forEach((button2) => setButtonTitle(button2, text("moveUp")));
    form.querySelectorAll('[data-action$="-down"]').forEach((button2) => setButtonTitle(button2, text("moveDown")));
    form.querySelectorAll('[data-action$="-remove"]').forEach((button2) => setButtonTitle(button2, text("remove")));
    form.querySelectorAll('[data-action="delete-yomitan-dictionary"]').forEach((button2) => setButtonTitle(button2, text("removeImportedDictionary")));
  }
  function setButtonTitle(button2, label) {
    button2.title = label;
    button2.setAttribute("aria-label", label);
  }
  function localizeLookupLinkEditor(form, text) {
    const lookupHead = form.querySelectorAll(".jpdb-reader-lookup-link-head span");
    lookupHead[0]?.replaceChildren(text("enabledHeader"));
    lookupHead[1]?.replaceChildren(text("labelHeader"));
    lookupHead[2]?.replaceChildren(text("lookupUrlTemplate"));
    lookupHead[3]?.replaceChildren(text("orderHeader"));
    lookupHead[4]?.replaceChildren(text("removeHeader"));
    form.querySelectorAll('.jpdb-reader-lookup-link-note[data-lookup-link-note="copy"]').forEach((note) => note.replaceChildren(text("copiesCurrentWord")));
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
    form.querySelectorAll("[data-source-name-key]").forEach((element2) => {
      const key = element2.dataset.sourceNameKey;
      if (isSettingsTextKey(key)) element2.replaceChildren(text(key));
    });
    form.querySelectorAll("[data-source-placeholder-key]").forEach((input2) => {
      const key = input2.dataset.sourcePlaceholderKey;
      if (isSettingsTextKey(key)) input2.placeholder = text(key);
    });
    form.querySelectorAll("[data-source-help-key]").forEach((element2) => {
      const key = element2.dataset.sourceHelpKey;
      if (isSettingsTextKey(key)) element2.replaceChildren(text(key));
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
      const name = row?.querySelector('input[name$=".alias"]')?.value.trim() || row?.querySelector(".jpdb-reader-field-display")?.textContent?.trim() || input2.closest("label")?.textContent?.trim() || "";
      input2.setAttribute("aria-label", text("enableSourceName").replace("{name}", name));
    });
  }
  function localizeStudyStepEditor(form, text) {
    form.querySelector("[data-study-step-editor-title]")?.replaceChildren(text("newTabStudySteps"));
    form.querySelector("[data-study-step-editor-help]")?.replaceChildren(text("newTabStudyStepsHelp"));
    form.querySelector('[data-study-step-head="enabled"]')?.replaceChildren(text("enabledHeader"));
    form.querySelector('[data-study-step-head="step"]')?.replaceChildren(text("newTabStudyStepHeader"));
    form.querySelector('[data-study-step-head="details"]')?.replaceChildren(text("detailsHeader"));
    form.querySelector('[data-study-step-head="order"]')?.replaceChildren(text("orderHeader"));
    form.querySelectorAll("[data-study-step-label-key]").forEach((element2) => {
      const key = element2.dataset.studyStepLabelKey;
      if (isSettingsTextKey(key)) element2.replaceChildren(text(key));
    });
    form.querySelectorAll("[data-study-step-help-key]").forEach((element2) => {
      const key = element2.dataset.studyStepHelpKey;
      if (isSettingsTextKey(key)) element2.replaceChildren(text(key));
    });
  }
  function localizeSourceHead(head, text) {
    const spans = head.querySelectorAll("span");
    const hasDisplayName = !head.classList.contains("compact");
    spans[0]?.replaceChildren(text("enabledHeader"));
    const sourceLabel = sourceHeadLabel(spans[1]?.textContent ?? "", text);
    spans[1]?.replaceChildren(sourceLabel);
    if (hasDisplayName) {
      spans[2]?.replaceChildren(text("displayName"));
      spans[3]?.replaceChildren(text("orderHeader"));
      spans[4]?.replaceChildren(text("removeHeader"));
    } else {
      spans[2]?.replaceChildren(text("orderHeader"));
      spans[3]?.replaceChildren(text("removeHeader"));
    }
  }
  function sourceHeadLabel(value, text) {
    if (value === "Kanji section") return text("kanjiSection");
    return text("definitionSource");
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
    const labels = [text("termDictionaries"), text("kanjiDictionaries"), text("pitchDictionaries"), text("frequencyDictionaries")];
    form.querySelectorAll(".jpdb-reader-recommended-group-title").forEach((title, index) => {
      if (labels[index]) title.replaceChildren(labels[index]);
    });
  }
  function localizeRecommendedDictionaryDescriptions(form, text) {
    RECOMMENDED_JAPANESE_DICTIONARIES.forEach((dictionary) => {
      const control = form.querySelector(`[data-dictionary-id="${dictionary.id}"]`);
      control?.closest(".jpdb-reader-recommended-item")?.querySelector(".jpdb-reader-help")?.replaceChildren(text(dictionary.descriptionKey));
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
    form.querySelectorAll('[data-action="download-recommended-dictionary"]').forEach((button2) => {
      const installed = button2.dataset.installed === "true";
      const state = button2.dataset.importState;
      const label = state === "installing" ? text("installing") : state === "queued" ? text("queued") : installed ? text("update") : text("install");
      button2.textContent = label;
      button2.title = button2.dataset.importMessage || label;
      button2.setAttribute("aria-label", button2.title);
    });
    form.querySelectorAll("[data-recommended-dictionary-guide]").forEach((link) => {
      setExternalButtonLabel(link, text("dictionaryGuide"));
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
    "apiCredentialBunproLegacy",
    "apiCredentialBunpro",
    "miningDeck",
    "newTabJpdbDeck",
    "neverForgetDeck",
    "blacklistDeck",
    "jpdbMiningEnabled",
    "bunproMiningEnabled",
    "yomuLocalSrsEnabled",
    "addToForq",
    "enableReviews",
    "apiGradingProvider",
    "jpdbPageEnhancementsEnabled",
    "jpdbPageWordEnhancementsEnabled",
    "jpdbPageKanjiEnhancementsEnabled",
    "popupMode",
    "hoverPopupMode",
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
    "newTabShortcutHintsEnabled",
    "newTabUrl",
    "wordColorNew",
    "wordColorLearning",
    "wordColorKnown",
    "wordColorDue",
    "wordColorFailed",
    "wordColorIgnored",
    "parserProvider",
    "pitchColorHeiban",
    "pitchColorAtamadaka",
    "pitchColorNakadaka",
    "pitchColorOdaka",
    "pitchColorUnknown",
    "wordHighlightColorSource",
    "wordUnderlineColorSource",
    "wordTextColorSource",
    "subtitleHighlightColorSource",
    "subtitleUnderlineColorSource",
    "subtitleTextColorSource",
    "lookupOnClick",
    "popupLookupEnabled",
    "lookupOnHover",
    "lookupOnMiddleMouse",
    "showFloatingButton",
    "pageScanMode",
    "furiganaMode",
    "clampedRowReadings",
    "wordColorStates",
    "showPitchAccent",
    "showLookupPillFrequency",
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
    "ocrInteractionMode",
    "ocrShowTextOverlay",
    "ocrVideoPauseFrames",
    "ocrInvertDarkPanels",
    "ocrProvider",
    "ocrOverlayTheme",
    "ocrMaxImagesPerPage",
    "ocrMinImageArea",
    "ocrMaxImagePixels",
    "ocrTextColor",
    "ocrOutlineColor",
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
    "subtitleShadowAutoPause",
    "subtitleTranscriptPlacement",
    "subtitleTranscriptAutoScroll",
    "subtitleTranscriptAutoScrollResumeSeconds",
    "subtitleAutoCopyLine",
    "subtitleCopyIncludeTranslation",
    "subtitleMiningPause",
    "subtitleHoverPause",
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
  const HIDE_STATE_GROUP_CONTROL_LABELS = FURIGANA_HIDE_GROUPS.flatMap((group) => {
    const key = CARD_STATE_LABEL_KEYS[group];
    return [
      [`furiganaHide-${group}`, key],
      [`colorHide-${group}`, key]
    ];
  });
  const SETTINGS_CONTROL_LABELS = [
    ...DIRECT_SETTINGS_CONTROL_LABEL_KEYS.map((key) => [key, key]),
    ...SETTINGS_CONTROL_LABEL_ALIASES,
    ...HIDE_STATE_GROUP_CONTROL_LABELS
  ];
  let activeNamedControls = null;
  function withNamedControlIndex(form, run) {
    const previous = activeNamedControls;
    activeNamedControls = { form, byName: indexNamedControls(form) };
    try {
      return run();
    } finally {
      activeNamedControls = previous;
    }
  }
  function indexNamedControls(form) {
    const byName = /* @__PURE__ */ new Map();
    form.querySelectorAll("input, select, textarea").forEach((control) => {
      const existing = byName.get(control.name);
      if (existing) existing.push(control);
      else byName.set(control.name, [control]);
    });
    return byName;
  }
  function namedFormControls(form, name) {
    if (activeNamedControls?.form === form) return activeNamedControls.byName.get(name) ?? [];
    return Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => control.name === name);
  }
  function getNamedControl(form, name) {
    const item = form.elements.namedItem(name);
    if (item instanceof HTMLInputElement || item instanceof HTMLSelectElement || item instanceof HTMLTextAreaElement) {
      return item;
    }
    if (item instanceof RadioNodeList) {
      return namedFormControls(form, name).find((element2) => element2 instanceof HTMLInputElement) ?? null;
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
  function setBlockLabelText(label, text) {
    resetAnnotatedLabelText(label);
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
    resetAnnotatedLabelText(label);
    const container = directSettingsLabelTextContainer(label);
    if (container) {
      container.replaceChildren(text);
      return;
    }
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim());
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
  }
  function resetAnnotatedLabelText(label) {
    if (!(label instanceof HTMLElement) || !label.querySelector(".jpdb-reader-word")) return;
    unwrapReaderWords(label, {
      includeReaderRoot: true,
      excludeSelector: ".jpdb-reader-control-text-mirror .jpdb-reader-word, [data-settings-preview-lookup] .jpdb-reader-word"
    });
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
    const radio = namedFormControls(form, name).find(
      (element2) => element2 instanceof HTMLInputElement && element2.type === "radio" && element2.value === value
    );
    const labelElement = radio?.closest("label");
    if (labelElement) setInlineLabelText(labelElement, label);
  }
  function setSelectOptionLabels(form, name, options) {
    const selectElement = namedFormControls(form, name).find(
      (element2) => element2 instanceof HTMLSelectElement
    ) ?? null;
    if (!selectElement) return;
    options.forEach(([value, label]) => {
      const option = Array.from(selectElement.options).find((item) => item.value === value);
      if (option) option.textContent = label;
    });
  }
  function removeSettingsSelectOptionMeta(form) {
    form.querySelectorAll("[data-settings-select-options-meta]").forEach((meta) => meta.remove());
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
      const element2 = panel.querySelector(selector);
      if (!element2) return;
      if (key === "currentYomuVersion") {
        element2.replaceChildren(text(key), " ", renderCurrentVersionElement());
        return;
      }
      element2.replaceChildren(text(key));
    });
    HELP_LINK_BUTTON_TEXT_KEYS.forEach(([link, key]) => {
      setExternalButtonLabel(panel.querySelector(`[data-help-link="${link}"]`), text(key));
    });
    const status = panel.querySelector("[data-yomu-update-status]");
    if (status && !status.dataset.updateChecked) {
      status.textContent = formatUiText(language, "updateStatusIdle", { current: CURRENT_YOMU_VERSION });
    }
    const duplicateStatus = panel.querySelector("[data-yomu-duplicate-status]");
    if (duplicateStatus) duplicateStatus.textContent = duplicateRuntimeStatusText(language);
    const updateFlow = detectYomuUpdateFlow();
    const updateNotes = panel.querySelector("[data-help-update-notes]");
    if (updateNotes) updateNotes.textContent = uiText(language, updateFlowNoteKey(updateFlow.kind));
    const updateLink = panel.querySelector('[data-help-link="update-userscript"]');
    if (updateLink) updateLink.href = updateFlow.url;
  }
  function renderCurrentVersionElement() {
    const element2 = document.createElement("span");
    element2.dataset.yomuCurrentVersion = "";
    element2.textContent = CURRENT_YOMU_VERSION;
    return element2;
  }
  function duplicateRuntimeStatusText(language) {
    const kind = currentYomuRuntimeKind();
    return kind ? formatUiText(language, "duplicateStatusSingle", { kind }) : uiText(language, "duplicateStatusUnknown");
  }
  function currentYomuRuntimeKind() {
    if (typeof document === "undefined") return "";
    const marker = document.getElementById("jpdb-reader-runtime-owner");
    return marker?.dataset.yomuRuntimeKind || "";
  }
  function externalButtonLabel(label) {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
  }
  function setExternalButtonLabel(element2, label) {
    if (!element2) return;
    setInnerHtml(element2, externalButtonLabel(label));
  }
  function renderReviewShortcutInputs(settings) {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const pressKeys = uiText(language, "pressKeys");
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeNothing", text("gradeNothing"), settings.shortcuts.gradeNothing, pressKeys)}
            ${shortcutInput("shortcuts.gradeSomething", text("gradeSomething"), settings.shortcuts.gradeSomething, pressKeys)}
            ${shortcutInput("shortcuts.gradeHard", text("gradeHard"), settings.shortcuts.gradeHard, pressKeys)}
            ${shortcutInput("shortcuts.gradeOkay", text("gradeOkay"), settings.shortcuts.gradeOkay, pressKeys)}
            ${shortcutInput("shortcuts.gradeEasy", text("gradeEasy"), settings.shortcuts.gradeEasy, pressKeys)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeFail", text("gradeFail"), settings.shortcuts.gradeFail, pressKeys)}
            ${shortcutInput("shortcuts.gradePass", text("gradePass"), settings.shortcuts.gradePass, pressKeys)}
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
    form.querySelectorAll('[data-action="settings-panel"]').forEach((button2) => {
      const active = button2.dataset.panel === normalizedPanel;
      button2.setAttribute("aria-selected", String(active));
      button2.tabIndex = active ? 0 : -1;
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
  function syncPageScanModeControls(form) {
    const mode = form.querySelector('input[name="pageScanMode"]:checked')?.value ?? "auto";
    form.querySelectorAll("[data-page-scan-manual-shortcut]").forEach((node) => {
      node.hidden = mode !== "manual";
    });
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
    const showAlias = true;
    const visibleNames = /* @__PURE__ */ new Set([
      ...rows.filter((row) => row.removable).map((row) => row.name)
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
    return renderSourceRowsList(kanjiSourceRows(settings), { sourceLabel: "Kanji section", showAlias: true });
  }
  function renderLookupPillsEditor(settings, installed = installedDictionariesFromPreferences(settings.dictionaryPreferences)) {
    return renderDictionaryLookupLinkEditor(settings.dictionaryLookupLinks, installedFrequencyDictionaryPreferences(settings, installed));
  }
  function installedFrequencyDictionaryPreferences(settings, installed) {
    const installedFrequencyNames = new Set(installed.filter((dictionary) => dictionary.type === "frequency").map((dictionary) => dictionary.title));
    return settings.dictionaryPreferences.filter((preference) => preference.type === "frequency" && installedFrequencyNames.has(preference.name));
  }
  function renderRecommendedDictionaries(installed) {
    const groups = [
      ["terms", "Term dictionaries"],
      ["kanji", "Kanji dictionaries"],
      ["pitch", "Pitch dictionaries"],
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
            </button>` : dictionary.helpUrl ? `<a class="jpdb-reader-btn" href="${escapeHtml(dictionary.helpUrl)}" target="_blank" rel="noopener" data-dictionary-id="${escapeHtml(dictionary.id)}" data-recommended-dictionary-guide>${externalButtonLabel("Guide")}</a>` : "";
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                </div>
                <div class="jpdb-reader-help">${escapedUiText("en", dictionary.descriptionKey)}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            ${action}
        </div>
    `;
  }
  function installedDictionariesFromPreferences(preferences) {
    return preferences.map((preference) => ({
      title: preference.name,
      alias: preference.alias,
      enabled: preference.enabled,
      priority: preference.priority,
      type: preference.type
    }));
  }
  function isRecommendedDictionaryInstalled(dictionary, installed) {
    return installed.some((item) => recommendedDictionaryMatchesInstalled(dictionary, item));
  }
  function recommendedDictionaryMatchesInstalled(dictionary, installed) {
    if (dictionary.downloadUrl && installed.downloadUrl === dictionary.downloadUrl) return true;
    const tokenSets = recommendedDictionaryMatchTokenSets(dictionary);
    return [installed.title, installed.alias].map(dictionaryTitleTokens).some((tokens) => tokenSets.some((required) => required.every((token) => tokens.has(token))));
  }
  const RECOMMENDED_DICTIONARY_MATCH_TOKENS = {
    jitendex: [["jitendex"]],
    jmdict: [["jmdict"]],
    jmnedict: [["jmnedict"]],
    "wty-ja-ja": [["wty", "ja"]],
    "pixiv-light": [["pixiv", "light"]],
    kanjidic: [["kanjidic"]],
    "jpdb-kanji": [["jpdb", "kanji"]],
    "kanjium-pitch": [["kanjium", "pitch"], ["kanjium"], ["pitch", "accents"]],
    jiten: [["jiten"]],
    "jpdbv2-kana": [["jpdb", "v2"], ["jpdbv2"]],
    bccwj: [["bccwj"]]
  };
  function recommendedDictionaryMatchTokenSets(dictionary) {
    return RECOMMENDED_DICTIONARY_MATCH_TOKENS[dictionary.id] ?? [Array.from(dictionaryTitleTokens(dictionary.name))];
  }
  function dictionaryTitleTokens(value) {
    return new Set(value.toLowerCase().match(/[a-z0-9]+|[ぁ-んァ-ン一-龯]+/g) ?? []);
  }
  const log$5 = Logger.scope("SettingsFileIO");
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
    return isReaderDictionaryExport$1(record.dictionaries) ? record.dictionaries : record.dictionaryData;
  }
  function readerDictionaryExportHasData(value) {
    if (!isReaderDictionaryExport$1(value)) return false;
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
  function isReaderDictionaryExport$1(value) {
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
      log$5.warn("File picker input missing", { type });
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      inputEl.onchange = () => {
        const file = inputEl.files?.[0] ?? null;
        inputEl.value = "";
        log$5.info("File picker completed", { type, name: file?.name ?? "", size: file?.size ?? 0 });
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
    log$5.info("Downloaded blob", { filename, size: blob.size, type: blob.type });
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
  const TERM_MATCH_SELECTION_COMPARATORS = [
    compareTermMatchLengthDescending,
    compareTermMatchDeinflectionDepth,
    compareTermMatchStart,
    compareTermMatchDictionaryName,
    compareTermMatchEntryScoreDescending
  ];
  function dictionaryRank(preferences) {
    const rank = new Map(normalizeDictionaryPreferences(preferences).map((item) => [item.name, item]));
    return rank;
  }
  function dictionaryEnabled(dictionary, rank) {
    return rank.get(dictionary)?.enabled ?? true;
  }
  function dictionaryPriority(dictionary, rank) {
    return rank.get(dictionary)?.priority ?? 9999;
  }
  function compareMetaEntries(a, b, rank) {
    return compareMetaModes(a, b) || compareMetaEntriesWithinMode(a, b, rank);
  }
  function compareMetaModes(a, b) {
    return metaModePriority(a) - metaModePriority(b);
  }
  function metaModePriority(entry) {
    return entry.mode === "freq" ? 0 : 1;
  }
  function compareMetaEntriesWithinMode(a, b, rank) {
    return a.mode === "freq" && b.mode === "freq" ? compareFrequencyMetaEntries(a, b, rank) : compareDictionaryMetaEntries(a, b, rank);
  }
  function compareFrequencyMetaEntries(a, b, rank) {
    return jpdbFrequencyPriority(a) - jpdbFrequencyPriority(b) || compareDictionaryPriority(a, b, rank) || frequencyRank(a.data) - frequencyRank(b.data) || compareDictionaryName(a, b);
  }
  function jpdbFrequencyPriority(entry) {
    return isJpdbFrequencyDictionary(entry.dictionary) ? 0 : 1;
  }
  function compareDictionaryMetaEntries(a, b, rank) {
    return compareDictionaryPriority(a, b, rank) || compareDictionaryName(a, b);
  }
  function compareDictionaryPriority(a, b, rank) {
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank);
  }
  function compareDictionaryName(a, b) {
    return a.dictionary.localeCompare(b.dictionary);
  }
  function extractFrequency(value) {
    const rank = frequencyRank(value);
    return Number.isFinite(rank) ? rank : void 0;
  }
  function nonOverlappingMatches(matches, limit) {
    const selected = [];
    const occupied = [];
    const overlaps = (match) => occupied.some(([start, end]) => match.start < end && match.end > start);
    for (const match of matches.sort(compareTermMatchesForSelection)) {
      if (overlaps(match)) continue;
      selected.push(match);
      occupied.push([match.start, match.end]);
      if (selected.length >= limit) break;
    }
    const result = selected.sort((a, b) => a.start - b.start);
    return result;
  }
  function compareTermMatchesForSelection(a, b) {
    for (const compare of TERM_MATCH_SELECTION_COMPARATORS) {
      const result = compare(a, b);
      if (result) return result;
    }
    return 0;
  }
  function compareTermMatchLengthDescending(a, b) {
    return b.end - b.start - (a.end - a.start);
  }
  function compareTermMatchDeinflectionDepth(a, b) {
    return (a.deinflected?.depth ?? 0) - (b.deinflected?.depth ?? 0);
  }
  function compareTermMatchStart(a, b) {
    return a.start - b.start;
  }
  function compareTermMatchDictionaryName(a, b) {
    return a.entry.dictionary.localeCompare(b.entry.dictionary);
  }
  function compareTermMatchEntryScoreDescending(a, b) {
    return (b.entry.score ?? 0) - (a.entry.score ?? 0);
  }
  function isJpdbFrequencyDictionary(dictionary) {
    return /jpdb/i.test(dictionary);
  }
  function frequencyRank(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return rankFromFrequencyString(value);
    const nested = nestedFrequencyValue(value);
    return nested === void 0 ? Number.POSITIVE_INFINITY : frequencyRank(nested);
  }
  function rankFromFrequencyString(value) {
    return Number(value.replace(/[^\d.]/g, "")) || Number.POSITIVE_INFINITY;
  }
  function nestedFrequencyValue(value) {
    if (!value || typeof value !== "object") return void 0;
    const record = value;
    return record.frequency ?? record.value ?? record.displayValue;
  }
  const JAPANESE_RE$1 = /[\u3040-\u30ff\u3400-\u9fff]/u;
  function readIndexRequestValues(index, query, limit, resolve, reject) {
    if (typeof index.getAll === "function") {
      const request2 = index.getAll(query, limit);
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => reject(request2.error);
      return;
    }
    const results = [];
    let count = 0;
    const request = index.openCursor(query);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || count >= limit) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      count++;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  }
  function isSearchableJapaneseSurface(surface) {
    return JAPANESE_RE$1.test(surface) && !/\s/.test(surface);
  }
  function sortedTermMatchExpressions(candidates) {
    return Array.from(candidates.keys()).sort((a, b) => b.length - a.length || a.localeCompare(b));
  }
  function requestTermMatchIndex(index, expression, addMatches, finish, reject) {
    const request = index.getAll(IDBKeyRange.only(expression), 8);
    request.onsuccess = () => {
      addMatches(expression, request.result);
      finish();
    };
    request.onerror = () => reject(request.error);
  }
  function termMatchesForEntries(expression, foundEntries, candidates, rank) {
    const entries2 = sortTermMatchEntries(deduplicateTermMatchEntries(foundEntries), rank);
    if (!entries2.length) return [];
    return (candidates.get(expression) ?? []).map((position) => termMatchForPosition(position, entries2)).filter((match) => Boolean(match));
  }
  function deduplicateTermMatchEntries(entries2) {
    const seen = /* @__PURE__ */ new Set();
    return entries2.filter((item) => {
      const key = `${item.id ?? ""}
${item.dictionary}
${item.expression}
${item.reading}
${item.sequence ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function sortTermMatchEntries(entries2, rank) {
    return entries2.filter((item) => dictionaryEnabled(item.dictionary, rank)).sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0));
  }
  function rankedDictionaryEntries(entries2, rank, limit, compare = (a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)) {
    const ranked = entries2.filter((entry) => dictionaryEnabled(entry.dictionary, rank)).sort(compare);
    return limit === void 0 ? ranked : ranked.slice(0, limit);
  }
  function termMatchForPosition(position, entries2) {
    const entry = entries2.find((item) => termRulesMatch(item.rules, position.deinflected.rules));
    return entry ? {
      entry,
      ...position,
      deinflected: position.deinflected.depth > 0 ? position.deinflected : void 0
    } : null;
  }
  function readBlobWithFileReader(blob, read, result) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
      reader.onload = () => resolve(result(reader));
      read(reader, blob);
    });
  }
  async function readDexieTableRowCounts(file) {
    const head = await readBlobText(file.slice(0, Math.min(file.size, 1024 * 1024)));
    const tables = readDexieTablesArray(head);
    return tables ? dexieTableRowCounts(tables) : {};
  }
  function readDexieTablesArray(head) {
    const tablesIndex = head.indexOf('"tables"');
    if (tablesIndex < 0) return null;
    const arrayStart = head.indexOf("[", tablesIndex);
    if (arrayStart < 0) return null;
    const arrayEnd = findJsonArrayEnd(head, arrayStart);
    if (arrayEnd < 0) return null;
    return JSON.parse(head.slice(arrayStart, arrayEnd + 1));
  }
  function dexieTableRowCounts(tables) {
    const counts = {};
    for (const table of tables) {
      const count = dexieTableRowCount(table);
      if (count) counts[count.name] = count.rowCount;
    }
    return counts;
  }
  function dexieTableRowCount(table) {
    if (!table || typeof table !== "object") return null;
    const record = table;
    return typeof record.name === "string" && typeof record.rowCount === "number" ? { name: record.name, rowCount: record.rowCount } : null;
  }
  async function streamDexieTables(file, handlers, onTable) {
    if (typeof file.stream !== "function" || typeof TextDecoderStream === "undefined") {
      await streamDexieTablesFromText(await readBlobText(file), handlers, onTable);
      return;
    }
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    const state = {
      buffer: "",
      mode: "seek-table",
      tableName: "",
      rowStart: -1,
      depth: 0,
      inString: false,
      escaped: false
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      state.buffer += value;
      await processDexieStreamBuffer(state, handlers, onTable);
    }
  }
  function readBlobText(blob) {
    if (typeof blob.text === "function") return blob.text();
    return readBlobWithFileReader(blob, (reader, value) => reader.readAsText(value), (reader) => String(reader.result ?? ""));
  }
  async function processDexieStreamBuffer(state, handlers, onTable) {
    let progress = true;
    while (progress) {
      progress = await processDexieStreamStep(state, handlers, onTable);
    }
  }
  async function processDexieStreamStep(state, handlers, onTable) {
    if (state.mode === "seek-table") return seekDexieTable(state);
    if (state.mode === "seek-rows") return seekDexieRows(state, onTable);
    if (state.mode === "rows") return await readDexieRows(state, handlers);
    return false;
  }
  function seekDexieTable(state) {
    const tableIndex = state.buffer.indexOf('"tableName"');
    if (tableIndex < 0) {
      state.buffer = state.buffer.slice(-32);
      return false;
    }
    const colon = state.buffer.indexOf(":", tableIndex);
    const quote = colon >= 0 ? state.buffer.indexOf('"', colon) : -1;
    const end = quote >= 0 ? findJsonStringEnd(state.buffer, quote) : -1;
    if (end < 0) return false;
    state.tableName = JSON.parse(state.buffer.slice(quote, end + 1));
    state.buffer = state.buffer.slice(end + 1);
    state.mode = "seek-rows";
    return true;
  }
  function seekDexieRows(state, onTable) {
    const rowsIndex = state.buffer.indexOf('"rows"');
    if (rowsIndex < 0) {
      state.buffer = state.buffer.slice(-32);
      return false;
    }
    const arrayIndex = state.buffer.indexOf("[", rowsIndex);
    if (arrayIndex < 0) return false;
    state.buffer = state.buffer.slice(arrayIndex + 1);
    state.mode = "rows";
    resetDexieRowState(state);
    onTable?.(state.tableName);
    return true;
  }
  function resetDexieRowState(state) {
    state.rowStart = -1;
    state.depth = 0;
    state.inString = false;
    state.escaped = false;
  }
  async function readDexieRows(state, handlers) {
    let progress = false;
    let index = 0;
    while (index < state.buffer.length) {
      const step = await readDexieRowStep(state, handlers, index, progress);
      if (step.done) return true;
      progress = step.progress;
      index = step.nextIndex;
    }
    if (!progress) compactDexieRowBuffer(state);
    return progress;
  }
  async function readDexieRowStep(state, handlers, index, progress) {
    const action = readDexieRowCharacter(state, index);
    if (action === "continue") return { done: false, progress, nextIndex: index + 1 };
    const result = await applyDexieRowReadAction(state, handlers, action, index, progress);
    return {
      done: result.done,
      progress: result.progress,
      nextIndex: result.restart ? 0 : index + 1
    };
  }
  async function applyDexieRowReadAction(state, handlers, action, index, progress) {
    if (action === "close-array") return { done: true, progress, restart: false };
    if (action !== "finish-row") return { done: false, progress, restart: false };
    const nextProgress = await finishDexieRow(state, handlers, index) || progress;
    return { done: false, progress: nextProgress, restart: nextProgress && state.rowStart === -1 };
  }
  function readDexieRowCharacter(state, index) {
    const char = state.buffer[index];
    if (advanceStringState(state, char)) return "continue";
    if (openDexieRowObject(state, index, char)) return "continue";
    if (char === "}") return "finish-row";
    return closeDexieRowsArray(state, index, char) ? "close-array" : "scan";
  }
  function openDexieRowObject(state, index, char) {
    if (char !== "{") return false;
    if (state.depth === 0) state.rowStart = index;
    state.depth++;
    return true;
  }
  function closeDexieRowsArray(state, index, char) {
    if (state.depth !== 0 || char !== "]") return false;
    state.buffer = state.buffer.slice(index + 1);
    state.mode = "seek-table";
    state.tableName = "";
    return true;
  }
  async function finishDexieRow(state, handlers, index) {
    state.depth--;
    if (state.depth !== 0 || state.rowStart < 0) return false;
    const handler = handlers[state.tableName];
    if (handler) await handler(JSON.parse(state.buffer.slice(state.rowStart, index + 1)));
    state.buffer = state.buffer.slice(index + 1);
    state.rowStart = -1;
    return true;
  }
  function advanceStringState(state, char) {
    if (state.inString) return advanceOpenStringState(state, char);
    return enterStringState(state, char);
  }
  function enterStringState(state, char) {
    if (char !== '"') return false;
    state.inString = true;
    return true;
  }
  function advanceOpenStringState(state, char) {
    if (state.escaped) state.escaped = false;
    else if (char === "\\") state.escaped = true;
    else if (char === '"') state.inString = false;
    return true;
  }
  function compactDexieRowBuffer(state) {
    if (state.rowStart > 0) {
      state.buffer = state.buffer.slice(state.rowStart);
      state.rowStart = 0;
    } else if (state.depth === 0 && state.buffer.length > 4096) {
      state.buffer = state.buffer.slice(-4096);
    }
  }
  function findJsonArrayEnd(text, start) {
    const state = createJsonArrayScanState();
    for (let index = start; index < text.length; index++) {
      if (scanJsonArrayCharacter(state, text[index])) return index;
    }
    return -1;
  }
  function createJsonArrayScanState() {
    return { depth: 0, inString: false, escaped: false };
  }
  function scanJsonArrayCharacter(state, char) {
    if (state.inString) {
      scanJsonArrayStringCharacter(state, char);
      return false;
    }
    if (char === '"') {
      state.inString = true;
      return false;
    }
    if (char === "[") state.depth += 1;
    if (char !== "]") return false;
    state.depth -= 1;
    return state.depth === 0;
  }
  function scanJsonArrayStringCharacter(state, char) {
    if (state.escaped) {
      state.escaped = false;
      return;
    }
    if (char === "\\") state.escaped = true;
    if (char === '"') state.inString = false;
  }
  async function streamDexieTablesFromText(text, handlers, onTable) {
    let offset = 0;
    while (true) {
      const table = nextDexieTableScan(text, offset);
      if (!table) return;
      onTable?.(table.tableName);
      offset = await streamDexieRowsFromText(text, table.arrayStart, table.tableName, handlers);
    }
  }
  async function streamDexieRowsFromText(text, arrayStart, tableName, handlers) {
    const handler = handlers[tableName];
    const state = { depth: 0, rowStart: -1, inString: false, escaped: false };
    for (let index = arrayStart + 1; index < text.length; index++) {
      const endOffset = await scanDexieRowCharacter(text, state, index, handler);
      if (endOffset !== null) return endOffset;
    }
    return text.length;
  }
  function nextDexieTableScan(text, offset) {
    const tableIndex = text.indexOf('"tableName"', offset);
    if (tableIndex < 0) return null;
    const quote = dexieTableNameQuoteIndex(text, tableIndex);
    if (quote < 0) return null;
    const end = findJsonStringEnd(text, quote);
    if (end < 0) return null;
    const arrayStart = dexieRowsArrayStart(text, end);
    if (arrayStart < 0) return null;
    return { tableName: JSON.parse(text.slice(quote, end + 1)), arrayStart };
  }
  function dexieTableNameQuoteIndex(text, tableIndex) {
    const colon = text.indexOf(":", tableIndex);
    return colon >= 0 ? text.indexOf('"', colon) : -1;
  }
  function dexieRowsArrayStart(text, offset) {
    const rowsIndex = text.indexOf('"rows"', offset);
    return rowsIndex >= 0 ? text.indexOf("[", rowsIndex) : -1;
  }
  async function scanDexieRowCharacter(text, state, index, handler) {
    const char = text[index];
    if (consumeDexieStringCharacter(state, char)) return null;
    if (openDexieString(state, char)) return null;
    if (char === "{") beginDexieRow(state, index);
    if (char === "}") await finishDexieArrayRow(text, state, index, handler);
    return dexieArrayEndOffset(state, char, index);
  }
  function dexieArrayEndOffset(state, char, index) {
    return state.depth === 0 && char === "]" ? index + 1 : null;
  }
  function consumeDexieStringCharacter(state, char) {
    if (!state.inString) return false;
    if (state.escaped) state.escaped = false;
    else if (char === "\\") state.escaped = true;
    else if (char === '"') state.inString = false;
    return true;
  }
  function openDexieString(state, char) {
    if (char !== '"') return false;
    state.inString = true;
    return true;
  }
  function beginDexieRow(state, index) {
    if (state.depth === 0) state.rowStart = index;
    state.depth++;
  }
  async function finishDexieArrayRow(text, state, index, handler) {
    state.depth--;
    if (state.depth === 0 && state.rowStart >= 0 && handler) await handler(JSON.parse(text.slice(state.rowStart, index + 1)));
  }
  function findJsonStringEnd(value, quoteIndex) {
    let escaped = false;
    for (let index = quoteIndex + 1; index < value.length; index++) {
      const char = value[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') return index;
    }
    return -1;
  }
  const log$4 = Logger.scope("Yomitan");
  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url);
      const pathName = parsed.pathname.split("/").filter(Boolean).pop();
      return pathName && /\.zip$/i.test(pathName) ? decodeURIComponent(pathName) : "dictionary.zip";
    } catch {
      return "dictionary.zip";
    }
  }
  function fileSummary(file, sourceUrl = "") {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      sourceHost: sourceUrl ? safeHost(sourceUrl) : ""
    };
  }
  function safeHost(url) {
    try {
      return new URL(url, location.href).host;
    } catch {
      return "";
    }
  }
  function namedBlobFile(blob, name, type) {
    if (typeof File === "function") return new File([blob], name, { type });
    Object.defineProperty(blob, "name", { value: name, configurable: true });
    Object.defineProperty(blob, "lastModified", { value: Date.now(), configurable: true });
    return blob;
  }
  function formatPercent(loaded, total) {
    if (total <= 0) return "100%";
    return `${Math.max(0, Math.min(100, Math.round(loaded / total * 100)))}%`;
  }
  function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    const precision = unit === 0 || size >= 10 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unit]}`;
  }
  async function requestBlob(url, proxyUrl, onProgress, language = "en") {
    const done = log$4.time("Dictionary download", { host: safeHost(url) });
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return requestBlobViaUserscript(url, userscriptRequest, done, onProgress, language);
    return await requestBlobViaFetch(url, proxyUrl, done, onProgress, language);
  }
  function requestBlobViaUserscript(url, userscriptRequest, done, onProgress, language = "en") {
    return new Promise((resolve, reject) => {
      const handleLoad = (response) => {
        if (response.response instanceof Blob && (response.status === 0 || response.status >= 200 && response.status < 300)) {
          log$4.info("Dictionary download completed", { host: safeHost(url), status: response.status, size: response.response.size });
          done();
          resolve(response.response);
          return;
        }
        if (response.status < 200 || response.status >= 300) {
          log$4.warn("Dictionary download HTTP error", { host: safeHost(url), status: response.status });
          done();
          reject(new Error(formatDictionaryDownloadFailed(language, response.status)));
          return;
        }
        log$4.warn("Dictionary download payload failed", { host: safeHost(url), status: response.status });
        done();
        reject(new Error(uiText(language, "dictionaryDownloadNotZip")));
      };
      const result = userscriptRequest({
        method: "GET",
        url,
        headers: { accept: "application/zip,application/octet-stream,*/*" },
        responseType: "blob",
        timeout: 12e4,
        onprogress: (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress?.(`${uiText(language, "dictionaryDownloadProgress")} ${Math.round(event.loaded / event.total * 100)}%...`);
          }
        },
        onload: handleLoad,
        onerror: () => {
          log$4.warn("Dictionary download failed", { host: safeHost(url) });
          done();
          reject(new Error(uiText(language, "dictionaryDownloadFailed")));
        },
        ontimeout: () => {
          log$4.warn("Dictionary download timed out", { host: safeHost(url) });
          done();
          reject(new Error(uiText(language, "dictionaryDownloadTimedOut")));
        }
      });
      if (result && typeof result.then === "function") {
        result.then(handleLoad, () => {
          log$4.warn("Dictionary download failed", { host: safeHost(url) });
          done();
          reject(new Error(uiText(language, "dictionaryDownloadFailed")));
        });
      }
    });
  }
  async function requestBlobViaFetch(url, proxyUrl, done, onProgress, language) {
    const downloadUrl = dictionaryDownloadUrl(url);
    if (!downloadUrl) return throwMissingDictionaryDownloadBridge(done, language);
    try {
      return await fetchDictionaryBlob(url, downloadUrl, proxyUrl, done, onProgress, language);
    } catch (error) {
      return handleDictionaryFetchError(url, downloadUrl, error, done, language);
    }
  }
  function throwMissingDictionaryDownloadBridge(done, language) {
    done();
    throw new Error(uiText(language, "dictionaryDownloadNeedsBridge"));
  }
  async function fetchDictionaryBlob(url, downloadUrl, proxyUrl, done, onProgress, language) {
    const response = await fetchWithCorsFallbacks(downloadUrl, proxyUrl, { credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", timeoutMs: 12e4 });
    if (!response.ok) throwDictionaryHttpError(url, response.status, language);
    const blob = await responseBlobWithProgress(response, onProgress, language);
    log$4.info("Dictionary download completed", { host: safeHost(url), status: response.status, size: blob.size });
    done();
    return blob;
  }
  async function responseBlobWithProgress(response, onProgress, language) {
    if (!response.body || !onProgress) return response.blob();
    const total = Number(response.headers.get("content-length") ?? 0);
    const type = response.headers.get("content-type") || "application/zip";
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(formatDictionaryDownloadProgress(language, loaded, total));
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Blob([bytes.buffer.slice(0)], { type });
  }
  function formatDictionaryDownloadProgress(language, loaded, total) {
    const label = uiText(language, "dictionaryDownloadProgress");
    if (total > 0) return `${label} ${formatPercent(loaded, total)} (${formatBytes(loaded)} / ${formatBytes(total)})...`;
    return `${label} ${formatBytes(loaded)}...`;
  }
  function throwDictionaryHttpError(url, status, language) {
    log$4.warn("Dictionary download HTTP error", { host: safeHost(url), status });
    throw new Error(formatDictionaryDownloadFailed(language, status));
  }
  function handleDictionaryFetchError(url, downloadUrl, error, done, language) {
    const host = safeHost(url);
    if (isDictionaryCorsError(error)) {
      log$4.warn("Dictionary download CORS failed", { host, downloadUrl });
      done();
      throw new Error(uiText(language, "dictionaryDownloadBlocked"));
    }
    log$4.warn("Dictionary download fetch failed", { host, error });
    done();
    throw language === "ja" ? new Error(uiText(language, "dictionaryDownloadFailed")) : error;
  }
  function formatDictionaryDownloadFailed(language, status) {
    return language === "ja" ? `${uiText(language, "dictionaryDownloadFailed")}（${status}）` : `Dictionary download failed (${status}).`;
  }
  function isDictionaryCorsError(error) {
    return error instanceof Error && error.name === "TypeError";
  }
  function dictionaryDownloadUrl(url) {
    try {
      const target = new URL(url, location.href);
      const current = new URL(location.href);
      if (target.origin === current.origin) return target.href;
      if (target.protocol === "https:" || target.protocol === "http:") return target.href;
      return null;
    } catch {
      return url;
    }
  }
  const GLOSSARY_SEARCH_FALLBACK_TEXT_KEYS = /* @__PURE__ */ new Set(["description", "alt", "title"]);
  function glossaryValueToSearchText(value) {
    return glossaryValueToProfileText(value, {
      includeDirectDataAttributes: false,
      fallbackTextKeys: GLOSSARY_SEARCH_FALLBACK_TEXT_KEYS
    });
  }
  function normalizeGlossarySearchText(value) {
    return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s'-]+/gu, " ").replace(/\s+/g, " ").trim();
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
  function renderDictionaryScopedStyles(dictionaries, preferences = []) {
    const rank = dictionaryRank(preferences);
    const css = dictionaries.filter((dictionary) => dictionaryEnabled(dictionary.title, rank)).map((dictionary) => {
      const styles = dictionary.styles?.trim();
      if (!styles) return "";
      return scopeDictionaryStyles(styles, dictionaryScopeSelector(dictionary.title));
    }).filter(Boolean).join("\n");
    return css;
  }
  function dictionaryScopeSelector(dictionary) {
    return `[data-dictionary="${dictionary.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  }
  function scopeDictionaryStyles(styles, scope) {
    return splitTopLevelCssBlocks(styles).map((block) => scopeDictionaryStyleBlock(block, scope)).filter(Boolean).join("\n");
  }
  function scopeDictionaryStyleBlock(block, scope) {
    const openIndex = block.indexOf("{");
    const closeIndex = block.lastIndexOf("}");
    if (openIndex < 0 || closeIndex <= openIndex) return "";
    const selector = block.slice(0, openIndex).trim();
    const declarations = block.slice(openIndex + 1, closeIndex).trim();
    if (!hasCssRuleParts(selector, declarations)) return "";
    if (selector.startsWith("@")) {
      const scopedInner = splitTopLevelCssBlocks(declarations).map((innerBlock) => scopeDictionaryStyleBlock(innerBlock, scope)).filter(Boolean).join("\n");
      return renderScopedAtRule(selector, declarations, scopedInner);
    }
    const scopedSelectors = splitSelectorList(selector).map((part) => `${scope} ${part.trim()}`).join(", ");
    return `${scopedSelectors} { ${declarations} }`;
  }
  function hasCssRuleParts(selector, declarations) {
    return Boolean(selector && declarations);
  }
  function renderScopedAtRule(selector, declarations, scopedInner) {
    return scopedInner ? `${selector} {
${scopedInner}
}` : `${selector} { ${declarations} }`;
  }
  function splitTopLevelCssBlocks(styles) {
    const state = { blocks: [], depth: 0, start: 0, inString: null, escaped: false };
    for (let index = 0; index < styles.length; index++) {
      const character = styles[index];
      if (consumeStringScanCharacter(state, character)) continue;
      if (openStringScan(state, character)) continue;
      if (openCssBlock(state, styles, index, character)) continue;
      closeCssBlock(state, styles, index, character);
    }
    return state.blocks;
  }
  function openCssBlock(state, styles, index, character) {
    if (character !== "{") return false;
    if (state.depth === 0) state.start = findSelectorStart(styles, index);
    state.depth++;
    return true;
  }
  function closeCssBlock(state, styles, index, character) {
    if (character !== "}" || state.depth === 0) return;
    state.depth--;
    if (state.depth > 0) return;
    state.blocks.push(styles.slice(state.start, index + 1).trim());
    state.start = index + 1;
  }
  function splitSelectorList(selector) {
    const state = { selectors: [], start: 0, bracketDepth: 0, parenDepth: 0, inString: null, escaped: false };
    for (let index = 0; index < selector.length; index++) {
      const character = selector[index];
      if (consumeStringScanCharacter(state, character)) continue;
      if (openStringScan(state, character)) continue;
      updateSelectorDepth(state, character);
      if (!isSelectorSeparator(state, character)) continue;
      state.selectors.push(selector.slice(state.start, index).trim());
      state.start = index + 1;
    }
    state.selectors.push(selector.slice(state.start).trim());
    return state.selectors.filter(Boolean);
  }
  function consumeStringScanCharacter(state, character) {
    if (!state.inString) return false;
    if (state.escaped) state.escaped = false;
    else if (character === "\\") state.escaped = true;
    else if (character === state.inString) state.inString = null;
    return true;
  }
  function openStringScan(state, character) {
    if (character !== '"' && character !== "'") return false;
    state.inString = character;
    return true;
  }
  function updateSelectorDepth(state, character) {
    if (character === "[") state.bracketDepth++;
    if (character === "]") state.bracketDepth = Math.max(0, state.bracketDepth - 1);
    if (character === "(") state.parenDepth++;
    if (character === ")") state.parenDepth = Math.max(0, state.parenDepth - 1);
  }
  function isSelectorSeparator(state, character) {
    return character === "," && state.bracketDepth === 0 && state.parenDepth === 0;
  }
  function findSelectorStart(styles, openIndex) {
    const separators = ["}", ";"];
    let start = 0;
    for (let index = openIndex - 1; index >= 0; index--) {
      if (!separators.includes(styles[index])) continue;
      start = index + 1;
      break;
    }
    return start;
  }
  const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
  function splitTags(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  }
  function importEntryStores() {
    return ["terms", "kanji", "termMeta", "kanjiMeta"];
  }
  function isEntryStoreName(value) {
    return value === "terms" || value === "kanji" || value === "termMeta" || value === "kanjiMeta";
  }
  function dictionaryCountsFromSummary(summary) {
    return {
      terms: summary.terms,
      kanji: summary.kanji,
      termMeta: summary.termMeta,
      kanjiMeta: summary.kanjiMeta
    };
  }
  function dictionaryTypeFromCounts(counts = {}) {
    return DICTIONARY_TYPE_COUNT_PRIORITY.find(({ key }) => Number(counts[key] ?? 0) > 0)?.type ?? "terms";
  }
  function hasTermDictionaryRows(info) {
    const count = Number(info.counts?.terms);
    if (Number.isFinite(count)) return count > 0;
    return info.type === void 0 || info.type === "terms";
  }
  const DICTIONARY_TYPE_COUNT_PRIORITY = [
    { key: "terms", type: "terms" },
    { key: "termMeta", type: "frequency" },
    { key: "kanji", type: "kanji" },
    { key: "kanjiMeta", type: "metadata" }
  ];
  function readerExportTerms(json) {
    return json.terms ?? json.entries ?? [];
  }
  function readerExportDictionaryNames(json, terms = readerExportTerms(json)) {
    return uniqueDictionaryNames([
      ...json.dictionaries?.map((item) => item.title) ?? [],
      ...terms.map((entry) => entry.dictionary),
      ...(json.kanji ?? []).map((entry) => entry.dictionary),
      ...(json.termMeta ?? []).map((entry) => entry.dictionary),
      ...(json.kanjiMeta ?? []).map((entry) => entry.dictionary)
    ]);
  }
  function readerExportDictionaryInfo(json, dictionaryNames, dictionaryTypes) {
    return json.dictionaries?.length ? json.dictionaries.map((info) => ({ ...info, type: info.type ?? dictionaryTypes[info.title] })) : dictionaryNames.map((title, index) => ({ title, alias: title, enabled: true, priority: index, type: dictionaryTypes[title] }));
  }
  function readerExportSummary(json, terms, dictionaryNames, dictionaryTypes) {
    const kanji = json.kanji ?? [];
    const termMeta = json.termMeta ?? [];
    const kanjiMeta = json.kanjiMeta ?? [];
    return {
      dictionaries: dictionaryNames,
      dictionaryTypes,
      entries: terms.length + kanji.length + termMeta.length + kanjiMeta.length,
      terms: terms.length,
      kanji: kanji.length,
      termMeta: termMeta.length,
      kanjiMeta: kanjiMeta.length
    };
  }
  function dictionaryTypesFromReaderExport(json) {
    const counts = /* @__PURE__ */ new Map();
    addDictionaryTypeCounts(counts, readerExportTerms(json), "terms");
    addDictionaryTypeCounts(counts, json.kanji ?? [], "kanji");
    addDictionaryTypeCounts(counts, json.termMeta ?? [], "termMeta");
    addDictionaryTypeCounts(counts, json.kanjiMeta ?? [], "kanjiMeta");
    return Object.fromEntries([
      ...configuredReaderDictionaryTypes(json),
      ...observedReaderDictionaryTypes(counts)
    ]);
  }
  function addDictionaryTypeCounts(counts, entries2, store) {
    for (const entry of entries2) {
      const item = counts.get(entry.dictionary) ?? { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      item[store]++;
      counts.set(entry.dictionary, item);
    }
  }
  function configuredReaderDictionaryTypes(json) {
    return (json.dictionaries ?? []).map((info) => [info.title, info.type ?? dictionaryTypeFromCounts(info.counts)]);
  }
  function observedReaderDictionaryTypes(counts) {
    return [...counts].map(([name, value]) => [name, dictionaryTypeFromCounts(value)]);
  }
  function isReaderDictionaryExport(value) {
    const record = readerDictionaryExportRecord(value);
    return Boolean(record && isReaderDictionaryExportFormat(record) && hasReaderDictionaryExportRows(record));
  }
  function readerDictionaryExportRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  function isReaderDictionaryExportFormat(record) {
    return record.formatName === "yomu-yomitan-dictionaries" || record.formatName === "jpdb-reader-yomitan-dictionaries";
  }
  function hasReaderDictionaryExportRows(record) {
    return Array.isArray(record.entries) || Array.isArray(record.terms) || Array.isArray(record.kanji) || Array.isArray(record.termMeta) || Array.isArray(record.kanjiMeta);
  }
  function uniqueDictionaryNames(names) {
    return [...new Set(names.filter((name) => typeof name === "string" && Boolean(name)))];
  }
  var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i2 = 0; i2 < 31; ++i2) {
      b[i2] = start += 1 << eb[i2 - 1];
    }
    var r = new i32(b[30]);
    for (var i2 = 1; i2 < 30; ++i2) {
      for (var j = b[i2]; j < b[i2 + 1]; ++j) {
        r[j] = j - b[i2] << 5 | i2;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0), fd = _b.b;
  var rev = new u16(32768);
  for (var i = 0; i < 32768; ++i) {
    var x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var hMap = function(cd, mb, r) {
    var s = cd.length;
    var i2 = 0;
    var l = new u16(mb);
    for (; i2 < s; ++i2) {
      if (cd[i2])
        ++l[cd[i2] - 1];
    }
    var le = new u16(mb);
    for (i2 = 1; i2 < mb; ++i2) {
      le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          var sv = i2 << 4 | cd[i2];
          var r_1 = mb - cd[i2];
          var v = le[cd[i2] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
        }
      }
    }
    return co;
  };
  var flt = new u8(288);
  for (var i = 0; i < 144; ++i)
    flt[i] = 8;
  for (var i = 144; i < 256; ++i)
    flt[i] = 9;
  for (var i = 256; i < 280; ++i)
    flt[i] = 7;
  for (var i = 280; i < 288; ++i)
    flt[i] = 8;
  var fdt = new u8(32);
  for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i2 = 1; i2 < a.length; ++i2) {
      if (a[i2] > m)
        m = a[i2];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i2 = 0; i2 < hcLen; ++i2) {
            clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i2 = 0; i2 < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i2++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i2++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i2 = sym - 257, b = fleb[i2];
            add = bits(dat, pos, (1 << b) - 1) + fl[i2];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var et = /* @__PURE__ */ new u8(0);
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts, opts);
  }
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }
  const ZIP_END_SIGNATURE = 101010256;
  const ZIP_CENTRAL_SIGNATURE = 33639248;
  const ZIP_LOCAL_SIGNATURE = 67324752;
  const ZIP_UTF8_FLAG = 2048;
  const ZIP_ENCRYPTED_FLAG = 1;
  const ZIP_STORE_METHOD = 0;
  const ZIP_DEFLATE_METHOD = 8;
  const ZIP64_MARKER_16 = 65535;
  const ZIP64_MARKER_32 = 4294967295;
  const MAX_ZIP_COMMENT_BYTES = 65535;
  const textDecoder = new TextDecoder();
  class ZipArchive {
    constructor(archiveBytes, files) {
      this.archiveBytes = archiveBytes;
      this.files = files;
    }
    entries() {
      return [...this.files.values()].map(({ name, compressedSize, uncompressedSize }) => ({ name, compressedSize, uncompressedSize }));
    }
    async text(name, onProgress) {
      const entry = this.files.get(name);
      if (!entry) throw new Error(`${name} not found.`);
      onProgress?.({ name, loaded: 0, total: zipEntryProgressTotal(entry) });
      const bytes = await this.fileBytes(entry);
      onProgress?.({ name, loaded: bytes.byteLength, total: zipEntryProgressTotal(entry) });
      return textDecoder.decode(bytes);
    }
    async bytes(name) {
      const entry = this.files.get(name);
      if (!entry) throw new Error(`${name} not found.`);
      return this.fileBytes(entry);
    }
    async fileBytes(entry) {
      if (entry.encrypted) throw new Error(`Encrypted ZIP entries are not supported: ${entry.name}`);
      const compressed = localFileBytes(this.archiveBytes, entry);
      if (entry.compressionMethod === ZIP_STORE_METHOD) return compressed;
      if (entry.compressionMethod === ZIP_DEFLATE_METHOD) return inflateRaw(compressed);
      throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}: ${entry.name}`);
    }
  }
  async function readZipArchive(file, onProgress) {
    const bytes = await readBlobBytes(file, onProgress);
    const files = readZipCentralDirectory(bytes);
    onProgress?.({ phase: "directory", loaded: bytes.byteLength, total: file.size || bytes.byteLength, entries: files.size });
    return new ZipArchive(bytes, files);
  }
  async function readBlobBytes(file, onProgress) {
    const total = file.size;
    if (!onProgress || typeof file.stream !== "function") {
      const bytes2 = new Uint8Array(await readBlobArrayBuffer(file));
      onProgress?.({ phase: "read", loaded: bytes2.byteLength, total: total || bytes2.byteLength });
      return bytes2;
    }
    const reader = file.stream().getReader();
    const chunks = [];
    let loaded = 0;
    onProgress({ phase: "read", loaded, total });
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ phase: "read", loaded, total });
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  function readZipCentralDirectory(bytes) {
    const view = dataView(bytes);
    const endOffset = findZipEndRecord(view);
    const entryCount = view.getUint16(endOffset + 10, true);
    const directorySize = view.getUint32(endOffset + 12, true);
    const directoryOffset = view.getUint32(endOffset + 16, true);
    if (entryCount === ZIP64_MARKER_16 || directorySize === ZIP64_MARKER_32 || directoryOffset === ZIP64_MARKER_32) {
      throw new Error("ZIP64 dictionaries are not supported.");
    }
    const files = /* @__PURE__ */ new Map();
    const directoryEnd = directoryOffset + directorySize;
    let offset = directoryOffset;
    for (let index = 0; index < entryCount && offset < directoryEnd; index++) {
      const entry = readCentralEntry(bytes, view, offset);
      offset = entry.nextOffset;
      if (!entry.file.name.endsWith("/")) files.set(entry.file.name, entry.file);
    }
    return files;
  }
  function findZipEndRecord(view) {
    const minOffset = Math.max(0, view.byteLength - MAX_ZIP_COMMENT_BYTES - 22);
    for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
      if (view.getUint32(offset, true) === ZIP_END_SIGNATURE) return offset;
    }
    throw new Error("Invalid ZIP archive: end record not found.");
  }
  function readCentralEntry(bytes, view, offset) {
    assertSignature(view, offset, ZIP_CENTRAL_SIGNATURE, "central directory entry");
    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const name = decodeZipName(bytes.subarray(nameStart, nameStart + nameLength), flags);
    return {
      file: {
        name,
        compressionMethod: view.getUint16(offset + 10, true),
        encrypted: Boolean(flags & ZIP_ENCRYPTED_FLAG),
        compressedSize: view.getUint32(offset + 20, true),
        uncompressedSize: view.getUint32(offset + 24, true),
        localHeaderOffset: view.getUint32(offset + 42, true)
      },
      nextOffset: nameStart + nameLength + extraLength + commentLength
    };
  }
  function localFileBytes(bytes, entry) {
    const view = dataView(bytes);
    assertSignature(view, entry.localHeaderOffset, ZIP_LOCAL_SIGNATURE, "local file header");
    const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > bytes.length) throw new Error(`Invalid ZIP entry bounds: ${entry.name}`);
    return bytes.subarray(start, end);
  }
  function zipEntryProgressTotal(entry) {
    return entry.uncompressedSize || entry.compressedSize;
  }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "function") {
      try {
        return await inflateRawWithStream(bytes);
      } catch {
      }
    }
    try {
      return inflateSync(bytes);
    } catch (error) {
      throw error instanceof Error ? new Error(`This browser could not import compressed ZIP dictionaries: ${error.message}`) : new Error("This browser could not import compressed ZIP dictionaries.");
    }
  }
  async function inflateRawWithStream(bytes) {
    const stream = new Blob([arrayBufferSlice(bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function assertSignature(view, offset, expected, label) {
    if (offset < 0 || offset + 4 > view.byteLength || view.getUint32(offset, true) !== expected) {
      throw new Error(`Invalid ZIP archive: ${label} not found.`);
    }
  }
  function decodeZipName(bytes, flags) {
    return new TextDecoder(flags & ZIP_UTF8_FLAG ? "utf-8" : void 0).decode(bytes);
  }
  function dataView(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  function arrayBufferSlice(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  function readBlobArrayBuffer(blob) {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return readBlobWithFileReader(blob, (reader, value) => reader.readAsArrayBuffer(value), (reader) => reader.result);
  }
  function countYomitanZipBanks(entries2) {
    return entries2.filter((entry) => /^(term|kanji|term_meta|kanji_meta)_bank_\d+\.json$/i.test(entry.name)).length;
  }
  function yomitanZipDictionaryName(index, filename) {
    return index.title?.trim() || filename.replace(/\.zip$/i, "");
  }
  function yomitanDictionaryIdentity(title) {
    return title.replace(/\s*[\[(][^\])]*\d[^\])]*[\])]\s*$/u, "").replace(/\s+v?\d{4}[-.]\d{2}[-.]\d{2}\s*$/u, "").replace(/\s+v\d+(?:\.\d+)*\s*$/u, "").trim().toLowerCase() || title.trim().toLowerCase();
  }
  function yomitanZipVersion(index) {
    return index.format ?? index.version ?? 3;
  }
  function imageMimeType(path) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    return "image/png";
  }
  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 32768;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  function normalizeZipTermRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== "string") return null;
    return {
      expression,
      reading: zipTermReading(reading, expression),
      definitionTags: zipStringField(definitionTags),
      rules: zipStringField(rules),
      score: zipNumberField(score, 0),
      glossary: zipGlossaryField(glossary),
      sequence: zipOptionalNumberField(sequence),
      termTags: zipStringField(termTags),
      dictionary
    };
  }
  function zipTermReading(value, expression) {
    return typeof value === "string" && value ? value : expression;
  }
  function zipStringField(value) {
    return typeof value === "string" ? value : "";
  }
  function zipNumberField(value, fallback) {
    return typeof value === "number" ? value : fallback;
  }
  function zipOptionalNumberField(value) {
    return typeof value === "number" ? value : void 0;
  }
  function zipGlossaryField(value) {
    return Array.isArray(value) ? value : [];
  }
  function normalizeZipKanjiRow(row, dictionary, version) {
    if (!Array.isArray(row)) return null;
    const [character, onyomi, kunyomi, tags, meaningsOrFirst, stats] = row;
    if (typeof character !== "string") return null;
    const meanings = version === 1 ? row.slice(4) : meaningsOrFirst;
    return {
      character,
      onyomi: splitTags(onyomi),
      kunyomi: splitTags(kunyomi),
      tags: splitTags(tags),
      meanings: Array.isArray(meanings) ? meanings.map(String) : [],
      stats,
      dictionary
    };
  }
  function normalizeZipTermMetaRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [expression, mode, data] = row;
    return typeof expression === "string" && typeof mode === "string" ? { expression, mode, data, dictionary } : null;
  }
  function normalizeZipKanjiMetaRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [character, mode, data] = row;
    return typeof character === "string" && typeof mode === "string" ? { character, mode, data, dictionary } : null;
  }
  function normalizeDexieTermRow(row) {
    const record = dexieRowRecord(row);
    if (!record) return null;
    if (typeof record.expression !== "string" || typeof record.dictionary !== "string") return null;
    return {
      expression: record.expression,
      reading: dexieStringField(record, "reading", record.expression),
      definitionTags: dexieStringField(record, "definitionTags"),
      rules: dexieStringField(record, "rules"),
      score: dexieNumberField(record, "score", 0),
      glossary: dexieGlossaryField(record),
      sequence: dexieOptionalNumberField(record, "sequence"),
      termTags: dexieStringField(record, "termTags"),
      dictionary: record.dictionary
    };
  }
  function dexieStringField(record, key, fallback = "") {
    const value = record[key];
    return typeof value === "string" && value ? value : fallback;
  }
  function dexieNumberField(record, key, fallback) {
    const value = record[key];
    return typeof value === "number" ? value : fallback;
  }
  function dexieOptionalNumberField(record, key) {
    const value = record[key];
    return typeof value === "number" ? value : void 0;
  }
  function dexieGlossaryField(record) {
    return Array.isArray(record.glossary) ? record.glossary : [];
  }
  function normalizeDexieKanjiRow(row) {
    const record = dexieKanjiRecord(row);
    return record ? {
      character: record.character,
      onyomi: dexieStringList(record.onyomi),
      kunyomi: dexieStringList(record.kunyomi),
      tags: dexieStringList(record.tags),
      meanings: Array.isArray(record.meanings) ? record.meanings.map(String) : [],
      stats: record.stats,
      dictionary: record.dictionary
    } : null;
  }
  function dexieKanjiRecord(row) {
    const record = dexieRowRecord(row);
    return record && typeof record.character === "string" && typeof record.dictionary === "string" ? record : null;
  }
  function dexieStringList(value) {
    return Array.isArray(value) ? value.map(String) : splitTags(value);
  }
  function normalizeDexieTermMetaRow(row) {
    const record = dexieTermMetaRecord(row);
    return record ? { expression: record.expression, mode: record.mode, data: record.data, dictionary: record.dictionary } : null;
  }
  function normalizeDexieKanjiMetaRow(row) {
    const record = dexieKanjiMetaRecord(row);
    return record ? { character: record.character, mode: record.mode, data: record.data, dictionary: record.dictionary } : null;
  }
  function dexieTermMetaRecord(row) {
    const record = dexieRowRecord(row);
    return record && typeof record.expression === "string" && typeof record.mode === "string" && typeof record.dictionary === "string" ? record : null;
  }
  function dexieKanjiMetaRecord(row) {
    const record = dexieRowRecord(row);
    return record && typeof record.character === "string" && typeof record.mode === "string" && typeof record.dictionary === "string" ? record : null;
  }
  function normalizeDexieDictionaryRow(row) {
    const record = dexieDictionaryRecord(row);
    if (!record) return null;
    if (typeof record.title !== "string") return null;
    return {
      title: record.title,
      alias: dictionaryAlias(record, record.title),
      enabled: dictionaryInfoEnabled(record.enabled),
      priority: dictionaryInfoPriority(record.priority),
      counts: record.counts,
      type: dictionaryInfoType(record.type),
      styles: stringField(record.styles) ?? "",
      revision: stringField(record.revision),
      downloadUrl: stringField(record.downloadUrl),
      importDate: numberField(record.importDate)
    };
  }
  function dexieDictionaryRecord(row) {
    return dexieRowRecord(row);
  }
  function dictionaryInfoEnabled(value) {
    return typeof value === "boolean" ? value : true;
  }
  function dictionaryInfoPriority(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  function dictionaryAlias(record, fallback) {
    return typeof record.alias === "string" && record.alias ? record.alias : fallback;
  }
  function dictionaryInfoType(value) {
    return value === "terms" || value === "kanji" || value === "frequency" || value === "metadata" ? value : void 0;
  }
  function stringField(value) {
    return typeof value === "string" ? value : void 0;
  }
  function numberField(value) {
    return typeof value === "number" ? value : void 0;
  }
  function unwrapDexieRow(row) {
    if (row && typeof row === "object" && "$" in row) {
      const value = row.$;
      return Array.isArray(value) ? value.find((item) => item && typeof item === "object" && !Array.isArray(item)) : value;
    }
    return row;
  }
  function dexieRowRecord(row) {
    const candidate = unwrapDexieRow(row);
    return candidate && typeof candidate === "object" ? candidate : null;
  }
  const TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS = 12e3;
  const TERM_SEARCH_LEGACY_FALLBACK_MAX_MS = 140;
  const TERM_SEARCH_INDEX_CURSOR_MAX_ROWS = 8e3;
  const TERM_SEARCH_INDEX_CURSOR_MAX_MS = 180;
  function cursorScanLimitReached(visited, startedAt, maxRows, maxMs) {
    return positiveLimitReached(maxRows, visited) || positiveLimitReached(maxMs, performance.now() - startedAt);
  }
  function optionalCursorScanLimitReached(options, visited, startedAt) {
    return optionalLimitReached(options.maxRows, visited) || optionalLimitReached(options.maxMs, performance.now() - startedAt);
  }
  function positiveLimitReached(limit, value) {
    return limit > 0 && value >= limit;
  }
  function optionalLimitReached(limit, value) {
    return Boolean(limit && value >= limit);
  }
  function addRandomListTermToReservoir(entry, rank, seen, reservoir, limit, count) {
    if (!isRandomListTerm(entry, rank)) return count;
    return addUniqueTermToReservoir(entry, seen, reservoir, limit, count);
  }
  function addCommonTermToReservoir(entry, rank, seen, reservoir, limit, count) {
    if (!isCommonDictionaryTerm(entry, rank)) return count;
    return addUniqueTermToReservoir(entry, seen, reservoir, limit, count);
  }
  function addUniqueTermToReservoir(entry, seen, reservoir, limit, count) {
    const key = termExpressionReadingKey(entry);
    if (seen.has(key)) return count;
    seen.add(key);
    const nextCount = count + 1;
    if (reservoir.length < limit) {
      reservoir.push(entry);
      return nextCount;
    }
    const index = Math.floor(Math.random() * nextCount);
    if (index < limit) reservoir[index] = entry;
    return nextCount;
  }
  function isRandomListTerm(entry, rank) {
    if (!entry.expression) return false;
    if (!JAPANESE_RE.test(entry.expression)) return false;
    if (entry.expression.length > 6) return false;
    return dictionaryEnabled(entry.dictionary, rank);
  }
  function addTopFrequencyExpression(expressions, entry, maxRank, rank) {
    if (entry.mode !== "freq") return;
    if (!entry.expression) return;
    if (!dictionaryEnabled(entry.dictionary, rank)) return;
    const freq = extractFrequency(entry.data);
    if (freq === void 0) return;
    if (freq > maxRank) return;
    expressions.set(entry.expression, Math.min(freq, expressions.get(entry.expression) ?? Number.POSITIVE_INFINITY));
  }
  function addSimilarTermByKanjiCandidate(entries2, seen, entry, character, rank) {
    if (!entry.expression?.includes(character)) return;
    if (!dictionaryEnabled(entry.dictionary, rank)) return;
    addUniqueTermEntry(entries2, seen, entry);
  }
  function addUniqueTermEntry(entries2, seen, entry) {
    const key = termExpressionReadingKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    entries2.push(entry);
  }
  function termExpressionReadingKey(entry) {
    return `${entry.expression}
${entry.reading}`;
  }
  function glossaryIndexSearchOptions(options) {
    return {
      maxRows: options.glossaryIndexMaxRows ?? TERM_SEARCH_INDEX_CURSOR_MAX_ROWS,
      maxMs: options.glossaryIndexMaxMs ?? TERM_SEARCH_INDEX_CURSOR_MAX_MS
    };
  }
  function glossaryFallbackSearchOptions(options) {
    return {
      maxRows: options.glossaryFallbackMaxRows ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_ROWS,
      maxMs: options.glossaryFallbackMaxMs ?? TERM_SEARCH_LEGACY_FALLBACK_MAX_MS
    };
  }
  function glossaryCursorSearchExpired(options, visited, startedAt) {
    return Boolean(options.maxRows && visited >= options.maxRows || options.maxMs && performance.now() - startedAt >= options.maxMs);
  }
  function hasReadyEmptyGlossarySearchIndex(indexedCount, building) {
    return indexedCount > 0 && !building;
  }
  function shouldSkipGlossaryFallback(building, options) {
    return building && options.fallbackWhileIndexing === false;
  }
  function isCommonDictionaryTerm(entry, rank) {
    return isCommonDictionaryTermCandidate(entry, rank) && (hasCommonDictionaryTags(entry) || hasCommonDictionaryScore(entry));
  }
  function isCommonDictionaryTermCandidate(entry, rank) {
    return Boolean(entry.expression && JAPANESE_RE.test(entry.expression) && entry.expression.length <= 8 && dictionaryEnabled(entry.dictionary, rank));
  }
  function hasCommonDictionaryTags(entry) {
    return /\b(common|ichi1|news1|spec1|gai1|freq|popular)\b/.test(dictionaryTermTags(entry));
  }
  function dictionaryTermTags(entry) {
    return `${entry.definitionTags ?? ""} ${entry.termTags ?? ""} ${entry.rules ?? ""}`.toLowerCase();
  }
  function hasCommonDictionaryScore(entry) {
    return typeof entry.score === "number" && entry.score >= 5;
  }
  function formatUiTemplate$1(template, values) {
    return Object.entries(values).reduce((value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement), template);
  }
  function formatDexieImportProgress(text, imported, totalRows) {
    const importedCount = imported.toLocaleString();
    if (totalRows > 0) {
      return `${text("dictionaryImported")} ${importedCount} / ${totalRows.toLocaleString()} ${text("dictionaryRecords")}...`;
    }
    return `${text("dictionaryImported")} ${importedCount} ${text("dictionaryRecords")}...`;
  }
  function formatDexieStoreImportProgress(text, store, imported, tableTotal, totalImported, totalRows) {
    const importedCount = imported.toLocaleString();
    if (tableTotal > 0 && totalRows > 0) {
      return `${text("dictionaryImporting")} ${store}: ${importedCount} / ${tableTotal.toLocaleString()} ${text("dictionaryEntries")} (${totalImported.toLocaleString()} / ${totalRows.toLocaleString()} ${text("dictionaryTotal")})...`;
    }
    return `${text("dictionaryImporting")} ${store}: ${importedCount} ${text("dictionaryEntries")}...`;
  }
  const log$3 = Logger.scope("YomitanSettingsImport");
  const AUDIO_BOOLEAN_IMPORTS = [
    { sourceKey: "enabled", targetKey: "audioEnabled" },
    { sourceKey: "autoPlay", targetKey: "autoPlayAudio" },
    { sourceKey: "enableDefaultAudioSources", targetKey: "audioEnableDefaultSources" }
  ];
  const ANKI_BOOLEAN_IMPORTS = [
    { sourceKey: "enable", targetKey: "ankiEnabled" }
  ];
  function parseYomitanSettingsExport(value, language = "en") {
    const done = log$3.time("Yomitan settings export parse");
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) {
      done();
      log$3.warn("Yomitan settings export rejected", { reason: "missing-profile-options" });
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
    log$3.info("Yomitan settings import parsed", {
      hasAudioSources: Boolean(settings.audioSources?.length),
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
  function applyPositiveNumberSetting(settings, value, targetKey, min, max2) {
    if (hasPositiveNumber(value)) assignImportedSetting(settings, targetKey, clampNumber(value, min, max2));
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
  function clampNumber(value, min, max2) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max2, number)) : min;
  }
  const DB_NAME = "jpdb-popup-reader-yomitan";
  const DB_VERSION = 4;
  const DEXIE_IMPORT_BATCH_SIZE = 5e3;
  const DICTIONARY_DELETE_BATCH_SIZE = 5e3;
  const DEXIE_PROGRESS_INTERVAL = DEXIE_IMPORT_BATCH_SIZE;
  const STORE_WRITE_BATCH_SIZE = 1e3;
  const ZIP_IMPORT_FLUSH_ENTRY_LIMIT = 1e4;
  const HOT_LOOKUP_CACHE_TTL_MS = 2e3;
  const TOP_TERM_EXPRESSION_ENTRY_LIMIT = 500;
  const TERM_SEARCH_INDEX_BATCH_SIZE = 300;
  const TERM_SEARCH_INDEX_MAX_TOKENS_PER_TERM = 40;
  const TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH = 2;
  const TERM_SEARCH_INDEX_MIN_SUFFIX_LENGTH = 3;
  const TERM_SEARCH_PREFIX_BOUNDARY = String.fromCharCode(63743);
  const TERM_SEARCH_DEFAULT_CANDIDATE_LIMIT = 240;
  const RANDOM_TERM_LIST_MAX_ROWS = 2e4;
  const RANDOM_TERM_LIST_MAX_MS = 220;
  const RANDOM_TOP_TERM_LIST_MAX_ROWS = 3e4;
  const RANDOM_TOP_TERM_LIST_MAX_MS = 320;
  const TERM_KANJI_INDEX_BATCH_SIZE = 5e3;
  const TERM_KANJI_INDEX_FALLBACK_MAX_ROWS = 12e3;
  const TERM_KANJI_INDEX_FALLBACK_MAX_MS = 140;
  const DB_DELETE_BLOCKED_TIMEOUT_MS = 12e3;
  const DB_FACTORY_RESET_DELETE_TIMEOUT_MS = 2500;
  const log$2 = Logger.scope("Yomitan");
  let persistentStorageRequested = false;
  function requestPersistentDictionaryStorage() {
    if (persistentStorageRequested) return;
    persistentStorageRequested = true;
    try {
      void navigator.storage?.persist?.().then((granted) => {
        log$2.info("Persistent storage request", { granted });
      }).catch(() => void 0);
    } catch {
    }
  }
  class YomitanDictionaryStore {
    constructor(getCorsProxyUrl = () => "", getInterfaceLanguage = () => "en") {
      this.getCorsProxyUrl = getCorsProxyUrl;
      this.getInterfaceLanguage = getInterfaceLanguage;
    }
    dbPromise;
    dictionaryInfoPromise;
    summaryPromise;
    dictionaryStyleCssCache = /* @__PURE__ */ new Map();
    termSearchIndexPromise;
    termKanjiIndexPromise;
    termKanjiIndexReady = false;
    termIndexGeneration = 0;
    hotLookupCache = /* @__PURE__ */ new Map();
    text(key) {
      return uiText(this.getInterfaceLanguage(), key);
    }
    prepareTermSearchIndex() {
      if (this.termSearchIndexPromise) return this.termSearchIndexPromise;
      const promise = this.db().then((db) => this.ensureTermSearchIndex(db)).catch((error) => {
        log$2.warn("Term search index preparation failed", { error });
      }).finally(() => {
        if (this.termSearchIndexPromise === promise) this.termSearchIndexPromise = void 0;
      });
      this.termSearchIndexPromise = promise;
      return this.termSearchIndexPromise;
    }
    hotLookupCacheKey(kind, values, preferences) {
      return JSON.stringify([kind, ...values, normalizeDictionaryPreferences(preferences)]);
    }
    getHotLookup(key, factory) {
      const now = performance.now();
      const cached = this.hotLookupCache.get(key);
      if (cached && cached.expiresAt > now) return cached.promise;
      const entry = {
        expiresAt: Number.POSITIVE_INFINITY,
        promise: Promise.resolve().then(factory).then(
          (value) => {
            entry.expiresAt = performance.now() + HOT_LOOKUP_CACHE_TTL_MS;
            return value;
          },
          (error) => {
            if (this.hotLookupCache.get(key) === entry) this.hotLookupCache.delete(key);
            throw error;
          }
        )
      };
      this.hotLookupCache.set(key, entry);
      return entry.promise;
    }
    async lookup(expression, reading, limit, preferences = []) {
      return this.getHotLookup(
        this.hotLookupCacheKey("lookup", [expression, reading, limit], preferences),
        async () => {
          const done = log$2.time("Term lookup", { expression, reading, limit, dictionaries: preferences.length });
          try {
            const db = await this.db();
            const entries2 = await this.getTermLookupEntries(
              db,
              expression,
              reading && reading !== expression ? reading : "",
              Math.max(limit * 40, 500),
              Math.max(limit * 20, 250)
            );
            const rank = dictionaryRank(preferences);
            const seen = /* @__PURE__ */ new Set();
            const ranked = rankedDictionaryEntries(
              entries2,
              rank,
              void 0,
              (a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || Number(b.expression === expression) - Number(a.expression === expression) || Number(b.reading === reading) - Number(a.reading === reading) || (b.score ?? 0) - (a.score ?? 0)
            ).filter((entry) => {
              const key = termLookupDedupKey(entry);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return selectTermLookupResults(ranked, expression, reading, limit);
          } catch (error) {
            log$2.warn("Term lookup failed", { expression, reading, error });
            throw error;
          } finally {
            done();
          }
        }
      );
    }
    async searchTerms(query, limit, preferences = [], options = {}) {
      const normalizedQuery = normalizeTermSearchQuery(query);
      const done = log$2.time("Term search", { query: normalizedQuery, limit, dictionaries: preferences.length });
      if (!normalizedQuery) {
        done();
        return [];
      }
      try {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        const candidateLimit = options.candidateLimit ?? Math.max(limit * 24, TERM_SEARCH_DEFAULT_CANDIDATE_LIMIT);
        const [indexedEntries, glossaryCandidates] = await Promise.all([
          this.getIndexedTermSearchEntries(db, normalizedQuery, Math.max(limit * 12, 120)),
          shouldSearchTermGlossaries(normalizedQuery) ? this.getGlossaryTermSearchCandidates(db, normalizedQuery, candidateLimit, rank, options) : Promise.resolve([])
        ]);
        const candidates = [
          ...indexedEntries.map((entry) => ({ entry, rank: indexedTermSearchRank(entry, normalizedQuery) })),
          ...glossaryCandidates
        ];
        return rankedTermSearchResults(candidates, normalizedQuery, limit, rank);
      } catch (error) {
        log$2.warn("Term search failed", { query: normalizedQuery, error });
        throw error;
      } finally {
        done();
      }
    }
    async lookupKanji(text, limit, preferences = []) {
      return this.getHotLookup(
        this.hotLookupCacheKey("lookupKanji", [text, limit], preferences),
        async () => {
          const done = log$2.time("Kanji lookup", { length: text.length, limit, dictionaries: preferences.length });
          try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const characters = [...new Set(Array.from(text).filter(isKanji))];
            const entries2 = await this.getManyByIndex(db, "kanji", "character", characters, limit);
            const results = rankedDictionaryEntries(entries2, rank, limit);
            return results;
          } catch (error) {
            log$2.warn("Kanji lookup failed", { length: text.length, error });
            throw error;
          } finally {
            done();
          }
        }
      );
    }
    // NewTabController loads dictionary kanji through the injected store dependency.
    // fallow-ignore-next-line unused-class-member
    async listKanjiCharacters(limit, preferences = []) {
      const done = log$2.time("Kanji character list", { limit, dictionaries: preferences.length });
      try {
        if (limit <= 0) return [];
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        return await this.getKanjiCharacters(db, limit, rank);
      } catch (error) {
        log$2.warn("Kanji character list failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    async lookupTermMeta(expression, limit, preferences = []) {
      return this.getHotLookup(
        this.hotLookupCacheKey("lookupTermMeta", [expression, limit], preferences),
        async () => {
          const done = log$2.time("Term metadata lookup", { expression, limit, dictionaries: preferences.length });
          try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const entries2 = await this.getByIndex(db, "termMeta", "expression", expression, Math.max(limit * 8, 80));
            const results = entries2.filter((entry) => dictionaryEnabled(entry.dictionary, rank)).sort((a, b) => compareMetaEntries(a, b, rank)).slice(0, limit);
            return results;
          } catch (error) {
            log$2.warn("Term metadata lookup failed", { expression, error });
            throw error;
          } finally {
            done();
          }
        }
      );
    }
    async lookupSimilarTermsByKanji(character, limit, preferences = []) {
      return this.getHotLookup(
        this.hotLookupCacheKey("lookupSimilarTermsByKanji", [character, limit], preferences),
        async () => {
          const done = log$2.time("Similar terms by kanji lookup", { character, limit, dictionaries: preferences.length });
          try {
            const db = await this.db();
            const rank = dictionaryRank(preferences);
            const entries2 = await this.getSimilarTermEntriesByKanji(db, character, Math.max(limit * 8, 80), rank);
            const results = entries2.sort(
              (a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0) || a.expression.length - b.expression.length
            ).slice(0, limit);
            return results;
          } catch (error) {
            log$2.warn("Similar terms by kanji lookup failed", { character, error });
            throw error;
          } finally {
            done();
          }
        }
      );
    }
    async findTermMatches(text, limit = 32, preferences = []) {
      const done = log$2.time("Inline term match search", { length: text.length, limit, dictionaries: preferences.length });
      const source = text.slice(0, 240);
      if (!source.trim()) {
        done();
        return [];
      }
      const candidates = this.collectTermMatchCandidates(source);
      if (!candidates.size) {
        done();
        return [];
      }
      try {
        const matches = await this.lookupTermMatchCandidates(candidates, preferences);
        const results = nonOverlappingMatches(matches, limit);
        return results;
      } catch (error) {
        log$2.warn("Inline term match search failed", { length: source.length, candidates: candidates.size, error });
        throw error;
      } finally {
        done();
      }
    }
    collectTermMatchCandidates(source) {
      const candidates = /* @__PURE__ */ new Map();
      const maxLength = Math.min(18, source.length);
      for (let start = 0; start < source.length; start++) {
        if (!JAPANESE_RE.test(source[start])) continue;
        this.collectTermMatchCandidatesAt(source, start, maxLength, candidates);
      }
      return candidates;
    }
    collectTermMatchCandidatesAt(source, start, maxLength, candidates) {
      for (let length = Math.min(maxLength, source.length - start); length > 0; length--) {
        const surface = source.slice(start, start + length);
        if (!isSearchableJapaneseSurface(surface)) continue;
        this.addDeinflectedTermCandidates(surface, start, candidates);
      }
    }
    addDeinflectedTermCandidates(surface, start, candidates) {
      for (const deinflected of deinflectJapaneseTerm(surface)) {
        if (!JAPANESE_RE.test(deinflected.term)) continue;
        const positions = candidates.get(deinflected.term) ?? [];
        positions.push({ start, end: start + surface.length, surface, deinflected });
        candidates.set(deinflected.term, positions);
      }
    }
    async lookupTermMatchCandidates(candidates, preferences) {
      const db = await this.db();
      const rank = dictionaryRank(preferences);
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("terms", "readonly");
        const store = tx.objectStore("terms");
        const expressionIndex = store.index("expression");
        const readingIndex = store.index("reading");
        const results = [];
        const expressions = sortedTermMatchExpressions(candidates);
        let pending = expressions.length * 2;
        const finish = () => {
          if (--pending <= 0) resolve(results);
        };
        const addMatches = (expression, foundEntries) => {
          results.push(...termMatchesForEntries(expression, foundEntries, candidates, rank));
        };
        for (const expression of expressions) {
          requestTermMatchIndex(expressionIndex, expression, addMatches, finish, reject);
          requestTermMatchIndex(readingIndex, expression, addMatches, finish, reject);
        }
        tx.onerror = () => reject(tx.error);
      });
    }
    async summary() {
      const done = log$2.time("Dictionary summary");
      try {
        if (this.summaryPromise) {
          const summary2 = await this.summaryPromise;
          return summary2;
        }
        const db = await this.db();
        this.summaryPromise = Promise.all([
          this.getAllDictionaryInfo(db),
          this.countStore(db, "terms"),
          this.countStore(db, "kanji"),
          this.countStore(db, "termMeta"),
          this.countStore(db, "kanjiMeta")
        ]).then(([dictionaries, terms, kanji, termMeta, kanjiMeta]) => ({ dictionaries, terms, kanji, termMeta, kanjiMeta })).catch((error) => {
          this.summaryPromise = void 0;
          throw error;
        });
        const summary = await this.summaryPromise;
        return summary;
      } catch (error) {
        log$2.warn("Dictionary summary failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    async countEntries() {
      const summary = await this.summary();
      return summary.terms + summary.kanji + summary.termMeta + summary.kanjiMeta;
    }
    // NewTabController checks local dictionary availability through this injected store.
    // fallow-ignore-next-line unused-class-member
    async hasDictionaries() {
      const done = log$2.time("Dictionary presence check");
      try {
        const db = await this.db();
        return (await this.getAllDictionaryInfo(db)).length > 0;
      } catch (error) {
        log$2.warn("Dictionary presence check failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    // Lookup parsing checks term dictionary availability through this injected store.
    // fallow-ignore-next-line unused-class-member
    async hasTermDictionaries() {
      const done = log$2.time("Term dictionary presence check");
      try {
        const db = await this.db();
        return (await this.getAllDictionaryInfo(db)).some(hasTermDictionaryRows);
      } catch (error) {
        log$2.warn("Term dictionary presence check failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    // Pitch enrichment checks local pitch-dictionary availability through this
    // injected store; pitch banks (e.g. Kanjium) are termMeta rows with
    // mode 'pitch', so sampling the head of each meta dictionary is enough.
    // fallow-ignore-next-line unused-class-member
    async hasPitchMetaDictionaries() {
      const done = log$2.time("Pitch dictionary presence check");
      try {
        const db = await this.db();
        const metaDictionaries = (await this.getAllDictionaryInfo(db)).filter((info) => Number(info.counts?.termMeta ?? 0) > 0).map((info) => info.title);
        for (const dictionary of metaDictionaries) {
          const rows = await this.getByIndex(db, "termMeta", "dictionary", dictionary, 40);
          if (rows.some((row) => row.mode === "pitch")) return true;
        }
        return false;
      } catch (error) {
        log$2.warn("Pitch dictionary presence check failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    async listRandomTerms(limit, preferences = [], options = {}) {
      const done = log$2.time("Random term listing", { limit, dictionaries: preferences.length });
      try {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        return await this.collectRandomTermReservoir(db, limit, rank, options, addRandomListTermToReservoir);
      } catch (error) {
        log$2.warn("Random term listing failed", { limit, error });
        return [];
      } finally {
        done();
      }
    }
    async listRandomTopTerms(limit, maxRank, preferences = [], options = {}) {
      const done = log$2.time("Random top term listing", { limit, maxRank, dictionaries: preferences.length });
      try {
        const db = await this.db();
        const rank = dictionaryRank(preferences);
        const topTerms = await this.collectTopFrequencyTerms(db, maxRank, rank, {
          maxRows: options.maxRows ?? RANDOM_TOP_TERM_LIST_MAX_ROWS,
          maxMs: options.maxMs ?? RANDOM_TOP_TERM_LIST_MAX_MS
        });
        const results = await this.randomTopTermResults(db, topTerms, limit, rank, preferences, options);
        if (options.fallbackToRandom !== false && this.shouldFallbackToRandomTerms(topTerms, results)) {
          return await this.listRandomTerms(limit, preferences, {
            maxRows: options.fallbackMaxRows,
            maxMs: options.fallbackMaxMs
          });
        }
        return results;
      } catch (error) {
        log$2.warn("Random top term listing failed", { limit, error });
        return [];
      } finally {
        done();
      }
    }
    async randomTopTermResults(db, topTerms, limit, rank, preferences, options) {
      return topTerms.size ? await this.entriesForRandomExpressions(db, topTerms, limit, preferences) : await this.listRandomCommonTerms(db, limit, rank, {
        maxRows: options.fallbackMaxRows,
        maxMs: options.fallbackMaxMs
      });
    }
    shouldFallbackToRandomTerms(topTerms, results) {
      return !topTerms.size && !results.length;
    }
    async collectTopFrequencyTerms(db, maxRank, rank, options = {}) {
      const expressions = /* @__PURE__ */ new Map();
      const maxRows = options.maxRows ?? RANDOM_TOP_TERM_LIST_MAX_ROWS;
      const maxMs = options.maxMs ?? RANDOM_TOP_TERM_LIST_MAX_MS;
      await scanObjectStoreCursor(
        db,
        { storeName: "termMeta", maxRows, maxMs, errorMessage: "Could not list dictionary term meta." },
        (entry) => {
          addTopFrequencyExpression(expressions, entry, maxRank, rank);
        }
      );
      return expressions;
    }
    async entriesForRandomExpressions(db, expressions, limit, preferences) {
      const sampled = reservoirSample([...expressions.keys()], limit);
      const rank = dictionaryRank(preferences);
      const entriesByExpression = await this.getEntriesForExpressions(db, sampled, TOP_TERM_EXPRESSION_ENTRY_LIMIT);
      return sampled.flatMap((expression) => {
        const entry = bestTermLookupEntry(entriesByExpression.get(expression) ?? [], expression, rank);
        return entry ? [{ ...entry, jpdbFrequency: expressions.get(expression) }] : [];
      });
    }
    async getEntriesForExpressions(db, expressions, limit) {
      if (!expressions.length) return /* @__PURE__ */ new Map();
      return new Promise((resolve, reject) => {
        const results = /* @__PURE__ */ new Map();
        const tx = db.transaction("terms", "readonly");
        const index = tx.objectStore("terms").index("expression");
        let pending = expressions.length;
        const finish = () => {
          if (--pending <= 0) resolve(results);
        };
        const fail = (error) => reject(error ?? new Error("Could not load top dictionary terms."));
        for (const expression of expressions) {
          readIndexRequestValues(
            index,
            IDBKeyRange.only(expression),
            limit,
            (entries2) => {
              results.set(expression, entries2);
              finish();
            },
            fail
          );
        }
        tx.onerror = () => fail(tx.error);
      });
    }
    async listRandomCommonTerms(db, limit, rank, options = {}) {
      return await this.collectRandomTermReservoir(db, limit, rank, options, addCommonTermToReservoir);
    }
    async collectRandomTermReservoir(db, limit, rank, options, addTerm) {
      const reservoir = [];
      const seen = /* @__PURE__ */ new Set();
      const maxRows = options.maxRows ?? RANDOM_TERM_LIST_MAX_ROWS;
      const maxMs = options.maxMs ?? RANDOM_TERM_LIST_MAX_MS;
      let count = 0;
      await scanObjectStoreCursor(
        db,
        { storeName: "terms", maxRows, maxMs, errorMessage: "Could not list dictionary terms." },
        (entry) => {
          count = addTerm(entry, rank, seen, reservoir, limit, count);
        }
      );
      return reservoir;
    }
    async importFile(file, onProgress, sourceUrl = "") {
      const done = log$2.time("Dictionary file import", fileSummary(file, sourceUrl));
      try {
        log$2.info("Dictionary file import started", fileSummary(file, sourceUrl));
        requestPersistentDictionaryStorage();
        const summary = /\.zip$/i.test(file.name) ? await this.importZip(file, onProgress, sourceUrl) : await this.importJson(file, onProgress);
        log$2.info("Dictionary file import completed", summary);
        return summary;
      } catch (error) {
        log$2.warn("Dictionary file import failed", { ...fileSummary(file, sourceUrl), error });
        throw error;
      } finally {
        done();
      }
    }
    async importFromUrl(url, filename = filenameFromUrl(url), onProgress) {
      log$2.info("Dictionary URL import started", { filename, host: safeHost(url) });
      onProgress?.(`${this.text("dictionaryDownloading")}: ${filename}...`);
      const blob = await requestBlob(url, this.getCorsProxyUrl(), onProgress, this.getInterfaceLanguage());
      const file = namedBlobFile(blob, filename, blob.type || "application/zip");
      const summary = await this.importFile(file, onProgress, url);
      log$2.info("Dictionary URL import completed", { filename, host: safeHost(url), ...summary });
      return summary;
    }
    async importZip(file, onProgress, sourceUrl = "") {
      const language = this.getInterfaceLanguage();
      onProgress?.(`${this.text("dictionaryReadingZip")} ${formatBytes(file.size)}...`);
      const zip = await readZipArchive(file, (progress) => {
        if (progress.phase === "read") {
          onProgress?.(`${this.text("dictionaryReadingZip")} ${formatPercent(progress.loaded, progress.total)} (${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})...`);
          return;
        }
        onProgress?.(`${this.text("dictionaryReadingZip")} ${progress.entries?.toLocaleString() ?? "0"} files found. ${uiText(language, "dictionaryCheckingIndex")}`);
      });
      const zipEntries = zip.entries();
      onProgress?.(`${this.text("dictionaryReadingZip")} ${zipEntries.length.toLocaleString()} files found. ${uiText(language, "dictionaryCheckingIndex")}`);
      const index = await readYomitanZipIndex(zip, this.getInterfaceLanguage());
      const dictionary = yomitanZipDictionaryName(index, file.name);
      const version = yomitanZipVersion(index);
      const bankCount = countYomitanZipBanks(zipEntries);
      onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${formatUiTemplate$1(uiText(language, "dictionaryBanksFound"), {
        count: bankCount.toLocaleString(),
        plural: bankCount === 1 ? "" : "s"
      })}`);
      onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionaryRemovingExisting")}...`);
      await this.deleteDictionariesWithSameIdentity(dictionary);
      onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: preparing storage...`);
      const db = await this.db();
      const info = await yomitanZipDictionaryInfo(zip, index, dictionary, sourceUrl);
      const summary = { dictionaries: [dictionary], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      let clearedTermIndexesForImport = false;
      let importedTerms = false;
      const importBank = async (pattern, label, store, normalize) => {
        const files = zip.entries().filter((entry) => pattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
        let pending = [];
        let saved = 0;
        const flush = async () => {
          if (!pending.length) return;
          if (store === "terms" && !clearedTermIndexesForImport) {
            await this.clearDerivedTermIndexes(db);
            clearedTermIndexesForImport = true;
          }
          const entries2 = pending;
          const parsed = summary[label];
          pending = [];
          onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionarySavingBank")} ${label} ${saved.toLocaleString()} / ${parsed.toLocaleString()} ${this.text("dictionaryEntries")}...`);
          await this.addToStore(store, entries2, false, store !== "terms", (written) => {
            onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionarySavingBank")} ${label} ${(saved + written).toLocaleString()} / ${parsed.toLocaleString()} ${this.text("dictionaryEntries")}...`);
          });
          saved += entries2.length;
          if (store === "terms") importedTerms = true;
        };
        for (const [index2, bankFile] of files.entries()) {
          onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionaryReadingBank")} ${bankFile.name} (${index2 + 1}/${files.length}, ${formatBytes(bankFile.uncompressedSize)})...`);
          const bankText = await zip.text(bankFile.name, (progress) => {
            if (progress.loaded <= 0) return;
            onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionaryReadingBank")} ${bankFile.name} (${index2 + 1}/${files.length}, ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)})...`);
          });
          onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${uiText(language, "dictionaryParsingBank")} ${bankFile.name} (${index2 + 1}/${files.length})...`);
          const rows = JSON.parse(bankText);
          for (const row of rows) {
            const entry = normalize(row);
            if (!entry) continue;
            if (store === "terms") await inlineStructuredImageDataUrls(zip, entry.glossary);
            pending.push(entry);
            summary[label]++;
            summary.entries++;
            if (pending.length >= ZIP_IMPORT_FLUSH_ENTRY_LIMIT) await flush();
          }
          await flush();
        }
        await flush();
        if (files.length) {
          onProgress?.(`${this.text("dictionaryImporting")} ${dictionary}: ${label} ${saved.toLocaleString()} ${this.text("dictionaryEntries")} saved...`);
        }
      };
      await importBank(/^term_bank_\d+\.json$/i, "terms", "terms", (row) => normalizeZipTermRow(row, dictionary));
      await importBank(/^kanji_bank_\d+\.json$/i, "kanji", "kanji", (row) => normalizeZipKanjiRow(row, dictionary, version));
      await importBank(/^term_meta_bank_\d+\.json$/i, "termMeta", "termMeta", (row) => normalizeZipTermMetaRow(row, dictionary));
      await importBank(/^kanji_meta_bank_\d+\.json$/i, "kanjiMeta", "kanjiMeta", (row) => normalizeZipKanjiMetaRow(row, dictionary));
      if (summary.entries === 0) throw new Error(this.text("dictionaryNoSupportedBanks"));
      if (importedTerms) await this.clearDerivedTermIndexes(db);
      info.counts = dictionaryCountsFromSummary(summary);
      info.type = dictionaryTypeFromCounts(info.counts);
      summary.dictionaryTypes = { [dictionary]: info.type };
      await this.putDictionaryInfo(info);
      log$2.info("ZIP dictionary import parsed", summary);
      return summary;
    }
    async importJson(file, onProgress) {
      const head = await readBlobText(file.slice(0, 4096));
      if (head.includes('"formatName":"dexie"') || head.includes('"formatName": "dexie"')) {
        return this.importDexieJson(file, onProgress);
      }
      const json = JSON.parse(await readBlobText(file));
      if (isReaderDictionaryExport(json)) {
        return this.importReaderJson(json);
      }
      throw new Error(this.text("dictionaryUnsupportedJson"));
    }
    async importReaderJson(json) {
      await this.clear();
      const terms = readerExportTerms(json);
      const dictionaryTypes = dictionaryTypesFromReaderExport(json);
      const dictionaryNames = readerExportDictionaryNames(json, terms);
      const dictionaries = readerExportDictionaryInfo(json, dictionaryNames, dictionaryTypes);
      await Promise.all([
        this.addToStore("dictionaryInfo", dictionaries, true),
        this.addToStore("terms", terms, false, false),
        this.addToStore("kanji", json.kanji ?? []),
        this.addToStore("termMeta", json.termMeta ?? []),
        this.addToStore("kanjiMeta", json.kanjiMeta ?? [])
      ]);
      const summary = readerExportSummary(json, terms, dictionaryNames, dictionaryTypes);
      log$2.info("JSON dictionary import parsed", summary);
      return summary;
    }
    async importDexieJson(file, onProgress) {
      onProgress?.("Streaming Yomitan dictionary export...");
      await this.clear();
      const rowCounts = await readDexieTableRowCounts(file).catch(() => ({}));
      const totalRows = importEntryStores().reduce((total, store) => total + (rowCounts[store] ?? 0), 0);
      if (totalRows > 0) onProgress?.(`${this.text("dictionaryPreparingImport")} ${totalRows.toLocaleString()} ${this.text("dictionaryRecords")}...`);
      const dictionaries = /* @__PURE__ */ new Set();
      const dictionaryInfo = /* @__PURE__ */ new Map();
      const dictionaryCounts = /* @__PURE__ */ new Map();
      const summary = { dictionaries: [], dictionaryTypes: {}, entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      const batches = { terms: [], kanji: [], termMeta: [], kanjiMeta: [] };
      const progressAt = { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      const emitProgress = (message) => {
        onProgress?.(message);
      };
      const reportProgress = (store, force = false) => {
        if (!store) {
          emitProgress(formatDexieImportProgress(this.text.bind(this), summary.entries, totalRows));
          return;
        }
        const imported = summary[store];
        const tableTotal = rowCounts[store] ?? 0;
        if (!force && imported < progressAt[store]) return;
        progressAt[store] = imported + DEXIE_PROGRESS_INTERVAL;
        emitProgress(formatDexieStoreImportProgress(this.text.bind(this), store, imported, tableTotal, summary.entries, totalRows));
      };
      const flush = async (store, forceProgress = false) => {
        const batch = batches[store];
        if (!batch.length) return;
        await this.addToStore(store, batch, false, store !== "terms");
        batches[store] = [];
        reportProgress(store, forceProgress);
      };
      const addBatch = async (store, entry) => {
        batches[store].push(entry);
        summary[store]++;
        summary.entries++;
        const dictionary = entry.dictionary;
        if (typeof dictionary === "string") {
          dictionaries.add(dictionary);
          const counts = dictionaryCounts.get(dictionary) ?? {};
          counts[store] = (counts[store] ?? 0) + 1;
          dictionaryCounts.set(dictionary, counts);
        }
        if (batches[store].length >= DEXIE_IMPORT_BATCH_SIZE) {
          await flush(store);
        }
      };
      await streamDexieTables(file, {
        dictionaries: async (row) => {
          const info = normalizeDexieDictionaryRow(row);
          if (!info) return;
          dictionaries.add(info.title);
          dictionaryInfo.set(info.title, info);
        },
        terms: async (row) => {
          const entry = normalizeDexieTermRow(row);
          if (entry) await addBatch("terms", entry);
        },
        kanji: async (row) => {
          const entry = normalizeDexieKanjiRow(row);
          if (entry) await addBatch("kanji", entry);
        },
        termMeta: async (row) => {
          const entry = normalizeDexieTermMetaRow(row);
          if (entry) await addBatch("termMeta", entry);
        },
        kanjiMeta: async (row) => {
          const entry = normalizeDexieKanjiMetaRow(row);
          if (entry) await addBatch("kanjiMeta", entry);
        }
      }, (table) => {
        if (isEntryStoreName(table)) {
          reportProgress(table, true);
          return;
        }
        onProgress?.(`${this.text("dictionaryImporting")} Yomitan ${table}...`);
      });
      await Promise.all(importEntryStores().map((store) => flush(store, true)));
      reportProgress(void 0, true);
      summary.dictionaries = [...dictionaries];
      summary.dictionaryTypes = {};
      await Promise.all(summary.dictionaries.map((dictionary) => {
        const counts = dictionaryCounts.get(dictionary) ?? {};
        const info = dictionaryInfo.get(dictionary) ?? {
          title: dictionary,
          alias: dictionary,
          enabled: true,
          priority: dictionaryInfo.size,
          importDate: Date.now()
        };
        info.counts = { ...info.counts ?? {}, ...counts };
        info.type = dictionaryTypeFromCounts(info.counts);
        summary.dictionaryTypes[dictionary] = info.type;
        return this.putDictionaryInfo(info);
      }));
      log$2.info("Dexie dictionary import parsed", summary);
      return summary;
    }
    // SettingsDialogController exports dictionaries through the injected store dependency.
    // fallow-ignore-next-line unused-class-member
    async exportJson() {
      const done = log$2.time("Dictionary export");
      try {
        const db = await this.db();
        const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
          this.getAllFromStore(db, "dictionaryInfo"),
          this.getAllFromStore(db, "terms"),
          this.getAllFromStore(db, "kanji"),
          this.getAllFromStore(db, "termMeta"),
          this.getAllFromStore(db, "kanjiMeta")
        ]);
        log$2.info("Dictionary export prepared", {
          dictionaries: dictionaries.length,
          terms: terms.length,
          kanji: kanji.length,
          termMeta: termMeta.length,
          kanjiMeta: kanjiMeta.length
        });
        return new Blob([JSON.stringify({
          formatName: "yomu-yomitan-dictionaries",
          formatVersion: 2,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          dictionaries,
          terms,
          kanji,
          termMeta,
          kanjiMeta
        })], { type: "application/json" });
      } catch (error) {
        log$2.warn("Dictionary export failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    async dictionaryStyleCss(preferences = []) {
      try {
        const cacheKey = JSON.stringify(normalizeDictionaryPreferences(preferences));
        const cached = this.dictionaryStyleCssCache.get(cacheKey);
        if (cached !== void 0) {
          return cached;
        }
        const db = await this.db();
        const dictionaries = await this.getAllDictionaryInfo(db);
        const css = renderDictionaryScopedStyles(dictionaries, preferences);
        this.dictionaryStyleCssCache.set(cacheKey, css);
        return css;
      } catch (error) {
        log$2.warn("Dictionary stylesheet render failed", { error });
        throw error;
      }
    }
    async clear() {
      const done = log$2.time("Dictionary store clear");
      try {
        const db = await this.db();
        await this.clearDictionaryStores(db);
        this.invalidateCaches();
        log$2.info("Dictionary store cleared");
      } catch (error) {
        log$2.warn("Dictionary store clear failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    async resetDatabase(options = {}) {
      const done = log$2.time("Dictionary database factory reset");
      let cleared = false;
      try {
        await this.clear();
        cleared = true;
        await this.deleteDatabase({ timeoutMs: options.deleteTimeoutMs ?? DB_FACTORY_RESET_DELETE_TIMEOUT_MS });
        return { cleared, deleted: true };
      } catch (error) {
        if (!cleared) {
          log$2.warn("Dictionary reset pre-clear failed", { error });
          throw error;
        }
        log$2.warn("Dictionary delete incomplete after clear", { error });
        return { cleared, deleted: false };
      } finally {
        done();
      }
    }
    async invalidateForFactoryReset() {
      const dbPromise = this.dbPromise;
      this.dbPromise = void 0;
      this.invalidateCaches();
      if (!dbPromise) return;
      try {
        const db = await dbPromise;
        db.close();
        log$2.info("Dictionary DB closed for reset", { name: DB_NAME });
      } catch {
      }
    }
    async deleteDatabase(options = {}) {
      const done = log$2.time("Dictionary database delete");
      try {
        const timeoutMs = options.timeoutMs ?? DB_DELETE_BLOCKED_TIMEOUT_MS;
        const db = this.dbPromise ? await this.dbPromise.catch(() => void 0) : void 0;
        db?.close();
        this.dbPromise = void 0;
        this.invalidateCaches();
        await new Promise((resolve, reject) => {
          let blocked = false;
          let settled = false;
          const timeout = globalThis.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(blocked ? "Dictionary database reset is still waiting on another open Yomu tab. Reload the other Yomu tabs, then try again." : "Dictionary database reset timed out."));
          }, timeoutMs);
          const settle = (callback) => {
            if (settled) return;
            settled = true;
            globalThis.clearTimeout(timeout);
            callback();
          };
          const request = indexedDB.deleteDatabase(DB_NAME);
          request.onsuccess = () => settle(resolve);
          request.onerror = () => settle(() => reject(request.error ?? new Error("Dictionary database reset failed.")));
          request.onblocked = () => {
            blocked = true;
            log$2.warn("Dictionary delete blocked by another tab", { name: DB_NAME });
          };
        });
        log$2.info("Dictionary database deleted", { name: DB_NAME });
      } catch (error) {
        log$2.warn("Dictionary database delete failed", { error });
        throw error;
      } finally {
        done();
      }
    }
    // Delete every installed dictionary that is the SAME dictionary as the
    // incoming one under revision-stripped identity (plus the exact title).
    // Re-importing "Jitendex.org [2026-06-06]" must replace the installed
    // "Jitendex.org [2026-05-05]" instead of accreting a second copy whose
    // duplicate term rows double every lookup's index scans.
    async deleteDictionariesWithSameIdentity(dictionary) {
      const identity = yomitanDictionaryIdentity(dictionary);
      let stale = [];
      try {
        const db = await this.db();
        const installed = await this.getAllDictionaryInfo(db);
        stale = installed.map((info) => info.title).filter((title) => title === dictionary || yomitanDictionaryIdentity(title) === identity);
      } catch {
        stale = [dictionary];
      }
      if (!stale.includes(dictionary)) stale.push(dictionary);
      for (const title of stale) await this.deleteDictionary(title);
    }
    async deleteDictionary(dictionary) {
      const done = log$2.time("Dictionary delete", { dictionary });
      try {
        const db = await this.db();
        const dictionaries = await this.getAllDictionaryInfo(db);
        if (!dictionaries.some((item) => item.title === dictionary)) {
          log$2.info("Dictionary delete skipped; not installed", { dictionary });
          return;
        }
        if (dictionaries.length === 1) {
          await this.clearDictionaryStores(db);
          this.invalidateCaches();
          log$2.info("Only installed dictionary cleared", { dictionary });
          return;
        }
        const stores = existingStores(db, ["terms", "kanji", "termMeta", "kanjiMeta"]);
        for (const store of stores) {
          await deleteByDictionary(db, store, dictionary);
        }
        await new Promise((resolve, reject) => {
          const tx = db.transaction("dictionaryInfo", "readwrite");
          tx.objectStore("dictionaryInfo").delete(dictionary);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(transactionError(tx, `Could not remove ${dictionary} from dictionary metadata.`));
          tx.onabort = () => reject(transactionError(tx, `Could not remove ${dictionary} from dictionary metadata.`));
        });
        await this.clearDerivedTermIndexes(db);
        this.invalidateCaches();
        log$2.info("Dictionary deleted", { dictionary });
      } catch (error) {
        log$2.warn("Dictionary delete failed", { dictionary, error });
        throw error;
      } finally {
        done();
      }
    }
    async putDictionaryInfo(info) {
      await this.addToStore("dictionaryInfo", [info], true);
    }
    async clearDictionaryStores(db) {
      this.termIndexGeneration++;
      await clearStores(db, existingStores(db, ["terms", "kanji", "termMeta", "kanjiMeta", "dictionaryInfo", "termSearch", "termKanji"]));
      this.termKanjiIndexReady = false;
    }
    async addToStore(storeName, entries2, put = false, clearTermIndexes = true, onChunk) {
      if (!entries2.length) return;
      const db = await this.db();
      if (storeName === "terms" && clearTermIndexes) await this.clearDerivedTermIndexes(db);
      let written = 0;
      for (let start = 0; start < entries2.length; start += STORE_WRITE_BATCH_SIZE) {
        const chunk = entries2.slice(start, start + STORE_WRITE_BATCH_SIZE);
        await this.addStoreChunk(db, storeName, chunk, put);
        written += chunk.length;
        onChunk?.(written, entries2.length);
        await nextTask();
      }
    }
    addStoreChunk(db, storeName, entries2, put) {
      return new Promise((resolve, reject) => {
        const tx = readwriteTransaction(db, storeName);
        const store = tx.objectStore(storeName);
        for (const entry of entries2) {
          put ? store.put(entry) : store.add(entry);
        }
        tx.oncomplete = () => {
          this.invalidateCaches();
          resolve();
        };
        tx.onerror = () => reject(transactionError(tx, `Could not add entries to ${storeName}.`));
        tx.onabort = () => reject(transactionError(tx, `Could not add entries to ${storeName}.`));
        commitTransaction(tx);
      });
    }
    async getByIndex(db, storeName, indexName, value, limit) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const index = tx.objectStore(storeName).index(indexName);
        readIndexRequestValues(index, IDBKeyRange.only(value), limit, resolve, reject);
      });
    }
    async getManyByIndex(db, storeName, indexName, values, limit) {
      if (!values.length) return [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const index = tx.objectStore(storeName).index(indexName);
        const results = [];
        let pending = values.length;
        const finish = () => {
          if (--pending <= 0) resolve(results);
        };
        const fail = (error) => reject(error ?? new Error(`Could not read ${storeName} entries.`));
        for (const value of values) {
          readIndexRequestValues(
            index,
            IDBKeyRange.only(value),
            limit,
            (entries2) => {
              results.push(...entries2);
              finish();
            },
            fail
          );
        }
        tx.onerror = () => fail(tx.error);
      });
    }
    async getTermLookupEntries(db, expression, reading, expressionLimit, readingLimit) {
      const queries = [
        { indexName: "expression", range: IDBKeyRange.only(expression), limit: expressionLimit },
        ...reading ? [{ indexName: "reading", range: IDBKeyRange.only(reading), limit: readingLimit }] : []
      ];
      return this.getTermIndexEntries(db, queries);
    }
    async getSimilarTermEntriesByKanji(db, character, candidateLimit, rank) {
      if (hasStore(db, "termKanji")) {
        await this.ensureTermKanjiIndex(db);
        return this.getTermKanjiIndexEntries(db, character, candidateLimit, rank);
      }
      return this.getSimilarTermCursorEntries(db, character, candidateLimit, rank, {
        maxRows: TERM_KANJI_INDEX_FALLBACK_MAX_ROWS,
        maxMs: TERM_KANJI_INDEX_FALLBACK_MAX_MS
      });
    }
    async getTermKanjiIndexEntries(db, character, candidateLimit, rank) {
      return new Promise((resolve, reject) => {
        const entries2 = [];
        const seen = /* @__PURE__ */ new Set();
        const request = db.transaction("termKanji", "readonly").objectStore("termKanji").index("character").openCursor(IDBKeyRange.only(character));
        request.onerror = () => reject(request.error ?? new Error("Could not search local dictionary kanji index."));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || entries2.length >= candidateLimit) {
            resolve(entries2);
            return;
          }
          const row = cursor.value;
          if (dictionaryEnabled(row.dictionary, rank)) {
            const entry = termEntryFromKanjiEntry(row);
            const key = `${entry.expression}
${entry.reading}`;
            if (!seen.has(key)) {
              seen.add(key);
              entries2.push(entry);
            }
          }
          cursor.continue();
        };
      });
    }
    async getSimilarTermCursorEntries(db, character, candidateLimit, rank, options = {}) {
      return new Promise((resolve, reject) => {
        const entries2 = [];
        const seen = /* @__PURE__ */ new Set();
        const startedAt = performance.now();
        let visited = 0;
        const request = db.transaction("terms", "readonly").objectStore("terms").openCursor();
        request.onerror = () => reject(request.error ?? new Error("Could not search local dictionaries."));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || entries2.length >= candidateLimit) {
            resolve(entries2);
            return;
          }
          if (optionalCursorScanLimitReached(options, visited, startedAt)) {
            resolve(entries2);
            return;
          }
          visited++;
          const entry = cursor.value;
          addSimilarTermByKanjiCandidate(entries2, seen, entry, character, rank);
          cursor.continue();
        };
      });
    }
    async getIndexedTermSearchEntries(db, query, limit) {
      return this.getTermIndexEntries(db, [
        { indexName: "expression", range: IDBKeyRange.only(query), limit },
        { indexName: "reading", range: IDBKeyRange.only(query), limit },
        { indexName: "expression", range: termSearchPrefixRange(query), limit },
        { indexName: "reading", range: termSearchPrefixRange(query), limit }
      ]);
    }
    async getTermIndexEntries(db, queries) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("terms", "readonly");
        const store = tx.objectStore("terms");
        const entries2 = [];
        let pending = queries.length;
        const finish = () => {
          if (--pending <= 0) resolve(entries2);
        };
        const fail = (error) => reject(error ?? new Error("Could not search local dictionary terms."));
        for (const item of queries) {
          readIndexRequestValues(
            store.index(item.indexName),
            item.range,
            item.limit,
            (found) => {
              entries2.push(...found);
              finish();
            },
            fail
          );
        }
        tx.onerror = () => fail(tx.error);
      });
    }
    async getGlossaryTermSearchCandidates(db, query, candidateLimit, rank, options = {}) {
      if (!hasStore(db, "termSearch")) {
        return this.getGlossaryTermCursorSearchCandidates(db, query, candidateLimit, rank);
      }
      return this.getGlossaryTermSearchCandidatesWithIndex(db, query, candidateLimit, rank, options);
    }
    async getGlossaryTermSearchCandidatesWithIndex(db, query, candidateLimit, rank, options) {
      const indexed = await this.getGlossaryTermSearchIndexCandidates(db, query, candidateLimit, rank, glossaryIndexSearchOptions(options));
      if (indexed.length) return indexed;
      const building = Boolean(this.termSearchIndexPromise);
      const indexedCount = await this.countStore(db, "termSearch");
      if (hasReadyEmptyGlossarySearchIndex(indexedCount, building)) return indexed;
      this.prepareTermSearchIndexIfIdle(building, options);
      if (shouldSkipGlossaryFallback(building, options)) return indexed;
      return this.getGlossaryTermCursorSearchCandidates(db, query, candidateLimit, rank, glossaryFallbackSearchOptions(options));
    }
    prepareTermSearchIndexIfIdle(building, options) {
      if (building) return;
      if (options.prepareIndex === false) return;
      void this.prepareTermSearchIndex();
    }
    async getGlossaryTermCursorSearchCandidates(db, query, candidateLimit, rank, options = {}) {
      const request = db.transaction("terms", "readonly").objectStore("terms").openCursor();
      return this.collectGlossaryTermSearchCandidates(
        request,
        query,
        candidateLimit,
        rank,
        options,
        "Could not search local dictionary glossaries.",
        (entry) => {
          trimTermSearchCandidates(entry.candidates, candidateLimit, query, rank);
        },
        false
      );
    }
    async getGlossaryTermSearchIndexCandidates(db, query, candidateLimit, rank, options = {}) {
      const token = termSearchIndexToken(query);
      if (!token) return [];
      const request = db.transaction("termSearch", "readonly").objectStore("termSearch").index("token").openCursor(termSearchPrefixRange(token));
      return this.collectGlossaryTermSearchCandidates(
        request,
        query,
        candidateLimit,
        rank,
        options,
        "Could not search local dictionary glossary index.",
        void 0,
        true,
        (entry) => termEntryFromSearchEntry(entry)
      );
    }
    async collectGlossaryTermSearchCandidates(request, query, candidateLimit, rank, options, errorMessage2, afterPush, stopAtCandidateLimit = true, entryFromCursorValue = (entry) => entry) {
      return new Promise((resolve, reject) => {
        const candidates = [];
        const startedAt = performance.now();
        let visited = 0;
        request.onerror = () => reject(request.error ?? new Error(errorMessage2));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || stopAtCandidateLimit && candidates.length >= candidateLimit || glossaryCursorSearchExpired(options, visited, startedAt)) {
            resolve(candidates);
            return;
          }
          visited++;
          const entry = cursor.value;
          if (dictionaryEnabled(entry.dictionary, rank)) {
            const searchRank = glossaryTermSearchRank(entry.glossary, query);
            if (searchRank < Number.POSITIVE_INFINITY) {
              candidates.push({ entry: entryFromCursorValue(entry), rank: searchRank });
              afterPush?.({ candidates });
            }
          }
          cursor.continue();
        };
      });
    }
    async getAllDictionaryInfo(db) {
      this.dictionaryInfoPromise ??= this.getAllFromStore(db, "dictionaryInfo").then((items) => items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))).then((items) => {
        this.reconcileDuplicateDictionaryIdentities(items);
        return items;
      }).catch((error) => {
        this.dictionaryInfoPromise = void 0;
        throw error;
      });
      return this.dictionaryInfoPromise;
    }
    // Installs from before identity-keyed replacement can hold two revisions
    // of the same dictionary ("Jitendex.org [2026-05-05]" + "[2026-06-06]"),
    // doubling term rows and every lookup's index scans. Sweep once per
    // session: keep the newest import per identity, delete the rest in the
    // background (lookups keep working off the current stores meanwhile).
    duplicateIdentitySweepDone = false;
    reconcileDuplicateDictionaryIdentities(items) {
      if (this.duplicateIdentitySweepDone) return;
      this.duplicateIdentitySweepDone = true;
      const byIdentity = /* @__PURE__ */ new Map();
      for (const info of items) {
        const identity = yomitanDictionaryIdentity(info.title);
        byIdentity.set(identity, [...byIdentity.get(identity) ?? [], info]);
      }
      const stale = [];
      for (const group of byIdentity.values()) {
        if (group.length < 2) continue;
        const keep = [...group].sort((a, b) => (b.importDate ?? 0) - (a.importDate ?? 0))[0];
        for (const info of group) if (info !== keep) stale.push(info.title);
      }
      if (!stale.length) return;
      void (async () => {
        for (const title of stale) {
          try {
            await this.deleteDictionary(title);
            log$2.info("Removed duplicate dictionary revision", { title });
          } catch (error) {
            log$2.warn("Duplicate dictionary revision cleanup failed", { title, error });
          }
        }
      })();
    }
    async getAllFromStore(db, storeName) {
      return new Promise((resolve, reject) => {
        const results = [];
        const request = db.transaction(storeName, "readonly").objectStore(storeName).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
    async getKanjiCharacters(db, limit, rank) {
      return new Promise((resolve, reject) => {
        const characters = [];
        const seen = /* @__PURE__ */ new Set();
        const request = db.transaction("kanji", "readonly").objectStore("kanji").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || characters.length >= limit) {
            resolve(characters);
            return;
          }
          const entry = cursor.value;
          if (dictionaryEnabled(entry.dictionary, rank) && isKanji(entry.character) && !seen.has(entry.character)) {
            seen.add(entry.character);
            characters.push(entry.character);
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
    async ensureTermSearchIndex(db) {
      if (!hasStore(db, "termSearch")) return;
      const [terms, indexed] = await Promise.all([
        this.countStore(db, "terms"),
        this.countStore(db, "termSearch")
      ]);
      if (!terms || indexed) return;
      await this.rebuildTermSearchIndex(db);
    }
    async ensureTermKanjiIndex(db) {
      if (!hasStore(db, "termKanji") || this.termKanjiIndexReady) return;
      const [terms, indexed] = await Promise.all([
        this.countStore(db, "terms"),
        this.countStore(db, "termKanji")
      ]);
      if (!terms || indexed) {
        this.termKanjiIndexReady = true;
        return;
      }
      if (!this.termKanjiIndexPromise) {
        this.termKanjiIndexPromise = this.rebuildTermKanjiIndex(db).then(() => {
          this.termKanjiIndexReady = true;
        }).finally(() => {
          this.termKanjiIndexPromise = void 0;
        });
      }
      await this.termKanjiIndexPromise;
    }
    async rebuildTermSearchIndex(db) {
      const done = log$2.time("Term search index rebuild");
      const generation = this.termIndexGeneration;
      try {
        await this.clearTermSearchIndex(db);
        let indexedTerms = 0;
        let lastKey;
        for (; ; ) {
          if (generation !== this.termIndexGeneration) return;
          const chunk = await this.getTermSearchIndexSourceChunk(db, lastKey, TERM_SEARCH_INDEX_BATCH_SIZE);
          if (!chunk.terms.length) break;
          if (generation !== this.termIndexGeneration) return;
          await this.addTermSearchIndexChunk(db, chunk.terms);
          indexedTerms += chunk.terms.length;
          await nextTask();
          if (chunk.done) break;
          lastKey = chunk.lastKey;
        }
        log$2.info("Term search index rebuilt", { terms: indexedTerms });
      } finally {
        done();
      }
    }
    async rebuildTermKanjiIndex(db) {
      const done = log$2.time("Term kanji index rebuild");
      const generation = this.termIndexGeneration;
      try {
        await this.clearTermKanjiIndex(db);
        let indexedTerms = 0;
        let lastKey;
        for (; ; ) {
          if (generation !== this.termIndexGeneration) return;
          const chunk = await this.getTermSearchIndexSourceChunk(db, lastKey, TERM_KANJI_INDEX_BATCH_SIZE);
          if (!chunk.terms.length) break;
          if (generation !== this.termIndexGeneration) return;
          await this.addTermKanjiIndexChunk(db, chunk.terms);
          indexedTerms += chunk.terms.length;
          await nextTask();
          if (chunk.done) break;
          lastKey = chunk.lastKey;
        }
        log$2.info("Term kanji index rebuilt", { terms: indexedTerms });
      } finally {
        done();
      }
    }
    getTermSearchIndexSourceChunk(db, afterKey, limit) {
      return new Promise((resolve, reject) => {
        const terms = [];
        let lastKey = afterKey;
        const range = afterKey == null ? void 0 : IDBKeyRange.lowerBound(afterKey, true);
        const request = db.transaction("terms", "readonly").objectStore("terms").openCursor(range);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve({ terms, lastKey, done: true });
            return;
          }
          terms.push(cursor.value);
          lastKey = cursor.key;
          if (terms.length >= limit) {
            resolve({ terms, lastKey, done: false });
            return;
          }
          cursor.continue();
        };
      });
    }
    clearTermSearchIndex(db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("termSearch", "readwrite");
        tx.objectStore("termSearch").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    clearTermKanjiIndex(db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("termKanji", "readwrite");
        tx.objectStore("termKanji").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    async clearDerivedTermIndexes(db) {
      this.termIndexGeneration++;
      const stores = existingStores(db, ["termSearch", "termKanji"]);
      if (!stores.length) return;
      await clearStores(db, stores);
      this.termKanjiIndexReady = false;
    }
    addTermSearchIndexChunk(db, terms) {
      return this.addDerivedTermIndexChunk(db, "termSearch", terms, termSearchEntries);
    }
    addTermKanjiIndexChunk(db, terms) {
      return this.addDerivedTermIndexChunk(db, "termKanji", terms, termKanjiEntries);
    }
    addDerivedTermIndexChunk(db, storeName, terms, rowsForTerm) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const term of terms) {
          for (const row of rowsForTerm(term)) store.add(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        commitTransaction(tx);
      });
    }
    countStore(db, storeName) {
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
          resolve(0);
          return;
        }
        const request = db.transaction(storeName, "readonly").objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db() {
      this.dbPromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = request.result;
          const tx = request.transaction;
          log$2.info("Upgrading dictionary database", { oldVersion: event.oldVersion, newVersion: DB_VERSION });
          const terms = ensureStore(db, tx, "terms");
          ensureIndex(terms, "expression", "expression");
          ensureIndex(terms, "reading", "reading");
          ensureIndex(terms, "dictionary", "dictionary");
          const kanji = ensureStore(db, tx, "kanji");
          ensureIndex(kanji, "character", "character");
          ensureIndex(kanji, "dictionary", "dictionary");
          const termMeta = ensureStore(db, tx, "termMeta");
          ensureIndex(termMeta, "expression", "expression");
          ensureIndex(termMeta, "dictionary", "dictionary");
          const kanjiMeta = ensureStore(db, tx, "kanjiMeta");
          ensureIndex(kanjiMeta, "character", "character");
          ensureIndex(kanjiMeta, "dictionary", "dictionary");
          if (!db.objectStoreNames.contains("dictionaryInfo")) {
            db.createObjectStore("dictionaryInfo", { keyPath: "title" });
          }
          const termSearch = ensureStore(db, tx, "termSearch");
          ensureIndex(termSearch, "token", "token");
          ensureIndex(termSearch, "dictionary", "dictionary");
          const termKanji = ensureStore(db, tx, "termKanji");
          ensureIndex(termKanji, "character", "character");
          ensureIndex(termKanji, "dictionary", "dictionary");
        };
        request.onsuccess = () => {
          const db = request.result;
          this.installVersionChangeHandler(db);
          resolve(db);
        };
        request.onerror = () => {
          log$2.warn("Dictionary database open failed", { error: request.error });
          reject(request.error);
        };
      });
      return this.dbPromise;
    }
    installVersionChangeHandler(db) {
      db.onversionchange = (event) => {
        log$2.info("Dictionary DB version change; closing", {
          name: DB_NAME,
          oldVersion: event.oldVersion,
          newVersion: event.newVersion
        });
        db.close();
        this.dbPromise = void 0;
        this.invalidateCaches();
      };
    }
    invalidateCaches() {
      this.dictionaryInfoPromise = void 0;
      this.summaryPromise = void 0;
      this.dictionaryStyleCssCache.clear();
      this.hotLookupCache.clear();
      this.termKanjiIndexReady = false;
    }
  }
  async function readYomitanZipIndex(zip, language = "en") {
    return JSON.parse(await readZipText(zip, "index.json").catch(() => {
      throw new Error(uiText(language, "dictionaryZipMissingIndex"));
    }));
  }
  async function scanObjectStoreCursor(db, { storeName, maxRows, maxMs, errorMessage: errorMessage2 }, visit) {
    const startedAt = performance.now();
    let visited = 0;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).openCursor();
      request.onerror = () => reject(request.error ?? new Error(errorMessage2));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || cursorScanLimitReached(visited, startedAt, maxRows, maxMs)) {
          resolve();
          return;
        }
        visited++;
        visit(cursor.value);
        cursor.continue();
      };
    });
  }
  async function yomitanZipDictionaryInfo(zip, index, dictionary, sourceUrl) {
    return {
      title: dictionary,
      alias: dictionary,
      enabled: true,
      priority: 0,
      styles: await readOptionalZipText(zip, "styles.css"),
      revision: typeof index.revision === "string" ? index.revision : void 0,
      downloadUrl: sourceUrl || void 0,
      importDate: Date.now()
    };
  }
  async function readOptionalZipText(zip, name) {
    return readZipText(zip, name).catch(() => "");
  }
  async function readZipText(zip, name) {
    return zip.text(name);
  }
  async function inlineStructuredImageDataUrls(zip, value) {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) await inlineStructuredImageDataUrls(zip, item);
      return;
    }
    if (typeof value !== "object") return;
    const record = value;
    const path = typeof record.path === "string" ? normalizeMediaPath(record.path) : "";
    if (path && record.type === "image") {
      const dataUrl = await zipImageDataUrl(zip, path);
      if (dataUrl) record.path = dataUrl;
    }
    await inlineStructuredImageDataUrls(zip, record.content);
  }
  async function zipImageDataUrl(zip, path) {
    const bytes = await zip.bytes(path).catch(() => null);
    return bytes ? `data:${imageMimeType(path)};base64,${bytesToBase64(bytes)}` : "";
  }
  function termLookupDedupKey(entry) {
    const glossaryKey = JSON.stringify(entry.glossary);
    return entry.sequence !== void 0 ? `${entry.dictionary}
sequence:${entry.sequence}
${glossaryKey}` : `${entry.dictionary}
${entry.expression}
${entry.reading}
${glossaryKey}`;
  }
  function selectTermLookupResults(ranked, expression, reading, limit) {
    const boundedLimit = Math.max(0, Math.floor(limit));
    if (!boundedLimit || ranked.length <= boundedLimit) return ranked.slice(0, boundedLimit);
    const selected = new Set(firstExactTermEntriesByDictionary(ranked, expression, reading).slice(0, boundedLimit));
    fillTermLookupSelection(selected, ranked, boundedLimit);
    return ranked.filter((entry) => selected.has(entry)).slice(0, boundedLimit);
  }
  function firstExactTermEntriesByDictionary(ranked, expression, reading) {
    const firstExactByDictionary = /* @__PURE__ */ new Map();
    for (const entry of ranked) {
      if (!isExactTermLookupEntry(entry, expression, reading)) continue;
      if (!firstExactByDictionary.has(entry.dictionary)) firstExactByDictionary.set(entry.dictionary, entry);
    }
    return Array.from(firstExactByDictionary.values());
  }
  function fillTermLookupSelection(selected, ranked, limit) {
    for (const entry of ranked) {
      if (selected.size >= limit) break;
      selected.add(entry);
    }
  }
  function isExactTermLookupEntry(entry, expression, reading) {
    const hasKnownReading = Boolean(reading && reading !== expression);
    return entry.expression === expression && (!hasKnownReading || entry.reading === reading);
  }
  function bestTermLookupEntry(entries2, expression, rank) {
    const seen = /* @__PURE__ */ new Set();
    for (const entry of [...entries2].sort((a, b) => compareTermLookupEntries(a, b, expression, rank))) {
      if (!dictionaryEnabled(entry.dictionary, rank)) continue;
      const key = termLookupDedupKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      return entry;
    }
    return null;
  }
  function compareTermLookupEntries(a, b, expression, rank) {
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || Number(b.expression === expression) - Number(a.expression === expression) || (b.score ?? 0) - (a.score ?? 0);
  }
  function normalizeTermSearchQuery(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function shouldSearchTermGlossaries(query) {
    return !JAPANESE_RE.test(query);
  }
  function termSearchIndexToken(query) {
    return glossaryWords(normalizeGlossarySearchText(query)).find((word) => word.length >= TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH) ?? "";
  }
  function termSearchPrefixRange(query) {
    return IDBKeyRange.bound(query, `${query}${TERM_SEARCH_PREFIX_BOUNDARY}`, false, false);
  }
  function rankedTermSearchResults(candidates, query, limit, rank) {
    const seen = /* @__PURE__ */ new Set();
    return candidates.filter((candidate) => dictionaryEnabled(candidate.entry.dictionary, rank)).sort((a, b) => compareTermSearchCandidates(a, b, query, rank)).filter((candidate) => {
      const key = termLookupDedupKey(candidate.entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((candidate) => candidate.entry).slice(0, limit);
  }
  function indexedTermSearchRank(entry, query) {
    if (entry.expression === query) return 0;
    if (entry.reading === query) return 4;
    if (entry.expression.startsWith(query)) return 10;
    if (entry.reading.startsWith(query)) return 12;
    if (entry.expression.includes(query)) return 24;
    if (entry.reading.includes(query)) return 26;
    return 60;
  }
  function glossaryTermSearchRank(glossary, query) {
    const normalizedQuery = normalizeGlossarySearchText(query);
    if (!normalizedQuery) return Number.POSITIVE_INFINITY;
    const text = normalizeGlossarySearchText(glossaryValueToSearchText(glossary));
    if (!text) return Number.POSITIVE_INFINITY;
    if (text === normalizedQuery) return 30;
    if (glossaryHasExactWord(text, normalizedQuery)) return 34;
    if (glossaryHasWordPrefix(text, normalizedQuery)) return 44;
    if (text.includes(normalizedQuery)) return 68;
    return Number.POSITIVE_INFINITY;
  }
  function glossaryHasExactWord(text, query) {
    return glossaryWords(text).some((word) => word === query);
  }
  function glossaryHasWordPrefix(text, query) {
    return glossaryWords(text).some((word) => word.startsWith(query));
  }
  function glossaryWords(text) {
    return text.split(/\s+/u).filter(Boolean);
  }
  function termSearchEntries(entry) {
    const { id: _id, ...entryWithoutId } = entry;
    return glossarySearchTokens(entry.glossary).map((token) => ({
      ...entryWithoutId,
      token
    }));
  }
  function termEntryFromSearchEntry(entry) {
    const { id: _id, token: _token, ...term } = entry;
    return term;
  }
  function termKanjiEntries(entry) {
    const { id: _id, ...entryWithoutId } = entry;
    return uniqueExpressionKanji(entry.expression).map((character) => ({
      ...entryWithoutId,
      character
    }));
  }
  function termEntryFromKanjiEntry(entry) {
    const { id: _id, character: _character, ...term } = entry;
    return term;
  }
  function uniqueExpressionKanji(expression) {
    const seen = /* @__PURE__ */ new Set();
    return Array.from(expression).filter((character) => {
      if (!isKanji(character) || seen.has(character)) return false;
      seen.add(character);
      return true;
    });
  }
  function glossarySearchTokens(glossary) {
    return uniqueSearchTokens(glossaryWords(normalizeGlossarySearchText(glossaryValueToSearchText(glossary))).flatMap(glossaryWordSearchTokens)).slice(0, TERM_SEARCH_INDEX_MAX_TOKENS_PER_TERM);
  }
  function glossaryWordSearchTokens(word) {
    const tokens = [];
    const variants = uniqueSearchTokens([
      word,
      word.endsWith("'s") ? word.slice(0, -2) : "",
      word.endsWith("s") ? word.slice(0, -1) : ""
    ]);
    for (const variant of variants) {
      tokens.push(variant);
      for (let start = 1; start <= variant.length - TERM_SEARCH_INDEX_MIN_SUFFIX_LENGTH; start++) {
        tokens.push(variant.slice(start));
      }
    }
    return tokens;
  }
  function uniqueSearchTokens(tokens) {
    const seen = /* @__PURE__ */ new Set();
    return tokens.filter((token) => {
      if (token.length < TERM_SEARCH_INDEX_MIN_TOKEN_LENGTH || seen.has(token)) return false;
      seen.add(token);
      return true;
    });
  }
  function trimTermSearchCandidates(candidates, candidateLimit, query, rank) {
    if (candidates.length <= candidateLimit * 2) return;
    candidates.sort((a, b) => compareTermSearchCandidates(a, b, query, rank));
    candidates.length = candidateLimit;
  }
  function compareTermSearchCandidates(a, b, query, rank) {
    return a.rank - b.rank || dictionaryPriority(a.entry.dictionary, rank) - dictionaryPriority(b.entry.dictionary, rank) || (b.entry.score ?? 0) - (a.entry.score ?? 0) || Number(b.entry.expression === query) - Number(a.entry.expression === query) || a.entry.expression.length - b.entry.expression.length;
  }
  function reservoirSample(items, limit) {
    const reservoir = [];
    let count = 0;
    for (const item of items) {
      count++;
      if (reservoir.length < limit) {
        reservoir.push(item);
      } else {
        const index = Math.floor(Math.random() * count);
        if (index < limit) reservoir[index] = item;
      }
    }
    return reservoir;
  }
  function isKanji(value) {
    const code = value.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
  }
  function ensureStore(db, tx, name) {
    return db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
  }
  function hasStore(db, name) {
    return db.objectStoreNames.contains(name);
  }
  function ensureIndex(store, name, keyPath) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
  }
  function existingStores(db, names) {
    return names.filter((name) => db.objectStoreNames.contains(name));
  }
  function normalizeMediaPath(path) {
    return path.trim().replace(/^\.?\//, "").replace(/\\/g, "/");
  }
  function readwriteTransaction(db, storeNames) {
    try {
      return db.transaction(storeNames, "readwrite", { durability: "relaxed" });
    } catch {
      return db.transaction(storeNames, "readwrite");
    }
  }
  function commitTransaction(tx) {
    try {
      tx.commit?.();
    } catch {
    }
  }
  function clearStores(db, stores) {
    if (!stores.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = readwriteTransaction(db, stores);
      for (const store of stores) tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(transactionError(tx, `Could not clear dictionary stores: ${stores.join(", ")}.`));
      tx.onabort = () => reject(transactionError(tx, `Could not clear dictionary stores: ${stores.join(", ")}.`));
      commitTransaction(tx);
    });
  }
  async function deleteByDictionary(db, storeName, dictionary) {
    while (await deleteDictionaryBatch(db, storeName, dictionary, DICTIONARY_DELETE_BATCH_SIZE) >= DICTIONARY_DELETE_BATCH_SIZE) {
      await nextTask();
    }
  }
  function deleteDictionaryBatch(db, storeName, dictionary, limit) {
    return new Promise((resolve, reject) => {
      let deleted = 0;
      const tx = readwriteTransaction(db, storeName);
      const index = tx.objectStore(storeName).index("dictionary");
      const request = index.openCursor(IDBKeyRange.only(dictionary));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || deleted >= limit) return;
        cursor.delete();
        deleted++;
        if (deleted >= limit) return;
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error(`Could not delete ${dictionary} entries from ${storeName}.`));
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(transactionError(tx, `Could not delete ${dictionary} entries from ${storeName}.`));
      tx.onabort = () => reject(transactionError(tx, `Could not delete ${dictionary} entries from ${storeName}.`));
    });
  }
  function transactionError(tx, fallback) {
    return tx.error ?? new Error(fallback);
  }
  function nextTask() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  function isSettingsCommandWord(word) {
    return Boolean(word.closest('a[href],button,[role="button"],[role="link"],[role="menuitem"],[role="option"],[role="tab"],[data-action]'));
  }
  const log$1 = Logger.scope("SettingsDialog");
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
  const CLOUD_SETTINGS_PENDING_ACTION_KEY = "__yomu_cloud_settings_sync_pending_action";
  const CLOUD_SETTINGS_PENDING_ACTION_TTL_MS = 10 * 60 * 1e3;
  function settingsStatusSetter(form, control) {
    return (message) => {
      const originPanel = control?.closest("fieldset[data-settings-panel]");
      const status = originPanel?.querySelector("[data-import-status]") ?? form.querySelector("#jpdb-reader-settings-panel-backup [data-import-status]") ?? form.querySelector("[data-import-status]");
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
    };
  }
  function focusPreviewAudioSource(form, button2, previewSettings) {
    const row = button2?.closest("[data-audio-source-row]");
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
  function reconcileApiCredentialInputs(form) {
    const jpdbField = namedSettingsControl(form, "apiCredentialJpdb");
    const jitenField = namedSettingsControl(form, "apiCredentialJiten");
    if (!jpdbField && !jitenField) return;
    const { apiKey, jitenApiKey } = mergeApiCredentialValues(jpdbField?.value ?? "", jitenField?.value ?? "");
    if (jpdbField && jpdbField.value !== apiKey) jpdbField.value = apiKey;
    if (jitenField && jitenField.value !== jitenApiKey) jitenField.value = jitenApiKey;
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
    const entries2 = [];
    for (const [role, value] of Object.entries(confidence)) {
      if (isAnkiFieldMappingRole(role) && isAnkiScanConfidence(value)) entries2.push([role, value]);
    }
    return entries2;
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
    const pageScale = redditOverlayViewport().pageScale;
    const scrollRect = redditSourceRectToOverlay(scroll.getBoundingClientRect(), scroll, pageScale);
    const controlRect = redditSourceRectToOverlay(control.getBoundingClientRect(), control, pageScale);
    if (!hasMeasuredRect(scrollRect) || !hasMeasuredRect(controlRect)) return null;
    const limits = settingsControlScrollLimits(form, scrollRect, pageScale);
    return limits ? { scroll, controlRect, ...limits } : null;
  }
  function canScrollFocusedSettingsControl(form, control) {
    return form.isConnected && control.isConnected && document.activeElement === control;
  }
  function settingsControlScrollContainer(form, control) {
    const scroll = control.closest(".jpdb-reader-settings-scroll");
    return scroll && form.contains(scroll) ? scroll : null;
  }
  function settingsControlScrollLimits(form, scrollRect, pageScale) {
    const viewport = settingsControlViewportBounds(scrollRect, pageScale);
    const topLimit = Math.max(scrollRect.top, viewport.top) + SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    const bottomLimit = Math.min(scrollRect.bottom, viewport.bottom, measuredSettingsFooterTop(form, pageScale)) - SETTINGS_FOCUS_SCROLL_MARGIN_PX;
    return validSettingsControlScrollLimits(bottomLimit, topLimit);
  }
  function settingsControlViewportBounds(scrollRect, pageScale) {
    if (pageScale > 1) {
      const viewport = redditOverlayViewportBounds();
      return { bottom: viewport.bottom, top: viewport.top };
    }
    const top = Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0));
    const height = Math.max(0, Math.round(window.visualViewport?.height ?? settingsControlViewportHeightFallback(scrollRect)));
    return { bottom: top + height, top };
  }
  function settingsControlViewportHeightFallback(scrollRect) {
    if (window.innerHeight) return window.innerHeight;
    if (document.documentElement.clientHeight) return document.documentElement.clientHeight;
    return scrollRect.bottom;
  }
  function measuredSettingsFooterTop(form, pageScale) {
    const footer = form.querySelector(".footer");
    const footerRect = footer ? redditSourceRectToOverlay(footer.getBoundingClientRect(), footer, pageScale) : void 0;
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
    log$1.warn("Settings action failed", { action }, error);
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
      priorities: form.querySelector("[data-definition-source-editor]"),
      lookupPills: form.querySelector(".jpdb-reader-lookup-links"),
      recommended: form.querySelector("[data-recommended-dictionaries]")
    };
  }
  function renderDictionaryStatusElements(elements, summary, settings) {
    if (elements.status) elements.status.textContent = dictionaryStatusText(summary, settings.interfaceLanguage);
    if (elements.priorities) setInnerHtml(elements.priorities, renderDictionarySourceRows(settings));
    if (elements.lookupPills) setInnerHtml(elements.lookupPills, renderLookupPillsEditor(settings, summary.dictionaries));
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
    yomuUpdateCheckId = 0;
    settingsJapaneseParseRefreshFrame;
    settingsJapaneseParseRefreshTimer;
    open(panel) {
      log$1.info("Opening settings", { panel: panel ?? "default" });
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
      installSettingsDrawerHandle(form, uiText(this.settings.interfaceLanguage, "resizeSettings"), () => this.dismissSettings());
      this.dependencies.beginSettingsPreview(this.settings.accentColor, this.settings.interfaceLanguage, this.settings.theme);
      this.syncRecommendedDictionaryInstallControls(form);
      this.syncDictionaryOperationState(form);
      this.syncJpdbStatus(form);
      void this.refreshAnkiConnectionStatus(form);
      void this.refreshJpdbConnectionStatus(form);
      void this.refreshDictionaryStatus(form);
      void this.refreshDeckControls(form);
      if (panel === "help") void this.refreshYomuUpdateStatus(form);
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
    async resumePendingCloudSettingsSync() {
      if (!CLOUD_SETTINGS_SYNC_ENABLED || !cloudSettingsSyncAvailable()) return false;
      const pending = await this.readPendingCloudSettingsAction();
      if (!pending) return false;
      const authResult = cloudSettingsAuthRedirectResult();
      if (!authResult) return false;
      await this.clearPendingCloudSettingsAction();
      const language = this.settings.interfaceLanguage;
      if (!authResult.ok) {
        const message = authResult.error || "Google authorization failed.";
        this.dependencies.toast(message);
        this.open("backup");
        return true;
      }
      try {
        await this.performCloudSettingsAction(pending.action, language, void 0);
        if (pending.action === "sync-cloud-settings") this.open("backup");
      } catch (error) {
        const message = errorMessage(error, uiText(language, "actionFailed"));
        this.dependencies.toast(message);
        this.open("backup");
      }
      return true;
    }
    get settings() {
      return this.dependencies.getSettings();
    }
    set settings(settings) {
      this.dependencies.setSettings(settings);
    }
    // Temporary form-derived swaps must not fire host-side transitions (the
    // dialog's annotations-off instant clear would otherwise trigger from a
    // mere Anki probe while OFF is selected but unsaved — sol review P1).
    swapSettingsTransiently(settings) {
      const previous = this.dependencies.getSettings();
      this.dependencies.setSettings(settings, { transient: true });
      return previous;
    }
    restoreTransientSettings(previous) {
      this.dependencies.setSettings(previous, { transient: true });
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
          log$1.error("Settings save failed", error);
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
      if (this.settingsJapaneseParseRefreshFrame !== void 0) {
        cancelCancelableFrame(this.settingsJapaneseParseRefreshFrame);
        this.settingsJapaneseParseRefreshFrame = void 0;
      }
      if (this.settingsJapaneseParseRefreshTimer !== void 0) {
        window.clearTimeout(this.settingsJapaneseParseRefreshTimer);
        this.settingsJapaneseParseRefreshTimer = void 0;
      }
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
      this.modalSiblingState = Array.from(document.body.children).filter((element2) => element2 instanceof HTMLElement && element2 !== directRoot && !element2.contains(this.currentForm ?? null)).map((element2) => {
        const state = {
          element: element2,
          ariaHidden: element2.getAttribute("aria-hidden"),
          inert: element2.inert
        };
        element2.setAttribute("aria-hidden", "true");
        return state;
      });
    }
    restoreBackgroundFromModal() {
      this.modalSiblingState?.forEach(({ element: element2, ariaHidden, inert }) => {
        if (ariaHidden === null) element2.removeAttribute("aria-hidden");
        else element2.setAttribute("aria-hidden", ariaHidden);
        element2.inert = inert;
      });
      this.modalSiblingState = void 0;
    }
    /**
     * Clear the `aria-hidden` the modal placed on background siblings.
     * The controller's own close paths (Escape, Cancel, Save) already restore,
     * but the dialog can also be torn down from outside the controller — a
     * backdrop click, factory reset, or the close-popup shortcut all route
     * through ReaderApp.dismiss(). Those paths call this so the page is never
     * stranded hidden from assistive technology.
     * Idempotent: a no-op once the background has been released.
     */
    releaseModalBackground() {
      if (!this.currentForm?.isConnected) this.currentForm = void 0;
      this.restoreBackgroundFromModal();
    }
    trapFocus(form, event) {
      const focusable = Array.from(form.querySelectorAll(SETTINGS_FOCUSABLE_SELECTOR)).filter((element2) => !element2.closest("[hidden]") && element2.getAttribute("aria-hidden") !== "true");
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
        this.refreshSettingsJapaneseParse(form);
      });
    }
    afterSettingsSaved(form, saveRequestId) {
      if (this.currentForm !== form || !form.isConnected || this.saveRequestId !== saveRequestId) return;
      log$1.info("Settings saved", loggingSettingsSummary(this.settings));
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
        log$1.warn("Dictionary style refresh failed", error);
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
        const customEvent = event;
        const detail = customEvent.detail;
        if (detail && detail.settings && detail.preview !== true) {
          this.settings = { ...this.settings, ...detail.settings };
          syncFormFromSettings(form, this.settings);
          syncSubtitlePreview(form);
          syncFontFamilyControls(form);
        }
        const theme = themeFromSettingsChangeEvent(event);
        if (theme) {
          const input2 = form.querySelector("[data-theme-value]");
          if (input2 && input2.value !== theme) {
            input2.value = theme;
            this.settings.theme = theme;
            applyThemePreview();
            this.syncThemeSwitch(form);
          }
        }
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
      form.querySelectorAll('input[name="pageScanMode"]').forEach((input2) => {
        input2.addEventListener("change", () => syncPageScanModeControls(form));
      });
      syncPageScanModeControls(form);
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
      for (const apiKeyInput of form.querySelectorAll('input[name="apiCredential"], input[name="apiCredentialJpdb"], input[name="apiCredentialJiten"], input[name="apiCredentialBunproLegacy"], input[name="apiCredentialBunpro"], input[name="bunproFrontendApiTokenExpiresAt"]')) {
        apiKeyInput.addEventListener("input", () => this.syncJpdbStatus(form));
        apiKeyInput.addEventListener("change", () => {
          reconcileApiCredentialInputs(form);
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
      if (!word.dataset.settingsPreviewLookup && isSettingsCommandWord(word)) return false;
      const expression = word.dataset.settingsPreviewLookup?.trim() || word.dataset.expression?.trim() || readerWordSurfaceText(word).trim() || word.textContent?.trim() || "";
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
      const button2 = form.querySelector("[data-theme-switch]");
      if (!button2) return;
      const theme = this.effectiveTheme(input2?.value);
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const label = uiText(language, theme === "dark" ? "switchToLightTheme" : "switchToDarkTheme");
      button2.setAttribute("aria-checked", String(theme === "dark"));
      button2.setAttribute("aria-label", label);
      button2.title = label;
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
      if (preview) setInnerHtml(preview, appearancePreviewContentHtml());
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
        log$1.warn("Deck controls failed to load", error);
        setInnerHtml(container, renderDeckControls(formSettings, [], true, getFormInterfaceLanguage(form, this.settings.interfaceLanguage)));
      } finally {
        this.settings.apiKey = originalKey;
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        this.refreshSettingsJapaneseParse(form);
      }
    }
    syncJpdbStatus(form) {
      const formSettings = readFormSettings(new FormData(form), this.settings);
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const status = form.querySelector("[data-jpdb-status]");
      if (status) {
        const line = jpdbStatusLineForSettings(formSettings, language);
        status.dataset.statusTone = line.tone;
        status.textContent = formatSettingsStatusLine(line, language);
      }
      const bunproStatus = form.querySelector("[data-bunpro-status]");
      if (bunproStatus) {
        const line = bunproStatusLineForSettings(formSettings, language);
        bunproStatus.dataset.statusTone = line.tone;
        bunproStatus.textContent = formatSettingsStatusLine(line, language);
      }
      this.refreshSettingsJapaneseParse(form);
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
      const successKey = hasJitenApiCredential(formSettings) ? "jpdbAndJitenConnected" : "jpdbConnected";
      const line = connected ? { message: uiText(language, successKey), tone: "success" } : { message: uiText(language, "jpdbConnectionFailed"), tone: "error" };
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
      const previous = this.swapSettingsTransiently(formSettings);
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
        log$1.warn("Anki settings probe failed", error);
        this.setAnkiStatusLine(form, this.ankiSetupUnavailableStatus(formSettings, language));
        void this.refineAnkiUnavailableStatus(form, requestId, formSettings, language);
      } finally {
        this.restoreTransientSettings(previous);
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
      const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
      if (!this.settings.ankiEnabled) {
        this.restoreTransientSettings(previous);
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
        log$1.info("Auto Anki scan ok", { decks: scan.deckNames.length, models: scan.models.length, suggestedModel: scan.suggestedModel?.modelName });
      } catch (error) {
        if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
        log$1.warn("Automatic Anki library scan failed", error);
        this.setAnkiStatus(form, uiText(language, "ankiConnectionReady"), "success", void 0, "connected");
      } finally {
        this.restoreTransientSettings(previous);
      }
    }
    shouldApplyAnkiLibraryScan(form, requestId) {
      return this.currentForm === form && form.isConnected && requestId === this.ankiLibraryScanId;
    }
    async warmAnkiStatusIndexForConnection(form, requestId) {
      if (!this.shouldApplyAnkiLibraryScan(form, requestId)) return;
      const warmStatusIndex = this.dependencies.anki.warmStatusIndex;
      if (typeof warmStatusIndex !== "function") return;
      const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
      if (!this.settings.ankiEnabled) {
        this.restoreTransientSettings(previous);
        return;
      }
      try {
        await warmStatusIndex.call(this.dependencies.anki);
        log$1.info("Auto Anki status index warmup ok");
      } catch (error) {
        log$1.warn("Automatic Anki status index warmup failed", error);
      } finally {
        this.restoreTransientSettings(previous);
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
      this.refreshSettingsJapaneseParse(form);
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
        log$1.warn("Dictionary status unavailable", error);
        setDictionaryStatusError(elements.status, error, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      }
    }
    async refreshYomuUpdateStatus(form) {
      const status = form.querySelector("[data-yomu-update-status]");
      if (!status) return;
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      const requestId = ++this.yomuUpdateCheckId;
      status.dataset.statusTone = "pending";
      status.dataset.updateChecked = "true";
      status.textContent = formatUiText(language, "updateStatusChecking", { current: CURRENT_YOMU_VERSION });
      try {
        const version = await requestJson(`${NEW_TAB_VERSION_URL}?t=${Date.now()}`, {
          allowDirectCrossOrigin: true,
          anonymous: true,
          credentials: "omit",
          failureLabel: "Yomu update check",
          preferFetch: true,
          timeoutMs: 6e3,
          withCredentials: false
        });
        if (this.currentForm !== form || !form.isConnected || this.yomuUpdateCheckId !== requestId) return;
        const latest = latestYomuVersionFromVersionJson(version);
        if (!latest) throw new Error("Hosted version response did not include a build id.");
        const comparison = compareYomuVersions(CURRENT_YOMU_VERSION, latest);
        if (comparison === null) {
          status.dataset.statusTone = "pending";
          status.textContent = formatUiText(language, "updateStatusIncomparable", { current: CURRENT_YOMU_VERSION, latest });
          return;
        }
        const updateAvailable = comparison < 0;
        status.dataset.statusTone = updateAvailable ? "pending" : "success";
        status.textContent = formatUiText(language, updateAvailable ? "updateStatusAvailable" : "updateStatusCurrent", {
          current: CURRENT_YOMU_VERSION,
          latest
        });
      } catch (error) {
        log$1.warn("Yomu update status unavailable", error);
        if (this.currentForm !== form || !form.isConnected || this.yomuUpdateCheckId !== requestId) return;
        status.dataset.statusTone = "pending";
        status.textContent = formatUiText(language, "updateStatusUnknown", { current: CURRENT_YOMU_VERSION });
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
      if (this.settingsJapaneseParseRefreshFrame !== void 0) cancelCancelableFrame(this.settingsJapaneseParseRefreshFrame);
      if (this.settingsJapaneseParseRefreshTimer !== void 0) window.clearTimeout(this.settingsJapaneseParseRefreshTimer);
      this.settingsJapaneseParseRefreshFrame = requestCancelableFrame(() => {
        this.settingsJapaneseParseRefreshFrame = void 0;
        this.settingsJapaneseParseRefreshTimer = window.setTimeout(() => {
          this.settingsJapaneseParseRefreshTimer = void 0;
          if (this.currentForm === form && form.isConnected) void this.dependencies.parseSettingsJapanese?.(form);
        }, 0);
      });
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
      form.querySelectorAll('[data-action="download-recommended-dictionary"]').forEach((button2) => {
        const dictionaryId = button2.dataset.dictionaryId ?? "";
        const operation = this.recommendedDictionaryOperations.get(dictionaryId);
        const status = button2.closest(".jpdb-reader-recommended-item")?.querySelector("[data-recommended-dictionary-status]");
        if (!operation) {
          delete button2.dataset.importState;
          delete button2.dataset.importMessage;
          button2.disabled = false;
          button2.removeAttribute("disabled");
          if (status) {
            status.hidden = true;
            status.textContent = "";
            delete status.dataset.importState;
          }
          const installed = button2.dataset.installed === "true";
          const label2 = installed ? uiText(this.settings.interfaceLanguage, "update") : uiText(this.settings.interfaceLanguage, "install");
          button2.replaceChildren(label2);
          button2.title = label2;
          button2.setAttribute("aria-label", label2);
          return;
        }
        const label = uiText(this.settings.interfaceLanguage, operation.state === "installing" ? "installing" : "queued");
        button2.disabled = true;
        button2.dataset.importState = operation.state;
        button2.dataset.importMessage = operation.message;
        button2.replaceChildren(label);
        button2.title = operation.message;
        button2.setAttribute("aria-label", operation.message);
        if (status) {
          status.hidden = false;
          status.dataset.importState = operation.state;
          status.textContent = operation.message;
        }
      });
    }
    async handleSettingsAction(form, action, control) {
      const setStatus = settingsStatusSetter(form, control);
      try {
        await this.runSettingsAction(form, action, control, setStatus);
      } catch (error) {
        const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
        const message = handleSettingsActionError(action, control, setStatus, error, language);
        this.dependencies.toast(message);
      }
    }
    async runSettingsAction(form, action, control, setStatus) {
      const handled = this.handleSettingsEditorAction(form, action, control) || await this.handleSettingsAudioAction(form, action, control) || await this.handleSettingsDictionaryAction(form, action, control, setStatus) || await this.handleSettingsCloudSyncAction(form, action, control, setStatus) || await this.handleSettingsImportExportAction(form, action, setStatus);
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
        if (panel === "help") void this.refreshYomuUpdateStatus(form);
        this.refreshSettingsJapaneseParse(form);
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
      const button2 = settingsActionButton(control);
      const previewSettings = readFormSettings(new FormData(form), this.settings);
      focusPreviewAudioSource(form, button2, previewSettings);
      const previous = this.swapSettingsTransiently({ ...previewSettings, audioEnabled: true, audioViaBlob: true });
      button2?.setAttribute("disabled", "true");
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      try {
        const played = await this.dependencies.audio.play(createAudioPreviewCard(), { userGesture: true });
        if (played) {
          this.dependencies.toast(uiText(language, "playingAudioPreview"));
          log$1.info("Audio settings preview started");
        } else {
          this.dependencies.toast(uiText(language, "audioPreviewFailed"));
        }
      } catch (error) {
        log$1.warn("Audio settings preview failed", error);
        this.dependencies.toast(errorMessage(error, uiText(language, "audioPreviewFailed")));
      } finally {
        this.restoreTransientSettings(previous);
        button2?.removeAttribute("disabled");
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
        log$1.info("Dictionaries exported");
        return true;
      }
      return false;
    }
    async handleSettingsCloudSyncAction(form, action, control, setStatus) {
      if (!CLOUD_SETTINGS_SYNC_ENABLED || !isCloudSettingsAction(action)) return false;
      const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
      if (!cloudSettingsSyncAvailable()) {
        setStatus(cloudSettingsSyncUnavailableStatus(language));
        return true;
      }
      const button2 = settingsActionButton(control);
      button2?.setAttribute("disabled", "true");
      await this.rememberPendingCloudSettingsAction(action);
      try {
        if (action === "sync-cloud-settings") this.settings = readFormSettings(new FormData(form), this.settings);
        await this.performCloudSettingsAction(action, language, setStatus);
        await this.clearPendingCloudSettingsAction();
        return true;
      } catch (error) {
        await this.clearPendingCloudSettingsAction();
        throw error;
      } finally {
        button2?.removeAttribute("disabled");
      }
    }
    async performCloudSettingsAction(action, language, setStatus) {
      if (action === "sync-cloud-settings") {
        await saveSettings(this.settings);
        const metadata = await uploadCloudSettingsToCloud(this.settings);
        const message2 = cloudSettingsSyncedStatus(metadata.syncedAt, language);
        setStatus?.(message2);
        this.dependencies.toast(message2);
        log$1.info("Cloud settings synced", { syncedAt: metadata.syncedAt, fileId: metadata.fileId });
        return;
      }
      const snapshot = await downloadCloudSettingsFromCloud();
      if (!snapshot) {
        setStatus?.(cloudSettingsNotFoundStatus(language));
        return;
      }
      this.settings = normalizeReaderSettings({
        ...this.settings,
        ...snapshot.settings,
        shortcuts: { ...this.settings.shortcuts, ...snapshot.settings.shortcuts }
      });
      await importStoredValues(snapshot.storage);
      await saveSettings(this.settings);
      const message = cloudSettingsRestoredStatus(snapshot.syncedAt, language);
      setStatus?.(message);
      this.dependencies.toast(message);
      this.dependencies.applyTheme();
      void this.dependencies.refreshDictionaryStyles();
      this.dependencies.scheduleDictionaryRescan();
      this.dependencies.installFab();
      this.dependencies.subtitles.refresh();
      this.dependencies.ocr.refresh();
      this.dependencies.youtube.refresh();
      this.dependencies.clearSettingsPreview();
      log$1.info("Cloud settings restored", { syncedAt: snapshot.syncedAt });
      this.open("backup");
    }
    async rememberPendingCloudSettingsAction(action) {
      await gmStorageSet(CLOUD_SETTINGS_PENDING_ACTION_KEY, {
        action,
        startedAt: Date.now(),
        href: location.href
      });
    }
    async clearPendingCloudSettingsAction() {
      await gmStorageDelete(CLOUD_SETTINGS_PENDING_ACTION_KEY);
    }
    async readPendingCloudSettingsAction() {
      const pending = await gmStorageGet(CLOUD_SETTINGS_PENDING_ACTION_KEY, null);
      if (!isPendingCloudSettingsAction(pending)) {
        await this.clearPendingCloudSettingsAction();
        return null;
      }
      if (Date.now() - pending.startedAt > CLOUD_SETTINGS_PENDING_ACTION_TTL_MS) {
        await this.clearPendingCloudSettingsAction();
        return null;
      }
      return pending;
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
        log$1.info("Settings exported");
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
      const button2 = settingsActionButton(control);
      const setAnkiStatus = ankiStatusSetter(form.querySelector("[data-anki-status]"));
      const previous = this.swapSettingsTransiently(readFormSettings(new FormData(form), this.settings));
      button2?.setAttribute("disabled", "true");
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
        this.restoreTransientSettings(previous);
        button2?.removeAttribute("disabled");
      }
      return true;
    }
    async checkAnkiConnectionForSettings(setAnkiStatus, language) {
      try {
        if (await this.dependencies.anki.isConnected()) return true;
      } catch (error) {
        log$1.warn("Anki settings check failed", error);
      }
      const line = this.ankiSetupUnavailableStatus(this.settings, language);
      setAnkiStatus(line.message, line.tone, line.action);
      return false;
    }
    finishAnkiConnectionTest(form, setAnkiStatus, language) {
      setAnkiStatus(uiText(language, "ankiConnectionReady"), "success");
      this.queueAutomaticAnkiLibraryScan(form, language);
      log$1.info("Anki settings check ok", { url: this.settings.ankiConnectUrl });
    }
    async prepareAnkiConnectionAction(form, setAnkiStatus, language) {
      await this.dependencies.anki.ensureDeckAndModel();
      setAnkiStatus(this.ankiReadyMessage(language), "success");
      this.queueAutomaticAnkiLibraryScan(form, language);
      log$1.info("Anki settings prepare succeeded", { deck: this.settings.ankiDeck, model: this.settings.ankiModel });
    }
    handleAnkiConnectionActionError(error, setAnkiStatus, language) {
      if (isAnkiConnectAvailabilityError(error) || isAnkiConnectSetupError(error)) {
        const line = this.ankiSetupUnavailableStatus(this.settings, language);
        log$1.warn("Anki settings action unavailable", error);
        setAnkiStatus(line.message, line.tone, line.action);
        return;
      }
      const message = this.ankiConnectionErrorMessage(error, language);
      log$1.warn("Anki settings test failed", error);
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
      if (action === "open-yomu-update") {
        openUrlInNewTab(detectYomuUpdateFlow().url);
        return true;
      }
      if (action === "copy-newtab-url") {
        await copyText(NEW_TAB_PAGE_URL);
        this.dependencies.toast(uiText(this.settings.interfaceLanguage, "newTabAddressCopied"));
        return true;
      }
      if (action === "factory-reset") {
        const button2 = settingsActionButton(control);
        button2?.setAttribute("disabled", "true");
        try {
          await this.dependencies.resetAllData();
        } finally {
          button2?.removeAttribute("disabled");
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
      log$1.info("Dictionary removed", { dictionary });
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
        log$1.info("Dictionary file imported", summary);
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
          log$1.info("Downloading selected dictionary", { dictionary: dictionary.name });
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
          log$1.info("Selected dictionary downloaded", { dictionary: dictionary.name, entries: summary.entries });
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
      log$1.warn("Dictionary auto-download unavailable", { dictionary: dictionary.name, message });
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
      log$1.info("Settings imported", loggingSettingsSummary(this.settings));
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
  function isCloudSettingsAction(action) {
    return action === "sync-cloud-settings" || action === "restore-cloud-settings";
  }
  function isPendingCloudSettingsAction(value) {
    if (!value || typeof value !== "object") return false;
    const record = value;
    return typeof record.startedAt === "number" && Number.isFinite(record.startedAt) && typeof record.href === "string" && typeof record.action === "string" && isCloudSettingsAction(record.action);
  }
  function getReaderStorageExport(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return record.formatName === "yomu-reader-settings" || record.formatName === "jpdb-popup-reader-settings" ? record.storage : null;
  }
  function publishSettingsChange(settings, options = {}) {
    dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { preview: options.preview === true, settings }));
  }
  function syncFormFromSettings(form, settings) {
    for (const key of Object.keys(settings)) {
      if (key === "theme") continue;
      const val = settings[key];
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        const elements = form.elements.namedItem(key);
        if (elements instanceof HTMLInputElement) {
          if (elements.type === "checkbox") {
            elements.checked = Boolean(val);
          } else if (elements.type === "radio") {
            elements.checked = elements.value === String(val);
          } else {
            elements.value = String(val);
          }
        } else if (elements instanceof RadioNodeList || elements instanceof NodeList && elements.length > 0) {
          const list = elements instanceof RadioNodeList ? Array.from(elements) : Array.from(elements);
          for (const node of list) {
            if (node instanceof HTMLInputElement && node.type === "radio") {
              node.checked = node.value === String(val);
            }
          }
        } else if (elements instanceof HTMLSelectElement) {
          elements.value = String(val);
        }
      }
    }
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
  function cloudSettingsSyncUnavailableStatus(language) {
    return language === "ja" ? "このブラウザーではGoogle Drive設定同期を利用できません。" : "Google Drive settings sync is unavailable in this browser.";
  }
  function cloudSettingsNotFoundStatus(language) {
    return language === "ja" ? "Google Driveに保存されたYomu設定が見つかりません。" : "No Yomu settings were found in Google Drive.";
  }
  function cloudSettingsSyncedStatus(syncedAt, language) {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === "ja" ? `設定をGoogle Driveに同期しました（${time}）。` : `Settings synced to Google Drive (${time}).`;
  }
  function cloudSettingsRestoredStatus(syncedAt, language) {
    const time = cloudSettingsSyncTime(syncedAt, language);
    return language === "ja" ? `Google Drive設定を復元しました（${time}）。` : `Google Drive settings restored (${time}).`;
  }
  function cloudSettingsSyncTime(value, language) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(language === "ja" ? "ja-JP" : void 0);
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
  const log = Logger.scope("Onboarding");
  const ONBOARDING_ACCENT_SWATCHES = ["#5ea780", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];
  const ONBOARDING_FEATURE_KEYS = [
    ["featureText", "featureTextBody"],
    ["featureImages", "featureImagesBody"],
    ["featureVideo", "featureVideoBody"],
    ["featureControl", "featureControlBody"],
    ["featureStudy", "featureStudyBody"],
    ["featureGame", "featureGameBody"]
  ];
  function selectedOnboardingLanguage(value, fallback) {
    return value === "en" || value === "ja" || value === "auto" ? value : fallback;
  }
  class OnboardingController {
    constructor(options) {
      this.options = options;
    }
    panel;
    backdrop;
    languageSelect;
    themeSwitch;
    accentColorInput;
    pendingAccentPreviewColor;
    accentPreviewFrame;
    youtubeImmersionInput;
    preferJapaneseSiteLanguageInput;
    offlineDictionariesInput;
    newTabEnabledInput;
    pageScanModeInputs = [];
    ocrModeInputs = [];
    manualPageScanShortcutInput;
    manualPageScanShortcutLabel;
    hoverLookupShortcutInput;
    async showIfNeeded() {
      if (this.options.getSettings().onboardingSeen) {
        return false;
      }
      this.show();
      return true;
    }
    show() {
      log.info("Showing onboarding", { language: this.options.getSettings().interfaceLanguage });
      this.close();
      this.backdrop = document.createElement("div");
      this.backdrop.className = "jpdb-reader-backdrop jpdb-reader-onboarding-backdrop";
      this.backdrop.dataset.jpdbReaderRoot = "true";
      this.panel = document.createElement("section");
      this.panel.className = "jpdb-reader-onboarding jpdb-reader-parseable";
      this.panel.dataset.jpdbReaderRoot = "true";
      this.panel.setAttribute("role", "dialog");
      this.panel.setAttribute("aria-modal", "true");
      this.panel.setAttribute("aria-label", uiText(this.options.getSettings().interfaceLanguage, "welcomeLabel"));
      this.panel.tabIndex = -1;
      const closeButton = button("");
      closeButton.className = "jpdb-reader-icon-mini jpdb-reader-onboarding-close";
      closeButton.dataset.onboardingAction = "close";
      closeButton.title = uiText(this.options.getSettings().interfaceLanguage, "closeOnboarding");
      closeButton.setAttribute("aria-label", uiText(this.options.getSettings().interfaceLanguage, "closeOnboarding"));
      setInnerHtml(closeButton, closeIcon());
      closeButton.addEventListener("click", () => void this.complete(false));
      const eyebrow = element("div", "jpdb-reader-onboarding-eyebrow", uiText(this.options.getSettings().interfaceLanguage, "onboardingEyebrow"));
      const title = element("h2", "", APP_NAME);
      const copy = element(
        "p",
        "",
        uiText(this.options.getSettings().interfaceLanguage, "onboardingCopy")
      );
      const featureList = document.createElement("ul");
      featureList.className = "jpdb-reader-onboarding-features";
      ONBOARDING_FEATURE_KEYS.forEach(([headingKey, textKey]) => {
        const item = document.createElement("li");
        item.append(
          element("strong", "", uiText(this.options.getSettings().interfaceLanguage, headingKey)),
          element("span", "", uiText(this.options.getSettings().interfaceLanguage, textKey))
        );
        featureList.append(item);
      });
      const language = document.createElement("label");
      language.className = "jpdb-reader-onboarding-language";
      const languageText = element("span", "", uiText(this.options.getSettings().interfaceLanguage, "onboardingLanguage"));
      this.languageSelect = document.createElement("select");
      this.languageSelect.name = "interfaceLanguage";
      [
        ["auto", uiText(this.options.getSettings().interfaceLanguage, "automatic")],
        ["en", uiText(this.options.getSettings().interfaceLanguage, "english")],
        ["ja", uiText(this.options.getSettings().interfaceLanguage, "japanese")]
      ].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        option.selected = value === this.options.getSettings().interfaceLanguage;
        this.languageSelect?.append(option);
      });
      language.append(languageText, this.languageSelect);
      const preferences = document.createElement("div");
      preferences.className = "jpdb-reader-onboarding-preferences";
      preferences.append(language, this.createThemeToggle());
      const accentPicker = document.createElement("fieldset");
      accentPicker.className = "jpdb-reader-onboarding-accent";
      const accentLegend = document.createElement("legend");
      accentLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, "onboardingAccentColor");
      const swatches = document.createElement("div");
      swatches.className = "jpdb-reader-onboarding-swatches";
      ONBOARDING_ACCENT_SWATCHES.forEach((color) => {
        const swatch = button("");
        swatch.className = "jpdb-reader-onboarding-swatch";
        swatch.dataset.onboardingAccent = color;
        swatch.style.setProperty("--jpdb-reader-onboarding-swatch", color);
        swatch.setAttribute("aria-label", onboardingAccentLabel(this.options.getSettings().interfaceLanguage, color));
        swatch.title = onboardingAccentLabel(this.options.getSettings().interfaceLanguage, color);
        swatch.addEventListener("click", () => this.applyAccentChoice(color));
        swatches.append(swatch);
      });
      const customAccent = document.createElement("label");
      customAccent.className = "jpdb-reader-onboarding-custom-accent";
      const customAccentText = document.createElement("span");
      customAccentText.dataset.onboardingCopy = "customAccentColor";
      customAccentText.textContent = uiText(this.options.getSettings().interfaceLanguage, "customAccentColor");
      this.accentColorInput = document.createElement("input");
      this.accentColorInput.type = "color";
      this.accentColorInput.name = "accentColor";
      this.accentColorInput.value = sanitizeAccentColor(this.options.getSettings().accentColor);
      this.accentColorInput.setAttribute("aria-label", uiText(this.options.getSettings().interfaceLanguage, "onboardingAccentColor"));
      this.accentColorInput.addEventListener("input", () => this.previewAccentChoice(this.accentColorInput?.value));
      this.accentColorInput.addEventListener("change", () => this.applyAccentChoice(this.accentColorInput?.value));
      customAccent.append(customAccentText, this.accentColorInput);
      accentPicker.append(accentLegend, swatches, customAccent);
      const basics = document.createElement("div");
      basics.className = "jpdb-reader-onboarding-basics";
      basics.append(preferences, accentPicker);
      const immersionOptions = document.createElement("fieldset");
      immersionOptions.className = "jpdb-reader-onboarding-options";
      const immersionLegend = document.createElement("legend");
      immersionLegend.textContent = uiText(this.options.getSettings().interfaceLanguage, "onboardingImmersionOptions");
      this.hoverLookupShortcutInput = shortcutTextInput(
        "shortcuts.hoverLookup",
        this.options.getSettings().shortcuts.hoverLookup,
        this.options.getSettings().interfaceLanguage,
        "blankPlainHover"
      );
      this.manualPageScanShortcutInput = shortcutTextInput(
        "shortcuts.scanPage",
        this.options.getSettings().shortcuts.scanPage,
        this.options.getSettings().interfaceLanguage,
        "pressKeys"
      );
      this.youtubeImmersionInput = checkboxInput("youtubeImmersionEnabled", this.options.getSettings().youtubeImmersionEnabled);
      this.preferJapaneseSiteLanguageInput = checkboxInput("preferJapaneseSiteLanguage", this.options.getSettings().preferJapaneseSiteLanguage);
      this.offlineDictionariesInput = checkboxInput("onboardingInstallOfflineDictionaries", true);
      this.newTabEnabledInput = runningAsBrowserExtension() ? checkboxInput("newTabEnabled", false) : void 0;
      const pageScanMode = createModeGroup(
        "pageScanMode",
        uiText(this.options.getSettings().interfaceLanguage, "pageScanMode"),
        pageScanModeFromSettings(this.options.getSettings()),
        [
          ["off", uiText(this.options.getSettings().interfaceLanguage, "pageScanModeOff")],
          ["auto", uiText(this.options.getSettings().interfaceLanguage, "pageScanModeAuto")],
          ["manual", uiText(this.options.getSettings().interfaceLanguage, "pageScanModeManual")]
        ]
      );
      this.pageScanModeInputs = pageScanMode.inputs;
      this.pageScanModeInputs.forEach((input2) => {
        input2.addEventListener("change", () => this.syncManualPageScanShortcut());
      });
      const ocrMode = createModeGroup(
        "ocrInteractionMode",
        uiText(this.options.getSettings().interfaceLanguage, "ocrInteractionMode"),
        ocrInteractionModeFromSettings(this.options.getSettings()),
        [
          ["auto", uiText(this.options.getSettings().interfaceLanguage, "ocrInteractionModeAuto")],
          ["manual", uiText(this.options.getSettings().interfaceLanguage, "ocrInteractionModeManual")],
          ["off", uiText(this.options.getSettings().interfaceLanguage, "ocrInteractionModeOff")]
        ]
      );
      this.ocrModeInputs = ocrMode.inputs;
      const immersionGrid = document.createElement("div");
      immersionGrid.className = "jpdb-reader-onboarding-immersion-grid";
      const defaultColumn = document.createElement("div");
      defaultColumn.className = "jpdb-reader-onboarding-option-column";
      defaultColumn.append(
        checkboxLabel(this.youtubeImmersionInput, uiText(this.options.getSettings().interfaceLanguage, "youtubeImmersionEnabled")),
        checkboxLabel(this.preferJapaneseSiteLanguageInput, uiText(this.options.getSettings().interfaceLanguage, "preferJapaneseSiteLanguage")),
        checkboxLabel(this.offlineDictionariesInput, uiText(this.options.getSettings().interfaceLanguage, "onboardingInstallOfflineDictionaries"))
      );
      if (this.newTabEnabledInput) {
        defaultColumn.append(
          checkboxLabel(this.newTabEnabledInput, uiText(this.options.getSettings().interfaceLanguage, "newTabEnabled"))
        );
      }
      const scanColumn = document.createElement("div");
      scanColumn.className = "jpdb-reader-onboarding-option-column";
      scanColumn.append(pageScanMode.fieldset, ocrMode.fieldset);
      const shortcutColumn = document.createElement("div");
      shortcutColumn.className = "jpdb-reader-onboarding-option-column";
      this.manualPageScanShortcutLabel = shortcutLabel(this.manualPageScanShortcutInput, uiText(this.options.getSettings().interfaceLanguage, "manualPageScanShortcut"));
      this.manualPageScanShortcutLabel.dataset.manualPageScanShortcut = "true";
      shortcutColumn.append(
        shortcutLabel(this.hoverLookupShortcutInput, uiText(this.options.getSettings().interfaceLanguage, "onboardingHoverShortcut")),
        this.manualPageScanShortcutLabel
      );
      immersionGrid.append(defaultColumn, scanColumn, shortcutColumn);
      immersionOptions.append(
        immersionLegend,
        immersionGrid
      );
      const actions = document.createElement("div");
      actions.className = "jpdb-reader-onboarding-actions";
      const setup = button(uiText(this.options.getSettings().interfaceLanguage, "onboardingAddApiKey"));
      setup.className = "jpdb-reader-btn";
      setup.dataset.onboardingAction = "api-key";
      setup.addEventListener("click", () => void this.complete(true));
      const dictionaries = button(uiText(this.options.getSettings().interfaceLanguage, "onboardingUseWithoutApiKey"));
      dictionaries.className = "jpdb-reader-btn add";
      dictionaries.dataset.onboardingAction = "without-api";
      dictionaries.addEventListener("click", () => void this.complete("dictionaries"));
      actions.append(dictionaries, setup);
      this.languageSelect.addEventListener("change", () => {
        const language2 = normalizeLanguage(this.languageSelect?.value, this.options.getSettings().interfaceLanguage);
        log.info("Onboarding language changed", { language: language2 });
        this.options.setSettings({ ...this.options.getSettings(), interfaceLanguage: language2 });
        this.localize(language2);
      });
      this.panel.addEventListener("click", (event) => {
        this.handleWordLookup(event);
      });
      this.panel.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (this.handleWordLookup(event)) event.preventDefault();
      });
      this.panel.append(closeButton, eyebrow, title, copy, basics, actions, immersionOptions, featureList);
      this.syncThemeSwitch();
      this.syncAccentPicker(this.accentColorInput.value);
      this.syncManualPageScanShortcut();
      applyRedditOverlayScale(this.panel);
      document.body.append(this.backdrop, this.panel);
      this.panel.focus();
      this.annotateJapanese();
    }
    annotateJapanese() {
      if (this.panel) this.options.parseJapanese(this.panel);
    }
    handleWordLookup(event) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const word = target?.closest(".jpdb-reader-onboarding .jpdb-reader-word");
      if (!word || !this.panel?.contains(word) || !this.options.lookupText) return false;
      if (isOnboardingCommandWord(word)) return false;
      const expression = word.dataset.expression?.trim() || readerWordSurfaceText(word).trim() || word.textContent?.trim() || "";
      if (!expression) return false;
      event.preventDefault();
      event.stopPropagation();
      this.options.lookupText(expression, word.dataset.sentence || expression, word);
      return true;
    }
    localize(language) {
      const panel = this.panel;
      if (!panel) return;
      panel.setAttribute("aria-label", uiText(language, "welcomeLabel"));
      panel.querySelector(".jpdb-reader-onboarding-eyebrow")?.replaceChildren(uiText(language, "onboardingEyebrow"));
      const copy = panel.querySelector("p");
      copy?.replaceChildren(uiText(language, "onboardingCopy"));
      panel.querySelector(".jpdb-reader-onboarding-language span")?.replaceChildren(uiText(language, "onboardingLanguage"));
      panel.querySelector('[data-onboarding-copy="theme"]')?.replaceChildren(uiText(language, "theme"));
      panel.querySelector(".jpdb-reader-onboarding-options legend")?.replaceChildren(uiText(language, "onboardingImmersionOptions"));
      panel.querySelector('[data-onboarding-copy="shortcuts.hoverLookup"]')?.replaceChildren(uiText(language, "onboardingHoverShortcut"));
      this.hoverLookupShortcutInput?.setAttribute("placeholder", uiText(language, "blankPlainHover"));
      panel.querySelector('[data-onboarding-copy="shortcuts.scanPage"]')?.replaceChildren(uiText(language, "manualPageScanShortcut"));
      this.manualPageScanShortcutInput?.setAttribute("placeholder", uiText(language, "pressKeys"));
      panel.querySelector('[data-onboarding-copy="youtubeImmersionEnabled"]')?.replaceChildren(uiText(language, "youtubeImmersionEnabled"));
      panel.querySelector('[data-onboarding-copy="preferJapaneseSiteLanguage"]')?.replaceChildren(uiText(language, "preferJapaneseSiteLanguage"));
      panel.querySelector('[data-onboarding-copy="onboardingInstallOfflineDictionaries"]')?.replaceChildren(uiText(language, "onboardingInstallOfflineDictionaries"));
      panel.querySelector('[data-onboarding-copy="newTabEnabled"]')?.replaceChildren(uiText(language, "newTabEnabled"));
      panel.querySelector('[data-onboarding-mode-legend="pageScanMode"]')?.replaceChildren(uiText(language, "pageScanMode"));
      setOnboardingModeLabel(panel, "pageScanMode", "off", uiText(language, "pageScanModeOff"));
      setOnboardingModeLabel(panel, "pageScanMode", "auto", uiText(language, "pageScanModeAuto"));
      setOnboardingModeLabel(panel, "pageScanMode", "manual", uiText(language, "pageScanModeManual"));
      panel.querySelector('[data-onboarding-mode-legend="ocrInteractionMode"]')?.replaceChildren(uiText(language, "ocrInteractionMode"));
      setOnboardingModeLabel(panel, "ocrInteractionMode", "auto", uiText(language, "ocrInteractionModeAuto"));
      setOnboardingModeLabel(panel, "ocrInteractionMode", "manual", uiText(language, "ocrInteractionModeManual"));
      setOnboardingModeLabel(panel, "ocrInteractionMode", "off", uiText(language, "ocrInteractionModeOff"));
      panel.querySelector(".jpdb-reader-onboarding-accent legend")?.replaceChildren(uiText(language, "onboardingAccentColor"));
      panel.querySelector('[data-onboarding-copy="customAccentColor"]')?.replaceChildren(uiText(language, "customAccentColor"));
      this.accentColorInput?.setAttribute("aria-label", uiText(language, "onboardingAccentColor"));
      panel.querySelectorAll("[data-onboarding-accent]").forEach((button2) => {
        const color = button2.dataset.onboardingAccent;
        if (!color) return;
        const label = onboardingAccentLabel(language, color);
        button2.setAttribute("aria-label", label);
        button2.title = label;
      });
      const options = [
        ["auto", uiText(language, "automatic")],
        ["en", uiText(language, "english")],
        ["ja", uiText(language, "japanese")]
      ];
      options.forEach(([value, text]) => {
        const option = this.languageSelect?.querySelector(`option[value="${value}"]`);
        if (option) option.textContent = text;
      });
      const features = Array.from(panel.querySelectorAll(".jpdb-reader-onboarding-features > li"));
      features.forEach((feature, index) => {
        const [headingKey, bodyKey] = ONBOARDING_FEATURE_KEYS[index] ?? ONBOARDING_FEATURE_KEYS[0];
        feature.querySelector("strong")?.replaceChildren(uiText(language, headingKey));
        feature.querySelector("span")?.replaceChildren(uiText(language, bodyKey));
      });
      panel.querySelector('[data-onboarding-action="api-key"]')?.replaceChildren(uiText(language, "onboardingAddApiKey"));
      panel.querySelector('[data-onboarding-action="without-api"]')?.replaceChildren(uiText(language, "onboardingUseWithoutApiKey"));
      const closeButton = panel.querySelector('[data-onboarding-action="close"]');
      closeButton?.setAttribute("aria-label", uiText(language, "closeOnboarding"));
      closeButton?.setAttribute("title", uiText(language, "closeOnboarding"));
      this.syncThemeSwitch();
      this.annotateJapanese();
    }
    async complete(openSettings) {
      const done = log.time("Onboarding complete", { openSettings });
      const installOfflineDictionaries = this.offlineDictionariesInput?.checked === true;
      const settings = this.completedOnboardingSettings(openSettings, installOfflineDictionaries);
      try {
        this.options.setSettings(settings);
        await saveSettings(settings);
        this.close();
        await this.options.onComplete?.(settings);
        if (installOfflineDictionaries) this.options.installOfflineDictionaries?.();
        this.openPostOnboardingSettings(openSettings);
        log.info("Onboarding completed", { openSettings, installOfflineDictionaries, language: settings.interfaceLanguage });
      } catch (error) {
        log.warn("Onboarding completion failed", { openSettings, error });
        throw error;
      } finally {
        done();
      }
    }
    completedOnboardingSettings(openSettings, installOfflineDictionaries) {
      const current = this.options.getSettings();
      const pageScanMode = selectedMode(this.pageScanModeInputs, pageScanModeFromSettings(current));
      const ocrMode = selectedMode(this.ocrModeInputs, ocrInteractionModeFromSettings(current));
      return {
        ...current,
        onboardingSeen: true,
        jpdbDefinitionsEnabled: true,
        localDictionariesEnabled: openSettings !== true || installOfflineDictionaries,
        youtubeImmersionEnabled: this.youtubeImmersionInput?.checked ?? current.youtubeImmersionEnabled,
        preferJapaneseSiteLanguage: this.preferJapaneseSiteLanguageInput?.checked ?? current.preferJapaneseSiteLanguage,
        newTabEnabled: this.newTabEnabledInput?.checked ?? current.newTabEnabled,
        annotationsPaused: pageScanMode === "off",
        manualScanEnabled: pageScanMode === "manual",
        ocrEnabled: ocrMode !== "off",
        ocrAutoScanImages: ocrMode === "auto",
        shortcuts: {
          ...current.shortcuts,
          hoverLookup: this.hoverLookupShortcutInput?.value.trim() ?? current.shortcuts.hoverLookup,
          scanPage: this.manualPageScanShortcutInput?.value.trim() ?? current.shortcuts.scanPage
        },
        dictionaryLookupLinks: defaultDictionaryLookupLinks(openSettings === true ? "jpdb" : "local"),
        interfaceLanguage: selectedOnboardingLanguage(this.languageSelect?.value, current.interfaceLanguage),
        accentColor: sanitizeAccentColor(this.accentColorInput?.value, current.accentColor)
      };
    }
    openPostOnboardingSettings(openSettings) {
      if (openSettings === "dictionaries") this.options.showSettings("dictionaries");
      else if (openSettings) this.options.showSettings("api");
    }
    close() {
      this.cancelAccentPreviewFrame();
      this.panel?.remove();
      this.backdrop?.remove();
      this.panel = void 0;
      this.backdrop = void 0;
      this.languageSelect = void 0;
      this.themeSwitch = void 0;
      this.accentColorInput = void 0;
      this.youtubeImmersionInput = void 0;
      this.preferJapaneseSiteLanguageInput = void 0;
      this.offlineDictionariesInput = void 0;
      this.newTabEnabledInput = void 0;
      this.pageScanModeInputs = [];
      this.ocrModeInputs = [];
      this.manualPageScanShortcutInput = void 0;
      this.manualPageScanShortcutLabel = void 0;
      this.hoverLookupShortcutInput = void 0;
    }
    createThemeToggle() {
      const wrapper = document.createElement("div");
      wrapper.className = "jpdb-reader-onboarding-theme";
      const title = document.createElement("span");
      title.className = "jpdb-reader-theme-title";
      title.id = "jpdb-reader-onboarding-theme-label";
      title.dataset.onboardingCopy = "theme";
      title.textContent = uiText(this.options.getSettings().interfaceLanguage, "theme");
      const chrome = document.createElement("div");
      chrome.className = "VPNavBarAppearance appearance jpdb-reader-theme-appearance";
      this.themeSwitch = button("");
      this.themeSwitch.className = "VPSwitch VPSwitchAppearance jpdb-reader-theme-switch";
      this.themeSwitch.dataset.onboardingThemeSwitch = "true";
      this.themeSwitch.setAttribute("role", "switch");
      this.themeSwitch.setAttribute("aria-labelledby", title.id);
      this.themeSwitch.setAttribute("aria-describedby", title.id);
      setInnerHtml(this.themeSwitch, themeSwitchChrome());
      this.themeSwitch.addEventListener("click", () => this.toggleTheme());
      chrome.append(this.themeSwitch);
      wrapper.append(title, chrome);
      return wrapper;
    }
    toggleTheme() {
      const current = this.options.getSettings();
      const theme = this.effectiveTheme(current.theme) === "dark" ? "light" : "dark";
      this.options.setSettings({ ...current, theme });
      this.syncThemeSwitch();
    }
    syncThemeSwitch() {
      if (!this.themeSwitch) return;
      const language = this.options.getSettings().interfaceLanguage;
      const theme = this.effectiveTheme(this.options.getSettings().theme);
      const label = uiText(language, theme === "dark" ? "switchToLightTheme" : "switchToDarkTheme");
      this.themeSwitch.setAttribute("aria-label", label);
      this.themeSwitch.setAttribute("aria-checked", String(theme === "dark"));
      this.themeSwitch.title = label;
    }
    effectiveTheme(value) {
      if (value === "dark" || value === "light") return value;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyAccentChoice(value) {
      this.cancelAccentPreviewFrame();
      const current = this.options.getSettings();
      const accentColor = sanitizeAccentColor(value, current.accentColor);
      this.options.setSettings({ ...current, accentColor });
      if (this.accentColorInput && this.accentColorInput.value !== accentColor) {
        this.accentColorInput.value = accentColor;
      }
      this.syncAccentPicker(accentColor);
    }
    previewAccentChoice(value) {
      const current = this.options.getSettings();
      const accentColor = sanitizeAccentColor(value, current.accentColor);
      this.pendingAccentPreviewColor = accentColor;
      this.syncAccentPicker(accentColor);
      if (this.accentPreviewFrame !== void 0) return;
      this.accentPreviewFrame = requestOnboardingFrame(() => {
        this.accentPreviewFrame = void 0;
        const pendingColor = this.pendingAccentPreviewColor;
        this.pendingAccentPreviewColor = void 0;
        if (!pendingColor || !this.panel?.isConnected) return;
        this.options.setSettings({ ...this.options.getSettings(), accentColor: pendingColor });
      });
    }
    cancelAccentPreviewFrame() {
      if (this.accentPreviewFrame === void 0) return;
      cancelOnboardingFrame(this.accentPreviewFrame);
      this.accentPreviewFrame = void 0;
      this.pendingAccentPreviewColor = void 0;
    }
    syncAccentPicker(color) {
      const selectedColor = sanitizeAccentColor(color);
      this.panel?.querySelectorAll("[data-onboarding-accent]").forEach((button2) => {
        const selected = sanitizeAccentColor(button2.dataset.onboardingAccent) === selectedColor;
        button2.classList.toggle("selected", selected);
        button2.setAttribute("aria-pressed", String(selected));
      });
    }
    syncManualPageScanShortcut() {
      if (!this.manualPageScanShortcutLabel) return;
      this.manualPageScanShortcutLabel.hidden = selectedMode(this.pageScanModeInputs, "auto") !== "manual";
    }
  }
  function pageScanModeFromSettings(settings) {
    if (settings.annotationsPaused) return "off";
    return settings.manualScanEnabled ? "manual" : "auto";
  }
  function selectedMode(inputs, fallback) {
    return inputs.find((input2) => input2.checked)?.value ?? fallback;
  }
  function normalizeLanguage(value, fallback) {
    return value === "en" || value === "ja" || value === "auto" ? value : fallback;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  function button(text) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    return node;
  }
  function checkboxInput(name, checked) {
    const input2 = document.createElement("input");
    input2.type = "checkbox";
    input2.name = name;
    input2.checked = checked;
    input2.setAttribute("aria-labelledby", onboardingCopyId(name));
    return input2;
  }
  function isOnboardingCommandWord(word) {
    return Boolean(word.closest("button, a[href], input, select, textarea, label, [data-onboarding-action], [data-onboarding-theme-switch], [data-onboarding-accent]"));
  }
  function checkboxLabel(input2, text) {
    const label = document.createElement("label");
    label.className = "inline";
    const copy = document.createElement("span");
    copy.id = onboardingCopyId(input2.name);
    copy.dataset.onboardingCopy = input2.name;
    copy.textContent = text;
    label.append(input2, copy);
    return label;
  }
  function shortcutTextInput(name, value, language, placeholderKey) {
    const input2 = document.createElement("input");
    input2.type = "text";
    input2.name = name;
    input2.value = value;
    input2.placeholder = uiText(language, placeholderKey);
    input2.autocomplete = "off";
    input2.inputMode = "none";
    input2.dataset.shortcutInput = "true";
    input2.setAttribute("aria-labelledby", onboardingCopyId(name));
    input2.addEventListener("keydown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      input2.value = event.key === "Backspace" || event.key === "Delete" ? "" : formatShortcutEvent(event);
    });
    input2.addEventListener("paste", (event) => event.preventDefault());
    return input2;
  }
  function createModeGroup(name, legendText, selectedValue, options) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "jpdb-reader-onboarding-mode-group";
    const legend = document.createElement("legend");
    legend.dataset.onboardingModeLegend = name;
    legend.textContent = legendText;
    const inputs = options.map(([value, text]) => {
      const input2 = document.createElement("input");
      input2.type = "radio";
      input2.name = name;
      input2.value = value;
      input2.checked = value === selectedValue;
      const label = document.createElement("label");
      label.className = "inline";
      label.dataset.onboardingModeLabel = `${name}.${value}`;
      label.append(input2, document.createTextNode(text));
      fieldset.append(label);
      return input2;
    });
    fieldset.prepend(legend);
    return { fieldset, inputs };
  }
  function setOnboardingModeLabel(panel, name, value, text) {
    const label = panel.querySelector(`[data-onboarding-mode-label="${name}.${value}"]`);
    const input2 = label?.querySelector("input");
    if (!label || !input2) return;
    label.replaceChildren(input2, document.createTextNode(text));
  }
  function shortcutLabel(input2, text) {
    const label = document.createElement("label");
    label.className = "jpdb-reader-onboarding-shortcut";
    const copy = document.createElement("span");
    copy.id = onboardingCopyId(input2.name);
    copy.dataset.onboardingCopy = input2.name;
    copy.textContent = text;
    label.append(copy, input2);
    return label;
  }
  function onboardingCopyId(name) {
    return `jpdb-reader-onboarding-${name}`;
  }
  function onboardingAccentLabel(language, color) {
    return `${uiText(language, "onboardingAccentColor")} ${color.toUpperCase()}`;
  }
  function requestOnboardingFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(() => callback());
    }
    return window.setTimeout(callback, 16);
  }
  function cancelOnboardingFrame(id) {
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
    else window.clearTimeout(id);
  }
  function closeIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
  }
  function themeSwitchChrome() {
    return '<span class="check"><span class="icon"><span class="vpi-sun sun" aria-hidden="true"></span><span class="vpi-moon moon" aria-hidden="true"></span></span></span>';
  }
  registerYomuCompanion("settings", { SettingsDialogController, OnboardingController });
  registerYomuCompanion("localDictionaries", { YomitanDictionaryStore });
})();
