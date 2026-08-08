(function() {
"use strict";
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
const DOODLE_COLOR_TOKENS = {
  ink: "#141820"
};
const LOGGER_COLOR_TOKENS = {
  debug: "#6b7280",
  warn: "#a15c00",
  error: "#b91c1c"
};
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
function isPromiseLike$1(value) {
  return Boolean(value && typeof value.then === "function");
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
function yomuLocalDictionaries() {
  return yomuCompanions().localDictionaries;
}
function yomuKanjiStudyCompanion() {
  return yomuCompanions().kanjiStudy;
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
  const pendingPatch = pendingHostedLocalPatch(key, epoch);
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
  if (key === HOSTED_SETTINGS_BLOB_KEY && isHostedYomuOrigin() && isPlainRecord(fallback)) {
  mirrorManagedValueToHostedStorage(key, fallback, epoch);
  }
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
  if (key !== HOSTED_SETTINGS_BLOB_KEY || !isHostedYomuOrigin()) return void 0;
  if (!localMirrorBelongsToEpoch(key, epoch)) return void 0;
  const value = localStorageGet(key, void 0);
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const patch = value[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
  return isPlainRecord(patch) ? sanitizedStrandedLocalValue(key, patch) : void 0;
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
const JITEN_API_KEY_PREFIX = "ak_";
function effectiveJpdbApiKey(settings) {
  const apiKey = settings.apiKey.trim();
  return isJitenApiCredential(apiKey) ? "" : apiKey;
}
function hasJpdbApiCredential(settings) {
  return Boolean(effectiveJpdbApiKey(settings));
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
function isAppleTouchBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
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
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
  globalThis.clearTimeout(timeout);
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
async function requestText$5(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "text" });
  return typeof value === "string" ? value : String(value ?? "");
}
async function requestBlob$2(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "blob" });
  if (value instanceof Blob) return value;
  if (isBlobLike(value)) return new Blob([await value.arrayBuffer()], { type: value.type });
  throw new Error(options.blobFailureMessage ?? `${options.failureLabel ?? "Request"} did not return a blob.`);
}
async function requestJson$2(url, options = {}) {
  const value = await requestHttp(url, { ...options, responseType: "json" });
  return value;
}
function isBlobLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string");
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
function uniqueNonEmptyStrings$1(values) {
  return uniqueStrings(values, { dropEmpty: true });
}
function uniqueTrimmedStrings(values) {
  return uniqueStrings(values, { trim: true, dropEmpty: true });
}
function buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, entries2, sourceInfo = null, kanjiVGInfo = null) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const meanings = entries2.flatMap((entry) => entry.meanings).filter(Boolean);
  const kanjiVGPositions = kanjiVGComponentPositionMap(kanjiVGInfo);
  const builder = { kanji, nodes, edges, kanjiVGPositions };
  nodes.set(kanji, {
  id: kanji,
  label: kanji,
  kind: "current",
  detail: first$1([jpdbInfo?.keyword, rtkInfo?.keyword, sourceInfo?.kanjiMap?.meaning, meanings[0]]) ?? "current kanji",
  source: "current lookup"
  });
  sourceInfo?.kanjiMap?.radical?.symbol && addKanjiOriginComponent(
  builder,
  sourceInfo.kanjiMap.radical.symbol,
  first$1([sourceInfo.kanjiMap.radical.meaning, sourceInfo.kanjiMap.radical.name]) ?? "radical",
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
  return uniqueNonEmptyStrings$1([
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
function splitRtkElements$1(value) {
  return [...new Set(value.split(/[、,;＋+]/).map((item) => item.trim()).filter(Boolean))].slice(0, 16);
}
function first$1(values) {
  return values.find((value) => value?.trim())?.trim();
}
const KANJI_MAP_KANJI_BASE = "https://raw.githubusercontent.com/gabor-kovacs/the-kanji-map/main/data/kanji";
const KANJI_ALIVE_PRIMARY_GLOSSES_URL = "https://yomureader.com/data/kanji-alive-primary-glosses.json";
const JAPANESE_RE$1 = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log$a = Logger.scope("KanjiOrigin");
class KanjiOriginClient {
  cache = /* @__PURE__ */ new Map();
  kanjiAliveGlosses;
  // Called through the nullable kanji-study companion slot (app/main.ts).
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
  const done = log$a.time("Kanji origin lookup", { kanji });
  const [kanjiMap, kanjiAliveKeyword] = settings.kanjiOriginKanjiMapEnabled ? await Promise.all([
    fetchKanjiMapInfo(kanji).catch((error) => {
      log$a.warn("Kanji Map origin lookup failed", { kanji, error });
      return void 0;
    }),
    this.lookupKanjiAliveKeyword(kanji).catch((error) => {
      log$a.warn("Kanji Alive keyword lookup failed", { kanji, error });
      return void 0;
    })
  ]) : [void 0, void 0];
  const result = kanjiMap || kanjiAliveKeyword ? { kanjiMap, kanjiAliveKeyword } : null;
  done();
  return result;
  }
  async lookupKanjiAliveKeyword(kanji) {
  const request = this.kanjiAliveGlosses ??= fetchKanjiAlivePrimaryGlosses();
  try {
    return (await request)[kanji];
  } catch (error) {
    if (this.kanjiAliveGlosses === request) this.kanjiAliveGlosses = void 0;
    throw error;
  }
  }
}
function kanjiOriginCacheKey(kanji, settings) {
  return [
  kanji,
  settings.kanjiOriginKanjiMapEnabled ? "map" : ""
  ].join(":");
}
async function fetchKanjiMapInfo(kanji) {
  const done = log$a.time("Fetch Kanji Map info", { kanji });
  const sourceUrl = `${KANJI_MAP_KANJI_BASE}/${encodeURIComponent(kanji)}.json`;
  const raw = parseJson(await requestText$4(sourceUrl));
  const info = raw ? parseKanjiMapInfo(raw, kanji, sourceUrl) : void 0;
  done();
  return info;
}
function parseKanjiMapInfo(raw, kanji, sourceUrl) {
  const record2 = asRecord(raw);
  if (!record2) return void 0;
  const kanjiAlive = asRecord(record2.kanjialiveData);
  const jisho = asRecord(record2.jishoData);
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
function buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries2, sourceInfo = null) {
  const facts = /* @__PURE__ */ new Map();
  for (const candidate of kanjiFactCandidates(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries2, sourceInfo)) {
  addKanjiFact(facts, candidate.label, candidate.value, candidate.source);
  }
  if (!facts.has("Character")) addKanjiFact(facts, "Character", kanji, "current lookup");
  const result = Array.from(facts.values()).filter((fact2) => fact2.label !== "Character").slice(0, 8);
  return result;
}
function kanjiFactCandidates(_kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries2, sourceInfo) {
  const local = extractLocalKanjiFacts(entries2);
  const map = sourceInfo?.kanjiMap;
  return [
  kanjiMeaningFact(map, jpdbInfo, rtkInfo, entries2),
  kanjiTypeFact(jpdbInfo, local, map),
  kanjiJlptFact(local, map),
  kanjiGradeFact(local, map),
  kanjiStrokeFact(kanjiVGInfo, local, map),
  kanjiFrequencyFact(jpdbInfo, local, map),
  kanjiRadicalFact(map)
  ];
}
function kanjiMeaningFact(map, jpdbInfo, rtkInfo, entries2) {
  const meaning = kanjiMeaningCandidate(map, jpdbInfo, rtkInfo, entries2);
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
function kanjiRadicalFact(map) {
  return { label: "Radical", value: kanjiRadicalValue(map), source: "Kanji Alive / Jisho" };
}
function kanjiMeaningCandidate(map, jpdbInfo, rtkInfo, entries2) {
  const localMeaning = firstLocalMeaning(entries2);
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
function firstFactCandidate(candidates) {
  return candidates.find((candidate) => candidate.value?.trim());
}
function firstLocalMeaning(entries2) {
  for (const entry of entries2) {
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
  const text2 = stringValue(value);
  if (text2) return text2;
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
  const record2 = asRecord(example);
  add(record2?.japanese, "", asRecord(record2?.meaning)?.english);
  });
  [...unknownArray(jisho?.onyomiExamples), ...unknownArray(jisho?.kunyomiExamples)].forEach((example) => {
  const record2 = asRecord(example);
  add(record2?.example, record2?.reading, record2?.meaning);
  });
  return examples.slice(0, 6);
}
function readKanjiMapReferences(kanjiAlive, jisho) {
  const references = asRecord(kanjiAlive?.references);
  const facts = [];
  const add = (label, value, source) => {
  const text2 = stringValue(value);
  if (text2) facts.push({ label, value: text2, source });
  };
  add("Kodansha", references?.kodansha, "Kanji Alive");
  add("Classic Nelson", references?.classic_nelson, "Kanji Alive");
  add("Jisho", jisho?.uri, "Jisho");
  return facts.slice(0, 4);
}
function extractLocalKanjiFacts(entries2) {
  const facts = {};
  for (const entry of entries2) {
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
  const text2 = String(value).trim();
  const match = text2.match(/(?:grade\s*)?([1-6])/i);
  return match ? `Grade ${match[1]}` : text2;
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
async function fetchKanjiAlivePrimaryGlosses() {
  const payload = asRecord(parseJson(await requestText$4(KANJI_ALIVE_PRIMARY_GLOSSES_URL)));
  const meanings = asRecord(payload?.meanings);
  if (!meanings) return {};
  return Object.fromEntries(Object.entries(meanings).map(([kanji, meaning]) => [kanji, stringValue(meaning)]).filter((entry) => Boolean(entry[1])));
}
function requestText$4(url) {
  return requestText$5(url, {
  timeoutMs: 1e4,
  failureLabel: "Kanji origin request",
  timeoutLabel: "Kanji origin request timed out."
  }).catch((error) => {
  log$a.warn("Kanji origin request failed", { host: safeHost(url), error });
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
const CARD_STATES$1 = /* @__PURE__ */ new Set([
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
  if (CARD_STATES$1.has(value)) return value;
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
const UNIFIED_IDEOGRAPH_RE = /^\p{Unified_Ideograph}$/u;
const UNIFIED_IDEOGRAPH_RUN_RE = /\p{Unified_Ideograph}+/gu;
function isUnifiedIdeograph(value) {
  return UNIFIED_IDEOGRAPH_RE.test(value);
}
function hanIdeographSegments(text2) {
  return [...text2.matchAll(UNIFIED_IDEOGRAPH_RUN_RE)].map((match) => ({
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
const KATAKANA_MIDDLE_DOT = "・";
const COMBINING_KANA_MARKS = "゙゚";
const HIRAGANA_LETTERS = "ぁ-ゖゝ-ゟ";
const KATAKANA_LETTERS = "ァ-ヺヽ-ヿ";
const HALFWIDTH_KATAKANA_LETTERS = "ｦ-ｯｱ-ﾝ";
const KANJI_LIKE = `${KANJI}${ITERATION_MARKS}`;
const KANJI_LIKE_WITH_COUNTERS = `${KANJI_LIKE}${KANA_COUNTERS}`;
const KANJI_LIKE_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}])`;
const KANJI_LIKE_WITH_COUNTERS_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}${KANA_COUNTERS}])`;
const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
const KANA_WITH_PROLONGED = `${KANA}${PROLONGED_SOUND_MARK}`;
const READING_KANA = `${KANA}${PROLONGED_SOUND_MARK}${KATAKANA_MIDDLE_DOT}`;
const JAPANESE_SCRIPT = `${KANA}${KANJI}${ITERATION_MARKS}${HALFWIDTH_KATAKANA}`;
const JAPANESE_LETTERS = `${HIRAGANA_LETTERS}${KATAKANA_LETTERS}${KANJI}${HALFWIDTH_KATAKANA_LETTERS}`;
const HAS_JAPANESE = new RegExp(`(?:[${JAPANESE_SCRIPT}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
const HAS_JAPANESE_LETTER = new RegExp(`(?:[${JAPANESE_LETTERS}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
const KANJI_RE = new RegExp(KANJI_PATTERN, "u");
const KANJI_LIKE_RE = new RegExp(KANJI_LIKE_PATTERN, "u");
const KANA_ONLY_RUN_RE = new RegExp(`^[${KANA_WITH_PROLONGED}]+$`, "u");
const READING_KANA_CHAR_RE = new RegExp(`[${READING_KANA}]`, "u");
const READING_KANA_ONLY_RE = new RegExp(`^[${READING_KANA}]+$`, "u");
const PITCH_LEVELS = /* @__PURE__ */ new Set(["H", "L"]);
const SMALL_KANA = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
const PRONUNCIATION_KANA = new RegExp(`^[${KANA}${COMBINING_KANA_MARKS}]+$`, "u");
const PITCH_CLASS_RULES = [
  { className: "heiban", matches: (pitchNumber) => pitchNumber === 0 },
  { className: "atamadaka", matches: (pitchNumber) => pitchNumber === 1 },
  { className: "odaka", matches: (pitchNumber, moraCount) => pitchNumber === moraCount },
  { className: "nakadaka", matches: (pitchNumber, moraCount) => pitchNumber > 1 && pitchNumber < moraCount }
];
function normalizePitchPatternForReading(pattern, reading) {
  const levels = pitchLevels(pattern);
  if (!levels.length) return "";
  return normalizePitchLevelsForReading(levels, reading).join("");
}
function pitchLevels(pattern) {
  return Array.from(pattern).filter((level) => PITCH_LEVELS.has(level));
}
function splitMorae(reading) {
  if (!PRONUNCIATION_KANA.test(reading)) return [];
  const morae = [];
  for (const char of Array.from(reading)) {
  if (morae.length && SMALL_KANA.has(char)) morae[morae.length - 1] += char;
  else morae.push(char);
  }
  return morae;
}
function countMorae(reading) {
  return splitMorae(reading).length;
}
function pitchPatternFromPosition(reading, position) {
  const moraCount = countMorae(reading);
  if (!moraCount || !Number.isInteger(position) || position < 0 || position > moraCount) return "";
  if (position === 0) return `L${"H".repeat(moraCount)}`;
  if (position === 1) return `H${"L".repeat(moraCount)}`;
  const highMorae = position - 1;
  const lowTail = moraCount - position + 1;
  return `L${"H".repeat(highMorae)}${"L".repeat(lowTail)}`;
}
function pitchProfileForPattern(pattern, reading) {
  const normalized = normalizePitchPatternForReading(pattern, reading);
  const morae = splitMorae(reading);
  const pitchNumber = pitchNumberFromPattern(normalized, reading);
  return {
  reading,
  morae,
  pitchNumber,
  pattern: normalized,
  className: pitchClassNameFromProfile(morae.length, pitchNumber)
  };
}
function pitchClassNameForPattern(pattern, reading) {
  return pitchProfileForPattern(pattern, reading).className;
}
function contextPitchPattern(patterns, reading) {
  if (!patterns?.length) return "";
  if (!reading) return patterns[0];
  return patterns.find((pattern) => pitchClassNameForPattern(pattern, reading) !== "") ?? "";
}
function pitchNumberFromPattern(pattern, reading) {
  const levels = pitchLevels(normalizePitchPatternForReading(pattern, reading));
  const moraCount = countMorae(reading);
  if (!moraCount) return null;
  if (levels.length < moraCount) return looksLikeCompactHeibanPattern(levels) ? 0 : null;
  if (levels.length > moraCount + 1) return null;
  for (let position = 0; position <= moraCount; position += 1) {
  const expected = pitchLevels(pitchPatternFromPosition(reading, position));
  if (levels.every((level, index) => expected[index] === level)) return position;
  }
  return null;
}
function looksLikeCompactHeibanPattern(levels) {
  return levels.length >= 2 && levels[0] === "L" && levels.slice(1).every((level) => level === "H");
}
function pitchClassNameFromProfile(moraCount, pitchNumber) {
  if (!moraCount || pitchNumber == null) return "";
  return PITCH_CLASS_RULES.find((rule) => rule.matches(pitchNumber, moraCount))?.className ?? "";
}
function normalizePitchLevelsForReading(levels, reading) {
  const chars = Array.from(reading);
  if (!levels.length || !chars.some((char) => SMALL_KANA.has(char))) return levels;
  if (!looksCharacterAlignedPitch(levels, chars)) return levels;
  const normalized = [];
  for (let index = 0; index < Math.min(chars.length, levels.length); index++) {
  if (normalized.length && SMALL_KANA.has(chars[index])) continue;
  normalized.push(levels[index]);
  }
  return normalized.concat(levels.slice(chars.length));
}
function looksCharacterAlignedPitch(levels, chars) {
  if (levels.length > splitMorae(chars.join("")).length + 1) return true;
  if (levels.length < chars.length) return false;
  return chars.some((char, index) => index > 0 && SMALL_KANA.has(char) && levels[index] === levels[index - 1]);
}
function getPitchClass(pitchAccent, reading) {
  const pattern = contextPitchPattern(pitchAccent, reading);
  return pattern ? pitchClassNameForPattern(pattern, reading) : "";
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
function icuWordSegments(text2, locale) {
  const segmenter = wordSegmenter(locale);
  if (!segmenter) return null;
  const segments = [];
  for (const segment of segmenter.segment(text2)) {
  if (!segment.isWordLike) continue;
  segments.push({
    text: segment.segment,
    start: segment.index,
    end: segment.index + segment.segment.length
  });
  }
  return segments;
}
const PITCH_CLASSES$1 = /* @__PURE__ */ new Set(["heiban", "atamadaka", "nakadaka", "odaka"]);
function tiledPitchComponents(card) {
  if (getPitchClass(card.pitchAccent, card.reading || card.spelling)) return null;
  const components2 = card.pitchComponents ?? [];
  if (components2.length < 2) return null;
  if (compact(components2.map((component) => component.spelling).join("")) !== compact(card.spelling)) return null;
  if (card.reading && compact(components2.map((component) => component.reading).join("")) !== compact(card.reading)) return null;
  return components2.map((component) => ({
  ...component,
  pitchClass: getPitchClass(component.pitchAccent, component.reading || component.spelling)
  }));
}
function pitchComponentUnderlineGradient(card) {
  const components2 = tiledPitchComponents(card);
  if (!components2) return "";
  if (!components2.some((component) => PITCH_CLASSES$1.has(component.pitchClass))) return "";
  const lengths = components2.map((component) => Array.from(component.spelling).length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return "";
  let offset = 0;
  const stops = [];
  components2.forEach((component, index) => {
  const start = offset / total * 100;
  offset += lengths[index] ?? 0;
  const end = offset / total * 100;
  const color = PITCH_CLASSES$1.has(component.pitchClass) ? `var(--jpdb-reader-pitch-${component.pitchClass})` : "var(--jpdb-reader-pitch-unknown)";
  stops.push(`${color} ${formatPercent(start)}`, `${color} ${formatPercent(end)}`);
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
function compact(value) {
  return value.replace(/\s+/g, "").trim();
}
function formatPercent(value) {
  return `${Number(value.toFixed(3))}%`;
}
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
const RTL_SCRIPTS$1 = /* @__PURE__ */ new Set([
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
  if (script && RTL_SCRIPTS$1.has(script)) return "rtl";
  return RTL_LANGUAGES.has(locale.language) ? "rtl" : "ltr";
  } catch {
  return RTL_LANGUAGES.has(canonical.split("-")[0]?.toLowerCase() ?? "") ? "rtl" : "ltr";
  }
}
const JAPANESE_TEXT_RE$1 = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;
function cardHighlightTargets(card) {
  const spelling = cleanCardHighlightValue(card.spelling);
  const reading = optionalJapaneseCardReading(card);
  return uniqueCardHighlightValues([spelling, reading]);
}
function normalizedJapaneseCardReading(spelling, reading) {
  const cleanSpelling = cleanCardHighlightValue(spelling);
  const cleanReading = cleanCardHighlightValue(reading);
  return cleanReading && JAPANESE_TEXT_RE$1.test(cleanReading) ? cleanReading : cleanSpelling;
}
function cleanCardHighlightValue(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function compactCardHighlightValue(value) {
  return cleanCardHighlightValue(value).replace(/\s+/g, "");
}
function optionalJapaneseCardReading(card) {
  const spelling = cleanCardHighlightValue(card.spelling);
  const reading = normalizedJapaneseCardReading(spelling, card.reading);
  return reading && reading !== spelling ? reading : "";
}
function uniqueCardHighlightValues(values) {
  const seen = /* @__PURE__ */ new Set();
  return values.map(cleanCardHighlightValue).filter((value) => {
  if (!value || seen.has(value)) return false;
  seen.add(value);
  return true;
  });
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
function codePointBoundaryAtOrBefore(text2, offset) {
  const clamped = Math.max(0, Math.min(offset, text2.length));
  if (clamped > 0 && clamped < text2.length && isLowSurrogate(text2.charCodeAt(clamped)) && isHighSurrogate(text2.charCodeAt(clamped - 1))) {
  return clamped - 1;
  }
  return clamped;
}
function codePointSafePrefix(text2, maxUtf16Units) {
  return text2.slice(0, codePointBoundaryAtOrBefore(text2, maxUtf16Units));
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
const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first2, second) => second.length - first2.length);
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
function normalizeFallbackTerm(text2) {
  return codePointSafePrefix(text2.replace(/\s+/g, " ").trim(), 80);
}
let cachedSegmenterConstructor;
let cachedJapaneseWordSegmenter;
function segmentJapaneseText(text2) {
  const segmenter = japaneseWordSegmenter();
  if (!segmenter) {
  return Array.from(text2.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap((match) => {
    const start = match.index ?? 0;
    return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(match[0], start), text2);
  });
  }
  return Array.from(text2.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap((match) => {
  const start = match.index ?? 0;
  return segmentJapaneseRun(match[0], start, segmenter, text2);
  });
}
function segmentJapaneseRun(text2, offset, segmenter, sourceText) {
  const segments = Array.from(segmenter.segment(text2)).filter(isUsefulJapaneseSegment).map((segment) => ({
  surface: segment.segment,
  start: offset + segment.index,
  end: offset + segment.index + segment.segment.length
  }));
  if (segments.at(-1)?.end !== offset + text2.length) {
  return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(text2, offset), sourceText);
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
  const first2 = segments[index];
  if (!KATAKANA_SEGMENT_RE.test(first2.surface)) {
    merged.push(first2);
    index += 1;
    continue;
  }
  let surface = first2.surface;
  let runEnd = index + 1;
  while (runEnd < segments.length && KATAKANA_SEGMENT_RE.test(segments[runEnd].surface) && segments[runEnd].start === segments[runEnd - 1].end) {
    surface += segments[runEnd].surface;
    runEnd += 1;
  }
  merged.push(runEnd - index > 1 ? { surface, start: first2.start, end: segments[runEnd - 1].end } : first2);
  index = runEnd;
  }
  return merged;
}
function contiguousKanaMergeSpanAt(segments, startIndex) {
  const first2 = segments[startIndex];
  if (!first2 || !isPureKanaSegment(first2.surface)) return null;
  const previous = segments[startIndex - 1];
  const canStartKanaWord = !previous || previous.end !== first2.start || KANA_GRAMMAR_BOUNDARY_SEGMENTS.has(previous.surface);
  if (KANA_GRAMMAR_BOUNDARY_SEGMENTS.has(first2.surface) && !canStartKanaWord) return null;
  if (isKanaContentWordSpan(first2.surface)) return null;
  const runEnd = contiguousKanaRunEnd(segments, startIndex);
  if (runEnd - startIndex < 2) return null;
  let surface = first2.surface;
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
  segment: { surface, start: first2.start, end: segments[lastIndex].end },
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
  const first2 = Array.from(segment.surface)[0] ?? "";
  if (!first2 || first2 === segment.surface || !NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(first2)) return [segment];
  if (!numericRangeImmediatelyBefore(sourceText, segment.start)) return [segment];
  const second = Array.from(segment.surface)[1] ?? "";
  if (second === "間") return [segment];
  return [
  { surface: first2, start: segment.start, end: segment.start + first2.length },
  { surface: segment.surface.slice(first2.length), start: segment.start + first2.length, end: segment.end }
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
  const first2 = segments[startIndex];
  if (!first2 || isBoundarySegment(first2.surface)) return null;
  let surface = "";
  let best = null;
  for (let index = startIndex; index < fallbackInflectionScanEnd(segments, startIndex); index += 1) {
  const current = nextInflectedFallbackSegment(segments, index, startIndex, first2, surface, sourceText);
  if (!current) break;
  surface += current.surface;
  if (surface.length > FALLBACK_INFLECTION_MAX_LENGTH) break;
  best = inflectedFallbackCandidateAt(segments, startIndex, index, first2, current, surface) ?? best;
  }
  return best;
}
function fallbackInflectionScanEnd(segments, startIndex) {
  return Math.min(segments.length, startIndex + FALLBACK_INFLECTION_MAX_SEGMENTS);
}
function nextInflectedFallbackSegment(segments, index, startIndex, first2, surface, sourceText) {
  const current = segments[index];
  if (!current || !isContiguousFallbackSegment(segments, index, startIndex, first2)) return null;
  if (index > startIndex && isNumericCounterFallbackStem(first2, sourceText)) return null;
  const politeNegativePast = index > startIndex && isPoliteNegativePastContinuation(segments, index, surface);
  if (index > startIndex && isBoundarySegment(current.surface) && !politeNegativePast) return null;
  if (index > startIndex && !politeNegativePast && !canContinueInflectedFallbackSpan(surface, current.surface)) return null;
  return current;
}
function isPoliteNegativePastContinuation(segments, index, surface) {
  return surface.endsWith("ません") && segments[index]?.surface === "で" && segments[index + 1]?.surface === "した";
}
function isContiguousFallbackSegment(segments, index, startIndex, first2) {
  const expectedStart = index === startIndex ? first2.start : segments[index - 1]?.end;
  return segments[index]?.start === expectedStart;
}
function inflectedFallbackCandidateAt(segments, startIndex, index, first2, current, surface) {
  if (index === startIndex) return null;
  const lookupTerms = fallbackLookupTermsForText(surface);
  if (lookupTerms.length <= 1) return null;
  if (shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms)) return null;
  return {
  segment: { surface, start: first2.start, end: current.end },
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
  const first2 = segments[startIndex]?.surface ?? "";
  if (!first2 || !SURU_STEM_SEGMENT_RE.test(first2)) return false;
  const suffix = surface.slice(first2.length);
  if (!SURU_AUXILIARY_SUFFIX_RE.test(suffix)) return false;
  if (hasSingleKanjiGodanSAlternative(first2, lookupTerms)) return false;
  return true;
}
function hasSingleKanjiGodanSAlternative(first2, lookupTerms) {
  return SINGLE_KANJI_SEGMENT_RE.test(first2) && lookupTerms.some((term) => term === `${first2}す`);
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
function fallbackJapaneseRunSegment(text2, offset) {
  const surface = text2.trim();
  if (!surface || !JAPANESE_CHARACTER_RE.test(surface)) return [];
  const start = offset + text2.indexOf(surface);
  return [{ surface, start, end: start + surface.length }];
}
function fallbackLookupTermsForText(text2) {
  const source = normalizeFallbackTerm(text2);
  if (!source) return [];
  const terms = deinflectJapaneseTerm(source).filter(isUsefulFallbackLookupCandidate).sort(compareFallbackLookupCandidates).map((candidate) => normalizeFallbackTerm(candidate.term)).filter(Boolean);
  return uniqueNonEmptyStrings$1([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
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
function normalizeGenericLookupText(text2) {
  return text2.split(/([\u0e33\u0eb3])/u).map((part) => part === "ำ" || part === "ຳ" ? part : part.normalize("NFKC")).join("").replace(/\s+/gu, " ").trim();
}
function genericLookupTextVariants(text2) {
  const source = text2.replace(/\s+/gu, " ").trim();
  return [...new Set([normalizeGenericLookupText(source), source].filter(Boolean))];
}
const LOOKUP_CANDIDATE_LIMIT = 12;
function boundedLookupCandidates(text2, language, normalizeText, rewrites) {
  const surface = normalizeText(text2);
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
  for (const legacySurface of genericLookupTextVariants(text2).slice(1)) {
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
function localeLowerCase(text2, language) {
  try {
  return text2.toLocaleLowerCase(language);
  } catch {
  return text2.toLowerCase();
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
const SUPPORTED_LANGUAGE_PROFILE_SCHEMA_VERSIONS = [1, 2];
function isSupportedLanguageProfileSchemaVersion(value) {
  return SUPPORTED_LANGUAGE_PROFILE_SCHEMA_VERSIONS.includes(value);
}
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
  const segment = spec.segment ?? ((text2) => defaultSegment(text2, language));
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
  isLookupableText(text2) {
    return Boolean(text2) && detects(text2);
  },
  segment,
  pointerWordSegments: spec.pointerWordSegments ?? segment,
  lookupCandidates: spec.lookupCandidates ?? ((text2) => boundedLookupCandidates(text2, language, normalizeText, spec.lookupRewrites ?? [])),
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
  if (value instanceof RegExp) return (text2) => value.test(text2);
  return () => false;
}
function defaultNormalizeText(text2) {
  return normalizeGenericLookupText(text2);
}
function defaultSegment(text2, language) {
  return icuWordSegments(text2, language) ?? whitespaceSegments(text2);
}
function whitespaceSegments(text2) {
  const segments = [];
  const pattern = /\S+/gu;
  let match = pattern.exec(text2);
  while (match) {
  segments.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  match = pattern.exec(text2);
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
  segment(text2) {
  return segmentJapaneseText(text2).map((segment) => ({
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
function normalizeJapaneseTargetText(text2) {
  return normalizeFallbackTerm(text2.normalize("NFKC"));
}
function japanesePointerWordSegments(text2) {
  return [...text2.matchAll(JAPANESE_POINTER_WORD_RE)].map((match) => ({
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
  (text2, [name, value]) => text2.replaceAll(`{${name}}`, isolate(String(value))),
  message
  );
}
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
Object.freeze([
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
const PROFILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
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
function normalizeLanguageProfiles(value, activeProfileId, defaults = {}) {
  const rawProfiles = Array.isArray(value) ? value : [];
  const profiles = [];
  const usedIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < rawProfiles.length; index += 1) {
  const profile = normalizeLanguageProfile(rawProfiles[index], index, defaults);
  if (!profile) continue;
  profile.id = uniqueProfileId(profile.id, usedIds);
  usedIds.add(profile.id);
  profiles.push(profile);
  }
  if (!profiles.length) profiles.push(createDefaultLanguageProfile(defaults));
  const requestedActiveId = typeof activeProfileId === "string" ? activeProfileId.trim() : "";
  const active = profiles.find((profile) => profile.id === requestedActiveId) ?? profiles[0];
  return {
  profiles,
  activeProfileId: active.id
  };
}
function outputLanguageFields(outputLanguage) {
  return { outputLanguage, learnerLanguage: outputLanguage };
}
function activeLanguageProfile(profiles, activeProfileId) {
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
}
function resolveLanguageProfile(value) {
  if (isRecord$1(value) && isSupportedLanguageProfileSchemaVersion(value.schemaVersion)) {
  const normalized2 = normalizeLanguageProfiles([value], value.id, {
    outputLanguage: readOutputLanguageField(value),
    uiLocale: value.uiLocale,
    parserProvider: value.parserProvider
  });
  return normalized2.profiles[0];
  }
  const source = isRecord$1(value) ? value : {};
  const normalized = normalizeLanguageProfiles(
  source.languageProfiles,
  source.activeLanguageProfileId,
  {
    outputLanguage: readOutputLanguageField(source),
    uiLocale: source.interfaceLanguage,
    parserProvider: source.parserProvider
  }
  );
  return activeLanguageProfile(normalized.profiles, normalized.activeProfileId) ?? createDefaultLanguageProfile();
}
function normalizeLanguageProfile(value, index, defaults) {
  if (!isRecord$1(value)) return null;
  if (!isSupportedLanguageProfileSchemaVersion(value.schemaVersion)) return null;
  return {
  schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
  id: normalizeProfileId(value.id, index),
  ...outputLanguageFields(normalizeSlice1LearnerLanguage(
    readOutputLanguageField(value),
    normalizeSlice1LearnerLanguage(readOutputLanguageField(defaults))
  )),
  // A stored target survives only while core still has a module for it;
  // anything else degrades to the default rather than leaving the reader
  // pointed at a target nothing implements.
  targetLanguage: normalizeLearningTargetLanguage(value.targetLanguage ?? defaults.targetLanguage),
  uiLocale: normalizeUiLocale(value.uiLocale, normalizeUiLocale(defaults.uiLocale, "en")),
  parserProvider: normalizeParserProvider(value.parserProvider, normalizeParserProvider(defaults.parserProvider, "local")),
  dictionaries: normalizeProfileDictionaries(value.dictionaries),
  definitionTranslationProviderIds: normalizeStringIds(value.definitionTranslationProviderIds)
  };
}
function normalizeProfileId(value, index) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return PROFILE_ID_RE.test(candidate) ? candidate : `profile-${index + 1}`;
}
function uniqueProfileId(candidate, used) {
  if (!used.has(candidate)) return candidate;
  let suffix = 2;
  while (used.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}
function normalizeUiLocale(value, fallback) {
  if (value === "auto") return "auto";
  return canonicalLanguageTag(value) ?? fallback;
}
function normalizeParserProvider(value, fallback) {
  return PARSER_PROVIDERS.has(value) ? value : fallback;
}
function normalizeProfileDictionaries(value) {
  if (!isRecord$1(value)) return emptyProfileDictionaries();
  const enabled = normalizeStringIds(value.enabled);
  const order = normalizeStringIds(value.order);
  const installed = normalizeStringIds([
  ...normalizeStringIds(value.installed),
  ...enabled,
  ...order
  ]);
  const installedSet = new Set(installed);
  return {
  installed,
  enabled: enabled.filter((id) => installedSet.has(id)),
  order: [
    ...order.filter((id) => installedSet.has(id)),
    ...installed.filter((id) => !order.includes(id))
  ]
  };
}
function emptyProfileDictionaries() {
  return { installed: [], enabled: [], order: [] };
}
function normalizeStringIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of value) {
  if (typeof item !== "string") continue;
  const id = item.trim();
  if (!id || id.length > 160 || seen.has(id)) continue;
  seen.add(id);
  result.push(id);
  }
  return result;
}
function isRecord$1(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function outputLanguageOf(value) {
  return resolveLanguageProfile(value).outputLanguage;
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
const JA_GRAMMAR_RULE_COPY_URL = `${DOCS_BASE_URL}data/ja-grammar-rule-copy.json`;
let jaGrammarRuleCopyPromise;
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
function formatUiText(language, key, values) {
  const message = uiText(language, key);
  return isRtlInterface(language) ? formatIsolated(message, values) : Object.entries(values).reduce(
  (text2, [name, value]) => text2.replaceAll(`{${name}}`, String(value)),
  message
  );
}
async function loadJaGrammarRuleCopy() {
  jaGrammarRuleCopyPromise ??= requestJson$2(JA_GRAMMAR_RULE_COPY_URL, {
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
const IMMERSION_KIT_SEARCH_URL_TEMPLATE = "https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1";
const NADESHIKO_SEARCH_URL_TEMPLATE = "https://nadeshiko.co/search/{query}";
const EXTERNAL_EXAMPLE_SEARCHES = [
  { id: "immersion-kit", label: "Immersion Kit", urlTemplate: IMMERSION_KIT_SEARCH_URL_TEMPLATE },
  { id: "nadeshiko", label: "Nadeshiko", urlTemplate: NADESHIKO_SEARCH_URL_TEMPLATE }
];
function renderImmersionSearchLinksHtml(query, language) {
  const links = externalExampleSearchLinks(query);
  if (!links.length) return "";
  return `
        <div class="jpdb-reader-immersion-search-links" aria-label="${escapeHtml(uiText(language, "exampleSearchLinks"))}">
            ${links.map((link) => renderExternalExampleSearchLink(link, language)).join("")}
        </div>
    `;
}
function externalExampleSearchLinks(query) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  return EXTERNAL_EXAMPLE_SEARCHES.map((search) => ({
  id: search.id,
  label: search.label,
  url: search.urlTemplate.replace("{query}", encodeURIComponent(normalizedQuery))
  }));
}
function renderExternalExampleSearchLink(link, language) {
  const label = formatUiText(language, "viewOnLookup", { label: link.label });
  return `<a class="jpdb-reader-immersion-search-link" data-immersion-search-source="${link.id}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(label)} ${externalLinkIcon()}</a>`;
}
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
const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status", "hover"]);
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
function effectiveLegacyAutoFuriganaMode() {
  return "all";
}
new Set(FURIGANA_HIDE_STATE_GROUPS);
function effectiveFuriganaMode(settings) {
  if (!settings.showFurigana || settings.furiganaMode === "off") return "off";
  if (isExplicitFuriganaMode(settings.furiganaMode)) return settings.furiganaMode;
  return effectiveLegacyAutoFuriganaMode();
}
function isExplicitFuriganaMode(value) {
  return EXPLICIT_FURIGANA_MODES.has(value);
}
const EASY_FURIGANA_KANJI = new Set(
  "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
);
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
function renderHighlightedTextHtml(text2, targets2, className) {
  const needles = uniqueNonEmptyStrings(targets2).sort((a, b) => b.length - a.length);
  if (!text2 || !needles.length) return escapeHtml(text2);
  return renderHighlightChunks(text2, needles, className);
}
function renderHighlightChunks(text2, needles, className) {
  let html = "";
  let offset = 0;
  while (offset < text2.length) {
  const match = nextHighlightMatch(text2, needles, offset);
  if (!match) break;
  html += renderHighlightChunk(text2, className, offset, match);
  offset = match.index + match.needle.length;
  }
  if (offset < text2.length) html += escapeHtml(text2.slice(offset));
  return html;
}
function renderHighlightChunk(text2, className, offset, match) {
  const prefix = match.index > offset ? escapeHtml(text2.slice(offset, match.index)) : "";
  const marked = text2.slice(match.index, match.index + match.needle.length);
  return `${prefix}<mark class="${escapeHtml(className)}">${escapeHtml(marked)}</mark>`;
}
function nextHighlightMatch(text2, needles, offset) {
  let best = null;
  for (const needle of needles) {
  best = betterHighlightMatch(best, highlightMatchForNeedle(text2, needle, offset));
  }
  return best;
}
function highlightMatchForNeedle(text2, needle, offset) {
  const index = text2.indexOf(needle, offset);
  return index < 0 ? null : { index, needle };
}
function betterHighlightMatch(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return isBetterHighlightMatch(candidate, current) ? candidate : current;
}
function isBetterHighlightMatch(candidate, current) {
  return candidate.index < current.index || candidate.index === current.index && candidate.needle.length > current.needle.length;
}
function uniqueNonEmptyStrings(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function nonOverlappingTokens(tokens, text2) {
  const safe = [];
  let offset = 0;
  for (const token of tokens) {
  if (!isSafeTokenSpan(token, offset, text2)) continue;
  safe.push(token);
  offset = token.end;
  }
  return safe;
}
function isSafeTokenSpan(token, offset, text2) {
  if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < offset || token.start < 0 || token.end <= token.start || token.end > text2.length) return false;
  return HAS_JAPANESE_LETTER.test(text2.slice(token.start, token.end));
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
  if (settings.showPitchAccent) classes.push(`jpdb-pitch-${tokenPitchClass(token)}`);
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
function tokenPitchClass(token) {
  return isParticleCard(token.card) ? "particle" : safePitchClass(token.pitchClass);
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
  if (!KANJI_RE.test(visibleSurface) || !READING_KANA_ONLY_RE.test(baseReading) || baseReading === baseSpelling) return [];
  for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
  if (!baseReading.endsWith(spellingSuffix)) continue;
  const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
  if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
  const surfaceSuffix = visibleSurface.slice(spellingStem.length);
  if (surfaceSuffix && !READING_KANA_ONLY_RE.test(surfaceSuffix)) continue;
  const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
  if (rubies.length) return rubies;
  }
  if (visibleSurface.startsWith(baseSpelling) && !READING_KANA_CHAR_RE.test(baseSpelling)) {
  const surfaceSuffix = visibleSurface.slice(baseSpelling.length);
  if (!surfaceSuffix || READING_KANA_ONLY_RE.test(surfaceSuffix)) {
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
  if (suffix && READING_KANA_ONLY_RE.test(suffix)) suffixes.push(suffix);
  }
  return suffixes.sort((first2, second) => second.length - first2.length);
}
function stemRubiesForInflectedSurface(surfaceStem, readingStem) {
  const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
  if (!trimmed.surface || !trimmed.reading) return [];
  if (!KANJI_RE.test(trimmed.surface) || !READING_KANA_ONLY_RE.test(trimmed.reading)) return [];
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
function sameKanaCharacter(first2, second) {
  return Boolean(first2 && second && first2 === second && READING_KANA_ONLY_RE.test(first2));
}
function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
  const sources = sourceTokenRubies(surface, token);
  if (preserveTokenRubies) {
  return sources.flatMap((ruby) => {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];
    const base = surface.slice(range.start, range.end);
    if (!KANJI_RE.test(base)) return [];
    if (!READING_KANA_CHAR_RE.test(base)) return [ruby];
    const parts = kanjiOnlyRubySegments(surface, token, ruby);
    return parts.length ? parts : [ruby];
  });
  }
  return sources.flatMap((ruby) => kanjiOnlyRubySegments(surface, token, ruby));
}
function sourceTokenRubies(surface, token) {
  if (token.rubies.length) return token.rubies;
  const reading = token.card.reading.trim();
  if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !READING_KANA_ONLY_RE.test(reading)) return [];
  const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
  if (inferred.length) {
  return inferred.map((ruby) => ({
    ...ruby,
    start: token.start + ruby.start,
    end: token.start + ruby.end
  }));
  }
  if (surface.trim() !== token.card.spelling.trim()) return [];
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
  if (!READING_KANA_ONLY_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];
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
  if (!READING_KANA_ONLY_RE.test(reading) || !READING_KANA_CHAR_RE.test(base)) return null;
  const chars = Array.from(base);
  const first2 = chars.findIndex((char) => KANJI_RE.test(char));
  if (first2 < 0) return null;
  let last = -1;
  for (let index = chars.length - 1; index >= first2; index -= 1) {
  if (KANJI_RE.test(chars[index])) {
    last = index;
    break;
  }
  }
  if (last < first2 || first2 === 0 && last === chars.length - 1) return null;
  return { start: first2, end: last + 1 };
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
function readingRunOccurrences(reading, text2, offset) {
  const occurrences = [];
  let index = reading.indexOf(text2, offset);
  while (index >= 0) {
  occurrences.push(index);
  index = reading.indexOf(text2, index + 1);
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
  const isKana = index < base.length && READING_KANA_CHAR_RE.test(base[index]);
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
function cardStateProvenance(card) {
  return card.provisionalState === true ? "provisional" : "authoritative";
}
function isTargetLanguageText(text2) {
  return activeLearningTarget().isLookupableText(text2);
}
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
const READABLE_IGNORED_TAGS = /* @__PURE__ */ new Set(["RT", "RP", "SCRIPT", "STYLE"]);
function readerWordSurfaceText(element) {
  const surface = readerWordChildSurfaceText(element);
  return surface || element.getAttribute("data-surface") || "";
}
function readerWordChildSurfaceText(element) {
  let text2 = "";
  element.childNodes.forEach((node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    text2 += node.textContent ?? "";
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const child = node;
  if (isSurfaceIgnoredElement(child)) return;
  text2 += readerWordChildSurfaceText(child);
  });
  return text2;
}
function isSurfaceIgnoredElement(element) {
  return READABLE_IGNORED_TAGS.has(element.tagName) || element.matches("[data-jpdb-reader-surface-ignore],.jpdb-reader-furi,.jpdb-ocr-furi");
}
new Set(
  "ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(",")
);
const TRAILING_DIGITS_RE = /[0-9０-９]+$/u;
const NUMBER_BIND_CLASS = "jpdb-reader-number-bind";
new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
selectorPairs("control,toggle,player", ["class"]);
new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
function renderTokensToHtml(text2, tokens, settings) {
  let html = "";
  let offset = 0;
  const safeTokens = nonOverlappingTokens(tokens, text2);
  const miningInsightKeys = miningInsightTokenKeys(safeTokens);
  for (const token of safeTokens) {
  if (token.start > offset) html += plainTextBeforeTokenHtml(text2.slice(offset, token.start));
  html += renderTokenHtml(text2.slice(token.start, token.end), token, settings, miningInsightKeys);
  offset = token.end;
  }
  if (offset < text2.length) html += escapeHtml(text2.slice(offset));
  return html;
}
function plainTextBeforeTokenHtml(gap) {
  const digits = TRAILING_DIGITS_RE.exec(gap)?.[0];
  if (!digits) return escapeHtml(gap);
  const prefix = gap.slice(0, gap.length - digits.length);
  return `${escapeHtml(prefix)}<span class="${NUMBER_BIND_CLASS}">${escapeHtml(digits)}</span>`;
}
function renderTokenHtml(surface, token, settings, miningInsightKeys) {
  const state = primaryCardState(token.card.cardState);
  const hasRuby = shouldRenderRuby(surface, token, settings);
  const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
  const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
  const pitchClass = settings.showPitchAccent ? tokenPitchClass(token) : "";
  const classes = [
  readerWordClassName(state, token, settings),
  hasRuby ? "jpdb-reader-has-furi" : "",
  hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
  ].filter(Boolean).join(" ");
  const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
  const cardId = ` data-card-id="${readerCardId(token.card)}"`;
  const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
  const cardState = ` data-card-state="${escapeHtml(state)}" data-state-provenance="${cardStateProvenance(token.card)}"`;
  const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
  const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
  const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : "";
  const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : "";
  const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : "";
  const pitchAccent = token.card.pitchAccent.join("|");
  const pitchClassAttr = pitchClass ? ` data-pitch-class="${pitchClass}"` : "";
  const lookupMetadata = settings.showPitchAccent && pitchAccent && pitchClass !== "particle" ? ` data-pitch-accent="${escapeHtml(pitchAccent)}"` : "";
  const pitchComponentGradient = settings.showPitchAccent ? pitchComponentUnderlineGradient(token.card) : "";
  const pitchComponentMetadata = pitchComponentGradient ? ` data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${escapeHtml(pitchComponentGradient)}"` : "";
  const deck = renderDeckMembershipAttributes(token.card);
  return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr}${pitchClassAttr}${pitchComponentMetadata} data-sentence="${escapeHtml(token.sentence ?? "")}"${miningInsight}${expression}${reading}${lookupMetadata}${deck} tabindex="-1">${content}</span>`;
}
function renderDeckMembershipAttributes(card) {
  const membership = cardDeckMembership(card);
  if (!membership.member) return "";
  const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(", "))}"` : "";
  return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
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
function isKanjiCharacter$1(value) {
  return isUnifiedIdeograph(value);
}
const MAX_VISIBLE_KANJI_KEYWORDS = 5;
function renderKanjiKeywordChips(sources, language) {
  const keywords = /* @__PURE__ */ new Map();
  for (const { text: text2, label, canonical } of sources) {
  const normalized = text2?.trim();
  if (!normalized) continue;
  const key = normalized.toLocaleLowerCase();
  const existing = keywords.get(key) ?? { text: normalized, labels: [], canonical: false };
  if (!existing.labels.includes(label)) existing.labels.push(label);
  existing.canonical ||= Boolean(canonical);
  keywords.set(key, existing);
  }
  const all = Array.from(keywords.values());
  const shown = all.slice(0, MAX_VISIBLE_KANJI_KEYWORDS);
  const overflow = all.slice(MAX_VISIBLE_KANJI_KEYWORDS);
  const chips = shown.map((keyword) => renderKanjiKeywordChip(keyword)).join("") + renderKanjiKeywordOverflowChip(overflow);
  return chips ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>` : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, "kanjiDetailsUnavailable"))}</div>`;
}
function renderKanjiKeywordChip(keyword) {
  return `<span class="jpdb-reader-kanji-keyword"${keyword.canonical ? ' data-canonical=""' : ""} title="${escapeHtml(keyword.labels.join(" · "))}"><small class="jpdb-reader-kanji-keyword-source">${escapeHtml(keyword.labels.join("/"))}</small><span class="jpdb-reader-kanji-keyword-text">${escapeHtml(keyword.text)}</span></span>`;
}
function renderKanjiKeywordOverflowChip(overflow) {
  if (!overflow.length) return "";
  return `<span class="jpdb-reader-kanji-keyword jpdb-reader-kanji-keyword-more" title="${escapeHtml(overflow.map((keyword) => keyword.text).join(" · "))}">+${overflow.length}</span>`;
}
function sourceStateAttribute$1(sourceStateKey, initiallyExpanded) {
  return sourceStateKey ? `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}"` : "";
}
function buildRtkComponentSummaries(rtkInfo, jpdbInfo, entries2) {
  const elementKeywords = splitRtkElements(rtkInfo?.elements ?? "").filter((keyword) => rtkElementKey(keyword) !== rtkElementKey(rtkInfo?.keyword ?? ""));
  const jpdbByKanji = new Map((jpdbInfo?.components ?? []).map((component) => [component.kanji, component.keyword]));
  const localByKanji = new Map(entries2.map((entry) => [entry.character, entry.meanings.slice(0, 3).join(", ")]));
  const summaries = [.../* @__PURE__ */ new Set([...rtkInfo?.componentKanji ?? [], ...jpdbInfo?.components.map((component) => component.kanji) ?? []])].filter(isKanjiCharacter$1).map((kanji, index) => ({
  kanji,
  keyword: jpdbByKanji.get(kanji) || elementKeywords[index] || "",
  meaning: localByKanji.get(kanji) || ""
  }));
  return summaries;
}
function renderKanjiKeywordLine(jpdbInfo, rtkInfo, entries2, language = "en", sourceInfo = null) {
  return renderKanjiKeywordChips([
  { text: jpdbInfo?.keyword, label: "JPDB", canonical: true },
  { text: rtkInfo?.keyword, label: "RTK" },
  { text: sourceInfo?.kanjiAliveKeyword, label: "Kanji Alive" },
  ...entries2.flatMap((entry) => entry.meanings).filter(Boolean).slice(0, 3).map((meaning) => ({ text: meaning, label: uiText(language, "dict") }))
  ], language);
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
    <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-rtk" ${sourceStateAttribute$1(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
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
function decodeEntities(value) {
  return value.replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi, (entity) => {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${entity}`, "text/html");
  return parsed.body.textContent || entity;
  });
}
function canonicalUchisenUrl(value) {
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) {
  if (url.startsWith("/")) url = `https://ik.imagekit.io/uchisen${url}`;
  else if (url.startsWith("generated_")) url = `https://ik.imagekit.io/uchisen/generated/saved/${url}`;
  else url = `https://ik.imagekit.io/uchisen/${url}`;
  }
  try {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.origin}${parsed.pathname}`;
  } catch {
  return url.replace(/\/{2,}/g, "/").split(/[?#]/)[0];
  }
}
const UCHISEN_PAYWALL_STORY_RE = /\bplease\s+subscribe\s+to\s+uchisen\s*pro\b/i;
const UCHISEN_PAYWALL_IMAGE_RE = /(?:^|\/)(?:kanji\/)?enrollment\.(?:png|jpe?g|webp)$/i;
function orderedUchisenImages(images) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = images.filter((item) => {
  const key = uchisenImageDedupeKey(item);
  if (!item.url || seen.has(key)) return false;
  seen.add(key);
  return true;
  });
  return [
  ...deduped.filter((item) => !item.paywall),
  ...deduped.filter((item) => item.paywall)
  ].map(({ url, story }) => ({ url, story }));
}
function uchisenImageDedupeKey(item) {
  return item.paywall && isUchisenPaywallImage(item.url) ? "paywall:enrollment" : `url:${item.url}`;
}
function isUchisenPaywallImage(url) {
  try {
  return UCHISEN_PAYWALL_IMAGE_RE.test(new URL(url).pathname);
  } catch {
  return UCHISEN_PAYWALL_IMAGE_RE.test(url.split(/[?#]/)[0]);
  }
}
function isUchisenPaywallStory(story) {
  return UCHISEN_PAYWALL_STORY_RE.test(cleanText$1(story));
}
function readBlobAsDataUrl(blob, errorMessage = "Could not read media.") {
  return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
  reader.readAsDataURL(blob);
  });
}
const JPDB_HOST_RE = /(^|\.)jpdb\.io$/i;
const AUDIO_EXTENSION_TYPES = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  webm: "audio/webm"
};
const IMAGE_EXTENSION_TYPES = {
  apng: "image/apng",
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};
const PAGE_MEDIA_BLOB_LIMIT = 64;
const pageMediaBlobs = /* @__PURE__ */ new Map();
async function createPageMediaUrl(blob, sourceUrl = "") {
  const typed = withUsableMediaType(blob, sourceUrl);
  const url = shouldUseDataUrlForPageMedia() ? await readBlobAsDataUrl(typed) : URL.createObjectURL(typed);
  if (typed.type.startsWith("audio/")) registerPageMediaBlob(url, typed);
  return url;
}
function registerPageMediaBlob(url, blob) {
  pageMediaBlobs.delete(url);
  pageMediaBlobs.set(url, blob);
  while (pageMediaBlobs.size > PAGE_MEDIA_BLOB_LIMIT) {
  const oldest = pageMediaBlobs.keys().next().value;
  if (oldest === void 0) break;
  pageMediaBlobs.delete(oldest);
  }
}
function withUsableMediaType(blob, sourceUrl) {
  const type = (blob.type || "").toLowerCase();
  if (type && type !== "application/octet-stream" && type !== "binary/octet-stream") return blob;
  const extension = sourceUrl.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() ?? "";
  return new Blob([blob], { type: IMAGE_EXTENSION_TYPES[extension] ?? AUDIO_EXTENSION_TYPES[extension] ?? "audio/mpeg" });
}
function revokePageMediaUrl(url) {
  pageMediaBlobs.delete(url);
  if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
function shouldUseDataUrlForPageMedia() {
  if (typeof location === "undefined") return false;
  return JPDB_HOST_RE.test(location.hostname);
}
const imagePromptReplacementDefs = [
  [
  "\\bblood(y|ied|ing)?\\b",
  "red festival paint"
  ],
  [
  "\\bbleed(ing)?\\b",
  "red festival paint"
  ],
  [
  "\\bwounds?\\b",
  "patched cloth"
  ],
  [
  "\\binjur(y|ies|ed)?\\b",
  "tired mishap"
  ],
  [
  "\\bsick(ness)?\\b",
  "restful"
  ],
  [
  "\\bill(ness)?\\b",
  "restful"
  ],
  [
  "\\bmedicine\\b",
  "helpful bundle"
  ],
  [
  "\\bmedical\\b",
  "helpful"
  ],
  [
  "\\bdoctor\\b",
  "kind helper"
  ],
  [
  "\\bpatient\\b",
  "visitor"
  ],
  [
  "\\bdisease\\b",
  "gloomy cloud"
  ],
  [
  "\\bhospital\\b",
  "quiet rest house"
  ],
  [
  "\\bweapons?\\b",
  "ceremonial props"
  ],
  [
  "\\bswords?\\b",
  "ceremonial wooden practice sword"
  ],
  [
  "\\bknives?\\b",
  "small wooden craft tool"
  ],
  [
  "\\bdaggers?\\b",
  "small wooden craft tool"
  ],
  [
  "\\bblades?\\b",
  "shiny craft edge"
  ],
  [
  "\\bspears?\\b",
  "slender festival pole"
  ],
  [
  "\\barrows?\\b",
  "paper arrow charm"
  ],
  [
  "\\bguns?\\b",
  "toy popper"
  ],
  [
  "\\brifles?\\b",
  "toy popper"
  ],
  [
  "\\bcannons?\\b",
  "festival drum"
  ],
  [
  "\\bbombs?\\b",
  "round festival lantern"
  ],
  [
  "\\bdynamite\\b",
  "firecracker bundle"
  ],
  [
  "\\bexplos(ive|ion)s?\\b",
  "bursting confetti"
  ],
  [
  "\\bbattles?\\b",
  "festival contest"
  ],
  [
  "\\bfight(ing|s)?\\b",
  "tugging contest"
  ],
  [
  "\\bwars?\\b",
  "old tale"
  ],
  [
  "\\battack(s|ing)?\\b",
  "surprising pounce"
  ],
  [
  "\\bstab(s|bing|bed)?\\b",
  "poke"
  ],
  [
  "\\bkill(s|ing|ed)?\\b",
  "stop"
  ],
  [
  "\\bdead\\b",
  "still"
  ],
  [
  "\\bdeath\\b",
  "quiet ending"
  ],
  [
  "\\bcorpse\\b",
  "old puppet"
  ],
  [
  "\\bpoison\\b",
  "mysterious purple dye"
  ],
  [
  "\\bcriminals?\\b",
  "mischief maker"
  ],
  [
  "\\bcrimes?\\b",
  "mischief"
  ],
  [
  "\\bprison\\b",
  "locked toy box"
  ],
  [
  "\\bjail\\b",
  "locked toy box"
  ],
  [
  "\\bpunish(ment|ed|ing)?\\b",
  "scold"
  ],
  [
  "\\btorture\\b",
  "awkward training"
  ],
  [
  "\\bexecution\\b",
  "ceremony"
  ],
  [
  "\\bnoose\\b",
  "rope loop"
  ],
  [
  "\\bdemons?\\b",
  "festival mask"
  ],
  [
  "\\bdevils?\\b",
  "festival mask"
  ],
  [
  "\\bhell\\b",
  "smoky folk-tale cave"
  ],
  [
  "\\bghosts?\\b",
  "paper lantern spirit"
  ],
  [
  "\\bspirits?\\b",
  "paper lantern spirit"
  ],
  [
  "\\bskulls?\\b",
  "round white mask"
  ],
  [
  "\\bbones?\\b",
  "ivory-colored toy sticks"
  ]
];
const UCHISEN_INDEX_PREFIX = "yomu-jpdb-uchisen-index:";
async function installUchisenCarousel(container, kanji, images, options = {}) {
  let currentImages = images.slice();
  let currentComponentGroups = options.componentGroups ?? [];
  let currentKanjiKeyword = options.kanjiKeyword ?? null;
  let currentKanjiId = options.kanjiId ?? "";
  let canGenerateImages = Boolean(currentKanjiId && options.canGenerateImages);
  const storedIndex = await gmStorageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
  let index = preferredUchisenIndex(storedIndex, currentImages);
  if (!isValidUchisenIndex(index, currentImages)) index = 0;
  const proxyUrl = options.proxyUrl ?? "";
  const language = options.interfaceLanguage ?? "en";
  let generateOpen = false;
  let generateBusy = false;
  let generateStatus = null;
  let generateFields = defaultUchisenGenerateFields(kanji, currentKanjiKeyword, currentComponentGroups);
  let currentImageUrl = "";
  const cleanup = () => {
  if (!currentImageUrl) return;
  revokePageMediaUrl(currentImageUrl);
  currentImageUrl = "";
  };
  const render = () => {
  index = validUchisenRenderIndex(index, currentImages);
  const model = uchisenCarouselRenderModel(kanji, index, currentImages, {
    options,
    canGenerateImages,
    generateOpen,
    generateBusy,
    generateStatus,
    generateFields,
    currentComponentGroups,
    currentKanjiKeyword
  });
  setInnerHtml(container, renderUchisenCarouselHtml(model));
  attachRenderedUchisenImage(container, model.item, index, currentImages, proxyUrl, cleanup, (url) => {
    currentImageUrl = url;
  });
  };
  const syncGenerateFields = () => {
  generateFields = {
    mnemonic: container.querySelector('[data-uchisen-generate-field="mnemonic"]')?.value ?? generateFields.mnemonic,
    imagePrompt: container.querySelector('[data-uchisen-generate-field="imagePrompt"]')?.value ?? generateFields.imagePrompt
  };
  };
  const refreshAfterGenerate = async (result) => {
  const fresh = await options.refreshData?.().catch(() => null);
  if (fresh) {
    currentImages = fresh.images;
    currentComponentGroups = fresh.componentGroups;
    currentKanjiKeyword = fresh.kanjiKeyword;
    currentKanjiId = fresh.kanjiId || currentKanjiId;
    canGenerateImages = Boolean(currentKanjiId && fresh.canGenerateImages);
  } else {
    currentImages = orderedUchisenImages([
      ...currentImages.map((item) => ({ ...item, paywall: isUchisenPaywallItem(item) })),
      { url: result.imageUrl, story: result.story, paywall: false }
    ]);
  }
  const generatedIndex = findUchisenImageIndex(currentImages, result.imageUrl);
  index = generatedIndex >= 0 ? generatedIndex : Math.max(0, currentImages.length - 1);
  void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
  };
  const generateAndRefresh = async () => {
  if (!canStartUchisenGeneration(generateBusy, canGenerateImages, currentKanjiId)) return;
  syncGenerateFields();
  generateBusy = true;
  generateStatus = uchisenGenerateStatus("neutral", uiText(language, "uchisenGeneratingImage"));
  render();
  try {
    const result = await generateAndPublishUchisenMnemonic(kanji, {
      kanjiId: currentKanjiId,
      mnemonic: generateFields.mnemonic,
      imagePrompt: generateFields.imagePrompt
    }, proxyUrl, (message) => {
      generateStatus = uchisenGenerateStatus("neutral", message);
      render();
    }, language);
    await refreshAfterGenerate(result);
    generateStatus = uchisenGenerateStatus("success", uiText(language, "uchisenGeneratedImage"));
    generateOpen = false;
  } catch (error) {
    generateStatus = uchisenGenerateErrorStatus(error, language);
  } finally {
    generateBusy = false;
    render();
  }
  };
  const toggleGeneratePanel = () => {
  generateOpen = !generateOpen;
  generateStatus = uchisenGenerateToggleStatus(canGenerateImages, language);
  render();
  };
  const updateCarouselIndex = (nextIndex) => {
  index = nextIndex;
  void gmStorageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
  render();
  };
  const handleAction = (action) => {
  if (action === "generate-toggle") {
    toggleGeneratePanel();
    return;
  }
  if (action === "generate-submit") {
    void generateAndRefresh();
    return;
  }
  const nextIndex = nextUchisenCarouselIndex(action, index, currentImages.length);
  if (nextIndex !== null) updateCarouselIndex(nextIndex);
  };
  container.addEventListener("click", (event) => {
  const action = uchisenActionFromClick(event);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  handleAction(action);
  });
  container.addEventListener("input", (event) => {
  const field = event.target.closest("[data-uchisen-generate-field]");
  if (!field) return;
  syncGenerateFields();
  });
  render();
  return cleanup;
}
function validUchisenRenderIndex(index, images) {
  return isValidUchisenIndex(index, images) ? index : 0;
}
function canStartUchisenGeneration(generateBusy, canGenerateImages, kanjiId) {
  return !generateBusy && canGenerateImages && Boolean(kanjiId);
}
function uchisenGenerateStatus(tone, text2) {
  return { tone, text: text2 };
}
function uchisenGenerateErrorStatus(error, language) {
  return uchisenGenerateStatus("error", uchisenGenerateErrorMessage(error, language));
}
function uchisenGenerateErrorMessage(error, language) {
  if (error instanceof Error) {
  const message = error.message.trim();
  if (message) return message;
  }
  return uiText(language, "uchisenGenerateFailed");
}
function uchisenGenerateToggleStatus(canGenerateImages, language) {
  return canGenerateImages ? null : uchisenGenerateStatus("error", uiText(language, "uchisenLoginRequired"));
}
function uchisenActionFromClick(event) {
  return event.target.closest("[data-uchisen-action]")?.dataset.uchisenAction ?? "";
}
function nextUchisenCarouselIndex(action, currentIndex, total) {
  if (!total) return null;
  if (action === "previous") return (currentIndex - 1 + total) % total;
  if (action === "next") return (currentIndex + 1) % total;
  return null;
}
function uchisenCarouselRenderModel(kanji, index, images, inputs) {
  const total = images.length;
  const language = inputs.options.interfaceLanguage ?? "en";
  return {
  kanji,
  item: images[index] ?? null,
  index,
  total,
  language,
  canGenerateImages: inputs.canGenerateImages,
  generateOpen: inputs.generateOpen,
  generateBusy: inputs.generateBusy,
  generateStatus: inputs.generateStatus,
  generateFields: inputs.generateFields,
  componentGroups: inputs.currentComponentGroups,
  kanjiKeyword: inputs.currentKanjiKeyword,
  sourceAttributes: inputs.options.sourceAttributes ?? "open",
  detailsClass: inputs.options.detailsClass ?? "jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source",
  summaryClass: inputs.options.summaryClass ?? "jpdb-reader-local-head",
  bodyClass: inputs.options.bodyClass ?? "jpdb-reader-local-glossary yomu-jpdb-uchisen-body",
  summaryHtml: uchisenSummaryHtml(inputs.options, index, total),
  bodyMeta: uchisenBodyMetaHtml(inputs.options, index, total)
  };
}
function uchisenSummaryHtml(options, index, total) {
  return options.summaryHtml?.(total ? index + 1 : 0, total) ?? `
    <span class="yomu-jpdb-uchisen-summary-main">
        <span>Uchisen</span>
        <span class="yomu-jpdb-counter">${total ? `${index + 1}/${total}` : "0"}</span>
    </span>
  `;
}
function uchisenBodyMetaHtml(options, index, total) {
  return options.summaryHtml && total ? `<span class="yomu-jpdb-source-meta">${index + 1}/${total}</span>` : "";
}
function renderUchisenCarouselHtml(model) {
  return `
    <details class="${model.detailsClass}" ${model.sourceAttributes}>
        <summary class="${model.summaryClass}">
            ${model.summaryHtml}
        </summary>
        <div class="${model.bodyClass}">
            ${renderUchisenToolbar(model)}
            ${model.generateOpen ? renderUchisenGeneratePanel(model.generateFields, model.generateStatus, model.generateBusy, model.language) : ""}
            ${renderUchisenComponentGroups(model.kanjiKeyword, model.componentGroups, model.language)}
            ${renderUchisenImageOrEmpty(model)}
        </div>
    </details>
  `;
}
function renderUchisenToolbar(model) {
  return `
    <div class="yomu-jpdb-uchisen-toolbar">
        ${model.bodyMeta}
        ${renderUchisenLinkRow(model)}
        ${renderUchisenNavigationControls(model)}
    </div>
  `;
}
function renderUchisenLinkRow(model) {
  return `
    <span class="yomu-jpdb-uchisen-link-row">
        <a class="yomu-jpdb-uchisen-summary-link" href="https://uchisen.com/kanji/${encodeURIComponent(model.kanji)}" target="_blank" rel="noopener">${escapeHtml(uchisenExternalLinkLabel(model.language))} ${externalLinkIcon()}</a>
        ${model.canGenerateImages ? renderUchisenGenerateToggle(model) : ""}
    </span>
  `;
}
function renderUchisenGenerateToggle(model) {
  return `<button class="yomu-jpdb-uchisen-summary-link yomu-jpdb-uchisen-generate-link" type="button" data-uchisen-action="generate-toggle" aria-expanded="${model.generateOpen}" title="${escapeHtml(uiText(model.language, "generateUchisenImage"))}">${escapeHtml(uiText(model.language, "generateUchisenImageToggle"))}</button>`;
}
function renderUchisenNavigationControls(model) {
  if (!model.total) return "";
  const previousLabel = uiText(model.language, "previousExample");
  const nextLabel = uiText(model.language, "nextExample");
  return `<span class="yomu-jpdb-uchisen-summary-controls" role="toolbar" aria-label="${escapeHtml(uiText(model.language, "uchisenMnemonicImages"))}">
    <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">&lsaquo;</button>
    <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">&rsaquo;</button>
  </span>`;
}
function renderUchisenImageOrEmpty(model) {
  if (!model.item) return `<div class="jpdb-reader-help">${escapeHtml(uiText(model.language, "noUchisenImagesYet"))}</div>`;
  const story = model.item.story && model.item.story !== "No story available" ? model.item.story : uiText(model.language, "noStoryAvailable");
  const alt = formatUchisenTemplate(uiText(model.language, "uchisenMnemonicFor"), { kanji: model.kanji });
  return `<div class="yomu-jpdb-image-shell"><img alt="${escapeHtml(alt)}" data-uchisen-image src="${escapeHtml(model.item.url)}" loading="eager" decoding="async" referrerpolicy="no-referrer"></div>
    <div class="yomu-jpdb-story">${escapeHtml(story)}</div>`;
}
function attachRenderedUchisenImage(container, item, index, currentImages, proxyUrl, cleanup, setCurrentImageUrl) {
  const image = container.querySelector("[data-uchisen-image]");
  if (!image || !item) return;
  const srcUrl = item.url;
  let blobSettled = false;
  let directFailed = false;
  const removeBrokenDirectImage = () => {
  directFailed = true;
  if (blobSettled && image.isConnected) image.remove();
  };
  image.addEventListener("error", removeBrokenDirectImage);
  requestBlobUrl(srcUrl, 9e3, proxyUrl).then((url) => {
  if (!image.isConnected || currentImages[index]?.url !== srcUrl) {
    revokePageMediaUrl(url);
    return;
  }
  blobSettled = true;
  image.removeEventListener("error", removeBrokenDirectImage);
  cleanup();
  setCurrentImageUrl(url);
  image.addEventListener("error", () => {
    if (image.isConnected) image.remove();
  }, { once: true });
  image.src = url;
  }).catch(() => {
  if (!image.isConnected || currentImages[index]?.url !== srcUrl) return;
  blobSettled = true;
  if (directFailed) image.remove();
  else if (image.getAttribute("src") !== srcUrl) image.src = srcUrl;
  });
}
async function generateAndPublishUchisenMnemonic(kanji, request, proxyUrl = "", onStatus, language = "en") {
  const kanjiId = request.kanjiId.trim();
  const mnemonic = request.mnemonic.trim();
  const imagePrompt = request.imagePrompt.trim();
  const storyBackedPrompt = storyBackedUchisenImagePrompt(mnemonic, imagePrompt);
  const safeImagePrompt = safeUchisenImagePrompt(storyBackedPrompt);
  if (!kanjiId || !mnemonic || !imagePrompt) throw new Error("Missing Uchisen generation fields.");
  const referrer = `https://uchisen.com/kanji/${encodeURIComponent(kanji)}`;
  onStatus?.(uiText(language, "uchisenGeneratingImage"));
  const { generation, imagePrompt: publishedImagePrompt } = await generateUchisenImageWithRetry(
  kanjiId,
  imagePrompt,
  storyBackedPrompt,
  safeImagePrompt,
  referrer,
  proxyUrl
  );
  onStatus?.(uiText(language, "uchisenPublishingMnemonic"));
  await postUchisenForm("https://uchisen.com/save_mnemonic.php", {
  img_src: generation.imageFilename,
  kanji_id: kanjiId,
  formatted_mnemonic: formatUchisenMnemonicHtml(mnemonic),
  current_image_prompt: publishedImagePrompt,
  redirect: `/kanji/${encodeURIComponent(kanji)}`,
  mnemonic,
  image_prompt: publishedImagePrompt,
  start_blurred: "no"
  }, referrer, proxyUrl, "Uchisen mnemonic publish", 12e4);
  return {
  imageFilename: generation.imageFilename,
  imageUrl: generation.imageUrl,
  story: plainUchisenMnemonic(mnemonic)
  };
}
async function generateUchisenImageWithRetry(kanjiId, imagePrompt, storyBackedPrompt, safeImagePrompt, referrer, proxyUrl) {
  const attempts = uniqueUchisenPrompts([imagePrompt, storyBackedPrompt, safeImagePrompt]);
  let lastError;
  for (const prompt of attempts) {
  try {
    const generationText = await postUchisenForm("https://uchisen.com/generateimage", {
      prompt: uchisenPromptFieldValue(prompt),
      kanji_id: kanjiId
    }, referrer, proxyUrl, "Uchisen image generation", 12e4);
    return { generation: parseUchisenGenerationResponse(generationText), imagePrompt: prompt };
  } catch (error) {
    lastError = error;
  }
  }
  throw lastError instanceof Error ? lastError : new Error("Uchisen image generation failed.");
}
function storyBackedUchisenImagePrompt(mnemonic, imagePrompt) {
  const story = plainUchisenMnemonic(mnemonic).replace(/\s+/g, " ").trim();
  if (!story) return imagePrompt;
  return fitUchisenImagePrompt(`${imagePrompt}; scene follows this mnemonic story: ${story}`);
}
function uniqueUchisenPrompts(prompts) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const prompt of prompts) {
  const trimmed = prompt.trim();
  if (!trimmed || seen.has(trimmed)) continue;
  seen.add(trimmed);
  unique.push(trimmed);
  }
  return unique;
}
function fitUchisenImagePrompt(prompt) {
  const maxLength = 400;
  if (prompt.length <= maxLength) return prompt;
  const noTextSuffix = /;\s*no text or signage$/i.test(prompt) ? "; no text or signage" : "";
  const targetLength = noTextSuffix ? maxLength - noTextSuffix.length : maxLength;
  return `${prompt.slice(0, targetLength).replace(/[;,\s]+$/, "")}${noTextSuffix}`;
}
function renderUchisenGeneratePanel(fields, status, busy, language) {
  const statusHtml = status ? `<div class="yomu-jpdb-uchisen-generate-status" data-tone="${escapeHtml(status.tone)}">${escapeHtml(status.text)}</div>` : `<div class="jpdb-reader-help">${escapeHtml(uiText(language, "uchisenGenerateHint"))}</div>`;
  return `
    <div class="yomu-jpdb-uchisen-generator">
        <label class="yomu-jpdb-uchisen-field">
            <span>${escapeHtml(uiText(language, "uchisenMnemonicStory"))}</span>
            <textarea rows="3" data-uchisen-generate-field="mnemonic" ${busy ? "disabled" : ""}>${escapeHtml(fields.mnemonic)}</textarea>
        </label>
        <label class="yomu-jpdb-uchisen-field">
            <span>${escapeHtml(uiText(language, "uchisenImagePrompt"))}</span>
            <textarea rows="4" data-uchisen-generate-field="imagePrompt" ${busy ? "disabled" : ""}>${escapeHtml(fields.imagePrompt)}</textarea>
        </label>
        <div class="yomu-jpdb-uchisen-generator-footer">
            ${statusHtml}
            <button class="jpdb-reader-btn" type="button" data-uchisen-action="generate-submit" ${busy ? "disabled" : ""}>${escapeHtml(uiText(language, "generateUchisenImage"))}</button>
        </div>
    </div>
  `;
}
function defaultUchisenGenerateFields(kanji, keyword, groups) {
  const keywordText = keyword?.keyword || kanji;
  const components2 = uniqueUchisenComponents(groups);
  const componentStory = components2.length ? components2.map((component) => `#${component.name}#`).join(" and ") : "#component#";
  const componentPrompt = components2.length ? components2.map((component) => `${component.name}${component.symbol ? ` (${component.symbol})` : ""}`).join(", ") : "simple component props";
  return {
  mnemonic: `##${keywordText}## A warm, clear scene brings ${componentStory} together so ${keywordText.toLowerCase()} feels easy to picture.`,
  imagePrompt: safeUchisenImagePrompt(`Japanese children's storybook illustration of a friendly ${keywordText.toLowerCase()} scene; include distinct props for ${componentPrompt}; pastel colors, vintage textures; warm light; clear silhouettes; no text or signage`)
    };
  }
  function uniqueUchisenComponents(groups) {
    const seen = /* @__PURE__ */ new Set();
    const components2 = [];
    for (const group of groups) {
      for (const component of group.components) {
        const key = component.name || component.symbol;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        components2.push(component);
      }
    }
    return components2;
  }
  function findUchisenImageIndex(images, imageUrl) {
    const canonical = canonicalUchisenUrl(imageUrl);
    return images.findIndex((item) => canonicalUchisenUrl(item.url) === canonical);
  }
  function parseUchisenGenerationResponse(text2) {
    const json = parseJsonObjectFromText(text2);
    if (!json || isUchisenGenerationFailure(json)) {
      throw new Error(uchisenGenerationErrorMessage(json, text2));
    }
    const rawFilename = firstString(json.url, json.filename, json.file, json.img_src, json.image_url, json.imageUrl);
    const rawFullUrl = firstString(json.full_url, json.image_url, json.imageUrl);
    const imageFilename = normalizeUchisenImageFilename(rawFilename);
    if (!imageFilename) throw new Error(`Image generation did not return a filename: ${snippet(text2)}`);
    return {
      imageFilename,
      imageUrl: rawFullUrl ? canonicalUchisenUrl(rawFullUrl) : canonicalUchisenUrl(imageFilename)
    };
  }
  function uchisenPromptFieldValue(value) {
    return escapeHtml(value).replace(/'/g, "&#039;");
  }
  function safeUchisenImagePrompt(value) {
    let prompt = value;
    for (const [pattern, replacement] of UCHISEN_IMAGE_PROMPT_REPLACEMENTS) {
      prompt = prompt.replace(pattern, replacement);
    }
    prompt = prompt.replace(/no text,\s*letters,\s*numbers,\s*logos,\s*or signage/gi, "no text or signage").replace(/no text,\s*letters,\s*numbers,\s*logos,\s*labels,\s*or signage/gi, "no text or signage").replace(/\s+/g, " ").trim();
    if (!/no text|without text/i.test(prompt)) prompt = `${prompt}; no text or signage`;
    return prompt;
  }
  const UCHISEN_IMAGE_PROMPT_REPLACEMENTS = imagePromptReplacementDefs.map(([pattern, replacement]) => [new RegExp(pattern, "gi"), replacement]);
  function parseJsonObjectFromText(text2) {
    try {
      return JSON.parse(text2);
    } catch {
      const match = /\{[\s\S]*\}/.exec(text2);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  function isUchisenGenerationFailure(json) {
    if (json.success === false || json.success === 0 || json.success === "0") return true;
    if (typeof json.error_message === "string" && json.error_message.trim()) return true;
    if (typeof json.error === "string" && json.error.trim()) return true;
    return false;
  }
  function uchisenGenerationErrorMessage(json, text2) {
    const message = firstString(json?.error_message, json?.error);
    if (/must be logged|not logged|login required/i.test(message)) return message;
    if (message) return `Uchisen image backend rejected generation: ${message}`;
    return `Uchisen image backend rejected generation: ${snippet(text2)}`;
  }
  function firstString(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }
  function normalizeUchisenImageFilename(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return url.pathname.split("/").filter(Boolean).pop() ?? value;
    } catch {
      return value.split("/").filter(Boolean).pop() ?? value;
    }
  }
  function snippet(text2) {
    return String(text2).replace(/\s+/g, " ").trim().slice(0, 500);
  }
  function formatUchisenMnemonicHtml(value) {
    return String(value).replace(/[<>]/g, "").replace(/#nl#/g, "<br>").replace(/##([^#]+)##/g, "<b>$1</b>").replace(/#([^#]+)#/g, "<i>$1</i>");
  }
  function plainUchisenMnemonic(value) {
    return cleanText$1(String(value).replace(/#nl#/g, " ").replace(/##([^#]+)##/g, "$1").replace(/#([^#]+)#/g, "$1"));
  }
  function renderUchisenComponentGroups(kanjiKeyword, groups, language) {
    const keywordGroup = uchisenKanjiKeywordGroup(kanjiKeyword);
    const visibleGroups = [
      ...keywordGroup ? [keywordGroup] : [],
      ...groups.filter((group) => group.components.length)
    ];
    if (!visibleGroups.length) return "";
    return `<div class="yomu-jpdb-component-breakdown" aria-label="${escapeHtml(uiText(language, "readingsComponents"))}">
    ${visibleGroups.map((group) => `<div class="yomu-jpdb-component-group">
            <span class="yomu-jpdb-component-group-label">${escapeHtml(localizedUchisenComponentGroupTitle(group.title, language))}</span>
            <div class="yomu-jpdb-component-list">
                ${group.components.map((component) => renderUchisenComponentChip(component)).join("")}
            </div>
        </div>`).join("")}
  </div>`;
  }
  function uchisenKanjiKeywordGroup(keyword) {
    if (!keyword || !keyword.kanji && !keyword.keyword) return null;
    return {
      title: "Kanji Keyword",
      components: [{
        name: keyword.keyword,
        symbol: keyword.kanji,
        url: keyword.url
      }]
    };
  }
  function localizedUchisenComponentGroupTitle(title, language) {
    if (resolveUiLanguage(language) !== "ja") return title;
    if (title === "Kanji Keyword") return "漢字キーワード";
    if (title === "Kanji Primes") return "漢字パーツ";
    if (title === "Compound Kanji") return "複合漢字";
    if (title === "Components") return "部品";
    return title;
  }
  function uchisenExternalLinkLabel(language) {
    return resolveUiLanguage(language) === "ja" ? "Uchisenで見る" : "View on Uchisen";
  }
  function formatUchisenTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? "");
  }
  function renderUchisenComponentChip(component) {
    const label = [component.name, component.symbol].filter(Boolean).join(": ");
    const content = `
    ${component.symbol ? `<strong>${escapeHtml(component.symbol)}</strong>` : ""}
    ${component.name ? `<span>${escapeHtml(component.name)}</span>` : ""}
  `;
    return component.url ? `<a class="yomu-jpdb-component-chip" href="${escapeHtml(component.url)}" target="_blank" rel="noopener" title="${escapeHtml(label)}">${content}</a>` : `<span class="yomu-jpdb-component-chip" title="${escapeHtml(label)}">${content}</span>`;
  }
  function preferredUchisenIndex(storedIndex, images) {
    if (isValidUchisenIndex(storedIndex, images)) return storedIndex;
    const firstNonPaywall = images.findIndex((item) => !isUchisenPaywallItem(item));
    return firstNonPaywall >= 0 ? firstNonPaywall : storedIndex;
  }
  function isValidUchisenIndex(index, images) {
    return Number.isInteger(index) && index >= 0 && index < images.length;
  }
  function isUchisenPaywallItem(item) {
    return Boolean(item && (isUchisenPaywallImage(item.url) || isUchisenPaywallStory(item.story)));
  }
  function postUchisenForm(url, fields, referrer, proxyUrl, failureLabel, timeout) {
    return requestText$5(url, {
      method: "POST",
      data: encodedForm(fields),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/html, */*; q=0.01",
        Origin: "https://uchisen.com",
        Referer: referrer
      },
      proxyUrl,
      timeoutMs: timeout,
      failureLabel,
      timeoutLabel: `${failureLabel} timed out.`,
      credentials: "include",
      anonymous: false,
      withCredentials: true,
      allowPublicProxies: false,
      allowConfiguredProxy: false,
      allowDirectCrossOrigin: true
    }).then((text2) => {
      const json = parseJsonObjectFromText(text2);
      const message = firstString(json?.error_message, json?.error);
      if (message && !/generateimage$/i.test(url)) throw new Error(message);
      if (isUchisenAuthFailure(text2)) {
        throw new Error(`${failureLabel} failed because Uchisen did not accept the current login.`);
      }
      return text2;
    });
  }
  function isUchisenAuthFailure(text2) {
    return /not logged|login required|account is needed/i.test(text2) && !/success/i.test(text2);
  }
  function encodedForm(fields) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) params.set(key, value);
    return params.toString();
  }
  function requestBlobUrl(url, timeout, proxyUrl) {
    return requestBlob$1(url, timeout, proxyUrl).then((blob) => createPageMediaUrl(blob, url));
  }
  function requestBlob$1(url, timeout, proxyUrl) {
    return requestBlob$2(url, {
      proxyUrl,
      timeoutMs: timeout,
      failureLabel: "Uchisen image request",
      timeoutLabel: "Uchisen image request timed out."
    });
  }
  function parseUchisenData(html) {
    if (!html.trim()) return emptyUchisenData();
    const doc = parseHtmlDocument(html);
    const kanjiId = parseUchisenKanjiIdFromDocument(doc);
    return {
      images: parseUchisenImagesFromDocument(doc),
      componentGroups: parseUchisenComponentGroupsFromDocument(doc),
      kanjiKeyword: parseUchisenKanjiKeywordFromDocument(doc),
      kanjiId,
      canGenerateImages: Boolean(kanjiId && parseUchisenCanGenerateFromDocument(doc))
    };
  }
  function emptyUchisenData() {
    return { images: [], componentGroups: [], kanjiKeyword: null, kanjiId: "", canGenerateImages: false };
  }
  function parseUchisenImagesFromDocument(doc) {
    const images = [];
    const mainImage = mainUchisenImageUrl(doc);
    const mainStory = cleanText$1(doc.querySelector("#mnemonic_story")?.textContent ?? "");
    if (mainImage) {
      const url = canonicalUchisenUrl(mainImage);
      images.push({
        url,
        story: mainStory || "No story available",
        paywall: isUchisenPaywallImage(url) || isUchisenPaywallStory(mainStory)
      });
    }
    doc.querySelectorAll(".mnemonic_card").forEach((card) => {
      const image = uchisenCardImage(card, mainStory);
      if (image) images.push(image);
    });
    return orderedUchisenImages(images);
  }
  function parseUchisenComponentGroupsFromDocument(doc) {
    const root = doc.querySelector(".kanji_info_container .components") ?? doc.querySelector(".components");
    if (!root) return [];
    return Array.from(root.children).filter((child) => child instanceof HTMLElement && child.classList.contains("KP_primes")).map(uchisenComponentGroup).filter((group) => Boolean(group?.components.length)).slice(0, 4);
  }
  function parseUchisenKanjiKeywordFromDocument(doc) {
    const candidates = [
      doc.querySelector("#kanji_keyword_container > span")?.textContent,
      doc.querySelector("#kanji_keyword_container")?.textContent,
      doc.querySelector(".kanji_name > span")?.textContent,
      doc.querySelector(".mnemonic_studio_right h2.kanji_info")?.textContent
    ];
    for (const candidate of candidates) {
      const keyword = uchisenKanjiKeyword(candidate ?? "");
      if (keyword) return keyword;
    }
    return null;
  }
  function parseUchisenKanjiIdFromDocument(doc) {
    const candidates = [
      doc.querySelector("input#kanji_id")?.value,
      doc.querySelector("input#showing_kanji_id")?.value,
      doc.querySelector('input[name="kanji_id"]')?.value
    ];
    return cleanText$1(candidates.find(Boolean) ?? "");
  }
  function parseUchisenCanGenerateFromDocument(doc) {
    const userId = cleanText$1(doc.querySelector("input#user_id")?.value ?? "");
    const hasAccountNav = Boolean(doc.querySelector('a[href^="/account/"], a[href="/logout"]'));
    const hasStudioGenerateButton = Boolean(doc.querySelector('.generate_image_button, button[data-uchisen-action="generate-submit"]'));
    const hasLoginPrompt = Boolean(doc.querySelector('#lo_links a[href*="login"], a[href*="/login"]'));
    const explicitlyUnavailable = Boolean(doc.querySelector("[data-uchisen-generate-unavailable], .generate_image_button[disabled]"));
    return !explicitlyUnavailable && (hasStudioGenerateButton || Boolean(userId) || hasAccountNav || hasLoginPrompt);
  }
  function uchisenKanjiKeyword(value) {
    const match = /^(.+?)\s*[-\u2013\u2014]\s*(.+)$/u.exec(cleanText$1(value));
    if (!match) return null;
    const kanji = cleanText$1(match[1].replace(/[「」]/g, ""));
    const keyword = cleanText$1(match[2]);
    if (!kanji || !keyword) return null;
    return {
      kanji,
      keyword,
      url: `https://uchisen.com/kanji/${encodeURIComponent(kanji)}`
  };
}
function uchisenComponentGroup(group) {
  const components2 = Array.from(group.querySelectorAll(".name_combo")).map(uchisenComponent).filter((component) => Boolean(component?.symbol || component?.name)).slice(0, 8);
  if (!components2.length) return null;
  return {
  title: uchisenComponentGroupTitle(group),
  components: components2
  };
}
function uchisenComponentGroupTitle(group) {
  if (group.querySelector(".prime_label")) return "Kanji Primes";
  if (group.querySelector(".compound_label")) return "Compound Kanji";
  return cleanText$1(group.querySelector(".prime_label, .compound_label")?.textContent ?? "") || "Components";
}
function uchisenComponent(item) {
  const link = item.querySelector("a[href]");
  if (!link) return null;
  const symbol = cleanText$1(link.querySelector(".component_symbol")?.textContent ?? "");
  const name = uchisenComponentName(link, symbol);
  return {
  name,
  symbol,
  url: absoluteUchisenUrl(link.getAttribute("href") ?? "")
  };
}
function uchisenComponentName(link, symbol) {
  const text2 = cleanText$1((link.textContent ?? "").replace(/\u00a0/g, " "));
  const withoutSymbol = symbol ? cleanText$1(text2.replace(symbol, "")) : text2;
  return cleanText$1(withoutSymbol.replace(/[：:].*$/u, "")) || symbol;
}
function absoluteUchisenUrl(value) {
  try {
  return new URL(value, "https://uchisen.com").href;
  } catch {
  return value;
  }
}
function mainUchisenImageUrl(doc) {
  const mainLoader = doc.querySelector(".kanji_image_loader[data-large]");
  return mainLoader?.getAttribute("data-large") || doc.querySelector("#full_kanji_image")?.getAttribute("src") || "";
}
function uchisenCardImage(card, mainStory) {
  const rawUrl = card.querySelector("input.image_url")?.value.trim() ?? "";
  if (!rawUrl) return null;
  const url = canonicalUchisenUrl(rawUrl);
  const story = uchisenCardStory(card, mainStory);
  return {
  url,
  story,
  paywall: isUchisenPaywallCard(card, url, story)
  };
}
function uchisenCardStory(card, mainStory) {
  const rawStory = card.querySelector("input.story")?.value ?? "";
  const story = cleanText$1(decodeEntities(rawStory).replace(/<[^>]+>/g, " "));
  return story || mainStory || "No story available";
}
function isUchisenPaywallCard(card, url, story) {
  const thumbnailUrl = card.querySelector(".mnemonic_card_thumbnail img")?.getAttribute("src") ?? "";
  return isUchisenPaywallImage(url) || isUchisenPaywallImage(thumbnailUrl) || isUchisenPaywallStory(story);
}
async function loadUchisenData(kanji, proxyUrl = "") {
  const html = await requestUchisenPageText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9e3, proxyUrl);
  return parseUchisenData(html);
}
async function requestUchisenPageText(url, timeout, proxyUrl) {
  try {
  return await requestText$5(url, {
    timeoutMs: timeout,
    failureLabel: "Uchisen request",
    timeoutLabel: "Uchisen request timed out.",
    credentials: "include",
    anonymous: false,
    withCredentials: true,
    allowPublicProxies: false,
    allowConfiguredProxy: false,
    allowDirectCrossOrigin: false
  });
  } catch {
  return requestText$3(url, timeout, proxyUrl);
  }
}
function requestText$3(url, timeout, proxyUrl) {
  return requestText$5(url, {
  proxyUrl,
  timeoutMs: timeout,
  failureLabel: "Uchisen request",
  timeoutLabel: "Uchisen request timed out."
  });
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
const SCALE_EPSILON = 0.05;
const MAX_PAGE_SCALE = 3;
const SAFARI_PAGE_ZOOM_STEPS = [1.15, 1.25, 1.5, 1.75, 2, 2.5, 3];
const ZOOM_STEP_TOLERANCE = 0.025;
const MIN_AXIS_AGREEMENT = 0.97;
const MAX_AXIS_AGREEMENT = 1.4;
const APPLE_TOUCH_ADAPTER = "apple-touch-page-scale";
const rememberedRectScales = /* @__PURE__ */ new WeakMap();
function overlayPageScale(environment) {
  if (!environment.appleTouch) return 1;
  if (!positiveFinite(environment.innerWidth)) return 1;
  if (positiveFinite(environment.outerWidth)) {
  const surfaceScale = environment.outerWidth / environment.innerWidth;
  if (Number.isFinite(surfaceScale) && surfaceScale > 1 + SCALE_EPSILON) {
    return Math.min(surfaceScale, MAX_PAGE_SCALE);
  }
  }
  return screenDerivedPageScale(environment);
}
function screenDerivedPageScale(environment) {
  const { innerWidth, innerHeight, screenWidth, screenHeight } = environment;
  if (!positiveFinite(innerHeight) || !positiveFinite(screenWidth) || !positiveFinite(screenHeight)) return 1;
  const pairings = [
  [screenWidth / innerWidth, screenHeight / innerHeight],
  [screenHeight / innerWidth, screenWidth / innerHeight]
  ];
  for (const [widthRatio, heightRatio] of pairings) {
  if (widthRatio <= 1 + SCALE_EPSILON) continue;
  const step = nearestSafariZoomStep(widthRatio);
  if (step === void 0) continue;
  if (heightRatio < widthRatio * MIN_AXIS_AGREEMENT) continue;
  if (heightRatio > widthRatio * MAX_AXIS_AGREEMENT) continue;
  return step;
  }
  return 1;
}
function nearestSafariZoomStep(ratio) {
  for (const step of SAFARI_PAGE_ZOOM_STEPS) {
  if (Math.abs(ratio - step) <= step * ZOOM_STEP_TOLERANCE) return step;
  }
  return void 0;
}
function overlayViewport(environment = currentEnvironment()) {
  const pageScale = overlayPageScale(environment);
  return {
  width: environment.innerWidth * pageScale,
  height: environment.innerHeight * pageScale,
  pageScale
  };
}
function layoutPointToOverlay(point, pageScale = overlayViewport().pageScale) {
  return {
  x: point.x * pageScale,
  y: point.y * pageScale
  };
}
function sourceRectToOverlay(rect, source, pageScale = overlayViewport().pageScale) {
  const rememberedScale = rememberedRectScales.get(rect);
  const root = compensatedOverlayRoot(source);
  const rectScale = rememberedScale ?? (root ? compensatedRootRectScale(root, pageScale) : pageScale);
  const overlayRect = scaleRect(rect, rectScale);
  rememberedRectScales.set(overlayRect, 1);
  return overlayRect;
}
function compensatedOverlayRoot(source) {
  const element = source instanceof Element ? source : source?.parentElement;
  const root = element?.closest(`[data-jpdb-reader-scale-adapter="${APPLE_TOUCH_ADAPTER}"]`);
  return root instanceof HTMLElement ? root : null;
}
function currentEnvironment() {
  return {
  appleTouch: isAppleTouchBrowser(),
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  outerWidth: window.outerWidth,
  screenWidth: window.screen?.width ?? 0,
  screenHeight: window.screen?.height ?? 0
  };
}
function compensatedRootRectScale(root, pageScale = overlayViewport().pageScale) {
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
  const distance = layoutPointToOverlay({
  x: event.clientX - active.startX,
  y: event.clientY - active.startY
  });
  return Math.hypot(distance.x, distance.y);
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
  const rect = originGraphOverlayRect(wrap);
  if (!rect.width || !rect.height) return { x: 50, y: 50 };
  const pointer = layoutPointToOverlay({ x: event.clientX, y: event.clientY });
  return {
  x: (pointer.x - rect.left) / rect.width * 100,
  y: (pointer.y - rect.top) / rect.height * 100
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
  const wrapRect = originGraphOverlayRect(wrap);
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
  const wrapRect = originGraphOverlayRect(wrap);
  if (!wrapRect.width || !wrapRect.height) return { rx: 0, ry: 0 };
  const nodeRect = !node.offsetWidth || !node.offsetHeight ? originGraphOverlayRect(node) : void 0;
  const width = node.offsetWidth || nodeRect?.width || 0;
  const height = node.offsetHeight || nodeRect?.height || 0;
  return {
  rx: width > 0 ? width / 2 / wrapRect.width * 100 : 0,
  ry: height > 0 ? height / 2 / wrapRect.height * 100 : 0
  };
}
function originGraphOverlayRect(element) {
  return sourceRectToOverlay(element.getBoundingClientRect(), element);
}
function originGraphTargetZone(value) {
  return value === "top" || value === "upper" || value === "left" || value === "right" || value === "lower" || value === "bottom" || value === "center" ? value : "auto";
}
function clampGraphPercent(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}
const JPDB_KANJI_BASE_URL = "https://jpdb.io/kanji";
const log$9 = Logger.scope("JpdbKanji");
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
  log$9.info("Performing JPDB kanji action", { kanji: action.kanji, role: action.role, kind: action.kind });
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
    log$9.warn("Kanji page request failed", { kanji }, error);
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
  const text2 = `${label} ${context}`.toLowerCase();
  if (KANJI_ACTION_OTHER_RE.test(labelText)) return "other";
  return KANJI_ACTION_PATTERNS.find(({ pattern }) => pattern.test(text2))?.role ?? "other";
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
  const entries2 = [];
  doc.querySelectorAll(".kanji-reading-list-common > div, .kanji-reading-list > div").forEach((row) => {
  const link = row.querySelector("a");
  const reading = cleanText$1(link?.textContent ?? "");
  if (!reading || seen.has(reading)) return;
  seen.add(reading);
  entries2.push({
    reading,
    share: cleanText$1(row.textContent ?? "").replace(reading, "").trim(),
    common: row.closest(".kanji-reading-list-common") !== null
  });
  });
  return entries2;
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
  const entries2 = [];
  doc.querySelectorAll(".subsection-used-in .used-in").forEach((element) => {
  const entry = jpdbKanjiVocabularyEntry(element);
  if (entry) entries2.push(entry);
  });
  return entries2;
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
function requestText$2(url, proxyUrl = "", options = {}) {
  const method = options.method ?? "GET";
  const body = requestTextBody(options.payload);
  const requestUrl = requestTextUrl(url, method, body);
  const headers = requestTextHeaders(method);
  return requestText$5(requestUrl, {
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
const log$8 = Logger.scope("KanjiVG");
const KANJIVG_AXIS_POSITIONS = {
  x: { negative: "left", positive: "right" },
  y: { negative: "top", positive: "bottom" }
};
class KanjiVGClient {
  cache = /* @__PURE__ */ new Map();
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
    log$8.warn("Stroke-order request failed", { kanji }, error);
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
function readKanjiVGStrokeNumber(text2) {
  const transform = text2.getAttribute("transform") ?? "";
  const label = (text2.textContent ?? "").trim();
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
  return requestText$5(url, {
  timeoutMs: 8e3,
  failureLabel: "Stroke-order request",
  timeoutLabel: "Stroke-order request timed out."
  });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonNullObject(value) {
  return typeof value === "object" && value !== null;
}
function pruneOldestCacheEntries(cache, limit) {
  while (cache.size > limit) {
  const oldest = cache.keys().next();
  if (oldest.done) break;
  cache.delete(oldest.value);
  }
}
function isAbortError(error) {
  return (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
}
function revokeBlobObjectUrl(url) {
  if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
class ObjectUrlCache {
  // `revoke` lets callers release side-channel state tied to the URL (e.g. the
  // retained Blob the Web Audio CSP fallback reads), not just the object URL.
  constructor(ttlMs, revoke = revokeBlobObjectUrl) {
  this.ttlMs = ttlMs;
  this.revoke = revoke;
  }
  entries = /* @__PURE__ */ new Map();
  getOrCreate(key, createUrl) {
  const now = Date.now();
  const cached = this.entries.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  if (cached) this.delete(key);
  const entry = {
    expiresAt: now + this.ttlMs,
    promise: Promise.resolve().then(createUrl).then((url) => {
      entry.url = url;
      entry.timeoutId = globalThis.setTimeout(() => this.expire(key, entry), this.ttlMs);
      return url;
    }).catch((error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    })
  };
  this.entries.set(key, entry);
  return entry.promise;
  }
  clear() {
  for (const key of this.entries.keys()) {
    this.delete(key);
  }
  }
  expire(key, entry) {
  if (this.entries.get(key) !== entry) return;
  this.delete(key);
  }
  delete(key) {
  const entry = this.entries.get(key);
  if (!entry) return;
  if (entry.timeoutId !== void 0) globalThis.clearTimeout(entry.timeoutId);
  this.entries.delete(key);
  if (entry.url !== void 0) this.revoke(entry.url);
  }
}
const API_BASE = "https://apiv2express.immersionkit.com";
const LEGACY_API_BASE = "https://apiv2.immersionkit.com";
const API_BASES = [API_BASE, LEGACY_API_BASE];
const NADESHIKO_API_BASE = "https://api.nadeshiko.co/v1";
const OBJECT_STORE_BASE = "https://us-southeast-1.linodeobjects.com/immersionkit";
const MEDIA_BLOB_CACHE_TTL_MS = 10 * 60 * 1e3;
const MEDIA_CANDIDATE_LIMIT = 4;
const SEARCH_EXAMPLE_LIMIT = 250;
const SEARCH_CACHE_LIMIT = 160;
const SEARCH_RATE_LIMIT_INITIAL_BACKOFF_MS = 1e3;
const SEARCH_RATE_LIMIT_MAX_BACKOFF_MS = 3e4;
const NADESHIKO_SEARCH_LIMIT = 25;
const MIN_LEARNING_SENTENCE_LENGTH = 8;
const DEFAULT_EXAMPLE_SORT = "sentence_length:asc";
const log$7 = Logger.scope("ImmersionKit");
const IMMERSION_KIT_TITLES = {
  your_lie_in_april: "Your Lie in April",
  princess_mononoke: "Princess Mononoke",
  girls_band_cry: "Girls Band Cry",
  only_yesterday: "Only Yesterday",
  chobits: "Chobits",
  k_on_: "K-On!",
  weathering_with_you: "Weathering with You",
  from_the_new_world: "From the New World",
  grave_of_the_fireflies: "Grave of the Fireflies",
  steins_gate: "Steins Gate",
  sword_art_online: "Sword Art Online",
  nisekoi: "Nisekoi",
  death_note: "Death Note",
  wolf_children: "Wolf Children",
  demon_slayer___kimetsu_no_yaiba: "Demon Slayer - Kimetsu no Yaiba",
  your_name: "Your Name",
  alya_sometimes_hides_her_feelings_in_russian: "Alya Sometimes Hides Her Feelings in Russian",
  cardcaptor_sakura: "Cardcaptor Sakura",
  kill_la_kill: "Kill la Kill",
  howl_s_moving_castle: "Howl's Moving Castle",
  whisper_of_the_heart: "Whisper of the Heart",
  bunny_drop: "Bunny Drop",
  fermat_kitchen: "Fermat Kitchen",
  haruhi_suzumiya: "Haruhi Suzumiya",
  hunter_x_hunter: "Hunter × Hunter",
  god_s_blessing_on_this_wonderful_world_: "God's Blessing on this Wonderful World!",
  assassination_classroom_season_1: "Assassination Classroom Season 1",
  durarara__: "Durarara!!",
  bakemonogatari: "Bakemonogatari",
  hyouka: "Hyouka",
  relife: "ReLIFE",
  from_up_on_poppy_hill: "From Up on Poppy Hill",
  sound__euphonium: "Sound! Euphonium",
  lucky_star: "Lucky Star",
  kokoro_connect: "Kokoro Connect",
  my_little_sister_can_t_be_this_cute: "My Little Sister Can't Be This Cute",
  is_the_order_a_rabbit: "Is The Order a Rabbit",
  clannad: "Clannad",
  angel_beats_: "Angel Beats!",
  daily_lives_of_high_school_boys: "Daily Lives of High School Boys",
  new_game_: "New Game!",
  the_wind_rises: "The Wind Rises",
  fate_zero: "Fate Zero",
  toradora_: "Toradora!",
  anohana_the_flower_we_saw_that_day: "Anohana the flower we saw that day",
  wandering_witch_the_journey_of_elaina: "Wandering Witch The Journey of Elaina",
  kino_s_journey: "Kino's Journey",
  boku_no_hero_academia_season_1: "Boku no Hero Academia Season 1",
  fullmetal_alchemist_brotherhood: "Fullmetal Alchemist Brotherhood",
  one_week_friends: "One Week Friends",
  erased: "Erased",
  mononoke: "Mononoke",
  little_witch_academia: "Little Witch Academia",
  re_zero___starting_life_in_another_world: "Re Zero − Starting Life in Another World",
  fruits_basket_season_1: "Fruits Basket Season 1",
  mahou_shoujo_madoka_magica: "Mahou Shoujo Madoka Magica",
  the_irregular_at_magic_high_school: "The Irregular at Magic High School",
  clannad_after_story: "Clannad After Story",
  frieren_beyond_journey_s_end: "Frieren Beyond Journey's End",
  kakegurui: "Kakegurui",
  the_garden_of_words: "The Garden of Words",
  when_marnie_was_there: "When Marnie Was There",
  castle_in_the_sky: "Castle in the sky",
  shirokuma_cafe: "Shirokuma Cafe",
  my_neighbor_totoro: "My Neighbor Totoro",
  kiki_s_delivery_service: "Kiki's Delivery Service",
  the_girl_who_leapt_through_time: "The Girl Who Leapt Through Time",
  fate_stay_night_unlimited_blade_works: "Fate Stay Night Unlimited Blade Works",
  code_geass_season_1: "Code Geass Season 1",
  the_world_god_only_knows: "The World God Only Knows",
  the_pet_girl_of_sakurasou: "The Pet Girl of Sakurasou",
  no_game_no_life: "No Game No Life",
  kanon__2006_: "Kanon (2006)",
  psycho_pass: "Psycho Pass",
  the_cat_returns: "The Cat Returns",
  the_secret_world_of_arrietty: "The Secret World of Arrietty",
  spirited_away: "Spirited Away",
  noragami: "Noragami",
  fairy_tail: "Fairy Tail",
  i_m_taking_the_day_off: "I'm Taking the Day Off",
  border: "Border",
  weakest_beast: "Weakest Beast",
  mob_psycho_100: "Mob Psycho 100",
  the_journalist: "The Journalist",
  sailor_suit_and_machine_gun__2006_: "Sailor Suit and Machine Gun (2006)",
  smoking: "Smoking",
  i_am_mita__your_housekeeper: "I am Mita, Your Housekeeper",
  good_morning_call: "Good Morning Call",
  overprotected_kahoko: "Overprotected Kahoko",
  quartet: "Quartet",
  million_yen_woman: "Million Yen Woman",
  legal_high_season_1: "Legal High Season 1",
  witcher_3: "Witcher 3",
  cyberpunk_2077: "Cyberpunk 2077",
  skyrim: "Skyrim"
};
class ImmersionKitClient {
  cache = /* @__PURE__ */ new Map();
  inflight = /* @__PURE__ */ new Map();
  mediaBlobUrlCache = new ObjectUrlCache(MEDIA_BLOB_CACHE_TTL_MS);
  immersionKitRateLimitedUntil = 0;
  immersionKitBackoffMs = SEARCH_RATE_LIMIT_INITIAL_BACKOFF_MS;
  async search(term, settings, options = {}) {
  const query = term.trim();
  if (!canSearchImmersionExamples(query, settings)) return [];
  const cacheKey = this.searchCacheKey(query, settings, options);
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;
  const cacheInflight = !options.signal;
  const inflight = this.inflight.get(cacheKey);
  if (inflight) {
    return options.signal ? raceSharedImmersionSearchAgainstAbort(inflight, options.signal) : inflight;
  }
  const done = log$7.time("search", { query, source: settings.immersionKitExampleSource, category: settings.immersionKitCategory, exact: settings.immersionKitExactMatch });
  const promise = this.searchEnabledSources(query, settings, options).then((examples) => {
    const result = applySearchExampleLimit(examples, settings, options);
    if (!options.signal?.aborted) {
      this.cache.set(cacheKey, result);
      pruneOldestCacheEntries(this.cache, SEARCH_CACHE_LIMIT);
    }
    return result;
  }).finally(() => {
    if (cacheInflight) this.inflight.delete(cacheKey);
    done();
  });
  if (cacheInflight) this.inflight.set(cacheKey, promise);
  return promise;
  }
  async searchEnabledSources(query, settings, options) {
  const sources = enabledImmersionExampleSources(settings);
  if (settings.immersionKitExampleSource === "combined" && options.fastFirst && sources.length > 1) {
    return this.searchCombinedFastFirst(query, settings, options, sources);
  }
  const resultSets = await Promise.all(sources.map(
    (source) => this.searchSource(source, query, settings, options)
  ));
  return settings.immersionKitExampleSource === "combined" ? deterministicMergedExamples(sources, resultSets, this.combinedShuffleSeed(query, settings)) : resultSets.flat();
  }
  searchCombinedFastFirst(query, settings, options, sources) {
  let pending = sources.length;
  const emptyResults = [];
  return new Promise((resolve, reject) => {
    sources.forEach((source) => {
      void this.searchSource(source, query, settings, options).then((examples) => {
        if (examples.length) {
          resolve(examples);
          return;
        }
        emptyResults.push(examples);
        pending -= 1;
        if (pending === 0) resolve(emptyResults.flat());
      }).catch(reject);
    });
  });
  }
  searchSource(source, query, settings, options) {
  return source === "nadeshiko" ? this.searchNadeshiko(query, settings, options).catch((error) => {
    if (isAbortError(error)) throw error;
    log$7.warn("Nadeshiko examples failed", { query }, error);
    return [];
  }) : this.searchImmersionKit(query, settings, options).catch((error) => {
    if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
    log$7.warn("Immersion Kit examples failed", { query }, error);
    return [];
  });
  }
  searchImmersionKit(query, settings, options) {
  this.assertImmersionKitSearchAllowed(settings.interfaceLanguage);
  return requestJson$1(apiUrls(`/search?${this.searchParams(query, settings, options)}`), settings.audioTimeoutMs, settings.corsProxyUrl, options.signal, settings.interfaceLanguage).then((data) => {
    this.resetImmersionKitBackoff();
    return filterSearchExamples(data, query, settings, this.minimumSentenceLength(settings), "immersion-kit");
  }).catch((error) => {
    if (isImmersionKitRateLimitError(error)) this.noteImmersionKitRateLimit();
    throw error;
  });
  }
  assertImmersionKitSearchAllowed(language) {
  if (Date.now() < this.immersionKitRateLimitedUntil) {
    throw new Error(uiText(language, "immersionKitRateLimited"));
  }
  }
  noteImmersionKitRateLimit() {
  this.immersionKitRateLimitedUntil = Date.now() + this.immersionKitBackoffMs;
  this.immersionKitBackoffMs = Math.min(this.immersionKitBackoffMs * 2, SEARCH_RATE_LIMIT_MAX_BACKOFF_MS);
  }
  resetImmersionKitBackoff() {
  this.immersionKitBackoffMs = SEARCH_RATE_LIMIT_INITIAL_BACKOFF_MS;
  this.immersionKitRateLimitedUntil = 0;
  }
  searchNadeshiko(query, settings, options) {
  const apiKey = settings.nadeshikoApiKey.trim();
  if (!apiKey) return Promise.resolve([]);
  return requestJson$2(`${NADESHIKO_API_BASE}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    data: JSON.stringify(nadeshikoSearchPayload(query, settings, this.minimumSentenceLength(settings))),
    timeoutMs: settings.audioTimeoutMs,
    allowDirectCrossOrigin: true,
    allowPublicProxies: false,
    allowConfiguredProxy: false,
    preferFetch: shouldPreferFetchForImmersionKitRequests(),
    signal: options.signal,
    failureLabel: uiText(settings.interfaceLanguage, "nadeshikoRequest"),
    failureMessage: uiText(settings.interfaceLanguage, "nadeshikoRequestFailed"),
    statusFailureMessage: (status) => formatUiText(settings.interfaceLanguage, "nadeshikoRequestFailedWithStatus", { status }),
    timeoutLabel: uiText(settings.interfaceLanguage, "nadeshikoRequestTimedOut")
  }).then((data) => filterNadeshikoExamples(data, query, settings, this.minimumSentenceLength(settings)));
  }
  searchCacheKey(query, settings, options) {
  return JSON.stringify({
    query,
    source: settings.immersionKitExampleSource,
    nadeshikoKey: sensitiveFingerprint(settings.nadeshikoApiKey),
    limit: searchRequestLimit(options),
    userLimit: searchResultLimit(settings, options),
    min: this.minimumSentenceLength(settings),
    max: settings.immersionKitMaxLength,
    category: settings.immersionKitCategory,
    sort: this.effectiveSort(settings),
    exact: settings.immersionKitExactMatch,
    fastFirst: Boolean(options.fastFirst)
  });
  }
  combinedShuffleSeed(query, settings) {
  return JSON.stringify({
    query,
    source: settings.immersionKitExampleSource,
    key: sensitiveFingerprint(settings.nadeshikoApiKey),
    min: this.minimumSentenceLength(settings),
    max: settings.immersionKitMaxLength,
    category: settings.immersionKitCategory,
    exact: settings.immersionKitExactMatch
  });
  }
  searchParams(query, settings, options) {
  const params = new URLSearchParams({
    q: query,
    limit: String(searchRequestLimit(options)),
    sort: this.effectiveSort(settings)
  });
  if (settings.immersionKitExactMatch) params.set("exactMatch", "true");
  if (settings.immersionKitCategory !== "all") params.set("category", settings.immersionKitCategory);
  return params;
  }
  effectiveSort(settings) {
  return settings.immersionKitSort === "random" ? DEFAULT_EXAMPLE_SORT : settings.immersionKitSort;
  }
  minimumSentenceLength(settings) {
  return Math.max(settings.immersionKitMinLength, MIN_LEARNING_SENTENCE_LENGTH);
  }
  // Compatibility helper for callers that still expect the first media candidate.
  mediaUrl(example, kind) {
  return this.mediaUrls(example, kind)[0] ?? "";
  }
  mediaUrls(example, kind) {
  const direct = directMediaUrl(example, kind);
  if (direct) return [direct];
  const file = mediaFileName(example, kind);
  if (!file) return [];
  return mediaFileUrls(example, file).slice(0, MEDIA_CANDIDATE_LIMIT);
  }
  async fetchBlobUrl(url, timeoutMs, proxyUrl = "", language = "en") {
  const urls = urlCandidates(url);
  const key = urls.join("");
  return this.mediaBlobUrlCache.getOrCreate(key, async () => {
    const blob = await requestFirstBlob(url, timeoutMs, proxyUrl, language);
    const blobUrl = await createPageMediaUrl(blob, urls[0] ?? "");
    return blobUrl;
  });
  }
  async fetchDataUrl(url, timeoutMs, proxyUrl = "", language = "en") {
  const blob = await requestFirstBlob(url, timeoutMs, proxyUrl, language);
  return readBlobAsDataUrl(blob);
  }
}
function raceSharedImmersionSearchAgainstAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(immersionSearchAbortError());
  return new Promise((resolve, reject) => {
  const onAbort = () => {
    cleanup();
    reject(immersionSearchAbortError());
  };
  const cleanup = () => signal.removeEventListener("abort", onAbort);
  signal.addEventListener("abort", onAbort, { once: true });
  promise.then((value) => {
    cleanup();
    resolve(value);
  }, (error) => {
    cleanup();
    reject(error);
  });
  });
}
function immersionSearchAbortError() {
  if (typeof DOMException === "function") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
function canSearchImmersionExamples(query, settings) {
  return Boolean(query && settings.immersionKitEnabled);
}
function enabledImmersionExampleSources(settings) {
  if (settings.immersionKitExampleSource === "nadeshiko") return ["nadeshiko"];
  if (settings.immersionKitExampleSource === "combined") return ["immersion-kit", "nadeshiko"];
  return ["immersion-kit"];
}
function collectExamples(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record2 = value;
  return firstArrayField(record2, ["examples", "results", "data"]);
}
function firstArrayField(record2, keys) {
  return keys.map((key) => record2[key]).find(Array.isArray) ?? [];
}
function filterSearchExamples(data, query, settings, minLength, provider = "immersion-kit") {
  return collectExamples(data).map((value) => normalizeExample(value, provider)).filter((example) => Boolean(example)).filter((example) => isSearchExampleInRange(example, settings, minLength)).filter((example) => isSearchExampleSurfaceMatch(example, query));
}
function filterNadeshikoExamples(data, query, settings, minLength) {
  const response = nadeshikoResponseRecord(data);
  if (!response) return [];
  const media = nadeshikoMediaMap(response);
  return nadeshikoSegments(response).map((value) => normalizeNadeshikoExample(value, media)).filter((example) => Boolean(example)).filter((example) => isSearchExampleInRange(example, settings, minLength)).filter((example) => isSearchExampleSurfaceMatch(example, query));
}
function applySearchExampleLimit(examples, settings, options = {}) {
  const limit = searchResultLimit(settings, options);
  return limit ? examples.slice(0, limit) : examples;
}
function searchRequestLimit(options) {
  return boundedSearchLimit(options.requestLimit, SEARCH_EXAMPLE_LIMIT);
}
function searchResultLimit(settings, options) {
  if (options.resultLimit !== void 0) return boundedSearchLimit(options.resultLimit, SEARCH_EXAMPLE_LIMIT);
  return settings.immersionKitLimitEnabled ? boundedSearchLimit(settings.immersionKitLimit, SEARCH_EXAMPLE_LIMIT) : 0;
}
function boundedSearchLimit(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(SEARCH_EXAMPLE_LIMIT, Math.trunc(value)));
}
function isSearchExampleInRange(example, settings, minLength) {
  const length = sentenceLength(example.sentence);
  return length >= minLength && (!settings.immersionKitMaxLength || length <= settings.immersionKitMaxLength);
}
function isSearchExampleSurfaceMatch(example, query) {
  return !requiresSurfaceMatch(query) || sentenceContainsQuery(example.sentence, query);
}
function normalizeExample(value, provider = "immersion-kit") {
  return isRecord(value) ? normalizeExampleRecord(value, provider) : null;
}
function normalizeExampleRecord(record2, provider = "immersion-kit") {
  const id = text$1(record2.id);
  const sentence = firstText(record2, ["sentence", "text"]);
  if (!sentence) return null;
  const titleSlug = exampleTitleSlug(record2, id);
  const sourceTitle = exampleSourceTitle(record2, titleSlug);
  const category = exampleCategory(record2, id);
  const soundFile = firstText(record2, ["sound", "audio", "audio_file", "audioFile"]);
  const imageFile = firstText(record2, ["image", "image_file", "imageFile"]);
  return {
  id,
  provider,
  sentence,
  sentenceWithFurigana: firstText(record2, ["sentence_with_furigana", "sentenceWithFurigana"]),
  translation: firstText(record2, ["translation", "translation_en", "english"]),
  sourceTitle,
  titleSlug,
  category,
  soundFile,
  imageFile,
  soundUrl: absoluteMediaUrl(firstText(record2, ["sound_url", "audio_url", "soundUrl", "audioUrl"])),
  imageUrl: absoluteMediaUrl(firstText(record2, ["image_url", "imageUrl"]))
  };
}
function nadeshikoSearchPayload(query, settings, minLength) {
  const maxLength = settings.immersionKitMaxLength || 1e3;
  return {
  query: { search: query },
  take: NADESHIKO_SEARCH_LIMIT,
  filters: {
    segmentLengthChars: {
      min: minLength,
      max: Math.max(minLength, maxLength)
    }
  }
  };
}
function nadeshikoResponseRecord(data) {
  if (Array.isArray(data)) return { segments: data };
  return isRecord(data) ? data : null;
}
function nadeshikoSegments(response) {
  return firstArrayField(response, ["segments", "examples", "results", "data"]);
}
function nadeshikoMediaMap(response) {
  const includes = response.includes;
  const media = isRecord(includes) ? includes.media : void 0;
  return isRecord(media) ? media : {};
}
function normalizeNadeshikoExample(value, mediaById) {
  if (!isRecord(value)) return null;
  const sentence = nadeshikoSentence(value);
  if (!sentence) return null;
  const ids = nadeshikoExampleIds(value);
  const media = nadeshikoMediaRecord(mediaById, ids.mediaPublicId);
  const urls = recordField(value.urls);
  const sourceTitle = nadeshikoSourceTitle(value, media);
  return {
  id: nadeshikoExampleId(sentence, ids),
  provider: "nadeshiko",
  sentence,
  sentenceWithFurigana: firstText(value, ["furi_sentence", "sentenceWithFurigana", "sentence_with_furigana"]),
  translation: nadeshikoTranslation(value),
  sourceTitle,
  titleSlug: slugFromTitle(sourceTitle),
  category: nadeshikoCategory(value, media),
  soundFile: "",
  imageFile: "",
  soundUrl: nadeshikoAbsoluteMediaUrl(value, urls, ["audioUrl", "soundUrl", "audio_url", "sound_url"]),
  imageUrl: nadeshikoAbsoluteMediaUrl(value, urls, ["imageUrl", "image_url"]),
  publicId: ids.publicId,
  mediaPublicId: ids.mediaPublicId
  };
}
function nadeshikoSentence(record2) {
  return nestedText(record2, "textJa", ["content", "text"]) || firstText(record2, ["sentence", "text", "textJa"]);
}
function nadeshikoExampleIds(record2) {
  return {
  publicId: firstText(record2, ["publicId", "public_id", "id"]),
  mediaPublicId: firstText(record2, ["mediaPublicId", "media_public_id", "mediaId"])
  };
}
function nadeshikoMediaRecord(mediaById, mediaPublicId) {
  return recordField(mediaById[mediaPublicId]);
}
function recordField(value) {
  return isRecord(value) ? value : {};
}
function nadeshikoSourceTitle(record2, media) {
  return firstText(media, ["nameRomaji", "name_romaji", "titleRomaji", "title_romaji", "name", "title", "nameJa"]) || firstText(record2, ["mediaName", "sourceTitle", "source", "title"]) || "Nadeshiko";
}
function nadeshikoExampleId(sentence, ids) {
  return `nadeshiko_${ids.publicId || ids.mediaPublicId || stableHashBase36(sentence)}`;
}
function nadeshikoTranslation(record2) {
  return nestedText(record2, "textEn", ["content", "text"]) || firstText(record2, ["translation", "translation_en", "english"]);
}
function nadeshikoCategory(record2, media) {
  return firstText(media, ["type", "category"]) || firstText(record2, ["category"]) || "anime";
}
function nadeshikoAbsoluteMediaUrl(record2, urls, keys) {
  return absoluteMediaUrl(firstText(urls, keys) || firstText(record2, keys));
}
function nestedText(record2, key, fields) {
  const value = record2[key];
  return isRecord(value) ? firstText(value, fields) : "";
}
function directMediaUrl(example, kind) {
  return kind === "image" ? example.imageUrl : example.soundUrl;
}
function mediaFileName(example, kind) {
  return kind === "image" ? example.imageFile : example.soundFile;
}
function mediaFileUrls(example, file) {
  const category = example.category || categoryFromId(example.id);
  return uniqueTrimmedStrings(mediaTitleCandidates(example, file).flatMap((title) => mediaFileTitleUrls(category, title, file)));
}
function mediaFileTitleUrls(category, title, file) {
  const path = `media/${category}/${title}/media/${file}`;
  return [
  `${OBJECT_STORE_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`,
  ...apiUrls(`/download_media?${new URLSearchParams({ path })}`)
  ];
}
function exampleTitleSlug(record2, id) {
  return firstText(record2, ["title", "deck", "source"]) || titleSlugFromId(id);
}
function exampleSourceTitle(record2, titleSlug) {
  return firstText(record2, ["sourceTitle", "display_title", "displayTitle"]) || titleFromSlug(titleSlug);
}
function exampleCategory(record2, id) {
  return text$1(record2.category) || categoryFromId(id);
}
function firstText(record2, keys) {
  for (const key of keys) {
  const value = text$1(record2[key]);
  if (value) return value;
  }
  return "";
}
function text$1(value) {
  return typeof value === "string" ? value.trim() : "";
}
function titleSlugFromId(id) {
  const parts = id.split("_");
  if (parts.length < 3) return "";
  return parts.slice(1, -1).join("_");
}
function categoryFromId(id) {
  const [category] = id.split("_");
  return category || "anime";
}
function titleFromSlug(slug) {
  if (!slug) return "Unknown";
  const override = IMMERSION_KIT_TITLES[slug];
  if (override) return override;
  return slug.replace(/_+$/g, "").split("_").filter(Boolean).map((part) => part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)).join(" ");
}
function slugFromTitle(title) {
  return title.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]+/gi, "_").replace(/^_+|_+$/g, "");
}
function mediaTitleCandidates(example, file) {
  const slug = example.titleSlug || titleSlugFromId(example.id);
  return uniqueTrimmedStrings([
  titleFromSlug(slug),
  example.sourceTitle,
  titleFromMediaFile(file),
  slug
  ].filter(Boolean));
}
function titleFromMediaFile(file) {
  const stem = file.replace(/\.[^.]+$/u, "");
  const episodeMatch = /^(.+?)(?:_S\d|_\d|_E\d|-\s*\d)/i.exec(stem);
  const title = (episodeMatch?.[1] || stem).replace(/^A[_-]/, "").replace(/_/g, " ").trim();
  if (!title) return "";
  return title.replace(/\bKOn\b/u, "K-On!").replace(/\bDurarara\b/u, "Durarara!!").replace(/\bAngel Beats!?\b/u, "Angel Beats!");
}
function deterministicShuffle(values, seed) {
  const result = [...values];
  let state = stablePositiveHashId(seed);
  for (let index = result.length - 1; index > 0; index--) {
  state = nextRandomState(state);
  const swapIndex = state % (index + 1);
  [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
function deterministicMergedExamples(sources, resultSets, seed) {
  const groups = deterministicShuffle(sources.map((source, index) => ({
  source,
  examples: deterministicShuffle(resultSets[index] ?? [], `${seed}:${source}`)
  })), `${seed}:providers`).filter((group) => group.examples.length);
  const result = [];
  while (groups.some((group) => group.examples.length)) {
  for (const group of groups) {
    const example = group.examples.shift();
    if (example) result.push(example);
  }
  }
  return result;
}
function nextRandomState(value) {
  return Math.imul(value, 1664525) + 1013904223 >>> 0;
}
function sensitiveFingerprint(value) {
  const trimmed = value.trim();
  return trimmed ? stableHash32(trimmed).toString(36) : "";
}
function absoluteMediaUrl(value) {
  if (!value) return "";
  if (isAbsoluteMediaUrl(value)) return value;
  if (value.startsWith("media/")) return `${OBJECT_STORE_BASE}/${value.split("/").map(encodeURIComponent).join("/")}`;
  return "";
}
function isAbsoluteMediaUrl(value) {
  return /^https?:\/\//i.test(value) || value.startsWith("data:");
}
function sentenceLength(sentence) {
  return Array.from(sentence.replace(/\s+/g, "")).length;
}
function requiresSurfaceMatch(query) {
  return /[0-9０-９]/u.test(query);
}
function sentenceContainsQuery(sentence, query) {
  const normalizedSentence = normalizeForSurfaceMatch(sentence);
  const normalizedQuery = normalizeForSurfaceMatch(query);
  return Boolean(normalizedQuery) && normalizedSentence.includes(normalizedQuery);
}
function normalizeForSurfaceMatch(value) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
async function requestJson$1(url, timeoutMs, proxyUrl = "", signal, language = "en") {
  let lastError;
  for (const candidate of urlCandidates(url)) {
  try {
    return await requestJsonCandidate(candidate, timeoutMs, proxyUrl, signal, language);
  } catch (error) {
    if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
    lastError = error;
  }
  }
  throw requestError(lastError, uiText(language, "immersionKitRequestFailed"));
}
function urlCandidates(url) {
  return Array.isArray(url) ? url : [url];
}
function requestError(error, fallback) {
  return error instanceof Error ? error : new Error(fallback);
}
function requestJsonCandidate(url, timeoutMs, proxyUrl = "", signal, language = "en") {
  return requestJson$2(url, {
  proxyUrl,
  timeoutMs,
  allowDirectCrossOrigin: true,
  allowPublicProxies: false,
  preferFetch: shouldPreferFetchForImmersionKitRequests(),
  signal,
  failureLabel: uiText(language, "immersionKitRequest"),
  failureMessage: uiText(language, "immersionKitRequestFailed"),
  statusFailureMessage: (status) => formatUiText(language, "immersionKitRequestFailedWithStatus", { status }),
  timeoutLabel: uiText(language, "immersionKitRequestTimedOut")
  }).catch((error) => {
  if (isAbortError(error)) throw error;
  if (isImmersionKitRateLimitError(error)) throw error;
  if (error instanceof Error && /blocked|cross-origin|cors/i.test(error.message)) {
    throw new Error(uiText(language, "immersionKitSearchBlocked"));
  }
  throw requestError(error, uiText(language, "immersionKitRequestFailed"));
  });
}
function isImmersionKitRateLimitError(error) {
  return error instanceof Error && /\b(?:429|too many requests|rate[- ]?limited)\b/i.test(error.message);
}
function requestBlob(url, timeoutMs, proxyUrl = "", language = "en") {
  return requestBlob$2(url, {
  proxyUrl,
  timeoutMs,
  allowDirectCrossOrigin: true,
  preferFetch: shouldPreferFetchForImmersionKitRequests(),
  failureLabel: uiText(language, "immersionKitMediaRequest"),
  failureMessage: uiText(language, "immersionKitMediaRequestFailed"),
  statusFailureMessage: (status) => formatUiText(language, "immersionKitMediaRequestFailedWithStatus", { status }),
  timeoutLabel: uiText(language, "immersionKitMediaRequestTimedOut"),
  blobFailureMessage: uiText(language, "immersionKitMediaRequestReturnedNonMedia")
  }).then((blob) => {
  if (isErrorDocumentBlob(blob)) throw new Error(uiText(language, "immersionKitMediaRequestReturnedNonMedia"));
  return blob;
  });
}
async function requestFirstBlob(urls, timeoutMs, proxyUrl = "", language = "en") {
  const candidates = prioritizeMediaCandidates(urlCandidates(urls)).slice(0, MEDIA_CANDIDATE_LIMIT);
  let lastError;
  for (const candidate of candidates) {
  try {
    return await requestBlob(candidate, timeoutMs, proxyUrl, language);
  } catch (error) {
    lastError = error;
  }
  }
  throw requestError(lastError, uiText(language, "immersionKitNoMediaCandidate"));
}
function prioritizeMediaCandidates(urls) {
  return [...urls].sort((a, b) => Number(isObjectStoreMediaUrl(b)) - Number(isObjectStoreMediaUrl(a)));
}
function isObjectStoreMediaUrl(url) {
  try {
  return new URL(url, location.href).origin === new URL(OBJECT_STORE_BASE).origin;
  } catch {
  return false;
  }
}
function isErrorDocumentBlob(blob) {
  const type = blob.type.toLowerCase();
  if (isMediaBlobType(type)) return false;
  return ERROR_DOCUMENT_TYPE_MARKERS.some((marker) => type.includes(marker)) || type.startsWith("text/");
}
const ERROR_DOCUMENT_TYPE_MARKERS = ["xml", "html", "json"];
function isMediaBlobType(type) {
  return ["image/", "audio/", "video/"].some((prefix) => type.startsWith(prefix));
}
function shouldPreferFetchForImmersionKitRequests() {
  return typeof window !== "undefined" && window.__YOMU_READER_RUNTIME__ === "newtab";
}
function apiUrls(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASES.map((base) => `${base}${cleanPath}`);
}
function hasVisiblePageVideo() {
  return Array.from(document.querySelectorAll("video")).some(isVisiblePageVideo);
}
function isVisiblePageVideo(video) {
  if (video.closest("[data-jpdb-reader-root]")) return false;
  if (!hasRenderableVideoRect(video)) return false;
  if (isVideoHidden(video)) return false;
  return isAudiblyPlayingVideo(video);
}
function hasRenderableVideoRect(video) {
  const rect = video.getBoundingClientRect();
  return rect.width >= 120 && rect.height >= 90;
}
function isVideoHidden(video) {
  const style = getComputedStyle(video);
  return style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
}
function isAudiblyPlayingVideo(video) {
  return !video.paused && !video.ended && !video.muted && video.volume > 0;
}
const CARD_HIGHLIGHT_CLASS = "jpdb-reader-example-target";
function highlightCardTargetWords(root, card) {
  const words = cardHighlightWords(root);
  for (const word of words) {
  if (isCardHighlightWord(word, card)) word.classList.add(CARD_HIGHLIGHT_CLASS);
  }
}
function isCardHighlightWord(word, card) {
  const cardVid = card.vid === void 0 ? "" : String(card.vid);
  const cardSid = card.sid === void 0 ? "" : String(card.sid);
  if (cardVid && cardSid && word.dataset.vid === cardVid && word.dataset.sid === cardSid) return true;
  const surface = compactCardHighlightValue(readerWordSurfaceText(word));
  if (!surface) return false;
  return cardHighlightTargets(card).map(compactCardHighlightValue).filter(Boolean).some((target) => surface.includes(target));
}
function cardHighlightWords(root) {
  const words = Array.from(root.querySelectorAll(".jpdb-reader-word"));
  return root instanceof HTMLElement && root.matches(".jpdb-reader-word") ? [root, ...words] : words;
}
function cardKey(card) {
  return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}
function loadCachedParsedTokens(cache, key, limit, parse, shouldCache) {
  const cached = cache.get(key);
  if (cached) return cached.tokens ? Promise.resolve(cached.tokens) : cached.promise;
  const entry = { promise: Promise.resolve([]) };
  entry.promise = parse().then((tokens) => {
  if (shouldCache(tokens)) entry.tokens = tokens;
  else if (cache.get(key) === entry) cache.delete(key);
  return tokens;
  }).catch((error) => {
  if (cache.get(key) === entry) cache.delete(key);
  throw error;
  });
  cache.set(key, entry);
  pruneOldestCacheEntries(cache, limit);
  return entry.promise;
}
const LOW_VALUE_EXAMPLE_PART_RE = /\b(?:particle|conjunction|auxiliary)\b/i;
function exampleSentenceLookupTokens(tokens, targetCard) {
  return tokens.filter((token) => shouldKeepExampleSentenceToken(token, targetCard));
}
function shouldKeepExampleSentenceToken(token, targetCard) {
  if (targetCard && cardKey(token.card) === cardKey(targetCard)) return true;
  return !isLowValueExampleSentenceToken(token);
}
function isLowValueExampleSentenceToken(token) {
  const surfaceLength = token.end - token.start;
  if (surfaceLength > 2) return false;
  const spelling = token.card.spelling.trim();
  if (!spelling || !KANA_ONLY_RUN_RE.test(spelling)) return false;
  return LOW_VALUE_EXAMPLE_PART_RE.test(token.card.partOfSpeech.join(" "));
}
const QUERY_RUN_RE = new RegExp(`[${KANA}${KANJI_LIKE_WITH_COUNTERS}${PROLONGED_SOUND_MARK}]+`, "gu");
const SCRIPT_GROUP_RE = new RegExp(`[${KANJI_LIKE_WITH_COUNTERS}]+|[${HIRAGANA_WITH_PROLONGED}]+|[${KATAKANA_WITH_PROLONGED}]+`, "gu");
const COMMON_PARTICLES = /* @__PURE__ */ new Set(["は", "が", "を", "に", "へ", "で", "と", "も", "の", "や", "か", "ね", "よ", "ぞ", "ぜ", "な", "わ", "から", "まで", "だけ", "しか", "より"]);
const IMMERSION_FALLBACK_QUERY_LIMIT = 5;
function normalizeImmersionSearchQuery(value) {
  return value.replace(/\s+/g, " ").trim();
}
function queryKey(value) {
  return normalizeImmersionSearchQuery(value).replace(/\s+/g, "").toLowerCase();
}
function queryLength(value) {
  return Array.from(queryKey(value)).length;
}
function queryHasKanji(value) {
  return KANJI_LIKE_RE.test(value);
}
function shouldRequireOriginalSurfaceMatch(value) {
  return queryHasKanji(value) && queryLength(value) >= 3;
}
function shouldFilterImmersionExamplesBySurface(query) {
  return queryHasKanji(query) || shouldRequireOriginalSurfaceMatch(query);
}
function immersionSentenceContainsQuery(sentence, query) {
  const s = normalizeSurface(sentence);
  const q = normalizeSurface(query);
  return Boolean(q) && s.includes(q);
}
function isUsefulImmersionFallbackQuery(query, exactQuery) {
  if (isSameImmersionQuery(query, exactQuery)) return false;
  return isUsefulStandaloneQuery(query);
}
function uniqueImmersionQueries(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
  const query = normalizeImmersionSearchQuery(value);
  const key = queryKey(query);
  if (!query || seen.has(key)) continue;
  seen.add(key);
  result.push(query);
  }
  return result;
}
function immersionFallbackFragments(value) {
  const fragments = [];
  const runs = normalizeImmersionSearchQuery(value).match(QUERY_RUN_RE) ?? [];
  for (const run of runs) {
  fragments.push(...scriptFragments(run));
  }
  return uniqueImmersionQueries(fragments).sort(compareFallbackFragments);
}
function normalizeSurface(value) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
function isSameImmersionQuery(query, exactQuery) {
  return queryKey(query) === queryKey(exactQuery);
}
function isUsefulStandaloneQuery(query) {
  if (!query || !isTargetLanguageText(query)) return false;
  if (COMMON_PARTICLES.has(queryKey(query))) return false;
  return queryLength(query) >= 2;
}
function scriptFragments(run) {
  const groups = run.match(SCRIPT_GROUP_RE) ?? [];
  if (groups.length <= 1) return groups;
  const result = [...groups];
  for (let i = 0; i < groups.length; i++) {
  let q = groups[i];
  for (let j = i + 1; j < groups.length; j++) {
    q += groups[j];
    result.push(q);
  }
  }
  result.push(groups.filter(queryHasKanji).join(""));
  return result;
}
function compareFallbackFragments(a, b) {
  const order = Number(queryHasKanji(b)) - Number(queryHasKanji(a));
  if (order) return order;
  return queryLength(b) - queryLength(a);
}
function publishImmersionFrameWidth(media) {
  if (!media) return;
  const rect = media.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const width = immersionPaintedWidth(media, rect);
  if (width) media.style.setProperty("--yomu-immersion-frame-width", `${Math.round(width)}px`);
  else media.style.removeProperty("--yomu-immersion-frame-width");
}
function immersionPaintedWidth(media, rect) {
  const image = media.querySelector(".jpdb-reader-example-image");
  if (!image || !image.naturalWidth || !image.naturalHeight) return 0;
  return Math.min(rect.width, rect.height * (image.naturalWidth / image.naturalHeight));
}
const IMMERSION_SOURCE_TITLES_JA = {
  "My Neighbor Totoro": "となりのトトロ"
};
function localizedImmersionProviderLabel(example, language) {
  return example.provider === "nadeshiko" ? "Nadeshiko" : uiText(language, "immersionKit");
}
function localizedImmersionSourceTitle(title, language) {
  return resolveUiLanguage(language) === "ja" ? IMMERSION_SOURCE_TITLES_JA[title] ?? title : title;
}
function nextImmersionExampleIndex(index, total, action) {
  if (!Number.isFinite(index) || total <= 0) return 0;
  const delta = action === "next" ? 1 : action === "previous" ? -1 : 0;
  return (index + delta + total) % total;
}
function validImmersionExampleIndex(index, total) {
  return Number.isFinite(index) && index >= 0 && index < total ? index : 0;
}
function renderImmersionExampleActionsHtml(hasAudio, language) {
  const previous = uiText(language, "previousExample");
  const next = uiText(language, "nextExample");
  const audio = uiText(language, "playExampleAudio");
  return `
        <div class="jpdb-reader-example-actions" role="group" aria-label="${escapeHtml(uiText(language, "immersionExampleControls"))}">
            ${renderImmersionActionButtonHtml("previous", previous, "‹")}
            ${hasAudio ? renderImmersionActionButtonHtml("audio", audio, speakerIcon()) : ""}
            ${renderImmersionActionButtonHtml("next", next, "›")}
        </div>
    `;
}
function renderImmersionActionButtonHtml(action, label, content) {
  return `<button class="jpdb-reader-icon-mini" type="button" data-immersion-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${content}</button>`;
}
let activationTrackingWindow;
let pageHasUserActivation = false;
function canAttemptAudiblePlayback(userGesture = false) {
  installPageActivationTracking();
  if (userGesture) {
  pageHasUserActivation = true;
  return true;
  }
  const browserActivation = browserUserActivationState();
  if (browserActivation) pageHasUserActivation = true;
  if (browserActivation !== void 0) return true;
  if (pageHasUserActivation) return true;
  if (isFirefoxLikeBrowser()) return true;
  return true;
}
function installPageActivationTracking() {
  if (typeof window === "undefined" || activationTrackingWindow === window) return;
  activationTrackingWindow = window;
  const markActive = () => {
  pageHasUserActivation = true;
  };
  for (const eventName of ["click", "keydown", "pointerdown", "touchstart"]) {
  window.addEventListener(eventName, markActive, { capture: true, passive: true });
  }
}
function browserUserActivationState() {
  const activation = typeof navigator === "undefined" ? void 0 : navigator.userActivation;
  if (!activation) return void 0;
  return activation.hasBeenActive || activation.isActive;
}
function isFirefoxLikeBrowser() {
  return typeof navigator !== "undefined" && /firefox|iceweasel|fxios/i.test(navigator.userAgent ?? "");
}
installPageActivationTracking();
const CONTEXT_PREFIX = "yomu-mining-context:";
const CONTEXT_MAX_AGE_MS = 1e3 * 60 * 60 * 24 * 21;
const MINING_SOURCE_KINDS = ["page", "video", "image", "immersion-kit", "jpdb"];
const log$6 = Logger.scope("MiningContext");
function normalizeMiningSentence(sentence) {
  return (sentence ?? "").replace(/\s+/g, " ").trim();
}
function inferMiningSourceKind({ isImageSource, hasVideo, hostname = location.hostname } = {}) {
  if (isImageSource) return "image";
  if (hasVideo) return "video";
  if (hostname === "jpdb.io") return "jpdb";
  return "page";
}
function createStoredMiningContext(term, context, updatedAt = Date.now()) {
  const normalizedTerm = term.trim();
  const sentence = context.sentence.trim();
  if (!normalizedTerm || !sentence) return null;
  return {
  ...context,
  term: normalizedTerm,
  sentence,
  sourceTitle: context.sourceTitle.trim(),
  sourceUrl: context.sourceUrl.trim(),
  imageUrl: optionalText(context.imageUrl),
  audioUrls: optionalTextArray(context.audioUrls),
  immersionIndex: optionalNumber(context.immersionIndex),
  immersionTotal: optionalNumber(context.immersionTotal),
  updatedAt
  };
}
function createFallbackMiningContext(term, context, updatedAt = Date.now()) {
  return createStoredMiningContext(term, context, updatedAt) ?? {
  ...context,
  term: term.trim(),
  sentence: context.sentence.trim() || term.trim(),
  sourceTitle: context.sourceTitle.trim(),
  sourceUrl: context.sourceUrl.trim(),
  imageUrl: optionalText(context.imageUrl),
  audioUrls: optionalTextArray(context.audioUrls),
  immersionIndex: optionalNumber(context.immersionIndex),
  immersionTotal: optionalNumber(context.immersionTotal),
  updatedAt
  };
}
async function resolveMiningContext({
  term,
  sentence,
  settings,
  activeContext,
  storedContext,
  sourceKind,
  imageDataUrl,
  videoImageDataUrl,
  fetchImageDataUrl,
  fetchAudioDataUrl
}) {
  const done = log$6.time("Resolve mining context", {
  term,
  hasSentence: Boolean(sentence?.trim()),
  activeKind: activeContext?.sourceKind,
  storedKind: storedContext?.sourceKind,
  sourceKind,
  hasImage: Boolean(imageDataUrl),
  hasVideoImage: Boolean(videoImageDataUrl)
  });
  const cleanSentence = normalizeMiningSentence(sentence);
  try {
  const direct = resolveDirectImageMiningContext(term, cleanSentence, imageDataUrl, videoImageDataUrl);
  if (direct) return direct;
  const immersion = await resolveStoredImmersionMiningContext({
    term,
    settings,
    activeContext,
    storedContext,
    fetchImageDataUrl,
    fetchAudioDataUrl
  });
  return immersion ?? resolvePageMiningContext(term, cleanSentence, sourceKind);
  } finally {
  done();
  }
}
function resolveDirectImageMiningContext(term, sentence, imageDataUrl, videoImageDataUrl) {
  if (imageDataUrl && sentence) {
  return miningContextWithImage(term, sentence, "image", imageDataUrl);
  }
  if (videoImageDataUrl && sentence) {
  return miningContextWithImage(term, sentence, "video", videoImageDataUrl);
  }
  return null;
}
async function resolveStoredImmersionMiningContext(options) {
  const { term, settings, activeContext, storedContext, fetchImageDataUrl, fetchAudioDataUrl } = options;
  const chosen = activeContext?.term === term ? activeContext : storedContext ?? void 0;
  if (!chosen || !shouldUseImmersionContext(settings, chosen)) return null;
  const [fetchedImageDataUrl, fetchedAudioDataUrl] = await Promise.all([
  fetchMiningContextImage(chosen, settings, fetchImageDataUrl),
  fetchMiningContextAudio(chosen, settings, fetchAudioDataUrl)
  ]);
  return { ...chosen, imageDataUrl: fetchedImageDataUrl, audioDataUrl: fetchedAudioDataUrl };
}
function fetchMiningContextImage(context, settings, fetchImageDataUrl) {
  if (!context.imageUrl || !settings.immersionKitShowImages || !fetchImageDataUrl) return Promise.resolve(void 0);
  return fetchImageDataUrl(context.imageUrl, settings.audioTimeoutMs).catch(() => {
  return void 0;
  });
}
function fetchMiningContextAudio(context, settings, fetchAudioDataUrl) {
  if (!context.audioUrls?.length || !fetchAudioDataUrl) return Promise.resolve(void 0);
  return fetchAudioDataUrl(context.audioUrls, settings.audioTimeoutMs).catch(() => {
  return void 0;
  });
}
function resolvePageMiningContext(term, sentence, sourceKind) {
  const context = pageMiningContext(sentence || term, sourceKind ?? inferMiningSourceKind());
  const result = saveMiningContext(term, context) ?? createFallbackMiningContext(term, context);
  return result;
}
function miningContextWithImage(term, sentence, sourceKind, imageDataUrl) {
  const context = pageMiningContext(sentence, sourceKind);
  return {
  ...saveMiningContext(term, context) ?? createFallbackMiningContext(term, context),
  imageDataUrl
  };
}
function saveMiningContext(term, context) {
  const stored = createStoredMiningContext(term, context);
  if (!stored) {
  return null;
  }
  try {
  gmStorageSetSync(contextStorageKey(stored.term), stored);
  } catch (error) {
  log$6.warn("Mining context save failed", { term: stored.term, sourceKind: stored.sourceKind, error });
  }
  return stored;
}
function loadMiningContext(term) {
  const normalized = term.trim();
  if (!normalized) return null;
  try {
  const stored = gmStorageGetSync(contextStorageKey(normalized), null);
  if (!stored) {
    return null;
  }
  const context = parseStoredMiningContext(stored, normalized);
  return context;
  } catch (error) {
  log$6.warn("Mining context load failed", { term: normalized, error });
  return null;
  }
}
function immersionContextFromExample(term, example, index, total, imageUrl, audioUrls = []) {
  return {
  sentence: example.sentence,
  sourceKind: "immersion-kit",
  sourceTitle: example.sourceTitle || "Immersion Kit",
  sourceUrl: immersionKitUrl(term, index),
  imageUrl: imageUrl || void 0,
  audioUrls: optionalTextArray(audioUrls),
  immersionIndex: index,
  immersionTotal: total
  };
}
function immersionContextFromElement(sentence, element, sourceUrl = location.href) {
  return {
  sentence,
  sourceKind: "immersion-kit",
  sourceTitle: element.dataset.immersionSourceTitle || "Immersion Kit",
  sourceUrl,
  imageUrl: optionalText(element.dataset.immersionImageUrl),
  audioUrls: immersionAudioUrlsFromElement(element),
  immersionIndex: optionalNumber(Number(element.dataset.immersionIndex ?? 0)),
  immersionTotal: optionalNumber(Number(element.dataset.immersionTotal ?? 0))
  };
}
function pageMiningContext(sentence, sourceKind = "page") {
  return {
  sentence,
  sourceKind,
  sourceTitle: document.title || location.hostname,
  sourceUrl: location.href
  };
}
function contextLabel(context) {
  const immersionLabel = immersionContextLabel(context);
  if (immersionLabel) return immersionLabel;
  const prefix = CONTEXT_LABEL_PREFIXES[context.sourceKind];
  if (prefix) return `${prefix}: ${context.sourceTitle}`;
  return context.sourceTitle || context.sourceUrl || "Current page";
}
const CONTEXT_LABEL_PREFIXES = {
  video: "Video",
  image: "Image",
  jpdb: "JPDB"
};
function immersionContextLabel(context) {
  return context.sourceKind === "immersion-kit" && context.immersionIndex !== void 0 && context.immersionTotal ? `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}` : "";
}
function shouldUseImmersionContext(settings, context) {
  return Boolean(settings.immersionKitEnabled && context?.sourceKind === "immersion-kit" && context.sentence.trim());
}
function contextStorageKey(term) {
  return `${CONTEXT_PREFIX}${term}`;
}
function parseStoredMiningContext(value, expectedTerm, now = Date.now()) {
  const record2 = storedMiningContextRecord(value, expectedTerm);
  if (!record2) return null;
  const sourceKind = storedMiningSourceKind(record2.sourceKind);
  if (!sourceKind) return null;
  const updatedAt = storedMiningContextUpdatedAt(record2.updatedAt, now);
  if (updatedAt === null) return null;
  const context = createStoredMiningContext(expectedTerm, {
  sentence: text(record2.sentence),
  sourceKind,
  sourceTitle: text(record2.sourceTitle),
  sourceUrl: text(record2.sourceUrl),
  imageUrl: optionalText(record2.imageUrl),
  audioUrls: optionalTextArray(record2.audioUrls),
  immersionIndex: optionalNumber(record2.immersionIndex),
  immersionTotal: optionalNumber(record2.immersionTotal)
  }, updatedAt);
  return context;
}
function storedMiningContextRecord(value, expectedTerm) {
  if (!isNonNullObject(value)) return null;
  return text(value.term) === expectedTerm ? value : null;
}
function storedMiningSourceKind(value) {
  return isMiningSourceKind(value) ? value : null;
}
function storedMiningContextUpdatedAt(value, now) {
  const updatedAt = Number(value);
  if (!isStoredMiningContextFresh(updatedAt, now)) {
  return null;
  }
  return updatedAt;
}
function isStoredMiningContextFresh(updatedAt, now) {
  return Number.isFinite(updatedAt) && now - updatedAt <= CONTEXT_MAX_AGE_MS;
}
function isMiningSourceKind(value) {
  return typeof value === "string" && MINING_SOURCE_KINDS.includes(value);
}
function optionalText(value) {
  const normalized = text(value);
  return normalized || void 0;
}
function optionalTextArray(value) {
  if (!Array.isArray(value)) return void 0;
  const values = uniqueTexts(value);
  return values.length ? values : void 0;
}
function immersionAudioUrlsFromElement(element) {
  const parsed = parseTextArray(element.dataset.immersionAudioUrls);
  return optionalTextArray(parsed ?? [element.dataset.immersionAudioUrl]);
}
function parseTextArray(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : null;
  } catch {
  return null;
  }
}
function uniqueTexts(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}
function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : void 0;
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function immersionKitUrl(term, index) {
  const url = new URL("https://www.immersionkit.com/dictionary");
  url.searchParams.set("keyword", term);
  url.searchParams.set("sort", "sentence_length:asc");
  url.searchParams.set("page", String(index + 1));
  return url.toString();
}
function popoverScrollBody(popover) {
  return popover.querySelector(".jpdb-reader-popover-body") ?? popover;
}
function capturePopoverScrollFrame(target) {
  const popover = target.closest(".jpdb-reader-popover") ?? target;
  const scrollBody = target.closest(".jpdb-reader-popover-body") ?? popoverScrollBody(popover);
  return { scrollBody, scrollTop: scrollBody.scrollTop };
}
function restorePopoverScrollFrame(frame) {
  if (!frame.scrollBody.isConnected) return;
  if (frame.scrollBody.scrollTop !== frame.scrollTop) frame.scrollBody.scrollTop = frame.scrollTop;
}
function restorePopoverScrollFrameSoon(frame) {
  restorePopoverScrollFrame(frame);
  requestAnimationFrame(() => restorePopoverScrollFrame(frame));
}
Logger.scope("DictionaryArchiveCache");
Logger.scope("Yomitan");
new TextDecoder();
Logger.scope("YomitanSettingsImport");
Logger.scope("Yomitan");
Logger.scope("ReaderParser");
function apiFirstParseOptions(options = {}) {
  const requireApi = options.requireApi ?? options.requireJpdb ?? true;
  return { includeLocalPitch: false, ...options, requireApi };
}
function jpdbFirstParseOptions(options = {}) {
  const requireApi = options.requireApi ?? options.requireJpdb ?? true;
  const requireJpdb = options.requireJpdb ?? requireApi;
  return apiFirstParseOptions({ ...options, requireApi, requireJpdb });
}
const IMMERSION_SEARCH_CACHE_TTL_MS = 5 * 60 * 1e3;
const IMMERSION_SEARCH_CACHE_LIMIT = 120;
const IMMERSION_POPUP_EXAMPLE_LIMIT = 12;
const IMMERSION_POPUP_SEARCH_REQUEST_LIMIT = 10;
const IMMERSION_LAZY_LOAD_DELAY_MS = 180;
const IMMERSION_VISIBLE_LOAD_DELAY_MS = 60;
const IMMERSION_LOAD_TIMEOUT_GRACE_MS = 1e3;
const IMMERSION_LAZY_LOAD_ROOT_MARGIN = "180px 0px";
const IMMERSION_LAZY_LOAD_VISIBILITY_MARGIN_PX = 180;
const IMMERSION_HOVER_AUDIO_KEY_LIMIT = 240;
const IMMERSION_CONTEXT_CACHE_LIMIT = 160;
const IMMERSION_FALLBACK_SEARCH_CONCURRENCY = 2;
const IMMERSION_PARSED_SENTENCE_CACHE_LIMIT = 160;
const log$5 = Logger.scope("ImmersionPopover");
class ImmersionPopoverController {
  constructor(options) {
  this.options = options;
  }
  hoverAudioPlayedKeys = /* @__PURE__ */ new Set();
  activeMiningContext;
  contextByCardKey = /* @__PURE__ */ new Map();
  searchResultCache = /* @__PURE__ */ new Map();
  parsedSentenceCache = /* @__PURE__ */ new Map();
  loadAbortControllers = /* @__PURE__ */ new WeakMap();
  lazyLoadTimers = /* @__PURE__ */ new WeakMap();
  lazyLoadObservers = /* @__PURE__ */ new WeakMap();
  abortPendingRequests(popover) {
  const container = popover.querySelector("[data-immersion-kit]");
  if (container) {
    this.clearLazyLoadTimer(container);
    this.disconnectLazyLoadObserver(container);
  }
  this.abortActiveLoad(popover);
  }
  abortActiveLoad(popover) {
  const controller = this.loadAbortControllers.get(popover);
  if (!controller) return;
  controller.abort();
  this.loadAbortControllers.delete(popover);
  }
  hasActiveContext(card, sentence) {
  return this.activeMiningContext?.term === card.spelling && this.activeMiningContext.sentence === (sentence || "").replace(/\s+/g, " ").trim();
  }
  activeContextFor(card) {
  return this.activeMiningContext?.term === card.spelling ? this.activeMiningContext : void 0;
  }
  storedContextFor(card) {
  return this.contextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
  }
  preferredExampleFor(card, examples) {
  return examples[this.startIndex(card, examples)];
  }
  rememberPageMiningContext(card, sentence, anchor) {
  const cleanSentence = normalizeMiningSentence(sentence);
  if (!isPageMiningSentence(cleanSentence, card)) return;
  this.rememberStoredMiningContext(saveMiningContext(card.spelling, this.pageMiningContextDraft(cleanSentence, anchor)));
  }
  rememberTermMiningContext(term, sentence, anchor) {
  const cleanTerm = term.trim();
  const cleanSentence = normalizeMiningSentence(sentence);
  if (!cleanTerm || !isPageMiningSentence(cleanSentence, { spelling: cleanTerm })) return;
  this.rememberStoredMiningContext(saveMiningContext(cleanTerm, this.pageMiningContextDraft(cleanSentence, anchor)));
  }
  pageMiningContextDraft(sentence, anchor) {
  const immersionCard = anchor?.closest(".jpdb-reader-example-card") ?? null;
  if (immersionCard) return immersionContextFromElement(sentence, immersionCard);
  const sourceKind = pageMiningSourceKind(anchor);
  return pageMiningContext(sentence, sourceKind);
  }
  rememberStoredMiningContext(stored) {
  if (!stored) return;
  this.activeMiningContext = stored;
  }
  async loadExamples(popover, card, options = {}) {
  const container = popover.querySelector("[data-immersion-kit]");
  if (!container) return;
  this.abortActiveLoad(popover);
  const controller = new AbortController();
  this.loadAbortControllers.set(popover, controller);
  const searchPromise = this.searchExamples(card, { ...options, signal: controller.signal });
  const settings = this.options.getSettings();
  try {
    const result = await raceAgainstAbortOrTimeout(
      searchPromise,
      controller.signal,
      settings.audioTimeoutMs + IMMERSION_LOAD_TIMEOUT_GRACE_MS
    );
    if (this.shouldSkipLoadedExamplesRender(popover, container, controller)) return;
    this.renderLoadedExamples(container, card, result);
  } catch (error) {
    if (this.shouldIgnoreAbortedExampleLoad(error, controller, container)) return;
    log$5.warn("Immersion Kit examples failed", { term: card.spelling }, error);
    this.renderEmptyIfConnected(popover, container);
  } finally {
    if (this.loadAbortControllers.get(popover) === controller) this.loadAbortControllers.delete(popover);
  }
  }
  shouldSkipLoadedExamplesRender(popover, container, controller) {
  if (!controller.signal.aborted && isConnectedImmersionSurface(popover, container)) return false;
  clearImmersionLoadingState(container);
  return true;
  }
  shouldIgnoreAbortedExampleLoad(error, controller, container) {
  if (!isAbortError(error) || !controller.signal.aborted) return false;
  clearImmersionLoadingState(container);
  return true;
  }
  installLazyLoad(popover, card, options = {}) {
  const container = popover.querySelector("[data-immersion-kit]");
  if (!container || container.dataset.immersionLazyBound === "true") return;
  container.dataset.immersionLazyBound = "true";
  const canLoad = () => this.canStartLazyLoad(popover, container);
  const scheduleLoad = (delayMs) => {
    if (!canLoad()) return;
    if (container.dataset.immersionLoadState === "scheduled") return;
    this.clearLazyLoadTimer(container);
    container.dataset.immersionLoadState = "scheduled";
    const timer = window.setTimeout(() => {
      this.lazyLoadTimers.delete(container);
      if (!canLoad()) {
        if (container.dataset.immersionLoadState === "scheduled") delete container.dataset.immersionLoadState;
        return;
      }
      container.dataset.immersionLoadState = "loading";
      void this.loadExamples(popover, card, options).then(() => {
        if (container.dataset.immersionLoadState !== "loading") return;
        container.dataset.immersionLoadState = "loaded";
      }).catch(() => {
        if (container.dataset.immersionLoadState === "loading") delete container.dataset.immersionLoadState;
      });
    }, delayMs);
    this.lazyLoadTimers.set(container, timer);
  };
  const maybeLoad = () => {
    if (!canLoad()) return;
    scheduleLoad(isImmersionNearVisibleArea(popover, container) ? IMMERSION_VISIBLE_LOAD_DELAY_MS : IMMERSION_LAZY_LOAD_DELAY_MS);
  };
  const handleToggle = () => {
    if (!container.open) {
      this.clearLazyLoadTimer(container);
      if (container.dataset.immersionLoadState === "scheduled" || container.dataset.immersionLoadState === "loading") {
        delete container.dataset.immersionLoadState;
      }
      this.abortActiveLoad(popover);
      return;
    }
    maybeLoad();
  };
  container.addEventListener("toggle", handleToggle);
  this.installLazyVisibilityObserver(popover, container, maybeLoad);
  maybeLoad();
  }
  canStartLazyLoad(popover, container) {
  return isConnectedImmersionSurface(popover, container) && container.open && container.dataset.immersionEmpty !== "true" && !["loading", "loaded"].includes(container.dataset.immersionLoadState ?? "");
  }
  installLazyVisibilityObserver(popover, container, maybeLoad) {
  if (typeof IntersectionObserver !== "function") return;
  const observer = new IntersectionObserver((entries2) => {
    if (entries2.some((entry) => entry.isIntersecting)) maybeLoad();
  }, {
    root: immersionLazyLoadRoot(popover, container),
    rootMargin: IMMERSION_LAZY_LOAD_ROOT_MARGIN
  });
  observer.observe(container);
  this.lazyLoadObservers.set(container, observer);
  }
  clearLazyLoadTimer(container) {
  const timer = this.lazyLoadTimers.get(container);
  if (timer === void 0) return;
  window.clearTimeout(timer);
  this.lazyLoadTimers.delete(container);
  if (container.dataset.immersionLoadState === "scheduled") delete container.dataset.immersionLoadState;
  }
  disconnectLazyLoadObserver(container) {
  this.lazyLoadObservers.get(container)?.disconnect();
  this.lazyLoadObservers.delete(container);
  }
  renderLoadedExamples(container, card, result) {
  const { examples } = result;
  if (!examples.length) {
    this.renderEmpty(container);
    return;
  }
  this.bindExampleCarousel(container, card, result);
  }
  bindExampleCarousel(container, card, result) {
  const { examples } = result;
  let index = this.startIndex(card, examples);
  let renderRequest = 0;
  let hoverAudioCanPlay = true;
  let hoverAudioActive = false;
  const render = (nextIndex, playAudio, promoteMiningContext = false) => {
    const requestId = ++renderRequest;
    index = validImmersionExampleIndex(nextIndex, examples.length);
    this.renderExample(container, card, examples, index, playAudio, result.query, () => requestId === renderRequest, promoteMiningContext);
    bindHoverMedia();
  };
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-immersion-action]");
    const media = event.target.closest(".jpdb-reader-example-media");
    const translation = event.target.closest(".jpdb-reader-example-translation");
    if (translation) {
      event.preventDefault();
      event.stopPropagation();
      this.toggleTranslationBlur(container);
      return;
    }
    if (!button && (!media || !this.options.getSettings().immersionKitPlayOnImageClick)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!button) {
      void this.playExampleAudio(examples[index]);
      return;
    }
    const action = button.dataset.immersionAction;
    if (action === "previous" || action === "next") render(nextImmersionExampleIndex(index, examples.length, action), this.shouldAutoPlayCarouselAudio(), true);
    if (action === "audio") void this.playExampleAudio(examples[index]);
  });
  container.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const translation = event.target.closest(".jpdb-reader-example-translation");
    if (!translation) return;
    event.preventDefault();
    this.toggleTranslationBlur(container);
  });
  const playHoverAudioForTarget = (hoverTarget, pointerType, relatedTarget) => {
    if (!this.canPlayHoverAudioForTarget(hoverTarget, pointerType, relatedTarget, hoverAudioCanPlay)) return;
    const example = examples[index];
    if (!this.rememberHoverAudioExample(example)) return;
    hoverAudioCanPlay = false;
    hoverAudioActive = true;
    void this.playExampleAudio(example, true, () => hoverAudioActive && container.isConnected && hoverTarget.isConnected && hoverTarget.matches(":hover"));
  };
  const handleImmersionHover = (event) => {
    const hoverTarget = event.target.closest?.(".jpdb-reader-example-media, .jpdb-reader-example-card");
    if (hoverTarget) playHoverAudioForTarget(hoverTarget, "pointerType" in event ? event.pointerType : "mouse", event.relatedTarget);
  };
  const bindHoverMedia = () => {
    container.querySelectorAll(".jpdb-reader-example-media, .jpdb-reader-example-card").forEach((hoverTarget) => {
      if (hoverTarget.dataset.immersionHoverBound === "true") return;
      hoverTarget.dataset.immersionHoverBound = "true";
      hoverTarget.addEventListener("pointerover", handleImmersionHover);
      hoverTarget.addEventListener("mouseover", handleImmersionHover);
      requestAnimationFrame(() => {
        if (hoverTarget.isConnected && hoverTarget.matches(":hover")) playHoverAudioForTarget(hoverTarget, "mouse", null);
      });
    });
  };
  container.addEventListener("pointerleave", () => {
    hoverAudioCanPlay = true;
    hoverAudioActive = false;
  });
  container.addEventListener("mouseleave", () => {
    hoverAudioCanPlay = true;
    hoverAudioActive = false;
  });
  render(index, false);
  }
  shouldAutoPlayCarouselAudio() {
  const settings = this.options.getSettings();
  return settings.immersionKitEnabled && settings.immersionKitAutoPlayAudio && !this.shouldSuppressAutoAudioForVideo() && canAttemptAudiblePlayback(true);
  }
  canPlayHoverAudioForTarget(hoverTarget, pointerType, relatedTarget, hoverAudioCanPlay) {
  if (!this.options.getSettings().immersionKitPlayOnHover) return false;
  if (isHoverAudioPointerSuppressed(pointerType)) return false;
  if (hoverTarget.contains(relatedTarget)) return false;
  if (!hoverAudioCanPlay) return false;
  if (this.shouldSuppressAutoAudioForVideo()) return false;
  return canAttemptAudiblePlayback();
  }
  rememberHoverAudioExample(example) {
  const audioKey = hoverAudioExampleKey(example);
  if (this.hoverAudioPlayedKeys.has(audioKey)) return false;
  this.hoverAudioPlayedKeys.add(audioKey);
  pruneOldestCacheEntries(this.hoverAudioPlayedKeys, IMMERSION_HOVER_AUDIO_KEY_LIMIT);
  return true;
  }
  shouldSuppressAutoAudioForVideo() {
  const settings = this.options.getSettings();
  return settings.suppressAutoAudioOnVideo && hasVisiblePageVideo();
  }
  renderEmptyIfConnected(popover, container) {
  if (!isConnectedImmersionSurface(popover, container)) return;
  this.renderEmpty(container);
  }
  async searchExamples(card, options = {}) {
  const key = this.searchCacheKey(card, options);
  const now = Date.now();
  const cached = this.searchResultCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (options.signal) {
    return this.fetchExamples(card, options).then((result) => {
      if (!options.signal?.aborted) this.rememberSearchResult(key, result);
      return result;
    });
  }
  const promise = this.fetchExamples(card, options).catch((error) => {
    if (this.searchResultCache.get(key)?.promise === promise) this.searchResultCache.delete(key);
    throw error;
  });
  this.searchResultCache.set(key, { expiresAt: now + IMMERSION_SEARCH_CACHE_TTL_MS, promise });
  pruneImmersionSearchCache(this.searchResultCache, now, IMMERSION_SEARCH_CACHE_LIMIT);
  return promise;
  }
  rememberSearchResult(key, result) {
  const now = Date.now();
  this.searchResultCache.set(key, { expiresAt: now + IMMERSION_SEARCH_CACHE_TTL_MS, promise: Promise.resolve(result) });
  pruneImmersionSearchCache(this.searchResultCache, now, IMMERSION_SEARCH_CACHE_LIMIT);
  }
  stopAudio() {
  this.options.audio.stop();
  }
  async fetchExamples(card, options) {
  const exactQuery = normalizeImmersionSearchQuery(card.spelling);
  const triedQueries = [];
  const exactResult = await this.fetchExamplesForQuery(exactQuery, exactQuery, triedQueries, options.signal);
  if (exactResult) return exactResult;
  if (options.exactOnly) return { examples: [], query: exactQuery, usedFallback: false, triedQueries };
  const queries = await this.immersionFallbackSearchQueries(card, options, exactQuery);
  const fallbackResult = await this.fetchFirstFallbackExamples(queries, exactQuery, triedQueries, options.signal);
  if (fallbackResult) return fallbackResult;
  return { examples: [], query: exactQuery, usedFallback: false, triedQueries };
  }
  fetchFirstFallbackExamples(queries, exactQuery, triedQueries, signal) {
  if (!queries.length) return Promise.resolve(null);
  const concurrency = Math.min(IMMERSION_FALLBACK_SEARCH_CONCURRENCY, queries.length);
  let nextIndex = 0;
  let active = 0;
  let settled = false;
  return new Promise((resolve, reject) => {
    const cleanupAbortListener = () => {
      signal?.removeEventListener("abort", handleAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanupAbortListener();
      reject(error);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanupAbortListener();
      resolve(result);
    };
    const handleAbort = () => fail(abortErrorForRace());
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    const launch = () => {
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      while (!settled && active < concurrency && nextIndex < queries.length) {
        const query = queries[nextIndex++];
        active++;
        void this.fetchExamplesForQuery(query, exactQuery, triedQueries, signal).then((result) => {
          active--;
          if (result) {
            finish(result);
            return;
          }
          if (nextIndex >= queries.length && active === 0) finish(null);
          else launch();
        }).catch((error) => {
          active--;
          if (signal?.aborted) {
            handleAbort();
            return;
          }
          if (isAbortError(error)) {
            fail(error);
            return;
          }
          if (nextIndex >= queries.length && active === 0) finish(null);
          else launch();
        });
      }
    };
    launch();
  });
  }
  async immersionFallbackSearchQueries(card, options, exactQuery) {
  const relatedQueries = uniqueImmersionQueries(options.relatedQueries ?? []).map(normalizeImmersionSearchQuery).filter((query) => isUsefulImmersionFallbackQuery(query, exactQuery));
  const fallbackQueries = await this.fallbackQueries(card, exactQuery);
  return uniqueImmersionQueries([...relatedQueries, ...fallbackQueries]).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
  }
  async fetchExamplesForQuery(query, exactQuery, triedQueries, signal) {
  if (!query) return null;
  if (signal?.aborted) throw abortErrorForRace();
  triedQueries.push(query);
  try {
    const settings = this.options.getSettings();
    const searchOptions = this.popupSearchOptions(settings, signal);
    const examples = await this.options.client.search(query, settings, searchOptions);
    return immersionSearchResultForQuery(query, exactQuery, triedQueries, examples);
  } catch (error) {
    if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
    return null;
  }
  }
  popupSearchOptions(settings, signal) {
  const resultLimit = settings.immersionKitLimitEnabled ? Math.min(settings.immersionKitLimit, IMMERSION_POPUP_EXAMPLE_LIMIT) : IMMERSION_POPUP_EXAMPLE_LIMIT;
  return {
    requestLimit: IMMERSION_POPUP_SEARCH_REQUEST_LIMIT,
    resultLimit,
    fastFirst: true,
    ...signal ? { signal } : {}
  };
  }
  searchCacheKey(card, options) {
  const settings = this.options.getSettings();
  return JSON.stringify({
    spelling: card.spelling,
    reading: card.reading,
    enabled: settings.immersionKitEnabled,
    source: settings.immersionKitExampleSource,
    nadeshikoKey: Boolean(settings.nadeshikoApiKey.trim()),
    limit: settings.immersionKitLimit,
    limitEnabled: settings.immersionKitLimitEnabled,
    min: settings.immersionKitMinLength,
    max: settings.immersionKitMaxLength,
    category: settings.immersionKitCategory,
    sort: settings.immersionKitSort,
    exact: settings.immersionKitExactMatch,
    parse: this.options.canParseJapanese(),
    exactOnly: Boolean(options.exactOnly),
    relatedQueries: uniqueImmersionQueries(options.relatedQueries ?? []).map(normalizeImmersionSearchQuery)
  });
  }
  async fallbackQueries(card, exactQuery) {
  const candidates = [];
  addImmersionFallbackQuery(candidates, card.reading !== card.spelling ? card.reading : "", exactQuery);
  await this.addParsedFallbackQueries(candidates, card, exactQuery);
  addImmersionFallbackQueries(candidates, immersionFallbackFragments(card.spelling), exactQuery);
  return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
  }
  async addParsedFallbackQueries(candidates, card, exactQuery) {
  if (!this.options.canParseJapanese()) return;
  const tokens = await this.fallbackParseTokens(card);
  addImmersionFallbackQueries(candidates, fallbackTokenQueries(card, tokens), exactQuery);
  }
  async fallbackParseTokens(card) {
  const [tokens] = await this.options.parseJapanese([card.spelling], { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true }).catch(() => {
    return [[]];
  });
  return tokens ?? [];
  }
  renderEmpty(container) {
  container.removeAttribute("open");
  container.dataset.immersionEmpty = "true";
  container.hidden = true;
  setInnerHtml(container, "");
  this.options.repositionPopover();
  }
  startIndex(card, examples) {
  const context = this.miningContextForStartIndex(card);
  if (!context || context.sourceKind !== "immersion-kit") return 0;
  const sentenceIndex = examples.findIndex((example) => example.sentence === context.sentence);
  if (sentenceIndex >= 0) return sentenceIndex;
  return validImmersionExampleIndex(Number(context.immersionIndex), examples.length);
  }
  miningContextForStartIndex(card) {
  return this.activeMiningContext?.term === card.spelling ? this.activeMiningContext : this.contextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
  }
  renderExample(container, card, examples, index, playAudio, searchQuery, isCurrent = () => true, promoteMiningContext = false) {
  const example = examples[index];
  const settings = this.options.getSettings();
  const imageUrls = settings.immersionKitShowImages ? this.mediaUrls(example, "image") : [];
  const audioUrls = this.mediaUrls(example, "sound");
  const hasAudio = audioUrls.length > 0;
  const imageUrl = imageUrls[0] ?? "";
  const contextImageUrl = immersionMiningImageUrl(imageUrls);
  const cachedTokens = this.cachedParsedExampleSentenceTokens(example.sentence);
  this.rememberExampleMiningContext(card, example, index, examples.length, contextImageUrl, audioUrls, promoteMiningContext);
  delete container.dataset.immersionEmpty;
  container.hidden = false;
  const scrollFrame = capturePopoverScrollFrame(container);
  setInnerHtml(container, this.renderExampleHtml(container, card, example, examples.length, index, searchQuery, settings, imageUrl, contextImageUrl, audioUrls, hasAudio));
  this.loadRenderedExampleImages(
    container,
    imageUrls,
    isCurrent,
    this.shouldPrefetchAdjacentExampleImage(container) ? () => this.prefetchNextExampleImage(examples, index, settings) : void 0
  );
  this.options.repositionPopover();
  restorePopoverScrollFrameSoon(scrollFrame);
  if (playAudio) void this.playExampleAudio(example, true);
  if (cachedTokens) this.applyParsedExampleSentence(container, card, example, cachedTokens, { updateHtml: false });
  else this.parseRenderedExampleSentence(container, card, example, isCurrent);
  }
  rememberExampleMiningContext(card, example, index, total, imageUrl, audioUrls, promoteMiningContext) {
  const storedContext = saveMiningContext(card.spelling, immersionContextFromExample(card.spelling, example, index, total, imageUrl, audioUrls));
  if (storedContext) {
    this.contextByCardKey.set(cardKey(card), storedContext);
    pruneOldestCacheEntries(this.contextByCardKey, IMMERSION_CONTEXT_CACHE_LIMIT);
    this.promoteExampleMiningContext(card, storedContext, promoteMiningContext);
  }
  }
  promoteExampleMiningContext(card, storedContext, promoteMiningContext) {
  if (shouldPromoteExampleMiningContext(this.activeMiningContext, card, promoteMiningContext)) this.activeMiningContext = storedContext;
  }
  renderExampleHtml(container, card, example, total, index, searchQuery, settings, imageUrl, contextImageUrl, audioUrls, hasAudio) {
  const language = settings.interfaceLanguage;
  const sentenceHtml = this.renderExampleSentenceContent(example.sentence, card, settings);
  const translation = renderExampleTranslation(example.translation, settings);
  const sourceLabel = immersionExampleSourceLabel(card, example, searchQuery, language);
  const sentence = renderExampleSentenceHtml(sentenceHtml, Boolean(imageUrl));
  const image = renderExampleImageHtml(container, imageUrl, sentence);
  return `
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(immersionExampleProviderLabel(example, language))}</span>
            </summary>
            ${renderImmersionSearchLinksHtml(card.spelling, language)}
            <div class="jpdb-reader-example-toolbar">
                <div class="jpdb-reader-example-meta jpdb-reader-example-meta-compact">
                    <span class="jpdb-reader-example-title">${escapeHtml(sourceLabel)}</span>
                    <span class="jpdb-reader-example-count">${index + 1}/${total}</span>
                </div>
                ${renderImmersionExampleActionsHtml(hasAudio, language)}
            </div>
            <div class="jpdb-reader-example-card ${image ? "has-image" : ""}" data-immersion-index="${index}" data-immersion-total="${total}" data-immersion-sentence="${escapeHtml(example.sentence)}" data-immersion-source-title="${escapeHtml(example.sourceTitle)}" data-immersion-image-url="${escapeHtml(contextImageUrl)}" data-immersion-audio-urls="${escapeHtml(JSON.stringify(audioUrls))}">
                <div class="jpdb-reader-example-body">
                    ${image}
                    ${image ? "" : sentence}
                    ${translation}
                </div>
            </div>
        `;
  }
  renderExampleSentenceContent(sentence, card, settings) {
  const tokens = this.cachedParsedExampleSentenceTokens(sentence);
  return tokens ? renderTokensToHtml(sentence, exampleSentenceLookupTokens(tokens, card), settings) : renderHighlightedTextHtml(sentence, cardHighlightTargets(card), "jpdb-reader-example-target");
  }
  loadRenderedExampleImages(container, imageUrls, isCurrent, onCurrentImageReady) {
  let currentImageReady = false;
  const publishCurrentImageReady = (imageElement) => {
    if (currentImageReady || !isCurrent() || !container.isConnected || !imageElement.isConnected) return;
    currentImageReady = true;
    onCurrentImageReady?.();
  };
  container.querySelectorAll("[data-immersion-image]").forEach((imageElement) => {
    let imageCandidateIndex = 0;
    let imageRequestId = 0;
    const holdUntilReady = imageElement.dataset.immersionHoldUntilReady === "true";
    let pendingImage = null;
    const showImageCandidate = (sourceUrl, displayUrl) => {
      imageElement.dataset.immersionImageSrc = sourceUrl;
      imageElement.src = displayUrl;
      imageElement.removeAttribute("data-immersion-hold-until-ready");
    };
    const loadNextImageCandidate = () => {
      if (!isCurrent() || !imageElement.isConnected) return;
      const fallbackUrl = imageUrls[imageCandidateIndex++];
      if (!fallbackUrl) {
        if (imageElement.complete && imageElement.naturalWidth > 0) return;
        this.hideBrokenExampleImage(container, imageElement);
        return;
      }
      const currentSrc = imageElement.currentSrc || imageElement.src;
      const requestId = ++imageRequestId;
      const settings = this.options.getSettings();
      this.options.client.fetchBlobUrl(fallbackUrl, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage).then((displayUrl) => {
        if (requestId !== imageRequestId || !isCurrent() || !imageElement.isConnected) return;
        if (!holdUntilReady || currentSrc === displayUrl) {
          showImageCandidate(fallbackUrl, displayUrl);
          return;
        }
        const preload = new Image();
        pendingImage = preload;
        preload.decoding = "async";
        preload.onload = () => {
          if (pendingImage !== preload || requestId !== imageRequestId || !isCurrent() || !imageElement.isConnected) return;
          pendingImage = null;
          showImageCandidate(fallbackUrl, displayUrl);
          this.options.repositionPopover();
        };
        preload.onerror = () => {
          if (pendingImage !== preload || requestId !== imageRequestId) return;
          pendingImage = null;
          loadNextImageCandidate();
        };
        preload.src = displayUrl;
      }).catch(() => {
        if (requestId !== imageRequestId || !isCurrent() || !imageElement.isConnected) return;
        showImageCandidate(fallbackUrl, fallbackUrl);
      });
    };
    imageElement.addEventListener("error", loadNextImageCandidate);
    imageElement.addEventListener("load", () => {
      publishImmersionFrameWidth(imageElement.closest(".jpdb-reader-example-media"));
      publishCurrentImageReady(imageElement);
    });
    imageElement.addEventListener("load", () => this.options.repositionPopover(), { once: true });
    if (!imageElement.dataset.immersionImageSrc) {
      this.hideBrokenExampleImage(container, imageElement);
      return;
    }
    loadNextImageCandidate();
  });
  }
  prefetchNextExampleImage(examples, index, settings) {
  if (!settings.immersionKitShowImages || examples.length < 2) return;
  const next = examples[nextImmersionExampleIndex(index, examples.length, "next")];
  if (!next) return;
  const imageUrls = this.mediaUrls(next, "image");
  if (!imageUrls.length) return;
  void this.options.client.fetchBlobUrl(
    imageUrls[0],
    settings.audioTimeoutMs,
    settings.corsProxyUrl,
    settings.interfaceLanguage
  ).catch(() => void 0);
  }
  shouldPrefetchAdjacentExampleImage(container) {
  return Boolean(container.closest('[data-yomu-jpdb-addon][data-yomu-page-context="review"]'));
  }
  hideBrokenExampleImage(container, imageElement) {
  if (!imageElement.isConnected) return;
  const media = imageElement.closest(".jpdb-reader-example-media");
  const sentence = media?.querySelector(".jpdb-reader-example-sentence");
  if (sentence) {
    sentence.classList.remove("jpdb-subtitle-primary");
    sentence.querySelectorAll(".jpdb-subtitle-primary").forEach((element) => {
      element.classList.remove("jpdb-subtitle-primary");
    });
    media?.after(sentence);
  }
  media?.remove();
  if (imageElement.isConnected) imageElement.remove();
  container.querySelector(".jpdb-reader-example-card")?.classList.remove("has-image");
  this.options.repositionPopover();
  }
  parseRenderedExampleSentence(container, card, example, isCurrent) {
  void this.parsedExampleSentenceTokens(example.sentence).then((tokens) => {
    if (!isCurrent() || !container.isConnected) return;
    this.applyParsedExampleSentence(container, card, example, tokens);
  }).catch(() => void 0);
  }
  applyParsedExampleSentence(container, card, example, tokens, options = {}) {
  const sentence = container.querySelector("[data-immersion-sentence-render]");
  if (!sentence) return;
  const lookupTokens = exampleSentenceLookupTokens(tokens, card);
  if (options.updateHtml !== false) {
    setInnerHtml(sentence, renderTokensToHtml(example.sentence, lookupTokens, this.options.getSettings()));
  }
  this.highlightTarget(sentence, card);
  void this.options.enrichPitchWords(lookupTokens);
  void this.options.enrichAnkiWords(lookupTokens, [container]);
  this.options.repositionPopover();
  }
  parsedExampleSentenceTokens(sentence) {
  const key = sentence.trim();
  if (!key) return Promise.resolve([]);
  return loadCachedParsedTokens(
    this.parsedSentenceCache,
    key,
    IMMERSION_PARSED_SENTENCE_CACHE_LIMIT,
    () => this.options.parseJapanese([sentence], this.exampleSentenceParseOptions()).then(([tokens]) => {
      return tokens ?? [];
    }),
    shouldCacheParsedExampleSentenceTokens
  );
  }
  exampleSentenceParseOptions() {
  const settings = this.options.getSettings();
  return jpdbFirstParseOptions(hasJpdbApiCredential(settings) ? { includeLocalPitch: true } : { allowSegmentedFallback: true, includeLocalPitch: true });
  }
  cachedParsedExampleSentenceTokens(sentence) {
  return this.parsedSentenceCache.get(sentence.trim())?.tokens;
  }
  highlightTarget(sentence, card) {
  highlightCardTargetWords(sentence, card);
  }
  toggleTranslationBlur(container) {
  const settings = this.options.getSettings();
  const shouldBlur = !settings.immersionKitRevealTranslationOnClick;
  this.options.setImmersionTranslationBlurred(shouldBlur);
  container.querySelectorAll(".jpdb-reader-example-translation").forEach((translation) => {
    setTranslationBlurAttributes(translation, shouldBlur, "immersionTranslationBlurred", settings.interfaceLanguage);
  });
  this.options.repositionPopover();
  }
  async playExampleAudio(example, quiet = false, isCurrent = () => true) {
  const settings = this.options.getSettings();
  if (!settings.audioEnabled) {
    if (!quiet) this.options.toast(uiText(settings.interfaceLanguage, "audioPlaybackDisabled"));
    return;
  }
  const source = this.exampleAudioSource(example, quiet);
  if (!source) return;
  try {
    const blobSrc = await this.options.client.fetchBlobUrl(source.urls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage).catch(() => "");
    if (!isCurrent()) return;
    await this.options.audio.playMediaCandidates([blobSrc, ...source.urls], {
      playbackRate: settings.immersionKitPlaybackRate,
      isCurrent
    });
  } catch (error) {
    this.handleExampleAudioError(example, quiet, error);
  }
  }
  handleExampleAudioError(example, quiet, error) {
  log$5.warn("Immersion example audio failed", { provider: immersionExampleProviderLabel(example, "en"), sourceTitle: example.sourceTitle, quiet }, error);
  if (!quiet) this.options.toast(uiText(this.options.getSettings().interfaceLanguage, "audioSourceReturnedNoAudio"));
  }
  exampleAudioSource(example, quiet) {
  const urls = this.mediaUrls(example, "sound");
  const key = urls[0] ?? "";
  if (key) return { urls, key };
  if (!quiet) this.options.toast(uiText(this.options.getSettings().interfaceLanguage, "audioSourceReturnedNoAudio"));
  return null;
  }
  mediaUrls(example, kind) {
  const client = this.options.client;
  return client.mediaUrls?.(example, kind) ?? [client.mediaUrl(example, kind)].filter(Boolean);
  }
}
function immersionExampleSourceLabel(card, example, searchQuery, language) {
  const sourceTitle = localizedImmersionSourceTitle(example.sourceTitle, language);
  return queryKey(searchQuery) !== queryKey(card.spelling) ? `${searchQuery} · ${sourceTitle}` : sourceTitle;
}
function immersionExampleProviderLabel(example, language) {
  return localizedImmersionProviderLabel(example, language);
}
function accurateImmersionExamples(query, examples) {
  return shouldFilterImmersionExamplesBySurface(query) ? examples.filter((example) => immersionSentenceContainsQuery(example.sentence, query)) : examples;
}
function immersionSearchResultForQuery(query, exactQuery, triedQueries, examples) {
  const accurateExamples = accurateImmersionExamples(query, examples);
  if (!accurateExamples.length) return null;
  return {
  examples: accurateExamples,
  query,
  usedFallback: queryKey(query) !== queryKey(exactQuery),
  triedQueries
  };
}
function immersionMiningImageUrl(imageUrls) {
  return imageUrls.find((url) => /\/download_media\?/u.test(url)) ?? imageUrls[0] ?? "";
}
function isPageMiningSentence(sentence, card) {
  return Boolean(sentence && sentence !== card.spelling);
}
function shouldPromoteExampleMiningContext(activeContext, card, promoteMiningContext) {
  return promoteMiningContext || !activeContext || activeContext.term !== card.spelling;
}
function pageMiningSourceKind(anchor) {
  return inferMiningSourceKind({
  isImageSource: Boolean(anchor?.closest(".jpdb-ocr-line")),
  hasVideo: Boolean(anchor?.closest(".jpdb-subtitle-player, .jpdb-subtitle-list")) || Boolean(document.querySelector("video")),
  hostname: location.hostname
  });
}
function isConnectedImmersionSurface(popover, container) {
  return popover.isConnected && container.isConnected;
}
function clearImmersionLoadingState(container) {
  if (container.dataset.immersionLoadState === "loading") delete container.dataset.immersionLoadState;
}
function raceAgainstAbortOrTimeout(promise, signal, timeoutMs) {
  if (signal.aborted) return Promise.reject(abortErrorForRace());
  return new Promise((resolve, reject) => {
  const onAbort = () => {
    cleanup();
    reject(abortErrorForRace());
  };
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error("Immersion Kit examples timed out."));
  }, Math.max(1e3, timeoutMs));
  const cleanup = () => {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  promise.then((value) => {
    cleanup();
    resolve(value);
  }, (error) => {
    cleanup();
    reject(error);
  });
  });
}
function abortErrorForRace() {
  if (typeof DOMException === "function") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
function addImmersionFallbackQuery(candidates, value, exactQuery) {
  const query = normalizeImmersionSearchQuery(value);
  if (isUsefulImmersionFallbackQuery(query, exactQuery)) candidates.push(query);
}
function addImmersionFallbackQueries(candidates, values, exactQuery) {
  for (const value of values) addImmersionFallbackQuery(candidates, value, exactQuery);
}
function fallbackTokenQueries(card, tokens) {
  return sortedFallbackTokenCandidates(card, tokens).flatMap((item) => [
  item.token.card.spelling,
  item.surface,
  item.token.card.reading !== item.token.card.spelling ? item.token.card.reading : ""
  ].filter(Boolean));
}
function sortedFallbackTokenCandidates(card, tokens) {
  return tokens.map((token) => ({
  token,
  surface: card.spelling.slice(token.start, token.end),
  length: queryLength(token.card.spelling)
  })).sort(compareFallbackTokenCandidates);
}
function compareFallbackTokenCandidates(a, b) {
  return Number(queryHasKanji(b.token.card.spelling)) - Number(queryHasKanji(a.token.card.spelling)) || b.length - a.length;
}
function renderExampleImageHtml(container, imageUrl, overlay = "") {
  if (!imageUrl) return "";
  const heldImage = heldExampleImage(container);
  return `<div class="jpdb-reader-example-media"${heldExampleMediaStyle(heldImage)}><img class="jpdb-reader-example-image" data-immersion-image data-immersion-image-src="${escapeHtml(imageUrl)}"${heldExampleImageAttributes(heldImage)} alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">${overlay}</div>`;
}
function renderExampleSentenceHtml(sentenceHtml, primarySubtitle = false) {
  const classes = [
  "jpdb-reader-example-sentence",
  "jpdb-reader-parseable",
  "jpdb-reader-subtitle-surface"
  ].filter(Boolean).join(" ");
  if (primarySubtitle) {
  return `<div class="${classes}"><span class="jpdb-subtitle-primary" data-immersion-sentence-render>${sentenceHtml}</span></div>`;
  }
  return `<div class="${classes}" data-immersion-sentence-render>${sentenceHtml}</div>`;
}
function shouldCacheParsedExampleSentenceTokens(tokens) {
  return !tokens.length || tokens.some((token) => token.card.source !== "fallback");
}
function heldExampleMediaStyle(image) {
  return image.minHeight > 0 ? ` style="min-height:${image.minHeight}px"` : "";
}
function heldExampleImageAttributes(image) {
  return `${heldExampleHoldAttribute(image)}${heldExampleSourceAttribute(image)}`;
}
function heldExampleHoldAttribute(image) {
  return image.holdUntilReady ? ' data-immersion-hold-until-ready="true"' : "";
}
function heldExampleSourceAttribute(image) {
  return image.src ? ` src="${escapeHtml(image.src)}"` : "";
}
function heldExampleImage(container) {
  const currentImage = container.querySelector("[data-immersion-image]");
  const src = heldExampleImageSource(currentImage);
  const holdUntilReady = Boolean(src && currentImage?.isConnected);
  return {
  src: holdUntilReady ? src : "",
  minHeight: holdUntilReady ? heldExampleImageHeight(currentImage) : 0,
  holdUntilReady
  };
}
function heldExampleImageSource(image) {
  return image?.currentSrc || image?.src || "";
}
function heldExampleImageHeight(image) {
  const media = image?.closest(".jpdb-reader-example-media") ?? null;
  return Math.ceil(media?.getBoundingClientRect().height || image?.getBoundingClientRect().height || 0);
}
function hoverAudioExampleKey(example) {
  if (!example) return "";
  return example.id || `${example.provider ?? "immersion-kit"}:${example.sourceTitle}:${example.sentence}:${example.soundFile || example.soundUrl}`;
}
function isHoverAudioPointerSuppressed(pointerType) {
  if (pointerType === "touch") return true;
  return pointerType !== "mouse" && (window.matchMedia?.("(hover: none)").matches ?? false);
}
function immersionLazyLoadRoot(popover, target) {
  const body = popover.querySelector(".jpdb-reader-popover-body");
  if (body?.contains(target)) return body;
  return popover.contains(target) ? popover : null;
}
function isImmersionNearVisibleArea(popover, container) {
  const root = immersionLazyLoadRoot(popover, container);
  const containerRect = container.getBoundingClientRect();
  const rootRect = root?.getBoundingClientRect();
  if (!hasUsableRect(containerRect) || !rootRect || !hasUsableRect(rootRect)) return true;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rootRect.bottom;
  const visibleTop = Math.max(0, rootRect.top);
  const visibleBottom = Math.min(viewportHeight, rootRect.bottom);
  return containerRect.bottom >= visibleTop - IMMERSION_LAZY_LOAD_VISIBILITY_MARGIN_PX && containerRect.top <= visibleBottom + IMMERSION_LAZY_LOAD_VISIBILITY_MARGIN_PX;
}
function hasUsableRect(rect) {
  return rect.width > 0 || rect.height > 0;
}
function pruneImmersionSearchCache(cache, now, limit) {
  for (const [key, value] of cache) {
  if (value.expiresAt <= now) cache.delete(key);
  }
  pruneOldestCacheEntries(cache, limit);
}
function renderExampleTranslation(translation, settings) {
  if (!settings.immersionKitShowTranslation || !translation) return "";
  const escaped = escapeHtml(translation);
  if (!settings.immersionKitRevealTranslationOnClick) {
  return `<div class="jpdb-reader-example-translation">${escaped}</div>`;
  }
  return `<div class="jpdb-reader-example-translation" data-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, "revealTranslation"))}">${escaped}</div>`;
}
function setTranslationBlurAttributes(element, blurred, key, language) {
  if (blurred) {
  element.dataset[key] = "true";
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", uiText(language, "revealTranslation"));
  return;
  }
  delete element.dataset[key];
  element.removeAttribute("tabindex");
  element.removeAttribute("role");
  element.removeAttribute("aria-label");
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
  const vocabularySection = renderJpdbKanjiVocabulary(info, language);
  const mnemonicSection = renderJpdbKanjiMnemonic(info, language);
  return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji" ${sourceStateAttribute$1(sourceStateKey, initiallyExpanded)} ${expandedAttribute(initiallyExpanded)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${factSection}
                ${readingsSection}
                ${componentSection}
                ${vocabularySection}
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
function renderJpdbKanjiVocabulary(info, language) {
  if (!info.vocabulary.length) return "";
  return `<section data-kanji-similar-words>
        <div class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(uiText(language, "sourceNameWordsUsingKanji"))}</div>
        <div class="jpdb-reader-similar-grid">
            ${info.vocabulary.slice(0, 8).map((item) => `<button
            class="jpdb-reader-similar-word"
            type="button"
            data-action="similar-word"
            data-expression="${escapeHtml(item.expression)}"
            data-reading="${escapeHtml(item.reading)}">
            <span class="jpdb-reader-similar-word-head">
                <span>${escapeHtml(item.expression)}</span>
                ${item.reading ? `<small>${escapeHtml(item.reading)}</small>` : ""}
            </span>
            ${item.meaning ? `<span class="jpdb-reader-similar-meaning">${escapeHtml(item.meaning)}</span>` : ""}
        </button>`).join("")}
        </div>
    </section>`;
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
function isOriginSubcomponentEdge(edge) {
  return edge.labels.includes("subcomponent");
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
function renderKanjiOrigins(facts, graph, sourceInfo, settings, language, initiallyExpanded = settings.dictionarySourcesInitiallyExpanded, sourceStateKey, excludeFactLabels, title = uiText(language, "originStructure")) {
  if (!hasKanjiOriginContent(facts, graph, sourceInfo)) {
  return "";
  }
  const map = sourceInfo?.kanjiMap;
  return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-origins" ${sourceStateAttribute$1(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
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
  const visibleFacts = excludedFacts ? facts.filter((fact2) => !excludedFacts.has(normalizedFactLabel(fact2.label, language))) : facts;
  if (!visibleFacts.length) return "";
  return `<div class="jpdb-reader-kanji-facts">
        ${visibleFacts.map((fact2) => {
      const label = kanjiFactLabel(fact2.label, language);
      const title = [fact2.source, `${label}: ${fact2.value}`].filter(Boolean).join(" · ");
      return `<span title="${escapeHtml(title)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(fact2.value)}</span></span>`;
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
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceStateAttribute$1(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? "open" : ""}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
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
const log$4 = Logger.scope("KanjiDoodle");
const PEN_MIN_DISTANCE = 8e-4;
const POINTER_MIN_DISTANCE = 16e-4;
const GHOST_VIEWBOX_UNITS = 109;
const GHOST_STROKE_UNITS = 3;
const GHOST_FALLBACK_RATIO = 0.82;
const GHOST_FALLBACK_MAX_PX = 220;
const ACTIVE_DOODLE_CLASS = "jpdb-reader-doodle-active";
const NATIVE_GESTURE_SUPPRESS_MS = 900;
const KANJI_DOODLE_CLEAR_EVENT = "yomu:kanji-doodle-clear";
function installKanjiDoodle(popover, getLanguage, options = {}) {
  const root = popover;
  root.__yomuKanjiDoodleCleanup?.();
  delete root.__yomuKanjiDoodleCleanup;
  const elements = kanjiDoodleElements(popover);
  const clear = popover.querySelector("[data-doodle-clear]");
  const trace = popover.querySelector("[data-doodle-trace]");
  if (!elements) return;
  const { stage, canvas, ghost } = elements;
  let context = null;
  try {
  context = canvas.getContext("2d");
  } catch (error) {
  log$4.warn("Kanji doodle install failed", { reason: "2d-context-error" }, error);
  return;
  }
  if (!context) {
  log$4.warn("Kanji doodle install failed", { reason: "missing-2d-context" });
  return;
  }
  let dpr = 1;
  let drawing = false;
  let pointerId = -1;
  let pointerType = "";
  let traceVisible = !ghost.hidden && !stage.classList.contains("trace-hidden");
  let points = [];
  let strokes = [];
  let canvasRect = doodleOverlayRect(canvas);
  let suppressNativeGestureUntil = 0;
  let activeClassRemovalTimer = 0;
  const controller = new AbortController();
  const signal = controller.signal;
  const keepDoodleInteractionActive = (durationMs = NATIVE_GESTURE_SUPPRESS_MS) => {
  suppressNativeGestureUntil = Math.max(suppressNativeGestureUntil, Date.now() + durationMs);
  document.documentElement.classList.add(ACTIVE_DOODLE_CLASS);
  if (activeClassRemovalTimer) {
    window.clearTimeout(activeClassRemovalTimer);
    activeClassRemovalTimer = 0;
  }
  };
  const shouldSuppressNativeGesture = () => drawing || Date.now() < suppressNativeGestureUntil;
  const releaseDoodleInteractionSoon = () => {
  if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
  activeClassRemovalTimer = window.setTimeout(() => {
    activeClassRemovalTimer = 0;
    if (shouldSuppressNativeGesture()) {
      releaseDoodleInteractionSoon();
      return;
    }
    document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
  }, NATIVE_GESTURE_SUPPRESS_MS);
  };
  const suppressNativeGestureIfActive = (event) => {
  if (!shouldSuppressNativeGesture()) return;
  suppressNativeCanvasGesture(event);
  };
  const resize = () => {
  const rect = doodleOverlayRect(stage);
  dpr = Math.max(window.devicePixelRatio || 1, 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  canvasRect = doodleOverlayRect(canvas);
  measureGhost();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    redraw();
  }
  };
  const toPoint = (event) => {
  const point = layoutPointToOverlay({ x: event.clientX, y: event.clientY });
  return {
    x: Math.max(0, Math.min(1, (point.x - canvasRect.left) / Math.max(canvasRect.width, 1))),
    y: Math.max(0, Math.min(1, (point.y - canvasRect.top) / Math.max(canvasRect.height, 1))),
    pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55))
  };
  };
  let measuredGhostSize = 0;
  const measureGhost = () => {
  const svg = ghost.querySelector("svg");
  if (!svg) return;
  const rect = sourceRectToOverlay(svg.getBoundingClientRect(), svg);
  const size = Math.min(rect.width, rect.height);
  if (size > 0) measuredGhostSize = size;
  };
  const ghostDisplaySize = () => {
  if (measuredGhostSize > 0) return measuredGhostSize;
  const stageSize = Math.min(canvasRect.width, canvasRect.height);
  return Math.min(stageSize * GHOST_FALLBACK_RATIO, GHOST_FALLBACK_MAX_PX);
  };
  const strokeWidth = (point) => {
  const base = Math.max(2.4, GHOST_STROKE_UNITS / GHOST_VIEWBOX_UNITS * ghostDisplaySize() * dpr);
  return base * (0.78 + (point?.pressure ?? 0.5) * 0.44);
  };
  const setupStroke = (point) => {
  context.strokeStyle = resolvedDoodleInk(stage);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = strokeWidth(point);
  };
  const drawStroke = (stroke) => {
  if (!stroke.length) return;
  if (stroke.length === 1) {
    drawPoint(stroke[0]);
    return;
  }
  if (typeof context.quadraticCurveTo === "function") {
    drawSmoothedStroke(stroke);
    return;
  }
  for (let index = 1; index < stroke.length; index += 1) {
    drawSegment(stroke[index - 1], stroke[index]);
  }
  };
  const drawSmoothedStroke = (stroke) => {
  context.save();
  setupStroke(averagePressurePoint(stroke));
  context.beginPath();
  context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
  for (let index = 1; index < stroke.length - 1; index += 1) {
    const control = stroke[index];
    const next = stroke[index + 1];
    context.quadraticCurveTo(
      control.x * canvas.width,
      control.y * canvas.height,
      (control.x + next.x) / 2 * canvas.width,
      (control.y + next.y) / 2 * canvas.height
    );
  }
  const last = stroke[stroke.length - 1];
  context.lineTo(last.x * canvas.width, last.y * canvas.height);
  context.stroke();
  context.restore();
  };
  const drawPoint = (point) => {
  context.save();
  setupStroke(point);
  context.beginPath();
  if (typeof context.arc === "function" && typeof context.fill === "function") {
    context.fillStyle = context.strokeStyle;
    context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(1.2, context.lineWidth / 2), 0, Math.PI * 2);
    context.fill();
  } else {
    const x = point.x * canvas.width;
    const y = point.y * canvas.height;
    context.moveTo(x, y);
    context.lineTo(x + Math.max(1, context.lineWidth / 2), y);
    context.stroke();
  }
  context.restore();
  };
  const drawSegment = (from, to) => {
  context.save();
  setupStroke(to);
  context.beginPath();
  context.moveTo(from.x * canvas.width, from.y * canvas.height);
  context.lineTo(to.x * canvas.width, to.y * canvas.height);
  context.stroke();
  context.restore();
  };
  const redraw = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(stroke);
  drawStroke(points);
  };
  const appendPoint = (point) => {
  const last = points.at(-1);
  const minDistance = pointerType === "pen" ? PEN_MIN_DISTANCE : POINTER_MIN_DISTANCE;
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return;
  points.push(point);
  if (typeof context.quadraticCurveTo === "function") redraw();
  else if (last) drawSegment(last, point);
  else drawPoint(point);
  };
  const applyPointerSamples = (event) => {
  for (const sample of pointerSamples(event)) appendPoint(toPoint(sample));
  };
  const start = (event) => {
  const computedCanvas = getComputedStyle(canvas);
  if (computedCanvas.pointerEvents === "none" || computedCanvas.visibility === "hidden") return;
  if (drawing) {
    if (event.pointerId === pointerId) return;
    finishStroke(false);
  }
  event.preventDefault();
  event.stopPropagation();
  drawing = true;
  pointerId = event.pointerId;
  pointerType = event.pointerType;
  keepDoodleInteractionActive();
  clearSelection();
  canvasRect = doodleOverlayRect(canvas);
  points = [];
  appendPoint(toPoint(event));
  setDoodlePointerCapture(canvas, event.pointerId);
  };
  const move = (event) => {
  if (!drawing || event.pointerId !== pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  keepDoodleInteractionActive();
  applyPointerSamples(event);
  };
  const end = (event) => {
  if (!drawing || event.pointerId !== pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  applyPointerSamples(event);
  finishStroke();
  };
  const finishAfterLostCapture = (event) => {
  if (!drawing || event.pointerId !== pointerId) return;
  keepDoodleInteractionActive();
  };
  const clearActiveSelection = () => {
  if (shouldSuppressNativeGesture()) clearSelection();
  };
  const finishStroke = (releaseCapture = true) => {
  if (points.length) strokes = [...strokes, points];
  points = [];
  drawing = false;
  const activePointerId = pointerId;
  pointerId = -1;
  pointerType = "";
  if (releaseCapture) releaseDoodlePointerCapture(canvas, activePointerId);
  keepDoodleInteractionActive();
  releaseDoodleInteractionSoon();
  clearSelection();
  options.onChange?.(strokes.map((stroke) => [...stroke]));
  };
  const clearDoodle = () => {
  strokes = [];
  points = [];
  redraw();
  options.onClear?.();
  options.onChange?.([]);
  };
  canvas.addEventListener("pointerdown", start, { passive: false, signal });
  canvas.addEventListener("lostpointercapture", finishAfterLostCapture, { signal });
  document.addEventListener("pointermove", move, { passive: false, signal });
  document.addEventListener("pointerup", end, { passive: false, signal });
  document.addEventListener("pointercancel", end, { passive: false, signal });
  window.addEventListener("pointermove", move, { passive: false, signal });
  window.addEventListener("pointerup", end, { passive: false, signal });
  window.addEventListener("pointercancel", end, { passive: false, signal });
  document.addEventListener("selectionchange", clearActiveSelection, { signal });
  document.addEventListener("contextmenu", suppressNativeGestureIfActive, { capture: true, signal });
  document.addEventListener("selectstart", suppressNativeGestureIfActive, { capture: true, signal });
  document.addEventListener("dragstart", suppressNativeGestureIfActive, { capture: true, signal });
  window.addEventListener("contextmenu", suppressNativeGestureIfActive, { capture: true, signal });
  window.addEventListener("selectstart", suppressNativeGestureIfActive, { capture: true, signal });
  window.addEventListener("dragstart", suppressNativeGestureIfActive, { capture: true, signal });
  popover.addEventListener(KANJI_DOODLE_CLEAR_EVENT, clearDoodle, { signal });
  for (const target of [stage, canvas, clear, trace]) {
  if (!target) continue;
  target.addEventListener("contextmenu", suppressNativeCanvasGesture, { signal });
  target.addEventListener("selectstart", suppressNativeCanvasGesture, { signal });
  target.addEventListener("dragstart", suppressNativeCanvasGesture, { signal });
  }
  clear?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearDoodle();
  }, { signal });
  trace?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  traceVisible = !traceVisible;
  ghost.hidden = !traceVisible;
  stage.classList.toggle("trace-hidden", !traceVisible);
  trace.textContent = uiText(getLanguage(), traceVisible ? "hideTrace" : "showTrace");
  if (traceVisible) {
    measureGhost();
    redraw();
  }
  }, { signal });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  root.__yomuKanjiDoodleCleanup = () => {
  controller.abort();
  resizeObserver.disconnect();
  if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
  document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
  clearSelection();
  if (root.__yomuKanjiDoodleCleanup) delete root.__yomuKanjiDoodleCleanup;
  };
  const disconnectWhenDetached = () => {
  if (!popover.isConnected) {
    root.__yomuKanjiDoodleCleanup?.();
    return;
  }
  requestAnimationFrame(disconnectWhenDetached);
  };
  requestAnimationFrame(resize);
  requestAnimationFrame(disconnectWhenDetached);
}
function suppressNativeCanvasGesture(event) {
  event.preventDefault();
  event.stopPropagation();
  clearSelection();
}
function averagePressurePoint(stroke) {
  const pressure = stroke.reduce((sum, point) => sum + point.pressure, 0) / stroke.length;
  return { ...stroke[stroke.length - 1], pressure };
}
function pointerSamples(event) {
  const coalesced = safeCoalescedPointerEvents(event);
  if (!coalesced.length) return [event];
  const last = coalesced.at(-1);
  return last && samePointerPosition(last, event) ? coalesced : [...coalesced, event];
}
function safeCoalescedPointerEvents(event) {
  try {
  return typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  } catch {
  return [];
  }
}
function samePointerPosition(a, b) {
  return a.clientX === b.clientX && a.clientY === b.clientY && a.pressure === b.pressure;
}
function setDoodlePointerCapture(canvas, activePointerId) {
  try {
  canvas.setPointerCapture?.(activePointerId);
  } catch {
  }
}
function releaseDoodlePointerCapture(canvas, activePointerId) {
  try {
  canvas.releasePointerCapture?.(activePointerId);
  } catch {
  }
}
function clearSelection() {
  const selection = document.getSelection?.();
  if (selection && !selection.isCollapsed) selection.removeAllRanges();
}
function resolvedDoodleInk(stage) {
  const ink = getComputedStyle(stage).getPropertyValue("--jpdb-reader-doodle-ink").trim();
  return ink && !ink.startsWith("var(") ? ink : DOODLE_COLOR_TOKENS.ink;
}
function kanjiDoodleElements(popover) {
  const stage = popover.querySelector(".jpdb-reader-doodle-stage");
  const canvas = popover.querySelector(".jpdb-reader-doodle-canvas");
  const ghost = popover.querySelector(".jpdb-reader-doodle-ghost");
  if (stage && canvas && ghost) return { stage, canvas, ghost };
  return null;
}
function doodleOverlayRect(element) {
  return sourceRectToOverlay(element.getBoundingClientRect(), element);
}
const FEATURE_INTERVAL = 20;
const NORMALIZED_SIZE = 256;
const SHAPE_PASS_SCORE = 0.5;
const TOTAL_PASS_SCORE = 62;
function assessKanjiStrokes(strokes, expectedStrokes, referenceStrokes) {
  const validStrokes = strokes.filter((stroke) => stroke.length > 1);
  const actualStrokes = validStrokes.length;
  const expected = Math.max(1, Math.round(expectedStrokes || actualStrokes || 1));
  const strokeScore = Math.max(0, 1 - Math.abs(actualStrokes - expected) / Math.max(expected, 1));
  const coverageScore = Math.min(1, totalDistance(strokes) / Math.max(expected * 0.28, 0.28));
  const directionScore = averageForwardMotion(strokes);
  const shapeScore = assessStrokeShape(validStrokes, referenceStrokes, expected);
  const score = Math.round((shapeScore == null ? strokeScore * 0.62 + coverageScore * 0.24 + directionScore * 0.14 : strokeScore * 0.18 + coverageScore * 0.06 + directionScore * 0.04 + shapeScore * 0.72) * 100);
  const shapePassed = shapeScore == null || shapeScore >= SHAPE_PASS_SCORE;
  const passed = actualStrokes === expected && score >= TOTAL_PASS_SCORE && shapePassed;
  const message = assessmentMessage(passed, actualStrokes, expected, shapeScore);
  return { passed, score, expectedStrokes: expected, actualStrokes, shapeScore: shapeScore ?? void 0, message };
}
function totalDistance(strokes) {
  return strokes.reduce((sum, stroke) => {
  let distance = 0;
  for (let index = 1; index < stroke.length; index += 1) {
    const previous = stroke[index - 1];
    const current = stroke[index];
    distance += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return sum + distance;
  }, 0);
}
function averageForwardMotion(strokes) {
  const scored = strokes.filter((stroke) => stroke.length > 1).map((stroke) => {
  const first2 = stroke[0];
  const last = stroke[stroke.length - 1];
  const horizontal = Math.abs(last.x - first2.x);
  const vertical = Math.abs(last.y - first2.y);
  if (horizontal >= vertical) return last.x >= first2.x ? 1 : 0.45;
  return last.y >= first2.y ? 1 : 0.45;
  });
  return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : 0;
}
function assessmentMessage(passed, actualStrokes, expectedStrokes, shapeScore) {
  if (passed) return `Looks right: ${actualStrokes}/${expectedStrokes} strokes`;
  if (actualStrokes !== expectedStrokes) return `Check stroke count: ${actualStrokes}/${expectedStrokes} strokes`;
  if (shapeScore != null && shapeScore < SHAPE_PASS_SCORE) return `Check stroke shape/order: ${actualStrokes}/${expectedStrokes} strokes`;
  return `Check stroke count/order: ${actualStrokes}/${expectedStrokes} strokes`;
}
function assessStrokeShape(strokes, referenceStrokes, expectedStrokes) {
  if (!referenceStrokes || strokes.length !== expectedStrokes || referenceStrokes.length !== expectedStrokes) return null;
  const written = normalizedFeatures(toPattern(strokes));
  const reference = normalizedFeatures(toPattern(referenceStrokes));
  if (written.length !== reference.length || written.some((stroke, index) => stroke.length < 2 || reference[index].length < 2)) return null;
  const scores = written.map((stroke, index) => strokeCorrespondenceScore(stroke, reference[index]));
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const worst = Math.min(...scores);
  return average * 0.8 + worst * 0.2;
}
function toPattern(strokes) {
  return strokes.map((stroke) => stroke.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({
  x: Math.max(0, Math.min(1, point.x)) * NORMALIZED_SIZE,
  y: Math.max(0, Math.min(1, point.y)) * NORMALIZED_SIZE
  }))).filter((stroke) => stroke.length > 1);
}
function momentNormalize(pattern) {
  const points = pattern.flat();
  if (!points.length) return pattern;
  const width = NORMALIZED_SIZE;
  const height = NORMALIZED_SIZE;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const oldWidth = Math.max(maxX - minX, 1e-3);
  const oldHeight = Math.max(maxY - minY, 1e-3);
  const aspectScale = aspectPreservingScale(oldWidth, oldHeight);
  const targetWidth = oldHeight > oldWidth ? aspectScale * width : width;
  const targetHeight = oldHeight > oldWidth ? height : aspectScale * height;
  const offsetX = (width - targetWidth) / 2;
  const offsetY = (height - targetHeight) / 2;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const varianceX = points.reduce((sum, point) => sum + (point.x - centerX) ** 2, 0) / points.length;
  const varianceY = points.reduce((sum, point) => sum + (point.y - centerY) ** 2, 0) / points.length;
  const scaleX = finiteScale(targetWidth / (4 * Math.sqrt(varianceX)));
  const scaleY = finiteScale(targetHeight / (4 * Math.sqrt(varianceY)));
  return pattern.map((stroke) => stroke.map((point) => ({
  x: clamp(scaleX * (point.x - centerX) + targetWidth / 2 + offsetX, 0, NORMALIZED_SIZE),
  y: clamp(scaleY * (point.y - centerY) + targetHeight / 2 + offsetY, 0, NORMALIZED_SIZE)
  })));
}
function aspectPreservingScale(width, height) {
  const ratio = height > width ? width / height : height / width;
  return Math.sqrt(Math.sin(Math.PI / 2 * ratio));
}
function finiteScale(value) {
  return Number.isFinite(value) ? value : 0;
}
function extractFeatures(pattern, interval) {
  return pattern.map((stroke) => resampleStroke(stroke, interval));
}
function normalizedFeatures(pattern) {
  const densityIndependent = extractFeatures(pattern, FEATURE_INTERVAL);
  return extractFeatures(momentNormalize(densityIndependent), FEATURE_INTERVAL);
}
function resampleStroke(stroke, interval) {
  if (stroke.length < 2 || !Number.isFinite(interval) || interval <= 0) return [...stroke];
  const sampled = [{ ...stroke[0] }];
  let distanceSinceSample = 0;
  for (let index = 1; index < stroke.length; index += 1) {
  let from = stroke[index - 1];
  const to = stroke[index];
  let segmentLength = euclid(from, to);
  if (segmentLength <= Number.EPSILON) continue;
  while (distanceSinceSample + segmentLength >= interval) {
    const ratio = (interval - distanceSinceSample) / segmentLength;
    const point = {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    };
    sampled.push(point);
    from = point;
    segmentLength = euclid(from, to);
    distanceSinceSample = 0;
    if (segmentLength <= Number.EPSILON) break;
  }
  distanceSinceSample += segmentLength;
  }
  const last = stroke[stroke.length - 1];
  if (euclid(sampled[sampled.length - 1], last) > Number.EPSILON) sampled.push({ ...last });
  return sampled;
}
function strokeCorrespondenceScore(stroke, reference) {
  const whole = wholeWholeDistance(stroke, reference);
  const endpoints = endPointDistance(stroke, reference) / 2;
  const direction = directionDistance(stroke, reference) * 128;
  const distance = whole * 0.58 + endpoints * 0.32 + direction * 0.1;
  return clamp(1 - distance / 96, 0, 1);
}
function wholeWholeDistance(pattern1, pattern2) {
  const [larger, smaller] = pattern1.length >= pattern2.length ? [pattern1, pattern2] : [pattern2, pattern1];
  if (!larger.length || !smaller.length) return NORMALIZED_SIZE;
  let distance = 0;
  for (let index = 0; index < smaller.length; index += 1) {
  const largerIndex = Math.min(larger.length - 1, Math.floor(larger.length / smaller.length * index));
  distance += manhattan(larger[largerIndex], smaller[index]);
  }
  return distance / smaller.length;
}
function endPointDistance(pattern1, pattern2) {
  if (!pattern1.length || !pattern2.length) return NORMALIZED_SIZE;
  return manhattan(pattern1[0], pattern2[0]) + manhattan(pattern1[pattern1.length - 1], pattern2[pattern2.length - 1]);
}
function directionDistance(pattern1, pattern2) {
  const vector1 = strokeVector(pattern1);
  const vector2 = strokeVector(pattern2);
  const length1 = Math.hypot(vector1.x, vector1.y);
  const length2 = Math.hypot(vector2.x, vector2.y);
  if (!length1 || !length2) return 1;
  const dot = (vector1.x * vector2.x + vector1.y * vector2.y) / (length1 * length2);
  return (1 - clamp(dot, -1, 1)) / 2;
}
function strokeVector(stroke) {
  return {
  x: stroke[stroke.length - 1].x - stroke[0].x,
  y: stroke[stroke.length - 1].y - stroke[0].y
  };
}
function euclid(point1, point2) {
  return Math.hypot(point1.x - point2.x, point1.y - point2.y);
}
function manhattan(point1, point2) {
  return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function installKanjiPracticeDoodle(root, getLanguage, getKanjiVGInfo) {
  let latestStrokes = [];
  const clear = () => {
  latestStrokes = [];
  clearKanjiPracticeAssessment(root);
  };
  const reassess = () => {
  renderKanjiPracticeAssessment(root, getKanjiVGInfo(), latestStrokes);
  };
  installKanjiDoodle(root, getLanguage, {
  onChange: (strokes) => {
    latestStrokes = strokes;
    reassess();
  },
  onClear: clear
  });
  return { reassess, clear };
}
function renderKanjiPracticeAssessment(root, info, strokes) {
  if (!info || !strokes.length) {
  clearKanjiPracticeAssessment(root);
  return;
  }
  if (shouldWaitForMorePracticeStrokes(strokes, info.strokeCount)) {
  clearKanjiPracticeAssessment(root);
  return;
  }
  renderKanjiPracticeResult(root, assessKanjiStrokes(strokes, info.strokeCount, info.strokeShapes));
}
function renderKanjiPracticeResult(root, assessment) {
  const section = kanjiPracticeSection(root);
  const result = section?.querySelector("[data-newtab-doodle-result]");
  section?.classList.toggle("jpdb-reader-doodle-pass", assessment.passed);
  section?.classList.toggle("jpdb-reader-doodle-fail", !assessment.passed);
  if (result) result.textContent = `${assessment.passed ? "✓" : "✕"} ${assessment.message}`;
}
function clearKanjiPracticeAssessment(root) {
  const section = kanjiPracticeSection(root);
  const result = section?.querySelector("[data-newtab-doodle-result]");
  section?.classList.remove("jpdb-reader-doodle-pass", "jpdb-reader-doodle-fail");
  if (result) result.textContent = "";
}
function kanjiPracticeSection(root) {
  return root.matches(".jpdb-reader-kanjivg") ? root : root.querySelector(".jpdb-reader-kanjivg");
}
function shouldWaitForMorePracticeStrokes(strokes, expectedStrokes) {
  return expectedStrokes > 0 && strokes.filter((stroke) => stroke.length > 1).length < expectedStrokes;
}
const RTK_BASE_URL = "https://hrussellzfac023.github.io/rtk";
const RTK_SEARCH_INDEX_URL = `${RTK_BASE_URL}/assets/js/search.js`;
const log$3 = Logger.scope("RTK");
class RtkClient {
  cache = /* @__PURE__ */ new Map();
  keywordIndex;
  // fallow-ignore-next-line unused-class-member
  lookup(kanji) {
  if (!isUnifiedIdeograph(kanji)) return Promise.resolve(null);
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
    log$3.warn("RTK request failed", { kanji }, error);
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
  componentKanji: [...new Set(Array.from(elements).filter((character) => isUnifiedIdeograph(character) && character !== kanji))],
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
  const entries2 = /* @__PURE__ */ new Map();
  const collisions = /* @__PURE__ */ new Set();
  const canonicalKeys = /* @__PURE__ */ new Set();
  searchEntries.forEach((entry) => {
  rtkIndexKeys(entry.keyword).forEach((key) => {
    canonicalKeys.add(key);
    addRtkKeywordIndexEntry(entries2, collisions, key, entry.kanji);
  });
  });
  addRtkElementAliasEntries(entries2, collisions, canonicalKeys, searchEntries);
  return entries2;
}
function rtkSearchIndexEntries(script) {
  const entries2 = [];
  const entryRe = /\{[\s\S]*?\}/g;
  let match;
  while (match = entryRe.exec(script)) {
  const entry = rtkSearchIndexEntry(match[0]);
  if (entry) entries2.push(entry);
  }
  return entries2;
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
  return isUnifiedIdeograph(character);
}
function addRtkKeywordIndexEntry(entries2, collisions, key, kanji) {
  if (!key || collisions.has(key)) return;
  const existing = entries2.get(key);
  if (existing && existing !== kanji) {
  entries2.delete(key);
  collisions.add(key);
  return;
  }
  entries2.set(key, kanji);
}
function addRtkElementAliasEntries(entries2, collisions, canonicalKeys, searchEntries) {
  const introduced = /* @__PURE__ */ new Map();
  const introducedCollisions = /* @__PURE__ */ new Set();
  searchEntries.forEach((entry) => {
  rtkIndexKeys(entry.keyword).forEach((key) => addRtkKeywordIndexEntry(introduced, introducedCollisions, key, entry.kanji));
  const elements = splitRtkElements(entry.elements);
  addLeadingRtkElementAliases(entries2, collisions, canonicalKeys, introduced, introducedCollisions, entry, elements);
  addGroupedRtkElementAliases(entries2, collisions, canonicalKeys, introduced, introducedCollisions, elements);
  });
}
function addLeadingRtkElementAliases(entries2, collisions, canonicalKeys, introduced, introducedCollisions, entry, elements) {
  const keywordKeys = rtkIndexKeys(entry.keyword);
  const keywordIndex = elements.findIndex((element) => rtkIndexKeys(element).some((key) => keywordKeys.includes(key)));
  if (keywordIndex <= 0) return;
  elements.slice(0, keywordIndex).forEach((element) => {
  addRtkElementAliasEntry(entries2, collisions, canonicalKeys, introduced, introducedCollisions, element, entry.kanji);
  });
}
function addGroupedRtkElementAliases(entries2, collisions, canonicalKeys, introduced, introducedCollisions, elements) {
  let owner = "";
  elements.forEach((element) => {
  const introducedOwner = rtkIntroducedElementOwner(introduced, element);
  if (introducedOwner) {
    owner = introducedOwner;
    return;
  }
  if (owner) addRtkElementAliasEntry(entries2, collisions, canonicalKeys, introduced, introducedCollisions, element, owner);
  });
}
function addRtkElementAliasEntry(entries2, collisions, canonicalKeys, introduced, introducedCollisions, element, kanji) {
  if (rtkElementFallbackGlyph(element)) return;
  rtkIndexKeys(element).filter((key) => !canonicalKeys.has(key)).forEach((key) => {
  addRtkKeywordIndexEntry(entries2, collisions, key, kanji);
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
  const text2 = cleanText(next.textContent ?? "");
  if (text2) paragraphs.push(text2);
  next = next.nextElementSibling;
  }
  return paragraphs;
}
function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}
function requestText(url) {
  return requestText$5(url, {
  timeoutMs: 8e3,
  failureLabel: "RTK request",
  timeoutLabel: "RTK request timed out."
  });
}
function renderStudyBlock(className, content, attrs = "") {
  return `<div class="${studyBlockClassName(className)}"${studyAttrs(attrs)}>${content}</div>`;
}
function renderStudySentenceBlock(sentence, language, options, attrs = "") {
  return renderStudyBlock("jpdb-reader-study-sentence-block", `
        <div class="jpdb-reader-study-label-row jpdb-reader-study-sentence-row">
            <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
            ${renderStudySentenceAudioButton(language, options)}
        </div>`, attrs);
}
function renderStudyMeaningBlock(text2, language, resultAttrs = "") {
  return renderStudyBlock("jpdb-reader-study-meaning-block", `
        <div class="jpdb-reader-study-label">${escapeHtml(uiText(language, "meaning"))}</div>
        <div class="jpdb-reader-study-translation"${studyAttrs(resultAttrs)}>${escapeHtml(text2)}</div>`);
}
function renderStudyEmpty(text2) {
  return `<div class="jpdb-reader-study-empty">${escapeHtml(text2)}</div>`;
}
function renderStudyList(items, attrs = "") {
  return `<ol class="jpdb-reader-study-list"${studyAttrs(attrs)}>
        ${items.join("")}
        </ol>`;
}
function renderStudySentenceAudioButton(language, options) {
  const readSentence = uiText(language, options.audioEnabled ? "readSentenceAloud" : "audioPlaybackDisabled");
  const sentenceAttr = options.sentence ? ` data-study-sentence="${escapeHtml(options.sentence)}"` : "";
  return `<button class="jpdb-reader-icon-mini" data-action="study-read-sentence"${sentenceAttr} type="button" title="${escapeHtml(readSentence)}" aria-label="${escapeHtml(readSentence)}"${options.audioEnabled ? "" : " disabled"}>${speakerIcon()}</button>`;
}
function studyBlockClassName(className) {
  return ["jpdb-reader-study-block", className.trim()].filter(Boolean).join(" ");
}
function studyAttrs(attrs) {
  const trimmed = attrs.trim();
  return trimmed ? ` ${trimmed}` : "";
}
const GRAMMAR_PREFERENCES_KEY = "yomu.grammarPreferences.v1";
const KNOWLEDGE_VALUES = /* @__PURE__ */ new Set(["unknown", "learning", "known", "mastered"]);
function readTargetGrammarKnowledge(target) {
  return normalizeGrammarKnowledge(
  gmStorageGetSync(grammarPreferencesKey(target), null),
  target
  );
}
function readTargetGrammarPreferences(target) {
  return preferencesFromSnapshot(readTargetGrammarKnowledge(target));
}
function setTargetGrammarRuleKnowledge(target, ruleId, knowledge, change = {}) {
  if (!targetHasGrammarRule(target, ruleId)) {
  throw new TypeError(`Unknown ${target.language} grammar rule: ${ruleId}`);
  }
  const snapshot = readTargetGrammarKnowledge(target);
  const previous = snapshot.entries[ruleId];
  if (previous?.knowledge === knowledge && change.at === void 0 && change.changeId === void 0) return snapshot;
  const at = validTimestamp(change.at) ? change.at : Date.now();
  const changeId = change.changeId?.trim() || createGrammarChangeId();
  if (previous?.knowledge === knowledge && previous.at === at && previous.changeId === changeId) return snapshot;
  const entry = { knowledge, at, changeId };
  const next = { ...snapshot, entries: { ...snapshot.entries, [ruleId]: entry } };
  writeTargetGrammarKnowledge(target, next);
  return next;
}
function setTargetGrammarRuleKnown(target, ruleId, known) {
  return preferencesFromSnapshot(setTargetGrammarRuleKnowledge(
  target,
  ruleId,
  known ? "known" : "unknown"
  ));
}
function setTargetKnownGrammarVisible(target, showKnown) {
  const snapshot = readTargetGrammarKnowledge(target);
  const next = { ...snapshot, showKnown };
  writeTargetGrammarKnowledge(target, next);
  return preferencesFromSnapshot(next);
}
function grammarPreferencesKey(target) {
  if (target.grammar === JAPANESE_GRAMMAR) return GRAMMAR_PREFERENCES_KEY;
  const targetId = languageSubtag(target.language) ?? encodeURIComponent(target.id);
  return `${GRAMMAR_PREFERENCES_KEY}:${targetId}`;
}
function normalizeGrammarKnowledge(value, target) {
  const record2 = objectRecord(value);
  const entries2 = record2?.version === 2 ? normalizeEntries(record2.entries, target) : migrateLegacyKnownRules(record2?.knownRuleIds, target);
  return {
  entries: entries2,
  showKnown: record2?.showKnown === true
  };
}
function normalizeEntries(value, target) {
  const entries2 = objectRecord(value);
  if (!entries2) return {};
  const normalized = {};
  for (const [ruleId, candidate] of Object.entries(entries2)) {
  const entry = objectRecord(candidate);
  if (!targetHasGrammarRule(target, ruleId) || !KNOWLEDGE_VALUES.has(entry?.knowledge) || !validTimestamp(entry?.at) || typeof entry?.changeId !== "string" || !entry.changeId.trim()) continue;
  normalized[ruleId] = {
    knowledge: entry.knowledge,
    at: entry.at,
    changeId: entry.changeId.trim()
  };
  }
  return normalized;
}
function migrateLegacyKnownRules(value, target) {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.filter((ruleId) => typeof ruleId === "string" && targetHasGrammarRule(target, ruleId)).map((ruleId) => [ruleId, {
  knowledge: "known",
  at: 0,
  changeId: `grammar-known:legacy:${ruleId}`
  }]));
}
function writeTargetGrammarKnowledge(target, snapshot) {
  const knownRuleIds = Object.entries(snapshot.entries).filter(([, entry]) => entry.knowledge === "known" || entry.knowledge === "mastered").map(([ruleId]) => ruleId).sort();
  gmStorageSetSync(grammarPreferencesKey(target), {
  version: 2,
  entries: snapshot.entries,
  // Older target-aware builds can still read the authoritative map's
  // boolean projection. For Japanese this is also the old Reader format.
  knownRuleIds,
  showKnown: snapshot.showKnown
  });
}
function preferencesFromSnapshot(snapshot) {
  return {
  knownRuleIds: Object.entries(snapshot.entries).filter(([, entry]) => entry.knowledge === "known" || entry.knowledge === "mastered").map(([ruleId]) => ruleId).sort(),
  showKnown: snapshot.showKnown
  };
}
function targetHasGrammarRule(target, ruleId) {
  return target.grammar.rules.some((rule) => rule.ruleId === ruleId);
}
function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function validTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function createGrammarChangeId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `grammar-known:${uuid}` : `grammar-known:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function currentGrammarAvailability(language, failed = false) {
  const grammar = activeLearningTarget().grammar;
  if (failed) {
  return {
    state: "unavailable",
    message: uiText(language, "grammarCheckUnavailable"),
    referenceUrl: grammar.referenceUrl
  };
  }
  const state = grammar.rules.length ? "empty" : grammar.referenceUrl ? "reference-only" : "unsupported";
  return {
  state,
  message: formatUiText(
    language,
    grammar.rules.length ? "grammarNoLocalMatch" : state === "reference-only" ? "grammarReferenceOnly" : "grammarDetectionPending",
    { language: targetLanguageName(activeLearningTarget().language, language) }
  ),
  referenceUrl: grammar.referenceUrl
  };
}
function renderGrammarAvailability(availability, language) {
  const reference = availability.referenceUrl ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(availability.referenceUrl)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, "grammarReference"))}</a>` : "";
  return `<div class="jpdb-reader-grammar-availability" data-grammar-availability="${availability.state}">
        ${renderStudyEmpty(availability.message)}
        ${reference}
    </div>`;
}
function targetLanguageName(target, interfaceLanguage) {
  try {
  return new Intl.DisplayNames([resolveUiLanguage(interfaceLanguage)], { type: "language" }).of(target) ?? target;
  } catch {
  return target;
  }
}
const DEFAULT_TIMEOUT_MS = 8e3;
const TRANSLATION_CACHE_LIMIT = 320;
const GOOGLE_TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const log$2 = Logger.scope("GoogleTranslation");
const translationCache = /* @__PURE__ */ new Map();
const translationInFlight = /* @__PURE__ */ new Map();
function normalizeTranslationLanguage(language, options = {}) {
  const trimmed = language.trim();
  if (options.allowAuto && trimmed.toLowerCase() === "auto") return "auto";
  if (!trimmed) throw new Error("Translation language is required.");
  try {
  return Intl.getCanonicalLocales(trimmed)[0] ?? trimmed;
  } catch {
  throw new Error(`Invalid translation language: ${language}`);
  }
}
function googleTranslationLanguageCapability(language) {
  const logicalLanguage = normalizeTranslationLanguage(language);
  const locale = new Intl.Locale(logicalLanguage);
  if (locale.language === "grc") {
  return {
    logicalLanguage,
    providerLanguage: null,
    supported: false
  };
  }
  if (locale.language === "sr" && (locale.script === "Latn" || logicalLanguage === "sr")) {
  return {
    logicalLanguage,
    // Google ignores sr-Latn and returns Cyrillic. Bosnian is the
    // closest supported Serbo-Croatian standard with guaranteed Latin
    // output; the logical profile remains sr-Latn everywhere else.
    providerLanguage: "bs",
    supported: true
  };
  }
  return {
  logicalLanguage,
  providerLanguage: logicalLanguage,
  supported: true
  };
}
function googleTranslationUrl(text2, options) {
  const sourceLanguage = normalizeTranslationLanguage(options.sourceLanguage, { allowAuto: true });
  const sourceProviderLanguage = sourceLanguage === "auto" ? "auto" : requiredGoogleTranslationLanguage(sourceLanguage);
  const outputLanguage = requiredGoogleTranslationLanguage(options.outputLanguage);
  const params = new URLSearchParams({
  client: "gtx",
  sl: sourceProviderLanguage,
  tl: outputLanguage,
  dt: "t",
  dj: "1",
  q: text2
  });
  if (options.includeDictionaryData) params.append("dt", "bd");
  return `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`;
}
async function translateText(text2, options) {
  const original = text2.trim();
  if (!original) return "";
  const sourceLanguage = normalizeTranslationLanguage(options.sourceLanguage, { allowAuto: true });
  const outputLanguage = normalizeTranslationLanguage(options.outputLanguage);
  if (sourceLanguage !== "auto" && sourceLanguage.toLowerCase() === outputLanguage.toLowerCase()) return original;
  const cacheKey = `${sourceLanguage}:${outputLanguage}:${original}`;
  const cached = translationCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const active = translationInFlight.get(cacheKey);
  if (active) return active;
  const request = performTranslation(original, {
  ...options,
  sourceLanguage,
  outputLanguage
  });
  translationInFlight.set(cacheKey, request);
  void request.finally(() => {
  if (translationInFlight.get(cacheKey) === request) translationInFlight.delete(cacheKey);
  }).catch(() => void 0);
  return request;
}
function requiredGoogleTranslationLanguage(language) {
  const capability = googleTranslationLanguageCapability(language);
  if (!capability.supported || !capability.providerLanguage) {
  throw new Error(`Automatic translation is not available for ${capability.logicalLanguage}.`);
  }
  return capability.providerLanguage;
}
async function performTranslation(text2, options) {
  const url = googleTranslationUrl(text2, options);
  const done = log$2.time("Translate text", {
  sourceLanguage: options.sourceLanguage,
  outputLanguage: options.outputLanguage,
  textLength: text2.length
  });
  try {
  const json = await requestJson$2(url, {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    allowDirectCrossOrigin: true,
    allowConfiguredProxy: false,
    allowPublicProxies: false,
    preferFetch: true,
    failureLabel: "Translation request",
    timeoutLabel: "Translation timed out."
  });
  const translated = (json.sentences ?? []).map((item) => item.trans ?? "").join("").trim();
  if (!translated) throw new Error("No translation returned.");
  translationCache.set(`${options.sourceLanguage}:${options.outputLanguage}:${text2}`, translated);
  pruneOldestCacheEntries(translationCache, TRANSLATION_CACHE_LIMIT);
  return translated;
  } finally {
  done();
  }
}
const TRANSLATION_TIMEOUT_MS = 5e3;
const GRAMMAR_RULE_DATA_TIMEOUT_MS = 15e3;
const EN_GRAMMAR_RULE_DATA_URL = `${DOCS_BASE_URL}data/en-grammar-rule-copy.json`;
const ENGLISH_TEXT_RE = /[A-Za-z]{3,}/u;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
let grammarRuleDataPromise;
function resetGrammarRuleDataCacheForTests() {
  grammarRuleDataPromise = void 0;
}
function listLocalGrammarRuleExamples() {
  return [];
}
function listLocalGrammarRules() {
  return activeLearningTarget().grammar.rules.map((rule) => ({
  ruleId: rule.ruleId,
  name: rule.name,
  level: rule.level,
  exampleCount: 0
  }));
}
function detectGrammarHints$1(sentence) {
  return activeLearningTarget().grammar.detect(sentence).map((match) => ({
  ...match,
  kind: "Grammar",
  short: match.name,
  detail: match.name,
  examples: []
  }));
}
function preloadGrammarResources$1(sentence, language = "en") {
  const hints = detectGrammarHints$1(sentence);
  const grammar = activeLearningTarget().grammar;
  const copyId = hints.length ? grammar.ruleCopyId(hints[0].ruleId) : null;
  if (copyId) void loadGrammarRuleData().catch(() => void 0);
  if (resolveUiLanguage(language) === "ja" && copyId) {
  void grammarRuleText(language, copyId).catch(() => void 0);
  }
  return hints;
}
function preloadJapaneseSentenceTranslation$1(sentence, language = "en") {
  void translateJapaneseSentence$1(sentence, language).catch(() => void 0);
}
function setGrammarRuleKnown(ruleId, known) {
  return setTargetGrammarRuleKnown(activeLearningTarget(), ruleId, known);
}
function setKnownGrammarVisible(showKnown) {
  return setTargetKnownGrammarVisible(activeLearningTarget(), showKnown);
}
const JAPANESE_CHAR = /[぀-ヿ㐀-鿿]/g;
function isTranslatableJapaneseSentence(sentence) {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  const japanese = trimmed.match(JAPANESE_CHAR)?.length ?? 0;
  if (japanese < 2) return false;
  const dense = trimmed.replace(/\s+/g, "").length;
  return japanese / dense >= 0.15;
}
async function translateJapaneseSentence$1(sentence, outputLanguage = "en") {
  const trimmed = sentence.trim();
  if (!trimmed || !isTranslatableJapaneseSentence(trimmed)) return "";
  const requestSentence = normalizeSentenceForTranslationRequest(trimmed);
  return translateText(requestSentence, {
  sourceLanguage: "ja",
  outputLanguage: sentenceOutputLanguage(outputLanguage),
  timeoutMs: TRANSLATION_TIMEOUT_MS,
  includeDictionaryData: true
  });
}
function sentenceOutputLanguage(outputLanguage) {
  return outputLanguage === "auto" || outputLanguage === "ja" ? "en" : outputLanguage;
}
function normalizeSentenceForTranslationRequest(sentence) {
  return sentence.replace(/[「『]/g, '"').replace(/[」』]/g, '"');
}
async function renderGrammarHints$1(hints, sentence, preferences = readTargetGrammarPreferences(activeLearningTarget()), language = "en", options = {}) {
  if (!hints.length) return renderGrammarAvailability(currentGrammarAvailability(language), language);
  const knownRuleIds = new Set(preferences.knownRuleIds);
  const visibleHints = visibleGrammarHints(hints, knownRuleIds, preferences.showKnown);
  const visibleGroups = groupGrammarHintsByRule(visibleHints);
  const knownCount = countKnownGrammarHints(hints, knownRuleIds);
  const audioEnabled = options.audioEnabled ?? true;
  return `
        ${renderGrammarSentence(sentence, language, audioEnabled)}
        ${renderGrammarToolbar(visibleGroups.length, knownCount, preferences.showKnown, language)}
        ${await renderGrammarHintList(visibleGroups, knownRuleIds, language, audioEnabled)}`;
}
function visibleGrammarHints(hints, knownRuleIds, showKnown) {
  return showKnown ? hints : hints.filter((hint) => !knownRuleIds.has(hint.ruleId));
}
function countKnownGrammarHints(hints, knownRuleIds) {
  return new Set(hints.filter((hint) => knownRuleIds.has(hint.ruleId)).map((hint) => hint.ruleId)).size;
}
function groupGrammarHintsByRule(hints) {
  const groups = /* @__PURE__ */ new Map();
  for (const hint of hints) {
  const existing = groups.get(hint.ruleId);
  if (existing) {
    existing.count += 1;
    continue;
  }
  groups.set(hint.ruleId, { hint, count: 1 });
  }
  return Array.from(groups.values());
}
function grammarSummary(visibleCount, hiddenKnownCount, language) {
  const shown = `${visibleCount} ${uiText(language, "grammarShown")}`;
  if (hiddenKnownCount) return `${shown} · ${hiddenKnownCount} ${uiText(language, "grammarKnownHidden")}`;
  return shown;
}
function renderGrammarSentence(sentence, language, audioEnabled) {
  return renderStudySentenceBlock(sentence, language, { audioEnabled }, "data-grammar-sentence");
}
function renderGrammarToolbar(visibleCount, knownCount, showKnown, language) {
  const hiddenKnownCount = showKnown ? 0 : knownCount;
  return `
        <div class="jpdb-reader-grammar-toolbar" data-grammar-toolbar>
            <div class="jpdb-reader-grammar-summary">${escapeHtml(grammarSummary(visibleCount, hiddenKnownCount, language))}</div>
            ${renderGrammarKnownVisibilityButton(knownCount, showKnown, language)}
        </div>`;
}
function renderGrammarKnownVisibilityButton(knownCount, showKnown, language) {
  if (!knownCount) return "";
  const label = showKnown ? uiText(language, "grammarHideKnown") : uiText(language, "grammarShowKnown");
  return `<button class="jpdb-reader-grammar-toggle" type="button" data-action="study-grammar-toggle-known-visibility" aria-pressed="${showKnown ? "true" : "false"}">${label}</button>`;
}
async function renderGrammarHintList(visibleGroups, knownRuleIds, language, audioEnabled) {
  if (!visibleGroups.length) return renderStudyEmpty(uiText(language, "allDetectedGrammarKnown"));
  const items = await Promise.all(visibleGroups.map((group) => renderGrammarHintItem(group, knownRuleIds.has(group.hint.ruleId), language, audioEnabled)));
  return renderStudyList(items, "data-grammar-list");
}
async function renderGrammarHintItem(group, known, language, audioEnabled) {
  const { hint, count } = group;
  const details = await grammarHintDetails(hint, language);
  const displayName = grammarDisplayName(hint, language);
  return `
            <li class="jpdb-reader-study-item${known ? " known" : ""}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(grammarLevelText(hint.level, language))}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(details.kind)}</div>
                        <div class="jpdb-reader-grammar-actions">
                            ${renderGrammarRepeatCount(count)}
                            <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${known ? "true" : "false"}" aria-pressed="${known ? "true" : "false"}">${known ? uiText(language, "grammarReview") : uiText(language, "grammarKnown")}</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-study-short jpdb-reader-parseable">${escapeHtml(details.short)}</div>
                    ${renderGrammarHintDisclosure(hint, details, displayName, language, audioEnabled)}
                </div>
            </li>`;
}
function renderGrammarHintDisclosure(hint, details, displayName, language, audioEnabled) {
  const detail = renderGrammarHintDetail(details, displayName);
  const examples = renderGrammarHintExamples(details.examples, language, audioEnabled);
  const match = renderGrammarHintMatch(hint, language);
  const guide = renderGrammarHintGuide(details.url ?? "", language);
  if (!detail && !examples) return `${match}${guide}`;
  return `<details class="jpdb-reader-grammar-more">
                        <summary>${escapeHtml(uiText(language, "grammarDetails"))}</summary>
                        ${detail}${match}${examples}${guide}
                    </details>`;
}
function renderGrammarHintDetail(details, displayName) {
  const detail = details.detail.trim();
  if (!detail || detail === details.short.trim() || detail === displayName.trim()) return "";
  return `<div class="jpdb-reader-study-detail jpdb-reader-parseable">${escapeHtml(detail)}</div>`;
}
function renderGrammarHintMatch(hint, language) {
  return `<div class="jpdb-reader-study-match"><span>${escapeHtml(uiText(language, "grammarFoundIn"))}</span><span class="jpdb-reader-study-match-text jpdb-reader-parseable">${escapeHtml(hint.match)}</span></div>`;
}
function renderGrammarRepeatCount(count) {
  return count > 1 ? `<span class="jpdb-reader-grammar-repeat">x${count}</span>` : "";
}
async function grammarHintDetails(hint, language) {
  const fallback = grammarHintFallbackData(hint, language);
  const copyId = activeLearningTarget().grammar.ruleCopyId(hint.ruleId);
  const englishData = copyId ? await loadGrammarRuleData().then((data) => data[copyId]).catch(() => void 0) : void 0;
  const base = englishData ? { ...fallback, ...englishData } : fallback;
  if (resolveUiLanguage(language) !== "ja") return base;
  const ruleCopy = copyId ? await grammarRuleText(language, copyId) : void 0;
  if (ruleCopy) return { ...base, ...ruleCopy };
  const name = grammarDisplayName(hint, language);
  return {
  ...base,
  kind: uiText(language, "grammar"),
  short: interpolateUiText(language, "grammarGenericShort", { name, match: hint.match }),
  detail: interpolateUiText(language, "grammarGenericDetail", { name, match: hint.match })
  };
}
function grammarHintFallbackData(hint, language) {
  return {
  kind: hint.kind || uiText(language, "grammar"),
  short: hint.short || grammarDisplayName(hint, language),
  detail: hint.detail || grammarDisplayName(hint, language),
  url: hint.url || void 0,
  examples: hint.examples ?? []
  };
}
function grammarLevelText(level, language) {
  return resolveUiLanguage(language) === "ja" && level === "Core" ? uiText(language, "grammarLevelCore") : level;
}
function grammarDisplayName(hint, language) {
  const uiLanguage = resolveUiLanguage(language);
  const localized = hint.displayNames?.[uiLanguage];
  if (localized) return localized;
  if (uiLanguage !== "ja" || !ENGLISH_TEXT_RE.test(hint.name)) return hint.name;
  if (JAPANESE_TEXT_RE.test(hint.match)) return hint.match;
  return japaneseGrammarText(hint.name) || hint.name;
}
function japaneseGrammarText(value) {
  return (value.match(/[ぁ-んァ-ヶ一-龯々〆ヵヶー〜]+/gu) ?? []).join(" / ");
}
function interpolateUiText(language, key, values) {
  return uiText(language, key).replace(/\{(\w+)}/g, (_, name) => values[name] ?? "");
}
function renderGrammarHintExamples(examples, language, audioEnabled) {
  const visibleExamples = examples.slice(0, 2);
  if (!visibleExamples.length) return "";
  return `<div class="jpdb-reader-grammar-examples"><span>${escapeHtml(uiText(language, "grammarExample"))}</span>${visibleExamples.map((example) => renderGrammarExample(example, language, audioEnabled)).join("")}</div>`;
}
function renderGrammarExample(example, language, audioEnabled) {
  const japaneseUi = resolveUiLanguage(language) === "ja";
  const english = japaneseUi || !example.english ? "" : `<div>${escapeHtml(example.english)}</div>`;
  const note = japaneseUi || !example.note || ENGLISH_TEXT_RE.test(example.note) ? "" : `<div>${escapeHtml(example.note)}</div>`;
  return `<div class="jpdb-reader-grammar-example jpdb-reader-parseable">
        <div class="jpdb-reader-grammar-example-japanese">
            <span class="jpdb-reader-parseable">${escapeHtml(example.japanese)}</span>
            ${renderStudySentenceAudioButton(language, { audioEnabled, sentence: example.japanese })}
        </div>
        ${english}${note}
    </div>`;
}
function renderGrammarHintGuide(url, language) {
  return url ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, "grammarGuide"))}</a>` : "";
}
async function loadGrammarRuleData() {
  grammarRuleDataPromise ??= requestJson(EN_GRAMMAR_RULE_DATA_URL, {
  timeoutMs: GRAMMAR_RULE_DATA_TIMEOUT_MS,
  failureLabel: "English grammar rule data request",
  timeoutLabel: "Grammar rule data timed out."
  }).then(normalizeGrammarRuleData).catch(() => {
  grammarRuleDataPromise = void 0;
  return {};
  });
  return grammarRuleDataPromise;
}
function normalizeGrammarRuleData(value) {
  if (!isObjectRecord(value)) return {};
  const data = {};
  for (const [ruleId, item] of Object.entries(value)) {
  const normalized = normalizeGrammarRuleDataItem(item);
  if (normalized) data[ruleId] = normalized;
  }
  return data;
}
function normalizeGrammarRuleDataItem(item) {
  if (!isObjectRecord(item)) return void 0;
  const candidate = item;
  if (!hasRequiredGrammarRuleData(candidate)) return void 0;
  return {
  kind: candidate.kind,
  short: candidate.short,
  detail: candidate.detail,
  url: grammarRuleDataUrl(candidate.url),
  examples: normalizeGrammarExamples(candidate.examples)
  };
}
function hasRequiredGrammarRuleData(candidate) {
  return typeof candidate.kind === "string" && typeof candidate.short === "string" && typeof candidate.detail === "string";
}
function grammarRuleDataUrl(value) {
  return typeof value === "string" && value ? value : void 0;
}
function normalizeGrammarExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const candidate = item;
  if (typeof candidate.japanese !== "string" || typeof candidate.english !== "string") return [];
  return [{
    japanese: candidate.japanese,
    english: candidate.english,
    ...typeof candidate.note === "string" ? { note: candidate.note } : {}
  }];
  });
}
function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function requestJson(url, options = {}) {
  return requestJson$2(url, {
  timeoutMs: options.timeoutMs ?? TRANSLATION_TIMEOUT_MS,
  allowDirectCrossOrigin: true,
  allowConfiguredProxy: false,
  allowPublicProxies: false,
  preferFetch: true,
  failureLabel: options.failureLabel ?? "Translation request",
  timeoutLabel: options.timeoutLabel ?? "Translation timed out."
  });
}
const log$1 = Logger.scope("StudyRender");
async function renderStudyToolResult(button, action, sentence, grammarHints, language = "en", options = {}) {
  const panel = button.closest(".jpdb-reader-study-tools")?.querySelector("[data-study-panel]");
  if (!panel || !sentence) return;
  panel.hidden = false;
  panel.textContent = studyToolPendingText(action, language);
  const done = log$1.time("studyTool", { action, sentenceLength: sentence.length });
  if (action === "study-translate") {
  try {
    const translated = await translateJapaneseSentence$1(sentence, options.outputLanguage ?? "en");
    if (!translated) {
      panel.hidden = true;
      panel.textContent = "";
      return;
    }
    replaceStudyPanelHtml(panel, renderStudyMeaningBlock(translated, language));
    return;
  } catch (error) {
    log$1.warn("Study translation failed", { sentenceLength: sentence.length }, error);
    replaceStudyPanelHtml(panel, renderStudyEmpty(uiText(language, "translationUnavailable")));
    return;
  } finally {
    done();
  }
  }
  try {
  const hints = resolvedGrammarHints(sentence, grammarHints);
  if (!hints.length) {
    const availability = currentGrammarAvailability(language);
    panel.dataset.grammarAvailability = availability.state;
    replaceStudyPanelHtml(panel, renderGrammarAvailability(availability, language));
    return;
  }
  panel.dataset.grammarAvailability = "loaded";
  replaceStudyPanelHtml(panel, await renderGrammarHints$1(hints, sentence, void 0, language, { audioEnabled: options.audioEnabled }));
  } catch (error) {
  log$1.warn("Study grammar check failed", { sentenceLength: sentence.length }, error);
  const availability = currentGrammarAvailability(language, true);
  panel.dataset.grammarAvailability = availability.state;
  replaceStudyPanelHtml(panel, renderGrammarAvailability(availability, language));
  } finally {
  done();
  }
}
function studyToolPendingText(action, language) {
  return action === "study-translate" ? uiText(language, "translating") : uiText(language, "findingGrammar");
}
function resolvedGrammarHints(sentence, grammarHints) {
  return grammarHints ?? detectGrammarHints$1(sentence);
}
function handleStudyGrammarAction(button, sentence, language = "en", options = {}) {
  if (!sentence) return false;
  if (button.dataset.action === "study-grammar-toggle-known") {
  const ruleId = button.dataset.grammarRuleId;
  if (!ruleId) return false;
  setGrammarRuleKnown(ruleId, button.dataset.grammarKnown !== "true");
  void rerenderGrammarPanel(button, sentence, language, options);
  return true;
  }
  if (button.dataset.action === "study-grammar-toggle-known-visibility") {
  setKnownGrammarVisible(button.getAttribute("aria-pressed") !== "true");
  void rerenderGrammarPanel(button, sentence, language, options);
  return true;
  }
  return false;
}
async function rerenderGrammarPanel(button, sentence, language, options) {
  const panel = button.closest(".jpdb-reader-study-panel");
  if (!panel) return;
  const hints = detectGrammarHints$1(sentence);
  replaceStudyPanelHtml(panel, await renderGrammarHints$1(hints, sentence, void 0, language, { audioEnabled: options.audioEnabled }));
}
function replaceStudyPanelHtml(panel, html) {
  const scrollFrame = capturePopoverScrollFrame(panel);
  setInnerHtml(panel, html);
  restorePopoverScrollFrameSoon(scrollFrame);
}
const MINING_ACTIONS_CLASS = "jpdb-reader-actions";
const MINING_COLLAPSED_CLASS = "jpdb-reader-actions-mining-collapsed";
const DECK_PICKER_OPEN_CLASS = "jpdb-reader-add-deck-select-open";
const DECK_PICKER_WRAPPER_OPEN_CLASS = "jpdb-reader-deck-picker-open";
const DECK_PICKER_BLUR_DELAY_MS = 180;
function toggleMiningControls(button, label) {
  const actions = button.closest(`.${MINING_ACTIONS_CLASS}`);
  if (!actions) return;
  setMiningControlsExpanded(button, actions.classList.contains(MINING_COLLAPSED_CLASS), label);
}
function setMiningControlsExpanded(button, expanded, label) {
  const actions = button.closest(`.${MINING_ACTIONS_CLASS}`);
  if (!actions) return;
  actions.classList.toggle(MINING_COLLAPSED_CLASS, !expanded);
  button.setAttribute("aria-expanded", String(expanded));
  const text2 = label(expanded);
  button.setAttribute("aria-label", text2);
  button.title = text2;
}
function openDeckPickerForCardAdd(button, card, sentence, performAction) {
  const picker = deckPickerForButton(button);
  if (!picker) return false;
  const wrapper = picker.closest(".jpdb-reader-mining-details");
  const toggle = wrapper?.querySelector(".jpdb-reader-mining-title");
  if (picker.classList.contains(DECK_PICKER_OPEN_CLASS)) {
  picker.hidden = false;
  picker.focus();
  return true;
  }
  const controller = new AbortController();
  const cleanup = () => closeDeckPicker(picker, wrapper, toggle, controller);
  picker.addEventListener("change", () => {
  const option = picker.selectedOptions[0];
  const deckId = option?.dataset.deckId?.trim();
  if (!deckId) {
    cleanup();
    return;
  }
  performDeckPickerCardAction(button, card, sentence, option, cleanup, performAction);
  }, { signal: controller.signal });
  picker.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (document.activeElement !== picker) cleanup();
  }, DECK_PICKER_BLUR_DELAY_MS);
  }, { once: true, signal: controller.signal });
  showDeckPicker(picker, wrapper, toggle);
  return true;
}
function deckPickerForButton(button) {
  return button.closest(".jpdb-reader-mining-details")?.querySelector("[data-add-deck-select]") ?? null;
}
function performDeckPickerCardAction(button, card, sentence, option, cleanup, performAction) {
  button.dataset.deckSource = selectedDeckSource(option.dataset.deckSource);
  button.dataset.deckId = option.dataset.deckId?.trim() ?? "";
  const originalAction = button.dataset.action;
  button.dataset.action = "add";
  cleanup();
  void Promise.resolve(performAction(button, card, sentence)).finally(() => {
  if (originalAction) button.dataset.action = originalAction;
  else delete button.dataset.action;
  delete button.dataset.deckSource;
  delete button.dataset.deckId;
  });
}
function selectedDeckSource(value) {
  if (value === "anki" || value === "jiten" || value === "bunpro" || value === "yomu-local") return value;
  return "jpdb";
}
function closeDeckPicker(picker, wrapper, toggle, controller) {
  controller.abort();
  picker.classList.remove(DECK_PICKER_OPEN_CLASS);
  picker.hidden = true;
  wrapper?.classList.remove(DECK_PICKER_WRAPPER_OPEN_CLASS);
  toggle?.setAttribute("aria-expanded", "false");
  picker.selectedIndex = 0;
}
function showDeckPicker(picker, wrapper, toggle) {
  picker.hidden = false;
  picker.classList.add(DECK_PICKER_OPEN_CLASS);
  wrapper?.classList.add(DECK_PICKER_WRAPPER_OPEN_CLASS);
  toggle?.setAttribute("aria-expanded", "true");
  picker.focus();
  tryShowNativePicker(picker);
}
function tryShowNativePicker(picker) {
  const showPicker = picker.showPicker;
  if (!showPicker) return;
  try {
  showPicker.call(picker);
  } catch {
  }
}
function updateKanjiMiningControlsMount(popover, controls, setMiningControlsExpanded2) {
  const actions = popover.querySelector("[data-kanji-actions]");
  const miningMount = popover.querySelector("[data-kanji-mining-mount]");
  if (!actions || !miningMount) return;
  const hasControls = Boolean(controls);
  const hasReview = actions.dataset.kanjiHasReview === "true";
  actions.hidden = !hasControls && !hasReview;
  actions.classList.toggle("jpdb-reader-actions-has-mining", hasControls);
  actions.classList.toggle("jpdb-reader-actions-mining-collapsed", hasControls);
  const gutter = actions.querySelector(".jpdb-reader-actions-gutter");
  if (gutter) gutter.hidden = !hasControls;
  const collapseButton = actions.querySelector('[data-action="mining-collapse"]');
  if (collapseButton) {
  if (hasControls) setMiningControlsExpanded2(collapseButton, false);
  else collapseButton.setAttribute("aria-expanded", "true");
  }
  miningMount.hidden = !hasControls;
  setInnerHtml(miningMount, controls);
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
function definitionSourceStateKey(sourceId) {
  return `definition-source:${sourceId}`;
}
function kanjiSourceStateKey(sourceId) {
  return `kanji:${sourceId}`;
}
function detectGrammarHints(sentence) {
  return yomuKanjiStudyCompanion()?.detectGrammarHints?.(sentence) ?? [];
}
function preloadGrammarResources(sentence, language = "en") {
  return yomuKanjiStudyCompanion()?.preloadGrammarResources?.(sentence, language) ?? [];
}
function preloadJapaneseSentenceTranslation(sentence, language = "en") {
  yomuKanjiStudyCompanion()?.preloadJapaneseSentenceTranslation?.(sentence, language);
}
async function translateJapaneseSentence(sentence, language = "en") {
  return await (yomuKanjiStudyCompanion()?.translateJapaneseSentence?.(sentence, language) ?? Promise.resolve(""));
}
async function renderGrammarHints(hints, sentence, preferences, language = "en", options = {}) {
  return await (yomuKanjiStudyCompanion()?.renderGrammarHints?.(hints, sentence, preferences, language, options) ?? Promise.resolve(""));
}
const log = Logger.scope("StudySources");
const STUDY_GRAMMAR_CACHE_LIMIT = 160;
const STUDY_TRANSLATION_CACHE_LIMIT = 80;
class StudySourceController {
  constructor(dependencies) {
  this.dependencies = dependencies;
  }
  grammarHintCache = /* @__PURE__ */ new Map();
  translationContentCache = /* @__PURE__ */ new Map();
  renderTranslationSource(sentence) {
  const settings = this.settings();
  if (!sentence || !settings.studyTranslationEnabled) return "";
  const title = definitionSourceLabel(settings, STUDY_TRANSLATION_SOURCE_ID, uiText(settings.interfaceLanguage, "translation"));
  return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-translation ${this.sourceAttributes(STUDY_TRANSLATION_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
                ${this.renderTranslationPanel(sentence)}
            </details>
        `;
  }
  renderGrammarSource(sentence) {
  const settings = this.settings();
  if (!sentence || !settings.studyGrammarEnabled) return "";
  const title = definitionSourceLabel(settings, STUDY_GRAMMAR_SOURCE_ID, uiText(settings.interfaceLanguage, "grammar"));
  return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-grammar data-availability="pending" ${this.sourceAttributes(STUDY_GRAMMAR_SOURCE_ID)}>
                <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
                ${this.renderGrammarPanel()}
            </details>
        `;
  }
  installLoaders(popover, sentence) {
  this.preloadStudySources(popover, sentence);
  this.installTranslationLoader(popover, sentence);
  this.installGrammarLoader(popover, sentence);
  }
  async detectGrammarHints(sentence) {
  return detectGrammarHints(sentence);
  }
  preloadStudySources(popover, sentence) {
  if (!sentence) return;
  const settings = this.settings();
  const grammar = popover.querySelector("[data-study-grammar]");
  if (settings.studyGrammarEnabled && grammar) {
    void this.cachedGrammarHints(sentence).catch(() => void 0);
    preloadGrammarResources(sentence, settings.interfaceLanguage);
  }
  const translation = popover.querySelector("[data-study-translation]");
  if (settings.studyTranslationEnabled && translation) {
    preloadJapaneseSentenceTranslation(sentence, outputLanguageOf(settings));
    void this.cachedTranslationContent(sentence).then((result) => {
      if (!result.translated && translation.isConnected && this.dependencies.isCurrentPopoverRoot(popover)) translation.hidden = true;
    }).catch(() => void 0);
  }
  }
  renderTranslationPanel(sentence) {
  const settings = this.settings();
  const language = settings.interfaceLanguage;
  return `
            <div class="jpdb-reader-study-panel jpdb-reader-study-translation-panel">
                ${renderStudySentenceBlock(sentence, language, { audioEnabled: settings.audioEnabled })}
                ${renderStudyMeaningBlock(uiText(language, "openSectionToTranslate"), language, "data-study-translation-result")}
            </div>
        `;
  }
  renderGrammarPanel() {
  const language = this.settings().interfaceLanguage;
  return `
            <div class="jpdb-reader-study-panel" data-study-grammar-panel>
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, "findingGrammar"))}</div>
            </div>
        `;
  }
  installGrammarLoader(popover, sentence) {
  this.installLazyStudyLoader(popover, sentence, "[data-study-grammar]", (container) => this.loadGrammar(popover, sentence, container));
  }
  async loadGrammar(popover, sentence, container) {
  const panel = container.querySelector("[data-study-grammar-panel]");
  if (!panel) return;
  try {
    const hints = await this.cachedGrammarHints(sentence);
    if (!this.canRenderGrammar(popover, container)) return;
    const settings = this.settings();
    if (!hints.length) {
      const availability = currentGrammarAvailability(settings.interfaceLanguage);
      container.dataset.availability = availability.state;
      setInnerHtml(panel, renderGrammarAvailability(availability, settings.interfaceLanguage));
      return;
    }
    container.dataset.availability = "loaded";
    setInnerHtml(panel, await renderGrammarHints(hints, sentence, void 0, settings.interfaceLanguage, { audioEnabled: settings.audioEnabled }));
    delete popover.dataset.jpdbReaderParseKey;
    delete popover.dataset.jpdbReaderParseLoadingKey;
    void this.dependencies.parsePopoverJapanese(popover);
  } catch (error) {
    log.warn("Automatic grammar lookup failed", { sentenceLength: sentence.length }, error);
    if (!this.canRenderGrammar(popover, container)) return;
    const language = this.settings().interfaceLanguage;
    const availability = currentGrammarAvailability(language, true);
    container.dataset.availability = availability.state;
    setInnerHtml(panel, renderGrammarAvailability(availability, language));
  }
  }
  canRenderGrammar(popover, container) {
  return this.dependencies.isCurrentPopoverRoot(popover) && container.isConnected;
  }
  installTranslationLoader(popover, sentence) {
  this.installLazyStudyLoader(popover, sentence, "[data-study-translation]", (container) => {
    const result = container.querySelector("[data-study-translation-result]");
    if (result) result.textContent = uiText(this.settings().interfaceLanguage, "translating");
    return this.loadTranslation(popover, sentence, container);
  });
  }
  installLazyStudyLoader(popover, sentence, selector, loadContainer) {
  const containers = Array.from(popover.querySelectorAll(selector));
  if (!containers.length || !sentence) return;
  for (const container of containers) {
    const load = () => {
      if (!isStudyDetailsOpen(container) || container.dataset.loaded === "true" || container.dataset.loading === "true") return;
      container.dataset.loading = "true";
      void loadContainer(container).finally(() => {
        if (!container.isConnected) return;
        delete container.dataset.loading;
        container.dataset.loaded = "true";
      });
    };
    container.addEventListener("toggle", load);
    container.parentElement?.closest("details")?.addEventListener("toggle", load);
    load();
  }
  }
  async loadTranslation(popover, sentence, container) {
  if (!sentence) return;
  try {
    const translation = await this.cachedTranslationContent(sentence);
    if (!this.canApplyTranslation(popover, container)) return;
    this.applyTranslation(popover, sentence, container, translation);
  } catch (error) {
    this.renderTranslationError(sentence, container, error);
  }
  }
  canApplyTranslation(popover, container) {
  return this.dependencies.isCurrentPopoverRoot(popover) && container.isConnected;
  }
  async loadTranslationContent(sentence) {
  const translated = await translateJapaneseSentence(sentence, outputLanguageOf(this.settings()));
  const tokens = translated ? this.parseTranslationTokens(sentence) : Promise.resolve([]);
  return { tokens, translated };
  }
  parseTranslationTokens(sentence) {
  return this.dependencies.parseJapanese([sentence], { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true }).then(([parsed]) => parsed ?? []).catch(() => []);
  }
  cachedGrammarHints(sentence) {
  const key = this.studyCacheKey(sentence);
  const cached = this.grammarHintCache.get(key);
  if (cached) return cached;
  const promise = Promise.resolve(detectGrammarHints(sentence));
  this.grammarHintCache.set(key, promise);
  pruneOldestCacheEntries(this.grammarHintCache, STUDY_GRAMMAR_CACHE_LIMIT);
  return promise;
  }
  cachedTranslationContent(sentence) {
  const key = this.studyCacheKey(sentence);
  const cached = this.translationContentCache.get(key);
  if (cached) return cached;
  const promise = this.loadTranslationContent(sentence).catch((error) => {
    if (this.translationContentCache.get(key) === promise) this.translationContentCache.delete(key);
    throw error;
  });
  this.translationContentCache.set(key, promise);
  pruneOldestCacheEntries(this.translationContentCache, STUDY_TRANSLATION_CACHE_LIMIT);
  return promise;
  }
  studyCacheKey(sentence) {
  return `${activeLearningTarget().id}${this.settings().interfaceLanguage}${outputLanguageOf(this.settings())}${sentence.trim()}`;
  }
  applyTranslation(popover, sentence, container, translation) {
  if (!translation.translated) {
    container.hidden = true;
    return;
  }
  const result = container.querySelector("[data-study-translation-result]");
  if (result) result.textContent = translation.translated;
  void translation.tokens.then((tokens) => {
    if (!this.canApplyTranslation(popover, container)) return;
    const original = container.querySelector("[data-study-original-render]");
    if (original) setInnerHtml(original, renderTokensToHtml(sentence, tokens, this.settings()));
    void this.dependencies.parsePopoverJapanese(popover);
    void this.dependencies.enrichPitchWords(tokens);
    void this.dependencies.enrichAnkiWords(tokens, [container]);
  }).catch(() => void 0);
  }
  renderTranslationError(sentence, container, error) {
  log.warn("Automatic sentence translation failed", { sentenceLength: sentence.length }, error);
  if (!container.isConnected) return;
  const result = container.querySelector("[data-study-translation-result]");
  if (result) result.textContent = uiText(this.settings().interfaceLanguage, "translationUnavailable");
  }
  sourceAttributes(sourceId) {
  return this.dependencies.dictionarySourceAttributes(definitionSourceStateKey(sourceId));
  }
  settings() {
  return this.dependencies.getSettings();
  }
}
function isStudyDetailsOpen(container) {
  if (!container.open) return false;
  let ancestor = container.parentElement?.closest("details");
  while (ancestor) {
  if (!ancestor.open) return false;
  ancestor = ancestor.parentElement?.closest("details");
  }
  return true;
}
const JITEN_KANJI_WORD_PAGE_SIZE = 9;
const CARD_STATES = /* @__PURE__ */ new Set([
  "not-in-deck",
  "new",
  "learning",
  "young",
  "known",
  "mature",
  "due",
  "failed",
  "blacklisted",
  "never-forget",
  "redundant",
  "suspended",
  "locked",
  "frequent",
  "mastered",
  "in-deck",
  "unparsed"
]);
const JITEN_KNOWN_STATE_MAP = /* @__PURE__ */ new Map([
  [0, "new"],
  [1, "young"],
  [2, "mature"],
  [3, "blacklisted"],
  [4, "due"],
  [5, "mastered"],
  [6, "redundant"]
]);
function renderJitenKanjiInfo(info, language, initiallyExpanded = true, sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID), title = "Jiten kanji facts") {
  if (!info) return "";
  return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji jpdb-reader-jiten-kanji" data-source="jiten-kanji" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-local-entry">
                ${renderJitenKanjiFacts(info, language)}
                ${renderJitenKanjiReadings(info, language)}
                ${renderJitenKanjiVocabulary(info, language)}
            </div>
        </details>
    `;
}
function renderJitenKanjiWordsPage(page, reading = "", language = "en") {
  return page ? renderJitenKanjiVocabularyWords(
  jitenVocabularyFromWordSummaries((page.items ?? []).map((word) => ({ word, kanjiReading: reading }))),
  language
  ) : "";
}
function renderJitenKanjiWordsMoreButton(character, reading, renderedCount, total, nextPage, language) {
  if (total <= renderedCount) return "";
  return renderJitenKanjiMoreButtonAttributes(character, reading, nextPage, JITEN_KANJI_WORD_PAGE_SIZE, total, total - renderedCount, language);
}
function jitenKanjiWordsPageSize() {
  return JITEN_KANJI_WORD_PAGE_SIZE;
}
function jitenKanjiWordSummaries(info) {
  return [
  ...(info.topWords ?? []).map((word) => ({ word, kanjiReading: "" })),
  ...(info.wordsByReading ?? []).flatMap((group) => (group.words ?? []).map((word) => ({ word, kanjiReading: group.reading })))
  ];
}
function jitenVocabularyFromWordSummaries(sources) {
  const seen = /* @__PURE__ */ new Set();
  return sources.filter((source) => {
  const key = `${source.word.wordId}:${source.word.readingIndex}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
  }).map(({ word, kanjiReading }) => ({
  expression: cleanJitenWordSurface(word),
  reading: jitenAnnotatedKana(word.readingFurigana) || cleanJitenAnnotatedText(word.reading),
  meaning: word.mainDefinition,
  url: `https://jiten.moe/vocabulary/${encodeURIComponent(String(word.wordId))}/${encodeURIComponent(String(word.readingIndex))}`,
  termHtml: renderJitenAnnotatedReading(word.readingFurigana || word.reading),
  frequencyRank: word.frequencyRank,
  wordId: word.wordId,
  readingIndex: word.readingIndex,
  kanjiReading,
  states: jitenWordStates(word),
  pitchAccents: jitenWordPitchAccents(word)
  }));
}
function jitenKanjiKeyword(info) {
  return info?.meanings?.[0] ?? "";
}
function renderJitenKanjiKeywordLine(info, rtkInfo, entries2, language = "en", sourceInfo = null) {
  return renderKanjiKeywordChips([
  { text: jitenKanjiKeyword(info), label: "Jiten", canonical: true },
  { text: rtkInfo?.keyword, label: "RTK" },
  { text: sourceInfo?.kanjiAliveKeyword, label: "Kanji Alive" },
  ...entries2.flatMap((entry) => entry.meanings).filter(Boolean).slice(0, 3).map((meaning) => ({ text: meaning, label: uiText(language, "dict") }))
  ], language);
}
function jitenKanjiFactRows(info, language) {
  if (!info) return [];
  return [
  fact(uiText(language, "factMeaning"), (info.meanings ?? []).join(", ")),
  fact(uiText(language, "factFrequency"), info.frequencyRank ? `Jiten #${info.frequencyRank}` : ""),
  fact("JLPT", info.jlptLevel ? `Jiten N${info.jlptLevel}` : ""),
  fact(uiText(language, "factGrade"), info.grade ? `Jiten ${gradeLabel(info.grade, language)}` : ""),
  fact(uiText(language, "strokes"), info.strokeCount ? `Jiten ${info.strokeCount}` : ""),
  ...jitenKanjiGroupingFactRows(info)
  ].filter((item) => Boolean(item));
}
function jitenKanjiOriginFactLabels(info, language) {
  if (!info) return [];
  const labels = /* @__PURE__ */ new Set();
  const add = (...values) => values.filter(Boolean).forEach((value) => labels.add(value));
  if (info.meanings?.length) add("Meaning", uiText(language, "factMeaning"));
  if (info.frequencyRank) add("Frequency", uiText(language, "factFrequency"));
  if (info.jlptLevel) add("JLPT");
  if (info.grade) add("Grade", uiText(language, "factGrade"));
  if (info.strokeCount) add("Strokes", uiText(language, "strokes"));
  if (info.groupingTags?.kanken) add("Kanken");
  return Array.from(labels);
}
function jitenKanjiGroupingFactRows(info) {
  const tags = info.groupingTags;
  if (!tags) return [];
  return [
  fact("Kanken", tags.kanken ?? ""),
  fact("WK", tags.wanikani ?? ""),
  fact("RTK", tags.rtk ?? ""),
  fact("KLC", tags.klc ?? ""),
  fact("TMW", tags.tmw ?? "")
  ];
}
function gradeLabel(grade, language) {
  return language === "ja" ? `${grade}年` : `Grade ${grade}`;
}
function jitenKanjiReadingRows(info) {
  if (!info) return [];
  const wordsByReading = info.wordsByReading ?? [];
  const groupedTotal = wordsByReading.reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
  const groupedReadings = wordsByReading.slice().sort((a, b) => b.totalWords - a.totalWords).map((group) => {
  const percent = groupedTotal ? ` ${Math.round(group.totalWords / groupedTotal * 100)}%` : "";
  return `${group.reading}${percent}`;
  });
  return groupedReadings.length ? groupedReadings.slice(0, 10) : [
  ...(info.kunReadings ?? []).map((reading) => `${reading} kun`),
  ...(info.onReadings ?? []).map((reading) => `${reading} on`)
  ].slice(0, 10);
}
function renderJitenKanjiFacts(info, language) {
  const facts = jitenKanjiFactRows(info, language);
  return facts.length ? `<div class="jpdb-reader-kanji-facts">
        ${facts.map(([label, value]) => `<span title="${escapeHtml(`Jiten · ${label}: ${value}`)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(value)}</span></span>`).join("")}
    </div>` : "";
}
function renderJitenKanjiReadings(info, language) {
  const groupedReadings = jitenKanjiGroupedReadingRows(info);
  if (groupedReadings.length) {
  return `<div class="jpdb-reader-kanji-readings jpdb-reader-jiten-kanji-reading-filter" role="list" aria-label="${escapeHtml(uiText(language, "reading"))}">
            ${groupedReadings.map((reading) => `<button type="button" data-action="jiten-kanji-reading" data-jiten-kanji-character="${escapeHtml(info.character)}" data-jiten-kanji-reading="${escapeHtml(reading.reading)}" role="listitem" aria-pressed="false"><span>${escapeHtml(reading.reading)}</span><small>${escapeHtml(reading.share)}</small></button>`).join("")}
        </div>`;
  }
  const readings2 = jitenKanjiReadingRows(info).filter(Boolean);
  return readings2.length ? `<div class="jpdb-reader-kanji-readings">
        ${readings2.slice(0, 12).map((reading) => `<span>${escapeHtml(reading)}</span>`).join("")}
    </div>` : "";
}
function jitenKanjiGroupedReadingRows(info) {
  const wordsByReading = info.wordsByReading ?? [];
  const groupedTotal = wordsByReading.reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
  if (!groupedTotal) return [];
  return wordsByReading.slice().sort((a, b) => b.totalWords - a.totalWords).slice(0, 10).map((group) => ({ reading: group.reading, share: `${Math.round(group.totalWords / groupedTotal * 100)}%` }));
}
function renderJitenKanjiVocabulary(info, language) {
  const words = jitenVocabularyFromWordSummaries(jitenKanjiWordSummaries(info));
  if (!words.length) return "";
  const firstWords = words.slice(0, JITEN_KANJI_WORD_PAGE_SIZE);
  return `<div class="jpdb-reader-similar-grid jpdb-reader-jiten-kanji-vocabulary" role="list">
        ${renderJitenKanjiVocabularyWords(firstWords, language)}
        ${renderJitenKanjiMoreButton(info, firstWords.length, language)}
    </div>`;
}
function renderJitenKanjiVocabularyWords(words, language) {
  return words.map((word) => renderJitenKanjiVocabularyWord(word, language)).join("");
}
function renderJitenKanjiVocabularyWord(word, language) {
  const key = `${word.expression}:${word.reading}`;
  const meta = renderJitenKanjiWordMeta(word, language);
  return `<button class="jpdb-reader-similar-word jpdb-reader-jiten-kanji-word" type="button" data-action="similar-word" data-expression="${escapeHtml(word.expression)}" data-reading="${escapeHtml(word.reading)}" data-jiten-kanji-word-key="${escapeHtml(key)}" data-jiten-kanji-reading="${escapeHtml(word.kanjiReading)}" title="${escapeHtml(jitenKanjiWordTitle(word))}" aria-label="${escapeHtml(jitenKanjiWordAriaLabel(word))}" role="listitem">
        <span class="jpdb-reader-similar-word-head jpdb-reader-jiten-kanji-word-main">
            <span class="jpdb-reader-jiten-kanji-word-term">${word.termHtml || escapeHtml(word.expression)}</span>
            ${meta}
        </span>
        ${word.meaning ? `<small class="jpdb-reader-similar-meaning">${escapeHtml(word.meaning)}</small>` : ""}
    </button>`;
}
function renderJitenKanjiWordMeta(word, language) {
  const state = primaryJitenWordState(word.states);
  const items = [
  state ? `<span class="jpdb-reader-jiten-kanji-word-status" title="${escapeHtml(`Jiten · ${cardStateLabel(state, language)}`)}"><span class="jpdb-reader-state-dot jiten-${escapeHtml(state)}"></span>${escapeHtml(cardStateLabel(state, language))}</span>` : "",
  word.pitchAccents.length ? `<span class="jpdb-reader-jiten-kanji-word-pitch" title="${escapeHtml(`Pitch accent: ${word.pitchAccents.join(", ")}`)}">P${escapeHtml(word.pitchAccents.join("/"))}</span>` : "",
  word.frequencyRank ? `<em>#${escapeHtml(String(word.frequencyRank))}</em>` : ""
  ].filter(Boolean).join("");
  return items ? `<span class="jpdb-reader-jiten-kanji-word-meta">${items}</span>` : "";
}
function primaryJitenWordState(states) {
  return states.find((state) => state !== "not-in-deck" && state !== "in-deck") ?? states[0] ?? null;
}
function jitenKanjiWordTitle(word) {
  return [word.expression, word.reading && word.reading !== word.expression ? word.reading : "", word.meaning].filter(Boolean).join(" · ");
}
function jitenKanjiWordAriaLabel(word) {
  return [word.expression, word.reading && word.reading !== word.expression ? word.reading : "", word.meaning, word.frequencyRank ? `frequency ${word.frequencyRank}` : ""].filter(Boolean).join(", ");
}
function renderJitenKanjiMoreButton(info, renderedCount, language) {
  const total = jitenKanjiWordsTotal(info);
  if (total <= renderedCount) return "";
  const remaining = total - renderedCount;
  const reading = jitenKanjiMoreReading(info);
  return renderJitenKanjiMoreButtonAttributes(info.character, reading, 2, JITEN_KANJI_WORD_PAGE_SIZE, total, remaining, language);
}
function renderJitenKanjiMoreButtonAttributes(character, reading, page, pageSize, total, remaining, language) {
  return `<button class="jpdb-reader-btn jpdb-reader-jiten-kanji-more" type="button" data-action="jiten-kanji-more" data-jiten-kanji-character="${escapeHtml(character)}" data-jiten-kanji-reading="${escapeHtml(reading)}" data-jiten-kanji-page="${page}" data-jiten-kanji-page-size="${pageSize}" data-jiten-kanji-total="${total}">
        ${escapeHtml(uiText(language, "more"))} <span class="jpdb-reader-source-status">${remaining}</span>
    </button>`;
}
function jitenKanjiWordsTotal(info) {
  const groupedTotal = (info.wordsByReading ?? []).reduce((sum, group) => sum + Math.max(0, group.totalWords), 0);
  return Math.max(jitenVocabularyFromWordSummaries(jitenKanjiWordSummaries(info)).length, groupedTotal);
}
function jitenKanjiMoreReading(info) {
  const groups = (info.wordsByReading ?? []).filter((group) => group.reading && group.totalWords > (group.words ?? []).length);
  return groups.length === 1 ? groups[0]?.reading ?? "" : "";
}
function sourceStateAttribute(sourceStateKey, initiallyExpanded) {
  return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? "open" : ""}`;
}
function cleanJitenWordSurface(word) {
  return cleanJitenAnnotatedText(word.matchSurface || word.readingFurigana || word.reading);
}
function cleanJitenAnnotatedText(value) {
  return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, "$1").trim();
}
function jitenAnnotatedKana(value) {
  return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, "$2").trim();
}
function renderJitenAnnotatedReading(value) {
  const source = value.trim();
  if (!source) return "";
  let html = "";
  let offset = 0;
  const regex = /([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
  html += escapeHtml(source.slice(offset, match.index));
  html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? "")}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? "")}</rt><rp>)</rp></ruby>`;
  offset = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(offset));
  return html;
}
function fact(label, value) {
  return value.trim() ? [label, value.trim()] : null;
}
function jitenWordStates(word) {
  const source = word;
  const rawStates = Array.isArray(source.knownStates) ? source.knownStates : Array.isArray(source.knownState) ? source.knownState : Array.isArray(source.cardState) ? source.cardState : [];
  return rawStates.map((state) => typeof state === "number" ? JITEN_KNOWN_STATE_MAP.get(state) : state).filter((state) => typeof state === "string" && CARD_STATES.has(state));
}
function jitenWordPitchAccents(word) {
  const source = word;
  const rawPitch = Array.isArray(source.pitchAccents) ? source.pitchAccents : Array.isArray(source.pitchAccent) ? source.pitchAccent : [];
  return rawPitch.filter((pitch) => Number.isInteger(pitch) && pitch >= 0).slice(0, 3);
}
function targetSupportsCharacterLookup() {
  return activeLearningTarget().capabilities["character-lookup"];
}
function usesJapaneseProviders() {
  return activeLearningTarget().language === "ja";
}
function targetCanLookupCharacter(value) {
  return targetSupportsCharacterLookup() && isUnifiedIdeograph(value);
}
async function filterJitenKanjiWords(button, context) {
  if (button.disabled) return;
  const character = button.dataset.jitenKanjiCharacter?.trim() ?? "";
  const reading = button.dataset.jitenKanjiReading?.trim() ?? "";
  const source = button.closest(".jpdb-reader-jiten-kanji");
  const grid = source?.querySelector(".jpdb-reader-jiten-kanji-vocabulary");
  if (!usesJapaneseProviders() || !targetCanLookupCharacter(character) || !reading || !source || !grid) return;
  source.querySelectorAll('[data-action="jiten-kanji-reading"]').forEach((candidate) => {
  candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
  });
  button.disabled = true;
  try {
  const wordsPage = await context.lookupKanjiWords(character, { reading, page: 1, pageSize: jitenKanjiWordsPageSize() });
  if (!usesJapaneseProviders() || !targetCanLookupCharacter(character) || !source.isConnected || !grid.isConnected) return;
  const wordsHtml = renderJitenKanjiWordsPage(wordsPage, reading);
  const rendered = wordsPage?.items.length ?? 0;
  const total = wordsPage?.total ?? rendered;
  const moreHtml = renderJitenKanjiWordsMoreButton(character, reading, rendered, total, 2, context.language());
  setInnerHtml(grid, wordsHtml || moreHtml ? `${wordsHtml}${moreHtml}` : `<div class="jpdb-reader-help">${escapeHtml(uiText(context.language(), "noSimilarWords"))}</div>`);
  context.afterRender?.();
  } catch (error) {
  context.onError?.({ character, reading }, error);
  } finally {
  if (button.isConnected) button.disabled = false;
  }
}
async function loadMoreJitenKanjiWords(button, context) {
  if (button.disabled) return;
  const character = button.dataset.jitenKanjiCharacter?.trim() ?? "";
  if (!usesJapaneseProviders() || !targetCanLookupCharacter(character)) return;
  const page = Math.max(2, Number(button.dataset.jitenKanjiPage) || 2);
  const pageSize = Math.max(1, Number(button.dataset.jitenKanjiPageSize) || jitenKanjiWordsPageSize());
  button.disabled = true;
  try {
  const wordsPage = await context.lookupKanjiWords(character, {
    reading: button.dataset.jitenKanjiReading || void 0,
    page,
    pageSize
  });
  if (!usesJapaneseProviders() || !targetCanLookupCharacter(character) || !button.isConnected) return;
  appendJitenKanjiWords(button, wordsPage, page, context);
  } catch (error) {
  context.onError?.({ character, page }, error);
  } finally {
  if (button.isConnected) button.disabled = false;
  }
}
function appendJitenKanjiWords(button, page, requestedPage, context) {
  const html = renderJitenKanjiWordsPage(page, button.dataset.jitenKanjiReading || "");
  const grid = button.closest(".jpdb-reader-jiten-kanji-vocabulary");
  if (!html || !grid) {
  button.remove();
  return;
  }
  const template = document.createElement("template");
  setInnerHtml(template, html);
  button.before(template.content);
  removeDuplicateJitenKanjiWords(grid);
  const total = page?.total || Number(button.dataset.jitenKanjiTotal) || 0;
  const rendered = grid.querySelectorAll("[data-jiten-kanji-word-key]").length;
  if (!page?.items.length || total > 0 && rendered >= total) {
  button.remove();
  } else {
  button.dataset.jitenKanjiPage = String(requestedPage + 1);
  button.dataset.jitenKanjiTotal = String(total);
  const status = button.querySelector(".jpdb-reader-source-status");
  if (status) status.textContent = String(Math.max(0, total - rendered));
  button.disabled = false;
  }
  context.afterRender?.();
}
function removeDuplicateJitenKanjiWords(grid) {
  const seen = /* @__PURE__ */ new Set();
  grid.querySelectorAll("[data-jiten-kanji-word-key]").forEach((word) => {
  const key = word.dataset.jitenKanjiWordKey ?? "";
  if (!key || !seen.has(key)) {
    if (key) seen.add(key);
    return;
  }
  word.remove();
  });
}
registerYomuCompanion("kanjiStudy", {
  ImmersionKitClient,
  ImmersionPopoverController,
  KanjiOriginClient,
  KanjiVGClient,
  RtkClient,
  JpdbKanjiClient,
  renderKanjiOriginGraph,
  renderJpdbKanjiInfo,
  renderJpdbKanjiMiningControls,
  renderKanjiPractice,
  installKanjiPracticeDoodle,
  renderKanjiOrigins,
  buildRtkComponentSummaries,
  renderKanjiKeywordLine,
  renderRtkInfo,
  installOriginGraphInteractions,
  buildKanjiFacts,
  buildKanjiOriginGraph,
  installUchisenCarousel,
  loadUchisenData,
  resetGrammarRuleDataCacheForTests,
  listLocalGrammarRuleExamples,
  listLocalGrammarRules,
  detectGrammarHints: detectGrammarHints$1,
  preloadGrammarResources: preloadGrammarResources$1,
  preloadJapaneseSentenceTranslation: preloadJapaneseSentenceTranslation$1,
  setGrammarRuleKnown,
  setKnownGrammarVisible,
  translateJapaneseSentence: translateJapaneseSentence$1,
  renderGrammarHints: renderGrammarHints$1,
  renderStudyToolResult,
  handleStudyGrammarAction,
  toggleMiningControls,
  setMiningControlsExpanded,
  openDeckPickerForCardAdd,
  updateKanjiMiningControlsMount,
  normalizeMiningSentence,
  inferMiningSourceKind,
  createFallbackMiningContext,
  resolveMiningContext,
  saveMiningContext,
  loadMiningContext,
  immersionContextFromExample,
  immersionContextFromElement,
  pageMiningContext,
  contextLabel,
  StudySourceController,
  renderJitenKanjiInfo,
  renderJitenKanjiKeywordLine,
  jitenKanjiOriginFactLabels,
  filterJitenKanjiWords,
  loadMoreJitenKanjiWords
});
})();
