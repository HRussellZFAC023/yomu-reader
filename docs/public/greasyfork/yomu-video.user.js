(function() {
  "use strict";
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
    return keys.map((key) => CARD_STATE_ALIASES[key]).find(Boolean);
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
    const state2 = normalizeCardState(rawState);
    if (!state2 || states.includes(state2)) return;
    states.push(state2);
  }
  function primaryCardState(value) {
    return normalizeCardStates(value)[0] ?? "not-in-deck";
  }
  const DECK_CLASS_NAME_LIMIT = 8;
  function cardDeckMembership(card) {
    const names = cardDeckNames(card);
    return {
      source: cardDeckMembershipSource(card),
      names,
      member: hasPrimaryDeckMembership(card) || hasAnkiDeckMembership(card)
    };
  }
  function cardDeckNames(card) {
    return uniqueDeckNames([
      ...primaryDeckNames(card),
      ...ankiDeckNames(card)
    ]);
  }
  function cardDeckMembershipClassNames(card) {
    const membership = cardDeckMembership(card);
    if (!membership.member) return [];
    const classes = /* @__PURE__ */ new Set(["yomu-deck-member"]);
    if (hasPrimaryDeckMembership(card)) addDeckSourceClasses(classes, primaryDeckMembershipSource(card), primaryDeckNames(card));
    if (hasAnkiDeckMembership(card)) addDeckSourceClasses(classes, "anki", ankiDeckNames(card));
    return [...classes];
  }
  function deckClassSlug(value) {
    const slug = value.normalize("NFKC").trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    return slug || "unnamed";
  }
  function uniqueDeckNames(values) {
    const seen = /* @__PURE__ */ new Set();
    return values.map((value) => value?.trim() ?? "").filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  function cardDeckMembershipSource(card) {
    if (!hasPrimaryDeckMembership(card) && hasAnkiDeckMembership(card)) return "anki";
    return primaryDeckMembershipSource(card);
  }
  function primaryDeckMembershipSource(card) {
    return card.source ?? (card.reviewSource === "jiten-api" ? "jiten" : "jpdb");
  }
  function primaryDeckNames(card) {
    return uniqueDeckNames([
      ...card.deckNames ?? [],
      card.sourceDeckName ?? ""
    ]);
  }
  function ankiDeckNames(card) {
    return uniqueDeckNames(card.ankiDeckNames ?? []);
  }
  function hasPrimaryDeckMembership(card) {
    return primaryDeckNames(card).length > 0 || card.cardState.includes("in-deck") || Boolean(card.jpdbDeckMembership?.trim());
  }
  function hasAnkiDeckMembership(card) {
    return ankiDeckNames(card).length > 0;
  }
  function addDeckSourceClasses(classes, source, names) {
    classes.add(`${source}-deck-member`);
    names.slice(0, DECK_CLASS_NAME_LIMIT).forEach((name) => {
      const slug = deckClassSlug(name);
      classes.add(`yomu-deck-${slug}`);
      classes.add(`${source}-deck-${slug}`);
    });
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
  const MANAGED_STORAGE_KEY_PREFIXES = [
    "yomu-",
    "yomu:",
    "yomu.",
    "jpdb-reader-",
    "jpdb-popup-reader-"
  ];
  function isManagedStorageKey(key) {
    return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  const APP_NAME = "よむ";
  const APP_SLUG = "yomu";
  const APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
  const GITHUB_OWNER = "HRussellZFAC023";
  const GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
  const DOCS_BASE_URL = `${GITHUB_PAGES_ORIGIN}/${APP_REPOSITORY_NAME}/`;
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const OPEN_SUBTITLE_TRACKS_EVENT = "yomu-open-subtitle-tracks";
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
  const BRIDGE_REQUEST_EVENT$1 = "yomu-userscript-storage-request";
  const BRIDGE_RESPONSE_EVENT$1 = "yomu-userscript-storage-response";
  const BRIDGE_MARKER$1 = "yomuUserscriptStorageBridge";
  const BRIDGE_TIMEOUT_MS$1 = 1e4;
  function getUserscriptGmStorage() {
    if (typeof window === "undefined" || typeof document === "undefined") return void 0;
    if (bridgeMarkerDataset$1()?.[BRIDGE_MARKER$1] !== "true") return void 0;
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
      }, BRIDGE_TIMEOUT_MS$1);
      let cleanupResponseListener = noop$1;
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
      cleanupResponseListener = addBridgeEventListener$1(BRIDGE_RESPONSE_EVENT$1, onResponse);
      dispatchBridgeEvent$1(BRIDGE_REQUEST_EVENT$1, { id, ...request });
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
      if (isPromiseLike$1(value)) return { kind: "fallback" };
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
        if (!isPromiseLike$1(result)) {
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
        if (isPromiseLike$1(result)) result.catch((error) => debugStorageError("GM storage async delete failed", key, error));
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
      if (host === "hrussellzfac023.github.io") return path.startsWith("/yomu-reader/");
      return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) && path.includes("/newtab/");
    } catch {
      return false;
    }
  }
  function isPromiseLike$1(value) {
    return Boolean(value) && typeof value.then === "function";
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
    JITEN_LOOKUP_LINK,
    JPDB_LOOKUP_LINK,
    YOMU_LOOKUP_LINK,
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
  [[
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    GOO_LOOKUP_LINK.id,
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
    GOO_LOOKUP_LINK.id,
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
    GOO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id
  ]];
  function matchesShortcut(event, shortcut = "") {
    if (!shortcut) return false;
    const parts = parseShortcut(shortcut);
    const key = parts.key?.toLowerCase();
    if (!key) return false;
    const eventKey = normalizeEventKey(event.key).toLowerCase();
    return eventKey === key && shortcutModifiersMatch(event, parts.modifiers);
  }
  function shortcutModifiersMatch(event, modifiers) {
    return event.altKey === modifiers.has("alt") && event.ctrlKey === modifiers.has("ctrl") && event.metaKey === modifiers.has("meta") && event.shiftKey === modifiers.has("shift");
  }
  function parseShortcut(shortcut) {
    const parts = shortcut.split("+").map((part) => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map((part) => part.toLowerCase()));
    const key = [...parts].reverse().find((part) => !isModifierKey(part)) ?? "";
    return { key: key.toLowerCase(), modifiers };
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
  const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status", "hover"]);
  ({
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
  });
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
  const FURIGANA_GROUP_STATES = {
    new: ["new", "not-in-deck", "in-deck"],
    learning: ["learning", "young"],
    known: ["known", "mature", "mastered", "never-forget", "redundant"],
    due: ["due"],
    failed: ["failed"]
  };
  function furiganaHiddenStates(settings) {
    const states = /* @__PURE__ */ new Set();
    for (const group of settings.furiganaHiddenStateGroups) {
      for (const state2 of FURIGANA_GROUP_STATES[group] ?? []) states.add(state2);
    }
    return states;
  }
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
    const state2 = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
    const classes = [
      readerWordClassName(state2, token),
      hasRuby ? "jpdb-reader-has-furi" : "",
      hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
    ].filter(Boolean).join(" ");
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state2)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : "";
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : "";
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : "";
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr} data-pitch-class="${safePitchClass(token.pitchClass)}" data-sentence="${escapeHtml(token.sentence ?? "")}"${miningInsight}${expression}${reading}${deck} tabindex="-1">${content}</span>`;
  }
  function renderDeckMembershipAttributes(card) {
    const membership = cardDeckMembership(card);
    if (!membership.member) return "";
    const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(", "))}"` : "";
    return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
  }
  function shouldRenderRuby(surface, token, settings, allowRuby = true, preserveTokenRubies = false) {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token, settings);
  }
  function furiganaModeAllowsRuby(mode, surface, token, settings) {
    if (mode === "off") return false;
    if (mode === "hover") return true;
    if (mode === "known-status") return !furiganaHiddenStates(settings).has(primaryCardState(token.card.cardState));
    return mode !== "difficult-kanji" || hasDifficultKanji(surface);
  }
  function hasDifficultKanji(surface) {
    for (const char of surface) {
      if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
  }
  function readerWordClassName(state2, token) {
    const classes = ["jpdb-reader-word"];
    if (isParticleCard(token.card)) {
      classes.push("jpdb-reader-particle");
    }
    if (hasKnownCardState(token.card)) {
      classes.push(`jpdb-${state2}`);
      const source = readerCardSource(token.card);
      if (source !== "jpdb") classes.push(`${source}-${state2}`);
    }
    classes.push(...cardDeckMembershipClassNames(token.card));
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
  function inferredInflectedSurfaceRubies(surface, spelling, reading) {
    const visibleSurface = surface.trim();
    const baseSpelling = spelling.trim();
    const baseReading = reading.trim();
    if (!visibleSurface || !baseSpelling || visibleSurface === baseSpelling) return [];
    if (!KANJI_RE.test(visibleSurface) || !KANA_RE.test(baseReading) || baseReading === baseSpelling) return [];
    for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
      if (!baseReading.endsWith(spellingSuffix)) continue;
      const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
      if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
      const surfaceSuffix = visibleSurface.slice(spellingStem.length);
      if (!surfaceSuffix || !KANA_RE.test(surfaceSuffix)) continue;
      const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
      if (rubies.length) return rubies;
    }
    return [];
  }
  function trailingKanaSuffixes(value) {
    const suffixes = [];
    for (let index = 0; index < value.length; index += 1) {
      const suffix = value.slice(index);
      if (suffix && KANA_RE.test(suffix)) suffixes.push(suffix);
    }
    return suffixes.sort((first, second) => second.length - first.length);
  }
  function stemRubiesForInflectedSurface(surfaceStem, readingStem) {
    const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
    if (!trimmed.surface || !trimmed.reading) return [];
    if (!KANJI_RE.test(trimmed.surface) || !KANA_RE.test(trimmed.reading)) return [];
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
    return Boolean(first && second && first === second && KANA_RE.test(first));
  }
  function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
    const sources = sourceTokenRubies(surface, token);
    if (preserveTokenRubies) {
      return sources.flatMap((ruby) => {
        const range = localRubyRange(surface, token, ruby);
        if (!range) return [];
        const base = surface.slice(range.start, range.end);
        if (!KANJI_RE.test(base)) return [];
        if (!KANA_CHAR_RE.test(base)) return [ruby];
        const parts = kanjiOnlyRubySegments(surface, token, ruby);
        return parts.length ? parts : [ruby];
      });
    }
    return sources.flatMap((ruby) => kanjiOnlyRubySegments(surface, token, ruby));
  }
  function sourceTokenRubies(surface, token) {
    if (token.rubies.length) return token.rubies;
    const reading = token.card.reading.trim();
    if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !KANA_RE.test(reading)) return [];
    const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
    if (inferred.length) {
      return inferred.map((ruby) => ({
        ...ruby,
        start: token.start + ruby.start,
        end: token.start + ruby.end
      }));
    }
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
      const baseText = document.createElement("span");
      baseText.className = "jpdb-ocr-ruby-base-text";
      for (const child of Array.from(ruby.childNodes)) {
        if (child instanceof HTMLElement && child.tagName === "RT") {
          furi.textContent += child.textContent ?? "";
        } else if (!(child instanceof HTMLElement && child.tagName === "RP")) {
          baseText.append(child.cloneNode(true));
        }
      }
      base.append(furi, baseText);
      replacement.append(base);
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
  const STORE_KEY = "yomu-ocr-cache-v1";
  const MAX_ENTRIES = 300;
  const MAX_BYTES = 15e5;
  const PERSIST_DELAY_MS = 1200;
  function storage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  }
  function isPersistableOcrCacheKey(key) {
    return !key.startsWith("data:") && !key.startsWith("blob:");
  }
  function loadPersistedOcrCache() {
    const map = /* @__PURE__ */ new Map();
    const store = storage();
    if (!store) return map;
    try {
      const raw = store.getItem(STORE_KEY);
      if (!raw) return map;
      const parsed = JSON.parse(raw);
      for (const [key, entry] of Object.entries(parsed).sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0))) {
        if (!isPersistableOcrCacheKey(key)) continue;
        map.set(key, entry?.r ?? null);
      }
    } catch {
      try {
        store.removeItem(STORE_KEY);
      } catch {
      }
    }
    return map;
  }
  let persistTimer;
  let pendingCache;
  let pendingNow = 0;
  let flushListenersInstalled = false;
  function persistOcrCacheSoon(cache, now) {
    if (!storage()) return;
    installFlushListeners();
    pendingCache = cache;
    pendingNow = now;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      flushPersistedOcrCache();
    }, PERSIST_DELAY_MS);
  }
  function flushPersistedOcrCache() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = void 0;
    }
    const cache = pendingCache;
    if (!cache) return;
    const now = pendingNow || Date.now();
    pendingCache = void 0;
    pendingNow = 0;
    writeOcrCache(cache, now);
  }
  function installFlushListeners() {
    if (flushListenersInstalled) return;
    flushListenersInstalled = true;
    try {
      if (typeof window !== "undefined") {
        window.addEventListener("pagehide", flushPersistedOcrCache, { capture: true });
      }
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") flushPersistedOcrCache();
        }, { capture: true });
      }
    } catch {
    }
  }
  function writeOcrCache(cache, now) {
    const store = storage();
    if (!store) return;
    try {
      const keys = [...cache.keys()].filter(isPersistableOcrCacheKey).reverse().slice(0, MAX_ENTRIES);
      const out = {};
      let bytes = 0;
      for (const key of keys) {
        const result = cache.get(key) ?? null;
        const serialized = JSON.stringify(result);
        bytes += key.length + serialized.length + 24;
        if (bytes > MAX_BYTES) break;
        out[key] = { r: result, at: now };
      }
      store.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
    }
  }
  const PAGE_COUNTER_SELECTOR = "#pageSliderCounter";
  const CURRENT_SCREEN_CLASS = "currentScreen";
  const CURRENT_SCREEN_SELECTOR = `.${CURRENT_SCREEN_CLASS}`;
  const VIEWPORT_CONTAINER_SELECTOR = '[id^="viewport"]';
  const CANVAS_READER_HOST_PATTERNS = [
    /(^|\.)bookwalker\.jp$/i,
    /(^|\.)comic-walker\.com$/i
  ];
  const BACKGROUND_IMAGE_READER_HOST_PATTERNS = [
    /(^|\.)mokuro\.app$/i
  ];
  const BACKGROUND_IMAGE_READER_SELECTOR = [
    "[data-page-index]",
    '[style*="background-image"]',
    '[style*="background:"][style*="url("]'
  ].join(",");
  const MIN_PAGE_CANVAS_DIMENSION = 600;
  const MIN_PAGE_CANVAS_ASPECT = 0.3;
  const MAX_PAGE_CANVAS_ASPECT = 3.2;
  const MIN_RENDERED_DIMENSION = 200;
  const VIEWPORT_COVERAGE_FRACTION = 0.4;
  const VIEWPORT_AREA_FRACTION = 0.18;
  const CONTENT_SAMPLE_SIZE = 20;
  const MIN_CONTENT_CONTRAST = 36;
  const MIN_CONTENT_BUCKETS = 3;
  const MIN_OPAQUE_FRACTION = 0.5;
  function isBookwalkerViewerHost(hostname = location.hostname) {
    return hostname === "viewer.bookwalker.jp" || hostname === "viewer-trial.bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
  }
  function isKnownCanvasReaderHost(hostname = location.hostname) {
    return CANVAS_READER_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  }
  function isKnownBackgroundImageReaderHost(hostname = location.hostname) {
    return BACKGROUND_IMAGE_READER_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  }
  function hasPageShape(canvas) {
    const { width, height } = canvas;
    if (width < MIN_PAGE_CANVAS_DIMENSION || height < MIN_PAGE_CANVAS_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
  }
  function hasRenderedPageShape(rect) {
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const aspect = rect.width / rect.height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
  }
  function isViewportProminent(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const coversAxis = rect.width >= viewportWidth * VIEWPORT_COVERAGE_FRACTION || rect.height >= viewportHeight * VIEWPORT_COVERAGE_FRACTION;
    const coversArea = rect.width * rect.height >= viewportWidth * viewportHeight * VIEWPORT_AREA_FRACTION;
    return coversAxis && coversArea;
  }
  function sampleCanvasContent(canvas) {
    try {
      const sample = document.createElement("canvas");
      sample.width = CONTENT_SAMPLE_SIZE;
      sample.height = CONTENT_SAMPLE_SIZE;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(canvas, 0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
      const { data } = context.getImageData(0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
      const buckets = /* @__PURE__ */ new Set();
      let min = 255;
      let max = 0;
      let hash = 2166136261;
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        opaque++;
        const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 | 0;
        if (luminance < min) min = luminance;
        if (luminance > max) max = luminance;
        buckets.add(luminance >> 4);
        hash ^= luminance;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return { buckets: buckets.size, contrast: max - min, hash, opaque };
    } catch {
      return null;
    }
  }
  function looksLikeRenderedCanvasImage(canvas) {
    return Boolean(canvasRenderedContentSignature(canvas));
  }
  function canvasRenderedContentSignature(canvas) {
    const sample = sampleCanvasContent(canvas);
    if (!sample) return void 0;
    if (sample.opaque < CONTENT_SAMPLE_SIZE * CONTENT_SAMPLE_SIZE * MIN_OPAQUE_FRACTION) return void 0;
    if (sample.contrast < MIN_CONTENT_CONTRAST || sample.buckets < MIN_CONTENT_BUCKETS) return void 0;
    return `${sample.hash.toString(36)}:${sample.contrast}:${sample.buckets}`;
  }
  function isLikelyPageCanvas(canvas, lenient) {
    if (!hasPageShape(canvas)) return false;
    if (lenient) return true;
    return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
  }
  function pageCanvases(hostname = location.hostname) {
    const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((canvas) => isLikelyPageCanvas(canvas, lenient));
    return isBookwalkerViewerHost(hostname) ? preferCurrentScreenCanvases(canvases) : canvases;
  }
  function preferCurrentScreenCanvases(canvases) {
    if (canvases.length < 2) return canvases;
    const current = canvases.filter(isOnScreenViewportCanvas);
    if (!current.length) return canvases;
    const renderedCurrent = current.filter(looksLikeRenderedCanvasImage);
    if (renderedCurrent.length) return renderedCurrent;
    const renderedFallback = canvases.filter((canvas) => !current.includes(canvas)).filter(looksLikeRenderedCanvasImage);
    return renderedFallback.length ? renderedFallback : current;
  }
  function isOnScreenViewportCanvas(canvas) {
    const viewport = canvas.closest(VIEWPORT_CONTAINER_SELECTOR);
    return viewport ? viewport.classList.contains(CURRENT_SCREEN_CLASS) : Boolean(canvas.closest(CURRENT_SCREEN_SELECTOR));
  }
  function hasBackgroundReaderSignal(element) {
    return element.hasAttribute("data-page-index") || Boolean(element.closest("[data-mokuro-reader]"));
  }
  function isLikelyBackgroundImagePage(element, hostname) {
    if (!backgroundImageReaderUrl(element)) return false;
    const rect = element.getBoundingClientRect();
    if (!hasRenderedPageShape(rect)) return false;
    const knownHost = isKnownBackgroundImageReaderHost(hostname);
    if (!knownHost && !hasBackgroundReaderSignal(element)) return false;
    return knownHost || isViewportProminent(element);
  }
  function backgroundImagePages(hostname = location.hostname) {
    return Array.from(document.querySelectorAll(BACKGROUND_IMAGE_READER_SELECTOR)).filter((element) => isLikelyBackgroundImagePage(element, hostname));
  }
  function isCanvasReaderPage(hostname = location.hostname) {
    return pageCanvases(hostname).length > 0;
  }
  function collectCanvasReaderSurfaces(hostname = location.hostname) {
    return pageCanvases(hostname);
  }
  function isBackgroundImageReaderPage(hostname = location.hostname) {
    return backgroundImagePages(hostname).length > 0;
  }
  function collectBackgroundImageReaderSurfaces(hostname = location.hostname) {
    return backgroundImagePages(hostname);
  }
  function isReaderRasterPage(hostname = location.hostname) {
    return isCanvasReaderPage(hostname) || isBackgroundImageReaderPage(hostname) || isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname);
  }
  function canvasReaderPageSignature() {
    const counter = document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? "";
    const scroll = isBookwalkerViewerHost() ? Math.round((window.scrollY || 0) / 40) : 0;
    const surfaces = pageCanvases().length;
    const backgrounds = backgroundImagePages().map((element) => `${element.getAttribute("data-page-index") ?? ""}:${backgroundImageReaderUrl(element) ?? ""}`).join("|");
    return `${counter}|${scroll}|${surfaces}|${backgrounds}`;
  }
  function captureCanvasDataUrl(canvas, maxPixels) {
    try {
      const width = canvas.width;
      const height = canvas.height;
      if (!width || !height) return void 0;
      const pixels = width * height;
      const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      if (scale >= 1) return canvas.toDataURL("image/jpeg", 0.86);
      const scaled = document.createElement("canvas");
      scaled.width = Math.max(1, Math.round(width * scale));
      scaled.height = Math.max(1, Math.round(height * scale));
      const context = scaled.getContext("2d");
      if (!context) return void 0;
      context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      return scaled.toDataURL("image/jpeg", 0.86);
    } catch {
      return void 0;
    }
  }
  function isCanvasReadable(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    try {
      context.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }
  const READER_PAGE_IMAGE_PATTERNS = [
    /\/item\/xhtml\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i,
    // SpeedBinB / NFBR page tile
    /\/(?:page|img|image|content)s?\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i
  ];
  const READER_PAGE_IMAGE_EXCLUDE = /(?:icon|logo|avatar|banner|thumb(?:nail)?|sprite|favicon|cover|ad[\b_-])/i;
  function readerCanvasSourceImageUrl() {
    let entries;
    try {
      entries = performance.getEntriesByType("resource");
    } catch {
      return void 0;
    }
    const urls = entries.map((entry) => entry.name).filter((url) => typeof url === "string" && !READER_PAGE_IMAGE_EXCLUDE.test(url));
    for (const pattern of READER_PAGE_IMAGE_PATTERNS) {
      for (let index = urls.length - 1; index >= 0; index--) {
        if (pattern.test(urls[index])) return urls[index];
      }
    }
    return void 0;
  }
  function canUseReaderCanvasSourceImageFallback(hostname = location.hostname) {
    return !isBookwalkerViewerHost(hostname);
  }
  function positionCanvasFrameImage(frame, rect) {
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  }
  function backgroundImageReaderUrl(element) {
    const image = getComputedStyle(element).backgroundImage;
    return firstCssBackgroundUrl(image);
  }
  function firstCssBackgroundUrl(value) {
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/iu);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
    return raw.trim() || void 0;
  }
  const CAPTURE_VISIBLE_TAB_MESSAGE = "yomu.captureVisibleTab";
  const SCREENSHOT_HIDE_STYLE_ID = "yomu-extension-screenshot-hide-style";
  async function captureReaderSurfaceViaExtensionScreenshot(surface, maxPixels) {
    const rect = surface.getBoundingClientRect();
    const clip = visibleViewportIntersection(rect);
    if (!clip || clip.width < 2 || clip.height < 2) return void 0;
    const screenshot = await withReaderUiHidden(requestVisibleTabScreenshot);
    if (!screenshot) return void 0;
    const cropped = await cropVisibleTabScreenshot(screenshot, clip, maxPixels);
    return cropped ? { dataUrl: cropped, rect: new DOMRect(clip.left, clip.top, clip.width, clip.height) } : void 0;
  }
  async function requestVisibleTabScreenshot() {
    const extension = extensionRuntime();
    if (!extension?.runtime.id || typeof extension.runtime.sendMessage !== "function") return void 0;
    const response = await sendExtensionMessage(extension, { type: CAPTURE_VISIBLE_TAB_MESSAGE, format: "jpeg", quality: 88 });
    return screenshotResponseDataUrl(response);
  }
  function sendExtensionMessage(extension, message) {
    if (extension.promiseBased) {
      try {
        return Promise.resolve(extension.runtime.sendMessage?.(message)).catch(() => void 0);
      } catch {
        return Promise.resolve(void 0);
      }
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(response);
      };
      const timer = window.setTimeout(() => finish(void 0), 6e3);
      try {
        const maybePromise = extension.runtime.sendMessage?.(message, (response) => {
          if (extension.runtime.lastError) finish(void 0);
          else finish(response);
        });
        if (isPromiseLike(maybePromise)) {
          void maybePromise.then(finish, () => finish(void 0));
        }
      } catch {
        finish(void 0);
      }
    });
  }
  function extensionRuntime() {
    const global = globalThis;
    if (global.browser?.runtime) return { promiseBased: true, runtime: global.browser.runtime };
    if (global.chrome?.runtime) return { promiseBased: false, runtime: global.chrome.runtime };
    return void 0;
  }
  function screenshotResponseDataUrl(response) {
    const detail = response;
    return detail?.ok && typeof detail.dataUrl === "string" && detail.dataUrl.startsWith("data:image/") ? detail.dataUrl : void 0;
  }
  async function withReaderUiHidden(task) {
    const style = ensureScreenshotHideStyle();
    document.documentElement.dataset.yomuExtensionScreenshotCapture = "true";
    await animationFrame();
    try {
      return await task();
    } finally {
      delete document.documentElement.dataset.yomuExtensionScreenshotCapture;
      style.remove();
    }
  }
  function ensureScreenshotHideStyle() {
    document.getElementById(SCREENSHOT_HIDE_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = SCREENSHOT_HIDE_STYLE_ID;
    const selectors = [
      'html[data-yomu-extension-screenshot-capture="true"] [data-jpdb-reader-root]',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-canvas-frame',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-background-frame',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-layer'
    ];
    style.textContent = `${selectors.join(",")} { visibility: hidden !important; }`;
    document.documentElement.append(style);
    return style;
  }
  function animationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  function visibleViewportIntersection(rect) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return null;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? { left, top, width, height } : null;
  }
  async function cropVisibleTabScreenshot(dataUrl, rect, maxPixels) {
    try {
      const image = await loadScreenshotImage(dataUrl);
      const scaleX = image.naturalWidth / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      const scaleY = image.naturalHeight / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      const source = {
        left: Math.max(0, Math.round(rect.left * scaleX)),
        top: Math.max(0, Math.round(rect.top * scaleY)),
        width: Math.max(1, Math.round(rect.width * scaleX)),
        height: Math.max(1, Math.round(rect.height * scaleY))
      };
      source.width = Math.min(source.width, image.naturalWidth - source.left);
      source.height = Math.min(source.height, image.naturalHeight - source.top);
      if (source.width <= 0 || source.height <= 0) return void 0;
      const pixels = source.width * source.height;
      const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(image, source.left, source.top, source.width, source.height, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.86);
    } catch {
      return void 0;
    }
  }
  function loadScreenshotImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Screenshot decode failed."));
      image.src = dataUrl;
    });
  }
  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
  }
  const ID_ATTR = "data-yomu-mid";
  const MAX_OPS_PER_CANVAS = 6e3;
  const PRUNE_KEEP = 3e3;
  const MAX_REBUILD_DEPTH = 6;
  function pageWindow() {
    const uw = globalThis.unsafeWindow;
    return uw || globalThis;
  }
  function state() {
    const win = pageWindow();
    return win.__yomuCanvasMirror ??= { seq: 0, nextId: 1, installed: false, records: /* @__PURE__ */ Object.create(null) };
  }
  function isBookwalkerHost(hostname) {
    return hostname === "viewer.bookwalker.jp" || hostname === "viewer-trial.bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
  }
  function canvasId(canvas, create) {
    const el = canvas;
    if (el && typeof el.getAttribute === "function" && typeof el.setAttribute === "function") {
      let id = el.getAttribute(ID_ATTR);
      return id;
    }
    if (el && el.__yomuMid) return el.__yomuMid;
    return null;
  }
  const destKey = (op) => `${op.dx},${op.dy},${op.dw},${op.dh}`;
  function selectLatestContentOps(ops, beforeSeq) {
    const byDest = /* @__PURE__ */ new Map();
    for (const op of ops) {
      if (op.clear || op.seq >= beforeSeq) continue;
      byDest.set(destKey(op), op);
    }
    return [...byDest.values()].sort((a, b) => a.seq - b.seq);
  }
  function collectLeafUrls(id, beforeSeq, lookup, out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), depth = 0) {
    if (!id || depth > MAX_REBUILD_DEPTH || seen.has(id)) return out;
    const record = lookup(id);
    if (!record) return out;
    const next = new Set(seen).add(id);
    for (const op of selectLatestContentOps(record.ops, beforeSeq)) {
      if (op.srcId) collectLeafUrls(op.srcId, op.seq, lookup, out, next, depth + 1);
      else if (op.url) out.add(op.url);
    }
    return out;
  }
  function markSkip(context) {
    if (context) context.__yomuMirrorSkip = true;
    return context;
  }
  function isReadable(canvas) {
    try {
      markSkip(canvas.getContext("2d", { willReadFrequently: true }))?.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }
  function rebuildById(id, beforeSeq, images, seen, depth) {
    if (depth > MAX_REBUILD_DEPTH || seen.has(id)) return null;
    const record = state().records[id];
    if (!record || !record.w || !record.h) return null;
    const ops = selectLatestContentOps(record.ops, beforeSeq);
    if (!ops.length) return null;
    const out = document.createElement("canvas");
    out.width = record.w;
    out.height = record.h;
    const ctx = markSkip(out.getContext("2d", { willReadFrequently: true }));
    if (!ctx) return null;
    seen.add(id);
    let drew = 0;
    for (const op of ops) {
      let source = null;
      if (op.srcId) source = rebuildById(op.srcId, op.seq, images, new Set(seen), depth + 1);
      else if (op.url) source = images.get(op.url) ?? null;
      if (!source) continue;
      try {
        if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
        else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
        else ctx.drawImage(source, op.dx, op.dy);
        drew++;
      } catch {
      }
    }
    return drew ? out : null;
  }
  async function captureCanvasMirror(canvas, loadCleanImage) {
    installCanvasMirrorRecorder();
    const s = state();
    const id = canvasId(canvas);
    const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, (key) => s.records[key]) : /* @__PURE__ */ new Set();
    const images = /* @__PURE__ */ new Map();
    if (urls.size) {
      await Promise.all([...urls].map(async (url) => {
        try {
          const image = await loadCleanImage(url);
          if (image) images.set(url, image);
        } catch {
        }
      }));
    }
    const rebuilt = id && images.size ? rebuildById(id, Number.POSITIVE_INFINITY, images, /* @__PURE__ */ new Set(), 0) : null;
    return rebuilt && isReadable(rebuilt) ? rebuilt : void 0;
  }
  function recorderBootstrap(win, opts) {
    if (win.__yomuCanvasMirrorRecorder) return;
    win.__yomuCanvasMirrorRecorder = true;
    const ATTR = opts.a, MAX = opts.m, KEEP = opts.k;
    const S = win.__yomuCanvasMirror = win.__yomuCanvasMirror || { seq: 0, nextId: 1, installed: true, records: /* @__PURE__ */ Object.create(null) };
    S.installed = true;
    const HC = win.HTMLCanvasElement;
    const OC = win.OffscreenCanvas;
    const isCanvas = (o) => Boolean(o) && (HC != null && o instanceof HC || OC != null && o instanceof OC);
    const srcUrl = (o) => {
      const m = o;
      return m ? typeof m.currentSrc === "string" && m.currentSrc || typeof m.src === "string" && m.src || "" : "";
    };
    const idOf = (c, create) => {
      const el = c;
      if (el && typeof el.getAttribute === "function" && typeof el.setAttribute === "function") {
        let i = el.getAttribute(ATTR);
        if (!i && create) {
          i = "m" + S.nextId++;
          try {
            el.setAttribute(ATTR, i);
          } catch {
            return null;
          }
        }
        return i;
      }
      if (el && el.__yomuMid) return el.__yomuMid;
      if (el && create) {
        try {
          return el.__yomuMid = "m" + S.nextId++;
        } catch {
          return null;
        }
      }
      return null;
    };
    const rec = (id, w, h) => {
      let r = S.records[id];
      if (!r) {
        r = { w, h, ops: [] };
        S.records[id] = r;
      }
      if (w) r.w = w;
      if (h) r.h = h;
      if (r.ops.length >= MAX) r.ops.splice(0, r.ops.length - KEEP);
      return r;
    };
    const patch = (p) => {
      if (!p || p.__yomuMirrorPatched) return;
      p.__yomuMirrorPatched = true;
      const draw = p.drawImage;
      p.drawImage = function(src) {
        if (!this.__yomuMirrorSkip) {
          try {
            const cid = idOf(this.canvas, true);
            if (cid) {
              const r = rec(cid, this.canvas.width, this.canvas.height);
              const a = arguments;
              const o = { seq: S.seq++, srcId: isCanvas(src) ? idOf(src, true) : null, url: isCanvas(src) ? "" : srcUrl(src), sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
              if (a.length === 9) {
                o.sx = a[1];
                o.sy = a[2];
                o.sw = a[3];
                o.sh = a[4];
                o.dx = a[5];
                o.dy = a[6];
                o.dw = a[7];
                o.dh = a[8];
              } else if (a.length === 5) {
                o.dx = a[1];
                o.dy = a[2];
                o.dw = a[3];
                o.dh = a[4];
              } else if (a.length === 3) {
                o.dx = a[1];
                o.dy = a[2];
              }
              r.ops.push(o);
            }
          } catch {
          }
        }
        return draw.apply(this, arguments);
      };
      const clr = p.clearRect;
      p.clearRect = function(x, y, w, h) {
        if (!this.__yomuMirrorSkip) {
          try {
            if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) {
              const cid = idOf(this.canvas, true);
              if (cid) rec(cid, this.canvas.width, this.canvas.height).ops.push({ seq: S.seq++, srcId: null, url: "", sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true });
            }
          } catch {
          }
        }
        return clr.apply(this, arguments);
      };
    };
    const w2 = win;
    patch(w2.CanvasRenderingContext2D?.prototype);
    patch(w2.OffscreenCanvasRenderingContext2D?.prototype);
  }
  function injectRecorderIntoPage(opts) {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const source = `;(${recorderBootstrap.toString()})(window, ${JSON.stringify(opts)});`;
    try {
      const script = document.createElement("script");
      const nonce = [...document.querySelectorAll("script[nonce]")].map((el) => el.getAttribute("nonce")).find(Boolean);
      if (nonce) script.setAttribute("nonce", nonce);
      const trusted = createTrustedMirrorScript(source);
      if (trusted) script.textContent = trusted;
      else script.textContent = source;
      parent.append(script);
      script.remove();
    } catch {
      return false;
    }
    return Boolean(pageWindow().__yomuCanvasMirror);
  }
  function createTrustedMirrorScript(code) {
    try {
      const factory = globalThis.trustedTypes;
      if (!factory?.createPolicy) return null;
      const policy = factory.createPolicy("yomu-canvas-mirror", { createScript: (s) => s });
      return policy?.createScript ? policy.createScript(code) : null;
    } catch {
      return null;
    }
  }
  function installCanvasMirrorRecorder(hostname = location.hostname) {
    if (!isBookwalkerHost(hostname)) return;
    const uw = globalThis.unsafeWindow;
    const differentRealm = Boolean(uw) && uw !== globalThis;
    if (differentRealm) {
      const existing = uw.__yomuCanvasMirror;
      if (existing?.installed) return;
      if (injectRecorderIntoPage({ a: ID_ATTR, m: MAX_OPS_PER_CANVAS, k: PRUNE_KEEP })) return;
    }
    const s = state();
    if (s.installed) return;
    recorderBootstrap(pageWindow(), { a: ID_ATTR, m: MAX_OPS_PER_CANVAS, k: PRUNE_KEEP });
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
      matches: (target) => target.hostname === "api.jiten.moe" && (target.pathname.startsWith("/api/tts/word/") || target.pathname.startsWith("/api/tts/sentence/") || target.pathname === "/api/vocabulary/search" || target.pathname === "/api/vocabulary/parse" || /^\/api\/vocabulary\/\d+\/\d+\/info$/u.test(target.pathname))
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
    if (options.preferFetch && (!userscriptRequest || isSameOriginUrl(url) || prefersProxyFetchOverUserscriptBridge())) {
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
  function prefersProxyFetchOverUserscriptBridge() {
    return typeof window !== "undefined" && window.__YOMU_READER_RUNTIME__ === "newtab";
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
      onboardingCopy: "Make Japanese text, subtitles, and images tappable.",
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
      featureStudyBody: "Review Jiten, JPDB, Anki, and optional kanji cards in order on the built-in study page.",
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
      apiAccessHelp: "Paste a Jiten or JPDB API key. Jiten starts with ak_.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
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
      newTabApiSrs: "API SRS (Jiten / JPDB)",
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
      parseSelection: "Look up selected text",
      lookupOnClick: "Look up on tap or click",
      lookupOnHover: "Look up on hover",
      lookupOnMiddleMouse: "Look up with middle-mouse hold",
      showFloatingButton: "Show settings puck",
      manualScanEnabled: "Manual scan only (tap the puck to scan)",
      puckMenuLabel: `${APP_NAME} menu`,
      puckStudyPage: "Study page",
      puckPauseAnnotations: "Pause annotations",
      puckResumeAnnotations: "Resume annotations",
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
      subtitleTranscriptPlacement: "Transcript panel position",
      subtitleTranscriptAutoScroll: "Scroll transcript with playback",
      subtitleTranscriptAutoScrollResumeSeconds: "Resume auto-scroll delay (s)",
      subtitleAutoCopyLine: "Auto-copy subtitle lines",
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
      ankiHelp: "Full Anki uses AnkiConnect. Handoff creates notes.",
      jpdbDefinitionsEnabled: "Show JPDB definitions",
      localDictionariesEnabled: "Show imported dictionary definitions",
      dictionarySourcesInitiallyExpanded: "Open sources by default",
      localDictionaryMaxResults: "Dictionary result limit",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import settings or ZIPs.",
      lookupPills: "Lookup pills",
      lookupPillsHelp: "Tokens: {query}, {word}, {reading}.",
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
      frequencyDictionaries: "Frequency dictionaries",
      install: "Install",
      installing: "Installing",
      queued: "Queued",
      saveAfterInstall: "Save after install",
      download: "Download",
      downloadAndImport: "Download and import",
      update: "Update",
      noLocalDictionaries: "No local dictionaries yet.",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryOnlyJpdb: "Only JPDB is enabled. Import Yomitan for local.",
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
      noLocalDictionariesImported: "No dictionaries imported yet.",
      dictionaryDownloadFailed: "Dictionary download failed.",
      dictionaryDownloadTimedOut: "Dictionary download timed out.",
      dictionaryDownloadNotZip: "Download was not a ZIP.",
      dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
      dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
      dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
      dictionaryInstallQueueHelp: "Installs take a few minutes.",
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
      searchAnimeSubtitles: "Search anime subtitles",
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
      pdfReader: "PDF Reader",
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
      switchReviewTarget: "Switch review target",
      switchGradingProvider: "Switch grading provider",
      jpdbKanjiUpdated: "JPDB kanji updated.",
      jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check kanji reviews.",
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
      ankiCardDetailsPending: "Matched in Anki. Loading card details from AnkiConnect...",
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
      recommendedJitendex: "J-E with examples.",
      recommendedJmdict: "Core J-E dictionary.",
      recommendedJmnedict: "Proper names.",
      recommendedWtyJapaneseJapanese: "JA-JA Wiktionary.",
      recommendedPixivLight: "Pixiv terms.",
      recommendedKanjidic: "Kanji facts.",
      recommendedJpdbKanji: "JPDB kanji.",
      recommendedJpdbv2Kana: "JPDB frequency.",
      recommendedBccwj: "BCCWJ frequency.",
      recommendedJiten: "Jiten frequency.",
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
featureTextBody	日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	内蔵の学習ページでJiten・JPDB・Anki・漢字を復習できます。
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
noLocalDictionariesImported	ローカル辞書は未追加です。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	数分かかります。完了後に保存できます。
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
pageCoverageSummary	{percent}%・{known}/{total}・新規{unknown}・i+1 {iPlusOne}
noImmersionExamples	イマージョンキットの例文が見つかりません。
noImmersionExamplesCompact	例文なし
noLocalDictionaries	JMdictかYomitan ZIPを追加してください。
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
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
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
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	Jiten/JPDB APIキーを貼ります。Jitenはak_で始まります。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
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
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
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
newTabAuto	自動: API/Anki後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
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
parseSelection	選択テキストを検索
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
manualScanEnabled	手動スキャンのみ（パックをタップしてスキャン）
puckMenuLabel	よむ メニュー
puckStudyPage	学習ページ
puckPauseAnnotations	注釈を一時停止
puckResumeAnnotations	注釈を再開
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
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左側に
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
suppressAutoAudioOnVideo	動画ページでは自動再生を無効
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
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後の再開 (秒)
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
ankiHelp	AnkiConnectで全機能。受け渡しは新規ノートのみ。
jpdbDefinitionsEnabled	JPDB定義を表示
localDictionariesEnabled	インポート済み辞書の定義を表示
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
localDictionaryMaxResults	辞書結果の上限
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	設定やZIPを読み込みます。
lookupPills	検索ピル
lookupPillsHelp	トークン: {query}、{word}、{reading}。
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
frequencyDictionaries	頻度辞書
install	インストール
installing	インストール中
queued	待機中
download	ダウンロード
downloadAndImport	ダウンロードしてよむにインポート
update	更新
checkingDictionaries	インポート済み辞書を確認中...
dictionaryOnlyJpdb	JPDBのみです。Yomitan辞書でローカル定義を追加。
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
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
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
recommendedJitendex	例文付き日英辞書です。
recommendedJmdict	基本日英辞書です。
recommendedJmnedict	固有名詞辞書です。
recommendedWtyJapaneseJapanese	Wiktionary日日辞書。
recommendedPixivLight	Pixiv用語辞書です。
recommendedKanjidic	漢字情報です。
recommendedMarvncMonolingual	日本語辞書集です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedJpdbv2Kana	JPDB頻度です。
recommendedBccwj	BCCWJ頻度です。
recommendedJiten	Jiten頻度です。
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
    lines.push({ text, box, vertical: isVerticalOcrBox(box, text.length) });
  }
  function isVerticalOcrBox(box, textLength) {
    if (textLength <= 1) return false;
    const aspect = box.height / Math.max(1, box.width);
    return aspect >= (textLength >= 4 ? 1.05 : 1.2);
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
    const state2 = { width: fallbackWidth, height: fallbackHeight, lines: [] };
    for (const response of cloudVisionResponses(record)) {
      appendCloudVisionPages(response, state2);
      appendCloudVisionTextAnnotations(response, state2);
    }
    return state2.lines.length ? { width: state2.width, height: state2.height, lines: state2.lines } : null;
  }
  function cloudVisionResponses(record) {
    if (Array.isArray(record.responses)) return record.responses;
    return "fullTextAnnotation" in record ? [record] : [];
  }
  function appendCloudVisionPages(response, state2) {
    const annotation = response?.fullTextAnnotation;
    const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
    for (const page of pages) appendCloudVisionPage(page, state2);
  }
  function appendCloudVisionPage(page, state2) {
    state2.width = numberFrom(page.width) || state2.width;
    state2.height = numberFrom(page.height) || state2.height;
    for (const block of cloudVisionPageBlocks(page)) {
      for (const paragraph of cloudVisionBlockParagraphs(block)) {
        pushCloudVisionParagraphLines(paragraph, state2.lines, state2.width, state2.height);
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
  function appendCloudVisionTextAnnotations(response, state2) {
    const annotations = Array.isArray(response?.textAnnotations) ? response.textAnnotations : [];
    if (state2.lines.length || annotations.length <= 1) return;
    for (const annotationItem of annotations.slice(1)) {
      const item = annotationItem;
      const text = cleanOcrText(item.description);
      const box = normalizeCloudVisionVertices(item.boundingPoly?.vertices, state2.width, state2.height);
      pushJapaneseOcrLine(state2.lines, text, box);
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
  function googleLensUploadCallbackLiteral(html, key) {
    const marker = "AF_initDataCallback(";
    let searchIndex = 0;
    while (searchIndex < html.length) {
      const markerIndex = html.indexOf(marker, searchIndex);
      if (markerIndex < 0) return null;
      const literalStart = markerIndex + marker.length;
      const literal = readBalancedLiteral(html, literalStart);
      if (literal && callbackLiteralHasKey(literal, key)) return literal;
      searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
  }
  function callbackLiteralHasKey(literal, key) {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key)}['"]`).test(literal);
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
        const key = parseObjectKey();
        skipWhitespace();
        expect(":");
        record[key] = parseValue();
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
      vertical: paragraphVertical || isVerticalOcrBox(box, text.length)
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
    const points = ["top_left", "top_right", "bottom_right", "bottom_left"].map((key) => asRecord(record[key])).filter((point) => Boolean(point));
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
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
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
  const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first, second) => second.length - first.length);
  const PARTICLE_PREFIX_REMAINDER_RE = /^[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ffー]/u;
  const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なかっ|なかった|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
  const HIRAGANA_SEGMENT_RE = /^[\u3040-\u309fー]+$/u;
  const SINGLE_KANJI_SEGMENT_RE = /^[\u3400-\u9fff]$/u;
  const SINGLE_KANJI_HIRAGANA_STEM_RE = /^[\u3400-\u9fff][\u3040-\u309fー]*$/u;
  const SURU_STEM_SEGMENT_RE = /[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ff]/u;
  const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
  const NUMERIC_COUNTER_SUFFIX_SEGMENTS = /* @__PURE__ */ new Set(["話", "巻", "回", "章", "部", "番", "号", "版", "人", "名", "匹", "頭", "羽", "枚", "本", "冊", "個", "台", "件", "分", "秒", "時", "日", "月", "年", "泊", "円"]);
  const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
  const SEGMENTER_COMPOUND_OVERRIDES = /* @__PURE__ */ new Set(["巨乳"]);
  const SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH = Array.from(SEGMENTER_COMPOUND_OVERRIDES).reduce((max, value) => Math.max(max, value.length), 0);
  const KANA_VERB_STEM_END_RE = /[うくぐすずつづぬふぶぷむゆる]$/u;
  const KANA_I_ADJECTIVE_END_RE = /い$/u;
  const SMALL_TSU_RE = /っ/u;
  const KANA_CONTENT_WORD_MIN_LENGTH = 3;
  const NON_HIRAGANA_SCRIPT_RE = /[㐀-鿿々〆ヵヶ゠-ヿ]/u;
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
    return mergeInflectedFallbackSegments(
      splitLeadingParticleSegments(mergeContiguousKanaSegments(mergeSegmenterCompoundOverrides(splitNumericCounterPrefixSegments(segments, sourceText)))),
      sourceText
    );
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
  function contiguousKanaMergeSpanAt(segments, startIndex) {
    const first = segments[startIndex];
    if (!first || !isPureKanaSegment(first.surface)) return null;
    const previous = segments[startIndex - 1];
    const atKanaRunStart = !previous || !isPureKanaSegment(previous.surface) || previous.end !== first.start;
    if (isInflectionBoundarySegment(first.surface) && !atKanaRunStart) return null;
    const runEnd = contiguousKanaRunEnd(segments, startIndex);
    if (runEnd - startIndex < 2) return null;
    let surface = first.surface;
    let lastIndex = startIndex;
    for (let index = startIndex + 1; index < runEnd; index += 1) {
      const current = segments[index];
      const trailingSpan = sliceKanaSpanSurface(segments, index, runEnd);
      if (isInflectionBoundarySegment(current.surface) || isKanaContentWordSpan(trailingSpan)) break;
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
    if (!first || isInflectionBoundarySegment(first.surface)) return null;
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
    return isInflectionContinuationSegment(nextSurface) || HIRAGANA_SEGMENT_RE.test(nextSurface) && SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface) && !hasUsefulFallbackDeinflection(currentSurface);
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
    return lookupTerms.some((term) => term.endsWith("する"));
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
      if (!value) return false;
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  const MAX_CACHE_ITEMS = 36;
  const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15e3;
  const OCR_STATUS_READY_DWELL_MS = 1e3;
  const OCR_STATUS_FADE_MS = 360;
  const GOOGLE_LENS_ENDPOINT = "https://lensfrontend-pa.googleapis.com/v1/crupload";
  const GOOGLE_LENS_API_KEY = "AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY";
  const DEFAULT_LOCAL_OCR_ENDPOINT_URL = "http://127.0.0.1:7331/ocr";
  const LENS_PLATFORM_WEB = 3;
  const LENS_SURFACE_CHROMIUM = 4;
  const LENS_AUTO_FILTER = 7;
  const log$2 = Logger.scope("OCR");
  const STALE_OCR_STATE = Symbol("stale-ocr-state");
  let ocrLayerCounter = 0;
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
  const VIDEO_FRAME_PLAYER_SELECTOR = [
    "#movie_player",
    ".html5-video-player",
    "ytd-player",
    "#player",
    "#player-container",
    "#player-container-outer",
    "[data-yomu-video-frame]"
  ].join(",");
  const VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR = [
    "ytd-thumbnail",
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-playlist-thumbnail",
    "ytd-video-preview",
    "yt-thumbnail-view-model",
    "yt-lockup-view-model",
    "ytm-rich-item-renderer",
    "ytm-compact-video-renderer",
    "ytm-video-card-renderer",
    "ytm-video-with-context-renderer",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2"
  ].join(",");
  const VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR = [
    'a[href*="/watch"]',
    'a[href*="/shorts/"]'
  ].join(",");
  const OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR = [
    VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR,
    "yt-image",
    ".yt-core-image"
  ].join(",");
  function shouldSkipOcrRequest(state2, userRequested) {
    return state2.autoSkipped && !userRequested;
  }
  function updateOcrRequestFlags(state2, image, userRequested) {
    state2.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
    state2.manualRequested ||= userRequested;
    if (userRequested) state2.autoSkipped = false;
  }
  function isOcrImageStateIdle(state2) {
    return !state2.result && !state2.loading && !state2.autoSkipped;
  }
  class LocalOcrUnavailableError extends Error {
    constructor(endpointUrl) {
      super("Local OCR server is unreachable.");
      this.endpointUrl = endpointUrl;
      this.name = "LocalOcrUnavailableError";
    }
  }
  function beginOcrScan(state2, image, settings, manualRequested) {
    state2.loading = true;
    const provider = inlineProviderLabel(settings);
    return {
      provider,
      done: log$2.time("scanImage", { provider, image: imageSummary(image), manualRequested })
    };
  }
  function finishOcrScan(state2) {
    state2.loading = false;
    state2.manualRequested = false;
  }
  function renderNoOcrLines(state2) {
    state2.autoSkipped = true;
    state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
  }
  function logOcrFailure(state2, provider, manualRequested, error) {
    state2.autoSkipped = !manualRequested;
    if (isLocalOcrUnavailableError(error)) {
      log$2.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, "Local OCR endpoint unavailable; pausing requests", { provider, endpoint: error.endpointUrl });
      return;
    }
    log$2.warn("OCR scan failed", { provider, manualRequested }, error);
  }
  const OCR_NAVIGATION_EVENTS = ["yt-navigate-start", "yt-navigate-finish", "popstate"];
  class ImageOcrController {
    constructor(options) {
      this.options = options;
      for (const [key, result] of loadPersistedOcrCache()) this.cache.set(key, result);
    }
    states = /* @__PURE__ */ new Map();
    cache = /* @__PURE__ */ new Map();
    localOcrUnavailable;
    observer;
    observerMargin = "";
    mutationObserver;
    queue = [];
    // OCR runs as a small concurrency pool rather than one-at-a-time: manga
    // readers surface many page images/canvases at once and the serial wait was
    // the dominant source of "slow OCR". `activeScans` counts in-flight requests
    // (capped by settings.ocrConcurrency) and `inFlightKeys` deduplicates work
    // when several queued elements share the same image content (e.g. a canvas
    // frame re-snapshotted on a page poll).
    activeScans = 0;
    inFlightKeys = /* @__PURE__ */ new Set();
    positionFrame = 0;
    refreshTimer = 0;
    destroyed = false;
    lastPointerMoveImage;
    lastPointerMoveReaderSurface;
    videoFrames = /* @__PURE__ */ new Map();
    videoFrameVideos = /* @__PURE__ */ new Map();
    videoFrameControls = /* @__PURE__ */ new Map();
    videoFrameStatuses = /* @__PURE__ */ new Map();
    // Compact loading/ready indicators for every OCR'd image (not just
    // paused-video frames), so slow image OCR shows progress without a card.
    imageStatuses = /* @__PURE__ */ new Map();
    imageStatusTimers = /* @__PURE__ */ new Map();
    // Reader raster snapshots (BookWalker/ComicWalker canvases and Mokuro CSS
    // background pages): map each page surface to the invisible <img> we OCR in
    // its place, plus the page fingerprint and the page-turn poll.
    canvasFrames = /* @__PURE__ */ new Map();
    canvasFrameSources = /* @__PURE__ */ new Map();
    canvasFrameStaticRects = /* @__PURE__ */ new Map();
    backgroundFrames = /* @__PURE__ */ new Map();
    backgroundFrameSources = /* @__PURE__ */ new Map();
    backgroundFrameKeys = /* @__PURE__ */ new Map();
    canvasReaderSignature;
    readerRasterPoll = 0;
    readerRasterRetryTimer = 0;
    pendingCanvasSnapshots = /* @__PURE__ */ new WeakSet();
    canvasContentReadiness = /* @__PURE__ */ new WeakMap();
    ocrWordRenderStates = /* @__PURE__ */ new WeakMap();
    pointerActivatedOcrLines = /* @__PURE__ */ new WeakMap();
    handleMediaPause = (event) => this.snapshotPausedVideo(event.target);
    handleMediaResume = (event) => this.releaseVideoFrame(event.target);
    // Stepping subtitle lines while paused seeks the video — the snapshot
    // must follow the new frame instead of showing the stale one.
    handleMediaSeeked = (event) => this.refreshVideoFrameAfterSeek(event.target);
    handleDocumentPointerDown = (event) => {
      this.unpinOcrLinesFromDocumentEvent(event);
      this.requestOcrFromPointerEvent(event);
    };
    handleDocumentPointerOver = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentPointerMove = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentClick = (event) => this.unpinOcrLinesFromDocumentEvent(event);
    handleDocumentScroll = () => this.handleOcrViewportShift(120);
    handleWindowScroll = () => this.handleOcrViewportShift(240);
    handleWindowResize = () => this.handleOcrViewportShift(300);
    handleSpaNavigation = () => this.teardownForNavigation();
    init() {
      this.destroyed = false;
      this.refresh();
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.addEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.addEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.addEventListener("click", this.handleDocumentClick, true);
      document.addEventListener("pause", this.handleMediaPause, true);
      document.addEventListener("play", this.handleMediaResume, true);
      document.addEventListener("emptied", this.handleMediaResume, true);
      document.addEventListener("seeked", this.handleMediaSeeked, true);
      document.addEventListener("scroll", this.handleDocumentScroll, { capture: true, passive: true });
      window.addEventListener("scroll", this.handleWindowScroll, { passive: true });
      window.addEventListener("resize", this.handleWindowResize, { passive: true });
      for (const eventName of OCR_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, this.handleSpaNavigation);
      }
      this.mutationObserver = new MutationObserver((mutations) => this.handleRenderableMediaMutations(mutations));
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "loading", "poster"]
      });
      this.startReaderRasterPollingIfNeeded();
    }
    destroy() {
      this.destroyed = true;
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.removeEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.removeEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.removeEventListener("click", this.handleDocumentClick, true);
      document.removeEventListener("pause", this.handleMediaPause, true);
      document.removeEventListener("play", this.handleMediaResume, true);
      document.removeEventListener("emptied", this.handleMediaResume, true);
      document.removeEventListener("seeked", this.handleMediaSeeked, true);
      document.removeEventListener("scroll", this.handleDocumentScroll, true);
      window.removeEventListener("scroll", this.handleWindowScroll);
      window.removeEventListener("resize", this.handleWindowResize);
      for (const eventName of OCR_NAVIGATION_EVENTS) {
        window.removeEventListener(eventName, this.handleSpaNavigation);
      }
      this.releaseAllVideoFrames();
      this.releaseAllCanvasFrames();
      this.releaseAllBackgroundFrames();
      if (this.readerRasterPoll) {
        window.clearInterval(this.readerRasterPoll);
        this.readerRasterPoll = 0;
      }
      if (this.readerRasterRetryTimer) {
        window.clearTimeout(this.readerRasterRetryTimer);
        this.readerRasterRetryTimer = 0;
      }
      this.mutationObserver?.disconnect();
      if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
      this.clear();
    }
    refresh(options = {}) {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled) {
        this.clear();
        return;
      }
      this.refreshCanvasReaderSurfaces(settings, options.userRequested);
      this.refreshBackgroundImageReaderSurfaces(settings, options.userRequested);
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
    /**
     * Re-evaluate auto-scan after something *outside* the reader's own settings
     * changes the answer at runtime — currently mokuro's own "OCR enabled"
     * (displayOCR) toggle, which the reader cannot see through its settings
     * subscription. When the page now supplies its native text layer we drop the
     * overlays the reader auto-painted before the flip, so the reader's OCR stops
     * competing with mokuro's text boxes; manually-scanned panels are kept. When
     * it no longer does, a normal refresh starts the reader's own scan.
     */
    reassessAutoScan() {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled) return;
      if (this.options.shouldAutoScan?.() === false) {
        this.clearAutoScannedOverlays();
        this.schedulePosition();
        return;
      }
      this.refresh();
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
    handleOcrViewportShift(refreshDelay) {
      if (!this.options.getSettings().ocrEnabled) return;
      this.schedulePosition();
      this.scheduleRefresh(refreshDelay);
    }
    hasVisibleInlineOcrFallback(settings) {
      return Array.from(document.images).some((image) => {
        if (!readFallbackOcrResult(image, false)) return false;
        return isCandidateImage(image, settings) && shouldObserveImage(image, settings);
      });
    }
    refreshImages(settings) {
      return Array.from(document.images).filter((image) => isCandidateImage(image, settings) && shouldObserveImage(image, settings)).sort((a, b) => this.compareRefreshImages(a, b)).slice(0, imageReaderMaxImages(settings));
    }
    compareRefreshImages(a, b) {
      const priorityDelta = this.observePriority(a) - this.observePriority(b);
      return priorityDelta || imageViewportDistance(a) - imageViewportDistance(b);
    }
    observeRefreshImage(image, settings) {
      const state2 = this.ensureState(image);
      this.observer?.observe(image);
      if (this.shouldAutoEnqueueImage(image, state2, settings)) this.enqueue(image);
    }
    shouldAutoEnqueueImage(image, state2, settings) {
      return (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) && isOcrImageStateIdle(state2) && isNearViewport(image, imagePrefetchMargin(settings));
    }
    canAutoScanImage(settings) {
      return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
    }
    async scanVisible() {
      this.refresh({ userRequested: true });
      const settings = this.options.getSettings();
      const images = [...this.states.keys()].filter((image) => isCandidateImage(image, settings) && isNearViewport(image, 120));
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
      const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (!state2) return void 0;
      const image = captureImageElement(state2.image);
      return image;
    }
    pinLineForElement(element) {
      const line = element?.closest?.(".jpdb-ocr-line");
      if (!line) return;
      const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (state2) this.pinLine(state2, line);
    }
    clearActiveLines() {
      this.unpinAllLines();
    }
    ensureObserver(settings) {
      const rootMargin = `${imagePrefetchMargin(settings)}px 0px`;
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
          const state2 = this.states.get(image);
          if (state2 && this.shouldAutoEnqueueImage(image, state2, current)) this.enqueue(image);
        }
      }, { rootMargin });
    }
    ensureState(image) {
      const existing = this.states.get(image);
      if (existing) return existing;
      const overlay = document.createElement("div");
      overlay.className = "jpdb-ocr-layer";
      overlay.dataset.jpdbReaderRoot = "true";
      overlay.dataset.ocrLayerId = String(++ocrLayerCounter);
      overlay.hidden = true;
      setOcrOverlayAccessibility(overlay, false);
      document.body.append(overlay);
      const state2 = { image, overlay, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
      image.addEventListener("load", () => {
        this.resetStateIfImageChanged(state2);
        this.schedulePosition();
        this.scheduleRefresh(0);
      });
      this.states.set(image, state2);
      if (image.complete && image.naturalWidth > 0) {
        this.schedulePosition();
        const settings = this.options.getSettings();
        if (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) this.enqueue(image);
      }
      return state2;
    }
    enqueue(image, userRequested = false) {
      if (isYouTubeThumbnailImage(image)) return;
      const state2 = this.states.get(image) ?? this.ensureState(image);
      if (!this.shouldQueueOcrRequest(state2, image, userRequested)) return;
      this.queueOcrRequest(image);
    }
    shouldQueueOcrRequest(state2, image, userRequested) {
      if (shouldSkipOcrRequest(state2, userRequested)) return false;
      const forceExistingOverlay = userRequested && !state2.overlayRequested;
      updateOcrRequestFlags(state2, image, userRequested);
      if (this.renderExistingOcrResult(state2, forceExistingOverlay)) return false;
      return !state2.loading;
    }
    queueOcrRequest(image) {
      this.queueImageForOcr(image);
      this.drainQueue();
    }
    renderExistingOcrResult(state2, userRequested) {
      if (!state2.result) return false;
      if (userRequested) void this.renderResult(state2, state2.result, true);
      return true;
    }
    requestOcrFromPointerEvent(event) {
      const settings = this.options.getSettings();
      const image = ocrImageFromPointerEvent(event, settings);
      if (image) {
        if (event.type === "pointermove" && image === this.lastPointerMoveImage) return;
        if (event.type === "pointermove") this.lastPointerMoveImage = image;
        else this.lastPointerMoveImage = void 0;
        this.lastPointerMoveReaderSurface = void 0;
        this.enqueue(image, true);
        return;
      }
      const surface = ocrReaderSurfaceFromPointerEvent(event, settings);
      if (!surface) return;
      if (event.type === "pointermove" && surface === this.lastPointerMoveReaderSurface) return;
      if (event.type === "pointermove") this.lastPointerMoveReaderSurface = surface;
      else this.lastPointerMoveReaderSurface = void 0;
      void this.snapshotReaderSurface(surface, settings).then((frame) => {
        if (frame) this.enqueue(frame, true);
      });
    }
    async snapshotReaderSurface(surface, settings) {
      if (surface instanceof HTMLCanvasElement) {
        await this.snapshotCanvasSurface(surface, settings, true);
        return this.canvasFrames.get(surface);
      }
      this.snapshotBackgroundImageSurface(surface, settings, true);
      return this.backgroundFrames.get(surface);
    }
    queueImageForOcr(image) {
      if (!this.queue.includes(image)) this.queue.push(image);
    }
    drainQueue() {
      if (this.destroyed) return;
      const limit = ocrConcurrencyLimit(this.options.getSettings());
      while (this.activeScans < limit) {
        const image = this.takeNextQueuedImage();
        if (!image) return;
        this.startScan(image);
      }
    }
    // Pull the next queued image whose content is not already being scanned, so
    // duplicate enqueues / re-snapshotted canvas frames don't fire redundant OCR
    // calls (the cache fills them in once the in-flight scan resolves).
    takeNextQueuedImage() {
      for (let index = 0; index < this.queue.length; index++) {
        const candidate = this.queue[index];
        if (this.inFlightKeys.has(imageCacheKey(candidate))) continue;
        this.queue.splice(index, 1);
        return candidate;
      }
      return void 0;
    }
    startScan(image) {
      if (this.destroyed) return;
      const key = imageCacheKey(image);
      this.activeScans++;
      this.inFlightKeys.add(key);
      const hasFastText = Boolean(readFallbackOcrResult(image, false));
      const isReaderRasterFrame = this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image);
      const delay = this.cache.has(key) || this.states.get(image)?.overlayRequested || hasFastText || isReaderRasterFrame ? 0 : 900;
      void waitForIdle(delay, delay).then(() => this.scanImage(image)).finally(() => {
        this.activeScans = Math.max(0, this.activeScans - 1);
        this.inFlightKeys.delete(key);
        if (!this.destroyed) this.drainQueue();
      });
    }
    async scanImage(image) {
      if (this.destroyed) return;
      const existingState = this.states.get(image);
      if (!image.isConnected) {
        if (existingState) this.releaseImageState(image, existingState);
        return;
      }
      const state2 = existingState ?? this.ensureState(image);
      const settings = this.options.getSettings();
      const key = imageCacheKey(image);
      const manualRequested = state2.manualRequested;
      this.resetStateIfImageChanged(state2);
      if (await this.tryRenderCachedOcrResult(state2, key)) return;
      if (!this.isCurrentState(state2)) return;
      this.updateOcrStatus(image, "loading");
      const scan = beginOcrScan(state2, image, settings, manualRequested);
      try {
        await this.scanUncachedImage(state2, image, key, settings, scan.provider, manualRequested);
      } catch (error) {
        if (isStaleOcrState(error)) return;
        await this.renderOcrFailure(state2, image, scan.provider, manualRequested, error);
      } finally {
        finishOcrScan(state2);
        scan.done();
      }
    }
    async renderCachedOcrResult(state2, key) {
      if (!this.cache.has(key)) return false;
      if (this.shouldSuppressAutoRenderedResult(state2, false)) {
        this.clearAutoScannedOverlays();
        return true;
      }
      const cached = this.cache.get(key);
      this.requireCurrentState(state2);
      if (!cached) {
        renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "empty");
        state2.manualRequested = false;
        return true;
      }
      await this.renderResult(state2, cached);
      state2.manualRequested = false;
      return true;
    }
    async tryRenderCachedOcrResult(state2, key) {
      try {
        return await this.renderCachedOcrResult(state2, key);
      } catch (error) {
        if (isStaleOcrState(error)) return true;
        throw error;
      }
    }
    async scanUncachedImage(state2, image, key, settings, provider, manualRequested) {
      const inlineFallback = readFallbackOcrResult(image, false);
      const providerResult = inlineFallback ? null : await this.recognizeImage(image, settings);
      this.requireCurrentState(state2);
      const result = inlineFallback ?? providerResult;
      if (!result?.lines.length) {
        this.remember(key, null);
        renderNoOcrLines(state2);
        this.updateOcrStatus(image, "empty");
        return;
      }
      this.remember(key, result);
      state2.key = key;
      if (this.shouldSuppressAutoRenderedResult(state2, Boolean(inlineFallback), manualRequested)) {
        this.clearAutoScannedOverlays();
        return;
      }
      await this.renderResult(state2, result);
      log$2.info("OCR result rendered", { provider, lines: result.lines.length, manualRequested });
    }
    shouldSuppressAutoRenderedResult(state2, inlineFallback, manualRequested = state2.manualRequested) {
      return !manualRequested && !state2.overlayRequested && !inlineFallback && this.options.shouldAutoScan?.() === false;
    }
    async renderOcrFailure(state2, image, provider, manualRequested, error) {
      this.requireCurrentState(state2);
      const fallback = readFallbackOcrResult(image, false);
      if (fallback?.lines.length) {
        log$2.warn("OCR provider failed", { provider }, error);
        await this.renderResult(state2, fallback);
        return;
      }
      logOcrFailure(state2, provider, manualRequested, error);
      this.updateOcrStatus(image, "failed");
    }
    recognizeImage(image, settings) {
      const recognizer = ocrRecognizer(settings);
      if (!recognizer) return Promise.resolve(null);
      return this.recognizeWithDarkPass(image, settings, recognizer);
    }
    // Normal recognition always runs. A second, inverted pass is spent only when
    // the page has a dark region (where white-on-black text could hide) AND that
    // region came back UNREAD by the normal pass — i.e. genuinely missed text. So
    // ordinary pages (and dark panels the recognizer already read) cost exactly one
    // request, keeping speed and Lens volume unchanged; only a real missed dark
    // panel pays for the extra pass, and its lines are merged in over the dark area.
    async recognizeWithDarkPass(image, settings, recognizer) {
      const normal = await this.runRecognizer(image, settings, recognizer, false);
      if (!settings.ocrInvertDarkPanels) return normal;
      const field = buildLuminanceField(image);
      if (!field || luminanceFieldDarkFraction(field) < DARK_REGION_TRIGGER) return normal;
      if (darkAreaIsRead(field, normal)) return normal;
      const inverted = await this.runRecognizer(image, settings, recognizer, true).catch(() => null);
      return mergeDarkPassResult(normal, inverted, field);
    }
    runRecognizer(image, settings, recognizer, invert) {
      if (settings.ocrProvider !== "local-service") return recognizer(image, settings, invert);
      return this.recognizeViaLocalServiceWithBackoff(image, settings, recognizer, invert);
    }
    async recognizeViaLocalServiceWithBackoff(image, settings, recognizer, invert) {
      const endpointUrl = localOcrEndpointUrl(settings);
      if (this.isLocalOcrUnavailable(endpointUrl)) throw new LocalOcrUnavailableError(endpointUrl);
      try {
        const result = await recognizer(image, settings, invert);
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
    async renderResult(state2, result, forceOverlay = false) {
      this.requireCurrentState(state2);
      state2.result = result;
      state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
      const settings = this.options.getSettings();
      const showText = settings.ocrShowTextOverlay || forceOverlay;
      const initialParsed = await this.parseOcrLines(result.lines);
      this.requireCurrentState(state2);
      const lines = cleanOcrLookupLines(result.lines, initialParsed);
      if (!lines.length) {
        renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "empty");
        return;
      }
      const parsed = ocrLinesChanged(result.lines, lines) ? await this.parseOcrLines(lines) : initialParsed;
      this.requireCurrentState(state2);
      const sentence = lines.map((line) => line.text).join("\n");
      const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
        line.text,
        parsed[index] ?? [],
        this.options.fallbackCardFromText ?? ocrFallbackCardFromText
      ));
      const flatTokens = renderedTokens.flat();
      await this.options.enrichTokensBeforeRender?.(flatTokens);
      this.requireCurrentState(state2);
      applyOcrOverlayStyle(state2.overlay, settings);
      for (const [index, line] of lines.entries()) {
        state2.overlay.append(this.renderOcrLineElement(state2, result, line, renderedTokens[index] ?? [], sentence, showText, settings));
      }
      this.positionState(state2.image);
      this.updateOcrStatus(state2.image, "ready");
      void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state2.overlay)).finally(() => this.schedulePosition());
    }
    async parseOcrLines(lines) {
      const options = ocrParseOptions();
      const texts = lines.map((line) => line.text);
      if (this.options.parseJapaneseBatch) {
        return this.options.parseJapaneseBatch(texts, options).then((parsed) => texts.map((_, index) => parsed[index] ?? [])).catch(() => texts.map(() => []));
      }
      return Promise.all(lines.map((line) => this.options.parseJapanese(line.text, options).catch(() => {
        return [];
      })));
    }
    renderOcrLineElement(state2, result, line, tokens, sentence, showText, settings) {
      const element = createOcrLineElement(result, line, tokens, sentence, showText, settings);
      this.rememberOcrWordRenderStates(element, tokens);
      element.addEventListener("pointerenter", () => this.activateOcrMarkup(element));
      element.addEventListener("focusin", () => this.activateOcrMarkup(element));
      element.addEventListener("pointerdown", (event) => this.activateOcrLineFromPointer(state2, element, event), true);
      element.addEventListener("click", (event) => this.toggleOcrLinePinned(state2, element, event));
      return element;
    }
    activateOcrLineFromPointer(state2, element, event) {
      if (event.button !== 0) return;
      if (element.dataset.pinned === "true") {
        this.activateOcrMarkup(element);
        return;
      }
      element.focus({ preventScroll: true });
      this.pinLine(state2, element);
      this.pointerActivatedOcrLines.set(element, Date.now());
    }
    toggleOcrLinePinned(state2, element, event) {
      if (this.wasRecentlyPointerActivated(element)) {
        this.activateOcrMarkup(element);
      } else if (element.dataset.pinned === "true") {
        this.unpinLine(element);
      } else {
        element.focus({ preventScroll: true });
        this.pinLine(state2, element);
      }
      event.preventDefault();
      event.stopPropagation();
    }
    wasRecentlyPointerActivated(element) {
      const activatedAt = this.pointerActivatedOcrLines.get(element);
      if (activatedAt === void 0) return false;
      const recent = Date.now() - activatedAt < 800;
      if (!recent) this.pointerActivatedOcrLines.delete(element);
      return recent;
    }
    pinLine(state2, element) {
      state2.overlay.querySelectorAll(".jpdb-ocr-line-active").forEach((line) => {
        if (line !== element) this.unpinLine(line);
      });
      this.activateOcrMarkup(element);
      element.classList.add("jpdb-ocr-line-active");
      element.dataset.pinned = "true";
      this.schedulePosition();
    }
    unpinLine(element) {
      element.classList.remove("jpdb-ocr-line-active");
      element.dataset.pinned = "false";
      this.schedulePosition();
    }
    unpinOcrLinesFromDocumentEvent(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab")) return;
      this.unpinAllLines();
    }
    unpinAllLines() {
      for (const state2 of this.states.values()) {
        state2.overlay.querySelectorAll(".jpdb-ocr-line-active").forEach((line) => this.unpinLine(line));
      }
    }
    observePriority(image) {
      const state2 = this.states.get(image);
      if (!state2) return 0;
      if (!state2.result) return state2.autoSkipped ? 2 : 0;
      return 1;
    }
    resetStateIfImageChanged(state2) {
      const key = imageCacheKey(state2.image);
      if (key === state2.key) return;
      state2.key = key;
      state2.result = void 0;
      state2.loading = false;
      state2.overlayRequested = false;
      state2.manualRequested = false;
      state2.autoSkipped = false;
      state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
    }
    remember(key, result) {
      if (key.startsWith("data:")) return;
      this.cache.set(key, result);
      while (this.cache.size > MAX_CACHE_ITEMS) {
        const oldest = this.cache.keys().next().value;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
      persistOcrCacheSoon(this.cache, Date.now());
    }
    schedulePosition() {
      if (this.destroyed) return;
      if (this.positionFrame) return;
      this.positionFrame = requestAnimationFrame(() => {
        this.positionFrame = 0;
        if (this.destroyed) return;
        this.positionVideoFrames();
        this.positionCanvasFrames();
        this.positionBackgroundFrames();
        for (const image of this.states.keys()) this.positionState(image);
        this.positionImageStatusCards();
      });
    }
    positionImageStatusCards() {
      for (const [image, card] of [...this.imageStatuses]) {
        if (!image.isConnected) this.removeImageStatusCard(image);
        else this.positionImageStatusCard(image, card);
      }
    }
    // --- Paused-video frames (UT-27) ---
    snapshotPausedVideo(target) {
      if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled || !settings.ocrVideoPauseFrames || settings.ocrProvider === "off") return;
      if (isLikelyPausedVideoThumbnail(target)) return;
      const rect = target.getBoundingClientRect();
      if (rect.width * rect.height < settings.ocrMinImageArea) return;
      if (!isNearViewport(target, 0) || isHiddenByCss(target)) return;
      const dataUrl = (this.options.captureVideoFrame ?? captureVideoFrameDataUrl)(target);
      if (!dataUrl) return;
      const frame = document.createElement("img");
      frame.className = "jpdb-ocr-video-frame";
      frame.dataset.yomuVideoFrame = "true";
      frame.alt = "";
      positionVideoFrameImage(frame, rect, target);
      frame.addEventListener("load", () => {
        if (this.videoFrames.get(target) === frame) this.enqueue(frame, true);
      }, { once: true });
      frame.src = dataUrl;
      document.body.append(frame);
      this.videoFrames.set(target, frame);
      this.videoFrameVideos.set(frame, target);
      const status = this.createVideoFrameStatus("loading");
      this.videoFrameStatuses.set(target, status);
      positionVideoFrameStatus(status, rect, target);
      const resume = this.createVideoFrameResumeControl(target);
      this.videoFrameControls.set(target, resume);
      positionVideoFrameResumeControl(resume, rect, target);
      this.schedulePosition();
    }
    createVideoFrameResumeControl(video) {
      const language = this.options.getSettings().interfaceLanguage;
      const label = uiText(language, "ocrPlayVideo");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jpdb-ocr-video-frame-resume";
      setInnerHtml(button, playVideoIcon());
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.releaseVideoFrame(video);
        try {
          void video.play()?.catch(() => void 0);
        } catch {
        }
      });
      return button;
    }
    createVideoFrameStatus(status) {
      const element = document.createElement("div");
      element.className = "jpdb-ocr-video-frame-status";
      element.dataset.jpdbReaderRoot = "true";
      element.dataset.jpdbReaderSurfaceIgnore = "true";
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      this.setVideoFrameStatus(element, status);
      document.body.append(element);
      return element;
    }
    setVideoFrameStatus(element, status) {
      const language = this.options.getSettings().interfaceLanguage;
      const label = uiText(language, videoFrameStatusTextKey(status));
      element.dataset.status = status;
      element.className = `jpdb-ocr-video-frame-status jpdb-ocr-video-frame-status-${status}`;
      element.setAttribute("aria-label", label);
    }
    updateVideoFrameStatusForImage(image, status) {
      const video = this.videoFrameVideos.get(image);
      if (!video) return;
      const element = this.videoFrameStatuses.get(video);
      if (element) this.setVideoFrameStatus(element, status);
    }
    // Drive both status surfaces: paused-video frames keep their card over the
    // player; every other OCR'd image gets its own card over the image.
    updateOcrStatus(image, status) {
      this.updateVideoFrameStatusForImage(image, status);
      this.updateImageStatusCard(image, status);
    }
    updateImageStatusCard(image, status) {
      if (this.videoFrameVideos.has(image)) return;
      if (!this.options.getSettings().ocrEnabled) return;
      const existing = this.imageStatuses.get(image);
      this.clearImageStatusTimer(image);
      if (status === "empty") {
        existing?.remove();
        this.imageStatuses.delete(image);
        return;
      }
      const card = existing ?? this.createVideoFrameStatus(status);
      if (existing) this.setVideoFrameStatus(card, status);
      else this.imageStatuses.set(image, card);
      this.positionImageStatusCard(image, card);
      if (status === "ready") this.scheduleImageStatusFade(image, card);
    }
    scheduleImageStatusFade(image, card) {
      const dwell = window.setTimeout(() => {
        card.classList.add("jpdb-ocr-video-frame-status-fade-out");
        const remove = window.setTimeout(() => this.removeImageStatusCard(image), OCR_STATUS_FADE_MS);
        this.imageStatusTimers.set(image, remove);
      }, OCR_STATUS_READY_DWELL_MS);
      this.imageStatusTimers.set(image, dwell);
    }
    clearImageStatusTimer(image) {
      const timer = this.imageStatusTimers.get(image);
      if (timer !== void 0) window.clearTimeout(timer);
      this.imageStatusTimers.delete(image);
    }
    positionImageStatusCard(image, card) {
      const rect = image.getBoundingClientRect();
      if (!isImageVisibleForOcr(image, rect)) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      positionOcrImageStatus(card, rect);
    }
    removeImageStatusCard(image) {
      this.clearImageStatusTimer(image);
      const card = this.imageStatuses.get(image);
      if (!card) return;
      card.remove();
      this.imageStatuses.delete(image);
    }
    refreshVideoFrameAfterSeek(target) {
      if (!(target instanceof HTMLVideoElement) || !target.paused) return;
      if (!this.videoFrames.has(target)) return;
      this.releaseVideoFrame(target);
      this.snapshotPausedVideo(target);
    }
    releaseVideoFrame(target) {
      if (!(target instanceof HTMLVideoElement)) return;
      const frame = this.videoFrames.get(target);
      if (!frame) return;
      this.videoFrames.delete(target);
      const control = this.videoFrameControls.get(target);
      if (control) removeVideoFrameResumeControl(control);
      this.videoFrameControls.delete(target);
      const status = this.videoFrameStatuses.get(target);
      status?.remove();
      this.videoFrameStatuses.delete(target);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.videoFrameVideos.delete(frame);
      frame.remove();
    }
    releaseAllVideoFrames() {
      for (const video of [...this.videoFrames.keys()]) this.releaseVideoFrame(video);
    }
    // --- Reader raster frames (canvas readers + CSS background-image readers) ---
    startReaderRasterPollingIfNeeded() {
      if (this.readerRasterPoll || !isReaderRasterPage()) return;
      this.readerRasterPoll = window.setInterval(() => {
        const settings = this.options.getSettings();
        this.refreshCanvasReaderSurfaces(settings);
        this.refreshBackgroundImageReaderSurfaces(settings);
      }, 1200);
    }
    refreshCanvasReaderSurfaces(settings, userRequested = false) {
      if (!settings.ocrEnabled || settings.ocrProvider === "off") return;
      if (!settings.ocrAutoScanImages && !userRequested) return;
      if (this.options.shouldAutoScan?.() === false && !userRequested) {
        this.releaseAllCanvasFrames();
        return;
      }
      if (!isReaderRasterPage()) {
        this.releaseAllCanvasFrames();
        return;
      }
      this.startReaderRasterPollingIfNeeded();
      const signature = canvasReaderPageSignature();
      if (signature !== this.canvasReaderSignature) {
        this.releaseAllCanvasFrames();
        this.canvasReaderSignature = signature;
      }
      const canvases = activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
      for (const canvas of [...this.canvasFrames.keys()]) {
        if (!canvases.includes(canvas)) this.releaseCanvasFrame(canvas);
      }
      for (const canvas of canvases) {
        if (this.canvasFrames.has(canvas)) continue;
        this.snapshotCanvasSurface(canvas, settings, userRequested);
      }
    }
    async snapshotCanvasSurface(canvas, settings, userRequested = false) {
      if (this.canvasFrames.has(canvas)) return;
      if (this.pendingCanvasSnapshots.has(canvas)) return;
      this.pendingCanvasSnapshots.add(canvas);
      try {
        const rect = canvas.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(canvas, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(canvas)) return;
        let frameSrc;
        let frameRect = rect;
        if (isCanvasReadable(canvas)) {
          const contentSignature = canvasRenderedContentSignature(canvas);
          if (!contentSignature) return;
          if (!this.canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested)) return;
          frameSrc = captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
        } else if (isBookwalkerViewerHost()) {
          const captureMirror = this.options.captureCanvasMirror ?? captureCanvasMirror;
          const mirror = await captureMirror(canvas, loadCleanMirrorImage);
          if (mirror) {
            frameSrc = captureCanvasDataUrl(mirror, settings.ocrMaxImagePixels);
          } else {
            const captureReaderSurface = this.options.captureReaderSurface ?? captureReaderSurfaceViaExtensionScreenshot;
            const screenshot = await captureReaderSurface(canvas, settings.ocrMaxImagePixels);
            frameSrc = screenshot?.dataUrl;
            frameRect = screenshot?.rect ?? rect;
          }
        } else if (canUseReaderCanvasSourceImageFallback()) {
          frameSrc = readerCanvasSourceImageUrl();
        }
        if (!frameSrc) return;
        if (this.destroyed || !canvas.isConnected || this.canvasFrames.has(canvas)) return;
        const frame = document.createElement("img");
        frame.className = "jpdb-ocr-canvas-frame";
        frame.dataset.yomuCanvasFrame = "true";
        frame.alt = "";
        positionCanvasFrameImage(frame, rect);
        frame.addEventListener("load", () => {
          if (this.canvasFrames.get(canvas) === frame) this.enqueue(frame, userRequested);
        }, { once: true });
        frame.src = frameSrc;
        document.body.append(frame);
        this.canvasFrames.set(canvas, frame);
        this.canvasFrameSources.set(frame, canvas);
        if (frameRect !== rect) this.canvasFrameStaticRects.set(frame, frameRect);
        this.schedulePosition();
      } finally {
        this.pendingCanvasSnapshots.delete(canvas);
      }
    }
    canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested) {
      if (userRequested) {
        this.canvasContentReadiness.set(canvas, contentSignature);
        return true;
      }
      const previous = this.canvasContentReadiness.get(canvas);
      this.canvasContentReadiness.set(canvas, contentSignature);
      if (previous === contentSignature) return true;
      this.scheduleReaderRasterRefresh(140);
      return false;
    }
    scheduleReaderRasterRefresh(delayMs) {
      if (this.readerRasterRetryTimer || this.destroyed) return;
      this.readerRasterRetryTimer = window.setTimeout(() => {
        this.readerRasterRetryTimer = 0;
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        this.refreshCanvasReaderSurfaces(settings);
        this.refreshBackgroundImageReaderSurfaces(settings);
      }, delayMs);
    }
    releaseCanvasFrame(canvas) {
      const frame = this.canvasFrames.get(canvas);
      if (!frame) return;
      this.canvasFrames.delete(canvas);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.canvasFrameSources.delete(frame);
      this.canvasFrameStaticRects.delete(frame);
      frame.remove();
    }
    releaseAllCanvasFrames() {
      for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
      this.canvasReaderSignature = void 0;
    }
    positionCanvasFrames() {
      for (const [canvas, frame] of [...this.canvasFrames]) {
        if (!canvas.isConnected) {
          this.releaseCanvasFrame(canvas);
          continue;
        }
        const staticRect = this.canvasFrameStaticRects.get(frame);
        if (staticRect) {
          const currentRect = this.visibleViewportIntersection(canvas.getBoundingClientRect());
          if (!currentRect || !rectsNearlyEqual(staticRect, currentRect)) {
            this.releaseCanvasFrame(canvas);
            this.scheduleReaderRasterRefresh(40);
            continue;
          }
          positionCanvasFrameImage(frame, staticRect);
          continue;
        }
        positionCanvasFrameImage(frame, canvas.getBoundingClientRect());
      }
    }
    visibleViewportIntersection(rect) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewportWidth || !viewportHeight) return void 0;
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.right);
      const bottom = Math.min(viewportHeight, rect.bottom);
      const width = right - left;
      const height = bottom - top;
      return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : void 0;
    }
    refreshBackgroundImageReaderSurfaces(settings, userRequested = false) {
      if (!settings.ocrEnabled || settings.ocrProvider === "off") return;
      if (!settings.ocrAutoScanImages && !userRequested) return;
      if (this.options.shouldAutoScan?.() === false && !userRequested) {
        this.releaseAllBackgroundFrames();
        return;
      }
      if (!isReaderRasterPage()) {
        this.releaseAllBackgroundFrames();
        return;
      }
      this.startReaderRasterPollingIfNeeded();
      const surfaces = activeReaderRasterSurfaces(collectBackgroundImageReaderSurfaces(), settings, userRequested);
      for (const surface of [...this.backgroundFrames.keys()]) {
        const key = this.backgroundFrameKeys.get(surface);
        if (!surfaces.includes(surface) || key !== backgroundSurfaceCacheKey(surface)) this.releaseBackgroundFrame(surface);
      }
      for (const surface of surfaces) {
        if (this.backgroundFrames.has(surface)) continue;
        this.snapshotBackgroundImageSurface(surface, settings, userRequested);
      }
    }
    snapshotBackgroundImageSurface(surface, settings, userRequested = false) {
      if (this.backgroundFrames.has(surface)) return;
      const url = backgroundImageReaderUrl(surface);
      if (!url) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width * rect.height < settings.ocrMinImageArea) return;
      if (!isNearViewport(surface, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(surface) || isInsideHiddenAncestor(surface)) return;
      const frame = document.createElement("img");
      frame.className = "jpdb-ocr-background-frame";
      frame.dataset.yomuBackgroundFrame = "true";
      frame.alt = "";
      frame.decoding = "async";
      positionCanvasFrameImage(frame, rect);
      frame.addEventListener("load", () => {
        if (this.backgroundFrames.get(surface) === frame) this.enqueue(frame, userRequested);
      }, { once: true });
      frame.src = url;
      document.body.append(frame);
      this.backgroundFrames.set(surface, frame);
      this.backgroundFrameSources.set(frame, surface);
      this.backgroundFrameKeys.set(surface, backgroundSurfaceCacheKey(surface));
      this.schedulePosition();
    }
    releaseBackgroundFrame(surface) {
      const frame = this.backgroundFrames.get(surface);
      if (!frame) return;
      this.backgroundFrames.delete(surface);
      this.backgroundFrameKeys.delete(surface);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.backgroundFrameSources.delete(frame);
      frame.remove();
    }
    releaseAllBackgroundFrames() {
      for (const surface of [...this.backgroundFrames.keys()]) this.releaseBackgroundFrame(surface);
    }
    positionBackgroundFrames() {
      for (const [surface, frame] of [...this.backgroundFrames]) {
        if (!surface.isConnected) {
          this.releaseBackgroundFrame(surface);
          continue;
        }
        positionCanvasFrameImage(frame, surface.getBoundingClientRect());
      }
    }
    positionVideoFrames() {
      for (const [video, frame] of [...this.videoFrames]) {
        if (!video.isConnected || !video.paused) {
          this.releaseVideoFrame(video);
          continue;
        }
        const rect = video.getBoundingClientRect();
        positionVideoFrameImage(frame, rect, video);
        const resume = this.videoFrameControls.get(video);
        if (resume) positionVideoFrameResumeControl(resume, rect, video);
        const status = this.videoFrameStatuses.get(video);
        if (status) positionVideoFrameStatus(status, rect, video);
      }
    }
    scheduleRefresh(delay) {
      if (this.destroyed) return;
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        if (!this.destroyed) this.refresh();
      }, delay);
    }
    positionState(image) {
      const state2 = this.states.get(image);
      if (!state2) return;
      const rect = image.getBoundingClientRect();
      const visible = isImageVisibleForOcr(image, rect);
      state2.overlay.hidden = !visible;
      setOcrOverlayAccessibility(state2.overlay, visible);
      if (!visible) return;
      state2.overlay.style.left = `${rect.left}px`;
      state2.overlay.style.top = `${rect.top}px`;
      state2.overlay.style.width = `${rect.width}px`;
      state2.overlay.style.height = `${rect.height}px`;
      this.fitLineFonts(state2, renderedOcrImageFrame(image, rect, state2.result));
    }
    fitLineFonts(state2, frame) {
      const scale = this.options.getSettings().ocrFontScale;
      state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((element) => {
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
      const furiGutter = vertical && hasFurigana ? Math.round(fontSize * 0.55) : 0;
      const frameWidth = Math.min(frame.imageWidth, Math.max(boxWidth, minHitSize, contentWidth + padX * 2 + furiGutter * 2));
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
      this.releaseAllCanvasFrames();
      this.releaseAllBackgroundFrames();
      this.queue = [];
      this.inFlightKeys.clear();
      for (const state2 of this.states.values()) {
        state2.overlay.remove();
      }
      this.states.clear();
      for (const timer of this.imageStatusTimers.values()) window.clearTimeout(timer);
      this.imageStatusTimers.clear();
      for (const card of this.imageStatuses.values()) card.remove();
      this.imageStatuses.clear();
    }
    // Drop only the overlays the reader auto-painted, keeping panels the user
    // scanned by hand (those carry overlayRequested/manualRequested). Used when
    // we start deferring to a page's native text layer mid-session. The cached
    // results stay in `this.cache`, so flipping back re-renders them instantly
    // without re-OCRing.
    clearAutoScannedOverlays() {
      for (const [image, state2] of [...this.states]) {
        if (state2.manualRequested || state2.overlayRequested) continue;
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
          this.releaseCanvasFrame(canvas);
          continue;
        }
        const background = this.backgroundFrameSources.get(image);
        if (background) {
          this.releaseBackgroundFrame(background);
          continue;
        }
        this.releaseImageState(image, state2);
      }
    }
    rememberOcrWordRenderStates(line, tokens) {
      const tokensByKey = new Map(tokens.map((token) => [ocrTokenRenderKey(token), token]));
      line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
        const token = tokensByKey.get(ocrRenderedWordKey(word));
        if (!token) return;
        this.ocrWordRenderStates.set(word, {
          surface: word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || "",
          token
        });
      });
    }
    activateOcrMarkup(line) {
      let hasFurigana = false;
      const settings = this.options.getSettings();
      line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
        const state2 = this.ocrWordRenderStates.get(word);
        if (!state2) return;
        this.applyOcrPitchClass(word, state2.token);
        if (!shouldRenderRuby(state2.surface, state2.token, settings)) {
          this.setOcrWordPlainText(word, state2.surface);
          return;
        }
        setInnerHtml(word, renderRuby(state2.surface, state2.token));
        normalizeOcrRenderedText(word);
        word.classList.add("jpdb-reader-has-furi");
        hasFurigana = true;
      });
      line.dataset.hasFuri = String(hasFurigana);
    }
    applyOcrPitchClass(word, token) {
      this.clearOcrPitchClass(word);
      const pitchClass = ocrSafePitchClass(token.pitchClass);
      word.dataset.pitchClass = pitchClass;
      if (pitchClass) word.classList.add(`jpdb-pitch-${pitchClass}`);
    }
    clearOcrPitchClass(word) {
      word.classList.forEach((className) => {
        if (/^jpdb-pitch-/u.test(className)) word.classList.remove(className);
      });
      word.dataset.pitchClass = "";
    }
    setOcrWordPlainText(word, surface) {
      word.classList.remove("jpdb-reader-has-furi");
      setInnerHtml(word, escapeHtml(surface));
      normalizeOcrRenderedText(word);
    }
    // Drop every paused-frame and image overlay when YouTube navigates so no
    // stale OCR artifact (rail resume button, overlay over the player) carries
    // across the SPA route change, then re-scan the destination page.
    teardownForNavigation() {
      if (this.states.size === 0 && this.videoFrames.size === 0 && this.canvasFrames.size === 0 && this.backgroundFrames.size === 0) return;
      this.releaseAllVideoFrames();
      this.clear();
      if (this.options.getSettings().ocrEnabled) this.scheduleRefresh(0);
    }
    pruneDisconnectedStates() {
      for (const [image, state2] of this.states) {
        if (image.isConnected) continue;
        this.releaseImageState(image, state2);
      }
    }
    releaseImageState(image, state2 = this.states.get(image)) {
      if (state2) {
        this.observer?.unobserve(image);
        state2.overlay.remove();
        this.states.delete(image);
      }
      this.forgetImageWork(image, state2);
    }
    forgetImageWork(image, state2) {
      this.queue = this.queue.filter((queued) => queued !== image);
      this.inFlightKeys.delete(imageCacheKey(image));
      if (state2) this.inFlightKeys.delete(state2.key);
      this.removeImageStatusCard(image);
    }
    isCurrentState(state2) {
      return !this.destroyed && this.states.get(state2.image) === state2;
    }
    requireCurrentState(state2) {
      if (!this.isCurrentState(state2)) throw STALE_OCR_STATE;
    }
  }
  function isStaleOcrState(error) {
    return error === STALE_OCR_STATE;
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
  function setOcrOverlayAccessibility(overlay, visible) {
    overlay.setAttribute("aria-hidden", String(!visible));
    if (!visible) {
      overlay.removeAttribute("role");
      overlay.removeAttribute("aria-label");
      return;
    }
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", `Yomu OCR text ${overlay.dataset.ocrLayerId ?? ""}`.trim());
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
  function ocrTokenRenderKey(token) {
    return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
  }
  function ocrRenderedWordKey(word) {
    return `${word.dataset.tokenStart ?? ""}:${word.dataset.tokenEnd ?? ""}:${word.dataset.vid ?? ""}:${word.dataset.sid ?? ""}`;
  }
  function ocrSafePitchClass(pitchClass) {
    const normalized = pitchClass?.trim() ?? "";
    return /^(?:heiban|atamadaka|nakadaka|odaka|kifuku)$/u.test(normalized) ? normalized : "";
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
  async function recognizeViaLocalService(image, settings, invert = false) {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
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
  async function recognizeViaCloudVision(image, settings, invert = false) {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
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
  async function recognizeViaGoogleLens(image, settings, invert = false) {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, "image/jpeg", 0.88, invert);
    const protobuf = await recognizeViaGoogleLensProtobuf(blob, canvas, settings).catch((error) => {
      log$2.warn("Google Lens protobuf failed", error);
      return null;
    });
    if (protobuf?.lines.length) return protobuf;
    const upload = await recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs).catch((error) => {
      log$2.warn("Google Lens upload failed", error);
      return null;
    });
    return upload?.lines.length ? upload : upload ?? protobuf;
  }
  async function recognizeViaGoogleLensProtobuf(blob, canvas, settings) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
    return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
  }
  function ocrRecognizer(settings) {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
  }
  function isOcrProviderConfigured(settings) {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
  }
  async function imageToBase64Payload(image, maxPixels, invertDark = false) {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, "image/jpeg", 0.86, invertDark);
    return { base64: (await readBlobAsDataUrl(blob, "Blob read failed.")).split(",")[1] ?? "", width: canvas.width, height: canvas.height };
  }
  async function imageToBlobPayload(image, maxPixels, type, quality, invertDark = false) {
    const canvas = await imageToCanvas(image, maxPixels, invertDark);
    try {
      return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
      const fallbackCanvas = await imageBlobToCanvas(image, maxPixels, invertDark);
      return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
  }
  async function recognizeViaGoogleLensUpload(blob, width, height, timeout) {
    const data = new FormData();
    data.append("encoded_image", blob, "image.jpg");
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout, {
      Origin: "https://lens.google.com",
      Referer: "https://lens.google.com/"
    });
    return parseGoogleLensUploadHtml(response, width, height);
  }
  async function imageToCanvas(image, maxPixels, invert = false) {
    try {
      const canvas = drawImageToCanvas(image, maxPixels);
      assertCanvasReadable(canvas);
      return invert ? invertedCanvas(canvas) : canvas;
    } catch {
      return imageBlobToCanvas(image, maxPixels, invert);
    }
  }
  async function imageBlobToCanvas(image, maxPixels, invert = false) {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith("data:")) throw new Error("Image cannot be read by OCR.");
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const loaded = await loadImage(objectUrl);
      const canvas = drawImageToCanvas(loaded, maxPixels);
      assertCanvasReadable(canvas);
      return invert ? invertedCanvas(canvas) : canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function invertedCanvas(canvas) {
    try {
      const inverted = document.createElement("canvas");
      inverted.width = canvas.width;
      inverted.height = canvas.height;
      const context = inverted.getContext("2d");
      if (!context) return canvas;
      context.filter = "invert(1)";
      context.drawImage(canvas, 0, 0);
      return inverted;
    } catch {
      return canvas;
    }
  }
  const DARK_FIELD_SIZE = 48;
  const DARK_LUMINANCE = 90;
  const DARK_REGION_TRIGGER = 0.1;
  const DARK_LINE_MEAN_LUMINANCE = 110;
  function buildLuminanceField(image) {
    try {
      if (!image.naturalWidth || !image.naturalHeight) return null;
      const size = DARK_FIELD_SIZE;
      const sample = document.createElement("canvas");
      sample.width = size;
      sample.height = size;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, size, size);
      const { data } = context.getImageData(0, 0, size, size);
      const lum = new Uint8Array(size * size);
      let opaque = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        if (data[i + 3] >= 8) opaque++;
        lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 | 0;
      }
      if (opaque < lum.length * 0.5) return null;
      return { size, lum };
    } catch {
      return null;
    }
  }
  function luminanceFieldDarkFraction(field) {
    let dark = 0;
    for (const value of field.lum) if (value < DARK_LUMINANCE) dark++;
    return dark / field.lum.length;
  }
  function regionMeanLuminance(field, box, width, height) {
    if (width <= 0 || height <= 0) return 255;
    const x0 = Math.max(0, Math.floor(box.left / width * field.size));
    const x1 = Math.min(field.size, Math.ceil((box.left + box.width) / width * field.size));
    const y0 = Math.max(0, Math.floor(box.top / height * field.size));
    const y1 = Math.min(field.size, Math.ceil((box.top + box.height) / height * field.size));
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        sum += field.lum[y * field.size + x];
        count++;
      }
    }
    return count ? sum / count : 255;
  }
  function darkAreaIsRead(field, normal) {
    const size = field.size;
    let darkTotal = 0;
    let darkCovered = 0;
    const lines = normal?.lines ?? [];
    const width = normal?.width || 1;
    const height = normal?.height || 1;
    const cellRects = lines.map((line) => ({
      x0: Math.floor(line.box.left / width * size),
      x1: Math.ceil((line.box.left + line.box.width) / width * size),
      y0: Math.floor(line.box.top / height * size),
      y1: Math.ceil((line.box.top + line.box.height) / height * size)
    }));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (field.lum[y * size + x] >= DARK_LUMINANCE) continue;
        darkTotal++;
        if (cellRects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) darkCovered++;
      }
    }
    if (!darkTotal) return true;
    return darkCovered / darkTotal >= 0.5;
  }
  function boxesOverlapSignificantly(a, b) {
    const ix = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    const intersection = ix * iy;
    if (intersection <= 0) return false;
    const minArea = Math.min(a.width * a.height, b.width * b.height) || 1;
    return intersection / minArea >= 0.5;
  }
  function mergeDarkPassResult(normal, inverted, field) {
    if (!inverted?.lines.length) return normal;
    if (!normal) {
      const darkOnly = field ? inverted.lines.filter((line) => regionMeanLuminance(field, line.box, inverted.width, inverted.height) < DARK_LINE_MEAN_LUMINANCE) : inverted.lines;
      return darkOnly.length ? { width: inverted.width, height: inverted.height, lines: darkOnly } : null;
    }
    const lines = [...normal.lines];
    for (const line of inverted.lines) {
      if (field && regionMeanLuminance(field, line.box, inverted.width, inverted.height) >= DARK_LINE_MEAN_LUMINANCE) continue;
      if (lines.some((existing) => boxesOverlapSignificantly(existing.box, line.box))) continue;
      lines.push(line);
    }
    return { width: normal.width, height: normal.height, lines };
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
    if (!isNearViewport(image, imagePrefetchMargin(settings))) return false;
    if (isImageOccludedByVideo(image, rect)) return false;
    return isVisibleOcrImage(image);
  }
  function ocrImageFromPointerEvent(event, settings) {
    if (!settings.ocrEnabled || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
    return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
  }
  function ocrReaderSurfaceFromPointerEvent(event, settings) {
    if (!settings.ocrEnabled || settings.ocrProvider === "off" || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
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
  function pointerEventReaderSurfaceTarget(event, settings) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-jpdb-reader-root]")) return null;
    return readerSurfaceFromElement(target, settings);
  }
  function pointerEventReaderSurfaceAtPoint(event, settings) {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (element && !element.closest("[data-jpdb-reader-root]")) {
      const surface = readerSurfaceFromElement(element, settings);
      if (surface) return surface;
    }
    return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
  }
  function readerSurfaceFromElement(element, settings) {
    const canvas = element instanceof HTMLCanvasElement ? element : element.closest("canvas");
    if (canvas && collectCanvasReaderSurfaces().includes(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    const background = collectBackgroundImageReaderSurfaces().find((surface) => (surface === element || surface.contains(element)) && isReaderSurfaceCandidate(surface, settings));
    return background ?? null;
  }
  function readerSurfaceAtPoint(clientX, clientY, settings) {
    const surfaces = [
      ...collectCanvasReaderSurfaces(),
      ...collectBackgroundImageReaderSurfaces()
    ].filter((surface) => isReaderSurfaceCandidate(surface, settings));
    return surfaces.find((surface) => rectContainsPoint(surface.getBoundingClientRect(), clientX, clientY)) ?? null;
  }
  function isReaderSurfaceCandidate(surface, settings) {
    const rect = surface.getBoundingClientRect();
    return rect.width * rect.height >= settings.ocrMinImageArea && isNearViewport(surface, settings.ocrPrefetchMargin) && !isHiddenByCss(surface) && !isInsideHiddenAncestor(surface);
  }
  function rectContainsPoint(rect, clientX, clientY) {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }
  function isIgnoredOcrImage(image) {
    return Boolean(image.closest("[data-jpdb-reader-root]") || image.closest('[data-yomu-ocr="ignore"], [data-jpdb-reader-ocr="ignore"]') || image.closest('[aria-hidden="true"], [hidden], .slick-cloned') || isBrandOrIconOcrImage(image) || isYouTubeThumbnailImage(image));
  }
  function isYouTubeThumbnailImage(image) {
    return Boolean(image.closest(OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR));
  }
  const OCR_BRAND_IMAGE_TEXT_RE = /(^|[\s/_.?#&=-])(?:app-?icon|apple-touch-icon|avatar|badge|brand|favicon|icon|logo|site-icon|touch-icon|yomu-icon)(?=$|[\s/_.?#&=-])/iu;
  const OCR_BRAND_IMAGE_CONTAINER_SELECTOR = [
    "header",
    "nav",
    '[role="banner"]',
    '[role="navigation"]',
    '[class*="brand" i]',
    '[class*="logo" i]',
    '[id*="brand" i]',
    '[id*="logo" i]'
  ].join(",");
  function isBrandOrIconOcrImage(image) {
    if (OCR_BRAND_IMAGE_TEXT_RE.test(imageIdentityText(image))) return true;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && area <= 12e3 && isIconLikeImage(image, rect)) return true;
    if (image.closest(OCR_BRAND_IMAGE_CONTAINER_SELECTOR)) return area <= 16e4 || isIconLikeImage(image, rect);
    return false;
  }
  function imageIdentityText(image) {
    return [
      image.currentSrc,
      image.src,
      image.alt,
      image.title,
      image.id,
      image.className,
      image.getAttribute("aria-label"),
      image.getAttribute("role")
    ].filter(Boolean).join(" ");
  }
  function isIconLikeImage(image, rect = image.getBoundingClientRect()) {
    const width = image.naturalWidth || rect.width;
    const height = image.naturalHeight || rect.height;
    if (!width || !height) return false;
    const ratio = width / height;
    return ratio >= 0.72 && ratio <= 1.38 && Math.max(rect.width, rect.height, width, height) <= 256;
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
    return node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement || node instanceof HTMLSourceElement || node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node)) || node instanceof Element && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]'));
  }
  function isImageOccludedByVideo(image, rect = image.getBoundingClientRect()) {
    if (image.dataset.yomuVideoFrame) return false;
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
  function rectsNearlyEqual(a, b) {
    return Math.abs(a.left - b.left) <= 1 && Math.abs(a.top - b.top) <= 1 && Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;
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
  function ocrConcurrencyLimit(settings) {
    return Math.max(1, Math.min(8, Math.round(settings.ocrConcurrency || 1)));
  }
  function canvasPrefetchMargin(settings) {
    const pages = Math.max(0, settings.ocrPrefetchPages || 0);
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return Math.max(settings.ocrPrefetchMargin, pages * viewportHeight);
  }
  let imageReaderPageCache = { at: -Infinity, value: false };
  function isLikelyImageReaderPage(settings) {
    if (isReaderRasterPage()) return true;
    const now = Date.now();
    if (now - imageReaderPageCache.at < 1e3) return imageReaderPageCache.value;
    let large = 0;
    let value = false;
    for (const image of Array.from(document.images)) {
      const rect = image.getBoundingClientRect();
      if (rect.width >= 300 && rect.width * rect.height >= settings.ocrMinImageArea && ++large >= 3) {
        value = true;
        break;
      }
    }
    imageReaderPageCache = { at: now, value };
    return value;
  }
  function imagePrefetchMargin(settings) {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings) ? canvasPrefetchMargin(settings) : settings.ocrPrefetchMargin;
  }
  function imageReaderMaxImages(settings) {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings) ? Math.max(settings.ocrMaxImagesPerPage, settings.ocrPrefetchPages * 2 + 1) : settings.ocrMaxImagesPerPage;
  }
  function activeReaderRasterSurfaces(surfaces, settings, userRequested) {
    const margin = readerRasterCaptureMargin(settings, userRequested);
    return surfaces.filter((surface) => isNearViewport(surface, margin)).sort((a, b) => elementViewportDistance(a) - elementViewportDistance(b)).slice(0, readerRasterMaxSurfaces(settings, userRequested));
  }
  function readerRasterCaptureMargin(settings, userRequested) {
    if (userRequested) return settings.ocrPrefetchMargin;
    return Math.min(canvasPrefetchMargin(settings), settings.ocrPrefetchMargin);
  }
  function readerRasterMaxSurfaces(settings, userRequested) {
    const configured = Math.max(1, Math.round(settings.ocrMaxImagesPerPage || 1));
    if (userRequested) return configured;
    return Math.min(configured, 3);
  }
  function imageViewportDistance(image) {
    return elementViewportDistance(image);
  }
  function elementViewportDistance(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return Number.POSITIVE_INFINITY;
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    if (rect.right < 0) return -rect.right;
    if (rect.left > window.innerWidth) return rect.left - window.innerWidth;
    return 0;
  }
  function captureVideoFrameDataUrl(video) {
    try {
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return void 0;
      const canvas = document.createElement("canvas");
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return void 0;
    }
  }
  function isTwitterHost(hostname = location.hostname) {
    return hostname === "twitter.com" || hostname === "x.com" || hostname.endsWith(".twitter.com") || hostname.endsWith(".x.com");
  }
  function isLikelyPausedVideoThumbnail(video) {
    if (isTwitterHost()) return true;
    if (video.closest(VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR)) return true;
    if (video.closest(VIDEO_FRAME_PLAYER_SELECTOR)) return false;
    if (!video.closest(VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR)) return false;
    return !isPrimaryPlayerSizedVideo(video);
  }
  function isPrimaryPlayerSizedVideo(video) {
    const rect = video.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 160) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return rect.width >= 480 && rect.height >= 270;
    return rect.width >= viewportWidth * 0.6 || rect.width * rect.height >= viewportWidth * viewportHeight * 0.25;
  }
  function positionVideoFrameImage(frame, rect, video) {
    const content = videoContentBox(rect, video);
    frame.style.left = `${content.left}px`;
    frame.style.top = `${content.top}px`;
    frame.style.width = `${content.width}px`;
    frame.style.height = `${content.height}px`;
  }
  function positionVideoFrameResumeControl(control, rect, video) {
    if (attachVideoFrameResumeControlToSubtitleRail(control)) return;
    attachVideoFrameResumeControlFallback(control);
    const content = videoContentBox(rect, video);
    control.style.left = `${content.left + content.width - 12}px`;
    control.style.top = `${content.top + 12}px`;
  }
  function positionVideoFrameStatus(status, rect, video) {
    const content = videoContentBox(rect, video);
    const maxWidth = Math.max(96, Math.min(Math.max(96, content.width - 24), 320));
    status.style.left = `${Math.max(8, content.left + 12)}px`;
    status.style.top = `${Math.max(8, content.top + 12)}px`;
    status.style.maxWidth = `${maxWidth}px`;
  }
  function positionOcrImageStatus(status, rect) {
    const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
    status.style.left = `${Math.max(8, rect.left + 12)}px`;
    status.style.top = `${Math.max(8, rect.top + 12)}px`;
    status.style.maxWidth = `${maxWidth}px`;
  }
  function videoFrameStatusTextKey(status) {
    switch (status) {
      case "ready":
        return "ocrPausedFrameReady";
      case "empty":
        return "ocrPausedFrameNoText";
      case "failed":
        return "ocrPausedFrameFailed";
      case "loading":
      default:
        return "ocrPausedFrameScanning";
    }
  }
  function attachVideoFrameResumeControlToSubtitleRail(control) {
    const rail = document.querySelector('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail');
    if (!rail?.isConnected) return false;
    const oldRoot = subtitlePlayerRoot(control);
    control.classList.remove("jpdb-ocr-video-frame-resume-fallback");
    control.style.left = "";
    control.style.top = "";
    const panelButton = rail.querySelector(".jpdb-subtitle-panel-toggle");
    if (control.parentElement !== rail) rail.insertBefore(control, panelButton ?? null);
    updateSubtitleRailResumeState(oldRoot);
    updateSubtitleRailResumeState(subtitlePlayerRoot(control));
    return true;
  }
  function attachVideoFrameResumeControlFallback(control) {
    const oldRoot = subtitlePlayerRoot(control);
    if (control.parentElement !== document.body) document.body.append(control);
    control.classList.add("jpdb-ocr-video-frame-resume-fallback");
    updateSubtitleRailResumeState(oldRoot);
  }
  function removeVideoFrameResumeControl(control) {
    const root = subtitlePlayerRoot(control);
    control.remove();
    updateSubtitleRailResumeState(root);
  }
  function subtitlePlayerRoot(control) {
    return control.closest(".jpdb-subtitle-player");
  }
  function updateSubtitleRailResumeState(root) {
    if (!root) return;
    root.classList.toggle("jpdb-ocr-video-frame-resume-active", Boolean(root.querySelector(".jpdb-ocr-video-frame-resume")));
  }
  function playVideoIcon() {
    return `<svg class="jpdb-ocr-video-frame-resume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7-11-7Z"></path></svg>`;
  }
  function videoContentBox(rect, video) {
    const intrinsicWidth = video.videoWidth;
    const intrinsicHeight = video.videoHeight;
    if (!intrinsicWidth || !intrinsicHeight || !rect.width || !rect.height) return rect;
    const scale = Math.min(rect.width / intrinsicWidth, rect.height / intrinsicHeight);
    const width = intrinsicWidth * scale;
    const height = intrinsicHeight * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height
    };
  }
  function imageCacheKey(image) {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
  }
  function backgroundSurfaceCacheKey(surface) {
    const rect = surface.getBoundingClientRect();
    return [
      surface.getAttribute("data-page-index") ?? "",
      backgroundImageReaderUrl(surface) ?? "",
      Math.round(rect.width),
      Math.round(rect.height)
    ].join("|");
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
  function requestTextForm(url, data, timeout, headers) {
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      ...headers ? { headers } : {},
      data,
      responseType: "text",
      timeout
    }, (response) => String(response.responseText ?? response.response ?? ""), (status) => `Google Lens upload returned ${status}.`, "Google Lens upload timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, { method: "POST", body: data }).then((response) => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
  }
  function requestBlob(url) {
    const fallbackType = imageMimeTypeFromUrl(url);
    const userscriptRequest = requestViaUserscript({
      method: "GET",
      url,
      responseType: "arraybuffer"
    }, (response) => blobFromUserscriptResponse(response, fallbackType), (status) => `Image fetch returned ${status}.`);
    if (userscriptRequest) return userscriptRequest;
    return fetch(url).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
  }
  function blobFromUserscriptResponse(response, fallbackType = "image/jpeg") {
    const value = response.response;
    if (value instanceof Blob) return value.type ? value : new Blob([value], { type: fallbackType });
    if (value instanceof ArrayBuffer) {
      const head = new Uint8Array(value, 0, Math.min(16, value.byteLength));
      return new Blob([value], { type: sniffImageMimeType(head) ?? fallbackType });
    }
    if (ArrayBuffer.isView(value)) {
      const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const copy = new Uint8Array(source.byteLength);
      copy.set(source);
      return new Blob([copy.buffer], { type: sniffImageMimeType(copy.subarray(0, 16)) ?? fallbackType });
    }
    return new Blob([value], { type: fallbackType });
  }
  function imageMimeTypeFromUrl(url) {
    const extension = url.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    switch (extension) {
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "avif":
        return "image/avif";
      case "bmp":
        return "image/bmp";
      default:
        return "image/jpeg";
    }
  }
  function sniffImageMimeType(bytes) {
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
    if (bytes.length >= 4 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56) return "image/gif";
    if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
    return void 0;
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
  async function loadCleanMirrorImage(url) {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return void 0;
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImage(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
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
  const HAS_CUE_WORD_CONTENT_RE = /[\p{L}\p{N}]/u;
  function normalizedSubtitleCueParts(cue, options) {
    const base = normalizedSubtitleCueBase(cue, options);
    if (!base) return [];
    if (!HAS_CUE_WORD_CONTENT_RE.test(base.text)) return [];
    const sentenceParts = mergePunctuationOnlyCueParts(splitCueDisplayText(base.text));
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
  function mergePunctuationOnlyCueParts(parts) {
    const merged = [];
    for (const part of parts) {
      if (merged.length && !HAS_CUE_WORD_CONTENT_RE.test(part)) {
        merged[merged.length - 1] += part;
      } else {
        merged.push(part);
      }
    }
    return merged;
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
    const state2 = createAssParseState();
    for (const rawLine of text.replace(/\r/g, "").split("\n")) {
      readAssSubtitleLine(rawLine.trim(), state2);
    }
    return state2.cues.sort((a, b) => a.start - b.start);
  }
  function createAssParseState() {
    return {
      cues: [],
      inEvents: false,
      format: ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"]
    };
  }
  function readAssSubtitleLine(line, state2) {
    if (!shouldParseAssCueLine(line, state2)) return;
    const cue = readAssDialogueCue(line, state2.format);
    if (cue) state2.cues.push(cue);
  }
  function shouldParseAssCueLine(line, state2) {
    if (shouldIgnoreAssLine(line)) return false;
    if (updateAssSectionState(line, state2)) return false;
    if (!shouldReadAssDialogueLine(line, state2)) return false;
    return !readAssFormatLine(line, state2);
  }
  function shouldReadAssDialogueLine(line, state2) {
    return state2.inEvents || /^Dialogue:/i.test(line);
  }
  function shouldIgnoreAssLine(line) {
    return !line || line.startsWith(";");
  }
  function updateAssSectionState(line, state2) {
    if (/^\[Events\]/i.test(line)) {
      state2.inEvents = true;
      return true;
    }
    if (/^\[.+\]/.test(line)) {
      state2.inEvents = false;
      return true;
    }
    return false;
  }
  function readAssFormatLine(line, state2) {
    if (!/^Format:/i.test(line)) return false;
    state2.format = line.slice(line.indexOf(":") + 1).split(",").map((part) => part.trim().toLowerCase());
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
  function findInitialLeadInCue(cues, time) {
    const first = cues[0];
    if (!first) return void 0;
    return time <= first.start ? first : void 0;
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
    return decodeCaptionEntities(value).replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  }
  const CAPTION_ENTITY_RE = /&(nbsp|amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi;
  const NAMED_CAPTION_ENTITIES = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
  };
  function decodeCaptionEntities(value) {
    if (!value.includes("&")) return value;
    return value.replace(CAPTION_ENTITY_RE, (match, name) => {
      const lower = name.toLowerCase();
      if (lower in NAMED_CAPTION_ENTITIES) return NAMED_CAPTION_ENTITIES[lower];
      const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : match;
    });
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
  function isSubtitleVideoElementRenderable(video) {
    if (video.hidden) return false;
    const style = getComputedStyle(video);
    return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.01;
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
  function computeSubtitleDrawerLayout(options) {
    const size = options.size ?? {};
    const preferredPlacement = options.preferredPlacement ?? "right";
    const margin = options.compactPanel || preferredPlacement === "bottom" ? 0 : TRANSCRIPT_PANEL_MARGIN;
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
    return Math.max(TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT, viewportHeight - margin * 3);
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
      const key = source.sourceKey;
      if (seen.has(key)) return false;
      seen.add(key);
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
    lastResizeSignature = "";
    hasActiveInset() {
      return hasActiveVideoInset(this.lastSignature);
    }
    measureWithoutInset(video, callback) {
      if (!this.hasActiveInset()) {
        return callback();
      }
      const snapshots = captureVideoInsetSnapshots(video);
      for (const snapshot of snapshots) snapshot.clear();
      try {
        return callback();
      } finally {
        for (const snapshot of snapshots) snapshot.restore();
      }
    }
    apply(options) {
      if (shouldPreserveYouTubeNativePlayerSize(options)) {
        return this.clear(options.video);
      }
      const metrics = videoInsetMetrics(options);
      if (metrics.signature === this.lastSignature) {
        this.applyResizeIfNeeded(options, metrics);
        return false;
      }
      const previousSignature = this.lastSignature;
      const preservesYouTubeBottomPlayer = shouldPreserveYouTubeBottomPlayerSize(options.side);
      if (!preservesYouTubeBottomPlayer) captureYouTubePlayerContainerBaseRects(youtubePlayerContainers(options.side));
      this.lastSignature = metrics.signature;
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-left", options.side === "left");
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-right", options.side === "right");
      document.documentElement.classList.toggle("jpdb-subtitle-video-inset-bottom", options.side === "bottom");
      document.documentElement.style.setProperty("--jpdb-subtitle-video-inset", metrics.inset);
      applyYouTubePlayerInset(options.side, metrics.width, metrics.insetPixels, metrics.height, {
        clearStableBottom: !previousSignature.startsWith("bottom:")
      });
      applyGenericVideoInsetIfNeeded(options, metrics);
      this.applyResizeIfNeeded(options, metrics);
      return true;
    }
    clear(video) {
      if (!hasActiveVideoInset(this.lastSignature)) return false;
      this.lastSignature = "";
      document.documentElement.classList.remove("jpdb-subtitle-video-inset-left", "jpdb-subtitle-video-inset-right", "jpdb-subtitle-video-inset-bottom");
      document.documentElement.style.removeProperty("--jpdb-subtitle-video-inset");
      const watchFlexy = document.querySelector("ytd-watch-flexy");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-width");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-height");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-min-player-height");
      clearYouTubeInsetTargets();
      if (video) clearGenericVideoInset(video);
      resetYouTubePlayerResizeTracking();
      this.lastResizeSignature = "";
      dispatchVideoLayoutResize();
      return true;
    }
    applyResizeIfNeeded(options, metrics) {
      if (shouldPreserveYouTubeBottomPlayerSize(options.side)) return;
      const mode = options.resizeEventMode ?? "immediate";
      if (mode === "none" || this.lastResizeSignature === metrics.signature) return;
      this.lastResizeSignature = metrics.signature;
      scheduleYouTubePlayerResize(metrics.width, metrics.height, mode);
      dispatchVideoLayoutResize(mode);
    }
  }
  function hasActiveVideoInset(lastSignature) {
    return Boolean(lastSignature) || document.documentElement.classList.contains("jpdb-subtitle-video-inset-left") || document.documentElement.classList.contains("jpdb-subtitle-video-inset-right") || document.documentElement.classList.contains("jpdb-subtitle-video-inset-bottom");
  }
  function videoInsetMetrics(options) {
    const gap = options.side === "left" ? options.margin * 2 : options.margin;
    const insetPixels = Math.max(0, Math.round(options.panelSize) + gap);
    const width = videoInsetWidth(options);
    const height = videoInsetHeight(options, width);
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
  function videoInsetHeight(options, width) {
    if (options.side === "bottom") return Math.max(180, Math.round(options.playerSize));
    const aspectHeight = Math.round(width * videoAspectRatio(options.video));
    const currentHeight = Math.max(180, Math.round(options.videoRect.height));
    return Math.max(180, Math.min(currentHeight, aspectHeight));
  }
  function applyGenericVideoInsetIfNeeded(options, metrics) {
    if (isYouTubePage$1() || !options.video) return;
    applyGenericVideoInset(options.video, options.side, options.side === "bottom" ? metrics.height : metrics.width, metrics.height);
  }
  const GENERIC_TARGET_INSET_PROPS = ["width", "height", "max-width", "max-height", "min-width", "min-height", "margin-left", "margin-right", "justify-self", "object-fit"];
  const CONTAINED_VIDEO_INSET_PROPS = ["height", "max-height", "min-height", "object-fit"];
  const CONTAINER_INSET_PROPS = ["width", "max-width", "min-width", "height", "max-height", "min-height", "margin-left", "margin-right"];
  const WATCH_FLEXY_INSET_VARS = ["--ytd-watch-flexy-player-width", "--ytd-watch-flexy-player-height", "--ytd-watch-flexy-min-player-height"];
  function captureVideoInsetSnapshots(video) {
    const target = video ? genericVideoInsetTargets.get(video) ?? genericVideoLayoutTarget(video, "right") : null;
    const snapshots = [documentInsetSnapshot()];
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy) snapshots.push(elementStyleSnapshot(watchFlexy, WATCH_FLEXY_INSET_VARS));
    for (const element of youtubeInsetTargets()) {
      snapshots.push(elementStyleSnapshot(element, CONTAINER_INSET_PROPS, () => clearYouTubePlayerContainerInset(element)));
    }
    if (target) snapshots.push(elementStyleSnapshot(target, GENERIC_TARGET_INSET_PROPS));
    if (video && target !== video) snapshots.push(elementStyleSnapshot(video, CONTAINED_VIDEO_INSET_PROPS));
    return snapshots;
  }
  function documentInsetSnapshot() {
    const root = document.documentElement;
    const insetClasses = ["jpdb-subtitle-video-inset-left", "jpdb-subtitle-video-inset-right", "jpdb-subtitle-video-inset-bottom"];
    const activeClasses = insetClasses.filter((name) => root.classList.contains(name));
    const docInset = root.style.getPropertyValue("--jpdb-subtitle-video-inset");
    return {
      clear: () => {
        root.classList.remove(...insetClasses);
        root.style.removeProperty("--jpdb-subtitle-video-inset");
      },
      restore: () => {
        root.classList.add(...activeClasses);
        if (docInset) root.style.setProperty("--jpdb-subtitle-video-inset", docInset);
      }
    };
  }
  function elementStyleSnapshot(element, props, clear) {
    const saved = props.map((prop) => [prop, element.style.getPropertyValue(prop)]);
    return {
      clear: clear ?? (() => {
        for (const prop of props) element.style.removeProperty(prop);
      }),
      restore: () => {
        for (const [prop, value] of saved) {
          if (value) element.style.setProperty(prop, value);
        }
      }
    };
  }
  function createSubtitleVideoInsetAdapter() {
    return new SubtitleVideoInsetAdapter();
  }
  function subtitleVisibleViewportSize() {
    const innerWidth = Math.max(1, Math.round(window.innerWidth));
    const innerHeight = Math.max(1, Math.round(window.innerHeight));
    const visual = window.visualViewport;
    if (!visual) return { width: innerWidth, height: innerHeight };
    const visualWidth = Math.max(1, Math.round(visual.width));
    const visualHeight = Math.max(1, Math.round(visual.height));
    if (isStaleSwappedVisualViewport(visualWidth, visualHeight, innerWidth, innerHeight)) {
      return { width: innerWidth, height: innerHeight };
    }
    return { width: visualWidth, height: visualHeight };
  }
  function isStaleSwappedVisualViewport(visualWidth, visualHeight, innerWidth, innerHeight) {
    if (visualWidth > visualHeight !== innerWidth > innerHeight) return true;
    const widthDelta = Math.abs(visualWidth - innerWidth);
    const heightDelta = Math.abs(visualHeight - innerHeight);
    const swappedWidthDelta = Math.abs(visualWidth - innerHeight);
    const swappedHeightDelta = Math.abs(visualHeight - innerWidth);
    const widthThreshold = Math.max(96, innerWidth * 0.12);
    const heightThreshold = Math.max(96, innerHeight * 0.12);
    return widthDelta > widthThreshold && heightDelta > heightThreshold && swappedWidthDelta <= Math.max(96, innerHeight * 0.12) && swappedHeightDelta <= Math.max(96, innerWidth * 0.12);
  }
  function visibleViewportWidth() {
    return subtitleVisibleViewportSize().width;
  }
  function visibleViewportHeight() {
    return subtitleVisibleViewportSize().height;
  }
  function subtitleVideoLayoutRect(video) {
    if (isYouTubePage$1()) {
      const scopedRect = video ? youtubePlayerRectForVideo(video) : void 0;
      if (scopedRect) return scopedRect;
      const rect = youtubeVisiblePlayerRect();
      if (rect) return rect;
    }
    return subtitleVideoLayoutTarget(video)?.getBoundingClientRect() ?? new DOMRect(0, 0, visibleViewportWidth(), visibleViewportHeight());
  }
  function subtitleVideoLayoutTarget(video) {
    if (!video) return void 0;
    if (isYouTubePage$1()) {
      return video.closest("#movie_player") ?? video.closest(".html5-video-player") ?? video.closest("ytd-player") ?? video;
    }
    return genericVideoLayoutTarget(video);
  }
  function transcriptAvoidanceTarget(video) {
    const videoRect = video.getBoundingClientRect();
    let best = genericVideoLayoutTarget(video);
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      if (isUsefulTranscriptAvoidanceTarget(ancestor, video, videoRect)) best = ancestor;
    }
    return best;
  }
  function isUsefulTranscriptAvoidanceTarget(element, video, videoRect) {
    const rect = element.getBoundingClientRect();
    if (element.matches("[data-yomu-video-frame]")) return true;
    return usableVideoRect(rect) && rectContainsRect(rect, videoRect, 2) && !isViewportSizedVideoRect(rect) && hasMeaningfulVideoInsetSpace(rect, videoRect) && isLikelyGenericPlayerFrame(element) && (video.controls || hasLikelyPlayerChrome(element));
  }
  function isViewportSizedVideoRect(rect) {
    return rect.width > visibleViewportWidth() * 0.92 || rect.height > visibleViewportHeight() * 0.9;
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
  function applyYouTubePlayerInset(side, width, inset, height, options = {}) {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (side === "bottom") {
      clearYouTubeWatchFlexyInset(watchFlexy);
      if (options.clearStableBottom ?? true) clearYouTubeInsetTargets();
      applyYouTubeWatchContentInset();
      return;
    }
    const containers = youtubePlayerContainers(side);
    captureYouTubePlayerContainerBaseRects(containers);
    applyYouTubeWatchFlexyInset(watchFlexy, side, width, height);
    applyYouTubeWatchContentInset();
    for (const element of containers) {
      applyYouTubePlayerContainerInset(element, side, width, inset, bottomInsetHeight(side, height));
    }
  }
  function applyYouTubeWatchFlexyInset(watchFlexy, side, width, height) {
    if (side !== "bottom") watchFlexy?.style.setProperty("--ytd-watch-flexy-player-width", `${width}px`);
    if (height) watchFlexy?.style.setProperty("--ytd-watch-flexy-player-height", `${height}px`);
    if (side === "bottom" && height) watchFlexy?.style.setProperty("--ytd-watch-flexy-min-player-height", `${height}px`);
  }
  function clearYouTubeWatchFlexyInset(watchFlexy) {
    watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-width");
    watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-height");
    watchFlexy?.style.removeProperty("--ytd-watch-flexy-min-player-height");
  }
  function applyYouTubeWatchContentInset(_side, _inset) {
    const columns = document.querySelector("ytd-watch-flexy #columns");
    if (!columns) return;
    setStylePropertyIfChanged(columns, "margin-left", "");
  }
  function bottomInsetHeight(side, height) {
    return side === "bottom" ? height : 0;
  }
  const youtubePlayerContainerBaseRects = /* @__PURE__ */ new WeakMap();
  function captureYouTubePlayerContainerBaseRects(elements) {
    const viewportWidth = visibleViewportWidth();
    for (const element of elements) {
      const baseRect = youtubePlayerContainerBaseRects.get(element);
      if (baseRect?.viewportWidth === viewportWidth) continue;
      const rect = element.getBoundingClientRect();
      youtubePlayerContainerBaseRects.set(element, { left: rect.left, right: rect.right, viewportWidth });
    }
  }
  function youtubePlayerContainers(side) {
    if (!isYouTubePage$1()) return [];
    if (side === "bottom") {
      return uniqueElements([
        "ytd-watch-flexy #player",
        "ytd-watch-flexy #player-container-outer",
        "ytd-watch-flexy #player-container-inner",
        "ytd-watch-flexy ytd-player",
        "ytd-watch-flexy #movie_player",
        "#player-container-id",
        "#player",
        "#movie_player",
        ".html5-video-player"
      ].flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    }
    const desktopContainers = uniqueElements([
      "ytd-watch-flexy #primary",
      "ytd-watch-flexy #primary-inner"
    ].flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    if (!desktopContainers.length) return youtubeMobileSidePlayerContainers();
    const fullBleed = youtubeFullBleedPlayerContainer();
    return fullBleed ? uniqueElements([...desktopContainers, fullBleed]) : desktopContainers;
  }
  function youtubeFullBleedPlayerContainer() {
    const flexy = document.querySelector("ytd-watch-flexy[is-single-column]");
    const container = flexy?.querySelector("#full-bleed-container #player-container");
    if (!container) return void 0;
    const position = getComputedStyle(container).position;
    return position === "absolute" || position === "fixed" ? container : void 0;
  }
  function youtubeMobileSidePlayerContainers() {
    const player = firstElement([
      "#player-container-id",
      "#player",
      "#movie_player",
      ".html5-video-player"
    ]);
    const belowPlayer = firstElement([
      "ytm-single-column-watch-next-results-renderer.watch-content",
      ".watch-below-the-player"
    ]);
    return uniqueElements([player, belowPlayer].filter((element) => Boolean(element)));
  }
  function firstElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return void 0;
  }
  function youtubeInsetTargets() {
    if (!isYouTubePage$1()) return [];
    return uniqueElements([
      document.querySelector("ytd-watch-flexy #columns"),
      ...youtubePlayerContainers("left"),
      ...youtubePlayerContainers("bottom")
    ].filter((element) => Boolean(element)));
  }
  function uniqueElements(elements) {
    return Array.from(new Set(elements));
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
    setStylePropertyIfChanged(element, "width", "");
    setStylePropertyIfChanged(element, "max-width", "");
    setStylePropertyIfChanged(element, "margin-left", "0px");
    setStylePropertyIfChanged(element, "margin-right", "0px");
    setStylePropertyIfChanged(element, "height", `${height}px`);
    setStylePropertyIfChanged(element, "max-height", `${height}px`);
    setStylePropertyIfChanged(element, "min-height", "0px");
  }
  function applySideYouTubePlayerContainerInset(element, side, width, inset) {
    let baseRect = youtubePlayerContainerBaseRects.get(element);
    if (!baseRect) {
      const rect = element.getBoundingClientRect();
      baseRect = { left: rect.left, right: rect.right, viewportWidth: visibleViewportWidth() };
      youtubePlayerContainerBaseRects.set(element, baseRect);
    }
    const widthValue = `${width}px`;
    setStylePropertyIfChanged(element, "width", widthValue);
    setStylePropertyIfChanged(element, "max-width", widthValue);
    setStylePropertyIfChanged(element, "min-width", "0px");
    const margin = side === "left" ? leftYouTubePlayerMargin(inset, element) : `${Math.max(0, Math.round(Math.min(baseRect.right, visibleViewportWidth()) - (visibleViewportWidth() - inset)))}px`;
    setStylePropertyIfChanged(element, side === "left" ? "margin-left" : "margin-right", margin);
    setStylePropertyIfChanged(element, side === "left" ? "margin-right" : "margin-left", "0px");
  }
  function leftYouTubePlayerMargin(inset, element) {
    if (element.matches("#primary-inner")) return "0px";
    const columns = element.closest("#columns");
    if (columns && getComputedStyle(columns).display.includes("flex")) {
      return `${Math.max(0, Math.round(inset))}px`;
    }
    const rect = element.getBoundingClientRect();
    const currentMargin = Number.parseFloat(element.style.marginLeft) || 0;
    const naturalLeft = rect.left - currentMargin;
    return `${Math.max(0, Math.round(inset - naturalLeft))}px`;
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
    const viewportWidth = visibleViewportWidth();
    const viewportHeight = visibleViewportHeight();
    const left = Math.max(0, Math.min(viewportWidth, rect.left));
    const top = Math.max(0, Math.min(viewportHeight, rect.top));
    const right = Math.max(left, Math.min(viewportWidth, rect.right));
    const bottom = Math.max(top, Math.min(viewportHeight, rect.bottom));
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }
  function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  function scheduleYouTubePlayerResize(width, height, mode) {
    if (!isYouTubePage$1()) return;
    if (pendingYouTubePlayerResize !== void 0) window.clearTimeout(pendingYouTubePlayerResize);
    pendingYouTubePlayerResize = void 0;
    pendingYouTubePlayerResizeSize = void 0;
    if (mode === "immediate") {
      resizeYouTubePlayer(width, height);
      return;
    }
    pendingYouTubePlayerResizeSize = { width, height };
    pendingYouTubePlayerResize = window.setTimeout(() => {
      pendingYouTubePlayerResize = void 0;
      const size = pendingYouTubePlayerResizeSize;
      pendingYouTubePlayerResizeSize = void 0;
      if (size) resizeYouTubePlayer(size.width, size.height);
    }, 80);
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
  let pendingYouTubePlayerResize;
  let pendingYouTubePlayerResizeSize;
  function youtubeResizeSignature(width, height) {
    return `${Math.round(width)}:${Math.round(height)}`;
  }
  function dispatchVideoLayoutResize(mode = "immediate") {
    if (mode === "immediate") dispatchWindowEvent(createWindowEvent("resize"));
    if (pendingVideoLayoutResize !== void 0) window.clearTimeout(pendingVideoLayoutResize);
    pendingVideoLayoutResize = window.setTimeout(() => {
      pendingVideoLayoutResize = void 0;
      if (typeof window === "undefined") return;
      dispatchWindowEvent(createWindowEvent("resize"));
    }, 80);
  }
  function resetYouTubePlayerResizeTracking() {
    lastYouTubePlayerResizeSignature = "";
    if (pendingYouTubePlayerResize !== void 0) window.clearTimeout(pendingYouTubePlayerResize);
    pendingYouTubePlayerResize = void 0;
    pendingYouTubePlayerResizeSize = void 0;
  }
  function youtubeMoviePlayer() {
    return document.querySelector("#movie_player");
  }
  function canResizeYouTubePlayer(player, width, height) {
    return Boolean(player?.setSize && width > 0 && height > 0);
  }
  function shouldPreserveYouTubeNativePlayerSize(options) {
    return options.side !== "bottom" && isYouTubePage$1() && isYouTubeShortsLikePlayer(options.video, options.videoRect);
  }
  function shouldPreserveYouTubeBottomPlayerSize(side) {
    return side === "bottom" && isYouTubePage$1();
  }
  function isYouTubeShortsLikePlayer(video, videoRect) {
    if (location.pathname.startsWith("/shorts/")) return true;
    if (video?.closest("ytd-shorts, ytd-reel-video-renderer, shorts-page, shorts-video")) return true;
    if (document.querySelector("ytd-watch-flexy[is-shorts], ytd-watch-flexy[is-short], ytd-watch-flexy[shorts]")) return true;
    return isPortraitYouTubeVideo(video, videoRect);
  }
  function isPortraitYouTubeVideo(video, playerRect) {
    const mediaWidth = video?.videoWidth ?? 0;
    const mediaHeight = video?.videoHeight ?? 0;
    if (mediaWidth > 0 && mediaHeight > 0) return mediaHeight > mediaWidth * 1.08;
    const videoRect = video?.getBoundingClientRect();
    if (usableVideoRect(videoRect)) return videoRect.height > videoRect.width * 1.08;
    return usableVideoRect(playerRect) && playerRect.height > playerRect.width * 1.08;
  }
  function clearYouTubePlayerContainerInset(element) {
    for (const property of ["width", "max-width", "min-width", "height", "max-height", "min-height", "margin-left", "margin-right"]) {
      if (element.style.getPropertyValue(property)) element.style.removeProperty(property);
    }
    youtubePlayerContainerBaseRects.delete(element);
  }
  function clearYouTubeInsetTargets() {
    for (const element of youtubeInsetTargets()) clearYouTubePlayerContainerInset(element);
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
    const margin = side === "left" ? Math.max(0, Math.round(inset - baseRect.left)) : Math.max(0, Math.round(Math.min(baseRect.right, visibleViewportWidth()) - (visibleViewportWidth() - inset)));
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
    const videoRect = video.getBoundingClientRect();
    let target = video;
    for (let parent = video.parentElement; isGenericVideoLayoutParent(parent); parent = parent.parentElement) {
      const parentRect = parent.getBoundingClientRect();
      if (shouldUseGenericVideoParent(parent, parentRect, video, videoRect)) target = parent;
    }
    if (side === "bottom" && !target.matches("[data-yomu-video-frame]")) return video;
    return target;
  }
  function isGenericVideoLayoutParent(parent) {
    return Boolean(parent && parent !== document.body && parent !== document.documentElement);
  }
  function shouldUseGenericVideoParent(parent, parentRect, video, videoRect) {
    if (parent.matches("[data-yomu-video-frame]")) return true;
    if (!usableVideoRect(parentRect)) return false;
    if (!rectContainsRect(parentRect, videoRect, 4)) return false;
    const hasInsetSpace = hasMeaningfulVideoInsetSpace(parentRect, videoRect);
    if (isViewportSizedVideoRect(parentRect) && hasInsetSpace) return false;
    const likelyPlayerFrame = isLikelyGenericPlayerFrame(parent);
    const likelyPlayerWithChrome = likelyPlayerFrame && (video.controls || hasLikelyPlayerChrome(parent));
    if (rectsHaveMatchingSize(parentRect, videoRect, 3)) return likelyPlayerWithChrome;
    return likelyPlayerWithChrome || hasInsetSpace && likelyPlayerFrame;
  }
  function isLikelyGenericPlayerFrame(element) {
    const text = `${element.id} ${String(element.className)} ${element.getAttribute("aria-label") ?? ""}`;
    return /(^|[-_\s])(player|video|media|embed|lesson-player|video-card|jwplayer|brightcove|vjs|video-js|plyr|mux|playback|wistia|vimeo|dailymotion|kaltura|shaka|cld-video-player)([-_\s]|$)/i.test(text);
  }
  const PLAYER_CHROME_SELECTOR = [
    "button",
    '[role="button"]',
    '[role="slider"]',
    '[role="progressbar"]',
    '[aria-label*="play" i]',
    '[aria-label*="pause" i]',
    '[class*="control" i]',
    '[class*="controls" i]',
    '[class*="play" i]',
    '[class*="pause" i]',
    '[class*="progress" i]'
  ].join(",");
  const PLAYER_CHROME_CACHE_TTL_MS = 2e3;
  const playerChromeCache = /* @__PURE__ */ new WeakMap();
  function hasLikelyPlayerChrome(element) {
    const now = Date.now();
    const cached = playerChromeCache.get(element);
    if (cached && (cached.value || now - cached.at < PLAYER_CHROME_CACHE_TTL_MS)) return cached.value;
    const value = Boolean(element.querySelector(PLAYER_CHROME_SELECTOR));
    playerChromeCache.set(element, { value, at: now });
    return value;
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
  function youtubeVideoHasNativeCaptions() {
    if (getYouTubeCaptionTracks().length) return true;
    const button = document.querySelector("#movie_player .ytp-subtitles-button");
    if (!button) return false;
    return button.getAttribute("aria-disabled") !== "true" && button.style.display !== "none";
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
    if (playerVideoId && playerVideoId !== currentVideoId) {
      if (video.classList.contains("html5-main-video")) return true;
      return isLikelyVisibleYouTubeWatchVideo(video);
    }
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
      const key = youtubeCaptionTrackIdentity(parsed);
      const existing = tracks.get(key);
      if (!existing || shouldRefreshYouTubeTrackUrl(parsed.url, existing.url)) tracks.set(key, parsed);
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
    return { code, label: firstYouTubeCaptionTrackLabel(record, code) || code, raw: value };
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
        translationLanguage: language.raw
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
      const source = rawTracks.find((raw) => {
        const parsed = parseYouTubeCaptionTrack(raw);
        return parsed?.language && track.sourceLanguage && normalizedYouTubeLanguageCode(parsed.language) === normalizedYouTubeLanguageCode(track.sourceLanguage);
      }) ?? youtubePlayerTranslationSource(track);
      return source ? translatedYouTubePlayerTrack(track, source) : null;
    }
    return rawTracks.find((raw) => {
      const parsed = parseYouTubeCaptionTrack(raw);
      return parsed?.language && track.language && normalizedYouTubeLanguageCode(parsed.language) === normalizedYouTubeLanguageCode(track.language);
    }) ?? null;
  }
  function translatedYouTubePlayerTrack(track, source) {
    const translationLanguage = youtubePlayerTranslationLanguage(track);
    if (!translationLanguage) return source;
    if (!isRecord(source)) return track.youtubeTrack ?? source;
    return {
      ...source,
      translationLanguage
    };
  }
  function youtubePlayerTranslationLanguage(track) {
    const raw = track.youtubeTrack;
    if (isRecord(raw) && raw.translationLanguage) return raw.translationLanguage;
    const languageCode = track.targetLanguage || track.language;
    if (!languageCode) return null;
    return {
      languageCode,
      languageName: { simpleText: languageCode }
    };
  }
  function youtubePlayerTranslationSource(track) {
    const raw = track.youtubeTrack;
    if (!isRecord(raw)) return null;
    return raw.source ?? null;
  }
  function isRecord(value) {
    return Boolean(value && typeof value === "object");
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
    const state2 = createJsonObjectScanState();
    for (let index = objectStart; index < text.length; index++) {
      if (scanJsonObjectCharacter(state2, text[index])) return text.slice(objectStart, index + 1);
    }
    return null;
  }
  function createJsonObjectScanState() {
    return { depth: 0, inString: false, escaped: false };
  }
  function scanJsonObjectCharacter(state2, char) {
    if (state2.inString) {
      scanJsonStringCharacter(state2, char);
      return false;
    }
    if (char === '"') {
      state2.inString = true;
      return false;
    }
    if (char === "{") state2.depth += 1;
    if (char !== "}") return false;
    state2.depth -= 1;
    return state2.depth === 0;
  }
  function scanJsonStringCharacter(state2, char) {
    if (state2.escaped) {
      state2.escaped = false;
      return;
    }
    if (char === "\\") state2.escaped = true;
    if (char === '"') state2.inString = false;
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
  function readYouTubeConfigString$1(key) {
    const ytcfg = window.ytcfg;
    const value = ytcfg?.get?.(key) ?? ytcfg?.data_?.[key];
    if (typeof value === "string" && value) return value;
    return readYouTubeConfigStringFromScripts(key);
  }
  function readYouTubeConfigStringFromScripts(key) {
    const escapedKey = escapeRegExp$1(key);
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
  const TRANSLATION_BATCH_SIZE = 80;
  const TRANSLATION_BATCH_ENCODED_CHAR_BUDGET = 6e3;
  const TRANSLATION_TIMEOUT_MS = 8e3;
  const TRANSLATION_SEPARATOR = "\n";
  const log$1 = Logger.scope("SubtitleTranslate");
  async function translateSubtitleCues(cues, sourceLanguage, targetLanguage, options = {}) {
    if (!cues.length) return [];
    const texts = cues.map((cue) => cue.text.trim());
    const batches = batchTexts(
      texts,
      options.batchSize ?? TRANSLATION_BATCH_SIZE,
      options.encodedCharBudget ?? TRANSLATION_BATCH_ENCODED_CHAR_BUDGET
    );
    const translated = [];
    for (let index = 0; index < batches.length; index += 1) {
      if (index > 0) await waitForTranslationTurn();
      const batch = batches[index] ?? [];
      const results = await translateBatch(batch, sourceLanguage, targetLanguage);
      translated.push(...results);
    }
    return cues.map((cue, index) => ({
      ...cue,
      text: translated[index] || cue.text
    }));
  }
  function batchTexts(texts, size, encodedCharBudget) {
    const batches = [];
    let current = [];
    let currentEncodedLength = 0;
    for (const text of texts) {
      const separatorLength = current.length ? encodeURIComponent(TRANSLATION_SEPARATOR).length : 0;
      const encodedLength = encodeURIComponent(text).length;
      if (current.length && (current.length >= size || currentEncodedLength + separatorLength + encodedLength > encodedCharBudget)) {
        batches.push(current);
        current = [];
        currentEncodedLength = 0;
      }
      current.push(text);
      currentEncodedLength += (current.length > 1 ? encodeURIComponent(TRANSLATION_SEPARATOR).length : 0) + encodedLength;
    }
    if (current.length) batches.push(current);
    return batches;
  }
  async function translateBatch(texts, sourceLanguage, targetLanguage) {
    const joined = texts.join(TRANSLATION_SEPARATOR);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&dj=1&q=${encodeURIComponent(joined)}`;
    const done = log$1.time("Translate subtitle batch", { count: texts.length });
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
      log$1.info("Subtitle batch translated", { count: texts.length, resultCount: lines.length });
      return padTranslationResults(lines, texts);
    } catch (error) {
      log$1.warn("Subtitle batch translation failed", { count: texts.length, error });
      return texts;
    } finally {
      done();
    }
  }
  function waitForTranslationTurn() {
    return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  function padTranslationResults(translated, originals) {
    const result = translated.map((text) => text.trim());
    while (result.length < originals.length) result.push(originals[result.length]);
    return result;
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
    if (options.translationFallback === "skip") return { track, cues: [] };
    const sourceTrack = options.tracks.find((t) => t.id === track.translatedFromTrackId);
    if (!sourceTrack) return { track, cues: [] };
    const { cues: sourceCues } = await loadSubtitleTrackCues(sourceTrack, options);
    const translatedCues = await translateSubtitleCues(sourceCues, sourceTrack.language || "en", track.targetLanguage || track.language || "ja");
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
    const translatedSource = await loadYouTubeTranslationSourceFallback(track, options);
    if (translatedSource.length) {
      track.cues = translatedSource;
      return { track, cues: translatedSource };
    }
    const fallback = await loadFirstUsableYouTubeSibling(track, options.tracks, youtubeOptions);
    if (fallback) return fallback;
    track.cues = [];
    return { track, cues: [] };
  }
  async function loadYouTubeTranslationSourceFallback(track, options) {
    if (options.translationFallback === "skip") return [];
    if (track.sourceType !== "translation") return [];
    const sourceTrack = findYouTubeTranslationSourceTrack(track, options.tracks);
    const sourceLanguage = normalizedTrackLanguage(track.sourceLanguage);
    const targetLanguage = normalizedTrackLanguage(track.targetLanguage || track.language);
    if (!sourceTrack || !sourceLanguage || !targetLanguage || sourceLanguage === targetLanguage) return [];
    const { cues: sourceCues } = await loadSubtitleTrackCues(sourceTrack, options);
    if (!sourceCues.length) return [];
    return translateSubtitleCues(sourceCues, sourceTrack.language || sourceTrack.sourceLanguage || sourceLanguage, targetLanguage);
  }
  function findYouTubeTranslationSourceTrack(track, tracks) {
    const sourceLanguage = normalizedTrackLanguage(track.sourceLanguage);
    if (!sourceLanguage) return null;
    return tracks.find((candidate) => candidate.kind === "youtube" && candidate !== track && candidate.sourceType !== "translation" && Boolean(candidate.url) && normalizedTrackLanguage(candidate.language || candidate.sourceLanguage) === sourceLanguage) ?? null;
  }
  function normalizedTrackLanguage(language) {
    return (language ?? "").trim().toLowerCase();
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
  function renderSubtitleTrackPanel(state2) {
    const language = state2.language;
    return `
        <div class="jpdb-subtitle-drawer-head">
            <div class="jpdb-subtitle-drawer-brand">
                <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, "subtitlesTitle"))}</strong>
                <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
      mode: "tracks",
      count: state2.tracks.length,
      tracks: state2.tracks,
      selectedTrackId: state2.selectedTrackId,
      secondaryTrackId: state2.secondaryTrackId,
      language
    }))}</span>
            </div>
            <div class="jpdb-subtitle-drawer-actions">
                ${renderPanelModeControls("tracks", state2.hasTranscriptSurface, language)}
                ${state2.hasNavigableLines ? renderPanelNavigationControls(true, language) : ""}
                ${renderPanelPlacementControls(state2.placement, language)}
                ${renderPausePanelToggle(state2.pausePanelEnabled, language)}
            </div>
        </div>
        <div class="jpdb-subtitle-list-scroll">
            <div class="jpdb-subtitle-track-tools">
                <button type="button" data-action="load">${escapeHtml(uiText(language, "loadJapaneseSubtitles"))}</button>
                <button type="button" data-action="load-secondary">${escapeHtml(uiText(language, "loadNativeSubtitles"))}</button>
                <a href="${escapeHtml(jimakuAnimeSearchUrl(state2.animeSearchQuery))}" target="_blank" rel="noopener" data-jimaku-anime-search>${escapeHtml(uiText(language, "searchAnimeSubtitles"))}</a>
            </div>
            <div class="jpdb-subtitle-track-summary">${escapeHtml(trackPanelSummaryText(state2.autoDetected, language))}</div>
            <div class="jpdb-subtitle-track-hint">${escapeHtml(uiText(language, "subtitleTracksHint"))}</div>
            ${state2.tracks.length ? state2.tracks.map((track) => renderSubtitleTrackRow(track, state2)).join("") : ""}
        </div>
        <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeSubtitleTracksPanel"))}"></div>
    `;
  }
  function jimakuAnimeSearchUrl(query = "") {
    const trimmed = query.trim();
    if (!trimmed) return "https://jimaku.cc/";
    return `https://jimaku.cc/opensearch/redirect?anime=true&query=${encodeURIComponent(trimmed)}`;
  }
  function subtitleDrawerMetaText(options) {
    const primaryTrack = options.tracks.find((track) => track.id === options.selectedTrackId);
    const secondaryTrack = options.tracks.find((track) => track.id === options.secondaryTrackId);
    const primary = primaryTrack ? localizedSubtitleTrackLabel(primaryTrack, options.language) : void 0;
    const secondary = secondaryTrack ? localizedSubtitleTrackLabel(secondaryTrack, options.language) : void 0;
    return drawerMetaParts(options.mode, options.count, primary, secondary, options.language).filter(Boolean).join(" · ");
  }
  function renderSubtitleTrackRow(track, state2) {
    const isPrimary = track.id === state2.selectedTrackId;
    const isSecondary = track.id === state2.secondaryTrackId;
    const language = state2.language;
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
  const GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS = "jpdb-subtitle-native-captions-suppressed";
  function applySubtitleNativeTrackModes(state2) {
    const youtubePage = isYouTubePage();
    const hasYomuCaptionContent = Boolean(state2.hasPrimaryCues || state2.currentCueText);
    const yomuCaptionsActive = Boolean(state2.suppressNativeCaptions || state2.overlayVisible && (state2.selectedTrackId || hasYomuCaptionContent));
    if (!youtubePage) return applyGenericNativeTrackModes(state2, yomuCaptionsActive);
    document.documentElement.classList.remove(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS);
    return applyYouTubeNativeTrackModes(state2, yomuCaptionsActive);
  }
  function applyGenericNativeTrackModes(state2, yomuCaptionsActive) {
    for (const option of state2.tracks) {
      if (!option.track) continue;
      if (isSelectedSubtitleTrack(option, state2)) {
        if (yomuCaptionsActive) option.track.mode = "hidden";
        else ensureTextTrackReadable(option.track);
        continue;
      }
      if (yomuCaptionsActive) option.track.mode = "disabled";
    }
    if (yomuCaptionsActive) suppressGenericCaptionPlayerUi(state2.video);
    document.documentElement.classList.toggle(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS, yomuCaptionsActive);
    document.documentElement.classList.remove("jpdb-subtitle-yomu-captions-active");
    return false;
  }
  function applyYouTubeNativeTrackModes(state2, yomuCaptionsActive) {
    applyYouTubeTextTrackModes(state2);
    const hideYouTubeNativeCaptions = yomuCaptionsActive;
    document.documentElement.classList.toggle("jpdb-subtitle-yomu-captions-active", hideYouTubeNativeCaptions);
    return hideYouTubeNativeCaptions;
  }
  function applyYouTubeTextTrackModes(state2) {
    for (const option of state2.tracks) {
      if (option.track) option.track.mode = isSelectedSubtitleTrack(option, state2) ? "hidden" : "disabled";
    }
  }
  function isSelectedSubtitleTrack(option, state2) {
    return option.id === state2.selectedTrackId || option.id === state2.secondaryTrackId;
  }
  function suppressGenericCaptionPlayerUi(video) {
    for (const player of genericCaptionPlayersForVideo(video)) {
      try {
        player.toggleCaptions?.(false);
      } catch {
      }
    }
    suppressVidstackCaptionPlayers(video);
    suppressPressedCaptionButtons(video);
  }
  function genericCaptionPlayersForVideo(video) {
    const players = [];
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of genericCaptionPlayerCandidates()) {
      if (!isGenericCaptionPlayer(candidate)) continue;
      if (seen.has(candidate)) continue;
      if (video && candidate.media instanceof HTMLMediaElement && candidate.media !== video) continue;
      seen.add(candidate);
      players.push(candidate);
    }
    return players;
  }
  function genericCaptionPlayerCandidates() {
    const typedWindow = window;
    return [
      typedWindow.player,
      typedWindow.plyr,
      ...Array.isArray(typedWindow.players) ? typedWindow.players : []
    ];
  }
  function isGenericCaptionPlayer(value) {
    if (!value || typeof value !== "object") return false;
    const player = value;
    return typeof player.toggleCaptions === "function" && (player.media instanceof HTMLMediaElement || Boolean(player.captions) || typeof player.currentTrack === "number");
  }
  function suppressVidstackCaptionPlayers(video) {
    for (const player of vidstackCaptionPlayersForVideo(video)) {
      const tracks = player.textTracks;
      if (!tracks) continue;
      try {
        if (tracks.selected) tracks.selected.mode = "disabled";
        for (const track of Array.from(tracks)) {
          if (track.mode && track.mode !== "disabled") track.mode = "disabled";
        }
      } catch {
      }
    }
  }
  function vidstackCaptionPlayersForVideo(video) {
    const scope = genericCaptionButtonScope(video);
    const scopedPlayer = scope instanceof Element && isVidstackMediaPlayer(scope) ? [scope] : [];
    return [
      ...scopedPlayer,
      ...Array.from(scope.querySelectorAll("media-player, [data-media-player]")).filter(isVidstackMediaPlayer)
    ].filter((player, index, players) => players.indexOf(player) === index);
  }
  function isVidstackMediaPlayer(value) {
    return value instanceof HTMLElement && (value.localName === "media-player" || value.hasAttribute("data-media-player")) && Boolean(value.textTracks);
  }
  function suppressPressedCaptionButtons(video) {
    const scope = genericCaptionButtonScope(video);
    const buttons = Array.from(scope.querySelectorAll(
      [
        '[data-plyr="captions"][aria-pressed="true"]',
        '[data-plyr="captions"].plyr__control--pressed',
        'media-caption-button[aria-pressed="true"]',
        "media-caption-button[data-pressed]",
        '[data-media-tooltip="caption"][aria-pressed="true"]',
        '[data-media-tooltip="caption"][data-pressed]',
        '[aria-label*="caption" i][aria-pressed="true"]',
        '[title*="caption" i][aria-pressed="true"]'
      ].join(", ")
    ));
    for (const button of buttons) {
      try {
        button.click();
      } catch {
      }
    }
  }
  function genericCaptionButtonScope(video) {
    return video?.closest('media-player, [data-media-player], .plyr, [class*="player" i], [class*="video" i]') ?? document;
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
    const karaokeActive = input.karaokeMode && cueHasExactWordTimings(activeCue);
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
  const SUBTITLE_SECONDARY_BLURRED_CLASS = "jpdb-subtitle-secondary-blurred";
  const SUBTITLE_SECONDARY_CLEAR_CLASS = "jpdb-subtitle-secondary-clear";
  function syncSubtitleSecondaryBlurState(button, nativeBlurred, language = "en") {
    button.classList.toggle(SUBTITLE_SECONDARY_BLURRED_CLASS, nativeBlurred);
    button.classList.toggle(SUBTITLE_SECONDARY_CLEAR_CLASS, !nativeBlurred);
    const label = uiText(language, "toggleNativeSubtitleBlur");
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
  }
  function renderSubtitleSecondary(text, nativeBlurred, language = "en") {
    const blurClass = nativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
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
    return track.kind === "remote" && !track.translatedFromTrackId && !sourceKeys.has(track.sourceKey ?? "") && !hasCurrentPageSubtitleTrackUrl(track, sourceUrls);
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
  const PLAYER_CHROME_CONTAINER_SELECTOR = [
    "#player-control-overlay",
    ".ytp-chrome-bottom",
    ".ytp-chrome-controls",
    ".ytp-gradient-bottom",
    ".vjs-control-bar",
    ".video-js .vjs-control",
    ".plyr__controls",
    ".jw-controls",
    ".jw-controlbar",
    ".mejs__controls",
    '[class*="control-bar" i]',
    '[class*="controls" i]',
    "[data-jpdb-reader-surface-ignore]"
  ].join(",");
  const PLAYER_CHROME_INTERACTIVE_SELECTOR = [
    "button",
    '[role="button"]',
    "input",
    "select",
    "textarea",
    '[aria-label*="play" i]',
    '[aria-label*="pause" i]',
    '[aria-label*="mute" i]',
    '[aria-label*="fullscreen" i]',
    '[aria-label*="full screen" i]',
    '[aria-label*="settings" i]',
    '[title*="play" i]',
    '[title*="pause" i]',
    '[title*="mute" i]',
    '[title*="fullscreen" i]',
    '[title*="full screen" i]',
    '[title*="settings" i]'
  ].join(",");
  const PLAYER_CHROME_TEXT_PATTERNS = [
    /\bplay\b/iu,
    /\bpause\b/iu,
    /\bskip\b/iu,
    /\bmute\b/iu,
    /\bunmute\b/iu,
    /\bloop\b/iu,
    /\bsettings\b/iu,
    /\bairplay\b/iu,
    /\bexit fullscreen\b/iu,
    /\benter fullscreen\b/iu,
    /\bfull ?screen\b/iu,
    /\bpicture in picture\b/iu
  ];
  const READER_STATUS_TEXT_PATTERNS = [
    /\b(?:subtitle track|subtitle tracks).*\b(?:detected|not detected)\b/iu,
    /字幕トラック.*検出/iu
  ];
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
    return isCaptionNearVideo(rect, videoRect, nearVideoOnly);
  }
  function isCaptionElementExcluded(element, readerRoot) {
    return !element.isConnected || Boolean(readerRoot && (element === readerRoot || readerRoot.contains(element) || element.contains(readerRoot))) || Boolean(element.closest([
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
    if (isLikelyPlayerChromeText(text) || isLikelyReaderStatusText(text)) return false;
    if (containsReaderRootOrPlayerChrome(element)) return false;
    if (text.split("\n").length > 4) return false;
    return allowsChildText || !hasCaptionChildText(element, options);
  }
  function containsReaderRootOrPlayerChrome(element) {
    return Boolean(element.querySelector("[data-jpdb-reader-root]")) || Boolean(element.matches(PLAYER_CHROME_CONTAINER_SELECTOR) || element.closest(PLAYER_CHROME_CONTAINER_SELECTOR)) || Boolean(element.querySelector(PLAYER_CHROME_INTERACTIVE_SELECTOR));
  }
  function isLikelyPlayerChromeText(text) {
    const hits = PLAYER_CHROME_TEXT_PATTERNS.filter((pattern) => pattern.test(text)).length;
    return hits >= 3;
  }
  function isLikelyReaderStatusText(text) {
    return READER_STATUS_TEXT_PATTERNS.some((pattern) => pattern.test(text));
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
  function isCaptionNearVideo(rect, videoRect, strict = false) {
    const horizontalOverlap2 = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap2 / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = captionOverlapsVideo(rect, videoRect, overlapRatio);
    const belowVideo = captionSitsBelowVideo(rect, videoRect, overlapRatio);
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    if (tooLarge || !(overlapsVideo || belowVideo)) return false;
    return !strict || isCaptionOverlaidOnVideo(rect, videoRect) && isCaptionCenteredOnVideo(rect, videoRect);
  }
  function isCaptionOverlaidOnVideo(rect, videoRect) {
    return rect.top >= videoRect.top && rect.top <= videoRect.bottom + 90;
  }
  function isCaptionCenteredOnVideo(rect, videoRect) {
    const captionCenter = (rect.left + rect.right) / 2;
    const videoCenter = (videoRect.left + videoRect.right) / 2;
    return Math.abs(captionCenter - videoCenter) <= videoRect.width * 0.3;
  }
  function captionOverlapsVideo(rect, videoRect, overlapRatio) {
    return rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
  }
  function captionSitsBelowVideo(rect, videoRect, overlapRatio) {
    return rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
  }
  function isEditableTarget(target) {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    if (element.closest("input, textarea, select")) return true;
    const editable = element.closest("[contenteditable]");
    return Boolean(editable && editable.getAttribute("contenteditable")?.toLowerCase() !== "false");
  }
  function isApiMiningEnabled(settings) {
    return settings.jpdbMiningEnabled;
  }
  const SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS = 1200;
  const SUBTITLE_EMPTY_PARSE_RETRY_MS = 2500;
  function canParseSubtitleTranscriptRows(settings) {
    return hasSubtitleParserSource();
  }
  function shouldApplyParsedTranscriptHtml(target, key, provisional = false) {
    if (target.dataset.parseKey !== key) return false;
    if (target.dataset.parsedKey !== key) return true;
    return !provisional && target.dataset.parsedProvisional === "true";
  }
  function hasAttemptedTranscriptParse(target, key) {
    return target.dataset.parsedKey === key || hasRecentTranscriptParseAttempt(target.dataset.parseEmptyKey, target.dataset.parseEmptyAt, key) || hasRecentTranscriptParseAttempt(target.dataset.parseFailedKey, target.dataset.parseFailedAt, key);
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
      includeLocalPitch: true
    };
  }
  function provisionalSubtitleParseOptions() {
    return {
      skipJpdb: true,
      allowSegmentedFallback: true,
      includeLocalPitch: true
    };
  }
  function authoritativeSubtitleParseOptions() {
    return {
      requireJpdb: true,
      includeLocalPitch: true
    };
  }
  function hasSubtitleParserSource(_settings) {
    return true;
  }
  function hasRecentTranscriptParseAttempt(markerKey, markerAt, key) {
    if (markerKey !== key) return false;
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
  function planProvisionalSubtitleParseBatch(items, parsedHtml, provisionalParsedHtml, pendingParsedHtml, freshEmptyHtml = () => void 0) {
    const ready = [];
    const batch = [];
    for (const item of items) {
      const cached = parsedHtml(item.key);
      if (cached !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: cached }));
        continue;
      }
      const provisional = provisionalParsedHtml(item.key);
      if (provisional !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: provisional, provisional: true }));
        continue;
      }
      const empty = freshEmptyHtml(item.key);
      if (empty !== void 0) {
        ready.push(Promise.resolve({ key: item.key, html: empty }));
        continue;
      }
      const pending = pendingParsedHtml(item.key);
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
  const TRANSCRIPT_PANEL_MIN_SIDE_WIDTH = 300;
  const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_WIDTH = 400;
  const TRANSCRIPT_PANEL_MIN_SIDE_PLAYER_RATIO = 0.52;
  const TRANSCRIPT_PANEL_KEYBOARD_STEP_PX = 48;
  function transcriptResizeBounds(viewportWidth, viewportHeight) {
    return {
      maxBottomHeight: maxTranscriptBottomPanelHeight(viewportHeight, TRANSCRIPT_PANEL_MARGIN),
      maxSideWidth: Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, viewportWidth - TRANSCRIPT_PANEL_MARGIN * 3)
    };
  }
  function transcriptResizeKeyboardDirection(placement, key) {
    if (key === transcriptResizeIncreaseKey(placement)) return 1;
    if (key === transcriptResizeDecreaseKey(placement)) return -1;
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
  const SUBTITLE_SESSION_PARSE_CACHE_PREFIX = "yomu:subtitle-parse:v3:";
  const SUBTITLE_SESSION_PARSE_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
  function subtitleSessionParseHash(key) {
    let h1 = 2166136261;
    let h2 = 5381;
    for (let i = 0; i < key.length; i += 1) {
      const code = key.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) ^ code) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
  }
  const YOUTUBE_SUBTITLE_NAVIGATION_EVENTS = [
    "yt-navigate-finish",
    "yt-page-data-updated",
    "yt-page-type-changed",
    "popstate",
    "hashchange"
  ];
  const SUBTITLE_FULLSCREEN_CHANGE_EVENTS = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange"
  ];
  const ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR = ".asbplayer-subtitles-container-bottom";
  const ASBPLAYER_SUBTITLE_ROOT_SELECTOR = `.asbplayer-offscreen, ${ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR}`;
  const ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR = '[data-yomu-asb-subtitle-drag-handle="true"]';
  const ASBPLAYER_SUBTITLE_DRAG_CLASSES = [
    "jpdb-subtitle-asb-movable",
    "jpdb-subtitle-has-lines",
    "jpdb-subtitle-controls-auto",
    "jpdb-subtitle-controls-always",
    "jpdb-subtitle-controls-hidden",
    "jpdb-subtitle-controls-idle",
    "jpdb-subtitle-dragging"
  ];
  function isYouTubeTheaterMode() {
    return isYouTubePage() && Boolean(document.querySelector("ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]"));
  }
  function currentFullscreenElement() {
    const fullscreenDocument = document;
    return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? fullscreenDocument.mozFullScreenElement ?? fullscreenDocument.msFullscreenElement ?? null;
  }
  function subtitleViewportRect() {
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }
  function videoIsInNativeFullscreen(video) {
    if (!video) return false;
    const fullscreenVideo = video;
    return Boolean(fullscreenVideo.webkitDisplayingFullscreen || fullscreenVideo.webkitPresentationMode && fullscreenVideo.webkitPresentationMode !== "inline");
  }
  function elementContainsVideo(element, video) {
    return Boolean(element && video && (element === video || element.contains(video)));
  }
  function youtubeFullscreenHostForVideo(video) {
    if (!isYouTubePage()) return null;
    const scopedHost = [
      video?.closest(".html5-video-player.ytp-fullscreen"),
      video?.closest("#movie_player.ytp-fullscreen"),
      video?.closest("ytd-watch-flexy[fullscreen] #movie_player"),
      video?.closest("ytd-watch-flexy[fullscreen] ytd-player"),
      video?.closest("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
    ].find((element) => Boolean(element));
    if (scopedHost) return scopedHost;
    return [
      document.querySelector(".html5-video-player.ytp-fullscreen"),
      document.querySelector("#movie_player.ytp-fullscreen"),
      document.querySelector("ytd-watch-flexy[fullscreen] #movie_player"),
      document.querySelector("ytd-watch-flexy[fullscreen] ytd-player"),
      document.querySelector("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
    ].find((element) => elementContainsVideo(element, video) || isYouTubeMobileFullscreenHost(element)) ?? null;
  }
  function isYouTubeMobileFullscreenHost(element) {
    return Boolean(element && /^m\.youtube\.com$/i.test(location.hostname) && element.matches("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen"));
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
  function videoRectKey(rect) {
    return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
  }
  function subtitleAnimeSearchQuery(video) {
    const raw = video?.dataset.yomuAnimeSearch || video?.dataset.yomuVideoTitle || video?.title || document.title || "";
    return raw.replace(/\.(?:mkv|mp4|m4v|mov|webm|ogv)$/iu, "").replace(/[-|]\s*(?:YouTube|Yomu Video|よむ 動画)\s*$/iu, "").replace(/\[[^\]]*\]/gu, " ").replace(/[._]+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120);
  }
  function clearWindowTimeout(id) {
    if (id !== void 0) window.clearTimeout(id);
    return void 0;
  }
  function clearWindowAnimationFrame(id) {
    if (id !== void 0) window.cancelAnimationFrame(id);
    return void 0;
  }
  function frameHasPlayerControls(frame) {
    return Boolean(frame.querySelector([
      "button",
      '[role="button"]',
      '[aria-label*="play" i]',
      '[aria-label*="pause" i]',
      '[class*="control" i]',
      '[class*="controls" i]',
      '[class*="play" i]',
      '[class*="pause" i]'
    ].join(",")));
  }
  const SUBTITLE_ACTIVE_PREPARSE_BEHIND = 6;
  const SUBTITLE_ACTIVE_PREPARSE_AHEAD = 10;
  const SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS = 2500;
  const TRANSCRIPT_ACTIVE_HYDRATION_BEHIND = 1;
  const TRANSCRIPT_ACTIVE_HYDRATION_AHEAD = 3;
  const TRANSCRIPT_HYDRATION_MAX_ROWS = 12;
  const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 4;
  const TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY = 2;
  const TRANSCRIPT_BACKGROUND_PARSE_BATCH = 8;
  const TRANSCRIPT_BACKGROUND_PARSE_AHEAD = 32;
  const TRANSCRIPT_BACKGROUND_PARSE_BEHIND = 6;
  const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT = 96;
  const SUBTITLE_PARSE_CACHE_MIN_ENTRIES = 180;
  const SUBTITLE_PARSE_CACHE_MAX_ENTRIES = 5e3;
  const SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM = 64;
  const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = SUBTITLE_PARSE_CACHE_MAX_ENTRIES;
  const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
  const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
  const SUBTITLE_FURIGANA_KANJI_RE = /[㐀-鿿]/u;
  const SUBTITLE_FURIGANA_KANA_RE = /^[぀-ヿー・]+$/u;
  const SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT = 6;
  const TRANSCRIPT_WARMUP_PRIORITY_ROWS = 48;
  const TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD = 240;
  const TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX = 80;
  const TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS = 8;
  const TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS = 48;
  const SUBTITLE_TICK_ACTIVE_MS = 250;
  const SUBTITLE_TICK_PAUSED_MS = 600;
  const SUBTITLE_TICK_IDLE_MS = 1500;
  const TRANSCRIPT_DEFERRED_RENDER_DELAY_MS = 500;
  const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 1e3;
  const TRANSCRIPT_PROGRAMMATIC_SCROLL_WINDOW_MS = 350;
  const YOUTUBE_CAPTION_ACTIVATION_RETRY_MS = 2e3;
  const DOM_CAPTION_STABLE_DELAY_MS = 180;
  const YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY = "youtube-dom-caption-fallback";
  const SUBTITLE_FILE_ACCEPT = ".srt,.vtt,.ass,.ssa,text/vtt";
  const log = Logger.scope("Subtitles");
  const TRACK_LOAD_OPTIONS = {
    requestText: requestSubtitleText,
    onYouTubeRequestError: (track, url, error) => log.debug("YouTube subtitle request failed", {
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
      ...backwardIndexes(focusIndex - 1, Math.max(0, focusIndex - TRANSCRIPT_BACKGROUND_PARSE_BEHIND)),
      // Then warm the whole transcript (lowest priority) so ruby is ready ahead
      // of playback instead of appearing line-by-line as cues become active.
      ...forwardIndexes(0, rowCount)
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
    return Boolean(!next && current && (time > current.end + 0.12 || time < current.start - 0.12));
  }
  function subtitleClipboardText(primary, secondary, includeTranslation) {
    return [primary?.text.trim(), includeTranslation ? secondary?.text.trim() : ""].filter(Boolean).join("\n");
  }
  function flashSubtitleCopyFeedback(target) {
    const button = target.closest("button") ?? target;
    button.classList.add("jpdb-subtitle-copy-flash");
    window.setTimeout(() => button.classList.remove("jpdb-subtitle-copy-flash"), 1200);
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
    lastPlayerChromeHidden = false;
    discoverTimer;
    tickTimer;
    alignFrame;
    alignAfterTranscriptResize = false;
    lastAlignedVideoRectKey = "";
    lastShortsNavVideoId = "";
    destroyed = false;
    selectedTrackId = "";
    secondaryTrackId = "";
    youtubeVideoId = "";
    youtubeAutoSelectSuppressedVideoId = "";
    lastDomCaption = "";
    pendingDomCaption;
    parsedHtmlCache = /* @__PURE__ */ new Map();
    provisionalParsedHtmlCache = /* @__PURE__ */ new Map();
    enrichedProvisionalParsedHtmlKeys = /* @__PURE__ */ new Set();
    incompleteEnrichmentAttempts = /* @__PURE__ */ new Map();
    sessionParseCacheChecked = /* @__PURE__ */ new Set();
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
    transcriptDeferredRenderFrame;
    transcriptDeferredRenderTimer;
    transcriptVirtualRenderFrame;
    transcriptVirtualScrollTop = 0;
    // Manual-scroll override for transcript auto-follow: a user scroll pauses
    // the snap-to-active so advancing to the next cue does not yank the list
    // back; programmatic scrollIntoView calls are ignored for a short window so
    // they are not mistaken for user scrolls.
    transcriptUserScrollAt = 0;
    transcriptProgrammaticScrollUntil = 0;
    transcriptInsetRealignFrame;
    transcriptViewportStabilizeTimer;
    transcriptPreviewPlayerResizeDeferred = false;
    transcriptResizeBackgroundResumeTimer;
    transcriptHydrationAfterResizeIndex;
    transcriptWarmupAfterResize = false;
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
    lastAppliedSubtitleHtml = "";
    parseWarmupSerial = 0;
    lastParseWarmupAnchor = -1;
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
    pausePanelSyncScheduled = false;
    subtitleDragOffsetYPx = 0;
    subtitleDragActive = false;
    transcriptResizeActive = false;
    asbMoveHandlesActive = false;
    asbSubtitleDragHandles = /* @__PURE__ */ new WeakSet();
    asbSubtitleBaseTransforms = /* @__PURE__ */ new WeakMap();
    clickHandlers = {
      cue: (target) => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
      previous: () => this.seekSubtitle(-1),
      next: () => this.seekSubtitle(1),
      copy: (target) => {
        void this.copySubtitle().then(() => flashSubtitleCopyFeedback(target));
      },
      "copy-row": (target) => {
        void this.copyTranscriptRow(this.rowIndexFromTarget(target)).then(() => flashSubtitleCopyFeedback(target));
      },
      "peek-row": (target) => this.toggleRowTranslationPeek(target),
      load: () => this.openSubtitleFilePicker("primary"),
      "load-secondary": () => this.openSubtitleFilePicker("secondary"),
      panel: () => this.toggleTranscriptDrawer(),
      "panel-lines": () => this.openLinesPanel({ deferRender: true }),
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
      "toggle-native-blur": (target) => this.toggleNativeSubtitleBlur(target.closest(".jpdb-subtitle-secondary"))
    };
    init() {
      this.destroy();
      this.destroyed = false;
      this.abortController = new AbortController();
      this.install();
      this.observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => this.mutationCouldAffectFullscreenState(mutation))) {
          this.syncFullscreenState();
          this.scheduleAlignToVideo();
        }
        if (mutations.every(mutationInsideReaderRoot$1)) return;
        if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
        this.scheduleDiscoverVideo();
      });
      this.observer.observe(document.body, {
        attributeFilter: ["class", "fullscreen"],
        attributes: true,
        childList: true,
        subtree: true
      });
      document.addEventListener("keydown", (event) => this.handleKeydown(event), this.eventOptions());
      document.addEventListener("pointerdown", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
      document.addEventListener("visibilitychange", () => this.restartTickAfterVisibilityChange(), this.eventOptions());
      document.addEventListener("pointermove", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
      window.addEventListener(OPEN_SUBTITLE_TRACKS_EVENT, () => this.openSubtitleTracksPanelFromHost(), this.eventOptions());
      for (const eventName of YOUTUBE_SUBTITLE_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, () => this.handleYouTubeNavigation(), this.eventOptions());
      }
      for (const eventName of SUBTITLE_FULLSCREEN_CHANGE_EVENTS) {
        document.addEventListener(eventName, () => {
          this.fullscreen = Boolean(currentFullscreenElement());
          this.syncFullscreenState();
          this.scheduleAlignToVideo();
          this.render();
        }, this.eventOptions());
      }
      window.addEventListener("scroll", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      window.addEventListener("resize", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.addEventListener("orientationchange", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.visualViewport?.addEventListener("resize", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.visualViewport?.addEventListener("scroll", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      this.discoverVideo();
      this.tick();
      log.info("Subtitle controller initialized");
    }
    mutationCouldAffectFullscreenState(mutation) {
      if (mutation.type !== "attributes") return false;
      const target = mutation.target;
      if (!(target instanceof HTMLElement)) return false;
      return target.matches("ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player") || Boolean(target.closest("ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player"));
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
      this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
      this.clearDeferredTranscriptPanelRender();
      this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
      this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
      this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
      this.clearTranscriptPanelAnimation();
      this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
      this.pendingPointerActivity = void 0;
      this.clearVideoInsetForTranscriptPanel();
      this.removeAsbPlayerSubtitleMoveHandles();
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
      this.syncAsbPlayerSubtitleMoveHandles(settings);
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
      if (!this.video) {
        this.root.classList.remove("jpdb-subtitle-has-video-frame", "jpdb-subtitle-compact-video");
        this.root.classList.add("jpdb-subtitle-video-out-of-view");
      }
      this.transcriptPanel?.classList.toggle("jpdb-subtitle-controls-hidden", settings.subtitleControlsMode === "hidden");
    }
    syncRootStyleSettings(settings) {
      if (!this.root) return;
      setStylePropertyIfChanged(this.root, "--subtitle-font-size-target", `${settings.subtitleFontSize}px`);
      setStylePropertyIfChanged(this.root, "--subtitle-font-size", `${settings.subtitleFontSize}px`);
      this.root.style.setProperty("--subtitle-bottom", `${settings.subtitleBottomOffset}%`);
      this.syncSubtitleDragOffsetStyle();
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
      const moveLabel = uiText(settings.interfaceLanguage, "moveSubtitles");
      setInnerHtml(root, `
            <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines" aria-live="polite"></div><button class="jpdb-subtitle-drag-handle" type="button" data-subtitle-drag-handle data-jpdb-reader-surface-ignore="true" title="${escapeHtml(moveLabel)}" aria-label="${escapeHtml(moveLabel)}"><span aria-hidden="true"></span></button></div>
            <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore="true"></div>
            <div class="jpdb-subtitle-rail" data-jpdb-reader-surface-ignore="true">
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel" title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon("panel-right")}</button>
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
        `);
      root.addEventListener("click", (event) => this.handleClick(event));
      this.subtitleEl = root.querySelector(".jpdb-subtitle-lines");
      this.transcriptPanel = root.querySelector(".jpdb-subtitle-list");
      this.transcriptPanel.dataset.jpdbReaderRoot = "true";
      this.transcriptPanel.addEventListener("click", (event) => this.handleClick(event), this.eventOptions());
      this.transcriptPanel.addEventListener("keydown", (event) => this.handleTranscriptPanelKeydown(event), this.eventOptions());
      document.body.appendChild(root);
      document.body.appendChild(this.transcriptPanel);
      this.root = root;
      this.bindSubtitleDragHandle();
      this.refresh();
      this.scheduleControlsIdle();
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
    // Our rail belongs next to a real player: if the video offers playback
    // controls (native attribute or a known player chrome) or we actually
    // have subtitle data for it, show ours too. Decorative/ad videos (e.g.
    // Discord promos) have neither, so the rail stays away.
    videoHasPlayerAffordances() {
      if (!this.video) return false;
      if (this.video.controls || isYouTubePage()) return true;
      if (this.video.closest("#movie_player, .html5-video-player, [data-yomu-video-frame]")) return true;
      const fullscreenElement = currentFullscreenElement();
      if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement) && frameHasPlayerControls(fullscreenElement)) return true;
      const frame = subtitleVideoLayoutTarget(this.video);
      if (frame && frame !== this.video && frameHasPlayerControls(frame)) return true;
      return Boolean(this.tracks.length || this.cues.length || this.currentCue?.text);
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
      log.info("Subtitle video detected", videoSummary(candidate));
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
      const key = subtitleSourceContextKey(video);
      if (!key) return false;
      if (!this.subtitleSourceContextKey) {
        this.subtitleSourceContextKey = key;
        return false;
      }
      if (this.subtitleSourceContextKey === key) return false;
      this.subtitleSourceContextKey = key;
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
      this.lastAppliedSubtitleHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
      this.lastParseWarmupAnchor = -1;
      this.resetSubtitleDragOffset();
    }
    removeStaleNativeTracks(video) {
      const textTracks = new Set(Array.from(video.textTracks));
      this.removeSubtitleTracks((track) => track.kind === "native" && !track.translatedFromTrackId && (!track.track || !textTracks.has(track.track)));
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
      const removed = new Set(removedIds);
      for (const track of this.tracks) {
        if (track.translatedFromTrackId && removed.has(track.translatedFromTrackId)) removed.add(track.id);
      }
      this.tracks = this.tracks.filter((track) => !removed.has(track.id));
      if (removed.has(this.selectedTrackId)) this.resetPrimarySubtitleState();
      if (removed.has(this.secondaryTrackId)) this.resetSecondarySubtitleState();
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
      video.addEventListener("loadstart", () => {
        this.lastYouTubeTrackDiscoveryAt = 0;
        void this.discoverYouTubeTracksThrottled(true);
      }, this.eventOptions({ passive: true }));
      video.addEventListener("loadedmetadata", () => {
        this.lastYouTubeTrackDiscoveryAt = 0;
        void this.discoverYouTubeTracksThrottled(true);
        this.scheduleAlignToVideo();
      }, this.eventOptions({ passive: true }));
      video.addEventListener("loadeddata", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      video.addEventListener("pause", () => this.syncPauseTranscriptPanel({ deferRender: true }), this.eventOptions({ passive: true }));
      const handlePlaybackStarted = () => {
        this.pausePanelDismissed = false;
        if (this.pausePanelOpen) this.schedulePauseTranscriptPanelSync();
        this.scheduleAlignToVideo();
      };
      video.addEventListener("play", handlePlaybackStarted, this.eventOptions({ passive: true }));
      video.addEventListener("playing", handlePlaybackStarted, this.eventOptions({ passive: true }));
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
      if (this.ensureTranslatedJapaneseTrack()) this.maybeAutoSelectTranslatedJapaneseTrack();
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
      if (generated) this.maybeAutoSelectTranslatedJapaneseTrack();
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
      return isJapaneseSubtitleTrack(option) && (!this.selectedTrackId || this.isSyntheticTranslatedSelection() || shouldReplaceWaitingNativeTrack(selected, option, this.cues));
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
      if (isJapaneseSubtitleTrack(option) && (!this.selectedTrackId || this.isSyntheticTranslatedSelection())) return "primary";
      if (!this.secondaryTrackId && isEnglishSubtitleTrack(option)) return "secondary";
      return null;
    }
    isSyntheticTranslatedSelection() {
      if (!this.selectedTrackId) return false;
      const selected = this.tracks.find((track) => track.id === this.selectedTrackId);
      return Boolean(selected?.translatedFromTrackId);
    }
    maybeAutoSelectTranslatedJapaneseTrack() {
      if (this.selectedTrackId) return;
      const synthetic = this.tracks.find((track) => track.translatedFromTrackId && isJapaneseSubtitleTrack(track));
      if (synthetic) void this.selectTrack(synthetic.id);
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
      if (settings.subtitlePlayerEnabled && !document.hidden) this.tickSubtitlePlayer(settings);
      this.tickTimer = window.setTimeout(() => {
        this.tickTimer = void 0;
        this.tick();
      }, this.tickDelayMs(settings));
    }
    // The 250ms cadence is only needed while a video is actually playing;
    // hidden tabs and videoless pages ticking that fast just drains battery.
    tickDelayMs(settings) {
      if (document.hidden || !settings.subtitlePlayerEnabled || !this.video) return SUBTITLE_TICK_IDLE_MS;
      if (this.video.paused) return SUBTITLE_TICK_PAUSED_MS;
      return SUBTITLE_TICK_ACTIVE_MS;
    }
    restartTickAfterVisibilityChange() {
      if (this.destroyed || document.hidden || this.tickTimer === void 0) return;
      window.clearTimeout(this.tickTimer);
      this.tickTimer = void 0;
      this.tick();
    }
    tickSubtitlePlayer(settings) {
      this.refreshSubtitleSourcesForTick();
      this.refreshNativeCueLists();
      this.setNativeTrackModes();
      this.syncShortsReelNavigation();
      this.updateFromLoadedCues();
      this.realignIfVideoMoved();
      this.syncPlayerChromeIdleState();
      this.syncAsbPlayerSubtitleMoveHandles(settings);
      if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
      if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }
    // The rail follows the player's own chrome: on phones there is no hover,
    // so the player's fade state is the only "controls are visible" signal
    // the viewer has — the rail must appear and disappear in lockstep.
    syncPlayerChromeIdleState() {
      if (!this.root || !this.hasAutoIdleMode(this.options.getSettings())) return;
      const chromeHidden = this.videoPlayerChromeHidden();
      if (chromeHidden) {
        this.blurFocusedRailControl();
        if (this.shouldAutoIdleControls()) this.hideControlsImmediately();
      } else if (this.lastPlayerChromeHidden && this.isVideoPlayerChromeSurface()) {
        this.showControlsTemporarily();
      }
      this.lastPlayerChromeHidden = chromeHidden;
    }
    blurFocusedRailControl() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.root?.contains(active) && active.closest(".jpdb-subtitle-rail")) {
        active.blur();
      }
    }
    isVideoPlayerChromeSurface() {
      return Boolean(document.querySelector("#player-control-overlay") || this.video?.closest("#movie_player, .html5-video-player"));
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
      if (!this.root) return;
      if (!this.video) {
        this.root.classList.remove("jpdb-subtitle-has-video-frame", "jpdb-subtitle-compact-video");
        this.root.classList.add("jpdb-subtitle-video-out-of-view");
        this.lastAlignedVideoRectKey = "";
        this.positionTranscriptPanel();
        return;
      }
      const rect = this.videoLayoutRect();
      this.lastAlignedVideoRectKey = videoRectKey(rect);
      this.applyVideoLayout(rect);
    }
    // Reel-to-reel Shorts swipes (and other in-page layout shifts) move the
    // active <video> WITHOUT a resize, window scroll, or yt-navigate-finish, so
    // none of the alignment triggers fire and the overlay stays stuck
    // out-of-view until a play/pause re-aligns it. The tick already runs while
    // playing; cheaply re-align whenever the video's on-screen box has moved.
    realignIfVideoMoved() {
      if (!this.video || !this.root) return;
      const rect = this.videoLayoutRect();
      const shouldShow = this.isVideoOverlayVisible(rect);
      const isShowing = !this.root.classList.contains("jpdb-subtitle-video-out-of-view");
      if (shouldShow !== isShowing || videoRectKey(rect) !== this.lastAlignedVideoRectKey) this.scheduleAlignToVideo();
    }
    // Swiping between Shorts reels reuses the same <video> element at the same
    // position and emits no yt-navigate-finish, so the controller never treats
    // it as navigation: tracks/overlay stay bound to the previous reel and the
    // overlay can latch out-of-view until an unrelated DOM mutation (a manual
    // pause/resume) happens to re-trigger discovery. Poll the active /shorts/ id
    // from the tick and run the normal navigation path when it changes.
    syncShortsReelNavigation() {
      const pathname = typeof globalThis.location?.pathname === "string" ? globalThis.location.pathname : "";
      if (!pathname.startsWith("/shorts/")) {
        this.lastShortsNavVideoId = "";
        return;
      }
      const videoId = getYouTubeVideoId();
      if (!videoId || videoId === this.lastShortsNavVideoId) return;
      const firstSync = this.lastShortsNavVideoId === "";
      this.lastShortsNavVideoId = videoId;
      if (!firstSync) this.handleYouTubeNavigation();
    }
    isVideoOverlayVisible(rect) {
      return isSubtitleOverlayVideoVisible(rect) && (!this.video || isSubtitleVideoElementRenderable(this.video)) && this.videoHasPlayerAffordances();
    }
    applyVideoLayout(rect) {
      if (!this.root) return;
      const videoVisible = this.isVideoOverlayVisible(rect);
      this.root.classList.toggle("jpdb-subtitle-video-out-of-view", !videoVisible);
      this.root.classList.toggle("jpdb-subtitle-has-video-frame", videoVisible);
      if (!videoVisible) {
        this.root.classList.remove("jpdb-subtitle-compact-video");
        this.clearVideoInsetForTranscriptPanel();
        this.positionTranscriptPanel();
        return;
      }
      const layout = subtitleOverlayLayout(rect);
      this.root.classList.toggle("jpdb-subtitle-compact-video", layout.width < 560 || layout.height < 260);
      if (rect.width < 120 || rect.height < 80) {
        applyElementLayout(this.root, {
          left: 0,
          top: 0,
          width: this.transcriptViewportWidth(),
          height: this.transcriptViewportHeight()
        });
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
      const secondary = this.secondaryTrackId ? findActiveSubtitleCue(this.secondaryCues, time) ?? findInitialLeadInCue(this.secondaryCues, time) : void 0;
      const cue = this.selectedTrackId ? this.findRenderablePrimaryCue(time, secondary) : void 0;
      if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
      else this.warmParseOnGapAnchorJump();
    }
    // Auto-generated YouTube captions and their `&tlang=` translations are
    // segmented independently, so the primary (JP) cue often begins a beat
    // after — or falls into a gap relative to — the native (EN) line that's
    // already active. That left no primary cue at the playhead while a native
    // cue was active, showing the native line alone (user-reported). When the
    // direct lookup misses but a native cue is active, surface the primary
    // aligned to it so the pair appears together. Mirrors
    // primaryHeldByActiveSecondary for the not-yet-shown direction.
    findRenderablePrimaryCue(time, activeSecondary) {
      const direct = findActiveSubtitleCue(this.cues, time) ?? findInitialLeadInCue(this.cues, time);
      if (direct || !activeSecondary || !this.cues.length) return direct;
      return findAlignedCue(this.cues, activeSecondary);
    }
    // A repeated seek that lands in another inter-cue gap changes no cue
    // state, so afterLoadedCueStateChanged never fires; re-anchor the parse
    // warmup whenever the playhead's upcoming cue moved anyway.
    warmParseOnGapAnchorJump() {
      if (this.currentCue || !this.selectedTrackId || !this.cues.length) return;
      if (this.parseWarmupAnchorIndex() === this.lastParseWarmupAnchor) return;
      this.warmParseAroundActiveCue();
    }
    updateLoadedCueState(cue, secondary, time) {
      const primaryChanged = this.updateLoadedPrimaryCue(cue, time);
      const secondaryChanged = this.updateLoadedSecondaryCue(secondary);
      return primaryChanged || secondaryChanged;
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
      if (shouldClearLoadedCue(cue, this.currentCue, time) && !this.primaryHeldByActiveSecondary(time)) {
        return this.clearLoadedPrimaryCue();
      }
      return false;
    }
    // Auto-generated YouTube captions and their `&tlang=` translations are
    // normalized independently (text-overlap rolling-cue merge), so the
    // primary line's cue often ends a beat before its translation's does.
    // Clearing the primary on its own boundary left the translation showing
    // alone (user-reported). Hold the primary while the still-active secondary
    // cue is the one aligned to it, so the pair appears and clears as a unit.
    primaryHeldByActiveSecondary(time) {
      if (!this.secondaryTrackId || !this.currentCue || !this.secondaryCues.length) return false;
      const activeSecondary = findActiveSubtitleCue(this.secondaryCues, time);
      return Boolean(activeSecondary && findAlignedCue(this.secondaryCues, this.currentCue) === activeSecondary);
    }
    replaceLoadedPrimaryCue(cue) {
      this.currentCue = cue;
      return true;
    }
    clearLoadedPrimaryCue() {
      this.currentCue = void 0;
      this.lastDomCaption = "";
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
      this.keepDomCaptionCueAlive(text);
      if (!this.isDomCaptionStable(text, performance.now())) return null;
      return { text, selected };
    }
    // The synthetic DOM-caption cue gets a 4s guess for its duration; lines
    // the page keeps showing longer used to expire mid-display and could
    // never re-apply (same text). Renew the cue while the page still shows it.
    keepDomCaptionCueAlive(text) {
      if (this.cues.length || !this.currentCue) return;
      if (text !== this.lastDomCaption) return;
      const now = this.video?.currentTime ?? 0;
      if (now >= this.currentCue.start && this.currentCue.end < now + 1) this.currentCue.end = now + 4;
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
      if (!youtubeVideoHasNativeCaptions()) return selected;
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
      return Boolean(selected?.kind === "youtube" && selected.sourceKey !== YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY && !isJapaneseSubtitleTrack(selected));
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
        this.warmDomCaptionParse(text);
        return false;
      }
      return nowMs2 - this.pendingDomCaption.firstSeenAt >= DOM_CAPTION_STABLE_DELAY_MS && text !== this.lastDomCaption;
    }
    warmDomCaptionParse(text) {
      if (!text.trim() || !this.shouldParseSubtitles()) return;
      const texts = this.domCaptionCueTexts(text);
      if (!texts.length) return;
      void this.parseCueHtmlBatch(texts, this.options.getSettings(), { enrichBeforeRender: true }).catch(() => void 0);
    }
    domCaptionCueTexts(text) {
      return normalizeSubtitleCues([{ start: 0, end: 4, text }]).map((cue) => cue.text.trim()).filter(Boolean);
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
      this.applySubtitleHtml(this.renderSecondarySubtitle(settings));
    }
    renderActiveSubtitle(text, settings) {
      if (!this.subtitleEl) return;
      const primary = this.renderPrimarySubtitle(text, settings);
      const changed = this.applySubtitleHtml(`<div class="jpdb-subtitle-primary">${primary.html}</div>${this.renderSecondarySubtitle(settings)}`);
      this.applyRenderedPrimarySubtitle(primary, text);
      if (changed) this.notifyParsedTokensForRenderedPrimary(text, settings, primary.html);
    }
    // render() runs on every cue/time/settings tick; rebuilding identical DOM
    // each tick wiped the async-applied word-state coloring and caused a
    // visible rerender flicker plus constant layout work (user-reported).
    applySubtitleHtml(html) {
      if (!this.subtitleEl) return false;
      const hasContent = this.subtitleEl.firstChild !== null;
      const unchanged = this.lastAppliedSubtitleHtml === html && (html === "" ? !hasContent : hasContent);
      if (unchanged) return false;
      setInnerHtml(this.subtitleEl, html);
      this.lastAppliedSubtitleHtml = html;
      return true;
    }
    // A cache-hit render (e.g. stepping back to a previous line) inserts fresh
    // DOM, so JPDB/Anki state colors must be re-applied to the new nodes even
    // though the parse itself was cached.
    notifyParsedTokensForRenderedPrimary(text, settings, html) {
      if (!parsedSubtitleHtmlHasReaderWords(html)) return;
      const primary = this.subtitleEl?.querySelector(".jpdb-subtitle-primary");
      if (!primary) return;
      this.notifyParsedTokensForKey(this.parseCacheKey(text, settings), true, [primary]);
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
    primaryParsedHtmlForRender(text, settings, key) {
      const cached = this.parsedHtmlCache.get(key);
      if (cached !== void 0) return cached;
      const provisional = this.provisionalParsedHtmlCache.get(key);
      if (provisional !== void 0) {
        if (this.shouldUseProvisionalSubtitleParse(settings)) {
          if (this.enrichedProvisionalParsedHtmlKeys.has(key)) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
          else this.ensureEnrichedProvisionalParsedCueHtml(text, settings, key);
        }
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
      const key = this.parseCacheKey(text, settings);
      const serial = ++this.renderSerial;
      const cached = this.parsedHtmlCache.get(key);
      if (cached) {
        const root = this.replacePrimaryHtml(cached, serial);
        if (root) this.notifyParsedTokensForKey(key, true, [root]);
        return;
      }
      try {
        const html = await this.parseCueHtml(text, settings, { enrichBeforeRender: true });
        this.applyParsedPrimaryHtml(key, text, html, serial);
      } catch {
      }
    }
    replacePrimaryHtml(html, serial) {
      if (serial !== this.renderSerial) return null;
      const primary = this.subtitleEl?.querySelector(".jpdb-subtitle-primary");
      if (primary) {
        const currentCue = this.currentCue ?? null;
        const shouldSyncKaraoke = this.shouldRenderKaraokePrimary(primary, currentCue);
        const shouldRenderPlainKaraoke = shouldSyncKaraoke && !parsedSubtitleHtmlHasReaderWords(html);
        const replacement = this.primaryReplacementHtml(html, currentCue, shouldRenderPlainKaraoke);
        setInnerHtml(primary, replacement);
        this.lastAppliedSubtitleHtml = `<div class="jpdb-subtitle-primary">${replacement}</div>${this.renderSecondarySubtitle(this.options.getSettings())}`;
        this.syncKaraokePrimary(currentCue, shouldSyncKaraoke);
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
      const key = this.parseCacheKey(text, settings);
      const cached = this.parsedHtmlCache.get(key) ?? this.restoreSessionParsedCueHtml(key);
      if (cached) {
        return cached;
      }
      const emptyCached = this.freshEmptyParsedHtml(key);
      if (emptyCached) return emptyCached;
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseProvisionalCueHtml(text, settings, key, options);
      const pending = this.pendingParsedCueHtml(key, "authoritative");
      if (pending) return pending;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, subtitleParseOptions());
        if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key, html, tokens);
        return html;
      })();
      this.pendingParsedHtml.set(key, promise);
      try {
        return await promise;
      } finally {
        this.pendingParsedHtml.delete(key);
      }
    }
    async parseProvisionalCueHtml(text, settings, key, options = {}) {
      const restored = this.restoreSessionParsedCueHtml(key);
      if (restored) return restored;
      if (options.authoritativeUpgrade !== false) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
      const cached = this.provisionalParsedHtmlCache.get(key);
      if (cached && (!options.refreshProvisional || this.enrichedProvisionalParsedHtmlKeys.has(key))) {
        return cached;
      }
      const pending = options.refreshProvisional ? this.pendingProvisionalParsedHtml.get(key) : this.pendingParsedCueHtml(key, "provisional");
      if (pending) return pending;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
        if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key, html, tokens, { provisional: true, enriched: this.shouldMarkCueEnriched(key, tokens, options.enrichBeforeRender === true) });
        return html;
      })();
      this.pendingProvisionalParsedHtml.set(key, promise);
      try {
        return await promise;
      } finally {
        this.pendingProvisionalParsedHtml.delete(key);
      }
    }
    ensureEnrichedProvisionalParsedCueHtml(text, settings, key) {
      if (this.enrichedProvisionalParsedHtmlKeys.has(key) || this.pendingProvisionalParsedHtml.has(key)) return;
      void this.parseProvisionalCueHtml(text, settings, key, {
        authoritativeUpgrade: false,
        enrichBeforeRender: true,
        refreshProvisional: true
      }).then((html) => {
        this.updateTranscriptRowsForParseKey(key, html, { provisional: true, force: true });
        if (this.currentPrimaryParseCacheKey() === key) this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
      }).catch(() => void 0);
    }
    ensureAuthoritativeParsedCueHtml(text, settings, key) {
      this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key }], settings);
    }
    ensureAuthoritativeParsedCueHtmlBatch(items, settings) {
      if (!hasJpdbApiCredential(settings) && !hasJitenApiCredential(settings)) return;
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
    applyAuthoritativeParsedCueHtml(key, text, html) {
      this.updateTranscriptRowsForParseKey(key, html);
      if (this.currentPrimaryParseCacheKey() !== key) return;
      this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }
    // Late token enrichment (public jpdb pitch lookups, fallback-vocabulary
    // resolution) mutates the cached token objects AFTER their cue html was
    // baked. Re-baking the cached html keeps every re-render — Previous/Next
    // steps, transcript rows, session restores — pre-coloured with the
    // enriched pitch and word state instead of silently dropping it on the
    // next cache hit (UT-66).
    refreshParsedCueTexts(texts) {
      if (!texts.length) return;
      const settings = this.options.getSettings();
      const seen = /* @__PURE__ */ new Set();
      for (const raw of texts) {
        const text = raw.trim();
        if (!text) continue;
        const key = this.parseCacheKey(text, settings);
        if (seen.has(key)) continue;
        seen.add(key);
        this.rebakeParsedCueHtml(key, text, settings);
      }
    }
    rebakeParsedCueHtml(key, text, settings) {
      const tokens = this.parsedTokenCache.get(key);
      if (!tokens?.length) return;
      const provisional = !this.parsedHtmlCache.has(key) && this.provisionalParsedHtmlCache.has(key);
      const previous = provisional ? this.provisionalParsedHtmlCache.get(key) : this.parsedHtmlCache.get(key);
      if (previous === void 0) return;
      const html = withBreaks(renderTokensToHtml(text, tokens, settings));
      if (html === previous) return;
      this.rememberParsedCueHtml(key, html, tokens, provisional ? { provisional: true, enriched: true } : {});
      this.updateTranscriptRowsForParseKey(key, html, { provisional, force: true });
      if (this.currentPrimaryParseCacheKey() !== key) return;
      this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }
    applyParsedPrimaryHtml(key, text, html, serial) {
      const root = this.replacePrimaryHtml(html, serial);
      this.lastRenderedPrimaryKey = key;
      this.lastRenderedPrimaryText = text;
      this.lastRenderedPrimaryHtml = html;
      if (root) this.notifyParsedTokensForKey(key, true, [root]);
    }
    currentPrimaryParseCacheKey() {
      const text = this.currentCue?.text.trim() ?? "";
      return text ? this.parseCacheKey(text, this.options.getSettings()) : "";
    }
    async parseCueHtmlBatch(texts, settings = this.options.getSettings(), options = {}) {
      const items = uniqueSubtitleParseTexts(texts).map((text) => ({ text, key: this.parseCacheKey(text, settings) }));
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseCueHtmlBatchWithProvisionalFallback(items, settings, options);
      const { ready, batch } = planSubtitleParseBatch(
        items,
        // Keyless there is nothing to upgrade to, so a provisional hit is
        // final here too — without it the transcript-tail warmup
        // (allowProvisional: false) re-parsed every already-parsed cue a
        // second time through the local tokenizer.
        (key) => this.parsedHtmlCache.get(key) ?? this.freshEmptyParsedHtml(key) ?? (this.hasAuthoritativeParseTier() ? void 0 : this.provisionalParsedHtmlCache.get(key)),
        (key) => this.pendingParsedCueHtml(key, "authoritative")
      );
      if (!batch.length) return Promise.all(ready);
      if (!this.options.parseJapaneseBatch) {
        return Promise.all([...ready, ...batch.map(async (item) => ({
          key: item.key,
          html: await this.parseCueHtml(item.text, settings, options)
        }))]);
      }
      const parsed = this.options.parseJapaneseBatch(batch.map((item) => item.text), subtitleParseOptions());
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { enrichBeforeRender: options.enrichBeforeRender });
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingParsedHtml);
    }
    async parseCueHtmlBatchWithProvisionalFallback(items, settings, options = {}) {
      if (options.authoritativeUpgrade !== false) this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
      const { ready, batch } = planProvisionalSubtitleParseBatch(
        items,
        (key) => this.parsedHtmlCache.get(key),
        (key) => this.usableProvisionalParsedHtml(key, options),
        (key) => options.refreshProvisional ? void 0 : this.pendingParsedCueHtml(key, "provisional"),
        (key) => this.freshEmptyParsedHtml(key)
      );
      if (!batch.length) return Promise.all(ready);
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(batch.map((item) => item.text), provisionalSubtitleParseOptions()) : Promise.all(batch.map((item) => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true, enrichBeforeRender: options.enrichBeforeRender });
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingProvisionalParsedHtml);
    }
    renderParsedHtmlBatch(batch, parsed, settings, options = {}) {
      return batch.map((item, index) => parsed.then(async (tokens) => {
        const tokenList = tokens[index] ?? [];
        if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokenList);
        const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
        this.rememberParsedCueHtml(item.key, html, tokenList, { ...options, enriched: this.shouldMarkCueEnriched(item.key, tokenList, options.enrichBeforeRender === true) });
        return options.provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
      }));
    }
    async beforeRenderParsedTokens(tokens) {
      if (!tokens.length || !this.options.beforeRenderTokens) return;
      await this.options.beforeRenderTokens(tokens);
    }
    async resolveParsedHtmlBatch(ready, batch, parsedHtml, pendingCache2) {
      const pendingHtml = parsedHtml.map((promise) => promise.then((result) => result.html));
      batch.forEach((item, index) => pendingCache2.set(item.key, pendingHtml[index]));
      try {
        return await Promise.all([...ready, ...parsedHtml]);
      } finally {
        batch.forEach((item, index) => {
          if (pendingCache2.get(item.key) === pendingHtml[index]) pendingCache2.delete(item.key);
        });
      }
    }
    usableProvisionalParsedHtml(key, options) {
      const html = this.provisionalParsedHtmlCache.get(key);
      if (!html) return void 0;
      return options.refreshProvisional && !this.enrichedProvisionalParsedHtmlKeys.has(key) ? void 0 : html;
    }
    // A cue is only "fully enriched" when every kanji-bearing token can render
    // furigana (explicit rubies, or a usable kana reading != surface). A
    // fallback token whose public lookup has not resolved yet leaves the cue
    // re-hydratable, so a later pass (e.g. after orientationchange/resize) can
    // retry it instead of the enriched-once flag freezing the missing furigana
    // forever. Local/authoritative tokens are final and never block. Mirrors
    // sourceTokenRubies (dom/index.ts).
    tokensFullyEnriched(tokens) {
      return tokens.every((token) => {
        if (token.rubies.length) return true;
        const surface = token.card.spelling || "";
        if (!SUBTITLE_FURIGANA_KANJI_RE.test(surface)) return true;
        if (token.card.source !== "fallback") return true;
        const reading = token.card.reading.trim();
        return Boolean(reading) && reading !== surface && SUBTITLE_FURIGANA_KANA_RE.test(reading);
      });
    }
    // Decide whether a freshly parsed provisional cue is "enriched" (sticky, no
    // re-hydration). A fully-resolved cue is sticky immediately. A cue that
    // still has an unresolved fallback kanji word is left re-hydratable so a
    // later pass can retry — but only up to a bounded number of attempts, after
    // which it settles to bare to avoid re-requesting an unresolvable word on
    // every hydration tick.
    shouldMarkCueEnriched(key, tokens, enrichRequested) {
      if (!enrichRequested) return false;
      if (this.tokensFullyEnriched(tokens)) {
        this.incompleteEnrichmentAttempts.delete(key);
        return true;
      }
      const attempts = (this.incompleteEnrichmentAttempts.get(key) ?? 0) + 1;
      if (attempts >= SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT) {
        this.incompleteEnrichmentAttempts.delete(key);
        return true;
      }
      if (this.incompleteEnrichmentAttempts.size >= SUBTITLE_PARSE_CACHE_MAX_ENTRIES) {
        this.incompleteEnrichmentAttempts.delete(this.incompleteEnrichmentAttempts.keys().next().value ?? "");
      }
      this.incompleteEnrichmentAttempts.set(key, attempts);
      return false;
    }
    rememberParsedCueHtml(key, html, tokens = [], options = {}) {
      if (parsedSubtitleHtmlHasReaderWords(html)) {
        if (options.provisional) {
          this.provisionalParsedHtmlCache.set(key, html);
          if (options.enriched) this.enrichedProvisionalParsedHtmlKeys.add(key);
          else this.enrichedProvisionalParsedHtmlKeys.delete(key);
        } else {
          this.parsedHtmlCache.set(key, html);
          this.provisionalParsedHtmlCache.delete(key);
          this.enrichedProvisionalParsedHtmlKeys.delete(key);
        }
        if (!options.provisional || !this.hasAuthoritativeParseTier() && options.enriched) this.persistSessionParsedCueHtml(key, html);
        this.emptyParsedHtmlCache.delete(key);
        if (tokens.length) this.parsedTokenCache.set(key, tokens);
        this.pruneParsedSubtitleCaches();
      } else {
        this.emptyParsedHtmlCache.set(key, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
        this.pruneParsedSubtitleCaches();
      }
    }
    pruneParsedSubtitleCaches() {
      const limit = this.parsedSubtitleCacheLimit();
      this.pruneParsedSubtitleCache(this.parsedHtmlCache, limit);
      this.pruneParsedSubtitleCache(this.provisionalParsedHtmlCache, limit);
      while (this.emptyParsedHtmlCache.size > SUBTITLE_PARSE_CACHE_MIN_ENTRIES) this.deleteParsedSubtitleKey(this.emptyParsedHtmlCache.keys().next().value ?? "");
      while (this.parsedTokenCache.size > limit) this.deleteParsedSubtitleKey(this.parsedTokenCache.keys().next().value ?? "");
    }
    parsedSubtitleCacheLimit() {
      const transcriptRows = this.cues.filter((cue) => cue.transcriptEligible !== false).length;
      return Math.min(
        SUBTITLE_PARSE_CACHE_MAX_ENTRIES,
        Math.max(SUBTITLE_PARSE_CACHE_MIN_ENTRIES, transcriptRows + SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM)
      );
    }
    hasAuthoritativeParseTier() {
      const settings = this.options.getSettings();
      return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings);
    }
    // UT-48 session persistence: parsed cue html survives reloads of the
    // same video/session. Quota errors and disabled storage degrade to the
    // in-memory caches silently.
    persistSessionParsedCueHtml(key, html) {
      try {
        sessionStorage.setItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`, JSON.stringify({ at: Date.now(), html }));
      } catch {
      }
    }
    restoreSessionParsedCueHtml(key) {
      if (this.sessionParseCacheChecked.has(key)) return void 0;
      this.sessionParseCacheChecked.add(key);
      try {
        const raw = sessionStorage.getItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`);
        if (!raw) return void 0;
        const value = JSON.parse(raw);
        if (typeof value.html !== "string" || typeof value.at !== "number") return void 0;
        if (Date.now() - value.at > SUBTITLE_SESSION_PARSE_CACHE_TTL_MS) return void 0;
        this.parsedHtmlCache.set(key, value.html);
        this.pruneParsedSubtitleCaches();
        return value.html;
      } catch {
        return void 0;
      }
    }
    pruneParsedSubtitleCache(cache, limit = this.parsedSubtitleCacheLimit()) {
      while (cache.size > limit) this.deleteParsedSubtitleKey(cache.keys().next().value ?? "");
    }
    deleteParsedSubtitleKey(key) {
      if (!key) return;
      this.parsedHtmlCache.delete(key);
      this.provisionalParsedHtmlCache.delete(key);
      this.emptyParsedHtmlCache.delete(key);
      this.pendingParsedHtml.delete(key);
      this.pendingProvisionalParsedHtml.delete(key);
      this.parsedTokenCache.delete(key);
      this.parsedTokenNotifiedAt.delete(key);
    }
    notifyParsedTokensForKey(key, force = false, roots) {
      if (!this.options.afterParseTokens) return;
      const tokens = this.parsedTokenCache.get(key);
      if (!tokens?.length) return;
      const now = Date.now();
      const lastNotifiedAt = this.parsedTokenNotifiedAt.get(key) ?? 0;
      if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
      this.parsedTokenNotifiedAt.set(key, now);
      this.options.afterParseTokens(tokens, roots);
    }
    shouldUseProvisionalSubtitleParse(_settings) {
      return isYouTubePage();
    }
    hasFreshEmptyParsedHtml(key) {
      return Boolean(this.freshEmptyParsedHtml(key));
    }
    freshEmptyParsedHtml(key) {
      const cached = this.emptyParsedHtmlCache.get(key);
      if (!cached) return void 0;
      if (cached.expiresAt > Date.now()) return cached.html;
      this.emptyParsedHtmlCache.delete(key);
      return void 0;
    }
    warmParseAroundActiveCue() {
      if (!this.shouldParseSubtitles() || !this.cues.length) return;
      const anchor = this.parseWarmupAnchorIndex();
      this.lastParseWarmupAnchor = anchor;
      const start = Math.max(0, anchor - SUBTITLE_ACTIVE_PREPARSE_BEHIND);
      const end = Math.min(this.cues.length, anchor + SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1);
      const serial = ++this.parseWarmupSerial;
      const settings = this.options.getSettings();
      const texts = this.subtitleWarmupTexts(start, end, settings);
      if (!texts.length) return;
      void (async () => {
        try {
          await this.parseCueHtmlBatch(texts, settings, { enrichBeforeRender: true });
        } catch {
        }
        if (serial !== this.parseWarmupSerial) return;
        if (this.currentCue?.text.trim()) this.render();
      })();
    }
    // A seek that lands between cues has no active cue; anchoring the warmup
    // window at the next upcoming cue (instead of the transcript start) keeps
    // the "active cue + lookahead warm within one turn" guarantee after long
    // seeks in either direction.
    parseWarmupAnchorIndex() {
      const active = this.activeTranscriptIndex();
      if (active >= 0) return active;
      const time = this.video?.currentTime ?? 0;
      const upcoming = this.cues.findIndex((cue) => cue.end >= time);
      return upcoming >= 0 ? upcoming : Math.max(0, this.cues.length - 1);
    }
    subtitleWarmupTexts(start, end, settings) {
      const texts = [];
      const seen = /* @__PURE__ */ new Set();
      for (let index = start; index < end; index++) {
        const text = this.cues[index]?.text.trim();
        if (!text) continue;
        const key = this.parseCacheKey(text, settings);
        if (seen.has(key) || this.isWarmParsedCueKey(key)) continue;
        seen.add(key);
        texts.push(text);
      }
      return texts;
    }
    // Keyless there is no authoritative tier, so a provisional hit is final
    // and the cue counts as warm; keyed the provisional tier stays listed so
    // a failed authoritative upgrade is retried by the next warmup turn.
    isWarmParsedCueKey(key) {
      if (this.parsedHtmlCache.has(key) || this.hasFreshEmptyParsedHtml(key)) return true;
      return !this.hasAuthoritativeParseTier() && this.provisionalParsedHtmlCache.has(key);
    }
    // Keyless both tiers produce the same local-tokenizer result, so an
    // in-flight parse on EITHER tier satisfies the other — without this the
    // overlay warmup and the transcript-tail warmup tokenized the same cue
    // twice whenever their windows overlapped.
    pendingParsedCueHtml(key, tier) {
      const own = tier === "provisional" ? this.pendingProvisionalParsedHtml.get(key) : this.pendingParsedHtml.get(key);
      if (own || this.hasAuthoritativeParseTier()) return own;
      return tier === "provisional" ? this.pendingParsedHtml.get(key) : this.pendingProvisionalParsedHtml.get(key);
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
      const state2 = this.primaryKaraokeState(cue);
      if (!state2) return;
      const progress = karaokeCharacterProgress(cue, state2.words, time);
      let cursor = 0;
      for (const element of state2.wordElements) {
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
      const compact = shouldUseCompactSubtitleDrawer(this.transcriptViewportWidth());
      const effectivePlacement = compact ? "bottom" : settings.subtitleTranscriptPlacement;
      if (placement === effectivePlacement) {
        this.closeTranscriptPanel();
        return;
      }
      settings.subtitleTranscriptPlacement = placement;
      if (placement !== "bottom") this.clampStoredSideWidthForCurrentVideo(placement);
      this.options.onSettingsChange();
      if (this.panelMode === "tracks" || !this.hasTranscriptSurface()) this.renderOpenSubtitlePanel();
      else {
        this.lastTranscriptSignature = "";
        this.syncPanelPlacementButtons();
      }
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
    bindSubtitleDragHandle() {
      const handle = this.root?.querySelector("[data-subtitle-drag-handle]");
      if (!handle) return;
      handle.addEventListener("pointerdown", (event) => this.startSubtitleDrag(event), this.eventOptions());
      handle.addEventListener("mousedown", (event) => this.startSubtitleMouseDrag(event), this.eventOptions());
      handle.addEventListener("keydown", (event) => this.moveSubtitleOverlayFromKeyboard(event), this.eventOptions());
    }
    startSubtitleDrag(event) {
      const handle = event.currentTarget;
      const session = this.beginSubtitleDrag(handle, event.button, event.clientY, event);
      if (!session) return;
      const pointerId = event.pointerId;
      handle.setPointerCapture?.(pointerId);
      const pointerMatches = (pointerEvent) => pointerEvent.pointerId === pointerId;
      const onMove = (moveEvent) => {
        if (!pointerMatches(moveEvent)) return;
        this.updateSubtitleDrag(session, moveEvent.clientY, moveEvent);
      };
      const onEnd = (upEvent) => {
        if (!pointerMatches(upEvent)) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        handle.releasePointerCapture?.(pointerId);
        this.endSubtitleDrag(session);
      };
      window.addEventListener("pointermove", onMove, this.eventOptions());
      window.addEventListener("pointerup", onEnd, this.eventOptions());
      window.addEventListener("pointercancel", onEnd, this.eventOptions());
    }
    startSubtitleMouseDrag(event) {
      const handle = event.currentTarget;
      const session = this.beginSubtitleDrag(handle, event.button, event.clientY, event);
      if (!session) return;
      const onMove = (moveEvent) => this.updateSubtitleDrag(session, moveEvent.clientY, moveEvent);
      const onEnd = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        this.endSubtitleDrag(session);
      };
      window.addEventListener("mousemove", onMove, this.eventOptions());
      window.addEventListener("mouseup", onEnd, this.eventOptions());
    }
    beginSubtitleDrag(handle, button, startY, event) {
      if (this.subtitleDragActive || button !== 0) return void 0;
      const dragFrame = this.subtitleDragFrameForHandle(handle);
      if (!dragFrame) return void 0;
      event.preventDefault();
      event.stopPropagation();
      const dragRoot = this.subtitleDragClassRootForHandle(handle);
      const session = {
        handle,
        dragFrame,
        dragRoot,
        startY,
        startOffset: this.subtitleDragOffsetYPx
      };
      this.subtitleDragActive = true;
      handle.classList.add("jpdb-subtitle-dragging");
      dragRoot?.classList.add("jpdb-subtitle-dragging");
      if (dragRoot !== this.root) this.root?.classList.add("jpdb-subtitle-dragging");
      this.showControlsTemporarily();
      return session;
    }
    updateSubtitleDrag(session, clientY, event) {
      if (event.cancelable) event.preventDefault();
      this.setSubtitleDragOffset(session.startOffset + clientY - session.startY, session.dragFrame);
      this.showControlsTemporarily();
    }
    endSubtitleDrag(session) {
      this.subtitleDragActive = false;
      session.handle.classList.remove("jpdb-subtitle-dragging");
      session.dragRoot?.classList.remove("jpdb-subtitle-dragging");
      if (session.dragRoot !== this.root) this.root?.classList.remove("jpdb-subtitle-dragging");
      this.showControlsTemporarily();
    }
    moveSubtitleOverlayFromKeyboard(event) {
      const dragFrame = event.currentTarget instanceof HTMLElement ? this.subtitleDragFrameForHandle(event.currentTarget) : void 0;
      const step = event.shiftKey ? 24 : 8;
      const deltas = {
        ArrowUp: -step,
        ArrowDown: step,
        PageUp: -step * 4,
        PageDown: step * 4
      };
      const delta = deltas[event.key];
      const shouldReset = event.key === "Home" || event.key === "0";
      if (delta === void 0 && !shouldReset) return;
      event.preventDefault();
      event.stopPropagation();
      this.setSubtitleDragOffset(shouldReset ? 0 : this.subtitleDragOffsetYPx + delta, dragFrame);
      this.showControlsTemporarily();
    }
    setSubtitleDragOffset(offsetPx, dragFrame) {
      const offset = Math.round(this.clampedSubtitleDragOffset(offsetPx, dragFrame));
      if (offset === this.subtitleDragOffsetYPx) return;
      this.subtitleDragOffsetYPx = offset;
      this.syncSubtitleDragOffsetStyle();
    }
    resetSubtitleDragOffset() {
      this.subtitleDragOffsetYPx = 0;
      this.syncSubtitleDragOffsetStyle();
    }
    syncSubtitleDragOffsetStyle() {
      const offset = `${this.subtitleDragOffsetYPx}px`;
      if (this.root) setStylePropertyIfChanged(this.root, "--subtitle-drag-offset-y", offset);
      for (const root of this.asbPlayerSubtitleMoveRoots()) {
        setStylePropertyIfChanged(root, "--jpdb-subtitle-asb-drag-offset-y", offset);
      }
    }
    clampedSubtitleDragOffset(offsetPx, dragFrame) {
      if (!Number.isFinite(offsetPx)) return this.subtitleDragOffsetYPx;
      const { min, max } = this.subtitleDragOffsetBounds(dragFrame);
      return Math.min(max, Math.max(min, offsetPx));
    }
    subtitleDragOffsetBounds(dragFrame) {
      const viewportHeight = Math.max(240, window.innerHeight || document.documentElement.clientHeight || 0);
      const fallback = {
        min: -Math.round(viewportHeight * 0.45),
        max: Math.round(viewportHeight * 0.35)
      };
      const subtitleFrame = dragFrame ?? this.root?.querySelector(".jpdb-subtitle-text") ?? this.subtitleEl;
      const rect = subtitleFrame?.getBoundingClientRect();
      if (!rect || rect.height <= 0 || rect.width <= 0) return fallback;
      const margin = 12;
      const min = this.subtitleDragOffsetYPx + margin - rect.top;
      const max = this.subtitleDragOffsetYPx + viewportHeight - margin - rect.bottom;
      return min <= max ? { min, max } : fallback;
    }
    subtitleDragFrameForHandle(handle) {
      const asbRoot = handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR) ? handle.closest(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR) : null;
      return asbRoot ?? this.root?.querySelector(".jpdb-subtitle-text") ?? this.subtitleEl;
    }
    subtitleDragClassRootForHandle(handle) {
      return handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR) ? handle.closest(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR) ?? void 0 : this.root;
    }
    syncAsbPlayerSubtitleMoveHandles(settings = this.options.getSettings()) {
      const roots = this.asbPlayerSubtitleMoveRoots();
      if (!roots.length) {
        if (this.asbMoveHandlesActive) {
          this.removeAsbPlayerSubtitleMoveHandles();
          this.asbMoveHandlesActive = false;
        }
        return;
      }
      const activeRoots = new Set(roots);
      for (const handle of Array.from(document.querySelectorAll(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))) {
        const root = handle.closest(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR);
        if (!root || !activeRoots.has(root)) handle.remove();
      }
      let anyEnabled = false;
      for (const root of roots) {
        const enabled = settings.subtitlePlayerEnabled && settings.subtitleOverlayVisible && settings.subtitleControlsMode !== "hidden" && this.asbPlayerSubtitleRootHasText(root);
        if (!enabled) {
          this.teardownAsbPlayerSubtitleMoveRoot(root);
          continue;
        }
        anyEnabled = true;
        this.captureAsbPlayerSubtitleBaseTransform(root);
        root.classList.add("jpdb-subtitle-asb-movable", "jpdb-subtitle-has-lines");
        root.classList.toggle("jpdb-subtitle-controls-auto", settings.subtitleControlsMode === "auto");
        root.classList.toggle("jpdb-subtitle-controls-always", settings.subtitleControlsMode === "always");
        root.classList.toggle("jpdb-subtitle-controls-idle", settings.subtitleControlsMode === "auto" && Boolean(this.root?.classList.contains("jpdb-subtitle-controls-idle")));
        setStylePropertyIfChanged(root, "--jpdb-subtitle-asb-drag-offset-y", `${this.subtitleDragOffsetYPx}px`);
        this.ensureAsbPlayerSubtitleMoveHandle(root, settings);
      }
      this.asbMoveHandlesActive = anyEnabled;
    }
    asbPlayerSubtitleMoveRoots() {
      return Array.from(document.querySelectorAll(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR));
    }
    asbPlayerSubtitleRootHasText(root) {
      return Array.from(root.childNodes).filter((node) => !(node instanceof HTMLElement && node.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))).some((node) => Boolean(node.textContent?.replace(/\s+/g, "")));
    }
    ensureAsbPlayerSubtitleMoveHandle(root, settings) {
      let handle = Array.from(root.querySelectorAll(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR)).find((candidate) => candidate.parentElement === root);
      const moveLabel = uiText(settings.interfaceLanguage, "moveSubtitles");
      if (!handle) {
        handle = document.createElement("button");
        handle.type = "button";
        handle.className = "jpdb-subtitle-drag-handle jpdb-subtitle-asb-drag-handle";
        handle.dataset.subtitleDragHandle = "true";
        handle.dataset.yomuAsbSubtitleDragHandle = "true";
        handle.dataset.jpdbReaderSurfaceIgnore = "true";
        setInnerHtml(handle, '<span aria-hidden="true"></span>');
        root.appendChild(handle);
      }
      handle.title = moveLabel;
      handle.setAttribute("aria-label", moveLabel);
      if (this.asbSubtitleDragHandles.has(handle)) return;
      handle.addEventListener("pointerdown", (event) => this.startSubtitleDrag(event), this.eventOptions());
      handle.addEventListener("mousedown", (event) => this.startSubtitleMouseDrag(event), this.eventOptions());
      handle.addEventListener("keydown", (event) => this.moveSubtitleOverlayFromKeyboard(event), this.eventOptions());
      this.asbSubtitleDragHandles.add(handle);
    }
    captureAsbPlayerSubtitleBaseTransform(root) {
      if (this.asbSubtitleBaseTransforms.has(root)) return;
      const transform = getComputedStyle(root).transform;
      const baseTransform = transform && transform !== "none" ? transform : "translateZ(0)";
      this.asbSubtitleBaseTransforms.set(root, baseTransform);
      root.style.setProperty("--jpdb-subtitle-asb-base-transform", baseTransform);
    }
    removeAsbPlayerSubtitleMoveHandles() {
      for (const root of this.asbPlayerSubtitleMoveRoots()) this.teardownAsbPlayerSubtitleMoveRoot(root);
      for (const handle of Array.from(document.querySelectorAll(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))) handle.remove();
    }
    teardownAsbPlayerSubtitleMoveRoot(root) {
      root.querySelectorAll(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR).forEach((handle) => handle.remove());
      root.classList.remove(...ASBPLAYER_SUBTITLE_DRAG_CLASSES);
      root.style.removeProperty("--jpdb-subtitle-asb-drag-offset-y");
      root.style.removeProperty("--jpdb-subtitle-asb-base-transform");
      this.asbSubtitleBaseTransforms.delete(root);
    }
    showControlsTemporarily() {
      if (!this.root) return;
      this.root.classList.remove("jpdb-subtitle-controls-idle");
      this.syncAsbPlayerSubtitleMoveHandles();
      this.scheduleControlsIdle();
    }
    hideControlsImmediately() {
      this.clearControlsIdleTimer();
      if (!this.root || !this.shouldAutoIdleControls()) return;
      this.root.classList.add("jpdb-subtitle-controls-idle");
      this.syncAsbPlayerSubtitleMoveHandles();
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
      const rect = this.video ? this.videoLayoutRect() : void 0;
      return Boolean(rect && rect.width > 120 && rect.height > 90);
    }
    isPointerNearSubtitleSurface(x, y) {
      if (!this.root) return false;
      if (this.pointInElement(this.root.querySelector(".jpdb-subtitle-rail"), x, y)) return true;
      if (this.pointInOpenTranscriptPanel(x, y)) return true;
      if (!this.video) return true;
      if (this.videoPlayerChromeHidden()) return false;
      return pointInRect(x, y, this.videoLayoutRect());
    }
    videoPlayerChromeHidden() {
      const mobileOverlay = document.querySelector("#player-control-overlay");
      if (mobileOverlay) return !mobileOverlay.classList.contains("fadein");
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
      if (isEditableTarget(event.target)) return;
      const previousSubtitle = matchesShortcut(event, settings.shortcuts.previousSubtitle);
      const nextSubtitle = matchesShortcut(event, settings.shortcuts.nextSubtitle);
      if (previousSubtitle || nextSubtitle) {
        if (!this.canUseSubtitleNavigationShortcut()) return;
        event.preventDefault();
        this.seekSubtitle(previousSubtitle ? -1 : 1);
      } else if (matchesShortcut(event, settings.shortcuts.copySubtitle) && this.subtitleCopyText(void 0)) {
        event.preventDefault();
        void this.copySubtitle();
      }
    }
    canUseSubtitleNavigationShortcut() {
      return Boolean(this.video && this.videoHasPlayerAffordances());
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
      this.transcriptUserScrollAt = 0;
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
      return subtitleClipboardText(cue, secondary, this.options.getSettings().subtitleCopyIncludeTranslation);
    }
    async copyTranscriptRow(index) {
      const row = Number.isFinite(index) ? this.transcriptRows()[index] : void 0;
      if (!row) return;
      if (row.cueIndex >= 0) {
        await this.copySubtitle(row.cueIndex);
        return;
      }
      const secondary = findAlignedCue(this.secondaryCues, row.cue);
      const text = subtitleClipboardText(row.cue, secondary, this.options.getSettings().subtitleCopyIncludeTranslation);
      if (!text) return;
      await this.writeSubtitleClipboard(text, "Subtitle clipboard copy failed");
    }
    // UT-68c: when the Lines list shows only Japanese, each row with an
    // aligned translation gets an eye toggle to peek it.
    transcriptRowPeekButton(cue, index, settings) {
      const secondary = findAlignedCue(this.secondaryCues, cue);
      if (!secondary?.text.trim()) return "";
      const label = uiText(settings.interfaceLanguage, "peekSubtitleTranslation");
      return `<button class="jpdb-subtitle-row-peek" type="button" data-action="peek-row" data-row-index="${index}" aria-pressed="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${subtitleIcon("eye")}</button>`;
    }
    toggleRowTranslationPeek(target) {
      const button = target.closest('[data-action="peek-row"]');
      const row = target.closest(".jpdb-subtitle-list-row");
      if (!button || !row) return;
      const existing = row.querySelector(".jpdb-subtitle-row-secondary");
      const language = this.options.getSettings().interfaceLanguage;
      if (existing) {
        existing.remove();
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("title", uiText(language, "peekSubtitleTranslation"));
        button.setAttribute("aria-label", uiText(language, "peekSubtitleTranslation"));
        setInnerHtml(button, subtitleIcon("eye"));
        return;
      }
      const cue = this.transcriptRows()[this.rowIndexFromTarget(button)]?.cue;
      const secondary = cue ? findAlignedCue(this.secondaryCues, cue) : void 0;
      if (!secondary?.text.trim()) return;
      const body = row.querySelector(".jpdb-subtitle-row-body") ?? row;
      const peek = document.createElement("div");
      peek.className = "jpdb-subtitle-row-secondary";
      peek.lang = "en";
      peek.textContent = secondary.text.trim();
      body.append(peek);
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("title", uiText(language, "hideSubtitleTranslation"));
      button.setAttribute("aria-label", uiText(language, "hideSubtitleTranslation"));
      setInnerHtml(button, subtitleIcon("eye-off"));
    }
    async writeSubtitleClipboard(text, failureMessage) {
      await navigator.clipboard?.writeText(text).catch((error) => log.warn(failureMessage, error));
    }
    async autoCopyCurrentCue() {
      if (!this.options.getSettings().subtitleAutoCopyLine || !this.currentCue?.text.trim()) return;
      const signature = subtitleCueSignature(this.currentCue);
      if (signature === this.lastAutoCopiedCueSignature) return;
      this.lastAutoCopiedCueSignature = signature;
      await navigator.clipboard?.writeText(this.currentCue.text.trim()).catch((error) => log.warn("Subtitle auto-copy failed", error));
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
      log.info("Subtitle file loaded", { kind, name: file.name, cues: cues.length });
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
        transcriptEligible: request.transcriptEligible,
        translationFallback: this.translationFallbackModeForSelection(request)
      });
      return this.loadedTrackSelection(request, loaded.track, loaded.cues);
    }
    translationFallbackModeForSelection(request) {
      return request.role === "secondary" ? "skip" : "full";
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
      log.info(`${role} subtitle track selected`, { id, label: selected?.label ?? "", kind: selected?.kind ?? "unknown", cues });
    }
    setNativeTrackModes() {
      const settings = this.options.getSettings();
      this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
        suppressNativeCaptions: Boolean(settings.subtitlePlayerEnabled && this.video),
        video: this.video,
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
      const hostname = (typeof window !== "undefined" ? window.location?.hostname : void 0) || "";
      if (!hostname.includes("youtube.com")) return;
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
      const key = youtubeCaptionTrackIdentity(track);
      return this.tracks.find((option) => option.kind === "youtube" && youtubeCaptionTrackIdentity(option) === key);
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
      if (this.selectedTrackId && !this.isSyntheticTranslatedSelection()) return void 0;
      if (this.youtubeAutoSelectSuppressedVideoId && this.youtubeAutoSelectSuppressedVideoId === this.youtubeVideoId) return void 0;
      const candidate = [...this.tracks].filter((track) => track.kind === "youtube" && isJapaneseSubtitleTrack(track)).sort((a, b) => Number(Boolean(a.translatedFromTrackId)) - Number(Boolean(b.translatedFromTrackId)) || compareSubtitleTrackOptions(a, b))[0];
      return candidate?.id === this.selectedTrackId ? void 0 : candidate;
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
      const state2 = subtitleDrawerButtonState({
        panelOpen: this.isTranscriptPanelOpen(),
        hasLines,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        hasVideo: Boolean(this.video),
        trackCount: this.tracks.length
      });
      syncSubtitleDrawerButton(panelButton, {
        disabled: state2.disabled,
        pressed: state2.panelOpen,
        placement: state2.panelOpen ? this.effectiveTranscriptPlacement : this.options.getSettings().subtitleTranscriptPlacement,
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
      else this.openLinesPanel({ deferRender: true });
    }
    showTranscriptPanelElement() {
      const panel = this.transcriptPanel;
      if (!panel) return;
      this.clearTranscriptPanelAnimation();
      this.transcriptPanelClosing = false;
      this.prepareTranscriptPanelPlacementForOpen();
      panel.hidden = false;
      panel.classList.remove("jpdb-subtitle-panel-entering", "jpdb-subtitle-panel-closing");
      panel.classList.add("jpdb-subtitle-panel-opened");
    }
    prepareTranscriptPanelPlacementForOpen() {
      const settings = this.options.getSettings();
      this.effectiveTranscriptPlacement = shouldUseCompactSubtitleDrawer(this.transcriptViewportWidth()) ? "bottom" : settings.subtitleTranscriptPlacement;
      this.syncTranscriptPlacementClass();
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
      this.transcriptPanelHideTimer = clearWindowTimeout(this.transcriptPanelHideTimer);
    }
    clearDeferredTranscriptPanelRender() {
      this.transcriptDeferredRenderFrame = clearWindowAnimationFrame(this.transcriptDeferredRenderFrame);
      this.transcriptDeferredRenderTimer = clearWindowTimeout(this.transcriptDeferredRenderTimer);
    }
    clearTranscriptVirtualRender() {
      this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
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
      const deferRender = options.deferRender === true;
      if (deferRender) {
        this.renderTranscriptPanelPreview();
        this.syncPreviewOpenControls();
        this.scheduleDeferredTranscriptPanelRender();
        return;
      }
      this.clearDeferredTranscriptPanelRender();
      this.renderTranscriptPanel(true);
      this.syncControls();
    }
    syncPreviewOpenControls() {
      this.root?.classList.add("jpdb-subtitle-panel-open");
      this.syncDrawerButtons(this.hasVisibleSubtitleLines());
    }
    toggleNativeSubtitleBlur(target) {
      const settings = this.options.getSettings();
      settings.subtitleNativeBlurred = !settings.subtitleNativeBlurred;
      const appliedInline = this.applyNativeSubtitleBlurState(settings.subtitleNativeBlurred, settings.interfaceLanguage, target);
      this.options.onSettingsChange();
      if (!appliedInline) this.render();
      log.info("Native subtitle blur toggled", { blurred: settings.subtitleNativeBlurred });
    }
    applyNativeSubtitleBlurState(nativeBlurred, language, target) {
      const targets = target ? [target] : Array.from(this.subtitleEl?.querySelectorAll('.jpdb-subtitle-secondary[data-action="toggle-native-blur"]') ?? []);
      if (!targets.length) return false;
      for (const button of targets) syncSubtitleSecondaryBlurState(button, nativeBlurred, language);
      this.lastAppliedSubtitleHtml = this.lastAppliedSubtitleHtml.split(nativeBlurred ? SUBTITLE_SECONDARY_CLEAR_CLASS : SUBTITLE_SECONDARY_BLURRED_CLASS).join(nativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS);
      return true;
    }
    togglePausePanelMode() {
      const settings = this.options.getSettings();
      settings.subtitlePausePanel = !settings.subtitlePausePanel;
      if (settings.subtitlePausePanel) {
        settings.subtitleTranscriptVisible = false;
        if (this.video && this.video.paused && !this.video.ended && this.hasTranscriptSurface()) {
          this.openLinesPanel({ persist: false, autoPause: true, deferRender: true });
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
      this.clearDeferredTranscriptPanelRender();
      this.clearTranscriptVirtualRender();
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
      this.clearDeferredTranscriptPanelRender();
      this.clearTranscriptVirtualRender();
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
    schedulePauseTranscriptPanelSync() {
      if (this.pausePanelSyncScheduled) return;
      this.pausePanelSyncScheduled = true;
      requestAnimationFrame(() => window.setTimeout(() => {
        this.pausePanelSyncScheduled = false;
        if (this.destroyed) return;
        this.syncPauseTranscriptPanel();
      }, 0));
    }
    syncPauseTranscriptPanel(options = {}) {
      const settings = this.options.getSettings();
      if (!settings.subtitlePausePanel || !this.video || !this.video.paused || this.video.ended || !this.hasTranscriptSurface()) {
        this.closePauseTranscriptPanel();
        return;
      }
      if (this.pausePanelDismissed || this.isTranscriptPanelOpen()) return;
      this.openLinesPanel({ persist: false, autoPause: true, deferRender: options.deferRender });
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
      this.clearDeferredTranscriptPanelRender();
      this.transcriptPreviewPlayerResizeDeferred = false;
      const state2 = this.transcriptPanelRenderState();
      if (this.canRefreshTranscriptPanel(force, state2)) return;
      this.lastTranscriptSignature = state2.signature;
      setInnerHtml(panel, this.renderTranscriptPanelHtml(state2));
      this.afterTranscriptPanelRender(state2);
    }
    renderTranscriptPanelPreview() {
      const panel = this.renderableTranscriptPanel();
      if (!panel) return;
      const fullState = this.transcriptPanelRenderState();
      const state2 = this.transcriptPanelPreviewState(fullState);
      this.transcriptPreviewPlayerResizeDeferred = true;
      this.lastTranscriptSignature = "";
      setInnerHtml(panel, this.renderTranscriptPanelHtml(state2));
      this.afterTranscriptPanelRender(state2, { deferPlayerResize: true });
    }
    transcriptPanelPreviewState(state2) {
      const rowCount = state2.rows.length;
      if (!rowCount) return { ...state2, signature: `preview:${state2.signature}`, totalRowCount: 0 };
      const activeIndex = state2.currentRowIndex >= 0 ? state2.currentRowIndex : 0;
      const clampedActive = Math.min(Math.max(activeIndex, 0), rowCount - 1);
      const previewStart = Math.max(0, Math.min(clampedActive - 1, rowCount - 3));
      const previewEnd = Math.min(rowCount, previewStart + 3);
      return {
        rows: state2.rows.slice(previewStart, previewEnd),
        warmupRows: state2.warmupRows,
        currentRowIndex: state2.currentRowIndex,
        signature: `preview:${state2.signature}:${previewStart}`,
        rowIndexOffset: previewStart,
        totalRowCount: rowCount
      };
    }
    scheduleDeferredTranscriptPanelRender() {
      this.clearDeferredTranscriptPanelRender();
      this.transcriptDeferredRenderFrame = requestAnimationFrame(() => {
        this.transcriptDeferredRenderFrame = void 0;
        this.transcriptDeferredRenderTimer = window.setTimeout(() => {
          this.transcriptDeferredRenderTimer = void 0;
          if (this.destroyed || !this.isTranscriptPanelOpen() || this.panelMode !== "lines") return;
          if (this.transcriptResizeActive) {
            this.scheduleDeferredTranscriptPanelRender();
            return;
          }
          this.renderTranscriptPanel(true);
          this.syncControls();
        }, TRANSCRIPT_DEFERRED_RENDER_DELAY_MS);
      });
    }
    renderableTranscriptPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
      return this.panelMode === "lines" ? this.transcriptPanel : null;
    }
    canRefreshTranscriptPanel(force, state2) {
      if (force) return false;
      return this.refreshExistingTranscriptPanel(state2);
    }
    transcriptPanelRenderState() {
      const rows = this.transcriptRows();
      const currentCueIndex = this.activeTranscriptIndex();
      const currentRowIndex = this.activeTranscriptRowIndex(rows, currentCueIndex);
      const settings = this.options.getSettings();
      const virtual = this.transcriptVirtualWindow(rows.length, currentRowIndex);
      const renderedRows = virtual ? rows.slice(virtual.start, virtual.end) : rows;
      const signature = [
        rows.length,
        this.selectedTrackId,
        this.tracks.find((track) => track.id === this.selectedTrackId)?.loadingState ?? "",
        !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : "",
        this.parseCacheKey("", settings),
        virtual ? `v:${virtual.start}:${virtual.end}` : ""
      ].join(":");
      return {
        rows: renderedRows,
        warmupRows: virtual ? renderedRows : void 0,
        currentRowIndex,
        signature,
        rowIndexOffset: virtual?.start,
        totalRowCount: virtual ? rows.length : void 0,
        virtual
      };
    }
    transcriptVirtualWindow(rowCount, currentRowIndex) {
      if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return void 0;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      const clientHeight = Math.max(
        scroller?.clientHeight ?? 0,
        Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
        TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX * 6
      );
      const scrollTop = Math.max(0, scroller?.scrollTop ?? this.transcriptVirtualScrollTop);
      const visibleRows = Math.max(
        TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
        Math.ceil(clientHeight / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2
      );
      const preferredStart = this.transcriptVirtualStartIndex(scrollTop, currentRowIndex, visibleRows);
      const start = Math.max(0, Math.min(preferredStart, Math.max(0, rowCount - visibleRows)));
      const end = Math.min(rowCount, start + visibleRows);
      return {
        start,
        end,
        scrollTop,
        topSpacer: start * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX,
        bottomSpacer: Math.max(0, (rowCount - end) * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX)
      };
    }
    transcriptVirtualStartIndex(scrollTop, currentRowIndex, visibleRows) {
      if (this.shouldCenterActiveTranscriptRow(scrollTop, currentRowIndex)) {
        return currentRowIndex - Math.floor(visibleRows / 2);
      }
      return Math.floor(scrollTop / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
    }
    shouldCenterActiveTranscriptRow(scrollTop, currentRowIndex) {
      if (currentRowIndex < 0) return false;
      if (!this.options.getSettings().subtitleTranscriptAutoScroll) return false;
      if (performance.now() - this.transcriptUserScrollAt < this.transcriptAutoScrollResumeMs()) return false;
      return scrollTop <= 1 || currentRowIndex < Math.floor(scrollTop / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
    }
    refreshExistingTranscriptPanel(state2) {
      if (this.lastTranscriptSignature !== state2.signature) return false;
      this.updateTranscriptActiveLine(state2.currentRowIndex);
      const hydrationIndex = this.transcriptHydrationPreferredIndex(state2);
      this.scheduleTranscriptHydration(hydrationIndex);
      this.scheduleTranscriptCacheWarmup(state2.rows, hydrationIndex);
      return true;
    }
    renderTranscriptPanelHtml(state2) {
      const settings = this.options.getSettings();
      const language = settings.interfaceLanguage;
      const rowCount = state2.totalRowCount ?? state2.rows.length;
      const rowIndexOffset = state2.rowIndexOffset ?? 0;
      return `
            <div class="jpdb-subtitle-drawer-head">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, "subtitlesTitle"))}</strong>
                    <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
        mode: "lines",
        count: rowCount,
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        language
      }))}</span>
                </div>
                <div class="jpdb-subtitle-drawer-actions">
                    ${renderPanelModeControls("lines", this.hasTranscriptSurface(), language)}
                    ${renderPanelNavigationControls(Boolean(this.video && rowCount), language)}
                    ${renderPanelPlacementControls(this.effectiveTranscriptPlacement, language)}
                    ${renderPausePanelToggle(settings.subtitlePausePanel, language)}
                </div>
            </div>
            <div class="jpdb-subtitle-list-scroll" data-total-rows="${rowCount}"${state2.virtual ? ' data-virtualized="true"' : ""}>
                ${state2.virtual ? this.renderTranscriptVirtualSpacer(state2.virtual.topSpacer) : ""}
                ${state2.rows.length ? state2.rows.map((row, index) => this.renderTranscriptRow(row, rowIndexOffset + index, state2.currentRowIndex)).join("") : this.renderTranscriptWaitingState()}
                ${state2.virtual ? this.renderTranscriptVirtualSpacer(state2.virtual.bottomSpacer) : ""}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeTranscriptPanel"))}"></div>
        `;
    }
    renderTranscriptVirtualSpacer(height) {
      return height > 0 ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>` : "";
    }
    afterTranscriptPanelRender(state2, options = {}) {
      this.indexTranscriptTextTargets();
      this.bindTranscriptScroller();
      this.bindTranscriptResizeHandle();
      this.positionTranscriptPanel({ resizeEventMode: options.deferPlayerResize ? "none" : "immediate" });
      this.restoreTranscriptVirtualScroll(state2);
      this.scrollTranscriptToActive();
      const hydrationIndex = this.transcriptHydrationPreferredIndex(state2);
      this.scheduleTranscriptHydration(hydrationIndex);
      this.scheduleTranscriptCacheWarmup(options.warmupRows ?? state2.warmupRows ?? state2.rows, hydrationIndex);
      this.syncPanelState();
    }
    transcriptHydrationPreferredIndex(state2) {
      return state2.virtual?.start ?? state2.currentRowIndex;
    }
    restoreTranscriptVirtualScroll(state2) {
      if (!state2.virtual) return;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller) return;
      const scrollTop = Math.max(0, state2.virtual.scrollTop);
      if (Math.abs(scroller.scrollTop - scrollTop) > 1) scroller.scrollTop = scrollTop;
      this.transcriptVirtualScrollTop = scrollTop;
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
                    ${this.transcriptRowPeekButton(cue, index, settings)}
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
      if (performance.now() - this.transcriptUserScrollAt < this.transcriptAutoScrollResumeMs()) return;
      if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
      this.transcriptScrollFrame = requestAnimationFrame(() => {
        this.transcriptScrollFrame = void 0;
        if (this.destroyed) return;
        const active = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-row.active");
        if (!active) return;
        this.transcriptProgrammaticScrollUntil = performance.now() + TRANSCRIPT_PROGRAMMATIC_SCROLL_WINDOW_MS;
        active.scrollIntoView?.({ block: "center", inline: "nearest" });
      });
    }
    noteTranscriptScroll() {
      if (performance.now() < this.transcriptProgrammaticScrollUntil) return;
      this.transcriptUserScrollAt = performance.now();
    }
    transcriptAutoScrollResumeMs() {
      const seconds = this.options.getSettings().subtitleTranscriptAutoScrollResumeSeconds;
      return (Number.isFinite(seconds) ? Math.max(1, seconds) : 4) * 1e3;
    }
    bindTranscriptScroller() {
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller || scroller.dataset.transcriptHydrationBound === "true") return;
      scroller.dataset.transcriptHydrationBound = "true";
      scroller.addEventListener("scroll", () => {
        this.noteTranscriptScroll();
        this.scheduleTranscriptHydration();
        this.scheduleTranscriptVirtualRender(scroller);
      }, { passive: true });
    }
    scheduleTranscriptVirtualRender(scroller) {
      if (!this.isTranscriptVirtualScroller(scroller)) return;
      this.transcriptVirtualScrollTop = scroller.scrollTop;
      if (this.transcriptVirtualRenderFrame) return;
      this.transcriptVirtualRenderFrame = requestAnimationFrame(() => {
        this.transcriptVirtualRenderFrame = void 0;
        if (this.destroyed || this.transcriptResizeActive || !this.isTranscriptPanelOpen() || this.panelMode !== "lines") return;
        const state2 = this.transcriptPanelRenderState();
        if (!state2.virtual || state2.signature === this.lastTranscriptSignature) return;
        this.renderTranscriptPanel(true);
      });
    }
    isTranscriptVirtualScroller(scroller) {
      return scroller.dataset.virtualized === "true";
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
      const resizeBounds = transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight());
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = panelRect.width;
      const startHeight = panelRect.height;
      const originalSize = { ...this.transcriptPanelSize };
      this.transcriptResizeActive = true;
      this.alignAfterTranscriptResize = false;
      this.pauseTranscriptBackgroundWorkForResize();
      this.transcriptPanel.classList.add("jpdb-subtitle-resizing");
      this.root?.classList.add("jpdb-subtitle-resizing");
      document.documentElement.classList.add("jpdb-subtitle-transcript-resizing");
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
      }
      let resizeFrame;
      const onMove = (moveEvent) => {
        Object.assign(this.transcriptPanelSize, transcriptResizePatchForPointerDrag({
          bounds: resizeBounds,
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY,
          placement,
          startHeight,
          startWidth,
          startX,
          startY
        }));
        if (resizeFrame !== void 0) return;
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = void 0;
          if (this.destroyed) return;
          this.positionTranscriptPanel({ skipInset: true, skipControlSync: true, skipResizeHandle: true });
        });
      };
      const onUp = (upEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (resizeFrame !== void 0) {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = void 0;
        }
        const distance = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
        if (distance <= 8) {
          Object.assign(this.transcriptPanelSize, originalSize);
          this.finishTranscriptResize();
          this.closeTranscriptPanel();
          return;
        }
        saveTranscriptPanelSize(this.transcriptPanelSize);
        this.positionTranscriptPanel({ realignAfterInset: true, resizeEventMode: "settled" });
        const shouldAlignAfterResize = this.finishTranscriptResize();
        if (shouldAlignAfterResize) this.scheduleAlignToVideo();
      };
      window.addEventListener("pointermove", onMove, this.eventOptions());
      window.addEventListener("pointerup", onUp, this.eventOptions({ once: true }));
    }
    finishTranscriptResize() {
      const shouldAlignAfterResize = this.alignAfterTranscriptResize;
      this.transcriptResizeActive = false;
      this.alignAfterTranscriptResize = false;
      this.transcriptPanel?.classList.remove("jpdb-subtitle-resizing");
      this.root?.classList.remove("jpdb-subtitle-resizing");
      document.documentElement.classList.remove("jpdb-subtitle-transcript-resizing");
      this.resumeTranscriptBackgroundWorkAfterResize();
      return shouldAlignAfterResize;
    }
    pauseTranscriptBackgroundWorkForResize() {
      this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
      this.transcriptHydrationSerial += 1;
      this.transcriptCacheWarmupSerial += 1;
      this.transcriptHydrationAfterResizeIndex = this.activeTranscriptRowIndex();
      this.transcriptWarmupAfterResize = true;
      this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
    }
    resumeTranscriptBackgroundWorkAfterResize() {
      const preferredIndex = this.transcriptHydrationAfterResizeIndex;
      const shouldHydrate = preferredIndex !== void 0;
      const shouldWarmup = this.transcriptWarmupAfterResize;
      this.transcriptHydrationAfterResizeIndex = void 0;
      this.transcriptWarmupAfterResize = false;
      this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
      if (!shouldHydrate && !shouldWarmup) return;
      this.transcriptResizeBackgroundResumeTimer = window.setTimeout(() => {
        this.transcriptResizeBackgroundResumeTimer = void 0;
        if (this.destroyed || this.transcriptResizeActive || !this.canHydrateTranscriptRows()) return;
        const index = preferredIndex ?? this.activeTranscriptRowIndex();
        if (shouldHydrate) this.scheduleTranscriptHydration(index);
        if (shouldWarmup) this.scheduleTranscriptCacheWarmup(this.transcriptRows(), index);
      }, 160);
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
        bounds: transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight()),
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
      const panelRect = layout ? void 0 : this.transcriptPanel?.getBoundingClientRect();
      const metrics = transcriptResizeHandleMetrics({
        bounds: transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight()),
        layout,
        panelRect,
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
      if (this.transcriptResizeActive) {
        this.transcriptHydrationAfterResizeIndex = preferredIndex;
        return;
      }
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
        const parsed = await this.parseCueHtmlBatch(targets.map((target) => target.cue.text), settings, { enrichBeforeRender: true, refreshProvisional: true });
        if (serial !== this.transcriptHydrationSerial) return;
        for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true, force: item.provisional === true });
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
      const key = this.parseCacheKey(cue.text, settings);
      const provisionalNeedsHydration = target.dataset.parsedProvisional === "true" && (this.hasAuthoritativeParseTier() || !this.enrichedProvisionalParsedHtmlKeys.has(key));
      return !provisionalNeedsHydration && hasAttemptedTranscriptParse(target, key) ? null : { cue, target, key };
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
      if (this.transcriptResizeActive) {
        this.transcriptWarmupAfterResize = true;
        return;
      }
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
      const parseOptions = this.transcriptWarmupParseOptions(Math.max(rows.length, this.cues.length));
      const worker = async () => {
        while (cursor < planned.length) {
          if (serial !== this.transcriptCacheWarmupSerial) return;
          const batch = this.nextTranscriptWarmupBatch(planned, () => cursor++);
          if (!batch.length) continue;
          try {
            const parsed = await this.parseCueHtmlBatch(batch.map((item) => item.text), settings, parseOptions);
            if (serial !== this.transcriptCacheWarmupSerial) return;
            for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
          } catch {
          }
          if (cursor < planned.length && cursor > TRANSCRIPT_WARMUP_PRIORITY_ROWS) {
            await waitForBackgroundTranscriptParseTurn(pauseMs);
          }
        }
      };
      const workers = Array.from(
        { length: Math.min(TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY, planned.length) },
        () => worker()
      );
      await Promise.all(workers);
    }
    transcriptWarmupParseOptions(totalRows) {
      if (this.shouldUseCheapYouTubeTranscriptWarmup(totalRows)) {
        return {
          allowProvisional: true,
          authoritativeUpgrade: false,
          enrichBeforeRender: false
        };
      }
      return {
        allowProvisional: false,
        enrichBeforeRender: true
      };
    }
    shouldUseCheapYouTubeTranscriptWarmup(totalRows) {
      return isYouTubePage() && totalRows > TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD;
    }
    nextTranscriptWarmupBatch(planned, takeNextIndex) {
      const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
      const batch = [];
      while (batch.length < batchSize) {
        const item = planned[takeNextIndex()];
        if (!item) break;
        if (this.isWarmParsedCueKey(item.key)) continue;
        batch.push(item);
      }
      return batch;
    }
    transcriptWarmupPlan(rows, preferredIndex, settings) {
      const priority = this.transcriptHydrationIndexes(preferredIndex, rows.length);
      const focusIndex = preferredIndex >= 0 ? preferredIndex : 0;
      const orderedIndexes = transcriptWarmupIndexes(priority, focusIndex, rows.length);
      const limit = this.transcriptBackgroundParseLimit(rows.length);
      const seen = /* @__PURE__ */ new Set();
      const plan = [];
      for (const rowIndex of orderedIndexes) {
        this.addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings);
        if (plan.length >= limit) break;
      }
      return plan;
    }
    transcriptBackgroundParseLimit(rowCount) {
      if (isYouTubePage() && rowCount > TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) {
        return Math.min(YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT, TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS);
      }
      if (isYouTubePage() && rowCount > YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT) {
        return YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
      }
      return TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
    }
    addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings) {
      const text = rows[rowIndex]?.cue.text.trim();
      if (!text) return;
      const key = this.parseCacheKey(text, settings);
      if (seen.has(key) || this.isWarmParsedCueKey(key)) return;
      seen.add(key);
      plan.push({ rowIndex, text, key });
    }
    transcriptBackgroundParsePauseMs() {
      return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }
    updateTranscriptRowsForParseKey(key, html, options = {}) {
      if (this.transcriptResizeActive) {
        this.transcriptWarmupAfterResize = true;
        return;
      }
      const panel = this.updatableTranscriptPanel();
      if (!panel) return;
      const hasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
      const updatedRoots = [];
      for (const target of this.transcriptTextTargetsForParseKey(panel, key)) {
        if (!options.force && !shouldApplyParsedTranscriptHtml(target, key, options.provisional === true)) continue;
        if (hasReaderWords) {
          target.dataset.parsedKey = key;
          if (options.provisional) target.dataset.parsedProvisional = "true";
          else delete target.dataset.parsedProvisional;
          delete target.dataset.parseEmptyKey;
          delete target.dataset.parseEmptyAt;
          delete target.dataset.parseFailedKey;
          delete target.dataset.parseFailedAt;
          setInnerHtml(target, html);
          updatedRoots.push(target);
        } else {
          target.dataset.parseEmptyKey = key;
          target.dataset.parseEmptyAt = String(Date.now());
          delete target.dataset.parsedKey;
          delete target.dataset.parsedProvisional;
          delete target.dataset.parseFailedKey;
          delete target.dataset.parseFailedAt;
        }
      }
      if (updatedRoots.length) this.notifyParsedTokensForKey(key, true, updatedRoots);
    }
    indexTranscriptTextTargets(panel = this.updatableTranscriptPanel()) {
      this.transcriptTextTargetsByParseKey.clear();
      if (!panel) return;
      for (const target of Array.from(panel.querySelectorAll("[data-transcript-text][data-parse-key]"))) {
        const key = target.dataset.parseKey;
        if (!key) continue;
        const targets = this.transcriptTextTargetsByParseKey.get(key);
        if (targets) targets.push(target);
        else this.transcriptTextTargetsByParseKey.set(key, [target]);
      }
    }
    transcriptTextTargetsForParseKey(panel, key) {
      if (!this.transcriptTextTargetsByParseKey.size) this.indexTranscriptTextTargets(panel);
      const targets = this.transcriptTextTargetsByParseKey.get(key) ?? [];
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
      const state2 = subtitleTrackPanelState(this.tracks);
      const settings = this.options.getSettings();
      setInnerHtml(this.transcriptPanel, renderSubtitleTrackPanel({
        ...state2,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        hasNavigableLines: Boolean(this.video && this.cues.length),
        pausePanelEnabled: settings.subtitlePausePanel,
        placement: this.effectiveTranscriptPlacement,
        language: settings.interfaceLanguage,
        animeSearchQuery: subtitleAnimeSearchQuery(this.video)
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
      this.transcriptVirtualScrollTop = 0;
      this.clearTranscriptVirtualRender();
      this.lastDomCaption = "";
      this.pendingDomCaption = void 0;
      this.youtubeDomCaptionFallbackTrackId = "";
      this.lastAutoCopiedCueSignature = "";
      this.lastRenderedPrimaryText = "";
      this.lastRenderedPrimaryHtml = "";
      this.lastAppliedSubtitleHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
      this.lastParseWarmupAnchor = -1;
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
      this.clearAsbPlayerReaderLines();
      this.clearPrimaryTrackLoadingStates();
      this.setNativeTrackModes();
      this.render();
      this.refreshOpenTranscriptPanelAfterPrimaryClear();
      this.syncControls();
      log.info("Primary subtitle track cleared");
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
      if (!this.selectedTrackId) this.clearAsbPlayerReaderLines();
      this.clearSecondaryTrackLoadingStates();
      this.setNativeTrackModes();
      this.render();
      this.refreshOpenTranscriptPanelAfterSecondaryClear();
      this.syncControls();
      log.info("Secondary subtitle track cleared");
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
    clearAsbPlayerReaderLines() {
      let cleared = 0;
      const roots = Array.from(document.querySelectorAll(ASBPLAYER_SUBTITLE_ROOT_SELECTOR));
      for (const root of roots) cleared += unwrapReaderWords(root);
      if (cleared) log.info("Cleared parsed ASBPlayer subtitle lines", { roots: roots.length, cleared });
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
      const viewport = this.transcriptViewportSize();
      const viewportWidth = viewport.width;
      const viewportHeight = viewport.height;
      const settings = this.options.getSettings();
      const reuseDragRect = options.skipInset && this.transcriptLayoutReferenceRect;
      const referenceVideoRect = reuseDragRect ? this.transcriptLayoutReferenceRect : this.transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight);
      const anchorTop = reuseDragRect ? referenceVideoRect.top : this.transcriptAnchorRect().top;
      const layout = this.transcriptDrawerLayout({
        viewportWidth,
        viewportHeight,
        anchorTop,
        compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
        preferredPlacement: settings.subtitleTranscriptPlacement,
        size: this.transcriptPanelSize
      }, referenceVideoRect);
      const placementChanged = layout.placement !== this.effectiveTranscriptPlacement;
      applyTranscriptPanelLayout(panel, layout);
      this.effectiveTranscriptPlacement = layout.placement;
      if (placementChanged) this.syncTranscriptPlacementClass();
      if (!options.skipResizeHandle) this.syncTranscriptResizeHandle(layout);
      if (!options.skipControlSync) this.syncDrawerButtons(this.hasVisibleSubtitleLines());
      const insetChanged = this.applyVideoInsetForTranscriptLayout(layout, referenceVideoRect, {
        resizeEventMode: options.resizeEventMode ?? (this.transcriptPreviewPlayerResizeDeferred ? "none" : options.skipInset ? "settled" : "immediate")
      });
      if (!options.skipInset && options.realignAfterInset && insetChanged) this.scheduleTranscriptPanelRealignAfterInset();
    }
    transcriptDrawerLayout(options, referenceVideoRect) {
      const layoutOptions = this.withConstrainedSideTranscriptSize(options, referenceVideoRect);
      const layout = computeSubtitleDrawerLayout(layoutOptions);
      const resolvedLayout = this.shouldUseBottomTranscriptLayout(layout, referenceVideoRect) ? computeSubtitleDrawerLayout({
        ...layoutOptions,
        compactPanel: true,
        preferredPlacement: "bottom"
      }) : layout;
      return resolvedLayout;
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
    maxSideTranscriptWidthForVideo(_placement, options, videoRect) {
      if (videoRect.width <= 0) return 0;
      const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
      const minimumPlayerWidth = minimumSideTranscriptPlayerWidth(videoRect.width);
      return Math.floor(options.viewportWidth - videoRect.left - margin * 2 - minimumPlayerWidth);
    }
    clampStoredSideWidthForCurrentVideo(placement) {
      const viewport = this.transcriptViewportSize();
      const viewportWidth = viewport.width;
      const constrained = this.constrainedSideTranscriptWidth(placement, {
        viewportWidth,
        viewportHeight: viewport.height,
        anchorTop: this.transcriptAnchorRect().top,
        compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
        preferredPlacement: placement,
        size: this.transcriptPanelSize
      });
      if (constrained !== void 0) this.transcriptPanelSize.sideWidth = constrained;
    }
    transcriptViewportSize() {
      const { width, height } = subtitleVisibleViewportSize();
      return {
        width: Math.max(320, width),
        height: Math.max(240, height)
      };
    }
    transcriptViewportWidth() {
      return this.transcriptViewportSize().width;
    }
    transcriptViewportHeight() {
      return this.transcriptViewportSize().height;
    }
    shouldUseBottomTranscriptLayout(layout, videoRect = this.videoLayoutRect()) {
      if (!isYouTubePage()) return false;
      if (layout.placement === "bottom" || !this.video) return false;
      if (shouldHonorExplicitYouTubeSideLayout(layout)) return false;
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
    handleTranscriptViewportChange(options = {}) {
      this.syncFullscreenState();
      this.resetTranscriptLayoutReference();
      this.scheduleAlignToVideo();
      this.scheduleTranscriptHydration();
      this.scheduleTranscriptCacheWarmup();
      if (options.stabilize) this.scheduleTranscriptViewportStabilizeAlign();
    }
    scheduleTranscriptViewportStabilizeAlign() {
      this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
      this.transcriptViewportStabilizeTimer = window.setTimeout(() => {
        this.transcriptViewportStabilizeTimer = void 0;
        if (this.destroyed) return;
        this.resetTranscriptLayoutReference();
        this.scheduleAlignToVideo();
        this.scheduleTranscriptHydration();
        this.scheduleTranscriptCacheWarmup();
      }, 120);
    }
    resetTranscriptLayoutReference() {
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
    }
    transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight) {
      const current = this.videoInset.measureWithoutInset(this.video, () => this.videoLayoutRect());
      const viewportKey = `${viewportWidth}x${viewportHeight}`;
      const degenerate = current.width < 200 || current.height < 120;
      if (degenerate) return this.transcriptLayoutReferenceRect ?? current;
      if (!this.transcriptLayoutReferenceRect || this.transcriptLayoutReferenceViewport !== viewportKey || current.width > this.transcriptLayoutReferenceRect.width + 20 || current.height > this.transcriptLayoutReferenceRect.height + 20) {
        this.transcriptLayoutReferenceRect = current;
        this.transcriptLayoutReferenceViewport = viewportKey;
      }
      return this.transcriptLayoutReferenceRect;
    }
    applyVideoInsetForTranscriptLayout(layout, videoRect = this.videoLayoutRect(), options = {}) {
      if (!this.video) {
        this.clearVideoInsetForTranscriptPanel();
        return false;
      }
      if (layout.placement === "bottom") {
        return this.applyPageVideoInset("bottom", layout.top - videoRect.top - layout.margin, layout.height, videoRect, options);
      }
      const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
      return this.applyPageVideoInset(layout.placement, Math.max(0, availableWidth), layout.width, videoRect, options);
    }
    availablePlayerWidthForSideLayout(layout, videoRect) {
      const viewportWidth = this.transcriptViewportWidth();
      return layout.placement === "left" ? viewportWidth - (layout.left + layout.width + layout.margin * 2) : layout.left - videoRect.left - layout.margin;
    }
    syncFullscreenState() {
      const fullscreenElement = currentFullscreenElement();
      const fullscreenHost = this.subtitleFullscreenHost(fullscreenElement);
      this.fullscreen = Boolean(fullscreenElement || fullscreenHost || videoIsInNativeFullscreen(this.video));
      this.syncSubtitleRootParent(fullscreenHost);
      document.documentElement.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      this.root?.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
    }
    syncSubtitleRootParent(fullscreenHost = this.subtitleFullscreenHost()) {
      if (!this.root) return;
      const parent = !fullscreenHost || fullscreenHost === document.documentElement ? document.body : fullscreenHost;
      if (this.root.parentElement === parent) return;
      parent.appendChild(this.root);
    }
    subtitleFullscreenHost(fullscreenElement = currentFullscreenElement()) {
      if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement)) return fullscreenElement;
      const youtubeHost = youtubeFullscreenHostForVideo(this.video);
      if (youtubeHost) return youtubeHost;
      if (fullscreenElement instanceof HTMLVideoElement && fullscreenElement === this.video) {
        const target = subtitleVideoLayoutTarget(this.video);
        return target && target !== this.video ? target : null;
      }
      return null;
    }
    shouldHostSubtitleRootInFullscreenElement(fullscreenElement) {
      return Boolean(fullscreenElement instanceof HTMLElement && !(fullscreenElement instanceof HTMLVideoElement) && this.video && fullscreenElement.contains(this.video));
    }
    scheduleAlignToVideo() {
      if (this.transcriptResizeActive) {
        this.alignAfterTranscriptResize = true;
        return;
      }
      if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
      this.alignFrame = requestAnimationFrame(() => {
        this.alignFrame = void 0;
        if (this.destroyed) return;
        this.alignToVideo();
      });
    }
    videoLayoutRect() {
      const fullscreenHost = this.subtitleFullscreenHost();
      if (fullscreenHost) {
        if (fullscreenHost === document.documentElement) return subtitleViewportRect();
        const rect = fullscreenHost.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1 ? rect : subtitleViewportRect();
      }
      if (videoIsInNativeFullscreen(this.video)) return subtitleViewportRect();
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
      return this.videoInset.clear(this.video);
    }
    applyPageVideoInset(side, playerSize, panelSize, videoRect = this.videoLayoutRect(), options = {}) {
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return false;
      }
      const panelRect = panelSize === void 0 ? this.transcriptPanel?.getBoundingClientRect() : void 0;
      return this.videoInset.apply({
        video: this.video,
        side,
        playerSize,
        panelSize: panelSize ?? ((side === "bottom" ? panelRect?.height : panelRect?.width) ?? 0),
        videoRect,
        margin: TRANSCRIPT_PANEL_MARGIN,
        resizeEventMode: options.resizeEventMode
      });
    }
  }
  function shouldHonorExplicitYouTubeSideLayout(layout) {
    return layout.margin > 0 && layout.viewportWidth >= 900;
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
  function youTubeChannelListSignature() {
    const handles = YOUTUBE_CHANNEL_RECOMMENDATIONS.map((channel) => channel.handle.toLowerCase()).sort();
    return `${handles.length}:${stableHashBase36(handles.join("|"))}`;
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
  const YOUTUBE_UNRENDERED_SLOT_CLASS = "jpdb-youtube-unrendered-slot";
  const YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE = 3;
  const YOUTUBE_SHELF_BACKFILL_MAX_PAGES = 4;
  const YOUTUBE_SHELF_BACKFILL_THROTTLE_MS = 1500;
  const YOUTUBE_RENDERED_SLOT_SELECTOR = "ytd-rich-grid-media, ytd-rich-grid-slim-media, yt-lockup-view-model, ytm-shorts-lockup-view-model";
  const YOUTUBE_PENDING_CLASS = "jpdb-youtube-filter-pending";
  const YOUTUBE_FIRST_IN_ROW_CLASS = "jpdb-youtube-first-in-row";
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
  const CHANNEL_LISTING_CONTENT_SELECTOR = "ytd-channel-renderer,ytd-grid-channel-renderer,ytm-channel-list-item-renderer,ytm-compact-channel-renderer";
  const SHORTS_WATCH_ITEM_SELECTOR = "ytd-shorts,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2";
  const YT_TITLE = 0;
  const YT_EXPANDED = 1;
  const YT_COMPACT = 2;
  const YT_RECOMMENDATIONS = 3;
  const YT_SUBSCRIBE_VISIBLE = 4;
  const YT_SUBSCRIBE_ALL = 5;
  const YT_ALL_SUBSCRIBED = 6;
  const YT_BROWSE_ALL = 7;
  const YT_COLLAPSE = 8;
  const YT_SUBSCRIBE = 9;
  const YT_SUBSCRIBED = 10;
  const YT_SUBSCRIBE_TO = 11;
  const YT_SUBSCRIBED_TO = 12;
  const YT_ALREADY_SUBSCRIBED = 13;
  const YT_PARTIAL_STATUS = 14;
  const YT_STATUS_ONE = 15;
  const YT_STATUS_MANY = 16;
  const YOUTUBE_SHELF_COPY = {
    en: [
      "Start your Japanese YouTube feed",
      "{shown} shown from {total} curated channels.",
      "{total} curated channels, shown as compact YouTube-style rows.",
      "Japanese channel recommendations",
      "Subscribe visible ({count})",
      "Subscribe all {count}",
      "All {total} subscribed",
      "Browse all channels",
      "Collapse",
      "Subscribe",
      "Subscribed",
      "Subscribe to {name}",
      "Subscribed to {name}",
      "All of these channels are already subscribed.",
      "Subscribed to {subscribed}; {failed} could not be completed by YouTube.",
      "Subscribed to {count} channel.",
      "Subscribed to {count} channels."
    ],
    ja: [
      "日本語YouTubeを始める",
      "{shown}/{total}件を表示",
      "厳選{total}件を表示",
      "日本語チャンネル",
      "表示中を登録({count})",
      "全{count}件登録",
      "{total}件すべて登録済み",
      "すべて見る",
      "折りたたむ",
      "登録",
      "登録済み",
      "{name}を登録",
      "{name}を登録済み",
      "すべて登録済みです。",
      "{subscribed}件登録、{failed}件失敗。",
      "{count}件登録しました。",
      "{count}件登録しました。"
    ]
  };
  const COMMUNITY_POST_SELECTOR = "ytd-post-renderer,ytd-backstage-post-thread-renderer,ytm-backstage-post-thread-renderer,ytm-post-renderer,ytm-backstage-post-renderer";
  const COMMUNITY_POST_TEXT_SELECTOR = '#content-text,[class*="BackstagePostRendererHostContentText"]';
  const TITLE_SELECTORS = [
    "#video-title",
    "a#video-title",
    "yt-formatted-string#video-title",
    "h3 a",
    "h3",
    "ytd-reel-player-overlay-renderer h2.title",
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
  const YOUTUBE_VISIBLE_BACKFILL_TARGET = 24;
  const YOUTUBE_BACKFILL_THROTTLE_MS = 1200;
  const YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS = 800;
  const YOUTUBE_SHORTS_ADVANCE_RETRY_MS = 1e3;
  const YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY = "--yomu-youtube-filter-card-height";
  const YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT = 8;
  const YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT = 8;
  const YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY = "yomu:youtube-all-subscribed:v1";
  const YOUTUBE_CHANNEL_SHELF_PREVIEW_BACKFILL_DELAY_MS = 250;
  const YOUTUBE_CHANNEL_SUBSCRIPTION_PROBE_DELAY_MS = 250;
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
  function isInsideReaderRoot(node) {
    if (node instanceof Element) return Boolean(node.closest(YOUTUBE_READER_ROOT_SELECTOR));
    if (node instanceof Node) return Boolean(node.parentElement?.closest(YOUTUBE_READER_ROOT_SELECTOR));
    return false;
  }
  function youtubeShelfText(language, key, values = {}) {
    const copy = YOUTUBE_SHELF_COPY[language === "ja" ? "ja" : "en"][key];
    return copy.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ""));
  }
  function collectYouTubeVideoCards(root = document) {
    if (isInsideReaderRoot(root)) return [];
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
    noticeRouteKey = "";
    channelShelfRouteKey = "";
    channelShelfExpanded = false;
    channelShelfFilter = "all";
    subscriptionBusy = false;
    channelShelfStatusOverride = "";
    lastBackfillAt = Number.NEGATIVE_INFINITY;
    lastScrollAt = Number.NEGATIVE_INFINITY;
    destroyed = true;
    oembedTitleCache = /* @__PURE__ */ new Map();
    pendingOembedTitles = /* @__PURE__ */ new Set();
    channelPreviewCache = /* @__PURE__ */ new Map();
    channelIdCache = /* @__PURE__ */ new Map();
    pendingChannelPreviews = /* @__PURE__ */ new Set();
    channelPreviewBackfillQueue = [];
    channelPreviewBackfillTimer;
    cardTimers = /* @__PURE__ */ new WeakMap();
    compactChannelPool = randomStarterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
    subscribedChannelHandles = /* @__PURE__ */ new Set();
    // Channels whose id can no longer be resolved (deleted/moved/renamed). Kept
    // separate so a dead channel never blocks the "all subscribed" state.
    unresolvableChannelHandles = /* @__PURE__ */ new Set();
    // Once every channel is subscribed (or unresolvable) we stop re-testing
    // subscription status on each shelf render. Persisted, keyed by the channel
    // list signature so editing the list re-tests against the new set.
    channelsAllSubscribed = false;
    channelSubscriptionStateLoaded = false;
    channelSubscriptionProbeComplete = false;
    channelSubscriptionProbeQueue = [];
    channelSubscriptionProbeTimer;
    channelShelfRefreshTimer;
    channelShelfRenderSignature = "";
    lastShelfBackfillAt = 0;
    lastAdvancedShortKey = "";
    lastShortAdvanceAt = Number.NEGATIVE_INFINITY;
    // Already-subscribed channels never belong in the suggestions; the pool
    // backfills the compact view so subscribing keeps the shelf full.
    get compactChannelRecommendations() {
      return this.unsubscribedChannels(this.compactChannelPool).slice(0, YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
    }
    unsubscribedChannels(channels) {
      return channels.filter((channel) => !this.subscribedChannelHandles.has(channel.handle));
    }
    loadChannelSubscriptionState() {
      if (this.channelSubscriptionStateLoaded) return;
      this.channelSubscriptionStateLoaded = true;
      const stored = gmStorageGetSync(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY, null);
      if (stored?.signature === youTubeChannelListSignature()) {
        this.channelsAllSubscribed = true;
        for (const channel of allYouTubeChannelRecommendations()) this.subscribedChannelHandles.add(channel.handle);
      } else if (stored) {
        gmStorageDeleteSync(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY);
      }
    }
    // Persist the "all subscribed" flag once every channel is subscribed or
    // unresolvable (deleted/moved/renamed), so the shelf stops re-testing
    // subscription status on every render. A dead channel never blocks this.
    markChannelSubscriptionCompleteIfReady(options = {}) {
      if (this.channelsAllSubscribed) {
        this.channelSubscriptionProbeComplete = true;
        this.clearChannelSubscriptionProbe();
        if (!options.keepShelf) {
          this.clearChannelShelfRefresh();
          this.removeChannelShelf();
        }
        return;
      }
      const settled = (handle) => this.subscribedChannelHandles.has(handle) || this.unresolvableChannelHandles.has(handle);
      if (!allYouTubeChannelRecommendations().every((channel) => settled(channel.handle))) return;
      this.channelsAllSubscribed = true;
      this.channelSubscriptionProbeComplete = true;
      this.clearChannelSubscriptionProbe();
      gmStorageSetSync(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY, { signature: youTubeChannelListSignature() });
      if (!options.keepShelf) {
        this.clearChannelShelfRefresh();
        this.removeChannelShelf();
      }
    }
    init() {
      this.destroy();
      this.destroyed = false;
      if (!this.isActivePage() || !document.body || !this.options.getSettings().youtubeImmersionEnabled) {
        this.destroyed = true;
        return;
      }
      this.loadChannelSubscriptionState();
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
        // is-in-first-column: YouTube re-asserts its row-layout flags on
        // its own layout passes (continuation loads, resizes) without any
        // childList change; without watching it the grid rebalance never
        // re-runs and stale flags misalign re-flowed rows (gap bug).
        attributeFilter: ["href", "title", "aria-label", "is-in-first-column"],
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
      this.restoreCurrentShortsWatchItem();
      this.advancePastFilteredActiveShort();
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
      const postText = youTubeCommunityPostText(card);
      if (postText !== null) {
        return visibleYouTubeFilterCandidate({ card, title: postText, videoId: "" }, postText);
      }
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
      this.syncEmptiedRichSections();
      syncUnrenderedYouTubeShelfSlots();
      this.backfillSparseShelves();
      rebalanceYouTubeGridRows();
    }
    // UT-26 remainder: after filtering, a shelf can be left with one or two
    // visible items because YouTube only hydrates carousel slots when the
    // shelf is PAGED. When a visible shelf runs sparse, page it forward
    // (its next arrow hydrates the following slots) so the filter has more
    // candidates to keep. Capped per shelf and throttled so a genuinely
    // non-Japanese shelf cannot be paged forever or fight the user.
    backfillSparseShelves() {
      const now = performance.now();
      if (now - this.lastShelfBackfillAt < YOUTUBE_SHELF_BACKFILL_THROTTLE_MS) return;
      for (const shelf of collectFilterableVideoShelves()) {
        const cards = collectYouTubeVideoCards(shelf);
        if (!cards.length) continue;
        const visible = cards.filter((card) => !card.classList.contains(YOUTUBE_FILTERED_CLASS) && !card.classList.contains(YOUTUBE_PENDING_CLASS) && !card.classList.contains(YOUTUBE_UNRENDERED_SLOT_CLASS)).length;
        const perRow = Number(shelf.getAttribute("elements-per-row") ?? shelf.querySelector("[items-per-row]")?.getAttribute("items-per-row") ?? "");
        const target = Number.isFinite(perRow) && perRow > 0 ? Math.min(Math.max(Math.round(perRow), YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE), 8) : YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE;
        if (visible >= target) continue;
        const pages = Number(shelf.dataset.yomuShelfBackfillPages ?? "0");
        if (pages >= YOUTUBE_SHELF_BACKFILL_MAX_PAGES) continue;
        const expand = shelf.hasAttribute("is-truncated") ? shelf.querySelector("div#dismissible ytd-button-renderer button") : null;
        const next = expand ?? shelf.querySelector('#right-arrow button, button[aria-label="Next"]');
        if (!next || next.disabled) continue;
        shelf.dataset.yomuShelfBackfillPages = String(pages + 1);
        this.lastShelfBackfillAt = now;
        next.click();
        return;
      }
    }
    // A rich section whose entire filterable content is hidden must take its
    // wrapper with it: the empty ytd-rich-section-renderer otherwise keeps its
    // padding/margins as a full-width gap band in the feed.
    syncEmptiedRichSections() {
      document.querySelectorAll("ytd-rich-section-renderer").forEach((section) => {
        const hidden = section.querySelectorAll(`.${YOUTUBE_FILTERED_CLASS}`).length;
        if (!hidden) return;
        const visibleContent = collectYouTubeVideoCards(section).some((card) => !card.classList.contains(YOUTUBE_FILTERED_CLASS));
        const visibleShelf = Array.from(section.querySelectorAll(SHELF_SELECTOR)).some((shelf) => !shelf.classList.contains(YOUTUBE_FILTERED_CLASS));
        if (!visibleContent && !visibleShelf) this.hideCard(section);
        else this.showCard(section);
      });
    }
    advancePastFilteredShort(shortKey = currentYouTubeShortsVideoId() || location.pathname) {
      const advanceKey = `${location.pathname}:${shortKey}`;
      const now = performance.now();
      if (this.lastAdvancedShortKey === advanceKey) {
        const sinceAdvance = now - this.lastShortAdvanceAt;
        if (sinceAdvance < YOUTUBE_SHORTS_ADVANCE_RETRY_MS) {
          this.schedule(Math.ceil(YOUTUBE_SHORTS_ADVANCE_RETRY_MS - sinceAdvance) + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
          return;
        }
      }
      const throttleRemaining = YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS - (now - this.lastShortAdvanceAt);
      if (throttleRemaining > 0) {
        this.schedule(Math.ceil(throttleRemaining) + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
        return;
      }
      const next = document.querySelector(
        'ytd-shorts #navigation-button-down button, [aria-label="次の動画"], [aria-label="Next video"], shorts-carousel .ytShortsCarouselShortsA11yNavButton:not([disabled]):last-child'
      );
      if (!next) return;
      this.lastAdvancedShortKey = advanceKey;
      this.lastShortAdvanceAt = now;
      next.click();
      this.schedule(YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
    }
    // Shorts watch player (2026): the active reel lives in a JS carousel —
    // mobile is shorts-page > shorts-carousel, desktop (and iPad's
    // "Request Desktop Website") is ytd-shorts > ytd-reel-video-renderer. The
    // per-card title for the active reel is unreliable: it lags a reel behind
    // the URL, and under a non-English UI locale YouTube auto-translates it into
    // the UI language so an English short looks Japanese. Classify the ACTIVE
    // short from the URL video id + its ORIGINAL (oEmbed/tab) title instead, on
    // both platforms, and step past it when it would have been hidden.
    advancePastFilteredActiveShort() {
      if (!isYouTubeShortsWatchPage()) return;
      const overlay = document.querySelector("ytd-shorts, shorts-page, shorts-carousel, shorts-video");
      if (!overlay) return;
      const videoId = currentYouTubeShortsVideoId();
      if (!videoId) return;
      const title = activeShortsTitle();
      const resolvedTitle = this.resolveTitleForFiltering({ card: overlay, title, videoId });
      const candidate = {
        card: overlay,
        title: resolvedTitle,
        videoId,
        filterText: resolvedTitle,
        alwaysHidden: false
      };
      const decision = classifyYouTubeFilterCandidates([candidate], { revealed: this.revealed }).decisions[0];
      if (decision?.kind === "hide") this.advancePastFilteredShort(videoId || resolvedTitle || title);
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
      withFeedScrollAnchor(card, () => {
        card.classList.add(YOUTUBE_FILTERED_CLASS);
        card.dataset.yomuYoutubeFiltered = "true";
      });
      if (!card.hasAttribute("aria-hidden")) card.dataset.yomuYoutubeAriaHidden = "true";
      card.setAttribute("aria-hidden", "true");
      this.queueFilteredCardCollapse(card, this.filteredCardCollapseDelay());
    }
    showCard(card) {
      this.clearCardTimers(card);
      this.clearPendingCard(card);
      withFeedScrollAnchor(card, () => {
        card.classList.remove(YOUTUBE_FILTERED_CLASS, YOUTUBE_COLLAPSING_CLASS, YOUTUBE_COLLAPSED_CLASS);
      });
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
      if (shouldHidePendingYouTubeCard(card)) {
        card.dataset.yomuYoutubePendingHidden = "true";
      } else {
        delete card.dataset.yomuYoutubePendingHidden;
      }
    }
    clearPendingCard(card) {
      card.classList.remove(YOUTUBE_PENDING_CLASS);
      delete card.dataset.yomuYoutubePending;
      delete card.dataset.yomuYoutubePendingHidden;
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
      const key = this.revealed ? "youtubeFilterShowing" : "youtubeFilterHid";
      return formatYoutubeText(uiText(settings.interfaceLanguage, key), {
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
      if (this.channelsAllSubscribed) {
        this.removeChannelShelf();
        return;
      }
      const recommendations = this.currentChannelRecommendations();
      this.hydrateChannelPreviewCandidates(recommendations);
      this.ensureChannelSubscriptionProbe();
      if (!this.unsubscribedChannels(allYouTubeChannelRecommendations()).length) {
        this.removeChannelShelf();
        return;
      }
      const renderableRecommendations = this.renderableChannelRecommendations(recommendations);
      if (!renderableRecommendations.length) {
        this.removeChannelShelf();
        return;
      }
      this.currentChannelShelfScope();
      const shelf = this.ensureChannelShelf();
      const elements = this.channelShelfElements(shelf);
      this.renderChannelShelf(elements, renderableRecommendations);
      this.placeChannelShelf(shelf);
    }
    shouldShowChannelShelf(filteredCount, settings) {
      if (!settings.youtubeShowChannelRecommendations) return false;
      if (this.revealed) return false;
      if (!shouldShowChannelRecommendationsForRoute()) return false;
      if (isYouTubeHomePage()) return false;
      return filteredCount > 0;
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
      shelf.setAttribute("aria-label", youtubeShelfText(this.options.getSettings().interfaceLanguage, YT_RECOMMENDATIONS));
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
        never: shelf.querySelector('[data-yomu-youtube-channel-action="never"]')
      };
    }
    renderChannelShelf(elements, recommendations = this.renderableChannelRecommendations(this.currentChannelRecommendations())) {
      const renderedRecommendations = recommendations.slice(0, this.channelShelfExpanded ? YOUTUBE_CHANNEL_RECOMMENDATION_COUNT : YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
      const signature = this.channelShelfStructuralSignature(recommendations, renderedRecommendations);
      this.updateChannelShelfChrome(elements, recommendations, renderedRecommendations);
      if (signature === this.channelShelfRenderSignature) {
        this.setChannelShelfBusy(this.subscriptionBusy);
        this.syncChannelShelfTheme();
        this.hydrateRenderedChannelPreviews(renderedRecommendations);
        return;
      }
      this.channelShelfRenderSignature = signature;
      this.channelShelf?.classList.toggle("is-expanded", this.channelShelfExpanded);
      this.renderChannelFilters(elements.filters);
      elements.list.replaceChildren(...renderedRecommendations.map((channel) => this.renderChannelRow(channel)));
      this.setChannelShelfBusy(this.subscriptionBusy);
      this.syncChannelShelfTheme();
      if (this.channelShelf) this.options.parseShelfJapanese?.(this.channelShelf);
      this.hydrateRenderedChannelPreviews(renderedRecommendations);
    }
    updateChannelShelfChrome(elements, recommendations, renderedRecommendations) {
      const language = this.options.getSettings().interfaceLanguage;
      elements.title.textContent = youtubeShelfText(language, YT_TITLE);
      elements.copy.textContent = this.channelShelfExpanded ? youtubeShelfText(language, YT_EXPANDED, {
        shown: recommendations.length,
        total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT
      }) : youtubeShelfText(language, YT_COMPACT, { total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT });
      const remainingChannels = this.unsubscribedChannels(allYouTubeChannelRecommendations()).length;
      elements.subscribeVisible.textContent = youtubeShelfText(language, YT_SUBSCRIBE_VISIBLE, { count: renderedRecommendations.length });
      elements.subscribeVisible.hidden = !renderedRecommendations.length;
      elements.subscribeAll.textContent = remainingChannels ? youtubeShelfText(language, YT_SUBSCRIBE_ALL, { count: remainingChannels }) : youtubeShelfText(language, YT_ALL_SUBSCRIBED, { total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT });
      elements.never.textContent = uiText(language, "hide");
      elements.expand.textContent = youtubeShelfText(language, this.channelShelfExpanded ? YT_COLLAPSE : YT_BROWSE_ALL);
      elements.expand.setAttribute("aria-expanded", String(this.channelShelfExpanded));
      if (!this.subscriptionBusy) elements.status.textContent = this.channelShelfStatusOverride;
    }
    channelShelfStructuralSignature(recommendations, renderedRecommendations) {
      return [
        this.channelShelfExpanded ? "expanded" : "compact",
        this.channelShelfFilter,
        recommendations.map((channel) => channel.handle).join(""),
        renderedRecommendations.map((channel) => channel.handle).join("")
      ].join("");
    }
    // m.youtube.com does not use the desktop html[dark] attribute, so detect
    // the page theme from the rendered background and mirror it on the shelf.
    syncChannelShelfTheme() {
      if (!this.channelShelf) return;
      this.channelShelf.classList.toggle("is-dark", youtubePageUsesDarkTheme());
    }
    currentChannelRecommendations() {
      return this.channelShelfExpanded ? this.unsubscribedChannels(filterYouTubeChannelRecommendations(this.channelShelfFilter)) : this.compactChannelRecommendations;
    }
    renderableChannelRecommendations(channels) {
      if (!readYouTubeClientConfig()) return channels;
      return channels.filter((channel) => this.isKnownUnsubscribedChannel(channel));
    }
    isKnownUnsubscribedChannel(channel) {
      if (this.subscribedChannelHandles.has(channel.handle) || this.unresolvableChannelHandles.has(channel.handle)) return false;
      if (!this.channelPreviewCache.has(channel.handle)) return false;
      return this.channelPreviewCache.get(channel.handle)?.subscribed === false;
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
      description.className = "jpdb-youtube-channel-description jpdb-reader-parseable";
      description.textContent = youtubeChannelRecommendationDescription(channel);
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
      const language = this.options.getSettings().interfaceLanguage;
      subscribe.textContent = youtubeShelfText(language, YT_SUBSCRIBE);
      subscribe.setAttribute("aria-label", youtubeShelfText(language, YT_SUBSCRIBE_TO, { name: channel.name }));
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
        case "never":
          this.options.setShowChannelRecommendations?.(false);
          this.clearChannelShelfRefresh();
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
          void this.subscribeToChannels(this.unsubscribedChannels(allYouTubeChannelRecommendations()));
          return;
      }
    }
    subscribeToChannelHandle(handle) {
      const channel = allYouTubeChannelRecommendations().find((candidate) => candidate.handle === handle);
      if (channel) void this.subscribeToChannels([channel]);
    }
    currentRenderedChannels() {
      if (!this.channelShelfExpanded) return this.compactChannelRecommendations;
      return this.unsubscribedChannels(filterYouTubeChannelRecommendations(this.channelShelfFilter));
    }
    hydrateRenderedChannelPreviews(channels) {
      this.hydrateChannelPreviewCandidates(channels);
      if (!this.channelShelfExpanded) {
        this.clearChannelPreviewBackfill();
        return;
      }
      const missing = this.missingChannelPreviewCandidates(channels);
      this.channelPreviewBackfillQueue = missing.slice(YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT);
      this.scheduleChannelPreviewBackfill();
    }
    hydrateChannelPreviewCandidates(channels) {
      if (this.channelsAllSubscribed) return;
      const missing = this.missingChannelPreviewCandidates(channels);
      void this.hydrateChannelPreviews(missing.slice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT));
    }
    missingChannelPreviewCandidates(channels) {
      return channels.filter((channel) => !this.channelPreviewCache.has(channel.handle) && !this.pendingChannelPreviews.has(channel.handle) && !this.subscribedChannelHandles.has(channel.handle) && !this.unresolvableChannelHandles.has(channel.handle));
    }
    ensureChannelSubscriptionProbe() {
      if (this.channelsAllSubscribed || this.channelSubscriptionProbeComplete || !readYouTubeClientConfig()) return;
      this.updateChannelSubscriptionProbeState();
      if (this.channelSubscriptionProbeComplete || this.channelSubscriptionProbeTimer !== void 0 || this.channelSubscriptionProbeQueue.length) return;
      this.channelSubscriptionProbeQueue = this.missingChannelPreviewCandidates(allYouTubeChannelRecommendations());
      this.scheduleChannelSubscriptionProbeBatch(0);
    }
    scheduleChannelSubscriptionProbeBatch(delayMs = YOUTUBE_CHANNEL_SUBSCRIPTION_PROBE_DELAY_MS) {
      if (!this.channelSubscriptionProbeQueue.length) {
        this.updateChannelSubscriptionProbeState();
        return;
      }
      window.clearTimeout(this.channelSubscriptionProbeTimer);
      this.channelSubscriptionProbeTimer = window.setTimeout(() => {
        this.channelSubscriptionProbeTimer = void 0;
        if (this.destroyed || this.channelsAllSubscribed) return;
        const batch = this.channelSubscriptionProbeQueue.splice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT).filter((channel) => !this.channelPreviewCache.has(channel.handle) && !this.pendingChannelPreviews.has(channel.handle));
        void this.hydrateChannelPreviews(batch);
        this.scheduleChannelSubscriptionProbeBatch();
      }, delayMs);
    }
    updateChannelSubscriptionProbeState() {
      const settled = (channel) => this.subscribedChannelHandles.has(channel.handle) || this.unresolvableChannelHandles.has(channel.handle) || this.channelPreviewCache.has(channel.handle);
      if (!allYouTubeChannelRecommendations().every(settled)) return;
      this.channelSubscriptionProbeComplete = true;
      this.markChannelSubscriptionCompleteIfReady();
    }
    scheduleChannelPreviewBackfill() {
      if (!this.channelPreviewBackfillQueue.length || this.channelPreviewBackfillTimer !== void 0) return;
      this.channelPreviewBackfillTimer = window.setTimeout(() => {
        this.channelPreviewBackfillTimer = void 0;
        if (this.destroyed || !this.channelShelf?.isConnected || !this.channelShelfExpanded) {
          this.clearChannelPreviewBackfill();
          return;
        }
        const batch = this.channelPreviewBackfillQueue.splice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT).filter((channel) => !this.channelPreviewCache.has(channel.handle) && !this.pendingChannelPreviews.has(channel.handle));
        void this.hydrateChannelPreviews(batch);
        this.scheduleChannelPreviewBackfill();
      }, YOUTUBE_CHANNEL_SHELF_PREVIEW_BACKFILL_DELAY_MS);
    }
    clearChannelPreviewBackfill() {
      window.clearTimeout(this.channelPreviewBackfillTimer);
      this.channelPreviewBackfillTimer = void 0;
      this.channelPreviewBackfillQueue = [];
    }
    async hydrateChannelPreviews(channels) {
      const config = readYouTubeClientConfig();
      if (!config) return;
      for (const channel of channels) {
        if (this.channelPreviewCache.has(channel.handle) || this.pendingChannelPreviews.has(channel.handle)) continue;
        this.pendingChannelPreviews.add(channel.handle);
        void fetchYouTubeChannelPreview(channel, config, this.channelIdCache).then((preview) => {
          if (this.destroyed) return;
          this.channelPreviewCache.set(channel.handle, preview);
          if (preview?.channelId) this.channelIdCache.set(channel.handle, preview.channelId);
          if (preview?.subscribed) {
            this.subscribedChannelHandles.add(channel.handle);
            this.markChannelSubscriptionCompleteIfReady();
            this.scheduleChannelShelfRefresh(0);
            return;
          }
          if (!preview && this.channelIdCache.has(channel.handle) && this.channelIdCache.get(channel.handle) === null) {
            this.unresolvableChannelHandles.add(channel.handle);
            this.markChannelSubscriptionCompleteIfReady();
          }
          this.updateRenderedChannelPreview(channel);
          this.updateChannelSubscriptionProbeState();
          this.scheduleChannelShelfRefresh(0);
        }).catch(() => {
          if (this.destroyed) return;
          this.channelPreviewCache.set(channel.handle, null);
          this.updateChannelSubscriptionProbeState();
          this.scheduleChannelShelfRefresh(0);
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
      if (this.channelShelf) this.options.parseShelfJapanese?.(this.channelShelf);
    }
    async subscribeToChannels(channels) {
      if (this.subscriptionBusy) return;
      const elements = this.channelShelfElements(this.ensureChannelShelf());
      if (!channels.length) {
        this.setChannelShelfStatus(elements, youtubeShelfText(this.options.getSettings().interfaceLanguage, YT_ALREADY_SUBSCRIBED));
        return;
      }
      const config = readYouTubeClientConfig();
      if (!config) {
        this.setChannelShelfStatus(elements, "YouTube session data is not available on this page yet.");
        return;
      }
      if (!youTubeSapisidCookie()) {
        this.setChannelShelfStatus(elements, "Sign in to YouTube to subscribe to channels.");
        return;
      }
      this.channelShelfStatusOverride = "";
      this.clearChannelPreviewBackfill();
      this.clearChannelSubscriptionProbe();
      this.subscriptionBusy = true;
      this.setChannelShelfBusy(true);
      let subscribed = 0;
      let failed = 0;
      for (let index = 0; index < channels.length; index += 1) {
        const channel = channels[index];
        elements.status.textContent = `Subscribing ${index + 1}/${channels.length}: ${channel.name}`;
        try {
          const channelId = await resolveYouTubeChannelId(channel, config, this.channelIdCache);
          if (!channelId) {
            this.unresolvableChannelHandles.add(channel.handle);
            throw new Error("Missing YouTube channel id.");
          }
          await subscribeYouTubeChannel(channelId, config);
          subscribed += 1;
          this.markChannelRowSubscribed(channel);
        } catch {
          failed += 1;
        }
      }
      this.markChannelSubscriptionCompleteIfReady({ keepShelf: true });
      this.subscriptionBusy = false;
      this.setChannelShelfBusy(false);
      const language = this.options.getSettings().interfaceLanguage;
      this.setChannelShelfStatus(elements, failed ? youtubeShelfText(language, YT_PARTIAL_STATUS, { subscribed, failed }) : youtubeShelfText(language, subscribed === 1 ? YT_STATUS_ONE : YT_STATUS_MANY, { count: subscribed }));
      if (subscribed) this.scheduleChannelShelfRefresh();
    }
    setChannelShelfStatus(elements, status) {
      this.channelShelfStatusOverride = status;
      elements.status.textContent = status;
    }
    // Show the confirmation in place first (button flips to "Subscribed", the
    // live status announces it), then let the refresh swap the row for the
    // next unsubscribed suggestion.
    markChannelRowSubscribed(channel) {
      this.subscribedChannelHandles.add(channel.handle);
      const row = Array.from(this.channelShelf?.querySelectorAll("[data-yomu-channel-handle]") ?? []).find((candidate) => candidate.dataset.yomuChannelHandle === channel.handle);
      const button = row?.querySelector('[data-yomu-youtube-channel-action="subscribe-one"]');
      row?.classList.add("is-subscribed");
      if (!button) return;
      button.disabled = true;
      const language = this.options.getSettings().interfaceLanguage;
      button.textContent = youtubeShelfText(language, YT_SUBSCRIBED);
      button.setAttribute("aria-label", youtubeShelfText(language, YT_SUBSCRIBED_TO, { name: channel.name }));
    }
    scheduleChannelShelfRefresh(delayMs = 1800) {
      window.clearTimeout(this.channelShelfRefreshTimer);
      this.channelShelfRefreshTimer = window.setTimeout(() => {
        this.channelShelfRefreshTimer = void 0;
        if (this.channelsAllSubscribed) {
          this.removeChannelShelf();
          return;
        }
        if (this.channelShelf?.isConnected) {
          const recommendations = this.renderableChannelRecommendations(this.currentChannelRecommendations());
          if (recommendations.length) this.renderChannelShelf(this.channelShelfElements(this.channelShelf), recommendations);
          else this.schedule(0);
          return;
        }
        this.schedule(0);
      }, delayMs);
    }
    clearChannelShelfRefresh() {
      window.clearTimeout(this.channelShelfRefreshTimer);
      this.channelShelfRefreshTimer = void 0;
    }
    clearChannelSubscriptionProbe() {
      window.clearTimeout(this.channelSubscriptionProbeTimer);
      this.channelSubscriptionProbeTimer = void 0;
      this.channelSubscriptionProbeQueue = [];
    }
    setChannelShelfBusy(busy) {
      const allSubscribed = !this.unsubscribedChannels(allYouTubeChannelRecommendations()).length;
      this.channelShelf?.querySelectorAll('[data-yomu-youtube-channel-action^="subscribe"]').forEach((button) => {
        button.disabled = busy || allSubscribed && button.dataset.yomuYoutubeChannelAction === "subscribe-all";
      });
      this.channelShelf?.setAttribute("aria-busy", String(busy));
    }
    removeChannelShelf() {
      this.clearChannelShelfRefresh();
      this.channelShelf?.remove();
      this.channelShelf = void 0;
      this.channelShelfRenderSignature = "";
      this.channelShelfStatusOverride = "";
      this.clearChannelPreviewBackfill();
    }
    currentChannelShelfScope() {
      const routeKey = this.currentRouteKey();
      if (this.channelShelfRouteKey !== routeKey) {
        this.channelShelfRouteKey = routeKey;
        this.removeChannelShelf();
      }
      return routeKey;
    }
    clear() {
      window.clearTimeout(this.timer);
      window.clearTimeout(this.metadataRescanTimer);
      this.clearChannelShelfRefresh();
      this.clearChannelSubscriptionProbe();
      this.clearChannelPreviewBackfill();
      this.timer = void 0;
      this.metadataRescanTimer = void 0;
      this.channelSubscriptionProbeComplete = false;
      this.revealed = false;
      this.clearFilteredCards();
      this.removeNotice();
      this.removeChannelShelf();
      this.dismissedNoticeScope = "";
      this.noticeRouteKey = "";
      this.channelShelfRouteKey = "";
      this.channelShelfExpanded = false;
      this.channelShelfFilter = "all";
      this.subscriptionBusy = false;
      this.channelShelfStatusOverride = "";
      this.lastBackfillAt = Number.NEGATIVE_INFINITY;
      this.lastScrollAt = Number.NEGATIVE_INFINITY;
      this.lastAdvancedShortKey = "";
      this.lastShortAdvanceAt = Number.NEGATIVE_INFINITY;
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
      document.querySelectorAll(`.${YOUTUBE_FIRST_IN_ROW_CLASS}`).forEach((card) => card.classList.remove(YOUTUBE_FIRST_IN_ROW_CLASS));
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
    return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? "");
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
  function readYouTubeConfigString(ytcfg, key) {
    return stringValue(readYouTubeConfigValue(ytcfg, key));
  }
  function readYouTubeConfigValue(ytcfg, key) {
    try {
      if (typeof ytcfg?.get === "function") return ytcfg.get(key);
    } catch {
    }
    return ytcfg?.data_?.[key];
  }
  function readYouTubeConfigSourceFromScripts() {
    const data = {};
    for (const key of ["INNERTUBE_API_KEY", "INNERTUBE_CLIENT_NAME", "INNERTUBE_CLIENT_VERSION", "VISITOR_DATA"]) {
      const value = readYouTubeConfigScriptValue(key);
      if (value) data[key] = value;
    }
    const context = readYouTubeConfigScriptObject("INNERTUBE_CONTEXT");
    if (context) data.INNERTUBE_CONTEXT = context;
    return Object.keys(data).length ? { data_: data } : void 0;
  }
  function readYouTubeConfigScriptValue(key) {
    const escapedKey = escapeRegExp(key);
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
  function readYouTubeConfigScriptObject(key) {
    const escapedKey = escapeRegExp(key);
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
      description: youTubeChannelPreviewDescription(metadata, data),
      subscribed: youTubeBrowseDataShowsSubscribed(data)
    };
  }
  function youtubePageUsesDarkTheme() {
    if (document.documentElement.hasAttribute("dark")) return true;
    const background = readPageBackgroundColor();
    if (!background) return false;
    return relativeBackgroundLuminance(background) < 0.4;
  }
  function readPageBackgroundColor() {
    for (const element of [document.body, document.documentElement]) {
      if (!element) continue;
      const match = getComputedStyle(element).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) continue;
      if (match[4] !== void 0 && Number.parseFloat(match[4]) === 0) continue;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    return null;
  }
  function relativeBackgroundLuminance([red, green, blue]) {
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }
  function youTubeBrowseDataShowsSubscribed(data) {
    const root = recordValue(data);
    const header = root?.header;
    if (!header) return null;
    return findNestedYouTubeSubscriptionStatus(header, root);
  }
  function findNestedYouTubeSubscriptionStatus(value, data) {
    if (!isNestedYouTubeValue(value)) return null;
    const direct = readYouTubeSubscriptionStatus(value, data);
    if (direct !== null) return direct;
    for (const child of nestedYouTubeChildren(value)) {
      const found = findNestedYouTubeSubscriptionStatus(child, data);
      if (found !== null) return found;
    }
    return null;
  }
  function readYouTubeSubscriptionStatus(value, data) {
    const legacy = legacyYouTubeSubscribeButtonSubscriptionStatus(value);
    if (legacy !== null) return legacy;
    return youTubeSubscribeButtonViewModelSubscriptionStatus(value, data);
  }
  function legacyYouTubeSubscribeButtonSubscriptionStatus(value) {
    const renderer = recordValue(recordValue(value)?.subscribeButtonRenderer);
    return typeof renderer?.subscribed === "boolean" ? renderer.subscribed : null;
  }
  function youTubeSubscribeButtonViewModelSubscriptionStatus(value, data) {
    const model = recordValue(recordValue(value)?.subscribeButtonViewModel);
    if (!model) return null;
    const stateKey = youTubeSubscribeButtonStateKey(model);
    if (!stateKey) return null;
    return findYouTubeSubscriptionState(data, stateKey) ?? null;
  }
  function youTubeSubscribeButtonStateKey(model) {
    return firstStringValue(
      model.stateEntityStoreKey,
      recordValue(recordValue(model.subscribeButtonContent)?.subscribeState)?.key,
      recordValue(recordValue(model.unsubscribeButtonContent)?.subscribeState)?.key
    );
  }
  function findYouTubeSubscriptionState(value, stateKey) {
    if (!isNestedYouTubeValue(value)) return void 0;
    const direct = readYouTubeSubscriptionState(value, stateKey);
    if (direct !== void 0) return direct;
    for (const child of nestedYouTubeChildren(value)) {
      const found = findYouTubeSubscriptionState(child, stateKey);
      if (found !== void 0) return found;
    }
    return void 0;
  }
  function readYouTubeSubscriptionState(value, stateKey) {
    const entity = recordValue(recordValue(value)?.subscriptionStateEntity);
    if (!entity || stringValue(entity.key) !== stateKey || typeof entity.subscribed !== "boolean") return void 0;
    return entity.subscribed;
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
    const headers = { ...youtubeInnerTubeHeaders(config), ...await youTubeAuthorizationHeaders() };
    const response = await fetch(`${location.origin}/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({ context: config.context, ...body })
    });
    if (!response.ok) throw new Error(`YouTube request failed: ${response.status}`);
    const json = await response.json();
    return recordValue(json) ?? {};
  }
  let cachedYouTubeAuthorization;
  async function youTubeAuthorizationHeaders() {
    const sapisid = youTubeSapisidCookie();
    const subtle = globalThis.crypto?.subtle;
    if (!sapisid || !subtle) return {};
    const timestamp = Math.floor(Date.now() / 1e3);
    const key = `${timestamp} ${sapisid} ${location.origin}`;
    if (cachedYouTubeAuthorization?.key !== key) {
      cachedYouTubeAuthorization = { key, headers: computeYouTubeAuthorizationHeaders(subtle, timestamp, key) };
    }
    return cachedYouTubeAuthorization.headers;
  }
  async function computeYouTubeAuthorizationHeaders(subtle, timestamp, payload) {
    try {
      const digest = await subtle.digest("SHA-1", new TextEncoder().encode(payload));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      return {
        Authorization: `SAPISIDHASH ${timestamp}_${hash}`,
        "X-Origin": location.origin,
        "X-Goog-AuthUser": readYouTubeConfigString(readYouTubeConfigSource(), "SESSION_INDEX") || "0"
      };
    } catch {
      return {};
    }
  }
  function youTubeSapisidCookie() {
    for (const name of ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"]) {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapeRegExp(name)}=([^;\\s]+)`, "u"));
      if (match?.[1]) return match[1];
    }
    return "";
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
  function findNestedString(value, key, predicate = Boolean) {
    return findNestedYouTubeValue(value, (candidate) => nestedYouTubeText(candidate, key, predicate));
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
  function nestedYouTubeText(value, key, predicate) {
    const record = recordValue(value);
    if (!record) return "";
    const text = textFromYouTubeValue(record[key]);
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
  function withFeedScrollAnchor(mutated, mutate) {
    const anchor = feedScrollAnchorElement(mutated);
    const before = anchor?.getBoundingClientRect().top;
    const scroller = anchor ? feedScrollerFor(anchor) : null;
    mutate();
    if (!anchor || before === void 0 || !anchor.isConnected || !scroller) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) scroller(delta);
  }
  function feedScrollerFor(anchor) {
    let current = anchor.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      let style;
      try {
        style = getComputedStyle(current);
      } catch {
        return null;
      }
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && current.scrollHeight > current.clientHeight + 1) {
        const scroller = current;
        return (delta) => {
          scroller.scrollTop += delta;
        };
      }
      current = current.parentElement;
    }
    return (delta) => window.scrollBy(0, delta);
  }
  function feedHasScrolled(mutated) {
    if (window.scrollY > 0) return true;
    let current = mutated.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.scrollTop > 0) return true;
      current = current.parentElement;
    }
    return false;
  }
  function feedScrollAnchorElement(mutated) {
    if (!feedHasScrolled(mutated) || typeof document.elementFromPoint !== "function") return null;
    for (const ratio of [0.35, 0.55, 0.8]) {
      const probe = document.elementFromPoint(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight * ratio)
      );
      if (!(probe instanceof HTMLElement) || !probe.isConnected) continue;
      if (probe === mutated || mutated.contains(probe) || probe.contains(mutated)) continue;
      return probe;
    }
    return null;
  }
  function collectYouTubeFilterItems(root = document) {
    if (isInsideReaderRoot(root)) return [];
    const items = new Set(collectYouTubeVideoCards(root));
    root.querySelectorAll(`${VIDEO_CARD_SELECTOR},${NON_VIDEO_CONTAINER_SELECTOR}`).forEach((element) => {
      const normalized = normalizeYouTubeFilterItem(element);
      if (normalized) items.add(normalized);
    });
    collectYouTubeCommunityPosts(root).forEach((item) => items.add(item));
    return [...items].filter((item) => item.isConnected);
  }
  function collectYouTubeCommunityPosts(root = document) {
    if (isYouTubeChannelPostsPage()) return [];
    return Array.from(root.querySelectorAll(COMMUNITY_POST_SELECTOR)).map((post) => post.closest("ytd-rich-item-renderer,ytm-rich-item-renderer") ?? post.closest("ytd-backstage-post-thread-renderer,ytm-backstage-post-thread-renderer,ytd-post-renderer,ytm-post-renderer") ?? post).filter((item) => item.isConnected);
  }
  function isYouTubeChannelPostsPage() {
    const path = location.pathname;
    return /\/(?:posts|community)\/?$/u.test(path) || path.startsWith("/post/");
  }
  function youTubeCommunityPostText(card) {
    const post = card.matches(COMMUNITY_POST_SELECTOR) ? card : card.querySelector(COMMUNITY_POST_SELECTOR);
    if (!post) return null;
    const textEl = post.querySelector(COMMUNITY_POST_TEXT_SELECTOR);
    if (!textEl) return "";
    const clone = textEl.cloneNode(true);
    clone.querySelectorAll("button").forEach((button) => button.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function collectFilterableVideoShelves(root = document) {
    return Array.from(root.querySelectorAll(FILTERABLE_VIDEO_SHELF_SELECTOR)).filter(isFilterableVideoShelf);
  }
  function syncUnrenderedYouTubeShelfSlots(root = document) {
    root.querySelectorAll("ytd-rich-shelf-renderer ytd-rich-item-renderer").forEach((slot) => {
      if (slot.classList.contains(YOUTUBE_FILTERED_CLASS) || slot.classList.contains(YOUTUBE_PENDING_CLASS)) {
        slot.classList.remove(YOUTUBE_UNRENDERED_SLOT_CLASS);
        return;
      }
      const rendered = Boolean(slot.querySelector(YOUTUBE_RENDERED_SLOT_SELECTOR));
      slot.classList.toggle(YOUTUBE_UNRENDERED_SLOT_CLASS, !rendered);
    });
  }
  function rebalanceYouTubeGridRows(root = document) {
    root.querySelectorAll("ytd-rich-grid-renderer").forEach((grid) => {
      const contents = grid.querySelector("div#contents");
      if (!contents) return;
      const sample = contents.querySelector("ytd-rich-item-renderer");
      const itemsPerRow = Number(sample?.getAttribute("items-per-row") ?? grid.getAttribute("elements-per-row") ?? "");
      if (!Number.isFinite(itemsPerRow) || itemsPerRow <= 0) return;
      let column = 0;
      const markGridChild = (child) => {
        if (!(child instanceof HTMLElement)) return;
        const tag = child.tagName.toLowerCase();
        if (tag === "ytd-rich-section-renderer") {
          if (!child.classList.contains(YOUTUBE_FILTERED_CLASS)) column = 0;
          return;
        }
        if (tag !== "ytd-rich-item-renderer") return;
        if (child.classList.contains(YOUTUBE_FILTERED_CLASS) || child.classList.contains(YOUTUBE_PENDING_CLASS)) {
          child.classList.remove(YOUTUBE_FIRST_IN_ROW_CLASS);
          return;
        }
        child.removeAttribute("is-in-first-column");
        child.removeAttribute("is-first-in-column");
        child.classList.toggle(YOUTUBE_FIRST_IN_ROW_CLASS, column % itemsPerRow === 0);
        column += 1;
      };
      for (const child of Array.from(contents.children)) {
        if (child.tagName.toLowerCase() === "ytd-rich-grid-row") {
          const rowContents = child.querySelector(":scope > div#contents");
          for (const rowChild of Array.from((rowContents ?? child).children)) markGridChild(rowChild);
          continue;
        }
        markGridChild(child);
      }
    });
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
    if (card.querySelector(CHANNEL_LISTING_CONTENT_SELECTOR)) return false;
    return card.matches(NON_VIDEO_CONTAINER_SELECTOR) || isYouTubePlaylistLikeCard(card);
  }
  function normalizeYouTubeNonVideoContainer(element) {
    if (isFilterableVideoShelf(element)) return null;
    if (element.querySelector(CHANNEL_LISTING_CONTENT_SELECTOR)) return null;
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
    if (!hasYouTubeVideoLink(element) && !element.matches(SHORTS_CARD_SELECTOR)) return false;
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
    const selfVideoId = card.getAttribute("video-id") || card.getAttribute("data-video-id");
    if (selfVideoId) return selfVideoId;
    const descendantVideoId = card.querySelector("[video-id]")?.getAttribute("video-id");
    if (descendantVideoId) return descendantVideoId;
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
    const currentVideoId = currentYouTubeShortsVideoId();
    const itemVideoId = readYouTubeVideoId(item);
    if (currentVideoId && itemVideoId) return itemVideoId === currentVideoId;
    if (isActiveYouTubeShortsReel(item)) return true;
    return false;
  }
  function isActiveYouTubeShortsReel(item) {
    if (item.hasAttribute("is-active") || item.getAttribute("aria-hidden") === "false") return true;
    const rect = item.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const viewportCenter = window.innerHeight / 2;
    return rect.top <= viewportCenter && rect.bottom >= viewportCenter;
  }
  function activeShortsTitle() {
    const tabTitle = document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
    if (tabTitle && tabTitle.toLowerCase() !== "youtube") return tabTitle;
    return document.querySelector("yt-shorts-video-title-view-model")?.textContent?.trim() ?? "";
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
    const rect = continuation.getBoundingClientRect();
    if (rect.top >= window.innerHeight * 2.5 && !isNearPageBottom()) return false;
    if (rect.top <= window.innerHeight) {
      continuation.scrollIntoView({ block: "nearest" });
      return true;
    }
    const previousY = window.scrollY;
    continuation.scrollIntoView({ block: "end" });
    if (!isNearPageBottom()) window.setTimeout(() => window.scrollTo({ top: previousY }), 80);
    return true;
  }
  function isYouTubeWatchPage() {
    return location.pathname === "/watch";
  }
  function shouldHidePendingYouTubeCard(card) {
    if (typeof window === "undefined") return false;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportHeight <= 0) return false;
    const preloadMargin = Math.max(360, viewportHeight * 0.75);
    return rect.bottom < -preloadMargin || rect.top > viewportHeight + preloadMargin;
  }
  function shouldShowFilterNoticeForRoute() {
    return !isYouTubeWatchPage() && !isYouTubeShortsWatchPage();
  }
  function isYouTubePlaylistLikeCard(card) {
    if (card.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (card.querySelector("yt-collection-thumbnail-view-model, ytd-playlist-thumbnail")) return true;
    const links = Array.from(card.querySelectorAll("a[href]"));
    const playlistLinks = links.filter((link) => {
      const href = link.getAttribute("href") ?? "";
      return href.includes("/playlist?") || href.includes("/watch_videos?") || /[?&]start_radio=/.test(href) || /[?&]list=RD/.test(href) || !extractYouTubeVideoId(href) && /[?&]list=/.test(href);
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
    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    const nodes = mutation.type === "childList" && changedNodes.length ? changedNodes : [mutation.target, ...changedNodes];
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
    if (!element || isInsideReaderRoot(element)) return null;
    return element;
  }
  function isYouTubeCardOrFeedElement(element) {
    if (element.matches(VIDEO_CARD_SELECTOR)) return true;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (element.matches(YOUTUBE_FEED_CONTAINER_SELECTOR)) return true;
    return Boolean(element.closest(VIDEO_CARD_SELECTOR));
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
  registerYomuCompanion("video", {
    SubtitlePlayerController,
    YoutubeImmersionFilter
  });
  registerYomuCompanion("ocr", {
    ImageOcrController
  });
})();
