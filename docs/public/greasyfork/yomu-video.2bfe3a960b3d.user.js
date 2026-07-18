(function() {
  "use strict";
  function isNonNullObject(value) {
    return typeof value === "object" && value !== null;
  }
  function currentFullscreenElement() {
    const fullscreenDocument = document;
    return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? fullscreenDocument.mozFullScreenElement ?? fullscreenDocument.msFullscreenElement ?? null;
  }
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
    const state = normalizeCardState(rawState);
    if (!state || states.includes(state)) return;
    states.push(state);
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
  const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const HAS_JAPANESE_LETTER = /[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fd-\u30ff\u3400-\u9fff\uff66-\uff6f\uff71-\uff9d]/u;
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
    }
  };
  const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white,
    outline: CORE_COLOR_TOKENS.black,
    background: READER_THEME_COLOR_TOKENS.dark.bg
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
  `button,label,summary,${roleSelectors("button,tab,menuitem,option,checkbox,radio,switch")}`;
  `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs("account,chooser,dialog,dropdown,login,menu,modal,panel,picker,profile,signin,toolbar")}`;
  `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs("alert,banner,notice,notification,snackbar,toast", ["class"])},${selectorPairs("assistant,prompt,question", ["class", "id"])}`;
  roleSelectors("option,menuitem,menuitemcheckbox,menuitemradio");
  `button,summary,label,${roleSelectors("button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio")},[slot="more-button"],.more-button,#more,#less`;
  roleSelectors("menu,menubar,toolbar,tablist");
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
  function readerWordSurfaceText(element) {
    const surface = readerWordChildSurfaceText(element);
    return surface || element.getAttribute("data-surface") || "";
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
  function isSurfaceIgnoredElement(element) {
    return READABLE_IGNORED_TAGS.has(element.tagName) || element.matches("[data-jpdb-reader-surface-ignore],.jpdb-reader-furi,.jpdb-ocr-furi");
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
  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
  }
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
  const OPEN_SUBTITLE_TRACKS_EVENT = "yomu-open-subtitle-tracks";
  const LOAD_SUBTITLE_FILES_EVENT = "yomu-load-subtitle-files";
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
    { owner: "dictionaries/jiten-public-cache", kind: "gm", key: "yomu:jiten-public-cache:v1" },
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
      return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) && (path.includes("/study/") || path.includes("/newtab/"));
    } catch {
      return false;
    }
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
  const DEFAULT_READER_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const DEFAULT_POPUP_FONT_FAMILY = '"Nunito Sans", "Extra Sans JP", "Noto Sans Symbols2", "Segoe UI", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans GB", "Meiryo", sans-serif';
  const DEFAULT_SUBTITLE_FONT_FAMILY = DEFAULT_READER_FONT_FAMILY;
  const DEFAULT_WORD_COLORS = DEFAULT_WORD_COLOR_TOKENS;
  const DEFAULT_PITCH_COLORS = DEFAULT_PITCH_COLOR_TOKENS;
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
  const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status", "hover"]);
  const DEFAULT_COLOR_CHANNELS = {
    wordHighlightColorSource: "jpdb",
    wordUnderlineColorSource: "pitch",
    wordTextColorSource: "anki",
    subtitleHighlightColorSource: "jpdb",
    subtitleUnderlineColorSource: "pitch",
    subtitleTextColorSource: "anki"
  };
  const DEFAULT_NEW_TAB_STUDY_STEP_ORDER = [
    "kanji-doodle",
    "word",
    "type-word",
    "recall-cloze",
    "listen-pitch",
    "speaking"
  ];
  new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
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
    newTabEnabled: true,
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
  function clampNumber$1(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
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
  const KANJI_RE = /[\u3400-\u9fff]/u;
  const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
  const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
  const TRAILING_DIGITS_RE = /[0-9０-９]+$/u;
  const NUMBER_BIND_CLASS = "jpdb-reader-number-bind";
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const EASY_FURIGANA_KANJI = new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  selectorPairs("control,toggle,player", ["class"]);
  const PITCH_CLASSES = new Set("heiban,atamadaka,nakadaka,odaka".split(","));
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
      for (const state of FURIGANA_GROUP_STATES[group] ?? []) states.add(state);
    }
    return states;
  }
  function shouldHideFuriganaForCardState(settings, state) {
    const mode = effectiveFuriganaMode(settings);
    if (mode === "off") return true;
    return mode === "known-status" && furiganaHiddenStates(settings).has(state);
  }
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  function renderTokensToHtml(text, tokens, settings) {
    let html = "";
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text);
    const miningInsightKeys = miningInsightTokenKeys(safeTokens);
    for (const token of safeTokens) {
      if (token.start > offset) html += plainTextBeforeTokenHtml(text.slice(offset, token.start));
      html += renderTokenHtml(text.slice(token.start, token.end), token, settings, miningInsightKeys);
      offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
  }
  function plainTextBeforeTokenHtml(gap) {
    const digits = TRAILING_DIGITS_RE.exec(gap)?.[0];
    if (!digits) return escapeHtml(gap);
    const prefix = gap.slice(0, gap.length - digits.length);
    return `${escapeHtml(prefix)}<span class="${NUMBER_BIND_CLASS}">${escapeHtml(digits)}</span>`;
  }
  function nonOverlappingTokens(tokens, text) {
    const safe = [];
    let offset = 0;
    for (const token of tokens) {
      if (!isSafeTokenSpan(token, offset, text)) continue;
      safe.push(token);
      offset = token.end;
    }
    return safe;
  }
  function isSafeTokenSpan(token, offset, text) {
    if (token.start < offset || token.start < 0 || token.end <= token.start || token.end > text.length) return false;
    return HAS_JAPANESE_LETTER.test(text.slice(token.start, token.end));
  }
  function miningInsightTokenKeys(tokens) {
    const sentences = /* @__PURE__ */ new Map();
    for (const token of tokens) {
      const sentence = miningInsightSentenceKey(token);
      if (!sentence || isParticleCard(token.card)) continue;
      const cardKey2 = readerCardKey(token.card);
      const sentenceCards = sentences.get(sentence) ?? /* @__PURE__ */ new Map();
      if (!sentences.has(sentence)) sentences.set(sentence, sentenceCards);
      if (!sentenceCards.has(cardKey2)) {
        sentenceCards.set(cardKey2, { unknown: isMiningUnknownCard(token.card) });
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
  function miningInsightKey(sentence, cardKey2) {
    return `${sentence}\0${cardKey2}`;
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
    const pitchClass = settings.showPitchAccent ? safePitchClass(token.pitchClass) : "";
    const classes = [
      readerWordClassName(state, token, settings),
      hasRuby ? "jpdb-reader-has-furi" : "",
      hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
    ].filter(Boolean).join(" ");
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : "";
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : "";
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : "";
    const pitchAccent = token.card.pitchAccent.join("|");
    const pitchClassAttr = pitchClass ? ` data-pitch-class="${pitchClass}"` : "";
    const lookupMetadata = settings.showPitchAccent && pitchAccent ? ` data-pitch-accent="${escapeHtml(pitchAccent)}"` : "";
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr}${pitchClassAttr} data-sentence="${escapeHtml(token.sentence ?? "")}"${miningInsight}${expression}${reading}${lookupMetadata}${deck} tabindex="-1">${content}</span>`;
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
    if (mode === "known-status") return !shouldHideFuriganaForCardState(settings, primaryCardState(token.card.cardState));
    return mode !== "difficult-kanji" || hasDifficultKanji(surface);
  }
  function hasDifficultKanji(surface) {
    for (const char of surface) {
      if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
  }
  function readerWordClassName(state, token, settings) {
    const classes = ["jpdb-reader-word"];
    if (isParticleCard(token.card)) {
      classes.push("jpdb-reader-particle");
    }
    if (hasKnownCardState(token.card)) {
      classes.push(`jpdb-${state}`);
      const source = readerCardSource(token.card);
      if (source !== "jpdb") classes.push(`${source}-${state}`);
    }
    classes.push(...cardDeckMembershipClassNames(token.card));
    if (settings.showPitchAccent) classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
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
      if (surfaceSuffix && !KANA_RE.test(surfaceSuffix)) continue;
      const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
      if (rubies.length) return rubies;
    }
    if (visibleSurface.startsWith(baseSpelling) && !KANA_CHAR_RE.test(baseSpelling)) {
      const surfaceSuffix = visibleSurface.slice(baseSpelling.length);
      if (!surfaceSuffix || KANA_RE.test(surfaceSuffix)) {
        return [{
          text: baseReading,
          start: 0,
          end: baseSpelling.length,
          length: baseSpelling.length
        }];
      }
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
    const kanjiOnly = kanaTrimmedKanjiRange(trimmed.surface, trimmed.reading);
    if (kanjiOnly) {
      return [{
        text: trimmed.reading,
        start: trimmed.offset + kanjiOnly.start,
        end: trimmed.offset + kanjiOnly.end
      }];
    }
    return [{
      text: trimmed.reading,
      start: trimmed.offset,
      end: trimmed.offset + trimmed.surface.length
    }];
  }
  function kanaTrimmedKanjiRange(base, reading) {
    if (!KANA_RE.test(reading) || !KANA_CHAR_RE.test(base)) return null;
    const chars = Array.from(base);
    const first = chars.findIndex((char) => KANJI_RE.test(char));
    if (first < 0) return null;
    let last = -1;
    for (let index = chars.length - 1; index >= first; index -= 1) {
      if (KANJI_RE.test(chars[index])) {
        last = index;
        break;
      }
    }
    if (last < first || first === 0 && last === chars.length - 1) return null;
    return { start: first, end: last + 1 };
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
  const PLACEHOLDER_CUE_CLAUSE_RE = new RegExp(
    "^(?:(?:captions?|subtitles?|cc) (?:are |is )?not (?:needed|required|available|provided)|(?:there (?:is|are) )?no (?:dialogue|dialog|speech|narration|audio|spoken \\w+|captions?|subtitles?)(?: (?:is|are) (?:needed|required|available|provided))?(?: in this video)?|this video (?:has|contains) no (?:dialogue|dialog|speech|narration|audio))$",
    "i"
  );
  function isPlaceholderSubtitleCueText(text) {
    const clauses = text.split(/[.:;!?()[\]"']+/).map((clause) => clause.replace(/[^\p{L}\p{N}]+/gu, " ").trim()).filter(Boolean);
    return clauses.length > 0 && clauses.every((clause) => PLACEHOLDER_CUE_CLAUSE_RE.test(clause));
  }
  function normalizedSubtitleCueParts(cue, options) {
    const base = normalizedSubtitleCueBase(cue, options);
    if (!base) return [];
    if (!HAS_CUE_WORD_CONTENT_RE.test(base.text)) return [];
    if (isPlaceholderSubtitleCueText(base.text)) return [];
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
  async function requestJson(url, options = {}) {
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
      noExampleSentences: "No example sentences",
      exampleSentencesUnavailable: "Example sentences unavailable",
      acceptedInputs: "Accepted inputs",
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
noExampleSentences	例文はありません
exampleSentencesUnavailable	例文を読み込めません
acceptedInputs	入力として認められる表現
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
  function cardStateLabel(state, language, fallback = state) {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : fallback;
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
  const SUBTITLE_COPY = {
    en: {
      selectAll: "Select all",
      clearSelection: "Clear",
      subtitleShadow: "Shadow",
      subtitleShadowing: "Shadowing",
      bmTab: "Mine",
      bmTitle: "Batch mining",
      bmToolbar: "Batch mining actions",
      bmScan: "Scan",
      bmRescan: "Rescan",
      bmAdd: "Add selected",
      bmCopy: "Copy list",
      bmGradeSelected: "Grade selected",
      bmGradeWord: "Grade word",
      bmReady: "Scan the loaded transcript to collect candidate words.",
      bmRowsReady: "{count} lines ready",
      bmScanning: "Scanning {count}/{total} lines",
      bmSummary: "{count} candidates · {iPlusOne} i+1 · {selected} selected",
      bmNoCandidates: "No new candidates found.",
      bmNoTranscript: "No transcript lines to scan.",
      bmNoSelection: "No words selected.",
      bmAdded: "Added {count} words.",
      bmAddFailed: "Could not add selected words.",
      bmCopied: "Copied {count} words.",
      bmGraded: "Graded {count} words.",
      bmGradeFailed: "Could not grade selected words.",
      bmFailed: "Batch scan failed.",
      bmIPlusOne: "i+1",
      bmOccurrences: "{count}x",
      bmSelect: "Select word",
      bmDeselect: "Deselect word",
      shadowReplayLine: "Replay current line",
      shadowReplay: "Replay",
      shadowEnableLoop: "Loop current line",
      shadowDisableLoop: "Stop looping current line",
      shadowLoop: "Loop",
      shadowHideText: "Hide current line text",
      shadowRevealText: "Show current line text",
      shadowWaitingForLine: "Waiting for the current subtitle.",
      shadowLoopingCurrentLine: "Looping current line",
      shadowCurrentLine: "Current line"
    },
    ja: {
      selectAll: "すべて選択",
      clearSelection: "選択解除",
      subtitleShadow: "シャドー",
      subtitleShadowing: "シャドーイング",
      bmTab: "採掘",
      bmTitle: "一括採掘",
      bmToolbar: "一括採掘の操作",
      bmScan: "スキャン",
      bmRescan: "再スキャン",
      bmAdd: "選択を追加",
      bmCopy: "リストをコピー",
      bmGradeSelected: "選択を評価",
      bmGradeWord: "単語を評価",
      bmReady: "読み込んだ字幕をスキャンして候補語を集めます。",
      bmRowsReady: "{count}行準備完了",
      bmScanning: "{count}/{total}行をスキャン中",
      bmSummary: "候補{count}・i+1 {iPlusOne}・選択{selected}",
      bmNoCandidates: "新しい候補はありません。",
      bmNoTranscript: "スキャンできる字幕行がありません。",
      bmNoSelection: "単語が選択されていません。",
      bmAdded: "{count}語を追加しました。",
      bmAddFailed: "選択語を追加できませんでした。",
      bmCopied: "{count}語をコピーしました。",
      bmGraded: "{count}語を評価しました。",
      bmGradeFailed: "選択語を評価できませんでした。",
      bmFailed: "一括スキャンに失敗しました。",
      bmIPlusOne: "i+1",
      bmOccurrences: "{count}回",
      bmSelect: "単語を選択",
      bmDeselect: "単語の選択を解除",
      shadowReplayLine: "現在の行を再生",
      shadowReplay: "再生",
      shadowEnableLoop: "現在の行をループ",
      shadowDisableLoop: "現在の行のループを停止",
      shadowLoop: "ループ",
      shadowHideText: "現在行の文字を隠す",
      shadowRevealText: "現在行の文字を表示",
      shadowWaitingForLine: "現在の字幕を待機中です。",
      shadowLoopingCurrentLine: "現在行をループ中",
      shadowCurrentLine: "現在行"
    }
  };
  function subtitleText(language, key) {
    return SUBTITLE_COPY[resolveUiLanguage(language)][key] ?? SUBTITLE_COPY.en[key];
  }
  function formatSubtitleText(language, key, values) {
    return subtitleText(language, key).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => String(values[name] ?? ""));
  }
  const SUBTITLE_MIN_VISIBLE_VIDEO_RATIO = 0.45;
  const SUBTITLE_MIN_VISIBLE_VIDEO_WIDTH = 120;
  const SUBTITLE_MIN_VISIBLE_VIDEO_HEIGHT = 80;
  const TRANSCRIPT_PLACEMENTS = ["left", "bottom", "right"];
  const SUBTITLE_STYLE_FONT_PRESETS = FONT_FAMILY_PRESETS;
  const SUBTITLE_STYLE_FONT_FAMILY_VALUES = SUBTITLE_STYLE_FONT_PRESETS.map((preset) => preset.value);
  function renderPanelModeControls(mode, canShowLines, language) {
    return `
        <div class="jpdb-subtitle-panel-mode" role="group" aria-label="${escapeHtml(uiText(language, "subtitlePanelMode"))}">
            <button type="button" data-action="panel-lines" aria-pressed="${mode === "lines"}" ${canShowLines ? "" : "disabled"}>${escapeHtml(uiText(language, "subtitleLines"))}</button>
            <button type="button" data-action="panel-shadow" aria-pressed="${mode === "shadow"}" ${canShowLines ? "" : "disabled"}>${escapeHtml(uiText(language, "shadow"))}</button>
            <button type="button" data-action="panel-mine" aria-pressed="${mode === "mine"}" ${canShowLines ? "" : "disabled"}>${escapeHtml(subtitleText(language, "bmTab"))}</button>
            <button type="button" data-action="panel-tracks" aria-pressed="${mode === "tracks"}">${escapeHtml(uiText(language, "subtitleTracks"))}</button>
        </div>
    `;
  }
  function renderPanelOptionsControls(state) {
    const language = state.language;
    const label = uiText(language, "subtitlePanelOptions");
    const autoLabel = uiText(language, "enableSubtitleAutoHide");
    const autoTitle = uiText(language, state.pausePanelEnabled ? "disableSubtitleAutoHide" : "enableSubtitleAutoHide");
    const placementLabel = uiText(language, "subtitleTranscriptPlacement");
    return `
        <div class="jpdb-subtitle-panel-options" data-panel-options>
            <button class="jpdb-subtitle-panel-options-toggle" type="button" data-action="panel-options" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="${state.menuOpen}">${subtitleIcon(transcriptPlacementIcon(state.placement))}</button>
            <div class="jpdb-subtitle-panel-options-menu" role="group" aria-label="${escapeHtml(label)}" ${state.menuOpen ? "" : "hidden"}>
                <div class="jpdb-subtitle-panel-options-placement" role="group" aria-label="${escapeHtml(placementLabel)}">
                    ${TRANSCRIPT_PLACEMENTS.map((placement) => renderPanelOptionsPlacementItem(placement, state.placement, placementLabel, language)).join("")}
                </div>
                <button class="jpdb-subtitle-panel-options-item jpdb-subtitle-panel-options-auto" type="button" data-action="toggle-pause-panel" title="${escapeHtml(autoTitle)}" aria-pressed="${state.pausePanelEnabled}">
                    ${subtitleIcon("auto-hide")}
                    <span>${escapeHtml(autoLabel)}</span>
                </button>
            </div>
        </div>
    `;
  }
  function renderPanelCloseButton(language) {
    const closeLabel = uiText(language, "closeSubtitlePanel");
    return `<button class="jpdb-subtitle-panel-close" type="button" data-action="close-panel" title="${escapeHtml(closeLabel)}" aria-label="${escapeHtml(closeLabel)}">${subtitleIcon("close")}</button>`;
  }
  function renderDrawerHead(state) {
    const language = state.options.language;
    return `
        <div class="jpdb-subtitle-drawer-head">
            <div class="jpdb-subtitle-drawer-top">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">${escapeHtml(state.title)}</strong>
                    <span class="jpdb-subtitle-drawer-meta" title="${escapeHtml(state.metaTitle ?? state.meta)}">${escapeHtml(state.meta)}</span>
                </div>
                <div class="jpdb-subtitle-drawer-top-actions">
                    ${renderPanelOptionsControls(state.options)}
                    ${renderPanelCloseButton(language)}
                </div>
            </div>
            <div class="jpdb-subtitle-drawer-actions">
                ${state.showModeTabs === false ? "" : renderPanelModeControls(state.mode, state.canShowLines, language)}
                ${state.extraActions ?? ""}
                ${renderDrawerPlayback(language)}
            </div>
        </div>
    `;
  }
  function renderDrawerPlayback(language) {
    const previousLabel = uiText(language, "previousSubtitle");
    const nextLabel = uiText(language, "nextSubtitle");
    return `
        <div class="jpdb-subtitle-drawer-playback">
            <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
            <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
        </div>
    `;
  }
  function renderPanelOptionsPlacementItem(placement, currentPlacement, groupLabel, language) {
    const placementLabel = uiText(language, placement);
    const label = `${groupLabel}: ${placementLabel}`;
    return `
        <button class="jpdb-subtitle-panel-options-item" type="button" data-action="transcript-placement" data-placement="${placement}" title="${escapeHtml(label)}" aria-pressed="${placement === currentPlacement}">
            ${subtitleIcon(transcriptPlacementIcon(placement))}
            <span>${escapeHtml(placementLabel)}</span>
        </button>
    `;
  }
  function renderSubtitleStyleControls(settings, language) {
    const label = uiText(language, "subtitleStyle");
    return `
        <button class="jpdb-subtitle-style-toggle" type="button" data-action="style" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-haspopup="true" aria-expanded="false" aria-controls="jpdb-subtitle-style-popover">${subtitleIcon("style")}</button>
        <div class="jpdb-subtitle-style-popover" id="jpdb-subtitle-style-popover" data-subtitle-style-popover role="group" aria-label="${escapeHtml(label)}" hidden>
            ${renderSubtitleStyleRange("subtitleFontSize", uiText(language, "subtitleFontSize"), settings.subtitleFontSize, 16, 64, 2, "px")}
            ${renderSubtitleStyleRange("subtitleFontWeight", uiText(language, "subtitleFontWeight"), settings.subtitleFontWeight, 300, 900, 20, "weight")}
            ${renderSubtitleStyleRange("subtitleBackgroundOpacity", uiText(language, "subtitleBackgroundOpacity"), settings.subtitleBackgroundOpacity, 0, 0.7, 0.05, "")}
            <label class="jpdb-subtitle-style-field jpdb-subtitle-style-select">
                <span>${escapeHtml(uiText(language, "subtitleFontFamily"))}</span>
                <select data-subtitle-style-setting="subtitleFontFamily">
                    ${SUBTITLE_STYLE_FONT_PRESETS.map((preset) => renderSubtitleStyleFontOption(preset, settings.subtitleFontFamily, language)).join("")}
                </select>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleMiningPause" ${settings.subtitleMiningPause ? "checked" : ""}>
                <span>${escapeHtml(uiText(language, "subtitleMiningPause"))}</span>
            </label>
            <label class="jpdb-subtitle-style-toggle-field">
                <input type="checkbox" data-subtitle-style-setting="subtitleHoverPause" ${settings.subtitleHoverPause ? "checked" : ""}>
                <span>${escapeHtml(uiText(language, "subtitleHoverPause"))}</span>
            </label>
            <button class="jpdb-subtitle-style-reset" type="button" data-action="style-reset">${escapeHtml(uiText(language, "subtitleResetDefaults"))}</button>
        </div>
    `;
  }
  function renderSubtitleStyleRange(setting, label, value, min, max, step, suffix) {
    return `
        <label class="jpdb-subtitle-style-field">
            <span>${escapeHtml(label)}</span>
            <output data-subtitle-style-output="${setting}">${escapeHtml(subtitleStyleDisplayValue(value, suffix))}</output>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-subtitle-style-setting="${setting}">
        </label>
    `;
  }
  function renderSubtitleStyleFontOption(preset, current, language) {
    return `<option value="${escapeHtml(preset.value)}" ${preset.value === current ? "selected" : ""}>${escapeHtml(uiText(language, preset.labelKey))}</option>`;
  }
  function subtitleStyleDisplayValue(value, suffix) {
    if (suffix === "weight") return String(Math.round(value));
    if (!suffix) return `${Math.round(value * 100)}%`;
    return `${Math.round(value)}${suffix}`;
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
      check: '<path d="M20 6 9 17l-5-5"/>',
      close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
      copy: '<path d="M14 3H6a2 2 0 0 0-2 2v12"/><path d="M10 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M14 11v6"/><path d="M11 14h6"/>',
      eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
      grip: '<circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
      locate: '<path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
      menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
      mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8 21h8"/>',
      "panel-bottom": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
      "panel-left": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
      "panel-right": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
      pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
      pin: '<path d="m8 3 8 8"/><path d="m14 5 5 5-4 2-3 3-2 4-5-5 4-2 3-3 2-4Z"/><path d="m5 19 4-4"/>',
      play: '<path d="M8 5v14l11-7-11-7Z"/>',
      repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
      scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M7 12h10"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
      style: '<path d="M4 7h5"/><path d="M15 7h5"/><circle cx="12" cy="7" r="2"/><path d="M4 17h9"/><path d="M19 17h1"/><circle cx="16" cy="17" r="2"/>',
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
    const area = rectArea(rect);
    return area > 0 && rectArea(visible) / area >= SUBTITLE_MIN_VISIBLE_VIDEO_RATIO;
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
    return rectArea(rectViewportIntersection(rect));
  }
  function rectViewportIntersection(rect) {
    const left = clampNumber(rect.left, 0, window.innerWidth);
    const top = clampNumber(rect.top, 0, window.innerHeight);
    const right = clampNumber(rect.right, left, window.innerWidth);
    const bottom = clampNumber(rect.bottom, top, window.innerHeight);
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  }
  function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }
  const TRANSCRIPT_PANEL_MARGIN = 10;
  const TRANSCRIPT_PANEL_MIN_BOTTOM_HEIGHT = 220;
  const TRANSCRIPT_PANEL_Z_INDEX = 2147483645;
  const TRANSCRIPT_PANEL_SIZE_KEY = "jpdb-reader-transcript-panel-size";
  const SUBTITLE_DRAG_OFFSET_KEY = "jpdb-reader-subtitle-drag-offset";
  const SUBTITLE_CONTROL_RAIL_POSITION_KEY = "jpdb-reader-subtitle-control-rail-position";
  const SUBTITLE_DRAG_OFFSET_MIN_FRACTION = -0.9;
  const SUBTITLE_DRAG_OFFSET_MAX_FRACTION = 0.35;
  function clampSubtitleDragOffsetFraction(fraction) {
    if (!Number.isFinite(fraction)) return 0;
    return Math.min(SUBTITLE_DRAG_OFFSET_MAX_FRACTION, Math.max(SUBTITLE_DRAG_OFFSET_MIN_FRACTION, fraction));
  }
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
    setStylePropertyIfChanged(panel, "z-index", String(TRANSCRIPT_PANEL_Z_INDEX));
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
  function loadSubtitleDragOffsetFraction() {
    try {
      const parsed = gmStorageGetSync(SUBTITLE_DRAG_OFFSET_KEY, {});
      return clampSubtitleDragOffsetFraction(parsed?.fraction ?? 0);
    } catch {
      return 0;
    }
  }
  function saveSubtitleDragOffsetFraction(fraction) {
    try {
      gmStorageSetSync(SUBTITLE_DRAG_OFFSET_KEY, { fraction: clampSubtitleDragOffsetFraction(fraction) });
    } catch {
    }
  }
  function loadSubtitleControlRailPosition() {
    try {
      const stored = gmStorageGetSync(SUBTITLE_CONTROL_RAIL_POSITION_KEY, {});
      if (!Number.isFinite(stored?.x) || !Number.isFinite(stored?.y)) return null;
      return { x: clampRailFraction(stored.x), y: clampRailFraction(stored.y) };
    } catch {
      return null;
    }
  }
  function saveSubtitleControlRailPosition(position) {
    try {
      gmStorageSetSync(SUBTITLE_CONTROL_RAIL_POSITION_KEY, {
        x: clampRailFraction(position.x),
        y: clampRailFraction(position.y)
      });
    } catch {
    }
  }
  function clampRailFraction(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }
  function collectPageSubtitleSources(root = document) {
    const pageTitle = pageSubtitleTitle(root);
    return dedupeSubtitleSources([
      ...collectTrackSubtitleSources(root, pageTitle),
      ...collectLinkSubtitleSources(root, pageTitle),
      ...collectConfigSubtitleSources(root, pageTitle)
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
  function collectConfigSubtitleSources(root, pageTitle) {
    return subtitleConfigElements(root).flatMap((element, index) => subtitleSourcesFromConfigElement(element, pageTitle, index));
  }
  function subtitleConfigElements(root) {
    return Array.from(root.querySelectorAll([
      "[props]",
      "[data-props]",
      "[data-tracks]",
      "[data-subtitles]",
      "[data-captions]",
      "[data-config]",
      "[data-player]",
      "[data-setup]",
      'script[type="application/json"]',
      'script[type="application/ld+json"]'
    ].join(",")));
  }
  function subtitleSourcesFromConfigElement(element, pageTitle, elementIndex) {
    const texts = [
      ...subtitleConfigAttributeTexts(element),
      element instanceof HTMLScriptElement ? element.textContent ?? "" : ""
    ].filter((text) => text && hasSubtitleSourceText(text));
    return texts.flatMap((text, textIndex) => subtitleSourcesFromConfigText(text, pageTitle, `config-${elementIndex}-${textIndex}`));
  }
  function subtitleConfigAttributeTexts(element) {
    return Array.from(element.attributes).filter((attribute) => subtitleConfigAttributeName(attribute.name) || hasSubtitleSourceText(attribute.value)).map((attribute) => attribute.value);
  }
  function subtitleConfigAttributeName(name) {
    return /^(?:props|data-(?:props|tracks|subtitles?|captions?|config|player|setup|sources?))$/i.test(name);
  }
  function hasSubtitleSourceText(text) {
    return /\.(?:vtt|srt|ass|ssa)(?:$|[?#\s"'\\<>,\])}])/i.test(text);
  }
  function subtitleSourcesFromConfigText(text, pageTitle, keyPrefix) {
    const parsed = parseSubtitleConfigJson(text);
    return parsed === void 0 ? [] : subtitleSourcesFromConfigValue(parsed, pageTitle, keyPrefix);
  }
  function parseSubtitleConfigJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return void 0;
    }
  }
  function subtitleSourcesFromConfigValue(value, pageTitle, keyPrefix) {
    const sources = [];
    const seenObjects = /* @__PURE__ */ new Set();
    const visit = (current, path) => {
      const decoded = subtitleConfigTaggedValue(current);
      if (decoded !== current) {
        visit(decoded, path);
        return;
      }
      if (Array.isArray(current)) {
        for (const item of current) visit(item, path);
        return;
      }
      if (!current || typeof current !== "object") return;
      if (seenObjects.has(current)) return;
      seenObjects.add(current);
      const record = current;
      const source = subtitleSourceFromConfigRecord(record, pageTitle, keyPrefix, sources.length, path);
      if (source) sources.push(source);
      for (const [key, child] of Object.entries(record)) visit(child, [...path, key]);
    };
    visit(value, []);
    return sources;
  }
  function subtitleSourceFromConfigRecord(record, pageTitle, keyPrefix, index, path) {
    const url = subtitleConfigRecordUrl(record);
    if (!url || !isSubtitleConfigRecord(record, path)) return null;
    const label = subtitleConfigSourceLabel(subtitleConfigRecordLabel(record), url, pageTitle);
    return {
      url,
      label,
      language: normalizeSubtitleLanguage(subtitleConfigRecordLanguage(record) || inferSubtitleLanguage(label, url)),
      sourceKey: pageSubtitleSourceKey(`${keyPrefix}-${index}`, url)
    };
  }
  function subtitleConfigRecordUrl(record) {
    for (const key of ["src", "file", "url", "href"]) {
      const value = subtitleConfigString(record[key]);
      const url = value ? subtitleSourceUrl(value) : "";
      if (url) return url;
    }
    return "";
  }
  function subtitleConfigRecordLabel(record) {
    return subtitleConfigString(record.label) || subtitleConfigString(record.name) || subtitleConfigString(record.title) || subtitleConfigRecordLanguage(record);
  }
  function subtitleConfigRecordLanguage(record) {
    return subtitleConfigString(record.language) || subtitleConfigString(record.lang) || subtitleConfigString(record.srclang);
  }
  function subtitleConfigSourceLabel(value, url, pageTitle) {
    const cleaned = cleanSubtitleTitle(value);
    return cleaned || subtitleSourceLabel("", url, { pageTitle });
  }
  function isSubtitleConfigRecord(record, path) {
    const context = `${path.join(" ")} ${Object.keys(record).join(" ")}`;
    if (/(?:thumbnail|thumb|preview|poster|image|sprite|chapter|manifest|playlist)/i.test(context)) return false;
    const type = [
      subtitleConfigString(record.kind),
      subtitleConfigString(record.type),
      subtitleConfigString(record.role),
      subtitleConfigString(record.trackKind)
    ].join(" ");
    return /(?:subtitles?|captions?|closed.?captions?|text.?tracks?)/i.test(`${context} ${type}`) || Boolean(subtitleConfigRecordLanguage(record) && subtitleConfigRecordLabel(record));
  }
  function subtitleConfigString(value) {
    const decoded = subtitleConfigTaggedValue(value);
    return typeof decoded === "string" ? decoded.trim() : "";
  }
  function subtitleConfigTaggedValue(value) {
    if (!Array.isArray(value) || value.length !== 2) return value;
    if (typeof value[0] !== "number" && typeof value[0] !== "string") return value;
    return value[1];
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
  function inferSubtitleLanguage(label, url = "") {
    const text = `${label} ${url}`;
    if (hasJapaneseSubtitleLanguageHint(text)) return "ja";
    if (hasEnglishSubtitleLanguageHint(text)) return "en";
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(label)) return "ja";
    return void 0;
  }
  function normalizeSubtitleLanguage(language) {
    if (!language) return void 0;
    if (/^(ja|jp|jpn)(?:[-_]|$)/i.test(language)) return "ja";
    if (/^(en|eng)(?:[-_]|$)/i.test(language)) return "en";
    return language;
  }
  function hasJapaneseSubtitleLanguageHint(text) {
    return /(^|[\s._/()[\]{}-])(?:ja|jp|jpn|japanese|nihongo|nihon-go)(?=$|[\s._/()[\]{}-])/i.test(text) || /(?:日本語|日本字幕|日(?:本)?語字幕|日文|日語|日本語字幕)/u.test(text);
  }
  function hasEnglishSubtitleLanguageHint(text) {
    return /(^|[\s._/()[\]{}-])(?:en|eng|english|native)(?=$|[\s._/()[\]{}-])/i.test(text) || /英(?:語|文)(?:字幕)?/u.test(text);
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
        rememberYouTubeVideoElementInsetBeforeResize(options.video, options.side);
        this.applyResizeIfNeeded(options, metrics);
        applyYouTubeVideoElementInset(options.video, options.side, metrics.width, metrics.height);
        return false;
      }
      const root = document.documentElement;
      if (!root) return false;
      const previousSignature = this.lastSignature;
      const preservesYouTubeBottomPlayer = shouldPreserveYouTubeBottomPlayerSize(options.side);
      if (!preservesYouTubeBottomPlayer) captureYouTubePlayerContainerBaseRects(youtubePlayerContainers(options.side));
      this.lastSignature = metrics.signature;
      root.classList.toggle("jpdb-subtitle-video-inset-left", options.side === "left");
      root.classList.toggle("jpdb-subtitle-video-inset-right", options.side === "right");
      root.classList.toggle("jpdb-subtitle-video-inset-bottom", options.side === "bottom");
      root.style.setProperty("--jpdb-subtitle-video-inset", metrics.inset);
      applyYouTubePlayerInset(options.side, metrics.width, metrics.insetPixels, metrics.height, {
        clearStableBottom: !previousSignature.startsWith("bottom:")
      });
      applyGenericVideoInsetIfNeeded(options, metrics);
      rememberYouTubeVideoElementInsetBeforeResize(options.video, options.side);
      this.applyResizeIfNeeded(options, metrics);
      applyYouTubeVideoElementInset(options.video, options.side, metrics.width, metrics.height);
      return true;
    }
    clear(video) {
      if (!hasActiveVideoInset(this.lastSignature)) return false;
      this.lastSignature = "";
      const root = document.documentElement;
      root?.classList.remove("jpdb-subtitle-video-inset-left", "jpdb-subtitle-video-inset-right", "jpdb-subtitle-video-inset-bottom");
      root?.style.removeProperty("--jpdb-subtitle-video-inset");
      const watchFlexy = document.querySelector("ytd-watch-flexy");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-width");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-player-height");
      watchFlexy?.style.removeProperty("--ytd-watch-flexy-min-player-height");
      clearYouTubeInsetTargets();
      clearYouTubeVideoElementInset(video);
      if (video) clearGenericVideoInset(video);
      resetYouTubePlayerResizeTracking();
      this.lastResizeSignature = "";
      dispatchSubtitleVideoLayoutResize();
      return true;
    }
    applyResizeIfNeeded(options, metrics) {
      if (shouldPreserveYouTubeBottomPlayerSize(options.side)) return;
      const mode = options.resizeEventMode ?? "immediate";
      if (mode === "none" || this.lastResizeSignature === metrics.signature) return;
      this.lastResizeSignature = metrics.signature;
      scheduleYouTubePlayerResize(metrics.width, metrics.height, mode);
      dispatchSubtitleVideoLayoutResize(mode);
    }
  }
  function hasActiveVideoInset(lastSignature) {
    const root = document.documentElement;
    return Boolean(lastSignature) || Boolean(root?.classList.contains("jpdb-subtitle-video-inset-left")) || Boolean(root?.classList.contains("jpdb-subtitle-video-inset-right")) || Boolean(root?.classList.contains("jpdb-subtitle-video-inset-bottom"));
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
  const GENERIC_TARGET_INSET_PROPS = ["width", "height", "max-width", "max-height", "min-width", "min-height", "margin-left", "margin-right", "justify-self", "object-fit", "box-sizing"];
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
  const YOUTUBE_PLAYER_FRAME_SELECTORS = [
    "#movie_player",
    ".html5-video-player",
    "ytm-player",
    "ytd-player",
    "ytd-reel-video-renderer",
    "ytd-shorts",
    "shorts-video",
    "shorts-page",
    "shorts-carousel",
    "#shorts-player"
  ];
  function youtubePlayerFrameForVideo(video) {
    for (const selector of YOUTUBE_PLAYER_FRAME_SELECTORS) {
      const frame = video.closest(selector);
      if (frame) return frame;
    }
    return void 0;
  }
  function subtitleVideoLayoutTarget(video) {
    if (!video) return void 0;
    if (isYouTubePage$1()) return youtubePlayerFrameForVideo(video) ?? video;
    return genericVideoLayoutTarget(video);
  }
  function transcriptAvoidanceTarget(video) {
    const videoRect = video.getBoundingClientRect();
    let best = genericVideoLayoutTarget(video);
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      if (ancestor.matches("[data-yomu-video-frame]")) return ancestor;
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
  const youtubeVideoElementInsetStyles = /* @__PURE__ */ new WeakMap();
  const youtubeStablePlayerSizeStyles = /* @__PURE__ */ new WeakMap();
  const youtubeStablePlayerSizeElements = /* @__PURE__ */ new Set();
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
      ...YOUTUBE_PLAYER_FRAME_SELECTORS,
      "ytd-watch-flexy #player-container-inner",
      "ytd-watch-flexy #player-container-outer",
      "ytd-watch-flexy #player"
    ].flatMap((selector) => Array.from(document.querySelectorAll(selector))).map((element) => element.getBoundingClientRect()).filter(usableVideoRect);
    return rects.sort(compareVideoLayoutRects)[0];
  }
  function youtubePlayerRectForVideo(video) {
    for (const selector of YOUTUBE_PLAYER_FRAME_SELECTORS) {
      const rect2 = video.closest(selector)?.getBoundingClientRect();
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
  function resizeYouTubePlayerForSubtitleLayout(width, height, mode = "immediate") {
    if (mode === "none" || !isYouTubePage$1()) return;
    scheduleYouTubePlayerResize(width, height, mode);
    dispatchSubtitleVideoLayoutResize(mode);
  }
  function applyStableYouTubePlayerVideoSize(video, width, height) {
    if (!isYouTubePage$1() || width <= 0 || height <= 0) return clearStableYouTubePlayerVideoSize();
    let changed = false;
    const widthValue = `${Math.round(width)}px`;
    const heightValue = `${Math.round(height)}px`;
    for (const element of stableYouTubePlayerVideoSizeTargets(video)) {
      rememberStableYouTubePlayerVideoSizeStyles(element);
      changed = setStableYouTubePlayerStyleIfChanged(element, "width", widthValue) || changed;
      changed = setStableYouTubePlayerStyleIfChanged(element, "height", heightValue) || changed;
      changed = setStableYouTubePlayerStyleIfChanged(element, "max-width", widthValue) || changed;
      changed = setStableYouTubePlayerStyleIfChanged(element, "max-height", heightValue) || changed;
      changed = setStableYouTubePlayerStyleIfChanged(element, "min-width", "0px") || changed;
      changed = setStableYouTubePlayerStyleIfChanged(element, "min-height", "0px") || changed;
      if (element.matches(".html5-video-container, video")) {
        changed = setStableYouTubePlayerStyleIfChanged(element, "left", "0px") || changed;
        changed = setStableYouTubePlayerStyleIfChanged(element, "top", "0px") || changed;
      }
      if (element instanceof HTMLVideoElement) {
        changed = setStableYouTubePlayerStyleIfChanged(element, "object-fit", "contain") || changed;
      }
    }
    return changed;
  }
  function clearStableYouTubePlayerVideoSize() {
    if (!youtubeStablePlayerSizeElements.size) return false;
    let changed = false;
    for (const element of Array.from(youtubeStablePlayerSizeElements)) {
      const previous = youtubeStablePlayerSizeStyles.get(element);
      if (!previous) continue;
      for (const [property, style] of Object.entries(previous)) {
        const cssProperty = property;
        const value = style.value;
        const priority = style.priority;
        if (value) element.style.setProperty(cssProperty, value, priority);
        else element.style.removeProperty(cssProperty);
        changed = true;
      }
      youtubeStablePlayerSizeStyles.delete(element);
      youtubeStablePlayerSizeElements.delete(element);
    }
    return changed;
  }
  function stableYouTubePlayerVideoSizeTargets(video) {
    const player = video?.closest("#movie_player, .html5-video-player") ?? document.querySelector("#movie_player, .html5-video-player");
    const container = player?.querySelector(".html5-video-container") ?? video?.closest(".html5-video-container");
    const media = video ?? player?.querySelector("video.html5-main-video, video") ?? document.querySelector("#movie_player video.html5-main-video, .html5-video-player video.html5-main-video, #movie_player video, .html5-video-player video");
    return uniqueElements([player, container, media].filter((element) => Boolean(element)));
  }
  function rememberStableYouTubePlayerVideoSizeStyles(element) {
    if (youtubeStablePlayerSizeStyles.has(element)) return;
    const properties = [
      "width",
      "height",
      "max-width",
      "max-height",
      "min-width",
      "min-height",
      "left",
      "top",
      "object-fit"
    ];
    youtubeStablePlayerSizeStyles.set(element, Object.fromEntries(properties.map((property) => [
      property,
      {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      }
    ])));
    youtubeStablePlayerSizeElements.add(element);
  }
  function setStableYouTubePlayerStyleIfChanged(element, property, value) {
    if (element.style.getPropertyValue(property) === value && element.style.getPropertyPriority(property) === "important") return false;
    element.style.setProperty(property, value, "important");
    return true;
  }
  function resizeYouTubePlayer(width, height) {
    if (!isYouTubePage$1()) return;
    const signature = youtubeResizeSignature(width, height);
    if (signature === lastYouTubePlayerResizeSignature) return;
    const player = youtubeMoviePlayer();
    try {
      if (canResizeYouTubePlayer(player, width, height)) {
        player.setSize(Math.round(width), Math.round(height));
        lastYouTubePlayerResizeSignature = signature;
      }
    } catch {
    }
  }
  let lastYouTubePlayerResizeSignature = "";
  let pendingImmediateVideoLayoutResize;
  let pendingVideoLayoutResize;
  let pendingYouTubePlayerResize;
  let pendingYouTubePlayerResizeSize;
  let dispatchingImmediateVideoLayoutResize = false;
  function youtubeResizeSignature(width, height) {
    return `${Math.round(width)}:${Math.round(height)}`;
  }
  function dispatchSubtitleVideoLayoutResize(mode = "immediate") {
    if (shouldSuppressSyntheticVideoLayoutResize()) return;
    if (mode === "immediate") {
      if (pendingImmediateVideoLayoutResize !== void 0) window.clearTimeout(pendingImmediateVideoLayoutResize);
      const delay = dispatchingImmediateVideoLayoutResize ? 1 : 0;
      pendingImmediateVideoLayoutResize = window.setTimeout(() => {
        pendingImmediateVideoLayoutResize = void 0;
        if (typeof window === "undefined") return;
        dispatchingImmediateVideoLayoutResize = true;
        try {
          dispatchWindowEvent(createWindowEvent("resize"));
        } finally {
          dispatchingImmediateVideoLayoutResize = false;
        }
      }, delay);
    }
    if (pendingVideoLayoutResize !== void 0) window.clearTimeout(pendingVideoLayoutResize);
    pendingVideoLayoutResize = window.setTimeout(() => {
      pendingVideoLayoutResize = void 0;
      if (typeof window === "undefined") return;
      dispatchWindowEvent(createWindowEvent("resize"));
    }, 80);
  }
  function shouldSuppressSyntheticVideoLayoutResize() {
    return isYouTubePage$1();
  }
  function resetYouTubePlayerResizeTracking() {
    lastYouTubePlayerResizeSignature = "";
    if (pendingImmediateVideoLayoutResize !== void 0) window.clearTimeout(pendingImmediateVideoLayoutResize);
    pendingImmediateVideoLayoutResize = void 0;
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
  function applyYouTubeVideoElementInset(video, side, width, height) {
    if (side === "bottom" || !video || !isYouTubePage$1()) {
      clearYouTubeVideoElementInset(video);
      return;
    }
    rememberYouTubeVideoElementInsetStyles(video);
    setStylePropertyIfChanged(video, "width", `${Math.round(width)}px`);
    setStylePropertyIfChanged(video, "height", `${Math.round(height)}px`);
    setStylePropertyIfChanged(video, "max-width", "none");
    setStylePropertyIfChanged(video, "max-height", "none");
    setStylePropertyIfChanged(video, "min-width", "0px");
    setStylePropertyIfChanged(video, "min-height", "0px");
    setStylePropertyIfChanged(video, "left", "0px");
    setStylePropertyIfChanged(video, "top", "0px");
    setStylePropertyIfChanged(video, "object-fit", "contain");
  }
  function rememberYouTubeVideoElementInsetBeforeResize(video, side) {
    if (side === "bottom" || !video || !isYouTubePage$1()) return;
    rememberYouTubeVideoElementInsetStyles(video);
  }
  function rememberYouTubeVideoElementInsetStyles(video) {
    if (youtubeVideoElementInsetStyles.has(video)) return;
    youtubeVideoElementInsetStyles.set(video, {
      width: video.style.width,
      height: video.style.height,
      maxWidth: video.style.maxWidth,
      maxHeight: video.style.maxHeight,
      minWidth: video.style.minWidth,
      minHeight: video.style.minHeight,
      left: video.style.left,
      top: video.style.top,
      objectFit: video.style.objectFit
    });
  }
  function clearYouTubeVideoElementInset(video) {
    if (!video) return;
    const previous = youtubeVideoElementInsetStyles.get(video);
    if (!previous) return;
    for (const [property, value] of Object.entries(previous)) {
      setRestoredStyleProperty(video, stylePropertyName(property), value);
    }
    youtubeVideoElementInsetStyles.delete(video);
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
      objectFit: target.style.objectFit,
      boxSizing: target.style.boxSizing
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
    const baseWidth = Math.max(0, baseRect.right - baseRect.left);
    const width = Math.round(Math.min(size, baseWidth || size));
    const margin = side === "left" ? Math.max(0, Math.round(inset - baseRect.left)) : Math.max(0, Math.round(Math.min(baseRect.right, visibleViewportWidth()) - (visibleViewportWidth() - inset)));
    const stableHeight = sideInsetStableHeight(target, height);
    setStylePropertyIfChanged(target, "box-sizing", "border-box");
    setStylePropertyIfChanged(target, "width", `${width}px`);
    setStylePropertyIfChanged(target, "max-width", `${width}px`);
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
      "objectFit",
      "boxSizing"
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
      "objectFit",
      "boxSizing"
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
      if (!shouldUseGenericVideoParent(parent, parentRect, video, videoRect)) continue;
      target = parent;
      if (parent.matches("[data-yomu-video-frame]")) break;
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
    if (!parentCentersVideoHorizontally(parentRect, videoRect)) return false;
    const likelyPlayerFrame = isLikelyGenericPlayerFrame(parent);
    const likelyPlayerWithChrome = likelyPlayerFrame && (video.controls || hasLikelyPlayerChrome(parent));
    if (rectsHaveMatchingSize(parentRect, videoRect, 3)) return likelyPlayerWithChrome;
    return likelyPlayerWithChrome || hasInsetSpace && likelyPlayerFrame;
  }
  function parentCentersVideoHorizontally(parentRect, videoRect) {
    const leftGap = videoRect.left - parentRect.left;
    const rightGap = parentRect.right - videoRect.right;
    return Math.abs(leftGap - rightGap) <= Math.max(64, videoRect.width * 0.2);
  }
  function isLikelyGenericPlayerFrame(element) {
    const text = `${element.tagName.toLowerCase()} ${element.id} ${String(element.className)} ${element.getAttribute("aria-label") ?? ""}`;
    return /(^|[-_\s])(player|video|media|stream|watch|episode|embed|lesson-player|video-card|media-player|media-provider|artplayer|xgplayer|vidstack|clappr|flowplayer|jw|jwplayer|brightcove|vjs|video-js|plyr|mux|playback|mediaelement|mejs|wistia|vimeo|dailymotion|kaltura|hls|dash|shaka|shaka-player|cld-video-player)([-_\s]|$)/i.test(text);
  }
  const PLAYER_CHROME_SELECTOR = [
    "button",
    "media-control-bar",
    "media-controls",
    '[role="button"]',
    '[role="slider"]',
    '[role="progressbar"]',
    '[part*="controls" i]',
    "[data-media-controls]",
    '[aria-label*="play" i]',
    '[aria-label*="pause" i]',
    '[aria-label*="seek" i]',
    '[aria-label*="volume" i]',
    '[class*="control" i]',
    '[class*="controlbar" i]',
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
  function unescapeYouTubeConfigString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  }
  function readYouTubeConfigStringFromScripts(key) {
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
  const YOUTUBE_PREVIEW_CONTAINER_SELECTOR = "ytd-video-preview, #inline-preview-player, ytd-moving-thumbnail-renderer, ytm-video-preview";
  function isYouTubeFeedPreviewVideo(video) {
    return Boolean(video?.closest(YOUTUBE_PREVIEW_CONTAINER_SELECTOR));
  }
  function isYouTubeOwnedVideoElement(video) {
    if (!isYouTubePage()) return true;
    if (isYouTubeFeedPreviewVideo(video)) return false;
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
    if (!isNonNullObject(source)) return track.youtubeTrack ?? source;
    return {
      ...source,
      translationLanguage
    };
  }
  function youtubePlayerTranslationLanguage(track) {
    const raw = track.youtubeTrack;
    if (isNonNullObject(raw) && raw.translationLanguage) return raw.translationLanguage;
    const languageCode = track.targetLanguage || track.language;
    if (!languageCode) return null;
    return {
      languageCode,
      languageName: { simpleText: languageCode }
    };
  }
  function youtubePlayerTranslationSource(track) {
    const raw = track.youtubeTrack;
    if (!isNonNullObject(raw)) return null;
    return raw.source ?? null;
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
  function readYouTubeConfigString$1(key) {
    const ytcfg = window.ytcfg;
    const value = ytcfg?.get?.(key) ?? ytcfg?.data_?.[key];
    if (typeof value === "string" && value) return value;
    return readYouTubeConfigStringFromScripts(key);
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
  const REDIRECT_FLAG = "__yomuSubtitleFullscreenRedirect";
  const STYLE_ID = "yomu-subtitle-fullscreen-redirect-style";
  const INLINE_FULLSCREEN_CLASS = "jpdb-subtitle-inline-fullscreen";
  const INLINE_FULLSCREEN_ATTRIBUTE = "data-yomu-inline-fullscreen";
  function fullscreenRedirectBootstrap(win) {
    const flag = "__yomuSubtitleFullscreenRedirect";
    const inlineKey = "__yomuSubtitleInlineFullscreenElement";
    const inlineClass = "jpdb-subtitle-inline-fullscreen";
    const inlineAttribute = "data-yomu-inline-fullscreen";
    if (win.document.documentElement.classList.contains(inlineClass)) {
      const marked = win.document.querySelector(`[${inlineAttribute}="true"]`);
      if (!marked || !marked.isConnected) {
        win.document.documentElement.classList.remove(inlineClass);
        delete win[inlineKey];
      }
    }
    if (win[flag]) return;
    const selector = "#movie_player, .html5-video-player, ytm-player, ytd-player, [data-yomu-video-frame]";
    const elementCtor = win.HTMLElement;
    const videoCtor = win.HTMLVideoElement;
    const documentCtor = win.Document;
    const proto = elementCtor?.prototype;
    const videoProto = videoCtor?.prototype;
    const documentProto = documentCtor?.prototype;
    if (!proto || !videoCtor || !videoProto) return;
    const methods = ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen", "mozRequestFullScreen", "msRequestFullscreen"];
    const requestNatives = {};
    for (const name of methods) {
      const original = proto[name];
      if (typeof original !== "function") continue;
      const native = original;
      requestNatives[name] = native;
      proto[name] = function patchedRequestFullscreen(...args) {
        const container = this instanceof videoCtor ? fullscreenContainerForVideo(this) : null;
        if (container && container !== this) return requestElementFullscreenOrInline(container, args, () => native.apply(this, args));
        return native.apply(this, args);
      };
    }
    const enterVideoFullscreenMethods = ["webkitEnterFullscreen", "webkitEnterFullScreen"];
    for (const name of enterVideoFullscreenMethods) {
      const original = videoProto[name];
      if (typeof original !== "function") continue;
      const native = original;
      videoProto[name] = function patchedVideoFullscreen(...args) {
        const container = fullscreenContainerForVideo(this);
        if (container && container !== this) return requestElementFullscreenOrInline(container, args, () => native.apply(this, args));
        return native.apply(this, args);
      };
    }
    const setPresentationMode = videoProto.webkitSetPresentationMode;
    if (typeof setPresentationMode === "function") {
      const native = setPresentationMode;
      videoProto.webkitSetPresentationMode = function patchedPresentationMode(mode, ...args) {
        if (mode === "fullscreen") {
          const container = fullscreenContainerForVideo(this);
          if (container && container !== this) return requestElementFullscreenOrInline(container, args, () => native.apply(this, [mode, ...args]));
        }
        if (mode === "inline" || mode === "picture-in-picture") exitInlineFullscreen();
        return native.apply(this, [mode, ...args]);
      };
    }
    const exitVideoFullscreenMethods = ["webkitExitFullscreen", "webkitExitFullScreen"];
    for (const name of exitVideoFullscreenMethods) {
      const original = videoProto[name];
      if (typeof original !== "function") continue;
      const native = original;
      videoProto[name] = function patchedVideoExitFullscreen(...args) {
        if (activeInlineFullscreenElement()) return exitInlineFullscreen();
        return native.apply(this, args);
      };
    }
    const exitDocumentFullscreenMethods = ["exitFullscreen", "webkitExitFullscreen", "webkitCancelFullScreen", "mozCancelFullScreen", "msExitFullscreen"];
    if (documentProto) {
      for (const name of exitDocumentFullscreenMethods) {
        const original = documentProto[name];
        if (typeof original !== "function") continue;
        const native = original;
        documentProto[name] = function patchedDocumentExitFullscreen(...args) {
          if (activeInlineFullscreenElement()) return exitInlineFullscreen();
          return native.apply(this, args);
        };
      }
    }
    win[flag] = true;
    function fullscreenContainerForVideo(video) {
      const closest = video.closest(selector);
      if (closest) return closest;
      if (!isMobileYouTube()) return null;
      return win.document.querySelector("ytm-player, #movie_player, .html5-video-player");
    }
    function requestElementFullscreenOrInline(target, args, nativeVideoFallback) {
      const fallback = () => nativeVideoFallback ? nativeVideoFallback() : enterInlineFullscreen(target);
      for (const name of methods) {
        const native = requestNatives[name];
        if (!native || typeof target[name] !== "function") continue;
        try {
          return fallbackInlineOnRequestFailure(native.apply(target, args), fallback);
        } catch {
          return fallback();
        }
      }
      return fallback();
    }
    function fallbackInlineOnRequestFailure(result, fallback) {
      const promise = result;
      return typeof promise?.catch === "function" ? promise.catch(() => fallback()) : result;
    }
    let inlineFullscreenConnectionWatch;
    const exitInlineFullscreenOnNavigation = () => {
      if (activeInlineFullscreenElement() || win.document.documentElement.classList.contains(inlineClass)) exitInlineFullscreen();
    };
    for (const name of ["yt-navigate-finish", "popstate", "pagehide"]) {
      win.addEventListener(name, exitInlineFullscreenOnNavigation, true);
      win.document.addEventListener(name, exitInlineFullscreenOnNavigation, true);
    }
    function armInlineFullscreenSession(target) {
      disarmInlineFullscreenSession();
      inlineFullscreenConnectionWatch = win.setInterval(() => {
        if (!target.isConnected) exitInlineFullscreen();
      }, 500);
    }
    function disarmInlineFullscreenSession() {
      if (inlineFullscreenConnectionWatch !== void 0) win.clearInterval(inlineFullscreenConnectionWatch);
      inlineFullscreenConnectionWatch = void 0;
    }
    function enterInlineFullscreen(target) {
      const current = activeInlineFullscreenElement();
      if (current && current !== target) clearInlineFullscreenElement(current);
      armInlineFullscreenSession(target);
      target.setAttribute(inlineAttribute, "true");
      if (!target.hasAttribute("fullscreen")) {
        target.setAttribute("fullscreen", "");
        target.dataset.yomuInlineFullscreenAttr = "true";
      }
      if (!target.classList.contains("ytp-fullscreen")) {
        target.classList.add("ytp-fullscreen");
        target.dataset.yomuInlineYtpFullscreenClass = "true";
      }
      if (!target.classList.contains("fullscreen")) {
        target.classList.add("fullscreen");
        target.dataset.yomuInlineFullscreenClass = "true";
      }
      win.document.documentElement.classList.add(inlineClass);
      win[inlineKey] = target;
      dispatchFullscreenLikeEvents();
      return typeof win.Promise?.resolve === "function" ? win.Promise.resolve() : void 0;
    }
    function exitInlineFullscreen() {
      disarmInlineFullscreenSession();
      const current = activeInlineFullscreenElement();
      if (!current) {
        if (win.document.documentElement.classList.contains(inlineClass)) {
          win.document.documentElement.classList.remove(inlineClass);
          delete win[inlineKey];
          dispatchFullscreenLikeEvents();
        }
        return typeof win.Promise?.resolve === "function" ? win.Promise.resolve() : void 0;
      }
      clearInlineFullscreenElement(current);
      win.document.documentElement.classList.remove(inlineClass);
      delete win[inlineKey];
      dispatchFullscreenLikeEvents();
      return typeof win.Promise?.resolve === "function" ? win.Promise.resolve() : void 0;
    }
    function clearInlineFullscreenElement(element) {
      element.removeAttribute(inlineAttribute);
      if (element.dataset.yomuInlineFullscreenAttr === "true") element.removeAttribute("fullscreen");
      if (element.dataset.yomuInlineYtpFullscreenClass === "true") element.classList.remove("ytp-fullscreen");
      if (element.dataset.yomuInlineFullscreenClass === "true") element.classList.remove("fullscreen");
      delete element.dataset.yomuInlineFullscreenAttr;
      delete element.dataset.yomuInlineYtpFullscreenClass;
      delete element.dataset.yomuInlineFullscreenClass;
    }
    function activeInlineFullscreenElement() {
      const current = win[inlineKey];
      if (elementCtor && current instanceof elementCtor) return current;
      return win.document.querySelector(`[${inlineAttribute}="true"]`);
    }
    function dispatchFullscreenLikeEvents() {
      for (const eventName of ["fullscreenchange", "webkitfullscreenchange"]) {
        try {
          win.document.dispatchEvent(new win.Event(eventName));
        } catch {
        }
      }
    }
    function isMobileYouTube() {
      return /^m\.youtube\.com$/i.test(win.location.hostname);
    }
  }
  function fullscreenRedirectStyleText() {
    const fill = "width:100%!important;height:100%!important;left:0!important;top:0!important;";
    return [
      `#movie_player:fullscreen video.html5-main-video{${fill}}`,
      "#movie_player:fullscreen .html5-video-container{width:100%!important;height:100%!important;}",
      `#movie_player:-webkit-full-screen video.html5-main-video{${fill}}`,
      "#movie_player:-webkit-full-screen .html5-video-container{width:100%!important;height:100%!important;}",
      `[data-yomu-video-frame]:fullscreen video{${fill}}`,
      `[data-yomu-video-frame]:-webkit-full-screen video{${fill}}`,
      `html.${INLINE_FULLSCREEN_CLASS},html.${INLINE_FULLSCREEN_CLASS} body{width:100%!important;height:100%!important;overflow:hidden!important;}`,
      // Yomu's inline CSS-fullscreen keeps the video inside the normal document
      // flow (the player is not promoted to the browser top layer), so YouTube's
      // native fullscreen chrome-hide — which assumes a real Fullscreen API
      // transition — never runs and the masthead/search bar stay on screen.
      // Hide YouTube's top chrome ourselves, strictly scoped to the inline-
      // fullscreen root class so normal browsing is untouched. Selectors are the
      // real desktop (ytd-masthead, and the generic #masthead / #masthead-container
      // scoped under ytd-app so they can't hide same-named elements on a
      // non-YouTube page during inline fullscreen) and mobile
      // (ytm-mobile-topbar-renderer / ytm-app-header) top-bar elements already
      // recognised elsewhere in the reader; the player's own controls and the
      // subtitle overlay live under the player, not these, so they are unaffected.
      `html.${INLINE_FULLSCREEN_CLASS} :is(ytd-masthead,ytd-app #masthead,ytd-app #masthead-container,ytm-mobile-topbar-renderer,ytm-app-header){display:none!important;}`,
      `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;z-index:2147483640!important;background:#000!important;}`,
      `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"] video{${fill}object-fit:contain!important;}`,
      `[${INLINE_FULLSCREEN_ATTRIBUTE}="true"] .html5-video-container{width:100%!important;height:100%!important;}`
    ].join("\n");
  }
  function injectFullscreenRedirectStyle() {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = fullscreenRedirectStyleText();
    parent.append(style);
  }
  function injectFullscreenRedirectScript() {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const source = `;(${fullscreenRedirectBootstrap.toString()})(window);`;
    try {
      const script = document.createElement("script");
      const nonce = [...document.querySelectorAll("script[nonce]")].map((el) => el.getAttribute("nonce")).find(Boolean);
      if (nonce) script.setAttribute("nonce", nonce);
      const trusted = createTrustedRedirectScript(source);
      if (trusted) script.textContent = trusted;
      else script.textContent = source;
      parent.append(script);
      script.remove();
    } catch {
      return false;
    }
    const pageWin = globalThis.unsafeWindow ?? window;
    return Boolean(pageWin[REDIRECT_FLAG]);
  }
  function createTrustedRedirectScript(code) {
    try {
      const factory = globalThis.trustedTypes;
      if (!factory?.createPolicy) return null;
      const policy = factory.createPolicy("yomu-subtitle-fullscreen-redirect", { createScript: (value) => value });
      return policy?.createScript ? policy.createScript(code) : null;
    } catch {
      return null;
    }
  }
  function clearStaleInlineFullscreenState() {
    if (!document.documentElement.classList.contains(INLINE_FULLSCREEN_CLASS)) return;
    const marked = document.querySelector(`[${INLINE_FULLSCREEN_ATTRIBUTE}="true"]`);
    if (marked && marked.isConnected) return;
    document.documentElement.classList.remove(INLINE_FULLSCREEN_CLASS);
  }
  function installSubtitleFullscreenRedirect() {
    clearStaleInlineFullscreenState();
    injectFullscreenRedirectStyle();
    const unsafe = globalThis.unsafeWindow;
    const differentRealm = Boolean(unsafe) && unsafe !== globalThis;
    if (differentRealm && unsafe) {
      if (unsafe[REDIRECT_FLAG]) return;
      if (injectFullscreenRedirectScript()) return;
    }
    fullscreenRedirectBootstrap(unsafe ?? window);
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
      const json = await requestJson(url, {
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
        globalThis.setTimeout(poll, 50);
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
    return inferSubtitleLanguage(track.label, track.language) === "ja";
  }
  function isEnglishSubtitleTrack(track) {
    const language = explicitSubtitleLanguage(track);
    if (language) return language === "en";
    return inferSubtitleLanguage(track.label, track.language) === "en";
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
        ${renderDrawerHead({
      mode: "tracks",
      title: uiText(language, "subtitlesTitle"),
      meta: subtitleDrawerMetaText({
        mode: "tracks",
        count: state.tracks.length,
        tracks: state.tracks,
        selectedTrackId: state.selectedTrackId,
        secondaryTrackId: state.secondaryTrackId,
        language
      }),
      metaTitle: subtitleDrawerMetaText({
        mode: "tracks",
        count: state.tracks.length,
        tracks: state.tracks,
        selectedTrackId: state.selectedTrackId,
        secondaryTrackId: state.secondaryTrackId,
        language,
        compact: false
      }),
      canShowLines: state.hasTranscriptSurface,
      showModeTabs: state.hasTranscriptSurface,
      options: {
        placement: state.placement,
        pausePanelEnabled: state.pausePanelEnabled,
        menuOpen: state.optionsMenuOpen,
        language
      }
    })}
        <div class="jpdb-subtitle-list-scroll"${state.virtual ? ' data-virtualized="true"' : ""}>
            <div class="jpdb-subtitle-track-tools">
                <button type="button" data-action="load">${escapeHtml(uiText(language, "loadJapaneseSubtitles"))}</button>
                <button type="button" data-action="load-secondary">${escapeHtml(uiText(language, "loadNativeSubtitles"))}</button>
                <a href="${escapeHtml(jimakuAnimeSearchUrl(state.animeSearchQuery))}" target="_blank" rel="noopener" data-jimaku-anime-search>${escapeHtml(uiText(language, "searchAnimeSubtitles"))}</a>
            </div>
            <div class="jpdb-subtitle-track-summary">${escapeHtml(trackPanelSummaryText(state.autoDetected, language))}</div>
            <div class="jpdb-subtitle-track-hint">${escapeHtml(uiText(language, "subtitleTracksHint"))}</div>
            ${state.virtual ? trackVirtualSpacer(state.virtual.topSpacer) : ""}
            ${state.tracks.length ? trackPanelRows(state).map((track) => renderSubtitleTrackRow(track, state)).join("") : ""}
            ${state.virtual ? trackVirtualSpacer(state.virtual.bottomSpacer) : ""}
        </div>
        <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeSubtitleTracksPanel"))}"></div>
    `;
  }
  function trackPanelRows(state) {
    return state.virtual ? state.tracks.slice(state.virtual.start, state.virtual.end) : state.tracks;
  }
  function trackVirtualSpacer(height) {
    return height > 0 ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>` : "";
  }
  function jimakuAnimeSearchUrl(query = "") {
    const trimmed = query.trim();
    if (!trimmed) return "https://jimaku.cc/";
    return `https://jimaku.cc/opensearch/redirect?anime=true&query=${encodeURIComponent(trimmed)}`;
  }
  function subtitleDrawerMetaText(options) {
    const primaryTrack = options.tracks.find((track) => track.id === options.selectedTrackId);
    const secondaryTrack = options.tracks.find((track) => track.id === options.secondaryTrackId);
    const label = options.compact === false ? localizedSubtitleTrackLabel : compactSubtitleTrackLabel;
    const primary = primaryTrack ? label(primaryTrack, options.language) : void 0;
    const secondary = secondaryTrack ? label(secondaryTrack, options.language) : void 0;
    return drawerMetaParts(options.mode, options.count, primary, secondary, options.language).filter(Boolean).join(" · ");
  }
  function renderSubtitleTrackRow(track, state) {
    const isPrimary = track.id === state.selectedTrackId;
    const isSecondary = track.id === state.secondaryTrackId;
    const language = state.language;
    return `
        <div class="jpdb-subtitle-track-row ${isPrimary || isSecondary ? "active" : ""}" data-track-id="${escapeHtml(track.id)}">
            <div class="jpdb-subtitle-track-title">
                    <strong title="${escapeHtml(localizedSubtitleTrackLabel(track, language))}">${escapeHtml(compactSubtitleTrackLabel(track, language))}</strong>
                    <span>${escapeHtml(formatTrackKind(track.kind, language))}</span>
                </div>
            <span>${escapeHtml(trackLanguageLabel(track, language))}${trackRoleText(isPrimary, isSecondary, language)}${trackStatusText(track, language)}</span>
            <div class="jpdb-subtitle-track-actions">
                <button type="button" data-action="primary-track" aria-pressed="${isPrimary}">${escapeHtml(uiText(language, isPrimary ? "unsetPrimarySubtitles" : "primarySubtitles"))}</button>
                <button type="button" data-action="secondary-track" aria-pressed="${isSecondary}">${escapeHtml(uiText(language, isSecondary ? "unsetNativeSubtitles" : "nativeSubtitles"))}</button>
            </div>
            ${isPrimary || isSecondary ? renderSubtitleTrackTimingControls(track, language) : ""}
        </div>
    `;
  }
  function renderSubtitleTrackTimingControls(track, language) {
    const timing = track.timing;
    if (!timing) return "";
    const disabled = timing.canAdjust ? "" : "disabled";
    const timingLabel = uiText(language, "subtitleTrackTiming");
    const previousLabel = uiText(language, "subtitleOffsetPrevious");
    const nextLabel = uiText(language, "subtitleOffsetNext");
    const previousShort = uiText(language, "subtitleOffsetPreviousShort");
    const nextShort = uiText(language, "subtitleOffsetNextShort");
    const earlierLabel = uiText(language, "subtitleOffsetEarlier");
    const laterLabel = uiText(language, "subtitleOffsetLater");
    const resetLabel = uiText(language, "resetSubtitleOffset");
    return `
        <div class="jpdb-subtitle-track-offset" role="group" aria-label="${escapeHtml(timingLabel)}">
            <span class="jpdb-subtitle-track-offset-value" title="${escapeHtml(timingLabel)}">${escapeHtml(formatSubtitleTrackOffset(timing.offsetSeconds))}</span>
            <button type="button" data-action="offset-previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}" ${timing.canAlignPrevious ? "" : "disabled"}>‹ ${escapeHtml(previousShort)}</button>
            <button type="button" data-action="offset-earlier" title="${escapeHtml(earlierLabel)}" aria-label="${escapeHtml(earlierLabel)}" ${disabled}>−100</button>
            <button type="button" data-action="offset-later" title="${escapeHtml(laterLabel)}" aria-label="${escapeHtml(laterLabel)}" ${disabled}>+100</button>
            <button type="button" data-action="offset-next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}" ${timing.canAlignNext ? "" : "disabled"}>${escapeHtml(nextShort)} ›</button>
            <button type="button" data-action="offset-reset" title="${escapeHtml(resetLabel)}" aria-label="${escapeHtml(resetLabel)}" ${disabled}>0</button>
        </div>
    `;
  }
  function formatSubtitleTrackOffset(seconds) {
    const roundedMs = Math.round(seconds * 1e3);
    const value = roundedMs / 1e3;
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}s`;
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
  function compactSubtitleTrackLabel(track, language) {
    const label = localizedSubtitleTrackLabel(track, language);
    return compactAutoTranslatedTrackLabel(label) || compactSyntheticTranslationTrackLabel(label, language) || compactAutoGeneratedTrackLabel(label, language) || label;
  }
  function compactAutoTranslatedTrackLabel(label) {
    const match = label.match(/^\s*(.+?)\s+\u00b7\s+auto-translated from\s+(.+?)\s*$/iu);
    if (!match) return "";
    return `${match[1]} <- ${compactTrackSourceLabel(match[2] ?? "")}`;
  }
  function compactSyntheticTranslationTrackLabel(label, language) {
    const prefix = uiText(language, "translation");
    const match = label.match(new RegExp(`^${escapeRegExp(prefix)}\\s*\\((.+)\\)$`, "iu"));
    if (!match) return "";
    return `${prefix}: ${compactTrackSourceLabel(match[1] ?? "")}`;
  }
  function compactAutoGeneratedTrackLabel(label, language) {
    const localizedAuto = uiText(language, "autoGeneratedSubtitle");
    const patterns = [
      new RegExp(`^(.+?)\\s+\\u00b7\\s+${escapeRegExp(localizedAuto)}$`, "u"),
      /^(.+?)\s+\u00b7\s+auto-generated$/iu
    ];
    const match = patterns.map((pattern) => label.match(pattern)).find(Boolean);
    return match ? `${match[1]} (${localizedAuto})` : "";
  }
  function compactTrackSourceLabel(label) {
    return label.replace(/\s+\u00b7\s+auto-generated$/iu, "").replace(/\s+\u00b7\s+.+$/u, "").trim();
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
  function syncSubtitleLineNavigationButton(button, action, hasLines, hasVideo, language) {
    button.hidden = !hasLines;
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
        button.title = `${groupLabel}: ${uiText(language, buttonPlacement)}`;
      }
    }
    const optionsToggle = panel.querySelector('[data-action="panel-options"]');
    if (optionsToggle) setInnerHtml(optionsToggle, subtitleIcon(transcriptPlacementIcon(placement)));
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
  function applySubtitleNativeTrackModes(state) {
    const youtubePage = isYouTubePage();
    const hasYomuCaptionContent = Boolean(state.hasPrimaryCues || state.currentCueText);
    const yomuCaptionsActive = Boolean(state.suppressNativeCaptions || state.overlayVisible && (state.selectedTrackId || hasYomuCaptionContent));
    if (!youtubePage) return applyGenericNativeTrackModes(state, yomuCaptionsActive);
    document.documentElement.classList.remove(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS);
    return applyYouTubeNativeTrackModes(state, yomuCaptionsActive);
  }
  function applyGenericNativeTrackModes(state, yomuCaptionsActive) {
    for (const option of state.tracks) {
      if (!option.track) continue;
      if (isSelectedSubtitleTrack(option, state)) {
        if (yomuCaptionsActive) option.track.mode = "hidden";
        else ensureTextTrackReadable(option.track);
        continue;
      }
      if (yomuCaptionsActive) option.track.mode = "disabled";
    }
    if (yomuCaptionsActive && (state.suppressCaptionPlayerUi ?? true)) suppressGenericCaptionPlayerUi(state.video);
    document.documentElement.classList.toggle(GENERIC_NATIVE_CAPTIONS_SUPPRESSED_CLASS, yomuCaptionsActive);
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
    '[data-uia="player-subtitle-text"]',
    '[data-uia="player-captions-text"]',
    ".player-timedtext-text-container",
    ".player-timedtext-text-container span",
    ".ytp-caption-segment"
  ];
  const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(",");
  const CAPTION_CONTAINER_SELECTORS = '.caption-visual-line,.captions-text,[data-purpose="captions-text"],[data-uia="player-subtitle-text"],[data-uia="player-captions-text"],.player-timedtext-text-container,.caption-window,.ytp-caption-segment';
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
  const PAGE_METADATA_TEXT_SELECTOR = [
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "nav",
    "aside",
    "footer",
    '[role="navigation"]',
    '[role="menu"]',
    '[role="menubar"]',
    "[aria-current]"
  ].join(",");
  const PAGE_METADATA_TEXT_NAME_PATTERN = /(^|[-_\s])(?:title|metadata|meta|tag|tags|category|categories|breadcrumb|nav|navbar|menu|channel|author|username|user-name|description)([-_\s]|$)/iu;
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
    if (!allowsChildText && isLikelyPageMetadataText(element)) return false;
    if (text.split("\n").length > 4) return false;
    return allowsChildText || !hasCaptionChildText(element, options);
  }
  function containsReaderRootOrPlayerChrome(element) {
    const knownCaptionInPlayerChrome = element.matches(".ytp-caption-segment, .caption-window");
    return Boolean(element.querySelector("[data-jpdb-reader-root]")) || Boolean(element.matches(PLAYER_CHROME_CONTAINER_SELECTOR)) || Boolean(element.querySelector(PLAYER_CHROME_INTERACTIVE_SELECTOR)) || Boolean(element.closest(PLAYER_CHROME_CONTAINER_SELECTOR) && !knownCaptionInPlayerChrome);
  }
  function isLikelyPlayerChromeText(text) {
    const hits = PLAYER_CHROME_TEXT_PATTERNS.filter((pattern) => pattern.test(text)).length;
    return hits >= 3;
  }
  function isLikelyReaderStatusText(text) {
    return READER_STATUS_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  }
  function isLikelyPageMetadataText(element) {
    if (element.closest(PAGE_METADATA_TEXT_SELECTOR)) return true;
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (PAGE_METADATA_TEXT_NAME_PATTERN.test(elementNameForMetadataCheck(current))) return true;
    }
    return false;
  }
  function elementNameForMetadataCheck(element) {
    return [
      element.id,
      String(element.className),
      element.getAttribute("role") ?? "",
      element.getAttribute("aria-label") ?? ""
    ].join(" ");
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
    const horizontalOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = captionOverlapsVideo(rect, videoRect, overlapRatio);
    const belowVideo = captionSitsBelowVideo(rect, videoRect, overlapRatio);
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    if (tooLarge || !(overlapsVideo || belowVideo)) return false;
    return !strict || isCaptionOverlaidOnVideo(rect, videoRect) && isCaptionCenteredOnVideo(rect, videoRect);
  }
  function isCaptionOverlaidOnVideo(rect, videoRect) {
    const bottomSlack = Math.min(24, Math.max(4, videoRect.height * 0.04));
    return rect.top >= videoRect.top && rect.bottom <= videoRect.bottom + bottomSlack;
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
  function stableHash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function stableHashBase36(value) {
    return stableHash32(value).toString(36);
  }
  function isApiMiningEnabled(settings) {
    return settings.jpdbMiningEnabled || settings.bunproMiningEnabled || settings.yomuLocalSrsEnabled;
  }
  const SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS = 1200;
  const SUBTITLE_EMPTY_PARSE_RETRY_MS = 2500;
  function canParseSubtitleTranscriptRows(settings) {
    return !settings.annotationsPaused && hasSubtitleParserSource();
  }
  function shouldApplyParsedTranscriptHtml(target, key, provisional = false, refreshProvisional = false) {
    if (target.dataset.parseKey !== key) return false;
    if (target.dataset.parsedKey !== key) return true;
    if (provisional) return refreshProvisional;
    return target.dataset.parsedProvisional === "true";
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
      `parser:${settings.parserProvider}`,
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
  const SUBTITLE_REQUEST_MAX_ATTEMPTS = 2;
  const SUBTITLE_REQUEST_RETRY_DELAY_MS = 250;
  class SubtitleRequestError extends Error {
    constructor(message, retryable, status) {
      super(message);
      this.retryable = retryable;
      this.status = status;
      this.name = "SubtitleRequestError";
    }
  }
  async function requestSubtitleText(url) {
    if (/^(blob|data):/i.test(url)) {
      return fetchSubtitleText(url);
    }
    let lastError;
    for (let attempt = 0; attempt < SUBTITLE_REQUEST_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await requestSubtitleTextOnce(url);
      } catch (error) {
        lastError = error;
        if (!isRetryableSubtitleRequestError(error) || attempt + 1 >= SUBTITLE_REQUEST_MAX_ATTEMPTS) throw error;
        await delaySubtitleRetry();
      }
    }
    throw lastError;
  }
  function requestSubtitleTextOnce(url) {
    if (isYouTubeTimedTextUrl(url)) {
      return requestSubtitleTextWithUserscript(url).catch((error) => shouldTryAlternateSubtitleTransport(error) ? fetchSubtitleText(url) : Promise.reject(error));
    }
    if (shouldFetchSubtitleInPageContext(url)) {
      return fetchSubtitleText(url).catch((error) => shouldTryAlternateSubtitleTransport(error) ? requestSubtitleTextWithUserscript(url, error) : Promise.reject(error));
    }
    return fetchSubtitleText(url, "omit").catch((error) => shouldTryAlternateSubtitleTransport(error) ? requestSubtitleTextWithUserscript(url, error) : Promise.reject(error));
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
          onload: (response) => {
            try {
              assertCompleteSubtitleStatus(response.status);
              resolve(String(response.responseText ?? response.response ?? ""));
            } catch (error) {
              reject(error);
            }
          },
          onerror: () => reject(new SubtitleRequestError("Subtitle request failed during transport.", true)),
          ontimeout: () => reject(new SubtitleRequestError("Subtitle request timed out.", true))
        });
      });
    }
    if (pageFetchError) return Promise.reject(pageFetchError);
    return fetchSubtitleText(url);
  }
  function fetchSubtitleText(url, credentials = "include") {
    return fetch(url, { credentials, signal: subtitleRequestSignal() }).then((response) => {
      assertCompleteSubtitleStatus(response.status);
      return response.text();
    });
  }
  function assertCompleteSubtitleStatus(status) {
    if (status >= 200 && status < 300 && status !== 206) return;
    if (status === 206) throw new SubtitleRequestError("Subtitle request returned a partial response (206).", true, status);
    throw new SubtitleRequestError(`Subtitle request failed (${status}).`, isTransientSubtitleStatus(status), status);
  }
  function isTransientSubtitleStatus(status) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  function isRetryableSubtitleRequestError(error) {
    return !(error instanceof SubtitleRequestError) || error.retryable;
  }
  function shouldTryAlternateSubtitleTransport(error) {
    if (!(error instanceof SubtitleRequestError)) return true;
    return error.status === void 0 || error.status === 0 || error.status === 401 || error.status === 403;
  }
  function delaySubtitleRetry() {
    return new Promise((resolve) => globalThis.setTimeout(resolve, SUBTITLE_REQUEST_RETRY_DELAY_MS));
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
  function cardKey(card) {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
  }
  const BATCH_UNKNOWN_STATES = /* @__PURE__ */ new Set(["new", "not-in-deck", "in-deck"]);
  const BATCH_ALREADY_QUEUED_STATES = /* @__PURE__ */ new Set(["new", "in-deck"]);
  const BATCH_BLOCKED_STATES = /* @__PURE__ */ new Set(["blacklisted", "never-forget", "redundant", "suspended"]);
  const BATCH_PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
  const MIN_I_PLUS_ONE_CARD_COUNT = 3;
  function buildSubtitleBatchMiningCandidates(rows) {
    const drafts = /* @__PURE__ */ new Map();
    for (const row of rows) addBatchMiningRowCandidates(drafts, row);
    return Array.from(drafts.values()).sort(compareBatchMiningCandidates).map(({ sortKey: _sortKey, ...candidate }) => candidate);
  }
  function subtitleBatchMiningSummary(rows, candidates) {
    return {
      rows: rows.length,
      parsedRows: rows.filter((row) => row.tokens.length > 0).length,
      candidates: candidates.length,
      iPlusOne: candidates.filter((candidate) => candidate.iPlusOne).length,
      selected: candidates.filter((candidate) => candidate.selected).length
    };
  }
  function subtitleBatchMiningTsv(candidates) {
    return [
      ["expression", "reading", "state", "occurrences", "sentence"].join("	"),
      ...candidates.map((candidate) => [
        candidate.card.spelling,
        candidate.card.reading,
        candidate.state,
        String(candidate.occurrences),
        candidate.sentence
      ].map(tsvCell).join("	"))
    ].join("\n");
  }
  function isSubtitleBatchMiningCandidateSelectedByDefault(card, iPlusOne) {
    if (!iPlusOne) return false;
    const states = normalizeCardStates(card.cardState);
    return !states.some((state) => BATCH_ALREADY_QUEUED_STATES.has(state));
  }
  function addBatchMiningRowCandidates(drafts, row) {
    const entries = batchMiningRowEntries(row);
    const sentenceCardCount = entries.length;
    const unknownEntries = entries.filter((entry) => isBatchMiningUnknownCard(entry.card));
    const unknownCardCount = unknownEntries.length;
    const iPlusOne = sentenceCardCount >= MIN_I_PLUS_ONE_CARD_COUNT && unknownCardCount === 1;
    for (const entry of unknownEntries) {
      if (isBatchMiningBlockedCard(entry.card)) continue;
      const candidate = batchMiningCandidate(row, entry.card, sentenceCardCount, unknownCardCount, iPlusOne);
      mergeBatchMiningCandidate(drafts, candidate);
    }
  }
  function batchMiningRowEntries(row) {
    const entries = /* @__PURE__ */ new Map();
    for (const token of row.tokens) {
      const card = token.card;
      if (!card.spelling.trim() || isBatchMiningParticleCard(card)) continue;
      const key = cardKey(card);
      if (!entries.has(key)) entries.set(key, card);
    }
    return Array.from(entries, ([key, card]) => ({ key, card }));
  }
  function batchMiningCandidate(row, card, sentenceCardCount, unknownCardCount, iPlusOne) {
    const state = primaryCardState(card.cardState);
    return {
      key: subtitleBatchMiningCandidateKey(card),
      card,
      sentence: row.text,
      rowIndex: row.rowIndex,
      cueIndex: row.cueIndex,
      start: row.start,
      end: row.end,
      occurrences: 1,
      sentenceCardCount,
      unknownCardCount,
      iPlusOne,
      selected: isSubtitleBatchMiningCandidateSelectedByDefault(card, iPlusOne),
      state,
      sortKey: batchMiningSortKey(card, row.rowIndex, iPlusOne, unknownCardCount, 1)
    };
  }
  function mergeBatchMiningCandidate(drafts, candidate) {
    const current = drafts.get(candidate.key);
    if (!current) {
      drafts.set(candidate.key, candidate);
      return;
    }
    current.occurrences += 1;
    current.sortKey.occurrenceRank = -current.occurrences;
    if (!shouldReplaceBatchMiningExample(current, candidate)) return;
    drafts.set(candidate.key, {
      ...candidate,
      occurrences: current.occurrences,
      selected: current.selected || candidate.selected,
      sortKey: batchMiningSortKey(candidate.card, candidate.rowIndex, candidate.iPlusOne, candidate.unknownCardCount, current.occurrences)
    });
  }
  function shouldReplaceBatchMiningExample(current, candidate) {
    if (candidate.iPlusOne !== current.iPlusOne) return candidate.iPlusOne;
    if (candidate.unknownCardCount !== current.unknownCardCount) return candidate.unknownCardCount < current.unknownCardCount;
    if (frequencyRank(candidate.card) !== frequencyRank(current.card)) return frequencyRank(candidate.card) < frequencyRank(current.card);
    return candidate.rowIndex < current.rowIndex;
  }
  function compareBatchMiningCandidates(a, b) {
    return a.sortKey.iPlusOneRank - b.sortKey.iPlusOneRank || a.sortKey.unknownCount - b.sortKey.unknownCount || a.sortKey.frequency - b.sortKey.frequency || a.sortKey.occurrenceRank - b.sortKey.occurrenceRank || a.sortKey.rowIndex - b.sortKey.rowIndex || a.card.spelling.localeCompare(b.card.spelling, "ja");
  }
  function batchMiningSortKey(card, rowIndex, iPlusOne, unknownCount, occurrences) {
    return {
      iPlusOneRank: iPlusOne ? 0 : 1,
      unknownCount,
      frequency: frequencyRank(card),
      occurrenceRank: -occurrences,
      rowIndex
    };
  }
  function frequencyRank(card) {
    return card.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  }
  function subtitleBatchMiningCandidateKey(card) {
    return cardKey(card);
  }
  function isBatchMiningUnknownCard(card) {
    return BATCH_UNKNOWN_STATES.has(primaryCardState(card.cardState));
  }
  function isBatchMiningBlockedCard(card) {
    return normalizeCardStates(card.cardState).some((state) => BATCH_BLOCKED_STATES.has(state));
  }
  function isBatchMiningParticleCard(card) {
    return card.partOfSpeech.includes("prt") || BATCH_PARTICLE_SURFACE_RE.test(card.spelling.trim());
  }
  function tsvCell(value) {
    return value.replace(/\t/gu, " ").replace(/\r?\n/gu, " ");
  }
  function renderSubtitleBatchMiningPanel(state) {
    const language = state.language;
    return `<div class="jpdb-subtitle-batch-sticky">${renderDrawerHead({
      mode: "mine",
      title: subtitleText(language, "bmTitle"),
      meta: batchMiningMetaText(state),
      canShowLines: state.hasTranscriptSurface,
      options: { placement: state.placement, pausePanelEnabled: state.pausePanelEnabled, menuOpen: state.optionsMenuOpen, language }
    })}${renderBatchMiningToolbar(state)}</div><div class="jpdb-subtitle-list-scroll jpdb-subtitle-batch-scroll">${renderBatchMiningBody(state)}</div><div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeTranscriptPanel"))}"></div>`;
  }
  function renderBatchMiningToolbar(state) {
    const language = state.language;
    const selectedCount = state.selectedKeys.size;
    const candidateCount = state.candidates.length;
    const scanLabel = subtitleText(language, state.status === "ready" ? "bmRescan" : "bmScan");
    const buttons = [
      `<button type="button" data-action="bm-scan" ${state.status === "scanning" ? "disabled" : ""}>${subtitleIcon("transcript")}<span>${escapeHtml(scanLabel)}</span></button>`
    ];
    if (candidateCount) {
      buttons.push(
        `<button type="button" data-action="bm-add" ${selectedCount ? "" : "disabled"}>${subtitleIcon("check")}<span>${escapeHtml(subtitleText(language, "bmAdd"))}</span></button>`,
        `<button type="button" data-action="bm-copy" ${selectedCount ? "" : "disabled"}>${subtitleIcon("copy")}<span>${escapeHtml(subtitleText(language, "bmCopy"))}</span></button>`,
        renderBatchMiningGradeGroup({
          action: "bm-grade-selected",
          label: subtitleText(language, "bmGradeSelected"),
          grades: state.reviewGrades,
          disabled: selectedCount === 0,
          className: "jpdb-subtitle-batch-grade-selected"
        }),
        `<button type="button" data-action="bm-all" ${selectedCount === candidateCount ? "disabled" : ""}>${escapeHtml(subtitleText(language, "selectAll"))}</button>`
      );
      if (selectedCount) buttons.push(`<button type="button" data-action="bm-clear">${escapeHtml(subtitleText(language, "clearSelection"))}</button>`);
    }
    return `<div class="jpdb-subtitle-batch-toolbar" role="toolbar" aria-label="${escapeHtml(subtitleText(language, "bmToolbar"))}">${buttons.join("")}</div>`;
  }
  function renderBatchMiningBody(state) {
    if (state.status === "failed") {
      return `<div class="jpdb-subtitle-list-empty">${escapeHtml(state.errorMessage || subtitleText(state.language, "bmFailed"))}</div>`;
    }
    if (state.status === "scanning") {
      return `<div class="jpdb-subtitle-list-empty">${escapeHtml(formatSubtitleText(state.language, "bmScanning", {
        count: state.summary.parsedRows,
        total: state.summary.rows
      }))}</div>`;
    }
    if (state.status === "idle") {
      return `<div class="jpdb-subtitle-list-empty">${escapeHtml(subtitleText(state.language, "bmReady"))}</div>`;
    }
    if (!state.candidates.length) {
      return `<div class="jpdb-subtitle-list-empty">${escapeHtml(subtitleText(state.language, "bmNoCandidates"))}</div>`;
    }
    return `<div class="jpdb-subtitle-batch-list" role="list">${state.candidates.map((candidate) => renderBatchMiningCandidate(candidate, state)).join("")}</div>`;
  }
  function renderBatchMiningCandidate(candidate, state) {
    const language = state.language;
    const selected = state.selectedKeys.has(candidate.key);
    const selectLabel = subtitleText(language, selected ? "bmDeselect" : "bmSelect");
    const wordLabel = `${selectLabel}: ${candidate.card.spelling}`;
    return `<div class="jpdb-subtitle-batch-row" role="listitem" data-batch-candidate-key="${escapeHtml(candidate.key)}" data-selected="${selected}"><button class="jpdb-subtitle-batch-check" type="button" data-action="bm-toggle" aria-pressed="${selected}" aria-label="${escapeHtml(wordLabel)}">${selected ? subtitleIcon("check") : ""}</button><button class="jpdb-subtitle-batch-word" type="button" data-action="bm-open"><span class="jpdb-subtitle-batch-expression" lang="ja">${escapeHtml(candidate.card.spelling)}</span>${candidate.card.reading && candidate.card.reading !== candidate.card.spelling ? `<span class="jpdb-subtitle-batch-reading" lang="ja">${escapeHtml(candidate.card.reading)}</span>` : ""}</button><div class="jpdb-subtitle-batch-meta">${candidate.iPlusOne ? `<span class="jpdb-subtitle-batch-badge">${escapeHtml(subtitleText(language, "bmIPlusOne"))}</span>` : ""}<span>${escapeHtml(cardStateLabel(candidate.state, language))}</span><span>${escapeHtml(formatSubtitleText(language, "bmOccurrences", { count: candidate.occurrences }))}</span><span>${escapeHtml(formatSubtitleTime(candidate.start))}</span></div><div class="jpdb-subtitle-batch-sentence" lang="ja">${escapeHtml(candidate.sentence)}</div>${renderBatchMiningCandidateGrades(candidate, state)}</div>`;
  }
  function renderBatchMiningCandidateGrades(candidate, state) {
    if (!state.reviewGrades.length) return "";
    const label = `${subtitleText(state.language, "bmGradeWord")}: ${candidate.card.spelling}`;
    return `<div class="jpdb-subtitle-batch-row-grades" role="group" aria-label="${escapeHtml(label)}">${renderBatchMiningGradeButtons({
      action: "bm-grade",
      grades: state.reviewGrades,
      ariaContext: label
    })}</div>`;
  }
  function renderBatchMiningGradeGroup(options) {
    if (!options.grades.length) return "";
    return `<div class="jpdb-subtitle-batch-grade-group ${escapeHtml(options.className ?? "")}" role="group" aria-label="${escapeHtml(options.label)}"><span class="jpdb-subtitle-batch-grade-label">${escapeHtml(options.label)}</span><div class="jpdb-subtitle-batch-grade-buttons">${renderBatchMiningGradeButtons(options)}</div></div>`;
  }
  function renderBatchMiningGradeButtons(options) {
    return options.grades.map(({ grade, label }) => {
      const ariaLabel = options.ariaContext ? `${label}: ${options.ariaContext}` : label;
      return `<button class="jpdb-subtitle-batch-grade-button" type="button" data-action="${escapeHtml(options.action)}" data-grade="${escapeHtml(grade)}" ${options.disabled ? "disabled" : ""} aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(label)}</button>`;
    }).join("");
  }
  function batchMiningMetaText(state) {
    if (state.status === "scanning") {
      return formatSubtitleText(state.language, "bmScanning", {
        count: state.summary.parsedRows,
        total: state.summary.rows
      });
    }
    if (state.status === "failed") return subtitleText(state.language, "bmFailed");
    if (state.status === "ready") {
      return formatSubtitleText(state.language, "bmSummary", {
        count: state.summary.candidates,
        iPlusOne: state.summary.iPlusOne,
        selected: state.summary.selected
      });
    }
    return formatSubtitleText(state.language, "bmRowsReady", { count: state.summary.rows });
  }
  const RAIL_MARGIN_PX = 8;
  const RAIL_KEY_STEP_PX = 12;
  const RAIL_TAP_SLOP_PX = 8;
  function bindSubtitleControlRail(root, onActivity, options = {}) {
    const rail = root.querySelector(".jpdb-subtitle-rail");
    const handle = rail?.querySelector("[data-subtitle-rail-drag-handle]");
    if (!rail || !handle) return null;
    const abort = new AbortController();
    let position = loadSubtitleControlRailPosition();
    let drag = null;
    const railBounds = () => {
      const rootRect = root.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      if (rootRect.width <= 0 || rootRect.height <= 0 || railRect.width <= 0 || railRect.height <= 0) return null;
      return {
        rootRect,
        railWidth: railRect.width,
        railHeight: railRect.height,
        maxLeft: Math.max(RAIL_MARGIN_PX, rootRect.width - railRect.width - RAIL_MARGIN_PX),
        maxTop: Math.max(RAIL_MARGIN_PX, rootRect.height - railRect.height - RAIL_MARGIN_PX)
      };
    };
    const setPixels = (left, top, persist = false) => {
      const bounds = railBounds();
      if (!bounds) return;
      const clampedLeft = Math.min(bounds.maxLeft, Math.max(RAIL_MARGIN_PX, left));
      const clampedTop = Math.min(bounds.maxTop, Math.max(RAIL_MARGIN_PX, top));
      const safePosition = railPositionOutsideReservedRects(
        clampedLeft,
        clampedTop,
        bounds,
        options.getReservedRects?.() ?? []
      );
      rail.style.setProperty("left", `${Math.round(safePosition.left)}px`);
      rail.style.setProperty("right", "auto");
      rail.style.setProperty("top", `${Math.round(safePosition.top)}px`);
      position = {
        x: fractionWithinRailAxis(safePosition.left, bounds.maxLeft),
        y: fractionWithinRailAxis(safePosition.top, bounds.maxTop)
      };
      if (persist) saveSubtitleControlRailPosition(position);
    };
    const syncPosition = () => {
      const bounds = railBounds();
      if (!bounds) return;
      const railRect = rail.getBoundingClientRect();
      setPixels(
        position ? railAxisPosition(position.x, bounds.maxLeft) : railRect.left - bounds.rootRect.left,
        position ? railAxisPosition(position.y, bounds.maxTop) : railRect.top - bounds.rootRect.top
      );
    };
    const pointerDown = (event) => {
      if (event.button !== 0 || drag) return;
      const rootRect = root.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: railRect.left - rootRect.left,
        top: railRect.top - rootRect.top,
        moved: false
      };
      rail.classList.add("jpdb-subtitle-rail-dragging");
      onActivity();
      event.stopPropagation();
      try {
        handle.setPointerCapture?.(event.pointerId);
      } catch {
      }
    };
    const pointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > RAIL_TAP_SLOP_PX) drag.moved = true;
      setPixels(drag.left + deltaX, drag.top + deltaY);
      if (drag.moved) event.preventDefault();
      event.stopPropagation();
    };
    const finishPointer = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      drag = null;
      rail.classList.remove("jpdb-subtitle-rail-dragging");
      try {
        handle.releasePointerCapture?.(event.pointerId);
      } catch {
      }
      if (position) saveSubtitleControlRailPosition(position);
      if (moved) {
        handle.dataset.subtitleRailSuppressClick = "true";
        event.preventDefault();
      }
      event.stopPropagation();
    };
    const suppressDraggedClick = (event) => {
      if (handle.dataset.subtitleRailSuppressClick !== "true") return;
      delete handle.dataset.subtitleRailSuppressClick;
      event.preventDefault();
      event.stopPropagation();
    };
    const keyDown = (event) => {
      const step = event.shiftKey ? RAIL_KEY_STEP_PX * 3 : RAIL_KEY_STEP_PX;
      const rect = rail.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const left = rect.left - rootRect.left;
      const top = rect.top - rootRect.top;
      let nextLeft = left;
      let nextTop = top;
      if (event.key === "ArrowLeft") nextLeft -= step;
      else if (event.key === "ArrowRight") nextLeft += step;
      else if (event.key === "ArrowUp") nextTop -= step;
      else if (event.key === "ArrowDown") nextTop += step;
      else if (event.key === "Home" || event.key === "0") {
        nextLeft = RAIL_MARGIN_PX;
        nextTop = RAIL_MARGIN_PX;
      } else return;
      event.preventDefault();
      event.stopPropagation();
      onActivity();
      setPixels(nextLeft, nextTop, true);
    };
    handle.addEventListener("pointerdown", pointerDown, { signal: abort.signal });
    handle.addEventListener("click", suppressDraggedClick, { capture: true, signal: abort.signal });
    handle.addEventListener("keydown", keyDown, { signal: abort.signal });
    window.addEventListener("pointermove", pointerMove, { passive: false, signal: abort.signal });
    window.addEventListener("pointerup", finishPointer, { passive: false, signal: abort.signal });
    window.addEventListener("pointercancel", finishPointer, { passive: false, signal: abort.signal });
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(syncPosition) : null;
    resizeObserver?.observe(root);
    resizeObserver?.observe(rail);
    requestAnimationFrame(syncPosition);
    return {
      syncPosition,
      destroy: () => {
        abort.abort();
        resizeObserver?.disconnect();
        rail.classList.remove("jpdb-subtitle-rail-dragging");
      }
    };
  }
  function railAxisPosition(fraction, max) {
    return RAIL_MARGIN_PX + fraction * Math.max(0, max - RAIL_MARGIN_PX);
  }
  function fractionWithinRailAxis(value, max) {
    const range = max - RAIL_MARGIN_PX;
    return range > 0 ? Math.min(1, Math.max(0, (value - RAIL_MARGIN_PX) / range)) : 0;
  }
  function railPositionOutsideReservedRects(requestedLeft, requestedTop, bounds, reservedRects) {
    if (!reservedRects.length) return { left: requestedLeft, top: requestedTop };
    const clamp = (left, top) => ({
      left: Math.min(bounds.maxLeft, Math.max(RAIL_MARGIN_PX, left)),
      top: Math.min(bounds.maxTop, Math.max(RAIL_MARGIN_PX, top))
    });
    const rootLeft = bounds.rootRect.left;
    const rootTop = bounds.rootRect.top;
    const overlapsReservedRect = ({ left, top }) => {
      const right = rootLeft + left + bounds.railWidth;
      const bottom = rootTop + top + bounds.railHeight;
      const viewportLeft = rootLeft + left;
      const viewportTop = rootTop + top;
      return reservedRects.some((rect) => right > rect.left && rect.right > viewportLeft && bottom > rect.top && rect.bottom > viewportTop);
    };
    const requested = clamp(requestedLeft, requestedTop);
    if (!overlapsReservedRect(requested)) return requested;
    const gap = 6;
    const candidates = [
      requested,
      clamp(RAIL_MARGIN_PX, RAIL_MARGIN_PX),
      clamp(bounds.maxLeft, RAIL_MARGIN_PX),
      clamp(RAIL_MARGIN_PX, bounds.maxTop),
      clamp(bounds.maxLeft, bounds.maxTop)
    ];
    for (const rect of reservedRects) {
      const left = rect.left - rootLeft;
      const top = rect.top - rootTop;
      candidates.push(
        clamp(left - bounds.railWidth - gap, requested.top),
        clamp(rect.right - rootLeft + gap, requested.top),
        clamp(requested.left, top - bounds.railHeight - gap),
        clamp(requested.left, rect.bottom - rootTop + gap)
      );
    }
    return candidates.filter((candidate) => !overlapsReservedRect(candidate)).sort((first, second) => squaredDistance(first, requested) - squaredDistance(second, requested))[0] ?? requested;
  }
  function squaredDistance(first, second) {
    return (first.left - second.left) ** 2 + (first.top - second.top) ** 2;
  }
  const TRANSCRIPT_SCROLL_INTENT_WINDOW_MS = 1500;
  class TranscriptFollowState {
    intentUntil = 0;
    manualScrollAt = 0;
    armUserScroll(now = performance.now()) {
      this.intentUntil = now + TRANSCRIPT_SCROLL_INTENT_WINDOW_MS;
    }
    noteScroll(now = performance.now()) {
      if (now > this.intentUntil) return false;
      this.intentUntil = 0;
      this.manualScrollAt = now;
      return true;
    }
    clear() {
      this.intentUntil = 0;
      this.manualScrollAt = 0;
    }
    isPaused(resumeMs, now = performance.now()) {
      return Boolean(this.manualScrollAt && now - this.manualScrollAt < resumeMs);
    }
    remainingPauseMs(resumeMs, now = performance.now()) {
      if (!this.manualScrollAt) return 0;
      return Math.max(0, resumeMs - (now - this.manualScrollAt));
    }
  }
  function isTranscriptScrollIntentKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key);
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
      max: options.layout?.maxWidth ?? options.bounds.maxSideWidth,
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
  const SUBTITLE_PARSE_CACHE_MIN_ENTRIES = 180;
  const SUBTITLE_PARSE_CACHE_MAX_ENTRIES = 5e3;
  const SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM = 64;
  const SUBTITLE_FURIGANA_KANJI_RE = /[㐀-鿿]/u;
  const SUBTITLE_FURIGANA_KANA_RE = /^[぀-ヿー・]+$/u;
  const SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT = 6;
  class SubtitleParsedHtmlCache {
    constructor(deps) {
      this.deps = deps;
    }
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
    parseCacheKey(text, settings = this.deps.getSettings()) {
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
    usableProvisionalParsedHtml(key, options) {
      const html = this.provisionalParsedHtmlCache.get(key);
      if (!html) return void 0;
      if ((options.refreshProvisional || options.requireEnrichedProvisional) && !this.enrichedProvisionalParsedHtmlKeys.has(key)) return void 0;
      return html;
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
      if (!this.deps.shouldParseSubtitles()) return;
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
        if (!options.provisional || !this.deps.hasAuthoritativeParseTier() && options.enriched) this.persistSessionParsedCueHtml(key, html);
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
      const transcriptRows = this.deps.transcriptRowCount();
      return Math.min(
        SUBTITLE_PARSE_CACHE_MAX_ENTRIES,
        Math.max(SUBTITLE_PARSE_CACHE_MIN_ENTRIES, transcriptRows + SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM)
      );
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
    // Invalidate a single parse key across every tier so an evicted or stale
    // cue leaves no orphaned provisional/empty/pending/token remnant behind.
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
    cachedParsedCueHtml(key, settings) {
      const cached = this.parsedHtmlCache.get(key) ?? this.restoreSessionParsedCueHtml(key);
      if (!cached) return void 0;
      if (this.deps.hasAuthoritativeParseTier(settings) && cached.includes('data-card-source="fallback"')) {
        this.parsedHtmlCache.delete(key);
        return void 0;
      }
      return cached;
    }
    // Keyless both tiers produce the same local-tokenizer result, so an
    // in-flight parse on EITHER tier satisfies the other — without this the
    // overlay warmup and the transcript-tail warmup tokenized the same cue
    // twice whenever their windows overlapped.
    pendingParsedCueHtml(key, tier) {
      const own = tier === "provisional" ? this.pendingProvisionalParsedHtml.get(key) : this.pendingParsedHtml.get(key);
      if (own || this.deps.hasAuthoritativeParseTier()) return own;
      return tier === "provisional" ? this.pendingParsedHtml.get(key) : this.pendingProvisionalParsedHtml.get(key);
    }
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
  class SubtitleKaraokeSampler {
    constructor(deps) {
      this.deps = deps;
    }
    // Dirty-check for the per-frame karaoke pass: classes only flip at integer
    // character boundaries, so skip the class churn between crossings.
    lastKaraokeProgressKey;
    lastKaraokePrimaryWord;
    applyKaraokeStateToPrimary(cue, time) {
      const state = this.primaryKaraokeState(cue);
      if (!state) {
        this.lastKaraokeProgressKey = void 0;
        this.lastKaraokePrimaryWord = void 0;
        return;
      }
      const progress = karaokeCharacterProgress(cue, state.words, time);
      const progressKey = Math.floor(progress);
      const primaryWord = state.wordElements[0] ?? null;
      if (progressKey === this.lastKaraokeProgressKey && primaryWord === this.lastKaraokePrimaryWord) return;
      this.lastKaraokeProgressKey = progressKey;
      this.lastKaraokePrimaryWord = primaryWord;
      let cursor = 0;
      for (const element of state.wordElements) {
        cursor = applyKaraokeClassToWordElement(element, cursor, progress);
      }
    }
    primaryKaraokeState(cue) {
      const primary = this.deps.getSubtitleElement()?.querySelector(".jpdb-subtitle-primary");
      if (!primary || !cueHasExactWordTimings(cue)) return null;
      const words = cue.words;
      const wordElements = Array.from(primary.querySelectorAll(".jpdb-reader-word"));
      return words.length && wordElements.length ? { words, wordElements } : null;
    }
  }
  const YOUTUBE_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    ".html5-video-player.ytp-fullscreen",
    ".html5-video-player.fullscreen",
    "#movie_player.ytp-fullscreen",
    "#movie_player.fullscreen",
    "ytd-watch-flexy[fullscreen] #movie_player",
    "ytd-watch-flexy[fullscreen] ytd-player",
    "ytm-player[fullscreen]",
    "ytm-player.fullscreen",
    "ytm-player.ytp-fullscreen"
  ].join(",");
  const FULLSCREEN_HOST_NULL_CACHE_TTL_MS = 3e3;
  function elementContainsVideo(element, video) {
    return Boolean(element && video && (element === video || element.contains(video)));
  }
  function youtubeFullscreenHostForVideo(video) {
    if (!isYouTubePage()) return null;
    const scopedHost = video?.closest(YOUTUBE_FULLSCREEN_HOST_SELECTOR);
    if (scopedHost) return scopedHost;
    return Array.from(document.querySelectorAll(YOUTUBE_FULLSCREEN_HOST_SELECTOR)).find((element) => elementContainsVideo(element, video) || isYouTubeMobileFullscreenHost(element) || isVisibleYouTubeFullscreenHost(element)) ?? null;
  }
  function isMobileYouTubePage() {
    return /^m\.youtube\.com$/i.test(location.hostname);
  }
  function mutationSwapsFullscreenHostCandidate(mutation) {
    for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
      for (const node of nodes) {
        if (node instanceof HTMLElement && node.matches(YOUTUBE_FULLSCREEN_HOST_SELECTOR)) return true;
      }
    }
    return false;
  }
  function isYouTubeMobileFullscreenHost(element) {
    return Boolean(element && isMobileYouTubePage() && element.matches("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen"));
  }
  function isVisibleYouTubeFullscreenHost(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    return rect.width >= viewportWidth / 2 && rect.height >= viewportHeight / 2 && rect.left <= viewportWidth / 4 && rect.top <= viewportHeight / 4 && Boolean(element.querySelector("video"));
  }
  class SubtitleFullscreenHost {
    constructor(deps) {
      this.deps = deps;
    }
    // Event-driven cache for the inline/CSS fullscreen host queries; undefined
    // means dirty (recompute on next read). See queriedFullscreenHost.
    hostQuery;
    get video() {
      return this.deps.getVideo();
    }
    subtitleFullscreenHost(fullscreenElement = currentFullscreenElement()) {
      if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement)) return fullscreenElement;
      const queriedHost = this.queriedFullscreenHost();
      if (queriedHost) return queriedHost;
      if (fullscreenElement instanceof HTMLVideoElement && fullscreenElement === this.video) {
        const target = subtitleVideoLayoutTarget(this.video);
        return target && target !== this.video ? target : null;
      }
      return null;
    }
    // The inline/CSS fullscreen host is read on every geometry sample (120ms
    // frame sampler + 500ms tick via videoLayoutRect), and computing it walks
    // document.querySelectorAll over the 10-selector fullscreen-host list —
    // ~1.4% of a core on a YouTube watch page while NOT fullscreen (profiled).
    // Fullscreen state only changes on discrete signals, so keep the result as
    // event-driven cached state: invalidated on fullscreenchange events, the
    // fullscreen-affecting attribute mutations the body observer already
    // filters for (ytp-fullscreen classes, [fullscreen], the inline-fullscreen
    // marker), SPA navigation, and video rebinds. A cached non-null host is
    // revalidated per read with a cheap matches() so a missed signal degrades
    // to a recompute, never to a stale host.
    queriedFullscreenHost() {
      const cached = this.hostQuery;
      if (cached) {
        if (cached.host === null && performance.now() - cached.at < FULLSCREEN_HOST_NULL_CACHE_TTL_MS) return null;
        if (cached.host && this.isStillLiveFullscreenHost(cached.host)) return cached.host;
      }
      const host = this.inlineFullscreenHostForVideo() ?? youtubeFullscreenHostForVideo(this.video);
      this.hostQuery = { host, at: performance.now() };
      return host;
    }
    // Revalidate the SEMANTIC selection condition a fresh query would apply
    // (video containment, the m.youtube shell predicate, or the visibility
    // fallback) — mere selector membership could retain a hidden
    // wrong-but-matching host after a style-only visibility handoff.
    isStillLiveFullscreenHost(host) {
      if (!host.isConnected || !host.matches(YOUTUBE_FULLSCREEN_HOST_SELECTOR)) return false;
      return elementContainsVideo(host, this.video) || isYouTubeMobileFullscreenHost(host) || isVisibleYouTubeFullscreenHost(host);
    }
    invalidateHostCache() {
      this.hostQuery = void 0;
    }
    shouldHostSubtitleRootInFullscreenElement(fullscreenElement) {
      return Boolean(fullscreenElement instanceof HTMLElement && !(fullscreenElement instanceof HTMLVideoElement) && this.video && fullscreenElement.contains(this.video));
    }
    inlineFullscreenHostForVideo() {
      const host = this.video?.closest('[data-yomu-inline-fullscreen="true"]') ?? document.querySelector('[data-yomu-inline-fullscreen="true"]');
      return host && (!this.video || host.contains(this.video) || isYouTubeMobileFullscreenHost(host)) ? host : null;
    }
    syncSubtitleRootParent(fullscreenHost = this.subtitleFullscreenHost()) {
      const root = this.deps.getRoot();
      if (!root) return;
      const parent = this.fullscreenReaderRootParent(fullscreenHost);
      if (root.parentElement !== parent) parent.appendChild(root);
      const transcriptPanel = this.deps.getTranscriptPanel();
      if (transcriptPanel && transcriptPanel.parentElement !== parent) parent.appendChild(transcriptPanel);
    }
    fullscreenReaderRootParent(fullscreenHost) {
      return !fullscreenHost || fullscreenHost === document.documentElement ? document.body ?? document.documentElement : fullscreenHost;
    }
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
  const TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS = [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
    "touchcancel"
  ];
  const YOUTUBE_STABLE_TRANSCRIPT_CLASSES = [
    "jpdb-subtitle-youtube-stable-side",
    "jpdb-subtitle-youtube-stable-left",
    "jpdb-subtitle-youtube-stable-right",
    "jpdb-subtitle-youtube-stable-player-fallback",
    "jpdb-subtitle-youtube-stable-full-bleed"
  ];
  const YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES = [
    "--jpdb-subtitle-youtube-stable-offset",
    "--jpdb-subtitle-youtube-stable-player-width",
    "--jpdb-subtitle-youtube-stable-player-height"
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
  const YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS = "jpdb-subtitle-yt-sheet-open";
  const NATIVE_FULLSCREEN_CUE_TRACK_LABEL = "Yomu";
  const SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE = "data-jpdb-subtitle-native-control-safe-zone";
  const NATIVE_PLAYER_CONTROL_SELECTOR = 'button,[role="button"],a[href],[tabindex]:not([tabindex="-1"])';
  function isYouTubeTheaterMode() {
    return isYouTubePage() && Boolean(document.querySelector("ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]"));
  }
  function hasOpenYouTubeMobileBottomSheet() {
    for (const app of Array.from(document.getElementsByTagName("ytm-app"))) {
      for (const sheet of Array.from(app.getElementsByTagName("bottom-sheet-container"))) {
        if (sheet.getAttribute("aria-modal") === "true" && !sheet.hasAttribute("hidden")) return true;
      }
    }
    return false;
  }
  function subtitleViewportRect() {
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }
  function videoIsInNativeFullscreen(video) {
    if (!video) return false;
    const fullscreenVideo = video;
    return Boolean(fullscreenVideo.webkitDisplayingFullscreen || fullscreenVideo.webkitPresentationMode && fullscreenVideo.webkitPresentationMode !== "inline");
  }
  function subtitleMinimumFontSize(root) {
    const rootRect = root.getBoundingClientRect();
    return rootRect.width < 700 || rootRect.height < 360 ? 16 : 14;
  }
  function subtitleFrameTargetFontSize(root, settings) {
    const rootRect = root.getBoundingClientRect();
    const width = Math.max(1, rootRect.width);
    const height = Math.max(1, rootRect.height);
    const baseline = Math.max(16, Math.min(64, settings.subtitleFontSize));
    const portrait = height > width;
    const frameScale = portrait ? Math.sqrt(width / 720) : Math.sqrt(Math.min(width / 1280, height / 720));
    const minScale = portrait || width < 700 ? 0.82 : 0.74;
    const scaled = Math.round(baseline * Math.max(minScale, Math.min(1, frameScale)));
    return Math.max(subtitleMinimumFontSize(root), Math.min(baseline, scaled));
  }
  const DEFAULT_SUBTITLE_BOTTOM_OFFSET = DEFAULT_SETTINGS.subtitleBottomOffset;
  function effectiveSubtitleBottomPercent(settings) {
    return settings.subtitleBottomOffset;
  }
  function setDocumentStylePropertyIfChanged(element, property, value) {
    if (element.style.getPropertyValue(property) === value) return false;
    element.style.setProperty(property, value);
    return true;
  }
  function youtubeWatchPlayerMeaningfullyVisible(rect) {
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const ratio = visibleHeight / Math.max(1, rect.height);
    return visibleHeight >= Math.min(220, rect.height * 0.45) && ratio >= 0.45;
  }
  function subtitleElementOverflows(element) {
    return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
  }
  function subtitleSecondaryFontSize(target) {
    return Math.max(13, Math.min(22, Math.round(target * 0.62)));
  }
  function nextSubtitleFontSize(element, fitted, minimum) {
    const heightScale = element.clientHeight / Math.max(1, element.scrollHeight);
    const widthScale = element.clientWidth / Math.max(1, element.scrollWidth);
    return Math.max(minimum, Math.floor(fitted * Math.min(0.92, heightScale, widthScale)));
  }
  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  function rectsOverlap(first, second) {
    return first.right > second.left && second.right > first.left && first.bottom > second.top && second.bottom > first.top;
  }
  function nativePlayerControlIsInteractive(control) {
    if (control.hidden || control.getAttribute("aria-hidden") === "true" || control.getAttribute("aria-disabled") === "true" || control.matches(":disabled")) return false;
    const style = getComputedStyle(control);
    return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && Number.parseFloat(style.opacity || "1") > 0.01;
  }
  function videoRectKey(rect) {
    return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
  }
  function subtitleAnimeSearchQuery(video) {
    const raw = video?.dataset.yomuAnimeSearch || video?.dataset.yomuVideoTitle || video?.title || document.title || "";
    return raw.replace(/\.(?:mkv|mp4|m4v|mov|webm|ogv)$/iu, "").replace(/[-|]\s*(?:YouTube|Yomu Video|よむ 動画)\s*$/iu, "").replace(/\[[^\]]*\]/gu, " ").replace(/[._]+/gu, " ").replace(/^\s*(?:watch|stream)\s+/iu, "").replace(/\s+(?:episode|ep\.?)\s*\d+(?:\.\d+)?\b.*$/iu, "").replace(/\s*[-|·]\s*(?:watch|stream|free|anime|online|subbed|dubbed|hd)\b.*$/iu, "").replace(/\b(?:english|eng)\s+(?:subbed|sub|dubbed|dub)\b/giu, " ").replace(/\b(?:subbed|dubbed)\b/giu, " ").replace(/\s+\b(?:online|free|hd)\b\s*$/iu, "").replace(/\s+/gu, " ").trim().slice(0, 120);
  }
  function clearWindowTimeout(id) {
    if (id !== void 0) window.clearTimeout(id);
    return void 0;
  }
  function clearWindowAnimationFrame(id) {
    if (id !== void 0) window.cancelAnimationFrame(id);
    return void 0;
  }
  function videoFrameCallbackHost(video) {
    const candidate = video;
    return typeof candidate.requestVideoFrameCallback === "function" && typeof candidate.cancelVideoFrameCallback === "function" ? candidate : null;
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
  const SUBTITLE_CONTROLS_AWAY_COMMIT_DELAY_MS = 320;
  const SUBTITLE_TIMING_OFFSET_STEP_SECONDS = 0.1;
  const SUBTITLE_TIMING_OFFSET_MAX_SECONDS = 300;
  const TRANSCRIPT_ACTIVE_HYDRATION_BEHIND = 1;
  const TRANSCRIPT_ACTIVE_HYDRATION_AHEAD = 3;
  const TRANSCRIPT_HYDRATION_MAX_ROWS = 12;
  const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 4;
  const TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY = 2;
  const TRANSCRIPT_BACKGROUND_PARSE_BATCH = 8;
  const TRANSCRIPT_BACKGROUND_PARSE_AHEAD = 32;
  const TRANSCRIPT_BACKGROUND_PARSE_BEHIND = 6;
  const YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD = 240;
  const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT = 96;
  const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = SUBTITLE_PARSE_CACHE_MAX_ENTRIES;
  const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
  const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
  const TRANSCRIPT_WARMUP_PRIORITY_ROWS = 48;
  const TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD = 64;
  const TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX = 80;
  const TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS = 3;
  const TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS = 21;
  const BATCH_MINING_PARSE_BATCH = 24;
  const TRACKS_VIRTUAL_HEADER_PX = 140;
  const TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS = 30;
  const TRANSCRIPT_AUTO_SCROLL_RESUME_LEGACY_DEFAULT_SECONDS = 4;
  const SUBTITLE_TICK_ACTIVE_MS = 500;
  const SUBTITLE_TICK_PAUSED_MS = 600;
  const SUBTITLE_TICK_IDLE_MS = 1500;
  const SUBTITLE_TICK_FORCED_CUE_REFRESH_MS = 5e3;
  const SUBTITLE_FRAME_GEOMETRY_SYNC_MS = 120;
  const TRANSCRIPT_DEFERRED_RENDER_DELAY_MS = 500;
  const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 1e3;
  const TRANSCRIPT_SMOOTH_FOLLOW_MAX_ROWS = 3;
  const YOUTUBE_CAPTION_ACTIVATION_RETRY_MS = 2e3;
  const DOM_CAPTION_STABLE_DELAY_MS = 180;
  const DOM_CAPTION_MISSING_GRACE_MS = 1200;
  const PLAYBACK_PAUSE_REASSERT_WINDOW_MS = 800;
  const YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY = "youtube-dom-caption-fallback";
  const SUBTITLE_FILE_ACCEPT = [
    ".srt",
    ".vtt",
    ".ass",
    ".ssa",
    "text/vtt",
    "text/plain",
    "text/x-subrip",
    "text/x-ssa",
    "text/x-ass",
    "application/x-subrip",
    "application/srt"
  ].join(",");
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
  function isTranscriptContextJoinChar(value) {
    return Boolean(value && /[\u3040-\u30ff\u3400-\u9fff々〆〤ー]/u.test(value));
  }
  function lastTextChar(value) {
    return value.trimEnd().at(-1);
  }
  function firstTextChar(value) {
    return value.trimStart().charAt(0) || void 0;
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
  function normalizeSubtitleTimingOffsetSeconds(value) {
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.max(-SUBTITLE_TIMING_OFFSET_MAX_SECONDS, Math.min(SUBTITLE_TIMING_OFFSET_MAX_SECONDS, value ?? 0));
    const rounded = Math.round(clamped * 1e3) / 1e3;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  function offsetSubtitleCues(cues, offsetSeconds) {
    const offset = normalizeSubtitleTimingOffsetSeconds(offsetSeconds);
    if (!cues.length || !offset) return cues;
    return cues.map((cue) => offsetSubtitleCue(cue, offset));
  }
  function offsetSubtitleCue(cue, offsetSeconds) {
    return {
      ...cue,
      start: cue.start + offsetSeconds,
      end: cue.end + offsetSeconds,
      words: cue.words?.map((word) => offsetSubtitleWordTiming(word, offsetSeconds))
    };
  }
  function offsetSubtitleWordTiming(word, offsetSeconds) {
    return {
      ...word,
      start: word.start + offsetSeconds,
      end: word.end + offsetSeconds
    };
  }
  function adjacentSubtitleCueForOffset(cues, time, offsetSeconds, forward) {
    let adjacentIndex = -1;
    let minDiff = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      const start = cue.start + offsetSeconds;
      const end = cue.end + offsetSeconds;
      const diff = forward ? start - time : time - start;
      if (minDiff <= diff) continue;
      if (forward && time < start) {
        minDiff = diff;
        adjacentIndex = index;
      } else if (!forward && time > start) {
        minDiff = diff;
        adjacentIndex = time < end ? Math.max(0, index - 1) : index;
      }
    }
    return adjacentIndex >= 0 ? cues[adjacentIndex] : void 0;
  }
  function subtitleClipboardText(primary, secondary, includeTranslation) {
    return [primary?.text.trim(), includeTranslation ? secondary?.text.trim() : ""].filter(Boolean).join("\n");
  }
  function flashSubtitleCopyFeedback(target) {
    const button = target.closest("button") ?? target;
    button.classList.add("jpdb-subtitle-copy-flash");
    window.setTimeout(() => button.classList.remove("jpdb-subtitle-copy-flash"), 1200);
  }
  function subtitlePrimaryRowHtml(primaryHtml) {
    return `<div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary">${primaryHtml}</div></div>`;
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
  function subtitleFilesFromHostEvent(event) {
    const rawDetail = event instanceof CustomEvent ? detailValue(event) : void 0;
    const detail = isNonNullObject(rawDetail) ? rawDetail : {};
    const explicitJobs = [
      ...hostedSubtitleFileJobs("primary", detail.primary ?? detail.primaryFiles),
      ...hostedSubtitleFileJobs("secondary", detail.secondary ?? detail.secondaryFiles)
    ];
    const inferredJobs = explicitJobs.length ? [] : inferHostedSubtitleFileJobs(hostedFiles(detail.files));
    return {
      jobs: [...explicitJobs, ...inferredJobs],
      openPanel: normalizeHostedSubtitleOpenPanel(detail.openPanel)
    };
  }
  function detailValue(event) {
    return event.detail;
  }
  function hostedSubtitleFileJobs(kind, value) {
    return hostedFiles(value).map((file) => ({ kind, file }));
  }
  function hostedFiles(value) {
    if (isHostedFile(value)) return [value];
    if (!value || typeof value !== "object") return [];
    if (typeof value.length === "number") {
      return Array.from(value).filter(isHostedFile);
    }
    if (Symbol.iterator in value) return Array.from(value).filter(isHostedFile);
    return [];
  }
  function isHostedFile(value) {
    if (typeof File !== "undefined" && value instanceof File) return true;
    return Boolean(value && typeof value === "object" && typeof value.name === "string" && typeof value.slice === "function");
  }
  function readHostedSubtitleFileText(file) {
    if (typeof file.text === "function") return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read subtitle file."));
      reader.readAsText(file);
    });
  }
  function inferHostedSubtitleFileJobs(files) {
    const subtitleFiles = files.filter((file) => isSubtitleFileName(file.name));
    if (!subtitleFiles.length) return [];
    const primaryCandidates = subtitleFiles.filter((file) => looksLikeJapaneseSubtitleFile(file.name));
    const secondaryCandidates = subtitleFiles.filter((file) => looksLikeNativeSubtitleFile(file.name));
    const fallbackCandidates = subtitleFiles.filter((file) => !primaryCandidates.includes(file) && !secondaryCandidates.includes(file));
    const primary = primaryCandidates.shift() ?? fallbackCandidates.shift() ?? secondaryCandidates.shift();
    if (!primary) return [];
    return [
      { kind: "primary", file: primary },
      ...[...primaryCandidates, ...fallbackCandidates, ...secondaryCandidates].map((file) => ({ kind: "secondary", file }))
    ];
  }
  function subtitleFilePickerJobs(kind, files) {
    if (files.length <= 1 || kind === "secondary") return files.map((file) => ({ kind, file }));
    return inferHostedSubtitleFileJobs(files);
  }
  function isSubtitleFileName(name) {
    return /\.(?:srt|vtt|ass|ssa)$/iu.test(name);
  }
  function looksLikeJapaneseSubtitleFile(name) {
    return /(^|[.\-_\s()[\]])(?:ja|jp|jpn|japanese|日本語)(?=$|[.\-_\s()[\]])/iu.test(name);
  }
  function looksLikeNativeSubtitleFile(name) {
    return /(^|[.\-_\s()[\]])(?:en|eng|english|native|translation|translated)(?=$|[.\-_\s()[\]])/iu.test(name);
  }
  function normalizeHostedSubtitleOpenPanel(value) {
    return value === "lines" || value === "tracks" || value === "auto" || value === false ? value : "auto";
  }
  function updateNumberSetting(settings, key, value, min, max) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return false;
    const next = Math.min(Math.max(parsed, min), max);
    const normalized = key === "subtitleBackgroundOpacity" ? Number(next.toFixed(2)) : Math.round(next);
    if (settings[key] === normalized) return false;
    settings[key] = normalized;
    return true;
  }
  function syncSubtitleStyleRangeControl(root, key, value, suffix) {
    const control = root.querySelector(`[data-subtitle-style-setting="${key}"]`);
    const nextValue = key === "subtitleBackgroundOpacity" ? String(Number(value.toFixed(2))) : String(Math.round(value));
    if (control && control.value !== nextValue) control.value = nextValue;
    const output = root.querySelector(`[data-subtitle-style-output="${key}"]`);
    if (!output) return;
    if (suffix === "weight") output.textContent = String(Math.round(value));
    else output.textContent = suffix ? `${Math.round(value)}${suffix}` : `${Math.round(value * 100)}%`;
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
    playbackPauseReassert;
    cues = [];
    secondaryCues = [];
    tracks = [];
    currentCue;
    secondaryCue;
    observer;
    videoResizeObserver;
    subtitleControlRail;
    lastPlayerChromeHidden = false;
    discoverTimer;
    tickTimer;
    // Fullscreen top-layer host resolution + reader-root reparenting. Owns the
    // event-driven host-query cache; the controller keeps the fullscreen-state
    // bookkeeping and delegates host lookup/reparenting to it.
    fullscreenHost = new SubtitleFullscreenHost({
      getVideo: () => this.video,
      getRoot: () => this.root,
      getTranscriptPanel: () => this.transcriptPanel
    });
    // Dirty-flag + forced-staleness gate for native cue-list re-reads.
    nativeCueListsDirty = true;
    lastForcedNativeCueRefreshAt = 0;
    // Per-frame cue/karaoke sampler (rVFC, rAF fallback). Armed only while the
    // bound video plays; cancelled on pause/seek-away/destroy/hidden.
    frameSyncHandle;
    frameSyncVideo;
    // `paused` describes user/media intent, not a network stall. Keep the
    // bound video's buffering clock separate so housekeeping cannot advance
    // cues while the browser's currentTime extrapolates without presenting a
    // frame. Only `playing` releases this snapshot.
    bufferingPlayback;
    lastFrameGeometrySampleAt = 0;
    // Word-level karaoke highlight progression (per-frame dirty-check + the
    // pending/current/spoken class pass over the rendered primary word spans)
    // lives in this collaborator; the controller keeps the frame/tick sampler
    // that decides when to sample and delegates the highlight pass to it.
    karaokeSampler = new SubtitleKaraokeSampler({
      getSubtitleElement: () => this.subtitleEl
    });
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
    lastDomCaptionSeenAt = 0;
    // Parsed subtitle/transcript HTML caching (all tiers, TTL empties, in-flight
    // dedupe, token cache, session persistence, bounded eviction) lives in this
    // collaborator; the controller keeps the parse/render orchestration.
    htmlCache = new SubtitleParsedHtmlCache({
      getSettings: () => this.options.getSettings(),
      shouldParseSubtitles: () => this.shouldParseSubtitles(),
      hasAuthoritativeParseTier: (settings) => this.hasAuthoritativeParseTier(settings),
      transcriptRowCount: () => this.cues.filter((cue) => cue.transcriptEligible !== false).length
    });
    transcriptTextTargetsByParseKey = /* @__PURE__ */ new Map();
    renderSerial = 0;
    panelMode = "lines";
    lastTranscriptSignature = "";
    // Structure-only signature (see TranscriptPanelRenderState) committed by the
    // last full render. Lets an append-only cue-list growth be detected as
    // "only the row count grew" so it can patch the scroller's rows in place
    // instead of a full setInnerHtml(panel, ...) that would replace the
    // scroller and briefly paint a spacer-only, whitespace-band frame.
    lastTranscriptStructureSignature = "";
    // The virtual window actually committed to the DOM by the last full render.
    // Reused while auto-following so consecutive active-line advances keep the
    // same window (stable signature -> cheap class-swap, no list re-render that
    // would recreate the active row and flicker its highlight).
    renderedVirtualWindow;
    transcriptScrollFrame;
    transcriptHydrateFrame;
    transcriptDeferredRenderFrame;
    transcriptDeferredRenderTimer;
    transcriptVirtualRenderFrame;
    transcriptVirtualScrollTop = 0;
    // Lines-panel row-height estimate, calibrated from actually rendered rows.
    // The fixed 80px guess drifts badly on hydrated rows (furigana + wrapping
    // push real rows past 110px), and since spacers AND the scroll->index map
    // both use it, the error compounds with row index until deep scroll lands
    // the viewport inside a spacer and the panel shows blank rows.
    transcriptRowEstimatePx = TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX;
    // Tracks-panel virtualization (parallel to the lines-panel window above):
    // videos with auto-translated captions expose hundreds of track rows.
    renderedTracksVirtualWindow;
    tracksVirtualRenderFrame;
    tracksVirtualScrollTop = 0;
    // Scroll alone is not intent: layout, hydration and virtual-window updates
    // all scroll the panel. This state only enters manual mode when a direct
    // wheel/touch/pointer/key signal arms the next scroll.
    transcriptFollowState = new TranscriptFollowState();
    transcriptInsetRealignFrame;
    transcriptViewportStabilizeTimer;
    transcriptPreviewPlayerResizeDeferred = false;
    transcriptResizeBackgroundResumeTimer;
    transcriptAutoScrollResumeTimer;
    transcriptHydrationAfterResizeIndex;
    transcriptWarmupAfterResize = false;
    transcriptPanelHideTimer;
    pointerActivityFrame;
    pendingPointerActivity;
    controlsIdleTimer;
    // Committing "away" (fully hidden) is debounced so a rapidly-flickering
    // player-chrome-fade signal — e.g. a feed tile that autoplays on hover and
    // strobes its own autohide class — cannot strobe the rail in and out.
    awayCommitTimer;
    // A subtitle line can be positioned outside the video frame. Activity on
    // that displaced line must briefly own control visibility even while the
    // host player's chrome remains autohidden (notably on touch devices).
    subtitleSurfaceWakeActive = false;
    lastControlsInputWasKeyboard = false;
    transcriptHydrationSerial = 0;
    transcriptCacheWarmupSerial = 0;
    transcriptCacheWarmupSignature = "";
    lastShadowSignature = "";
    shadowLoopEnabled = false;
    // The specific cue the loop is pinned to. Looping must not track the live
    // currentCue (which drifts to the next line as playback advances) or the
    // loop "escapes" after one pass — pin the line and re-seek robustly.
    shadowLoopCue;
    shadowTextVisible = true;
    // Self-recording (shadowing practice): record the learner's voice locally and
    // play it back against the model. Never uploaded; the blob URL is local-only.
    shadowRecorder;
    shadowRecordingUrl;
    shadowRecordingCueSignature = "";
    shadowRecordingStopTimer;
    shadowRecordingDiscard = false;
    shadowPlaybackAudio;
    shadowAutoPausedCueSignature = "";
    shadowRecordingUnavailable = false;
    batchMiningStatus = "idle";
    batchMiningCandidates = [];
    batchMiningSelectedKeys = /* @__PURE__ */ new Set();
    batchMiningRows = [];
    batchMiningError = "";
    batchMiningSerial = 0;
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
    // Runtime open-intent for the transcript drawer, scoped to THIS page/tab.
    // The persisted `subtitleTranscriptVisible` is a pure "open by default"
    // preference (settings form); mirroring runtime open/close into it leaked
    // an open drawer across tabs and onto the homepage. This in-memory flag
    // keeps the drawer re-openable after a track change within the same page
    // without touching persisted settings.
    transcriptPanelSessionOpen = false;
    // "Open by default" auto-opens the drawer once per surface (page load / SPA
    // navigation), then a manual close sticks: without this a later refresh()
    // would see the preference still true + the panel hidden and reopen it,
    // making the new X close un-closable. Re-armed on YouTube navigation.
    transcriptDefaultOpenApplied = false;
    subtitleDragOffsetYPx = 0;
    subtitleStylePanelOpen = false;
    // Drawer-head panel-options popover (placement / pause auto-open / close).
    // Kept as state, not DOM, so it survives the full panel re-renders that
    // toggling an option inside it triggers.
    panelOptionsMenuOpen = false;
    // Remembered manual vertical position, as a fraction of viewport height, so a
    // nudge survives video changes and reloads instead of snapping back to the
    // configured bottom offset. Persisted via gmStorage; see subtitle-layout.
    subtitleDragOffsetFraction = loadSubtitleDragOffsetFraction();
    subtitleDragActive = false;
    subtitleDragPreviewOffsetYPx;
    nativeFullscreenCueTrack;
    nativeFullscreenCueVideo;
    nativeFullscreenHostTracksRestored = false;
    transcriptResizeActive = false;
    asbMoveHandlesActive = false;
    asbSubtitleDragHandles = /* @__PURE__ */ new WeakSet();
    asbSubtitleBaseTransforms = /* @__PURE__ */ new WeakMap();
    clickHandlers = {
      cue: (target) => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
      previous: () => this.seekSubtitle(-1),
      next: () => this.seekSubtitle(1),
      ocr: () => this.toggleVideoFrameOcr(),
      visibility: () => this.toggleOverlayVisibility(),
      copy: (target) => {
        void this.copySubtitle().then(() => flashSubtitleCopyFeedback(target));
      },
      "copy-row": (target) => {
        void this.copyTranscriptRow(this.rowIndexFromTarget(target)).then(() => flashSubtitleCopyFeedback(target));
      },
      "peek-row": (target) => this.toggleRowTranslationPeek(target),
      "jump-current": () => this.jumpToCurrentTranscriptRow(),
      "rail-expand": () => this.toggleSubtitleControlRailExpanded(),
      load: () => this.openSubtitleFilePicker("primary"),
      "load-secondary": () => this.openSubtitleFilePicker("secondary"),
      panel: () => this.toggleTranscriptDrawer(),
      "panel-options": () => this.togglePanelOptionsMenu(),
      style: () => this.toggleSubtitleStylePanel(),
      "style-reset": () => this.resetSubtitleStyleDefaults(),
      "panel-lines": () => this.openLinesPanel({ deferRender: true }),
      "panel-shadow": () => this.openShadowPanel(),
      "panel-mine": () => this.openBatchMiningPanel(),
      "panel-tracks": () => this.openTracksPanel(),
      "bm-scan": () => {
        void this.scanBatchMiningTranscript();
      },
      "bm-toggle": (target) => this.toggleBatchMiningCandidate(target),
      "bm-open": (target) => {
        void this.openBatchMiningCandidate(target);
      },
      "bm-add": () => {
        void this.addSelectedBatchMiningCandidates();
      },
      "bm-copy": () => {
        void this.copySelectedBatchMiningCandidates();
      },
      "bm-grade": (target) => {
        void this.gradeBatchMiningCandidate(target);
      },
      "bm-grade-selected": (target) => {
        void this.gradeSelectedBatchMiningCandidates(target);
      },
      "bm-all": () => this.selectAllBatchMiningCandidates(),
      "bm-clear": () => this.clearBatchMiningSelection(),
      "shadow-replay": () => this.replayShadowCue(),
      "shadow-loop": () => this.toggleShadowLoop(),
      "shadow-auto-pause": () => this.toggleShadowAutoPause(),
      "shadow-toggle-text": () => this.toggleShadowText(),
      "shadow-goto": (target) => this.gotoShadowNeighbor(target),
      "shadow-record": () => {
        void this.toggleShadowRecording();
      },
      "shadow-play-recording": () => this.playShadowRecording(),
      "close-panel": () => this.closeTranscriptPanel(),
      "transcript-placement": (target) => this.changeTranscriptPlacement(target),
      "toggle-pause-panel": () => this.togglePausePanelMode(),
      "primary-track": (target) => {
        void this.choosePrimaryTrack(this.trackIdFromTarget(target));
      },
      "secondary-track": (target) => {
        void this.chooseSecondaryTrack(this.trackIdFromTarget(target));
      },
      "offset-earlier": (target) => this.adjustTrackTimingOffset(this.trackIdFromTarget(target), -SUBTITLE_TIMING_OFFSET_STEP_SECONDS),
      "offset-later": (target) => this.adjustTrackTimingOffset(this.trackIdFromTarget(target), SUBTITLE_TIMING_OFFSET_STEP_SECONDS),
      "offset-previous": (target) => this.alignTrackTimingOffset(this.trackIdFromTarget(target), false),
      "offset-next": (target) => this.alignTrackTimingOffset(this.trackIdFromTarget(target), true),
      "offset-reset": (target) => this.setTrackTimingOffset(this.trackIdFromTarget(target), 0),
      "toggle-native-blur": (target) => this.toggleNativeSubtitleBlur(target.closest(".jpdb-subtitle-secondary, .jpdb-subtitle-shadow-secondary"))
    };
    init() {
      this.destroy();
      this.destroyed = false;
      this.abortController = new AbortController();
      const body = document.body;
      if (!body) {
        document.addEventListener("DOMContentLoaded", () => {
          if (!this.destroyed) this.init();
        }, this.eventOptions({ once: true }));
        return;
      }
      if (!this.install()) return;
      this.syncYouTubeMobileBottomSheetState();
      this.observer = new MutationObserver((mutations) => {
        this.syncYouTubeMobileBottomSheetState();
        if (mutations.every(mutationInsideReaderRoot$1)) return;
        if (mutations.some((mutation) => this.mutationCouldAffectFullscreenState(mutation))) {
          this.fullscreenHost.invalidateHostCache();
          this.syncFullscreenState();
          this.scheduleAlignToVideo();
        }
        if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
        this.scheduleDiscoverVideo();
      });
      this.observer.observe(body, {
        attributeFilter: ["aria-modal", "class", "data-yomu-inline-fullscreen", "fullscreen", "hidden"],
        attributes: true,
        childList: true,
        subtree: true
      });
      document.addEventListener("keydown", (event) => this.handleKeydown(event), this.eventOptions({ capture: true }));
      document.addEventListener("focusin", (event) => this.handleSubtitleUiFocusIn(event), this.eventOptions({ capture: true }));
      document.addEventListener("focusout", (event) => this.handleSubtitleUiFocusOut(event), this.eventOptions({ capture: true }));
      document.addEventListener("pointerdown", (event) => this.wakeControlsFromSubtitleSurface(event), this.eventOptions({ passive: true, capture: true }));
      document.addEventListener("click", (event) => this.handleSubtitleSurfaceClick(event), this.eventOptions({ capture: true }));
      document.addEventListener("pointerdown", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
      document.addEventListener("visibilitychange", () => this.restartTickAfterVisibilityChange(), this.eventOptions());
      document.addEventListener("pointermove", (event) => this.handlePointerActivity(event), this.eventOptions({ passive: true, capture: true }));
      window.addEventListener(OPEN_SUBTITLE_TRACKS_EVENT, () => this.openSubtitleTracksPanelFromHost(), this.eventOptions());
      window.addEventListener(LOAD_SUBTITLE_FILES_EVENT, (event) => this.loadSubtitleFilesFromHost(event), this.eventOptions());
      for (const eventName of YOUTUBE_SUBTITLE_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, () => this.handleYouTubeNavigation(), this.eventOptions());
      }
      for (const eventName of SUBTITLE_FULLSCREEN_CHANGE_EVENTS) {
        document.addEventListener(eventName, () => {
          this.handleFullscreenLayoutChange();
        }, this.eventOptions());
      }
      window.addEventListener("scroll", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true, capture: true }));
      window.addEventListener("resize", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.addEventListener("orientationchange", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.visualViewport?.addEventListener("resize", () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
      window.visualViewport?.addEventListener("scroll", () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
      this.discoverVideo();
      this.tick();
      log.info("Subtitle controller initialized");
    }
    mutationCouldAffectFullscreenState(mutation) {
      if (mutation.type === "childList") return mutationSwapsFullscreenHostCandidate(mutation);
      if (mutation.type !== "attributes") return false;
      const target = mutation.target;
      if (!(target instanceof HTMLElement)) return false;
      return target.matches("ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]") || Boolean(target.closest("ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]"));
    }
    handleYouTubeNavigation() {
      if (!isYouTubePage()) return;
      this.fullscreenHost.invalidateHostCache();
      this.markNativeCueListsDirty();
      this.lastYouTubeTrackDiscoveryAt = 0;
      this.transcriptDefaultOpenApplied = false;
      this.scheduleDiscoverVideo();
      void this.discoverYouTubeTracksThrottled(true);
      this.scheduleAlignToVideo();
    }
    handleFullscreenLayoutChange() {
      this.fullscreenHost.invalidateHostCache();
      this.syncFullscreenState();
      if (this.video && !this.video.paused) this.startFrameSync(this.video);
      this.alignToVideo();
      this.scheduleAlignToVideo();
      window.setTimeout(() => {
        if (!this.destroyed) this.scheduleAlignToVideo();
      }, 80);
      this.render();
      this.syncControls();
    }
    destroy() {
      this.destroyed = true;
      this.hideNativeFullscreenCueTrack();
      this.resetShadowPracticeState();
      this.clearPlaybackPauseReassert();
      this.abortController?.abort();
      this.abortController = void 0;
      this.observer?.disconnect();
      this.observer = void 0;
      this.videoResizeObserver?.disconnect();
      this.videoResizeObserver = void 0;
      this.subtitleControlRail?.destroy();
      this.subtitleControlRail = void 0;
      this.discoverTimer = clearWindowTimeout(this.discoverTimer);
      this.tickTimer = clearWindowTimeout(this.tickTimer);
      this.stopFrameSync();
      this.clearControlsIdleTimer();
      this.clearAwayCommitTimer();
      this.alignFrame = clearWindowAnimationFrame(this.alignFrame);
      this.transcriptScrollFrame = clearWindowAnimationFrame(this.transcriptScrollFrame);
      this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
      this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
      this.tracksVirtualRenderFrame = clearWindowAnimationFrame(this.tracksVirtualRenderFrame);
      this.clearDeferredTranscriptPanelRender();
      this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
      this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
      this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
      this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
      this.clearTranscriptPanelAnimation();
      this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
      this.pendingPointerActivity = void 0;
      this.clearVideoInsetForTranscriptPanel();
      this.subtitleStylePanelOpen = false;
      document.documentElement.classList.remove(YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS);
      this.removeAsbPlayerSubtitleMoveHandles();
      this.transcriptPanel?.remove();
      this.root?.remove();
      this.root = void 0;
      this.subtitleEl = void 0;
      this.transcriptPanel = void 0;
      this.video = void 0;
      this.fullscreenHost.invalidateHostCache();
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
      this.renderOpenSubtitlePanel();
      this.hideControlsImmediately();
    }
    syncRootVisibility(settings) {
      if (!this.root) return;
      const tracksPanelOpen = settings.subtitlePlayerEnabled && this.panelMode === "tracks" && this.isTranscriptPanelOpen();
      const hidden = !tracksPanelOpen && shouldHideSubtitleRoot(settings, this.video, this.cues, this.tracks);
      this.root.hidden = hidden;
      if (hidden && this.transcriptPanel) this.hideTranscriptPanelElement({ immediate: true });
      this.root.classList.toggle("jpdb-subtitle-hidden", !settings.subtitleOverlayVisible);
      this.root.classList.toggle("jpdb-subtitle-controls-auto", settings.subtitleControlsMode === "auto");
      this.root.classList.toggle("jpdb-subtitle-controls-hidden", settings.subtitleControlsMode === "hidden");
      this.root.classList.toggle("jpdb-subtitle-controls-always", settings.subtitleControlsMode === "always");
      this.root.classList.toggle("jpdb-subtitle-controls-idle", shouldKeepIdleControlClass(this.root, settings));
      if (settings.subtitleControlsMode !== "auto") this.setControlsAway(false);
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
      this.applyEffectiveSubtitleBottom();
      this.syncSubtitleDragOffsetStyle();
      this.root.style.setProperty("--subtitle-color", settings.subtitleTextColor);
      this.root.style.setProperty("--subtitle-outline", settings.subtitleOutlineColor);
      this.root.style.setProperty("--subtitle-background-rgba", accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
      this.root.style.setProperty("--subtitle-family", settings.subtitleFontFamily);
      this.root.style.setProperty("--subtitle-weight", String(settings.subtitleFontWeight));
    }
    openTranscriptPanelFromSettings(settings) {
      if (this.transcriptDefaultOpenApplied) return;
      if (!settings.subtitleTranscriptVisible || !this.hasTranscriptSurface()) return;
      if (this.transcriptPanel && !this.transcriptPanel.hidden) return;
      this.transcriptDefaultOpenApplied = true;
      this.openLinesPanel({ deferRender: true });
    }
    install() {
      if (this.root) return true;
      const body = document.body;
      if (!body) return false;
      document.querySelectorAll('.jpdb-subtitle-player[data-jpdb-reader-root="true"], .jpdb-subtitle-list[data-jpdb-reader-root="true"]').forEach((element) => element.remove());
      if (isYouTubePage() || document.querySelector("[data-yomu-video-frame]")) installSubtitleFullscreenRedirect();
      const root = document.createElement("div");
      root.className = "jpdb-subtitle-player";
      root.dataset.jpdbReaderRoot = "true";
      const settings = this.options.getSettings();
      const previousLabel = uiText(settings.interfaceLanguage, "previousSubtitle");
      const nextLabel = uiText(settings.interfaceLanguage, "nextSubtitle");
      const visibilityLabel = uiText(settings.interfaceLanguage, "subtitleOverlayVisible");
      const panelLabel = uiText(settings.interfaceLanguage, "openSubtitlePanel");
      const moveLabel = uiText(settings.interfaceLanguage, "moveSubtitles");
      const moveAccessibleLabel = uiText(settings.interfaceLanguage, "moveSubtitlesAccessible");
      const moveControlsLabel = uiText(settings.interfaceLanguage, "moveSubtitleControls");
      const ocrLabel = uiText(settings.interfaceLanguage, settings.ocrVideoPauseFrames ? "readVideoFrameStop" : "readVideoFrame");
      const ocrButton = settings.ocrEnabled && settings.ocrProvider !== "off" ? `<button class="jpdb-subtitle-ocr-trigger${settings.ocrVideoPauseFrames ? " jpdb-subtitle-ocr-active" : ""}" type="button" data-action="ocr" title="${escapeHtml(ocrLabel)}" aria-label="${escapeHtml(ocrLabel)}" aria-pressed="${settings.ocrVideoPauseFrames}">${subtitleIcon("scan")}</button>` : "";
      setInnerHtml(root, `
            <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines" aria-live="polite"></div><button class="jpdb-subtitle-drag-handle" type="button" data-subtitle-drag-handle data-jpdb-reader-surface-ignore title="${escapeHtml(moveLabel)}" aria-label="${escapeHtml(moveAccessibleLabel)}" aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home 0"><span aria-hidden="true"></span></button></div>
            <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore></div>
            <div class="jpdb-subtitle-rail" data-jpdb-reader-surface-ignore>
                <button class="jpdb-subtitle-rail-move" type="button" data-action="rail-expand" data-subtitle-rail-drag-handle title="${escapeHtml(moveControlsLabel)}" aria-label="${escapeHtml(moveControlsLabel)}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home 0">${subtitleIcon("grip")}</button>
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                ${ocrButton}
                <button class="jpdb-subtitle-visibility-toggle" type="button" data-action="visibility" title="${escapeHtml(visibilityLabel)}" aria-label="${escapeHtml(visibilityLabel)}">${subtitleIcon(settings.subtitleOverlayVisible ? "eye" : "eye-off")}</button>
                <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel" title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon("panel-right")}</button>
                ${renderSubtitleStyleControls(settings, settings.interfaceLanguage)}
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
        `);
      root.addEventListener("click", (event) => this.handleClick(event));
      root.addEventListener("input", (event) => this.handleSubtitleStyleInput(event), this.eventOptions());
      root.addEventListener("change", (event) => this.handleSubtitleStyleInput(event), this.eventOptions());
      const stylePopover = root.querySelector("[data-subtitle-style-popover]");
      for (const eventName of TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS) {
        stylePopover?.addEventListener(eventName, (event) => this.stopSubtitleStylePopoverPropagation(event), this.eventOptions());
      }
      this.subtitleEl = root.querySelector(".jpdb-subtitle-lines");
      this.transcriptPanel = root.querySelector(".jpdb-subtitle-list");
      this.transcriptPanel.dataset.jpdbReaderRoot = "true";
      this.transcriptPanel.addEventListener("click", (event) => this.handleTranscriptPanelClick(event), this.eventOptions());
      this.transcriptPanel.addEventListener("keydown", (event) => this.handleTranscriptPanelKeydown(event), this.eventOptions());
      for (const eventName of TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS) {
        this.transcriptPanel.addEventListener(eventName, (event) => this.stopTranscriptPanelPropagation(event), this.eventOptions());
      }
      body.appendChild(root);
      body.appendChild(this.transcriptPanel);
      this.root = root;
      this.subtitleControlRail = bindSubtitleControlRail(
        root,
        () => this.showControlsTemporarily({ independentOfPlayerChrome: true }),
        { getReservedRects: () => this.nativePlayerControlSafeZones() }
      ) ?? void 0;
      this.bindSubtitleDragHandle();
      this.restoreSubtitleDragOffset();
      this.refresh();
      this.alignToVideo();
      this.subtitleControlRail?.syncPosition();
      this.scheduleControlsIdle();
      return true;
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
      if (video.closest("[data-jpdb-reader-surface-ignore]")) return false;
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
      if (this.fullscreenHost.shouldHostSubtitleRootInFullscreenElement(fullscreenElement) && frameHasPlayerControls(fullscreenElement)) return true;
      const frame = subtitleVideoLayoutTarget(this.video);
      if (frame && frame !== this.video && frameHasPlayerControls(frame)) return true;
      return Boolean(this.tracks.length || this.cues.length || this.currentCue?.text);
    }
    clearDiscoveredVideoCandidate() {
      this.bufferingPlayback = void 0;
      this.video = void 0;
      this.fullscreenHost.invalidateHostCache();
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
      this.bufferingPlayback = void 0;
      this.video = candidate;
      this.fullscreenHost.invalidateHostCache();
      this.markNativeCueListsDirty();
      this.clearTransientSubtitleState();
      this.removeStaleNativeTracks(candidate);
      this.attachTextTracks(candidate);
      this.observeVideoLayout(candidate);
      this.alignToVideo();
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
      this.markNativeCueListsDirty();
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
      this.lastDomCaptionSeenAt = 0;
      this.lastAutoCopiedCueSignature = "";
      this.lastRenderedPrimaryText = "";
      this.lastRenderedPrimaryHtml = "";
      this.lastAppliedSubtitleHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
      this.lastParseWarmupAnchor = -1;
      this.resetShadowPracticeState();
      this.restoreSubtitleDragOffset();
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
      else if (this.panelMode === "shadow") this.renderShadowPanel(true);
      else if (this.panelMode === "mine") this.renderBatchMiningPanel();
      else this.renderTranscriptPanel();
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
      for (const eventName of ["webkitbeginfullscreen", "webkitendfullscreen", "webkitpresentationmodechanged"]) {
        video.addEventListener(eventName, () => {
          if (videoIsInNativeFullscreen(video)) this.showNativeFullscreenCueTrack(video);
          else this.hideNativeFullscreenCueTrack();
          this.handleFullscreenLayoutChange();
        }, this.eventOptions({ passive: true }));
      }
      const handlePlaybackTimeChanged = () => this.syncSubtitleToPlaybackTime();
      const handlePlaybackSeek = () => {
        if (this.bufferingPlayback?.video === video) this.bufferingPlayback.time = video.currentTime;
        this.syncSubtitleToPlaybackTime();
      };
      video.addEventListener("timeupdate", handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
      video.addEventListener("seeking", handlePlaybackSeek, this.eventOptions({ passive: true }));
      video.addEventListener("seeked", handlePlaybackSeek, this.eventOptions({ passive: true }));
      video.addEventListener("ratechange", handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
      const handlePlaybackBuffering = (event) => {
        if (video !== this.video || video.paused || video.ended) return;
        if (event.type === "stalled" && video.readyState > HTMLMediaElement.HAVE_CURRENT_DATA) return;
        if (this.bufferingPlayback?.video === video) return;
        this.bufferingPlayback = { video, time: video.currentTime };
        this.stopFrameSync();
      };
      video.addEventListener("waiting", handlePlaybackBuffering, this.eventOptions({ passive: true }));
      video.addEventListener("stalled", handlePlaybackBuffering, this.eventOptions({ passive: true }));
      video.addEventListener("pause", () => {
        if (video === this.video) {
          this.bufferingPlayback = void 0;
          this.stopFrameSync();
          this.syncControls();
        }
        this.syncPauseTranscriptPanel({ deferRender: true });
      }, this.eventOptions({ passive: true }));
      video.addEventListener("ended", () => {
        if (video === this.video) this.bufferingPlayback = void 0;
      }, this.eventOptions({ passive: true }));
      const handlePlaybackStarted = (event) => {
        this.pausePanelDismissed = false;
        if (this.pausePanelOpen) this.schedulePauseTranscriptPanelSync();
        if (video === this.video) {
          if (event.type === "playing") this.bufferingPlayback = void 0;
          this.startFrameSync(video);
          this.syncControls();
        }
        this.scheduleAlignToVideo();
      };
      video.addEventListener("play", handlePlaybackStarted, this.eventOptions({ passive: true }));
      video.addEventListener("playing", handlePlaybackStarted, this.eventOptions({ passive: true }));
      this.scheduleAlignToVideo();
    }
    syncSubtitleToPlaybackTime() {
      if (this.destroyed || document.hidden || !this.options.getSettings().subtitlePlayerEnabled) return;
      this.refreshNativeCueListsIfStale();
      this.updateFromLoadedCues();
      if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }
    addNativeTrack(track) {
      if (isYouTubePage()) return;
      if (track === this.nativeFullscreenCueTrack || track.label === NATIVE_FULLSCREEN_CUE_TRACK_LABEL) return;
      if (this.tracks.some((item) => item.track === track)) return;
      const id = `native-${this.tracks.length}`;
      const label = track.label || track.language || `${uiText(this.options.getSettings().interfaceLanguage, "subtitleFallbackLabel")} ${this.tracks.length + 1}`;
      const option = { id, label, kind: "native", language: track.language, track };
      this.tracks.push(option);
      this.markNativeCueListsDirty();
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
        void this.selectTrack(option.id, { auto: true });
        return;
      }
      if (this.shouldAutoSelectSecondaryPageTrack(option, secondary)) {
        void this.selectSecondaryTrack(option.id, { auto: true });
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
      if (synthetic) void this.selectTrack(synthetic.id, { auto: true });
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
      if (!this.isTrackSelectionCurrent(role, requestId, option.id)) return;
      if (loadedCues.length <= 1) {
        this.setSelectedNativeTrackId(role, "");
        option.loadingState = "ready";
        this.syncControls();
        this.renderTrackPanel();
        return;
      }
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
      const option = this.tracks.find((track) => track.id === optionId);
      if (option) option.cues = cues;
      if (role === "primary" && this.selectedTrackId === optionId) this.cues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(optionId));
      if (role === "secondary" && this.secondaryTrackId === optionId) this.secondaryCues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(optionId));
    }
    updateFromNativeTrack(track) {
      const active = track.activeCues?.[0];
      if (!active) return;
      this.updatePrimaryNativeTrackCue(track, active);
      this.updateSecondaryNativeTrackCue(track, active);
      this.render();
      this.renderOpenSubtitlePanel();
      this.syncPauseTranscriptPanel();
      this.syncControls();
    }
    updatePrimaryNativeTrackCue(track, active) {
      const primary = this.tracks.find((item) => item.id === this.selectedTrackId);
      if (primary?.track === track) {
        const cues = readTextTrackCues(track);
        if (cues.length) primary.cues = cues;
        if (cues.length) {
          this.cues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(primary.id));
          this.updateFromLoadedCues();
          return;
        }
        this.currentCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active) }])[0];
        void this.autoCopyCurrentCue();
      }
    }
    updateSecondaryNativeTrackCue(track, active) {
      const secondary = this.tracks.find((item) => item.id === this.secondaryTrackId);
      if (secondary?.track === track) {
        const cues = readTextTrackCues(track);
        if (cues.length) secondary.cues = cues;
        if (cues.length) {
          this.secondaryCues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(secondary.id));
          this.updateFromLoadedCues();
          return;
        }
        this.secondaryCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active), transcriptEligible: false }])[0];
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
    // The active cadence is only needed while a video is actually playing;
    // hidden tabs and videoless pages ticking that fast just drains battery.
    tickDelayMs(settings) {
      if (document.hidden || !settings.subtitlePlayerEnabled || !this.video) return SUBTITLE_TICK_IDLE_MS;
      if (this.video.paused) return SUBTITLE_TICK_PAUSED_MS;
      return SUBTITLE_TICK_ACTIVE_MS;
    }
    restartTickAfterVisibilityChange() {
      if (this.destroyed) return;
      if (document.hidden) {
        this.stopFrameSync();
        return;
      }
      if (this.video && !this.video.paused) this.startFrameSync(this.video);
      if (this.tickTimer === void 0) return;
      window.clearTimeout(this.tickTimer);
      this.tickTimer = void 0;
      this.tick();
    }
    // Frame-synced cue + karaoke sampler. The housekeeping tick (500ms) is too
    // coarse for cue boundaries — a line could flip up to a tick late, worse at
    // 1.5-2x playback — so sample once per presented frame while the bound video
    // plays. Cancelled on pause/seek-away/destroy/hidden so a paused or
    // backgrounded tab never spins. updateFromLoadedCues no-ops when the active
    // cue is unchanged, so the steady-state per-frame cost is two bounded cue
    // searches.
    startFrameSync(video) {
      if (this.destroyed || document.hidden || this.bufferingPlayback?.video === video) return;
      this.stopFrameSync();
      this.frameSyncVideo = video;
      this.scheduleFrameSync();
    }
    scheduleFrameSync() {
      const video = this.frameSyncVideo;
      if (!video || this.frameSyncHandle !== void 0) return;
      const host = videoFrameCallbackHost(video);
      const run = () => {
        this.frameSyncHandle = void 0;
        if (this.destroyed || document.hidden) {
          this.frameSyncVideo = void 0;
          return;
        }
        const current = this.frameSyncVideo;
        if (!current || current.paused || !current.isConnected || this.bufferingPlayback?.video === current) {
          this.frameSyncVideo = void 0;
          return;
        }
        this.sampleSubtitleFrame(current);
        this.scheduleFrameSync();
      };
      this.frameSyncHandle = host ? host.requestVideoFrameCallback(run) : window.requestAnimationFrame(run);
    }
    stopFrameSync() {
      const handle = this.frameSyncHandle;
      if (handle !== void 0) {
        const host = this.frameSyncVideo ? videoFrameCallbackHost(this.frameSyncVideo) : null;
        if (host) host.cancelVideoFrameCallback(handle);
        else window.cancelAnimationFrame(handle);
        this.frameSyncHandle = void 0;
      }
      this.frameSyncVideo = void 0;
    }
    sampleSubtitleFrame(video) {
      const settings = this.options.getSettings();
      if (!settings.subtitlePlayerEnabled) return;
      this.updateFromLoadedCues();
      this.syncShadowAutoPause();
      this.syncShadowLoop();
      this.syncPlayingVideoGeometry();
      if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) {
        this.applyKaraokeStateToPrimary(this.currentCue, this.subtitlePlaybackTime(video));
      }
    }
    syncPlayingVideoGeometry() {
      const now = performance.now();
      if (now - this.lastFrameGeometrySampleAt < SUBTITLE_FRAME_GEOMETRY_SYNC_MS) return;
      this.lastFrameGeometrySampleAt = now;
      this.realignIfVideoMoved();
    }
    // The video the subtitle controller is currently bound to, when it is still
    // in the DOM. Consumed by the mining-pause path so it pauses the exact
    // player the overlay is tracking instead of a document-wide largest-video
    // heuristic (which mis-fires with ads/previews/miniplayers).
    getBoundVideo() {
      return this.video && this.video.isConnected ? this.video : void 0;
    }
    tickSubtitlePlayer(settings) {
      this.syncYouTubeMobileBottomSheetState();
      this.refreshSubtitleSourcesForTick();
      this.refreshNativeCueListsIfStale();
      this.setNativeTrackModes();
      this.syncShortsReelNavigation();
      this.updateFromLoadedCues();
      this.syncShadowAutoPause();
      this.syncShadowLoop();
      this.realignIfVideoMoved();
      this.syncPlayerChromeIdleState();
      this.syncNativeControlsInset();
      this.syncNativePlayerControlHitProtection();
      this.subtitleControlRail?.syncPosition();
      this.syncAsbPlayerSubtitleMoveHandles(settings);
      if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
      if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }
    syncYouTubeMobileBottomSheetState() {
      document.documentElement.classList.toggle(
        YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS,
        hasOpenYouTubeMobileBottomSheet()
      );
    }
    // The rail follows the player's own chrome: on phones there is no hover,
    // so the player's fade state is the only "controls are visible" signal
    // the viewer has — the rail must appear and disappear in lockstep.
    syncPlayerChromeIdleState() {
      if (!this.root) return;
      const chromeHidden = this.videoPlayerChromeHidden();
      if (chromeHidden) this.blurFocusedRailControl();
      if (!this.hasAutoIdleMode(this.options.getSettings())) {
        this.setControlsAway(false);
        this.lastPlayerChromeHidden = chromeHidden;
        return;
      }
      if (!this.canObservePlayerChromeFade()) {
        this.lastPlayerChromeHidden = chromeHidden;
        return;
      }
      if (chromeHidden) {
        if (this.shouldAutoIdleControls() && !this.subtitleSurfaceWakeActive) this.hideControlsImmediately();
      } else if (this.lastPlayerChromeHidden && this.isVideoPlayerChromeSurface()) {
        this.showControlsTemporarily();
      }
      this.setControlsAway(chromeHidden && !this.subtitleSurfaceWakeActive && !this.hasActiveSubtitleUi());
      this.lastPlayerChromeHidden = chromeHidden;
    }
    // m.youtube.com stacks its own top control row (autoplay/CC/settings) in
    // the same corner the rail occupies, and the rail shows in lockstep with
    // that chrome — whenever both are visible they collide. Measure the native
    // top row and push the rail below it via a CSS inset variable.
    syncNativeControlsInset() {
      if (!this.root) return;
      const overlay = this.mobileYouTubeControlOverlay();
      this.root.classList.toggle("jpdb-subtitle-native-top-controls", Boolean(overlay));
      if (!overlay) {
        this.root.style.removeProperty("--jpdb-subtitle-native-top-inset");
        return;
      }
      const topRow = overlay.querySelector(".player-controls-top");
      const rowRect = topRow?.getBoundingClientRect();
      if (!rowRect || rowRect.height <= 0) return;
      const rootTop = this.root.getBoundingClientRect().top;
      const inset = Math.round(Math.min(Math.max(rowRect.bottom - rootTop + 8, 48), 160));
      this.root.style.setProperty("--jpdb-subtitle-native-top-inset", `${inset}px`);
    }
    blurFocusedRailControl() {
      if (this.lastControlsInputWasKeyboard) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.root?.contains(active) && active.closest(".jpdb-subtitle-rail")) {
        active.blur();
      }
    }
    isVideoPlayerChromeSurface() {
      return Boolean(this.mobileYouTubeControlOverlay() || this.video?.closest("#movie_player, .html5-video-player"));
    }
    // #player-control-overlay is m.youtube-only chrome; everywhere else the
    // per-tick document query burned cycles to find nothing (profiled as part
    // of the tick's continuous cost).
    mobileYouTubeControlOverlay() {
      return isMobileYouTubePage() ? document.querySelector("#player-control-overlay") : null;
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
    // Re-reading (and normalizing) every cue of the selected tracks on each
    // 500ms tick AND every timeupdate was a continuous burner. Everything
    // event-observable (track add, selection change, cuechange, navigation,
    // video rebind) marks the dirty flag for an immediate refresh; silent
    // cue-list APPENDS fire no TextTrack event, so they are caught by the
    // bounded forced re-read (at most every 5s).
    refreshNativeCueListsIfStale() {
      const now = performance.now();
      if (!this.nativeCueListsDirty && now - this.lastForcedNativeCueRefreshAt < SUBTITLE_TICK_FORCED_CUE_REFRESH_MS) return;
      this.nativeCueListsDirty = false;
      this.lastForcedNativeCueRefreshAt = now;
      this.refreshNativeCueLists();
    }
    markNativeCueListsDirty() {
      this.nativeCueListsDirty = true;
    }
    // Completeness-sensitive discrete actions (opening a transcript-backed
    // panel, snapshotting a batch-mining scan) must not see up to the
    // staleness bound of silently-appended native cues: refresh NOW and reset
    // the gate so the next tick does not redo it.
    forceNativeCueRefresh() {
      this.nativeCueListsDirty = false;
      this.lastForcedNativeCueRefreshAt = performance.now();
      this.refreshNativeCueLists();
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
      return isSubtitleOverlayVideoVisible(rect) && (!isYouTubePage() || this.fullscreen || youtubeWatchPlayerMeaningfullyVisible(rect)) && (!this.video || isSubtitleVideoElementRenderable(this.video)) && this.videoHasPlayerAffordances();
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
      this.syncNativePlayerControlHitProtection();
      this.subtitleControlRail?.syncPosition();
    }
    updateFromLoadedCues() {
      if (!this.video) return;
      const time = this.subtitlePlaybackTime(this.video);
      const secondary = this.secondaryTrackId ? findActiveSubtitleCue(this.secondaryCues, time) ?? findInitialLeadInCue(this.secondaryCues, time) : void 0;
      const cue = this.selectedTrackId ? this.findRenderablePrimaryCue(time, secondary) : void 0;
      if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
      else this.warmParseOnGapAnchorJump();
    }
    subtitlePlaybackTime(video) {
      return this.bufferingPlayback?.video === video ? this.bufferingPlayback.time : video.currentTime;
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
      this.renderOpenSubtitlePanel();
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
      this.clearShadowRecordingIfCueChanged(cue);
      if (this.shadowAutoPausedCueSignature !== subtitleCueSignature(cue)) this.shadowAutoPausedCueSignature = "";
      this.currentCue = cue;
      return true;
    }
    clearLoadedPrimaryCue() {
      this.clearShadowRecordingIfCueChanged(void 0);
      this.shadowAutoPausedCueSignature = "";
      this.currentCue = void 0;
      this.lastDomCaption = "";
      this.lastDomCaptionSeenAt = 0;
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
      this.lastDomCaptionSeenAt = performance.now();
      const now = this.video ? this.subtitlePlaybackTime(this.video) : 0;
      if (now >= this.currentCue.start && this.currentCue.end < now + 1) {
        this.currentCue.end = now + 4;
        this.refreshNativeFullscreenCueMirror();
      }
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
      return this.options.getSettings().subtitleOverlayVisible || this.isTranscriptPanelOpen();
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
      if (this.shouldHoldRecentDomCaption()) return;
      this.pendingDomCaption = void 0;
      if (!this.cues.length && this.currentCue && (this.video ? this.subtitlePlaybackTime(this.video) : 0) > this.currentCue.end) {
        this.currentCue = void 0;
        this.lastDomCaption = "";
        this.lastDomCaptionSeenAt = 0;
        this.render();
        this.syncControls();
        this.refreshNativeFullscreenCueMirror();
      }
    }
    shouldHoldRecentDomCaption() {
      if (this.cues.length || !this.currentCue || !this.lastDomCaptionSeenAt) return false;
      return performance.now() - this.lastDomCaptionSeenAt < DOM_CAPTION_MISSING_GRACE_MS;
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
      void this.parseCueHtmlBatch(texts, this.options.getSettings(), { enrichBeforeRender: true, requireEnrichedProvisional: true }).catch(() => void 0);
    }
    domCaptionCueTexts(text) {
      return normalizeSubtitleCues([{ start: 0, end: 4, text }]).map((cue) => cue.text.trim()).filter(Boolean);
    }
    applyDomCaptionFallback(text, selected) {
      this.lastDomCaption = text;
      this.lastDomCaptionSeenAt = performance.now();
      const now = this.video ? this.subtitlePlaybackTime(this.video) : 0;
      this.currentCue = normalizeSubtitleCues([{ start: now, end: now + 4, text }])[0];
      if (selected?.loadingState === "waiting") selected.loadingState = "ready";
      this.render();
      this.renderOpenSubtitlePanel();
      this.syncControls();
      this.refreshNativeFullscreenCueMirror();
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
      const changed = this.applySubtitleHtml(`${subtitlePrimaryRowHtml(primary.html)}${this.renderSecondarySubtitle(settings)}`);
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
        time: this.video ? this.subtitlePlaybackTime(this.video) : activeCue?.start ?? 0
      });
    }
    primaryParsedHtmlForRender(text, settings, key) {
      const cached = this.cachedParsedCueHtml(key, settings);
      if (cached !== void 0) return cached;
      const provisional = this.htmlCache.provisionalParsedHtmlCache.get(key);
      if (provisional !== void 0) {
        if (this.shouldUseProvisionalSubtitleParse(settings)) {
          if (!this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)) {
            if (this.hasAuthoritativeParseTier(settings)) {
              this.ensureAuthoritativeParsedCueHtml(text, settings, key);
              return void 0;
            }
            this.ensureEnrichedProvisionalParsedCueHtml(text, settings, key);
            if (!this.htmlCache.parsedTokenCache.has(key)) return void 0;
          } else {
            this.ensureAuthoritativeParsedCueHtml(text, settings, key);
          }
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
      this.syncNativePlayerControlHitProtection();
      this.cacheRenderedPrimarySubtitle(primary);
      this.requestParsedPrimaryIfNeeded(primary, text);
    }
    applyRenderedPrimaryKaraoke(primary) {
      const activeCue = this.currentCue;
      if (primary.karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video ? this.subtitlePlaybackTime(this.video) : activeCue.start);
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
      const cached = this.htmlCache.parsedHtmlCache.get(key);
      if (cached) {
        const root = this.replacePrimaryHtml(cached, serial);
        if (root) this.notifyParsedTokensForKey(key, true, [root]);
        return;
      }
      try {
        const html = await this.parseCueHtml(text, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
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
        this.lastAppliedSubtitleHtml = `${subtitlePrimaryRowHtml(replacement)}${this.renderSecondarySubtitle(this.options.getSettings())}`;
        this.syncKaraokePrimary(currentCue, shouldSyncKaraoke);
        this.fitSubtitleTextToVideo();
        this.syncNativePlayerControlHitProtection();
        return primary;
      }
      return null;
    }
    shouldRenderKaraokePrimary(primary, currentCue) {
      return Boolean(this.options.getSettings().subtitleKaraokeMode && currentCue && cueHasExactWordTimings(currentCue) && normalizedSubtitleText(primary.textContent) === normalizedSubtitleText(currentCue.text));
    }
    primaryReplacementHtml(html, currentCue, shouldKaraoke) {
      return shouldKaraoke && currentCue && !html.includes("jpdb-reader-word") ? renderSubtitleKaraokeCue(currentCue, this.video ? this.subtitlePlaybackTime(this.video) : currentCue.start) : html;
    }
    syncKaraokePrimary(currentCue, shouldKaraoke) {
      if (!shouldKaraoke || !currentCue) return;
      this.applyKaraokeStateToPrimary(currentCue, this.video ? this.subtitlePlaybackTime(this.video) : currentCue.start);
    }
    shouldParseSubtitles(settings = this.options.getSettings()) {
      return canParseSubtitleTranscriptRows(settings);
    }
    parseCacheKey(text, settings = this.options.getSettings()) {
      return this.htmlCache.parseCacheKey(text, settings);
    }
    async parseCueHtml(text, settings = this.options.getSettings(), options = {}) {
      const key = this.parseCacheKey(text, settings);
      const cached = this.cachedParsedCueHtml(key, settings);
      if (cached) {
        return cached;
      }
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings) && this.shouldBypassProvisionalForAuthoritative(settings, options)) {
        return await this.parseAuthoritativeCueHtml(text, settings, key);
      }
      const emptyCached = this.freshEmptyParsedHtml(key);
      if (emptyCached) return emptyCached;
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseProvisionalCueHtml(text, settings, key, options);
      const pending = this.pendingParsedCueHtml(key, "authoritative");
      if (pending) return pending;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, this.finalSubtitleParseOptions(settings));
        if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key, html, tokens);
        return html;
      })();
      this.htmlCache.pendingParsedHtml.set(key, promise);
      try {
        return await promise;
      } finally {
        this.htmlCache.pendingParsedHtml.delete(key);
      }
    }
    async parseAuthoritativeCueHtml(text, settings, key) {
      this.ensureAuthoritativeParsedCueHtml(text, settings, key);
      const pending = this.htmlCache.pendingParsedHtml.get(key);
      if (pending) return pending;
      const cached = this.cachedParsedCueHtml(key, settings);
      if (cached) return cached;
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, authoritativeSubtitleParseOptions());
        await this.beforeRenderParsedTokens(tokens);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key, html, tokens, { forceNotify: true });
        this.applyAuthoritativeParsedCueHtml(key, text, html);
        return html;
      })();
      this.htmlCache.pendingParsedHtml.set(key, promise);
      try {
        return await promise;
      } finally {
        if (this.htmlCache.pendingParsedHtml.get(key) === promise) this.htmlCache.pendingParsedHtml.delete(key);
      }
    }
    async parseProvisionalCueHtml(text, settings, key, options = {}) {
      const restored = this.restoreSessionParsedCueHtml(key);
      if (restored) return restored;
      const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
      const cached = this.htmlCache.provisionalParsedHtmlCache.get(key);
      const cachedIsEnriched = this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key);
      if (cached && (!options.refreshProvisional || cachedIsEnriched) && (!options.requireEnrichedProvisional || cachedIsEnriched)) {
        if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        return cached;
      }
      const pending = options.refreshProvisional ? options.requireEnrichedProvisional ? void 0 : this.htmlCache.pendingProvisionalParsedHtml.get(key) : this.pendingParsedCueHtml(key, "provisional");
      if (pending) {
        const html = await pending;
        if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        return html;
      }
      const promise = (async () => {
        const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
        if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.rememberParsedCueHtml(key, html, tokens, { provisional: true, enriched: this.shouldMarkCueEnriched(key, tokens, options.enrichBeforeRender === true) });
        return html;
      })();
      this.htmlCache.pendingProvisionalParsedHtml.set(key, promise);
      try {
        const html = await promise;
        if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        return html;
      } finally {
        this.htmlCache.pendingProvisionalParsedHtml.delete(key);
      }
    }
    ensureEnrichedProvisionalParsedCueHtml(text, settings, key) {
      if (this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key) || this.htmlCache.pendingProvisionalParsedHtml.has(key)) return;
      void this.parseProvisionalCueHtml(text, settings, key, {
        authoritativeUpgrade: false,
        enrichBeforeRender: true,
        requireEnrichedProvisional: true,
        refreshProvisional: true
      }).then((html) => {
        if (!this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)) return;
        this.updateTranscriptRowsForParseKey(key, html, { provisional: true, force: true });
        if (this.currentPrimaryParseCacheKey() === key) this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
      }).catch(() => void 0);
    }
    ensureAuthoritativeParsedCueHtml(text, settings, key) {
      this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key }], settings);
    }
    ensureAuthoritativeParsedCueHtmlBatch(items, settings) {
      if (!this.shouldParseSubtitles()) return;
      if (!this.hasAuthoritativeParseTier(settings)) return;
      const missing = items.filter((item) => this.cachedParsedCueHtml(item.key, settings) === void 0 && !this.htmlCache.pendingParsedHtml.has(item.key));
      if (!missing.length) return;
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(missing.map((item) => item.text), authoritativeSubtitleParseOptions()) : Promise.all(missing.map((item) => this.options.parseJapanese(item.text, authoritativeSubtitleParseOptions())));
      const enriched = this.enrichParsedTokenBatchBeforeRender(parsed);
      const parsedHtml = missing.map((item, index) => enriched.then((tokens) => {
        const tokenList = tokens[index] ?? [];
        const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
        this.rememberParsedCueHtml(item.key, html, tokenList, { forceNotify: true });
        this.applyAuthoritativeParsedCueHtml(item.key, item.text, html);
        return html;
      }));
      missing.forEach((item, index) => this.htmlCache.pendingParsedHtml.set(item.key, parsedHtml[index]));
      void Promise.allSettled(parsedHtml).finally(() => {
        missing.forEach((item, index) => {
          if (this.htmlCache.pendingParsedHtml.get(item.key) === parsedHtml[index]) this.htmlCache.pendingParsedHtml.delete(item.key);
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
      if (!texts.length || !this.shouldParseSubtitles()) return;
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
      const tokens = this.htmlCache.parsedTokenCache.get(key);
      if (!tokens?.length) return;
      const provisional = !this.htmlCache.parsedHtmlCache.has(key) && this.htmlCache.provisionalParsedHtmlCache.has(key);
      const previous = provisional ? this.htmlCache.provisionalParsedHtmlCache.get(key) : this.htmlCache.parsedHtmlCache.get(key);
      if (previous === void 0) return;
      const html = withBreaks(renderTokensToHtml(text, tokens, settings));
      if (html === previous) return;
      this.rememberParsedCueHtml(key, html, tokens, provisional ? { provisional: true, enriched: true } : {});
      this.updateTranscriptRowsForParseKey(key, html, { provisional, force: true });
      if (this.currentPrimaryParseCacheKey() !== key) return;
      this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }
    applyParsedPrimaryHtml(key, text, html, serial) {
      if (!this.shouldParseSubtitles()) return;
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
      if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) {
        if (this.shouldBypassProvisionalForAuthoritative(settings, options)) return await this.parseAuthoritativeCueHtmlBatch(items, settings);
        return await this.parseCueHtmlBatchWithProvisionalFallback(items, settings, options);
      }
      const { ready, batch } = planSubtitleParseBatch(
        items,
        // Keyless there is nothing to upgrade to, so a provisional hit is
        // final here too — without it the transcript-tail warmup
        // (allowProvisional: false) re-parsed every already-parsed cue a
        // second time through the local tokenizer.
        (key) => this.cachedParsedCueHtml(key, settings) ?? this.freshEmptyParsedHtml(key) ?? (this.hasAuthoritativeParseTier(settings) ? void 0 : this.htmlCache.provisionalParsedHtmlCache.get(key)),
        (key) => this.pendingParsedCueHtml(key, "authoritative")
      );
      if (!batch.length) return Promise.all(ready);
      if (!this.options.parseJapaneseBatch) {
        return Promise.all([...ready, ...batch.map(async (item) => ({
          key: item.key,
          html: await this.parseCueHtml(item.text, settings, options)
        }))]);
      }
      const parsed = this.options.parseJapaneseBatch(batch.map((item) => item.text), this.finalSubtitleParseOptions(settings));
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { enrichBeforeRender: options.enrichBeforeRender });
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.htmlCache.pendingParsedHtml);
    }
    async parseAuthoritativeCueHtmlBatch(items, settings) {
      if (!items.length) return [];
      this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
      return await Promise.all(items.map(async (item) => {
        const cached = this.cachedParsedCueHtml(item.key, settings);
        if (cached) return { key: item.key, html: cached };
        const pending = this.htmlCache.pendingParsedHtml.get(item.key);
        return { key: item.key, html: pending ? await pending : await this.parseAuthoritativeCueHtml(item.text, settings, item.key) };
      }));
    }
    async parseCueHtmlBatchWithProvisionalFallback(items, settings, options = {}) {
      const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
      const { ready, batch } = planProvisionalSubtitleParseBatch(
        items,
        (key) => this.htmlCache.parsedHtmlCache.get(key),
        (key) => this.usableProvisionalParsedHtml(key, options),
        (key) => options.refreshProvisional ? void 0 : this.pendingParsedCueHtml(key, "provisional"),
        (key) => this.freshEmptyParsedHtml(key)
      );
      if (shouldUpgradeAuthoritative) {
        const batchedItems = new Set(batch);
        this.ensureAuthoritativeParsedCueHtmlBatch(items.filter((item) => !batchedItems.has(item)), settings);
      }
      if (!batch.length) return Promise.all(ready);
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(batch.map((item) => item.text), provisionalSubtitleParseOptions()) : Promise.all(batch.map((item) => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
      const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true, enrichBeforeRender: options.enrichBeforeRender });
      const results = await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.htmlCache.pendingProvisionalParsedHtml);
      if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtmlBatch(batch, settings);
      return results;
    }
    renderParsedHtmlBatch(batch, parsed, settings, options = {}) {
      const prepared = options.enrichBeforeRender ? this.enrichParsedTokenBatchBeforeRender(parsed) : parsed;
      return batch.map((item, index) => prepared.then((tokens) => {
        const tokenList = tokens[index] ?? [];
        const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
        this.rememberParsedCueHtml(item.key, html, tokenList, { ...options, enriched: this.shouldMarkCueEnriched(item.key, tokenList, options.enrichBeforeRender === true) });
        return options.provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
      }));
    }
    async parseTranscriptRowHtmlBatch(items, rows, settings, options = {}) {
      const plain = [];
      const contextual = [];
      for (const item of items) {
        if (this.shouldParseTranscriptRowWithContext(rows, item.rowIndex)) contextual.push(item);
        else plain.push(item);
      }
      const results = await Promise.all([
        plain.length ? this.parseCueHtmlBatch(plain.map((item) => item.text), settings, options) : Promise.resolve([]),
        contextual.length ? this.parseTranscriptContextHtmlBatch(contextual, rows, settings, options) : Promise.resolve([])
      ]);
      return results.flat();
    }
    async parseTranscriptContextHtmlBatch(items, rows, settings, options = {}) {
      const provisional = options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings) && !this.shouldBypassProvisionalForAuthoritative(settings, options);
      const pendingCache = provisional ? this.htmlCache.pendingProvisionalParsedHtml : this.htmlCache.pendingParsedHtml;
      const parseOptions = provisional ? provisionalSubtitleParseOptions() : this.finalSubtitleParseOptions(settings);
      const ready = [];
      const batch = [];
      for (const item of items) {
        const cached = this.cachedTranscriptContextHtml(item.key, settings, options, provisional);
        if (cached) {
          ready.push(Promise.resolve(cached));
          continue;
        }
        const pending = pendingCache.get(item.key);
        if (pending && !(provisional && options.refreshProvisional)) {
          ready.push(pending.then((html) => provisional ? { key: item.key, html, provisional: true } : { key: item.key, html }));
          continue;
        }
        batch.push({ ...item, context: this.transcriptContextWindow(rows, item.rowIndex) });
      }
      if (!batch.length) return Promise.all(ready);
      const parsed = this.options.parseJapaneseBatch ? this.options.parseJapaneseBatch(batch.map((item) => item.context.text), parseOptions) : Promise.all(batch.map((item) => this.options.parseJapanese(item.context.text, parseOptions)));
      const prepared = options.enrichBeforeRender ? this.enrichParsedTokenBatchBeforeRender(parsed) : parsed;
      const parsedHtml = batch.map((item, index) => prepared.then((tokenRows) => {
        const rowTokens = this.projectTranscriptContextTokens(tokenRows[index] ?? [], item.context);
        const html = withBreaks(renderTokensToHtml(item.text, rowTokens, settings));
        this.rememberParsedCueHtml(item.key, html, rowTokens, {
          provisional,
          enriched: this.shouldMarkCueEnriched(item.key, rowTokens, options.enrichBeforeRender === true)
        });
        return provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
      }));
      return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, pendingCache);
    }
    cachedTranscriptContextHtml(key, settings, options, provisional) {
      const authoritative = this.cachedParsedCueHtml(key, settings);
      if (authoritative) return { key, html: authoritative };
      const empty = this.freshEmptyParsedHtml(key);
      if (empty) return { key, html: empty, provisional: provisional || void 0 };
      if (provisional) {
        const html = this.usableProvisionalParsedHtml(key, options);
        if (html) return { key, html, provisional: true };
      } else if (!this.hasAuthoritativeParseTier(settings)) {
        const html = this.htmlCache.provisionalParsedHtmlCache.get(key);
        if (html) return { key, html, provisional: true };
      }
      return void 0;
    }
    projectTranscriptContextTokens(tokens, context) {
      return tokens.flatMap((token) => this.projectTranscriptContextToken(token, context));
    }
    projectTranscriptContextToken(token, context) {
      const start = Math.max(token.start, context.rowStart);
      const end = Math.min(token.end, context.rowEnd);
      if (end <= start) return [];
      return [{
        ...token,
        start: start - context.rowStart,
        end: end - context.rowStart,
        length: end - start,
        rubies: this.projectTranscriptContextRubies(token, start, end, context.rowStart)
      }];
    }
    projectTranscriptContextRubies(token, start, end, rowStart) {
      return token.rubies.flatMap((ruby) => {
        const rubyStart = Math.max(ruby.start, start);
        const rubyEnd = Math.min(ruby.end, end);
        if (rubyEnd <= rubyStart) return [];
        return [{
          ...ruby,
          start: rubyStart - rowStart,
          end: rubyEnd - rowStart,
          length: rubyEnd - rubyStart
        }];
      });
    }
    async enrichParsedTokenBatchBeforeRender(parsed) {
      const tokenRows = await parsed;
      await this.beforeRenderParsedTokens(tokenRows.flat());
      return tokenRows;
    }
    async beforeRenderParsedTokens(tokens) {
      if (!this.shouldParseSubtitles() || !tokens.length || !this.options.beforeRenderTokens) return;
      await this.options.beforeRenderTokens(tokens);
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
    usableProvisionalParsedHtml(key, options) {
      return this.htmlCache.usableProvisionalParsedHtml(key, options);
    }
    shouldMarkCueEnriched(key, tokens, enrichRequested) {
      return this.htmlCache.shouldMarkCueEnriched(key, tokens, enrichRequested);
    }
    rememberParsedCueHtml(key, html, tokens = [], options = {}) {
      this.htmlCache.rememberParsedCueHtml(key, html, tokens, options);
    }
    hasAuthoritativeParseTier(settings = this.options.getSettings()) {
      return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings);
    }
    finalSubtitleParseOptions(settings) {
      return this.hasAuthoritativeParseTier(settings) ? authoritativeSubtitleParseOptions() : subtitleParseOptions();
    }
    shouldBypassProvisionalForAuthoritative(settings, options) {
      return options.requireEnrichedProvisional === true && this.hasAuthoritativeParseTier(settings);
    }
    restoreSessionParsedCueHtml(key) {
      return this.htmlCache.restoreSessionParsedCueHtml(key);
    }
    notifyParsedTokensForKey(key, force = false, roots) {
      if (!this.shouldParseSubtitles() || !this.options.afterParseTokens) return;
      const tokens = this.htmlCache.parsedTokenCache.get(key);
      if (!tokens?.length) return;
      const now = Date.now();
      const lastNotifiedAt = this.htmlCache.parsedTokenNotifiedAt.get(key) ?? 0;
      if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
      this.htmlCache.parsedTokenNotifiedAt.set(key, now);
      this.options.afterParseTokens(tokens, roots);
    }
    shouldUseProvisionalSubtitleParse(_settings) {
      return isYouTubePage();
    }
    hasFreshEmptyParsedHtml(key) {
      return this.htmlCache.hasFreshEmptyParsedHtml(key);
    }
    freshEmptyParsedHtml(key) {
      return this.htmlCache.freshEmptyParsedHtml(key);
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
          await this.parseCueHtmlBatch(texts, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
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
      const time = this.video ? this.subtitlePlaybackTime(this.video) : 0;
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
        if (seen.has(key) || this.isWarmParsedCueKey(key, settings)) continue;
        seen.add(key);
        texts.push(text);
      }
      return texts;
    }
    // Keyless there is no authoritative tier, so a provisional hit is final
    // and the cue counts as warm; keyed the provisional tier stays listed so
    // a failed authoritative upgrade is retried by the next warmup turn.
    isWarmParsedCueKey(key, settings = this.options.getSettings()) {
      if (this.cachedParsedCueHtml(key, settings) !== void 0 || this.hasFreshEmptyParsedHtml(key)) return true;
      return !this.hasAuthoritativeParseTier(settings) && this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key);
    }
    cachedParsedCueHtml(key, settings) {
      return this.htmlCache.cachedParsedCueHtml(key, settings);
    }
    pendingParsedCueHtml(key, tier) {
      return this.htmlCache.pendingParsedCueHtml(key, tier);
    }
    applyEffectiveSubtitleBottom() {
      if (!this.root) return;
      this.root.style.setProperty("--subtitle-bottom", `${effectiveSubtitleBottomPercent(this.options.getSettings())}%`);
    }
    fitSubtitleTextToVideo() {
      if (!this.root || !this.subtitleEl) return;
      this.applyEffectiveSubtitleBottom();
      const settings = this.options.getSettings();
      const target = subtitleFrameTargetFontSize(this.root, settings);
      let fitted = target;
      this.root.style.setProperty("--subtitle-font-size-target", `${target}px`);
      this.root.style.setProperty("--subtitle-secondary-font-size", `${subtitleSecondaryFontSize(target)}px`);
      this.root.style.setProperty("--subtitle-font-size", `${fitted}px`);
      const primary = this.subtitleEl.querySelector(".jpdb-subtitle-primary");
      if (!primary) return;
      fitted = this.fitPrimarySubtitleFontSize(fitted, subtitleMinimumFontSize(this.root));
      this.root.style.setProperty("--subtitle-font-size", `${fitted}px`);
    }
    fitPrimarySubtitleFontSize(fitted, minimum) {
      if (!this.root || !this.subtitleEl) return fitted;
      return fittedSubtitleFontSize(this.subtitleEl, fitted, minimum, (value) => {
        this.root?.style.setProperty("--subtitle-font-size", `${value}px`);
      });
    }
    applyKaraokeStateToPrimary(cue, time) {
      this.karaokeSampler.applyKaraokeStateToPrimary(cue, time);
    }
    handleClick(event) {
      const eventTarget = event.target;
      if (eventTarget.closest?.(".jpdb-reader-word")) return;
      if (this.panelOptionsMenuOpen && !eventTarget.closest?.("[data-panel-options]")) this.closePanelOptionsMenu();
      const insideStylePopover = Boolean(eventTarget.closest?.("[data-subtitle-style-popover]"));
      const target = eventTarget.closest("[data-action]");
      const action = target?.dataset.action;
      if (!action) {
        if (insideStylePopover) {
          event.stopPropagation();
          this.showControlsTemporarily();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.showControlsTemporarily();
      const handler = this.clickHandlers[action];
      if (!handler) return;
      handler(target);
      if (event.detail > 0) target.closest("button")?.blur();
      if (action !== "menu") this.syncControls();
    }
    handleTranscriptPanelClick(event) {
      this.handleClick(event);
      event.stopPropagation();
    }
    handleSubtitleStyleInput(event) {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-subtitle-style-setting]") : null;
      if (!target || !this.root?.contains(target)) return;
      event.stopPropagation();
      if (!this.applySubtitleStyleControlValue(target)) return;
      this.syncRootStyleSettings(this.options.getSettings());
      this.syncSubtitleStyleControls();
      this.render();
      this.options.onSettingsChange();
      this.showControlsTemporarily();
    }
    stopTranscriptPanelPropagation(event) {
      event.stopPropagation();
    }
    stopSubtitleStylePopoverPropagation(event) {
      event.stopPropagation();
      this.showControlsTemporarily();
    }
    handleTranscriptPanelKeydown(event) {
      if (event.key === "Escape" && this.panelOptionsMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        this.closePanelOptionsMenu();
        this.transcriptPanel?.querySelector('[data-action="panel-options"]')?.focus();
        return;
      }
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
    adjustTrackTimingOffset(id, deltaSeconds) {
      if (!id) return;
      this.setTrackTimingOffset(id, this.trackTimingOffsetSeconds(id) + deltaSeconds);
    }
    alignTrackTimingOffset(id, forward) {
      if (!id || !this.video) return;
      const cue = this.adjacentTrackTimingCue(id, forward);
      if (!cue) return;
      this.setTrackTimingOffset(id, this.video.currentTime - cue.start);
    }
    setTrackTimingOffset(id, offsetSeconds) {
      if (!id) return;
      const track = this.tracks.find((item) => item.id === id);
      if (!track) return;
      const role = this.trackSelectionRole(id);
      const previousOffset = this.trackTimingOffsetSeconds(id);
      const baseCues = role ? this.baseCuesForSelectedTrack(id, role, previousOffset) : [];
      const nextOffset = normalizeSubtitleTimingOffsetSeconds(offsetSeconds);
      if (nextOffset) track.timingOffsetSeconds = nextOffset;
      else delete track.timingOffsetSeconds;
      if (role) this.applySelectedTrackTimingOffset(id, role, baseCues, nextOffset);
      this.afterTrackTimingOffsetChanged();
    }
    applySelectedTrackTimingOffset(id, role, baseCues, offsetSeconds) {
      const adjusted = offsetSubtitleCues(baseCues, offsetSeconds);
      if (role === "primary") {
        if (id !== this.selectedTrackId) return;
        this.cues = adjusted;
        this.currentCue = void 0;
        this.lastAutoCopiedCueSignature = "";
        this.lastRenderedPrimaryText = "";
        this.lastRenderedPrimaryHtml = "";
        this.lastAppliedSubtitleHtml = "";
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
        this.lastParseWarmupAnchor = -1;
        return;
      }
      if (id !== this.secondaryTrackId) return;
      this.secondaryCues = adjusted;
      this.secondaryCue = void 0;
    }
    afterTrackTimingOffsetChanged() {
      this.lastTranscriptSignature = "";
      this.clearTranscriptVirtualRender();
      this.updateFromLoadedCues();
      this.render();
      this.renderOpenSubtitlePanel();
      this.syncControls();
      this.warmParseAroundActiveCue();
      this.scheduleTranscriptCacheWarmup();
      void this.autoCopyCurrentCue();
    }
    trackSelectionRole(id) {
      if (id === this.selectedTrackId) return "primary";
      if (id === this.secondaryTrackId) return "secondary";
      return void 0;
    }
    baseCuesForSelectedTrack(id, role, previousOffset = this.trackTimingOffsetSeconds(id)) {
      const track = this.tracks.find((item) => item.id === id);
      if (track?.cues?.length) return track.cues;
      const cues = role === "primary" ? this.cues : this.secondaryCues;
      return offsetSubtitleCues(cues, -previousOffset);
    }
    trackTimingOffsetSeconds(id) {
      return normalizeSubtitleTimingOffsetSeconds(this.tracks.find((track) => track.id === id)?.timingOffsetSeconds);
    }
    adjacentTrackTimingCue(id, forward) {
      if (!this.video) return void 0;
      const role = this.trackSelectionRole(id);
      if (!role) return void 0;
      const baseCues = this.baseCuesForSelectedTrack(id, role);
      const offset = this.trackTimingOffsetSeconds(id);
      return adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, offset, forward);
    }
    transcriptPlacementFromTarget(target) {
      const placement = target.closest("[data-placement]")?.dataset.placement;
      return placement === "left" || placement === "right" || placement === "bottom" ? placement : void 0;
    }
    changeTranscriptPlacement(target) {
      const placement = this.transcriptPlacementFromTarget(target);
      if (!placement) return;
      this.closePanelOptionsMenu();
      const settings = this.options.getSettings();
      if (placement === this.plannedTranscriptPlacement()) return;
      settings.subtitleTranscriptPlacement = placement;
      if (placement !== "bottom") this.clampStoredSideWidthForCurrentVideo(placement);
      this.options.onSettingsChange();
      if (this.panelMode === "tracks" || !this.hasTranscriptSurface()) this.renderOpenSubtitlePanel();
      else {
        this.lastTranscriptSignature = "";
        this.syncPanelPlacementButtons();
      }
      this.clearVideoInsetForTranscriptPanel();
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncControls();
    }
    applySubtitleStyleControlValue(control) {
      const settings = this.options.getSettings();
      const setting = control.dataset.subtitleStyleSetting;
      if (setting === "subtitleFontSize") return updateNumberSetting(settings, "subtitleFontSize", control.value, 16, 64);
      if (setting === "subtitleFontWeight") return updateNumberSetting(settings, "subtitleFontWeight", control.value, 300, 900);
      if (setting === "subtitleBackgroundOpacity") return updateNumberSetting(settings, "subtitleBackgroundOpacity", control.value, 0, 0.7);
      if (setting === "subtitleFontFamily") {
        const next = SUBTITLE_STYLE_FONT_FAMILY_VALUES.includes(control.value) ? control.value : settings.subtitleFontFamily;
        if (settings.subtitleFontFamily === next) return false;
        settings.subtitleFontFamily = next;
        return true;
      }
      if (setting === "subtitleHoverPause" && control instanceof HTMLInputElement) {
        if (settings.subtitleHoverPause === control.checked) return false;
        settings.subtitleHoverPause = control.checked;
        return true;
      }
      if (setting === "subtitleMiningPause" && control instanceof HTMLInputElement) {
        if (settings.subtitleMiningPause === control.checked) return false;
        settings.subtitleMiningPause = control.checked;
        return true;
      }
      return false;
    }
    resetSubtitleStyleDefaults() {
      const settings = this.options.getSettings();
      let changed = false;
      const reset = (key) => {
        if (settings[key] === DEFAULT_SETTINGS[key]) return;
        settings[key] = DEFAULT_SETTINGS[key];
        changed = true;
      };
      reset("subtitleFontSize");
      reset("subtitleFontWeight");
      reset("subtitleBottomOffset");
      reset("subtitleBackgroundOpacity");
      reset("subtitleFontFamily");
      reset("subtitleMiningPause");
      reset("subtitleHoverPause");
      this.resetLegacySubtitleDragOffset();
      this.syncRootStyleSettings(settings);
      this.syncSubtitleStyleControls();
      this.render();
      if (changed) this.options.onSettingsChange();
      this.showControlsTemporarily();
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
      this.closePanelOptionsMenu();
      if (this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
      this.syncPointerActivity(event.clientX, event.clientY);
    }
    // A displaced subtitle can leave its move handle outside the player while
    // native chrome is hidden. Wake from a deliberate press inside the visible
    // subtitle rectangle so it remains recoverable; the document-level hit
    // test does not add a pointer-catching layer over transparent player space.
    wakeControlsFromSubtitleSurface(event) {
      if (!this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
      this.lastControlsInputWasKeyboard = false;
      this.showControlsTemporarily({ independentOfPlayerChrome: true });
    }
    handleSubtitleSurfaceClick(event) {
      if (!this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
      const target = event.target instanceof Element ? event.target : null;
      const hitSubtitleContent = Boolean(target && this.isInSubtitleUi(target));
      if (hitSubtitleContent) return;
      if (target && this.isInNativeVideoPlayer(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const player = this.video?.closest("#movie_player, .html5-video-player");
      const focusTarget = player?.hasAttribute("tabindex") ? player : this.video;
      focusTarget?.focus({ preventScroll: true });
    }
    handleSubtitleUiFocusOut(event) {
      const previous = event.target instanceof Element ? event.target : null;
      if (!previous || !this.isInSubtitleUi(previous)) return;
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (next && this.isInSubtitleUi(next)) return;
      const signal = this.abortController?.signal;
      queueMicrotask(() => {
        if (this.destroyed || signal?.aborted) return;
        if (!this.hasActiveSubtitleUi()) this.scheduleControlsIdle();
      });
    }
    handleSubtitleUiFocusIn(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !this.isInSubtitleUi(target)) return;
      this.showControlsTemporarily();
    }
    isInSubtitleUi(element) {
      return Boolean(this.root?.contains(element) || this.asbPlayerSubtitleMoveRoots().some((root) => root.contains(element)));
    }
    isInNativeVideoPlayer(element) {
      if (element === this.video) return true;
      const player = this.video?.closest("#movie_player, .html5-video-player, ytm-player, #player");
      return Boolean(player?.contains(element));
    }
    syncPointerActivity(clientX, clientY) {
      if (!this.hasAutoIdleMode(this.options.getSettings())) return;
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
        mode: handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR) ? "transform" : "bottom-offset",
        startY,
        startOffset: this.subtitleDragOffsetYPx,
        startBottomOffset: this.options.getSettings().subtitleBottomOffset,
        referenceHeight: this.subtitlePositionReferenceHeight(dragFrame),
        bounds: this.subtitleDragOffsetBounds(dragFrame),
        lastClientY: startY
      };
      this.subtitleDragActive = true;
      handle.classList.add("jpdb-subtitle-dragging");
      dragRoot?.classList.add("jpdb-subtitle-dragging");
      if (dragRoot !== this.root) this.root?.classList.add("jpdb-subtitle-dragging");
      document.documentElement.classList.add("jpdb-subtitle-dragging");
      return session;
    }
    updateSubtitleDrag(session, clientY, event) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      session.lastClientY = clientY;
      if (session.frame !== void 0) return;
      this.applySubtitleDragPreview(session, clientY);
      session.frame = window.requestAnimationFrame(() => {
        session.frame = void 0;
        if (session.appliedClientY !== session.lastClientY) this.applySubtitleDragPreview(session, session.lastClientY);
      });
    }
    endSubtitleDrag(session) {
      this.flushSubtitleDragPreview(session);
      this.subtitleDragActive = false;
      session.handle.classList.remove("jpdb-subtitle-dragging");
      session.dragRoot?.classList.remove("jpdb-subtitle-dragging");
      if (session.dragRoot !== this.root) this.root?.classList.remove("jpdb-subtitle-dragging");
      document.documentElement.classList.remove("jpdb-subtitle-dragging");
      if (session.mode === "bottom-offset") {
        this.commitSubtitleBottomOffsetFromDrag(session);
        this.resetLegacySubtitleDragOffset();
      } else this.persistSubtitleDragOffset();
    }
    applySubtitleDragPreview(session, clientY) {
      session.appliedClientY = clientY;
      const deltaY = clientY - session.startY;
      if (session.mode === "bottom-offset") {
        const next = this.subtitleBottomOffsetFromDelta(session.startBottomOffset, deltaY, session.referenceHeight);
        session.previewBottomOffset = next;
        session.previewOffset = Math.round((session.startBottomOffset - next) / 100 * session.referenceHeight);
        this.subtitleDragPreviewOffsetYPx = session.previewOffset;
        this.syncYomuSubtitleDragOffsetStyle();
      } else {
        this.setSubtitleDragOffset(session.startOffset + deltaY, session.dragFrame, session.bounds);
        session.previewOffset = this.subtitleDragOffsetYPx;
      }
    }
    flushSubtitleDragPreview(session) {
      if (session.frame !== void 0) {
        window.cancelAnimationFrame(session.frame);
        session.frame = void 0;
      }
      if (session.appliedClientY !== session.lastClientY) this.applySubtitleDragPreview(session, session.lastClientY);
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
      const mode = event.currentTarget instanceof HTMLElement && event.currentTarget.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR) ? "transform" : "bottom-offset";
      if (shouldReset) {
        if (mode === "bottom-offset") this.resetSubtitleBottomOffset();
        else this.resetSubtitleDragOffset();
      } else {
        if (mode === "bottom-offset") this.adjustSubtitleBottomOffsetByPixels(delta, dragFrame);
        else {
          this.setSubtitleDragOffset(this.subtitleDragOffsetYPx + delta, dragFrame);
          this.persistSubtitleDragOffset();
        }
      }
      this.showControlsTemporarily();
    }
    commitSubtitleBottomOffsetFromDrag(session) {
      if (session.previewBottomOffset === void 0) return;
      this.setSubtitleBottomOffset(session.previewBottomOffset);
    }
    subtitleBottomOffsetFromDelta(startPercent, deltaY, referenceHeight) {
      return this.clampedSubtitleBottomOffset(startPercent - deltaY / referenceHeight * 100);
    }
    adjustSubtitleBottomOffsetByPixels(deltaY, dragFrame) {
      this.setSubtitleBottomOffset(this.options.getSettings().subtitleBottomOffset - deltaY / this.subtitlePositionReferenceHeight(dragFrame) * 100);
    }
    setSubtitleBottomOffset(value) {
      if (!Number.isFinite(value)) return;
      const settings = this.options.getSettings();
      const next = this.clampedSubtitleBottomOffset(value);
      if (settings.subtitleBottomOffset === next) return;
      settings.subtitleBottomOffset = next;
      this.applyEffectiveSubtitleBottom();
      this.syncSubtitleStyleControls();
      this.options.onSettingsChange();
    }
    resetSubtitleBottomOffset() {
      this.setSubtitleBottomOffset(DEFAULT_SUBTITLE_BOTTOM_OFFSET);
      this.resetLegacySubtitleDragOffset();
    }
    subtitlePositionReferenceHeight(dragFrame) {
      const rect = this.root?.getBoundingClientRect() ?? dragFrame?.getBoundingClientRect();
      const styledHeight = this.root?.style.height ?? "";
      const styledRootHeight = styledHeight.endsWith("px") ? Number.parseFloat(styledHeight) : 0;
      return Math.max(1, rect?.height || styledRootHeight || this.videoLayoutRect().height || dragFrame?.getBoundingClientRect().height || this.subtitleDragViewportHeight());
    }
    setSubtitleDragOffset(offsetPx, dragFrame, bounds) {
      const offset = Math.round(this.clampedSubtitleDragOffset(offsetPx, dragFrame, bounds));
      if (offset === this.subtitleDragOffsetYPx) return;
      this.subtitleDragOffsetYPx = offset;
      this.syncAsbSubtitleDragOffsetStyle();
    }
    // Snap back to the configured bottom offset and forget the remembered nudge.
    resetSubtitleDragOffset() {
      this.resetLegacySubtitleDragOffset();
    }
    resetLegacySubtitleDragOffset() {
      this.subtitleDragOffsetFraction = 0;
      this.subtitleDragOffsetYPx = 0;
      this.subtitleDragPreviewOffsetYPx = void 0;
      saveSubtitleDragOffsetFraction(0);
      this.syncSubtitleDragOffsetStyle();
    }
    // Reproject the remembered nudge (a viewport-height fraction) into pixels
    // against the current viewport. Runs on first install, on video changes, and
    // on every viewport/fullscreen change (via syncFullscreenState) so the line
    // keeps its relative position when the player resizes, rotates, or enters
    // fullscreen instead of staying frozen at the old pixel magnitude. Skipped
    // mid-drag so it never fights the gesture the user is performing.
    restoreSubtitleDragOffset() {
      if (this.subtitleDragActive) return;
      this.subtitleDragOffsetYPx = Math.round(this.subtitleDragOffsetFraction * this.subtitleDragViewportHeight());
      this.syncSubtitleDragOffsetStyle();
    }
    // Remember the current nudge as a viewport-height fraction so it scales across
    // players of different sizes. Called when a drag/keyboard adjustment settles.
    persistSubtitleDragOffset() {
      const viewportHeight = this.subtitleDragViewportHeight();
      this.subtitleDragOffsetFraction = viewportHeight > 0 ? this.subtitleDragOffsetYPx / viewportHeight : 0;
      saveSubtitleDragOffsetFraction(this.subtitleDragOffsetFraction);
    }
    subtitleDragViewportHeight() {
      return Math.max(240, window.innerHeight || document.documentElement.clientHeight || 0);
    }
    syncSubtitleDragOffsetStyle() {
      this.syncYomuSubtitleDragOffsetStyle();
      this.syncAsbSubtitleDragOffsetStyle();
    }
    syncYomuSubtitleDragOffsetStyle() {
      const yomuOffset = `${this.subtitleDragPreviewOffsetYPx ?? 0}px`;
      if (this.root) setStylePropertyIfChanged(this.root, "--subtitle-drag-offset-y", yomuOffset);
    }
    syncAsbSubtitleDragOffsetStyle() {
      const offset = `${this.subtitleDragOffsetYPx}px`;
      for (const root of this.asbPlayerSubtitleMoveRoots()) {
        setStylePropertyIfChanged(root, "--jpdb-subtitle-asb-drag-offset-y", offset);
      }
    }
    clampedSubtitleBottomOffset(value) {
      return Math.round(Math.min(Math.max(value, this.minSubtitleBottomOffsetPercent()), this.maxSubtitleBottomOffsetPercent()));
    }
    // Mirror of minSubtitleBottomOffsetPercent for the upward direction: the
    // ceiling is the screen, not the frame — the line may ride as high as the
    // user drags it while its top edge stays on screen. The old hard 40% cap
    // "locked" upward drags near the middle of tall players while the downward
    // direction was already screen-bounded.
    maxSubtitleBottomOffsetPercent() {
      const rect = this.root?.getBoundingClientRect();
      if (!rect || rect.height <= 0) return 40;
      const line = this.root?.querySelector(".jpdb-subtitle-text");
      const lineHeight = Math.max(24, line?.getBoundingClientRect().height ?? 0);
      const usable = rect.bottom - 12 - lineHeight;
      return Math.max(40, Math.round(usable / rect.height * 100));
    }
    // The bottom offset is a percentage of the video frame, but the floor is
    // the screen: a letterboxed or inset frame leaves usable space below it,
    // so the line may ride into that gap (negative offset) as long as its
    // bottom edge stays on screen.
    minSubtitleBottomOffsetPercent() {
      const rect = this.root?.getBoundingClientRect();
      const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!rect || rect.height <= 0 || viewportBottom <= 0) return 2;
      const belowFrameGap = viewportBottom - rect.bottom - 12;
      if (belowFrameGap <= 0) return 2;
      return Math.min(2, -Math.round(belowFrameGap / rect.height * 100));
    }
    clampedSubtitleDragOffset(offsetPx, dragFrame, bounds) {
      if (!Number.isFinite(offsetPx)) return this.subtitleDragOffsetYPx;
      const { min, max } = bounds ?? this.subtitleDragOffsetBounds(dragFrame);
      return Math.min(max, Math.max(min, offsetPx));
    }
    subtitleDragOffsetBounds(dragFrame) {
      const viewportHeight = this.subtitleDragViewportHeight();
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
      const moveAccessibleLabel = uiText(settings.interfaceLanguage, "moveSubtitlesAccessible");
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
      handle.setAttribute("aria-label", moveAccessibleLabel);
      handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown PageUp PageDown Home 0");
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
    showControlsTemporarily(options = {}) {
      if (!this.root) return;
      if (options.independentOfPlayerChrome === true) {
        this.subtitleSurfaceWakeActive = this.hasAutoIdleMode(this.options.getSettings());
      }
      this.root.classList.remove("jpdb-subtitle-controls-idle");
      this.setControlsAway(false);
      this.syncSubtitleControlRailButtons();
      this.syncAsbPlayerSubtitleMoveHandles();
      this.scheduleControlsIdle();
    }
    hideControlsImmediately() {
      this.clearControlsIdleTimer();
      this.subtitleSurfaceWakeActive = false;
      if (!this.root || !this.shouldAutoIdleControls()) return;
      this.root.classList.add("jpdb-subtitle-controls-idle");
      const keepGripForNativeChrome = this.canObservePlayerChromeFade() && !this.videoPlayerChromeHidden();
      this.setControlsAway(!keepGripForNativeChrome);
      this.syncSubtitleControlRailButtons();
      this.syncAsbPlayerSubtitleMoveHandles();
    }
    // Whether a native player exposes a chrome-fade signal the rail can follow.
    // Only YouTube surfaces do; for everything else the rail owns its own idle
    // fade via the idle timer.
    canObservePlayerChromeFade() {
      return this.isVideoPlayerChromeSurface();
    }
    // Debounced commit of the fully-hidden ("away") state. Showing (away=false)
    // is immediate; hiding (away=true) waits out a strobing signal and
    // re-confirms against live state before committing, so a flickering
    // hover-autoplay chrome cannot thrash the rail's visibility.
    setControlsAway(away) {
      if (!this.root) return;
      if (!away) {
        this.clearAwayCommitTimer();
        this.root.classList.remove("jpdb-subtitle-controls-away");
        return;
      }
      if (this.root.classList.contains("jpdb-subtitle-controls-away") || this.awayCommitTimer !== void 0) return;
      this.awayCommitTimer = window.setTimeout(() => {
        this.awayCommitTimer = void 0;
        if (this.destroyed || !this.root) return;
        if (!this.hasAutoIdleMode(this.options.getSettings())) return;
        if (this.subtitleSurfaceWakeActive || this.hasActiveSubtitleUi()) return;
        if (this.canObservePlayerChromeFade() && !this.videoPlayerChromeHidden()) return;
        this.root.classList.add("jpdb-subtitle-controls-away");
      }, SUBTITLE_CONTROLS_AWAY_COMMIT_DELAY_MS);
    }
    clearAwayCommitTimer() {
      this.awayCommitTimer = clearWindowTimeout(this.awayCommitTimer);
    }
    scheduleControlsIdle() {
      this.clearControlsIdleTimer();
      const shouldExpireSubtitleSurfaceWake = this.subtitleSurfaceWakeActive && this.hasAutoIdleMode(this.options.getSettings());
      if (!this.shouldAutoIdleControls() && !shouldExpireSubtitleSurfaceWake) return;
      this.controlsIdleTimer = window.setTimeout(() => {
        this.controlsIdleTimer = void 0;
        this.subtitleSurfaceWakeActive = false;
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
      const active = document.activeElement;
      return Boolean(this.root?.matches(":focus-within") || this.asbMoveHandlesActive && active instanceof Element && active.closest(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR));
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
    pointInVisibleSubtitleSurface(x, y) {
      const yomuLineVisible = Boolean(this.root && !this.root.hidden && this.root.classList.contains("jpdb-subtitle-has-lines") && !this.root.classList.contains("jpdb-subtitle-hidden") && !this.root.classList.contains("jpdb-subtitle-video-out-of-view"));
      if (yomuLineVisible && this.pointInElement(this.root?.querySelector(".jpdb-subtitle-text") ?? null, x, y)) return true;
      if (!this.asbMoveHandlesActive) return false;
      return this.asbPlayerSubtitleMoveRoots().some((root) => this.pointInElement(root, x, y));
    }
    videoPlayerChromeHidden() {
      if (this.isYouTubeShortsControlSurface()) return false;
      const mobileOverlay = this.mobileYouTubeControlOverlay();
      if (mobileOverlay) return !mobileOverlay.classList.contains("fadein");
      const player = this.video?.closest("#movie_player, .html5-video-player");
      return Boolean(player?.classList.contains("ytp-autohide") || player?.classList.contains("ytp-hide-controls") || player?.classList.contains("ytp-player-minimized"));
    }
    isYouTubeShortsControlSurface() {
      return Boolean(this.video && isYouTubePage() && isYouTubeShortsLikePlayer(this.video, this.videoLayoutRect()));
    }
    // Native player controls must win when a moved/long subtitle crosses them.
    // The overlay frame is already click-through, but individual lookup words
    // opt back into pointer events. Mark only words whose painted box overlaps
    // a small, visible native control; CSS then returns that word's hit testing
    // to the player while every other subtitle word remains lookupable.
    syncNativePlayerControlHitProtection() {
      const words = Array.from(this.root?.querySelectorAll(
        ".jpdb-subtitle-primary .jpdb-reader-word,.jpdb-subtitle-secondary .jpdb-reader-word"
      ) ?? []);
      words.forEach((word) => word.removeAttribute(SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE));
      const safeZones = this.nativePlayerControlSafeZones();
      if (!safeZones.length) return;
      for (const word of words) {
        const rect = word.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (safeZones.some((zone) => rectsOverlap(rect, zone))) {
          word.setAttribute(SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE, "true");
        }
      }
    }
    nativePlayerControlSafeZones() {
      if (!this.video || !isYouTubePage()) return [];
      const surface = this.youtubeNativeControlSurface();
      if (!surface) return [];
      const videoRect = this.videoLayoutRect();
      const maxWidth = Math.min(240, Math.max(72, videoRect.width * 0.42));
      const maxHeight = Math.min(180, Math.max(56, videoRect.height * 0.28));
      return Array.from(surface.querySelectorAll(NATIVE_PLAYER_CONTROL_SELECTOR)).filter((control) => !control.closest('[data-jpdb-reader-root="true"]')).filter((control) => nativePlayerControlIsInteractive(control)).map((control) => control.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0 && rect.width <= maxWidth && rect.height <= maxHeight && rectsOverlap(rect, videoRect));
    }
    youtubeNativeControlSurface() {
      if (!this.video) return null;
      if (this.isYouTubeShortsControlSurface()) {
        return this.video.closest("ytd-reel-video-renderer,shorts-video,shorts-page,ytd-shorts") ?? this.video.closest("#movie_player,.html5-video-player");
      }
      return this.video.closest("#movie_player,.html5-video-player,ytm-player,ytd-player,#player");
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
      this.lastControlsInputWasKeyboard = true;
      const previousSubtitle = matchesShortcut(event, settings.shortcuts.previousSubtitle);
      const nextSubtitle = matchesShortcut(event, settings.shortcuts.nextSubtitle);
      if (previousSubtitle || nextSubtitle) {
        if (!this.canUseSubtitleNavigationShortcut()) return;
        if (this.readerLookupPopoverOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        this.seekSubtitle(previousSubtitle ? -1 : 1);
      } else if (matchesShortcut(event, settings.shortcuts.copySubtitle) && this.subtitleCopyText(void 0)) {
        event.preventDefault();
        event.stopPropagation();
        void this.copySubtitle();
      }
    }
    canUseSubtitleNavigationShortcut() {
      return Boolean(this.video && this.videoHasPlayerAffordances());
    }
    readerLookupPopoverOpen() {
      return Boolean(document.querySelector(".jpdb-reader-popover"));
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
      this.clearShadowRecordingIfCueChanged(cue);
      if (this.shadowAutoPausedCueSignature !== subtitleCueSignature(cue)) this.shadowAutoPausedCueSignature = "";
      this.seekVideoTo(Math.max(0, cue.start + padding));
      this.clearTranscriptManualScrollPause();
      this.currentCue = cue;
      if (this.shadowLoopEnabled) this.shadowLoopCue = cue;
      this.secondaryCue = this.secondaryCues.find((item) => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
      this.render();
      this.syncControls();
      if (this.panelMode === "shadow") this.renderShadowPanel(true);
      else if (this.panelMode === "lines") this.renderTranscriptPanel();
    }
    toggleVideoFrameOcr() {
      const settings = this.options.getSettings();
      if (settings.ocrVideoPauseFrames) {
        settings.ocrVideoPauseFrames = false;
        this.options.onSettingsChange();
        return;
      }
      this.requestVideoFrameOcr();
      settings.ocrVideoPauseFrames = true;
      this.options.onSettingsChange();
    }
    requestVideoFrameOcr() {
      const video = this.video;
      if (!video) return;
      if (!video.paused) {
        const player = this.youTubePlayerApi(video);
        if (player?.pauseVideo) player.pauseVideo();
        else video.pause();
        this.armPlaybackPauseReassert(video);
      }
      document.dispatchEvent(new CustomEvent("yomu-ocr-video-frame-request", { detail: { video } }));
    }
    // YouTube's #movie_player exposes its player API on the element in the
    // page world. Routing pause/play/seek through it keeps YT's own state
    // machine in agreement — a raw currentTime write triggers a re-buffer YT
    // can bounce, and a raw pause() gets reactively re-played. Feature-detected
    // so embeds, mobile hosts, isolated-world extension builds, and every
    // non-YouTube site keep the raw HTMLMediaElement path.
    youTubePlayerApi(video) {
      if (!isYouTubePage()) return null;
      const player = document.getElementById("movie_player");
      if (!player?.contains(video)) return null;
      const api = player;
      return typeof api.seekTo === "function" ? api : null;
    }
    // A single reactive play() from YouTube's controller or a competing
    // extension can silently undo the pause pill (the "pressing pause didn't
    // happen" symptom). Re-pause for a short window, then stand down so a
    // deliberate resume is never fought — mirrors the mining-pause re-assert.
    armPlaybackPauseReassert(video) {
      this.clearPlaybackPauseReassert();
      const armedAt = Date.now();
      const reassert = () => {
        if (this.video !== video || Date.now() - armedAt > PLAYBACK_PAUSE_REASSERT_WINDOW_MS) {
          this.clearPlaybackPauseReassert();
          return;
        }
        if (!video.paused) video.pause();
      };
      video.addEventListener("play", reassert);
      video.addEventListener("playing", reassert);
      this.playbackPauseReassert = {
        off: () => {
          video.removeEventListener("play", reassert);
          video.removeEventListener("playing", reassert);
        }
      };
    }
    clearPlaybackPauseReassert() {
      this.playbackPauseReassert?.off();
      this.playbackPauseReassert = void 0;
    }
    // The iPhone system player paints in the browser top layer where the DOM
    // overlay cannot follow, so mirror the CURRENTLY-RENDERING cue stream —
    // loaded cues, or the DOM-caption fallback's synthesized cue — into a
    // native text track for the duration of native video fullscreen. With no
    // cue stream at all, hand the system player the host's own captions back.
    showNativeFullscreenCueTrack(video) {
      const cues = this.nativeFullscreenMirrorCues();
      if (!cues.length && this.restoreHostTracksForNativeFullscreen()) {
        const track = this.nativeFullscreenCueTrack;
        if (track && track.mode !== "disabled") track.mode = "disabled";
        return;
      }
      this.reSuppressHostTracksAfterNativeFullscreen();
      if (typeof video.addTextTrack !== "function" || typeof VTTCue !== "function") return;
      try {
        if (this.nativeFullscreenCueVideo !== video) {
          this.nativeFullscreenCueTrack = void 0;
          this.nativeFullscreenCueVideo = video;
        }
        const track = this.nativeFullscreenCueTrack ?? video.addTextTrack("subtitles", NATIVE_FULLSCREEN_CUE_TRACK_LABEL, "ja");
        this.nativeFullscreenCueTrack = track;
        for (const existing of Array.from(track.cues ?? [])) track.removeCue(existing);
        for (const cue of cues) {
          if (!(cue.end > cue.start)) continue;
          track.addCue(new VTTCue(cue.start, cue.end, cue.originalText ?? cue.text));
        }
        track.mode = "showing";
      } catch {
      }
    }
    // The m.youtube DOM-caption fallback never fills this.cues; it synthesizes
    // one short-lived cue at a time into currentCue. Mirror whichever stream
    // is actually rendering.
    nativeFullscreenMirrorCues() {
      if (this.cues.length) return this.cues;
      return this.currentCue ? [this.currentCue] : [];
    }
    // The synthesized cue changes/extends while in native fullscreen; keep the
    // mirror track following it.
    refreshNativeFullscreenCueMirror() {
      const video = this.video;
      if (!video || !videoIsInNativeFullscreen(video)) return;
      this.showNativeFullscreenCueTrack(video);
    }
    // Returns true when host captions are (already) covering the system
    // player; false when there is nothing restorable (e.g. YouTube, which
    // exposes no host TextTracks) so the caller arms the mirror instead.
    restoreHostTracksForNativeFullscreen() {
      if (this.nativeFullscreenHostTracksRestored) return true;
      const restorable = this.tracks.filter((option) => option.track);
      const selected = restorable.filter((option) => option.id === this.selectedTrackId || option.id === this.secondaryTrackId);
      const targets = selected.length ? selected : restorable.slice(0, 1);
      if (!targets.length) return false;
      this.nativeFullscreenHostTracksRestored = true;
      for (const option of targets) {
        if (option.track) option.track.mode = "showing";
      }
      return true;
    }
    reSuppressHostTracksAfterNativeFullscreen() {
      if (!this.nativeFullscreenHostTracksRestored) return;
      this.nativeFullscreenHostTracksRestored = false;
      this.setNativeTrackModes();
    }
    hideNativeFullscreenCueTrack() {
      const track = this.nativeFullscreenCueTrack;
      if (track && track.mode !== "disabled") track.mode = "disabled";
      this.reSuppressHostTracksAfterNativeFullscreen();
    }
    seekVideoTo(time) {
      const video = this.video;
      if (!video) return;
      const player = this.youTubePlayerApi(video);
      if (player?.seekTo) {
        player.seekTo(Math.max(0, time), true);
        return;
      }
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
      input.multiple = true;
      input.style.setProperty("display", "none", "important");
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) {
          input.remove();
          return;
        }
        void this.loadSubtitleFilesFromPicker(kind, files).finally(() => input.remove());
      }, { once: true });
      input.addEventListener("cancel", () => input.remove(), { once: true });
      (document.body || document.documentElement).appendChild(input);
      input.click();
    }
    async loadSubtitleFilesFromPicker(kind, files) {
      const jobs = subtitleFilePickerJobs(kind, files);
      if (!jobs.length) return;
      await this.loadHostedSubtitleFileJobs({ jobs, openPanel: false });
    }
    loadSubtitleFilesFromHost(event) {
      const request = subtitleFilesFromHostEvent(event);
      if (!request.jobs.length) return;
      void this.loadHostedSubtitleFileJobs(request);
    }
    async loadHostedSubtitleFileJobs(request) {
      for (const job of request.jobs) {
        await this.loadSubtitleFile(job.kind, job.file).catch((error) => {
          log.warn("Hosted subtitle file load failed", { kind: job.kind, name: job.file.name, error });
        });
      }
      if (request.openPanel === false) {
        this.renderOpenSubtitlePanel();
        return;
      }
      if (request.openPanel === "tracks") {
        this.openTracksPanel();
        return;
      }
      if (this.hasTranscriptSurface()) this.openLinesPanel({ deferRender: true });
      else this.openTracksPanel();
    }
    async loadSubtitleFile(kind, file) {
      if (!file) return;
      const text = await readHostedSubtitleFileText(file);
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
    async selectTrack(id, options = {}) {
      const requestId = this.preparePrimaryTrackSelection(id);
      if (!options.auto) this.revealPrimarySubtitleOverlay();
      const loaded = await this.loadPrimaryTrackSelection(id, requestId);
      if (!loaded) return;
      if (options.auto && this.revertSingleCueAutoSelection("primary", loaded)) return;
      if (options.auto) this.revealPrimarySubtitleOverlay();
      this.applyPrimaryTrackSelection(loaded);
      this.finishPrimaryTrackSelection(id, loaded.track);
    }
    // A track whose entire payload is a single usable line (a one-cue credit,
    // or a metadata-only track whose cues the normalizer dropped) isn't worth
    // auto-showing an overlay for the whole video; keep the track listed for
    // manual selection but withdraw the automatic pick.
    revertSingleCueAutoSelection(role, loaded) {
      if (loaded.cues.length > 1) return false;
      if (loaded.track) loaded.track.loadingState = "ready";
      if (role === "primary" && this.selectedTrackId === loaded.trackId) {
        this.selectedTrackId = "";
        this.cues = [];
        this.currentCue = void 0;
      }
      if (role === "secondary" && this.secondaryTrackId === loaded.trackId) this.clearSecondaryTrackSelection();
      this.render();
      this.syncControls();
      this.renderTrackPanel();
      return true;
    }
    preparePrimaryTrackSelection(id) {
      const requestId = this.beginTrackSelection("primary");
      this.selectedTrackId = id;
      this.lastAutoCopiedCueSignature = "";
      if (this.secondaryTrackId === id) this.clearSecondaryTrackSelection();
      this.cues = [];
      this.currentCue = void 0;
      this.pendingDomCaption = void 0;
      this.lastDomCaption = "";
      this.lastDomCaptionSeenAt = 0;
      this.lastShadowSignature = "";
      this.resetShadowPracticeState();
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
        translationFallback: this.translationFallbackModeForSelection(request, selected)
      });
      return this.loadedTrackSelection(request, loaded.track, loaded.cues);
    }
    translationFallbackModeForSelection(request, track) {
      if (request.role !== "secondary") return "full";
      return track?.kind === "youtube" && track.sourceType === "translation" ? "full" : "skip";
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
      if (selection.trackId !== this.selectedTrackId) this.selectedTrackId = selection.trackId;
      if (selection.track) selection.track.cues = selection.cues;
      this.cues = offsetSubtitleCues(selection.cues, this.trackTimingOffsetSeconds(selection.trackId));
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
    async selectSecondaryTrack(id, options = {}) {
      const requestId = this.prepareSecondaryTrackSelection(id);
      if (!options.auto) this.revealSecondarySubtitleOverlay();
      const loaded = await this.loadSecondaryTrackSelection(id, requestId);
      if (!loaded) return;
      if (options.auto && this.revertSingleCueAutoSelection("secondary", loaded)) return;
      if (options.auto) this.revealSecondarySubtitleOverlay();
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
        this.lastDomCaption = "";
        this.lastDomCaptionSeenAt = 0;
        this.youtubeDomCaptionFallbackTrackId = "";
        this.lastShadowSignature = "";
        this.resetShadowPracticeState();
      }
      const requestId = this.beginTrackSelection("secondary");
      this.secondaryTrackId = id;
      this.secondaryCues = [];
      this.secondaryCue = void 0;
      this.lastShadowSignature = "";
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
      if (selection.trackId !== this.secondaryTrackId) this.secondaryTrackId = selection.trackId;
      if (selection.track) selection.track.cues = selection.cues;
      this.secondaryCues = offsetSubtitleCues(selection.cues, this.trackTimingOffsetSeconds(selection.trackId));
      if (selection.track) selection.track.loadingState = loadedTrackState(this.secondaryCues);
    }
    finishSecondaryTrackSelection(id, selected) {
      this.finishTrackSelection("Secondary", id, selected, this.secondaryCues.length);
    }
    finishTrackSelection(role, id, selected, cues) {
      this.markNativeCueListsDirty();
      this.setNativeTrackModes();
      this.updateFromLoadedCues();
      this.warmParseAroundActiveCue();
      this.render();
      this.refreshTranscriptPanelAfterTrackChange();
      this.syncControls();
      log.info(`${role} subtitle track selected`, { id, label: selected?.label ?? "", kind: selected?.kind ?? "unknown", cues });
    }
    setNativeTrackModes() {
      if (this.nativeFullscreenHostTracksRestored) return;
      const settings = this.options.getSettings();
      const selected = this.tracks.find((track) => track.id === this.selectedTrackId);
      this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
        suppressNativeCaptions: Boolean(settings.subtitlePlayerEnabled && this.video),
        suppressCaptionPlayerUi: !this.shouldUseDomCaptionFallback(selected),
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
      this.root?.classList.toggle("jpdb-subtitle-style-open", this.subtitleStylePanelOpen);
      this.root?.classList.toggle("jpdb-subtitle-has-lines", hasLines);
      this.root?.classList.toggle("jpdb-subtitle-has-track", hasSelectedSubtitleTrackOrLines(this.selectedTrackId, hasLines));
      this.syncTranscriptPlacementClass();
      this.syncLineNavigationButtons(hasLines);
      this.syncDrawerButtons(hasLines);
      this.syncSubtitleStyleControls();
      this.syncVisibilityRailButton();
      this.syncSubtitleControlRailButtons();
      this.syncVideoFrameOcrButton();
      this.syncTranscriptAutoScrollPausedClass();
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
    // Rail eye toggle: hides the subtitle text for the video being watched
    // while the rail itself stays reachable to bring it back.
    toggleOverlayVisibility() {
      const settings = this.options.getSettings();
      settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
      this.options.onSettingsChange();
      this.refresh();
    }
    syncVisibilityRailButton() {
      const button = this.root?.querySelector('.jpdb-subtitle-rail [data-action="visibility"]');
      if (!button) return;
      const settings = this.options.getSettings();
      const visible = settings.subtitleOverlayVisible;
      const label = uiText(settings.interfaceLanguage, "subtitleOverlayVisible");
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(visible));
      setInnerHtml(button, subtitleIcon(visible ? "eye" : "eye-off"));
    }
    // The grip is both the drag handle and the expand/collapse toggle: a
    // stationary tap flips the persisted mode so an expanded rail stays
    // expanded, while collapsing minimises back to the grip immediately.
    toggleSubtitleControlRailExpanded() {
      const settings = this.options.getSettings();
      const expanded = settings.subtitleControlsMode === "always";
      settings.subtitleControlsMode = expanded ? "auto" : "always";
      this.options.onSettingsChange();
      this.syncRootVisibility(settings);
      if (expanded) this.hideControlsImmediately();
      else this.showControlsTemporarily({ independentOfPlayerChrome: true });
      this.syncControls();
    }
    syncSubtitleControlRailButtons() {
      const settings = this.options.getSettings();
      const expandedMode = settings.subtitleControlsMode === "always";
      const expand = this.root?.querySelector('[data-action="rail-expand"]');
      if (expand) expand.setAttribute("aria-expanded", String(!this.root?.classList.contains("jpdb-subtitle-controls-idle") || expandedMode));
    }
    syncVideoFrameOcrButton() {
      const button = this.root?.querySelector('.jpdb-subtitle-rail [data-action="ocr"]');
      if (!button) return;
      const settings = this.options.getSettings();
      const active = settings.ocrVideoPauseFrames;
      const label = uiText(settings.interfaceLanguage, active ? "readVideoFrameStop" : "readVideoFrame");
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("jpdb-subtitle-ocr-active", active);
    }
    syncLineNavigationButtons(hasLines) {
      const language = this.options.getSettings().interfaceLanguage;
      const hideRailNavigation = this.isTranscriptPanelOpen();
      for (const action of ["previous", "next"]) {
        const railButton = this.root?.querySelector(`.jpdb-subtitle-rail [data-action="${action}"]`);
        if (railButton) {
          syncSubtitleLineNavigationButton(railButton, action, hasLines, Boolean(this.video), language);
          if (hideRailNavigation) railButton.hidden = true;
        }
        const drawerButton = this.transcriptPanel?.querySelector(`.jpdb-subtitle-drawer-playback [data-action="${action}"]`);
        if (drawerButton) syncSubtitleLineNavigationButton(drawerButton, action, hasLines, Boolean(this.video), language);
      }
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
        // Compact viewports force the bottom drawer, so while closed the
        // toggle must advertise where the panel will actually open, not the
        // stored side preference.
        placement: state.panelOpen ? this.effectiveTranscriptPlacement : this.plannedTranscriptPlacement(),
        language: this.options.getSettings().interfaceLanguage
      });
    }
    plannedTranscriptPlacement() {
      return shouldUseCompactSubtitleDrawer(this.transcriptViewportWidth()) ? "bottom" : this.options.getSettings().subtitleTranscriptPlacement;
    }
    panelOptionsState(pausePanelEnabled, language) {
      return {
        placement: this.effectiveTranscriptPlacement,
        pausePanelEnabled,
        menuOpen: this.panelOptionsMenuOpen,
        language
      };
    }
    togglePanelOptionsMenu() {
      this.panelOptionsMenuOpen = !this.panelOptionsMenuOpen;
      this.syncPanelOptionsMenu();
    }
    closePanelOptionsMenu() {
      if (!this.panelOptionsMenuOpen) return;
      this.panelOptionsMenuOpen = false;
      this.syncPanelOptionsMenu();
    }
    syncPanelOptionsMenu() {
      const container = this.transcriptPanel?.querySelector("[data-panel-options]");
      if (!container) return;
      const open = this.panelOptionsMenuOpen;
      container.querySelector('[data-action="panel-options"]')?.setAttribute("aria-expanded", String(open));
      const menu = container.querySelector(".jpdb-subtitle-panel-options-menu");
      if (menu) menu.hidden = !open;
    }
    syncPanelState() {
      const hasLines = Boolean(this.cues.length || this.currentCue?.text);
      const panel = this.transcriptPanel;
      if (panel) {
        panel.classList.toggle("jpdb-subtitle-lines-panel", this.panelMode === "lines");
        panel.classList.toggle("jpdb-subtitle-shadow-panel", this.panelMode === "shadow");
        panel.classList.toggle("jpdb-subtitle-mine-panel", this.panelMode === "mine");
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
      if (this.panelMode === "shadow" && this.hasTranscriptSurface()) return "shadow";
      if (this.panelMode === "mine" && this.hasTranscriptSurface()) return "mine";
      if (this.panelMode === "tracks") return "tracks";
      return this.hasTranscriptSurface() ? "lines" : "tracks";
    }
    toggleTranscriptDrawer() {
      if (!this.transcriptPanel) return;
      this.closeSubtitleStylePanel({ sync: false });
      if (this.isTranscriptPanelOpen()) {
        this.closeTranscriptPanel();
        return;
      }
      const mode = this.preferredTranscriptDrawerMode();
      if (mode === "tracks") this.openTracksPanel();
      else if (mode === "shadow") this.openShadowPanel();
      else if (mode === "mine") this.openBatchMiningPanel();
      else this.openLinesPanel({ deferRender: true });
    }
    showTranscriptPanelElement() {
      const panel = this.transcriptPanel;
      if (!panel) return;
      this.closeSubtitleStylePanel({ sync: false });
      this.clearTranscriptPanelAnimation();
      this.transcriptPanelClosing = false;
      this.prepareTranscriptPanelPlacementForOpen();
      panel.hidden = false;
      this.syncTranscriptPanelFullscreenDisplayOverride();
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
      this.syncTranscriptPanelFullscreenDisplayOverride();
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
      if (!this.prepareTranscriptPanelOpen("lines", options)) return;
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
    openShadowPanel(options = {}) {
      if (!this.prepareTranscriptPanelOpen("shadow", options)) return;
      this.clearDeferredTranscriptPanelRender();
      this.clearTranscriptVirtualRender();
      this.renderShadowPanel(true);
      this.syncControls();
    }
    openBatchMiningPanel(options = {}) {
      if (!this.prepareTranscriptPanelOpen("mine", options)) return;
      this.clearDeferredTranscriptPanelRender();
      this.clearTranscriptVirtualRender();
      this.renderBatchMiningPanel();
      this.syncControls();
    }
    prepareTranscriptPanelOpen(mode, options) {
      if (!this.transcriptPanel || !this.hasTranscriptSurface()) return false;
      this.forceNativeCueRefresh();
      if (!options.autoPause) this.pausePanelDismissed = false;
      this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
      this.panelMode = mode;
      this.showTranscriptPanelElement();
      if (options.persist ?? true) this.transcriptPanelSessionOpen = true;
      return true;
    }
    replayShadowCue() {
      const cue = this.currentCue;
      if (!cue || !this.video) return;
      this.shadowAutoPausedCueSignature = "";
      this.seekVideoTo(Math.max(0, cue.start));
      this.currentCue = cue;
      if (this.shadowLoopEnabled) this.shadowLoopCue = cue;
      this.playShadowModelLine();
      this.renderShadowPanel(true);
    }
    playShadowModelLine() {
      if (!this.video) return;
      try {
        const result = this.video.play();
        if (result && typeof result.catch === "function") void result.catch(() => void 0);
      } catch {
      }
    }
    toggleShadowLoop() {
      this.shadowLoopEnabled = !this.shadowLoopEnabled;
      this.shadowLoopCue = this.shadowLoopEnabled ? this.currentCue : void 0;
      if (this.shadowLoopEnabled) this.replayShadowCue();
      else this.renderShadowPanel(true);
    }
    toggleShadowAutoPause() {
      const settings = this.options.getSettings();
      settings.subtitleShadowAutoPause = !settings.subtitleShadowAutoPause;
      this.shadowAutoPausedCueSignature = "";
      this.options.onSettingsChange();
      this.renderShadowPanel(true);
    }
    toggleShadowText() {
      this.shadowTextVisible = !this.shadowTextVisible;
      this.renderShadowPanel(true);
    }
    // Loop a single line for shadowing practice. The check runs every video frame
    // and on the polling tick; it must survive overshoot (a missed boundary frame
    // leaves currentTime past cue.end, with the live currentCue already advanced to
    // the next line) — so it re-seeks whenever playback is outside the pinned line.
    syncShadowLoop() {
      if (!this.shadowLoopEnabled || !this.video) return;
      const cue = this.shadowLoopCue ?? this.currentCue;
      if (!cue) return;
      if (this.video.paused && this.options.getSettings().subtitleShadowAutoPause && this.shadowAutoPausedCueSignature === subtitleCueSignature(cue)) return;
      const time = this.subtitlePlaybackTime(this.video);
      if (time >= cue.end - 0.05 || time < cue.start - 0.3) {
        this.seekVideoTo(Math.max(0, cue.start));
        if (this.currentCue !== cue) {
          this.currentCue = cue;
          this.renderShadowPanel(true);
        }
      }
    }
    syncShadowAutoPause() {
      const settings = this.options.getSettings();
      if (!settings.subtitleShadowAutoPause || this.panelMode !== "shadow" || !this.video || this.video.paused || !this.currentCue) return;
      const cue = this.currentCue;
      const signature = subtitleCueSignature(cue);
      if (this.shadowAutoPausedCueSignature === signature) return;
      const time = this.subtitlePlaybackTime(this.video);
      if (time < cue.start - 0.05 || time < cue.end - 0.05) return;
      this.shadowAutoPausedCueSignature = signature;
      this.video.pause();
      this.clearShadowRecordingIfCueChanged(cue);
      this.renderShadowPanel(true);
      this.syncControls();
    }
    // Neighbours of a cue in the primary cue list (by identity, falling back to
    // matching start/end so a cloned currentCue still resolves its siblings).
    shadowCueNeighbors(cue) {
      if (!this.cues.length) return {};
      let index = this.cues.indexOf(cue);
      if (index < 0) index = this.cues.findIndex((item) => item.start === cue.start && item.end === cue.end);
      if (index < 0) return {};
      return { prev: this.cues[index - 1], next: this.cues[index + 1] };
    }
    gotoShadowNeighbor(target) {
      const direction = target.closest("[data-shadow-goto]")?.dataset.shadowGoto;
      const cue = this.currentCue;
      if (!cue) return;
      const neighbors = this.shadowCueNeighbors(cue);
      const goal = direction === "prev" ? neighbors.prev : neighbors.next;
      if (goal) this.seekToCueObject(goal, { exact: true });
    }
    async toggleShadowRecording() {
      if (this.shadowRecorder && this.shadowRecorder.state !== "inactive") {
        this.stopShadowRecording();
        return;
      }
      const cue = this.currentCue;
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        this.shadowRecordingUnavailable = true;
        this.renderShadowPanel(true);
        return;
      }
      try {
        this.clearShadowRecording();
        if (this.video && !this.video.paused) this.video.pause();
        const stream = await mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data && event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          const recordingSignature = this.shadowRecordingCueSignature;
          this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
          stream.getTracks().forEach((track) => track.stop());
          if (!this.shadowRecordingDiscard && chunks.length) {
            this.clearShadowRecording();
            this.shadowRecordingUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
            this.shadowRecordingCueSignature = recordingSignature;
          }
          if (!this.shadowRecordingDiscard && !chunks.length) this.clearShadowRecording();
          if (this.shadowRecordingDiscard) this.clearShadowRecording();
          this.shadowRecordingDiscard = false;
          this.shadowRecorder = void 0;
          this.renderShadowPanel(true);
        });
        this.shadowRecordingUnavailable = false;
        this.shadowRecorder = recorder;
        this.shadowRecordingCueSignature = cue ? subtitleCueSignature(cue) : "";
        this.shadowRecordingDiscard = false;
        recorder.start();
        this.scheduleShadowRecordingStop(cue);
        this.renderShadowPanel(true);
      } catch (error) {
        log.warn("Shadow self-recording unavailable", error);
        this.shadowRecorder = void 0;
        this.shadowRecordingUnavailable = true;
        this.renderShadowPanel(true);
      }
    }
    playShadowRecording() {
      if (!this.shadowRecordingUrl) return;
      try {
        if (this.video && !this.video.paused) this.video.pause();
        this.shadowPlaybackAudio?.pause();
        const audio = new Audio(this.shadowRecordingUrl);
        this.shadowPlaybackAudio = audio;
        audio.addEventListener("ended", () => {
          if (this.shadowPlaybackAudio === audio) this.shadowPlaybackAudio = void 0;
        }, { once: true });
        void audio.play().catch(() => void 0);
      } catch {
      }
    }
    stopShadowRecording(options = {}) {
      if (!this.shadowRecorder || this.shadowRecorder.state === "inactive") return;
      this.shadowRecordingDiscard = this.shadowRecordingDiscard || options.discard === true;
      this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
      try {
        this.shadowRecorder.stop();
      } catch {
        this.shadowRecorder = void 0;
      }
    }
    scheduleShadowRecordingStop(cue) {
      this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
      if (!cue) return;
      const durationMs = Math.max(1200, Math.min(15e3, Math.round((cue.end - cue.start) * 1e3) + 800));
      this.shadowRecordingStopTimer = window.setTimeout(() => this.stopShadowRecording(), durationMs);
    }
    clearShadowRecording() {
      this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
      if (this.shadowRecorder && this.shadowRecorder.state !== "inactive") this.stopShadowRecording({ discard: true });
      this.shadowPlaybackAudio?.pause();
      this.shadowPlaybackAudio = void 0;
      if (this.shadowRecordingUrl) {
        URL.revokeObjectURL(this.shadowRecordingUrl);
        this.shadowRecordingUrl = void 0;
      }
      this.shadowRecordingCueSignature = "";
    }
    resetShadowPracticeState() {
      this.shadowLoopEnabled = false;
      this.shadowLoopCue = void 0;
      this.shadowAutoPausedCueSignature = "";
      this.clearShadowRecording();
    }
    clearShadowRecordingIfCueChanged(cue) {
      if (!this.shadowRecordingCueSignature) return;
      const nextSignature = cue ? subtitleCueSignature(cue) : "";
      if (nextSignature === this.shadowRecordingCueSignature) return;
      this.clearShadowRecording();
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
        this.transcriptPanelSessionOpen = false;
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
        if (this.hasTranscriptSurface()) {
          this.renderTranscriptPanel(true);
        } else this.closeTranscriptPanel();
        return;
      }
      if (this.panelMode === "shadow") {
        if (this.hasTranscriptSurface()) this.renderShadowPanel(true);
        else this.closeTranscriptPanel();
        return;
      }
      if (this.panelMode === "mine") {
        if (this.hasTranscriptSurface()) this.renderBatchMiningPanel();
        else this.closeTranscriptPanel();
        return;
      }
      this.renderTrackPanel();
      this.positionTranscriptPanel({ realignAfterInset: true });
      this.syncPanelState();
    }
    shouldRestoreTranscriptPanel() {
      if (!this.hasTranscriptSurface()) return false;
      if (this.transcriptPanelSessionOpen) return true;
      if (!this.transcriptDefaultOpenApplied && this.options.getSettings().subtitleTranscriptVisible) {
        this.transcriptDefaultOpenApplied = true;
        return true;
      }
      return false;
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
      this.tracksVirtualScrollTop = 0;
      this.renderedTracksVirtualWindow = void 0;
      this.tracksVirtualRenderFrame = clearWindowAnimationFrame(this.tracksVirtualRenderFrame);
      this.showTranscriptPanelElement();
      if (persist) this.transcriptPanelSessionOpen = false;
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
      this.panelOptionsMenuOpen = false;
      this.clearDeferredTranscriptPanelRender();
      this.clearTranscriptVirtualRender();
      this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
      this.transcriptFollowState.clear();
      if (!options.autoPause) {
        this.pausePanelOpen = false;
        if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
      }
      this.hideTranscriptPanelElement({ immediate: options.immediate });
      if (persist) this.transcriptPanelSessionOpen = false;
      this.clearVideoInsetForTranscriptPanel();
      this.syncControls();
    }
    toggleSubtitleStylePanel() {
      const nextOpen = !this.subtitleStylePanelOpen;
      if (nextOpen) {
        if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
        if (this.isTranscriptPanelOpen()) this.closeTranscriptPanel({ persist: false, immediate: true });
      }
      this.subtitleStylePanelOpen = nextOpen;
      this.syncSubtitleStyleControls();
      this.showControlsTemporarily();
    }
    closeSubtitleStylePanel(options = {}) {
      if (!this.subtitleStylePanelOpen) return;
      this.subtitleStylePanelOpen = false;
      if (options.sync !== false) this.syncSubtitleStyleControls();
    }
    syncSubtitleStyleControls() {
      if (!this.root) return;
      const settings = this.options.getSettings();
      const open = this.subtitleStylePanelOpen && settings.subtitleControlsMode !== "hidden";
      this.root.classList.toggle("jpdb-subtitle-style-open", open);
      const button = this.root.querySelector('[data-action="style"]');
      if (button) {
        const label = uiText(settings.interfaceLanguage, "subtitleStyle");
        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-expanded", String(open));
      }
      const popover = this.root.querySelector("[data-subtitle-style-popover]");
      if (!popover) return;
      popover.hidden = !open;
      syncSubtitleStyleRangeControl(popover, "subtitleFontSize", settings.subtitleFontSize, "px");
      syncSubtitleStyleRangeControl(popover, "subtitleFontWeight", settings.subtitleFontWeight, "weight");
      syncSubtitleStyleRangeControl(popover, "subtitleBackgroundOpacity", settings.subtitleBackgroundOpacity, "");
      const fontSelect = popover.querySelector('[data-subtitle-style-setting="subtitleFontFamily"]');
      if (fontSelect && fontSelect.value !== settings.subtitleFontFamily) fontSelect.value = settings.subtitleFontFamily;
      const hoverPause = popover.querySelector('[data-subtitle-style-setting="subtitleHoverPause"]');
      if (hoverPause) hoverPause.checked = settings.subtitleHoverPause;
      const miningPause = popover.querySelector('[data-subtitle-style-setting="subtitleMiningPause"]');
      if (miningPause) miningPause.checked = settings.subtitleMiningPause;
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
      if (this.pausePanelDismissed || this.subtitleStylePanelOpen || this.isTranscriptPanelOpen()) return;
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
      const state = this.transcriptPanelRenderState();
      if (this.canRefreshTranscriptPanel(force, state)) return;
      const scroller = panel.querySelector(".jpdb-subtitle-list-scroll");
      if (scroller && this.patchTranscriptVirtualWindow(state, scroller)) return;
      this.lastTranscriptStructureSignature = state.structureSignature;
      this.lastTranscriptSignature = state.signature;
      this.renderedVirtualWindow = state.virtual ? { start: state.virtual.start, end: state.virtual.end, rowCount: state.totalRowCount ?? state.rows.length } : void 0;
      setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
      this.afterTranscriptPanelRender(state);
    }
    renderTranscriptPanelPreview() {
      const panel = this.renderableTranscriptPanel();
      if (!panel) return;
      const fullState = this.transcriptPanelRenderState();
      const state = this.transcriptPanelPreviewState(fullState);
      this.transcriptPreviewPlayerResizeDeferred = true;
      this.lastTranscriptSignature = "";
      setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
      this.afterTranscriptPanelRender(state, { deferPlayerResize: true });
    }
    renderShadowPanel(force = false) {
      const panel = this.renderableShadowPanel();
      if (!panel) return;
      const state = this.shadowPanelRenderState();
      if (!force && state.signature === this.lastShadowSignature) return;
      this.lastShadowSignature = state.signature;
      this.transcriptTextTargetsByParseKey.clear();
      setInnerHtml(panel, this.renderShadowPanelHtml(state));
      this.indexTranscriptTextTargets(panel);
      this.bindTranscriptResizeHandle();
      this.positionTranscriptPanel();
      this.syncPanelState();
      if (state.cue && state.parseKey) this.requestParsedShadowLineIfNeeded(state.cue, state.parseKey, state.signature, state.settings);
    }
    renderableShadowPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
      return this.panelMode === "shadow" ? this.transcriptPanel : null;
    }
    shadowPanelRenderState() {
      const settings = this.options.getSettings();
      const cue = this.currentCue;
      const secondary = cue ? findAlignedCue(this.secondaryCues, cue) ?? this.secondaryCue : void 0;
      const parseKey = cue?.text.trim() ? this.parseCacheKey(cue.text, settings) : "";
      return { settings, cue, secondary, parseKey, signature: this.shadowPanelSignature(cue, secondary, parseKey) };
    }
    shadowPanelSignature(cue, secondary, parseKey) {
      return [
        cue ? subtitleCueSignature(cue) : "",
        secondary ? subtitleCueSignature(secondary) : "",
        parseKey,
        this.shadowLoopEnabled,
        this.options.getSettings().subtitleShadowAutoPause,
        this.options.getSettings().subtitleNativeBlurred,
        this.options.getSettings().subtitleSecondaryVisible,
        this.shadowTextVisible,
        this.shadowRecorder && this.shadowRecorder.state !== "inactive" ? "rec" : "",
        this.shadowRecordingUrl ? "has-rec" : "",
        this.shadowRecordingUnavailable ? "no-mic" : "",
        this.selectedTrackId,
        this.secondaryTrackId
      ].join("|");
    }
    renderShadowPanelHtml(state) {
      const language = state.settings.interfaceLanguage;
      return `
            ${this.renderShadowPanelHead(state)}
            <div class="jpdb-subtitle-list-scroll jpdb-subtitle-shadow-scroll">
                ${this.renderShadowPanelBody(state)}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeTranscriptPanel"))}"></div>
        `;
    }
    renderShadowPanelHead(state) {
      const language = state.settings.interfaceLanguage;
      return renderDrawerHead({
        mode: "shadow",
        title: uiText(language, "subtitlesTitle"),
        meta: subtitleDrawerMetaText({
          mode: "lines",
          count: state.cue?.text.trim() ? 1 : 0,
          tracks: this.tracks,
          selectedTrackId: this.selectedTrackId,
          secondaryTrackId: this.secondaryTrackId,
          language
        }),
        metaTitle: subtitleDrawerMetaText({
          mode: "lines",
          count: state.cue?.text.trim() ? 1 : 0,
          tracks: this.tracks,
          selectedTrackId: this.selectedTrackId,
          secondaryTrackId: this.secondaryTrackId,
          language,
          compact: false
        }),
        canShowLines: this.hasTranscriptSurface(),
        options: this.panelOptionsState(state.settings.subtitlePausePanel, language)
      });
    }
    renderShadowPanelBody(state) {
      const cueText = state.cue?.text.trim();
      if (!state.cue || !cueText) return this.renderTranscriptWaitingState();
      return this.renderShadowCueCard(state.cue, cueText, state);
    }
    renderShadowCueCard(cue, cueText, state) {
      const language = state.settings.interfaceLanguage;
      const parsedLine = this.shadowParsedLine(cueText, state.parseKey, state.settings);
      const hiddenClass = this.shadowTextVisible ? "" : " jpdb-subtitle-shadow-line-hidden";
      const secondary = this.renderShadowSecondaryLine(state);
      const neighbors = this.shadowCueNeighbors(cue);
      return `
            <div class="jpdb-subtitle-shadow-card">
                ${this.renderShadowContextLine(neighbors.prev, "prev", language)}
                <div class="jpdb-subtitle-shadow-current">
                    <span class="jpdb-subtitle-shadow-time">${formatSubtitleTime(cue.start)}-${formatSubtitleTime(cue.end)}</span>
                    <strong class="jpdb-subtitle-shadow-line jpdb-subtitle-row-text${hiddenClass}" lang="ja" data-transcript-text data-parse-key="${escapeHtml(state.parseKey)}"${parsedLine.parsedKeyAttribute}${parsedLine.provisionalAttribute}>${parsedLine.html}</strong>
                    ${secondary}
                </div>
                ${this.renderShadowContextLine(neighbors.next, "next", language)}
                <div class="jpdb-subtitle-shadow-actions">
                    ${this.renderShadowActions(language)}
                </div>
            </div>
        `;
    }
    // Surrounding lines for context (kotu-style): tappable to jump the loop/focus
    // onto them. Rendered as plain (escaped) text — the parsed/highlighted treatment
    // stays reserved for the focused current line.
    renderShadowContextLine(cue, direction, language) {
      const text = cue?.text.trim();
      if (!cue || !text) return "";
      const japanese = resolveUiLanguage(language) === "ja";
      const label = direction === "prev" ? japanese ? "前の行へ" : "Previous line" : japanese ? "次の行へ" : "Next line";
      return `<button type="button" class="jpdb-subtitle-shadow-context jpdb-subtitle-shadow-context-${direction}" data-action="shadow-goto" data-shadow-goto="${direction}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" lang="ja">${escapeWithBreaks(text)}</button>`;
    }
    shadowParsedLine(cueText, parseKey, settings) {
      const parsed = this.cachedParsedCueHtml(parseKey, settings) ?? this.htmlCache.provisionalParsedHtmlCache.get(parseKey);
      const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parseKey)}"` : "";
      const provisionalAttribute = parsed && !this.htmlCache.parsedHtmlCache.has(parseKey) ? ' data-parsed-provisional="true"' : "";
      return { html: parsed ?? escapeWithBreaks(cueText), parsedKeyAttribute, provisionalAttribute };
    }
    renderShadowSecondaryLine(state) {
      if (!state.settings.subtitleSecondaryVisible) return "";
      const text = state.secondary?.text.trim();
      if (!text) return "";
      const blurClass = state.settings.subtitleNativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
      const label = uiText(state.settings.interfaceLanguage, "toggleNativeSubtitleBlur");
      return `<button class="jpdb-subtitle-shadow-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeWithBreaks(text)}</button>`;
    }
    renderShadowActions(language) {
      const recording = Boolean(this.shadowRecorder && this.shadowRecorder.state !== "inactive");
      const loopAction = this.shadowLoopEnabled ? "stop" : "loop";
      const toggleIcon = this.shadowTextVisible ? "eye-off" : "eye";
      const recordLabel = this.shadowActionLabel(language, recording ? "stop-record" : "record");
      return `
            ${this.renderShadowAction("shadow-replay", this.shadowActionLabel(language, "replay"), "repeat", false)}
            ${this.renderShadowAction("shadow-loop", this.shadowActionLabel(language, loopAction), "repeat", this.shadowLoopEnabled)}
            ${this.renderShadowAction("shadow-auto-pause", this.shadowActionLabel(language, "auto-pause"), "pause", this.options.getSettings().subtitleShadowAutoPause)}
            ${this.renderShadowAction("shadow-toggle-text", uiText(language, this.shadowTextVisible ? "hide" : "show"), toggleIcon, !this.shadowTextVisible)}
            ${this.renderShadowAction("shadow-record", recordLabel, recording ? "stop" : "mic", recording)}
            ${this.shadowRecordingUrl ? this.renderShadowAction("shadow-play-recording", this.shadowActionLabel(language, "play-recording"), "play", false) : ""}
            ${this.shadowRecordingUnavailable && !recording ? `<span class="jpdb-subtitle-shadow-note">${escapeHtml(this.shadowActionLabel(language, "record-unavailable"))}</span>` : ""}
        `;
    }
    renderShadowAction(action, label, icon, pressed) {
      return `<button class="jpdb-subtitle-shadow-action" type="button" data-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${pressed}">${subtitleIcon(icon)}<span>${escapeHtml(label)}</span></button>`;
    }
    shadowActionLabel(language, action) {
      const japanese = resolveUiLanguage(language) === "ja";
      switch (action) {
        case "replay":
          return japanese ? "再生" : "Replay";
        case "loop":
          return japanese ? "ループ" : "Loop";
        case "stop":
          return japanese ? "停止" : "Stop";
        case "auto-pause":
          return japanese ? "自動停止" : "Auto pause";
        case "record":
          return japanese ? "録音" : "Record";
        case "stop-record":
          return japanese ? "録音停止" : "Stop";
        case "play-recording":
          return japanese ? "録音を再生" : "Play yours";
        case "record-unavailable":
          return japanese ? "マイクを使用できません" : "Mic unavailable";
      }
    }
    requestParsedShadowLineIfNeeded(cue, key, signature, settings) {
      if (!this.shouldParseSubtitles(settings) || this.cachedParsedCueHtml(key, settings) !== void 0) {
        const target = this.transcriptPanel ? this.transcriptTextTargetsForParseKey(this.transcriptPanel, key)[0] : void 0;
        if (target && this.htmlCache.parsedHtmlCache.has(key)) this.notifyParsedTokensForKey(key, true, [target]);
        return;
      }
      void this.parseCueHtml(cue.text, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true }).then((html) => {
        if (this.panelMode !== "shadow" || signature !== this.lastShadowSignature) return;
        this.updateTranscriptRowsForParseKey(key, html, { force: true });
      }).catch(() => void 0);
    }
    renderBatchMiningPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== "mine") return;
      this.clearDeferredTranscriptPanelRender();
      this.transcriptTextTargetsByParseKey.clear();
      setInnerHtml(this.transcriptPanel, renderSubtitleBatchMiningPanel(this.batchMiningPanelRenderState()));
      this.bindTranscriptResizeHandle();
      this.positionTranscriptPanel();
      this.syncPanelState();
    }
    batchMiningPanelRenderState() {
      const settings = this.options.getSettings();
      const rows = this.batchMiningRows.length ? this.batchMiningRows : this.currentBatchMiningRows();
      const candidates = this.batchMiningCandidates.map((candidate) => ({
        ...candidate,
        selected: this.batchMiningSelectedKeys.has(candidate.key)
      }));
      return {
        status: this.batchMiningStatus,
        candidates,
        selectedKeys: this.batchMiningSelectedKeys,
        summary: subtitleBatchMiningSummary(rows, candidates),
        reviewGrades: this.batchMiningReviewGrades(settings),
        errorMessage: this.batchMiningError,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        pausePanelEnabled: settings.subtitlePausePanel,
        placement: this.effectiveTranscriptPlacement,
        optionsMenuOpen: this.panelOptionsMenuOpen,
        language: settings.interfaceLanguage
      };
    }
    batchMiningReviewGrades(settings) {
      if (!this.canReviewBatchMiningCandidates(settings)) return [];
      return settings.twoButtonReviews ? [
        { grade: "fail", label: uiText(settings.interfaceLanguage, "gradeFailLabel") },
        { grade: "pass", label: uiText(settings.interfaceLanguage, "gradePassLabel") }
      ] : [
        { grade: "nothing", label: uiText(settings.interfaceLanguage, "gradeNothingLabel") },
        { grade: "something", label: uiText(settings.interfaceLanguage, "gradeSomethingLabel") },
        { grade: "hard", label: uiText(settings.interfaceLanguage, "gradeHardLabel") },
        { grade: "okay", label: uiText(settings.interfaceLanguage, "gradeOkayLabel") },
        { grade: "easy", label: uiText(settings.interfaceLanguage, "gradeEasyLabel") }
      ];
    }
    canReviewBatchMiningCandidates(settings) {
      return settings.enableReviews && (settings.yomuLocalSrsEnabled || settings.bunproMiningEnabled || settings.jpdbMiningEnabled && this.hasAuthoritativeParseTier(settings));
    }
    currentBatchMiningRows() {
      const settings = this.options.getSettings();
      return this.transcriptRows().map((row, rowIndex) => {
        const key = this.parseCacheKey(row.cue.text, settings);
        return {
          rowIndex,
          cueIndex: row.cueIndex,
          start: row.cue.start,
          end: row.cue.end,
          text: row.cue.text,
          tokens: this.htmlCache.parsedTokenCache.get(key) ?? []
        };
      });
    }
    async scanBatchMiningTranscript() {
      this.forceNativeCueRefresh();
      const rows = this.transcriptRows();
      const settings = this.options.getSettings();
      if (!rows.length || !canParseSubtitleTranscriptRows(settings)) {
        this.batchMiningStatus = "failed";
        this.batchMiningError = subtitleText(settings.interfaceLanguage, "bmNoTranscript");
        this.renderBatchMiningPanel();
        return;
      }
      const serial = ++this.batchMiningSerial;
      this.batchMiningStatus = "scanning";
      this.batchMiningError = "";
      this.batchMiningCandidates = [];
      this.batchMiningSelectedKeys.clear();
      this.batchMiningRows = rows.map((row, rowIndex) => ({
        rowIndex,
        cueIndex: row.cueIndex,
        start: row.cue.start,
        end: row.cue.end,
        text: row.cue.text,
        tokens: []
      }));
      this.renderBatchMiningPanel();
      try {
        for (let start = 0; start < rows.length; start += BATCH_MINING_PARSE_BATCH) {
          if (serial !== this.batchMiningSerial) return;
          const chunk = rows.slice(start, start + BATCH_MINING_PARSE_BATCH);
          await this.parseCueHtmlBatch(chunk.map((row) => row.cue.text), settings, {
            allowProvisional: false,
            enrichBeforeRender: true
          });
          this.captureBatchMiningParsedRows(rows, start, chunk.length, settings);
          this.renderBatchMiningPanel();
          await waitForBackgroundTranscriptParseTurn(0);
        }
        if (serial !== this.batchMiningSerial) return;
        this.batchMiningCandidates = buildSubtitleBatchMiningCandidates(this.batchMiningRows);
        this.batchMiningSelectedKeys = new Set(this.batchMiningCandidates.filter((candidate) => candidate.selected).map((candidate) => candidate.key));
        this.batchMiningStatus = "ready";
        this.renderBatchMiningPanel();
      } catch (error) {
        if (serial !== this.batchMiningSerial) return;
        this.batchMiningStatus = "failed";
        this.batchMiningError = error instanceof Error ? error.message : subtitleText(settings.interfaceLanguage, "bmFailed");
        this.renderBatchMiningPanel();
      }
    }
    captureBatchMiningParsedRows(rows, startIndex, count, settings) {
      for (let offset = 0; offset < count; offset += 1) {
        const row = rows[startIndex + offset];
        const target = this.batchMiningRows[startIndex + offset];
        if (!row || !target) continue;
        const key = this.parseCacheKey(row.cue.text, settings);
        target.tokens = this.htmlCache.parsedTokenCache.get(key) ?? [];
      }
    }
    toggleBatchMiningCandidate(target) {
      const key = target.closest("[data-batch-candidate-key]")?.dataset.batchCandidateKey;
      if (!key) return;
      if (this.batchMiningSelectedKeys.has(key)) this.batchMiningSelectedKeys.delete(key);
      else this.batchMiningSelectedKeys.add(key);
      this.renderBatchMiningPanel();
    }
    async openBatchMiningCandidate(target) {
      const candidate = this.batchMiningCandidateForTarget(target);
      if (!candidate || !this.options.showBatchMiningCard) return;
      await this.options.showBatchMiningCard(candidate);
    }
    async addSelectedBatchMiningCandidates() {
      const language = this.options.getSettings().interfaceLanguage;
      const candidates = this.selectedBatchMiningCandidates();
      if (!candidates.length || !this.options.mineBatchMiningCandidates) {
        this.options.toast?.(candidates.length ? uiText(language, "batchMiningNoDestination") : subtitleText(language, "bmNoSelection"));
        return;
      }
      try {
        const count = await this.options.mineBatchMiningCandidates(candidates);
        for (const candidate of candidates) this.batchMiningSelectedKeys.delete(candidate.key);
        this.options.toast?.(formatSubtitleText(language, "bmAdded", { count }));
        this.renderBatchMiningPanel();
      } catch (error) {
        this.options.toast?.(error instanceof Error ? error.message : subtitleText(language, "bmAddFailed"));
      }
    }
    async copySelectedBatchMiningCandidates() {
      const language = this.options.getSettings().interfaceLanguage;
      const candidates = this.selectedBatchMiningCandidates();
      if (!candidates.length) {
        this.options.toast?.(subtitleText(language, "bmNoSelection"));
        return;
      }
      await copyText(subtitleBatchMiningTsv(candidates));
      this.options.toast?.(formatSubtitleText(language, "bmCopied", { count: candidates.length }));
    }
    async gradeBatchMiningCandidate(target) {
      const grade = target.closest("[data-grade]")?.dataset.grade;
      const candidate = this.batchMiningCandidateForTarget(target);
      if (!grade || !candidate) return;
      await this.gradeBatchMiningCandidates([candidate], grade);
    }
    async gradeSelectedBatchMiningCandidates(target) {
      const grade = target.closest("[data-grade]")?.dataset.grade;
      if (!grade) return;
      await this.gradeBatchMiningCandidates(this.selectedBatchMiningCandidates(), grade);
    }
    async gradeBatchMiningCandidates(candidates, grade) {
      const language = this.options.getSettings().interfaceLanguage;
      if (!candidates.length || !this.options.gradeBatchMiningCandidates) {
        this.options.toast?.(candidates.length ? uiText(language, "batchMiningNoDestination") : subtitleText(language, "bmNoSelection"));
        return;
      }
      try {
        const count = await this.options.gradeBatchMiningCandidates(candidates, grade);
        for (const candidate of candidates) {
          candidate.state = primaryCardState(candidate.card.cardState);
          this.batchMiningSelectedKeys.delete(candidate.key);
        }
        this.options.toast?.(formatSubtitleText(language, "bmGraded", { count }));
        this.renderBatchMiningPanel();
      } catch (error) {
        this.options.toast?.(error instanceof Error ? error.message : subtitleText(language, "bmGradeFailed"));
      }
    }
    selectAllBatchMiningCandidates() {
      this.batchMiningSelectedKeys = new Set(this.batchMiningCandidates.map((candidate) => candidate.key));
      this.renderBatchMiningPanel();
    }
    clearBatchMiningSelection() {
      this.batchMiningSelectedKeys.clear();
      this.renderBatchMiningPanel();
    }
    selectedBatchMiningCandidates() {
      return this.batchMiningCandidates.filter((candidate) => this.batchMiningSelectedKeys.has(candidate.key));
    }
    batchMiningCandidateForTarget(target) {
      const key = target.closest("[data-batch-candidate-key]")?.dataset.batchCandidateKey;
      return key ? this.batchMiningCandidates.find((candidate) => candidate.key === key) : void 0;
    }
    transcriptPanelPreviewState(state) {
      const rowCount = state.rows.length;
      if (!rowCount) return { ...state, signature: `preview:${state.signature}`, totalRowCount: 0 };
      const activeIndex = state.currentRowIndex >= 0 ? state.currentRowIndex : 0;
      const clampedActive = Math.min(Math.max(activeIndex, 0), rowCount - 1);
      const previewStart = Math.max(0, Math.min(clampedActive - 1, rowCount - 3));
      const previewEnd = Math.min(rowCount, previewStart + 3);
      return {
        rows: state.rows.slice(previewStart, previewEnd),
        warmupRows: state.warmupRows,
        currentRowIndex: state.currentRowIndex,
        structureSignature: `preview:${state.structureSignature}`,
        baseSignature: `preview:${state.baseSignature}`,
        signature: `preview:${state.signature}:${previewStart}`,
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
    canRefreshTranscriptPanel(force, state) {
      if (force) return false;
      return this.refreshExistingTranscriptPanel(state);
    }
    transcriptPanelRenderState() {
      const rows = this.transcriptRows();
      const currentCueIndex = this.activeTranscriptIndex();
      const currentRowIndex = this.activeTranscriptRowIndex(rows, currentCueIndex);
      const settings = this.options.getSettings();
      const virtual = this.transcriptVirtualWindow(rows.length, currentRowIndex);
      const renderedRows = virtual ? rows.slice(virtual.start, virtual.end) : rows;
      const structureSignature = [
        this.selectedTrackId,
        this.tracks.find((track) => track.id === this.selectedTrackId)?.loadingState ?? "",
        !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : "",
        this.parseCacheKey("", settings)
      ].join(":");
      const baseSignature = [structureSignature, rows.length].join(":");
      const signature = [baseSignature, virtual ? `v:${virtual.start}:${virtual.end}` : ""].join(":");
      return {
        rows: renderedRows,
        warmupRows: virtual ? renderedRows : void 0,
        currentRowIndex,
        structureSignature,
        baseSignature,
        signature,
        rowIndexOffset: virtual?.start,
        totalRowCount: virtual ? rows.length : void 0,
        virtual
      };
    }
    transcriptVirtualWindow(rowCount, currentRowIndex) {
      if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return void 0;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      const rowEstimate = this.transcriptRowEstimatePx;
      const clientHeight = Math.max(
        scroller?.clientHeight ?? 0,
        Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
        rowEstimate * 6
      );
      const scrollTop = Math.max(0, scroller?.scrollTop ?? this.transcriptVirtualScrollTop);
      const visibleRows = Math.max(
        TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
        Math.ceil(clientHeight / rowEstimate) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2
      );
      const { start, end } = this.resolveVirtualWindowBounds(rowCount, currentRowIndex, scrollTop, visibleRows);
      return {
        start,
        end,
        scrollTop,
        topSpacer: start * rowEstimate,
        bottomSpacer: Math.max(0, (rowCount - end) * rowEstimate)
      };
    }
    // While auto-following, keep the committed window as long as the active row
    // stays comfortably inside it: consecutive line advances then reuse the same
    // window so the panel signature is unchanged and only the cheap active-line
    // class-swap runs — no full list re-render recreating (and flickering) the
    // highlighted row. The window only shifts when the active row nears an edge,
    // or on a user scroll (auto-follow paused), where it tracks scrollTop as before.
    resolveVirtualWindowBounds(rowCount, currentRowIndex, scrollTop, visibleRows) {
      const prev = this.renderedVirtualWindow;
      const autoFollowing = this.options.getSettings().subtitleTranscriptAutoScroll && !this.isTranscriptAutoScrollPaused();
      if (autoFollowing && prev && prev.rowCount === rowCount && prev.end - prev.start === visibleRows && currentRowIndex >= prev.start + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS && currentRowIndex < prev.end - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS) {
        return { start: prev.start, end: prev.end };
      }
      const preferredStart = this.transcriptVirtualStartIndex(scrollTop, currentRowIndex, visibleRows);
      const start = Math.max(0, Math.min(preferredStart, Math.max(0, rowCount - visibleRows)));
      return { start, end: Math.min(rowCount, start + visibleRows) };
    }
    transcriptVirtualStartIndex(scrollTop, currentRowIndex, visibleRows) {
      if (this.shouldCenterActiveTranscriptRow(scrollTop, currentRowIndex, visibleRows)) {
        return currentRowIndex - Math.floor(visibleRows / 2);
      }
      return Math.floor(scrollTop / this.transcriptRowEstimatePx) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
    }
    shouldCenterActiveTranscriptRow(scrollTop, currentRowIndex, visibleRows) {
      if (currentRowIndex < 0) return false;
      if (!this.options.getSettings().subtitleTranscriptAutoScroll) return false;
      if (this.isTranscriptAutoScrollPaused()) return false;
      const firstRendered = Math.floor(scrollTop / this.transcriptRowEstimatePx) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
      const lastRendered = firstRendered + visibleRows - 1;
      return scrollTop <= 1 || currentRowIndex < firstRendered || currentRowIndex > lastRendered;
    }
    refreshExistingTranscriptPanel(state) {
      if (this.lastTranscriptSignature !== state.signature) return false;
      this.updateTranscriptActiveLine(state.currentRowIndex);
      const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
      this.scheduleTranscriptHydration(hydrationIndex);
      this.scheduleTranscriptCacheWarmup(state.rows, hydrationIndex);
      return true;
    }
    renderTranscriptPanelHtml(state) {
      const settings = this.options.getSettings();
      const language = settings.interfaceLanguage;
      const rowCount = state.totalRowCount ?? state.rows.length;
      const rowIndexOffset = state.rowIndexOffset ?? 0;
      const transcriptRows = this.transcriptRows();
      return `
            ${renderDrawerHead({
        mode: "lines",
        title: uiText(language, "subtitlesTitle"),
        meta: subtitleDrawerMetaText({
          mode: "lines",
          count: rowCount,
          tracks: this.tracks,
          selectedTrackId: this.selectedTrackId,
          secondaryTrackId: this.secondaryTrackId,
          language
        }),
        metaTitle: subtitleDrawerMetaText({
          mode: "lines",
          count: rowCount,
          tracks: this.tracks,
          selectedTrackId: this.selectedTrackId,
          secondaryTrackId: this.secondaryTrackId,
          language,
          compact: false
        }),
        canShowLines: this.hasTranscriptSurface(),
        options: this.panelOptionsState(settings.subtitlePausePanel, language),
        extraActions: `<button class="jpdb-subtitle-jump-current" type="button" data-action="jump-current" title="${escapeHtml(uiText(language, "jumpToCurrentSubtitle"))}" aria-label="${escapeHtml(uiText(language, "jumpToCurrentSubtitle"))}">${subtitleIcon("locate")}</button>`
      })}
            <div class="jpdb-subtitle-list-scroll" data-total-rows="${rowCount}"${state.virtual ? ' data-virtualized="true"' : ""}>
                ${state.virtual ? this.renderTranscriptVirtualSpacer(state.virtual.topSpacer) : ""}
                ${state.rows.length ? state.rows.map((row, index) => this.renderTranscriptRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows)).join("") : this.renderTranscriptWaitingState()}
                ${state.virtual ? this.renderTranscriptVirtualSpacer(state.virtual.bottomSpacer) : ""}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, "resizeTranscriptPanel"))}"></div>
        `;
    }
    renderTranscriptVirtualSpacer(height) {
      return height > 0 ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>` : "";
    }
    afterTranscriptPanelRender(state, options = {}) {
      this.indexTranscriptTextTargets();
      this.calibrateTranscriptRowEstimate();
      this.bindTranscriptScroller();
      this.bindTranscriptResizeHandle();
      this.positionTranscriptPanel({ resizeEventMode: options.deferPlayerResize ? "none" : "immediate" });
      this.restoreTranscriptVirtualScroll(state);
      this.scrollTranscriptToActive();
      const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
      this.scheduleTranscriptHydration(hydrationIndex);
      this.scheduleTranscriptCacheWarmup(options.warmupRows ?? state.warmupRows ?? state.rows, hydrationIndex);
      this.syncPanelState();
    }
    transcriptHydrationPreferredIndex(state) {
      return state.virtual?.start ?? state.currentRowIndex;
    }
    restoreTranscriptVirtualScroll(state) {
      if (!state.virtual) return;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller) return;
      const scrollTop = Math.max(0, state.virtual.scrollTop);
      if (Math.abs(scroller.scrollTop - scrollTop) > 1) {
        scroller.scrollTop = scrollTop;
      }
      this.transcriptVirtualScrollTop = scrollTop;
    }
    // Blend the measured mean height of the rows on screen into the estimate.
    // Damped so a window of unusually tall/short rows nudges rather than jerks
    // the geometry; clamped so a degenerate measurement can't wreck the map.
    calibrateTranscriptRowEstimate() {
      if (this.isTranscriptAutoScrollPaused()) return;
      const rows = Array.from(this.transcriptPanel?.querySelectorAll(".jpdb-subtitle-list-row") ?? []);
      if (rows.length < 4) return;
      const total = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
      const mean = total / rows.length;
      if (!Number.isFinite(mean) || mean <= 0) return;
      const blended = this.transcriptRowEstimatePx * 0.4 + mean * 0.6;
      this.transcriptRowEstimatePx = Math.min(240, Math.max(40, blended));
    }
    renderTranscriptRow(row, index, currentIndex, rows = this.transcriptRows()) {
      const cue = row.cue;
      const settings = this.options.getSettings();
      const parsedKey = this.transcriptRowParseKey(row, index, rows, settings);
      const parsed = this.htmlCache.parsedHtmlCache.get(parsedKey) ?? this.htmlCache.provisionalParsedHtmlCache.get(parsedKey);
      const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parsedKey)}"` : "";
      const provisionalAttribute = parsed && !this.htmlCache.parsedHtmlCache.has(parsedKey) ? ' data-parsed-provisional="true"' : "";
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
    transcriptRowParseKey(row, rowIndex, rows, settings) {
      if (!this.shouldParseTranscriptRowWithContext(rows, rowIndex)) return this.parseCacheKey(row.cue.text, settings);
      const context = this.transcriptContextWindow(rows, rowIndex);
      return this.parseCacheKey(`transcript-context:${context.rowStart}:${context.rowEnd}:${context.text}`, settings);
    }
    shouldParseTranscriptRowWithContext(rows, rowIndex) {
      const text = rows[rowIndex]?.cue.text;
      if (!text?.trim()) return false;
      const previous = rows[rowIndex - 1]?.cue.text;
      const next = rows[rowIndex + 1]?.cue.text;
      return isTranscriptContextJoinChar(lastTextChar(previous ?? "")) && isTranscriptContextJoinChar(firstTextChar(text)) || isTranscriptContextJoinChar(lastTextChar(text)) && isTranscriptContextJoinChar(firstTextChar(next ?? ""));
    }
    transcriptContextWindow(rows, rowIndex) {
      const startIndex = Math.max(0, rowIndex - 1);
      const endIndex = Math.min(rows.length, rowIndex + 2);
      let text = "";
      let rowStart = 0;
      for (let index = startIndex; index < endIndex; index += 1) {
        if (index === rowIndex) rowStart = text.length;
        text += rows[index]?.cue.text ?? "";
      }
      return {
        text,
        rowStart,
        rowEnd: rowStart + (rows[rowIndex]?.cue.text.length ?? 0)
      };
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
      const activeRows = Array.from(this.transcriptPanel.querySelectorAll(".jpdb-subtitle-list-row.active"));
      const active = this.transcriptPanel.querySelector(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
      if (active && activeRows.length === 1 && activeRows[0] === active) return;
      const previousIndex = activeRows.length === 1 ? Number(activeRows[0].dataset.rowIndex) : void 0;
      activeRows.forEach((row) => {
        if (row !== active) row.classList.remove("active");
      });
      if (active) active.classList.add("active");
      this.scrollTranscriptToActive({ behavior: this.transcriptActiveLineScrollBehavior(previousIndex, currentIndex) });
    }
    // Only a small, nearby move between two already-mounted rows -- e.g. the
    // ordinary line-by-line advance during playback -- reads well as a smooth
    // glide. A default/full render, an explicit jump, or a large seek should
    // land instantly: animating across a big distance (or one the viewer didn't
    // themselves request) just reads as sluggish, not helpful.
    transcriptActiveLineScrollBehavior(previousIndex, currentIndex) {
      if (previousIndex === void 0 || !Number.isFinite(previousIndex) || currentIndex < 0) return "auto";
      if (this.prefersReducedMotion()) return "auto";
      const delta = Math.abs(currentIndex - previousIndex);
      if (delta === 0 || delta > TRANSCRIPT_SMOOTH_FOLLOW_MAX_ROWS) return "auto";
      return "smooth";
    }
    prefersReducedMotion() {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    }
    scrollTranscriptToActive(options = {}) {
      if (!options.force && !this.options.getSettings().subtitleTranscriptAutoScroll || !this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
      if (!options.force && this.isTranscriptAutoScrollPaused()) return;
      const behavior = options.behavior ?? "auto";
      const perform = () => {
        this.transcriptScrollFrame = void 0;
        if (this.destroyed) return;
        const active = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-row.active");
        if (!active) return;
        active.scrollIntoView?.({ block: "center", inline: "nearest", behavior });
      };
      if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
      if (options.sync) {
        this.transcriptScrollFrame = void 0;
        perform();
        return;
      }
      this.transcriptScrollFrame = requestAnimationFrame(perform);
    }
    noteTranscriptScroll() {
      if (!this.options.getSettings().subtitleTranscriptAutoScroll) return;
      if (!this.transcriptFollowState.noteScroll()) return;
      this.syncTranscriptAutoScrollPausedClass();
      this.scheduleTranscriptAutoScrollResume();
    }
    noteTranscriptScrollIntent() {
      if (!this.options.getSettings().subtitleTranscriptAutoScroll) return;
      this.transcriptFollowState.armUserScroll();
    }
    jumpToCurrentTranscriptRow() {
      this.clearTranscriptManualScrollPause();
      this.clearTranscriptVirtualRender();
      this.renderTranscriptPanel(true);
      this.scrollTranscriptToActive({ force: true });
    }
    clearTranscriptManualScrollPause() {
      this.transcriptFollowState.clear();
      this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
      this.syncTranscriptAutoScrollPausedClass();
    }
    scheduleTranscriptAutoScrollResume() {
      this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
      const remaining = this.transcriptFollowState.remainingPauseMs(this.transcriptAutoScrollResumeMs());
      this.transcriptAutoScrollResumeTimer = window.setTimeout(() => {
        this.transcriptAutoScrollResumeTimer = void 0;
        this.syncTranscriptAutoScrollPausedClass();
        this.scrollTranscriptToActive();
      }, remaining + 20);
    }
    syncTranscriptAutoScrollPausedClass() {
      this.transcriptPanel?.classList.toggle("jpdb-subtitle-auto-scroll-paused", this.isTranscriptAutoScrollPaused());
    }
    isTranscriptAutoScrollPaused() {
      return Boolean(this.options.getSettings().subtitleTranscriptAutoScroll && this.transcriptFollowState.isPaused(this.transcriptAutoScrollResumeMs()));
    }
    transcriptAutoScrollResumeMs() {
      const seconds = this.options.getSettings().subtitleTranscriptAutoScrollResumeSeconds;
      const resumeSeconds = Number.isFinite(seconds) ? Math.max(1, seconds) : TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS;
      return (resumeSeconds === TRANSCRIPT_AUTO_SCROLL_RESUME_LEGACY_DEFAULT_SECONDS ? TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS : resumeSeconds) * 1e3;
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
      const armUserScroll = () => this.noteTranscriptScrollIntent();
      scroller.addEventListener("mousedown", armUserScroll, { passive: true });
      scroller.addEventListener("touchmove", armUserScroll, { passive: true });
      scroller.addEventListener("pointermove", (event) => {
        if (event.buttons || event.pointerType === "touch") this.noteTranscriptScrollIntent();
      }, { passive: true });
      scroller.addEventListener("wheel", armUserScroll, { passive: true });
      scroller.addEventListener("keydown", (event) => {
        if (isTranscriptScrollIntentKey(event)) this.noteTranscriptScrollIntent();
      });
    }
    scheduleTranscriptVirtualRender(scroller) {
      if (!this.isTranscriptVirtualScroller(scroller)) return;
      this.transcriptVirtualScrollTop = scroller.scrollTop;
      if (this.transcriptVirtualRenderFrame) return;
      this.transcriptVirtualRenderFrame = requestAnimationFrame(() => {
        this.transcriptVirtualRenderFrame = void 0;
        if (this.destroyed || this.transcriptResizeActive || !this.isTranscriptPanelOpen() || this.panelMode !== "lines") return;
        const state = this.transcriptPanelRenderState();
        if (!state.virtual || state.signature === this.lastTranscriptSignature) return;
        if (this.patchTranscriptVirtualWindow(state, scroller)) return;
        this.renderTranscriptPanel(true);
      });
    }
    isTranscriptVirtualScroller(scroller) {
      return scroller.dataset.virtualized === "true";
    }
    // A scroll-driven virtual-window shift, or an append-only cue-list growth,
    // only needs the rows inside the scroller swapped; the scroller element
    // itself (and everything else in the panel) is unchanged. Patching its
    // children in place -- instead of routing through renderTranscriptPanel's
    // full setInnerHtml(panel, ...) -- keeps the scroller node identity stable,
    // so a tablet's in-flight native touch scroll gesture (bound to that node)
    // survives the update instead of stopping dead, and growth never paints a
    // spacer-only, whitespace-band frame while the new rows mount.
    // Only safe when the structure hasn't changed and the row count is equal
    // or grew (append-only); a shrink or a structure change falls back to a
    // full render.
    patchTranscriptVirtualWindow(state, scroller) {
      if (!state.virtual) return false;
      if (!this.isTranscriptVirtualScroller(scroller)) return false;
      if (state.structureSignature !== this.lastTranscriptStructureSignature) return false;
      const previousRowCount = this.renderedVirtualWindow?.rowCount;
      const rowCount = state.totalRowCount ?? state.rows.length;
      if (previousRowCount === void 0 || rowCount < previousRowCount) return false;
      const rowIndexOffset = state.rowIndexOffset ?? 0;
      const transcriptRows = this.transcriptRows();
      setInnerHtml(scroller, `
            ${this.renderTranscriptVirtualSpacer(state.virtual.topSpacer)}
            ${state.rows.length ? state.rows.map((row, index) => this.renderTranscriptRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows)).join("") : this.renderTranscriptWaitingState()}
            ${this.renderTranscriptVirtualSpacer(state.virtual.bottomSpacer)}
        `);
      scroller.dataset.totalRows = String(rowCount);
      this.lastTranscriptStructureSignature = state.structureSignature;
      this.lastTranscriptSignature = state.signature;
      this.renderedVirtualWindow = { start: state.virtual.start, end: state.virtual.end, rowCount };
      this.transcriptVirtualScrollTop = state.virtual.scrollTop;
      this.indexTranscriptTextTargets();
      this.updateTranscriptDrawerMeta(rowCount);
      this.restoreTranscriptVirtualScroll(state);
      if (this.options.getSettings().subtitleTranscriptAutoScroll && !this.isTranscriptAutoScrollPaused()) {
        this.scrollTranscriptToActive({ behavior: "auto", sync: true });
      }
      const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
      this.scheduleTranscriptHydration(hydrationIndex);
      this.scheduleTranscriptCacheWarmup(state.warmupRows ?? state.rows, hydrationIndex);
      this.syncPanelState();
      return true;
    }
    updateTranscriptDrawerMeta(rowCount) {
      const metaEl = this.transcriptPanel?.querySelector(".jpdb-subtitle-drawer-meta");
      if (!metaEl) return;
      const language = this.options.getSettings().interfaceLanguage;
      const metaArgs = {
        mode: "lines",
        count: rowCount,
        tracks: this.tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        language
      };
      const meta = subtitleDrawerMetaText(metaArgs);
      const metaTitle = subtitleDrawerMetaText({ ...metaArgs, compact: false });
      metaEl.textContent = meta;
      metaEl.title = metaTitle;
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
      const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : void 0;
      try {
        handle?.setPointerCapture?.(event.pointerId);
      } catch {
      }
      let resizeFrame;
      let finished = false;
      let lastClientX = startX;
      let lastClientY = startY;
      const onMove = (moveEvent) => {
        lastClientX = moveEvent.clientX;
        lastClientY = moveEvent.clientY;
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
      const finish = (mode, clientX = lastClientX, clientY = lastClientY) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("mouseup", onMouseUp);
        handle?.removeEventListener("lostpointercapture", onLostPointerCapture);
        if (resizeFrame !== void 0) {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = void 0;
        }
        try {
          if (handle?.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        } catch {
        }
        if (mode === "cancel") {
          Object.assign(this.transcriptPanelSize, originalSize);
          this.positionTranscriptPanel({ skipInset: true, skipControlSync: true, skipResizeHandle: true });
          this.finishTranscriptResize();
          this.scheduleAlignToVideo();
          return;
        }
        const distance = Math.hypot(clientX - startX, clientY - startY);
        if (distance <= 8) {
          Object.assign(this.transcriptPanelSize, originalSize);
          this.finishTranscriptResize();
          if (mode === "commit" || mode === "settle" && placement === "bottom") this.closeTranscriptPanel();
          else this.scheduleAlignToVideo();
          return;
        }
        saveTranscriptPanelSize(this.transcriptPanelSize);
        this.positionTranscriptPanel({ realignAfterInset: true, resizeEventMode: "settled" });
        const shouldAlignAfterResize = this.finishTranscriptResize();
        this.scrollTranscriptToActive();
        if (shouldAlignAfterResize) this.scheduleAlignToVideo();
      };
      const onPointerUp = (upEvent) => finish("commit", upEvent.clientX, upEvent.clientY);
      const onPointerCancel = () => finish("cancel");
      const onMouseUp = (upEvent) => finish("commit", upEvent.clientX, upEvent.clientY);
      const onLostPointerCapture = () => finish("settle");
      window.addEventListener("pointermove", onMove, this.eventOptions());
      window.addEventListener("pointerup", onPointerUp, this.eventOptions());
      window.addEventListener("pointercancel", onPointerCancel, this.eventOptions());
      window.addEventListener("mouseup", onMouseUp, this.eventOptions());
      handle?.addEventListener("lostpointercapture", onLostPointerCapture, this.eventOptions());
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
      this.scrollTranscriptToActive();
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
    scheduleTranscriptHydration(preferredIndex) {
      if (this.transcriptResizeActive) {
        this.transcriptHydrationAfterResizeIndex = preferredIndex;
        return;
      }
      const index = preferredIndex ?? this.activeTranscriptRowIndex();
      if (this.transcriptHydrateFrame) return;
      this.transcriptHydrateFrame = requestAnimationFrame(() => {
        this.transcriptHydrateFrame = void 0;
        if (this.destroyed) return;
        void this.hydrateTranscriptRows(index);
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
      if (this.cues.length) return this.transcriptGapAnchorRowIndex(rows);
      return 0;
    }
    // A real inter-cue gap must still leave overlay/currentCue blank -- but for
    // the transcript list only, snapping to "no active row" makes the highlight
    // vanish and reappear a beat later, and forces a virtual-window recompute
    // for no reason. Anchor instead on the latest row whose cue has already
    // started: a seek into a gap lands near the seek destination immediately,
    // and playback running through a gap keeps the previous row highlighted
    // until the next cue advances it once. Only while auto-follow is enabled --
    // with it off the previous "no active row" gap behavior is unchanged.
    transcriptGapAnchorRowIndex(rows) {
      if (this.currentCue || !this.video) return -1;
      if (!this.options.getSettings().subtitleTranscriptAutoScroll) return -1;
      const time = this.subtitlePlaybackTime(this.video);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].cue.start <= time) return index;
      }
      return -1;
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
        const cached = this.htmlCache.parsedHtmlCache.get(hydration.key);
        if (cached) this.applyCachedTranscriptRowHtml(hydration, cached);
        else targets.push(hydration);
      }
      if (targets.length) await this.hydrateTranscriptRowTargets(targets, request.settings, serial);
    }
    transcriptHydrationRequest() {
      if (!this.canHydrateTranscriptRows()) return null;
      const settings = this.options.getSettings();
      if (!canParseSubtitleTranscriptRows(settings)) return null;
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
        const rows = this.transcriptRows();
        const parsed = await this.parseTranscriptRowHtmlBatch(targets.map((target) => ({
          rowIndex: target.rowIndex,
          text: target.cue.text,
          key: target.key
        })), rows, settings, {
          enrichBeforeRender: true,
          refreshProvisional: true,
          requireEnrichedProvisional: true
        });
        if (serial !== this.transcriptHydrationSerial) return;
        for (const item of parsed) {
          this.updateTranscriptRowsForParseKey(item.key, item.html, {
            provisional: item.provisional === true,
            refreshProvisional: item.provisional === true && !this.htmlCache.parsedHtmlCache.has(item.key)
          });
        }
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
      const key = this.transcriptRowParseKey(rows[index], index, rows, settings);
      const provisionalNeedsHydration = (target.dataset.parsedProvisional === "true" || this.htmlCache.provisionalParsedHtmlCache.has(key) && !this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)) && (this.hasAuthoritativeParseTier() || !this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key));
      return !provisionalNeedsHydration && hasAttemptedTranscriptParse(target, key) ? null : { cue, rowIndex: index, target, key };
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
    scheduleTranscriptCacheWarmup(rows, preferredIndex) {
      if (this.transcriptResizeActive) {
        this.transcriptWarmupAfterResize = true;
        return;
      }
      const warmupRows = rows ?? this.transcriptRows();
      const index = preferredIndex ?? this.activeTranscriptRowIndex(warmupRows);
      const settings = this.options.getSettings();
      if (!this.shouldParseSubtitles(settings) || !warmupRows.length) return;
      const signature = this.transcriptCacheWarmupKey(warmupRows, settings, index);
      if (signature === this.transcriptCacheWarmupSignature) return;
      this.transcriptCacheWarmupSignature = signature;
      const serial = ++this.transcriptCacheWarmupSerial;
      void this.warmTranscriptParseCache(warmupRows, index, settings, serial);
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
          const batch = this.nextTranscriptWarmupBatch(planned, settings, () => cursor++);
          if (!batch.length) continue;
          try {
            const parsed = await this.parseTranscriptRowHtmlBatch(batch, rows, settings, parseOptions);
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
      return isYouTubePage() && totalRows > YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD;
    }
    nextTranscriptWarmupBatch(planned, settings, takeNextIndex) {
      const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
      const batch = [];
      while (batch.length < batchSize) {
        const item = planned[takeNextIndex()];
        if (!item) break;
        if (this.isWarmParsedCueKey(item.key, settings)) continue;
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
      if (isYouTubePage() && rowCount > YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD) {
        return Math.min(YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT, TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS);
      }
      if (isYouTubePage() && rowCount > YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT) {
        return YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
      }
      return TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
    }
    addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings) {
      const row = rows[rowIndex];
      const text = row?.cue.text;
      if (!text?.trim()) return;
      const key = this.transcriptRowParseKey(row, rowIndex, rows, settings);
      if (seen.has(key) || this.isWarmParsedCueKey(key, settings)) return;
      seen.add(key);
      plan.push({ rowIndex, text, key });
    }
    transcriptBackgroundParsePauseMs() {
      return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }
    updateTranscriptRowsForParseKey(key, html, options = {}) {
      if (!this.shouldParseSubtitles()) return;
      if (this.transcriptResizeActive) {
        this.transcriptWarmupAfterResize = true;
        return;
      }
      const panel = this.updatableTranscriptPanel();
      if (!panel) return;
      const hasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
      const updatedRoots = [];
      for (const target of this.transcriptTextTargetsForParseKey(panel, key)) {
        if (!options.force && !shouldApplyParsedTranscriptHtml(target, key, options.provisional === true, options.refreshProvisional === true)) continue;
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
      if (this.panelMode !== "lines" && this.panelMode !== "shadow") return null;
      return this.transcriptPanel;
    }
    renderTrackPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== "tracks") return;
      this.transcriptTextTargetsByParseKey.clear();
      const state = subtitleTrackPanelState(this.tracks);
      const settings = this.options.getSettings();
      const tracks = state.tracks.map((track) => ({
        ...track,
        timing: this.trackTimingControlState(track.id)
      }));
      const virtual = this.tracksVirtualWindow(tracks.length);
      this.renderedTracksVirtualWindow = virtual ? { start: virtual.start, end: virtual.end, rowCount: tracks.length } : void 0;
      setInnerHtml(this.transcriptPanel, renderSubtitleTrackPanel({
        ...state,
        tracks,
        selectedTrackId: this.selectedTrackId,
        secondaryTrackId: this.secondaryTrackId,
        hasTranscriptSurface: this.hasTranscriptSurface(),
        pausePanelEnabled: settings.subtitlePausePanel,
        placement: this.effectiveTranscriptPlacement,
        optionsMenuOpen: this.panelOptionsMenuOpen,
        language: settings.interfaceLanguage,
        animeSearchQuery: subtitleAnimeSearchQuery(this.video),
        virtual
      }));
      this.restoreTracksVirtualScroll(virtual);
      this.bindTranscriptResizeHandle();
      this.bindTracksScroller();
      this.syncPanelState();
    }
    // Render only the visible window of track rows (plus overscan) when a video
    // exposes more than the threshold of (auto-translated) caption tracks, so the
    // Tracks tab opens and the sidebar resizes without reflowing hundreds of rows.
    tracksVirtualWindow(rowCount) {
      if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return void 0;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      const clientHeight = Math.max(
        scroller?.clientHeight ?? 0,
        Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
        TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX * 6
      );
      const scrollTop = Math.max(0, scroller?.scrollTop ?? this.tracksVirtualScrollTop);
      const visibleRows = Math.max(
        TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
        Math.ceil(clientHeight / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2
      );
      const firstRow = Math.floor(Math.max(0, scrollTop - TRACKS_VIRTUAL_HEADER_PX) / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
      const start = Math.max(0, Math.min(firstRow, Math.max(0, rowCount - visibleRows)));
      const end = Math.min(rowCount, start + visibleRows);
      return {
        start,
        end,
        topSpacer: start * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX,
        bottomSpacer: Math.max(0, (rowCount - end) * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX)
      };
    }
    restoreTracksVirtualScroll(virtual) {
      if (!virtual) return;
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller) return;
      const scrollTop = Math.max(0, this.tracksVirtualScrollTop);
      if (Math.abs(scroller.scrollTop - scrollTop) > 1) scroller.scrollTop = scrollTop;
    }
    bindTracksScroller() {
      const scroller = this.transcriptPanel?.querySelector(".jpdb-subtitle-list-scroll");
      if (!scroller || scroller.dataset.tracksVirtualBound === "true") return;
      scroller.dataset.tracksVirtualBound = "true";
      scroller.addEventListener("scroll", () => this.scheduleTracksVirtualRender(scroller), { passive: true });
    }
    scheduleTracksVirtualRender(scroller) {
      if (scroller.dataset.virtualized !== "true") return;
      this.tracksVirtualScrollTop = scroller.scrollTop;
      if (this.tracksVirtualRenderFrame) return;
      this.tracksVirtualRenderFrame = requestAnimationFrame(() => {
        this.tracksVirtualRenderFrame = void 0;
        if (this.destroyed || this.transcriptResizeActive || !this.isTranscriptPanelOpen() || this.panelMode !== "tracks") return;
        const prev = this.renderedTracksVirtualWindow;
        if (!prev) return;
        if (this.tracks.length !== prev.rowCount) {
          this.renderTrackPanel();
          return;
        }
        const next = this.tracksVirtualWindow(prev.rowCount);
        if (!next || prev.start === next.start && prev.end === next.end) return;
        this.renderTrackPanel();
      });
    }
    trackTimingControlState(id) {
      const role = this.trackSelectionRole(id);
      if (!role) return void 0;
      const baseCues = this.baseCuesForSelectedTrack(id, role);
      return {
        offsetSeconds: this.trackTimingOffsetSeconds(id),
        canAdjust: baseCues.length > 0,
        canAlignPrevious: Boolean(this.video && adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, this.trackTimingOffsetSeconds(id), false)),
        canAlignNext: Boolean(this.video && adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, this.trackTimingOffsetSeconds(id), true))
      };
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
      return !this.destroyed && (role === "primary" ? this.primarySelectionRequest === requestId && this.selectedTrackId === trackId : this.secondarySelectionRequest === requestId && this.secondaryTrackId === trackId);
    }
    resetPrimarySubtitleState() {
      this.invalidateTrackSelection("primary");
      this.selectedTrackId = "";
      this.cues = [];
      this.currentCue = void 0;
      this.transcriptVirtualScrollTop = 0;
      this.clearTranscriptVirtualRender();
      this.lastDomCaption = "";
      this.lastDomCaptionSeenAt = 0;
      this.pendingDomCaption = void 0;
      this.youtubeDomCaptionFallbackTrackId = "";
      this.lastAutoCopiedCueSignature = "";
      this.lastRenderedPrimaryText = "";
      this.lastRenderedPrimaryHtml = "";
      this.lastAppliedSubtitleHtml = "";
      this.renderSerial += 1;
      this.parseWarmupSerial += 1;
      this.lastParseWarmupAnchor = -1;
      this.lastShadowSignature = "";
      this.shadowLoopEnabled = false;
    }
    resetSecondarySubtitleState() {
      this.invalidateTrackSelection("secondary");
      this.secondaryTrackId = "";
      this.secondaryCues = [];
      this.secondaryCue = void 0;
      this.lastShadowSignature = "";
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
      else if (this.panelMode === "shadow") this.renderShadowPanel(true);
      else if (this.panelMode === "mine") this.renderBatchMiningPanel();
      else this.renderTrackPanel();
    }
    clearAsbPlayerReaderLines() {
      let cleared = 0;
      const roots = Array.from(document.querySelectorAll(ASBPLAYER_SUBTITLE_ROOT_SELECTOR));
      for (const root of roots) cleared += unwrapReaderWords(root);
      if (cleared) log.info("Cleared parsed ASBPlayer subtitle lines", { roots: roots.length, cleared });
    }
    positionTranscriptPanel(options = {}) {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) {
        this.clearVideoInsetForTranscriptPanel();
        this.syncTranscriptPanelFullscreenDisplayOverride();
        return;
      }
      if (this.fullscreen) {
        this.positionFullscreenTranscriptPanel(options);
        return;
      }
      const panel = this.transcriptPanel;
      const viewport = this.transcriptViewportSize();
      const viewportWidth = viewport.width;
      const viewportHeight = viewport.height;
      const settings = this.options.getSettings();
      const reuseDragRect = options.skipInset && this.transcriptLayoutReferenceRect;
      const referenceVideoRect = reuseDragRect ? this.transcriptLayoutReferenceRect : this.transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight);
      const anchorTop = reuseDragRect ? referenceVideoRect.top : this.stableTranscriptAnchorTop(referenceVideoRect);
      const layout = this.transcriptDrawerLayout({
        viewportWidth,
        viewportHeight,
        anchorTop,
        compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
        preferredPlacement: settings.subtitleTranscriptPlacement,
        size: this.transcriptPanelSize
      }, referenceVideoRect);
      this.commitTranscriptPanelLayout(panel, layout, options);
      const insetChanged = this.applyVideoInsetForTranscriptLayout(layout, referenceVideoRect, {
        resizeEventMode: options.resizeEventMode ?? (this.transcriptPreviewPlayerResizeDeferred || options.skipInset ? "none" : "immediate")
      });
      if (!options.skipInset && options.realignAfterInset && insetChanged) this.scheduleTranscriptPanelRealignAfterInset();
    }
    positionFullscreenTranscriptPanel(options = {}) {
      const panel = this.transcriptPanel;
      if (!panel) return;
      this.clearVideoInsetForTranscriptPanel();
      this.syncTranscriptPanelFullscreenDisplayOverride();
      const viewport = this.transcriptViewportSize();
      const viewportWidth = viewport.width;
      const viewportHeight = viewport.height;
      const layout = computeSubtitleDrawerLayout({
        viewportWidth,
        viewportHeight,
        anchorTop: Math.max(0, this.videoLayoutRect().top),
        compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
        preferredPlacement: this.options.getSettings().subtitleTranscriptPlacement,
        size: this.transcriptPanelSize
      });
      this.commitTranscriptPanelLayout(panel, layout, options);
    }
    commitTranscriptPanelLayout(panel, layout, options = {}) {
      const placementChanged = layout.placement !== this.effectiveTranscriptPlacement;
      applyTranscriptPanelLayout(panel, layout);
      this.effectiveTranscriptPlacement = layout.placement;
      if (placementChanged) this.syncTranscriptPlacementClass();
      if (!options.skipResizeHandle) this.syncTranscriptResizeHandle(layout);
      if (!options.skipControlSync) this.syncDrawerButtons(this.hasVisibleSubtitleLines());
    }
    transcriptDrawerLayout(options, referenceVideoRect) {
      if (this.shouldUseStableYouTubeTranscriptLayout()) {
        return this.stableVideoTranscriptDrawerLayout(options, referenceVideoRect);
      }
      const layoutOptions = this.withConstrainedSideTranscriptSize(options, referenceVideoRect);
      const layout = computeSubtitleDrawerLayout(layoutOptions);
      const resolvedLayout = this.shouldUseBottomTranscriptLayout(layout, referenceVideoRect) ? computeSubtitleDrawerLayout({
        ...layoutOptions,
        compactPanel: true,
        preferredPlacement: "bottom"
      }) : layout;
      return resolvedLayout;
    }
    shouldUseStableYouTubeTranscriptLayout() {
      if (!this.video) return false;
      if (!isYouTubePage()) return false;
      return !isYouTubeShortsLikePlayer(this.video, this.videoLayoutRect());
    }
    stableVideoTranscriptDrawerLayout(options, videoRect) {
      const placement = options.preferredPlacement === "left" ? "left" : options.preferredPlacement === "bottom" ? "bottom" : "right";
      if (options.compactPanel || placement === "bottom") {
        return computeSubtitleDrawerLayout({
          ...options,
          compactPanel: true,
          preferredPlacement: "bottom"
        });
      }
      const sideLayout = this.stableSideTranscriptDrawerLayout(placement, options, videoRect);
      return sideLayout ?? computeSubtitleDrawerLayout({
        ...options,
        compactPanel: true,
        preferredPlacement: "bottom"
      });
    }
    stableSideTranscriptDrawerLayout(placement, options, videoRect) {
      if (isYouTubePage()) return this.stableYouTubeSideTranscriptDrawerLayout(placement, options, videoRect);
      if (videoRect.width <= 0 || videoRect.height <= 0) return null;
      const margin = TRANSCRIPT_PANEL_MARGIN;
      const availableWidth = Math.floor(placement === "left" ? videoRect.left - margin * 2 : options.viewportWidth - videoRect.right - margin * 2);
      if (availableWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return null;
      const desiredWidth = options.size?.sideWidth ?? Math.min(460, options.viewportWidth * 0.32);
      const width = Math.round(Math.min(Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, desiredWidth), availableWidth));
      const top = Math.round(Math.min(
        Math.max(options.anchorTop ?? videoRect.top ?? 72, margin),
        Math.max(margin, options.viewportHeight - 280)
      ));
      return {
        placement,
        left: placement === "left" ? Math.max(margin, Math.round(videoRect.left - margin - width)) : Math.min(options.viewportWidth - margin - width, Math.max(margin, Math.round(videoRect.right + margin))),
        top,
        width,
        height: Math.max(260, options.viewportHeight - top - margin),
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        margin,
        maxWidth: availableWidth
      };
    }
    stableYouTubeSideTranscriptDrawerLayout(placement, options, videoRect) {
      if (videoRect.width <= 0 || videoRect.height <= 0) return null;
      const margin = TRANSCRIPT_PANEL_MARGIN;
      const maxWidth = this.maxSideTranscriptWidthForVideo(placement, options, videoRect);
      if (maxWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return null;
      const currentRightFreeWidth = Math.floor(options.viewportWidth - Math.round(videoRect.right + margin));
      const defaultWidth = placement === "right" ? Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, Math.min(maxWidth, currentRightFreeWidth)) : Math.min(460, maxWidth);
      const desiredWidth = options.size?.sideWidth ?? defaultWidth;
      const width = Math.round(Math.min(Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, desiredWidth), maxWidth));
      const top = Math.round(Math.min(
        Math.max(options.anchorTop ?? videoRect.top ?? 72, margin),
        Math.max(margin, options.viewportHeight - 280)
      ));
      return {
        placement,
        left: placement === "left" ? 0 : Math.max(0, options.viewportWidth - width),
        top,
        width,
        height: Math.max(260, options.viewportHeight - top - margin),
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        margin,
        maxWidth
      };
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
      this.alignToVideo();
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
      const current = this.measureWithoutStableYouTubeTranscriptLayout(() => this.videoInset.measureWithoutInset(this.video, () => this.videoLayoutRect()));
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
        this.clearVideoInsetForTranscriptPanel();
        return false;
      }
      if (this.shouldUseStableYouTubeTranscriptLayout()) {
        const insetChanged = this.videoInset.clear(this.video);
        const stableChanged = this.applyStableYouTubeTranscriptLayout(layout, videoRect, options.resizeEventMode);
        return insetChanged || stableChanged;
      }
      this.clearStableYouTubeTranscriptLayout();
      const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
      return this.applyPageVideoInset(layout.placement, Math.max(0, availableWidth), layout.width, videoRect, options);
    }
    availablePlayerWidthForSideLayout(layout, videoRect) {
      const viewportWidth = this.transcriptViewportWidth();
      return layout.placement === "left" ? viewportWidth - (layout.left + layout.width + layout.margin * 2) : layout.left - videoRect.left - layout.margin;
    }
    syncFullscreenState() {
      this.fullscreenHost.invalidateHostCache();
      this.restoreSubtitleDragOffset();
      const fullscreenElement = currentFullscreenElement();
      const fullscreenHost = this.fullscreenHost.subtitleFullscreenHost(fullscreenElement);
      this.fullscreen = Boolean(fullscreenElement || fullscreenHost || videoIsInNativeFullscreen(this.video));
      this.fullscreenHost.syncSubtitleRootParent(fullscreenHost);
      document.documentElement.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      this.root?.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      this.transcriptPanel?.classList.toggle("jpdb-subtitle-fullscreen", this.fullscreen);
      this.syncTranscriptPanelFullscreenDisplayOverride();
      if (this.fullscreen) {
        this.clearVideoInsetForTranscriptPanel();
        return;
      }
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
    }
    syncTranscriptPanelFullscreenDisplayOverride() {
      const panel = this.transcriptPanel;
      if (!panel) return;
      const shouldOverride = this.fullscreen && !panel.hidden && !this.transcriptPanelClosing;
      if (shouldOverride) {
        panel.style.setProperty("display", "grid", "important");
        panel.dataset.jpdbFullscreenDisplayOverride = "true";
        return;
      }
      if (panel.dataset.jpdbFullscreenDisplayOverride === "true") {
        panel.style.removeProperty("display");
        delete panel.dataset.jpdbFullscreenDisplayOverride;
      }
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
      const fullscreenHost = this.fullscreenHost.subtitleFullscreenHost();
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
    // The side panel normally hangs from the video's top. Once the video scrolls
    // out of view, that top is off-screen (negative when scrolled up, huge when
    // below the fold) and the clamp in the layout math then swings the panel's
    // height from full-height to a bottom-pinned sliver. Return a stable on-screen
    // anchor while the video is not overlay-visible so the panel keeps a steady
    // height as you scroll past it (it stays position:fixed on screen regardless).
    stableTranscriptAnchorTop(referenceVideoRect) {
      const liveTop = this.transcriptAnchorRect().top;
      if (this.isTranscriptAnchorVideoVisible(referenceVideoRect)) return liveTop;
      return TRANSCRIPT_PANEL_MARGIN;
    }
    isTranscriptAnchorVideoVisible(referenceVideoRect) {
      if (this.fullscreen) return true;
      if (this.root && !this.root.classList.contains("jpdb-subtitle-video-out-of-view")) return true;
      return this.isVideoOverlayVisible(referenceVideoRect);
    }
    clearVideoInsetForTranscriptPanel() {
      this.transcriptLayoutReferenceRect = void 0;
      this.transcriptLayoutReferenceViewport = "";
      const stableChanged = this.clearStableYouTubeTranscriptLayout();
      const insetChanged = this.videoInset.clear(this.video);
      return stableChanged || insetChanged;
    }
    applyStableYouTubeTranscriptLayout(layout, videoRect, resizeEventMode = "immediate") {
      if (!isYouTubePage() || layout.placement === "bottom") return this.clearStableYouTubeTranscriptLayout();
      const root = document.documentElement;
      if (!root) return false;
      let changed = false;
      const setClass = (className, enabled) => {
        const hadClass = root.classList.contains(className);
        root.classList.toggle(className, enabled);
        changed = changed || hadClass !== enabled;
      };
      setClass("jpdb-subtitle-youtube-stable-side", true);
      setClass("jpdb-subtitle-youtube-stable-left", layout.placement === "left");
      setClass("jpdb-subtitle-youtube-stable-right", layout.placement === "right");
      const playerOffsetTarget = this.stableYouTubePlayerOffsetTarget();
      setClass("jpdb-subtitle-youtube-stable-player-fallback", layout.placement === "left" && playerOffsetTarget === "player");
      setClass("jpdb-subtitle-youtube-stable-full-bleed", layout.placement === "left" && playerOffsetTarget === "full-bleed");
      const offsetPx = layout.placement === "left" ? Math.max(0, Math.round(layout.left + layout.width + layout.margin)) : 0;
      const playerSize = this.stableYouTubePlayerSizeForLayout(layout, videoRect);
      const playerWidth = `${playerSize.width}px`;
      const playerHeight = `${playerSize.height}px`;
      const offset = `${offsetPx}px`;
      changed = setDocumentStylePropertyIfChanged(root, "--jpdb-subtitle-youtube-stable-offset", offset) || changed;
      changed = setDocumentStylePropertyIfChanged(root, "--jpdb-subtitle-youtube-stable-player-width", playerWidth) || changed;
      changed = setDocumentStylePropertyIfChanged(root, "--jpdb-subtitle-youtube-stable-player-height", playerHeight) || changed;
      const mediaChanged = applyStableYouTubePlayerVideoSize(this.video, playerSize.width, playerSize.height);
      if (changed && resizeEventMode !== "none") {
        resizeYouTubePlayerForSubtitleLayout(
          playerSize.width,
          playerSize.height,
          resizeEventMode
        );
      }
      return changed || mediaChanged;
    }
    stableYouTubePlayerOffsetTarget() {
      if (!isYouTubePage()) return null;
      const fullBleed = document.querySelector("ytd-watch-flexy[is-single-column] #full-bleed-container #player-container");
      if (fullBleed) {
        const position = getComputedStyle(fullBleed).position;
        if (position === "absolute" || position === "fixed") return "full-bleed";
      }
      const primary = document.querySelector("ytd-watch-flexy #primary");
      const player = document.querySelector("#movie_player, .html5-video-player");
      return !primary && player ? "player" : null;
    }
    stableYouTubePlayerSizeForLayout(layout, videoRect) {
      const width = Math.max(0, Math.round(this.availablePlayerWidthForSideLayout(layout, videoRect)));
      return {
        width,
        height: this.stableYouTubePlayerHeightForWidth(width, videoRect)
      };
    }
    stableYouTubePlayerHeightForWidth(width, videoRect) {
      const aspectRatio = videoRect.width > 0 && videoRect.height > 0 ? videoRect.height / videoRect.width : 9 / 16;
      return Math.max(180, Math.round(width * aspectRatio));
    }
    clearStableYouTubeTranscriptLayout() {
      const root = document.documentElement;
      if (!root) return false;
      let changed = false;
      for (const className of YOUTUBE_STABLE_TRANSCRIPT_CLASSES) {
        if (!root.classList.contains(className)) continue;
        root.classList.remove(className);
        changed = true;
      }
      for (const property of YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES) {
        if (!root.style.getPropertyValue(property)) continue;
        root.style.removeProperty(property);
        changed = true;
      }
      return clearStableYouTubePlayerVideoSize() || changed;
    }
    measureWithoutStableYouTubeTranscriptLayout(callback) {
      const root = document.documentElement;
      if (!root) return callback();
      const classSnapshot = YOUTUBE_STABLE_TRANSCRIPT_CLASSES.map((className) => [className, root.classList.contains(className)]);
      const styleSnapshot = YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES.map((property) => [property, root.style.getPropertyValue(property)]);
      this.clearStableYouTubeTranscriptLayout();
      try {
        return callback();
      } finally {
        for (const [className, enabled] of classSnapshot) root.classList.toggle(className, enabled);
        for (const [property, value] of styleSnapshot) {
          if (value) root.style.setProperty(property, value);
          else root.style.removeProperty(property);
        }
        this.restoreStableYouTubePlayerVideoSizeFromRoot(root);
      }
    }
    restoreStableYouTubePlayerVideoSizeFromRoot(root) {
      if (!root.classList.contains("jpdb-subtitle-youtube-stable-side")) return;
      const width = Number.parseFloat(root.style.getPropertyValue("--jpdb-subtitle-youtube-stable-player-width"));
      const height = Number.parseFloat(root.style.getPropertyValue("--jpdb-subtitle-youtube-stable-player-height"));
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        applyStableYouTubePlayerVideoSize(this.video, width, height);
      }
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
  const YOUTUBE_UI_METADATA_RE = new RegExp([
    /視聴回数\s*[\d.,]+\s*(?:万|億)?\s*回/.source,
    /[\d.,]+\s*(?:万|億)?\s*回視聴/.source,
    /[\d.,]+\s*(?:万|億)?\s*人が視聴中/.source,
    /\d+\s*(?:秒|分|時間|日|週間|か月|カ月|ヶ月|年)前/.source,
    /(?:ライブ配信中|配信済み|プレミア公開|視聴する|再生リスト|ミックスリスト|ミックス)/.source
  ].join("|"), "g");
  function normalizeYouTubeTitleForLanguageCheck(text) {
    return text.replace(/fypシ゚/g, "").replace(/fypシ/g, "").replace(YOUTUBE_UI_METADATA_RE, "").replace(NIHONGO_TUBE_SYMBOL_RE, "").replace(/\s+/g, " ").trim();
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
  const YOUTUBE_UNRENDERED_SHELF_SLOT_SELECTOR = SHELF_SELECTOR.split(",").flatMap((selector) => [`${selector} ytd-rich-item-renderer`, `${selector} ytm-rich-item-renderer`]).join(",");
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
  const YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS = 90;
  const YOUTUBE_FILTER_COLLAPSE_DELAY_MS = 80;
  const YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS = 650;
  const YOUTUBE_FILTER_SCROLL_SETTLE_MS = 280;
  const YOUTUBE_FILTER_COLLAPSE_DURATION_MS = 240;
  const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 1e4;
  const YOUTUBE_VISIBLE_BACKFILL_TARGET = 24;
  const YOUTUBE_BACKFILL_THROTTLE_MS = 1200;
  const YOUTUBE_SEARCH_AUTO_REVEAL_MIN_FILTERED = 8;
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
      title: (titleText.trim() || nativeYouTubeText(card).trim() || "").trim(),
      videoId: readYouTubeVideoId(card)
    };
  }
  function nativeYouTubeText(element) {
    if (!element.querySelector(".jpdb-reader-text-mirror,rt.jpdb-reader-furi,[data-jpdb-reader-root]")) {
      return element.textContent ?? "";
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll(".jpdb-reader-text-mirror,rt.jpdb-reader-furi,[data-jpdb-reader-root]").forEach((node) => node.remove());
    return clone.textContent ?? "";
  }
  class YoutubeImmersionFilter {
    constructor(options) {
      this.options = options;
    }
    observer;
    events;
    timer;
    metadataRescanTimer;
    bar;
    noticeAutoHideTimer;
    noticeAutoHideScope = "";
    channelShelf;
    revealed = false;
    dismissedNoticeScope = "";
    // "Hide notice" is a SESSION dismissal: it must never persist — the
    // permanent switch lives in the settings dialog only (2026-07-11 report:
    // one tap on the notice silently disabled it forever).
    noticeSessionHidden = false;
    // Route scope that was auto-revealed because the user's own search came
    // back all non-Japanese; cleared when the route changes or the user
    // toggles manually.
    autoRevealedScope = "";
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
      this.resetStaleAutoReveal();
      const result = classifyYouTubeFilterCandidates(this.collectFilterCandidates(), { revealed: this.revealed });
      if (this.shouldAutoRevealSearchResults(result)) {
        this.revealed = true;
        this.autoRevealedScope = this.currentNoticeScope();
        this.schedule(0);
        return;
      }
      result.decisions.forEach((decision) => this.applyFilterDecision(decision));
      this.syncFilterableVideoShelves();
      if (settings.youtubeShowFilterNotice && !this.noticeSessionHidden && shouldShowFilterNoticeForRoute()) {
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
      const notice = this.ensureNoticeBar();
      this.updateNoticeSummary(notice.summary, filteredCount, shownCount, settings);
      this.updateNoticeActions(notice, settings);
      this.armNoticeAutoHide(noticeScope);
    }
    // The notice must not squat over the feed forever: after a grace period it
    // dismisses itself for the current scope, and comes back on the next route.
    armNoticeAutoHide(scope) {
      if (this.noticeAutoHideTimer !== void 0 && this.noticeAutoHideScope === scope) return;
      window.clearTimeout(this.noticeAutoHideTimer);
      this.noticeAutoHideScope = scope;
      this.noticeAutoHideTimer = window.setTimeout(() => {
        this.noticeAutoHideTimer = void 0;
        this.dismissedNoticeScope = scope;
        this.removeNotice();
      }, YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS);
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
      bar.role = "status";
      bar.ariaLive = "polite";
      const summary = document.createElement("span");
      summary.dataset.role = "summary";
      summary.className = "jpdb-reader-sr-only";
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
      this.autoRevealedScope = "";
      this.schedule(0);
    }
    shouldAutoRevealSearchResults(result) {
      if (this.revealed) return false;
      if (location.pathname !== "/results") return false;
      return result.shownCount === 0 && result.filteredCount >= YOUTUBE_SEARCH_AUTO_REVEAL_MIN_FILTERED;
    }
    // Auto-reveal is scoped to the search route it rescued: navigating away
    // restores normal filtering. A manual toggle (autoRevealedScope cleared)
    // is never touched.
    resetStaleAutoReveal() {
      if (!this.autoRevealedScope) return;
      if (this.currentNoticeScope().split(":")[0] === this.autoRevealedScope.split(":")[0]) return;
      this.autoRevealedScope = "";
      this.revealed = false;
    }
    dismissFilterNotice() {
      this.noticeSessionHidden = true;
      this.dismissedNoticeScope = this.currentNoticeScope();
      this.removeNotice();
    }
    updateNoticeSummary(summary, filteredCount, shownCount, settings) {
      const summaryText = this.noticeSummaryText(filteredCount, settings);
      const visibleText = shownCount ? formatYoutubeText(uiText(settings.interfaceLanguage, "youtubeFilterVisible"), { count: String(shownCount) }) : "";
      const bar = summary.closest(".jpdb-youtube-filter-bar");
      summary.textContent = summaryText;
      summary.title = visibleText;
      if (bar) {
        bar.setAttribute("aria-label", visibleText ? `${summaryText}. ${visibleText}` : summaryText);
        bar.title = visibleText;
      }
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
    removeNotice() {
      window.clearTimeout(this.noticeAutoHideTimer);
      this.noticeAutoHideTimer = void 0;
      this.noticeAutoHideScope = "";
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
      const value = readYouTubeConfigStringFromScripts(key);
      if (value) data[key] = value;
    }
    const context = readYouTubeConfigScriptObject("INNERTUBE_CONTEXT");
    if (context) data.INNERTUBE_CONTEXT = context;
    return Object.keys(data).length ? { data_: data } : void 0;
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
      nativeYouTubeText(title)
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
    root.querySelectorAll(YOUTUBE_UNRENDERED_SHELF_SLOT_SELECTOR).forEach((slot) => {
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
  const YOUTUBE_AD_CARD_SELECTOR = 'ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytm-promoted-video-renderer,[class*="AdDetailsLineViewModel"]';
  function isYouTubeAdCard(card) {
    return Boolean(card.closest("ytd-ad-slot-renderer")) || Boolean(card.querySelector(YOUTUBE_AD_CARD_SELECTOR));
  }
  function isYouTubeAlwaysHiddenItem(card) {
    if (isYouTubeAdCard(card)) return true;
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
    return rect.bottom >= 0 && rect.top <= window.innerHeight * 1.25;
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
  registerYomuCompanion("video", {
    SubtitlePlayerController,
    YoutubeImmersionFilter
  });
})();
